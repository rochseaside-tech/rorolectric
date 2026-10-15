// Piezas comunes de los robots de cargadores (España: cargadores.mjs; países vecinos: fuera.mjs).
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

export const TIPO_OSM = { type2_combo: 'C', type2: 'T', type2_cable: 'T', chademo: 'H', schuko: 'S', tesla_supercharger: 'X', type1: 'J', type1_combo: 'J', cee_blue: 'I', cee_red_32a: 'I' };
// Bits de «cómo se paga»
export const TARJETA = 1, APP = 2, RFID = 4, GRATIS = 8, SIN_REGISTRO = 16, CLIENTES = 32;
export const RESERVABLE = 64; // solo lo publica Francia

export function kwOsm(v) {
  if (!v) return 0;
  return Math.max(0, ...String(v).split(/[;,]/).map((x) => {
    const m = x.trim().match(/([\d.]+)\s*(kw|w|kva)?/i);
    if (!m) return 0;
    return /^w$/i.test(m[2] || '') ? +m[1] / 1000 : +m[1];
  }));
}

export function leerOsm(els) {
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
export const CELDA = 0.001;
export const clave = (la, lo) => `${Math.floor(la / CELDA)},${Math.floor(lo / CELDA)}`;
export function metros(a, b) {
  const dy = (a.lat - b.lat) * 111320, dx = (a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot(dx, dy);
}
export function vecinos(rejilla, s, radio) {
  const out = [];
  const [cy, cx] = [Math.floor(s.lat / CELDA), Math.floor(s.lon / CELDA)];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    for (const o of rejilla.get(`${cy + dy},${cx + dx}`) || []) if (metros(s, o) <= radio) out.push(o);
  }
  return out;
}

export function sumarEnchufes(a, b) {
  for (const [t, e] of Object.entries(b)) {
    const x = (a[t] ||= { n: 0, kw: 0 });
    x.n += e.n; x.kw = Math.max(x.kw, e.kw);
  }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
export async function descargarOsm(...paises) {
  const areas = paises.map((p) => `area["ISO3166-1"="${p}"][admin_level=2];`).join('');
  const q = `[out:json][timeout:300];(${areas})->.a;nwr["amenity"="charging_station"](area.a);out center tags;`;
  for (const url of [...OVERPASS, ...OVERPASS]) { // dos vueltas: a ratos están saturados
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'mi-deepal (app personal)' } });
      if (r.ok) return (await r.json()).elements;
      console.warn('Overpass', url, r.status);
    } catch (e) { console.warn('Overpass', url, e.message); }
    await espera(20000);
  }
  throw new Error('OpenStreetMap no responde');
}

// Nombres legales → marca que se reconoce («REPSOL SOLUCIONES ENERGÉTICAS SA» → «Repsol»).
const MARCAS = [
  // Francia y Portugal
  [/izivia/i, 'Izivia'], [/freshmile/i, 'Freshmile'], [/vianeo/i, 'Engie Vianeo'], [/leclerc/i, 'E.Leclerc'], [/belib/i, 'Belib (París)'],
  [/\bprio\b/i, 'PRIO'], [/zeplug/i, 'Zeplug'], [/chargepoint/i, 'ChargePoint'], [/e-?totem/i, 'E-Totem'], [/power ?dot/i, 'Powerdot'],
  [/repsol/i, 'Repsol'], [/iberdrola/i, 'Iberdrola'], [/endesa/i, 'Endesa X Way'], [/tesla/i, 'Tesla'],
  [/ionity/i, 'Ionity'], [/zunder|easycharger/i, 'Zunder'], [/wenea/i, 'Wenea'], [/totalenergies/i, 'TotalEnergies'],
  [/\bedp\b/i, 'EDP'], [/galp/i, 'Galp'], [/acciona/i, 'Acciona'], [/eranovum/i, 'Eranovum'], [/etecnic/i, 'Etecnic'],
  [/allego/i, 'Allego'], [/electra\b/i, 'Electra'], [/atlante/i, 'Atlante'], [/fastned/i, 'Fastned'], [/powerdot/i, 'Powerdot'],
  [/barcelona de serveis municipals|\bbsm\b/i, 'Endolla Barcelona (BSM)'], [/charging together/i, 'Charging Together'],
  [/fenie/i, 'Fenie Energía'], [/cepsa|moeve/i, 'Moeve (Cepsa)'], [/plenitude|\beni\b/i, 'Plenitude'], [/shell/i, 'Shell Recharge'],
  [/\bbp\b|aral pulse/i, 'bp pulse'], [/lidl/i, 'Lidl'], [/mercadona/i, 'Mercadona'], [/ikea/i, 'IKEA'], [/electromaps/i, 'Electromaps'],
];
const SUFIJO = /[,\s]+(s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?\s?u?\.?|s\.?\s?c\.?\s?c\.?\s?l\.?|s\.?\s?l\.?\s?l\.?)\s*$/i;
export function bonito(n) {
  if (!n) return '';
  let t = n.trim().replace(SUFIJO, '').replace(SUFIJO, '').trim();
  if (t === t.toUpperCase() && /[A-Z]{4}/.test(t)) t = t.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return t;
}
export const marcaDe = (n) => (MARCAS.find(([re]) => re.test(n || '')) || [])[1] || bonito(n);

