// cargadores.js — TODOS los puntos de recarga de España en un archivo (datos/cargadores.json):
// registro oficial del Ministerio + OpenStreetMap, sin duplicados. Se rehace cada noche solo
// (.github/workflows/cargadores.yml). Fuera de España se pregunta a OpenStreetMap en directo.
// Ojo: ninguna fuente gratuita dice si están libres ahora ni el precio de hoy.
import { esc, num, abrirHoja, cerrarHoja, aviso, fechaBonita } from './comun.js';
import { distancia } from './calc.js';
import { COCHE, claveCargador, notaDe, guardarNota, cargas, bateria } from './datos.js';
import { operadorDe, enlaceApp, enlacePago, esIphone, COMODINES } from './operadores.js';
import { abrirFormCarga } from './pantallas/diario.js';
import { cargarAqui } from './pantallas/cargar.js';

const ENCHUFES = { C: 'CCS', T: 'Tipo 2', H: 'CHAdeMO', S: 'Schuko', X: 'Tesla', J: 'Tipo 1', I: 'Industrial' };
const TARJETA = 1, APP = 2, RFID = 4, GRATIS = 8, SIN_REGISTRO = 16, CLIENTES = 32;
const CELDA = 0.25;
export const SERVICIOS = { r: '☕ Cafetería o restaurante', s: '🛒 Tienda o súper', g: '⛽ Gasolinera', h: '🏨 Hotel', p: '🅿️ Parking cubierto' };

let todos = null, rejilla = null, fechaDatos = null, cargando = null;

export function cargarTodos() {
  if (todos) return Promise.resolve(todos);
  cargando ||= fetch('datos/cargadores.json').then((r) => {
    if (!r.ok) throw new Error('No se pudo bajar la lista de cargadores');
    return r.json();
  }).then((d) => {
    fechaDatos = d.fecha;
    todos = d.d.map(deFila);
    rejilla = new Map();
    for (const c of todos) {
      const k = `${Math.floor(c.lat / CELDA)},${Math.floor(c.lon / CELDA)}`;
      (rejilla.get(k) || rejilla.set(k, []).get(k)).push(c);
    }
    return todos;
  }).catch((e) => { cargando = null; throw e; });
  return cargando;
}
export const fechaLista = () => fechaDatos;

function deFila([lat, lon, nombre, operador, potencia, enchufesTxt, pago, horario, dir, puntos, fuente, servicios = ''], i) {
  const enchufes = enchufesTxt ? enchufesTxt.split(',').map((x) => {
    const [, t, n, kw] = x.match(/^(\w)(\d+)(?::(\d+))?$/) || [];
    return { tipo: t, nombre: ENCHUFES[t] || t, n: +n || null, kw: +kw || 0 };
  }) : [];
  const ccs = enchufes.some((e) => e.tipo === 'C');
  return {
    id: `c${i}`, lat, lon, nombre, operador, potencia, enchufes, ccs, dir, horario, puntos, fuente, servicios,
    tarjeta: !!(pago & TARJETA), h24: horario === '24h',
    rapido: ccs && (potencia >= 50 || !potencia),
    compatible: !enchufes.length || enchufes.some((e) => 'CTS'.includes(e.tipo)),
    soloSchuko: enchufes.length > 0 && enchufes.every((e) => e.tipo === 'S' || !'CT'.includes(e.tipo)) && enchufes.some((e) => e.tipo === 'S'),
    gratis: !!(pago & GRATIS), clientes: !!(pago & CLIENTES),
    pago: [pago & TARJETA && 'Tarjeta', pago & SIN_REGISTRO && 'Sin registro', pago & APP && 'App', pago & RFID && 'Tarjeta de socio'].filter(Boolean),
  };
}

export async function enZona(s, w, n, e) {
  await cargarTodos();
  const lista = [];
  for (let y = Math.floor(s / CELDA); y <= Math.floor(n / CELDA); y++) {
    for (let x = Math.floor(w / CELDA); x <= Math.floor(e / CELDA); x++) {
      for (const c of rejilla.get(`${y},${x}`) || []) if (c.lat >= s && c.lat <= n && c.lon >= w && c.lon <= e) lista.push(c);
    }
  }
  if (lista.length) return lista;
  return enZonaOsm(s, w, n, e); // fuera de España (Andorra, Francia, Portugal…)
}

