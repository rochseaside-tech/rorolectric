// datos.js — fichas de los coches y lo que se guarda en el móvil.
import { consumoMedido } from './calc.js';
// Deepal S05: catálogo oficial Changan España (julio 2026).
// Tesla Model Y: bases de datos de coches eléctricos (EVKX, InsideEVs); batería útil y curvas, aproximadas.
// Todo lo marcado «estimado» es cálculo nuestro, no dato del fabricante.

const CURVA_DEEPAL = [[50, 185], [80, 110], [90, 55], [101, 25]];
const CURVA_TESLA_LFP = [[30, 165], [50, 130], [80, 80], [90, 40], [101, 20]];
const CURVA_TESLA_NMC = [[20, 245], [40, 185], [60, 125], [80, 75], [90, 40], [101, 20]];

const S05 = {
  marca: 'Deepal', corto: 'S05', app: 'MyChangan',
  bateria: 68.8, util: 67, quimica: 'LFP', wltpKm: 485, wltpConsumo: 15.9,
  acMax: 11, dcMax: 200, min30a80: 15, v2l: 6, bombaCalor: true,
  potencia: '200 kW', par: '290 Nm', aceleracion: 7.5,
  largo: 4598, ancho: 1900, alto: 1600, maletero: 492, frunk: 159, peso: 1940, remolque: 1600,
  llanta: '18"', traccion: 'Trasera',
  garantia: '7 años / 160.000 km', garantiaMotor: '8 años / 200.000 km',
  consumo: { ciudad: 14.5, mixto: 17.5, autovia110: 19, autovia120: 21 },
  curva: CURVA_DEEPAL, fuente: 'Catálogo oficial Changan España, julio 2026.',
  notas: [],
};
const MY = {
  marca: 'Tesla', corto: 'Model Y', app: 'Tesla', supercargador: true,
  acMax: 11, v2l: 0, bombaCalor: true, garantia: '4 años / 80.000 km',
  fuente: 'Bases de datos de coches eléctricos (EVKX, InsideEVs). Batería útil y tiempos de carga aproximados.',
  notas: ['El navegador del coche planifica las paradas en Supercargadores y calienta la batería antes de llegar: úsalo en viajes.'],
};
const MY_LFP = { ...MY, quimica: 'LFP', curva: CURVA_TESLA_LFP, garantiaBateria: '8 años / 160.000 km', consumo: { ciudad: 13.5, mixto: 15.5, autovia110: 17, autovia120: 19 } };
const MY_NMC = { ...MY, quimica: 'NMC', dcMax: 250, curva: CURVA_TESLA_NMC, garantiaBateria: '8 años / 192.000 km', consumo: { ciudad: 14.5, mixto: 16.5, autovia110: 18, autovia120: 20 } };
const MY_PERF = { ...MY_NMC, consumo: { ciudad: 15, mixto: 17.5, autovia110: 19, autovia120: 21.5 } };

