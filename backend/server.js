'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const { openDatabase } = require('./db_adapter.js');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 5000;
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
// On serverless, store in os.tmpdir() so warm instances reuse the SQLite file.
const DB_PATH = process.env.RECLAIM_DB || (IS_SERVERLESS ? path.join(os.tmpdir(), 'reclaim.db') : path.join(__dirname, 'reclaim.db'));
const SCHEMA_VERSION = 2;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const JWT_SECRET = process.env.SESSION_SECRET || 'reclaim-secure-session-secret-2026-safe-key';
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_PHOTO_KB = 3072; // 3 MB limit for item photos
const MAX_THUMB_KB = 40;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const CATEGORIES = ['Electronics', 'ID & Cards', 'Bottles & Accessories', 'Books & Notes', 'Keys & Wallets', 'Clothing', 'Other'];
const COLORS = ['Black', 'White', 'Gray', 'Silver', 'Blue', 'Red', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Brown', 'Gold', 'Multicolor'];
const LOCATIONS = ['Engineering Building', 'Main Library', 'Student Center', 'Science Complex', 'Cafeteria', 'Sports Hall', 'Other Campus Area'];
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'root', 'system', 'devops', 'support', 'moderator']);
const OPEN_CLAIM_STATUSES = ['Pending', 'More Proof Requested', 'Approved', 'Hold Item'];

const db = openDatabase(DB_PATH);

// ---------------------------------------------------------------------------
// Errors & small helpers
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
const badRequest = (message, extra) => new HttpError(400, message, extra);
const nowIso = () => new Date().toISOString();

