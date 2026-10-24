// Conexión con la nube de Changan/Deepal (la que usa la app MyChangan) para leer el estado del coche.
// No es una API oficial: está reconstruida por dueños de Deepal (github.com/danperks/ha-deepal,
// github.com/manuelem1984/dec_deepal, probado con un S05 de España). Si Changan la cambia, esto deja de ir.
// SOLO LEE: no abre puertas ni manda órdenes al coche.
//
// Nada se guarda aquí: la sesión (tokens) vive en el móvil y viaja en cada petición.
//   POST /changan/codigo  { email, deviceId }                       → manda el código al correo
//   POST /changan/entrar  { email, codigo, deviceId, pubKey } → { sesion, coches }
//   POST /changan/estado  { sesion, carId }                 → { estado, sesion? (si se renovó) }
import { connect } from 'cloudflare:sockets';

const INTL = 'https://m.iov.changanauto.com.de';
const CA = 'https://ca-m.iov.changanauto.com.de';
const PAIS = 'ES';
// Clave pública con la que la app oficial cifra el correo y el teléfono (RSA PKCS#1 v1.5).
const CLAVE_APP = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkyhr43cBPTJ3jLiYsmbUwUp74cMJIOju5vqVzgtuK63Q99qV6iVT8wN5cXlyMtWI2mfOmhIao/fUN821im69MfOHsWXdqQEo5e9v654GPw+bju0pCphEPtD1I0VcyS34QkAu04urSun2U1q3Dr2OICLVWSnLa+01ioKxkaB0D209zXcls2eFQpvRAWm7xxVsoqzSwqp+neu5quOpn+eO/bW0TxcSQ8VZcDEUvadRTLSR0eOWgRuHIBiD2RGqPIPzKCm5A14q1qhxUZ8U0pmYe0Sx7eMy4RVe2iW7fnjc6pxTUMBkercSL26mevYouuCKqyie+LVQAtGa29RMl/lyiwIDAQAB';

export class ErrorChangan extends Error {
  constructor(msg, tipo = 'error') { super(msg); this.tipo = tipo; }
}

// ---------- Utilidades ----------
const texto = new TextEncoder(), deTexto = new TextDecoder();
const b64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const deB64 = (s) => Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const unir = (...partes) => { const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0)); let i = 0; for (const p of partes) { out.set(p, i); i += p.length; } return out; };

// RSA PKCS#1 v1.5 (cifrado). WebCrypto solo trae OAEP, que el servidor rechaza: se hace a mano con BigInt.
function leerDer(bytes, i) {
  const tag = bytes[i++]; let largo = bytes[i++];
  if (largo & 0x80) { const n = largo & 0x7f; largo = 0; for (let k = 0; k < n; k++) largo = largo * 256 + bytes[i++]; }
  return { tag, ini: i, fin: i + largo };
}
const aBig = (bytes) => BigInt('0x' + ([...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') || '0'));
function potMod(base, exp, mod) {
  let r = 1n; base %= mod;
  while (exp > 0n) { if (exp & 1n) r = (r * base) % mod; base = (base * base) % mod; exp >>= 1n; }
  return r;
}
function cifrarRsa(valor) {
  const der = deB64(CLAVE_APP);
  const spki = leerDer(der, 0);
  const algoritmo = leerDer(der, spki.ini);
  const bits = leerDer(der, algoritmo.fin);
  const rsa = leerDer(der, bits.ini + 1); // +1: byte de «bits sobrantes» del BIT STRING
  const n = leerDer(der, rsa.ini), e = leerDer(der, n.fin);
  const mod = aBig(der.slice(n.ini, n.fin)), exp = aBig(der.slice(e.ini, e.fin));
  const k = Math.ceil(mod.toString(16).length / 2);
  const datos = texto.encode(valor);
  const relleno = new Uint8Array(k - datos.length - 3);
  crypto.getRandomValues(relleno);
  for (let i = 0; i < relleno.length; i++) while (relleno[i] === 0) relleno[i] = (crypto.getRandomValues(new Uint8Array(1))[0]);
  const bloque = unir(new Uint8Array([0, 2]), relleno, new Uint8Array([0]), datos);
  const hex = potMod(aBig(bloque), exp, mod).toString(16).padStart(k * 2, '0');
  return b64(Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16)));
}

// MD5 (para el IV del cifrado AES del coche; WebCrypto no lo trae).
function md5(bytes) {
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const largo = bytes.length, total = ((largo + 8) >> 6) + 1 << 6;
  const m = new Uint8Array(total); m.set(bytes); m[largo] = 0x80;
  const bitsLargo = largo * 8; new DataView(m.buffer).setUint32(total - 8, bitsLargo >>> 0, true); new DataView(m.buffer).setUint32(total - 4, Math.floor(bitsLargo / 2 ** 32), true);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  const dv = new DataView(m.buffer);
  for (let off = 0; off < total; off += 64) {
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let f, g; const r = i >> 4;
      if (r === 0) { f = (b & c) | (~b & d); g = i; } else if (r === 1) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; } else if (r === 2) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const s = S[r * 4 + (i % 4)];
      const x = (a + f + K[i] + dv.getUint32(off + g * 4, true)) | 0;
      a = d; d = c; c = b; b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  const out = new Uint8Array(16), o = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => o.setUint32(i * 4, v, true));
  return out;
}

