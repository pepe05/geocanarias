// Pantalla de juego: visor, HUD, reloj y mapa para adivinar.
// Es común al modo solitario y al online; cada modo decide qué hacer con el intento.

import { $, esc, inicial, mostrarPantalla, pantalla, almacen } from './ui.js';
import { crearVisor } from './visor.js';
import { crearMapaAdivinar } from './mapas.js';
import { bboxUnion, formatoPuntos } from './nucleo.js';
import { sonido } from './sonido.js';

export function crearPantallaJuego({ datos }) {
  const visor = crearVisor({ iframe: $('#visor-iframe'), bloqueo: $('#visor-bloqueo'), cargando: $('#visor-cargando') });
  const panel = $('#panel-mapa');
  const btnAdivinar = $('#btn-adivinar');
  const reloj = $('#hud-reloj');
  const relojTexto = $('#hud-reloj-texto');
  const avisoHud = $('#hud-aviso');

  let manejadores = {};
  let finLocal = null;
  let intervalo = null;
  let agotado = false;
  let enviado = false;
  let ultimoSegundo = null;
  let temporizadorAviso = null;

  const mapa = crearMapaAdivinar($('#mapa-adivinar'), {
    alMarcar: () => {
      if (enviado) return;
      btnAdivinar.disabled = false;
      btnAdivinar.textContent = 'Adivinar';
      panel.classList.add('con-marca');
      sonido.marcar();
    },
  });

  // --- panel del mapa: ampliar al pasar el ratón, fijar, abrir en móvil ---
  const fijado = almacen.leer('mapaFijado', false);
  panel.classList.toggle('fijado', fijado);
  $('#btn-fijar-mapa').classList.toggle('activo', fijado);
  panel.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'width' || e.propertyName === 'height') mapa.refrescar();
  });
  panel.addEventListener('mouseenter', () => setTimeout(() => mapa.refrescar(), 240));
  $('#btn-fijar-mapa').addEventListener('click', (e) => {
    e.stopPropagation();
    const f = !panel.classList.contains('fijado');
    panel.classList.toggle('fijado', f);
    e.currentTarget.classList.toggle('activo', f);
    almacen.escribir('mapaFijado', f);
    setTimeout(() => mapa.refrescar(), 240);
  });
  $('#btn-abrir-mapa').addEventListener('click', () => {
    panel.classList.add('abierto');
    requestAnimationFrame(() => mapa.refrescar());
  });
  $('#btn-cerrar-mapa').addEventListener('click', () => panel.classList.remove('abierto'));

  // --- acciones ---
  function adivinar() {
    const pos = mapa.posicion();
    if (enviado || !pos) return;
    enviado = true;
    sonido.adivinar();
    manejadores.alAdivinar?.({ lat: pos.lat, lng: pos.lng });
  }

  btnAdivinar.addEventListener('click', adivinar);
  $('#btn-reiniciar-vista').addEventListener('click', () => visor.reiniciar());
  $('#btn-abandonar').addEventListener('click', () => manejadores.alAbandonar?.());
  $('#btn-forzar').addEventListener('click', () => manejadores.alForzar?.());

  document.addEventListener('keydown', (e) => {
    if (pantalla() !== 'juego' || e.target.closest('input, textarea, select, dialog')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      adivinar();
    } else if (e.key === 'r' || e.key === 'R') {
      visor.reiniciar();
    }
  });

  // --- reloj ---
  function tic() {
    if (!finLocal) {
      reloj.hidden = true;
      return;
    }
    reloj.hidden = false;
    const restante = Math.max(0, finLocal - Date.now());
    const seg = Math.ceil(restante / 1000);
    relojTexto.textContent = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
    reloj.classList.toggle('urgente', seg <= 10);
    if (seg <= 10 && seg > 0 && seg !== ultimoSegundo && !enviado) sonido.tic();
    ultimoSegundo = seg;
    if (restante <= 0 && !agotado) {
      agotado = true;
      detenerReloj();
      const pos = mapa.posicion();
      if (!enviado) {
        enviado = true;
        manejadores.alTiempoAgotado?.(pos ? { lat: pos.lat, lng: pos.lng } : null);
      }
    }
  }

  function detenerReloj() {
    clearInterval(intervalo);
    intervalo = null;
  }

  function establecerFin(fin) {
    finLocal = fin;
    agotado = false;
    detenerReloj();
    tic();
    if (fin) intervalo = setInterval(tic, 200);
  }

  function mostrarAviso(texto, ms = 4000) {
    avisoHud.textContent = texto;
    avisoHud.hidden = false;
    clearTimeout(temporizadorAviso);
    if (ms) temporizadorAviso = setTimeout(() => (avisoHud.hidden = true), ms);
  }

  return {
    // m: { ubicacion:{pano,rumbo,isla}, ronda, total, puntos, config, finRonda, color, online }
    iniciarRonda(m, nuevosManejadores) {
      manejadores = nuevosManejadores;
      enviado = false;
      mostrarPantalla('juego');
      panel.classList.remove('abierto', 'con-marca');
      $('#hud-ronda').textContent = `${m.ronda} / ${m.total}`;
      $('#hud-puntos').textContent = formatoPuntos(m.puntos);
      const isla = m.ubicacion.isla ? datos.islaPorId[m.ubicacion.isla] : null;
      $('#hud-pista').hidden = !isla;
      if (isla) $('#hud-pista-isla').textContent = isla.nombre;
      $('#hud-jugadores').hidden = !m.online;
      $('#btn-forzar').hidden = true;
      avisoHud.hidden = true;

      const congelado = m.config.movimiento === 'congelado';
      $('#btn-reiniciar-vista').hidden = congelado;
      visor.mostrar(m.ubicacion, { congelado });

      btnAdivinar.disabled = true;
      btnAdivinar.classList.remove('esperando');
      btnAdivinar.textContent = 'Pon tu chincheta en el mapa';
      // la pantalla ya es visible: Leaflet puede medir el contenedor
      mapa.preparar({ bbox: bboxUnion(m.config.islas, datos.islas), color: m.color });
      establecerFin(m.finRonda);
    },

    establecerFin,

    // Botón para que el anfitrión cierre la ronda si alguien no responde
    mostrarForzar(visible) {
      $('#btn-forzar').hidden = !visible;
    },

    esperando(texto = '✔ ¡Hecho! Esperando al resto…') {
      enviado = true;
      mapa.bloquear(true);
      btnAdivinar.disabled = true;
      btnAdivinar.classList.add('esperando');
      btnAdivinar.textContent = texto;
    },

    aviso: mostrarAviso,

    actualizarJugadores(jugadores, yoId) {
      $('#hud-jugadores').innerHTML = jugadores
        .map((j) => `
          <div class="hud-jugador ${j.haAdivinado ? 'listo' : ''} ${j.conectado ? '' : 'desconectado'}">
            <span class="avatar peq" style="--c:${j.color}">${esc(inicial(j.nombre))}</span>
            <span class="nombre">${esc(j.nombre)}${j.id === yoId ? ' (tú)' : ''}</span>
            <span class="estado">${!j.conectado ? '📴' : j.haAdivinado ? '✅' : '🤔'}</span>
          </div>`)
        .join('');
    },

    detener() {
      detenerReloj();
      finLocal = null;
      reloj.hidden = true;
      avisoHud.hidden = true;
      visor.vaciar();
    },
  };
}
