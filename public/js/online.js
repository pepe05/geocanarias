// Modo multijugador: salas con código, sincronizadas por Socket.IO.
/* global io */

import { $, esc, inicial, aviso, confirmar, mostrarPantalla, pantalla, alCambiarPantalla, almacen, sesion } from './ui.js';
import { crearConfigPartida, pintarResumenConfig } from './config-partida.js';
import { normalizarConfig } from './nucleo.js';
import { sonido } from './sonido.js';
import { obtenerToken, recordarUbicaciones, leerVistas } from './historial.js';
import { crearChat, REACCIONES } from './chat.js';

const PANTALLAS_CON_CHAT = ['sala', 'juego', 'resultado', 'final'];

function cargarScript(src) {
  return new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolver;
    s.onerror = () => rechazar(new Error('No se pudo cargar ' + src));
    document.head.append(s);
  });
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
  let avisoPreparando = null;
  const token = obtenerToken();

  const chat = crearChat({
    alEnviar: (texto) => socket?.emit('chat', texto),
    alReaccion: (emoji) => socket?.emit('reaccion', emoji),
  });
  const actualizarChat = () => chat.mostrar(!!codigo && PANTALLAS_CON_CHAT.includes(pantalla()));
  alCambiarPantalla(actualizarChat);

  // ------------------------------------------------------------ conexión
  async function conectar() {
    if (socket) return socket;
    const sincronizacion = await fetch('api/historial', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, vistas: [...leerVistas()] }), signal: AbortSignal.timeout(8000) });
    if (!sincronizacion.ok) throw new Error('No se pudo sincronizar el historial de ubicaciones');
    if (!window.io) await cargarScript('socket.io/socket.io.js');
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on('estado', recibirEstado);
    socket.on('reaccion', mostrarReaccion);
    socket.on('chat', (m) => chat.recibir(m));
    socket.on('chatAviso', (texto) => aviso(texto, 'error'));
    socket.on('errorPartida', (texto) => aviso(texto, 'error', 9000));
    socket.on('avisoPartida', (texto) => aviso(texto, '', 7000));
    socket.on('marcadorGuardado', (m) => {
      if (m.rondaId === estado?.rondaId) juego.marcadorGuardado();
    });
    socket.on('connect', () => {
      if (codigo) {
        socket.emit('unirse', { codigo, nombre: nombreJugador(), token }, (r) => {
          if (!r?.ok) {
            aviso(r?.error || 'La sala ya no existe', 'error');
            olvidarSala();
            alSalir();
          } else {
            chat.cargar(r.chat, yoId);
            recibirEstado(r.estado);
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

  function recordarSala(c, id, historialChat) {
    codigo = c;
    yoId = id;
    chat.cargar(historialChat, id);
    actualizarChat();
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
    chat.vaciar();
    actualizarChat();
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
      recordarSala(r.codigo, r.id, r.chat);
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
      recordarSala(r.codigo, r.id, r.chat);
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

    const preparando = s.estado === 'preparando';
    $('#btn-empezar-online').disabled = preparando;
    $('#btn-empezar-online').textContent = preparando ? '🎲 Buscando lugares al azar…' : 'Empezar partida';
    // Casi siempre la partida está lista al instante: solo se avisa si la búsqueda se alarga
    clearTimeout(avisoPreparando);
    if (preparando) {
      avisoPreparando = setTimeout(() => aviso('Buscando lugares nuevos al azar. Puede tardar unos segundos…', '', 5000), 1500);
      return;
    }
    if (s.estado === 'sala') {
      finalPintado = null;
      pintarSala(s);
      if (pantalla() !== 'sala') {
        juego.detener();
        mostrarPantalla('sala');
      }
    } else if (s.estado === 'ronda') {
      recordarUbicaciones([s.ubicacion]);
      const nueva = !anterior || anterior.estado !== 'ronda' || anterior.rondaId !== s.rondaId || pantalla() !== 'juego';
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
            marcador: s.miMarcador,
          },
          {
            alAdivinar: (pos) => enviarIntento(pos),
            alMarcar: (pos) => socket.emit('marcador', { ...pos, rondaId: s.rondaId }),
            alTiempoAgotado: (pos) => (pos ? enviarIntento(pos) : juego.esperando('⌛ Se acabó el tiempo')),
            alAbandonar: () => salir(),
            alForzar: async () => {
              const ok = await confirmar('¿Terminar la ronda ya?', 'Se guardará la última chincheta de cada jugador. Quien no haya colocado ninguna tendrá 0 puntos.', { si: 'Terminar ronda', no: 'Esperar' });
              if (ok) socket.emit('forzarFin');
            },
          },
        );
      } else if (anterior.finRonda !== s.finRonda) {
        juego.establecerFin(fin);
      }
      if (s.miMarcador && !nueva && !yo.haAdivinado) juego.restaurarMarcador(s.miMarcador);
      juego.actualizarJugadores(s.jugadores, yoId);
      juego.mostrarForzar(s.anfitrion === yoId && yo.haAdivinado && s.jugadores.filter((j) => j.conectado).length > 1);
      if (yo.haAdivinado) juego.esperando();
      else if (s.config.cuentaAtras && !avisoCuentaAtras && s.jugadores.some((j) => j.haAdivinado)) {
        avisoCuentaAtras = true;
        const quien = s.jugadores.find((j) => j.haAdivinado);
        juego.aviso(`⚡ ${quien.nombre} ya ha adivinado: ¡quedan ${Math.max(0, Math.ceil((fin - Date.now()) / 1000))} segundos!`, 5000);
      }
    } else if (s.estado === 'resultado') {
      recordarUbicaciones(s.resultados.map((r) => r.ubicacion));
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
      recordarUbicaciones(s.resultados.map((r) => r.ubicacion));
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
    socket.emit('adivinar', { ...pos, rondaId: estado.rondaId });
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
          ...datos,
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

  // Emoji grande que sube flotando por la pantalla con el nombre de quien lo envía
  function mostrarReaccion({ id, emoji }) {
    const j = estado?.jugadores.find((x) => x.id === id);
    if (!j || !REACCIONES.includes(emoji)) return;
    const capa = $('#reacciones-capa');
    while (capa.children.length > 24) capa.firstElementChild.remove();
    const b = document.createElement('div');
    b.className = 'emoji-flotante';
    b.style.left = `${6 + Math.random() * 78}%`;
    b.style.setProperty('--deriva', `${Math.round((Math.random() - 0.5) * 120)}px`);
    b.style.setProperty('--giro', `${Math.round((Math.random() - 0.5) * 40)}deg`);
    b.innerHTML = `<span class="emoji">${emoji}</span><span class="quien" style="--c:${j.color}">${esc(j.nombre)}</span>`;
    capa.append(b);
    sonido.pop();
    setTimeout(() => b.remove(), 3300);
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
