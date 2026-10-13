/* =====================================================================
   SIAKAD SISWA — pages-siswa.js : Portal Siswa
   Beranda, Absensi Saya (GPS & selfie), Materi, Nilai & Raport, Jadwal, Akun.
   ===================================================================== */
'use strict';
function SB() { return AppState.boot || {}; }
function kkmS() { return Number((SB().cfg || {}).KKM || 70); }
function nilaiAktifS() { var c = SB().cfg || {}; return (SB().nilai || []).filter(function (n) { return n.tahun_ajaran === c.TAHUN_AJARAN && n.semester === c.SEMESTER; }); }
function favs() { return Store.get(userKey('fav'), {}); }

// =====================================================================
// BERANDA SISWA
// =====================================================================
registerPage('siswa', 'dashboard', {
  title: 'Beranda',
  render: function (el) {
    var b = SB(), p = b.profil || {}, c = b.cfg || {}, r = b.rekap || {}, hi = b.hariIni;
    var nl = nilaiAktifS().filter(function (n) { return n.nilai_akhir !== ''; }), avg = nl.length ? nl.reduce(function (a, n) { return a + Number(n.nilai_akhir); }, 0) / nl.length : null;
    var mapelSet = {}; (b.jadwal || []).forEach(function (j) { mapelSet[j.mata_pelajaran] = 1; }); nl.forEach(function (n) { mapelSet[n.mata_pelajaran] = 1; });
    var kel = {}; Object.keys(mapelSet).forEach(function (m) { var mm = (b.mapel || []).filter(function (x) { return x.nama === m; })[0]; var k = mm ? mm.kelompok : 'Wajib'; kel[k] = (kel[k] || 0) + 1; });
    var mat = b.materi || [], baru = mat.filter(function (m) { return Date.now() - new Date(m.tanggal_upload).getTime() < 7 * 864e5; }).length, dibaca = mat.filter(function (m) { return m.dibaca; }).length;
    var hariN = hariDari(todayStr()), jd = (b.jadwal || []).filter(function (j) { return j.hari === hariN; }).sort(function (a, x) { return a.jam_mulai.localeCompare(x.jam_mulai); });
    el.innerHTML =
      '<div class="card card-p row wrap gap16" style="padding:24px 28px"><div class="grow" style="min-width:260px"><div class="row wrap gap4"><span class="bdg navy">SEMESTER ' + esc(String(c.SEMESTER || '').toUpperCase()) + ' – ' + esc(c.TAHUN_AJARAN) + '</span><span class="bdg info">' + esc(p.nama_kelas) + '</span><span class="bdg amber dot">Kurikulum Merdeka</span></div><h1 class="h-hero" style="margin-top:10px">Selamat datang kembali, ' + esc(String(p.nama_lengkap || '').split(' ').slice(0, 2).join(' ')) + '!</h1><p class="muted" style="margin:4px 0 0">Berikut ringkasan akademik dan status portal Anda hari ini.</p></div>' +
      '<div class="row gap12" style="background:var(--surface-2);padding:12px 18px;border-radius:12px">' + avatar(p.nama_lengkap, p.foto_profil_url, 'lg') + '<div><b>' + esc(p.nama_lengkap) + '</b><div class="small muted">NIS: ' + esc(p.NIS) + '</div><div class="small amber b">' + esc(p.status || 'Aktif') + ' • Siswa Reguler</div></div></div></div>' +
      '<div class="card card-p mt16 row wrap gap16"><span class="av lg" style="background:' + (hi && hi.status === 'Hadir' ? 'var(--surface-3);color:var(--navy)' : 'var(--amber-bg);color:var(--amber-ink)') + '">' + ic(hi && hi.status === 'Hadir' ? 'circle-check' : 'clock-alert') + '</span><div class="grow" style="min-width:220px"><div class="row wrap gap4"><b style="font-size:17px">Status Kehadiran Hari Ini</b>' + (hi ? '<span class="bdg">Terverifikasi Presensi Digital</span>' : '') + '</div><div class="b mt8">' + (hi ? esc(hi.status) + (hi.status === 'Hadir' ? ' (tercatat via ' + esc(metodeLabelS(hi.metode)) + ' pukul ' + esc(jam5(hi.jam)) + ' WIB)' : '') + (hi.terlambat === 'YA' ? ' <span class="bdg warn">Terlambat</span>' : '') : '<span class="amber">Belum tercatat hadir</span> <span class="small muted">• Batas masuk ' + esc(c.JAM_MASUK) + ' WIB</span>') + '</div></div>' +
      (hi && hi.status === 'Hadir' ? '<a class="btn btn-soft" href="#/absensi">' + ic('history') + 'Lihat Riwayat</a>' : '<a class="btn btn-dark" href="#/absensi/selfie">' + ic('camera') + 'Absen Selfie</a><a class="btn btn-soft" href="#/absensi/lokasi">' + ic('navigation') + 'GPS Check-in</a>') + '</div>' +
      tagihanBanner() +
      '<div class="grid g4 mt16">' +
      kpiS('Tingkat Kehadiran', r.persen == null ? '-' : fmtN(r.persen) + '<small>%</small>', '<div class="bar"><i style="width:' + (r.persen || 0) + '%"></i></div><div class="mt8">Hadir: ' + r.H + ' · Alpha: ' + r.A + ' · Izin/Sakit: ' + (r.I + r.S) + '</div>', 'calendar-check') +
      kpiS('Rata-rata Akademik', avg == null ? '-' : fmtN(avg) + '<small>/ 100</small>', '<div class="bar"><i class="amber" style="width:' + (avg || 0) + '%"></i></div><div class="mt8">KKM: ' + kkmS() + (b.peringkat ? ' · Peringkat ' + b.peringkat + ' dari ' + b.jumlahSiswaKelas : '') + '</div>', 'award', avg != null && avg >= kkmS() ? '<span class="pill">Tuntas</span>' : '') +
      kpiS('Mata Pelajaran', Object.keys(mapelSet).length, '<div class="row wrap gap4">' + Object.keys(kel).map(function (k) { return '<span class="bdg info">' + esc(k) + ' (' + kel[k] + ')</span>'; }).join('') + '</div><div class="mt8">Semua modul semester ' + esc(c.SEMESTER) + '</div>', 'book-marked') +
      kpiS('Materi Aktif', mat.length + (baru ? '<small class="amber b">+' + baru + ' Baru</small>' : ''), '<div class="bar"><i style="width:' + pct(dibaca, mat.length || 1) + '%"></i></div><div class="mt8">' + dibaca + ' dari ' + mat.length + ' sudah dibuka</div>', 'library-big') + '</div>' +
      '<div class="grid g-main mt24"><div class="card"><div class="card-h"><div class="grow"><h3>Jadwal Pelajaran Hari Ini</h3><p>' + esc(tglHari(todayStr())) + '</p></div><a href="#/jadwal" class="small b">Lihat Mingguan ›</a></div><div class="card-b">' +
      (jd.length ? jd.map(function (j) { var s = statusSesi(j); return '<div class="sched ' + (s === 'berlangsung' ? 'now' : '') + '"><span class="list-i" style="padding:0;background:none"><span class="ic ' + (s === 'berlangsung' ? 'solid' : '') + '">' + ic(mapelIcon(j.mata_pelajaran)) + '</span></span><div class="grow"><div class="row wrap gap4"><b>' + esc(j.mata_pelajaran) + '</b>' + (s === 'berlangsung' ? '<span class="bdg navy">Berlangsung</span>' : s === 'berikutnya' ? '<span class="bdg">Berikutnya</span>' : '<span class="bdg ok">Selesai</span>') + '</div><div class="small muted">' + esc(j.guru) + ' • ' + esc(j.ruang || '-') + '</div></div><span class="time">' + esc(j.jam_mulai) + ' – ' + esc(j.jam_selesai) + '</span></div>'; }).join('') : emptyHtml('Tidak ada jadwal hari ini', 'Selamat beristirahat!', 'coffee')) + '</div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>' + ic('star', 'amber') + ' Ringkasan Raport</h3></div><span class="pill">Semester ' + esc(c.SEMESTER) + '</span></div><div class="card-b">' +
      (nl.length ? '<table class="tbl"><thead><tr><th>Mapel</th><th class="tc">Harian</th><th class="tc">UTS</th><th class="tr">Status</th></tr></thead><tbody>' + nl.slice(0, 5).map(function (n) { return '<tr><td class="ellipsis" style="max-width:130px">' + esc(n.mata_pelajaran) + '</td><td class="tc">' + fmtN(n.nilai_harian) + '</td><td class="tc b">' + fmtN(n.nilai_uts) + '</td><td class="tr"><span class="bdg ' + (Number(n.nilai_akhir) >= kkmS() ? 'info' : 'bad') + '">' + (Number(n.nilai_akhir) >= kkmS() ? 'Tuntas' : 'Perbaikan') + ' (' + fmtN(n.nilai_akhir, 0) + ')</span></td></tr>'; }).join('') + '</tbody></table><div class="row between mt12" style="background:var(--surface-2);padding:10px 12px;border-radius:8px"><span class="small">Rata-rata: <b>' + fmtN(avg) + '</b></span><a href="#/nilai" class="b small">Raport Lengkap ›</a></div>' : emptyHtml('Nilai belum terbit', '', 'award')) + '</div></div></div>' +
      '<div class="grid g-main mt24"><div class="card"><div class="card-h"><div class="grow"><h3>Materi Terbaru</h3><p>Modul yang baru diperbarui guru pengampu</p></div><span class="pill">' + baru + ' Materi Baru</span></div><div class="card-b"><div class="grid g2" style="gap:14px">' +
      (mat.length ? mat.slice(0, 2).map(function (m) { return '<div class="list-i" style="flex-direction:column;align-items:stretch;gap:12px;padding:16px"><div class="row gap12"><span class="ic">' + ic(m.tipe === 'video' ? 'circle-play' : 'file-text') + '</span><div class="grow"><div class="xs b amber">' + esc(String(m.mata_pelajaran).toUpperCase()) + '</div><b class="clamp2">' + esc(m.judul) + '</b><small>' + esc(m.guru) + (m.tipe === 'video' ? '' : ' • ' + fmtSize(m.ukuran)) + '</small></div></div><div class="row between"><small>' + esc(relTime(m.tanggal_upload)) + '</small><button class="btn btn-outline btn-sm" data-mat="' + esc(m.materi_id) + '">' + ic(m.tipe === 'video' ? 'play' : 'eye') + (m.tipe === 'video' ? 'Putar' : 'Pratinjau') + '</button></div></div>'; }).join('') : emptyHtml('Belum ada materi', '', 'book-open')) + '</div></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>' + ic('megaphone') + ' Pengumuman Sekolah</h3></div></div><div class="card-b">' + ((b.pengumuman || []).slice(0, 2).map(function (a, i) { return '<div class="ann ' + (i ? 'amber' : '') + '"><div class="meta"><span>' + esc(relTime(a.tanggal)) + '</span><span class="bdg ' + (a.kategori === 'Event' ? 'amber' : 'info') + '">' + esc(String(a.kategori).toUpperCase()) + '</span></div><h4>' + esc(a.judul) + '</h4><p class="clamp2">' + esc(a.isi) + '</p></div>'; }).join('') || emptyHtml('Belum ada pengumuman', '', 'megaphone')) + '<button class="btn btn-ghost btn-block mt12" id="annAll">Lihat Semua Informasi</button></div></div></div>';
    $$('[data-mat]', el).forEach(function (bt) { bt.onclick = function () { bukaMateri(bt.dataset.mat); }; });
    $('#annAll', el).onclick = showPengumuman;
  }
});
function tagihanBanner() {
  var t = (akunInfo().tagihan) || {};
  if (!t.belum && !t.menunggu) return '';
  return '<a class="presensi-banner ' + (t.belum ? 'todo' : 'in') + ' mt16" href="#/tagihan">' + ic('wallet') + '<div class="grow"><b>' + (t.belum ? t.belum + ' tagihan belum dibayar • ' + rp(t.tunggakan) : t.menunggu + ' pembayaran menunggu verifikasi') + '</b><small>' + (t.belum && t.jatuhTempo ? 'Jatuh tempo terdekat ' + esc(tglIndo(t.jatuhTempo)) + ' • bayar beberapa tagihan sekaligus dengan 1 bukti' : 'Bendahara sedang memeriksa bukti transfer Anda') + '</small></div><span class="btn btn-sm ' + (t.belum ? 'btn-accent' : 'btn-soft') + '">Lihat ' + ic('arrow-right') + '</span></a>';
}
function kpiS(label, value, sub, icon, pill) { return '<div class="card kpi"><div class="kl">' + label + '</div><div class="ki">' + (pill || ic(icon)) + '</div><div class="kv">' + value + '</div><div class="ks">' + sub + '</div></div>'; }
function metodeLabelS(m) { return { barcode: 'Barcode', selfie: 'Selfie + GPS', lokasi: 'Lokasi GPS', manual: 'Input Guru' }[m] || m; }

