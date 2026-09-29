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

export function crearGestorSalas(io, { islas, ubicaciones }) {
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
    return { id: u.id, isla: u.isla, lat: u.lat, lng: u.lng, pano: u.pano, rumbo: u.rumbo, lugar: u.lugar, cerca: u.cerca, calle: u.calle, fecha: u.fecha };
  }

  function instantanea(sala) {
    const indice = sala.ronda - 1;
    const s = {
      codigo: sala.codigo,
      anfitrion: sala.anfitrion,
      estado: sala.estado,
      config: sala.config,
      ronda: sala.ronda,
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
      s.ubicacion = { pano: u.pano, rumbo: u.rumbo, isla: sala.config.pistaIsla ? u.isla : null };
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

  function empezarPartida(sala) {
    sala.diagonal = N.diagonalKm(sala.config.islas, islas);
    sala.ubicaciones = N.elegirUbicaciones(ubicaciones, sala.config, { excluir: sala.usadas });
    if (sala.usadas.size > 1000) sala.usadas.clear();
    sala.ubicaciones.forEach((u) => sala.usadas.add(u.id));
    for (const j of sala.jugadores.values()) {
      j.puntos = 0;
      j.intentos = [];
    }
    sala.ronda = 0;
    iniciarRonda(sala);
  }

  function iniciarRonda(sala) {
    sala.ronda++;
    sala.estado = 'ronda';
    sala.primerIntento = false;
    sala.finRonda = sala.config.tiempo ? Date.now() + sala.config.tiempo * 1000 + MARGEN_CARGA_MS : null;
    programarFin(sala);
    emitir(sala);
  }

  function terminarRonda(sala) {
    if (sala.estado !== 'ronda') return;
    clearTimeout(sala.temporizador);
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

  function adivinar(sala, jugador, lat, lng) {
    if (sala.estado !== 'ronda') return;
    const indice = sala.ronda - 1;
    if (jugador.intentos[indice]) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    if (sala.finRonda && Date.now() > sala.finRonda + 1500) return;

    const u = sala.ubicaciones[indice];
    const distancia = N.distanciaKm(u, { lat, lng });
    const puntos = N.puntuar(distancia, sala.diagonal);
    jugador.intentos[indice] = { lat, lng, distancia, puntos };
    jugador.puntos += puntos;

    const pendientes = conectados(sala).filter((j) => !j.intentos[indice]);
    if (!pendientes.length) return terminarRonda(sala);

    if (sala.config.cuentaAtras && !sala.primerIntento) {
      sala.primerIntento = true;
      const limite = Date.now() + N.SEGUNDOS_CUENTA_ATRAS * 1000;
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
      return { ok: true, codigo: s.codigo, id: j.id, estado: instantanea(s) };
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
        config: N.normalizarConfig(datos.config),
        jugadores: new Map(),
        ubicaciones: [],
        usadas: new Set(),
        ronda: 0,
        finRonda: null,
        diagonal: 100,
        ultimaActividad: Date.now(),
      };
      salas.set(s.codigo, s);
      const r = entrar(s, nombre, token);
      s.anfitrion = jugador.id;
      emitir(s);
      responder(ack, { ...r, estado: instantanea(s) });
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
      sala.config = N.normalizarConfig(config);
      emitir(sala);
    });

    socket.on('empezar', () => {
      if (!esAnfitrion() || !['sala', 'final'].includes(sala.estado)) return;
      sala.ultimaActividad = Date.now();
      empezarPartida(sala);
    });

    socket.on('adivinar', (datos = {}) => {
      if (!sala || !jugador) return;
      sala.ultimaActividad = Date.now();
      adivinar(sala, jugador, Number(datos.lat), Number(datos.lng));
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
        }, 20000);
      }
      if (sala.anfitrion === jugador.id) {
        // margen por si solo ha recargado la página
        const s = sala;
        setTimeout(() => {
          if (!salas.has(s.codigo)) return;
          const antes = s.anfitrion;
          reasignarAnfitrion(s);
          if (s.anfitrion !== antes) emitir(s);
        }, MARGEN_ANFITRION_MS);
      }
      comprobarFinRonda(sala);
      emitir(sala);
    });
  });
}
