// Descubre panoramas de Street View completamente al azar dentro del territorio elegido.
// Lo usan el catálogo del servidor (partidas aleatorias) y la herramienta que amplía el banco.

import { buscarPanorama } from './panoramas.js';
import { puntoEnPoligonos } from '../public/js/geografia.js';
import { distanciaKm } from '../public/js/nucleo.js';

const PESO_PUEBLO = { city: 6, town: 3, village: 1.5 };
const RADIO_URBANO_KM = 0.6; // igual que el banco: a menos de 600 m de un pueblo es "urbano"
const RADIO_BUSQUEDA = { urbano: 300, mixto: 900, rural: 1500 }; // metros alrededor del punto
const PROPORCION_PUEBLOS_EN_MEZCLA = 0.4;

const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const parecidos = (a, b) => !!a && !!b && (normalizar(a).includes(normalizar(b)) || normalizar(b).includes(normalizar(a)));
const dentroBbox = (b, p) => p.lng >= b[0] && p.lng <= b[2] && p.lat >= b[1] && p.lat <= b[3];

function areaAprox(poligonos) {
  let total = 0;
  for (const p of poligonos) {
    const anillo = p[0];
    const k = Math.cos(((anillo[0]?.[1] ?? 28) * Math.PI) / 180);
    let a = 0;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) a += (anillo[j][0] + anillo[i][0]) * (anillo[j][1] - anillo[i][1]);
    total += Math.abs(a / 2) * k;
  }
  return total;
}

function elegirPonderado(lista, peso, rng) {
  const total = lista.reduce((s, x) => s + peso(x), 0);
  let r = rng() * total;
  for (const x of lista) if ((r -= peso(x)) <= 0) return x;
  return lista[lista.length - 1];
}

export function crearExplorador({ islas, municipios, nucleos = [], buscar = buscarPanorama, rng = Math.random }) {
  const islaPorId = new Map(islas.map((i) => [i.id, i]));
  const areas = new Map(municipios.map((m) => [m.id, areaAprox(m.poligonos)]));

  // Isla y municipio reales de un punto, con los límites municipales (más finos que los contornos de islas.json).
  // Teguise incluye La Graciosa: en ese caso decide la caja y el contorno de cada isla.
  function situar(p) {
    for (const m of municipios) {
      if (!dentroBbox(m.bbox, p) || !puntoEnPoligonos(p.lng, p.lat, m.poligonos)) continue;
      if (m.islas.length === 1) return { isla: m.islas[0], municipio: m.id };
      const candidatas = m.islas.map((id) => islaPorId.get(id)).filter((i) => i && dentroBbox(i.bbox, p));
      const exacta = candidatas.find((i) => i.contorno.some((a) => puntoEnPoligonos(p.lng, p.lat, [[a]])));
      const isla = exacta || candidatas[0] || islaPorId.get(m.islas[0]);
      return isla ? { isla: isla.id, municipio: m.id } : null;
    }
    return null;
  }

  const pueblos = nucleos
    .filter((n) => PESO_PUEBLO[n.tipo])
    .map((n) => ({ ...n, ...situar(n) }))
    .filter((n) => n.isla);

  // Zonas donde se puede buscar: un municipio concreto dentro de una isla concreta
  function zonasBusqueda(config) {
    const zonas = [];
    for (const isla of config.islas) {
      const info = islaPorId.get(isla);
      if (!info) continue;
      for (const m of municipios) {
        if (!m.islas.includes(isla) || (config.municipios?.length && !config.municipios.includes(m.id))) continue;
        const bbox = [Math.max(m.bbox[0], info.bbox[0]), Math.max(m.bbox[1], info.bbox[1]), Math.min(m.bbox[2], info.bbox[2]), Math.min(m.bbox[3], info.bbox[3])];
        if (bbox[0] < bbox[2] && bbox[1] < bbox[3]) zonas.push({ isla, municipio: m, bbox });
      }
    }
    return zonas;
  }

  function puntoUniforme(zona) {
    for (let n = 0; n < 200; n++) {
      const p = { lng: zona.bbox[0] + rng() * (zona.bbox[2] - zona.bbox[0]), lat: zona.bbox[1] + rng() * (zona.bbox[3] - zona.bbox[1]) };
      if (puntoEnPoligonos(p.lng, p.lat, zona.municipio.poligonos)) return p;
    }
    return null;
  }

  function cercaDePueblo(pueblo) {
    const d = Math.sqrt(rng()) * (RADIO_URBANO_KM * 0.8);
    const ang = rng() * 2 * Math.PI;
    return {
      lat: pueblo.lat + (d / 111.32) * Math.cos(ang),
      lng: pueblo.lng + (d / (111.32 * Math.cos((pueblo.lat * Math.PI) / 180))) * Math.sin(ang),
    };
  }

  // Punto al azar: la isla se sortea a partes iguales (o por superficie si el reparto es "azar"),
  // y dentro de ella el punto es uniforme por todo el territorio o junto a un pueblo.
  function puntoAleatorio(config) {
    const zonas = zonasBusqueda(config);
    if (!zonas.length) return null;
    const islasConZona = [...new Set(zonas.map((z) => z.isla))];
    const isla = config.reparto === 'azar'
      ? elegirPonderado(zonas, (z) => areas.get(z.municipio.id) || 0, rng).isla
      : islasConZona[Math.floor(rng() * islasConZona.length)];
    const deIsla = zonas.filter((z) => z.isla === isla);
    const pueblosZona = pueblos.filter((p) => p.isla === isla && deIsla.some((z) => z.municipio.id === p.municipio));
    const tipo = config.zonas === 'urbano' || (config.zonas === 'mixto' && rng() < PROPORCION_PUEBLOS_EN_MEZCLA) ? 'pueblo' : 'campo';
    if (tipo === 'pueblo' && pueblosZona.length) {
      return { ...cercaDePueblo(elegirPonderado(pueblosZona, (p) => PESO_PUEBLO[p.tipo], rng)), radio: RADIO_BUSQUEDA.urbano };
    }
    const zona = elegirPonderado(deIsla, (z) => areas.get(z.municipio.id) || 1, rng);
    const p = puntoUniforme(zona);
    return p && { ...p, radio: RADIO_BUSQUEDA[config.zonas] || RADIO_BUSQUEDA.mixto };
  }

  // Completa un panorama encontrado con isla, municipio, tipo de zona y el pueblo más cercano
  function enriquecer(u) {
    const sitio = situar(u);
    if (!sitio) return null;
    let cerca = null;
    let dCerca = 2.5;
    let urbano = false;
    for (const p of pueblos) {
      const d = distanciaKm(p, u);
      if (d < RADIO_URBANO_KM) urbano = true;
      if (d < dCerca) {
        dCerca = d;
        cerca = p;
      }
    }
    return {
      ...u,
      id: `sv-${u.pano}`,
      isla: sitio.isla,
      municipio: sitio.municipio,
      zona: urbano ? 'u' : 'r',
      cerca: cerca && !parecidos(cerca.nombre, u.lugar) ? cerca.nombre : null,
    };
  }

  // Un intento: devuelve una ubicación válida dentro de las islas pedidas, o null
  async function descubrir(config, { signal } = {}) {
    const p = puntoAleatorio(config);
    if (!p) return null;
    const encontrado = await buscar(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)), p.radio, { signal });
    if (!encontrado) return null;
    const u = enriquecer(encontrado);
    return u && config.islas.includes(u.isla) ? u : null;
  }

  return { descubrir, situar, enriquecer, zonasBusqueda };
}
