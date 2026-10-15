// Mapa con todos los cargadores (registro oficial + OSM). Verde = rápido, ámbar = 22 kW, gris = lento.
// Con el mapa muy alejado solo salen los rápidos, para no llenarlo de puntos.
// Filtros: atajos arriba (rápidos, gratis, tarjeta, favoritos) y el botón «Filtros» con todo lo demás.
import { enZona, clasePin, htmlPopup, fechaLista, enlazarFichas, SERVICIOS } from '../cargadores.js';
import { claveCargador, notaDe, notas } from '../datos.js';
import { ubicacion, ultimaUbicacion, esc, num, abrirHoja, cerrarHoja } from '../comun.js';
import { OPERADORES, operadorDe } from '../operadores.js';

const FILTROS_BASE = { minKw: 0, ccs: false, tipo2: false, gratis: false, tarjeta: false, h24: false, servicios: [], empresa: '', sinClientes: false, favoritos: false, compatibles: true };
let filtros = leerFiltros();
let mapa = null, capa = null, yo = null, datos = [];

function leerFiltros() {
  try { return { ...FILTROS_BASE, ...JSON.parse(localStorage.getItem('filtros-mapa') || '{}') }; } catch { return { ...FILTROS_BASE }; }
}
function guardarFiltros() { try { localStorage.setItem('filtros-mapa', JSON.stringify(filtros)); } catch { /* nada */ } }
const cuantos = () => Object.entries(filtros).filter(([k, v]) => (Array.isArray(v) ? v.length : v !== FILTROS_BASE[k])).length;

function pasa(c) {
  const f = filtros;
  if (f.favoritos && !notaDe(c)?.fav) return false;
  if (f.compatibles && !c.compatible) return false;
  if (f.minKw && !(c.potencia >= f.minKw || (f.minKw <= 50 && c.rapido && !c.potencia))) return false;
  if (f.ccs && !c.ccs) return false;
  if (f.tipo2 && !c.enchufes.some((e) => e.tipo === 'T')) return false;
  if (f.gratis && !c.gratis) return false;
  if (f.tarjeta && !c.tarjeta) return false;
  if (f.h24 && !c.h24) return false;
  if (f.sinClientes && c.clientes) return false;
  if (f.servicios.length && !f.servicios.some((s) => c.servicios.includes(s))) return false;
  if (f.empresa && operadorDe(c.operador, c.nombre)?.id !== f.empresa) return false;
  return true;
}

const ATAJOS = [
  ['rapidos', '⚡ Rápidos', () => filtros.minKw === 50, () => { filtros.minKw = filtros.minKw === 50 ? 0 : 50; }],
  ['gratis', '🎁 Gratis', () => filtros.gratis, () => { filtros.gratis = !filtros.gratis; }],
  ['tarjeta', '💳 Tarjeta', () => filtros.tarjeta, () => { filtros.tarjeta = !filtros.tarjeta; }],
  ['favoritos', '★ Favoritos', () => filtros.favoritos, () => { filtros.favoritos = !filtros.favoritos; }],
];

export function pintar(raiz) {
  raiz.innerHTML = `
    <div class="chips" id="filtros" style="margin:6px 0 12px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px"></div>
    <div class="mapa-envoltorio">
      <div id="mapa"></div>
      <div class="mapa-estado" id="estado">Cargando…</div>
      <div class="mapa-botones"><button id="yo" aria-label="Dónde estoy">◎</button></div>
    </div>`;
  pintarAtajos(raiz);
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
  centrar(raiz, false);
}

function pintarAtajos(raiz) {
  const n = cuantos();
  const el = raiz.querySelector('#filtros');
  el.innerHTML = `<button class="chip ${n ? 'activo' : ''}" data-f="todos" style="flex:none">⚙︎ Filtros${n ? ` (${n})` : ''}</button>
    ${ATAJOS.map(([k, t, activo]) => `<button class="chip ${activo() ? 'activo' : ''}" data-f="${k}" style="flex:none">${t}</button>`).join('')}`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    if (b.dataset.f === 'todos') { abrirFiltros(raiz); return; }
    ATAJOS.find(([k]) => k === b.dataset.f)[3]();
    aplicar(raiz);
  };
}

function aplicar(raiz) {
  guardarFiltros();
  pintarAtajos(raiz);
  const favs = Object.values(notas()).filter((n) => n.fav);
  if (filtros.favoritos && favs.length && mapa) mapa.fitBounds(favs.map((n) => [n.lat, n.lon]), { padding: [40, 40], maxZoom: 14 });
  dibujar(raiz);
}

