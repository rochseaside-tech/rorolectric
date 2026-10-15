// Baja de REVE (Red Eléctrica, mapareve.es) los puntos de recarga y sus PRECIOS oficiales.
// La clave solo deja 5 consultas por hora, así que cada hora se bajan 5 páginas de 100 y se
// guarda por dónde va (en REVE_DIR). Orden:
//   1) todos los emplazamientos (~150 páginas, ~30 h): dónde están y qué enchufes tienen;
//   2) todas las tarifas (~470 páginas, ~4 días): precio de cada enchufe;
//   3) después, cada día solo las tarifas que han cambiado, y cada semana se repasan los sitios.
// Uso: REVE_API_KEY=… REVE_DIR=… node scripts/reve.mjs   (lo ejecuta .github/workflows/reve.yml)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const API = process.env.REVE_API || 'https://www.mapareve.es/api/external/v1';
const CLAVE = process.env.REVE_API_KEY;
const DIR = process.env.REVE_DIR || 'reve-datos';
const POR_HORA = +process.env.REVE_CONSULTAS || 5;
const HORA = 3600e3;

if (!CLAVE) { console.log('Falta REVE_API_KEY: no se hace nada'); process.exit(0); }
await mkdir(DIR, { recursive: true });
const leer = async (f, def) => { try { return JSON.parse(await readFile(join(DIR, f), 'utf8')); } catch { return def; } };
const cursor = () => ({ pag: 1, total: null, inicio: null, ultimoInicio: null, hecha: null, n: 0 });
const estado = await leer('estado.json', { loc: cursor(), tar: cursor() });
const sitios = await leer('sitios.json', {});
const precios = await leer('precios.json', {});

// Qué toca pedir ahora.
function tarea(ahora) {
  const { loc, tar } = estado;
  if (!loc.hecha) return 'loc';
  if (!tar.hecha || tar.pag > 1) return 'tar';
  if (ahora - Date.parse(tar.ultimoInicio) >= 20 * HORA) return 'tar'; // tarifas cambiadas desde la última vez
  if (loc.pag > 1 || ahora - Date.parse(loc.ultimoInicio) >= 6 * 24 * HORA) return 'loc';
  return null;
}

// Enchufes (OCPI) → letra corta, igual que en cargadores.mjs
const TIPO = {
  IEC_62196_T2_COMBO: 'C', IEC_62196_T2: 'T', CHADEMO: 'H', DOMESTIC_F: 'S', DOMESTIC_E: 'S',
  IEC_62196_T1: 'J', IEC_62196_T1_COMBO: 'J', TESLA_S: 'X', TESLA_R: 'X', IEC_60309_2_single_16: 'I', IEC_60309_2_three_32: 'I',
};

function guardarSitio(l, n) {
  const la = +l.coordinates?.latitude, lo = +l.coordinates?.longitude;
  if (!la || !lo) return;
  const enchufes = [];
  let tarjeta = false, reservable = false;
  for (const e of l.evses || []) {
    if ((e.capabilities || []).some((c) => /CREDIT_CARD|DEBIT_CARD|CONTACTLESS/.test(c))) tarjeta = true;
    if ((e.capabilities || []).includes('RESERVABLE')) reservable = true;
    for (const c of e.connectors || []) {
      enchufes.push([c.id, TIPO[c.standard] || '', Math.round((c.max_electric_power || 0) / 1000), /^DC/.test(c.power_type || '') ? 1 : 0]);
    }
  }
  sitios[l.id] = {
    la: +la.toFixed(5), lo: +lo.toFixed(5), nombre: l.name || '', empresa: l.cpo_name || '', marca: (l.owner || '').split(' - ')[0],
    dir: [l.address, l.city].filter(Boolean).join(', '), h24: !!l.opening_times?.twentyfourseven, tarjeta, reservable, enchufes, v: n,
  };
}

// Tarifa OCPI → [€/kWh mín, €/kWh máx, €/hora cargando, € fijos por carga, €/hora de plaza ocupada, desde qué minuto], IVA incluido.
function resumir(tarifas, hoy) {
  const vigentes = tarifas.filter((t) => (!t.end_date_time || t.end_date_time.slice(0, 10) >= hoy) && (!t.start_date_time || t.start_date_time.slice(0, 10) <= hoy));
  const kwh = [];
  let hora = 0, fijo = 0, plaza = 0, plazaDesde = null, reservable = 0;
  for (const t of vigentes.length ? vigentes : tarifas) {
    for (const el of t.elements || []) {
      const r = el.restrictions || {};
      // Si tiene precio de reserva, es que se puede reservar (desde la app de la empresa); no es precio de cargar.
      if (r.reservation) { reservable = 1; continue; }
      if ((r.end_date && r.end_date < hoy) || (r.start_date && r.start_date > hoy)) continue;
      for (const p of el.price_components || []) {
        const v = (+p.price || 0) * (1 + (+p.vat || 0) / 100);
        if (p.type === 'ENERGY') kwh.push(v);
        else if (p.type === 'TIME') hora = Math.max(hora, v);
        else if (p.type === 'FLAT') fijo = Math.max(fijo, v);
        else if (p.type === 'PARKING_TIME' && v > 0) {
          plaza = Math.max(plaza, v);
          const desde = Math.round((r.min_duration || 0) / 60);
          plazaDesde = plazaDesde == null ? desde : Math.min(plazaDesde, desde);
        }
      }
    }
  }
  if (!kwh.length && !hora && !fijo && !reservable) return null;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return [kwh.length ? r3(Math.min(...kwh)) : null, kwh.length ? r3(Math.max(...kwh)) : null, r3(hora), r3(fijo), r3(plaza), plazaDesde || 0, reservable];
}

