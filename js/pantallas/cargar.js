// Cargar: en casa (la hora más barata), en la calle (cuánto tarda y cuánto cuesta) y
// «Cargando ahora» (el % en directo, a qué hora acaba y lo que lleva gastado).
import { COCHE, CARGADORES_CASA, ajustes, bateria, cambiarAjuste, sesion, empezarSesion, terminarSesion } from '../datos.js';
import { horasAC, kwhRedAC, kwhRedDC, minutosDC, ventanaBarata, costeAhora, preciosTarifa, pctTrasMinutos, tramo } from '../calc.js';
import { esc, num, euros, hora, duracion, preciosPVPC, campo, anillo, aviso } from '../comun.js';
import { abrirFormCarga } from './diario.js';
import { conectado, leerCoche, ultimoDelCoche, haceCuanto } from '../coche-vivo.js';

let modo = 'casa', reloj = null, deCargador = null;

// Desde la ficha de un cargador del mapa: «Cargo aquí».
export function cargarAqui(c) { deCargador = c; modo = 'ahora'; location.hash = '#/cargar'; }
let precios = null, errorPrecios = null, preciosHora = 0;

export function pintar(raiz) {
  clearInterval(reloj);
  if (sesion() && !pintar.visto) { modo = 'ahora'; pintar.visto = true; }
  raiz.innerHTML = `
    <div class="titulo-pantalla"><h1>Cargar</h1></div>
    <div class="segmento" id="modo">
      <button data-m="casa" class="${modo === 'casa' ? 'activo' : ''}">🏠 Casa</button>
      <button data-m="calle" class="${modo === 'calle' ? 'activo' : ''}">⚡ Calle</button>
      <button data-m="ahora" class="${modo === 'ahora' ? 'activo' : ''}">${sesion() ? '🟢' : '⏱️'} Ahora</button>
    </div>
    <div id="cuerpo"></div>`;
  raiz.querySelector('#modo').onclick = (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    modo = b.dataset.m; pintar(raiz);
  };
  ({ casa, calle, ahora: (el) => ahora(el, raiz) })[modo](raiz.querySelector('#cuerpo'));
}

export function salir() { clearInterval(reloj); }

/* ---------- Cargando ahora ---------- */
function precioCasaAhora() {
  const a = ajustes();
  if (a.tarifa === 'fija') return +a.precioFijo;
  if (a.tarifa === 'tramos') return +a.tramos[tramo(new Date())];
  const p = precios?.find((x) => x.hora.getTime() <= Date.now() && x.hora.getTime() + 3600e3 > Date.now());
  return p ? +p.eur.toFixed(3) : 0.15;
}

