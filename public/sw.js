// Minimal service worker: network first, fall back to cache for same-origin GETs.
// Enough for installability and for the shell to open offline after one visit.
const CACHE = 'avo-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  // Never cache API or server-function calls.
  if (request.url.includes('/api/') || request.url.includes('/_serverFn/')) return
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && (request.destination !== '' || request.mode === 'navigate')) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
        }
        return res
      })
      .catch(() => caches.match(request).then((hit) => hit ?? caches.match('/'))),
  )
})
