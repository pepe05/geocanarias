// Visor de Street View mediante el iframe público de Google Maps (no necesita clave de API)

export function crearVisor({ iframe, bloqueo, cargando }) {
  let actual = null;
  let temporizador = null;

  const url = ({ pano, rumbo }) =>
    `https://www.google.com/maps/embed?pb=!4v${Date.now()}!6m8!1m7!1s${encodeURIComponent(pano)}!2m2!1d0!2d0!3f${rumbo ?? 0}!4f0!5f0.7820865974627469`;

  function cargar() {
    cargando.classList.remove('oculto');
    clearTimeout(temporizador);
    iframe.onload = () => {
      // el panorama tarda un poco más que el propio iframe en pintarse
      temporizador = setTimeout(() => cargando.classList.add('oculto'), 700);
    };
    iframe.src = url(actual);
  }

  return {
    mostrar(ubicacion, { congelado = false } = {}) {
      actual = { pano: ubicacion.pano, rumbo: ubicacion.rumbo };
      bloqueo.hidden = !congelado;
      cargar();
    },
    // Vuelve al punto y orientación de salida
    reiniciar() {
      if (actual) cargar();
    },
    vaciar() {
      actual = null;
      clearTimeout(temporizador);
      iframe.onload = null;
      iframe.src = 'about:blank';
    },
  };
}
