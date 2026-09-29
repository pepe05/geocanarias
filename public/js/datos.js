import { ISLAS_ORDEN } from './nucleo.js';

let cache = null;

export async function cargarDatos() {
  if (cache) return cache;
  const [islas, ubic] = await Promise.all([
    fetch('data/islas.json').then((r) => r.json()),
    fetch('data/ubicaciones.json').then((r) => r.json()),
  ]);
  islas.sort((a, b) => ISLAS_ORDEN.indexOf(a.id) - ISLAS_ORDEN.indexOf(b.id));
  cache = {
    islas,
    islaPorId: Object.fromEntries(islas.map((i) => [i.id, i])),
    ubicaciones: ubic.ubicaciones,
  };
  return cache;
}

export function nombreIslas(claveOLista, islaPorId) {
  if (claveOLista === 'todas') return 'Todas las islas';
  const lista = Array.isArray(claveOLista) ? claveOLista : claveOLista.split('+');
  if (lista.length === ISLAS_ORDEN.length) return 'Todas las islas';
  return lista.map((id) => islaPorId[id]?.nombre ?? id).join(', ');
}
