// Clasificación global de partidas en solitario.
// El servidor recalcula la puntuación a partir de los intentos: no se fía del total que envía el cliente.

import fs from 'node:fs';
import path from 'node:path';
import * as N from '../public/js/nucleo.js';

const MAX_POR_CATEGORIA = 100;

export function limpiarNombre(nombre) {
  if (typeof nombre !== 'string') return '';
  return nombre.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

export function crearClasificacion({ fichero, islas, ubicaciones }) {
  const porId = new Map(ubicaciones.map((u) => [u.id, u]));
  let registros = [];
  try {
    registros = JSON.parse(fs.readFileSync(fichero, 'utf8'));
  } catch {
    registros = [];
  }

  let temporizadorGuardado = null;
  function guardar() {
    clearTimeout(temporizadorGuardado);
    temporizadorGuardado = setTimeout(() => {
      fs.mkdirSync(path.dirname(fichero), { recursive: true });
      fs.writeFile(fichero, JSON.stringify(registros), (err) => {
        if (err) console.error('No se pudo guardar la clasificación:', err.message);
      });
    }, 500);
  }

  const ordenar = (a, b) => b.puntos - a.puntos || a.fecha.localeCompare(b.fecha);

  function registrar(cuerpo) {
    const nombre = limpiarNombre(cuerpo?.nombre);
    if (!nombre) return { ok: false, error: 'Escribe un nombre para aparecer en la clasificación.' };
    const dificultad = cuerpo?.dificultad;
    if (!(dificultad in N.DIFICULTADES)) return { ok: false, error: 'Solo puntúan las dificultades estándar.' };
    const islasSel = N.ISLAS_ORDEN.filter((i) => Array.isArray(cuerpo.islas) && cuerpo.islas.includes(i));
    if (!islasSel.length) return { ok: false, error: 'Islas no válidas.' };
    const rondas = cuerpo.rondas;
    if (!Array.isArray(rondas) || rondas.length !== 5) return { ok: false, error: 'Solo puntúan las partidas de 5 rondas.' };

    const diag = N.diagonalKm(islasSel, islas);
    const vistos = new Set();
    let puntos = 0;
    for (const r of rondas) {
      const u = porId.get(r?.id);
      if (!u || vistos.has(u.id) || !islasSel.includes(u.isla)) return { ok: false, error: 'Partida no válida.' };
      vistos.add(u.id);
      if (Number.isFinite(r.lat) && Number.isFinite(r.lng)) puntos += N.puntuar(N.distanciaKm(u, r), diag);
    }

    const registro = { nombre, puntos, dificultad, islas: N.claveIslas(islasSel), fecha: new Date().toISOString() };
    registros.push(registro);

    const categoria = registros.filter((x) => x.dificultad === dificultad && x.islas === registro.islas).sort(ordenar);
    const posicion = categoria.indexOf(registro) + 1;
    if (categoria.length > MAX_POR_CATEGORIA) {
      const fuera = new Set(categoria.slice(MAX_POR_CATEGORIA));
      registros = registros.filter((x) => !fuera.has(x));
    }
    guardar();
    return { ok: true, puntos, posicion: posicion <= MAX_POR_CATEGORIA ? posicion : null, total: Math.min(categoria.length, MAX_POR_CATEGORIA) };
  }

  function consultar({ dificultad, islas: filtroIslas } = {}) {
    let lista = registros;
    if (dificultad) lista = lista.filter((x) => x.dificultad === dificultad);
    if (filtroIslas === 'otras') {
      lista = lista.filter((x) => x.islas !== 'todas' && x.islas.includes('+'));
    } else if (filtroIslas) {
      lista = lista.filter((x) => x.islas === filtroIslas);
    }
    return [...lista].sort(ordenar).slice(0, 50);
  }

  return { registrar, consultar };
}
