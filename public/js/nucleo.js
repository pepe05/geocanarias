// Lógica común del juego. Sin dependencias del navegador: la usa también el servidor.

export const ISLAS_ORDEN = [
  'el-hierro', 'la-palma', 'la-gomera', 'tenerife',
  'gran-canaria', 'fuerteventura', 'lanzarote', 'la-graciosa',
];

export const PUNTOS_MAX_RONDA = 5000;
export const SEGUNDOS_CUENTA_ATRAS = 15;

export const DIFICULTADES = {
  facil: {
    id: 'facil', nombre: 'Fácil', icono: '🌴',
    tiempo: 0, movimiento: 'libre', zonas: 'urbano', pistaIsla: true,
    resumen: ['Puedes moverte libremente', 'Sin límite de tiempo', 'Pueblos y ciudades', 'Te decimos en qué isla estás'],
  },
  normal: {
    id: 'normal', nombre: 'Normal', icono: '🌋',
    tiempo: 180, movimiento: 'libre', zonas: 'mixto', pistaIsla: false,
    resumen: ['Puedes moverte libremente', '3 minutos por ronda', 'Pueblos y carreteras'],
  },
  dificil: {
    id: 'dificil', nombre: 'Difícil', icono: '🦎',
    tiempo: 90, movimiento: 'libre', zonas: 'rural', pistaIsla: false,
    resumen: ['Puedes moverte libremente', '90 segundos por ronda', 'Campo, montes y carreteras perdidas'],
  },
  extremo: {
    id: 'extremo', nombre: 'Extremo', icono: '🔥',
    tiempo: 45, movimiento: 'congelado', zonas: 'mixto', pistaIsla: false,
    resumen: ['Imagen congelada: sin moverte, girar ni hacer zoom', '45 segundos por ronda', 'Cualquier rincón'],
  },
};

export const OPCIONES = {
  rondas: [1, 3, 5, 10, 15, 20, 30],
  tiempo: [0, 15, 30, 45, 60, 90, 120, 180, 300, 600],
  movimiento: ['libre', 'congelado'],
  zonas: ['urbano', 'mixto', 'rural'],
  reparto: ['equilibrado', 'azar'],
  orientacion: ['carretera', 'aleatoria', 'norte'],
  // aleatoria: lugares nuevos al azar en cada partida; banco: solo ubicaciones ya conocidas.
  // Los valores antiguos ("auto", "explorar") se normalizan a "aleatoria".
  fuente: ['aleatoria', 'banco'],
  segundosCuentaAtras: [10, 15, 30, 60],
};

export const NOMBRES_ZONAS = { urbano: 'Pueblos y ciudades', mixto: 'Mezcla', rural: 'Zonas rurales' };
export const NOMBRES_MOVIMIENTO = { libre: 'Movimiento libre', congelado: 'Congelado (sin mover, girar ni zoom)' };

const CAMPOS_DIFICULTAD = ['tiempo', 'movimiento', 'zonas', 'pistaIsla'];

export function configPorDefecto() {
  return aplicarDificultad(
    { islas: [...ISLAS_ORDEN], municipios: [], rondas: 5, cuentaAtras: true,
      segundosCuentaAtras: 15, reparto: 'equilibrado', orientacion: 'carretera',
      fuente: 'aleatoria', pistaMunicipio: false },
    'normal',
  );
}

export function aplicarDificultad(config, id) {
  const d = DIFICULTADES[id];
  if (!d) return { ...config, dificultad: 'personalizada' };
  const nueva = { ...config, dificultad: id };
  for (const c of CAMPOS_DIFICULTAD) nueva[c] = d[c];
  return nueva;
}

// Si algún ajuste ya no coincide con el preset, la partida pasa a ser "personalizada".
export function recalcularDificultad(config) {
  const d = DIFICULTADES[config.dificultad];
  if (d && CAMPOS_DIFICULTAD.every((c) => d[c] === config[c])) return config;
  const coincide = Object.values(DIFICULTADES).find((p) => CAMPOS_DIFICULTAD.every((c) => p[c] === config[c]));
  return { ...config, dificultad: coincide ? coincide.id : 'personalizada' };
}

