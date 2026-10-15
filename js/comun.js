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

export function abrirHoja(html, alMontar) {
  const hoja = document.getElementById('hoja');
  hoja.innerHTML = `<div class="hoja-caja">${html}</div>`;
  hoja.hidden = false;
  hoja.onclick = (e) => { if (e.target === hoja || e.target.closest('[data-cerrar]')) cerrarHoja(); };
  alMontar?.(hoja.firstElementChild);
}
export function cerrarHoja() { const h = document.getElementById('hoja'); h.hidden = true; h.innerHTML = ''; }

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

// Buscar un sitio por su nombre (OpenStreetMap).
export async function buscarSitio(texto) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&accept-language=es&countrycodes=es,fr,pt,ad,it,de,ch,be,nl&q=${encodeURIComponent(texto)}`);
  const d = await r.json();
  if (!d.length) throw new Error(`No encuentro «${texto}». Prueba con el pueblo o la ciudad.`);
  // «Plaza Mayor, Burgos»: mejor la de la ciudad de Burgos que la de un pueblo de la provincia de Burgos.
  const llano = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const partes = texto.split(',').map(llano).filter(Boolean);
  const pueblo = (x) => { const a = x.address || {}; return a.city || a.town || a.village || a.municipality || ''; };
  const mejor = partes.length > 1 ? d.find((x) => partes.slice(1).some((t) => llano(pueblo(x)) === t)) || d[0] : d[0];
  const municipio = pueblo(mejor);
  const primera = mejor.display_name.split(',')[0].trim();
  return { punto: [+mejor.lat, +mejor.lon], nombre: municipio && llano(primera) !== llano(municipio) ? `${primera}, ${municipio}` : mejor.display_name.split(',').slice(0, 2).join(','), municipio };
}

// Ruta en coche (OSRM, gratis): km, horas y la línea del camino.
export async function rutaEnCoche(a, b) {
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`);
  const d = await r.json();
  if (d.code !== 'Ok') throw new Error('No encuentro ruta en coche entre esos dos sitios.');
  return { km: d.routes[0].distance / 1000, horas: d.routes[0].duration / 3600, ruta: d.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo]) };
}

export const certeza = (n) => `<span class="certeza ${n}">${{ alta: 'Seguro', media: 'Bastante seguro', baja: 'Compruébalo' }[n]}</span>`;
