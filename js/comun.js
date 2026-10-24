// comun.js — utilidades de pantalla y datos de fuera (tiempo, precio de la luz, ubicación).
import { IMPUESTOS_LUZ } from './calc.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (n, d = 0) => (n == null || Number.isNaN(+n) ? '—' : (+n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const euros = (n, d = 2) => (n == null ? '—' : `${num(n, d)} €`);
export const hora = (d) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
export function duracion(min) {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export const fechaBonita = (iso) => new Date(iso + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

let temporizador;
export function aviso(texto) {
  const el = document.getElementById('aviso');
  el.textContent = texto; el.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { el.hidden = true; }, 2600);
}

// Hojas que suben desde abajo (fichas, filtros, formularios). Se cierran con la ✕, tocando fuera,
// arrastrando hacia abajo (desde arriba del todo), con Escape o con el botón «atrás» de Android.
let turnoHoja = 0, hashAlAbrir = null;
export function abrirHoja(html, alMontar) {
  const hoja = document.getElementById('hoja');
  const yaAbierta = !hoja.hidden && !hoja.classList.contains('saliendo');
  turnoHoja++;
  hoja.classList.remove('saliendo');
  hoja.style.background = '';
  hoja.innerHTML = `<div class="hoja-caja"><div class="hoja-cabeza"><span class="hoja-asa"></span>
    <button type="button" class="hoja-x" data-cerrar aria-label="Cerrar">✕</button></div>${html}</div>`;
  hoja.hidden = false;
  hoja.onclick = (e) => { if (e.target === hoja || e.target.closest('[data-cerrar]')) cerrarHoja(); };
  const caja = hoja.firstElementChild;
  arrastrarParaCerrar(hoja, caja);
  // «Atrás» en Android: una entrada en el historial que, al quitarla, cierra la hoja
  if (!yaAbierta && !history.state?.hoja) { hashAlAbrir = location.hash; history.pushState({ hoja: true }, ''); }
  alMontar?.(caja);
}

export function cerrarHoja({ sinAnimar = false } = {}) {
  const hoja = document.getElementById('hoja');
  if (hoja.hidden) return;
  const turno = turnoHoja, caja = hoja.firstElementChild;
  const quitar = () => { if (turno !== turnoHoja) return; hoja.hidden = true; hoja.innerHTML = ''; hoja.classList.remove('saliendo'); hoja.style.background = ''; };
  if (sinAnimar || !caja || matchMedia('(prefers-reduced-motion: reduce)').matches) quitar();
  else {
    hoja.classList.add('saliendo');
    caja.style.transition = 'transform .2s ease-in';
    caja.style.transform = 'translateY(100%)';
    setTimeout(quitar, 200);
  }
  // Quitar la entrada del historial que puso abrirHoja (si nadie ha navegado entretanto)
  // (si se ha abierto otra hoja justo después, se queda con esa entrada)
  setTimeout(() => { if (turno === turnoHoja && history.state?.hoja && location.hash === hashAlAbrir) history.back(); }, 0);
}
window.addEventListener('popstate', () => { if (!document.getElementById('hoja').hidden) cerrarHoja(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarHoja(); });

// Arrastrar la hoja hacia abajo para cerrarla. Solo desde arriba del todo (o desde el asa), para no
// pelearse con el scroll de dentro. Poco → vuelve a su sitio; mucho o rápido → se cierra.
function arrastrarParaCerrar(hoja, caja) {
  let inicioY = null, dy = 0, t0 = 0, arrastrando = false, desdeCabeza = false;
  caja.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    // Dentro de un mapa, arrastrar es mover el mapa, nunca cerrar la hoja.
    if (e.target.closest('.leaflet-container, [data-sin-arrastre]')) { inicioY = null; return; }
    inicioY = e.touches[0].clientY; t0 = Date.now(); dy = 0; arrastrando = false;
    desdeCabeza = !!e.target.closest('.hoja-cabeza');
  }, { passive: true });
  caja.addEventListener('touchmove', (e) => {
    if (inicioY == null) return;
    const d = e.touches[0].clientY - inicioY;
    if (!arrastrando) {
      if (d > 8 && (caja.scrollTop <= 0 || desdeCabeza)) { arrastrando = true; caja.style.transition = 'none'; }
      else if (Math.abs(d) > 8) { inicioY = null; return; }
      else return;
    }
    dy = Math.max(0, d);
    caja.style.transform = `translateY(${dy}px)`;
    hoja.style.background = `rgba(0,0,0,${(0.5 * (1 - dy / caja.offsetHeight)).toFixed(3)})`;
    e.preventDefault();
  }, { passive: false });
  const soltar = () => {
    if (!arrastrando) { inicioY = null; return; }
    const rapido = dy / Math.max(1, Date.now() - t0) > 0.6;
    arrastrando = false; inicioY = null;
    if (dy > Math.min(140, caja.offsetHeight / 3) || (rapido && dy > 40)) cerrarHoja();
    else { caja.style.transition = 'transform .2s ease-out'; caja.style.transform = ''; hoja.style.background = ''; }
  };
  caja.addEventListener('touchend', soltar);
  caja.addEventListener('touchcancel', soltar);
}

// Memoria corta para no pedir lo mismo a cada rato.
function deCache(clave, maxMin) {
  try {
    const c = JSON.parse(sessionStorage.getItem(clave) || localStorage.getItem('cache-' + clave));
    if (c && Date.now() - c.t < maxMin * 60e3) return c.v;
  } catch { /* nada */ }
  return undefined;
}
function aCache(clave, v, persistente = false) {
  try { (persistente ? localStorage : sessionStorage).setItem(persistente ? 'cache-' + clave : clave, JSON.stringify({ t: Date.now(), v })); } catch { /* nada */ }
}

