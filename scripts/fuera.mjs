// Cargadores de los países vecinos, para viajes y para cuando se cruza la frontera:
//  - Francia: registro oficial (Base nationale des IRVE, data.gouv.fr; obligatorio, se rehace cada día).
//    Trae además si se paga con tarjeta, si es gratis, si se puede RESERVAR y, a veces, el precio.
//  - Portugal y Andorra: OpenStreetMap (no publican un registro abierto).
// Se parte en teselas de 2° × 2° (datos/fuera/LAT_LON.json): el móvil solo baja las de la zona que mira.
// Si una fuente falla, se reutiliza lo publicado ayer de esa fuente. Uso: node scripts/fuera.mjs [csv-local]
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { TARJETA, GRATIS, SIN_REGISTRO, CLIENTES, RESERVABLE, leerOsm, descargarOsm, clave, vecinos, sumarEnchufes, aFila } from './comun.mjs';

const URL_FR = 'https://www.data.gouv.fr/fr/datasets/r/eb76d20a-8501-400e-b336-d85724de5435';
const PUBLICADO = 'https://rochseaside-tech.github.io/rorolectric/datos/fuera/';
const DIR = new URL('../datos/fuera/', import.meta.url);
const TESELA = 2;
const teselaDe = (la, lo) => `${Math.floor(la / TESELA) * TESELA}_${Math.floor(lo / TESELA) * TESELA}`;

// CSV con comillas (los textos llevan comas y saltos de línea).
function* leerCsv(txt) {
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (comillas) {
      if (ch === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else comillas = false; } else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ',') { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && txt[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1) yield fila;
      fila = [];
    } else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo); yield fila; }
}

const si = (v) => /^(true|1|oui|vrai)$/i.test((v || '').trim());
const recortar = (t, n = 140) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

// El precio en número, sacado del texto libre de «tarification», en el formato de REVE:
// [rápida €/kWh mín, máx, normal mín, máx, €/hora cargando, € fijos, €/hora de plaza, desde el minuto].
// Entiende «0,29€ / kWh», «49 cts/kWh», «HPC 49cts/Kwh», «AC 36cts/KWh», «0,30 € HT / kWh» (+20 % de IVA),
// «0,025€ / min», «9€ + 0,49€/kWh», «… 1,5€ par heure d'occupation» y el JSON {"energyPrice":…}.
export function precioFr(texto, rapido) {
  let t = String(texto || '').trim();
  if (!t || /^https?:/i.test(t)) return null;
  const r2 = (x) => Math.round(x * 100) / 100;
  let kwhR = [], kwhN = [], hora = 0, fijo = 0, plaza = 0;
  const pon = (v, etiqueta) => {
    if (!(v >= 0.05 && v <= 1.5)) return;
    const dc = /hpc|dc|rapide|ccs|combo|chademo/i.test(etiqueta || ''), ac = /\bac\b|normale|lente|t2|type ?2/i.test(etiqueta || '');
    (dc || (!ac && rapido) ? kwhR : kwhN).push(v);
  };
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      pon(+j.energyPrice); fijo = +j.fixedPrice || 0; if (+j.timePrice) hora = +j.timePrice * 60;
    } catch { return null; }
  } else {
    const l = t.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
    const ht = /\bht\b/.test(l) && !/\bttc\b/.test(l) ? 1.2 : 1; // sin IVA → con el 20 % francés
    // Cada trozo separado por «;», «|», « - » o salto de línea puede llevar su etiqueta (AC, HPC…)
    for (const trozo of l.split(/[;|\n]| - /)) {
      for (const m of trozo.matchAll(/(\d+(?:\.\d+)?)\s*(?:€|e|eur|euros?)\s*(?:ttc|ht)?\s*(?:\/|par|le|de)?\s*kwh/g)) pon(+m[1] * ht, trozo.slice(0, m.index));
      for (const m of trozo.matchAll(/(\d+(?:\.\d+)?)\s*(?:cts?|centimes?|c€|cents?)\s*(?:ttc|ht)?\s*(?:\/|par|le|de)?\s*kwh/g)) pon(+m[1] / 100 * ht, trozo.slice(0, m.index));
      for (const m of trozo.matchAll(/(\d+(?:\.\d+)?)\s*(?:€|e|eur|euros?)\s*(?:ttc|ht)?\s*(?:\/|par|la|le)\s*(?:min|minute)/g)) {
        if (/occup|stationn|parking|apr[eè]s/.test(trozo)) plaza = Math.max(plaza, +m[1] * 60 * ht); else hora = Math.max(hora, +m[1] * 60 * ht);
      }
      for (const m of trozo.matchAll(/(\d+(?:\.\d+)?)\s*(?:€|e|eur|euros?)\s*(?:ttc|ht)?\s*(?:\/|par)\s*(?:h|heure)\b/g)) {
        if (/occup|stationn|parking|branch|apr[eè]s/.test(trozo)) plaza = Math.max(plaza, +m[1] * ht);
      }
      const f = trozo.match(/(\d+(?:\.\d+)?)\s*€\s*(?:ttc|ht)?\s*\+/); // «9€ + 0,49€/kWh»: 9 € por sesión
      if (f && +f[1] <= 15) fijo = Math.max(fijo, +f[1] * ht);
    }
  }
  if (!kwhR.length && !kwhN.length && !hora) return null;
  return [kwhR.length ? r2(Math.min(...kwhR)) : null, kwhR.length ? r2(Math.max(...kwhR)) : null,
    kwhN.length ? r2(Math.min(...kwhN)) : null, kwhN.length ? r2(Math.max(...kwhN)) : null, r2(hora), r2(fijo), r2(plaza), 0];
}

