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

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT) || 3000;
const EN_LA_NUBE = !!process.env.RENDER || process.env.NODE_ENV === 'production';

const leerJson = (ruta) => JSON.parse(fs.readFileSync(path.join(RAIZ, ruta), 'utf8'));
const islas = leerJson('public/data/islas.json');
const { ubicaciones } = leerJson('public/data/ubicaciones.json');

const app = express();
const http = createServer(app);
const io = new Server(http, { pingInterval: 10000, pingTimeout: 20000, maxHttpBufferSize: 16 * 1024 });

// Detrás del proxy del hosting, para conocer la IP real de cada jugador
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '32kb' }));
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
  const lista = (envios.get(req.ip) || []).filter((t) => ahora - t < 5 * 60 * 1000);
  if (lista.length >= 8) return res.status(429).json({ ok: false, error: 'Demasiadas partidas seguidas. Espera un poco.' });
  lista.push(ahora);
  envios.set(req.ip, lista);
  next();
}
setInterval(() => envios.clear(), 30 * 60 * 1000).unref();

app.get('/api/estado', (_req, res) => res.json({ ok: true, online: true, ubicaciones: ubicaciones.length }));

app.get('/api/clasificacion', (req, res) => {
  res.json(clasificacion.consultar({ dificultad: req.query.dificultad, islas: req.query.islas }));
});

app.post('/api/clasificacion', limiteEnvios, (req, res) => {
  const resultado = clasificacion.registrar(req.body);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

crearGestorSalas(io, { islas, ubicaciones });

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
