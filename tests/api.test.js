'use strict';
// Integration tests: run the REAL backend request handler (real SQLite file, real routes,
// real password hashing) in-process, one fake HTTP request at a time.
const { Readable } = require('node:stream');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const dbFile = path.join(os.tmpdir(), `reclaim-test-${Date.now()}.db`);
process.env.RECLAIM_DB = dbFile;
const handler = require('../backend/server.js');

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name} ${detail}`); }
}

function api(method, p, { token, body, raw } = {}) {
  return new Promise((resolve) => {
    const payload = raw !== undefined ? raw : body ? JSON.stringify(body) : '';
    const req = Readable.from(payload ? [Buffer.from(payload)] : []);
    req.method = method;
    req.url = `/api${p}`;
    req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)), ...(token ? { authorization: `Bearer ${token}` } : {}) };
    req.socket = { remoteAddress: '127.0.0.1' };
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
      end(text = '') {
        let data = null;
        try { data = JSON.parse(text); } catch { /* none */ }
        resolve({ status: this.status, data });
      }
    };
    handler(req, res);
  });
}

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const THUMB = PNG;
const baseReport = (over = {}) => ({
  type: 'LOST', title: 'Black laptop charger', category: 'Electronics', color: 'Black', brand: 'Dell',
  location: 'Engineering Building', date_lost_found: new Date(Date.now() - 3600e3).toISOString(),
  description: 'Lost after the morning lecture in hall B2.', distinguishing_marks: 'Blue velcro strap, serial AH92',
  photo_url: PNG, photo_thumb_url: THUMB, handed_to_office: false, ...over
});

async function main() {
  try {
    console.log('\n[Fresh database]');
    let r = await api('POST', '/auth/login', { body: { username: 'admin', password: 'admin' } });
    check('admin/admin logs in', r.status === 200 && r.data.user.role === 'admin');
    const adminToken = r.data.token;
    r = await api('GET', '/admin/overview', { token: adminToken });
    check('only the admin account exists', r.data.users.length === 1 && r.data.users[0].username === 'admin');
    check('no reports / claims / matches', r.data.counts.reports === 0 && r.data.counts.claims === 0 && r.data.counts.matches === 0);
    for (const n of ['ahmed', 'khalid', 'sara']) {
      r = await api('POST', '/auth/login', { body: { username: n, password: 'anything1!' } });
      check(`no fake account "${n}"`, r.status === 404 && r.data.code === 'USER_NOT_FOUND');
    }
    r = await api('POST', '/auth/login', { body: { username: 'admin', password: 'wrong' } });
    check('admin with wrong password is rejected', r.status === 401);

    console.log('\n[Registration & password policy]');
    for (const [pw, why] of [['short1!', '7 chars'], ['nonumber!!', 'no number'], ['NoSpecial123', 'no special char'], ['abc 1234 ', 'only whitespace as special']]) {
      r = await api('POST', '/auth/register', { body: { username: 'yazan', password: pw, confirmPassword: pw } });
      check(`rejects weak password (${why})`, r.status === 400 && r.data.code === 'WEAK_PASSWORD', JSON.stringify(r.data));
    }
    r = await api('POST', '/auth/register', { body: { username: 'yazan', password: 'Good-pass1', confirmPassword: 'Different1!' } });
    check('rejects mismatched confirmation', r.status === 400 && r.data.code === 'PASSWORD_MISMATCH');
    r = await api('POST', '/auth/register', { body: { username: 'ad', password: 'Good-pass1' } });
    check('rejects too-short username', r.status === 400);
    r = await api('POST', '/auth/register', { body: { username: 'bad name!', password: 'Good-pass1' } });
    check('rejects username with illegal chars', r.status === 400);
    r = await api('POST', '/auth/register', { body: { username: 'Admin', password: 'Good-pass1' } });
    check('cannot register "Admin" (reserved/taken)', r.status === 403 || r.status === 409);
    r = await api('POST', '/auth/register', { body: { username: 'yazan', password: 'Good-pass1', confirmPassword: 'Good-pass1' } });
    check('registers yazan with a valid password', r.status === 201 && r.data.user.role === 'student');
    const yazanToken = r.data.token;

    console.log('\n[THE BUG: same username, two different passwords]');
    r = await api('POST', '/auth/login', { body: { username: 'yazan', password: 'Good-pass1' } });
    check('yazan + original password -> logs in', r.status === 200);
    r = await api('POST', '/auth/login', { body: { username: 'yazan', password: 'Other-pass2' } });
    check('yazan + DIFFERENT password -> rejected', r.status === 401, JSON.stringify(r.data));
    r = await api('POST', '/auth/login', { body: { username: 'YAZAN', password: 'Other-pass2' } });
    check('same, different letter case -> still rejected', r.status === 401);
    r = await api('POST', '/auth/register', { body: { username: 'YAZAN', password: 'Other-pass2!' } });
    check('cannot re-register the username (any case)', r.status === 409);
    r = await api('POST', '/auth/login', { body: { username: 'yazan', password: 'good-pass1' } });
    check('password is case-sensitive', r.status === 401);

    const dbText = Buffer.concat([dbFile, `${dbFile}-wal`].filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f)));
    check('plain-text password is not stored in the DB file', dbText.length > 0 && !dbText.includes('Good-pass1'));

    console.log('\n[Sessions]');
    r = await api('GET', '/reports');
    check('no token -> 401', r.status === 401);
    r = await api('GET', '/reports', { token: 'a'.repeat(64) });
    check('forged token -> 401', r.status === 401);
    r = await api('GET', '/auth/me', { token: yazanToken });
    check('valid token -> me', r.status === 200 && r.data.user.username === 'yazan');

    console.log('\n[Role enforcement]');
    for (const [m, p] of [['GET', '/admin/overview'], ['POST', '/admin/reset'], ['POST', '/admin/users/1/toggle-status'], ['POST', '/claims/1/admin-action'], ['POST', '/reports/1/moderate']]) {
      r = await api(m, p, { token: yazanToken, body: { confirm: 'WIPE', action: 'approve' } });
      check(`student blocked from ${m} ${p}`, r.status === 403, `got ${r.status}`);
    }

    console.log('\n[Reports, privacy & matching]');
    r = await api('POST', '/auth/register', { body: { username: 'khalid', password: 'Khalid-pw9', confirmPassword: 'Khalid-pw9' } });
    const khalidToken = r.data.token;
    r = await api('POST', '/reports', { token: yazanToken, body: baseReport() });
    check('yazan reports a lost item', r.status === 201 && r.data.report.type === 'LOST');
    const lostId = r.data.report.id;
    r = await api('POST', '/reports', { token: yazanToken, body: baseReport({ title: '', description: 'x' }) });
    check('invalid report rejected', r.status === 400);
    r = await api('POST', '/reports', { token: yazanToken, body: baseReport({ photo_url: 'javascript:alert(1)' }) });
    check('non-image photo rejected', r.status === 400);
    r = await api('POST', '/reports', { token: yazanToken, body: baseReport({ date_lost_found: new Date(Date.now() + 86400e3).toISOString() }) });
    check('future date rejected', r.status === 400);
    r = await api('POST', '/reports', { token: khalidToken, body: baseReport({ type: 'FOUND', title: 'Black Dell charger', handed_to_office: true, distinguishing_marks: 'SECRET-SERIAL-AH92' }) });
    check('khalid reports a found item and the matcher runs', r.status === 201 && r.data.matchStats.matchesFound === 1, JSON.stringify(r.data.matchStats));
    const foundId = r.data.report.id;
    r = await api('POST', '/reports', { token: khalidToken, body: baseReport({ type: 'FOUND', handed_to_office: false }) });
    check('found item requires office handover confirmation', r.status === 400);

    r = await api('GET', '/reports', { token: yazanToken });
    const seen = r.data.reports.find((x) => x.id === foundId);
    check("yazan sees khalid's found item as blurred", seen && seen.should_blur_photo === true);
    check('found-item private marks are NOT sent to other students', !JSON.stringify(r.data).includes('SECRET-SERIAL-AH92'));
    check("khalid's identity is not exposed to other students", seen && !/khalid/i.test(seen.reporter_label));
    r = await api('GET', '/reports', { token: adminToken });
    check('admin sees the private marks', JSON.stringify(r.data).includes('SECRET-SERIAL-AH92'));
    r = await api('GET', '/matches', { token: yazanToken });
    check('yazan (lost owner) has 1 match', r.data.matches.length === 1);
    r = await api('GET', '/matches', { token: khalidToken });
    check('finder does not see the owner match list', r.data.matches.length === 0);
    r = await api('GET', '/notifications', { token: yazanToken });
    check('match notification delivered to yazan', r.data.notifications.some((n) => n.type === 'MATCH'));

    console.log('\n[Claim workflow]');
    r = await api('POST', '/claims', { token: khalidToken, body: { found_report_id: foundId, proof_description: 'it is mine, trust me' } });
    check('finder cannot claim own found item', r.status === 400);
    r = await api('POST', '/claims', { token: yazanToken, body: { found_report_id: foundId, proof_description: 'short' } });
    check('too-short proof rejected', r.status === 400);
    r = await api('POST', '/claims', { token: yazanToken, body: { found_report_id: foundId, proof_description: 'Serial ends in AH92 and has a blue strap.', proof_photo_url: PNG } });
    check('yazan submits a claim', r.status === 201 && r.data.claim.status === 'Pending');
    check('claim response hides finder evidence', r.data.claim.found_marks === undefined && r.data.claim.found_photo_url === undefined);
    const claimId = r.data.claim.id;
    r = await api('POST', '/claims', { token: yazanToken, body: { found_report_id: foundId, proof_description: 'Second claim attempt here.' } });
    check('duplicate open claim blocked', r.status === 409);
    r = await api('GET', '/claims', { token: khalidToken });
    check("khalid cannot see yazan's claim", r.data.claims.length === 0);
    r = await api('POST', `/claims/${claimId}/confirm-receipt`, { token: yazanToken });
    check('cannot confirm receipt before approval', r.status === 409);
    r = await api('POST', `/claims/${claimId}/admin-action`, { token: adminToken, body: { action: 'mark_returned' } });
    check('admin cannot jump Pending -> Returned', r.status === 409);
    r = await api('POST', `/claims/${claimId}/admin-action`, { token: adminToken, body: { action: 'request_more_proof', admin_feedback: 'Send the serial photo' } });
    check('admin requests more proof', r.status === 200 && r.data.claim.status === 'More Proof Requested');
    r = await api('POST', `/claims/${claimId}/more-proof`, { token: khalidToken, body: { additional_proof_text: 'not my claim lol' } });
    check("someone else cannot answer yazan's claim", r.status === 403);
    r = await api('POST', `/claims/${claimId}/more-proof`, { token: yazanToken, body: { additional_proof_text: 'Photo of the serial attached.', additional_photo_url: PNG } });
    check('yazan provides more proof', r.status === 200);
    r = await api('POST', `/claims/${claimId}/admin-action`, { token: adminToken, body: { action: 'approve' } });
    check('admin approves', r.status === 200 && r.data.claim.status === 'Approved');
    r = await api('POST', `/claims/${claimId}/confirm-receipt`, { token: yazanToken });
    check('yazan confirms receipt', r.status === 200);
    r = await api('POST', `/claims/${claimId}/admin-action`, { token: adminToken, body: { action: 'mark_returned' } });
    check('admin marks returned', r.status === 200 && r.data.claim.status === 'Returned');
    r = await api('GET', '/stats', { token: yazanToken });
    check('resolved counter updated', r.data.counts.resolved >= 1);

    console.log('\n[Moderation & suspension]');
    r = await api('POST', '/auth/register', { body: { username: 'spammer', password: 'Spam-pass1!', confirmPassword: 'Spam-pass1!' } });
    const spamToken = r.data.token;
    r = await api('POST', '/reports', { token: spamToken, body: baseReport({ title: 'FREE iPhone click here', description: 'Message me on whatsapp for the free stuff' }) });
    const spamId = r.data.report.id;
    r = await api('POST', `/reports/${spamId}/flag`, { token: yazanToken, body: {} });
    check('student can flag a report', r.status === 200);
    r = await api('GET', '/reports', { token: khalidToken });
    check('flagged report hidden from other students', !r.data.reports.some((x) => x.id === spamId));
    r = await api('POST', `/reports/${spamId}/moderate`, { token: adminToken, body: { action: 'suspend_user' } });
    check('admin suspends the user', r.status === 200);
    r = await api('GET', '/auth/me', { token: spamToken });
    check('suspended user session is revoked immediately', r.status === 401);
    r = await api('POST', '/auth/login', { body: { username: 'spammer', password: 'Spam-pass1!' } });
    check('suspended user cannot log in', r.status === 403);

    console.log('\n[Brute force protection]');
    for (let i = 0; i < 5; i += 1) await api('POST', '/auth/login', { body: { username: 'khalid', password: 'bad-guess' + i } });
    r = await api('POST', '/auth/login', { body: { username: 'khalid', password: 'Khalid-pw9' } });
    check('account locks after 5 wrong passwords (even with the right one)', r.status === 429, `got ${r.status}`);

    console.log('\n[Input hardening]');
    r = await api('POST', '/auth/login', { raw: '{not json' });
    check('malformed JSON -> 400, not a crash', r.status === 400);
    r = await api('GET', '/nope', { token: adminToken });
    check('unknown endpoint -> 404', r.status === 404);
    r = await api('POST', '/reports', { token: yazanToken, body: baseReport({ title: '<img src=x onerror=alert(1)>' }) });
    check('HTML in a title is accepted as plain text (escaped by the UI)', r.status === 201);

    console.log('\n[DevOps wipe]');
    r = await api('POST', '/admin/reset', { token: adminToken, body: {} });
    check('wipe requires confirmation', r.status === 400);
    r = await api('POST', '/admin/reset', { token: adminToken, body: { confirm: 'WIPE' } });
    check('wipe succeeds', r.status === 200);
    r = await api('GET', '/admin/overview', { token: adminToken });
    check('after wipe: only admin remains, zero data', r.data.users.length === 1 && r.data.counts.reports === 0 && r.data.counts.claims === 0 && r.data.counts.matches === 0);
    r = await api('POST', '/auth/login', { body: { username: 'yazan', password: 'Good-pass1' } });
    check('wiped accounts no longer exist', r.status === 404);
    r = await api('GET', '/auth/me', { token: adminToken });
    check('admin stays signed in after wipe', r.status === 200);
  } finally {
    for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
