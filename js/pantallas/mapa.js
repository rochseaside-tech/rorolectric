// Mapa con todos los cargadores (registro oficial + OSM). Verde = rápido, ámbar = 22 kW, gris = lento.
// Con el mapa muy alejado solo salen los rápidos, para no llenarlo de puntos.
// Filtros: atajos arriba (rápidos, gratis, tarjeta, favoritos) y el botón «Filtros» con todo lo demás.
import { enZona, clasePin, abrirFicha, fechaLista, SERVICIOS, precioKwh, precioCorto } from '../cargadores.js';
import { claveCargador, notaDe, notas, bateria, ajustes, medido } from '../datos.js';
import { ubicacion, ultimaUbicacion, esc, num, abrirHoja, cerrarHoja, capaMapa, buscarSitio, aviso } from '../comun.js';
import { distancia, kmCon, consumo } from '../calc.js';
import { OPERADORES, operadorDe } from '../operadores.js';

const FILTROS_BASE = { minKw: 0, ccs: false, tipo2: false, gratis: false, tarjeta: false, h24: false, servicios: [], empresa: '', sinClientes: false, favoritos: false, compatibles: true, conPrecio: false, reservable: false };
let filtros = leerFiltros();
let buscarPoste = false; // «Estoy en un cargador»: abrir la ficha del que tienes al lado
// Vista de precios: los puntos enseñan el €/kWh (de REVE) en vez de los kW.
let verPrecio = (() => { try { return localStorage.getItem('mapa-precio') === '1'; } catch { return false; } })();
const BARATO = 0.40, CARO = 0.55; // €/kWh, IVA incluido
const tramoPrecio = (p) => (p < BARATO ? 'barato' : p <= CARO ? 'normal' : 'caro');
let mapa = null, capa = null, yo = null, datos = [], visibles = [], marcadores = new Map(), aro = null, verRango = false, dondeEstoy = null, abrirLuego = null;

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
  if (f.reservable && !c.reservable) return false;
  if (f.conPrecio && !c.precio) return false;
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

export function pintar(raiz, [modo] = []) {
  buscarPoste = modo === 'aqui';
  raiz.innerHTML = `
    <form class="mapa-busca" id="busca"><input id="q" type="search" placeholder="Buscar ciudad, calle o sitio…" enterkeyhint="search" autocomplete="off">
      <button class="boton mini sec" type="button" id="lista">☰ Cerca</button></form>
    <div class="chips" id="filtros" style="margin:6px 0 12px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px"></div>
    <div class="mapa-envoltorio">
      <div id="mapa"></div>
      <div class="mapa-estado" id="estado">Cargando…</div>
      <div class="mapa-botones"><button id="yo" aria-label="Dónde estoy">◎</button></div>
    </div>`;
  pintarAtajos(raiz);
  if (!window.L) { raiz.querySelector('#estado').textContent = 'No se pudo cargar el mapa. ¿Tienes conexión?'; return; }

  mapa = L.map('mapa', { zoomControl: false, attributionControl: true }).setView(ultimaUbicacion(), 13);
  capaMapa(mapa);
  capa = L.layerGroup().addTo(mapa);

  // Con una ficha abierta no se repinta (si no, se cerraría al moverse el mapa para enseñarla).
  let espera, fichaAbierta = false;
  mapa.on('popupopen', () => { fichaAbierta = true; }).on('popupclose', () => { fichaAbierta = false; });
  mapa.on('moveend', () => { clearTimeout(espera); espera = setTimeout(() => { if (!fichaAbierta) cargar(raiz); }, 350); });
  raiz.querySelector('#yo').onclick = () => centrar(raiz, true);
  raiz.querySelector('#busca').onsubmit = async (e) => {
    e.preventDefault();
    const q = raiz.querySelector('#q'); q.blur();
    if (!q.value.trim()) return;
    try { const s = await buscarSitio(q.value); mapa.setView(s.punto, 14); } catch (err) { aviso(err.message); }
  };
  raiz.querySelector('#lista').onclick = () => abrirLista();
  centrar(raiz, false);
}

