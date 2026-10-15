// Portugal: registro oficial de MOBI.E (Punto de Acceso Nacional, formato europeo DATEX II).
//  - evChargingInfra (~180 MB, se rehace cada noche): sitios, puntos y enchufes.
//  - evActualStatus (~40 MB, en tiempo real): estado de cada punto y su tarifa.
// OJO con el precio: lo publicado es solo lo que cobra el operador por usar el poste (OPC). Al conductor
// se le suma la energía de su comercializadora (CEME), la tasa de MOBI.E por carga y el IVA (23 %).
import { TARJETA, APP, RFID, clave, vecinos, sumarEnchufes } from './comun.mjs';

export const URL_PT = 'https://pgm.mobie.pt/integration/nap/evChargingInfra';
export const URL_PT_ESTADO = 'https://pgm.mobie.pt/integration/nap/evActualStatus';
// Para el total aproximado (ERSE, 2026): tasa MOBI.E por carga, impuesto eléctrico, IVA y energía típica de una tarjeta.
export const PT = { tasaCarga: 0.1088, iec: 0.001, iva: 1.23, energia: 0.15 };

const TIPO = {
  iec62196T2COMBO: 'C', iec62196T2: 'T', chademo: 'H', domesticF: 'S', domesticE: 'S',
  iec62196T1: 'J', iec62196T1COMBO: 'J', iec60309x2single16: 'I', iec60309x2three32: 'I',
};
const txt = (s) => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
// Los prefijos de los espacios de nombres (ns4:, ns6:…) cambian de un día a otro: se buscan sin ellos.
const uno = (b, etiqueta) => { const m = b.match(new RegExp(`<(?:\\w+:)?${etiqueta}\\b[^>]*>([^<]*)<`)); return m ? txt(m[1]) : ''; };
const bloques = function* (s, etiqueta) {
  const re = new RegExp(`<((?:\\w+:)?)${etiqueta}\\b([^>]*)>([\\s\\S]*?)</\\1${etiqueta}>`, 'g');
  for (const m of s.matchAll(re)) yield { attrs: m[2], cuerpo: m[3] };
};
const idDe = (attrs) => (attrs.match(/\bid="([^"]+)"/) || [])[1] || '';

// Estado y tarifa de cada punto: { idPunto: { estado, kwh, carga, minuto } }
export function leerEstadoPt(xml) {
  const puntos = {};
  for (const sitio of bloques(xml, 'energyInfrastructureSiteStatus')) {
    const idSitio = (sitio.cuerpo.match(/<(?:\w+:)?reference[^>]*id="([^"]+)"/) || [])[1];
    for (const p of bloques(sitio.cuerpo, 'refillPointStatus')) {
      const id = (p.cuerpo.match(/<(?:\w+:)?reference[^>]*id="([^"]+)"/) || [])[1];
      if (!id) continue;
      const x = { sitio: idSitio, estado: uno(p.cuerpo, 'status'), kwh: null, carga: 0, minuto: 0 };
      for (const m of p.cuerpo.matchAll(/<(?:\w+:)?pricingPolicy>([^<]+)<\/(?:\w+:)?pricingPolicy>\s*<(?:\w+:)?minimumDeliveryFee>([^<]+)</g)) {
        const v = +m[2];
        if (m[1] === 'pricePerDeliveryUnit') x.kwh = v;
        else if (m[1] === 'flatRate') x.carga = v;
        else if (m[1] === 'pricePerChargingTime') x.minuto = v;
      }
      puntos[id] = x;
    }
  }
  return puntos;
}

// «fuera», «libre», «ocupado» o «sin» (no informa)
export const estadoSimple = (e) => (/outOfOrder|inoperative|faulted|removed/i.test(e) ? 'fuera'
  : /available/i.test(e) ? 'libre' : /charging|blocked|reserved|occupied/i.test(e) ? 'ocupado' : 'sin');