// Rápidos (CCS) cerca de cada punto: para las paradas de un viaje.
export async function rapidosCercaDe(puntos, radioKm = 10) {
  await cargarTodos();
  const encontrados = puntos.map((p) => {
    const g = radioKm / 111 + CELDA;
    return enZonaSync(p[0] - g, p[1] - g * 1.4, p[0] + g, p[1] + g * 1.4)
      .filter((c) => c.rapido && c.compatible && !c.clientes && distancia(p, [c.lat, c.lon]) <= radioKm);
  });
  const sinNada = puntos.filter((_, i) => !encontrados[i].length);
  if (sinNada.length) {
    try { encontrados.push(await rapidosOsm(sinNada, radioKm * 1000)); } catch { /* sin conexión: lo que haya */ }
  }
  return encontrados.flat();
}
function enZonaSync(s, w, n, e) {
  const lista = [];
  for (let y = Math.floor(s / CELDA); y <= Math.floor(n / CELDA); y++) {
    for (let x = Math.floor(w / CELDA); x <= Math.floor(e / CELDA); x++) lista.push(...(rejilla.get(`${y},${x}`) || []));
  }
  return lista;
}

/* ---------- OpenStreetMap en directo (solo fuera de España) ---------- */
const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function overpass(consulta) {
  let ultimo;
  for (const url of SERVIDORES) {
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(consulta), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (r.ok) return (await r.json()).elements;
      ultimo = new Error(r.status === 429 ? 'Demasiadas búsquedas seguidas; espera un minuto' : `El servidor de mapas no responde (${r.status})`);
    } catch { ultimo = new Error('Sin conexión con el servidor de mapas'); }
  }
  throw ultimo;
}
const cacheOsm = new Map();
async function enZonaOsm(s, w, n, e) {
  const clave = [s, w, n, e].map((x) => x.toFixed(2)).join(',');
  if (!cacheOsm.has(clave)) {
    const els = await overpass(`[out:json][timeout:25];nwr["amenity"="charging_station"](${s},${w},${n},${e});out center tags 1500;`);
    cacheOsm.set(clave, els.map(deOsm).filter(Boolean));
  }
  return cacheOsm.get(clave);
}
async function rapidosOsm(puntos, radioM) {
  const partes = puntos.map(([la, lo]) => `nwr["amenity"="charging_station"]["socket:type2_combo"](around:${radioM},${la},${lo});`).join('');
  return (await overpass(`[out:json][timeout:40];(${partes});out center tags;`)).map(deOsm).filter(Boolean);
}
const TIPO_OSM = { type2_combo: 'C', type2: 'T', type2_cable: 'T', chademo: 'H', schuko: 'S', tesla_supercharger: 'X' };
function kwOsm(v) {
  if (!v) return 0;
  return Math.max(0, ...String(v).split(/[;,]/).map((x) => {
    const m = x.trim().match(/([\d.]+)\s*(kw|w|kva)?/i);
    return !m ? 0 : /^w$/i.test(m[2] || '') ? +m[1] / 1000 : +m[1];
  }));
}
function deOsm(el) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat == null || t.access === 'private') return null;
  const partes = [];
  let kw = kwOsm(t['charging_station:output']);
  for (const [k, letra] of Object.entries(TIPO_OSM)) {
    if (!t[`socket:${k}`] || t[`socket:${k}`] === 'no') continue;
    const p = Math.round(kwOsm(t[`socket:${k}:output`])); kw = Math.max(kw, p);
    partes.push(`${letra}${parseInt(t[`socket:${k}`], 10) || 1}${p ? ':' + p : ''}`);
  }
  let pago = 0;
  if (t['payment:credit_cards'] === 'yes' || t['payment:contactless'] === 'yes') pago |= TARJETA;
  if (t['payment:app'] === 'yes' || t['authentication:app'] === 'yes') pago |= APP;
  if (t.fee === 'no') pago |= GRATIS;
  if (t['authentication:none'] === 'yes') pago |= SIN_REGISTRO;
  if (t.access === 'customers') pago |= CLIENTES;
  return { ...deFila([lat, lon, t.name || t.brand || t.operator || 'Punto de recarga', t.operator && t.operator !== t.name ? t.operator : '',
    Math.round(kw), partes.join(','), pago, t.opening_hours === '24/7' ? '24h' : t.opening_hours || '', t['addr:city'] || '', parseInt(t.capacity, 10) || 0, 'o'], 0), id: `osm${el.id}` };
}

/* ---------- Pintar ---------- */
export const clasePin = (c) => (!c.compatible ? 'no' : c.rapido ? 'rapido' : c.potencia >= 22 ? 'medio' : 'lento');

