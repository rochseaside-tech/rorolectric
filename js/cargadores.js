// cargadores.js — TODOS los puntos de recarga de España en un archivo (datos/cargadores.json):
// registro oficial del Ministerio + OpenStreetMap, sin duplicados. Se rehace cada noche solo
// (.github/workflows/cargadores.yml). Fuera de España se pregunta a OpenStreetMap en directo.
// Precios: los oficiales de REVE (Red Eléctrica), que baja scripts/reve.mjs; si está libre ahora
// no lo tenemos aquí, pero cada ficha enlaza a la de REVE, que sí lo dice.
import { esc, num, abrirHoja, cerrarHoja, aviso, fechaBonita, duracion, hora, preciosPVPC, certeza } from './comun.js';
import { distancia, minutosDC, horasAC, kwhRedDC, kwhRedAC, preciosTarifa, ventanaBarata } from './calc.js';
import { COCHE, claveCargador, notaDe, guardarNota, cargas, bateria, ajustes, objetivoRecomendado } from './datos.js';
import { operadorDe, enlaceApp, enlacePago, esIphone, COMODINES } from './operadores.js';
import { abrirFormCarga } from './pantallas/diario.js';
import { cargarAqui } from './pantallas/cargar.js';

const ENCHUFES = { C: 'CCS', T: 'Tipo 2', H: 'CHAdeMO', S: 'Schuko', X: 'Tesla', J: 'Tipo 1', I: 'Industrial' };
const TARJETA = 1, APP = 2, RFID = 4, GRATIS = 8, SIN_REGISTRO = 16, CLIENTES = 32, RESERVABLE = 64;
const CELDA = 0.25;
export const SERVICIOS = { r: '☕ Cafetería o restaurante', s: '🛒 Tienda o súper', g: '⛽ Gasolinera', h: '🏨 Hotel', p: '🅿️ Parking cubierto' };

let todos = null, rejilla = null, fechaDatos = null, infoReve = null, cargando = null;

