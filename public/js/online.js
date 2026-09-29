// Modo multijugador: salas con código, sincronizadas por Socket.IO.
/* global io */

import { $, esc, inicial, aviso, confirmar, mostrarPantalla, pantalla, almacen, sesion } from './ui.js';
import { crearConfigPartida, pintarResumenConfig } from './config-partida.js';
import { SEGUNDOS_CUENTA_ATRAS, normalizarConfig } from './nucleo.js';
import { sonido } from './sonido.js';

const REACCIONES = ['👏', '😂', '😱', '🔥', '🤔', '😎', '🌋', '🐐'];

function cargarScript(src) {
  return new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolver;
    s.onerror = () => rechazar(new Error('No se pudo cargar ' + src));
    document.head.append(s);
  });
}

function obtenerToken() {
  let t = almacen.leer('token');
  if (!t) {
    t = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
    almacen.escribir('token', t);
  }
  return t;
}

export function crearModoOnline({ datos, juego, resultados, nombreJugador, alSalir }) {
  let socket = null;
  let estado = null;
  let yoId = null;
  let codigo = null;
  let desfase = 0; // hora del servidor - hora local
  let editor = null;
  let editorDeAnfitrion = null;
  let finalPintado = null;
  let avisoCuentaAtras = false;
  let temporizadorConfig = null;
  const token = obtenerToken();

  // ------------------------------------------------------------ conexión
  async function conectar() {
    if (socket) return socket;
    if (!window.io) await cargarScript('socket.io/socket.io.js');
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on('estado', recibirEstado);
    socket.on('reaccion', mostrarReaccion);
    socket.on('connect', () => {
      if (codigo) {
        socket.emit('unirse', { codigo, nombre: nombreJugador(), token }, (r) => {
          if (!r?.ok) {
            aviso(r?.error || 'La sala ya no existe', 'error');
            olvidarSala();
            alSalir();
          }
        });
      }
    });
    socket.on('disconnect', () => {
      if (codigo) aviso('Se ha perdido la conexión. Reconectando…', 'error');
    });
    await new Promise((resolver, rechazar) => {
      if (socket.connected) return resolver();
      const t = setTimeout(() => rechazar(new Error('Sin conexión con el servidor')), 8000);
      socket.once('connect', () => {
        clearTimeout(t);
        resolver();
      });
    });
    return socket;
  }

  // Los hostings gratuitos duermen el servidor si no reciben peticiones: mientras haya sala, lo mantenemos despierto
  setInterval(() => {
    if (codigo) fetch('api/estado', { cache: 'no-store' }).catch(() => {});
  }, 4 * 60 * 1000);

  function recordarSala(c, id) {
    codigo = c;
    yoId = id;
    sesion.escribir('sala', c);
    const url = new URL(location.href);
    url.searchParams.set('sala', c);
    history.replaceState(null, '', url);
  }

  function olvidarSala() {
    codigo = null;
    yoId = null;
    estado = null;
    finalPintado = null;
    editor = null;
    editorDeAnfitrion = null;
    sesion.escribir('sala', null);
    const url = new URL(location.href);
    url.searchParams.delete('sala');
    history.replaceState(null, '', url);
  }

  async function crearSala() {
    try {
      await conectar();
    } catch {
      return aviso('No se puede conectar con el servidor del juego', 'error');
    }
    const config = normalizarConfig(almacen.leer('configOnline') || almacen.leer('configSolo') || {});
    socket.emit('crear', { nombre: nombreJugador(), token, config }, (r) => {
      if (!r?.ok) return aviso(r?.error || 'No se pudo crear la sala', 'error');
      recordarSala(r.codigo, r.id);
      recibirEstado(r.estado);
    });
  }

  async function unirse(cod) {
    const c = String(cod || '').trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) return aviso('El código tiene 4 letras', 'error');
    try {
      await conectar();
    } catch {
      return aviso('No se puede conectar con el servidor del juego', 'error');
    }
    socket.emit('unirse', { codigo: c, nombre: nombreJugador(), token }, (r) => {
      if (!r?.ok) {
        aviso(r?.error || 'No se pudo entrar en la sala', 'error');
        if (sesion.leer('sala') === c) olvidarSala();
        return;
      }
      recordarSala(r.codigo, r.id);
      recibirEstado(r.estado);
    });
  }

  async function salir(preguntar = true) {
    if (preguntar) {
      const ok = await confirmar('¿Salir de la sala?', 'Si la partida está en marcha, dejarás de participar.', { si: 'Salir', no: 'Quedarme' });
      if (!ok) return;
    }
    socket?.emit('salir');
    juego.detener();
    olvidarSala();
    alSalir();
  }

  // ------------------------------------------------------------ estado
  function recibirEstado(s) {
    if (!codigo || s.codigo !== codigo) return;
    desfase = s.ahora - Date.now();
    const anterior = estado;
    estado = s;
    const yo = s.jugadores.find((j) => j.id === yoId);
    if (!yo) return;

    if (s.estado === 'sala') {
      finalPintado = null;
      pintarSala(s);
      if (pantalla() !== 'sala') {
        juego.detener();
        mostrarPantalla('sala');
      }
    } else if (s.estado === 'ronda') {
      const nueva = !anterior || anterior.estado !== 'ronda' || anterior.ronda !== s.ronda || pantalla() !== 'juego';
      const fin = s.finRonda ? s.finRonda - desfase : null;
      if (nueva) {
        avisoCuentaAtras = false;
        juego.iniciarRonda(
          {
            ubicacion: s.ubicacion,
            ronda: s.ronda,
            total: s.totalRondas,
            puntos: yo.puntos,
            config: s.config,
            finRonda: fin,
            color: yo.color,
            online: true,
          },
          {
            alAdivinar: (pos) => enviarIntento(pos),
            alTiempoAgotado: (pos) => (pos ? enviarIntento(pos) : juego.esperando('⌛ Se acabó el tiempo')),
            alAbandonar: () => salir(),
            alForzar: async () => {
              const ok = await confirmar('¿Terminar la ronda ya?', 'Quien no haya adivinado se quedará con 0 puntos en esta ronda.', { si: 'Terminar ronda', no: 'Esperar' });
              if (ok) socket.emit('forzarFin');
            },
          },
        );
      } else if (anterior.finRonda !== s.finRonda) {
        juego.establecerFin(fin);
      }
      juego.actualizarJugadores(s.jugadores, yoId);
      juego.mostrarForzar(s.anfitrion === yoId && yo.haAdivinado && s.jugadores.filter((j) => j.conectado).length > 1);
      if (yo.haAdivinado) juego.esperando();
      else if (s.config.cuentaAtras && !avisoCuentaAtras && s.jugadores.some((j) => j.haAdivinado)) {
        avisoCuentaAtras = true;
        const quien = s.jugadores.find((j) => j.haAdivinado);
        juego.aviso(`⚡ ${quien.nombre} ya ha adivinado: ¡te quedan ${SEGUNDOS_CUENTA_ATRAS} segundos!`, 5000);
      }
    } else if (s.estado === 'resultado') {
      const nueva = !anterior || anterior.estado !== 'resultado' || anterior.ronda !== s.ronda || pantalla() !== 'resultado';
      if (nueva) juego.detener();
      resultados.rondaOnline({
        estado: s,
        yoId,
        soloPanel: !nueva,
        alSiguiente: () => socket.emit('siguiente'),
        reacciones: pintarReacciones,
      });
    } else if (s.estado === 'final') {
      const clave = `${s.codigo}-${s.resultados.map((r) => r.ubicacion.id).join()}`;
      if (finalPintado === clave && pantalla() === 'final') return;
      finalPintado = clave;
      juego.detener();
      resultados.finalOnline({
        estado: s,
        yoId,
        alRevancha: () => socket.emit('empezar'),
        alAjustes: () => socket.emit('volverSala'),
        alSalir: () => salir(false),
        reacciones: pintarReacciones,
      });
    }
  }

  function enviarIntento(pos) {
    socket.emit('adivinar', pos);
    juego.esperando();
  }

  // ------------------------------------------------------------ sala de espera
  function pintarSala(s) {
    const esAnfitrion = s.anfitrion === yoId;
    $('#sala-codigo').textContent = s.codigo;
    const enlace = `${location.origin}${location.pathname}?sala=${s.codigo}`;
    $('#sala-enlace').textContent = enlace;
    $('#sala-num-jugadores').textContent = `${s.jugadores.length}/10`;
    $('#sala-lista-jugadores').innerHTML = s.jugadores
      .map((j) => `
        <li class="${j.conectado ? '' : 'desconectado'}">
          <span class="avatar" style="--c:${j.color}">${esc(inicial(j.nombre))}</span>
          <span class="nombre">${esc(j.nombre)} ${j.id === yoId ? '<span class="tu">(tú)</span>' : ''}</span>
          ${j.id === s.anfitrion ? '<span title="Anfitrión">👑</span>' : ''}
          ${j.conectado ? '' : '<small>desconectado</small>'}
        </li>`)
      .join('');
    pintarReacciones($('#pantalla-sala [data-reacciones]'));

    const contEditable = $('#sala-config-editable');
    const contResumen = $('#sala-config-resumen');
    if (esAnfitrion) {
      contResumen.innerHTML = '';
      if (!editor || editorDeAnfitrion !== yoId) {
        editor = crearConfigPartida(contEditable, {
          islas: datos.islas,
          islaPorId: datos.islaPorId,
          config: s.config,
          online: true,
          alCambiar: (cfg) => {
            almacen.escribir('configOnline', cfg);
            clearTimeout(temporizadorConfig);
            temporizadorConfig = setTimeout(() => socket.emit('config', cfg), 150);
          },
        });
        editorDeAnfitrion = yoId;
      }
    } else {
      editor = null;
      editorDeAnfitrion = null;
      contEditable.innerHTML = '';
      pintarResumenConfig(contResumen, s.config, datos);
    }

    const btn = $('#btn-empezar-online');
    btn.hidden = !esAnfitrion;
    const anfitrion = s.jugadores.find((j) => j.id === s.anfitrion);
    $('#sala-nota').innerHTML = esAnfitrion
      ? s.jugadores.length > 1
        ? '¡Cuando estéis todos, dale a empezar!'
        : 'Comparte el código o el enlace con tus amigos. También puedes empezar tú solo.'
      : `Esperando a que <strong>${esc(anfitrion?.nombre ?? 'el anfitrión')}</strong> empiece la partida…`;
  }

  // ------------------------------------------------------------ reacciones
  function pintarReacciones(contenedor) {
    if (!contenedor) return;
    contenedor.innerHTML = REACCIONES.map((e) => `<button type="button" data-emoji="${e}" title="Enviar ${e}">${e}</button>`).join('');
    contenedor.onclick = (ev) => {
      const b = ev.target.closest('[data-emoji]');
      if (b) socket?.emit('reaccion', b.dataset.emoji);
    };
  }

  function mostrarReaccion({ id, emoji }) {
    const j = estado?.jugadores.find((x) => x.id === id);
    if (!j) return;
    const capa = $('#reacciones-capa');
    const b = document.createElement('div');
    b.className = 'burbuja';
    b.style.left = `${8 + Math.random() * 70}%`;
    b.innerHTML = `<span class="avatar peq" style="--c:${j.color}">${esc(inicial(j.nombre))}</span><span class="emoji">${emoji}</span>${esc(j.nombre)}`;
    capa.append(b);
    sonido.pop();
    setTimeout(() => b.remove(), 2700);
  }

  // ------------------------------------------------------------ botones
  $('#btn-crear-sala').addEventListener('click', crearSala);
  $('#form-unirse').addEventListener('submit', (e) => {
    e.preventDefault();
    unirse($('#codigo-sala').value);
  });
  $('#codigo-sala').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
  });
  $('#btn-empezar-online').addEventListener('click', () => {
    if (editor) {
      clearTimeout(temporizadorConfig);
      socket.emit('config', editor.obtener());
    }
    socket.emit('empezar');
  });
  // En el móvil se abre el menú de compartir del sistema (WhatsApp, Telegram…); en el ordenador se copia
  const puedeCompartir = !!navigator.share && matchMedia('(pointer: coarse)').matches;
  if (puedeCompartir) $('#btn-copiar-enlace').textContent = '📤 Invitar a mis amigos';
  $('#btn-copiar-enlace').addEventListener('click', async () => {
    const enlace = $('#sala-enlace').textContent;
    if (puedeCompartir) {
      try {
        await navigator.share({
          title: 'GeoCanarias',
          text: `¿Te atreves a adivinar dónde estamos? Entra en mi sala de GeoCanarias (código ${codigo}):`,
          url: enlace,
        });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(enlace);
      aviso('Enlace copiado. ¡Pásaselo a tus amigos!', 'exito');
    } catch {
      aviso(enlace, '', 8000);
    }
  });

  return {
    crearSala,
    unirse,
    salir,
    get enSala() {
      return !!codigo;
    },
    // Tras recargar la página, volver a la sala en la que estábamos
    async reanudar() {
      const c = sesion.leer('sala');
      if (c) await unirse(c);
      return !!c;
    },
  };
}