export function htmlPopup(c) {
  const como = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}`;
  const otro = esIphone() ? ['Apple Maps', `https://maps.apple.com/?daddr=${c.lat},${c.lon}`] : ['Waze', `https://waze.com/ul?ll=${c.lat},${c.lon}&navigate=yes`];
  const fuente = { m: 'Registro oficial', o: 'OpenStreetMap', mo: 'Registro oficial + OpenStreetMap' }[c.fuente] || '';
  return `<h3>${esc(c.nombre)}</h3>
    ${c.operador ? `<div class="suave">${esc(c.operador)}</div>` : ''}
    ${c.dir ? `<div class="muy-suave">${esc(c.dir)}</div>` : ''}
    <div style="font-size:22px;font-weight:750;margin-top:6px">${c.potencia ? `${num(c.potencia)} kW` : c.rapido ? 'Rápido' : 'Potencia sin datos'}
      ${c.potencia > COCHE.dcMax ? `<span class="muy-suave" style="font-weight:500">(tu coche coge hasta ${COCHE.dcMax})</span>` : ''}</div>
    ${!c.compatible ? '<div style="color:var(--rojo);font-weight:700">No vale para tu coche (no tiene CCS ni Tipo 2)</div>' : ''}
    ${c.soloSchuko ? '<div style="color:var(--ambar);font-weight:600">Solo enchufe normal: necesitas el cargador portátil del coche</div>' : ''}
    <div class="chips">${c.enchufes.map((e) => `<span class="chip">${e.n ? `${e.n}× ` : ''}${e.nombre}${e.kw ? ` · ${num(e.kw)} kW` : ''}</span>`).join('') || '<span class="chip">Enchufes sin datos</span>'}
      ${c.gratis ? '<span class="chip activo">Gratis</span>' : ''}${c.pago.map((p) => `<span class="chip">${p}</span>`).join('')}</div>
    ${c.horario ? `<div class="suave">🕒 ${esc(c.horario === '24h' ? 'Abierto 24 h' : c.horario)}</div>` : ''}
    ${c.clientes ? '<div class="suave">Solo para clientes del sitio</div>' : ''}
    ${c.servicios ? `<div class="suave">${[...c.servicios].map((s) => SERVICIOS[s]).filter(Boolean).join(' · ')}</div>` : ''}
    ${bloquePago(c)}
    ${bloqueMio(c)}
    <div class="fila" style="margin-top:10px">
      <a class="boton mini" href="${como}" target="_blank" rel="noopener">Google Maps</a>
      <a class="boton mini sec" href="${otro[1]}" target="_blank" rel="noopener">${otro[0]}</a>
    </div>
    <div class="fila" style="margin-top:8px">
      <button class="boton mini sec" data-accion="fav" data-k="${claveCargador(c)}">${notaDe(c)?.fav ? '★ Favorito' : '☆ Guardar'}</button>
      <button class="boton mini sec" data-accion="nota" data-k="${claveCargador(c)}">📝 Nota</button>
      <button class="boton mini sec" data-accion="carga" data-k="${claveCargador(c)}">⚡ Apuntar</button>
    </div>
    <div class="fila" style="margin-top:8px">
      <button class="boton mini" data-accion="cargo" data-k="${claveCargador(c)}">▶ Empiezo a cargar aquí</button>
    </div>
    <div class="muy-suave" style="margin-top:8px">${fuente}</div>`;
}

// Cómo se paga aquí, sin tener las apps de todas las empresas.
function bloquePago(c) {
  const op = operadorDe(c.operador, c.nombre);
  const filas = [];
  if (op?.id === 'tesla' && COCHE.supercargador) filas.push('🚗 <b>Con tu Tesla: enchufar y listo</b>, se cobra solo en tu cuenta de Tesla');
  if (c.gratis) filas.push('🎁 <b>Gratis</b> según OpenStreetMap');
  if (c.pago.includes('Tarjeta')) filas.push('💳 <b>Acepta tarjeta</b> en el poste');
  else if (c.rapido) filas.push('💳 Si el poste tiene lector o código QR, paga con tarjeta sin app');
  if (op) filas.push(`📱 App de ${esc(op.nombre)}: <a href="${enlaceApp(op.app)}">${esc(op.app)}</a>${op.nota ? `<br><span class="muy-suave">${esc(op.nota)}</span>` : ''}`);
  else if (c.pago.includes('App')) filas.push('📱 Con la app de la empresa');
  const precio = ultimoPrecio(c, op);
  if (precio) filas.push(`🧾 ${precio}`);
  // Pagar con una app comodín: valen en cargadores de muchísimas empresas.
  const botones = c.gratis ? '' : `<div style="margin-top:8px"><span class="muy-suave">Pagar con una app que vale casi en todos:</span>
    <div class="fila" style="margin-top:6px">${COMODINES.map((x) => `<a class="boton mini" href="${enlacePago(x.id)}" target="_blank" rel="noopener" style="background:var(--tarjeta);color:var(--texto);border:1px solid var(--borde)">🔑 ${x.nombre}</a>`).join('')}</div></div>`;
  return `<div style="margin-top:8px;padding:10px;border-radius:10px;background:var(--tarjeta2);font-size:13px;line-height:1.5"><b style="display:block;margin-bottom:2px">Cómo pagar aquí</b>${filas.join('<br>')}${botones}</div>`;
}

