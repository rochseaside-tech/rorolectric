// calc.js — las cuentas, sin pantalla (se prueban con: node test-calc.mjs).
import { COCHE, CONSUMO_TIPICO } from './datos.js';

const PERDIDAS_AC = 0.9;   // de cada kWh que pagas en casa, ~0,9 llegan a la batería (estimado)
const PERDIDAS_DC = 0.95;
// Impuesto eléctrico (5,11 %) e IVA (21 %) sobre el precio del PVPC que publica Red Eléctrica.
export const IMPUESTOS_LUZ = 1.0511 * 1.21;

// Cuánto sube el consumo con el frío (bomba de calor de serie) o con el aire a tope. Estimado.
export function factorTemperatura(t) {
  if (t == null || Number.isNaN(t)) return 1;
  if (t < 0) return 1.25;
  if (t < 5) return 1.15;
  if (t < 12) return 1.08;
  if (t > 32) return 1.07;
  return 1;
}

export function consumo(tipo, temp, ajustes) {
  const propio = ajustes?.consumoReal?.[tipo];
  const base = propio > 0 ? +propio : CONSUMO_TIPICO[tipo];
  // Si el consumo es tuyo (lo miraste en el coche), ya lleva el tiempo que hacía: solo se corrige el frío extremo.
  return propio > 0 ? base * Math.max(1, factorTemperatura(temp) - 0.08) : base * factorTemperatura(temp);
}

export const kmCon = (pct, kwh100) => Math.max(0, (pct / 100) * COCHE.util / kwh100 * 100);
export const pctTras = (km, pctIni, kwh100) => pctIni - (km * kwh100 / 100) / COCHE.util * 100;
export const kwhEntre = (de, a) => Math.max(0, (a - de) / 100 * COCHE.util);

// Potencia que acepta la batería según el % (curva simplificada, cuadra con el 30→80 % en 15 min del catálogo).
export function curvaDC(pct) {
  if (pct < 50) return 185;
  if (pct < 80) return 110;
  if (pct < 90) return 55;
  return 25;
}

// Minutos de carga rápida de «de» a «a» % en un cargador de «kw» kW.
export function minutosDC(de, a, kw) {
  let min = 0;
  for (let p = de; p < a; p += 1) {
    const paso = Math.min(1, a - p);
    const potencia = Math.min(kw, curvaDC(p)) * 0.95; // el cargador casi nunca da su máximo
    min += (paso / 100 * COCHE.util) / potencia * 60;
  }
  return min;
}

// Carga lenta (casa o calle en alterna): el coche admite como mucho 11 kW.
export function horasAC(de, a, kw) {
  const potencia = Math.min(kw, COCHE.acMax);
  return kwhRedAC(de, a) / potencia;
}
export const kwhRedAC = (de, a) => kwhEntre(de, a) / PERDIDAS_AC;
export const kwhRedDC = (de, a) => kwhEntre(de, a) / PERDIDAS_DC;

