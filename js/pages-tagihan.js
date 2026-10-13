/* =====================================================================
   SIAKAD SISWA v2.1 — pages-tagihan.js  (gas-tagihan-pembayaran)
   • tagihan-ui: bukaBuktiPopup · pemilihBulan · unduhExcelTautan · cetakKwitansi
   • Admin/bendahara: Daftar, Verifikasi per bukti, Penerbitan (bulanan/sekali/batal),
     Jenis Biaya & Potongan, Pengingat & Pengaturan keuangan
   • Siswa: Tagihan Saya — bayar banyak tagihan dengan 1 bukti, unduh kwitansi
   Pustaka CDN (lazy): SheetJS 0.18.5, jsPDF 2.5.1, qrcode-generator 1.4.4
   ===================================================================== */
'use strict';
var TG_BULAN_UI = BULAN;
function tgPeriodeLabel(p) { var x = String(p || '').split('-'); return x.length < 2 ? String(p || '') : TG_BULAN_UI[+x[1] - 1] + ' ' + x[0]; }
function rupiahTg(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
function tgStatusBadge(s) { var c = { 'Lunas': 'ok', 'Gratis': 'info', 'Belum Bayar': 'warn', 'Terlambat': 'bad', 'Menunggu Verifikasi': 'amber', 'Terverifikasi': 'ok', 'Menunggu': 'amber', 'Ditolak': 'bad' }[s] || ''; return '<span class="bdg dot ' + c + '">' + esc(s) + '</span>'; }
var TG_BELUM_UI = { 'Belum Bayar': 1, 'Terlambat': 1 };

/* ---- 1. POPUP BUKTI TRANSFER — tidak pernah membuka tab baru; dipasang di <body> ----
 * o: { id (Drive file ID) | url | src, judul, sub, fetchSrc: async () => dataURL (cadangan / mode demo) } */
function bukaBuktiPopup(o) {
  var m = String(o.url || '').match(/\/d\/([\w-]+)|[?&]id=([\w-]+)/), id = o.id || (m ? m[1] || m[2] : '');
  var lama = document.querySelector('.tgb-overlay'); if (lama) lama.remove();
  var ov = document.createElement('div'); ov.className = 'tgb-overlay';
  ov.innerHTML = '<div class="tgb-pop" role="dialog" aria-modal="true"><div class="tgb-head"><div class="tgb-t"><b></b><small></small></div>' +
    '<div class="tgb-tools"><button type="button" data-a="putar">⟳ Putar</button><button type="button" data-a="zoom">🔍 Perbesar</button>' +
    '<button type="button" data-a="mode">📄 Mode dokumen</button><button type="button" data-a="tutup" aria-label="Tutup">✕</button></div></div>' +
    '<div class="tgb-body"><div class="tgb-muat">Memuat bukti transfer…</div></div><div class="tgb-foot">Esc / klik di luar untuk menutup</div></div>';
  ov.querySelector('.tgb-t b').textContent = '🧾 ' + (o.judul || 'Bukti Transfer');
  ov.querySelector('.tgb-t small').textContent = o.sub || '';
  var body = ov.querySelector('.tgb-body'), putar = 0, zoom = false, mode = 'gambar', src = o.src || '', coba = !!o.src;
  function tutup() { document.removeEventListener('keydown', esc_, true); ov.remove(); }
  function esc_(e) { if (e.key === 'Escape') { e.stopPropagation(); tutup(); } }
  async function cadangan() { if (coba || !o.fetchSrc) return false; coba = true; try { src = await o.fetchSrc(); return !!src; } catch (e) { return false; } }
  async function tampil() {
    body.className = 'tgb-body' + (zoom ? ' zoom' : '') + (mode === 'dokumen' ? ' dok' : '');
    ov.querySelectorAll('[data-a=putar],[data-a=zoom]').forEach(function (b) { b.style.display = mode === 'gambar' ? '' : 'none'; });
    ov.querySelector('[data-a=mode]').textContent = mode === 'gambar' ? '📄 Mode dokumen' : '🖼 Mode gambar';
    ov.querySelector('[data-a=zoom]').textContent = zoom ? '⤡ Pas layar' : '🔍 Perbesar';
    if (!id && !src && !(await cadangan())) { body.innerHTML = '<div class="tgb-muat">Bukti tidak tersedia.</div>'; return; }
    if (mode === 'dokumen') { body.innerHTML = ''; var f = document.createElement('iframe'); f.src = src && /^data:application\/pdf/.test(src) ? src : id ? 'https://drive.google.com/file/d/' + id + '/preview' : src; f.title = 'Pratinjau bukti'; body.appendChild(f); return; }
    var img = body.querySelector('img');
    if (!img) {
      body.innerHTML = '<div class="tgb-muat">Memuat bukti transfer…</div>';
      img = new Image(); img.alt = 'Bukti transfer'; img.referrerPolicy = 'no-referrer'; img.style.display = 'none';
      img.onload = function () { var mm = body.querySelector('.tgb-muat'); if (mm) mm.remove(); img.style.display = ''; };
      img.onerror = async function () { if (await cadangan()) { img.src = src; return; } mode = 'dokumen'; tampil(); };
      img.onclick = function () { zoom = !zoom; tampil(); };
      if (/^data:application\/pdf/.test(src)) { mode = 'dokumen'; return tampil(); }
      img.src = src || 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600';
      body.appendChild(img);
    }
    img.style.transform = 'rotate(' + putar + 'deg)';
  }
  ov.addEventListener('click', function (e) {
    if (e.target === ov) return tutup();
    var a = e.target.getAttribute && e.target.getAttribute('data-a');
    if (a === 'tutup') tutup();
    if (a === 'putar') { putar = (putar + 90) % 360; tampil(); }
    if (a === 'zoom') { zoom = !zoom; tampil(); }
    if (a === 'mode') { mode = mode === 'gambar' ? 'dokumen' : 'gambar'; zoom = false; body.innerHTML = ''; tampil(); }
  });
  document.addEventListener('keydown', esc_, true);
  document.body.appendChild(ov);
  if (DEMO && o.fetchSrc && !src) cadangan().then(tampil); else tampil();
  return tutup;
}
function buktiDari(p, sub) { return { id: DEMO ? '' : p.BuktiID, judul: 'Bukti ' + (p.Nama || ''), sub: sub || '', fetchSrc: function () { return api('billing.bukti', { pembayaranId: p.PembayaranID }).then(function (r) { if (!r.success) throw new Error(r.message); return r.data; }); } }; }

/* ---- 2. PEMILIH BULAN — centang bulan apa saja, lintas tahun ---- */
function pemilihBulan(el, opsi) {
  opsi = opsi || {};
  var kini = new Date(), tahun = kini.getFullYear(), dipilih = (opsi.awal || []).slice();
  var kode = function (th, b) { return th + '-' + ('0' + b).slice(-2); };
  function berurutan(n) { var out = []; for (var i = 0; i < n; i++) { var x = new Date(kini.getFullYear(), kini.getMonth() + i, 1); out.push(kode(x.getFullYear(), x.getMonth() + 1)); } return out; }
  function ubah(list) { dipilih = list.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(); gambar(); if (opsi.onChange) opsi.onChange(dipilih.slice()); }
  function gambar() {
    var hh = '<div class="tgm-bar"><span class="tgm-th"><button type="button" data-th="-1" title="Tahun sebelumnya">‹</button><b>' + tahun + '</b><button type="button" data-th="1" title="Tahun berikutnya">›</button></span>' +
      '<button type="button" data-n="1">Bulan ini</button><button type="button" data-n="5">5 bulan ke depan</button><button type="button" data-n="6">6 bulan</button><button type="button" data-n="0">Kosongkan</button></div><div class="tgm-grid">';
    for (var b = 1; b <= 12; b++) { var k = kode(tahun, b), on = dipilih.indexOf(k) > -1; hh += '<button type="button" class="tgm-chip' + (on ? ' on' : '') + '" data-k="' + k + '" aria-pressed="' + on + '">' + (on ? '✓ ' : '') + TG_BULAN_UI[b - 1] + '</button>'; }
    el.innerHTML = hh + '</div><p class="tgm-ket">' + (dipilih.length ? '<b>' + dipilih.length + ' bulan dipilih:</b> ' + dipilih.map(tgPeriodeLabel).join(', ') : 'Belum ada bulan dipilih.') + '</p>';
  }
  el.onclick = function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.dataset.th) { tahun += +t.dataset.th; gambar(); return; }
    if (t.dataset.n !== undefined) { ubah(+t.dataset.n ? berurutan(+t.dataset.n) : []); return; }
    if (t.dataset.k) { var i = dipilih.indexOf(t.dataset.k); ubah(i > -1 ? dipilih.filter(function (x) { return x !== t.dataset.k; }) : dipilih.concat([t.dataset.k])); }
  };
  gambar();
  return { ambil: function () { return dipilih.slice(); }, set: function (l) { ubah(l || []); } };
}

/* ---- 3. EKSPOR EXCEL DENGAN LINK BUKTI YANG BISA DIKLIK ---- */
async function unduhExcelTautan(rows, namaFile, namaSheet, kolomLink) {
  if (!rows || !rows.length) throw new Error('Tidak ada data untuk diekspor.');
  await loadLib('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  if (!window.XLSX) throw new Error('Pustaka Excel gagal dimuat.');
  var ws = XLSX.utils.json_to_sheet(rows), kolom = Object.keys(rows[0]), c = kolom.indexOf(kolomLink), n = 0;
  if (c > -1) rows.forEach(function (r, i) { var ref = XLSX.utils.encode_cell({ r: i + 1, c: c }); if (r[kolomLink] && ws[ref]) { ws[ref].l = { Target: String(r[kolomLink]), Tooltip: 'Buka bukti transfer' }; n++; } });
  ws['!cols'] = kolom.map(function (k) { return { wch: k === kolomLink ? 58 : Math.min(30, Math.max(10, k.length + 3)) }; });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(namaSheet || 'Data').substring(0, 30));
  XLSX.writeFile(wb, (namaFile || 'ekspor') + '.xlsx');
  return n;
}

