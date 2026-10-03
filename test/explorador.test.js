import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearExplorador } from '../servidor/explorador.js';
import { normalizarConfig } from '../public/js/nucleo.js';

const leer = (ruta) => JSON.parse(fs.readFileSync(new URL(`../public/data/${ruta}`, import.meta.url)));
const islas = leer('islas.json');
const municipios = leer('limites-municipales.json');
const nucleos = leer('nucleos.json');

test('sitúa cada punto en su isla y municipio reales, también La Graciosa dentro de Teguise', () => {
  const { situar } = crearExplorador({ islas, municipios, nucleos });
  assert.deepEqual(situar({ lat: 29.2316, lng: -13.5049 }), { isla: 'la-graciosa', municipio: '35024' }); // Caleta de Sebo
  assert.deepEqual(situar({ lat: 29.0844, lng: -13.5653 }), { isla: 'lanzarote', municipio: '35024' }); // Teguise
  assert.equal(situar({ lat: 28.9631, lng: -13.5477 })?.isla, 'lanzarote'); // Arrecife
  assert.equal(situar({ lat: 28.2723, lng: -16.6425 })?.isla, 'tenerife'); // Teide
  assert.equal(situar({ lat: 28.6, lng: -15.0 }), null); // en el mar
});

test('los puntos al azar caen dentro del territorio pedido y se clasifican como el banco', async () => {
  const pedidos = [];
  const buscar = async (lat, lng, radio) => {
    pedidos.push({ lat, lng, radio });
    return { pano: `p${pedidos.length}`, lat, lng, rumbo: 0, lugar: null };
  };
  const exp = crearExplorador({ islas, municipios, nucleos, buscar });

  const soloGomera = normalizarConfig({ islas: ['la-gomera'], zonas: 'mixto' });
  for (let i = 0; i < 40; i++) {
    const u = await exp.descubrir(soloGomera);
    if (u) assert.equal(u.isla, 'la-gomera');
  }

  const urbano = normalizarConfig({ islas: ['gran-canaria'], zonas: 'urbano' });
  let urbanos = 0;
  for (let i = 0; i < 30; i++) {
    const u = await exp.descubrir(urbano);
    if (u?.zona === 'u') urbanos++;
  }
  assert.ok(urbanos >= 25, `junto a pueblos casi siempre debe ser urbano (${urbanos}/30)`);

  const municipio = normalizarConfig({ islas: ['tenerife'], municipios: ['38001'], zonas: 'rural' }, municipios); // Adeje
  for (let i = 0; i < 30; i++) {
    const u = await exp.descubrir(municipio);
    if (u) assert.equal(u.municipio, '38001');
  }
  assert.ok(pedidos.some((p) => p.radio === 1500) && pedidos.some((p) => p.radio === 300));
});
