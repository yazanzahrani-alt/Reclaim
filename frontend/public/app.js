'use strict';

// ============================================================================
// Reclaim — frontend
// All permissions are enforced by the server; this file only renders what the
// server allows the signed-in user to see.
// ============================================================================

// Local dev: frontend on :3000 talks to the backend on :5000. When deployed, /api is same-origin.
const API_BASE = window.location.port === '3000'
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : '/api';

const TOKEN_KEY = 'reclaim_token';

let token = localStorage.getItem(TOKEN_KEY) || '';
let currentUser = null;
let meta = { categories: [], colors: [], locations: [] };
let stats = null;
let overview = null;
let allReports = [];
let allMatches = [];
let allClaims = [];
let userNotifications = [];
let authMode = 'signin'; // 'signin' | 'register'

// Photo state (data URLs). `thumb` is a tiny preview used for privacy blur.
const photos = {
  report: { url: '', thumb: '', kb: 0 },
  claim: { url: '', thumb: '', kb: 0 },
  more: { url: '', thumb: '', kb: 0 }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, kind = 'info') {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast${kind === 'error' ? ' toast-error' : ''}`;
  toast.textContent = message; // textContent: never interprets HTML
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4800);
}

function formatWhen(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('Cannot reach the server. Make sure the backend is running (npm run dev:backend).');
  }

  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }

  if (res.status === 401 && auth && token) {
    forceSignedOut('Your session has expired. Please sign in again.');
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed.');
    err.code = data.code;
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  $('login-form').addEventListener('submit', handleAuthSubmit);
  $('login-back').addEventListener('click', () => setAuthMode('signin'));
  $('toggle-password').addEventListener('click', togglePasswordVisibility);
  ['login-password', 'login-confirm'].forEach((id) => $(id).addEventListener('input', updatePasswordRules));
  $('login-username').addEventListener('input', () => {
    if (authMode === 'register') return;
    hide($('login-error'));
  });
  $('create-report-form').addEventListener('submit', handleCreateReportSubmit);
  $('submit-claim-form').addEventListener('submit', handleSubmitClaim);
  $('more-proof-form').addEventListener('submit', handleMoreProofSubmit);
  document.addEventListener('click', handleDelegatedClick);

  try {
    meta = await api('/meta', { auth: false });
    fillSelect('filter-category', meta.categories, 'All categories');
    fillSelect('filter-location', meta.locations, 'All buildings');
    fillSelect('filter-color', meta.colors, 'All colors');
    fillSelect('rep-category', meta.categories);
    fillSelect('rep-color', meta.colors);
    fillSelect('rep-location', meta.locations);
  } catch (err) {
    showLoginError(err.message);
  }

  resetReportForm();

  if (token) {
    try {
      const data = await api('/auth/me');
      currentUser = data.user;
      await enterAppShell();
    } catch {
      forceSignedOut();
    }
  }

  // Keep data fresh without disturbing anything the user is typing.
  setInterval(() => {
    if (!currentUser || document.hidden) return;
    const el = document.activeElement;
    if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    refreshAllData();
  }, 30000);
});

function fillSelect(id, values, allLabel) {
  const select = $(id);
  const options = allLabel ? [`<option value="ALL">${escapeHtml(allLabel)}</option>`] : [];
  values.forEach((v) => options.push(`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
  select.innerHTML = options.join('');
}

const hide = (el) => el.classList.add('hidden');
const show = (el) => el.classList.remove('hidden');

// ---------------------------------------------------------------------------
// Sign in / create account
// ---------------------------------------------------------------------------
function showLoginError(message) {
  const box = $('login-error');
  box.textContent = message;
  show(box);
}

function togglePasswordVisibility() {
  const input = $('login-password');
  const confirm = $('login-confirm');
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  confirm.type = reveal ? 'text' : 'password';
  $('toggle-password').textContent = reveal ? 'Hide' : 'Show';
}

function setAuthMode(mode, notice = '') {
  authMode = mode;
  const register = mode === 'register';
  $('register-extra').classList.toggle('hidden', !register);
  $('login-back').classList.toggle('hidden', !register);
  $('login-title').textContent = register ? 'Create your account' : 'Sign in to Reclaim';
  $('login-subtitle').textContent = register
    ? 'Choose a password and confirm it. Your account is created the moment you submit.'
    : "Enter your username and password. New here? Type a new username and we'll help you create the account.";
  $('login-submit').textContent = register ? 'Create account' : 'Sign in';
  $('login-password').autocomplete = register ? 'new-password' : 'current-password';
  $('login-username').readOnly = register;
  hide($('login-error'));
  const noticeBox = $('login-notice');
  if (notice) { noticeBox.textContent = notice; show(noticeBox); } else { hide(noticeBox); }
  if (register) {
    $('login-confirm').value = '';
    updatePasswordRules();
    $('login-password').focus();
  } else {
    $('login-username').readOnly = false;
    $('login-password').value = '';
    $('login-confirm').value = '';
    $('login-username').focus();
  }
}

function passwordChecks(password, confirm) {
  return {
    length: password.length >= 8,
    number: /\d/.test(password),
    special: /[^A-Za-z0-9\s]/.test(password),
    match: password.length > 0 && password === confirm
  };
}