// Limpia una configuración recibida de fuera (formularios, red)
export function normalizarConfig(entrada = {}, municipios = null) {
  if (!entrada || typeof entrada !== 'object') entrada = {};
  const base = configPorDefecto();
  const solicitadas = Array.isArray(entrada.islas)
    ? ISLAS_ORDEN.filter((i) => entrada.islas.includes(i))
    : base.islas;
  const islas = solicitadas.length ? solicitadas : base.islas;
  const config = {
    islas,
    rondas: OPCIONES.rondas.includes(Number(entrada.rondas)) ? Number(entrada.rondas) : base.rondas,
    tiempo: OPCIONES.tiempo.includes(Number(entrada.tiempo)) ? Number(entrada.tiempo) : base.tiempo,
    movimiento: OPCIONES.movimiento.includes(entrada.movimiento) ? entrada.movimiento : base.movimiento,
    zonas: OPCIONES.zonas.includes(entrada.zonas) ? entrada.zonas : base.zonas,
    pistaIsla: typeof entrada.pistaIsla === 'boolean' ? entrada.pistaIsla : base.pistaIsla,
    cuentaAtras: typeof entrada.cuentaAtras === 'boolean' ? entrada.cuentaAtras : base.cuentaAtras,
    dificultad: Object.hasOwn(DIFICULTADES, entrada.dificultad) ? entrada.dificultad : 'personalizada',
    municipios: Array.isArray(entrada.municipios) ? [...new Set(entrada.municipios.filter((m) =>
      typeof m === 'string' && /^\d{5}$/.test(m)
      && (!municipios || municipios.some((x) => x.id === m && x.islas.some((i) => islas.includes(i))))))].slice(0, 88) : [],
    pistaMunicipio: entrada.pistaMunicipio === true,
    ...Object.fromEntries(['reparto', 'orientacion', 'fuente', 'segundosCuentaAtras'].map((c) =>
      [c, OPCIONES[c].includes(entrada[c]) ? entrada[c] : base[c]])),
  };
  return recalcularDificultad(config);
}

export function nombreDificultad(id) {
  return DIFICULTADES[id]?.nombre ?? 'Personalizada';
}

export function claveIslas(islas) {
  return islas.length === ISLAS_ORDEN.length ? 'todas' : ISLAS_ORDEN.filter((i) => islas.includes(i)).join('+');
}

// ---------- geografía y puntuación ----------

export function distanciaKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// bbox = [oeste, sur, este, norte]
export function bboxUnion(islasSel, islasInfo) {
  const cajas = islasInfo.filter((i) => islasSel.includes(i.id)).map((i) => i.bbox);
  if (!cajas.length) return null;
  return [
    Math.min(...cajas.map((c) => c[0])),
    Math.min(...cajas.map((c) => c[1])),
    Math.max(...cajas.map((c) => c[2])),
    Math.max(...cajas.map((c) => c[3])),
  ];
}

export function limitesPartida(config, islasInfo, municipios = []) {
  if (!config.municipios?.length) return bboxUnion(config.islas, islasInfo);
  const cajas = [];
  for (const m of municipios.filter((m) => config.municipios.includes(m.id))) {
    for (const i of islasInfo.filter((i) => config.islas.includes(i.id) && m.islas.includes(i.id))) {
      const b = [Math.max(m.bbox[0], i.bbox[0]), Math.max(m.bbox[1], i.bbox[1]), Math.min(m.bbox[2], i.bbox[2]), Math.min(m.bbox[3], i.bbox[3])];
      if (b[0] < b[2] && b[1] < b[3]) cajas.push({ id: String(cajas.length), bbox: b });
    }
  }
  return cajas.length ? bboxUnion(cajas.map((c) => c.id), cajas) : bboxUnion(config.islas, islasInfo);
}

export function escalaPartida(config, islasInfo, municipios = []) {
  const b = limitesPartida(config, islasInfo, municipios);
  return b ? Math.max(25, distanciaKm({ lat: b[1], lng: b[0] }, { lat: b[3], lng: b[2] })) : 100;
}

// Tamaño del "mapa" de la partida: la diagonal de las islas elegidas.
// La puntuación decae según esa escala, como en GeoGuessr.
export function diagonalKm(islasSel, islasInfo) {
  const b = bboxUnion(islasSel, islasInfo);
  if (!b) return 100;
  return Math.max(25, distanciaKm({ lat: b[1], lng: b[0] }, { lat: b[3], lng: b[2] }));
}

