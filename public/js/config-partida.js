// Formulario de configuración de partida (islas + dificultad + ajustes).
// Lo usan la partida en solitario y el anfitrión de una sala online.

import {
  DIFICULTADES, OPCIONES, NOMBRES_ZONAS, NOMBRES_MOVIMIENTO,
  aplicarDificultad, recalcularDificultad, formatoTiempo, nombreDificultad, normalizarConfig, filtrarUbicaciones,
} from './nucleo.js';
import { crearMapaIslas } from './mapa-islas.js';
import { $, $$, esc, aviso } from './ui.js';
import { nombreIslas } from './datos.js';
import { leerVistas } from './historial.js';

const ETIQUETAS_ZONAS = { urbano: '🏘️ Pueblos', mixto: '🔀 Mezcla', rural: '🌵 Rural' };
const ETIQUETAS_MOV = { libre: '🚶 Libre', congelado: '🧊 Congelado' };

export function crearConfigPartida(contenedor, { islas, islaPorId, municipios = [], ubicaciones = [], config, online = false, alCambiar }) {
  let actual = normalizarConfig(config, municipios);
  const municipioPorId = Object.fromEntries(municipios.map((m) => [m.id, m]));
  const etiquetas = {
    reparto: { equilibrado: 'Equilibrado entre islas', azar: 'Azar total entre ubicaciones' },
    orientacion: { carretera: 'Siguiendo la carretera', aleatoria: 'Dirección aleatoria', norte: 'Mirando al norte' },
    fuente: { aleatoria: '🎲 Aleatorias: lugares nuevos en cada partida', banco: '📚 Solo el banco de lugares ya conocidos' },
  };

  contenedor.innerHTML = `
    <div class="config-grid">
      <div class="tarjeta config-islas">
        <h3><span class="paso">1</span> ¿En qué islas quieres jugar?</h3>
        <svg data-mapa></svg>
        <div class="chips" data-chips>
          <button type="button" class="chip accion" data-todas>Todas</button>
          ${islas.map((i) => `<button type="button" class="chip" data-isla="${i.id}">${esc(i.nombre)}</button>`).join('')}
        </div>
        <div class="municipios-config">
          <h3>O elige tus municipios</h3>
          <p class="ayuda-config">Sin municipios marcados se incluyen todos los de las islas elegidas.</p>
          <input type="search" data-buscar-municipio placeholder="Buscar municipio…" aria-label="Buscar municipio">
          <div class="municipios-acciones">
            <button type="button" class="btn-texto" data-municipios-todos>Marcar los visibles</button>
            <button type="button" class="btn-texto" data-municipios-limpiar>Quitar filtro</button>
          </div>
          <div class="municipios-lista" data-municipios></div>
          <p class="ayuda-config" data-municipios-resumen aria-live="polite"></p>
          <small class="fuente-municipios">Cartografía: <a href="https://datos.canarias.es/catalogos/general/dataset/islas-y-municipios" target="_blank" rel="noopener">Gobierno de Canarias · SITCAN</a></small>
        </div>
      </div>
      <div class="tarjeta config-dificultad">
        <h3><span class="paso">2</span> Elige la dificultad</h3>
        <div class="dificultades">
          ${Object.values(DIFICULTADES).map((d) => `
            <button type="button" class="dificultad" data-dificultad="${d.id}">
              <div class="dificultad-cabecera"><span class="dificultad-icono">${d.icono}</span><span class="dificultad-nombre">${d.nombre}</span></div>
              <ul>${d.resumen.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
            </button>`).join('')}
        </div>
        <details class="avanzado">
          <summary>Ajustes personalizados</summary>
          <div class="ajustes">
            <div class="ajuste"><span>Rondas</span>
              <div class="segmentado" data-campo="rondas">${OPCIONES.rondas.map((r) => `<button type="button" data-valor="${r}">${r}</button>`).join('')}</div>
            </div>
            <div class="ajuste"><span>Tiempo por ronda</span>
              <select data-campo="tiempo" aria-label="Tiempo por ronda">${OPCIONES.tiempo.map((t) => `<option value="${t}">${formatoTiempo(t)}</option>`).join('')}</select>
            </div>
            <div class="ajuste"><span>Movimiento</span>
              <div class="segmentado" data-campo="movimiento">${OPCIONES.movimiento.map((m) => `<button type="button" data-valor="${m}">${ETIQUETAS_MOV[m]}</button>`).join('')}</div>
            </div>
            <div class="ajuste"><span>Tipo de lugares</span>
              <div class="segmentado" data-campo="zonas">${OPCIONES.zonas.map((z) => `<button type="button" data-valor="${z}">${ETIQUETAS_ZONAS[z]}</button>`).join('')}</div>
            </div>
            <label class="ajuste"><span>Decirme en qué isla estoy<small>Solo tiene efecto si juegas con varias islas</small></span>
              <span class="interruptor"><input type="checkbox" data-campo="pistaIsla"><span></span></span>
            </label>
            <label class="ajuste"><span>Mostrar el municipio como pista</span>
              <span class="interruptor"><input type="checkbox" data-campo="pistaMunicipio"><span></span></span>
            </label>
            ${[['reparto', 'Reparto de ubicaciones'], ['orientacion', 'Orientación inicial'], ['fuente', 'De dónde salen los lugares']].map(([campo, nombre]) => `
              <label class="ajuste"><span>${nombre}</span><select data-campo="${campo}">${OPCIONES[campo].map((v) => `<option value="${v}">${etiquetas[campo][v]}</option>`).join('')}</select></label>`).join('')}
            ${online ? `
            <label class="ajuste"><span>Cuenta atrás tras el primer intento<small>Acorta el tiempo cuando alguien confirma su chincheta</small></span>
              <span class="interruptor"><input type="checkbox" data-campo="cuentaAtras"><span></span></span>
            </label>
            <label class="ajuste"><span>Duración de la cuenta atrás</span><select data-campo="segundosCuentaAtras">${OPCIONES.segundosCuentaAtras.map((s) => `<option value="${s}">${s} segundos</option>`).join('')}</select></label>` : ''}
          </div>
        </details>
        <p class="config-resumen" data-resumen></p>
        <div class="disponibilidad" data-disponibilidad aria-live="polite"></div>
        <p class="ayuda-config">Sin repeticiones entre partidas mientras conserves tu historial.</p>
      </div>
    </div>`;

  const mapa = crearMapaIslas($('[data-mapa]', contenedor), islas, {
    interactivo: true,
    alPulsar: (id) => alternarIsla(id),
  });

  function cambiar(parcial, preset = null) {
    const combinada = normalizarConfig({ ...actual, ...parcial }, municipios);
    actual = preset ? aplicarDificultad(combinada, preset) : recalcularDificultad(combinada);
    pintar();
    alCambiar?.({ ...actual });
  }

  function alternarIsla(id) {
    const sel = new Set(actual.islas);
    if (sel.has(id)) {
      if (sel.size === 1) return aviso('Tienes que elegir al menos una isla');
      sel.delete(id);
    } else {
      sel.add(id);
    }
    cambiar({ islas: islas.map((i) => i.id).filter((i) => sel.has(i)) });
  }

  // eventos
  $('[data-todas]', contenedor).addEventListener('click', () => cambiar({ islas: islas.map((i) => i.id) }));
  for (const chip of $$('[data-isla]', contenedor)) chip.addEventListener('click', () => alternarIsla(chip.dataset.isla));
  for (const b of $$('[data-dificultad]', contenedor)) b.addEventListener('click', () => cambiar({}, b.dataset.dificultad));
  for (const grupo of $$('.segmentado[data-campo]', contenedor)) {
    grupo.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-valor]');
      if (!b) return;
      const campo = grupo.dataset.campo;
      cambiar({ [campo]: campo === 'rondas' ? Number(b.dataset.valor) : b.dataset.valor });
    });
  }
  for (const select of $$('select[data-campo]', contenedor)) select.addEventListener('change', (e) => {
    const campo = select.dataset.campo;
    cambiar({ [campo]: ['tiempo', 'segundosCuentaAtras'].includes(campo) ? Number(e.target.value) : e.target.value });
  });
  for (const chk of $$('input[type="checkbox"][data-campo]', contenedor)) {
    chk.addEventListener('change', () => cambiar({ [chk.dataset.campo]: chk.checked }));
  }

  const normalizarBusqueda = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function municipiosVisibles() {
    const busqueda = normalizarBusqueda($('[data-buscar-municipio]', contenedor).value.trim());
    return municipios.filter((m) => m.islas.some((i) => actual.islas.includes(i)) && normalizarBusqueda(m.nombre).includes(busqueda));
  }
  // Recuento del banco por municipio e isla: se calcula una vez (y otra si el banco termina de cargarse)
  let conteo = null;
  let conteoDe = -1;
  function lugaresDe(municipio) {
    if (conteoDe !== ubicaciones.length) {
      conteo = new Map();
      for (const u of ubicaciones) {
        const clave = `${u.municipio}|${u.isla}`;
        conteo.set(clave, (conteo.get(clave) || 0) + 1);
      }
      conteoDe = ubicaciones.length;
    }
    return actual.islas.reduce((n, isla) => n + (conteo.get(`${municipio}|${isla}`) || 0), 0);
  }

  function pintarMunicipios() {
    const visibles = municipiosVisibles();
    $('[data-municipios]', contenedor).innerHTML = visibles.length ? visibles.map((m) => {
      const cantidad = lugaresDe(m.id);
      return `<label class="municipio-opcion"><input type="checkbox" value="${m.id}" ${actual.municipios.includes(m.id) ? 'checked' : ''}><span>${esc(m.nombre)}<small>${esc(m.islas.filter((i) => actual.islas.includes(i)).map((i) => islaPorId[i].nombre).join(' / '))}</small></span><small title="Ubicaciones del banco inicial">${cantidad}</small></label>`;
    }).join('') : '<p class="ayuda-config">No hay municipios con ese nombre en las islas seleccionadas.</p>';
    $('[data-municipios-resumen]', contenedor).textContent = actual.municipios.length
      ? `${actual.municipios.length} municipio${actual.municipios.length === 1 ? '' : 's'}: ${actual.municipios.map((id) => municipioPorId[id]?.nombre).join(', ')}`
      : 'Todos los municipios de las islas seleccionadas';
  }
  $('[data-buscar-municipio]', contenedor).addEventListener('input', pintarMunicipios);
  $('[data-municipios]', contenedor).addEventListener('change', (e) => {
    const seleccion = new Set(actual.municipios);
    e.target.checked ? seleccion.add(e.target.value) : seleccion.delete(e.target.value);
    cambiar({ municipios: [...seleccion] });
  });
  $('[data-municipios-todos]', contenedor).addEventListener('click', () => cambiar({ municipios: [...new Set([...actual.municipios, ...municipiosVisibles().map((m) => m.id)])] }));
  $('[data-municipios-limpiar]', contenedor).addEventListener('click', () => cambiar({ municipios: [] }));

  // Islas o municipios elegidos que no tienen ningún lugar del tipo pedido (pueblos o rural)
  function zonasSinCobertura() {
    if (actual.zonas === 'mixto' || !ubicaciones.length) return null;
    const zona = actual.zonas === 'urbano' ? 'u' : 'r';
    const areas = actual.municipios.length
      ? actual.municipios.map((id) => ({ nombre: municipioPorId[id]?.nombre ?? id, cumple: (u) => u.municipio === id && actual.islas.includes(u.isla) }))
      : actual.islas.map((id) => ({ nombre: islaPorId[id]?.nombre ?? id, cumple: (u) => u.isla === id }));
    const vacias = areas.filter((a) => !ubicaciones.some((u) => u.zona === zona && a.cumple(u)));
    if (!vacias.length) return null;
    return {
      todas: vacias.length === areas.length,
      tipo: zona === 'u' ? 'pueblos ni ciudades' : 'zonas rurales',
      nombres: vacias.map((a) => a.nombre).join(', '),
    };
  }

  function pintar() {
    const sel = new Set(actual.islas);
    mapa.marcar(sel);
    $('[data-todas]', contenedor).classList.toggle('sel', sel.size === islas.length);
    for (const chip of $$('[data-isla]', contenedor)) chip.classList.toggle('sel', sel.has(chip.dataset.isla));
    for (const b of $$('[data-dificultad]', contenedor)) b.classList.toggle('sel', b.dataset.dificultad === actual.dificultad);
    for (const grupo of $$('.segmentado[data-campo]', contenedor)) {
      for (const b of $$('button', grupo)) b.classList.toggle('sel', String(actual[grupo.dataset.campo]) === b.dataset.valor);
    }
    for (const select of $$('select[data-campo]', contenedor)) select.value = String(actual[select.dataset.campo]);
    for (const chk of $$('input[type="checkbox"][data-campo]', contenedor)) chk.checked = !!actual[chk.dataset.campo];
    $('[data-resumen]', contenedor).innerHTML = resumenTexto(actual, islaPorId, municipioPorId);
    pintarMunicipios();
    const estado = $('[data-disponibilidad]', contenedor);
    const historialSala = online ? ' Se comprobará también el historial de todos los jugadores.' : '';
    // ¿Hay zonas elegidas sin ningún lugar del tipo pedido? (el banco sirve de mapa de cobertura)
    const sinCobertura = zonasSinCobertura();
    if (sinCobertura) {
      estado.classList.toggle('pocas', sinCobertura.todas);
      estado.textContent = sinCobertura.todas
        ? `⚠️ No hay ${sinCobertura.tipo} con Street View en ${sinCobertura.nombres}. Elige «Mezcla» u otro tipo de lugar en los ajustes personalizados.`
        : `ℹ️ En ${sinCobertura.nombres} no hay ${sinCobertura.tipo} con Street View: las rondas saldrán del resto de la zona elegida.`;
      return;
    }
    if (actual.fuente === 'aleatoria') {
      estado.classList.remove('pocas');
      estado.textContent = `🎲 Cada partida saca lugares nuevos al azar de todo el territorio elegido, sin repetir.${historialSala}`;
    } else {
      // Solo con el banco hace falta contar (recorre miles de lugares)
      const total = filtrarUbicaciones(ubicaciones, actual).length;
      const nuevas = filtrarUbicaciones(ubicaciones, actual, leerVistas()).length;
      estado.classList.toggle('pocas', nuevas < actual.rondas);
      estado.textContent = `${nuevas.toLocaleString('es-ES')} lugares sin visitar de ${total.toLocaleString('es-ES')} en el banco.${nuevas < actual.rondas ? ' Reduce las rondas, amplía los filtros o elige ubicaciones aleatorias.' : ''}${historialSala}`;
    }
  }

  pintar();
  // Los contadores del banco se completan cuando termina de descargarse
  if (!ubicaciones.length) document.addEventListener('banco-cargado', () => contenedor.isConnected && pintar(), { once: true });

  return {
    obtener: () => ({ ...actual }),
    establecer(config) {
      actual = normalizarConfig(config, municipios);
      pintar();
    },
    refrescar: pintar,
  };
}