// «tarification» es texto libre; algunos lo ponen en JSON ({"energyPrice":0.51,…}).
function tarifaFr(t) {
  t = (t || '').replace(/\s+/g, ' ').trim();
  if (!t || /^[\d.,\s]*$/.test(t)) return ''; // «0», «1»…: no dice nada
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const partes = [];
      if (j.energyPrice != null) partes.push(`${String(j.energyPrice).replace('.', ',')} €/kWh`);
      if (+j.fixedPrice) partes.push(`${String(j.fixedPrice).replace('.', ',')} € por carga`);
      if (+j.timePrice) partes.push(`${String(j.timePrice).replace('.', ',')} €/min`);
      return partes.join(' + ');
    } catch { return ''; }
  }
  // Solo si dice algo útil: una cifra con su unidad, o el enlace a sus tarifas.
  if (/^https?:\/\/\S+$/.test(t)) return t;
  if (!/\d/.test(t) || !/€|eur|cts?\b|cent|kwh|\/\s?min|\/\s?h\b/i.test(t)) return '';
  return recortar(t);
}

function leerFrancia(txt) {
  const filas = leerCsv(txt);
  const cab = filas.next().value;
  const col = Object.fromEntries(cab.map((n, i) => [n.trim(), i]));
  const v = (f, n) => (f[col[n]] || '').trim();
  const estaciones = new Map();
  for (const f of filas) {
    const la = +v(f, 'consolidated_latitude'), lo = +v(f, 'consolidated_longitude');
    if (!la || !lo || la < 41 || la > 51.6 || lo < -5.6 || lo > 10) continue; // solo la Francia europea (y Córcega)
    const id = v(f, 'id_station_itinerance') || `${la.toFixed(4)},${lo.toFixed(4)}`;
    let e = estaciones.get(id);
    if (!e) {
      e = { lat: la, lon: lo, nombre: v(f, 'nom_station').replace(/[\s/_-]*[0-9a-f]{8}-[0-9a-f-]{20,}/i, '').trim(), operador: v(f, 'nom_enseigne') || v(f, 'nom_operateur') || v(f, 'nom_amenageur'),
        dir: [v(f, 'adresse_station').replace(/,?\s*\b\d{5}\b.*$/, '').replace(/(\s*,)+\s*$/, '').replace(/\s*,\s*,/g, ','), v(f, 'consolidated_commune')].filter(Boolean).join(', '),
        horario: '', pago: 0, enchufes: {}, puntos: 0, servicios: new Set(), fuente: 'f', tarifa: '' };
      estaciones.set(id, e);
    }
    e.puntos++;
    let kw = +v(f, 'puissance_nominale').replace(',', '.') || 0;
    if (kw >= 1000) kw /= 1000; // alguno lo pone en W
    kw = Math.round(kw);
    for (const [c, letra] of [['prise_type_combo_ccs', 'C'], ['prise_type_2', 'T'], ['prise_type_chademo', 'H'], ['prise_type_ef', 'S']]) {
      if (!si(v(f, c))) continue;
      // Un CCS o CHAdeMO siempre es de continua; un Tipo 2 o un enchufe normal no pasa de 43 kW
      const k = 'CH'.includes(letra) ? kw : Math.min(kw, letra === 'S' ? 3 : 43);
      const x = (e.enchufes[letra] ||= { n: 0, kw: 0 }); x.n++; x.kw = Math.max(x.kw, k);
    }
    if (si(v(f, 'paiement_cb'))) e.pago |= TARJETA;
    if (si(v(f, 'paiement_acte'))) e.pago |= SIN_REGISTRO;
    if (si(v(f, 'gratuit'))) e.pago |= GRATIS;
    if (si(v(f, 'reservation'))) e.pago |= RESERVABLE;
    if (/r.serv/i.test(v(f, 'condition_acces'))) e.pago |= CLIENTES;
    const h = v(f, 'horaires');
    if (!e.horario && h) e.horario = /^24\/7$/.test(h) ? '24h' : recortar(h, 60);
    if (!e.tarifa) { e.tarifa = tarifaFr(v(f, 'tarification')); if (e.tarifa) e.tarifaCruda = v(f, 'tarification'); }
  }
  // Varias estaciones del mismo operador en el mismo sitio (< 40 m) → un solo sitio
  const rejilla = new Map(), sitios = [];
  for (const s of estaciones.values()) {
    const igual = vecinos(rejilla, s, 40).find((o) => o.operador === s.operador);
    if (igual) {
      sumarEnchufes(igual.enchufes, s.enchufes); igual.puntos += s.puntos; igual.pago |= s.pago;
      if (!igual.tarifa) { igual.tarifa = s.tarifa; igual.tarifaCruda = s.tarifaCruda; }
      continue;
    }
    sitios.push(s);
    const k = clave(s.lat, s.lon); (rejilla.get(k) || rejilla.set(k, []).get(k)).push(s);
  }
  // El precio en número (para colores del mapa, «más baratos» y el coste del viaje).
  for (const s of sitios) {
    const rapido = Object.entries(s.enchufes).some(([t, e]) => 'CH'.includes(t) && e.kw >= 50);
    s.precio = precioFr(s.tarifaCruda, rapido);
    delete s.tarifaCruda;
  }
  return sitios;
}

