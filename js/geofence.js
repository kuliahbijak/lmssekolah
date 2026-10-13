/* =====================================================================
   SIAKAD SISWA v2.1 — geofence.js
   Widget geofence bersama (siswa & guru): posisi perangkat vs semua lokasi
   yang diizinkan untuk akun, peta (Leaflet), status kunci perangkat,
   pemilih lokasi untuk Super Admin, dan halaman "Presensi Saya" guru.
   Validasi akhir SELALU di server — widget ini hanya membantu pengguna.
   ===================================================================== */
'use strict';
var LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
var LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
function loadLeaflet() { return Promise.all([loadCss(LEAFLET_CSS), loadLib(LEAFLET_JS)]).then(function () { if (!window.L) throw new Error('Peta tidak dapat dimuat (periksa koneksi internet).'); return window.L; }); }

var Geo = {
  info: function () { return akunInfo(); },
  lokasi: function () { return (this.info().lokasi || []); },
  /** Hitung jarak ke semua lokasi → urut dari yang paling "masuk" */
  hitung: function (pos, lokasi, tol) {
    if (!pos) return [];
    var t = Math.min(Math.max(Number(pos.acc) || 0, 0), Number(tol == null ? this.info().toleransi : tol) || 0);
    return (lokasi || this.lokasi()).map(function (l) { var j = Math.round(haversine(pos.lat, pos.lng, Number(l.latitude), Number(l.longitude))); return Object.assign({}, l, { jarak: j, ok: j <= Number(l.radius_m) + t, selisih: j - Number(l.radius_m) }); })
      .sort(function (a, b) { return a.selisih - b.selisih; });
  },
  /** Posisi perangkat; mode demo dapat disimulasikan di lokasi pertama */
  baca: async function (simulasi) {
    var l = this.lokasi()[0];
    if (simulasi && DEMO && l) return { lat: Number(l.latitude) + 0.00015, lng: Number(l.longitude) + 0.0001, acc: 12, sim: true };
    return getPosition(20000);
  },
  /** Render widget. opt: { onChange(st), simulasi:boolean, judul } → controller */
  widget: function (el, opt) {
    opt = opt || {};
    var st = { pos: null, err: '', list: [], best: null, simulasi: opt.simulasi != null ? opt.simulasi : DEMO };
    var self = this, info = this.info();
    el.innerHTML = '<div class="geo"><div class="radar" data-g="radar"><span class="pulse">' + ic('locate') + '</span><div class="grow"><b data-g="t">Membaca lokasi…</b><div class="small" data-g="s">Izinkan akses lokasi saat diminta browser.</div></div>' +
      '<div class="row gap4"><button class="btn btn-soft btn-sm" data-g="re" type="button">' + ic('refresh-cw') + '<span class="hide-m">Cek ulang</span></button><button class="btn btn-outline btn-sm" data-g="map" type="button">' + ic('map') + '<span class="hide-m">Peta</span></button></div></div>' +
      '<div class="geo-list" data-g="list"></div>' +
      (DEMO ? '<label class="chk small mt8"><input type="checkbox" data-g="sim"' + (st.simulasi ? ' checked' : '') + '> Mode demo: simulasikan saya berada di lokasi sekolah</label>' : '') +
      '<div data-g="dev"></div></div>';
    var q = function (k) { return el.querySelector('[data-g="' + k + '"]'); };
    function gambar() {
      var rad = q('radar'), pulse = rad.querySelector('.pulse'), b = st.best;
      if (st.err) { pulse.className = 'pulse bad'; pulse.innerHTML = ic('map-pin-off'); q('t').textContent = 'Lokasi tidak terbaca'; q('s').textContent = st.err; }
      else if (b) {
        pulse.className = 'pulse ' + (b.ok ? 'ok' : 'bad'); pulse.innerHTML = ic(b.ok ? 'map-pin-check' : 'map-pin-x');
        q('t').innerHTML = b.ok ? 'Anda berada di area <b>' + esc(b.nama) + '</b>' : '<span class="red">Anda berada di luar area absensi</span>';
        q('s').textContent = b.jarak + ' m dari ' + b.nama + ' (maks ' + b.radius_m + ' m)' + ' • akurasi ±' + st.pos.acc + ' m' + (st.pos.sim ? ' • simulasi' : '');
      }
      var lok = self.lokasi();
      q('list').innerHTML = lok.length ? '<div class="xs b muted mt12">LOKASI ABSENSI UNTUK AKUN ANDA' + (info.khusus ? ' <span class="bdg amber">khusus</span>' : '') + '</div><div class="row wrap gap8 mt8">' + (st.list.length ? st.list : lok).map(function (l) {
        return '<span class="geo-chip ' + (l.ok ? 'ok' : st.list.length ? 'out' : '') + '">' + ic(l.tipe === 'Kantor' ? 'building-2' : 'school') + '<b>' + esc(l.nama) + '</b>' + (l.jarak != null ? '<small>' + fmtJarak(l.jarak) + ' / ' + l.radius_m + ' m</small>' : '<small>radius ' + l.radius_m + ' m</small>') + '</span>';
      }).join('') + '</div>' : '<div class="note warn mt12">' + ic('triangle-alert') + '<div>Belum ada lokasi absensi untuk akun Anda. Hubungi Super Admin.</div></div>';
      gambarPerangkat();
      opt.onChange && opt.onChange(st);
    }
    function gambarPerangkat() {
      var box = q('dev'), inf = self.info(); if (!box) return;
      if (!inf.kunciPerangkat) { box.innerHTML = ''; return; }
      var p = inf.perangkat || {};
      box.innerHTML = '<div class="note ' + (p.cocok ? 'ok' : p.terdaftar ? 'bad' : 'warn') + ' mt12">' + ic(p.cocok ? 'smartphone' : 'smartphone-nfc') + '<div class="grow"><b>' + (p.cocok ? 'Perangkat ini terdaftar untuk absensi' : p.terdaftar ? 'Akun Anda terdaftar di perangkat lain' : 'Perangkat belum terdaftar') + '</b><div class="small">' +
        (p.cocok ? Device.info() : p.terdaftar ? 'Absensi hanya bisa dari perangkat terdaftar. Berganti HP? Minta Super Admin mereset perangkat.' : 'Daftarkan perangkat ini (atau absen pertama akan mendaftarkannya otomatis).') + '</div></div>' +
        (!p.terdaftar ? '<button class="btn btn-sm btn-primary" type="button" data-g="daftar">' + ic('smartphone') + 'Daftarkan</button>' : '') + '</div>';
      var bd = q('daftar'); if (bd) bd.onclick = async function () { btnBusy(bd, true); var r = await api('perangkat.daftar', { device_info: Device.info() }); btnBusy(bd, false); if (toastRes(r)) { Object.assign(akunInfo(), r.data); gambarPerangkat(); } };
    }
    async function cek() {
      var rad = q('radar'); if (!rad) return;
      rad.querySelector('.pulse').className = 'pulse'; q('t').textContent = 'Membaca lokasi…'; q('s').textContent = 'Mohon tunggu, akurasi terbaik di area terbuka.';
      try { st.pos = await self.baca(st.simulasi); st.err = ''; st.list = self.hitung(st.pos); st.best = st.list[0] || null; }
      catch (e) { st.pos = null; st.best = null; st.list = []; st.err = e.message; }
      gambar();
    }
    q('re').onclick = cek;
    q('map').onclick = function () { petaGeofence(self.lokasi(), st.pos); };
    if (q('sim')) q('sim').onchange = function () { st.simulasi = this.checked; cek(); };
    gambarPerangkat();
    cek();
    return { state: st, refresh: cek, ok: function () { return !!(st.best && st.best.ok); } };
  }
};
function fmtJarak(m) { return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : m + ' m'; }