// =====================================================================
// ABSENSI SAYA — GPS (US-04) & Selfie (US-03)
// =====================================================================
registerPage('siswa', 'absensi', {
  title: 'Absensi Saya',
  st: { mode: 'lokasi', pos: null, err: '', stream: null, foto: null, simulasi: DEMO, page: 1 },
  render: function (el, param) {
    var st = this.st, self = this, b = SB(), c = b.cfg || {}, hi = b.hariIni, r = b.rekap || {};
    if (param === 'selfie' || param === 'lokasi') st.mode = param;
    var sudah = hi && hi.status === 'Hadir';
    el.innerHTML = pageHead('Portal Siswa <span>/ Absensi Saya</span>', 'Absensi Saya', 'Absen mandiri dengan lokasi GPS atau selfie dari salah satu lokasi sekolah yang terdaftar untuk akun Anda. Riwayat kehadiran semester tercatat otomatis.') +
      '<div class="grid g-main-r"><div class="card"><div class="card-h"><div class="grow"><h3>Absen Hari Ini</h3><p>' + esc(tglHari(todayStr())) + ' • Batas masuk ' + esc(c.JAM_MASUK) + ' WIB</p></div>' + (sudah ? '<span class="bdg ok">' + ic('circle-check') + 'Sudah Hadir</span>' : '<span class="bdg warn">Belum Absen</span>') + '</div><div class="card-b" id="abBox"></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>Rekap Kehadiran Semester</h3><p>' + r.hari + ' hari efektif tercatat</p></div></div><div class="card-b"><div class="row gap16 wrap"><div style="position:relative;width:130px;height:130px">' + donut([{ v: r.H, c: '#1E3A5F', l: 'Hadir' }, { v: r.I, c: '#F5A623', l: 'Izin' }, { v: r.S, c: '#7D93B5', l: 'Sakit' }, { v: r.A, c: '#DC2626', l: 'Alpha' }], 130) + '<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center"><div><b style="font-size:22px">' + (r.persen == null ? '-' : fmtN(r.persen) + '%') + '</b><div class="xs muted">kehadiran</div></div></div></div>' +
      '<div class="grow"><div class="grid g2" style="gap:8px">' + [['Hadir', r.H, 'navy'], ['Izin', r.I, 'amber'], ['Sakit', r.S, ''], ['Alpha', r.A, 'red']].map(function (x) { return '<div class="list-i" style="padding:10px 12px"><div class="grow"><small>' + x[0] + '</small><b class="' + x[2] + '" style="font-size:20px">' + x[1] + '</b></div></div>'; }).join('') + '</div><div class="small mt12">' + ic('clock') + ' Terlambat: <b>' + (r.T || 0) + ' kali</b></div></div></div>' +
      '<div class="xs b muted mt16">KALENDER KEHADIRAN (30 HARI SEKOLAH TERAKHIR)</div><div class="heat mt8" id="abHeat"></div><div class="legend mt8"><span><i style="background:#1E3A5F;border-radius:3px"></i>Hadir</span><span><i style="background:#F5A623;border-radius:3px"></i>Izin</span><span><i style="background:#7D93B5;border-radius:3px"></i>Sakit</span><span><i style="background:#DC2626;border-radius:3px"></i>Alpha</span></div></div></div></div>' +
      '<div class="card mt24"><div class="card-h"><div class="grow"><h3>Riwayat Kehadiran</h3><p>Semester ' + esc(c.SEMESTER) + ' ' + esc(c.TAHUN_AJARAN) + '</p></div></div><div class="card-b" style="padding:12px 0 0" id="abHist"></div></div>';
    var riw = (b.riwayat || []).slice(0, 30).reverse();
    $('#abHeat', el).innerHTML = riw.map(function (a) { return '<i class="' + String(a.status).charAt(0) + '" data-tip="' + esc(tglIndo(a.tanggal, true) + ': ' + a.status) + '"></i>'; }).join('') || '<span class="small muted">Belum ada catatan.</span>';
    this.hist(el);
    el.onclick = function (e) { var p = e.target.closest('[data-pg]'); if (p && !p.disabled) { st.page = Number(p.dataset.pg); self.hist(el); } };
    if (sudah) { $('#abBox', el).innerHTML = '<div class="radar"><span class="pulse ok">' + ic('circle-check') + '</span><div><b>Anda sudah tercatat Hadir</b><div class="small">Pukul ' + esc(jam5(hi.jam)) + ' WIB via ' + esc(metodeLabelS(hi.metode)) + (hi.jarak_m !== '' && hi.jarak_m != null ? ' • ' + hi.jarak_m + ' m dari titik lokasi' : '') + '</div></div></div><div class="note mt16">' + ic('info') + '<div>Absen hanya sekali per hari. Bila ada kekeliruan status, hubungi wali kelas.</div></div>'; return; }
    this.box(el);
  },
  hist: function (el) {
    var st = this.st, rows = SB().riwayat || [], p = paginate(rows, st.page, 10); st.page = p.page;
    $('#abHist', el).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>Jam</th><th>Status</th><th>Metode</th><th class="hide-m">Keterangan</th></tr></thead><tbody>' + p.rows.map(function (a) { return '<tr><td>' + esc(hariDari(a.tanggal).substring(0, 3)) + ', ' + esc(tglIndo(a.tanggal, true)) + '</td><td class="mono">' + (a.status === 'Hadir' ? esc(jam5(a.jam)) : '-') + (a.terlambat === 'YA' ? ' <span class="bdg warn">Terlambat</span>' : '') + '</td><td>' + statusBadge(a.status) + '</td><td>' + metodeBadge(a.metode) + '</td><td class="hide-m small muted">' + esc(a.keterangan || '-') + '</td></tr>'; }).join('') + '</tbody></table></div>' + pagerHtml(p, 'catatan') : emptyHtml('Belum ada riwayat', '', 'calendar');
  },
  box: function (el) {
    var st = this.st, self = this, c = SB().cfg || {}, box = $('#abBox', el);
    box.innerHTML = '<div class="seg" style="max-width:420px"><button type="button" data-md="lokasi">' + ic('navigation') + ' Lokasi GPS</button><button type="button" data-md="selfie">' + ic('camera') + ' Selfie + GPS</button></div>' +
      '<div class="mt16" id="abGeo"></div>' +
      '<div id="abSelfie" class="mt16" hidden><div class="cam-selfie" id="abCam"><div class="ph0">' + ic('camera') + '<div class="small mt8">Kamera depan akan aktif. Pastikan wajah terlihat jelas.</div></div></div><div class="row gap12 mt12" style="justify-content:center"><button class="btn btn-soft" id="abOpen">' + ic('video') + 'Aktifkan Kamera</button><button class="btn btn-accent" id="abShot" hidden>' + ic('aperture') + 'Ambil Foto</button><button class="btn btn-ghost" id="abRetake" hidden>' + ic('rotate-ccw') + 'Ulangi</button></div></div>' +
      '<button class="btn btn-dark btn-lg btn-block mt16" id="abGo" disabled>' + ic('fingerprint') + 'HADIR SEKARANG</button><div class="xs muted tc mt8" id="abHint"></div>';
    $$('[data-md]', box).forEach(function (b) { b.onclick = function () { st.mode = b.dataset.md; self.mode(el); }; });
    $('#abOpen', box).onclick = function () { self.cam(el); };
    $('#abShot', box).onclick = function () { self.shot(el); };
    $('#abRetake', box).onclick = function () { st.foto = null; self.cam(el); };
    $('#abGo', box).onclick = function () { self.submit(el, this); };
    this.geo = Geo.widget($('#abGeo', box), { simulasi: st.simulasi, onChange: function (gs) { st.pos = gs.pos; st.inside = !!(gs.best && gs.best.ok); st.err = gs.err; st.simulasi = gs.simulasi; self.can(el); } });
    this.mode(el);
  },
  mode: function (el) {
    var st = this.st;
    $$('[data-md]', el).forEach(function (b) { b.classList.toggle('on', b.dataset.md === st.mode); });
    $('#abSelfie', el).hidden = st.mode !== 'selfie';
    if (st.mode !== 'selfie') this.stopCam();
    this.can(el);
  },
  locate: function () { if (this.geo) this.geo.refresh(); },
  can: function (el) {
    var st = this.st, go = $('#abGo', el); if (!go) return;
    var ok = st.inside && (st.mode !== 'selfie' || st.foto);
    go.disabled = !ok;
    $('#abHint', el).textContent = !st.pos ? 'Aktifkan lokasi terlebih dahulu.' : !st.inside ? 'Tombol aktif bila Anda berada di dalam salah satu area lokasi.' : st.mode === 'selfie' && !st.foto ? 'Ambil foto selfie terlebih dahulu.' : 'Siap! Tekan tombol untuk mencatat kehadiran.';
  },
  cam: async function (el) {
    var st = this.st, box = $('#abCam', el);
    try {
      this.stopCam();
      st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false });
      box.innerHTML = '<video autoplay playsinline muted></video><div class="oval"></div>';
      var v = $('video', box); v.srcObject = st.stream; await v.play();
      $('#abOpen', el).hidden = true; $('#abShot', el).hidden = false; $('#abRetake', el).hidden = true;
    } catch (e) { toast(e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan izin kamera untuk situs ini.' : 'Kamera tidak tersedia di perangkat ini.', 'bad'); }
    this.can(el);
  },
  shot: async function (el) {
    var st = this.st, v = $('#abCam video', el); if (!v) return;
    var c = document.createElement('canvas'), w = v.videoWidth, h2 = v.videoHeight, sc = Math.min(1, 640 / w);
    c.width = Math.round(w * sc); c.height = Math.round(h2 * sc);
    var ctx = c.getContext('2d'); ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0, c.width, c.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(15,33,56,.7)'; ctx.fillRect(0, c.height - 28, c.width, 28); ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
    ctx.fillText((SB().profil || {}).NIS + ' • ' + todayStr() + ' ' + nowHM() + ' WIB', 10, c.height - 10);
    st.foto = c.toDataURL('image/jpeg', 0.72);
    this.stopCam();
    $('#abCam', el).innerHTML = '<img src="' + st.foto + '" alt="Pratinjau selfie">';
    $('#abShot', el).hidden = true; $('#abRetake', el).hidden = false; $('#abOpen', el).hidden = true;
    this.can(el);
  },
  stopCam: function () { if (this.st.stream) { this.st.stream.getTracks().forEach(function (t) { t.stop(); }); this.st.stream = null; } },
  submit: async function (el, btn) {
    var st = this.st;
    btnBusy(btn, true);
    var r = await api('absensi.self', { metode: st.mode, lat: st.pos.lat, lng: st.pos.lng, acc: st.pos.acc, foto: st.mode === 'selfie' ? st.foto : '', device_info: Device.info() });
    btnBusy(btn, false);
    if (!toastRes(r)) return;
    var b = SB(); b.hariIni = r.data.row; b.riwayat = [r.data.row].concat(b.riwayat || []);
    b.rekap.H++; st.foto = null;
    if (r.data.perangkatBaru && akunInfo().perangkat) { akunInfo().perangkat = { terdaftar: true, cocok: true, perluDaftar: false }; toast('Perangkat ini kini terdaftar untuk absensi Anda.', 'ok'); }
    Pages.siswa.dashboard.dirty = true;
    this.render(el, '');
    afterWrite();
  }
});

