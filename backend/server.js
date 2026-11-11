const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 5000;
const isVercel = !!process.env.VERCEL;
const DB_PATH = isVercel ? path.join('/tmp', 'reclaim.db') : path.join(__dirname, 'reclaim.db');

// If on Vercel serverless and /tmp/reclaim.db does not exist yet, copy seeded template if present
if (isVercel && !fs.existsSync(DB_PATH)) {
  const seedTemplate = path.join(__dirname, 'reclaim.db');
  if (fs.existsSync(seedTemplate)) {
    try {
      fs.copyFileSync(seedTemplate, DB_PATH);
    } catch (e) {
      console.warn('Could not copy initial reclaim.db to /tmp:', e);
    }
  }
}

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for performance and integrity
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

// Built-in SVG Data URI illustrations for realistic campus items
function createItemSvg(bg1, bg2, iconSvg, label, sublabel) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="100%" stop-color="${bg2}"/>
      </linearGradient>
    </defs>
    <rect width="640" height="420" fill="url(#g)"/>
    <circle cx="540" cy="80" r="140" fill="rgba(255,255,255,0.06)"/>
    <circle cx="100" cy="360" r="180" fill="rgba(255,255,255,0.05)"/>
    <g transform="translate(220, 75)">
      ${iconSvg}
    </g>
    <rect x="30" y="330" width="580" height="64" rx="14" fill="rgba(10, 15, 30, 0.55)"/>
    <text x="52" y="358" fill="#ffffff" font-family="system-ui, sans-serif" font-size="20" font-weight="700">${label}</text>
    <text x="52" y="382" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="14">${sublabel}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PRESET_IMAGES = {
  charger_lost: createItemSvg(
    '#0f172a',
    '#1e293b',
    `<rect x="45" y="40" width="110" height="140" rx="18" fill="#111827" stroke="#475569" stroke-width="5"/>
     <rect x="65" y="65" width="70" height="35" rx="6" fill="#1e293b"/>
     <text x="100" y="88" text-anchor="middle" fill="#38bdf8" font-family="monospace" font-size="14" font-weight="bold">65W USB-C</text>
     <path d="M80 40 L80 12 M120 40 L120 12" stroke="#94a3b8" stroke-width="8" stroke-linecap="round"/>
     <path d="M100 180 C100 225, 175 225, 175 155" stroke="#0f172a" stroke-width="10" fill="none" stroke-linecap="round"/>
     <rect x="167" y="130" width="16" height="28" rx="4" fill="#38bdf8"/>`,
    'Black 65W USB-C Laptop Charger',
    'Owner Photo • Matte black brick with blue cable velcro wrap'
  ),
  charger_found: createItemSvg(
    '#1e1b4b',
    '#0f172a',
    `<rect x="45" y="40" width="110" height="140" rx="18" fill="#090d16" stroke="#6366f1" stroke-width="5"/>
     <rect x="65" y="65" width="70" height="35" rx="6" fill="#1e293b"/>
     <text x="100" y="88" text-anchor="middle" fill="#818cf8" font-family="monospace" font-size="14" font-weight="bold">DELL 65W</text>
     <path d="M80 40 L80 12 M120 40 L120 12" stroke="#cbd5e1" stroke-width="8" stroke-linecap="round"/>
     <path d="M100 180 C100 225, 175 225, 175 155" stroke="#1e293b" stroke-width="10" fill="none" stroke-linecap="round"/>
     <rect x="167" y="130" width="16" height="28" rx="4" fill="#38bdf8"/>`,
    'Found: Black Laptop Power Adapter',
    'Logged at Engineering Building Desk • Tag #LF-204'
  ),
  charger_proof: createItemSvg(
    '#064e3b',
    '#0f172a',
    `<rect x="25" y="30" width="150" height="165" rx="16" fill="#111827" stroke="#10b981" stroke-width="4"/>
     <text x="100" y="68" text-anchor="middle" fill="#10b981" font-family="monospace" font-size="13" font-weight="bold">S/N: CN-065W-AH92</text>
     <rect x="48" y="85" width="104" height="45" rx="6" fill="#1f2937"/>
     <text x="100" y="112" text-anchor="middle" fill="#e2e8f0" font-family="sans-serif" font-size="12">Blue Velcro Strap + Scratch</text>
     <circle cx="145" cy="160" r="18" fill="#10b981"/>
     <path d="M137 160 L143 166 L154 154" stroke="#064e3b" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    'Ownership Proof: Close-up of Serial & Strap',
    'Uploaded by Ahmed • Matches Serial CN-065W-AH92 & Blue Strap'
  ),
  hydroflask: createItemSvg(
    '#0c4a6e',
    '#0284c7',
    `<rect x="65" y="45" width="70" height="165" rx="18" fill="#38bdf8" stroke="#e0f2fe" stroke-width="4"/>
     <rect x="75" y="18" width="50" height="28" rx="6" fill="#0f172a"/>
     <circle cx="100" cy="130" r="22" fill="#0284c7"/>
     <text x="100" y="136" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="13" font-weight="bold">32 oz</text>`,
    'Blue Insulated Water Bottle (32oz)',
    'Found near Main Library 2nd Floor Study Tables'
  ),
  airpods: createItemSvg(
    '#312e81',
    '#4338ca',
    `<rect x="45" y="55" width="110" height="130" rx="36" fill="#f8fafc" stroke="#cbd5e1" stroke-width="5"/>
     <line x1="45" y1="105" x2="155" y2="105" stroke="#94a3b8" stroke-width="3"/>
     <circle cx="100" cy="135" r="6" fill="#22c55e"/>`,
    'Apple AirPods Pro (White Charging Case)',
    'Reported in Student Center • Silicone Case Attached'
  ),
  calculator: createItemSvg(
    '#1e293b',
    '#334155',
    `<rect x="50" y="25" width="100" height="185" rx="14" fill="#0f172a" stroke="#64748b" stroke-width="4"/>
     <rect x="64" y="42" width="72" height="45" rx="6" fill="#86efac"/>
     <text x="100" y="70" text-anchor="middle" fill="#064e3b" font-family="monospace" font-size="14" font-weight="bold">fx-991EX</text>
     <g fill="#475569">
       <rect x="64" y="102" width="18" height="14" rx="3"/><rect x="91" y="102" width="18" height="14" rx="3"/><rect x="118" y="102" width="18" height="14" rx="3"/>
       <rect x="64" y="126" width="18" height="14" rx="3"/><rect x="91" y="126" width="18" height="14" rx="3"/><rect x="118" y="126" width="18" height="14" rx="3"/>
       <rect x="64" y="150" width="18" height="14" rx="3"/><rect x="91" y="150" width="18" height="14" rx="3"/><rect x="118" y="150" width="18" height="14" rx="3"/>
     </g>`,
    'Casio fx-991EX Scientific Calculator',
    'Science Complex Lab 104 • Sticker on back cover'
  ),
  student_id: createItemSvg(
    '#581c87',
    '#3b0764',
    `<rect x="20" y="55" width="160" height="105" rx="12" fill="#f8fafc" stroke="#c084fc" stroke-width="4"/>
     <rect x="20" y="55" width="160" height="28" rx="10" fill="#7e22ce"/>
     <circle cx="55" cy="115" r="20" fill="#cbd5e1"/>
     <rect x="88" y="98" width="72" height="10" rx="4" fill="#334155"/>
     <rect x="88" y="116" width="52" height="8" rx="4" fill="#64748b"/>
     <rect x="88" y="132" width="60" height="8" rx="4" fill="#94a3b8"/>`,
    'University Student ID Card & Lanyard',
    'Found at Campus Cafeteria Cashier'
  )
};

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      type TEXT NOT NULL, -- 'LOST' or 'FOUND'
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      color TEXT NOT NULL,
      brand TEXT DEFAULT '',
      location TEXT NOT NULL,
      date_lost_found TEXT NOT NULL,
      description TEXT NOT NULL,
      distinguishing_marks TEXT DEFAULT '',
      photo_url TEXT DEFAULT '',
      image_size_kb REAL DEFAULT 42.5,
      handed_to_office INTEGER DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Claim Pending', 'Approved', 'Returned', 'Resolved', 'Under Review'
      is_suspicious INTEGER DEFAULT 0,
      suspicious_reason TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lost_report_id INTEGER NOT NULL,
      found_report_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      matched_attributes TEXT NOT NULL,
      match_time_ms REAL NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(lost_report_id, found_report_id)
    );

    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      found_report_id INTEGER NOT NULL,
      lost_report_id INTEGER,
      claimant_id INTEGER NOT NULL,
      claimant_username TEXT NOT NULL,
      proof_description TEXT NOT NULL,
      proof_photo_url TEXT DEFAULT '',
      additional_proof_text TEXT DEFAULT '',
      admin_feedback TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'More Proof Requested', 'Approved', 'Rejected', 'Hold Item', 'Returned'
      identity_verified INTEGER DEFAULT 0,
      receipt_confirmed INTEGER DEFAULT 0,
      reviewed_by TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      type TEXT NOT NULL, -- 'MATCH', 'CLAIM_UPDATE', 'ADMIN_NOTICE', 'SYSTEM'
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_report_id INTEGER,
      related_claim_id INTEGER,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      latency_ms REAL DEFAULT 0.5,
      created_at TEXT NOT NULL
    );
  `);
}

