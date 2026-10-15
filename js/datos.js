// datos.js — ficha del coche y lo que se guarda en el móvil.
// Ficha: catálogo oficial Changan España (julio 2026), versión Pro.
// Todo lo marcado «estimado» es cálculo nuestro, no dato del fabricante.

export const COCHE = {
  nombre: 'Deepal S05 Pro',
  bateria: 68.8,          // kWh, catálogo
  util: 67,               // kWh utilizables (estimado; el fabricante no lo publica)
  quimica: 'LFP',
  wltpKm: 485,
  wltpConsumo: 15.9,      // kWh/100 km, catálogo
  acMax: 11,              // kW, carga en alterna (casa, calle lenta)
  dcMax: 200,             // kW, carga rápida
  min30a80: 15,           // minutos, catálogo
  v2l: 6,                 // kW
  potencia: 200, par: 290, aceleracion: 7.5,
  largo: 4598, ancho: 1900, alto: 1600, batalla: 2880,
  maletero: 492, frunk: 159, peso: 1940, pesoMax: 2370, remolque: 1600,
  llanta: '18"', traccion: 'Trasera',
  garantia: '7 años / 160.000 km',
  garantiaMotor: '8 años / 200.000 km',
};

// Consumo real típico (kWh/100 km) a 15-25 °C. Estimado para un SUV de este tamaño
// y peso; la app usa el tuyo en cuanto lo apuntas en Ajustes.
export const CONSUMO_TIPICO = { ciudad: 14.5, mixto: 17.5, autovia110: 19, autovia120: 21 };
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
  tarifa: 'pvpc',             // 'pvpc' | 'fija' | 'tramos'
  precioFijo: 0.15,           // €/kWh con impuestos
  tramos: { punta: 0.24, llano: 0.16, valle: 0.10 },
  cargadorCasa: 7.4,
  objetivoCasa: 100,          // LFP: cargar al 100 % está bien
  consumoReal: { ciudad: null, mixto: null, autovia110: null, autovia120: null },
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
  return {
    ajustes: { ...AJUSTES_BASE, ...(guardado.ajustes || {}),
      tramos: { ...AJUSTES_BASE.tramos, ...(guardado.ajustes?.tramos || {}) },
      consumoReal: { ...AJUSTES_BASE.consumoReal, ...(guardado.ajustes?.consumoReal || {}) } },
    bateria: guardado.bateria || { pct: 80, fecha: null },
    cargas: guardado.cargas || [],
    hechos: guardado.hechos || {},   // recordatorios marcados: { neumaticos: '2026-10-15' }
    notas: guardado.notas || {},     // por cargador: { '41.5568,2.1022': { fav, nota, estado, fecha, nombre } }
  };
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* lleno o bloqueado */ }
}

export const ajustes = () => estado.ajustes;
export function cambiarAjuste(clave, valor) { estado.ajustes[clave] = valor; guardar(); }
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

export function exportar() { return JSON.stringify({ app: 'rorolectric', version: 1, ...estado }, null, 1); }
export function importar(texto) {
  const d = JSON.parse(texto);
  if (d.app !== 'rorolectric') throw new Error('Este archivo no es una copia de ROROLECTRIC');
  localStorage.setItem(CLAVE, JSON.stringify({ ajustes: d.ajustes, bateria: d.bateria, cargas: d.cargas, hechos: d.hechos, notas: d.notas }));
  estado = leer();
}
export function borrarTodo() { try { localStorage.removeItem(CLAVE); } catch { /* nada */ } estado = leer(); }

export function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