export const MODELOS = {
  s05pro: { ...S05, nombre: 'Deepal S05 Pro', notas: ['La versión Pro no lleva asientos ni volante calefactados: pon el clima antes de salir.'] },
  s05max: { ...S05, nombre: 'Deepal S05 Max', llanta: '20"' },
  s05maxawd: { ...S05, nombre: 'Deepal S05 Max AWD', wltpKm: 445, wltpConsumo: 17.5, potencia: '200 + 120 kW', par: '290 + 212 Nm', aceleracion: 5.5,
    peso: 2040, frunk: 152, llanta: '20"', traccion: '4x4', consumo: { ciudad: 15.5, mixto: 18.8, autovia110: 20.5, autovia120: 22.5 } },
  my_rwd_22: { ...MY_LFP, nombre: 'Tesla Model Y RWD (2022-2024)', bateria: 60, util: 57.5, wltpKm: 455, dcMax: 170, traccion: 'Trasera' },
  my_lr_22: { ...MY_NMC, nombre: 'Tesla Model Y Gran Autonomía (2022-2024)', bateria: 78, util: 75, wltpKm: 533, traccion: 'Total' },
  my_perf_22: { ...MY_PERF, nombre: 'Tesla Model Y Performance (2022-2024)', bateria: 78, util: 75, wltpKm: 514, traccion: 'Total' },
  my_std_25: { ...MY_LFP, nombre: 'Tesla Model Y Standard (2025 o posterior)', bateria: 64, util: 60.5, wltpKm: 534, dcMax: 175, traccion: 'Trasera' },
  my_rwd_25: { ...MY_LFP, nombre: 'Tesla Model Y RWD (2025 o posterior)', bateria: 62.5, util: 60, wltpKm: 500, dcMax: 175, traccion: 'Trasera' },
  my_lrrwd_25: { ...MY_NMC, nombre: 'Tesla Model Y Gran Autonomía RWD (2025 o posterior)', bateria: 78.4, util: 75, wltpKm: 622, traccion: 'Trasera',
    consumo: { ciudad: 13.5, mixto: 15.5, autovia110: 17, autovia120: 19 } },
  my_lrawd_25: { ...MY_NMC, nombre: 'Tesla Model Y Gran Autonomía AWD (2025 o posterior)', bateria: 78.4, util: 75, wltpKm: 586, traccion: 'Total' },
  my_perf_25: { ...MY_PERF, nombre: 'Tesla Model Y Performance (2025 o posterior)', bateria: 82, util: 79, wltpKm: 580, traccion: 'Total' },
};
export const GRUPOS_MODELOS = [
  ['Changan Deepal S05', ['s05pro', 's05max', 's05maxawd']],
  ['Tesla Model Y', ['my_rwd_22', 'my_lr_22', 'my_perf_22', 'my_std_25', 'my_rwd_25', 'my_lrrwd_25', 'my_lrawd_25', 'my_perf_25']],
];

// El coche elegido. Es un objeto vivo: al cambiar de coche se rellena otra vez y todas las
// pantallas y cuentas lo ven al momento. Sin coche elegido, se calcula como un S05 Pro.
export const COCHE = {};
// Consumo real típico (kWh/100 km) a 15-25 °C. Estimado; la app usa el tuyo en cuanto lo apuntas en Ajustes.
export const CONSUMO_TIPICO = {};
// «Otro coche»: con 4 datos (batería, autonomía oficial, carga en casa y rápida) se estima el resto.
export function modeloManual(m = {}) {
  const util = +m.util || 60, wltp = +m.wltpKm || 450, dc = +m.dcMax || 120;
  const mixto = Math.round(util / (wltp * 0.8) * 1000) / 10; // en la vida real se hace ~80 % de la cifra oficial
  return {
    marca: m.marca || '', corto: m.nombre || 'tu coche', nombre: m.nombre || 'Mi coche eléctrico', app: m.app || 'la app oficial de tu marca',
    bateria: util, util, quimica: m.quimica || 'NMC', wltpKm: wltp, acMax: +m.acMax || 11, dcMax: dc, v2l: 0, manual: true,
    consumo: { ciudad: +(mixto * 0.83).toFixed(1), mixto, autovia110: +(mixto * 1.09).toFixed(1), autovia120: +(mixto * 1.2).toFixed(1) },
    curva: [[50, dc * 0.9], [80, dc * 0.55], [90, dc * 0.3], [101, dc * 0.12]],
    fuente: 'Datos que pusiste tú; el resto (consumo y curva de carga) es una estimación.', notas: [],
  };
}
// «correccion»: datos de fábrica que la persona ha cambiado (batería útil que ha perdido capacidad, etc.).
function ponerModelo(id, manual, correccion = {}) {
  for (const k of Object.keys(COCHE)) delete COCHE[k];
  if (id === 'otro') Object.assign(COCHE, modeloManual(manual), { id });
  else Object.assign(COCHE, MODELOS[id] || MODELOS.s05pro, { id: MODELOS[id] ? id : 's05pro' });
  COCHE.fabrica = { util: COCHE.util, acMax: COCHE.acMax, dcMax: COCHE.dcMax };
  for (const k of ['util', 'acMax', 'dcMax']) if (+correccion?.[k] > 0) COCHE[k] = +correccion[k];
  Object.assign(CONSUMO_TIPICO, COCHE.consumo);
}
export function corregirCoche(k, v) {
  estado.ajustes.correccion[k] = v > 0 ? +v : null;
  ponerModelo(estado.ajustes.coche, estado.ajustes.cocheManual, estado.ajustes.correccion);
  guardar();
}

