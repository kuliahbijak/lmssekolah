/* =====================================================================
   SIAKAD SISWA v2.1 — app.js : login, shell (sidebar/topbar/bottom-nav)
   per peran (Super Admin · Guru · Siswa), sesi, bootstrap SWR,
   prefetch batch saat idle, lonceng notifikasi, akun & password,
   verifikasi kwitansi publik (#kwitansi=…).
   ===================================================================== */
'use strict';

/** Menu per peran. Flag: sa (Super Admin), keu (bendahara/hak keuangan), gurux (akun terhubung data guru) */
var MENU_DEF = {
  guru: [
    { sec: 'Super Admin', sa: true },
    { p: 'monitoring', t: 'Monitoring Guru & Siswa', i: 'radar', sa: true },
    { p: 'akun', t: 'Kelola Akun', i: 'users-round', sa: true },
    { p: 'lokasi', t: 'Lokasi & Geofence', i: 'map-pinned', sa: true },
    { p: 'keamanan', t: 'Keamanan', i: 'shield-check', sa: true },
    { sec: 'Akademik' },
    { p: 'dashboard', t: 'Dashboard', i: 'layout-dashboard' },
    { p: 'presensi', t: 'Presensi Saya', i: 'map-pin-check', gurux: true },
    { p: 'siswa', t: 'Data Siswa', i: 'users' },
    { p: 'jadwal', t: 'Jadwal Pelajaran', i: 'calendar-days' },
    { p: 'absensi', t: 'Absensi Siswa', i: 'scan-line' },
    { p: 'materi', t: 'Materi', i: 'book-open' },
    { p: 'penilaian', t: 'Penilaian', i: 'clipboard-pen-line' },
    { p: 'laporan', t: 'Laporan', i: 'chart-line' },
    { sec: 'Keuangan', keu: true },
    { p: 'tagihan', t: 'Tagihan & Pembayaran', i: 'wallet', keu: true },
    { sec: 'Komunikasi & Data', sa: true },
    { p: 'notifikasi', t: 'WhatsApp & Notifikasi', i: 'message-circle', sa: true },
    { p: 'crm', t: 'CRM Kontak', i: 'contact', sa: true },
    { p: 'migrasi', t: 'Migrasi Data', i: 'database-zap', sa: true },
    { sec: 'Sistem', sa: false },
    { p: 'pengaturan', t: 'Pengaturan', i: 'settings' }
  ],
  siswa: [
    { sec: 'Navigasi Siswa' },
    { p: 'dashboard', t: 'Beranda', i: 'house' },
    { p: 'absensi', t: 'Absensi Saya', i: 'map-pin-check' },
    { p: 'materi', t: 'Materi Pelajaran', i: 'book-open' },
    { p: 'nilai', t: 'Nilai Saya', i: 'award' },
    { p: 'jadwal', t: 'Jadwal', i: 'calendar-days' },
    { p: 'tagihan', t: 'Tagihan Saya', i: 'wallet' },
    { p: 'akun', t: 'Akun Saya', i: 'user-round-cog' }
  ]
};
function menuItems() {
  var list = MENU_DEF[regRole()].filter(function (m) { return pageAllowed(m) || (m.sec && !m.sa && !m.keu); });
  return list.filter(function (m, i) { if (!m.sec) return true; var nx = list[i + 1]; return nx && !nx.sec; });   // buang judul seksi kosong
}
function bottomItems() {
  if (isSiswa()) return [['dashboard', 'Beranda', 'house'], ['absensi', 'Absensi', 'map-pin-check'], ['nilai', 'Nilai', 'award'], ['tagihan', 'Tagihan', 'wallet'], ['_menu', 'Menu', 'layout-grid']];
  if (isSA()) return [['monitoring', 'Monitor', 'radar'], ['akun', 'Akun', 'users-round'], ['absensi', 'Absensi', 'scan-line'], ['tagihan', 'Tagihan', 'wallet'], ['_menu', 'Menu', 'layout-grid']];
  var b = [['dashboard', 'Beranda', 'layout-dashboard']];
  if (isGuruX()) b.push(['presensi', 'Presensi', 'map-pin-check']);
  b.push(['absensi', 'Absensi', 'scan-line']);
  b.push(isKeu() ? ['tagihan', 'Tagihan', 'wallet'] : ['penilaian', 'Nilai', 'clipboard-pen-line']);
  if (b.length < 4) b.push(['materi', 'Materi', 'book-open']);
  b.push(['_menu', 'Menu', 'layout-grid']);
  return b;
}
var LOGO = 'assets/logo.svg';

