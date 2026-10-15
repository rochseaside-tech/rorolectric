// Junta TODOS los puntos de recarga de España en un solo archivo para la app:
//  1) Registro oficial del Ministerio (MITERD, publicado por la DGT): obligatorio para todo
//     punto de recarga público, de cualquier empresa.
//  2) OpenStreetMap: añade los que no están en el registro (súpers, hoteles, Tesla…) y
//     datos como «gratis» o «pago con tarjeta».
//  3) REVE (Red Eléctrica): PRECIO oficial de cada sitio y su ficha en mapareve.es. Lo va bajando
//     scripts/reve.mjs cada hora en REVE_DIR; aquí solo se junta.
// Se quitan duplicados (mismo sitio a menos de ~70 m). Uso: node scripts/cargadores.mjs [xml-local]
// Lo ejecuta cada noche .github/workflows/publicar.yml.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL_OFICIAL = 'https://infocar.dgt.es/datex2/v3/miterd/EnergyInfrastructureTablePublication/electrolineras.xml';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const SALIDA = new URL('../datos/cargadores.json', import.meta.url);

// Enchufes: letra corta en el archivo.
const TIPO_OFICIAL = {
  iec62196T2COMBO: 'C', iec62196T2: 'T', chademo: 'H', domesticF: 'S', domesticE: 'S',
  iec62196T1: 'J', iec62196T1COMBO: 'J', iec60309x2single16: 'I', iec60309x2three32: 'I',
};
const TIPO_OSM = { type2_combo: 'C', type2: 'T', type2_cable: 'T', chademo: 'H', schuko: 'S', tesla_supercharger: 'X', type1: 'J', type1_combo: 'J', cee_blue: 'I', cee_red_32a: 'I' };
// Bits de «cómo se paga»
const TARJETA = 1, APP = 2, RFID = 4, GRATIS = 8, SIN_REGISTRO = 16, CLIENTES = 32;

const txt = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const uno = (bloque, re) => { const m = bloque.match(re); return m ? txt(m[1]) : ''; };

function horario(label) {
  if (!label) return '';
  const dias = [...label.matchAll(/(\w+) \((\d\d:\d\d) - (\d\d:\d\d)\)/g)];
  if (dias.length === 7 && dias.every((d) => d[2] === '00:00' && d[3] >= '23:59')) return '24h';
  if (!dias.length) return '';
  const orden = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
  const corto = { Lunes: 'L', Martes: 'M', Miercoles: 'X', Jueves: 'J', Viernes: 'V', Sabado: 'S', Domingo: 'D' };
  dias.sort((a, b) => orden.indexOf(a[1]) - orden.indexOf(b[1]));
  // Agrupa días seguidos con el mismo horario: «L-V 09:00-21:30 · S 10:00-14:00»
  const grupos = [];
  for (const [, dia, ini, fin] of dias) {
    const h = ini === '00:00' && fin >= '23:59' ? '24 h' : `${ini}-${fin}`;
    const g = grupos.at(-1);
    if (g && g.h === h && orden.indexOf(dia) === orden.indexOf(g.fin) + 1) g.fin = dia;
    else grupos.push({ ini: dia, fin: dia, h });
  }
  return grupos.map((g) => `${corto[g.ini]}${g.fin !== g.ini ? '-' + corto[g.fin] : ''} ${g.h}`).join(' · ');
}

