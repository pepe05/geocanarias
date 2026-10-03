// Salas multijugador. El servidor es la autoridad: elige las ubicaciones, controla el tiempo
// y calcula las puntuaciones. Los clientes solo reciben el panorama, nunca las coordenadas,
// hasta que termina la ronda.

import crypto from 'node:crypto';
import * as N from '../public/js/nucleo.js';
import { limpiarNombre } from './clasificacion.js';

const COLORES = ['#ffc93c', '#4fc3f7', '#ff6b6b', '#7bd88f', '#c792ea', '#ff9f43', '#f78fb3', '#4db6ac', '#e6e6e6', '#a1887f'];
const MAX_JUGADORES = 10;
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MARGEN_CARGA_MS = 1500; // margen para que cargue el panorama antes de que corra el reloj
const ESPERA_BORRADO_MS = 10 * 60 * 1000;
const MARGEN_ANFITRION_MS = 15 * 1000;
const MAX_SALAS = 500;
const REACCIONES = ['👏', '😂', '😱', '🔥', '🤔', '😎', '🌋', '🐐'];
const MAX_MENSAJES_GUARDADOS = 60;
const MAX_LARGO_MENSAJE = 200;

// Texto de chat seguro: sin caracteres de control, espacios normalizados y longitud limitada
export function limpiarMensaje(texto) {
  if (typeof texto !== 'string') return '';
  return texto.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, MAX_LARGO_MENSAJE);
}