function cleanText(value, { label, min = 0, max = 200, required = false }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${label} is required.`);
    return '';
  }
  if (typeof value !== 'string') throw badRequest(`${label} must be text.`);
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (required && text.length < Math.max(min, 1)) {
    throw badRequest(min > 1 ? `${label} must be at least ${min} characters.` : `${label} is required.`);
  }
  if (text.length > 0 && text.length < min) throw badRequest(`${label} must be at least ${min} characters.`);
  if (text.length > max) throw badRequest(`${label} must be at most ${max} characters.`);
  return text;
}

function cleanChoice(value, list, label) {
  if (!list.includes(value)) throw badRequest(`${label} is not valid.`);
  return value;
}

const DATA_URL_RE = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
function cleanImage(value, maxKb, label) {
  if (value === undefined || value === null || value === '') return { url: '', kb: 0 };
  if (typeof value !== 'string' || !DATA_URL_RE.test(value)) {
    throw badRequest(`${label} must be a PNG, JPEG, WebP or GIF image.`);
  }
  const kb = Math.ceil(((value.length - value.indexOf(',') - 1) * 0.75) / 1024);
  if (kb > maxKb) throw new HttpError(413, `${label} is too large (${kb} KB). Maximum is ${maxKb} KB.`);
  return { url: value, kb };
}

function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Passwords (scrypt, per-user random salt, constant-time comparison)
// ---------------------------------------------------------------------------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, keyHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p)
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function passwordProblems(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length < 8) problems.push('at least 8 characters');
  if (typeof password === 'string' && password.length > 128) problems.push('at most 128 characters');
  if (typeof password !== 'string' || !/\d/.test(password)) problems.push('at least one number');
  if (typeof password !== 'string' || !/[^A-Za-z0-9\s]/.test(password)) problems.push('at least one special character (e.g. ! @ # $ %)');
  return problems;
}

function cleanUsername(value) {
  if (typeof value !== 'string') throw badRequest('Username is required.');
  const username = value.trim();
  if (!/^[A-Za-z0-9_.]{3,20}$/.test(username)) {
    throw badRequest('Username must be 3-20 characters: letters, numbers, underscore or dot.');
  }
  return username;
}

// ---------------------------------------------------------------------------
// Brute-force protection
// ---------------------------------------------------------------------------
const failures = new Map(); // key -> { count, firstAt, lockedUntil }
const LOGIN_RULES = { user: { max: 5, windowMs: 15 * 60 * 1000, lockMs: 5 * 60 * 1000 }, ip: { max: 25, windowMs: 15 * 60 * 1000, lockMs: 5 * 60 * 1000 } };

function assertNotLocked(key) {
  // Lockout disabled per user instruction (no "Too many failed attempts" lockout)
  return;
}

function recordFailure(key, rule) {
  const now = Date.now();
  let entry = failures.get(key);
  if (!entry || now - entry.firstAt > rule.windowMs) entry = { count: 0, firstAt: now, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= rule.max) {
    entry.lockedUntil = now + rule.lockMs;
    entry.count = 0;
    entry.firstAt = now;
  }
  failures.set(key, entry);
}

function clientIp(req) {
  if (IS_SERVERLESS && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

const registrations = new Map(); // ip -> [timestamps]
function assertRegistrationAllowed(ip) {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const recent = (registrations.get(ip) || []).filter((t) => t > cutoff);
  if (recent.length >= 30) throw new HttpError(429, 'Too many accounts created from this device. Try again later.', { code: 'RATE_LIMITED' });
  recent.push(Date.now());
  registrations.set(ip, recent);
}

// ---------------------------------------------------------------------------
// Schema (wipes the old prototype database exactly once)
// ---------------------------------------------------------------------------
function initSchema() {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();

  if (tables.length > 0 && version !== SCHEMA_VERSION) {
    console.log('Old prototype database detected - resetting it to a clean, empty database.');
    db.exec('PRAGMA foreign_keys = OFF;');
    for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    db.exec('PRAGMA foreign_keys = ON;');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('LOST', 'FOUND')),
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      color TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL,
      date_lost_found TEXT NOT NULL,
      description TEXT NOT NULL,
      distinguishing_marks TEXT NOT NULL DEFAULT '',
      photo_url TEXT NOT NULL DEFAULT '',
      photo_thumb_url TEXT NOT NULL DEFAULT '',
      image_size_kb INTEGER NOT NULL DEFAULT 0,
      handed_to_office INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      is_suspicious INTEGER NOT NULL DEFAULT 0,
      suspicious_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_type_status ON reports(type, status);

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lost_report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      found_report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      matched_attributes TEXT NOT NULL,
      match_time_ms REAL NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (lost_report_id, found_report_id)
    );

    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      found_report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      lost_report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
      claimant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      proof_description TEXT NOT NULL,
      proof_photo_url TEXT NOT NULL DEFAULT '',
      additional_proof_text TEXT NOT NULL DEFAULT '',
      additional_photo_url TEXT NOT NULL DEFAULT '',
      admin_feedback TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending',
      identity_verified INTEGER NOT NULL DEFAULT 0,
      receipt_confirmed INTEGER NOT NULL DEFAULT 0,
      reviewed_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_report_id INTEGER,
      related_claim_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      latency_ms REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);

  // The one and only built-in account. Its password is never overwritten once it exists.
  const admin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!admin) {
    db.prepare("INSERT INTO users (username, password_hash, role, status, created_at) VALUES ('admin', ?, 'admin', 'active', ?)")
      .run(hashPassword('admin'), nowIso());
    logSystemEvent('BOOTSTRAP', 'Created built-in administrator account "admin".');
  }
}

function logSystemEvent(eventType, summary, latencyMs = 0) {
  db.prepare('INSERT INTO system_logs (event_type, summary, latency_ms, created_at) VALUES (?, ?, ?, ?)')
    .run(eventType, summary, Number(Number(latencyMs).toFixed(2)), nowIso());
}

function createNotification(userId, type, title, message, reportId = null, claimId = null) {
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, related_report_id, related_claim_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(userId, type, title, message, reportId, claimId, nowIso());
}

function notifyAdmins(type, title, message, reportId = null, claimId = null) {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all();
  for (const a of admins) createNotification(a.id, type, title, message, reportId, claimId);
}

// ---------------------------------------------------------------------------
// Sessions (Stateless cryptographically signed tokens + SQLite fallback)
// ---------------------------------------------------------------------------
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSession(userOrId) {
  let user = typeof userOrId === 'object' && userOrId !== null
    ? userOrId
    : db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userOrId);
  if (!user) user = { id: Number(userOrId) || 1, username: 'user', role: 'student' };

  const expiresMs = Date.now() + SESSION_TTL_MS;
  const expiresAt = new Date(expiresMs).toISOString();
  const token = signToken({ id: user.id, username: user.username, role: user.role, exp: expiresMs });

  try {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(sha256(token), user.id, nowIso(), expiresAt);
  } catch {
    // If DB is locked or read-only, stateless signed token still operates seamlessly
  }
  return { token, expiresAt };
}

function authenticate(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const rawToken = match[1].trim();

  // 1. Verify stateless signed token (works across serverless instances)
  const payload = verifyToken(rawToken);
  if (payload && payload.id && payload.username) {
    let user = null;
    try {
      user = db.prepare('SELECT id, username, role, status FROM users WHERE id = ?').get(payload.id);
      if (!user) {
        db.prepare(`
          INSERT OR IGNORE INTO users (id, username, password_hash, role, status, created_at)
          VALUES (?, ?, 'SIGNED_SESSION', ?, 'active', ?)
        `).run(payload.id, payload.username, payload.role || 'student', nowIso());
        user = db.prepare('SELECT id, username, role, status FROM users WHERE id = ?').get(payload.id);
      }
    } catch {
      // In case of transient DB concurrency
    }
    if (user && user.status === 'suspended') return null;
    return {
      id: payload.id,
      username: payload.username,
      role: payload.role || 'student',
      status: (user && user.status) || 'active',
      tokenHash: sha256(rawToken)
    };
  }

  // 2. Fallback for raw 64-hex tokens (e.g. test fixtures)
  if (/^[a-f0-9]{64}$/.test(rawToken)) {
    const row = db.prepare(`
      SELECT u.id, u.username, u.role, u.status, s.token_hash
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(sha256(rawToken), nowIso());
    if (!row || row.status !== 'active') return null;
    return { id: row.id, username: row.username, role: row.role, status: row.status, tokenHash: row.token_hash };
  }

  return null;
}

const publicUser = (u) => ({ id: u.id, username: u.username, display_name: u.username, role: u.role, status: u.status });

// ---------------------------------------------------------------------------
// Automated matching engine (NFR: < 3000 ms)
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'near', 'lost', 'found', 'item', 'from', 'was', 'has', 'black', 'white', 'blue']);
const tokenize = (str) =>
  String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

