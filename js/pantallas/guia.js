// Guía: lo que hay que saber de un eléctrico en España, con etiqueta de certeza en lo que no es seguro.
import { COCHE } from '../datos.js';
import { OPERADORES, COMODINES, enlaceApp } from '../operadores.js';
import { num, certeza, esc } from '../comun.js';

const S = (emoji, titulo, html, abierta = false) => `<details class="guia" ${abierta ? 'open' : ''}><summary><span class="emoji">${emoji}</span>${titulo}</summary><div class="dentro">${html}</div></details>`;

export function pintar(raiz) {
  raiz.innerHTML = `
    <div class="titulo-pantalla"><h1>Guía</h1><p>Lo que de verdad necesitas saber de tu ${COCHE.nombre}.</p></div>

    ${S('📱', 'Las apps: cuáles necesitas de verdad', `
      <p>Mucha gente con eléctrico acaba con 10, 15 o 20 apps (una por cada empresa de cargadores). <b>No hace falta.</b></p>
      <h3>Imprescindible (1)</h3>
      <ul><li><b>MyChangan</b>: la oficial de tu coche. Encender el clima a distancia, abrir y cerrar, ver la carga. Es la única que habla con el coche: <b>esa no la puede sustituir nadie</b>. <a href="${enlaceApp('MyChangan')}">Instalar</a></li></ul>
      <h3>Todo lo demás: ROROLECTRIC</h3>
      <ul>
        <li><b>Mapa con todos los cargadores de España</b> (los del registro oficial del Ministerio, donde cada empresa está obligada a apuntarlos, más los de OpenStreetMap). Sustituye a PlugShare, Chargemap y Electromaps para buscar.</li>
        <li><b>Viaje</b>: dónde parar y cuánto cargar. Sustituye a ABRP para viajes normales.</li>
        <li><b>Carga en casa</b> a la hora más barata, <b>gastos</b>, <b>recordatorios</b> y esta guía.</li>
      </ul>
      <h3>Para pagar en la calle (0 o 1 app)</h3>
      <ol>
        <li><b>Tarjeta en el poste.</b> Desde abril de 2024, todo cargador rápido nuevo de 50 kW o más tiene que dejar pagar con tarjeta sin registrarte ${certeza('alta')}. Muchos antiguos también lo tienen.</li>
        <li><b>Código QR del poste</b>: te abre una web para pagar con tarjeta. Sin descargar nada.</li>
        <li><b>Una app comodín</b> por si acaso: ${COMODINES.map((c) => `<a href="${enlaceApp(c.app)}">${c.nombre}</a>`).join(' o ')}. Valen en cargadores de muchísimas empresas ${certeza('media')}.</li>
        <li>Solo si un cargador concreto que usas mucho no deja nada de eso, te bajas la app de esa empresa. En cada cargador del mapa te digo cuál es.</li>
      </ol>
      <p class="muy-suave">Lo que ninguna app gratuita «todo en uno» puede hacer: arrancar la carga en los postes de todas las empresas. Cada empresa tiene su sistema cerrado. Por eso lo práctico es tarjeta o QR, más un comodín.</p>`, true)}

    ${S('🏢', 'Apps de cada empresa (por si un día te hace falta)', `
      <p>Las más comunes en España. Toca para buscarla en la App Store.</p>
      <ul class="lista">${OPERADORES.map((o) => `<li><div class="cuerpo"><b>${esc(o.nombre)}</b><span>App: ${esc(o.app)}${o.nota ? ` · ${esc(o.nota)}` : ''}</span></div>
        <a class="boton mini sec" href="${enlaceApp(o.app)}">App Store</a></li>`).join('')}</ul>`)}

    ${S('🔋', 'Cómo cuidar tu batería (LFP)', `
      <p>Tu S05 lleva batería <b>LFP</b> (litio-ferrofosfato). Es de las más duraderas y se cuida distinto que la de un móvil:</p>
      <ul>
        <li><b>Puedes cargar al 100 %</b> en el día a día sin miedo ${certeza('alta')}. Si el manual de Changan dice otra cosa, manda el manual.</li>
        <li><b>Una vez a la semana, al 100 %.</b> Así el coche recalibra el % y no te engaña con la autonomía ${certeza('alta')}. La app te lo recuerda.</li>
        <li>Evita dejarlo <b>días</b> por debajo del 10 %.</li>
        <li>La carga rápida no la estropea por usarla en viajes. Lo que más castiga es mucho calor + carga rápida seguida.</li>
      </ul>`)}

    ${S('⚡', 'Cargar en la calle paso a paso', `
      <ol>
        <li>Busca en el Mapa un punto verde (rápido). Tu coche admite hasta <b>${COCHE.dcMax} kW</b>: un cargador de 300 o 400 no irá más rápido que uno de 200.</li>
        <li>Conector <b>CCS</b> (el grande, con dos agujeros gordos abajo) para rápida; <b>Tipo 2</b> para lenta (hasta ${COCHE.acMax} kW en tu coche).</li>
        <li>Enchufa primero y paga después (tarjeta, QR o app). Si no arranca, desenchufa y repite.</li>
        <li>Carga hasta el <b>80 %</b> en viaje: del 30 al 80 % tarda unos ${COCHE.min30a80} min en el mejor caso; del 80 al 100 % va mucho más lento.</li>
        <li>Al acabar, apúntala en Gastos (desde el propio cargador del mapa: botón «Apuntar»).</li>
      </ol>
      <p class="muy-suave">Ocupar un cargador rápido ya cargado al 100 % suele tener penalización por minuto. Llega, carga y libera.</p>`)}

    ${S('🏠', 'Cargar en casa', `
      <ul>
        <li><b>Enchufe normal</b> (2,3 kW): unas 30 h de 0 a 100 %. Vale para ir rellenando cada noche.</li>
        <li><b>Wallbox de 7,4 kW</b>: unas 10 h de 0 a 100 %. Lo más habitual.</li>
        <li><b>11 kW</b> solo si tienes luz trifásica. Tu coche no carga más rápido que eso en casa.</li>
        <li>La pestaña Cargar te dice <b>a qué hora enchufar</b> para que te salga más barato.</li>
        <li>Con tarifa con tramos (2.0TD), lo barato es de <b>0 a 8 h</b> entre semana y <b>todo el día</b> sábados, domingos y festivos nacionales ${certeza('alta')}.</li>
        <li>Si cargas mucho en casa, mira subir la potencia contratada o una tarifa con un precio de noche más bajo.</li>
      </ul>`)}

    ${S('❄️', 'Frío, calor y autonomía', `
      <ul>
        <li>Tu coche lleva <b>bomba de calor</b> de serie: con frío pierde menos autonomía que otros eléctricos ${certeza('alta')}.</li>
        <li><b>Con frío, pon el clima con MyChangan mientras está enchufado</b>: calienta con la luz de casa y sales con la batería entera.</li>
        <li>Con frío la carga rápida va más lenta. Si el coche permite «precalentar la batería» al poner un cargador en su navegador, úsalo antes de una carga rápida ${certeza('baja')}.</li>
        <li>La versión Pro no lleva asientos ni volante calefactados: el clima es tu amigo.</li>
        <li>A 120 km/h gastas bastante más que a 100-110. Bajar un poco en autovía da muchos km.</li>
      </ul>`)}

    ${S('🔌', 'Tu coche como enchufe (V2L de 6 kW)', `
      <p>Tu S05 puede <b>dar</b> electricidad: hasta ${COCHE.v2l} kW, como un enchufe de casa potente. Para camping, una barbacoa eléctrica, herramientas o un apagón.</p>
      <p>Hace falta el adaptador V2L (se pone en la toma de carga). Pregunta en el concesionario si viene con el coche ${certeza('baja')}.</p>`)}

    ${S('💶', 'Ayudas y ahorros', `
      <ul>
        <li><b>Deducción en la Renta: 15 % del precio, hasta 3.000 €</b> si el coche es nuevo, eléctrico, para uso particular y se matricula a tu nombre en 2026 ${certeza('media')}. Se aplica en la Renta de 2026, la que se presenta en primavera de 2027. Lo recuperó el Real Decreto-ley 7/2026. Guarda la factura de compra.</li>
        <li><b>Punto de recarga en casa: 15 %, hasta 600 €</b> en la Renta si la instalación acaba en 2026 ${certeza('media')}. Guarda la factura del instalador.</li>
        <li>A la base de la deducción se le resta lo que te dieron de ayuda (Plan Auto+, por ejemplo) ${certeza('media')}.</li>
        <li><b>Impuesto de circulación</b>: casi todos los ayuntamientos rebajan mucho el de los eléctricos (lo normal es un 75 %). Mira la ordenanza de tu ayuntamiento o pregunta si se aplica sola ${certeza('baja')}.</li>
        <li><b>Etiqueta CERO</b> de la DGT: entras en todas las zonas de bajas emisiones. En Barcelona y otras ciudades hay descuentos de aparcamiento regulado para los CERO: compruébalo en la de tu ciudad ${certeza('baja')}.</li>
      </ul>`)}

    ${S('🔧', 'Mantenimiento', `
      <ul>
        <li>Mucho menos que un gasolina: sin aceite, sin embrague, frenos que casi no se gastan.</li>
        <li><b>Ruedas</b>: un eléctrico pesa más (el tuyo, ${num(COCHE.peso)} kg) y las gasta antes. Presión una vez al mes.</li>
        <li>Revisiones en el taller oficial cuando diga el libro de mantenimiento, para no perder la <b>garantía: ${COCHE.garantia}</b> (motor eléctrico ${COCHE.garantiaMotor}). Pide por escrito la garantía de la <b>batería</b>.</li>
        <li><b>Primera ITV a los 4 años</b> de la matriculación; luego cada 2 años hasta los 10 ${certeza('alta')}.</li>
        <li>La batería pequeña de 12 V existe también en los eléctricos: si un día el coche no «despierta», suele ser ella.</li>
      </ul>`)}

    ${S('🆘', 'Si te quedas tirada', `
      <ul>
        <li>Llama a la asistencia de tu seguro o la de Changan (apúntala en Ajustes y te sale aquí).</li>
        <li>Pide <b>grúa de plataforma</b>: a un eléctrico no conviene remolcarlo con las ruedas motrices en el suelo ${certeza('media')}.</li>
        <li>Muchas asistencias ya llevan cargador portátil para darte unos km.</li>
      </ul>`)}

    ${S('📋', `Ficha de tu ${COCHE.nombre}`, `
      <table class="ficha">
        <tr><td>Batería</td><td>${num(COCHE.bateria, 1)} kWh ${COCHE.quimica}</td></tr>
        <tr><td>Autonomía oficial (WLTP)</td><td>${COCHE.wltpKm} km</td></tr>
        <tr><td>Consumo oficial</td><td>${num(COCHE.wltpConsumo, 1)} kWh/100 km</td></tr>
        <tr><td>Carga en alterna (casa)</td><td>${COCHE.acMax} kW</td></tr>
        <tr><td>Carga rápida máxima</td><td>${COCHE.dcMax} kW</td></tr>
        <tr><td>30 → 80 %</td><td>${COCHE.min30a80} min</td></tr>
        <tr><td>Enchufe para dar luz (V2L)</td><td>${COCHE.v2l} kW</td></tr>
        <tr><td>Motor</td><td>${COCHE.potencia} kW · ${COCHE.par} Nm</td></tr>
        <tr><td>0-100 km/h</td><td>${num(COCHE.aceleracion, 1)} s</td></tr>
        <tr><td>Tracción</td><td>${COCHE.traccion}</td></tr>
        <tr><td>Largo × ancho × alto</td><td>${num(COCHE.largo)} × ${num(COCHE.ancho)} × ${num(COCHE.alto)} mm</td></tr>
        <tr><td>Maletero / delantero</td><td>${COCHE.maletero} L / ${COCHE.frunk} L</td></tr>
        <tr><td>Peso</td><td>${num(COCHE.peso)} kg</td></tr>
        <tr><td>Remolque</td><td>${num(COCHE.remolque)} kg</td></tr>
        <tr><td>Llantas</td><td>${COCHE.llanta}</td></tr>
        <tr><td>Bomba de calor</td><td>De serie</td></tr>
        <tr><td>Garantía</td><td>${COCHE.garantia}</td></tr>
      </table>
      <p class="muy-suave" style="margin-top:8px">Fuente: catálogo oficial Changan España, julio 2026.</p>`)}

    <p class="muy-suave" style="text-align:center;margin-top:16px">Etiquetas: ${certeza('alta')} ${certeza('media')} ${certeza('baja')}</p>`;
}
