// Viaje: ruta y paradas en cargadores rápidos REALES de la ruta (como ABRP, pero con la lista oficial).
import { COCHE, TIPOS_VIA, ajustes, bateria, claveCargador, medido } from '../datos.js';
import { consumo, planViaje, planConCargadores, muestrearRuta, cargadoresEnRuta, perfilEnergia } from '../calc.js';
import { enZona, cargarTodos, abrirFicha } from '../cargadores.js';
import { esc, num, euros, duracion, ubicacion, temperatura, campo, aviso, capaMapa, buscarSitio } from '../comun.js';

let form = { desde: '', hasta: '', pct: null, via: 'autovia120', llegar: 15, km: '', temp: '', parada: 12, cargarHasta: 80, minKw: 50 };
let mapa = null;

export function pintar(raiz) {
  if (form.pct == null) form.pct = bateria().pct;
  raiz.innerHTML = `
    <div class="titulo-pantalla"><h1>Viaje</h1><p>Dime adónde vas y te digo en qué cargadores parar y cuánto.</p></div>
    <form class="tarjeta" id="f">
      ${campo('Desde', 'desde', form.desde, { tipo: 'text', extra: 'placeholder="Vacío = donde estoy"' })}
      ${campo('Hasta', 'hasta', form.hasta, { tipo: 'text', extra: 'placeholder="Ej. Zaragoza, Andorra la Vella…" required' })}
      <div class="fila">${campo('Salgo con', 'pct', form.pct, { unidad: '%' })}${campo('Llegar con al menos', 'llegar', form.llegar, { unidad: '%' })}</div>
      <label class="campo"><span>Por dónde</span><select name="via">${TIPOS_VIA.map(([k, t]) => `<option value="${k}" ${k === form.via ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <button class="boton" type="submit">Planificar</button>
      <details style="margin-top:12px"><summary class="suave" style="cursor:pointer">Más opciones (temperatura, paradas…)</summary>
        <div style="margin-top:10px">
          ${campo('Temperatura del viaje (vacío = la del tiempo)', 'temp', form.temp, { unidad: '°C', paso: '1' })}
          <div class="fila">${campo('Parar a cargar con', 'parada', form.parada, { unidad: '%' })}${campo('Cargar hasta', 'cargarHasta', form.cargarHasta, { unidad: '%' })}</div>
          <label class="campo"><span>Parar solo en cargadores de</span><select name="minKw">${[[50, '50 kW o más'], [100, '100 kW o más'], [150, '150 kW o más']].map(([v, t]) => `<option value="${v}" ${+form.minKw === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        </div>
      </details>
      <details style="margin-top:12px"><summary class="suave" style="cursor:pointer">¿No encuentra el sitio? Pon los km a mano</summary>
        <div style="margin-top:10px">${campo('Kilómetros', 'km', form.km, { unidad: 'km' })}<button class="boton sec" type="button" id="manual">Calcular con esos km</button></div>
      </details>
    </form>
    <div id="res"></div>`;
  const f = raiz.querySelector('#f');
  const leer = () => { form = { ...form, ...Object.fromEntries(new FormData(f)) }; };
  f.onsubmit = (e) => { e.preventDefault(); leer(); planificar(raiz); };
  raiz.querySelector('#manual').onclick = () => { leer(); if (+form.km > 0) mostrar(raiz, { km: +form.km }); else aviso('Pon los km'); };
}

async function planificar(raiz) {
  const res = raiz.querySelector('#res');
  res.innerHTML = '<div class="tarjeta suave">Buscando la ruta…</div>';
  try {
    const origen = form.desde.trim() ? await buscarSitio(form.desde) : { punto: await ubicacion(), nombre: 'donde estás' };
    if (!origen.punto) throw new Error('No sé dónde estás: escribe el «Desde» o activa la ubicación.');
    const destino = await buscarSitio(form.hasta);
    const [a, b] = [origen.punto, destino.punto];
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`);
    const d = await r.json();
    if (d.code !== 'Ok') throw new Error('No encuentro ruta en coche entre esos dos sitios.');
    const ruta = d.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo]);
    await mostrar(raiz, { km: d.routes[0].distance / 1000, horas: d.routes[0].duration / 3600, ruta, origen, destino });
  } catch (e) {
    res.innerHTML = `<div class="resultado ambar"><div class="grande">Ups</div><p>${esc(e.message || 'Sin conexión')}</p></div>`;
  }
}

// Alturas de la ruta (Open-Meteo, gratis): hasta 100 puntos por petición, un punto cada ~1-3 km.
async function desnivelDe(ruta, km) {
  const muestras = muestrearRuta(ruta, Math.max(1, km / 300));
  const alturas = [];
  for (let i = 0; i < muestras.length; i += 100) {
    const trozo = muestras.slice(i, i + 100);
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${trozo.map((m) => m.p[0].toFixed(4)).join(',')}&longitude=${trozo.map((m) => m.p[1].toFixed(4)).join(',')}`);
    if (!r.ok) throw new Error('sin alturas');
    alturas.push(...(await r.json()).elevation);
  }
  // Media de 5 puntos: los datos de altura tienen «ruido» (puentes, túneles, laderas) que inflaría los metros de subida.
  const suaves = alturas.map((_, i) => { const t = alturas.slice(Math.max(0, i - 2), i + 3).filter((x) => x != null); return t.reduce((s, x) => s + x, 0) / t.length; });
  return perfilEnergia(muestras, suaves, COCHE.peso || 2000);
}

// Cargadores rápidos (CCS, para todo el mundo) a menos de 3 km de la ruta.
async function rapidosDeLaRuta(ruta) {
  await cargarTodos();
  const lats = ruta.map((p) => p[0]), lons = ruta.map((p) => p[1]);
  const [s, n, w, e] = [Math.min(...lats) - 0.05, Math.max(...lats) + 0.05, Math.min(...lons) - 0.07, Math.max(...lons) + 0.07];
  const zona = await enZona(s, w, n, e);
  return cargadoresEnRuta(muestrearRuta(ruta), zona.filter((c) => c.rapido && c.compatible && !c.clientes));
}

const lineaCargador = (c, extra = '') => `<a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}" target="_blank" rel="noopener"
  style="display:block;padding:10px 12px;margin-top:6px;border-radius:10px;background:var(--tarjeta2);text-decoration:none;color:var(--texto);font-size:14px">
  ⚡ <b>${esc(c.nombre)}</b>${c.operador ? ` <span class="suave">· ${esc(c.operador)}</span>` : ''}<br>
  <span class="suave">${c.potencia ? `${num(c.potencia)} kW` : 'rápido'} · km ${num(c.kmRuta)} · ${c.desvio < 0.3 ? 'en la misma ruta' : `a ${num(c.desvio, 1)} km de la ruta`}${extra}</span></a>`;

async function mostrar(raiz, { km, horas, ruta, origen, destino }) {
  const res = raiz.querySelector('#res');
  res.innerHTML = '<div class="tarjeta suave">Buscando cargadores en la ruta…</div>';
  const temp = form.temp !== '' && form.temp != null ? +form.temp : await temperatura(origen?.punto);
  const c = consumo(form.via, temp, ajustes(), medido());
  let enRuta = [];
  if (ruta) { try { enRuta = await rapidosDeLaRuta(ruta); } catch { /* sin lista: plan teórico */ } }
  const opciones = { llegarCon: +form.llegar || 10, paradaEn: Math.max(3, +form.parada || 12), cargarHasta: Math.min(100, Math.max(30, +form.cargarHasta || 80)) };
  const validos = enRuta.filter((x) => (x.potencia || 50) >= +form.minKw);
  let desnivel = null;
  if (ruta) { try { desnivel = await desnivelDe(ruta, km); opciones.perfil = desnivel.perfil; } catch { /* sin alturas: como si fuera llano */ } }
  const plan = ruta ? planConCargadores(km, +form.pct, c, validos, opciones) : planViaje(km, +form.pct, c, opciones);
  const n = plan.paradas.length;
  // OSRM calcula a velocidad legal; a 110 se tarda un poco más.
  const conduccion = horas ? horas * (form.via === 'autovia110' ? 1.06 : 1) : km / (form.via.startsWith('autovia') ? 100 : 60);

  res.innerHTML = `
    <div class="resultado ${plan.imposible ? 'rojo' : ''}">
      <div class="grande">${plan.imposible ? 'Así no llegas' : n ? `${n} parada${n > 1 ? 's' : ''} · ${duracion(plan.minutosCarga)} cargando` : 'Sin parar a cargar'}</div>
      <p>${num(km)} km${origen ? ` desde ${esc(origen.nombre)} hasta ${esc(destino.nombre)}` : ''}. Conduciendo ${duracion(conduccion * 60)}${n ? `; en total unas ${duracion(conduccion * 60 + plan.minutosCarga + n * 5)}` : ''}.
      ${plan.llegada != null ? `Llegas con un <b>${Math.round(plan.llegada)} %</b>.` : ''}</p>
      ${desnivel && desnivel.sube > 50 ? `<p>⛰️ Subes ${num(desnivel.sube)} m y bajas ${num(desnivel.baja)} m en total: ${desnivel.total >= 0 ? 'gasta' : 'recupera'} unos <b>${num(Math.abs(desnivel.total), 1)} kWh</b> (≈ ${num(Math.abs(desnivel.total) / COCHE.util * 100)} % de batería). Ya está contado tramo a tramo.</p>` : ''}
      ${costeViaje(km, plan)}
      <p class="muy-suave">Consumo usado: ${num(c, 1)} kWh/100 km${temp != null ? ` con ${num(temp)} °C` : ''}. ${ruta ? `${enRuta.length} cargadores rápidos a menos de 3 km de la ruta.` : ''} Paradas con al menos un ${opciones.paradaEn} %, cargando hasta el ${opciones.cargarHasta} % o lo justo para llegar, en cargadores de ${form.minKw} kW o más (cámbialo en «Más opciones»).</p>
    </div>
    ${ruta ? '<div id="mapa-viaje" class="mapa bajo"></div>' : ''}
    ${n ? `<section class="tarjeta"><h2>Paradas</h2><ul class="lista">${plan.paradas.map((p, i) => `
      <li style="flex-wrap:wrap"><span class="icono" style="background:var(--acento2);color:#fff;font-weight:800">${i + 1}</span>
        <div class="cuerpo"><b>${p.cargador ? esc(p.cargador.nombre) : `Hacia el km ${num(p.km)}`}</b><span>Km ${num(p.km)} · llegas con ~${p.llegaCon} % · carga hasta el ${p.hasta} %</span></div>
        <div class="lado">${duracion(p.minutos)}</div>
        <div style="flex-basis:100%;padding-left:52px">
          ${p.cargador ? lineaCargador(p.cargador) : '<span class="muy-suave">No conozco cargadores rápidos justo en este tramo: mira el Mapa antes de salir.</span>'}
          ${p.alternativas?.length ? `<div class="muy-suave" style="margin-top:8px">Si está ocupado o roto:</div>${p.alternativas.map((a) => lineaCargador(a)).join('')}` : ''}
        </div></li>`).join('')}</ul>
      <p class="muy-suave" style="margin-top:8px">No sé si están libres ahora mismo (ninguna fuente gratuita lo publica). Por eso siempre te dejo margen para llegar al siguiente.</p></section>` : ''}
    <section class="tarjeta"><h2>Antes de salir</h2><ul class="lista">
      <li><span class="icono">🔋</span><div class="cuerpo"><b>Sal al 100 %</b><span>${COCHE.quimica === 'LFP' ? 'Tu batería LFP lo aguanta bien y te ahorras paradas.' : 'Para un viaje sí: carga al 100 % justo antes de salir (no lo dejes así días).'}</span></div></li>
      <li><span class="icono">❄️</span><div class="cuerpo"><b>Con frío, clima puesto mientras está enchufado</b><span>Con la app ${COCHE.app}, 20 min antes de salir: calienta con la luz de casa, no con tu batería.</span></div></li>
      <li><span class="icono">💳</span><div class="cuerpo"><b>Para pagar: tarjeta, QR o una app comodín</b><span>Toca un cargador en el mapa: te digo cómo se paga en ese.</span></div></li>
    </ul></section>`;

  if (!ruta || !window.L) return;
  mapa?.remove();
  mapa = L.map('mapa-viaje', { zoomControl: false });
  capaMapa(mapa);
  const linea = L.polyline(ruta, { color: '#2BB8F0', weight: 5, opacity: .9 }).addTo(mapa);
  mapa.fitBounds(linea.getBounds(), { padding: [24, 24] });
  const elegidos = new Set(plan.paradas.map((p) => p.cargador).filter(Boolean));
  // Todos los rápidos de la ruta en pequeño; los elegidos, con su número.
  for (const x of enRuta) {
    if (elegidos.has(x)) continue;
    L.circleMarker([x.lat, x.lon], { radius: 5, color: '#3FE0B0', weight: 2, fillOpacity: .6 }).on('click', () => abrirFicha(x)).addTo(mapa);
  }
  plan.paradas.forEach((p, i) => {
    const sitio = p.cargador ? [p.cargador.lat, p.cargador.lon] : null;
    if (!sitio) return;
    L.marker(sitio, { zIndexOffset: 1000, icon: L.divIcon({ className: '', html: `<div class="pin parada"><span style="color:#fff">${i + 1}</span></div>`, iconSize: [28, 28], iconAnchor: [14, 30], popupAnchor: [0, -28] }) })
      .on('click', () => abrirFicha(p.cargador)).addTo(mapa);
  });
}

// Lo que cuesta el viaje en cargas rápidas, frente a hacerlo en gasolina.
function costeViaje(km, plan) {
  const a = ajustes();
  const kwh = plan.paradas.reduce((s, p) => s + Math.max(0, p.hasta - p.llegaCon) / 100 * COCHE.util / 0.95, 0);
  const calle = kwh * a.precioRapida;
  const gasolina = km * a.gasolinaL100 / 100 * a.gasolinaPrecio;
  return `<p style="margin-top:8px"><b>${plan.paradas.length ? `≈ ${euros(calle, 0)} en cargas por el camino` : 'Sin gastar nada por el camino'}</b>
    (a ${euros(a.precioRapida)}/kWh) · en gasolina serían ≈ ${euros(gasolina, 0)}. Lo que salgas cargado de casa es aparte.</p>`;
}

export function salir() { mapa?.remove(); mapa = null; }