function runMatchingEngine(triggerId) {
  const start = performance.now();
  const trigger = db.prepare('SELECT * FROM reports WHERE id = ?').get(triggerId);
  if (!trigger) return { matchesFound: 0, executionTimeMs: 0 };

  const targetType = trigger.type === 'LOST' ? 'FOUND' : 'LOST';
  const candidates = db.prepare(`
    SELECT * FROM reports
    WHERE type = ? AND id != ? AND is_suspicious = 0 AND status IN ('Active', 'Claim Pending')
  `).all(targetType, trigger.id);

  let found = 0;
  for (const candidate of candidates) {
    const lost = trigger.type === 'LOST' ? trigger : candidate;
    const foundR = trigger.type === 'FOUND' ? trigger : candidate;
    let score = 0;
    const tags = [];

    if (lost.category === foundR.category) { score += 35; tags.push(`Category: ${lost.category}`); }
    if (lost.location === foundR.location) { score += 25; tags.push(`Location: ${lost.location}`); }
    if (lost.color === foundR.color) { score += 20; tags.push(`Color: ${lost.color}`); }
    if (lost.brand && foundR.brand) {
      const a = lost.brand.toLowerCase();
      const b = foundR.brand.toLowerCase();
      if (a.includes(b) || b.includes(a)) { score += 10; tags.push(`Brand: ${lost.brand}`); }
    }
    const lostWords = new Set(tokenize(`${lost.title} ${lost.description} ${lost.brand}`));
    const common = [...new Set(tokenize(`${foundR.title} ${foundR.description} ${foundR.brand}`).filter((w) => lostWords.has(w)))];
    if (common.length > 0) { score += Math.min(15, common.length * 6); tags.push(`Keywords: ${common.slice(0, 3).join(', ')}`); }
    score = Math.min(99, score);
    if (score < 60) continue;

    const existing = db.prepare('SELECT id FROM matches WHERE lost_report_id = ? AND found_report_id = ?').get(lost.id, foundR.id);
    if (!existing) {
      const elapsed = Number((performance.now() - start).toFixed(2));
      db.prepare(`
        INSERT INTO matches (lost_report_id, found_report_id, score, matched_attributes, match_time_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(lost.id, foundR.id, score, JSON.stringify(tags), elapsed, nowIso());
      createNotification(
        lost.user_id,
        'MATCH',
        `Possible match found (${score}%)`,
        `Your lost "${lost.title}" may match a found item reported at ${foundR.location}. Open Matches & Claims to review it and submit an ownership claim.`,
        foundR.id
      );
    }
    found += 1;
  }

  const total = Number((performance.now() - start).toFixed(2));
  logSystemEvent('AUTO_MATCH', `Report #${trigger.id} (${trigger.type}) scanned against ${candidates.length} report(s): ${found} match(es) in ${total} ms.`, total);
  return { matchesFound: found, executionTimeMs: total };
}

// ---------------------------------------------------------------------------
// Serialisation (server decides what each viewer may see)
// ---------------------------------------------------------------------------
function serializeReport(r, viewer) {
  const isAdmin = viewer.role === 'admin';
  const isOwner = r.user_id === viewer.id;
  const hidden = r.type === 'FOUND' && !isAdmin && !isOwner; // found-item evidence stays private
  const photo = hidden ? r.photo_thumb_url : r.photo_url;
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    category: r.category,
    color: r.color,
    brand: r.brand,
    location: r.location,
    date_lost_found: r.date_lost_found,
    description: r.description,
    status: r.status,
    created_at: r.created_at,
    is_mine: isOwner,
    is_suspicious: Boolean(r.is_suspicious),
    suspicious_reason: isAdmin || isOwner ? r.suspicious_reason : '',
    photo_url: photo,
    should_blur_photo: hidden && Boolean(photo),
    distinguishing_marks_display: hidden
      ? 'Hidden to protect the owner. Describe it in your claim and the administrator will verify it.'
      : r.distinguishing_marks || 'None specified',
    reporter_label: isAdmin ? `@${r.owner_username}` : isOwner ? 'You' : `Campus member #${1000 + r.user_id}`,
    owner_username: isAdmin ? r.owner_username : undefined
  };
}

function syncFoundReportStatus(foundId) {
  const found = db.prepare('SELECT status FROM reports WHERE id = ?').get(foundId);
  if (!found || ['Returned', 'Resolved'].includes(found.status) || found.status.startsWith('Removed')) return;
  const approved = db.prepare("SELECT id FROM claims WHERE found_report_id = ? AND status IN ('Approved', 'Hold Item')").get(foundId);
  const open = db.prepare("SELECT id FROM claims WHERE found_report_id = ? AND status IN ('Pending', 'More Proof Requested')").get(foundId);
  const status = approved ? 'Approved' : open ? 'Claim Pending' : 'Active';
  db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, foundId);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const routes = [];
function route(method, pattern, auth, handler) {
  const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
  routes.push({ method, regex, auth, handler });
}

const idParam = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw badRequest('Invalid id.');
  return id;
};

// ---- Public ----
route('GET', '/api/health', 'none', () => ({ status: 'online', time: nowIso() }));

route('GET', '/api/meta', 'none', () => ({
  categories: CATEGORIES,
  colors: COLORS,
  locations: LOCATIONS,
  limits: { maxPhotoKb: MAX_PHOTO_KB }
}));

// ---- Authentication ----
function issueSession(user, status = 200, extra = {}) {
  try {
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  } catch {}
  const session = createSession(user);
  return { status, body: { token: session.token, expiresAt: session.expiresAt, user: publicUser(user), ...extra } };
}

route('POST', '/api/auth/login', 'none', ({ req, body }) => {
  const rawName = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!rawName || !password) throw badRequest('Enter your username and password.');
  if (rawName.length > 40 || password.length > 128) throw badRequest('Invalid username or password.');

  const ip = clientIp(req);
  const userKey = `u:${rawName.toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  assertNotLocked(userKey);
  assertNotLocked(ipKey);

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(rawName);
  if (!user) {
    recordFailure(ipKey, LOGIN_RULES.ip);
    throw new HttpError(404, `No account named "${rawName}" exists yet.`, { code: 'USER_NOT_FOUND' });
  }
  if (!verifyPassword(password, user.password_hash)) {
    recordFailure(userKey, LOGIN_RULES.user);
    recordFailure(ipKey, LOGIN_RULES.ip);
    logSystemEvent('LOGIN_FAILED', `Failed sign-in for "${user.username}".`);
    throw new HttpError(401, 'Incorrect password.', { code: 'BAD_PASSWORD' });
  }
  if (user.status === 'suspended') {
    throw new HttpError(403, 'This account has been suspended by an administrator.', { code: 'SUSPENDED' });
  }
  failures.delete(userKey);
  logSystemEvent('LOGIN', `"${user.username}" signed in.`);
  return issueSession(user);
});

route('POST', '/api/auth/register', 'none', ({ req, body }) => {
  const username = cleanUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  if (RESERVED_USERNAMES.has(username.toLowerCase())) throw new HttpError(403, 'That username is reserved.', { code: 'RESERVED' });

  const problems = passwordProblems(password);
  if (problems.length) throw badRequest(`Password needs ${problems.join(', ')}.`, { code: 'WEAK_PASSWORD', problems });
  if (body.confirmPassword !== undefined && body.confirmPassword !== password) {
    throw badRequest('Passwords do not match.', { code: 'PASSWORD_MISMATCH' });
  }
  assertRegistrationAllowed(clientIp(req));

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    throw new HttpError(409, 'That username is already taken.', { code: 'USERNAME_TAKEN' });
  }
  const created = transaction(() => {
    const result = db.prepare("INSERT INTO users (username, password_hash, role, status, created_at) VALUES (?, ?, 'student', 'active', ?)")
      .run(username, hashPassword(password), nowIso());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid));
    createNotification(user.id, 'SYSTEM', 'Welcome to Reclaim', 'Your account is ready. Report a lost or found item to get started.');
    logSystemEvent('REGISTER', `New student account "${user.username}" created.`);
    return user;
  });
  return issueSession(created, 201, { isNewAccount: true });
});

route('POST', '/api/auth/logout', 'user', ({ user }) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(user.tokenHash);
  return { ok: true };
});

route('GET', '/api/auth/me', 'user', ({ user }) => ({ user: publicUser(user) }));

// ---- Stats ----
route('GET', '/api/stats', 'user', ({ user }) => {
  const count = (sql, ...args) => db.prepare(sql).get(...args).c;
  const isAdmin = user.role === 'admin';
  const lastMatch = db.prepare('SELECT match_time_ms FROM matches ORDER BY id DESC LIMIT 1').get();
  return {
    counts: {
      reports: count("SELECT COUNT(*) AS c FROM reports WHERE is_suspicious = 0 AND status IN ('Active', 'Claim Pending', 'Approved')"),
      matches: isAdmin
        ? count('SELECT COUNT(*) AS c FROM matches')
        : count('SELECT COUNT(*) AS c FROM matches m JOIN reports l ON l.id = m.lost_report_id WHERE l.user_id = ?', user.id),
      resolved: count("SELECT COUNT(*) AS c FROM reports WHERE status IN ('Returned', 'Resolved')"),
      pendingClaims: isAdmin ? count("SELECT COUNT(*) AS c FROM claims WHERE status IN ('Pending', 'More Proof Requested')") : 0,
      flagged: isAdmin ? count('SELECT COUNT(*) AS c FROM reports WHERE is_suspicious = 1') : 0
    },
    lastMatchLatencyMs: lastMatch ? lastMatch.match_time_ms : null
  };
});

// ---- Reports ----
route('GET', '/api/reports', 'user', ({ url, user }) => {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
  const type = url.searchParams.get('type') || '';
  const category = url.searchParams.get('category') || '';
  const location = url.searchParams.get('location') || '';
  const color = url.searchParams.get('color') || '';
  const isAdmin = user.role === 'admin';

  let rows = db.prepare(`
    SELECT r.*, u.username AS owner_username
    FROM reports r JOIN users u ON u.id = r.user_id
    WHERE ? = 1 OR r.user_id = ? OR (r.is_suspicious = 0 AND r.status NOT LIKE 'Removed%')
    ORDER BY r.id DESC
    LIMIT 500
  `).all(isAdmin ? 1 : 0, user.id);

  if (type === 'LOST' || type === 'FOUND') rows = rows.filter((r) => r.type === type);
  if (category) rows = rows.filter((r) => r.category === category);
  if (location) rows = rows.filter((r) => r.location === location);
  if (color) rows = rows.filter((r) => r.color === color);
  if (q) {
    rows = rows.filter((r) => [r.title, r.description, r.brand, r.location, r.category].some((f) => String(f).toLowerCase().includes(q)));
  }
  return { reports: rows.map((r) => serializeReport(r, user)) };
});

route('POST', '/api/reports', 'user', ({ user, body }) => {
  const type = cleanChoice(body.type, ['LOST', 'FOUND'], 'Report type');
  const title = cleanText(body.title, { label: 'Title', min: 3, max: 100, required: true });
  const category = cleanChoice(body.category, CATEGORIES, 'Category');
  const color = cleanChoice(body.color, COLORS, 'Color');
  const location = cleanChoice(body.location, LOCATIONS, 'Location');
  const brand = cleanText(body.brand, { label: 'Brand', max: 60 });
  const description = cleanText(body.description, { label: 'Description', min: 10, max: 1000, required: true });
  const marks = cleanText(body.distinguishing_marks, { label: 'Distinguishing marks', max: 300 });

  const when = new Date(body.date_lost_found);
  if (typeof body.date_lost_found !== 'string' || Number.isNaN(when.getTime())) throw badRequest('Enter a valid date and time.');
  if (when.getTime() > Date.now() + 5 * 60 * 1000) throw badRequest('The date cannot be in the future.');

  const photo = cleanImage(body.photo_url, MAX_PHOTO_KB, 'Photo');
  const thumb = photo.url ? cleanImage(body.photo_thumb_url, MAX_THUMB_KB, 'Photo preview') : { url: '' };

  if (user.status !== 'active') throw new HttpError(403, 'Suspended users cannot submit reports.');
  const recent = db.prepare('SELECT COUNT(*) AS c FROM reports WHERE user_id = ? AND created_at > ?')
    .get(user.id, new Date(Date.now() - 60 * 60 * 1000).toISOString()).c;
  if (recent >= 20) throw new HttpError(429, 'You have submitted too many reports in the last hour. Please wait a bit.');

  if (type === 'FOUND' && body.handed_to_office !== true) {
    throw badRequest('Confirm that you are handing the found item to the Lost & Found office.');
  }

  const result = db.prepare(`
    INSERT INTO reports (user_id, type, title, category, color, brand, location, date_lost_found, description,
                         distinguishing_marks, photo_url, photo_thumb_url, image_size_kb, handed_to_office, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)
  `).run(user.id, type, title, category, color, brand, location, when.toISOString(), description, marks,
    photo.url, thumb.url, photo.kb, type === 'FOUND' ? 1 : 0, nowIso());

  const reportId = Number(result.lastInsertRowid);
  const matchStats = runMatchingEngine(reportId);
  const created = db.prepare('SELECT r.*, u.username AS owner_username FROM reports r JOIN users u ON u.id = r.user_id WHERE r.id = ?').get(reportId);
  return { status: 201, body: { report: serializeReport(created, user), matchStats } };
});

route('DELETE', '/api/reports/:id', 'user', ({ params, user }) => {
  const id = idParam(params.id);
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!report) throw new HttpError(404, 'Report not found.');
  if (report.user_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'You can only delete your own reports.');
  if (user.role !== 'admin') {
    const open = db.prepare(`SELECT id FROM claims WHERE (found_report_id = ? OR lost_report_id = ?) AND status IN (${OPEN_CLAIM_STATUSES.map(() => '?').join(',')})`)
      .get(id, id, ...OPEN_CLAIM_STATUSES);
    if (open) throw new HttpError(409, 'This report has an active ownership claim and cannot be deleted right now.');
    if (['Returned', 'Resolved'].includes(report.status)) throw new HttpError(409, 'Resolved reports are kept for the record.');
  }
  db.prepare('DELETE FROM reports WHERE id = ?').run(id);
  logSystemEvent('REPORT_DELETED', `Report #${id} deleted by @${user.username}.`);
  return { ok: true };
});

