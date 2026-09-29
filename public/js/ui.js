// Utilidades de interfaz: pantallas, avisos, diálogos, almacenamiento local

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

let pantallaActual = 'inicio';
const oyentesPantalla = [];

export function mostrarPantalla(id) {
  for (const p of $$('.pantalla')) p.classList.toggle('activa', p.id === `pantalla-${id}`);
  const anterior = pantallaActual;
  pantallaActual = id;
  oyentesPantalla.forEach((fn) => fn(id, anterior));
}

export const pantalla = () => pantallaActual;
export const alCambiarPantalla = (fn) => oyentesPantalla.push(fn);

export function aviso(texto, tipo = '', ms = 3200) {
  const caja = $('#avisos');
  const div = document.createElement('div');
  div.className = `aviso ${tipo}`;
  div.textContent = texto;
  caja.append(div);
  setTimeout(() => div.remove(), ms);
}

export function confirmar(titulo, texto, { si = 'Aceptar', no = 'Cancelar' } = {}) {
  const dlg = $('#dialogo');
  const btnSi = $('#dialogo-si');
  const btnNo = $('#dialogo-no');
  $('#dialogo-titulo').textContent = titulo;
  $('#dialogo-texto').textContent = texto;
  btnSi.textContent = si;
  btnNo.textContent = no;
  dlg.showModal();
  btnSi.focus();
  // Se responde al clic directamente: el evento "close" no llega si la pestaña está oculta
  return new Promise((resolver) => {
    const terminar = (valor) => {
      btnSi.removeEventListener('click', alSi);
      btnNo.removeEventListener('click', alNo);
      dlg.removeEventListener('cancel', alCancelar);
      if (dlg.open) dlg.close();
      resolver(valor);
    };
    const alSi = () => terminar(true);
    const alNo = () => terminar(false);
    const alCancelar = (e) => {
      e.preventDefault();
      terminar(false);
    };
    btnSi.addEventListener('click', alSi);
    btnNo.addEventListener('click', alNo);
    dlg.addEventListener('cancel', alCancelar);
  });
}

// localStorage envuelto: si el navegador lo bloquea, el juego sigue funcionando
const PREFIJO = 'geocanarias:';
export const almacen = {
  leer(clave, porDefecto = null) {
    try {
      const v = localStorage.getItem(PREFIJO + clave);
      return v == null ? porDefecto : JSON.parse(v);
    } catch {
      return porDefecto;
    }
  },
  escribir(clave, valor) {
    try {
      localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
    } catch {
      /* sin almacenamiento */
    }
  },
};

export const sesion = {
  leer(clave) {
    try {
      return sessionStorage.getItem(PREFIJO + clave);
    } catch {
      return null;
    }
  },
  escribir(clave, valor) {
    try {
      if (valor == null) sessionStorage.removeItem(PREFIJO + clave);
      else sessionStorage.setItem(PREFIJO + clave, valor);
    } catch {
      /* sin almacenamiento */
    }
  },
};

export function animarContador(elemento, hasta, ms = 900) {
  const inicio = performance.now();
  const paso = (t) => {
    const x = Math.min(1, (t - inicio) / ms);
    const suavizado = 1 - Math.pow(1 - x, 3);
    elemento.textContent = Math.round(hasta * suavizado).toLocaleString('es-ES');
    if (x < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

export const inicial = (nombre) => (nombre || '?').trim().charAt(0).toUpperCase() || '?';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function formatoFechaImagen(fecha) {
  if (!fecha) return null;
  const [a, m] = fecha.split('-').map(Number);
  return `${MESES[m - 1] ?? ''} de ${a}`;
}