export function puntuar(distKm, diagKm) {
  if (distKm == null || !Number.isFinite(distKm)) return 0;
  if (distKm <= 0.025) return PUNTOS_MAX_RONDA;
  return Math.round(PUNTOS_MAX_RONDA * Math.exp((-10 * distKm) / diagKm));
}

// ---------- selección de ubicaciones ----------

export function clavesUbicacion(u) {
  // El panorama y las coordenadas sobreviven a una regeneración de los IDs del banco.
  return [u.id, u.pano ? `p:${u.pano}` : null,
    Number.isFinite(u.lat) && Number.isFinite(u.lng) ? `g:${u.lat.toFixed(5)},${u.lng.toFixed(5)}` : null].filter(Boolean);
}

export function filtrarUbicaciones(ubicaciones, config, excluir = new Set()) {
  const vistas = new Set(excluir);
  for (const u of ubicaciones) if (clavesUbicacion(u).some((k) => vistas.has(k))) clavesUbicacion(u).forEach((k) => vistas.add(k));
  return ubicaciones.filter((u) => {
    if (!config.islas.includes(u.isla) || (config.municipios?.length && !config.municipios.includes(u.municipio))) return false;
    if (config.zonas !== 'mixto' && u.zona !== (config.zonas === 'urbano' ? 'u' : 'r')) return false;
    const claves = clavesUbicacion(u);
    if (claves.some((k) => vistas.has(k))) return false;
    claves.forEach((k) => vistas.add(k));
    return true;
  });
}

export function rumboInicial(u, config, rng = Math.random) {
  return config.orientacion === 'norte' ? 0 : config.orientacion === 'aleatoria' ? Math.floor(rng() * 360) : u.rumbo;
}

export function configClasificable(config) {
  return Object.hasOwn(DIFICULTADES, config.dificultad) && config.rondas === 5
    && !config.municipios?.length && !config.pistaMunicipio
    && (!config.reparto || config.reparto === 'equilibrado')
    && (!config.orientacion || config.orientacion === 'carretera');
}

function barajar(lista, rng) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Reparte las rondas entre las islas elegidas (sin repetir isla hasta haberlas usado todas)
// y escoge ubicaciones al azar del tipo de zona pedido.
export function elegirUbicaciones(ubicaciones, config, { excluir = new Set(), rng = Math.random } = {}) {
  const disponibles = filtrarUbicaciones(ubicaciones, config, excluir);
  if (config.reparto === 'azar') return barajar(disponibles, rng).slice(0, config.rondas);
  const pools = new Map();
  for (const isla of config.islas) {
    const pool = disponibles.filter((u) => u.isla === isla);
    if (pool.length) pools.set(isla, barajar(pool, rng));
  }
  const elegidas = [];
  while (pools.size && elegidas.length < config.rondas) {
    for (const isla of barajar([...pools.keys()], rng)) {
      const pool = pools.get(isla);
      elegidas.push(pool.pop());
      if (!pool.length) pools.delete(isla);
      if (elegidas.length === config.rondas) break;
    }
  }
  return elegidas;
}

// ---------- formato ----------

export function formatoDistancia(km) {
  if (km == null) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`;
  return `${Math.round(km).toLocaleString('es-ES')} km`;
}

export function formatoPuntos(p) {
  return Math.round(p).toLocaleString('es-ES');
}

export function formatoTiempo(seg) {
  if (!seg) return 'Sin límite';
  if (seg < 60) return `${seg} s`;
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

export function valoracion(porcentaje) {
  if (porcentaje >= 0.9) return '¡Nivel Mencey! Conoces cada rincón de las islas.';
  if (porcentaje >= 0.75) return '¡Chacho, qué nivel! Tú eres de aquí seguro.';
  if (porcentaje >= 0.55) return '¡Muy bien! Te mueves por las islas como un local.';
  if (porcentaje >= 0.35) return 'Nada mal, pero te falta coger alguna guagua más.';
  if (porcentaje >= 0.15) return 'Te hacen falta más viajes… y más papas con mojo.';
  return '¿Seguro que no estabas buscando en la Península? 😅';
}