// =====================================================================
// MATERI PELAJARAN (siswa)
// =====================================================================
registerPage('siswa', 'materi', {
  title: 'Materi Pelajaran',
  st: { q: '', tipe: '', status: '', sort: 'baru', mapel: '', page: 1 },
  init: function (el) {
    var st = this.st, self = this;
    el.innerHTML = '<div class="ph"><div class="grow"><div class="eyebrow">Portal Siswa <span>/ Materi Pembelajaran</span></div><h1>Materi Pelajaran <span class="bdg amber" style="vertical-align:middle">KURIKULUM MERDEKA</span></h1><p>Akses modul ajar digital, rangkuman materi, dan video interaktif untuk persiapan ujian dan pengayaan mandiri.</p></div><div class="acts"><button class="btn btn-outline" id="smHist">' + ic('history') + 'Riwayat Modul Dipelajari</button><button class="btn btn-dark" id="smFav">' + ic('star') + 'Favorit Saya</button></div></div>' +
      '<div class="grid g4" id="smKpi"></div><div id="smHero" class="mt24"></div>' +
      '<div class="card mt24"><div class="toolbar"><div class="field search"><div class="inp-ic">' + ic('search') + '<input class="inp" id="smQ" placeholder="Cari judul materi, guru, atau topik"></div></div><div class="field"><select class="sel" id="smTipe"><option value="">Semua Format</option><option value="dokumen">Dokumen PDF</option><option value="video">Video</option></select></div><div class="field"><select class="sel" id="smStatus"><option value="">Status: Semua</option><option value="belum">Belum Dibuka</option><option value="sudah">Sudah Dipelajari</option><option value="fav">Favorit</option></select></div><div class="field"><select class="sel" id="smSort"><option value="baru">Urutkan: Terbaru</option><option value="az">Urutkan: A–Z</option></select></div></div><div class="chips" id="smChips" style="padding:0 20px 16px"></div></div>' +
      '<div class="note mt16">' + ic('lightbulb') + '<div><b>Interaktif & Mandiri:</b> semua dokumen PDF dan video pembelajaran YouTube dapat ditelaah langsung via jendela pop-up tanpa meninggalkan halaman.</div></div>' +
      '<div id="smGrid" class="mt16"></div>';
    var rer = function () { st.page = 1; self.grid(el); };
    $('#smQ', el).oninput = debounce(function () { st.q = this.value.toLowerCase(); rer(); }, 250);
    $('#smTipe', el).onchange = function () { st.tipe = this.value; rer(); };
    $('#smStatus', el).onchange = function () { st.status = this.value; rer(); };
    $('#smSort', el).onchange = function () { st.sort = this.value; rer(); };
    $('#smHist', el).onclick = function () { $('#smStatus', el).value = 'sudah'; st.status = 'sudah'; rer(); };
    $('#smFav', el).onclick = function () { $('#smStatus', el).value = 'fav'; st.status = 'fav'; rer(); };
    el.addEventListener('click', function (e) {
      var ch = e.target.closest('[data-mp]'); if (ch) { st.mapel = ch.dataset.mp; rer(); return; }
      var f = e.target.closest('[data-fav]'); if (f) { var fv = favs(); if (fv[f.dataset.fav]) delete fv[f.dataset.fav]; else fv[f.dataset.fav] = 1; Store.set(userKey('fav'), fv); self.render(el); return; }
      var o = e.target.closest('[data-open]'); if (o) { Store.set(userKey('lastMat'), { id: o.dataset.open, t: Date.now() }); bukaMateri(o.dataset.open); setTimeout(function () { self.render(el); }, 300); return; }
      var p = e.target.closest('[data-pg]'); if (p && !p.disabled) { st.page = Number(p.dataset.pg); self.grid(el); }
    });
  },
  render: function (el) {
    var mat = SB().materi || [], fv = favs(), dib = mat.filter(function (m) { return m.dibaca; }).length;
    var baru = mat.filter(function (m) { return !m.dibaca && Date.now() - new Date(m.tanggal_upload).getTime() < 7 * 864e5; });
    var mp = {}; mat.forEach(function (m) { mp[m.mata_pelajaran] = 1; });
    $('#smKpi', el).innerHTML = kpiS('Total Modul Tersedia', mat.length + '<small>Modul</small>', 'Terbagi ke ' + Object.keys(mp).length + ' mata pelajaran', 'library-big') +
      kpiS('Progres Belajar Mandiri', Math.round(pct(dib, mat.length || 1)) + '<small>% Selesai</small>', '<div class="bar"><i style="width:' + pct(dib, mat.length || 1) + '%"></i></div><div class="mt8">' + dib + ' dari ' + mat.length + ' modul dibuka</div>', 'trending-up') +
      kpiS('Dokumen & Video Favorit', Object.keys(fv).filter(function (k) { return mat.some(function (m) { return m.materi_id === k; }); }).length + '<small>Disimpan</small>', 'Akses cepat materi bertanda bintang', 'star') +
      kpiS('<span class="red">●</span> Materi Baru Pekan Ini', '<span class="red">' + baru.length + '</span><small>Belum dibuka</small>', baru[0] ? '<span class="clamp2">' + esc(baru[0].judul) + '</span>' : 'Semua materi baru sudah dibuka', 'bell-ring');
    var last = Store.get(userKey('lastMat'), null), lm = last && mat.filter(function (m) { return m.materi_id === last.id; })[0];
    lm = lm || mat.filter(function (m) { return !m.dibaca; })[0];
    $('#smHero', el).innerHTML = lm ? '<div class="hero"><div class="grow" style="min-width:240px;position:relative;z-index:1"><div class="row wrap gap4"><span class="bdg" style="background:var(--amber);color:var(--text)">' + ic('circle-play') + (last && last.id === lm.materi_id ? 'LANJUTKAN BELAJAR' : 'MULAI BELAJAR') + '</span><small>' + esc(lm.mata_pelajaran) + '</small></div><h3 class="mt8">' + esc(lm.judul) + '</h3><div class="row wrap gap12 mt8"><small>' + ic('user') + ' ' + esc(lm.guru) + '</small><small>' + ic('clock') + ' ' + (last && last.id === lm.materi_id ? 'Terakhir dibuka ' + relTime(new Date(last.t).toISOString()) : 'Diunggah ' + relTime(lm.tanggal_upload)) + '</small></div></div><button class="btn btn-accent" style="position:relative;z-index:1" data-open="' + esc(lm.materi_id) + '">' + (lm.tipe === 'video' ? 'Putar Video' : 'Lanjutkan Membaca') + ' ' + ic('arrow-right') + '</button></div>' : '';
    var cnt = {}; mat.forEach(function (m) { cnt[m.mata_pelajaran] = (cnt[m.mata_pelajaran] || 0) + 1; });
    var st = this.st;
    $('#smChips', el).innerHTML = '<button class="chip ' + (!st.mapel ? 'on' : '') + '" data-mp="">Semua Mata Pelajaran <i>' + mat.length + '</i></button>' + Object.keys(cnt).map(function (k) { return '<button class="chip ' + (st.mapel === k ? 'on' : '') + '" data-mp="' + esc(k) + '">' + esc(k) + ' <i>' + cnt[k] + '</i></button>'; }).join('');
    this.grid(el);
  },
  grid: function (el) {
    var st = this.st, fv = favs();
    $$('#smChips .chip', el).forEach(function (c) { c.classList.toggle('on', c.dataset.mp === st.mapel); });
    var rows = (SB().materi || []).filter(function (m) {
      if (st.mapel && m.mata_pelajaran !== st.mapel) return false;
      if (st.tipe && m.tipe !== st.tipe) return false;
      if (st.status === 'belum' && m.dibaca) return false;
      if (st.status === 'sudah' && !m.dibaca) return false;
      if (st.status === 'fav' && !fv[m.materi_id]) return false;
      if (st.q && (m.judul + ' ' + m.guru + ' ' + m.deskripsi + ' ' + m.mata_pelajaran).toLowerCase().indexOf(st.q) === -1) return false;
      return true;
    }).sort(function (a, b) { return st.sort === 'az' ? a.judul.localeCompare(b.judul) : String(b.tanggal_upload).localeCompare(String(a.tanggal_upload)); });
    var p = paginate(rows, st.page, 6); st.page = p.page;
    $('#smGrid', el).innerHTML = rows.length ? '<div class="grid g3">' + p.rows.map(function (m) {
      var baru = !m.dibaca && Date.now() - new Date(m.tanggal_upload).getTime() < 7 * 864e5;
      return '<div class="card mcard"><div class="cover" data-open="' + esc(m.materi_id) + '" style="cursor:pointer">' + materiCover(m) + '<div class="tags"><span class="bdg" style="background:rgba(15,33,56,.8);color:#fff">' + ic(m.tipe === 'video' ? 'circle-play' : 'file-text') + (m.tipe === 'video' ? 'Video' + (m.durasi ? ' • ' + esc(m.durasi) : '') : 'PDF' + (m.ukuran ? ' • ' + fmtSize(m.ukuran) : '')) + '</span>' + (m.dibaca ? '<span class="bdg ok">' + ic('circle-check') + 'Sudah Dibuka</span>' : baru ? '<span class="bdg info">' + ic('sparkles') + 'Baru Diunggah</span>' : '<span class="bdg" style="background:#fff">' + ic('circle') + 'Belum Dibuka</span>') + '</div><div class="ttl"><small>' + esc(m.mata_pelajaran) + '</small><b class="ellipsis">' + esc(m.judul) + '</b></div></div>' +
        '<div class="body"><p class="clamp3">' + esc(m.deskripsi || '') + '</p><div class="foot">' + avatar(m.guru || '-', '', 'sm') + '<div class="grow"><b class="ellipsis">' + esc(m.guru || '-') + '</b><small>Guru ' + esc(m.mata_pelajaran) + '</small></div></div>' +
        '<div class="row gap12"><button class="btn-ic" data-fav="' + esc(m.materi_id) + '" title="Favorit" style="color:' + (fv[m.materi_id] ? 'var(--amber)' : 'var(--amber-ink)') + '">' + ic('star', fv[m.materi_id] ? 'fill-star' : '') + '</button><button class="btn btn-primary grow" data-open="' + esc(m.materi_id) + '">' + ic(m.tipe === 'video' ? 'play' : 'eye') + (m.tipe === 'video' ? 'Putar Video (Pop-up)' : 'Buka Modul (Pop-up)') + '</button></div></div></div>';
    }).join('') + '</div><div class="card mt24">' + pagerHtml(p, 'materi pembelajaran kurikulum aktif') + '</div>' : '<div class="card">' + emptyHtml('Materi tidak ditemukan', 'Ubah kata kunci atau filter.', 'search-x') + '</div>';
  }
});

