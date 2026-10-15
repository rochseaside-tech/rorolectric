// Gastos: cada carga apuntada, resumen por mes y comparación con la gasolina.
import { COCHE, ajustes, cambiarAjuste, cargas, guardarCarga, borrarCarga, hoyISO, exportar, importar, marcarHecho, corregirCoche } from '../datos.js';
import { resumen, co2Ahorrado, saludBateria } from '../calc.js';
import { esc, num, euros, fechaBonita, abrirHoja, cerrarHoja, aviso, campo, certeza } from '../comun.js';

// Salud de la batería, calculada con las cargas apuntadas (kWh metidos y % que subió).
function tarjetaSalud(todas) {
  if (!todas.length) return '';
  const fabrica = COCHE.fabrica?.util || COCHE.util;
  const s = saludBateria(todas, fabrica);
  if (!s.util) {
    return `<section class="tarjeta"><h2>🔋 Salud de la batería</h2>
      <p class="suave">Apunta en 3 cargas el % al llegar y al acabar (que suba al menos 30 puntos) y te digo cuánta batería real le queda a tu coche. ${s.n ? `Llevas ${s.n} de 3.` : ''}</p></section>`;
  }
  const pct = Math.round(s.pct);
  const corregida = ajustes().correccion?.util;
  const sugerir = pct <= 95 && !(corregida && Math.abs(corregida - s.util) < 1);
  return `<section class="tarjeta"><h2>🔋 Salud de la batería</h2>
    <div class="rejilla"><div class="dato grande ${pct >= 90 ? 'verde' : ''}"><b>${pct} %</b><span>de la de fábrica</span></div>
      <div class="dato"><b>${num(s.util, 1)} kWh</b><span>de ${num(fabrica, 1)} kWh nueva</span></div></div>
    <p class="muy-suave" style="margin-top:8px">Calculado con tus últimas ${s.n} cargas largas ${certeza('baja')}: el % que enseña el coche y los kWh del poste no son exactos, así que tómalo como orientación. Con más cargas apuntadas, más fiable. Por debajo del 70 % antes de tiempo, la garantía de la batería suele cubrirla.</p>
    ${sugerir ? `<button class="boton sec" id="usar-salud" data-util="${s.util}" style="margin-top:8px">Calcular la autonomía con ${num(s.util, 1)} kWh</button>` : ''}</section>`;
}

export const LUGARES = {
  casa: ['🏠', 'En casa'],
  rapida: ['⚡', 'Rápida en la calle'],
  lenta: ['🔌', 'Lenta en la calle'],
  gratis: ['🎁', 'Gratis (súper, trabajo…)'],
};

let raizActual = null;

