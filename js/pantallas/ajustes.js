// Ajustes: tarifa de luz, cargador de casa, consumo real, fechas para avisos, tema.
import { CARGADORES_CASA, TIPOS_VIA, CONSUMO_TIPICO, ajustes, cambiarAjuste, cambiarAjusteDe, borrarTodo } from '../datos.js';
import { campo, aviso, esc } from '../comun.js';
import { fechaLista, cargarTodos } from '../cargadores.js';

export function pintar(raiz) {
  const a = ajustes();
  raiz.innerHTML = `
    <div class="titulo-pantalla"><h1>Ajustes</h1></div>
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
      <h2>Instalar en el iPhone</h2>
      <ol class="suave" style="padding-left:20px;margin:0">
        <li>Abre esta página en <b>Safari</b>.</li><li>Botón <b>Compartir</b> (el cuadrado con la flecha).</li><li><b>Añadir a pantalla de inicio</b>.</li>
      </ol>
    </section>

    <button class="boton peligro" id="borrar" style="margin-bottom:20px">Borrar todos mis datos</button>`;

  const f = raiz.querySelector('#f');
  f.onchange = (e) => {
    const { name, value, type } = e.target;
    if (!name) return;
    const v = type === 'number' ? (value === '' ? null : +value) : value;
    if (name.includes('.')) { const [g, k] = name.split('.'); cambiarAjusteDe(g, k, v); } else cambiarAjuste(name, v);
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
