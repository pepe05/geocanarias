// Partida en solitario: todo ocurre en el navegador.
// Al terminar, si es una partida estándar, se envía a la clasificación global (el servidor recalcula los puntos).

import {
  DIFICULTADES, elegirUbicaciones, diagonalKm, distanciaKm, puntuar, claveIslas, formatoPuntos,
} from './nucleo.js';
import { almacen, confirmar, esc } from './ui.js';

const MAX_VISTAS = 500;

export function puntuaEnClasificacion(config) {
  return config.dificultad in DIFICULTADES && config.rondas === 5;
}

export function crearModoSolo({ datos, juego, resultados, nombreJugador, alSalir, alConfigurar }) {
  let partida = null;

  function empezar(config) {
    const vistas = almacen.leer('vistas', []);
    const ubicaciones = elegirUbicaciones(datos.ubicaciones, config, { excluir: new Set(vistas) });
    almacen.escribir('vistas', [...vistas, ...ubicaciones.map((u) => u.id)].slice(-MAX_VISTAS));
    partida = {
      config,
      ubicaciones,
      ronda: 0,
      intentos: [],
      puntos: 0,
      diagonal: diagonalKm(config.islas, datos.islas),
    };
    siguienteRonda();
  }

  function siguienteRonda() {
    const p = partida;
    const u = p.ubicaciones[p.ronda];
    p.ronda++;
    const verIsla = p.config.pistaIsla && p.config.islas.length > 1;
    juego.iniciarRonda(
      {
        ubicacion: { pano: u.pano, rumbo: u.rumbo, isla: verIsla ? u.isla : null },
        ronda: p.ronda,
        total: p.ubicaciones.length,
        puntos: p.puntos,
        config: p.config,
        finRonda: p.config.tiempo ? Date.now() + p.config.tiempo * 1000 + 1500 : null,
        color: '#ffc93c',
      },
      {
        alAdivinar: registrarIntento,
        alTiempoAgotado: registrarIntento,
        alAbandonar: abandonar,
      },
    );
  }

  function registrarIntento(pos) {
    const p = partida;
    if (!p || p.intentos.length >= p.ronda) return;
    const u = p.ubicaciones[p.ronda - 1];
    const distancia = pos ? distanciaKm(u, pos) : null;
    const puntos = pos ? puntuar(distancia, p.diagonal) : 0;
    const intento = { id: u.id, lat: pos?.lat ?? null, lng: pos?.lng ?? null, distancia, puntos };
    p.intentos.push(intento);
    p.puntos += puntos;
    juego.detener();
    resultados.rondaSolo({
      ubicacion: u,
      intento,
      ronda: p.ronda,
      total: p.ubicaciones.length,
      puntosTotales: p.puntos,
      alSiguiente: () => (p.ronda >= p.ubicaciones.length ? terminar() : siguienteRonda()),
    });
  }

  async function abandonar() {
    const ok = await confirmar('¿Abandonar la partida?', 'Perderás los puntos de esta partida.', { si: 'Abandonar', no: 'Seguir jugando' });
    if (!ok) return;
    juego.detener();
    partida = null;
    alSalir();
  }

  async function terminar() {
    const p = partida;
    const puntua = puntuaEnClasificacion(p.config);
    resultados.finalSolo({
      partida: p,
      registro: puntua ? 'Guardando en la clasificación…' : 'Las partidas personalizadas no entran en la clasificación.',
      alRepetir: () => empezar(p.config),
      alConfig: alConfigurar,
      alMenu: alSalir,
    });
    if (!puntua) return;

    const nombre = nombreJugador();
    const registro = {
      nombre,
      puntos: p.puntos,
      dificultad: p.config.dificultad,
      islas: claveIslas(p.config.islas),
      fecha: new Date().toISOString(),
    };
    const locales = almacen.leer('records', []);
    locales.push(registro);
    locales.sort((a, b) => b.puntos - a.puntos);
    almacen.escribir('records', locales.slice(0, 300));
    const mejorLocal = !locales.some((r) => r !== registro && r.dificultad === registro.dificultad && r.islas === registro.islas && r.puntos >= registro.puntos);

    try {
      const res = await fetch('api/clasificacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          dificultad: p.config.dificultad,
          islas: p.config.islas,
          rondas: p.intentos.map((i) => ({ id: i.id, lat: i.lat, lng: i.lng })),
        }),
      });
      const r = await res.json();
      if (!r.ok) throw new Error(r.error);
      const pos = r.posicion
        ? `Estás en el puesto <strong>${r.posicion}.º</strong> de ${r.total} en la clasificación global.`
        : 'Esta vez no has entrado en el top 100 global.';
      resultados.mostrarRegistro(`${mejorLocal ? '⭐ ¡Nuevo récord personal! ' : ''}${pos}`, r.posicion && r.posicion <= 10);
    } catch {
      resultados.mostrarRegistro(
        `${mejorLocal ? '⭐ ¡Nuevo récord personal! ' : ''}Guardado en tus partidas (${formatoPuntos(p.puntos)} puntos como <strong>${esc(nombre)}</strong>). La clasificación global no está disponible ahora.`,
        mejorLocal,
      );
    }
  }

  return { empezar };
}
