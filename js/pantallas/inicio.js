// Inicio: batería y autonomía, «¿llego?», recordatorios y el gasto del mes.
import { COCHE, TIPOS_VIA, ajustes, bateria, ponerBateria, cargas, hechos, marcarHecho, hoyISO, sesion, medido, tempManual, ponerTempManual, cambiarAjuste } from '../datos.js';
import { consumo, kmCon, pctTras, climaKwDe, resumen, pctTrasMinutos, horasAC, minutosDC, tramo } from '../calc.js';
import { esc, num, euros, anillo, temperatura, aviso, hora, abrirHoja, cerrarHoja } from '../comun.js';
import { abrirElegirCoche } from '../elegir-coche.js';

let via = 'mixto';
let temp = null, tempReal = null;

export function pintar(raiz) {
  const b = bateria();
  const s = sesion();
  let viva = '';
  if (s) {
    const pct = Math.min(s.a, pctTrasMinutos(s.de, s.kw, s.ac, (Date.now() - s.inicio) / 60e3));
    const fin = new Date(s.inicio + (s.ac ? horasAC(s.de, s.a, s.kw) * 60 : minutosDC(s.de, s.a, s.kw)) * 60e3);
    viva = `<a class="carga-viva" href="#/cargar"><span class="latido"></span><span style="flex:1"><b>Cargando · ${Math.floor(pct)} %</b>
      <span class="suave" style="font-size:14px">${pct >= s.a - 0.05 ? '¡Ya debería estar lista!' : `Al ${s.a} % sobre las ${hora(fin)}`}</span></span><span style="font-size:24px;color:var(--texto3)">›</span></a>`;
  }
  raiz.innerHTML = `${viva}
    <section class="tarjeta heroe">
      <div class="anillo" id="anillo">${anillo(b.pct)}<div class="anillo-centro"><b id="pct">${b.pct}<small>%</small></b><span>batería</span></div></div>
      <div class="km-grande">≈ <em id="km">—</em> km</div>
      <div class="muy-suave" id="km-nota"></div>
      <input type="range" min="0" max="100" step="1" value="${b.pct}" id="desliza" aria-label="Batería">
      <div class="muy-suave">Mueve la barra al % que marque el coche${b.fecha ? ` · último: ${esc(haceCuanto(b.fecha))}` : ''}</div>
      <div class="chips" id="vias" style="justify-content:center;margin-top:12px">
        ${TIPOS_VIA.map(([k, t]) => `<button class="chip ${k === via ? 'activo' : ''}" data-via="${k}">${t}</button>`).join('')}
      </div>
      <div><button class="tiempo-chip" id="tiempo" style="border:0;font:inherit;font-size:13px;cursor:pointer">🌡️ mirando el tiempo…</button></div>
      <div><button class="tiempo-chip" id="mi-coche" style="border:0;font:inherit;font-size:13px;cursor:pointer">🚗 ${esc(COCHE.nombre)} · cambiar</button></div>
    </section>

    <a class="tarjeta" href="#/mapa/aqui" style="display:flex;gap:14px;align-items:center;text-decoration:none;color:inherit">
      <span style="font-size:30px">📍</span>
      <span style="flex:1"><b style="display:block;font-size:17px">Estoy en un cargador</b><span class="suave" style="font-size:14px">¿Cómo se paga aquí? Te lo digo al momento</span></span>
      <span style="font-size:24px;color:var(--texto3)">›</span>
    </a>

    <section class="tarjeta">
      <h2>¿Llego?</h2>
      <div class="fila">
        <label class="campo" style="margin:0"><span>Kilómetros hasta allí</span>
          <div class="con-unidad"><input id="llego-km" type="number" inputmode="decimal" placeholder="Ej. 120"><i>km</i></div></label>
        <label class="campo" style="margin:0;max-width:130px"><span>Ida y vuelta</span>
          <select id="llego-iv"><option value="1">Solo ida</option><option value="2">Ida y vuelta</option></select></label>
      </div>
      <div id="llego-res"></div>
    </section>

    <section class="tarjeta" id="recordatorios"></section>
    <section class="tarjeta" id="mes"></section>

    <a class="tarjeta" href="#/guia" style="display:flex;gap:14px;align-items:center;text-decoration:none;color:inherit">
      <span style="font-size:34px">📘</span>
      <span style="flex:1"><b style="display:block;font-size:17px">Guía de tu ${esc(COCHE.corto)}</b><span class="suave" style="font-size:14px">Qué apps necesitas de verdad, cómo cargar, pagar sin apps, ayudas…</span></span>
      <span style="font-size:24px;color:var(--texto3)">›</span>
    </a>`;

  raiz.querySelector('#mi-coche').onclick = () => abrirElegirCoche();
  const desliza = raiz.querySelector('#desliza');
  desliza.oninput = () => { raiz.querySelector('#pct').innerHTML = `${desliza.value}<small>%</small>`; raiz.querySelector('#anillo svg').outerHTML = anillo(+desliza.value); actualizar(raiz); };
  desliza.onchange = () => { ponerBateria(+desliza.value); pintarRecordatorios(raiz); };
  raiz.querySelector('#vias').onclick = (e) => {
    const c = e.target.closest('[data-via]'); if (!c) return;
    via = c.dataset.via;
    raiz.querySelectorAll('#vias .chip').forEach((x) => x.classList.toggle('activo', x === c));
    actualizar(raiz);
  };
  raiz.querySelector('#llego-km').oninput = () => actualizar(raiz);
  raiz.querySelector('#llego-iv').onchange = () => actualizar(raiz);

  actualizar(raiz);
  pintarRecordatorios(raiz);
  pintarMes(raiz);
  temp = tempManual();
  raiz.querySelector('#tiempo').onclick = () => editarTemp(raiz);
  temperatura().then((t) => { tempReal = t; if (tempManual() == null) temp = t; if (raiz.querySelector('#desliza')) actualizar(raiz); }); // si ya se fue de esta pantalla, nada
}