// ---------------------------------------------------------------- Sesi
function saveSession() { Store.set('session', { token: AppState.token, role: AppState.role, email: AppState.email, nama: AppState.nama, ref: AppState.ref, hak: AppState.hak, exp: AppState.exp }); }
function loadSession() { var s = Store.get('session', null); if (s && s.exp > Date.now() && s.token) { Object.assign(AppState, s); return true; } return false; }
window.onSessionExpired = function () {
  if (!AppState.token) return;
  Store.del('session'); AppState.token = '';
  toast('Sesi Anda berakhir. Silakan login kembali.', 'warn');
  showLogin();
};
function logout() {
  Store.del('session'); Store.clearUser(AppState.email);
  var tt = $('#toasts'); if (tt) tt.innerHTML = '';
  while (_modals.length) _modals[_modals.length - 1].close();
  AppState = Object.assign(AppState, { token: '', role: '', email: '', nama: '', ref: '', hak: '', boot: null });
  location.hash = '';
  showLogin();
}

// ---------------------------------------------------------------- Bootstrap data (SWR)
var _bootFlight = null;
function bootAction() { return isSiswa() ? 'siswa.bootstrap' : 'guru.bootstrap'; }
function refreshBoot(force) {
  if (_bootFlight && !force) return _bootFlight;
  var navSig = shellSig();
  _bootFlight = swr('boot', bootAction(), {}, function (data) {
    var first = !AppState.boot;
    AppState.boot = data;
    if (data.akun && data.akun.hak !== undefined) { AppState.hak = data.akun.hak; saveSession(); }
    if (!first && shellSig() !== navSig) { showApp(true); return; }      // hak/peran berubah → menu dibangun ulang
    if (first) { renderShellMeta(); route(); }
    else { renderShellMeta(); markAllDirty(true); }
  }, { fresh: 60000, force: !!force, silent: !!AppState.boot, onError: function (res) { if (!AppState.boot) $('#content').innerHTML = errorBox(res.message, 'refreshBoot(true)'); } })
    .finally(function () { _bootFlight = null; });
  return _bootFlight;
}
function shellSig() { return [AppState.role, isKeu(), isGuruX()].join('|'); }
/** Dipanggil setelah aksi tulis berhasil: segarkan bootstrap di latar */
function afterWrite() { return refreshBoot(true); }
function cfg(k, d) { var c = (AppState.boot && AppState.boot.cfg) || {}; return c[k] === undefined || c[k] === '' ? d : c[k]; }