export function cargarTodos() {
  if (todos) return Promise.resolve(todos);
  cargando ||= fetch('datos/cargadores.json').then((r) => {
    if (!r.ok) throw new Error('No se pudo bajar la lista de cargadores');
    return r.json();
  }).then((d) => {
    fechaDatos = d.fecha; infoReve = d.reve || null;
    todos = d.d.map(deFila);
    refrescarEstado(true);
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

function deFila([lat, lon, nombre, operador, potencia, enchufesTxt, pago, horario, dir, puntos, fuente, servicios = '', reve = '', precio = 0, tarifa = '', funcion = null, reveOtros = 0, ext = 0], i) {
  const enchufes = enchufesTxt ? enchufesTxt.split(',').map((x) => {
    const [, t, n, kw] = x.match(/^(\w)(\d+)(?::(\d+))?$/) || [];
    return { tipo: t, nombre: ENCHUFES[t] || t, n: +n || null, kw: +kw || 0 };
  }) : [];
  const ccs = enchufes.some((e) => e.tipo === 'C');
  return {
    id: `c${i}`, lat, lon, nombre, operador, potencia, enchufes, ccs, dir, horario, puntos, fuente, servicios, reve, precio: precio || null, tarifa,
    reservable: !!(pago & RESERVABLE),
    // Según REVE: [puntos que no funcionan, puntos que tiene]. «roto» = no funciona ninguno.
    funcion, funcionNoche: funcion, roto: !!(funcion && funcion[1] && funcion[0] >= funcion[1]),
    reves: reve ? [reve, ...(reveOtros || [])] : [],
    ext: ext || '', // id en el registro de Francia o Portugal, para su estado de cada hora
    tarjeta: !!(pago & TARJETA), h24: horario === '24h',
    rapido: ccs && (potencia >= 50 || !potencia),
    compatible: !enchufes.length || enchufes.some((e) => 'CTS'.includes(e.tipo)),
    soloSchuko: enchufes.length > 0 && enchufes.every((e) => e.tipo === 'S' || !'CT'.includes(e.tipo)) && enchufes.some((e) => e.tipo === 'S'),
    gratis: !!(pago & GRATIS), clientes: !!(pago & CLIENTES),
    pago: [pago & TARJETA && 'Tarjeta', pago & SIN_REGISTRO && 'Sin registro', pago & APP && 'App', pago & RFID && 'Tarjeta de socio'].filter(Boolean),
  };
}

/* ---------- Países vecinos (Francia, Portugal, Andorra) ---------- */
// Vienen en teselas de 2° (datos/fuera/LAT_LON.json, scripts/fuera.mjs): solo se baja la de la zona que se mira.
let indiceFuera = null;
const teselas = new Map();
async function cargarFuera(zonas) {
  indiceFuera ||= fetch('datos/fuera/indice.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const ind = await indiceFuera;
  if (!ind) { indiceFuera = null; return; }
  const T = ind.tamTesela || 2, tareas = [];
  for (const [s, w, n, e] of zonas) {
    for (let la = Math.floor(s / T) * T; la <= n; la += T) {
      for (let lo = Math.floor(w / T) * T; lo <= e; lo += T) {
        const k = `${la}_${lo}`;
        if (!ind.teselas[k]) continue;
        if (!teselas.has(k)) {
          teselas.set(k, fetch(`datos/fuera/${k}.json`).then((r) => r.json()).then((d) => {
            const deTesela = [];
            d.d.forEach((f, i) => {
              const c = { ...deFila(f, 0), id: `f${k}-${i}` };
              todos.push(c); deTesela.push(c);
              const kc = `${Math.floor(c.lat / CELDA)},${Math.floor(c.lon / CELDA)}`;
              (rejilla.get(kc) || rejilla.set(kc, []).get(kc)).push(c);
            });
            porTesela.set(k, deTesela);
            cargarAhora(k);
          }).catch(() => teselas.delete(k)));
        }
        tareas.push(teselas.get(k));
      }
    }
  }
  await Promise.all(tareas);
}

/* ---------- Francia y Portugal: libres, ocupados y rotos de la última hora (datos/ahora/, scripts/ahora.mjs) ---------- */
const porTesela = new Map(), ahoraPedido = new Map();
let indiceAhora = null;
const FUENTE_AHORA = { pt: 'MOBI.E', fr: 'la base nacional de Francia' };
async function cargarAhora(k, forzar = false) {
  if (!forzar && Date.now() - (ahoraPedido.get(k) || 0) < 15 * 60e3) return;
  ahoraPedido.set(k, Date.now());
  try {
    if (forzar || !indiceAhora) indiceAhora = await (await fetch('datos/ahora/indice.json')).json();
    if (!indiceAhora.teselas.includes(k)) return;
    const d = await (await fetch(`datos/ahora/${k}.json`)).json();
    for (const c of porTesela.get(k) || []) {
      const x = c.ext && d.s[c.ext]; if (!x) continue;
      c.funcion = [x[0], x[1]];
      c.roto = !!(x[1] && x[0] >= x[1]);
      c.ahora = { fuera: x[0], total: x[1], libres: x[2], cargando: x[3], sin: x[1] - x[0] - x[2] - x[3], fecha: d.fechas[c.ext.slice(0, 2)], fuente: FUENTE_AHORA[c.ext.slice(0, 2)] };
    }
    window.dispatchEvent(new Event('estado-reve'));
  } catch { /* sin conexión: lo de anoche */ }
}

/* ---------- Averías al día (datos/estado-reve.json, se publica cada hora) ---------- */
// Lo de cada noche (funcionNoche) da cuántos puntos tiene; este archivo, cuáles no funcionan AHORA.
let estadoReve = null, estadoPedido = 0;
export const horaEstado = () => estadoReve?.fecha || null;
export function refrescarEstado(forzar = false) {
  if (!todos || (!forzar && Date.now() - estadoPedido < 15 * 60e3)) return;
  estadoPedido = Date.now();
  for (const k of porTesela.keys()) cargarAhora(k, true); // Francia y Portugal
  fetch('datos/estado-reve.json').then((r) => (r.ok ? r.json() : null)).then((e) => {
    if (!e?.f) return;
    estadoReve = e;
    for (const c of todos) aplicarEstado(c);
    window.dispatchEvent(new Event('estado-reve'));
  }).catch(() => { /* sin conexión: lo de anoche */ });
}
function aplicarEstado(c) {
  if (!estadoReve || !c.reves?.length) return;
  let fuera = 0, total = 0;
  for (const id of c.reves) { const x = estadoReve.f[id]; if (x) { fuera += x[0]; total += x[1]; } }
  const puntos = Math.max(c.funcionNoche?.[1] || 0, total);
  if (fuera) c.funcion = [fuera, puntos];
  else if (estadoReve.completo) c.funcion = puntos ? [0, puntos] : null;
  else c.funcion = c.funcionNoche; // aún no se ha mirado España entera: lo de anoche
  c.roto = !!(c.funcion && c.funcion[1] && c.funcion[0] >= c.funcion[1]);
}
// «hoy a las 14:05», «ayer a las 22:10», «13 oct»
export function cuandoEstado(fecha = null) {
  const f = fecha || estadoReve?.fecha; if (!f) return fechaCorta(infoReve?.fecha);
  const d = new Date(f), hoy = new Date();
  const h = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return `hoy a las ${h}`;
  if (d.toDateString() === new Date(hoy - 86400e3).toDateString()) return `ayer a las ${h}`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export async function enZona(s, w, n, e) {
  refrescarEstado();
  await cargarTodos();
  if ((n - s) * (e - w) <= 40) await cargarFuera([[s, w, n, e]]); // con el mapa muy alejado, no
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
  const g0 = radioKm / 111 + CELDA;
  await cargarFuera(puntos.map((p) => [p[0] - g0, p[1] - g0 * 1.4, p[0] + g0, p[1] + g0 * 1.4]));
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

/* ---------- Precios de REVE ---------- */
// c.precio = [rápida €/kWh mín, máx, normal mín, máx, €/hora cargando, € fijos por carga, €/hora de plaza ocupada, desde el minuto]
// €/kWh que pagarías aquí (rápida o normal); null si REVE no lo da. «alto» = el más caro de la horquilla.
// Si además (o solo) cobran por minuto, se pasa a €/kWh con lo que carga TU coche ahí (en rápida, ~70 % de su
// máximo de media): así los colores comparan lo que pagarías de verdad. soloKwh = solo la parte por kWh.
export function precioKwh(c, { rapida = c.rapido, alto = false, soloKwh = false } = {}) {
  const p = c.precio; if (!p) return null;
  const [a, b] = rapida && p[0] != null ? [p[0], p[1]] : p[2] != null ? [p[2], p[3]] : [p[0], p[1]];
  let k = a == null ? null : alto ? b ?? a : a;
  if (!soloKwh && p[4]) {
    const kw = rapida && c.ccs ? Math.min(c.potencia || 50, COCHE.dcMax) * 0.7 : Math.min(c.soloSchuko ? 2.3 : c.potencia || 7.4, COCHE.acMax);
    k = (k || 0) + p[4] / kw;
  }
  return k == null ? null : Math.round(k * 100) / 100;
}
const cobraTiempo = (c) => !!c.precio?.[4];
const eur = (x) => num(x, 2);
const horquilla = (a, b) => (b != null && b - a >= 0.01 ? `${eur(a)} a ${eur(b)}` : eur(a));
// Texto corto para listas: «0,47 €/kWh»
export function precioCorto(c) {
  const p = c.precio; if (!p) return '';
  const k = precioKwh(c);
  if (k == null) return '';
  return `${cobraTiempo(c) ? '≈ ' : precioKwh(c, { alto: true }) - k >= 0.01 ? 'desde ' : ''}${eur(k)} €/kWh${cobraTiempo(c) ? ' con tu coche' : ''}`;
}
const fechaCorta = (f) => (f ? new Date(f + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');
export const enlaceReve = (c) => (c.reve ? `https://www.mapareve.es/mapa-puntos-recarga/emplazamiento/${encodeURIComponent(c.reve)}` : '');

function bloquePrecio(c) {
  const p = c.precio;
  const libre = c.reve ? `<a class="boton mini sec" style="margin-top:8px" href="${enlaceReve(c)}" target="_blank" rel="noopener">🗺️ Ver su ficha en REVE</a>` : '';
  if (!p && c.tarifa) {
    // Francia: lo que la empresa pone en el registro oficial, tal cual (a veces es un enlace a su web).
    const t = /^https?:\/\/\S+$/.test(c.tarifa) ? `<a href="${esc(c.tarifa)}" target="_blank" rel="noopener">ver tarifas en su web</a>` : esc(c.tarifa);
    return `<div style="margin-top:8px;padding:10px;border-radius:10px;background:var(--tarjeta2);font-size:13px;line-height:1.5">
      <b style="display:block;margin-bottom:2px">Precio aquí</b>🧾 ${t}
      <div class="muy-suave" style="margin-top:4px">Lo que publica la empresa en el registro oficial de Francia (puede estar en francés).</div></div>`;
  }
  if (!p) {
    if (!c.reve) return '';
    const bajando = infoReve && !infoReve.tarifasCompletas;
    return `<div style="margin-top:8px"><span class="muy-suave">${bajando ? 'El precio de este todavía no lo tengo: se están bajando los de toda España y tardan unos días.' : 'Esta empresa no publica el precio en REVE.'}</span><br>${libre}</div>`;
  }
  const [rMin, rMax, nMin, nMax, hora, fijo, plaza, desde] = p;
  const filas = [];
  if (rMin != null) filas.push(`⚡ Carga rápida: <b>${horquilla(rMin, rMax)} €/kWh</b>`);
  if (nMin != null) filas.push(`🔌 Carga normal: <b>${horquilla(nMin, nMax)} €/kWh</b>`);
  if ((rMax != null && rMax - rMin >= 0.01) || (nMax != null && nMax - nMin >= 0.01)) filas.push('<span class="muy-suave">Cambia según la hora o la potencia.</span>');
  if (hora) filas.push(rMin == null && nMin == null ? `⏱️ Se paga por tiempo: <b>${eur(hora)} €/hora</b>` : `⏱️ Y además ${eur(hora)} €/hora mientras carga`);
  if (fijo) filas.push(`🎟️ ${eur(fijo)} € por cada carga`);
  if (plaza) filas.push(`🅿️ Ocupar la plaza ${desde ? `pasados ${desde} min` : 'sin cargar'}: ${eur(plaza)} €/hora`);
  const fecha = fechaCorta(infoReve?.fecha);
  return `<div style="margin-top:8px;padding:10px;border-radius:10px;background:var(--tarjeta2);font-size:13px;line-height:1.5">
    <b style="display:block;margin-bottom:2px">Precio aquí</b>${filas.join('<br>')}
    <div class="muy-suave" style="margin-top:4px">${origenPrecio(c, fecha)}</div>${libre}</div>`;
}

// De dónde sale el precio (cada país lo publica a su manera).
function origenPrecio(c, fecha) {
  const t = c.tarifa && !/^https?:/.test(c.tarifa) ? esc(c.tarifa) : '';
  if (/^OpenStreetMap: /.test(c.tarifa || '')) return `Precio apuntado en OpenStreetMap por otros conductores: «${esc(c.tarifa.slice(15))}». Compruébalo en el poste ${certeza('baja')}.`;
  if (c.fuente === 'f') return `Lo que publica la empresa en el registro oficial de Francia${t ? `: «${t}»` : ''}. Compruébalo en el poste.`;
  if (c.fuente === 'p') return `Total aproximado: en Portugal el registro oficial (MOBI.E) solo publica lo que cobra el operador por el poste${t ? ` («${t}»)` : ''}. Le sumo unos 0,15 €/kWh de energía (lo normal con una tarjeta de carga), 0,11 € de MOBI.E por carga y el IVA del 23 %. Pagando con tarjeta en el poste puede ser distinto ${certeza('media')}.`;
  if (/^Red pública de Andorra/.test(c.tarifa || '')) return `${t}. Es la tarifa de la red pública (FEDA y las demás distribuidoras); si el cargador es de un hotel o una tienda, puede ser otra ${certeza('media')}.`;
  if (c.fuente === 'o' || !c.reve) return `Precio apuntado en OpenStreetMap por otros conductores${t ? `: «${t}»` : ''}. Compruébalo en el poste ${certeza('baja')}.`;
  return `Precio oficial publicado en REVE (Red Eléctrica de España), IVA incluido${fecha ? ` · datos del ${fecha}` : ''}.`;
}

/* ---------- ¿Funciona? (REVE) ---------- */
/* ---------- ¿Libre ahora? (al momento, vía el intermediario de Cloudflare) ---------- */
const PUENTE = 'https://rorolectric.rorolectric.workers.dev';
export async function estadoAhora(ids) {
  if (!ids.length) return {};
  const r = await fetch(`${PUENTE}/estado?ids=${ids.slice(0, 5).map(encodeURIComponent).join(',')}`);
  if (!r.ok) throw new Error('sin respuesta');
  return r.json();
}
// Suma los puntos de todos los emplazamientos REVE de un cargador.
export function resumenAhora(c, datos) {
  const t = { libres: 0, cargando: 0, fuera: 0, sin: 0, total: 0 };
  for (const id of c.reves || []) { const x = datos[id]; if (x && !x.error) for (const k in t) t[k] += x[k] || 0; }
  return t.total ? t : null;
}
export function textoAhora(t) {
  if (!t) return '';
  if (t.libres) return `🟢 Libre ahora: ${t.libres} de ${t.total}`;
  if (t.cargando) return `🟠 Ocupado ahora (${t.cargando} cargando)`;
  if (t.fuera && t.fuera + t.sin >= t.total) return '⛔ Fuera de servicio ahora';
  return '';
}
// Francia y Portugal: lo de la última hora (no se pregunta al momento: lo publican cada pocos minutos y se baja cada hora).
function lineaAhoraFuera(c) {
  const txt = textoAhora(c.ahora);
  if (!txt) return '';
  const t = c.ahora;
  return `<div style="margin-top:4px;font-weight:700;color:${t.libres ? 'var(--acento)' : t.cargando ? 'var(--ambar)' : 'var(--rojo)'}">${txt} <span class="muy-suave" style="font-weight:500">según ${t.fuente}, ${cuandoEstado(t.fecha)}</span></div>`;
}

async function montarAhora(caja, c) {
  const el = caja.querySelector('#ahora'); if (!el) return;
  try {
    const t = resumenAhora(c, await estadoAhora(c.reves));
    const txt = textoAhora(t);
    el.className = '';
    el.style.cssText = `margin-top:4px;font-weight:700;color:${!txt ? 'var(--texto3)' : t.libres ? 'var(--acento)' : t.cargando ? 'var(--ambar)' : 'var(--rojo)'}`;
    el.innerHTML = txt ? `${txt} <span class="muy-suave" style="font-weight:500">según REVE, al momento</span>` : '<span class="muy-suave">Este cargador no dice a REVE si está libre</span>';
  } catch { el.innerHTML = '<span class="muy-suave">No he podido mirar si está libre (¿sin cobertura?)</span>'; }
}

export function textoFunciona(c) {
  const f = c.funcion; if (!f || !f[1]) return '';
  if (c.roto) return f[1] > 1 ? `⛔ No funciona ninguno de sus ${f[1]} puntos` : '⛔ Fuera de servicio';
  return f[0] ? `⚠️ ${f[0]} de ${f[1]} puntos no funcionan` : '';
}
function lineaFunciona(c) {
  const f = c.funcion; if (!f || !f[1]) return '';
  const fecha = cuandoEstado(c.ahora?.fecha);
  const t = textoFunciona(c) || `✅ Funcionan sus ${f[1] > 1 ? `${f[1]} puntos` : 'puntos'}`;
  const color = c.roto ? 'var(--rojo)' : f[0] ? 'var(--ambar)' : 'var(--acento)';
  return `<div style="color:${color};font-weight:700;margin-top:4px">${t} <span class="muy-suave" style="font-weight:500">según REVE${fecha ? `, ${fecha}` : ''}</span></div>`;
}

/* ---------- Pintar ---------- */
export const clasePin = (c) => (c.roto ? 'roto' : !c.compatible ? 'no' : c.rapido ? 'rapido' : c.potencia >= 22 ? 'medio' : 'lento');

export function htmlPopup(c) {
  const como = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}`;
  const otro = esIphone() ? ['Apple Maps', `https://maps.apple.com/?daddr=${c.lat},${c.lon}`] : ['Waze', `https://waze.com/ul?ll=${c.lat},${c.lon}&navigate=yes`];
  const fuente = [...(c.fuente || '')].map((x) => ({ m: 'Registro oficial', o: 'OpenStreetMap', r: 'REVE (Red Eléctrica)', f: 'Registro oficial de Francia (IRVE)', p: 'Registro oficial de Portugal (MOBI.E)' }[x])).filter(Boolean).join(' + ');
  return `<h3>${esc(c.nombre)}</h3>
    ${c.operador ? `<div class="suave">${esc(c.operador)}</div>` : ''}
    ${c.dir ? `<div class="muy-suave">${esc(c.dir)}</div>` : ''}
    <div style="font-size:22px;font-weight:750;margin-top:6px">${c.potencia ? `${num(c.potencia)} kW` : c.rapido ? 'Rápido' : 'Potencia sin datos'}
      ${c.potencia > COCHE.dcMax ? `<span class="muy-suave" style="font-weight:500">(tu coche coge hasta ${COCHE.dcMax})</span>` : ''}</div>
    ${lineaFunciona(c)}
    ${c.reves?.length ? '<div id="ahora" class="muy-suave" style="margin-top:4px">⏳ Mirando si está libre ahora…</div>' : lineaAhoraFuera(c)}
    ${!c.compatible ? '<div style="color:var(--rojo);font-weight:700">No vale para tu coche (no tiene CCS ni Tipo 2)</div>' : ''}
    ${c.soloSchuko ? '<div style="color:var(--ambar);font-weight:600">Solo enchufe normal: necesitas el cargador portátil del coche</div>' : ''}
    <div class="chips">${c.enchufes.map((e) => `<span class="chip">${e.n ? `${e.n}× ` : ''}${e.nombre}${e.kw ? ` · ${num(e.kw)} kW` : ''}</span>`).join('') || '<span class="chip">Enchufes sin datos</span>'}
      ${c.gratis ? '<span class="chip activo">Gratis</span>' : ''}${c.reservable ? '<span class="chip activo">📅 Se puede reservar</span>' : ''}${c.pago.map((p) => `<span class="chip">${p}</span>`).join('')}</div>
    ${c.horario ? `<div class="suave">🕒 ${esc(c.horario === '24h' ? 'Abierto 24 h' : c.horario)}</div>` : ''}
    ${c.clientes ? '<div class="suave">Solo para clientes del sitio</div>' : ''}
    ${c.servicios ? `<div class="suave">${[...c.servicios].map((s) => SERVICIOS[s]).filter(Boolean).join(' · ')}</div>` : ''}
    ${bloquePrecio(c)}
    ${c.compatible ? `<div id="coste-aqui" style="margin-top:8px;padding:10px;border-radius:10px;background:var(--tarjeta2);font-size:13px;line-height:1.5">
      <b style="display:block;margin-bottom:4px">Con tu coche, aquí</b>
      <div style="display:flex;align-items:center;gap:8px">Llegas con
        <input id="ca-de" type="number" inputmode="numeric" min="0" max="99" value="${bateria().pct}" style="width:72px;flex:none;padding:6px 8px"> %</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px">Hasta
        <span class="chips" id="ca-a" style="margin:0;flex-wrap:nowrap">${[80, 90, 100].map((v) => `<button type="button" class="chip ${v === (c.rapido ? 80 : objetivoRecomendado()) ? 'activo' : ''}" data-a="${v}">${v} %</button>`).join('')}</span></div>
      <div id="ca-res" style="margin-top:6px"></div><div id="ca-casa" class="suave" style="margin-top:4px"></div></div>` : ''}
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
  if (c.gratis) filas.push(`🎁 <b>Gratis</b> según ${c.fuente === 'f' ? 'el registro oficial de Francia' : 'OpenStreetMap'}`);
  if (c.pago.includes('Sin registro') && c.fuente === 'f') filas.push('🙋 Se puede cargar sin abono ni registro');
  if (c.reservable) filas.push(`📅 <b>Se puede reservar</b> ${op ? `desde la app de ${esc(op.nombre)}` : 'desde la app de la empresa'}`);
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
    montarCoste(caja, c);
    montarAhora(caja, c);
  });
}

/* ---------- «Con tu coche, aquí» y «¿aquí o en casa?» ---------- */
// Lo que tardas y pagas en este cargador desde tu batería de ahora, con la curva de carga de tu coche.
export function costeAqui(c, de, a) {
  const dc = c.rapido && c.ccs;
  const kw = dc ? Math.min(c.potencia || 50, COCHE.dcMax) : Math.min(c.soloSchuko ? 2.3 : c.potencia || 7.4, COCHE.acMax);
  const minutos = dc ? minutosDC(de, a, kw) : horasAC(de, a, kw) * 60;
  const kwh = dc ? kwhRedDC(de, a) : kwhRedAC(de, a);
  const ap = ajustes();
  let euros = null, eurosAlto = null, fuente = '';
  if (c.gratis) { euros = eurosAlto = 0; fuente = 'gratis'; }
  else {
    const p = precioKwh(c, { rapida: dc, soloKwh: true }), pAlto = precioKwh(c, { rapida: dc, alto: true, soloKwh: true });
    const extra = c.precio ? (c.precio[5] || 0) + (c.precio[4] || 0) * minutos / 60 : 0;
    if (p != null || (c.precio && c.precio[4])) { euros = kwh * (p || 0) + extra; eurosAlto = kwh * (pAlto || 0) + extra; fuente = 'reve'; }
    else { euros = eurosAlto = kwh * (dc ? +ap.precioRapida : +ap.precioLenta); fuente = 'ajustes'; }
  }
  // Red pública de Andorra: como mucho 42 € por carga
  if (/^Red pública de Andorra: 0,28/.test(c.tarifa || '') && euros > 42) { euros = Math.min(euros, 42); eurosAlto = Math.min(eurosAlto, 42); fuente = 'tope'; }
  return { dc, kw, minutos, kwh, euros, eurosAlto, fuente };
}

function montarCoste(caja, c) {
  const res = caja.querySelector('#ca-res'); if (!res) return;
  const deEl = caja.querySelector('#ca-de');
  let a = +caja.querySelector('#ca-a .chip.activo')?.dataset.a || 80;
  const pintar = () => {
    const de = Math.max(0, Math.min(99, +deEl.value || 0));
    if (de >= a) { res.innerHTML = '<span class="muy-suave">Ya tienes esa batería.</span>'; caja.querySelector('#ca-casa').innerHTML = ''; return; }
    const r = costeAqui(c, de, a);
    const dinero = r.fuente === 'gratis' ? '🎁 gratis'
      : `💶 <b>≈ ${r.eurosAlto - r.euros >= 0.5 ? `${num(r.euros)} a ${num(r.eurosAlto)}` : num(r.euros, r.euros < 10 ? 2 : 0)} €</b>`;
    const nota = r.fuente === 'ajustes' ? `<br><span class="muy-suave">Este cargador no publica precio: uso el tuyo de Ajustes (${num(r.dc ? ajustes().precioRapida : ajustes().precioLenta, 2)} €/kWh).</span>` : r.fuente === 'tope' ? '<br><span class="muy-suave">Con el tope de 42 € por carga de la red pública de Andorra.</span>' : '';
    const plaza = c.precio?.[6] && c.precio[7] && r.minutos > c.precio[7] ? `<br><span style="color:var(--ambar)">⚠️ Tu carga dura más de ${c.precio[7]} min: a partir de ahí cobran ${num(c.precio[6], 2)} €/hora por la plaza.</span>` : '';
    res.innerHTML = `⏱️ <b>${duracion(r.minutos)}</b> · ⚡ ${num(r.kwh, 1)} kWh · ${dinero}${r.dc ? '' : ` <span class="muy-suave">(a ${num(r.kw, 1)} kW)</span>`}${nota}${plaza}`;
    aquiOCasa(caja, c, de, a, r);
  };
  deEl.oninput = pintar;
  caja.querySelector('#ca-a').onclick = (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    a = +b.dataset.a;
    caja.querySelectorAll('#ca-a .chip').forEach((x) => x.classList.toggle('activo', x === b));
    pintar();
  };
  pintar();
}

// Lo mismo cargado en casa, a la hora más barata que queda (PVPC o tu tarifa).
let turnoCasa = 0;
async function aquiOCasa(caja, c, de, a, r) {
  const el = caja.querySelector('#ca-casa'); if (!el || r.fuente === 'gratis') { if (el) el.innerHTML = ''; return; }
  const yo = ++turnoCasa;
  const ap = ajustes();
  try {
    let precios = ap.tarifa === 'pvpc' ? await preciosPVPC() : preciosTarifa(ap);
    // PVPC: los precios de mañana salen hacia las 20:30. Antes, para «esta noche» se usa la madrugada de hoy
    // (la noche suele costar parecido de un día a otro), y se avisa.
    let estimado = false;
    if (ap.tarifa === 'pvpc') {
      const manana8 = new Date(); manana8.setDate(manana8.getDate() + 1); manana8.setHours(8, 0, 0, 0);
      const ultima = precios.at(-1)?.hora;
      if (ultima && ultima < manana8) {
        const extra = precios.filter((p) => p.hora.getHours() < 8 && p.hora.toDateString() === new Date().toDateString())
          .map((p) => ({ hora: new Date(p.hora.getTime() + 86400e3), eur: p.eur }));
        if (extra.length) { precios = [...precios, ...extra]; estimado = true; }
      }
    }
    const kwCasa = Math.min(+ap.cargadorCasa || 7.4, COCHE.acMax);
    const v = ventanaBarata(precios, kwhRedAC(de, a), kwCasa);
    if (yo !== turnoCasa || !v) return;
    const ahorro = r.euros - v.coste;
    const cuando = v.inicio < new Date() ? 'ya' : `a las ${hora(v.inicio)}`;
    el.innerHTML = `🏠 En casa: <b>≈ ${num(v.coste, 2)} €</b> enchufando ${cuando}${ahorro >= 1 ? ` · aquí pagas ${num(ahorro)} € más` : ahorro <= -1 ? ` · aquí te sale ${num(-ahorro)} € más barato` : ''}${estimado && v.inicio.getDate() !== new Date().getDate() ? '<br><span class="muy-suave">El precio de esta noche aún no está publicado: calculado con la madrugada de hoy.</span>' : ''}`;
  } catch { if (yo === turnoCasa) el.innerHTML = ''; }
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
