const CACHE = 'uw-mobile-v8';
const SHELL = [
  '/unifiedsmi/m/login',
  '/unifiedsmi/m/home',
  '/unifiedsmi/m/leave',
  '/unifiedsmi/m/wfh',
  '/unifiedsmi/mobile/css/mobile.css',
  '/unifiedsmi/mobile/js/api.js',
  '/unifiedsmi/mobile/js/login.js',
  '/unifiedsmi/mobile/js/home.js',
  '/unifiedsmi/mobile/js/tasks.js',
  '/unifiedsmi/mobile/js/services.js',
  '/unifiedsmi/mobile/js/leave.js',
  '/unifiedsmi/mobile/js/wfh.js',
  '/unifiedsmi/assets/logo.png',
  '/unifiedsmi/assets/pwa-icon.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Network-only: API calls and dynamic theme CSS
  if (url.pathname.startsWith('/unifiedsmi/api/')) return;
  if (url.pathname === '/unifiedsmi/theme.css') return;

  // Cache-first for immutable static assets (JS, CSS, images) and CDN scripts
  if (
    url.pathname.startsWith('/unifiedsmi/mobile/') ||
    url.pathname.startsWith('/unifiedsmi/assets/') ||
    url.hostname === 'cdn.jsdelivr.net'
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Stale-while-revalidate for shell HTML pages — instant from cache, refresh in background
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const networkFetch = fetch(e.request).then(res => {
            if (res && res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => null);
          return cached || networkFetch;
        })
      )
    );
  }
});
