// Pruebas de las cuentas: node test-calc.mjs
import assert from 'node:assert/strict';
import { minutosDC, horasAC, kmCon, pctTras, planViaje, ventanaBarata, tramo, resumen, puntoEnRuta, consumo } from './js/calc.js';

// Catálogo: 30→80 % en ~15 min en un cargador potente.
const m = minutosDC(30, 80, 200);
assert.ok(m > 13 && m < 18, `30→80 en ${m} min`);
// Un cargador de 50 kW tarda más.
assert.ok(minutosDC(30, 80, 50) > 35);
// Wallbox 7,4 kW: 20→100 % ≈ 8 h; con 22 kW el coche no pasa de 11.
const h = horasAC(20, 100, 7.4);
assert.ok(h > 7.5 && h < 8.5, `20→100 en ${h} h`);
assert.equal(horasAC(20, 100, 22), horasAC(20, 100, 11));
// Autonomía: 100 % mixto ≈ 380 km; tras 100 km mixto bajas ~26 puntos.
assert.ok(Math.abs(kmCon(100, 17.5) - 383) < 3);
assert.ok(Math.abs(pctTras(100, 80, 17.5) - 53.9) < 0.5);
// Consumo propio manda sobre la estimación.
assert.equal(consumo('mixto', 20, { consumoReal: { mixto: 16 } }), 16);
assert.equal(consumo('mixto', 20, { consumoReal: {} }), 17.5);

// Viaje corto: sin paradas. Largo (Barcelona-Madrid ~620 km a 120): 2 paradas.
assert.equal(planViaje(150, 90, 21).paradas.length, 0);
const v = planViaje(620, 100, 21);
assert.equal(v.paradas.length, 2, JSON.stringify(v));
assert.ok(v.llegada >= 15);
// Ida corta saliendo casi vacío: parada en el km 0.
assert.equal(planViaje(200, 5, 21).paradas[0].km, 0);

// Tramos 2.0TD
assert.equal(tramo(new Date('2026-10-14T03:00')), 'valle');   // miércoles
assert.equal(tramo(new Date('2026-10-14T11:00')), 'punta');
assert.equal(tramo(new Date('2026-10-14T16:00')), 'llano');
assert.equal(tramo(new Date('2026-10-17T11:00')), 'valle');   // sábado
assert.equal(tramo(new Date('2026-10-12T11:00')), 'valle');   // festivo

// Ventana barata: elige las horas baratas dentro del límite.
const base = new Date(Date.now() + 3600e3); base.setMinutes(0, 0, 0);
const precios = [0.30, 0.30, 0.10, 0.10, 0.30, 0.05, 0.05].map((eur, i) => ({ hora: new Date(base.getTime() + i * 3600e3), eur }));
const v1 = ventanaBarata(precios, 14, 7);                     // 2 h de carga
assert.equal(v1.idx, 5);
const limite = new Date(base.getTime() + 5 * 3600e3);
assert.equal(ventanaBarata(precios, 14, 7, limite).idx, 2);   // tiene que acabar antes

// Resumen: €/100 km con lecturas de km.
const r = resumen([
  { id: 'a', fecha: '2026-10-01', kwh: 40, euros: 6, km: 1000 },
  { id: 'b', fecha: '2026-10-05', kwh: 30, euros: 15, km: 1300 },
  { id: 'c', fecha: '2026-10-09', kwh: 20, euros: 3, km: 1500 },
], { gasolinaL100: 6, gasolinaPrecio: 1.5 });
assert.equal(r.kmHechos, 500);
assert.equal(r.eur100, 18 / 500 * 100);
assert.equal(r.gasolina100, 9);

// Punto en ruta
const p = puntoEnRuta([[41, 2], [42, 2]], 55.6);
assert.ok(Math.abs(p[0] - 41.5) < 0.01);

console.log('Todo bien ✔');

// Planificador con cargadores reales: elige el último alcanzable, no un punto teórico.
import { planConCargadores } from './js/calc.js';
const cs = [{ kmRuta: 100, desvio: 0.5, potencia: 150 }, { kmRuta: 250, desvio: 1, potencia: 50 }, { kmRuta: 260, desvio: 0.2, potencia: 180 }, { kmRuta: 400, desvio: 0, potencia: 150 }];
const pc = planConCargadores(500, 100, 21, cs);
assert.equal(pc.paradas[0].cargador.kmRuta, 260, JSON.stringify(pc.paradas.map((p) => p.km)));
assert.ok(pc.llegada >= 15);
// Sin cargadores conocidos: parada teórica igual que antes.
assert.equal(planConCargadores(620, 100, 21, []).paradas.length, 2);
console.log('Planificador con cargadores ✔');

// Consumo medido con las cargas; % durante una carga.
import { consumoMedido, pctTrasMinutos } from './js/calc.js';
const cm = consumoMedido([
  { id: 'a', fecha: '2026-10-01', kwh: 40, km: 1000, lugar: 'casa' },
  { id: 'b', fecha: '2026-10-05', kwh: 30, km: 1200, lugar: 'casa' },
  { id: 'c', fecha: '2026-10-09', kwh: 30, km: 1400, lugar: 'casa' },
]);
assert.ok(Math.abs(cm.kwh100 - 13.5) < 0.01, JSON.stringify(cm));
assert.equal(consumoMedido([{ fecha: '2026-10-01', kwh: 40, km: 1000 }, { fecha: '2026-10-02', kwh: 20, km: 1100 }]), null);
assert.ok(Math.abs(consumo('mixto', 20, { consumoReal: {} }, { kwh100: 16 }) - 16) < 1e-9);
assert.ok(Math.abs(pctTrasMinutos(30, 200, false, minutosDC(30, 80, 200)) - 80) < 0.5);
assert.ok(Math.abs(pctTrasMinutos(20, 7.4, true, horasAC(20, 60, 7.4) * 60) - 60) < 0.5);
console.log('Consumo medido y carga en curso ✔');

// Clima: a 0 °C fuera y 21 dentro, la calefacción pesa mucho más en ciudad que en autovía; templado no gasta.
import { climaKw } from './js/calc.js';
assert.equal(climaKw(19, 21), 0);
assert.ok(Math.abs(climaKw(0, 21, true) - 1.26) < 1e-9);
assert.ok(climaKw(0, 21, false) > climaKw(0, 21, true));
const aj = { consumoReal: {}, tempInterior: 21 };
const extraCiudad = consumo('ciudad', 0, aj) / consumo('ciudad', 20, aj), extraAutovia = consumo('autovia120', 0, aj) / consumo('autovia120', 20, aj);
assert.ok(extraCiudad > extraAutovia, `${extraCiudad} vs ${extraAutovia}`);
assert.equal(consumo('mixto', -2, { ...aj, usoClima: false }), 17.5 * 1.10);
console.log('Clima ✔');

// Desnivel: subir 1.000 m con 2.150 kg ≈ 6,9 kWh; el mismo viaje cuesta arriba necesita más batería.
import { perfilEnergia } from './js/calc.js';
const mu = [{ km: 0 }, { km: 50 }, { km: 100 }];
const pe = perfilEnergia(mu, [0, 500, 1000], 2000);
assert.ok(Math.abs(pe.total - 2150 * 9.81 * 1000 / 3.6e6 / 0.85) < 0.01 && pe.sube === 1000);
const llano = planConCargadores(100, 60, 20, []), subida = planConCargadores(100, 60, 20, [], { perfil: pe.perfil });
assert.ok(subida.llegada < llano.llegada - 8, `${subida.llegada} vs ${llano.llegada}`);
console.log('Desnivel ✔');