export function leerPortugal(xml, estado) {
  const sitios = [];
  for (const b of bloques(xml, 'energyInfrastructureSite')) {
    const s = b.cuerpo, id = idDe(b.attrs);
    const lat = +uno(s, 'latitude'), lon = +uno(s, 'longitude');
    if (!lat || !lon || !id) continue;
    const opBloque = (s.match(/<(?:\w+:)?operator\b[\s\S]*?<\/(?:\w+:)?operator>/) || [''])[0];
    const operador = uno(opBloque, 'value');
    const ciudad = (s.match(/<(?:\w+:)?city>[\s\S]*?<value(?:\s[^>]*)?>([^<]*)</) || [])[1] || '';
    const calle = (s.match(/<(?:\w+:)?addressLine[\s\S]*?<value(?:\s[^>]*)?>([^<]*)</) || [])[1] || '';
    let pago = 0;
    for (const m of s.matchAll(/<(?:\w+:)?authenticationAndIdentificationMethods>([^<]+)/g)) {
      if (/creditCard|debitCard|nfc|pinpad|contactless/i.test(m[1])) pago |= TARJETA;
      if (m[1] === 'apps') pago |= APP;
      if (m[1] === 'rfid') pago |= RFID;
    }
    const enchufes = {}, puntos = [];
    for (const p of bloques(s, 'refillPoint')) {
      const idP = idDe(p.attrs);
      let kwPunto = 0;
      for (const c of bloques(p.cuerpo, 'connector')) {
        const t = TIPO[uno(c.cuerpo, 'connectorType')];
        const kw = Math.round((+uno(c.cuerpo, 'maxPowerAtSocket') || 0) / 1000);
        kwPunto = Math.max(kwPunto, kw < 1000 ? kw : 0);
        if (!t) continue;
        const e = (enchufes[t] ||= { n: 0, kw: 0 }); e.n++; e.kw = Math.max(e.kw, kw < 1000 ? kw : 0);
      }
      puntos.push({ id: idP, kw: kwPunto, dc: /COMBO|chademo/i.test(p.cuerpo) });
    }
    const x = { lat, lon, nombre: txt(uno(s, 'value')), operador: txt(operador), dir: [txt(calle), txt(ciudad)].filter(Boolean).join(', '),
      horario: '', pago, enchufes, puntos: puntos.length, servicios: new Set(), fuente: 'p', ext: `pt:${id}`, idsPuntos: puntos.map((p) => p.id) };
    // Precio: del estado (tarifa de cada punto), en el formato de REVE y con el total aproximado
    const conTarifa = puntos.map((p) => ({ ...p, t: estado[p.id] })).filter((p) => p.t && (p.t.kwh != null || p.t.minuto || p.t.carga));
    if (conTarifa.length) {
      const r = conTarifa.filter((p) => p.dc || p.kw >= 50), n = conTarifa.filter((p) => !(p.dc || p.kw >= 50));
      const total = (v) => Math.round(((v || 0) + PT.energia + PT.iec) * PT.iva * 100) / 100;
      const rango = (l) => { const v = l.map((p) => p.t.kwh ?? 0); return v.length ? [total(Math.min(...v)), total(Math.max(...v))] : [null, null]; };
      const min = Math.max(...conTarifa.map((p) => p.t.minuto || 0)), carga = Math.max(...conTarifa.map((p) => p.t.carga || 0));
      const [rMin, rMax] = rango(r), [nMin, nMax] = rango(n);
      x.precio = [rMin, rMax, nMin, nMax, Math.round(min * 60 * PT.iva * 100) / 100, Math.round((carga + PT.tasaCarga) * PT.iva * 100) / 100, 0, 0];
      const k = conTarifa.map((p) => p.t.kwh).filter((v) => v != null);
      const f = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',');
      x.tarifa = `Operador (sin energía ni IVA): ${[k.length && `${f(Math.min(...k))}${Math.max(...k) > Math.min(...k) ? `–${f(Math.max(...k))}` : ''} €/kWh`, carga && `${f(carga)} € por carga`, min && `${f(min)} €/min`].filter(Boolean).join(' + ')}`;
    }
    const est = puntos.map((p) => estado[p.id]).filter(Boolean);
    if (est.length) x.funcion = [est.filter((e) => estadoSimple(e.estado) === 'fuera').length, puntos.length];
    sitios.push(x);
  }
  // Algunos operadores dan de alta por separado la parte rápida y la lenta del mismo sitio: se juntan (< 40 m).
  const rejilla = new Map(), juntos = [];
  for (const s of sitios) {
    const igual = vecinos(rejilla, s, 40).find((o) => o.operador === s.operador);
    if (igual) {
      sumarEnchufes(igual.enchufes, s.enchufes); igual.puntos += s.puntos; igual.pago |= s.pago;
      igual.idsPuntos.push(...s.idsPuntos); (igual.extOtros ||= []).push(s.ext);
      igual.precio = mezclar(igual.precio, s.precio); igual.tarifa ||= s.tarifa;
      if (s.funcion) igual.funcion = igual.funcion ? [igual.funcion[0] + s.funcion[0], igual.funcion[1] + s.funcion[1]] : s.funcion;
      continue;
    }
    juntos.push(s);
    const k = clave(s.lat, s.lon); (rejilla.get(k) || rejilla.set(k, []).get(k)).push(s);
  }
  return juntos;
}
const menor = (a, b) => (a == null ? b : b == null ? a : Math.min(a, b));
const mayor = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));
function mezclar(a, b) {
  if (!a || !b) return a || b;
  return [menor(a[0], b[0]), mayor(a[1], b[1]), menor(a[2], b[2]), mayor(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5]), 0, 0];
}