route('POST', '/api/reports/:id/flag', 'user', ({ params, user, body }) => {
  const id = idParam(params.id);
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  if (!report) throw new HttpError(404, 'Report not found.');
  if (report.user_id === user.id) throw badRequest('You cannot flag your own report.');
  if (report.is_suspicious) return { ok: true };
  const reason = cleanText(body.reason, { label: 'Reason', max: 300 }) || 'Flagged by a campus member as suspicious or duplicate.';
  db.prepare('UPDATE reports SET is_suspicious = 1, suspicious_reason = ? WHERE id = ?').run(reason, id);
  notifyAdmins('ADMIN_NOTICE', 'Report flagged for review', `Report #${id} "${report.title}" was flagged: ${reason}`, id);
  logSystemEvent('REPORT_FLAGGED', `Report #${id} flagged by @${user.username}.`);
  return { ok: true };
});

route('POST', '/api/reports/:id/moderate', 'admin', ({ params, body, user }) => {
  const id = idParam(params.id);
  const report = db.prepare('SELECT r.*, u.username AS owner_username, u.role AS owner_role FROM reports r JOIN users u ON u.id = r.user_id WHERE r.id = ?').get(id);
  if (!report) throw new HttpError(404, 'Report not found.');

  switch (body.action) {
    case 'dismiss_flag':
      db.prepare("UPDATE reports SET is_suspicious = 0, suspicious_reason = '' WHERE id = ?").run(id);
      createNotification(report.user_id, 'ADMIN_NOTICE', 'Your report was reviewed',
        `An administrator reviewed "${report.title}", found it valid and kept it active.`, id);
      logSystemEvent('MODERATION', `Flag dismissed on report #${id} by @${user.username}.`);
      break;
    case 'delete_report':
      createNotification(report.user_id, 'ADMIN_NOTICE', 'Your report was removed',
        `An administrator removed "${report.title}" because it was inaccurate, a duplicate or against campus policy.`);
      db.prepare('DELETE FROM reports WHERE id = ?').run(id);
      logSystemEvent('MODERATION', `Report #${id} deleted by @${user.username}.`);
      break;
    case 'suspend_user': {
      if (report.owner_role === 'admin') throw badRequest('Administrators cannot be suspended.');
      transaction(() => {
        db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(report.user_id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(report.user_id);
        db.prepare("UPDATE reports SET status = 'Removed (User Suspended)', is_suspicious = 0 WHERE id = ?").run(id);
      });
      logSystemEvent('MODERATION', `User @${report.owner_username} suspended via report #${id} by @${user.username}.`);
      break;
    }
    default:
      throw badRequest('Unknown moderation action.');
  }
  return { ok: true };
});

// ---- Matches ----
route('GET', '/api/matches', 'user', ({ user }) => {
  const isAdmin = user.role === 'admin';
  const rows = db.prepare(`
    SELECT m.*,
      l.title AS lost_title, l.location AS lost_location, l.color AS lost_color, l.brand AS lost_brand,
      f.title AS found_title, f.location AS found_location, f.color AS found_color, f.status AS found_status,
      f.photo_thumb_url AS found_photo_thumb, f.photo_url AS found_photo_full
    FROM matches m
    JOIN reports l ON l.id = m.lost_report_id
    JOIN reports f ON f.id = m.found_report_id
    WHERE ? = 1 OR l.user_id = ?
    ORDER BY m.score DESC, m.id DESC
    LIMIT 200
  `).all(isAdmin ? 1 : 0, user.id);

  return {
    matches: rows.map((row) => {
      const { found_photo_full, found_photo_thumb, ...rest } = row;
      return {
        ...rest,
        matched_attributes: JSON.parse(row.matched_attributes || '[]'),
        found_photo_url: isAdmin ? found_photo_full : found_photo_thumb,
        found_should_blur: !isAdmin && Boolean(found_photo_thumb)
      };
    })
  };
});

// ---- Claims ----
const CLAIM_SELECT = `
  SELECT c.*, cu.username AS claimant_username,
    f.title AS found_title, f.category AS found_category, f.location AS found_location,
    f.description AS found_description, f.status AS found_report_status,
    fu.username AS finder_username, f.distinguishing_marks AS found_marks, f.photo_url AS found_photo_url,
    l.title AS lost_title, l.distinguishing_marks AS lost_marks, l.photo_url AS lost_photo_url
  FROM claims c
  JOIN users cu ON cu.id = c.claimant_id
  JOIN reports f ON f.id = c.found_report_id
  JOIN users fu ON fu.id = f.user_id
  LEFT JOIN reports l ON l.id = c.lost_report_id
`;

function serializeClaim(c, viewer) {
  const isAdmin = viewer.role === 'admin';
  const out = { ...c };
  if (!isAdmin) {
    // Never leak the finder's private evidence to claimants.
    delete out.found_marks;
    delete out.found_photo_url;
    delete out.finder_username;
  }
  return out;
}

route('GET', '/api/claims', 'user', ({ user }) => {
  const rows = user.role === 'admin'
    ? db.prepare(`${CLAIM_SELECT} ORDER BY c.id DESC LIMIT 300`).all()
    : db.prepare(`${CLAIM_SELECT} WHERE c.claimant_id = ? ORDER BY c.id DESC LIMIT 300`).all(user.id);
  return { claims: rows.map((c) => serializeClaim(c, user)) };
});

route('POST', '/api/claims', 'user', ({ user, body }) => {
  const foundId = idParam(body.found_report_id);
  const proof = cleanText(body.proof_description, { label: 'Proof of ownership', min: 10, max: 2000, required: true });
  const proofPhoto = cleanImage(body.proof_photo_url, MAX_PHOTO_KB, 'Proof photo');

  const found = db.prepare('SELECT * FROM reports WHERE id = ?').get(foundId);
  if (!found || found.type !== 'FOUND') throw new HttpError(404, 'Found item not found.');
  if (found.is_suspicious || !['Active', 'Claim Pending'].includes(found.status)) {
    throw new HttpError(409, 'This item is not available to claim right now.');
  }
  if (found.user_id === user.id) throw badRequest('You cannot claim an item you reported as found.');
  const duplicate = db.prepare(`SELECT id FROM claims WHERE found_report_id = ? AND claimant_id = ? AND status IN (${OPEN_CLAIM_STATUSES.map(() => '?').join(',')})`)
    .get(foundId, user.id, ...OPEN_CLAIM_STATUSES);
  if (duplicate) throw new HttpError(409, 'You already have an open claim for this item.');

  let lostId = null;
  if (body.lost_report_id) {
    const lost = db.prepare('SELECT id, user_id, type FROM reports WHERE id = ?').get(idParam(body.lost_report_id));
    if (!lost || lost.type !== 'LOST' || lost.user_id !== user.id) throw badRequest('That lost report does not belong to you.');
    lostId = lost.id;
  } else {
    const own = db.prepare("SELECT id FROM reports WHERE user_id = ? AND type = 'LOST' AND status IN ('Active', 'Claim Pending') ORDER BY id DESC LIMIT 1").get(user.id);
    lostId = own ? own.id : null;
  }

  const claimId = transaction(() => {
    const now = nowIso();
    const result = db.prepare(`
      INSERT INTO claims (found_report_id, lost_report_id, claimant_id, proof_description, proof_photo_url, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?)
    `).run(foundId, lostId, user.id, proof, proofPhoto.url, now, now);
    const id = Number(result.lastInsertRowid);
    syncFoundReportStatus(foundId);
    if (lostId) db.prepare("UPDATE reports SET status = 'Claim Pending' WHERE id = ?").run(lostId);
    createNotification(user.id, 'CLAIM_UPDATE', `Claim #${id} submitted`,
      `Your claim for "${found.title}" was sent to the administrator for verification.`, foundId, id);
    notifyAdmins('ADMIN_NOTICE', `New ownership claim #${id}`,
      `@${user.username} submitted a claim for "${found.title}". Review it in the Admin Workspace.`, foundId, id);
    logSystemEvent('CLAIM_SUBMITTED', `@${user.username} submitted claim #${id} for report #${foundId}.`);
    return id;
  });
  const claim = db.prepare(`${CLAIM_SELECT} WHERE c.id = ?`).get(claimId);
  return { status: 201, body: { claim: serializeClaim(claim, user) } };
});

function loadClaim(id) {
  const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(id);
  if (!claim) throw new HttpError(404, 'Claim not found.');
  return claim;
}

route('POST', '/api/claims/:id/more-proof', 'user', ({ params, user, body }) => {
  const claim = loadClaim(idParam(params.id));
  if (claim.claimant_id !== user.id) throw new HttpError(403, 'This is not your claim.');
  if (claim.status !== 'More Proof Requested') throw new HttpError(409, 'The administrator has not requested more proof for this claim.');
  const text = cleanText(body.additional_proof_text, { label: 'Additional proof', min: 5, max: 2000, required: true });
  const photo = cleanImage(body.additional_photo_url, MAX_PHOTO_KB, 'Proof photo');
  db.prepare("UPDATE claims SET additional_proof_text = ?, additional_photo_url = ?, status = 'Pending', updated_at = ? WHERE id = ?")
    .run(text, photo.url, nowIso(), claim.id);
  notifyAdmins('ADMIN_NOTICE', `Additional proof received for claim #${claim.id}`, `@${user.username} replied to your request for more proof.`, claim.found_report_id, claim.id);
  logSystemEvent('CLAIM_MORE_PROOF', `@${user.username} provided more proof for claim #${claim.id}.`);
  return { ok: true };
});

route('POST', '/api/claims/:id/confirm-receipt', 'user', ({ params, user }) => {
  const claim = loadClaim(idParam(params.id));
  if (claim.claimant_id !== user.id) throw new HttpError(403, 'This is not your claim.');
  if (claim.status !== 'Approved') throw new HttpError(409, 'You can confirm receipt only after your claim is approved.');
  db.prepare('UPDATE claims SET receipt_confirmed = 1, updated_at = ? WHERE id = ?').run(nowIso(), claim.id);
  notifyAdmins('ADMIN_NOTICE', `Receipt confirmed for claim #${claim.id}`, `@${user.username} confirmed they received the item. You can mark it returned.`, claim.found_report_id, claim.id);
  logSystemEvent('RECEIPT_CONFIRMED', `@${user.username} confirmed receipt for claim #${claim.id}.`);
  return { ok: true };
});

route('POST', '/api/claims/:id/admin-action', 'admin', ({ params, body, user }) => {
  const claim = loadClaim(idParam(params.id));
  const feedback = cleanText(body.admin_feedback, { label: 'Note', max: 500 });
  const found = db.prepare('SELECT * FROM reports WHERE id = ?').get(claim.found_report_id);
  const title = found ? found.title : 'the item';
  const now = nowIso();
  const need = (...statuses) => {
    if (!statuses.includes(claim.status)) throw new HttpError(409, `This action is not available while the claim is "${claim.status}".`);
  };

  transaction(() => {
    switch (body.action) {
      case 'request_more_proof': {
        need('Pending');
        const note = feedback || 'Please provide a clearer photo of the serial number or another distinguishing mark.';
        db.prepare("UPDATE claims SET status = 'More Proof Requested', admin_feedback = ?, reviewed_by = ?, updated_at = ? WHERE id = ?").run(note, user.username, now, claim.id);
        createNotification(claim.claimant_id, 'ADMIN_NOTICE', `More proof needed for claim #${claim.id}`, `Administrator: "${note}". Open Matches & Claims to reply.`, claim.found_report_id, claim.id);
        break;
      }
      case 'approve': {
        need('Pending');
        const note = feedback || 'Ownership verified. Please visit the Lost & Found office with your student ID to collect the item.';
        db.prepare("UPDATE claims SET status = 'Approved', admin_feedback = ?, reviewed_by = ?, updated_at = ? WHERE id = ?").run(note, user.username, now, claim.id);
        db.prepare("UPDATE reports SET status = 'Approved' WHERE id = ?").run(claim.found_report_id);
        if (claim.lost_report_id) db.prepare("UPDATE reports SET status = 'Approved' WHERE id = ?").run(claim.lost_report_id);
        createNotification(claim.claimant_id, 'CLAIM_UPDATE', `Claim #${claim.id} approved`, `Your claim for "${title}" was approved. ${note}`, claim.found_report_id, claim.id);
        const others = db.prepare("SELECT * FROM claims WHERE found_report_id = ? AND id != ? AND status IN ('Pending', 'More Proof Requested')").all(claim.found_report_id, claim.id);
        for (const o of others) {
          db.prepare("UPDATE claims SET status = 'Rejected', admin_feedback = ?, reviewed_by = ?, updated_at = ? WHERE id = ?")
            .run('Another ownership claim for this item was approved.', user.username, now, o.id);
          createNotification(o.claimant_id, 'CLAIM_UPDATE', `Claim #${o.id} closed`, `Another claim for "${title}" was approved, so your claim was closed.`, claim.found_report_id, o.id);
          if (o.lost_report_id) db.prepare("UPDATE reports SET status = 'Active' WHERE id = ? AND status = 'Claim Pending'").run(o.lost_report_id);
        }
        break;
      }
      case 'reject': {
        need('Pending', 'More Proof Requested');
        const note = feedback || 'The proof provided did not match the item.';
        db.prepare("UPDATE claims SET status = 'Rejected', admin_feedback = ?, reviewed_by = ?, updated_at = ? WHERE id = ?").run(note, user.username, now, claim.id);
        if (claim.lost_report_id) db.prepare("UPDATE reports SET status = 'Active' WHERE id = ? AND status IN ('Claim Pending', 'Approved')").run(claim.lost_report_id);
        syncFoundReportStatus(claim.found_report_id);
        createNotification(claim.claimant_id, 'CLAIM_UPDATE', `Claim #${claim.id} rejected`, `Your claim for "${title}" was rejected. Reason: ${note}`, claim.found_report_id, claim.id);
        break;
      }
      case 'verify_identity_no_hold': {
        need('Approved');
        const note = feedback || 'The claimant could not be verified in person. The item is on hold.';
        db.prepare("UPDATE claims SET status = 'Hold Item', identity_verified = 0, admin_feedback = ?, reviewed_by = ?, updated_at = ? WHERE id = ?").run(note, user.username, now, claim.id);
        createNotification(claim.claimant_id, 'ADMIN_NOTICE', `Item on hold (claim #${claim.id})`, `Handover paused: ${note}`, claim.found_report_id, claim.id);
        break;
      }
      case 'mark_returned': {
        need('Approved', 'Hold Item');
        db.prepare(`UPDATE claims SET status = 'Returned', identity_verified = 1, receipt_confirmed = 1,
                    admin_feedback = ?, reviewed_by = ?, updated_at = ? WHERE id = ?`)
          .run(feedback || 'Identity verified in person and the item was handed over.', user.username, now, claim.id);
        db.prepare("UPDATE reports SET status = 'Returned' WHERE id = ?").run(claim.found_report_id);
        if (claim.lost_report_id) db.prepare("UPDATE reports SET status = 'Resolved' WHERE id = ?").run(claim.lost_report_id);
        createNotification(claim.claimant_id, 'CLAIM_UPDATE', `Item returned (claim #${claim.id})`, `"${title}" was handed over and your case is now resolved.`, claim.found_report_id, claim.id);
        break;
      }
      default:
        throw badRequest('Unknown action.');
    }
    logSystemEvent('ADMIN_CLAIM_ACTION', `@${user.username}: ${body.action} on claim #${claim.id}.`);
  });

  return { claim: serializeClaim(db.prepare(`${CLAIM_SELECT} WHERE c.id = ?`).get(claim.id), user) };
});

// ---- Notifications ----
route('GET', '/api/notifications', 'user', ({ user }) => ({
  notifications: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(user.id)
}));

route('POST', '/api/notifications/read-all', 'user', ({ user }) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(user.id);
  return { ok: true };
});

