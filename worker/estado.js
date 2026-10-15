// Intermediario de ROROLECTRIC en Cloudflare (gratis): la app no puede preguntar a REVE directamente
// (REVE no lo permite desde otras webs), así que pregunta aquí y esto pregunta a REVE.
//   GET /estado?ids=ID1,ID2   → si están libres AHORA los puntos de esos emplazamientos de REVE (máx. 5)
// Respuesta: { ID: { libres, cargando, fuera, sin, total, puntos: [{ id, estado, desde }] } }
// Se guarda 2 minutos en la caché de Cloudflare para no repetir preguntas a REVE.
const ORIGENES = ['https://rochseaside-tech.github.io', 'http://localhost:8765'];
const REVE = 'https://www.mapareve.es/api/public/v1/locations/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cabeceras = (origen) => ({
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=60',
  Vary: 'Origin',
});

const ESTADOS = { AVAILABLE: 'libre', CHARGING: 'cargando', BLOCKED: 'ocupado', RESERVED: 'reservado', OUTOFORDER: 'fuera', INOPERATIVE: 'fuera', REMOVED: 'fuera', PLANNED: 'fuera', UNKNOWN: 'sin' };

async function estadoDe(id, ctx) {
  const cache = caches.default;
  const clave = new Request(`https://cache.rorolectric/${id}`);
  const guardado = await cache.match(clave);
  if (guardado) return guardado.json();
  const r = await fetch(REVE + id, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (ROROLECTRIC, app personal sin animo de lucro)' } });
  if (!r.ok) return { error: r.status };
  const d = await r.json();
  const puntos = (d.evses || []).map((e) => ({ id: e.evse_id, estado: ESTADOS[e.status] || 'sin', desde: e.status_updated_at || null }));
  const cuenta = (x) => puntos.filter((p) => p.estado === x).length;
  const res = { libres: cuenta('libre'), cargando: cuenta('cargando') + cuenta('ocupado') + cuenta('reservado'), fuera: cuenta('fuera'), sin: cuenta('sin'), total: puntos.length, puntos };
  ctx.waitUntil(cache.put(clave, new Response(JSON.stringify(res), { headers: { 'Cache-Control': 'max-age=120' } })));
  return res;
}

export default {
  async fetch(req, env, ctx) {
    const origen = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { headers: cabeceras(origen) });
    const url = new URL(req.url);
    if (url.pathname !== '/estado') return new Response(JSON.stringify({ ok: true, app: 'rorolectric' }), { headers: cabeceras(origen) });
    const ids = (url.searchParams.get('ids') || '').split(',').filter((x) => UUID.test(x)).slice(0, 5);
    if (!ids.length) return new Response(JSON.stringify({ error: 'ids' }), { status: 400, headers: cabeceras(origen) });
    const salida = {};
    await Promise.all(ids.map(async (id) => { try { salida[id] = await estadoDe(id, ctx); } catch { salida[id] = { error: 'red' }; } }));
    return new Response(JSON.stringify(salida), { headers: cabeceras(origen) });
  },
};