// Temperatura puesta a mano: vale 12 horas; luego vuelve sola la del tiempo.
export function tempManual() {
  const t = estado.ajustes.tempManual;
  return t && Date.now() - t.cuando < 12 * 3600e3 ? t.valor : null;
}
export function ponerTempManual(valor) { estado.ajustes.tempManual = valor == null ? null : { valor: +valor, cuando: Date.now() }; guardar(); }
// LFP: cargar al 100 % está bien (y una vez por semana, recomendado). NMC: 80 % en el día a día.
export const objetivoRecomendado = () => (COCHE.quimica === 'LFP' ? 100 : 80);

export const TIPOS_VIA = [
  ['ciudad', 'Ciudad'], ['mixto', 'Mixto'], ['autovia110', 'Autovía 110'], ['autovia120', 'Autovía 120'],
];

export const CARGADORES_CASA = [
  [2.3, 'Enchufe normal (2,3 kW)'],
  [3.7, 'Wallbox 16 A (3,7 kW)'],
  [7.4, 'Wallbox 32 A (7,4 kW)'],
  [11, 'Wallbox trifásico (11 kW)'],
];

const AJUSTES_BASE = {
  coche: null,                // id de MODELOS; null = aún no lo ha elegido
  tarifa: 'pvpc',             // 'pvpc' | 'fija' | 'tramos'
  precioFijo: 0.15,           // €/kWh con impuestos
  tramos: { punta: 0.24, llano: 0.16, valle: 0.10 },
  cargadorCasa: 7.4,
  objetivoCasa: 100,
  consumoReal: { ciudad: null, mixto: null, autovia110: null, autovia120: null },
  correccion: { util: null, acMax: null, dcMax: null },
  avisos: { cien: true, neumaticos: true, itv: true, revision: true, seguro: true },
  tempManual: null,
  tempInterior: 21,           // la temperatura a la que le gusta llevar el coche
  usoClima: true,
  precioRapida: 0.49,         // €/kWh en carga rápida de calle
  precioLenta: 0.35,
  gasolinaL100: 6,            // el coche de antes, para comparar
  gasolinaPrecio: 1.55,
  matriculacion: '',          // AAAA-MM-DD
  revisionFecha: '', revisionKm: '',
  seguroFecha: '',
  telAsistencia: '',
  kmActuales: '',
  tema: 'oscuro',
};

const CLAVE = 'coche-v1';
let estado = leer();

function leer() {
  let guardado = {};
  try { guardado = JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { /* sin almacenamiento */ }
  // Quien ya la usaba antes de poder elegir coche tenía el S05 Pro.
  if (guardado.ajustes && !guardado.ajustes.coche) guardado.ajustes.coche = 's05pro';
  ponerModelo(guardado.ajustes?.coche, guardado.ajustes?.cocheManual, guardado.ajustes?.correccion);
  return {
    ajustes: { ...AJUSTES_BASE, ...(guardado.ajustes || {}),
      tramos: { ...AJUSTES_BASE.tramos, ...(guardado.ajustes?.tramos || {}) },
      consumoReal: { ...AJUSTES_BASE.consumoReal, ...(guardado.ajustes?.consumoReal || {}) },
      correccion: { ...AJUSTES_BASE.correccion, ...(guardado.ajustes?.correccion || {}) },
      avisos: { ...AJUSTES_BASE.avisos, ...(guardado.ajustes?.avisos || {}) } },
    bateria: guardado.bateria || { pct: 80, fecha: null },
    cargas: guardado.cargas || [],
    hechos: guardado.hechos || {},   // recordatorios marcados: { neumaticos: '2026-10-15' }
    notas: guardado.notas || {},
    lugares: guardado.lugares || [], // sitios habituales de quien usa este móvil: { id, nombre, emoji, dir, punto: [lat, lon], municipio }
    sesion: guardado.sesion || null, // carga en curso: { inicio, de, a, kw, ac, precio, lugar, sitio }     // por cargador: { '41.5568,2.1022': { fav, nota, estado, fecha, nombre } }
  };
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* lleno o bloqueado */ }
}

