// Service worker sederhana supaya situs ini bisa "diinstall" ke homescreen HP (PWA)
// dan tetap bisa dibuka (halaman kosongnya) walau sinyal internet putus-putus.
//
// PENTING: permintaan ke Google Apps Script (soal & nilai) TIDAK di-cache di sini
// (lihat pengecekan origin di bawah), supaya soal/nilai yang baru ditambah guru
// selalu ter-update, bukan versi lama yang tersimpan di cache.

const CACHE_NAME = 'bank-soal-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/dataSource.js',
  './js/app.js',
  './data/soal.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/logo-sekolah.jpg',
  './assets/tutwurihandayani.svg',
  './assets/skyline-sekolah.svg',
  './assets/pattern-doodle.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => { /* kalau ada file gagal di-cache, jangan sampai install gagal total */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Cuma tangani file statis kita sendiri. Permintaan ke Apps Script / Google Fonts /
  // domain lain dibiarkan langsung ke jaringan (tidak di-cache).
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      // "Stale-while-revalidate": kalau ada versi di cache, tampilkan itu dulu (cepat,
      // jalan walau offline), sambil diam-diam ambil versi terbaru untuk lain kali.
      return cached || networkFetch;
    })
  );
});
