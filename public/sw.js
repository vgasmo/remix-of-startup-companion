/* eslint-env serviceworker */
/* global self, caches */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => { // eslint-disable-line no-unused-vars
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));

    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clientsList.map((client) => client.navigate(client.url)));

    await self.registration.unregister();
  })());
});