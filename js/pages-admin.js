/* =====================================================================
   SIAKAD SISWA — pages-admin.js
   WhatsApp & Notifikasi (blast batch, antrean, konfigurasi + matriks),
   CRM Kontak (Nama · Email · WA), Migrasi Data (import app lama + CSV).
   ===================================================================== */
'use strict';
function waBadge(s) { return s === 'Terdaftar' ? '<span class="wa-badge ya">✓ WA</span>' : s === 'Tidak Terdaftar' ? '<span class="wa-badge tidak">✕ bukan WA</span>' : '<span class="wa-badge belum">? belum dicek</span>'; }
function waFormat(t) { return esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>'); }
function jedaRata(j) { var p = String(j || '5').split('-').map(Number); return p.length > 1 ? (p[0] + p[1]) / 2 : p[0] || 5; }

// =====================================================================
// WHATSAPP & NOTIFIKASI
// =====================================================================
registerPage('guru', 'notifikasi', {
  sa: true,
  title: 'WhatsApp & Notifikasi',
  st: { tab: 'blast', sumber: 'crm', segmen: 'Orang Tua', kelas: '', statusWA: '', manual: '', aud: null, sel: {}, onlyWA: false, judul: '', pesan: 'Yth. {nama},\n\n\n— {institusi}', batch: 20, jeda: '5', active: null, auto: false, qStatus: '', qKanal: '', cfg: null },
  init: function (el) {
    var self = this;
    el.innerHTML = pageHead('Komunikasi <span>// WhatsApp (Fonnte) & Email</span>', 'WhatsApp & Notifikasi', 'Kirim blast WhatsApp per batch anti-banned, pantau antrean notifikasi otomatis, dan atur event mana yang dikirim ke orang tua/siswa.') +
      '<div class="tabs" id="ntTabs"><button data-t="blast">' + ic('megaphone') + 'Blast WhatsApp</button><button data-t="antrean">' + ic('inbox') + 'Antrean & Riwayat</button><button data-t="konfigurasi">' + ic('settings-2') + 'Konfigurasi</button></div><div id="ntStatus" class="mt16"></div><div id="ntBody" class="mt16"></div>';
    $$('#ntTabs button', el).forEach(function (b) { b.onclick = function () { go('notifikasi', b.dataset.t); }; });
  },
  render: function (el, param) {
    var st = this.st; if (param) st.tab = param;
    $$('#ntTabs button', el).forEach(function (b) { b.classList.toggle('on', b.dataset.t === st.tab); });
    var self = this;
    swr('a:notif.config', 'notif.config', {}, function (c) { st.cfg = c; self.statusBar(el); if (st.tab === 'konfigurasi' && !self._cfgDirty) self.t_konfigurasi($('#ntBody', el)); }, { fresh: 30000 });
    this['t_' + st.tab]($('#ntBody', el));
    this.statusBar(el);
  },
  statusBar: function (el) {
    var c = this.st.cfg; if (!c) return;
    $('#ntStatus', el).innerHTML = '<div class="row wrap gap12"><span class="bdg ' + (c.waAktif && c.tokenAda ? 'ok' : 'bad') + ' dot">WhatsApp ' + (c.waAktif && c.tokenAda ? 'AKTIF' : 'NONAKTIF') + '</span><span class="bdg ' + (c.emailAktif ? 'ok' : 'bad') + ' dot">Email ' + (c.emailAktif ? 'AKTIF' : 'NONAKTIF') + '</span><span class="bdg ' + (c.trigger ? 'info' : 'warn') + '">' + ic('timer') + (c.trigger ? 'Pengirim otomatis tiap 1 menit' : 'Trigger belum terpasang') + '</span><span class="bdg">' + ic('mail') + 'Sisa kuota email hari ini: ' + c.sisaKuotaEmail + '</span>' + (!(c.waAktif && c.tokenAda) ? '<a href="#/notifikasi/konfigurasi" class="small b">Aktifkan di Konfigurasi ›</a>' : '') + '</div>';
  },
  // ------------------------------------------------ BLAST
  t_blast: function (box) {
    var st = this.st, self = this;
    var titip = sessionStorage.getItem('blastPenerima');
    if (titip) { try { var arr = JSON.parse(titip); st.sumber = 'titipan'; st.aud = { rows: arr.map(function (x) { return Object.assign({ valid: /^08\d{8,12}$/.test(hp08(x.hp)), ganda: false, statusWA: '', optOut: false }, x, { hp: hp08(x.hp) }); }), ringkas: null }; st.sel = {}; st.aud.rows.forEach(function (r) { if (r.valid) st.sel[r.hp] = 1; }); } catch (e) {} sessionStorage.removeItem('blastPenerima'); }
    var ps = sessionStorage.getItem('blastPesan'); if (ps) { st.pesan = ps; st.judul = 'Undangan Remedial'; sessionStorage.removeItem('blastPesan'); }
    box.innerHTML = '<div class="grid g2"><div class="card"><div class="card-h"><div class="grow"><h3>1. Pilih Sasaran</h3><p>Default dari CRM Kontak (siswa, orang tua, guru)</p></div></div><div class="card-b">' +
      '<div class="grid-form"><div class="field c6"><label>Sumber</label><select class="sel" id="bSumber"><option value="crm">CRM Kontak</option><option value="manual">Tempel manual</option>' + (st.sumber === 'titipan' ? '<option value="titipan">Terpilih dari halaman lain</option>' : '') + '</select></div><div class="field c6" data-crm><label>Segmen</label><select class="sel" id="bSeg"><option value="">Semua</option><option>Orang Tua</option><option>Siswa</option><option>Guru</option><option>Lainnya</option></select></div>' +
      '<div class="field c6" data-crm><label>Kelas</label><select class="sel" id="bKelas">' + kelasOpts(st.kelas, 'Semua Kelas') + '</select></div><div class="field c6" data-crm><label>Status WA</label><select class="sel" id="bSW"><option value="">Semua</option><option>Terdaftar</option><option>Tidak Terdaftar</option><option value="Belum">Belum dicek</option></select></div>' +
      '<div class="field" data-man hidden><label>Nomor (satu per baris, format: 0812…|Nama)</label><textarea class="inp mono" id="bManual" rows="5" placeholder="081234567890|Bapak Budi">' + esc(st.manual) + '</textarea></div></div>' +
      '<div class="row wrap gap12 mt16"><button class="btn btn-primary" id="bLoad">' + ic('users') + 'Muat Penerima</button><button class="btn btn-soft" id="bDetect">' + ic('smartphone') + 'Deteksi Nomor WA</button><span class="small muted" id="bProg"></span></div>' +
      '<div id="bRing" class="row wrap gap4 mt12"></div><label class="chk small mt12"><input type="checkbox" id="bOnly" ' + (st.onlyWA ? 'checked' : '') + '> Kirim hanya ke nomor terdeteksi WhatsApp</label><div id="bList" class="mt12" style="max-height:360px;overflow:auto"></div></div></div>' +
      '<div class="card"><div class="card-h"><div class="grow"><h3>2. Tulis Pesan</h3><p>Gunakan variabel agar pesan personal</p></div></div><div class="card-b"><div class="field"><label>Judul internal</label><input class="inp" id="bJudul" value="' + esc(st.judul) + '" placeholder="Undangan rapat orang tua"></div>' +
      '<div class="row wrap gap4 mt12">' + ['nama', 'siswa', 'kelas', 'nis', 'institusi', 'link'].map(function (v) { return '<button class="btn btn-soft btn-xs" data-var="{' + v + '}">{' + v + '}</button>'; }).join('') + '</div><textarea class="inp mt8" id="bPesan" rows="7">' + esc(st.pesan) + '</textarea>' +
      '<div class="lbl mt12">Pratinjau (penerima pertama)</div><div class="wa-preview"><div class="wa-bubble" id="bPrev"></div></div>' +
      '<h3 class="mt24" style="font-size:16px">3. Ukuran Batch & Jeda</h3><div class="row wrap gap16 mt12"><div class="seg-batch" id="bBatch">' + [10, 20, 50].map(function (n) { return '<button data-b="' + n + '" class="' + (st.batch === n ? 'on' : '') + '">' + n + '</button>'; }).join('') + '</div><div class="field" style="width:150px"><div class="inp-ic">' + ic('timer') + '<input class="inp" id="bJeda" value="' + esc(st.jeda) + '" placeholder="5 atau 3-8"></div></div><span class="small muted">detik antarpesan</span></div>' +
      '<div class="note mt12" id="bSum"></div><button class="btn btn-accent btn-lg btn-block mt16" id="bGo">' + ic('rocket') + 'Mulai Blast</button></div></div></div>' +
      '<div id="bActive" class="mt24"></div><div class="card mt24"><div class="card-h"><div class="grow"><h3>Riwayat Blast</h3><p>100 blast terakhir</p></div><button class="btn btn-ghost btn-sm" id="bHistRef">' + ic('refresh-cw') + '</button></div><div class="card-b" style="padding:12px 0 0" id="bHist"></div></div>';
    $('#bSumber', box).value = st.sumber; $('#bSeg', box).value = st.segmen; $('#bSW', box).value = st.statusWA;
    var mode = function () { var man = st.sumber === 'manual'; $$('[data-crm]', box).forEach(function (x) { x.hidden = st.sumber !== 'crm'; }); $$('[data-man]', box).forEach(function (x) { x.hidden = !man; }); };
    mode();
    $('#bSumber', box).onchange = function () { st.sumber = this.value; mode(); };
    $('#bSeg', box).onchange = function () { st.segmen = this.value; };
    $('#bKelas', box).onchange = function () { st.kelas = this.value; };
    $('#bSW', box).onchange = function () { st.statusWA = this.value; };
    $('#bManual', box).oninput = function () { st.manual = this.value; };
    $('#bOnly', box).onchange = function () { st.onlyWA = this.checked; self.list(box); };
    $('#bLoad', box).onclick = function () { self.loadAud(box, this); };
    $('#bDetect', box).onclick = function () { self.detect(box, this); };
    $('#bJudul', box).oninput = function () { st.judul = this.value; };
    $('#bPesan', box).oninput = function () { st.pesan = this.value; self.prev(box); };
    $$('[data-var]', box).forEach(function (b) { b.onclick = function () { var t = $('#bPesan', box), p = t.selectionStart || t.value.length; t.value = t.value.slice(0, p) + b.dataset.var + t.value.slice(p); t.focus(); t.selectionStart = t.selectionEnd = p + b.dataset.var.length; st.pesan = t.value; self.prev(box); }; });
    $$('#bBatch button', box).forEach(function (b) { b.onclick = function () { st.batch = Number(b.dataset.b); $$('#bBatch button', box).forEach(function (x) { x.classList.toggle('on', x === b); }); self.sum(box); }; });
    $('#bJeda', box).oninput = function () { st.jeda = this.value.trim(); self.sum(box); };
    $('#bGo', box).onclick = function () { self.create(box, this); };
    $('#bHistRef', box).onclick = function () { self.hist(box, true); };
    box.onchange = function (e) { if (e.target.matches('[data-r]')) { if (e.target.checked) st.sel[e.target.dataset.r] = 1; else delete st.sel[e.target.dataset.r]; self.sum(box); self.prev(box); } if (e.target.matches('#bAll')) { self.visible().forEach(function (r) { if (r.valid && !r.ganda && !r.optOut) { if (e.target.checked) st.sel[r.hp] = 1; else delete st.sel[r.hp]; } }); self.list(box); } };
    box.addEventListener('click', function (e) { var t = e.target.closest('[data-bl]'); if (!t) return; if (t.dataset.op === 'stop') self.stop(box, t.dataset.bl); else { st.active = t.dataset.bl; self.activeCard(box); } });
    if (st.aud) this.list(box);
    this.prev(box); this.sum(box); this.hist(box);
  },
  visible: function () { var st = this.st; return ((st.aud && st.aud.rows) || []).filter(function (r) { return !st.onlyWA || r.statusWA === 'Terdaftar'; }); },
  loadAud: async function (box, btn) {
    var st = this.st; btnBusy(btn, true);
    var r = await api('wa.audience', { sumber: st.sumber === 'manual' ? 'manual' : 'crm', manual: st.manual, segmen: st.segmen, kelas_id: st.kelas, statusWA: st.statusWA });
    btnBusy(btn, false); if (!r.success) return toast(r.message, 'bad');
    st.aud = r.data; st.sel = {}; r.data.rows.forEach(function (x) { if (x.valid && !x.ganda && !x.optOut) st.sel[x.hp] = 1; });
    this.list(box);
    if (!r.data.rows.length && st.sumber === 'crm') toast('Belum ada kontak. Buka menu CRM Kontak lalu klik Sinkron.', 'warn');
  },
  list: function (box) {
    var st = this.st, a = st.aud; if (!a) return;
    var rows = a.rows, rg = a.ringkas || { total: rows.length, valid: rows.filter(function (r) { return r.valid; }).length, tidakValid: rows.filter(function (r) { return !r.valid; }).length, ganda: 0, optOut: 0, terdaftarWA: 0 };
    $('#bRing', box).innerHTML = '<span class="bdg">Total ' + rg.total + '</span><span class="bdg ok">Valid ' + rg.valid + '</span><span class="bdg bad">Tidak valid ' + rg.tidakValid + '</span><span class="bdg warn">Ganda ' + (rg.ganda || 0) + '</span><span class="bdg">Opt-out ' + (rg.optOut || 0) + '</span><span class="bdg info">✓ WA ' + rows.filter(function (r) { return r.statusWA === 'Terdaftar'; }).length + '</span>';
    var vis = this.visible();
    $('#bList', box).innerHTML = vis.length ? '<table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" id="bAll" aria-label="Pilih semua"></th><th>Nama</th><th>Nomor</th><th>WA</th></tr></thead><tbody>' + vis.slice(0, 500).map(function (r) {
      var dis = !r.valid || r.ganda || r.optOut;
      return '<tr style="' + (dis ? 'opacity:.45' : '') + '"><td><input type="checkbox" data-r="' + esc(r.hp) + '" ' + (st.sel[r.hp] && !dis ? 'checked' : '') + ' ' + (dis ? 'disabled' : '') + '></td><td><b class="small">' + esc(r.nama) + '</b>' + (r.vars && r.vars.siswa ? '<div class="xs muted">' + esc(r.vars.siswa) + (r.vars.kelas ? ' • ' + esc(r.vars.kelas) : '') + '</div>' : '') + (r.optOut ? '<div class="xs red">Opt-out</div>' : r.ganda ? '<div class="xs amber">Nomor ganda</div>' : !r.valid ? '<div class="xs red">Nomor tidak valid</div>' : '') + '</td><td class="mono xs">' + esc(r.hp || '-') + '</td><td>' + waBadge(r.statusWA) + '</td></tr>';
    }).join('') + '</tbody></table>' + (vis.length > 500 ? '<div class="xs muted tc mt8">Menampilkan 500 pertama dari ' + vis.length + ' (semua tetap bisa dikirim).</div>' : '') : emptyHtml('Tidak ada penerima', '', 'users');
    this.sum(box); this.prev(box);
  },
  detect: async function (box, btn) {
    var st = this.st; if (!st.aud) return toast('Muat penerima terlebih dahulu.', 'warn');
    var nomor = st.aud.rows.filter(function (r) { return r.valid && !r.statusWA; }).map(function (r) { return r.hp; });
    nomor = nomor.filter(function (n, i) { return nomor.indexOf(n) === i; });
    if (!nomor.length) return toast('Semua nomor sudah dicek.', 'ok');
    btnBusy(btn, true);
    for (var i = 0; i < nomor.length; i += 50) {
      $('#bProg', box).textContent = 'Mengecek ' + Math.min(i + 50, nomor.length) + '/' + nomor.length + '…';
      var r = await api('wa.validate', { nomor: nomor.slice(i, i + 50) });
      if (!r.success) { toast(r.message, 'bad'); break; }
      st.aud.rows.forEach(function (x) { if (r.data.hasil[x.hp]) x.statusWA = r.data.hasil[x.hp]; });
      this.list(box);
    }
    btnBusy(btn, false); $('#bProg', box).textContent = 'Selesai.';
  },
  chosen: function () { var st = this.st; return this.visible().filter(function (r) { return st.sel[r.hp] && r.valid && !r.ganda && !r.optOut; }); },
  prev: function (box) {
    var st = this.st, r = this.chosen()[0] || { nama: 'Bapak/Ibu', vars: {} }, c = B().cfg || {};
    var v = Object.assign({ nama: r.nama, institusi: c.NAMA_SEKOLAH || 'Sekolah', link: (st.cfg && st.cfg.appUrl) || location.origin + location.pathname, siswa: '', kelas: '', nis: '' }, r.vars || {});
    $('#bPrev', box).innerHTML = waFormat(String(st.pesan).replace(/\{(\w+)\}/g, function (m, k) { return v[k] == null ? '' : v[k]; })) + '<div class="t">' + nowHM() + ' ✓✓</div>';
  },
  sum: function (box) {
    var st = this.st, n = this.chosen().length, batch = Math.ceil(n / st.batch), menit = Math.ceil(n * jedaRata(st.jeda) / 60);
    $('#bSum', box).innerHTML = ic('calculator') + '<div><b>' + n + ' penerima → ' + batch + ' batch</b> • estimasi ±' + menit + ' menit (1 batch diproses tiap menit oleh server, atau tekan "Kirim batch berikutnya").<br><span class="xs">Tips anti-banned: mulai batch 10, jeda acak ≥5 detik, hindari link sama ke ratusan orang dalam 1 jam.</span></div>';
    $('#bGo', box).innerHTML = ic('rocket') + 'Mulai Blast (' + n + ' nomor)';
  },
  create: async function (box, btn) {
    var st = this.st, pen = this.chosen();
    if (!pen.length) return toast('Belum ada penerima dipilih.', 'warn');
    if (!st.pesan.trim()) return toast('Pesan masih kosong.', 'warn');
    if (!await confirmBox('Kirim blast ke ' + pen.length + ' nomor dalam ' + Math.ceil(pen.length / st.batch) + ' batch?')) return;
    btnBusy(btn, true);
    var r = await api('wa.blastCreate', { judul: st.judul || 'Blast ' + tglIndo(todayStr(), true), pesan: st.pesan, ukuranBatch: st.batch, jeda: st.jeda, sasaran: st.sumber === 'crm' ? (st.segmen || 'Semua') + (st.kelas ? ' • ' + kelasNama(st.kelas) : '') : st.sumber, penerima: pen.map(function (p) { return { hp: p.hp, nama: p.nama, id: p.id, vars: p.vars }; }) });
    btnBusy(btn, false);
    if (!toastRes(r)) return;
    st.active = r.data.blastId; Store.del(userKey('a:wa.blastList'));
    await this.hist(box, true); this.activeCard(box);
  },
  hist: async function (box, force) {
    var self = this;
    await swr('a:wa.blastList', 'wa.blastList', {}, function (list) {
      self._blasts = list;
      $('#bHist', box).innerHTML = list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Judul</th><th class="hide-m">Sasaran</th><th>Batch · Jeda</th><th>Progres</th><th>Status</th><th class="tr">Aksi</th></tr></thead><tbody>' + list.map(function (b) { return '<tr><td><b class="small">' + esc(b.Judul) + '</b><div class="xs muted">' + esc(relTime(b.Tanggal)) + ' • ' + esc(b.DibuatOleh) + '</div></td><td class="hide-m small">' + esc(b.Sasaran || '-') + '</td><td class="small">' + b.UkuranBatch + ' · ' + esc(b.JedaDetik) + ' dtk</td><td style="min-width:140px"><div class="bar"><i class="' + (b.Gagal ? 'amber' : '') + '" style="width:' + b.persen + '%"></i></div><div class="xs muted mt8">' + b.Terkirim + ' terkirim • ' + b.Gagal + ' gagal • ' + b.sisa + ' sisa</div></td><td><span class="bdg ' + (b.Status === 'Selesai' ? 'ok' : b.Status === 'Berjalan' ? 'info' : 'warn') + '">' + esc(b.Status) + '</span></td><td class="tr nowrap">' + (b.Status === 'Berjalan' ? '<button class="btn btn-soft btn-xs" data-bl="' + esc(b.BlastID) + '">Pantau</button> <button class="btn btn-danger btn-xs" data-bl="' + esc(b.BlastID) + '" data-op="stop">Hentikan</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : emptyHtml('Belum ada blast', '', 'megaphone');
      if (!self.st.active) { var run = list.filter(function (b) { return b.Status === 'Berjalan'; })[0]; if (run) { self.st.active = run.BlastID; self.activeCard(box); } }
    }, { fresh: 10000, force: !!force });
  },
  activeCard: function (box) {
    var st = this.st, self = this, b = (this._blasts || []).filter(function (x) { return x.BlastID === st.active; })[0];
    var el = $('#bActive', box); if (!el) return;
    if (!b) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="card card-p" style="border:2px solid var(--navy-ink)"><div class="row wrap gap12"><div class="grow"><div class="eyebrow">Blast aktif</div><h3>' + esc(b.Judul) + '</h3></div><span class="bdg ' + (b.Status === 'Berjalan' ? 'info' : b.Status === 'Selesai' ? 'ok' : 'warn') + '">' + esc(b.Status) + '</span></div>' +
      '<div class="bar mt12" style="height:12px"><i style="width:' + b.persen + '%"></i></div><div class="row wrap gap16 mt8 small"><span><b>' + b.Terkirim + '</b> terkirim</span><span class="red"><b>' + b.Gagal + '</b> gagal</span><span><b>' + b.sisa + '</b> sisa dari ' + b.Total + '</span><span class="muted">' + b.persen + '%</span></div>' +
      (b.Status === 'Berjalan' ? '<div class="row wrap gap12 mt16"><button class="btn btn-primary" id="baNext">' + ic('send') + 'Kirim Batch Berikutnya Sekarang</button><label class="chk"><span class="toggle"><input type="checkbox" id="baAuto" ' + (st.auto ? 'checked' : '') + '><span></span></span> Otomatis <span class="small muted" id="baCd"></span></label><button class="btn btn-danger" id="baStop">' + ic('circle-stop') + 'Hentikan</button></div><div class="xs muted mt12">' + ic('info') + ' Server tetap mengirim 1 batch/menit walau halaman ini ditutup.</div>' : '') + '</div>';
    if (b.Status !== 'Berjalan') { st.auto = false; clearInterval(this._cd); return; }
    $('#baNext', el).onclick = function () { self.next(box, this); };
    $('#baStop', el).onclick = function () { self.stop(box, b.BlastID); };
    $('#baAuto', el).onchange = function () { st.auto = this.checked; self.autoLoop(box); };
    this.autoLoop(box);
  },
  autoLoop: function (box) {
    var st = this.st, self = this; clearInterval(this._cd);
    if (!st.auto) { if ($('#baCd', box)) $('#baCd', box).textContent = ''; return; }
    var b = (this._blasts || []).filter(function (x) { return x.BlastID === st.active; })[0]; if (!b) return;
    var left = Math.max(30, Math.round(b.UkuranBatch * jedaRata(b.JedaDetik)));
    this._cd = setInterval(function () {
      if (!$('#baCd', box) || box.closest('.page').hidden) { return; }
      left--; $('#baCd', box).textContent = '(' + left + ' dtk)';
      if (left <= 0) { clearInterval(self._cd); self.next(box, $('#baNext', box)); }
    }, 1000);
  },
  next: async function (box, btn) {
    var st = this.st; btnBusy(btn, true);
    var r = await api('wa.blastProcess', { blastId: st.active });
    btnBusy(btn, false);
    if (r.success && r.data.blast) { var list = this._blasts || [], i = list.findIndex(function (x) { return x.BlastID === st.active; }); if (i > -1) list[i] = r.data.blast; toast(r.message, 'ok'); }
    else toast(r.message, 'bad');
    Store.del(userKey('a:wa.blastList')); await this.hist(box, true); this.activeCard(box);
  },
  stop: async function (box, id) {
    if (!await confirmBox('Hentikan blast? Pesan yang belum terkirim dibatalkan.', { danger: true, ok: 'Hentikan' })) return;
    var r = await api('wa.blastStop', { blastId: id }); toastRes(r);
    this.st.auto = false; clearInterval(this._cd); await this.hist(box, true); this.activeCard(box);
  },
  // ------------------------------------------------ ANTREAN
  t_antrean: function (box) {
    var st = this.st, self = this;
    box.innerHTML = '<div class="grid g4" id="qKpi"></div><div class="card mt16"><div class="toolbar"><div class="field"><select class="sel" id="qSt"><option value="">Semua Status</option><option>Antri</option><option>Terkirim</option><option>Gagal</option><option>Batal</option></select></div><div class="field"><select class="sel" id="qKn"><option value="">Semua Kanal</option><option value="WA">WhatsApp</option><option value="EMAIL">Email</option></select></div><button class="btn btn-primary" id="qRun">' + ic('play') + 'Proses Sekarang</button><button class="btn btn-soft" id="qRetry">' + ic('rotate-ccw') + 'Ulangi yang Gagal</button><button class="btn btn-ghost" id="qRef">' + ic('refresh-cw') + '</button></div><div id="qTable"></div></div>';
    $('#qSt', box).value = st.qStatus; $('#qKn', box).value = st.qKanal;
    $('#qSt', box).onchange = function () { st.qStatus = this.value; self.queue(box, true); };
    $('#qKn', box).onchange = function () { st.qKanal = this.value; self.queue(box, true); };
    $('#qRef', box).onclick = function () { self.queue(box, true); };
    $('#qRun', box).onclick = async function () { btnBusy(this, true); var r = await api('notif.processNow', {}); btnBusy(this, false); toastRes(r); self.queue(box, true); };
    $('#qRetry', box).onclick = async function () { btnBusy(this, true); var r = await api('notif.retry', {}); btnBusy(this, false); toastRes(r); self.queue(box, true); };
    this.queue(box);
  },
  queue: function (box, force) {
    var st = this.st;
    swr('a:queue:' + st.qStatus + st.qKanal, 'notif.queue', { status: st.qStatus, kanal: st.qKanal }, function (d) {
      var r = d.ringkas;
      $('#qKpi', box).innerHTML = kpi('Menunggu', r.Antri, 'Dikirim otomatis tiap menit', 'hourglass', 'amber') + kpi('Terkirim', r.Terkirim, '3.000 baris terakhir', 'send', 'green') + kpi('Gagal', r.Gagal, 'Setelah 3× percobaan', 'circle-x', 'red') + kpi('Dibatalkan', r.Batal, 'Blast dihentikan', 'ban');
      $('#qTable', box).innerHTML = d.rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Kanal</th><th>Tujuan</th><th class="hide-m">Event</th><th>Pesan</th><th>Status</th></tr></thead><tbody>' + d.rows.map(function (q) { return '<tr><td class="small nowrap">' + esc(relTime(q.DikirimPada || q.DibuatPada)) + '</td><td><span class="bdg ' + (q.Kanal === 'WA' ? 'ok' : 'info') + '">' + ic(q.Kanal === 'WA' ? 'message-circle' : 'mail') + q.Kanal + '</span></td><td class="small"><b>' + esc(q.NamaPenerima) + '</b><div class="mono xs muted">' + esc(q.Tujuan) + '</div></td><td class="hide-m"><span class="bdg mono xs">' + esc(q.Event) + '</span></td><td class="small" style="max-width:320px"><div class="clamp2">' + esc(q.Pesan) + '</div></td><td><span class="bdg ' + ({ Terkirim: 'ok', Antri: 'warn', Gagal: 'bad' }[q.Status] || '') + '">' + esc(q.Status) + '</span>' + (q.Respon && q.Status !== 'Terkirim' ? '<div class="xs muted">' + esc(q.Respon) + '</div>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : emptyHtml('Antrean kosong', 'Notifikasi otomatis & blast akan muncul di sini.', 'inbox');
    }, { fresh: 8000, force: !!force, onError: function (r) { $('#qTable', box).innerHTML = errorBox(r.message); } });
  },
  // ------------------------------------------------ KONFIGURASI
  t_konfigurasi: function (box) {
    var st = this.st, self = this, c = st.cfg;
    if (!c) { box.innerHTML = '<div class="sk" style="height:320px"></div>'; return; }
    var mx = c.matriks.map(function (m) { return Object.assign({}, m); });
    this._cfgDirty = false;
    box.innerHTML = '<div class="grid g2"><div class="card card-p"><div class="row between"><h3>' + ic('message-circle', 'green') + ' WhatsApp (Fonnte)</h3><label class="row gap12"><span class="small b" id="waLbl"></span><span class="toggle"><input type="checkbox" id="cfWa" ' + (c.waAktif ? 'checked' : '') + '><span></span></span></label></div>' +
      '<div class="field mt16"><label>Token Fonnte</label><div class="row"><input class="inp mono grow" type="password" id="cfTok" placeholder="' + esc(c.tokenMask || 'Tempel token dari fonnte.com → Device') + '" autocomplete="off">' + (c.tokenAda ? '<button class="btn btn-ghost btn-sm" id="cfTokDel" title="Hapus token">' + ic('trash-2') + '</button>' : '') + '</div><div class="hint">Disimpan aman di Script Properties server, tidak pernah dikirim ke browser.</div></div>' +
      '<div class="row wrap gap12 mt12"><button class="btn btn-soft btn-sm" id="cfDev">' + ic('radar') + 'Cek Perangkat</button><div class="inp-ic" style="flex:1;min-width:160px">' + ic('phone') + '<input class="inp" id="cfTestNo" placeholder="08xxxxxxxxxx" style="height:32px"></div><button class="btn btn-soft btn-sm" id="cfTestWa">' + ic('send') + 'Kirim Tes WA</button></div><div id="cfDevOut" class="mt8"></div>' +
      '<div class="grid-form mt16"><div class="field c6"><label>Batch default blast</label><select class="sel" id="cfBatch">' + [10, 20, 50].map(function (n) { return '<option' + (n === c.batchDefault ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div><div class="field c6"><label>Jeda antarpesan (detik)</label><input class="inp" id="cfJeda" value="' + esc(c.jeda) + '"></div><div class="field"><label class="chk"><input type="checkbox" id="cfDet" ' + (c.deteksiOtomatis ? 'checked' : '') + '> Deteksi otomatis nomor kontak baru terdaftar WA (±10 menit sekali)</label></div></div></div>' +
      '<div class="card card-p"><div class="row between"><h3>' + ic('mail', 'navy') + ' Email (Gmail)</h3><label class="row gap12"><span class="small b" id="emLbl"></span><span class="toggle"><input type="checkbox" id="cfEm" ' + (c.emailAktif ? 'checked' : '') + '><span></span></span></label></div>' +
      '<div class="note mt16">' + ic('gauge') + '<div>Sisa kuota email hari ini: <b>' + c.sisaKuotaEmail + '</b> (akun Gmail biasa ±100/hari, Workspace ±1.500/hari).</div></div>' +
      '<div class="field mt16"><label>Nama pengirim</label><input class="inp" id="cfNama" value="' + esc(c.namaPengirim) + '"></div><div class="row gap12 mt12"><input class="inp" id="cfTestEm" type="email" placeholder="email@contoh.com" style="height:32px"><button class="btn btn-soft btn-sm" id="cfTestEmail">' + ic('send') + 'Kirim Tes Email</button></div>' +
      '<div class="field mt16"><label>URL aplikasi untuk {link}</label><input class="inp" id="cfUrl" value="' + esc(c.appUrl) + '" placeholder="https://username.github.io/siakad/"></div><div class="small mt12">' + (c.trigger ? '<span class="green b">' + ic('circle-check') + ' Trigger pengirim aktif (1 menit)</span>' : '<span class="red b">' + ic('circle-alert') + ' Trigger belum aktif — simpan konfigurasi untuk memasang.</span>') + '</div></div></div>' +
      '<div class="card mt24"><div class="card-h"><div class="grow"><h3>Matriks Notifikasi Otomatis</h3><p>Pilih event × kanal yang dikirim. Klik ✎ untuk mengubah isi pesan.</p></div></div><div class="card-b" style="padding:12px 0 0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Event</th><th class="tc">WhatsApp</th><th class="tc">Email</th><th class="tr">Template</th></tr></thead><tbody id="mxBody"></tbody></table></div></div></div>' +
      '<div class="sticky-bar"><div class="grow small muted">Perubahan berlaku untuk notifikasi berikutnya.</div><button class="btn btn-dark" id="cfSave">' + ic('save') + 'Simpan Konfigurasi</button></div>';
    var lbl = function () { $('#waLbl', box).textContent = $('#cfWa', box).checked ? 'AKTIF' : 'NONAKTIF'; $('#emLbl', box).textContent = $('#cfEm', box).checked ? 'AKTIF' : 'NONAKTIF'; drawMx(); };
    function drawMx() {
      var waOn = $('#cfWa', box).checked, emOn = $('#cfEm', box).checked;
      $('#mxBody', box).innerHTML = mx.map(function (m, i) { return '<tr><td><b class="small">' + esc(m.label) + '</b><div class="xs mono muted">' + esc(m.kode) + '</div></td><td class="tc"><span class="toggle" style="display:inline-block"><input type="checkbox" data-mx="' + i + '" data-k="wa" ' + (m.wa ? 'checked' : '') + ' ' + (waOn ? '' : 'disabled') + '><span></span></span></td><td class="tc"><span class="toggle" style="display:inline-block"><input type="checkbox" data-mx="' + i + '" data-k="email" ' + (m.email ? 'checked' : '') + ' ' + (emOn ? '' : 'disabled') + '><span></span></span></td><td class="tr"><button class="btn btn-soft btn-xs" data-edit="' + i + '">' + ic('pencil') + 'Ubah</button></td></tr>' +
        (m._open ? '<tr><td colspan="4" style="background:#FAFAFE"><div class="grid g2"><div><div class="field"><label>Subjek email</label><input class="inp" data-sub="' + i + '" value="' + esc(m.subjek) + '"></div><div class="field mt12"><label>Isi pesan</label><textarea class="inp" rows="6" data-msg="' + i + '">' + esc(m.pesan) + '</textarea></div><div class="xs muted mt8">Variabel: ' + m.vars.map(function (v) { return '<span class="kbd">{' + v + '}</span>'; }).join(' ') + '</div><button class="btn btn-ghost btn-xs mt8" data-def="' + i + '">↺ Kembalikan bawaan</button></div><div><div class="lbl">Pratinjau</div><div class="wa-preview"><div class="wa-bubble" data-pv="' + i + '">' + waFormat(m.pesan) + '</div></div></div></div></td></tr>' : ''); }).join('');
    }
    $('#cfWa', box).onchange = $('#cfEm', box).onchange = function () { self._cfgDirty = true; lbl(); };
    lbl();
    box.oninput = function (e) { self._cfgDirty = true; var t = e.target; if (t.dataset.msg) { mx[t.dataset.msg].pesan = t.value; $('[data-pv="' + t.dataset.msg + '"]', box).innerHTML = waFormat(t.value); } if (t.dataset.sub) mx[t.dataset.sub].subjek = t.value; };
    box.onchange = function (e) { var t = e.target; if (t.dataset.mx) { mx[t.dataset.mx][t.dataset.k] = t.checked; self._cfgDirty = true; } };
    box.onclick = function (e) { var t = e.target.closest('[data-edit],[data-def]'); if (!t) return; if (t.dataset.edit) { mx[t.dataset.edit]._open = !mx[t.dataset.edit]._open; drawMx(); } else { var m = mx[t.dataset.def]; m.pesan = m.pesanDefault; m.subjek = m.subjekDefault; drawMx(); } };
    if ($('#cfTokDel', box)) $('#cfTokDel', box).onclick = async function () { if (!await confirmBox('Hapus token Fonnte? WhatsApp otomatis nonaktif.', { danger: true })) return; var r = await api('notif.configSave', { token: '__HAPUS__', waAktif: false }); if (toastRes(r, 'Token dihapus.')) { st.cfg = r.data; Store.set(userKey('a:notif.config'), { t: Date.now(), h: '', data: r.data }); self.t_konfigurasi(box); self.statusBar(box.closest('.page')); } };
    $('#cfDev', box).onclick = async function () { btnBusy(this, true); var r = await api('wa.device', {}); btnBusy(this, false); $('#cfDevOut', box).innerHTML = r.success ? '<div class="note ok">' + ic('smartphone') + '<div>Perangkat <b>' + esc(r.data.device) + '</b> • status <b>' + esc(r.data.status) + '</b> • paket ' + esc(r.data.paket) + ' • kuota ' + esc(r.data.kuota) + '</div></div>' : '<div class="note bad">' + ic('circle-alert') + '<div>' + esc(r.message) + '</div></div>'; };
    $('#cfTestWa', box).onclick = async function () { btnBusy(this, true); var r = await api('wa.test', { nomor: $('#cfTestNo', box).value }); btnBusy(this, false); toastRes(r); };
    $('#cfTestEmail', box).onclick = async function () { btnBusy(this, true); var r = await api('email.test', { email: $('#cfTestEm', box).value }); btnBusy(this, false); toastRes(r); };
    $('#cfSave', box).onclick = async function () {
      var payload = { waAktif: $('#cfWa', box).checked, emailAktif: $('#cfEm', box).checked, batchDefault: Number($('#cfBatch', box).value), jeda: $('#cfJeda', box).value.trim(), deteksiOtomatis: $('#cfDet', box).checked, namaPengirim: $('#cfNama', box).value, appUrl: $('#cfUrl', box).value.trim(), matriks: mx.map(function (m) { return { kode: m.kode, wa: m.wa, email: m.email, pesan: m.pesan, subjek: m.subjek }; }) };
      var tok = $('#cfTok', box).value.trim(); if (tok) payload.token = tok;
      btnBusy(this, true); var r = await api('notif.configSave', payload); btnBusy(this, false);
      if (toastRes(r, 'Konfigurasi notifikasi disimpan.')) { st.cfg = r.data; st.batch = r.data.batchDefault; st.jeda = r.data.jeda; Store.set(userKey('a:notif.config'), { t: Date.now(), h: hashStr(JSON.stringify(r.data)), data: r.data }); self.t_konfigurasi(box); self.statusBar(box.closest('.page')); }
    };
  }
});

// =====================================================================
// CRM KONTAK
// =====================================================================
registerPage('guru', 'crm', {
  sa: true,
  title: 'CRM Kontak',
  st: { cari: '', segmen: '', statusWA: '', emailValid: '', optOut: '', duplikat: false, masalah: false, kelas_id: '', tag: '', halaman: 1, sel: {}, data: null },
  init: function (el) {
    var st = this.st, self = this;
    el.innerHTML = pageHead('Komunikasi <span>// CRM Kontak</span>', 'CRM Kontak', 'Satu layar untuk memantau seluruh kontak siswa, orang tua, dan guru: Nama · Email · WhatsApp, kualitas data, status WA, dan riwayat dihubungi.',
      '<span class="small muted" id="crSync"></span><button class="btn btn-outline" id="crDup">' + ic('copy') + 'Periksa Duplikat</button><button class="btn btn-outline" id="crImp">' + ic('upload') + 'Import CSV</button><button class="btn btn-dark" id="crSyncBtn">' + ic('refresh-cw') + 'Sinkron Sekarang</button>') +
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px" id="crKpi"></div>' +
      '<div class="card mt24"><div class="chips" id="crSeg" style="padding:16px 20px 0"></div><div class="toolbar"><div class="field search"><div class="inp-ic">' + ic('search') + '<input class="inp" id="crQ" placeholder="Cari nama, email, atau nomor… (debounce)"></div></div><div class="field"><select class="sel" id="crWA"><option value="">Status WA: Semua</option><option>Terdaftar</option><option>Tidak Terdaftar</option><option value="Belum">Belum dicek</option></select></div><div class="field"><select class="sel" id="crKelas"></select></div><div class="field"><select class="sel" id="crTag"><option value="">Tag: Semua</option></select></div>' +
      '<div class="field"><select class="sel" id="crX"><option value="">Kualitas: Semua</option><option value="masalah">Tidak bisa dihubungi</option><option value="duplikat">Duplikat</option><option value="optout">Opt-out</option><option value="emailbad">Email tidak valid</option></select></div></div>' +
      '<div id="crBulk" hidden style="padding:0 20px 12px"></div><div id="crTable"></div></div>';
    var rer = function () { st.halaman = 1; self.load(el); };
    $('#crQ', el).oninput = debounce(function () { st.cari = this.value; rer(); }, 350);
    $('#crWA', el).onchange = function () { st.statusWA = this.value; rer(); };
    $('#crKelas', el).onchange = function () { st.kelas_id = this.value; rer(); };
    $('#crTag', el).onchange = function () { st.tag = this.value; rer(); };
    $('#crX', el).onchange = function () { var v = this.value; st.masalah = v === 'masalah'; st.duplikat = v === 'duplikat'; st.optOut = v === 'optout' ? 'YA' : ''; st.emailValid = v === 'emailbad' ? 'TIDAK' : ''; rer(); };
    $('#crSyncBtn', el).onclick = async function () { btnBusy(this, true); var r = await api('crm.sync', {}); btnBusy(this, false); if (toastRes(r)) { self.stats(el, true); self.load(el, true); } };
    $('#crImp', el).onclick = function () { self.importModal(el); };
    $('#crDup', el).onclick = function () { $('#crX', el).value = 'duplikat'; $('#crX', el).onchange(); };
    el.addEventListener('click', function (e) {
      var s = e.target.closest('[data-seg]'); if (s) { st.segmen = s.dataset.seg; rer(); return; }
      var k = e.target.closest('[data-kf]'); if (k) { var f = k.dataset.kf; st.statusWA = f === 'terdaftar' ? 'Terdaftar' : f === 'belum' ? 'Belum' : ''; st.optOut = f === 'optout' ? 'YA' : ''; st.duplikat = f === 'dup'; st.masalah = f === 'masalah'; st.emailValid = f === 'email' ? 'YA' : ''; $('#crWA', el).value = st.statusWA; rer(); return; }
      var d = e.target.closest('[data-kt]'); if (d) { self.detail(el, d.dataset.kt); return; }
      var p = e.target.closest('[data-pg]'); if (p && !p.disabled && p.closest('#crTable')) { st.halaman = Number(p.dataset.pg); self.load(el); return; }
      var bk = e.target.closest('[data-bulk]'); if (bk) self.bulk(el, bk.dataset.bulk);
    });
    el.addEventListener('change', function (e) {
      if (e.target.matches('[data-ck]')) { if (e.target.checked) st.sel[e.target.dataset.ck] = e.target.dataset.hp || 1; else delete st.sel[e.target.dataset.ck]; self.bulkBar(el); }
      if (e.target.matches('#crAll')) { (st.data.rows || []).forEach(function (k) { if (e.target.checked) st.sel[k.KontakID] = k.NoWA || 1; else delete st.sel[k.KontakID]; }); self.table(el); }
    });
  },
  render: function (el) { $('#crKelas', el).innerHTML = kelasOpts(this.st.kelas_id, 'Kelas: Semua'); this.stats(el); this.load(el); },
  stats: function (el, force) {
    swr('a:crm.stats', 'crm.stats', {}, function (s) {
      $('#crSync', el).textContent = s.terakhirSync ? 'Sinkron: ' + relTime(new Date(s.terakhirSync).toISOString()) : 'Belum pernah sinkron';
      var k = function (lbl, v, icon, f, tone, sub) { return '<div class="card kpi click" data-kf="' + f + '" style="min-height:120px"><div class="kl">' + lbl + '</div><div class="ki ' + (tone || '') + '">' + ic(icon) + '</div><div class="kv" style="font-size:28px">' + fmtN(v) + '</div><div class="ks">' + (sub || '') + '</div></div>'; };
      $('#crKpi', el).innerHTML = k('Total Kontak', s.total, 'contact', '', '', s.baru7 + ' baru 7 hari') + k('WA Terverifikasi', s.terdaftarWA, 'badge-check', 'terdaftar', 'green', s.waValid + ' nomor valid') + k('Email Valid', s.emailValid, 'mail-check', 'email', '', '') + k('Belum Dicek WA', s.belumCekWA, 'circle-help', 'belum', 'amber', 'Klik lalu Deteksi WA') + k('Opt-out', s.optOut, 'bell-off', 'optout', 'red', 'Tidak masuk blast') + k('Duplikat', s.duplikat, 'copy', 'dup', 'amber', s.tidakBisa + ' tidak bisa dihubungi');
    }, { fresh: 30000, force: !!force });
  },
  q: function () { var st = this.st; return { cari: st.cari, segmen: st.segmen, statusWA: st.statusWA, emailValid: st.emailValid, optOut: st.optOut, duplikat: st.duplikat, masalah: st.masalah, kelas_id: st.kelas_id, tag: st.tag, halaman: st.halaman, per: 25 }; },
  load: function (el, force) {
    var st = this.st, self = this, q = this.q(), key = 'a:crm:' + hashStr(JSON.stringify(q));
    if (!st.data) $('#crTable', el).innerHTML = '<div style="padding:20px"><div class="sk" style="height:300px"></div></div>';
    swr(key, 'crm.list', q, function (d) { st.data = d; self.table(el); }, { fresh: 20000, force: !!force, onError: function (r) { $('#crTable', el).innerHTML = errorBox(r.message); } });
  },
  table: function (el) {
    var st = this.st, d = st.data; if (!d) return;
    var seg = d.facet.segmen || {}, tot = Object.keys(seg).reduce(function (a, k) { return a + seg[k]; }, 0);
    $('#crSeg', el).innerHTML = '<button class="chip ' + (!st.segmen ? 'on' : '') + '" data-seg="">Semua <i>' + tot + '</i></button>' + Object.keys(seg).map(function (k) { return '<button class="chip ' + (st.segmen === k ? 'on' : '') + '" data-seg="' + esc(k) + '">' + esc(k) + ' <i>' + seg[k] + '</i></button>'; }).join('');
    var tagSel = $('#crTag', el), tags = Object.keys(d.tags || {}); tagSel.innerHTML = '<option value="">Tag: Semua</option>' + tags.map(function (t) { return '<option' + (t === st.tag ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
    var p = { page: d.halaman, pages: Math.max(1, Math.ceil(d.total / d.per)), from: d.total ? (d.halaman - 1) * d.per + 1 : 0, to: Math.min(d.halaman * d.per, d.total), total: d.total };
    var allSel = d.rows.length && d.rows.every(function (k) { return st.sel[k.KontakID]; });
    $('#crTable', el).innerHTML = d.rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" id="crAll" ' + (allSel ? 'checked' : '') + ' aria-label="Pilih semua"></th><th>Nama</th><th>Email</th><th>WhatsApp</th><th class="hide-m">Tag</th><th class="hide-m">Terakhir Dihubungi</th><th class="tc hide-m">Pesan</th><th class="tr">Aksi</th></tr></thead><tbody>' + d.rows.map(function (k) {
      var warn = !k.bisaDihubungi || k.duplikat || k.EmailValid === 'TIDAK';
      return '<tr style="' + (warn ? 'background:#FFFBEB' : '') + '"><td><input type="checkbox" data-ck="' + esc(k.KontakID) + '" data-hp="' + esc(k.NoWA) + '" ' + (st.sel[k.KontakID] ? 'checked' : '') + '></td><td><div class="who">' + avatar(k.Nama) + '<div><b style="cursor:pointer" class="navy" data-kt="' + esc(k.KontakID) + '">' + esc(k.Nama) + '</b><small><span class="bdg xs">' + esc(k.Segmen) + '</span>' + (k.info && k.info.nama_lengkap && k.Segmen === 'Orang Tua' ? ' ' + esc(k.info.nama_lengkap) : '') + (k.OptOut === 'YA' ? ' <span class="bdg bad xs">opt-out</span>' : '') + (k.duplikat ? ' <span class="bdg warn xs">duplikat</span>' : '') + '</small></div></div></td>' +
        '<td class="small">' + (k.Email ? esc(k.Email) + ' ' + (k.EmailValid === 'YA' ? '<span class="green">' + ic('check') + '</span>' : '<span class="amber">' + ic('triangle-alert') + '</span>') : '<span class="muted">-</span>') + '</td><td>' + (k.NoWA ? '<a class="mono small" href="' + waLink(k.NoWA) + '" target="_blank" rel="noopener">' + esc(k.NoWA) + '</a> ' + waBadge(k.StatusWA) : '<span class="muted">-</span>') + '</td><td class="hide-m small">' + esc(k.Tag || '') + '</td><td class="hide-m small">' + (k.TerakhirDihubungi ? esc(relTime(k.TerakhirDihubungi)) : '<i class="muted">Belum</i>') + '</td><td class="tc hide-m">' + (k.JumlahPesan || 0) + '</td><td class="tr"><button class="btn btn-soft btn-xs" data-kt="' + esc(k.KontakID) + '">Detail</button></td></tr>';
    }).join('') + '</tbody></table></div>' + pagerHtml(p, 'kontak') : '<div>' + emptyHtml('Belum ada kontak', 'Klik "Sinkron Sekarang" untuk menarik kontak dari data siswa, orang tua, dan guru.', 'contact') + '</div>';
    this.bulkBar(el);
  },
  bulkBar: function (el) {
    var n = Object.keys(this.st.sel).length, b = $('#crBulk', el); b.hidden = !n;
    b.innerHTML = '<div class="note row wrap gap12" style="align-items:center"><b>' + n + ' kontak dipilih</b><button class="btn btn-soft btn-xs" data-bulk="deteksi">' + ic('smartphone') + 'Deteksi WA</button><button class="btn btn-soft btn-xs" data-bulk="tag">' + ic('tag') + 'Beri Tag</button><button class="btn btn-soft btn-xs" data-bulk="untag">Hapus Tag</button><button class="btn btn-accent btn-xs" data-bulk="blast">' + ic('megaphone') + 'Blast ke Terpilih</button><button class="btn btn-soft btn-xs" data-bulk="optout">' + ic('bell-off') + 'Opt-out</button><button class="btn btn-soft btn-xs" data-bulk="optin">Opt-in</button><button class="btn btn-soft btn-xs" data-bulk="export">' + ic('download') + 'Ekspor</button><button class="btn btn-ghost btn-xs" data-bulk="clear">Batal pilih</button></div>';
  },
  bulk: async function (el, aksi) {
    var st = this.st, self = this, ids = Object.keys(st.sel);
    if (aksi === 'clear') { st.sel = {}; this.table(el); return; }
    if (aksi === 'blast') { var rows = (st.data.rows || []).filter(function (k) { return st.sel[k.KontakID]; }); sessionStorage.setItem('blastPenerima', JSON.stringify(ids.map(function (id) { var k = rows.filter(function (x) { return x.KontakID === id; })[0]; return k ? { hp: k.NoWA, nama: k.Nama, id: k.KontakID, vars: { siswa: (k.info || {}).nama_lengkap || '', nis: (k.info || {}).NIS || '' } } : { hp: st.sel[id], nama: 'Bapak/Ibu', id: id }; }).filter(function (x) { return x.hp && x.hp !== 1; }))); return go('notifikasi', 'blast'); }
    if (aksi === 'export') return this.exportCsv();
    if (aksi === 'deteksi') {
      var nomor = ids.map(function (id) { return st.sel[id]; }).filter(function (x) { return x && x !== 1; });
      for (var i = 0; i < nomor.length; i += 50) { var r0 = await api('wa.validate', { nomor: nomor.slice(i, i + 50) }); if (!toastRes(r0)) break; }
      st.sel = {}; this.load(el, true); this.stats(el, true); return;
    }
    var nilai = '';
    if (aksi === 'tag' || aksi === 'untag') { nilai = await promptBox(aksi === 'tag' ? 'Beri Tag' : 'Hapus Tag', aksi === 'tag' ? 'Nama tag (contoh: Komite, Alumni)' : 'Tag yang dihapus'); if (!nilai) return; }
    var r = await api('crm.bulk', { ids: ids, aksi: aksi, nilai: nilai });
    if (toastRes(r)) { st.sel = {}; this.load(el, true); this.stats(el, true); }
  },
  exportCsv: async function () {
    var r = await api('crm.export', this.q());
    if (toastRes(r, r.success ? r.data.n + ' kontak diekspor.' : '')) downloadCSV('crm-kontak-' + todayStr() + '.csv', r.data.headers, r.data.rows);
  },
  detail: async function (el, id) {
    var self = this;
    var m = modal({ title: 'Detail Kontak', drawer: true, body: '<div class="sk" style="height:400px"></div>' });
    var r = await api('crm.detail', { kontakId: id });
    if (!r.success) { m.body.innerHTML = errorBox(r.message); return; }
    var k = r.data.kontak, a = r.data.asli || {};
    m.body.innerHTML = '<div class="row gap12">' + avatar(k.Nama, '', 'lg') + '<div class="grow"><h3 style="font-size:18px">' + esc(k.Nama) + '</h3><div class="row wrap gap4 mt8"><span class="bdg info">' + esc(k.Segmen) + '</span><span class="bdg">' + esc(k.Sumber) + ':' + esc(k.RefID) + '</span>' + (k.info.kelas_id ? '<span class="bdg">' + esc(kelasNama(k.info.kelas_id)) + '</span>' : '') + '</div></div></div>' +
      '<div class="row wrap gap4 mt16">' + (k.NoWA ? '<a class="btn btn-ok btn-sm" href="' + waLink(k.NoWA) + '" target="_blank" rel="noopener">' + ic('message-circle') + 'WhatsApp</a><button class="btn btn-soft btn-sm" id="kdCopy">' + ic('copy') + 'Salin nomor</button>' : '') + (k.Email ? '<a class="btn btn-soft btn-sm" href="mailto:' + esc(k.Email) + '">' + ic('mail') + 'Email</a>' : '') + (k.Sumber === 'siswa' || k.Sumber === 'ortu' ? '<button class="btn btn-soft btn-sm" id="kdSiswa">' + ic('user') + 'Data siswa</button>' : '') + '</div>' +
      '<div class="grid-form mt16"><div class="field"><label>Nama</label><input class="inp" name="Nama" value="' + esc(k.Nama) + '"></div><div class="field c6"><label>No. WhatsApp ' + waBadge(k.StatusWA) + '</label><input class="inp mono" name="NoWA" value="' + esc(k.NoWA) + '"></div><div class="field c6"><label>Email</label><input class="inp" name="Email" value="' + esc(k.Email) + '"></div>' +
      '<div class="field"><label>Tag (pisahkan koma)</label><input class="inp" name="Tag" value="' + esc(k.Tag) + '"></div><div class="field"><label>Catatan</label><textarea class="inp" name="Catatan" rows="2">' + esc(k.Catatan) + '</textarea></div><div class="field"><label class="chk"><span class="toggle"><input type="checkbox" name="OptOut" ' + (k.OptOut === 'YA' ? 'checked' : '') + '><span></span></span> Opt-out (tidak menerima blast; notifikasi transaksional tetap)</label></div></div>' +
      '<div class="note mt12">' + ic('info') + '<div>Perubahan Nama/Email/WA ditulis balik ke data ' + esc(k.Sumber) + ' (satu sumber kebenaran).</div></div><button class="btn btn-primary btn-block mt12" id="kdSave">' + ic('save') + 'Simpan Kontak</button>' +
      '<div class="divider"></div><h3 style="font-size:15px">Catat Interaksi</h3><div class="row gap12 mt8"><select class="sel" id="kdKanal" style="width:140px"><option>Telepon</option><option>WA Manual</option><option>Kunjungan</option><option>Catatan</option></select><input class="inp grow" id="kdRing" placeholder="Ringkasan…"><button class="btn btn-soft" id="kdAdd">' + ic('plus') + '</button></div>' +
      '<h3 class="mt24" style="font-size:15px">Timeline (' + r.data.timeline.length + ')</h3><div class="timeline mt12">' + (r.data.timeline.map(function (t) { return '<div class="ti"><div class="xs muted">' + esc(relTime(t.tanggal)) + ' • ' + esc(t.kanal) + (t.status ? ' • ' + esc(t.status) : '') + (t.oleh ? ' • ' + esc(t.oleh) : '') + '</div><div class="small">' + (t.tipe === 'pesan' ? '<span class="bdg mono xs">' + esc(t.event) + '</span> ' : '') + esc(t.ringkasan) + '</div></div>'; }).join('') || '<div class="small muted">Belum ada riwayat.</div>') + '</div>';
    if ($('#kdCopy', m.el)) $('#kdCopy', m.el).onclick = function () { navigator.clipboard && navigator.clipboard.writeText(k.NoWA).then(function () { toast('Nomor disalin.', 'ok'); }); };
    if ($('#kdSiswa', m.el)) $('#kdSiswa', m.el).onclick = function () { m.close(); siswaDetail(k.RefID); };
    $('#kdSave', m.el).onclick = async function () {
      var d = formData(m.el); btnBusy(this, true);
      var r2 = await api('crm.save', { kontak: { KontakID: k.KontakID, Nama: d.Nama, NoWA: d.NoWA, Email: d.Email, Tag: d.Tag, Catatan: d.Catatan, OptOut: d.OptOut ? 'YA' : 'TIDAK' } }); btnBusy(this, false);
      if (toastRes(r2)) { m.close(); self.load(el, true); self.stats(el, true); if (d.NoWA !== k.NoWA || d.Email !== k.Email || d.Nama !== k.Nama) afterWrite(); }
    };
    $('#kdAdd', m.el).onclick = async function () { var t = $('#kdRing', m.el).value.trim(); if (!t) return; btnBusy(this, true); var r3 = await api('crm.interaksi', { kontakId: k.KontakID, kanal: $('#kdKanal', m.el).value, ringkasan: t }); btnBusy(this, false); if (toastRes(r3)) { m.close(); self.detail(el, id); } };
  },
  importModal: function (el) {
    var self = this, rows = [];
    var m = modal({ title: 'Import Kontak CSV', sub: 'Untuk kontak dari luar data sekolah (calon siswa, komite, alumni).', size: 'lg',
      body: '<div class="row between wrap gap12"><span class="small">Kolom: <span class="kbd">nama</span> <span class="kbd">email</span> <span class="kbd">wa</span> <span class="kbd">segmen</span> <span class="kbd">tag</span></span><button class="btn btn-soft btn-sm" id="ciTpl">' + ic('download') + 'Unduh Template</button></div><label class="drop mt12"><div class="ic">' + ic('file-spreadsheet') + '</div><b id="ciLbl">Pilih file CSV</b><input type="file" accept=".csv,text/csv" hidden id="ciFile"></label><div id="ciPrev" class="mt12"></div>',
      foot: '<button class="btn btn-outline" data-x>Batal</button><button class="btn btn-primary" id="ciGo" disabled>Import</button>' });
    $('#ciTpl', m.el).onclick = function () { downloadCSV('template-kontak.csv', ['nama', 'email', 'wa', 'segmen', 'tag'], [['Bapak Contoh', 'contoh@mail.com', '081234567890', 'Komite', 'Komite 2026']]); };
    $('#ciFile', m.el).onchange = async function () {
      var f = this.files[0]; if (!f) return; rows = parseCSV(await f.text());
      $('#ciLbl', m.el).textContent = f.name + ' — ' + rows.length + ' baris';
      $('#ciPrev', m.el).innerHTML = rows.length ? '<table class="tbl"><thead><tr>' + Object.keys(rows[0]).map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.slice(0, 5).map(function (r) { return '<tr>' + Object.keys(rows[0]).map(function (k) { return '<td class="small">' + esc(r[k]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' : '';
      $('#ciGo', m.el).disabled = !rows.length;
    };
    $('#ciGo', m.el).onclick = async function () { var norm = rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { o[k.toLowerCase().trim()] = r[k]; }); return o; }); btnBusy(this, true); var r = await api('crm.import', { rows: norm }); btnBusy(this, false); if (toastRes(r)) { m.close(); self.load(el, true); self.stats(el, true); } };
  }
});

// =====================================================================
// MIGRASI DATA (gas-migrasi-database)
// =====================================================================
var MIG_SHEETS = [['Kelas', 'Kelas / Rombel', true], ['Mapel', 'Mata Pelajaran', true], ['Guru', 'Data Guru', true], ['Siswa', 'Data Siswa', true], ['Users', 'Akun Login', true], ['Jadwal', 'Jadwal', true], ['Materi', 'Materi', true], ['Nilai', 'Nilai', true], ['Pengumuman', 'Pengumuman', true], ['Absensi', 'Absensi (bisa besar)', false], ['Config', 'Pengaturan Sekolah', true]];
registerPage('guru', 'migrasi', {
  sa: true,
  title: 'Migrasi Data',
  st: { source: '', sheets: null, overwrite: false, buatAkun: true, scan: null, csv: [] },
  init: function (el) {
    var st = this.st, self = this;
    st.sheets = {}; MIG_SHEETS.forEach(function (s) { st.sheets[s[0]] = s[2]; });
    el.innerHTML = pageHead('Data <span>// Migrasi & Import</span>', 'Migrasi Data dari App Lama', 'Pindahkan data SIAKAD versi lama (Google Sheets) ke aplikasi ini tanpa mengubah app lama. Aman diulang, ada pratinjau (dry-run), dan delta sync sebelum pindah.') +
      '<div class="grid g-main"><div><div class="card"><div class="step-h"><span class="no">1</span><div class="grow"><h3>Spreadsheet App Lama</h3><p>Hanya DIBACA — app lama tidak disentuh sama sekali</p></div></div><div class="card-b"><div class="field"><label>URL atau ID Google Spreadsheet lama</label><div class="inp-ic">' + ic('link') + '<input class="inp mono" id="mgSrc" placeholder="https://docs.google.com/spreadsheets/d/…/edit"></div><div class="hint">Harus milik / dibagikan ke akun Google yang sama dengan pemilik Apps Script ini agar file Drive lama (materi, foto) tetap terbaca.</div></div>' +
      '<div class="lbl mt16">Data yang diimpor</div><div class="grid g3" style="gap:8px" id="mgChk"></div>' +
      '<div class="row wrap gap16 mt16"><label class="chk small"><input type="checkbox" id="mgOver"> Timpa data yang sudah ada di app baru</label><label class="chk small"><input type="checkbox" id="mgAkun" checked> Buat akun otomatis untuk siswa tanpa akun (password = NIS)</label></div>' +
      '<div class="row wrap gap12 mt16"><button class="btn btn-soft" id="mgScan">' + ic('scan-search') + 'Pindai (Dry-run)</button><button class="btn btn-dark" id="mgRun" disabled>' + ic('database-zap') + 'Jalankan Import</button></div></div></div>' +
      '<div class="card mt24" id="mgRes" hidden></div>' +
      '<div class="card mt24"><div class="step-h"><span class="no">2</span><div class="grow"><h3>Import CSV Data Siswa</h3><p>Untuk data dari Excel/Dapodik/luar app</p></div><button class="btn btn-soft btn-sm" id="csTpl">' + ic('download') + 'Template</button></div><div class="card-b"><label class="drop">' + '<div class="ic">' + ic('file-spreadsheet') + '</div><b id="csLbl">Pilih file CSV siswa</b><div class="small muted">Kolom: NIS, Nama Lengkap, Kelas, JK, NISN, Email, Nama Ortu, No WA Ortu, Tempat Lahir, Tanggal Lahir, Alamat</div><input type="file" accept=".csv" hidden id="csFile"></label><div id="csPrev" class="mt12"></div>' +
      '<div class="row wrap gap12 mt12"><button class="btn btn-soft" id="csScan" disabled>' + ic('scan-search') + 'Pindai CSV</button><button class="btn btn-dark" id="csRun" disabled>' + ic('upload') + 'Import CSV</button></div><div id="csRes" class="mt12"></div></div></div></div>' +
      '<div><div class="card card-p"><h3>' + ic('list-checks') + ' Checklist Cutover</h3><ol class="small" style="padding-left:18px;line-height:1.9;margin:12px 0 0"><li>Pasang app baru, login sebagai guru.</li><li>Tempel URL spreadsheet lama → <b>Pindai</b>.</li><li>Periksa laporan & peringatan → <b>Jalankan Import</b>.</li><li>Cek Data Siswa, Materi, Nilai; uji login 1 akun siswa.</li><li>Tepat sebelum pindah: <b>Jalankan Import sekali lagi</b> (delta sync).</li><li>Umumkan alamat baru (Blast WA ke orang tua).</li><li>Arsipkan deployment lama — data lama tetap aman.</li></ol></div>' +
      '<div class="card card-p mt16"><h3>' + ic('shield-check') + ' Prinsip Aman</h3><ul class="small" style="padding-left:18px;line-height:1.8;margin:12px 0 0"><li>Upsert berdasarkan kunci alami (NIS, NUPTK, email) — import 2× tidak menggandakan data.</li><li>Kolom dibaca berdasarkan <b>nama header</b> (mendukung alias).</li><li>Nomor WA "8xx"/"62xx" dinormalisasi ke "08xx".</li><li>Hash password SHA-256 lama tetap berlaku.</li><li>Sesi login lama tidak ikut — pengguna cukup login ulang.</li></ul></div></div></div>';
    $('#mgChk', el).innerHTML = MIG_SHEETS.map(function (s) { return '<label class="chk small"><input type="checkbox" data-sh="' + s[0] + '" ' + (s[2] ? 'checked' : '') + '> ' + s[1] + '</label>'; }).join('');
    $('#mgChk', el).onchange = function (e) { st.sheets[e.target.dataset.sh] = e.target.checked; };
    $('#mgSrc', el).oninput = function () { st.source = this.value.trim(); $('#mgRun', el).disabled = true; };
    $('#mgOver', el).onchange = function () { st.overwrite = this.checked; };
    $('#mgAkun', el).onchange = function () { st.buatAkun = this.checked; };
    $('#mgScan', el).onclick = function () { self.run(el, true, this); };
    $('#mgRun', el).onclick = function () { self.run(el, false, this); };
    $('#csTpl', el).onclick = function () { downloadCSV('template-siswa.csv', ['NIS', 'Nama Lengkap', 'Kelas', 'JK', 'NISN', 'Email', 'Nama Ortu', 'No WA Ortu', 'Tempat Lahir', 'Tanggal Lahir', 'Alamat'], [['20260001', 'Contoh Siswa', 'X-A', 'L', '0012345678', '', 'Bpk. Contoh', '081234567890', 'Jakarta', '2010-05-17', 'Jl. Contoh No. 1']]); };
    $('#csFile', el).onchange = async function () {
      var f = this.files[0]; if (!f) return; st.csv = parseCSV(await f.text());
      $('#csLbl', el).textContent = f.name + ' — ' + st.csv.length + ' baris';
      $('#csPrev', el).innerHTML = st.csv.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + Object.keys(st.csv[0]).slice(0, 6).map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>' + st.csv.slice(0, 4).map(function (r) { return '<tr>' + Object.keys(st.csv[0]).slice(0, 6).map(function (k) { return '<td class="small">' + esc(r[k]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '';
      $('#csScan', el).disabled = !st.csv.length; $('#csRun', el).disabled = true;
    };
    $('#csScan', el).onclick = function () { self.csv(el, true, this); };
    $('#csRun', el).onclick = function () { self.csv(el, false, this); };
  },
  run: async function (el, dry, btn) {
    var st = this.st;
    if (!st.source) return toast('Tempel URL/ID spreadsheet lama.', 'warn');
    var sheets = Object.keys(st.sheets).filter(function (k) { return st.sheets[k]; });
    if (!dry && !await confirmBox('Jalankan import dari spreadsheet lama?\n\n' + sheets.join(', ') + (st.overwrite ? '\n\n⚠ Opsi TIMPA aktif: data app baru bisa tertimpa.' : ''), { ok: 'Jalankan Import' })) return;
    btnBusy(btn, true);
    var r = dry ? await api('migrasi.scan', { source: st.source, sheets: sheets, overwrite: st.overwrite, buatAkun: st.buatAkun }) : await api('migrasi.run', { source: st.source, sheets: sheets, overwrite: st.overwrite, buatAkun: st.buatAkun });
    btnBusy(btn, false);
    if (!r.success) return toast(r.message, 'bad');
    toast(r.message, 'ok');
    this.result(el, r.data, dry);
    $('#mgRun', el).disabled = false;
    if (!dry) { Store.clearUser(AppState.email); afterWrite(); }
  },
  result: function (el, d, dry) {
    var box = $('#mgRes', el); box.hidden = false;
    var rep = d.report || {};
    box.innerHTML = '<div class="card-h"><div class="grow"><h3>' + (dry ? 'Hasil Pindai (Dry-run)' : 'Hasil Import') + '</h3><p>Sumber: <b>' + esc(d.source.name) + '</b> • ' + (dry ? 'belum ada data yang ditulis' : 'selesai ' + nowHM() + ' WIB') + '</p></div><span class="bdg ' + (dry ? 'info' : 'ok') + '">' + (dry ? 'DRY-RUN' : 'SELESAI') + '</span></div><div class="card-b">' +
      (d.sheets ? '<div class="xs b muted">SHEET TERDETEKSI DI APP LAMA</div><div class="row wrap gap4 mt8">' + Object.keys(d.sheets).map(function (k) { var s = d.sheets[k]; return '<span class="bdg ' + (s.ada ? 'ok' : '') + '" data-tip="' + esc(s.ada ? 'Sheet "' + s.sheet + '" • kolom terpetakan: ' + (s.terpetakan || []).join(', ') : 'tidak ditemukan') + '">' + esc(k) + (s.ada ? ' (' + s.baris + ')' : ' ✕') + '</span>'; }).join('') + '</div>' : '') +
      '<div class="tbl-wrap mt16"><table class="tbl"><thead><tr><th>Data</th><th class="tc">Di app lama</th><th class="tc">Ditambah</th><th class="tc">Diperbarui</th><th class="tc">Dilewati</th></tr></thead><tbody>' + Object.keys(rep).map(function (k) { var x = rep[k]; return '<tr><td><b>' + esc(k) + '</b>' + (x.catatan ? '<div class="xs muted">' + esc(x.catatan) + '</div>' : '') + '</td><td class="tc">' + fmtN(x.source) + '</td><td class="tc green b">' + fmtN(x.inserted) + '</td><td class="tc amber b">' + fmtN(x.updated) + '</td><td class="tc muted">' + fmtN(x.skipped) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      (d.warnings && d.warnings.length ? '<div class="note warn mt16">' + ic('triangle-alert') + '<div><b>Peringatan</b><ul style="margin:6px 0 0;padding-left:18px">' + d.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div></div>' : '<div class="note ok mt16">' + ic('circle-check') + '<div>Tidak ada peringatan.</div></div>') + '</div>';
  },
  csv: async function (el, dry, btn) {
    var st = this.st; btnBusy(btn, true);
    var r = await api('migrasi.csv', { rows: st.csv, dryRun: dry, overwrite: st.overwrite, buatAkun: st.buatAkun });
    btnBusy(btn, false);
    if (!r.success) return toast(r.message, 'bad');
    var x = r.data.report.Siswa;
    $('#csRes', el).innerHTML = '<div class="note ' + (dry ? '' : 'ok') + '">' + ic(dry ? 'scan-search' : 'circle-check') + '<div><b>' + (dry ? 'Pratinjau:' : 'Selesai:') + '</b> ' + x.inserted + ' siswa baru, ' + x.updated + ' diperbarui, ' + x.skipped + ' dilewati.' + (r.data.warnings.length ? '<ul style="margin:6px 0 0;padding-left:18px">' + r.data.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') + '</div></div>';
    $('#csRun', el).disabled = !dry;
    if (!dry) { toast('Import CSV selesai.', 'ok'); afterWrite(); }
  }
});