/** Peta: lingkaran semua lokasi + posisi saya (Leaflet + OpenStreetMap) */
async function petaGeofence(lokasi, pos) {
  var m = modal({ title: 'Peta Lokasi Absensi', sub: 'Lingkaran = area yang diizinkan. Titik biru = posisi perangkat Anda.', size: 'lg', body: '<div class="map-box" id="gmap"><div class="sk" style="height:100%"></div></div><div class="small muted mt8" id="gmapNote"></div>', foot: '<button class="btn btn-primary" data-x>Tutup</button>' });
  try {
    var L = await loadLeaflet(), box = $('#gmap', m.el); box.innerHTML = '';
    var awal = (lokasi && lokasi[0]) ? [Number(lokasi[0].latitude), Number(lokasi[0].longitude)] : pos ? [pos.lat, pos.lng] : [-6.2, 106.8];
    var map = L.map(box, { zoomControl: true, attributionControl: true }).setView(awal, 16);   // view wajib ada sebelum lingkaran ditambahkan
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    var grup = [];
    (lokasi || []).forEach(function (l) {
      var c = L.circle([Number(l.latitude), Number(l.longitude)], { radius: Number(l.radius_m), color: '#1E3A5F', fillColor: '#1E3A5F', fillOpacity: 0.12, weight: 2 }).addTo(map).bindTooltip(l.nama + ' (' + l.radius_m + ' m)', { permanent: (lokasi || []).length <= 4, direction: 'top' });
      grup.push(c);
    });
    if (pos) {
      L.circle([pos.lat, pos.lng], { radius: Math.max(pos.acc || 10, 5), color: '#2563EB', fillOpacity: 0.15, weight: 1 }).addTo(map);
      grup.push(L.circleMarker([pos.lat, pos.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#2563EB', fillOpacity: 1 }).addTo(map).bindTooltip('Posisi saya'));
    }
    if (grup.length > 1) map.fitBounds(L.featureGroup(grup).getBounds().pad(0.25));
    setTimeout(function () { map.invalidateSize(); }, 120);
  } catch (e) {
    $('#gmap', m.el).innerHTML = '<div class="empty">' + ic('map-pin-off') + '<b>Peta tidak dapat dimuat</b><div>' + esc(e.message) + '</div></div>';
    $('#gmapNote', m.el).innerHTML = (lokasi || []).map(function (l) { return '<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + l.latitude + ',' + l.longitude + '">' + ic('map-pin') + esc(l.nama) + '</a>'; }).join(' · ');
  }
}

/** Pemilih lokasi (Super Admin): klik/geser penanda di peta, atur radius, tempel koordinat / link Google Maps */
function lokasiForm(row, onSaved) {
  row = row || {}; var isNew = !row.lokasi_id;
  var lat = Number(row.latitude || cfg('LAT_SEKOLAH', -6.2088)), lng = Number(row.longitude || cfg('LNG_SEKOLAH', 106.8456)), rad = Number(row.radius_m || 100);
  var m = modal({ title: isNew ? 'Tambah Lokasi Absensi' : 'Ubah Lokasi', sub: 'Klik peta atau geser penanda untuk menentukan titik. Lingkaran menunjukkan radius absensi.', size: 'lg',
    body: '<div class="grid-form"><div class="field c6"><label>Nama lokasi <span class="req">*</span></label><input class="inp" name="nama" value="' + esc(row.nama || '') + '" placeholder="Kampus Utama / Kantor Yayasan"></div>' +
      '<div class="field c3"><label>Tipe</label><select class="sel" name="tipe">' + ['Sekolah', 'Kampus', 'Kantor', 'Asrama', 'Lainnya'].map(function (t) { return '<option' + (row.tipe === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
      '<div class="field c3"><label>Berlaku untuk</label><select class="sel" name="berlaku">' + [['Semua', 'Guru & Siswa'], ['Siswa', 'Siswa saja'], ['Guru', 'Guru saja']].map(function (o) { return '<option value="' + o[0] + '"' + (row.berlaku === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><div class="map-box sm" id="lfMap"><div class="sk" style="height:100%"></div></div></div>' +
      '<div class="field c4"><label>Latitude</label><input class="inp mono" name="latitude" value="' + lat.toFixed(6) + '"></div><div class="field c4"><label>Longitude</label><input class="inp mono" name="longitude" value="' + lng.toFixed(6) + '"></div>' +
      '<div class="field c4"><label>Radius: <b id="lfRadV">' + rad + '</b> m</label><input type="range" min="10" max="1000" step="5" name="radius_m" value="' + rad + '" id="lfRad"></div>' +
      '<div class="field c8"><label>Tempel koordinat / link Google Maps</label><div class="row gap8"><input class="inp" id="lfPaste" placeholder="-6.2088, 106.8456 atau https://maps.google.com/…@-6.2,106.8"><button class="btn btn-outline" type="button" id="lfPasteBtn">Terapkan</button></div></div>' +
      '<div class="field c4"><label>&nbsp;</label><button class="btn btn-soft btn-block" type="button" id="lfHere">' + ic('locate-fixed') + 'Pakai lokasi saya</button></div>' +
      '<div class="field c8"><label>Alamat (opsional)</label><input class="inp" name="alamat" value="' + esc(row.alamat || '') + '"></div>' +
      '<div class="field c4"><label>Status</label><select class="sel" name="aktif"><option value="YA"' + (row.aktif !== 'TIDAK' ? ' selected' : '') + '>Aktif</option><option value="TIDAK"' + (row.aktif === 'TIDAK' ? ' selected' : '') + '>Nonaktif</option></select></div></div>',
    foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="lfSave">' + ic('save') + 'Simpan Lokasi</button>' });
  var f = function (n) { return m.el.querySelector('[name=' + n + ']'); }, map, mk, cc;
  function setTitik(a, b, pan) {
    lat = a; lng = b; f('latitude').value = a.toFixed(6); f('longitude').value = b.toFixed(6);
    if (mk) { mk.setLatLng([a, b]); cc.setLatLng([a, b]); if (pan) map.setView([a, b], Math.max(map.getZoom(), 17)); }
  }
  $('#lfRad', m.el).oninput = function () { rad = Number(this.value); $('#lfRadV', m.el).textContent = rad; if (cc) cc.setRadius(rad); };
  ['latitude', 'longitude'].forEach(function (n) { f(n).onchange = function () { var a = Number(f('latitude').value), b = Number(f('longitude').value); if (!isNaN(a) && !isNaN(b)) setTitik(a, b, true); }; });
  $('#lfPasteBtn', m.el).onclick = function () {
    var t = $('#lfPaste', m.el).value, x = t.match(/@?(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/) || t.match(/[?&]q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
    if (!x) return toast('Format tidak dikenali. Contoh: -6.2088, 106.8456', 'warn');
    setTitik(Number(x[1]), Number(x[2]), true); toast('Titik diperbarui.', 'ok');
  };
  $('#lfHere', m.el).onclick = async function () { btnBusy(this, true); try { var p = await getPosition(); setTitik(p.lat, p.lng, true); toast('Lokasi terbaca (akurasi ±' + p.acc + ' m).', 'ok'); } catch (e) { toast(e.message, 'bad'); } btnBusy(this, false); };
  loadLeaflet().then(function (L) {
    var box = $('#lfMap', m.el); if (!box) return; box.innerHTML = '';
    map = L.map(box).setView([lat, lng], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    cc = L.circle([lat, lng], { radius: rad, color: '#1E3A5F', fillOpacity: 0.15 }).addTo(map);
    mk = L.marker([lat, lng], { draggable: true }).addTo(map);
    mk.on('drag', function (e) { var p = e.target.getLatLng(); cc.setLatLng(p); f('latitude').value = p.lat.toFixed(6); f('longitude').value = p.lng.toFixed(6); });
    mk.on('dragend', function (e) { var p = e.target.getLatLng(); setTitik(p.lat, p.lng); });
    map.on('click', function (e) { setTitik(e.latlng.lat, e.latlng.lng); });
    setTimeout(function () { map.invalidateSize(); }, 150);
  }).catch(function (e) { var box = $('#lfMap', m.el); if (box) box.innerHTML = '<div class="empty">' + ic('map-pin-off') + '<b>Peta offline</b><div>Isi latitude/longitude manual atau tempel link Google Maps.</div></div>'; });
  $('#lfSave', m.el).onclick = async function () {
    var d = formData(m.el); d.lokasi_id = row.lokasi_id || '';
    btnBusy(this, true); var r = await api('lokasi.save', { row: d }); btnBusy(this, false);
    if (toastRes(r)) { m.close(); onSaved && onSaved(r.data); afterWrite(); }
  };
}

/** Kartu "Lokasi & Perangkat Absensi" di halaman akun */
function geoAkunCard(el, ak) {
  if (!el) return;
  ak = ak || akunInfo();
  var lok = ak.lokasi || [], p = ak.perangkat || {};
  el.innerHTML = '<div class="card card-p" style="box-shadow:none"><div class="row between wrap gap8"><b>' + ic('map-pinned') + ' Lokasi & Perangkat Absensi</b><button class="btn btn-soft btn-sm" type="button" data-gk="tes">' + ic('locate') + 'Cek lokasi saya</button></div>' +
    '<div class="row wrap gap8 mt12">' + (lok.length ? lok.map(function (l) { return '<span class="geo-chip">' + ic(l.tipe === 'Kantor' ? 'building-2' : 'school') + '<b>' + esc(l.nama) + '</b><small>radius ' + l.radius_m + ' m</small></span>'; }).join('') : '<span class="small muted">Belum ada lokasi.</span>') + '</div>' +
    (ak.khusus ? '<div class="xs muted mt8">Super Admin menetapkan lokasi khusus untuk akun Anda.</div>' : '') +
    '<div class="small mt12">' + ic('smartphone') + ' ' + (!ak.kunciPerangkat ? 'Kunci perangkat tidak aktif — absensi dari perangkat mana pun.' : p.cocok ? '<b class="ok-t">Perangkat ini terdaftar</b> (' + esc(Device.info()) + ')' : p.terdaftar ? '<b class="red">Terdaftar di perangkat lain</b> — minta Super Admin mereset.' : '<b class="amber">Belum terdaftar</b>') +
    (ak.kunciPerangkat && !p.terdaftar ? ' <button class="btn btn-primary btn-sm" type="button" data-gk="daftar">Daftarkan perangkat ini</button>' : '') + '</div></div>';
  el.querySelector('[data-gk="tes"]').onclick = function () {
    var m = modal({ title: 'Cek Lokasi Saya', sub: 'Pastikan Anda berada di dalam salah satu lingkaran sebelum absen.', size: 'md', body: '<div id="gkW"></div>', foot: '<button class="btn btn-primary" data-x>Selesai</button>' });
    Geo.widget($('#gkW', m.el), {});
  };
  var bd = el.querySelector('[data-gk="daftar"]'); if (bd) bd.onclick = async function () { btnBusy(bd, true); var r = await api('perangkat.daftar', { device_info: Device.info() }); btnBusy(bd, false); if (toastRes(r)) { Object.assign(akunInfo(), r.data); geoAkunCard(el, akunInfo()); } };
}

/** Ambil foto selfie sederhana → dataURL (dipakai presensi guru bila diwajibkan) */
function ambilSelfie(judul) {
  return new Promise(function (res) {
    var stream = null, foto = null;
    var m = modal({ title: judul || 'Foto Selfie', size: 'sm', body: '<div class="cam-selfie" id="sfCam"><div class="ph0">' + ic('camera') + '<div class="small mt8">Mengaktifkan kamera depan…</div></div></div>', onClose: function (v) { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); res(v || null); },
      foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-accent" id="sfShot">' + ic('aperture') + 'Ambil Foto</button><button class="btn btn-primary" id="sfOk" hidden>Gunakan</button>' });
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false }).then(function (s) {
      stream = s; var box = $('#sfCam', m.el); box.innerHTML = '<video autoplay playsinline muted></video><div class="oval"></div>'; var v = $('video', box); v.srcObject = s; v.play();
    }).catch(function () { $('#sfCam', m.el).innerHTML = '<div class="ph0">' + ic('camera-off') + '<div class="small mt8">Kamera tidak tersedia / izin ditolak.</div></div>'; });
    $('#sfShot', m.el).onclick = function () {
      var v = $('#sfCam video', m.el); if (!v) return toast('Kamera belum aktif.', 'warn');
      var c = document.createElement('canvas'), w = v.videoWidth, hh = v.videoHeight, sc = Math.min(1, 640 / w); c.width = Math.round(w * sc); c.height = Math.round(hh * sc);
      var x = c.getContext('2d'); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(v, 0, 0, c.width, c.height); x.setTransform(1, 0, 0, 1, 0, 0);
      x.fillStyle = 'rgba(15,33,56,.7)'; x.fillRect(0, c.height - 26, c.width, 26); x.fillStyle = '#fff'; x.font = '12px sans-serif'; x.fillText(AppState.nama + ' • ' + todayStr() + ' ' + nowHM(), 8, c.height - 9);
      foto = c.toDataURL('image/jpeg', 0.72); $('#sfCam', m.el).innerHTML = '<img src="' + foto + '" alt="Selfie">'; this.hidden = true; $('#sfOk', m.el).hidden = false;
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    };
    $('#sfOk', m.el).onclick = function () { m.close(foto); };
  });
}

// =====================================================================
// PRESENSI SAYA (guru & Super Admin yang terhubung data guru)
// =====================================================================
registerPage('guru', 'presensi', {
  title: 'Presensi Saya', gurux: true,
  render: function (el) {
    var self = this, ak = akunInfo(), hi = ak.presensiHariIni, c = (AppState.boot || {}).cfg || {};
    var masuk = hi && hi.jam_masuk, pulang = hi && hi.jam_pulang;
    el.innerHTML = pageHead((isSA() ? 'Super Admin' : 'Panel Guru') + ' <span>/ Presensi Saya</span>', 'Presensi Saya', 'Presensi masuk & pulang berbasis lokasi GPS perangkat. Jam masuk ' + esc(c.JAM_MASUK_GURU || '07:00') + ' • jam pulang ' + esc(c.JAM_PULANG_GURU || '15:00') + ' WIB.') +
      '<div class="grid g-main-r"><div class="card"><div class="card-h"><div class="grow"><h3>Presensi Hari Ini</h3><p>' + esc(tglHari(todayStr())) + '</p></div>' + (pulang ? '<span class="bdg ok">' + ic('circle-check') + 'Lengkap</span>' : masuk ? '<span class="bdg info">Sudah masuk</span>' : '<span class="bdg warn">Belum presensi</span>') + '</div><div class="card-b">' +
      '<div class="grid g2" style="gap:10px"><div class="list-i"><span class="ic">' + ic('log-in') + '</span><div class="grow"><small>Masuk</small><b style="font-size:22px">' + (masuk ? esc(jam5(masuk)) : '--:--') + '</b>' + (hi && hi.terlambat === 'YA' ? '<span class="bdg warn">Terlambat</span>' : '') + '</div></div><div class="list-i"><span class="ic">' + ic('log-out') + '</span><div class="grow"><small>Pulang</small><b style="font-size:22px">' + (pulang ? esc(jam5(pulang)) : '--:--') + '</b></div></div></div>' +
      '<div id="prGeo" class="mt16"></div>' +
      (pulang ? '<div class="note ok mt16">' + ic('circle-check') + '<div>Presensi hari ini sudah lengkap. Terima kasih!</div></div>' : '<button class="btn btn-dark btn-lg btn-block mt16" id="prGo" disabled>' + ic('fingerprint') + (masuk ? 'PRESENSI PULANG' : 'PRESENSI MASUK') + '</button><div class="xs muted tc mt8" id="prHint"></div>') +
      '</div></div><div class="card"><div class="card-h"><div class="grow"><h3>Ringkasan Bulan Ini</h3><p>' + esc(BULAN[Number(todayStr().slice(5, 7)) - 1] + ' ' + todayStr().slice(0, 4)) + '</p></div></div><div class="card-b" id="prSum"><div class="sk" style="height:120px"></div></div></div></div>' +
      '<div class="card mt24"><div class="card-h"><div class="grow"><h3>Riwayat Presensi</h3><p>60 hari terakhir</p></div></div><div class="card-b" style="padding:12px 0 0" id="prHist"><div class="sk" style="height:180px"></div></div></div>';
    if (!pulang) {
      this.geo = Geo.widget($('#prGeo', el), { onChange: function (st) {
        var b = $('#prGo', el); if (!b) return;
        b.disabled = !(st.best && st.best.ok);
        $('#prHint', el).textContent = !st.pos ? 'Aktifkan lokasi terlebih dahulu.' : st.best && st.best.ok ? 'Siap — presensi akan tercatat di ' + st.best.nama + '.' : 'Tombol aktif bila Anda berada di dalam salah satu area.';
      } });
      $('#prGo', el).onclick = function () { self.kirim(el, this, masuk ? 'pulang' : 'masuk'); };
    }
    swr('a:presensi.saya', 'presensi.saya', {}, function (d) { self.riwayat(el, d); }, { fresh: 30000, onError: function (r) { $('#prHist', el).innerHTML = errorBox(r.message); } });
  },
  riwayat: function (el, d) {
    var r = d.ringkas || {};
    $('#prSum', el).innerHTML = '<div class="grid g3" style="gap:10px">' + [['Hadir', r.hadir, 'navy'], ['Terlambat', r.terlambat, 'amber'], ['Pulang awal', r.pulangAwal, 'red']].map(function (x) { return '<div class="list-i"><div class="grow"><small>' + x[0] + '</small><b class="' + x[2] + '" style="font-size:24px">' + (x[1] || 0) + '</b></div></div>'; }).join('') + '</div>' +
      '<div class="note mt16">' + ic('info') + '<div>' + (d.selfie ? 'Presensi masuk wajib foto selfie. ' : '') + 'Pulang sebelum ' + esc(d.jamPulang) + ' wajib menyertakan alasan.</div></div>';
    var rows = d.rows || [];
    $('#prHist', el).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>Masuk</th><th>Pulang</th><th class="hide-m">Jarak</th><th>Keterangan</th></tr></thead><tbody>' + rows.map(function (p) { return '<tr><td>' + esc(hariDari(p.tanggal).slice(0, 3)) + ', ' + esc(tglIndo(p.tanggal, true)) + '</td><td class="mono">' + esc(jam5(p.jam_masuk)) + (p.terlambat === 'YA' ? ' <span class="bdg warn">Terlambat</span>' : '') + '</td><td class="mono">' + esc(jam5(p.jam_pulang) || '-') + '</td><td class="hide-m small">' + (p.jarak_m !== '' ? p.jarak_m + ' m' : '-') + '</td><td class="small muted">' + esc(p.keterangan || '-') + '</td></tr>'; }).join('') + '</tbody></table></div>' : emptyHtml('Belum ada riwayat presensi', '', 'calendar');
  },
  kirim: async function (el, btn, jenis) {
    var st = this.geo && this.geo.state, c = (AppState.boot || {}).cfg || {};
    if (!st || !st.pos) return toast('Lokasi belum terbaca.', 'warn');
    var data = { jenis: jenis, lat: st.pos.lat, lng: st.pos.lng, acc: st.pos.acc, device_info: Device.info() };
    if (jenis === 'masuk' && c.PRESENSI_GURU_SELFIE === 'YA') { data.foto = await ambilSelfie('Selfie Presensi Masuk'); if (!data.foto) return; }
    if (jenis === 'pulang' && nowHM() < (c.JAM_PULANG_GURU || '15:00')) { data.keterangan = await promptBox('Pulang Lebih Awal', 'Alasan pulang sebelum ' + (c.JAM_PULANG_GURU || '15:00') + ':', ''); if (!data.keterangan) return; }
    btnBusy(btn, true);
    var r = await api('presensi.guru', data);
    btnBusy(btn, false);
    if (!toastRes(r)) return;
    akunInfo().presensiHariIni = r.data.row;
    Store.del(userKey('a:presensi.saya'));
    this.render(el);
    afterWrite();
  }
});
