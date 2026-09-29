// Efectos de sonido sintetizados con Web Audio (sin ficheros de audio)
import { almacen } from './ui.js';

let ctx = null;
let activo = almacen.leer('sonido', true);

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tono(frecuencia, duracion, { tipo = 'sine', volumen = 0.12, retraso = 0, deslizar = null } = {}) {
  if (!activo) return;
  const c = contexto();
  if (!c) return;
  const t0 = c.currentTime + retraso;
  const osc = c.createOscillator();
  const gan = c.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(frecuencia, t0);
  if (deslizar) osc.frequency.exponentialRampToValueAtTime(deslizar, t0 + duracion);
  gan.gain.setValueAtTime(0.0001, t0);
  gan.gain.exponentialRampToValueAtTime(volumen, t0 + 0.01);
  gan.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  osc.connect(gan).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.02);
}

export const sonido = {
  get activo() {
    return activo;
  },
  alternar() {
    activo = !activo;
    almacen.escribir('sonido', activo);
    return activo;
  },
  marcar() {
    tono(520, 0.08, { tipo: 'triangle', volumen: 0.1, deslizar: 780 });
  },
  adivinar() {
    tono(300, 0.18, { tipo: 'sine', volumen: 0.12, deslizar: 900 });
  },
  tic() {
    tono(1100, 0.05, { tipo: 'square', volumen: 0.035 });
  },
  resultado(puntos) {
    if (puntos >= 4500) [523, 659, 784, 1047].forEach((f, i) => tono(f, 0.22, { tipo: 'triangle', volumen: 0.1, retraso: i * 0.09 }));
    else if (puntos >= 2500) [523, 659, 784].forEach((f, i) => tono(f, 0.2, { tipo: 'triangle', volumen: 0.09, retraso: i * 0.1 }));
    else if (puntos >= 800) [440, 523].forEach((f, i) => tono(f, 0.2, { tipo: 'triangle', volumen: 0.08, retraso: i * 0.12 }));
    else tono(220, 0.35, { tipo: 'sawtooth', volumen: 0.05, deslizar: 150 });
  },
  final() {
    [392, 523, 659, 784, 659, 784].forEach((f, i) => tono(f, 0.24, { tipo: 'triangle', volumen: 0.09, retraso: i * 0.12 }));
  },
  pop() {
    tono(880, 0.07, { tipo: 'sine', volumen: 0.06, deslizar: 1300 });
  },
};
