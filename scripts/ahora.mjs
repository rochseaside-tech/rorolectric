// Cada hora: si están libres, ocupados o rotos AHORA los cargadores de Francia y Portugal.
//  - Portugal: estado en tiempo real de MOBI.E (evActualStatus).
//  - Francia: base nacional de estado en tiempo real (transport.data.gouv.fr, «IRVE dynamique»).
// Sale en teselas como las de los cargadores (datos/ahora/LAT_LON.json): { fecha, s: { «pt:…»/«fr:…»: [rotos, puntos, libres, ocupados] } }
// Necesita MAPAS_DIR/mapas.json, que deja fuera.mjs cada noche (de qué sitio es cada punto y en qué tesela está).
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { URL_PT_ESTADO, leerEstadoPt, estadoSimple } from './portugal.mjs';

const URL_FR_ESTADO = 'https://transport.data.gouv.fr/resources/84098/download';
const DIR = new URL('../datos/ahora/', import.meta.url);
let mapas;
try { mapas = JSON.parse(await readFile(`${process.env.MAPAS_DIR}/mapas.json`, 'utf8')); } catch { console.log('Sin mapas de anoche: no se puede repartir el estado'); process.exit(0); }

const sitios = new Map(); // ext → [rotos, puntos, libres, ocupados]
const sumar = (ext, estado) => {
  const x = sitios.get(ext) || sitios.set(ext, [0, 0, 0, 0]).get(ext);
  x[1]++;
  if (estado === 'fuera') x[0]++; else if (estado === 'libre') x[2]++; else if (estado === 'ocupado') x[3]++;
};
const fechas = {};

try {
  const r = await fetch(URL_PT_ESTADO); if (!r.ok) throw new Error(`MOBI.E ${r.status}`);
  const xml = await r.text();
  fechas.pt = (xml.match(/<publicationTime>([^<]+)/) || [])[1] || new Date().toISOString();
  for (const p of Object.values(leerEstadoPt(xml))) if (p.sitio) sumar(mapas.pt?.[p.sitio] || `pt:${p.sitio}`, estadoSimple(p.estado));
  console.log('Portugal: estado de', [...sitios.keys()].filter((k) => k.startsWith('pt:')).length, 'sitios');
} catch (e) { console.warn('Portugal:', e.message); }

try {
  const r = await fetch(URL_FR_ESTADO); if (!r.ok) throw new Error(`Francia ${r.status}`);
  const lineas = (await r.text()).split(/\r?\n/);
  const cab = lineas.shift().split(',');
  const [iId, iEtat, iOcc, iHora] = ['id_pdc_itinerance', 'etat_pdc', 'occupation_pdc', 'horodatage'].map((n) => cab.indexOf(n));
  let ultima = '';
  for (const l of lineas) {
    const c = l.split(','); const ext = mapas.fr[c[iId]];
    if (!ext) continue;
    const etat = c[iEtat], occ = c[iOcc];
    if (c[iHora] > ultima) ultima = c[iHora];
    sumar(ext, etat === 'hors_service' ? 'fuera' : etat === 'en_service' && occ === 'libre' ? 'libre' : etat === 'en_service' && /occupe|reserve/.test(occ) ? 'ocupado' : 'sin');
  }
  fechas.fr = ultima ? new Date(ultima.replace(' ', 'T')).toISOString() : new Date().toISOString();
  console.log('Francia: estado de', [...sitios.keys()].filter((k) => k.startsWith('fr:')).length, 'sitios');
} catch (e) { console.warn('Francia:', e.message); }

if (!sitios.size) { console.log('Hoy no hay estado de fuera'); process.exit(0); }
const teselas = new Map();
for (const [ext, x] of sitios) {
  const t = mapas.tesela[ext]; if (!t) continue;
  (teselas.get(t) || teselas.set(t, {}).get(t))[ext] = x;
}
await rm(DIR, { recursive: true, force: true });
await mkdir(DIR, { recursive: true });
for (const [t, s] of teselas) await writeFile(new URL(`${t}.json`, DIR), JSON.stringify({ fechas, s }));
await writeFile(new URL('indice.json', DIR), JSON.stringify({ fechas, teselas: [...teselas.keys()] }));
const rotos = [...sitios.values()].filter((x) => x[0]).length;
console.log(`Estado de ahora: ${sitios.size} sitios de fuera en ${teselas.size} teselas (${rotos} con algún punto roto)`);
