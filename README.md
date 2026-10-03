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

Puedes seleccionar cualquiera de los **88 municipios**, combinar varios y buscarlos por nombre.
La Graciosa se incluye en Teguise y sigue pudiéndose elegir como isla independiente. Al filtrar
municipios, el mapa y la escala de puntuación se ajustan al territorio elegido.

En *Ajustes personalizados* puedes elegir **1, 3, 5, 10, 15, 20 o 30 rondas**, tiempos de **15 segundos
a 10 minutos o sin límite**, reparto equilibrado entre islas o azar total, orientación inicial de
carretera/aleatoria/norte y pistas de isla o municipio. Online, la cuenta atrás tras la primera respuesta
puede durar 10, 15, 30 o 60 segundos, o desactivarse.
Solo entran en la clasificación las partidas de 5 rondas con dificultad estándar, sin filtro municipal
ni pista de municipio, con reparto equilibrado y orientación de carretera.

**Tu última chincheta cuenta al agotarse el tiempo**, aunque no pulses Adivinar. Puedes arrastrarla.
Online se guarda en el servidor mientras la mueves; también se usa al forzar el fin o si te desconectas
después de que el servidor la haya recibido. Al reconectar se recupera tu chincheta. Los rivales no la ven
hasta los resultados. Sin chincheta, la ronda vale 0 puntos.

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

**La forma rápida (Windows):** doble clic en `Publicar.bat`. La primera vez instala GitHub CLI si hace
falta, te pide iniciar sesión en GitHub, crea el repositorio, lo sube y abre Render para que pulses
**Deploy Blueprint**. Las siguientes veces solo sube tus cambios y Render actualiza el juego solo.

**A mano:**

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

**Por defecto las ubicaciones son totalmente aleatorias**: cada partida saca lugares nuevos al azar de
todo el territorio elegido (islas o municipios), comprobando que tengan Street View oficial.
El servidor:

- sortea puntos uniformemente por la superficie real de cada isla o municipio (o junto a un pueblo
  si pides zonas urbanas) y busca el panorama más cercano (`servidor/explorador.js`);
- mantiene en segundo plano una **reserva** de lugares recién descubiertos por isla, para que la
  partida empiece al instante; si la reserva no basta (por ejemplo, con un municipio concreto),
  busca en directo unos segundos;
- añade todo lo que descubre al banco (`datos-servidor/ubicaciones-extra.json`), que crece solo;
- si Street View no respondiera, completa la partida con el banco sin repetir y lo avisa.

`/api/estado` muestra cuántos lugares hay en la reserva y si ha habido algún error al buscarlos:
útil para comprobar en Render que todo funciona.

En *Ajustes personalizados → De dónde salen los lugares* puedes elegir **Solo el banco** si prefieres
lugares ya conocidos.

### El banco

`public/data/ubicaciones.json` es el banco de respaldo, con cobertura oficial comprobada, repartido
por las 8 islas y clasificado en urbano/rural. Para añadirle más lugares al azar (sin borrar nada):

```bash
npm run ampliar-banco -- --nuevas 5000
```

`npm run generar-datos` lo regenera desde cero con el método original (tarda bastante más).

El historial ya no se recorta a 500 lugares ni se borra cuando quedan pocos. Se comprueban ID,
panorama y coordenadas; cada partida reserva sus ubicaciones para impedir repeticiones entre pestañas,
salas y revanchas. Online se excluye el historial de todos los participantes; los jugadores nuevos
entran en la sala de espera o al terminar la partida. El navegador conserva el historial local y el
servidor lo guarda en `datos-servidor/historiales.json` junto con los panoramas descubiertos.

La búsqueda respeta siempre isla, municipio y tipo de zona: nunca cambia de zona ni repite para
completar una partida. Sin servidor (hosting estático) solo se puede usar el banco incluido.

Los municipios proceden del [portal del Gobierno de Canarias / SITCAN](https://datos.canarias.es/catalogos/general/dataset/islas-y-municipios/resource/694f039d-c3d4-4802-af42-25562b37c577).
Son límites sin carácter oficial, adecuados para este juego. `npm run generar-municipios` actualiza
el catálogo y la asignación de cada ubicación. Los contornos completos se usan en el servidor y el
navegador descarga solo el catálogo reducido. Conserva `datos-servidor/` para mantener los historiales
al desplegar; un hosting con disco efímero puede perderlos al reiniciar.

Ejecuta `npm test` para verificar la selección sin repeticiones, los filtros, la generación y el guardado
de chinchetas con conexiones reales de multijugador.

## Estructura

```
server.js                 servidor Express + Socket.IO
servidor/salas.js         lógica de las salas online (el servidor controla tiempo y puntos)
servidor/clasificacion.js clasificación global (recalcula la puntuación en el servidor)
servidor/explorador.js    descubre panoramas al azar dentro del territorio elegido
servidor/ubicaciones.js   catálogo: reserva en segundo plano, historial sin repeticiones y banco
public/index.html         todas las pantallas del juego
public/js/nucleo.js       reglas compartidas por cliente y servidor: dificultades, puntuación, selección
public/js/…               pantallas, mapas (Leaflet), visor de Street View, modos solo y online
public/data/              islas y ubicaciones
tools/ampliar-banco.mjs   añade lugares aleatorios al banco de respaldo
tools/generar-datos.mjs   generador original del banco de ubicaciones
```

## Limitaciones conocidas

- El visor público de Street View no permite ocultar los nombres de calle pintados sobre el asfalto
  ni el modo "sin moverse pero girando" de GeoGuessr; por eso el modo difícil de verdad es el *Congelado*.
- Las ubicaciones aleatorias se buscan en un servicio no documentado de Google. Si algún día deja de
  funcionar (o bloquea al servidor del hosting), el juego sigue funcionando con el banco y
  `/api/estado` muestra el error.
- El modo solitario funciona también sin servidor (por ejemplo, subiendo `public/` a un hosting
  estático), pero entonces no hay modo online ni clasificación global.
