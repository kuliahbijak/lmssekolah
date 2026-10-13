/* =====================================================================
   SIAKAD SISWA v2.1 — core.js
   API (fetch + retry + timeout + reqId + dedupe + batch), cache SWR per user,
   router SPA berperan (guru · superadmin · siswa), komponen UI, utilitas.
   Prinsip gas-instant-ux-pro + gas-scale-turbo: render dari cache dulu,
   server di latar, gabungkan panggilan, antrean notifikasi di-drain async.
   Frontend HANYA memegang GAS_URL — tidak ada rahasia di sini.
   ===================================================================== */
'use strict';
var CFG = window.SIAKAD_CONFIG || {};
var CFG_SALAH = /GANTI|XXXX/i.test(String(CFG.GAS_URL || ''));          // placeholder belum diganti
var DEMO = !CFG.GAS_URL;
var GAS_URL = CFG.GAS_URL || '';

// ---------------------------------------------------------------- DOM
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ic(name, cls) {
  var b = (window.ICONS || {})[name];
  if (!b) { console.warn('Ikon hilang:', name); b = ''; }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide ' + (cls || '') + '" aria-hidden="true">' + b + '</svg>';
}
function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms || 280); }; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }
function hashStr(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x + ':' + s.length; }

// ---------------------------------------------------------------- Format
var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var BLN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
var HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
function todayStr() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()); }
function nowHM() { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
function parseD(t) { return new Date(String(t).substring(0, 10) + 'T00:00:00+07:00'); }
function hariDari(t) { return HARI_ID[new Date(parseD(t).getTime() + 7 * 3600e3).getUTCDay()]; }
function tglIndo(t, pendek) { if (!t) return '-'; var p = String(t).substring(0, 10).split('-'); if (p.length < 3) return t; return Number(p[2]) + ' ' + (pendek ? BLN3 : BULAN)[Number(p[1]) - 1] + ' ' + p[0]; }
function tglHari(t) { return hariDari(t) + ', ' + tglIndo(t); }
function jam5(j) { return String(j || '').substring(0, 5); }
function relTime(iso) {
  if (!iso) return '-';
  var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
  if (isNaN(s)) return iso;
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  if (s < 172800) return 'Kemarin, ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' hari lalu';
  if (s < 30 * 86400) return Math.floor(s / (7 * 86400)) + ' minggu lalu';
  return tglIndo(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d), true);
}
function fmtN(n, d) { if (n === '' || n == null || isNaN(n)) return '-'; return Number(n).toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 1 : d }); }
function fmtSize(b) { b = Number(b); if (!b) return ''; return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }
function initials(n) { var p = String(n || '?').replace(/^(drs?a?\.|dr\.|h\.|hj\.|k\.h\.|ir\.|prof\.|bpk\.|ibu)\s*/gi, '').trim().split(/\s+/); return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); }
function avColor(n) { var x = 0; String(n).split('').forEach(function (c) { x += c.charCodeAt(0); }); return 'c' + (x % 5 + 1); }
function avatar(nama, foto, cls) {
  return '<span class="av ' + (cls || '') + ' ' + avColor(nama) + '">' + (foto ? '<img src="' + esc(foto) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + esc(initials(nama)) + '</span>';
}
function hp08(v) { var s = String(v || '').replace(/[^0-9+]/g, '').replace(/^\+/, ''); if (!s) return ''; if (s.indexOf('62') === 0) s = '0' + s.slice(2); else if (s[0] === '8') s = '0' + s; return s; }
function waLink(v) { var s = hp08(v); return s ? 'https://wa.me/62' + s.slice(1) : '#'; }

// ---------------------------------------------------------------- Storage (per user, versi skema)
var LS_PREFIX = 'siakad:v2:';
var Store = {
  get: function (k, d) { try { var v = localStorage.getItem(LS_PREFIX + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set: function (k, v) {
    var s = JSON.stringify(v);
    try { localStorage.setItem(LS_PREFIX + k, s); }
    catch (e) {
      try {                                     // kuota penuh → buang cache user lain, coba sekali lagi
        var mine = LS_PREFIX + userKey('');
        Object.keys(localStorage).forEach(function (x) { if (x.indexOf(LS_PREFIX + 'u:') === 0 && x.indexOf(mine) !== 0) localStorage.removeItem(x); });
        localStorage.setItem(LS_PREFIX + k, s);
      } catch (e2) { /* tetap jalan tanpa cache */ }
    }
  },
  del: function (k) { try { localStorage.removeItem(LS_PREFIX + k); } catch (e) {} },
  clearUser: function (email) { try { Object.keys(localStorage).forEach(function (x) { if (x.indexOf(LS_PREFIX + 'u:' + email + ':') === 0) localStorage.removeItem(x); }); } catch (e) {} }
};
var AppState = { token: '', role: '', email: '', nama: '', ref: '', hak: '', exp: 0, boot: null };
function userKey(k) { return 'u:' + (AppState.email || 'anon') + ':' + k; }
/** Peran & hak (tampilan saja — penjagaan sebenarnya di server) */
function isSA() { return AppState.role === 'superadmin'; }
function isSiswa() { return AppState.role === 'siswa'; }
function akunInfo() { return (AppState.boot && AppState.boot.akun) || {}; }
function isKeu() { return isSA() || (AppState.role === 'guru' && /(^|,)\s*keuangan\s*(,|$)/i.test(AppState.hak || akunInfo().hak || '')); }
function isGuruX() { return !isSiswa() && !!akunInfo().terhubungGuru; }
function regRole() { return AppState.role === 'siswa' ? 'siswa' : 'guru'; }
function roleLabel(r) { return { superadmin: 'Super Admin', guru: 'Guru', siswa: 'Siswa' }[r || AppState.role] || r; }

/** ID perangkat (untuk kunci perangkat absensi) — acak, disimpan di browser ini, bukan rahasia */
var Device = {
  id: function () { var d = Store.get('dev', ''); if (!d) { d = 'D' + uid().replace(/-/g, '').slice(0, 20); Store.set('dev', d); } return d; },
  info: function () {
    var u = navigator.userAgent || '', b = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'Browser';
    var o = /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac OS/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : 'Perangkat';
    return b + ' · ' + o;
  }
};

// ---------------------------------------------------------------- Perf
var Perf = {
  rows: [], serverVersion: '',
  add: function (action, total, server, cached) { this.rows.push({ action: action, total: total, server: server == null ? null : server, net: server != null ? total - server : null, cache: cached ? '✓' : '', at: new Date().toLocaleTimeString() }); if (this.rows.length > 200) this.rows.shift(); },
  table: function () { console.table(this.rows.slice(-30)); },
  summary: function () {
    var g = {};
    this.rows.forEach(function (r) { var x = g[r.action] = g[r.action] || { aksi: r.action, n: 0, total: 0, server: 0, cache: 0 }; x.n++; x.total += r.total; x.server += r.server || 0; if (r.cache) x.cache++; });
    var out = Object.keys(g).map(function (k) { var x = g[k]; return { aksi: x.aksi, panggilan: x.n, rata_total_ms: Math.round(x.total / x.n), rata_server_ms: Math.round(x.server / x.n), dari_cache: x.cache }; });
    console.table(out); return out;
  }
};
window.Perf = Perf;

// ---------------------------------------------------------------- Mode DEMO (backend GAS dijalankan di browser)
var DemoServer = {
  _p: null, mock: null,
  loadScript: function (src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Gagal memuat ' + src)); }; document.head.appendChild(s); }); },
  ready: function () {
    if (this._p) return this._p;
    var self = this;
    this._p = this.loadScript('demo/demo-config.js').then(function () { return self.loadScript('demo/gas-mock.js'); }).then(function () {
      var KEY = 'siakad-demo-db-v2';
      self.mock = window.GasMock.create({ persist: {
        load: function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
        save: function (o) { localStorage.setItem(KEY, JSON.stringify(o)); }
      } });
      self.mock.quiet = true;
      Object.keys(self.mock.globals).forEach(function (k) { window[k] = self.mock.globals[k]; });
      return self.loadScript('demo/backend.js');
    }).then(function () {
      if (!window.PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')) { window.setupAppEnvironment(); self.mock.flush(); }
      setInterval(function () { try { window.pekerjaMenit(); } catch (e) {} }, 60000);
    });
    return this._p;
  },
  call: function (body) {
    return this.ready().then(function () {
      var out = window.doPost({ postData: { contents: JSON.stringify(body) } });
      return JSON.parse(out.getContent());
    });
  },
  fileUrl: function (id) { return this.mock ? this.mock.fileDataUrl(id) : ''; },
  reset: function () { try { localStorage.removeItem('siakad-demo-db-v2'); } catch (e) {} }
};

// ---------------------------------------------------------------- API (gas-instant-ux-pro Prinsip 8)
var READ_ACTIONS = /^(ping|config\.public|guru\.bootstrap|siswa\.bootstrap|batch|absensi\.list|absensi\.foto|nilai\.list|config\.get|logs\.list|migrasi\.scan|notif\.(config|queue|mine|drain)|wa\.device|wa\.audience|wa\.blastList|crm\.(list|stats|detail|export)|materi\.view|sa\.(monitor|akun\.list)|lokasi\.(list|saya)|presensi\.(list|saya)|rahasia\.status|billing\.(list|pending|eligible|history|mine|receipt|bukti|settingsGet)|biaya\.list|discount\.list|reminder\.preview|kwitansi\.verify)$/;
async function apiOnce(action, data, timeout, reqId) {
  var t0 = performance.now();
  var body = { action: action, token: AppState.token || '', reqId: reqId, data: data || {}, dev: Device.id() };
  if (DEMO) {
    try {
      var j = await DemoServer.call(body);
      Perf.add(action, Math.round(performance.now() - t0), j.ms, j.cached);
      return j;
    } catch (e) { console.error(e); return { success: false, message: 'Mode demo error: ' + e.message }; }
  }
  if (CFG_SALAH) return { success: false, message: 'Konfigurasi belum lengkap: isi GAS_URL di js/config.js dengan URL /exec Apps Script Anda.' };
  var ctrl = new AbortController(), timer = setTimeout(function () { ctrl.abort(); }, timeout);
  try {
    var res = await fetch(GAS_URL, { method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },          // hindari CORS preflight
      body: JSON.stringify(body) });
    var text = await res.text();
    try { var js = JSON.parse(text); Perf.add(action, Math.round(performance.now() - t0), js.ms, js.cached); if (js.v) Perf.serverVersion = js.v; return js; }
    catch (e) { return { success: false, network: true, retryable: res.status >= 500 || res.status === 429 || res.status === 200, message: 'Server membalas HTTP ' + res.status + ' (bukan JSON). Periksa URL /exec & akses "Anyone".' }; }
  } catch (err) {
    return { success: false, network: true, retryable: true, message: err.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Koneksi terputus. Periksa internet Anda.' };
  } finally { clearTimeout(timer); }
}
/* gas-scale-turbo 4.2: baca identik yang sedang berjalan menumpang (dedupe); epoch tulis
   mencegah baca SETELAH simpan menumpang baca lama (data basi). */
var _inflight = {}, _writeEpoch = 0;
function api(action, data, opt) {
  opt = opt || {};
  var isRead = READ_ACTIONS.test(action) || action === 'login';
  if (!isRead) { _writeEpoch++; return apiRun(action, data, opt, false); }
  if (action === 'login') return apiRun(action, data, opt, true);
  var k = _writeEpoch + '|' + action + '|' + AppState.token + '|' + JSON.stringify(data || {});
  if (_inflight[k]) return _inflight[k];
  var p = apiRun(action, data, opt, true); _inflight[k] = p;
  p.then(function () { delete _inflight[k]; }, function () { delete _inflight[k]; });
  return p;
}
async function apiRun(action, data, opt, isRead) {
  var reqId = isRead ? '' : (opt.reqId || uid());
  var tries = isRead ? 3 : 2, res;
  for (var i = 0; i < tries; i++) {
    if (i) { await sleep(1200 * i); if (navigator.onLine === false) await waitOnline(15000); }
    res = await apiOnce(action, data, isRead ? (i ? 40000 : 25000) : 90000, reqId);
    if (res.success || !res.retryable) break;
  }
  if (res.nq > 0) scheduleDrain();                       // notifikasi diantrekan server → kirim di latar
  if (!res.success && res.data && res.data.code === 'AUTH' && action !== 'login' && window.onSessionExpired) window.onSessionExpired();
  return res;
}
function waitOnline(ms) { return new Promise(function (r) { if (navigator.onLine !== false) return r(); var t = setTimeout(done, ms); function done() { clearTimeout(t); removeEventListener('online', done); r(); } addEventListener('online', done); }); }

/* gas-scale-turbo 4.3: penggabung batch otomatis — beberapa apiQ() di tik yang sama = 1 eksekusi */
var Batcher = {
  q: null,
  add: function (action, data) { var self = this; return new Promise(function (res) { if (!self.q) { self.q = []; setTimeout(function () { self.flush(); }, 0); } self.q.push({ action: action, data: data || {}, res: res }); }); },
  flush: function () {
    var q = this.q || []; this.q = null;
    var uniq = [], idx = {};
    q.forEach(function (x) { var k = x.action + '|' + JSON.stringify(x.data); if (idx[k] === undefined) { idx[k] = uniq.length; uniq.push({ action: x.action, data: x.data, k: k, waiters: [] }); } uniq[idx[k]].waiters.push(x.res); });
    var byAction = {}, calls = [], solo = [];
    uniq.forEach(function (u) { if (byAction[u.action]) solo.push(u); else { byAction[u.action] = 1; calls.push(u); } });
    solo.forEach(function (u) { api(u.action, u.data).then(function (r) { u.waiters.forEach(function (w) { w(r); }); }); });
    for (var i = 0; i < calls.length; i += 10) (function (part) {
      if (part.length === 1) { api(part[0].action, part[0].data).then(function (r) { part[0].waiters.forEach(function (w) { w(r); }); }); return; }
      api('batch', { calls: part.map(function (u) { return { action: u.action, data: u.data }; }) }).then(function (r) {
        part.forEach(function (u) { var one = r.success ? (r.data[u.action] || { success: false, message: 'Tidak ada hasil.' }) : r; u.waiters.forEach(function (w) { w(one); }); });
      });
    })(calls.slice(i, i + 10));
  }
};
function apiQ(action, data) { return Batcher.add(action, data); }

/* gas-scale-turbo 4.6: antrean notifikasi server di-drain di latar (maks 3 ulang) */
var _drainT = null, _drainN = 0;
function scheduleDrain() {
  clearTimeout(_drainT);
  _drainT = setTimeout(async function run() {
    var r = await apiOnce('notif.drain', {}, 30000, '');
    if (r.success && r.data && r.data.left > 0 && ++_drainN < 3) _drainT = setTimeout(run, 1500); else _drainN = 0;
  }, 400);
}

/* gas-scale-turbo 4.7: warmup dari browser — maks 1×/4 menit per lingkup */
function warmUpServer(scope) {
  if (DEMO || CFG_SALAH || !GAS_URL) return;
  scope = scope || 'pub';
  try { var k = 'siakad:warm:' + scope, t = Number(sessionStorage.getItem(k) || 0); if (Date.now() - t < 240000) return; sessionStorage.setItem(k, String(Date.now())); } catch (e) {}
  fetch(GAS_URL + '?w=' + scope + '&t=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).catch(function () {});
}

/* gas-scale-turbo 4.8: polling adaptif — cepat saat aktif, lambat saat diam, berhenti saat tab tersembunyi */
var Activity = {
  at: Date.now(), last: {},
  init: function () { var self = this; ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'].forEach(function (ev) { addEventListener(ev, function () { self.at = Date.now(); }, { passive: true }); }); },
  idle: function () { return Date.now() - this.at > 120000; },
  due: function (key, activeMs, idleMs) {
    if (document.visibilityState !== 'visible') return false;
    if (Date.now() - (this.last[key] || 0) < (this.idle() ? idleMs : activeMs) - 500) return false;
    this.last[key] = Date.now(); return true;
  }
};
Activity.init();

/** Stale-while-revalidate: render dari cache seketika, segarkan di latar, render ulang hanya bila berubah */
async function swr(key, action, payload, render, opt) {
  opt = opt || {};
  var fresh = opt.fresh == null ? 60000 : opt.fresh;
  var c = Store.get(userKey(key), null);
  if (c && !opt.silent) render(c.data, true);
  if (c && !opt.force && Date.now() - c.t < fresh) return { success: true, data: c.data, cached: true };
  var res = await api(action, payload);
  if (res.success) {
    var hs = hashStr(JSON.stringify(res.data));
    Store.set(userKey(key), { t: Date.now(), h: hs, data: res.data });
    if (!c || c.h !== hs) render(res.data, false);
  } else if (!c && opt.onError) opt.onError(res);
  return res;
}

// ---------------------------------------------------------------- Router SPA (halaman hidup, tidak dibuang)
var Pages = { guru: {}, siswa: {} };
function registerPage(role, name, def) { Pages[role][name] = Object.assign({ dirty: true }, def); }
/** Penjaga rute di browser (server tetap menolak bila tidak berhak) */
function pageAllowed(def) { if (!def) return false; if (def.sa && !isSA()) return false; if (def.keu && !isKeu()) return false; if (def.gurux && !isGuruX()) return false; return true; }
function go(name, param) { var hsh = '#/' + name + (param ? '/' + encodeURIComponent(param) : ''); if (location.hash === hsh) route(); else location.hash = hsh; }
function currentRoute() { var p = location.hash.replace(/^#\/?/, '').split('/'); return { name: p[0] || '', param: p[1] ? decodeURIComponent(p[1]) : '' }; }
function route() {
  if (!AppState.role || !$('#content')) return;
  var r = currentRoute(), reg = Pages[regRole()];
  var name = reg[r.name] ? r.name : 'dashboard';
  if (!pageAllowed(reg[name])) { if (r.name) toast('Menu ini khusus ' + (reg[name].sa ? 'Super Admin' : reg[name].keu ? 'bendahara / hak keuangan' : 'guru') + '.', 'warn'); name = 'dashboard'; }
  var def = reg[name];
  var host = $('#content'), el = $('.page[data-page="' + name + '"]', host);
  if (!el) { el = document.createElement('section'); el.className = 'page'; el.dataset.page = name; host.appendChild(el); def.init && def.init(el); }
  $$('.page', host).forEach(function (p) { p.hidden = p !== el; });
  if (window.setActiveNav) setActiveNav(name, def);
  if (def.dirty || def.alwaysRender || r.param !== def._param) { def._param = r.param; def.dirty = false; try { def.render && def.render(el, r.param); } catch (e) { console.error(e); el.innerHTML = errorBox('Halaman gagal ditampilkan: ' + e.message); } }
  def.show && def.show(el, r.param);
  if (!def._keepScroll) window.scrollTo(0, 0);
  document.title = (def.title || 'SIAKAD') + ' — SIAKAD SISWA';
}
function markAllDirty(renderCurrent) {
  var reg = Pages[regRole()] || {};
  Object.keys(reg).forEach(function (k) { reg[k].dirty = true; });
  if (renderCurrent) {
    var r = currentRoute(), name = reg[r.name] ? r.name : 'dashboard', def = reg[name], el = $('.page[data-page="' + name + '"]');
    if (def && el && !el.hidden) { def.dirty = false; try { def.render && def.render(el, r.param, true); } catch (e) { console.error(e); } }
  }
}
window.addEventListener('hashchange', route);
function errorBox(msg, retry) { return '<div class="card card-p empty">' + ic('wifi-off') + '<b>Tidak dapat memuat data</b><div>' + esc(msg) + '</div>' + (retry ? '<button class="btn btn-primary mt16" onclick="' + retry + '">' + ic('refresh-cw') + 'Coba lagi</button>' : '') + '</div>'; }

// ---------------------------------------------------------------- Toast, modal, confirm
function toast(msg, type, title) {
  var icon = { ok: 'circle-check', bad: 'circle-alert', warn: 'triangle-alert' }[type] || 'info';
  var el = h('<div class="toast ' + (type || '') + '">' + ic(icon) + '<div class="grow">' + (title ? '<b>' + esc(title) + '</b>' : '') + '<div>' + esc(msg) + '</div></div></div>');
  $('#toasts').appendChild(el);
  setTimeout(function () { el.style.transition = 'opacity .25s, transform .25s'; el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; setTimeout(function () { el.remove(); }, 260); }, type === 'bad' ? 5200 : 3200);
}
function toastRes(res, okMsg) { if (res.success) toast(okMsg || res.message, 'ok'); else toast(res.message || 'Terjadi kesalahan.', 'bad'); return res.success; }
var _modals = [];
function modal(o) {
  var ov = h('<div class="overlay' + (o.drawer ? ' drawer-ov' : '') + '" role="dialog" aria-modal="true"><div class="' + (o.drawer ? 'drawer' : 'modal ' + (o.size || '')) + '">' +
    (o.title !== false ? '<div class="modal-h"><div class="grow"><h3>' + esc(o.title || '') + '</h3>' + (o.sub ? '<p>' + esc(o.sub) + '</p>' : '') + '</div><button class="btn-ic" data-x aria-label="Tutup">' + ic('x') + '</button></div>' : '') +
    '<div class="modal-b">' + (o.body || '') + '</div>' + (o.foot ? '<div class="modal-f">' + o.foot + '</div>' : '') + '</div></div>');
  function close(v) { if (!ov.isConnected) return; ov.remove(); _modals = _modals.filter(function (m) { return m !== api2; }); document.body.style.overflow = _modals.length ? 'hidden' : ''; o.onClose && o.onClose(v); }
  var api2 = { el: ov, close: close, body: $('.modal-b', ov) };
  ov.addEventListener('click', function (e) { if (e.target === ov && o.dismiss !== false) close(); if (e.target.closest('[data-x]')) close(); });
  document.body.appendChild(ov); document.body.style.overflow = 'hidden';
  _modals.push(api2);
  o.onOpen && o.onOpen(ov, api2);
  var f = $('input:not([type=hidden]):not([readonly]),textarea,select', $('.modal-b', ov)); if (f && !o.noFocus && window.innerWidth > 767) setTimeout(function () { f.focus(); }, 40);
  return api2;
}
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && _modals.length) _modals[_modals.length - 1].close(); });
function confirmBox(msg, opt) {
  opt = opt || {};
  return new Promise(function (res) {
    var m = modal({ title: opt.title || 'Konfirmasi', size: 'sm', body: '<div style="white-space:pre-line">' + esc(msg) + '</div>', onClose: function (v) { res(!!v); },
      foot: '<button class="btn btn-outline" data-no>Batal</button><button class="btn ' + (opt.danger ? 'btn-danger' : 'btn-primary') + '" data-yes>' + esc(opt.ok || 'Ya, lanjutkan') + '</button>' });
    $('[data-no]', m.el).onclick = function () { m.close(false); };
    $('[data-yes]', m.el).onclick = function () { m.close(true); };
  });
}
function promptBox(title, label, def) {
  return new Promise(function (res) {
    var m = modal({ title: title, size: 'sm', body: '<div class="field"><label>' + esc(label) + '</label><input class="inp" id="pbV" value="' + esc(def || '') + '"></div>', onClose: function (v) { res(v || ''); },
      foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="pbOk">OK</button>' });
    $('#pbOk', m.el).onclick = function () { m.close($('#pbV', m.el).value.trim()); };
    $('#pbV', m.el).onkeydown = function (e) { if (e.key === 'Enter') $('#pbOk', m.el).click(); };
  });
}
function btnBusy(btn, on) { if (!btn) return; btn.classList.toggle('loading', !!on); btn.disabled = !!on; }
function formData(root) {
  var o = {};
  $$('[name]', root).forEach(function (el) { if (el.type === 'checkbox') o[el.name] = el.checked; else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else o[el.name] = el.value.trim(); });
  return o;
}

// ---------------------------------------------------------------- Tooltip chart
var _tip;
function showTip(e, text) { if (!_tip) { _tip = h('<div class="tip"></div>'); document.body.appendChild(_tip); } _tip.textContent = text; _tip.style.left = e.clientX + 'px'; _tip.style.top = e.clientY + 'px'; _tip.hidden = false; }
function hideTip() { if (_tip) _tip.hidden = true; }
document.addEventListener('mouseover', function (e) { var t = e.target.closest && e.target.closest('[data-tip]'); if (t) showTip(e, t.getAttribute('data-tip')); else hideTip(); });
document.addEventListener('mousemove', function (e) { if (_tip && !_tip.hidden) { _tip.style.left = e.clientX + 'px'; _tip.style.top = e.clientY + 'px'; } });

// ---------------------------------------------------------------- Chart SVG ringan (tanpa library)
function smoothPath(pts, lo, hi) {
  if (!pts.length) return '';
  var cl = function (y) { return lo == null ? y : Math.max(lo, Math.min(hi, y)); };
  var d = 'M' + pts[0][0] + ',' + pts[0][1];
  for (var i = 0; i < pts.length - 1; i++) {
    var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = cl(p1[1] + (p2[1] - p0[1]) / 6), c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = cl(p2[1] - (p3[1] - p1[1]) / 6);
    d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
  }
  return d;
}
/** o = {labels[], values[] (null boleh), min, max, height, ref:{y,label}, suffix, highlight:index} */
function lineChart(o) {
  var W = 640, H = o.height || 220, pl = 36, pr = 12, pt = 16, pb = 30;
  var vals = o.values.map(function (v) { return v == null || v === '' ? null : Number(v); });
  var defined = vals.filter(function (v) { return v != null; });
  var min = o.min != null ? o.min : Math.floor(Math.min.apply(null, defined.concat([100])) / 10) * 10 - 10;
  var max = o.max != null ? o.max : 100;
  if (defined.length && Math.min.apply(null, defined) < min) min = Math.max(0, Math.floor(Math.min.apply(null, defined) / 10) * 10);
  if (min < 0) min = 0;
  var n = vals.length, sx = function (i) { return pl + (n <= 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (n - 1)); }, sy = function (v) { return pt + (1 - (v - min) / (max - min || 1)) * (H - pt - pb); };
  var gid = 'g' + Math.random().toString(36).slice(2, 7);
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || 'grafik garis') + '"><defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1E3A5F" stop-opacity=".22"/><stop offset="1" stop-color="#1E3A5F" stop-opacity="0"/></linearGradient></defs>';
  var steps = 4;
  for (var k = 0; k <= steps; k++) { var v = min + (max - min) * k / steps, y = sy(v); s += '<line class="gl" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '"/><text class="ax" x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(v) + (o.suffix || '') + '</text>'; }
  var segs = [], cur = [];
  vals.forEach(function (v, i) { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([sx(i), sy(v), i]); });
  if (cur.length) segs.push(cur);
  segs.forEach(function (sg) {
    var path = smoothPath(sg, pt, H - pb);
    if (sg.length > 1) s += '<path d="' + path + ' L' + sg[sg.length - 1][0] + ',' + (H - pb) + ' L' + sg[0][0] + ',' + (H - pb) + ' Z" fill="url(#' + gid + ')"/>';
    s += '<path d="' + path + '" fill="none" stroke="#1E3A5F" stroke-width="2.5" stroke-linecap="round"/>';
  });
  if (o.ref) { var ry = sy(o.ref.y); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + ry + '" y2="' + ry + '" stroke="#DC2626" stroke-width="1.5" stroke-dasharray="6 5"/><text x="' + (W - pr) + '" y="' + (ry - 6) + '" text-anchor="end" font-size="11" fill="#DC2626">' + esc(o.ref.label) + '</text>'; }
  vals.forEach(function (v, i) {
    if (v == null) return;
    var hl = o.highlight === i;
    s += '<circle class="dot-tip" cx="' + sx(i) + '" cy="' + sy(v) + '" r="' + (hl ? 6 : 4.5) + '" fill="' + (hl ? '#F5A623' : '#fff') + '" stroke="' + (hl ? '#fff' : '#1E3A5F') + '" stroke-width="2.2" data-tip="' + esc(o.labels[i] + ': ' + fmtN(v) + (o.suffix || '')) + '"/>';
  });
  var every = Math.ceil(n / (o.maxLabels || 8));
  o.labels.forEach(function (l, i) { if (i % every === 0 || i === n - 1) s += '<text class="ax" x="' + sx(i) + '" y="' + (H - 8) + '" text-anchor="middle"' + (o.highlight === i ? ' font-weight="700" fill="#1A1A2E"' : '') + '>' + esc(l) + '</text>'; });
  return '<div class="chart">' + s + '</svg></div>';
}
/** o = {labels[], values[], highlight:index, max, height, ref:{y,label}} */
function barChart(o) {
  var W = 400, H = o.height || 230, pb = 30, pt = 24, n = o.values.length || 1, gap = 14, bw = Math.min(70, (W - gap * (n + 1)) / n);
  var max = o.max || Math.max.apply(null, o.values.concat([1]));
  var total = n * bw + (n - 1) * gap, x0 = (W - total) / 2;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || 'grafik batang') + '">';
  o.values.forEach(function (v, i) {
    var x = x0 + i * (bw + gap), bh = Math.max(2, (Number(v) || 0) / max * (H - pb - pt)), y = H - pb - bh, hl = o.highlight === i;
    s += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="6" fill="' + (hl ? '#1E3A5F' : '#E2E0FC') + '" data-tip="' + esc(o.labels[i] + ': ' + fmtN(v)) + '"/>';
    s += '<text x="' + (x + bw / 2) + '" y="' + (y - 7) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#43474E">' + fmtN(v) + '</text>';
    s += '<text class="ax" style="font-size:13px" x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle"' + (hl ? ' font-weight="700" fill="#1A1A2E"' : '') + '>' + esc(o.labels[i]) + '</text>';
  });
  if (o.ref) { var ry = H - pb - o.ref.y / max * (H - pb - pt); s += '<line x1="0" x2="' + W + '" y1="' + ry + '" y2="' + ry + '" stroke="#F5A623" stroke-width="1.5" stroke-dasharray="5 5"/>'; }
  return '<div class="chart">' + s + '</svg></div>';
}
function donut(parts, size) {
  size = size || 120; var r = size / 2 - 10, c = 2 * Math.PI * r, off = 0, tot = parts.reduce(function (a, p) { return a + p.v; }, 0) || 1;
  var s = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="#EEF0F6" stroke-width="14"/>';
  parts.forEach(function (p) { var len = p.v / tot * c; s += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + p.c + '" stroke-width="14" stroke-dasharray="' + len + ' ' + (c - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')" data-tip="' + esc(p.l + ': ' + p.v) + '"/>'; off += len; });
  return s + '</svg>';
}

// ---------------------------------------------------------------- Pager & tabel lokal
function paginate(arr, page, per) { var pages = Math.max(1, Math.ceil(arr.length / per)); page = Math.min(Math.max(1, page), pages); return { rows: arr.slice((page - 1) * per, page * per), page: page, pages: pages, from: arr.length ? (page - 1) * per + 1 : 0, to: Math.min(page * per, arr.length), total: arr.length }; }
function pagerHtml(p, label) {
  var btns = [], add = function (i) { btns.push('<button data-pg="' + i + '" class="' + (i === p.page ? 'on' : '') + '">' + i + '</button>'); };
  if (p.pages <= 7) for (var i = 1; i <= p.pages; i++) add(i);
  else { add(1); if (p.page > 3) btns.push('<span class="muted">…</span>'); for (var j = Math.max(2, p.page - 1); j <= Math.min(p.pages - 1, p.page + 1); j++) add(j); if (p.page < p.pages - 2) btns.push('<span class="muted">…</span>'); add(p.pages); }
  return '<div class="pager"><div>Menampilkan <b>' + p.from + '–' + p.to + '</b> dari <b>' + p.total + '</b> ' + esc(label || 'data') + '</div><div class="pg"><button data-pg="' + (p.page - 1) + '" ' + (p.page <= 1 ? 'disabled' : '') + ' aria-label="Sebelumnya">' + ic('chevron-left') + '</button>' + btns.join('') + '<button data-pg="' + (p.page + 1) + '" ' + (p.page >= p.pages ? 'disabled' : '') + ' aria-label="Berikutnya">' + ic('chevron-right') + '</button></div></div>';
}
function emptyHtml(title, sub, icon) { return '<div class="empty">' + ic(icon || 'inbox') + '<b>' + esc(title) + '</b>' + (sub ? '<div>' + esc(sub) + '</div>' : '') + '</div>'; }

// ---------------------------------------------------------------- Ekspor
function downloadBlob(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
function downloadCSV(name, headers, rows) {
  var q = function (v) { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var csv = '﻿' + [headers].concat(rows).map(function (r) { return r.map(q).join(','); }).join('\r\n');
  downloadBlob(name, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  var sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  var rows = [], row = [], cur = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  rows = rows.filter(function (r) { return r.join('').trim(); });
  var hd = (rows.shift() || []).map(function (x) { return x.trim(); });
  return rows.map(function (r) { var o = {}; hd.forEach(function (k, i) { o[k] = (r[i] || '').trim(); }); return o; });
}
function readFileB64(file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res({ name: file.name, mime: file.type || 'application/octet-stream', data: String(r.result).split(',')[1], size: file.size }); }; r.onerror = rej; r.readAsDataURL(file); }); }
function compressImage(src, maxW, q) {
  return new Promise(function (res, rej) {
    var draw = function (img) { var w = img.videoWidth || img.naturalWidth || img.width, hh = img.videoHeight || img.naturalHeight || img.height, sc = Math.min(1, maxW / w); var c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(hh * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q || 0.72)); };
    if (src instanceof HTMLVideoElement || src instanceof HTMLCanvasElement) return draw(src);
    var img = new Image(); img.onload = function () { draw(img); }; img.onerror = rej; img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
  });
}

// ---------------------------------------------------------------- Geolokasi
function getPosition(timeout) {
  return new Promise(function (res, rej) {
    if (!navigator.geolocation) return rej(new Error('Perangkat tidak mendukung GPS.'));
    navigator.geolocation.getCurrentPosition(function (p) { res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); },
      function (e) { rej(new Error(e.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan browser.' : e.code === 3 ? 'GPS terlalu lama merespons. Coba di area terbuka.' : 'Lokasi tidak dapat dibaca.')); },
      { enableHighAccuracy: true, timeout: timeout || 15000, maximumAge: 10000 });
  });
}
function haversine(a, b, c, d) { var R = 6371000, t = Math.PI / 180, x = (c - a) * t, y = (d - b) * t, q = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * t) * Math.cos(c * t) * Math.sin(y / 2) * Math.sin(y / 2); return 2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)); }

// ---------------------------------------------------------------- Barcode CODE-128B (SVG)
var C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
function code128Svg(text, height) {
  text = String(text || '').replace(/[^\x20-\x7E]/g, '');
  var codes = [104], sum = 104;
  for (var i = 0; i < text.length; i++) { var v = text.charCodeAt(i) - 32; codes.push(v); sum += v * (i + 1); }
  codes.push(sum % 103); codes.push(106);
  var x = 10, bars = '';
  codes.forEach(function (c) { var p = C128[c]; for (var j = 0; j < p.length; j++) { var w = Number(p[j]); if (j % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + w + '" height="' + (height || 50) + '"/>'; x += w; } });
  return '<svg viewBox="0 0 ' + (x + 10) + ' ' + (height || 50) + '" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#0F172A" aria-label="Barcode ' + esc(text) + '">' + bars + '</svg>';
}

// ---------------------------------------------------------------- Lazy loader skrip eksternal
var _libs = {};
function loadCss(href) { if (_libs[href]) return _libs[href]; _libs[href] = new Promise(function (res) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = res; l.onerror = res; document.head.appendChild(l); }); return _libs[href]; }
function rp(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
function loadLib(src) { if (_libs[src]) return _libs[src]; _libs[src] = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = function () { delete _libs[src]; rej(new Error('Gagal memuat pustaka')); }; document.head.appendChild(s); }); return _libs[src]; }

// ---------------------------------------------------------------- Materi helpers
function ytId(url) { var m = String(url || '').match(/(?:embed\/|v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : ''; }
function materiUrl(m) {
  var u = m.url_konten || '';
  if (DEMO) { var d = u.match(/drive\.google\.com\/file\/d\/([^/]+)/); if (d) { var local = DemoServer.fileUrl(d[1]); if (local) return local; } }
  return u;
}
var MAPEL_WARNA = ['#1E3A5F', '#2D486D', '#6B4500', '#0F766E', '#7C3AED', '#9D174D', '#1D4ED8', '#B45309', '#374151'];
function mapelWarna(n) { var x = 0; String(n).split('').forEach(function (c) { x += c.charCodeAt(0); }); return MAPEL_WARNA[x % MAPEL_WARNA.length]; }
function mapelIcon(n) { n = String(n).toLowerCase(); return /matematika/.test(n) ? 'sigma' : /fisika/.test(n) ? 'atom' : /kimia/.test(n) ? 'flask-conical' : /biologi/.test(n) ? 'dna' : /inggris|indonesia|bahasa/.test(n) ? 'languages' : /agama/.test(n) ? 'book-heart' : /sejarah/.test(n) ? 'landmark' : 'book-open'; }
