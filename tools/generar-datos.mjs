// Genera los datos del juego:
//   public/data/islas.json       -> contornos simplificados, bbox y centro de cada isla
//   public/data/ubicaciones.json -> ubicaciones con cobertura oficial de Street View verificada
//
// Uso:  node tools/generar-datos.mjs                   (regenera todo, tarda unos minutos)
//       node tools/generar-datos.mjs --factor 0.5      (la mitad de ubicaciones, más rápido)
//       node tools/generar-datos.mjs --solo-enriquecer (solo limpia calles y nombres de lugar)
//
// Fuentes: contornos y núcleos de población de OpenStreetMap (Nominatim + Overpass),
// cobertura de Street View consultada al servicio público que usa Google Maps.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'public', 'data');
const CACHE = path.join(RAIZ, 'tools', '.cache');
const UA = 'GeoCanarias/1.0 (juego educativo; generador de datos)';

const argFactor = process.argv.indexOf('--factor');
const FACTOR = argFactor > -1 ? Number(process.argv[argFactor + 1]) : 1;

// urbano/rural = cuántas ubicaciones de cada tipo intentamos conseguir por isla
const ISLAS = [
  { id: 'tenerife', nombre: 'Tenerife', osm: ['R2108882'], urbano: 230, rural: 190 },
  { id: 'gran-canaria', nombre: 'Gran Canaria', osm: ['R2214683'], urbano: 230, rural: 190 },
  { id: 'lanzarote', nombre: 'Lanzarote', osm: ['R2214686'], urbano: 150, rural: 150 },
  { id: 'fuerteventura', nombre: 'Fuerteventura', osm: ['R2214682'], urbano: 140, rural: 160 },
  { id: 'la-palma', nombre: 'La Palma', osm: ['R1464825', 'R11775386'], urbano: 130, rural: 130 },
  { id: 'la-gomera', nombre: 'La Gomera', osm: ['R2214684'], urbano: 90, rural: 100 },
  { id: 'el-hierro', nombre: 'El Hierro', osm: ['R2214681'], urbano: 70, rural: 90 },
  { id: 'la-graciosa', nombre: 'La Graciosa', osm: ['R3251775'], urbano: 20, rural: 30 },
];

const BBOX_CANARIAS = [27.5, -18.4, 29.5, -13.2]; // sur, oeste, norte, este
const DIST_MIN_ENTRE_UBICACIONES = 0.25; // km
const DIST_URBANO = 0.6; // km a un núcleo (ciudad/pueblo) para considerarse urbano

// ---------- utilidades ----------
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const redondear = (n, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function puntoEnAnillo(lng, lat, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// poligonos: array de polígonos, cada uno array de anillos (el primero exterior)
function puntoEnPoligonos(lng, lat, poligonos) {
  return poligonos.some((pol) => puntoEnAnillo(lng, lat, pol[0]) && !pol.slice(1).some((h) => puntoEnAnillo(lng, lat, h)));
}

function areaAnillo(anillo) {
  let a = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    a += (anillo[j][0] + anillo[i][0]) * (anillo[j][1] - anillo[i][1]);
  }
  return Math.abs(a / 2);
}

function aPoligonos(geojson) {
  if (geojson.type === 'Polygon') return [geojson.coordinates];
  if (geojson.type === 'MultiPolygon') return geojson.coordinates;
  throw new Error('Geometría no soportada: ' + geojson.type);
}

async function pedir(url, opciones = {}, intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url, { ...opciones, headers: { 'User-Agent': UA, ...(opciones.headers || {}) } });
      if (res.ok) return await res.text();
      if (res.status === 429 || res.status >= 500) {
        await dormir(2000 * (i + 1));
        continue;
      }
      throw new Error(`HTTP ${res.status} en ${url}`);
    } catch (e) {
      if (i === intentos - 1) throw e;
      await dormir(1500 * (i + 1));
    }
  }
  throw new Error('Sin respuesta de ' + url);
}

async function conCache(nombre, fn) {
  const fichero = path.join(CACHE, nombre);
  try {
    return JSON.parse(await fs.readFile(fichero, 'utf8'));
  } catch {
    const datos = await fn();
    await fs.mkdir(CACHE, { recursive: true });
    await fs.writeFile(fichero, JSON.stringify(datos));
    return datos;
  }
}