function leerOficial(xml) {
  const sitios = [];
  for (const m of xml.matchAll(/<egi:energyInfrastructureSite\b[\s\S]*?<\/egi:energyInfrastructureSite>/g)) {
    const b = m[0];
    const lat = +uno(b, /<loc:latitude>([^<]+)/), lon = +uno(b, /<loc:longitude>([^<]+)/);
    if (!lat || !lon || Math.abs(lat) > 90) continue;
    const nombre = uno(b, /<fac:name>\s*<com:values>\s*<com:value[^>]*>([^<]*)/);
    if (/\bpruebas?\b|^test\b/i.test(nombre)) continue; // puntos de prueba de las empresas
    const operador = uno(b, /<fac:operator\b[\s\S]*?<com:value [^>]*>([^<]*)/);
    const dir = uno(b, /Dirección: ([^<]*)/), muni = uno(b, /Municipio: ([^<]*)/);
    let pago = 0;
    for (const a of b.matchAll(/<egi:authenticationAndIdentificationMethods>([^<]+)/g)) {
      if (/creditCard|debitCard|nfc|pinpad/.test(a[1])) pago |= TARJETA;
      if (a[1] === 'apps') pago |= APP;
      if (a[1] === 'rfid') pago |= RFID;
    }
    const enchufes = {};
    for (const c of b.matchAll(/<egi:connector>([\s\S]*?)<\/egi:connector>/g)) {
      const t = TIPO_OFICIAL[uno(c[1], /<egi:connectorType>([^<]+)/)];
      if (!t) continue;
      const kw = Math.round((+uno(c[1], /<egi:maxPowerAtSocket>([^<]+)/) || 0) / 1000);
      const e = (enchufes[t] ||= { n: 0, kw: 0 });
      e.n++; e.kw = Math.max(e.kw, kw < 1000 ? kw : 0); // hay algún valor en W mal puesto
    }
    const puntos = (b.match(/<egi:refillPoint\b/g) || []).length;
    // Qué hay en el sitio: r = restaurante o cafetería, s = tienda o súper, g = gasolinera, h = hotel, p = parking cubierto
    const servicios = new Set();
    for (const f of b.matchAll(/<fac:serviceFacilityType>([^<]+)/g)) {
      const t = { restaurant: 'r', cafe: 'r', foodShopping: 's', shop: 's', petrolStation: 'g', hotel: 'h' }[f[1]];
      if (t) servicios.add(t);
    }
    if (uno(b, /<egi:typeOfSite>([^<]+)/) === 'inBuilding') servicios.add('p');
    sitios.push({ lat, lon, nombre, operador, dir: [dir, muni].filter(Boolean).join(', '), horario: horario(uno(b, /<fac:label>([^<]*)/)), pago, enchufes, puntos, servicios, fuente: 'm' });
  }
  return sitios;
}

function kwOsm(v) {
  if (!v) return 0;
  return Math.max(0, ...String(v).split(/[;,]/).map((x) => {
    const m = x.trim().match(/([\d.]+)\s*(kw|w|kva)?/i);
    if (!m) return 0;
    return /^w$/i.test(m[2] || '') ? +m[1] / 1000 : +m[1];
  }));
}

function leerOsm(els) {
  const sitios = [];
  for (const el of els) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || ['private', 'no'].includes(t.access) || t['disused:amenity'] || t.disused === 'yes') continue;
    const enchufes = {};
    for (const [k, letra] of Object.entries(TIPO_OSM)) {
      const v = t[`socket:${k}`];
      if (!v || v === 'no') continue;
      const e = (enchufes[letra] ||= { n: 0, kw: 0 });
      e.n += parseInt(v, 10) || 1;
      e.kw = Math.max(e.kw, Math.round(kwOsm(t[`socket:${k}:output`])));
    }
    let pago = 0;
    if (['payment:credit_cards', 'payment:debit_cards', 'payment:contactless', 'payment:cards'].some((k) => t[k] === 'yes')) pago |= TARJETA;
    if (t['payment:app'] === 'yes' || t['authentication:app'] === 'yes') pago |= APP;
    if (t['authentication:membership_card'] === 'yes' || t['authentication:nfc'] === 'yes') pago |= RFID;
    if (t.fee === 'no') pago |= GRATIS;
    if (t['authentication:none'] === 'yes') pago |= SIN_REGISTRO;
    if (t.access === 'customers') pago |= CLIENTES;
    sitios.push({
      lat, lon, nombre: t.name || t.brand || t.operator || '', operador: t.operator || t.brand || t.network || '',
      dir: [t['addr:street'] && `${t['addr:street']} ${t['addr:housenumber'] || ''}`.trim(), t['addr:city']].filter(Boolean).join(', '),
      horario: t.opening_hours === '24/7' ? '24h' : (t.opening_hours || ''), pago, enchufes,
      puntos: parseInt(t.capacity, 10) || 0, kwSitio: Math.round(kwOsm(t['charging_station:output'])), fuente: 'o',
      servicios: new Set(t.covered === 'yes' || t.location === 'underground' || t.parking === 'underground' ? ['p'] : []),
    });
  }
  return sitios;
}

