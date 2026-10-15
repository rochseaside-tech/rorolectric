// Archivo pequeño con las averías de ahora (datos/estado-reve.json), para publicarlo cada hora sin
// rehacer la lista de cargadores entera. Por cada emplazamiento de REVE con algún punto que no funciona:
// { id REVE: [puntos que no funcionan, puntos que tiene] }. La app lo cruza con el id REVE de cada cargador.
// Uso: REVE_DIR=… node scripts/estado-reve.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = process.env.REVE_DIR;
const SALIDA = new URL('../datos/estado-reve.json', import.meta.url);
let sitios, fuera, estado;
try {
  sitios = JSON.parse(await readFile(join(dir, 'sitios.json'), 'utf8'));
  fuera = JSON.parse(await readFile(join(dir, 'fuera.json'), 'utf8'));
  estado = JSON.parse(await readFile(join(dir, 'estado.json'), 'utf8'));
} catch { console.log('Aún no hay estado de REVE'); process.exit(0); }

const f = {};
for (const [id, s] of Object.entries(sitios)) {
  const n = (s.evses || []).filter((e) => fuera[e]).length;
  if (n) f[id] = [n, s.evses.length];
}
// «completo»: ya se ha mirado España entera, así que los que no salen aquí funcionan.
const fecha = estado.actualizado; // la última vez que se preguntó a REVE
await writeFile(SALIDA, JSON.stringify({ fecha, completo: !!estado.est?.hecha, f }));
console.log(`Estado de REVE: ${Object.keys(f).length} sitios con algún punto que no funciona${estado.est?.hecha ? '' : ' (aún mirando España entera)'}`);