function abrirFiltros(raiz) {
  const f = filtros;
  const chip = (grupo, valor, texto, activo) => `<button type="button" class="chip ${activo ? 'activo' : ''}" data-grupo="${grupo}" data-valor="${valor}">${texto}</button>`;
  abrirHoja(`
    <h2>Filtros</h2>
    <label class="campo"><span>Potencia mínima</span><div class="chips">
      ${[[0, 'Cualquiera'], [22, '22 kW o más'], [50, '50+ (rápido)'], [100, '100+'], [150, '150+']].map(([v, t]) => chip('minKw', v, t, f.minKw === v)).join('')}</div></label>
    <label class="campo"><span>Enchufe</span><div class="chips">
      ${chip('ccs', 1, 'CCS (rápida)', f.ccs)}${chip('tipo2', 1, 'Tipo 2 (lenta)', f.tipo2)}${chip('compatibles', 1, 'Ocultar los que no valen para mi coche', f.compatibles)}</div></label>
    <label class="campo"><span>Pagar</span><div class="chips">
      ${chip('gratis', 1, '🎁 Gratis', f.gratis)}${chip('tarjeta', 1, '💳 Tarjeta en el poste', f.tarjeta)}${chip('sinClientes', 1, 'Ocultar «solo clientes»', f.sinClientes)}</div></label>
    <label class="campo"><span>Horario</span><div class="chips">${chip('h24', 1, '🕒 Abierto 24 h', f.h24)}</div></label>
    <label class="campo"><span>Para esperar mientras carga</span><div class="chips">
      ${Object.entries(SERVICIOS).map(([k, t]) => chip('servicios', k, t, f.servicios.includes(k))).join('')}</div></label>
    <label class="campo"><span>Empresa</span><select id="empresa"><option value="">Todas</option>
      ${OPERADORES.map((o) => `<option value="${o.id}" ${f.empresa === o.id ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>
    <label class="campo"><span>Mis cargadores</span><div class="chips">${chip('favoritos', 1, '★ Solo favoritos', f.favoritos)}</div></label>
    <p class="muy-suave">«Gratis», «tarjeta», horario y servicios salen del registro oficial y de OpenStreetMap: si un cargador no los tiene apuntados, no aparece al filtrar. Si está libre ahora o si se puede reservar no lo publica ninguna fuente gratuita.</p>
    <div class="botones"><button class="boton" id="ver">Ver cargadores</button><button class="boton sec" id="limpiar">Quitar filtros</button></div>`, (caja) => {
    caja.onclick = (e) => {
      const b = e.target.closest('[data-grupo]');
      if (b) {
        const g = b.dataset.grupo, v = b.dataset.valor;
        if (g === 'minKw') { f.minKw = +v; caja.querySelectorAll('[data-grupo="minKw"]').forEach((x) => x.classList.toggle('activo', x === b)); }
        else if (g === 'servicios') { f.servicios = f.servicios.includes(v) ? f.servicios.filter((x) => x !== v) : [...f.servicios, v]; b.classList.toggle('activo'); }
        else { f[g] = !f[g]; b.classList.toggle('activo'); }
      }
      if (e.target.closest('#ver')) { cerrarHoja(); aplicar(raiz); }
      if (e.target.closest('#limpiar')) { filtros = { ...FILTROS_BASE }; cerrarHoja(); aplicar(raiz); }
    };
    caja.querySelector('#empresa').onchange = (e) => { f.empresa = e.target.value; };
  });
}

async function centrar(raiz, forzar) {
  const p = await ubicacion({ forzar });
  if (!mapa) return;
  if (p) {
    mapa.setView(p, Math.max(mapa.getZoom(), 13));
    yo?.remove();
    yo = L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="yo"></div>', iconSize: [18, 18] }), interactive: false }).addTo(mapa);
  } else if (forzar) {
    raiz.querySelector('#estado').textContent = 'No me dejan ver dónde estás: activa la ubicación del navegador.';
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
  // Muy alejado y sin filtro de potencia: solo los rápidos (y tus favoritos), para no saturar el mapa.
  const lejos = mapa.getZoom() < 11 && filtros.minKw < 50 && !filtros.favoritos;
  const lista = datos.filter((c) => pasa(c) && (!lejos || (c.rapido && c.compatible) || notaDe(c)?.fav));
  for (const c of lista) {
    const txt = c.potencia ? (c.potencia >= 1000 ? '' : Math.round(c.potencia)) : c.rapido ? '⚡' : '';
    L.marker([c.lat, c.lon], { zIndexOffset: c.rapido ? 500 : 0,
      icon: L.divIcon({ className: '', html: `<div class="pin ${clasePin(c)}" ${notaDe(c)?.fav ? 'style="outline:3px solid #FFD84D;outline-offset:1px"' : ''}><span style="font-size:${String(txt).length > 2 ? 10 : 12}px">${esc(txt)}</span></div>`, iconSize: [28, 28], iconAnchor: [14, 30], popupAnchor: [0, -28] }),
    }).bindPopup(htmlPopup(c), { maxWidth: 300 }).addTo(capa);
  }
  const f = fechaLista();
  raiz.querySelector('#estado').textContent = (lista.length
    ? `${num(lista.length)}${lejos ? ' rápidos' : ''} aquí${lejos ? ' (acerca para ver todos)' : ''}`
    : 'Ninguno aquí con estos filtros') + (f ? ` · lista del ${new Date(f + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : '');
}

export function salir() { mapa?.remove(); mapa = null; capa = null; yo = null; }