// ---------------------------------------------------------------- Boot aplikasi
async function bootApp() {
  if (/^#kwitansi=/.test(location.hash)) { showKwitansiPublik(decodeURIComponent(location.hash.replace(/^#kwitansi=/, ''))); removeSplash(); return; }
  if (CFG_SALAH) { showKonfigSalah(); removeSplash(); return; }
  if (DEMO) DemoServer.ready().catch(function (e) { toast(e.message, 'bad'); });
  if (loadSession()) {
    var c = Store.get(userKey('boot'), null);
    if (c) AppState.boot = c.data;
    showApp();
  } else showLogin();
  removeSplash();
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 120000 && AppState.token) refreshBoot();
  });
}
function removeSplash() { var sp = $('#splash'); if (sp) { sp.style.opacity = 0; setTimeout(function () { sp.remove(); }, 200); } }
document.addEventListener('DOMContentLoaded', bootApp);
window.addEventListener('hashchange', function () { if (/^#kwitansi=/.test(location.hash)) showKwitansiPublik(decodeURIComponent(location.hash.replace(/^#kwitansi=/, ''))); });

function showKonfigSalah() {
  $('#root').innerHTML = '<div class="login-wrap"><div class="login-card"><div class="login-logo"><div><img src="' + LOGO + '" alt=""></div></div><h1 class="login-title">Konfigurasi belum lengkap</h1>' +
    '<div class="note warn mt16">' + ic('triangle-alert') + '<div>File <span class="kbd">js/config.js</span> masih berisi contoh (<i>GANTI…</i>). Isi <b>GAS_URL</b> dengan URL Web App Apps Script Anda yang berakhiran <span class="kbd">/exec</span>, lalu muat ulang halaman.</div></div></div></div>';
}

// ---------------------------------------------------------------- Login
var loginRole = 'siswa';
function showLogin() {
  document.body.style.overflow = '';
  var root = $('#root');
  root.innerHTML = '<div class="login-wrap"><form class="login-card" id="loginForm" autocomplete="on" novalidate>' +
    '<div class="login-logo"><div><img src="' + LOGO + '" alt="Logo sekolah" id="loginLogo"></div></div>' +
    '<h1 class="login-title" id="loginSchool">SIAKAD SISWA</h1>' +
    '<div class="login-sub">Sistem Informasi Akademik Siswa – Login Akses</div><hr>' +
    '<div class="seg" role="tablist"><button type="button" data-role="siswa" role="tab">Siswa</button><button type="button" data-role="guru" role="tab">Guru / Admin</button></div>' +
    '<div class="field mt24"><label for="lgId" id="lgIdLbl">Email / NIS</label><div class="inp-ic lg">' + ic('user') + '<input class="inp" id="lgId" name="id" autocomplete="username" required></div></div>' +
    '<div class="field mt16"><label for="lgPw">Password</label><div class="inp-ic lg">' + ic('lock') + '<input class="inp" id="lgPw" name="password" type="password" autocomplete="current-password" placeholder="Masukkan kata sandi akun" required><button type="button" class="eye" aria-label="Tampilkan password">' + ic('eye') + '</button></div></div>' +
    '<div class="row between mt16"><label class="chk"><input type="checkbox" name="remember" id="lgRemember"> Ingat saya</label><a href="#" id="lgForgot" class="small b" style="text-decoration:none">Lupa Password?</a></div>' +
    '<div id="lgErr" class="note bad mt16" hidden></div>' +
    '<button class="btn btn-dark btn-lg btn-block mt16" id="lgBtn" type="submit">MASUK KE SISTEM ' + ic('arrow-right') + '</button>' +
    '<div class="demo-box" id="demoBox" hidden></div>' +
    '<div class="login-foot">© ' + new Date().getFullYear() + ' SIAKAD SISWA | All Rights Reserved<div class="xs">v' + esc(CFG.VERSION || '2.1') + ' — Google Apps Script Edition' + (DEMO ? ' • Mode Demo' : '') + '</div></div>' +
    '</form></div>';
  var f = $('#loginForm');
  function setRole(r) {
    loginRole = r;
    $$('.seg button', f).forEach(function (b) { b.classList.toggle('on', b.dataset.role === r); b.setAttribute('aria-selected', b.dataset.role === r); });
    $('#lgIdLbl').textContent = r === 'guru' ? 'Email / NUPTK' : 'Email / NIS';
    $('#lgId').placeholder = r === 'guru' ? 'Email guru, NUPTK, atau email Super Admin' : 'Masukkan Email atau NIS (contoh: 20230101)';
  }
  setRole(Store.get('lastRole', 'siswa'));
  $$('.seg button', f).forEach(function (b) { b.onclick = function () { setRole(b.dataset.role); }; });
  $('.eye', f).onclick = function () { var p = $('#lgPw'); p.type = p.type === 'password' ? 'text' : 'password'; this.innerHTML = ic(p.type === 'password' ? 'eye' : 'eye-off'); };
  $('#lgForgot').onclick = function (e) { e.preventDefault(); forgotFlow($('#lgId').value); };
  var remembered = Store.get('lastId', ''); if (remembered) { $('#lgId').value = remembered; $('#lgRemember').checked = true; }
  f.onsubmit = async function (e) {
    e.preventDefault();
    var id = $('#lgId').value.trim(), pw = $('#lgPw').value, btn = $('#lgBtn'), err = $('#lgErr');
    err.hidden = true;
    if (!id || !pw) { err.hidden = false; err.innerHTML = ic('circle-alert') + '<div>Email/NIS dan password wajib diisi.</div>'; return; }
    btnBusy(btn, true);
    var res = await api('login', { id: id, password: pw, role: loginRole, remember: $('#lgRemember').checked, appUrl: DEMO ? '' : location.origin + location.pathname });
    btnBusy(btn, false);
    if (!res.success) { err.hidden = false; err.innerHTML = ic('circle-alert') + '<div>' + esc(res.message) + '</div>'; $('#lgPw').select(); return; }
    Store.set('lastRole', loginRole);
    if ($('#lgRemember').checked) Store.set('lastId', id); else Store.del('lastId');
    var d = res.data;
    Object.assign(AppState, { token: d.token, role: d.role, email: d.email, nama: d.nama, ref: d.ref, hak: d.hak || '', exp: d.exp, boot: d.boot });
    saveSession();
    Store.set(userKey('boot'), { t: Date.now(), h: hashStr(JSON.stringify(d.boot)), data: d.boot });
    location.hash = d.role === 'superadmin' ? '#/monitoring' : '#/dashboard';
    showApp();
    toast(res.message, 'ok');
    if (d.wajibGantiSandi) setTimeout(function () { gantiPassword(true); }, 400);
  };
  // info publik sekolah (logo & nama) — cache dulu
  var pub = Store.get('public', null);
  function applyPub(p) { if (!p) return; if (p.logo) $('#loginLogo').src = p.logo; $('#loginLogo').alt = p.namaSekolah || 'Logo'; if (!DEMO && p.demo) demoBox(null); }
  applyPub(pub);
  if (DEMO) DemoServer.ready().then(function () { if ($('#loginForm')) demoBox(window.__DEMO_PW || {}); });
  api('config.public', {}).then(function (r) { if (r.success) { Store.set('public', r.data); if ($('#loginForm')) applyPub(r.data); } });
  warmUpServer('pub');
  function demoBox(pw) {
    var box = $('#demoBox'); if (!box) return;
    box.hidden = false;
    if (!pw) { box.innerHTML = ic('info') + '<div>Data contoh masih terpasang. Kredensial akun contoh tampil <b>sekali</b> di log setup Apps Script — segera ganti sandi atau hapus data contoh.</div>'; return; }
    box.innerHTML = ic('info') + '<div><div>Akses Demo Akun:</div>' +
      '<div><b>Super Admin:</b> <button type="button" data-demo="guru" data-pw="sa">admin@sekolah.sch.id</button> / ' + esc(pw.sa) + '</div>' +
      '<div><b>Guru:</b> <button type="button" data-demo="guru" data-pw="guru">guru@sekolah.sch.id</button> / ' + esc(pw.guru) + '</div>' +
      '<div><b>Bendahara:</b> <button type="button" data-demo="guru" data-pw="guru">endang@sekolah.sch.id</button> / ' + esc(pw.guru) + '</div>' +
      '<div><b>Siswa:</b> <button type="button" data-demo="siswa" data-pw="siswa">siswa@sekolah.sch.id</button> / ' + esc(pw.siswa) + '</div></div>';
    $$('[data-demo]', box).forEach(function (b) { b.onclick = function () { setRole(b.dataset.demo); $('#lgId').value = b.textContent; $('#lgPw').value = pw[b.dataset.pw] || ''; $('#lgPw').focus(); }; });
  }
}

function forgotFlow(prefill) {
  var m = modal({ title: 'Lupa Password', sub: 'Kode reset dikirim ke WhatsApp orang tua / email terdaftar.', size: 'sm',
    body: '<div id="fg1"><div class="field"><label>Email / NIS / NUPTK</label><input class="inp" name="id" value="' + esc(prefill || '') + '"></div></div>' +
      '<div id="fg2" hidden><div class="note ok" id="fgMsg"></div><div class="field mt16"><label>Kode 6 digit</label><input class="inp mono" name="kode" inputmode="numeric" maxlength="6"></div><div class="field mt12"><label>Password baru</label><input class="inp" name="baru" type="password" minlength="6"></div></div>' +
      '<div class="note mt16">' + ic('shield') + '<div>Super Admin yang lupa sandi dapat memulihkan akun dengan menjalankan fungsi <span class="kbd">resetSuperAdmin()</span> di editor Apps Script.</div></div>',
    foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="fgBtn">Kirim Kode</button>' });
  var step = 1;
  $('#fgBtn', m.el).onclick = async function () {
    var btn = this, d = formData(m.el);
    btnBusy(btn, true);
    if (step === 1) {
      var r = await api('auth.forgot', { id: d.id });
      btnBusy(btn, false);
      if (!r.success) return toast(r.message, 'bad');
      if (!r.data.sent) { $('#fg1', m.el).insertAdjacentHTML('beforeend', '<div class="note warn mt12">' + ic('info') + '<div>' + esc(r.message) + '</div></div>'); return; }
      step = 2; $('#fg1', m.el).hidden = true; $('#fg2', m.el).hidden = false; $('#fgMsg', m.el).innerHTML = ic('circle-check') + '<div>' + esc(r.message) + '</div>'; btn.textContent = 'Simpan Password';
    } else {
      var r2 = await api('auth.resetConfirm', { id: d.id, kode: d.kode, baru: d.baru });
      btnBusy(btn, false);
      if (toastRes(r2)) m.close();
    }
  };
}

// ---------------------------------------------------------------- Shell
function showApp(keepRoute) {
  var role = AppState.role, root = $('#root');
  var nav = menuItems().map(function (m) { return m.sec ? '<div class="side-sec">' + esc(m.sec) + '</div>' : '<a class="nav-a" href="#/' + m.p + '" data-nav="' + m.p + '" title="' + esc(m.t) + '">' + ic(m.i) + '<span>' + esc(m.t) + '</span></a>'; }).join('');
  var bottom = bottomItems().map(function (b) { return '<a href="' + (b[0] === '_menu' ? '#' : '#/' + b[0]) + '" data-bnav="' + b[0] + '">' + ic(b[2]) + '<span>' + b[1] + '</span></a>'; }).join('');
  var sub = isSA() ? 'Panel Super Admin' : role === 'guru' ? 'Panel Guru' : 'Portal Siswa';
  root.innerHTML = '<div class="shell">' +
    '<aside class="side" aria-label="Navigasi utama"><div class="side-brand"><img class="logo" src="' + LOGO + '" alt=""><div><b>SIAKAD</b><small>' + (isSA() ? 'Super Admin' : role === 'guru' ? 'Siswa Academic' : 'Portal Siswa') + '</small></div></div>' +
    '<nav class="side-nav">' + nav + '</nav>' +
    '<div class="side-user"><span class="av" id="sideAv">' + esc(initials(AppState.nama)) + '</span><div class="grow"><b class="ellipsis" id="sideName">' + esc(AppState.nama) + '</b><small id="sideSub">' + esc(isSA() ? 'Super Admin' : (role === 'guru' ? 'NIP. ' : 'NIS. ') + AppState.ref) + '</small></div><button class="btn-ic" id="btnLogout" title="Keluar" aria-label="Keluar">' + ic('log-out') + '</button></div></aside>' +
    '<div class="main">' + (DEMO ? '<div class="demo-ribbon">MODE DEMO<span class="hide-m"> — data contoh tersimpan di browser ini. Isi <span class="kbd">GAS_URL</span> di js/config.js untuk memakai server.</span> <button id="demoReset">Reset data demo</button></div>' : '') +
    '<header class="topbar"><div class="crumb"><img class="logo hide-m" src="' + LOGO + '" alt=""><span class="hide-m">' + sub + '</span><span class="hide-m muted">/</span><b id="crumbTitle">Dashboard</b></div><div class="sp"></div>' +
    '<button class="btn-ic" id="btnSync" title="Muat ulang data" aria-label="Muat ulang data">' + ic('refresh-cw') + '</button>' +
    '<button class="btn-ic bell" id="btnBell" title="Notifikasi & pengumuman" aria-label="Notifikasi">' + ic('bell') + '<span class="dot" id="bellDot" hidden>0</span></button>' +
    '<button class="me-chip" id="meChip">' + avatar(AppState.nama, '', 'sm') + '<div><b class="ellipsis" style="max-width:160px">' + esc(AppState.nama) + '</b><small>' + esc(roleLabel()) + '</small></div></button></header>' +
    '<main class="content" id="content"></main>' +
    '<nav class="bottom-nav" aria-label="Navigasi bawah">' + bottom + '</nav></div></div>';
  $('#btnLogout').onclick = async function () { if (await confirmBox('Keluar dari SIAKAD?', { ok: 'Keluar' })) logout(); };
  $('#meChip').onclick = accountMenu;
  $('#btnBell').onclick = showNotifikasi;
  $('#btnSync').onclick = async function () { var b = this; b.querySelector('svg').classList.add('spin'); await refreshBoot(true); markAllDirty(true); b.querySelector('svg').classList.remove('spin'); toast('Data diperbarui.', 'ok'); };
  var bm = $('[data-bnav="_menu"]'); if (bm) bm.onclick = function (e) { e.preventDefault(); moreMenu(); };
  if ($('#demoReset')) $('#demoReset').onclick = async function () { if (await confirmBox('Hapus semua perubahan demo dan kembali ke data contoh awal?', { danger: true, ok: 'Reset' })) { DemoServer.reset(); Store.del('session'); location.hash = ''; location.reload(); } };
  if (AppState.boot) { renderShellMeta(); markAllDirty(false); route(); } else $('#content').innerHTML = skeletonPage();
  if (!keepRoute) refreshBoot();
  if (!isSiswa()) { prefetchStaf(); if (isSA()) warmUpServer('admin'); }
}
function skeletonPage() { return '<div class="sk" style="height:60px;max-width:420px"></div><div class="grid g4 mt24">' + '<div class="sk" style="height:140px"></div>'.repeat(4) + '</div><div class="grid g-main mt24"><div class="sk" style="height:320px"></div><div class="sk" style="height:320px"></div></div>'; }
function renderShellMeta() {
  var b = AppState.boot; if (!b) return;
  var me = isSiswa() ? b.profil : b.me;
  if (me) {
    var nm = me.nama_lengkap || AppState.nama;
    $('#sideName') && ($('#sideName').textContent = nm);
    var chip = $('#meChip'); if (chip) chip.innerHTML = avatar(nm, me.foto_profil_url, 'sm') + '<div><b class="ellipsis" style="max-width:170px;display:block">' + esc(nm) + '</b><small>' + esc(isSiswa() ? ('Kelas ' + (me.nama_kelas || '') + ' • NIS ' + me.NIS) : isSA() ? 'Super Admin' + (akunInfo().terhubungGuru ? ' • ' + (me.mata_pelajaran || 'Guru') : '') : (me.jabatan || 'Guru Pengampu') + (isKeu() ? ' • Keuangan' : '')) + '</small></div>';
  }
  var seen = Store.get(userKey('annSeen'), 0), baru = (b.pengumuman || []).filter(function (p) { return new Date(p.tanggal).getTime() > seen; }).length;
  var n = baru + (Number(akunInfo().notifBelum) || 0);
  var dot = $('#bellDot'); if (dot) { dot.hidden = !n; dot.textContent = n > 99 ? '99+' : n; }
}
function setActiveNav(name, def) {
  $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.dataset.nav === name); });
  var inBottom = bottomItems().some(function (b) { return b[0] === name; });
  $$('[data-bnav]').forEach(function (a) { a.classList.toggle('on', a.dataset.bnav === name || (!inBottom && a.dataset.bnav === '_menu')); });
  var item = MENU_DEF[regRole()].filter(function (m) { return m.p === name; })[0];
  if ($('#crumbTitle')) $('#crumbTitle').textContent = item ? item.t : (def.title || '');
}
function moreMenu() {
  var ov = h('<div class="overlay" style="align-items:flex-end;padding:0"></div>');
  var cur = currentRoute().name;
  var sheet = h('<div class="sheet-menu"><div class="grab"></div><div class="gridm">' + menuItems().filter(function (m) { return m.p; }).map(function (m) { return '<a href="#/' + m.p + '" class="' + (m.p === cur ? 'on' : '') + '">' + ic(m.i) + esc(m.t) + '</a>'; }).join('') +
    (isSiswa() ? '' : '<a href="#" data-acc>' + ic('user-round-cog') + 'Akun Saya</a>') + '<a href="#" data-out>' + ic('log-out') + 'Keluar</a></div></div>');
  function close() { ov.remove(); sheet.remove(); }
  ov.onclick = close;
  sheet.onclick = function (e) { var a = e.target.closest('a'); if (!a) return; if (a.hasAttribute('data-out')) { e.preventDefault(); close(); logout(); return; } if (a.hasAttribute('data-acc')) { e.preventDefault(); close(); accountMenu(); return; } close(); };
  document.body.appendChild(ov); document.body.appendChild(sheet);
}
function accountMenu() {
  if (isSiswa()) return go('akun');
  var b = AppState.boot || {}, me = b.me || {}, ak = akunInfo();
  var m = modal({ title: 'Akun Saya', size: 'md',
    body: '<div class="row gap12">' + avatar(me.nama_lengkap || AppState.nama, me.foto_profil_url, 'lg') + '<div><b style="font-size:16px">' + esc(me.nama_lengkap || AppState.nama) + '</b><div class="muted small">' + esc(AppState.email) + '</div><div class="row gap4 mt8 wrap"><span class="bdg ' + (isSA() ? 'navy' : 'info') + '">' + esc(roleLabel()) + '</span>' + (isKeu() ? '<span class="bdg amber">' + ic('wallet') + 'Keuangan</span>' : '') + (AppState.ref ? '<span class="bdg">NUPTK ' + esc(AppState.ref) + '</span>' : '') + '</div></div></div>' +
      '<div class="mt16" id="accGeo"></div>' +
      '<div class="note mt16">' + ic('clock') + '<div>Sesi berlaku sampai ' + new Date(AppState.exp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + '.' + (isSA() ? ' Sesi Super Admin maksimal 8 jam.' : '') + '</div></div>',
    foot: '<button class="btn btn-outline" id="accPw">' + ic('key-round') + 'Ganti Password</button><button class="btn btn-danger" id="accOut">' + ic('log-out') + 'Keluar</button>' });
  if (window.geoAkunCard) geoAkunCard($('#accGeo', m.el), ak);
  $('#accPw', m.el).onclick = function () { m.close(); gantiPassword(false); };
  $('#accOut', m.el).onclick = function () { m.close(); logout(); };
}
function gantiPassword(wajib) {
  var minSA = isSA();
  var m = modal({ title: wajib ? 'Ganti Password Awal' : 'Ganti Password', sub: wajib ? 'Demi keamanan, ganti password awal Anda sekarang.' : 'Perangkat lain akan otomatis keluar.', size: 'sm', dismiss: !wajib,
    body: '<div class="field"><label>Password lama</label><input class="inp" type="password" name="lama" autocomplete="current-password"></div><div class="field mt12"><label>Password baru</label><input class="inp" type="password" name="baru" autocomplete="new-password" minlength="' + (minSA ? 12 : 6) + '"><div class="hint">' + (minSA ? 'Super Admin: minimal 12 karakter berisi huruf dan angka.' : 'Minimal 6 karakter.') + '</div></div><div class="field mt12"><label>Ulangi password baru</label><input class="inp" type="password" name="baru2" autocomplete="new-password"></div>',
    foot: (wajib && !minSA ? '<button class="btn btn-ghost" data-x>Nanti saja</button>' : '<button class="btn btn-outline" data-x>Batal</button>') + '<button class="btn btn-primary" id="pwSave">Simpan</button>' });
  $('#pwSave', m.el).onclick = async function () {
    var d = formData(m.el);
    if (d.baru !== d.baru2) return toast('Ulangi password baru tidak sama.', 'bad');
    btnBusy(this, true);
    var r = await api('me.password', { lama: d.lama, baru: d.baru });
    btnBusy(this, false);
    if (toastRes(r)) { AppState.token = r.data.token; AppState.exp = r.data.exp; saveSession(); m.close(); }
  };
}

/** Lonceng: notifikasi pribadi (tagihan, verifikasi, dll.) + pengumuman sekolah */
function showNotifikasi() {
  var list = (AppState.boot && AppState.boot.pengumuman) || [];
  Store.set(userKey('annSeen'), Date.now());
  var m = modal({ title: 'Notifikasi', sub: 'Pemberitahuan untuk akun Anda & pengumuman sekolah', drawer: true,
    body: '<div class="tabs" id="ntfTabs"><button data-t="saya" class="on">' + ic('bell') + 'Untuk Saya</button><button data-t="ann">' + ic('megaphone') + 'Pengumuman (' + list.length + ')</button></div><div id="ntfBody" class="mt16"><div class="sk" style="height:180px"></div></div>',
    foot: (!isSiswa() ? '<button class="btn btn-outline" id="annNew">' + ic('plus') + 'Buat Pengumuman</button>' : '') + '<button class="btn btn-primary" id="ntfRead">' + ic('check-check') + 'Tandai semua dibaca</button>' });
  var tab = 'saya', rows = null;
  function draw() {
    $$('#ntfTabs button', m.el).forEach(function (b) { b.classList.toggle('on', b.dataset.t === tab); });
    var box = $('#ntfBody', m.el);
    if (tab === 'ann') { box.innerHTML = list.length ? list.map(function (p, i) { return '<div class="ann ' + (i % 2 ? 'amber' : '') + '"><div class="meta"><span>' + relTime(p.tanggal) + '</span><span class="bdg ' + (p.kategori === 'Event' ? 'amber' : 'info') + '">' + esc(String(p.kategori || '').toUpperCase()) + '</span></div><h4>' + esc(p.judul) + '</h4><p style="white-space:pre-line">' + esc(p.isi) + '</p></div>'; }).join('') : emptyHtml('Belum ada pengumuman', '', 'megaphone'); return; }
    if (!rows) return;
    var tone = { success: 'ok', danger: 'bad', warning: 'warn', tagihan: 'amber', info: 'info' };
    box.innerHTML = rows.length ? rows.map(function (n) { return '<div class="ntf ' + (n.dibaca === 'YA' ? '' : 'baru') + '" data-link="' + esc(n.link || '') + '"><span class="ic bdg ' + (tone[n.tipe] || 'info') + '">' + ic(n.tipe === 'tagihan' ? 'wallet' : n.tipe === 'success' ? 'circle-check' : n.tipe === 'danger' ? 'circle-x' : n.tipe === 'warning' ? 'triangle-alert' : 'info') + '</span><div class="grow"><b>' + esc(n.judul) + '</b><p>' + esc(n.pesan) + '</p><small>' + esc(relTime(n.tanggal)) + '</small></div></div>'; }).join('') : emptyHtml('Belum ada notifikasi', 'Pemberitahuan tagihan, verifikasi pembayaran, dan lainnya tampil di sini.', 'bell');
  }
  $$('#ntfTabs button', m.el).forEach(function (b) { b.onclick = function () { tab = b.dataset.t; draw(); }; });
  $('#ntfBody', m.el).onclick = function (e) { var x = e.target.closest('[data-link]'); if (x && x.dataset.link) { m.close(); go(x.dataset.link); } };
  $('#ntfRead', m.el).onclick = async function () { btnBusy(this, true); var r = await api('notif.read', {}); btnBusy(this, false); if (r.success) { (rows || []).forEach(function (n) { n.dibaca = 'YA'; }); akunInfo().notifBelum = 0; renderShellMeta(); draw(); } };
  if ($('#annNew', m.el)) $('#annNew', m.el).onclick = function () { m.close(); editPengumuman(); };
  swr('notif.mine', 'notif.mine', {}, function (d) { rows = d.rows; akunInfo().notifBelum = d.belum; renderShellMeta(); draw(); }, { fresh: 0, onError: function (r) { $('#ntfBody', m.el).innerHTML = errorBox(r.message); } });
  renderShellMeta();
}
var showPengumuman = showNotifikasi;

/** Prefetch menu staf saat idle — digabung otomatis jadi 1 panggilan batch (gas-scale-turbo 4.4) */
function prefetchStaf() {
  var run = function () {
    var list = [];
    if (isSA()) list = ['sa.monitor', 'sa.akun.list', 'lokasi.list', 'notif.config', 'crm.stats', 'wa.blastList', 'config.get', 'rahasia.status'];
    else list = ['config.get'];
    if (isKeu()) list = list.concat(['billing.list', 'billing.pending', 'biaya.list']);
    if (isGuruX()) list.push('presensi.saya');
    list.forEach(function (a) {
      apiQ(a, {}).then(function (r) { if (r && r.success) Store.set(userKey('a:' + a), { t: Date.now(), h: hashStr(JSON.stringify(r.data)), data: r.data }); });
    });
  };
  (window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(run, { timeout: 4000 });
}
var prefetchGuru = prefetchStaf;

/** Halaman publik verifikasi kwitansi (dari QR) — tanpa login */
async function showKwitansiPublik(kode) {
  $('#root').innerHTML = '<div class="login-wrap"><div class="login-card" style="max-width:460px"><div class="login-logo"><div><img src="' + LOGO + '" alt=""></div></div><h1 class="login-title">Verifikasi Kwitansi</h1><div class="login-sub">Cek keaslian kwitansi pembayaran sekolah</div><hr><div id="kwBox"><div class="sk" style="height:120px"></div></div><a class="btn btn-outline btn-block mt16" href="#" id="kwBack">' + ic('arrow-left') + 'Ke halaman login</a></div></div>';
  $('#kwBack').onclick = function (e) { e.preventDefault(); location.hash = ''; if (loadSession()) showApp(); else showLogin(); };
  var r = await api('kwitansi.verify', { kode: kode });
  var d = r.data || {};
  $('#kwBox').innerHTML = r.success && d.valid ?
    '<div class="radar"><span class="pulse ok">' + ic('badge-check') + '</span><div><b>Kwitansi ASLI</b><div class="small">' + esc(d.institusi || '') + '</div></div></div><dl class="kv-list mt16"><dt>No. Kwitansi</dt><dd class="mono b">' + esc(d.noKwitansi) + '</dd><dt>Atas nama</dt><dd>' + esc(d.nama) + '</dd><dt>Total</dt><dd class="b">' + rp(d.total) + '</dd><dt>Tanggal</dt><dd>' + esc(tglIndo(d.tanggal)) + '</dd><dt>Jumlah tagihan</dt><dd>' + d.jumlahTagihan + '</dd></dl>' :
    '<div class="radar"><span class="pulse bad">' + ic('shield-x') + '</span><div><b>Kwitansi tidak dikenal</b><div class="small">' + esc(r.message || 'Kode tidak cocok.') + '</div></div></div><div class="note warn mt16">' + ic('triangle-alert') + '<div>Pastikan Anda memindai QR dari kwitansi resmi. Hubungi bendahara sekolah bila ragu.</div></div>';
}