function actualizar(raiz) {
  const pct = +raiz.querySelector('#desliza').value;
  const c = consumo(via, temp, ajustes(), medido());
  raiz.querySelector('#km').textContent = num(kmCon(pct, c));
  const propio = ajustes().consumoReal[via] > 0, m = medido();
  raiz.querySelector('#km-nota').textContent = `${num(c, 1)} kWh/100 km ${propio ? '(tu consumo)' : m ? `(medido con tus cargas en ${num(m.km)} km)` : '(estimado; se ajusta solo cuando apuntes cargas con los km)'} · hasta 0 %`;
  const aMano = tempManual() != null, a = ajustes();
  const templado = consumo(via, 20, { ...a, usoClima: false }, medido());
  const menos = Math.round((1 - templado / c) * 100);
  const kw = climaKwDe(temp, a);
  raiz.querySelector('#tiempo').textContent = temp == null ? '🌡️ sin datos del tiempo · ponla tú'
    : `🌡️ Fuera ${num(temp)} °C${aMano ? ' (a mano)' : ''} · dentro ${a.usoClima === false ? 'sin clima' : `${num(a.tempInterior)} °C`} · ${menos > 1 ? `−${menos} % de autonomía${kw ? ` (${kw > 0 && temp > a.tempInterior ? 'aire' : 'calefacción'} ${num(kw, 1)} kW)` : ' por el frío'}` : 'sin pérdidas'} · cambiar`;

  const km = +raiz.querySelector('#llego-km').value * +raiz.querySelector('#llego-iv').value;
  const res = raiz.querySelector('#llego-res');
  if (!km) { res.innerHTML = ''; return; }
  const llegada = pctTras(km, pct, c);
  const clase = llegada >= 15 ? '' : llegada >= 5 ? 'ambar' : 'rojo';
  const texto = llegada >= 15 ? `Sí, llegas con un ${Math.round(llegada)} %`
    : llegada >= 5 ? `Justito: llegarías con un ${Math.round(llegada)} %` : 'No llegas sin cargar';
  res.innerHTML = `<div class="resultado ${clase}" style="margin-top:12px"><div class="grande">${texto}</div>
    <p>${llegada >= 15 ? 'Con margen de sobra para imprevistos.' : llegada >= 5 ? 'Mejor para un rato a cargar por el camino o al llegar.' : `Necesitas unos ${Math.ceil(15 - llegada)} puntos más de batería. Mira la pestaña Viaje: te dice dónde parar.`}</p></div>`;
}

