import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearCatalogo } from '../servidor/ubicaciones.js';
import { normalizarConfig } from '../public/js/nucleo.js';

const anillo = [[-17,28],[-16,28],[-16,29],[-17,29],[-17,28]];
const islas = [{ id: 'tenerife', bbox: [-17,28,-16,29], contorno: [anillo] }];
const municipios = [{ id: '38038', islas: ['tenerife'], bbox: [-17,28,-16,29], poligonos: [[anillo]] }];
const banco = () => Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, pano: `pano${i}`, lat: 28.1 + i / 100, lng: -16.5,
  isla: 'tenerife', municipio: '38038', zona: 'r', rumbo: 45 }));
const config = (c = {}) => normalizarConfig({ islas: ['tenerife'], rondas: 3, fuente: 'banco', ...c });
function entorno(t, extras = {}) {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'geocanarias-test-'));
  t.after(() => {
    assert.ok(path.resolve(directorio).startsWith(path.resolve(os.tmpdir()) + path.sep + 'geocanarias-test-'));
    fs.rmSync(directorio, { recursive: true, force: true });
  });
  const opciones = { directorio, islas, municipios, ubicaciones: banco(), ...extras };
  const catalogo = crearCatalogo(opciones);
  t.after(() => catalogo.detener());
  return { catalogo, opciones };
}

// Street View simulado: cada llamada devuelve un panorama distinto cerca del punto pedido
function streetViewFalso() {
  let n = 0;
  const buscar = async (lat, lng) => {
    buscar.llamadas++;
    return { pano: `azar${n++}`, lat, lng, rumbo: 90 };
  };
  buscar.llamadas = 0;
  return buscar;
}

test('historial duradero entre reinicios, salas y todos los jugadores de una sala', async (t) => {
  const { catalogo, opciones } = entorno(t);
  const a = await catalogo.preparar(config(), { tokens: ['ana'] });
  const b = await catalogo.preparar(config(), { tokens: ['ana', 'bea'] });
  const reiniciado = crearCatalogo({ ...opciones, ubicaciones: banco() });
  const c = await reiniciado.preparar(config(), { tokens: ['ana'] });
  assert.equal(new Set([...a.ubicaciones, ...b.ubicaciones, ...c.ubicaciones].map((u) => u.pano)).size, 9);
  const d = await reiniciado.preparar(config(), { tokens: ['bea'] });
  assert.ok(d.ubicaciones.every((u) => !b.ubicaciones.some((x) => x.pano === u.pano)));
});

test('rechaza una partida imposible, sin empezar parcialmente ni repetir', async (t) => {
  const { catalogo } = entorno(t);
  await catalogo.preparar(config({ rondas: 10 }), { tokens: ['ana'] });
  await assert.rejects(catalogo.preparar(config(), { tokens: ['ana'] }), /Quedan 2/);
});

test('descubre, verifica y conserva panoramas nuevos', async (t) => {
  let n = 0;
  const { catalogo, opciones } = entorno(t, { ubicaciones: [], buscar: async () => ({ pano: `nuevo${n}`, lat: 28.5 + n++ / 1000, lng: -16.5, rumbo: 20 }) });
  const r = await catalogo.preparar(config({ fuente: 'aleatoria', municipios: ['38038'] }), { tokens: ['ana'] });
  assert.equal(r.ubicaciones.length, 3);
  assert.equal(r.nuevas, 3);
  assert.ok(r.ubicaciones.every((u) => u.municipio === '38038'));
  assert.ok(JSON.parse(fs.readFileSync(path.join(opciones.directorio, 'ubicaciones-extra.json'))).length >= 3);
});

test('una caída de Street View permite usar el banco pero nunca repetirlo', async (t) => {
  const { catalogo } = entorno(t, { buscar: async () => { throw new Error('sin red'); } });
  const r = await catalogo.preparar(config({ fuente: 'aleatoria' }), { tokens: ['ana'] });
  assert.match(r.aviso, /banco/);
  await assert.rejects(catalogo.preparar(config({ fuente: 'aleatoria', rondas: 10 }), { tokens: ['ana'] }), /Quedan 9/);
});

