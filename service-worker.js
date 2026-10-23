/* Sunbeam Art — small offline shell for an iPad home-screen web app. */
'use strict';
const CACHE = 'sunbeam-art-offline-v8';
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/base.css",
  "./css/components.css",
  "./css/theme.css",
  "./js/storage.js",
  "./js/crypto.js",
  "./js/patterns.js",
  "./js/pwa.js",
  "./js/app.js",
  "./config/auth-config.js",
  "./data/encrypted/tooth.js",
  "./data/encrypted/bunny/part-01.js",
  "./data/encrypted/bunny/part-02.js",
  "./data/encrypted/bunny/part-03.js",
  "./data/encrypted/bunny/part-04.js",
  "./data/encrypted/bunny/part-05.js",
  "./data/encrypted/bunny/part-06.js",
  "./data/encrypted/bunny/part-07.js",
  "./data/encrypted/bunny/part-08.js",
  "./data/encrypted/bunny/part-09.js",
  "./data/encrypted/bunny/part-10.js",
  "./data/encrypted/bunny/part-11.js",
  "./data/encrypted/bunny/part-12.js",
  "./data/encrypted/bunny/loader.js",
  "./data/encrypted/appa/part-01.js",
  "./data/encrypted/appa/part-02.js",
  "./data/encrypted/appa/part-03.js",
  "./data/encrypted/appa/part-04.js",
  "./data/encrypted/appa/part-05.js",
  "./data/encrypted/appa/part-06.js",
  "./data/encrypted/appa/part-07.js",
  "./data/encrypted/appa/part-08.js",
  "./data/encrypted/appa/part-09.js",
  "./data/encrypted/appa/part-10.js",
  "./data/encrypted/appa/part-11.js",
  "./data/encrypted/appa/part-12.js",
  "./data/encrypted/appa/part-13.js",
  "./data/encrypted/appa/part-14.js",
  "./data/encrypted/appa/part-15.js",
  "./data/encrypted/appa/part-16.js",
  "./data/encrypted/appa/part-17.js",
  "./data/encrypted/appa/part-18.js",
  "./data/encrypted/appa/part-19.js",
  "./data/encrypted/appa/part-20.js",
  "./data/encrypted/appa/part-21.js",
  "./data/encrypted/appa/part-22.js",
  "./data/encrypted/appa/part-23.js",
  "./data/encrypted/appa/loader.js",
  "./data/encrypted/brie/part-01.js",
  "./data/encrypted/brie/part-02.js",
  "./data/encrypted/brie/part-03.js",
  "./data/encrypted/brie/part-04.js",
  "./data/encrypted/brie/part-05.js",
  "./data/encrypted/brie/part-06.js",
  "./data/encrypted/brie/part-07.js",
  "./data/encrypted/brie/part-08.js",
  "./data/encrypted/brie/part-09.js",
  "./data/encrypted/brie/part-10.js",
  "./data/encrypted/brie/part-11.js",
  "./data/encrypted/brie/part-12.js",
  "./data/encrypted/brie/part-13.js",
  "./data/encrypted/brie/part-14.js",
  "./data/encrypted/brie/part-15.js",
  "./data/encrypted/brie/part-16.js",
  "./data/encrypted/brie/part-17.js",
  "./data/encrypted/brie/part-18.js",
  "./data/encrypted/brie/part-19.js",
  "./data/encrypted/brie/part-20.js",
  "./data/encrypted/brie/part-21.js",
  "./data/encrypted/brie/part-22.js",
  "./data/encrypted/brie/loader.js",
  "./assets/sunbeam-bee.svg",
  "./assets/sunbeam-icon-180.png",
  "./assets/sunbeam-icon-192.png",
  "./assets/sunbeam-icon-512.png",
  "./assets/donut-cover.svg",
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
    if (/\.(?:js|css|webmanifest)$/i.test(url.pathname)) {
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
