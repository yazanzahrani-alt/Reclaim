const fs = require('node:fs');
const path = require('node:path');

function createMemoryDb() {
  const store = {
    users: [],
    reports: [],
    matches: [],
    claims: [],
    notifications: [],
    system_logs: []
  };

  let idGen = {
    users: 1,
    reports: 1,
    matches: 1,
    claims: 1,
    notifications: 1,
    system_logs: 1
  };

  return {
    exec(sql) {
      if (/DELETE FROM/i.test(sql)) {
        for (const k in store) {
          store[k] = [];
          idGen[k] = 1;
        }
      }
    },
    prepare(sql) {
      const cleanSql = sql.replace(/\s+/g, ' ').trim();

      return {
        run(...params) {
          // INSERT INTO users
          if (/INSERT INTO users/i.test(cleanSql)) {
            const [username, password, display_name, role, status, created_at] = params;
            const id = idGen.users++;
            store.users.push({ id, username, password, display_name, role: role || 'student', status: status || 'active', created_at });
            return { lastInsertRowid: id };
          }

          // INSERT INTO reports
          if (/INSERT INTO reports/i.test(cleanSql)) {
            const [
              user_id, username, type, title, category, color, brand, location,
              date_lost_found, description, distinguishing_marks, photo_url,
              image_size_kb, handed_to_office, status, is_suspicious, suspicious_reason, created_at
            ] = params;
            const id = idGen.reports++;
            store.reports.push({
              id, user_id, username, type, title, category, color, brand, location,
              date_lost_found, description, distinguishing_marks, photo_url,
              image_size_kb, handed_to_office, status: status || 'Active',
              is_suspicious: is_suspicious ? 1 : 0, suspicious_reason: suspicious_reason || '', created_at
            });
            return { lastInsertRowid: id };
          }

          // INSERT INTO matches
          if (/INSERT INTO matches/i.test(cleanSql)) {
            const [lost_report_id, found_report_id, score, matched_attributes, match_time_ms, created_at] = params;
            const id = idGen.matches++;
            store.matches.push({ id, lost_report_id, found_report_id, score, matched_attributes, match_time_ms, created_at });
            return { lastInsertRowid: id };
          }

          // INSERT INTO claims
          if (/INSERT INTO claims/i.test(cleanSql)) {
            const [
              found_report_id, lost_report_id, claimant_id, claimant_username,
              proof_description, proof_photo_url, additional_proof_text, admin_feedback,
              status, identity_verified, receipt_confirmed, reviewed_by, created_at, updated_at
            ] = params;
            const id = idGen.claims++;
            store.claims.push({
              id, found_report_id, lost_report_id, claimant_id, claimant_username,
              proof_description, proof_photo_url, additional_proof_text: additional_proof_text || '',
              admin_feedback: admin_feedback || '', status: status || 'Pending',
              identity_verified: identity_verified ? 1 : 0, receipt_confirmed: receipt_confirmed ? 1 : 0,
              reviewed_by: reviewed_by || '', created_at, updated_at
            });
            return { lastInsertRowid: id };
          }

          // INSERT INTO notifications
          if (/INSERT INTO notifications/i.test(cleanSql)) {
            const [user_id, username, type, title, message, related_report_id, related_claim_id, is_read, created_at] = params;
            const id = idGen.notifications++;
            store.notifications.push({ id, user_id, username, type, title, message, related_report_id, related_claim_id, is_read: is_read ? 1 : 0, created_at });
            return { lastInsertRowid: id };
          }

          // INSERT INTO system_logs
          if (/INSERT INTO system_logs/i.test(cleanSql)) {
            const [event_type, summary, latency_ms, created_at] = params;
            const id = idGen.system_logs++;
            store.system_logs.push({ id, event_type, summary, latency_ms, created_at });
            return { lastInsertRowid: id };
          }

          // UPDATE users
          if (/UPDATE users SET password = \? WHERE id = \?/i.test(cleanSql)) {
            const [pwd, id] = params;
            const u = store.users.find(x => x.id === id);
            if (u) u.password = pwd;
            return { changes: 1 };
          }
          if (/UPDATE users SET status = \? WHERE id = \?/i.test(cleanSql)) {
            const [st, id] = params;
            const u = store.users.find(x => x.id === id);
            if (u) u.status = st;
            return { changes: 1 };
          }

          // UPDATE reports
          if (/UPDATE reports SET status = \? WHERE id = \?/i.test(cleanSql)) {
            const [st, id] = params;
            const r = store.reports.find(x => x.id === id);
            if (r) r.status = st;
            return { changes: 1 };
          }
          if (/UPDATE reports SET is_suspicious = 1/i.test(cleanSql)) {
            const [reason, id] = params;
            const r = store.reports.find(x => x.id === id);
            if (r) {
              r.is_suspicious = 1;
              r.status = 'Under Review';
              r.suspicious_reason = reason;
            }
            return { changes: 1 };
          }
          if (/UPDATE reports SET is_suspicious = 0, status = 'Active'/i.test(cleanSql)) {
            const [id] = params;
            const r = store.reports.find(x => x.id === id);
            if (r) {
              r.is_suspicious = 0;
              r.status = 'Active';
              r.suspicious_reason = '';
            }
            return { changes: 1 };
          }
          if (/UPDATE reports SET title = \?, is_suspicious = 0/i.test(cleanSql)) {
            const [title, id] = params;
            const r = store.reports.find(x => x.id === id);
            if (r) {
              r.title = title;
              r.is_suspicious = 0;
              r.status = 'Active';
            }
            return { changes: 1 };
          }

          // UPDATE claims
          if (/UPDATE claims SET additional_proof_text/i.test(cleanSql)) {
            const [addText, photoUrl, updatedAt, id] = params;
            const c = store.claims.find(x => x.id === id);
            if (c) {
              c.additional_proof_text = addText;
              if (photoUrl) c.proof_photo_url = photoUrl;
              c.status = 'Pending';
              c.updated_at = updatedAt;
            }
            return { changes: 1 };
          }
          if (/UPDATE claims SET receipt_confirmed = 1/i.test(cleanSql)) {
            const [updatedAt, id] = params;
            const c = store.claims.find(x => x.id === id);
            if (c) {
              c.receipt_confirmed = 1;
              c.updated_at = updatedAt;
            }
            return { changes: 1 };
          }
          if (/UPDATE claims SET status = 'More Proof Requested'/i.test(cleanSql)) {
            const [fb, updatedAt, id] = params;
            const c = store.claims.find(x => x.id === id);
            if (c) {
              c.status = 'More Proof Requested';
              c.admin_feedback = fb;
              c.updated_at = updatedAt;
            }
            return { changes: 1 };
          }
          if (/UPDATE claims SET status = 'Approved'/i.test(cleanSql)) {
            const [fb, updatedAt, id] = params;
            const c = store.claims.find(x => x.id === id);
            if (c) {
              c.status = 'Approved';
              c.admin_feedback = fb;
              c.updated_at = updatedAt;
            }
            return { changes: 1 };
          }
          if (/UPDATE claims SET status = 'Rejected'/i.test(cleanSql)) {
            const [fb, updatedAt, id] = params;
            const c = store.claims.find(x => x.id === id);
            if (c) {
              c.status = 'Rejected';
              c.admin_feedback = fb;
              c.updated_at = updatedAt;
            }
            return { changes: 1 };
          }
          if (/UPDATE claims SET status = 'Hold Item'/i.test(cleanSql)) {
            const [fb, updatedAt, id] = params;
            const c = store.claims.find(x => x.id === id);
            if (c) {
              c.status = 'Hold Item';
              c.identity_verified = 0;
              c.admin_feedback = fb;
              c.updated_at = updatedAt;
            }
            return { changes: 1 };
          }
          if (/UPDATE claims SET status = 'Returned'/i.test(cleanSql)) {
            const [updatedAt, id] = params;
            const c = store.claims.find(x => x.id === id);
            if (c) {
              c.status = 'Returned';
              c.identity_verified = 1;
              c.receipt_confirmed = 1;
              c.updated_at = updatedAt;
            }
            return { changes: 1 };
          }

          // UPDATE notifications
          if (/UPDATE notifications SET is_read = 1/i.test(cleanSql)) {
            const [username] = params;
            for (const n of store.notifications) {
              if (n.username.toLowerCase() === String(username).toLowerCase()) {
                n.is_read = 1;
              }
            }
            return { changes: 1 };
          }

          // DELETE
          if (/DELETE FROM reports WHERE id = \?/i.test(cleanSql)) {
            const [id] = params;
            store.reports = store.reports.filter(r => r.id !== id);
            return { changes: 1 };
          }
          if (/DELETE FROM matches WHERE/i.test(cleanSql)) {
            const [id1, id2] = params;
            store.matches = store.matches.filter(m => m.lost_report_id !== id1 && m.found_report_id !== id2);
            return { changes: 1 };
          }
          if (/DELETE FROM claims WHERE/i.test(cleanSql)) {
            const [id1, id2] = params;
            store.claims = store.claims.filter(c => c.lost_report_id !== id1 && c.found_report_id !== id2);
            return { changes: 1 };
          }

          return { changes: 0, lastInsertRowid: 0 };
        },

        get(...params) {
          // COUNT queries
          if (/SELECT COUNT\(\*\) as c FROM users/i.test(cleanSql) || /SELECT COUNT\(\*\) as count FROM users/i.test(cleanSql)) {
            return { count: store.users.length, c: store.users.length };
          }
          if (/SELECT COUNT\(\*\) as c FROM reports WHERE type = 'LOST'/i.test(cleanSql)) {
            return { c: store.reports.filter(r => r.type === 'LOST').length };
          }
          if (/SELECT COUNT\(\*\) as c FROM reports WHERE type = 'FOUND'/i.test(cleanSql)) {
            return { c: store.reports.filter(r => r.type === 'FOUND').length };
          }
          if (/SELECT COUNT\(\*\) as c FROM reports WHERE is_suspicious = 1/i.test(cleanSql)) {
            return { c: store.reports.filter(r => r.is_suspicious === 1).length };
          }
          if (/SELECT COUNT\(\*\) as c FROM reports WHERE status IN \('Returned', 'Resolved'\)/i.test(cleanSql)) {
            return { c: store.reports.filter(r => r.status === 'Returned' || r.status === 'Resolved').length };
          }
          if (/SELECT COUNT\(\*\) as c FROM reports/i.test(cleanSql)) {
            return { c: store.reports.length };
          }
          if (/SELECT COUNT\(\*\) as c FROM matches/i.test(cleanSql)) {
            return { c: store.matches.length };
          }
          if (/SELECT COUNT\(\*\) as c FROM claims WHERE status IN/i.test(cleanSql)) {
            return { c: store.claims.filter(c => c.status === 'Pending' || c.status === 'More Proof Requested').length };
          }
          if (/SELECT COUNT\(\*\) as c FROM claims/i.test(cleanSql)) {
            return { c: store.claims.length };
          }

          // Single record queries
          if (/SELECT match_time_ms FROM matches/i.test(cleanSql)) {
            const m = store.matches[store.matches.length - 1];
            return m ? { match_time_ms: m.match_time_ms } : { match_time_ms: 0.95 };
          }

          if (/SELECT \* FROM users WHERE lower\(username\) = \?/i.test(cleanSql)) {
            const [username] = params;
            return store.users.find(u => u.username.toLowerCase() === String(username).toLowerCase()) || null;
          }
          if (/SELECT \* FROM users WHERE id = \?/i.test(cleanSql)) {
            const [id] = params;
            return store.users.find(u => u.id === id) || null;
          }

          if (/SELECT \* FROM reports WHERE id = \?/i.test(cleanSql)) {
            const [id] = params;
            return store.reports.find(r => r.id === id) || null;
          }
          if (/SELECT id FROM reports WHERE lower\(username\) = \? AND type = 'LOST'/i.test(cleanSql)) {
            const [username] = params;
            const r = store.reports.slice().reverse().find(x => x.username.toLowerCase() === String(username).toLowerCase() && x.type === 'LOST');
            return r ? { id: r.id } : null;
          }

          if (/SELECT id FROM matches WHERE lost_report_id = \? AND found_report_id = \?/i.test(cleanSql)) {
            const [lId, fId] = params;
            const m = store.matches.find(x => x.lost_report_id === lId && x.found_report_id === fId);
            return m ? { id: m.id } : null;
          }

          if (/SELECT \* FROM claims WHERE id = \?/i.test(cleanSql)) {
            const [id] = params;
            return store.claims.find(c => c.id === id) || null;
          }

          return null;
        },

        all(...params) {
          if (/SELECT \* FROM system_logs/i.test(cleanSql)) {
            return store.system_logs.slice(-20).reverse();
          }
          if (/SELECT id, username, display_name, role, status, created_at FROM users/i.test(cleanSql)) {
            return store.users;
          }
          if (/SELECT \* FROM reports WHERE type = \? AND status NOT IN/i.test(cleanSql)) {
            const [targetType] = params;
            return store.reports.filter(r => r.type === targetType && r.status !== 'Returned' && r.status !== 'Resolved' && r.is_suspicious === 0);
          }
          if (/SELECT \* FROM reports ORDER BY id DESC/i.test(cleanSql)) {
            return store.reports.slice().reverse();
          }

          if (/SELECT\s+m\.\*,\s+l\.title AS lost_title/i.test(cleanSql)) {
            return store.matches.slice().reverse().map(m => {
              const l = store.reports.find(r => r.id === m.lost_report_id) || {};
              const f = store.reports.find(r => r.id === m.found_report_id) || {};
              return {
                ...m,
                lost_title: l.title || '', lost_username: l.username || '', lost_location: l.location || '',
                lost_color: l.color || '', lost_brand: l.brand || '', lost_category: l.category || '',
                lost_photo_url: l.photo_url || '', lost_description: l.description || '', lost_status: l.status || '',
                found_title: f.title || '', found_username: f.username || '', found_location: f.location || '',
                found_color: f.color || '', found_brand: f.brand || '', found_category: f.category || '',
                found_photo_url: f.photo_url || '', found_description: f.description || '', found_status: f.status || ''
              };
            });
          }

          if (/SELECT\s+c\.\*,\s+f\.title AS found_title/i.test(cleanSql)) {
            return store.claims.slice().reverse().map(c => {
              const f = store.reports.find(r => r.id === c.found_report_id) || {};
              const l = store.reports.find(r => r.id === c.lost_report_id) || {};
              return {
                ...c,
                found_title: f.title || '', found_category: f.category || '', found_color: f.color || '',
                found_brand: f.brand || '', found_location: f.location || '', found_description: f.description || '',
                found_marks: f.distinguishing_marks || '', found_photo_url: f.photo_url || '',
                finder_username: f.username || '', found_report_status: f.status || '',
                lost_title: l.title || '', lost_location: l.location || '', lost_description: l.description || '',
                lost_marks: l.distinguishing_marks || '', lost_photo_url: l.photo_url || ''
              };
            });
          }

          if (/SELECT \* FROM notifications WHERE lower\(username\) = \?/i.test(cleanSql)) {
            const [username] = params;
            return store.notifications.filter(n => n.username.toLowerCase() === String(username).toLowerCase()).reverse();
          }
          if (/SELECT \* FROM notifications ORDER BY id DESC/i.test(cleanSql)) {
            return store.notifications.slice(-30).reverse();
          }

          return [];
        }
      };
    }
  };
}

function getDatabase(dbPath) {
  let sqliteModule = null;
  try {
    sqliteModule = require('node:sqlite');
  } catch (e) {
    console.warn('⚠️ node:sqlite is not available in current Node environment. Activating high-speed in-memory database adapter for Vercel Serverless.');
  }

  if (sqliteModule && sqliteModule.DatabaseSync) {
    try {
      const db = new sqliteModule.DatabaseSync(dbPath);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA foreign_keys = ON;');
      console.log('✅ SQLite engine connected:', dbPath);
      return { db, isMemory: false };
    } catch (e) {
      console.warn('⚠️ Failed to open file-based SQLite database:', e.message, '- falling back to in-memory store.');
    }
  }

  const memoryDb = createMemoryDb();
  return { db: memoryDb, isMemory: true };
}

module.exports = { getDatabase };
