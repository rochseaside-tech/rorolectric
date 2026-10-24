// coche-vivo.js — el estado del coche al momento, desde la nube de MyChangan (solo Deepal).
// La app pregunta a nuestro intermediario de Cloudflare (worker/changan.js), que habla con Changan.
// La sesión (la «llave» de la cuenta) se guarda SOLO en este móvil; el intermediario no guarda nada.
// Solo lee: no abre, no cierra, no manda órdenes al coche.
import { COCHE, conexion, guardarConexion, ponerBateria, bateria, ajustes, cambiarAjuste } from './datos.js';

const PUENTE = 'https://rorolectric.rorolectric.workers.dev';

export const puedeConectar = () => COCHE.marca === 'Deepal';
export const conectado = () => !!conexion()?.sesion;
export const ultimoDelCoche = () => conexion()?.ultimo || null;

async function llamar(ruta, cuerpo) {
  let r;
  try { r = await fetch(PUENTE + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }); }
  catch { throw new Error('Sin conexión a internet'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) { const e = new Error(d.error || `Error ${r.status}`); e.tipo = d.tipo; throw e; }
  return d;
}

// Un «móvil» fijo por cuenta, como la app oficial (32 caracteres hexadecimales).
function idMovil() {
  const c = conexion();
  if (c?.deviceId) return c.deviceId;
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  guardarConexion({ ...(c || {}), deviceId: id });
  return id;
}

export async function pedirCodigo(email) {
  const deviceId = idMovil();
  await llamar('/changan/codigo', { email, deviceId });
  guardarConexion({ ...conexion(), email });
}

// La app oficial manda la mitad pública de una llave RSA propia al entrar (sirve para firmar órdenes,
// que aquí no se usan): se crea una nueva y la privada ni se guarda.
async function llavePublica() {
  for (const bits of [1024, 2048]) {
    try {
      const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
      const spki = new Uint8Array(await crypto.subtle.exportKey('spki', par.publicKey));
      const b64 = btoa(String.fromCharCode(...spki));
      return b64.match(/.{1,64}/g).join('\n') + '\n';
    } catch { /* el navegador no deja ese tamaño: se prueba el siguiente */ }
  }
  return '';
}

export async function conectar(codigo) {
  const c = conexion() || {};
  if (!c.email) throw new Error('Primero pide el código');
  const d = await llamar('/changan/entrar', { email: c.email, codigo, deviceId: idMovil(), pubKey: await llavePublica() });
  if (!d.coches?.length) throw new Error('Has entrado, pero esa cuenta no tiene ningún coche. Si usas una cuenta secundaria, comparte antes el coche desde la principal.');
  guardarConexion({ ...conexion(), sesion: d.sesion, carId: d.coches[0].carId, coche: d.coches[0], coches: d.coches, ultimo: null });
  return d.coches[0];
}

export function desconectar() {
  const c = conexion();
  guardarConexion(c ? { email: c.email, deviceId: c.deviceId } : null);
}

let enCurso = null;
// Pregunta al coche. Sin «forzar», si la última respuesta tiene menos de 3 minutos, se usa esa.
// Cuando llega: pone el % de batería de la app y los km del cuentakilómetros (para los avisos de revisión).
export function leerCoche({ forzar = false } = {}) {
  const c = conexion();
  if (!c?.sesion) return Promise.resolve(null);
  if (!forzar && c.ultimo && Date.now() - c.leido < 3 * 60e3) return Promise.resolve(c.ultimo);
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      const d = await llamar('/changan/estado', { sesion: c.sesion, carId: c.carId });
      const { crudo, ...e } = d.estado;
      guardarConexion({ ...conexion(), ...(d.sesion ? { sesion: d.sesion } : {}), ultimo: e, crudo, leido: Date.now(), error: null });
      if (e.pct != null && (!bateria().fecha || new Date(e.fecha) >= new Date(bateria().fecha) || bateria().delCoche)) ponerBateria(e.pct, { fecha: e.fecha, delCoche: true });
      if (e.odometro > 0 && +e.odometro > +(ajustes().kmActuales || 0)) cambiarAjuste('kmActuales', Math.round(e.odometro));
      return e;
    } catch (err) {
      // La sesión caducó o se abrió en otro móvil con la misma cuenta: hay que volver a entrar.
      if (err.tipo === 'sesion') { desconectar(); guardarConexion({ ...conexion(), error: 'La sesión se ha cerrado (¿has entrado con la misma cuenta en la app oficial?). Vuelve a conectar en Ajustes.' }); }
      throw err;
    } finally { enCurso = null; }
  })();
  return enCurso;
}

// Textos cortos para pintar el estado.
export function haceCuanto(iso) {
  const min = (Date.now() - new Date(iso)) / 60e3;
  if (!Number.isFinite(min)) return '';
  if (min < 2) return 'ahora mismo';
  if (min < 60) return `hace ${Math.round(min)} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}
// Presión: unas nubes la dan en kPa (250) y otras en bar (2,5).
export const bar = (v) => (v == null ? null : v > 20 ? v / 100 : v);
export function avisoRuedas(presiones) {
  const b = (presiones || []).map(bar).filter((x) => x != null && x > 0);
  if (b.length < 4) return '';
  const baja = Math.min(...b), alta = Math.max(...b);
  if (baja < 2.0) return `Una rueda está baja (${baja.toFixed(1).replace('.', ',')} bar): revísala`;
  if (alta - baja >= 0.3) return 'Las ruedas no tienen la misma presión: iguálalas';
  return '';
}