export function crearGestorSalas(io, { islas, ubicaciones, municipios = [], catalogo }) {
  const salas = new Map();

  function nuevoCodigo() {
    let codigo;
    do {
      codigo = Array.from({ length: 4 }, () => LETRAS[crypto.randomInt(LETRAS.length)]).join('');
    } while (salas.has(codigo));
    return codigo;
  }

  function colorLibre(sala) {
    const usados = new Set([...sala.jugadores.values()].map((j) => j.color));
    return COLORES.find((c) => !usados.has(c)) ?? COLORES[sala.jugadores.size % COLORES.length];
  }

  const conectados = (sala) => [...sala.jugadores.values()].filter((j) => j.conectado);

  function ubicacionPublica(u) {
    return { id: u.id, isla: u.isla, municipio: u.municipio, lat: u.lat, lng: u.lng, pano: u.pano, rumbo: u.rumbo, lugar: u.lugar, cerca: u.cerca, calle: u.calle, fecha: u.fecha };
  }

  function instantanea(sala, jugador = null) {
    const indice = sala.ronda - 1;
    const s = {
      codigo: sala.codigo,
      anfitrion: sala.anfitrion,
      estado: sala.estado,
      config: sala.config,
      ronda: sala.ronda,
      rondaId: sala.rondaId,
      totalRondas: sala.ubicaciones.length || sala.config.rondas,
      ahora: Date.now(),
      finRonda: sala.finRonda,
      diagonal: sala.diagonal,
      jugadores: [...sala.jugadores.values()].map((j) => ({
        id: j.id,
        nombre: j.nombre,
        color: j.color,
        conectado: j.conectado,
        puntos: j.puntos,
        haAdivinado: sala.estado === 'ronda' && !!j.intentos[indice],
      })),
    };
    if (sala.estado === 'ronda') {
      const u = sala.ubicaciones[indice];
      s.ubicacion = { pano: u.pano, rumbo: u.rumbo, isla: sala.config.pistaIsla ? u.isla : null,
        municipio: sala.config.pistaMunicipio ? u.municipio : null };
      if (jugador) s.miMarcador = jugador.marcador;
    } else if (sala.estado === 'resultado' || sala.estado === 'final') {
      s.resultados = sala.ubicaciones.slice(0, sala.ronda).map((u, i) => ({
        ubicacion: ubicacionPublica(u),
        intentos: [...sala.jugadores.values()].map((j) => ({ id: j.id, ...(j.intentos[i] || { puntos: 0, distancia: null }) })),
      }));
    }
    return s;
  }

  function emitir(sala) {
    io.to(sala.codigo).emit('estado', instantanea(sala));
  }

  function programarFin(sala) {
    clearTimeout(sala.temporizador);
    if (sala.finRonda) {
      sala.temporizador = setTimeout(() => terminarRonda(sala), Math.max(0, sala.finRonda - Date.now()) + 250);
    }
  }

  async function empezarPartida(sala) {
    const anterior = sala.estado;
    sala.estado = 'preparando';
    emitir(sala);
    try {
      const r = catalogo
        ? await catalogo.preparar(sala.config, { tokens: [...sala.jugadores.values()].map((j) => j.token), excluir: sala.usadas })
        : { ubicaciones: N.elegirUbicaciones(ubicaciones, sala.config, { excluir: sala.usadas }) };
      if (!salas.has(sala.codigo)) return;
      if (r.ubicaciones.length < sala.config.rondas) throw new Error('No quedan suficientes lugares sin repetir. Reduce las rondas o amplía los filtros.');
      sala.diagonal = N.escalaPartida(sala.config, islas, municipios);
      sala.ubicaciones = r.ubicaciones;
      sala.ubicaciones.flatMap(N.clavesUbicacion).forEach((k) => sala.usadas.add(k));
      if (r.aviso) io.to(sala.codigo).emit('avisoPartida', r.aviso);
      for (const j of sala.jugadores.values()) {
        j.puntos = 0;
        j.intentos = [];
      }
      sala.ronda = 0;
      iniciarRonda(sala);
    } catch (e) {
      sala.estado = anterior;
      emitir(sala);
      io.to(sala.codigo).emit('errorPartida', e.message);
    }
  }

  function iniciarRonda(sala) {
    sala.ronda++;
    sala.rondaId = crypto.randomUUID();
    for (const j of sala.jugadores.values()) j.marcador = null;
    sala.estado = 'ronda';
    sala.primerIntento = false;
    sala.finRonda = sala.config.tiempo ? Date.now() + sala.config.tiempo * 1000 + MARGEN_CARGA_MS : null;
    programarFin(sala);
    emitir(sala);
  }

  function terminarRonda(sala) {
    if (sala.estado !== 'ronda') return;
    clearTimeout(sala.temporizador);
    for (const j of sala.jugadores.values()) {
      if (!j.intentos[sala.ronda - 1]) registrarIntento(sala, j, j.marcador, true);
    }
    sala.finRonda = null;
    sala.estado = 'resultado';
    emitir(sala);
  }

  function comprobarFinRonda(sala) {
    if (sala.estado !== 'ronda') return;
    const indice = sala.ronda - 1;
    const activos = conectados(sala);
    if (activos.length && activos.every((j) => j.intentos[indice])) terminarRonda(sala);
  }

  function registrarIntento(sala, jugador, pos, automatico = false) {
    const indice = sala.ronda - 1;
    if (jugador.intentos[indice]) return;
    const distancia = pos ? N.distanciaKm(sala.ubicaciones[indice], pos) : null;
    const puntos = pos ? N.puntuar(distancia, sala.diagonal) : 0;
    jugador.intentos[indice] = { lat: pos?.lat ?? null, lng: pos?.lng ?? null, distancia, puntos, automatico };
    jugador.puntos += puntos;
  }

  const posicionValida = (pos) => pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng) && Math.abs(pos.lat) <= 90 && Math.abs(pos.lng) <= 180;

  function adivinar(sala, jugador, lat, lng) {
    if (sala.estado !== 'ronda') return;
    const indice = sala.ronda - 1;
    if (jugador.intentos[indice]) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    if (sala.finRonda && Date.now() >= sala.finRonda) return;

    registrarIntento(sala, jugador, { lat, lng });

    const pendientes = conectados(sala).filter((j) => !j.intentos[indice]);
    if (!pendientes.length) return terminarRonda(sala);

    if (sala.config.cuentaAtras && !sala.primerIntento) {
      sala.primerIntento = true;
      const limite = Date.now() + sala.config.segundosCuentaAtras * 1000;
      if (!sala.finRonda || sala.finRonda > limite) {
        sala.finRonda = limite;
        programarFin(sala);
      }
    }
    emitir(sala);
  }

  function reasignarAnfitrion(sala) {
    const actual = sala.jugadores.get(sala.anfitrion);
    if (actual?.conectado) return;
    const siguiente = conectados(sala)[0];
    if (siguiente) sala.anfitrion = siguiente.id;
  }

  function quitarJugador(sala, jugador) {
    sala.jugadores.delete(jugador.id);
    if (!sala.jugadores.size) {
      clearTimeout(sala.temporizador);
      salas.delete(sala.codigo);
      return;
    }
    reasignarAnfitrion(sala);
    comprobarFinRonda(sala);
    emitir(sala);
  }

  // Limpieza de salas abandonadas
  setInterval(() => {
    const ahora = Date.now();
    for (const sala of salas.values()) {
      if (!conectados(sala).length && ahora - sala.ultimaActividad > ESPERA_BORRADO_MS) {
        clearTimeout(sala.temporizador);
        salas.delete(sala.codigo);
      }
    }
  }, 60 * 1000).unref();

  io.on('connection', (socket) => {
    let sala = null;
    let jugador = null;

    function entrar(s, nombre, token) {
      // ¿Reconexión de alguien que ya estaba?
      let j = [...s.jugadores.values()].find((x) => x.token === token);
      if (j) {
        if (j.socketId && j.socketId !== socket.id) io.sockets.sockets.get(j.socketId)?.leave(s.codigo);
        j.nombre = nombre || j.nombre;
      } else {
        if (!['sala', 'final'].includes(s.estado)) return { ok: false, error: 'La partida ya está en marcha. Podrás entrar cuando termine para jugar la siguiente.' };
        if (s.jugadores.size >= MAX_JUGADORES) return { ok: false, error: 'La sala está llena.' };
        j = { id: crypto.randomUUID().slice(0, 8), token, nombre, color: colorLibre(s), puntos: 0, intentos: [] };
        s.jugadores.set(j.id, j);
      }
      j.conectado = true;
      j.socketId = socket.id;
      s.ultimaActividad = Date.now();
      if (sala && sala !== s && jugador) salir();
      sala = s;
      jugador = j;
      socket.join(s.codigo);
      if (!s.jugadores.has(s.anfitrion)) s.anfitrion = j.id;
      emitir(s);
      return { ok: true, codigo: s.codigo, id: j.id, estado: instantanea(s, j), chat: s.chat };
    }

    function salir() {
      if (!sala || !jugador) return;
      socket.leave(sala.codigo);
      quitarJugador(sala, jugador);
      sala = null;
      jugador = null;
    }

    const esAnfitrion = () => sala && jugador && sala.anfitrion === jugador.id;
    const responder = (ack, datos) => typeof ack === 'function' && ack(datos);

    // Freno a quien cree salas o pruebe códigos en bucle
    const intentos = [];
    function demasiadosIntentos(max, ventanaMs) {
      const ahora = Date.now();
      while (intentos.length && ahora - intentos[0] > ventanaMs) intentos.shift();
      intentos.push(ahora);
      return intentos.length > max;
    }

    socket.on('crear', (datos = {}, ack) => {
      if (demasiadosIntentos(10, 60 * 1000)) return responder(ack, { ok: false, error: 'Vas muy rápido. Espera un momento.' });
      if (salas.size >= MAX_SALAS) return responder(ack, { ok: false, error: 'El servidor está lleno ahora mismo. Prueba en un rato.' });
      const nombre = limpiarNombre(datos.nombre) || 'Jugador';
      const token = typeof datos.token === 'string' ? datos.token.slice(0, 64) : crypto.randomUUID();
      const s = {
        codigo: nuevoCodigo(),
        anfitrion: null,
        estado: 'sala',
        config: N.normalizarConfig(datos.config, municipios),
        jugadores: new Map(),
        ubicaciones: [],
        usadas: new Set(),
        ronda: 0,
        finRonda: null,
        diagonal: 100,
        ultimaActividad: Date.now(),
        chat: [],
      };
      salas.set(s.codigo, s);
      const r = entrar(s, nombre, token);
      s.anfitrion = jugador.id;
      emitir(s);
      responder(ack, { ...r, estado: instantanea(s, jugador) });
    });

    socket.on('unirse', (datos = {}, ack) => {
      if (demasiadosIntentos(10, 60 * 1000)) return responder(ack, { ok: false, error: 'Demasiados intentos. Espera un momento.' });
      const codigo = String(datos.codigo || '').toUpperCase().trim();
      const s = salas.get(codigo);
      if (!s) return responder(ack, { ok: false, error: 'No existe ninguna sala con ese código.' });
      const nombre = limpiarNombre(datos.nombre) || 'Jugador';
      const token = typeof datos.token === 'string' ? datos.token.slice(0, 64) : crypto.randomUUID();
      responder(ack, entrar(s, nombre, token));
    });

    socket.on('config', (config) => {
      if (!esAnfitrion() || sala.estado !== 'sala') return;
      sala.config = N.normalizarConfig(config, municipios);
      emitir(sala);
    });

    socket.on('empezar', () => {
      if (!esAnfitrion() || !['sala', 'final'].includes(sala.estado)) return;
      sala.ultimaActividad = Date.now();
      empezarPartida(sala);
    });

    socket.on('adivinar', (datos = {}) => {
      if (!sala || !jugador || jugador.socketId !== socket.id || datos.rondaId !== sala.rondaId) return;
      sala.ultimaActividad = Date.now();
      adivinar(sala, jugador, datos.lat, datos.lng);
    });

    socket.on('marcador', (datos = {}) => {
      if (!sala || !jugador || jugador.socketId !== socket.id || sala.estado !== 'ronda' || datos.rondaId !== sala.rondaId) return;
      if (jugador.intentos[sala.ronda - 1] || (sala.finRonda && Date.now() >= sala.finRonda) || !posicionValida(datos)) return;
      jugador.marcador = { lat: datos.lat, lng: datos.lng };
      // Privado: las coordenadas provisionales nunca se difunden a los rivales.
      socket.emit('marcadorGuardado', { rondaId: sala.rondaId, ...jugador.marcador });
    });

    socket.on('siguiente', () => {
      if (!esAnfitrion() || sala.estado !== 'resultado') return;
      if (sala.ronda >= sala.ubicaciones.length) {
        sala.estado = 'final';
        emitir(sala);
      } else {
        iniciarRonda(sala);
      }
    });

    // Terminar la ronda ya (p. ej. si alguien se ha quedado AFK en una partida sin límite de tiempo)
    socket.on('forzarFin', () => {
      if (!esAnfitrion() || sala.estado !== 'ronda') return;
      terminarRonda(sala);
    });

    socket.on('volverSala', () => {
      if (!esAnfitrion() || sala.estado !== 'final') return;
      sala.estado = 'sala';
      sala.ronda = 0;
      for (const j of sala.jugadores.values()) {
        j.puntos = 0;
        j.intentos = [];
      }
      emitir(sala);
    });

    socket.on('reaccion', (emoji) => {
      if (!sala || !jugador || !REACCIONES.includes(emoji)) return;
      const ahora = Date.now();
      if (jugador.ultimaReaccion && ahora - jugador.ultimaReaccion < 700) return;
      jugador.ultimaReaccion = ahora;
      io.to(sala.codigo).emit('reaccion', { id: jugador.id, emoji });
    });

    socket.on('chat', (texto) => {
      if (!sala || !jugador || jugador.socketId !== socket.id) return;
      const limpio = limpiarMensaje(texto);
      if (!limpio) return;
      // Como mucho 5 mensajes cada 8 segundos y no más de uno cada 400 ms
      const ahora = Date.now();
      jugador.chatTiempos = (jugador.chatTiempos || []).filter((t) => ahora - t < 8000);
      const ultimo = jugador.chatTiempos[jugador.chatTiempos.length - 1];
      if (jugador.chatTiempos.length >= 5 || (ultimo && ahora - ultimo < 400)) {
        socket.emit('chatAviso', 'Vas muy rápido escribiendo. Espera un momento.');
        return;
      }
      jugador.chatTiempos.push(ahora);
      const mensaje = { id: crypto.randomUUID().slice(0, 8), jugador: jugador.id, nombre: jugador.nombre, color: jugador.color, texto: limpio, hora: ahora };
      sala.chat.push(mensaje);
      if (sala.chat.length > MAX_MENSAJES_GUARDADOS) sala.chat.shift();
      sala.ultimaActividad = ahora;
      io.to(sala.codigo).emit('chat', mensaje);
    });

    socket.on('salir', (ack) => {
      salir();
      responder(ack, { ok: true });
    });

    socket.on('disconnect', () => {
      if (!sala || !jugador || jugador.socketId !== socket.id) return;
      jugador.conectado = false;
      sala.ultimaActividad = Date.now();
      if (sala.estado === 'sala') {
        // En la sala de espera, quien se va desaparece si no vuelve en 20 s
        const s = sala;
        const j = jugador;
        setTimeout(() => {
          if (!j.conectado && s.jugadores.get(j.id) === j) quitarJugador(s, j);
        }, 20000).unref();
      }
      if (sala.anfitrion === jugador.id) {
        // margen por si solo ha recargado la página
        const s = sala;
        setTimeout(() => {
          if (!salas.has(s.codigo)) return;
          const antes = s.anfitrion;
          reasignarAnfitrion(s);
          if (s.anfitrion !== antes) emitir(s);
        }, MARGEN_ANFITRION_MS).unref();
      }
      comprobarFinRonda(sala);
      emitir(sala);
    });
  });
}