async function comprimir(bytes, modo) {
  const s = new Blob([bytes]).stream().pipeThrough(modo === 'gzip' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const claveAes = (secreto) => crypto.subtle.importKey('raw', texto.encode(secreto), 'AES-CBC', false, ['encrypt', 'decrypt']);
// Lo que va al coche: base64(gzip(JSON)) cifrado con AES-CBC, IV = MD5(id de la petición).
async function cifrarCoche(datos, secreto, r) {
  const dentro = texto.encode(b64(await comprimir(texto.encode(JSON.stringify(datos)), 'gzip')));
  return b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: md5(texto.encode(r)) }, await claveAes(secreto), dentro)));
}
async function descifrarCoche(cifrado, secreto, r) {
  const plano = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: md5(texto.encode(r)) }, await claveAes(secreto), deB64(cifrado));
  const json = deTexto.decode(await comprimir(deB64(deTexto.decode(plano).trim()), 'gunzip'));
  const v = JSON.parse(json);
  return Array.isArray(v) ? v : [];
}

// ---------- Peticiones a la nube ----------
const cabeceras = (deviceId, sesion = null, tsp = null) => {
  const h = {
    appid: 'ca', language: 'en_US', appversion: 'V1.12.0', apptype: 'Android', devicetype: 'samsung',
    deviceid: deviceId, selectcountry: PAIS, 'x-os-version': '9', 'accept-language': 'en_US',
    'content-type': 'application/json; charset=UTF-8', 'user-agent': 'okhttp/4.12.0',
  };
  if (sesion?.token) {
    h.authorization = sesion.cac && !sesion.token.includes('|') ? `${sesion.token}|${sesion.cac}` : sesion.token;
    h['X-Tsp-User-Token'] = h['X-VCS-User-Token'] = tsp || sesion.token.split('|')[0];
  }
  return h;
};

async function post(base, ruta, cuerpo, deviceId, sesion = null, tsp = null) {
  const r = await fetch(base + ruta, { method: 'POST', headers: cabeceras(deviceId, sesion, tsp), body: JSON.stringify(cuerpo || {}) });
  if (r.status === 401 || r.status === 403) throw new ErrorChangan('Sesión caducada', 'sesion');
  if (!r.ok) throw new ErrorChangan(`Changan respondió ${r.status}`);
  const d = await r.json();
  if (d?.success === false) {
    const code = String(d.code || '');
    if (code === 'CAC_1_1_01_033') throw new ErrorChangan('Changan pide esperar un poco antes de volver a preguntar', 'espera');
    if (/AUTH/i.test(code) || code.startsWith('401') || code === 'APP_1_1_02_004' || code === 'APP_1_1_02_005') throw new ErrorChangan('Sesión caducada', 'sesion');
    throw new ErrorChangan(`${d.msg || 'Error de Changan'} (${code})`, code.startsWith('APIGW_') ? 'apigw' : 'error');
  }
  return d?.data;
}

