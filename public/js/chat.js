// Chat de texto y reacciones de una sala online. Se ve en la sala de espera, durante la partida
// y en los resultados. Con el panel cerrado, los mensajes nuevos aparecen como burbujas breves.

import { $, esc, inicial } from './ui.js';
import { sonido } from './sonido.js';

export const REACCIONES = ['👏', '😂', '😱', '🔥', '🤔', '😎', '🌋', '🐐'];
const MAX_BURBUJAS = 3;

export function crearChat({ alEnviar, alReaccion }) {
  const raiz = $('#chat');
  const panel = $('#chat-panel');
  const lista = $('#chat-mensajes');
  const entrada = $('#chat-texto');
  const contador = $('#chat-contador');
  const burbujas = $('#chat-burbujas');
  const rapidos = $('#chat-emojis-rapidos');
  const btnEmoji = $('#chat-emoji');
  let yoId = null;
  let noLeidos = 0;

  const botonesEmoji = REACCIONES.map((e) => `<button type="button" data-emoji="${e}" title="Enviar ${e}">${e}</button>`).join('');
  let cierreRapidos = null;
  const mostrarRapidos = (visible) => {
    clearTimeout(cierreRapidos);
    rapidos.hidden = !visible;
    btnEmoji.setAttribute('aria-expanded', String(visible));
    // La barra se recoge sola para no tapar Street View
    if (visible) cierreRapidos = setTimeout(() => mostrarRapidos(false), 5000);
  };
  for (const cont of [rapidos, $('#chat-emojis-panel')]) {
    cont.innerHTML = botonesEmoji;
    cont.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-emoji]');
      if (!b) return;
      alReaccion(b.dataset.emoji);
      if (cont === rapidos) mostrarRapidos(true); // reinicia la cuenta para poder mandar varios seguidos
    });
  }

  const abierto = () => !panel.hidden;
  const hora = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  function pintarContador() {
    contador.hidden = noLeidos === 0;
    contador.textContent = noLeidos > 9 ? '9+' : String(noLeidos);
  }

  function elemento(m) {
    const li = document.createElement('li');
    li.className = m.jugador === yoId ? 'mio' : '';
    li.innerHTML = `
      <span class="avatar peq" style="--c:${m.color}">${esc(inicial(m.nombre))}</span>
      <div><span class="chat-autor">${esc(m.nombre)} <time>${hora(m.hora)}</time></span>
      <p>${esc(m.texto)}</p></div>`;
    return li;
  }

  function alFinal() {
    lista.scrollTop = lista.scrollHeight;
  }

  function burbuja(m) {
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'chat-burbuja';
    div.innerHTML = `<span class="avatar peq" style="--c:${m.color}">${esc(inicial(m.nombre))}</span><span><strong>${esc(m.nombre)}</strong> ${esc(m.texto)}</span>`;
    div.addEventListener('click', abrir);
    burbujas.append(div);
    while (burbujas.children.length > MAX_BURBUJAS) burbujas.firstElementChild.remove();
    setTimeout(() => div.classList.add('saliendo'), 5500);
    setTimeout(() => div.remove(), 6000);
  }

  function abrir() {
    panel.hidden = false;
    mostrarRapidos(false);
    burbujas.innerHTML = '';
    noLeidos = 0;
    pintarContador();
    alFinal();
    // En el móvil no se abre el teclado solo: tapaba medio Street View
    if (!matchMedia('(pointer: coarse)').matches) entrada.focus();
  }

  function cerrar() {
    panel.hidden = true;
    entrada.blur();
  }

  $('#chat-abrir').addEventListener('click', () => (abierto() ? cerrar() : abrir()));
  $('#chat-cerrar').addEventListener('click', cerrar);
  btnEmoji.addEventListener('click', () => {
    if (abierto()) cerrar();
    mostrarRapidos(rapidos.hidden);
  });
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = entrada.value.replace(/\s+/g, ' ').trim();
    if (!texto) return;
    alEnviar(texto.slice(0, 200));
    entrada.value = '';
  });
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrar();
    e.stopPropagation(); // que las teclas del chat no lleguen a los atajos del juego
  });

  return {
    // Historial al entrar o reconectar: sin burbujas ni contador
    cargar(historial, id) {
      yoId = id;
      lista.innerHTML = '';
      for (const m of historial || []) lista.append(elemento(m));
      alFinal();
    },
    recibir(m) {
      const pegadoAbajo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 40;
      lista.append(elemento(m));
      while (lista.children.length > 100) lista.firstElementChild.remove();
      if (abierto()) {
        if (pegadoAbajo || m.jugador === yoId) alFinal();
      } else if (m.jugador !== yoId) {
        noLeidos++;
        pintarContador();
        if (!raiz.hidden) burbuja(m);
        sonido.pop();
      }
    },
    mostrar(visible) {
      raiz.hidden = !visible;
      if (!visible) {
        cerrar();
        mostrarRapidos(false);
        burbujas.innerHTML = '';
      }
    },
    vaciar() {
      lista.innerHTML = '';
      burbujas.innerHTML = '';
      noLeidos = 0;
      pintarContador();
      cerrar();
    },
  };
}