// Rejilla de ~100 m para buscar vecinos rápido.
const CELDA = 0.001;
const clave = (la, lo) => `${Math.floor(la / CELDA)},${Math.floor(lo / CELDA)}`;
function metros(a, b) {
  const dy = (a.lat - b.lat) * 111320, dx = (a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot(dx, dy);
}
function vecinos(rejilla, s, radio) {
  const out = [];
  const [cy, cx] = [Math.floor(s.lat / CELDA), Math.floor(s.lon / CELDA)];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    for (const o of rejilla.get(`${cy + dy},${cx + dx}`) || []) if (metros(s, o) <= radio) out.push(o);
  }
  return out;
}

function sumarEnchufes(a, b) {
  for (const [t, e] of Object.entries(b)) {
    const x = (a[t] ||= { n: 0, kw: 0 });
    x.n += e.n; x.kw = Math.max(x.kw, e.kw);
  }
}

function juntar(oficiales, osm) {
  // 1) El registro apunta a veces cada poste por separado en el mismo sitio: se agrupan (mismo operador, < 40 m).
  const rejilla = new Map(), sitios = [];
  for (const s of oficiales) {
    const igual = vecinos(rejilla, s, 40).find((o) => o.operador === s.operador);
    if (igual) {
      sumarEnchufes(igual.enchufes, s.enchufes); igual.puntos += s.puntos; igual.pago |= s.pago;
      for (const x of s.servicios) igual.servicios.add(x);
      if (s.nombre.length < igual.nombre.length) igual.nombre = s.nombre;
      continue;
    }
    sitios.push(s);
    const k = clave(s.lat, s.lon); (rejilla.get(k) || rejilla.set(k, []).get(k)).push(s);
  }
  // 2) OSM: si ya está en el registro (< 70 m), solo completa datos; si no, se añade.
  let nuevos = 0, completados = 0;
  for (const o of osm) {
    const cerca = vecinos(rejilla, o, 70);
    if (cerca.length) {
      const m = cerca.sort((a, b) => metros(o, a) - metros(o, b))[0];
      m.pago |= o.pago & (GRATIS | SIN_REGISTRO | CLIENTES | TARJETA);
      if (!Object.keys(m.enchufes).length) m.enchufes = o.enchufes;
      if (!m.horario && o.horario) m.horario = o.horario;
      for (const x of o.servicios) m.servicios.add(x);
      m.fuente = 'mo'; completados++;
      continue;
    }
    sitios.push(o); nuevos++;
    const k = clave(o.lat, o.lon); (rejilla.get(k) || rejilla.set(k, []).get(k)).push(o);
  }
  return { sitios, nuevos, completados, rejilla };
}

// Precios de los enchufes de un sitio de REVE → [rápida €/kWh mín, máx, normal mín, máx, €/hora, € fijos, €/hora de plaza, desde el minuto]
function precioSitio(r, precios) {
  let rMin = Infinity, rMax = 0, nMin = Infinity, nMax = 0, hora = 0, fijo = 0, plaza = 0, desde = Infinity, alguno = false;
  for (const [id, , kw, dc] of r.enchufes) {
    const p = precios[id]; if (!p) continue;
    alguno = true;
    const [min, max, h, f, pl, de] = p;
    if (min != null) {
      if (dc || kw >= 50) { rMin = Math.min(rMin, min); rMax = Math.max(rMax, max); } else { nMin = Math.min(nMin, min); nMax = Math.max(nMax, max); }
    }
    hora = Math.max(hora, h); fijo = Math.max(fijo, f);
    if (pl > 0) { plaza = Math.max(plaza, pl); desde = Math.min(desde, de); }
  }
  if (!alguno) return null;
  const r2 = (x) => Math.round(x * 100) / 100;
  const hayR = rMin !== Infinity, hayN = nMin !== Infinity;
  return [hayR ? r2(rMin) : null, hayR ? r2(rMax) : null, hayN ? r2(nMin) : null, hayN ? r2(nMax) : null, r2(hora), r2(fijo), r2(plaza), plaza ? desde : 0];
}
const menor = (x, y) => (x == null ? y : y == null ? x : Math.min(x, y));
const mayor = (x, y) => (x == null ? y : y == null ? x : Math.max(x, y));
const mezclarPrecio = (a, b) => (!a ? b : !b ? a : [menor(a[0], b[0]), mayor(a[1], b[1]), menor(a[2], b[2]), mayor(a[3], b[3]),
  Math.max(a[4], b[4]), Math.max(a[5], b[5]), Math.max(a[6], b[6]), a[6] && b[6] ? Math.min(a[7], b[7]) : a[6] ? a[7] : b[7]]);

