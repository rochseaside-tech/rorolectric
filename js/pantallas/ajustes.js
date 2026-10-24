// Ajustes: tarifa de luz, cargador de casa, consumo real, fechas para avisos, tema.
import { COCHE, CARGADORES_CASA, TIPOS_VIA, CONSUMO_TIPICO, ajustes, cambiarAjuste, cambiarAjusteDe, borrarTodo, corregirCoche, lugares, guardarLugar, borrarLugar } from '../datos.js';
import { campo, aviso, esc, num, ubicacion, abrirHoja, certeza } from '../comun.js';
import { montarBuscador, buscarTexto } from '../buscador.js';
import { fechaLista, cargarTodos } from '../cargadores.js';
import { abrirElegirCoche } from '../elegir-coche.js';
import { esAndroid } from '../operadores.js';
import { conexion } from '../datos.js';
import { puedeConectar, conectado, pedirCodigo, conectar, desconectar, leerCoche, haceCuanto } from '../coche-vivo.js';

// «Mis sitios»: los sitios habituales de quien usa este móvil. Salen como botones en Coche («¿Llego?»), Viaje y Mapa.
const EMOJIS = ['🏠', '💼', '👪', '👴', '🏋️', '🛒', '🏫', '🏖️', '⛰️', '📍'];
const SUGERIDOS = [['🏠', 'Casa'], ['💼', 'Trabajo'], ['👪', 'Familia']];
function pintarSitios(el, editando = null, abierto = false) {
  const lista = lugares();
  const e = editando || { emoji: lista.length ? '📍' : '🏠', nombre: '', dir: '' };
  // Con sitios ya guardados, el formulario se queda recogido tras un botón.
  if (lista.length && !editando && !abierto) {
    el.innerHTML = `<h2>Mis sitios</h2>
      <ul class="lista">${lista.map((l) => `<li><span class="icono" style="font-size:20px">${esc(l.emoji || '📍')}</span>
        <div class="cuerpo"><b>${esc(l.nombre)}</b><span>${esc(l.dir || '')}</span></div>
        <div class="lado" style="display:flex;gap:6px"><button class="boton mini sec" type="button" data-editar="${esc(l.id)}">Cambiar</button><button class="boton mini sec" type="button" data-quitar="${esc(l.id)}" aria-label="Quitar">✕</button></div></li>`).join('')}</ul>
      <button class="boton sec" type="button" id="s-nuevo" style="margin-top:12px">＋ Añadir otro sitio</button>
      <p class="muy-suave" style="margin-top:8px">Salen como botones en «¿Llego?», en Viaje y en el Mapa. Solo en este móvil: cada persona pone los suyos.</p>`;
    el.querySelector('#s-nuevo').onclick = () => pintarSitios(el, null, true);
    botonesLista(el);
    return;
  }
  el.innerHTML = `<h2>Mis sitios</h2>
    <p class="suave">Tus sitios de siempre: casa, trabajo, la casa de tu familia… Salen como botones en «¿Llego?», en Viaje y en el Mapa. Se guardan solo en este móvil: cada persona pone los suyos en el suyo.</p>
    ${lista.length ? `<ul class="lista">${lista.map((l) => `<li><span class="icono" style="font-size:20px">${esc(l.emoji || '📍')}</span>
      <div class="cuerpo"><b>${esc(l.nombre)}</b><span>${esc(l.dir || '')}</span></div>
      <div class="lado" style="display:flex;gap:6px"><button class="boton mini sec" type="button" data-editar="${esc(l.id)}">Cambiar</button><button class="boton mini sec" type="button" data-quitar="${esc(l.id)}" aria-label="Quitar">✕</button></div></li>`).join('')}</ul>` : ''}
    <div style="margin-top:12px;padding:12px;border-radius:12px;background:var(--tarjeta2)">
      <b style="display:block;margin-bottom:8px">${editando ? `Cambiar «${esc(editando.nombre)}»` : 'Añadir un sitio'}</b>
      ${!editando && !lista.length ? `<div class="chips" id="sugeridos" style="margin-bottom:8px">${SUGERIDOS.map(([em, n]) => `<button type="button" class="chip" data-em="${em}" data-n="${n}">${em} ${n}</button>`).join('')}</div>` : ''}
      <div class="chips" id="emojis" style="margin-bottom:8px">${EMOJIS.map((x) => `<button type="button" class="chip ${x === e.emoji ? 'activo' : ''}" data-emoji="${x}" style="font-size:18px;padding:4px 10px">${x}</button>`).join('')}</div>
      <label class="campo"><span>Nombre</span><input id="s-nombre" type="text" value="${esc(e.nombre)}" placeholder="Ej. Casa, Casa de papá, Trabajo"></label>
      <label class="campo"><span>Dirección o pueblo</span><input id="s-dir" type="text" value="${esc(editando?.buscado || '')}" placeholder="${esc(editando?.dir || 'Ej. Calle Mayor 5, Burgos')}"></label>
      <div class="fila" style="gap:8px;flex-wrap:wrap">
        <button class="boton" type="button" id="s-guardar" style="flex:1">${editando ? 'Guardar cambios' : 'Guardar sitio'}</button>
        <button class="boton sec" type="button" id="s-aqui" style="flex:1">📍 Es donde estoy ahora</button>
        ${editando || abierto ? '<button class="boton sec" type="button" id="s-cancelar">Cancelar</button>' : ''}
      </div>
    </div>`;
  let emoji = e.emoji;
  el.querySelector('#emojis').onclick = (ev) => {
    const b = ev.target.closest('[data-emoji]'); if (!b) return;
    emoji = b.dataset.emoji; el.querySelectorAll('#emojis .chip').forEach((x) => x.classList.toggle('activo', x === b));
  };
  el.querySelector('#sugeridos')?.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-n]'); if (!b) return;
    el.querySelector('#s-nombre').value = b.dataset.n; emoji = b.dataset.em;
    el.querySelectorAll('#emojis .chip').forEach((x) => x.classList.toggle('activo', x.dataset.emoji === emoji));
    el.querySelector('#s-dir').focus();
  });
  const guardarCon = (datos) => {
    const nombre = el.querySelector('#s-nombre').value.trim();
    if (!nombre) { aviso('Ponle un nombre'); return; }
    if (lugares().some((l) => l.nombre.toLowerCase() === nombre.toLowerCase() && l.id !== editando?.id)) { aviso('Ya tienes un sitio con ese nombre'); return; }
    guardarLugar({ ...(editando || {}), ...datos, nombre, emoji });
    aviso(datos.dir ? `Guardado: ${datos.dir}. Si no es ahí, toca «Cambiar» y pon más detalle` : 'Sitio guardado'); pintarSitios(el);
  };
  el.querySelector('#s-guardar').onclick = async () => {
    const dir = el.querySelector('#s-dir').value.trim();
    if (!dir) { if (editando) guardarCon({}); else aviso('Pon la dirección o toca «Es donde estoy ahora»'); return; }
    const b = el.querySelector('#s-guardar'); b.disabled = true; b.textContent = 'Buscando…';
    try { const s = el.querySelector('#s-dir').sitio || await buscarTexto(dir); guardarCon({ punto: s.punto, dir: [s.nombre, s.detalle].filter(Boolean).join(', ').slice(0, 90), municipio: s.municipio }); }
    catch (err) { aviso(err.message); b.disabled = false; b.textContent = 'Guardar sitio'; }
  };
  el.querySelector('#s-aqui').onclick = async () => {
    const p = await ubicacion({ forzar: true });
    if (!p) { aviso('No me dejan ver dónde estás: activa la ubicación'); return; }
    let municipio = '', dir = 'Donde estabas al guardarlo';
    try {
      const r = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=es&lat=${p[0]}&lon=${p[1]}`)).json();
      const a = r.address || {};
      municipio = a.city || a.town || a.village || a.municipality || '';
      dir = [a.road && `${a.road}${a.house_number ? ' ' + a.house_number : ''}`, municipio].filter(Boolean).join(', ') || dir;
    } catch { /* sin conexión: vale con el punto */ }
    guardarCon({ punto: p, dir, municipio });
  };
  el.querySelector('#s-cancelar')?.addEventListener('click', () => pintarSitios(el));
  montarBuscador(el.querySelector('#s-dir'));
  botonesLista(el);
}
// «Cambiar» y «✕» de cada sitio guardado.
function botonesLista(el) {
  el.querySelectorAll('[data-quitar]').forEach((b) => { b.onclick = () => {
    if (!b.dataset.seguro) { b.dataset.seguro = '1'; b.textContent = '¿Seguro?'; return; }
    borrarLugar(b.dataset.quitar); aviso('Sitio quitado'); pintarSitios(el);
  }; });
  el.querySelectorAll('[data-editar]').forEach((b) => { b.onclick = () => pintarSitios(el, lugares().find((l) => l.id === b.dataset.editar)); });
}

// Conexión con MyChangan: correo → código que manda Changan → conectado.
function pintarConexion(el, paso = null) {
  const c = conexion() || {};
  if (conectado()) {
    const u = c.ultimo;
    el.innerHTML = `<h2>🔗 Conectado con MyChangan</h2>
      <p class="suave" style="margin-top:0">${esc(c.coche?.modelo || 'Tu Deepal')}${c.coche?.vin ? ` · bastidor …${esc(c.coche.vin.slice(-6))}` : ''}<br><span class="muy-suave">Cuenta ${esc(c.email || '')}</span></p>
      <p class="muy-suave" id="cx-ultimo">${u ? `Último dato del coche: ${esc(haceCuanto(u.fecha))}${u.pct != null ? ` · ${u.pct} %` : ''}` : 'Aún no he leído el coche.'}</p>
      <div class="botones"><button class="boton sec" type="button" id="cx-leer">↻ Leer el coche ahora</button>
        <button class="boton sec" type="button" id="cx-todo">Ver todo lo que manda el coche</button>
        <button class="boton peligro" type="button" id="cx-salir">Desconectar</button></div>`;
    el.querySelector('#cx-leer').onclick = async (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'Preguntando al coche…';
      try { const e = await leerCoche({ forzar: true }); aviso(e?.pct != null ? `El coche dice: ${e.pct} %` : 'Leído'); } catch (err) { aviso(err.message); }
      pintarConexion(el);
    };
    el.querySelector('#cx-todo').onclick = () => {
      const crudo = conexion()?.crudo || {};
      const filas = Object.entries(crudo).filter(([k]) => !k.startsWith('_')).sort(([a], [b]) => a.localeCompare(b));
      abrirHoja(`<h2>Datos del coche</h2><p class="muy-suave">Tal cual los manda el coche a Changan (nombres internos). Útil si algo no cuadra.</p>
        ${filas.length ? `<div style="font:12px/1.6 ui-monospace,Menlo,monospace;word-break:break-all">${filas.map(([k, v]) => `<div><b>${esc(k)}</b>: ${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</div>`).join('')}</div>` : '<p class="suave">Aún no hay datos: toca «Leer el coche ahora».</p>'}`);
    };
    el.querySelector('#cx-salir').onclick = (ev) => {
      if (!ev.target.dataset.seguro) { ev.target.dataset.seguro = '1'; ev.target.textContent = 'Toca otra vez para desconectar'; return; }
      desconectar(); aviso('Desconectado'); pintarConexion(el);
    };
    return;
  }
  const esperandoCodigo = paso === 'codigo';
  el.innerHTML = `<h2>🔗 Conectar con MyChangan</h2>
    ${c.error ? `<div class="resultado ambar" style="margin-top:0"><p style="margin:0">${esc(c.error)}</p></div>` : ''}
    <p class="suave" style="margin-top:0">Con tu cuenta de MyChangan, la app lee de tu coche la <b>batería</b>, si está <b>cargando</b> y cuánto le falta, si está <b>cerrado</b>, la <b>presión de las ruedas</b> y <b>dónde está aparcado</b>. Solo lee: no abre ni manda nada al coche.</p>
    <details class="guia" style="margin:0 0 12px"><summary><span class="emoji">⚠️</span>Antes de conectar, lee esto</summary><div class="dentro">
      <p class="suave" style="margin-top:0"><b>Changan solo deja una sesión abierta por cuenta.</b> Si conectas aquí con la misma cuenta que tienes en la app MyChangan, esa app te pedirá entrar otra vez (y al revés) ${certeza('alta')}.</p>
      <p class="suave"><b>Lo mejor, una cuenta solo para ROROLECTRIC:</b></p>
      <ol class="suave" style="padding-left:20px;margin:0">
        <li>En la app MyChangan, cierra sesión y crea una cuenta nueva con <b>otro correo</b>.</li>
        <li>Vuelve a entrar con tu cuenta de siempre y <b>comparte el coche</b> con la nueva.</li>
        <li>Conecta aquí con la cuenta nueva. Tu móvil sigue con la de siempre.</li></ol>
      <p class="muy-suave" style="margin-top:8px">No es una conexión oficial de Changan: la han descifrado otros dueños de Deepal (probada con un S05 de España). Si Changan cambia su sistema, puede dejar de ir un tiempo ${certeza('media')}. Tu sesión se guarda solo en este móvil y no va en las copias de seguridad.</p>
    </div></details>
    ${esperandoCodigo ? `<p class="suave">Te he mandado un código a <b>${esc(c.email)}</b> (mira también el correo no deseado).</p>
      <label class="campo"><span>Código del correo</span><input id="cx-codigo" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="Ej. 123456"></label>
      <div class="botones"><button class="boton" type="button" id="cx-entrar">Conectar</button><button class="boton sec" type="button" id="cx-otro">Cambiar el correo o volver a mandarlo</button></div>`
    : `<label class="campo"><span>Correo de tu cuenta MyChangan</span><input id="cx-email" type="email" autocomplete="email" value="${esc(c.email || '')}" placeholder="tu@correo.com"></label>
      <button class="boton" type="button" id="cx-pedir">Mandarme el código</button>`}`;
  el.querySelector('#cx-pedir')?.addEventListener('click', async (ev) => {
    const email = el.querySelector('#cx-email').value.trim();
    if (!email) { aviso('Pon el correo'); return; }
    ev.target.disabled = true; ev.target.textContent = 'Pidiendo el código…';
    try { await pedirCodigo(email); pintarConexion(el, 'codigo'); el.querySelector('#cx-codigo')?.focus(); }
    catch (err) { aviso(err.message); ev.target.disabled = false; ev.target.textContent = 'Mandarme el código'; }
  });
  el.querySelector('#cx-otro')?.addEventListener('click', () => pintarConexion(el));
  el.querySelector('#cx-entrar')?.addEventListener('click', async (ev) => {
    const codigo = el.querySelector('#cx-codigo').value.trim();
    if (!codigo) { aviso('Pon el código del correo'); return; }
    ev.target.disabled = true; ev.target.textContent = 'Conectando…';
    try {
      const coche = await conectar(codigo);
      aviso(`Conectado: ${coche.modelo}`);
      pintarConexion(el);
      leerCoche({ forzar: true }).then(() => pintarConexion(el)).catch((err) => { const u = el.querySelector('#cx-ultimo'); if (u) u.textContent = `⚠️ ${err.message}`; });
    } catch (err) { aviso(err.message); ev.target.disabled = false; ev.target.textContent = 'Conectar'; }
  });
}

export function pintar(raiz, [abrir] = []) {
  const a = ajustes();
  raiz.innerHTML = `
    <div class="titulo-pantalla"><h1>Ajustes</h1></div>
    <section class="tarjeta">
      <h2>Tu coche</h2>
      <div class="fila"><div><b style="font-size:17px">${esc(COCHE.nombre)}</b><div class="muy-suave">${num(COCHE.util, 1)} kWh útiles · ${COCHE.wltpKm} km oficiales · batería ${COCHE.quimica}</div></div>
        <button class="boton mini sec" id="cambiar-coche" style="flex:none">Cambiar</button></div>
    </section>
    ${puedeConectar() ? '<section class="tarjeta" id="conexion"></section>' : ''}

    <section class="tarjeta" id="mis-sitios"></section>
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

    <details class="guia"><summary><span class="emoji">🚗</span>Datos de tu coche</summary><div class="dentro">
      <p class="suave">Vienen de fábrica. Cámbialos si los tuyos son otros: por ejemplo, si con los años la batería ha perdido capacidad. Vacío = el de fábrica.</p>
      <div class="rejilla">
        ${campo(`Batería útil (fábrica ${num(COCHE.fabrica.util, 1)})`, 'correccion.util', a.correccion.util ?? '', { unidad: 'kWh' })}
        ${campo(`Carga en casa máx. (fábrica ${COCHE.fabrica.acMax})`, 'correccion.acMax', a.correccion.acMax ?? '', { unidad: 'kW' })}
        ${campo(`Carga rápida máx. (fábrica ${COCHE.fabrica.dcMax})`, 'correccion.dcMax', a.correccion.dcMax ?? '', { unidad: 'kW' })}
      </div>
    </div></details>

    <details class="guia"><summary><span class="emoji">🔔</span>Avisos</summary><div class="dentro">
      <div class="chips" id="avisos">${[['cien', '💯 Cargar al 100 % (baterías LFP)'], ['neumaticos', '🛞 Presión de ruedas'], ['itv', '🧾 ITV'], ['revision', '🔧 Revisión'], ['seguro', '🛡️ Seguro']]
        .map(([k, t]) => `<button type="button" class="chip ${a.avisos[k] ? 'activo' : ''}" data-aviso="${k}">${t}</button>`).join('')}</div>
      <p class="muy-suave" style="margin-top:8px">Encendido = te lo recuerdo en la pantalla Coche.</p>
    </div></details>

    <details class="guia"><summary><span class="emoji">📊</span>Tu consumo real</summary><div class="dentro">
      <p class="suave">El coche te lo enseña en kWh/100 km. Ponlo cuando lo sepas y la autonomía será la tuya, no una estimación. Vacío = estimación.</p>
      <div class="rejilla">${TIPOS_VIA.map(([k, t]) => campo(t, `consumoReal.${k}`, a.consumoReal[k] ?? '', { unidad: 'kWh', extra: `placeholder="${CONSUMO_TIPICO[k]}"` })).join('')}</div>
    </div></details>

    <details class="guia"><summary><span class="emoji">💶</span>Precios en la calle</summary><div class="dentro">
      <p class="suave">Para calcular cuánto te costará. Pon lo que pagas normalmente.</p>
      <div class="fila">${campo('Rápida', 'precioRapida', a.precioRapida, { unidad: '€/kWh' })}${campo('Lenta', 'precioLenta', a.precioLenta, { unidad: '€/kWh' })}</div>
    </div></details>

    <details class="guia"><summary><span class="emoji">⛽</span>Para comparar con gasolina</summary><div class="dentro">
      <div class="fila">${campo('Gastaba', 'gasolinaL100', a.gasolinaL100, { unidad: 'L/100' })}${campo('Precio', 'gasolinaPrecio', a.gasolinaPrecio, { unidad: '€/L' })}</div>
    </div></details>

    <details class="guia"><summary><span class="emoji">📅</span>Fechas para avisarte</summary><div class="dentro">
      ${campo('Matriculación', 'matriculacion', a.matriculacion, { tipo: 'date' })}
      <div class="fila">${campo('Próxima revisión', 'revisionFecha', a.revisionFecha, { tipo: 'date' })}${campo('o a los', 'revisionKm', a.revisionKm, { unidad: 'km', paso: '1' })}</div>
      ${campo('Km actuales', 'kmActuales', a.kmActuales, { unidad: 'km', paso: '1' })}
      ${campo('Renovación del seguro', 'seguroFecha', a.seguroFecha, { tipo: 'date' })}
      ${campo('Teléfono de asistencia en carretera', 'telAsistencia', a.telAsistencia, { tipo: 'tel', extra: 'placeholder="El de tu seguro o Changan"' })}
      ${a.telAsistencia ? `<a class="boton sec" href="tel:${esc(a.telAsistencia.replace(/\s/g, ''))}">📞 Llamar a asistencia</a>` : ''}
    </div></details>

    <details class="guia"><summary><span class="emoji">🎨</span>Aspecto</summary><div class="dentro">
      <div class="segmento" style="margin:0"><button type="button" data-tema="oscuro" class="${a.tema !== 'claro' ? 'activo' : ''}">Oscuro</button><button type="button" data-tema="claro" class="${a.tema === 'claro' ? 'activo' : ''}">Claro</button></div>
    </div></details>
    </form>

    <details class="guia"><summary><span class="emoji">🗺️</span>Lista de cargadores</summary><div class="dentro">
      <p class="suave" id="lista-info">…</p>
      <p class="muy-suave">Se actualiza sola cada noche: registro oficial del Ministerio, OpenStreetMap y precios y reservas de REVE (Red Eléctrica). Fuera de España: registro oficial de Francia y OpenStreetMap en Portugal y Andorra. No tienes que hacer nada.</p>
    </div></details>

    <details class="guia"><summary><span class="emoji">📲</span>Instalar en el móvil</summary><div class="dentro">
      ${esAndroid() ? `<button class="boton ${window.instalarApp ? '' : 'oculto'}" id="instalar" style="margin-bottom:12px">Instalar ROROLECTRIC</button>
      <ol class="suave" style="padding-left:20px;margin:0">
        <li>Abre esta página en <b>Chrome</b>.</li><li>Menú <b>⋮</b> (arriba a la derecha).</li><li><b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</li>
      </ol>` : `<ol class="suave" style="padding-left:20px;margin:0">
        <li>Abre esta página en <b>Safari</b>.</li><li>Botón <b>Compartir</b> (el cuadrado con la flecha).</li><li><b>Añadir a pantalla de inicio</b>.</li>
      </ol>
      <p class="muy-suave" style="margin-top:8px">¿Android? En Chrome: menú ⋮ → Instalar aplicación.</p>`}
    </div></details>

    <button class="boton peligro" id="borrar" style="margin-bottom:20px">Borrar todos mis datos</button>`;

  raiz.querySelector('#cambiar-coche').onclick = () => abrirElegirCoche();
  pintarSitios(raiz.querySelector('#mis-sitios'));
  const cx = raiz.querySelector('#conexion');
  if (cx) { pintarConexion(cx); if (abrir === 'coche') setTimeout(() => cx.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
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
