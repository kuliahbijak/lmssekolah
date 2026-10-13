/* =====================================================================
   SIAKAD SISWA — pages-nilai.js : Penilaian (input nilai), Laporan &
   Analitik, Pengaturan (sekolah, akademik, guru, kelas, mapel, pengumuman, log).
   ===================================================================== */
'use strict';

// =====================================================================
// PENILAIAN
// =====================================================================
registerPage('guru', 'penilaian', {
  title: 'Penilaian',
  st: { kelas: '', mapel: '', filter: 'semua', data: null, key: '', edits: {} },
  init: function (el) {
    var st = this.st, self = this;
    el.innerHTML = pageHead('Panel Guru <span>// Penilaian</span>', 'Penilaian & Input Nilai', 'Kelola rekap nilai siswa: harian, UTS, UAS, dan kalkulasi otomatis nilai akhir semester.',
      '<button class="btn btn-outline" id="nExport">' + ic('download') + 'Ekspor Raport / CSV</button><label class="btn btn-outline" style="cursor:pointer">' + ic('upload') + 'Impor Nilai CSV<input type="file" accept=".csv" hidden id="nImport"></label>') +
      '<div class="grid g4" id="nKpi"></div>' +
      '<div class="card mt24"><div class="toolbar"><div class="field"><label class="lbl">Kelas / Rombel</label><select class="sel" id="nKelas"></select></div><div class="field"><label class="lbl">Mata Pelajaran</label><select class="sel" id="nMapel"></select></div>' +
      '<div class="field"><label class="lbl">Semester</label><input class="inp" id="nSem" readonly></div><button class="btn btn-dark" id="nLoad">' + ic('filter') + 'Terapkan Filter</button></div>' +
      '<div class="note" style="margin:0 20px 16px;align-items:center;flex-wrap:wrap"><span style="font-size:20px;font-weight:700;color:var(--navy)">Σ</span><div class="grow" id="nRumus"></div><div class="chips" id="nChips"></div></div></div>' +
      '<div class="card mt16" id="nTable"></div>' +
      '<div class="grid g2 mt24"><div class="card"><div class="card-h"><div class="grow"><h3>Distribusi Nilai Siswa</h3><p>Sebaran performa capaian kompetensi</p></div><span class="small b">' + ic('chart-column') + ' Analisis</span></div><div class="card-b" id="nDist"></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>Tindak Lanjut Remedial</h3><p>Siswa di bawah KKM pada mapel ini</p></div><span class="bdg bad" id="nRemCnt"></span></div><div class="card-b" id="nRem"></div></div></div>' +
      '<div class="sticky-bar" id="nBar" hidden><span class="av sm c2">' + ic('pencil') + '</span><div class="grow"><b class="small">Perubahan belum disimpan</b><div class="xs muted" id="nBarInfo"></div></div><button class="btn btn-soft btn-sm" id="nRound">Bulatkan Semua</button><button class="btn btn-soft btn-sm" id="nUndo">Batal / Reset</button><label class="chk small"><input type="checkbox" id="nNotif"> Kirim notifikasi ke ortu</label><button class="btn btn-dark" id="nSave">' + ic('save') + 'Simpan Semua Nilai ke Sheets</button></div>';
    $('#nKelas', el).onchange = function () { st.kelas = this.value; self.load(el); };
    $('#nMapel', el).onchange = function () { st.mapel = this.value; self.load(el); };
    $('#nLoad', el).onclick = function () { self.load(el, true); };
    $('#nExport', el).onclick = function () { self.exportCsv(); };
    $('#nImport', el).onchange = function () { self.importCsv(el, this.files[0]); this.value = ''; };
    $('#nUndo', el).onclick = function () { st.edits = {}; self.table(el); };
    $('#nRound', el).onclick = function () { (st.data.rows || []).forEach(function (r) { ['nilai_harian', 'nilai_uts', 'nilai_uas'].forEach(function (k) { var v = self.val(r, k); if (v !== '' && Math.round(v) !== Number(v)) self.setEdit(r.NIS, k, Math.round(v)); }); }); self.table(el); };
    $('#nSave', el).onclick = function () { self.save(el, this); };
    el.addEventListener('click', function (e) { var c = e.target.closest('[data-f]'); if (c) { st.filter = c.dataset.f; self.table(el); } });
    el.addEventListener('input', function (e) {
      var inp = e.target; if (!inp.matches('input.cell')) return;
      var v = inp.value.trim(); if (v !== '' && (isNaN(v) || Number(v) < 0 || Number(v) > 100)) { inp.classList.add('err'); return; }
      inp.classList.remove('err');
      self.setEdit(inp.dataset.nis, inp.dataset.k, v === '' ? '' : Number(v));
      var r = st.data.rows.filter(function (x) { return x.NIS === inp.dataset.nis; })[0], tr = inp.closest('tr');
      var ak = akhirOf(self.val(r, 'nilai_harian'), self.val(r, 'nilai_uts'), self.val(r, 'nilai_uas'));
      inp.classList.toggle('changed', true); inp.classList.toggle('low', v !== '' && Number(v) < kkm());
      $('[data-akhir]', tr).innerHTML = self.akhirCell(ak); $('[data-pred]', tr).innerHTML = self.predCell(ak); $('[data-stat]', tr).innerHTML = self.statCell(ak);
      tr.classList.toggle('warnrow', ak !== '' && ak < kkm());
      self.bar(el); self.side(el);
    });
    el.addEventListener('keydown', function (e) {
      var inp = e.target; if (!inp.matches('input.cell')) return;
      var cells = $$('input.cell', el), i = cells.indexOf(inp), cols = 3;
      if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); (cells[i + cols] || cells[i]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (cells[i - cols] || cells[i]).focus(); }
    });
    el.addEventListener('focusin', function (e) { if (e.target.matches('input.cell')) e.target.select(); });
    window.addEventListener('beforeunload', function (e) { if (Object.keys(st.edits).length) { e.preventDefault(); e.returnValue = ''; } });
  },
  val: function (r, k) { var e = this.st.edits[r.NIS]; return e && e[k] !== undefined ? e[k] : r[k]; },
  setEdit: function (nis, k, v) { var st = this.st, r = st.data.rows.filter(function (x) { return x.NIS === nis; })[0]; var e = st.edits[nis] = st.edits[nis] || {}; if (String(r[k]) === String(v)) delete e[k]; else e[k] = v; if (!Object.keys(e).length) delete st.edits[nis]; },
  akhirCell: function (a) { return a === '' ? '<span class="muted">-</span>' : '<b style="font-size:18px" class="' + (a < kkm() ? 'red' : a >= 90 ? 'amber' : 'navy') + '">' + fmtN(a) + '</b>'; },
  predCell: function (a) { var p = predikatOf(a); return p ? '<span class="grade ' + p + '">' + p + '</span>' : '-'; },
  statCell: function (a) { return a === '' ? '<span class="bdg">Belum lengkap</span>' : a >= kkm() ? '<span class="bdg ok">' + ic('circle-check') + 'Tuntas</span>' : '<span class="bdg bad">' + ic('triangle-alert') + 'Perlu Remedial</span>'; },
  render: function (el) {
    var st = this.st;
    if (!st.kelas) { var wali = (B().kelas || []).filter(function (k) { return String(k.wali_kelas_id) === String(AppState.ref); })[0]; st.kelas = (wali || (B().kelas || [])[0] || {}).kelas_id || ''; }
    if (!st.mapel) { var me = B().me || {}; var mm = (B().mapel || []).filter(function (m) { return me.mata_pelajaran && m.nama.indexOf(me.mata_pelajaran) > -1; })[0]; st.mapel = (mm || (B().mapel || [])[0] || {}).nama || ''; }
    $('#nKelas', el).innerHTML = kelasOpts(st.kelas);
    $('#nMapel', el).innerHTML = mapelOpts(st.mapel);
    $('#nSem', el).value = cfg('SEMESTER', '') + ' ' + cfg('TAHUN_AJARAN', '');
    $('#nRumus', el).innerHTML = '<b>Rumus Bobot Otomatis:</b> Nilai Akhir = (Harian × ' + cfg('BOBOT_HARIAN', 40) + '%) + (UTS × ' + cfg('BOBOT_UTS', 30) + '%) + (UAS × ' + cfg('BOBOT_UAS', 30) + '%) • <span class="amber b">KKM Minimal: ' + kkm() + '</span>';
    this.load(el);
  },
  load: async function (el, force) {
    var st = this.st, self = this, key = st.kelas + '|' + st.mapel + '|' + cfg('SEMESTER', '') + '|' + cfg('TAHUN_AJARAN', '');
    if (!st.kelas || !st.mapel) { $('#nTable', el).innerHTML = emptyHtml('Pilih kelas & mata pelajaran', 'Tambahkan kelas/mapel di menu Pengaturan bila belum ada.', 'clipboard'); return; }
    if (st.key !== key && Object.keys(st.edits).length && !await confirmBox('Ada ' + Object.keys(st.edits).length + ' nilai belum disimpan. Buang perubahan?', { danger: true, ok: 'Buang' })) { $('#nKelas', el).value = st.data.kelas_id; $('#nMapel', el).value = st.data.mata_pelajaran; st.kelas = st.data.kelas_id; st.mapel = st.data.mata_pelajaran; return; }
    if (st.key !== key) { st.edits = {}; st.data = null; }
    st.key = key;
    // Render instan dari data bootstrap (nilai semester aktif), lalu segarkan dari server
    if (!st.data) {
      var idx = {}; (B().nilai || []).forEach(function (n) { if (n.kelas_id === st.kelas && n.mata_pelajaran === st.mapel) idx[n.NIS] = n; });
      var siswa = (B().siswa || []).filter(function (s) { return s.kelas_id === st.kelas && (s.status || 'Aktif') === 'Aktif'; }).sort(function (a, b) { return a.nama_lengkap.localeCompare(b.nama_lengkap); });
      st.data = { kelas_id: st.kelas, mata_pelajaran: st.mapel, rows: siswa.map(function (s) { var n = idx[s.NIS] || {}; return { NIS: s.NIS, nama: s.nama_lengkap, foto: s.foto_profil_url, nilai_harian: n.nilai_harian === undefined ? '' : n.nilai_harian, nilai_uts: n.nilai_uts === undefined ? '' : n.nilai_uts, nilai_uas: n.nilai_uas === undefined ? '' : n.nilai_uas, nilai_akhir: n.nilai_akhir === undefined ? '' : n.nilai_akhir, catatan: n.catatan || '' }; }) };
      this.table(el);
    }
    swr('nilai:' + key, 'nilai.list', { kelas_id: st.kelas, mata_pelajaran: st.mapel }, function (d) { if (st.key !== key) return; st.data = d; self.table(el); }, { fresh: 20000, force: !!force, silent: true });
  },
  table: function (el) {
    var st = this.st, self = this, rows = (st.data && st.data.rows) || [];
    var withAk = rows.map(function (r) { return { r: r, ak: akhirOf(self.val(r, 'nilai_harian'), self.val(r, 'nilai_uts'), self.val(r, 'nilai_uas')) }; });
    var rem = withAk.filter(function (x) { return x.ak !== '' && x.ak < kkm(); }), predA = withAk.filter(function (x) { return predikatOf(x.ak) === 'A'; });
    $('#nChips', el).innerHTML = [['semua', 'Semua Siswa (' + rows.length + ')'], ['remedial', 'Perlu Remedial (' + rem.length + ')'], ['a', 'Predikat A (' + predA.length + ')'], ['kosong', 'Belum Dinilai (' + withAk.filter(function (x) { return x.ak === ''; }).length + ')']].map(function (c) { return '<button class="chip ' + (st.filter === c[0] ? 'on' : '') + '" data-f="' + c[0] + '">' + c[1] + '</button>'; }).join('');
    var list = withAk.filter(function (x) { return st.filter === 'remedial' ? x.ak !== '' && x.ak < kkm() : st.filter === 'a' ? predikatOf(x.ak) === 'A' : st.filter === 'kosong' ? x.ak === '' : true; });
    var cell = function (r, k) { var v = self.val(r, k), ch = st.edits[r.NIS] && st.edits[r.NIS][k] !== undefined; return '<input class="cell' + (ch ? ' changed' : '') + (v !== '' && Number(v) < kkm() ? ' low' : '') + '" inputmode="decimal" data-nis="' + esc(r.NIS) + '" data-k="' + k + '" value="' + esc(v) + '" aria-label="' + k + ' ' + esc(r.nama) + '">'; };
    $('#nTable', el).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>Nama Lengkap & NIS</th><th class="tc col-hl">Harian / Tugas (' + cfg('BOBOT_HARIAN', 40) + '%)</th><th class="tc">UTS (' + cfg('BOBOT_UTS', 30) + '%)</th><th class="tc">UAS (' + cfg('BOBOT_UAS', 30) + '%)</th><th class="tc col-hl">Nilai Akhir</th><th class="tc">Predikat</th><th>Status Kelulusan</th></tr></thead><tbody>' +
      list.map(function (x, i) { var r = x.r; return '<tr class="' + (x.ak !== '' && x.ak < kkm() ? 'warnrow' : '') + '"><td class="muted">' + (i + 1) + '</td><td><div class="who">' + avatar(r.nama, r.foto) + '<div><b' + (x.ak !== '' && x.ak < kkm() ? ' class="red"' : '') + '>' + esc(r.nama) + '</b><small>NIS: ' + esc(r.NIS) + ' • ' + esc(kelasNama(st.kelas)) + '</small></div></div></td><td class="tc col-hl">' + cell(r, 'nilai_harian') + '</td><td class="tc">' + cell(r, 'nilai_uts') + '</td><td class="tc">' + cell(r, 'nilai_uas') + '</td><td class="tc col-hl" data-akhir>' + self.akhirCell(x.ak) + '</td><td class="tc" data-pred>' + self.predCell(x.ak) + '</td><td data-stat>' + self.statCell(x.ak) + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="pager"><div>Menampilkan <b>' + list.length + '</b> dari <b>' + rows.length + '</b> siswa terdaftar • <span class="muted">Enter/↓ pindah ke baris berikutnya</span></div></div>' : emptyHtml('Tidak ada siswa aktif di kelas ini', '', 'users');
    this.kpis(el, withAk); this.bar(el); this.side(el);
  },
  kpis: function (el, withAk) {
    var st = this.st, n = withAk.filter(function (x) { return x.ak !== ''; }), tot = withAk.length;
    var avg = n.length ? n.reduce(function (a, x) { return a + x.ak; }, 0) / n.length : null, tuntas = n.filter(function (x) { return x.ak >= kkm(); }).length;
    var dirty = Object.keys(st.edits).length;
    $('#nKpi', el).innerHTML = kpi('Total Siswa Dinilai', n.length + ' / ' + tot + '<small>Siswa</small>', '<span class="amber">' + (n.length === tot && tot ? '100% Terdata Lengkap' : (tot - n.length) + ' belum lengkap') + '</span><div class="xs muted mt8">' + esc(kelasNama(st.kelas)) + ' • Semester ' + esc(cfg('SEMESTER', '')) + '</div>', 'user-pen') +
      kpi('Rata-rata Nilai Kelas', avg == null ? '-' : fmtN(avg) + '<small>/ 100</small>', 'KKM Sekolah: ' + kkm(), 'trending-up', 'amber') +
      kpi('Tingkat Ketuntasan', (n.length ? fmtN(pct(tuntas, n.length)) : '-') + '<small>%</small>', '<span class="amber">● ' + (n.length - tuntas) + ' siswa memerlukan remedial</span>', 'award') +
      kpi('Status Sinkronisasi', dirty ? '<span style="font-size:18px" class="amber">● ' + dirty + ' belum disimpan</span>' : '<span style="font-size:18px">● Terkoneksi Sheets</span>', 'Tersimpan otomatis ke Google Sheets saat disimpan', 'refresh-cw', dirty ? 'red' : 'green');
  },
  bar: function (el) { var n = Object.keys(this.st.edits).length; $('#nBar', el).hidden = !n; $('#nBarInfo', el).textContent = n + ' nilai siswa telah diubah pada sesi ini'; this.kpis(el, (this.st.data.rows || []).map(function (r) { return { r: r, ak: akhirOf(this.val(r, 'nilai_harian'), this.val(r, 'nilai_uts'), this.val(r, 'nilai_uas')) }; }, this)); },
  side: function (el) {
    var st = this.st, self = this, rows = (st.data && st.data.rows) || [];
    var ak = rows.map(function (r) { return { r: r, a: akhirOf(self.val(r, 'nilai_harian'), self.val(r, 'nilai_uts'), self.val(r, 'nilai_uas')) }; }).filter(function (x) { return x.a !== ''; });
    var groups = [['A', 'Predikat A (Nilai 90 - 100)', 'amber'], ['B', 'Predikat B (Nilai 80 - 89)', ''], ['C', 'Predikat C (Nilai ' + kkm() + ' - 79)', ''], ['D', 'Predikat D / Remedial (< ' + kkm() + ')', 'red']];
    $('#nDist', el).innerHTML = ak.length ? groups.map(function (g) { var c = ak.filter(function (x) { return predikatOf(x.a) === g[0]; }).length; return '<div class="dist-row"><div class="row between"><span class="' + (g[2] === 'red' ? 'red' : '') + '">' + g[1] + '</span><b class="' + g[2] + '">' + c + ' Siswa (' + Math.round(pct(c, ak.length)) + '%)</b></div><div class="bar"><i class="' + g[2] + '" style="width:' + pct(c, ak.length) + '%;' + (g[0] === 'C' ? 'background:#C8C4F0' : '') + '"></i></div></div>'; }).join('') : emptyHtml('Belum ada nilai', '', 'chart-column');
    var rem = ak.filter(function (x) { return x.a < kkm(); });
    $('#nRemCnt', el).textContent = rem.length + ' Siswa';
    $('#nRem', el).innerHTML = rem.length ? '<div class="note bad">' + ic('calendar-clock') + '<div><b>Evaluasi ulang kompetensi ' + esc(st.mapel) + '</b><div class="small">Jadwalkan remedial & kabari orang tua.</div></div></div><div class="xs b muted mt12">DAFTAR SISWA REMEDIAL:</div><div class="row wrap gap4 mt8">' + rem.map(function (x) { return '<span class="bdg">' + esc(x.r.nama) + ' (' + fmtN(x.a) + ')</span>'; }).join('') + '</div>' +
      '<button class="btn btn-accent btn-block mt16" id="nRemWa">' + ic('send') + 'Kirim Undangan Remedial via WhatsApp</button>' : emptyHtml('Tidak ada siswa remedial', 'Semua siswa tuntas pada mapel ini.', 'party-popper');
    if ($('#nRemWa', el)) $('#nRemWa', el).onclick = function () {
      var pen = rem.map(function (x) { var s = siswaByNIS(x.r.NIS) || {}; return s.no_wa_ortu ? { hp: s.no_wa_ortu, nama: s.nama_ortu || 'Orang Tua ' + s.nama_lengkap, vars: { siswa: s.nama_lengkap, nilai: fmtN(x.a), mapel: st.mapel, kelas: kelasNama(s.kelas_id) } } : null; }).filter(Boolean);
      sessionStorage.setItem('blastPenerima', JSON.stringify(pen));
      sessionStorage.setItem('blastPesan', 'Yth. {nama},\nAnanda *{siswa}* memperoleh nilai {nilai} pada *{mapel}* (KKM ' + kkm() + '). Ananda dijadwalkan mengikuti remedial; mohon dukungan Bapak/Ibu.\n— {institusi}');
      go('notifikasi', 'blast');
    };
  },
  save: async function (el, btn) {
    var st = this.st, self = this, nis = Object.keys(st.edits);
    if (!nis.length) return;
    var rows = nis.map(function (n) { var r = st.data.rows.filter(function (x) { return x.NIS === n; })[0]; return { NIS: n, nilai_harian: self.val(r, 'nilai_harian'), nilai_uts: self.val(r, 'nilai_uts'), nilai_uas: self.val(r, 'nilai_uas'), catatan: r.catatan }; });
    if ($$('input.cell.err', el).length) return toast('Perbaiki nilai yang tidak valid (0–100).', 'bad');
    btnBusy(btn, true);
    var r = await api('nilai.saveBatch', { kelas_id: st.kelas, mata_pelajaran: st.mapel, rows: rows, kirimNotif: $('#nNotif', el).checked });
    btnBusy(btn, false);
    if (!toastRes(r)) return;
    r.data.rows.forEach(function (n) { var x = st.data.rows.filter(function (y) { return y.NIS === n.NIS; })[0]; if (x) Object.assign(x, { nilai_harian: n.nilai_harian, nilai_uts: n.nilai_uts, nilai_uas: n.nilai_uas, nilai_akhir: n.nilai_akhir }); });
    // perbarui bootstrap lokal agar dashboard & laporan langsung sinkron
    var bn = B().nilai || []; r.data.rows.forEach(function (n) { var i = bn.findIndex(function (y) { return y.NIS === n.NIS && y.mata_pelajaran === n.mata_pelajaran; }); if (i > -1) bn[i] = Object.assign(bn[i], n); else bn.push(n); });
    st.edits = {}; Store.del(userKey('nilai:' + st.key));
    this.table(el); Pages.guru.dashboard.dirty = true; Pages.guru.laporan.dirty = true;
    afterWrite();
  },
  exportCsv: function () {
    var st = this.st, self = this; if (!st.data) return;
    downloadCSV('nilai-' + kelasNama(st.kelas) + '-' + st.mapel + '.csv', ['NIS', 'Nama', 'Kelas', 'Mata Pelajaran', 'Harian', 'UTS', 'UAS', 'Nilai Akhir', 'Predikat', 'Status'],
      st.data.rows.map(function (r) { var a = akhirOf(self.val(r, 'nilai_harian'), self.val(r, 'nilai_uts'), self.val(r, 'nilai_uas')); return [r.NIS, r.nama, kelasNama(st.kelas), st.mapel, self.val(r, 'nilai_harian'), self.val(r, 'nilai_uts'), self.val(r, 'nilai_uas'), a, predikatOf(a), a === '' ? '' : a >= kkm() ? 'Tuntas' : 'Remedial']; }));
  },
  importCsv: async function (el, file) {
    if (!file) return; var st = this.st, self = this;
    var rows = parseCSV(await file.text()), n = 0;
    rows.forEach(function (o) {
      var k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase().replace(/[^a-z]/g, '')] = o[x]; });
      var nis = k.nis, r = st.data.rows.filter(function (x) { return x.NIS === nis; })[0]; if (!r) return;
      [['nilai_harian', k.harian || k.nilaiharian || k.tugas], ['nilai_uts', k.uts || k.nilaiuts], ['nilai_uas', k.uas || k.nilaiuas]].forEach(function (p) { if (p[1] !== undefined && p[1] !== '' && !isNaN(p[1])) { self.setEdit(nis, p[0], Number(p[1])); n++; } });
    });
    this.table(el);
    toast(n ? n + ' nilai dimuat dari CSV. Periksa lalu klik Simpan.' : 'Tidak ada baris cocok. Kolom wajib: NIS, Harian, UTS, UAS.', n ? 'ok' : 'warn');
  }
});