// La temperatura se puede poner a mano (p. ej. para saber la autonomía mañana a primera hora).
// Precio de la luz de casa ahora (para decir lo que cuesta el clima). PVPC: se usa una media razonable.
function precioCasa() {
  const a = ajustes();
  if (a.tarifa === 'fija') return +a.precioFijo;
  if (a.tarifa === 'tramos') return +a.tramos[tramo(new Date())];
  return 0.15;
}

// Clima: tu temperatura ideal dentro (se guarda) y la de fuera (la del tiempo o puesta a mano).
// Con las dos, lo que gasta el clima: km de autonomía y euros por hora.
function editarTemp(raiz) {
  const a = ajustes();
  const resumenClima = (fuera, dentro, usa) => {
    if (fuera == null || fuera === '') return '';
    const aj = { ...a, tempInterior: +dentro, usoClima: usa };
    const kw = climaKwDe(+fuera, aj);
    if (!kw) return `<div class="resultado"><div class="grande">El clima casi no gasta</div><p>Con ${num(+fuera)} °C fuera${usa ? ` y ${num(+dentro)} °C dentro` : ''} no hay que calentar ni enfriar casi nada.</p></div>`;
    const kmMenos = kmCon(bateria().pct, consumo(via, +fuera, { ...aj, usoClima: false }, medido())) - kmCon(bateria().pct, consumo(via, +fuera, aj, medido()));
    return `<div class="resultado"><div class="grande">${num(kw, 1)} kW de ${+fuera < +dentro ? 'calefacción' : 'aire'}</div>
      <p>Tener el coche a ${num(+dentro)} °C con ${num(+fuera)} °C fuera te cuesta ≈ <b>${euros(kw * precioCasa())} por hora</b> (con la luz de casa)
      y unos <b>${num(kmMenos)} km</b> de autonomía con tu batería (en ${TIPOS_VIA.find(([k]) => k === via)[1].toLowerCase()}).</p>
      <p class="muy-suave">Truco: pon el clima con la app ${esc(COCHE.app)} mientras está enchufado y sales con la batería entera. ${COCHE.bombaCalor ? 'Tu coche tiene bomba de calor: calienta gastando la mitad.' : ''}</p></div>`;
  };
  abrirHoja(`<h2>Clima</h2>
    <label class="campo"><span>Me gusta llevar el coche a</span><div class="con-unidad"><input id="dentro" type="number" inputmode="decimal" step="0.5" value="${a.tempInterior ?? 21}"><i>°C</i></div></label>
    <div class="chips" style="margin-bottom:6px">${[19, 20, 21, 22, 23, 24].map((v) => `<button type="button" class="chip" data-d="${v}">${v} °C</button>`).join('')}
      <button type="button" class="chip ${a.usoClima === false ? 'activo' : ''}" id="sinclima">No pongo el clima</button></div>
    <label class="campo" style="margin-top:12px"><span>Fuera hace (${tempManual() != null ? 'puesta a mano' : 'la del tiempo'})</span><div class="con-unidad"><input id="t" type="number" inputmode="decimal" step="1" value="${temp ?? ''}"><i>°C</i></div></label>
    <div class="chips" style="margin-bottom:12px">${[-5, 0, 5, 10, 15, 25, 30, 35].map((v) => `<button type="button" class="chip" data-t="${v}">${v} °C</button>`).join('')}</div>
    <div id="clima-res"></div>
    <p class="muy-suave">La de fuera, si la pones a mano (para mañana temprano, la montaña…), vuelve sola a la del tiempo en 12 horas.</p>
    <div class="botones"><button class="boton" id="ok">Guardar</button>
      <button class="boton sec" id="real">Fuera: usar la del tiempo${tempReal != null ? ` (${num(tempReal)} °C ahora)` : ''}</button></div>`, (caja) => {
    let usa = a.usoClima !== false;
    const res = () => { caja.querySelector('#clima-res').innerHTML = resumenClima(caja.querySelector('#t').value, caja.querySelector('#dentro').value, usa); };
    res();
    caja.oninput = res;
    caja.onclick = (e) => {
      const d = e.target.closest('[data-d]'); if (d) { caja.querySelector('#dentro').value = d.dataset.d; usa = true; caja.querySelector('#sinclima').classList.remove('activo'); }
      const t = e.target.closest('[data-t]'); if (t) caja.querySelector('#t').value = t.dataset.t;
      if (e.target.closest('#sinclima')) { usa = !usa; e.target.closest('#sinclima').classList.toggle('activo', !usa); }
      if (d || t || e.target.closest('#sinclima')) res();
      if (e.target.closest('#ok')) {
        cambiarAjuste('tempInterior', +caja.querySelector('#dentro').value || 21);
        cambiarAjuste('usoClima', usa);
        const v = caja.querySelector('#t').value;
        if (v !== '' && +v !== tempReal) { ponerTempManual(+v); temp = +v; }
        cerrarHoja(); actualizar(raiz);
      }
      if (e.target.closest('#real')) { ponerTempManual(null); temp = tempReal; caja.querySelector('#t').value = tempReal ?? ''; res(); }
    };
  });
}