export function resumenTexto(c, islaPorId, municipioPorId = {}) {
  const partes = [
    `<strong>${nombreDificultad(c.dificultad)}</strong>`,
    `${c.rondas} ronda${c.rondas === 1 ? '' : 's'}`,
    c.tiempo ? `${formatoTiempo(c.tiempo)} por ronda` : 'sin límite de tiempo',
    NOMBRES_MOVIMIENTO[c.movimiento].split(' (')[0].toLowerCase(),
    NOMBRES_ZONAS[c.zonas].toLowerCase(),
  ];
  const islasTxt = c.islas.length === Object.keys(islaPorId).length ? 'todo el archipiélago' : nombreIslas(c.islas, islaPorId);
  return `${partes.join(' · ')}<br>🗺️ ${esc(islasTxt)}${c.municipios?.length ? `<br>📍 ${esc(c.municipios.map((id) => municipioPorId[id]?.nombre || id).join(', '))}` : ''}`;
}

// Vista de solo lectura para los invitados de una sala
export function pintarResumenConfig(contenedor, config, { islas, islaPorId, municipioPorId }) {
  contenedor.innerHTML = `
    <div class="tarjeta">
      <h3>Configuración de la partida</h3>
      <svg data-mapa></svg>
      <ul class="resumen-lista">
        <li><span>Islas</span><strong>${esc(nombreIslas(config.islas, islaPorId))}</strong></li>
        <li><span>Municipios</span><strong>${config.municipios?.length ? esc(config.municipios.map((id) => municipioPorId[id]?.nombre || id).join(', ')) : 'Todos'}</strong></li>
        <li><span>Dificultad</span><strong>${DIFICULTADES[config.dificultad]?.icono ?? '⚙️'} ${nombreDificultad(config.dificultad)}</strong></li>
        <li><span>Rondas</span><strong>${config.rondas}</strong></li>
        <li><span>Tiempo por ronda</span><strong>${formatoTiempo(config.tiempo)}</strong></li>
        <li><span>Movimiento</span><strong>${NOMBRES_MOVIMIENTO[config.movimiento]}</strong></li>
        <li><span>Lugares</span><strong>${NOMBRES_ZONAS[config.zonas]}</strong></li>
        <li><span>Pista de la isla</span><strong>${config.pistaIsla ? 'Sí' : 'No'}</strong></li>
        <li><span>Pista del municipio</span><strong>${config.pistaMunicipio ? 'Sí' : 'No'}</strong></li>
        <li><span>Reparto</span><strong>${config.reparto === 'azar' ? 'Azar total' : 'Equilibrado entre islas'}</strong></li>
        <li><span>Orientación</span><strong>${{ carretera: 'Carretera', norte: 'Norte', aleatoria: 'Aleatoria' }[config.orientacion]}</strong></li>
        <li><span>Ubicaciones</span><strong>${{ aleatoria: '🎲 Aleatorias, nuevas cada partida', banco: '📚 Banco de lugares conocidos' }[config.fuente] ?? '🎲 Aleatorias'} · sin repetir</strong></li>
        <li><span>Cuenta atrás tras el primer intento</span><strong>${config.cuentaAtras ? `Sí (${config.segundosCuentaAtras} s)` : 'No'}</strong></li>
      </ul>
    </div>`;
  crearMapaIslas($('[data-mapa]', contenedor), islas).marcar(new Set(config.islas));
}