function updatePasswordRules() {
  const checks = passwordChecks($('login-password').value, $('login-confirm').value);
  document.querySelectorAll('#pw-rules .pw-rule').forEach((li) => {
    const ok = checks[li.dataset.rule];
    li.classList.toggle('ok', ok);
    li.querySelector('.pw-rule-mark').textContent = ok ? '✓' : '○';
  });
  return checks;
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  hide($('login-error'));

  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  const submit = $('login-submit');

  if (!username) return showLoginError('Enter a username.');
  if (!password) return showLoginError('Enter a password.');

  submit.disabled = true;
  try {
    let data;
    if (authMode === 'register') {
      const checks = updatePasswordRules();
      if (!checks.length || !checks.number || !checks.special) {
        throw new Error('Your password must have at least 8 characters, one number and one special character.');
      }
      if (!checks.match) throw new Error('The two passwords do not match.');
      data = await api('/auth/register', {
        method: 'POST',
        auth: false,
        body: { username, password, confirmPassword: $('login-confirm').value }
      });
    } else {
      data = await api('/auth/login', { method: 'POST', auth: false, body: { username, password } });
    }

    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    currentUser = data.user;
    $('login-password').value = '';
    $('login-confirm').value = '';
    setAuthMode('signin');
    showToast(data.isNewAccount ? `Account created. Welcome, ${currentUser.username}!` : `Welcome back, ${currentUser.username}.`);
    await enterAppShell();
  } catch (err) {
    if (err.code === 'USER_NOT_FOUND' && authMode === 'signin') {
      setAuthMode('register', `"${username}" is a new username. Confirm your password below to create the account.`);
      return;
    }
    showLoginError(err.message);
  } finally {
    submit.disabled = false;
  }
}

function resetAppState() {
  currentUser = null;
  stats = null;
  overview = null;
  allReports = [];
  allMatches = [];
  allClaims = [];
  userNotifications = [];
}

function forceSignedOut(message = '') {
  token = '';
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('reclaim_user'); // legacy key from the old prototype
  resetAppState();
  hide($('app-shell'));
  hide($('devops-floating-btn'));
  hide($('devops-overlay'));
  show($('login-screen'));
  setAuthMode('signin');
  if (message) showLoginError(message);
}

async function handleLogout() {
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* already signed out */ }
  forceSignedOut();
  showToast('You have been signed out.');
}

async function enterAppShell() {
  hide($('login-screen'));
  show($('app-shell'));
  updateUserHeader();
  await refreshAllData();

  const isAdmin = currentUser.role === 'admin';
  $('devops-floating-btn').classList.toggle('hidden', !isAdmin);
  if (isAdmin) {
    switchView('admin');
    toggleDevOpsModal(true); // administrators land directly in the DevOps console
  } else {
    hide($('devops-overlay'));
    switchView('home');
  }
}

