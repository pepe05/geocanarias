// Catálogo de ubicaciones del servidor.
//
// Con la fuente "aleatoria" (por defecto) cada partida usa lugares nuevos sacados al azar de todo el
// territorio: el servidor mantiene en segundo plano una reserva de panoramas recién descubiertos para
// que la partida empiece al instante, busca en directo si la reserva no basta y solo recurre al banco
// verificado como último recurso. Todo lo descubierto se añade al banco, que así no para de crecer.
// Con la fuente "banco" solo se usan las ubicaciones ya conocidas.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buscarPanorama } from './panoramas.js';
import { crearExplorador } from './explorador.js';
import { clavesUbicacion, elegirUbicaciones, filtrarUbicaciones, normalizarConfig, rumboInicial } from '../public/js/nucleo.js';

const MAX_EXTRAS_GUARDADAS = 60000;
const PAUSA_RELLENO_MS = 150;
const FALLOS_PARA_AGOTAR_GRUPO = 40; // p. ej. no hay zonas urbanas con Street View en La Graciosa
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function barajar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function crearCatalogo({ ubicaciones, islas, municipios, nucleos = [], directorio,
  buscar = buscarPanorama, presupuestoMs = 12000, maxIntentos = 100,
  segundoPlano = false, reservaPorGrupo = 8, pausaRellenoMs = PAUSA_RELLENO_MS }) {
  const leer = (nombre, base) => {
    try { return JSON.parse(fs.readFileSync(path.join(directorio, nombre), 'utf8')); } catch { return base; }
  };
  const extras = leer('ubicaciones-extra.json', []);
  const historiales = leer('historiales.json', {});
  const claves = new Set(ubicaciones.flatMap(clavesUbicacion));
  for (const u of extras) if (!clavesUbicacion(u).some((k) => claves.has(k))) {
    ubicaciones.push(u); clavesUbicacion(u).forEach((k) => claves.add(k));
  }
  const guardar = (nombre, datos) => {
    fs.mkdirSync(directorio, { recursive: true });
    const fichero = path.join(directorio, nombre);
    fs.writeFileSync(fichero + '.tmp', JSON.stringify(datos));
    fs.renameSync(fichero + '.tmp', fichero);
  };
  const claveJugador = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
  const ocupados = new Set();
  let trabajos = 0;

  const explorador = crearExplorador({ islas, municipios, nucleos, buscar });
  const reserva = []; // descubiertas y todavía sin servir a nadie
  const estado = { descubiertas: 0, ultimoError: null, ultimoErrorEn: null };

  // ---------------------------------------------------------------- banco ampliado
  let temporizadorExtras = null;
  function guardarExtras(ahora = false) {
    clearTimeout(temporizadorExtras);
    const escribir = () => {
      try { guardar('ubicaciones-extra.json', extras); } catch (e) { estado.ultimoError = `No se pudo guardar el banco: ${e.message}`; }
    };
    if (ahora) escribir();
    else temporizadorExtras = setTimeout(escribir, 10000);
  }

  // Añade al banco un lugar recién descubierto. Devuelve false si ya se conocía.
  function incorporar(u) {
    if (clavesUbicacion(u).some((k) => claves.has(k))) return false;
    clavesUbicacion(u).forEach((k) => claves.add(k));
    ubicaciones.push(u);
    if (extras.length < MAX_EXTRAS_GUARDADAS) {
      extras.push(u);
      guardarExtras();
    }
    estado.descubiertas++;
    return true;
  }

  // ---------------------------------------------------------------- reserva en segundo plano
  const grupoDe = (u) => `${u.isla}:${u.zona}`;
  const tamanoGrupo = (g) => reserva.reduce((n, u) => n + (grupoDe(u) === g ? 1 : 0), 0);
  const agotados = new Map(); // grupo → instante hasta el que no se vuelve a intentar
  let rellenando = false;
  let pausaHasta = 0;
  let parado = false;

  function anadirAReserva(u) {
    if (tamanoGrupo(grupoDe(u)) < reservaPorGrupo * 2) reserva.push(u);
  }

  function grupoPendiente() {
    const ahora = Date.now();
    let mejor = null;
    let menor = Infinity;
    for (const isla of islas) for (const zona of ['u', 'r']) {
      const g = `${isla.id}:${zona}`;
      if ((agotados.get(g) || 0) > ahora) continue;
      const n = tamanoGrupo(g);
      if (n < reservaPorGrupo && n < menor) {
        menor = n;
        mejor = { isla: isla.id, zona, clave: g };
      }
    }
    return mejor;
  }

  async function rellenar() {
    if (!segundoPlano || parado || rellenando || Date.now() < pausaHasta) return;
    rellenando = true;
    const fallos = new Map();
    let erroresSeguidos = 0;
    try {
      for (let g = grupoPendiente(); g && !parado; g = grupoPendiente()) {
        const config = normalizarConfig({ islas: [g.isla], zonas: g.zona === 'u' ? 'urbano' : 'rural' }, municipios);
        let u = null;
        try {
          u = await explorador.descubrir(config);
          erroresSeguidos = 0;
        } catch (e) {
          estado.ultimoError = e.message;
          estado.ultimoErrorEn = new Date().toISOString();
          // Si Street View no responde, se descansa en vez de insistir
          if (++erroresSeguidos >= 6) {
            pausaHasta = Date.now() + 10 * 60 * 1000;
            break;
          }
          await dormir(1000 * 2 ** erroresSeguidos);
          continue;
        }
        let util = false;
        if (u && incorporar(u)) {
          const antes = reserva.length;
          anadirAReserva(u);
          util = reserva.length > antes && grupoDe(u) === g.clave;
        }
        if (util) {
          fallos.set(g.clave, 0);
        } else {
          const f = (fallos.get(g.clave) || 0) + 1;
          fallos.set(g.clave, f);
          if (f >= FALLOS_PARA_AGOTAR_GRUPO) {
            agotados.set(g.clave, Date.now() + 30 * 60 * 1000);
            fallos.set(g.clave, 0);
          }
        }
        await dormir(pausaRellenoMs);
      }
    } finally {
      rellenando = false;
    }
  }

  const arranque = segundoPlano ? setTimeout(rellenar, 2000) : null;
  arranque?.unref?.();

  function detener() {
    parado = true;
    clearTimeout(arranque);
    clearTimeout(temporizadorExtras);
  }

  // ---------------------------------------------------------------- búsqueda en directo
  async function explorarEnVivo(config, faltan, excluir) {
    const encontradas = [];
    if (faltan <= 0) return encontradas;
    const limite = Date.now() + presupuestoMs;
    const signal = AbortSignal.timeout(Math.max(1, presupuestoMs));
    let intentos = 0;
    let fallos = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (Date.now() < limite && intentos++ < maxIntentos && encontradas.length < faltan && fallos < 6) {
        let u;
        try {
          u = await explorador.descubrir(config, { signal });
        } catch (e) {
          fallos++;
          if (e.name !== 'TimeoutError' && e.name !== 'AbortError') {
            estado.ultimoError = e.message;
            estado.ultimoErrorEn = new Date().toISOString();
          }
          continue;
        }
        if (!u || !incorporar(u)) continue;
        if (encontradas.length < faltan && filtrarUbicaciones([u], config, excluir).length) encontradas.push(u);
        else anadirAReserva(u); // vale para otras partidas aunque no para esta
      }
    }));
    if (encontradas.length) guardarExtras(true);
    return encontradas;
  }

  // ---------------------------------------------------------------- partidas
  async function preparar(entrada, { tokens = [], excluir = [] } = {}) {
    const config = normalizarConfig(entrada, municipios);
    // Una selección inválida no se convierte silenciosamente en todo el archipiélago.
    if (entrada?.municipios?.length && !config.municipios.length) throw new Error('Elige municipios de las islas seleccionadas.');
    const jugadores = [...new Set(tokens.filter((t) => typeof t === 'string' && t.length > 0).map(claveJugador))];
    if (trabajos >= 2 || jugadores.some((k) => ocupados.has(k))) throw new Error('Ya se están buscando ubicaciones. Espera un momento.');
    trabajos++;
    jugadores.forEach((k) => ocupados.add(k));
    try {
      const vistas = new Set(excluir);
      for (const k of jugadores) for (const v of historiales[k] || []) vistas.add(v);
      // Migra también los IDs antiguos al panorama y posición estables.
      for (const u of ubicaciones) if (clavesUbicacion(u).some((k) => vistas.has(k))) clavesUbicacion(u).forEach((k) => vistas.add(k));

      let seleccion = [];
      const excluidas = () => new Set([...vistas, ...seleccion.flatMap(clavesUbicacion)]);
      if (config.fuente === 'aleatoria') {
        seleccion = elegirUbicaciones(reserva, config, { excluir: vistas });
        if (seleccion.length < config.rondas) {
          seleccion.push(...await explorarEnVivo(config, config.rondas - seleccion.length, excluidas()));
        }
      }
      const aleatorias = seleccion.length;
      const faltan = config.rondas - seleccion.length;
      if (faltan > 0) {
        const banco = filtrarUbicaciones(ubicaciones, config, excluidas());
        if (banco.length < faltan) {
          // Caso típico: pueblos en La Graciosa, donde Street View solo cubre pistas rurales
          const sinEseTipo = config.zonas !== 'mixto'
            && !filtrarUbicaciones(ubicaciones, config).length
            && filtrarUbicaciones(ubicaciones, { ...config, zonas: 'mixto' }).length > 0;
          if (sinEseTipo) {
            throw new Error(`No hay ${config.zonas === 'urbano' ? 'pueblos ni ciudades' : 'zonas rurales'} con Street View en la zona elegida. Elige «Mezcla» u otro tipo de lugar.`);
          }
          throw new Error(`Quedan ${seleccion.length + banco.length} ubicaciones sin visitar con estos filtros. Reduce las rondas, amplía la zona${config.fuente === 'banco' ? ' o elige ubicaciones aleatorias' : ' o vuelve a intentarlo en unos segundos'}. No se repetirá ninguna ubicación.`);
        }
        seleccion.push(...elegirUbicaciones(banco, { ...config, rondas: faltan }, { excluir: excluidas() }));
      }

      const elegidas = barajar(seleccion).map((u) => ({ ...u, rumbo: rumboInicial(u, config) }));
      const servidas = new Set(elegidas.map((u) => u.pano));
      for (let i = reserva.length - 1; i >= 0; i--) if (servidas.has(reserva[i].pano)) reserva.splice(i, 1);
      // Reservar toda la partida evita duplicados entre pestañas, salas y revanchas.
      for (const k of jugadores) historiales[k] = [...new Set([...(historiales[k] || []),
        ...(jugadores.length === 1 ? excluir : []), ...elegidas.flatMap(clavesUbicacion)])];
      if (jugadores.length) guardar('historiales.json', historiales);
      rellenar();
      return {
        config,
        ubicaciones: elegidas,
        nuevas: aleatorias,
        aviso: config.fuente === 'aleatoria' && aleatorias < config.rondas
          ? 'Ahora mismo no se encontraron suficientes lugares nuevos al azar; completamos la partida con lugares del banco que aún no has visitado.'
          : null,
      };
    } finally {
      trabajos--;
      jugadores.forEach((k) => ocupados.delete(k));
    }
  }

  function recordar(token, vistas) {
    const k = claveJugador(token);
    historiales[k] = [...new Set([...(historiales[k] || []), ...vistas])];
    guardar('historiales.json', historiales);
  }

  function resumen() {
    const porIsla = {};
    for (const u of reserva) porIsla[u.isla] = (porIsla[u.isla] || 0) + 1;
    return {
      banco: ubicaciones.length,
      descubiertasDesdeArranque: estado.descubiertas,
      reserva: reserva.length,
      reservaPorIsla: porIsla,
      buscando: rellenando,
      pausadoHasta: pausaHasta > Date.now() ? new Date(pausaHasta).toISOString() : null,
      ultimoError: estado.ultimoError,
      ultimoErrorEn: estado.ultimoErrorEn,
    };
  }

  return { preparar, recordar, resumen, rellenar, detener, explorador };
}