// Tramos de la tarifa 2.0TD: entre semana valle 0-8, punta 10-14 y 18-22, el resto llano.
// Sábados, domingos y festivos nacionales: todo valle.
const FESTIVOS = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'];
export function tramo(fecha) {
  const d = fecha.getDay();
  const md = `${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
  if (d === 0 || d === 6 || FESTIVOS.includes(md)) return 'valle';
  const h = fecha.getHours();
  if (h < 8) return 'valle';
  if ((h >= 10 && h < 14) || (h >= 18 && h < 22)) return 'punta';
  return 'llano';
}

// Precios de las próximas horas para tarifas que no son PVPC.
export function preciosTarifa(ajustes, desde = new Date(), horas = 36) {
  const lista = [];
  const h0 = new Date(desde); h0.setMinutes(0, 0, 0);
  for (let i = 0; i < horas; i++) {
    const hora = new Date(h0.getTime() + i * 3600e3);
    const eur = ajustes.tarifa === 'fija' ? +ajustes.precioFijo : +ajustes.tramos[tramo(hora)];
    lista.push({ hora, eur });
  }
  return lista;
}

// Coste de cargar «kwh» empezando en la posición «i» de la lista de precios horarios,
// a «kw» de potencia. Devuelve null si no caben en las horas que hay.
export function costeDesde(precios, i, kwh, kw) {
  let falta = kwh, coste = 0, j = i;
  const ahora = Date.now();
  while (falta > 1e-9) {
    if (j >= precios.length) return null;
    // La hora en curso solo cuenta lo que le queda.
    const fin = precios[j].hora.getTime() + 3600e3;
    const fraccion = j === i ? Math.min(1, Math.max(0, (fin - Math.max(ahora, precios[j].hora.getTime())) / 3600e3)) : 1;
    const energia = Math.min(falta, kw * fraccion);
    coste += energia * precios[j].eur;
    falta -= energia;
    j++;
  }
  return { coste, finIdx: j - 1 };
}

// La hora de enchufar más barata entre las horas que quedan (sin pasar de «limite», p. ej. «antes de las 8»).
export function ventanaBarata(precios, kwh, kw, limite = null) {
  const ahora = Date.now();
  let mejor = null;
  for (let i = 0; i < precios.length; i++) {
    if (precios[i].hora.getTime() + 3600e3 <= ahora) continue;
    const r = costeDesde(precios, i, kwh, kw);
    if (!r) break;
    const fin = new Date(Math.max(ahora, precios[i].hora.getTime()) + kwh / kw * 3600e3);
    if (limite && fin > limite) continue;
    if (!mejor || r.coste < mejor.coste - 0.005) mejor = { inicio: precios[i].hora, idx: i, ...r, fin };
  }
  return mejor;
}

export function costeAhora(precios, kwh, kw) {
  const ahora = Date.now();
  const i = precios.findIndex((p) => p.hora.getTime() + 3600e3 > ahora);
  return i < 0 ? null : costeDesde(precios, i, kwh, kw);
}

// Plan de viaje: dónde parar y cuánto cargar. Paradas cuando bajes a «paradaEn» %;
// en cada una cargas hasta «cargarHasta» o lo justo para llegar con «llegarCon» %.
export function planViaje(km, pctIni, kwh100, { llegarCon = 15, paradaEn = 12, cargarHasta = 80, kwCargador = 150 } = {}) {
  const paradas = [];
  let pos = 0, pct = pctIni;
  for (let vuelta = 0; vuelta < 30; vuelta++) {
    const llegada = pctTras(km - pos, pct, kwh100);
    if (llegada >= llegarCon) return { paradas, llegada, minutosCarga: paradas.reduce((s, p) => s + p.minutos, 0) };
    const tramoKm = Math.max(0, (pct - paradaEn) / 100 * COCHE.util / kwh100 * 100);
    if (tramoKm < 5 && paradas.length) break; // no avanza: no se puede
    pos += tramoKm;
    const llegaCon = paradaEn;
    // Lo necesario para acabar el viaje, con un 3 % de margen, sin pasar de cargarHasta (o 95 si hace falta).
    const necesario = llegarCon + 3 + (km - pos) * kwh100 / 100 / COCHE.util * 100;
    const hasta = Math.min(Math.max(cargarHasta, 0), 100) >= necesario ? Math.ceil(necesario) : cargarHasta;
    paradas.push({ km: pos, llegaCon, hasta, minutos: minutosDC(llegaCon, hasta, kwCargador) });
    pct = hasta;
  }
  return { paradas, llegada: null, minutosCarga: paradas.reduce((s, p) => s + p.minutos, 0), imposible: true };
}

// Resumen del diario: gasto, kWh, €/100 km (si hay lecturas de km) y ahorro frente a gasolina.
export function resumen(cargas, ajustes) {
  const total = cargas.reduce((s, c) => s + (+c.euros || 0), 0);
  const kwh = cargas.reduce((s, c) => s + (+c.kwh || 0), 0);
  const conKm = cargas.filter((c) => +c.km > 0).sort((a, b) => a.km - b.km);
  let eur100 = null, kmHechos = null;
  if (conKm.length >= 2) {
    kmHechos = conKm.at(-1).km - conKm[0].km;
    // Lo cargado desde la 1.ª lectura (sin contar esa) es lo que se gastó en esos km.
    const primera = conKm[0];
    const ultima = conKm.at(-1);
    const despues = cargas.filter((c) => c !== primera && c.fecha >= primera.fecha && c.fecha <= ultima.fecha
      && !(+c.km > 0 && +c.km <= primera.km));
    const eur = despues.reduce((s, c) => s + (+c.euros || 0), 0);
    if (kmHechos > 0) eur100 = eur / kmHechos * 100;
  }
  const gasolina100 = ajustes.gasolinaL100 * ajustes.gasolinaPrecio;
  return { total, kwh, eur100, kmHechos, gasolina100,
    ahorro: eur100 != null ? (gasolina100 - eur100) * kmHechos / 100 : null };
}

// Distancia en km entre dos puntos.
export function distancia(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Punto de una ruta (lista de [lat, lon]) a «km» del inicio.
export function puntoEnRuta(ruta, km) {
  let hecho = 0;
  for (let i = 1; i < ruta.length; i++) {
    const d = distancia(ruta[i - 1], ruta[i]);
    if (hecho + d >= km) {
      const f = d ? (km - hecho) / d : 0;
      return [ruta[i - 1][0] + (ruta[i][0] - ruta[i - 1][0]) * f, ruta[i - 1][1] + (ruta[i][1] - ruta[i - 1][1]) * f];
    }
    hecho += d;
  }
  return ruta.at(-1);
}

// Ruta muestreada cada ~1 km con los km acumulados: [{p:[lat,lon], km}]
export function muestrearRuta(ruta, cadaKm = 1) {
  const out = [{ p: ruta[0], km: 0 }];
  let acum = 0, desdeUltima = 0;
  for (let i = 1; i < ruta.length; i++) {
    const d = distancia(ruta[i - 1], ruta[i]);
    acum += d; desdeUltima += d;
    if (desdeUltima >= cadaKm || i === ruta.length - 1) { out.push({ p: ruta[i], km: acum }); desdeUltima = 0; }
  }
  return out;
}

// A qué km de la ruta queda cada cargador y a cuánto se aparta (km). Solo los de menos de «maxDesvio».
export function cargadoresEnRuta(muestras, cargadores, maxDesvio = 3) {
  const res = [];
  for (const c of cargadores) {
    let mejor = null;
    for (const m of muestras) {
      if (Math.abs(m.p[0] - c.lat) > 0.05 || Math.abs(m.p[1] - c.lon) > 0.07) continue;
      const d = distancia(m.p, [c.lat, c.lon]);
      if (!mejor || d < mejor.d) mejor = { d, km: m.km };
    }
    if (mejor && mejor.d <= maxDesvio) res.push({ ...c, kmRuta: mejor.km, desvio: mejor.d });
  }
  return res.sort((a, b) => a.kmRuta - b.kmRuta);
}

// Plan con cargadores reales: en cada tramo, el último cargador rápido al que llegas con margen
// (y, si hay varios cerca del final, el más potente). Si en un tramo no hay ninguno, parada «teórica».
export function planConCargadores(km, pctIni, kwh100, cargadores, { llegarCon = 15, paradaEn = 12, cargarHasta = 80 } = {}) {
  const paradas = [];
  let pos = 0, pct = pctIni;
  const pctPorKm = kwh100 / 100 / COCHE.util * 100;
  for (let vuelta = 0; vuelta < 30; vuelta++) {
    const llegada = pct - (km - pos) * pctPorKm;
    if (llegada >= llegarCon) return { paradas, llegada, minutosCarga: paradas.reduce((s, p) => s + p.minutos, 0) };
    const alcance = pos + Math.max(0, pct - paradaEn) / pctPorKm;
    const posibles = cargadores.filter((c) => c.kmRuta > pos + 3 && c.kmRuta + c.desvio <= alcance);
    let elegido = null;
    if (posibles.length) {
      const ultimo = posibles.at(-1).kmRuta;
      // Entre los de los últimos 25 km alcanzables, el más potente (a igualdad, el más lejano).
      elegido = posibles.filter((c) => c.kmRuta >= ultimo - 25)
        .sort((a, b) => Math.min(b.potencia || 50, COCHE.dcMax) - Math.min(a.potencia || 50, COCHE.dcMax) || b.kmRuta - a.kmRuta)[0];
    }
    const kmParada = elegido ? elegido.kmRuta : alcance;
    if (kmParada - pos < 5 && paradas.length) break;
    const llegaCon = Math.max(0, pct - (kmParada - pos + (elegido ? elegido.desvio * 2 : 0)) * pctPorKm);
    const necesario = llegarCon + 3 + (km - kmParada) * pctPorKm;
    const hasta = Math.ceil(Math.min(necesario <= cargarHasta ? necesario : cargarHasta, 100));
    const kw = elegido ? Math.min(elegido.potencia || 50, COCHE.dcMax) : 150;
    const alternativas = elegido ? posibles.filter((c) => c !== elegido && c.kmRuta >= kmParada - 60).slice(-2).reverse() : [];
    paradas.push({ km: kmParada, llegaCon: Math.round(llegaCon), hasta, minutos: minutosDC(Math.round(llegaCon), hasta, kw), cargador: elegido, alternativas });
    pos = kmParada; pct = hasta;
  }
  return { paradas, llegada: null, minutosCarga: paradas.reduce((s, p) => s + p.minutos, 0), imposible: true };
}