export function pintar(raiz) {
  raizActual = raiz;
  const todas = cargas();
  const r = resumen(todas, ajustes());
  const meses = {};
  for (const c of todas) (meses[c.fecha.slice(0, 7)] ||= []).push(c);

  raiz.innerHTML = `
    <div class="titulo-pantalla"><h1>Gastos</h1><p>Apunta cada carga y te digo cuánto te cuesta de verdad el coche.</p></div>
    <button class="boton" id="nueva" style="margin-bottom:14px">＋ Apuntar una carga</button>
    ${todas.length ? `
    <section class="tarjeta">
      <h2>Desde que lo tienes</h2>
      <div class="rejilla">
        <div class="dato grande"><b>${euros(r.total)}</b><span>en ${todas.length} cargas</span></div>
        <div class="dato grande"><b>${num(r.kwh)} kWh</b><span>cargados</span></div>
        <div class="dato verde"><b>${r.eur100 != null ? euros(r.eur100) : '—'}</b><span>cada 100 km${r.eur100 == null ? ' (apunta los km del coche en 2 cargas)' : ''}</span></div>
        <div class="dato"><b>${euros(r.gasolina100)}</b><span>cada 100 km con gasolina</span></div>
      </div>
      ${r.ahorro != null ? `<div class="resultado" style="margin:14px 0 0"><div class="grande">${euros(r.ahorro, 0)} ahorrados</div><p>en ${num(r.kmHechos)} km, frente a tu coche de gasolina (${num(ajustes().gasolinaL100, 1)} L/100 km a ${euros(ajustes().gasolinaPrecio)}/L; cámbialo en Ajustes).</p>
        <p>🌱 Y unos <b>${num(co2Ahorrado(r.kmHechos, r.kwh, ajustes()))} kg de CO₂</b> menos (estimado).</p></div>` : ''}
      ${grafMeses(meses)}
    </section>
    ${tarjetaSalud(todas)}
    ${Object.entries(meses).map(([mes, lista]) => `
      <section class="tarjeta">
        <div class="tarjeta-cab"><h2 style="text-transform:capitalize">${new Date(mes + '-15').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</h2>
          <b>${euros(lista.reduce((s, c) => s + (+c.euros || 0), 0))}</b></div>
        <ul class="lista">${lista.map((c) => `
          <li data-id="${esc(c.id)}" style="cursor:pointer"><span class="icono">${LUGARES[c.lugar]?.[0] || '⚡'}</span>
            <div class="cuerpo"><b>${esc(c.sitio || LUGARES[c.lugar]?.[1] || 'Carga')}</b>
              <span>${fechaBonita(c.fecha)}${c.desde !== '' && c.hasta !== '' && c.desde != null ? ` · ${c.desde} → ${c.hasta} %` : ''}${+c.km ? ` · ${num(c.km)} km` : ''}</span></div>
            <div class="lado">${euros(+c.euros || 0)}<small class="suave">${num(c.kwh, 1)} kWh${+c.kwh && +c.euros ? ` · ${num(c.euros / c.kwh, 2)} €/kWh` : ''}</small></div>
          </li>`).join('')}</ul>
      </section>`).join('')}` : `
    <section class="tarjeta vacio"><span class="emoji">🧾</span>Aún no hay cargas apuntadas.<br>Cuando cargues, apunta los kWh y lo que pagaste (lo dice el poste, el ticket o la app del wallbox).</section>`}
    <section class="tarjeta">
      <h2>Copia de seguridad</h2>
      <p class="suave">Tus datos viven solo en este móvil. Guarda una copia de vez en cuando (en Archivos o mándatela por WhatsApp).</p>
      <div class="botones"><button class="boton sec" id="exportar">Guardar copia</button>
        ${todas.length ? '<button class="boton sec" id="csv">Pasar a Excel (hoja de cálculo)</button>' : ''}
        <label class="boton sec">Restaurar una copia<input type="file" accept=".json,application/json" id="importar" hidden></label></div>
    </section>`;

  raiz.querySelector('#nueva').onclick = () => abrirFormCarga({});
  raiz.querySelector('#usar-salud')?.addEventListener('click', (e) => {
    corregirCoche('util', Math.round(+e.target.dataset.util * 10) / 10);
    aviso('Hecho: la autonomía se calcula ya con esa batería'); pintar(raiz);
  });
  raiz.querySelectorAll('[data-id]').forEach((li) => { li.onclick = () => abrirFormCarga(todas.find((c) => c.id === li.dataset.id)); });
  raiz.querySelector('#exportar').onclick = guardarCopia;
  raiz.querySelector('#csv')?.addEventListener('click', () => compartirArchivo(hojaCalculo(todas), `rorolectric-gastos-${hoyISO()}.csv`, 'text/csv'));
  raiz.querySelector('#importar').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { importar(await f.text()); aviso('Copia restaurada'); pintar(raiz); } catch (err) { aviso(err.message || 'No se pudo leer el archivo'); }
  };
}

function grafMeses(meses) {
  const ult = Object.entries(meses).slice(0, 6).reverse();
  if (ult.length < 2) return '';
  const max = Math.max(...ult.map(([, l]) => l.reduce((s, c) => s + (+c.euros || 0), 0)), 1);
  return `<h3 style="margin:18px 0 4px">Por meses</h3><div class="barras" style="height:90px;gap:10px">${ult.map(([, l]) => {
    const t = l.reduce((s, c) => s + (+c.euros || 0), 0);
    return `<div class="elegida" style="height:${Math.max(4, t / max * 100)}%"></div>`;
  }).join('')}</div><div class="eje">${ult.map(([m]) => `<span>${new Date(m + '-15').toLocaleDateString('es-ES', { month: 'short' })}</span>`).join('')}</div>`;
}

