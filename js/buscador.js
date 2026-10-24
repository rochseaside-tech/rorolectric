// buscador.js — buscar sitios con sugerencias mientras escribes (como en Google Maps).
// Fuentes, por orden: tus sitios, tus destinos recientes y el buscador de Google (vía el intermediario, si tiene
// clave); si no hay clave o falla, Photon (OpenStreetMap, perdona faltas y nombres a medias) y Nominatim.
// También: «Mi ubicación», «Elegir en el mapa» y pegar un enlace de Google Maps.
import { lugares } from './datos.js';
import { esc, ubicacion, ultimaUbicacion, abrirHoja, cerrarHoja, capaMapa, aviso } from './comun.js';

const PUENTE = 'https://rorolectric.rorolectric.workers.dev';
const CLAVE_RECIENTES = 'sitios-recientes';
// Sugerencias gratuitas: solo países a los que se va en coche desde España (si no, salen «Saldes» de Letonia).
const PAISES_CERCA = ['ES', 'FR', 'PT', 'AD', 'IT', 'CH', 'MC', 'BE', 'NL', 'LU', 'DE', 'AT', 'GB', 'IE'];

export function recientes() {
  try { return JSON.parse(localStorage.getItem(CLAVE_RECIENTES)) || []; } catch { return []; }
}
export function apuntarReciente(s) {
  if (!s?.punto || /^donde est/.test(s.nombre)) return;
  // Tus sitios ya salen arriba del todo: no se repiten en recientes.
  if (lugares().some((l) => l.punto?.[0] === s.punto[0] && l.punto?.[1] === s.punto[1])) return;
  const lista = [s, ...recientes().filter((x) => x.nombre !== s.nombre)].slice(0, 10);
  try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista.map(({ nombre, detalle, punto, municipio }) => ({ nombre, detalle, punto, municipio })))); } catch { /* lleno */ }
}

const llano = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const sesionGoogle = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
let googleSinClave = false; // si el intermediario dice que no hay clave, no se le vuelve a preguntar

// Coordenadas escritas a mano: «42.21, 1.73» o «42,21 1,73».
function coordenadas(t) {
  const m = t.trim().match(/^(-?\d{1,2}[.,]\d+)[,;\s]+(-?\d{1,3}[.,]\d+)$/);
  if (!m) return null;
  const p = [+m[1].replace(',', '.'), +m[2].replace(',', '.')];
  return Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 ? p : null;
}
const esEnlace = (t) => /^https?:\/\/\S+$/.test(t.trim()) || /maps\.app\.goo\.gl|google\.[a-z.]+\/maps/.test(t);

async function deGoogle(q, cerca, s) {
  if (googleSinClave) return null;
  const r = await fetch(`${PUENTE}/sitios?q=${encodeURIComponent(q)}${cerca ? `&lat=${cerca[0]}&lon=${cerca[1]}` : ''}&s=${s}`);
  const d = await r.json();
  if (d.sinClave) { googleSinClave = true; return null; }
  if (d.error) return null;
  return d.lista.map((x) => ({ ...x, fuente: 'google', s }));
}

async function dePhoton(q, cerca) {
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10${cerca ? `&lat=${cerca[0]}&lon=${cerca[1]}` : ''}`);
  const d = await r.json();
  return (d.features || []).filter((f) => PAISES_CERCA.includes(f.properties?.countrycode)).map((f) => {
    const p = f.properties || {};
    const nombre = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || '';
    const municipio = p.city || p.town || p.village || p.district || '';
    const detalle = [p.name && p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : '', municipio !== nombre ? municipio : '', p.county || p.state, p.countrycode !== 'ES' ? p.country : '']
      .filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
    return { nombre, detalle, municipio, punto: [f.geometry.coordinates[1], f.geometry.coordinates[0]], fuente: 'osm' };
  }).filter((x) => x.nombre);
}

async function deNominatim(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&accept-language=es&q=${encodeURIComponent(q)}`);
  const d = await r.json();
  return d.map((x) => {
    const a = x.address || {}, municipio = a.city || a.town || a.village || a.municipality || '';
    const partes = x.display_name.split(',').map((t) => t.trim());
    return { nombre: partes[0], detalle: partes.slice(1, 4).join(', '), municipio, punto: [+x.lat, +x.lon], fuente: 'osm' };
  });
}

// Sugerencias de fuera (Google si se puede; si no, OpenStreetMap). Cerca de ti primero.
async function buscarFuera(q, s) {
  const cerca = ultimaUbicacion();
  try { const g = await deGoogle(q, cerca, s); if (g?.length) return g; } catch { /* sin intermediario: OSM */ }
  try { const p = await dePhoton(q, cerca); if (p.length) return p; } catch { /* Photon caído: Nominatim */ }
  try { return await deNominatim(q); } catch { return []; }
}

