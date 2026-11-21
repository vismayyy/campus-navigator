/* Campus Navigator - service worker
   - The app page opens from the network when online (so updates always arrive) and from the saved copy when offline.
   - Libraries, fonts and map pictures you have already seen are saved on the phone, so the app opens even with a weak signal.
   When you upload a new index.html, nothing else needs changing. If you change this file or the icons, change the
   number in VERSION below so phones pick up the new copy. */
const VERSION = 'v1';
const APP_CACHE = 'campus-nav-app-' + VERSION;
const LIB_CACHE = 'campus-nav-libs-' + VERSION;
const TILE_CACHE = 'campus-nav-tiles-' + VERSION;
const MAX_TILES = 600;
const SHELL = ['./', 'index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const LIB_HOSTS = ['unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const TILE_HOSTS = ['server.arcgisonline.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  const keep = [APP_CACHE, LIB_CACHE, TILE_CACHE];
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('campus-nav-') && !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);   // oldest first
}

// cache first: used for libraries and map tiles (they never change for a given address)
async function cacheFirst(req, cacheName, max) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  let res;
  try { res = await fetch(req.url, { mode: 'cors' }); }          // a normal (non-opaque) copy is small to store
  catch (e) { res = await fetch(req); }
  if (res && res.ok) { c.put(req, res.clone()).then(() => max && trim(cacheName, max)).catch(() => {}); }
  return res;
}

// network first: used for the app page itself
async function networkFirst(req) {
  const c = await caches.open(APP_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    return (await c.match(req)) || (await c.match('index.html')) || (await c.match('./')) || Response.error();
  }
}

// show the saved copy straight away, and refresh it in the background
async function staleWhileRevalidate(req) {
  const c = await caches.open(APP_CACHE);
  const hit = await c.match(req);
  const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (TILE_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req, TILE_CACHE, MAX_TILES)); return; }
  if (LIB_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req, LIB_CACHE, 0)); return; }
  // everything else (for example the 3D building data) goes straight to the network
});
