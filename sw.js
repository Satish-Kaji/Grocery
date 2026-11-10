// Service worker: caches the app files so the app opens without internet.
//
// IMPORTANT: when you change any file and push to GitHub, bump this
// version number. Otherwise your phone keeps showing the old cached version.
const CACHE_NAME = 'pantry-v2';

const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './dexie.min.js',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// First install: download and store all files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});

// New version activated: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Every request: serve from cache, fall back to the network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