// De una sugerencia al sitio con coordenadas (las de Google hay que pedirlas aparte).
export async function resolver(x) {
  if (x.punto) return x;
  if (x.fuente === 'google') {
    const d = await (await fetch(`${PUENTE}/sitio?id=${encodeURIComponent(x.id)}&s=${x.s || ''}`)).json();
    if (!d.punto) throw new Error('Google no ha dado ese sitio');
    return { nombre: d.nombre || x.nombre, detalle: d.dir || x.detalle, municipio: d.municipio, punto: d.punto };
  }
  if (x.fuente === 'enlace') {
    const d = await (await fetch(`${PUENTE}/enlace?u=${encodeURIComponent(x.url)}`)).json();
    if (!d.punto) throw new Error(d.error || 'No entiendo ese enlace');
    return { nombre: d.nombre || 'Sitio del enlace', detalle: 'De Google Maps', punto: d.punto };
  }
  throw new Error('Sitio sin coordenadas');
}

// Texto escrito sin elegir sugerencia: la primera que salga.
export async function buscarTexto(texto) {
  const t = texto.trim();
  const mio = lugares().find((l) => llano(l.nombre) === llano(t));
  if (mio) return { nombre: `${mio.emoji || ''} ${mio.nombre}`.trim(), punto: mio.punto, municipio: mio.municipio };
  const c = coordenadas(t); if (c) return { nombre: t, punto: c };
  if (esEnlace(t)) return resolver({ fuente: 'enlace', url: t });
  const lista = await buscarFuera(t, sesionGoogle());
  if (!lista.length) throw new Error(`No encuentro «${t}». Prueba con el pueblo, o pega un enlace de Google Maps.`);
  // Los buscadores perdonan faltas y a veces devuelven algo que no tiene nada que ver («Casa de papá» → «Casa Fajol»):
  // sin ninguna palabra en común, mejor pedir que elija en la lista que llevarla a otro sitio.
  const palabras = llano(t).split(/[\s,]+/).filter((w) => w.length >= 4);
  const x = lista[0], suyo = llano(`${x.nombre} ${x.detalle || ''}`);
  if (palabras.length && !palabras.some((w) => suyo.includes(w))) throw new Error(`No encuentro «${t}» tal cual. Elige una de las sugerencias que salen al escribir, elígelo en el mapa o pega un enlace de Google Maps.`);
  return resolver(x);
}

