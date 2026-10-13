/**
 * KONFIGURASI FRONTEND — satu-satunya file yang perlu diedit saat instalasi.
 *
 * GAS_URL : URL Web App Apps Script yang berakhiran /exec
 *           (Deploy → Manage deployments → salin "Web app URL").
 *           Contoh bentuk: 'https://script.google.com/macros/s/GANTI_DENGAN_ID_DEPLOYMENT/exec'
 *           KOSONGKAN ('') untuk MODE DEMO: aplikasi berjalan penuh di browser
 *           dengan data contoh (tersimpan di perangkat ini saja).
 *
 * KEAMANAN: URL /exec BUKAN rahasia. JANGAN menaruh token, API key, sandi,
 *           atau secret apa pun di file ini — semua rahasia ada di Script Properties.
 */
window.SIAKAD_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbw53rtuOYGhexjTU8VCOIbPJ7VefCbE4tvI-M9FjUG8eb1gR8YIYKtrVQPSVVkHi1nW/exec',
  APP_NAME: 'SIAKAD SISWA',
  VERSION: '2.1.0'
};
