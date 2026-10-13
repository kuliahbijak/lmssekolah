/* MODE DEMO: salinan backend Apps Script (backend/*.gs) yang dijalankan di browser. Dibuat otomatis oleh tools/build.js. */
// ==== Kode.gs ====
/**
 * =====================================================================
 *  SIAKAD SISWA v2.1 — Backend REST API (Google Apps Script)
 *  File 1/7 : Kode.gs — konfigurasi, pintu rahasia, router & peran,
 *             auth, database, cache berversi, antrean, warmup, setup
 *
 *  Arsitektur : GAS sebagai pure REST API (ContentService JSON).
 *               Frontend statis (GitHub Pages) memanggil via fetch().
 *  Performa   : gas-instant-ux-pro + gas-scale-turbo (cache admin berversi,
 *               antrean notifikasi keluar dari jalur respons, warmup 3 lapis).
 *  Keamanan   : gas-rahasia-script-properties — SEMUA rahasia (secret sesi,
 *               hash + salt kata sandi, token Fonnte, QR secret) hanya di
 *               Script Properties. Tidak ada di kode, Sheets, log, atau browser.
 *  File lain  : Akademik.gs, Admin.gs, Tagihan.gs, Migrasi.gs, Notifikasi.gs, CRM.gs
 * =====================================================================
 */

// ---------------------------------------------------------------------
// 1. KONFIGURASI (tanpa satu pun literal rahasia)
// ---------------------------------------------------------------------
var APP = {
  NAME: 'SIAKAD SISWA',
  VERSION: '2.1.0',
  TZ: 'Asia/Jakarta',
  SCHEMA_VERSION: 2,
  TOKEN_TTL_MS: 8 * 3600 * 1000,          // PRD US-01: sesi 8 jam
  REMEMBER_TTL_MS: 7 * 24 * 3600 * 1000,  // "Ingat saya" = 7 hari
  SA_TTL_MS: 8 * 3600 * 1000,             // superadmin tidak pernah 7 hari
  SLOW_MS: 3000,
  HASH_ITER: 300                          // iterasi HMAC untuk sandi pilihan pengguna
};
var ROLES = { superadmin: 'Super Admin', guru: 'Guru', siswa: 'Siswa' };

// ---------------------------------------------------------------------
// 1a. PINTU TUNGGAL SCRIPT PROPERTIES (R2) — dibaca per kunci + memo per eksekusi.
//     (Per kunci, bukan getProperties(), karena hash sandi PW_* ikut tersimpan
//      di sini; memuat semuanya tiap request akan memperlambat.)
// ---------------------------------------------------------------------
var PROPS = PropertiesService.getScriptProperties();
var _PROP_MEMO = {};
function prop_(key, def) {
  var v = _PROP_MEMO.hasOwnProperty(key) ? _PROP_MEMO[key] : (_PROP_MEMO[key] = PROPS.getProperty(key));
  return v === undefined || v === null || v === '' ? (def === undefined ? '' : def) : v;
}
/** Baca langsung tanpa memo — untuk penghitung yang bisa diubah eksekusi lain (SEQ_, ANTRIAN_) */
function propFresh_(key, def) { var v = PROPS.getProperty(key); _PROP_MEMO[key] = v; return v === null || v === '' ? (def === undefined ? '' : def) : v; }
function setProp_(key, val) { PROPS.setProperty(key, String(val)); _PROP_MEMO[key] = String(val); }
function setProps_(obj) { if (!Object.keys(obj).length) return; PROPS.setProperties(obj); Object.keys(obj).forEach(function (k) { _PROP_MEMO[k] = String(obj[k]); }); }
function delProp_(key) { PROPS.deleteProperty(key); _PROP_MEMO[key] = null; }

/** ID environment dibaca dari Script Properties (diisi setupAppEnvironment) — Kelas B */
var CONFIG = {
  get SPREADSHEET_ID() { return prop_('SPREADSHEET_ID'); },
  get ROOT_FOLDER_ID() { return prop_('ROOT_FOLDER_ID'); },
  get MATERI_FOLDER()  { return prop_('MATERI_FOLDER'); },
  get SELFIE_FOLDER()  { return prop_('SELFIE_FOLDER'); },
  get ASET_FOLDER()    { return prop_('ASET_FOLDER'); },
  get EXPORTS_FOLDER() { return prop_('EXPORTS_FOLDER'); },
  get BUKTI_FOLDER()   { return prop_('BUKTI_FOLDER') || prop_('ASET_FOLDER'); }
};

/** Skema database. Semua kolom diformat teks '@' agar 0 di depan & tanggal tidak berubah.
 *  Users.password_hash & salt DIPERTAHANKAN demi kompatibilitas, tetapi SELALU KOSONG:
 *  hash disimpan di Script Properties (PW_<user_id>). */
var SCHEMA = {
  Config:        { key: 'key', cols: ['key', 'value', 'keterangan'] },
  Users:         { key: 'user_id', prefix: 'USR', cols: ['user_id', 'nama', 'email', 'password_hash', 'salt', 'role', 'ref_id', 'kelas_id', 'status_aktif', 'wajib_ganti_sandi', 'last_login', 'dibuat_pada', 'hak_akses', 'lokasi_ids', 'device_id', 'device_info', 'catatan'] },
  Siswa:         { key: 'NIS', cols: ['NIS', 'NISN', 'nama_lengkap', 'jenis_kelamin', 'kelas_id', 'jenjang', 'barcode_id', 'email', 'no_wa', 'nama_ortu', 'no_wa_ortu', 'tempat_lahir', 'tanggal_lahir', 'alamat', 'foto_profil_url', 'tahun_masuk', 'status', 'StatusWA', 'CekWAAt', 'dibuat_pada'] },
  Guru:          { key: 'NUPTK', cols: ['NUPTK', 'nama_lengkap', 'email', 'no_wa', 'mata_pelajaran', 'jabatan', 'foto_profil_url', 'status', 'StatusWA', 'CekWAAt', 'dibuat_pada'] },
  Kelas:         { key: 'kelas_id', prefix: 'KLS', cols: ['kelas_id', 'nama_kelas', 'jenjang', 'tingkat', 'wali_kelas_id', 'tahun_ajaran'] },
  Mapel:         { key: 'mapel_id', prefix: 'MPL', cols: ['mapel_id', 'nama', 'kode', 'kelompok', 'jenjang'] },
  Jadwal:        { key: 'jadwal_id', prefix: 'JDW', cols: ['jadwal_id', 'kelas_id', 'mata_pelajaran', 'guru_id', 'hari', 'jam_mulai', 'jam_selesai', 'ruang'] },
  Absensi:       { key: 'absensi_id', prefix: 'ABS', cols: ['absensi_id', 'NIS', 'kelas_id', 'tanggal', 'jam', 'status', 'metode', 'latitude', 'longitude', 'jarak_m', 'foto_selfie_id', 'keterangan', 'terlambat', 'dicatat_oleh', 'dibuat_pada', 'lokasi_id', 'device_id'] },
  Materi:        { key: 'materi_id', prefix: 'MTR', cols: ['materi_id', 'judul', 'deskripsi', 'mata_pelajaran', 'kelas_id', 'guru_id', 'tipe', 'url_konten', 'drive_file_id', 'ukuran', 'durasi', 'tanggal_upload', 'status'] },
  MateriAkses:   { key: 'akses_id', prefix: 'AKS', cols: ['akses_id', 'materi_id', 'NIS', 'waktu'] },
  Nilai:         { key: 'nilai_id', prefix: 'NIL', cols: ['nilai_id', 'NIS', 'kelas_id', 'mata_pelajaran', 'guru_id', 'semester', 'tahun_ajaran', 'nilai_harian', 'nilai_uts', 'nilai_uas', 'nilai_akhir', 'predikat', 'catatan', 'diperbarui_pada'] },
  Pengumuman:    { key: 'pengumuman_id', prefix: 'PNG', cols: ['pengumuman_id', 'judul', 'isi', 'kategori', 'tanggal', 'oleh', 'status'] },
  Logs:          { key: 'log_id', cols: ['log_id', 'timestamp', 'email', 'role', 'action', 'detail', 'target'] },
  // --- Modul Notifikasi & CRM (gas-notifikasi-wa-crm) ---
  AntrianNotif:  { key: 'AntrianID', prefix: 'ANT', cols: ['AntrianID', 'Kanal', 'Tujuan', 'NamaPenerima', 'Subjek', 'Pesan', 'Event', 'RefID', 'BlastID', 'Status', 'Percobaan', 'Respon', 'DibuatPada', 'DikirimPada'] },
  BlastWA:       { key: 'BlastID', prefix: 'BLW', cols: ['BlastID', 'Judul', 'Pesan', 'Sasaran', 'Total', 'Terkirim', 'Gagal', 'UkuranBatch', 'JedaDetik', 'Status', 'DibuatOleh', 'Tanggal', 'SelesaiPada'] },
  CRM_Kontak:    { key: 'KontakID', prefix: 'KTK', cols: ['KontakID', 'Nama', 'Email', 'NoWA', 'Segmen', 'Sumber', 'RefID', 'Tag', 'StatusWA', 'CekWAAt', 'EmailValid', 'OptOut', 'Catatan', 'JumlahPesan', 'TerakhirDihubungi', 'Info', 'DibuatPada', 'DiperbaruiPada'] },
  CRM_Interaksi: { key: 'InteraksiID', prefix: 'INT', cols: ['InteraksiID', 'KontakID', 'Kanal', 'Arah', 'Ringkasan', 'RefID', 'Oleh', 'Tanggal'] },
  // --- v2.1: Super Admin, geofencing, presensi guru, notifikasi in-app ---
  Lokasi:        { key: 'lokasi_id', prefix: 'LOK', cols: ['lokasi_id', 'nama', 'tipe', 'latitude', 'longitude', 'radius_m', 'alamat', 'berlaku', 'aktif', 'dibuat_oleh', 'diperbarui_pada'] },
  PresensiGuru:  { key: 'presensi_id', prefix: 'PRG', cols: ['presensi_id', 'user_id', 'NUPTK', 'nama', 'tanggal', 'jam_masuk', 'jam_pulang', 'status', 'lokasi_id', 'latitude', 'longitude', 'jarak_m', 'foto_id', 'terlambat', 'device_id', 'keterangan', 'diperbarui_pada'] },
  Notifikasi:    { key: 'notif_id', prefix: 'NTF', cols: ['notif_id', 'user_id', 'judul', 'pesan', 'tipe', 'link', 'dibaca', 'tanggal'] },
  // --- v2.1: Tagihan & Pembayaran (gas-tagihan-pembayaran) — subjek = Siswa (NIS) ---
  Biaya:         { key: 'biaya_id', prefix: 'BYA', cols: ['biaya_id', 'kode', 'nama', 'jenis', 'nominal', 'nominal_khusus', 'jatuh_tempo_tgl', 'jatuh_tempo', 'keterangan', 'aktif', 'dibuat_pada'] },
  Tagihan:       { key: 'TagihanID', prefix: 'TGH', cols: ['TagihanID', 'NIS', 'Jenis', 'BiayaKode', 'Periode', 'KodeTagihan', 'NamaTagihan', 'JumlahAsal', 'Potongan', 'Jumlah', 'AlasanPotongan', 'Status', 'TanggalTerbit', 'JatuhTempo', 'TanggalLunas', 'DiterbitkanOleh', 'Keterangan', 'kelas_id'] },
  Pembayaran:    { key: 'PembayaranID', prefix: 'PBY', cols: ['PembayaranID', 'TagihanID', 'NIS', 'Jumlah', 'Metode', 'NoReferensi', 'BuktiID', 'Status', 'TanggalBayar', 'VerifiedBy', 'VerifiedAt', 'Catatan', 'GrupBayar', 'NoKwitansi'] },
  PotonganTagihan: { key: 'PotonganID', prefix: 'POT', cols: ['PotonganID', 'NIS', 'Tipe', 'Nilai', 'Berlaku', 'Mulai', 'Sampai', 'Alasan', 'Aktif', 'DibuatOleh', 'DibuatPada'] },
  ReminderLog:   { key: 'ReminderID', prefix: 'RML', cols: ['ReminderID', 'Kunci', 'Jenis', 'NIS', 'TagihanID', 'Nama', 'Jumlah', 'JatuhTempo', 'Mode', 'Status', 'Oleh', 'Tanggal'] }
};

/** Kolom angka — dikembalikan sebagai Number saat dibaca */
var NUMERIC_COLS = { nilai_harian: 1, nilai_uts: 1, nilai_uas: 1, nilai_akhir: 1, jarak_m: 1, latitude: 1, longitude: 1, Percobaan: 1, Total: 1, Terkirim: 1, Gagal: 1, UkuranBatch: 1, JumlahPesan: 1, ukuran: 1,
  radius_m: 1, nominal: 1, JumlahAsal: 1, Potongan: 1, Jumlah: 1, Nilai: 1 };

/** Seed pengaturan (key, value, keterangan). Ditambah idempoten oleh setup/upgrade. TIDAK ADA rahasia di sini. */
var CONFIG_SEED = [
  ['NAMA_SEKOLAH', 'SMA Negeri Unggulan Indonesia', 'Nama sekolah'],
  ['ALAMAT_SEKOLAH', 'Jl. Pendidikan No. 1, Jakarta', 'Alamat sekolah'],
  ['LOGO_URL', '', 'URL logo sekolah (kosong = logo bawaan)'],
  ['LAT_SEKOLAH', '-6.2088', 'Latitude titik pusat sekolah (cadangan bila sheet Lokasi kosong)'],
  ['LNG_SEKOLAH', '106.8456', 'Longitude titik pusat sekolah (cadangan bila sheet Lokasi kosong)'],
  ['RADIUS_M', '100', 'Radius absensi bawaan (meter)'],
  ['GPS_WAJIB_SCAN', 'YA', 'YA/TIDAK — validasi GPS guru saat scan barcode'],
  ['GPS_TOLERANSI_M', '15', 'Toleransi akurasi GPS perangkat (meter) yang ditambahkan ke radius'],
  ['JAM_MASUK', '07:15', 'Batas jam masuk siswa (lewat = terlambat)'],
  ['JAM_PULANG', '14:30', 'Jam pulang siswa'],
  ['AUTO_ALPHA_JAM', '', 'Jam otomatis menandai Alpha (kosong = nonaktif), contoh 10:00'],
  ['TAHUN_AJARAN', '2026/2027', 'Tahun ajaran aktif'],
  ['SEMESTER', 'Ganjil', 'Semester aktif (Ganjil/Genap)'],
  ['SEMESTER_MULAI', '2026-07-13', 'Tanggal mulai semester (yyyy-MM-dd)'],
  ['SEMESTER_SELESAI', '2026-12-19', 'Tanggal akhir semester (yyyy-MM-dd)'],
  ['KKM', '70', 'Batas tuntas (PRD: Tuntas >= 70)'],
  ['BOBOT_HARIAN', '40', 'Bobot nilai harian (%)'],
  ['BOBOT_UTS', '30', 'Bobot nilai UTS (%)'],
  ['BOBOT_UAS', '30', 'Bobot nilai UAS (%)'],
  ['BATAS_KEHADIRAN', '75', 'Batas % kehadiran (di bawah = perlu perhatian)'],
  ['EMAIL_DOMAIN_SISWA', 'siswa.sch.id', 'Domain email otomatis akun siswa'],
  ['MATERI_MAKS_MB', '20', 'Batas ukuran upload materi (MB)'],
  // --- notifikasi (gas-notifikasi-wa-crm) ---
  ['NOTIF_WA_AKTIF', 'TIDAK', 'YA/TIDAK — saklar utama WhatsApp (Fonnte)'],
  ['NOTIF_EMAIL_AKTIF', 'TIDAK', 'YA/TIDAK — saklar utama Email'],
  ['NOTIF_MATRIKS', '', 'JSON matriks event x kanal (diatur dari menu)'],
  ['WA_BATCH_DEFAULT', '20', 'Ukuran batch blast (10/20/50)'],
  ['WA_JEDA_DETIK', '5', 'Jeda antarpesan, boleh acak "3-8"'],
  ['WA_DETEKSI_OTOMATIS', 'YA', 'Cek otomatis nomor kontak baru terdaftar WA'],
  ['EMAIL_NAMA_PENGIRIM', 'SIAKAD SISWA', 'Nama pengirim email'],
  ['APP_URL', '', 'URL app untuk {link} & QR kwitansi — terisi otomatis saat admin login'],
  ['CRM_SYNC_MENIT', '30', 'Interval sinkron otomatis CRM (menit)'],
  // --- v2.1: presensi guru & perangkat ---
  ['JAM_MASUK_GURU', '07:00', 'Batas jam masuk guru (lewat = terlambat)'],
  ['JAM_PULANG_GURU', '15:00', 'Jam pulang guru (presensi pulang dibuka mulai jam ini)'],
  ['KUNCI_PERANGKAT', 'TIDAK', 'YA/TIDAK — absensi hanya dari perangkat yang terdaftar per akun'],
  ['PRESENSI_GURU_SELFIE', 'TIDAK', 'YA/TIDAK — presensi guru wajib foto selfie'],
  // --- v2.1: tagihan & pembayaran ---
  ['JATUH_TEMPO_TANGGAL', '10', 'Tanggal jatuh tempo tagihan bulanan (1-28)'],
  ['REKENING_BANK', '', 'Rekening tujuan pembayaran, contoh: BSI 7123456789 a.n. Yayasan'],
  ['NAMA_BENDAHARA', 'Bendahara Sekolah', 'Nama penanda tangan kwitansi'],
  ['KWITANSI_PREFIX', 'KW', 'Awalan nomor kwitansi'],
  ['REMINDER_OTOMATIS', 'TIDAK', 'YA/TIDAK — pengingat jatuh tempo otomatis tiap hari'],
  ['REMINDER_JAM', '08:00', 'Jam pengingat otomatis dikirim'],
  ['REMINDER_H3', 'YA', 'YA/TIDAK — pengingat 3 hari sebelum jatuh tempo'],
  ['REMINDER_H0', 'YA', 'YA/TIDAK — pengingat pada hari jatuh tempo']
];

// ---------------------------------------------------------------------
// 2. ENTRY POINTS
// ---------------------------------------------------------------------
function doGet(e) {
  resetMemo_();
  var p = (e && e.parameter) || {};
  var res;
  try {
    if (p.w) res = ok_({ warm: warmCaches_(p.w === 'admin' ? 'admin' : 'pub') }, 'warm');      // warmup lapis 1 (dari browser)
    else if (p.action === 'config.public') res = apiConfigPublic({}, {});
    else res = ok_({ app: APP.NAME, version: APP.VERSION, time: nowIso_(), ready: !!CONFIG.SPREADSHEET_ID }, 'pong');
  } catch (err) { res = fail_(err.message); }
  res.v = APP.VERSION;
  return json_(res);
}

/** Reset memo per eksekusi (di GAS asli tiap request sudah bersih; penting untuk mode demo & uji) */
function resetMemo_() { _ROWS = {}; _SETTINGS = null; _ABS_IDX = null; _IN_LOCK = false; _PROP_MEMO = {}; _UIDX = null; _NQ = []; _IN_WEB = false; _LOK = null; _COLS_OK = {}; }

function doPost(e) {
  resetMemo_();
  _IN_WEB = true;
  var t0 = Date.now(), body = {}, res;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    res = dispatch_(body);
  } catch (err) {
    _NQ = [];
    res = fail_(err && err.message ? err.message : String(err));
  }
  res.ms = Date.now() - t0;
  res.v = APP.VERSION;
  if (res.ms > APP.SLOW_MS) { try { queueLog_(['', 'SYSTEM', 'SLOW', (body.action || '') + ' ' + res.ms + 'ms', '']); } catch (x) {} }
  _IN_WEB = false;
  return json_(res);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function ok_(data, message) { return { success: true, message: message || 'OK', data: data === undefined ? null : data }; }
function fail_(message, data) { return { success: false, message: message || 'Terjadi kesalahan.', data: data || null }; }

// ---------------------------------------------------------------------
// 3. ROUTER
//    auth : public | any | siswa | guru (guru + superadmin) | sa (superadmin)
//           keu (superadmin, atau guru ber-hak "keuangan") | bayar (siswa atau keu)
//           gurux (guru/superadmin yang terhubung ke data Guru — presensi)
//    write: pakai lock + idempotensi reqId
//    cache: hasil baca admin di-cache berversi ('adm') — gas-scale-turbo
// ---------------------------------------------------------------------
var _ROUTES = null;
function routes_() {
  if (_ROUTES) return _ROUTES;
  var R = {};
  function add(name, fn, auth, write, opt) { R[name] = { name: name, fn: fn, auth: auth, write: !!write, cache: !!(opt && opt.ttl), ttl: opt && opt.ttl }; }
  // --- publik ---
  add('ping', function () { return ok_({ time: nowIso_(), version: APP.VERSION }); }, 'public');
  add('config.public', apiConfigPublic, 'public');
  add('login', apiLogin, 'public');
  add('auth.forgot', apiForgot, 'public');
  add('auth.resetConfirm', apiResetConfirm, 'public', true);
  add('notif.drain', apiNotifDrain, 'public');
  add('kwitansi.verify', svcTgVerifyReceipt, 'public');
  // --- semua user login ---
  add('me.password', apiChangePassword, 'any', true);
  add('batch', apiBatch, 'any');
  add('materi.view', apiMateriView, 'any');
  add('notif.mine', apiNotifMine, 'any');
  add('notif.read', apiNotifRead, 'any', true);
  add('lokasi.saya', apiLokasiSaya, 'any');
  add('perangkat.daftar', apiPerangkatDaftar, 'any', true);
  // --- siswa ---
  add('siswa.bootstrap', apiSiswaBootstrap, 'siswa');
  add('absensi.self', apiAbsenSelf, 'siswa', true);
  add('billing.mine', svcTgMine, 'siswa');
  // --- guru & superadmin (akademik) ---
  add('guru.bootstrap', apiGuruBootstrap, 'guru');
  add('siswa.save', apiSiswaSave, 'guru', true);
  add('siswa.bulk', apiSiswaBulk, 'guru', true);
  add('master.save', apiMasterSave, 'guru', true);
  add('master.delete', apiMasterDelete, 'guru', true);
  add('config.get', apiConfigGet, 'guru');
  add('absensi.scan', apiAbsenScan, 'guru', true);
  add('absensi.manual', apiAbsenManual, 'guru', true);
  add('absensi.finalize', apiAbsenFinalize, 'guru', true);
  add('absensi.list', apiAbsenList, 'guru');
  add('absensi.foto', apiAbsenFoto, 'guru');
  add('materi.save', apiMateriSave, 'guru', true);
  add('materi.delete', apiMateriDelete, 'guru', true);
  add('nilai.list', apiNilaiList, 'guru');
  add('nilai.saveBatch', apiNilaiSaveBatch, 'guru', true);
  add('laporan.export', apiLaporanExport, 'guru', true);
  // --- presensi guru (geofencing) ---
  add('presensi.guru', apiPresensiGuru, 'gurux', true);
  add('presensi.saya', apiPresensiSaya, 'gurux');
  // --- SUPER ADMIN ---
  add('config.save', apiConfigSave, 'sa', true);
  add('guru.save', apiGuruSave, 'sa', true);
  add('guru.delete', apiGuruDelete, 'sa', true);
  add('siswa.delete', apiSiswaDelete, 'sa', true);
  add('siswa.resetPassword', apiSiswaResetPassword, 'sa', true);
  add('logs.list', apiLogsList, 'sa', false, { ttl: 60 });
  add('demo.clear', apiDemoClear, 'sa', true);
  add('sa.monitor', apiSaMonitor, 'sa', false, { ttl: 60 });
  add('sa.akun.list', apiSaAkunList, 'sa', false, { ttl: 300 });
  add('sa.akun.save', apiSaAkunSave, 'sa', true);
  add('sa.akun.create', apiSaAkunCreate, 'sa', true);
  add('sa.akun.reset', apiSaAkunReset, 'sa', true);
  add('sa.akun.logout', apiSaAkunLogout, 'sa', true);
  add('sa.akun.device', apiSaAkunDevice, 'sa', true);
  add('sa.akun.delete', apiSaAkunDelete, 'sa', true);
  add('sa.akun.bulk', apiSaAkunBulk, 'sa', true);
  add('lokasi.list', apiLokasiList, 'sa', false, { ttl: 600 });
  add('lokasi.save', apiLokasiSave, 'sa', true);
  add('lokasi.delete', apiLokasiDelete, 'sa', true);
  add('presensi.list', apiPresensiList, 'sa', false, { ttl: 120 });
  add('rahasia.status', apiRahasiaStatus, 'sa');
  add('rahasia.simpan', apiRahasiaSimpan, 'sa', true);
  add('rahasia.rotasiSesi', apiRahasiaRotasiSesi, 'sa', true);
  // --- migrasi (gas-migrasi-database) — superadmin ---
  add('migrasi.scan', apiMigrasiScan, 'sa');
  add('migrasi.run', apiMigrasiRun, 'sa', true);
  add('migrasi.csv', apiMigrasiCsv, 'sa', true);
  // --- notifikasi & CRM (gas-notifikasi-wa-crm) — superadmin ---
  add('notif.config', svcNotifConfig, 'sa');
  add('notif.configSave', svcNotifConfigSave, 'sa', true);
  add('notif.queue', svcNotifQueue, 'sa');
  add('notif.processNow', svcNotifProcessNow, 'sa');
  add('notif.retry', svcNotifRetry, 'sa', true);
  add('wa.device', svcWaDevice, 'sa');
  add('wa.test', svcWaTest, 'sa');
  add('email.test', svcEmailTest, 'sa');
  add('wa.validate', svcWaValidate, 'sa');
  add('wa.audience', svcWaAudience, 'sa');
  add('wa.blastCreate', svcWaBlastCreate, 'sa', true);
  add('wa.blastList', svcWaBlastList, 'sa', false, { ttl: 20 });
  add('wa.blastProcess', svcWaBlastProcess, 'sa');
  add('wa.blastStop', svcWaBlastStop, 'sa', true);
  add('crm.list', svcCrmList, 'sa');
  add('crm.stats', svcCrmStats, 'sa', false, { ttl: 600 });
  add('crm.detail', svcCrmDetail, 'sa');
  add('crm.sync', svcCrmSync, 'sa', true);
  add('crm.save', svcCrmSave, 'sa', true);
  add('crm.bulk', svcCrmBulk, 'sa', true);
  add('crm.interaksi', svcCrmInteraksi, 'sa', true);
  add('crm.import', svcCrmImport, 'sa', true);
  add('crm.merge', svcCrmMerge, 'sa', true);
  add('crm.export', svcCrmExport, 'sa');
  // --- tagihan & pembayaran (gas-tagihan-pembayaran) ---
  add('billing.submitProof', svcTgSubmit, 'bayar', true);
  add('billing.receipt', svcTgReceipt, 'bayar');
  add('billing.bukti', svcTgBukti, 'bayar');
  add('billing.list', svcTgList, 'keu', false, { ttl: 600 });
  add('billing.pending', svcTgPending, 'keu', false, { ttl: 300 });
  add('billing.eligible', svcTgEligible, 'keu');
  add('billing.genBatch', function (ctx, d) { return svcTgTerbit(ctx, d, true); }, 'keu', true);
  add('billing.genForSelected', function (ctx, d) { return svcTgTerbit(ctx, d, false); }, 'keu', true);
  add('billing.verifyPayment', svcTgVerify, 'keu', true);
  add('billing.cancel', svcTgCancel, 'keu', true);
  add('billing.ubahNominal', svcTgUbahNominal, 'keu', true);
  add('billing.history', svcTgHistory, 'keu');
  add('billing.settingsGet', svcTgSettingsGet, 'keu');
  add('billing.settings', svcTgSettingsSave, 'keu', true);
  add('biaya.list', svcTgBiayaList, 'keu', false, { ttl: 600 });
  add('biaya.save', svcTgBiayaSave, 'keu', true);
  add('biaya.delete', svcTgBiayaDelete, 'keu', true);
  add('discount.list', svcTgDiscountList, 'keu', false, { ttl: 600 });
  add('discount.save', svcTgDiscountSave, 'keu', true);
  add('discount.delete', svcTgDiscountDelete, 'keu', true);
  add('reminder.preview', svcTgReminderPreview, 'keu');
  add('reminder.run', svcTgReminderRun, 'keu', true);
  return (_ROUTES = R);
}

/** Aksi yang diaudit ke Logs (lewat antrean). Payload selalu lewat redaksi_(). */
var AUDIT_ACTIONS = /^(siswa\.(save|delete|resetPassword|bulk)|guru\.(save|delete)|master\.(save|delete)|config\.save|materi\.(save|delete)|nilai\.saveBatch|absensi\.(manual|finalize)|migrasi\.(run|csv)|notif\.configSave|wa\.(blastCreate|blastStop)|crm\.(bulk|merge|import|export)|laporan\.export|demo\.clear|sa\.akun\.\w+|lokasi\.(save|delete)|rahasia\.(simpan|rotasiSesi)|billing\.(genBatch|genForSelected|verifyPayment|cancel|ubahNominal|settings)|biaya\.(save|delete)|discount\.(save|delete)|reminder\.run)$/;

function punyaHak_(ctx, hak) { return !!(ctx.user && ('|' + String(ctx.user.h || '').toLowerCase().replace(/\s*,\s*/g, '|') + '|').indexOf('|' + hak + '|') > -1); }
function isSA_(ctx) { return !!(ctx.session && ctx.session.role === 'superadmin'); }
function isKeu_(ctx) { return isSA_(ctx) || !!(ctx.session && ctx.session.role === 'guru' && punyaHak_(ctx, 'keuangan')); }

function authorized_(route, ctx) {
  if (route.auth === 'public') return true;
  if (!ctx.session) return false;
  var role = ctx.session.role;
  switch (route.auth) {
    case 'any': return true;
    case 'siswa': return role === 'siswa';
    case 'guru': case 'gurux': return role === 'guru' || role === 'superadmin';
    case 'sa': return role === 'superadmin';
    case 'keu': return isKeu_(ctx);
    case 'bayar': return role === 'siswa' || isKeu_(ctx);
  }
  return false;
}

var _IN_WEB = false, _NQ = [];
function dispatch_(body) {
  var r = routes_()[body.action];
  if (!r) return fail_('Aksi tidak dikenal: ' + body.action);
  if (r.auth !== 'public' && !CONFIG.SPREADSHEET_ID) return fail_('Server belum di-setup. Jalankan setupAppEnvironment() di editor Apps Script.');
  var ctx = { session: null, user: null, reqId: String(body.reqId || ''), after: [], action: body.action, dev: String(body.dev || '').substring(0, 64) };
  if (r.auth !== 'public') {
    ctx.session = verifyToken_(body.token);
    if (ctx.session) {                                    // token sah TETAP dicek: akun aktif & peran sama (R8)
      var u = userIdx_()[ctx.session.uid];
      if (!u || !u.a || u.r !== ctx.session.role) ctx.session = null;
      else { ctx.user = u; markSeen_(ctx); }
    }
  }
  if (!authorized_(r, ctx)) return fail_(ctx.session ? 'Akses ditolak untuk peran Anda.' : 'Sesi berakhir, silakan login ulang.', { code: ctx.session ? 'FORBIDDEN' : 'AUTH' });
  var data = body.data || {};
  var res, nq = 0;
  if (!r.write) {
    res = runRoute_(r, ctx, data);
    if (_NQ.length) { if (res && res.success) { var x = withLock_(function () { return simpanNQ_(); }); nq = typeof x === 'number' ? x : 0; } else _NQ = []; }
  } else {
    res = withLock_(function () {
      var c = CacheService.getScriptCache(), k = ctx.reqId && ('idem_' + ctx.reqId);
      var hit = k && c.get(k);
      if (hit) return JSON.parse(hit);                          // permintaan ulang → hasil sama
      var out = r.fn(ctx, data);
      if (out && out.success) {
        nq = simpanNQ_();                                     // notifikasi → antrean cache (bukan tulis sheet)
        bump_('adm', true);                                   // semua cache menu admin basi
        if (k) { var s = JSON.stringify(redaksi_(out)); if (s.length < 90000) c.put(k, s, 21600); }   // R6: tanpa sandi
      } else _NQ = [];
      return out;
    });
  }
  if (res && res.success && AUDIT_ACTIONS.test(body.action) && ctx.session) {
    queueLog_([ctx.session.email, ctx.session.role, body.action, res.auditDetail || auditDetail_(body.action, data), res.auditTarget || '']);
    delete res.auditDetail; delete res.auditTarget;
  }
  ctx.after.forEach(function (fn) { try { fn(); } catch (e) { console.error('after: ' + e.message); } });  // di luar lock
  if (nq > 0 && res) res.nq = nq;                             // frontend memanggil notif.drain
  return res;
}

/** Cache hasil menu admin berversi — kunci memuat versi 'adm', peran, dan hash parameter */
function runRoute_(r, ctx, data) {
  if (!r.cache) return r.fn(ctx, data);
  var d = Object.assign({}, data || {}), fresh = !!d._fresh; delete d._fresh;
  var key = 'ac_' + r.name + '_' + ver_('adm') + '_' + (ctx.session ? ctx.session.role : '-') + '_' + hashKecil_(JSON.stringify(d));
  if (!fresh) { var hit = CacheX.get(key); if (hit && hit.success) { hit.cached = true; return hit; } }
  var res = r.fn(ctx, d);
  if (res && res.success) CacheX.put(key, res, r.ttl || 600);
  return res;
}
function hashKecil_(s) { return b64u_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)).substring(0, 16); }

function auditDetail_(action, d) {
  var o = {};
  ['NIS', 'NUPTK', 'sheet', 'id', 'user_id', 'lokasi_id', 'materi_id', 'kelas_id', 'mata_pelajaran', 'judul', 'aksi', 'blastId', 'kunci', 'biayaKode', 'pembayaranId', 'tagihanId', 'periodeList'].forEach(function (k) { if (d[k] !== undefined) o[k] = d[k]; });
  if (d.data && d.data.NIS) o.NIS = d.data.NIS;
  if (d.rows && d.rows.length) o.rows = d.rows.length;
  if (d.ids && d.ids.length) o.ids = d.ids.length;
  return JSON.stringify(redaksi_(o)).substring(0, 400);
}

/** Tandai pengguna "online" (monitoring Super Admin) — 1 put cache, TTL 15 menit */
function markSeen_(ctx) {
  try { CacheService.getScriptCache().put('seen_' + ctx.session.uid, JSON.stringify({ t: Date.now(), a: ctx.action }), 900); } catch (e) {}
}

var _IN_LOCK = false;
function withLock_(fn) {
  if (_IN_LOCK) return fn();                               // sudah memegang lock (panggilan bersarang)
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('Server sedang sibuk, coba lagi sebentar.', { retryable: true });
  _IN_LOCK = true;
  try { return fn(); }
  finally { _IN_LOCK = false; flushPendingWrites_(); lock.releaseLock(); }
}
/** Bagikan file "siapa saja yang punya link" — bisa ditolak kebijakan domain Workspace, maka tidak fatal */
function shareLink_(f) { try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { console.warn('setSharing ditolak: ' + e.message); } return f; }
function flushPendingWrites_() { try { SpreadsheetApp.flush(); } catch (e) {} }

function apiBatch(ctx, d) {
  var out = {};
  (d.calls || []).slice(0, 10).forEach(function (c) {
    var r = routes_()[c.action];
    if (!r || r.write || c.action === 'batch' || r.auth === 'public' || !authorized_(r, ctx)) { out[c.action] = fail_('Tidak diizinkan dalam batch.'); return; }
    try { out[c.action] = runRoute_(r, ctx, c.data || {}); } catch (e) { out[c.action] = fail_(e.message); }
  });
  return ok_(out);
}

// ---------------------------------------------------------------------
// 4. RAHASIA — acak kuat, hash iteratif, perbandingan aman, masking, redaksi
// ---------------------------------------------------------------------
function acak_(n, huruf) {
  huruf = huruf || 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var s = '';
  while (s.length < n) {
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now() + Math.random())
      .forEach(function (b) { if (s.length < n) s += huruf[(b & 0xff) % huruf.length]; });
  }
  return s;
}
function sandiAcak_(n) { var s = acak_(n || 12); return /\d/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s) ? s : sandiAcak_(n); }
function hashPass_(pass, salt, iter) {                     // HMAC-SHA256 iteratif (lambat disengaja)
  var h = String(pass), n = iter || APP.HASH_ITER;
  for (var i = 0; i < n; i++) h = Utilities.base64Encode(Utilities.computeHmacSha256Signature(h + salt, salt));
  return h;
}
function samaAman_(a, b) {                                 // perbandingan waktu-konstan
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function samarkan_(v) { v = String(v || ''); return !v ? '' : v.length <= 8 ? '••••••' : v.slice(0, 4) + '••••••' + v.slice(-3); }
var POLA_RAHASIA = /(token|password|passwd|sandi|secret|rahasia|credential|kredensial|api[_-]?key|apikey|hash|salt|authorization|otp|pin|kode_reset)/i;
function redaksi_(o, d) {
  d = d || 0;
  if (o === null || typeof o !== 'object' || d > 6) return o;
  if (Array.isArray(o)) return o.map(function (x) { return redaksi_(x, d + 1); });
  var out = {};
  Object.keys(o).forEach(function (k) { out[k] = POLA_RAHASIA.test(k) && o[k] !== '' && o[k] !== null && typeof o[k] !== 'boolean' ? '[DISAMARKAN]' : redaksi_(o[k], d + 1); });
  return out;
}

// ---------------------------------------------------------------------
// 5. AUTENTIKASI — token HMAC stateless + hash sandi di Script Properties
// ---------------------------------------------------------------------
function secret_() {
  var s = prop_('TOKEN_SECRET');                           // nama lama dipertahankan agar sesi v2.0 tetap sah
  if (!s) { s = acak_(64); setProp_('TOKEN_SECRET', s); }
  return s;
}
function b64u_(bytesOrStr) { return Utilities.base64EncodeWebSafe(bytesOrStr).replace(/=+$/, ''); }
function sign_(s) { return b64u_(Utilities.computeHmacSha256Signature(s, secret_())); }
function signToken_(p) {
  var body = b64u_(Utilities.newBlob(JSON.stringify(p)).getBytes());
  return body + '.' + sign_(body);
}
function verifyToken_(t) {
  try {
    var parts = String(t || '').split('.');
    if (parts.length !== 2 || !samaAman_(sign_(parts[0]), parts[1])) return null;
    var b = parts[0]; while (b.length % 4) b += '=';
    var p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b)).getDataAsString());
    if (!p.x || p.x < Date.now()) return null;
    var rev = Number(CacheService.getScriptCache().get('rev_' + p.e) || prop_('REV_' + p.e) || 0);
    if (p.i < rev) return null;                            // dicabut ("keluar dari semua perangkat")
    return { email: p.e, role: p.r, ref: p.f, uid: p.u, exp: p.x };
  } catch (e) { return null; }
}
function revokeAll_(email) {
  var t = String(Date.now());
  setProp_('REV_' + email, t);
  CacheService.getScriptCache().put('rev_' + email, t, 21600);
}

/** Format hash: 'v2$<iterasi>$<salt>$<hash>'. iter=1 hanya untuk sandi awal massal (=NIS, wajib ganti). */
function hashPassword_(pw, salt, iter) { iter = iter || APP.HASH_ITER; salt = salt || newSalt_(); return 'v2$' + iter + '$' + salt + '$' + hashPass_(pw, salt, iter); }
function newSalt_() { return acak_(16); }
function randomPassword_(n) { return acak_(n || 8, 'abcdefghjkmnpqrstuvwxyz23456789'); }
function pwSimpan_(uid, pw, iter) { setProp_('PW_' + uid, hashPassword_(pw, newSalt_(), iter)); bump_('akun'); }
function bytesToHex_(bytes) {
  return bytes.map(function (b) { var v = (b + 256) % 256; return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}
function sha256Bytes_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8); }
/** true | false | 'upgrade' (hash format lama cocok → login akan mengubahnya ke v2) */
function verifyPassword_(pw, user) {
  var stored = prop_('PW_' + user.user_id);
  if (!stored && user.password_hash) stored = 'v1$' + String(user.salt || '') + '$' + String(user.password_hash).trim();   // sisa data lama di sheet
  if (!stored) return false;
  var p = String(stored).split('$');
  if (p[0] === 'v2' && p.length >= 4) return samaAman_(hashPass_(pw, p[2], Number(p[1]) || APP.HASH_ITER), p.slice(3).join('$'));
  if (p[0] === 'v1') {
    var salt = p[1], h = p.slice(2).join('$'), bytes = sha256Bytes_(String(salt || '') + String(pw));
    return samaAman_(h.toLowerCase(), bytesToHex_(bytes)) || samaAman_(h, Utilities.base64Encode(bytes)) ? 'upgrade' : false;
  }
  return false;
}

function apiConfigPublic(ctx, d) {
  var ready = !!CONFIG.SPREADSHEET_ID;
  var cfg = ready ? settings_() : {};
  return ok_({
    ready: ready, version: APP.VERSION,
    namaSekolah: cfg.NAMA_SEKOLAH || APP.NAME, logo: cfg.LOGO_URL || '',
    demo: ready && prop_('DEMO_SEEDED') === '1'
  });
}

function apiLogin(ctx, d) {
  var id = String(d.id || '').trim().toLowerCase(), pw = String(d.password || '');
  if (!id || !pw) return fail_('Email/NIS dan password wajib diisi.');
  var cache = CacheService.getScriptCache(), fk = 'fail_' + id.replace(/[^a-z0-9@._-]/g, '');
  var fails = Number(cache.get(fk) || 0);
  if (fails >= 5) return fail_('Terlalu banyak percobaan gagal. Coba lagi dalam 10 menit.');
  var u = findUser_(id);
  if (u && u.role === 'superadmin') {                        // R9: penguncian khusus superadmin
    var kunci = Number(prop_('SA_KUNCI_' + u.user_id) || 0);
    if (kunci > Date.now()) return fail_('Akun Super Admin dikunci sementara. Coba lagi ' + Math.ceil((kunci - Date.now()) / 60000) + ' menit lagi, atau jalankan resetSuperAdmin() dari editor Apps Script.', { code: 'LOCKED' });
  }
  var cek = u ? verifyPassword_(pw, u) : false;
  if (!cek) {
    cache.put(fk, String(fails + 1), 600);
    if (u && u.role === 'superadmin') {
      var sk = 'safail_' + u.user_id, n = Number(cache.get(sk) || 0) + 1;
      cache.put(sk, String(n), 900);
      if (n >= 5) { setProp_('SA_KUNCI_' + u.user_id, String(Date.now() + 15 * 60000)); cache.remove(sk); }
      queueLog_([lower_(u.email), 'superadmin', 'LOGIN_SA_GAGAL', 'Percobaan ke-' + n, '']);   // tanpa sandi
      Utilities.sleep(400);
    }
    return fail_('Email atau password salah.');
  }
  if (String(u.status_aktif).toUpperCase() !== 'YA') return fail_('Akun belum aktif / dinonaktifkan. Hubungi wali kelas atau Super Admin sekolah.');
  if (d.role === 'siswa' && u.role !== 'siswa') return fail_('Akun ini terdaftar sebagai ' + (u.role === 'superadmin' ? 'Super Admin' : 'Guru / Admin') + '. Pilih tab Guru / Admin.');
  if (d.role === 'guru' && u.role === 'siswa') return fail_('Akun ini terdaftar sebagai Siswa. Pilih tab Siswa.');
  cache.remove(fk);
  if (cek === 'upgrade') { try { withLock_(function () { pwSimpan_(u.user_id, pw); if (u.password_hash) DB.updateBatch('Users', 'user_id', [{ user_id: u.user_id, password_hash: '', salt: '' }]); return ok_(); }); } catch (e) {} }
  if (u.role === 'superadmin') { delProp_('SA_KUNCI_' + u.user_id); }
  var now = Date.now(), ttl = u.role === 'superadmin' ? APP.SA_TTL_MS : (d.remember ? APP.REMEMBER_TTL_MS : APP.TOKEN_TTL_MS);
  var token = signToken_({ e: lower_(u.email), r: u.role, f: String(u.ref_id), u: u.user_id, i: now, x: now + ttl });
  touchLastLogin_(u);
  if (u.role !== 'siswa' && d.appUrl && !setting_('APP_URL', '')) { try { withLock_(function () { saveSettings_({ APP_URL: String(d.appUrl).split('#')[0] }); return ok_(); }); } catch (e) {} }
  queueLog_([lower_(u.email), u.role, 'LOGIN', '', '']);
  var sess = { email: lower_(u.email), role: u.role, ref: String(u.ref_id), uid: u.user_id };
  var fakeCtx = { session: sess, user: userIdx_()[u.user_id], dev: ctx.dev || '' };
  markSeen_(fakeCtx);
  var boot = u.role === 'siswa' ? apiSiswaBootstrap(fakeCtx, {}).data : apiGuruBootstrap(fakeCtx, {}).data;
  return ok_({
    token: token, role: u.role, email: lower_(u.email), nama: u.nama, ref: String(u.ref_id), hak: String(u.hak_akses || ''),
    wajibGantiSandi: String(u.wajib_ganti_sandi).toUpperCase() === 'YA',
    exp: now + ttl,
    boot: boot                                          // login = bootstrap (1 panggilan)
  }, 'Selamat datang, ' + u.nama + '!');
}

function findUser_(id) {
  id = String(id || '').trim().toLowerCase();
  if (!id) return null;
  var users = DB.all('Users');
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (lower_(u.email) === id || (u.ref_id !== '' && lower_(u.ref_id) === id)) return u;
  }
  return null;
}
function touchLastLogin_(u) {
  if (Date.now() - new Date(u.last_login || 0).getTime() > 6 * 3600e3) {
    try { withLock_(function () { DB.updateBatch('Users', 'user_id', [{ user_id: u.user_id, last_login: nowIso_() }]); return ok_(); }); } catch (e) {}
  }
}

function kuatSandi_(role, pw) {
  if (role === 'superadmin') return pw.length >= 12 && /[A-Za-z]/.test(pw) && /\d/.test(pw) ? '' : 'Sandi Super Admin minimal 12 karakter berisi huruf dan angka.';
  return pw.length >= 6 ? '' : 'Password baru minimal 6 karakter.';
}

function apiChangePassword(ctx, d) {
  var u = DB.find('Users', 'user_id', ctx.session.uid);
  if (!u) return fail_('Akun tidak ditemukan.');
  if (!verifyPassword_(String(d.lama || ''), u)) return fail_('Password lama salah.');
  var baru = String(d.baru || ''), lemah = kuatSandi_(u.role, baru);
  if (lemah) return fail_(lemah);
  pwSimpan_(u.user_id, baru);
  DB.updateBatch('Users', 'user_id', [{ user_id: u.user_id, wajib_ganti_sandi: 'TIDAK' }]);
  revokeAll_(lower_(u.email));
  var now = Date.now() + 1, ttl = u.role === 'superadmin' ? APP.SA_TTL_MS : APP.TOKEN_TTL_MS;
  var token = signToken_({ e: lower_(u.email), r: u.role, f: String(u.ref_id), u: u.user_id, i: now, x: now + ttl });
  return ok_({ token: token, exp: now + ttl }, 'Password berhasil diganti. Perangkat lain otomatis keluar.');
}

/** Lupa password: kirim kode 6 digit ke WA/Email terdaftar (butuh modul notifikasi aktif) */
function apiForgot(ctx, d) {
  var u = findUser_(d.id);
  var generic = 'Jika akun ditemukan dan kontak terdaftar, kode reset telah dikirim via WhatsApp/Email. Bila tidak menerima, hubungi wali kelas / admin.';
  if (!u) return ok_({ sent: false }, generic);
  var c = CacheService.getScriptCache(), rk = 'rst_' + lower_(u.email);
  if (c.get(rk + '_t')) return ok_({ sent: false }, 'Kode sudah dikirim. Tunggu 2 menit sebelum meminta lagi.');
  var kode = acak_(6, '0123456789');
  c.put(rk, kode, 900); c.put(rk + '_t', '1', 120);
  var n = kirimNotif_('RESET_SANDI', kontakUser_(u), { kode: kode }, u.user_id);
  return ok_({ sent: n > 0 }, n > 0 ? generic : 'Notifikasi belum aktif di sekolah ini. Hubungi wali kelas / admin untuk reset password.');
}
function apiResetConfirm(ctx, d) {
  var u = findUser_(d.id);
  if (!u) return fail_('Kode tidak valid atau kedaluwarsa.');
  var c = CacheService.getScriptCache(), rk = 'rst_' + lower_(u.email), simpan = c.get(rk);
  if (!simpan || !samaAman_(simpan, String(d.kode || '').trim())) return fail_('Kode tidak valid atau kedaluwarsa.');
  var baru = String(d.baru || ''), lemah = kuatSandi_(u.role, baru);
  if (lemah) return fail_(lemah);
  pwSimpan_(u.user_id, baru);
  DB.updateBatch('Users', 'user_id', [{ user_id: u.user_id, wajib_ganti_sandi: 'TIDAK' }]);
  c.remove(rk); revokeAll_(lower_(u.email));
  return ok_(null, 'Password berhasil direset. Silakan login.');
}
/** Kontak notifikasi untuk seorang user: siswa → WA orang tua + email siswa; guru → WA + email guru */
function kontakUser_(u) {
  if (u.role === 'siswa') {
    var s = DB.find('Siswa', 'NIS', u.ref_id) || {};
    return { nama: s.nama_lengkap || u.nama, hp: s.no_wa_ortu || s.no_wa, email: s.email || u.email };
  }
  var g = (u.ref_id && DB.find('Guru', 'NUPTK', u.ref_id)) || {};
  return { nama: g.nama_lengkap || u.nama, hp: g.no_wa, email: g.email || u.email };
}

/** Indeks akun (cache berversi 'akun'): dipakai cek sesi tiap request & monitoring */
var _UIDX = null;
function userIdx_() {
  if (_UIDX) return _UIDX;
  var key = 'uidx_' + ver_('akun'), c = CacheX.get(key);
  if (c) return (_UIDX = c);
  var o = {};
  DB.all('Users').forEach(function (u) {
    o[u.user_id] = { r: u.role, a: String(u.status_aktif).toUpperCase() === 'YA' ? 1 : 0, n: u.nama, e: lower_(u.email), f: String(u.ref_id || ''), k: u.kelas_id || '',
      h: u.hak_akses || '', l: u.lokasi_ids || '', d: u.device_id || '' };
  });
  CacheX.put(key, o, 21600);
  return (_UIDX = o);
}

/** Pindahkan semua hash yang masih tertulis di sheet Users ke Script Properties (idempoten) */
function amankanSandi_() {
  var sisa = DB.all('Users').filter(function (u) { return String(u.password_hash || '') !== ''; });
  if (!sisa.length) return 0;
  DB.updateBatch('Users', 'user_id', sisa.map(function (u) { return { user_id: u.user_id, password_hash: u.password_hash, salt: u.salt }; }));   // hook memindahkan & mengosongkan
  return sisa.length;
}
/** Hapus PW_ milik akun yang sudah tidak ada */
function bersihkanPwYatim_() {
  var ada = {}; DB.all('Users').forEach(function (u) { ada['PW_' + u.user_id] = 1; });
  var n = 0;
  PROPS.getKeys().forEach(function (k) { if (k.indexOf('PW_') === 0 && !ada[k]) { delProp_(k); n++; } });
  return n;
}

// ---------------------------------------------------------------------
// 6. DATABASE — memo per eksekusi, batch setValues, semua kolom teks
// ---------------------------------------------------------------------
var _SS = null, _ROWS = {}, _SETTINGS = null, _COLS_OK = {};
function getSS_() { return _SS || (_SS = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)); }
function getSheet_(name) {
  var sh = getSS_().getSheetByName(name);
  if (!sh) {                                               // upgrade aditif: sheet baru dibuat otomatis
    if (!SCHEMA[name]) throw new Error('Sheet tidak dikenal: ' + name);
    sh = createSheet_(getSS_(), name);
  }
  return sh;
}
function createSheet_(ss, name) {
  var cols = SCHEMA[name].cols, sh = ss.insertSheet(name);
  sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#1E3A5F').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}
/** Kolom skema yang belum ada ditambahkan di kanan (aditif) — dipanggil saat menulis, tanpa baca ekstra */
function tambahKolom_(sh, name, h) {
  if (!SCHEMA[name] || _COLS_OK[name]) return h;
  var miss = SCHEMA[name].cols.filter(function (c) { return h.indexOf(c) === -1; });
  _COLS_OK[name] = 1;
  if (!miss.length) return h;
  var start = h.length + 1;
  if (sh.getMaxColumns() < h.length + miss.length) sh.insertColumnsAfter(sh.getMaxColumns(), h.length + miss.length - sh.getMaxColumns());
  sh.getRange(1, start, sh.getMaxRows(), miss.length).setNumberFormat('@');
  sh.getRange(1, start, 1, miss.length).setValues([miss]).setFontWeight('bold').setBackground('#1E3A5F').setFontColor('#ffffff');
  return h.concat(miss);
}

function normCell_(col, v) {
  if (v instanceof Date) {
    if (/^(Periode|Mulai|Sampai)$/.test(col)) return Utilities.formatDate(v, APP.TZ, 'yyyy-MM');
    if (/tanggal$|^tanggal|^Tanggal|^JatuhTempo$|^jatuh_tempo$/.test(col)) return Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd');
    if (/^jam/.test(col)) return Utilities.formatDate(v, APP.TZ, 'HH:mm');
    return v.toISOString();
  }
  if (NUMERIC_COLS[col]) return v === '' || v === null ? '' : Number(v);
  if (/^(no_wa|no_wa_ortu|NoWA)$/.test(col)) return hp08_(v);
  if (v === null || v === undefined) return '';
  return typeof v === 'number' ? String(v) : v;
}

/** Hook keamanan sheet Users: hash sandi TIDAK PERNAH ditulis ke sheet (R1/R6) */
function hookUsers_(rows) {
  var simpan = {}, berubah = false;
  rows.forEach(function (o) {
    if (Object.keys(o).some(function (k) { return k !== 'user_id' && k !== 'last_login'; })) berubah = true;
    var h = o.password_hash;
    if (h !== undefined && h !== null && String(h) !== '') {
      var s = String(h);
      if (s.indexOf('v2$') !== 0) s = 'v1$' + String(o.salt || '') + '$' + s;
      if (o.user_id) simpan['PW_' + o.user_id] = s;
      o.password_hash = ''; o.salt = '';
    }
  });
  setProps_(simpan);
  return berubah;
}

var DB = {
  all: function (name) {
    if (_ROWS[name]) return _ROWS[name];
    var sh = getSheet_(name), v = sh.getDataRange().getValues();
    var h = v[0].map(String), out = [];
    for (var r = 1; r < v.length; r++) {
      if (v[r].join('') === '') continue;
      var o = {};
      for (var i = 0; i < h.length; i++) if (h[i]) o[h[i]] = normCell_(h[i], v[r][i]);
      out.push(o);
    }
    return (_ROWS[name] = out);
  },
  find: function (name, col, val) {
    var s = String(val), rows = DB.all(name);
    for (var i = 0; i < rows.length; i++) if (String(rows[i][col]) === s) return rows[i];
    return null;
  },
  filter: function (name, fn) { return DB.all(name).filter(fn); },
  headers_: function (sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); },
  /** Tambah banyak baris: 1× setValues */
  appendBatch: function (name, objs) {
    if (!objs || !objs.length) return 0;
    var akun = name === 'Users' && hookUsers_(objs);
    var sh = getSheet_(name), h = tambahKolom_(sh, name, DB.headers_(sh));
    var rows = objs.map(function (o) { return h.map(function (k) { var v = o[k]; return v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); }); });
    var start = sh.getLastRow() + 1, need = start + rows.length - 1, max = sh.getMaxRows();
    if (need > max) {
      sh.insertRowsAfter(max, need - max + 100);
      sh.getRange(max + 1, 1, need - max + 100, h.length).setNumberFormat('@');
    }
    sh.getRange(start, 1, rows.length, h.length).setValues(rows);
    delete _ROWS[name];
    if (akun) bump_('akun');
    return rows.length;
  },
  /** Ubah banyak baris (patches = [{keyCol: id, kolom: nilai}]) → 1 blok kontigu */
  updateBatch: function (name, keyCol, patches) {
    if (!patches || !patches.length) return 0;
    var akun = name === 'Users' && hookUsers_(patches);
    var sh = getSheet_(name), v = sh.getDataRange().getValues(), h = v[0].map(String);
    var h2 = tambahKolom_(sh, name, h);
    if (h2.length > h.length) { v = v.map(function (r, i) { return i === 0 ? h2.slice() : r.concat(h2.slice(h.length).map(function () { return ''; })); }); h = h2; }
    var ki = h.indexOf(keyCol);
    var map = {}; patches.forEach(function (p) { map[String(p[keyCol])] = Object.assign(map[String(p[keyCol])] || {}, p); });
    var min = Infinity, max = -1, n = 0;
    for (var i = 1; i < v.length; i++) {
      var p = map[String(v[i][ki])]; if (!p) continue;
      Object.keys(p).forEach(function (k) { var c = h.indexOf(k); if (c > -1 && k !== keyCol) v[i][c] = p[k] === null || p[k] === undefined ? '' : (typeof p[k] === 'object' ? JSON.stringify(p[k]) : String(p[k])); });
      min = Math.min(min, i); max = Math.max(max, i); n++;
    }
    if (max > -1) sh.getRange(min + 1, 1, max - min + 1, h.length).setValues(v.slice(min, max + 1));
    delete _ROWS[name];
    if (akun && n) bump_('akun');
    return n;
  },
  /** Hapus baris dengan kunci tertentu: filter di memori, tulis ulang blok, bersihkan sisa */
  deleteWhere: function (name, keyCol, keys) {
    var set = {}; (keys || []).forEach(function (k) { set[String(k)] = 1; });
    var sh = getSheet_(name), v = sh.getDataRange().getValues(), h = v[0], ki = h.map(String).indexOf(keyCol);
    var keep = [v[0]], removed = 0, ids = [];
    for (var i = 1; i < v.length; i++) { if (set[String(v[i][ki])]) { removed++; ids.push(String(v[i][ki])); } else keep.push(v[i]); }
    if (!removed) return 0;
    sh.getRange(1, 1, keep.length, h.length).setValues(keep);
    sh.getRange(keep.length + 1, 1, removed, h.length).clearContent();
    delete _ROWS[name];
    if (name === 'Users') { ids.forEach(function (id) { delProp_('PW_' + id); delProp_('SA_KUNCI_' + id); }); bump_('akun'); }
    return removed;
  },
  /** Upsert berdasarkan fungsi kunci; mengembalikan {inserted, updated} */
  upsert: function (name, keyFn, objs) {
    var idx = {}, keyCol = SCHEMA[name].key;
    DB.all(name).forEach(function (r) { idx[keyFn(r)] = r; });
    var ins = [], upd = [];
    objs.forEach(function (o) {
      var ex = idx[keyFn(o)];
      if (ex) upd.push(Object.assign({}, o, (function () { var t = {}; t[keyCol] = ex[keyCol]; return t; })()));
      else ins.push(o);
    });
    if (ins.length && SCHEMA[name].prefix) {
      var need = ins.filter(function (o) { return !o[keyCol]; });
      var ids = reserveIds_(name, need.length);
      need.forEach(function (o, i) { o[keyCol] = ids[i]; });
    }
    DB.appendBatch(name, ins);
    DB.updateBatch(name, keyCol, upd);
    return { inserted: ins.length, updated: upd.length, rows: ins.concat(upd) };
  }
};
function invalidateRows_(name) { delete _ROWS[name]; }

/** ID berurutan tanpa pemotongan (high-water mark di Properties, dibaca segar): ABS000001 */
function reserveIds_(name, n) {
  if (!n) return [];
  var prefix = SCHEMA[name].prefix, k = 'SEQ_' + name;
  var cur = Number(propFresh_(k) || 0);
  if (!cur) {                                            // inisialisasi dari data yang ada
    DB.all(name).forEach(function (r) { var m = String(r[SCHEMA[name].key] || '').match(/(\d+)$/); if (m) cur = Math.max(cur, Number(m[1])); });
  }
  var out = [];
  for (var i = 1; i <= n; i++) { var num = String(cur + i); out.push(prefix + (num.length < 6 ? ('000000' + num).slice(-6) : num)); }
  setProp_(k, String(cur + n));
  return out;
}

// ---------------------------------------------------------------------
// 7. PENGATURAN (sheet Config — Kelas C, tidak pernah berisi rahasia)
// ---------------------------------------------------------------------
function settings_() {
  if (_SETTINGS) return _SETTINGS;
  var c = CacheX.get('cfg_' + ver_('master'));
  if (c) return (_SETTINGS = c);
  var o = {};
  CONFIG_SEED.forEach(function (s) { o[s[0]] = s[1]; });
  DB.all('Config').forEach(function (r) { if (r.key) o[r.key] = String(r.value); });
  CacheX.put('cfg_' + ver_('master'), o, 3600);
  return (_SETTINGS = o);
}
function setting_(k, d) { var v = settings_()[k]; return v === undefined || v === '' ? d : v; }
function saveSettings_(pairs) {
  var rows = DB.all('Config'), have = {}, upd = [], ins = [];
  rows.forEach(function (r) { have[r.key] = 1; });
  Object.keys(pairs).forEach(function (k) {
    var v = pairs[k] === null || pairs[k] === undefined ? '' : String(pairs[k]);
    if (have[k]) upd.push({ key: k, value: v }); else ins.push({ key: k, value: v, keterangan: '' });
  });
  DB.updateBatch('Config', 'key', upd);
  DB.appendBatch('Config', ins);
  _SETTINGS = null;
  bump_('master');
}

// ---------------------------------------------------------------------
// 8. CACHE BERLAPIS — chunk > 50 KB, invalidasi berbasis versi
// ---------------------------------------------------------------------
var CacheX = {
  SZ: 50000,
  c: function () { return CacheService.getScriptCache(); },
  get: function (key) {
    try {
      var c = this.c(), head = c.get(key);
      if (head == null) return null;
      if (head.indexOf('__chunks:') !== 0) return JSON.parse(head);
      var n = +head.slice(9), keys = [];
      for (var i = 0; i < n; i++) keys.push(key + '#' + i);
      var parts = c.getAll(keys), s = '';
      for (var j = 0; j < n; j++) { if (parts[keys[j]] == null) return null; s += parts[keys[j]]; }
      return JSON.parse(s);
    } catch (e) { return null; }
  },
  put: function (key, val, ttl) {
    try {
      var s = JSON.stringify(val), c = this.c();
      if (s.length <= this.SZ) { c.put(key, s, ttl); return true; }
      var n = Math.ceil(s.length / this.SZ); if (n > 20) return false;
      var m = {}; for (var i = 0; i < n; i++) m[key + '#' + i] = s.substr(i * this.SZ, this.SZ);
      c.putAll(m, ttl); c.put(key, '__chunks:' + n, ttl);   // kepala ditulis TERAKHIR
      return true;
    } catch (e) { return false; }
  },
  remove: function (key) { try { this.c().remove(key); } catch (e) {} }
};
function ver_(scope) {
  var c = CacheService.getScriptCache(), k = 'ver_' + scope, v = c.get(k);
  if (!v) { v = prop_(k) || String(Date.now()); c.put(k, v, 21600); }
  return v;
}
/** Naikkan versi lingkup. cacheOnly = tidak ditulis ke Properties (lingkup sering berubah: 'adm') */
function bump_(scope, cacheOnly) {
  var v = String(Date.now()) + Math.floor(Math.random() * 1000);
  CacheService.getScriptCache().put('ver_' + scope, v, 21600);
  if (!cacheOnly) setProp_('ver_' + scope, v);
  if (scope === 'master') _SETTINGS = null;
  if (scope === 'akun') _UIDX = null;
}
function cached_(key, ttl, build) { var v = CacheX.get(key); if (v !== null) return v; var d = build(); CacheX.put(key, d, ttl); return d; }

// ---------------------------------------------------------------------
// 9. ANTREAN NOTIFIKASI — keluar dari jalur respons (gas-scale-turbo 3.5)
//    kirimNotifBatch_ saat request web → _NQ → cache 'nq' (di dalam lock tulis).
//    Respons membawa res.nq → frontend memanggil 'notif.drain'. Cadangan: pekerjaMenit.
// ---------------------------------------------------------------------
function simpanNQ_() {
  if (!_NQ.length) return 0;
  var rows = _NQ; _NQ = [];
  var q = CacheX.get('nq') || [];
  q = q.concat(rows);
  if (q.length > 2500 || !CacheX.put('nq', q, 21600)) { tulisAntrian_(rows); return 0; }   // cache penuh → tulis langsung (perilaku lama)
  return rows.length;
}
function tulisAntrian_(rows) {
  if (!rows.length) return 0;
  var ids = reserveIds_('AntrianNotif', rows.length);
  rows.forEach(function (r, i) { r.AntrianID = ids[i]; });
  DB.appendBatch('AntrianNotif', rows);
  if (!propFresh_('ANTRIAN_MULAI')) setProp_('ANTRIAN_MULAI', '2');
  setProp_('ANTRIAN_ADA', '1');
  return rows.length;
}
/** Pindahkan antrean cache → sheet AntrianNotif (dipanggil di bawah lock) */
function pindahkanNQ_() {
  var q = CacheX.get('nq');
  if (!q || !q.length) return 0;
  tulisAntrian_(q);
  CacheX.remove('nq');
  return q.length;
}
function apiNotifDrain(ctx, d) {
  var c = CacheService.getScriptCache();
  var adaCache = !!c.get('nq');
  if (!adaCache && propFresh_('ANTRIAN_ADA') !== '1') return ok_({ moved: 0, left: 0 }, 'Antrean kosong');   // cepat tanpa lock
  var moved = 0;
  if (adaCache) { var r = withLock_(function () { return pindahkanNQ_(); }); moved = typeof r === 'number' ? r : 0; }
  var h = {};
  if (!c.get('drain_t')) { c.put('drain_t', '1', 3); h = prosesAntrianNotif({ tanpaTugasLain: true }); }
  return ok_({ moved: moved, left: c.get('nq') ? 1 : 0, kirim: h });
}

// ---------------------------------------------------------------------
// 10. LOG — antrean cache, di-flush trigger (jalur baca tidak menulis)
// ---------------------------------------------------------------------
function queueLog_(row) {
  var full = [Utilities.getUuid(), nowIso_()].concat(row);
  var lock = _IN_LOCK ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(300)) { try { DB.appendBatch('Logs', [rowToLog_(full)]); } catch (e) {} return; }
  try {
    var c = CacheService.getScriptCache(), q = JSON.parse(c.get('logq') || '[]');
    q.push(full);
    if (q.length >= 100) { DB.appendBatch('Logs', q.map(rowToLog_)); c.remove('logq'); }
    else c.put('logq', JSON.stringify(q), 21600);
  } finally { if (lock) lock.releaseLock(); }
}
function rowToLog_(r) { return { log_id: r[0], timestamp: r[1], email: r[2], role: r[3], action: r[4], detail: r[5], target: r[6] }; }
function flushLogs_() {
  var c = CacheService.getScriptCache(), q = JSON.parse(c.get('logq') || '[]');
  if (q.length) { DB.appendBatch('Logs', q.map(rowToLog_)); c.remove('logq'); }
  var v = JSON.parse(c.get('viewq') || '[]');
  if (v.length) { flushMateriViews_(v); c.remove('viewq'); }
}
function logTerakhir_(n) {
  var sh = getSheet_('Logs'), last = sh.getLastRow(), cnt = Math.min(n, Math.max(0, last - 1));
  var rows = [];
  if (cnt > 0) {
    var h = SCHEMA.Logs.cols, v = sh.getRange(last - cnt + 1, 1, cnt, h.length).getValues();
    rows = v.map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i] instanceof Date ? r[i].toISOString() : r[i]; }); return o; });
  }
  var q = JSON.parse(CacheService.getScriptCache().get('logq') || '[]').map(rowToLog_);
  return rows.concat(q).reverse().slice(0, n);
}
function apiLogsList(ctx, d) { return ok_(logTerakhir_(300)); }

// ---------------------------------------------------------------------
// 11. UTILITAS
// ---------------------------------------------------------------------
function nowIso_() { return Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function today_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd'); }
function timeNow_() { return Utilities.formatDate(new Date(), APP.TZ, 'HH:mm:ss'); }
function lower_(s) { return String(s || '').trim().toLowerCase(); }
function num_(v, d) { var n = Number(v); return v === '' || v === null || v === undefined || isNaN(n) ? (d === undefined ? 0 : d) : n; }
/** Nominal uang: menerima 400000, "400.000", "Rp 400.000" */
function uang_(v) { if (typeof v === 'number') return v; var s = String(v === null || v === undefined ? '' : v).replace(/^\s*Rp\.?\s*/i, '').replace(/[.\s]/g, '').replace(',', '.'); var n = Number(s); return isNaN(n) ? 0 : n; }
function round1_(n) { return Math.round(n * 10) / 10; }
function hp08_(v) {
  var s = String(v == null ? '' : v).trim().replace(/\.0+$/, '').replace(/[^0-9+]/g, '').replace(/^\+/, '');
  if (!s) return '';
  if (s.indexOf('62') === 0) s = '0' + s.substring(2); else if (s.indexOf('8') === 0) s = '0' + s;
  return s;
}
function hp62_(v) { var s = hp08_(v); return s ? (s[0] === '0' ? '62' + s.substring(1) : s) : ''; }
function hpValid_(v) { return /^08\d{8,12}$/.test(hp08_(v)); }
function emailValid_(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim()); }
function isiTemplate_(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] == null ? '' : String(v[k]); }); }
function haversine_(lat1, lon1, lat2, lon2) {
  var R = 6371000, toR = Math.PI / 180;
  var dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function slug_(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, ''); }
function driveFolder_(id) { return DriveApp.getFolderById(id); }
function saveBase64File_(folderId, name, mime, b64) {
  var bytes = Utilities.base64Decode(String(b64).replace(/^data:[^,]+,/, ''));
  var blob = Utilities.newBlob(bytes, mime, name);
  var f = driveFolder_(folderId).createFile(blob);
  return f;
}

// ---------------------------------------------------------------------
// 12. TRIGGER — satu pekerja per menit: log, antrean notif, auto-alpha,
//     pengingat tagihan, CRM, dan warmup lapis 2 (keepWarm)
// ---------------------------------------------------------------------
function pekerjaMenit() {
  resetMemo_();
  try { withLock_(function () { flushLogs_(); pindahkanNQ_(); autoAlphaCek_(); return ok_(); }); } catch (e) { console.error('pekerja: ' + e.message); }
  try { withLock_(function () { tgReminderOtomatis_(); return ok_(); }); } catch (e1) { console.error('reminder: ' + e1.message); }
  try { prosesAntrianNotif({}); } catch (e2) { console.error('notif: ' + e2.message); }
  try { if (prop_('KEEP_WARM') !== 'off') warmCaches_('tick'); } catch (e3) { console.error('warm: ' + e3.message); }
}
function pasangTrigger() {
  var have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('pekerjaMenit') === -1) ScriptApp.newTrigger('pekerjaMenit').timeBased().everyMinutes(1).create();
  Logger.log('✅ Trigger pekerjaMenit aktif (1 menit).');
  return true;
}

/** Warmup: isi cache yang sering dipakai. scope: pub | admin | tick | setup. Tidak mengembalikan data. */
function warmCaches_(scope) {
  if (!CONFIG.SPREADSHEET_ID) return 'belum setup';
  var c = CacheService.getScriptCache(), flag = 'warm_' + scope;
  if (scope !== 'setup' && c.get(flag)) return 'skip';
  c.put(flag, '1', scope === 'tick' ? 50 : 60);
  var t0 = Date.now(), langkah = [];
  function step(n, fn) { try { fn(); langkah.push(n); } catch (e) { langkah.push(n + '✗'); } }
  step('pengaturan', settings_);
  step('akun', userIdx_);
  step('lokasi', lokasiAktif_);
  if (scope !== 'pub') {
    step('absensi', absenIndex_);
    step('bootGuru', function () { cached_('bootG_' + versKey_(), 600, buildGuruBootstrap_); });
  }
  c.put('warm_last', JSON.stringify({ at: nowIso_(), scope: scope, ms: Date.now() - t0, langkah: langkah }), 21600);
  return langkah.join(',');
}
function matikanKeepWarm() { setProp_('KEEP_WARM', 'off'); Logger.log('⏸️ Warmup otomatis dimatikan. Trigger pekerjaMenit tetap berjalan untuk notifikasi & log.'); }
function nyalakanKeepWarm() { delProp_('KEEP_WARM'); pasangTrigger(); Logger.log('▶️ Warmup otomatis dinyalakan.'); }

// ---------------------------------------------------------------------
// 13. SETUP — jalankan SEKALI dari editor (idempoten, tidak menimpa rahasia)
// ---------------------------------------------------------------------
var _DEMO_PW = null;
/** Sandi akun contoh: mode demo browser memakai window.__DEMO_PW; server asli = acak, tampil SEKALI di log */
function demoPw_(kind) {
  if (typeof __DEMO_PW !== 'undefined' && __DEMO_PW && __DEMO_PW[kind]) return __DEMO_PW[kind];
  _DEMO_PW = _DEMO_PW || {};
  return _DEMO_PW[kind] || (_DEMO_PW[kind] = sandiAcak_(12));
}
function setupRahasia_() {
  secret_();                                               // TOKEN_SECRET (secret sesi) bila belum ada
  if (!prop_('QR_SECRET')) setProp_('QR_SECRET', acak_(48));   // tanda tangan QR kwitansi
}

function setupAppEnvironment() {
  if (prop_('SPREADSHEET_ID')) {
    Logger.log('⚠️ Setup sudah pernah dijalankan. Spreadsheet: ' + prop_('SPREADSHEET_ID'));
    Logger.log('   Untuk update ke v2.1 jalankan setupV21(). Untuk memulai ulang hapus Script Properties dulu.');
    return;
  }
  Logger.log('🚀 Memulai setup ' + APP.NAME + ' v' + APP.VERSION + '...');
  var root = DriveApp.createFolder('📁 ' + APP.NAME);
  var fMateri = root.createFolder('SIAKAD_MATERI');
  var fSelfie = root.createFolder('SIAKAD_FOTO_SELFIE');
  var fAset = root.createFolder('SIAKAD_ASET');
  var fExport = root.createFolder('SIAKAD_EXPORTS');
  var fBukti = root.createFolder('SIAKAD_BUKTI_BAYAR');
  var ss = SpreadsheetApp.create('🗃️ Database — ' + APP.NAME);
  DriveApp.getFileById(ss.getId()).moveTo(root);
  setProps_({
    SPREADSHEET_ID: ss.getId(), ROOT_FOLDER_ID: root.getId(), MATERI_FOLDER: fMateri.getId(),
    SELFIE_FOLDER: fSelfie.getId(), ASET_FOLDER: fAset.getId(), EXPORTS_FOLDER: fExport.getId(), BUKTI_FOLDER: fBukti.getId(),
    SCHEMA_VERSION: String(APP.SCHEMA_VERSION)
  });
  _SS = ss;
  var first = ss.getSheets()[0];
  Object.keys(SCHEMA).forEach(function (name) { createSheet_(ss, name); });
  ss.deleteSheet(first);
  // Config + catatan environment (Kelas B saja — bukan rahasia)
  DB.appendBatch('Config', CONFIG_SEED.map(function (r) { return { key: r[0], value: r[1], keterangan: r[2] }; }).concat([
    { key: 'ENV_ROOT_FOLDER_ID', value: root.getId(), keterangan: 'ID folder root Drive (catatan, baca-saja)' },
    { key: 'ENV_SPREADSHEET_ID', value: ss.getId(), keterangan: 'ID spreadsheet ini (catatan, baca-saja)' },
    { key: 'ENV_CREATED_AT', value: nowIso_(), keterangan: 'Tanggal setup' }
  ]));
  setupRahasia_();
  seedDemo_();
  pasangTrigger();
  Logger.log('✅ Setup selesai!');
  Logger.log('   Spreadsheet : ' + ss.getUrl());
  Logger.log('   Drive Folder: ' + root.getUrl());
  Logger.log('🔐 AKUN CONTOH (catat sekarang — hanya tampil SEKALI, segera ganti / hapus data contoh):');
  Logger.log('   Super Admin : admin@sekolah.sch.id / ' + demoPw_('sa'));
  Logger.log('   Guru        : guru@sekolah.sch.id / ' + demoPw_('guru'));
  Logger.log('   Siswa       : 20230101 / ' + demoPw_('siswa') + '   (siswa contoh lain: sandi = NIS)');
}

/** UPDATE v2.0 → v2.1 — jalankan SEKALI dari editor setelah menempel kode baru. Aman diulang. */
function setupV21() {
  resetMemo_();
  if (!prop_('SPREADSHEET_ID')) { Logger.log('⚠️ Belum ada setup. Jalankan setupAppEnvironment() dulu.'); return; }
  Logger.log('🔧 Update ke v' + APP.VERSION + ' ...');
  upgradeSchema(true);
  setupRahasia_();
  if (!prop_('BUKTI_FOLDER')) {
    try { var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID')); setProp_('BUKTI_FOLDER', root.createFolder('SIAKAD_BUKTI_BAYAR').getId()); Logger.log('+ folder SIAKAD_BUKTI_BAYAR'); }
    catch (e) { Logger.log('⚠️ Folder bukti bayar gagal dibuat: ' + e.message + ' (bukti akan disimpan di SIAKAD_ASET)'); }
  }
  var dipindah = amankanSandi_();
  Logger.log('🔐 Hash sandi dipindahkan dari sheet ke Script Properties: ' + dipindah + ' akun');
  Logger.log('🧹 Hash akun yatim dibersihkan: ' + bersihkanPwYatim_());
  var lok = lokasiBawaan_();
  if (lok) Logger.log('📍 Lokasi bawaan dibuat dari LAT/LNG sekolah: ' + lok);
  var sa = ensureSuperAdmin_();
  if (sa) {
    Logger.log('👑 AKUN SUPER ADMIN BARU (catat sekarang — hanya tampil SEKALI, wajib ganti setelah login):');
    Logger.log('   Email : ' + sa.email);
    Logger.log('   Sandi : ' + sa.password);
  } else Logger.log('👑 Super Admin sudah ada (lupa sandi? jalankan resetSuperAdmin()).');
  ['master', 'absen', 'nilai', 'akun', 'adm', 'tagihan', 'notif'].forEach(function (s) { bump_(s); });
  pasangTrigger();
  Logger.log('🔥 Warmup: ' + warmCaches_('setup'));
  Logger.log('✅ Selesai. Lanjutkan: Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.');
  cekPerforma();
}

/** Laporan kesehatan server (jalankan dari editor) */
function cekPerforma() {
  resetMemo_();
  var c = CacheService.getScriptCache(), out = [];
  function st(k) { return c.get(k) ? 'HANGAT' : 'dingin'; }
  out.push('Versi           : ' + APP.VERSION);
  out.push('Cache pengaturan: ' + st('cfg_' + ver_('master')));
  out.push('Cache akun      : ' + st('uidx_' + ver_('akun')));
  out.push('Cache boot guru : ' + st('bootG_' + versKey_()));
  out.push('Warmup terakhir : ' + (c.get('warm_last') || '-'));
  out.push('Warmup otomatis : ' + (prop_('KEEP_WARM') === 'off' ? 'DIMATIKAN (nyalakanKeepWarm untuk mengaktifkan)' : 'aktif (pekerjaMenit)'));
  var nq = CacheX.get('nq');
  out.push('Antrean notif   : cache ' + (nq ? nq.length : 0) + ' pesan · sheet ' + (propFresh_('ANTRIAN_ADA') === '1' ? 'ada antrean' : 'kosong'));
  out.push('Trigger         : ' + ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }).join(', '));
  var all = PROPS.getProperties(), keys = Object.keys(all), size = 0, pw = 0;
  keys.forEach(function (k) { size += k.length + String(all[k]).length; if (k.indexOf('PW_') === 0) pw++; });
  out.push('Script Properties: ' + keys.length + ' kunci (' + pw + ' hash sandi), ±' + Math.round(size / 1024) + ' KB dari batas ±500 KB' + (size > 400000 ? ' ⚠️ hampir penuh' : ''));
  out.push('Secret sesi     : ' + (prop_('TOKEN_SECRET') ? 'ada' : 'BELUM') + ' · QR secret: ' + (prop_('QR_SECRET') ? 'ada' : 'BELUM') + ' · Token Fonnte: ' + (prop_('FONNTE_TOKEN') ? samarkan_(prop_('FONNTE_TOKEN')) : 'belum diisi'));
  Logger.log('📊 CEK PERFORMA\n   ' + out.join('\n   '));
  return out;
}

/** Upgrade aditif: sheet & kolom baru ditambahkan tanpa menyentuh data lama */
function upgradeSchema(diam) {
  var ss = getSS_();
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { createSheet_(ss, name); Logger.log('+ sheet ' + name); return; }
    var h = DB.headers_(sh), miss = SCHEMA[name].cols.filter(function (c) { return h.indexOf(c) === -1; });
    if (miss.length) { _COLS_OK[name] = 0; tambahKolom_(sh, name, h); Logger.log('+ kolom ' + name + ': ' + miss.join(', ')); }
  });
  var have = {}; DB.all('Config').forEach(function (r) { have[r.key] = 1; });
  DB.appendBatch('Config', CONFIG_SEED.filter(function (r) { return !have[r[0]]; }).map(function (r) { return { key: r[0], value: r[1], keterangan: r[2] }; }));
  setProp_('SCHEMA_VERSION', String(APP.SCHEMA_VERSION));
  bump_('master'); bump_('absen'); bump_('nilai');
  if (!diam) { pasangTrigger(); Logger.log('✅ Upgrade skema selesai.'); }
}

;
// ==== Akademik.gs ====
/**
 * =====================================================================
 *  SIAKAD SISWA v2.1 — File 2/7 : Akademik.gs
 *  Bootstrap per peran, data induk, jadwal, absensi (barcode/selfie/GPS),
 *  materi (Drive/YouTube), penilaian, laporan, data contoh.
 * =====================================================================
 */

var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// ---------------------------------------------------------------------
// A. BOOTSTRAP — satu panggilan untuk satu layar (cache per versi)
// ---------------------------------------------------------------------
function versKey_() { return ver_('master') + '_' + ver_('absen') + '_' + ver_('nilai') + '_' + today_(); }

function publicCfg_() {
  var c = settings_(), o = {};
  ['NAMA_SEKOLAH', 'ALAMAT_SEKOLAH', 'LOGO_URL', 'LAT_SEKOLAH', 'LNG_SEKOLAH', 'RADIUS_M', 'GPS_WAJIB_SCAN', 'JAM_MASUK', 'JAM_PULANG',
    'TAHUN_AJARAN', 'SEMESTER', 'SEMESTER_MULAI', 'SEMESTER_SELESAI', 'KKM', 'BOBOT_HARIAN', 'BOBOT_UTS', 'BOBOT_UAS', 'BATAS_KEHADIRAN',
    'MATERI_MAKS_MB', 'AUTO_ALPHA_JAM', 'EMAIL_DOMAIN_SISWA', 'GPS_TOLERANSI_M', 'JAM_MASUK_GURU', 'JAM_PULANG_GURU', 'KUNCI_PERANGKAT', 'PRESENSI_GURU_SELFIE',
    'REKENING_BANK'].forEach(function (k) { o[k] = c[k]; });
  o.demo = prop_('DEMO_SEEDED') === '1';
  o.today = today_();
  o.now = nowIso_();
  return o;
}

function siswaPublic_(s) {
  return { NIS: s.NIS, NISN: s.NISN, nama_lengkap: s.nama_lengkap, jenis_kelamin: s.jenis_kelamin, kelas_id: s.kelas_id, jenjang: s.jenjang,
    barcode_id: s.barcode_id, email: s.email, no_wa: s.no_wa, nama_ortu: s.nama_ortu, no_wa_ortu: s.no_wa_ortu, tempat_lahir: s.tempat_lahir,
    tanggal_lahir: s.tanggal_lahir, alamat: s.alamat, foto_profil_url: s.foto_profil_url, tahun_masuk: s.tahun_masuk, status: s.status, StatusWA: s.StatusWA };
}

/** Indeks absensi semester berjalan: hari efektif per kelas + rekap per siswa (memo & cache) */
var _ABS_IDX = null;
function absenIndex_() {
  if (_ABS_IDX) return _ABS_IDX;
  var key = 'absidx_' + ver_('absen') + '_' + ver_('master') + '_' + today_();
  var c = CacheX.get(key);
  if (c) return (_ABS_IDX = c);
  var mulai = setting_('SEMESTER_MULAI', '2000-01-01'), selesai = setting_('SEMESTER_SELESAI', '2999-12-31'), tdy = today_();
  var batasAkhir = selesai < tdy ? selesai : tdy;
  var hariKelas = {}, rekap = {}, daily = {};
  var siswa = DB.all('Siswa'), kelasOf = {};
  siswa.forEach(function (s) { kelasOf[s.NIS] = s.kelas_id; });
  DB.all('Absensi').forEach(function (a) {
    var t = String(a.tanggal);
    if (t < mulai || t > batasAkhir) return;
    var k = a.kelas_id || kelasOf[a.NIS] || '-';
    (hariKelas[k] = hariKelas[k] || {})[t] = 1;
    var r = rekap[a.NIS] = rekap[a.NIS] || { H: 0, I: 0, S: 0, A: 0, T: 0, n: 0 };
    var st = String(a.status || '').charAt(0).toUpperCase();
    if (r[st] !== undefined) r[st]++;
    if (st === 'H' && String(a.terlambat).toUpperCase() === 'YA') r.T++;
    r.n++;
    var d = daily[t] = daily[t] || { H: 0, I: 0, S: 0, A: 0 };
    if (d[st] !== undefined) d[st]++;
  });
  var hk = {}; Object.keys(hariKelas).forEach(function (k) { hk[k] = Object.keys(hariKelas[k]).sort(); });
  var out = {};
  siswa.forEach(function (s) {
    var r = rekap[s.NIS] || { H: 0, I: 0, S: 0, A: 0, T: 0, n: 0 };
    var hari = (hk[s.kelas_id] || []).length;
    var tanpaKet = Math.max(0, hari - r.n);
    out[s.NIS] = { H: r.H, I: r.I, S: r.S, A: r.A + tanpaKet, T: r.T, hari: hari, persen: hari ? round1_(r.H / hari * 100) : null };
  });
  var res = { rekap: out, daily: daily, hariKelas: hk, mulai: mulai };
  CacheX.put(key, res, 900);
  return (_ABS_IDX = res);
}

/** Tren kehadiran: 7 hari terakhir (harian) + 12 pekan (mingguan) */
function trendKehadiran_(idx, totalSiswa) {
  var hariIni = new Date(today_() + 'T00:00:00+07:00'), harian = [], pekan = {};
  for (var i = 6; i >= 0; i--) {
    var d = new Date(hariIni.getTime() - i * 864e5), t = Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd'), r = idx.daily[t];
    var tot = r ? r.H + r.I + r.S + r.A : 0;
    harian.push({ tanggal: t, hari: HARI[Number(Utilities.formatDate(d, APP.TZ, 'u')) % 7], H: r ? r.H : 0, I: r ? r.I : 0, S: r ? r.S : 0, A: r ? r.A : 0, persen: r && totalSiswa ? round1_(r.H / totalSiswa * 100) : null });
  }
  Object.keys(idx.daily).forEach(function (t) {
    var d = new Date(t + 'T00:00:00+07:00'), senin = new Date(d.getTime() - ((Number(Utilities.formatDate(d, APP.TZ, 'u')) + 6) % 7) * 864e5);
    var k = Utilities.formatDate(senin, APP.TZ, 'yyyy-MM-dd'), r = idx.daily[t], p = pekan[k] = pekan[k] || { H: 0, tot: 0, hari: 0, I: 0, S: 0, A: 0 };
    p.H += r.H; p.I += r.I; p.S += r.S; p.A += r.A; p.hari++;
  });
  var mingguan = Object.keys(pekan).sort().slice(-12).map(function (k, i) {
    var p = pekan[k], denom = totalSiswa * p.hari;
    return { pekan: k, label: 'Pekan ' + (i + 1), persen: denom ? round1_(p.H / denom * 100) : null, H: p.H, I: p.I, S: p.S, A: p.A };
  });
  return { harian: harian, mingguan: mingguan };
}

function predikat_(n) {
  var kkm = num_(setting_('KKM', 70), 70);
  if (n === '' || n === null || isNaN(n)) return '';
  if (n >= 90) return 'A';
  if (n >= 80) return 'B';
  if (n >= kkm) return 'C';
  return 'D';
}
function hitungAkhir_(h, u, a) {
  if (h === '' || u === '' || a === '') return '';
  var bh = num_(setting_('BOBOT_HARIAN', 40)), bu = num_(setting_('BOBOT_UTS', 30)), ba = num_(setting_('BOBOT_UAS', 30));
  var tot = bh + bu + ba || 100;
  return round1_((num_(h) * bh + num_(u) * bu + num_(a) * ba) / tot);
}
function nilaiAktif_() {
  var ta = setting_('TAHUN_AJARAN', ''), sem = setting_('SEMESTER', '');
  return DB.all('Nilai').filter(function (n) { return String(n.tahun_ajaran) === ta && String(n.semester) === sem; });
}

function apiGuruBootstrap(ctx, d) {
  var data = cached_('bootG_' + versKey_(), 600, buildGuruBootstrap_);
  var me = null, u = ctx.user || {};
  (data.guru || []).forEach(function (g) { if (ctx.session.ref && String(g.NUPTK) === String(ctx.session.ref)) me = g; });
  // bagian per-akun (di luar cache bersama): peran, hak, geofence, perangkat, presensi hari ini, lonceng
  var akun = Object.assign({ role: ctx.session.role, sa: ctx.session.role === 'superadmin', hak: String(u.h || ''), keu: isKeu_(ctx), terhubungGuru: !!me,
    presensiHariIni: me ? presensiHariIni_(ctx.session.uid) : null, notifBelum: notifBelum_(ctx.session.uid) }, lokasiInfo_(ctx));
  return ok_(Object.assign({}, data, { me: me || { nama_lengkap: u.n || ctx.session.email, email: ctx.session.email, jabatan: ROLES[ctx.session.role] }, role: 'guru', akun: akun }));
}

function buildGuruBootstrap_() {
  var cfg = publicCfg_(), tdy = cfg.today;
  var siswa = DB.all('Siswa').map(siswaPublic_);
  var aktif = siswa.filter(function (s) { return String(s.status || 'Aktif') === 'Aktif'; });
  var akunMap = {}; DB.all('Users').forEach(function (u) { if (u.role === 'siswa') akunMap[u.ref_id] = { status: u.status_aktif, last: u.last_login }; });
  siswa.forEach(function (s) { var a = akunMap[s.NIS]; s.akun = a ? a.status : ''; s.last_login = a ? a.last : ''; });
  var idx = absenIndex_();
  var absHariIni = DB.all('Absensi').filter(function (a) { return String(a.tanggal) === tdy; });
  var cnt = { H: 0, I: 0, S: 0, A: 0 };
  absHariIni.forEach(function (a) { var st = String(a.status).charAt(0).toUpperCase(); if (cnt[st] !== undefined) cnt[st]++; });
  var nilai = nilaiAktif_();
  var aksesCount = {};
  DB.all('MateriAkses').forEach(function (a) { aksesCount[a.materi_id] = (aksesCount[a.materi_id] || 0) + 1; });
  var materi = DB.all('Materi').filter(function (m) { return m.status !== 'Dihapus'; }).map(function (m) { return Object.assign({}, m, { akses: aksesCount[m.materi_id] || 0 }); });
  var batas = num_(setting_('BATAS_KEHADIRAN', 75));
  var perhatian = aktif.filter(function (s) { var r = idx.rekap[s.NIS]; return r && r.persen !== null && r.persen < batas; })
    .map(function (s) { var r = idx.rekap[s.NIS]; return { NIS: s.NIS, nama: s.nama_lengkap, kelas_id: s.kelas_id, persen: r.persen, absen: r.hari - r.H }; })
    .sort(function (a, b) { return a.persen - b.persen; });
  var rataKelas = {}, sumK = {};
  nilai.forEach(function (n) { if (n.nilai_akhir === '') return; var s = sumK[n.kelas_id] = sumK[n.kelas_id] || [0, 0]; s[0] += num_(n.nilai_akhir); s[1]++; });
  Object.keys(sumK).forEach(function (k) { rataKelas[k] = round1_(sumK[k][0] / sumK[k][1]); });
  var allN = nilai.filter(function (n) { return n.nilai_akhir !== ''; });
  var rata = allN.length ? round1_(allN.reduce(function (a, n) { return a + num_(n.nilai_akhir); }, 0) / allN.length) : null;
  return {
    cfg: cfg,
    kelas: DB.all('Kelas'), mapel: DB.all('Mapel'), guru: DB.all('Guru'), jadwal: DB.all('Jadwal'),
    siswa: siswa, materi: materi, nilai: nilai,
    pengumuman: DB.all('Pengumuman').filter(function (p) { return p.status !== 'Arsip'; }).sort(function (a, b) { return String(b.tanggal).localeCompare(String(a.tanggal)); }),
    absensiHariIni: absHariIni,
    rekapAbsen: idx.rekap, hariKelas: idx.hariKelas,
    trend: trendKehadiran_(idx, aktif.length),
    stats: {
      totalSiswa: aktif.length, L: aktif.filter(function (s) { return s.jenis_kelamin === 'L'; }).length,
      hadirHariIni: cnt.H, izinHariIni: cnt.I, sakitHariIni: cnt.S, alphaHariIni: cnt.A,
      persenHariIni: aktif.length ? round1_(cnt.H / aktif.length * 100) : 0,
      materiAktif: materi.length, rataNilai: rata, rataKelas: rataKelas,
      akunBelumAktif: siswa.filter(function (s) { return s.akun !== 'YA'; }).length
    },
    perhatian: perhatian
  };
}

function apiSiswaBootstrap(ctx, d) {
  var nis = String(ctx.session.ref);
  var data = cached_('bootS_' + versKey_() + '_' + nis, 600, function () { return buildSiswaBootstrap_(nis); });
  var akun = Object.assign({ role: 'siswa', tagihan: tgRingkasSiswa_(nis), notifBelum: notifBelum_(ctx.session.uid) }, lokasiInfo_(ctx));
  return ok_(Object.assign({}, data, { akun: akun }));
}

function buildSiswaBootstrap_(nis) {
  var s = DB.find('Siswa', 'NIS', nis);
  if (!s) throw new Error('Data siswa tidak ditemukan untuk akun ini.');
  var cfg = publicCfg_(), tdy = cfg.today, mulai = cfg.SEMESTER_MULAI;
  var kelas = DB.find('Kelas', 'kelas_id', s.kelas_id) || {};
  var guruMap = {}; DB.all('Guru').forEach(function (g) { guruMap[g.NUPTK] = g.nama_lengkap; });
  var riwayat = DB.all('Absensi').filter(function (a) { return String(a.NIS) === nis && String(a.tanggal) >= mulai; })
    .map(function (a) { return { absensi_id: a.absensi_id, tanggal: a.tanggal, jam: a.jam, status: a.status, metode: a.metode, jarak_m: a.jarak_m, terlambat: a.terlambat, keterangan: a.keterangan }; })
    .sort(function (a, b) { return String(b.tanggal + b.jam).localeCompare(String(a.tanggal + a.jam)); });
  var hariIni = riwayat.filter(function (a) { return a.tanggal === tdy; })[0] || null;
  var idx = absenIndex_();
  var viewed = {};
  DB.all('MateriAkses').forEach(function (a) { if (String(a.NIS) === nis) viewed[a.materi_id] = 1; });
  var materi = DB.all('Materi').filter(function (m) { return m.status !== 'Dihapus' && (!m.kelas_id || m.kelas_id === s.kelas_id); })
    .map(function (m) { return Object.assign({}, m, { guru: guruMap[m.guru_id] || '', dibaca: !!viewed[m.materi_id] }); })
    .sort(function (a, b) { return String(b.tanggal_upload).localeCompare(String(a.tanggal_upload)); });
  var jadwal = DB.all('Jadwal').filter(function (j) { return j.kelas_id === s.kelas_id; })
    .map(function (j) { return Object.assign({}, j, { guru: guruMap[j.guru_id] || '' }); });
  var nilaiAll = nilaiAktif_();
  var kelasNilai = nilaiAll.filter(function (n) { return n.kelas_id === s.kelas_id && n.nilai_akhir !== ''; });
  var rataMapel = {}, agg = {};
  kelasNilai.forEach(function (n) { var a = agg[n.mata_pelajaran] = agg[n.mata_pelajaran] || [0, 0]; a[0] += num_(n.nilai_akhir); a[1]++; });
  Object.keys(agg).forEach(function (k) { rataMapel[k] = round1_(agg[k][0] / agg[k][1]); });
  var perSiswa = {};
  kelasNilai.forEach(function (n) { var a = perSiswa[n.NIS] = perSiswa[n.NIS] || [0, 0]; a[0] += num_(n.nilai_akhir); a[1]++; });
  var ranking = Object.keys(perSiswa).map(function (k) { return { NIS: k, rata: perSiswa[k][0] / perSiswa[k][1] }; }).sort(function (a, b) { return b.rata - a.rata; });
  var rank = 0; ranking.forEach(function (r, i) { if (r.NIS === nis) rank = i + 1; });
  var nilai = DB.all('Nilai').filter(function (n) { return String(n.NIS) === nis; })
    .map(function (n) { return Object.assign({}, n, { guru: guruMap[n.guru_id] || '' }); });
  var wali = guruMap[kelas.wali_kelas_id] || '';
  return {
    role: 'siswa', cfg: cfg,
    profil: Object.assign(siswaPublic_(s), { nama_kelas: kelas.nama_kelas || s.kelas_id, wali_kelas: wali }),
    hariIni: hariIni, rekap: idx.rekap[nis] || { H: 0, I: 0, S: 0, A: 0, T: 0, hari: 0, persen: null },
    riwayat: riwayat, jadwal: jadwal, materi: materi, nilai: nilai,
    rataMapel: rataMapel, peringkat: rank, jumlahSiswaKelas: DB.all('Siswa').filter(function (x) { return x.kelas_id === s.kelas_id && (x.status || 'Aktif') === 'Aktif'; }).length,
    mapel: DB.all('Mapel'),
    pengumuman: DB.all('Pengumuman').filter(function (p) { return p.status !== 'Arsip'; }).sort(function (a, b) { return String(b.tanggal).localeCompare(String(a.tanggal)); }).slice(0, 10)
  };
}

// ---------------------------------------------------------------------
// B. DATA INDUK SISWA & GURU
// ---------------------------------------------------------------------
function uniqueEmail_(base, domain, exceptUid) {
  var used = {}; DB.all('Users').forEach(function (u) { if (u.user_id !== exceptUid) used[lower_(u.email)] = 1; });
  var e = base + '@' + domain, i = 2;
  while (used[e]) { e = base + i + '@' + domain; i++; }
  return e;
}

function apiSiswaSave(ctx, d) {
  var x = d.data || {}, isNew = !!d.isNew;
  var nis = String(x.NIS || '').trim();
  if (!/^[0-9A-Za-z.-]{3,20}$/.test(nis)) return fail_('NIS wajib diisi (3–20 karakter, angka/huruf).');
  if (!String(x.nama_lengkap || '').trim()) return fail_('Nama lengkap wajib diisi.');
  if (x.NISN && !/^\d{10}$/.test(String(x.NISN).trim())) return fail_('NISN harus 10 digit angka.');
  var kelas = DB.find('Kelas', 'kelas_id', x.kelas_id);
  if (!kelas) return fail_('Kelas / rombel belum dipilih atau tidak ditemukan.');
  var ada = DB.find('Siswa', 'NIS', nis);
  if (isNew && ada) return fail_('NIS ' + nis + ' sudah terdaftar atas nama ' + ada.nama_lengkap + '.');
  if (!isNew && !ada) return fail_('Data siswa tidak ditemukan.');
  if (x.no_wa_ortu && !hpValid_(x.no_wa_ortu)) return fail_('Nomor WhatsApp orang tua tidak valid (contoh: 0812xxxxxxx).');
  if (x.no_wa && !hpValid_(x.no_wa)) return fail_('Nomor WhatsApp siswa tidak valid.');
  var barcode = String(x.barcode_id || (ada && ada.barcode_id) || ('ID-' + nis)).trim();
  var bentrok = DB.all('Siswa').filter(function (s) { return s.NIS !== nis && String(s.barcode_id).toUpperCase() === barcode.toUpperCase(); })[0];
  if (bentrok) return fail_('Barcode ID sudah dipakai ' + bentrok.nama_lengkap + '.');
  var user = DB.all('Users').filter(function (u) { return u.role === 'siswa' && String(u.ref_id) === nis; })[0];
  var domain = setting_('EMAIL_DOMAIN_SISWA', 'siswa.sch.id');
  var email = lower_(x.email) || (user ? lower_(user.email) : uniqueEmail_(slug_(x.nama_lengkap).split('.').slice(0, 2).join('.') || nis, domain, ''));
  if (!emailValid_(email)) return fail_('Format email tidak valid.');
  var dupe = DB.all('Users').filter(function (u) { return lower_(u.email) === email && (!user || u.user_id !== user.user_id); })[0];
  if (dupe) return fail_('Email ' + email + ' sudah dipakai akun lain.');
  var foto = x.foto_profil_url || (ada && ada.foto_profil_url) || '';
  if (d.foto && d.foto.data) {
    var f = saveBase64File_(CONFIG.ASET_FOLDER, 'FOTO_' + nis + '.jpg', d.foto.mime || 'image/jpeg', d.foto.data);
    shareLink_(f);
    foto = 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w400';
  }
  var row = {
    NIS: nis, NISN: String(x.NISN || '').trim(), nama_lengkap: String(x.nama_lengkap).trim(), jenis_kelamin: x.jenis_kelamin === 'P' ? 'P' : 'L',
    kelas_id: kelas.kelas_id, jenjang: kelas.jenjang, barcode_id: barcode, email: email, no_wa: hp08_(x.no_wa), nama_ortu: x.nama_ortu || '',
    no_wa_ortu: hp08_(x.no_wa_ortu), tempat_lahir: x.tempat_lahir || '', tanggal_lahir: x.tanggal_lahir || '', alamat: x.alamat || '',
    foto_profil_url: foto, tahun_masuk: x.tahun_masuk || setting_('TAHUN_AJARAN', ''), status: x.status || (ada ? ada.status : 'Aktif') || 'Aktif'
  };
  var akun = null;
  if (isNew) {
    row.dibuat_pada = nowIso_(); row.StatusWA = ''; row.CekWAAt = '';
    DB.appendBatch('Siswa', [row]);
  } else {
    if (hp08_(ada.no_wa_ortu) !== row.no_wa_ortu) { row.StatusWA = ''; row.CekWAAt = ''; }
    DB.updateBatch('Siswa', 'NIS', [row]);
  }
  if (!user) {
    var pw = String(d.password || '').trim() || randomPassword_(8), salt = newSalt_();
    DB.appendBatch('Users', [{ user_id: reserveIds_('Users', 1)[0], nama: row.nama_lengkap, email: email, password_hash: hashPassword_(pw, salt), salt: salt,
      role: 'siswa', ref_id: nis, kelas_id: row.kelas_id, status_aktif: d.aktifkan === false ? 'TIDAK' : 'YA', wajib_ganti_sandi: 'YA', last_login: '', dibuat_pada: nowIso_() }]);
    akun = { email: email, password: pw };
    if (d.kirimKredensial) kirimNotif_('AKUN_DIBUAT', { nama: row.nama_lengkap, hp: row.no_wa_ortu || row.no_wa, email: email }, { username: email, sandi: pw, nis: nis }, nis);
  } else {
    var patch = { user_id: user.user_id, nama: row.nama_lengkap, email: email, kelas_id: row.kelas_id };
    if (d.password) { var s2 = newSalt_(); patch.password_hash = hashPassword_(d.password, s2); patch.salt = s2; patch.wajib_ganti_sandi = 'YA'; akun = { email: email, password: d.password }; }
    DB.updateBatch('Users', 'user_id', [patch]);
  }
  bump_('master');
  if (typeof crmUpsertSatu_ === 'function') { try { crmUpsertSatu_('siswa', row); crmUpsertSatu_('ortu', row); } catch (e) {} }
  return ok_({ siswa: siswaPublic_(row), akun: akun }, isNew ? 'Siswa ' + row.nama_lengkap + ' berhasil didaftarkan.' : 'Data siswa diperbarui.');
}

function apiSiswaDelete(ctx, d) {
  var nis = String(d.NIS || '');
  var s = DB.find('Siswa', 'NIS', nis);
  if (!s) return fail_('Siswa tidak ditemukan.');
  DB.deleteWhere('Siswa', 'NIS', [nis]);
  var u = DB.all('Users').filter(function (x) { return x.role === 'siswa' && String(x.ref_id) === nis; });
  if (u.length) DB.deleteWhere('Users', 'user_id', u.map(function (x) { return x.user_id; }));
  bump_('master'); bump_('absen');
  return ok_(null, 'Siswa ' + s.nama_lengkap + ' dihapus. Riwayat absensi & nilai tetap tersimpan.');
}

function apiSiswaResetPassword(ctx, d) {
  var u = DB.all('Users').filter(function (x) { return String(x.ref_id) === String(d.NIS || d.NUPTK) && (d.NUPTK ? x.role !== 'siswa' : x.role === 'siswa'); })[0];
  if (!u) return fail_('Akun tidak ditemukan.');
  var pw = String(d.password || '').trim() || randomPassword_(8), salt = newSalt_();
  DB.updateBatch('Users', 'user_id', [{ user_id: u.user_id, password_hash: hashPassword_(pw, salt), salt: salt, wajib_ganti_sandi: 'YA', status_aktif: 'YA' }]);
  revokeAll_(lower_(u.email));
  if (d.kirim) kirimNotif_('RESET_SANDI_ADMIN', kontakUser_(u), { username: u.email, sandi: pw }, u.user_id);
  bump_('master');
  return ok_({ email: u.email, password: pw }, 'Password baru dibuat untuk ' + u.nama + '.');
}

function apiSiswaBulk(ctx, d) {
  var nis = (d.nis || []).map(String), aksi = d.aksi;
  if (!nis.length) return fail_('Belum ada siswa yang dipilih.');
  if ((aksi === 'aktivasi' || aksi === 'nonaktifkanAkun' || aksi === 'hapus') && !isSA_(ctx)) return fail_('Aktivasi akun & hapus massal hanya untuk Super Admin.', { code: 'FORBIDDEN' });
  var set = {}; nis.forEach(function (n) { set[n] = 1; });
  if (aksi === 'aktivasi' || aksi === 'nonaktifkanAkun') {
    var up = DB.all('Users').filter(function (u) { return u.role === 'siswa' && set[u.ref_id]; }).map(function (u) { return { user_id: u.user_id, status_aktif: aksi === 'aktivasi' ? 'YA' : 'TIDAK' }; });
    DB.updateBatch('Users', 'user_id', up);
  } else if (aksi === 'pindahKelas') {
    var k = DB.find('Kelas', 'kelas_id', d.nilai); if (!k) return fail_('Kelas tujuan tidak ditemukan.');
    DB.updateBatch('Siswa', 'NIS', nis.map(function (n) { return { NIS: n, kelas_id: k.kelas_id, jenjang: k.jenjang }; }));
    DB.updateBatch('Users', 'user_id', DB.all('Users').filter(function (u) { return u.role === 'siswa' && set[u.ref_id]; }).map(function (u) { return { user_id: u.user_id, kelas_id: k.kelas_id }; }));
  } else if (aksi === 'status') {
    if (['Aktif', 'Nonaktif', 'Lulus', 'Pindah'].indexOf(d.nilai) === -1) return fail_('Status tidak valid.');
    DB.updateBatch('Siswa', 'NIS', nis.map(function (n) { return { NIS: n, status: d.nilai }; }));
  } else if (aksi === 'hapus') {
    DB.deleteWhere('Siswa', 'NIS', nis);
    DB.deleteWhere('Users', 'user_id', DB.all('Users').filter(function (u) { return u.role === 'siswa' && set[u.ref_id]; }).map(function (u) { return u.user_id; }));
  } else return fail_('Aksi massal tidak dikenal.');
  bump_('master'); bump_('absen');
  return ok_({ n: nis.length }, 'Aksi massal diterapkan ke ' + nis.length + ' siswa.');
}

function apiGuruSave(ctx, d) {
  var x = d.data || {}, isNew = !!d.isNew, id = String(x.NUPTK || '').trim();
  if (!/^[0-9A-Za-z.-]{3,24}$/.test(id)) return fail_('NUPTK / NIP wajib diisi (3–24 karakter).');
  if (!String(x.nama_lengkap || '').trim()) return fail_('Nama guru wajib diisi.');
  var email = lower_(x.email);
  if (!emailValid_(email)) return fail_('Email guru wajib diisi dengan format benar.');
  if (x.no_wa && !hpValid_(x.no_wa)) return fail_('Nomor WhatsApp tidak valid.');
  var ada = DB.find('Guru', 'NUPTK', id);
  if (isNew && ada) return fail_('NUPTK sudah terdaftar.');
  if (!isNew && !ada) return fail_('Guru tidak ditemukan.');
  var user = DB.all('Users').filter(function (u) { return u.role !== 'siswa' && String(u.ref_id) === id; })[0];
  var dupe = DB.all('Users').filter(function (u) { return lower_(u.email) === email && (!user || u.user_id !== user.user_id); })[0];
  if (dupe) return fail_('Email sudah dipakai akun lain.');
  var row = { NUPTK: id, nama_lengkap: String(x.nama_lengkap).trim(), email: email, no_wa: hp08_(x.no_wa), mata_pelajaran: x.mata_pelajaran || '', jabatan: x.jabatan || 'Guru', foto_profil_url: x.foto_profil_url || '', status: x.status || 'Aktif' };
  if (isNew) { row.dibuat_pada = nowIso_(); DB.appendBatch('Guru', [row]); } else DB.updateBatch('Guru', 'NUPTK', [row]);
  var akun = null;
  if (!user) {
    var pw = String(d.password || '').trim() || randomPassword_(8), salt = newSalt_();
    DB.appendBatch('Users', [{ user_id: reserveIds_('Users', 1)[0], nama: row.nama_lengkap, email: email, password_hash: hashPassword_(pw, salt), salt: salt, role: 'guru', ref_id: id, kelas_id: '', status_aktif: 'YA', wajib_ganti_sandi: 'YA', last_login: '', dibuat_pada: nowIso_() }]);
    akun = { email: email, password: pw };
    if (d.kirimKredensial) kirimNotif_('AKUN_DIBUAT', { nama: row.nama_lengkap, hp: row.no_wa, email: email }, { username: email, sandi: pw, nis: id }, id);
  } else {
    var pu = { user_id: user.user_id, nama: row.nama_lengkap, email: email };
    if (user.role === 'guru') pu.status_aktif = row.status === 'Aktif' ? 'YA' : 'TIDAK';    // akun Super Admin tidak ikut dinonaktifkan
    DB.updateBatch('Users', 'user_id', [pu]);
    if (lower_(user.email) !== email || pu.status_aktif === 'TIDAK') revokeAll_(lower_(user.email));
  }
  bump_('master');
  return ok_({ guru: row, akun: akun }, isNew ? 'Guru ditambahkan.' : 'Data guru diperbarui.');
}

function apiGuruDelete(ctx, d) {
  var id = String(d.NUPTK || '');
  if (id === String(ctx.session.ref)) return fail_('Tidak bisa menghapus akun Anda sendiri.');
  var g = DB.find('Guru', 'NUPTK', id); if (!g) return fail_('Guru tidak ditemukan.');
  var akun = DB.all('Users').filter(function (u) { return u.role !== 'siswa' && String(u.ref_id) === id; });
  if (akun.some(function (u) { return u.role === 'superadmin'; })) return fail_('Guru ini juga Super Admin. Turunkan perannya dulu di menu Kelola Akun.');
  DB.deleteWhere('Guru', 'NUPTK', [id]);
  akun.forEach(function (u) { revokeAll_(lower_(u.email)); });
  DB.deleteWhere('Users', 'user_id', akun.map(function (u) { return u.user_id; }));
  bump_('master');
  return ok_(null, 'Guru ' + g.nama_lengkap + ' dihapus.');
}

// ---------------------------------------------------------------------
// C. MASTER GENERIK: Kelas, Mapel, Jadwal, Pengumuman
// ---------------------------------------------------------------------
var MASTER_SHEETS = { Kelas: 1, Mapel: 1, Jadwal: 1, Pengumuman: 1 };
function toMin_(hhmm) { var p = String(hhmm || '').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }

function apiMasterSave(ctx, d) {
  var sheet = d.sheet, x = Object.assign({}, d.row || {});
  if (!MASTER_SHEETS[sheet]) return fail_('Data tidak dikenal.');
  var key = SCHEMA[sheet].key, isNew = !x[key];
  if (sheet === 'Kelas') {
    if (!String(x.nama_kelas || '').trim()) return fail_('Nama kelas wajib diisi.');
    if (['SD', 'SMP', 'SMA'].indexOf(x.jenjang) === -1) return fail_('Jenjang harus SD, SMP, atau SMA.');
    x.tahun_ajaran = x.tahun_ajaran || setting_('TAHUN_AJARAN', '');
  } else if (sheet === 'Mapel') {
    if (!String(x.nama || '').trim()) return fail_('Nama mata pelajaran wajib diisi.');
    var dup = DB.all('Mapel').filter(function (m) { return lower_(m.nama) === lower_(x.nama) && m.mapel_id !== x.mapel_id; })[0];
    if (dup) return fail_('Mata pelajaran sudah ada.');
  } else if (sheet === 'Jadwal') {
    if (!x.kelas_id || !x.mata_pelajaran || !x.hari || !x.jam_mulai || !x.jam_selesai) return fail_('Kelas, mapel, hari, jam mulai & selesai wajib diisi.');
    if (toMin_(x.jam_selesai) <= toMin_(x.jam_mulai)) return fail_('Jam selesai harus setelah jam mulai.');
    var a1 = toMin_(x.jam_mulai), a2 = toMin_(x.jam_selesai);
    var konflik = DB.all('Jadwal').filter(function (j) {
      if (j.jadwal_id === x.jadwal_id || j.hari !== x.hari) return false;
      var overlap = toMin_(j.jam_mulai) < a2 && a1 < toMin_(j.jam_selesai);
      return overlap && (j.kelas_id === x.kelas_id || (x.guru_id && j.guru_id === x.guru_id) || (x.ruang && lower_(j.ruang) === lower_(x.ruang)));
    })[0];
    if (konflik) return fail_('Jadwal bentrok dengan ' + konflik.mata_pelajaran + ' (' + konflik.hari + ' ' + konflik.jam_mulai + '–' + konflik.jam_selesai + ', ' + konflik.kelas_id + (konflik.ruang ? ', ' + konflik.ruang : '') + ').');
  } else if (sheet === 'Pengumuman') {
    if (!String(x.judul || '').trim() || !String(x.isi || '').trim()) return fail_('Judul dan isi pengumuman wajib diisi.');
    x.tanggal = x.tanggal || nowIso_(); x.oleh = x.oleh || ctx.session.email; x.status = x.status || 'Aktif'; x.kategori = x.kategori || 'Akademik';
  }
  var cols = SCHEMA[sheet].cols, row = {};
  cols.forEach(function (c) { if (x[c] !== undefined) row[c] = x[c]; });
  if (isNew) { row[key] = reserveIds_(sheet, 1)[0]; DB.appendBatch(sheet, [row]); }
  else { if (!DB.find(sheet, key, row[key])) return fail_('Data tidak ditemukan.'); DB.updateBatch(sheet, key, [row]); }
  if (sheet === 'Pengumuman' && isNew && d.kirimNotif) {
    var penerima = DB.all('Siswa').filter(function (s) { return (s.status || 'Aktif') === 'Aktif'; }).map(function (s) { return { penerima: { nama: s.nama_lengkap, hp: s.no_wa_ortu || s.no_wa, email: s.email }, vars: { judul: row.judul, isi: row.isi }, refId: row[key] }; });
    kirimNotifBatch_('PENGUMUMAN', penerima);
  }
  bump_('master');
  return ok_(row, 'Data ' + sheet.toLowerCase() + ' tersimpan.');
}

function apiMasterDelete(ctx, d) {
  var sheet = d.sheet; if (!MASTER_SHEETS[sheet]) return fail_('Data tidak dikenal.');
  var key = SCHEMA[sheet].key, id = String(d.id || '');
  if (sheet === 'Kelas' && DB.all('Siswa').some(function (s) { return s.kelas_id === id; })) return fail_('Kelas masih memiliki siswa. Pindahkan siswa terlebih dahulu.');
  var n = DB.deleteWhere(sheet, key, [id]);
  if (!n) return fail_('Data tidak ditemukan.');
  bump_('master');
  return ok_(null, 'Data dihapus.');
}

var CONFIG_EDITABLE = /^(NAMA_SEKOLAH|ALAMAT_SEKOLAH|LOGO_URL|LAT_SEKOLAH|LNG_SEKOLAH|RADIUS_M|GPS_WAJIB_SCAN|GPS_TOLERANSI_M|JAM_MASUK|JAM_PULANG|AUTO_ALPHA_JAM|TAHUN_AJARAN|SEMESTER|SEMESTER_MULAI|SEMESTER_SELESAI|KKM|BOBOT_HARIAN|BOBOT_UTS|BOBOT_UAS|BATAS_KEHADIRAN|EMAIL_DOMAIN_SISWA|MATERI_MAKS_MB|JAM_MASUK_GURU|JAM_PULANG_GURU|KUNCI_PERANGKAT|PRESENSI_GURU_SELFIE)$/;
function apiConfigGet(ctx, d) {
  var ket = {}; CONFIG_SEED.forEach(function (r) { ket[r[0]] = r[2]; });
  var s = settings_();
  return ok_(Object.keys(s).filter(function (k) { return CONFIG_EDITABLE.test(k); }).map(function (k) { return { key: k, value: s[k], keterangan: ket[k] || '' }; }));
}
function apiConfigSave(ctx, d) {
  var p = d.pairs || {}, clean = {};
  Object.keys(p).forEach(function (k) { if (CONFIG_EDITABLE.test(k)) clean[k] = String(p[k]).trim(); });
  if (clean.LAT_SEKOLAH !== undefined && (isNaN(Number(clean.LAT_SEKOLAH)) || Math.abs(Number(clean.LAT_SEKOLAH)) > 90)) return fail_('Latitude tidak valid.');
  if (clean.LNG_SEKOLAH !== undefined && (isNaN(Number(clean.LNG_SEKOLAH)) || Math.abs(Number(clean.LNG_SEKOLAH)) > 180)) return fail_('Longitude tidak valid.');
  if (clean.RADIUS_M !== undefined && !(Number(clean.RADIUS_M) >= 10 && Number(clean.RADIUS_M) <= 5000)) return fail_('Radius harus 10–5000 meter.');
  var bh = num_(clean.BOBOT_HARIAN !== undefined ? clean.BOBOT_HARIAN : setting_('BOBOT_HARIAN', 40)),
      bu = num_(clean.BOBOT_UTS !== undefined ? clean.BOBOT_UTS : setting_('BOBOT_UTS', 30)),
      ba = num_(clean.BOBOT_UAS !== undefined ? clean.BOBOT_UAS : setting_('BOBOT_UAS', 30));
  if (bh + bu + ba !== 100) return fail_('Total bobot Harian + UTS + UAS harus 100%.');
  var jamSalah = false;
  ['JAM_MASUK', 'JAM_PULANG', 'AUTO_ALPHA_JAM', 'JAM_MASUK_GURU', 'JAM_PULANG_GURU'].forEach(function (k) { if (clean[k] && !/^\d{2}:\d{2}$/.test(clean[k])) jamSalah = true; });
  if (jamSalah) return fail_('Format jam harus HH:mm (contoh 07:15).');
  ['GPS_WAJIB_SCAN', 'KUNCI_PERANGKAT', 'PRESENSI_GURU_SELFIE'].forEach(function (k) { if (clean[k] !== undefined) clean[k] = clean[k] === 'YA' ? 'YA' : 'TIDAK'; });
  if (clean.GPS_TOLERANSI_M !== undefined && !(Number(clean.GPS_TOLERANSI_M) >= 0 && Number(clean.GPS_TOLERANSI_M) <= 100)) return fail_('Toleransi GPS 0–100 meter.');
  saveSettings_(clean);
  bump_('absen'); bump_('nilai');
  return ok_(publicCfg_(), 'Pengaturan disimpan.');
}

// ---------------------------------------------------------------------
// D. ABSENSI
// ---------------------------------------------------------------------
/* cekLokasi_ (multi-lokasi) ada di Admin.gs */
function terlambat_(jam) { return jam.substring(0, 5) > setting_('JAM_MASUK', '07:15') ? 'YA' : 'TIDAK'; }

function catatHadir_(s, metode, lat, lng, jarak, fotoId, oleh, ket, extra) {
  extra = extra || {};
  var tdy = today_(), jam = timeNow_();
  var ada = DB.all('Absensi').filter(function (a) { return String(a.NIS) === String(s.NIS) && String(a.tanggal) === tdy; })[0];
  if (ada && String(ada.status) === 'Hadir') return { duplikat: true, row: ada };
  var row = { NIS: s.NIS, kelas_id: s.kelas_id, tanggal: tdy, jam: jam, status: 'Hadir', metode: metode, latitude: lat === undefined ? '' : lat, longitude: lng === undefined ? '' : lng,
    jarak_m: jarak === null || jarak === undefined ? '' : jarak, foto_selfie_id: fotoId || '', keterangan: ket || (ada ? 'Sebelumnya: ' + ada.status : ''), terlambat: terlambat_(jam), dicatat_oleh: oleh, dibuat_pada: nowIso_(),
    lokasi_id: extra.lokasi_id || '', device_id: extra.device_id || '' };
  if (ada) { row.absensi_id = ada.absensi_id; DB.updateBatch('Absensi', 'absensi_id', [row]); }
  else { row.absensi_id = reserveIds_('Absensi', 1)[0]; DB.appendBatch('Absensi', [row]); }
  bump_('absen');
  kirimNotif_('ABSEN_HADIR', { nama: s.nama_lengkap, hp: s.no_wa_ortu, email: s.email },
    { jam: jam.substring(0, 5), metode: metodeLabel_(metode), tanggal: tanggalIndo_(tdy), status: row.terlambat === 'YA' ? 'Hadir (terlambat)' : 'Hadir tepat waktu' }, row.absensi_id);
  return { duplikat: false, row: row };
}
function metodeLabel_(m) { return { barcode: 'Scan Barcode', selfie: 'Selfie + GPS', lokasi: 'Lokasi GPS', manual: 'Input Guru' }[m] || m; }
function tanggalIndo_(t) {
  var bln = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var p = String(t).split('-'); return Number(p[2]) + ' ' + bln[Number(p[1]) - 1] + ' ' + p[0];
}
function ringkasHariIni_() {
  var tdy = today_(), c = { H: 0, I: 0, S: 0, A: 0 };
  DB.all('Absensi').forEach(function (a) { if (String(a.tanggal) === tdy) { var st = String(a.status).charAt(0).toUpperCase(); if (c[st] !== undefined) c[st]++; } });
  return c;
}

function apiAbsenScan(ctx, d) {
  var kode = String(d.barcode || '').trim();
  if (!kode) return fail_('Barcode kosong.');
  var up = kode.toUpperCase().replace(/-SIAKAD-SECURE$/, '');
  var s = DB.all('Siswa').filter(function (x) { return String(x.barcode_id).toUpperCase() === up || String(x.NIS) === kode || ('ID-' + x.NIS) === up; })[0];
  if (!s) return fail_('Barcode "' + kode + '" tidak terdaftar.', { code: 'NOT_FOUND' });
  if ((s.status || 'Aktif') !== 'Aktif') return fail_(s.nama_lengkap + ' berstatus ' + s.status + '.');
  var lok = { ok: true, jarak: null };
  if (setting_('GPS_WAJIB_SCAN', 'YA') === 'YA') {
    lok = cekLokasi_(d.lat, d.lng, { peran: 'guru', user: ctx.user, acc: d.acc });
    if (!lok.ok) return fail_(lok.msg, { code: 'OUT_OF_RANGE', jarak: lok.jarak });
  }
  var r = catatHadir_(s, 'barcode', d.lat, d.lng, lok.jarak, '', ctx.session.email, d.sesi || '', { lokasi_id: lok.lokasi_id || '' });
  var kelas = DB.find('Kelas', 'kelas_id', s.kelas_id) || {};
  return ok_({ duplikat: r.duplikat, row: r.row, siswa: { NIS: s.NIS, nama: s.nama_lengkap, kelas: kelas.nama_kelas || s.kelas_id, foto: s.foto_profil_url }, jarak: lok.jarak, ringkas: ringkasHariIni_() },
    r.duplikat ? s.nama_lengkap + ' sudah tercatat hadir pukul ' + String(r.row.jam).substring(0, 5) + '.' : '✅ ' + s.nama_lengkap + ' berhasil diabsen.');
}

function apiAbsenSelf(ctx, d) {
  var s = DB.find('Siswa', 'NIS', ctx.session.ref);
  if (!s) return fail_('Data siswa tidak ditemukan.');
  var metode = d.metode === 'selfie' ? 'selfie' : 'lokasi';
  var ada = DB.all('Absensi').filter(function (a) { return String(a.NIS) === String(s.NIS) && String(a.tanggal) === today_() && a.status === 'Hadir'; })[0];
  if (ada) return fail_('Anda sudah absen hari ini pukul ' + String(ada.jam).substring(0, 5) + '.', { code: 'DUPLICATE', row: ada });
  var dev = cekPerangkat_(ctx, d.device_info);
  if (!dev.ok) return fail_(dev.msg, { code: 'DEVICE' });
  var lok = cekLokasi_(d.lat, d.lng, { peran: 'siswa', user: ctx.user, acc: d.acc });
  if (!lok.ok) return fail_(lok.msg.indexOf('tidak sesuai') > -1 ? 'Anda berada di luar area sekolah (' + lok.jarak + ' m dari ' + lok.nama + ', maks ' + lok.radius + ' m).' : lok.msg, { code: 'OUT_OF_RANGE', jarak: lok.jarak, lokasi: lok.nama });
  var fotoId = '';
  if (metode === 'selfie') {
    if (!d.foto) return fail_('Foto selfie belum diambil.');
    if (String(d.foto).length > 3 * 1024 * 1024) return fail_('Ukuran foto terlalu besar.');
    var nama = s.NIS + '_' + today_().replace(/-/g, '') + '_' + timeNow_().replace(/:/g, '') + '.jpg';
    fotoId = saveBase64File_(CONFIG.SELFIE_FOLDER, nama, 'image/jpeg', d.foto).getId();
  }
  var r = catatHadir_(s, metode, d.lat, d.lng, lok.jarak, fotoId, s.email || ctx.session.email, '', { lokasi_id: lok.lokasi_id, device_id: ctx.dev });
  return ok_({ row: r.row, jarak: lok.jarak, lokasi: lok.nama, perangkatBaru: !!dev.baru }, 'Absensi berhasil! Tercatat Hadir pukul ' + String(r.row.jam).substring(0, 5) + ' WIB di ' + lok.nama + '.');
}

var STATUS_ABSEN = { Hadir: 1, Izin: 1, Sakit: 1, Alpha: 1 };
function apiAbsenManual(ctx, d) {
  var tgl = d.tanggal || today_(), items = d.items || [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return fail_('Tanggal tidak valid.');
  if (tgl > today_()) return fail_('Tidak bisa mengisi absensi untuk tanggal yang akan datang.');
  var sMap = {}; DB.all('Siswa').forEach(function (s) { sMap[s.NIS] = s; });
  var idx = {}; DB.all('Absensi').forEach(function (a) { if (String(a.tanggal) === tgl) idx[a.NIS] = a; });
  var ins = [], upd = [], notif = { Alpha: [], Izin: [], Sakit: [] };
  for (var i = 0; i < items.length; i++) {
    var it = items[i], s = sMap[String(it.NIS)];
    if (!s) return fail_('Siswa ' + it.NIS + ' tidak ditemukan.');
    if (!STATUS_ABSEN[it.status]) return fail_('Status harus Hadir, Izin, Sakit, atau Alpha.');
    var ex = idx[s.NIS];
    var row = { NIS: s.NIS, kelas_id: s.kelas_id, tanggal: tgl, jam: ex && ex.jam ? ex.jam : (tgl === today_() ? timeNow_() : '07:00:00'), status: it.status,
      metode: ex && ex.status === 'Hadir' && it.status === 'Hadir' ? ex.metode : 'manual', keterangan: it.keterangan || '', dicatat_oleh: ctx.session.email,
      terlambat: it.status === 'Hadir' ? (ex && ex.terlambat ? ex.terlambat : 'TIDAK') : '', dibuat_pada: nowIso_() };
    if (ex) { row.absensi_id = ex.absensi_id; upd.push(row); } else ins.push(row);
    if (notif[it.status] && (!ex || ex.status !== it.status)) notif[it.status].push(s);
  }
  var ids = reserveIds_('Absensi', ins.length); ins.forEach(function (r, j) { r.absensi_id = ids[j]; });
  DB.appendBatch('Absensi', ins); DB.updateBatch('Absensi', 'absensi_id', upd);
  bump_('absen');
  var tglI = tanggalIndo_(tgl);
  kirimNotifBatch_('ABSEN_ALPHA', notif.Alpha.map(function (s) { return { penerima: { nama: s.nama_lengkap, hp: s.no_wa_ortu, email: s.email }, vars: { tanggal: tglI }, refId: s.NIS }; }));
  kirimNotifBatch_('ABSEN_IZIN_SAKIT', notif.Izin.concat(notif.Sakit).map(function (s) { return { penerima: { nama: s.nama_lengkap, hp: s.no_wa_ortu, email: s.email }, vars: { tanggal: tglI, status: notif.Izin.indexOf(s) > -1 ? 'Izin' : 'Sakit' }, refId: s.NIS }; }));
  return ok_({ ditambah: ins.length, diperbarui: upd.length, ringkas: ringkasHariIni_() }, 'Absensi ' + (ins.length + upd.length) + ' siswa disimpan.');
}

/** Tandai siswa aktif tanpa catatan pada tanggal tsb sebagai Alpha */
function apiAbsenFinalize(ctx, d) {
  var tgl = d.tanggal || today_();
  var sudah = {}; DB.all('Absensi').forEach(function (a) { if (String(a.tanggal) === tgl) sudah[a.NIS] = 1; });
  var target = DB.all('Siswa').filter(function (s) { return (s.status || 'Aktif') === 'Aktif' && !sudah[s.NIS] && (!d.kelas_id || s.kelas_id === d.kelas_id); });
  if (!target.length) return ok_({ n: 0 }, 'Semua siswa sudah memiliki catatan absensi.');
  return apiAbsenManual(ctx, { tanggal: tgl, items: target.map(function (s) { return { NIS: s.NIS, status: 'Alpha', keterangan: 'Tanpa keterangan (otomatis)' }; }) });
}
function autoAlphaCek_() {
  var jam = setting_('AUTO_ALPHA_JAM', ''); if (!jam) return;
  var tdy = today_(), dow = Number(Utilities.formatDate(new Date(), APP.TZ, 'u'));
  if (dow > 5 || propFresh_('AUTO_ALPHA_DONE') === tdy || timeNow_().substring(0, 5) < jam) return;
  var adaHadir = DB.all('Absensi').some(function (a) { return String(a.tanggal) === tdy && a.status === 'Hadir'; });
  setProp_('AUTO_ALPHA_DONE', tdy);
  if (!adaHadir) return;                                   // hari libur → tidak ditandai
  apiAbsenFinalize({ session: { email: 'SYSTEM', role: 'guru' } }, { tanggal: tdy });
  bump_('adm', true);
}

function apiAbsenList(ctx, d) {
  var dari = d.dari || today_(), sampai = d.sampai || dari;
  var sMap = {}; DB.all('Siswa').forEach(function (s) { sMap[s.NIS] = s; });
  var rows = DB.all('Absensi').filter(function (a) {
    var t = String(a.tanggal);
    return t >= dari && t <= sampai && (!d.kelas_id || a.kelas_id === d.kelas_id) && (!d.NIS || String(a.NIS) === String(d.NIS));
  }).map(function (a) { var s = sMap[a.NIS] || {}; return Object.assign({}, a, { nama: s.nama_lengkap || '(dihapus)' }); })
    .sort(function (a, b) { return String(b.tanggal + b.jam).localeCompare(String(a.tanggal + a.jam)); });
  return ok_({ rows: rows.slice(0, 5000), total: rows.length, dari: dari, sampai: sampai });
}

function apiAbsenFoto(ctx, d) {
  var a = DB.find('Absensi', 'absensi_id', d.absensi_id);
  if (!a || !a.foto_selfie_id) return fail_('Foto tidak tersedia.');
  var k = 'foto_' + a.foto_selfie_id, c = CacheX.get(k);
  if (c) return ok_(c);
  var b = DriveApp.getFileById(a.foto_selfie_id).getBlob();
  var url = 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
  CacheX.put(k, url, 21600);
  return ok_(url);
}

// ---------------------------------------------------------------------
// E. MATERI
// ---------------------------------------------------------------------
function youtubeId_(url) {
  var m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(String(url).trim()) ? String(url).trim() : '');
}
function driveId_(url) { var m = String(url || '').match(/\/d\/([A-Za-z0-9_-]{20,})/) || String(url || '').match(/[?&]id=([A-Za-z0-9_-]{20,})/); return m ? m[1] : ''; }

function apiMateriSave(ctx, d) {
  var x = d.data || {}, isNew = !x.materi_id;
  if (!String(x.judul || '').trim()) return fail_('Judul materi wajib diisi.');
  if (!x.mata_pelajaran) return fail_('Mata pelajaran wajib dipilih.');
  var tipe = x.tipe === 'video' ? 'video' : 'dokumen';
  var ada = isNew ? null : DB.find('Materi', 'materi_id', x.materi_id);
  if (!isNew && !ada) return fail_('Materi tidak ditemukan.');
  var row = { judul: String(x.judul).trim(), deskripsi: x.deskripsi || '', mata_pelajaran: x.mata_pelajaran, kelas_id: x.kelas_id || '', guru_id: x.guru_id || ctx.session.ref,
    tipe: tipe, url_konten: ada ? ada.url_konten : '', drive_file_id: ada ? ada.drive_file_id : '', ukuran: ada ? ada.ukuran : '', durasi: x.durasi || (ada ? ada.durasi : ''), status: 'Aktif' };
  if (tipe === 'video') {
    var yid = youtubeId_(x.url_konten);
    if (!yid) return fail_('URL YouTube tidak valid. Contoh: https://www.youtube.com/watch?v=XXXXXXXXXXX');
    row.url_konten = 'https://www.youtube.com/embed/' + yid; row.drive_file_id = ''; row.ukuran = '';
  } else if (d.file && d.file.data) {
    var maks = num_(setting_('MATERI_MAKS_MB', 20), 20) * 1024 * 1024;
    var bytesLen = Math.floor(String(d.file.data).replace(/^data:[^,]+,/, '').length * 3 / 4);
    if (bytesLen > maks) return fail_('Ukuran file melebihi ' + setting_('MATERI_MAKS_MB', 20) + ' MB.');
    if (!/\.(pdf|docx?|pptx?|xlsx?)$/i.test(d.file.name || '')) return fail_('Format file harus PDF, Word, PowerPoint, atau Excel.');
    var f = saveBase64File_(CONFIG.MATERI_FOLDER, d.file.name, d.file.mime || 'application/pdf', d.file.data);
    shareLink_(f);
    if (ada && ada.drive_file_id) { try { DriveApp.getFileById(ada.drive_file_id).setTrashed(true); } catch (e) {} }
    row.drive_file_id = f.getId(); row.url_konten = 'https://drive.google.com/file/d/' + f.getId() + '/preview'; row.ukuran = bytesLen;
  } else if (x.url_konten && x.url_konten !== (ada && ada.url_konten)) {
    var did = driveId_(x.url_konten);
    row.url_konten = did ? 'https://drive.google.com/file/d/' + did + '/preview' : String(x.url_konten).trim();
    row.drive_file_id = did || '';
    if (!/^https?:\/\//.test(row.url_konten) && !/^demo\//.test(row.url_konten)) return fail_('Tautan dokumen harus diawali https://');
  } else if (!row.url_konten) return fail_('Unggah file dokumen atau tempel tautan Google Drive.');
  if (isNew) {
    row.materi_id = reserveIds_('Materi', 1)[0]; row.tanggal_upload = nowIso_();
    DB.appendBatch('Materi', [row]);
    if (d.kirimNotif) {
      var guru = DB.find('Guru', 'NUPTK', row.guru_id) || {};
      kirimNotifBatch_('MATERI_BARU', DB.all('Siswa').filter(function (s) { return (s.status || 'Aktif') === 'Aktif' && (!row.kelas_id || s.kelas_id === row.kelas_id); })
        .map(function (s) { return { penerima: { nama: s.nama_lengkap, hp: s.no_wa, email: s.email }, vars: { judul: row.judul, mapel: row.mata_pelajaran, guru: guru.nama_lengkap || '' }, refId: row.materi_id }; }));
    }
  } else { row.materi_id = ada.materi_id; row.tanggal_upload = ada.tanggal_upload; DB.updateBatch('Materi', 'materi_id', [row]); }
  bump_('master');
  return ok_(row, isNew ? 'Materi berhasil diunggah dan langsung tampil di dashboard siswa.' : 'Materi diperbarui.');
}

function apiMateriDelete(ctx, d) {
  var m = DB.find('Materi', 'materi_id', d.materi_id);
  if (!m) return fail_('Materi tidak ditemukan.');
  DB.updateBatch('Materi', 'materi_id', [{ materi_id: m.materi_id, status: 'Dihapus' }]);
  if (m.drive_file_id && d.hapusFile) { try { DriveApp.getFileById(m.drive_file_id).setTrashed(true); } catch (e) {} }
  bump_('master');
  return ok_(null, 'Materi dihapus.');
}

/** Catat akses materi — antrean cache (jalur baca tidak menulis sheet) */
function apiMateriView(ctx, d) {
  if (ctx.session.role !== 'siswa' || !d.materi_id) return ok_(null);
  var k = 'viewed_' + ctx.session.ref + '_' + d.materi_id, c = CacheService.getScriptCache();
  if (c.get(k)) return ok_(null);
  c.put(k, '1', 21600);
  var lock = LockService.getScriptLock();
  if (lock.tryLock(300)) {
    try { var q = JSON.parse(c.get('viewq') || '[]'); q.push([d.materi_id, ctx.session.ref, nowIso_()]); c.put('viewq', JSON.stringify(q), 21600); }
    finally { lock.releaseLock(); }
  }
  return ok_(null);
}
function flushMateriViews_(q) {
  var have = {}; DB.all('MateriAkses').forEach(function (a) { have[a.materi_id + '|' + a.NIS] = 1; });
  var rows = q.filter(function (r) { var k = r[0] + '|' + r[1]; if (have[k]) return false; have[k] = 1; return true; });
  if (!rows.length) return;
  var ids = reserveIds_('MateriAkses', rows.length);
  DB.appendBatch('MateriAkses', rows.map(function (r, i) { return { akses_id: ids[i], materi_id: r[0], NIS: r[1], waktu: r[2] }; }));
  bump_('master');
}

// ---------------------------------------------------------------------
// F. PENILAIAN
// ---------------------------------------------------------------------
function nilaiKey_(n) { return [n.NIS, lower_(n.mata_pelajaran), n.semester, n.tahun_ajaran].join('|'); }

function apiNilaiList(ctx, d) {
  var ta = d.tahun_ajaran || setting_('TAHUN_AJARAN', ''), sem = d.semester || setting_('SEMESTER', '');
  var siswa = DB.all('Siswa').filter(function (s) { return s.kelas_id === d.kelas_id && (s.status || 'Aktif') === 'Aktif'; });
  var idx = {};
  DB.all('Nilai').forEach(function (n) { if (lower_(n.mata_pelajaran) === lower_(d.mata_pelajaran) && n.semester === sem && n.tahun_ajaran === ta) idx[n.NIS] = n; });
  return ok_({
    tahun_ajaran: ta, semester: sem, kelas_id: d.kelas_id, mata_pelajaran: d.mata_pelajaran,
    rows: siswa.sort(function (a, b) { return a.nama_lengkap.localeCompare(b.nama_lengkap); }).map(function (s) {
      var n = idx[s.NIS] || {};
      return { NIS: s.NIS, nama: s.nama_lengkap, foto: s.foto_profil_url, nilai_id: n.nilai_id || '', nilai_harian: n.nilai_harian === undefined ? '' : n.nilai_harian,
        nilai_uts: n.nilai_uts === undefined ? '' : n.nilai_uts, nilai_uas: n.nilai_uas === undefined ? '' : n.nilai_uas, nilai_akhir: n.nilai_akhir === undefined ? '' : n.nilai_akhir,
        predikat: n.predikat || '', catatan: n.catatan || '', diperbarui_pada: n.diperbarui_pada || '' };
    })
  });
}

function apiNilaiSaveBatch(ctx, d) {
  var ta = d.tahun_ajaran || setting_('TAHUN_AJARAN', ''), sem = d.semester || setting_('SEMESTER', '');
  if (!d.kelas_id || !d.mata_pelajaran) return fail_('Kelas dan mata pelajaran wajib dipilih.');
  var sMap = {}; DB.all('Siswa').forEach(function (s) { sMap[s.NIS] = s; });
  var kkm = num_(setting_('KKM', 70), 70), rows = [], remedial = [], terbit = [];
  var lama = {}; DB.all('Nilai').forEach(function (n) { lama[nilaiKey_(n)] = n; });
  for (var i = 0; i < (d.rows || []).length; i++) {
    var r = d.rows[i], s = sMap[String(r.NIS)];
    if (!s) return fail_('Siswa ' + r.NIS + ' tidak ditemukan.');
    var vals = [r.nilai_harian, r.nilai_uts, r.nilai_uas].map(function (v) { return v === '' || v === null || v === undefined ? '' : Number(v); });
    for (var j = 0; j < 3; j++) if (vals[j] !== '' && (isNaN(vals[j]) || vals[j] < 0 || vals[j] > 100)) return fail_('Nilai ' + s.nama_lengkap + ' harus 0–100.');
    var akhir = hitungAkhir_(vals[0], vals[1], vals[2]);
    var row = { NIS: s.NIS, kelas_id: d.kelas_id, mata_pelajaran: d.mata_pelajaran, guru_id: ctx.session.ref, semester: sem, tahun_ajaran: ta,
      nilai_harian: vals[0], nilai_uts: vals[1], nilai_uas: vals[2], nilai_akhir: akhir, predikat: predikat_(akhir), catatan: r.catatan || '', diperbarui_pada: nowIso_() };
    var prev = lama[nilaiKey_(row)];
    if (akhir !== '' && (!prev || String(prev.nilai_akhir) !== String(akhir))) (akhir < kkm ? remedial : terbit).push({ s: s, akhir: akhir });
    rows.push(row);
  }
  var res = DB.upsert('Nilai', nilaiKey_, rows);
  bump_('nilai');
  if (d.kirimNotif) {
    kirimNotifBatch_('NILAI_TERBIT', terbit.map(function (x) { return { penerima: { nama: x.s.nama_lengkap, hp: x.s.no_wa_ortu, email: x.s.email }, vars: { mapel: d.mata_pelajaran, nilai: x.akhir, predikat: predikat_(x.akhir), semester: sem }, refId: x.s.NIS }; }));
    kirimNotifBatch_('REMEDIAL', remedial.map(function (x) { return { penerima: { nama: x.s.nama_lengkap, hp: x.s.no_wa_ortu, email: x.s.email }, vars: { mapel: d.mata_pelajaran, nilai: x.akhir, kkm: kkm }, refId: x.s.NIS }; }));
  }
  return ok_({ inserted: res.inserted, updated: res.updated, rows: res.rows }, 'Nilai ' + rows.length + ' siswa tersimpan ke Sheets.');
}

// ---------------------------------------------------------------------
// G. LAPORAN — ekspor ke Google Sheets (folder SIAKAD_EXPORTS)
// ---------------------------------------------------------------------
function apiLaporanExport(ctx, d) {
  var headers = d.headers || [], rows = d.rows || [];
  if (!headers.length) return fail_('Tidak ada data untuk diekspor.');
  if (rows.length > 20000) return fail_('Data terlalu besar (maks 20.000 baris).');
  var judul = String(d.judul || 'Laporan SIAKAD').substring(0, 90) + ' — ' + Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH.mm');
  var ss = SpreadsheetApp.create(judul);
  DriveApp.getFileById(ss.getId()).moveTo(driveFolder_(CONFIG.EXPORTS_FOLDER));
  var sh = ss.getSheets()[0];
  sh.setName('Laporan');
  var data = [headers].concat(rows.map(function (r) { return headers.map(function (h, i) { var v = Array.isArray(r) ? r[i] : r[h]; return v === undefined || v === null ? '' : v; }); }));
  sh.getRange(1, 1, data.length, headers.length).setValues(data);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1E3A5F').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return ok_({ url: ss.getUrl(), id: ss.getId(), nama: judul }, 'Laporan diekspor ke Google Sheets.');
}

// ---------------------------------------------------------------------
// H. DATA CONTOH (demo) — dipanggil setupAppEnvironment()
// ---------------------------------------------------------------------
function prng_(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }

function seedDemo_() {
  var rnd = prng_(20260928), now = nowIso_(), tdy = today_();
  var ta = setting_('TAHUN_AJARAN', '2026/2027');
  // Semester dibuat mencakup hari ini agar grafik demo selalu terisi
  var mulaiD = new Date(new Date(tdy + 'T00:00:00+07:00').getTime() - 45 * 864e5);
  var selesaiD = new Date(new Date(tdy + 'T00:00:00+07:00').getTime() + 90 * 864e5);
  saveSettings_({ SEMESTER_MULAI: Utilities.formatDate(mulaiD, APP.TZ, 'yyyy-MM-dd'), SEMESTER_SELESAI: Utilities.formatDate(selesaiD, APP.TZ, 'yyyy-MM-dd') });

  var guru = [
    ['19780215', 'Drs. H. Hartono, M.Si.', 'guru@sekolah.sch.id', '081298443210', 'Biologi', 'Wali Kelas XII IPA 1'],
    ['19680512', 'Drs. H. Mulyadi, M.Pd.', 'mulyadi@sekolah.sch.id', '081311223344', 'Matematika', 'Guru'],
    ['19840215', 'Siti Nurhaliza, S.Si., M.Sc.', 'siti.nurhaliza@sekolah.sch.id', '081322334455', 'Fisika', 'Guru'],
    ['19770821', "Ahmad Rifa'i, M.Pd.", 'ahmad.rifai@sekolah.sch.id', '081333445566', 'Kimia', 'Wali Kelas XI IPA 1'],
    ['19891004', 'Elizabeth Watson, M.A.', 'elizabeth.watson@sekolah.sch.id', '081344556677', 'Bahasa Inggris', 'Guru'],
    ['19730419', 'K.H. Zainuddin, S.Ag.', 'zainuddin@sekolah.sch.id', '081355667788', 'Pendidikan Agama & Budi Pekerti', 'Guru'],
    ['19710311', 'Dra. Endang Sulistowati', 'endang@sekolah.sch.id', '081366778899', 'Bahasa Indonesia', 'Wali Kelas X-A']
  ];
  DB.appendBatch('Guru', guru.map(function (g) { return { NUPTK: g[0], nama_lengkap: g[1], email: g[2], no_wa: g[3], mata_pelajaran: g[4], jabatan: g[5], foto_profil_url: '', status: 'Aktif', StatusWA: '', CekWAAt: '', dibuat_pada: now }; }));

  var kelas = [['KLS000001', 'XII IPA 1', 'SMA', 'XII', '19780215'], ['KLS000002', 'XI IPA 1', 'SMA', 'XI', '19770821'], ['KLS000003', 'X-A', 'SMA', 'X', '19710311'], ['KLS000004', 'IX-B', 'SMP', 'IX', ''], ['KLS000005', 'VI-A', 'SD', 'VI', '']];
  DB.appendBatch('Kelas', kelas.map(function (k) { return { kelas_id: k[0], nama_kelas: k[1], jenjang: k[2], tingkat: k[3], wali_kelas_id: k[4], tahun_ajaran: ta }; }));
  setProp_('SEQ_Kelas', '5');

  var mapel = [['Matematika Wajib', 'MAT', 'Wajib'], ['Matematika Peminatan', 'MTP', 'Peminatan'], ['Fisika', 'FIS', 'Peminatan'], ['Kimia', 'KIM', 'Peminatan'], ['Biologi', 'BIO', 'Peminatan'],
    ['Bahasa Indonesia', 'BIN', 'Wajib'], ['Bahasa Inggris', 'BIG', 'Wajib'], ['Pendidikan Agama & Budi Pekerti', 'PAI', 'Wajib'], ['Sejarah Indonesia', 'SEJ', 'Wajib']];
  DB.appendBatch('Mapel', mapel.map(function (m, i) { return { mapel_id: 'MPL' + ('00000' + (i + 1)).slice(-6), nama: m[0], kode: m[1], kelompok: m[2], jenjang: 'SMA' }; }));
  setProp_('SEQ_Mapel', String(mapel.length));

  var depan = ['Ahmad', 'Budi', 'Citra', 'Dewi', 'Dimas', 'Eko', 'Farhan', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oki', 'Putri', 'Rian', 'Siti', 'Taufik', 'Umi', 'Vina', 'Wahyu', 'Yuni', 'Zaki',
    'Aulia', 'Bagus', 'Cahya', 'Dinda', 'Fajar', 'Galih', 'Hana', 'Irfan', 'Jihan', 'Kevin', 'Laila', 'Mega', 'Nabila', 'Olivia', 'Pandu', 'Qori', 'Rizky', 'Salsa', 'Tegar', 'Ulfa', 'Vito', 'Wulan', 'Yoga', 'Zahra', 'Arya'];
  var belakang = ['Fauzi', 'Santoso', 'Lestari', 'Anggraini', 'Bagus', 'Prasetyo', 'Pratama', 'Rahmawati', 'Wijaya', 'Permata', 'Susilo', 'Sari', 'Hakim', 'Safitri', 'Putra', 'Saputra', 'Ayu', 'Pratama', 'Rahma', 'Hidayat',
    'Kalsum', 'Oktaviani', 'Nugroho', 'Kurniasih', 'Ramadhan', 'Azzahra', 'Setiawan', 'Kirana', 'Maharani', 'Nugraha', 'Pamungkas', 'Humaira', 'Maulana', 'Nuraini', 'Wibowo', 'Fitriani', 'Utami', 'Syakira', 'Anjani', 'Wicaksono',
    'Amalia', 'Firmansyah', 'Billa', 'Satria', 'Nisa', 'Alfarizi', 'Handayani', 'Adi', 'Khairunnisa', 'Dwipa'];
  var P = { Citra: 1, Dewi: 1, Gita: 1, Indah: 1, Kartika: 1, Maya: 1, Nanda: 1, Putri: 1, Siti: 1, Umi: 1, Vina: 1, Yuni: 1, Aulia: 1, Cahya: 1, Dinda: 1, Hana: 1, Jihan: 1, Laila: 1, Mega: 1, Nabila: 1, Olivia: 1, Qori: 1, Salsa: 1, Ulfa: 1, Wulan: 1, Zahra: 1 };
  var kota = ['Jakarta', 'Bogor', 'Depok', 'Tangerang', 'Bekasi', 'Bandung'];
  var siswa = [], users = [], nisList = [];
  for (var i = 0; i < 50; i++) {
    var k = i < 20 ? kelas[0] : i < 35 ? kelas[1] : kelas[2];
    var angkatan = k[3] === 'XII' ? '2024' : k[3] === 'XI' ? '2025' : '2026';
    var nis = angkatan + ('0000' + (101 + i)).slice(-4);
    if (i === 0) nis = '20230101';
    var nama = depan[i] + ' ' + belakang[i], jk = P[depan[i]] ? 'P' : 'L';
    var email = i === 0 ? 'siswa@sekolah.sch.id' : slug_(nama) + '@siswa.sch.id';
    var wa = '0812' + ('0000000' + Math.floor(rnd() * 9999999)).slice(-7);
    siswa.push({ NIS: nis, NISN: '00' + ('00000000' + Math.floor(58291048 + i * 7)).slice(-8), nama_lengkap: nama, jenis_kelamin: jk, kelas_id: k[0], jenjang: k[2], barcode_id: 'ID-' + nis,
      email: email, no_wa: '', nama_ortu: (jk === 'L' ? 'Bpk. ' : 'Ibu ') + belakang[(i + 7) % 50] + ' ' + depan[(i + 13) % 50], no_wa_ortu: wa, tempat_lahir: kota[i % kota.length],
      tanggal_lahir: (Number(angkatan) - 15) + '-' + ('0' + (1 + i % 12)).slice(-2) + '-' + ('0' + (1 + (i * 3) % 28)).slice(-2), alamat: 'Jl. Contoh No. ' + (i + 1) + ', ' + kota[i % kota.length],
      foto_profil_url: '', tahun_masuk: angkatan, status: 'Aktif', StatusWA: '', CekWAAt: '', dibuat_pada: now });
    nisList.push(nis);
    var salt = newSalt_();
    users.push({ nama: nama, email: email, password_hash: i === 0 ? hashPassword_(demoPw_('siswa'), salt) : hashPassword_(nis, salt, 1), salt: salt, role: 'siswa', ref_id: nis, kelas_id: k[0],
      status_aktif: i === 6 || i === 41 ? 'TIDAK' : 'YA', wajib_ganti_sandi: i === 0 ? 'TIDAK' : 'YA', last_login: '', dibuat_pada: now });
  }
  siswa[0].nama_lengkap = 'Ahmad Fauzi'; users[0].nama = 'Ahmad Fauzi';
  var hashGuru = hashPassword_(demoPw_('guru'));              // satu hash dipakai bersama akun guru contoh (hemat waktu setup)
  guru.slice().reverse().forEach(function (g) {
    var gi = guru.indexOf(g);
    users.unshift({ nama: g[1], email: g[2], password_hash: hashGuru, salt: '', role: 'guru', ref_id: g[0], kelas_id: '', status_aktif: 'YA', wajib_ganti_sandi: gi === 0 ? 'TIDAK' : 'YA', last_login: '', dibuat_pada: now,
      hak_akses: gi === 6 ? 'keuangan' : '' });
  });
  users.unshift({ nama: 'Super Admin Sekolah', email: 'admin@sekolah.sch.id', password_hash: hashPassword_(demoPw_('sa')), salt: '', role: 'superadmin', ref_id: '', kelas_id: '', status_aktif: 'YA',
    wajib_ganti_sandi: 'TIDAK', last_login: '', dibuat_pada: now, hak_akses: 'keuangan', catatan: 'Akun contoh — ganti sandi atau hapus data contoh' });
  var uids = reserveIds_('Users', users.length);
  users.forEach(function (u, j) { u.user_id = uids[j]; });
  DB.appendBatch('Siswa', siswa);
  DB.appendBatch('Users', users);

  // Jadwal XII IPA 1 & XI IPA 1
  var slot = [['07:15', '08:45'], ['09:00', '10:30'], ['10:45', '12:15'], ['13:00', '14:30']];
  var plan = { KLS000001: [['Matematika Wajib', '19680512', 'R-302'], ['Fisika', '19840215', 'Lab Fisika'], ['Kimia', '19770821', 'Lab Kimia'], ['Bahasa Inggris', '19891004', 'R. Multimedia'], ['Biologi', '19780215', 'Lab Biologi'],
    ['Matematika Peminatan', '19680512', 'R-302'], ['Bahasa Indonesia', '19710311', 'R-302'], ['Pendidikan Agama & Budi Pekerti', '19730419', 'Aula'], ['Sejarah Indonesia', '19710311', 'R-302']],
    KLS000002: [['Kimia', '19770821', 'Lab Kimia'], ['Matematika Wajib', '19680512', 'R-204'], ['Biologi', '19780215', 'Lab Biologi'], ['Bahasa Inggris', '19891004', 'R-204'], ['Fisika', '19840215', 'Lab Fisika']] };
  var jadwal = [], hariList = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  var busy = {};
  Object.keys(plan).forEach(function (kid, ki) {
    var n = 0;
    hariList.forEach(function (h, hi) {
      slot.forEach(function (sl, si) {
        if (si === 3 && hi === 4) return;
        var m = plan[kid][(n + ki) % plan[kid].length];
        var bk = h + sl[0] + m[1], rk = h + sl[0] + m[2];
        if (busy[bk] || busy[rk]) { n++; m = plan[kid][(n + ki) % plan[kid].length]; bk = h + sl[0] + m[1]; rk = h + sl[0] + m[2]; if (busy[bk] || busy[rk]) return; }
        busy[bk] = busy[rk] = 1;
        jadwal.push({ kelas_id: kid, mata_pelajaran: m[0], guru_id: m[1], hari: h, jam_mulai: sl[0], jam_selesai: sl[1], ruang: m[2] });
        n++;
      });
    });
  });
  var jids = reserveIds_('Jadwal', jadwal.length); jadwal.forEach(function (j, x) { j.jadwal_id = jids[x]; });
  DB.appendBatch('Jadwal', jadwal);

  // Absensi 30 hari sekolah terakhir (Senin–Jumat) + sebagian hari ini
  var abs = [], base = new Date(tdy + 'T00:00:00+07:00'), hari = 0, back = 0;
  var bolos = { 4: 0.28, 5: 0.25, 17: 0.3, 33: 0.24, 44: 0.27 };   // beberapa siswa kehadiran < 75%
  while (hari < 30 && back < 60) {
    back++;
    var dd = new Date(base.getTime() - back * 864e5), dow = Number(Utilities.formatDate(dd, APP.TZ, 'u'));
    if (dow > 5) continue;
    hari++;
    var t = Utilities.formatDate(dd, APP.TZ, 'yyyy-MM-dd');
    siswa.forEach(function (s, si) {
      var r = rnd(), pb = bolos[si] || 0.04, st = r < pb * 0.6 ? 'Alpha' : r < pb * 0.8 ? 'Izin' : r < pb ? 'Sakit' : 'Hadir';
      var menit = 6 * 60 + 45 + Math.floor(rnd() * 40), jam = ('0' + Math.floor(menit / 60)).slice(-2) + ':' + ('0' + (menit % 60)).slice(-2) + ':' + ('0' + Math.floor(rnd() * 60)).slice(-2);
      var met = st !== 'Hadir' ? 'manual' : ['barcode', 'barcode', 'barcode', 'selfie', 'lokasi'][Math.floor(rnd() * 5)];
      abs.push({ NIS: s.NIS, kelas_id: s.kelas_id, tanggal: t, jam: st === 'Hadir' ? jam : '07:00:00', status: st, metode: met, latitude: st === 'Hadir' ? '-6.2089' : '', longitude: st === 'Hadir' ? '106.8457' : '',
        jarak_m: st === 'Hadir' ? String(10 + Math.floor(rnd() * 60)) : '', foto_selfie_id: '', keterangan: st === 'Izin' ? 'Acara keluarga' : st === 'Sakit' ? 'Surat dokter' : '', terlambat: st === 'Hadir' && jam.substring(0, 5) > '07:15' ? 'YA' : st === 'Hadir' ? 'TIDAK' : '',
        dicatat_oleh: met === 'barcode' || met === 'manual' ? 'guru@sekolah.sch.id' : s.email, dibuat_pada: t + 'T' + jam + '+07:00' });
    });
  }
  var dowT = Number(Utilities.formatDate(base, APP.TZ, 'u'));
  if (dowT <= 5) {
    siswa.slice(1, 14).forEach(function (s, si) {
      var jam = '07:' + ('0' + (2 + si * 2)).slice(-2) + ':' + ('0' + Math.floor(rnd() * 60)).slice(-2);
      abs.push({ NIS: s.NIS, kelas_id: s.kelas_id, tanggal: tdy, jam: jam, status: si === 9 ? 'Izin' : 'Hadir', metode: si === 9 ? 'manual' : si % 4 === 0 ? 'selfie' : 'barcode', latitude: '-6.2088', longitude: '106.8456', jarak_m: String(20 + si * 3), foto_selfie_id: '',
        keterangan: si === 9 ? 'Surat Dokter.pdf' : '', terlambat: si === 9 ? '' : 'TIDAK', dicatat_oleh: 'guru@sekolah.sch.id', dibuat_pada: tdy + 'T' + jam + '+07:00' });
    });
  }
  var aids = reserveIds_('Absensi', abs.length); abs.forEach(function (a, x) { a.absensi_id = aids[x]; });
  DB.appendBatch('Absensi', abs);

  // Nilai
  var nilai = [];
  var mapelKelas = { KLS000001: mapel.map(function (m) { return m[0]; }), KLS000002: ['Matematika Wajib', 'Fisika', 'Kimia', 'Biologi', 'Bahasa Inggris'], KLS000003: ['Matematika Wajib', 'Bahasa Indonesia', 'Bahasa Inggris'] };
  var guruMapel = { 'Matematika Wajib': '19680512', 'Matematika Peminatan': '19680512', 'Fisika': '19840215', 'Kimia': '19770821', 'Biologi': '19780215', 'Bahasa Indonesia': '19710311', 'Bahasa Inggris': '19891004', 'Pendidikan Agama & Budi Pekerti': '19730419', 'Sejarah Indonesia': '19710311' };
  var sem = setting_('SEMESTER', 'Ganjil');
  siswa.forEach(function (s, si) {
    var bakat = si === 0 ? 88 : si === 2 ? 93 : (si === 4 || si === 6) ? 64 : 72 + Math.floor(rnd() * 20);
    (mapelKelas[s.kelas_id] || []).forEach(function (mp) {
      var v = function () { return Math.max(40, Math.min(100, Math.round(bakat + (rnd() - 0.5) * 14))); };
      var h = v(), u = v(), a = s.kelas_id === 'KLS000003' && mp === 'Bahasa Indonesia' ? '' : v();
      var akhir = hitungAkhir_(h, u, a);
      nilai.push({ NIS: s.NIS, kelas_id: s.kelas_id, mata_pelajaran: mp, guru_id: guruMapel[mp], semester: sem, tahun_ajaran: ta, nilai_harian: h, nilai_uts: u, nilai_uas: a, nilai_akhir: akhir, predikat: predikat_(akhir),
        catatan: akhir !== '' && akhir >= 90 ? 'Pemahaman sangat baik, pertahankan.' : akhir !== '' && akhir < 70 ? 'Perlu remedial KD utama.' : '', diperbarui_pada: now });
    });
  });
  var nids = reserveIds_('Nilai', nilai.length); nilai.forEach(function (n, x) { n.nilai_id = nids[x]; });
  DB.appendBatch('Nilai', nilai);

  // Materi
  var mt = [
    ['Modul Turunan Fungsi Trigonometri Lanjutan & Penerapannya', 'Pembahasan mendalam konsep turunan kedua fungsi trigonometri, grafik kurva kecepatan sesaat, dan latihan soal persiapan ujian.', 'Matematika Peminatan', 'KLS000001', '19680512', 'dokumen', 'demo/modul-trigonometri.pdf', 2457600, ''],
    ['Eksperimen Efek Fotolistrik & Dualisme Gelombang Partikel', 'Video demonstrasi efek fotolistrik, frekuensi ambang logam, dan interpretasi grafik fungsi kerja foton.', 'Fisika', 'KLS000001', '19840215', 'video', 'https://www.youtube.com/embed/6k_sXYgwMeA', '', '45 Menit'],
    ['Tata Nama Senyawa Benzena & Turunannya (Orto, Meta, Para)', 'Struktur cincin aromatik, reaksi substitusi elektrofilik, serta turunan monosubstitusi dan disubstitusi benzena dalam industri.', 'Kimia', 'KLS000001', '19770821', 'dokumen', 'demo/benzena.pdf', 1887436, ''],
    ['Turunan Fungsi Trigonometri — Video Pembahasan', 'Rumus dasar turunan sin, cos, tan beserta contoh soal bertahap.', 'Matematika Peminatan', 'KLS000001', '19680512', 'video', 'https://www.youtube.com/embed/HC6BNJGKoTk', '', '30 Menit'],
    ['Kumpulan Soal & Pembahasan Limit Menuju Tak Hingga', 'Trik cepat metode rasionalisasi akar sekawan, teorema limit fungsi aljabar, dan bank soal evaluasi mandiri semester ganjil.', 'Matematika Wajib', '', '19680512', 'dokumen', 'demo/limit.pdf', 3250585, ''],
    ['Mekanisme Transpor Membran: Difusi, Osmosis & Endositosis', 'Animasi membran bilayer fosfolipid, transpor aktif primer-sekunder melalui pompa natrium-kalium.', 'Biologi', 'KLS000002', '19780215', 'video', 'https://www.youtube.com/embed/w8CmZzmzh6E', '', '20 Menit']
  ];
  var mids = reserveIds_('Materi', mt.length);
  DB.appendBatch('Materi', mt.map(function (m, x) {
    var tgl = Utilities.formatDate(new Date(base.getTime() - (x * 2 + 1) * 864e5), APP.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
    return { materi_id: mids[x], judul: m[0], deskripsi: m[1], mata_pelajaran: m[2], kelas_id: m[3], guru_id: m[4], tipe: m[5], url_konten: m[6], drive_file_id: '', ukuran: m[7], durasi: m[8], tanggal_upload: tgl, status: 'Aktif' };
  }));
  var akses = [];
  siswa.slice(0, 20).forEach(function (s, si) { mids.slice(0, 4).forEach(function (m, x) { if (rnd() < 0.6 && !(si === 0 && x > 1)) akses.push({ materi_id: m, NIS: s.NIS, waktu: now }); }); });
  var akids = reserveIds_('MateriAkses', akses.length); akses.forEach(function (a, x) { a.akses_id = akids[x]; });
  DB.appendBatch('MateriAkses', akses);

  // Pengumuman
  var png = [['Jadwal Penilaian Tengah Semester Dirilis', 'Jadwal pelaksanaan Penilaian Tengah Semester Ganjil telah dirilis. Harap siswa mempersiapkan diri dan membawa kartu pelajar ber-barcode.', 'Akademik', 2],
    ['Pendaftaran Lomba Karya Ilmiah Remaja', 'Pendaftaran kompetisi karya ilmiah remaja dan pameran sains dibuka hingga akhir bulan ini. Hubungi wali kelas masing-masing.', 'Event', 5],
    ['Wajib Aktivasi Akun SIAKAD', 'Seluruh siswa wajib login dan mengganti password awal. Absensi mandiri menggunakan selfie/GPS hanya dapat dilakukan di area sekolah.', 'Informasi', 9]];
  var pids = reserveIds_('Pengumuman', png.length);
  DB.appendBatch('Pengumuman', png.map(function (p, x) { return { pengumuman_id: pids[x], judul: p[0], isi: p[1], kategori: p[2], tanggal: Utilities.formatDate(new Date(base.getTime() - p[3] * 864e5), APP.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"), oleh: 'guru@sekolah.sch.id', status: 'Aktif' }; }));

  seedDemoV21_(rnd, siswa, guru, users, base);
  setProp_('DEMO_SEEDED', '1');
  bump_('master'); bump_('absen'); bump_('nilai'); bump_('tagihan'); bump_('notif');
}

/** Data contoh v2.1: lokasi geofence, presensi guru, jenis biaya, tagihan & pembayaran, notifikasi */
function seedDemoV21_(rnd, siswa, guru, users, base) {
  var now = nowIso_(), tdy = today_(), fmt = function (d) { return Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd'); };
  // Lokasi
  var lok = [['Kampus Utama', 'Sekolah', '-6.2088', '106.8456', '100', 'Jl. Pendidikan No. 1', 'Semua'], ['Gedung Olahraga', 'Sekolah', '-6.2104', '106.8471', '80', 'Kompleks GOR', 'Semua'],
    ['Kantor Yayasan', 'Kantor', '-6.2150', '106.8502', '60', 'Jl. Yayasan No. 7', 'Guru']];
  var lids = reserveIds_('Lokasi', lok.length);
  DB.appendBatch('Lokasi', lok.map(function (l, i) { return { lokasi_id: lids[i], nama: l[0], tipe: l[1], latitude: l[2], longitude: l[3], radius_m: l[4], alamat: l[5], berlaku: l[6], aktif: 'YA', dibuat_oleh: 'seed', diperbarui_pada: now }; }));
  // Presensi guru 10 hari sekolah terakhir + sebagian hari ini
  var uidGuru = {}; users.forEach(function (u) { if (u.role === 'guru') uidGuru[u.ref_id] = u.user_id; });
  var pres = [], hari = 0, back = 0;
  var jamStr = function (m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2) + ':' + ('0' + Math.floor(rnd() * 60)).slice(-2); };
  while (hari < 10 && back < 25) {
    back++;
    var dd = new Date(base.getTime() - back * 864e5); if (Number(Utilities.formatDate(dd, APP.TZ, 'u')) > 5) continue;
    hari++;
    guru.forEach(function (g) {
      if (rnd() < 0.08) return;
      var m = 6 * 60 + 35 + Math.floor(rnd() * 40), mp = 15 * 60 + Math.floor(rnd() * 60), jm = jamStr(m);
      pres.push({ user_id: uidGuru[g[0]], NUPTK: g[0], nama: g[1], tanggal: fmt(dd), jam_masuk: jm, jam_pulang: jamStr(mp), status: 'Hadir', lokasi_id: rnd() < 0.85 ? lids[0] : lids[2], latitude: '-6.2089', longitude: '106.8457',
        jarak_m: String(5 + Math.floor(rnd() * 60)), foto_id: '', terlambat: jm.substring(0, 5) > '07:00' ? 'YA' : 'TIDAK', device_id: '', keterangan: '', diperbarui_pada: now });
    });
  }
  if (Number(Utilities.formatDate(base, APP.TZ, 'u')) <= 5) {
    guru.slice(1, 5).forEach(function (g, i) {
      var jm = jamStr(6 * 60 + 40 + i * 7);
      pres.push({ user_id: uidGuru[g[0]], NUPTK: g[0], nama: g[1], tanggal: tdy, jam_masuk: jm, jam_pulang: '', status: 'Hadir', lokasi_id: lids[0], latitude: '-6.2088', longitude: '106.8456', jarak_m: String(12 + i * 9),
        foto_id: '', terlambat: jm.substring(0, 5) > '07:00' ? 'YA' : 'TIDAK', device_id: '', keterangan: '', diperbarui_pada: now });
    });
  }
  var prids = reserveIds_('PresensiGuru', pres.length); pres.forEach(function (p, i) { p.presensi_id = prids[i]; });
  DB.appendBatch('PresensiGuru', pres);
  // Jenis biaya (custom)
  var jtPangkal = fmt(new Date(base.getTime() + 30 * 864e5));
  var biaya = [
    { kode: 'SPP', nama: 'SPP', jenis: 'Bulanan', nominal: 350000, nominal_khusus: JSON.stringify({ 'KELAS:KLS000001': 400000, 'JENJANG:SMP': 250000, 'JENJANG:SD': 150000 }), jatuh_tempo_tgl: '10', jatuh_tempo: '', keterangan: 'Sumbangan Pembinaan Pendidikan bulanan' },
    { kode: 'MAKAN', nama: 'Uang Makan Siang', jenis: 'Bulanan', nominal: 300000, nominal_khusus: '{}', jatuh_tempo_tgl: '5', jatuh_tempo: '', keterangan: 'Opsional, hanya siswa yang mendaftar katering' },
    { kode: 'PANGKAL', nama: 'Uang Pangkal', jenis: 'Sekali', nominal: 2500000, nominal_khusus: '{}', jatuh_tempo_tgl: '', jatuh_tempo: jtPangkal, keterangan: 'Siswa baru angkatan ' + tdy.substring(0, 4) },
    { kode: 'TOUR', nama: 'Study Tour Yogyakarta', jenis: 'Sekali', nominal: 750000, nominal_khusus: '{}', jatuh_tempo_tgl: '', jatuh_tempo: jtPangkal, keterangan: 'Kelas XI' }
  ];
  var bids = reserveIds_('Biaya', biaya.length);
  DB.appendBatch('Biaya', biaya.map(function (b, i) { return Object.assign({ biaya_id: bids[i], aktif: 'YA', dibuat_pada: now }, b); }));
  // Potongan: beasiswa prestasi 50% SPP (siswa ke-3), gratis SPP (siswa ke-11)
  var saUid = users.filter(function (u) { return u.role === 'superadmin'; })[0].user_id;
  var potRows = [{ NIS: siswa[2].NIS, Tipe: 'Persen', Nilai: 50, Berlaku: 'KODE:SPP', Mulai: '', Sampai: '', Alasan: 'Beasiswa Prestasi', Aktif: 'YA', DibuatOleh: saUid, DibuatPada: now },
    { NIS: siswa[10].NIS, Tipe: 'Gratis', Nilai: 100, Berlaku: 'KODE:SPP', Mulai: '', Sampai: '', Alasan: 'Beasiswa Yatim', Aktif: 'YA', DibuatOleh: saUid, DibuatPada: now }];
  var poids = reserveIds_('PotonganTagihan', potRows.length); potRows.forEach(function (p, i) { p.PotonganID = poids[i]; });
  DB.appendBatch('PotonganTagihan', potRows);
  // Tagihan SPP 4 bulan (3 bulan lalu s.d. bulan ini)
  var bulan = [], d0 = new Date(tdy.substring(0, 7) + '-15T12:00:00+07:00');
  for (var b = 3; b >= 0; b--) { var x = new Date(d0.getTime()); x.setUTCMonth(x.getUTCMonth() - b); bulan.push(Utilities.formatDate(x, APP.TZ, 'yyyy-MM')); }
  var tg = [], byr = [], seq = 0, th = tdy.substring(0, 4), kwPrefix = setting_('KWITANSI_PREFIX', 'KW'), bayarTunggu = [];
  var harga = function (s) { return s.kelas_id === 'KLS000001' ? 400000 : s.jenjang === 'SMP' ? 250000 : s.jenjang === 'SD' ? 150000 : 350000; };
  siswa.forEach(function (s, si) {
    bulan.forEach(function (per, bi) {
      var asal = harga(s), pot = si === 2 ? asal / 2 : si === 10 ? asal : 0, jml = asal - pot, jt = per + '-10', lewat = jt < tdy, kini = bi === bulan.length - 1;
      var status = jml === 0 ? 'Gratis' : (si === 0 ? (bi < 2 ? 'Lunas' : (lewat ? 'Terlambat' : 'Belum Bayar')) : si === 3 && bi >= 2 ? 'Menunggu Verifikasi' : si === 8 && kini ? 'Menunggu Verifikasi'
        : (!kini && rnd() < 0.86) || (kini && rnd() < 0.4) ? 'Lunas' : (lewat ? 'Terlambat' : 'Belum Bayar'));
      var t = { NIS: s.NIS, Jenis: 'Bulanan', BiayaKode: 'SPP', Periode: per, KodeTagihan: 'SPP-' + per, NamaTagihan: 'SPP ' + tgLabel_(per), JumlahAsal: asal, Potongan: pot, Jumlah: jml,
        AlasanPotongan: si === 2 ? 'Beasiswa Prestasi' : si === 10 ? 'Beasiswa Yatim' : '', Status: status, TanggalTerbit: per + '-01', JatuhTempo: jt, TanggalLunas: '', DiterbitkanOleh: saUid, Keterangan: '', kelas_id: s.kelas_id };
      if (status === 'Gratis') t.TanggalLunas = per + '-01';
      tg.push(t);
    });
  });
  // Uang pangkal untuk kelas X-A
  siswa.filter(function (s) { return s.kelas_id === 'KLS000003'; }).forEach(function (s, i) {
    tg.push({ NIS: s.NIS, Jenis: 'Sekali', BiayaKode: 'PANGKAL', Periode: '', KodeTagihan: 'PANGKAL', NamaTagihan: 'Uang Pangkal', JumlahAsal: 2500000, Potongan: 0, Jumlah: 2500000, AlasanPotongan: '',
      Status: i < 5 ? 'Lunas' : 'Belum Bayar', TanggalTerbit: fmt(new Date(base.getTime() - 20 * 864e5)), JatuhTempo: jtPangkal, TanggalLunas: '', DiterbitkanOleh: saUid, Keterangan: '', kelas_id: s.kelas_id });
  });
  var tids = reserveIds_('Tagihan', tg.length); tg.forEach(function (t, i) { t.TagihanID = tids[i]; });
  // Pembayaran untuk Lunas (1 kwitansi per tagihan) & Menunggu (bukti contoh)
  tg.forEach(function (t) {
    if (t.Status === 'Lunas') {
      seq++;
      var tglBayar = t.Jenis === 'Bulanan' ? t.Periode + '-0' + (2 + Math.floor(rnd() * 7)) : fmt(new Date(base.getTime() - (3 + Math.floor(rnd() * 10)) * 864e5));
      if (tglBayar > tdy) tglBayar = tdy;
      t.TanggalLunas = tglBayar;
      byr.push({ TagihanID: t.TagihanID, NIS: t.NIS, Jumlah: t.Jumlah, Metode: rnd() < 0.7 ? 'Transfer' : 'Tunai', NoReferensi: rnd() < 0.7 ? 'TRX' + Math.floor(100000 + rnd() * 899999) : '', BuktiID: '', Status: 'Terverifikasi',
        TanggalBayar: tglBayar, VerifiedBy: saUid, VerifiedAt: tglBayar + 'T10:00:00+07:00', Catatan: '', GrupBayar: '', NoKwitansi: kwPrefix + '-' + th + '-' + ('00000' + seq).slice(-6) });
    } else if (t.Status === 'Menunggu Verifikasi') bayarTunggu.push(t);
  });
  var perNis = {}; bayarTunggu.forEach(function (t) { (perNis[t.NIS] = perNis[t.NIS] || []).push(t); });
  Object.keys(perNis).forEach(function (nis) {
    var ts = perNis[nis], total = ts.reduce(function (a, t) { return a + t.Jumlah; }, 0), s = siswa.filter(function (x) { return x.NIS === nis; })[0];
    var svg = buktiContohSvg_(s.nama_lengkap, total, tdy), f = null;
    try { f = shareLink_(saveBase64File_(CONFIG.BUKTI_FOLDER, nis + '_bukti_contoh.svg', 'image/svg+xml', Utilities.base64Encode(svg, Utilities.Charset.UTF_8))); } catch (e) {}
    ts.forEach(function (t, i) {
      byr.push({ TagihanID: t.TagihanID, NIS: nis, Jumlah: t.Jumlah, Metode: 'Transfer', NoReferensi: 'TRX' + Math.floor(100000 + rnd() * 899999), BuktiID: f ? f.getId() : '', Status: 'Menunggu',
        TanggalBayar: tdy, VerifiedBy: '', VerifiedAt: '', Catatan: 'Transfer dari rekening orang tua', GrupBayar: ts.length > 1 ? '#G' : '', NoKwitansi: '' });
    });
  });
  var pyids = reserveIds_('Pembayaran', byr.length), grupId = {};
  byr.forEach(function (b, i) { b.PembayaranID = pyids[i]; if (b.GrupBayar === '#G') { b.GrupBayar = grupId[b.NIS] || (grupId[b.NIS] = b.PembayaranID); } });
  DB.appendBatch('Tagihan', tg);
  DB.appendBatch('Pembayaran', byr);
  setProp_('SEQ_KWITANSI_' + th, String(seq));
  // Notifikasi in-app contoh untuk siswa pertama
  var uSiswa0 = users.filter(function (u) { return u.role === 'siswa' && u.ref_id === siswa[0].NIS; })[0];
  if (uSiswa0) notifApp_([{ user_id: uSiswa0.user_id, judul: 'Tagihan Baru: SPP ' + tgLabel_(bulan[3]), pesan: 'Tagihan SPP ' + tgLabel_(bulan[3]) + ' sebesar ' + tgRp_(harga(siswa[0])) + ' telah terbit.', tipe: 'tagihan', link: 'tagihan' },
    { user_id: uSiswa0.user_id, judul: 'Materi baru tersedia', pesan: 'Modul Turunan Fungsi Trigonometri sudah bisa dibaca.', tipe: 'info', link: 'materi' }]);
}
function buktiContohSvg_(nama, total, tgl) {
  var rp = 'Rp ' + String(total).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640"><rect width="480" height="640" fill="#f8fafc"/><rect x="24" y="24" width="432" height="592" rx="18" fill="#fff" stroke="#e2e8f0"/>' +
    '<rect x="24" y="24" width="432" height="96" rx="18" fill="#1E3A5F"/><text x="240" y="70" font-family="Arial" font-size="22" font-weight="700" fill="#fff" text-anchor="middle">BUKTI TRANSFER</text>' +
    '<text x="240" y="98" font-family="Arial" font-size="13" fill="#F5A623" text-anchor="middle">Contoh — Mode Demo SIAKAD</text>' +
    '<circle cx="240" cy="190" r="38" fill="#dcfce7"/><path d="M222 190l12 12 24-26" stroke="#16a34a" stroke-width="7" fill="none" stroke-linecap="round"/>' +
    '<text x="240" y="268" font-family="Arial" font-size="15" fill="#64748b" text-anchor="middle">Transfer Berhasil</text><text x="240" y="310" font-family="Arial" font-size="32" font-weight="700" fill="#0f172a" text-anchor="middle">' + rp + '</text>' +
    '<g font-family="Arial" font-size="14" fill="#334155"><text x="56" y="380">Tanggal</text><text x="424" y="380" text-anchor="end">' + tgl + '</text><text x="56" y="420">Dari</text><text x="424" y="420" text-anchor="end">Orang tua ' + String(nama).replace(/[<&]/g, '') + '</text>' +
    '<text x="56" y="460">Ke</text><text x="424" y="460" text-anchor="end">Rekening Sekolah</text><text x="56" y="500">Berita</text><text x="424" y="500" text-anchor="end">SPP</text></g>' +
    '<line x1="56" y1="540" x2="424" y2="540" stroke="#e2e8f0" stroke-dasharray="6 6"/><text x="240" y="580" font-family="Arial" font-size="12" fill="#94a3b8" text-anchor="middle">Dokumen ini hanya ilustrasi data contoh</text></svg>';
}

/** Hapus data contoh; semua akun Super Admin (dan data guru miliknya) dipertahankan */
function apiDemoClear(ctx, d) {
  var keepUsers = DB.all('Users').filter(function (u) { return u.role === 'superadmin' || u.user_id === ctx.session.uid; });
  var keepRef = {}; keepUsers.forEach(function (u) { if (u.ref_id) keepRef[String(u.ref_id)] = 1; });
  ['Siswa', 'Absensi', 'Nilai', 'Materi', 'MateriAkses', 'Jadwal', 'Pengumuman', 'CRM_Kontak', 'CRM_Interaksi', 'AntrianNotif', 'BlastWA',
    'Tagihan', 'Pembayaran', 'PotonganTagihan', 'ReminderLog', 'PresensiGuru', 'Notifikasi', 'Biaya'].forEach(function (name) {
    var sh = getSheet_(name), last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
    invalidateRows_(name);
  });
  var keepGuru = DB.all('Guru').filter(function (g) { return keepRef[String(g.NUPTK)]; });
  var shG = getSheet_('Guru'); if (shG.getLastRow() > 1) shG.getRange(2, 1, shG.getLastRow() - 1, shG.getLastColumn()).clearContent(); invalidateRows_('Guru');
  DB.appendBatch('Guru', keepGuru);
  var shU = getSheet_('Users'); if (shU.getLastRow() > 1) shU.getRange(2, 1, shU.getLastRow() - 1, shU.getLastColumn()).clearContent(); invalidateRows_('Users');
  DB.appendBatch('Users', keepUsers.map(function (u) { var o = Object.assign({}, u); delete o.password_hash; delete o.salt; return o; }));
  bump_('akun');
  bersihkanPwYatim_();
  if (d.hapusKelas) {
    ['Kelas', 'Mapel'].forEach(function (n) { var sh = getSheet_(n); if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent(); invalidateRows_(n); });
  }
  setProps_({ DEMO_SEEDED: '0', ANTRIAN_MULAI: '2', ANTRIAN_ADA: '0' });
  CacheX.remove('nq');
  bump_('master'); bump_('absen'); bump_('nilai'); bump_('tagihan'); bump_('notif');
  return ok_(null, 'Data contoh dihapus. Sistem siap diisi data sekolah Anda.');
}

;
// ==== Admin.gs ====
/**
 * =====================================================================
 *  SIAKAD SISWA v2.1 — File 3/7 : Admin.gs
 *  • Reset Super Admin dari editor Apps Script (resetSuperAdmin)
 *  • Kelola akun guru & siswa, monitoring guru & siswa, pengguna online
 *  • Geofencing multi-lokasi + kunci perangkat per akun
 *  • Presensi guru (masuk/pulang) berbasis GPS
 *  • Rahasia pihak ketiga ber-allowlist (respons tersamar)
 *  • Notifikasi in-app (lonceng)
 * =====================================================================
 */

// ---------------------------------------------------------------------
// A. RESET SUPER ADMIN — jalankan dari editor: pilih fungsi resetSuperAdmin ▶ Jalankan
// ---------------------------------------------------------------------
/** Opsional: isi email untuk memulihkan / menjadikan akun tertentu sebagai Super Admin.
 *  Kosong = reset Super Admin pertama (atau buat baru bila belum ada). Jangan isi sandi di sini. */
var RESET_SA_EMAIL = '';

function resetSuperAdmin() {
  resetMemo_();
  if (!prop_('SPREADSHEET_ID')) { Logger.log('⚠️ Server belum di-setup. Jalankan setupAppEnvironment() dulu.'); return; }
  var email = lower_(RESET_SA_EMAIL), users = DB.all('Users'), target = null;
  if (email) {
    if (!emailValid_(email)) { Logger.log('⚠️ RESET_SA_EMAIL tidak valid: ' + email); return; }
    target = users.filter(function (u) { return lower_(u.email) === email; })[0] || null;
    if (target && target.role === 'siswa') { Logger.log('⛔ ' + email + ' adalah akun siswa — tidak bisa dijadikan Super Admin.'); return; }
  } else target = users.filter(function (u) { return u.role === 'superadmin'; })[0] || null;
  var sandi = sandiAcak_(14), hasil = null;
  withLock_(function () {
    if (!target) {
      var e = email || emailSuperAdminBaru_();
      var uid = reserveIds_('Users', 1)[0];
      DB.appendBatch('Users', [{ user_id: uid, nama: 'Super Admin', email: e, role: 'superadmin', ref_id: '', kelas_id: '', status_aktif: 'YA', wajib_ganti_sandi: 'YA', last_login: '', dibuat_pada: nowIso_(), hak_akses: 'keuangan', catatan: 'Dibuat oleh resetSuperAdmin()' }]);
      hasil = { uid: uid, email: e, baru: true };
    } else {
      DB.updateBatch('Users', 'user_id', [{ user_id: target.user_id, role: 'superadmin', status_aktif: 'YA', wajib_ganti_sandi: 'YA' }]);
      hasil = { uid: target.user_id, email: lower_(target.email), baru: false, dari: target.role };
    }
    pwSimpan_(hasil.uid, sandi);
    delProp_('SA_KUNCI_' + hasil.uid);
    revokeAll_(hasil.email);
    bump_('akun'); bump_('master'); bump_('adm');
    queueLog_(['editor-apps-script', 'superadmin', 'RESET_SUPERADMIN', hasil.email + (hasil.baru ? ' (baru)' : ''), '']);   // tanpa sandi
    return ok_();
  });
  if (!hasil) { Logger.log('⚠️ Server sibuk, coba jalankan lagi.'); return; }
  Logger.log('👑 SUPER ADMIN ' + (hasil.baru ? 'BARU DIBUAT' : 'DIRESET') + (hasil.dari && hasil.dari !== 'superadmin' ? ' (sebelumnya ' + hasil.dari + ')' : ''));
  Logger.log('   Email : ' + hasil.email);
  Logger.log('   Sandi : ' + sandi);
  Logger.log('   ⚠️ Catat sekarang — sandi hanya tampil SEKALI. Wajib diganti saat login. Semua sesi lama akun ini dikeluarkan.');
}
/** Keluarkan semua orang (rotasi secret sesi) — dari editor */
function rotasiSecretSesi() { setProp_('TOKEN_SECRET', acak_(64)); Logger.log('✅ Secret sesi dirotasi — semua pengguna harus login ulang.'); }

function emailSuperAdminBaru_() {
  var dom = '';
  DB.all('Guru').some(function (g) { var m = String(g.email || '').match(/@(.+)$/); if (m) { dom = m[1]; return true; } return false; });
  dom = dom || 'sekolah.sch.id';
  var dipakai = {}; DB.all('Users').forEach(function (u) { dipakai[lower_(u.email)] = 1; });
  var e = 'superadmin@' + dom, i = 2;
  while (dipakai[e]) { e = 'superadmin' + i + '@' + dom; i++; }
  return e;
}
/** Dipanggil setupV21: bila belum ada Super Admin, buat satu (sandi acak, tampil sekali di log) */
function ensureSuperAdmin_() {
  if (DB.all('Users').some(function (u) { return u.role === 'superadmin'; })) return null;
  var e = emailSuperAdminBaru_(), pw = sandiAcak_(14), uid;
  withLock_(function () {
    uid = reserveIds_('Users', 1)[0];
    DB.appendBatch('Users', [{ user_id: uid, nama: 'Super Admin', email: e, role: 'superadmin', ref_id: '', kelas_id: '', status_aktif: 'YA', wajib_ganti_sandi: 'YA', last_login: '', dibuat_pada: nowIso_(), hak_akses: 'keuangan', catatan: 'Dibuat oleh setupV21()' }]);
    pwSimpan_(uid, pw);
    return ok_();
  });
  return { email: e, password: pw };
}

// ---------------------------------------------------------------------
// B. GEOFENCING MULTI-LOKASI
// ---------------------------------------------------------------------
var _LOK = null;
/** Lokasi aktif (cache berversi 'master'). Sheet kosong → titik bawaan dari Pengaturan. */
function lokasiAktif_() {
  if (_LOK) return _LOK;
  return (_LOK = cached_('lok_' + ver_('master'), 3600, function () {
    var rows = DB.all('Lokasi').filter(function (l) { return String(l.aktif || 'YA').toUpperCase() !== 'TIDAK' && l.latitude !== '' && l.longitude !== ''; })
      .map(function (l) { return { lokasi_id: l.lokasi_id, nama: l.nama, tipe: l.tipe || 'Sekolah', latitude: num_(l.latitude), longitude: num_(l.longitude), radius_m: num_(l.radius_m, 100) || 100, alamat: l.alamat || '', berlaku: l.berlaku || 'Semua' }; });
    if (!rows.length) rows = [{ lokasi_id: 'DEFAULT', nama: setting_('NAMA_SEKOLAH', 'Sekolah'), tipe: 'Sekolah', latitude: num_(setting_('LAT_SEKOLAH', 0)), longitude: num_(setting_('LNG_SEKOLAH', 0)), radius_m: num_(setting_('RADIUS_M', 100), 100), alamat: setting_('ALAMAT_SEKOLAH', ''), berlaku: 'Semua', bawaan: true }];
    return rows;
  }));
}
/** Lokasi yang berlaku untuk peran & akun (lokasi_ids per akun; kosong = semua) */
function lokasiUntuk_(peran, user) {
  var P = peran === 'siswa' ? 'Siswa' : 'Guru';
  var semua = lokasiAktif_().filter(function (l) { return l.berlaku === 'Semua' || l.berlaku === P; });
  var ids = String((user && user.l) || '').split(',').map(function (x) { return x.trim(); }).filter(String);
  if (!ids.length) return semua;
  var pilih = semua.filter(function (l) { return ids.indexOf(l.lokasi_id) > -1; });
  return pilih.length ? pilih : semua;
}
/** Cek posisi terhadap lokasi terdekat yang diizinkan. opt = { peran, user, acc } */
function cekLokasi_(lat, lng, opt) {
  opt = opt || {};
  var la = Number(lat), lo = Number(lng);
  if (lat === undefined || lat === null || lat === '' || lng === '' || lng === undefined || isNaN(la) || isNaN(lo)) return { ok: false, jarak: null, msg: 'Lokasi GPS belum terbaca. Aktifkan izin lokasi di browser.' };
  var daftar = lokasiUntuk_(opt.peran || 'siswa', opt.user);
  if (!daftar.length) return { ok: false, jarak: null, msg: 'Belum ada lokasi absensi untuk akun Anda. Hubungi Super Admin.' };
  var tol = Math.min(Math.max(num_(opt.acc, 0), 0), num_(setting_('GPS_TOLERANSI_M', 15), 15));
  var semua = daftar.map(function (l) { var j = Math.round(haversine_(la, lo, l.latitude, l.longitude)); return { lokasi_id: l.lokasi_id, nama: l.nama, jarak: j, radius: l.radius_m, selisih: j - l.radius_m }; })
    .sort(function (a, b) { return a.selisih - b.selisih; });
  var b = semua[0], ok = b.jarak <= b.radius + tol;
  return { ok: ok, jarak: b.jarak, radius: b.radius, lokasi_id: b.lokasi_id, nama: b.nama, toleransi: tol, semua: semua.slice(0, 5),
    msg: ok ? 'Dalam radius ' + b.nama + ' (' + b.jarak + ' m)' : 'Lokasi tidak sesuai area sekolah (' + b.jarak + ' m dari ' + b.nama + ', maks ' + b.radius + ' m).' };
}
/** Buat 1 lokasi dari LAT/LNG sekolah bila sheet Lokasi masih kosong (setupV21) */
function lokasiBawaan_() {
  if (DB.all('Lokasi').length) return '';
  var nama = setting_('NAMA_SEKOLAH', 'Sekolah');
  withLock_(function () {
    DB.appendBatch('Lokasi', [{ lokasi_id: reserveIds_('Lokasi', 1)[0], nama: nama, tipe: 'Sekolah', latitude: setting_('LAT_SEKOLAH', '-6.2088'), longitude: setting_('LNG_SEKOLAH', '106.8456'),
      radius_m: setting_('RADIUS_M', '100'), alamat: setting_('ALAMAT_SEKOLAH', ''), berlaku: 'Semua', aktif: 'YA', dibuat_oleh: 'setupV21', diperbarui_pada: nowIso_() }]);
    bump_('master');
    return ok_();
  });
  return nama;
}

function apiLokasiList(ctx, d) {
  var pakai = {};
  DB.all('Users').forEach(function (u) { String(u.lokasi_ids || '').split(',').forEach(function (id) { id = id.trim(); if (id) pakai[id] = (pakai[id] || 0) + 1; }); });
  return ok_({ rows: DB.all('Lokasi').map(function (l) { return Object.assign({}, l, { akun: pakai[l.lokasi_id] || 0 }); }), bawaan: lokasiAktif_()[0].bawaan ? lokasiAktif_()[0] : null,
    toleransi: num_(setting_('GPS_TOLERANSI_M', 15), 15), kunciPerangkat: setting_('KUNCI_PERANGKAT', 'TIDAK') === 'YA' });
}
function apiLokasiSave(ctx, d) {
  var x = d.row || {}, isNew = !x.lokasi_id;
  if (!String(x.nama || '').trim()) return fail_('Nama lokasi wajib diisi (contoh: Kampus Utama, Kantor Yayasan).');
  var la = Number(x.latitude), lo = Number(x.longitude), r = Number(x.radius_m);
  if (x.latitude === '' || isNaN(la) || Math.abs(la) > 90) return fail_('Latitude tidak valid.');
  if (x.longitude === '' || isNaN(lo) || Math.abs(lo) > 180) return fail_('Longitude tidak valid.');
  if (!(r >= 10 && r <= 5000)) return fail_('Radius harus 10–5000 meter.');
  var berlaku = ['Semua', 'Siswa', 'Guru'].indexOf(x.berlaku) > -1 ? x.berlaku : 'Semua';
  var row = { nama: String(x.nama).trim().substring(0, 80), tipe: x.tipe || 'Sekolah', latitude: String(Math.round(la * 1e6) / 1e6), longitude: String(Math.round(lo * 1e6) / 1e6), radius_m: String(Math.round(r)),
    alamat: String(x.alamat || '').substring(0, 200), berlaku: berlaku, aktif: String(x.aktif || 'YA').toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA', diperbarui_pada: nowIso_() };
  if (isNew) { row.lokasi_id = reserveIds_('Lokasi', 1)[0]; row.dibuat_oleh = ctx.session.email; DB.appendBatch('Lokasi', [row]); }
  else { if (!DB.find('Lokasi', 'lokasi_id', x.lokasi_id)) return fail_('Lokasi tidak ditemukan.'); row.lokasi_id = x.lokasi_id; DB.updateBatch('Lokasi', 'lokasi_id', [row]); }
  bump_('master');
  return ok_(row, isNew ? 'Lokasi ' + row.nama + ' ditambahkan.' : 'Lokasi diperbarui.');
}
function apiLokasiDelete(ctx, d) {
  var l = DB.find('Lokasi', 'lokasi_id', d.lokasi_id);
  if (!l) return fail_('Lokasi tidak ditemukan.');
  DB.deleteWhere('Lokasi', 'lokasi_id', [l.lokasi_id]);
  var up = DB.all('Users').filter(function (u) { return String(u.lokasi_ids || '').split(',').indexOf(l.lokasi_id) > -1; })
    .map(function (u) { return { user_id: u.user_id, lokasi_ids: String(u.lokasi_ids).split(',').filter(function (x) { return x && x !== l.lokasi_id; }).join(',') }; });
  DB.updateBatch('Users', 'user_id', up);
  bump_('master');
  return ok_({ akunDiperbarui: up.length }, 'Lokasi ' + l.nama + ' dihapus.' + (up.length ? ' ' + up.length + ' akun kembali memakai semua lokasi.' : ''));
}

/** Info geofence & perangkat untuk akun yang login (dipakai bootstrap & halaman Akun) */
function lokasiInfo_(ctx) {
  var u = ctx.user || {}, kunci = setting_('KUNCI_PERANGKAT', 'TIDAK') === 'YA';
  var peran = ctx.session && ctx.session.role === 'siswa' ? 'siswa' : 'guru';
  return {
    lokasi: lokasiUntuk_(peran, u).map(function (l) { return { lokasi_id: l.lokasi_id, nama: l.nama, tipe: l.tipe, latitude: l.latitude, longitude: l.longitude, radius_m: l.radius_m, alamat: l.alamat }; }),
    khusus: !!String(u.l || '').trim(),
    toleransi: num_(setting_('GPS_TOLERANSI_M', 15), 15),
    kunciPerangkat: kunci,
    perangkat: { terdaftar: !!u.d, cocok: !!u.d && !!ctx.dev && u.d === ctx.dev, perluDaftar: kunci && !u.d }
  };
}
function apiLokasiSaya(ctx, d) { return ok_(lokasiInfo_(ctx)); }

/** Kunci perangkat: perangkat pertama yang absen otomatis terdaftar; berbeda → ditolak */
function cekPerangkat_(ctx, info) {
  var dev = ctx.dev, u = ctx.user || {};
  if (setting_('KUNCI_PERANGKAT', 'TIDAK') !== 'YA') return { ok: true, dev: dev };
  if (!dev) return { ok: false, msg: 'Perangkat tidak dikenali. Muat ulang aplikasi lalu coba lagi.' };
  if (!u.d) {
    DB.updateBatch('Users', 'user_id', [{ user_id: ctx.session.uid, device_id: dev, device_info: String(info || '').substring(0, 120) + ' · ' + nowIso_().substring(0, 10) }]);
    u.d = dev;
    return { ok: true, dev: dev, baru: true };
  }
  if (u.d !== dev) return { ok: false, msg: 'Absensi hanya bisa dari perangkat yang terdaftar untuk akun Anda. Berganti HP? Minta Super Admin mereset perangkat.' };
  return { ok: true, dev: dev };
}
function apiPerangkatDaftar(ctx, d) {
  var u = ctx.user || {};
  if (!ctx.dev) return fail_('Perangkat tidak dikenali. Muat ulang aplikasi lalu coba lagi.');
  if (u.d && u.d === ctx.dev) return ok_(lokasiInfo_(ctx), 'Perangkat ini sudah terdaftar.');
  if (u.d && u.d !== ctx.dev) return fail_('Akun Anda sudah terdaftar di perangkat lain. Minta Super Admin mereset perangkat terlebih dahulu.', { code: 'DEVICE' });
  DB.updateBatch('Users', 'user_id', [{ user_id: ctx.session.uid, device_id: ctx.dev, device_info: String(d.device_info || '').substring(0, 120) + ' · ' + nowIso_().substring(0, 10) }]);
  u.d = ctx.dev;
  return ok_(lokasiInfo_(ctx), 'Perangkat ini berhasil didaftarkan untuk absensi.');
}

// ---------------------------------------------------------------------
// C. PRESENSI GURU (masuk / pulang) — geofence + kunci perangkat
// ---------------------------------------------------------------------
function guruDariCtx_(ctx) { return ctx.session.ref ? DB.find('Guru', 'NUPTK', ctx.session.ref) : null; }
function presensiHariIni_(uid) {
  var tdy = today_();
  return DB.all('PresensiGuru').filter(function (p) { return p.user_id === uid && String(p.tanggal) === tdy; })[0] || null;
}
function apiPresensiGuru(ctx, d) {
  var g = guruDariCtx_(ctx);
  if (!g) return fail_('Akun Anda belum terhubung ke data guru (NUPTK). Hubungi Super Admin.');
  var jenis = d.jenis === 'pulang' ? 'pulang' : 'masuk';
  var dev = cekPerangkat_(ctx, d.device_info);
  if (!dev.ok) return fail_(dev.msg, { code: 'DEVICE' });
  var lok = cekLokasi_(d.lat, d.lng, { peran: 'guru', user: ctx.user, acc: d.acc });
  if (!lok.ok) return fail_(lok.msg, { code: 'OUT_OF_RANGE', jarak: lok.jarak, lokasi: lok.nama });
  var tdy = today_(), jam = timeNow_(), ada = presensiHariIni_(ctx.session.uid);
  var fotoId = '';
  if (d.foto) {
    if (String(d.foto).length > 3 * 1024 * 1024) return fail_('Ukuran foto terlalu besar.');
    fotoId = saveBase64File_(CONFIG.SELFIE_FOLDER, 'GURU_' + g.NUPTK + '_' + tdy.replace(/-/g, '') + '_' + jam.replace(/:/g, '') + '.jpg', 'image/jpeg', d.foto).getId();
  } else if (jenis === 'masuk' && setting_('PRESENSI_GURU_SELFIE', 'TIDAK') === 'YA') return fail_('Presensi masuk wajib menyertakan foto selfie.', { code: 'SELFIE' });
  var row;
  if (jenis === 'masuk') {
    if (ada && ada.jam_masuk) return fail_('Anda sudah presensi masuk pukul ' + String(ada.jam_masuk).substring(0, 5) + '.', { code: 'DUPLICATE', row: ada });
    row = { user_id: ctx.session.uid, NUPTK: g.NUPTK, nama: g.nama_lengkap, tanggal: tdy, jam_masuk: jam, jam_pulang: '', status: 'Hadir', lokasi_id: lok.lokasi_id, latitude: d.lat, longitude: d.lng,
      jarak_m: lok.jarak, foto_id: fotoId, terlambat: jam.substring(0, 5) > setting_('JAM_MASUK_GURU', '07:00') ? 'YA' : 'TIDAK', device_id: ctx.dev || '', keterangan: String(d.keterangan || '').substring(0, 200), diperbarui_pada: nowIso_() };
    if (ada) { row.presensi_id = ada.presensi_id; DB.updateBatch('PresensiGuru', 'presensi_id', [row]); }
    else { row.presensi_id = reserveIds_('PresensiGuru', 1)[0]; DB.appendBatch('PresensiGuru', [row]); }
  } else {
    if (!ada || !ada.jam_masuk) return fail_('Belum ada presensi masuk hari ini.');
    if (ada.jam_pulang) return fail_('Anda sudah presensi pulang pukul ' + String(ada.jam_pulang).substring(0, 5) + '.', { code: 'DUPLICATE', row: ada });
    var awal = jam.substring(0, 5) < setting_('JAM_PULANG_GURU', '15:00');
    if (awal && !String(d.keterangan || '').trim()) return fail_('Presensi pulang dibuka pukul ' + setting_('JAM_PULANG_GURU', '15:00') + '. Untuk pulang lebih awal, isi alasan.', { code: 'EARLY' });
    row = Object.assign({}, ada, { jam_pulang: jam, keterangan: awal ? ('Pulang awal: ' + String(d.keterangan).substring(0, 180)) : ada.keterangan, diperbarui_pada: nowIso_() });
    DB.updateBatch('PresensiGuru', 'presensi_id', [{ presensi_id: ada.presensi_id, jam_pulang: jam, keterangan: row.keterangan, diperbarui_pada: row.diperbarui_pada }]);
  }
  bump_('presensi', true);
  var pesan = jenis === 'masuk' ? 'Presensi masuk tercatat pukul ' + jam.substring(0, 5) + (row.terlambat === 'YA' ? ' (terlambat)' : '') + ' di ' + lok.nama + '.' : 'Presensi pulang tercatat pukul ' + jam.substring(0, 5) + '. Terima kasih!';
  return ok_({ row: row, lokasi: lok.nama, jarak: lok.jarak, perangkatBaru: !!dev.baru }, pesan);
}
function apiPresensiSaya(ctx, d) {
  var dari = d.dari || Utilities.formatDate(new Date(Date.now() - 60 * 864e5), APP.TZ, 'yyyy-MM-dd');
  var rows = DB.all('PresensiGuru').filter(function (p) { return p.user_id === ctx.session.uid && String(p.tanggal) >= dari; })
    .sort(function (a, b) { return String(b.tanggal).localeCompare(String(a.tanggal)); });
  var bln = today_().substring(0, 7), ini = rows.filter(function (p) { return String(p.tanggal).substring(0, 7) === bln; });
  return ok_({ rows: rows, hariIni: presensiHariIni_(ctx.session.uid), ringkas: { hadir: ini.length, terlambat: ini.filter(function (p) { return p.terlambat === 'YA'; }).length, pulangAwal: ini.filter(function (p) { return /^Pulang awal/.test(p.keterangan); }).length },
    jamMasuk: setting_('JAM_MASUK_GURU', '07:00'), jamPulang: setting_('JAM_PULANG_GURU', '15:00'), selfie: setting_('PRESENSI_GURU_SELFIE', 'TIDAK') === 'YA' });
}
/** Rekap presensi guru (Super Admin): satu tanggal → semua guru aktif + status; rentang → baris presensi */
function apiPresensiList(ctx, d) {
  var dari = d.dari || today_(), sampai = d.sampai || dari, lokNama = {};
  lokasiAktif_().forEach(function (l) { lokNama[l.lokasi_id] = l.nama; });
  DB.all('Lokasi').forEach(function (l) { lokNama[l.lokasi_id] = l.nama; });
  var rows = DB.all('PresensiGuru').filter(function (p) { var t = String(p.tanggal); return t >= dari && t <= sampai && (!d.NUPTK || String(p.NUPTK) === String(d.NUPTK)); })
    .map(function (p) { return Object.assign({}, p, { lokasi: lokNama[p.lokasi_id] || p.lokasi_id }); })
    .sort(function (a, b) { return String(b.tanggal + b.jam_masuk).localeCompare(String(a.tanggal + a.jam_masuk)); });
  var harian = null;
  if (dari === sampai) {
    var per = {}; rows.forEach(function (p) { per[p.NUPTK] = p; });
    harian = DB.all('Guru').filter(function (g) { return (g.status || 'Aktif') === 'Aktif'; }).map(function (g) {
      var p = per[g.NUPTK];
      return { NUPTK: g.NUPTK, nama: g.nama_lengkap, mapel: g.mata_pelajaran, jabatan: g.jabatan, masuk: p ? p.jam_masuk : '', pulang: p ? p.jam_pulang : '', terlambat: p ? p.terlambat : '', lokasi: p ? p.lokasi : '', jarak_m: p ? p.jarak_m : '', keterangan: p ? p.keterangan : '', foto_id: p ? p.foto_id : '' };
    });
  }
  return ok_({ rows: rows.slice(0, 5000), harian: harian, dari: dari, sampai: sampai });
}

// ---------------------------------------------------------------------
// D. MONITORING SUPER ADMIN
// ---------------------------------------------------------------------
function seenAll_(uidx) {
  var keys = Object.keys(uidx).map(function (u) { return 'seen_' + u; }), out = {}, c = CacheService.getScriptCache();
  for (var i = 0; i < keys.length; i += 500) {
    var m = c.getAll(keys.slice(i, i + 500));
    Object.keys(m).forEach(function (k) { try { out[k.substring(5)] = JSON.parse(m[k]); } catch (e) {} });
  }
  return out;
}
function apiSaMonitor(ctx, d) {
  var tdy = today_(), now = Date.now(), uidx = userIdx_(), seen = seenAll_(uidx), ONLINE = 5 * 60e3;
  var uidByRef = {};
  Object.keys(uidx).forEach(function (id) { var u = uidx[id]; if (u.r !== 'siswa' && u.f) uidByRef[u.f] = id; });
  var lokNama = {}; DB.all('Lokasi').forEach(function (l) { lokNama[l.lokasi_id] = l.nama; }); lokNama.DEFAULT = setting_('NAMA_SEKOLAH', 'Sekolah');
  var presAll = DB.all('PresensiGuru'), pres = {};
  presAll.forEach(function (p) { if (String(p.tanggal) === tdy) pres[p.NUPTK] = p; });
  var guru = DB.all('Guru').filter(function (g) { return (g.status || 'Aktif') === 'Aktif'; }).map(function (g) {
    var id = uidByRef[g.NUPTK], u = uidx[id] || {}, p = pres[g.NUPTK], s = seen[id];
    return { NUPTK: g.NUPTK, nama: g.nama_lengkap, mapel: g.mata_pelajaran, jabatan: g.jabatan, foto: g.foto_profil_url, user_id: id || '', role: u.r || '', akunAktif: !!u.a,
      masuk: p ? String(p.jam_masuk).substring(0, 5) : '', pulang: p ? String(p.jam_pulang || '').substring(0, 5) : '', terlambat: p ? p.terlambat : '', lokasi: p ? (lokNama[p.lokasi_id] || p.lokasi_id) : '', jarak_m: p ? p.jarak_m : '',
      online: !!(s && now - s.t < ONLINE), terakhir: s ? s.t : 0, aksi: s ? s.a : '', perangkat: !!u.d };
  });
  // siswa: kehadiran hari ini per kelas
  var siswa = DB.all('Siswa').filter(function (s) { return (s.status || 'Aktif') === 'Aktif'; }), absT = {};
  DB.all('Absensi').forEach(function (a) { if (String(a.tanggal) === tdy) absT[a.NIS] = String(a.status).charAt(0).toUpperCase(); });
  var idx = absenIndex_(), perKelas = {};
  DB.all('Kelas').forEach(function (k) { perKelas[k.kelas_id] = { kelas_id: k.kelas_id, nama: k.nama_kelas, jenjang: k.jenjang, total: 0, H: 0, I: 0, S: 0, A: 0, belum: 0, sumPersen: 0, nPersen: 0 }; });
  siswa.forEach(function (s) {
    var k = perKelas[s.kelas_id] || (perKelas[s.kelas_id] = { kelas_id: s.kelas_id, nama: s.kelas_id || '-', total: 0, H: 0, I: 0, S: 0, A: 0, belum: 0, sumPersen: 0, nPersen: 0 });
    k.total++; var st = absT[s.NIS]; if (st && k[st] !== undefined) k[st]++; else k.belum++;
    var r = idx.rekap[s.NIS]; if (r && r.persen !== null) { k.sumPersen += r.persen; k.nPersen++; }
  });
  var kelas = Object.keys(perKelas).map(function (k) { var o = perKelas[k]; o.persenSemester = o.nPersen ? round1_(o.sumPersen / o.nPersen) : null; o.persenHariIni = o.total ? round1_(o.H / o.total * 100) : 0; delete o.sumPersen; delete o.nPersen; return o; })
    .filter(function (k) { return k.total > 0; });
  var online = Object.keys(seen).filter(function (id) { return uidx[id] && now - seen[id].t < ONLINE; })
    .map(function (id) { var u = uidx[id]; return { user_id: id, nama: u.n, role: u.r, aksi: seen[id].a, t: seen[id].t }; })
    .sort(function (a, b) { return b.t - a.t; });
  // tren presensi guru 7 hari
  var tren = [];
  for (var i = 6; i >= 0; i--) {
    var dt = new Date(new Date(tdy + 'T00:00:00+07:00').getTime() - i * 864e5), t = Utilities.formatDate(dt, APP.TZ, 'yyyy-MM-dd');
    var hadir = presAll.filter(function (p) { return String(p.tanggal) === t && p.jam_masuk; });
    tren.push({ tanggal: t, hari: HARI[Number(Utilities.formatDate(dt, APP.TZ, 'u')) % 7], hadir: hadir.length, terlambat: hadir.filter(function (p) { return p.terlambat === 'YA'; }).length });
  }
  var akun = { total: 0, aktif: 0, nonaktif: 0, superadmin: 0, guru: 0, siswa: 0, perangkat: 0 };
  Object.keys(uidx).forEach(function (id) { var u = uidx[id]; akun.total++; u.a ? akun.aktif++ : akun.nonaktif++; if (akun[u.r] !== undefined) akun[u.r]++; if (u.d) akun.perangkat++; });
  var hadirSiswa = siswa.filter(function (s) { return absT[s.NIS] === 'H'; }).length;
  return ok_({
    tanggal: tdy, jam: timeNow_().substring(0, 5), jamMasukGuru: setting_('JAM_MASUK_GURU', '07:00'),
    ringkas: { guruTotal: guru.length, guruHadir: guru.filter(function (g) { return g.masuk; }).length, guruTerlambat: guru.filter(function (g) { return g.terlambat === 'YA'; }).length,
      siswaTotal: siswa.length, siswaHadir: hadirSiswa, persenSiswa: siswa.length ? round1_(hadirSiswa / siswa.length * 100) : 0, online: online.length },
    guru: guru, kelas: kelas, online: online.slice(0, 100), aktivitas: logTerakhir_(40), trenGuru: tren, akun: akun,
    perhatian: siswa.map(function (s) { var r = idx.rekap[s.NIS]; return r && r.persen !== null && r.persen < num_(setting_('BATAS_KEHADIRAN', 75)) ? { NIS: s.NIS, nama: s.nama_lengkap, kelas_id: s.kelas_id, persen: r.persen } : null; })
      .filter(Boolean).sort(function (a, b) { return a.persen - b.persen; }).slice(0, 15)
  });
}

// ---------------------------------------------------------------------
// E. KELOLA AKUN (guru, siswa, super admin)
// ---------------------------------------------------------------------
var HAK_AKSES = { keuangan: 'Keuangan (Tagihan & Pembayaran)' };
function bersihHak_(h) { return String(h || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { return HAK_AKSES[x]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(','); }
function bersihLokasiIds_(v) {
  var ada = {}; DB.all('Lokasi').forEach(function (l) { ada[l.lokasi_id] = 1; });
  return [].concat(Array.isArray(v) ? v : String(v || '').split(',')).map(function (x) { return String(x).trim(); }).filter(function (x) { return ada[x]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(',');
}
function saAktifLain_(kecuali) { return DB.all('Users').filter(function (u) { return u.role === 'superadmin' && String(u.status_aktif).toUpperCase() === 'YA' && kecuali.indexOf(u.user_id) === -1; }).length; }

function apiSaAkunList(ctx, d) {
  var kelas = {}; DB.all('Kelas').forEach(function (k) { kelas[k.kelas_id] = k.nama_kelas; });
  var uidx = userIdx_(), seen = seenAll_(uidx), now = Date.now();
  var rows = DB.all('Users').map(function (u) {
    var s = seen[u.user_id];
    return { user_id: u.user_id, nama: u.nama, email: u.email, role: u.role, ref_id: u.ref_id, kelas_id: u.kelas_id, kelas: kelas[u.kelas_id] || '', status_aktif: u.status_aktif, wajib_ganti_sandi: u.wajib_ganti_sandi,
      last_login: u.last_login, hak_akses: u.hak_akses || '', lokasi_ids: u.lokasi_ids || '', perangkat: !!u.device_id, device_info: u.device_info || '', catatan: u.catatan || '', dibuat_pada: u.dibuat_pada,
      online: !!(s && now - s.t < 5 * 60e3), terakhir: s ? s.t : 0 };
  });
  return ok_({ rows: rows, lokasi: DB.all('Lokasi').map(function (l) { return { lokasi_id: l.lokasi_id, nama: l.nama, berlaku: l.berlaku, aktif: l.aktif }; }), hak: HAK_AKSES, saya: ctx.session.uid });
}

function apiSaAkunSave(ctx, d) {
  var u = DB.find('Users', 'user_id', d.user_id);
  if (!u) return fail_('Akun tidak ditemukan.');
  var p = { user_id: u.user_id }, cabut = false, diri = u.user_id === ctx.session.uid;
  if (d.nama !== undefined) { if (!String(d.nama).trim()) return fail_('Nama wajib diisi.'); p.nama = String(d.nama).trim().substring(0, 80); }
  if (d.email !== undefined && lower_(d.email) !== lower_(u.email)) {
    var e = lower_(d.email);
    if (!emailValid_(e)) return fail_('Format email tidak valid.');
    if (DB.all('Users').some(function (x) { return lower_(x.email) === e && x.user_id !== u.user_id; })) return fail_('Email sudah dipakai akun lain.');
    p.email = e; cabut = true;
  }
  if (d.role !== undefined && d.role !== u.role) {
    if (u.role === 'siswa' || d.role === 'siswa' || !ROLES[d.role]) return fail_('Peran siswa tidak bisa diubah. Hanya Guru ⇄ Super Admin.');
    if (d.role === 'guru' && !u.ref_id) return fail_('Akun ini tidak terhubung ke data guru, sehingga tidak bisa dijadikan Guru.');
    if (u.role === 'superadmin' && (diri || !saAktifLain_([u.user_id]))) return fail_(diri ? 'Tidak bisa menurunkan peran akun Anda sendiri.' : 'Minimal harus ada satu Super Admin aktif.');
    p.role = d.role; cabut = true;
  }
  if (d.status_aktif !== undefined) {
    var st = String(d.status_aktif).toUpperCase() === 'YA' ? 'YA' : 'TIDAK';
    if (st === 'TIDAK' && diri) return fail_('Tidak bisa menonaktifkan akun Anda sendiri.');
    if (st === 'TIDAK' && u.role === 'superadmin' && !saAktifLain_([u.user_id])) return fail_('Minimal harus ada satu Super Admin aktif.');
    p.status_aktif = st; if (st === 'TIDAK') cabut = true;
  }
  if (d.hak_akses !== undefined) p.hak_akses = bersihHak_(d.hak_akses);
  if (d.lokasi_ids !== undefined) p.lokasi_ids = bersihLokasiIds_(d.lokasi_ids);
  if (d.catatan !== undefined) p.catatan = String(d.catatan).substring(0, 200);
  if (d.wajib_ganti_sandi !== undefined) p.wajib_ganti_sandi = d.wajib_ganti_sandi ? 'YA' : 'TIDAK';
  DB.updateBatch('Users', 'user_id', [p]);
  if (p.email || p.nama) {                                  // sinkron ke data induk
    if (u.role === 'siswa') DB.updateBatch('Siswa', 'NIS', [Object.assign({ NIS: u.ref_id }, p.email ? { email: p.email } : {}, p.nama ? { nama_lengkap: p.nama } : {})]);
    else if (u.ref_id && DB.find('Guru', 'NUPTK', u.ref_id)) DB.updateBatch('Guru', 'NUPTK', [Object.assign({ NUPTK: u.ref_id }, p.email ? { email: p.email } : {}, p.nama ? { nama_lengkap: p.nama } : {})]);
  }
  if (cabut) revokeAll_(lower_(u.email));
  bump_('master');
  var res = ok_(Object.assign({}, u, p, { password_hash: undefined, salt: undefined }), 'Akun ' + (p.nama || u.nama) + ' diperbarui.' + (cabut ? ' Sesi lama akun ini dikeluarkan.' : ''));
  res.auditTarget = u.user_id;
  return res;
}

function apiSaAkunCreate(ctx, d) {
  var nama = String(d.nama || '').trim(), e = lower_(d.email);
  if (!nama) return fail_('Nama wajib diisi.');
  if (!emailValid_(e)) return fail_('Format email tidak valid.');
  if (DB.all('Users').some(function (x) { return lower_(x.email) === e; })) return fail_('Email sudah dipakai akun lain.');
  var pw = String(d.password || '').trim();
  if (pw) { var lemah = kuatSandi_('superadmin', pw); if (lemah) return fail_(lemah); } else pw = sandiAcak_(14);
  var uid = reserveIds_('Users', 1)[0];
  DB.appendBatch('Users', [{ user_id: uid, nama: nama, email: e, role: 'superadmin', ref_id: '', kelas_id: '', status_aktif: 'YA', wajib_ganti_sandi: 'YA', last_login: '', dibuat_pada: nowIso_(),
    hak_akses: bersihHak_(d.hak_akses || 'keuangan'), catatan: String(d.catatan || '').substring(0, 200) }]);
  pwSimpan_(uid, pw);
  bump_('master');
  var res = ok_({ user_id: uid, akun: { email: e, password: pw } }, 'Akun Super Admin ' + nama + ' dibuat.');
  res.auditTarget = uid;
  return res;
}

function apiSaAkunReset(ctx, d) {
  var u = DB.find('Users', 'user_id', d.user_id);
  if (!u) return fail_('Akun tidak ditemukan.');
  var pw = String(d.password || '').trim();
  if (pw) { var lemah = kuatSandi_(u.role, pw); if (lemah) return fail_(lemah); }
  else pw = u.role === 'superadmin' ? sandiAcak_(14) : randomPassword_(8);
  pwSimpan_(u.user_id, pw);
  DB.updateBatch('Users', 'user_id', [{ user_id: u.user_id, wajib_ganti_sandi: 'YA', status_aktif: 'YA' }]);
  delProp_('SA_KUNCI_' + u.user_id);
  revokeAll_(lower_(u.email));
  if (d.kirim) kirimNotif_('RESET_SANDI_ADMIN', kontakUser_(u), { username: u.email, sandi: pw }, u.user_id);
  bump_('master');
  var res = ok_({ akun: { email: u.email, password: pw }, nama: u.nama }, 'Sandi baru dibuat untuk ' + u.nama + '. Sesi lamanya dikeluarkan.');
  res.auditTarget = u.user_id;
  return res;
}
function apiSaAkunLogout(ctx, d) {
  var u = DB.find('Users', 'user_id', d.user_id);
  if (!u) return fail_('Akun tidak ditemukan.');
  revokeAll_(lower_(u.email));
  var res = ok_(null, u.nama + ' dikeluarkan dari semua perangkat.'); res.auditTarget = u.user_id; return res;
}
function apiSaAkunDevice(ctx, d) {
  var u = DB.find('Users', 'user_id', d.user_id);
  if (!u) return fail_('Akun tidak ditemukan.');
  DB.updateBatch('Users', 'user_id', [{ user_id: u.user_id, device_id: '', device_info: '' }]);
  var res = ok_(null, 'Perangkat ' + u.nama + ' direset. Perangkat berikutnya yang dipakai absen akan terdaftar otomatis.'); res.auditTarget = u.user_id; return res;
}
function apiSaAkunDelete(ctx, d) {
  var u = DB.find('Users', 'user_id', d.user_id);
  if (!u) return fail_('Akun tidak ditemukan.');
  if (u.user_id === ctx.session.uid) return fail_('Tidak bisa menghapus akun Anda sendiri.');
  if (u.role !== 'superadmin') return fail_('Akun guru/siswa dihapus dari menu Data Guru / Data Siswa agar data induknya ikut rapi.');
  if (!saAktifLain_([u.user_id])) return fail_('Minimal harus ada satu Super Admin aktif.');
  revokeAll_(lower_(u.email));
  DB.deleteWhere('Users', 'user_id', [u.user_id]);
  bump_('master');
  var res = ok_(null, 'Akun ' + u.nama + ' dihapus.'); res.auditTarget = u.user_id; return res;
}
function apiSaAkunBulk(ctx, d) {
  var ids = [].concat(d.ids || []).map(String), aksi = d.aksi;
  if (!ids.length) return fail_('Belum ada akun yang dipilih.');
  var set = {}; ids.forEach(function (x) { set[x] = 1; });
  var users = DB.all('Users').filter(function (u) { return set[u.user_id]; });
  if (aksi === 'nonaktifkan') {
    if (set[ctx.session.uid]) return fail_('Akun Anda sendiri ikut terpilih — hapus centangnya dulu.');
    var saKena = users.filter(function (u) { return u.role === 'superadmin'; }).map(function (u) { return u.user_id; });
    if (saKena.length && !saAktifLain_(saKena)) return fail_('Minimal harus ada satu Super Admin aktif.');
  }
  var patch = null, n = users.length;
  if (aksi === 'aktifkan') patch = function (u) { return { user_id: u.user_id, status_aktif: 'YA' }; };
  else if (aksi === 'nonaktifkan') patch = function (u) { return { user_id: u.user_id, status_aktif: 'TIDAK' }; };
  else if (aksi === 'resetPerangkat') patch = function (u) { return { user_id: u.user_id, device_id: '', device_info: '' }; };
  else if (aksi === 'wajibGanti') patch = function (u) { return { user_id: u.user_id, wajib_ganti_sandi: 'YA' }; };
  else if (aksi === 'setLokasi') { var l = bersihLokasiIds_(d.nilai); patch = function (u) { return { user_id: u.user_id, lokasi_ids: l }; }; }
  else if (aksi !== 'logout') return fail_('Aksi massal tidak dikenal.');
  if (patch) DB.updateBatch('Users', 'user_id', users.map(patch));
  if (aksi === 'logout' || aksi === 'nonaktifkan') users.forEach(function (u) { revokeAll_(lower_(u.email)); });
  bump_('master');
  return ok_({ n: n }, 'Aksi diterapkan ke ' + n + ' akun.');
}

// ---------------------------------------------------------------------
// F. RAHASIA PIHAK KETIGA (R5) — allowlist, respons tersamar, tidak pernah dicatat
// ---------------------------------------------------------------------
var RAHASIA_DASHBOARD = {
  FONNTE_TOKEN: { label: 'Token Fonnte (WhatsApp)', pola: /^[^\s]{10,200}$/, pesan: 'Token Fonnte tidak valid (10–200 karakter tanpa spasi).' }
  // tambahkan API key lain di sini — JANGAN pernah TOKEN_SECRET / QR_SECRET / PW_* / SPREADSHEET_ID
};
/** '' bila berhasil, atau pesan galat */
function simpanRahasia_(k, nilai) {
  var aturan = RAHASIA_DASHBOARD[k];
  if (!aturan) return 'Kunci tidak diizinkan.';
  if (nilai === '__HAPUS__') { delProp_(k); return ''; }
  var v = String(nilai || '').trim();
  if (!v) return 'Nilai kosong — tidak ada yang diubah.';
  if (aturan.pola && !aturan.pola.test(v)) return aturan.pesan || 'Format tidak valid.';
  setProp_(k, v);
  return '';
}
function apiRahasiaStatus(ctx, d) {
  var items = Object.keys(RAHASIA_DASHBOARD).map(function (k) { return { kunci: k, label: RAHASIA_DASHBOARD[k].label, ada: !!prop_(k), samar: samarkan_(prop_(k)) }; });
  var sa = DB.all('Users').filter(function (u) { return u.role === 'superadmin'; });
  return ok_({ items: items,
    internal: [{ label: 'Secret sesi (TOKEN_SECRET)', ada: !!prop_('TOKEN_SECRET') }, { label: 'Secret QR kwitansi (QR_SECRET)', ada: !!prop_('QR_SECRET') }],
    superadmin: sa.map(function (u) { return { nama: u.nama, email: u.email, aktif: u.status_aktif === 'YA', terkunci: Number(prop_('SA_KUNCI_' + u.user_id) || 0) > Date.now() }; }),
    sesiJam: APP.TOKEN_TTL_MS / 3600e3, hashIterasi: APP.HASH_ITER });
}
function apiRahasiaSimpan(ctx, d) {
  var k = String(d.kunci || ''), e = simpanRahasia_(k, d.nilai);
  if (e) return fail_(e);
  var res = ok_({ kunci: k, ada: !!prop_(k), samar: samarkan_(prop_(k)) }, 'Tersimpan di Script Properties.');
  res.auditDetail = 'Rahasia:' + k + ' ' + (d.nilai === '__HAPUS__' ? 'dihapus' : 'diperbarui');   // nilai TIDAK dicatat
  return res;
}
function apiRahasiaRotasiSesi(ctx, d) {
  if (d.konfirmasi !== 'ROTASI') return fail_('Ketik ROTASI untuk konfirmasi.');
  setProp_('TOKEN_SECRET', acak_(64));
  return ok_({ logout: true }, 'Secret sesi dirotasi. Semua pengguna (termasuk Anda) harus login ulang.');
}

// ---------------------------------------------------------------------
// G. NOTIFIKASI IN-APP (lonceng)
// ---------------------------------------------------------------------
/** rows: [{ user_id, judul, pesan, tipe, link }] — 1 kali tulis */
function notifApp_(rows) {
  rows = (rows || []).filter(function (n) { return n && n.user_id; });
  if (!rows.length) return 0;
  var ids = reserveIds_('Notifikasi', rows.length), t = nowIso_();
  DB.appendBatch('Notifikasi', rows.map(function (n, i) { return { notif_id: ids[i], user_id: n.user_id, judul: String(n.judul || '').substring(0, 120), pesan: String(n.pesan || '').substring(0, 500), tipe: n.tipe || 'info', link: n.link || '', dibaca: 'TIDAK', tanggal: t }; }));
  bump_('notif');
  return rows.length;
}
function notifBelum_(uid) {
  var idx = cached_('ntfidx_' + ver_('notif'), 21600, function () {
    var o = {}; DB.all('Notifikasi').forEach(function (n) { if (n.dibaca !== 'YA') o[n.user_id] = (o[n.user_id] || 0) + 1; }); return o;
  });
  return idx[uid] || 0;
}
function apiNotifMine(ctx, d) {
  var rows = DB.all('Notifikasi').filter(function (n) { return n.user_id === ctx.session.uid; }).sort(function (a, b) { return String(b.tanggal).localeCompare(String(a.tanggal)); });
  return ok_({ rows: rows.slice(0, 40), belum: rows.filter(function (n) { return n.dibaca !== 'YA'; }).length });
}
function apiNotifRead(ctx, d) {
  var ids = d.ids ? [].concat(d.ids).map(String) : null;
  var up = DB.all('Notifikasi').filter(function (n) { return n.user_id === ctx.session.uid && n.dibaca !== 'YA' && (!ids || ids.indexOf(n.notif_id) > -1); }).map(function (n) { return { notif_id: n.notif_id, dibaca: 'YA' }; });
  if (up.length) { DB.updateBatch('Notifikasi', 'notif_id', up); bump_('notif'); }
  return ok_({ n: up.length });
}

;
// ==== Tagihan.gs ====
/**
 * =====================================================================
 *  SIAKAD SISWA v2.1 — File 4/7 : Tagihan.gs  (gas-tagihan-pembayaran)
 *  Tagihan & Pembayaran dengan JENIS BIAYA CUSTOM (master Biaya):
 *   • Bulanan (SPP, uang makan, antar-jemput…) — centang bulan apa saja,
 *     1 baris per siswa × kode (KodeTagihan = KODE-yyyy-MM)
 *   • Sekali bayar (uang pangkal, seragam, study tour…) atau ad-hoc
 *   • Nominal khusus per jenjang / kelas / siswa, potongan & beasiswa
 *   • 1 bukti transfer untuk banyak tagihan, verifikasi semua-atau-tidak
 *   • Kwitansi bernomor + QR ber-HMAC (QR_SECRET di Script Properties)
 *   • Pengingat H-3 / H-0 + tandai Terlambat otomatis
 *  Subjek = Siswa (NIS). WA dikirim ke orang tua (no_wa_ortu).
 * =====================================================================
 */

var TG = {
  subjek: { tabel: 'Siswa', id: 'NIS', nama: 'nama_lengkap', nomor: 'NIS', hp: 'no_wa_ortu', hp2: 'no_wa', email: 'email',
    aktif: function (r) { return (r.status || 'Aktif') === 'Aktif'; } },
  label: 'Siswa',
  maksBulan: 24
};
var TG_SID = 'NIS';
var TG_BELUM = { 'Belum Bayar': 1, 'Terlambat': 1 };
var TG_TANPA_REMINDER = { 'Lunas': 1, 'Gratis': 1, 'Menunggu Verifikasi': 1 };
var TG_BISA_BATAL = { 'Belum Bayar': 1, 'Terlambat': 1, 'Gratis': 1 };
var TG_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var TG_SETTING = /^(JATUH_TEMPO_TANGGAL|REKENING_BANK|NAMA_BENDAHARA|KWITANSI_PREFIX|REMINDER_OTOMATIS|REMINDER_JAM|REMINDER_H3|REMINDER_H0)$/;

// ---------------------------------------------------------------------
// 1. HELPER
// ---------------------------------------------------------------------
function tgLabel_(per) { var m = String(per || '').match(/^(\d{4})-(\d{2})/); return m ? TG_BULAN[parseInt(m[2], 10) - 1] + ' ' + m[1] : String(per || ''); }
function tgRp_(n) { return 'Rp ' + Math.round(uang_(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function tgU_(ctx) { return { UserID: ctx.session ? ctx.session.uid : '', Role: ctx.session ? ctx.session.role : '', Nama: (ctx.user && ctx.user.n) || (ctx.session && ctx.session.email) || 'Sistem' }; }
function tgDaftarPeriode_(p) {
  var a = [].concat(p.periodeList || []);
  if (!a.length && p.periode) a = [p.periode];
  var set = {};
  a.forEach(function (x) { var s = String(x === null || x === undefined ? '' : x).trim().substring(0, 7); if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) set[s] = 1; });
  return Object.keys(set).sort().slice(0, TG.maksBulan);
}
function tgIds_(x, maks) {
  var out = [];
  [].concat(x || []).forEach(function (v) { var s = String(v === null || v === undefined ? '' : v).trim(); if (s && out.indexOf(s) === -1) out.push(s); });
  return out.slice(0, maks || 3000);
}
function tgPetaSubjek_() { var m = {}; DB.all('Siswa').forEach(function (r) { m[r.NIS] = r; }); return m; }
function tgPetaKelas_() { var m = {}; DB.all('Kelas').forEach(function (k) { m[k.kelas_id] = k.nama_kelas; }); return m; }
/** NIS → user_id akun siswa (untuk notifikasi in-app) */
function tgUserOf_() { var m = {}, u = userIdx_(); Object.keys(u).forEach(function (id) { if (u[id].r === 'siswa') m[u[id].f] = id; }); return m; }
function tgWA_(event, daftar) { return typeof kirimNotifBatch_ === 'function' ? kirimNotifBatch_(event, daftar) : 0; }
function tgPenerima_(s) { return { nama: s.nama_lengkap, hp: s.no_wa_ortu || s.no_wa, email: s.email }; }
function tgFileUrl_(id) { return id ? 'https://drive.google.com/file/d/' + id + '/view' : ''; }
function tgThumbUrl_(id, w) { return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (w || 480) : ''; }
function tgBiaya_(kode) { var k = String(kode || '').trim().toUpperCase(); return DB.all('Biaya').filter(function (b) { return String(b.kode).toUpperCase() === k; })[0] || null; }
function tgKhusus_(b) { try { var o = typeof b.nominal_khusus === 'object' ? b.nominal_khusus : JSON.parse(b.nominal_khusus || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
/** Nominal per siswa: NIS › KELAS › JENJANG › nominal dasar */
function tgHarga_(b, s) {
  var k = tgKhusus_(b), keys = ['NIS:' + s.NIS, 'KELAS:' + s.kelas_id, 'JENJANG:' + s.jenjang];
  for (var i = 0; i < keys.length; i++) if (k[keys[i]] !== undefined && k[keys[i]] !== '') return uang_(k[keys[i]]);
  return uang_(b.nominal);
}
/** Potongan/beasiswa yang berlaku untuk 1 tagihan */
function tgPotongan_(daftar, nis, jenis, biayaKode, kode, periode, harga) {
  var pot = 0, alasan = [];
  daftar.forEach(function (p) {
    if (String(p.NIS) !== String(nis) || String(p.Aktif).toUpperCase() !== 'YA') return;
    var b = String(p.Berlaku || 'Semua');
    if (!(b === 'Semua' || b === jenis || b === 'KODE:' + biayaKode || b === 'KODE:' + kode)) return;
    if (jenis === 'Bulanan' && ((p.Mulai && periode < p.Mulai) || (p.Sampai && periode > p.Sampai))) return;
    pot += p.Tipe === 'Gratis' ? harga : p.Tipe === 'Persen' ? Math.round(harga * uang_(p.Nilai) / 100) : uang_(p.Nilai);
    if (p.Alasan) alasan.push(p.Alasan);
  });
  pot = Math.max(0, Math.min(pot, harga));
  return { potongan: pot, jumlah: harga - pot, alasan: alasan.join('; ') };
}
function tgSasaran_(p) {
  var kelas = tgIds_(p.kelas_ids || p.kelas_id), jenjang = String(p.jenjang || '');
  return DB.all('Siswa').filter(TG.subjek.aktif).filter(function (s) { return (!kelas.length || kelas.indexOf(s.kelas_id) > -1) && (!jenjang || s.jenjang === jenjang); });
}
/** Susun rencana terbit dari payload. Bulanan: {biayaKode, periodeList}. Sekali: {biayaKode, nominal?, jatuhTempo?, sufiks?} atau ad-hoc {jenis:'Sekali', kode, nama, nominal, jatuhTempo} */
function tgRencana_(p) {
  var b = p.biayaKode ? tgBiaya_(p.biayaKode) : null;
  if (p.biayaKode && !b) return { err: 'Jenis biaya ' + p.biayaKode + ' tidak ditemukan.' };
  if (b && String(b.aktif || 'YA').toUpperCase() === 'TIDAK') return { err: 'Jenis biaya ' + b.nama + ' sedang nonaktif.' };
  var sekali = b ? b.jenis === 'Sekali' : p.jenis === 'Sekali';
  if (!sekali && !b) return { err: 'Pilih jenis biaya bulanan dari daftar Biaya.' };
  if (!sekali) {
    var daftar = tgDaftarPeriode_(p);
    if (!daftar.length) return { err: 'Pilih minimal satu bulan tagihan.' };
    var tgl = ('0' + Math.min(28, Math.max(1, parseInt(b.jatuh_tempo_tgl || setting_('JATUH_TEMPO_TANGGAL', '10'), 10) || 10))).slice(-2);
    return { sekali: false, b: b, items: daftar.map(function (per) { return { kode: b.kode + '-' + per, periode: per, nama: b.nama + ' ' + tgLabel_(per), jatuhTempo: per + '-' + tgl }; }), daftar: daftar, tgl: tgl };
  }
  var kode = b ? String(b.kode + (p.sufiks ? '-' + p.sufiks : '')).trim().toUpperCase() : String(p.kode || '').trim().toUpperCase();
  var nama = String(p.nama || (b ? b.nama + (p.sufiks ? ' ' + p.sufiks : '') : '')).trim();
  var jt = String(p.jatuhTempo || (b ? b.jatuh_tempo : '') || '');
  if (!/^[A-Z0-9][A-Z0-9-]{1,40}$/.test(kode)) return { err: 'Kode tagihan wajib (huruf/angka/tanda -, mis. UP-2026).' };
  if (!nama) return { err: 'Nama tagihan wajib diisi.' };
  if (!b && (p.nominal === undefined || String(p.nominal) === '' || !(uang_(p.nominal) >= 0))) return { err: 'Nominal tagihan wajib diisi.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jt)) return { err: 'Tanggal jatuh tempo wajib (yyyy-MM-dd).' };
  var override = p.nominal !== undefined && String(p.nominal) !== '' ? uang_(p.nominal) : null;
  return { sekali: true, b: b, override: override, items: [{ kode: kode, periode: '', nama: nama, jatuhTempo: jt }], daftar: [], kode: kode };
}
function tgHargaRencana_(rc, s) { return rc.override !== null && rc.override !== undefined ? rc.override : rc.b ? tgHarga_(rc.b, s) : 0; }

// ---------------------------------------------------------------------
// 2. DAFTAR & RINGKASAN
// ---------------------------------------------------------------------
function svcTgList(ctx, p) {
  var subjek = tgPetaSubjek_(), kelas = tgPetaKelas_(), rows = DB.all('Tagihan');
  if (p.periode) rows = rows.filter(function (t) { return String(t.Periode) === p.periode; });
  if (p.jenis) rows = rows.filter(function (t) { return t.Jenis === p.jenis; });
  if (p.status) rows = rows.filter(function (t) { return p.status === 'Belum' ? TG_BELUM[t.Status] : t.Status === p.status; });
  if (p.biayaKode) rows = rows.filter(function (t) { return t.BiayaKode === p.biayaKode || String(t.KodeTagihan).indexOf(p.biayaKode) === 0; });
  if (p.kelas_id) rows = rows.filter(function (t) { return (t.kelas_id || (subjek[t.NIS] || {}).kelas_id) === p.kelas_id; });
  if (p.NIS) rows = rows.filter(function (t) { return String(t.NIS) === String(p.NIS); });
  var hasil = rows.map(function (t) { var s = subjek[t.NIS] || {}; var k = t.kelas_id || s.kelas_id; return Object.assign({}, t, { Nama: s.nama_lengkap || '-', Nomor: t.NIS, kelas_id: k, Kelas: kelas[k] || k || '' }); });
  if (p.cari) {
    var q = String(p.cari).toLowerCase();
    hasil = hasil.filter(function (t) { return [t.Nama, t.Nomor, t.TagihanID, t.NamaTagihan, t.Kelas].join(' ').toLowerCase().indexOf(q) > -1; });
  }
  if (p.denganBukti) hasil = tgTambahBukti_(hasil);
  var jumlah = function (st) { return hasil.filter(function (t) { return st[t.Status]; }).reduce(function (s, t) { return s + uang_(t.Jumlah); }, 0); };
  var menunggu = {};
  DB.filter('Pembayaran', function (b) { return b.Status === 'Menunggu'; }).forEach(function (b) { menunggu[b.GrupBayar || b.PembayaranID] = 1; });   // 1 bukti = 1 transaksi
  return ok_({
    rows: hasil.sort(function (a, b) { return String(b.TanggalTerbit).localeCompare(String(a.TanggalTerbit)) || String(a.Nama).localeCompare(String(b.Nama)); }),
    ringkasan: {
      totalTagihan: hasil.reduce(function (s, t) { return s + uang_(t.Jumlah); }, 0),
      terkumpul: jumlah({ 'Lunas': 1 }), tunggakan: jumlah(TG_BELUM), menunggu: jumlah({ 'Menunggu Verifikasi': 1 }),
      totalPotongan: hasil.reduce(function (s, t) { return s + uang_(t.Potongan); }, 0),
      jumlahLunas: hasil.filter(function (t) { return t.Status === 'Lunas'; }).length,
      jumlahGratis: hasil.filter(function (t) { return t.Status === 'Gratis'; }).length,
      jumlahBelum: hasil.filter(function (t) { return TG_BELUM[t.Status]; }).length,
      jumlahTerlambat: hasil.filter(function (t) { return t.Status === 'Terlambat'; }).length,
      menungguVerifikasi: Object.keys(menunggu).length
    },
    periodeAda: Object.keys(DB.all('Tagihan').reduce(function (o, t) { if (t.Periode) o[t.Periode] = 1; return o; }, {})).sort().reverse()
  });
}

function svcTgMine(ctx, p) {
  var s = DB.find('Siswa', 'NIS', ctx.session.ref);
  if (!s) return fail_('Data siswa tidak ditemukan.');
  var tagihan = DB.filter('Tagihan', function (t) { return String(t.NIS) === String(s.NIS); })
    .sort(function (a, b) { return String(b.JatuhTempo).localeCompare(String(a.JatuhTempo)); });
  var bayar = DB.filter('Pembayaran', function (b) { return String(b.NIS) === String(s.NIS); });
  return ok_({
    tagihan: tagihan.map(function (t) { return Object.assign({}, t, { pembayaran: bayar.filter(function (b) { return b.TagihanID === t.TagihanID; }).map(function (b) { return { PembayaranID: b.PembayaranID, Status: b.Status, Catatan: b.Catatan, TanggalBayar: b.TanggalBayar, NoKwitansi: b.NoKwitansi }; }) }); }),
    transaksi: tgRiwayat_(s.NIS).transaksi,
    rekening: setting_('REKENING_BANK', ''),
    totalTunggakan: tagihan.filter(function (t) { return TG_BELUM[t.Status]; }).reduce(function (x, t) { return x + uang_(t.Jumlah); }, 0)
  });
}
/** Ringkasan tagihan per siswa (cache berversi 'tagihan') — untuk kartu di dashboard siswa */
function tgRingkasSiswa_(nis) {
  var idx = cached_('tgidx_' + ver_('tagihan'), 21600, function () {
    var o = {};
    DB.all('Tagihan').forEach(function (t) {
      var r = o[t.NIS] = o[t.NIS] || [0, 0, 0, ''];
      if (TG_BELUM[t.Status]) { r[0]++; r[1] += uang_(t.Jumlah); if (!r[3] || String(t.JatuhTempo) < r[3]) r[3] = String(t.JatuhTempo); }
      if (t.Status === 'Menunggu Verifikasi') r[2]++;
    });
    return o;
  });
  var r = idx[nis] || [0, 0, 0, ''];
  return { belum: r[0], tunggakan: r[1], menunggu: r[2], jatuhTempo: r[3] };
}

// ---------------------------------------------------------------------
// 3. PENERBITAN
// ---------------------------------------------------------------------
function svcTgEligible(ctx, p) {
  var rc = tgRencana_(p);
  if (rc.err) return fail_(rc.err);
  var ada = {}; DB.all('Tagihan').forEach(function (t) { ada[t.NIS + '|' + t.KodeTagihan] = 1; });
  var potongan = DB.all('PotonganTagihan'), kelas = tgPetaKelas_();
  var rows = tgSasaran_(p).map(function (s) {
    var baru = rc.items.filter(function (it) { return !ada[s.NIS + '|' + it.kode]; });
    var harga = tgHargaRencana_(rc, s), total = 0, pot = 0;
    baru.forEach(function (it) { var x = tgPotongan_(potongan, s.NIS, rc.sekali ? 'Sekali' : 'Bulanan', rc.b ? rc.b.kode : it.kode, it.kode, it.periode, harga); total += x.jumlah; pot += x.potongan; });
    return { NIS: s.NIS, Nama: s.nama_lengkap, kelas_id: s.kelas_id, Kelas: kelas[s.kelas_id] || s.kelas_id, Harga: harga, kodeBaru: baru.map(function (it) { return it.kode; }), periodeBaru: baru.map(function (it) { return it.periode; }), Potongan: pot, Total: total };
  }).filter(function (r) { return r.kodeBaru.length > 0; });
  return ok_({ jenis: rc.sekali ? 'Sekali' : 'Bulanan', periodeList: rc.daftar, kode: rc.kode || '', biaya: rc.b ? { kode: rc.b.kode, nama: rc.b.nama } : null, rows: rows,
    jumlahTagihan: rows.reduce(function (s, r) { return s + r.kodeBaru.length; }, 0), estimasi: rows.reduce(function (s, r) { return s + r.Total; }, 0) });
}

function svcTgTerbit(ctx, p, semua) {
  var rc = tgRencana_(p);
  if (rc.err) return fail_(rc.err);
  var u = tgU_(ctx);
  var ada = {}; DB.all('Tagihan').forEach(function (t) { ada[t.NIS + '|' + t.KodeTagihan] = 1; });
  var target = tgSasaran_(semua ? p : {});
  if (!semua) { var ids = tgIds_(p.subjekIds || p.nisList); if (!ids.length) return fail_('Pilih minimal satu siswa.'); target = target.filter(function (s) { return ids.indexOf(String(s.NIS)) > -1; }); }
  var baru = [];
  target.forEach(function (s) { rc.items.forEach(function (it) { if (!ada[s.NIS + '|' + it.kode]) baru.push({ s: s, it: it }); }); });
  if (!baru.length) return ok_({ dibuat: 0 }, 'Tidak ada tagihan baru — semua sudah diterbitkan.');
  var potongan = DB.all('PotonganTagihan'), idBaru = reserveIds_('Tagihan', baru.length), tdy = today_();
  var rows = baru.map(function (x, i) {
    var harga = tgHargaRencana_(rc, x.s), jenis = rc.sekali ? 'Sekali' : 'Bulanan';
    var pot = tgPotongan_(potongan, x.s.NIS, jenis, rc.b ? rc.b.kode : x.it.kode, x.it.kode, x.it.periode, harga), gratis = pot.jumlah === 0;
    return { TagihanID: idBaru[i], NIS: x.s.NIS, Jenis: jenis, BiayaKode: rc.b ? rc.b.kode : '', Periode: x.it.periode, KodeTagihan: x.it.kode, NamaTagihan: x.it.nama,
      JumlahAsal: harga, Potongan: pot.potongan, Jumlah: pot.jumlah, AlasanPotongan: pot.alasan, Status: gratis ? 'Gratis' : 'Belum Bayar', TanggalTerbit: tdy,
      JatuhTempo: x.it.jatuhTempo, TanggalLunas: gratis ? tdy : '', DiterbitkanOleh: u.UserID, Keterangan: '', kelas_id: x.s.kelas_id };
  });
  DB.appendBatch('Tagihan', rows);
  bump_('tagihan');
  // 1 notifikasi in-app + 1 WA per siswa (bukan per bulan); yang Gratis tidak diberi tahu
  var subjek = tgPetaSubjek_(), uidOf = tgUserOf_(), per = {}, urut = [];
  rows.filter(function (t) { return t.Status !== 'Gratis'; }).forEach(function (t) { if (!per[t.NIS]) { per[t.NIS] = []; urut.push(t.NIS); } per[t.NIS].push(t); });
  var rek = setting_('REKENING_BANK', '-'), isi = urut.map(function (nis) {
    var s = subjek[nis] || {}, ts = per[nis], total = ts.reduce(function (a, t) { return a + uang_(t.Jumlah); }, 0);
    var label = ts.length === 1 ? ts[0].NamaTagihan : (rc.b ? rc.b.nama + ' ' : '') + ts.map(function (t) { return t.Jenis === 'Bulanan' ? tgLabel_(t.Periode) : t.NamaTagihan; }).join(', ');
    return { s: s, judul: ts.length === 1 ? 'Tagihan Baru: ' + ts[0].NamaTagihan : 'Tagihan Baru (' + ts.length + ' bulan)', pesan: 'Tagihan ' + label + ' sebesar ' + tgRp_(total) + ' telah terbit.' + (ts.length > 1 ? ' Bisa dibayar sekaligus atau per bulan.' : ''),
      vars: { periode: label, jumlah: tgRp_(total), rekening: rek, nis: nis, jatuhTempo: ts[0].JatuhTempo + (ts.length > 1 ? ' (bulan pertama; berikutnya tiap tanggal ' + (rc.tgl || '') + ')' : '') }, refId: ts[0].TagihanID };
  });
  notifApp_(isi.map(function (x) { return { user_id: uidOf[x.s.NIS], judul: x.judul, pesan: x.pesan, tipe: 'tagihan', link: 'tagihan' }; }));
  tgWA_('TAGIHAN_TERBIT', isi.map(function (x) { return { penerima: tgPenerima_(x.s), vars: x.vars, refId: x.refId }; }));
  var nSiswa = Object.keys(rows.reduce(function (o, t) { o[t.NIS] = 1; return o; }, {})).length;
  var res = ok_({ dibuat: rows.length, siswa: nSiswa, periodeList: rc.daftar, kode: rc.kode || '' },
    rows.length + ' tagihan diterbitkan untuk ' + nSiswa + ' siswa' + (rc.sekali ? ' (' + rc.items[0].nama + ').' : ' (' + rc.b.nama + ', ' + rc.daftar.length + ' bulan).'));
  res.auditDetail = JSON.stringify({ biaya: rc.b ? rc.b.kode : rc.kode, periode: rc.daftar, dibuat: rows.length, siswa: nSiswa });
  return res;
}

// ---------------------------------------------------------------------
// 4. BAYAR — 1 BUKTI UNTUK 1 ATAU BEBERAPA TAGIHAN
// ---------------------------------------------------------------------
function svcTgSubmit(ctx, p) {
  var u = tgU_(ctx), keu = isKeu_(ctx);
  var ids = tgIds_(p.tagihanIds && p.tagihanIds.length ? p.tagihanIds : [p.tagihanId], TG.maksBulan + 1);
  if (!ids.length) return fail_('Pilih minimal satu tagihan.');
  if (ids.length > TG.maksBulan) return fail_('Maksimal ' + TG.maksBulan + ' tagihan dalam satu pembayaran.');
  var tagihan = ids.map(function (id) { return DB.find('Tagihan', 'TagihanID', id); });
  if (tagihan.some(function (t) { return !t; })) return fail_('Tagihan tidak ditemukan.');
  if (u.Role === 'siswa' && tagihan.some(function (t) { return String(t.NIS) !== String(ctx.session.ref); })) return fail_('Tagihan ini bukan milik Anda.', { code: 'FORBIDDEN' });
  if (tagihan.some(function (t) { return t.NIS !== tagihan[0].NIS; })) return fail_('Satu bukti transfer hanya untuk tagihan satu siswa.');
  var salah = tagihan.filter(function (t) { return !TG_BELUM[t.Status]; })[0];
  if (salah) return fail_('Tagihan ' + (salah.NamaTagihan || salah.TagihanID) + ' berstatus ' + salah.Status + ' — tidak perlu dibayar lagi.');
  tagihan.sort(function (a, b) { return String(a.JatuhTempo).localeCompare(String(b.JatuhTempo)); });
  var total = tagihan.reduce(function (s, t) { return s + uang_(t.Jumlah); }, 0), jumlah = p.jumlah === undefined || p.jumlah === '' ? total : uang_(p.jumlah);
  if (jumlah < total) return fail_('Nominal transfer ' + tgRp_(jumlah) + ' kurang dari total ' + tgRp_(total) + '.');
  var metode = String(p.metode || 'Transfer').substring(0, 30), buktiId = '';
  if (p.bukti && p.bukti.data) {
    var b64 = String(p.bukti.data).replace(/^data:[^,]+,/, '');
    if (b64.length * 3 / 4 > 5 * 1024 * 1024) return fail_('Ukuran bukti maksimal 5 MB.');
    var mime = p.bukti.mime || 'image/jpeg';
    if (!/^image\/|application\/pdf/.test(mime)) return fail_('Bukti harus berupa foto atau PDF.');
    var nama = tagihan[0].NIS + '_' + tagihan[0].TagihanID + (tagihan.length > 1 ? '_' + tagihan.length + 'tagihan' : '') + '_bukti.' + (mime === 'application/pdf' ? 'pdf' : 'jpg');
    buktiId = shareLink_(saveBase64File_(CONFIG.BUKTI_FOLDER, nama, mime, b64)).getId();
  }
  if (!buktiId && !(keu && /tunai|cash/i.test(metode))) return fail_('Unggah bukti transfer terlebih dahulu.');
  var pid = reserveIds_('Pembayaran', tagihan.length), grup = tagihan.length > 1 ? pid[0] : '', akhir = tagihan.length - 1;
  DB.appendBatch('Pembayaran', tagihan.map(function (t, i) {
    return { PembayaranID: pid[i], TagihanID: t.TagihanID, NIS: t.NIS, Jumlah: uang_(t.Jumlah) + (i === akhir ? jumlah - total : 0), Metode: metode, NoReferensi: String(p.noReferensi || '').substring(0, 60),
      BuktiID: buktiId, Status: 'Menunggu', TanggalBayar: /^\d{4}-\d{2}-\d{2}$/.test(String(p.tanggalBayar || '')) ? p.tanggalBayar : today_(), VerifiedBy: '', VerifiedAt: '', Catatan: String(p.catatan || '').substring(0, 200), GrupBayar: grup, NoKwitansi: '' };
  }));
  DB.updateBatch('Tagihan', 'TagihanID', tagihan.map(function (t) { return { TagihanID: t.TagihanID, Status: 'Menunggu Verifikasi' }; }));
  bump_('tagihan');
  if (keu && p.langsungVerifikasi) {                        // pembayaran di loket: catat + verifikasi sekaligus
    var v = svcTgVerify(ctx, { pembayaranId: pid[0], aksi: 'terima' });
    if (v.success) { v.data.PembayaranID = pid[0]; v.message = 'Pembayaran dicatat & diverifikasi · kwitansi ' + v.data.noKwitansi + '.'; }
    return v;
  }
  return ok_({ PembayaranID: pid[0], GrupBayar: grup, jumlahTagihan: tagihan.length, total: jumlah },
    'Bukti pembayaran ' + (tagihan.length > 1 ? tagihan.length + ' tagihan ' : '') + 'terkirim, menunggu verifikasi bendahara.');
}

/** Data URL bukti (cadangan bila thumbnail Drive tidak bisa dibuka, & mode demo) */
function svcTgBukti(ctx, p) {
  var b = DB.find('Pembayaran', 'PembayaranID', p.pembayaranId);
  if (!b || !b.BuktiID) return fail_('Bukti tidak tersedia.');
  if (ctx.session.role === 'siswa' && String(b.NIS) !== String(ctx.session.ref)) return fail_('Bukti ini bukan milik Anda.', { code: 'FORBIDDEN' });
  var k = 'bukti_' + b.BuktiID, c = CacheX.get(k);
  if (c) return ok_(c);
  var blob = DriveApp.getFileById(b.BuktiID).getBlob();
  var url = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  CacheX.put(k, url, 21600);
  return ok_(url);
}

// ---------------------------------------------------------------------
// 5. VERIFIKASI — 1 KLIK UNTUK SEMUA TAGIHAN DALAM 1 BUKTI
// ---------------------------------------------------------------------
function svcTgVerify(ctx, p) {
  var u = tgU_(ctx), bayar = DB.find('Pembayaran', 'PembayaranID', p.pembayaranId);
  if (!bayar) return fail_('Pembayaran tidak ditemukan.');
  var anggota = bayar.GrupBayar ? DB.filter('Pembayaran', function (b) { return b.GrupBayar === bayar.GrupBayar && b.Status === 'Menunggu'; }) : (bayar.Status === 'Menunggu' ? [bayar] : []);
  if (!anggota.length) return fail_('Pembayaran ini sudah diverifikasi sebelumnya.');
  if (p.aksi === 'tolak' && !String(p.catatan || '').trim()) return fail_('Alasan penolakan wajib diisi.');
  var tg = {};
  anggota.forEach(function (b) { tg[b.TagihanID] = DB.find('Tagihan', 'TagihanID', b.TagihanID); });
  if (anggota.some(function (b) { return !tg[b.TagihanID]; })) return fail_('Tagihan terkait tidak ditemukan.');
  var label = anggota.map(function (b) { return tg[b.TagihanID].NamaTagihan; }).join(', ');
  var s = DB.find('Siswa', 'NIS', bayar.NIS) || {}, waktu = nowIso_(), ref = bayar.GrupBayar || bayar.PembayaranID, uid = tgUserOf_()[bayar.NIS];
  if (p.aksi === 'tolak') {
    DB.updateBatch('Pembayaran', 'PembayaranID', anggota.map(function (b) { return { PembayaranID: b.PembayaranID, Status: 'Ditolak', VerifiedBy: u.UserID, VerifiedAt: waktu, Catatan: String(p.catatan).substring(0, 200) }; }));
    DB.updateBatch('Tagihan', 'TagihanID', anggota.map(function (b) { var t = tg[b.TagihanID]; return { TagihanID: b.TagihanID, Status: t.JatuhTempo && String(t.JatuhTempo) < today_() ? 'Terlambat' : 'Belum Bayar' }; }));
    bump_('tagihan');
    notifApp_([{ user_id: uid, judul: 'Bukti Pembayaran Ditolak', pesan: p.catatan + ' (' + label + ')', tipe: 'danger', link: 'tagihan' }]);
    tgWA_('PEMBAYARAN_VERIFIKASI', [{ penerima: tgPenerima_(s), vars: { periode: label, status: 'DITOLAK', catatan: 'Alasan: ' + p.catatan + '. Silakan unggah ulang bukti yang benar.' }, refId: ref }]);
    return ok_({ jumlahTagihan: anggota.length }, 'Pembayaran ' + (anggota.length > 1 ? anggota.length + ' tagihan ' : '') + 'ditolak.');
  }
  var noKw = tgNoKwitansi_();                               // 1 kwitansi per transaksi (bukti)
  DB.updateBatch('Pembayaran', 'PembayaranID', anggota.map(function (b) { return { PembayaranID: b.PembayaranID, Status: 'Terverifikasi', VerifiedBy: u.UserID, VerifiedAt: waktu, NoKwitansi: noKw }; }));
  var terbayar = {};
  DB.filter('Pembayaran', function (b) { return tg[b.TagihanID] && b.Status === 'Terverifikasi'; }).forEach(function (b) { terbayar[b.TagihanID] = (terbayar[b.TagihanID] || 0) + uang_(b.Jumlah); });
  var semuaLunas = true;
  DB.updateBatch('Tagihan', 'TagihanID', anggota.map(function (b) {
    var t = tg[b.TagihanID], dibayar = terbayar[b.TagihanID] || 0, patch = { TagihanID: t.TagihanID };
    if (dibayar >= uang_(t.Jumlah)) { patch.Status = 'Lunas'; patch.TanggalLunas = today_(); } else semuaLunas = false;
    if (dibayar > uang_(t.Jumlah)) patch.Keterangan = 'Kelebihan bayar ' + tgRp_(dibayar - uang_(t.Jumlah));
    return patch;
  }));
  bump_('tagihan');
  notifApp_([{ user_id: uid, judul: 'Pembayaran Terverifikasi', pesan: 'Tagihan ' + label + ' telah ' + (semuaLunas ? 'Lunas' : 'diperbarui') + '. Kwitansi ' + noKw + ' bisa diunduh.', tipe: 'success', link: 'tagihan' }]);
  tgWA_('PEMBAYARAN_VERIFIKASI', [{ penerima: tgPenerima_(s), vars: { periode: label, status: semuaLunas ? 'LUNAS ✅' : 'Terverifikasi', catatan: 'No. kwitansi ' + noKw + '. Terima kasih, pembayaran Anda telah kami terima.' }, refId: ref }]);
  return ok_({ statusTagihan: semuaLunas ? 'Lunas' : 'Terverifikasi', jumlahTagihan: anggota.length, noKwitansi: noKw, PembayaranID: bayar.PembayaranID },
    (anggota.length > 1 ? anggota.length + ' tagihan' : 'Pembayaran') + ' diverifikasi · kwitansi ' + noKw + '.');
}

function svcTgPending(ctx, p) {
  var subjek = tgPetaSubjek_(), kelas = tgPetaKelas_();
  return ok_(DB.filter('Pembayaran', function (b) { return b.Status === 'Menunggu'; }).map(function (b) {
    var s = subjek[b.NIS] || {}, t = DB.find('Tagihan', 'TagihanID', b.TagihanID) || {};
    return Object.assign({}, b, { Nama: s.nama_lengkap || '-', Nomor: b.NIS, Kelas: kelas[s.kelas_id] || '', Periode: t.Periode || '', NamaTagihan: t.NamaTagihan || '', NominalTagihan: uang_(t.Jumlah),
      BuktiURL: tgFileUrl_(b.BuktiID), BuktiThumb: tgThumbUrl_(b.BuktiID, 480) });
  }));
}

// ---------------------------------------------------------------------
// 6. BATAL TERBITKAN & UBAH NOMINAL
// ---------------------------------------------------------------------
function svcTgCancel(ctx, p) {
  var ids = tgIds_(p.tagihanIds);
  if (!ids.length) return fail_('Pilih minimal satu tagihan yang akan dibatalkan.');
  var set = {}; ids.forEach(function (id) { set[id] = 1; });
  var tagihan = DB.all('Tagihan').filter(function (t) { return set[t.TagihanID]; });
  if (!tagihan.length) return fail_('Tagihan tidak ditemukan (mungkin sudah dibatalkan).');
  var adaBayar = {};
  DB.all('Pembayaran').forEach(function (b) { if (set[b.TagihanID] && (b.Status === 'Menunggu' || b.Status === 'Terverifikasi')) adaBayar[b.TagihanID] = b.Status; });
  var subjek = tgPetaSubjek_(), hapus = [], lewati = [];
  tagihan.forEach(function (t) {
    var info = { TagihanID: t.TagihanID, Nama: (subjek[t.NIS] || {}).nama_lengkap || '-', NamaTagihan: t.NamaTagihan, Status: t.Status };
    if (!TG_BISA_BATAL[t.Status]) { info.alasan = 'Sudah ' + t.Status; lewati.push(info); return; }
    if (adaBayar[t.TagihanID]) { info.alasan = adaBayar[t.TagihanID] === 'Menunggu' ? 'Ada bukti menunggu verifikasi' : 'Sudah ada pembayaran terverifikasi'; lewati.push(info); return; }
    hapus.push(t);
  });
  if (!hapus.length) return fail_('Tidak ada tagihan yang bisa dibatalkan — ' + lewati.length + ' tagihan sudah dibayar / menunggu verifikasi.');
  DB.deleteWhere('Tagihan', 'TagihanID', hapus.map(function (t) { return t.TagihanID; }));
  bump_('tagihan');
  var uidOf = tgUserOf_(), per = {}, urut = [];
  hapus.filter(function (t) { return t.Status !== 'Gratis'; }).forEach(function (t) { if (!per[t.NIS]) { per[t.NIS] = []; urut.push(t.NIS); } per[t.NIS].push(t); });
  notifApp_(urut.map(function (nis) {
    var ts = per[nis], total = ts.reduce(function (a, t) { return a + uang_(t.Jumlah); }, 0);
    return { user_id: uidOf[nis], judul: 'Tagihan Dibatalkan', tipe: 'warning', link: 'tagihan', pesan: 'Tagihan ' + ts.map(function (t) { return t.NamaTagihan; }).join(', ') + ' (' + tgRp_(total) + ') dibatalkan bendahara. Tidak perlu dibayar.' };
  }));
  var nSiswa = Object.keys(hapus.reduce(function (o, t) { o[t.NIS] = 1; return o; }, {})).length;
  var res = ok_({ dibatalkan: hapus.length, siswa: nSiswa, dilewati: lewati },
    hapus.length + ' tagihan dibatalkan (' + nSiswa + ' siswa).' + (lewati.length ? ' ' + lewati.length + ' dilewati karena sudah dibayar / menunggu verifikasi.' : ''));
  res.auditDetail = JSON.stringify({ dibatalkan: hapus.length, siswa: nSiswa, dilewati: lewati.length, ids: hapus.map(function (t) { return t.TagihanID; }).join(',') }).substring(0, 400);
  return res;
}

function svcTgUbahNominal(ctx, p) {
  var t = DB.find('Tagihan', 'TagihanID', p.tagihanId);
  if (!t) return fail_('Tagihan tidak ditemukan.');
  if (!TG_BELUM[t.Status] && t.Status !== 'Gratis') return fail_('Hanya tagihan yang belum dibayar yang bisa diubah (status ' + t.Status + ').');
  var asal = uang_(t.JumlahAsal || t.Jumlah), baru = uang_(p.jumlahBaru);
  if (String(p.jumlahBaru) === '' || p.jumlahBaru === undefined || baru < 0 || baru > asal) return fail_('Nominal baru harus 0 s.d. ' + tgRp_(asal) + '.');
  if (!String(p.alasan || '').trim()) return fail_('Alasan perubahan wajib diisi.');
  var patch = { TagihanID: t.TagihanID, Jumlah: baru, JumlahAsal: asal, Potongan: asal - baru, AlasanPotongan: String(p.alasan).trim().substring(0, 200),
    Status: baru === 0 ? 'Gratis' : (TG_BELUM[t.Status] ? t.Status : 'Belum Bayar'), TanggalLunas: baru === 0 ? today_() : '' };
  DB.updateBatch('Tagihan', 'TagihanID', [patch]);
  bump_('tagihan');
  notifApp_([{ user_id: tgUserOf_()[t.NIS], judul: 'Nominal Tagihan Diperbarui', pesan: t.NamaTagihan + ': ' + tgRp_(t.Jumlah) + ' → ' + tgRp_(baru) + ' (' + patch.AlasanPotongan + ').', tipe: 'info', link: 'tagihan' }]);
  var res = ok_(patch, 'Nominal tagihan diperbarui menjadi ' + tgRp_(baru) + '.');
  res.auditDetail = JSON.stringify({ id: t.TagihanID, dari: uang_(t.Jumlah), ke: baru, alasan: patch.AlasanPotongan }).substring(0, 400);
  return res;
}

// ---------------------------------------------------------------------
// 7. MASTER JENIS BIAYA (custom per sekolah)
// ---------------------------------------------------------------------
function svcTgBiayaList(ctx, p) {
  var pakai = {}; DB.all('Tagihan').forEach(function (t) { var k = t.BiayaKode || ''; if (k) pakai[k] = (pakai[k] || 0) + 1; });
  return ok_({ rows: DB.all('Biaya').map(function (b) { return Object.assign({}, b, { khusus: tgKhusus_(b), tagihan: pakai[b.kode] || 0 }); }),
    kelas: DB.all('Kelas').map(function (k) { return { kelas_id: k.kelas_id, nama_kelas: k.nama_kelas, jenjang: k.jenjang }; }) });
}
function svcTgBiayaSave(ctx, p) {
  var x = p.row || {}, isNew = !x.biaya_id;
  var kode = String(x.kode || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,20}$/.test(kode)) return fail_('Kode biaya 2–21 huruf besar/angka/tanda -, contoh SPP, UANG-MAKAN.');
  if (!String(x.nama || '').trim()) return fail_('Nama biaya wajib diisi.');
  var jenis = x.jenis === 'Sekali' ? 'Sekali' : 'Bulanan';
  if (x.nominal === undefined || String(x.nominal) === '' || uang_(x.nominal) < 0) return fail_('Nominal dasar wajib diisi (boleh 0 bila semua memakai nominal khusus).');
  var khusus = typeof x.nominal_khusus === 'object' && x.nominal_khusus ? x.nominal_khusus : (function () { try { return JSON.parse(x.nominal_khusus || '{}'); } catch (e) { return null; } })();
  if (!khusus || typeof khusus !== 'object') return fail_('Nominal khusus tidak valid.');
  var bersih = {};
  for (var k in khusus) {
    if (!/^(NIS|KELAS|JENJANG):[A-Za-z0-9.-]+$/.test(k)) return fail_('Kunci nominal khusus tidak dikenal: ' + k);
    if (String(khusus[k]) === '' || uang_(khusus[k]) < 0) return fail_('Nominal khusus ' + k + ' tidak valid.');
    bersih[k] = uang_(khusus[k]);
  }
  var tgl = parseInt(x.jatuh_tempo_tgl || '', 10);
  if (jenis === 'Bulanan' && x.jatuh_tempo_tgl && !(tgl >= 1 && tgl <= 28)) return fail_('Tanggal jatuh tempo bulanan 1–28.');
  if (jenis === 'Sekali' && x.jatuh_tempo && !/^\d{4}-\d{2}-\d{2}$/.test(x.jatuh_tempo)) return fail_('Jatuh tempo sekali bayar berformat yyyy-MM-dd.');
  var dupe = DB.all('Biaya').filter(function (b) { return String(b.kode).toUpperCase() === kode && b.biaya_id !== x.biaya_id; })[0];
  if (dupe) return fail_('Kode ' + kode + ' sudah dipakai biaya ' + dupe.nama + '.');
  var row = { kode: kode, nama: String(x.nama).trim().substring(0, 80), jenis: jenis, nominal: uang_(x.nominal), nominal_khusus: JSON.stringify(bersih), jatuh_tempo_tgl: jenis === 'Bulanan' && tgl ? String(tgl) : '',
    jatuh_tempo: jenis === 'Sekali' ? String(x.jatuh_tempo || '') : '', keterangan: String(x.keterangan || '').substring(0, 200), aktif: String(x.aktif || 'YA').toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA' };
  if (isNew) { row.biaya_id = reserveIds_('Biaya', 1)[0]; row.dibuat_pada = nowIso_(); DB.appendBatch('Biaya', [row]); }
  else {
    var lama = DB.find('Biaya', 'biaya_id', x.biaya_id);
    if (!lama) return fail_('Jenis biaya tidak ditemukan.');
    if (String(lama.kode).toUpperCase() !== kode && DB.all('Tagihan').some(function (t) { return t.BiayaKode === lama.kode; })) return fail_('Kode tidak bisa diubah karena sudah dipakai tagihan. Buat jenis biaya baru.');
    row.biaya_id = lama.biaya_id; DB.updateBatch('Biaya', 'biaya_id', [row]);
  }
  return ok_(row, (isNew ? 'Jenis biaya ' + row.nama + ' ditambahkan.' : 'Jenis biaya diperbarui.') + ' Perubahan nominal berlaku untuk tagihan yang diterbitkan berikutnya.');
}
function svcTgBiayaDelete(ctx, p) {
  var b = DB.find('Biaya', 'biaya_id', p.biaya_id);
  if (!b) return fail_('Jenis biaya tidak ditemukan.');
  if (DB.all('Tagihan').some(function (t) { return t.BiayaKode === b.kode; })) return fail_('Biaya ini sudah dipakai tagihan — nonaktifkan saja agar riwayat tetap utuh.');
  DB.deleteWhere('Biaya', 'biaya_id', [b.biaya_id]);
  return ok_(null, 'Jenis biaya ' + b.nama + ' dihapus.');
}

// ---------------------------------------------------------------------
// 8. POTONGAN / BEASISWA
// ---------------------------------------------------------------------
function svcTgDiscountList(ctx, p) {
  var subjek = tgPetaSubjek_(), kelas = tgPetaKelas_();
  return ok_(DB.all('PotonganTagihan').map(function (r) { var s = subjek[r.NIS] || {}; return Object.assign({}, r, { Nama: s.nama_lengkap || '-', Kelas: kelas[s.kelas_id] || '' }); }));
}
function svcTgDiscountSave(ctx, p) {
  var d = p.data || {}, u = tgU_(ctx);
  if (!DB.find('Siswa', 'NIS', d.NIS)) return fail_('Siswa tidak ditemukan.');
  if (['Persen', 'Nominal', 'Gratis'].indexOf(d.Tipe) === -1) return fail_('Tipe potongan: Persen, Nominal, atau Gratis.');
  var nilai = d.Tipe === 'Gratis' ? 100 : uang_(d.Nilai);
  if (!(nilai > 0) || (d.Tipe === 'Persen' && nilai > 100)) return fail_('Nilai potongan tidak valid.');
  var berlaku = String(d.Berlaku || 'Semua');
  if (!/^(Semua|Bulanan|Sekali|KODE:[A-Z0-9-]+)$/.test(berlaku)) return fail_('Berlaku: Semua, Bulanan, Sekali, atau KODE:<kode biaya>.');
  var rx = /^(\d{4}-(0[1-9]|1[0-2]))?$/;
  if (!rx.test(d.Mulai || '') || !rx.test(d.Sampai || '')) return fail_('Mulai/Sampai berformat yyyy-MM (boleh kosong).');
  if (!String(d.Alasan || '').trim()) return fail_('Alasan potongan wajib (mis. Beasiswa Prestasi).');
  var row = { NIS: String(d.NIS), Tipe: d.Tipe, Nilai: nilai, Berlaku: berlaku, Mulai: d.Mulai || '', Sampai: d.Sampai || '', Alasan: String(d.Alasan).trim().substring(0, 120), Aktif: String(d.Aktif || 'YA').toUpperCase() === 'TIDAK' ? 'TIDAK' : 'YA' };
  if (d.PotonganID && DB.find('PotonganTagihan', 'PotonganID', d.PotonganID)) {
    row.PotonganID = d.PotonganID; DB.updateBatch('PotonganTagihan', 'PotonganID', [row]);
    return ok_(row, 'Potongan diperbarui. Berlaku untuk tagihan yang diterbitkan berikutnya.');
  }
  row.PotonganID = reserveIds_('PotonganTagihan', 1)[0]; row.DibuatOleh = u.UserID; row.DibuatPada = nowIso_();
  DB.appendBatch('PotonganTagihan', [row]);
  return ok_(row, 'Potongan disimpan. Berlaku untuk tagihan yang diterbitkan berikutnya.');
}
function svcTgDiscountDelete(ctx, p) {
  if (!DB.find('PotonganTagihan', 'PotonganID', p.potonganId)) return fail_('Potongan tidak ditemukan.');
  DB.deleteWhere('PotonganTagihan', 'PotonganID', [p.potonganId]);
  return ok_(null, 'Potongan dihapus (tagihan yang sudah terbit tidak berubah).');
}

// ---------------------------------------------------------------------
// 9. RIWAYAT PEMBAYARAN & EKSPOR DENGAN LINK BUKTI
// ---------------------------------------------------------------------
function tgRiwayat_(nis) {
  var tagihan = DB.filter('Tagihan', function (t) { return String(t.NIS) === String(nis); }).sort(function (a, b) { return String(b.JatuhTempo).localeCompare(String(a.JatuhTempo)); });
  var tg = {}; tagihan.forEach(function (t) { tg[t.TagihanID] = t; });
  var peta = {}, urut = [];
  DB.filter('Pembayaran', function (b) { return String(b.NIS) === String(nis); }).forEach(function (b) {
    var k = b.GrupBayar || b.PembayaranID;
    if (!peta[k]) {
      peta[k] = { PembayaranID: b.PembayaranID, GrupBayar: b.GrupBayar || '', TanggalBayar: b.TanggalBayar, Metode: b.Metode, NoReferensi: b.NoReferensi, Status: b.Status, Catatan: b.Catatan, VerifiedAt: b.VerifiedAt,
        NoKwitansi: b.NoKwitansi || '', BuktiID: b.BuktiID, BuktiURL: tgFileUrl_(b.BuktiID), BuktiThumb: tgThumbUrl_(b.BuktiID, 480), Jumlah: 0, item: [] };
      urut.push(k);
    }
    var t = tg[b.TagihanID];
    peta[k].Jumlah += uang_(b.Jumlah);
    peta[k].item.push({ TagihanID: b.TagihanID, NamaTagihan: t ? t.NamaTagihan : '(tagihan dibatalkan)', Nominal: t ? uang_(t.Jumlah) : 0, Dibatalkan: !t });
  });
  var transaksi = urut.map(function (k) { return peta[k]; }).sort(function (a, b) { return String(b.TanggalBayar).localeCompare(String(a.TanggalBayar)) || String(b.PembayaranID).localeCompare(String(a.PembayaranID)); });
  var nilai = function (st) { return tagihan.filter(function (t) { return st[t.Status]; }).reduce(function (s, t) { return s + uang_(t.Jumlah); }, 0); };
  var hitung = function (st) { return tagihan.filter(function (t) { return st[t.Status]; }).length; };
  return { tagihan: tagihan, transaksi: transaksi, ringkasan: { lunas: nilai({ 'Lunas': 1 }), tunggakan: nilai(TG_BELUM), menunggu: nilai({ 'Menunggu Verifikasi': 1 }),
    potongan: tagihan.reduce(function (s, t) { return s + uang_(t.Potongan); }, 0), nLunas: hitung({ 'Lunas': 1 }), nBelum: hitung(TG_BELUM), nMenunggu: hitung({ 'Menunggu Verifikasi': 1 }), nGratis: hitung({ 'Gratis': 1 }) } };
}
function svcTgHistory(ctx, p) {
  var s = DB.find('Siswa', 'NIS', p.NIS || p.subjekId);
  if (!s) return fail_('Siswa tidak ditemukan.');
  return ok_(tgRiwayat_(s.NIS));
}
function tgTambahBukti_(rows) {
  var prio = { 'Terverifikasi': 3, 'Menunggu': 2, 'Ditolak': 1 };
  var kunci = function (b) { return (prio[b.Status] || 0) + '|' + String(b.TanggalBayar) + '|' + ('0000000000' + String(b.PembayaranID).replace(/\D/g, '')).slice(-10); };
  var pilih = {}, perGrup = {};
  DB.all('Pembayaran').forEach(function (b) { if (b.GrupBayar) perGrup[b.GrupBayar] = (perGrup[b.GrupBayar] || 0) + 1; if (!pilih[b.TagihanID] || kunci(b) > kunci(pilih[b.TagihanID])) pilih[b.TagihanID] = b; });
  return rows.map(function (t) {
    var b = pilih[t.TagihanID];
    return Object.assign({}, t, b ? { TanggalBayar: b.TanggalBayar, JumlahBayar: uang_(b.Jumlah), MetodeBayar: b.Metode, NoReferensi: b.NoReferensi, StatusBayar: b.Status, NoKwitansi: b.NoKwitansi || '', BuktiURL: tgFileUrl_(b.BuktiID), BuktiUntuk: b.GrupBayar ? perGrup[b.GrupBayar] : 1 }
      : { TanggalBayar: '', JumlahBayar: '', MetodeBayar: '', NoReferensi: '', StatusBayar: '', NoKwitansi: '', BuktiURL: '', BuktiUntuk: 0 });
  });
}

// ---------------------------------------------------------------------
// 10. KWITANSI (nomor saat diverifikasi, PDF di browser, QR verifikasi publik)
// ---------------------------------------------------------------------
function tgNoKwitansi_() {                                  // dipanggil di dalam lock tulis
  var th = today_().substring(0, 4), k = 'SEQ_KWITANSI_' + th;
  var n = (parseInt(propFresh_(k) || '0', 10) || 0) + 1;
  setProp_(k, String(n));
  return setting_('KWITANSI_PREFIX', 'KW') + '-' + th + '-' + ('00000' + n).slice(-6);
}
function tgKodeKwitansi_(no) {
  var rahasia = prop_('QR_SECRET') || secret_();            // rahasia hanya di Script Properties
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(no), rahasia)).replace(/[^A-Za-z0-9]/g, '').substring(0, 10);
}
function tgTerbilang_(n) {
  n = Math.floor(Math.abs(uang_(n)));
  var s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  var f = function (x) {
    if (x < 12) return s[x];
    if (x < 20) return f(x - 10) + ' belas';
    if (x < 100) return f(Math.floor(x / 10)) + ' puluh ' + f(x % 10);
    if (x < 200) return 'seratus ' + f(x - 100);
    if (x < 1000) return f(Math.floor(x / 100)) + ' ratus ' + f(x % 100);
    if (x < 2000) return 'seribu ' + f(x - 1000);
    if (x < 1e6) return f(Math.floor(x / 1000)) + ' ribu ' + f(x % 1000);
    if (x < 1e9) return f(Math.floor(x / 1e6)) + ' juta ' + f(x % 1e6);
    if (x < 1e12) return f(Math.floor(x / 1e9)) + ' miliar ' + f(x % 1e9);
    return f(Math.floor(x / 1e12)) + ' triliun ' + f(x % 1e12);
  };
  var hasil = n === 0 ? 'nol' : f(n).replace(/\s+/g, ' ').trim();
  return hasil.charAt(0).toUpperCase() + hasil.slice(1) + ' rupiah';
}
function svcTgReceipt(ctx, p) {
  var b = DB.find('Pembayaran', 'PembayaranID', p.pembayaranId);
  if (!b || b.Status !== 'Terverifikasi' || !b.NoKwitansi) return fail_('Kwitansi belum tersedia (pembayaran belum diverifikasi).');
  if (ctx.session.role === 'siswa' && String(b.NIS) !== String(ctx.session.ref)) return fail_('Kwitansi ini bukan milik Anda.', { code: 'FORBIDDEN' });
  var s = DB.find('Siswa', 'NIS', b.NIS) || {}, kelas = tgPetaKelas_();
  var anggota = b.GrupBayar ? DB.filter('Pembayaran', function (x) { return x.GrupBayar === b.GrupBayar && x.Status === 'Terverifikasi'; }) : [b];
  var item = anggota.map(function (x) { var t = DB.find('Tagihan', 'TagihanID', x.TagihanID) || {}; return { TagihanID: x.TagihanID, NamaTagihan: t.NamaTagihan || x.TagihanID, Jumlah: uang_(x.Jumlah) }; });
  var total = item.reduce(function (a, x) { return a + x.Jumlah; }, 0), verif = userIdx_()[b.VerifiedBy] || {}, kode = tgKodeKwitansi_(b.NoKwitansi);
  return ok_({ noKwitansi: b.NoKwitansi, tanggal: String(b.VerifiedAt).substring(0, 10), tanggalBayar: b.TanggalBayar, nama: s.nama_lengkap || '-', nomor: 'NIS ' + b.NIS + (kelas[s.kelas_id] ? ' / ' + kelas[s.kelas_id] : ''),
    item: item, total: total, terbilang: tgTerbilang_(total), metode: b.Metode, noReferensi: b.NoReferensi, diverifikasiOleh: setting_('NAMA_BENDAHARA', '') || verif.n || 'Bendahara',
    institusi: setting_('NAMA_SEKOLAH', APP.NAME), alamat: setting_('ALAMAT_SEKOLAH', ''), kodeVerifikasi: kode,
    urlVerifikasi: (setting_('APP_URL', '') || '') + '#kwitansi=' + encodeURIComponent(b.NoKwitansi + '.' + kode) });
}
/** PUBLIK: { kode: 'KW-2026-000001.AbC123xyZ9' } → keaslian kwitansi, nama disamarkan */
function svcTgVerifyReceipt(ctx, p) {
  if (!CONFIG.SPREADSHEET_ID) return fail_('Server belum di-setup.');
  var x = String(p.kode || ''), titik = x.lastIndexOf('.');
  var no = titik > 0 ? x.substring(0, titik) : '', kode = titik > 0 ? x.substring(titik + 1) : '';
  if (!no || !samaAman_(kode, tgKodeKwitansi_(no))) return ok_({ valid: false }, 'Kwitansi tidak dikenal / kode tidak cocok.');
  var rows = DB.filter('Pembayaran', function (b) { return b.NoKwitansi === no && b.Status === 'Terverifikasi'; });
  if (!rows.length) return ok_({ valid: false }, 'Kwitansi tidak ditemukan atau sudah dibatalkan.');
  var s = DB.find('Siswa', 'NIS', rows[0].NIS) || {};
  var samar = String(s.nama_lengkap || '').split(/\s+/).map(function (w) { return w ? w.charAt(0) + '***' : ''; }).join(' ');
  return ok_({ valid: true, noKwitansi: no, nama: samar, institusi: setting_('NAMA_SEKOLAH', APP.NAME), total: rows.reduce(function (a, b) { return a + uang_(b.Jumlah); }, 0), tanggal: String(rows[0].VerifiedAt).substring(0, 10), jumlahTagihan: rows.length }, 'Kwitansi asli.');
}

// ---------------------------------------------------------------------
// 11. PENGINGAT H-3 / H-0 + TANDAI TERLAMBAT
// ---------------------------------------------------------------------
function tgTambahHari_(ymd, n) { var d = new Date(ymd + 'T12:00:00+07:00'); return Utilities.formatDate(new Date(d.getTime() + n * 864e5), APP.TZ, 'yyyy-MM-dd'); }
function tgHitungReminder_(jenis, tanggal) {
  tanggal = tanggal || today_();
  var jt = jenis === 'H3' ? tgTambahHari_(tanggal, 3) : tanggal;
  var subjek = tgPetaSubjek_(), sudah = {}, kirim = [], lewati = [];
  DB.all('ReminderLog').forEach(function (r) { if (r.Status !== 'Gagal') sudah[r.Kunci] = r.Tanggal; });
  DB.all('Tagihan').filter(function (t) { return String(t.JatuhTempo).substring(0, 10) === jt; }).forEach(function (t) {
    var s = subjek[t.NIS];
    if (!s) return;
    var kunci = jenis + '|' + t.TagihanID;
    var x = { kunci: kunci, NIS: t.NIS, TagihanID: t.TagihanID, Nama: s.nama_lengkap, Nomor: t.NIS, HP: s.no_wa_ortu || s.no_wa, Email: s.email, NamaTagihan: t.NamaTagihan, Jumlah: uang_(t.Jumlah), JatuhTempo: jt, Status: t.Status };
    if (TG_TANPA_REMINDER[t.Status]) { x.alasan = 'Sudah ' + t.Status; lewati.push(x); return; }
    if (!TG.subjek.aktif(s)) { x.alasan = 'Siswa tidak aktif'; lewati.push(x); return; }
    if (sudah[kunci]) { x.alasan = 'Sudah diingatkan'; x.sudah = true; lewati.push(x); return; }
    kirim.push(x);
  });
  return { jenis: jenis, tanggal: tanggal, jatuhTempo: jt, kirim: kirim, lewati: lewati };
}
function tgJalankanReminder_(jenis, tanggal, opsi, u) {
  opsi = opsi || {};
  var h = tgHitungReminder_(jenis, tanggal), sasaran = h.kirim;
  if (opsi.ulang) sasaran = sasaran.concat(h.lewati.filter(function (x) { return x.sudah; }));
  if (opsi.ids && opsi.ids.length) sasaran = sasaran.filter(function (x) { return opsi.ids.indexOf(x.NIS) > -1 || opsi.ids.indexOf(x.TagihanID) > -1; });
  if (!sasaran.length) return { jenis: jenis, jatuhTempo: h.jatuhTempo, penerima: 0, diantrekan: 0, lewati: h.lewati.length };
  var rek = setting_('REKENING_BANK', '-'), uidOf = tgUserOf_();
  var n = tgWA_(jenis === 'H3' ? 'TAGIHAN_REMINDER_H3' : 'TAGIHAN_REMINDER_H0', sasaran.map(function (x) {
    return { penerima: { nama: x.Nama, hp: x.HP, email: x.Email }, refId: x.TagihanID, vars: { periode: x.NamaTagihan, jumlah: tgRp_(x.Jumlah), jatuhTempo: x.JatuhTempo, rekening: rek, nis: x.Nomor, hari: jenis === 'H3' ? '3 hari lagi' : 'hari ini' } };
  }));
  notifApp_(sasaran.map(function (x) { return { user_id: uidOf[x.NIS], judul: 'Pengingat Tagihan', pesan: x.NamaTagihan + ' (' + tgRp_(x.Jumlah) + ') jatuh tempo ' + (jenis === 'H3' ? '3 hari lagi' : 'hari ini') + ' — ' + x.JatuhTempo + '.', tipe: 'warning', link: 'tagihan' }; }));
  var ids = reserveIds_('ReminderLog', sasaran.length), now = nowIso_();
  DB.appendBatch('ReminderLog', sasaran.map(function (x, i) {
    return { ReminderID: ids[i], Kunci: x.kunci, Jenis: jenis, NIS: x.NIS, TagihanID: x.TagihanID, Nama: x.Nama, Jumlah: x.Jumlah, JatuhTempo: x.JatuhTempo, Mode: opsi.mode || 'Manual', Status: n ? 'Diantrekan' : 'In-app', Oleh: u ? u.Nama : 'Sistem', Tanggal: now };
  }));
  return { jenis: jenis, jatuhTempo: h.jatuhTempo, penerima: sasaran.length, diantrekan: n, lewati: h.lewati.length };
}
function svcTgReminderPreview(ctx, p) {
  var tgl = /^\d{4}-\d{2}-\d{2}$/.test(String(p.tanggal || '')) ? p.tanggal : today_();
  return ok_({ tanggal: tgl, H3: tgHitungReminder_('H3', tgl), H0: tgHitungReminder_('H0', tgl), otomatis: setting_('REMINDER_OTOMATIS', 'TIDAK') === 'YA', jam: setting_('REMINDER_JAM', '08:00'), terakhir: prop_('TG_REMINDER_TERAKHIR') });
}
function svcTgReminderRun(ctx, p) {
  var tgl = /^\d{4}-\d{2}-\d{2}$/.test(String(p.tanggal || '')) ? p.tanggal : today_();
  var r = tgJalankanReminder_(p.jenis === 'H0' ? 'H0' : 'H3', tgl, { ulang: !!p.ulang, ids: p.ids || [] }, tgU_(ctx));
  return ok_(r, r.penerima ? 'Pengingat dikirim ke ' + r.penerima + ' siswa' + (r.diantrekan ? ' (' + r.diantrekan + ' pesan WA/Email diantrekan).' : ' (notifikasi in-app; WA/Email belum aktif).') : 'Tidak ada penerima (semua lunas / sudah diingatkan).');
}
/** Dari pekerjaMenit: tandai Terlambat sekali sehari; pengingat otomatis setelah REMINDER_JAM */
function tgReminderOtomatis_() {
  var hari = today_();
  if (propFresh_('TG_TERLAMBAT_TERAKHIR') !== hari) { setProp_('TG_TERLAMBAT_TERAKHIR', hari); if (tgTandaiTerlambat_()) bump_('adm', true); }
  if (setting_('REMINDER_OTOMATIS', 'TIDAK') !== 'YA') return;
  if (propFresh_('TG_REMINDER_TERAKHIR') === hari || timeNow_().substring(0, 5) < setting_('REMINDER_JAM', '08:00')) return;
  setProp_('TG_REMINDER_TERAKHIR', hari);                    // tandai dulu → tidak dobel walau error
  if (setting_('REMINDER_H3', 'YA') === 'YA') tgJalankanReminder_('H3', hari, { mode: 'Otomatis' }, null);
  if (setting_('REMINDER_H0', 'YA') === 'YA') tgJalankanReminder_('H0', hari, { mode: 'Otomatis' }, null);
  bump_('adm', true);
}
function tgTandaiTerlambat_() {
  var hari = today_();
  var lewat = DB.all('Tagihan').filter(function (t) { return t.Status === 'Belum Bayar' && t.JatuhTempo && String(t.JatuhTempo).substring(0, 10) < hari; });
  if (lewat.length) { DB.updateBatch('Tagihan', 'TagihanID', lewat.map(function (t) { return { TagihanID: t.TagihanID, Status: 'Terlambat' }; })); bump_('tagihan'); }
  return lewat.length;
}

// ---------------------------------------------------------------------
// 12. PENGATURAN KEUANGAN (bendahara boleh mengubah tanpa akses Pengaturan umum)
// ---------------------------------------------------------------------
function svcTgSettingsGet(ctx, p) {
  var ket = {}; CONFIG_SEED.forEach(function (r) { ket[r[0]] = r[2]; });
  var s = settings_();
  return ok_(Object.keys(s).filter(function (k) { return TG_SETTING.test(k); }).map(function (k) { return { key: k, value: s[k], keterangan: ket[k] || '' }; }));
}
function svcTgSettingsSave(ctx, p) {
  var src = p.pairs || {}, clean = {};
  Object.keys(src).forEach(function (k) { if (TG_SETTING.test(k)) clean[k] = String(src[k]).trim().substring(0, 200); });
  if (clean.JATUH_TEMPO_TANGGAL !== undefined && !(Number(clean.JATUH_TEMPO_TANGGAL) >= 1 && Number(clean.JATUH_TEMPO_TANGGAL) <= 28)) return fail_('Tanggal jatuh tempo 1–28.');
  if (clean.REMINDER_JAM !== undefined && !/^\d{2}:\d{2}$/.test(clean.REMINDER_JAM)) return fail_('Jam pengingat berformat HH:mm.');
  ['REMINDER_OTOMATIS', 'REMINDER_H3', 'REMINDER_H0'].forEach(function (k) { if (clean[k] !== undefined) clean[k] = clean[k] === 'YA' ? 'YA' : 'TIDAK'; });
  if (clean.KWITANSI_PREFIX !== undefined && !/^[A-Z0-9-]{1,10}$/.test(clean.KWITANSI_PREFIX)) return fail_('Awalan kwitansi 1–10 huruf besar/angka.');
  saveSettings_(clean);
  return svcTgSettingsGet(ctx, {});
}

;
// ==== Migrasi.gs ====
/**
 * =====================================================================
 *  SIAKAD SISWA — File 3/5 : Migrasi.gs  (gas-migrasi-database)
 *  Import data dari spreadsheet app LAMA → app baru.
 *  • App lama HANYA DIBACA (openById), tidak pernah ditulis.
 *  • Baca berdasarkan NAMA header (dengan alias), bukan indeks kolom.
 *  • Idempoten (upsert kunci alami) • Dry-run • Delta sync • Batch 1× tulis/sheet
 *  • Keputusan di app baru tidak ditimpa (kecuali opsi "timpa").
 * =====================================================================
 */

/** Alias nama sheet di app lama */
var MIG_SHEET_ALIAS = {
  Kelas: ['Kelas', 'Data Kelas', 'Rombel', 'Classes'],
  Mapel: ['Mapel', 'Mata Pelajaran', 'MataPelajaran', 'Subjects'],
  Guru: ['Guru', 'Data Guru', 'Teachers', 'Pengajar'],
  Siswa: ['Siswa', 'Data Siswa', 'DataSiswa', 'Students', 'Peserta Didik'],
  Users: ['Users', 'User', 'Akun', 'Login'],
  Jadwal: ['Jadwal', 'Jadwal Pelajaran', 'Schedule'],
  Materi: ['Materi', 'Materi Pembelajaran', 'Materials'],
  Absensi: ['Absensi', 'Presensi', 'Kehadiran', 'Attendance'],
  Nilai: ['Nilai', 'Penilaian', 'Grades', 'Raport'],
  Pengumuman: ['Pengumuman', 'Announcements', 'Informasi'],
  Config: ['Config', 'Pengaturan', 'Settings', 'AppConfig']
};
/** Alias kolom → kolom target (dicocokkan setelah dinormalisasi: huruf kecil tanpa spasi/simbol) */
var MIG_COL_ALIAS = {
  NIS: ['nis', 'nomorinduksiswa', 'noinduk', 'nisn_lokal', 'studentid'],
  NISN: ['nisn'],
  nama_lengkap: ['namalengkap', 'nama', 'namasiswa', 'namaguru', 'fullname', 'name'],
  jenis_kelamin: ['jeniskelamin', 'jk', 'gender', 'lp'],
  kelas_id: ['kelasid', 'kelas', 'rombel', 'idkelas', 'namakelas', 'class'],
  jenjang: ['jenjang', 'tingkatpendidikan', 'level'],
  barcode_id: ['barcodeid', 'barcode', 'kodebarcode', 'qr', 'qrcode'],
  email: ['email', 'emailsiswa', 'emailguru', 'surel'],
  no_wa: ['nowa', 'wa', 'nohp', 'hp', 'whatsapp', 'telepon', 'nohpsiswa', 'nowasiswa'],
  nama_ortu: ['namaortu', 'namaorangtua', 'namawali', 'ortu', 'wali'],
  no_wa_ortu: ['nowaortu', 'hportu', 'nohportu', 'waortu', 'nohpwali', 'nowawali', 'telportu', 'nowhatsapporangtua'],
  tempat_lahir: ['tempatlahir'], tanggal_lahir: ['tanggallahir', 'tgllahir', 'ttl_tanggal'],
  alamat: ['alamat', 'alamatdomisili'], foto_profil_url: ['fotoprofilurl', 'foto', 'fotourl', 'pasfoto'],
  tahun_masuk: ['tahunmasuk', 'angkatan', 'tahunangkatan'], status: ['status', 'statussiswa', 'statusaktif'],
  NUPTK: ['nuptk', 'nip', 'guruid', 'idguru', 'kodeguru'],
  mata_pelajaran: ['matapelajaran', 'mapel', 'subject', 'pelajaran'],
  jabatan: ['jabatan', 'tugastambahan'],
  nama_kelas: ['namakelas', 'kelas', 'rombel', 'nama'], tingkat: ['tingkat', 'grade'], wali_kelas_id: ['walikelasid', 'walikelas', 'wali'], tahun_ajaran: ['tahunajaran', 'ta'],
  nama: ['nama', 'namamapel', 'namalengkap'], kode: ['kode', 'kodemapel'], kelompok: ['kelompok', 'kategori'],
  user_id: ['userid', 'id'], password_hash: ['passwordhash', 'hash', 'password'], salt: ['salt'], role: ['role', 'peran', 'level'], ref_id: ['refid', 'nis', 'nuptk', 'nip', 'noinduk'], status_aktif: ['statusaktif', 'aktif', 'status'],
  jadwal_id: ['jadwalid', 'id'], guru_id: ['guruid', 'nuptk', 'nip', 'idguru', 'guru'], hari: ['hari', 'day'], jam_mulai: ['jammulai', 'mulai', 'start'], jam_selesai: ['jamselesai', 'selesai', 'end'], ruang: ['ruang', 'ruangan', 'room'],
  materi_id: ['materiid', 'id'], judul: ['judul', 'title'], deskripsi: ['deskripsi', 'keterangan', 'description'], tipe: ['tipe', 'jenis', 'type'], url_konten: ['urlkonten', 'url', 'link', 'tautan'], drive_file_id: ['drivefileid', 'fileid'], tanggal_upload: ['tanggalupload', 'tanggal', 'createdat'],
  absensi_id: ['absensiid', 'id'], tanggal: ['tanggal', 'tgl', 'date'], jam: ['jam', 'waktu', 'time'], metode: ['metode', 'method', 'cara'], latitude: ['latitude', 'lat'], longitude: ['longitude', 'lng', 'long', 'lon'], foto_selfie_id: ['fotoselfieurl', 'fotoselfie', 'fotoselfieid', 'selfie'], keterangan: ['keterangan', 'catatan', 'note'],
  nilai_id: ['nilaiid', 'id'], semester: ['semester'], nilai_harian: ['nilaiharian', 'harian', 'tugas'], nilai_uts: ['nilaiuts', 'uts', 'pts'], nilai_uas: ['nilaiuas', 'uas', 'pas'], nilai_akhir: ['nilaiakhir', 'akhir', 'na'], catatan: ['catatan', 'deskripsi'],
  pengumuman_id: ['pengumumanid', 'id'], isi: ['isi', 'konten', 'content'], kategori: ['kategori', 'category'], oleh: ['oleh', 'author', 'penulis']
};

function normKey_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/_/g, ''); }

function openSource_(idOrUrl) {
  var m = String(idOrUrl || '').match(/\/d\/([A-Za-z0-9_-]{20,})/);
  var id = m ? m[1] : String(idOrUrl || '').trim();
  if (!id) throw new Error('Tempel URL atau ID spreadsheet app LAMA.');
  if (id === getSS_().getId()) throw new Error('Itu spreadsheet app baru. Tempel spreadsheet app LAMA.');
  try { return SpreadsheetApp.openById(id); }
  catch (e) { throw new Error('Spreadsheet tidak bisa dibuka. Pastikan ID benar & dimiliki / dibagikan ke akun Google pemilik script ini.'); }
}

/** Baca sheet sumber menjadi objek dengan kolom target (lewat alias). null = sheet tidak ada. */
function readSource_(ss, target) {
  var sh = null, names = MIG_SHEET_ALIAS[target] || [target];
  for (var i = 0; i < names.length && !sh; i++) sh = ss.getSheetByName(names[i]);
  if (!sh) {
    var lowerNames = names.map(normKey_);
    ss.getSheets().forEach(function (s) { if (!sh && lowerNames.indexOf(normKey_(s.getName())) > -1) sh = s; });
  }
  if (!sh) return null;
  var v = sh.getDataRange().getValues(); if (v.length <= 1) return { sheet: sh.getName(), rows: [], headers: v[0] || [] };
  var h = v[0].map(String), hn = h.map(normKey_);
  var cols = SCHEMA[target] ? SCHEMA[target].cols : Object.keys(MIG_COL_ALIAS);
  var peta = {};                                          // kolom target → indeks sumber
  cols.forEach(function (c) {
    var exact = h.indexOf(c); if (exact > -1) { peta[c] = exact; return; }
    var cand = [normKey_(c)].concat(MIG_COL_ALIAS[c] || []);
    for (var j = 0; j < cand.length; j++) { var ix = hn.indexOf(cand[j]); if (ix > -1 && Object.keys(peta).map(function (k) { return peta[k]; }).indexOf(ix) === -1) { peta[c] = ix; return; } }
  });
  var rows = v.slice(1).filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    var o = { _raw: {} }; h.forEach(function (k, i) { o._raw[normKey_(k)] = r[i]; });
    Object.keys(peta).forEach(function (c) { o[c] = r[peta[c]]; });
    return o;
  });
  return { sheet: sh.getName(), rows: rows, headers: h, peta: peta };
}

// ---- Normalisasi nilai ----
function tglIso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd');
  var s = String(v || '').trim(); if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}
function jamIso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, APP.TZ, 'HH:mm:ss');
  var m = String(v || '').match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] + ':' + (m[3] || '00') : '';
}
function jamHM_(v) { var j = jamIso_(v); return j ? j.substring(0, 5) : ''; }
function statusAbsen_(v) {
  var s = lower_(v);
  if (/^(h|hadir|present|masuk)/.test(s)) return 'Hadir';
  if (/^(i|izin|ijin|permit)/.test(s)) return 'Izin';
  if (/^(s|sakit|sick)/.test(s)) return 'Sakit';
  if (/^(a|alpa|alpha|absent|tanpa)/.test(s)) return 'Alpha';
  return 'Hadir';
}
function jkNorm_(v) { var s = lower_(v); return /^(p|perempuan|f|female|wanita)/.test(s) ? 'P' : 'L'; }
function driveUrlNorm_(v) {
  var id = driveId_(v);
  return id ? 'https://drive.google.com/file/d/' + id + '/preview' : String(v || '').trim();
}
function str_(v) { return v instanceof Date ? Utilities.formatDate(v, APP.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX") : (v === null || v === undefined ? '' : String(v).trim()); }

/**
 * Upsert batch per skill: target dibaca 1×, digabung di memori, ditulis 1×.
 * plan = { target, key(o), rows[], updatable[], fillBlank?, onlyIfPending?, sortBy? }
 */
function upsertPlan_(plan, dryRun) {
  var sh = getSheet_(plan.target), values = sh.getDataRange().getValues(), h = values[0].map(String);
  var toObj = function (r) { var o = {}; h.forEach(function (k, i) { o[k] = normCell_(k, r[i]); }); return o; };
  var index = {};
  for (var r = 1; r < values.length; r++) { if (values[r].join('') === '') continue; var k0 = plan.key(toObj(values[r])); if (k0) index[k0] = r; }
  var res = { source: plan.rows.length, inserted: 0, updated: 0, skipped: 0 }, newRows = [], seen = {}, dupe = 0;
  var keyCol = SCHEMA[plan.target].key, needIds = [];
  plan.rows.forEach(function (src) {
    var k = plan.key(src);
    if (!k) { res.skipped++; return; }
    if (seen[k]) { res.skipped++; dupe++; return; } seen[k] = true;
    if (index[k] !== undefined) {
      var row = values[index[k]], changed = false;
      var fields = (plan.updatable || []).concat(plan.fillBlank ? h : []);
      fields.forEach(function (f) {
        var i = h.indexOf(f); if (i === -1 || f === keyCol || src[f] === undefined || src[f] === '') return;
        var isUpd = (plan.updatable || []).indexOf(f) > -1;
        if (!isUpd && String(row[i]) !== '') return;           // fillBlank: hanya kolom kosong
        var v = String(src[f]);
        if (String(row[i]) !== v) { row[i] = v; changed = true; }
      });
      changed ? res.updated++ : res.skipped++;
    } else {
      var nr = h.map(function (f) { return src[f] !== undefined && src[f] !== null ? String(src[f]) : ''; });
      if (!nr[h.indexOf(keyCol)] && SCHEMA[plan.target].prefix) needIds.push(newRows.length);
      newRows.push(nr); res.inserted++;
    }
  });
  if (dupe) res.dupe = dupe;
  if (!dryRun && (res.updated || newRows.length)) {
    if (needIds.length) { var ids = reserveIds_(plan.target, needIds.length), ki = h.indexOf(keyCol); needIds.forEach(function (n, j) { newRows[n][ki] = ids[j]; }); }
    var body = values.slice(1).filter(function (r) { return r.join('') !== ''; }).map(function (r) { return r.map(function (c, i) { return c instanceof Date ? normCell_(h[i], c) : c; }); }).concat(newRows);
    if (plan.sortBy) { var si = h.indexOf(plan.sortBy); body.sort(function (a, b) { return String(a[si]).localeCompare(String(b[si])); }); }
    var all = [h].concat(body), max = sh.getMaxRows();
    if (all.length > max) { sh.insertRowsAfter(max, all.length - max + 100); sh.getRange(max + 1, 1, all.length - max + 100, h.length).setNumberFormat('@'); }
    sh.getRange(1, 1, all.length, h.length).setValues(all);
    var sisa = values.length - all.length; if (sisa > 0) sh.getRange(all.length + 1, 1, sisa, h.length).clearContent();
    invalidateRows_(plan.target);
    var pre = SCHEMA[plan.target].prefix;
    if (pre) {                                            // jaga high-water mark ID agar tidak bentrok dengan ID lama
      var kIx = h.indexOf(keyCol), mx = Number(propFresh_('SEQ_' + plan.target) || 0);
      body.forEach(function (r) { var m = String(r[kIx]).match(new RegExp('^' + pre + '(\\d+)$')); if (m) mx = Math.max(mx, Number(m[1])); });
      setProp_('SEQ_' + plan.target, String(mx));
      if (plan.target === 'Users') { amankanSandi_(); bump_('akun'); }   // hash lama dipindah ke Script Properties
    }
  }
  return res;
}

var MIG_URUTAN = ['Kelas', 'Mapel', 'Guru', 'Siswa', 'Users', 'Jadwal', 'Materi', 'Absensi', 'Nilai', 'Pengumuman', 'Config'];

function apiMigrasiScan(ctx, d) {
  var ss = openSource_(d.source), info = {};
  MIG_URUTAN.forEach(function (t) {
    var s = readSource_(ss, t);
    info[t] = s ? { ada: true, sheet: s.sheet, baris: s.rows.length, kolom: s.headers.length, terpetakan: Object.keys(s.peta || {}) } : { ada: false };
  });
  var dry = migrasiJalan_(ss, d, true);
  return ok_({ source: { name: ss.getName(), id: ss.getId() }, sheets: info, report: dry.report, warnings: dry.warnings, dryRun: true });
}

function apiMigrasiRun(ctx, d) {
  var ss = openSource_(d.source);
  var out = migrasiJalan_(ss, d, !!d.dryRun);
  if (!d.dryRun) {
    bump_('master'); bump_('absen'); bump_('nilai');
    setProp_('MIGRASI_TERAKHIR', JSON.stringify({ at: nowIso_(), source: ss.getId(), name: ss.getName() }));
    queueLog_([ctx.session.email, ctx.session.role, 'IMPORT_RUN', JSON.stringify(out.report).substring(0, 400), ss.getId()]);
    try { svcCrmSync(ctx, {}); } catch (e) {}
  }
  return ok_({ source: { name: ss.getName(), id: ss.getId() }, dryRun: !!d.dryRun, report: out.report, warnings: out.warnings },
    d.dryRun ? 'Pindai selesai (tidak ada data yang ditulis).' : 'Import selesai.');
}

/** Inti migrasi: master dulu, lalu relasi. */
function migrasiJalan_(ss, d, dryRun) {
  var pilih = d.sheets && d.sheets.length ? d.sheets : ['Kelas', 'Mapel', 'Guru', 'Siswa', 'Users', 'Jadwal', 'Materi', 'Nilai', 'Pengumuman', 'Config'];
  var timpa = !!d.overwrite, report = {}, warnings = [];
  var src = {}; MIG_URUTAN.forEach(function (t) { if (pilih.indexOf(t) > -1 || ['Kelas', 'Siswa', 'Guru'].indexOf(t) > -1) src[t] = readSource_(ss, t); });

  // ---- Resolver kelas: id lama / nama → id baru ----
  var kelasSrcNama = {};
  (src.Kelas ? src.Kelas.rows : []).forEach(function (k) { var nm = str_(k.nama_kelas || k.nama || k.kelas_id); if (k.kelas_id) kelasSrcNama[lower_(k.kelas_id)] = nm; kelasSrcNama[lower_(nm)] = nm; });
  function kelasResolver() {
    var map = {};
    DB.all('Kelas').forEach(function (k) { map[lower_(k.kelas_id)] = k.kelas_id; map[lower_(k.nama_kelas)] = k.kelas_id; });
    return function (v) { var s = lower_(v); if (!s) return ''; if (map[s]) return map[s]; var nm = kelasSrcNama[s]; return nm && map[lower_(nm)] ? map[lower_(nm)] : (dryRun && nm ? 'BARU:' + nm : ''); };
  }
  function run(t, plan) {
    if (pilih.indexOf(t) === -1) return;
    if (!src[t]) { report[t] = { source: 0, inserted: 0, updated: 0, skipped: 0, catatan: 'Sheet tidak ditemukan di app lama' }; return; }
    report[t] = upsertPlan_(plan, dryRun);
    if (report[t].dupe) warnings.push(t + ': ' + report[t].dupe + ' baris ganda di sumber dilewati.');
  }

  // 1. Kelas
  run('Kelas', { target: 'Kelas', key: function (o) { return lower_(o.nama_kelas); }, fillBlank: true, updatable: timpa ? ['jenjang', 'tingkat', 'wali_kelas_id', 'tahun_ajaran'] : [],
    rows: src.Kelas ? src.Kelas.rows.map(function (k) {
      var nm = str_(k.nama_kelas || k.kelas_id), jj = String(k.jenjang || '').toUpperCase();
      var ada = DB.find('Kelas', 'kelas_id', str_(k.kelas_id));
      return { kelas_id: ada ? '' : str_(k.kelas_id), nama_kelas: nm, jenjang: ['SD', 'SMP', 'SMA'].indexOf(jj) > -1 ? jj : (/^(x|xi|xii)\b/i.test(nm) ? 'SMA' : /^(vii|viii|ix)\b/i.test(nm) ? 'SMP' : 'SD'),
        tingkat: str_(k.tingkat), wali_kelas_id: str_(k.wali_kelas_id), tahun_ajaran: str_(k.tahun_ajaran) || setting_('TAHUN_AJARAN', '') };
    }) : [] });
  // Kelas yang hanya disebut di data siswa (tanpa sheet Kelas) → buat otomatis
  if (src.Siswa && pilih.indexOf('Siswa') > -1) {
    var rk = kelasResolver(), baruK = {};
    src.Siswa.rows.forEach(function (s) { var v = str_(s.kelas_id); if (v && !rk(v)) baruK[lower_(v)] = v; });
    var listK = Object.keys(baruK).map(function (k) { return { nama_kelas: baruK[k], jenjang: /^(x|xi|xii)\b/i.test(baruK[k]) ? 'SMA' : /^(vii|viii|ix)\b/i.test(baruK[k]) ? 'SMP' : 'SD', tahun_ajaran: setting_('TAHUN_AJARAN', '') }; });
    if (listK.length) {
      var rK = upsertPlan_({ target: 'Kelas', key: function (o) { return lower_(o.nama_kelas); }, rows: listK }, dryRun);
      warnings.push('Kelas dibuat otomatis dari data siswa: ' + listK.map(function (k) { return k.nama_kelas; }).join(', ') + (dryRun ? ' (akan dibuat)' : ''));
      listK.forEach(function (k) { kelasSrcNama[lower_(k.nama_kelas)] = k.nama_kelas; });
      if (report.Kelas) report.Kelas.inserted += rK.inserted;
    }
  }
  // 2. Mapel
  run('Mapel', { target: 'Mapel', key: function (o) { return lower_(o.nama); }, fillBlank: true, updatable: timpa ? ['kode', 'kelompok'] : [],
    rows: src.Mapel ? src.Mapel.rows.map(function (m) { return { nama: str_(m.nama || m.mata_pelajaran), kode: str_(m.kode), kelompok: str_(m.kelompok) || 'Wajib', jenjang: str_(m.jenjang) }; }) : [] });
  // 3. Guru
  run('Guru', { target: 'Guru', key: function (o) { return lower_(o.NUPTK); }, fillBlank: true, updatable: timpa ? ['nama_lengkap', 'mata_pelajaran', 'jabatan', 'foto_profil_url'] : [],
    rows: src.Guru ? src.Guru.rows.map(function (g) { return { NUPTK: str_(g.NUPTK), nama_lengkap: str_(g.nama_lengkap), email: lower_(g.email), no_wa: hp08_(g.no_wa), mata_pelajaran: str_(g.mata_pelajaran), jabatan: str_(g.jabatan) || 'Guru', foto_profil_url: str_(g.foto_profil_url), status: 'Aktif', dibuat_pada: nowIso_() }; }) : [] });
  // 4. Siswa
  var rkS = kelasResolver(), yatimKelas = 0;
  run('Siswa', { target: 'Siswa', key: function (o) { return lower_(o.NIS); }, fillBlank: true,
    updatable: timpa ? ['nama_lengkap', 'NISN', 'kelas_id', 'jenjang', 'nama_ortu', 'no_wa_ortu', 'alamat', 'foto_profil_url'] : [],
    rows: src.Siswa ? src.Siswa.rows.map(function (s) {
      var nis = str_(s.NIS).replace(/\.0+$/, ''), kid = rkS(s.kelas_id);
      if (s.kelas_id && !kid) yatimKelas++;
      var kel = DB.find('Kelas', 'kelas_id', kid) || {};
      return { NIS: nis, NISN: str_(s.NISN).replace(/\.0+$/, '').replace(/^(\d{8,9})$/, function (x) { return ('00' + x).slice(-10); }), nama_lengkap: str_(s.nama_lengkap), jenis_kelamin: jkNorm_(s.jenis_kelamin),
        kelas_id: kid.indexOf('BARU:') === 0 ? '' : kid, jenjang: str_(s.jenjang) || kel.jenjang || '', barcode_id: str_(s.barcode_id) || ('ID-' + nis), email: lower_(s.email), no_wa: hp08_(s.no_wa),
        nama_ortu: str_(s.nama_ortu), no_wa_ortu: hp08_(s.no_wa_ortu), tempat_lahir: str_(s.tempat_lahir), tanggal_lahir: tglIso_(s.tanggal_lahir), alamat: str_(s.alamat),
        foto_profil_url: /drive\.google\.com/.test(str_(s.foto_profil_url)) && driveId_(s.foto_profil_url) ? 'https://drive.google.com/thumbnail?id=' + driveId_(s.foto_profil_url) + '&sz=w400' : str_(s.foto_profil_url),
        tahun_masuk: str_(s.tahun_masuk), status: /lulus/i.test(str_(s.status)) ? 'Lulus' : /pindah/i.test(str_(s.status)) ? 'Pindah' : /non|tidak|false/i.test(str_(s.status)) ? 'Nonaktif' : 'Aktif', dibuat_pada: nowIso_() };
    }) : [] });
  if (yatimKelas) warnings.push(yatimKelas + ' siswa merujuk kelas yang tidak ditemukan — kolom kelas dikosongkan, atur ulang di menu Data Siswa.');
  if (src.Siswa) { var cnt = {}; src.Siswa.rows.forEach(function (s) { var e = lower_(s.email); if (e) cnt[e] = (cnt[e] || 0) + 1; }); var g2 = Object.keys(cnt).filter(function (e) { return cnt[e] > 1; }); if (g2.length) warnings.push('Email ganda di data siswa lama: ' + g2.slice(0, 5).join(', ') + (g2.length > 5 ? '…' : '')); }

  // 5. Users (akun login) — hash lama dipertahankan bila ada
  if (pilih.indexOf('Users') > -1) {
    var admin = 0, tanpaHash = 0, uRows = [];
    (src.Users ? src.Users.rows : []).forEach(function (u) {
      var role = lower_(u.role);
      if (/admin/.test(role)) { admin++; role = 'superadmin'; }
      else role = /guru|teacher/.test(role) ? 'guru' : 'siswa';
      var hash = str_(u.password_hash), salt = str_(u.salt), ref = str_(u.ref_id || u._raw.nis || u._raw.nuptk).replace(/\.0+$/, '');
      if (!/^[a-f0-9]{64}$/i.test(hash) && !/^[A-Za-z0-9+\/]{43}=$/.test(hash) && !/^v2\$/.test(hash)) { tanpaHash++; salt = newSalt_(); hash = dryRun ? '' : hashPassword_(ref || sandiAcak_(10), salt, 1); }
      uRows.push({ nama: str_(u.nama || u.nama_lengkap), email: lower_(u.email), password_hash: hash, salt: salt, role: role, ref_id: ref, kelas_id: '', status_aktif: /^(tidak|false|0|nonaktif|n)$/i.test(str_(u.status_aktif)) ? 'TIDAK' : 'YA',
        wajib_ganti_sandi: tanpaHash ? 'YA' : 'TIDAK', last_login: '', dibuat_pada: nowIso_() });
    });
    // Akun otomatis untuk siswa/guru yang belum punya akun (password awal = NIS / NUPTK)
    if (d.buatAkun !== false) {
      var punya = {}; DB.all('Users').forEach(function (u) { punya[u.role + ':' + u.ref_id] = 1; }); uRows.forEach(function (u) { punya[u.role + ':' + u.ref_id] = 1; });
      var dom = setting_('EMAIL_DOMAIN_SISWA', 'siswa.sch.id'), dipakai = {}; DB.all('Users').forEach(function (u) { dipakai[lower_(u.email)] = 1; }); uRows.forEach(function (u) { dipakai[u.email] = 1; });
      var auto = 0;
      var sumberSiswa = dryRun && src.Siswa ? src.Siswa.rows.map(function (s) { return { NIS: str_(s.NIS).replace(/\.0+$/, ''), nama_lengkap: str_(s.nama_lengkap), email: lower_(s.email) }; }) : DB.all('Siswa');
      sumberSiswa.forEach(function (s) {
        if (!s.NIS || punya['siswa:' + s.NIS]) return;
        var e = lower_(s.email); if (!e || dipakai[e]) { var base = slug_(s.nama_lengkap).split('.').slice(0, 2).join('.') || s.NIS; e = base + '@' + dom; var i = 2; while (dipakai[e]) { e = base + i + '@' + dom; i++; } }
        dipakai[e] = 1; var sl = newSalt_(); auto++;
        uRows.push({ nama: s.nama_lengkap, email: e, password_hash: dryRun ? '' : hashPassword_(s.NIS, sl, 1), salt: sl, role: 'siswa', ref_id: s.NIS, kelas_id: s.kelas_id || '', status_aktif: 'YA', wajib_ganti_sandi: 'YA', last_login: '', dibuat_pada: nowIso_() });
      });
      if (auto) warnings.push(auto + ' akun siswa dibuat otomatis dengan password awal = NIS (wajib ganti saat login).');
    }
    report.Users = upsertPlan_({ target: 'Users', key: function (o) { return lower_(o.email); }, rows: uRows, updatable: [] }, dryRun);
    if (admin) warnings.push(admin + ' akun Admin lama diimpor sebagai Super Admin. Periksa di menu Kelola Akun.');
    if (tanpaHash) warnings.push(tanpaHash + ' akun lama tanpa hash SHA-256 yang dikenali → password diatur = NIS/NUPTK (wajib ganti).');
    if (!dryRun) {                                       // sinkronkan kelas_id akun siswa
      var km = {}; DB.all('Siswa').forEach(function (s) { km[s.NIS] = s.kelas_id; });
      DB.updateBatch('Users', 'user_id', DB.all('Users').filter(function (u) { return u.role === 'siswa' && km[u.ref_id] !== undefined && u.kelas_id !== km[u.ref_id]; }).map(function (u) { return { user_id: u.user_id, kelas_id: km[u.ref_id] }; }));
    }
  }
  // 6. Jadwal
  var rkJ = kelasResolver();
  run('Jadwal', { target: 'Jadwal', key: function (o) { return [o.kelas_id, lower_(o.hari), jamHM_(o.jam_mulai), lower_(o.mata_pelajaran)].join('|'); }, fillBlank: true, updatable: timpa ? ['guru_id', 'jam_selesai', 'ruang'] : [],
    rows: src.Jadwal ? src.Jadwal.rows.map(function (j) { return { kelas_id: rkJ(j.kelas_id), mata_pelajaran: str_(j.mata_pelajaran), guru_id: str_(j.guru_id).replace(/\.0+$/, ''), hari: str_(j.hari).replace(/^./, function (c) { return c.toUpperCase(); }), jam_mulai: jamHM_(j.jam_mulai), jam_selesai: jamHM_(j.jam_selesai), ruang: str_(j.ruang) }; })
      .filter(function (j) { if (!j.kelas_id) { warnings.push('Jadwal ' + j.mata_pelajaran + ' ' + j.hari + ' dilewati: kelas tidak ditemukan.'); return false; } return true; }) : [] });
  // 7. Materi — ID file Drive lama tetap valid (akun Google sama)
  var rkM = kelasResolver();
  run('Materi', { target: 'Materi', key: function (o) { return lower_(o.materi_id) || lower_(o.judul); }, fillBlank: true, updatable: timpa ? ['judul', 'deskripsi', 'url_konten'] : [],
    rows: src.Materi ? src.Materi.rows.map(function (m) {
      var url = str_(m.url_konten), tipe = /video|youtube/i.test(str_(m.tipe)) || youtubeId_(url) ? 'video' : 'dokumen';
      var did = str_(m.drive_file_id) || driveId_(url);
      return { materi_id: str_(m.materi_id), judul: str_(m.judul), deskripsi: str_(m.deskripsi), mata_pelajaran: str_(m.mata_pelajaran), kelas_id: rkM(m.kelas_id), guru_id: str_(m.guru_id).replace(/\.0+$/, ''), tipe: tipe,
        url_konten: tipe === 'video' ? 'https://www.youtube.com/embed/' + youtubeId_(url) : (did ? 'https://drive.google.com/file/d/' + did + '/preview' : url), drive_file_id: tipe === 'video' ? '' : did,
        ukuran: '', durasi: '', tanggal_upload: str_(m.tanggal_upload) || nowIso_(), status: 'Aktif' };
    }) : [] });
  // 8. Absensi (opsional, bisa besar) — urut ulang by tanggal
  var nisAda = {}; (dryRun && src.Siswa ? src.Siswa.rows.map(function (s) { return str_(s.NIS).replace(/\.0+$/, ''); }) : []).concat(DB.all('Siswa').map(function (s) { return s.NIS; })).forEach(function (n) { nisAda[n] = 1; });
  var kelasSiswa = {}; DB.all('Siswa').forEach(function (s) { kelasSiswa[s.NIS] = s.kelas_id; });
  if (pilih.indexOf('Absensi') > -1) {
    src.Absensi = src.Absensi || readSource_(ss, 'Absensi');
    var yatimA = 0;
    run('Absensi', { target: 'Absensi', key: function (o) { return String(o.NIS) + '|' + tglIso_(o.tanggal); }, updatable: timpa ? ['status', 'keterangan'] : [], sortBy: 'tanggal',
      rows: src.Absensi ? src.Absensi.rows.map(function (a) {
        var nis = str_(a.NIS).replace(/\.0+$/, ''), st = statusAbsen_(a.status), jam = jamIso_(a.jam);
        return { absensi_id: '', NIS: nis, kelas_id: kelasSiswa[nis] || rkM(a.kelas_id), tanggal: tglIso_(a.tanggal), jam: jam, status: st, metode: lower_(a.metode) || 'manual', latitude: str_(a.latitude), longitude: str_(a.longitude),
          jarak_m: '', foto_selfie_id: driveId_(a.foto_selfie_id) || str_(a.foto_selfie_id), keterangan: str_(a.keterangan), terlambat: st === 'Hadir' && jam && jam.substring(0, 5) > setting_('JAM_MASUK', '07:15') ? 'YA' : st === 'Hadir' ? 'TIDAK' : '', dicatat_oleh: 'IMPORT', dibuat_pada: nowIso_() };
      }).filter(function (a) { if (!nisAda[a.NIS]) { yatimA++; return false; } return !!a.tanggal; }) : [] });
    if (yatimA) warnings.push(yatimA + ' baris absensi dilewati karena NIS tidak ada di data siswa.');
  }
  // 9. Nilai — nilai akhir dihitung ulang bila kosong
  if (pilih.indexOf('Nilai') > -1) {
    var yatimN = 0;
    run('Nilai', { target: 'Nilai', key: nilaiKey_, fillBlank: true, updatable: timpa ? ['nilai_harian', 'nilai_uts', 'nilai_uas', 'nilai_akhir', 'predikat', 'catatan'] : [],
      rows: src.Nilai ? src.Nilai.rows.map(function (n) {
        var nis = str_(n.NIS).replace(/\.0+$/, ''), h = n.nilai_harian === '' ? '' : num_(n.nilai_harian, ''), u = n.nilai_uts === '' ? '' : num_(n.nilai_uts, ''), a = n.nilai_uas === '' ? '' : num_(n.nilai_uas, '');
        var akhir = n.nilai_akhir !== undefined && n.nilai_akhir !== '' ? num_(n.nilai_akhir) : hitungAkhir_(h === undefined ? '' : h, u === undefined ? '' : u, a === undefined ? '' : a);
        return { nilai_id: '', NIS: nis, kelas_id: kelasSiswa[nis] || rkM(n.kelas_id), mata_pelajaran: str_(n.mata_pelajaran), guru_id: str_(n.guru_id).replace(/\.0+$/, ''), semester: str_(n.semester) || setting_('SEMESTER', ''),
          tahun_ajaran: str_(n.tahun_ajaran) || setting_('TAHUN_AJARAN', ''), nilai_harian: h === undefined ? '' : h, nilai_uts: u === undefined ? '' : u, nilai_uas: a === undefined ? '' : a, nilai_akhir: akhir, predikat: predikat_(akhir), catatan: str_(n.catatan), diperbarui_pada: nowIso_() };
      }).filter(function (n) { if (!nisAda[n.NIS]) { yatimN++; return false; } return !!n.mata_pelajaran; }) : [] });
    if (yatimN) warnings.push(yatimN + ' baris nilai dilewati karena NIS tidak ada di data siswa.');
  }
  // 10. Pengumuman
  run('Pengumuman', { target: 'Pengumuman', key: function (o) { return lower_(o.judul) + '|' + String(o.tanggal).substring(0, 10); },
    rows: src.Pengumuman ? src.Pengumuman.rows.map(function (p) { return { judul: str_(p.judul), isi: str_(p.isi), kategori: str_(p.kategori) || 'Informasi', tanggal: str_(p.tanggal) || nowIso_(), oleh: str_(p.oleh) || 'IMPORT', status: 'Aktif' }; }) : [] });
  // 11. Config — salin hanya bila nilai target masih bawaan (seed)
  if (pilih.indexOf('Config') > -1) {
    var cs = readSource_(ss, 'Config'), seed = {}, pairs = {};
    CONFIG_SEED.forEach(function (r) { seed[r[0]] = r[1]; });
    var lama = {};
    if (cs && cs.rows.length) {
      var raw0 = cs.rows[0]._raw;
      if (raw0.key !== undefined && raw0.value !== undefined) cs.rows.forEach(function (r) { lama[normKey_(r._raw.key)] = r._raw.value; });
      else Object.keys(raw0).forEach(function (k) { lama[k] = raw0[k]; });
    }
    var petaCfg = { NAMA_SEKOLAH: ['namasekolah', 'sekolahnama', 'appname', 'namainstitusi'], LAT_SEKOLAH: ['latsekolah', 'latitudesekolah', 'latitude'], LNG_SEKOLAH: ['lngsekolah', 'longitudesekolah', 'longitude'],
      RADIUS_M: ['radiusm', 'radiusabsensimeter', 'radius'], LOGO_URL: ['logourl', 'logo'], ALAMAT_SEKOLAH: ['alamatsekolah', 'alamat'], KKM: ['kkm'] };
    var cfgNow = settings_(), dipakai = [];
    Object.keys(petaCfg).forEach(function (k) {
      var v; petaCfg[k].some(function (a) { if (lama[a] !== undefined && lama[a] !== '') { v = lama[a]; return true; } return false; });
      if (v === undefined) return;
      if ((cfgNow[k] === seed[k] || cfgNow[k] === '' || timpa) && String(cfgNow[k]) !== String(v)) { pairs[k] = str_(v); dipakai.push(k + '=' + str_(v)); }
    });
    report.Config = { source: Object.keys(lama).length, inserted: 0, updated: Object.keys(pairs).length, skipped: 0 };
    if (dipakai.length) warnings.push('Pengaturan lama diterapkan: ' + dipakai.join(', ') + (dryRun ? ' (akan diterapkan)' : ''));
    if (!dryRun && Object.keys(pairs).length) saveSettings_(pairs);
  }
  return { report: report, warnings: warnings };
}

/** Import CSV siswa (data dari luar app) — rows sudah di-parse di browser */
function apiMigrasiCsv(ctx, d) {
  var rows = d.rows || [];
  if (!rows.length) return fail_('CSV kosong.');
  if (rows.length > 3000) return fail_('Maksimal 3.000 baris per import.');
  var kelasMap = {}; DB.all('Kelas').forEach(function (k) { kelasMap[lower_(k.nama_kelas)] = k; kelasMap[lower_(k.kelas_id)] = k; });
  var warnings = [], baruKelas = {};
  var list = rows.map(function (r) {
    var o = {}; Object.keys(r).forEach(function (k) { o[normKey_(k)] = r[k]; });
    var pick = function (col) { var c = [normKey_(col)].concat(MIG_COL_ALIAS[col] || []); for (var i = 0; i < c.length; i++) if (o[c[i]] !== undefined && o[c[i]] !== '') return String(o[c[i]]).trim(); return ''; };
    var kls = pick('kelas_id'), k = kelasMap[lower_(kls)];
    if (kls && !k) baruKelas[lower_(kls)] = kls;
    var nis = pick('NIS');
    return { NIS: nis, NISN: pick('NISN'), nama_lengkap: pick('nama_lengkap'), jenis_kelamin: jkNorm_(pick('jenis_kelamin')), kelas_id: k ? k.kelas_id : kls, jenjang: k ? k.jenjang : '', barcode_id: pick('barcode_id') || ('ID-' + nis),
      email: lower_(pick('email')), no_wa: hp08_(pick('no_wa')), nama_ortu: pick('nama_ortu'), no_wa_ortu: hp08_(pick('no_wa_ortu')), tempat_lahir: pick('tempat_lahir'), tanggal_lahir: tglIso_(pick('tanggal_lahir')),
      alamat: pick('alamat'), foto_profil_url: '', tahun_masuk: pick('tahun_masuk') || setting_('TAHUN_AJARAN', ''), status: 'Aktif', dibuat_pada: nowIso_() };
  }).filter(function (r) { if (!r.NIS || !r.nama_lengkap) { warnings.push('Baris tanpa NIS/nama dilewati.'); return false; } return true; });
  var kb = Object.keys(baruKelas);
  if (kb.length) {
    warnings.push('Kelas baru ' + (d.dryRun ? 'akan dibuat' : 'dibuat') + ': ' + kb.map(function (k) { return baruKelas[k]; }).join(', '));
    if (!d.dryRun) {
      upsertPlan_({ target: 'Kelas', key: function (o) { return lower_(o.nama_kelas); }, rows: kb.map(function (k) { var n = baruKelas[k]; return { nama_kelas: n, jenjang: /^(x|xi|xii)\b/i.test(n) ? 'SMA' : /^(vii|viii|ix)\b/i.test(n) ? 'SMP' : 'SD', tahun_ajaran: setting_('TAHUN_AJARAN', '') }; }) }, false);
      var km = {}; DB.all('Kelas').forEach(function (k) { km[lower_(k.nama_kelas)] = k; });
      list.forEach(function (r) { var k = km[lower_(r.kelas_id)]; if (k) { r.kelas_id = k.kelas_id; r.jenjang = k.jenjang; } });
    }
  }
  var rep = upsertPlan_({ target: 'Siswa', key: function (o) { return lower_(o.NIS); }, rows: list, fillBlank: true, updatable: d.overwrite ? ['nama_lengkap', 'NISN', 'kelas_id', 'jenjang', 'nama_ortu', 'no_wa_ortu', 'alamat'] : [] }, !!d.dryRun);
  var akun = 0;
  if (!d.dryRun && d.buatAkun !== false) {
    var punya = {}; DB.all('Users').forEach(function (u) { if (u.role === 'siswa') punya[u.ref_id] = 1; });
    var dipakai = {}; DB.all('Users').forEach(function (u) { dipakai[lower_(u.email)] = 1; });
    var dom = setting_('EMAIL_DOMAIN_SISWA', 'siswa.sch.id'), baru = [];
    DB.all('Siswa').forEach(function (s) {
      if (punya[s.NIS]) return;
      var e = lower_(s.email); if (!e || dipakai[e]) { var base = slug_(s.nama_lengkap).split('.').slice(0, 2).join('.') || s.NIS; e = base + '@' + dom; var i = 2; while (dipakai[e]) { e = base + i + '@' + dom; i++; } }
      dipakai[e] = 1; var sl = newSalt_();
      baru.push({ nama: s.nama_lengkap, email: e, password_hash: hashPassword_(s.NIS, sl, 1), salt: sl, role: 'siswa', ref_id: s.NIS, kelas_id: s.kelas_id, status_aktif: 'YA', wajib_ganti_sandi: 'YA', last_login: '', dibuat_pada: nowIso_() });
    });
    if (baru.length) { var ids = reserveIds_('Users', baru.length); baru.forEach(function (u, i) { u.user_id = ids[i]; }); DB.appendBatch('Users', baru); akun = baru.length; warnings.push(akun + ' akun siswa dibuat (password awal = NIS).'); }
  }
  if (!d.dryRun) { bump_('master'); try { svcCrmSync(ctx, {}); } catch (e) {} }
  return ok_({ report: { Siswa: rep }, akun: akun, warnings: warnings, dryRun: !!d.dryRun }, d.dryRun ? 'Pindai CSV selesai.' : 'Import CSV selesai.');
}

;
// ==== Notifikasi.gs ====
/**
 * =====================================================================
 *  SIAKAD SISWA — File 4/5 : Notifikasi.gs  (gas-notifikasi-wa-crm)
 *  WhatsApp (Fonnte) + Email: saklar utama, matriks event, antrean,
 *  prosesor per menit, blast per batch 10/20/50, deteksi nomor WA.
 *  Token Fonnte disimpan di Script Properties — tidak pernah ke browser
 *  (respons hanya versi tersamar samarkan_). v2.1: antrean via cache (_NQ).
 * =====================================================================
 */

var FONNTE_API = 'https://api.fonnte.com';

/** Registry kejadian yang bisa diaktif/nonaktifkan. Placeholder umum: {nama} {institusi} {link} */
var NOTIF_EVENTS = {
  AKUN_DIBUAT: { label: 'Akun SIAKAD dibuat (kredensial awal)', wa: true, email: true, vars: ['nama', 'username', 'sandi', 'nis', 'link', 'institusi'],
    subjek: 'Akun SIAKAD {nama}',
    pesan: 'Yth. {nama},\nAkun SIAKAD SISWA telah dibuat.\nUsername: *{username}*\nSandi awal: *{sandi}*\nLogin: {link}\nSegera ganti password setelah login pertama.\n— {institusi}' },
  ABSEN_HADIR: { label: 'Siswa tercatat hadir (ke orang tua)', wa: true, email: false, vars: ['nama', 'status', 'tanggal', 'jam', 'metode', 'institusi'],
    subjek: 'Kehadiran {nama} — {tanggal}',
    pesan: 'Yth. Orang Tua/Wali dari *{nama}*,\nAnanda tercatat *{status}* pada {tanggal} pukul {jam} WIB ({metode}).\n— {institusi}' },
  ABSEN_ALPHA: { label: 'Siswa alpha / tanpa keterangan', wa: true, email: true, vars: ['nama', 'tanggal', 'institusi'],
    subjek: 'Pemberitahuan Ketidakhadiran {nama}',
    pesan: 'Yth. Orang Tua/Wali dari *{nama}*,\nAnanda tercatat *TIDAK HADIR tanpa keterangan (Alpha)* pada {tanggal}. Mohon konfirmasi kepada wali kelas.\n— {institusi}' },
  ABSEN_IZIN_SAKIT: { label: 'Siswa izin / sakit dicatat', wa: true, email: false, vars: ['nama', 'status', 'tanggal', 'institusi'],
    subjek: 'Status Kehadiran {nama}',
    pesan: 'Yth. Orang Tua/Wali dari *{nama}*,\nKetidakhadiran Ananda pada {tanggal} tercatat sebagai *{status}*. Terima kasih atas konfirmasinya.\n— {institusi}' },
  NILAI_TERBIT: { label: 'Nilai mata pelajaran terbit', wa: true, email: true, vars: ['nama', 'mapel', 'nilai', 'predikat', 'semester', 'link', 'institusi'],
    subjek: 'Nilai {mapel} — {nama}',
    pesan: 'Yth. Orang Tua/Wali dari *{nama}*,\nNilai *{mapel}* semester {semester} telah terbit: *{nilai}* (predikat {predikat}).\nCek raport digital: {link}\n— {institusi}' },
  REMEDIAL: { label: 'Nilai di bawah KKM (remedial)', wa: true, email: true, vars: ['nama', 'mapel', 'nilai', 'kkm', 'link', 'institusi'],
    subjek: 'Pemberitahuan Remedial {mapel}',
    pesan: 'Yth. Orang Tua/Wali dari *{nama}*,\nNilai akhir *{mapel}* Ananda *{nilai}* masih di bawah KKM {kkm}. Ananda dijadwalkan mengikuti remedial; informasi lengkap dari guru mapel.\n— {institusi}' },
  MATERI_BARU: { label: 'Materi pembelajaran baru', wa: false, email: true, vars: ['nama', 'judul', 'mapel', 'guru', 'link', 'institusi'],
    subjek: 'Materi baru: {judul}',
    pesan: 'Halo {nama},\nMateri baru *{judul}* ({mapel}) dari {guru} sudah tersedia di SIAKAD.\nBuka: {link}\n— {institusi}' },
  PENGUMUMAN: { label: 'Pengumuman sekolah', wa: true, email: true, vars: ['nama', 'judul', 'isi', 'institusi'],
    subjek: '{judul}',
    pesan: '📢 *{judul}*\n\n{isi}\n\n— {institusi}' },
  RESET_SANDI: { label: 'Kode reset password (lupa password)', wa: true, email: true, vars: ['nama', 'kode', 'institusi'],
    subjek: 'Kode Reset Password SIAKAD',
    pesan: 'Kode reset password SIAKAD untuk {nama}: *{kode}*\nBerlaku 15 menit. Abaikan bila Anda tidak memintanya.\n— {institusi}' },
  RESET_SANDI_ADMIN: { label: 'Password direset oleh guru/admin', wa: true, email: true, vars: ['nama', 'username', 'sandi', 'link', 'institusi'],
    subjek: 'Password SIAKAD direset',
    pesan: 'Yth. {nama},\nPassword SIAKAD telah direset.\nUsername: *{username}*\nSandi baru: *{sandi}*\nLogin: {link}\n— {institusi}' },
  // --- v2.1: tagihan & pembayaran (gas-tagihan-pembayaran) ---
  TAGIHAN_TERBIT: { label: 'Tagihan baru terbit (ke orang tua)', wa: true, email: true, vars: ['nama', 'periode', 'jumlah', 'jatuhTempo', 'rekening', 'nis', 'link', 'institusi'],
    subjek: 'Tagihan {periode} — {nama}',
    pesan: 'Yth. Orang Tua/Wali dari *{nama}* (NIS {nis}),\nTagihan *{periode}* sebesar *{jumlah}* telah terbit. Jatuh tempo {jatuhTempo}.\nPembayaran ke: {rekening}\nUnggah bukti transfer di: {link}\n— {institusi}' },
  TAGIHAN_REMINDER_H3: { label: 'Pengingat tagihan H-3', wa: true, email: false, vars: ['nama', 'periode', 'jumlah', 'jatuhTempo', 'hari', 'rekening', 'nis', 'institusi'],
    subjek: 'Pengingat: {periode} jatuh tempo {jatuhTempo}',
    pesan: 'Yth. Orang Tua/Wali dari *{nama}*,\nPengingat: *{periode}* sebesar *{jumlah}* jatuh tempo *{jatuhTempo}* ({hari}).\nPembayaran ke: {rekening}. Abaikan bila sudah membayar.\n— {institusi}' },
  TAGIHAN_REMINDER_H0: { label: 'Pengingat tagihan hari jatuh tempo', wa: true, email: true, vars: ['nama', 'periode', 'jumlah', 'jatuhTempo', 'hari', 'rekening', 'nis', 'institusi'],
    subjek: 'Hari ini jatuh tempo: {periode}',
    pesan: 'Yth. Orang Tua/Wali dari *{nama}*,\n*{periode}* sebesar *{jumlah}* jatuh tempo *hari ini* ({jatuhTempo}).\nPembayaran ke: {rekening}. Abaikan bila sudah membayar.\n— {institusi}' },
  PEMBAYARAN_VERIFIKASI: { label: 'Hasil verifikasi pembayaran', wa: true, email: true, vars: ['nama', 'periode', 'status', 'catatan', 'institusi'],
    subjek: 'Pembayaran {periode}: {status}',
    pesan: 'Yth. Orang Tua/Wali dari *{nama}*,\nPembayaran {periode}: *{status}*.\n{catatan}\n— {institusi}' }
};

// ---------------------------------------------------------------------
// Konfigurasi & matriks
// ---------------------------------------------------------------------
function waAktif_() { return setting_('NOTIF_WA_AKTIF', 'TIDAK') === 'YA' && !!prop_('FONNTE_TOKEN'); }
function emailAktif_() { return setting_('NOTIF_EMAIL_AKTIF', 'TIDAK') === 'YA'; }
function tokenMask_() { return samarkan_(prop_('FONNTE_TOKEN')); }

function matriksNotif_() {
  var simpan = {};
  try { simpan = JSON.parse(setting_('NOTIF_MATRIKS', '') || '{}') || {}; } catch (e) {}
  var out = {};
  Object.keys(NOTIF_EVENTS).forEach(function (k) {
    var d = NOTIF_EVENTS[k], s = simpan[k] || {};
    out[k] = { kode: k, label: d.label, vars: d.vars,
      wa: s.wa !== undefined ? !!s.wa : d.wa, email: s.email !== undefined ? !!s.email : d.email,
      subjek: s.subjek || d.subjek, pesan: s.pesan || d.pesan, subjekDefault: d.subjek, pesanDefault: d.pesan };
  });
  return out;
}
function triggerAktif_() { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'pekerjaMenit'; }); }

function svcNotifConfig(ctx, d) {
  var m = matriksNotif_();
  var quota = 0; try { quota = MailApp.getRemainingDailyQuota(); } catch (e) {}
  return ok_({
    waAktif: setting_('NOTIF_WA_AKTIF', 'TIDAK') === 'YA', emailAktif: emailAktif_(), tokenAda: !!prop_('FONNTE_TOKEN'), tokenMask: tokenMask_(),
    batchDefault: Number(setting_('WA_BATCH_DEFAULT', 20)), jeda: setting_('WA_JEDA_DETIK', '5'), deteksiOtomatis: setting_('WA_DETEKSI_OTOMATIS', 'YA') === 'YA',
    namaPengirim: setting_('EMAIL_NAMA_PENGIRIM', APP.NAME), appUrl: setting_('APP_URL', ''), sisaKuotaEmail: quota, trigger: triggerAktif_(),
    matriks: Object.keys(m).map(function (k) { return m[k]; })
  });
}

function svcNotifConfigSave(ctx, d) {
  var pairs = {};
  if (d.token) { var rt = simpanRahasia_('FONNTE_TOKEN', d.token); if (rt) return fail_(rt); }   // allowlist + validasi (Admin.gs)
  if (d.waAktif === true && !prop_('FONNTE_TOKEN')) return fail_('Isi token Fonnte terlebih dahulu sebelum mengaktifkan WhatsApp.');
  if (d.waAktif !== undefined) pairs.NOTIF_WA_AKTIF = d.waAktif ? 'YA' : 'TIDAK';
  if (d.emailAktif !== undefined) pairs.NOTIF_EMAIL_AKTIF = d.emailAktif ? 'YA' : 'TIDAK';
  if (d.batchDefault !== undefined) { if ([10, 20, 50].indexOf(Number(d.batchDefault)) === -1) return fail_('Ukuran batch harus 10, 20, atau 50.'); pairs.WA_BATCH_DEFAULT = String(d.batchDefault); }
  if (d.jeda !== undefined) { if (!/^\d{1,3}(-\d{1,3})?$/.test(String(d.jeda))) return fail_('Jeda harus angka (5) atau rentang (3-8).'); pairs.WA_JEDA_DETIK = String(d.jeda); }
  if (d.deteksiOtomatis !== undefined) pairs.WA_DETEKSI_OTOMATIS = d.deteksiOtomatis ? 'YA' : 'TIDAK';
  if (d.namaPengirim !== undefined) pairs.EMAIL_NAMA_PENGIRIM = String(d.namaPengirim).substring(0, 60);
  if (d.appUrl !== undefined) pairs.APP_URL = String(d.appUrl).trim();
  if (d.matriks) {
    var simpan = {};
    (Array.isArray(d.matriks) ? d.matriks : Object.keys(d.matriks).map(function (k) { return Object.assign({ kode: k }, d.matriks[k]); })).forEach(function (m) {
      var def = NOTIF_EVENTS[m.kode]; if (!def) return;
      var s = {};
      if (!!m.wa !== def.wa) s.wa = !!m.wa;
      if (!!m.email !== def.email) s.email = !!m.email;
      if (m.pesan && m.pesan !== def.pesan) s.pesan = String(m.pesan).substring(0, 2000);
      if (m.subjek && m.subjek !== def.subjek) s.subjek = String(m.subjek).substring(0, 200);
      if (Object.keys(s).length) simpan[m.kode] = s;
    });
    pairs.NOTIF_MATRIKS = JSON.stringify(simpan);
  }
  saveSettings_(pairs);
  try { pasangTrigger(); } catch (e) {}
  return svcNotifConfig(ctx, {});
}

// ---------------------------------------------------------------------
// Antrean — satu-satunya pintu kirim notifikasi otomatis (tidak pernah melempar error)
// ---------------------------------------------------------------------
function kirimNotif_(event, penerima, vars, refId) {
  return kirimNotifBatch_(event, [{ penerima: penerima, vars: vars, refId: refId }]);
}

function kirimNotifBatch_(event, daftar) {
  try {
    if (!daftar || !daftar.length) return 0;
    var waOn = waAktif_(), emOn = emailAktif_();
    if (!waOn && !emOn) return 0;
    var m = matriksNotif_()[event];
    if (!m || (!m.wa && !m.email)) return 0;
    var dasar = { institusi: setting_('NAMA_SEKOLAH', APP.NAME), link: setting_('APP_URL', '') };
    var rows = [];
    daftar.forEach(function (d) {
      var p = d.penerima || {}, v = Object.assign({}, dasar, { nama: p.nama || 'Bapak/Ibu' }, d.vars || {});
      if (waOn && m.wa && hpValid_(p.hp)) rows.push(barisAntrian_('WA', hp62_(p.hp), p.nama, '', isiTemplate_(m.pesan, v), event, d.refId, ''));
      if (emOn && m.email && emailValid_(p.email)) rows.push(barisAntrian_('EMAIL', String(p.email).trim(), p.nama, isiTemplate_(m.subjek, v), isiTemplate_(m.pesan, v), event, d.refId, ''));
    });
    if (!rows.length) return 0;
    if (_IN_WEB) { _NQ = _NQ.concat(rows); return rows.length; }   // request web: antre di cache setelah aksi sukses
    return tulisAntrian_(rows);                                     // trigger / editor: langsung ke sheet
  } catch (e) { console.error('kirimNotif_ (tidak fatal): ' + e.message); return 0; }
}

function barisAntrian_(kanal, tujuan, nama, subjek, pesan, event, refId, blastId) {
  return { AntrianID: '', Kanal: kanal, Tujuan: tujuan, NamaPenerima: nama || '', Subjek: subjek || '', Pesan: pesan, Event: event || '', RefID: refId || '', BlastID: blastId || '',
    Status: 'Antri', Percobaan: 0, Respon: '', DibuatPada: nowIso_(), DikirimPada: '' };
}

// ---------------------------------------------------------------------
// Fonnte
// ---------------------------------------------------------------------
function fonnte_(path, payload) {
  var token = prop_('FONNTE_TOKEN');
  if (!token) return { status: false, reason: 'Token Fonnte belum diisi.' };
  try {
    var r = UrlFetchApp.fetch(FONNTE_API + path, { method: 'post', headers: { Authorization: token }, payload: payload || {}, muteHttpExceptions: true });
    try { return JSON.parse(r.getContentText()); } catch (e) { return { status: false, reason: r.getContentText().substring(0, 120) }; }
  } catch (e) { return { status: false, reason: 'Koneksi Fonnte gagal: ' + e.message }; }
}

/** 1 request per batch (param `data`); fallback 1 request/pesan paralel (fetchAll) */
function fonnteKirimBanyak_(pesan, jeda) {
  if (!pesan.length) return [];
  var data = pesan.map(function (m) { return { target: m.target, message: m.message, delay: String(jeda || '2'), countryCode: '62' }; });
  var res = fonnte_('/send', { data: JSON.stringify(data) });
  if (res && res.status) return pesan.map(function (m, i) { return { ok: true, respon: 'OK ' + ([].concat(res.id || [])[i] || '') }; });
  var token = prop_('FONNTE_TOKEN');
  if (!token) return pesan.map(function () { return { ok: false, respon: 'Token kosong' }; });
  var resps = UrlFetchApp.fetchAll(pesan.map(function (m) {
    return { url: FONNTE_API + '/send', method: 'post', headers: { Authorization: token }, payload: { target: m.target, message: m.message, countryCode: '62' }, muteHttpExceptions: true };
  }));
  return resps.map(function (r) {
    try { var j = JSON.parse(r.getContentText()); return { ok: !!j.status, respon: j.status ? 'OK' : (j.reason || 'Ditolak') }; }
    catch (e) { return { ok: false, respon: 'HTTP ' + r.getResponseCode() }; }
  });
}

function emailHtml_(subjek, pesan) {
  var esc = String(pesan).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var body = esc.replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>');
  return '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">' +
    '<div style="background:#1E3A5F;color:#fff;padding:16px 20px;font-weight:700">' + setting_('NAMA_SEKOLAH', APP.NAME) + '<div style="font-size:12px;font-weight:400;color:#F5A623">SIAKAD SISWA</div></div>' +
    '<div style="padding:20px;color:#1A1A2E;font-size:14px;line-height:1.6">' + body + '</div>' +
    '<div style="padding:12px 20px;background:#F5F7FA;color:#64748B;font-size:11px">Pesan otomatis dari SIAKAD SISWA. Mohon tidak membalas email ini.</div></div>';
}

// ---------------------------------------------------------------------
// Prosesor antrean (dipanggil pekerjaMenit & tombol manual)
// ---------------------------------------------------------------------
function jedaRata_(j) { var p = String(j || '5').split('-').map(Number); return p.length > 1 ? (p[0] + p[1]) / 2 : p[0]; }

function prosesAntrianNotif(opsi) {
  opsi = opsi || {};
  if (!opsi.paksa && propFresh_('ANTRIAN_ADA') !== '1') { if (!opsi.tanpaTugasLain) { deteksiWAOtomatis_(); crmSyncTerjadwal_(); } return { info: 'Antrean kosong' }; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { info: 'Prosesor sedang berjalan' };
  var hasil = { wa: 0, email: 0, gagal: 0 };
  try {
    var sh = getSheet_('AntrianNotif'), last = sh.getLastRow();
    var start = Math.max(2, Number(propFresh_('ANTRIAN_MULAI') || 2));
    if (start > last) { setProp_('ANTRIAN_ADA', '0'); return hasil; }
    var h = DB.headers_(sh), C = {}; h.forEach(function (k, i) { C[k] = i; });
    var v = sh.getRange(start, 1, last - start + 1, h.length).getValues();
    var waOn = waAktif_(), emOn = emailAktif_();
    var blasts = {}; DB.all('BlastWA').forEach(function (b) { if (b.Status === 'Berjalan') blasts[b.BlastID] = b; });
    var ambilWA = [], ambilEmail = [], perBlast = {};
    var kuotaEmail = 0; try { kuotaEmail = Math.min(40, MailApp.getRemainingDailyQuota()); } catch (e) {}
    for (var i = 0; i < v.length; i++) {
      var r = v[i]; if (r[C.Status] !== 'Antri') continue;
      var bid = String(r[C.BlastID] || '');
      if (bid) {
        if (!waOn || !blasts[bid] || (opsi.blastId && opsi.blastId !== bid)) continue;
        var arr = perBlast[bid] = perBlast[bid] || [];
        if (arr.length < Number(blasts[bid].UkuranBatch || 20)) arr.push(i);
      } else if (!opsi.hanyaBlast) {
        if (r[C.Kanal] === 'WA' && waOn && ambilWA.length < 30) ambilWA.push(i);
        else if (r[C.Kanal] === 'EMAIL' && emOn && ambilEmail.length < kuotaEmail) ambilEmail.push(i);
      }
    }
    var touched = [], dihubungi = [];
    function tandai(idx, okx, respon) {
      var r = v[idx];
      if (okx) { r[C.Status] = 'Terkirim'; r[C.DikirimPada] = nowIso_(); dihubungi.push(r[C.Tujuan]); }
      else { r[C.Percobaan] = Number(r[C.Percobaan] || 0) + 1; if (r[C.Percobaan] >= 3) { r[C.Status] = 'Gagal'; hasil.gagal++; } }
      r[C.Respon] = String(respon || '').substring(0, 200);
      touched.push(idx);
    }
    if (ambilWA.length) {
      var res = fonnteKirimBanyak_(ambilWA.map(function (i) { return { target: v[i][C.Tujuan], message: v[i][C.Pesan] }; }), setting_('WA_JEDA_DETIK', '5'));
      ambilWA.forEach(function (i, j) { tandai(i, res[j].ok, res[j].respon); if (res[j].ok) hasil.wa++; });
    }
    var statBlast = {};
    Object.keys(perBlast).forEach(function (bid) {
      var idxs = perBlast[bid]; if (!idxs.length) return;
      var res = fonnteKirimBanyak_(idxs.map(function (i) { return { target: v[i][C.Tujuan], message: v[i][C.Pesan] }; }), blasts[bid].JedaDetik || setting_('WA_JEDA_DETIK', '5'));
      var st = statBlast[bid] = { ok: 0, gagal: 0 };
      idxs.forEach(function (i, j) { var before = v[i][C.Status]; tandai(i, res[j].ok, res[j].respon); if (res[j].ok) { st.ok++; hasil.wa++; } else if (v[i][C.Status] === 'Gagal' && before !== 'Gagal') st.gagal++; });
    });
    var nama = setting_('EMAIL_NAMA_PENGIRIM', APP.NAME);
    ambilEmail.forEach(function (i) {
      try { MailApp.sendEmail({ to: v[i][C.Tujuan], subject: v[i][C.Subjek] || nama, body: String(v[i][C.Pesan]).replace(/\*/g, ''), htmlBody: emailHtml_(v[i][C.Subjek], v[i][C.Pesan]), name: nama }); tandai(i, true, 'OK'); hasil.email++; }
      catch (e) { tandai(i, false, e.message); }
    });
    if (touched.length) {
      var mn = Math.min.apply(null, touched), mx = Math.max.apply(null, touched);
      sh.getRange(start + mn, 1, mx - mn + 1, h.length).setValues(v.slice(mn, mx + 1));
      invalidateRows_('AntrianNotif');
      bump_('adm', true);                                  // progres blast tampil segar di menu admin
    }
    // statistik blast
    var sisaBlast = {};
    v.forEach(function (r) { var b = String(r[C.BlastID] || ''); if (b && r[C.Status] === 'Antri') sisaBlast[b] = (sisaBlast[b] || 0) + 1; });
    var upB = [];
    Object.keys(blasts).forEach(function (bid) {
      var b = blasts[bid], st = statBlast[bid] || { ok: 0, gagal: 0 };
      if (!st.ok && !st.gagal && sisaBlast[bid]) return;
      var p = { BlastID: bid, Terkirim: Number(b.Terkirim || 0) + st.ok, Gagal: Number(b.Gagal || 0) + st.gagal };
      if (!sisaBlast[bid]) { p.Status = 'Selesai'; p.SelesaiPada = nowIso_(); }
      upB.push(p);
    });
    DB.updateBatch('BlastWA', 'BlastID', upB);
    // majukan penunjuk
    var firstAntri = -1;
    for (var k = 0; k < v.length; k++) if (v[k][C.Status] === 'Antri') { firstAntri = k; break; }
    if (firstAntri === -1) setProps_({ ANTRIAN_MULAI: String(last + 1), ANTRIAN_ADA: '0' });
    else setProp_('ANTRIAN_MULAI', String(start + firstAntri));
    if (dihubungi.length) crmCatatKirim_(dihubungi);
  } finally { lock.releaseLock(); }
  return hasil;
}

// ---------------------------------------------------------------------
// Pemantauan antrean
// ---------------------------------------------------------------------
function tailRows_(name, n) {
  var sh = getSheet_(name), last = sh.getLastRow(); if (last < 2) return [];
  var cnt = Math.min(n, last - 1), h = DB.headers_(sh), v = sh.getRange(last - cnt + 1, 1, cnt, h.length).getValues();
  return v.map(function (r, i) { var o = { _row: last - cnt + 1 + i }; h.forEach(function (k, j) { o[k] = normCell_(k, r[j]); }); return o; });
}

function svcNotifQueue(ctx, d) {
  var rows = tailRows_('AntrianNotif', 3000);
  var ring = { Antri: 0, Terkirim: 0, Gagal: 0, Batal: 0 };
  rows.forEach(function (r) { if (ring[r.Status] !== undefined) ring[r.Status]++; });
  var f = rows.filter(function (r) { return (!d.status || r.Status === d.status) && (!d.kanal || r.Kanal === d.kanal) && (!d.blastId || r.BlastID === d.blastId); });
  var nq = CacheX.get('nq') || [];
  ring.Antri += nq.length;
  return ok_({ antreanCache: nq.length, rows: f.slice(-300).reverse().map(function (r) { var o = Object.assign({}, r); o.Pesan = String(o.Pesan).substring(0, 240); delete o._row; return o; }), ringkas: ring, waAktif: waAktif_(), emailAktif: emailAktif_() });
}
function svcNotifProcessNow(ctx, d) { withLock_(function () { return pindahkanNQ_(); }); var h = prosesAntrianNotif({ paksa: true }); return ok_(h, h.info || ('Diproses: ' + (h.wa || 0) + ' WA, ' + (h.email || 0) + ' email.')); }
function svcNotifRetry(ctx, d) {
  var rows = tailRows_('AntrianNotif', 3000).filter(function (r) { return r.Status === 'Gagal' && (!d.ids || d.ids.indexOf(r.AntrianID) > -1); });
  if (!rows.length) return ok_({ n: 0 }, 'Tidak ada pesan gagal.');
  DB.updateBatch('AntrianNotif', 'AntrianID', rows.map(function (r) { return { AntrianID: r.AntrianID, Status: 'Antri', Percobaan: 0, Respon: 'Diulang' }; }));
  var minRow = Math.min.apply(null, rows.map(function (r) { return r._row; }));
  setProps_({ ANTRIAN_MULAI: String(Math.min(minRow, Number(propFresh_('ANTRIAN_MULAI') || minRow))), ANTRIAN_ADA: '1' });
  return ok_({ n: rows.length }, rows.length + ' pesan dijadwalkan ulang.');
}

function svcWaDevice(ctx, d) {
  var r = fonnte_('/device', {});
  if (!r || r.status === false) return fail_(r && r.reason ? r.reason : 'Perangkat tidak terbaca.');
  return ok_({ device: r.device, status: r.device_status, paket: r.package, kuota: r.quota, expired: r.expired, nama: r.name });
}
function svcWaTest(ctx, d) {
  if (!hpValid_(d.nomor)) return fail_('Nomor tidak valid (contoh 0812xxxxxxx).');
  var r = fonnte_('/send', { target: hp62_(d.nomor), message: d.pesan || ('✅ Tes notifikasi WhatsApp dari ' + setting_('NAMA_SEKOLAH', APP.NAME) + ' — SIAKAD SISWA berhasil tersambung.'), countryCode: '62' });
  return r && r.status ? ok_(r, 'Pesan tes terkirim ke ' + hp08_(d.nomor) + '.') : fail_('Gagal: ' + (r && r.reason ? r.reason : 'tidak diketahui'));
}
function svcEmailTest(ctx, d) {
  if (!emailValid_(d.email)) return fail_('Email tidak valid.');
  try {
    MailApp.sendEmail({ to: d.email, subject: 'Tes Email SIAKAD SISWA', body: 'Tes email berhasil.', htmlBody: emailHtml_('Tes', '✅ Tes email dari *SIAKAD SISWA* berhasil.\nKonfigurasi email siap digunakan.'), name: setting_('EMAIL_NAMA_PENGIRIM', APP.NAME) });
    return ok_(null, 'Email tes terkirim ke ' + d.email + '.');
  } catch (e) { return fail_('Gagal kirim email: ' + e.message); }
}

// ---------------------------------------------------------------------
// Deteksi nomor WhatsApp (Fonnte /validate, maks 50/panggilan)
// ---------------------------------------------------------------------
function svcWaValidate(ctx, d) {
  var nomor = [], seen = {};
  (d.nomor || []).forEach(function (n) { var h = hp08_(n); if (hpValid_(h) && !seen[h]) { seen[h] = 1; nomor.push(h); } });
  nomor = nomor.slice(0, 50);
  if (!nomor.length) return ok_({ hasil: {} }, 'Tidak ada nomor valid untuk dicek.');
  var r = fonnte_('/validate', { target: nomor.map(hp62_).join(','), countryCode: '62' });
  if (!r || r.status === false) return fail_('Deteksi WA gagal: ' + (r && r.reason ? r.reason : 'fitur validate mungkin tidak tersedia di paket Fonnte Anda.'));
  var hasil = {};
  [].concat(r.registered || []).forEach(function (n) { hasil[hp08_(n)] = 'Terdaftar'; });
  [].concat(r.not_registered || []).forEach(function (n) { hasil[hp08_(n)] = 'Tidak Terdaftar'; });
  withLock_(function () { simpanStatusWA_(hasil); return ok_(); });
  return ok_({ hasil: hasil }, Object.keys(hasil).length + ' nomor dicek.');
}
function simpanStatusWA_(hasil) {
  var now = nowIso_();
  Object.keys(SUMBER_KONTAK).forEach(function (kode) {
    var s = SUMBER_KONTAK[kode]; if (!s.statusWA) return;
    var up = DB.all(s.tabel).filter(function (r) { return hasil[hp08_(r[s.hp])]; }).map(function (r) { var o = {}; o[s.id] = r[s.id]; o.StatusWA = hasil[hp08_(r[s.hp])]; o.CekWAAt = now; return o; });
    DB.updateBatch(s.tabel, s.id, up);
  });
  DB.updateBatch('CRM_Kontak', 'KontakID', DB.all('CRM_Kontak').filter(function (k) { return hasil[hp08_(k.NoWA)]; }).map(function (k) { return { KontakID: k.KontakID, StatusWA: hasil[hp08_(k.NoWA)], CekWAAt: now }; }));
  bump_('master');
}
function deteksiWAOtomatis_() {
  if (setting_('WA_DETEKSI_OTOMATIS', 'YA') !== 'YA' || !prop_('FONNTE_TOKEN')) return;
  var last = Number(propFresh_('DETEKSI_WA_TERAKHIR') || 0);
  if (Date.now() - last < 10 * 60e3) return;
  setProp_('DETEKSI_WA_TERAKHIR', String(Date.now()));
  var nomor = DB.all('CRM_Kontak').filter(function (k) { return !k.StatusWA && hpValid_(k.NoWA) && k.Tag.indexOf('merged') === -1; }).slice(0, 50).map(function (k) { return k.NoWA; });
  if (nomor.length) { try { svcWaValidate({}, { nomor: nomor }); } catch (e) {} }
}

// ---------------------------------------------------------------------
// Blast WhatsApp per batch
// ---------------------------------------------------------------------
function svcWaAudience(ctx, d) {
  var rows = [], kelasNama = {};
  DB.all('Kelas').forEach(function (k) { kelasNama[k.kelas_id] = k.nama_kelas; });
  if (d.sumber === 'manual') {
    String(d.manual || '').split(/\n/).forEach(function (line) {
      var p = line.split('|'); if (!line.trim()) return;
      rows.push({ id: '', nama: (p[1] || '').trim() || 'Bapak/Ibu', hp: hp08_(p[0]), statusWA: '', vars: {}, optOut: false });
    });
  } else {
    DB.all('CRM_Kontak').forEach(function (k) {
      if (String(k.Tag).indexOf('merged') > -1) return;
      if (d.segmen && k.Segmen !== d.segmen) return;
      if (d.tag && String(k.Tag).split(',').map(function (t) { return t.trim(); }).indexOf(d.tag) === -1) return;
      var info = {}; try { info = JSON.parse(k.Info || '{}'); } catch (e) {}
      if (d.kelas_id && info.kelas_id !== d.kelas_id) return;
      if (d.statusWA && (k.StatusWA || 'Belum') !== d.statusWA) return;
      rows.push({ id: k.KontakID, nama: k.Nama, hp: hp08_(k.NoWA), statusWA: k.StatusWA, optOut: k.OptOut === 'YA', segmen: k.Segmen,
        vars: { kelas: kelasNama[info.kelas_id] || '', nis: info.NIS || '', siswa: info.nama_lengkap || '' } });
    });
  }
  var seen = {}, ring = { total: rows.length, valid: 0, tidakValid: 0, ganda: 0, terdaftarWA: 0, tidakTerdaftarWA: 0, optOut: 0 };
  rows.forEach(function (r) {
    r.valid = hpValid_(r.hp);
    r.ganda = r.valid && !!seen[r.hp]; if (r.valid) seen[r.hp] = 1;
    if (!r.valid) ring.tidakValid++; else if (r.ganda) ring.ganda++; else ring.valid++;
    if (r.statusWA === 'Terdaftar') ring.terdaftarWA++; if (r.statusWA === 'Tidak Terdaftar') ring.tidakTerdaftarWA++;
    if (r.optOut) ring.optOut++;
  });
  return ok_({ rows: rows.slice(0, 5000), ringkas: ring });
}

function svcWaBlastCreate(ctx, d) {
  if (!waAktif_()) return fail_('Notifikasi WhatsApp belum aktif. Isi token & nyalakan di tab Konfigurasi.');
  var ukuran = Number(d.ukuranBatch), jeda = String(d.jeda || setting_('WA_JEDA_DETIK', '5'));
  if ([10, 20, 50].indexOf(ukuran) === -1) return fail_('Ukuran batch harus 10, 20, atau 50.');
  if (!/^\d{1,3}(-\d{1,3})?$/.test(jeda)) return fail_('Jeda tidak valid.');
  if (!String(d.pesan || '').trim()) return fail_('Isi pesan masih kosong.');
  var optout = {}; DB.all('CRM_Kontak').forEach(function (k) { if (k.OptOut === 'YA') optout[hp08_(k.NoWA)] = 1; });
  var seen = {}, list = [];
  (d.penerima || []).forEach(function (p) { var h = hp08_(p.hp); if (hpValid_(h) && !seen[h] && !optout[h]) { seen[h] = 1; list.push(p); } });
  if (!list.length) return fail_('Tidak ada penerima valid (setelah membuang nomor ganda, tidak valid, dan opt-out).');
  if (list.length > 5000) return fail_('Maksimal 5.000 penerima per blast.');
  var bid = reserveIds_('BlastWA', 1)[0];
  var dasar = { institusi: setting_('NAMA_SEKOLAH', APP.NAME), link: setting_('APP_URL', '') };
  var rows = list.map(function (p) { return barisAntrian_('WA', hp62_(p.hp), p.nama, '', isiTemplate_(d.pesan, Object.assign({}, dasar, { nama: p.nama || 'Bapak/Ibu' }, p.vars || {})), 'BLAST', p.id || '', bid); });
  var ids = reserveIds_('AntrianNotif', rows.length); rows.forEach(function (r, i) { r.AntrianID = ids[i]; });
  DB.appendBatch('AntrianNotif', rows);
  DB.appendBatch('BlastWA', [{ BlastID: bid, Judul: d.judul || 'Blast ' + today_(), Pesan: d.pesan, Sasaran: d.sasaran || '', Total: rows.length, Terkirim: 0, Gagal: 0, UkuranBatch: ukuran, JedaDetik: jeda, Status: 'Berjalan', DibuatOleh: ctx.session.email, Tanggal: nowIso_(), SelesaiPada: '' }]);
  if (!propFresh_('ANTRIAN_MULAI')) setProp_('ANTRIAN_MULAI', '2');
  setProp_('ANTRIAN_ADA', '1');
  return ok_({ blastId: bid, total: rows.length, batch: Math.ceil(rows.length / ukuran) }, 'Blast dibuat: ' + rows.length + ' penerima, ' + Math.ceil(rows.length / ukuran) + ' batch.');
}
function blastInfo_(b) {
  var sisa = Math.max(0, Number(b.Total || 0) - Number(b.Terkirim || 0) - Number(b.Gagal || 0));
  return Object.assign({}, b, { sisa: b.Status === 'Dihentikan' ? 0 : sisa, persen: b.Total ? Math.round((Number(b.Terkirim || 0) + Number(b.Gagal || 0)) / Number(b.Total) * 100) : 0 });
}
function svcWaBlastList(ctx, d) { return ok_(DB.all('BlastWA').slice(-100).reverse().map(blastInfo_)); }
function svcWaBlastProcess(ctx, d) {
  var h = prosesAntrianNotif({ paksa: true, blastId: d.blastId, hanyaBlast: true });
  invalidateRows_('BlastWA');
  var b = DB.find('BlastWA', 'BlastID', d.blastId);
  return ok_({ blast: b ? blastInfo_(b) : null, hasil: h }, h.info || ('Batch terkirim: ' + (h.wa || 0) + ' pesan.'));
}
function svcWaBlastStop(ctx, d) {
  var b = DB.find('BlastWA', 'BlastID', d.blastId); if (!b) return fail_('Blast tidak ditemukan.');
  var rows = tailRows_('AntrianNotif', 6000).filter(function (r) { return r.BlastID === d.blastId && r.Status === 'Antri'; });
  DB.updateBatch('AntrianNotif', 'AntrianID', rows.map(function (r) { return { AntrianID: r.AntrianID, Status: 'Batal', Respon: 'Dihentikan admin' }; }));
  DB.updateBatch('BlastWA', 'BlastID', [{ BlastID: b.BlastID, Status: 'Dihentikan', SelesaiPada: nowIso_() }]);
  return ok_({ dibatalkan: rows.length }, 'Blast dihentikan, ' + rows.length + ' pesan dibatalkan.');
}

;
// ==== CRM.gs ====
/**
 * =====================================================================
 *  SIAKAD SISWA — File 5/5 : CRM.gs  (gas-notifikasi-wa-crm, Bagian 7)
 *  CRM Kontak: Nama · Email · WhatsApp dari Siswa, Orang Tua, dan Guru.
 *  CRM_Kontak = materialisasi (sinkron), bukan pengganti tabel asli.
 * =====================================================================
 */

/** Sumber kontak. statusWA = kolom StatusWA di tabel sumber yang merepresentasikan nomor ini. */
var SUMBER_KONTAK = {
  siswa: { tabel: 'Siswa', id: 'NIS', nama: 'nama_lengkap', email: 'email', hp: 'no_wa', segmen: 'Siswa', status: 'status', gender: 'jenis_kelamin', info: ['NIS', 'kelas_id'] },
  ortu:  { tabel: 'Siswa', id: 'NIS', nama: 'nama_ortu', email: '', hp: 'no_wa_ortu', segmen: 'Orang Tua', status: 'status', gender: 'jenis_kelamin', info: ['NIS', 'kelas_id', 'nama_lengkap'], statusWA: true },
  guru:  { tabel: 'Guru', id: 'NUPTK', nama: 'nama_lengkap', email: 'email', hp: 'no_wa', segmen: 'Guru', status: 'status', info: ['mata_pelajaran', 'jabatan'], statusWA: true }
};

function kontakData_(kode, r, now) {
  var s = SUMBER_KONTAK[kode];
  var nama = r[s.nama] || (kode === 'ortu' ? 'Orang Tua ' + (r.nama_lengkap || '') : ''), hp = hp08_(r[s.hp]);
  var email = s.email ? lower_(r[s.email]) : '';
  if (!hp && !email) return null;
  var info = {}; (s.info || []).forEach(function (f) { info[f] = r[f]; });
  if (s.status) info.Status = r[s.status] || 'Aktif';
  if (s.gender) info.JK = r[s.gender];
  return { Nama: nama, Email: email, NoWA: hp, Segmen: s.segmen, Sumber: kode, RefID: String(r[s.id]), EmailValid: email ? (emailValid_(email) ? 'YA' : 'TIDAK') : '',
    StatusWA: s.statusWA ? (r.StatusWA || '') : '', CekWAAt: s.statusWA ? (r.CekWAAt || '') : '', Info: JSON.stringify(info), DiperbaruiPada: now };
}

/** Sinkron semua sumber → CRM_Kontak. Idempoten, batch. */
function svcCrmSync(ctx, d) {
  var lama = DB.all('CRM_Kontak'), idx = {};
  lama.forEach(function (k, i) { idx[k.Sumber + ':' + k.RefID] = i; });
  var baru = [], ubah = [], now = nowIso_();
  Object.keys(SUMBER_KONTAK).forEach(function (kode) {
    var s = SUMBER_KONTAK[kode];
    DB.all(s.tabel).forEach(function (r) {
      var data = kontakData_(kode, r, now); if (!data) return;
      var k = kode + ':' + data.RefID;
      if (idx[k] === undefined) {
        baru.push(Object.assign({ KontakID: '', Tag: '', OptOut: 'TIDAK', Catatan: '', JumlahPesan: 0, TerakhirDihubungi: '', DibuatPada: now }, data));
        idx[k] = -1;
      } else if (idx[k] > -1) {
        var lk = lama[idx[k]];
        var berubah = ['Nama', 'Email', 'NoWA', 'Info'].some(function (f) { return String(lk[f]) !== String(data[f]); }) || (data.StatusWA && data.StatusWA !== lk.StatusWA);
        if (berubah) {
          if (hp08_(lk.NoWA) !== data.NoWA) { data.StatusWA = ''; data.CekWAAt = ''; }
          else if (!data.StatusWA) { delete data.StatusWA; delete data.CekWAAt; }
          ubah.push(Object.assign({ KontakID: lk.KontakID }, data));
        }
      }
    });
  });
  if (baru.length) { var ids = reserveIds_('CRM_Kontak', baru.length); baru.forEach(function (b, i) { b.KontakID = ids[i]; }); DB.appendBatch('CRM_Kontak', baru); }
  if (ubah.length) DB.updateBatch('CRM_Kontak', 'KontakID', ubah);
  setProp_('CRM_SYNC_TERAKHIR', String(Date.now()));
  return ok_({ ditambah: baru.length, diperbarui: ubah.length, total: lama.length + baru.length, terakhir: nowIso_() }, 'Sinkron CRM: +' + baru.length + ' baru, ' + ubah.length + ' diperbarui.');
}
function crmSyncTerjadwal_() {
  var menit = num_(setting_('CRM_SYNC_MENIT', 30), 30), last = Number(propFresh_('CRM_SYNC_TERAKHIR') || 0);
  if (!menit || Date.now() - last < menit * 60e3) return;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(3000)) return;
  try { svcCrmSync({}, {}); } finally { lock.releaseLock(); }
}
/** Dipanggil setelah transaksi penting (siswa baru) agar kontak langsung muncul */
function crmUpsertSatu_(kode, r) {
  var data = kontakData_(kode, r, nowIso_()); if (!data) return;
  var ex = DB.all('CRM_Kontak').filter(function (k) { return k.Sumber === kode && String(k.RefID) === data.RefID; })[0];
  if (ex) { if (hp08_(ex.NoWA) !== data.NoWA) { data.StatusWA = ''; data.CekWAAt = ''; } else { delete data.StatusWA; delete data.CekWAAt; } DB.updateBatch('CRM_Kontak', 'KontakID', [Object.assign({ KontakID: ex.KontakID }, data)]); }
  else DB.appendBatch('CRM_Kontak', [Object.assign({ KontakID: reserveIds_('CRM_Kontak', 1)[0], Tag: '', OptOut: 'TIDAK', Catatan: '', JumlahPesan: 0, TerakhirDihubungi: '', DibuatPada: nowIso_() }, data)]);
}

function crmRows_() {
  var rows = DB.all('CRM_Kontak').filter(function (k) { return String(k.Tag).indexOf('merged') === -1; });
  var cntWA = {}, cntEm = {};
  rows.forEach(function (k) { if (k.NoWA) cntWA[k.NoWA] = (cntWA[k.NoWA] || 0) + 1; if (k.Email) cntEm[k.Email] = (cntEm[k.Email] || 0) + 1; });
  return rows.map(function (k) {
    var o = Object.assign({}, k); try { o.info = JSON.parse(k.Info || '{}'); } catch (e) { o.info = {}; }
    o.duplikat = (k.NoWA && cntWA[k.NoWA] > 1) || (k.Email && cntEm[k.Email] > 1);
    o.waValid = hpValid_(k.NoWA);
    o.bisaDihubungi = o.waValid || k.EmailValid === 'YA';
    return o;
  });
}

function svcCrmList(ctx, d) {
  var q = lower_(d.cari), rows = crmRows_();
  var f = rows.filter(function (k) {
    if (d.segmen && k.Segmen !== d.segmen) return false;
    if (d.sumber && k.Sumber !== d.sumber) return false;
    if (d.kelas_id && k.info.kelas_id !== d.kelas_id) return false;
    if (d.tag && String(k.Tag).split(',').map(function (t) { return t.trim(); }).indexOf(d.tag) === -1) return false;
    if (d.statusWA) { var sw = k.StatusWA || 'Belum'; if (sw !== d.statusWA) return false; }
    if (d.emailValid && k.EmailValid !== d.emailValid) return false;
    if (d.optOut && k.OptOut !== d.optOut) return false;
    if (d.duplikat && !k.duplikat) return false;
    if (d.masalah && k.bisaDihubungi) return false;
    if (q && (lower_(k.Nama) + ' ' + k.Email + ' ' + k.NoWA + ' ' + lower_(k.info.nama_lengkap || '')).indexOf(q) === -1) return false;
    return true;
  }).sort(function (a, b) { return String(a.Nama).localeCompare(String(b.Nama)); });
  var per = Math.min(200, Number(d.per) || 50), hal = Math.max(1, Number(d.halaman) || 1);
  var facet = { segmen: {}, statusWA: {} };
  rows.forEach(function (k) { facet.segmen[k.Segmen] = (facet.segmen[k.Segmen] || 0) + 1; var sw = k.StatusWA || 'Belum'; facet.statusWA[sw] = (facet.statusWA[sw] || 0) + 1; });
  var tags = {}; rows.forEach(function (k) { String(k.Tag || '').split(',').forEach(function (t) { t = t.trim(); if (t) tags[t] = (tags[t] || 0) + 1; }); });
  return ok_({ rows: f.slice((hal - 1) * per, hal * per), total: f.length, halaman: hal, per: per, facet: facet, tags: tags, terakhirSync: Number(propFresh_('CRM_SYNC_TERAKHIR') || 0) });
}

function svcCrmStats(ctx, d) {
  var rows = crmRows_(), tujuh = Date.now() - 7 * 864e5, tigapuluh = Date.now() - 30 * 864e5;
  var s = { total: rows.length, waValid: 0, terdaftarWA: 0, emailValid: 0, belumCekWA: 0, optOut: 0, duplikat: 0, tidakBisa: 0, baru7: 0, dihubungi30: 0, perSegmen: {} };
  rows.forEach(function (k) {
    if (k.waValid) s.waValid++;
    if (k.StatusWA === 'Terdaftar') s.terdaftarWA++;
    if (k.EmailValid === 'YA') s.emailValid++;
    if (k.waValid && !k.StatusWA) s.belumCekWA++;
    if (k.OptOut === 'YA') s.optOut++;
    if (k.duplikat) s.duplikat++;
    if (!k.bisaDihubungi) s.tidakBisa++;
    if (new Date(k.DibuatPada).getTime() > tujuh) s.baru7++;
    if (k.TerakhirDihubungi && new Date(k.TerakhirDihubungi).getTime() > tigapuluh) s.dihubungi30++;
    s.perSegmen[k.Segmen] = (s.perSegmen[k.Segmen] || 0) + 1;
  });
  s.terakhirSync = Number(propFresh_('CRM_SYNC_TERAKHIR') || 0);
  return ok_(s);
}

function svcCrmDetail(ctx, d) {
  var k = DB.find('CRM_Kontak', 'KontakID', d.kontakId); if (!k) return fail_('Kontak tidak ditemukan.');
  var o = Object.assign({}, k); try { o.info = JSON.parse(k.Info || '{}'); } catch (e) { o.info = {}; }
  var s = SUMBER_KONTAK[k.Sumber], asli = s ? DB.find(s.tabel, s.id, k.RefID) : null;
  var tujuanWA = hp62_(k.NoWA), em = lower_(k.Email);
  var pesan = tailRows_('AntrianNotif', 3000).filter(function (r) { return (tujuanWA && r.Tujuan === tujuanWA) || (em && lower_(r.Tujuan) === em); }).slice(-50)
    .map(function (r) { return { tipe: 'pesan', kanal: r.Kanal, ringkasan: String(r.Pesan).substring(0, 160), status: r.Status, event: r.Event, tanggal: r.DikirimPada || r.DibuatPada }; });
  var inter = DB.all('CRM_Interaksi').filter(function (i) { return i.KontakID === k.KontakID; }).map(function (i) { return { tipe: 'interaksi', kanal: i.Kanal, ringkasan: i.Ringkasan, oleh: i.Oleh, tanggal: i.Tanggal }; });
  return ok_({ kontak: o, asli: asli ? (asli.password_hash ? null : asli) : null, timeline: pesan.concat(inter).sort(function (a, b) { return String(b.tanggal).localeCompare(String(a.tanggal)); }) });
}

function svcCrmSave(ctx, d) {
  var x = d.kontak || {}, k = DB.find('CRM_Kontak', 'KontakID', x.KontakID); if (!k) return fail_('Kontak tidak ditemukan.');
  if (x.NoWA && !hpValid_(x.NoWA)) return fail_('Nomor WA tidak valid.');
  if (x.Email && !emailValid_(x.Email)) return fail_('Email tidak valid.');
  var patch = { KontakID: k.KontakID, Tag: x.Tag !== undefined ? x.Tag : k.Tag, Catatan: x.Catatan !== undefined ? x.Catatan : k.Catatan, OptOut: x.OptOut !== undefined ? (x.OptOut === 'YA' || x.OptOut === true ? 'YA' : 'TIDAK') : k.OptOut, DiperbaruiPada: nowIso_() };
  var s = SUMBER_KONTAK[k.Sumber], tulisBalik = {};
  ['Nama', 'Email', 'NoWA'].forEach(function (f) {
    if (x[f] === undefined || String(x[f]) === String(k[f])) return;
    patch[f] = f === 'NoWA' ? hp08_(x[f]) : f === 'Email' ? lower_(x[f]) : x[f];
    if (s) { var col = f === 'Nama' ? s.nama : f === 'Email' ? s.email : s.hp; if (col) tulisBalik[col] = patch[f]; }
    if (f === 'NoWA') { patch.StatusWA = ''; patch.CekWAAt = ''; }
    if (f === 'Email') patch.EmailValid = patch.Email ? 'YA' : '';
  });
  DB.updateBatch('CRM_Kontak', 'KontakID', [patch]);
  if (s && Object.keys(tulisBalik).length) {                  // satu sumber kebenaran
    var p2 = Object.assign({}, tulisBalik); p2[s.id] = k.RefID;
    if (tulisBalik[s.hp] !== undefined && s.statusWA) { p2.StatusWA = ''; p2.CekWAAt = ''; }
    DB.updateBatch(s.tabel, s.id, [p2]);
    if (s.tabel === 'Siswa' && tulisBalik.email) {
      var u = DB.all('Users').filter(function (u) { return u.role === 'siswa' && String(u.ref_id) === String(k.RefID); })[0];
      if (u) DB.updateBatch('Users', 'user_id', [{ user_id: u.user_id, email: tulisBalik.email }]);
    }
    bump_('master');
  }
  return ok_(null, 'Kontak disimpan.');
}

function svcCrmBulk(ctx, d) {
  var ids = d.ids || [], set = {}; ids.forEach(function (i) { set[i] = 1; });
  var rows = DB.all('CRM_Kontak').filter(function (k) { return set[k.KontakID]; });
  if (!rows.length) return fail_('Belum ada kontak dipilih.');
  var nilai = String(d.nilai || '').trim(), up = [];
  if (d.aksi === 'tag' || d.aksi === 'untag') {
    if (!nilai) return fail_('Nama tag kosong.');
    rows.forEach(function (k) {
      var t = String(k.Tag || '').split(',').map(function (x) { return x.trim(); }).filter(String);
      if (d.aksi === 'tag' && t.indexOf(nilai) === -1) t.push(nilai);
      if (d.aksi === 'untag') t = t.filter(function (x) { return x !== nilai; });
      up.push({ KontakID: k.KontakID, Tag: t.join(', ') });
    });
  } else if (d.aksi === 'optout' || d.aksi === 'optin') {
    rows.forEach(function (k) { up.push({ KontakID: k.KontakID, OptOut: d.aksi === 'optout' ? 'YA' : 'TIDAK' }); });
  } else if (d.aksi === 'hapusManual') {
    var man = rows.filter(function (k) { return k.Sumber === 'manual'; }).map(function (k) { return k.KontakID; });
    DB.deleteWhere('CRM_Kontak', 'KontakID', man);
    return ok_({ n: man.length }, man.length + ' kontak manual dihapus (kontak dari data sekolah tidak ikut terhapus).');
  } else return fail_('Aksi tidak dikenal.');
  DB.updateBatch('CRM_Kontak', 'KontakID', up);
  return ok_({ n: up.length }, 'Diterapkan ke ' + up.length + ' kontak.');
}

function svcCrmInteraksi(ctx, d) {
  var k = DB.find('CRM_Kontak', 'KontakID', d.kontakId); if (!k) return fail_('Kontak tidak ditemukan.');
  if (!String(d.ringkasan || '').trim()) return fail_('Ringkasan interaksi kosong.');
  var row = { InteraksiID: reserveIds_('CRM_Interaksi', 1)[0], KontakID: k.KontakID, Kanal: d.kanal || 'Catatan', Arah: d.arah || 'Keluar', Ringkasan: String(d.ringkasan).substring(0, 1000), RefID: '', Oleh: ctx.session.email, Tanggal: nowIso_() };
  DB.appendBatch('CRM_Interaksi', [row]);
  DB.updateBatch('CRM_Kontak', 'KontakID', [{ KontakID: k.KontakID, TerakhirDihubungi: row.Tanggal }]);
  return ok_(row, 'Interaksi dicatat.');
}

function svcCrmImport(ctx, d) {
  var rows = d.rows || [], now = nowIso_(), have = {}, baru = [], lewati = 0;
  DB.all('CRM_Kontak').forEach(function (k) { if (k.Sumber === 'manual') have[k.RefID] = 1; });
  rows.forEach(function (r) {
    var hp = hp08_(r.wa || r.hp || r.nowa), email = lower_(r.email), key = hp || email;
    if (!key || have[key] || (!hpValid_(hp) && !emailValid_(email))) { lewati++; return; }
    have[key] = 1;
    baru.push({ Nama: r.nama || 'Tanpa Nama', Email: email, NoWA: hp, Segmen: r.segmen || 'Lainnya', Sumber: 'manual', RefID: key, Tag: r.tag || '', StatusWA: '', CekWAAt: '', EmailValid: email ? (emailValid_(email) ? 'YA' : 'TIDAK') : '',
      OptOut: 'TIDAK', Catatan: '', JumlahPesan: 0, TerakhirDihubungi: '', Info: '{}', DibuatPada: now, DiperbaruiPada: now });
  });
  if (baru.length) { var ids = reserveIds_('CRM_Kontak', baru.length); baru.forEach(function (b, i) { b.KontakID = ids[i]; }); DB.appendBatch('CRM_Kontak', baru); }
  return ok_({ ditambah: baru.length, dilewati: lewati }, baru.length + ' kontak diimpor, ' + lewati + ' dilewati (ganda/tidak valid).');
}

function svcCrmMerge(ctx, d) {
  var utama = DB.find('CRM_Kontak', 'KontakID', d.utama); if (!utama) return fail_('Kontak utama tidak ditemukan.');
  var gabung = (d.gabung || []).filter(function (id) { return id !== d.utama; }).map(function (id) { return DB.find('CRM_Kontak', 'KontakID', id); }).filter(Boolean);
  if (!gabung.length) return fail_('Pilih kontak yang akan digabung.');
  var tags = String(utama.Tag || '').split(',').map(function (t) { return t.trim(); }).filter(String), jml = Number(utama.JumlahPesan || 0), cat = utama.Catatan ? [utama.Catatan] : [];
  gabung.forEach(function (g) {
    String(g.Tag || '').split(',').forEach(function (t) { t = t.trim(); if (t && tags.indexOf(t) === -1 && t.indexOf('merged') === -1) tags.push(t); });
    jml += Number(g.JumlahPesan || 0); if (g.Catatan) cat.push(g.Catatan);
  });
  DB.updateBatch('CRM_Kontak', 'KontakID', [{ KontakID: utama.KontakID, Tag: tags.join(', '), JumlahPesan: jml, Catatan: cat.join(' | ').substring(0, 1000), OptOut: gabung.some(function (g) { return g.OptOut === 'YA'; }) || utama.OptOut === 'YA' ? 'YA' : 'TIDAK' }]
    .concat(gabung.map(function (g) { return { KontakID: g.KontakID, Tag: 'merged→' + utama.KontakID }; })));
  return ok_(null, gabung.length + ' kontak digabung ke ' + utama.Nama + '.');
}

function svcCrmExport(ctx, d) {
  var kelasNama = {}; DB.all('Kelas').forEach(function (k) { kelasNama[k.kelas_id] = k.nama_kelas; });
  var out = [], hal = 1;
  while (true) {
    var r = svcCrmList(ctx, Object.assign({}, d, { per: 200, halaman: hal })).data;
    r.rows.forEach(function (k) { out.push([k.Nama, k.Segmen, k.NoWA, k.StatusWA || 'Belum dicek', k.Email, k.EmailValid, kelasNama[k.info.kelas_id] || '', k.Tag, k.OptOut, k.JumlahPesan, k.TerakhirDihubungi]); });
    if (hal * 200 >= r.total) break; hal++;
  }
  queueLog_([ctx.session.email, ctx.session.role, 'crm.export', out.length + ' kontak', '']);
  return ok_({ headers: ['Nama', 'Segmen', 'No WA', 'Status WA', 'Email', 'Email Valid', 'Kelas', 'Tag', 'Opt-out', 'Jumlah Pesan', 'Terakhir Dihubungi'], rows: out, n: out.length });
}

/** Dipanggil prosesor antrean: naikkan JumlahPesan & TerakhirDihubungi (1× updateBatch) */
function crmCatatKirim_(tujuan) {
  var set = {}; tujuan.forEach(function (t) { set[String(t).toLowerCase()] = (set[String(t).toLowerCase()] || 0) + 1; });
  var now = nowIso_();
  var up = DB.all('CRM_Kontak').map(function (k) {
    var n = (set[hp62_(k.NoWA)] || 0) + (k.Email ? (set[lower_(k.Email)] || 0) : 0);
    return n ? { KontakID: k.KontakID, JumlahPesan: Number(k.JumlahPesan || 0) + n, TerakhirDihubungi: now } : null;
  }).filter(Boolean);
  DB.updateBatch('CRM_Kontak', 'KontakID', up);
}
