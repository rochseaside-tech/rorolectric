// Viaje: ruta y paradas en cargadores rápidos REALES de la ruta (como ABRP, pero con la lista oficial).
// Las paradas se pueden cambiar a mano: parar donde quieras (y cargar lo que quieras), cambiar una por otra o quitarla;
// el resto del plan se rehace solo. «Empezar viaje» lo guarda para recalcular desde donde estés.
import { COCHE, TIPOS_VIA, ajustes, bateria, claveCargador, medido, lugares, lugarPorNombre, viajeEnCurso, guardarViaje } from '../datos.js';
import { consumo, planViaje, planConCargadores, pctAlLlegar, muestrearRuta, cargadoresEnRuta, perfilEnergia, factorViento, rumbo, VELOCIDAD } from '../calc.js';
import { enZona, cargarTodos, abrirFicha, precioKwh, precioCorto, textoFunciona, estadoAhora, resumenAhora, textoAhora, SERVICIOS } from '../cargadores.js';
import { esc, num, euros, duracion, hora, ubicacion, temperatura, campo, aviso, capaMapa, rutaEnCoche, abrirHoja, cerrarHoja } from '../comun.js';
import { montarBuscador, buscarTexto, apuntarReciente } from '../buscador.js';
import { conectado, leerCoche, ultimoDelCoche, haceCuanto } from '../coche-vivo.js';
import { esIphone } from '../operadores.js';

let form = { desde: '', hasta: '', pct: null, via: 'autovia120', llegar: 15, km: '', temp: '', parada: 12, cargarHasta: 80, minKw: 50, criterio: 'rapido', sinPeajes: false, salida: '',
  desdeSitio: null, hastaSitio: null }; // *Sitio: lo elegido en las sugerencias (con coordenadas)
let mapa = null;
let ctx = null;              // la última ruta calculada, para rehacer el plan sin volver a pedirla
let obligadas = new Map();   // paradas elegidas a mano: clave del cargador → { hasta } (hasta = null: el de «Cargar hasta»)
let evitar = new Set();      // claves de cargadores que no quiere
let filtroRuta = 'todos';

// Botones con los sitios guardados (Ajustes → Mis sitios) para rellenar «Desde» o «Hasta».
const botonesLugares = (campoDestino) => (lugares().length
  ? `<div class="chips" data-rellena="${campoDestino}" style="margin:-4px 0 12px">${lugares().map((l) => `<button type="button" class="chip" data-nombre="${esc(l.nombre)}">${esc(l.emoji || '📍')} ${esc(l.nombre)}</button>`).join('')}</div>` : '');

// Un viaje empezado hace más de un día ya no está «en curso».
const enCurso = () => { const v = viajeEnCurso(); return v && Date.now() - v.empezado < 24 * 3600e3 ? v : null; };

