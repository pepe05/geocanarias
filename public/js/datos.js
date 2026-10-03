import { ISLAS_ORDEN } from './nucleo.js';

let cache = null;

export async function cargarDatos() {
  if (cache) return cache;
  const [islas, municipios] = await Promise.all([
    fetch('data/islas.json').then((r) => r.json()),
    fetch('data/municipios.json').then((r) => r.json()),
  ]);
  islas.sort((a, b) => ISLAS_ORDEN.indexOf(a.id) - ISLAS_ORDEN.indexOf(b.id));
  cache = {
    islas,
    islaPorId: Object.fromEntries(islas.map((i) => [i.id, i])),
    // El banco es grande y con servidor solo sirve para los contadores: se carga en segundo plano
    // y se rellena este mismo array, que comparten los formularios de configuración.
    ubicaciones: [],
    banco: null,
    municipios: municipios.municipios,
    municipioPorId: Object.fromEntries(municipios.municipios.map((m) => [m.id, m])),
  };
  cache.banco = fetch('data/ubicaciones.json')
    .then((r) => r.json())
    .then((j) => {
      for (const u of j.ubicaciones) cache.ubicaciones.push(u);
      document.dispatchEvent(new CustomEvent('banco-cargado'));
      return cache.ubicaciones;
    })
    .catch(() => cache.ubicaciones);
  return cache;
}

export function nombreIslas(claveOLista, islaPorId) {
  if (claveOLista === 'todas') return 'Todas las islas';
  const lista = Array.isArray(claveOLista) ? claveOLista : claveOLista.split('+');
  if (lista.length === ISLAS_ORDEN.length) return 'Todas las islas';
  return lista.map((id) => islaPorId[id]?.nombre ?? id).join(', ');
}