// Nombres que son códigos internos («B-Sabadell-002», «62047040710009»): mejor la empresa.
export const pareceCodigo = (n) => !n || (/\d/.test(n) && !/\s/.test(n)) || /^[A-Z]{1,3}-[\w-]+-\d+$/.test(n);

// Fila compacta: [lat, lon, nombre, operador, kWmax, enchufes, pago, horario, dirección, puntos, fuente, servicios, id REVE, precio REVE, tarifa en texto]
// enchufes: «C2:150,T4:22» = 2 CCS de hasta 150 kW y 4 Tipo 2 de 22 kW. Fuente: m = Ministerio, o = OpenStreetMap, r = REVE, f = registro de Francia.
// Horarios de OpenStreetMap («Mo-Fr 08:00-20:00») con los días en castellano.
const DIAS = { Mo: 'L', Tu: 'M', We: 'X', Th: 'J', Fr: 'V', Sa: 'S', Su: 'D', PH: 'festivos', off: 'cerrado' };
const horarioEs = (h) => (h && h !== '24h' ? h.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|off)\b/g, (d) => DIAS[d]).replace(/;\s*/g, ' · ') : h);

// «Pl. Del Dr. Robert, 08202 Sabadell,, Sabadell» → «Pl. Del Dr. Robert, 08202 Sabadell»
function limpiarDir(d) {
  const partes = String(d || '').split(',').map((x) => x.trim()).filter(Boolean);
  const ultima = partes.at(-1);
  if (partes.length > 1 && partes.slice(0, -1).some((x) => x.toLowerCase().includes(ultima.toLowerCase()))) partes.pop();
  return partes.join(', ');
}

export function aFila(s) {
  s.dir = limpiarDir(s.dir);
  s.operador = marcaDe(s.operador);
  if (pareceCodigo(s.nombre)) s.nombre = s.operador || 'Punto de recarga';
  else s.nombre = bonito(s.nombre.replace(/^repsol es, /i, 'Repsol · '));
  if (s.nombre.toLowerCase().includes(s.operador.toLowerCase())) s.operador = '';
  const kw = Math.max(s.kwSitio || 0, ...Object.values(s.enchufes).map((e) => e.kw), 0);
  const enchufes = Object.entries(s.enchufes).map(([t, e]) => `${t}${e.n}${e.kw ? ':' + e.kw : ''}`).join(',');
  const fila = [+s.lat.toFixed(5), +s.lon.toFixed(5), s.nombre, s.operador === s.nombre ? '' : s.operador, kw, enchufes, s.pago, horarioEs(s.horario), s.dir, s.puntos, s.fuente, [...s.servicios].sort().join('')];
  if (s.reve || s.tarifa) fila.push(s.reve || '', s.precio || 0);
  if (s.tarifa) fila.push(s.tarifa);
  return fila;
}
