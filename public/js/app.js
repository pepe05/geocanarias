// Punto de entrada: carga los datos y conecta pantallas y modos de juego

import { $, $$, aviso, almacen, mostrarPantalla } from './ui.js';
import { cargarDatos } from './datos.js';
import { normalizarConfig, nombreDificultad } from './nucleo.js';
import { crearMapaIslas } from './mapa-islas.js';
import { crearConfigPartida } from './config-partida.js';
import { crearPantallaJuego } from './juego.js';
import { crearResultados } from './resultados.js';
import { crearModoSolo, puntuaEnClasificacion } from './solo.js';
import { crearModoOnline } from './online.js';
import { crearPantallaClasificacion } from './clasificacion.js';
import { sonido } from './sonido.js';

const NOMBRES_GUANCHES = [
  'Tanausú', 'Bentejuí', 'Guacimara', 'Tinguaro', 'Dácil', 'Beneharo', 'Arminda', 'Tenesor',
  'Guayarmina', 'Doramas', 'Hupalupa', 'Chimidas', 'Jonay', 'Gara', 'Bencomo', 'Acaymo',
  'Ayoze', 'Iballa', 'Echedey', 'Yeray', 'Ancor', 'Nauzet', 'Idaira', 'Airam',
];

// Se registra antes de cargar nada para no perder el aviso de instalación del navegador
let avisoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  avisoInstalar = e;
  $('#btn-instalar').hidden = false;
});

async function iniciar() {
  let datos;
  try {
    datos = await cargarDatos();
  } catch (e) {
    console.error(e);
    document.body.innerHTML = `
      <div style="padding:40px;max-width:560px;margin:auto;font-family:system-ui;color:#fff;line-height:1.6">
        <h2>No se pudieron cargar los datos del juego</h2>
        <p>Abre el juego a través del servidor: en la carpeta del proyecto ejecuta <code>npm install</code> y
        luego <code>npm start</code>, y entra en <strong>http://localhost:3000</strong>.</p>
      </div>`;
    return;
  }

  // ---------- nombre del jugador ----------
  const camposNombre = [$('#nombre-jugador'), $('#nombre-online')];
  let nombre = almacen.leer('nombre');
  if (!nombre) {
    nombre = NOMBRES_GUANCHES[Math.floor(Math.random() * NOMBRES_GUANCHES.length)];
    almacen.escribir('nombre', nombre);
  }
  for (const campo of camposNombre) {
    campo.value = nombre;
    campo.addEventListener('input', () => {
      for (const otro of camposNombre) if (otro !== campo) otro.value = campo.value;
      almacen.escribir('nombre', campo.value.trim());
    });
  }
  const nombreJugador = () => camposNombre[0].value.trim().slice(0, 20) || 'Jugador';

  // ---------- portada ----------
  crearMapaIslas($('#inicio-mapa'), datos.islas);
  const btnSonido = $('#btn-sonido');
  const pintarSonido = () => (btnSonido.textContent = sonido.activo ? '🔊' : '🔇');
  pintarSonido();
  btnSonido.addEventListener('click', () => {
    sonido.alternar();
    pintarSonido();
    sonido.marcar();
  });

  // ---------- instalar como app (Android: aviso del navegador; iPhone: instrucciones) ----------
  const btnInstalar = $('#btn-instalar');
  const yaInstalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (esIOS && !yaInstalada) btnInstalar.hidden = false;
  btnInstalar.addEventListener('click', async () => {
    if (avisoInstalar) {
      avisoInstalar.prompt();
      await avisoInstalar.userChoice;
      avisoInstalar = null;
      btnInstalar.hidden = true;
    } else if (esIOS) {
      aviso('En Safari pulsa el botón Compartir ⬆️ y después «Añadir a pantalla de inicio».', '', 7000);
    }
  });

  // ---------- módulos ----------
  const juego = crearPantallaJuego({ datos });
  const resultados = crearResultados({ datos });
  const clasificacion = crearPantallaClasificacion({ datos });

  const irInicio = () => mostrarPantalla('inicio');

  let editorSolo = null;
  function abrirConfigSolo() {
    if (!editorSolo) {
      editorSolo = crearConfigPartida($('#config-solo'), {
        islas: datos.islas,
        islaPorId: datos.islaPorId,
        config: normalizarConfig(almacen.leer('configSolo') || {}),
        alCambiar: (cfg) => {
          almacen.escribir('configSolo', cfg);
          pintarNotaClasificacion(cfg);
        },
      });
    }
    pintarNotaClasificacion(editorSolo.obtener());
    mostrarPantalla('config');
  }

  function pintarNotaClasificacion(cfg) {
    $('#nota-clasificacion').textContent = puntuaEnClasificacion(cfg)
      ? `🏆 Esta partida puntúa en la clasificación (${nombreDificultad(cfg.dificultad)}).`
      : 'ℹ️ Solo puntúan en la clasificación las partidas de 5 rondas con una dificultad estándar.';
  }

  const solo = crearModoSolo({
    datos,
    juego,
    resultados,
    nombreJugador,
    alSalir: irInicio,
    alConfigurar: abrirConfigSolo,
  });

  const online = crearModoOnline({ datos, juego, resultados, nombreJugador, alSalir: irInicio });

  // ---------- navegación ----------
  let servidorDisponible = null;
  async function comprobarServidor() {
    if (servidorDisponible !== null) return servidorDisponible;
    try {
      const r = await fetch('api/estado', { cache: 'no-store' });
      servidorDisponible = r.ok;
    } catch {
      servidorDisponible = false;
    }
    return servidorDisponible;
  }

  async function abrirOnline() {
    mostrarPantalla('online');
    const ok = await comprobarServidor();
    $('#aviso-sin-servidor').hidden = ok;
    $('#btn-crear-sala').disabled = !ok;
    $$('#form-unirse button, #form-unirse input').forEach((e) => (e.disabled = !ok));
  }

  const acciones = {
    'ir-inicio': irInicio,
    'ir-solo': abrirConfigSolo,
    'ir-online': abrirOnline,
    'ir-clasificacion': () => clasificacion.abrir(),
    'salir-sala': () => online.salir(),
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (b && acciones[b.dataset.accion]) acciones[b.dataset.accion]();
  });

  $('#btn-empezar-solo').addEventListener('click', () => {
    const cfg = editorSolo.obtener();
    almacen.escribir('configSolo', cfg);
    solo.empezar(cfg);
  });

  // ---------- enlaces de invitación y recargas ----------
  const params = new URLSearchParams(location.search);
  const salaEnlace = params.get('sala');
  if (await online.reanudar()) return;
  if (salaEnlace) {
    await abrirOnline();
    $('#codigo-sala').value = salaEnlace.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    aviso(`Te han invitado a la sala ${$('#codigo-sala').value}. Revisa tu nombre y pulsa «Entrar».`, '', 6000);
    $('#form-unirse button').focus();
  }
}

iniciar();
