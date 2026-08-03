/* Rumbo — cache offline. Sube CACHE cuando publiques una versión nueva. */
const CACHE = 'rumbo-v3';
const TESELAS = 'rumbo-teselas';
const BASE = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable.png'
];

/* Servidores de fondo cuyas piezas guardamos para el campo */
const HOSTS_TESELA = ['tile.openstreetmap.org', 'server.arcgisonline.com'];
const esTesela = url => HOSTS_TESELA.some(h => url.hostname.endsWith(h));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      /* TESELAS sobrevive a las actualizaciones: bajarlas cuesta datos */
      .then(ks => Promise.all(
        ks.filter(k => k !== CACHE && k !== TESELAS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache primero: en el campo no hay red y la app debe abrir igual.
   Las piezas del fondo se van guardando solas a medida que se ven,
   además de la descarga completa que hace el botón de la app. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  if (esTesela(url)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res.ok && res.type !== 'opaque') {
          const copia = res.clone();
          caches.open(TESELAS).then(c => c.put(e.request, copia));
        }
        return res;
      /* sin señal y sin pieza guardada: que no reviente, solo queda en blanco */
      }).catch(() => new Response('', { status: 504 })))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && url.origin === location.origin) {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
      }
      return res;
    }).catch(() => hit))
  );
});