// REVE: si el sitio ya está (misma empresa a < 100 m, o cualquiera a < 40 m), se le pone el precio; si no, se añade.
async function juntarReve(sitios, rejilla) {
  const dir = process.env.REVE_DIR;
  if (!dir) return null;
  let r, precios, estado;
  try {
    r = JSON.parse(await readFile(join(dir, 'sitios.json'), 'utf8'));
    precios = JSON.parse(await readFile(join(dir, 'precios.json'), 'utf8'));
    estado = JSON.parse(await readFile(join(dir, 'estado.json'), 'utf8'));
  } catch { console.warn('Sin datos de REVE todavía'); return null; }
  let conPrecio = 0, nuevos = 0, juntados = 0;
  for (const [id, x] of Object.entries(r)) {
    if (/pruebas?|^test/i.test(x.nombre)) continue;
    const s = { lat: x.la, lon: x.lo };
    const precio = precioSitio(x, precios);
    const marcas = new Set([x.marca, x.empresa].filter(Boolean).map((n) => marcaDe(n).toLowerCase()));
    const misma = (o) => marcas.has(marcaDe(o.operador).toLowerCase()) || [...marcas].some((m) => m.length > 3 && marcaDe(o.operador).toLowerCase().startsWith(m));
    const cerca = vecinos(rejilla, s, 100).sort((a, b) => metros(s, a) - metros(s, b));
    const m = cerca.find(misma) || cerca.find((o) => !o.reve && metros(s, o) <= 40);
    if (m) {
      m.reve ||= id; m.precio = mezclarPrecio(m.precio, precio);
      if (x.tarjeta) m.pago |= TARJETA;
      if (!m.horario && x.h24) m.horario = '24h';
      if (!m.fuente.includes('r')) m.fuente += 'r';
      juntados++;
    } else {
      const enchufes = {};
      for (const [, t, kw] of x.enchufes) {
        if (!t) continue;
        const e = (enchufes[t] ||= { n: 0, kw: 0 }); e.n++; e.kw = Math.max(e.kw, kw < 1000 ? kw : 0);
      }
      const n = { lat: x.la, lon: x.lo, nombre: x.nombre || x.marca || x.empresa, operador: x.marca || x.empresa, dir: x.dir, horario: x.h24 ? '24h' : '', pago: x.tarjeta ? TARJETA : 0,
        enchufes, puntos: 0, servicios: new Set(), fuente: 'r', reve: id, precio };
      sitios.push(n); nuevos++;
      const k = clave(n.lat, n.lon); (rejilla.get(k) || rejilla.set(k, []).get(k)).push(n);
    }
  }
  for (const s of sitios) if (s.precio) conPrecio++;
  console.log(`REVE: ${Object.keys(r).length} sitios (${juntados} ya estaban, ${nuevos} nuevos) · ${conPrecio} con precio`);
  return { fecha: (estado.actualizado || '').slice(0, 10), sitios: Object.keys(r).length, conPrecio, tarifasCompletas: !!estado.tar?.hecha };
}

async function descargarOsm() {
  const q = '[out:json][timeout:300];area["ISO3166-1"="ES"][admin_level=2]->.es;nwr["amenity"="charging_station"](area.es);out center tags;';
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'mi-deepal (app personal)' } });
      if (r.ok) return (await r.json()).elements;
      console.warn('Overpass', url, r.status);
    } catch (e) { console.warn('Overpass', url, e.message); }
  }
  throw new Error('OpenStreetMap no responde');
}

const local = process.argv[2];
const xml = local ? await readFile(local, 'utf8') : await (await fetch(URL_OFICIAL)).text();
const oficiales = leerOficial(xml);
if (oficiales.length < 5000) throw new Error(`El registro oficial trae muy pocos (${oficiales.length}); no se sobrescribe nada`);
const osm = leerOsm(await descargarOsm());
const { sitios, nuevos, completados, rejilla } = juntar(oficiales, osm);

