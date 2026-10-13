/* =====================================================================
   SIAKAD SISWA v2.1 — pages-superadmin.js : Panel Super Admin
   Monitoring Guru & Siswa (live adaptif), Kelola Akun, Lokasi & Geofence,
   Keamanan (rahasia ber-allowlist, rotasi sesi, reset dari Apps Script).
   ===================================================================== */
'use strict';
function roleBadge(r) { return '<span class="bdg ' + ({ superadmin: 'navy', guru: 'info', siswa: '' }[r] || '') + '">' + esc(roleLabel(r)) + '</span>'; }
function onlineDot(on, t) { return on ? '<span class="online-dot" title="Online"></span>' : (t ? '<span class="xs muted">' + esc(relTime(new Date(t).toISOString())) + '</span>' : ''); }

// =====================================================================
// MONITORING GURU & SISWA
// =====================================================================
registerPage('guru', 'monitoring', {
  title: 'Monitoring Guru & Siswa', sa: true, _keepScroll: true,
  st: { tab: 'guru', q: '', d: null, tgl: '' },
  init: function (el) {
    var self = this, st = this.st;
    st.tgl = todayStr();
    el.innerHTML = pageHead('Super Admin <span>/ Monitoring</span>', 'Monitoring Guru & Siswa', 'Kehadiran guru & siswa hari ini, pengguna yang sedang aktif, dan aktivitas terbaru — diperbarui otomatis.',
      '<span class="live-pill" id="monLive">' + ic('radio') + ' LIVE</span><button class="btn btn-outline" id="monRef">' + ic('refresh-cw') + 'Segarkan</button>') +
      '<div class="grid g4" id="monKpi">' + '<div class="sk" style="height:140px"></div>'.repeat(4) + '</div>' +
      '<div class="tabs mt24" id="monTabs"><button data-t="guru">' + ic('contact') + 'Guru</button><button data-t="siswa">' + ic('users') + 'Siswa per Kelas</button><button data-t="online">' + ic('activity') + 'Online & Aktivitas</button><button data-t="rekap">' + ic('calendar-range') + 'Rekap Presensi Guru</button></div>' +
      '<div id="monBody" class="mt16"></div>';
    $$('#monTabs button', el).forEach(function (b) { b.onclick = function () { st.tab = b.dataset.t; self.draw(el); }; });
    $('#monRef', el).onclick = function () { self.load(el, true); };
    el.addEventListener('input', function (e) { if (e.target.id === 'monQ') { st.q = e.target.value.toLowerCase(); self.drawGuru(el); } });
    el.addEventListener('click', function (e) {
      var s = e.target.closest('[data-sis]'); if (s) return siswaDetail(s.dataset.sis);
      var a = e.target.closest('[data-akun]'); if (a) { sessionStorage.setItem('akunCari', a.dataset.akun); go('akun'); }
    });
    this.timer = setInterval(function () { if (!el.hidden && Activity.due('monitor', 30000, 120000)) self.load(el, true, true); }, 5000);
  },
  render: function (el) { this.load(el, false); },
  load: function (el, force, diam) {
    var self = this;
    var lv = $('#monLive', el); if (lv) lv.classList.add('busy');
    return swr('a:sa.monitor', 'sa.monitor', force ? { _fresh: true } : {}, function (d) { self.st.d = d; self.draw(el); }, { fresh: 30000, force: force, silent: diam && !!this.st.d, onError: function (r) { $('#monBody', el).innerHTML = errorBox(r.message); } })
      .finally(function () { if (lv) { lv.classList.remove('busy'); lv.title = 'Diperbarui ' + nowHM(); } });
  },
  draw: function (el) {
    var st = this.st, d = st.d; if (!d) return;
    $$('#monTabs button', el).forEach(function (b) { b.classList.toggle('on', b.dataset.t === st.tab); });
    var r = d.ringkas, ak = d.akun || {};
    $('#monKpi', el).innerHTML =
      kpi('Guru Hadir Hari Ini', r.guruHadir + '<small>/ ' + r.guruTotal + '</small>', '<div class="bar"><i style="width:' + pct(r.guruHadir, r.guruTotal) + '%"></i></div><div class="mt8">' + r.guruTerlambat + ' terlambat • batas ' + esc(d.jamMasukGuru) + '</div>', 'user-check') +
      kpi('Siswa Hadir Hari Ini', fmtN(r.persenSiswa) + '<small>%</small>', '<div class="bar"><i class="amber" style="width:' + r.persenSiswa + '%"></i></div><div class="mt8">' + r.siswaHadir + ' dari ' + r.siswaTotal + ' siswa aktif</div>', 'users', 'amber') +
      kpi('Pengguna Online', r.online + '<small>5 menit terakhir</small>', '<span class="row gap8"><span>' + d.online.filter(function (o) { return o.role !== 'siswa'; }).length + ' staf</span><span>' + d.online.filter(function (o) { return o.role === 'siswa'; }).length + ' siswa</span></span>', 'activity') +
      kpi('Akun Terdaftar', fmtN(ak.total) + '<small>' + ak.nonaktif + ' nonaktif</small>', '<span class="row gap8 wrap"><span>' + ak.superadmin + ' SA</span><span>' + ak.guru + ' guru</span><span>' + ak.siswa + ' siswa</span><span>' + ak.perangkat + ' perangkat</span></span>', 'shield-check');
    var box = $('#monBody', el);
    if (st.tab === 'guru') {
      box.innerHTML = '<div class="grid g-main"><div class="card"><div class="toolbar"><div class="field search"><div class="inp-ic">' + ic('search') + '<input class="inp" id="monQ" placeholder="Cari guru / mapel" value="' + esc(st.q) + '"></div></div><span class="small muted">' + esc(tglHari(d.tanggal)) + ' • pukul ' + esc(d.jam) + '</span></div><div id="monGuru"></div></div>' +
        '<div class="card"><div class="card-h"><div class="grow"><h3>Presensi Guru 7 Hari</h3><p>Jumlah guru hadir per hari</p></div></div><div class="card-b">' + barChart({ labels: d.trenGuru.map(function (t) { return t.hari.slice(0, 3); }), values: d.trenGuru.map(function (t) { return t.hadir; }), highlight: d.trenGuru.length - 1, max: Math.max(r.guruTotal, 1) }) +
        '<div class="legend mt8"><span><i style="background:#1E3A5F"></i>Hari ini</span><span>Terlambat 7 hari: <b>' + d.trenGuru.reduce(function (a, t) { return a + t.terlambat; }, 0) + '</b></span></div></div></div></div>';
      this.drawGuru(el);
    } else if (st.tab === 'siswa') {
      var kel = d.kelas.slice().sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama)); });
      box.innerHTML = '<div class="grid g-main"><div class="card"><div class="card-h"><div class="grow"><h3>Kehadiran Siswa per Kelas</h3><p>Hari ini & rata-rata semester</p></div></div><div class="card-b" style="padding:12px 0 0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kelas</th><th>Hari ini</th><th class="tc">H</th><th class="tc">I</th><th class="tc">S</th><th class="tc">A</th><th class="tc">Belum</th><th class="tr">Semester</th></tr></thead><tbody>' +
        kel.map(function (k) { return '<tr><td><b>' + esc(k.nama) + '</b><div class="xs muted">' + k.total + ' siswa</div></td><td style="min-width:140px"><div class="bar stack">' + [['H', '#1E3A5F'], ['I', '#F5A623'], ['S', '#7D93B5'], ['A', '#DC2626']].map(function (x) { return '<i style="width:' + pct(k[x[0]], k.total) + '%;background:' + x[1] + '"></i>'; }).join('') + '</div><div class="xs mt8">' + fmtN(k.persenHariIni) + '% hadir</div></td><td class="tc">' + k.H + '</td><td class="tc">' + k.I + '</td><td class="tc">' + k.S + '</td><td class="tc red">' + k.A + '</td><td class="tc muted">' + k.belum + '</td><td class="tr b ' + (k.persenSemester != null && k.persenSemester < Number(cfg('BATAS_KEHADIRAN', 75)) ? 'red' : '') + '">' + (k.persenSemester == null ? '-' : fmtN(k.persenSemester) + '%') + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>' +
        '<div class="card"><div class="card-h"><div class="grow"><h3>' + ic('triangle-alert', 'amber') + ' Perlu Perhatian</h3><p>Kehadiran semester di bawah ' + cfg('BATAS_KEHADIRAN', 75) + '%</p></div></div><div class="card-b">' +
        (d.perhatian.length ? d.perhatian.map(function (s) { return '<div class="list-i" style="cursor:pointer" data-sis="' + esc(s.NIS) + '">' + avatar(s.nama, '', 'sm') + '<div class="grow"><b>' + esc(s.nama) + '</b><small>' + esc(kelasNama(s.kelas_id)) + ' • NIS ' + esc(s.NIS) + '</small></div><b class="red">' + fmtN(s.persen) + '%</b></div>'; }).join('') : emptyHtml('Semua siswa di atas batas', '', 'party-popper')) + '</div></div></div>';
    } else if (st.tab === 'online') {
      box.innerHTML = '<div class="grid g2"><div class="card"><div class="card-h"><div class="grow"><h3>' + ic('activity') + ' Sedang Online</h3><p>Aktivitas dalam 5 menit terakhir</p></div><span class="pill">' + d.online.length + '</span></div><div class="card-b">' +
        (d.online.length ? d.online.map(function (o) { return '<div class="list-i">' + avatar(o.nama, '', 'sm') + '<div class="grow"><b>' + esc(o.nama) + ' <span class="online-dot"></span></b><small>' + roleBadge(o.role) + ' <span class="mono xs">' + esc(o.aksi) + '</span></small></div><span class="xs muted">' + esc(relTime(new Date(o.t).toISOString())) + '</span></div>'; }).join('') : emptyHtml('Tidak ada yang online', '', 'moon')) + '</div></div>' +
        '<div class="card"><div class="card-h"><div class="grow"><h3>' + ic('scroll-text') + ' Aktivitas Terbaru</h3><p>Login, perubahan data, keamanan</p></div><a class="small b" href="#/pengaturan/log">Semua log ›</a></div><div class="card-b">' +
        (d.aktivitas.length ? d.aktivitas.map(function (l) { return '<div class="feed"><span class="bdg mono ' + (/GAGAL|SLOW/.test(l.action) ? 'warn' : l.action === 'LOGIN' ? 'info' : '') + '">' + esc(l.action) + '</span><div class="grow small"><b>' + esc(l.email || 'SYSTEM') + '</b> <span class="muted">' + esc(String(l.detail || '').slice(0, 90)) + '</span></div><span class="xs muted nowrap">' + esc(relTime(l.timestamp)) + '</span></div>'; }).join('') : emptyHtml('Belum ada aktivitas', '', 'scroll-text')) + '</div></div></div>';
    } else this.drawRekap(el);
  },
  drawGuru: function (el) {
    var st = this.st, d = st.d, host = $('#monGuru', el); if (!host || !d) return;
    var rows = d.guru.filter(function (g) { return !st.q || (g.nama + ' ' + g.mapel + ' ' + g.jabatan).toLowerCase().indexOf(st.q) > -1; })
      .sort(function (a, b) { return (b.online - a.online) || (!!b.masuk - !!a.masuk) || a.nama.localeCompare(b.nama); });
    host.innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Guru</th><th>Masuk</th><th>Pulang</th><th class="hide-m">Lokasi</th><th>Status</th><th class="hide-m tr">Aktivitas</th></tr></thead><tbody>' + rows.map(function (g) {
      var stt = g.masuk ? (g.terlambat === 'YA' ? '<span class="bdg warn">Terlambat</span>' : '<span class="bdg ok">Hadir</span>') : '<span class="bdg">Belum presensi</span>';
      return '<tr><td><div class="who">' + avatar(g.nama, g.foto) + '<div><b>' + esc(g.nama) + ' ' + onlineDot(g.online) + '</b><small>' + esc(g.mapel || '-') + (g.role === 'superadmin' ? ' • <span class="navy b">Super Admin</span>' : '') + '</small></div></div></td><td class="mono">' + esc(g.masuk || '-') + '</td><td class="mono">' + esc(g.pulang || '-') + '</td><td class="hide-m small">' + esc(g.lokasi || '-') + (g.jarak_m !== '' && g.jarak_m != null ? '<div class="xs muted">' + g.jarak_m + ' m</div>' : '') + '</td><td>' + stt + (g.akunAktif ? '' : ' <span class="bdg bad">Akun nonaktif</span>') + '</td><td class="hide-m xs tr nowrap">' + (g.online ? '<span class="bdg ok" title="' + esc(g.aksi) + '">Online</span>' : g.terakhir ? esc(relTime(new Date(g.terakhir).toISOString())) : '<span class="muted">-</span>') + (g.user_id ? ' <button class="btn-ic" data-akun="' + esc(g.nama) + '" title="Kelola akun" style="display:inline-grid;vertical-align:middle">' + ic('user-cog') + '</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : emptyHtml('Guru tidak ditemukan', '', 'search-x');
  },
  drawRekap: function (el) {
    var st = this.st, self = this, box = $('#monBody', el);
    box.innerHTML = '<div class="card"><div class="toolbar"><div class="field"><label class="lbl">Dari</label><input class="inp" type="date" id="rkDari" value="' + esc(st.dari || st.tgl) + '"></div><div class="field"><label class="lbl">Sampai</label><input class="inp" type="date" id="rkSampai" value="' + esc(st.sampai || st.tgl) + '"></div><button class="btn btn-dark" id="rkGo">' + ic('search') + 'Tampilkan</button><button class="btn btn-outline" id="rkCsv">' + ic('download') + 'CSV</button></div><div id="rkBody"><div class="sk" style="height:200px;margin:0 20px 20px"></div></div></div>';
    var load = async function () {
      st.dari = $('#rkDari', box).value; st.sampai = $('#rkSampai', box).value;
      var r = await apiQ('presensi.list', { dari: st.dari, sampai: st.sampai });
      if (!r.success) { $('#rkBody', box).innerHTML = errorBox(r.message); return; }
      self.rekap = r.data;
      var rows = r.data.harian || r.data.rows;
      $('#rkBody', box).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + (r.data.harian ? '' : '<th>Tanggal</th>') + '<th>Guru</th><th>Masuk</th><th>Pulang</th><th class="hide-m">Lokasi</th><th>Keterangan</th></tr></thead><tbody>' + rows.map(function (p) {
        return '<tr>' + (r.data.harian ? '' : '<td class="nowrap">' + esc(tglIndo(p.tanggal, true)) + '</td>') + '<td><b>' + esc(p.nama) + '</b><div class="xs muted">' + esc(p.mapel || p.NUPTK) + '</div></td><td class="mono">' + esc(jam5(p.masuk || p.jam_masuk) || '-') + ((p.terlambat === 'YA') ? ' <span class="bdg warn">Terlambat</span>' : '') + '</td><td class="mono">' + esc(jam5(p.pulang || p.jam_pulang) || '-') + '</td><td class="hide-m small">' + esc(p.lokasi || '-') + '</td><td class="small muted">' + esc(p.keterangan || (r.data.harian && !p.masuk ? 'Tidak presensi' : '-')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : emptyHtml('Tidak ada data presensi', '', 'calendar-x');
    };
    $('#rkGo', box).onclick = load;
    $('#rkCsv', box).onclick = function () {
      var d = self.rekap; if (!d) return toast('Tampilkan data dulu.', 'warn');
      var rows = d.harian || d.rows;
      downloadCSV('presensi-guru-' + st.dari + '_' + st.sampai + '.csv', ['Tanggal', 'NUPTK', 'Nama', 'Masuk', 'Pulang', 'Terlambat', 'Lokasi', 'Jarak (m)', 'Keterangan'],
        rows.map(function (p) { return [p.tanggal || st.dari, p.NUPTK, p.nama, jam5(p.masuk || p.jam_masuk), jam5(p.pulang || p.jam_pulang), p.terlambat, p.lokasi, p.jarak_m, p.keterangan]; }));
    };
    load();
  }
});

// =====================================================================
// KELOLA AKUN (guru, siswa, super admin)
// =====================================================================
registerPage('guru', 'akun', {
  title: 'Kelola Akun', sa: true,
  st: { q: '', role: '', status: '', kelas: '', page: 1, per: 20, sel: {}, d: null },
  init: function (el) {
    var st = this.st, self = this;
    el.innerHTML = pageHead('Super Admin <span>/ Kelola Akun</span>', 'Kelola Akun Guru & Siswa', 'Aktif/nonaktifkan akun, atur peran & hak keuangan, lokasi absensi khusus, reset sandi, reset perangkat, dan paksa keluar.',
      '<button class="btn btn-outline" id="akRef">' + ic('refresh-cw') + 'Segarkan</button><button class="btn btn-dark" id="akNew">' + ic('user-plus') + 'Tambah Super Admin</button>') +
      '<div class="grid g4" id="akKpi"></div>' +
      '<div class="card mt24"><div class="toolbar"><div class="field search"><div class="inp-ic">' + ic('search') + '<input class="inp" id="akQ" placeholder="Cari nama, email, NIS/NUPTK"></div></div>' +
      '<div class="field"><select class="sel" id="akRole"><option value="">Peran: Semua</option><option value="superadmin">Super Admin</option><option value="guru">Guru</option><option value="siswa">Siswa</option></select></div>' +
      '<div class="field"><select class="sel" id="akStatus"><option value="">Status: Semua</option><option value="YA">Aktif</option><option value="TIDAK">Nonaktif</option><option value="online">Sedang online</option><option value="perangkat">Perangkat terdaftar</option><option value="khusus">Lokasi khusus</option><option value="keu">Hak keuangan</option></select></div>' +
      '<div class="field"><select class="sel" id="akKelas"></select></div>' +
      '<select class="sel" id="akBulk" style="min-width:170px"><option value="">Tindakan Massal</option><option value="aktifkan">Aktifkan</option><option value="nonaktifkan">Nonaktifkan</option><option value="logout">Paksa keluar</option><option value="resetPerangkat">Reset perangkat</option><option value="wajibGanti">Wajib ganti sandi</option><option value="setLokasi">Atur lokasi khusus…</option></select></div>' +
      '<div id="akTable"></div></div>';
    var rer = function () { st.page = 1; self.table(el); };
    var pre = sessionStorage.getItem('akunCari'); if (pre) { st.q = pre.toLowerCase(); sessionStorage.removeItem('akunCari'); $('#akQ', el).value = pre; }
    $('#akQ', el).oninput = debounce(function () { st.q = this.value.toLowerCase(); rer(); }, 220);
    $('#akRole', el).onchange = function () { st.role = this.value; rer(); };
    $('#akStatus', el).onchange = function () { st.status = this.value; rer(); };
    $('#akKelas', el).onchange = function () { st.kelas = this.value; rer(); };
    $('#akRef', el).onclick = function () { self.load(el, true); };
    $('#akNew', el).onclick = function () { self.formSA(el); };
    $('#akBulk', el).onchange = function () { var a = this.value; this.value = ''; if (a) self.bulk(el, a); };
    el.addEventListener('change', function (e) {
      if (e.target.matches('[data-ck]')) { if (e.target.checked) st.sel[e.target.dataset.ck] = 1; else delete st.sel[e.target.dataset.ck]; self.table(el); }
      if (e.target.matches('#akAll')) { self.pageRows.forEach(function (u) { if (e.target.checked) st.sel[u.user_id] = 1; else delete st.sel[u.user_id]; }); self.table(el); }
    });
    el.addEventListener('click', function (e) {
      var p = e.target.closest('[data-pg]'); if (p && !p.disabled && p.closest('#akTable')) { st.page = Number(p.dataset.pg); self.table(el); return; }
      var b = e.target.closest('[data-op]'); if (b) self.op(el, b.dataset.op, b.dataset.uid, b);
    });
  },
  render: function (el) { $('#akKelas', el).innerHTML = kelasOpts(this.st.kelas, 'Kelas: Semua'); this.load(el, false); },
  load: function (el, force) {
    var self = this;
    return swr('a:sa.akun.list', 'sa.akun.list', force ? { _fresh: true } : {}, function (d) { self.st.d = d; self.kpi(el); self.table(el); }, { fresh: 60000, force: force, onError: function (r) { $('#akTable', el).innerHTML = errorBox(r.message); } });
  },
  kpi: function (el) {
    var rows = this.st.d.rows, n = function (f) { return rows.filter(f).length; };
    $('#akKpi', el).innerHTML = kpi('Total Akun', fmtN(rows.length), n(function (u) { return u.role === 'superadmin'; }) + ' Super Admin • ' + n(function (u) { return u.role === 'guru'; }) + ' guru • ' + n(function (u) { return u.role === 'siswa'; }) + ' siswa', 'users-round') +
      kpi('Akun Nonaktif', n(function (u) { return u.status_aktif !== 'YA'; }), 'Tidak bisa login sampai diaktifkan', 'user-x', 'amber') +
      kpi('Sedang Online', n(function (u) { return u.online; }), '5 menit terakhir', 'activity') +
      kpi('Perangkat Terdaftar', n(function (u) { return u.perangkat; }), (cfg('KUNCI_PERANGKAT', 'TIDAK') === 'YA' ? 'Kunci perangkat AKTIF' : 'Kunci perangkat nonaktif') + ' • <a href="#/lokasi" class="b">atur</a>', 'smartphone');
  },
  filtered: function () {
    var st = this.st;
    return (st.d ? st.d.rows : []).filter(function (u) {
      if (st.role && u.role !== st.role) return false;
      if (st.status === 'YA' || st.status === 'TIDAK') { if ((u.status_aktif === 'YA' ? 'YA' : 'TIDAK') !== st.status) return false; }
      if (st.status === 'online' && !u.online) return false;
      if (st.status === 'perangkat' && !u.perangkat) return false;
      if (st.status === 'khusus' && !u.lokasi_ids) return false;
      if (st.status === 'keu' && !/keuangan/.test(u.hak_akses) && u.role !== 'superadmin') return false;
      if (st.kelas && u.kelas_id !== st.kelas) return false;
      if (st.q && (u.nama + ' ' + u.email + ' ' + u.ref_id).toLowerCase().indexOf(st.q) === -1) return false;
      return true;
    }).sort(function (a, b) { var o = { superadmin: 0, guru: 1, siswa: 2 }; return (o[a.role] - o[b.role]) || (b.online - a.online) || String(a.nama).localeCompare(String(b.nama)); });
  },
  lokNama: function (ids) { var m = {}; (this.st.d.lokasi || []).forEach(function (l) { m[l.lokasi_id] = l.nama; }); return String(ids || '').split(',').filter(String).map(function (i) { return m[i] || i; }); },
  table: function (el) {
    var st = this.st, self = this; if (!st.d) return;
    var rows = this.filtered(), p = paginate(rows, st.page, st.per); st.page = p.page; this.pageRows = p.rows;
    var nSel = Object.keys(st.sel).length, saya = st.d.saya;
    $('#akTable', el).innerHTML = (nSel ? '<div class="note" style="margin:0 20px 12px">' + ic('list-checks') + '<div><b>' + nSel + ' akun dipilih.</b> Gunakan Tindakan Massal.</div><button class="btn btn-ghost btn-sm" data-op="clear">Batal pilih</button></div>' : '') +
      (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" id="akAll" aria-label="Pilih semua" ' + (p.rows.length && p.rows.every(function (u) { return st.sel[u.user_id]; }) ? 'checked' : '') + '></th><th>Akun</th><th>Peran</th><th class="hide-m">Hak, Lokasi & Perangkat</th><th class="hide-m">Login terakhir</th><th>Status</th><th class="tr">Aksi</th></tr></thead><tbody>' +
        p.rows.map(function (u) {
          var lok = self.lokNama(u.lokasi_ids);
          return '<tr class="' + (st.sel[u.user_id] ? 'sel' : '') + '"><td><input type="checkbox" data-ck="' + esc(u.user_id) + '" ' + (st.sel[u.user_id] ? 'checked' : '') + '></td>' +
            '<td><div class="who">' + avatar(u.nama, '') + '<div><b>' + esc(u.nama) + ' ' + onlineDot(u.online) + (u.user_id === saya ? ' <span class="bdg">Anda</span>' : '') + '</b><small>' + esc(u.email) + (u.ref_id ? ' • ' + esc(u.ref_id) : '') + (u.kelas ? ' • ' + esc(u.kelas) : '') + '</small></div></div></td>' +
            '<td>' + roleBadge(u.role) + (u.wajib_ganti_sandi === 'YA' ? '<div class="xs amber mt8">wajib ganti sandi</div>' : '') + '</td>' +
            '<td class="hide-m small">' + (u.role !== 'siswa' && (/keuangan/.test(u.hak_akses) || u.role === 'superadmin') ? '<span class="bdg amber">' + ic('wallet') + 'Keuangan</span> ' : '') + (lok.length ? '<span class="bdg info">' + ic('map-pin') + esc(lok.join(', ')) + '</span>' : '<span class="muted xs">semua lokasi</span>') + (u.perangkat ? '<div class="xs mt4" title="' + esc(u.device_info) + '">' + ic('smartphone') + ' ' + esc(String(u.device_info || 'Terdaftar').split(' · ').slice(0, 2).join(' · ')) + '</div>' : '') + '</td>' +
            '<td class="hide-m small">' + (u.last_login ? esc(relTime(u.last_login)) : '<i class="muted">belum pernah</i>') + '</td>' +
            '<td>' + (u.status_aktif === 'YA' ? '<span class="bdg ok dot">Aktif</span>' : '<span class="bdg bad dot">Nonaktif</span>') + '</td>' +
            '<td class="tr nowrap"><button class="btn-ic" data-op="edit" data-uid="' + esc(u.user_id) + '" title="Ubah">' + ic('pencil') + '</button><button class="btn-ic" data-op="reset" data-uid="' + esc(u.user_id) + '" title="Reset sandi">' + ic('key-round') + '</button><button class="btn-ic hide-m" data-op="logout" data-uid="' + esc(u.user_id) + '" title="Paksa keluar">' + ic('log-out') + '</button>' + (u.perangkat ? '<button class="btn-ic hide-m" data-op="device" data-uid="' + esc(u.user_id) + '" title="Reset perangkat">' + ic('smartphone-nfc') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + pagerHtml(p, 'akun') : emptyHtml('Akun tidak ditemukan', 'Ubah filter pencarian.', 'search-x'));
  },
  byId: function (id) { return (this.st.d.rows || []).filter(function (u) { return u.user_id === id; })[0]; },
  op: async function (el, op, uid, btn) {
    var self = this, u = this.byId(uid);
    if (op === 'clear') { this.st.sel = {}; return this.table(el); }
    if (!u) return;
    if (op === 'edit') return this.form(el, u);
    if (op === 'reset') {
      if (!await confirmBox('Buat sandi baru untuk ' + u.nama + '?\nSandi lama tidak berlaku & sesinya dikeluarkan.')) return;
      btnBusy(btn, true); var r = await api('sa.akun.reset', { user_id: uid, kirim: u.role !== 'superadmin' }); btnBusy(btn, false);
      if (toastRes(r)) kredensialModal(u.nama, r.data.akun.email, r.data.akun.password);
      return;
    }
    if (op === 'logout') { if (!await confirmBox('Keluarkan ' + u.nama + ' dari semua perangkat?')) return; toastRes(await api('sa.akun.logout', { user_id: uid })); return; }
    if (op === 'device') { if (!await confirmBox('Reset perangkat ' + u.nama + '? Perangkat berikutnya yang dipakai absen akan terdaftar otomatis.')) return; var r2 = await api('sa.akun.device', { user_id: uid }); if (toastRes(r2)) { u.perangkat = false; u.device_info = ''; self.table(el); } }
  },
  form: function (el, u) {
    var self = this, d = this.st.d, keu = /keuangan/.test(u.hak_akses), ids = String(u.lokasi_ids || '').split(',');
    var m = modal({ title: 'Ubah Akun', sub: u.email + ' • ' + roleLabel(u.role), size: 'lg',
      body: '<div class="grid-form"><div class="field c6"><label>Nama</label><input class="inp" name="nama" value="' + esc(u.nama) + '"></div><div class="field c6"><label>Email login</label><input class="inp" type="email" name="email" value="' + esc(u.email) + '"></div>' +
        '<div class="field c4"><label>Peran</label>' + (u.role === 'siswa' ? '<input class="inp" value="Siswa" readonly>' : '<select class="sel" name="role"><option value="guru"' + (u.role === 'guru' ? ' selected' : '') + (u.ref_id ? '' : ' disabled') + '>Guru</option><option value="superadmin"' + (u.role === 'superadmin' ? ' selected' : '') + '>Super Admin</option></select>') + '</div>' +
        '<div class="field c4"><label>Status akun</label><select class="sel" name="status_aktif"><option value="YA"' + (u.status_aktif === 'YA' ? ' selected' : '') + '>Aktif</option><option value="TIDAK"' + (u.status_aktif !== 'YA' ? ' selected' : '') + '>Nonaktif</option></select></div>' +
        '<div class="field c4"><label>&nbsp;</label><label class="chk"><input type="checkbox" name="wajib_ganti_sandi"' + (u.wajib_ganti_sandi === 'YA' ? ' checked' : '') + '> Wajib ganti sandi</label></div>' +
        (u.role !== 'siswa' ? '<div class="field"><label class="chk"><input type="checkbox" name="keu"' + (keu ? ' checked' : '') + '> ' + ic('wallet') + ' Hak <b>Keuangan</b> — boleh mengelola Tagihan & Pembayaran (bendahara)</label></div>' : '') +
        '<div class="field"><label>Lokasi absensi khusus <span class="muted xs">(kosong = semua lokasi yang berlaku untuk perannya)</span></label><div class="row wrap gap8">' + ((d.lokasi || []).length ? d.lokasi.map(function (l) { return '<label class="chk geo-chip"><input type="checkbox" name="lok_' + esc(l.lokasi_id) + '"' + (ids.indexOf(l.lokasi_id) > -1 ? ' checked' : '') + '> ' + esc(l.nama) + ' <small>' + esc(l.berlaku) + (l.aktif === 'TIDAK' ? ' • nonaktif' : '') + '</small></label>'; }).join('') : '<span class="small muted">Belum ada lokasi. <a href="#/lokasi">Tambah lokasi</a></span>') + '</div></div>' +
        '<div class="field"><label>Catatan internal</label><input class="inp" name="catatan" value="' + esc(u.catatan || '') + '"></div>' +
        '<div class="field"><div class="note">' + ic('info') + '<div>Perangkat: <b>' + (u.perangkat ? esc(u.device_info) : 'belum terdaftar') + '</b>. Mengubah email, peran, atau menonaktifkan akun akan mengeluarkan sesi aktifnya.</div></div></div></div>',
      foot: (u.role === 'superadmin' && u.user_id !== d.saya ? '<button class="btn btn-danger" id="afDel" style="margin-right:auto">' + ic('trash-2') + 'Hapus</button>' : '') + '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="afSave">' + ic('save') + 'Simpan</button>' });
    $('#afSave', m.el).onclick = async function () {
      var f = formData(m.el), lok = (d.lokasi || []).filter(function (l) { return f['lok_' + l.lokasi_id]; }).map(function (l) { return l.lokasi_id; });
      var p = { user_id: u.user_id, nama: f.nama, email: f.email, status_aktif: f.status_aktif, wajib_ganti_sandi: !!f.wajib_ganti_sandi, lokasi_ids: lok, catatan: f.catatan };
      if (f.role) p.role = f.role;
      if (u.role !== 'siswa') p.hak_akses = f.keu ? 'keuangan' : '';
      btnBusy(this, true); var r = await api('sa.akun.save', p); btnBusy(this, false);
      if (toastRes(r)) { m.close(); self.load(el, true); afterWrite(); }
    };
    if ($('#afDel', m.el)) $('#afDel', m.el).onclick = async function () { if (!await confirmBox('Hapus akun Super Admin ' + u.nama + '?', { danger: true, ok: 'Hapus' })) return; var r = await api('sa.akun.delete', { user_id: u.user_id }); if (toastRes(r)) { m.close(); self.load(el, true); } };
  },
  formSA: function (el) {
    var self = this;
    var m = modal({ title: 'Tambah Super Admin', sub: 'Akun pengelola penuh sistem. Gunakan seperlunya.', size: 'sm',
      body: '<div class="field"><label>Nama</label><input class="inp" name="nama" placeholder="Wakil Kepala Sekolah"></div><div class="field mt12"><label>Email login</label><input class="inp" type="email" name="email"></div>' +
        '<div class="field mt12"><label class="chk"><input type="checkbox" name="keu" checked> Hak keuangan</label></div><div class="note mt12">' + ic('key-round') + '<div>Sandi acak 14 karakter dibuat otomatis & hanya tampil sekali. Pemilik akun wajib menggantinya saat login.</div></div>',
      foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="saSave">Buat Akun</button>' });
    $('#saSave', m.el).onclick = async function () {
      var f = formData(m.el); btnBusy(this, true);
      var r = await api('sa.akun.create', { nama: f.nama, email: f.email, hak_akses: f.keu ? 'keuangan' : '' }); btnBusy(this, false);
      if (toastRes(r)) { m.close(); kredensialModal(f.nama, r.data.akun.email, r.data.akun.password); self.load(el, true); }
    };
  },
  bulk: async function (el, aksi) {
    var st = this.st, ids = Object.keys(st.sel), self = this;
    if (!ids.length) return toast('Centang akun terlebih dahulu.', 'warn');
    var nilai = '';
    if (aksi === 'setLokasi') {
      nilai = await new Promise(function (res) {
        var m = modal({ title: 'Lokasi Khusus', sub: ids.length + ' akun dipilih • kosongkan semua = kembali ke semua lokasi', size: 'sm', onClose: function (v) { res(v); },
          body: '<div class="row wrap gap8">' + (st.d.lokasi || []).map(function (l) { return '<label class="chk geo-chip"><input type="checkbox" value="' + esc(l.lokasi_id) + '"> ' + esc(l.nama) + '</label>'; }).join('') + '</div>',
          foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="blOk">Terapkan</button>' });
        $('#blOk', m.el).onclick = function () { m.close($$('input:checked', m.el).map(function (x) { return x.value; }).join(',') || '_'); };
      });
      if (nilai === undefined) return;
      if (nilai === '_') nilai = '';
    } else if (!await confirmBox('Terapkan "' + aksi + '" ke ' + ids.length + ' akun?', { danger: aksi === 'nonaktifkan' })) return;
    var r = await api('sa.akun.bulk', { ids: ids, aksi: aksi, nilai: nilai });
    if (toastRes(r)) { st.sel = {}; self.load(el, true); }
  }
});

// =====================================================================
// LOKASI & GEOFENCE
// =====================================================================
registerPage('guru', 'lokasi', {
  title: 'Lokasi & Geofence', sa: true,
  init: function (el) {
    var self = this;
    el.innerHTML = pageHead('Super Admin <span>/ Lokasi & Geofence</span>', 'Lokasi & Geofence', 'Tentukan titik kantor/sekolah beserta radiusnya. Siswa & guru otomatis divalidasi terhadap lokasi terdekat yang berlaku untuk akunnya.',
      '<button class="btn btn-outline" id="lkMap">' + ic('map') + 'Lihat Peta</button><button class="btn btn-dark" id="lkAdd">' + ic('map-pin-plus') + 'Tambah Lokasi</button>') +
      '<div class="grid g-main"><div><div id="lkList"><div class="sk" style="height:220px"></div></div></div><div class="card"><div class="card-h"><div class="grow"><h3>' + ic('sliders-horizontal') + ' Aturan Absensi</h3><p>Berlaku untuk seluruh lokasi</p></div></div><div class="card-b"><form id="lkCfg" class="grid-form"></form></div></div></div>' +
      '<div class="card card-p mt24"><h3>' + ic('lightbulb', 'amber') + ' Cara kerja</h3><ol class="small" style="margin:8px 0 0;padding-left:18px;line-height:1.8"><li>Tambahkan satu atau lebih lokasi (klik peta / geser penanda / tempel link Google Maps) dan atur radiusnya.</li><li>Pilih <b>Berlaku untuk</b>: Guru & Siswa, hanya Siswa, atau hanya Guru (mis. Kantor Yayasan).</li><li>Bila perlu, tetapkan <b>lokasi khusus per akun</b> di menu Kelola Akun (mis. guru kampus cabang).</li><li>Aktifkan <b>Kunci Perangkat</b> agar absensi hanya dari HP yang terdaftar per akun. Perangkat pertama terdaftar otomatis; reset dari Kelola Akun.</li></ol></div>';
    $('#lkAdd', el).onclick = function () { lokasiForm({}, function () { self.load(el, true); }); };
    $('#lkMap', el).onclick = function () { petaGeofence((self.d && self.d.rows || []).filter(function (l) { return l.aktif !== 'TIDAK'; }), null); };
    el.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-lk]'); if (!b) return;
      var l = (self.d.rows || []).filter(function (x) { return x.lokasi_id === b.dataset.lk; })[0];
      if (b.dataset.op === 'edit') return lokasiForm(l, function () { self.load(el, true); });
      if (b.dataset.op === 'map') return petaGeofence([l], null);
      if (b.dataset.op === 'del') { if (!await confirmBox('Hapus lokasi ' + l.nama + '?' + (l.akun ? '\n' + l.akun + ' akun yang memakai lokasi khusus ini akan kembali ke semua lokasi.' : ''), { danger: true, ok: 'Hapus' })) return; var r = await api('lokasi.delete', { lokasi_id: l.lokasi_id }); if (toastRes(r)) { self.load(el, true); afterWrite(); } }
    });
  },
  render: function (el) { this.cfgForm(el); this.load(el, false); },
  load: function (el, force) {
    var self = this;
    return swr('a:lokasi.list', 'lokasi.list', force ? { _fresh: true } : {}, function (d) { self.d = d; self.list(el); }, { fresh: 60000, force: force, onError: function (r) { $('#lkList', el).innerHTML = errorBox(r.message); } });
  },
  list: function (el) {
    var d = this.d, rows = d.rows || [];
    $('#lkList', el).innerHTML = (d.bawaan ? '<div class="note warn">' + ic('info') + '<div>Belum ada lokasi di daftar — sistem memakai titik bawaan dari Pengaturan (<b>' + esc(d.bawaan.nama) + '</b>, radius ' + d.bawaan.radius_m + ' m). Tambahkan lokasi agar bisa mengatur multi-lokasi.</div></div>' : '') +
      (rows.length ? '<div class="grid g2" style="gap:14px">' + rows.map(function (l) {
        return '<div class="card card-p lok-card' + (l.aktif === 'TIDAK' ? ' off' : '') + '"><div class="row gap12"><span class="ic-box">' + ic(l.tipe === 'Kantor' ? 'building-2' : l.tipe === 'Asrama' ? 'bed-double' : 'school') + '</span><div class="grow"><b>' + esc(l.nama) + '</b><div class="xs muted">' + esc(l.tipe) + ' • ' + esc(l.alamat || 'tanpa alamat') + '</div></div>' + (l.aktif === 'TIDAK' ? '<span class="bdg">Nonaktif</span>' : '<span class="bdg ok">Aktif</span>') + '</div>' +
          '<div class="row wrap gap8 mt12"><span class="bdg info">' + ic('circle-dot') + 'Radius ' + l.radius_m + ' m</span><span class="bdg">' + ic('users') + (l.berlaku === 'Semua' ? 'Guru & Siswa' : esc(l.berlaku) + ' saja') + '</span>' + (l.akun ? '<span class="bdg amber">' + l.akun + ' akun khusus</span>' : '') + '</div>' +
          '<div class="mono xs muted mt8">' + esc(l.latitude) + ', ' + esc(l.longitude) + '</div>' +
          '<div class="row gap8 mt12"><button class="btn btn-soft btn-sm" data-lk="' + esc(l.lokasi_id) + '" data-op="map">' + ic('map') + 'Peta</button><button class="btn btn-outline btn-sm" data-lk="' + esc(l.lokasi_id) + '" data-op="edit">' + ic('pencil') + 'Ubah</button><button class="btn-ic" data-lk="' + esc(l.lokasi_id) + '" data-op="del" title="Hapus">' + ic('trash-2') + '</button></div></div>';
      }).join('') + '</div>' : '<div class="card">' + emptyHtml('Belum ada lokasi', 'Klik "Tambah Lokasi" untuk menentukan titik kantor/sekolah.', 'map-pin-off') + '</div>');
  },
  cfgForm: function (el) {
    var c = (AppState.boot || {}).cfg || {}, f = $('#lkCfg', el);
    var sel = function (k, opts) { return '<select class="sel" name="' + k + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(c[k]) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; };
    f.innerHTML = '<div class="field"><label>Kunci perangkat per akun</label>' + sel('KUNCI_PERANGKAT', [['TIDAK', 'Tidak — boleh dari perangkat mana pun'], ['YA', 'Ya — hanya perangkat terdaftar']]) + '</div>' +
      '<div class="field c6"><label>Toleransi akurasi GPS (m)</label><input class="inp" type="number" min="0" max="100" name="GPS_TOLERANSI_M" value="' + esc(c.GPS_TOLERANSI_M || 15) + '"><div class="hint">Ditambahkan ke radius bila sinyal GPS kurang akurat.</div></div>' +
      '<div class="field c6"><label>GPS guru saat scan barcode</label>' + sel('GPS_WAJIB_SCAN', [['YA', 'Wajib'], ['TIDAK', 'Tidak wajib']]) + '</div>' +
      '<div class="field c6"><label>Jam masuk guru</label><input class="inp" type="time" name="JAM_MASUK_GURU" value="' + esc(c.JAM_MASUK_GURU || '07:00') + '"></div><div class="field c6"><label>Jam pulang guru</label><input class="inp" type="time" name="JAM_PULANG_GURU" value="' + esc(c.JAM_PULANG_GURU || '15:00') + '"></div>' +
      '<div class="field c6"><label>Selfie presensi guru</label>' + sel('PRESENSI_GURU_SELFIE', [['TIDAK', 'Tidak wajib'], ['YA', 'Wajib saat masuk']]) + '</div><div class="field c6"><label>Batas jam masuk siswa</label><input class="inp" type="time" name="JAM_MASUK" value="' + esc(c.JAM_MASUK || '07:15') + '"></div>' +
      '<div class="field row between"><span class="xs muted">Disimpan ke Pengaturan sekolah</span><button class="btn btn-dark" type="submit">' + ic('save') + 'Simpan Aturan</button></div>';
    f.onsubmit = async function (e) {
      e.preventDefault(); var btn = $('button[type=submit]', f); btnBusy(btn, true);
      var r = await api('config.save', { pairs: formData(f) }); btnBusy(btn, false);
      if (toastRes(r)) { (AppState.boot || {}).cfg = Object.assign((AppState.boot || {}).cfg || {}, r.data); afterWrite(); }
    };
  }
});

// =====================================================================
// KEAMANAN — gas-rahasia-script-properties
// =====================================================================
registerPage('guru', 'keamanan', {
  title: 'Keamanan', sa: true,
  render: function (el) {
    var self = this;
    el.innerHTML = pageHead('Super Admin <span>/ Keamanan</span>', 'Keamanan & Rahasia', 'Semua rahasia (secret sesi, hash sandi, token WhatsApp, kunci QR kwitansi) disimpan hanya di Script Properties — tidak di Sheets, kode, log, maupun browser.') +
      '<div class="grid g2"><div class="card"><div class="card-h"><div class="grow"><h3>' + ic('key-round') + ' Rahasia Pihak Ketiga</h3><p>Diisi dari sini, tersimpan di Script Properties, tampil tersamar</p></div></div><div class="card-b" id="kmItems"><div class="sk" style="height:120px"></div></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>' + ic('shield-check') + ' Status Sistem</h3><p>Rahasia internal dibangkitkan otomatis — tidak pernah diketik manusia</p></div></div><div class="card-b" id="kmStatus"><div class="sk" style="height:120px"></div></div></div></div>' +
      '<div class="grid g2 mt24"><div class="card card-p"><h3>' + ic('life-buoy', 'amber') + ' Lupa sandi Super Admin?</h3><ol class="small" style="margin:8px 0 0;padding-left:18px;line-height:1.85"><li>Buka <b>script.google.com</b> → proyek SIAKAD (akun pemilik).</li><li>Buka file <span class="kbd">Admin.gs</span>. Opsional: isi <span class="kbd">RESET_SA_EMAIL</span> dengan email akun yang ingin dipulihkan.</li><li>Pilih fungsi <span class="kbd">resetSuperAdmin</span> di toolbar → klik <b>▶ Jalankan</b>.</li><li>Buka <b>Log eksekusi</b>, catat email & sandi baru (tampil sekali), lalu login dan ganti sandi.</li></ol><div class="note mt12">' + ic('info') + '<div>Akun Super Admin terkunci 15 menit setelah 5 kali salah sandi; resetSuperAdmin() juga melepas kunci ini.</div></div></div>' +
      '<div class="card card-p"><h3>' + ic('rotate-ccw-key') + ' Keluarkan Semua Pengguna</h3><p class="small muted">Merotasi secret sesi: seluruh token login (termasuk Anda) langsung tidak berlaku. Gunakan bila curiga ada kebocoran sesi.</p><button class="btn btn-danger mt12" id="kmRot">' + ic('triangle-alert') + 'Rotasi Secret Sesi</button>' +
      '<div class="note mt16">' + ic('users-round') + '<div>Batasi siapa yang punya akses <b>edit</b> ke proyek Apps Script — editor proyek dapat melihat Script Properties.</div></div></div></div>';
    $('#kmRot', el).onclick = async function () {
      var k = await promptBox('Rotasi Secret Sesi', 'Ketik ROTASI untuk konfirmasi:', '');
      if (k !== 'ROTASI') return;
      var r = await api('rahasia.rotasiSesi', { konfirmasi: 'ROTASI' });
      if (toastRes(r)) setTimeout(logout, 900);
    };
    this.load(el);
  },
  load: function (el) {
    var self = this;
    swr('a:rahasia.status', 'rahasia.status', {}, function (d) { self.draw(el, d); }, { fresh: 15000, onError: function (r) { $('#kmItems', el).innerHTML = errorBox(r.message); } });
  },
  draw: function (el, d) {
    var self = this;
    $('#kmItems', el).innerHTML = d.items.map(function (it) {
      return '<form class="list-i" style="flex-wrap:wrap" data-k="' + esc(it.kunci) + '"><div class="grow" style="min-width:200px"><b>' + esc(it.label) + '</b><small>' + (it.ada ? '<span class="ok-t">● tersimpan</span> <span class="mono">' + esc(it.samar) + '</span>' : '<span class="amber">● belum diisi</span>') + '</small></div>' +
        '<input class="inp mono" type="password" autocomplete="off" name="nilai" placeholder="' + (it.ada ? 'Isi untuk mengganti' : 'Tempel nilai baru') + '" style="max-width:240px"><button class="btn btn-primary btn-sm" type="submit">Simpan</button>' + (it.ada ? '<button class="btn btn-ghost btn-sm" type="button" data-del>Hapus</button>' : '') + '</form>';
    }).join('') + '<div class="xs muted mt8">Nilai yang diketik tidak pernah dikirim balik ke browser maupun dicatat di log.</div>';
    $$('#kmItems form', el).forEach(function (f) {
      f.onsubmit = async function (e) { e.preventDefault(); var v = f.nilai.value.trim(); if (!v) return toast('Isi nilainya dulu.', 'warn'); var b = $('button[type=submit]', f); btnBusy(b, true); var r = await api('rahasia.simpan', { kunci: f.dataset.k, nilai: v }); btnBusy(b, false); f.nilai.value = ''; if (toastRes(r)) { Store.del(userKey('a:rahasia.status')); self.load(el); } };
      var del = $('[data-del]', f); if (del) del.onclick = async function () { if (!await confirmBox('Hapus rahasia ini?', { danger: true })) return; var r = await api('rahasia.simpan', { kunci: f.dataset.k, nilai: '__HAPUS__' }); if (toastRes(r)) { Store.del(userKey('a:rahasia.status')); self.load(el); } };
    });
    $('#kmStatus', el).innerHTML = '<dl class="kv-list">' + d.internal.map(function (i) { return '<dt>' + esc(i.label) + '</dt><dd>' + (i.ada ? '<span class="bdg ok">' + ic('check') + 'Ada</span>' : '<span class="bdg bad">Belum — jalankan setupV21()</span>') + '</dd>'; }).join('') +
      '<dt>Hash sandi</dt><dd>HMAC-SHA256 × ' + d.hashIterasi + ' + salt unik, di Script Properties</dd><dt>Masa sesi</dt><dd>' + d.sesiJam + ' jam (Super Admin maks 8 jam)</dd><dt>Versi server</dt><dd class="mono">' + esc(Perf.serverVersion || '-') + '</dd></dl>' +
      '<div class="xs b muted mt16">AKUN SUPER ADMIN</div>' + d.superadmin.map(function (s) { return '<div class="list-i mt8">' + avatar(s.nama, '', 'sm') + '<div class="grow"><b>' + esc(s.nama) + '</b><small>' + esc(s.email) + '</small></div>' + (s.terkunci ? '<span class="bdg bad">Terkunci</span>' : s.aktif ? '<span class="bdg ok">Aktif</span>' : '<span class="bdg">Nonaktif</span>') + '</div>'; }).join('');
  }
});