function ahora(el, raiz) {
  const s = sesion();
  if (!s) return empezar(el, raiz);
  const pinta = () => {
    const min = (Date.now() - s.inicio) / 60e3;
    // Con el coche conectado (MyChangan) y un dato reciente, manda lo que dice el coche; si no, la estimación.
    const v = conectado() && ultimoDelCoche();
    const real = v && v.pct != null && new Date(v.fecha).getTime() >= s.inicio - 5 * 60e3 && Date.now() - new Date(v.fecha) < 20 * 60e3 ? v : null;
    const estimado = Math.min(s.a, pctTrasMinutos(s.de, s.kw, s.ac, min));
    const pct = real ? Math.max(real.pct, s.de) : estimado;
    const kwh = s.ac ? kwhRedAC(s.de, pct) : kwhRedDC(s.de, pct);
    const total = s.ac ? horasAC(s.de, s.a, s.kw) * 60 : minutosDC(s.de, s.a, s.kw);
    const fin = real?.carga?.minutos ? new Date(new Date(real.fecha).getTime() + real.carga.minutos * 60e3) : new Date(s.inicio + total * 60e3);
    const hecho = pct >= s.a - 0.05 || (real && real.carga?.estado && real.carga.estado !== 'cargando' && pct > s.de);
    el.innerHTML = `
      <section class="tarjeta heroe">
        <div class="anillo">${anillo(pct)}<div class="anillo-centro"><b>${Math.floor(pct)}<small>%</small></b><span>${hecho ? '¡lista!' : 'cargando'}</span></div></div>
        <div class="km-grande">${hecho ? 'Ya debería estar al ' + s.a + ' %' : `Al ${s.a} % sobre las <em>${hora(fin)}</em>`}</div>
        <div class="muy-suave">${hecho ? (real ? `El coche dice que ya no carga (${real.pct} %). Dale a «He terminado».` : 'Mira el coche y dale a «He terminado».') : `Faltan ${duracion(Math.max(0, (fin - Date.now()) / 60e3))} · ${esc(s.sitio || (s.lugar === 'casa' ? 'En casa' : 'En la calle'))} · ${num(s.kw, s.kw % 1 ? 1 : 0)} kW`}</div>
        ${real ? `<div class="muy-suave" style="margin-top:4px">🔗 El % lo dice tu coche (${esc(haceCuanto(real.fecha))})</div>` : ''}
        <div class="rejilla" style="margin-top:14px;text-align:left">
          <div class="dato"><b>${duracion(min)}</b><span>enchufado</span></div>
          <div class="dato"><b>${num(kwh, 1)} kWh</b><span>cargados</span></div>
          <div class="dato verde"><b>${euros(kwh * s.precio)}</b><span>llevas gastado</span></div>
          <div class="dato"><b>+${num(Math.max(0, (pct - s.de) / 100 * COCHE.util / COCHE.consumo.mixto * 100))} km</b><span>de autonomía</span></div>
        </div>
      </section>
      <div class="botones">
        <button class="boton" id="fin">He terminado · apuntar en Gastos</button>
        <button class="boton peligro" id="cancelar">Cancelar (no apuntar nada)</button>
      </div>
      ${real ? '' : `<p class="muy-suave" style="margin-top:10px">Es una estimación con la curva de carga típica de tu coche: el % de verdad es el que marca el coche${COCHE.app ? ` o la app ${esc(COCHE.app)}` : ''}. Al apuntarla puedes corregirlo.</p>`}`;
    el.querySelector('#fin').onclick = () => {
      terminarSesion(); clearInterval(reloj);
      abrirFormCarga({ lugar: s.lugar, sitio: s.sitio, desde: s.de, hasta: Math.round(pct), kwh: kwh.toFixed(1), euros: (kwh * s.precio).toFixed(2), operador: s.operador, cargadorK: s.cargadorK });
      pintar(raiz);
    };
    el.querySelector('#cancelar').onclick = () => { terminarSesion(); clearInterval(reloj); aviso('Carga cancelada'); pintar(raiz); };
  };
  pinta();
  // Cada 15 s se repinta; al coche se le pregunta como mucho cada 3 min (leerCoche ya lo limita).
  const alCoche = () => { if (conectado()) leerCoche().then(() => { if (el.isConnected && sesion()) pinta(); }).catch(() => {}); };
  alCoche();
  reloj = setInterval(() => { if (!el.isConnected) { clearInterval(reloj); return; } pinta(); alCoche(); }, 15000);
}