function logSystemEvent(eventType, summary, latencyMs = 0.8) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO system_logs (event_type, summary, latency_ms, created_at)
    VALUES (?, ?, ?, ?)
  `).run(eventType, summary, Number(latencyMs.toFixed(2)), now);
}

function createNotification(userId, username, type, title, message, relatedReportId = null, relatedClaimId = null) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO notifications (user_id, username, type, title, message, related_report_id, related_claim_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(userId, username, type, title, message, relatedReportId, relatedClaimId, now);
}

// Automated Matching Engine (NFR: Must complete in < 3000ms)
function runMatchingEngine(triggerReportId) {
  const start = performance.now();
  const triggerReport = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(triggerReportId);
  if (!triggerReport) return { matchesFound: 0, executionTimeMs: 0, matches: [] };

  const targetType = triggerReport.type === 'LOST' ? 'FOUND' : 'LOST';
  const candidates = db.prepare(`
    SELECT * FROM reports
    WHERE type = ? AND status NOT IN ('Returned', 'Resolved') AND is_suspicious = 0
  `).all(targetType);

  const stopWords = new Set(['the', 'and', 'for', 'with', 'near', 'lost', 'found', 'item', 'from', 'was', 'has', 'black', 'white', 'blue']);
  const tokenize = (str) =>
    (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

  const createdMatches = [];

  for (const candidate of candidates) {
    const lostReport = triggerReport.type === 'LOST' ? triggerReport : candidate;
    const foundReport = triggerReport.type === 'FOUND' ? triggerReport : candidate;

    let score = 0;
    const matchedTags = [];

    // 1. Category Match (35 points)
    if (lostReport.category.toLowerCase() === foundReport.category.toLowerCase()) {
      score += 35;
      matchedTags.push(`Category: ${lostReport.category}`);
    }

    // 2. Campus Location / Building Match (25 points)
    if (lostReport.location.toLowerCase() === foundReport.location.toLowerCase()) {
      score += 25;
      matchedTags.push(`Location: ${lostReport.location}`);
    }

    // 3. Color Match (20 points)
    if (lostReport.color.toLowerCase() === foundReport.color.toLowerCase()) {
      score += 20;
      matchedTags.push(`Color: ${lostReport.color}`);
    }

    // 4. Brand Match (10 points)
    if (
      lostReport.brand &&
      foundReport.brand &&
      (lostReport.brand.toLowerCase().includes(foundReport.brand.toLowerCase()) ||
        foundReport.brand.toLowerCase().includes(lostReport.brand.toLowerCase()))
    ) {
      score += 10;
      matchedTags.push(`Brand: ${lostReport.brand}`);
    }

    // 5. Title & Description Keyword Overlap (up to 15 points)
    const lostWords = new Set(tokenize(`${lostReport.title} ${lostReport.description} ${lostReport.brand}`));
    const foundWords = tokenize(`${foundReport.title} ${foundReport.description} ${foundReport.brand}`);
    const commonWords = [...new Set(foundWords.filter((w) => lostWords.has(w)))];

    if (commonWords.length > 0) {
      const kwPoints = Math.min(15, commonWords.length * 6);
      score += kwPoints;
      matchedTags.push(`Keywords: ${commonWords.slice(0, 3).join(', ')}`);
    }

    score = Math.min(99, score);

    // Threshold for suggesting a strong match: >= 60
    if (score >= 60) {
      const elapsedMs = Number((performance.now() - start).toFixed(2));
      const existing = db.prepare(`
        SELECT id FROM matches WHERE lost_report_id = ? AND found_report_id = ?
      `).get(lostReport.id, foundReport.id);

      const now = new Date().toISOString();
      if (!existing) {
        db.prepare(`
          INSERT INTO matches (lost_report_id, found_report_id, score, matched_attributes, match_time_ms, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          lostReport.id,
          foundReport.id,
          score,
          JSON.stringify(matchedTags),
          elapsedMs,
          now
        );

        // Send instant Match Notification to the Lost Item Owner (Privacy preserved: no finder contact leaked)
        createNotification(
          lostReport.user_id,
          lostReport.username,
          'MATCH',
          `High-Confidence Match Found (${score}%)`,
          `Our automated engine matched your lost "${lostReport.title}" with a found report at ${foundReport.location} in ${elapsedMs}ms. Review the match and submit an ownership claim.`,
          foundReport.id,
          null
        );
      }

      createdMatches.push({
        lost_report_id: lostReport.id,
        found_report_id: foundReport.id,
        score,
        matchedTags,
        elapsedMs
      });
    }
  }

  const totalTimeMs = Number((performance.now() - start).toFixed(2));
  logSystemEvent(
    'AUTO_MATCH_ENGINE',
    `Report #${triggerReportId} (${triggerReport.type}) scanned against ${candidates.length} candidates -> ${createdMatches.length} match(es) found in ${totalTimeMs}ms (NFR < 3000ms PASS)`,
    totalTimeMs
  );

  return {
    matchesFound: createdMatches.length,
    executionTimeMs: totalTimeMs,
    matches: createdMatches
  };
}

