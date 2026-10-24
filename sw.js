// sw.js — guarda la app en el móvil para que funcione sin cobertura (también la lista de cargadores).
// Los datos de la usuaria no pasan por aquí: viven en el almacenamiento del navegador.
const VERSION = 'v25';
const CACHE = `rorolectric-${VERSION}`;

const ARCHIVOS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/datos.js', './js/calc.js', './js/comun.js', './js/cargadores.js', './js/operadores.js', './js/elegir-coche.js', './js/suscripciones.js', './js/coche-vivo.js', './js/buscador.js',
  './js/pantallas/inicio.js', './js/pantallas/cargar.js', './js/pantallas/mapa.js', './js/pantallas/viaje.js',
  './js/pantallas/diario.js', './js/pantallas/guia.js', './js/pantallas/ajustes.js',
  './js/vendor/leaflet.js', './js/vendor/leaflet.css', './datos/cargadores.json',
  './icons/icono-192.png', './icons/icono-512.png', './icons/icono-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(ARCHIVOS.map((f) => c.add(f))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k.startsWith('rorolectric-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Red primero (siempre lo último, incluida la lista de cargadores de esta noche); sin cobertura, la copia.
  e.respondWith((async () => {
    try {
      const resp = await fetch(e.request, { cache: 'no-cache' });
      if (resp && resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
      return resp;
    } catch {
      const guardado = await caches.match(e.request, { ignoreSearch: true });
      if (guardado) return guardado;
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      throw new Error('sin conexión y sin copia');
    }
  })());
});