// =====================================================================
// NILAI SAYA & RAPORT DIGITAL (US-09)
// =====================================================================
registerPage('siswa', 'nilai', {
  title: 'Nilai Saya',
  st: { per: '', q: '', kel: '' },
  render: function (el) {
    var st = this.st, self = this, b = SB(), c = b.cfg || {}, p = b.profil || {};
    var periods = {}; (b.nilai || []).forEach(function (n) { periods[n.tahun_ajaran + '|' + n.semester] = 1; });
    var cur = c.TAHUN_AJARAN + '|' + c.SEMESTER; periods[cur] = 1;
    if (!st.per) st.per = cur;
    el.innerHTML = '<div class="row between wrap gap12" style="margin-bottom:8px"><span class="small muted">Portal Siswa › <b>Nilai & Hasil Belajar</b> › <span class="bdg amber">Kurikulum Merdeka</span></span><span class="pill" style="background:var(--amber-bg);color:var(--amber-ink)">● Periode Penilaian Berjalan: Semester ' + esc(c.SEMESTER) + ' ' + esc(c.TAHUN_AJARAN) + '</span></div>' +
      '<div class="card card-p row wrap gap16"><div class="grow" style="min-width:260px"><h1 class="h-hero">Nilai Saya & Raport Digital <span class="bdg navy" style="vertical-align:middle">Resmi</span></h1><p class="muted" style="margin:6px 0 0">Rekapitulasi capaian kompetensi: nilai harian (' + c.BOBOT_HARIAN + '%), UTS (' + c.BOBOT_UTS + '%), UAS (' + c.BOBOT_UAS + '%), dan status ketuntasan.</p></div><div class="row gap12 wrap"><button class="btn btn-soft" id="nsPrint">' + ic('printer') + 'Cetak Transkrip Sementara</button><button class="btn btn-dark" id="nsPdf">' + ic('download') + 'Unduh Raport Lengkap (PDF)</button></div></div>' +
      '<div class="grid g4 mt16" id="nsKpi"></div>' +
      '<div class="card mt16"><div class="toolbar"><div class="field"><select class="sel" id="nsPer">' + Object.keys(periods).sort().reverse().map(function (k) { var x = k.split('|'); return '<option value="' + esc(k) + '"' + (k === st.per ? ' selected' : '') + '>TA ' + esc(x[0]) + ' • ' + esc(x[1]) + (k === cur ? ' (Aktif)' : '') + '</option>'; }).join('') + '</select></div><div class="field search"><div class="inp-ic">' + ic('search') + '<input class="inp" id="nsQ" placeholder="Cari mata pelajaran atau guru…" value="' + esc(st.q) + '"></div></div></div><div class="chips" id="nsChips" style="padding:0 20px 16px"></div></div>' +
      '<div class="card mt16"><div class="card-h"><div class="grow"><h3>' + ic('list-ordered') + ' Daftar Rekap Nilai Akademik</h3></div><span class="small muted">● KKM: ' + kkmS() + '</span></div><div class="card-b" style="padding:12px 0 0" id="nsTable"></div></div>' +
      '<div class="grid g-main mt24"><div class="card"><div class="card-h"><div class="grow"><h3>Analisis Capaian per Mapel</h3><p>Perbandingan nilai Anda vs rata-rata ' + esc(p.nama_kelas) + '</p></div><span class="bdg amber" id="nsDiff"></span></div><div class="card-b" id="nsBars"></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>Catatan Guru</h3><p>Evaluasi perkembangan dari guru pengampu</p></div></div><div class="card-b" id="nsNotes"></div></div></div>' +
      '<div class="card card-p mt24 row wrap gap16"><span class="av c3">' + ic('circle-help') + '</span><div class="grow"><b>Ada ketidaksesuaian nilai atau pertanyaan capaian?</b><div class="small muted">Siswa berhak mengajukan klarifikasi nilai secara transparan kepada guru mapel atau wali kelas' + (p.wali_kelas ? ' (' + esc(p.wali_kelas) + ')' : '') + '.</div></div><button class="btn btn-outline" id="nsAsk">' + ic('message-circle-question') + 'Ajukan Pertanyaan / Klarifikasi</button></div>';
    $('#nsPer', el).onchange = function () { st.per = this.value; self.render(el); };
    $('#nsQ', el).oninput = debounce(function () { st.q = this.value.toLowerCase(); self.table(el); }, 250);
    $('#nsPrint', el).onclick = $('#nsPdf', el).onclick = function () { window.print(); };
    $('#nsAsk', el).onclick = function () { modal({ title: 'Klarifikasi Nilai', size: 'sm', body: '<p style="margin:0">Silakan sampaikan pertanyaan nilai langsung kepada guru mata pelajaran atau wali kelas' + (p.wali_kelas ? ' <b>' + esc(p.wali_kelas) + '</b>' : '') + ' paling lambat 7 hari kerja setelah nilai terbit. Sertakan nama mapel & komponen nilai (Harian/UTS/UAS) yang ingin diklarifikasi.</p>', foot: '<button class="btn btn-primary" data-x>Mengerti</button>' }); };
    el.onclick = function (e) { var ch = e.target.closest('[data-kel]'); if (ch) { st.kel = ch.dataset.kel; self.table(el); } };
    this.table(el);
  },
  rows: function () {
    var st = this.st, x = st.per.split('|'), b = SB();
    return (b.nilai || []).filter(function (n) { return n.tahun_ajaran === x[0] && n.semester === x[1]; }).map(function (n) { var m = (b.mapel || []).filter(function (y) { return y.nama === n.mata_pelajaran; })[0]; return Object.assign({ kelompok: m ? m.kelompok : 'Wajib' }, n); });
  },
  table: function (el) {
    var st = this.st, b = SB(), c = b.cfg || {}, all = this.rows();
    var kel = {}; all.forEach(function (n) { kel[n.kelompok] = (kel[n.kelompok] || 0) + 1; });
    $('#nsChips', el).innerHTML = '<button class="chip ' + (!st.kel ? 'on' : '') + '" data-kel="">Semua Mapel (' + all.length + ')</button>' + Object.keys(kel).map(function (k) { return '<button class="chip ' + (st.kel === k ? 'on' : '') + '" data-kel="' + esc(k) + '">' + esc(k) + ' (' + kel[k] + ')</button>'; }).join('');
    var rows = all.filter(function (n) { return (!st.kel || n.kelompok === st.kel) && (!st.q || (n.mata_pelajaran + ' ' + n.guru).toLowerCase().indexOf(st.q) > -1); });
    var fin = all.filter(function (n) { return n.nilai_akhir !== ''; }), avg = fin.length ? fin.reduce(function (a, n) { return a + Number(n.nilai_akhir); }, 0) / fin.length : null;
    var tuntas = fin.filter(function (n) { return Number(n.nilai_akhir) >= kkmS(); }).length, r = b.rekap || {};
    var layak = fin.length && tuntas === fin.length && (r.persen == null || r.persen >= Number(c.BATAS_KEHADIRAN || 75));
    $('#nsKpi', el).innerHTML = kpiS('Indeks Prestasi / Rata-rata', avg == null ? '-' : fmtN(avg) + '<small>/ 100</small>', 'Predikat ' + (predikatOf2(avg) || '-'), 'chart-no-axes-combined') +
      kpiS('Tingkat Ketuntasan Mapel', fmtN(pct(tuntas, fin.length || 1), 0) + '<small class="amber b">% Tuntas</small>', tuntas + ' dari ' + fin.length + ' mapel ≥ KKM ' + kkmS(), 'circle-check-big') +
      kpiS('Peringkat Kelas', b.peringkat ? '#' + String(b.peringkat).padStart(2, '0') + '<small>/ ' + b.jumlahSiswaKelas + ' Siswa</small>' : '-', b.peringkat && b.peringkat <= Math.ceil(b.jumlahSiswaKelas * 0.1) ? '<span class="bdg amber">' + ic('star') + 'Top 10% Rombel</span>' : 'Berdasarkan rata-rata nilai akhir', 'medal') +
      kpiS('Status Kelayakan', '<span style="font-size:22px" class="' + (layak ? '' : 'red') + '">' + (layak ? 'Memenuhi Syarat' : fin.length ? 'Perlu Perbaikan' : 'Belum Lengkap') + '</span>', 'Kehadiran ' + (r.persen == null ? '-' : fmtN(r.persen) + '%') + ' • ' + (fin.length - tuntas) + ' mapel di bawah KKM', 'shield-check');
    $('#nsTable', el).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>Mata Pelajaran & Pengampu</th><th class="tc">KKM</th><th class="tc">Harian (' + c.BOBOT_HARIAN + '%)</th><th class="tc">UTS (' + c.BOBOT_UTS + '%)</th><th class="tc">UAS (' + c.BOBOT_UAS + '%)</th><th class="tc">Nilai Akhir</th><th class="tc">Predikat</th><th>Ketuntasan</th><th class="hide-m">Catatan</th></tr></thead><tbody>' + rows.map(function (n, i) {
      var ak = n.nilai_akhir === '' ? '' : Number(n.nilai_akhir), ok = ak !== '' && ak >= kkmS();
      return '<tr class="' + (ak !== '' && !ok ? 'warnrow' : '') + '"><td class="mono muted">' + String(i + 1).padStart(2, '0') + '</td><td><b>' + esc(n.mata_pelajaran) + '</b><div class="xs muted">' + esc(n.guru || '-') + '</div><span class="bdg info xs mt8">' + esc(n.kelompok) + '</span></td><td class="tc">' + kkmS() + '</td><td class="tc num">' + fmtN(n.nilai_harian) + '</td><td class="tc num">' + fmtN(n.nilai_uts) + '</td><td class="tc num">' + fmtN(n.nilai_uas) + '</td><td class="tc"><b style="font-size:18px" class="' + (ak !== '' && ak >= 90 ? 'amber' : ak !== '' && !ok ? 'red' : '') + '">' + fmtN(ak) + '</b></td><td class="tc">' + (ak === '' ? '-' : '<span class="grade ' + predikatOf2(ak) + '">' + predikatOf2(ak) + '</span>') + '</td>' +
        '<td>' + (ak === '' ? '<span class="bdg">Belum lengkap</span>' : ok ? '<span class="bdg info">' + ic('check') + 'Tuntas</span>' : '<span class="bdg bad">' + ic('triangle-alert') + 'Perlu Perbaikan</span>') + '</td><td class="hide-m small muted" style="max-width:220px">' + esc(n.catatan || '-') + '</td></tr>';
    }).join('') + '</tbody></table></div><div class="row between wrap gap12" style="padding:14px 20px;border-top:1px solid var(--line-2)"><span class="small muted">' + ic('calculator') + ' Rumus: Nilai Akhir = (Harian × ' + c.BOBOT_HARIAN + '%) + (UTS × ' + c.BOBOT_UTS + '%) + (UAS × ' + c.BOBOT_UAS + '%)</span><span>Rata-Rata Kumulatif: <b style="font-size:18px">' + fmtN(avg) + '</b></span></div>' : emptyHtml('Nilai belum tersedia', 'Nilai akan muncul setelah guru menginput penilaian.', 'award');
    // analisis vs kelas
    var rm = b.rataMapel || {}, diffs = [];
    $('#nsBars', el).innerHTML = fin.length ? fin.map(function (n) { var me = Number(n.nilai_akhir), kl = rm[n.mata_pelajaran]; if (kl != null) diffs.push(me - kl); return '<div class="dist-row"><div class="row between small"><span class="b">' + esc(n.mata_pelajaran) + '</span><span class="muted">Rerata kelas: ' + fmtN(kl) + ' • <b class="' + (me >= 90 ? 'amber' : me < kkmS() ? 'red' : 'navy') + '">' + fmtN(me) + '</b></span></div><div class="bar" style="position:relative;height:9px"><i class="' + (me >= 90 ? 'amber' : me < kkmS() ? 'red' : '') + '" style="width:' + me + '%"></i>' + (kl != null ? '<span style="position:absolute;top:-3px;left:' + kl + '%;width:2px;height:15px;background:#94A3B8"></span>' : '') + '</div></div>'; }).join('') + '<div class="legend mt16"><span><i style="background:#F5A623"></i>Unggul (≥90)</span><span><i style="background:#022448"></i>Tuntas</span><span><i style="background:#DC2626"></i>Di bawah KKM</span><span><i style="background:#94A3B8;border-radius:1px;width:3px"></i>Rerata kelas</span></div>' : emptyHtml('Belum ada nilai akhir', '', 'chart-column');
    var d = diffs.length ? diffs.reduce(function (a, x) { return a + x; }, 0) / diffs.length : null;
    $('#nsDiff', el).textContent = d == null ? '' : (d >= 0 ? '+' : '') + fmtN(d) + ' vs rerata kelas';
    var notes = all.filter(function (n) { return n.catatan; });
    $('#nsNotes', el).innerHTML = notes.length ? notes.map(function (n) { return '<div class="ann"><div class="meta"><span class="b">' + esc(n.mata_pelajaran) + '</span><span>' + esc(n.guru || '') + '</span></div><p>“' + esc(n.catatan) + '”</p></div>'; }).join('') : emptyHtml('Belum ada catatan guru', 'Catatan perkembangan akan tampil di sini.', 'notebook-pen');
  }
});
function predikatOf2(n) { if (n === '' || n == null) return ''; n = Number(n); return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= kkmS() ? 'C' : 'D'; }

