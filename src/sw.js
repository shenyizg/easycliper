// Service worker template: vite.config.ts injects the precache list at build time.
// - navigations: network first, fall back to the cached page (offline use)
// - everything else: cache first (assets are content-hashed, the ffmpeg core is versioned)
const CACHE = 'easycliper-v1';
const PRECACHE = self.__PRECACHE__;
const CORE = /\/ffmpeg\/([^/]+)\//;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (url) => {
          if (await cache.match(url, { ignoreVary: true })) return;
          const res = await fetch(url, { cache: 'no-cache' }).catch(() => null);
          if (res && res.ok) await cache.put(url, res);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // drop hashed assets of older builds
      const keep = new Set(PRECACHE.map((u) => new URL(u, self.location.href).pathname));
      const cache = await caches.open(CACHE);
      for (const req of await cache.keys()) {
        const path = new URL(req.url).pathname;
        if (path.includes('/assets/') && !keep.has(path)) await cache.delete(req);
      }
      await self.clients.claim();
    })(),
  );
});

async function dropOldCores(cache, version) {
  for (const req of await cache.keys()) {
    const m = CORE.exec(new URL(req.url).pathname);
    if (m && m[1] !== version) await cache.delete(req);
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) await cache.put('./', res.clone());
          return res;
        } catch {
          return (await cache.match('./', { ignoreVary: true })) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // precached entries were fetched by the worker itself, so request headers differ
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        await cache.put(req, res.clone());
        const m = CORE.exec(url.pathname);
        if (m) event.waitUntil(dropOldCores(cache, m[1]));
      }
      return res;
    })(),
  );
});