// Lo publicado ayer de una fuente (para cuando hoy no responde).
async function publicadoAyer(fuente) {
  try {
    const indice = await (await fetch(PUBLICADO + 'indice.json')).json();
    const filas = [];
    for (const t of Object.keys(indice.teselas)) {
      const d = await (await fetch(`${PUBLICADO}${t}.json`)).json();
      filas.push(...d.d.filter((f) => f[10] === fuente));
    }
    console.warn(`Se reutilizan ${filas.length} de ayer (fuente ${fuente})`);
    return filas;
  } catch { return []; }
}

// Plan B del workflow: si hoy no sale nada, se vuelve a publicar tal cual lo de ayer.
if (process.argv[2] === '--copiar-publicado') {
  await mkdir(DIR, { recursive: true });
  const indice = await (await fetch(PUBLICADO + 'indice.json')).json();
  for (const t of Object.keys(indice.teselas)) await writeFile(new URL(`${t}.json`, DIR), await (await fetch(`${PUBLICADO}${t}.json`)).text());
  await writeFile(new URL('indice.json', DIR), JSON.stringify(indice));
  console.log(`Copiado lo publicado (${Object.keys(indice.teselas).length} teselas del ${indice.fecha})`);
  process.exit(0);
}

const filas = [], cuantos = {};
try {
  const local = process.argv[2];
  const txt = local ? await readFile(local, 'utf8') : await (await fetch(URL_FR)).text();
  const fr = leerFrancia(txt);
  if (fr.length < 10000) throw new Error(`Francia trae muy pocos (${fr.length})`);
  filas.push(...fr.map(aFila)); cuantos.francia = fr.length;
} catch (e) {
  console.warn('Francia:', e.message);
  const ayer = await publicadoAyer('f'); filas.push(...ayer); cuantos.francia = ayer.length;
}
try {
  const osm = leerOsm(await descargarOsm('PT', 'AD'));
  if (osm.length < 1000) throw new Error(`OpenStreetMap trae muy pocos (${osm.length})`);
  filas.push(...osm.map(aFila)); cuantos.portugalAndorra = osm.length;
} catch (e) {
  console.warn('Portugal y Andorra:', e.message);
  const ayer = await publicadoAyer('o'); filas.push(...ayer); cuantos.portugalAndorra = ayer.length;
}
if (filas.length < 5000) throw new Error(`Muy pocos cargadores de fuera (${filas.length}); no se toca lo publicado`);

const teselas = new Map();
for (const f of filas) { const t = teselaDe(f[0], f[1]); (teselas.get(t) || teselas.set(t, []).get(t)).push(f); }
await rm(DIR, { recursive: true, force: true });
await mkdir(DIR, { recursive: true });
for (const [t, d] of teselas) await writeFile(new URL(`${t}.json`, DIR), JSON.stringify({ d }));
const fecha = new Date().toISOString().slice(0, 10);
await writeFile(new URL('indice.json', DIR), JSON.stringify({ fecha, tamTesela: TESELA, cuantos, teselas: Object.fromEntries([...teselas].map(([t, d]) => [t, d.length])) }));
console.log(`Fuera de España: ${filas.length} sitios en ${teselas.size} teselas`, cuantos);
