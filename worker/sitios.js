// Buscar sitios «como en Google Maps»: el buscador de Google (Places API New) con la clave guardada aquí
// como secreto (GOOGLE_PLACES_KEY), para que no quede a la vista en la app. Sin clave, la app usa Photon/Nominatim.
//   GET /sitios?q=texto&lat=..&lon=..&s=sesion   → sugerencias [{ id, nombre, detalle }]
//   GET /sitio?id=..&s=sesion                    → { nombre, dir, punto: [lat, lon] }
//   GET /enlace?u=https://maps.app.goo.gl/...     → { punto, nombre } sacado de un enlace compartido de Google Maps
// «s» es el token de sesión de Google: sugerencias + el sitio elegido cuentan como una sola búsqueda.
const PAISES = ['es', 'fr', 'pt', 'ad', 'it'];

export async function sugerencias(url, env) {
  if (!env.GOOGLE_PLACES_KEY) return { sinClave: true, lista: [] };
  const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
  if (q.length < 2) return { lista: [] };
  const lat = +url.searchParams.get('lat'), lon = +url.searchParams.get('lon');
  const cuerpo = { input: q, languageCode: 'es', regionCode: 'es', includedRegionCodes: PAISES, sessionToken: url.searchParams.get('s') || undefined };
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat && lon) cuerpo.locationBias = { circle: { center: { latitude: lat, longitude: lon }, radius: 50000 } };
  const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY }, body: JSON.stringify(cuerpo),
  });
  if (!r.ok) return { error: `Google ${r.status}`, lista: [] };
  const d = await r.json();
  return {
    lista: (d.suggestions || []).map((s) => s.placePrediction).filter(Boolean).map((p) => ({
      id: p.placeId, nombre: p.structuredFormat?.mainText?.text || p.text?.text || '', detalle: p.structuredFormat?.secondaryText?.text || '',
    })),
  };
}

export async function sitio(url, env) {
  if (!env.GOOGLE_PLACES_KEY) return { sinClave: true };
  const id = url.searchParams.get('id') || '';
  if (!/^[\w-]{10,300}$/.test(id)) return { error: 'id' };
  const s = url.searchParams.get('s');
  const r = await fetch(`https://places.googleapis.com/v1/places/${id}?languageCode=es${s ? `&sessionToken=${encodeURIComponent(s)}` : ''}`, {
    headers: { 'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'location,displayName,formattedAddress,addressComponents' },
  });
  if (!r.ok) return { error: `Google ${r.status}` };
  const d = await r.json();
  const pueblo = (d.addressComponents || []).find((c) => c.types?.includes('locality'))?.longText || '';
  return { nombre: d.displayName?.text || '', dir: d.formattedAddress || '', municipio: pueblo, punto: [d.location.latitude, d.location.longitude] };
}

// Enlaces de Google Maps: los cortos (maps.app.goo.gl) se siguen hasta el largo, que lleva las coordenadas.
const HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)$/;
export async function enlace(url) {
  let u = url.searchParams.get('u') || '';
  for (let i = 0; i < 6; i++) {
    let x; try { x = new URL(u); } catch { return { error: 'Eso no parece un enlace' }; }
    if (!HOSTS.test(x.hostname)) return { error: 'Solo entiendo enlaces de Google Maps' };
    const punto = coordenadasDe(u);
    if (punto) return { punto, nombre: nombreDe(u) };
    const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const sig = r.headers.get('location');
    if (!sig) {
      // Sin más saltos: a veces las coordenadas solo están dentro de la página.
      const html = (await r.text()).slice(0, 400000);
      const m = html.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/) || html.match(/@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/);
      return m ? { punto: [+m[1], +m[2]], nombre: nombreDe(u) } : { error: 'No he podido sacar el sitio de ese enlace' };
    }
    u = new URL(sig, u).toString();
  }
  return { error: 'Demasiados saltos' };
}

function coordenadasDe(u) {
  const d = decodeURIComponent(u);
  // Por orden de precisión: el punto exacto del sitio (!3d!4d), luego q=/ll=/query=, luego el centro del mapa (@).
  const m = d.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || d.match(/[?&](?:q|ll|query|daddr|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || d.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return m ? [+m[1], +m[2]] : null;
}
function nombreDe(u) {
  const m = decodeURIComponent(u).match(/\/place\/([^/@?]+)/) || decodeURIComponent(u).match(/[?&]q=([^&]+)/);
  const n = m ? m[1].replace(/\+/g, ' ').trim() : '';
  return /^-?\d+\.\d+,/.test(n) ? '' : n;
}
