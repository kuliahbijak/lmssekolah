/**
 * GAS Mock Runtime — meniru layanan Google Apps Script di Node & browser.
 * Dipakai untuk: (1) uji backend otomatis di Node, (2) MODE DEMO di browser
 * (frontend berjalan penuh tanpa server, data di localStorage).
 * Meniru perilaku Sheets yang menjebak: kolom tanpa format teks '@'
 * mengubah "0812..." menjadi angka dan "2026-01-05" menjadi Date.
 */
(function (root) {
  'use strict';

  // ---------------- SHA-256 & HMAC (sinkron, murni JS) ----------------
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length, withPad = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(withPad);
    m.set(bytes); m[l] = 0x80;
    var bits = l * 8; m[withPad - 4] = (bits >>> 24) & 255; m[withPad - 3] = (bits >>> 16) & 255; m[withPad - 2] = (bits >>> 8) & 255; m[withPad - 1] = bits & 255;
    m[withPad - 5] = Math.floor(bits / 4294967296) & 255;
    var w = new Array(64);
    for (var o = 0; o < withPad; o += 64) {
      for (var i = 0; i < 16; i++) w[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
      for (i = 16; i < 64; i++) {
        var s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
        var s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) { out[i * 4] = (H[i] >>> 24) & 255; out[i * 4 + 1] = (H[i] >>> 16) & 255; out[i * 4 + 2] = (H[i] >>> 8) & 255; out[i * 4 + 3] = H[i] & 255; }
    return out;
  }
  function utf8(s) { return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(String(s)) : Uint8Array.from(Buffer.from(String(s), 'utf8')); }
  function toU8(x) { if (x instanceof Uint8Array) return x; if (Array.isArray(x)) return Uint8Array.from(x.map(function (b) { return (b + 256) % 256; })); return utf8(x); }
  function signed(u8) { return Array.prototype.map.call(u8, function (b) { return b > 127 ? b - 256 : b; }); }
  function hmac(msg, key) {
    var k = toU8(key); if (k.length > 64) k = sha256(k);
    var kp = new Uint8Array(64); kp.set(k);
    var ip = new Uint8Array(64), op = new Uint8Array(64);
    for (var i = 0; i < 64; i++) { ip[i] = kp[i] ^ 0x36; op[i] = kp[i] ^ 0x5c; }
    var m = toU8(msg), inner = new Uint8Array(64 + m.length); inner.set(ip); inner.set(m, 64);
    var ih = sha256(inner), outer = new Uint8Array(96); outer.set(op); outer.set(ih, 64);
    return sha256(outer);
  }
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64enc(u8) {
    var s = '', i;
    for (i = 0; i + 2 < u8.length; i += 3) { var n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2]; s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63]; }
    if (u8.length - i === 1) { var n1 = u8[i] << 16; s += B64[n1 >> 18 & 63] + B64[n1 >> 12 & 63] + '=='; }
    else if (u8.length - i === 2) { var n2 = (u8[i] << 16) | (u8[i + 1] << 8); s += B64[n2 >> 18 & 63] + B64[n2 >> 12 & 63] + B64[n2 >> 6 & 63] + '='; }
    return s;
  }
  function b64dec(s) {
    s = String(s).replace(/[^A-Za-z0-9+/]/g, '');
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) { buf = (buf << 6) | B64.indexOf(s[i]); bits += 6; if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); } }
    return Uint8Array.from(out);
  }
  function u8str(u8) { return typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(u8) : Buffer.from(u8).toString('utf8'); }

  // ---------------- Tanggal (zona waktu via Intl) ----------------
  function parts(date, tz) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' });
    var o = {}; f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    if (o.hour === '24') o.hour = '00';
    return o;
  }
  function offsetStr(date, tz) {
    var p = parts(date, tz), asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    var off = Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000), sg = off >= 0 ? '+' : '-'; off = Math.abs(off);
    return sg + ('0' + Math.floor(off / 60)).slice(-2) + ':' + ('0' + off % 60).slice(-2);
  }
  function formatDate(date, tz, fmt) {
    var p = parts(date, tz), dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
    return String(fmt).replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss|XXX|u/g, function (t, lit) {
      if (lit !== undefined) return lit;
      return { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second, XXX: offsetStr(date, tz), u: String(dow) }[t];
    });
  }

  function uuid() {
    var c = root.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    var s = ''; for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s.substr(0, 8) + '-' + s.substr(8, 4) + '-4' + s.substr(13, 3) + '-a' + s.substr(17, 3) + '-' + s.substr(20, 12);
  }

  // ---------------- Blob ----------------
  function Blob_(bytes, type, name) { this._b = toU8(bytes); this._t = type || 'application/octet-stream'; this._n = name || 'file'; }
  Blob_.prototype.getBytes = function () { return signed(this._b); };
  Blob_.prototype.getDataAsString = function () { return u8str(this._b); };
  Blob_.prototype.getContentType = function () { return this._t; };
  Blob_.prototype.getName = function () { return this._n; };
  Blob_.prototype.setName = function (n) { this._n = n; return this; };

  function create(opts) {
    opts = opts || {};
    var S = { ss: {}, props: {}, files: {}, folders: {}, triggers: [], seq: 1 };
    var cache = {}, outbox = [], fetchLog = [];
    var persist = opts.persist || null;   // {load():obj, save(obj)}

    function reviveCell(v) { return v && typeof v === 'object' && v.__d ? new Date(v.__d) : v; }
    if (persist) {
      try {
        var saved = persist.load();
        if (saved && saved.ss) {
          S.props = saved.props || {}; S.triggers = saved.triggers || []; S.seq = saved.seq || 1; S.folders = saved.folders || {};
          S.files = saved.files || {};
          Object.keys(saved.ss).forEach(function (id) {
            var s = saved.ss[id];
            S.ss[id] = { id: id, name: s.name, sheets: s.sheets.map(function (sh) { return { name: sh.name, data: sh.data.map(function (r) { return r.map(reviveCell); }), text: sh.text || {}, maxRows: sh.maxRows || 1000 }; }) };
          });
        }
      } catch (e) { console.warn('Mock: gagal memuat data tersimpan', e); }
    }
    var dirty = false, timer = null;
    function markDirty() {
      if (!persist) return;
      dirty = true;
      if (timer) return;
      timer = setTimeout(flushPersist, 250);
    }
    function flushPersist() {
      timer = null; if (!dirty || !persist) return; dirty = false;
      var out = { props: S.props, triggers: S.triggers, seq: S.seq, folders: S.folders, files: {}, ss: {} };
      Object.keys(S.files).forEach(function (id) { var f = S.files[id]; out.files[id] = { name: f.name, type: f.type, folder: f.folder, b64: f.b64 && f.b64.length < 300000 ? f.b64 : '', size: f.size, trashed: f.trashed }; });
      Object.keys(S.ss).forEach(function (id) {
        var s = S.ss[id];
        out.ss[id] = { name: s.name, sheets: s.sheets.map(function (sh) { return { name: sh.name, text: sh.text, maxRows: sh.maxRows, data: sh.data.map(function (r) { return r.map(function (c) { return c instanceof Date ? { __d: c.toISOString() } : c; }); }) }; }) };
      });
      try { persist.save(out); } catch (e) { console.warn('Mock: penyimpanan penuh', e); }
    }
    function nid(p) { return p + (S.seq++).toString(36) + Math.random().toString(36).slice(2, 10) + 'xxxxxxxxxxxxxxxx'.slice(0, 12); }

    // ---------------- Spreadsheet ----------------
    function convert(sh, col, v) {
      if (sh.text[col]) return v === null || v === undefined ? '' : (v instanceof Date ? v : (typeof v === 'number' || typeof v === 'boolean' ? String(v) : v));
      if (typeof v === 'string') {
        if (/^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim().length < 16) return Number(v);
        if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return new Date(v.trim() + 'T00:00:00+07:00');
      }
      return v === null || v === undefined ? '' : v;
    }
    function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    Range.prototype.getValues = function () {
      var out = [];
      for (var i = 0; i < this.nr; i++) {
        var row = this.sh.data[this.r - 1 + i] || [], o = [];
        for (var j = 0; j < this.nc; j++) { var v = row[this.c - 1 + j]; o.push(v === undefined || v === null ? '' : v); }
        out.push(o);
      }
      return out;
    };
    Range.prototype.setValues = function (vals) {
      if (vals.length !== this.nr || (vals[0] && vals[0].length !== this.nc)) throw new Error('Jumlah baris/kolom data tidak cocok dengan range (' + vals.length + 'x' + (vals[0] || []).length + ' vs ' + this.nr + 'x' + this.nc + ')');
      if (this.r - 1 + this.nr > this.sh.maxRows) throw new Error('Range di luar batas sheet ' + this.sh.name);
      for (var i = 0; i < this.nr; i++) {
        var ri = this.r - 1 + i; this.sh.data[ri] = this.sh.data[ri] || [];
        for (var j = 0; j < this.nc; j++) this.sh.data[ri][this.c - 1 + j] = convert(this.sh, this.c - 1 + j, vals[i][j]);
      }
      markDirty(); return this;
    };
    Range.prototype.setValue = function (v) { return this.setValues([[v]]); };
    Range.prototype.getValue = function () { return this.getValues()[0][0]; };
    Range.prototype.clearContent = function () {
      for (var i = 0; i < this.nr; i++) { var row = this.sh.data[this.r - 1 + i]; if (!row) continue; for (var j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; }
      markDirty(); return this;
    };
    Range.prototype.setNumberFormat = function (f) { if (f === '@') for (var j = 0; j < this.nc; j++) this.sh.text[this.c - 1 + j] = 1; markDirty(); return this; };
    ['setFontWeight', 'setBackground', 'setFontColor', 'setHorizontalAlignment', 'setWrap'].forEach(function (m) { Range.prototype[m] = function () { return this; }; });

    function lastRow(sh) { for (var i = sh.data.length - 1; i >= 0; i--) { var r = sh.data[i]; if (r && r.some(function (c) { return c !== '' && c !== null && c !== undefined; })) return i + 1; } return 0; }
    function lastCol(sh) { var m = 0; sh.data.forEach(function (r) { if (!r) return; for (var j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] !== null && r[j] !== undefined) { m = Math.max(m, j + 1); break; } }); return m; }
    function Sheet(ssObj, sh) { this.ss = ssObj; this.sh = sh; }
    Sheet.prototype.getName = function () { return this.sh.name; };
    Sheet.prototype.setName = function (n) { this.sh.name = n; markDirty(); return this; };
    Sheet.prototype.getMaxRows = function () { return this.sh.maxRows; };
    Sheet.prototype.getMaxColumns = function () { return 26; };
    Sheet.prototype.getLastRow = function () { return lastRow(this.sh); };
    Sheet.prototype.getLastColumn = function () { return lastCol(this.sh); };
    Sheet.prototype.getRange = function (r, c, nr, nc) {
      if (typeof r === 'string') throw new Error('A1 notation tidak didukung mock');
      if (r < 1 || c < 1) throw new Error('Koordinat range tidak valid');
      return new Range(this.sh, r, c, nr || 1, nc || 1);
    };
    Sheet.prototype.getDataRange = function () { return new Range(this.sh, 1, 1, Math.max(1, lastRow(this.sh)), Math.max(1, lastCol(this.sh))); };
    Sheet.prototype.appendRow = function (vals) { var r = lastRow(this.sh) + 1; if (r > this.sh.maxRows) this.sh.maxRows = r; return new Range(this.sh, r, 1, 1, vals.length).setValues([vals]); };
    Sheet.prototype.insertRowsAfter = function (after, n) { this.sh.maxRows += n; markDirty(); return this; };
    Sheet.prototype.setFrozenRows = function () { return this; };
    Sheet.prototype.autoResizeColumns = function () { return this; };
    function SS(o) { this.o = o; }
    SS.prototype.getId = function () { return this.o.id; };
    SS.prototype.getName = function () { return this.o.name; };
    SS.prototype.getUrl = function () { return 'https://docs.google.com/spreadsheets/d/' + this.o.id + '/edit'; };
    SS.prototype.getSheets = function () { var self = this; return this.o.sheets.map(function (s) { return new Sheet(self, s); }); };
    SS.prototype.getActiveSheet = function () { return new Sheet(this, this.o.sheets[0]); };
    SS.prototype.getSheetByName = function (n) { var s = this.o.sheets.filter(function (x) { return x.name === n; })[0]; return s ? new Sheet(this, s) : null; };
    SS.prototype.insertSheet = function (n) { if (this.getSheetByName(n)) throw new Error('Sheet ' + n + ' sudah ada'); var s = { name: n, data: [], text: {}, maxRows: 1000 }; this.o.sheets.push(s); markDirty(); return new Sheet(this, s); };
    SS.prototype.deleteSheet = function (sheet) { this.o.sheets = this.o.sheets.filter(function (s) { return s !== sheet.sh; }); markDirty(); };
    var SpreadsheetApp = {
      create: function (name) { var id = nid('ss'); S.ss[id] = { id: id, name: name, sheets: [{ name: 'Sheet1', data: [], text: {}, maxRows: 1000 }] }; S.files[id] = { name: name, type: 'application/vnd.google-apps.spreadsheet', folder: 'root' }; markDirty(); return new SS(S.ss[id]); },
      openById: function (id) { if (!S.ss[id]) throw new Error('Spreadsheet tidak ditemukan: ' + id); return new SS(S.ss[id]); },
      flush: function () {}
    };

    // ---------------- Drive ----------------
    function File(id) { this.id = id; }
    File.prototype.getId = function () { return this.id; };
    File.prototype.getName = function () { return S.files[this.id].name; };
    File.prototype.getUrl = function () { return 'https://drive.google.com/file/d/' + this.id + '/view'; };
    File.prototype.getSize = function () { return S.files[this.id].size || 0; };
    File.prototype.getBlob = function () { var f = S.files[this.id]; return new Blob_(b64dec(f.b64 || ''), f.type, f.name); };
    File.prototype.setSharing = function () { S.files[this.id].shared = true; markDirty(); return this; };
    File.prototype.setTrashed = function (t) { S.files[this.id].trashed = !!t; markDirty(); return this; };
    File.prototype.moveTo = function (folder) { S.files[this.id].folder = folder.getId(); markDirty(); return this; };
    function Folder(id) { this.id = id; }
    Folder.prototype.getId = function () { return this.id; };
    Folder.prototype.getName = function () { return S.folders[this.id].name; };
    Folder.prototype.getUrl = function () { return 'https://drive.google.com/drive/folders/' + this.id; };
    Folder.prototype.createFolder = function (n) { var id = nid('fd'); S.folders[id] = { name: n, parent: this.id }; markDirty(); return new Folder(id); };
    Folder.prototype.createFile = function (blob) { var id = nid('fl'); S.files[id] = { name: blob.getName(), type: blob.getContentType(), folder: this.id, b64: b64enc(blob._b), size: blob._b.length }; markDirty(); return new File(id); };
    var DriveApp = {
      createFolder: function (n) { var id = nid('fd'); S.folders[id] = { name: n, parent: 'root' }; markDirty(); return new Folder(id); },
      getFolderById: function (id) { if (!S.folders[id]) throw new Error('Folder tidak ditemukan'); return new Folder(id); },
      getFileById: function (id) { if (!S.files[id]) throw new Error('File tidak ditemukan: ' + id); return new File(id); },
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' }, Permission: { VIEW: 'VIEW', EDIT: 'EDIT' }
    };

    // ---------------- Cache, Properties, Lock ----------------
    var CacheService = { getScriptCache: function () { return scriptCache; } };
    var scriptCache = {
      get: function (k) { var e = cache[k]; if (!e) return null; if (e.x < Date.now()) { delete cache[k]; return null; } return e.v; },
      put: function (k, v, ttl) { if (String(v).length > 100000) throw new Error('Argumen terlalu besar: value'); cache[k] = { v: String(v), x: Date.now() + (ttl || 600) * 1000 }; },
      remove: function (k) { delete cache[k]; },
      getAll: function (keys) { var o = {}; keys.forEach(function (k) { var v = scriptCache.get(k); if (v !== null) o[k] = v; }); return o; },
      putAll: function (m, ttl) { Object.keys(m).forEach(function (k) { scriptCache.put(k, m[k], ttl); }); },
      removeAll: function (keys) { keys.forEach(function (k) { delete cache[k]; }); }
    };
    var props = {
      getProperty: function (k) { return S.props[k] === undefined ? null : S.props[k]; },
      setProperty: function (k, v) { S.props[k] = String(v); markDirty(); return props; },
      setProperties: function (o) { Object.keys(o).forEach(function (k) { S.props[k] = String(o[k]); }); markDirty(); return props; },
      deleteProperty: function (k) { delete S.props[k]; markDirty(); return props; },
      getProperties: function () { return Object.assign({}, S.props); },
      getKeys: function () { return Object.keys(S.props); }
    };
    var PropertiesService = { getScriptProperties: function () { return props; } };
    var LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, waitLock: function () {}, releaseLock: function () {}, hasLock: function () { return true; } }; } };

    // ---------------- Content, Fetch, Mail, Script ----------------
    var ContentService = {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: function (s) { return { content: s, setMimeType: function () { return this; }, getContent: function () { return this.content; } }; }
    };
    function fakeFonnte(url, o) {
      var p = (o && o.payload) || {}, path = url.replace(/^https:\/\/api\.fonnte\.com/, '');
      if (!o.headers || !o.headers.Authorization) return { code: 401, body: { status: false, reason: 'token invalid' } };
      if (path === '/device') return { code: 200, body: { status: true, device: '6281200000000', device_status: 'connect', package: 'Demo', quota: '1000', expired: 'unlimited', name: 'SIAKAD Demo' } };
      if (path === '/validate') {
        var t = String(p.target || '').split(',').filter(String);
        return { code: 200, body: { status: true, registered: t.filter(function (n) { return !/[05]$/.test(n); }), not_registered: t.filter(function (n) { return /[05]$/.test(n); }) } };
      }
      if (path === '/send') {
        if (p.data) { if (api.rejectDataParam) return { code: 200, body: { status: false, reason: 'data param not supported' } }; var arr = JSON.parse(p.data); return { code: 200, body: { status: true, id: arr.map(function (x, i) { return 1000 + i; }), detail: 'success! message in queue' } }; }
        return { code: 200, body: { status: true, id: [Math.floor(Math.random() * 1e6)], detail: 'success' } };
      }
      return { code: 404, body: { status: false, reason: 'not found' } };
    }
    function resp(r) { var txt = typeof r.body === 'string' ? r.body : JSON.stringify(r.body); return { getContentText: function () { return txt; }, getResponseCode: function () { return r.code; } }; }
    var UrlFetchApp = {
      fetch: function (url, o) { fetchLog.push({ url: url, o: o }); return resp((api.fetchHandler || fakeFonnte)(url, o || {})); },
      fetchAll: function (reqs) { return reqs.map(function (r) { fetchLog.push({ url: r.url, o: r }); return resp((api.fetchHandler || fakeFonnte)(r.url, r)); }); }
    };
    var MailApp = { sendEmail: function (o) { outbox.push(o); }, getRemainingDailyQuota: function () { return 100 - outbox.length; } };
    var ScriptApp = {
      getProjectTriggers: function () { return S.triggers.map(function (t) { return { getHandlerFunction: function () { return t; } }; }); },
      newTrigger: function (fn) { var b = { timeBased: function () { return b; }, everyMinutes: function () { return b; }, everyHours: function () { return b; }, create: function () { S.triggers.push(fn); markDirty(); return {}; } }; return b; }
    };
    var Utilities = {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      formatDate: formatDate, getUuid: uuid, sleep: function () {},
      computeDigest: function (alg, s) { return signed(sha256(toU8(s))); },
      computeHmacSha256Signature: function (v, k) { return signed(hmac(v, k)); },
      base64Encode: function (x) { return b64enc(toU8(x)); },
      base64EncodeWebSafe: function (x) { return b64enc(toU8(x)).replace(/\+/g, '-').replace(/\//g, '_'); },
      base64Decode: function (s) { return signed(b64dec(s)); },
      base64DecodeWebSafe: function (s) { return signed(b64dec(String(s).replace(/-/g, '+').replace(/_/g, '/'))); },
      newBlob: function (data, type, name) { return new Blob_(data, type, name); }
    };
    var Logger = { log: function () { if (!api.quiet) console.log.apply(console, arguments); } };
    var Session = { getScriptTimeZone: function () { return 'Asia/Jakarta'; }, getActiveUser: function () { return { getEmail: function () { return 'owner@demo'; } }; } };

    var api = {
      globals: { SpreadsheetApp: SpreadsheetApp, DriveApp: DriveApp, CacheService: CacheService, PropertiesService: PropertiesService, LockService: LockService,
        ContentService: ContentService, UrlFetchApp: UrlFetchApp, MailApp: MailApp, ScriptApp: ScriptApp, Utilities: Utilities, Logger: Logger, Session: Session },
      state: S, outbox: outbox, fetchLog: fetchLog, cache: cache,
      fileDataUrl: function (id) { var f = S.files[id]; return f && f.b64 ? 'data:' + f.type + ';base64,' + f.b64 : ''; },
      clearCache: function () { Object.keys(cache).forEach(function (k) { delete cache[k]; }); },
      flush: flushPersist,
      /** Buat spreadsheet sumber (untuk uji migrasi) */
      makeSpreadsheet: function (name, sheets) {
        var ss = SpreadsheetApp.create(name), first = ss.getSheets()[0];
        Object.keys(sheets).forEach(function (n) { var sh = ss.insertSheet(n), rows = sheets[n]; if (rows.length) sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows); });
        ss.deleteSheet(first);
        return ss.getId();
      },
      fetchHandler: null, rejectDataParam: false, quiet: false,
      sha256Hex: function (s) { return Array.prototype.map.call(sha256(utf8(s)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
    };
    return api;
  }

  var GasMock = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = GasMock;
  else root.GasMock = GasMock;
})(typeof globalThis !== 'undefined' ? globalThis : this);
