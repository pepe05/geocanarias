// Pantallas de resultado de ronda y de final de partida (solo y online)

import { $, esc, inicial, mostrarPantalla, animarContador, formatoFechaImagen } from './ui.js';
import { crearMapaResultado } from './mapas.js';
import {
  PUNTOS_MAX_RONDA, formatoDistancia, formatoPuntos, valoracion, nombreDificultad,
} from './nucleo.js';
import { nombreIslas } from './datos.js';
import { sonido } from './sonido.js';

const MEDALLAS = ['🥇', '🥈', '🥉'];

export function crearResultados({ datos }) {
  let mapaRonda = null;
  let mapaFinal = null;

  const urlPano = (u) => `https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(u.pano)}&heading=${u.rumbo ?? 0}`;

  function lugarHtml(u) {
    const isla = datos.islaPorId[u.isla]?.nombre ?? '';
    const municipio = datos.municipioPorId[u.municipio]?.nombre;
    const donde = [...new Set([u.lugar, municipio, isla].filter(Boolean))].join(', ');
    const partes = [`<span>📍 ${u.cerca ? `Cerca de ${esc(u.cerca)} · ` : ''}${esc(donde)}</span>`];
    if (u.calle) partes.push(`<span>🛣️ ${esc(u.calle)}</span>`);
    const fecha = formatoFechaImagen(u.fecha);
    if (fecha) partes.push(`<span>📷 ${esc(fecha)}</span>`);
    partes.push(`<a href="${urlPano(u)}" target="_blank" rel="noopener">Ver en Google Maps ↗</a>`);
    return `<div class="resultado-lugar">${partes.join('')}</div>`;
  }

  function mostrarMapaRonda(rondas) {
    mostrarPantalla('resultado');
    if (!mapaRonda) mapaRonda = crearMapaResultado($('#mapa-resultado'));
    mapaRonda.mostrar(rondas);
  }

  function animarPuntos(panel, puntos) {
    const cifra = $('[data-cifra]', panel);
    if (cifra) animarContador(cifra, puntos);
    const barra = $('.barra-progreso div', panel);
    if (barra) requestAnimationFrame(() => requestAnimationFrame(() => (barra.style.width = `${(puntos / PUNTOS_MAX_RONDA) * 100}%`)));
  }

  function textoDistancia(intento) {
    if (!intento || intento.lat == null) return 'Se acabó el tiempo y no pusiste ninguna chincheta 😬';
    if (intento.distancia < 0.05) return '¡Clavado! Diste justo en el sitio 🎯';
    return `${intento.automatico ? '⌛ Chincheta guardada automáticamente. ' : ''}Tu chincheta quedó a <strong>${formatoDistancia(intento.distancia)}</strong> del lugar correcto`;
  }

  function pintarMapaFinal(contenedor, rondas) {
    if (mapaFinal) mapaFinal.destruir();
    mapaFinal = crearMapaResultado($('[data-mapa-final]', contenedor));
    mapaFinal.mostrar(rondas);
  }

  return {
    // ---------------------------------------------------------------- solo
    rondaSolo({ ubicacion: u, intento, ronda, total, puntosTotales, alSiguiente }) {
      mostrarMapaRonda([{
        real: u,
        intentos: intento.lat != null ? [{ ...intento, color: '#ffc93c', texto: '' }] : [],
      }]);
      const panel = $('#resultado-panel');
      const ultima = ronda >= total;
      panel.innerHTML = `
        <div class="resultado-interior">
          <div class="resultado-titulo">Ronda ${ronda} de ${total}</div>
          <div class="resultado-puntos"><span data-cifra>0</span> <small>puntos</small></div>
          <div class="barra-progreso"><div></div></div>
          <div class="resultado-distancia">${textoDistancia(intento)}</div>
          ${lugarHtml(u)}
          <div class="resultado-acciones">
            <button class="btn-primario btn-xl" data-siguiente>${ultima ? 'Ver resultado final 🏁' : 'Siguiente ronda →'}</button>
          </div>
          <small class="resultado-titulo">Llevas ${formatoPuntos(puntosTotales)} puntos</small>
        </div>`;
      animarPuntos(panel, intento.puntos);
      sonido.resultado(intento.puntos);
      const btn = $('[data-siguiente]', panel);
      btn.addEventListener('click', alSiguiente, { once: true });
      setTimeout(() => btn.focus(), 50);
    },

    finalSolo({ partida, registro, alRepetir, alConfig, alMenu }) {
      mostrarPantalla('final');
      const max = partida.ubicaciones.length * PUNTOS_MAX_RONDA;
      const c = partida.config;
      const cont = $('#final-contenido');
      cont.innerHTML = `
        <div class="final-cabecera">
          <span class="etiqueta">Puntuación final</span>
          <div class="final-total"><span data-cifra>0</span> <small>/ ${formatoPuntos(max)}</small></div>
          <p class="final-valoracion">${esc(valoracion(partida.puntos / max))}</p>
          <p class="final-config">${esc(nombreDificultad(c.dificultad))} · ${esc(nombreIslas(c.islas, datos.islaPorId))} · ${c.rondas} ronda${c.rondas === 1 ? '' : 's'}</p>
        </div>
        <div class="final-registro" data-registro ${registro ? '' : 'hidden'}>${registro ?? ''}</div>
        <div class="final-mapa" data-mapa-final></div>
        <div class="final-rondas">
          ${partida.ubicaciones.map((u, i) => {
            const it = partida.intentos[i];
            return `
            <div class="final-ronda">
              <span class="n">${i + 1}</span>
              <span class="lugar">${esc([u.lugar, datos.islaPorId[u.isla]?.nombre].filter(Boolean).join(', '))}
                <small>${it.lat != null ? `a ${formatoDistancia(it.distancia)}` : 'sin respuesta'} · <a href="${urlPano(u)}" target="_blank" rel="noopener" style="color:var(--azul)">ver lugar ↗</a></small></span>
              <span class="pts">${formatoPuntos(it.puntos)}<small>puntos</small></span>
            </div>`;
          }).join('')}
        </div>
        <div class="final-acciones">
          <button class="btn-primario btn-xl" data-repetir>🔁 Jugar otra vez</button>
          <button class="btn-secundario" data-config>⚙️ Cambiar ajustes</button>
          <button class="btn-texto" data-menu>Menú principal</button>
        </div>`;
      animarContador($('[data-cifra]', cont), partida.puntos, 1400);
      sonido.final();
      pintarMapaFinal(cont, partida.ubicaciones.map((u, i) => ({
        real: u,
        etiqueta: String(i + 1),
        titulo: `Ronda ${i + 1}: ${u.lugar ?? datos.islaPorId[u.isla]?.nombre ?? ''}`,
        intentos: partida.intentos[i].lat != null ? [{ ...partida.intentos[i], color: '#ffc93c', texto: String(i + 1) }] : [],
      })));
      $('[data-repetir]', cont).addEventListener('click', alRepetir);
      $('[data-config]', cont).addEventListener('click', alConfig);
      $('[data-menu]', cont).addEventListener('click', alMenu);
      cont.parentElement.scrollTop = 0;
    },

    mostrarRegistro(html, exito = false) {
      const caja = $('#final-contenido [data-registro]');
      if (!caja) return;
      caja.hidden = false;
      caja.classList.toggle('exito', exito);
      caja.innerHTML = html;
    },

    // ---------------------------------------------------------------- online
    rondaOnline({ estado, yoId, soloPanel = false, alSiguiente, reacciones }) {
      const r = estado.resultados[estado.ronda - 1];
      const porId = Object.fromEntries(estado.jugadores.map((j) => [j.id, j]));
      const filas = r.intentos
        .map((i) => ({ ...i, jugador: porId[i.id] }))
        .filter((f) => f.jugador)
        .sort((a, b) => b.puntos - a.puntos || (a.distancia ?? 1e9) - (b.distancia ?? 1e9));
      const mio = r.intentos.find((i) => i.id === yoId) || { puntos: 0 };

      const esAnfitrion = estado.anfitrion === yoId;
      const ultima = estado.ronda >= estado.totalRondas;
      const anfitrion = porId[estado.anfitrion];
      const panel = $('#resultado-panel');
      panel.innerHTML = `
        <div class="resultado-interior resultado-online">
          <div class="resultado-col">
            <div class="resultado-titulo">Ronda ${estado.ronda} de ${estado.totalRondas} · Sala ${esc(estado.codigo)}</div>
            <div class="resultado-puntos"><span data-cifra>${soloPanel ? formatoPuntos(mio.puntos) : 0}</span> <small>puntos para ti</small></div>
            <div class="barra-progreso"><div ${soloPanel ? `style="width:${(mio.puntos / PUNTOS_MAX_RONDA) * 100}%"` : ''}></div></div>
            ${lugarHtml(r.ubicacion)}
            <div class="resultado-acciones">
              ${esAnfitrion
                ? `<button class="btn-primario btn-xl" data-siguiente>${ultima ? 'Ver clasificación final 🏁' : 'Siguiente ronda →'}</button>`
                : `<p class="resultado-titulo">Esperando a que ${esc(anfitrion?.nombre ?? 'el anfitrión')} continúe…</p>`}
            </div>
          </div>
          <div class="resultado-col">
          <table class="tabla-ronda">
            <thead><tr><th>#</th><th>Jugador</th><th class="num">Distancia</th><th class="num">Ronda</th><th class="num">Total</th></tr></thead>
            <tbody>
              ${filas.map((f, n) => `
                <tr class="${f.id === yoId ? 'yo' : ''}">
                  <td>${MEDALLAS[n] ?? n + 1}</td>
                  <td><span class="jug"><span class="avatar peq" style="--c:${f.jugador.color}">${esc(inicial(f.jugador.nombre))}</span>${esc(f.jugador.nombre)}</span></td>
                  <td class="num">${f.lat != null ? formatoDistancia(f.distancia) : '—'}</td>
                  <td class="num suma">+${formatoPuntos(f.puntos)}</td>
                  <td class="num"><strong>${formatoPuntos(f.jugador.puntos)}</strong></td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div class="barra-reacciones" data-reacciones></div>
          </div>
        </div>`;
      if (!soloPanel) {
        mostrarMapaRonda([{
          real: r.ubicacion,
          intentos: filas.filter((f) => f.lat != null).map((f) => ({
            ...f, color: f.jugador.color, texto: inicial(f.jugador.nombre), nombre: f.jugador.nombre,
          })),
        }]);
        sonido.resultado(mio.puntos);
        animarPuntos(panel, mio.puntos);
      }
      reacciones?.($('[data-reacciones]', panel));
      $('[data-siguiente]', panel)?.addEventListener('click', alSiguiente, { once: true });
    },

    finalOnline({ estado, yoId, alRevancha, alAjustes, alSalir, reacciones }) {
      mostrarPantalla('final');
      const ranking = [...estado.jugadores].sort((a, b) => b.puntos - a.puntos);
      const esAnfitrion = estado.anfitrion === yoId;
      const max = estado.totalRondas * PUNTOS_MAX_RONDA;
      const yo = ranking.find((j) => j.id === yoId);
      const posicion = ranking.indexOf(yo) + 1;
      const podio = [ranking[1], ranking[0], ranking[2]];
      const cont = $('#final-contenido');
      const c = estado.config;
      cont.innerHTML = `
        <div class="final-cabecera">
          <span class="etiqueta">Sala ${esc(estado.codigo)} · Resultado final</span>
          <p class="final-valoracion">${posicion === 1 ? '🏆 ¡Has ganado la partida!' : `Has quedado en ${posicion}.ª posición`}</p>
          <p class="final-config">${esc(nombreDificultad(c.dificultad))} · ${esc(nombreIslas(c.islas, datos.islaPorId))} · ${estado.totalRondas} ronda${estado.totalRondas === 1 ? '' : 's'}</p>
        </div>
        <div class="podio">
          ${podio.map((j, i) => {
            if (!j) return '<div class="podio-puesto" style="visibility:hidden"></div>';
            const puesto = [2, 1, 3][i];
            return `
              <div class="podio-puesto p${puesto}">
                <span class="avatar" style="--c:${j.color}">${esc(inicial(j.nombre))}</span>
                <span class="nombre">${esc(j.nombre)}</span>
                <span class="pts">${formatoPuntos(j.puntos)} pts</span>
                <div class="podio-bloque">${MEDALLAS[puesto - 1]}</div>
              </div>`;
          }).join('')}
        </div>
        <div class="tarjeta">
          <table class="tabla-ronda">
            <thead><tr><th>#</th><th>Jugador</th><th class="num">Puntos</th><th class="num">%</th></tr></thead>
            <tbody>
              ${ranking.map((j, n) => `
                <tr class="${j.id === yoId ? 'yo' : ''}">
                  <td>${MEDALLAS[n] ?? n + 1}</td>
                  <td><span class="jug"><span class="avatar peq" style="--c:${j.color}">${esc(inicial(j.nombre))}</span>${esc(j.nombre)}</span></td>
                  <td class="num"><strong>${formatoPuntos(j.puntos)}</strong></td>
                  <td class="num">${Math.round((j.puntos / max) * 100)}%</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div class="barra-reacciones" data-reacciones></div>
        </div>
        <div class="final-mapa" data-mapa-final></div>
        <div class="final-acciones">
          ${esAnfitrion
            ? `<button class="btn-primario btn-xl" data-revancha>🔁 Revancha</button>
               <button class="btn-secundario" data-ajustes>⚙️ Cambiar ajustes</button>`
            : `<p class="resultado-titulo">El anfitrión puede lanzar la revancha…</p>`}
          <button class="btn-texto" data-salir>Salir de la sala</button>
        </div>`;
      sonido.final();
      const porId = Object.fromEntries(estado.jugadores.map((j) => [j.id, j]));
      pintarMapaFinal(cont, estado.resultados.map((r, i) => ({
        real: r.ubicacion,
        etiqueta: String(i + 1),
        titulo: `Ronda ${i + 1}: ${r.ubicacion.lugar ?? datos.islaPorId[r.ubicacion.isla]?.nombre ?? ''}`,
        intentos: r.intentos
          .filter((it) => it.lat != null && porId[it.id])
          .map((it) => ({ ...it, color: porId[it.id].color, texto: inicial(porId[it.id].nombre), nombre: porId[it.id].nombre })),
      })));
      reacciones?.($('[data-reacciones]', cont));
      $('[data-revancha]', cont)?.addEventListener('click', alRevancha);
      $('[data-ajustes]', cont)?.addEventListener('click', alAjustes);
      $('[data-salir]', cont).addEventListener('click', alSalir);
      cont.parentElement.scrollTop = 0;
    },
  };
}