// Formato compacto: [lat, lon, nombre, operador, kWmax, enchufes, pago, horario, dirección, puntos, fuente, servicios, id REVE, precio REVE]
// enchufes: «C2:150,T4:22» = 2 CCS de hasta 150 kW y 4 Tipo 2 de 22 kW.
// Nombres legales → marca que se reconoce («REPSOL SOLUCIONES ENERGÉTICAS SA» → «Repsol»).
const MARCAS = [
  [/repsol/i, 'Repsol'], [/iberdrola/i, 'Iberdrola'], [/endesa/i, 'Endesa X Way'], [/tesla/i, 'Tesla'],
  [/ionity/i, 'Ionity'], [/zunder|easycharger/i, 'Zunder'], [/wenea/i, 'Wenea'], [/totalenergies/i, 'TotalEnergies'],
  [/\bedp\b/i, 'EDP'], [/galp/i, 'Galp'], [/acciona/i, 'Acciona'], [/eranovum/i, 'Eranovum'], [/etecnic/i, 'Etecnic'],
  [/allego/i, 'Allego'], [/electra\b/i, 'Electra'], [/atlante/i, 'Atlante'], [/fastned/i, 'Fastned'], [/powerdot/i, 'Powerdot'],
  [/barcelona de serveis municipals|\bbsm\b/i, 'Endolla Barcelona (BSM)'], [/charging together/i, 'Charging Together'],
  [/fenie/i, 'Fenie Energía'], [/cepsa|moeve/i, 'Moeve (Cepsa)'], [/plenitude|\beni\b/i, 'Plenitude'], [/shell/i, 'Shell Recharge'],
  [/\bbp\b|aral pulse/i, 'bp pulse'], [/lidl/i, 'Lidl'], [/mercadona/i, 'Mercadona'], [/ikea/i, 'IKEA'], [/electromaps/i, 'Electromaps'],
];
const SUFIJO = /[,\s]+(s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?\s?u?\.?|s\.?\s?c\.?\s?c\.?\s?l\.?|s\.?\s?l\.?\s?l\.?)\s*$/i;
function bonito(n) {
  if (!n) return '';
  let t = n.trim().replace(SUFIJO, '').replace(SUFIJO, '').trim();
  if (t === t.toUpperCase() && /[A-Z]{4}/.test(t)) t = t.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return t;
}
const marcaDe = (n) => (MARCAS.find(([re]) => re.test(n || '')) || [])[1] || bonito(n);
const reve = await juntarReve(sitios, rejilla);

// Nombres que son códigos internos («B-Sabadell-002», «62047040710009»): mejor la empresa.
const pareceCodigo = (n) => !n || (/\d/.test(n) && !/\s/.test(n)) || /^[A-Z]{1,3}-[\w-]+-\d+$/.test(n);
const filas = sitios.map((s) => {
  s.operador = marcaDe(s.operador);
  if (pareceCodigo(s.nombre)) s.nombre = s.operador || 'Punto de recarga';
  else s.nombre = bonito(s.nombre.replace(/^repsol es, /i, 'Repsol · '));
  if (s.nombre.toLowerCase().includes(s.operador.toLowerCase())) s.operador = '';
  const kw = Math.max(s.kwSitio || 0, ...Object.values(s.enchufes).map((e) => e.kw), 0);
  const enchufes = Object.entries(s.enchufes).map(([t, e]) => `${t}${e.n}${e.kw ? ':' + e.kw : ''}`).join(',');
  const fila = [+s.lat.toFixed(5), +s.lon.toFixed(5), s.nombre, s.operador === s.nombre ? '' : s.operador, kw, enchufes, s.pago, s.horario, s.dir, s.puntos, s.fuente, [...s.servicios].sort().join('')];
  if (s.reve) fila.push(s.reve, s.precio || 0);
  return fila;
});
const fecha = (xml.match(/<com:publicationTime>([^<]+)/) || [])[1]?.slice(0, 10) || new Date().toISOString().slice(0, 10);
await writeFile(SALIDA, JSON.stringify({ fecha, total: filas.length, ...(reve ? { reve } : {}), d: filas }));
console.log(`Oficiales: ${oficiales.length} · OSM: ${osm.length} (${completados} ya estaban, ${nuevos} nuevos) · Total sitios: ${filas.length}`);
