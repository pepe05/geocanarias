import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as cliente } from 'socket.io-client';
import { crearGestorSalas, limpiarMensaje } from '../servidor/salas.js';
import { normalizarConfig } from '../public/js/nucleo.js';

function evento(socket, nombre, filtro = () => true, ms = 22000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { socket.off(nombre, recibir); reject(new Error(`Sin evento ${nombre}`)); }, ms);
    function recibir(v) { if (filtro(v)) { clearTimeout(t); socket.off(nombre, recibir); resolve(v); } }
    socket.on(nombre, recibir);
  });
}
const emitirAck = (s, nombre, datos) => new Promise((r) => s.emit(nombre, datos, r));

test('el servidor guarda el último marcador al agotarse el tiempo, incluso desconectado; no acepta marcadores de otra ronda', { timeout: 30000 }, async (t) => {
  const http = createServer();
  const io = new Server(http);
  const islas = [{ id: 'tenerife', bbox: [-17,28,-16,29] }];
  const ubicaciones = Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, pano: `p${i}`, isla: 'tenerife', zona: 'r', lat: 28.4 + i / 100, lng: -16.5, rumbo: 10 }));
  crearGestorSalas(io, { islas, ubicaciones });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${http.address().port}`;
  const a = cliente(url), b = cliente(url), c = cliente(url);
  t.after(async () => { a.disconnect(); b.disconnect(); c.disconnect(); await io.close(); http.close(); });
  await Promise.all([a,b,c].map((s) => evento(s, 'connect')));
  const config = normalizarConfig({ islas: ['tenerife'], rondas: 3, tiempo: 15, cuentaAtras: false });
  const creada = await emitirAck(a, 'crear', { token: 'ana', nombre: 'Ana', config });
  const invitado = await emitirAck(b, 'unirse', { codigo: creada.codigo, token: 'bea', nombre: 'Bea' });
  const sinMarca = await emitirAck(c, 'unirse', { codigo: creada.codigo, token: 'cora', nombre: 'Cora' });
  const inicio = evento(a, 'estado', (s) => s.estado === 'ronda');
  a.emit('empezar');
  const s = await inicio;
  assert.equal(s.ubicacion.lat, undefined);
  assert.equal(s.miMarcador, undefined);
  const fin = evento(a, 'estado', (s) => s.estado === 'resultado');
  let guardado = evento(b, 'marcadorGuardado');
  b.emit('marcador', { rondaId: s.rondaId, lat: 28.41, lng: -16.51 });
  await guardado;
  guardado = evento(b, 'marcadorGuardado');
  b.emit('marcador', { rondaId: s.rondaId, lat: 28.42, lng: -16.52 });
  await guardado;
  const reconexion = await emitirAck(b, 'unirse', { codigo: creada.codigo, token: 'bea' });
  assert.deepEqual(reconexion.estado.miMarcador, { lat: 28.42, lng: -16.52 });
  b.disconnect();
  const resultado = await fin;
  const intento = resultado.resultados[0].intentos.find((x) => x.id === invitado.id);
  assert.equal(intento.lat, 28.42); assert.equal(intento.lng, -16.52);
  assert.equal(intento.automatico, true); assert.ok(intento.puntos > 0);
  assert.equal(resultado.jugadores.find((j) => j.id === invitado.id).puntos, intento.puntos);
  assert.equal(resultado.resultados[0].intentos.find((x) => x.id === sinMarca.id).puntos, 0);

  const siguiente = evento(a, 'estado', (x) => x.estado === 'ronda' && x.ronda === 2);
  a.emit('siguiente');
  const s2 = await siguiente;
  a.emit('marcador', { rondaId: s.rondaId, lat: 28.8, lng: -16.8 });
  a.emit('adivinar', { rondaId: s.rondaId, lat: 28.8, lng: -16.8 });
  guardado = evento(a, 'marcadorGuardado');
  a.emit('marcador', { rondaId: s2.rondaId, lat: 28.43, lng: -16.53 });
  await guardado;
  const fin2 = evento(a, 'estado', (x) => x.estado === 'resultado' && x.ronda === 2);
  a.emit('forzarFin');
  const r2 = await fin2;
  const it2 = r2.resultados[1].intentos.find((x) => x.id === creada.id);
  assert.equal(it2.lat, 28.43);
  assert.equal(r2.resultados[1].intentos.find((x) => x.id === invitado.id).lat, null);
});

test('el chat llega a toda la sala, guarda historial para quien entra y frena el spam', { timeout: 15000 }, async (t) => {
  const http = createServer();
  const io = new Server(http);
  const islas = [{ id: 'tenerife', bbox: [-17,28,-16,29] }];
  crearGestorSalas(io, { islas, ubicaciones: [] });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${http.address().port}`;
  const a = cliente(url), b = cliente(url), c = cliente(url);
  t.after(async () => { a.disconnect(); b.disconnect(); c.disconnect(); await io.close(); http.close(); });
  await Promise.all([a, b, c].map((s) => evento(s, 'connect')));
  const sala = await emitirAck(a, 'crear', { token: 'ana', nombre: 'Ana' });
  await emitirAck(b, 'unirse', { codigo: sala.codigo, token: 'bea', nombre: 'Bea' });

  const recibido = evento(b, 'chat');
  a.emit('chat', '  hola\n<b>equipo</b>\u0007  ');
  const m = await recibido;
  assert.equal(m.texto, 'hola <b>equipo</b>'); // sin saltos ni caracteres de control; el HTML se escapa al pintarlo
  assert.equal(m.nombre, 'Ana');
  assert.equal(m.jugador, sala.id);

  // quien entra después recibe el historial
  const tarde = await emitirAck(c, 'unirse', { codigo: sala.codigo, token: 'cora', nombre: 'Cora' });
  assert.deepEqual(tarde.chat.map((x) => x.texto), ['hola <b>equipo</b>']);

  // ráfaga: el servidor corta y avisa
  const aviso = evento(a, 'chatAviso');
  for (let i = 0; i < 8; i++) a.emit('chat', `spam ${i}`);
  assert.match(await aviso, /rápido/);

  // los mensajes vacíos o que no son texto se ignoran
  assert.equal(limpiarMensaje('   '), '');
  assert.equal(limpiarMensaje({ texto: 'x' }), '');
  assert.equal(limpiarMensaje('a'.repeat(500)).length, 200);
});
