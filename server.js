import express from 'express';
import compression from 'compression';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearGestorSalas } from './servidor/salas.js';
import { crearClasificacion } from './servidor/clasificacion.js';
import { crearCatalogo } from './servidor/ubicaciones.js';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT) || 3000;
const EN_LA_NUBE = !!process.env.RENDER || process.env.NODE_ENV === 'production';

const leerJson = (ruta) => JSON.parse(fs.readFileSync(path.join(RAIZ, ruta), 'utf8'));
const islas = leerJson('public/data/islas.json');
const { ubicaciones } = leerJson('public/data/ubicaciones.json');
const municipios = leerJson('public/data/limites-municipales.json');
// segundoPlano: el servidor va descubriendo lugares al azar para que las partidas empiecen al instante
const catalogo = crearCatalogo({ ubicaciones, islas, municipios, segundoPlano: true,
  nucleos: leerJson('public/data/nucleos.json'), directorio: path.join(RAIZ, 'datos-servidor') });

const app = express();
const http = createServer(app);
const io = new Server(http, { pingInterval: 10000, pingTimeout: 20000, maxHttpBufferSize: 16 * 1024 });

// Detrás del proxy del hosting, para conocer la IP real de cada jugador
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(RAIZ, 'public'), { extensions: ['html'] }));

const clasificacion = crearClasificacion({
  fichero: path.join(RAIZ, 'datos-servidor', 'clasificacion.json'),
  islas,
  ubicaciones,
});

// Límite sencillo de peticiones por IP para la clasificación
const envios = new Map();
function limiteEnvios(req, res, next) {
  const ahora = Date.now();
  const clave = `${req.ip}:${req.path}`;
  const lista = (envios.get(clave) || []).filter((t) => ahora - t < 5 * 60 * 1000);
  if (lista.length >= (req.path === '/api/clasificacion' ? 8 : 40)) return res.status(429).json({ ok: false, error: 'Demasiadas partidas seguidas. Espera un poco.' });
  lista.push(ahora);
  envios.set(clave, lista);
  next();
}
setInterval(() => envios.clear(), 30 * 60 * 1000).unref();

// También sirve para comprobar en el hosting que la búsqueda de lugares aleatorios funciona
app.get('/api/estado', (_req, res) => res.json({ ok: true, online: true, ubicaciones: ubicaciones.length, aleatorias: catalogo.resumen() }));

app.post('/api/historial', limiteEnvios, (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.slice(0, 64) : '';
  if (!token || !Array.isArray(req.body.vistas)) return res.status(400).json({ ok: false });
  try {
    catalogo.recordar(token, req.body.vistas.filter((v) => typeof v === 'string' && v.length <= 120));
    res.json({ ok: true });
  } catch { res.status(500).json({ ok: false, error: 'No se pudo guardar el historial.' }); }
});

app.post('/api/partida', limiteEnvios, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.slice(0, 64) : '';
  if (!token) return res.status(400).json({ ok: false, error: 'Falta el identificador del jugador.' });
  const vistas = Array.isArray(req.body.vistas) ? req.body.vistas.filter((v) => typeof v === 'string' && v.length <= 120) : [];
  try {
    const partida = await catalogo.preparar(req.body.config, { tokens: [token], excluir: vistas });
    res.json({ ok: true, ...partida });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.get('/api/clasificacion', (req, res) => {
  res.json(clasificacion.consultar({ dificultad: req.query.dificultad, islas: req.query.islas }));
});

app.post('/api/clasificacion', limiteEnvios, (req, res) => {
  const resultado = clasificacion.registrar(req.body);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

crearGestorSalas(io, { islas, ubicaciones, municipios, catalogo });

function ipsLocales() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

http.listen(PUERTO, () => {
  console.log(`\n  🌋 GeoCanarias listo con ${ubicaciones.length} ubicaciones en ${islas.length} islas\n`);
  if (EN_LA_NUBE) return;
  console.log(`     En este ordenador:     http://localhost:${PUERTO}`);
  for (const ip of ipsLocales()) console.log(`     Desde tu misma wifi:   http://${ip}:${PUERTO}`);
  console.log('\n  Para jugar con amigos por Internet, mira el README (publicarlo gratis en Render).\n');
});