// Hoja con un mapa para elegir el sitio a mano: el punto es el centro (la cruz).
export function elegirEnMapa(inicio) {
  return new Promise((ok) => {
    let mapa = null, hecho = false;
    abrirHoja(`<h2>Elige el sitio en el mapa</h2>
      <p class="muy-suave" style="margin-top:0">Mueve el mapa hasta que la cruz quede encima del sitio.</p>
      <div style="position:relative"><div id="mapa-elegir" class="mapa" style="height:52dvh;border-radius:14px"></div>
        <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);font-size:34px;pointer-events:none;z-index:500;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))">📍</div></div>
      <div class="botones"><button class="boton" id="este">Este sitio</button></div>`, async (caja) => {
      const centro = inicio || (await ubicacion()) || ultimaUbicacion();
      mapa = L.map(caja.querySelector('#mapa-elegir'), { zoomControl: false }).setView(centro, 14);
      capaMapa(mapa);
      caja.querySelector('#este').onclick = async () => {
        const c = mapa.getCenter(), punto = [+c.lat.toFixed(6), +c.lng.toFixed(6)];
        let nombre = 'Sitio elegido en el mapa', municipio = '';
        try {
          const r = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=es&zoom=17&lat=${punto[0]}&lon=${punto[1]}`)).json();
          const a = r.address || {};
          municipio = a.city || a.town || a.village || a.municipality || '';
          nombre = [r.name || (a.road && `${a.road}${a.house_number ? ' ' + a.house_number : ''}`), municipio].filter(Boolean).join(', ') || nombre;
        } catch { /* sin nombre: vale el punto */ }
        hecho = true; mapa.remove(); cerrarHoja(); ok({ nombre, punto, municipio });
      };
    });
    // Si cierra la hoja sin elegir
    const vigilar = setInterval(() => { if (document.getElementById('hoja').hidden) { clearInterval(vigilar); if (!hecho) { mapa?.remove(); ok(null); } } }, 300);
  });
}

// Pone el desplegable de sugerencias en un <input>. Lo elegido queda en input.sitio ({ nombre, punto, … }).
// «conUbicacion»: ofrecer «Mi ubicación» (en «Desde»). alElegir(sitio) se llama al elegir.
export function montarBuscador(input, { alElegir = null, conUbicacion = false } = {}) {
  const caja = document.createElement('div');
  caja.className = 'sugerencias'; caja.hidden = true;
  input.after(caja);
  input.closest('.campo')?.classList.add('con-sugerencias');
  input.setAttribute('autocomplete', 'off');
  let turno = 0, opciones = [], s = sesionGoogle(), espera;

  const fila = (x, i) => `<button type="button" class="sug" data-i="${i}"><span class="sug-i">${x.icono || (x.fuente === 'google' ? '📍' : x.fuente === 'mio' ? '' : '📍')}</span>
    <span class="sug-t"><b>${esc(x.nombre)}</b>${x.detalle ? `<small>${esc(x.detalle)}</small>` : ''}</span></button>`;
  const pintar = (lista, pie = '') => {
    opciones = lista;
    caja.innerHTML = lista.map(fila).join('') + pie;
    caja.hidden = !lista.length && !pie;
  };
  const fijas = () => [
    ...(conUbicacion ? [{ icono: '🎯', nombre: 'Mi ubicación', detalle: 'Donde estoy ahora', accion: 'aqui' }] : []),
    { icono: '🗺️', nombre: 'Elegir en el mapa', accion: 'mapa' },
    ...(navigator.clipboard?.readText ? [{ icono: '🔗', nombre: 'Pegar enlace de Google Maps', detalle: 'En Google Maps: el sitio → Compartir → Copiar enlace', accion: 'pegar' }] : []),
  ];
  const mios = (q) => [
    ...lugares().filter((l) => !q || llano(l.nombre).includes(q)).map((l) => ({ icono: l.emoji || '⭐', nombre: l.nombre, detalle: l.dir, punto: l.punto, municipio: l.municipio, fuente: 'mio' })),
    ...recientes().filter((r) => !q || llano(r.nombre).includes(q) || llano(r.detalle).includes(q)).slice(0, q ? 3 : 5).map((r) => ({ ...r, icono: '🕘' })),
  ];

  const sugerir = async () => {
    const t = input.value.trim(), q = llano(t), yo = ++turno;
    if (!t) { pintar([...fijas(), ...mios('')]); return; }
    if (esEnlace(t)) { pintar([{ icono: '🔗', nombre: 'Usar este enlace de Google Maps', fuente: 'enlace', url: t }]); return; }
    const c = coordenadas(t);
    if (c) { pintar([{ icono: '📌', nombre: `Coordenadas ${c[0]}, ${c[1]}`, punto: c }]); return; }
    const propios = mios(q);
    pintar(propios, t.length >= 2 ? '<div class="sug-espera">Buscando…</div>' : '');
    if (t.length < 2) return;
    const fuera = await buscarFuera(t, s);
    if (yo !== turno) return; // ya ha escrito otra cosa
    // Sin resultados: las otras formas de dar con el sitio (mapa, enlace).
    const otras = fuera.length ? [] : fijas().filter((x) => x.accion !== 'aqui');
    pintar([...propios, ...fuera, ...otras], fuera.length ? '' : '<div class="sug-espera">No encuentro nada así. Prueba con el pueblo, elígelo en el mapa o pega un enlace de Google Maps.</div>');
  };

  const elegir = async (x) => {
    caja.hidden = true;
    try {
      let sitio;
      if (x.accion === 'aqui') { const p = await ubicacion({ forzar: true }); if (!p) throw new Error('No me dejan ver dónde estás: activa la ubicación'); sitio = { nombre: 'Mi ubicación', punto: p, aqui: true }; }
      else if (x.accion === 'mapa') { sitio = await elegirEnMapa(input.sitio?.punto); if (!sitio) return; }
      else if (x.accion === 'pegar') {
        let txt = '';
        try { txt = await navigator.clipboard.readText(); } catch { /* sin permiso */ }
        if (!esEnlace(txt)) { aviso('Copia primero el enlace en Google Maps (Compartir → Copiar) y vuelve a tocar aquí, o pégalo en el cuadro'); input.focus(); return; }
        input.value = '…'; sitio = await resolver({ fuente: 'enlace', url: txt.trim() });
      } else sitio = await resolver(x);
      input.value = sitio.nombre;
      input.sitio = sitio;
      s = sesionGoogle();
      alElegir?.(sitio);
    } catch (e) { aviso(e.message); }
  };

  input.addEventListener('input', () => { input.sitio = null; clearTimeout(espera); espera = setTimeout(sugerir, 250); });
  input.addEventListener('focus', () => { if (!input.value.trim() || !input.sitio) sugerir(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !caja.hidden && opciones.length && !input.sitio) { e.preventDefault(); elegir(opciones.find((x) => !x.accion) || opciones[0]); }
    if (e.key === 'Escape') caja.hidden = true;
  });
  // pointerdown (y no click): el desplegable se cierra al perder el foco y el click llegaría tarde.
  caja.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; e.preventDefault(); elegir(opciones[+b.dataset.i]); });
  input.addEventListener('blur', () => setTimeout(() => { caja.hidden = true; }, 150));
  return { limpiar: () => { input.sitio = null; } };
}
