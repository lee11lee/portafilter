const CACHE = 'portafilter-v2';
const ASSETS = ['./', './index.html', './app.js', './style.css', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

// Network-first: always try to fetch the latest file first, so an update pushed to
// GitHub Pages shows up on the very next load. The cache is only a fallback for when
// there's no network at all (offline use) — previously this was cache-first, which
// meant a freshly-edited file could sit unseen behind the old cached copy indefinitely,
// since there was no way to tell the two apart from inside the app.
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  if(!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then(networkResp => {
      if(networkResp && networkResp.status === 200){
        const clone = networkResp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return networkResp;
    }).catch(() => caches.match(e.request))
  );
});