// =====================================================================
// LAPORAN & ANALITIK
// =====================================================================
registerPage('guru', 'laporan', {
  title: 'Laporan',
  st: { jenjang: '', kelas: '', mapel: '', periode: 'semester', seg: 'semua', q: '', page: 1, trend: 'mingguan', bulanRows: {} },
  init: function (el) {
    var st = this.st, self = this;
    el.innerHTML = pageHead('<span class="amber">●</span> SIAKAD SISWA Analytics Hub <span>• Tahun Ajaran ' + esc(cfg('TAHUN_AJARAN', '')) + '</span>', 'Laporan & Analitik Akademik', 'Pantau performa pembelajaran, rekapitulasi kehadiran berkala, distribusi nilai semester, dan ekspor laporan terpadu berbasis Google Sheets.',
      '<button class="btn btn-outline" id="lPrint">' + ic('printer') + 'Cetak Raport (PDF)</button><button class="btn btn-dark" id="lSheets">' + ic('sheet') + 'Ekspor Data (Excel/Sheets)</button>') +
      '<div class="card"><div class="toolbar"><div class="field"><label class="lbl">Jenjang & Tingkat</label><select class="sel" id="lJenjang"><option value="">Semua Jenjang</option><option>SD</option><option>SMP</option><option>SMA</option></select></div><div class="field"><label class="lbl">Rombel / Kelas</label><select class="sel" id="lKelas"></select></div>' +
      '<div class="field"><label class="lbl">Mata Pelajaran</label><select class="sel" id="lMapel"></select></div><div class="field"><label class="lbl">Periode Kehadiran</label><select class="sel" id="lPeriode"></select></div><button class="btn btn-dark" id="lApply">' + ic('sliders-horizontal') + 'Terapkan</button></div></div>' +
      '<div class="grid g4 mt24" id="lKpi"></div>' +
      '<div class="grid g-main-r mt24"><div class="card"><div class="card-h"><div class="grow"><h3>Tren Kehadiran Siswa</h3><p>Fluktuasi kehadiran (batas kritis ' + esc(cfg('BATAS_KEHADIRAN', 75)) + '%)</p></div><div class="tabs light" id="lTrTabs"><button data-t="mingguan">Mingguan</button><button data-t="harian">Harian</button></div></div><div class="card-b" id="lTrend"></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>Distribusi Predikat Capaian</h3><p id="lDistSub"></p></div>' + ic('chart-column') + '</div><div class="card-b" id="lDist"></div></div></div>' +
      '<div class="card mt24"><div class="card-h" style="flex-wrap:wrap"><div class="grow"><h3>Rekapitulasi Performa Akademik & Kehadiran per Siswa</h3><p>Gabungan nilai harian, UTS, UAS, dan rasio kehadiran</p></div><div class="inp-ic" style="min-width:220px">' + ic('search') + '<input class="inp" id="lQ" placeholder="Cari nama atau NIS siswa…"></div><div class="tabs light" id="lSeg"><button data-s="semua">Semua</button><button data-s="top">Top 10</button><button data-s="perhatian">Perhatian</button></div></div><div class="card-b" style="padding:12px 0 0" id="lTable"></div></div>' +
      '<div class="card card-p mt24 row wrap gap16"><span class="av lg c2" style="border-radius:12px">' + ic('refresh-ccw-dot') + '</span><div class="grow"><b>Integrasi Google Sheets & Format Dapodik</b><div class="small muted">Laporan diekspor otomatis menjadi spreadsheet baru di folder Drive SIAKAD_EXPORTS.</div></div><button class="btn btn-outline" id="lDapodik">' + ic('file-spreadsheet') + 'Rekap Format Dapodik (CSV)</button><button class="btn btn-primary" id="lSync">' + ic('arrow-left-right') + 'Sinkron Sekarang</button></div>';
    $('#lApply', el).onclick = function () { st.jenjang = $('#lJenjang', el).value; st.kelas = $('#lKelas', el).value; st.mapel = $('#lMapel', el).value; st.periode = $('#lPeriode', el).value; st.page = 1; self.compute(el); };
    ['lJenjang', 'lKelas', 'lMapel', 'lPeriode'].forEach(function (id) { $('#' + id, el).onchange = function () { $('#lApply', el).click(); }; });
    $('#lQ', el).oninput = debounce(function () { st.q = this.value.toLowerCase(); st.page = 1; self.table(el); }, 250);
    $$('#lSeg button', el).forEach(function (b) { b.onclick = function () { st.seg = b.dataset.s; st.page = 1; self.table(el); }; });
    $$('#lTrTabs button', el).forEach(function (b) { b.onclick = function () { st.trend = b.dataset.t; self.trend(el); }; });
    $('#lPrint', el).onclick = function () { window.print(); };
    $('#lSheets', el).onclick = function () { self.exportSheets(this); };
    $('#lSync', el).onclick = async function () { btnBusy(this, true); await refreshBoot(true); btnBusy(this, false); toast('Data laporan tersinkron.', 'ok'); };
    $('#lDapodik', el).onclick = function () { self.dapodik(); };
    el.addEventListener('click', function (e) { var p = e.target.closest('[data-pg]'); if (p && !p.disabled && p.closest('#lTable')) { st.page = Number(p.dataset.pg); self.table(el); } var v = e.target.closest('[data-view]'); if (v) siswaDetail(v.dataset.view); });
  },
  render: function (el) {
    var st = this.st;
    $('#lKelas', el).innerHTML = kelasOpts(st.kelas, 'Semua Kelas');
    $('#lMapel', el).innerHTML = mapelOpts(st.mapel, 'Semua Mata Pelajaran');
    var opts = '<option value="semester">Semester ' + esc(cfg('SEMESTER', '')) + ' (berjalan)</option>', d = new Date();
    for (var i = 0; i < 6; i++) { var t = new Date(d.getFullYear(), d.getMonth() - i, 1), v = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'); opts += '<option value="' + v + '">' + BULAN[t.getMonth()] + ' ' + t.getFullYear() + '</option>'; }
    $('#lPeriode', el).innerHTML = opts; $('#lPeriode', el).value = st.periode;
    this.compute(el);
  },
  compute: async function (el) {
    var st = this.st, self = this, b = B();
    var siswa = (b.siswa || []).filter(function (s) { return (s.status || 'Aktif') === 'Aktif' && (!st.kelas || s.kelas_id === st.kelas) && (!st.jenjang || s.jenjang === st.jenjang); });
    var rekap = b.rekapAbsen || {};
    if (st.periode !== 'semester') {
      var bl = st.periode;
      if (!st.bulanRows[bl]) {
        $('#lTable', el).innerHTML = '<div style="padding:20px"><div class="sk" style="height:200px"></div></div>';
        var last = new Date(Number(bl.substring(0, 4)), Number(bl.substring(5, 7)), 0).getDate();
        var r = await api('absensi.list', { dari: bl + '-01', sampai: bl + '-' + String(last).padStart(2, '0') });
        st.bulanRows[bl] = r.success ? r.data.rows : [];
      }
      var rows = st.bulanRows[bl], hariK = {}, per = {};
      rows.forEach(function (a) { (hariK[a.kelas_id] = hariK[a.kelas_id] || {})[a.tanggal] = 1; var p = per[a.NIS] = per[a.NIS] || { H: 0, I: 0, S: 0, A: 0, T: 0 }; var k = a.status.charAt(0); if (p[k] !== undefined) p[k]++; if (a.terlambat === 'YA') p.T++; });
      rekap = {};
      siswa.forEach(function (s) { var p = per[s.NIS] || { H: 0, I: 0, S: 0, A: 0, T: 0 }, hari = Object.keys(hariK[s.kelas_id] || {}).length, n = p.H + p.I + p.S + p.A; rekap[s.NIS] = { H: p.H, I: p.I, S: p.S, A: p.A + Math.max(0, hari - n), T: p.T, hari: hari, persen: hari ? Math.round(p.H / hari * 1000) / 10 : null }; });
      st.bulanDaily = rows;
    }
    var nilai = (b.nilai || []).filter(function (n) { return !st.mapel || n.mata_pelajaran === st.mapel; });
    var bySiswa = {};
    nilai.forEach(function (n) { var x = bySiswa[n.NIS] = bySiswa[n.NIS] || { h: [], u: [], a: [], ak: [] }; if (n.nilai_harian !== '') x.h.push(Number(n.nilai_harian)); if (n.nilai_uts !== '') x.u.push(Number(n.nilai_uts)); if (n.nilai_uas !== '') x.u.push(Number(n.nilai_uas)); if (n.nilai_akhir !== '') x.ak.push(Number(n.nilai_akhir)); });
    var avg = function (a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : ''; };
    var batas = Number(cfg('BATAS_KEHADIRAN', 75));
    st.rows = siswa.map(function (s) {
      var x = bySiswa[s.NIS] || { h: [], u: [], ak: [] }, r = rekap[s.NIS] || { persen: null, H: 0, hari: 0 }, ak = avg(x.ak);
      var rek = ak !== '' && ak < kkm() && r.persen != null && r.persen < batas ? ['bad', 'triangle-alert', 'Panggilan orang tua & remedial'] : ak !== '' && ak < kkm() ? ['bad', 'asterisk', 'Konseling BK & remedial terjadwal'] : r.persen != null && r.persen < batas ? ['warn', 'calendar-x', 'Pembinaan kedisiplinan kehadiran'] : ak !== '' && ak >= 93 ? ['amber', 'trophy', 'Rekomendasi olimpiade / OSN'] : ak !== '' && ak >= 85 ? ['ok', 'circle-check', 'Pertahankan konsistensi belajar'] : ak !== '' ? ['info', 'trending-up', 'Progres stabil, tingkatkan modul mandiri'] : ['', 'circle-dashed', 'Nilai belum lengkap'];
      return { s: s, hadir: r.persen, H: r.H, hari: r.hari, harian: avg(x.h), ujian: avg(x.u), akhir: ak, pred: predikatOf(ak), rek: rek, perhatian: (ak !== '' && ak < kkm()) || (r.persen != null && r.persen < batas) };
    });
    // KPI
    var hd = st.rows.filter(function (r) { return r.hadir != null; }), ak = st.rows.filter(function (r) { return r.akhir !== ''; });
    var rataHadir = hd.length ? avg(hd.map(function (r) { return r.hadir; })) : null, idx = ak.length ? avg(ak.map(function (r) { return r.akhir; })) : null;
    var tuntas = ak.filter(function (r) { return r.akhir >= kkm(); }).length, diAtas = hd.filter(function (r) { return r.hadir >= batas; }).length;
    var mat = (b.materi || []).filter(function (m) { return !st.kelas || !m.kelas_id || m.kelas_id === st.kelas; }), akses = mat.reduce(function (a, m) { return a + Number(m.akses || 0); }, 0);
    var efek = mat.length && siswa.length ? Math.min(100, akses / (mat.length * siswa.length) * 100) : 0;
    var perh = st.rows.filter(function (r) { return r.perhatian; });
    $('#lKpi', el).innerHTML = kpi('Rata-rata Kehadiran', rataHadir == null ? '-' : fmtN(rataHadir) + '<small>%</small>', '<div class="bar"><i style="width:' + (rataHadir || 0) + '%"></i></div><div class="mt8">' + diAtas + ' dari ' + hd.length + ' siswa di atas ambang ' + batas + '%</div>', 'calendar-check') +
      kpi('Indeks Nilai Kelas', idx == null ? '-' : fmtN(idx) + '<small>/ 100</small>', '<div class="row between xs"><span>Target KKM: ' + kkm() + '</span><span class="amber b">' + fmtN(pct(tuntas, ak.length || 1)) + '% Tuntas</span></div><div class="bar mt8"><i class="amber" style="width:' + pct(tuntas, ak.length || 1) + '%"></i></div>', 'sparkles', 'amber') +
      kpi('Efektivitas Modul', fmtN(efek) + '<small>%</small> <span class="pill">' + mat.length + ' Modul</span>', fmtN(akses) + ' akses siswa • rasio siswa membuka materi', 'book-open-check') +
      kpi('Perlu Pendampingan', '<span class="red">' + perh.length + '</span><small>Siswa</small>', '<span class="red b">● Tindakan khusus diperlukan</span><div class="xs mt8">' + perh.filter(function (r) { return r.hadir != null && r.hadir < batas; }).length + ' presensi &lt;' + batas + '% • ' + perh.filter(function (r) { return r.akhir !== '' && r.akhir < kkm(); }).length + ' nilai &lt; KKM</div>', 'triangle-alert', 'red');
    // Distribusi
    var dist = { A: 0, B: 0, C: 0, D: 0 }; ak.forEach(function (r) { dist[r.pred]++; });
    $('#lDistSub', el).textContent = 'Sebaran nilai akhir gabungan ' + ak.length + ' siswa';
    $('#lDist', el).innerHTML = [['A', 'Predikat A (Nilai 90 - 100)', ''], ['B', 'Predikat B (Nilai 80 - 89)', ''], ['C', 'Predikat C (Nilai ' + kkm() + ' - 79)', 'amber'], ['D', 'Predikat D / Perlu Remedi (<' + kkm() + ')', 'red']].map(function (g) { return '<div class="dist-row"><div class="row between"><span class="' + (g[2] === 'red' ? 'red' : '') + '">' + g[1] + '</span><span class="' + (g[2] === 'red' ? 'red' : '') + '">' + fmtN(pct(dist[g[0]], ak.length || 1)) + '% (' + dist[g[0]] + ' Siswa)</span></div><div class="bar"><i class="' + g[2] + '" style="width:' + pct(dist[g[0]], ak.length || 1) + '%"></i></div></div>'; }).join('') +
      (idx != null ? '<div class="note mt16">' + ic('badge-check') + '<div><b>Capaian Mutu:</b> nilai rerata ' + esc(st.kelas ? kelasNama(st.kelas) : 'seluruh kelas') + ' saat ini (' + fmtN(idx) + ') ' + (idx >= kkm() ? 'telah melampaui KKM sebesar +' + fmtN(idx - kkm()) + ' poin.' : 'masih di bawah KKM ' + fmtN(kkm() - idx) + ' poin.') + '</div></div>' : '');
    this.trend(el); this.table(el);
  },
  trend: function (el) {
    var st = this.st, t = B().trend || {};
    $$('#lTrTabs button', el).forEach(function (x) { x.classList.toggle('on', x.dataset.t === st.trend); });
    var batas = Number(cfg('BATAS_KEHADIRAN', 75)), html;
    if (st.periode !== 'semester' && st.bulanDaily) {
      var per = {}, tot = (B().siswa || []).filter(function (s) { return (s.status || 'Aktif') === 'Aktif' && (!st.kelas || s.kelas_id === st.kelas); }).length;
      st.bulanDaily.forEach(function (a) { if (st.kelas && a.kelas_id !== st.kelas) return; per[a.tanggal] = (per[a.tanggal] || 0) + (a.status === 'Hadir' ? 1 : 0); });
      var ks = Object.keys(per).sort();
      html = ks.length ? lineChart({ labels: ks.map(function (k) { return String(Number(k.substring(8))); }), values: ks.map(function (k) { return tot ? Math.round(per[k] / tot * 1000) / 10 : null; }), min: 40, max: 100, suffix: '%', ref: { y: batas, label: 'Batas Kritis (' + batas + '%)' }, maxLabels: 12 }) : emptyHtml('Tidak ada data bulan ini', '', 'chart-line');
    } else if (st.trend === 'harian') {
      var hr = t.harian || [];
      html = lineChart({ labels: hr.map(function (x) { return x.hari.substring(0, 3) + ' ' + Number(x.tanggal.substring(8)); }), values: hr.map(function (x) { return x.persen; }), min: 0, max: 100, suffix: '%', ref: { y: batas, label: 'Batas Kritis (' + batas + '%)' } });
    } else {
      var mg = t.mingguan || [];
      html = mg.length ? lineChart({ labels: mg.map(function (x) { return x.label; }), values: mg.map(function (x) { return x.persen; }), min: 50, max: 100, suffix: '%', ref: { y: batas, label: 'Batas Kritis Kehadiran (' + batas + '%)' }, highlight: mg.length - 1 }) : emptyHtml('Belum ada data', '', 'chart-line');
    }
    var sum = { H: 0, I: 0, S: 0, A: 0 }; (t.mingguan || []).forEach(function (x) { sum.H += x.H; sum.I += x.I; sum.S += x.S; sum.A += x.A; });
    var all = sum.H + sum.I + sum.S + sum.A || 1;
    $('#lTrend', el).innerHTML = html + '<div class="legend mt12" style="background:var(--surface-2);padding:8px 12px;border-radius:8px;justify-content:space-between"><span><i style="background:#1E3A5F"></i>Hadir: ' + fmtN(pct(sum.H, all)) + '%</span><span><i style="background:#F5A623"></i>Izin: ' + fmtN(pct(sum.I, all)) + '%</span><span><i style="background:#7D93B5"></i>Sakit: ' + fmtN(pct(sum.S, all)) + '%</span><span><i style="background:#DC2626"></i>Alpha: ' + fmtN(pct(sum.A, all)) + '%</span></div>';
  },
  filteredRows: function () {
    var st = this.st, rows = (st.rows || []).filter(function (r) { return !st.q || (r.s.nama_lengkap + ' ' + r.s.NIS).toLowerCase().indexOf(st.q) > -1; });
    if (st.seg === 'top') rows = rows.filter(function (r) { return r.akhir !== ''; }).sort(function (a, b) { return b.akhir - a.akhir; }).slice(0, 10);
    else if (st.seg === 'perhatian') rows = rows.filter(function (r) { return r.perhatian; });
    else rows = rows.slice().sort(function (a, b) { return a.s.nama_lengkap.localeCompare(b.s.nama_lengkap); });
    return rows;
  },
  table: function (el) {
    var st = this.st, rows = this.filteredRows(), p = paginate(rows, st.page, 10); st.page = p.page;
    var perh = (st.rows || []).filter(function (r) { return r.perhatian; }).length;
    $$('#lSeg button', el).forEach(function (b) { b.classList.toggle('on', b.dataset.s === st.seg); b.innerHTML = { semua: 'Semua (' + (st.rows || []).length + ')', top: 'Top 10', perhatian: '<span class="red">Perhatian (' + perh + ')</span>' }[b.dataset.s]; });
    var batas = Number(cfg('BATAS_KEHADIRAN', 75));
    $('#lTable', el).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No.</th><th>Nama Siswa & NIS</th><th>Kehadiran</th><th class="tc">Rerata Tugas</th><th class="tc hide-m">UTS / UAS</th><th class="tc">Nilai Akhir</th><th>Predikat</th><th class="hide-m">Rekomendasi / Tindak Lanjut</th><th class="tr">Aksi</th></tr></thead><tbody>' + p.rows.map(function (r, i) {
      var bad = r.perhatian, s = r.s;
      return '<tr class="' + (bad ? 'warnrow' : '') + '"><td class="mono ' + (bad ? 'red' : 'muted') + '">' + String(p.from + i).padStart(2, '0') + '</td><td><div class="who">' + avatar(s.nama_lengkap, s.foto_profil_url, bad ? 'red' : '') + '<div><b class="' + (bad ? 'red' : '') + '">' + esc(s.nama_lengkap) + '</b><small>NIS: ' + esc(s.NIS) + ' • ' + esc(kelasNama(s.kelas_id)) + '</small></div></div></td>' +
        '<td>' + (r.hadir == null ? '-' : '<span class="bdg ' + (r.hadir < batas ? 'bad' : 'info') + '">' + fmtN(r.hadir) + '% <span class="xs" style="font-weight:500">(' + r.H + '/' + r.hari + ')</span></span>') + '</td><td class="tc num">' + fmtN(r.harian) + '</td><td class="tc num hide-m">' + fmtN(r.ujian) + '</td><td class="tc"><b style="font-size:16px" class="' + (r.akhir !== '' && r.akhir < kkm() ? 'red' : '') + '">' + fmtN(r.akhir) + '</b></td>' +
        '<td>' + (r.pred ? '<span class="bdg ' + (r.pred === 'D' ? 'bad' : r.pred === 'A' ? 'amber' : 'info') + '">' + r.pred + ' • ' + (r.pred === 'D' ? 'Remedi' : 'Tuntas') + '</span>' : '-') + '</td><td class="hide-m small"><span class="' + (r.rek[0] === 'bad' ? 'red' : r.rek[0] === 'amber' ? 'amber' : '') + '">' + ic(r.rek[1]) + ' ' + esc(r.rek[2]) + '</span></td>' +
        '<td class="tr nowrap">' + (bad && s.no_wa_ortu ? '<a class="btn btn-accent btn-xs" target="_blank" rel="noopener" href="' + waLink(s.no_wa_ortu) + '?text=' + encodeURIComponent('Yth. ' + (s.nama_ortu || 'Bapak/Ibu') + ', kami dari ' + cfg('NAMA_SEKOLAH', 'sekolah') + ' ingin berdiskusi terkait perkembangan ' + s.nama_lengkap + '.') + '">' + ic('message-circle') + 'WA Ortu</a>' : '<button class="btn-ic" data-view="' + esc(s.NIS) + '">' + ic('eye') + '</button>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' + pagerHtml(p, 'siswa') : emptyHtml('Tidak ada data', 'Ubah filter laporan.', 'chart-no-axes-column');
  },
  exportRows: function () {
    return this.filteredRows().map(function (r) { return [r.s.NIS, r.s.NISN, r.s.nama_lengkap, kelasNama(r.s.kelas_id), r.hadir == null ? '' : r.hadir, r.H, r.hari, r.harian === '' ? '' : Math.round(r.harian * 10) / 10, r.ujian === '' ? '' : Math.round(r.ujian * 10) / 10, r.akhir === '' ? '' : Math.round(r.akhir * 10) / 10, r.pred, r.rek[2]]; });
  },
  exportSheets: async function (btn) {
    var H = ['NIS', 'NISN', 'Nama', 'Kelas', 'Kehadiran %', 'Hadir', 'Hari Efektif', 'Rerata Harian', 'Rerata UTS/UAS', 'Nilai Akhir', 'Predikat', 'Rekomendasi'], rows = this.exportRows(), st = this.st;
    var m = modal({ title: 'Ekspor Laporan', sub: rows.length + ' baris sesuai filter', size: 'sm', body: '<div class="grid" style="gap:10px"><button class="btn btn-primary btn-block" id="exSheets">' + ic('sheet') + 'Buat Google Sheets (Drive)</button><button class="btn btn-outline btn-block" id="exCsv">' + ic('file-down') + 'Unduh CSV (Excel)</button></div><div id="exRes" class="mt12"></div>' });
    $('#exCsv', m.el).onclick = function () { downloadCSV('laporan-akademik-' + todayStr() + '.csv', H, rows); m.close(); };
    $('#exSheets', m.el).onclick = async function () {
      btnBusy(this, true);
      var r = await api('laporan.export', { judul: 'Laporan Akademik ' + (st.kelas ? kelasNama(st.kelas) : 'Semua Kelas') + (st.mapel ? ' — ' + st.mapel : ''), headers: H, rows: rows });
      btnBusy(this, false);
      $('#exRes', m.el).innerHTML = r.success ? '<div class="note ok">' + ic('circle-check') + '<div>Berhasil! <a href="' + esc(r.data.url) + '" target="_blank" rel="noopener"><b>Buka spreadsheet</b></a></div></div>' : '<div class="note bad">' + esc(r.message) + '</div>';
    };
  },
  dapodik: function () {
    var rows = (this.st.rows || []).map(function (r) { var s = r.s; return [s.NISN, s.NIS, s.nama_lengkap, s.jenis_kelamin, s.tempat_lahir, s.tanggal_lahir, kelasNama(s.kelas_id), s.jenjang, s.nama_ortu, s.no_wa_ortu, s.alamat, r.hadir == null ? '' : r.hadir, r.akhir === '' ? '' : Math.round(r.akhir * 10) / 10]; });
    downloadCSV('rekap-dapodik-' + todayStr() + '.csv', ['NISN', 'NIPD', 'Nama', 'JK', 'Tempat Lahir', 'Tanggal Lahir', 'Rombel', 'Jenjang', 'Nama Wali', 'HP Wali', 'Alamat', 'Kehadiran %', 'Rata Nilai'], rows);
  }
});

// =====================================================================
// PENGATURAN
// =====================================================================
registerPage('guru', 'pengaturan', {
  title: 'Pengaturan',
  st: { tab: 'sekolah' },
  init: function (el) {
    var self = this;
    var sa = isSA();
    if (!sa && ['kelas', 'mapel', 'pengumuman'].indexOf(this.st.tab) === -1) this.st.tab = 'kelas';
    el.innerHTML = pageHead((sa ? 'Super Admin' : 'Panel Guru') + ' <span>// Pengaturan Sistem</span>', 'Pengaturan', sa ? 'Identitas sekolah, parameter akademik, data guru, kelas, mata pelajaran, pengumuman, dan log aktivitas.' : 'Kelas, mata pelajaran, dan pengumuman sekolah. Pengaturan sistem lainnya dikelola Super Admin.') +
      '<div class="tabs" id="pTabs">' + (sa ? '<button data-t="sekolah">' + ic('school') + 'Sekolah</button><button data-t="akademik">' + ic('graduation-cap') + 'Akademik</button><button data-t="guru">' + ic('contact') + 'Guru</button>' : '') + '<button data-t="kelas">' + ic('door-open') + 'Kelas</button><button data-t="mapel">' + ic('book-marked') + 'Mata Pelajaran</button><button data-t="pengumuman">' + ic('megaphone') + 'Pengumuman</button>' + (sa ? '<button data-t="log">' + ic('scroll-text') + 'Log Aktivitas</button><button data-t="sistem">' + ic('server-cog') + 'Sistem</button>' : '') + '</div><div id="pBody" class="mt16"></div>';
    $$('#pTabs button', el).forEach(function (b) { b.onclick = function () { self.st.tab = b.dataset.t; self.render(el); }; });
  },
  render: function (el, param) {
    var st = this.st; if (param) { st.tab = param; }
    if (!isSA() && ['kelas', 'mapel', 'pengumuman'].indexOf(st.tab) === -1) st.tab = 'kelas';
    $$('#pTabs button', el).forEach(function (b) { b.classList.toggle('on', b.dataset.t === st.tab); });
    var box = $('#pBody', el), fn = this['t_' + st.tab]; fn.call(this, box, el);
  },
  cfgForm: function (box, fields, title, sub) {
    var c = B().cfg || {};
    box.innerHTML = '<div class="card"><div class="card-h"><div class="grow"><h3>' + esc(title) + '</h3><p>' + esc(sub) + '</p></div></div><div class="card-b"><form class="grid-form" id="cfgF">' + fields.map(function (f) {
      var v = c[f.k] == null ? '' : c[f.k];
      var input = f.opts ? '<select class="sel" name="' + f.k + '">' + f.opts.map(function (o) { var val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('') + '</select>' : '<input class="inp' + (f.mono ? ' mono' : '') + '" name="' + f.k + '" type="' + (f.type || 'text') + '" value="' + esc(v) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '>';
      return '<div class="field ' + (f.c || 'c6') + '"><label>' + esc(f.l) + '</label>' + input + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</div>';
    }).join('') + '<div class="field row between wrap"><span class="small muted" id="cfgExtra"></span><button class="btn btn-dark" type="submit">' + ic('save') + 'Simpan Pengaturan</button></div></form></div></div>';
    $('#cfgF', box).onsubmit = async function (e) {
      e.preventDefault(); var btn = $('button[type=submit]', this); btnBusy(btn, true);
      var r = await api('config.save', { pairs: formData(this) }); btnBusy(btn, false);
      if (toastRes(r)) { B().cfg = Object.assign(B().cfg || {}, r.data); markAllDirty(false); afterWrite(); }
    };
  },
  t_sekolah: function (box) {
    this.cfgForm(box, [{ k: 'NAMA_SEKOLAH', l: 'Nama Sekolah', c: 'c6' }, { k: 'ALAMAT_SEKOLAH', l: 'Alamat Sekolah', c: 'c6' }, { k: 'LOGO_URL', l: 'URL Logo (opsional)', c: '', ph: 'https://…/logo.png', hint: 'Kosongkan untuk logo bawaan.' },
      { k: 'JAM_MASUK', l: 'Batas Jam Masuk Siswa', c: 'c4', type: 'time' }, { k: 'JAM_PULANG', l: 'Jam Pulang Siswa', c: 'c4', type: 'time' },
      { k: 'AUTO_ALPHA_JAM', l: 'Tandai Alpha otomatis pukul', c: 'c4', type: 'time', hint: 'Kosong = nonaktif. Hanya hari Senin–Jumat bila ada kehadiran.' }], 'Identitas Sekolah & Jam Sekolah', 'Titik lokasi absensi (multi-lokasi, radius, kunci perangkat) diatur di menu Lokasi & Geofence.');
    $('#cfgExtra', box).innerHTML = '<a class="btn btn-soft btn-sm" href="#/lokasi">' + ic('map-pinned') + 'Atur Lokasi & Geofence</a>';
  },
  t_akademik: function (box) {
    this.cfgForm(box, [{ k: 'TAHUN_AJARAN', l: 'Tahun Ajaran Aktif', c: 'c4', ph: '2026/2027' }, { k: 'SEMESTER', l: 'Semester Aktif', c: 'c4', opts: ['Ganjil', 'Genap'] }, { k: 'KKM', l: 'KKM (batas tuntas)', c: 'c4', type: 'number' },
      { k: 'SEMESTER_MULAI', l: 'Tanggal Mulai Semester', c: 'c6', type: 'date' }, { k: 'SEMESTER_SELESAI', l: 'Tanggal Akhir Semester', c: 'c6', type: 'date' },
      { k: 'BOBOT_HARIAN', l: 'Bobot Harian (%)', c: 'c4', type: 'number' }, { k: 'BOBOT_UTS', l: 'Bobot UTS (%)', c: 'c4', type: 'number' }, { k: 'BOBOT_UAS', l: 'Bobot UAS (%)', c: 'c4', type: 'number', hint: 'Total bobot harus 100%.' },
      { k: 'BATAS_KEHADIRAN', l: 'Batas Kehadiran Perhatian (%)', c: 'c4', type: 'number' }, { k: 'EMAIL_DOMAIN_SISWA', l: 'Domain Email Otomatis Siswa', c: 'c4' }, { k: 'MATERI_MAKS_MB', l: 'Batas Upload Materi (MB)', c: 'c4', type: 'number' }], 'Parameter Akademik', 'Dipakai untuk kalkulasi nilai akhir, predikat, dan rekap kehadiran.');
  },
  t_guru: function (box) {
    var list = B().guru || [];
    box.innerHTML = '<div class="card"><div class="card-h"><div class="grow"><h3>Data Guru</h3><p>' + list.length + ' guru • peran & hak akses diatur di <a href="#/akun" class="b">Kelola Akun</a></p></div><button class="btn btn-dark btn-sm" id="gAdd">' + ic('user-plus') + 'Tambah Guru</button></div><div class="card-b" style="padding:12px 0 0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nama Guru</th><th>NUPTK / NIP</th><th>Mapel</th><th class="hide-m">WhatsApp</th><th>Status</th><th class="tr">Aksi</th></tr></thead><tbody>' +
      list.map(function (g) { return '<tr><td><div class="who">' + avatar(g.nama_lengkap, g.foto_profil_url) + '<div><b>' + esc(g.nama_lengkap) + '</b><small>' + esc(g.email) + '</small></div></div></td><td class="mono">' + esc(g.NUPTK) + '</td><td>' + esc(g.mata_pelajaran || '-') + '<div class="xs muted">' + esc(g.jabatan || '') + '</div></td><td class="hide-m">' + esc(g.no_wa || '-') + '</td><td>' + (g.status === 'Aktif' ? '<span class="bdg ok">Aktif</span>' : '<span class="bdg">' + esc(g.status) + '</span>') + '</td><td class="tr nowrap"><button class="btn-ic" data-g="' + esc(g.NUPTK) + '" data-op="edit">' + ic('pencil') + '</button><button class="btn-ic" data-g="' + esc(g.NUPTK) + '" data-op="pw" title="Reset password">' + ic('key-round') + '</button><button class="btn-ic" data-g="' + esc(g.NUPTK) + '" data-op="del">' + ic('trash-2') + '</button></td></tr>'; }).join('') + '</tbody></table></div></div></div>';
    $('#gAdd', box).onclick = function () { guruForm(); };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-g]'); if (!t) return; var g = guruById(t.dataset.g);
      if (t.dataset.op === 'edit') guruForm(g);
      else if (t.dataset.op === 'pw') { if (!await confirmBox('Reset password ' + g.nama_lengkap + '?')) return; var r = await api('siswa.resetPassword', { NUPTK: g.NUPTK, kirim: true }); if (toastRes(r)) kredensialModal(g.nama_lengkap, r.data.email, r.data.password); }
      else if (t.dataset.op === 'del') { if (!await confirmBox('Hapus guru ' + g.nama_lengkap + ' beserta akunnya?', { danger: true, ok: 'Hapus' })) return; var r2 = await api('guru.delete', { NUPTK: g.NUPTK }); if (toastRes(r2)) { B().guru = B().guru.filter(function (x) { return x.NUPTK !== g.NUPTK; }); markAllDirty(true); afterWrite(); } }
    };
  },
  masterTab: function (box, sheet, title, cols, row, formFn) {
    var key = { Kelas: 'kelas_id', Mapel: 'mapel_id' }[sheet], list = B()[sheet.toLowerCase()] || [];
    box.innerHTML = '<div class="card"><div class="card-h"><div class="grow"><h3>' + title + '</h3><p>' + list.length + ' data</p></div><button class="btn btn-dark btn-sm" id="msAdd">' + ic('plus') + 'Tambah</button></div><div class="card-b" style="padding:12px 0 0"><div class="tbl-wrap"><table class="tbl"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '<th class="tr">Aksi</th></tr></thead><tbody>' +
      (list.length ? list.map(function (x) { return '<tr>' + row(x) + '<td class="tr nowrap"><button class="btn-ic" data-ms="' + esc(x[key]) + '">' + ic('pencil') + '</button><button class="btn-ic" data-ms="' + esc(x[key]) + '" data-op="del">' + ic('trash-2') + '</button></td></tr>'; }).join('') : '<tr><td colspan="9">' + emptyHtml('Belum ada data', '', 'inbox') + '</td></tr>') + '</tbody></table></div></div></div>';
    $('#msAdd', box).onclick = function () { formFn({}); };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-ms]'); if (!t) return; var x = list.filter(function (y) { return y[key] === t.dataset.ms; })[0];
      if (t.dataset.op !== 'del') return formFn(x);
      if (!await confirmBox('Hapus data ini?', { danger: true, ok: 'Hapus' })) return;
      var r = await api('master.delete', { sheet: sheet, id: x[key] });
      if (toastRes(r)) { B()[sheet.toLowerCase()] = list.filter(function (y) { return y !== x; }); markAllDirty(true); afterWrite(); }
    };
  },
  t_kelas: function (box) {
    this.masterTab(box, 'Kelas', 'Kelas / Rombel', ['Nama Kelas', 'Jenjang', 'Wali Kelas', 'Jumlah Siswa', 'Tahun Ajaran'], function (k) { var n = (B().siswa || []).filter(function (s) { return s.kelas_id === k.kelas_id; }).length; return '<td><b>' + esc(k.nama_kelas) + '</b><div class="xs muted mono">' + esc(k.kelas_id) + '</div></td><td><span class="bdg info">' + esc(k.jenjang) + '</span></td><td>' + esc(guruNama(k.wali_kelas_id)) + '</td><td>' + n + '</td><td>' + esc(k.tahun_ajaran) + '</td>'; },
      function (k) { masterForm('Kelas', k, [{ k: 'nama_kelas', l: 'Nama Kelas', c: 'c6', ph: 'XII IPA 1' }, { k: 'jenjang', l: 'Jenjang', c: 'c6', opts: ['SD', 'SMP', 'SMA'] }, { k: 'tingkat', l: 'Tingkat', c: 'c4', ph: 'XII' }, { k: 'wali_kelas_id', l: 'Wali Kelas', c: 'c8', guru: 1 }, { k: 'tahun_ajaran', l: 'Tahun Ajaran', c: 'c6' }]); });
  },
  t_mapel: function (box) {
    this.masterTab(box, 'Mapel', 'Mata Pelajaran', ['Nama', 'Kode', 'Kelompok', 'Jenjang'], function (m) { return '<td><b>' + esc(m.nama) + '</b></td><td class="mono">' + esc(m.kode) + '</td><td>' + esc(m.kelompok) + '</td><td>' + esc(m.jenjang) + '</td>'; },
      function (m) { masterForm('Mapel', m, [{ k: 'nama', l: 'Nama Mata Pelajaran', c: '' }, { k: 'kode', l: 'Kode', c: 'c4' }, { k: 'kelompok', l: 'Kelompok', c: 'c4', opts: ['Wajib', 'Peminatan', 'Muatan Lokal', 'Pilihan'] }, { k: 'jenjang', l: 'Jenjang', c: 'c4', opts: ['', 'SD', 'SMP', 'SMA'] }]); });
  },
  t_pengumuman: function (box) {
    var list = B().pengumuman || [];
    box.innerHTML = '<div class="card"><div class="card-h"><div class="grow"><h3>Pengumuman Sekolah</h3><p>Tampil di dashboard siswa & lonceng notifikasi</p></div><button class="btn btn-dark btn-sm" id="pnAdd">' + ic('plus') + 'Buat Pengumuman</button></div><div class="card-b">' +
      (list.length ? list.map(function (p) { return '<div class="ann"><div class="meta"><span>' + esc(relTime(p.tanggal)) + ' • ' + esc(p.oleh || '') + '</span><span class="row gap4"><span class="bdg info">' + esc(p.kategori) + '</span><button class="btn-ic" data-pn="' + esc(p.pengumuman_id) + '">' + ic('pencil') + '</button><button class="btn-ic" data-pn="' + esc(p.pengumuman_id) + '" data-op="del">' + ic('trash-2') + '</button></span></div><h4>' + esc(p.judul) + '</h4><p>' + esc(p.isi) + '</p></div>'; }).join('') : emptyHtml('Belum ada pengumuman', '', 'megaphone')) + '</div></div>';
    $('#pnAdd', box).onclick = function () { editPengumuman(); };
    box.onclick = async function (e) {
      var t = e.target.closest('[data-pn]'); if (!t) return; var p = list.filter(function (x) { return x.pengumuman_id === t.dataset.pn; })[0];
      if (t.dataset.op !== 'del') return editPengumuman(p);
      if (!await confirmBox('Hapus pengumuman "' + p.judul + '"?', { danger: true, ok: 'Hapus' })) return;
      var r = await api('master.delete', { sheet: 'Pengumuman', id: p.pengumuman_id });
      if (toastRes(r)) { B().pengumuman = list.filter(function (x) { return x !== p; }); markAllDirty(true); renderShellMeta(); afterWrite(); }
    };
  },
  t_log: function (box) {
    box.innerHTML = '<div class="card"><div class="card-h"><div class="grow"><h3>Log Aktivitas</h3><p>300 aktivitas terakhir (login, perubahan data, impor, blast)</p></div><button class="btn btn-outline btn-sm" id="lgRef">' + ic('refresh-cw') + 'Muat ulang</button></div><div class="card-b" id="lgBody"><div class="sk" style="height:220px"></div></div></div>';
    var load = function (force) {
      swr('a:logs', 'logs.list', {}, function (rows) {
        $('#lgBody', box).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th class="hide-m">Detail</th></tr></thead><tbody>' + rows.slice(0, 150).map(function (l) { return '<tr><td class="small nowrap">' + esc(relTime(l.timestamp)) + '</td><td class="small">' + esc(l.email || 'SYSTEM') + '<div class="xs muted">' + esc(l.role) + '</div></td><td><span class="bdg ' + (l.action === 'LOGIN' ? 'info' : l.action === 'SLOW' ? 'warn' : '') + ' mono">' + esc(l.action) + '</span></td><td class="hide-m xs mono muted" style="max-width:420px;word-break:break-all">' + esc(String(l.detail || '').substring(0, 180)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : emptyHtml('Belum ada log', '', 'scroll-text');
      }, { fresh: 15000, force: force, onError: function (r) { $('#lgBody', box).innerHTML = errorBox(r.message); } });
    };
    $('#lgRef', box).onclick = function () { load(true); };
    load(false);
  },
  t_sistem: function (box) {
    var perf = Perf.rows.slice(-12).reverse();
    box.innerHTML = '<div class="grid g2"><div class="card card-p"><h3>Informasi Sistem</h3><dl class="kv-list mt16"><dt>Versi Frontend</dt><dd>' + esc(CFG.VERSION) + '</dd><dt>Mode</dt><dd>' + (DEMO ? '<span class="bdg amber">DEMO (browser)</span>' : '<span class="bdg ok">Server GAS</span>') + '</dd><dt>Backend</dt><dd class="mono xs" style="word-break:break-all">' + esc(DEMO ? 'Mock GAS lokal' : GAS_URL) + '</dd><dt>Data contoh</dt><dd>' + (cfg('demo', false) ? 'Terpasang' : 'Tidak ada') + '</dd></dl>' +
      '<div class="note warn mt16">' + ic('triangle-alert') + '<div><b>Hapus data contoh</b><br>Menghapus siswa, absensi, nilai, materi, jadwal, pengumuman, antrean notifikasi & CRM contoh. Akun Anda tetap ada; kelas & mapel dapat dipertahankan.</div></div><div class="row gap12 mt12 wrap"><label class="chk small"><input type="checkbox" id="dcKelas"> Hapus juga kelas & mapel</label><button class="btn btn-danger" id="dcBtn">' + ic('trash-2') + 'Hapus Data Contoh</button></div></div>' +
      '<div class="card card-p"><h3>Kinerja Panggilan API</h3><p class="small muted">Total = waktu di browser; Server = waktu kerja GAS. Selisih besar = jaringan / cold start.</p>' + (perf.length ? '<div class="tbl-wrap mt12"><table class="tbl"><thead><tr><th>Aksi</th><th class="tr">Total</th><th class="tr">Server</th></tr></thead><tbody>' + perf.map(function (p) { return '<tr><td class="mono xs">' + esc(p.action) + '</td><td class="tr mono xs">' + p.total + ' ms</td><td class="tr mono xs">' + (p.server == null ? '-' : p.server + ' ms') + '</td></tr>'; }).join('') + '</tbody></table></div>' : emptyHtml('Belum ada panggilan', '', 'gauge')) + '</div></div>';
    $('#dcBtn', box).onclick = async function () {
      if (!await confirmBox('Hapus SEMUA data contoh? Tindakan ini tidak dapat dibatalkan.', { danger: true, ok: 'Ya, hapus' })) return;
      btnBusy(this, true); var r = await api('demo.clear', { hapusKelas: $('#dcKelas', box).checked }); btnBusy(this, false);
      if (toastRes(r)) { Store.clearUser(AppState.email); await refreshBoot(true); markAllDirty(true); }
    };
  }
});
function guruForm(g) {
  g = g || {}; var isNew = !g.NUPTK;
  var m = modal({ title: isNew ? 'Tambah Guru' : 'Ubah Data Guru', size: 'lg',
    body: '<div class="grid-form"><div class="field c6"><label>Nama Lengkap & Gelar <span class="req">*</span></label><input class="inp" name="nama_lengkap" value="' + esc(g.nama_lengkap || '') + '"></div><div class="field c6"><label>NUPTK / NIP <span class="req">*</span></label><input class="inp mono" name="NUPTK" value="' + esc(g.NUPTK || '') + '" ' + (isNew ? '' : 'readonly') + '></div>' +
      '<div class="field c6"><label>Email (untuk login) <span class="req">*</span></label><input class="inp" type="email" name="email" value="' + esc(g.email || '') + '"></div><div class="field c6"><label>No. WhatsApp</label><input class="inp" name="no_wa" value="' + esc(g.no_wa || '') + '"></div>' +
      '<div class="field c6"><label>Mata Pelajaran</label><input class="inp" name="mata_pelajaran" value="' + esc(g.mata_pelajaran || '') + '"></div><div class="field c6"><label>Jabatan</label><input class="inp" name="jabatan" value="' + esc(g.jabatan || 'Guru') + '"></div>' +
      (isNew ? '<div class="field c6"><label>Password Awal</label><input class="inp mono" name="password" value="' + randomPw() + '"></div><div class="field c6"><label>&nbsp;</label><label class="chk"><input type="checkbox" name="kirimKredensial"> Kirim kredensial via WA/Email</label></div>' : '<div class="field c6"><label>Status</label><select class="sel" name="status"><option' + (g.status !== 'Nonaktif' ? ' selected' : '') + '>Aktif</option><option' + (g.status === 'Nonaktif' ? ' selected' : '') + '>Nonaktif</option></select></div>') + '</div>',
    foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="gfSave">Simpan</button>' });
  $('#gfSave', m.el).onclick = async function () {
    var d = formData(m.el); btnBusy(this, true);
    var r = await api('guru.save', { isNew: isNew, data: d, password: d.password, kirimKredensial: d.kirimKredensial }); btnBusy(this, false);
    if (!toastRes(r)) return;
    var list = B().guru, i = list.findIndex(function (x) { return x.NUPTK === r.data.guru.NUPTK; }); if (i > -1) list[i] = Object.assign(list[i], r.data.guru); else list.push(r.data.guru);
    m.close(); markAllDirty(true); afterWrite();
    if (r.data.akun) kredensialModal(r.data.guru.nama_lengkap, r.data.akun.email, r.data.akun.password);
  };
}
function masterForm(sheet, x, fields) {
  x = x || {}; var key = { Kelas: 'kelas_id', Mapel: 'mapel_id' }[sheet];
  var m = modal({ title: (x[key] ? 'Ubah ' : 'Tambah ') + (sheet === 'Mapel' ? 'Mata Pelajaran' : sheet), size: 'lg',
    body: '<div class="grid-form">' + fields.map(function (f) { var v = x[f.k] == null ? (f.k === 'tahun_ajaran' ? cfg('TAHUN_AJARAN', '') : '') : x[f.k]; return '<div class="field ' + (f.c || '') + '"><label>' + esc(f.l) + '</label>' + (f.guru ? '<select class="sel" name="' + f.k + '">' + guruOpts(v, '— Belum ada —') + '</select>' : f.opts ? '<select class="sel" name="' + f.k + '">' + f.opts.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' : '<input class="inp" name="' + f.k + '" value="' + esc(v) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '>') + '</div>'; }).join('') + '</div>',
    foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="mfS">Simpan</button>' });
  $('#mfS', m.el).onclick = async function () {
    var d = formData(m.el); if (x[key]) d[key] = x[key];
    btnBusy(this, true); var r = await api('master.save', { sheet: sheet, row: d }); btnBusy(this, false);
    if (!toastRes(r)) return;
    var list = B()[sheet.toLowerCase()], i = list.findIndex(function (y) { return y[key] === r.data[key]; }); if (i > -1) list[i] = Object.assign(list[i], r.data); else list.push(r.data);
    m.close(); markAllDirty(true); afterWrite();
  };
}
function editPengumuman(p) {
  p = p || {}; var isNew = !p.pengumuman_id;
  var m = modal({ title: isNew ? 'Buat Pengumuman' : 'Ubah Pengumuman', size: 'lg',
    body: '<div class="grid-form"><div class="field c8"><label>Judul <span class="req">*</span></label><input class="inp" name="judul" value="' + esc(p.judul || '') + '"></div><div class="field c4"><label>Kategori</label><select class="sel" name="kategori">' + ['Akademik', 'Event', 'Informasi', 'Libur'].map(function (k) { return '<option' + (k === p.kategori ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></div><div class="field"><label>Isi Pengumuman <span class="req">*</span></label><textarea class="inp" name="isi" rows="5">' + esc(p.isi || '') + '</textarea></div>' +
      (isNew ? '<div class="field"><label class="chk"><input type="checkbox" name="kirimNotif"> Kirim juga ke orang tua via WhatsApp/Email (sesuai matriks notifikasi)</label></div>' : '') + '</div>',
    foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="pnSave">' + ic('megaphone') + 'Publikasikan</button>' });
  $('#pnSave', m.el).onclick = async function () {
    var d = formData(m.el), row = { judul: d.judul, isi: d.isi, kategori: d.kategori }; if (!isNew) Object.assign(row, { pengumuman_id: p.pengumuman_id, tanggal: p.tanggal, oleh: p.oleh, status: p.status });
    btnBusy(this, true); var r = await api('master.save', { sheet: 'Pengumuman', row: row, kirimNotif: d.kirimNotif }); btnBusy(this, false);
    if (!toastRes(r)) return;
    var list = B().pengumuman = B().pengumuman || [], i = list.findIndex(function (x) { return x.pengumuman_id === r.data.pengumuman_id; }); if (i > -1) list[i] = r.data; else list.unshift(r.data);
    m.close(); markAllDirty(true); renderShellMeta(); afterWrite();
  };
}