// =====================================================================
// JADWAL (siswa)
// =====================================================================
registerPage('siswa', 'jadwal', {
  title: 'Jadwal',
  st: { hari: '' },
  render: function (el) {
    var st = this.st, self = this, jd = SB().jadwal || [], p = SB().profil || {}, today = hariDari(todayStr());
    var days = HARI_SEKOLAH.filter(function (d) { return jd.some(function (j) { return j.hari === d; }); }); if (!days.length) days = HARI_SEKOLAH.slice(0, 5);
    if (!st.hari) st.hari = days.indexOf(today) > -1 ? today : days[0];
    var mob = window.innerWidth < 768;
    el.innerHTML = pageHead('Portal Siswa <span>/ Jadwal Pelajaran</span>', 'Jadwal Pelajaran', 'Jadwal mingguan kelas ' + (p.nama_kelas || '') + ' semester berjalan.') +
      (mob ? '<div class="tabs" id="sjTabs" style="width:100%">' + days.map(function (d) { return '<button data-h="' + d + '" class="' + (d === st.hari ? 'on' : '') + '">' + d.substring(0, 3) + (d === today ? ' •' : '') + '</button>'; }).join('') + '</div>' : '') +
      '<div class="' + (mob ? 'mt16' : 'grid') + '" style="' + (mob ? '' : 'grid-template-columns:repeat(' + days.length + ',minmax(0,1fr));gap:14px') + '">' + days.filter(function (d) { return !mob || d === st.hari; }).map(function (d) {
        var list = jd.filter(function (j) { return j.hari === d; }).sort(function (a, b) { return a.jam_mulai.localeCompare(b.jam_mulai); });
        return '<div class="card" style="' + (d === today ? 'border-color:var(--navy);box-shadow:var(--sh-2)' : '') + '"><div class="card-h"><div class="grow"><h3 style="font-size:16px">' + d + '</h3><p>' + list.length + ' sesi</p></div>' + (d === today ? '<span class="bdg navy">Hari ini</span>' : '') + '</div><div class="card-b">' +
          (list.length ? list.map(function (j) { var s = statusSesi(j); return '<div class="card" style="padding:12px;margin-bottom:10px;box-shadow:none;border-left:4px solid ' + mapelWarna(j.mata_pelajaran) + (s === 'berlangsung' ? ';background:var(--surface-2)' : '') + '"><div class="row between"><span class="mono xs b">' + esc(j.jam_mulai) + ' – ' + esc(j.jam_selesai) + '</span>' + (s === 'berlangsung' ? '<span class="bdg navy">Berlangsung</span>' : '') + '</div><b class="small" style="display:block;margin-top:4px">' + esc(j.mata_pelajaran) + '</b><div class="xs muted">' + esc(j.guru) + '</div><div class="xs muted">' + ic('map-pin') + ' ' + esc(j.ruang || '-') + '</div></div>'; }).join('') : emptyHtml('Tidak ada pelajaran', '', 'coffee')) + '</div></div>';
      }).join('') + '</div>';
    $$('#sjTabs button', el).forEach(function (b) { b.onclick = function () { st.hari = b.dataset.h; self.render(el); }; });
  }
});

