/* =====================================================================
   SIAKAD SISWA — pages-akademik.js : Jadwal, Absensi (scan barcode),
   Materi (unggah/embed) + penampil pop-up bersama guru & siswa.
   ===================================================================== */
'use strict';

// =====================================================================
// JADWAL PELAJARAN
// =====================================================================
var HARI_SEKOLAH = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
function hariIniNama() { return hariDari(todayStr()); }
function statusSesi(j) {
  if (j.hari !== hariIniNama()) return '';
  var n = nowHM();
  return n >= j.jam_selesai ? 'selesai' : n >= j.jam_mulai ? 'berlangsung' : 'berikutnya';
}
registerPage('guru', 'jadwal', {
  title: 'Jadwal Pelajaran',
  st: { kelas: '', jenjang: '', hari: '', mapel: '', q: '', mode: 'tabel', page: 1 },
  init: function (el) {
    var st = this.st, self = this;
    el.innerHTML = pageHead('Panel Guru <span>// Jadwal Pelajaran</span>', 'Jadwal Pelajaran', 'Kelola jadwal mingguan, alokasi jam mengajar guru, ruang kelas, dan pembagian sesi tatap muka semester berjalan.',
      '<button class="btn btn-outline" id="jExport">' + ic('download') + 'Ekspor Jadwal (CSV)</button><button class="btn btn-dark" id="jAdd">' + ic('plus') + 'Tambah Jadwal Baru</button>') +
      '<div class="grid g4" id="jKpi"></div>' +
      '<div class="card mt24"><div class="toolbar"><div class="field"><label class="lbl">Kelas / Rombel</label><select class="sel" id="jKelas"></select></div><div class="field"><label class="lbl">Jenjang</label><select class="sel" id="jJenjang"><option value="">Semua</option><option>SD</option><option>SMP</option><option>SMA</option></select></div>' +
      '<div class="field"><label class="lbl">Hari</label><select class="sel" id="jHari"><option value="">Semua Hari</option>' + HARI_SEKOLAH.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></div><div class="field"><label class="lbl">Mata Pelajaran</label><select class="sel" id="jMapel"></select></div>' +
      '<div class="field search"><label class="lbl">Pencarian</label><div class="inp-ic">' + ic('search') + '<input class="inp" id="jQ" placeholder="Cari guru, ruang, mapel…"></div></div><div><label class="lbl">Mode Tampilan</label><div class="tabs"><button data-mode="tabel">' + ic('table') + 'Tabel</button><button data-mode="grid">' + ic('layout-grid') + 'Grid Mingguan</button></div></div></div></div>' +
      '<div id="jValid" class="mt16"></div><div class="card mt16" id="jBody"></div>' +
      '<div class="grid g-main mt24"><div class="card"><div class="card-h"><div class="grow"><h3>Jadwal Harian Berjalan</h3><p id="jTodayLbl"></p></div><span class="pill" id="jClock"></span></div><div class="card-b" id="jToday"></div></div><div class="card"><div class="card-h"><div class="grow"><h3>Ketersediaan Ruang Khusus</h3><p>Status saat ini berdasarkan jadwal</p></div>' + ic('building-2') + '</div><div class="card-b" id="jRuang"></div></div></div>';
    var rer = function () { st.page = 1; self.body(el); };
    $('#jKelas', el).onchange = function () { st.kelas = this.value; rer(); };
    $('#jJenjang', el).onchange = function () { st.jenjang = this.value; rer(); };
    $('#jHari', el).onchange = function () { st.hari = this.value; rer(); };
    $('#jMapel', el).onchange = function () { st.mapel = this.value; rer(); };
    $('#jQ', el).oninput = debounce(function () { st.q = this.value.toLowerCase(); rer(); }, 250);
    $$('[data-mode]', el).forEach(function (b) { b.onclick = function () { st.mode = b.dataset.mode; self.body(el); }; });
    $('#jAdd', el).onclick = function () { jadwalForm({ kelas_id: st.kelas, hari: st.hari || hariIniNama() }); };
    $('#jExport', el).onclick = function () { downloadCSV('jadwal-' + todayStr() + '.csv', ['Hari', 'Jam Mulai', 'Jam Selesai', 'Kelas', 'Mata Pelajaran', 'Guru', 'Ruang'], self.filtered().map(function (j) { return [j.hari, j.jam_mulai, j.jam_selesai, kelasNama(j.kelas_id), j.mata_pelajaran, guruNama(j.guru_id), j.ruang]; })); };
    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-jd]'); if (t) { var j = (B().jadwal || []).filter(function (x) { return x.jadwal_id === t.dataset.jd; })[0]; if (t.dataset.op === 'del') self.hapus(j); else jadwalForm(j); }
      var p = e.target.closest('[data-pg]'); if (p && !p.disabled && p.closest('#jBody')) { st.page = Number(p.dataset.pg); self.body(el); }
    });
    this._clock = setInterval(function () { if (!el.hidden && $('#jClock', el)) $('#jClock', el).textContent = 'Waktu: ' + nowHM() + ' WIB'; }, 30000);
  },
  filtered: function () {
    var st = this.st;
    return (B().jadwal || []).filter(function (j) {
      var k = kelasById(j.kelas_id) || {};
      if (st.kelas && j.kelas_id !== st.kelas) return false;
      if (st.jenjang && k.jenjang !== st.jenjang) return false;
      if (st.hari && j.hari !== st.hari) return false;
      if (st.mapel && j.mata_pelajaran !== st.mapel) return false;
      if (st.q && (j.mata_pelajaran + ' ' + j.ruang + ' ' + guruNama(j.guru_id) + ' ' + (k.nama_kelas || '')).toLowerCase().indexOf(st.q) === -1) return false;
      return true;
    }).sort(function (a, b) { return HARI_SEKOLAH.indexOf(a.hari) - HARI_SEKOLAH.indexOf(b.hari) || a.jam_mulai.localeCompare(b.jam_mulai) || String(a.kelas_id).localeCompare(String(b.kelas_id)); });
  },
  render: function (el) {
    var jd = B().jadwal || [], st = this.st;
    var menit = jd.reduce(function (a, j) { return a + (toMinJ(j.jam_selesai) - toMinJ(j.jam_mulai)); }, 0);
    var kelasSet = {}, guruSet = {}; jd.forEach(function (j) { kelasSet[j.kelas_id] = 1; if (j.guru_id) guruSet[j.guru_id] = 1; });
    var hariIni = jd.filter(function (j) { return j.hari === hariIniNama(); }), jalan = hariIni.filter(function (j) { return statusSesi(j) === 'berlangsung'; }).length;
    $('#jKpi', el).innerHTML = kpi('Total Jam Mengajar', Math.round(menit / 60) + '<small>Jam / minggu</small>', 'Alokasi ' + Object.keys(kelasSet).length + ' rombel aktif TA ' + esc(cfg('TAHUN_AJARAN', '')), 'clock') +
      kpi('Kelas Terjadwal', Object.keys(kelasSet).length + '<small>dari ' + (B().kelas || []).length + ' kelas</small>', ic('circle-check') + ' ' + Math.round(pct(Object.keys(kelasSet).length, (B().kelas || []).length || 1)) + '% terisi', 'school') +
      kpi('Guru Bertugas', Object.keys(guruSet).length + '<small>Guru pengampu</small>', 'Rata-rata ' + fmtN(Object.keys(guruSet).length ? menit / 60 / Object.keys(guruSet).length : 0) + ' jam/minggu', 'contact') +
      kpi('Sesi Hari Ini', hariIni.length + '<small>' + esc(hariIniNama()) + '</small>', '<span class="green b">● ' + jalan + ' sesi sedang berlangsung</span>', 'radio', 'green');
    $('#jKelas', el).innerHTML = kelasOpts(st.kelas, 'Semua Kelas');
    $('#jMapel', el).innerHTML = mapelOpts(st.mapel, 'Semua Mapel');
    // validasi bentrok (klien)
    var bentrok = 0;
    jd.forEach(function (a, i) { jd.slice(i + 1).forEach(function (b) { if (a.hari === b.hari && toMinJ(a.jam_mulai) < toMinJ(b.jam_selesai) && toMinJ(b.jam_mulai) < toMinJ(a.jam_selesai) && (a.kelas_id === b.kelas_id || (a.guru_id && a.guru_id === b.guru_id) || (a.ruang && a.ruang === b.ruang))) bentrok++; }); });
    $('#jValid', el).innerHTML = '<div class="card card-p row gap16 wrap"><span class="kpi" style="padding:0;min-height:0"><span class="ki ' + (bentrok ? 'red' : 'green') + '" style="position:static">' + ic(bentrok ? 'triangle-alert' : 'shield-check') + '</span></span><div class="grow"><b class="small">Validasi Jadwal: ' + (bentrok ? 'Ditemukan bentrok' : 'Sinkron & Bebas Bentrok') + '</b><div>' + (bentrok ? bentrok + ' pasang jadwal bentrok (kelas/guru/ruang sama di jam yang sama).' : 'Tidak ada bentrok jam mengajar, ruang, maupun rombel.') + '</div></div><span class="pill">Semester ' + esc(cfg('SEMESTER', '')) + ' ' + esc(cfg('TAHUN_AJARAN', '')) + '</span><span class="pill">Kurikulum Merdeka</span></div>';
    this.body(el);
    // Harian berjalan
    $('#jTodayLbl', el).textContent = tglHari(todayStr());
    $('#jClock', el).textContent = 'Waktu: ' + nowHM() + ' WIB';
    var tk = hariIni.filter(function (j) { return !st.kelas || j.kelas_id === st.kelas; }).sort(function (a, b) { return a.jam_mulai.localeCompare(b.jam_mulai); });
    $('#jToday', el).innerHTML = tk.length ? tk.slice(0, 8).map(function (j) { var s = statusSesi(j); return '<div class="sched ' + (s === 'berlangsung' ? 'now' : '') + '"><span class="list-i" style="padding:0;background:none"><span class="ic ' + (s === 'berlangsung' ? 'solid' : '') + '">' + ic(mapelIcon(j.mata_pelajaran)) + '</span></span><div class="grow"><b>' + esc(j.mata_pelajaran) + '</b> ' + (s === 'berlangsung' ? '<span class="bdg navy">Berlangsung</span>' : s === 'selesai' ? '<span class="bdg ok">Selesai</span>' : '<span class="bdg amber">Berikutnya</span>') + '<div class="small muted">' + esc(kelasNama(j.kelas_id)) + ' • ' + esc(guruNama(j.guru_id)) + ' • ' + esc(j.ruang || '-') + '</div></div><span class="time">' + esc(j.jam_mulai) + ' – ' + esc(j.jam_selesai) + '</span></div>'; }).join('') : emptyHtml('Tidak ada sesi hari ini', hariIniNama() === 'Minggu' ? 'Hari Minggu — libur.' : '', 'calendar-off');
    // Ruang khusus
    var ruang = {}; jd.forEach(function (j) { if (j.ruang && /lab|aula|multimedia/i.test(j.ruang)) ruang[j.ruang] = ruang[j.ruang] || []; });
    Object.keys(ruang).forEach(function (r) { ruang[r] = hariIni.filter(function (j) { return j.ruang === r; }); });
    var rk = Object.keys(ruang);
    $('#jRuang', el).innerHTML = rk.length ? rk.map(function (r) {
      var now = ruang[r].filter(function (j) { return statusSesi(j) === 'berlangsung'; })[0], next = ruang[r].filter(function (j) { return statusSesi(j) === 'berikutnya'; }).sort(function (a, b) { return a.jam_mulai.localeCompare(b.jam_mulai); })[0];
      return '<div class="list-i"><span class="ic">' + ic(/lab/i.test(r) ? 'flask-conical' : 'monitor') + '</span><div class="grow"><b>' + esc(r) + '</b><small>' + (now ? 'Terpakai: ' + esc(kelasNama(now.kelas_id)) : next ? 'Booking pkl. ' + esc(next.jam_mulai) : 'Kosong sisa hari ini') + '</small></div>' + (now ? '<span class="bdg bad">Terpakai</span>' : next ? '<span class="bdg warn">Dipesan</span>' : '<span class="bdg ok">Tersedia</span>') + '</div>';
    }).join('') : emptyHtml('Belum ada ruang khusus', 'Isi kolom ruang (Lab/Aula) di jadwal.', 'building-2');
  },
  body: function (el) {
    var st = this.st, rows = this.filtered();
    $$('[data-mode]', el).forEach(function (b) { b.classList.toggle('on', b.dataset.mode === st.mode); });
    if (st.mode === 'grid') {
      var hariAda = HARI_SEKOLAH.filter(function (x) { return rows.some(function (j) { return j.hari === x; }); });
      if (!hariAda.length) hariAda = HARI_SEKOLAH.slice(0, 5);
      $('#jBody', el).innerHTML = '<div class="tbl-wrap" style="padding:16px"><div style="display:grid;grid-template-columns:repeat(' + hariAda.length + ',minmax(170px,1fr));gap:12px">' + hariAda.map(function (hr) {
        var list = rows.filter(function (j) { return j.hari === hr; });
        return '<div><div class="row between" style="padding:8px 10px;border-radius:8px;background:' + (hr === hariIniNama() ? 'var(--navy-ink);color:#fff' : 'var(--surface-3)') + '"><b>' + hr + '</b><span class="xs">' + list.length + ' sesi</span></div>' + list.map(function (j) { var s = statusSesi(j); return '<div class="card mt8" style="padding:10px 12px;cursor:pointer;border-left:3px solid ' + mapelWarna(j.mata_pelajaran) + (s === 'berlangsung' ? ';background:var(--surface-2)' : '') + '" data-jd="' + esc(j.jadwal_id) + '"><div class="xs mono muted">' + esc(j.jam_mulai) + '–' + esc(j.jam_selesai) + '</div><b class="small">' + esc(j.mata_pelajaran) + '</b><div class="xs muted">' + esc(kelasNama(j.kelas_id)) + ' • ' + esc(j.ruang || '-') + '</div><div class="xs">' + esc(guruNama(j.guru_id)) + '</div></div>'; }).join('') + '</div>';
      }).join('') + '</div></div>';
      return;
    }
    var p = paginate(rows, st.page, 10); st.page = p.page;
    $('#jBody', el).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>Jam & Sesi</th><th>Hari</th><th>Mata Pelajaran</th><th>Kelas & Ruang</th><th>Guru Pengampu</th><th>Status</th><th class="tr">Aksi</th></tr></thead><tbody>' + p.rows.map(function (j, i) {
      var s = statusSesi(j), g = guruById(j.guru_id) || {};
      return '<tr' + (s === 'berlangsung' ? ' style="background:#FFFBEF"' : '') + '><td class="mono muted">' + String(p.from + i).padStart(2, '0') + '</td><td><b class="nowrap">' + esc(j.jam_mulai) + ' – ' + esc(j.jam_selesai) + ' WIB</b><div class="xs muted">' + (toMinJ(j.jam_selesai) - toMinJ(j.jam_mulai)) + ' Menit</div></td><td><span class="bdg ' + (j.hari === hariIniNama() ? 'amber' : '') + '">' + esc(j.hari) + (j.hari === hariIniNama() ? ' (Hari Ini)' : '') + '</span></td>' +
        '<td><div class="who" style="min-width:160px"><span class="av sm" style="border-radius:8px;background:' + mapelWarna(j.mata_pelajaran) + '">' + ic(mapelIcon(j.mata_pelajaran)) + '</span><div><b>' + esc(j.mata_pelajaran) + '</b></div></div></td><td><span class="bdg">' + esc((kelasById(j.kelas_id) || {}).jenjang || '') + '</span> <b>' + esc(kelasNama(j.kelas_id)) + '</b><div class="xs muted">' + ic('map-pin') + ' ' + esc(j.ruang || '-') + '</div></td>' +
        '<td><div class="who">' + avatar(g.nama_lengkap || '-', '', 'sm') + '<div><b class="small">' + esc(g.nama_lengkap || '-') + '</b><small>NIP ' + esc(j.guru_id || '-') + '</small></div></div></td><td>' + (s === 'berlangsung' ? '<span class="bdg navy">Berlangsung</span>' : s === 'selesai' ? '<span class="bdg ok">Selesai</span>' : s ? '<span class="bdg amber">Berikutnya</span>' : '<span class="bdg">Terjadwal</span>') + '</td>' +
        '<td class="tr nowrap"><button class="btn-ic" data-jd="' + esc(j.jadwal_id) + '" title="Ubah">' + ic('pencil') + '</button><button class="btn-ic" data-jd="' + esc(j.jadwal_id) + '" data-op="del" title="Hapus">' + ic('trash-2') + '</button></td></tr>';
    }).join('') + '</tbody></table></div>' + pagerHtml(p, 'sesi jadwal mingguan') : emptyHtml('Belum ada jadwal', 'Tambahkan jadwal pelajaran untuk kelas ini.', 'calendar-days');
  },
  hapus: async function (j) {
    if (!await confirmBox('Hapus jadwal ' + j.mata_pelajaran + ' (' + j.hari + ' ' + j.jam_mulai + ')?', { danger: true, ok: 'Hapus' })) return;
    var prev = B().jadwal.slice(); B().jadwal = prev.filter(function (x) { return x.jadwal_id !== j.jadwal_id; }); markAllDirty(true);
    var r = await api('master.delete', { sheet: 'Jadwal', id: j.jadwal_id });
    if (!toastRes(r)) { B().jadwal = prev; markAllDirty(true); } else afterWrite();
  }
});
function toMinJ(t) { var p = String(t || '0:0').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
function jadwalForm(j) {
  j = j || {}; var isNew = !j.jadwal_id;
  var m = modal({ title: isNew ? 'Tambah Jadwal' : 'Ubah Jadwal', sub: 'Sistem otomatis menolak jadwal yang bentrok.', size: 'lg',
    body: '<div class="grid-form"><div class="field c6"><label>Kelas <span class="req">*</span></label><select class="sel" name="kelas_id">' + kelasOpts(j.kelas_id, '— Pilih —') + '</select></div><div class="field c6"><label>Mata Pelajaran <span class="req">*</span></label><select class="sel" name="mata_pelajaran">' + mapelOpts(j.mata_pelajaran, '— Pilih —') + '</select></div>' +
      '<div class="field c6"><label>Guru Pengampu</label><select class="sel" name="guru_id">' + guruOpts(j.guru_id, '— Pilih —') + '</select></div><div class="field c6"><label>Ruang</label><input class="inp" name="ruang" value="' + esc(j.ruang || '') + '" placeholder="R-302 / Lab Kimia"></div>' +
      '<div class="field c4"><label>Hari <span class="req">*</span></label><select class="sel" name="hari">' + HARI_SEKOLAH.map(function (x) { return '<option' + (x === j.hari ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div><div class="field c4"><label>Jam Mulai <span class="req">*</span></label><input class="inp" type="time" name="jam_mulai" value="' + esc(j.jam_mulai || '07:15') + '"></div><div class="field c4"><label>Jam Selesai <span class="req">*</span></label><input class="inp" type="time" name="jam_selesai" value="' + esc(j.jam_selesai || '08:45') + '"></div></div>',
    foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="jfSave">' + ic('save') + 'Simpan Jadwal</button>' });
  $('#jfSave', m.el).onclick = async function () {
    var d = formData(m.el); if (!isNew) d.jadwal_id = j.jadwal_id;
    btnBusy(this, true); var r = await api('master.save', { sheet: 'Jadwal', row: d }); btnBusy(this, false);
    if (!toastRes(r)) return;
    var list = B().jadwal, i = list.findIndex(function (x) { return x.jadwal_id === r.data.jadwal_id; }); if (i > -1) list[i] = Object.assign(list[i], r.data); else list.push(r.data);
    m.close(); markAllDirty(true); afterWrite();
  };
}

// =====================================================================
// ABSENSI — Scan barcode (kamera/USB), input manual, riwayat & log
// =====================================================================
var Scanner = {
  stream: null, reader: null, loop: null, last: {}, video: null,
  start: async function (video, onCode) {
    this.stop(); this.video = video;
    var self = this, emit = function (code) { code = String(code || '').trim(); if (!code) return; var t = Date.now(); if (self.last[code] && t - self.last[code] < 3500) return; self.last[code] = t; onCode(code); };
    var native = false;
    if ('BarcodeDetector' in window) { try { var f = await BarcodeDetector.getSupportedFormats(); native = f.indexOf('code_128') > -1; } catch (e) {} }
    if (native) {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      video.srcObject = this.stream; video.setAttribute('playsinline', ''); await video.play();
      var det = new BarcodeDetector({ formats: ['code_128', 'qr_code', 'code_39', 'ean_13'] });
      var tick = async function () { if (!self.stream) return; try { var r = await det.detect(video); if (r && r[0]) emit(r[0].rawValue); } catch (e) {} self.loop = setTimeout(tick, 220); };
      tick();
      return 'native';
    }
    await loadLib('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js');
    this.reader = new ZXing.BrowserMultiFormatReader();
    await this.reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video, function (res) { if (res) emit(res.getText()); });
    this.stream = video.srcObject;
    return 'zxing';
  },
  stop: function () {
    clearTimeout(this.loop);
    if (this.reader) { try { this.reader.reset(); } catch (e) {} this.reader = null; }
    if (this.stream) { this.stream.getTracks().forEach(function (t) { t.stop(); }); this.stream = null; }
    if (this.video) this.video.srcObject = null;
  }
};
function beep(ok) {
  try { var a = beep.ctx = beep.ctx || new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = ok ? 1100 : 320; o.type = 'sine'; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (ok ? 0.12 : 0.3)); } catch (e) {}
  if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]);
}

registerPage('guru', 'absensi', {
  title: 'Absensi',
  st: { tab: 'scan', kelas: '', simulasi: DEMO, gps: null, gpsErr: '', pending: [], mKelas: '', mTanggal: '', mData: null, rBulan: '', rKelas: '', rStatus: '', rMetode: '', rQ: '', rPage: 1, rRows: null },
  init: function (el) {
    var st = this.st, self = this;
    st.mTanggal = todayStr(); st.rBulan = todayStr().substring(0, 7);
    el.innerHTML = pageHead('Panel Guru <span>// Absensi & Kehadiran Siswa</span>', 'Manajemen Absensi', 'Pantau kehadiran harian, verifikasi scan barcode langsung, dan tinjau catatan kehadiran terpadu seluruh siswa.',
      '<button class="btn btn-outline" id="aExport">' + ic('download') + 'Export Rekap</button>' + (isSA() ? '<a class="btn btn-dark" href="#/lokasi">' + ic('map-pinned') + 'Lokasi & Geofence</a>' : '<button class="btn btn-dark" id="aGps">' + ic('map') + 'Lokasi Absensi</button>')) +
      '<div class="tabs" id="aTabs"><button data-tab="scan">' + ic('scan-barcode') + 'Scan Barcode</button><button data-tab="manual">' + ic('clipboard-list') + 'Input Manual</button><button data-tab="riwayat">' + ic('history') + 'Riwayat & Log</button></div>' +
      '<div id="aScan" class="mt16"></div><div id="aManual" class="mt16" hidden></div><div id="aRiwayat" class="mt16" hidden></div>';
    $$('#aTabs button', el).forEach(function (b) { b.onclick = function () { self.tab(el, b.dataset.tab); }; });
    if ($('#aGps', el)) $('#aGps', el).onclick = function () { petaGeofence(Geo.lokasi(), null); };
    $('#aExport', el).onclick = function () { self.tab(el, 'riwayat'); setTimeout(function () { self.exportRiwayat(); }, 50); };
    this.buildScan(el);
  },
  show: function (el) { this.tab(el, this.st.tab); },
  tab: function (el, t) {
    var st = this.st; st.tab = t;
    $$('#aTabs button', el).forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    $('#aScan', el).hidden = t !== 'scan'; $('#aManual', el).hidden = t !== 'manual'; $('#aRiwayat', el).hidden = t !== 'riwayat';
    if (t !== 'scan') this.stopScan(el);
    if (t === 'manual') this.renderManual(el);
    if (t === 'riwayat') this.loadRiwayat(el);
  },
  render: function (el) { this.recent(el); if (this.st.tab === 'manual') this.renderManual(el); if (this.st.tab === 'riwayat') this.renderRiwayat(el); },
  // ------------------------------------------------ SCAN
  buildScan: function (el) {
    var st = this.st, self = this;
    $('#aScan', el).innerHTML = '<div class="card"><div class="toolbar"><div class="field"><label class="lbl">Rekap Kelas</label><select class="sel" id="scKelas"></select></div><div class="field"><label class="lbl">Tanggal</label><div class="inp-ic">' + ic('calendar') + '<input class="inp" value="Hari ini — ' + esc(tglIndo(todayStr(), true)) + '" readonly></div></div>' +
      '<div class="field"><label class="lbl">Sesi / Mapel (opsional)</label><input class="inp" id="scSesi" placeholder="Jam ke-1 • Matematika"></div><button class="btn btn-dark" id="scSync">' + ic('refresh-cw') + 'Load / Sync</button></div></div>' +
      '<div class="grid g-main mt16"><div class="card card-p"><div class="scan-box" id="scBox"><video id="scVideo" muted playsinline></video><div class="grid-bg"></div><div class="frame"><i></i><i></i><i></i><i></i></div><div class="laser" id="scLaser" hidden></div><span class="tl off" id="scLive">KAMERA MATI</span><span class="tr2" id="scMode">' + ic('video') + ' Siap</span><div class="hint">Arahkan kartu barcode ID siswa / QR Code</div>' +
      '<div class="foot"><span>' + ic('cctv') + 'Kamera belakang</span><span id="scGps">' + ic('map-pin') + 'GPS belum aktif</span><span>' + ic('dot') + 'Auto-Detect: ON</span></div></div>' +
      '<div class="grid mt16" style="grid-template-columns:minmax(0,1fr) auto;gap:12px"><button class="btn btn-dark btn-lg" id="scStart">' + ic('play', 'amber') + 'START SCANNER (AKTIFKAN KAMERA)</button><button class="btn btn-soft btn-lg" id="scStop">' + ic('circle-stop') + 'STOP</button></div>' +
      '<form class="row mt12" id="scManual"><div class="inp-ic grow">' + ic('keyboard') + '<input class="inp mono" id="scCode" placeholder="Ketik / scan USB: ID-20230101 lalu Enter" autocomplete="off"></div><button class="btn btn-outline">Catat</button></form>' +
      (DEMO ? '<label class="chk small mt12"><input type="checkbox" id="scSim" ' + (st.simulasi ? 'checked' : '') + '> Mode demo: simulasikan GPS guru berada di titik sekolah</label>' : '') +
      '<div id="scLast"></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>Scan Terbaru Hari Ini</h3><p>Aliran kehadiran real-time</p></div><span class="pill" id="scPct"></span></div><div class="card-b"><div class="grid g4" id="scStat" style="gap:8px;background:var(--surface-3);border-radius:10px;padding:12px"></div><div id="scList" class="mt12"></div></div></div></div>';
    $('#scKelas', el).onchange = function () { st.kelas = this.value; self.recent(el); };
    $('#scSync', el).onclick = async function () { btnBusy(this, true); await refreshBoot(true); btnBusy(this, false); };
    $('#scStart', el).onclick = function () { self.startScan(el); };
    $('#scStop', el).onclick = function () { self.stopScan(el); };
    $('#scManual', el).onsubmit = function (e) { e.preventDefault(); var v = $('#scCode', el).value.trim(); if (v) { self.onScan(el, v); $('#scCode', el).value = ''; } };
    if ($('#scSim', el)) $('#scSim', el).onchange = function () { st.simulasi = this.checked; self.gpsLabel(el); };
    this.gpsLabel(el);
  },
  gpsLabel: function (el) {
    var st = this.st, lab = $('#scGps', el); if (!lab) return;
    var pos = this.pos();
    if (!pos) { lab.innerHTML = ic('map-pin') + (st.gpsErr ? esc(st.gpsErr) : 'GPS belum aktif'); return; }
    var b = Geo.hitung(pos)[0];
    lab.innerHTML = ic('map-pin') + (!b ? 'Belum ada lokasi' : b.ok ? 'Radius Valid (' + b.jarak + 'm dari ' + esc(b.nama) + ')' : '<span style="color:#FCA5A5">Di luar radius (' + fmtJarak(b.jarak) + ' dari ' + esc(b.nama) + ')</span>');
  },
  pos: function () { var st = this.st, l = Geo.lokasi()[0]; return st.simulasi && DEMO && l ? { lat: Number(l.latitude) + 0.0001, lng: Number(l.longitude) + 0.0001, acc: 10 } : st.gps; },
  startScan: async function (el) {
    var st = this.st, self = this, btn = $('#scStart', el);
    btnBusy(btn, true);
    if (!(st.simulasi && DEMO) && navigator.geolocation) {
      if (this._watch) navigator.geolocation.clearWatch(this._watch);
      this._watch = navigator.geolocation.watchPosition(function (p) { st.gps = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }; st.gpsErr = ''; self.gpsLabel(el); },
        function (e) { st.gpsErr = e.code === 1 ? 'Izin lokasi ditolak' : 'GPS tidak terbaca'; self.gpsLabel(el); }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    }
    try {
      var mode = await Scanner.start($('#scVideo', el), function (code) { self.onScan(el, code); });
      $('#scLive', el).className = 'tl'; $('#scLive', el).textContent = 'LIVE FEED'; $('#scLaser', el).hidden = false;
      $('#scMode', el).innerHTML = ic('video') + (mode === 'native' ? ' Detektor bawaan' : ' ZXing decoder');
    } catch (e) {
      toast(e && e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan izin kamera di browser, atau gunakan kolom ketik/scan USB.' : 'Kamera tidak tersedia: ' + (e.message || e) + '. Gunakan kolom ketik/scan USB.', 'bad');
      $('#scCode', el).focus();
    }
    btnBusy(btn, false);
  },
  stopScan: function (el) {
    Scanner.stop();
    if (this._watch && navigator.geolocation) { navigator.geolocation.clearWatch(this._watch); this._watch = null; }
    if ($('#scLive', el)) { $('#scLive', el).className = 'tl off'; $('#scLive', el).textContent = 'KAMERA MATI'; $('#scLaser', el).hidden = true; }
  },
  onScan: async function (el, code) {
    var st = this.st, self = this, pos = this.pos();
    var up = code.toUpperCase().replace(/-SIAKAD-SECURE$/, '');
    var s = (B().siswa || []).filter(function (x) { return String(x.barcode_id).toUpperCase() === up || x.NIS === code; })[0];
    if (cfg('GPS_WAJIB_SCAN', 'YA') === 'YA' && !pos) { beep(false); this.showLast(el, false, s ? s.nama_lengkap : code, 'Lokasi GPS guru belum terbaca. Izinkan akses lokasi.'); return; }
    var tmp = { id: uid(), NIS: s ? s.NIS : '', nama: s ? s.nama_lengkap : code, kelas_id: s ? s.kelas_id : '', jam: nowHM() + ':00', status: 'proses' };
    st.pending.unshift(tmp); this.recent(el);
    $('#scBox', el).classList.remove('scan-flash'); void $('#scBox', el).offsetWidth; $('#scBox', el).classList.add('scan-flash');
    var r = await api('absensi.scan', { barcode: code, lat: pos && pos.lat, lng: pos && pos.lng, acc: pos && pos.acc, sesi: $('#scSesi', el).value });
    st.pending = st.pending.filter(function (p) { return p.id !== tmp.id; });
    if (r.success) {
      beep(!r.data.duplikat);
      if (!r.data.duplikat) {
        var list = B().absensiHariIni = (B().absensiHariIni || []).filter(function (a) { return a.NIS !== r.data.row.NIS; }); list.push(r.data.row);
        if (B().stats && r.data.ringkas) { B().stats.hadirHariIni = r.data.ringkas.H; B().stats.persenHariIni = pct(r.data.ringkas.H, B().stats.totalSiswa); }
        Pages.guru.dashboard.dirty = true;
        this.refreshSoon();
      }
      this.showLast(el, true, r.data.siswa.nama + ' (NIS: ' + r.data.siswa.NIS + ')', r.data.duplikat ? 'Sudah tercatat pukul ' + jam5(r.data.row.jam) : (r.data.row.terlambat === 'YA' ? 'Terlambat' : 'Tepat Waktu') + ' — Terverifikasi ' + jam5(r.data.row.jam) + ' WIB', r.data.jarak, r.data.duplikat);
    } else { beep(false); this.showLast(el, false, s ? s.nama_lengkap : code, r.message); }
    this.recent(el);
  },
  refreshSoon: debounce(function () { afterWrite(); }, 5000),
  showLast: function (el, ok, nama, msg, jarak, dup) {
    var pos = this.pos();
    $('#scLast', el).innerHTML = '<div class="scan-last"><span class="ok ' + (ok ? '' : 'bad') + '">' + ic(ok ? (dup ? 'info' : 'check') : 'x') + '</span><div class="grow"><b>' + esc(nama) + '</b><div class="small ' + (ok ? 'amber b' : 'red') + '">' + esc(msg) + '</div></div>' + (pos ? '<span class="bdg mono hide-m">Lat: ' + pos.lat.toFixed(4) + ', Long: ' + pos.lng.toFixed(4) + (jarak != null ? ' • ' + jarak + 'm' : '') + '</span>' : '') + '</div>';
  },
  recent: function (el) {
    if (!$('#scList', el)) return;
    var st = this.st, all = (B().absensiHariIni || []), aktif = (B().siswa || []).filter(function (s) { return (s.status || 'Aktif') === 'Aktif' && (!st.kelas || s.kelas_id === st.kelas); });
    $('#scKelas', el).innerHTML = kelasOpts(st.kelas, 'Semua Kelas');
    var rows = all.filter(function (a) { return !st.kelas || a.kelas_id === st.kelas; });
    var c = { Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0 }; rows.forEach(function (a) { if (c[a.status] !== undefined) c[a.status]++; });
    $('#scPct', el).textContent = c.Hadir + ' / ' + aktif.length + ' Hadir (' + Math.round(pct(c.Hadir, aktif.length || 1)) + '%)';
    $('#scStat', el).innerHTML = [['HADIR', c.Hadir, ''], ['IZIN', c.Izin, 'amber'], ['SAKIT', c.Sakit, ''], ['ALPHA', c.Alpha, 'red']].map(function (x) { return '<div class="tc"><div class="xs b muted">' + x[0] + '</div><div class="b ' + x[2] + '" style="font-size:22px">' + x[1] + '</div></div>'; }).join('');
    var list = st.pending.filter(function (p) { return !st.kelas || !p.kelas_id || p.kelas_id === st.kelas; }).concat(rows.slice().sort(function (a, b) { return String(b.jam).localeCompare(String(a.jam)); }));
    $('#scList', el).innerHTML = list.length ? list.slice(0, 8).map(function (a, i) { var s = siswaByNIS(a.NIS) || {}, nm = a.nama || s.nama_lengkap || a.NIS; return '<div class="list-i" style="padding:10px 12px"><span class="mono xs muted">' + String(i + 1).padStart(2, '0') + '</span>' + avatar(nm, s.foto_profil_url, 'sm') + '<div class="grow"><b class="ellipsis small">' + esc(nm) + '</b><small>NIS: ' + esc(a.NIS || '-') + ' • ' + esc(kelasNama(a.kelas_id)) + '</small></div><div class="tr"><div class="mono xs">' + esc(String(a.jam).substring(0, 8)) + ' WIB</div>' + (a.status === 'proses' ? '<span class="bdg">' + ic('loader-circle', 'spin') + 'proses</span>' : statusBadge(a.status)) + '</div></div>'; }).join('') +
      (list.length > 8 ? '<div class="row between mt12 small"><i class="muted">+ ' + (list.length - 8) + ' siswa lainnya telah tercatat</i><a href="#" id="scAll" class="b">Lihat Semua ›</a></div>' : '') : emptyHtml('Belum ada scan hari ini', 'Mulai scanner atau ketik barcode.', 'scan-line');
    var self = this; if ($('#scAll', el)) $('#scAll', el).onclick = function (e) { e.preventDefault(); self.st.rBulan = todayStr().substring(0, 7); self.tab(el, 'riwayat'); };
  },
  // ------------------------------------------------ MANUAL
  renderManual: async function (el) {
    var st = this.st, self = this, box = $('#aManual', el);
    if (!st.mKelas) st.mKelas = ((B().kelas || [])[0] || {}).kelas_id || '';
    var tgl = st.mTanggal, isToday = tgl === todayStr();
    var existing = {};
    if (isToday) (B().absensiHariIni || []).forEach(function (a) { existing[a.NIS] = a; });
    else {
      var key = 'm:' + tgl;
      if (!st.mData || st.mData.key !== key) { box.innerHTML = '<div class="card card-p"><div class="sk" style="height:200px"></div></div>'; var r = await api('absensi.list', { dari: tgl, sampai: tgl }); st.mData = { key: key, rows: r.success ? r.data.rows : [] }; }
      st.mData.rows.forEach(function (a) { existing[a.NIS] = a; });
    }
    var siswa = (B().siswa || []).filter(function (s) { return s.kelas_id === st.mKelas && (s.status || 'Aktif') === 'Aktif'; }).sort(function (a, b) { return a.nama_lengkap.localeCompare(b.nama_lengkap); });
    var edits = st.mEdits = {};
    box.innerHTML = '<div class="card"><div class="toolbar"><div class="field"><label class="lbl">Kelas</label><select class="sel" id="mKelas">' + kelasOpts(st.mKelas) + '</select></div><div class="field"><label class="lbl">Tanggal</label><input class="inp" type="date" id="mTgl" value="' + esc(tgl) + '" max="' + todayStr() + '"></div>' +
      '<div class="row gap12 wrap"><button class="btn btn-soft" id="mAllH">' + ic('check-check') + 'Semua Hadir</button><button class="btn btn-soft" id="mRestA">' + ic('user-x') + 'Sisanya Alpha</button></div></div>' +
      '<div class="note" style="margin:0 20px 12px">' + ic('info') + '<div>Pilih status per siswa. Siswa yang sudah scan/selfie ditandai metodenya. Perubahan Izin/Sakit/Alpha dapat mengirim WA ke orang tua (bila notifikasi aktif).</div></div>' +
      (siswa.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No</th><th>Nama Siswa</th><th>Status Kehadiran</th><th class="hide-m">Keterangan</th><th class="hide-m">Tercatat</th></tr></thead><tbody>' + siswa.map(function (s, i) {
        var ex = existing[s.NIS], cur = ex ? ex.status : '';
        return '<tr data-nis="' + esc(s.NIS) + '"><td class="mono muted">' + (i + 1) + '</td><td><div class="who">' + avatar(s.nama_lengkap, s.foto_profil_url, 'sm') + '<div><b>' + esc(s.nama_lengkap) + '</b><small>' + esc(s.NIS) + '</small></div></div></td><td><div class="seg plain" style="display:inline-grid;min-width:230px">' + ['Hadir', 'Izin', 'Sakit', 'Alpha'].map(function (x) { return '<button type="button" data-st="' + x + '" class="' + (cur === x ? 'on' : '') + '" style="padding:6px 8px;font-size:12.5px">' + x.charAt(0) + '<span class="hide-m">' + x.slice(1) + '</span></button>'; }).join('') + '</div></td>' +
          '<td class="hide-m"><input class="inp" style="height:34px" data-ket value="' + esc(ex ? ex.keterangan || '' : '') + '" placeholder="Surat dokter, acara keluarga…"></td><td class="hide-m small">' + (ex ? metodeBadge(ex.metode) + ' <span class="mono xs">' + esc(jam5(ex.jam)) + '</span>' : '<i class="muted">Belum</i>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : emptyHtml('Tidak ada siswa aktif di kelas ini', '', 'users')) +
      '<div class="sticky-bar" style="margin:16px"><div class="grow small" id="mInfo">Belum ada perubahan.</div><button class="btn btn-dark" id="mSave">' + ic('save') + 'Simpan Absensi</button></div></div>';
    var info = function () { var n = Object.keys(edits).length; $('#mInfo', box).innerHTML = n ? '<b class="amber">' + n + ' perubahan belum disimpan</b>' : 'Belum ada perubahan.'; };
    $('#mKelas', box).onchange = function () { st.mKelas = this.value; self.renderManual(el); };
    $('#mTgl', box).onchange = function () { st.mTanggal = this.value || todayStr(); self.renderManual(el); };
    box.onclick = function (e) {
      var b = e.target.closest('[data-st]'); if (!b) return;
      var tr = b.closest('tr'); $$('[data-st]', tr).forEach(function (x) { x.classList.toggle('on', x === b); });
      edits[tr.dataset.nis] = { NIS: tr.dataset.nis, status: b.dataset.st, keterangan: $('[data-ket]', tr).value }; info();
    };
    box.oninput = function (e) { if (e.target.matches('[data-ket]')) { var tr = e.target.closest('tr'), on = $('[data-st].on', tr); if (on) { edits[tr.dataset.nis] = { NIS: tr.dataset.nis, status: on.dataset.st, keterangan: e.target.value }; info(); } } };
    var setAll = function (stt, onlyEmpty) { $$('tr[data-nis]', box).forEach(function (tr) { if (onlyEmpty && $('[data-st].on', tr)) return; var b = $('[data-st="' + stt + '"]', tr); b.click(); }); };
    if ($('#mAllH', box)) { $('#mAllH', box).onclick = function () { setAll('Hadir'); }; $('#mRestA', box).onclick = function () { setAll('Alpha', true); }; }
    $('#mSave', box).onclick = async function () {
      var items = Object.keys(edits).map(function (k) { return edits[k]; });
      if (!items.length) return toast('Belum ada perubahan.', 'warn');
      btnBusy(this, true); var r = await api('absensi.manual', { tanggal: st.mTanggal, items: items }); btnBusy(this, false);
      if (toastRes(r)) { st.mData = null; st.rRows = null; await afterWrite(); self.renderManual(el); }
    };
  },
  // ------------------------------------------------ RIWAYAT
  loadRiwayat: function (el) {
    var st = this.st, self = this, box = $('#aRiwayat', el);
    if (!box.firstChild) {
      box.innerHTML = '<div class="card"><div class="card-h"><div class="grow"><h3>Riwayat Kehadiran & Log Audit</h3><p>Verifikasi detail dengan metode, koordinat GPS, dan bukti foto.</p></div><div class="row gap12"><button class="btn btn-outline btn-sm" id="rCsv">' + ic('download') + 'Export CSV</button><button class="btn btn-outline btn-sm" id="rPrint">' + ic('printer') + 'Cetak Laporan</button></div></div>' +
        '<div class="toolbar"><div class="field"><select class="sel" id="rKelas"></select></div><div class="field"><input class="inp" type="month" id="rBulan" value="' + esc(st.rBulan) + '"></div><div class="field"><select class="sel" id="rStatus"><option value="">Semua Status</option><option>Hadir</option><option>Izin</option><option>Sakit</option><option>Alpha</option><option value="telat">Terlambat</option></select></div>' +
        '<div class="field"><select class="sel" id="rMetode"><option value="">Semua Metode</option><option value="barcode">Barcode</option><option value="selfie">Selfie GPS</option><option value="lokasi">Lokasi GPS</option><option value="manual">Manual</option></select></div><div class="field search"><div class="inp-ic">' + ic('search') + '<input class="inp" id="rQ" placeholder="Cari siswa atau NIS…"></div></div></div><div id="rTable"></div></div>';
      $('#rKelas', box).innerHTML = kelasOpts(st.rKelas, 'Semua Kelas');
      $('#rKelas', box).onchange = function () { st.rKelas = this.value; st.rPage = 1; self.renderRiwayat(el); };
      $('#rBulan', box).onchange = function () { st.rBulan = this.value || todayStr().substring(0, 7); st.rRows = null; st.rPage = 1; self.loadRiwayat(el); };
      $('#rStatus', box).onchange = function () { st.rStatus = this.value; st.rPage = 1; self.renderRiwayat(el); };
      $('#rMetode', box).onchange = function () { st.rMetode = this.value; st.rPage = 1; self.renderRiwayat(el); };
      $('#rQ', box).oninput = debounce(function () { st.rQ = this.value.toLowerCase(); st.rPage = 1; self.renderRiwayat(el); }, 250);
      $('#rCsv', box).onclick = function () { self.exportRiwayat(); };
      $('#rPrint', box).onclick = function () { window.print(); };
      box.addEventListener('click', function (e) {
        var p = e.target.closest('[data-pg]'); if (p && !p.disabled) { st.rPage = Number(p.dataset.pg); self.renderRiwayat(el); return; }
        var f = e.target.closest('[data-foto]'); if (f) return lihatFoto(f.dataset.foto);
        var ed = e.target.closest('[data-edit]'); if (ed) self.editAbsen(el, ed.dataset.edit);
      });
    }
    var bl = st.rBulan, dari = bl + '-01', last = new Date(Number(bl.substring(0, 4)), Number(bl.substring(5, 7)), 0).getDate(), sampai = bl + '-' + String(last).padStart(2, '0');
    if (!st.rRows) $('#rTable', box).innerHTML = '<div style="padding:20px"><div class="sk" style="height:260px"></div></div>';
    swr('abs:' + bl, 'absensi.list', { dari: dari, sampai: sampai }, function (d) { st.rRows = d.rows; self.renderRiwayat(el); }, { fresh: 30000, force: !st.rRows && bl === todayStr().substring(0, 7), onError: function (r) { $('#rTable', box).innerHTML = errorBox(r.message); } });
  },
  filteredRiwayat: function () {
    var st = this.st;
    return (st.rRows || []).filter(function (a) {
      if (st.rKelas && a.kelas_id !== st.rKelas) return false;
      if (st.rStatus === 'telat') { if (a.terlambat !== 'YA') return false; } else if (st.rStatus && a.status !== st.rStatus) return false;
      if (st.rMetode && a.metode !== st.rMetode) return false;
      if (st.rQ && (a.nama + ' ' + a.NIS).toLowerCase().indexOf(st.rQ) === -1) return false;
      return true;
    });
  },
  renderRiwayat: function (el) {
    var st = this.st, box = $('#aRiwayat', el); if (!box.firstChild || !st.rRows) return;
    var rows = this.filteredRiwayat(), p = paginate(rows, st.rPage, 10); st.rPage = p.page;
    var radius = Math.max.apply(null, Geo.lokasi().map(function (l) { return Number(l.radius_m); }).concat([Number(cfg('RADIUS_M', 100))])) + Number(cfg('GPS_TOLERANSI_M', 15));
    $('#rTable', box).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>Tanggal & Waktu</th><th>Nama Siswa</th><th>Kelas</th><th>Metode</th><th class="hide-m">Lokasi / GPS</th><th>Status</th><th class="hide-m">Bukti / Foto</th><th class="tr">Aksi</th></tr></thead><tbody>' + p.rows.map(function (a, i) {
      var jarak = a.jarak_m !== '' && a.jarak_m != null ? Number(a.jarak_m) : null;
      var bukti = a.metode === 'selfie' && a.foto_selfie_id ? '<button class="btn btn-soft btn-xs" data-foto="' + esc(a.absensi_id) + '">' + ic('image') + 'Foto</button>' : a.metode === 'barcode' ? '<span class="small">' + ic('id-card') + ' ID Card Valid</span>' : a.metode === 'lokasi' ? '<span class="small">' + ic('map-pin') + ' Geotag</span>' : a.keterangan ? '<span class="small amber">' + ic('paperclip') + ' ' + esc(a.keterangan) + '</span>' : '-';
      return '<tr><td class="mono muted">' + String(p.from + i).padStart(2, '0') + '</td><td class="nowrap">' + esc(tglIndo(a.tanggal, true)) + ', <span class="mono">' + esc(jam5(a.jam)) + '</span> WIB' + (a.terlambat === 'YA' ? '<div><span class="bdg warn">Terlambat</span></div>' : '') + '</td><td><b>' + esc(a.nama) + '</b><div class="xs muted mono">NIS: ' + esc(a.NIS) + '</div></td><td>' + esc(kelasNama(a.kelas_id)) + '</td><td>' + metodeBadge(a.metode) + '</td>' +
        '<td class="hide-m small">' + (jarak != null ? '<span class="' + (jarak <= radius ? 'amber' : 'red') + '">' + ic(jarak <= radius ? 'circle-check' : 'circle-alert') + ' Radius ' + jarak + 'm (' + (jarak <= radius ? 'Valid' : 'Luar') + ')</span>' : '-') + '</td><td>' + statusBadge(a.status) + '</td><td class="hide-m">' + bukti + '</td><td class="tr"><button class="btn btn-soft btn-xs" data-edit="' + esc(a.absensi_id) + '">' + (a.status === 'Alpha' ? 'Edit' : 'Detail') + '</button></td></tr>';
    }).join('') + '</tbody></table></div>' + pagerHtml(p, 'catatan absensi') : emptyHtml('Tidak ada catatan absensi', 'Ubah filter bulan/kelas.', 'calendar-x');
  },
  exportRiwayat: function () {
    var rows = this.filteredRiwayat();
    if (!this.st.rRows) return toast('Data riwayat sedang dimuat, coba lagi sebentar.', 'warn');
    downloadCSV('absensi-' + this.st.rBulan + '.csv', ['Tanggal', 'Jam', 'NIS', 'Nama', 'Kelas', 'Status', 'Terlambat', 'Metode', 'Latitude', 'Longitude', 'Jarak (m)', 'Keterangan', 'Dicatat oleh'],
      rows.map(function (a) { return [a.tanggal, a.jam, a.NIS, a.nama, kelasNama(a.kelas_id), a.status, a.terlambat, a.metode, a.latitude, a.longitude, a.jarak_m, a.keterangan, a.dicatat_oleh]; }));
  },
  editAbsen: function (el, id) {
    var st = this.st, self = this, a = (st.rRows || []).filter(function (x) { return x.absensi_id === id; })[0]; if (!a) return;
    var m = modal({ title: 'Detail Absensi', sub: a.nama + ' • ' + tglHari(a.tanggal), size: 'sm',
      body: '<dl class="kv-list"><dt>Jam</dt><dd class="mono">' + esc(a.jam) + '</dd><dt>Metode</dt><dd>' + metodeBadge(a.metode) + '</dd><dt>Koordinat</dt><dd class="mono small">' + esc(a.latitude ? a.latitude + ', ' + a.longitude : '-') + '</dd><dt>Dicatat oleh</dt><dd class="small">' + esc(a.dicatat_oleh || '-') + '</dd></dl>' +
        '<div class="field mt16"><label>Ubah status</label><select class="sel" name="status">' + ['Hadir', 'Izin', 'Sakit', 'Alpha'].map(function (x) { return '<option' + (x === a.status ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div><div class="field mt12"><label>Keterangan</label><input class="inp" name="keterangan" value="' + esc(a.keterangan || '') + '"></div>',
      foot: '<button class="btn btn-outline" data-x>Tutup</button><button class="btn btn-primary" id="eaSave">Simpan</button>' });
    $('#eaSave', m.el).onclick = async function () {
      var d = formData(m.el); btnBusy(this, true);
      var r = await api('absensi.manual', { tanggal: a.tanggal, items: [{ NIS: a.NIS, status: d.status, keterangan: d.keterangan }] }); btnBusy(this, false);
      if (toastRes(r)) { a.status = d.status; a.keterangan = d.keterangan; m.close(); self.renderRiwayat(el); afterWrite(); }
    };
  }
});
async function lihatFoto(absensiId) {
  var m = modal({ title: 'Bukti Selfie', size: 'sm', body: '<div class="sk" style="aspect-ratio:3/4"></div>' });
  var r = await api('absensi.foto', { absensi_id: absensiId });
  m.body.innerHTML = r.success ? '<img src="' + r.data + '" alt="Foto selfie" style="width:100%;border-radius:10px">' : errorBox(r.message);
}
// =====================================================================
// MATERI — daftar (guru), unggah, dan penampil pop-up (guru & siswa)
// =====================================================================
function materiCover(m) {
  var yid = m.tipe === 'video' ? ytId(m.url_konten) : '';
  return yid ? '<img src="https://i.ytimg.com/vi/' + yid + '/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">' : '<div class="art" style="background:linear-gradient(135deg,' + mapelWarna(m.mata_pelajaran) + ',#0F2138)">' + ic(mapelIcon(m.mata_pelajaran)) + '</div>';
}
registerPage('guru', 'materi', {
  title: 'Materi',
  st: { q: '', mapel: '', kelas: '', tipe: '', view: 'grid', page: 1 },
  init: function (el) {
    var st = this.st, self = this;
    el.innerHTML = pageHead('Panel Guru <span>// Manajemen Materi Pembelajaran</span>', 'Materi Pembelajaran', 'Kelola, unggah, dan distribusikan modul ajar, dokumen PDF, dan tautan video pembelajaran interaktif untuk siswa.',
      '<button class="btn btn-outline" id="mSync">' + ic('folder-sync') + 'Sinkronisasi Google Drive</button><button class="btn btn-dark" id="mAdd">' + ic('circle-plus') + 'Unggah Materi Baru</button>') +
      '<div class="grid g3" id="mKpi"></div>' +
      '<div class="card mt24"><div class="toolbar"><div class="field search"><div class="inp-ic">' + ic('search') + '<input class="inp" id="mQ" placeholder="Cari judul materi, topik, atau kata kunci…"></div></div><div class="field"><select class="sel" id="mMapel"></select></div><div class="field"><select class="sel" id="mKelas"></select></div>' +
      '<div class="field"><select class="sel" id="mTipe"><option value="">Tipe Konten: Semua</option><option value="dokumen">Dokumen</option><option value="video">Video</option></select></div><div class="tabs light"><button data-v="grid">' + ic('layout-grid') + 'Grid</button><button data-v="list">' + ic('list') + 'List</button></div></div></div>' +
      '<div id="mBody" class="mt24"></div>';
    var rer = function () { st.page = 1; self.body(el); };
    $('#mQ', el).oninput = debounce(function () { st.q = this.value.toLowerCase(); rer(); }, 250);
    $('#mMapel', el).onchange = function () { st.mapel = this.value; rer(); };
    $('#mKelas', el).onchange = function () { st.kelas = this.value; rer(); };
    $('#mTipe', el).onchange = function () { st.tipe = this.value; rer(); };
    $$('[data-v]', el).forEach(function (b) { b.onclick = function () { st.view = b.dataset.v; self.body(el); }; });
    $('#mAdd', el).onclick = function () { materiForm(); };
    $('#mSync', el).onclick = async function () { btnBusy(this, true); await refreshBoot(true); btnBusy(this, false); toast('Materi tersinkron.', 'ok'); };
    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-m]'); if (t) { var m = materiById(t.dataset.m); if (t.dataset.op === 'edit') materiForm(m); else if (t.dataset.op === 'del') self.hapus(m); else if (t.dataset.op === 'dl') window.open(m.drive_file_id && !DEMO ? 'https://drive.google.com/uc?export=download&id=' + m.drive_file_id : materiUrl(m), '_blank'); else if (t.dataset.op === 'share') shareMateri(m); else bukaMateri(m.materi_id); }
      var p = e.target.closest('[data-pg]'); if (p && !p.disabled) { st.page = Number(p.dataset.pg); self.body(el); window.scrollTo({ top: $('#mBody', el).offsetTop - 80, behavior: 'smooth' }); }
    });
  },
  render: function (el) {
    var ms = B().materi || [], st = this.st;
    var doc = ms.filter(function (m) { return m.tipe !== 'video'; }).length, akses = ms.reduce(function (a, m) { return a + Number(m.akses || 0); }, 0);
    var minggu = ms.filter(function (m) { return Date.now() - new Date(m.tanggal_upload).getTime() < 7 * 864e5; }).length;
    var size = ms.reduce(function (a, m) { return a + Number(m.ukuran || 0); }, 0);
    $('#mKpi', el).innerHTML = kpi('Total Modul Aktif', ms.length + '<small>Modul Aktif</small>', doc + ' Dokumen PDF • ' + (ms.length - doc) + ' Video Interaktif', 'library-big') +
      kpi('Penyimpanan Drive', fmtSize(size) || '0 KB', '<div class="bar mt8"><i class="amber" style="width:' + Math.min(100, size / (15 * 1073741824) * 100 + 2) + '%"></i></div><div class="mt8">dari kuota Google Drive 15 GB</div>', 'cloud', 'amber') +
      kpi('Akses Siswa', fmtN(akses) + '<small>Siswa membuka materi</small>', '<span class="amber b">' + ic('trending-up') + ' +' + minggu + ' materi baru minggu ini</span>', 'pointer');
    $('#mMapel', el).innerHTML = mapelOpts(st.mapel, 'Mata Pelajaran: Semua');
    $('#mKelas', el).innerHTML = kelasOpts(st.kelas, 'Kelas: Semua');
    this.body(el);
  },
  body: function (el) {
    var st = this.st;
    $$('[data-v]', el).forEach(function (b) { b.classList.toggle('on', b.dataset.v === st.view); });
    var rows = (B().materi || []).filter(function (m) {
      if (st.mapel && m.mata_pelajaran !== st.mapel) return false;
      if (st.kelas && m.kelas_id && m.kelas_id !== st.kelas) return false;
      if (st.tipe && m.tipe !== st.tipe) return false;
      if (st.q && (m.judul + ' ' + m.deskripsi + ' ' + m.mata_pelajaran).toLowerCase().indexOf(st.q) === -1) return false;
      return true;
    }).sort(function (a, b) { return String(b.tanggal_upload).localeCompare(String(a.tanggal_upload)); });
    var p = paginate(rows, st.page, 6); st.page = p.page;
    if (!rows.length) { $('#mBody', el).innerHTML = '<div class="card">' + emptyHtml('Belum ada materi', 'Klik "Unggah Materi Baru" untuk menambahkan dokumen atau video.', 'book-open') + '</div>'; return; }
    if (st.view === 'list') {
      $('#mBody', el).innerHTML = '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Materi</th><th>Mapel • Kelas</th><th>Guru</th><th>Diunggah</th><th>Akses</th><th class="tr">Aksi</th></tr></thead><tbody>' + p.rows.map(function (m) {
        return '<tr><td><div class="who"><span class="av sm" style="border-radius:8px;background:' + mapelWarna(m.mata_pelajaran) + '">' + ic(m.tipe === 'video' ? 'circle-play' : 'file-text') + '</span><div><b class="navy" style="cursor:pointer" data-m="' + esc(m.materi_id) + '">' + esc(m.judul) + '</b><small>' + (m.tipe === 'video' ? 'Video ' + esc(m.durasi || '') : 'Dokumen ' + fmtSize(m.ukuran)) + '</small></div></div></td><td>' + esc(m.mata_pelajaran) + '<div class="xs muted">' + esc(kelasNama(m.kelas_id)) + '</div></td><td class="small">' + esc(guruNama(m.guru_id)) + '</td><td class="small">' + relTime(m.tanggal_upload) + '</td><td>' + fmtN(m.akses || 0) + '</td>' +
          '<td class="tr nowrap"><button class="btn-ic" data-m="' + esc(m.materi_id) + '">' + ic('eye') + '</button><button class="btn-ic" data-m="' + esc(m.materi_id) + '" data-op="edit">' + ic('pencil') + '</button><button class="btn-ic" data-m="' + esc(m.materi_id) + '" data-op="del">' + ic('trash-2') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>' + pagerHtml(p, 'materi pembelajaran') + '</div>';
      return;
    }
    $('#mBody', el).innerHTML = '<div class="grid g3">' + p.rows.map(function (m) {
      var g = guruById(m.guru_id) || {};
      return '<div class="card mcard"><div class="body"><div class="meta"><span class="bdg info">' + ic(m.tipe === 'video' ? 'circle-play' : 'file-text') + (m.tipe === 'video' ? 'Video Pembelajaran' : 'Dokumen PDF') + '</span><span>' + (m.tipe === 'video' ? esc(m.durasi || '') : fmtSize(m.ukuran)) + '</span></div>' +
        '<div class="subj">' + esc(m.mata_pelajaran) + ' • ' + esc(m.kelas_id ? kelasNama(m.kelas_id) : 'Semua Kelas') + '</div><h4>' + esc(m.judul) + '</h4><p class="clamp3">' + esc(m.deskripsi || '') + '</p>' +
        '<div class="foot">' + avatar(g.nama_lengkap || '-', '', 'sm') + '<div class="grow"><b class="ellipsis">' + esc(g.nama_lengkap || '-') + '</b><small>Diunggah: ' + relTime(m.tanggal_upload) + ' • ' + fmtN(m.akses || 0) + ' akses</small></div><button class="btn-ic" data-m="' + esc(m.materi_id) + '" data-op="edit" title="Ubah">' + ic('pencil') + '</button><button class="btn-ic" data-m="' + esc(m.materi_id) + '" data-op="' + (m.tipe === 'video' ? 'share' : 'dl') + '" title="' + (m.tipe === 'video' ? 'Bagikan' : 'Unduh') + '">' + ic(m.tipe === 'video' ? 'share-2' : 'download') + '</button></div>' +
        '<button class="btn btn-primary btn-block" data-m="' + esc(m.materi_id) + '">' + ic(m.tipe === 'video' ? 'play' : 'eye') + (m.tipe === 'video' ? 'Putar Video (Pop-up)' : 'Buka Materi (Pop-up)') + '</button></div></div>';
    }).join('') + '</div><div class="card mt24">' + pagerHtml(p, 'materi pembelajaran') + '</div>';
  },
  hapus: async function (m) {
    if (!await confirmBox('Hapus materi "' + m.judul + '"? Siswa tidak dapat membukanya lagi.', { danger: true, ok: 'Hapus' })) return;
    var prev = B().materi.slice(); B().materi = prev.filter(function (x) { return x.materi_id !== m.materi_id; }); markAllDirty(true);
    var r = await api('materi.delete', { materi_id: m.materi_id });
    if (!toastRes(r)) { B().materi = prev; markAllDirty(true); } else afterWrite();
  }
});
function materiById(id) { return (B().materi || []).filter(function (m) { return m.materi_id === id; })[0]; }
function shareMateri(m) { var u = 'https://www.youtube.com/watch?v=' + ytId(m.url_konten); if (navigator.share) navigator.share({ title: m.judul, url: u }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast('Tautan video disalin.', 'ok'); }); }

function materiForm(m) {
  m = m || {}; var isNew = !m.materi_id, tipe = m.tipe || 'dokumen', file = null, maks = Number(cfg('MATERI_MAKS_MB', 20));
  var md = modal({ title: isNew ? 'Unggah Materi Baru' : 'Ubah Materi', sub: 'Dokumen tersimpan di Google Drive /SIAKAD_MATERI/, video YouTube di-embed otomatis.', size: 'lg',
    body: '<div class="seg" id="mfTipe" style="max-width:360px"><button type="button" data-t="dokumen">Dokumen PDF/Word</button><button type="button" data-t="video">Video YouTube</button></div>' +
      '<div class="grid-form mt16"><div class="field"><label>Judul Materi <span class="req">*</span></label><input class="inp" name="judul" value="' + esc(m.judul || '') + '" placeholder="Contoh: Modul Turunan Fungsi Trigonometri"></div>' +
      '<div class="field c6"><label>Mata Pelajaran <span class="req">*</span></label><select class="sel" name="mata_pelajaran">' + mapelOpts(m.mata_pelajaran, '— Pilih —') + '</select></div><div class="field c6"><label>Untuk Kelas</label><select class="sel" name="kelas_id">' + kelasOpts(m.kelas_id, 'Semua Kelas') + '</select></div>' +
      '<div class="field"><label>Deskripsi / Ringkasan KD</label><textarea class="inp" name="deskripsi" rows="3">' + esc(m.deskripsi || '') + '</textarea></div>' +
      '<div class="field" id="mfDoc"><label>Berkas Dokumen</label><label class="drop" id="mfDrop"><div class="ic">' + ic('cloud-upload') + '</div><b id="mfFileLbl">' + (m.drive_file_id || (m.tipe === 'dokumen' && m.url_konten) ? 'Berkas saat ini tersimpan — pilih file baru untuk mengganti' : 'Seret & lepas file di sini atau klik untuk memilih') + '</b><div class="small muted">PDF, DOCX, PPTX • maks. ' + maks + ' MB</div><input type="file" hidden accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" id="mfFile"></label>' +
      '<div class="small muted mt8">atau tempel tautan Google Drive:</div><input class="inp mt8" name="url_doc" value="' + esc(m.tipe === 'dokumen' && !m.drive_file_id && m.url_konten && !/^demo\//.test(m.url_konten) ? m.url_konten : '') + '" placeholder="https://drive.google.com/file/d/…/view"></div>' +
      '<div class="field" id="mfVid" hidden><label>URL YouTube <span class="req">*</span></label><div class="inp-ic">' + ic('circle-play') + '<input class="inp" name="url_vid" value="' + esc(m.tipe === 'video' ? 'https://www.youtube.com/watch?v=' + ytId(m.url_konten) : '') + '" placeholder="https://www.youtube.com/watch?v=…"></div><div class="grid-form mt12"><div class="field c6"><label>Durasi</label><input class="inp" name="durasi" value="' + esc(m.durasi || '') + '" placeholder="45 Menit"></div></div><div id="mfYt" class="mt12"></div></div>' +
      (isNew ? '<div class="field"><label class="chk"><input type="checkbox" name="kirimNotif"> Kirim notifikasi materi baru ke siswa (WA/Email, sesuai pengaturan)</label></div>' : '') + '</div>',
    foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-dark" id="mfSave">' + ic('upload') + (isNew ? 'Unggah & Publikasikan' : 'Simpan Perubahan') + '</button>' });
  var el = md.el;
  function setT(t) { tipe = t; $$('#mfTipe button', el).forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); }); $('#mfDoc', el).hidden = t !== 'dokumen'; $('#mfVid', el).hidden = t !== 'video'; }
  setT(tipe);
  $$('#mfTipe button', el).forEach(function (b) { b.onclick = function () { setT(b.dataset.t); }; });
  function ytPrev() { var id = ytId(el.querySelector('[name=url_vid]').value); $('#mfYt', el).innerHTML = id ? '<div class="row gap12"><img src="https://i.ytimg.com/vi/' + id + '/mqdefault.jpg" style="width:160px;border-radius:8px" alt=""><span class="bdg ok">' + ic('circle-check') + 'Video ID: ' + id + '</span></div>' : ''; }
  el.querySelector('[name=url_vid]').oninput = ytPrev; ytPrev();
  function pick(f) {
    if (!f) return;
    if (f.size > maks * 1048576) { toast('Ukuran file melebihi ' + maks + ' MB.', 'bad'); return; }
    file = f; $('#mfFileLbl', el).innerHTML = ic('file-check') + ' ' + esc(f.name) + ' <span class="muted">(' + fmtSize(f.size) + ')</span>';
    var j = el.querySelector('[name=judul]'); if (!j.value) j.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  }
  $('#mfFile', el).onchange = function () { pick(this.files[0]); };
  var drop = $('#mfDrop', el);
  ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { pick(e.dataTransfer.files[0]); });
  $('#mfSave', el).onclick = async function () {
    var d = formData(el), btn = this;
    var data = { materi_id: m.materi_id, judul: d.judul, deskripsi: d.deskripsi, mata_pelajaran: d.mata_pelajaran, kelas_id: d.kelas_id, tipe: tipe, durasi: d.durasi, url_konten: tipe === 'video' ? d.url_vid : (d.url_doc || m.url_konten) };
    if (!data.judul || !data.mata_pelajaran) return toast('Judul dan mata pelajaran wajib diisi.', 'bad');
    if (tipe === 'video' && !ytId(d.url_vid)) return toast('URL YouTube tidak valid.', 'bad');
    if (tipe === 'dokumen' && !file && !data.url_konten) return toast('Pilih file dokumen atau tempel tautan Google Drive.', 'bad');
    btnBusy(btn, true);
    var payload = { data: data, kirimNotif: d.kirimNotif };
    if (file && tipe === 'dokumen') payload.file = await readFileB64(file);
    var r = await api('materi.save', payload);
    btnBusy(btn, false);
    if (!toastRes(r)) return;
    var list = B().materi, i = list.findIndex(function (x) { return x.materi_id === r.data.materi_id; });
    if (i > -1) list[i] = Object.assign(list[i], r.data); else list.unshift(Object.assign({ akses: 0 }, r.data));
    md.close(); markAllDirty(true); afterWrite();
  };
}

/** Penampil materi pop-up (PRD US-07) — dipakai guru & siswa */
function bukaMateri(id) {
  var m = (AppState.boot && AppState.boot.materi || []).filter(function (x) { return x.materi_id === id; })[0];
  if (!m) return toast('Materi tidak ditemukan.', 'bad');
  var url = materiUrl(m), isVid = m.tipe === 'video', yid = ytId(m.url_konten);
  if (/^data:/.test(url)) { try { var bin = atob(url.split(',')[1]), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); url = URL.createObjectURL(new Blob([arr], { type: url.substring(5, url.indexOf(';')) })); } catch (e) {} }
  var guru = m.guru || (typeof guruNama === 'function' && AppState.role === 'guru' ? guruNama(m.guru_id) : '');
  var frame = isVid ? '<iframe class="viewer-frame" src="https://www.youtube-nocookie.com/embed/' + yid + '?rel=0&autoplay=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="' + esc(m.judul) + '"></iframe>'
    : '<iframe class="viewer-frame doc" src="' + esc(url) + '" title="' + esc(m.judul) + '" allow="fullscreen"></iframe>';
  var md = modal({ title: m.judul, sub: m.mata_pelajaran + ' • ' + (m.kelas_id ? (typeof kelasNama === 'function' && AppState.role === 'guru' ? kelasNama(m.kelas_id) : 'Kelas Anda') : 'Semua Kelas') + (guru ? ' • ' + guru : ''), size: 'xl',
    body: '<div class="viewer-tabs" style="margin:-20px -20px 16px"><button class="on" data-vt="1">' + ic(isVid ? 'circle-play' : 'file-text') + (isVid ? 'Video Pembelajaran' : 'Pratinjau Dokumen') + '</button><button data-vt="2">' + ic('info') + 'Ringkasan & Info</button></div>' +
      '<div data-vp="1">' + frame + (isVid ? '' : '<div class="row between wrap mt12 small"><span class="muted">' + ic('shield-check') + ' Tersinkron Google Drive (/SIAKAD_MATERI/)</span><a class="btn btn-soft btn-sm" href="' + esc(url) + '" target="_blank" rel="noopener">' + ic('external-link') + 'Buka di tab baru</a></div>') + '</div>' +
      '<div data-vp="2" hidden><dl class="kv-list"><dt>Mata Pelajaran</dt><dd>' + esc(m.mata_pelajaran) + '</dd><dt>Guru</dt><dd>' + esc(guru || '-') + '</dd><dt>Tipe</dt><dd>' + (isVid ? 'Video YouTube ' + esc(m.durasi || '') : 'Dokumen ' + fmtSize(m.ukuran)) + '</dd><dt>Diunggah</dt><dd>' + esc(relTime(m.tanggal_upload)) + '</dd></dl><div class="divider"></div><p style="white-space:pre-line;margin:0">' + esc(m.deskripsi || 'Tidak ada ringkasan.') + '</p></div>',
    onClose: function () { if (/^blob:/.test(url)) URL.revokeObjectURL(url); } });
  $$('[data-vt]', md.el).forEach(function (b) { b.onclick = function () { $$('[data-vt]', md.el).forEach(function (x) { x.classList.toggle('on', x === b); }); $$('[data-vp]', md.el).forEach(function (p) { p.hidden = p.dataset.vp !== b.dataset.vt; }); }; });
  if (AppState.role === 'siswa' && !m.dibaca) { m.dibaca = true; api('materi.view', { materi_id: m.materi_id }); Pages.siswa.materi.dirty = true; Pages.siswa.dashboard.dirty = true; }
}