function haceCuanto(iso) {
  const min = (Date.now() - new Date(iso)) / 60e3;
  if (min < 60) return 'hace un momento';
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}

const dias = (iso) => Math.floor((new Date(iso + 'T12:00') - new Date(hoyISO() + 'T12:00')) / 86400e3);

function pintarRecordatorios(raiz) {
  const a = ajustes(), h = hechos(), lista = [];
  const pct = bateria().pct;
  if (pct <= 20) lista.push({ icono: '🔋', titulo: 'Te queda poca batería', texto: 'Busca un cargador cerca en el Mapa.', urgente: true, enlace: '#/mapa' });

  // LFP: una carga al 100 % a la semana para que el coche calcule bien el %.
  const ultimo100 = [h.cien, ...cargas().filter((c) => +c.hasta >= 100).map((c) => c.fecha)].filter(Boolean).sort().at(-1);
  const av = a.avisos;
  if (av.cien && COCHE.quimica === 'LFP' && (!ultimo100 || dias(ultimo100) <= -7)) lista.push({ icono: '💯', clave: 'cien', titulo: 'Carga al 100 % esta semana',
    texto: 'Tu batería es LFP: una vez a la semana al 100 % para que el % del coche no se descuadre.' });

  if (av.neumaticos && (!h.neumaticos || dias(h.neumaticos) <= -30)) lista.push({ icono: '🛞', clave: 'neumaticos', titulo: 'Mira la presión de las ruedas',
    texto: 'Una vez al mes, en frío. El coche la enseña en la pantalla. Con poca presión gastas más.' });

  if (av.itv && a.matriculacion) {
    const m = new Date(a.matriculacion + 'T12:00');
    const itv = new Date(m); itv.setFullYear(m.getFullYear() + 4);
    const d = dias(hoyISO(itv));
    if (d <= 60) lista.push({ icono: '🧾', titulo: d < 0 ? 'ITV caducada' : `ITV en ${d} días`, texto: `Primera ITV: ${itv.toLocaleDateString('es-ES')}. Pide cita antes.`, urgente: d < 15 });
  }
  if (av.revision && a.revisionFecha) {
    const d = dias(a.revisionFecha);
    if (d <= 45) lista.push({ icono: '🔧', titulo: d < 0 ? 'Revisión pasada de fecha' : `Revisión en ${d} días`, texto: 'Pide cita en el taller oficial para no perder la garantía.', urgente: d < 10 });
  }
  if (av.revision && a.revisionKm && a.kmActuales && +a.revisionKm - +a.kmActuales <= 1500) {
    lista.push({ icono: '🔧', titulo: `Revisión en ${num(Math.max(0, a.revisionKm - a.kmActuales))} km`, texto: 'Te acercas a los km de la revisión.', urgente: true });
  }
  if (av.seguro && a.seguroFecha) {
    const d = dias(a.seguroFecha);
    if (d <= 30 && d >= -5) lista.push({ icono: '🛡️', titulo: `El seguro se renueva en ${d} días`, texto: 'Buen momento para pedir otros precios.' });
  }
  // Los datos solo viven en este móvil: copia cada mes si hay algo que perder.
  if (cargas().length >= 3 && (!h.copia || dias(h.copia) <= -30)) lista.push({ icono: '💾', titulo: 'Guarda una copia de tus datos',
    texto: 'Tus cargas y notas solo están en este móvil. Si lo pierdes o lo cambias, con la copia lo recuperas todo.', enlace: '#/diario', urgente: !h.copia && cargas().length >= 10 });
  if (!a.matriculacion) lista.push({ icono: '✍️', titulo: 'Completa tus datos', texto: 'Fecha de matriculación, revisión y seguro: así te aviso a tiempo.', enlace: '#/ajustes' });

  const el = raiz.querySelector('#recordatorios');
  el.innerHTML = `<h2>Para tener en cuenta</h2>${lista.length ? lista.map((r) => `
    <div class="recordatorio ${r.urgente ? 'urgente' : ''}"><span class="icono">${r.icono}</span>
      <div class="cuerpo"><b>${r.titulo}</b><span>${r.texto}</span></div>
      ${r.clave ? `<button class="boton mini sec" data-hecho="${r.clave}">Hecho</button>` : r.enlace ? `<a class="boton mini sec" href="${r.enlace}">Ir</a>` : ''}
    </div>`).join('') : '<p class="suave">Todo en orden. 👌</p>'}`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-hecho]'); if (!b) return;
    marcarHecho(b.dataset.hecho); aviso('Apuntado'); pintarRecordatorios(raiz);
  };
}

