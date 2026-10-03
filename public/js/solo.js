// Partida en solitario: todo ocurre en el navegador.
// Al terminar, si es una partida estándar, se envía a la clasificación global (el servidor recalcula los puntos).

import {
  elegirUbicaciones, escalaPartida, distanciaKm, puntuar, claveIslas, formatoPuntos, configClasificable, rumboInicial,
} from './nucleo.js';
import { almacen, confirmar, esc, aviso } from './ui.js';
import { leerVistas, recordarUbicaciones, obtenerToken } from './historial.js';

export function puntuaEnClasificacion(config) {
  return configClasificable(config);
}

export function crearModoSolo({ datos, juego, resultados, nombreJugador, alSalir, alConfigurar }) {
  let partida = null;
  let preparando = false;

  async function empezar(config) {
    if (preparando) return;
    preparando = true;
    try {
      const vistas = leerVistas();
      let ubicaciones;
      let res;
      try {
        res = await fetch('api/partida', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config, token: obtenerToken(), vistas: [...vistas] }), signal: AbortSignal.timeout(30000) });
      } catch (e) {
        // Un timeout puede haber reservado la partida: no repetir localmente esos lugares.
        if (e.name === 'TimeoutError') throw new Error('La búsqueda está tardando demasiado. Vuelve a intentarlo en unos segundos.');
      }
      if (res && res.status !== 404 && res.headers.get('content-type')?.includes('application/json')) {
        const r = await res.json();
        if (!r.ok) throw new Error(r.error || 'No se pudo preparar la partida.');
        ubicaciones = r.ubicaciones;
        config = r.config;
        if (r.aviso) aviso(r.aviso, '', 7000);
      } else {
        await datos.banco;
        ubicaciones = elegirUbicaciones(datos.ubicaciones, config, { excluir: vistas }).map((u) => ({ ...u, rumbo: rumboInicial(u, config) }));
        if (ubicaciones.length < config.rondas) throw new Error(`Solo quedan ${ubicaciones.length} lugares sin visitar. Reduce las rondas o amplía los filtros. Arranca el servidor para buscar nuevos panoramas.`);
        if (config.fuente === 'aleatoria') aviso('Sin servidor no se pueden sacar lugares al azar: usamos ubicaciones sin visitar del banco.', '', 6000);
      }
      recordarUbicaciones(ubicaciones);
      partida = {
        config,
        ubicaciones,
        ronda: 0,
        intentos: [],
        puntos: 0,
        diagonal: escalaPartida(config, datos.islas, datos.municipios),
      };
      siguienteRonda();
    } catch (e) { aviso(e.message, 'error', 9000); }
    finally { preparando = false; }
  }

  function siguienteRonda() {
    const p = partida;
    const u = p.ubicaciones[p.ronda];
    p.ronda++;
    const verIsla = p.config.pistaIsla && p.config.islas.length > 1;
    juego.iniciarRonda(
      {
        ubicacion: { pano: u.pano, rumbo: u.rumbo, isla: verIsla ? u.isla : null,
          municipio: p.config.pistaMunicipio ? u.municipio : null },
        ronda: p.ronda,
        total: p.ubicaciones.length,
        puntos: p.puntos,
        config: p.config,
        finRonda: p.config.tiempo ? Date.now() + p.config.tiempo * 1000 + 1500 : null,
        color: '#ffc93c',
      },
      {
        alAdivinar: registrarIntento,
        alTiempoAgotado: (pos) => registrarIntento(pos, true),
        alAbandonar: abandonar,
      },
    );
  }

  function registrarIntento(pos, automatico = false) {
    const p = partida;
    if (!p || p.intentos.length >= p.ronda) return;
    const u = p.ubicaciones[p.ronda - 1];
    const distancia = pos ? distanciaKm(u, pos) : null;
    const puntos = pos ? puntuar(distancia, p.diagonal) : 0;
    const intento = { id: u.id, lat: pos?.lat ?? null, lng: pos?.lng ?? null, distancia, puntos, automatico };
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
          config: p.config,
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