/* ---- 4. KWITANSI PDF (di browser, dari billing.receipt) — font jsPDF Latin-1: hindari ·, –, emoji ---- */
async function cetakKwitansi(d) {
  await loadLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await loadLib('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js');
  if (!window.jspdf || !window.qrcode) throw new Error('Pustaka PDF gagal dimuat.');
  var banyak = d.item.length > 7;
  var doc = new jspdf.jsPDF({ unit: 'mm', format: banyak ? 'a4' : 'a5', orientation: banyak ? 'portrait' : 'landscape' });
  var W = 210, H = banyak ? 297 : 148, y = 16;
  doc.setFillColor(30, 58, 95); doc.rect(0, 0, W, 8, 'F'); doc.setFillColor(245, 166, 35); doc.rect(0, 8, W, 1.2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(30, 58, 95); doc.text('KWITANSI PEMBAYARAN', 12, y);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(90);
  doc.text(String(d.institusi || ''), 12, y + 5); if (d.alamat) doc.text(String(d.alamat), 12, y + 9);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(0); doc.text('No. ' + d.noKwitansi, W - 12, y, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.text('Tanggal: ' + d.tanggal, W - 12, y + 5, { align: 'right' });
  y += 17; doc.setDrawColor(220); doc.line(12, y, W - 12, y); y += 7;
  var baris = function (k, v) { doc.setTextColor(110); doc.text(k, 12, y); doc.setTextColor(0); doc.text(String(v || '-'), 52, y); y += 6; };
  baris('Telah terima dari', d.nama + (d.nomor ? '  (' + d.nomor + ')' : ''));
  baris('Metode / Ref.', (d.metode || '-') + (d.noReferensi ? ' / ' + d.noReferensi : '') + ' / dibayar ' + d.tanggalBayar);
  y += 2; doc.setFillColor(242, 245, 249); doc.rect(12, y - 4, W - 24, 6, 'F'); doc.setFont('helvetica', 'bold');
  doc.text('Untuk pembayaran', 14, y); doc.text('Jumlah', W - 14, y, { align: 'right' }); doc.setFont('helvetica', 'normal'); y += 6;
  d.item.forEach(function (it) { doc.text(String(it.NamaTagihan), 14, y); doc.text(rupiahTg(it.Jumlah), W - 14, y, { align: 'right' }); y += 5.5; });
  doc.line(12, y - 2, W - 12, y - 2); y += 3; doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('TOTAL', 14, y); doc.text(rupiahTg(d.total), W - 14, y, { align: 'right' }); y += 6;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.text('Terbilang: ' + d.terbilang, 14, y, { maxWidth: W - 70 });
  var qr = qrcode(0, 'M'); qr.addData(d.urlVerifikasi || d.noKwitansi); qr.make();
  var qy = Math.max(y + 8, H - 40);
  doc.addImage(qr.createDataURL(4, 0), 'GIF', 14, qy, 28, 28);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110);
  doc.text(['Pindai untuk cek keaslian', 'Kode: ' + d.kodeVerifikasi], 45, qy + 10);
  doc.setFontSize(9); doc.setTextColor(0); doc.text('Diverifikasi oleh,', W - 55, qy + 4); doc.setFont('helvetica', 'bold');
  doc.text(String(d.diverifikasiOleh || 'Bendahara'), W - 55, qy + 24);
  doc.save('Kwitansi_' + String(d.noKwitansi).replace(/[^\w-]/g, '_') + '.pdf');
}
async function unduhKwitansi(pembayaranId, btn) {
  btnBusy(btn, true);
  var r = await api('billing.receipt', { pembayaranId: pembayaranId });
  if (!r.success) { btnBusy(btn, false); return toast(r.message, 'bad'); }
  try { await cetakKwitansi(r.data); toast('Kwitansi ' + r.data.noKwitansi + ' diunduh.', 'ok'); }
  catch (e) { kwitansiHtml(r.data); }
  btnBusy(btn, false);
}
/** Cadangan bila pustaka PDF tidak bisa dimuat (offline): tampilkan kwitansi HTML siap cetak */
function kwitansiHtml(d) {
  modal({ title: 'Kwitansi ' + d.noKwitansi, sub: 'Pustaka PDF tidak termuat — gunakan Cetak / Simpan PDF dari browser.', size: 'md',
    body: '<div class="kw-print"><div class="row between"><div><b style="font-size:17px;color:var(--navy)">KWITANSI PEMBAYARAN</b><div class="small muted">' + esc(d.institusi) + '</div></div><div class="tr small"><b>No. ' + esc(d.noKwitansi) + '</b><div>' + esc(d.tanggal) + '</div></div></div>' +
      '<dl class="kv-list mt16"><dt>Telah terima dari</dt><dd>' + esc(d.nama) + ' (' + esc(d.nomor) + ')</dd><dt>Metode</dt><dd>' + esc(d.metode) + (d.noReferensi ? ' / ' + esc(d.noReferensi) : '') + '</dd></dl>' +
      '<table class="tbl mt12"><tbody>' + d.item.map(function (it) { return '<tr><td>' + esc(it.NamaTagihan) + '</td><td class="tr">' + rupiahTg(it.Jumlah) + '</td></tr>'; }).join('') + '<tr><td><b>TOTAL</b></td><td class="tr"><b>' + rupiahTg(d.total) + '</b></td></tr></tbody></table><p class="small"><i>Terbilang: ' + esc(d.terbilang) + '</i></p>' +
      '<div class="small muted">Verifikasi keaslian: ' + esc(d.urlVerifikasi) + '</div></div>',
    foot: '<button class="btn btn-primary" onclick="window.print()">' + ic('printer') + 'Cetak</button>' });
}
/** Kelompokkan antrean verifikasi per bukti (1 transfer = 1 baris) */
function kelompokPerBukti(pending) {
  var peta = {}, urut = [];
  pending.forEach(function (b) {
    var k = b.GrupBayar || b.PembayaranID;
    if (!peta[k]) { peta[k] = Object.assign({}, b, { anggota: [], Jumlah: 0, NominalTagihan: 0 }); urut.push(k); }
    peta[k].anggota.push(b); peta[k].Jumlah += Number(b.Jumlah) || 0; peta[k].NominalTagihan += Number(b.NominalTagihan) || 0;
  });
  return urut.map(function (k) { var g = peta[k]; g.PembayaranID = g.anggota[0].PembayaranID; return g; });
}
/** Riwayat pembayaran seorang siswa (dari Data Siswa, untuk bendahara) */
async function riwayatBayarModal(nis) {
  var s = siswaByNIS(nis) || { nama_lengkap: nis };
  var m = modal({ title: 'Riwayat Pembayaran', sub: s.nama_lengkap + ' • NIS ' + nis, size: 'lg', body: '<div class="sk" style="height:200px"></div>' });
  var r = await api('billing.history', { NIS: nis });
  if (!r.success) { m.body.innerHTML = errorBox(r.message); return; }
  var d = r.data, rg = d.ringkasan;
  m.body.innerHTML = '<div class="grid g4" style="gap:10px">' + [['Lunas', rg.lunas, rg.nLunas + ' tagihan', 'ok-t'], ['Menunggu', rg.menunggu, rg.nMenunggu + ' tagihan', 'amber'], ['Tunggakan', rg.tunggakan, rg.nBelum + ' tagihan', 'red'], ['Potongan', rg.potongan, rg.nGratis + ' gratis', '']].map(function (x) { return '<div class="list-i"><div class="grow"><small>' + x[0] + '</small><b class="' + x[3] + '">' + rupiahTg(x[1]) + '</b><small>' + x[2] + '</small></div></div>'; }).join('') + '</div>' +
    '<div class="row wrap gap4 mt16">' + d.tagihan.map(function (t) { return '<span class="geo-chip" title="' + esc(t.Status) + '"><b>' + esc(t.NamaTagihan) + '</b>' + tgStatusBadge(t.Status) + '</span>'; }).join('') + '</div>' +
    '<div class="tbl-wrap mt16"><table class="tbl"><thead><tr><th>Tanggal</th><th>Untuk</th><th class="tr">Nominal</th><th>Metode</th><th>Status</th><th class="tr">Bukti / Kwitansi</th></tr></thead><tbody>' +
    (d.transaksi.length ? d.transaksi.map(function (t) { return '<tr><td class="nowrap">' + esc(tglIndo(t.TanggalBayar, true)) + '</td><td class="small">' + t.item.map(function (i) { return esc(i.NamaTagihan); }).join(', ') + '</td><td class="tr nowrap">' + rupiahTg(t.Jumlah) + '</td><td class="small">' + esc(t.Metode) + (t.NoReferensi ? '<div class="xs muted">' + esc(t.NoReferensi) + '</div>' : '') + '</td><td>' + tgStatusBadge(t.Status) + (t.Status === 'Ditolak' && t.Catatan ? '<div class="xs red">' + esc(t.Catatan) + '</div>' : '') + '</td><td class="tr nowrap">' + (t.BuktiID ? '<button class="btn-ic" data-bk="' + esc(t.PembayaranID) + '" title="Lihat bukti">' + ic('image') + '</button>' : '') + (t.NoKwitansi ? '<button class="btn btn-soft btn-sm" data-kw="' + esc(t.PembayaranID) + '">' + ic('download') + esc(t.NoKwitansi) + '</button>' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="6">' + emptyHtml('Belum ada pembayaran', '', 'receipt') + '</td></tr>') + '</tbody></table></div>';
  m.body.onclick = function (e) {
    var k = e.target.closest('[data-kw]'); if (k) return unduhKwitansi(k.dataset.kw, k);
    var b = e.target.closest('[data-bk]'); if (b) { var t = d.transaksi.filter(function (x) { return x.PembayaranID === b.dataset.bk; })[0]; bukaBuktiPopup(buktiDari(Object.assign({ Nama: s.nama_lengkap }, t), tglIndo(t.TanggalBayar) + ' • ' + rupiahTg(t.Jumlah))); }
  };
}

// =====================================================================
// ADMIN / BENDAHARA — TAGIHAN & PEMBAYARAN
// =====================================================================
registerPage('guru', 'tagihan', {
  title: 'Tagihan & Pembayaran', keu: true,
  st: { tab: 'daftar', f: { cari: '', kelas_id: '', biayaKode: '', status: '', periode: '' }, page: 1, sel: {}, list: null, pending: null, biaya: null, terbit: { mode: 'Bulanan', biaya: '', periode: [], kelas: [], rows: null, pilih: {} } },
  init: function (el) {
    var self = this, st = this.st;
    el.innerHTML = pageHead('Keuangan <span>/ Tagihan & Pembayaran</span>', 'Tagihan & Pembayaran', 'Terbitkan tagihan bulanan & sekali bayar dengan jenis biaya custom, verifikasi bukti transfer (1 bukti untuk banyak tagihan), kwitansi ber-QR, dan pengingat jatuh tempo.',
      '<button class="btn btn-outline" id="tgExp">' + ic('file-spreadsheet') + 'Ekspor Rekap Excel</button><button class="btn btn-dark" id="tgNew">' + ic('file-plus-2') + 'Terbitkan Tagihan</button>') +
      '<div class="grid g4" id="tgKpi">' + '<div class="sk" style="height:140px"></div>'.repeat(4) + '</div>' +
      '<div class="tabs mt24" id="tgTabs"><button data-t="daftar">' + ic('list') + 'Daftar Tagihan</button><button data-t="verifikasi">' + ic('badge-check') + 'Verifikasi <span class="bdg amber" id="tgPendN" hidden>0</span></button><button data-t="terbit">' + ic('file-plus-2') + 'Penerbitan</button><button data-t="biaya">' + ic('tags') + 'Jenis Biaya & Potongan</button><button data-t="pengingat">' + ic('bell-ring') + 'Pengingat & Pengaturan</button></div>' +
      '<div id="tgBody" class="mt16"></div>';
    $$('#tgTabs button', el).forEach(function (b) { b.onclick = function () { st.tab = b.dataset.t; self.draw(el); }; });
    $('#tgNew', el).onclick = function () { st.tab = 'terbit'; self.draw(el); };
    $('#tgExp', el).onclick = function () { self.ekspor(this); };
    this.timer = setInterval(function () { if (!el.hidden && Activity.due('tgpend', 45000, 180000)) self.loadPending(el, true); }, 5000);
    // listener tab Daftar dipasang SEKALI (delegasi) — tidak menumpuk saat berpindah tab
    var body = $('#tgBody', el), diDaftar = function () { return st.tab === 'daftar'; };
    body.addEventListener('input', debounce(function (e) { if (!diDaftar()) return; var k = e.target.dataset && e.target.dataset.f; if (k) { st.f[k] = e.target.value; st.page = 1; self.tabel(el); } }, 200));
    body.addEventListener('change', function (e) {
      if (!diDaftar()) return;
      var k = e.target.dataset && e.target.dataset.f; if (k && e.target.tagName === 'SELECT') { st.f[k] = e.target.value; st.page = 1; self.tabel(el); }
      if (e.target.matches('[data-ck]')) { if (e.target.checked) st.sel[e.target.dataset.ck] = 1; else delete st.sel[e.target.dataset.ck]; }
      if (e.target.matches('#tgAll')) { self.pageRows.forEach(function (t) { if (e.target.checked) st.sel[t.TagihanID] = 1; else delete st.sel[t.TagihanID]; }); self.tabel(el); }
    });
    body.addEventListener('click', function (e) {
      if (!diDaftar()) return;
      var p = e.target.closest('[data-pg]'); if (p && !p.disabled) { st.page = Number(p.dataset.pg); self.tabel(el); return; }
      var a = e.target.closest('[data-op]'); if (a) self.opTagihan(el, a.dataset.op, a.dataset.id, a);
    });
  },
  render: function (el, param) { if (param) this.st.tab = param; this.loadList(el); this.loadPending(el); this.draw(el); },
  loadList: function (el, force) {
    var self = this;
    return swr('a:billing.list', 'billing.list', force ? { _fresh: true } : {}, function (d) { self.st.list = d; self.kpi(el); if (self.st.tab === 'daftar') self.daftar(el); }, { fresh: 30000, force: force });
  },
  loadPending: function (el, force) {
    var self = this;
    return swr('a:billing.pending', 'billing.pending', force ? { _fresh: true } : {}, function (d) { self.st.pending = d; var n = kelompokPerBukti(d).length, b = $('#tgPendN', el); if (b) { b.hidden = !n; b.textContent = n; } if (self.st.tab === 'verifikasi') self.verifikasi(el); }, { fresh: 20000, force: force, silent: force && !!this.st.pending });
  },
  refresh: function (el) { Store.del(userKey('a:billing.list')); Store.del(userKey('a:billing.pending')); this.loadList(el, true); this.loadPending(el, true); },
  kpi: function (el) {
    var r = (this.st.list || {}).ringkasan; if (!r) return;
    var uang = function (n, cls) { return '<span class="kv-money ' + (cls || '') + '">' + rupiahTg(n) + '</span>'; };
    $('#tgKpi', el).innerHTML = kpi('Total Tagihan', uang(r.totalTagihan), (r.jumlahLunas + r.jumlahBelum + r.jumlahGratis) + ' tagihan • potongan ' + rupiahTg(r.totalPotongan), 'receipt') +
      kpi('Terkumpul (Lunas)', uang(r.terkumpul), '<div class="bar"><i style="width:' + pct(r.terkumpul, r.totalTagihan || 1) + '%"></i></div><div class="mt8">' + r.jumlahLunas + ' tagihan lunas</div>', 'wallet') +
      kpi('Menunggu Verifikasi', r.menungguVerifikasi + '<small>bukti</small>', rupiahTg(r.menunggu) + ' • <a href="#/tagihan/verifikasi" class="b">periksa ›</a>', 'hourglass', 'amber') +
      kpi('Tunggakan', uang(r.tunggakan, 'red'), r.jumlahBelum + ' belum bayar • ' + r.jumlahTerlambat + ' terlambat', 'triangle-alert');
  },
  draw: function (el) {
    var st = this.st;
    $('#tgBody', el).onclick = null;
    $$('#tgTabs button', el).forEach(function (b) { b.classList.toggle('on', b.dataset.t === st.tab); });
    this['t_' + st.tab] ? this['t_' + st.tab](el) : this[st.tab](el);
  },
  t_daftar: function (el) { this.daftar(el); },
  t_verifikasi: function (el) { this.verifikasi(el); },
  // ------------------------------------------------ DAFTAR
  daftar: function (el) {
    var st = this.st, self = this, box = $('#tgBody', el), d = st.list;
    if (!d) { box.innerHTML = '<div class="sk" style="height:300px"></div>'; return; }
    var f = st.f, biayaSet = {}; d.rows.forEach(function (t) { if (t.BiayaKode) biayaSet[t.BiayaKode] = 1; });
    if (!$('#tgF', box)) {
      box.innerHTML = '<div class="card"><div class="toolbar" id="tgF"><div class="field search"><div class="inp-ic">' + ic('search') + '<input class="inp" data-f="cari" placeholder="Cari nama, NIS, tagihan"></div></div>' +
        '<div class="field"><select class="sel" data-f="kelas_id"></select></div><div class="field"><select class="sel" data-f="biayaKode"></select></div>' +
        '<div class="field"><select class="sel" data-f="status"><option value="">Status: Semua</option><option value="Belum">Belum dibayar (semua)</option><option>Belum Bayar</option><option>Terlambat</option><option>Menunggu Verifikasi</option><option>Lunas</option><option>Gratis</option></select></div>' +
        '<div class="field"><select class="sel" data-f="periode"></select></div><button class="btn btn-ghost" id="tgCancelSel">' + ic('x-circle') + 'Batalkan terpilih</button></div><div id="tgTable"></div></div>';
      $('#tgCancelSel', box).onclick = function () { self.batal(el, Object.keys(st.sel)); };
    }
    $('[data-f=kelas_id]', box).innerHTML = kelasOpts(f.kelas_id, 'Kelas: Semua');
    $('[data-f=biayaKode]', box).innerHTML = '<option value="">Biaya: Semua</option>' + Object.keys(biayaSet).sort().map(function (k) { return '<option' + (k === f.biayaKode ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('');
    $('[data-f=periode]', box).innerHTML = '<option value="">Periode: Semua</option>' + (d.periodeAda || []).map(function (p) { return '<option value="' + p + '"' + (p === f.periode ? ' selected' : '') + '>' + esc(tgPeriodeLabel(p)) + '</option>'; }).join('');
    $('[data-f=status]', box).value = f.status; $('[data-f=cari]', box).value = f.cari;
    this.tabel(el);
  },
  filtered: function () {
    var f = this.st.f, q = f.cari.toLowerCase();
    return (this.st.list ? this.st.list.rows : []).filter(function (t) {
      if (f.kelas_id && t.kelas_id !== f.kelas_id) return false;
      if (f.biayaKode && t.BiayaKode !== f.biayaKode) return false;
      if (f.periode && t.Periode !== f.periode) return false;
      if (f.status === 'Belum' ? !TG_BELUM_UI[t.Status] : f.status && t.Status !== f.status) return false;
      if (q && (t.Nama + ' ' + t.NIS + ' ' + t.NamaTagihan + ' ' + t.TagihanID + ' ' + t.Kelas).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  },
  tabel: function (el) {
    var st = this.st, rows = this.filtered(), p = paginate(rows, st.page, 15); st.page = p.page; this.pageRows = p.rows;
    var tot = rows.reduce(function (a, t) { return a + Number(t.Jumlah || 0); }, 0);
    $('#tgTable', el).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" id="tgAll" aria-label="Pilih semua"></th><th>Siswa</th><th>Tagihan</th><th class="hide-m">Jatuh Tempo</th><th class="tr">Jumlah</th><th>Status</th><th class="tr">Aksi</th></tr></thead><tbody>' +
      p.rows.map(function (t) {
        var belum = TG_BELUM_UI[t.Status];
        return '<tr><td><input type="checkbox" data-ck="' + esc(t.TagihanID) + '"' + (st.sel[t.TagihanID] ? ' checked' : '') + '></td><td><b>' + esc(t.Nama) + '</b><div class="xs muted">' + esc(t.NIS) + ' • ' + esc(t.Kelas) + '</div></td><td>' + esc(t.NamaTagihan) + '<div class="xs muted mono">' + esc(t.TagihanID) + '</div></td><td class="hide-m small">' + esc(tglIndo(t.JatuhTempo, true)) + '</td>' +
          '<td class="tr nowrap"><b>' + rupiahTg(t.Jumlah) + '</b>' + (Number(t.Potongan) ? '<div class="xs muted"><s>' + rupiahTg(t.JumlahAsal) + '</s> ' + esc(t.AlasanPotongan || '') + '</div>' : '') + '</td><td>' + tgStatusBadge(t.Status) + '</td>' +
          '<td class="tr nowrap">' + (belum ? '<button class="btn btn-soft btn-sm" data-op="tunai" data-id="' + esc(t.TagihanID) + '" title="Catat bayar di loket">' + ic('banknote') + '<span class="hide-m">Tunai</span></button><button class="btn-ic" data-op="nominal" data-id="' + esc(t.TagihanID) + '" title="Ubah nominal / keringanan">' + ic('percent') + '</button>' : '') + '<button class="btn-ic" data-op="riwayat" data-id="' + esc(t.TagihanID) + '" title="Riwayat pembayaran siswa">' + ic('history') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>' + pagerHtml(p, 'tagihan • total ' + rupiahTg(tot)) : emptyHtml('Tidak ada tagihan', 'Ubah filter atau terbitkan tagihan baru.', 'receipt');
  },
  byId: function (id) { return (this.st.list ? this.st.list.rows : []).filter(function (t) { return t.TagihanID === id; })[0]; },
  opTagihan: async function (el, op, id, btn) {
    var t = this.byId(id), self = this; if (!t) return;
    if (op === 'riwayat') return riwayatBayarModal(t.NIS);
    if (op === 'tunai') {
      var lain = this.st.list.rows.filter(function (x) { return x.NIS === t.NIS && TG_BELUM_UI[x.Status]; });
      var m = modal({ title: 'Catat Pembayaran di Loket', sub: t.Nama + ' • ' + t.Kelas, size: 'md',
        body: '<div class="xs b muted">PILIH TAGIHAN YANG DIBAYAR</div>' + lain.map(function (x) { return '<label class="chk list-i mt8"><input type="checkbox" value="' + esc(x.TagihanID) + '" data-j="' + x.Jumlah + '"' + (x.TagihanID === id ? ' checked' : '') + '><span class="grow">' + esc(x.NamaTagihan) + ' <small class="muted">' + esc(tglIndo(x.JatuhTempo, true)) + '</small></span><b>' + rupiahTg(x.Jumlah) + '</b></label>'; }).join('') +
          '<div class="grid-form mt12"><div class="field c6"><label>Metode</label><select class="sel" name="metode"><option>Tunai</option><option>Transfer</option><option>QRIS</option><option>EDC / Kartu</option></select></div><div class="field c6"><label>Diterima (Rp)</label><input class="inp" name="jumlah" inputmode="numeric" id="tnJ"></div><div class="field"><label>Catatan</label><input class="inp" name="catatan" placeholder="opsional"></div></div><div class="note mt12">' + ic('badge-check') + '<div>Tagihan langsung <b>Lunas</b> dan kwitansi bernomor dibuat.</div></div>',
        foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="tnOk">' + ic('check') + 'Simpan & Lunaskan</button>' });
      var hit = function () { $('#tnJ', m.el).value = $$('input[type=checkbox]:checked', m.el).reduce(function (a, x) { return a + Number(x.dataset.j); }, 0); };
      hit(); m.el.addEventListener('change', function (e) { if (e.target.type === 'checkbox') hit(); });
      $('#tnOk', m.el).onclick = async function () {
        var ids = $$('input[type=checkbox]:checked', m.el).map(function (x) { return x.value; }), f = formData(m.el);
        if (!ids.length) return toast('Pilih tagihan.', 'warn');
        btnBusy(this, true); var r = await api('billing.submitProof', { tagihanIds: ids, metode: f.metode, jumlah: f.jumlah, catatan: f.catatan, langsungVerifikasi: true }); btnBusy(this, false);
        if (toastRes(r)) { m.close(); self.refresh(el); if (await confirmBox('Unduh kwitansi ' + r.data.noKwitansi + ' sekarang?', { ok: 'Unduh' })) unduhKwitansi(r.data.PembayaranID); }
      };
      return;
    }
    if (op === 'nominal') {
      var m2 = modal({ title: 'Ubah Nominal / Keringanan', sub: t.Nama + ' • ' + t.NamaTagihan, size: 'sm',
        body: '<div class="field"><label>Nominal baru (maks ' + rupiahTg(t.JumlahAsal || t.Jumlah) + ')</label><input class="inp" name="jumlahBaru" inputmode="numeric" value="' + Number(t.Jumlah) + '"><div class="hint">Isi 0 untuk membebaskan (status Gratis).</div></div><div class="field mt12"><label>Alasan <span class="req">*</span></label><input class="inp" name="alasan" placeholder="Keringanan / beasiswa susulan"></div>',
        foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="nmOk">Simpan</button>' });
      $('#nmOk', m2.el).onclick = async function () { var f = formData(m2.el); btnBusy(this, true); var r = await api('billing.ubahNominal', { tagihanId: id, jumlahBaru: f.jumlahBaru, alasan: f.alasan }); btnBusy(this, false); if (toastRes(r)) { m2.close(); self.refresh(el); } };
    }
  },
  batal: async function (el, ids) {
    if (!ids.length) return toast('Centang tagihan yang akan dibatalkan.', 'warn');
    if (!await confirmBox('Batalkan ' + ids.length + ' tagihan terpilih?\nTagihan yang sudah dibayar / menunggu verifikasi otomatis dilewati.', { danger: true, ok: 'Batalkan' })) return;
    var r = await api('billing.cancel', { tagihanIds: ids });
    if (toastRes(r)) { this.st.sel = {}; this.refresh(el); }
  },
  ekspor: async function (btn) {
    btnBusy(btn, true);
    var r = await api('billing.list', Object.assign({ denganBukti: true }, this.st.f.status && this.st.f.status !== 'Belum' ? { status: this.st.f.status } : {}, this.st.f.kelas_id ? { kelas_id: this.st.f.kelas_id } : {}, this.st.f.biayaKode ? { biayaKode: this.st.f.biayaKode } : {}, this.st.f.periode ? { periode: this.st.f.periode } : {}));
    if (!r.success) { btnBusy(btn, false); return toast(r.message, 'bad'); }
    var rows = r.data.rows.map(function (t) {
      return { 'ID Tagihan': t.TagihanID, NIS: t.NIS, Nama: t.Nama, Kelas: t.Kelas, Jenis: t.Jenis, 'Kode Biaya': t.BiayaKode, Tagihan: t.NamaTagihan, Periode: t.Periode, 'Nominal Asal': t.JumlahAsal, Potongan: t.Potongan, 'Alasan Potongan': t.AlasanPotongan, Jumlah: t.Jumlah, Status: t.Status, 'Jatuh Tempo': t.JatuhTempo, 'Tanggal Lunas': t.TanggalLunas,
        'Tanggal Bayar': t.TanggalBayar, 'Nominal Dibayar': t.JumlahBayar, Metode: t.MetodeBayar, 'No Referensi': t.NoReferensi, 'Status Verifikasi': t.StatusBayar, 'No Kwitansi': t.NoKwitansi, 'Keterangan Bukti': t.BuktiUntuk > 1 ? '1 bukti untuk ' + t.BuktiUntuk + ' tagihan' : '', 'Link Bukti Transfer': t.BuktiURL };
    });
    try { var n = await unduhExcelTautan(rows, 'Rekap-Keuangan-' + todayStr(), 'Tagihan', 'Link Bukti Transfer'); toast('Excel diunduh (' + rows.length + ' baris, ' + n + ' link bukti). Bagikan hanya internal.', 'ok'); }
    catch (e) { downloadCSV('Rekap-Keuangan-' + todayStr() + '.csv', Object.keys(rows[0] || {}), rows.map(function (o) { return Object.values(o); })); toast('Excel tidak termuat — diunduh sebagai CSV.', 'warn'); }
    btnBusy(btn, false);
  },
  // ------------------------------------------------ VERIFIKASI
  verifikasi: function (el) {
    var self = this, box = $('#tgBody', el), d = this.st.pending;
    if (!d) { box.innerHTML = '<div class="sk" style="height:240px"></div>'; return; }
    var g = kelompokPerBukti(d);
    box.innerHTML = g.length ? '<div class="grid g2" style="gap:14px">' + g.map(function (x, i) {
      var kurang = x.Jumlah < x.NominalTagihan;
      return '<div class="card card-p vcard"><div class="row gap12"><div class="bukti-thumb" data-bk="' + i + '">' + (DEMO ? ic('image') + '<small>Lihat bukti</small>' : '<img src="' + esc(x.BuktiThumb) + '" alt="Bukti" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode(\'Lihat bukti\'))">') + '</div><div class="grow"><b>' + esc(x.Nama) + '</b><div class="xs muted">NIS ' + esc(x.NIS) + ' • ' + esc(x.Kelas) + '</div>' +
        '<div class="row wrap gap4 mt8">' + (x.anggota.length > 1 ? '<span class="bdg amber">' + x.anggota.length + ' tagihan • 1 bukti</span>' : '') + '<span class="bdg">' + esc(x.Metode) + '</span>' + (x.NoReferensi ? '<span class="bdg mono">' + esc(x.NoReferensi) + '</span>' : '') + '</div></div></div>' +
        '<div class="mt12">' + x.anggota.map(function (a) { return '<div class="row between small"><span>' + esc(a.NamaTagihan) + '</span><b>' + rupiahTg(a.NominalTagihan) + '</b></div>'; }).join('') + '<div class="row between mt8" style="border-top:1px dashed var(--line);padding-top:8px"><span class="small">Ditransfer ' + esc(tglIndo(x.TanggalBayar, true)) + '</span><b class="' + (kurang ? 'red' : '') + '">' + rupiahTg(x.Jumlah) + '</b></div>' + (x.Catatan ? '<div class="xs muted mt8">"' + esc(x.Catatan) + '"</div>' : '') + '</div>' +
        '<div class="row gap8 mt12"><button class="btn btn-primary grow" data-vok="' + i + '">' + ic('badge-check') + 'Verifikasi ' + (x.anggota.length > 1 ? x.anggota.length + ' Tagihan' : '') + ' & Lunaskan</button><button class="btn btn-outline" data-vno="' + i + '">' + ic('ban') + 'Tolak</button></div></div>';
    }).join('') + '</div>' : '<div class="card">' + emptyHtml('Tidak ada bukti menunggu', 'Semua pembayaran sudah diverifikasi. 🎉', 'badge-check') + '</div>';
    box.onclick = async function (e) {
      var b = e.target.closest('[data-bk]'); if (b) { var x = g[b.dataset.bk]; return bukaBuktiPopup(buktiDari(x, rupiahTg(x.Jumlah) + ' • ' + x.anggota.length + ' tagihan • ' + tglIndo(x.TanggalBayar))); }
      var ok = e.target.closest('[data-vok]'), no = e.target.closest('[data-vno]');
      if (ok) {
        var y = g[ok.dataset.vok];
        if (!await confirmBox('Verifikasi pembayaran ' + y.Nama + ' sebesar ' + rupiahTg(y.Jumlah) + ' untuk ' + y.anggota.length + ' tagihan?\nSemua tagihan dalam bukti ini menjadi Lunas.', { ok: 'Verifikasi' })) return;
        btnBusy(ok, true); var r = await api('billing.verifyPayment', { pembayaranId: y.PembayaranID, aksi: 'terima' }); btnBusy(ok, false);
        if (toastRes(r)) { self.refresh(el); }
      } else if (no) {
        var z = g[no.dataset.vno], alasan = await promptBox('Tolak Bukti Pembayaran', 'Alasan penolakan (dikirim ke siswa & orang tua):', '');
        if (!alasan) return;
        var r2 = await api('billing.verifyPayment', { pembayaranId: z.PembayaranID, aksi: 'tolak', catatan: alasan });
        if (toastRes(r2)) self.refresh(el);
      }
    };
  },
  // ------------------------------------------------ PENERBITAN
  t_terbit: function (el) {
    var self = this, t = this.st.terbit, box = $('#tgBody', el);
    box.innerHTML = '<div class="card"><div class="card-h"><div class="grow"><div class="seg" id="tbMode" style="max-width:520px"><button type="button" data-m="Bulanan">' + ic('calendar-range') + 'Bulanan</button><button type="button" data-m="Sekali">' + ic('receipt') + 'Sekali Bayar</button><button type="button" data-m="Batal">' + ic('x-circle') + 'Batal Terbitkan</button></div></div></div><div class="card-b" id="tbBody"><div class="sk" style="height:200px"></div></div></div>';
    $$('#tbMode button', box).forEach(function (b) { b.onclick = function () { t.mode = b.dataset.m; t.rows = null; t.pilih = {}; self.terbitBody(el); }; });
    this.withBiaya(function () { self.terbitBody(el); });
  },
  withBiaya: function (fn) {
    var self = this;
    swr('a:biaya.list', 'biaya.list', {}, function (d) { self.st.biaya = d; fn(); }, { fresh: 60000 });
  },
  terbitBody: function (el) {
    var self = this, t = this.st.terbit, box = $('#tbBody', el), bl = (this.st.biaya && this.st.biaya.rows) || [];
    $$('#tbMode button', el).forEach(function (b) { b.classList.toggle('on', b.dataset.m === t.mode); });
    if (t.mode === 'Batal') return this.terbitBatal(el);
    var opsi = bl.filter(function (b) { return b.jenis === t.mode && b.aktif !== 'TIDAK'; });
    if (!opsi.some(function (b) { return b.kode === t.biaya; })) t.biaya = opsi[0] ? opsi[0].kode : (t.mode === 'Sekali' ? '_adhoc' : '');
    var kelasChips = (B().kelas || []).map(function (k) { return '<label class="chk geo-chip"><input type="checkbox" data-kls="' + esc(k.kelas_id) + '"' + (t.kelas.indexOf(k.kelas_id) > -1 ? ' checked' : '') + '> ' + esc(k.nama_kelas) + '</label>'; }).join('');
    box.innerHTML = '<div class="grid-form"><div class="field c6"><label>Jenis biaya</label><select class="sel" id="tbBiaya">' + opsi.map(function (b) { return '<option value="' + esc(b.kode) + '"' + (b.kode === t.biaya ? ' selected' : '') + '>' + esc(b.nama) + ' (' + esc(b.kode) + ') — ' + rupiahTg(b.nominal) + (Object.keys(b.khusus || {}).length ? ' + khusus' : '') + '</option>'; }).join('') + (t.mode === 'Sekali' ? '<option value="_adhoc"' + (t.biaya === '_adhoc' ? ' selected' : '') + '>➕ Tagihan lain (isi manual)</option>' : '') + (!opsi.length && t.mode === 'Bulanan' ? '<option value="">Belum ada biaya bulanan — tambah di tab Jenis Biaya</option>' : '') + '</select></div>' +
      '<div class="field c6" id="tbExtra"></div>' +
      '<div class="field"><label>Sasaran kelas <span class="muted xs">(kosong = semua siswa aktif)</span></label><div class="row wrap gap8" id="tbKelas">' + kelasChips + '</div></div>' +
      (t.mode === 'Bulanan' ? '<div class="field"><label>Bulan tagihan</label><div id="tbBulan"></div></div>' : '') + '</div>' +
      '<div id="tbPrev" class="mt16"></div>';
    var ex = $('#tbExtra', box);
    if (t.mode === 'Sekali') {
      var b0 = bl.filter(function (b) { return b.kode === t.biaya; })[0];
      ex.innerHTML = t.biaya === '_adhoc' ? '<div class="grid-form"><div class="field c4"><label>Kode</label><input class="inp mono" id="tbKode" placeholder="SERAGAM-26"></div><div class="field c8"><label>Nama tagihan</label><input class="inp" id="tbNama" placeholder="Seragam Batik"></div><div class="field c6"><label>Nominal</label><input class="inp" id="tbNom" inputmode="numeric"></div><div class="field c6"><label>Jatuh tempo</label><input class="inp" type="date" id="tbJt"></div></div>'
        : '<div class="grid-form"><div class="field c6"><label>Akhiran kode (opsional)</label><input class="inp mono" id="tbSuf" placeholder="2026"><div class="hint">Mis. PANGKAL-2026</div></div><div class="field c6"><label>Jatuh tempo</label><input class="inp" type="date" id="tbJt" value="' + esc((b0 && b0.jatuh_tempo) || '') + '"></div></div>';
    } else ex.innerHTML = '<div class="note">' + ic('info') + '<div>Satu baris tagihan per siswa per bulan. Jatuh tempo tanggal ' + esc((bl.filter(function (b) { return b.kode === t.biaya; })[0] || {}).jatuh_tempo_tgl || cfg('JATUH_TEMPO_TANGGAL', '10')) + ' tiap bulan.</div></div>';
    var cek = debounce(function () { self.terbitCek(el); }, 350);
    $('#tbBiaya', box).onchange = function () { t.biaya = this.value; t.rows = null; self.terbitBody(el); };
    $('#tbKelas', box).onchange = function () { t.kelas = $$('[data-kls]:checked', box).map(function (x) { return x.dataset.kls; }); cek(); };
    if ($('#tbBulan', box)) pemilihBulan($('#tbBulan', box), { awal: t.periode, onChange: function (l) { t.periode = l; cek(); } });
    $$('#tbExtra input', box).forEach(function (i) { i.oninput = cek; });
    this.terbitCek(el);
  },
  payload: function (el) {
    var t = this.st.terbit, p = { kelas_ids: t.kelas };
    if (t.mode === 'Bulanan') { p.biayaKode = t.biaya; p.periodeList = t.periode; }
    else if (t.biaya === '_adhoc') { p.jenis = 'Sekali'; p.kode = ($('#tbKode', el) || {}).value; p.nama = ($('#tbNama', el) || {}).value; p.nominal = ($('#tbNom', el) || {}).value; p.jatuhTempo = ($('#tbJt', el) || {}).value; }
    else { p.biayaKode = t.biaya; p.sufiks = ($('#tbSuf', el) || {}).value || ''; p.jatuhTempo = ($('#tbJt', el) || {}).value || ''; }
    return p;
  },
  terbitCek: async function (el) {
    var self = this, t = this.st.terbit, prev = $('#tbPrev', el); if (!prev) return;
    var p = this.payload(el);
    if (t.mode === 'Bulanan' && (!p.biayaKode || !p.periodeList.length)) { prev.innerHTML = '<div class="note">' + ic('mouse-pointer-click') + '<div>Pilih jenis biaya dan minimal satu bulan untuk melihat pratinjau.</div></div>'; return; }
    prev.innerHTML = '<div class="sk" style="height:140px"></div>';
    var r = await api('billing.eligible', p);
    if (!r.success) { prev.innerHTML = '<div class="note warn">' + ic('info') + '<div>' + esc(r.message) + '</div></div>'; return; }
    t.rows = r.data.rows; t.pilih = {}; t.rows.forEach(function (x) { t.pilih[x.NIS] = 1; });
    var gambar = function () {
      var dipilih = t.rows.filter(function (x) { return t.pilih[x.NIS]; }), nT = dipilih.reduce(function (a, x) { return a + x.kodeBaru.length; }, 0), tot = dipilih.reduce(function (a, x) { return a + x.Total; }, 0);
      prev.innerHTML = t.rows.length ? '<div class="row between wrap gap8"><b>' + ic('eye') + ' Pratinjau: ' + r.data.jumlahTagihan + ' tagihan baru untuk ' + t.rows.length + ' siswa • estimasi ' + rupiahTg(r.data.estimasi) + '</b><div class="row wrap gap8"><button class="btn btn-outline" id="tbSel">' + ic('check') + 'Terbitkan Terpilih (' + dipilih.length + ')</button><button class="btn btn-dark" id="tbAll">' + ic('send') + 'Terbitkan Semua</button></div></div>' +
        '<div class="tbl-wrap mt12" style="max-height:380px;overflow:auto"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" id="tbCkAll" checked></th><th>Siswa</th><th>Kelas</th><th>Tagihan baru</th><th class="tr">Nominal</th><th class="tr">Potongan</th><th class="tr">Total</th></tr></thead><tbody>' +
        t.rows.map(function (x) { return '<tr><td><input type="checkbox" data-pl="' + esc(x.NIS) + '"' + (t.pilih[x.NIS] ? ' checked' : '') + '></td><td><b>' + esc(x.Nama) + '</b><div class="xs muted">' + esc(x.NIS) + '</div></td><td class="small">' + esc(x.Kelas) + '</td><td class="small">' + (x.periodeBaru.filter(String).length ? x.periodeBaru.map(tgPeriodeLabel).join(', ') : esc(x.kodeBaru.join(', '))) + '</td><td class="tr nowrap">' + rupiahTg(x.Harga) + '</td><td class="tr nowrap">' + (x.Potongan ? '<span class="amber">−' + rupiahTg(x.Potongan) + '</span>' : '-') + '</td><td class="tr nowrap b">' + rupiahTg(x.Total) + '</td></tr>'; }).join('') + '</tbody></table></div><div class="xs muted mt8">Terpilih: ' + nT + ' tagihan • ' + rupiahTg(tot) + '. Siswa yang sudah punya tagihan yang sama otomatis dilewati.</div>'
        : emptyHtml('Tidak ada tagihan baru', 'Semua siswa sasaran sudah memiliki tagihan ini.', 'circle-check');
      if (!t.rows.length) return;
      $('#tbCkAll', prev).onchange = function () { var on = this.checked; t.rows.forEach(function (x) { if (on) t.pilih[x.NIS] = 1; else delete t.pilih[x.NIS]; }); gambar(); };
      prev.onchange = function (e) { if (e.target.dataset.pl) { if (e.target.checked) t.pilih[e.target.dataset.pl] = 1; else delete t.pilih[e.target.dataset.pl]; gambar(); } };
      var kirim = async function (btn, semua) {
        var ids = Object.keys(t.pilih); if (!semua && !ids.length) return toast('Pilih siswa.', 'warn');
        var n = semua ? r.data.jumlahTagihan : t.rows.filter(function (x) { return t.pilih[x.NIS]; }).reduce(function (a, x) { return a + x.kodeBaru.length; }, 0);
        if (!await confirmBox('Terbitkan ' + n + ' tagihan untuk ' + (semua ? t.rows.length : ids.length) + ' siswa?\nOrang tua menerima notifikasi (1 pesan per siswa).', { ok: 'Terbitkan' })) return;
        btnBusy(btn, true); var res = await api(semua ? 'billing.genBatch' : 'billing.genForSelected', Object.assign(self.payload(el), semua ? {} : { subjekIds: ids })); btnBusy(btn, false);
        if (toastRes(res)) { self.refresh(el); self.terbitCek(el); }
      };
      $('#tbSel', prev).onclick = function () { kirim(this, false); };
      $('#tbAll', prev).onclick = function () { kirim(this, true); };
    };
    gambar();
  },
  terbitBatal: function (el) {
    var self = this, box = $('#tbBody', el), d = this.st.list;
    if (!d) { box.innerHTML = '<div class="sk" style="height:200px"></div>'; return; }
    var kode = {}; d.rows.forEach(function (t) { var k = t.Jenis === 'Bulanan' ? t.BiayaKode + '|' + t.Periode : t.KodeTagihan; kode[k] = (kode[k] || 0) + 1; });
    box.innerHTML = '<div class="grid-form"><div class="field c6"><label>Pilih tagihan yang dibatalkan</label><select class="sel" id="btK"><option value="">— pilih —</option>' + Object.keys(kode).sort().reverse().map(function (k) { var p = k.split('|'); return '<option value="' + esc(k) + '">' + esc(p[1] ? p[0] + ' ' + tgPeriodeLabel(p[1]) : p[0]) + ' (' + kode[k] + ')</option>'; }).join('') + '</select></div><div class="field c6"><label>Kelas</label><select class="sel" id="btKls">' + kelasOpts('', 'Semua kelas') + '</select></div></div><div id="btList" class="mt12"></div>';
    var draw = function () {
      var k = $('#btK', box).value, kls = $('#btKls', box).value, host = $('#btList', box);
      if (!k) { host.innerHTML = '<div class="note">' + ic('info') + '<div>Hanya tagihan <b>Belum Bayar / Terlambat / Gratis</b> tanpa pembayaran yang bisa dibatalkan. Yang lunas atau menunggu verifikasi terkunci 🔒.</div></div>'; return; }
      var p = k.split('|'), rows = d.rows.filter(function (t) { return (p[1] ? t.BiayaKode === p[0] && t.Periode === p[1] : t.KodeTagihan === p[0]) && (!kls || t.kelas_id === kls); });
      var bisa = rows.filter(function (t) { return TG_BELUM_UI[t.Status] || t.Status === 'Gratis'; });
      host.innerHTML = '<div class="row between wrap gap8"><b>' + rows.length + ' tagihan • ' + bisa.length + ' bisa dibatalkan</b><button class="btn btn-danger" id="btGo"' + (bisa.length ? '' : ' disabled') + '>' + ic('x-circle') + 'Batalkan ' + bisa.length + ' Tagihan</button></div><div class="tbl-wrap mt12" style="max-height:340px;overflow:auto"><table class="tbl"><tbody>' +
        rows.map(function (t) { var ok = TG_BELUM_UI[t.Status] || t.Status === 'Gratis'; return '<tr class="' + (ok ? '' : 'muted') + '"><td>' + (ok ? '<input type="checkbox" checked data-bt="' + esc(t.TagihanID) + '">' : '🔒') + '</td><td>' + esc(t.Nama) + '<div class="xs muted">' + esc(t.Kelas) + '</div></td><td>' + esc(t.NamaTagihan) + '</td><td class="tr">' + rupiahTg(t.Jumlah) + '</td><td>' + tgStatusBadge(t.Status) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      if ($('#btGo', host)) $('#btGo', host).onclick = function () { self.batal(el, $$('[data-bt]:checked', host).map(function (x) { return x.dataset.bt; })); };
    };
    $('#btK', box).onchange = draw; $('#btKls', box).onchange = draw; draw();
  },
  // ------------------------------------------------ JENIS BIAYA & POTONGAN
  t_biaya: function (el) {
    var self = this, box = $('#tgBody', el);
    box.innerHTML = '<div class="grid g-main"><div class="card"><div class="card-h"><div class="grow"><h3>' + ic('tags') + ' Jenis Biaya</h3><p>Custom per sekolah: SPP, uang makan, uang pangkal, study tour, dll.</p></div><button class="btn btn-dark btn-sm" id="byAdd">' + ic('plus') + 'Tambah</button></div><div class="card-b" id="byList"><div class="sk" style="height:180px"></div></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>' + ic('percent') + ' Potongan & Beasiswa</h3><p>Diterapkan otomatis saat tagihan diterbitkan</p></div><button class="btn btn-dark btn-sm" id="ptAdd">' + ic('plus') + 'Tambah</button></div><div class="card-b" id="ptList"><div class="sk" style="height:180px"></div></div></div></div>';
    $('#byAdd', box).onclick = function () { self.biayaForm(el, {}); };
    $('#ptAdd', box).onclick = function () { self.potForm(el, {}); };
    this.withBiaya(function () { self.biayaList(el); });
    swr('a:discount.list', 'discount.list', {}, function (rows) { self.st.pot = rows; self.potList(el); }, { fresh: 60000 });
  },
  biayaList: function (el) {
    var self = this, rows = (this.st.biaya && this.st.biaya.rows) || [], host = $('#byList', el); if (!host) return;
    host.innerHTML = rows.length ? rows.map(function (b) {
      var kh = Object.keys(b.khusus || {});
      return '<div class="list-i" style="align-items:flex-start"><span class="ic">' + ic(b.jenis === 'Bulanan' ? 'calendar-range' : 'receipt') + '</span><div class="grow"><b>' + esc(b.nama) + ' <span class="bdg mono">' + esc(b.kode) + '</span>' + (b.aktif === 'TIDAK' ? ' <span class="bdg">Nonaktif</span>' : '') + '</b><small>' + esc(b.jenis) + ' • ' + rupiahTg(b.nominal) + (b.jenis === 'Bulanan' ? ' • jatuh tempo tgl ' + esc(b.jatuh_tempo_tgl || cfg('JATUH_TEMPO_TANGGAL', '10')) : b.jatuh_tempo ? ' • jatuh tempo ' + esc(tglIndo(b.jatuh_tempo, true)) : '') + ' • ' + b.tagihan + ' tagihan</small>' +
        (kh.length ? '<div class="row wrap gap4 mt8">' + kh.map(function (k) { var p = k.split(':'); return '<span class="bdg info">' + esc(p[0] === 'KELAS' ? kelasNama(p[1]) : p[0] === 'NIS' ? 'NIS ' + p[1] : p[1]) + ': ' + rupiahTg(b.khusus[k]) + '</span>'; }).join('') + '</div>' : '') + (b.keterangan ? '<div class="xs muted mt8">' + esc(b.keterangan) + '</div>' : '') + '</div><button class="btn-ic" data-by="' + esc(b.biaya_id) + '">' + ic('pencil') + '</button></div>';
    }).join('') : emptyHtml('Belum ada jenis biaya', 'Tambahkan SPP atau biaya lain.', 'tags');
    host.onclick = function (e) { var b = e.target.closest('[data-by]'); if (b) self.biayaForm(el, rows.filter(function (x) { return x.biaya_id === b.dataset.by; })[0]); };
  },
  biayaForm: function (el, b) {
    var self = this, isNew = !b.biaya_id, kh = Object.keys(b.khusus || {}).map(function (k) { var p = k.split(':'); return { t: p[0], k: p.slice(1).join(':'), v: b.khusus[k] }; });
    var m = modal({ title: isNew ? 'Tambah Jenis Biaya' : 'Ubah Jenis Biaya', size: 'lg',
      body: '<div class="grid-form"><div class="field c3"><label>Kode <span class="req">*</span></label><input class="inp mono" name="kode" value="' + esc(b.kode || '') + '" placeholder="SPP"></div><div class="field c5"><label>Nama <span class="req">*</span></label><input class="inp" name="nama" value="' + esc(b.nama || '') + '" placeholder="SPP Bulanan"></div>' +
        '<div class="field c4"><label>Jenis</label><select class="sel" name="jenis"><option value="Bulanan"' + (b.jenis !== 'Sekali' ? ' selected' : '') + '>Bulanan</option><option value="Sekali"' + (b.jenis === 'Sekali' ? ' selected' : '') + '>Sekali bayar</option></select></div>' +
        '<div class="field c4"><label>Nominal dasar (Rp)</label><input class="inp" name="nominal" inputmode="numeric" value="' + esc(b.nominal == null ? '' : b.nominal) + '"></div><div class="field c4" data-j="Bulanan"><label>Tanggal jatuh tempo (1–28)</label><input class="inp" type="number" min="1" max="28" name="jatuh_tempo_tgl" value="' + esc(b.jatuh_tempo_tgl || '') + '" placeholder="' + esc(cfg('JATUH_TEMPO_TANGGAL', '10')) + '"></div><div class="field c4" data-j="Sekali"><label>Jatuh tempo</label><input class="inp" type="date" name="jatuh_tempo" value="' + esc(b.jatuh_tempo || '') + '"></div>' +
        '<div class="field c4"><label>Status</label><select class="sel" name="aktif"><option value="YA"' + (b.aktif !== 'TIDAK' ? ' selected' : '') + '>Aktif</option><option value="TIDAK"' + (b.aktif === 'TIDAK' ? ' selected' : '') + '>Nonaktif</option></select></div>' +
        '<div class="field"><label>Nominal khusus <span class="muted xs">(menimpa nominal dasar: NIS › Kelas › Jenjang)</span></label><div id="khRows"></div><button class="btn btn-ghost btn-sm mt8" type="button" id="khAdd">' + ic('plus') + 'Tambah nominal khusus</button></div>' +
        '<div class="field"><label>Keterangan</label><input class="inp" name="keterangan" value="' + esc(b.keterangan || '') + '"></div></div>',
      foot: (!isNew && !b.tagihan ? '<button class="btn btn-danger" id="byDel" style="margin-right:auto">' + ic('trash-2') + 'Hapus</button>' : '') + '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="bySave">' + ic('save') + 'Simpan</button>' });
    var jenis = function () { var j = m.el.querySelector('[name=jenis]').value; $$('[data-j]', m.el).forEach(function (x) { x.hidden = x.dataset.j !== j; }); };
    m.el.querySelector('[name=jenis]').onchange = jenis; jenis();
    var host = $('#khRows', m.el);
    var baris = function (x) {
      x = x || { t: 'JENJANG', k: 'SMA', v: '' };
      var r = h('<div class="row gap8 mt8 kh-row"><select class="sel" style="max-width:120px" data-kt><option' + (x.t === 'JENJANG' ? ' selected' : '') + '>JENJANG</option><option' + (x.t === 'KELAS' ? ' selected' : '') + '>KELAS</option><option' + (x.t === 'NIS' ? ' selected' : '') + '>NIS</option></select><span class="grow" data-kk></span><input class="inp" style="max-width:150px" data-kv inputmode="numeric" placeholder="Nominal" value="' + esc(x.v) + '"><button class="btn-ic" type="button" data-kx>' + ic('x') + '</button></div>');
      var kk = function () { var t = $('[data-kt]', r).value; $('[data-kk]', r).innerHTML = t === 'JENJANG' ? '<select class="sel" data-kn><option' + (x.k === 'SD' ? ' selected' : '') + '>SD</option><option' + (x.k === 'SMP' ? ' selected' : '') + '>SMP</option><option' + (x.k === 'SMA' ? ' selected' : '') + '>SMA</option></select>' : t === 'KELAS' ? '<select class="sel" data-kn>' + kelasOpts(x.k) + '</select>' : '<input class="inp mono" data-kn placeholder="NIS" value="' + esc(x.t === 'NIS' ? x.k : '') + '">'; };
      $('[data-kt]', r).onchange = kk; kk(); $('[data-kx]', r).onclick = function () { r.remove(); };
      host.appendChild(r);
    };
    kh.forEach(baris);
    $('#khAdd', m.el).onclick = function () { baris(); };
    $('#bySave', m.el).onclick = async function () {
      var f = formData(m.el), khusus = {};
      $$('.kh-row', m.el).forEach(function (r) { var k = $('[data-kn]', r).value.trim(), v = $('[data-kv]', r).value.trim(); if (k && v !== '') khusus[$('[data-kt]', r).value + ':' + k] = v; });
      btnBusy(this, true); var r = await api('biaya.save', { row: Object.assign({ biaya_id: b.biaya_id || '', nominal_khusus: khusus }, f) }); btnBusy(this, false);
      if (toastRes(r)) { m.close(); Store.del(userKey('a:biaya.list')); self.withBiaya(function () { self.biayaList(el); }); }
    };
    if ($('#byDel', m.el)) $('#byDel', m.el).onclick = async function () { if (!await confirmBox('Hapus jenis biaya ' + b.nama + '?', { danger: true })) return; var r = await api('biaya.delete', { biaya_id: b.biaya_id }); if (toastRes(r)) { m.close(); Store.del(userKey('a:biaya.list')); self.withBiaya(function () { self.biayaList(el); }); } };
  },
  potList: function (el) {
    var self = this, rows = this.st.pot || [], host = $('#ptList', el); if (!host) return;
    host.innerHTML = rows.length ? rows.map(function (p) { return '<div class="list-i"><span class="ic">' + ic(p.Tipe === 'Gratis' ? 'gift' : 'percent') + '</span><div class="grow"><b>' + esc(p.Nama) + '</b><small>' + esc(p.Kelas) + ' • ' + (p.Tipe === 'Persen' ? p.Nilai + '%' : p.Tipe === 'Gratis' ? 'Gratis' : rupiahTg(p.Nilai)) + ' • ' + esc(p.Berlaku) + (p.Mulai || p.Sampai ? ' • ' + esc(p.Mulai ? tgPeriodeLabel(p.Mulai) : '…') + '–' + esc(p.Sampai ? tgPeriodeLabel(p.Sampai) : '…') : '') + '</small><div class="xs muted">' + esc(p.Alasan) + '</div></div>' + (p.Aktif !== 'YA' ? '<span class="bdg">Nonaktif</span>' : '') + '<button class="btn-ic" data-pt="' + esc(p.PotonganID) + '">' + ic('pencil') + '</button></div>'; }).join('') : emptyHtml('Belum ada potongan', 'Contoh: beasiswa prestasi 50% SPP.', 'gift');
    host.onclick = function (e) { var b = e.target.closest('[data-pt]'); if (b) self.potForm(el, rows.filter(function (x) { return x.PotonganID === b.dataset.pt; })[0]); };
  },
  potForm: function (el, p) {
    var self = this, bl = (this.st.biaya && this.st.biaya.rows) || [];
    var m = modal({ title: p.PotonganID ? 'Ubah Potongan' : 'Tambah Potongan / Beasiswa', size: 'md',
      body: '<div class="grid-form"><div class="field"><label>Siswa <span class="req">*</span></label><input class="inp" list="ptSiswa" name="NIS" value="' + esc(p.NIS || '') + '" placeholder="Ketik nama / NIS"><datalist id="ptSiswa">' + (B().siswa || []).map(function (s) { return '<option value="' + esc(s.NIS) + '">' + esc(s.nama_lengkap + ' — ' + kelasNama(s.kelas_id)) + '</option>'; }).join('') + '</datalist></div>' +
        '<div class="field c6"><label>Tipe</label><select class="sel" name="Tipe">' + ['Persen', 'Nominal', 'Gratis'].map(function (t) { return '<option' + (p.Tipe === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div><div class="field c6"><label>Nilai</label><input class="inp" name="Nilai" inputmode="numeric" value="' + esc(p.Nilai == null ? '' : p.Nilai) + '" placeholder="50 (%) atau 100000"></div>' +
        '<div class="field c6"><label>Berlaku untuk</label><select class="sel" name="Berlaku"><option value="Semua">Semua tagihan</option><option value="Bulanan"' + (p.Berlaku === 'Bulanan' ? ' selected' : '') + '>Semua bulanan</option><option value="Sekali"' + (p.Berlaku === 'Sekali' ? ' selected' : '') + '>Semua sekali bayar</option>' + bl.map(function (b) { return '<option value="KODE:' + esc(b.kode) + '"' + (p.Berlaku === 'KODE:' + b.kode ? ' selected' : '') + '>Hanya ' + esc(b.nama) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field c3"><label>Mulai</label><input class="inp" type="month" name="Mulai" value="' + esc(p.Mulai || '') + '"></div><div class="field c3"><label>Sampai</label><input class="inp" type="month" name="Sampai" value="' + esc(p.Sampai || '') + '"></div>' +
        '<div class="field c8"><label>Alasan <span class="req">*</span></label><input class="inp" name="Alasan" value="' + esc(p.Alasan || '') + '" placeholder="Beasiswa Prestasi"></div><div class="field c4"><label>Status</label><select class="sel" name="Aktif"><option value="YA">Aktif</option><option value="TIDAK"' + (p.Aktif === 'TIDAK' ? ' selected' : '') + '>Nonaktif</option></select></div></div>' +
        '<div class="note mt12">' + ic('info') + '<div>Potongan dipakai untuk tagihan yang diterbitkan <b>berikutnya</b>. Untuk tagihan yang sudah terbit gunakan tombol <b>%</b> (ubah nominal) di Daftar Tagihan.</div></div>',
      foot: (p.PotonganID ? '<button class="btn btn-danger" id="ptDel" style="margin-right:auto">' + ic('trash-2') + 'Hapus</button>' : '') + '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="ptSave">Simpan</button>' });
    $('#ptSave', m.el).onclick = async function () { var f = formData(m.el); f.PotonganID = p.PotonganID || ''; btnBusy(this, true); var r = await api('discount.save', { data: f }); btnBusy(this, false); if (toastRes(r)) { m.close(); Store.del(userKey('a:discount.list')); self.t_biaya(el); } };
    if ($('#ptDel', m.el)) $('#ptDel', m.el).onclick = async function () { if (!await confirmBox('Hapus potongan ini?', { danger: true })) return; var r = await api('discount.delete', { potonganId: p.PotonganID }); if (toastRes(r)) { m.close(); Store.del(userKey('a:discount.list')); self.t_biaya(el); } };
  },
  // ------------------------------------------------ PENGINGAT & PENGATURAN
  t_pengingat: function (el) {
    var self = this, box = $('#tgBody', el);
    box.innerHTML = '<div class="grid g-main"><div class="card"><div class="card-h"><div class="grow"><h3>' + ic('bell-ring') + ' Pengingat Jatuh Tempo</h3><p>H-3 & hari-H, hanya untuk tagihan Belum Bayar / Terlambat</p></div><input class="inp" type="date" id="rmTgl" value="' + todayStr() + '" style="max-width:170px"></div><div class="card-b" id="rmBody"><div class="sk" style="height:160px"></div></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>' + ic('settings') + ' Pengaturan Keuangan</h3><p>Rekening, kwitansi, pengingat otomatis</p></div></div><div class="card-b"><form class="grid-form" id="kuF"><div class="sk" style="height:200px"></div></form></div></div></div>';
    var load = async function () {
      var r = await api('reminder.preview', { tanggal: $('#rmTgl', box).value });
      if (!r.success) { $('#rmBody', box).innerHTML = errorBox(r.message); return; }
      var d = r.data;
      $('#rmBody', box).innerHTML = ['H3', 'H0'].map(function (j) {
        var x = d[j];
        return '<div class="rm-col"><div class="row between"><b>' + (j === 'H3' ? 'H-3' : 'Hari-H') + ' • jatuh tempo ' + esc(tglIndo(x.jatuhTempo, true)) + '</b><button class="btn btn-sm ' + (x.kirim.length ? 'btn-primary' : 'btn-outline') + '" data-rm="' + j + '"' + (x.kirim.length ? '' : ' disabled') + '>' + ic('send') + 'Kirim (' + x.kirim.length + ')</button></div>' +
          (x.kirim.length ? x.kirim.slice(0, 30).map(function (k) { return '<div class="row between small mt8"><span>' + esc(k.Nama) + ' <span class="muted">• ' + esc(k.NamaTagihan) + '</span></span><b>' + rupiahTg(k.Jumlah) + '</b></div>'; }).join('') : '<div class="small muted mt8">Tidak ada yang perlu diingatkan.</div>') +
          (x.lewati.length ? '<details class="mt8"><summary class="xs muted">' + x.lewati.length + ' dilewati</summary>' + x.lewati.slice(0, 40).map(function (k) { return '<div class="xs muted">' + esc(k.Nama) + ' — ' + esc(k.alasan) + '</div>'; }).join('') + '</details>' : '') + '</div>';
      }).join('') + '<div class="note mt12">' + ic('info') + '<div>Pengingat otomatis: <b>' + (d.otomatis ? 'AKTIF pukul ' + esc(d.jam) : 'nonaktif') + '</b>' + (d.terakhir ? ' • terakhir ' + esc(tglIndo(d.terakhir, true)) : '') + '. Notifikasi in-app selalu terkirim; WA/Email bila modul notifikasi aktif.</div></div>';
      $$('[data-rm]', box).forEach(function (b) { b.onclick = async function () { btnBusy(b, true); var r2 = await api('reminder.run', { jenis: b.dataset.rm, tanggal: $('#rmTgl', box).value }); btnBusy(b, false); toastRes(r2); load(); }; });
    };
    $('#rmTgl', box).onchange = load; load();
    api('billing.settingsGet', {}).then(function (r) {
      if (!r.success) return;
      var v = {}; r.data.forEach(function (x) { v[x.key] = x.value; });
      var yn = function (k) { return '<select class="sel" name="' + k + '"><option value="YA"' + (v[k] === 'YA' ? ' selected' : '') + '>Ya</option><option value="TIDAK"' + (v[k] !== 'YA' ? ' selected' : '') + '>Tidak</option></select>'; };
      var f = $('#kuF', box);
      f.innerHTML = '<div class="field"><label>Rekening tujuan pembayaran</label><input class="inp" name="REKENING_BANK" value="' + esc(v.REKENING_BANK || '') + '" placeholder="BSI 7123456789 a.n. Yayasan …"></div>' +
        '<div class="field c6"><label>Nama penanda tangan kwitansi</label><input class="inp" name="NAMA_BENDAHARA" value="' + esc(v.NAMA_BENDAHARA || '') + '"></div><div class="field c3"><label>Awalan kwitansi</label><input class="inp mono" name="KWITANSI_PREFIX" value="' + esc(v.KWITANSI_PREFIX || 'KW') + '"></div><div class="field c3"><label>Jatuh tempo bawaan</label><input class="inp" type="number" min="1" max="28" name="JATUH_TEMPO_TANGGAL" value="' + esc(v.JATUH_TEMPO_TANGGAL || '10') + '"></div>' +
        '<div class="field c6"><label>Pengingat otomatis harian</label>' + yn('REMINDER_OTOMATIS') + '</div><div class="field c6"><label>Jam kirim</label><input class="inp" type="time" name="REMINDER_JAM" value="' + esc(v.REMINDER_JAM || '08:00') + '"></div>' +
        '<div class="field c6"><label>Kirim H-3</label>' + yn('REMINDER_H3') + '</div><div class="field c6"><label>Kirim hari-H</label>' + yn('REMINDER_H0') + '</div>' +
        '<div class="field row between"><span class="xs muted">Tagihan lewat jatuh tempo otomatis ditandai Terlambat tiap hari.</span><button class="btn btn-dark" type="submit">' + ic('save') + 'Simpan</button></div>';
      f.onsubmit = async function (e) { e.preventDefault(); var b = $('button[type=submit]', f); btnBusy(b, true); var r2 = await api('billing.settings', { pairs: formData(f) }); btnBusy(b, false); toastRes(r2, 'Pengaturan keuangan disimpan.'); };
    });
  }
});

// =====================================================================
// SISWA — TAGIHAN SAYA
// =====================================================================
registerPage('siswa', 'tagihan', {
  title: 'Tagihan Saya',
  st: { pilih: {}, d: null },
  render: function (el) {
    var self = this;
    el.innerHTML = pageHead('Portal Siswa <span>/ Tagihan</span>', 'Tagihan Saya', 'Lihat tagihan sekolah, bayar beberapa tagihan sekaligus dengan satu bukti transfer, dan unduh kwitansi resmi ber-QR.') + '<div id="tsBody"><div class="sk" style="height:300px"></div></div>';
    swr('billing.mine', 'billing.mine', {}, function (d) { self.st.d = d; self.draw(el); }, { fresh: 30000, onError: function (r) { $('#tsBody', el).innerHTML = errorBox(r.message); } });
  },
  draw: function (el) {
    var st = this.st, self = this, d = st.d, box = $('#tsBody', el);
    var belum = d.tagihan.filter(function (t) { return TG_BELUM_UI[t.Status]; }), menunggu = d.tagihan.filter(function (t) { return t.Status === 'Menunggu Verifikasi'; });
    Object.keys(st.pilih).forEach(function (k) { if (!belum.some(function (t) { return t.TagihanID === k; })) delete st.pilih[k]; });
    var terpilih = belum.filter(function (t) { return st.pilih[t.TagihanID]; }), tot = terpilih.reduce(function (a, t) { return a + Number(t.Jumlah); }, 0);
    box.innerHTML = '<div class="grid g3">' + kpiS('Total Tunggakan', '<span class="kv-money ' + (d.totalTunggakan ? 'red' : '') + '">' + rupiahTg(d.totalTunggakan) + '</span>', belum.length + ' tagihan belum dibayar', 'wallet') +
      kpiS('Menunggu Verifikasi', menunggu.length + '<small>tagihan</small>', 'Bukti sedang diperiksa bendahara', 'hourglass') +
      kpiS('Rekening Pembayaran', '<span style="font-size:15px;line-height:1.3;display:block">' + esc(d.rekening || 'Hubungi bendahara sekolah') + '</span>', 'Transfer lalu unggah bukti di sini', 'landmark') + '</div>' +
      '<div class="card mt24"><div class="card-h"><div class="grow"><h3>Daftar Tagihan</h3><p>Centang beberapa tagihan untuk dibayar sekaligus dengan 1 bukti transfer</p></div>' + (belum.length > 1 ? '<label class="chk small"><input type="checkbox" id="tsAll"' + (terpilih.length === belum.length ? ' checked' : '') + '> Pilih semua</label>' : '') + '</div><div class="card-b">' +
      (d.tagihan.length ? d.tagihan.map(function (t) {
        var bisa = TG_BELUM_UI[t.Status], tolak = (t.pembayaran || []).filter(function (p) { return p.Status === 'Ditolak'; }).slice(-1)[0];
        var kw = (t.pembayaran || []).filter(function (p) { return p.Status === 'Terverifikasi' && p.NoKwitansi; })[0];
        return '<label class="tg-item ' + (bisa ? 'bisa' : '') + (st.pilih[t.TagihanID] ? ' on' : '') + '">' + (bisa ? '<input type="checkbox" data-tg="' + esc(t.TagihanID) + '"' + (st.pilih[t.TagihanID] ? ' checked' : '') + '>' : '<span class="tg-ic">' + ic(t.Status === 'Lunas' ? 'circle-check' : t.Status === 'Gratis' ? 'gift' : 'hourglass') + '</span>') +
          '<div class="grow"><b>' + esc(t.NamaTagihan) + '</b><div class="small muted">Jatuh tempo ' + esc(tglIndo(t.JatuhTempo)) + (Number(t.Potongan) ? ' • potongan ' + rupiahTg(t.Potongan) + ' (' + esc(t.AlasanPotongan) + ')' : '') + '</div>' + (tolak && bisa ? '<div class="xs red mt4">' + ic('circle-x') + ' Bukti sebelumnya ditolak: ' + esc(tolak.Catatan) + '</div>' : '') + '</div>' +
          '<div class="tr"><b class="nowrap">' + rupiahTg(t.Jumlah) + '</b><div class="mt4">' + tgStatusBadge(t.Status) + '</div>' + (kw ? '<button type="button" class="btn btn-soft btn-sm mt8" data-kw="' + esc(kw.PembayaranID) + '">' + ic('download') + 'Kwitansi</button>' : '') + '</div></label>';
      }).join('') : emptyHtml('Belum ada tagihan', 'Tagihan dari sekolah akan tampil di sini.', 'receipt')) + '</div></div>' +
      '<div class="card mt24"><div class="card-h"><div class="grow"><h3>Riwayat Pembayaran</h3><p>Unduh kwitansi untuk pembayaran yang sudah diverifikasi</p></div></div><div class="card-b">' +
      (d.transaksi.length ? d.transaksi.map(function (t) { return '<div class="list-i"><span class="ic">' + ic(t.Status === 'Terverifikasi' ? 'badge-check' : t.Status === 'Ditolak' ? 'circle-x' : 'hourglass') + '</span><div class="grow"><b>' + rupiahTg(t.Jumlah) + ' • ' + esc(t.Metode) + '</b><small>' + esc(tglIndo(t.TanggalBayar)) + ' • ' + t.item.map(function (i) { return esc(i.NamaTagihan); }).join(', ') + '</small>' + (t.Status === 'Ditolak' && t.Catatan ? '<div class="xs red">' + esc(t.Catatan) + '</div>' : '') + '</div>' + tgStatusBadge(t.Status) + (t.NoKwitansi ? '<button class="btn btn-soft btn-sm" data-kw="' + esc(t.PembayaranID) + '">' + ic('download') + '<span class="hide-m">' + esc(t.NoKwitansi) + '</span></button>' : '') + '</div>'; }).join('') : emptyHtml('Belum ada pembayaran', '', 'history')) + '</div></div>' +
      (terpilih.length ? '<div class="pay-bar"><div class="grow"><b>' + terpilih.length + ' tagihan dipilih</b><div class="small">Total ' + rupiahTg(tot) + '</div></div><button class="btn btn-accent btn-lg" id="tsPay">' + ic('credit-card') + 'Bayar ' + terpilih.length + ' Tagihan • ' + rupiahTg(tot) + '</button></div>' : '');
    box.onchange = function (e) {
      if (e.target.dataset.tg) { if (e.target.checked) st.pilih[e.target.dataset.tg] = 1; else delete st.pilih[e.target.dataset.tg]; self.draw(el); }
      if (e.target.id === 'tsAll') { belum.forEach(function (t) { if (e.target.checked) st.pilih[t.TagihanID] = 1; else delete st.pilih[t.TagihanID]; }); self.draw(el); }
    };
    box.onclick = function (e) { var k = e.target.closest('[data-kw]'); if (k) { e.preventDefault(); unduhKwitansi(k.dataset.kw, k); } };
    if ($('#tsPay', box)) $('#tsPay', box).onclick = function () { self.bayar(el, terpilih, tot); };
  },
  bayar: function (el, list, tot) {
    var self = this, file = null, d = this.st.d;
    var m = modal({ title: 'Bayar ' + list.length + ' Tagihan', sub: 'Cukup 1 bukti transfer untuk semua tagihan di bawah', size: 'md',
      body: list.map(function (t) { return '<div class="row between small"><span>' + esc(t.NamaTagihan) + '</span><b>' + rupiahTg(t.Jumlah) + '</b></div>'; }).join('') + '<div class="row between mt8" style="border-top:1px solid var(--line);padding-top:8px"><b>Total</b><b style="font-size:18px">' + rupiahTg(tot) + '</b></div>' +
        '<div class="note mt12">' + ic('landmark') + '<div>Transfer ke: <b>' + esc(d.rekening || 'rekening sekolah') + '</b></div></div>' +
        '<div class="grid-form mt12"><div class="field"><label>Bukti transfer (foto / PDF, maks 5 MB) <span class="req">*</span></label><label class="drop" id="bpDrop"><input type="file" accept="image/*,application/pdf" id="bpFile" hidden>' + ic('upload') + '<span id="bpName">Pilih / foto bukti transfer</span></label></div>' +
        '<div class="field c6"><label>Nominal ditransfer</label><input class="inp" name="jumlah" inputmode="numeric" value="' + tot + '"></div><div class="field c6"><label>Tanggal transfer</label><input class="inp" type="date" name="tanggalBayar" value="' + todayStr() + '"></div>' +
        '<div class="field c6"><label>Metode</label><select class="sel" name="metode"><option>Transfer</option><option>QRIS</option><option>Setor tunai bank</option></select></div><div class="field c6"><label>No. referensi (opsional)</label><input class="inp" name="noReferensi"></div>' +
        '<div class="field"><label>Catatan (opsional)</label><input class="inp" name="catatan" placeholder="Atas nama rekening pengirim"></div></div>',
      foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="bpSend">' + ic('send') + 'Kirim Bukti</button>' });
    $('#bpFile', m.el).onchange = async function () {
      var f = this.files[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) return toast('Ukuran file terlalu besar.', 'bad');
      $('#bpName', m.el).textContent = 'Memproses ' + f.name + '…';
      try {
        if (/^image\//.test(f.type)) { var url = await compressImage(f, 1400, 0.8); file = { name: f.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', data: url.split(',')[1] }; $('#bpDrop', m.el).style.backgroundImage = 'url(' + url + ')'; }
        else file = await readFileB64(f);
        $('#bpName', m.el).textContent = '✓ ' + f.name + ' (' + fmtSize(Math.round(file.data.length * 0.75)) + ')';
      } catch (e) { toast('File tidak dapat dibaca.', 'bad'); }
    };
    $('#bpSend', m.el).onclick = async function () {
      if (!file) return toast('Unggah bukti transfer terlebih dahulu.', 'warn');
      var f = formData(m.el); btnBusy(this, true);
      var r = await api('billing.submitProof', Object.assign({ tagihanIds: list.map(function (t) { return t.TagihanID; }), bukti: file }, f));
      btnBusy(this, false);
      if (toastRes(r)) { m.close(); self.st.pilih = {}; Store.del(userKey('billing.mine')); self.render(el); afterWrite(); }
    };
  }
});
