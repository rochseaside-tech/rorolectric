// elegir-coche.js — «¿Qué coche tienes?»: marca → versión (o «Otro coche» con sus datos).
// Sale sola la primera vez; luego, desde Ajustes o tocando el nombre del coche en Inicio.
import { MODELOS, GRUPOS_MODELOS, COCHE, ajustes, elegirCoche } from './datos.js';
import { abrirHoja, cerrarHoja, esc, campo } from './comun.js';

const PISTAS = {
  'Tesla Model Y': 'No sabes cuál es? En la pantalla del coche: <b>Controles → Software</b>, o en la app de Tesla. El año es el de la matriculación; desde 2025 el coche tiene una tira de luz delantera de lado a lado.',
  'Changan Deepal S05': 'La versión viene en la ficha técnica o en el contrato.',
};

export function abrirElegirCoche({ primera = false } = {}) {
  abrirHoja(`<div id="paso"></div>`, (caja) => {
    const hoja = document.getElementById('hoja');
    if (primera) hoja.onclick = null; // la primera vez hay que elegir
    marcas(caja.querySelector('#paso'), primera);
  });
}

function terminar(id, manual) {
  elegirCoche(id, manual);
  cerrarHoja();
  location.reload(); // todas las pantallas se repintan con el coche nuevo
}

function marcas(el, primera) {
  el.innerHTML = `
    <h2>${primera ? '¡Hola! ¿Qué coche tienes?' : 'Tu coche'}</h2>
    <p class="suave">Así la autonomía, los tiempos de carga y los consejos son los de tu coche.</p>
    <ul class="lista">
      ${GRUPOS_MODELOS.map(([grupo, ids]) => `<li data-g="${esc(grupo)}" style="cursor:pointer"><span class="icono">${grupo.startsWith('Tesla') ? '🚗' : '🚙'}</span>
        <div class="cuerpo"><b>${esc(grupo)}</b><span>${ids.length} versiones</span></div><span class="lado" style="color:var(--texto3)">›</span></li>`).join('')}
      <li data-g="otro" style="cursor:pointer"><span class="icono">⚡</span>
        <div class="cuerpo"><b>Otro coche eléctrico</b><span>Pones 4 datos de tu coche y listo</span></div><span class="lado" style="color:var(--texto3)">›</span></li>
    </ul>
    ${primera ? '' : '<div class="botones"><button class="boton sec" data-cerrar>Cancelar</button></div>'}`;
  el.onclick = (e) => {
    const li = e.target.closest('[data-g]'); if (!li) return;
    if (li.dataset.g === 'otro') otro(el, primera); else versiones(el, li.dataset.g, primera);
  };
}

function versiones(el, grupo, primera) {
  const ids = GRUPOS_MODELOS.find(([g]) => g === grupo)[1];
  el.innerHTML = `
    <h2>${esc(grupo)}</h2>
    ${PISTAS[grupo] ? `<p class="suave">${PISTAS[grupo]}</p>` : ''}
    <ul class="lista">${ids.map((id) => {
      const m = MODELOS[id];
      return `<li data-id="${id}" style="cursor:pointer"><span class="icono">${id === COCHE.id && ajustes().coche ? '✅' : '🔋'}</span>
        <div class="cuerpo"><b>${esc(m.nombre.replace(/^Tesla |^Deepal /, ''))}</b><span>${m.wltpKm} km oficiales · batería ${m.quimica} · rápida hasta ${m.dcMax} kW</span></div></li>`;
    }).join('')}</ul>
    <div class="botones"><button class="boton sec" id="atras">‹ Atrás</button></div>`;
  el.onclick = (e) => {
    if (e.target.closest('#atras')) { marcas(el, primera); return; }
    const li = e.target.closest('[data-id]'); if (li) terminar(li.dataset.id);
  };
}

function otro(el, primera) {
  const m = ajustes().cocheManual || {};
  el.innerHTML = `
    <h2>Otro coche eléctrico</h2>
    <p class="suave">Lo encuentras en la ficha técnica o buscando «ficha técnica» y el nombre de tu coche.</p>
    <form id="fo">
      ${campo('Marca y modelo', 'nombre', m.nombre || '', { tipo: 'text', extra: 'placeholder="Ej. Kia EV3 Long Range" required' })}
      <div class="fila">${campo('Batería', 'util', m.util || '', { unidad: 'kWh', extra: 'required placeholder="81"' })}${campo('Autonomía oficial', 'wltpKm', m.wltpKm || '', { unidad: 'km', extra: 'required placeholder="600"' })}</div>
      <div class="fila">${campo('Carga en casa máx.', 'acMax', m.acMax || 11, { unidad: 'kW' })}${campo('Carga rápida máx.', 'dcMax', m.dcMax || '', { unidad: 'kW', extra: 'placeholder="128"' })}</div>
      <label class="campo"><span>Tipo de batería</span><select name="quimica">
        <option value="NMC" ${m.quimica !== 'LFP' ? 'selected' : ''}>NMC / NCM / no lo sé (la mayoría)</option>
        <option value="LFP" ${m.quimica === 'LFP' ? 'selected' : ''}>LFP (litio-ferrofosfato)</option></select></label>
      ${campo('App oficial de tu marca (opcional)', 'app', m.app || '', { tipo: 'text', extra: 'placeholder="Ej. Kia Connect"' })}
      <div class="botones"><button class="boton" type="submit">Guardar</button><button class="boton sec" type="button" id="atras">‹ Atrás</button></div>
    </form>`;
  el.querySelector('#atras').onclick = () => marcas(el, primera);
  el.querySelector('#fo').onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    terminar('otro', { ...d, marca: d.nombre.split(' ')[0] });
  };
}