// =====================================================================
// AKUN SAYA (siswa) — profil, kartu pelajar digital, password
// =====================================================================
registerPage('siswa', 'akun', {
  title: 'Akun Saya',
  render: function (el) {
    var p = SB().profil || {};
    var card = '<div class="idcard" style="margin:auto"><div class="top"><img src="' + LOGO + '" alt="" style="width:26px;height:26px;background:#fff;border-radius:6px;padding:2px"><div><small>KARTU TANDA PELAJAR</small><b>' + esc((SB().cfg || {}).NAMA_SEKOLAH || '') + '</b></div><span class="idn">' + esc(p.tahun_masuk || '') + '</span></div><div class="mid"><div class="photo">' + (p.foto_profil_url ? '<img src="' + esc(p.foto_profil_url) + '" alt="">' : esc(initials(p.nama_lengkap))) + '</div><div class="grow" style="min-width:0"><div class="nm ellipsis">' + esc(p.nama_lengkap) + '</div><div class="kv2">NIS: <b>' + esc(p.NIS) + '</b></div><div class="kv2">Kelas: <b style="font-family:inherit">' + esc(p.nama_kelas) + '</b></div><span class="ver">' + ic('badge-check') + ' TERVERIFIKASI SISTEM SIAKAD</span></div></div><div class="bc">' + code128Svg(p.barcode_id, 42) + '<div>' + esc(p.barcode_id) + '</div></div></div>';
    el.innerHTML = pageHead('Portal Siswa <span>/ Akun</span>', 'Akun Saya', 'Profil, kartu pelajar digital untuk scan absensi, dan keamanan akun.') +
      '<div class="grid g2"><div class="card card-p"><div class="row gap16">' + avatar(p.nama_lengkap, p.foto_profil_url, 'xl') + '<div><h3 style="font-size:20px">' + esc(p.nama_lengkap) + '</h3><div class="muted">' + esc(AppState.email) + '</div><div class="row gap4 mt8"><span class="bdg info">' + esc(p.nama_kelas) + '</span><span class="bdg">' + esc(p.jenjang) + '</span></div></div></div>' +
      '<dl class="kv-list mt24"><dt>NIS</dt><dd class="mono">' + esc(p.NIS) + '</dd><dt>NISN</dt><dd class="mono">' + esc(p.NISN || '-') + '</dd><dt>Wali Kelas</dt><dd>' + esc(p.wali_kelas || '-') + '</dd><dt>Orang Tua</dt><dd>' + esc(p.nama_ortu || '-') + '</dd><dt>WA Orang Tua</dt><dd>' + esc(p.no_wa_ortu || '-') + '</dd><dt>Sesi berlaku</dt><dd>' + new Date(AppState.exp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + '</dd></dl>' +
      '<div id="akGeo" class="mt16"></div><div class="row gap12 mt24 wrap"><button class="btn btn-primary" id="akPw">' + ic('key-round') + 'Ganti Password</button><button class="btn btn-danger" id="akOut">' + ic('log-out') + 'Keluar</button></div><div class="note mt16">' + ic('info') + '<div>Data pribadi dikelola oleh sekolah. Hubungi wali kelas bila ada kesalahan data.</div></div></div>' +
      '<div class="card card-p"><h3>Kartu Pelajar Digital</h3><p class="small muted" style="margin:4px 0 16px">Tunjukkan barcode ini ke guru/scanner gerbang untuk absensi. Naikkan kecerahan layar agar mudah terbaca.</p>' + card + '</div></div>';
    geoAkunCard($('#akGeo', el), akunInfo());
    $('#akPw', el).onclick = function () { gantiPassword(false); };
    $('#akOut', el).onclick = async function () { if (await confirmBox('Keluar dari SIAKAD?', { ok: 'Keluar' })) logout(); };
  }
});
