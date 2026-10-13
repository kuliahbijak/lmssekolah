/* =====================================================================
   SIAKAD SISWA v2.1 — pages-guru.js : Panel Guru & Super Admin
   Dashboard, Data Siswa (+form & kartu barcode), Jadwal, Absensi (scan),
   Materi, Penilaian, Laporan, Pengaturan.
   ===================================================================== */
'use strict';

// ---------------------------------------------------------------- Helper data bootstrap
function B() { return AppState.boot || {}; }
function kelasById(id) { return (B().kelas || []).filter(function (k) { return k.kelas_id === id; })[0]; }
function kelasNama(id) { var k = kelasById(id); return k ? k.nama_kelas : (id || 'Semua Kelas'); }
function guruById(id) { return (B().guru || []).filter(function (g) { return String(g.NUPTK) === String(id); })[0]; }
function guruNama(id) { var g = guruById(id); return g ? g.nama_lengkap : (id || '-'); }
function siswaByNIS(nis) { return (B().siswa || []).filter(function (s) { return String(s.NIS) === String(nis); })[0]; }
function kelasOpts(sel, all) { return (all ? '<option value="">' + esc(all) + '</option>' : '') + (B().kelas || []).map(function (k) { return '<option value="' + esc(k.kelas_id) + '"' + (k.kelas_id === sel ? ' selected' : '') + '>' + esc(k.nama_kelas) + ' (' + esc(k.jenjang) + ')</option>'; }).join(''); }
function mapelOpts(sel, all) { return (all ? '<option value="">' + esc(all) + '</option>' : '') + (B().mapel || []).map(function (m) { return '<option' + (m.nama === sel ? ' selected' : '') + '>' + esc(m.nama) + '</option>'; }).join(''); }
function guruOpts(sel, all) { return (all ? '<option value="">' + esc(all) + '</option>' : '') + (B().guru || []).map(function (g) { return '<option value="' + esc(g.NUPTK) + '"' + (String(g.NUPTK) === String(sel) ? ' selected' : '') + '>' + esc(g.nama_lengkap) + '</option>'; }).join(''); }
function kkm() { return Number(cfg('KKM', 70)); }
function predikatOf(n) { if (n === '' || n == null) return ''; n = Number(n); return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= kkm() ? 'C' : 'D'; }
function akhirOf(hh, u, a) {
  if (hh === '' || u === '' || a === '' || hh == null || u == null || a == null) return '';
  var bh = Number(cfg('BOBOT_HARIAN', 40)), bu = Number(cfg('BOBOT_UTS', 30)), ba = Number(cfg('BOBOT_UAS', 30));
  return Math.round((Number(hh) * bh + Number(u) * bu + Number(a) * ba) / ((bh + bu + ba) || 100) * 10) / 10;
}
function statusBadge(st) { var c = { Hadir: 'amber', Izin: 'info', Sakit: 'warn', Alpha: 'bad' }[st] || ''; return '<span class="bdg dot ' + c + '">' + esc(st || '-') + '</span>'; }
function metodeBadge(m) { var map = { barcode: ['barcode', 'Barcode'], selfie: ['camera', 'Selfie GPS'], lokasi: ['map-pin', 'Lokasi GPS'], manual: ['file-pen-line', 'Manual'] }, x = map[m] || ['circle', m || '-']; return '<span class="bdg info">' + ic(x[0]) + esc(x[1]) + '</span>'; }
function pageHead(eyebrow, title, sub, acts) { return '<div class="ph"><div class="grow"><div class="eyebrow">' + eyebrow + '</div><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' + (acts ? '<div class="acts">' + acts + '</div>' : '') + '</div>'; }
function kpi(label, value, sub, icon, tone, extra) { return '<div class="card kpi' + (extra && extra.click ? ' click" data-kpi="' + extra.click : '') + '"><div class="kl">' + label + '</div><div class="ki ' + (tone || '') + '">' + ic(icon) + '</div><div class="kv">' + value + '</div><div class="ks">' + (sub || '') + '</div></div>'; }
function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }

// =====================================================================
// DASHBOARD GURU
// =====================================================================
registerPage('guru', 'dashboard', {
  title: 'Dashboard',
  st: { trend: 'harian' },
  render: function (el) {
    var b = B(), st = this.st, s = b.stats || {}, me = b.me || {};
    var tdy = cfg('today', todayStr());
    var baruMinggu = (b.materi || []).filter(function (m) { return Date.now() - new Date(m.tanggal_upload).getTime() < 7 * 864e5; }).length;
    var belum = s.totalSiswa - s.hadirHariIni;
    var ak = akunInfo(), pr = ak.presensiHariIni;
    el.innerHTML =
      '<div class="ph"><div class="grow"><div class="eyebrow">Tahun Ajaran ' + esc(cfg('TAHUN_AJARAN', '')) + ' <span>• Semester ' + esc(cfg('SEMESTER', '')) + '</span></div><h1>Selamat Datang, ' + esc(me.nama_lengkap || AppState.nama) + '</h1><p>Berikut ringkasan kehadiran siswa, progres kurikulum, dan evaluasi terkini.</p></div>' +
      '<div class="acts"><span class="btn btn-soft" style="cursor:default">' + ic('calendar') + esc(tglHari(tdy)) + '</span><a class="btn btn-primary" href="#/penilaian">' + ic('plus') + 'Input Nilai Baru</a></div></div>' +
      (isGuruX() ? '<a class="presensi-banner ' + (pr && pr.jam_masuk ? (pr.jam_pulang ? 'done' : 'in') : 'todo') + '" href="#/presensi">' + ic(pr && pr.jam_masuk ? 'map-pin-check' : 'map-pin') + '<div class="grow"><b>' + (pr && pr.jam_pulang ? 'Presensi hari ini lengkap' : pr && pr.jam_masuk ? 'Sudah presensi masuk pukul ' + esc(jam5(pr.jam_masuk)) : 'Anda belum presensi masuk hari ini') + '</b><small>' + (pr && pr.jam_masuk && !pr.jam_pulang ? 'Jangan lupa presensi pulang mulai ' + esc(cfg('JAM_PULANG_GURU', '15:00')) : 'Presensi berbasis lokasi GPS perangkat') + '</small></div><span class="btn btn-sm ' + (pr && pr.jam_pulang ? 'btn-soft' : 'btn-accent') + '">' + (pr && pr.jam_pulang ? 'Riwayat' : 'Presensi') + ' ' + ic('arrow-right') + '</span></a>' : '') +
      '<div class="grid g4">' +
      kpi('Total Siswa', fmtN(s.totalSiswa), 'Semester ini<div class="mt8"><span class="pill">' + ic('users') + s.L + ' L • ' + (s.totalSiswa - s.L) + ' P</span></div>', 'users', '', { click: 'siswa' }) +
      kpi('Kehadiran Hari Ini', fmtN(s.persenHariIni) + '<small>%</small>', s.hadirHariIni + ' dari ' + s.totalSiswa + ' hadir<div class="mt8"><span class="pill" style="background:var(--amber-bg);color:var(--amber-ink)">' + ic('user-x') + belum + ' belum hadir / izin</span></div>', 'user-check', 'amber', { click: 'absensi' }) +
      kpi('Materi Aktif', fmtN(s.materiAktif), 'Semua kelas<div class="mt8"><span class="pill">' + ic('file-plus') + '+' + baruMinggu + ' minggu ini</span></div>', 'book-open', '', { click: 'materi' }) +
      kpi('Rata-rata Nilai', s.rataNilai == null ? '-' : fmtN(s.rataNilai), 'Semua mata pelajaran<div class="mt8"><span class="pill">' + ic('trending-up') + 'KKM ' + kkm() + (s.rataNilai != null ? ' • ' + (s.rataNilai >= kkm() ? '+' : '') + fmtN(s.rataNilai - kkm()) + ' poin' : '') + '</span></div>', 'chart-column', '', { click: 'laporan' }) +
      '</div>' +
      '<div class="grid g-main mt24"><div class="card"><div class="card-h"><div class="grow"><h3>Tren Kehadiran</h3><p id="trSub"></p></div><div class="tabs light" id="trTabs"><button data-t="harian">7 Hari</button><button data-t="mingguan">Mingguan</button></div></div><div class="card-b" id="trChart"></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>Distribusi Nilai per Kelas</h3><p>Rata-rata nilai akhir (0–100)</p></div><span class="pill">' + (b.kelas || []).length + ' Kelas</span></div><div class="card-b" id="kelasChart"></div></div></div>' +
      '<div class="card mt24"><div class="card-h"><span class="kpi" style="padding:0;min-height:0"><span class="ki red" style="position:static">' + ic('triangle-alert') + '</span></span><div class="grow"><h3>Siswa Perlu Perhatian (Kehadiran &lt; ' + esc(cfg('BATAS_KEHADIRAN', 75)) + '%)</h3><p>Kehadiran berisiko tidak memenuhi syarat ketuntasan semester.</p></div><span class="bdg amber dot">' + (b.perhatian || []).length + ' siswa ditandai</span></div><div class="card-b" id="attnTbl"></div></div>' +
      '<div class="grid g2 mt24"><div class="card"><div class="card-h"><div class="grow"><h3>Materi Terbaru</h3></div><a href="#/materi" class="small b">Lihat Semua</a></div><div class="card-b" id="latestMat"></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>Input Nilai Terakhir</h3></div><a href="#/penilaian" class="small b">Buka Buku Nilai</a></div><div class="card-b" id="latestNilai"></div></div></div>';
    $$('[data-kpi]', el).forEach(function (k) { k.onclick = function () { go(k.dataset.kpi); }; });
    var self = this;
    $$('#trTabs button', el).forEach(function (bt) { bt.onclick = function () { st.trend = bt.dataset.t; self.drawTrend(el); }; });
    this.drawTrend(el);
    // Distribusi per kelas
    var kl = (b.kelas || []).filter(function (k) { return s.rataKelas && s.rataKelas[k.kelas_id] != null; });
    var waliIdx = -1; kl.forEach(function (k, i) { if (String(k.wali_kelas_id) === String(AppState.ref)) waliIdx = i; });
    $('#kelasChart', el).innerHTML = kl.length ? barChart({ labels: kl.map(function (k) { return k.nama_kelas; }), values: kl.map(function (k) { return s.rataKelas[k.kelas_id]; }), highlight: waliIdx, max: 100, ref: { y: kkm() } }) +
      '<div class="row between mt12 small" style="background:var(--surface-2);padding:8px 12px;border-radius:8px"><span><i style="display:inline-block;width:10px;height:10px;background:#1E3A5F;border-radius:2px;margin-right:6px"></i>Kelas perwalian Anda</span><span class="amber b">KKM Minimal: ' + kkm() + '</span></div>' : emptyHtml('Belum ada nilai', 'Input nilai di menu Penilaian', 'chart-column');
    // Perlu perhatian
    var at = (b.perhatian || []).slice(0, 8);
    $('#attnTbl', el).innerHTML = at.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>Nama Siswa</th><th>Kelas</th><th>Total Absen</th><th>Kehadiran</th><th class="tr">Aksi</th></tr></thead><tbody>' +
      at.map(function (x, i) { var sw = siswaByNIS(x.NIS) || {}; return '<tr><td class="mono">' + String(i + 1).padStart(2, '0') + '</td><td><div class="who">' + avatar(x.nama, sw.foto_profil_url) + '<div><b>' + esc(x.nama) + '</b><small>NIS: ' + esc(x.NIS) + '</small></div></div></td><td>' + esc(kelasNama(x.kelas_id)) + '</td><td><span class="bdg">' + x.absen + ' Pertemuan</span></td><td class="red b" style="font-size:16px">' + fmtN(x.persen) + '%</td><td class="tr"><button class="btn btn-primary btn-sm" data-siswa="' + esc(x.NIS) + '">Lihat Profil</button></td></tr>'; }).join('') + '</tbody></table></div>'
      : emptyHtml('Semua siswa aman', 'Tidak ada siswa dengan kehadiran di bawah batas.', 'shield-check');
    $$('[data-siswa]', el).forEach(function (bt) { bt.onclick = function () { siswaDetail(bt.dataset.siswa); }; });
    // Materi terbaru
    var mt = (b.materi || []).slice().sort(function (a, c) { return String(c.tanggal_upload).localeCompare(String(a.tanggal_upload)); }).slice(0, 3);
    $('#latestMat', el).innerHTML = mt.length ? mt.map(function (m) { return '<div class="list-i" style="cursor:pointer" data-mat="' + esc(m.materi_id) + '"><span class="ic">' + ic(m.tipe === 'video' ? 'circle-play' : 'file-text') + '</span><div class="grow"><b class="ellipsis">' + esc(m.judul) + '</b><div class="row wrap gap4 mt8"><span class="bdg info">' + esc(m.mata_pelajaran) + '</span><small>' + esc(kelasNama(m.kelas_id)) + '</small></div></div><div class="tr small nowrap"><div class="muted">' + relTime(m.tanggal_upload) + '</div><div class="amber b">' + (m.tipe === 'video' ? esc(m.durasi || 'Video') : fmtSize(m.ukuran) || 'Dokumen') + '</div></div></div>'; }).join('') : emptyHtml('Belum ada materi', '', 'book-open');
    $$('[data-mat]', el).forEach(function (x) { x.onclick = function () { bukaMateri(x.dataset.mat); }; });
    // Nilai terakhir (dikelompokkan per kelas + mapel)
    var grp = {};
    (b.nilai || []).forEach(function (n) { if (n.nilai_akhir === '') return; var k = n.kelas_id + '|' + n.mata_pelajaran, g = grp[k] = grp[k] || { kelas: n.kelas_id, mapel: n.mata_pelajaran, t: '', sum: 0, n: 0, tuntas: 0 }; g.sum += Number(n.nilai_akhir); g.n++; if (Number(n.nilai_akhir) >= kkm()) g.tuntas++; if (String(n.diperbarui_pada) > g.t) g.t = n.diperbarui_pada; });
    var gl = Object.keys(grp).map(function (k) { return grp[k]; }).sort(function (a, c) { return String(c.t).localeCompare(String(a.t)); }).slice(0, 3);
    $('#latestNilai', el).innerHTML = gl.length ? gl.map(function (g) { var r = g.sum / g.n, tp = pct(g.tuntas, g.n); return '<div class="list-i" style="cursor:pointer" data-nl="' + esc(g.kelas + '|' + g.mapel) + '"><span class="ic">' + ic('clipboard-check') + '</span><div class="grow"><b class="ellipsis">Nilai ' + esc(g.mapel) + '</b><div class="row wrap gap4 mt8"><span class="bdg info">' + esc(kelasNama(g.kelas)) + '</span><small>' + g.n + ' Siswa • ' + relTime(g.t) + '</small></div></div><div class="tr small nowrap"><span class="pill">Rata: ' + fmtN(r) + '</span><div class="mt8 ' + (tp < 100 ? 'amber' : 'muted') + '">' + (tp < 100 ? 'Tuntas ' + fmtN(tp) + '%' : 'Tuntas: 100%') + '</div></div></div>'; }).join('') : emptyHtml('Belum ada nilai', '', 'clipboard');
    $$('[data-nl]', el).forEach(function (x) { x.onclick = function () { var p = x.dataset.nl.split('|'); var pg = Pages.guru.penilaian; pg.st.kelas = p[0]; pg.st.mapel = p[1]; pg.dirty = true; go('penilaian'); }; });
  },
  drawTrend: function (el) {
    var t = (B().trend || {}), st = this.st;
    $$('#trTabs button', el).forEach(function (x) { x.classList.toggle('on', x.dataset.t === st.trend); });
    if (st.trend === 'harian') {
      var hr = t.harian || [], vals = hr.map(function (x) { return x.persen; }), def = vals.filter(function (v) { return v != null; });
      var avg = def.length ? def.reduce(function (a, v) { return a + v; }, 0) / def.length : null, peak = -1, pv = -1;
      vals.forEach(function (v, i) { if (v != null && v > pv) { pv = v; peak = i; } });
      $('#trSub', el).textContent = 'Rata-rata harian 7 hari terakhir' + (avg != null ? ' • rata-rata ' + fmtN(avg) + '%' : '') + (peak > -1 ? ' • puncak ' + hr[peak].hari + ' (' + fmtN(pv) + '%)' : '');
      $('#trChart', el).innerHTML = lineChart({ labels: hr.map(function (x) { return x.hari.substring(0, 3); }), values: vals, highlight: peak, min: 0, max: 100, suffix: '%', ref: { y: Number(cfg('BATAS_KEHADIRAN', 75)), label: 'Batas ' + cfg('BATAS_KEHADIRAN', 75) + '%' } });
    } else {
      var mg = t.mingguan || [];
      $('#trSub', el).textContent = 'Rata-rata kehadiran per pekan semester berjalan';
      $('#trChart', el).innerHTML = mg.length ? lineChart({ labels: mg.map(function (x) { return x.label.replace('Pekan ', 'P'); }), values: mg.map(function (x) { return x.persen; }), min: 50, max: 100, suffix: '%', highlight: mg.length - 1, ref: { y: Number(cfg('BATAS_KEHADIRAN', 75)), label: 'Batas kritis' } }) : emptyHtml('Belum ada data', '', 'chart-line');
    }
  }
});

