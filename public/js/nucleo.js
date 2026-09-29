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
  rondas: [3, 5, 10],
  tiempo: [0, 30, 45, 60, 90, 120, 180, 300],
  movimiento: ['libre', 'congelado'],
  zonas: ['urbano', 'mixto', 'rural'],
};

export const NOMBRES_ZONAS = { urbano: 'Pueblos y ciudades', mixto: 'Mezcla', rural: 'Zonas rurales' };
export const NOMBRES_MOVIMIENTO = { libre: 'Movimiento libre', congelado: 'Congelado (sin mover, girar ni zoom)' };

const CAMPOS_DIFICULTAD = ['tiempo', 'movimiento', 'zonas', 'pistaIsla'];

export function configPorDefecto() {
  return aplicarDificultad(
    { islas: [...ISLAS_ORDEN], rondas: 5, cuentaAtras: true },
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
export function normalizarConfig(entrada = {}) {
  const base = configPorDefecto();
  const islas = Array.isArray(entrada.islas)
    ? ISLAS_ORDEN.filter((i) => entrada.islas.includes(i))
    : base.islas;
  const config = {
    islas: islas.length ? islas : base.islas,
    rondas: OPCIONES.rondas.includes(Number(entrada.rondas)) ? Number(entrada.rondas) : base.rondas,
    tiempo: OPCIONES.tiempo.includes(Number(entrada.tiempo)) ? Number(entrada.tiempo) : base.tiempo,
    movimiento: OPCIONES.movimiento.includes(entrada.movimiento) ? entrada.movimiento : base.movimiento,
    zonas: OPCIONES.zonas.includes(entrada.zonas) ? entrada.zonas : base.zonas,
    pistaIsla: typeof entrada.pistaIsla === 'boolean' ? entrada.pistaIsla : base.pistaIsla,
    cuentaAtras: typeof entrada.cuentaAtras === 'boolean' ? entrada.cuentaAtras : base.cuentaAtras,
    dificultad: entrada.dificultad in DIFICULTADES ? entrada.dificultad : 'personalizada',
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
  const pools = new Map();
  for (const isla of config.islas) {
    const deIsla = ubicaciones.filter((u) => u.isla === isla);
    let pool = deIsla;
    if (config.zonas === 'urbano') pool = deIsla.filter((u) => u.zona === 'u');
    else if (config.zonas === 'rural') pool = deIsla.filter((u) => u.zona === 'r');
    if (pool.length < 3) pool = deIsla;
    const sinVistas = pool.filter((u) => !excluir.has(u.id));
    if (sinVistas.length >= Math.min(config.rondas, 3)) pool = sinVistas;
    if (pool.length) pools.set(isla, barajar(pool, rng));
  }
  const islasDisponibles = [...pools.keys()];
  if (!islasDisponibles.length) return [];

  const orden = [];
  while (orden.length < config.rondas) {
    orden.push(...barajar(islasDisponibles, rng));
  }
  const elegidas = [];
  for (const isla of orden.slice(0, config.rondas)) {
    const pool = pools.get(isla);
    const u = pool.find((x) => !elegidas.includes(x));
    if (u) elegidas.push(u);
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
