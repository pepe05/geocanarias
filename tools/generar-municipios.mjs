// Límites del portal de datos abiertos del Gobierno de Canarias (SITCAN).
// Se conservan los huecos y las islas menores. La Graciosa pertenece a Teguise.
import fs from 'node:fs/promises';
import { bboxDe, municipioDe } from '../public/js/geografia.js';

const raiz = new URL('../', import.meta.url);
const origen = 'https://opendata.sitcan.es/upload/unidades-administrativas/gobcan_unidades-administrativas_municipios.geojson';
const cache = new URL('tools/.cache/municipios-oficial.geojson', raiz);
await fs.mkdir(new URL('tools/.cache/', raiz), { recursive: true });
let raw;
try { raw = await fs.readFile(cache, 'utf8'); } catch {
  const r = await fetch(origen, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`No se pudieron descargar los municipios: ${r.status}`);
  raw = await r.text();
  await fs.writeFile(cache, raw);
}
const slug = (s) => s.toLowerCase().replaceAll(' ', '-');
const titulo = (s) => s.toLocaleLowerCase('es').replace(/(^|[\s-])\p{L}/gu, (x) => x.toLocaleUpperCase('es')).replace(/\b(De|Del|La|Las|Los|El|Y)\b/g, (x, _palabra, indice) => indice === 0 ? x : x.toLowerCase());
const municipios = JSON.parse(raw).features.map((f) => {
  const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const id = String(f.properties.codigo);
  return { id, nombre: titulo(f.properties.nombre), islas: [slug(f.properties.isla), ...(id === '35024' ? ['la-graciosa'] : [])], bbox: bboxDe(poligonos), poligonos };
}).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

const rutaUbic = new URL('public/data/ubicaciones.json', raiz);
const banco = JSON.parse(await fs.readFile(rutaUbic, 'utf8'));
let asignadas = 0;
for (const u of banco.ubicaciones) {
  u.municipio = municipioDe(u, municipios)?.id ?? null;
  if (u.municipio) asignadas++;
}
await fs.writeFile(rutaUbic, JSON.stringify(banco));

// Simplificación Douglas–Peucker iterativa, tolerancia ~1 m; sin desbordar la pila.
function simplificar(a, tolerancia = 0.00001) {
  if (a.length < 5) return a;
  const conservar = new Set([0, a.length - 1]), pendientes = [[0, a.length - 1]];
  while (pendientes.length) {
    const [ini, fin] = pendientes.pop();
    const [x, y] = a[ini], dx = a[fin][0] - x, dy = a[fin][1] - y, d = dx * dx + dy * dy;
    let max = tolerancia ** 2, indice = -1;
    for (let i = ini + 1; i < fin; i++) {
      const t = d ? Math.max(0, Math.min(1, ((a[i][0] - x) * dx + (a[i][1] - y) * dy) / d)) : 0;
      const ds = (a[i][0] - x - t * dx) ** 2 + (a[i][1] - y - t * dy) ** 2;
      if (ds > max) { max = ds; indice = i; }
    }
    if (indice >= 0) { conservar.add(indice); pendientes.push([ini, indice], [indice, fin]); }
  }
  const resultado = [...conservar].sort((x, y) => x - y).map((i) => a[i].map((v) => Number(v.toFixed(6))));
  return resultado.length >= 4 ? resultado : a.map((p) => p.map((v) => Number(v.toFixed(6))));
}
for (const m of municipios) m.poligonos = m.poligonos.map((p) => p.map((a) => simplificar(a)));
await fs.writeFile(new URL('public/data/limites-municipales.json', raiz), JSON.stringify(municipios));
await fs.writeFile(new URL('public/data/municipios.json', raiz), JSON.stringify({
  fuente: origen, atribucion: 'Gobierno de Canarias · SITCAN. Límites administrativos sin carácter oficial.',
  generado: new Date().toISOString().slice(0, 10), municipios: municipios.map(({ poligonos, ...m }) => m),
}));
console.log(`${municipios.length} municipios; ${asignadas}/${banco.ubicaciones.length} ubicaciones dentro de sus límites. Las demás solo se usan sin filtro municipal.`);