// =====================================================================
// DATA SISWA
// =====================================================================
registerPage('guru', 'siswa', {
  title: 'Data Siswa',
  st: { q: '', kelas: '', jenjang: '', status: '', akun: '', page: 1, per: 10, sel: {} },
  init: function (el) {
    var st = this.st, self = this;
    el.innerHTML = pageHead('<span class="bdg navy" style="margin-right:8px">SIAKAD SISWA</span> Panel Guru // Kelola Data Akademik', 'Data Induk Siswa', 'Kelola data induk siswa, aktivasi akun, status registrasi kelas, cetak kartu barcode, dan kelengkapan berkas akademik siswa tahun ajaran berjalan.',
      '<button class="btn btn-outline" id="sExport">' + ic('download') + 'Export Data <span class="muted xs">(CSV)</span></button><button class="btn btn-outline" id="sPrint">' + ic('printer') + 'Cetak Massal Barcode ID</button><a class="btn btn-dark" href="#/siswa-form/baru">' + ic('user-plus') + 'Tambah Siswa Baru</a>') +
      '<div class="grid g4" id="sKpi"></div>' +
      '<div class="card mt24"><div class="toolbar"><div class="field search"><div class="inp-ic">' + ic('search') + '<input class="inp" id="sQ" placeholder="Cari nama siswa, NIS, atau barcode ID"></div></div>' +
      '<div class="field"><select class="sel" id="sKelas"></select></div><div class="field"><select class="sel" id="sJenjang"><option value="">Jenjang: Semua</option><option>SD</option><option>SMP</option><option>SMA</option></select></div>' +
      '<div class="field"><select class="sel" id="sStatus"><option value="">Status: Semua</option><option>Aktif</option><option>Nonaktif</option><option>Lulus</option><option>Pindah</option><option value="akun-belum">Akun belum aktif</option></select></div>' +
      '<div class="row gap12"><select class="sel" id="sBulk" style="min-width:170px"><option value="">Tindakan Massal</option>' + (isSA() ? '<option value="aktivasi">Aktifkan akun</option><option value="nonaktifkanAkun">Nonaktifkan akun</option>' : '') + '<option value="pindahKelas">Pindah kelas…</option><option value="status">Ubah status…</option><option value="cetak">Cetak kartu terpilih</option>' + (isSA() ? '<option value="blast">Kirim WA ke ortu terpilih</option><option value="hapus">Hapus siswa…</option>' : '') + '</select><button class="btn btn-ghost" id="sReset">Reset Filter</button></div></div>' +
      '<div id="sTable"></div></div><div class="print-only" id="sPrintArea"></div>';
    var rer = function () { st.page = 1; self.table(el); };
    $('#sQ', el).oninput = debounce(function () { st.q = this.value; rer(); }, 250);
    $('#sKelas', el).onchange = function () { st.kelas = this.value; rer(); };
    $('#sJenjang', el).onchange = function () { st.jenjang = this.value; rer(); };
    $('#sStatus', el).onchange = function () { st.status = this.value; rer(); };
    $('#sReset', el).onclick = function () { st.q = st.kelas = st.jenjang = st.status = ''; st.sel = {}; $('#sQ', el).value = ''; $('#sKelas', el).value = ''; $('#sJenjang', el).value = ''; $('#sStatus', el).value = ''; rer(); };
    $('#sExport', el).onclick = function () {
      var rows = self.filtered();
      downloadCSV('data-siswa-' + todayStr() + '.csv', ['NIS', 'NISN', 'Nama Lengkap', 'JK', 'Kelas', 'Jenjang', 'Barcode ID', 'Email', 'Nama Ortu', 'WA Ortu', 'Tempat Lahir', 'Tanggal Lahir', 'Alamat', 'Status', 'Akun'],
        rows.map(function (s) { return [s.NIS, s.NISN, s.nama_lengkap, s.jenis_kelamin, kelasNama(s.kelas_id), s.jenjang, s.barcode_id, s.email, s.nama_ortu, s.no_wa_ortu, s.tempat_lahir, s.tanggal_lahir, s.alamat, s.status, s.akun === 'YA' ? 'Aktif' : 'Belum aktif']; }));
    };
    $('#sPrint', el).onclick = function () { cetakKartu(self.filtered()); };
    $('#sBulk', el).onchange = function () { var a = this.value; this.value = ''; if (a) self.bulk(a, el); };
    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]'); if (!t) return;
      var nis = t.dataset.nis, act = t.dataset.act;
      if (act === 'view') siswaDetail(nis);
      else if (act === 'edit') go('siswa-form', nis);
      else if (act === 'print') cetakKartu([siswaByNIS(nis)]);
      else if (act === 'del') self.hapus(nis);
      else if (act === 'pg') { st.page = Number(t.dataset.pg); self.table(el); }
    });
    el.addEventListener('change', function (e) {
      if (e.target.matches('[data-chk]')) { var n = e.target.dataset.chk; if (e.target.checked) st.sel[n] = 1; else delete st.sel[n]; e.target.closest('tr').classList.toggle('sel', e.target.checked); }
      if (e.target.matches('#sAll')) { self.pageRows.forEach(function (s) { if (e.target.checked) st.sel[s.NIS] = 1; else delete st.sel[s.NIS]; }); self.table(el); }
      if (e.target.matches('#sPer')) { st.per = Number(e.target.value); st.page = 1; self.table(el); }
    });
    el.addEventListener('click', function (e) { var p = e.target.closest('[data-pg]'); if (p && !p.disabled && p.closest('#sTable')) { st.page = Number(p.dataset.pg); self.table(el); } });
  },
  filtered: function () {
    var st = this.st, q = st.q.toLowerCase();
    return (B().siswa || []).filter(function (s) {
      if (st.kelas && s.kelas_id !== st.kelas) return false;
      if (st.jenjang && s.jenjang !== st.jenjang) return false;
      if (st.status === 'akun-belum') { if (s.akun === 'YA') return false; } else if (st.status && (s.status || 'Aktif') !== st.status) return false;
      if (q && (s.nama_lengkap + ' ' + s.NIS + ' ' + s.NISN + ' ' + s.barcode_id + ' ' + s.email).toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) { return String(a.kelas_id).localeCompare(String(b.kelas_id)) || a.nama_lengkap.localeCompare(b.nama_lengkap); });
  },
  render: function (el) {
    var b = B(), all = b.siswa || [], aktif = all.filter(function (s) { return (s.status || 'Aktif') === 'Aktif'; });
    var L = aktif.filter(function (s) { return s.jenis_kelamin === 'L'; }).length, akunOk = all.filter(function (s) { return s.akun === 'YA'; }).length;
    var jj = { SD: 0, SMP: 0, SMA: 0 }; aktif.forEach(function (s) { if (jj[s.jenjang] !== undefined) jj[s.jenjang]++; });
    var bc = all.filter(function (s) { return s.barcode_id; }).length;
    $('#sKpi', el).innerHTML =
      kpi('Total Siswa Terdaftar', fmtN(aktif.length) + '<small class="amber b">Siswa Aktif</small>', '<span class="row gap12"><span>● ' + L + ' Laki-laki</span><span class="amber">● ' + (aktif.length - L) + ' Perempuan</span></span>', 'users') +
      kpi('Status Akun Siswa', akunOk + '<small>/' + all.length + '</small> <span class="pill">' + Math.round(pct(akunOk, all.length)) + '%</span>', '<span class="row between"><span class="amber">● ' + (all.length - akunOk) + ' Akun belum aktivasi</span><a href="#" id="kpiTinjau" class="b small">Tinjau →</a></span>', 'shield-check', 'amber') +
      kpi('Distribusi Jenjang', Object.keys(jj).filter(function (k) { return jj[k]; }).length + '<small>Jenjang Pendidikan</small>', '<span class="row gap4 wrap">' + Object.keys(jj).map(function (k) { return '<span class="bdg info">' + k + ' (' + jj[k] + ')</span>'; }).join('') + '</span>', 'landmark') +
      kpi('Barcode ID Digital', fmtN(bc) + '<small>Kartu (' + Math.round(pct(bc, all.length || 1)) + '%)</small>', ic('cloud') + ' Tersinkron Google Sheets & Drive', 'barcode');
    $('#kpiTinjau', el).onclick = function (e) { e.preventDefault(); $('#sStatus', el).value = 'akun-belum'; $('#sStatus', el).onchange(); };
    $('#sKelas', el).innerHTML = kelasOpts(this.st.kelas, 'Kelas: Semua Kelas');
    this.table(el);
  },
  table: function (el) {
    var st = this.st, rows = this.filtered(), p = paginate(rows, st.page, st.per);
    this.pageRows = p.rows; st.page = p.page;
    var allSel = p.rows.length && p.rows.every(function (s) { return st.sel[s.NIS]; });
    var nSel = Object.keys(st.sel).length;
    $('#sTable', el).innerHTML = (nSel ? '<div class="note" style="margin:0 20px 12px">' + ic('list-checks') + '<div><b>' + nSel + ' siswa dipilih.</b> Gunakan menu Tindakan Massal di atas.</div></div>' : '') +
      (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:40px"><input type="checkbox" id="sAll" ' + (allSel ? 'checked' : '') + ' aria-label="Pilih semua"></th><th>No</th><th>Foto & Nama Siswa</th><th>NIS / NISN</th><th>Kelas & Jenjang</th><th class="hide-m">Barcode ID Preview</th><th>Status Akun</th><th class="hide-m">Sesi Terakhir</th><th class="tr">Aksi</th></tr></thead><tbody>' +
        p.rows.map(function (s, i) {
          var akunOk = s.akun === 'YA';
          return '<tr class="' + (st.sel[s.NIS] ? 'sel' : '') + '"><td><input type="checkbox" data-chk="' + esc(s.NIS) + '" ' + (st.sel[s.NIS] ? 'checked' : '') + ' aria-label="Pilih ' + esc(s.nama_lengkap) + '"></td><td class="mono muted">' + String(p.from + i).padStart(2, '0') + '</td>' +
            '<td><div class="who">' + avatar(s.nama_lengkap, s.foto_profil_url, 'md') + '<div><b class="navy" style="cursor:pointer" data-act="view" data-nis="' + esc(s.NIS) + '">' + esc(s.nama_lengkap) + (akunOk ? '' : ' <span class="amber">' + ic('triangle-alert') + '</span>') + '</b><small>' + ic('mail') + ' ' + esc(s.email || '-') + '</small></div></div></td>' +
            '<td><b class="mono">' + esc(s.NIS) + '</b><div class="muted xs">NISN: ' + esc(s.NISN || '-') + '</div></td>' +
            '<td><b>' + esc(kelasNama(s.kelas_id)) + '</b><div class="mt8"><span class="bdg info">' + esc(s.jenjang || '-') + '</span>' + (s.status && s.status !== 'Aktif' ? ' <span class="bdg warn">' + esc(s.status) + '</span>' : '') + '</div></td>' +
            '<td class="hide-m"><div class="row" style="background:var(--surface-2);border-radius:8px;padding:6px 10px;gap:10px;width:max-content"><div style="width:110px">' + code128Svg(s.barcode_id, 30) + '</div><span class="mono xs b">' + esc(s.barcode_id) + '</span></div></td>' +
            '<td>' + (akunOk ? '<span class="bdg ok dot">Aktif</span>' : '<span class="bdg warn dot">Belum Aktivasi</span>') + '</td>' +
            '<td class="hide-m small">' + (s.last_login ? esc(relTime(s.last_login)) : '<i class="muted">Belum pernah</i>') + '</td>' +
            '<td class="tr nowrap"><button class="btn-ic" data-act="view" data-nis="' + esc(s.NIS) + '" title="Lihat">' + ic('eye') + '</button><button class="btn-ic" data-act="edit" data-nis="' + esc(s.NIS) + '" title="Ubah">' + ic('pencil') + '</button><button class="btn-ic hide-m" data-act="print" data-nis="' + esc(s.NIS) + '" title="Cetak kartu">' + ic('printer') + '</button>' + (isSA() ? '<button class="btn-ic" data-act="del" data-nis="' + esc(s.NIS) + '" title="Hapus">' + ic('trash-2') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + pagerHtml(p, 'siswa').replace('<div class="pg">', '<div class="pg"><select class="sel hide-m" id="sPer" style="height:34px;width:auto;margin-right:8px">' + [10, 20, 50].map(function (n) { return '<option value="' + n + '"' + (n === st.per ? ' selected' : '') + '>' + n + ' per halaman</option>'; }).join('') + '</select>')
        : emptyHtml('Tidak ada siswa', 'Ubah filter atau tambah siswa baru.', 'users'));
  },
  hapus: async function (nis) {
    var s = siswaByNIS(nis); if (!s) return;
    if (!await confirmBox('Hapus siswa ' + s.nama_lengkap + ' (NIS ' + nis + ')?\nAkun login ikut dihapus. Riwayat absensi & nilai tetap tersimpan.', { danger: true, ok: 'Hapus' })) return;
    var prev = B().siswa.slice();
    B().siswa = B().siswa.filter(function (x) { return x.NIS !== nis; }); this.render($('.page[data-page="siswa"]'));   // optimistic
    var r = await api('siswa.delete', { NIS: nis });
    if (!toastRes(r)) { B().siswa = prev; this.render($('.page[data-page="siswa"]')); } else afterWrite();
  },
  bulk: async function (aksi, el) {
    var st = this.st, nis = Object.keys(st.sel), self = this;
    if (!nis.length) return toast('Centang siswa terlebih dahulu.', 'warn');
    var list = nis.map(siswaByNIS).filter(Boolean);
    if (aksi === 'cetak') return cetakKartu(list);
    if (aksi === 'blast') { sessionStorage.setItem('blastPenerima', JSON.stringify(list.filter(function (s) { return s.no_wa_ortu; }).map(function (s) { return { hp: s.no_wa_ortu, nama: s.nama_ortu || ('Orang Tua ' + s.nama_lengkap), vars: { siswa: s.nama_lengkap, kelas: kelasNama(s.kelas_id), nis: s.NIS } }; }))); return go('notifikasi', 'blast'); }
    var nilai = '';
    if (aksi === 'pindahKelas' || aksi === 'status') {
      nilai = await new Promise(function (res) {
        var m = modal({ title: aksi === 'status' ? 'Ubah Status Siswa' : 'Pindah Kelas', sub: nis.length + ' siswa dipilih', size: 'sm', onClose: function (v) { res(v || ''); },
          body: '<select class="sel" id="bkV">' + (aksi === 'status' ? '<option>Aktif</option><option>Nonaktif</option><option>Lulus</option><option>Pindah</option>' : kelasOpts('')) + '</select>',
          foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="bkOk">Terapkan</button>' });
        $('#bkOk', m.el).onclick = function () { m.close($('#bkV', m.el).value); };
      });
      if (!nilai) return;
    } else if (!await confirmBox((aksi === 'hapus' ? 'Hapus ' : 'Terapkan ke ') + nis.length + ' siswa terpilih?', { danger: aksi === 'hapus' })) return;
    var r = await api('siswa.bulk', { nis: nis, aksi: aksi, nilai: nilai });
    if (toastRes(r)) { st.sel = {}; await afterWrite(); self.table(el); }
  }
});

/** Detail siswa (modal) */
function siswaDetail(nis) {
  var s = siswaByNIS(nis); if (!s) return toast('Siswa tidak ditemukan.', 'bad');
  var r = (B().rekapAbsen || {})[nis] || { H: 0, I: 0, S: 0, A: 0, hari: 0, persen: null };
  var nl = (B().nilai || []).filter(function (n) { return String(n.NIS) === String(nis); });
  var rata = nl.filter(function (n) { return n.nilai_akhir !== ''; }), avg = rata.length ? rata.reduce(function (a, n) { return a + Number(n.nilai_akhir); }, 0) / rata.length : null;
  var m = modal({ title: 'Profil Siswa', sub: 'NIS ' + s.NIS + ' • ' + kelasNama(s.kelas_id), size: 'lg',
    body: '<div class="grid g-main-r"><div><div class="row gap16">' + avatar(s.nama_lengkap, s.foto_profil_url, 'xl') + '<div><h3 style="font-size:20px">' + esc(s.nama_lengkap) + '</h3><div class="muted">' + esc(s.email || '') + '</div><div class="row gap4 mt8 wrap"><span class="bdg info">' + esc(kelasNama(s.kelas_id)) + '</span><span class="bdg">' + esc(s.jenjang) + '</span>' + (s.akun === 'YA' ? '<span class="bdg ok">Akun aktif</span>' : '<span class="bdg warn">Akun belum aktif</span>') + '</div></div></div>' +
      '<dl class="kv-list mt16"><dt>NISN</dt><dd class="mono">' + esc(s.NISN || '-') + '</dd><dt>Jenis Kelamin</dt><dd>' + (s.jenis_kelamin === 'P' ? 'Perempuan' : 'Laki-laki') + '</dd><dt>TTL</dt><dd>' + esc((s.tempat_lahir || '-') + ', ' + tglIndo(s.tanggal_lahir)) + '</dd><dt>Orang Tua</dt><dd>' + esc(s.nama_ortu || '-') + '</dd><dt>WA Ortu</dt><dd>' + (s.no_wa_ortu ? '<a href="' + waLink(s.no_wa_ortu) + '" target="_blank" rel="noopener">' + esc(s.no_wa_ortu) + '</a> ' + (s.StatusWA === 'Terdaftar' ? '<span class="wa-badge ya">✓ WA</span>' : s.StatusWA ? '<span class="wa-badge tidak">✕ WA</span>' : '') : '-') + '</dd><dt>Alamat</dt><dd>' + esc(s.alamat || '-') + '</dd><dt>Barcode</dt><dd class="mono">' + esc(s.barcode_id) + '</dd></dl></div>' +
      '<div><div class="card card-p" style="box-shadow:none"><div class="kl small b muted">KEHADIRAN SEMESTER</div><div class="row between mt8"><b style="font-size:28px" class="' + (r.persen != null && r.persen < Number(cfg('BATAS_KEHADIRAN', 75)) ? 'red' : '') + '">' + (r.persen == null ? '-' : fmtN(r.persen) + '%') + '</b><span class="muted small">' + r.H + '/' + r.hari + ' hari</span></div><div class="bar stack mt8">' + ['H', 'I', 'S', 'A'].map(function (k, i) { return '<i style="width:' + pct(r[k], r.hari || 1) + '%;background:' + ['#1E3A5F', '#F5A623', '#7D93B5', '#DC2626'][i] + '"></i>'; }).join('') + '</div><div class="legend mt8"><span><i style="background:#1E3A5F"></i>Hadir ' + r.H + '</span><span><i style="background:#F5A623"></i>Izin ' + r.I + '</span><span><i style="background:#7D93B5"></i>Sakit ' + r.S + '</span><span><i style="background:#DC2626"></i>Alpha ' + r.A + '</span></div></div>' +
      '<div class="card card-p mt12" style="box-shadow:none"><div class="kl small b muted">RATA-RATA NILAI</div><div class="row between mt8"><b style="font-size:28px">' + (avg == null ? '-' : fmtN(avg)) + '</b><span class="muted small">' + rata.length + ' mapel</span></div>' + nl.slice(0, 6).map(function (n) { return '<div class="row between small mt8"><span class="ellipsis">' + esc(n.mata_pelajaran) + '</span><span class="grade ' + esc(n.predikat) + '">' + fmtN(n.nilai_akhir) + '</span></div>'; }).join('') + '</div></div></div>',
    foot: (isKeu() ? '<button class="btn btn-outline" id="sdBayar">' + ic('wallet') + 'Riwayat Pembayaran</button>' : '') + (isSA() ? '<button class="btn btn-outline" id="sdReset">' + ic('key-round') + 'Reset Password</button>' : '') + '<button class="btn btn-outline" id="sdCard">' + ic('id-card') + 'Kartu Pelajar</button><button class="btn btn-primary" id="sdEdit">' + ic('pencil') + 'Ubah Data</button>' });
  $('#sdEdit', m.el).onclick = function () { m.close(); go('siswa-form', nis); };
  $('#sdCard', m.el).onclick = function () { m.close(); cetakKartu([s]); };
  if ($('#sdBayar', m.el)) $('#sdBayar', m.el).onclick = function () { m.close(); riwayatBayarModal(nis); };
  if ($('#sdReset', m.el)) $('#sdReset', m.el).onclick = async function () {
    if (!await confirmBox('Buat password baru untuk ' + s.nama_lengkap + '? Password lama tidak berlaku lagi.')) return;
    var btn = this; btnBusy(btn, true);
    var res = await api('siswa.resetPassword', { NIS: nis, kirim: true });
    btnBusy(btn, false);
    if (toastRes(res)) kredensialModal(s.nama_lengkap, res.data.email, res.data.password);
  };
}
function kredensialModal(nama, email, pw) {
  if (pw === '[DISAMARKAN]') return modal({ title: 'Kredensial Akun', size: 'sm', body: '<div class="note warn">' + ic('info') + '<div>Akun <b>' + esc(nama) + '</b> sudah dibuat pada permintaan sebelumnya, tetapi sandinya tidak disimpan demi keamanan. Gunakan <b>Reset Sandi</b> (Super Admin → Kelola Akun) untuk membuat sandi baru.</div></div>', foot: '<button class="btn btn-primary" data-x>Mengerti</button>' });
  var txt = 'Akun SIAKAD ' + nama + '\nUsername: ' + email + '\nPassword: ' + pw;
  var m = modal({ title: 'Kredensial Akun', sub: 'Simpan & bagikan ke siswa/orang tua. Password hanya tampil sekali.', size: 'sm',
    body: '<dl class="kv-list"><dt>Nama</dt><dd>' + esc(nama) + '</dd><dt>Username</dt><dd class="mono">' + esc(email) + '</dd><dt>Password</dt><dd class="mono b" style="font-size:16px">' + esc(pw) + '</dd></dl><div class="note mt16">' + ic('info') + '<div>Siswa wajib mengganti password saat login pertama.</div></div>',
    foot: '<button class="btn btn-outline" id="kCopy">' + ic('copy') + 'Salin</button><button class="btn btn-primary" data-x>Selesai</button>' });
  $('#kCopy', m.el).onclick = function () { navigator.clipboard && navigator.clipboard.writeText(txt).then(function () { toast('Disalin ke clipboard.', 'ok'); }); };
}

/** Kartu pelajar ber-barcode */
function idCardHtml(s) {
  return '<div class="idcard"><div class="top"><img src="' + LOGO + '" alt="" style="width:26px;height:26px;background:#fff;border-radius:6px;padding:2px"><div><small>KARTU TANDA PELAJAR</small><b>' + esc(cfg('NAMA_SEKOLAH', 'SIAKAD SISWA')) + '</b></div><span class="idn">ID: ' + esc(String(s.tahun_masuk || '').substring(0, 4) || '----') + '</span></div>' +
    '<div class="mid"><div class="photo">' + (s.foto_profil_url ? '<img src="' + esc(s.foto_profil_url) + '" alt="">' : esc(initials(s.nama_lengkap))) + '</div><div class="grow" style="min-width:0"><div class="nm ellipsis">' + esc(s.nama_lengkap || 'Nama Siswa') + '</div><div class="kv2">NIS: <b>' + esc(s.NIS || '-') + '</b></div><div class="kv2">Kelas: <b style="font-family:inherit">' + esc(kelasNama(s.kelas_id)) + '</b></div><span class="ver">' + ic('badge-check') + ' TERVERIFIKASI SISTEM SIAKAD</span></div></div>' +
    '<div class="bc">' + code128Svg(s.barcode_id || ('ID-' + (s.NIS || '0')), 42) + '<div>' + esc(s.barcode_id || '') + '</div></div></div>';
}
function cetakKartu(list) {
  list = (list || []).filter(Boolean);
  if (!list.length) return toast('Tidak ada siswa untuk dicetak.', 'warn');
  var w = window.open('', '_blank');
  if (!w) return toast('Izinkan pop-up untuk mencetak kartu.', 'warn');
  var css = Array.prototype.map.call(document.styleSheets, function (ss) { try { return Array.prototype.map.call(ss.cssRules, function (r) { return r.cssText; }).join('\n'); } catch (e) { return ''; } }).join('\n');
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Kartu Pelajar (' + list.length + ')</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet"><style>' + css + '\nbody{background:#fff;padding:10mm} .grid-cards{display:grid;grid-template-columns:repeat(2,85.6mm);gap:6mm} .idcard{width:85.6mm;max-width:none;box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid;font-size:90%} @page{size:A4;margin:10mm}</style></head><body><div class="grid-cards">' +
    list.map(function (s) { return idCardHtml(s).replace(/src="assets\//g, 'src="' + location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'assets/'); }).join('') + '</div><script>setTimeout(function(){window.print()},700)<\/script></body></html>');
  w.document.close();
}

// =====================================================================
// FORM TAMBAH / UBAH SISWA
// =====================================================================
registerPage('guru', 'siswa-form', {
  title: 'Form Siswa', alwaysRender: true,
  render: function (el, param) {
    var isNew = !param || param === 'baru', s = isNew ? Store.get(userKey('draftSiswa'), {}) : Object.assign({}, siswaByNIS(param) || {});
    if (!isNew && !s.NIS) { el.innerHTML = errorBox('Siswa tidak ditemukan.'); return; }
    var pw = isNew ? randomPw() : '';
    var sisaKuota = '';
    el.innerHTML = '<div class="row between wrap gap12" style="margin-bottom:8px"><a href="#/siswa" class="small b" style="text-decoration:none">' + ic('arrow-left') + ' KEMBALI KE DATA SISWA <span class="muted">// MANAJEMEN AKADEMIK</span></a><span class="pill" style="background:var(--amber-bg);color:var(--amber-ink)">● Tanda bintang (*) wajib diisi</span></div>' +
      '<div class="ph"><div class="grow"><h1>' + (isNew ? 'Tambah Siswa Baru' : 'Ubah Data Siswa') + '</h1><p>Lengkapi data identitas resmi, kredensial portal siswa, dan terbitkan kartu barcode absensi.</p></div><span class="pill">' + ic('badge-check') + 'Sinkron Google Sheets • TA ' + esc(cfg('TAHUN_AJARAN', '')) + '</span></div>' +
      '<form id="sf" novalidate>' +
      '<div class="card"><div class="step-h"><span class="no">01</span><div class="grow"><h3>Informasi Pribadi & Akademik Siswa</h3><p>Data induk untuk basis data Dapodik & buku induk sekolah</p></div><span class="bdg info hide-m">Wajib (6 kolom)</span></div><div class="card-b"><div class="grid" style="grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:24px" id="sfGrid">' +
      '<div><div class="lbl">Pasfoto Resmi Siswa</div><label class="drop" id="fotoDrop" style="aspect-ratio:3/4;display:grid;place-items:center;padding:12px;overflow:hidden">' + (s.foto_profil_url ? '<img src="' + esc(s.foto_profil_url) + '" style="width:100%;height:100%;object-fit:cover;border-radius:8px" alt="">' : '<div><div class="ic">' + ic('camera') + '</div><b>Unggah Pasfoto</b><div class="small muted">JPG/PNG maks. 2MB</div><span class="btn btn-soft btn-xs mt8">' + ic('folder-open') + 'Pilih Berkas</span></div>') + '<input type="file" accept="image/*" hidden id="fotoIn"></label><div class="xs muted tc mt8">Rasio 3:4 latar merah / biru formal</div></div>' +
      '<div class="grid-form">' +
      '<div class="field"><label>Nama Lengkap Siswa <span class="req">*</span></label><div class="inp-ic">' + ic('user') + '<input class="inp" name="nama_lengkap" value="' + esc(s.nama_lengkap || '') + '" placeholder="Sesuai akta kelahiran" required></div></div>' +
      '<div class="field c6"><label>NIS (Nomor Induk Siswa) <span class="req">*</span> <span class="bdg ok xs" id="nisOk" hidden>Tersedia</span></label><div class="inp-ic">' + ic('id-card') + '<input class="inp mono" name="NIS" value="' + esc(s.NIS || '') + '" ' + (isNew ? '' : 'readonly') + ' inputmode="numeric" required></div></div>' +
      '<div class="field c6"><label>NISN (Nasional)</label><div class="inp-ic">' + ic('hash') + '<input class="inp mono" name="NISN" value="' + esc(s.NISN || '') + '" inputmode="numeric" maxlength="10" placeholder="10 digit Kemendikbud"></div></div>' +
      '<div class="field c6"><label>Jenis Kelamin <span class="req">*</span></label><div class="grid g2" style="gap:8px" id="jkSeg"><button type="button" class="btn ' + (s.jenis_kelamin === 'P' ? 'btn-soft' : 'btn-dark') + '" data-jk="L">' + ic('mars') + 'Laki-laki</button><button type="button" class="btn ' + (s.jenis_kelamin === 'P' ? 'btn-dark' : 'btn-soft') + '" data-jk="P">' + ic('venus') + 'Perempuan</button></div><input type="hidden" name="jenis_kelamin" value="' + (s.jenis_kelamin === 'P' ? 'P' : 'L') + '"></div>' +
      '<div class="field c6"><label>Tempat & Tanggal Lahir</label><div class="row"><input class="inp" name="tempat_lahir" value="' + esc(s.tempat_lahir || '') + '" placeholder="Kota" style="flex:1"><input class="inp" type="date" name="tanggal_lahir" value="' + esc(s.tanggal_lahir || '') + '" style="flex:1.2"></div></div>' +
      '<div class="field c4"><label>Kelas / Rombel <span class="req">*</span></label><select class="sel" name="kelas_id" required>' + kelasOpts(s.kelas_id, '— Pilih kelas —') + '</select></div>' +
      '<div class="field c4"><label>Tahun Angkatan</label><input class="inp" name="tahun_masuk" value="' + esc(s.tahun_masuk || cfg('TAHUN_AJARAN', '')) + '"></div>' +
      '<div class="field c4"><label>Status</label><select class="sel" name="status">' + ['Aktif', 'Nonaktif', 'Lulus', 'Pindah'].map(function (x) { return '<option' + ((s.status || 'Aktif') === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Alamat Domisili Siswa</label><textarea class="inp" name="alamat" rows="2" placeholder="Jalan, RT/RW, Kelurahan, Kecamatan, Kota">' + esc(s.alamat || '') + '</textarea></div>' +
      '</div></div></div></div>' +
      '<div class="card mt24"><div class="step-h"><span class="no">02</span><div class="grow"><h3>Kredensial Akun & Kontak Orang Tua</h3><p>Akun login siswa untuk SIAKAD + nomor WhatsApp untuk notifikasi</p></div><span class="bdg amber hide-m">' + ic('zap') + 'Integrasi GAS Auto</span></div><div class="card-b"><div class="grid-form">' +
      '<div class="field c4"><label>Email Akun Siswa <span class="muted xs">(kosong = otomatis)</span></label><div class="inp-ic">' + ic('mail') + '<input class="inp" type="email" name="email" value="' + esc(s.email || '') + '" placeholder="nama@' + esc(cfg('EMAIL_DOMAIN_SISWA', 'siswa.sch.id')) + '"></div></div>' +
      '<div class="field c4"><label>' + (isNew ? 'Password Awal' : 'Password Baru <span class="muted xs">(kosong = tidak diubah)</span>') + '</label><div class="inp-ic">' + ic('lock') + '<input class="inp mono" name="password" value="' + esc(pw) + '" autocomplete="off"><button type="button" class="eye" id="pwGen" title="Buat acak">' + ic('refresh-cw') + '</button></div><div class="hint">Siswa wajib mengganti saat login pertama.</div></div>' +
      '<div class="field c4"><label>No. WhatsApp Orang Tua / Wali</label><div class="inp-ic">' + ic('phone') + '<input class="inp" name="no_wa_ortu" value="' + esc(s.no_wa_ortu || '') + '" inputmode="tel" placeholder="0812xxxxxxxx"></div><div class="hint">Notifikasi presensi harian & laporan nilai.</div></div>' +
      '<div class="field c4"><label>Nama Orang Tua / Wali</label><input class="inp" name="nama_ortu" value="' + esc(s.nama_ortu || '') + '"></div>' +
      '<div class="field c4"><label>No. WhatsApp Siswa <span class="muted xs">(opsional)</span></label><input class="inp" name="no_wa" value="' + esc(s.no_wa || '') + '" inputmode="tel"></div>' +
      '<div class="field c4"><label>&nbsp;</label><label class="chk"><input type="checkbox" name="kirimKredensial" ' + (isNew ? 'checked' : '') + '> Kirim kredensial otomatis via WA/Email ortu</label></div>' +
      '</div></div></div>' +
      '<div class="card mt24"><div class="step-h"><span class="no">03</span><div class="grow"><h3>Kartu Barcode Absensi</h3><p>Barcode unik untuk scanner gerbang & absensi kelas</p></div></div><div class="card-b"><div class="grid g2" style="align-items:center"><div id="cardPrev"></div>' +
      '<div><div class="row between"><b>Status Validasi Kartu</b><span class="amber small b">● Barcode ID siap diterbitkan</span></div><div class="field mt12"><label>Barcode ID</label><input class="inp mono" name="barcode_id" value="' + esc(s.barcode_id || '') + '" placeholder="Otomatis: ID-&lt;NIS&gt;"></div>' +
      '<div class="grid g2 mt12" style="gap:10px"><button type="button" class="btn btn-soft" id="bcRegen">' + ic('refresh-cw') + 'Regenerate Barcode ID</button><button type="button" class="btn btn-soft" id="bcPrint">' + ic('printer') + 'Cetak Pratinjau Kartu</button></div>' +
      '<div class="note mt16">' + ic('scan-barcode') + '<div><b>Kompatibel scanner kamera & USB</b><br>Barcode CODE-128 dibaca kamera HP pada menu Absensi, atau scanner USB yang bertindak sebagai keyboard.</div></div></div></div></div></div>' +
      '<div class="sticky-bar"><a class="btn btn-soft" href="#/siswa">' + ic('x') + 'Batal</a>' + (isNew ? '<button type="button" class="btn btn-soft" id="sfDraft">' + ic('save') + 'Simpan Draf</button>' : '') + '<div class="grow small" id="sfValid"></div><button class="btn btn-dark" type="submit" id="sfSave">' + (isNew ? 'Simpan & Daftarkan Siswa' : 'Simpan Perubahan') + ' ' + ic('arrow-right') + '</button></div></form>';
    var f = $('#sf', el), foto = null;
    if (window.innerWidth < 720) $('#sfGrid', el).style.gridTemplateColumns = 'minmax(0,1fr)';
    function data() { return formData(f); }
    function preview() {
      var d = data(); d.barcode_id = d.barcode_id || (d.NIS ? 'ID-' + d.NIS : ''); d.foto_profil_url = foto ? 'data:image/jpeg;base64,' + foto.data : s.foto_profil_url;
      $('#cardPrev', el).innerHTML = idCardHtml(d);
      var req = ['nama_lengkap', 'NIS', 'kelas_id'].filter(function (k) { return !d[k]; });
      var bad = [];
      if (d.NISN && !/^\d{10}$/.test(d.NISN)) bad.push('NISN harus 10 digit');
      if (d.no_wa_ortu && !/^08\d{8,12}$/.test(hp08(d.no_wa_ortu))) bad.push('No. WA ortu tidak valid');
      if (isNew && d.NIS && siswaByNIS(d.NIS)) bad.push('NIS sudah terdaftar');
      $('#nisOk', el).hidden = !(isNew && d.NIS && !siswaByNIS(d.NIS));
      $('#sfValid', el).innerHTML = req.length || bad.length ? '<span class="red">' + ic('circle-alert') + ' ' + esc(bad.concat(req.length ? [req.length + ' kolom wajib belum diisi'] : []).join(' • ')) + '</span>' : '<span class="amber b">' + ic('circle-check') + ' Semua kolom wajib telah terisi dengan benar</span>';
      return !req.length && !bad.length;
    }
    f.addEventListener('input', debounce(preview, 150)); f.addEventListener('change', preview);
    preview();
    $$('#jkSeg button', el).forEach(function (b) { b.onclick = function () { $$('#jkSeg button', el).forEach(function (x) { x.className = 'btn ' + (x === b ? 'btn-dark' : 'btn-soft'); }); f.jenis_kelamin.value = b.dataset.jk; }; });
    $('#pwGen', el).onclick = function () { f.password.value = randomPw(); };
    $('#bcRegen', el).onclick = function () { var n = f.NIS.value.trim(); f.barcode_id.value = n ? 'ID-' + n + (f.barcode_id.value === 'ID-' + n ? '-' + Math.random().toString(36).slice(2, 5).toUpperCase() : '') : ''; preview(); };
    $('#bcPrint', el).onclick = function () { var d = data(); d.barcode_id = d.barcode_id || 'ID-' + d.NIS; cetakKartu([d]); };
    var onFoto = async function () {
      var file = this.files[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) return toast('Foto maksimal 5 MB.', 'bad');
      var url = await compressImage(file, 480, 0.8);
      foto = { data: url.split(',')[1], mime: 'image/jpeg' };
      $('#fotoDrop', el).innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;border-radius:8px" alt=""><input type="file" accept="image/*" hidden id="fotoIn">';
      $('#fotoIn', el).onchange = onFoto; preview();
    };
    $('#fotoIn', el).onchange = onFoto;
    if ($('#sfDraft', el)) $('#sfDraft', el).onclick = function () { var d = data(); delete d.password; Store.set(userKey('draftSiswa'), d); toast('Draf disimpan di perangkat ini.', 'ok'); };
    f.onsubmit = async function (e) {
      e.preventDefault();
      if (!preview()) return toast('Periksa kembali isian formulir.', 'bad');
      var d = data(), btn = $('#sfSave', el);
      btnBusy(btn, true);
      var r = await api('siswa.save', { isNew: isNew, data: d, password: d.password, kirimKredensial: d.kirimKredensial, foto: foto });
      btnBusy(btn, false);
      if (!toastRes(r)) return;
      if (isNew) Store.del(userKey('draftSiswa'));
      var list = B().siswa || [], i = list.findIndex(function (x) { return x.NIS === r.data.siswa.NIS; });
      var row = Object.assign({ akun: 'YA' }, r.data.siswa); if (i > -1) list[i] = Object.assign(list[i], row); else list.push(row);   // optimistic
      Pages.guru.siswa.dirty = true;
      afterWrite();
      go('siswa');
      if (r.data.akun) kredensialModal(r.data.siswa.nama_lengkap, r.data.akun.email, r.data.akun.password);
    };
  }
});
function randomPw() { var c = 'abcdefghjkmnpqrstuvwxyz23456789', s = ''; var a = new Uint8Array(8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (x, i) { a[i] = Math.random() * 255; }); a.forEach(function (x) { s += c[x % c.length]; }); return s; }
