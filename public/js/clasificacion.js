// Pantalla de clasificación: global (servidor) o las partidas guardadas en este dispositivo

import { $, $$, esc, almacen, mostrarPantalla } from './ui.js';
import { DIFICULTADES, formatoPuntos } from './nucleo.js';
import { nombreIslas } from './datos.js';

const MEDALLAS = ['🥇', '🥈', '🥉'];

export function crearPantallaClasificacion({ datos }) {
  const filtro = { origen: 'global', dificultad: 'normal', islas: 'todas' };
  const lista = $('#clas-lista');

  $('#clas-dificultad').innerHTML = Object.values(DIFICULTADES)
    .map((d) => `<button type="button" data-valor="${d.id}">${d.icono} ${d.nombre}</button>`)
    .join('');
  $('#clas-islas').innerHTML = [
    '<option value="todas">🗺️ Todas las islas</option>',
    ...datos.islas.map((i) => `<option value="${i.id}">${esc(i.nombre)}</option>`),
    '<option value="otras">Otras combinaciones</option>',
  ].join('');

  $('#clas-dificultad').addEventListener('click', (e) => {
    const b = e.target.closest('[data-valor]');
    if (!b) return;
    filtro.dificultad = b.dataset.valor;
    cargar();
  });
  $('#clas-islas').addEventListener('change', (e) => {
    filtro.islas = e.target.value;
    cargar();
  });
  $('#clas-origen').addEventListener('click', (e) => {
    const b = e.target.closest('[data-origen]');
    if (!b) return;
    filtro.origen = b.dataset.origen;
    cargar();
  });

  function pintarFiltros() {
    for (const b of $$('#clas-dificultad button')) b.classList.toggle('sel', b.dataset.valor === filtro.dificultad);
    for (const b of $$('#clas-origen button')) b.classList.toggle('activa', b.dataset.origen === filtro.origen);
    $('#clas-islas').value = filtro.islas;
  }

  function filtrar(registros) {
    return registros.filter((r) => {
      if (r.dificultad !== filtro.dificultad) return false;
      if (filtro.islas === 'otras') return r.islas !== 'todas' && r.islas.includes('+');
      return r.islas === filtro.islas;
    });
  }

  function pintar(registros, vacio) {
    if (!registros.length) {
      lista.innerHTML = `<li><span class="vacio">${vacio}</span></li>`;
      return;
    }
    const nombre = almacen.leer('nombre', '');
    lista.innerHTML = registros
      .map((r, i) => {
        const fecha = new Date(r.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        const extra = filtro.islas === 'otras' ? ` · ${esc(nombreIslas(r.islas, datos.islaPorId))}` : '';
        const esYo = filtro.origen === 'global' && nombre && r.nombre === nombre;
        return `
          <li${esYo ? ' style="background:rgba(255,201,60,.07)"' : ''}>
            <span class="pos">${MEDALLAS[i] ?? i + 1}</span>
            <span class="quien"><strong>${esc(r.nombre)}</strong><small>${fecha}${extra}</small></span>
            <span class="pts">${formatoPuntos(r.puntos)}</span>
          </li>`;
      })
      .join('');
  }

  let peticion = 0;
  async function cargar() {
    pintarFiltros();
    const id = ++peticion;
    if (filtro.origen === 'local') {
      const propios = filtrar(almacen.leer('records', [])).sort((a, b) => b.puntos - a.puntos).slice(0, 50);
      pintar(propios, 'Aún no has jugado ninguna partida de este tipo en este dispositivo.');
      return;
    }
    lista.innerHTML = '<li><span class="vacio">Cargando…</span></li>';
    try {
      const qs = new URLSearchParams({ dificultad: filtro.dificultad, islas: filtro.islas });
      const res = await fetch(`api/clasificacion?${qs}`);
      if (!res.ok) throw new Error();
      const registros = await res.json();
      if (id !== peticion) return;
      pintar(registros, '¡Nadie ha jugado todavía en esta categoría! Sé el primero.');
    } catch {
      if (id !== peticion) return;
      lista.innerHTML = '<li><span class="vacio">La clasificación global no está disponible sin el servidor del juego.</span></li>';
    }
  }

  return {
    abrir(opciones = {}) {
      Object.assign(filtro, opciones);
      mostrarPantalla('clasificacion');
      cargar();
    },
  };
}