// ---------- OpenStreetMap ----------
async function obtenerContornos(umbral) {
  return conCache(`contornos-${umbral}.json`, async () => {
    const ids = ISLAS.flatMap((i) => i.osm).join(',');
    const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=${ids}&format=json&polygon_geojson=1&polygon_threshold=${umbral}`;
    const lista = JSON.parse(await pedir(url));
    const resultado = {};
    for (const isla of ISLAS) {
      // si hay varias relaciones candidatas, nos quedamos con la de mayor superficie
      const candidatos = lista.filter((r) => isla.osm.includes(r.osm_type[0].toUpperCase() + r.osm_id));
      let mejor = null;
      let mejorArea = -1;
      for (const c of candidatos) {
        if (!c.geojson || !/Polygon/.test(c.geojson.type)) continue;
        const pols = aPoligonos(c.geojson);
        const area = pols.reduce((s, p) => s + areaAnillo(p[0]), 0);
        if (area > mejorArea) {
          mejor = pols;
          mejorArea = area;
        }
      }
      if (!mejor) throw new Error('No hay polígono para ' + isla.nombre);
      resultado[isla.id] = mejor;
    }
    return resultado;
  });
}

async function obtenerNucleos() {
  return conCache('nucleos.json', async () => {
    const [s, o, n, e] = BBOX_CANARIAS;
    const consulta = `[out:json][timeout:90];node["place"~"^(city|town|village|hamlet|suburb|neighbourhood)$"](${s},${o},${n},${e});out;`;
    const servidores = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    let ultimoError;
    for (const srv of servidores) {
      try {
        const texto = await pedir(srv, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(consulta),
        });
        const j = JSON.parse(texto);
        return j.elements
          .filter((el) => el.tags && el.tags.name)
          .map((el) => ({ nombre: el.tags.name, tipo: el.tags.place, lat: el.lat, lng: el.lon }));
      } catch (err) {
        ultimoError = err;
      }
    }
    throw ultimoError;
  });
}

// ---------- Street View ----------
function urlBusqueda(lat, lng, radio) {
  return (
    'https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch?pb=' +
    `!1m5!1sapiv3!5sUS!11m2!1m1!1b0!2m4!1m2!3d${lat}!4d${lng}!2d${radio}` +
    '!3m10!2m2!1ses!2sES!9m1!1e2!11m4!1m3!1e2!2b1!3e2!4m6!1e1!1e2!1e3!1e4!1e8!1e6&callback=_cb'
  );
}

async function buscarPanorama(lat, lng, radio) {
  const texto = await pedir(urlBusqueda(lat, lng, radio));
  const j = JSON.parse(texto.slice(texto.indexOf('(') + 1, texto.lastIndexOf(')')));
  const r = j[1];
  if (!r || !r[1] || r[1][0] !== 2) return null; // 2 = cobertura oficial de Google
  const pos = r[5]?.[0]?.[1];
  if (!pos || pos[4] !== 'ES') return null;
  const direccion = r[3]?.[2] || [];
  const fecha = r[6]?.[7];
  return {
    pano: r[1][1],
    lat: pos[0][2],
    lng: pos[0][3],
    rumbo: pos[2]?.[0] ?? 0,
    calle: direccion.length > 1 ? direccion[0][0] : null,
    localidad: (direccion.length > 1 ? direccion[1][0] : direccion[0]?.[0])?.split(',')[0] ?? null,
    fecha: Array.isArray(fecha) ? `${fecha[0]}-${String(fecha[1]).padStart(2, '0')}` : null,
  };
}

// ---------- muestreo ----------
function bboxDe(poligonos) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const pol of poligonos) {
    for (const [lng, lat] of pol[0]) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

function puntoAleatorio(poligonos, bbox) {
  for (let i = 0; i < 5000; i++) {
    const lng = bbox[0] + Math.random() * (bbox[2] - bbox[0]);
    const lat = bbox[1] + Math.random() * (bbox[3] - bbox[1]);
    if (puntoEnPoligonos(lng, lat, poligonos)) return { lat, lng };
  }
  throw new Error('No se pudo muestrear un punto');
}

function desplazar(lat, lng, maxKm) {
  const d = Math.sqrt(Math.random()) * maxKm;
  const ang = Math.random() * 2 * Math.PI;
  return {
    lat: lat + (d / 111.32) * Math.cos(ang),
    lng: lng + (d / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(ang),
  };
}

function elegirPonderado(lista, peso) {
  const total = lista.reduce((s, x) => s + peso(x), 0);
  let r = Math.random() * total;
  for (const x of lista) {
    r -= peso(x);
    if (r <= 0) return x;
  }
  return lista[lista.length - 1];
}

const PESO_NUCLEO = { city: 6, town: 3, village: 1.5, suburb: 1, neighbourhood: 0.6, hamlet: 0.5 };

async function generarIsla(isla, poligonos, nucleosIsla, prefijo) {
  const bbox = bboxDe(poligonos);
  const objetivo = { u: Math.round(isla.urbano * FACTOR), r: Math.round(isla.rural * FACTOR) };
  const encontradas = [];
  const cuenta = { u: 0, r: 0 };
  const pueblos = nucleosIsla.filter((n) => ['city', 'town', 'village'].includes(n.tipo));
  const maxIntentos = (objetivo.u + objetivo.r) * 8;
  let intentos = 0;
  let fallosSeguidosUrbano = 0;

  while ((cuenta.u < objetivo.u || cuenta.r < objetivo.r) && intentos < maxIntentos) {
    intentos++;
    const buscaUrbano = cuenta.u < objetivo.u && (cuenta.r >= objetivo.r || Math.random() < 0.5) && fallosSeguidosUrbano < 60;
    let punto, radio;
    if (buscaUrbano && nucleosIsla.length) {
      const n = elegirPonderado(nucleosIsla, (x) => PESO_NUCLEO[x.tipo] || 0.5);
      punto = desplazar(n.lat, n.lng, 0.45);
      radio = 200;
    } else {
      punto = puntoAleatorio(poligonos, bbox);
      radio = 1500;
    }

    let pano;
    try {
      pano = await buscarPanorama(redondear(punto.lat), redondear(punto.lng), radio);
    } catch (e) {
      console.warn(`  [${isla.nombre}] error de red: ${e.message}`);
      await dormir(3000);
      continue;
    }
    if (!pano || !puntoEnPoligonos(pano.lng, pano.lat, poligonos)) {
      if (buscaUrbano) fallosSeguidosUrbano++;
      continue;
    }
    if (encontradas.some((u) => u.pano === pano.pano || distanciaKm(u.lat, u.lng, pano.lat, pano.lng) < DIST_MIN_ENTRE_UBICACIONES)) {
      if (buscaUrbano) fallosSeguidosUrbano++;
      continue;
    }
    const cercaDePueblo = pueblos.some((p) => distanciaKm(p.lat, p.lng, pano.lat, pano.lng) < DIST_URBANO);
    const zona = cercaDePueblo ? 'u' : 'r';
    if (cuenta[zona] >= objetivo[zona]) continue;
    if (buscaUrbano) fallosSeguidosUrbano = 0;

    cuenta[zona]++;
    encontradas.push({
      isla: isla.id,
      zona,
      lat: redondear(pano.lat),
      lng: redondear(pano.lng),
      pano: pano.pano,
      rumbo: Math.round(pano.rumbo),
      lugar: pano.localidad,
      calle: pano.calle,
      fecha: pano.fecha,
    });
    if ((cuenta.u + cuenta.r) % 25 === 0) {
      console.log(`  [${isla.nombre}] ${cuenta.u} urbanas, ${cuenta.r} rurales (${intentos} intentos)`);
    }
  }
  encontradas.forEach((u, i) => (u.id = `${prefijo}${String(i + 1).padStart(3, '0')}`));
  console.log(`✔ ${isla.nombre}: ${cuenta.u} urbanas + ${cuenta.r} rurales en ${intentos} intentos`);
  return encontradas;
}

// ---------- enriquecimiento ----------
// Limpia la calle (sin número de portal), descarta localidades genéricas y añade el núcleo más cercano
const LOCALIDADES_GENERICAS = new Set(['Canarias', 'Canary Islands', 'Islas Canarias', 'España', 'Spain']);
const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nombresParecidos = (a, b) => !!a && !!b && (normalizar(a).includes(normalizar(b)) || normalizar(b).includes(normalizar(a)));

function enriquecer(ubicaciones, nucleos) {
  const candidatos = nucleos.filter((n) => ['city', 'town', 'village', 'hamlet', 'suburb'].includes(n.tipo));
  for (const u of ubicaciones) {
    if (u.calle) u.calle = u.calle.replace(/^\d+[A-Za-z]?,?\s+/, '').trim() || null;
    if (u.lugar && LOCALIDADES_GENERICAS.has(u.lugar)) u.lugar = null;
    let mejor = null;
    let dMejor = 2.5; // km
    for (const n of candidatos) {
      const d = distanciaKm(u.lat, u.lng, n.lat, n.lng);
      if (d < dMejor) {
        dMejor = d;
        mejor = n;
      }
    }
    u.cerca = mejor && !nombresParecidos(mejor.nombre, u.lugar) ? mejor.nombre : null;
    if (!u.lugar && u.cerca) {
      u.lugar = u.cerca;
      u.cerca = null;
    }
  }
  return ubicaciones;
}

// ---------- principal ----------
const PREFIJOS = {
  tenerife: 'tf', 'gran-canaria': 'gc', lanzarote: 'lz', fuerteventura: 'fv',
  'la-palma': 'lp', 'la-gomera': 'go', 'el-hierro': 'eh', 'la-graciosa': 'lg',
};

function simplificarContorno(poligonos, bbox) {
  // Solo anillos exteriores con superficie apreciable, coordenadas con 4 decimales (~10 m)
  const areaTotal = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
  return poligonos
    .map((p) => p[0])
    .filter((anillo) => areaAnillo(anillo) > areaTotal * 0.0005)
    .map((anillo) => anillo.map(([lng, lat]) => [redondear(lng, 4), redondear(lat, 4)]));
}

async function main() {
  await fs.mkdir(SALIDA, { recursive: true });
  console.log('Descargando contornos de las islas…');
  const finos = await obtenerContornos(0.0008);
  await dormir(1200);
  const gruesos = await obtenerContornos(0.004);
  console.log('Descargando núcleos de población…');
  const nucleos = await obtenerNucleos();
  console.log(`  ${nucleos.length} núcleos`);

  // asignar cada núcleo a su isla
  const nucleosPorIsla = Object.fromEntries(ISLAS.map((i) => [i.id, []]));
  for (const n of nucleos) {
    const isla = ISLAS.find((i) => puntoEnPoligonos(n.lng, n.lat, finos[i.id]));
    if (isla) nucleosPorIsla[isla.id].push(n);
  }

  const islasJson = ISLAS.map((isla) => {
    const bbox = bboxDe(finos[isla.id]);
    return {
      id: isla.id,
      nombre: isla.nombre,
      bbox: bbox.map((v) => redondear(v, 4)),
      centro: [redondear((bbox[1] + bbox[3]) / 2, 4), redondear((bbox[0] + bbox[2]) / 2, 4)],
      contorno: simplificarContorno(gruesos[isla.id], bbox),
    };
  });
  await fs.writeFile(path.join(SALIDA, 'islas.json'), JSON.stringify(islasJson));
  console.log('✔ islas.json escrito');

  console.log('Buscando panoramas de Street View…');
  const porIsla = await Promise.all(
    ISLAS.map((isla) => generarIsla(isla, finos[isla.id], nucleosPorIsla[isla.id], PREFIJOS[isla.id])),
  );
  const ubicaciones = enriquecer(porIsla.flat(), nucleos);
  await fs.writeFile(
    path.join(SALIDA, 'ubicaciones.json'),
    JSON.stringify({ generado: new Date().toISOString().slice(0, 10), total: ubicaciones.length, ubicaciones }),
  );
  console.log(`✔ ubicaciones.json escrito con ${ubicaciones.length} ubicaciones`);
}

// Solo reaplica la limpieza a un ubicaciones.json existente, sin consultar Street View
async function soloEnriquecer() {
  const fichero = path.join(SALIDA, 'ubicaciones.json');
  const datos = JSON.parse(await fs.readFile(fichero, 'utf8'));
  const nucleos = await obtenerNucleos();
  enriquecer(datos.ubicaciones, nucleos);
  await fs.writeFile(fichero, JSON.stringify(datos));
  console.log(`✔ ${datos.ubicaciones.length} ubicaciones enriquecidas`);
}

(process.argv.includes('--solo-enriquecer') ? soloEnriquecer() : main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
