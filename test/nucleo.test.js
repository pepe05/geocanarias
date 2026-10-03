import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizarConfig, elegirUbicaciones, clavesUbicacion, configClasificable, filtrarUbicaciones, limitesPartida, escalaPartida, diagonalKm } from '../public/js/nucleo.js';
import { municipioDe } from '../public/js/geografia.js';

const { ubicaciones } = JSON.parse(fs.readFileSync(new URL('../public/data/ubicaciones.json', import.meta.url)));
const municipios = JSON.parse(fs.readFileSync(new URL('../public/data/limites-municipales.json', import.meta.url)));
const islas = JSON.parse(fs.readFileSync(new URL('../public/data/islas.json', import.meta.url)));
const config = (c = {}) => normalizarConfig({ ...normalizarConfig(), ...c }, municipios);

test('todos los lugares tienen un municipio real y La Graciosa pertenece a Teguise', () => {
  assert.equal(municipios.length, 88);
  for (const u of ubicaciones) assert.ok(municipios.some((m) => m.id === u.municipio && m.islas.includes(u.isla)), u.id);
  assert.ok(ubicaciones.filter((u) => u.isla === 'la-graciosa').every((u) => u.municipio === '35024'));
  const santaCruz = municipioDe({ lat: 28.4698, lng: -16.2549, isla: 'tenerife' }, municipios);
  assert.equal(santaCruz.id, '38038');
});

test('recorre todo el banco sin repetir ni reutilizar lugares al agotarse', () => {
  const vistas = new Set();
  let total = 0;
  // tantas partidas de 30 como hagan falta para agotar el banco, sea del tamaño que sea
  for (let i = 0; i < Math.ceil(ubicaciones.length / 30) + 5; i++) {
    const partida = elegirUbicaciones(ubicaciones, config({ rondas: 30 }), { excluir: vistas });
    for (const u of partida) {
      assert.ok(!clavesUbicacion(u).some((k) => vistas.has(k)));
      clavesUbicacion(u).forEach((k) => vistas.add(k)); total++;
    }
    if (!partida.length) break;
  }
  assert.equal(total, ubicaciones.length);
  assert.deepEqual(elegirUbicaciones(ubicaciones, config(), { excluir: vistas }), []);
});

test('los filtros municipal y rural nunca se relajan', () => {
  // Un municipio con menos lugares rurales que rondas: se dan los que hay, nunca otros de fuera
  const municipio = municipios.find((m) => {
    const n = ubicaciones.filter((u) => u.municipio === m.id && u.zona === 'r').length;
    return n > 0 && n < 30;
  });
  assert.ok(municipio, 'hace falta un municipio con pocos lugares rurales');
  const c = config({ islas: municipio.islas, municipios: [municipio.id], zonas: 'rural', rondas: 30 });
  const elegidas = elegirUbicaciones(ubicaciones, c);
  assert.ok(elegidas.length > 0 && elegidas.length < 30);
  assert.ok(elegidas.every((u) => u.municipio === municipio.id && u.zona === 'r'));
  assert.equal(elegidas.length, filtrarUbicaciones(ubicaciones, c).length);
});

test('no confunde un ID regenerado, un panorama duplicado ni la misma posición', () => {
  const u = ubicaciones[0];
  const clones = [u, { ...u, id: 'nuevo' }, { ...u, id: 'otro', pano: 'otro-pano' }];
  assert.equal(elegirUbicaciones(clones, config()).length, 1);
  assert.equal(elegirUbicaciones(clones, config(), { excluir: new Set([`p:${u.pano}`]) }).length, 0);
  assert.equal(elegirUbicaciones(clones, config(), { excluir: new Set(clavesUbicacion(u)) }).length, 0);
});

test('rellena las rondas desde otras islas cuando una se agota', () => {
  const banco = [ubicaciones.find((u) => u.isla === 'el-hierro'), ...ubicaciones.filter((u) => u.isla === 'tenerife').slice(0, 40)];
  assert.equal(elegirUbicaciones(banco, config({ rondas: 30 })).length, 30);
});

test('equilibra entre las islas disponibles y el azar admite cualquier distribución', () => {
  const c = config({ rondas: 10, islas: ['tenerife', 'gran-canaria'] });
  const equilibradas = elegirUbicaciones(ubicaciones, c);
  assert.equal(equilibradas.filter((u) => u.isla === 'tenerife').length, 5);
  assert.equal(elegirUbicaciones(ubicaciones, { ...c, reparto: 'azar' }).length, 10);
});

test('normaliza opciones nuevas y elimina municipios de otras islas', () => {
  const c = config({ islas: ['tenerife'], municipios: ['38038', '38038', '35024', 'falso'], rondas: 30, tiempo: 15, segundosCuentaAtras: 60 });
  assert.deepEqual(c.municipios, ['38038']);
  assert.equal(c.rondas, 30); assert.equal(c.tiempo, 15); assert.equal(c.segundosCuentaAtras, 60);
  assert.equal(configClasificable(config()), true);
  assert.equal(configClasificable(config({ municipios: ['38038'] })), false);
  assert.equal(configClasificable(config({ pistaMunicipio: true })), false);
  assert.equal(configClasificable(config({ orientacion: 'aleatoria' })), false);
});

test('el mapa y la puntuación se ajustan al municipio y La Graciosa se encuadra por separado', () => {
  const c = config({ municipios: ['38038'] });
  const b = limitesPartida(c, islas, municipios);
  assert.ok(b[0] > -17 && b[2] < -16);
  assert.ok(escalaPartida(c, islas, municipios) < diagonalKm(c.islas, islas));
  const graciosa = config({ islas: ['la-graciosa'], municipios: ['35024'] });
  const caja = limitesPartida(graciosa, islas, municipios);
  const isla = islas.find((i) => i.id === 'la-graciosa');
  assert.ok(caja[1] >= isla.bbox[1]);
  assert.equal(escalaPartida(config(), islas, municipios), diagonalKm(config().islas, islas));
});
