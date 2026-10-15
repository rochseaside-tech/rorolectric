// Inicio: batería y autonomía, «¿llego?», recordatorios y el gasto del mes.
import { COCHE, TIPOS_VIA, ajustes, bateria, ponerBateria, cargas, hechos, marcarHecho, hoyISO } from '../datos.js';
import { consumo, kmCon, pctTras, factorTemperatura, resumen } from '../calc.js';
import { esc, num, euros, anillo, temperatura, aviso } from '../comun.js';

let via = 'mixto';
let temp = null;

export function pintar(raiz) {
  const b = bateria();
  raiz.innerHTML = `
    <section class="tarjeta heroe">
      <div class="anillo" id="anillo">${anillo(b.pct)}<div class="anillo-centro"><b id="pct">${b.pct}<small>%</small></b><span>batería</span></div></div>
      <div class="km-grande">≈ <em id="km">—</em> km</div>
      <div class="muy-suave" id="km-nota"></div>
      <input type="range" min="0" max="100" step="1" value="${b.pct}" id="desliza" aria-label="Batería">
      <div class="muy-suave">Mueve la barra al % que marque el coche${b.fecha ? ` · último: ${esc(haceCuanto(b.fecha))}` : ''}</div>
      <div class="chips" id="vias" style="justify-content:center;margin-top:12px">
        ${TIPOS_VIA.map(([k, t]) => `<button class="chip ${k === via ? 'activo' : ''}" data-via="${k}">${t}</button>`).join('')}
      </div>
      <div class="tiempo-chip" id="tiempo">🌡️ mirando el tiempo…</div>
    </section>

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
      <span style="flex:1"><b style="display:block;font-size:17px">Guía de tu S05</b><span class="suave" style="font-size:14px">Qué apps necesitas de verdad, cómo cargar, pagar sin apps, ayudas…</span></span>
      <span style="font-size:24px;color:var(--texto3)">›</span>
    </a>`;

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
  temperatura().then((t) => { temp = t; if (raiz.isConnected) actualizar(raiz); });
}

function actualizar(raiz) {
  const pct = +raiz.querySelector('#desliza').value;
  const c = consumo(via, temp, ajustes());
  raiz.querySelector('#km').textContent = num(kmCon(pct, c));
  const propio = ajustes().consumoReal[via] > 0;
  raiz.querySelector('#km-nota').textContent = `${num(c, 1)} kWh/100 km ${propio ? '(tu consumo)' : '(estimado; pon el tuyo en Ajustes)'} · hasta 0 %`;
  const f = factorTemperatura(temp);
  raiz.querySelector('#tiempo').textContent = temp == null ? '🌡️ sin datos del tiempo'
    : `🌡️ ${num(temp)} °C · ${f > 1 ? `−${Math.round((1 - 1 / f) * 100)} % de autonomía por el ${temp > 30 ? 'aire acondicionado' : 'frío'}` : 'temperatura ideal'}`;

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
  if (!ultimo100 || dias(ultimo100) <= -7) lista.push({ icono: '💯', clave: 'cien', titulo: 'Carga al 100 % esta semana',
    texto: 'Tu batería es LFP: una vez a la semana al 100 % para que el % del coche no se descuadre.' });

  if (!h.neumaticos || dias(h.neumaticos) <= -30) lista.push({ icono: '🛞', clave: 'neumaticos', titulo: 'Mira la presión de las ruedas',
    texto: 'Una vez al mes, en frío. El coche la enseña en la pantalla. Con poca presión gastas más.' });

  if (a.matriculacion) {
    const m = new Date(a.matriculacion + 'T12:00');
    const itv = new Date(m); itv.setFullYear(m.getFullYear() + 4);
    const d = dias(hoyISO(itv));
    if (d <= 60) lista.push({ icono: '🧾', titulo: d < 0 ? 'ITV caducada' : `ITV en ${d} días`, texto: `Primera ITV: ${itv.toLocaleDateString('es-ES')}. Pide cita antes.`, urgente: d < 15 });
  }
  if (a.revisionFecha) {
    const d = dias(a.revisionFecha);
    if (d <= 45) lista.push({ icono: '🔧', titulo: d < 0 ? 'Revisión pasada de fecha' : `Revisión en ${d} días`, texto: 'Pide cita en el taller oficial para no perder la garantía.', urgente: d < 10 });
  }
  if (a.revisionKm && a.kmActuales && +a.revisionKm - +a.kmActuales <= 1500) {
    lista.push({ icono: '🔧', titulo: `Revisión en ${num(Math.max(0, a.revisionKm - a.kmActuales))} km`, texto: 'Te acercas a los km de la revisión.', urgente: true });
  }
  if (a.seguroFecha) {
    const d = dias(a.seguroFecha);
    if (d <= 30 && d >= -5) lista.push({ icono: '🛡️', titulo: `El seguro se renueva en ${d} días`, texto: 'Buen momento para pedir otros precios.' });
  }
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
  const km = r.kmHechos ?? (r.kwh * 0.92 / consumo('mixto', null, ajustes()) * 100);
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
