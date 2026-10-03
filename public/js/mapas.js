// Mapas de Leaflet: el mapa para colocar la chincheta y el mapa de resultados
/* global L */
import { esc } from './ui.js';
import { formatoDistancia } from './nucleo.js';

const TESELAS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const capaBase = () => L.tileLayer(TESELAS, { maxZoom: 19, attribution: ATRIBUCION });

export function iconoPin(color, texto = '', real = false) {
  return L.divIcon({
    className: 'pin-envoltorio',
    html: `<div class="pin${real ? ' real' : ''}" style="--c:${color}"><span>${esc(texto)}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 38],
    tooltipAnchor: [0, -30],
  });
}

const aLimites = (bbox) => L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]]);

export function crearMapaAdivinar(elemento, { alMarcar } = {}) {
  const mapa = L.map(elemento, {
    zoomControl: false,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 80,
    maxBoundsViscosity: 0.8,
    minZoom: 6,
  });
  L.control.zoom({ position: 'topright' }).addTo(mapa);
  capaBase().addTo(mapa);

  let marca = null;
  let bloqueado = false;
  let color = '#ffc93c';
  let limites = null;
  // Mientras el jugador no toque el mapa, al ampliarlo se reencuadra en las islas
  let tocado = false;
  for (const ev of ['mousedown', 'wheel', 'touchstart']) {
    elemento.addEventListener(ev, () => (tocado = true), { passive: true });
  }

  const encuadrar = () => mapa.fitBounds(limites, { padding: [10, 10], animate: false });

  function colocar(pos) {
    if (!marca) {
      marca = L.marker(pos, { icon: iconoPin(color), keyboard: false, draggable: true }).addTo(mapa);
      marca.on('drag', () => { if (!bloqueado) alMarcar?.(marca.getLatLng()); });
      marca.on('dragend', () => { if (!bloqueado) alMarcar?.(marca.getLatLng()); });
    } else marca.setLatLng(pos);
  }

  mapa.on('click', (e) => {
    if (bloqueado) return;
    colocar(e.latlng);
    alMarcar?.(e.latlng);
  });

  return {
    preparar({ bbox, color: nuevoColor }) {
      color = nuevoColor || color;
      if (marca) marca.remove();
      marca = null;
      bloqueado = false;
      tocado = false;
      mapa.invalidateSize();
      limites = aLimites(bbox);
      mapa.setMaxBounds(limites.pad(0.6));
      // Si el panel está oculto (móvil) el encuadre se hace al abrirlo, en refrescar()
      if (elemento.clientWidth > 0) encuadrar();
      else mapa.setView(limites.getCenter(), 8, { animate: false });
    },
    posicion: () => (marca ? marca.getLatLng() : null),
    restaurar(pos) { if (pos && !bloqueado) colocar(pos); },
    bloquear(b) {
      bloqueado = b;
      if (marca) b ? marca.dragging.disable() : marca.dragging.enable();
    },
    refrescar() {
      mapa.invalidateSize();
      if (!tocado && limites) encuadrar();
    },
  };
}

// rondas: [{ real: {lat,lng}, etiqueta, intentos: [{ lat, lng, color, texto, nombre, distancia }] }]
export function crearMapaResultado(elemento) {
  const mapa = L.map(elemento, { zoomSnap: 0.25, zoomControl: true });
  capaBase().addTo(mapa);
  const capa = L.layerGroup().addTo(mapa);
  let puntos = [];

  function encuadrar() {
    mapa.invalidateSize();
    if (puntos.length === 1) mapa.setView(puntos[0], 13, { animate: false });
    else if (puntos.length) mapa.fitBounds(puntos, { padding: [50, 50], maxZoom: 15, animate: false });
  }

  // Si el contenedor cambia de tamaño (panel inferior, giro del móvil…), se vuelve a encuadrar
  let ultimoTamano = '';
  const observador = new ResizeObserver(() => {
    const tamano = `${elemento.clientWidth}x${elemento.clientHeight}`;
    if (tamano === ultimoTamano || !elemento.clientWidth) return;
    ultimoTamano = tamano;
    encuadrar();
  });
  observador.observe(elemento);

  return {
    mostrar(rondas) {
      capa.clearLayers();
      puntos = [];
      for (const r of rondas) {
        for (const i of r.intentos) {
          if (i.lat == null) continue;
          L.polyline([[i.lat, i.lng], [r.real.lat, r.real.lng]], {
            color: i.color, weight: 3.5, opacity: 0.95, dashArray: '2 9', lineCap: 'round',
          }).addTo(capa);
        }
      }
      for (const r of rondas) {
        for (const i of r.intentos) {
          if (i.lat == null) continue;
          const m = L.marker([i.lat, i.lng], { icon: iconoPin(i.color, i.texto), keyboard: false }).addTo(capa);
          if (i.nombre) {
            m.bindTooltip(`${esc(i.nombre)} · ${formatoDistancia(i.distancia)}`, { className: 'etiqueta-pin', direction: 'top' });
          }
          puntos.push([i.lat, i.lng]);
        }
        const real = L.marker([r.real.lat, r.real.lng], { icon: iconoPin('#fff', r.etiqueta ?? '🚩', true), keyboard: false, zIndexOffset: 1000 }).addTo(capa);
        if (r.titulo) real.bindTooltip(esc(r.titulo), { className: 'etiqueta-pin', direction: 'top' });
        puntos.push([r.real.lat, r.real.lng]);
      }
      encuadrar();
    },
    refrescar() {
      mapa.invalidateSize();
    },
    destruir() {
      observador.disconnect();
      mapa.remove();
    },
  };
}