export const BARCELONA = [41.3874, 2.1686];

export function ubicacion({ forzar = false } = {}) {
  const c = !forzar && deCache('ubic', 20);
  if (c) return Promise.resolve(c);
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { const v = [p.coords.latitude, p.coords.longitude]; aCache('ubic', v); aCache('ubic-ultima', v, true); ok(v); },
      () => ok(null), { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60e3 });
  });
}
export const ultimaUbicacion = () => deCache('ubic-ultima', 60 * 24 * 365) || BARCELONA;

export async function temperatura(punto) {
  const p = punto || ultimaUbicacion();
  const clave = `temp-${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const c = deCache(clave, 30);
  if (c != null) return c;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p[0]}&longitude=${p[1]}&current=temperature_2m&timezone=auto`);
    const t = (await r.json()).current.temperature_2m;
    aCache(clave, t);
    return t;
  } catch { return null; }
}

// Precio de la luz PVPC hora a hora (Red Eléctrica). Hoy y, desde las ~20:30, también mañana.
// Red Eléctrica da €/MWh sin impuestos; aquí sale en €/kWh con impuesto eléctrico e IVA.
export async function preciosPVPC() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy.getTime() + 86400e3);
  const f = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const clave = `pvpc-${f(hoy)}`;
  const c = deCache(clave, 45);
  if (c) return c.map((x) => ({ hora: new Date(x.hora), eur: x.eur }));
  const url = `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${f(hoy)}T00:00&end_date=${f(manana)}T23:59&time_trunc=hour&geo_limit=peninsular`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Red Eléctrica no responde');
  const d = await r.json();
  const pvpc = d.included.find((x) => x.id === '1001' || /pvpc/i.test(x.type));
  const lista = pvpc.attributes.values.map((v) => ({ hora: new Date(v.datetime), eur: v.value / 1000 * IMPUESTOS_LUZ }));
  aCache(clave, lista, true);
  return lista;
}

// Los campos de formulario de las pantallas: <label class="campo"> con unidad opcional.
export function campo(etiqueta, nombre, valor, { tipo = 'number', unidad = '', paso = 'any', extra = '' } = {}) {
  const input = `<input name="${nombre}" type="${tipo}" ${tipo === 'number' ? `inputmode="decimal" step="${paso}"` : ''} value="${esc(valor ?? '')}" ${extra}>`;
  return `<label class="campo"><span>${etiqueta}</span>${unidad ? `<div class="con-unidad">${input}<i>${unidad}</i></div>` : input}</label>`;
}

export const anillo = (pct, tam = 210, grosor = 16) => {
  const r = (tam - grosor) / 2, circ = 2 * Math.PI * r;
  const color = pct <= 15 ? 'var(--rojo)' : pct <= 30 ? 'var(--ambar)' : 'url(#grad-anillo)';
  return `<svg viewBox="0 0 ${tam} ${tam}"><defs><linearGradient id="grad-anillo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3FE0B0"/><stop offset="1" stop-color="#2BB8F0"/></linearGradient></defs>
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="var(--tarjeta2)" stroke-width="${grosor}"/>
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round"
      stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct / 100)}" style="transition:stroke-dashoffset .4s"/></svg>`;
};

// Mapa base de OpenStreetMap (gratis, sin clave). Con el tema oscuro se invierten los colores
// por CSS (.mapa-oscuro): queda un mapa oscuro de verdad, no uno gris apagado.
// (CARTO pide clave de pago desde 2026: probado y descartado.)
export function capaMapa(mapa) {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap', className: document.documentElement.dataset.tema !== 'claro' ? 'mapa-oscuro' : '',
  }).addTo(mapa);
}

// Ruta en coche: km, horas y la línea del camino. Normal: OSRM (gratis).
// Sin peajes: Valhalla (servidor gratuito de OpenStreetMap Alemania), que sí sabe evitarlos.
export async function rutaEnCoche(a, b, { sinPeajes = false } = {}) {
  if (sinPeajes) {
    const pide = { locations: [{ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }], costing: 'auto', costing_options: { auto: { use_tolls: 0 } }, units: 'km' };
    const r = await fetch(`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(pide))}`);
    const d = await r.json();
    if (!d.trip) throw new Error('No encuentro ruta sin peajes entre esos dos sitios.');
    return { km: d.trip.summary.length, horas: d.trip.summary.time / 3600, ruta: d.trip.legs.flatMap((l) => polilinea(l.shape)), peajes: !!d.trip.summary.has_toll };
  }
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`);
  const d = await r.json();
  if (d.code !== 'Ok') throw new Error('No encuentro ruta en coche entre esos dos sitios.');
  return { km: d.routes[0].distance / 1000, horas: d.routes[0].duration / 3600, ruta: d.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo]) };
}

// Línea codificada de Valhalla (formato «polyline» con 6 decimales) → [[lat, lon], …]
function polilinea(txt) {
  const puntos = [];
  let i = 0, lat = 0, lon = 0;
  const leer = () => {
    let res = 0, desp = 0, b;
    do { b = txt.charCodeAt(i++) - 63; res |= (b & 0x1f) << desp; desp += 5; } while (b >= 0x20);
    return res & 1 ? ~(res >> 1) : res >> 1;
  };
  while (i < txt.length) { lat += leer(); lon += leer(); puntos.push([lat / 1e6, lon / 1e6]); }
  return puntos;
}

export const certeza = (n) => `<span class="certeza ${n}">${{ alta: 'Seguro', media: 'Bastante seguro', baja: 'Compruébalo' }[n]}</span>`;