// Los más cercanos (a ti o, si no se sabe dónde estás, al centro del mapa), con los filtros puestos.
// «Más baratos»: de los 60 más cercanos, ordenados por el precio de REVE (los que no lo tienen, al final).
function abrirLista(orden = 'cerca') {
  const desde = dondeEstoy || [mapa.getCenter().lat, mapa.getCenter().lng];
  let lista = visibles.map((c) => ({ c, d: distancia(desde, [c.lat, c.lon]), p: precioKwh(c) })).sort((a, b) => a.d - b.d);
  if (orden === 'precio') lista = lista.slice(0, 60).sort((a, b) => (a.p ?? 99) - (b.p ?? 99) || a.d - b.d);
  lista = lista.slice(0, 30);
  const hayPrecios = visibles.some((c) => c.precio);
  abrirHoja(`<h2>Cerca ${dondeEstoy ? 'de ti' : 'del centro del mapa'}</h2>
    ${hayPrecios ? `<div class="chips" id="orden" style="margin-bottom:10px">
      <button class="chip ${orden === 'cerca' ? 'activo' : ''}" data-o="cerca">📍 Más cerca</button>
      <button class="chip ${orden === 'precio' ? 'activo' : ''}" data-o="precio">💶 Más baratos</button></div>` : ''}
    ${lista.length ? `<ul class="lista">${lista.map(({ c, d }) => `<li data-k="${claveCargador(c)}" style="cursor:pointer">
      <span class="icono" style="background:${{ rapido: '#3FE0B0', medio: '#FFB84D', lento: '#9AA3B1', no: '#5A606B' }[clasePin(c)]};color:#062018;font-weight:800;font-size:13px">${c.potencia ? Math.round(c.potencia) : '⚡'}</span>
      <div class="cuerpo"><b>${esc(c.nombre)}</b><span>${[c.operador, c.dir].filter(Boolean).map(esc).join(' · ')}</span>${c.precio ? `<span style="display:block;color:var(--acento);font-weight:650">💶 ${precioCorto(c)}</span>` : ''}</div>
      <div class="lado">${d < 1 ? `${Math.round(d * 1000)} m` : `${num(d, 1)} km`}<small class="suave">en línea recta</small></div></li>`).join('')}</ul>`
      : '<p class="suave">Ninguno con estos filtros en esta zona. Aleja el mapa o quita filtros.</p>'}
    <div class="botones"><button class="boton sec" data-cerrar>Cerrar</button></div>`, (caja) => {
    caja.querySelector('#orden')?.addEventListener('click', (e) => { const b = e.target.closest('[data-o]'); if (b && b.dataset.o !== orden) { cerrarHoja(); abrirLista(b.dataset.o); } });
    caja.querySelector('.lista')?.addEventListener('click', (e) => {
      const li = e.target.closest('[data-k]'); if (!li) return;
      cerrarHoja();
      const c = visibles.find((x) => claveCargador(x) === li.dataset.k); if (!c) return;
      // Al moverse el mapa se repintan los puntos: la ficha se abre en cuanto estén.
      abrirLuego = li.dataset.k;
      mapa.setView([c.lat, c.lon], Math.max(mapa.getZoom(), 15));
    });
  });
}

// «Hasta dónde llego»: círculo con lo que da la batería (hasta el 10 %), en línea recta
// (por carretera se hace más camino, por eso se recorta un 20 %).
function pintarRango() {
  aro?.remove(); aro = null;
  if (!verRango || !mapa) return;
  const centro = dondeEstoy || [mapa.getCenter().lat, mapa.getCenter().lng];
  const km = kmCon(Math.max(0, bateria().pct - 10), consumo('mixto', null, ajustes(), medido())) * 0.8;
  aro = L.layerGroup([
    L.circle(centro, { radius: km * 1000, color: '#2BB8F0', weight: 2, fillOpacity: 0.06, interactive: false }),
    L.marker(L.latLng(centro[0] + km / 111, centro[1]), { interactive: false,
      icon: L.divIcon({ className: '', html: `<div class="rango-etiqueta">🔋 ${bateria().pct} % · ≈ ${num(km)} km</div>`, iconSize: [150, 24], iconAnchor: [75, 12] }) }),
  ]).addTo(mapa);
  mapa.fitBounds(L.latLng(centro).toBounds(km * 2000), { padding: [20, 20] });
}