// La pasarela «CA» (la del MQTT) acepta según la cuenta el token normal o el cacToken.
async function postCa(ruta, cuerpo, s) {
  try { return await post(CA, ruta, cuerpo, s.deviceId, s); } catch (e) {
    if (e.tipo !== 'apigw' || !s.cac) throw e;
    return post(CA, ruta, cuerpo, s.deviceId, s, s.cac);
  }
}

export async function pedirCodigo({ email, deviceId }) {
  if (!/^\S+@\S+\.\S+$/.test(email || '')) throw new ErrorChangan('Correo no válido');
  if (!/^[0-9a-f]{32}$/.test(deviceId || '')) throw new ErrorChangan('deviceId');
  await post(INTL, '/intl-app-gw/intl-app-auth/api/login/email-send-auth-code', { type: '0', email: cifrarRsa(email.trim()) }, deviceId);
  return { ok: true };
}

export async function entrar({ email, codigo, deviceId, pubKey }) {
  if (!/^[0-9a-f]{32}$/.test(deviceId || '')) throw new ErrorChangan('deviceId');
  const d = await post(INTL, '/intl-app-gw/intl-app-auth/api/login/email-code-in',
    { authCode: String(codigo || '').trim(), salesCountry: PAIS, email: cifrarRsa(String(email || '').trim()), pubKey: pubKey || '' }, deviceId);
  if (!d?.token) throw new ErrorChangan('Changan no ha dado la sesión (¿código bien escrito?)');
  const sesion = { token: String(d.token), refresh: d.refreshToken || null, cac: d.cacToken || null, userId: d.userId || d.caUserId || d.cacUserId || null, deviceId };
  const coches = await post(INTL, '/intl-app-gw/intl-app-user/api/car/vehicles', {}, deviceId, sesion);
  return { sesion, coches: (Array.isArray(coches) ? coches : []).map(resumirCoche) };
}

const resumirCoche = (c) => ({ carId: String(c.carId), vin: c.vin || '', modelo: c.modelName || c.seriesName || 'Deepal', protocolo: c.protocolType || '', imagen: c.imageUrl || c.vehicleImage || c.picUrl || null });

async function renovar(s) {
  if (!s.refresh) throw new ErrorChangan('Sesión caducada', 'sesion');
  const d = await post(INTL, '/intl-app-gw/intl-app-auth/api/auth/refresh-token', { refreshToken: s.refresh }, s.deviceId, s);
  if (!d?.token) throw new ErrorChangan('Sesión caducada', 'sesion');
  return { ...s, token: String(d.token), refresh: d.refreshToken || s.refresh, cac: d.cacToken || s.cac };
}

export async function estado({ sesion, carId }) {
  if (!sesion?.token || !sesion.deviceId) throw new ErrorChangan('Sin sesión', 'sesion');
  let s = sesion, renovada = false;
  const intento = async () => {
    const coches = await post(INTL, '/intl-app-gw/intl-app-user/api/car/vehicles', {}, s.deviceId, s);
    const coche = (coches || []).find((c) => String(c.carId) === String(carId)) || coches?.[0];
    if (!coche) throw new ErrorChangan('Esta cuenta no tiene ningún coche');
    const id = String(coche.carId);
    const crudo = String(coche.protocolType || '').toUpperCase() === 'MQTT' ? await porMqtt(s, id) : await porRest(s, id);
    return { coche: resumirCoche(coche), ...traducir(crudo) };
  };
  let res;
  try { res = await intento(); } catch (e) {
    // Un token caducado no siempre llega como «sesión»: COMMON_1_1_01_001 también puede serlo.
    if (e.tipo !== 'sesion' && !/COMMON_1_1_01_001/.test(e.message)) throw e;
    s = await renovar(s); renovada = true;
    res = await intento();
  }
  return renovada ? { estado: res, sesion: s } : { estado: res };
}