test('rechaza panoramas ajenos al área y municipios incompatibles', async (t) => {
  const { catalogo } = entorno(t, { ubicaciones: [], maxIntentos: 6, buscar: async () => ({ pano: 'fuera', lat: 40, lng: -3 }) });
  await assert.rejects(catalogo.preparar(config({ fuente: 'aleatoria' })), /Quedan 0/);
  await assert.rejects(catalogo.preparar(config({ municipios: ['35024'] })), /municipios/);
});

test('dos solicitudes simultáneas del mismo jugador no reservan la misma partida', async (t) => {
  const { catalogo } = entorno(t, { buscar: async () => { await new Promise((r) => setTimeout(r, 5)); return null; }, maxIntentos: 3 });
  const primera = catalogo.preparar(config({ fuente: 'aleatoria' }), { tokens: ['ana'] });
  await assert.rejects(catalogo.preparar(config(), { tokens: ['ana'] }), /Ya se/);
  await primera;
});

test('las configuraciones antiguas pasan a ubicaciones aleatorias, que es lo predeterminado', () => {
  assert.equal(normalizarConfig({}).fuente, 'aleatoria');
  assert.equal(normalizarConfig({ fuente: 'auto' }).fuente, 'aleatoria');
  assert.equal(normalizarConfig({ fuente: 'explorar' }).fuente, 'aleatoria');
  assert.equal(normalizarConfig({ fuente: 'banco' }).fuente, 'banco');
});

test('la reserva en segundo plano permite empezar al instante con lugares nuevos', async (t) => {
  const buscar = streetViewFalso();
  const { catalogo } = entorno(t, { buscar, segundoPlano: true, reservaPorGrupo: 4, pausaRellenoMs: 0 });
  await catalogo.rellenar();
  assert.ok(catalogo.resumen().reserva >= 4);
  const antes = buscar.llamadas;
  const r = await catalogo.preparar(config({ fuente: 'aleatoria' }), { tokens: ['ana'] });
  assert.equal(buscar.llamadas, antes, 'no hace falta buscar en directo');
  assert.equal(r.nuevas, 3);
  assert.ok(r.ubicaciones.every((u) => u.id.startsWith('sv-') && u.isla === 'tenerife' && u.municipio === '38038'));
  // lo servido sale de la reserva y no se vuelve a dar
  const otra = await catalogo.preparar(config({ fuente: 'aleatoria' }), { tokens: ['bea'] });
  assert.ok(otra.ubicaciones.every((u) => !r.ubicaciones.some((x) => x.pano === u.pano)));
});

test('el relleno abandona un tipo de zona sin cobertura en vez de buscar para siempre', async (t) => {
  // Sin pueblos, todo lo descubierto es rural: el grupo urbano nunca se llena
  const { catalogo } = entorno(t, { buscar: streetViewFalso(), segundoPlano: true, reservaPorGrupo: 2, pausaRellenoMs: 0 });
  await catalogo.rellenar();
  const resumen = catalogo.resumen();
  assert.equal(resumen.buscando, false);
  assert.ok(resumen.reserva >= 2);
});

test('si Street View falla seguido, el relleno se pausa y lo indica', async (t) => {
  const { catalogo } = entorno(t, { buscar: async () => { throw new Error('bloqueado'); }, segundoPlano: true, pausaRellenoMs: 0 });
  const original = global.setTimeout;
  global.setTimeout = (fn, _ms, ...a) => original(fn, 0, ...a); // sin esperas reales entre reintentos
  try { await catalogo.rellenar(); } finally { global.setTimeout = original; }
  const resumen = catalogo.resumen();
  assert.equal(resumen.ultimoError, 'bloqueado');
  assert.ok(resumen.pausadoHasta);
});

test('si en la zona no hay ningún lugar del tipo pedido lo dice claramente', async (t) => {
  // El banco de prueba solo tiene lugares rurales: pedir pueblos no es posible
  const { catalogo } = entorno(t, { buscar: async () => null, maxIntentos: 4 });
  await assert.rejects(catalogo.preparar(config({ zonas: 'urbano' }), { tokens: ['ana'] }), /No hay pueblos ni ciudades con Street View/);
});
