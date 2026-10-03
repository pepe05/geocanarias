// Amplía public/data/ubicaciones.json con lugares sacados al azar de todo el territorio,
// usando el mismo explorador que el servidor. No borra nada: solo añade lugares nuevos.
//
// Uso:  node tools/ampliar-banco.mjs              (añade unas 8.000 ubicaciones)
//       node tools/ampliar-banco.mjs --nuevas 2000

import fs from 'node:fs/promises';
import { crearExplorador } from '../servidor/explorador.js';
import { clavesUbicacion, normalizarConfig } from '../public/js/nucleo.js';

const raiz = new URL('../', import.meta.url);
const leer = async (ruta) => JSON.parse(await fs.readFile(new URL(ruta, raiz), 'utf8'));
const arg = process.argv.indexOf('--nuevas');
const NUEVAS = arg > -1 ? Number(process.argv[arg + 1]) : 8000;
const TRABAJADORES = 4;
const SEPARACION_KM = 0.15;
const PROPORCION_URBANA = 0.45;
const FALLOS_PARA_AGOTAR = 80;

const islas = await leer('public/data/islas.json');
const municipios = await leer('public/data/limites-municipales.json');
const nucleos = await leer('public/data/nucleos.json');
const rutaBanco = new URL('public/data/ubicaciones.json', raiz);
const banco = JSON.parse(await fs.readFile(rutaBanco, 'utf8'));
const explorador = crearExplorador({ islas, municipios, nucleos });

// Cuotas por isla según su superficie (suavizada para que las pequeñas no queden olvidadas)
const SUPERFICIE = { tenerife: 2034, 'gran-canaria': 1560, fuerteventura: 1660, lanzarote: 846, 'la-palma': 708, 'la-gomera': 370, 'el-hierro': 269, 'la-graciosa': 29 };
const pesos = Object.fromEntries(islas.map((i) => [i.id, (SUPERFICIE[i.id] || 100) ** 0.7]));
const sumaPesos = Object.values(pesos).reduce((a, b) => a + b, 0);
const grupos = islas.flatMap((i) => {
  const total = Math.round((NUEVAS * pesos[i.id]) / sumaPesos);
  return [
    { isla: i.id, zona: 'u', objetivo: Math.round(total * PROPORCION_URBANA), hechas: 0, fallos: 0 },
    { isla: i.id, zona: 'r', objetivo: total - Math.round(total * PROPORCION_URBANA), hechas: 0, fallos: 0 },
  ];
});

// Índice espacial sencillo (celdas de ~550 m) para mantener la separación mínima
const celda = (lat, lng) => `${Math.floor(lat / 0.005)}:${Math.floor(lng / 0.005)}`;
const indice = new Map();
const claves = new Set();
function registrar(u) {
  clavesUbicacion(u).forEach((k) => claves.add(k));
  const c = celda(u.lat, u.lng);
  if (!indice.has(c)) indice.set(c, []);
  indice.get(c).push(u);
}
function demasiadoCerca(u) {
  const fila = Math.floor(u.lat / 0.005);
  const col = Math.floor(u.lng / 0.005);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const v of indice.get(`${fila + i}:${col + j}`) || []) {
      const dLat = (v.lat - u.lat) * 111.32;
      const dLng = (v.lng - u.lng) * 111.32 * Math.cos((u.lat * Math.PI) / 180);
      if (Math.hypot(dLat, dLng) < SEPARACION_KM) return true;
    }
  }
  return false;
}
banco.ubicaciones.forEach(registrar);

const inicial = banco.ubicaciones.length;
let anadidas = 0;
let peticiones = 0;
let errores = 0;
let desdeGuardado = 0;

async function guardar() {
  banco.generado = new Date().toISOString().slice(0, 10);
  banco.total = banco.ubicaciones.length;
  await fs.writeFile(rutaBanco, JSON.stringify(banco));
  desdeGuardado = 0;
}

function siguienteGrupo() {
  const pendientes = grupos.filter((g) => g.hechas < g.objetivo && g.fallos < FALLOS_PARA_AGOTAR);
  if (!pendientes.length) return null;
  return pendientes.reduce((a, b) => (a.hechas / a.objetivo <= b.hechas / b.objetivo ? a : b));
}

async function trabajador() {
  for (let g = siguienteGrupo(); g; g = siguienteGrupo()) {
    const config = normalizarConfig({ islas: [g.isla], zonas: g.zona === 'u' ? 'urbano' : 'rural' });
    let u = null;
    peticiones++;
    try {
      u = await explorador.descubrir(config);
      errores = 0;
    } catch (e) {
      if (++errores > 30) throw new Error(`Street View no responde: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * Math.min(30, errores)));
      continue;
    }
    if (!u || u.zona !== g.zona || clavesUbicacion(u).some((k) => claves.has(k)) || demasiadoCerca(u)) {
      g.fallos++;
      continue;
    }
    g.fallos = 0;
    g.hechas++;
    registrar(u);
    banco.ubicaciones.push(u);
    anadidas++;
    if (++desdeGuardado >= 250) {
      await guardar();
      console.log(`  +${anadidas} (${banco.ubicaciones.length} en total, ${peticiones} consultas)`);
    }
  }
}

console.log(`Banco actual: ${inicial} ubicaciones. Buscando hasta ${NUEVAS} nuevas al azar…`);
const inicio = Date.now();
await Promise.all(Array.from({ length: TRABAJADORES }, trabajador));
await guardar();
console.log(`\n✔ Añadidas ${anadidas} ubicaciones en ${Math.round((Date.now() - inicio) / 1000)} s (${peticiones} consultas). Total: ${banco.ubicaciones.length}`);
for (const g of grupos) console.log(`  ${g.isla.padEnd(14)} ${g.zona === 'u' ? 'urbanas' : 'rurales'}: ${g.hechas}/${g.objetivo}${g.fallos >= FALLOS_PARA_AGOTAR ? ' (sin más cobertura)' : ''}`);
