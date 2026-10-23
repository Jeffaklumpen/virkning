/* Sunbeam Art — small offline shell for an iPad home-screen web app. */
'use strict';
const CACHE = 'sunbeam-art-offline-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './sunbeam.css',
  './app.js',
  './private-guide.js',
  './auth-config.js',
  './encrypted-guides.js',
  './boba-part-1.js',
  './boba-part-2.js',
  './boba-part-3.js',
  './boba-part-4.js',
  './boba-guide-loader.js',
  './assets/sunbeam-bee.svg',
  './assets/sunbeam-icon-180.png',
  './assets/sunbeam-icon-192.png',
  './assets/sunbeam-icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(async path => {
      const response = await fetch(new Request(path, { cache: 'reload' }));
      if (response.ok) await cache.put(path, response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(name => name.startsWith('sunbeam-art-offline-') && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) await cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (error) {
        const fallback = await cache.match('./index.html');
        return fallback || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const available = await cache.match(request, {ignoreSearch:true});
    // Fast, reliable home-screen startup; refresh the local copy for next time.
    const refresh = fetch(request).then(async response => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    });
    if (available) {
      event.waitUntil(refresh.catch(() => {}));
      return available;
    }
    return refresh.catch(() => Response.error());
  })());
});