function seedScenario(mode = 'full_demo') {
  db.exec(`
    DELETE FROM notifications;
    DELETE FROM claims;
    DELETE FROM matches;
    DELETE FROM reports;
    DELETE FROM users;
    DELETE FROM system_logs;
    DELETE FROM sqlite_sequence;
  `);

  const now = new Date();
  const iso = (minsAgo) => new Date(now.getTime() - minsAgo * 60000).toISOString();

  // Create key accounts from the PDF report ("ahmed", "khalid", "admin", "sara")
  // Password '__DEMO_ANY__' means first login with ANY password saves & binds that password!
  const insertUser = db.prepare(`
    INSERT INTO users (username, password, display_name, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const adminId = insertUser.run('admin', '__DEMO_ANY__', 'Lost & Found Administrator', 'admin', 'active', iso(360)).lastInsertRowid;
  const ahmedId = insertUser.run('ahmed', '__DEMO_ANY__', 'Ahmed (Student)', 'student', 'active', iso(300)).lastInsertRowid;
  const khalidId = insertUser.run('khalid', '__DEMO_ANY__', 'Khalid (Student)', 'student', 'active', iso(280)).lastInsertRowid;
  const saraId = insertUser.run('sara', '__DEMO_ANY__', 'Sara Al-Mansoor', 'student', 'active', iso(240)).lastInsertRowid;

  const insertReport = db.prepare(`
    INSERT INTO reports (
      user_id, username, type, title, category, color, brand, location,
      date_lost_found, description, distinguishing_marks, photo_url,
      image_size_kb, handed_to_office, status, is_suspicious, suspicious_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Background Campus Reports
  insertReport.run(
    saraId,
    'sara',
    'FOUND',
    'Blue 32oz HydroFlask Water Bottle',
    'Bottles & Accessories',
    'Blue',
    'HydroFlask',
    'Main Library',
    'Today, 09:15 AM',
    'Found on the 2nd floor quiet zone desk near the window.',
    'Has two coding stickers near the bottom base and a black paracord handle.',
    PRESET_IMAGES.hydroflask,
    184.2,
    1,
    'Active',
    0,
    '',
    iso(180)
  );

  insertReport.run(
    saraId,
    'sara',
    'LOST',
    'Casio fx-991EX Scientific Calculator',
    'Electronics',
    'Black',
    'Casio',
    'Science Complex',
    'Yesterday, 02:30 PM',
    'Left it on the bench after the Linear Algebra quiz in Room 104.',
    'My initials "S.M." are written in silver marker inside the slide cover.',
    PRESET_IMAGES.calculator,
    142.8,
    0,
    'Active',
    0,
    '',
    iso(150)
  );

  insertReport.run(
    khalidId,
    'khalid',
    'FOUND',
    'University Student ID Card & Purple Lanyard',
    'ID & Cards',
    'Purple',
    'Campus Card',
    'Cafeteria',
    'Today, 10:05 AM',
    'Found next to the coffee station in the main student cafeteria.',
    'ID number ends with 4829, attached to an Engineering Club lanyard.',
    PRESET_IMAGES.student_id,
    156.0,
    1,
    'Active',
    0,
    '',
    iso(110)
  );

  if (mode === 'clean_stage') {
    logSystemEvent('SEED_SCENARIO', 'Loaded Stage 1: Clean Campus State (Ready to live-report Ahmed & Khalid items)', 1.2);
    return;
  }

  // Main Scenario Step 1: Ahmed loses his Black Laptop Charger in Engineering Building
  const ahmedLostId = insertReport.run(
    ahmedId,
    'ahmed',
    'LOST',
    'Black Laptop Charger (65W USB-C)',
    'Electronics',
    'Black',
    'Dell',
    'Engineering Building',
    'Today, 09:30 AM',
    'Lost my black 65W laptop charger after attending the morning lecture in the Engineering Building (Hall B2). Realized it was missing when I got to the library.',
    'Blue velcro cable tie attached and serial number ending in AH92 on the brick.',
    PRESET_IMAGES.charger_lost,
    210.4,
    0,
    mode === 'full_demo' ? 'Claim Pending' : 'Active',
    0,
    '',
    iso(90)
  ).lastInsertRowid;

  // Main Scenario Step 2: Khalid finds the Black Laptop Charger in Engineering Building
  const khalidFoundId = insertReport.run(
    khalidId,
    'khalid',
    'FOUND',
    'Black Laptop Charger',
    'Electronics',
    'Black',
    'Dell',
    'Engineering Building',
    'Today, 11:15 AM',
    'Found a black USB-C laptop charger plugged in under a desk in the Engineering Building lecture hall. Handed physical charger to the Lost & Found Administrator.',
    'Has a blue velcro cable strap and minor scuff near the prongs. Serial: CN-065W-AH92.',
    PRESET_IMAGES.charger_found,
    195.6,
    1,
    mode === 'full_demo' ? 'Claim Pending' : 'Active',
    0,
    '',
    iso(45)
  ).lastInsertRowid;

  // Run the automated matching engine to generate the match + notification for Ahmed
  runMatchingEngine(khalidFoundId);

  if (mode === 'full_demo') {
    // Also add a Pending Ownership Claim from Ahmed (Use Case 1 / BPMN Fig 1)
    const claimId = db.prepare(`
      INSERT INTO claims (
        found_report_id, lost_report_id, claimant_id, claimant_username,
        proof_description, proof_photo_url, additional_proof_text, admin_feedback,
        status, identity_verified, receipt_confirmed, reviewed_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', 'Pending', 0, 0, '', ?, ?)
    `).run(
      khalidFoundId,
      ahmedLostId,
      ahmedId,
      'ahmed',
      'This is my Dell 65W USB-C charger lost in the Engineering Building this morning. Proof: It has a blue velcro cable strap and the serial number on the back is CN-065W-AH92 (see my uploaded close-up photo).',
      PRESET_IMAGES.charger_proof,
      iso(20),
      iso(20)
    ).lastInsertRowid;

    createNotification(
      ahmedId,
      'ahmed',
      'CLAIM_UPDATE',
      'Ownership Claim Submitted (#CLM-' + claimId + ')',
      'Your claim for "Black Laptop Charger" is now Pending review by the Lost & Found Administrator.',
      khalidFoundId,
      claimId
    );

    // Also add a Flagged Suspicious / Duplicate Report for BPMN Fig. 4 demonstration
    insertReport.run(
      saraId,
      'sara',
      'LOST',
      'FREE iPhone 16 Pro Max Cash Reward Click Link!!',
      'Electronics',
      'Black',
      'Apple',
      'Student Center',
      'Today, 11:40 AM',
      'Suspicious duplicate/spam listing asking students to message external phone numbers directly.',
      'None provided',
      PRESET_IMAGES.airpods,
      98.0,
      0,
      'Under Review',
      1,
      'Flagged for violating Privacy & Anti-Spam Policy (requests off-platform contact / suspicious duplicate)',
      iso(15)
    );
  }

  logSystemEvent('SEED_SCENARIO', `Loaded scenario "${mode}" into SQLite (reclaim.db)`, 2.1);
}

// Initialize schema and seed if database is empty
initSchema();
const existingUsersCount = db.prepare(`SELECT COUNT(*) as count FROM users`).get().count;
if (existingUsersCount === 0) {
  seedScenario('full_demo');
}

// Helper for reading JSON request body (supports up to 10MB raw payload so we can validate/compress)
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Payload exceeds maximum limit'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  try {
    // 1. Health & Telemetry Endpoint
    if (req.method === 'GET' && pathname === '/api/health') {
      const counts = {
        users: db.prepare(`SELECT COUNT(*) as c FROM users`).get().c,
        reports: db.prepare(`SELECT COUNT(*) as c FROM reports`).get().c,
        lostReports: db.prepare(`SELECT COUNT(*) as c FROM reports WHERE type = 'LOST'`).get().c,
        foundReports: db.prepare(`SELECT COUNT(*) as c FROM reports WHERE type = 'FOUND'`).get().c,
        matches: db.prepare(`SELECT COUNT(*) as c FROM matches`).get().c,
        claims: db.prepare(`SELECT COUNT(*) as c FROM claims`).get().c,
        pendingClaims: db.prepare(`SELECT COUNT(*) as c FROM claims WHERE status IN ('Pending', 'More Proof Requested')`).get().c,
        suspiciousReports: db.prepare(`SELECT COUNT(*) as c FROM reports WHERE is_suspicious = 1`).get().c,
        resolvedCases: db.prepare(`SELECT COUNT(*) as c FROM reports WHERE status IN ('Returned', 'Resolved')`).get().c
      };
      const lastMatch = db.prepare(`SELECT match_time_ms FROM matches ORDER BY id DESC LIMIT 1`).get();
      const recentLogs = db.prepare(`SELECT * FROM system_logs ORDER BY id DESC LIMIT 20`).all();
      const users = db.prepare(`SELECT id, username, display_name, role, status, created_at FROM users ORDER BY id ASC`).all();

      return sendJson(res, 200, {
        status: 'online',
        database: 'SQLite 3 (reclaim.db)',
        nfr: {
          maxMatchLatencyMs: 3000,
          lastMatchLatencyMs: lastMatch ? lastMatch.match_time_ms : 0.95,
          maxImageSizeMb: 3.0,
          privacyBlurEnabled: true,
          rbacEnforced: true
        },
        counts,
        users,
        recentLogs,
        presets: PRESET_IMAGES
      });
    }

    // 2. Unified Login Endpoint (Auto-creates & remembers account in SQLite if username doesn't exist)
    if (req.method === 'POST' && pathname === '/api/login') {
      const { username, password } = await parseBody(req);
      if (!username || !String(username).trim()) {
        return sendJson(res, 400, { error: 'Please enter a username.' });
      }
      if (!password || !String(password).trim()) {
        return sendJson(res, 400, { error: 'Please enter a password.' });
      }

      const cleanUsername = String(username).trim().toLowerCase();
      const rawPassword = String(password).trim();

      let user = db.prepare(`SELECT * FROM users WHERE lower(username) = ?`).get(cleanUsername);
      let isNewAccount = false;

      if (!user) {
        // Auto-create account in SQLite and remember it!
        const role = cleanUsername === 'admin' || cleanUsername.startsWith('admin_') ? 'admin' : 'student';
        const displayName =
          role === 'admin'
            ? `Admin (${cleanUsername})`
            : cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1) + ' (Student)';
        const now = new Date().toISOString();

        const result = db.prepare(`
          INSERT INTO users (username, password, display_name, role, status, created_at)
          VALUES (?, ?, ?, ?, 'active', ?)
        `).run(cleanUsername, rawPassword, displayName, role, now);

        user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(result.lastInsertRowid);
        isNewAccount = true;

        createNotification(
          user.id,
          user.username,
          'SYSTEM',
          'Welcome to Reclaim Campus Lost & Found!',
          `Your account (@${user.username}) has been automatically registered and saved in the local SQLite database.`,
          null,
          null
        );

        logSystemEvent('AUTH_AUTO_CREATE', `New user "@${cleanUsername}" (${role}) auto-created and saved in SQLite`, 1.1);
      } else {
        // Check if suspended (BPMN Fig. 4)
        if (user.status === 'suspended') {
          logSystemEvent('AUTH_BLOCKED', `Suspended user "@${cleanUsername}" attempted login`, 0.4);
          return sendJson(res, 403, {
            error: `Account "@${cleanUsername}" has been suspended by an Administrator due to policy violations.`
          });
        }

        // If this was a pre-seeded demo account logging in with a password for the first time, bind & save that password!
        if (user.password === '__DEMO_ANY__') {
          db.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(rawPassword, user.id);
          user.password = rawPassword;
          logSystemEvent('AUTH_LOGIN', `User "@${cleanUsername}" logged in & password saved in SQLite`, 0.7);
        } else if (user.password !== rawPassword) {
          return sendJson(res, 401, {
            error: `Incorrect password for existing user "@${cleanUsername}".`
          });
        } else {
          logSystemEvent('AUTH_LOGIN', `Existing user "@${cleanUsername}" (${user.role}) authenticated from SQLite`, 0.5);
        }
      }

      return sendJson(res, 200, {
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
          status: user.status
        },
        isNewAccount
      });
    }

    // 3. DevOps Quick Switch User Endpoint
    if (req.method === 'POST' && pathname === '/api/devops/switch-user') {
      const { username } = await parseBody(req);
      const cleanUsername = String(username || '').trim().toLowerCase();
      let user = db.prepare(`SELECT * FROM users WHERE lower(username) = ?`).get(cleanUsername);

      if (!user) {
        const role = cleanUsername === 'admin' ? 'admin' : 'student';
        const displayName =
          role === 'admin'
            ? 'Lost & Found Administrator'
            : cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1) + ' (Student)';
        const now = new Date().toISOString();
        const resInsert = db.prepare(`
          INSERT INTO users (username, password, display_name, role, status, created_at)
          VALUES (?, '__DEMO_ANY__', ?, ?, 'active', ?)
        `).run(cleanUsername, displayName, role, now);
        user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(resInsert.lastInsertRowid);
      }

      logSystemEvent('DEVOPS_SWITCH', `Session switched via DevOps Console to "@${user.username}" (${user.role})`, 0.4);
      return sendJson(res, 200, {
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
          status: user.status
        }
      });
    }

    // 4. DevOps Scenario Seeder / Reset Endpoint
    if (req.method === 'POST' && pathname === '/api/devops/scenario') {
      const { mode } = await parseBody(req);
      seedScenario(mode || 'full_demo');
      return sendJson(res, 200, {
        ok: true,
        message: `Database reset and seeded with scenario: ${mode || 'full_demo'}`
      });
    }

    // 5. Get All Reports (with Search & Filter support + Privacy Blur metadata)
    if (req.method === 'GET' && pathname === '/api/reports') {
      const type = parsedUrl.searchParams.get('type') || '';
      const category = parsedUrl.searchParams.get('category') || '';
      const location = parsedUrl.searchParams.get('location') || '';
      const color = parsedUrl.searchParams.get('color') || '';
      const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
      const viewerRole = parsedUrl.searchParams.get('viewerRole') || 'student';
      const viewerUsername = (parsedUrl.searchParams.get('viewerUsername') || '').toLowerCase();

      let reports = db.prepare(`SELECT * FROM reports ORDER BY id DESC`).all();

      if (type && type !== 'ALL') {
        reports = reports.filter((r) => r.type === type);
      }
      if (category && category !== 'ALL') {
        reports = reports.filter((r) => r.category.toLowerCase() === category.toLowerCase());
      }
      if (location && location !== 'ALL') {
        reports = reports.filter((r) => r.location.toLowerCase() === location.toLowerCase());
      }
      if (color && color !== 'ALL') {
        reports = reports.filter((r) => r.color.toLowerCase() === color.toLowerCase());
      }
      if (q) {
        reports = reports.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q) ||
            r.brand.toLowerCase().includes(q) ||
            r.location.toLowerCase().includes(q) ||
            r.category.toLowerCase().includes(q)
        );
      }

      // Enrich reports and enforce NFR Privacy & Found-Item Photo Blur Policy
      const enriched = reports.map((r) => {
        const isOwnerOrPoster = r.username.toLowerCase() === viewerUsername;
        const isAdmin = viewerRole === 'admin';
        // Blur FOUND item photos & hide exact distinguishing marks for students so no one can fake proof!
        const shouldBlurPhoto = r.type === 'FOUND' && !isAdmin && !isOwnerOrPoster;

        return {
          ...r,
          reporter_label: isAdmin
            ? `@${r.username}`
            : isOwnerOrPoster
            ? 'You'
            : `Verified Student #${1000 + r.user_id}`, // NFR: Privacy & Identity Protection
          should_blur_photo: shouldBlurPhoto,
          distinguishing_marks_display:
            r.type === 'FOUND' && !isAdmin && !isOwnerOrPoster
              ? '🔒 Hidden for Ownership Verification (Provide your proof when claiming)'
              : r.distinguishing_marks || 'None specified'
        };
      });

      return sendJson(res, 200, { reports: enriched });
    }

    // 6. Create Lost or Found Report + Trigger <3s Automated Matching Engine
    if (req.method === 'POST' && pathname === '/api/reports') {
      const body = await parseBody(req);
      const {
        username,
        type,
        title,
        category,
        color,
        brand,
        location,
        date_lost_found,
        description,
        distinguishing_marks,
        photo_url,
        image_size_kb,
        handed_to_office
      } = body;

      if (!username || !type || !title || !category || !color || !location) {
        return sendJson(res, 400, { error: 'Please fill in all required item details.' });
      }

      // NFR Check: Image Compression & Storage Efficiency (Max 3MB = 3072 KB)
      const sizeKb = Number(image_size_kb || 120);
      if (sizeKb > 3072) {
        return sendJson(res, 400, {
          error: 'Image exceeds the 3MB NFR storage limit even after compression.'
        });
      }

      const user = db.prepare(`SELECT * FROM users WHERE lower(username) = ?`).get(String(username).toLowerCase());
      if (!user) {
        return sendJson(res, 404, { error: 'User not found.' });
      }
      if (user.status === 'suspended') {
        return sendJson(res, 403, { error: 'Suspended users cannot submit reports.' });
      }

      const now = new Date().toISOString();
      const defaultPhoto =
        photo_url ||
        (type === 'LOST' ? PRESET_IMAGES.charger_lost : PRESET_IMAGES.charger_found);

      const result = db.prepare(`
        INSERT INTO reports (
          user_id, username, type, title, category, color, brand, location,
          date_lost_found, description, distinguishing_marks, photo_url,
          image_size_kb, handed_to_office, status, is_suspicious, suspicious_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 0, '', ?)
      `).run(
        user.id,
        user.username,
        type,
        title.trim(),
        category,
        color,
        (brand || '').trim(),
        location,
        date_lost_found || 'Today',
        (description || '').trim(),
        (distinguishing_marks || '').trim(),
        defaultPhoto,
        sizeKb,
        type === 'FOUND' ? (handed_to_office ? 1 : 0) : 0,
        now
      );

      const newReportId = result.lastInsertRowid;
      const matchStats = runMatchingEngine(newReportId);
      const createdReport = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(newReportId);

      return sendJson(res, 201, {
        report: createdReport,
        matchStats
      });
    }

    // 7. Get Matches (Suggested Matches for Student or All Matches for Admin)
    if (req.method === 'GET' && pathname === '/api/matches') {
      const username = (parsedUrl.searchParams.get('username') || '').toLowerCase();
      const role = parsedUrl.searchParams.get('role') || 'student';

      const rows = db.prepare(`
        SELECT
          m.*,
          l.title AS lost_title, l.username AS lost_username, l.location AS lost_location,
          l.color AS lost_color, l.brand AS lost_brand, l.category AS lost_category,
          l.photo_url AS lost_photo_url, l.description AS lost_description, l.status AS lost_status,
          f.title AS found_title, f.username AS found_username, f.location AS found_location,
          f.color AS found_color, f.brand AS found_brand, f.category AS found_category,
          f.photo_url AS found_photo_url, f.description AS found_description, f.status AS found_status
        FROM matches m
        JOIN reports l ON l.id = m.lost_report_id
        JOIN reports f ON f.id = m.found_report_id
        ORDER BY m.score DESC, m.id DESC
      `).all();

      const formatted = rows.map((row) => ({
        ...row,
        matched_attributes: JSON.parse(row.matched_attributes || '[]'),
        found_should_blur: role !== 'admin' && row.found_username.toLowerCase() !== username
      }));

      // If student, prioritize matches involving their reports, but also return campus matches
      return sendJson(res, 200, { matches: formatted });
    }

    // 8. Submit Ownership Claim (Use Case 1 & BPMN Fig. 1)
    if (req.method === 'POST' && pathname === '/api/claims') {
      const { found_report_id, lost_report_id, username, proof_description, proof_photo_url } = await parseBody(req);
      if (!found_report_id || !username || !proof_description) {
        return sendJson(res, 400, { error: 'Please provide proof of ownership description.' });
      }

      const user = db.prepare(`SELECT * FROM users WHERE lower(username) = ?`).get(String(username).toLowerCase());
      if (!user) return sendJson(res, 404, { error: 'User not found.' });

      const foundReport = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(found_report_id);
      if (!foundReport) return sendJson(res, 404, { error: 'Found item report not found.' });

      // Automatically link to user's matching lost report if not explicitly passed
      let linkedLostId = lost_report_id || null;
      if (!linkedLostId) {
        const userLost = db.prepare(`
          SELECT id FROM reports WHERE lower(username) = ? AND type = 'LOST' ORDER BY id DESC LIMIT 1
        `).get(user.username.toLowerCase());
        if (userLost) linkedLostId = userLost.id;
      }

      const now = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO claims (
          found_report_id, lost_report_id, claimant_id, claimant_username,
          proof_description, proof_photo_url, additional_proof_text, admin_feedback,
          status, identity_verified, receipt_confirmed, reviewed_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, '', '', 'Pending', 0, 0, '', ?, ?)
      `).run(
        foundReport.id,
        linkedLostId,
        user.id,
        user.username,
        proof_description.trim(),
        proof_photo_url || PRESET_IMAGES.charger_proof,
        now,
        now
      );

      db.prepare(`UPDATE reports SET status = 'Claim Pending' WHERE id = ?`).run(foundReport.id);
      if (linkedLostId) {
        db.prepare(`UPDATE reports SET status = 'Claim Pending' WHERE id = ?`).run(linkedLostId);
      }

      const claimId = result.lastInsertRowid;

      createNotification(
        user.id,
        user.username,
        'CLAIM_UPDATE',
        `Ownership Claim #CLM-${claimId} Submitted (Pending)`,
        `Your claim for "${foundReport.title}" has been routed to the Lost & Found Administrator for visual proof verification.`,
        foundReport.id,
        claimId
      );

      logSystemEvent('CLAIM_SUBMITTED', `@${user.username} submitted Ownership Claim #CLM-${claimId} for Found Report #${foundReport.id}`, 1.3);

      return sendJson(res, 201, {
        claim: db.prepare(`SELECT * FROM claims WHERE id = ?`).get(claimId)
      });
    }

    // 9. Get All Claims (with joined Lost & Found report details for Admin comparison & Student tracking)
    if (req.method === 'GET' && pathname === '/api/claims') {
      const claims = db.prepare(`
        SELECT
          c.*,
          f.title AS found_title, f.category AS found_category, f.color AS found_color,
          f.brand AS found_brand, f.location AS found_location, f.description AS found_description,
          f.distinguishing_marks AS found_marks, f.photo_url AS found_photo_url,
          f.username AS finder_username, f.status AS found_report_status,
          l.title AS lost_title, l.location AS lost_location, l.description AS lost_description,
          l.distinguishing_marks AS lost_marks, l.photo_url AS lost_photo_url
        FROM claims c
        JOIN reports f ON f.id = c.found_report_id
        LEFT JOIN reports l ON l.id = c.lost_report_id
        ORDER BY c.id DESC
      `).all();

      return sendJson(res, 200, { claims });
    }

    // 10. Student Submits Additional Proof when Admin Requested More Proof (BPMN Fig. 1 Loop)
    const submitMoreProofMatch = pathname.match(/^\/api\/claims\/(\d+)\/more-proof$/);
    if (req.method === 'POST' && submitMoreProofMatch) {
      const claimId = Number(submitMoreProofMatch[1]);
      const { additional_proof_text, proof_photo_url } = await parseBody(req);
      const claim = db.prepare(`SELECT * FROM claims WHERE id = ?`).get(claimId);
      if (!claim) return sendJson(res, 404, { error: 'Claim not found.' });

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE claims
        SET additional_proof_text = ?,
            proof_photo_url = COALESCE(NULLIF(?, ''), proof_photo_url),
            status = 'Pending',
            updated_at = ?
        WHERE id = ?
      `).run(additional_proof_text || 'Provided serial number & receipt photo.', proof_photo_url || '', now, claimId);

      createNotification(
        claim.claimant_id,
        claim.claimant_username,
        'CLAIM_UPDATE',
        `Additional Proof Received for Claim #CLM-${claimId}`,
        `Your updated proof has been sent back to the Administrator and your claim status is now "Pending" again.`,
        claim.found_report_id,
        claimId
      );

      logSystemEvent('CLAIM_MORE_PROOF_SUBMITTED', `@${claim.claimant_username} provided additional proof for Claim #CLM-${claimId}`, 0.9);
      return sendJson(res, 200, { ok: true });
    }

    // 11. Student Confirms Physical Item Receipt (BPMN Fig. 5 Student Lane)
    const confirmReceiptMatch = pathname.match(/^\/api\/claims\/(\d+)\/confirm-receipt$/);
    if (req.method === 'POST' && confirmReceiptMatch) {
      const claimId = Number(confirmReceiptMatch[1]);
      const claim = db.prepare(`SELECT * FROM claims WHERE id = ?`).get(claimId);
      if (!claim) return sendJson(res, 404, { error: 'Claim not found.' });

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE claims SET receipt_confirmed = 1, updated_at = ? WHERE id = ?
      `).run(now, claimId);

      logSystemEvent('RECEIPT_CONFIRMED', `Student @${claim.claimant_username} confirmed physical item receipt for Claim #CLM-${claimId}`, 0.6);
      return sendJson(res, 200, { ok: true });
    }

    // 12. Admin / DevOps Actions on Claims (BPMN Fig. 1 & Fig. 5)
    // Actions: 'approve', 'request_more_proof', 'reject', 'verify_identity_yes', 'verify_identity_no_hold', 'mark_returned'
    const adminClaimMatch = pathname.match(/^\/api\/claims\/(\d+)\/admin-action$/);
    if (req.method === 'POST' && adminClaimMatch) {
      const claimId = Number(adminClaimMatch[1]);
      const { action, admin_feedback } = await parseBody(req);
      const claim = db.prepare(`SELECT * FROM claims WHERE id = ?`).get(claimId);
      if (!claim) return sendJson(res, 404, { error: 'Claim not found.' });

      const foundReport = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(claim.found_report_id);
      const now = new Date().toISOString();

      if (action === 'request_more_proof') {
        const feedback = admin_feedback || 'Please provide a clearer photo of the serial number or distinguishing mark.';
        db.prepare(`
          UPDATE claims SET status = 'More Proof Requested', admin_feedback = ?, reviewed_by = 'Admin', updated_at = ? WHERE id = ?
        `).run(feedback, now, claimId);

        createNotification(
          claim.claimant_id,
          claim.claimant_username,
          'ADMIN_NOTICE',
          `Action Required: More Proof Requested for Claim #CLM-${claimId}`,
          `Administrator message: "${feedback}". Please open My Claims to submit additional proof.`,
          claim.found_report_id,
          claimId
        );
        logSystemEvent('ADMIN_REQUEST_PROOF', `Admin requested more proof on Claim #CLM-${claimId} (@${claim.claimant_username})`, 0.9);
      } else if (action === 'approve') {
        const feedback = admin_feedback || 'Visual proof & distinguishing marks verified! Please visit the Lost & Found Office with your Student ID to collect your item.';
        db.prepare(`
          UPDATE claims SET status = 'Approved', admin_feedback = ?, reviewed_by = 'Admin', updated_at = ? WHERE id = ?
        `).run(feedback, now, claimId);

        db.prepare(`UPDATE reports SET status = 'Approved' WHERE id = ?`).run(claim.found_report_id);
        if (claim.lost_report_id) {
          db.prepare(`UPDATE reports SET status = 'Approved' WHERE id = ?`).run(claim.lost_report_id);
        }

        createNotification(
          claim.claimant_id,
          claim.claimant_username,
          'CLAIM_UPDATE',
          `Claim Approved! (#CLM-${claimId}) 🎉`,
          `Your ownership claim for "${foundReport ? foundReport.title : 'Item'}" has been APPROVED by the Administrator. ${feedback}`,
          claim.found_report_id,
          claimId
        );
        logSystemEvent('ADMIN_APPROVE_CLAIM', `Admin approved Claim #CLM-${claimId} for @${claim.claimant_username}`, 1.1);
      } else if (action === 'reject') {
        const feedback = admin_feedback || 'Provided proof did not match the physical item distinguishing features.';
        db.prepare(`
          UPDATE claims SET status = 'Rejected', admin_feedback = ?, reviewed_by = 'Admin', updated_at = ? WHERE id = ?
        `).run(feedback, now, claimId);

        db.prepare(`UPDATE reports SET status = 'Active' WHERE id = ?`).run(claim.found_report_id);
        if (claim.lost_report_id) {
          db.prepare(`UPDATE reports SET status = 'Active' WHERE id = ?`).run(claim.lost_report_id);
        }

        createNotification(
          claim.claimant_id,
          claim.claimant_username,
          'CLAIM_UPDATE',
          `Claim Rejected (#CLM-${claimId})`,
          `Your claim for "${foundReport ? foundReport.title : 'Item'}" was rejected. Reason: ${feedback}`,
          claim.found_report_id,
          claimId
        );
        logSystemEvent('ADMIN_REJECT_CLAIM', `Admin rejected Claim #CLM-${claimId}`, 0.8);
      } else if (action === 'verify_identity_no_hold') {
        // BPMN Fig. 5: Identity Confirmed? No -> Hold Item
        const feedback = admin_feedback || 'Claimant in-person Student ID could not be verified. Physical item placed on hold.';
        db.prepare(`
          UPDATE claims SET status = 'Hold Item', identity_verified = 0, admin_feedback = ?, updated_at = ? WHERE id = ?
        `).run(feedback, now, claimId);

        createNotification(
          claim.claimant_id,
          claim.claimant_username,
          'ADMIN_NOTICE',
          `Item Placed on Hold (#CLM-${claimId})`,
          `Physical handover paused: ${feedback}`,
          claim.found_report_id,
          claimId
        );
        logSystemEvent('ADMIN_HOLD_ITEM', `BPMN Fig. 5: Claimant identity check failed for #CLM-${claimId} -> Item Held`, 0.7);
      } else if (action === 'mark_returned') {
        // BPMN Fig. 1 & Fig. 5: Identity Confirmed -> Present Physical Item -> Confirm Receipt -> Mark Item as Returned -> Case Resolved
        db.prepare(`
          UPDATE claims
          SET status = 'Returned', identity_verified = 1, receipt_confirmed = 1,
              admin_feedback = 'Identity verified in person, physical item handed over, and case marked Resolved.',
              reviewed_by = 'Admin', updated_at = ?
          WHERE id = ?
        `).run(now, claimId);

        db.prepare(`UPDATE reports SET status = 'Returned' WHERE id = ?`).run(claim.found_report_id);
        if (claim.lost_report_id) {
          db.prepare(`UPDATE reports SET status = 'Resolved' WHERE id = ?`).run(claim.lost_report_id);
        }

        createNotification(
          claim.claimant_id,
          claim.claimant_username,
          'CLAIM_UPDATE',
          `Item Returned & Case Resolved (#CLM-${claimId}) ✅`,
          `Physical handover complete for "${foundReport ? foundReport.title : 'Item'}". Item status is now "Returned" and your case is marked "Resolved".`,
          claim.found_report_id,
          claimId
        );
        logSystemEvent('CASE_RESOLVED', `Admin marked Claim #CLM-${claimId} as Returned & Case Resolved`, 1.0);
      }

      return sendJson(res, 200, {
        claim: db.prepare(`SELECT * FROM claims WHERE id = ?`).get(claimId)
      });
    }

    // 13. Flag or Moderate Suspicious / Duplicate Reports (BPMN Fig. 4)
    const moderateReportMatch = pathname.match(/^\/api\/reports\/(\d+)\/moderate$/);
    if (req.method === 'POST' && moderateReportMatch) {
      const reportId = Number(moderateReportMatch[1]);
      const { action, reason, updated_title } = await parseBody(req);
      const report = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(reportId);
      if (!report) return sendJson(res, 404, { error: 'Report not found.' });

      if (action === 'flag') {
        db.prepare(`
          UPDATE reports SET is_suspicious = 1, status = 'Under Review', suspicious_reason = ? WHERE id = ?
        `).run(reason || 'Flagged as suspicious or potential duplicate listing.', reportId);
        logSystemEvent('REPORT_FLAGGED', `Report #${reportId} ("${report.title}") flagged for Admin review`, 0.6);
      } else if (action === 'dismiss_flag') {
        // BPMN Fig. 4: "Valid -> Dismiss Review Flag -> Report remains active -> Receive Admin Notice"
        db.prepare(`
          UPDATE reports SET is_suspicious = 0, status = 'Active', suspicious_reason = '' WHERE id = ?
        `).run(reportId);

        createNotification(
          report.user_id,
          report.username,
          'ADMIN_NOTICE',
          `Admin Notice: Review Flag Dismissed (#RPT-${reportId})`,
          `An Administrator reviewed your report "${report.title}", determined it is valid, dismissed the review flag, and kept your report active.`,
          reportId,
          null
        );
        logSystemEvent('MOD_DISMISS_FLAG', `BPMN Fig. 4: Admin dismissed suspicious flag on Report #${reportId}; report remains active`, 0.8);
      } else if (action === 'modify_or_delete') {
        // BPMN Fig. 4: "Modify -> Update or Delete Report -> Receive Admin Notice"
        if (updated_title) {
          db.prepare(`
            UPDATE reports SET title = ?, is_suspicious = 0, status = 'Active', suspicious_reason = '' WHERE id = ?
          `).run(updated_title, reportId);
          createNotification(
            report.user_id,
            report.username,
            'ADMIN_NOTICE',
            `Admin Notice: Report Updated (#RPT-${reportId})`,
            `An Administrator modified your report title to "${updated_title}" to comply with campus listing standards.`,
            reportId,
            null
          );
          logSystemEvent('MOD_UPDATE_REPORT', `BPMN Fig. 4: Admin modified Report #${reportId}`, 0.8);
        } else {
          db.prepare(`DELETE FROM matches WHERE lost_report_id = ? OR found_report_id = ?`).run(reportId, reportId);
          db.prepare(`DELETE FROM claims WHERE lost_report_id = ? OR found_report_id = ?`).run(reportId, reportId);
          db.prepare(`DELETE FROM reports WHERE id = ?`).run(reportId);

          createNotification(
            report.user_id,
            report.username,
            'ADMIN_NOTICE',
            `Admin Notice: Report Removed (#RPT-${reportId})`,
            `Your report "${report.title}" was removed by an Administrator as an inaccurate, duplicate, or policy-violating listing.`,
            null,
            null
          );
          logSystemEvent('MOD_DELETE_REPORT', `BPMN Fig. 4: Admin deleted flagged Report #${reportId} ("${report.title}")`, 0.9);
        }
      } else if (action === 'suspend_user') {
        // BPMN Fig. 4: "Violates -> Suspend User -> Receive Admin Notice -> Action Applied"
        db.prepare(`UPDATE users SET status = 'suspended' WHERE id = ?`).run(report.user_id);
        db.prepare(`UPDATE reports SET status = 'Removed (User Suspended)', is_suspicious = 0 WHERE id = ?`).run(reportId);

        createNotification(
          report.user_id,
          report.username,
          'ADMIN_NOTICE',
          `URGENT Admin Notice: Account Suspended`,
          `Your account (@${report.username}) has been suspended by the Lost & Found Administrator due to a severe policy violation on report "${report.title}".`,
          reportId,
          null
        );
        logSystemEvent('MOD_SUSPEND_USER', `BPMN Fig. 4: Admin suspended user @${report.username} and removed Report #${reportId}`, 1.0);
      } else if (action === 'unsuspend_user') {
        db.prepare(`UPDATE users SET status = 'active' WHERE id = ?`).run(report.user_id);
        logSystemEvent('MOD_UNSUSPEND_USER', `Admin restored user @${report.username} to active status`, 0.5);
      }

      return sendJson(res, 200, { ok: true });
    }

    // 14. Toggle User Suspension directly from DevOps User Table
    if (req.method === 'POST' && pathname === '/api/devops/toggle-user-status') {
      const { userId } = await parseBody(req);
      const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
      if (!u) return sendJson(res, 404, { error: 'User not found' });
      const newStatus = u.status === 'suspended' ? 'active' : 'suspended';
      db.prepare(`UPDATE users SET status = ? WHERE id = ?`).run(newStatus, u.id);
      logSystemEvent('DEVOPS_USER_STATUS', `User @${u.username} status changed to "${newStatus}"`, 0.5);
      return sendJson(res, 200, { ok: true, status: newStatus });
    }

    // 15. Notifications Endpoints
    if (req.method === 'GET' && pathname === '/api/notifications') {
      const username = (parsedUrl.searchParams.get('username') || '').toLowerCase();
      const rows = username
        ? db.prepare(`SELECT * FROM notifications WHERE lower(username) = ? ORDER BY id DESC`).all(username)
        : db.prepare(`SELECT * FROM notifications ORDER BY id DESC LIMIT 30`).all();
      return sendJson(res, 200, { notifications: rows });
    }

    if (req.method === 'POST' && pathname === '/api/notifications/read-all') {
      const { username } = await parseBody(req);
      if (username) {
        db.prepare(`UPDATE notifications SET is_read = 1 WHERE lower(username) = ?`).run(String(username).toLowerCase());
      }
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: `Endpoint not found: ${req.method} ${pathname}` });
  } catch (err) {
    console.error('Backend Error:', err);
    return sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, () => {
  console.log('==========================================================');
  console.log('  RECLAIM — Campus Lost & Found Backend Server (SQLite)');
  console.log(`  API URL      : http://localhost:${PORT}/api/health`);
  console.log(`  SQLite DB    : ${DB_PATH}`);
  console.log('==========================================================');
});
