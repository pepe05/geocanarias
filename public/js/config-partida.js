// Formulario de configuración de partida (islas + dificultad + ajustes).
// Lo usan la partida en solitario y el anfitrión de una sala online.

import {
  DIFICULTADES, OPCIONES, NOMBRES_ZONAS, NOMBRES_MOVIMIENTO, SEGUNDOS_CUENTA_ATRAS,
  aplicarDificultad, recalcularDificultad, formatoTiempo, nombreDificultad,
} from './nucleo.js';
import { crearMapaIslas } from './mapa-islas.js';
import { $, $$, esc, aviso } from './ui.js';
import { nombreIslas } from './datos.js';

const ETIQUETAS_ZONAS = { urbano: '🏘️ Pueblos', mixto: '🔀 Mezcla', rural: '🌵 Rural' };
const ETIQUETAS_MOV = { libre: '🚶 Libre', congelado: '🧊 Congelado' };

export function crearConfigPartida(contenedor, { islas, islaPorId, config, online = false, alCambiar }) {
  let actual = { ...config };

  contenedor.innerHTML = `
    <div class="config-grid">
      <div class="tarjeta config-islas">
        <h3><span class="paso">1</span> ¿En qué islas quieres jugar?</h3>
        <svg data-mapa></svg>
        <div class="chips" data-chips>
          <button type="button" class="chip accion" data-todas>Todas</button>
          ${islas.map((i) => `<button type="button" class="chip" data-isla="${i.id}">${esc(i.nombre)}</button>`).join('')}
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
              <select data-campo="tiempo">${OPCIONES.tiempo.map((t) => `<option value="${t}">${formatoTiempo(t)}</option>`).join('')}</select>
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
            ${online ? `
            <label class="ajuste"><span>Cuenta atrás de ${SEGUNDOS_CUENTA_ATRAS} s tras el primer intento<small>Cuando alguien adivina, al resto le quedan ${SEGUNDOS_CUENTA_ATRAS} segundos</small></span>
              <span class="interruptor"><input type="checkbox" data-campo="cuentaAtras"><span></span></span>
            </label>` : ''}
          </div>
        </details>
        <p class="config-resumen" data-resumen></p>
      </div>
    </div>`;

  const mapa = crearMapaIslas($('[data-mapa]', contenedor), islas, {
    interactivo: true,
    alPulsar: (id) => alternarIsla(id),
  });

  function cambiar(parcial, preset = null) {
    const combinada = { ...actual, ...parcial };
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
  $('select[data-campo="tiempo"]', contenedor).addEventListener('change', (e) => cambiar({ tiempo: Number(e.target.value) }));
  for (const chk of $$('input[type="checkbox"][data-campo]', contenedor)) {
    chk.addEventListener('change', () => cambiar({ [chk.dataset.campo]: chk.checked }));
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
    $('select[data-campo="tiempo"]', contenedor).value = String(actual.tiempo);
    for (const chk of $$('input[type="checkbox"][data-campo]', contenedor)) chk.checked = !!actual[chk.dataset.campo];
    $('[data-resumen]', contenedor).innerHTML = resumenTexto(actual, islaPorId);
  }

  pintar();

  return {
    obtener: () => ({ ...actual }),
    establecer(config) {
      actual = { ...config };
      pintar();
    },
  };
}

export function resumenTexto(c, islaPorId) {
  const partes = [
    `<strong>${nombreDificultad(c.dificultad)}</strong>`,
    `${c.rondas} rondas`,
    c.tiempo ? `${formatoTiempo(c.tiempo)} por ronda` : 'sin límite de tiempo',
    NOMBRES_MOVIMIENTO[c.movimiento].split(' (')[0].toLowerCase(),
    NOMBRES_ZONAS[c.zonas].toLowerCase(),
  ];
  const islasTxt = c.islas.length === Object.keys(islaPorId).length ? 'todo el archipiélago' : nombreIslas(c.islas, islaPorId);
  return `${partes.join(' · ')}<br>🗺️ ${esc(islasTxt)}`;
}

// Vista de solo lectura para los invitados de una sala
export function pintarResumenConfig(contenedor, config, { islas, islaPorId }) {
  contenedor.innerHTML = `
    <div class="tarjeta">
      <h3>Configuración de la partida</h3>
      <svg data-mapa></svg>
      <ul class="resumen-lista">
        <li><span>Islas</span><strong>${esc(nombreIslas(config.islas, islaPorId))}</strong></li>
        <li><span>Dificultad</span><strong>${DIFICULTADES[config.dificultad]?.icono ?? '⚙️'} ${nombreDificultad(config.dificultad)}</strong></li>
        <li><span>Rondas</span><strong>${config.rondas}</strong></li>
        <li><span>Tiempo por ronda</span><strong>${formatoTiempo(config.tiempo)}</strong></li>
        <li><span>Movimiento</span><strong>${NOMBRES_MOVIMIENTO[config.movimiento]}</strong></li>
        <li><span>Lugares</span><strong>${NOMBRES_ZONAS[config.zonas]}</strong></li>
        <li><span>Pista de la isla</span><strong>${config.pistaIsla ? 'Sí' : 'No'}</strong></li>
        <li><span>Cuenta atrás tras el primer intento</span><strong>${config.cuentaAtras ? `Sí (${SEGUNDOS_CUENTA_ATRAS} s)` : 'No'}</strong></li>
      </ul>
    </div>`;
  crearMapaIslas($('[data-mapa]', contenedor), islas).marcar(new Set(config.islas));
}
