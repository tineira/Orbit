# Orbit: llevar la dirección de arte al juego (4 fases)

Plan para la sesión de desarrollo. La parte creativa (historia, líneas, decisiones de look) vive en Notion. Aquí está **cómo construirlo**.

Prosa en tuteo. Identificadores en inglés. Todo texto dentro del juego, en inglés.

## Antes de empezar

- **Lee `AGENTS.md` del repo.** Commit y push solo cuando Tomás lo pida en ese momento. El video lo genera Grok con Imagine, en su sesión, sin la API. El texto hablado (text to speech, mp3) también se lo pides a Grok, y ahí sí usa `XAI_API_KEY` de `.env.local`. Imágenes, ruidos y música los crea cada agente como decida. El gate local es `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`. Después de un push a `main`, el turno termina cuando el deploy de producción de Vercel está Ready.
- **Una fase = un PR**, en este orden. Cada fase deja el juego jugable.
- **Fuentes de verdad:**
  - Notion [Estética](https://app.notion.com/p/3dca554c3c4081e688cfd840bc142f62), bloque "Cerrado (Tomás, 11 oct 2026)": el look decidido y los valores.
  - Notion [Voz](https://app.notion.com/p/3dfa554c3c40812bb79eee3fb015c23b): el lock del canal del visor. No se reabre.
  - Notion [Voz de Halley (borrador)](https://app.notion.com/p/3f6a554c3c4081779185cc70ea9a27fa): voces Willow y Gus, líneas grabadas, tope del filtro de pensamiento.
  - Maqueta funcionando: https://claude.ai/artifact/62CDjBekQd32xYaY1AGekc. Su código, sin los datos embebidos ni el copy, está en `docs/art/reference/`.
- **Regla que no se rompe:** los eclipses entre cuerpos se quedan tal cual. `stampBodyShadows`, `pointUmbra` y `pointUmbraMax` en `src/game/draw.ts` no se tocan, y todo lo nuevo (nave, planetas) se oscurece con la sombra igual que hoy.
- **Ojo con el copy:** el lock de Voz deja el copy de líneas en Historia. Tomás pidió (11 oct 2026) subir los clips de ejemplo a `public/dev/` para probarlos en producción. El juego solo lee esos manifests con `?dev`. La imagen quieta de Halley sigue en `public/halley/halley-base.jpg`.

## Archivos

| Ruta | Qué es |
|---|---|
| `docs/art/ship/perihelion-hauler.png` | Sprite de la nave, recortado con alfa, 114×240, proa arriba |
| `docs/art/ship/perihelion-hauler-source.png` | Imagen original de Tomás, por si hay que recortar a más resolución |
| `docs/art/halley/halley-base.jpg` | Imagen base de Halley (Grok). Se ve cuando no hay clip |
| `docs/art/reference/prototype-*.js` | Código de la maqueta: el filtro CRT, el envelope de encendido, la cadena de audio, el bitcrusher y el shader de planetas |
| `public/dev/halley/halley-01..04` | 4 clips de ejemplo de Halley, 480×480, ~6 s, voz Willow. Hay mp4 (H.264/AAC) y webm (VP9/Opus) porque Chromium sin códecs propietarios no lee mp4 |
| `public/dev/pilot/thought-01..06` | 6 pensamientos de ejemplo del piloto, solo audio, recortados, voz Gus (m4a y webm) |

La imagen y el sprite de referencia se copian a `public/`. Los clips de ejemplo ya están en `public/dev/`.

`public/sounds/tv-onoff.*` ya existe en el repo.

---

## Fase 1: la nave

**Objetivo.** La flecha pasa a ser el carguero de Perihelion de Tomás, con el casco aclarado y sin halo. Se oscurece en la sombra igual que hoy.

**Dónde.** `drawShip` en `src/game/draw.ts`, y el sprite copiado de `docs/art/ship/` a `public/` (por ejemplo `public/sprites/perihelion-hauler.png`).

**Cómo.**
- Carga el sprite una vez y dibújalo centrado, rotado con el yaw de la nave y escalado al tamaño visual de la nave actual, sin cambiar `SHIP_HULL`, que es el radio de colisión.
- Aplica el aclarado al dibujarlo: `ctx.filter = "brightness(1.75) contrast(1.15)"`. Es el valor que eligió Tomás. También puedes hornearlo en el PNG.
- Oscurecimiento por sombra: usa el mismo `dim = 1 - 0.72 * umbra` que ya usa `drawShip`. Dibuja en un canvas offscreen y aplica `source-atop` con `rgba(7,8,12, 1-dim)`, así solo se oscurece la nave y no el fondo.
- Conserva lo que ya existe alrededor: llama de empuje, rayo de luz en tránsito, crash, `sinkAlpha` y lock bars. Sobre el sprite, la llama sale de dos motores en ±0,2 del ancho, desde la cola.
- Luces de navegación: roja a babor y verde a estribor, con parpadeo lento. Si `sim.reducedMotion`, sin parpadeo.
- **Cerrado (Tomás, 11 oct 2026):** con el casco bajo 50 % (`sim.ship.hull < HULL_MAX / 2`), la variante "as found": una muesca oscura en el costado derecho y una chispa intermitente, y se apaga la luz verde. Está en la maqueta y en `src/game/ship-sprite.ts`.

**Listo cuando.** Se ve la nave en vuelo, aterrizada y en órbita. Al pasar por la sombra de un cuerpo se oscurece como antes. El gate local pasa.

**No toques.** Física, colisiones y la lógica de eclipses.

**Wreck (11 oct 2026).** `drawWreckSprite`: el carguero partido en cuatro rectángulos del sprite (proa, flanco a babor, flanco a estribor, cola), carbonizados, con la misma dispersión por `wreckSeed` que tenía la flecha. `drawWreck` queda solo como respaldo si el sprite no cargó.

---

## Fase 2: Halley en la cabina

**Objetivo.** Un panel CRT verde con la cara de Halley, en la columna de abajo a la derecha, sobre el mass spec y con su misma carcasa. Se enciende para hablar, habla y se apaga. La imagen y la voz empeoran con el daño de la nave.

**Dónde.** `src/game/draw.ts` (layout junto a `spectroLayout`, dibujo del CRT), `src/game/audio.ts` (cadena de voz `ship`, clip de TV) y `src/game/voice.ts` (cola). Los clips van a `public/dev/halley/`.

**Layout.** Mismo ancho que el mass spec y alto ≈ 1,25 × su alto, apilado encima con el mismo `gap`. En móvil (`!map.desktop`), decide con Tomás. Etiqueta arriba: `HAL-E 07`.

**Filtro CRT** (ver `drawCRT` en `docs/art/reference/prototype-main.js`). Es solo composición, sin leer píxeles, así que sirve con `<video>`:
1. Dibuja la imagen o el video en franjas horizontales de 3 px, cada una desplazada por:
   - una onda lenta: `sin(y*.03 + t*.0021) * w*.012`;
   - un ripple: `sin(y*.21 + t*.019) * w*.004`;
   - bandas de corte (tears): 1 a 3 por época de 260 ms;
   - a veces, un tirón de sincronismo.

   Todo multiplicado por `hdist`.
2. Composición, en este orden:
   - `saturation` con `#808080`, para pasar a gris;
   - `multiply` con `#5cff8a`, el fósforo;
   - `screen` con `rgba(10,40,18,.55)`, para levantar los negros.
3. Encima van:
   - un glow;
   - scanlines (`rgba(0,0,0,.38)` cada 3 px);
   - una barra que rueda;
   - ruido de puntos (`noise`);
   - una viñeta;
   - el bisel.

**Valores fijos (Tomás).** Zoom 1, encuadre horizontal 0,5, vertical 0,35, ruido 1.

**Daño → señal.** Usa `d = 1 - sim.hull / HULL_MAX` e interpola linealmente:

| | d = 0 (sana) | d = 1 (peor) |
|---|---|---|
| distorsión horizontal | 0,13 | 1 |
| estática (audio) | 0,06 | 0,16 |
| distorsión digital (audio) | 0,10 | 0,89 |

- Con `d > 0,5`, la imagen se pierde a ratos: en cada ventana de 140 ms, se pierde con probabilidad `(d - 0,5) * 0,5` y se ve solo ruido.
- Con `d ≥ 0,6`, **memoria corrupta**. Un chequeo cada 280 ms, desde el primer segundo del clip:
  - **Congelar imagen:** con probabilidad `(d - 0,55) * 0,3`, se congela el cuadro actual entre 0,6 y 1,3 s mientras el audio sigue.
  - **Retroceder:** si no, con probabilidad `(d - 0,55) * 0,35`, el clip retrocede entre 0,4 y 1,3 s (`currentTime -= …`) y repite imagen y voz. Como máximo `1 + round((d - 0,6) * 7,5)` saltos por clip.
  - Cada salto o congelada dispara un corte grande de 160 ms.

**Encendido y apagado.** Igual que el mass spec: reutiliza su envelope (punto → línea → imagen con destello; al apagar, imagen → línea → punto que queda → oscuro) y el clip `tv-onoff` (encendido: cabeza 0,6 s; apagado: 0,75 s desde 2,88 s, como `spectroPower`).
- El panel no está en pantalla mientras Halley no habla. Abrir el mass spec no lo muestra. El mass spec conserva su clic de encendido, el barrido y el ping. Cuando ella habla, el panel aparece con su propio clic y su audio, y se apaga. Con el mass spec abierto se apila encima; apagado, ocupa su hueco.
- Secuencia: encender, y 600 ms después arranca el clip. Al terminar, se apaga 250 ms después.
- Con `reducedMotion`, sin animación de encendido.

**Audio de Halley** (ver `playClip` y `makeCrush` en `docs/art/reference/prototype-main.js`).
- **Cadena:** media element → crusher → pasa altos 320 Hz → peaking 1,9 kHz, Q 1,1, +5 dB → pasa bajos 3,4 kHz, Q 0,8 → waveshaper `tanh(2,2x)` → ganancia 1,15.
- **Estática:** ruido en bucle por un pasa banda de 2,6 kHz, Q 0,6, con ganancia base `0,01 × estática`. Mientras habla hay chasquidos: 15 % cada 120 ms, sube a 3× la base y vuelve en 50 ms. Se corta al terminar.
- **Crusher:** en el juego hazlo como AudioWorklet; la maqueta usa ScriptProcessor. Con intensidad `a`:
  - niveles `2^(16 - 12a)`;
  - sample-and-hold de `1 + floor(a²·14)` muestras;
  - cada 256 muestras, con probabilidad `a·0,004` un silencio y con otra `a·0,004` un tartamudeo (repite ~600 muestras atrás), de 20 a 80 ms.
- Todo pasa por el bus `sfx`, así Mute lo apaga y el texto queda (lock de Voz).

**Voz `ship`.** Halley es mujer: voz Willow en los clips. El sintetizador Kitten (`src/game/speak.ts`) se eliminó; el juego no sintetiza voz.
- Si la línea tiene clip, reproduce el clip.
- Si no, no hay voz sintética (Tomás, 11 oct 2026: solo clips pregrabados). El panel se enciende con la imagen base, suena la estática de cabina y queda el subtítulo.
- El subtítulo de `ship` va en verde (`rgba(140,255,170,.9)`); el de `thought`, en blanco (`rgba(236,234,228,.92)`).

**Créditos.** Agrega "Claudia is an open character by anabology (claudia.gallery)" y un aviso de que las imágenes y voces de Halley y del piloto se generaron con IA.

**Listo cuando.**
- El panel aparece, se enciende y habla un clip por un trigger (para empezar, `halley-01`, el aviso de aterrizaje rápido) y se apaga.
- Con el casco bajo se ve y se oye roto.
- Mute deja el texto.
- El gate pasa.

**No toques.** El mass spec y su lógica. El lock de Voz: un canal, sin chat, sin LLM.

**Estado (11 oct 2026).** Implementada. Los clips de ejemplo están en `public/dev/halley/` y solo se cargan con `?dev`. Lo que hay:
- `src/game/halley.ts`: señal por daño, pérdida de imagen, memoria corrupta, envelope CRT, tears. Con test.
- `src/game/draw.ts` `drawHalley` + `halleyLayout`: el panel solo se dibuja mientras habla (y en el apagado). Apilado sobre el mass spec; si el mass spec está apagado, ocupa su hueco (no flota sobre un agujero). **Móvil (decidido 11 oct 2026, visto con el canvas a 400 px):** Halley va a la izquierda del minimapa, en el hueco del mass spec, con su ancho y 1,25× su alto; con el mass spec encendido se apila encima. Se acorta hasta lo que cabe y se oculta bajo 48 px.
- `src/game/audio.ts`: `makeCabinChain` (crusher en `public/audio/crush-worklet.js`, banda, drive, estática con chasquidos), `playHalleyMedia` para clips y `playHalleyStatic` para una línea sin clip. Sin TTS: `kitten-tts-js` salió de `package.json`.
- `src/game/runtime.ts` `speakHalley`: encender → 600 ms → clip (o imagen base + estática por el TTL del texto) → fin → 250 ms → apagar. Congelar / retroceder por `halleyCorruptStep`. Trigger `halley-01` en el primer `status === "too-fast"` del chart, solo si el build tiene el clip.
- Clips: `public/dev/halley/<id>.mp4|webm` + `public/dev/halley/manifest.json` (`{ "halley-01": { "text": "…" } }`). El manifest se lee solo en `?dev`. En el probe, cada clip de Halley es un botón. Una línea de nave sin clip sigue siendo imagen base + estática + subtítulo, pero el probe ya no la escribe a mano.
- Créditos en la pantalla de título (`Overlay.tsx`).

---

## Fase 3: pensamientos del piloto

**Objetivo.** Las líneas del piloto, voz Gus, suenan secas y cerca, una vez por "primera vez", como define el lock de Voz.

**Dónde.** `src/game/voice.ts` (cola `source + text + ttl`), `src/game/audio.ts` (cadena `thought`), triggers desde eventos que ya existen en `runtime.ts` / `sim.ts`, y clips en `public/dev/pilot/`.

**Filtro (tope de Tomás).** Es más suave que el filtro `thought` actual del juego, que usa 70 Hz, +5,5 dB y 1,75 kHz. Reemplázalo por:
- pasa altos 58 Hz;
- low shelf 220 Hz, +4,2 dB;
- pasa bajos 2,9 kHz, Q 0,55.

Ese es el máximo: nunca más filtrado.

**Triggers propuestos** (una vez por partida; no hay save de campaña):

| Evento | Clip |
|---|---|
| primer despegue | `thought-01` |
| primer aterrizaje | `thought-02` |
| tanque vacío / reloj adrift | `thought-03` |
| primer Camp en el scope (`settlement === "active"`) | `thought-04` |
| `thought-05`, `thought-06` | sin trigger aún: dependen de la historia (estación de Perihelion). Déjalos cargados en `?dev` |

Una línea a la vez, sin loop. Si Halley está hablando, el pensamiento espera.

**Listo cuando.** Cada trigger suena una vez con su subtítulo blanco, Mute deja el texto y el gate pasa.

**Estado (11 oct 2026).** Implementada. Los clips de ejemplo están en `public/dev/pilot/` y solo se cargan con `?dev`.
- `src/game/pilot.ts`: ids, urls, el tope del filtro (`PILOT_FILTER`), la tabla trigger → clip y `pilotTriggerFor` (bordes, una por chart, adrift primero). Con test.
- `src/game/audio.ts` `playThought(id)`: el clip solo, sin tick del visor (Tomás, 11 oct 2026), por pasa altos 58 → low shelf 220 +4,2 dB → pasa bajos 2,9 kHz Q 0,55 → `sfx`. Carga `/dev/pilot/<id>.webm` y cae a `.m4a`.
- `src/game/runtime.ts` `speakThought`: si Halley está encendida, el pensamiento espera y sale cuando su panel se apaga. Triggers por frame desde `phase`, `landedId`, `adrift` y `nearest` (Camp activo con `status !== "deep"`), solo si el build tiene el clip.
- Clips: `public/dev/pilot/thought-01..06.webm|m4a` + `public/dev/pilot/manifest.json` (`{ "thought-01": { "text": "…" } }`). En el probe, cada pensamiento es un botón. `thought-05` y `thought-06` no tienen trigger de juego: solo salen de ahí.

---

## Fase 4: planetas nivel 2

**Objetivo.** Los cuerpos ganan textura de superficie, borde de luz, nubes, atmósfera y anillos (Sobrio+). Camp tiene luces nocturnas tenues. La luz de la roca abandonada gira con la roca.

**Dónde.** `drawPlanet` en `src/game/draw.ts`. El shader de referencia es `planetImg` en `docs/art/reference/prototype-helpers.js`.

**Cómo.**
- Render por cuerpo a un `OffscreenCanvas`, con ruido fbm, iluminación por la dirección de la estrella, borde de luz, nubes y atmósfera. Cachea por cuerpo + bucket de radio en pantalla + paso de giro, para no re-renderizar cada frame.
- **Luces de Camp, solo en el lado nocturno:**
  - aparecen donde `lit < 0,06`;
  - grilla `lon * 110`, umbral de hash `> 0,95`, cluster `> 0,6`;
  - solo con `|lat| < 0,6`;
  - intensidad × 0,45.

  Tienen que verse pocas y apagadas.
- **Torre de la roca abandonada:** la luz rota con el giro de la roca, pulsa y se esconde detrás del borde. Ver "abandoned rock with its tower" en `docs/art/reference/prototype-main.js`: el giro avanza en pasos de 400 ms para reusar el cache.
- Los eclipses van encima, sin cambios: `stampBodyShadows` sigue dibujando la sombra sobre el cuerpo ya texturizado.
- Con `reducedMotion`, sin giro animado.

**Rendimiento.** Mide los fps antes y después en una laptop normal con muchos cuerpos en pantalla. Si baja, achica la resolución del cache o el número de octavas de ruido.

**Listo cuando.**
- Los cuerpos se ven como en la maqueta.
- Los eclipses se ven igual que antes, y lo compruebas con capturas antes/después.
- Los fps se mantienen.
- El gate pasa.

**Estado (11 oct 2026).** Implementada con una diferencia de arquitectura respecto a la maqueta: el mundo es top-down, así que la textura de una roca gira **en el plano** con `p.rotate` (como ya giran sus pads y sedes) y la dibuja la GPU; solo la iluminación es por píxel.
- `src/game/surface.ts` (puro, con test): ruido, `albedoDisk` (dos tonos + grano + cráteres), `cloudDisk`, `lightsDisk` (luces nocturnas, grilla rala, × 0,3), `gasStrip` + `gasDisk` (bandas equirect, giran por pasos de 0,05 rad), `shadeLayers` (sombra multiply, borde de luz aditivo, máscara de noche), `hasRings`, `beaconAlpha`.
- `src/game/draw.ts` `drawSurface`: capas cacheadas **una vez por cuerpo** a resolución fija (`surfaceResolution`: 256 px de radio para rocas grandes, 160 chicas, 128 lunas, 160 el gigante) y escaladas al zoom; la sombra se recalcula solo cuando la dirección de la estrella cambia de paso (96 pasos). Composición: albedo girado → nubes (giran algo más rápido) → sombra `multiply` → borde `lighter` → luces nocturnas enmascaradas por la noche. Anillos en la mitad de los gigantes, mitad trasera bajo el disco y delantera encima. Faro de roca abandonada: solo en el lado nocturno, pulsa, gira con la roca.
- Los eclipses (`stampBodyShadows`) van encima, sin cambios. La estrella y los asteroides (siluetas irregulares) siguen como estaban.
- Coste medido en node: casa 256 px ≈ 190 ms una vez; el resto ≈ 50 ms por cuerpo, al primer dibujo.
- Con `reducedMotion`: el gigante no gira y el faro no pulsa. La textura de las rocas sí gira, porque los pads giran igual.
- Verificado el 11 oct 2026 con la pestaña visible: casa en el pad, luna con cráteres, gigante con anillos, 60 fps en vuelo, y un eclipse real (la luna `cinder` dentro de la umbra de `vesper`) con la sombra estampada encima de la textura igual que antes.

---

## Revisión (11 oct 2026)

Reviewer de otro harness (Grok 4.7) sobre el diff completo de las cuatro fases: ocho hallazgos, todos aplicados. Los tres bugs: un clip del piloto que terminaba de decodificar después de un cambio de chart arrancaba igual (ahora `audio.ts` lleva un `voiceSeq` que cada `stopVoice` incrementa y el clip no arranca si cambió); `stopVoice` no paraba a Halley porque `cabinChain` nunca se asignaba (ahora sí); un pensamiento se marcaba como disparado antes de sonar y una sola ranura de espera perdía líneas (ahora hay cola, se marca al arrancar, y un frame con dos bordes conserva los dos). Riesgos: el gigante re-muestreaba sus bandas aunque estuviera fuera de pantalla (ahora hay cull por vista, un solo cuerpo construye textura por frame, paso de giro 0,05 rad y radio 160); el `<video>` de Halley vivía fuera del DOM (Safari deja `videoWidth` en 0) y no se liberaba al terminar (ahora va oculto en el body y se quita al apagar). Detalles: la imagen base sigue en `public/halley/`; los clips de ejemplo van en `public/dev/` y solo se cargan con `?dev`. El subtítulo de `ship` usa el fósforo exacto y el crédito nombra la voz del piloto.

## Pendientes del lado creativo (no bloquean)

- La estrella del pelo de Halley está del mismo lado que el mechón; en el canon de Claudia va del lado contrario. Cuando Tomás regenere la imagen y los clips, solo cambian los assets.
- Más líneas para Halley y el piloto, por momento del juego. Se escriben en Notion y se graban con Grok (Willow / Gus).
- El umbral de la nave dañada (fase 1) y el layout móvil del panel (fase 2) ya están cerrados.