// ---- Administration / DevOps ----
route('GET', '/api/admin/overview', 'admin', () => {
  const count = (sql) => db.prepare(sql).get().c;
  const lastMatch = db.prepare('SELECT match_time_ms FROM matches ORDER BY id DESC LIMIT 1').get();
  return {
    database: { engine: 'SQLite (node:sqlite)', file: DB_PATH === ':memory:' ? 'in-memory (not persistent)' : path.basename(DB_PATH), persistent: DB_PATH !== ':memory:' },
    counts: {
      users: count('SELECT COUNT(*) AS c FROM users'),
      reports: count('SELECT COUNT(*) AS c FROM reports'),
      lost: count("SELECT COUNT(*) AS c FROM reports WHERE type = 'LOST'"),
      found: count("SELECT COUNT(*) AS c FROM reports WHERE type = 'FOUND'"),
      matches: count('SELECT COUNT(*) AS c FROM matches'),
      claims: count('SELECT COUNT(*) AS c FROM claims'),
      sessions: count("SELECT COUNT(*) AS c FROM sessions WHERE expires_at > '" + nowIso() + "'")
    },
    nfr: { maxMatchLatencyMs: 3000, lastMatchLatencyMs: lastMatch ? lastMatch.match_time_ms : null, maxImageSizeKb: MAX_PHOTO_KB },
    users: db.prepare(`
      SELECT u.id, u.username, u.role, u.status, u.created_at, u.last_login_at,
             (SELECT COUNT(*) FROM reports r WHERE r.user_id = u.id) AS report_count
      FROM users u ORDER BY u.id ASC
    `).all(),
    recentLogs: db.prepare('SELECT * FROM system_logs ORDER BY id DESC LIMIT 60').all()
  };
});

