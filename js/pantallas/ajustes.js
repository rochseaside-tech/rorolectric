// Ajustes: tarifa de luz, cargador de casa, consumo real, fechas para avisos, tema.
import { COCHE, CARGADORES_CASA, TIPOS_VIA, CONSUMO_TIPICO, ajustes, cambiarAjuste, cambiarAjusteDe, borrarTodo, corregirCoche } from '../datos.js';
import { campo, aviso, esc, num } from '../comun.js';
import { fechaLista, cargarTodos } from '../cargadores.js';
import { abrirElegirCoche } from '../elegir-coche.js';
import { esAndroid } from '../operadores.js';

export function pintar(raiz) {
  const a = ajustes();
  raiz.innerHTML = `
    <div class="titulo-pantalla"><h1>Ajustes</h1></div>
    <section class="tarjeta">
      <h2>Tu coche</h2>
      <div class="fila"><div><b style="font-size:17px">${esc(COCHE.nombre)}</b><div class="muy-suave">${num(COCHE.util, 1)} kWh útiles · ${COCHE.wltpKm} km oficiales · batería ${COCHE.quimica}</div></div>
        <button class="boton mini sec" id="cambiar-coche" style="flex:none">Cambiar</button></div>
    </section>
    <form id="f">
    <section class="tarjeta">
      <h2>Luz de casa</h2>
      <label class="campo"><span>Tu tarifa</span><select name="tarifa">
        <option value="pvpc" ${a.tarifa === 'pvpc' ? 'selected' : ''}>PVPC (regulada, cambia cada hora)</option>
        <option value="tramos" ${a.tarifa === 'tramos' ? 'selected' : ''}>Mercado libre con 3 precios (punta, llano, valle)</option>
        <option value="fija" ${a.tarifa === 'fija' ? 'selected' : ''}>Mercado libre, mismo precio todo el día</option>
      </select></label>
      <div id="fija" class="${a.tarifa === 'fija' ? '' : 'oculto'}">${campo('Precio del kWh (con impuestos)', 'precioFijo', a.precioFijo, { unidad: '€/kWh' })}</div>
      <div id="tramos" class="${a.tarifa === 'tramos' ? '' : 'oculto'}"><div class="fila">
        ${campo('Punta', 'tramos.punta', a.tramos.punta, { unidad: '€' })}${campo('Llano', 'tramos.llano', a.tramos.llano, { unidad: '€' })}${campo('Valle', 'tramos.valle', a.tramos.valle, { unidad: '€' })}
      </div></div>
      <p class="muy-suave">¿No sabes cuál tienes? Mira tu factura: si pone «PVPC» o «precio voluntario», es la primera.</p>
      <label class="campo"><span>Con qué cargas en casa</span><select name="cargadorCasa">
        ${CARGADORES_CASA.map(([kw, t]) => `<option value="${kw}" ${kw === +a.cargadorCasa ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${campo('Cargar en casa normalmente hasta', 'objetivoCasa', a.objetivoCasa, { unidad: '%' })}
    </section>

    <section class="tarjeta">
      <h2>Datos de tu coche</h2>
      <p class="suave">Vienen de fábrica. Cámbialos si los tuyos son otros: por ejemplo, si con los años la batería ha perdido capacidad. Vacío = el de fábrica.</p>
      <div class="rejilla">
        ${campo(`Batería útil (fábrica ${num(COCHE.fabrica.util, 1)})`, 'correccion.util', a.correccion.util ?? '', { unidad: 'kWh' })}
        ${campo(`Carga en casa máx. (fábrica ${COCHE.fabrica.acMax})`, 'correccion.acMax', a.correccion.acMax ?? '', { unidad: 'kW' })}
        ${campo(`Carga rápida máx. (fábrica ${COCHE.fabrica.dcMax})`, 'correccion.dcMax', a.correccion.dcMax ?? '', { unidad: 'kW' })}
      </div>
    </section>

    <section class="tarjeta">
      <h2>Avisos</h2>
      <div class="chips" id="avisos">${[['cien', '💯 Cargar al 100 % (baterías LFP)'], ['neumaticos', '🛞 Presión de ruedas'], ['itv', '🧾 ITV'], ['revision', '🔧 Revisión'], ['seguro', '🛡️ Seguro']]
        .map(([k, t]) => `<button type="button" class="chip ${a.avisos[k] ? 'activo' : ''}" data-aviso="${k}">${t}</button>`).join('')}</div>
      <p class="muy-suave" style="margin-top:8px">Encendido = te lo recuerdo en la pantalla Coche.</p>
    </section>

    <section class="tarjeta">
      <h2>Tu consumo real</h2>
      <p class="suave">El coche te lo enseña en kWh/100 km. Ponlo cuando lo sepas y la autonomía será la tuya, no una estimación. Vacío = estimación.</p>
      <div class="rejilla">${TIPOS_VIA.map(([k, t]) => campo(t, `consumoReal.${k}`, a.consumoReal[k] ?? '', { unidad: 'kWh', extra: `placeholder="${CONSUMO_TIPICO[k]}"` })).join('')}</div>
    </section>

    <section class="tarjeta">
      <h2>Precios en la calle</h2>
      <p class="suave">Para calcular cuánto te costará. Pon lo que pagas normalmente.</p>
      <div class="fila">${campo('Rápida', 'precioRapida', a.precioRapida, { unidad: '€/kWh' })}${campo('Lenta', 'precioLenta', a.precioLenta, { unidad: '€/kWh' })}</div>
    </section>

    <section class="tarjeta">
      <h2>Para comparar con gasolina</h2>
      <div class="fila">${campo('Gastaba', 'gasolinaL100', a.gasolinaL100, { unidad: 'L/100' })}${campo('Precio', 'gasolinaPrecio', a.gasolinaPrecio, { unidad: '€/L' })}</div>
    </section>

    <section class="tarjeta">
      <h2>Fechas para avisarte</h2>
      ${campo('Matriculación', 'matriculacion', a.matriculacion, { tipo: 'date' })}
      <div class="fila">${campo('Próxima revisión', 'revisionFecha', a.revisionFecha, { tipo: 'date' })}${campo('o a los', 'revisionKm', a.revisionKm, { unidad: 'km', paso: '1' })}</div>
      ${campo('Km actuales', 'kmActuales', a.kmActuales, { unidad: 'km', paso: '1' })}
      ${campo('Renovación del seguro', 'seguroFecha', a.seguroFecha, { tipo: 'date' })}
      ${campo('Teléfono de asistencia en carretera', 'telAsistencia', a.telAsistencia, { tipo: 'tel', extra: 'placeholder="El de tu seguro o Changan"' })}
      ${a.telAsistencia ? `<a class="boton sec" href="tel:${esc(a.telAsistencia.replace(/\s/g, ''))}">📞 Llamar a asistencia</a>` : ''}
    </section>

    <section class="tarjeta">
      <h2>Aspecto</h2>
      <div class="segmento" style="margin:0"><button type="button" data-tema="oscuro" class="${a.tema !== 'claro' ? 'activo' : ''}">Oscuro</button><button type="button" data-tema="claro" class="${a.tema === 'claro' ? 'activo' : ''}">Claro</button></div>
    </section>
    </form>

    <section class="tarjeta">
      <h2>Lista de cargadores</h2>
      <p class="suave" id="lista-info">…</p>
      <p class="muy-suave">Se actualiza sola cada noche con el registro oficial del Ministerio y OpenStreetMap. No tienes que hacer nada.</p>
    </section>

    <section class="tarjeta">
      <h2>Instalar en el móvil</h2>
      ${esAndroid() ? `<button class="boton ${window.instalarApp ? '' : 'oculto'}" id="instalar" style="margin-bottom:12px">Instalar ROROLECTRIC</button>
      <ol class="suave" style="padding-left:20px;margin:0">
        <li>Abre esta página en <b>Chrome</b>.</li><li>Menú <b>⋮</b> (arriba a la derecha).</li><li><b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</li>
      </ol>` : `<ol class="suave" style="padding-left:20px;margin:0">
        <li>Abre esta página en <b>Safari</b>.</li><li>Botón <b>Compartir</b> (el cuadrado con la flecha).</li><li><b>Añadir a pantalla de inicio</b>.</li>
      </ol>
      <p class="muy-suave" style="margin-top:8px">¿Android? En Chrome: menú ⋮ → Instalar aplicación.</p>`}
    </section>

    <button class="boton peligro" id="borrar" style="margin-bottom:20px">Borrar todos mis datos</button>`;

  raiz.querySelector('#cambiar-coche').onclick = () => abrirElegirCoche();
  raiz.querySelector('#avisos').onclick = (e) => {
    const b = e.target.closest('[data-aviso]'); if (!b) return;
    const k = b.dataset.aviso, v = !ajustes().avisos[k];
    cambiarAjusteDe('avisos', k, v); b.classList.toggle('activo', v); aviso(v ? 'Aviso encendido' : 'Aviso quitado');
  };
  raiz.querySelector('#instalar')?.addEventListener('click', async () => {
    window.instalarApp.prompt();
    await window.instalarApp.userChoice;
    window.instalarApp = null;
    raiz.querySelector('#instalar').classList.add('oculto');
  });
  const f = raiz.querySelector('#f');
  f.onchange = (e) => {
    const { name, value, type } = e.target;
    if (!name) return;
    const v = type === 'number' ? (value === '' ? null : +value) : value;
    if (name.startsWith('correccion.')) corregirCoche(name.split('.')[1], v);
    else if (name.includes('.')) { const [g, k] = name.split('.'); cambiarAjusteDe(g, k, v); } else cambiarAjuste(name, v);
    if (name === 'tarifa') { raiz.querySelector('#fija').classList.toggle('oculto', value !== 'fija'); raiz.querySelector('#tramos').classList.toggle('oculto', value !== 'tramos'); }
    aviso('Guardado');
  };
  f.querySelectorAll('[data-tema]').forEach((b) => { b.onclick = () => {
    cambiarAjuste('tema', b.dataset.tema);
    if (b.dataset.tema === 'claro') document.documentElement.dataset.tema = 'claro'; else delete document.documentElement.dataset.tema;
    f.querySelectorAll('[data-tema]').forEach((x) => x.classList.toggle('activo', x === b));
  }; });
  raiz.querySelector('#borrar').onclick = () => {
    const b = raiz.querySelector('#borrar');
    if (b.dataset.seguro) { borrarTodo(); aviso('Datos borrados'); pintar(raiz); return; }
    b.dataset.seguro = '1'; b.textContent = 'Toca otra vez para borrarlo TODO (cargas, notas, ajustes)';
  };
  cargarTodos().then((l) => {
    const el = raiz.querySelector('#lista-info'); if (!el) return;
    el.textContent = `${l.length.toLocaleString('es-ES')} puntos de recarga en España · actualizada el ${new Date(fechaLista() + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`;
  }).catch(() => { const el = raiz.querySelector('#lista-info'); if (el) el.textContent = 'No se pudo cargar la lista ahora.'; });
}