function pintarAtajos(raiz) {
  const n = cuantos();
  const el = raiz.querySelector('#filtros');
  el.innerHTML = `<button class="chip ${n ? 'activo' : ''}" data-f="todos" style="flex:none">⚙︎ Filtros${n ? ` (${n})` : ''}</button>
    <button class="chip ${verPrecio ? 'activo' : ''}" data-f="precio" style="flex:none">💶 Precios</button>
    ${ATAJOS.map(([k, t, activo]) => `<button class="chip ${activo() ? 'activo' : ''}" data-f="${k}" style="flex:none">${t}</button>`).join('')}
    <button class="chip ${verRango ? 'activo' : ''}" data-f="rango" style="flex:none">🔋 Hasta dónde llego</button>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    if (b.dataset.f === 'todos') { abrirFiltros(raiz); return; }
    if (b.dataset.f === 'rango') { verRango = !verRango; pintarAtajos(raiz); pintarRango(); return; }
    if (b.dataset.f === 'precio') {
      verPrecio = !verPrecio;
      try { localStorage.setItem('mapa-precio', verPrecio ? '1' : '0'); } catch { /* nada */ }
      pintarAtajos(raiz); dibujar(raiz);
      if (verPrecio && !hayPrecios()) aviso('Aún no tengo precios: se están bajando de REVE y tardan unos días. Irán saliendo solos.');
      return;
    }
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
      ${chip('gratis', 1, '🎁 Gratis', f.gratis)}${chip('tarjeta', 1, '💳 Tarjeta en el poste', f.tarjeta)}${chip('conPrecio', 1, '💶 Solo con precio', f.conPrecio)}${chip('sinClientes', 1, 'Ocultar «solo clientes»', f.sinClientes)}</div></label>
    <label class="campo"><span>Horario y reserva</span><div class="chips">${chip('h24', 1, '🕒 Abierto 24 h', f.h24)}${chip('reservable', 1, '📅 Se puede reservar (solo lo publica Francia)', f.reservable)}</div></label>
    <label class="campo"><span>Para esperar mientras carga</span><div class="chips">
      ${Object.entries(SERVICIOS).map(([k, t]) => chip('servicios', k, t, f.servicios.includes(k))).join('')}</div></label>
    <label class="campo"><span>Empresa</span><select id="empresa"><option value="">Todas</option>
      ${OPERADORES.map((o) => `<option value="${o.id}" ${f.empresa === o.id ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>
    <label class="campo"><span>Mis cargadores</span><div class="chips">${chip('favoritos', 1, '★ Solo favoritos', f.favoritos)}</div></label>
    <p class="muy-suave">«Gratis», «tarjeta», horario y servicios salen del registro oficial y de OpenStreetMap: si un cargador no los tiene apuntados, no aparece al filtrar. Para saber si está libre ahora, abre su ficha: lleva un enlace a REVE (Red Eléctrica). Si se puede reservar solo lo publica Francia.</p>
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
    dondeEstoy = p;
    mapa.setView(p, Math.max(mapa.getZoom(), 13));
    yo?.remove();
    yo = L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="yo"></div>', iconSize: [18, 18] }), interactive: false }).addTo(mapa);
  } else if (forzar || buscarPoste) {
    raiz.querySelector('#estado').textContent = 'No me dejan ver dónde estás: activa la ubicación del navegador.';
    buscarPoste = false;
  }
  if (p && buscarPoste) mapa.setView(p, 18);
  await cargar(raiz);
  if (p && buscarPoste) {
    buscarPoste = false;
    const cerca = datos.map((c) => ({ c, d: distancia(p, [c.lat, c.lon]) })).sort((a, b) => a.d - b.d)[0];
    if (cerca && cerca.d <= 0.3) { abrirLuego = claveCargador(cerca.c); mapa.setView([cerca.c.lat, cerca.c.lon], 17); dibujar(raiz); }
    else aviso('No veo ningún cargador a menos de 300 m. Toca el más cercano en el mapa.');
  }
  if (verRango) pintarRango();
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
  marcadores = new Map();
  // Muy alejado y sin filtro de potencia: solo los rápidos (y tus favoritos), para no saturar el mapa.
  const lejos = mapa.getZoom() < 11 && filtros.minKw < 50 && !filtros.favoritos;
  visibles = datos.filter(pasa);
  const lista = visibles.filter((c) => !lejos || (c.rapido && c.compatible) || notaDe(c)?.fav);
  for (const c of lista) {
    if (verPrecio) { pinPrecio(c); continue; }
    const txt = c.potencia ? (c.potencia >= 1000 ? '' : Math.round(c.potencia)) : c.rapido ? '⚡' : '';
    const m = L.marker([c.lat, c.lon], { zIndexOffset: c.rapido ? 500 : 0,
      icon: L.divIcon({ className: '', html: `<div class="pin ${clasePin(c)}" ${notaDe(c)?.fav ? 'style="outline:3px solid #FFD84D;outline-offset:1px"' : ''}><span style="font-size:${String(txt).length > 2 ? 10 : 12}px">${esc(txt)}</span></div>`, iconSize: [28, 28], iconAnchor: [14, 30], popupAnchor: [0, -28] }),
    }).on('click', () => abrirFicha(c)).addTo(capa);
    marcadores.set(claveCargador(c), m);
  }
  const pendiente = abrirLuego && visibles.find((c) => claveCargador(c) === abrirLuego);
  if (pendiente) { abrirLuego = null; abrirFicha(pendiente); }
  const f = fechaLista();
  if (verPrecio) {
    const con = lista.filter((c) => c.precio).length;
    raiz.querySelector('#estado').innerHTML = `${num(con)} con precio de ${num(lista.length)}${lejos ? ' rápidos' : ''}<br>
      <span class="leyenda-precio" style="background:#3FE0B0"></span>menos de ${num(BARATO, 2)}<span class="leyenda-precio" style="background:#FFB84D"></span>hasta ${num(CARO, 2)}<span class="leyenda-precio" style="background:#FF6B6B"></span>más de ${num(CARO, 2)} €/kWh`;
    return;
  }
  raiz.querySelector('#estado').textContent = (lista.length
    ? `${num(lista.length)}${lejos ? ' rápidos' : ''} aquí${lejos ? ' (acerca para ver todos)' : ''}`
    : 'Ninguno aquí con estos filtros') + (f ? ` · lista del ${new Date(f + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : '');
}

const hayPrecios = () => datos.some((c) => c.precio);

// Punto de la vista de precios: etiqueta con el precio, o un puntito gris si REVE no lo da.
function pinPrecio(c) {
  const p = precioKwh(c), h = c.precio?.[4];
  const fav = notaDe(c)?.fav ? 'outline:3px solid #FFD84D;outline-offset:1px;' : '';
  let icono;
  if (p != null || h) {
    const txt = p != null ? num(p, 2) : `${num(h, 1)} €/h`;
    const tramo = p != null ? tramoPrecio(p) : 'normal';
    const ancho = txt.length * 8 + 20;
    icono = L.divIcon({ className: '', html: `<div class="pin-precio ${tramo}" style="${fav}">${esc(txt)}</div>`, iconSize: [ancho, 24], iconAnchor: [ancho / 2, 30] });
  } else {
    icono = L.divIcon({ className: '', html: `<div class="pin-sin" style="${fav}"></div>`, iconSize: [10, 10], iconAnchor: [5, 5] });
  }
  // Los baratos, por encima de los caros cuando se pisan.
  const m = L.marker([c.lat, c.lon], { icon: icono, zIndexOffset: p != null ? Math.round(2000 - p * 1000) : -1000 }).on('click', () => abrirFicha(c)).addTo(capa);
  marcadores.set(claveCargador(c), m);
}

export function salir() { mapa?.remove(); mapa = null; capa = null; yo = null; aro = null; }
