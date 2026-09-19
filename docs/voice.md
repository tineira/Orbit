# Voz: canal del visor (pensamientos, nave, radio)

| Campo | Valor |
|---|---|
| **Autor** | Orbit |
| **Fecha** | 2026-09-18 |
| **Estado** | Locked |
| **Alcance** | Vuelo 2D en cliente (`src/game/*`). Headset del visor. Sin save de campaña, sin chat LLM, sin caminar en 3D. |

Lock del canal de voz del visor. Las **Decisiones cerradas** son finales: no las reabras en un PR de implementación. **El copy de líneas no está lockeado.** Las frases viven en Historia y no se publican a GitHub hasta que estén cerradas ahí.

Página canónica: [Voz](https://app.notion.com/p/3dfa554c3c40812bb79eee3fb015c23b) bajo Orbit `3d9a554c3c4081739622ed800df2f0f5`. Este archivo es un **espejo del lock de gameplay**, no un plan de PRs.

El **canal** está lockeado. El **habla** (qué motor, qué boca por tag) es **WIP** — ver abajo. El visor shipped muestra gauges, hints y landing cards. El habla solo vive en el probe `?dev`.

Hermanos: occupancy (`docs/occupancy.md`) — la radio **lee** `settlement` / `civ`, no agrega campos. Estética (Notion) — el canal es un instrumento de cabina. Combustible / Composición / Reabastecimiento / cometa siguen cerrados.

---

## Principio

Un canal de visor. Cuatro oyentes. No cuatro UIs.

Eres el piloto. La nave es un aparato. First-person es el visor de la craft 2D, no un FPS a pie. Siempre hay un headset. Lo que cambia es **quién puede contestar**.

Las landing cards siguen siendo voz del mundo (`flavorBody`, tercera persona). Los pensamientos son primera persona. No los mezcles.

Oyes y lees juntos. Mute apaga el audio; el texto queda. Reduced motion salta el pulso, no las palabras.

---

## Escalera

| Cuándo | Tag | Quién habla | El jugador habla |
|---|---|---|---|
| Desde el primer despegue | `thought` | tú, a ti | no — automático |
| Después del primer lock o aterrizaje | `ship` | el computador de cabina | después: hold-to-talk. Si no hay radio en rango, la tecla llega a la nave |
| Cerca de humanos active (Camp, Home, pad staffed) | `radio` | gente en ese cuerpo | la misma tecla; el rango elige al oyente |
| Cuando exista un civ 2 con nombre | `radio` (timbre distinto) | ellos | la misma tecla; quizá no se entiende todavía |

Camp es el primer beat de “otros humanos cerca”. Signal abandoned es el beat contrario: el mástil apunta, nadie contesta.

---

## Pensamientos

Automáticos. Sin tecla. Cortos. Por **primeros y estados**, no un chatterbox.

Audio seco, cerca, en la cabeza. Familia de instrumentos de cabina (no synth del mundo). La primera pasada puede ser texto + tick del visor, sin VO grabada.

Disparos (una línea, después silencio):

- primer despegue
- primer orbit lock
- primer aterrizaje
- tanque vacío / reloj adrift
- primer Camp en el scope
- warning del cometa
- warp / lost

No loop. No recordatorio cada órbita. Historia dueña de las frases; el runtime dueño de **cuándo** disparan.

Sabor procedural: la línea puede nombrar **este** Camp, y callar. No hay save de campaña.

---

## Nave

Mismo strip, tag `SHIP`. Instrumento de cabina: CRT, clip grabado. Hereda Estética, no Asteroids.

No es un chatbot. Gramática chica sobre estado del sim: órbita, combustible, casco, “nadie en ese mástil”.

**Hablarle** es hold-to-talk (no tipear, no menú). Una tecla, dos oyentes: radio si hay rango, si no la nave.

Se enciende como aparato después del primer lock Kepler o el primer aterrizaje. El arranque sigue siendo sólo tu cabeza.

---

## Radio

Readout de occupancy. No es un campo nuevo del mundo.

- **Active human** (Home, Camp, Workshop / Archive / Moon / Rock staffed): hay portadora, alguien contesta.
- **Abandoned:** pulsas, estático, nadie contesta.
- **Unexplored:** no hay portadora.
- **Star / giant / barycenter:** occupancy null → no hay radio.

Rango: **orbit lock o aterrizado en ese cuerpo**. No es un teléfono de espacio libre. Vuelas hasta ellos, después hablas.

No se pausa el vuelo. Una o dos réplicas cortas, y callan. Después puedes aterrizar y leer la card.

---

## Aliens

No ahora. `CivId` sigue siendo `"human"`. Occupancy ya pide nombre + una diferencia mecánica (el copy basta) antes de civ 2. Cuando exista, es el mismo PTT con otro timbre, no una UI nueva.

Hasta entonces la escalera es: pensamientos → nave → radio humana.

---

## Decisiones cerradas

1. **El punto de vista es el piloto.** La nave es un aparato. First-person = visor de la craft 2D, no caminar en 3D.
2. **Un canal, cuatro oyentes.** No thought-log + consola + panel de radio + traductor.
3. **Oír y leer juntos.** Mute = audio off, texto on. Reduced motion no borra el texto.
4. **Pensamientos primero, automáticos, por eventos.** Una línea por primer/estado.
5. **Landing cards no se mezclan.** Siguen `flavorBody` (tercera persona). Pensamientos = primera persona.
6. **Una tecla PTT.** El rango decide radio vs nave. No tipear. No LLM. No árbol de diálogo que pause el yaw/burn.
7. **Radio lee occupancy.** Active contesta; abandoned = estático; unexplored = sin portadora; null = sin radio. Rango = lock o landed. Camp es el primer beat humano.
8. **Aliens sólo con civ 2 nombrado.** No inventes radio alien ni campos de occupancy.
9. **Occupancy, Composición, Reabastecimiento, cometa y el default Asteroids no se reabren.** El canal hereda la familia CRT de cabina.
10. **Copy no está lockeada.** Las frases viven en Historia. No publiques líneas a GitHub hasta Decisiones cerradas ahí.
11. **Tecla PTT, nombre de la nave y VO grabada vs tick no están lockeados.** `KeyV` quedó libre al sacar verbose; es candidata, no decisión.
12. **Rollback es git revert.** No hay persistencia de “ya hablé con este Camp” entre charts.

---

## Qué no

- Cuatro UIs.
- Tipear, chat LLM, o árboles RPG encima del vuelo.
- Clips grabados en hail, spool, yaw, burn, warp.
- Caminar en un Camp en 3D. La radio es el beat social; el aterrizaje sigue siendo el pad 2D.
- Publicar copy a GitHub antes de Historia.
- Campos nuevos de occupancy, fuel alien, o el cometa como voz.

---

## Habla (WIP, 19 sep 2026)

No es una decisión cerrada. No reabras el lock del canal para pelear el motor. VO grabada vs tick sigue abierta.

Referencias de tono (no son assets, no se clonan):
- Roles: NEW ORBIT (BLACKISH, 2012) — tú a ti, computador frío, otra persona en radio.
- Pensamiento: *Memento*, escena “Okay, so what am I doing?” — bajo, cerca, inseguro, buscando. No un narrador seguro.

Motor actual del probe `?dev`: Kitten TTS nano ONNX (`KittenML/kitten-tts-nano-0.8`) en `src/game/speak.ts`. Mismas bocas en cada browser/OS. No Web Speech. No SAM. No la lengua del sistema. El WASM de onnxruntime-web se sirve desde jsDelivr `1.30.0`; un hilo (sin COI).

| Tag | Boca Kitten | Speed | Filtro |
|---|---|---|---|
| `thought` | Hugo | 0.8 | chest + in-head (lowshelf, lowpass ~1750) |
| `ship` | Bruno | 0.84 | speaker CRT |
| `radio` | Leo | 1.02 | bandpass + estático |
| `alien` | Kiki | 0.8 | ring |
| `static` | — | — | hiss, sin habla |

Probe: escribes una línea, eliges tag, Play. Strip en el visor + bed. Primera Play baja ~25 MB de Hugging Face y puede tardar; el panel dice “loading mouths…”. Si el habla falla, el error queda en el panel (no solo SFX). Mute deja el texto.

No es PTT. No dispara eventos del mundo. El copy de líneas sigue en Historia.

Archivos: `src/game/speak.ts`, `src/game/voice.ts`, `Overlay.tsx` (`VoiceStrip` / `VoiceProbe`), `audio.ts` (`playVoice`).

## Qué hay en código y qué no

Hecho: visor (`FlightVisor` en `Overlay.tsx`), `OrbitHint`, landing cards (`flavorBody`), occupancy `settlement` / `civ`, audio de cabina (spec CRT, life support), mute, reduced motion, cola + strip + probe `?dev` (WIP habla).

No ahora: PTT, gramática de la nave, radio por rango, pensamientos disparados por eventos, VO grabada, copy de Historia.

Cuando implementes el canal de verdad (no reabras este lock): deja la cola en `src/game/voice.ts` (`source` + `text` + `ttl`); publica en `HudSnapshot`; dibuja bajo el visor junto a `OrbitHint`; beds de audio por source; triggers desde eventos que ya existen (takeoff, lock, land, adrift, comet enter, `settlement === "active"`). El probe `?dev` sigue siendo probe. El motor de habla se decide aparte.
