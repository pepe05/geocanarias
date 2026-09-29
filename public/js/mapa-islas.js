// Mapa SVG del archipiélago para elegir islas

const SVG_NS = 'http://www.w3.org/2000/svg';

// Proyección equirrectangular corregida por la latitud media de Canarias
const K = Math.cos((28.4 * Math.PI) / 180);
const ESCALA = 190; // px por grado
const LIMITES = { oeste: -18.22, este: -13.08, sur: 27.52, norte: 29.42 };

const ETIQUETAS = {
  'el-hierro': { lng: -18.02, lat: 27.56, ancla: 'middle' },
  'la-palma': { lng: -17.86, lat: 28.38, ancla: 'middle' },
  'la-gomera': { lng: -17.22, lat: 27.95, ancla: 'middle' },
  tenerife: { lng: -16.52, lat: 27.92, ancla: 'middle' },
  'gran-canaria': { lng: -15.59, lat: 27.66, ancla: 'middle' },
  fuerteventura: { lng: -13.8, lat: 28.28, ancla: 'start' },
  lanzarote: { lng: -13.38, lat: 28.95, ancla: 'start' },
  'la-graciosa': { lng: -13.45, lat: 29.33, ancla: 'start' },
};

const x = (lng) => (lng - LIMITES.oeste) * K * ESCALA;
const y = (lat) => (LIMITES.norte - lat) * ESCALA;

function ruta(contorno) {
  return contorno
    .map((anillo) => 'M' + anillo.map(([lng, lat]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`).join('L') + 'Z')
    .join('');
}

function nodo(tipo, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tipo);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

export function crearMapaIslas(svg, islas, { interactivo = false, alPulsar } = {}) {
  const ancho = x(LIMITES.este);
  const alto = y(LIMITES.sur);
  svg.setAttribute('viewBox', `0 0 ${ancho.toFixed(0)} ${alto.toFixed(0)}`);
  svg.classList.add('mapa-islas');
  svg.classList.toggle('interactivo', interactivo);
  svg.innerHTML = '';
  if (interactivo) svg.setAttribute('role', 'group');

  const grupos = new Map();
  for (const isla of islas) {
    const g = nodo('g', { class: 'isla', 'data-id': isla.id });
    // zona de toque ampliada para las islas pequeñas
    const [lat, lng] = isla.centro;
    const radio = Math.max(0, 22 - (isla.bbox[2] - isla.bbox[0]) * K * ESCALA * 0.5);
    if (radio > 0) g.append(nodo('circle', { class: 'zona-toque', cx: x(lng), cy: y(lat), r: radio }));
    g.append(nodo('path', { d: ruta(isla.contorno) }));
    const et = ETIQUETAS[isla.id];
    if (et) {
      const t = nodo('text', { x: x(et.lng), y: y(et.lat), 'text-anchor': et.ancla });
      t.textContent = isla.nombre;
      g.append(t);
    }
    if (interactivo) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'checkbox');
      g.setAttribute('aria-label', isla.nombre);
      g.addEventListener('click', () => alPulsar?.(isla.id));
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          alPulsar?.(isla.id);
        }
      });
    }
    svg.append(g);
    grupos.set(isla.id, g);
  }

  return {
    marcar(seleccion) {
      for (const [id, g] of grupos) {
        const sel = seleccion.has(id);
        g.classList.toggle('sel', sel);
        if (interactivo) g.setAttribute('aria-checked', String(sel));
      }
    },
  };
}