function empezar(el, raiz) {
  const a = ajustes();
  const pre = deCargador; deCargador = null;
  // Si el coche (MyChangan) dice que está cargando en rápida, se empieza en «calle».
  const v = conectado() && ultimoDelCoche();
  let lugar = pre || v?.carga?.dc ? 'calle' : 'casa', kw = pre ? Math.min(pre.kw || 50, 400) : lugar === 'calle' ? 150 : +a.cargadorCasa;
  const dibuja = () => {
    const casaSi = lugar === 'casa';
    el.innerHTML = `
      <section class="tarjeta">
        <h2>Empiezo a cargar</h2>
        <p class="suave">Te enseño el % en directo, a qué hora acaba y lo que llevas gastado. Al terminar se apunta sola en Gastos.</p>
        <div class="segmento" id="donde" style="margin-top:12px">
          <button data-l="casa" class="${casaSi ? 'activo' : ''}">🏠 En casa</button><button data-l="calle" class="${casaSi ? '' : 'activo'}">⚡ En la calle</button>
        </div>
        ${casaSi ? `<label class="campo"><span>Con qué cargas</span><select name="kw">${CARGADORES_CASA.map(([k, t]) => `<option value="${k}" ${k === kw ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`
          : `<label class="campo"><span>Potencia del cargador (lo pone en el poste)</span><div class="chips" id="kws">${[...new Set([22, 50, 100, 150, 300, kw])].sort((x, y) => x - y).map((k) => `<button type="button" class="chip ${k === kw ? 'activo' : ''}" data-kw="${k}">${k} kW</button>`).join('')}</div></label>
             ${campo('Sitio (opcional)', 'sitio', pre?.sitio || '', { tipo: 'text', extra: 'placeholder="Ej. Zunder Fraga"' })}`}
        <div class="fila">${campo('Ahora tiene', 'de', bateria().pct, { unidad: '%' })}${campo('Hasta', 'a', casaSi ? a.objetivoCasa : 80, { unidad: '%' })}</div>
        ${campo('Precio', 'precio', casaSi ? precioCasaAhora() : (kw <= 22 ? a.precioLenta : a.precioRapida), { unidad: '€/kWh' })}
        <button class="boton" id="vamos">▶ Empezar</button>
      </section>`;
    el.querySelector('#donde').onclick = (e) => {
      const b = e.target.closest('[data-l]'); if (!b) return;
      lugar = b.dataset.l; kw = lugar === 'casa' ? +a.cargadorCasa : 150; dibuja();
    };
    el.querySelector('#kws')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kw]'); if (!b) return;
      kw = +b.dataset.kw;
      el.querySelectorAll('#kws .chip').forEach((x) => x.classList.toggle('activo', x === b));
      el.querySelector('[name=precio]').value = kw <= 22 ? a.precioLenta : a.precioRapida;
    });
    el.querySelector('#vamos').onclick = () => {
      const v = (n) => el.querySelector(`[name=${n}]`)?.value;
      const de = Math.max(0, Math.min(99, +v('de'))), hasta = Math.max(de + 1, Math.min(100, +v('a')));
      if (lugar === 'casa') kw = +v('kw');
      const ac = lugar === 'casa' || kw <= 22;
      empezarSesion({ de, a: hasta, kw, ac, precio: +v('precio') || 0, lugar: lugar === 'casa' ? 'casa' : ac ? 'lenta' : 'rapida', sitio: v('sitio') || '', operador: pre?.operador || '', cargadorK: pre?.cargadorK || '' });
      pintar(raiz);
    };
  };
  dibuja();
}

/* ---------- En casa ---------- */
function casa(el) {
  const a = ajustes();
  const listo = new Date(); listo.setHours(8, 0, 0, 0); if (listo < new Date()) listo.setDate(listo.getDate() + 1);
  el.innerHTML = `
    <section class="tarjeta">
      <div class="fila">
        ${campo('Ahora tiene', 'de', bateria().pct, { unidad: '%' })}
        ${campo('Cargar hasta', 'a', a.objetivoCasa, { unidad: '%' })}
      </div>
      <label class="campo"><span>Con qué cargas</span><select name="kw">
        ${CARGADORES_CASA.map(([kw, t]) => `<option value="${kw}" ${kw === +a.cargadorCasa ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <label class="campo" style="margin:0"><span>Lo necesito listo a las</span><input name="listo" type="time" value="08:00"></label>
    </section>
    <div id="res"><div class="tarjeta suave">Calculando…</div></div>`;
  const leer = () => {
    const f = (n) => el.querySelector(`[name=${n}]`).value;
    const [hh, mm] = (f('listo') || '08:00').split(':').map(Number);
    const limite = new Date(); limite.setHours(hh, mm, 0, 0); if (limite <= new Date()) limite.setDate(limite.getDate() + 1);
    return { de: Math.max(0, Math.min(100, +f('de'))), a: Math.max(0, Math.min(100, +f('a'))), kw: +f('kw'), limite };
  };
  el.oninput = el.onchange = (e) => {
    if (e.target.name === 'kw') cambiarAjuste('cargadorCasa', +e.target.value);
    if (e.target.name === 'a' && e.type === 'change') cambiarAjuste('objetivoCasa', +e.target.value);
    resultadoCasa(el.querySelector('#res'), leer());
  };
  // Se vuelven a pedir cada media hora (a las 20:30 salen los de mañana; y al cambiar de día).
  if (a.tarifa === 'pvpc' && (!precios || Date.now() - preciosHora > 30 * 60e3)) {
    preciosPVPC().then((p) => { precios = p; preciosHora = Date.now(); errorPrecios = null; }).catch((e) => { errorPrecios = e.message; })
      .finally(() => { if (el.isConnected) resultadoCasa(el.querySelector('#res'), leer()); });
  }
  resultadoCasa(el.querySelector('#res'), leer());
}

function resultadoCasa(el, { de, a, kw, limite }) {
  const aj = ajustes();
  if (a <= de) { el.innerHTML = '<div class="tarjeta suave">Pon un «hasta» mayor que lo que tiene ahora.</div>'; return; }
  const kwh = kwhRedAC(de, a);
  const horas = horasAC(de, a, kw);
  const potencia = Math.min(kw, COCHE.acMax);
  const datos = `<div class="rejilla" style="margin-bottom:14px">
      <div class="dato"><b>${duracion(horas * 60)}</b><span>de carga</span></div>
      <div class="dato"><b>${num(kwh, 1)} kWh</b><span>que pagas (con pérdidas)</span></div>
    </div>`;

  if (aj.tarifa === 'fija') {
    el.innerHTML = `<div class="resultado"><div class="grande">${euros(kwh * aj.precioFijo)}</div>
      <p>Con tu precio fijo de ${euros(aj.precioFijo, 3)}/kWh da igual la hora: enchufa cuando te venga bien.</p></div>${datos}${botonApuntar(kwh, kwh * aj.precioFijo, de, a)}`;
    enlazarApuntar(el);
    return;
  }

  let lista;
  if (aj.tarifa === 'pvpc') {
    if (errorPrecios) { el.innerHTML = `<div class="resultado ambar"><div class="grande">Sin precios ahora</div><p>No llego a Red Eléctrica (${esc(errorPrecios)}). Si es entre semana, carga de 0 a 8 h: es la franja barata.</p></div>${datos}`; return; }
    if (!precios) { el.innerHTML = `<div class="tarjeta suave">Pidiendo los precios de la luz a Red Eléctrica…</div>${datos}`; return; }
    lista = precios;
  } else {
    lista = preciosTarifa(aj);
  }

  const mejor = ventanaBarata(lista, kwh, potencia, limite);
  const ya = costeAhora(lista, kwh, potencia);
  const finYa = new Date(Date.now() + horas * 3600e3);
  const hayManana = lista.at(-1).hora.getDate() !== new Date().getDate();
  let principal;
  if (!mejor) {
    principal = `<div class="resultado ambar"><div class="grande">No da tiempo</div>
      <p>Para las ${hora(limite)} no da tiempo a llegar al ${a} %${aj.tarifa === 'pvpc' && !hayManana ? ', o aún no están los precios de mañana (salen hacia las 20:30)' : ''}. Si enchufas ya, acaba a las ${hora(finYa)}${ya ? ` y cuesta ${euros(ya.coste)}` : ''}.</p></div>`;
  } else {
    const ahorro = ya ? ya.coste - mejor.coste : 0;
    const empezarYa = mejor.inicio.getTime() <= Date.now();
    principal = `<div class="resultado"><div class="grande">${empezarYa ? 'Enchufa ya' : `Enchufa a las ${hora(mejor.inicio)}`}</div>
      <p>Estará al ${a} % sobre las <b>${hora(mejor.fin)}</b> y te cuesta <b>${euros(mejor.coste)}</b>.
      ${ahorro > 0.05 ? `Si enchufas ahora: ${euros(ya.coste)} (${euros(ahorro)} más).` : ''}</p>
      <p class="muy-suave">${empezarYa ? '' : 'Si tu wallbox o el coche dejan programar la hora de inicio, ponla ahí; si no, enchufa a esa hora.'}</p></div>`;
  }
  el.innerHTML = principal + datos + grafico(lista, mejor, kwh, potencia) + botonApuntar(kwh, mejor ? mejor.coste : ya?.coste, de, a);
  enlazarApuntar(el);
}

function grafico(lista, mejor, kwh, kw) {
  const ahora = Date.now();
  const max = Math.max(...lista.map((p) => p.eur));
  const min = Math.min(...lista.filter((p) => p.hora.getTime() + 3600e3 > ahora).map((p) => p.eur));
  const nHoras = Math.ceil(kwh / kw + (mejor ? (Math.max(ahora, mejor.inicio.getTime()) - mejor.inicio.getTime()) / 3600e3 : 0));
  const titulo = ajustes().tarifa === 'pvpc' ? 'Precio de la luz (PVPC)' : 'Tu tarifa por horas';
  const dosDias = lista.length > 26;
  return `<section class="tarjeta">
    <div class="tarjeta-cab"><h2>${titulo}</h2><span class="muy-suave">€/kWh con impuestos</span></div>
    <div class="barras">${lista.map((p, i) => {
      const pasada = p.hora.getTime() + 3600e3 <= ahora;
      const esAhora = !pasada && p.hora.getTime() <= ahora;
      const elegida = mejor && i >= mejor.idx && i < mejor.idx + nHoras;
      return `<div class="${pasada ? 'pasada' : ''} ${esAhora ? 'ahora' : ''} ${elegida ? 'elegida' : ''}" style="height:${Math.max(4, p.eur / max * 100)}%" title="${hora(p.hora)} · ${num(p.eur, 3)} €"></div>`;
    }).join('')}</div>
    <div class="eje">${dosDias ? '<span>Hoy 0 h</span><span>12 h</span><span>Mañana 0 h</span><span>12 h</span><span>24 h</span>' : `<span>${hora(lista[0].hora)}</span><span>${hora(lista.at(-1).hora)}</span>`}</div>
    <div class="leyenda"><span><i style="background:var(--degradado)"></i>Cuándo cargar</span><span><i style="background:var(--tarjeta2)"></i>Resto</span>
      <span>Más barata: ${num(min, 3)} € · más cara: ${num(max, 3)} €</span></div>
    ${ajustes().tarifa === 'pvpc' ? '<p class="muy-suave" style="margin-top:10px">Datos de Red Eléctrica. Solo valen si tu contrato es PVPC (la tarifa regulada). ¿No lo es? Cámbialo en Ajustes.</p>' : ''}
  </section>`;
}

const botonApuntar = (kwh, coste, de, a) => `<button class="boton sec" id="apuntar" data-kwh="${kwh.toFixed(1)}" data-eur="${coste != null ? coste.toFixed(2) : ''}" data-de="${de}" data-a="${a}">Apuntar esta carga en Gastos</button>`;
function enlazarApuntar(el) {
  const b = el.querySelector('#apuntar'); if (!b) return;
  b.onclick = () => abrirFormCarga({ lugar: modo === 'casa' ? 'casa' : 'rapida', kwh: b.dataset.kwh, euros: b.dataset.eur, desde: b.dataset.de, hasta: b.dataset.a });
}

/* ---------- En la calle ---------- */
let kwCalle = 150;
function calle(el) {
  const a = ajustes();
  el.innerHTML = `
    <section class="tarjeta">
      <label class="campo"><span>Potencia del cargador (lo pone en el poste)</span>
        <div class="chips" id="kws">${[...new Set([22, 50, 100, 150, 300, kwCalle])].sort((x, y) => x - y).map((k) => `<button class="chip ${k === kwCalle ? 'activo' : ''}" data-kw="${k}">${k} kW</button>`).join('')}</div></label>
      <div class="fila">
        ${campo('Ahora tiene', 'de', bateria().pct, { unidad: '%' })}
        ${campo('Cargar hasta', 'a', 80, { unidad: '%' })}
      </div>
      ${campo('Precio del cargador', 'precio', kwCalle <= 22 ? a.precioLenta : a.precioRapida, { unidad: '€/kWh' })}
    </section>
    <div id="res"></div>
    <section class="tarjeta">
      <h2>Pagar sin bajarte apps</h2>
      <ul class="lista">
        <li><span class="icono">💳</span><div class="cuerpo"><b>Con tarjeta en el poste</b><span>Los cargadores rápidos nuevos (desde abril de 2024) tienen que aceptar tarjeta sin app. Busca el lector o el logo contactless.</span></div></li>
        <li><span class="icono">📱</span><div class="cuerpo"><b>Con el código QR del poste</b><span>Te abre una web para pagar con tarjeta. Sin descargar nada.</span></div></li>
        <li><span class="icono">🔑</span><div class="cuerpo"><b>Plan B: una sola app</b><span>Si un poste no deja otra cosa, Electromaps o Chargemap valen para casi todos.</span></div></li>
      </ul>
      <a href="#/guia" style="font-size:14px">Más en la guía ›</a>
    </section>`;
  const res = el.querySelector('#res');
  const calcula = () => {
    const f = (n) => +el.querySelector(`[name=${n}]`).value;
    const de = Math.max(0, Math.min(100, f('de'))), hasta = Math.max(0, Math.min(100, f('a'))), precio = f('precio');
    if (hasta <= de) { res.innerHTML = '<div class="tarjeta suave">Pon un «hasta» mayor que lo que tiene ahora.</div>'; return; }
    const ac = kwCalle <= 22;
    const min = ac ? horasAC(de, hasta, kwCalle) * 60 : minutosDC(de, hasta, kwCalle);
    const kwh = ac ? kwhRedAC(de, hasta) : kwhRedDC(de, hasta);
    const extra = !ac && hasta < 100 ? minutosDC(hasta, 100, kwCalle) : 0;
    res.innerHTML = `<div class="resultado"><div class="grande">${duracion(min)} · ${euros(kwh * precio)}</div>
      <p>${num(kwh, 1)} kWh. ${ac ? `En alterna tu coche carga como mucho a ${COCHE.acMax} kW, por eso tarda.` : kwCalle > COCHE.dcMax ? `Tu coche admite hasta ${COCHE.dcMax} kW: un cargador más potente no va más rápido.` : ''}</p>
      ${extra ? `<p>Del ${hasta} al 100 % tardarías ${duracion(extra)} más: por encima del 80 % carga mucho más lento. En viaje compensa parar al 80 %.</p>` : ''}
      <p class="muy-suave">Tiempo estimado con la curva de carga típica de tu batería (el catálogo dice 30→80 % en 15 min en el mejor caso). Con frío tarda más.</p></div>
      <button class="boton sec" id="apuntar">Apuntar esta carga en Gastos</button>`;
    res.querySelector('#apuntar').onclick = () => abrirFormCarga({ lugar: ac ? 'lenta' : 'rapida', kwh: kwh.toFixed(1), euros: (kwh * precio).toFixed(2), desde: de, hasta });
  };
  el.querySelector('#kws').onclick = (e) => {
    const b = e.target.closest('[data-kw]'); if (!b) return;
    kwCalle = +b.dataset.kw;
    el.querySelectorAll('#kws .chip').forEach((x) => x.classList.toggle('activo', x === b));
    el.querySelector('[name=precio]').value = kwCalle <= 22 ? a.precioLenta : a.precioRapida;
    calcula();
  };
  el.oninput = calcula;
  calcula();
}