function updateUserHeader() {
  const isAdmin = currentUser.role === 'admin';
  $('header-user-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
  $('header-username').textContent = `@${currentUser.username}`;
  $('header-user-role').textContent = isAdmin ? '🛡️ Administrator' : '🎓 Student';
  $('nav-admin-tab').classList.toggle('hidden', !isAdmin);
  $('welcome-headline').textContent = `Welcome, ${currentUser.username}`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
async function refreshAllData() {
  if (!currentUser) return;
  try {
    const isAdmin = currentUser.role === 'admin';
    const [statsRes, reportsRes, matchesRes, claimsRes, notifsRes, overviewRes] = await Promise.all([
      api('/stats'),
      api('/reports'),
      api('/matches'),
      api('/claims'),
      api('/notifications'),
      isAdmin ? api('/admin/overview') : Promise.resolve(null)
    ]);
    stats = statsRes;
    allReports = reportsRes.reports;
    allMatches = matchesRes.matches;
    allClaims = claimsRes.claims;
    userNotifications = notifsRes.notifications;
    overview = overviewRes;

    renderStatsAndBadges();
    renderHomeView();
    applySearchFilters();
    renderClaimsAndMatchesView();
    renderAdminWorkspaceView();
    renderNotificationsDrawer();
    renderDevOpsConsole();
  } catch (err) {
    if (currentUser) showToast(err.message, 'error');
  }
}

function renderStatsAndBadges() {
  if (!stats) return;
  $('stat-total-reports').textContent = stats.counts.reports;
  $('stat-total-matches').textContent = stats.counts.matches;
  $('stat-match-speed').textContent = stats.lastMatchLatencyMs === null ? '—' : `${stats.lastMatchLatencyMs} ms`;
  $('stat-resolved-cases').textContent = stats.counts.resolved;

  const unread = userNotifications.filter((n) => !n.is_read).length;
  $('notif-unread-badge').textContent = unread;
  $('notif-unread-badge').classList.toggle('hidden', unread === 0);

  const adminTotal = stats.counts.pendingClaims + stats.counts.flagged;
  $('nav-admin-badge').textContent = adminTotal;
  $('devops-fab-badge').textContent = adminTotal;
  $('devops-fab-badge').classList.toggle('hidden', adminTotal === 0);

  const mine = allClaims.filter((c) => c.claimant_id === currentUser.id).length;
  const navClaims = mine + (currentUser.role === 'admin' ? 0 : allMatches.length);
  $('nav-claims-badge').textContent = navClaims;
  $('nav-claims-badge').classList.toggle('hidden', navClaims === 0);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function switchView(name) {
  document.querySelectorAll('.view-section').forEach((el) => hide(el));
  const target = $(`view-${name}`);
  if (target) show(target);
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
}

function openReportForm(type) {
  switchView('report');
  setReportFormType(type);
}

// ---------------------------------------------------------------------------
// Rendering: matches & reports
// ---------------------------------------------------------------------------
function emptyState(text) {
  return `<div class="alert-box">${escapeHtml(text)}</div>`;
}

function buildMatchCardHtml(m) {
  const tags = (m.matched_attributes || []).map((t) => `<span class="match-attr-tag">✓ ${escapeHtml(t)}</span>`).join('');
  const closed = ['Returned', 'Resolved'].includes(m.found_status);
  const action = closed
    ? '<span class="btn btn-sm" style="background:#d1fae5;color:#047857;">✅ Returned</span>'
    : `<button class="btn btn-primary btn-sm" data-action="claim" data-id="${m.found_report_id}" data-lost="${m.lost_report_id}">🛡️ Submit ownership claim</button>`;

  return `
    <div class="match-card">
      <div class="match-header">
        <span class="match-score-pill">⚡ ${m.score}% match</span>
        <span class="match-speed-tag">Matched in ${m.match_time_ms} ms</span>
      </div>
      <div class="match-compare-row">
        <div class="match-side">
          <span class="match-side-title" style="color:#dc2626;">📢 Lost report #${m.lost_report_id}</span>
          <strong>${escapeHtml(m.lost_title)}</strong>
          <div style="font-size:12px;color:#475569;margin-top:4px;">📍 ${escapeHtml(m.lost_location)} • ${escapeHtml(m.lost_color)} • ${escapeHtml(m.lost_brand || 'No brand')}</div>
        </div>
        <div class="match-side">
          <span class="match-side-title" style="color:#059669;">📦 Found report #${m.found_report_id}</span>
          <strong>${escapeHtml(m.found_title)}</strong>
          <div style="font-size:12px;color:#475569;margin-top:4px;">📍 ${escapeHtml(m.found_location)} • ${escapeHtml(m.found_color)}</div>
        </div>
      </div>
      <div class="match-tags-row">${tags}</div>
      <div class="match-footer">
        <span style="font-size:12px;color:#64748b;">Status: <strong>${escapeHtml(m.found_status)}</strong></span>
        <div style="display:flex;gap:8px;">${action}</div>
      </div>
    </div>`;
}

function buildReportCardHtml(r) {
  const photo = r.photo_url
    ? `<img src="${escapeHtml(r.photo_url)}" alt="" />`
    : '<div class="no-photo">No photo</div>';
  const overlay = r.should_blur_photo
    ? `<div class="privacy-blur-overlay">
         <span class="privacy-blur-pill">🔒 Photo hidden for privacy</span>
         <span class="privacy-blur-sub">Only the finder and administrators can see this photo, to prevent false claims.</span>
       </div>`
    : '';
  const banner = r.is_suspicious
    ? `<div class="alert-box alert-warn" style="margin-top:10px;font-size:11.5px;">🚨 <strong>Under review:</strong> ${escapeHtml(r.suspicious_reason || 'An administrator is reviewing this report.')}</div>`
    : '';
  const closed = ['Returned', 'Resolved'].includes(r.status);
  const canClaim = r.type === 'FOUND' && !r.is_mine && !closed && !r.is_suspicious && ['Active', 'Claim Pending'].includes(r.status);

  const buttons = [];
  if (canClaim) buttons.push(`<button class="btn btn-primary btn-sm" data-action="claim" data-id="${r.id}">Submit claim</button>`);
  if (!r.is_mine && !r.is_suspicious) buttons.push(`<button class="btn btn-outline btn-sm" title="Flag as suspicious or duplicate" data-action="flag" data-id="${r.id}">🚩</button>`);
  if (r.is_mine && !closed) buttons.push(`<button class="btn btn-outline btn-sm" title="Delete my report" data-action="delete-report" data-id="${r.id}">🗑️</button>`);

  return `
    <div class="report-card ${r.is_suspicious ? 'suspicious-card' : ''}">
      <div class="report-img-wrap ${r.should_blur_photo ? 'privacy-blurred' : ''}">
        <div class="report-badges-top">
          <span class="type-badge ${r.type}">${r.type === 'LOST' ? '📢 LOST' : '📦 FOUND'}</span>
          <span class="status-badge">${escapeHtml(r.status)}</span>
        </div>
        ${photo}
        ${overlay}
      </div>
      <div class="report-body">
        <div>
          <h4 class="report-title">${escapeHtml(r.title)}</h4>
          <div class="report-meta-tags">
            <span class="meta-pill">📍 ${escapeHtml(r.location)}</span>
            <span class="meta-pill">🏷️ ${escapeHtml(r.category)}</span>
            <span class="meta-pill">🎨 ${escapeHtml(r.color)}</span>
            ${r.brand ? `<span class="meta-pill">✨ ${escapeHtml(r.brand)}</span>` : ''}
          </div>
          <p class="report-desc">${escapeHtml(r.description)}</p>
          <div class="report-marks-box"><strong>Distinguishing marks:</strong> ${escapeHtml(r.distinguishing_marks_display)}</div>
          ${banner}
        </div>
        <div class="report-footer">
          <span class="reporter-privacy-tag">👤 ${escapeHtml(r.reporter_label)} • ${escapeHtml(formatWhen(r.date_lost_found))}</span>
          <div style="display:flex;gap:6px;">${buttons.join('')}</div>
        </div>
      </div>
    </div>`;
}

function renderHomeView() {
  const isAdmin = currentUser.role === 'admin';
  $('home-matches-container').innerHTML = allMatches.length
    ? allMatches.slice(0, 4).map(buildMatchCardHtml).join('')
    : emptyState(isAdmin
      ? 'No matches yet. They appear automatically when a lost and a found report look alike.'
      : 'No matches yet. If you report a lost item, any matching found item will show up here.');

  const visible = allReports.filter((r) => !r.is_suspicious || r.is_mine || isAdmin);
  $('home-reports-container').innerHTML = visible.length
    ? visible.slice(0, 6).map(buildReportCardHtml).join('')
    : emptyState('No reports yet. Be the first — report a lost or found item.');
}

function applySearchFilters() {
  if (!currentUser) return;
  const q = ($('filter-q').value || '').trim().toLowerCase();
  const type = $('filter-type').value;
  const category = $('filter-category').value;
  const location = $('filter-location').value;
  const color = $('filter-color').value;
  const isAdmin = currentUser.role === 'admin';

  let list = allReports.filter((r) => !r.is_suspicious || r.is_mine || isAdmin);
  if (type !== 'ALL') list = list.filter((r) => r.type === type);
  if (category !== 'ALL') list = list.filter((r) => r.category === category);
  if (location !== 'ALL') list = list.filter((r) => r.location === location);
  if (color !== 'ALL') list = list.filter((r) => r.color === color);
  if (q) {
    list = list.filter((r) => [r.title, r.description, r.brand, r.location, r.category].some((f) => String(f || '').toLowerCase().includes(q)));
  }

  $('browse-reports-container').innerHTML = list.length
    ? list.map(buildReportCardHtml).join('')
    : emptyState(allReports.length ? 'No items match your filters.' : 'No reports yet.');
}

function resetSearchFilters() {
  $('filter-q').value = '';
  ['filter-type', 'filter-category', 'filter-location', 'filter-color'].forEach((id) => { $(id).value = 'ALL'; });
  applySearchFilters();
}

// ---------------------------------------------------------------------------
// Reporting an item
// ---------------------------------------------------------------------------
function nowForInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function resetReportForm() {
  $('create-report-form').reset();
  $('rep-date').value = nowForInput();
  $('rep-date').max = nowForInput();
  clearPhoto('report');
  setReportFormType($('report-type-input').value || 'LOST');
}

function setReportFormType(type) {
  $('report-type-input').value = type;
  const found = type === 'FOUND';
  $('tab-btn-lost').className = `type-switch-btn${found ? '' : ' active-lost'}`;
  $('tab-btn-found').className = `type-switch-btn${found ? ' active-found' : ''}`;
  $('found-handover-box').classList.toggle('hidden', !found);
  $('report-form-banner').innerHTML = found
    ? '<strong>Found item:</strong> Hand the item to the Lost &amp; Found office. Your photo and marks stay hidden from other students so nobody can fake a claim.'
    : '<strong>Lost item:</strong> Give as many details as you can. Reclaim compares your report with every found item and notifies you about matches.';
}

function clearPhoto(target) {
  photos[target] = { url: '', thumb: '', kb: 0 };
  const map = {
    report: ['rep-photo-preview', 'rep-photo-empty', 'rep-file-input'],
    claim: ['claim-photo-preview', 'claim-photo-empty', null],
    more: ['more-proof-photo-preview', 'more-proof-photo-empty', null]
  }[target];
  const img = $(map[0]);
  img.removeAttribute('src');
  hide(img);
  show($(map[1]));
  if (map[2]) $(map[2]).value = '';
  if (target === 'report') $('compression-telemetry').textContent = 'No photo selected';
}

// Compresses a picked image in the browser (max 900px, JPEG) and builds a tiny preview used for privacy blur.
function handleImageUpload(event, target) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    showToast('Please choose a JPEG, PNG or WebP image.', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const draw = (maxDim, quality) => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', quality);
      };
      const url = draw(900, 0.82);
      const thumb = draw(20, 0.5);
      const kb = Math.round((url.length * 0.75) / 1024);
      photos[target] = { url, thumb, kb };

      const previewIds = {
        report: ['rep-photo-preview', 'rep-photo-empty'],
        claim: ['claim-photo-preview', 'claim-photo-empty'],
        more: ['more-proof-photo-preview', 'more-proof-photo-empty']
      }[target];
      $(previewIds[0]).src = url;
      show($(previewIds[0]));
      hide($(previewIds[1]));
      if (target === 'report') {
        $('compression-telemetry').textContent = `Compressed ${(file.size / 1024).toFixed(0)} KB → ${kb} KB`;
      }
    };
    img.onerror = () => showToast('That image could not be read.', 'error');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function handleCreateReportSubmit(e) {
  e.preventDefault();
  const type = $('report-type-input').value;
  if (type === 'FOUND' && !$('rep-handed').checked) {
    return showToast('Please confirm that you are handing the item to the Lost & Found office.', 'error');
  }
  const when = new Date($('rep-date').value);
  if (Number.isNaN(when.getTime())) return showToast('Enter a valid date and time.', 'error');

  const submit = $('report-submit');
  submit.disabled = true;
  try {
    const res = await api('/reports', {
      method: 'POST',
      body: {
        type,
        title: $('rep-title').value,
        category: $('rep-category').value,
        color: $('rep-color').value,
        brand: $('rep-brand').value,
        location: $('rep-location').value,
        date_lost_found: when.toISOString(),
        description: $('rep-description').value,
        distinguishing_marks: $('rep-marks').value,
        photo_url: photos.report.url,
        photo_thumb_url: photos.report.thumb,
        handed_to_office: type === 'FOUND' && $('rep-handed').checked
      }
    });
    const n = res.matchStats.matchesFound;
    showToast(n > 0
      ? `Report saved. ${n} possible match${n === 1 ? '' : 'es'} found in ${res.matchStats.executionTimeMs} ms.`
      : 'Report saved. We will notify you if a match appears.');
    resetReportForm();
    await refreshAllData();
    switchView(n > 0 && type === 'LOST' ? 'claims' : 'home');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submit.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Claims (student side)
// ---------------------------------------------------------------------------
function openClaimModal(foundId, lostId) {
  const found = allReports.find((r) => r.id === foundId) || allMatches.find((m) => m.found_report_id === foundId);
  const title = found ? (found.title || found.found_title) : `#${foundId}`;
  $('claim-found-report-id').value = foundId;
  $('claim-lost-report-id').value = lostId || '';
  $('claim-modal-subtitle').textContent = `Claiming found item #${foundId}: "${title}". Only the real owner can describe it accurately.`;
  $('claim-proof-text').value = '';
  clearPhoto('claim');
  show($('claim-modal'));
}

function closeClaimModal() { hide($('claim-modal')); }

async function handleSubmitClaim(e) {
  e.preventDefault();
  try {
    await api('/claims', {
      method: 'POST',
      body: {
        found_report_id: Number($('claim-found-report-id').value),
        lost_report_id: $('claim-lost-report-id').value ? Number($('claim-lost-report-id').value) : undefined,
        proof_description: $('claim-proof-text').value,
        proof_photo_url: photos.claim.url
      }
    });
    closeClaimModal();
    showToast('Claim submitted. An administrator will review it.');
    await refreshAllData();
    switchView('claims');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function claimPillClass(status) {
  if (status === 'More Proof Requested') return 'MoreProof';
  if (status === 'Hold Item') return 'Hold';
  return status;
}

function renderClaimsAndMatchesView() {
  $('claims-view-matches').innerHTML = allMatches.length
    ? allMatches.map(buildMatchCardHtml).join('')
    : emptyState('No matches right now.');

  const el = $('student-claims-container');
  const mine = currentUser.role === 'admin' ? allClaims : allClaims.filter((c) => c.claimant_id === currentUser.id);
  if (!mine.length) {
    el.innerHTML = emptyState('You have not submitted any ownership claims yet.');
    return;
  }

  el.innerHTML = mine.map((c) => {
    const isMine = c.claimant_id === currentUser.id;
    let action = '';
    if (c.status === 'More Proof Requested' && isMine) {
      action = `
        <div class="alert-box alert-warn" style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div><strong>🔎 The administrator needs more proof:</strong> "${escapeHtml(c.admin_feedback)}"</div>
          <button class="btn btn-warn btn-sm" data-action="more-proof" data-id="${c.id}">+ Provide proof</button>
        </div>`;
    } else if (c.status === 'Approved') {
      action = `
        <div class="alert-box" style="margin-top:12px;background:#eff6ff;border:1px solid #93c5fd;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <strong>🎉 Claim approved.</strong> ${escapeHtml(c.admin_feedback)}
            ${c.receipt_confirmed ? '<br/><span style="color:#059669;font-weight:700;">✓ You confirmed receipt</span>' : ''}
          </div>
          ${!c.receipt_confirmed && isMine ? `<button class="btn btn-primary btn-sm" data-action="confirm-receipt" data-id="${c.id}">✍️ I received the item</button>` : ''}
        </div>`;
    } else if (c.status === 'Returned') {
      action = `<div class="alert-box" style="margin-top:12px;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;">✅ <strong>Returned — case resolved.</strong> ${escapeHtml(c.admin_feedback)}</div>`;
    } else if (c.status === 'Rejected' || c.status === 'Hold Item') {
      action = `<div class="alert-box alert-warn" style="margin-top:12px;"><strong>${escapeHtml(c.status)}:</strong> ${escapeHtml(c.admin_feedback)}</div>`;
    }

    return `
      <div class="claim-card">
        <div class="claim-card-header">
          <div>
            <strong>Claim #${c.id} • ${escapeHtml(c.found_title)}</strong>
            <span style="font-size:12.5px;color:#64748b;margin-left:10px;">By <strong>@${escapeHtml(c.claimant_username)}</strong> • ${escapeHtml(c.found_location)} • ${escapeHtml(formatWhen(c.created_at))}</span>
          </div>
          <span class="claim-status-pill ${claimPillClass(c.status)}">${escapeHtml(c.status)}</span>
        </div>
        <div style="margin-top:12px;font-size:13.5px;color:#334155;">
          <strong>Your proof:</strong> ${escapeHtml(c.proof_description)}
          ${c.additional_proof_text ? `<div style="margin-top:6px;color:#0369a1;"><strong>Additional proof:</strong> ${escapeHtml(c.additional_proof_text)}</div>` : ''}
        </div>
        ${action}
      </div>`;
  }).join('');
}

function openMoreProofModal(claimId) {
  const claim = allClaims.find((c) => c.id === claimId);
  $('more-proof-claim-id').value = claimId;
  $('more-proof-admin-prompt').textContent = `Administrator: "${claim ? claim.admin_feedback : ''}"`;
  $('more-proof-text').value = '';
  clearPhoto('more');
  show($('more-proof-modal'));
}

function closeMoreProofModal() { hide($('more-proof-modal')); }

async function handleMoreProofSubmit(e) {
  e.preventDefault();
  try {
    await api(`/claims/${Number($('more-proof-claim-id').value)}/more-proof`, {
      method: 'POST',
      body: { additional_proof_text: $('more-proof-text').value, additional_photo_url: photos.more.url }
    });
    closeMoreProofModal();
    showToast('Additional proof sent. Your claim is pending review again.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmReceipt(claimId) {
  try {
    await api(`/claims/${claimId}/confirm-receipt`, { method: 'POST', body: {} });
    showToast('Thanks — receipt confirmed.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Administrator: claims & moderation
// ---------------------------------------------------------------------------
function photoBlock(url, label) {
  return url
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" />`
    : '<div class="no-photo no-photo-box">No photo</div>';
}

function buildAdminClaimCard(c, dark) {
  const inputId = `${dark ? 'devops' : 'admin'}-feedback-${c.id}`;
  const act = (action, cls, label) =>
    `<button class="btn ${cls} btn-sm" data-action="admin-claim" data-id="${c.id}" data-act="${action}" data-input="${inputId}">${label}</button>`;

  let buttons = '';
  if (c.status === 'Pending') {
    buttons = act('request_more_proof', 'btn-warn', '🔎 Request more proof') + act('approve', 'btn-primary', '✅ Approve') + act('reject', 'btn-danger', '❌ Reject');
  } else if (c.status === 'More Proof Requested') {
    buttons = act('reject', 'btn-danger', '❌ Reject') + '<span style="font-size:12px;opacity:.8;">Waiting for the claimant…</span>';
  } else if (c.status === 'Approved' || c.status === 'Hold Item') {
    buttons = act('mark_returned', 'btn-success', '🤝 Verify ID & mark returned')
      + (c.status === 'Approved' ? act('verify_identity_no_hold', 'btn-outline', '⚠️ ID failed → hold item') : '');
  } else {
    buttons = `<span style="font-size:12px;opacity:.8;">Closed: ${escapeHtml(c.status)}</span>`;
  }

  return `
    <div class="${dark ? 'devops-claim-card' : 'claim-card'}">
      <div class="claim-card-header">
        <div>
          <strong style="font-size:15.5px;">Claim #${c.id}: ${escapeHtml(c.found_title)}</strong>
          <span style="font-size:12.5px;opacity:0.8;margin-left:10px;">Claimant <strong>@${escapeHtml(c.claimant_username)}</strong> • Finder <strong>@${escapeHtml(c.finder_username)}</strong> • ${escapeHtml(formatWhen(c.created_at))}</span>
        </div>
        <span class="claim-status-pill ${claimPillClass(c.status)}">${escapeHtml(c.status)}</span>
      </div>

      <div class="claim-comparison-grid">
        <div class="claim-col">
          <h5>1. Claimant's lost report</h5>
          ${c.lost_title ? photoBlock(c.lost_photo_url, 'Lost report') : ''}
          <div style="font-size:12.5px;">
            <strong>${escapeHtml(c.lost_title || 'No lost report linked')}</strong><br/>
            <span>Marks: ${escapeHtml(c.lost_marks || 'N/A')}</span>
          </div>
        </div>
        <div class="claim-col">
          <h5>2. Found item (unblurred)</h5>
          ${photoBlock(c.found_photo_url, 'Found item')}
          <div style="font-size:12.5px;">
            <strong>${escapeHtml(c.found_title)} (${escapeHtml(c.found_location)})</strong><br/>
            <span>Private marks: <strong>${escapeHtml(c.found_marks || 'None')}</strong></span>
          </div>
        </div>
        <div class="claim-col">
          <h5>3. Claimant's proof</h5>
          ${photoBlock(c.proof_photo_url, 'Proof')}
          <div style="font-size:12.5px;">
            <strong>Proof:</strong> ${escapeHtml(c.proof_description)}
            ${c.additional_proof_text ? `<div style="margin-top:4px;color:#38bdf8;"><strong>+ Additional:</strong> ${escapeHtml(c.additional_proof_text)}</div>` : ''}
            ${c.additional_photo_url ? photoBlock(c.additional_photo_url, 'Additional proof') : ''}
          </div>
        </div>
      </div>

      <div class="devops-action-bar">
        <input type="text" id="${inputId}" maxlength="500" class="${dark ? 'devops-feedback-input' : ''}"
          style="${dark ? '' : 'flex:1;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;'}"
          placeholder="Optional note to the student…" />
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${buttons}</div>
      </div>
    </div>`;
}

async function adminClaimAction(claimId, action, inputId) {
  const input = $(inputId);
  try {
    await api(`/claims/${claimId}/admin-action`, { method: 'POST', body: { action, admin_feedback: input ? input.value.trim() : '' } });
    const labels = {
      request_more_proof: 'More proof requested. The student was notified.',
      approve: 'Claim approved. The student was notified.',
      reject: 'Claim rejected.',
      verify_identity_no_hold: 'Item placed on hold.',
      mark_returned: 'Item marked as returned. Case resolved.'
    };
    showToast(labels[action] || 'Claim updated.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function flagReport(reportId) {
  try {
    await api(`/reports/${reportId}/flag`, { method: 'POST', body: { reason: 'Flagged by a campus member as suspicious or a duplicate.' } });
    showToast('Thanks. An administrator will review this report.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteOwnReport(reportId) {
  if (!window.confirm('Delete this report? This cannot be undone.')) return;
  try {
    await api(`/reports/${reportId}`, { method: 'DELETE', body: {} });
    showToast('Report deleted.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function moderateReport(reportId, action) {
  const confirmations = {
    delete_report: 'Delete this report permanently?',
    suspend_user: 'Suspend the owner of this report? They will be signed out and unable to log in.'
  };
  if (confirmations[action] && !window.confirm(confirmations[action])) return;
  try {
    await api(`/reports/${reportId}/moderate`, { method: 'POST', body: { action } });
    showToast({ dismiss_flag: 'Flag dismissed. The report stays active.', delete_report: 'Report deleted.', suspend_user: 'User suspended.' }[action]);
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function buildModerationCard(r, dark) {
  return `
    <div class="${dark ? 'devops-mod-card' : 'claim-card'}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="type-badge ${r.type}">#${r.id} • ${r.type}</span>
        <span style="font-size:12px;color:#fbbf24;font-weight:700;">🚩 FLAGGED</span>
      </div>
      <h4 style="margin-top:10px;font-size:16px;">${escapeHtml(r.title)}</h4>
      <p style="font-size:12.5px;opacity:0.85;margin-top:4px;">Posted by <strong>@${escapeHtml(r.owner_username)}</strong> at ${escapeHtml(r.location)}</p>
      <p style="font-size:12.5px;margin-top:8px;">${escapeHtml(r.description)}</p>
      <p style="font-size:12.5px;margin-top:8px;padding:8px;background:rgba(245,158,11,0.15);border-radius:8px;"><strong>Reason:</strong> ${escapeHtml(r.suspicious_reason || 'Suspicious or duplicate listing')}</p>
      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;">
        <button class="btn btn-success btn-sm" data-action="moderate" data-id="${r.id}" data-act="dismiss_flag">✓ Valid — dismiss flag</button>
        <button class="btn btn-warn btn-sm" data-action="moderate" data-id="${r.id}" data-act="delete_report">🗑️ Delete report</button>
        <button class="btn btn-danger btn-sm" data-action="moderate" data-id="${r.id}" data-act="suspend_user">🚫 Suspend @${escapeHtml(r.owner_username)}</button>
      </div>
    </div>`;
}

function renderAdminWorkspaceView() {
  if (currentUser.role !== 'admin') return;
  const keepFocus = (id) => { const el = document.activeElement; return el && el.tagName === 'INPUT' && $(id).contains(el); };

  if (!keepFocus('admin-page-claims-list')) {
    $('admin-page-claims-list').innerHTML = allClaims.length ? allClaims.map((c) => buildAdminClaimCard(c, false)).join('') : emptyState('No ownership claims yet.');
  }
  const flagged = allReports.filter((r) => r.is_suspicious);
  $('admin-page-suspicious-list').innerHTML = flagged.length ? flagged.map((r) => buildModerationCard(r, false)).join('') : emptyState('No flagged reports.');
}

// ---------------------------------------------------------------------------
// DevOps console (administrators only)
// ---------------------------------------------------------------------------
function toggleDevOpsModal(force) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const overlay = $('devops-overlay');
  const open = typeof force === 'boolean' ? force : overlay.classList.contains('hidden');
  overlay.classList.toggle('hidden', !open);
  if (open) refreshAllData();
}

function switchDevOpsTab(tab) {
  document.querySelectorAll('.devops-tab').forEach((b) => b.classList.toggle('active', b.dataset.dtab === tab));
  ['claims', 'moderation', 'telemetry'].forEach((t) => $(`dpanel-${t}`).classList.toggle('hidden', t !== tab));
}

function renderDevOpsConsole() {
  if (!currentUser || currentUser.role !== 'admin' || !overview) return;
  const flagged = allReports.filter((r) => r.is_suspicious);
  $('dtab-claims-count').textContent = allClaims.length;
  $('dtab-mod-count').textContent = flagged.length;

  const insideInput = (id) => { const el = document.activeElement; return el && el.tagName === 'INPUT' && $(id).contains(el); };
  if (!insideInput('devops-claims-container')) {
    $('devops-claims-container').innerHTML = allClaims.length
      ? allClaims.map((c) => buildAdminClaimCard(c, true)).join('')
      : '<div class="devops-panel-intro">No ownership claims yet. They appear here as soon as a student submits one.</div>';
  }
  $('devops-moderation-container').innerHTML = flagged.length
    ? flagged.map((r) => buildModerationCard(r, true)).join('')
    : '<div class="devops-panel-intro">No flagged reports.</div>';

  const c = overview.counts;
  const row = (label, value, color = '#e2e8f0') => `<li><span>${escapeHtml(label)}</span><strong style="color:${color};">${escapeHtml(value)}</strong></li>`;
  $('devops-nfr-list').innerHTML = [
    row('Database', `${overview.database.engine} — ${overview.database.file}`, overview.database.persistent ? '#34d399' : '#fbbf24'),
    row('Accounts', c.users),
    row('Reports (lost / found)', `${c.reports} (${c.lost} / ${c.found})`),
    row('Matches', c.matches),
    row('Ownership claims', c.claims),
    row('Active sessions', c.sessions),
    row('Last match time (limit 3000 ms)', overview.nfr.lastMatchLatencyMs === null ? 'no matches yet' : `${overview.nfr.lastMatchLatencyMs} ms`, '#34d399'),
    row('Max photo size', `${overview.nfr.maxImageSizeKb} KB`)
  ].join('');

  $('devops-users-table-wrap').innerHTML = `
    <table style="width:100%;font-size:12.5px;border-collapse:collapse;">
      <thead>
        <tr style="text-align:left;color:#7dd3fc;border-bottom:1px solid rgba(56,189,248,0.2);">
          <th style="padding:6px;">ID</th><th style="padding:6px;">Username</th><th style="padding:6px;">Role</th>
          <th style="padding:6px;">Reports</th><th style="padding:6px;">Status</th><th style="padding:6px;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${overview.users.map((u) => `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
            <td style="padding:6px;">#${u.id}</td>
            <td style="padding:6px;font-weight:700;">@${escapeHtml(u.username)}</td>
            <td style="padding:6px;">${escapeHtml(u.role)}</td>
            <td style="padding:6px;">${u.report_count}</td>
            <td style="padding:6px;color:${u.status === 'active' ? '#34d399' : '#f87171'};font-weight:700;">${escapeHtml(u.status)}</td>
            <td style="padding:6px;">${u.role === 'admin' ? '—' : `<button class="devops-btn" style="padding:3px 8px;font-size:11px;" data-action="toggle-user" data-id="${u.id}">${u.status === 'active' ? 'Suspend' : 'Restore'}</button>`}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  $('devops-logs-terminal').innerHTML = overview.recentLogs.length
    ? overview.recentLogs.map((l) => `
        <div class="log-line">
          <span style="color:#94a3b8;">[${escapeHtml(new Date(l.created_at).toLocaleTimeString())}]</span>
          <strong style="color:#fbbf24;">[${escapeHtml(l.event_type)}]</strong>
          <span>${escapeHtml(l.summary)}</span>
        </div>`).join('')
    : '<div class="log-line">No events yet.</div>';
}

async function toggleUserSuspend(userId) {
  try {
    const res = await api(`/admin/users/${userId}/toggle-status`, { method: 'POST', body: {} });
    showToast(res.status === 'suspended' ? 'User suspended and signed out.' : 'User restored.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function wipeAllData() {
  const typed = window.prompt('This permanently deletes ALL reports, claims, matches, notifications and every account except "admin".\n\nType WIPE to confirm:');
  if (typed === null) return;
  if (typed.trim() !== 'WIPE') return showToast('Cancelled — you did not type WIPE.', 'error');
  try {
    await api('/admin/reset', { method: 'POST', body: { confirm: 'WIPE' } });
    showToast('Database wiped. Only the admin account remains.');
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
function toggleNotificationsDrawer(force) {
  const drawer = $('notifications-drawer');
  const open = typeof force === 'boolean' ? force : drawer.classList.contains('hidden');
  drawer.classList.toggle('hidden', !open);
}

function renderNotificationsDrawer() {
  const list = $('notifications-list');
  if (!userNotifications.length) {
    list.innerHTML = emptyState('You have no notifications yet.');
    return;
  }
  list.innerHTML = userNotifications.map((n) => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;">
        <strong>${escapeHtml(n.type)}</strong>
        <span>${escapeHtml(formatWhen(n.created_at))}</span>
      </div>
      <h5>${escapeHtml(n.title)}</h5>
      <p>${escapeHtml(n.message)}</p>
    </div>`).join('');
}

async function markAllNotificationsRead() {
  try {
    await api('/notifications/read-all', { method: 'POST', body: {} });
    await refreshAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// One click handler for all buttons that act on a record (no inline JS with user data)
// ---------------------------------------------------------------------------
function handleDelegatedClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  switch (btn.dataset.action) {
    case 'claim': return openClaimModal(id, btn.dataset.lost ? Number(btn.dataset.lost) : null);
    case 'flag': return flagReport(id);
    case 'delete-report': return deleteOwnReport(id);
    case 'more-proof': return openMoreProofModal(id);
    case 'confirm-receipt': return confirmReceipt(id);
    case 'admin-claim': return adminClaimAction(id, btn.dataset.act, btn.dataset.input);
    case 'moderate': return moderateReport(id, btn.dataset.act);
    case 'toggle-user': return toggleUserSuspend(id);
    default: return undefined;
  }
}
