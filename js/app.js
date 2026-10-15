// app.js — arranque y navegación entre pantallas (#/inicio, #/cargar…).
import * as inicio from './pantallas/inicio.js';
import * as cargar from './pantallas/cargar.js';
import * as mapa from './pantallas/mapa.js';
import * as viaje from './pantallas/viaje.js';
import * as diario from './pantallas/diario.js';
import * as guia from './pantallas/guia.js';
import * as ajustesP from './pantallas/ajustes.js';
import { cerrarHoja } from './comun.js';
import { ajustes } from './datos.js';
import { abrirElegirCoche } from './elegir-coche.js';

const PANTALLAS = { inicio, cargar, mapa, viaje, diario, guia, ajustes: ajustesP };
const raiz = document.getElementById('app');
let actual = null;

function ir() {
  const [nombre, ...resto] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/');
  const p = PANTALLAS[nombre] || inicio;
  actual?.salir?.();
  cerrarHoja();
  actual = p;
  document.querySelectorAll('#pestanas a').forEach((a) => a.classList.toggle('activa', a.dataset.p === nombre));
  raiz.innerHTML = '';
  window.scrollTo(0, 0);
  p.pintar(raiz, resto);
}

window.addEventListener('hashchange', ir);
ir();
if (!ajustes().coche) abrirElegirCoche({ primera: true });

// Android (Chrome) avisa cuando la web se puede instalar: se guarda para el botón de Ajustes.
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.instalarApp = e; });

// Instalable y sin conexión. Si hay versión nueva, se recarga sola al volver a la app.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let recargando = false;
  const habia = !!navigator.serviceWorker.controller; // la primera vez no hace falta recargar
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando || !habia) return;
    recargando = true;
    location.reload();
  });
}