route('POST', '/api/admin/users/:id/toggle-status', 'admin', ({ params, user }) => {
  const id = idParam(params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) throw new HttpError(404, 'User not found.');
  if (target.role === 'admin') throw badRequest('Administrator accounts cannot be suspended.');
  const status = target.status === 'suspended' ? 'active' : 'suspended';
  transaction(() => {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
    if (status === 'suspended') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    logSystemEvent('USER_STATUS', `@${target.username} set to ${status} by @${user.username}.`);
  });
  return { ok: true, status };
});

// Wipes ALL application data (reports, matches, claims, notifications, logs) and every account except "admin".
route('POST', '/api/admin/reset', 'admin', ({ body, user }) => {
  if (body.confirm !== 'WIPE') throw badRequest('Confirmation text is missing.');
  transaction(() => {
    db.exec(`
      DELETE FROM notifications;
      DELETE FROM claims;
      DELETE FROM matches;
      DELETE FROM reports;
      DELETE FROM system_logs;
    `);
    db.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role != 'admin')").run();
    db.prepare("DELETE FROM users WHERE role != 'admin'").run();
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('notifications', 'claims', 'matches', 'reports', 'system_logs')");
    logSystemEvent('DATABASE_RESET', `All data wiped by @${user.username}.`);
  });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------
function applyHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > MAX_BODY_BYTES) return reject(new HttpError(413, 'Request is too large.'));
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooBig = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) return reject(new HttpError(413, 'Request is too large.'));
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        resolve(parsed);
      } catch {
        reject(badRequest('Request body must be valid JSON.'));
      }
    });
    req.on('error', () => reject(badRequest('Could not read request.')));
  });
}

