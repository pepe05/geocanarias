import { almacen } from './ui.js';
import { clavesUbicacion } from './nucleo.js';

let memoria = new Set();
export function leerVistas() {
  const guardadas = almacen.leer('vistas', []);
  if (Array.isArray(guardadas)) for (const k of guardadas) if (typeof k === 'string') memoria.add(k);
  return new Set(memoria);
}
export function recordarUbicaciones(ubicaciones) {
  memoria = leerVistas();
  for (const u of ubicaciones) clavesUbicacion(u).forEach((k) => memoria.add(k));
  almacen.escribir('vistas', [...memoria]);
}
let tokenMemoria;
export function obtenerToken() {
  if (!tokenMemoria) {
    tokenMemoria = almacen.leer('token') || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
    almacen.escribir('token', tokenMemoria);
  }
  return tokenMemoria;
}