// CSV con punto y coma y coma decimal: así lo abre bien Excel en español.
function hojaCalculo(lista) {
  const n = (v) => (v === '' || v == null ? '' : String(v).replace('.', ','));
  const filas = [['Fecha', 'Dónde', 'Sitio', 'kWh', 'Euros', '€/kWh', 'Batería al llegar %', 'Al acabar %', 'Km del coche']];
  for (const c of [...lista].reverse()) {
    filas.push([c.fecha, LUGARES[c.lugar]?.[1] || '', c.sitio || '', n(c.kwh), n(c.euros), +c.kwh && +c.euros ? n((c.euros / c.kwh).toFixed(3)) : '', c.desde ?? '', c.hasta ?? '', c.km ?? '']);
  }
  return '\ufeff' + filas.map((f) => f.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

async function compartirArchivo(texto, nombre, tipo) {
  const archivo = new File([texto], nombre, { type: tipo });
  try {
    if (navigator.canShare?.({ files: [archivo] })) { await navigator.share({ files: [archivo], title: nombre }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function guardarCopia() {
  marcarHecho('copia');
  const nombre = `rorolectric-copia-${hoyISO()}.json`;
  const archivo = new File([exportar()], nombre, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [archivo] })) { await navigator.share({ files: [archivo], title: 'Copia de ROROLECTRIC' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Formulario de una carga (nueva o para corregir). Lo usa también la pantalla Cargar.
export function abrirFormCarga(c = {}) {
  const nueva = !c.id;
  const v = { fecha: hoyISO(), lugar: 'casa', sitio: '', kwh: '', euros: '', desde: '', hasta: '', km: ajustes().kmActuales || '', nota: '', ...c };
  abrirHoja(`
    <h2>${nueva ? 'Apuntar carga' : 'Corregir carga'}</h2>
    <form id="form-carga">
      <label class="campo"><span>Dónde</span><div class="chips" id="lugares">${Object.entries(LUGARES).map(([k, [e, t]]) =>
        `<button type="button" class="chip ${k === v.lugar ? 'activo' : ''}" data-l="${k}">${e} ${t}</button>`).join('')}</div></label>
      ${campo('Día', 'fecha', v.fecha, { tipo: 'date' })}
      ${campo('Sitio (opcional)', 'sitio', v.sitio, { tipo: 'text', extra: 'placeholder="Ej. Ionity La Jonquera"' })}
      <div class="fila">${campo('Energía', 'kwh', v.kwh, { unidad: 'kWh' })}${campo('Pagado', 'euros', v.euros, { unidad: '€' })}</div>
      <div class="fila">${campo('Batería al llegar', 'desde', v.desde, { unidad: '%' })}${campo('Al acabar', 'hasta', v.hasta, { unidad: '%' })}</div>
      ${campo('Km del coche (cuentakilómetros)', 'km', v.km, { unidad: 'km', paso: '1' })}
      <p class="muy-suave">Con los km de dos cargas te calculo cuánto te cuesta cada 100 km.</p>
      <div class="botones">
        <button class="boton" type="submit">Guardar</button>
        ${nueva ? '' : '<button class="boton peligro" type="button" id="borrar">Borrar esta carga</button>'}
        <button class="boton sec" type="button" data-cerrar>Cancelar</button>
      </div>
    </form>`, (caja) => {
    let lugar = v.lugar;
    caja.querySelector('#lugares').onclick = (e) => {
      const b = e.target.closest('[data-l]'); if (!b) return;
      lugar = b.dataset.l;
      caja.querySelectorAll('#lugares .chip').forEach((x) => x.classList.toggle('activo', x === b));
      if (lugar === 'gratis') caja.querySelector('[name=euros]').value = 0;
    };
    // Si no sabe los kWh pero sí los %, se calculan solos.
    const f = caja.querySelector('form');
    f.oninput = (e) => {
      if (!['desde', 'hasta'].includes(e.target.name) || f.kwh.dataset.tocado) return;
      const de = +f.desde.value, a = +f.hasta.value;
      if (f.desde.value !== '' && f.hasta.value !== '' && a > de) f.kwh.value = ((a - de) / 100 * COCHE.util / (lugar === 'rapida' ? 0.95 : 0.9)).toFixed(1);
    };
    f.kwh.addEventListener('input', () => { f.kwh.dataset.tocado = '1'; });
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      if (!d.kwh && !d.euros) { aviso('Pon al menos los kWh o lo que pagaste'); return; }
      guardarCarga({ ...c, ...d, lugar, kwh: d.kwh === '' ? '' : +d.kwh, euros: d.euros === '' ? '' : +d.euros,
        desde: d.desde === '' ? '' : +d.desde, hasta: d.hasta === '' ? '' : +d.hasta, km: d.km === '' ? '' : +d.km });
      if (+d.km > (+ajustes().kmActuales || 0)) cambiarAjuste('kmActuales', +d.km);
      cerrarHoja(); aviso('Carga guardada');
      // Solo se repinta si estás en Gastos; desde el mapa o «Cargando ahora» te quedas donde estabas.
      if (location.hash.startsWith('#/diario')) pintar(raizActual);
    };
    caja.querySelector('#borrar')?.addEventListener('click', () => {
      borrarCarga(c.id); cerrarHoja(); aviso('Carga borrada'); if (location.hash.startsWith('#/diario')) pintar(raizActual);
    });
  });
}