export function pintar(raiz, [destino] = []) {
  if (!ctx) form.pct = bateria().pct; // con un plan hecho, se queda la batería con la que se calculó
  if (destino) { form.hasta = decodeURIComponent(destino); form.desde = ''; }
  const v = enCurso();
  raiz.innerHTML = `
    <div class="titulo-pantalla"><h1>Viaje</h1><p>Dime adónde vas: te digo dónde parar, cuánto cargar y a qué hora llegas. Las paradas las puedes cambiar.</p></div>
    ${v ? `<section class="resultado" id="en-curso" style="margin-top:0">
      <div class="grande" style="font-size:19px">🚗 De viaje a ${esc(v.destino.nombre)}</div>
      <p style="margin:4px 0 10px">Salida a las ${hora(new Date(v.empezado))}${v.paradas.length ? ` · ${v.paradas.length} parada${v.paradas.length > 1 ? 's' : ''}: ${v.paradas.map((p) => esc(p.nombre)).join(' → ')}` : ' · sin paradas'}.</p>
      <div class="fila" style="flex-wrap:wrap"><button class="boton mini" id="recalcular" style="flex:1">🔄 Recalcular desde aquí</button>
        <button class="boton mini sec" id="terminar" style="flex:none;width:auto">Terminar</button></div>
      <p class="muy-suave" style="margin:8px 0 0">Recalcular usa ${conectado() ? 'la batería y la posición que diga tu coche' : 'dónde estás y la batería que pongas en «Salgo con»'}, y mantiene las paradas que elegiste.</p></section>` : ''}
    <form class="tarjeta" id="f">
      ${campo('Desde', 'desde', form.desde, { tipo: 'text', extra: 'placeholder="Vacío = donde estoy"' })}
      ${botonesLugares('desde')}
      ${campo('Hasta', 'hasta', form.hasta, { tipo: 'text', extra: 'placeholder="Ej. Zaragoza, Andorra la Vella…" required' })}
      ${botonesLugares('hasta') || '<p class="muy-suave" style="margin:-4px 0 12px">Guarda tus sitios habituales en <a href="#/ajustes">Ajustes</a> y aquí sale un botón para cada uno.</p>'}
      <div class="fila">${campo('Salgo con', 'pct', form.pct, { unidad: '%' })}${campo('Llegar con al menos', 'llegar', form.llegar, { unidad: '%' })}</div>
      <p class="muy-suave" id="pct-nota" style="margin:-6px 0 10px">${bateria().delCoche && conectado() ? `🔗 La batería la dice el coche (${esc(haceCuanto(bateria().fecha))}).` : ''}</p>
      <div class="fila">${campo('Salgo a las', 'salida', form.salida, { tipo: 'time', extra: 'placeholder="Ahora"' })}
        <label class="campo"><span>Por dónde</span><select name="via">${TIPOS_VIA.map(([k, t]) => `<option value="${k}" ${k === form.via ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="chips" style="margin:-4px 0 12px"><button type="button" class="chip ${form.sinPeajes ? 'activo' : ''}" id="peajes">🚫 Evitar peajes</button></div>
      <label class="campo"><span>Paradas</span><div class="segmento" style="margin:0" id="criterio">
        <button type="button" data-c="rapido" class="${form.criterio !== 'barato' ? 'activo' : ''}">⚡ Más rápido</button>
        <button type="button" data-c="barato" class="${form.criterio === 'barato' ? 'activo' : ''}">💶 Más barato</button></div></label>
      <button class="boton" type="submit">Planificar</button>
      <details style="margin-top:12px"><summary class="suave" style="cursor:pointer">Más opciones (temperatura, paradas…)</summary>
        <div style="margin-top:10px">
          ${campo('Temperatura del viaje (vacío = la del tiempo)', 'temp', form.temp, { unidad: '°C', paso: '1' })}
          <div class="fila">${campo('Parar a cargar con', 'parada', form.parada, { unidad: '%' })}${campo('Cargar hasta', 'cargarHasta', form.cargarHasta, { unidad: '%' })}</div>
          <label class="campo"><span>Parar solo en cargadores de</span><select name="minKw">${[[50, '50 kW o más'], [100, '100 kW o más'], [150, '150 kW o más']].map(([v2, t]) => `<option value="${v2}" ${+form.minKw === v2 ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        </div>
      </details>
      <details style="margin-top:12px"><summary class="suave" style="cursor:pointer">¿No encuentra el sitio? Pon los km a mano</summary>
        <div style="margin-top:10px">${campo('Kilómetros', 'km', form.km, { unidad: 'km' })}<button class="boton sec" type="button" id="manual">Calcular con esos km</button></div>
      </details>
    </form>
    <div id="res"></div>`;
  const f = raiz.querySelector('#f');
  const inDesde = f.querySelector('[name=desde]'), inHasta = f.querySelector('[name=hasta]');
  if (form.desdeSitio && inDesde.value === form.desdeSitio.nombre) inDesde.sitio = form.desdeSitio;
  if (form.hastaSitio && inHasta.value === form.hastaSitio.nombre) inHasta.sitio = form.hastaSitio;
  const leer = () => { form = { ...form, ...Object.fromEntries(new FormData(f)), desdeSitio: inDesde.sitio || null, hastaSitio: inHasta.sitio || null }; };
  // Destino nuevo = paradas elegidas nuevas.
  const nuevo = () => { leer(); obligadas = new Map(); evitar = new Set(); planificar(raiz); };
  f.onsubmit = (e) => { e.preventDefault(); nuevo(); };
  montarBuscador(inDesde, { conUbicacion: true });
  montarBuscador(inHasta, { alElegir: () => nuevo() }); // elegir destino ya es decir «vamos»
  f.querySelectorAll('[data-rellena]').forEach((fila) => { fila.onclick = (e) => {
    const b = e.target.closest('[data-nombre]'); if (!b) return;
    const input = f.querySelector(`[name=${fila.dataset.rellena}]`);
    input.value = b.dataset.nombre; input.sitio = null;
    fila.querySelectorAll('.chip').forEach((x) => x.classList.toggle('activo', x === b));
    // Elegir destino ya es decir «vamos»: se planifica sin pulsar el botón.
    if (fila.dataset.rellena === 'hasta') nuevo();
  }; });
  f.querySelector('#peajes').onclick = (e) => { form.sinPeajes = !form.sinPeajes; e.currentTarget.classList.toggle('activo', form.sinPeajes); };
  f.querySelector('#criterio').onclick = (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    form.criterio = b.dataset.c;
    f.querySelectorAll('#criterio button').forEach((x) => x.classList.toggle('activo', x === b));
    if (ctx) { leer(); pintarPlan(raiz); } // ya hay ruta: se rehace el plan al momento
  };
  raiz.querySelector('#manual').onclick = () => { leer(); if (+form.km > 0) { ctx = null; preparar(raiz, { km: +form.km }); } else aviso('Pon los km'); };
  raiz.querySelector('#recalcular')?.addEventListener('click', () => recalcular(raiz));
  raiz.querySelector('#terminar')?.addEventListener('click', () => { guardarViaje(null); aviso('Viaje terminado'); pintar(raiz); });
  // Con el coche conectado, «Salgo con» se pone con lo que diga el coche (si no lo ha tocado).
  if (conectado()) {
    const campoPct = f.querySelector('[name=pct]');
    let tocado = false; campoPct.oninput = () => { tocado = true; };
    leerCoche().then((e) => {
      if (e?.pct == null || tocado || !f.isConnected) return;
      campoPct.value = e.pct; form.pct = e.pct;
      raiz.querySelector('#pct-nota').textContent = `🔗 La batería la dice el coche (${haceCuanto(e.fecha)}).`;
    }).catch(() => { /* sin datos del coche: vale la de la app */ });
  }
  if (destino) nuevo();
  else if (ctx) pintarPlan(raiz); // al volver a la pestaña, el último plan sigue ahí
}

async function planificar(raiz, { origenFijo = null, destinoFijo = null } = {}) {
  const res = raiz.querySelector('#res');
  res.innerHTML = '<div class="tarjeta suave">Buscando la ruta…</div>';
  res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    // Un sitio guardado se usa tal cual (sin buscarlo en el mapa).
    const sitio = async (t) => { const l = lugarPorNombre(t); return l ? { punto: l.punto, nombre: `${l.emoji || ''} ${l.nombre}`.trim() } : buscarTexto(t); };
    const aqui = !form.desde.trim() || form.desdeSitio?.aqui;
    const origen = origenFijo || (aqui ? { punto: await ubicacion({ forzar: true }), nombre: 'donde estás' } : form.desdeSitio || await sitio(form.desde));
    if (!origen.punto) throw new Error('No sé dónde estás: escribe el «Desde» o activa la ubicación.');
    if (!destinoFijo && !form.hasta.trim()) throw new Error('Escribe adónde vas.');
    const destino = destinoFijo || form.hastaSitio || await sitio(form.hasta);
    apuntarReciente(destino);
    const r = await rutaEnCoche(origen.punto, destino.punto, { sinPeajes: form.sinPeajes });
    await preparar(raiz, { ...r, origen, destino });
  } catch (e) {
    res.innerHTML = `<div class="resultado ambar"><div class="grande">Ups</div><p>${esc(e.message || 'Sin conexión')}</p></div>`;
  }
}

// «Recalcular desde aquí»: misma meta y mismas paradas elegidas, desde donde estás con la batería de ahora.
async function recalcular(raiz) {
  const v = enCurso(); if (!v) return;
  const b = raiz.querySelector('#recalcular'); b.disabled = true; b.textContent = 'Mirando dónde estás…';
  let punto = null, pct = +raiz.querySelector('[name=pct]').value || bateria().pct;
  if (conectado()) {
    try {
      const e = await leerCoche({ forzar: true });
      if (e?.pct != null) pct = e.pct;
      if (e?.posicion && Date.now() - new Date(e.fecha) < 15 * 60e3) punto = e.posicion;
    } catch { /* sin el coche: móvil */ }
  }
  punto ||= await ubicacion({ forzar: true });
  b.disabled = false; b.textContent = '🔄 Recalcular desde aquí';
  if (!punto) { aviso('No sé dónde estás: activa la ubicación'); return; }
  form = { ...form, pct, hasta: v.hasta, desde: '' };
  raiz.querySelector('[name=pct]').value = pct;
  raiz.querySelector('[name=hasta]').value = v.hasta;
  obligadas = new Map(v.obligadas || []);
  evitar = new Set(v.evitar || []);
  planificar(raiz, { origenFijo: { punto, nombre: 'donde estás' }, destinoFijo: v.destino });
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
  return cargadoresEnRuta(muestrearRuta(ruta), zona.filter((c) => c.rapido && c.compatible && !c.clientes && !c.roto));
}

// Lo que no cambia al tocar las paradas (tiempo, viento, cargadores, alturas): se calcula una vez por ruta.
async function preparar(raiz, { km, horas, ruta, origen, destino, peajes }) {
  const res = raiz.querySelector('#res');
  res.innerHTML = '<div class="tarjeta suave">Buscando cargadores en la ruta y mirando el tiempo…</div>';
  const temp = form.temp !== '' && form.temp != null ? +form.temp : await temperatura(origen?.punto);
  // Viento de ahora en ~12 puntos de la ruta, cargadores de la ruta y desnivel: a la vez.
  const [viento, enRuta, desnivel] = await Promise.all([
    ruta ? vientoDe(ruta, km).catch(() => null) : null,      // sin datos del tiempo: sin viento
    ruta ? rapidosDeLaRuta(ruta).catch(() => []) : [],        // sin lista: plan teórico
    ruta ? desnivelDe(ruta, km).catch(() => null) : null,     // sin alturas: como si fuera llano
  ]);
  ctx = { km, horas, ruta, origen, destino, peajes, temp, viento, enRuta, desnivel };
  pintarPlan(raiz);
}

const precioDe = (x) => precioKwh(x, { rapida: true, alto: true }) ?? +ajustes().precioRapida + 0.02; // sin precio: el de Ajustes y un poco más
const kwhDe = (p) => Math.max(0, p.hasta - p.llegaCon) / 100 * COCHE.util / 0.95;
function costeParada(p) {
  if (!p.cargador) return { euros: kwhDe(p) * ajustes().precioRapida, oficial: false };
  const precio = precioKwh(p.cargador, { rapida: true, alto: true });
  return { euros: kwhDe(p) * (precio ?? ajustes().precioRapida) + (precio != null && p.hasta > p.llegaCon ? p.cargador.precio[5] || 0 : 0), oficial: precio != null };
}

function calcular() {
  const { km, ruta, temp, viento, enRuta, desnivel } = ctx;
  let c = consumo(form.via, temp, ajustes(), medido());
  if (viento) c *= viento.factor;
  const opciones = { llegarCon: +form.llegar || 10, paradaEn: Math.max(3, +form.parada || 12), cargarHasta: Math.min(100, Math.max(30, +form.cargarHasta || 80)), perfil: desnivel?.perfil };
  const validos = enRuta.filter((x) => (x.potencia || 50) >= +form.minKw);
  // Las elegidas se buscan entre TODOS los de la ruta (se puede elegir uno de menos kW que el mínimo).
  const porClave = new Map(enRuta.map((x) => [claveCargador(x), x]));
  const fijas = [...obligadas].map(([k, o]) => ({ c: porClave.get(k), hasta: o.hasta ?? undefined })).filter((o) => o.c);
  const fuera = new Set([...evitar].map((k) => porClave.get(k)).filter(Boolean));
  const planDe = (criterio) => (ruta ? planConCargadores(km, +form.pct, c, validos, { ...opciones, criterio, precioDe, obligadas: fijas, evitar: fuera }) : planViaje(km, +form.pct, c, opciones));
  const plan = planDe(form.criterio);
  const otro = ruta ? planDe(form.criterio === 'barato' ? 'rapido' : 'barato') : null;
  // OSRM calcula a velocidad legal; a 110 se tarda un poco más.
  const conduccion = ctx.horas ? ctx.horas * (form.via === 'autovia110' ? 1.06 : 1) : km / (form.via.startsWith('autovia') ? 100 : 60);
  return { c, plan, otro, opciones, conduccion };
}

// Hora de salida: la puesta («Salgo a las») o ahora. Si la hora ya pasó hace rato, es la de mañana.
function horaSalida() {
  if (!form.salida) return new Date();
  const [h, m] = form.salida.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  if (d < Date.now() - 3600e3) d.setDate(d.getDate() + 1);
  return d;
}

// Horas de cada parada: conducción repartida por km + los minutos de las paradas anteriores (5 min de enchufar y pagar).
function horario(plan, conduccion, km) {
  const salida = horaSalida(), minKm = conduccion * 60 / km;
  let parado = 0;
  const paradas = plan.paradas.map((p) => {
    const llega = new Date(salida.getTime() + (p.km * minKm + parado + (p.cargador?.desvio || 0) * 2 / 50 * 60) * 60e3);
    const estancia = p.minutos > 0 ? p.minutos + 5 : 0;
    parado += estancia + (p.cargador?.desvio || 0) * 2 / 50 * 60;
    return { llega, sale: new Date(llega.getTime() + estancia * 60e3) };
  });
  return { salida, paradas, llegada: new Date(salida.getTime() + (km * minKm + parado) * 60e3), totalMin: km * minKm + parado };
}

const lineaCargador = (c) => `${c.potencia ? `${num(c.potencia)} kW` : 'rápido'}${c.operador ? ` · ${esc(c.operador)}` : ''} · ${c.desvio < 0.3 ? 'en la misma ruta' : `a ${num(c.desvio, 1)} km de la ruta`}${c.precio ? ` · 💶 ${precioCorto(c)}` : ''}${c.servicios ? ` · ${[...c.servicios].map((s) => SERVICIOS[s]?.split(' ')[0]).filter(Boolean).join('')}` : ''}${textoFunciona(c) ? ` · ${textoFunciona(c)}` : ''}`;

// «Llegas con 34 %» a un cargador de la ruta, parando en las «paradas» de antes (sin parar en «sinParada»).
const pctLlegada = (c, sinParada = null) => Math.round(pctAlLlegar(ctx.ult.plan.paradas.filter((p) => p !== sinParada), +form.pct, ctx.ult.c, ctx.ult.perfil, c.kmRuta, c.desvio));
const botonParar = (raiz, c) => { const n = pctLlegada(c); return { texto: `＋ Parar aquí a cargar${n >= 3 ? ` (llegas con ~${n} %)` : ''}`, alPulsar: () => pararEn(raiz, c) }; };
function llegadaA(c, sinParada = null) {
  const pct = pctLlegada(c, sinParada);
  const color = pct < 5 ? 'var(--rojo)' : pct < 15 ? 'var(--ambar)' : 'var(--acento)';
  return `<span style="color:${color};font-weight:700">${pct < 3 ? 'No llegas sin parar antes' : `Llegas con ~${pct} %`}</span>`;
}

function pintarPlan(raiz) {
  const res = raiz.querySelector('#res');
  if (!ctx || !res) return;
  const { km, ruta, origen, destino, peajes, temp, viento, enRuta, desnivel } = ctx;
  const { c, plan, otro, opciones, conduccion } = calcular();
  const n = plan.paradas.length;
  const hor = horario(plan, conduccion, km);
  const tocadas = obligadas.size || evitar.size;
  ctx.ult = { c, plan, perfil: opciones.perfil };

  res.innerHTML = `
    <div class="resultado ${plan.imposible ? 'rojo' : ''}">
      <div class="grande">${plan.imposible ? 'Así no llegas' : n ? `${n} parada${n > 1 ? 's' : ''} · ${duracion(plan.minutosCarga)} cargando` : 'Sin parar a cargar'}</div>
      <p>${num(km)} km${origen ? ` desde ${esc(origen.nombre)} hasta ${esc(destino.nombre)}` : ''}. Conduciendo ${duracion(conduccion * 60)}; en total ${duracion(hor.totalMin)}.
      ${plan.llegada != null ? `<b>Llegas sobre las ${hora(hor.llegada)}</b> con un <b>${Math.round(plan.llegada)} %</b>.` : ''}</p>
      ${plan.justo ? `<p>⚠️ <b>Llegas justito</b> (con un ${Math.round(plan.llegada)} %, menos del ${num(+form.llegar)} % que pediste). No merece la pena parar casi al final; si quieres más margen, toca «＋ Añadir una parada» o sal con más batería.</p>` : ''}
      ${plan.imposible ? '<p>No encuentro cargadores rápidos suficientes en esta ruta con estas opciones. Prueba a bajar «Parar solo en cargadores de…», a salir con más batería o mira el Mapa.</p>' : ''}
      ${desnivel && desnivel.sube > 50 ? `<p>⛰️ Subes ${num(desnivel.sube)} m y bajas ${num(desnivel.baja)} m en total: ${desnivel.total >= 0 ? 'gasta' : 'recupera'} unos <b>${num(Math.abs(desnivel.total), 1)} kWh</b> (≈ ${num(Math.abs(desnivel.total) / COCHE.util * 100)} % de batería). Ya está contado tramo a tramo.</p>` : ''}
      ${viento && Math.abs(viento.factor - 1) >= 0.02 ? `<p>💨 Viento ${viento.medio > 0 ? 'de cara' : 'a favor'} ahora mismo (unos ${num(Math.abs(viento.medio) / 0.7)} km/h de media en tu dirección): ${viento.factor > 1 ? 'gastas' : 'ahorras'} un <b>${num(Math.abs(viento.factor - 1) * 100)} %</b>. Ya está contado.</p>` : ''}
      ${form.sinPeajes ? `<p>🚫 ${peajes ? 'No hay forma razonable de evitar todos los peajes: esta ruta aún tiene alguno.' : 'Ruta sin peajes.'}</p>` : ''}
      ${costeViaje(km, plan)}
      ${comparar(plan, otro)}
      <p class="muy-suave">Consumo usado: ${num(c, 1)} kWh/100 km${temp != null ? ` con ${num(temp)} °C` : ''}. ${ruta ? `${enRuta.length} cargadores rápidos a menos de 3 km de la ruta.` : ''} Paradas con al menos un ${opciones.paradaEn} %, cargando hasta el ${opciones.cargarHasta} % o lo justo para llegar, en cargadores de ${form.minKw} kW o más (cámbialo en «Más opciones»).</p>
    </div>
    ${ruta ? '<div id="mapa-viaje" class="mapa bajo"></div>' : ''}
    <section class="tarjeta"><div class="tarjeta-cab"><h2>Itinerario</h2>${tocadas ? '<button class="boton mini sec" id="reiniciar" style="width:auto">Volver a las paradas automáticas</button>' : ''}</div>
      <ul class="lista itinerario">
        <li><span class="icono">🏁</span><div class="cuerpo"><b>Salida · ${hora(hor.salida)}</b><span>${origen ? esc(origen.nombre) : 'Origen'} con un ${num(+form.pct)} %</span></div></li>
        ${plan.paradas.map((p, i) => {
          const h = hor.paradas[i], k = p.cargador ? claveCargador(p.cargador) : '';
          const coste = costeParada(p);
          return `<li style="flex-wrap:wrap" data-i="${i}"><span class="icono" style="background:${p.fija ? 'var(--ambar)' : 'var(--acento2)'};color:#fff;font-weight:800">${i + 1}</span>
          <div class="cuerpo"><b>${p.cargador ? `<a href="#" data-ficha="${i}" style="color:inherit">${esc(p.cargador.nombre)}</a>` : `Hacia el km ${num(p.km)}`}</b>
            <span>${hora(h.llega)} · km ${num(p.km)} · llegas con ~${p.llegaCon} %${p.fija ? ' · elegida por ti' : ''}</span>
            ${p.cargador ? `<span class="muy-suave">${lineaCargador(p.cargador)}</span><span class="muy-suave" data-ahora="${i}"></span>` : '<span class="muy-suave">No conozco cargadores rápidos justo en este tramo: mira el Mapa antes de salir.</span>'}</div>
          <div class="lado" style="text-align:right">${p.minutos ? duracion(p.minutos) : '—'}<br><span class="muy-suave">${p.minutos ? `≈ ${euros(coste.euros, 0)}` : ''}</span></div>
          ${p.cargador ? `<div class="parada-mandos">
            <span class="suave">Cargar hasta</span>
            <button type="button" class="chip" data-menos="${k}" aria-label="Menos">−</button><b style="min-width:52px;text-align:center">${p.hasta} %</b><button type="button" class="chip" data-mas="${k}" aria-label="Más">＋</button>
            <span style="flex:1"></span>
            <button type="button" class="boton mini sec" data-cambiar="${i}" style="width:auto">Cambiar</button>
            <button type="button" class="boton mini sec" data-quitar="${k}" style="width:auto" aria-label="Quitar parada">✕</button>
            <span class="muy-suave" style="flex-basis:100%">Sales a las ${hora(h.sale)}${p.minutos ? ` · ${coste.oficial ? 'precio oficial de REVE' : `a ${euros(ajustes().precioRapida)}/kWh (sin precio publicado)`}` : ' · aquí no hace falta cargar'}</span>
          </div>` : ''}</li>`;
        }).join('')}
        <li><span class="icono">📍</span><div class="cuerpo"><b>Llegada · ${plan.llegada != null ? hora(hor.llegada) : '—'}</b><span>${destino ? esc(destino.nombre) : 'Destino'}${plan.llegada != null ? ` con un ${Math.round(plan.llegada)} %` : ''}</span></div></li>
      </ul>
      <p class="muy-suave" style="margin-top:8px">Toca «Cambiar» para parar en otro cargador, ＋/− para cargar más o menos, o elige cualquier cargador de la ruta (abajo o en el mapa) con «Parar aquí». El resto del plan se rehace solo y siempre te deja margen para llegar al siguiente.</p>
      ${ruta ? `<div class="botones">${!plan.imposible ? '<button class="boton" id="empezar">▶ Empezar viaje</button>' : ''}
        ${enRuta.length ? '<button class="boton sec" id="anadir">＋ Añadir una parada (ver todos los cargadores de la ruta)</button>' : ''}</div>` : ''}
    </section>
    ${ruta ? `<details class="guia" id="de-la-ruta"><summary><span class="emoji">⚡</span>Todos los cargadores de la ruta (${enRuta.length}): elige dónde parar</summary><div class="dentro">
      <div class="chips" id="filtro-ruta" style="margin-bottom:10px">${[['todos', 'Todos'], ['150', '150 kW o más'], ['barato', '💶 Más baratos'], ['cafe', '☕ Con cafetería'], ['libre', '✅ Sin averías']].map(([k, t]) => `<button type="button" class="chip ${k === filtroRuta ? 'activo' : ''}" data-filtro="${k}">${t}</button>`).join('')}</div>
      <ul class="lista" id="lista-ruta"></ul></div></details>` : ''}
    <section class="tarjeta"><h2>Antes de salir</h2><ul class="lista">
      <li><span class="icono">🔋</span><div class="cuerpo"><b>Sal ${COCHE.quimica === 'LFP' ? 'al 100 %' : 'cargado'}</b><span>${COCHE.quimica === 'LFP' ? 'Tu batería LFP lo aguanta bien y te ahorras paradas.' : 'Para un viaje sí: carga al 100 % justo antes de salir (no lo dejes así días).'}</span></div></li>
      <li><span class="icono">❄️</span><div class="cuerpo"><b>Con frío, clima puesto mientras está enchufado</b><span>Con la app ${COCHE.app}, 20 min antes de salir: calienta con la luz de casa, no con tu batería.</span></div></li>
      <li><span class="icono">🔥</span><div class="cuerpo"><b>Llega a la parada con la batería caliente</b><span>En invierno, conducir por autovía justo antes de cargar la calienta y carga más rápido. ${COCHE.marca === 'Deepal' ? 'Si tu S05 tiene «precalentar batería» en el menú de carga, actívalo 20-30 min antes de la parada.' : ''}</span></div></li>
      <li><span class="icono">💳</span><div class="cuerpo"><b>Para pagar: tarjeta, QR o una app comodín</b><span>Toca una parada: te digo cómo se paga en ese cargador.</span></div></li>
    </ul></section>`;

  montarMandos(raiz, plan);
  if (ruta) { pintarListaRuta(raiz, plan); montarMapa(plan); libresDeParadas(raiz, plan); }
}

// Botones del itinerario: ＋/−, Cambiar, ✕, nombre (ficha), Empezar y Volver a lo automático.
function montarMandos(raiz, plan) {
  const res = raiz.querySelector('#res');
  const rehacer = () => { const y = window.scrollY; pintarPlan(raiz); window.scrollTo(0, y); };
  res.querySelector('#reiniciar')?.addEventListener('click', () => { obligadas = new Map(); evitar = new Set(); rehacer(); });
  res.querySelectorAll('[data-mas],[data-menos]').forEach((b) => { b.onclick = () => {
    const k = b.dataset.mas || b.dataset.menos;
    const p = plan.paradas.find((x) => x.cargador && claveCargador(x.cargador) === k);
    const hasta = Math.max(p.llegaCon, Math.min(100, (Math.round(p.hasta / 5) * 5) + (b.dataset.mas ? 5 : -5)));
    obligadas.set(k, { hasta }); rehacer();
  }; });
  res.querySelectorAll('[data-quitar]').forEach((b) => { b.onclick = () => { obligadas.delete(b.dataset.quitar); evitar.add(b.dataset.quitar); aviso('Parada quitada: busco otra'); rehacer(); }; });
  res.querySelectorAll('[data-cambiar]').forEach((b) => { b.onclick = () => abrirCambiar(raiz, plan, +b.dataset.cambiar); });
  res.querySelectorAll('[data-ficha]').forEach((a) => { a.onclick = (e) => {
    e.preventDefault();
    const p = plan.paradas[+a.dataset.ficha];
    abrirFicha(p.cargador, { boton: { texto: '✕ No parar aquí', alPulsar: () => { const k = claveCargador(p.cargador); obligadas.delete(k); evitar.add(k); rehacer(); } } });
  }; });
  res.querySelector('#empezar')?.addEventListener('click', () => empezar(plan));
  res.querySelector('#anadir')?.addEventListener('click', () => { const d = res.querySelector('#de-la-ruta'); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

// Elegir una parada: se queda fija (si ya lo era, con su «cargar hasta») y se deja de evitar.
function pararEn(raiz, c, { sustituye = null } = {}) {
  const k = claveCargador(c);
  let hasta = null;
  if (sustituye) {
    const ks = claveCargador(sustituye.cargador);
    if (sustituye.fija) hasta = obligadas.get(ks)?.hasta ?? null;
    obligadas.delete(ks); evitar.add(ks);
  }
  evitar.delete(k);
  obligadas.set(k, { hasta });
  aviso(`Parada en ${c.nombre}`);
  const y = window.scrollY; pintarPlan(raiz); window.scrollTo(0, y);
}

// «Cambiar»: otros cargadores cerca de esa parada (60 km antes o después), con lo que importa para decidir.
function abrirCambiar(raiz, plan, i) {
  const p = plan.paradas[i];
  const usados = new Set(plan.paradas.map((x) => x.cargador).filter(Boolean));
  const desde = i ? plan.paradas[i - 1].km + 3 : 3, hastaKm = plan.paradas[i + 1]?.km ?? ctx.km;
  const cerca = ctx.enRuta.filter((c) => !usados.has(c) && c.kmRuta > Math.max(desde, p.km - 60) && c.kmRuta < Math.min(hastaKm, p.km + 60))
    .sort((a, b) => Math.abs(a.kmRuta - p.km) - Math.abs(b.kmRuta - p.km)).slice(0, 25).sort((a, b) => a.kmRuta - b.kmRuta);
  abrirHoja(`<h2>Cambiar la parada ${i + 1}</h2>
    <p class="suave" style="margin-top:0">Ahora: <b>${esc(p.cargador.nombre)}</b> (km ${num(p.km)}). Cargadores rápidos de la ruta cerca de ahí:</p>
    ${cerca.length ? `<ul class="lista">${cerca.map((c, j) => `<li style="flex-wrap:wrap"><span class="icono" style="font-size:13px;font-weight:800">km<br>${num(c.kmRuta)}</span>
      <div class="cuerpo"><b>${esc(c.nombre)}</b><span>${llegadaA(c, p)}${c.kmRuta < p.km ? ` · ${num(p.km - c.kmRuta)} km antes` : ` · ${num(c.kmRuta - p.km)} km después`}</span><span class="muy-suave" style="display:block">${lineaCargador(c)}</span></div>
      <div class="lado"><button class="boton mini" data-elegir="${j}" style="width:auto">Parar aquí</button></div></li>`).join('')}</ul>`
    : '<p class="suave">No hay más cargadores rápidos cerca de esta parada en la ruta.</p>'}
    <p class="muy-suave">Si eliges uno más lejos de lo que da la batería, te meto otra parada antes.</p>`, (caja) => {
    caja.onclick = (e) => { const b = e.target.closest('[data-elegir]'); if (b) { cerrarHoja(); pararEn(raiz, cerca[+b.dataset.elegir], { sustituye: p }); } };
  });
}

// Lista de todos los cargadores de la ruta, con filtros, para elegir dónde parar.
function pintarListaRuta(raiz, plan) {
  const el = raiz.querySelector('#lista-ruta'); if (!el) return;
  const enPlan = new Map(plan.paradas.filter((p) => p.cargador).map((p, i) => [p.cargador, i + 1]));
  let lista = [...ctx.enRuta];
  if (filtroRuta === '150') lista = lista.filter((c) => (c.potencia || 0) >= 150);
  if (filtroRuta === 'cafe') lista = lista.filter((c) => (c.servicios || '').includes('r'));
  if (filtroRuta === 'libre') lista = lista.filter((c) => c.funcion && c.funcion[1] && !c.funcion[0]);
  if (filtroRuta === 'barato') lista = lista.filter((c) => precioKwh(c, { rapida: true, alto: true }) != null).sort((a, b) => precioDe(a) - precioDe(b)).slice(0, 30);
  else lista.sort((a, b) => a.kmRuta - b.kmRuta);
  el.innerHTML = lista.length ? lista.slice(0, 80).map((c, j) => `<li style="flex-wrap:wrap"><span class="icono" style="font-size:13px;font-weight:800">km<br>${num(c.kmRuta)}</span>
    <div class="cuerpo"><b><a href="#" data-ver="${j}" style="color:inherit">${esc(c.nombre)}</a></b><span>${enPlan.has(c) ? '' : llegadaA(c)}</span><span class="muy-suave" style="display:block">${lineaCargador(c)}</span></div>
    <div class="lado">${enPlan.has(c) ? `<span class="chip activo">Parada ${enPlan.get(c)}</span>` : `<button class="boton mini sec" data-parar="${j}" style="width:auto">＋ Parar</button>`}</div></li>`).join('')
    : '<li class="suave">Ninguno con este filtro.</li>';
  el.onclick = (e) => {
    const b = e.target.closest('[data-parar]');
    if (b) { pararEn(raiz, lista[+b.dataset.parar]); return; }
    const a = e.target.closest('[data-ver]');
    if (a) { e.preventDefault(); const c = lista[+a.dataset.ver]; abrirFicha(c, enPlan.has(c) ? {} : { boton: botonParar(raiz, c) }); }
  };
  raiz.querySelector('#filtro-ruta').onclick = (e) => {
    const b = e.target.closest('[data-filtro]'); if (!b) return;
    filtroRuta = b.dataset.filtro;
    raiz.querySelectorAll('#filtro-ruta .chip').forEach((x) => x.classList.toggle('activo', x === b));
    pintarListaRuta(raiz, plan);
  };
}

function montarMapa(plan) {
  const raiz = document.getElementById('app');
  if (!window.L || !document.getElementById('mapa-viaje')) return;
  mapa?.remove();
  mapa = L.map('mapa-viaje', { zoomControl: false });
  capaMapa(mapa);
  const linea = L.polyline(ctx.ruta, { color: '#2BB8F0', weight: 5, opacity: .9 }).addTo(mapa);
  mapa.fitBounds(linea.getBounds(), { padding: [24, 24] });
  const elegidos = new Set(plan.paradas.map((p) => p.cargador).filter(Boolean));
  // Todos los rápidos de la ruta en pequeño (tocar = ficha con «Parar aquí»); los elegidos, con su número.
  for (const x of ctx.enRuta) {
    if (elegidos.has(x)) continue;
    L.circleMarker([x.lat, x.lon], { radius: 5, color: '#3FE0B0', weight: 2, fillOpacity: .6 })
      .on('click', () => abrirFicha(x, { boton: botonParar(raiz, x) })).addTo(mapa);
  }
  plan.paradas.forEach((p, i) => {
    if (!p.cargador) return;
    L.marker([p.cargador.lat, p.cargador.lon], { zIndexOffset: 1000, icon: L.divIcon({ className: '', html: `<div class="pin parada"><span style="color:#fff">${i + 1}</span></div>`, iconSize: [28, 28], iconAnchor: [14, 30], popupAnchor: [0, -28] }) })
      .on('click', () => abrirFicha(p.cargador)).addTo(mapa);
  });
}

// ¿Libres ahora? (REVE al momento, vía el intermediario): las paradas de España, hasta 5 emplazamientos.
async function libresDeParadas(raiz, plan) {
  const ids = [...new Set(plan.paradas.flatMap((p) => p.cargador?.reves || []))].slice(0, 5);
  plan.paradas.forEach((p, i) => {
    const el = raiz.querySelector(`[data-ahora="${i}"]`);
    const t = p.cargador?.ahora && textoAhora(p.cargador.ahora); // Francia y Portugal: lo de la última hora
    if (el && t) el.textContent = `${t} (según ${p.cargador.ahora.fuente})`;
  });
  if (!ids.length) return;
  try {
    const datos = await estadoAhora(ids);
    plan.paradas.forEach((p, i) => {
      const el = raiz.querySelector(`[data-ahora="${i}"]`);
      const t = p.cargador?.reves && textoAhora(resumenAhora(p.cargador, datos));
      if (el && t) el.textContent = `${t} (REVE, al momento)`;
    });
    // Una parada automática que está fuera de servicio ahora mismo: se cambia sola por otra.
    const rota = plan.paradas.find((p) => !p.fija && p.cargador?.reves && (() => { const t = resumenAhora(p.cargador, datos); return t && !t.libres && t.fuera && t.fuera + t.sin >= t.total; })());
    if (rota && raiz.querySelector('#res')) {
      evitar.add(claveCargador(rota.cargador));
      aviso(`${rota.cargador.nombre} está fuera de servicio ahora: he buscado otra parada`);
      pintarPlan(raiz);
    }
  } catch { /* sin respuesta: sin «libre ahora» */ }
}

// «Empezar viaje»: se guarda (para recalcular por el camino) y se abre el navegador con las paradas.
function empezar(plan) {
  const paradas = plan.paradas.filter((p) => p.cargador);
  guardarViaje({
    empezado: Date.now(), hasta: form.hasta, destino: { nombre: ctx.destino.nombre, punto: ctx.destino.punto },
    paradas: paradas.map((p) => ({ nombre: p.cargador.nombre, lat: p.cargador.lat, lon: p.cargador.lon, km: p.km, hasta: p.hasta })),
    obligadas: [...obligadas], evitar: [...evitar],
  });
  const [la, lo] = ctx.destino.punto;
  const puntos = paradas.map((p) => `${p.cargador.lat},${p.cargador.lon}`).join('|');
  const google = `https://www.google.com/maps/dir/?api=1&destination=${la},${lo}${puntos ? `&waypoints=${encodeURIComponent(puntos)}` : ''}&travelmode=driving`;
  const primera = paradas[0]?.cargador;
  const sig = primera ? [primera.lat, primera.lon] : [la, lo];
  abrirHoja(`<h2>¡Buen viaje!</h2>
    <p class="suave" style="margin-top:0">He guardado el plan. Si por el camino algo cambia (tráfico, frío, una parada ocupada), vuelve a Viaje y toca <b>«Recalcular desde aquí»</b>.</p>
    <div class="botones">
      <a class="boton" href="${google}" target="_blank" rel="noopener">Google Maps con ${paradas.length ? `las ${paradas.length} paradas` : 'la ruta'}</a>
      <a class="boton sec" href="https://waze.com/ul?ll=${sig[0]},${sig[1]}&navigate=yes" target="_blank" rel="noopener">Waze ${primera ? 'a la primera parada' : 'al destino'}</a>
      ${esIphone() ? `<a class="boton sec" href="https://maps.apple.com/?daddr=${sig[0]},${sig[1]}" target="_blank" rel="noopener">Apple Maps ${primera ? 'a la primera parada' : 'al destino'}</a>` : ''}
    </div>
    <p class="muy-suave">Google Maps es el único que acepta todas las paradas de una vez; Waze y Apple Maps, de una en una.</p>`, (caja) => {
    caja.addEventListener('click', (e) => { if (e.target.closest('a')) setTimeout(() => cerrarHoja({ sinAnimar: true }), 300); });
  });
  const res = document.querySelector('#res');
  if (res) pintar(document.getElementById('app'));
}

// Lo que cuesta el viaje en cargas rápidas, frente a hacerlo en gasolina.
function costeViaje(km, plan) {
  const a = ajustes();
  // Con el precio de REVE de cada parada si lo hay (el más caro de su horquilla, para no quedarse corto); si no, el de Ajustes.
  const conCarga = plan.paradas.filter((p) => p.minutos > 0);
  const n = conCarga.length;
  const calle = conCarga.reduce((s, p) => s + costeParada(p).euros, 0), conReve = conCarga.filter((p) => costeParada(p).oficial).length;
  const base = !n ? '' : conReve === n ? '(con el precio oficial de cada parada)' : conReve ? `(${conReve} de ${n} paradas con su precio oficial; el resto a ${euros(a.precioRapida)}/kWh)` : `(a ${euros(a.precioRapida)}/kWh)`;
  const gasolina = km * a.gasolinaL100 / 100 * a.gasolinaPrecio;
  return `<p style="margin-top:8px"><b>${n ? `≈ ${euros(calle, 0)} en cargas por el camino` : 'Sin gastar nada por el camino'}</b>
    ${base} · en gasolina serían ≈ ${euros(gasolina, 0)}. Lo que salgas cargado de casa es aparte.</p>`;
}

const costeTotal = (plan) => plan.paradas.reduce((s, p) => s + costeParada(p).euros, 0);

// La otra forma de hacer el viaje (más rápida o más barata), para que se vea lo que se gana o se pierde.
function comparar(plan, otro) {
  if (!otro || plan.imposible || otro.imposible || !plan.paradas.length) return '';
  const e = costeTotal(otro) - costeTotal(plan), m = otro.minutosCarga - plan.minutosCarga;
  if (Math.abs(e) < 1 && Math.abs(m) < 3) return `<p class="muy-suave">${form.criterio === 'barato' ? 'La opción «más rápido» sale' : 'La opción «más barato» sale'} prácticamente igual.</p>`;
  const nombre = form.criterio === 'barato' ? '⚡ Más rápido' : '💶 Más barato';
  const partes = [Math.abs(e) >= 1 && (e > 0 ? `pagarías ${euros(e, 0)} más` : `ahorrarías ${euros(-e, 0)}`), Math.abs(m) >= 3 && (m > 0 ? `estarías ${duracion(m)} más cargando` : `cargarías ${duracion(-m)} menos`)].filter(Boolean);
  return `<p class="muy-suave">Con «${nombre}»: ${partes.join(' y ')}${otro.paradas.length !== plan.paradas.length ? ` (${otro.paradas.length} paradas)` : ''}.</p>`;
}

// Viento de ahora (Open-Meteo, gratis) en puntos repartidos por la ruta.
async function vientoDe(ruta, km) {
  const m = muestrearRuta(ruta, Math.max(5, km / 12));
  if (m.length < 2) return null;
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${m.map((x) => x.p[0].toFixed(3)).join(',')}&longitude=${m.map((x) => x.p[1].toFixed(3)).join(',')}&current=wind_speed_10m,wind_direction_10m`);
  if (!r.ok) throw new Error('sin viento');
  const d = await r.json();
  const lista = Array.isArray(d) ? d : [d];
  const tramos = [];
  for (let i = 0; i < m.length - 1; i++) {
    const w = lista[i]?.current; if (!w) continue;
    tramos.push({ km: m[i + 1].km - m[i].km, rumbo: rumbo(m[i].p, m[i + 1].p), viento: w.wind_speed_10m, desde: w.wind_direction_10m });
  }
  return factorViento(tramos, VELOCIDAD[form.via] || 100);
}

export function salir() { mapa?.remove(); mapa = null; }