function pintarMes(raiz) {
  const mes = hoyISO().slice(0, 7);
  const delMes = cargas().filter((c) => c.fecha.startsWith(mes));
  const r = resumen(delMes, ajustes());
  // Sin lecturas de km: km aproximados con lo cargado y el consumo mixto.
  const km = r.kmHechos ?? (r.kwh * 0.92 / consumo('mixto', null, ajustes(), medido()) * 100);
  const gasolina = km * r.gasolina100 / 100;
  const nombreMes = new Date().toLocaleDateString('es-ES', { month: 'long' });
  raiz.querySelector('#mes').innerHTML = `
    <div class="tarjeta-cab"><h2>Este mes</h2><a href="#/diario" style="font-size:14px">Ver gastos ›</a></div>
    ${delMes.length ? `<div class="rejilla">
      <div class="dato grande"><b>${euros(r.total)}</b><span>en ${delMes.length} carga${delMes.length > 1 ? 's' : ''}</span></div>
      <div class="dato grande verde"><b>${euros(Math.max(0, gasolina - r.total), 0)}</b><span>ahorrado frente a gasolina</span></div>
      <div class="dato"><b>${num(r.kwh)} kWh</b><span>cargados</span></div>
      <div class="dato"><b>${r.kmHechos != null ? '' : '≈ '}${num(km)} km</b><span>${r.kmHechos != null ? 'hechos' : 'aprox. con esa energía'}</span></div>
    </div>` : `<div class="vacio"><span class="emoji">⚡</span>Aún no has apuntado cargas en ${nombreMes}.<br>
      <a href="#/diario" class="boton mini" style="margin-top:12px">Apuntar una carga</a></div>`}`;
}
