# 🌋 GeoCanarias

Un GeoGuessr de las Islas Canarias. Apareces en un punto de Street View y tienes que adivinar dónde estás
poniendo una chincheta en el mapa. Cuanto más cerca, más puntos (máximo 5.000 por ronda).

- **Elige las islas**: cualquier combinación de El Hierro, La Palma, La Gomera, Tenerife, Gran Canaria,
  Fuerteventura, Lanzarote y La Graciosa.
- **4 dificultades** (y ajustes personalizados): tiempo por ronda, moverse o no, pueblos o zonas rurales, pista de isla.
- **Multijugador online**: crea una sala, comparte el código de 4 letras y competid en las mismas ubicaciones.
- **Clasificación global** de las partidas en solitario.

No necesita ninguna clave de API: usa el visor público de Street View de Google y los mapas de OpenStreetMap.

## Cómo jugar

Si ya está publicado en Internet (ver más abajo), basta con abrir su dirección en cualquier navegador.
Para arrancarlo en tu ordenador necesitas [Node.js](https://nodejs.org) 20 o superior.

**En Windows:** doble clic en `Jugar.bat`. La primera vez instala lo necesario y abre el navegador.

**Desde la terminal:**

```bash
npm install
```

```bash
npm start
```

Y abre <http://localhost:3000>.

### Dificultades

| Dificultad | Movimiento | Tiempo | Lugares | Pista |
|---|---|---|---|---|
| 🌴 Fácil | Libre | Sin límite | Pueblos y ciudades | Te dice la isla |
| 🌋 Normal | Libre | 3 min | Mezcla | — |
| 🦎 Difícil | Libre | 90 s | Zonas rurales | — |
| 🔥 Extremo | Congelado (sin mover, girar ni zoom) | 45 s | Mezcla | — |

En *Ajustes personalizados* puedes cambiar cada cosa por separado y elegir 3, 5 o 10 rondas.
Solo entran en la clasificación las partidas de 5 rondas con una dificultad estándar.

La puntuación depende del tamaño de la zona elegida: fallar por 5 km en todo el archipiélago da muchos
más puntos que fallar por 5 km jugando solo en La Gomera.

Atajos: **Espacio** o **Enter** para adivinar, **R** para volver al punto de salida.

## Jugar online con amigos

1. Uno crea la sala en **Multijugador online → Crear sala** y elige islas y dificultad.
2. Los demás entran con el código de 4 letras o con el enlace de invitación.
3. Todos ven las mismas ubicaciones. Cuando alguien adivina, al resto le quedan 15 segundos
   (se puede desactivar). Al final hay podio y el anfitrión puede lanzar la revancha.

Si alguien recarga la página, vuelve a la sala automáticamente con sus puntos.

## Publicarlo en Internet (gratis)

Para que cualquiera juegue desde el móvil, esté donde esté y sin instalar nada, el juego se publica en
[Render](https://render.com), que tiene un plan gratuito con soporte para las salas online.
El repositorio ya trae un `render.yaml` con toda la configuración.

1. Sube esta carpeta a un repositorio de GitHub.
2. Entra en `https://render.com/deploy?repo=URL_DE_TU_REPOSITORIO` (por ejemplo
   `https://render.com/deploy?repo=https://github.com/tu-usuario/geocanarias`), inicia sesión con tu
   cuenta de GitHub y pulsa **Deploy Blueprint**.
3. En un par de minutos tendrás una dirección tipo `https://geocanarias.onrender.com`.
   Esa es la que compartes. Cada vez que subas cambios a GitHub, Render actualiza el juego solo.

Cosas del plan gratuito de Render:

- Si nadie juega durante 15 minutos el servidor se duerme, y la siguiente visita tarda cerca de
  un minuto en cargar. Mientras hay una sala abierta, el propio juego lo mantiene despierto.
- La clasificación global se borra cuando Render reinicia o actualiza el servicio.

### En el móvil

- Se juega desde el navegador (Chrome, Safari…), sin descargar nada.
- En la sala, el botón **Invitar a mis amigos** abre el menú de compartir del móvil (WhatsApp, Telegram…).
- Se puede **añadir a la pantalla de inicio** y se abre a pantalla completa como una app:
  en Android con el botón *Instalar como app* de la portada; en iPhone con *Compartir → Añadir a pantalla de inicio*.

### Otras formas de jugar online

- **En la misma wifi**: al hacer `npm start` la consola muestra una dirección tipo
  `http://192.168.1.35:3000` que tus amigos pueden abrir. Si no carga, permite Node.js en el Firewall de Windows.
- **Por Internet desde tu ordenador**, sin publicar nada: con el juego arrancado, un túnel de Cloudflare
  (`winget install Cloudflare.cloudflared` y luego `cloudflared tunnel --url http://localhost:3000`)
  te da una dirección `https://….trycloudflare.com` que funciona mientras tu ordenador esté encendido.

## Las ubicaciones

`public/data/ubicaciones.json` trae unas 1.700 ubicaciones con cobertura oficial de Street View comprobada,
repartidas por las 8 islas y clasificadas en urbanas y rurales. Para generar un banco nuevo
(tarda unos minutos):

```bash
npm run generar-datos
```

El script descarga los contornos de las islas y los núcleos de población de OpenStreetMap y busca
panoramas de Street View al azar dentro de cada isla. Los objetivos por isla están al principio de
`tools/generar-datos.mjs`.

## Estructura

```
server.js                 servidor Express + Socket.IO
servidor/salas.js         lógica de las salas online (el servidor controla tiempo y puntos)
servidor/clasificacion.js clasificación global (recalcula la puntuación en el servidor)
public/index.html         todas las pantallas del juego
public/js/nucleo.js       reglas compartidas por cliente y servidor: dificultades, puntuación, selección
public/js/…               pantallas, mapas (Leaflet), visor de Street View, modos solo y online
public/data/              islas y ubicaciones
tools/generar-datos.mjs   generador del banco de ubicaciones
```

## Limitaciones conocidas

- El visor público de Street View no permite ocultar los nombres de calle pintados sobre el asfalto
  ni el modo "sin moverse pero girando" de GeoGuessr; por eso el modo difícil de verdad es el *Congelado*.
- La lista de ubicaciones se genera desde un servicio no documentado de Google. Si algún día deja de
  funcionar, el juego sigue funcionando con las ubicaciones ya generadas.
- El modo solitario funciona también sin servidor (por ejemplo, subiendo `public/` a un hosting
  estático), pero entonces no hay modo online ni clasificación global.