// Lo que pagaste la última vez aquí o en esta empresa (de tus Gastos).
function ultimoPrecio(c, op) {
  const k = claveCargador(c);
  const conPrecio = cargas().filter((x) => +x.kwh > 0 && +x.euros > 0);
  const aqui = conPrecio.find((x) => x.cargadorK === k);
  if (aqui) return `Aquí pagaste ${num(aqui.euros / aqui.kwh, 2)} €/kWh (${fechaBonita(aqui.fecha)})`;
  const empresa = op && conPrecio.find((x) => x.operador === op.id);
  if (empresa) return `En ${esc(op.nombre)} pagaste ${num(empresa.euros / empresa.kwh, 2)} €/kWh (${fechaBonita(empresa.fecha)})`;
  return '';
}

function bloqueMio(c) {
  const n = notaDe(c);
  if (!n || (!n.nota && !n.estado)) return '';
  const est = { ok: '✅ Te funcionó bien', roto: '⛔ Roto o lento', ocupado: '⏳ Suele estar ocupado' }[n.estado] || '';
  return `<div style="margin-top:8px;font-size:13px"><b>Tu nota</b> <span class="muy-suave">(${fechaBonita(n.fecha)})</span><br>${est}${est && n.nota ? ' · ' : ''}${esc(n.nota || '')}</div>`;
}

// Ficha de un cargador: hoja que sube desde abajo (cabe todo y se puede desplazar).
export function abrirFicha(c) {
  abrirHoja(`<div class="ficha">${htmlPopup(c)}</div><div class="botones"><button class="boton sec" data-cerrar>Cerrar</button></div>`, (caja) => {
    caja.addEventListener('click', (e) => { const b = e.target.closest('[data-accion]'); if (b) accionFicha(b, c); });
  });
}

function accionFicha(b, c) {
  const accion = b.dataset.accion;
  const op = operadorDe(c.operador, c.nombre);
  if (accion === 'fav') {
    const fav = !notaDe(c)?.fav;
    guardarNota(c, { fav });
    b.textContent = fav ? '★ Favorito' : '☆ Guardar';
    aviso(fav ? 'Guardado en favoritos' : 'Quitado de favoritos');
  } else if (accion === 'nota') {
    abrirNota(c, () => abrirFicha(c));
  } else if (accion === 'cargo') {
    cerrarHoja();
    cargarAqui({ sitio: c.nombre, kw: c.potencia || (c.rapido ? 50 : 22), operador: op?.id || '', cargadorK: claveCargador(c) });
  } else if (accion === 'carga') {
    abrirFormCarga({ lugar: c.gratis ? 'gratis' : c.rapido ? 'rapida' : 'lenta', sitio: c.nombre, operador: op?.id || '', cargadorK: claveCargador(c), desde: bateria().pct });
  }
}

function abrirNota(c, alGuardar) {
  const n = notaDe(c) || {};
  let estado = n.estado || '';
  const ESTADOS = [['ok', '✅ Funciona bien'], ['roto', '⛔ Roto o lento'], ['ocupado', '⏳ Suele estar ocupado']];
  abrirHoja(`<h2>${esc(c.nombre)}</h2>
    <label class="campo"><span>¿Qué tal?</span><div class="chips" id="estados">
      ${ESTADOS.map(([k, t]) => `<button type="button" class="chip ${k === estado ? 'activo' : ''}" data-e="${k}">${t}</button>`).join('')}
    </div></label>
    <label class="campo"><span>Nota</span><textarea id="nota" rows="3" placeholder="Ej. el de la izquierda va mejor; pagué con tarjeta">${esc(n.nota || '')}</textarea></label>
    <div class="botones"><button class="boton" id="guardar">Guardar</button>
      ${n.nota || n.estado ? '<button class="boton peligro" id="quitar">Borrar nota</button>' : ''}
      <button class="boton sec" data-cerrar>Cancelar</button></div>`, (caja) => {
    caja.querySelector('#estados').onclick = (e) => {
      const b = e.target.closest('[data-e]'); if (!b) return;
      estado = estado === b.dataset.e ? '' : b.dataset.e;
      caja.querySelectorAll('#estados .chip').forEach((x) => x.classList.toggle('activo', x.dataset.e === estado));
    };
    caja.querySelector('#guardar').onclick = () => { guardarNota(c, { estado, nota: caja.querySelector('#nota').value.trim() }); cerrarHoja(); aviso('Nota guardada'); alGuardar?.(); };
    caja.querySelector('#quitar')?.addEventListener('click', () => { guardarNota(c, { estado: '', nota: '' }); cerrarHoja(); aviso('Nota borrada'); alGuardar?.(); });
  });
}
