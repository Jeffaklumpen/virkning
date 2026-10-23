/* Sunbeam Art — lean offline shell. Encrypted guides are cached when opened. */
'use strict';
const CACHE = 'sunbeam-art-offline-v14';
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./data/pattern-catalog.json",
  "./css/base.css",
  "./css/components.css",
  "./css/theme.css",
  "./js/storage.js",
  "./js/crypto.js",
  "./js/patterns.js",
  "./js/pwa.js",
  "./js/estimates.js",
  "./js/guide-loader.js",
  "./js/views.js",
  "./js/previews.js",
  "./js/app.js",
  "./config/auth-config.js",
  "./assets/sunbeam-bee.svg",
  "./assets/sunbeam-icon-180.png",
  "./assets/sunbeam-icon-192.png",
  "./assets/sunbeam-icon-512.png",
  "./assets/tooth-cover.svg"
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
    const refresh = fetch(request).then(async response => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    });
    // Prefer the network for updated scripts/styles. Otherwise a cached older
    // app can be served after a GitHub deployment, especially on iPad.
    if (/\.(?:js|css|webmanifest|json)$/i.test(url.pathname)) {
      try {
        const fresh = await refresh;
        return fresh.ok ? fresh : (available || fresh);
      } catch (error) {
        return available || Response.error();
      }
    }
    if (available) {
      event.waitUntil(refresh.catch(() => {}));
      return available;
    }
    return refresh.catch(() => Response.error());
  })());
});