async function requestHandler(req, res) {
  applyHeaders(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (!pathname.startsWith('/api')) pathname = `/api${pathname === '/' ? '' : pathname}`;

    let matched = null;
    let methodMismatch = false;
    for (const r of routes) {
      const m = r.regex.exec(pathname);
      if (!m) continue;
      if (r.method !== req.method) { methodMismatch = true; continue; }
      matched = { route: r, params: m.groups || {} };
      break;
    }
    if (!matched) throw new HttpError(methodMismatch ? 405 : 404, methodMismatch ? 'Method not allowed.' : 'Endpoint not found.');

    let user = null;
    if (matched.route.auth !== 'none') {
      user = authenticate(req);
      if (!user) throw new HttpError(401, 'Please sign in to continue.', { code: 'AUTH_REQUIRED' });
      if (matched.route.auth === 'admin' && user.role !== 'admin') throw new HttpError(403, 'Administrator access required.');
    }

    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const body = hasBody ? await readJson(req) : {};
    const result = await matched.route.handler({ req, res, url, params: matched.params, user, body });
    if (result && typeof result.status === 'number' && result.body !== undefined) return sendJson(res, result.status, result.body);
    return sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message, ...err.extra });
    console.error('Unexpected error:', err);
    return sendJson(res, 500, { error: 'Something went wrong on the server.' });
  }
}

initSchema();

if (require.main === module) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log('==========================================================');
    console.log('  RECLAIM - Campus Lost & Found backend');
    console.log(`  API       : http://localhost:${PORT}/api/health`);
    console.log(`  Database  : ${DB_PATH}`);
    console.log('==========================================================');
  });
}

module.exports = requestHandler;
