/* Rumbo — service worker v4.
   Sube VERSION en cada publicación: es lo que dispara la actualización. */
const VERSION = 'v17';
const APP     = 'rumbo-' + VERSION;
const TESELAS = 'rumbo-teselas';          // sobrevive a las actualizaciones

const BASE = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable.png'
];

const HOSTS_TESELA = ['tile.openstreetmap.org', 'server.arcgisonline.com'];
const esTesela = u => HOSTS_TESELA.some(h => u.hostname.endsWith(h));

/* Instalación tolerante: si un archivo falta, se guarda el resto.
   Con addAll un solo 404 tumbaba la instalación entera y el celular
   se quedaba con la versión vieja para siempre. */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await Promise.all(BASE.map(u =>
      fetch(u, { cache: 'reload' })
        .then(r => r.ok && c.put(u, r))
        .catch(() => {})
    ));
    /* Tomar el control de una. Sin esto, la versión nueva se queda
       "esperando" a que se cierren todas las pestañas, y mientras tanto
       el service worker viejo sigue sirviendo la app vieja. Ese era el
       nudo: la pantalla vieja no tiene el botón de actualizar, así que
       nunca se podía desatascar sola. */
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(
      ks.filter(k => k !== APP && k !== TESELAS).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* La app avisa cuando el usuario acepta actualizar */
self.addEventListener('message', e => {
  if (e.data && e.data.tipo === 'saltar') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  /* Teselas: primero lo guardado. Bajarlas cuesta datos. */
  if (esTesela(url)) {
    e.respondWith(caches.match(e.request).then(hit => hit ||
      fetch(e.request).then(r => {
        if (r.ok && r.type !== 'opaque') {
          const copia = r.clone();
          caches.open(TESELAS).then(c => c.put(e.request, copia));
        }
        return r;
      }).catch(() => new Response('', { status: 504 }))));
    return;
  }

  if (url.origin !== location.origin) return;

  /* El armazón de la app va primero por red: así una versión nueva
     entra apenas hay señal, en vez de quedarse pegada a la caché.
     Sin señal cae a lo guardado y todo sigue funcionando igual. */
  const esArmazon = e.request.mode === 'navigate' ||
                    /\.(html|webmanifest)$/.test(url.pathname) ||
                    url.pathname.endsWith('/');

  if (esArmazon) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(r => {
          if (r.ok) { const c = r.clone(); caches.open(APP).then(x => x.put(e.request, c)); }
          return r;
        })
        .catch(() => caches.match(e.request)
          .then(hit => hit || caches.match('./index.html'))
          .then(hit => hit || new Response('Sin conexión y sin copia guardada.',
            { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })))
    );
    return;
  }

  /* Iconos y demás: primero lo guardado, y se refresca por detrás. */
  e.respondWith(caches.match(e.request).then(hit => {
    const red = fetch(e.request).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(APP).then(x => x.put(e.request, c)); }
      return r;
    }).catch(() => hit);
    return hit || red;
  }));
});