async function porRest(s, id) {
  const d = await post(INTL, '/intl-app-gw/intl-app-car-condition/api/vehicle/condition', {
    vechileCriteria: { seat: '1', door: '1', hvac: '1', charge: '1', lamp: '1', window: '1', tire: '1', vehicleStatus: '1', location: '1' }, vehicleId: id,
  }, s.deviceId, s);
  const plano = {};
  const aplanar = (o) => { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === 'object' && !Array.isArray(v)) aplanar(v); else plano[k] = v; } };
  aplanar(d);
  return { ...plano, _rest: true, latestDate: d?.lastUpdatedAt };
}

// ---------- MQTT (el S05 manda su estado así) ----------
const cadena = (s) => { const b = texto.encode(s); return unir(new Uint8Array([b.length >> 8, b.length & 255]), b); };
function largoRestante(n) { const out = []; do { let x = n % 128; n = Math.floor(n / 128); if (n) x |= 128; out.push(x); } while (n); return new Uint8Array(out); }
const paquete = (tipo, cuerpo) => unir(new Uint8Array([tipo]), largoRestante(cuerpo.length), cuerpo);
const pConectar = (id, pass) => paquete(0x10, unir(cadena('MQTT'), new Uint8Array([4, 0xC2, 0, 60]), cadena(id), cadena(id), cadena(pass)));
const pSuscribir = (temas) => paquete(0x82, unir(new Uint8Array([0, 1]), ...temas.map((t) => unir(cadena(t), new Uint8Array([1])))));
const pPublicar = (tema, datos) => paquete(0x30, unir(cadena(tema), texto.encode(JSON.stringify(datos))));
const didDe = (tema) => { const p = tema.split('/'); return p.length > 2 && p[0] === '$vdp' ? p[1] : null; };
const idPeticion = (did) => `${did}_${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

class Lector {
  constructor(r) { this.r = r; this.buf = new Uint8Array(0); }
  async bytes(n, limite) {
    while (this.buf.length < n) {
      const falta = limite - Date.now();
      if (falta <= 0) throw new ErrorChangan('El coche no ha respondido a tiempo', 'tiempo');
      const { value, done } = await Promise.race([this.r.read(), new Promise((ok) => setTimeout(() => ok({ tiempo: true }), falta))]);
      if (done) throw new ErrorChangan('Conexión cerrada por Changan');
      if (value) this.buf = unir(this.buf, value);
    }
    const out = this.buf.slice(0, n); this.buf = this.buf.slice(n); return out;
  }
  async paquete(limite) {
    const [primero] = await this.bytes(1, limite);
    let mult = 1, largo = 0, b;
    do { [b] = await this.bytes(1, limite); largo += (b & 127) * mult; mult *= 128; } while (b & 128);
    return { primero, cuerpo: await this.bytes(largo, limite) };
  }
}

async function porMqtt(s, id) {
  if (!s.userId) throw new ErrorChangan('Falta el usuario: vuelve a conectar', 'sesion');
  const conf = await postCa('/user-apigw/vot-connect-conf-center/api/device/getConnConf',
    { deviceId: s.deviceId, carId: id, deviceType: 1, confTimestamp: 0, deviceTimestamp: String(Date.now()) }, s);
  const auth = await postCa('/user-apigw/vot-connect-auth-center/api/auth/getAuthTokenByUserId', { userId: s.userId }, s);
  if (!auth?.authToken) throw new ErrorChangan('Changan no dio permiso para leer el coche');
  const info = conf?.mqttConnectionInfos?.[0] || {}, cluster = info.clusterInfos?.[0] || {};
  const host = String(cluster.brokerUrl || '').replace('ssl://', ''), puerto = +cluster.brokerPort || 8883;
  let temaLogin = null, didLogin = null, temaPedir = null, didCoche = null; const temas = [];
  for (const t of info.topicInfos || []) {
    for (const p of t.pubTopics || []) {
      if (t.msgType === 'loginout' && p.includes('/loginout/req')) { temaLogin = p; didLogin = didDe(p); }
      if (t.msgType === 'properties' && p.includes('/properties/get/req')) { temaPedir = p; didCoche = didDe(p); }
    }
    for (const p of t.subTopics || []) {
      if (!p.includes('/commands/') && !p.includes('/set/')) temas.push(p);
      if (!didCoche && p.includes('/properties/')) didCoche = didDe(p);
    }
  }
  if (!host || !temaLogin || !didLogin || !temaPedir || !didCoche) throw new ErrorChangan('Changan no dio los datos de conexión del coche');

  const sock = connect({ hostname: host, port: puerto }, { secureTransport: 'on' });
  const w = sock.writable.getWriter(), lector = new Lector(sock.readable.getReader());
  const limite = Date.now() + 20000;
  try {
    await w.write(pConectar(didLogin, String(auth.authToken)));
    const ack = await lector.paquete(limite);
    if (ack.primero !== 0x20 || ack.cuerpo[1] !== 0) throw new ErrorChangan(`Changan rechazó la conexión (${ack.cuerpo[1]})`);
    await w.write(pSuscribir([...new Set(temas)].sort()));
    await lector.paquete(limite);
    await w.write(pPublicar(temaLogin, {
      did: didLogin, r: idPeticion(didLogin), v: 'v1.0.0', mt: 'loginout', z: 'unzip', a: 0, e: 0, tf: 0, dt: new Date().toISOString(), pl: true,
      sers: [{ service_code: 'login', params: { encryptEnable: 1, zipType: 'gzip', ts: Date.now() } }],
    }));
    let secreto = null, pedido = false; const parcial = {};
    while (Date.now() < limite) {
      const { primero, cuerpo } = await lector.paquete(limite);
      if (primero >> 4 !== 3) continue;
      const lt = (cuerpo[0] << 8) | cuerpo[1];
      const tema = deTexto.decode(cuerpo.slice(2, 2 + lt));
      let pos = 2 + lt;
      if ((primero >> 1) & 3) { await w.write(new Uint8Array([0x40, 2, cuerpo[pos], cuerpo[pos + 1]])); pos += 2; }
      let datos; try { datos = JSON.parse(deTexto.decode(cuerpo.slice(pos))); } catch { continue; }
      if (!secreto) {
        for (const it of Array.isArray(datos.rs) ? datos.rs : []) secreto ||= it?.params?.secretKey || it?.data?.secretKey || null;
        if (secreto) {
          const r = idPeticion(didCoche);
          await w.write(pPublicar(temaPedir, {
            did: didCoche, r, v: 'v1.0.0', mt: 'properties', e: 1, z: 'gzip', tf: 0, dt: new Date().toISOString(), b: { ruid: didLogin },
            sers: await cifrarCoche([{ service_code: 'car_condition', params: { fetchPropertyType: 0 } }], secreto, r), rt: '',
          }));
          pedido = true;
        }
        continue;
      }
      if (typeof datos.r !== 'string') continue;
      const params = {};
      for (const campo of ['rs', 'sers']) {
        if (typeof datos[campo] !== 'string' || !datos[campo]) continue;
        try {
          for (const it of await descifrarCoche(datos[campo], secreto, datos.r)) {
            if ([undefined, null, 'car_condition', 'BDC_Service', 'BMS_Service', 'OBC_Service', 'THU_Service'].includes(it?.service_code) && it.params && typeof it.params === 'object') Object.assign(params, it.params);
          }
        } catch { /* trozo que no se deja descifrar: se ignora */ }
      }
      if (tema.endsWith('/properties/get/res') && Object.keys(params).length > 10) return params;
      Object.assign(parcial, params);
      if (pedido && Object.keys(parcial).length > 30) return parcial;
    }
    if (Object.keys(parcial).length) return parcial;
    throw new ErrorChangan('El coche no ha mandado su estado (puede estar dormido sin cobertura)', 'tiempo');
  } catch (e) {
    if (e.tipo === 'tiempo') throw new ErrorChangan('El coche no ha respondido a tiempo (si está en un garaje sin cobertura, es normal)', 'tiempo');
    throw e;
  } finally {
    try { await w.write(new Uint8Array([0xE0, 0])); } catch { /* ya cerrada */ }
    try { await sock.close(); } catch { /* ya cerrada */ }
  }
}

// ---------- De los nombres del coche a los de la app ----------
const numero = (v) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? null : n; };
const primero = (p, ...claves) => { for (const k of claves) if (p[k] != null && p[k] !== '') return p[k]; return null; };
function buscarPos(o, prof = 0) {
  if (!o || typeof o !== 'object' || prof > 4) return null;
  const lat = numero(o.lat ?? o.latitude), lon = numero(o.lng ?? o.lon ?? o.longitude);
  if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) return [lat, lon];
  for (const v of Object.values(o)) { const r = buscarPos(v, prof + 1); if (r) return r; }
  return null;
}
const ESTADO_CARGA = { 0: 'no', 1: 'enchufado', 2: 'enchufado', 3: 'cargando', 4: 'cargando' };

function traducir(p) {
  const fecha = primero(p, 'latestDate', 'lastUpdatedAt');
  const cs = numero(primero(p, 'ChrgSts', 'chargeStatus'));
  const min = numero(primero(p, 'chargDeltMins', 'remainChargeTime'));
  const ac = numero(primero(p, 'BattACChrgInCurr', 'battACChrgInCurr', 'acChargeCurrent')), dc = numero(primero(p, 'BattDCChrgInCurr', 'battDCChrgInCurr', 'dcChargeCurrent'));
  const puertas = ['driverDoor', 'passengerDoor', 'leftRearDoor', 'rightRearDoor'].map((k) => numero(p[k]));
  const cierres = ['driverDoorLock', 'passengerDoorLock'].map((k) => numero(p[k]));
  const ventanas = ['diverWindow', 'passengerWindow', 'leftRearWindow', 'rightRearWindow'].map((k) => numero(p[k]));
  const presion = ['lfTyrePressure', 'rfTyrePressure', 'lrTyrePressure', 'rrTyrePressure'].map((k) => numero(p[k]));
  const tempDentro = numero(primero(p, 'vehicleTemperature', 'insideTemp'));
  const fechaMs = typeof fecha === 'number' ? fecha : Date.parse(fecha || '');
  return {
    fecha: Number.isFinite(fechaMs) ? new Date(fechaMs).toISOString() : new Date().toISOString(),
    pct: numero(primero(p, 'soc', 'socDsp', 'remainPower')),
    kmCoche: numero(primero(p, 'remainedPowerMile', 'totalResidualMileage', 'drvMileage')),
    odometro: numero(primero(p, 'totalOdometer', 'totalMileage')),
    carga: { estado: cs == null ? null : ESTADO_CARGA[cs] || null, dc: cs === 2 || cs === 4 ? true : cs === 1 || cs === 3 ? false : null, minutos: min != null && min > 0 && min < 8191 ? min : null, amperios: cs === 4 ? dc : cs === 3 ? ac : null },
    encendido: numero(primero(p, 'powerStatusFeedBack', 'powerStatus')),
    puertasAbiertas: puertas.some((x) => x === 1), puertasConocidas: puertas.some((x) => x != null),
    cerrado: cierres.every((x) => x == null) ? null : cierres.every((x) => x === 1),
    ventanasAbiertas: ventanas.some((x) => x != null && x > 0),
    maleteroAbierto: numero(p.trunk) === 1,
    presiones: presion.some((x) => x != null) ? presion : null,
    tempDentro: tempDentro != null && p._rest ? tempDentro / 10 : tempDentro,
    clima: numero(primero(p, 'airStatus', 'acStatus')) === 1,
    posicion: buscarPos(p),
    crudo: p,
  };
}