async function pedir(ruta, params) {
  const url = `${API}${ruta}?${new URLSearchParams(params)}`;
  const r = await fetch(url, { headers: { 'x-api-key': CLAVE, Accept: 'application/json', 'User-Agent': 'ROROLECTRIC (app personal, sin animo de lucro)' } });
  if (r.status === 429) return { limite: true };
  if (!r.ok) throw new Error(`REVE ${ruta} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return { filas: await r.json(), total: +r.headers.get('total-pages') || 1 };
}

// Una hora de trabajo: hasta 5 consultas. Devuelve qué pasada ha terminado ('loc', 'tar' o '').
async function unaHora() {
  let hechas = 0, terminada = '';
  const ahora = Date.now(), hoy = new Date().toISOString().slice(0, 10);
  while (hechas < POR_HORA) {
    const t = tarea(ahora);
    if (!t) { console.log('Todo al día: no hace falta pedir nada ahora'); break; }
    const c = estado[t];
    const empieza = c.pag === 1, cuando = new Date().toISOString();
    const params = { page: c.pag, limit: 100 };
    // Tarifas: tras la primera pasada completa, solo las que han cambiado (con 1 h de margen).
    if (t === 'tar' && c.hecha) params.date_from = new Date(Date.parse(c.ultimoInicio) - HORA).toISOString();
    let res;
    try { res = await pedir(t === 'loc' ? '/locations' : '/connectors/tariffs', params); } catch (e) { console.warn(e.message); break; }
    if (res.limite) { console.log('REVE dice que ya van 5 consultas esta hora: se sigue en la próxima'); break; }
    hechas++;
    if (empieza) { c.inicio = cuando; c.n = (c.n || 0) + 1; }
    if (t === 'loc') for (const l of res.filas) guardarSitio(l, c.n);
    else for (const x of res.filas) { const p = resumir(x.tariffs || [], hoy); if (p) precios[x.connector_id] = p; else delete precios[x.connector_id]; }
    c.total = res.total;
    console.log(`${t === 'loc' ? 'Sitios' : 'Tarifas'}: página ${c.pag} de ${c.total}${params.date_from ? ' (solo cambios)' : ''}`);
    if (c.pag >= c.total || !res.filas.length) {
      c.hecha = new Date().toISOString(); c.ultimoInicio = c.inicio; c.pag = 1;
      if (t === 'loc') {
        // Los que no han salido en las dos últimas pasadas ya no existen.
        for (const [id, s] of Object.entries(sitios)) if (s.v < c.n - 1) delete sitios[id];
      }
      terminada = t;
      console.log(`Pasada de ${t === 'loc' ? 'sitios' : 'tarifas'} terminada`);
    } else c.pag++;
  }
  estado.actualizado = new Date().toISOString();
  await writeFile(join(DIR, 'estado.json'), JSON.stringify(estado, null, 1));
  await writeFile(join(DIR, 'sitios.json'), JSON.stringify(sitios));
  await writeFile(join(DIR, 'precios.json'), JSON.stringify(precios));
  console.log(`Consultas: ${hechas} · sitios: ${Object.keys(sitios).length} · enchufes con precio: ${Object.keys(precios).length}`);
  return terminada;
}

// Con REVE_HORAS > 1 se queda trabajando varias horas seguidas (5 consultas cada hora en punto),
// para no depender de que GitHub lance a tiempo el robot programado.
const HORAS = Math.max(1, +process.env.REVE_HORAS || 1);
let publicar = false;
for (let h = 0; h < HORAS; h++) {
  const terminada = await unaHora();
  // Al acabar una pasada completa, el workflow vuelve a publicar la app con los datos nuevos.
  // (Los cambios diarios de tarifas ya los recoge la publicación de cada noche.)
  if (terminada === 'loc' || (terminada === 'tar' && estado.tar.n === 1)) publicar = true;
  if (!tarea(Date.now()) || h === HORAS - 1) break;
  const proxima = process.env.REVE_ESPERA ? Date.now() + +process.env.REVE_ESPERA // (para probar sin esperar una hora)
    : (Math.floor(Date.now() / HORA) + 1) * HORA + 90e3; // la hora siguiente y minuto y medio
  console.log(`Espero a las ${new Date(proxima).toISOString().slice(11, 16)} UTC para las siguientes 5 consultas`);
  await new Promise((r) => setTimeout(r, proxima - Date.now()));
}
if (process.env.GITHUB_OUTPUT) {
  const queda = !!tarea(Date.now()) && !(estado.loc.hecha && estado.tar.hecha && estado.tar.pag === 1);
  await writeFile(process.env.GITHUB_OUTPUT, `publicar=${publicar ? 'si' : 'no'}\nseguir=${queda ? 'si' : 'no'}\n`, { flag: 'a' });
}
