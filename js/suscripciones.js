// ¿Te compensa una suscripción de carga rápida? Con lo que cargas de verdad (tus cargas apuntadas).
// Precios de las redes en octubre de 2026, de comparadores y prensa: cambian a menudo, por eso llevan su certeza.
import { COCHE } from './datos.js';
import { num, euros, certeza } from './comun.js';

export const FECHA_PLANES = 'octubre de 2026';
// cuota €/mes · precio €/kWh con el plan · sinPlan = precio sin suscripción en esa red (null si no lo sé)
export const PLANES = [
  { nombre: 'Ionity Power', op: 'ionity', cuota: 11.99, precio: 0.37, sinPlan: 0.66, certeza: 'media' },
  { nombre: 'Ionity Motion', op: 'ionity', cuota: 5.99, precio: 0.47, sinPlan: 0.66, certeza: 'media' },
  { nombre: 'Zunder Pro', op: 'zunder', cuota: 11.99, precio: 0.39, sinPlan: null, certeza: 'baja' },
  { nombre: 'Atlante Go', op: 'atlante', cuota: 9.99, precio: 0.34, sinPlan: null, certeza: 'baja' },
  { nombre: 'Membresía Supercargadores Tesla', op: 'tesla', cuota: 12.99, precio: 0.43, sinPlan: 0.64, certeza: 'baja', soloOtrasMarcas: true },
];

// kWh al mes en carga rápida (últimos 90 días) y €/kWh que pagas de media, en total y por red.
function tusRapidas(cargas) {
  const desde = new Date(Date.now() - 90 * 86400e3).toISOString().slice(0, 10);
  const r = cargas.filter((c) => c.lugar === 'rapida' && +c.kwh > 0 && c.fecha >= desde);
  if (!r.length) return null;
  const meses = Math.max(1, (Date.now() - Date.parse(r.at(-1).fecha)) / (30 * 86400e3));
  const kwh = r.reduce((s, c) => s + +c.kwh, 0), eur = r.reduce((s, c) => s + (+c.euros || 0), 0);
  const porRed = {};
  for (const c of r) if (c.operador) { const x = (porRed[c.operador] ||= { kwh: 0, eur: 0 }); x.kwh += +c.kwh; x.eur += +c.euros || 0; }
  return { kwhMes: kwh / meses, precio: eur > 0 ? eur / kwh : null, porRed, meses };
}

export function tarjetaSuscripciones(cargas, precioRapidaAjustes) {
  const yo = tusRapidas(cargas);
  const planes = PLANES.filter((p) => !(p.soloOtrasMarcas && COCHE.marca === 'Tesla'));
  const filas = planes.map((p) => {
    const base = p.sinPlan ?? yo?.precio ?? +precioRapidaAjustes; // lo que pagarías sin el plan
    const dif = base - p.precio;
    const umbral = dif > 0 ? p.cuota / dif : Infinity; // kWh al mes desde los que compensa
    const enRed = yo?.porRed[p.op];
    const kwh = enRed ? enRed.kwh / yo.meses : yo?.kwhMes || 0;
    const ahorro = kwh * dif - p.cuota;
    return { p, umbral, kwh, ahorro, enRed: !!enRed };
  }).sort((a, b) => b.ahorro - a.ahorro || a.umbral - b.umbral);
  const kmUmbral = (kwh) => num(kwh / (COCHE.consumo?.autovia120 || 20) * 100);
  return `<section class="tarjeta"><h2>💳 ¿Te compensa una suscripción?</h2>
    <p class="suave">${yo ? `En los últimos 3 meses has cargado unos <b>${num(yo.kwhMes)} kWh al mes en carga rápida</b>${yo.precio ? ` a ${num(yo.precio, 2)} €/kWh de media` : ''}.` : 'Cuando apuntes cargas rápidas te digo con tus números si te compensa. Mientras, desde cuándo sale a cuenta cada una:'}</p>
    <ul class="lista">${filas.map(({ p, umbral, kwh, ahorro, enRed }) => `<li><div class="cuerpo"><b>${p.nombre}</b>
      <span>${euros(p.cuota)}/mes · ${num(p.precio, 2)} €/kWh${p.sinPlan ? ` (sin plan, ${num(p.sinPlan, 2)})` : ''} ${certeza(p.certeza)}</span>
      <span>Compensa si cargas más de <b>${Number.isFinite(umbral) ? `${num(umbral)} kWh al mes` : '— (no sale más barato)'}</b>${Number.isFinite(umbral) ? ` en esa red (unos ${kmUmbral(umbral)} km de autovía)` : ''}</span></div>
      ${yo && kwh ? `<div class="lado" style="color:${ahorro > 0 ? 'var(--acento)' : 'var(--texto3)'}">${ahorro > 0 ? `+${euros(ahorro, 0)}` : `${euros(ahorro, 0)}`}<small class="suave">al mes${enRed ? '' : ' si todo fuera ahí'}</small></div>` : ''}</li>`).join('')}</ul>
    <p class="muy-suave">Precios de ${FECHA_PLANES}: cambian a menudo, compruébalos en la app de cada red antes de apuntarte. «Si todo fuera ahí» supone que todas tus cargas rápidas fueran en esa red; las que apuntas desde el mapa ya saben de qué empresa son.</p></section>`;
}
