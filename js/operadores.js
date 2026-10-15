// operadores.js — las empresas de recarga más comunes en España y su app.
// Sirve para decir en cada cargador «cómo se paga aquí» sin tener las 20 apps instaladas.
// Abrir la App Store con una búsqueda (no con el enlace de la ficha) evita enlaces caducados.

export const OPERADORES = [
  { id: 'zunder', nombre: 'Zunder', re: /zunder|easycharger/i, app: 'Zunder', web: 'https://zunder.com' },
  { id: 'ionity', nombre: 'Ionity', re: /ionity/i, app: 'IONITY', web: 'https://ionity.eu' },
  { id: 'endesa', nombre: 'Endesa X Way', re: /endesa/i, app: 'Endesa X Way', web: 'https://www.endesax.com' },
  { id: 'iberdrola', nombre: 'Iberdrola', re: /iberdrola/i, app: 'Iberdrola Movilidad', web: 'https://www.iberdrola.es/movilidad-electrica' },
  { id: 'repsol', nombre: 'Repsol', re: /repsol|waylet|ibil/i, app: 'Waylet', web: 'https://www.repsol.es/particulares/movilidad-electrica/' },
  { id: 'moeve', nombre: 'Moeve (Cepsa)', re: /moeve|cepsa/i, app: 'Moeve Gow', web: 'https://www.moeveglobal.com' },
  { id: 'tesla', nombre: 'Tesla', re: /tesla/i, app: 'Tesla', web: 'https://www.tesla.com/es_es/supercharger', nota: 'Muchos Supercargadores de Tesla ya admiten otras marcas: se paga con la app de Tesla.' },
  { id: 'wenea', nombre: 'Wenea', re: /wenea/i, app: 'Wenea', web: 'https://wenea.com' },
  { id: 'electra', nombre: 'Electra', re: /electra\b/i, app: 'Electra', web: 'https://www.go-electra.com' },
  { id: 'atlante', nombre: 'Atlante', re: /atlante/i, app: 'myAtlante', web: 'https://www.atlante.energy' },
  { id: 'eranovum', nombre: 'Eranovum', re: /eranovum/i, app: 'Eranovum', web: 'https://eranovum.com' },
  { id: 'placetoplug', nombre: 'Place to Plug', re: /place ?to ?plug/i, app: 'Place to Plug', web: 'https://placetoplug.com' },
  { id: 'totalenergies', nombre: 'TotalEnergies', re: /totalenergies/i, app: 'TotalEnergies', web: 'https://totalenergies.es' },
  { id: 'edp', nombre: 'EDP', re: /\bedp\b/i, app: 'EDP Charge', web: 'https://www.edpenergia.es' },
  { id: 'galp', nombre: 'Galp', re: /galp/i, app: 'Galp Electric', web: 'https://galp.com/es' },
  { id: 'etecnic', nombre: 'Etecnic', re: /etecnic|ev charge/i, app: 'EV Charge', web: 'https://etecnic.es' },
  { id: 'estabanell', nombre: 'Estabanell', re: /estabanell/i, app: 'Estabanell', web: 'https://www.estabanell.cat' },
  { id: 'bonarea', nombre: 'bonÀrea', re: /bon[aà]rea/i, app: 'bonÀrea CarPay', web: 'https://www.bonarea.com' },
  { id: 'bsm', nombre: 'Endolla Barcelona', re: /endolla|barcelona de serveis|\bbsm\b/i, app: 'Endolla Barcelona', web: 'https://www.endollabarcelona.cat' },
  { id: 'allego', nombre: 'Allego', re: /allego/i, app: 'Allego', web: 'https://www.allego.eu' },
  { id: 'fastned', nombre: 'Fastned', re: /fastned/i, app: 'Fastned', web: 'https://fastnedcharging.com' },
  { id: 'powerdot', nombre: 'Powerdot', re: /powerdot/i, app: 'Powerdot', web: 'https://powerdot.eu' },
  { id: 'plenitude', nombre: 'Plenitude', re: /plenitude/i, app: 'Plenitude On The Road', web: 'https://eniplenitude.es' },
  { id: 'chargingtogether', nombre: 'Charging Together', re: /charging together/i, app: 'Electromaps', web: 'https://www.electromaps.com' },
  { id: 'mer', nombre: 'Mer', re: /\bmer\b/i, app: 'Mer', web: 'https://mer.eco' },
];

// Las dos que valen para casi todo (pagan en cargadores de muchas empresas).
export const COMODINES = [
  { nombre: 'Electromaps', app: 'Electromaps', que: 'Paga en miles de cargadores de muchas empresas y enseña si están libres.' },
  { nombre: 'Chargemap', app: 'Chargemap', que: 'Igual: una cuenta y un llavero para muchísimas empresas, también en Europa.' },
];

export const operadorDe = (...textos) => OPERADORES.find((o) => textos.some((t) => o.re.test(t || ''))) || null;

export const enlaceApp = (app) => `itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=${encodeURIComponent(app)}`;
