// Mapa con todos los cargadores (registro oficial + OSM). Verde = rápido, ámbar = 22 kW, gris = lento.
// Con el mapa muy alejado solo salen los rápidos, para no llenarlo de puntos.
import { enZona, clasePin, htmlPopup, fechaLista, enlazarFichas } from '../cargadores.js';
import { claveCargador, notaDe, notas } from '../datos.js';
import { ubicacion, ultimaUbicacion, esc, num } from '../comun.js';

let mapa = null, capa = null, yo = null, filtro = 'todos', datos = [];

export function pintar(raiz) {
  raiz.innerHTML = `
    <div class="chips" id="filtros" style="margin:6px 0 12px">
      ${[['todos', 'Todos'], ['rapidos', '⚡ Rápidos'], ['gratis', '🎁 Gratis'], ['favoritos', '★ Favoritos']].map(([k, t]) => `<button class="chip ${k === filtro ? 'activo' : ''}" data-f="${k}">${t}</button>`).join('')}
    </div>
    <div class="mapa-envoltorio">
      <div id="mapa"></div>
      <div class="mapa-estado" id="estado">Cargando…</div>
      <div class="mapa-botones"><button id="yo" aria-label="Dónde estoy">◎</button></div>
    </div>`;
  if (!window.L) { raiz.querySelector('#estado').textContent = 'No se pudo cargar el mapa. ¿Tienes conexión?'; return; }

  mapa = L.map('mapa', { zoomControl: false, attributionControl: true }).setView(ultimaUbicacion(), 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
  capa = L.layerGroup().addTo(mapa);
  enlazarFichas(mapa, (k) => datos.find((c) => claveCargador(c) === k));

  // Con una ficha abierta no se repinta (si no, se cerraría al moverse el mapa para enseñarla).
  let espera, fichaAbierta = false;
  mapa.on('popupopen', () => { fichaAbierta = true; }).on('popupclose', () => { fichaAbierta = false; });
  mapa.on('moveend', () => { clearTimeout(espera); if (!fichaAbierta) espera = setTimeout(() => cargar(raiz), 350); });
  raiz.querySelector('#yo').onclick = () => centrar(raiz, true);
  raiz.querySelector('#filtros').onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filtro = b.dataset.f;
    raiz.querySelectorAll('#filtros .chip').forEach((x) => x.classList.toggle('activo', x === b));
    // Favoritos: el mapa se ajusta para enseñarlos todos.
    const favs = Object.values(notas()).filter((n) => n.fav);
    if (filtro === 'favoritos' && favs.length) mapa.fitBounds(favs.map((n) => [n.lat, n.lon]), { padding: [40, 40], maxZoom: 14 });
    dibujar(raiz);
  };
  centrar(raiz, false);
}

async function centrar(raiz, forzar) {
  const p = await ubicacion({ forzar });
  if (!mapa) return;
  if (p) {
    mapa.setView(p, Math.max(mapa.getZoom(), 13));
    yo?.remove();
    yo = L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="yo"></div>', iconSize: [18, 18] }), interactive: false }).addTo(mapa);
  } else if (forzar) {
    raiz.querySelector('#estado').textContent = 'No me dejan ver dónde estás: activa la ubicación para Safari.';
  }
  cargar(raiz);
}

async function cargar(raiz) {
  const estado = raiz.querySelector('#estado');
  if (mapa.getZoom() < 8) { capa.clearLayers(); estado.textContent = 'Acerca el mapa para ver los cargadores'; return; }
  if (!datos.length) estado.textContent = 'Cargando la lista de cargadores…';
  const b = mapa.getBounds();
  try {
    const p = 0.15; // un poco más allá del borde, para que al mover no aparezcan de golpe
    const [s, w, n, e] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    datos = await enZona(s - (n - s) * p, w - (e - w) * p, n + (n - s) * p, e + (e - w) * p);
    if (mapa) dibujar(raiz);
  } catch (e) {
    estado.textContent = e.message;
  }
}

function dibujar(raiz) {
  if (!capa) return;
  capa.clearLayers();
  const lejos = mapa.getZoom() < 11;
  const lista = datos.filter((c) => (filtro === 'favoritos' ? notaDe(c)?.fav
    : filtro === 'todos' ? !lejos || (c.rapido && c.compatible) || notaDe(c)?.fav : filtro === 'rapidos' ? c.rapido && c.compatible : c.gratis));
  for (const c of lista) {
    const txt = c.potencia ? (c.potencia >= 1000 ? '' : Math.round(c.potencia)) : c.rapido ? '⚡' : '';
    L.marker([c.lat, c.lon], { zIndexOffset: c.rapido ? 500 : 0,
      icon: L.divIcon({ className: '', html: `<div class="pin ${clasePin(c)}" ${notaDe(c)?.fav ? 'style="outline:3px solid #FFD84D;outline-offset:1px"' : ''}><span style="font-size:${String(txt).length > 2 ? 10 : 12}px">${esc(txt)}</span></div>`, iconSize: [28, 28], iconAnchor: [14, 30], popupAnchor: [0, -28] }),
    }).bindPopup(htmlPopup(c), { maxWidth: 300 }).addTo(capa);
  }
  const f = fechaLista();
  raiz.querySelector('#estado').textContent = (lista.length
    ? `${num(lista.length)}${lejos && filtro === 'todos' ? ' rápidos' : ''} aquí${lejos && filtro === 'todos' ? ' (acerca para ver todos)' : ''}`
    : 'Ninguno en esta zona con ese filtro') + (f ? ` · lista del ${new Date(f + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : '');
}

export function salir() { mapa?.remove(); mapa = null; capa = null; yo = null; }