export const ajustes = () => estado.ajustes;
export function cambiarAjuste(clave, valor) { estado.ajustes[clave] = valor; guardar(); }
export function elegirCoche(id, manual = null) {
  const antes = COCHE.quimica, primeraVez = !estado.ajustes.coche;
  estado.ajustes.coche = id;
  if (manual) estado.ajustes.cocheManual = manual;
  estado.ajustes.correccion = { util: null, acMax: null, dcMax: null }; // las correcciones eran del coche anterior
  ponerModelo(id, estado.ajustes.cocheManual);
  // Al cambiar de tipo de batería, el «cargar hasta» de casa pasa al recomendado; el consumo apuntado era de otro coche.
  if (primeraVez || antes !== COCHE.quimica) estado.ajustes.objetivoCasa = objetivoRecomendado();
  if (!primeraVez) for (const k of Object.keys(estado.ajustes.consumoReal)) estado.ajustes.consumoReal[k] = null;
  guardar();
}
export function cambiarAjusteDe(grupo, clave, valor) { estado.ajustes[grupo][clave] = valor; guardar(); }

export const bateria = () => estado.bateria;
export function ponerBateria(pct) {
  estado.bateria = { pct: Math.max(0, Math.min(100, Math.round(pct))), fecha: new Date().toISOString() };
  guardar();
}

export const cargas = () => [...estado.cargas].sort((a, b) => (b.fecha + b.id).localeCompare(a.fecha + a.id));
export function guardarCarga(c) {
  if (!c.id) c.id = Date.now().toString(36);
  estado.cargas = estado.cargas.filter((x) => x.id !== c.id).concat(c);
  if (c.hasta != null && c.hasta !== '') ponerBateria(+c.hasta);
  guardar();
}
export function borrarCarga(id) { estado.cargas = estado.cargas.filter((x) => x.id !== id); guardar(); }

export const hechos = () => estado.hechos;

// Carga en curso («Estoy cargando»).
export const sesion = () => estado.sesion;
export function empezarSesion(s) { estado.sesion = { ...s, inicio: Date.now() }; guardar(); }
export function terminarSesion() { estado.sesion = null; guardar(); }

// Consumo medido con tus cargas (se recalcula solo cuando cambian).
let medidoCache = { n: -1, v: null };
export function medido() {
  if (medidoCache.n !== estado.cargas.length) medidoCache = { n: estado.cargas.length, v: consumoMedido(estado.cargas) };
  return medidoCache.v;
}
export function marcarHecho(clave) { estado.hechos[clave] = hoyISO(); guardar(); }

// Notas y favoritos de cada cargador (la clave es su posición, que no cambia al rehacer la lista).
export const claveCargador = (c) => `${(+c.lat).toFixed(4)},${(+c.lon).toFixed(4)}`;
export const notas = () => estado.notas;
export const notaDe = (c) => estado.notas[claveCargador(c)] || null;
export function guardarNota(c, cambios) {
  const k = claveCargador(c);
  const n = { ...(estado.notas[k] || {}), ...cambios, nombre: c.nombre, lat: c.lat, lon: c.lon, fecha: hoyISO() };
  if (!n.fav && !n.nota && !n.estado) delete estado.notas[k]; else estado.notas[k] = n;
  guardar();
}

// Sitios habituales («Casa», «Trabajo», «Casa de papá»…). Cada persona los pone en su móvil.
export const lugares = () => estado.lugares;
export function guardarLugar(l) {
  const i = estado.lugares.findIndex((x) => x.id === l.id);
  if (i >= 0) estado.lugares[i] = l; else estado.lugares.push({ ...l, id: l.id || String(Date.now()) });
  guardar();
}
export function borrarLugar(id) { estado.lugares = estado.lugares.filter((x) => x.id !== id); guardar(); }
export const lugarPorNombre = (t) => estado.lugares.find((l) => l.nombre.trim().toLowerCase() === String(t || '').trim().toLowerCase()) || null;

export function exportar() { return JSON.stringify({ app: 'rorolectric', version: 1, ...estado }, null, 1); }
export function importar(texto) {
  const d = JSON.parse(texto);
  if (d.app !== 'rorolectric') throw new Error('Este archivo no es una copia de ROROLECTRIC');
  localStorage.setItem(CLAVE, JSON.stringify({ ajustes: d.ajustes, bateria: d.bateria, cargas: d.cargas, hechos: d.hechos, notas: d.notas, lugares: d.lugares }));
  estado = leer();
}
export function borrarTodo() { try { localStorage.removeItem(CLAVE); } catch { /* nada */ } estado = leer(); }

export function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
