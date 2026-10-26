# Voz: canal del visor (pensamientos, nave, radio)

Cómo funciona hoy el canal de voz del visor (vuelo 2D en cliente, `src/game/*`). Qué es el canal para el jugador (escalera de oyentes, radio, aliens, PTT) vive en Notion [Voz](https://app.notion.com/p/3dfa554c3c40812bb79eee3fb015c23b). Este archivo dice qué está construido y qué reglas no se reabren en un PR.

Prosa en tuteo (tú). Las **Decisiones cerradas** son finales: no las reabras en un PR de implementación.

**El copy de líneas no está cerrado.** Las frases viven en Historia (Notion) y no se publican a GitHub hasta cerrarse ahí. En código, cada línea se referencia por id (`halley-01`, `thought-01`) y su texto sale de un manifest en `public/dev/` que solo se carga con `?dev`.

---

## El canal

Un canal de visor, varios oyentes, una sola UI: el strip bajo el visor. Eres el piloto; la nave es un aparato. Oyes y lees juntos: mute apaga el audio y deja el texto; reduced motion salta el pulso, no las palabras. Las landing cards siguen siendo voz del mundo (`flavorBody`, tercera persona) y no se mezclan con los pensamientos (primera persona).

No hay sintetizador. Las voces son clips pregrabados (Willow para Halley, Gus para el piloto, hechos con Grok) y quedan fuera del repo hasta cerrar el copy; los clips de ejemplo están en `public/dev/`.

| Tag | Qué suena | Filtro |
|---|---|---|
| `thought` | clip de audio (Gus) por evento, sin tick: primer despegue, primer aterrizaje, adrift, primer Camp en el scope; una vez por chart | pasa altos 58, low shelf 220 +4,2 dB, pasa bajos 2,9 kHz (tope) |
| `ship` | Halley en el CRT de cabina: clip de video + audio por la cadena de cabina; sin clip, imagen base (`public/halley/halley-base.jpg`) + estática | crusher + banda + drive + estática |
| `radio` | hiss + portadora, solo texto | bandpass + estático |
| `alien` | bed grave, solo texto (preview de timbre en `?dev`) | — |
| `static` | hiss, sin habla (radio abandoned) | — |

Halley reacciona al daño de la nave (señal, memoria corrupta, envelope del CRT) en `halley.ts`. Los pensamientos se disparan desde `pilot.ts` y suenan solo cuando el build tiene los clips; usan una cola, se marcan al arrancar y un clip que termina de decodificar después de un cambio de chart no arranca (`voiceSeq` en `audio.ts`).

Probe `?dev`: un botón por clip grabado, Halley (`halley-01`..`halley-04`, video) y el piloto (`thought-01`..`thought-06`, audio). El texto de cada botón sale de `public/dev/halley/manifest.json` y `public/dev/pilot/manifest.json`. No es PTT y no dispara eventos del mundo.

## Qué está y qué no

Está: visor (`FlightVisor` en `Overlay.tsx`), `OrbitHint`, landing cards, audio de cabina (spec CRT, life support), mute, reduced motion, cola + strip + probe `?dev`, Halley en el CRT con clips, pensamientos por evento.

No está: PTT, gramática de la nave, radio por rango, copy de Historia. Cuando se construya el canal de verdad: la cola sigue en `src/game/voice.ts` (`source` + `text` + `ttl`), se publica en `HudSnapshot`, se dibuja bajo el visor junto a `OrbitHint`, con beds de audio por source y triggers desde eventos que ya existen (takeoff, lock, land, adrift, comet enter, `settlement === "active"`).

---

## Decisiones cerradas

1. **El punto de vista es el piloto.** La nave es un aparato. First-person = visor de la craft 2D, no caminar en 3D.
2. **Un canal, varios oyentes.** No thought-log + consola + panel de radio + traductor.
3. **Oír y leer juntos.** Mute = audio off, texto on. Reduced motion no borra el texto.
4. **Pensamientos automáticos, por eventos.** Una línea por primer/estado, sin loop.
5. **Landing cards no se mezclan.** Siguen `flavorBody` (tercera persona). Pensamientos = primera persona.
6. **Una tecla PTT.** El rango decide radio vs nave. No tipear. No LLM. No árbol de diálogo que pause el yaw/burn.
7. **La radio lee occupancy** ([`occupancy.md`](occupancy.md)). Active contesta; abandoned = estático; unexplored = sin portadora; null = sin radio. Rango = lock o landed. No agrega campos.
8. **Aliens solo con una civ 2 con nombre.** No inventes radio alien ni campos de occupancy.
9. **Sin sintetizador.** El habla son clips pregrabados.
10. **El copy no está cerrado.** No publiques líneas a GitHub antes de cerrarlas en Historia.
11. **Abierto, no decidido:** la tecla PTT (`KeyV` es candidata) y el nombre de la nave.

## Qué no

- Cuatro UIs.
- Tipear, chat LLM o árboles RPG encima del vuelo.
- Clips grabados en hail, spool, yaw, burn, warp.
- Publicar copy a GitHub antes de Historia.
- Campos nuevos de occupancy, fuel alien, o el cometa como voz.

## Dónde está

`src/game/voice.ts`, `Overlay.tsx` (`VoiceStrip` / `VoiceProbe`), `audio.ts` (`playVoice`, `playHalleyMedia`, `playHalleyStatic`, `playThought`), `halley.ts`, `pilot.ts`, `draw.ts` (`drawHalley`), `runtime.ts` (`speakHalley`, `speakThought`). Tests: `voice.test.ts`, `halley.test.ts`, `pilot.test.ts`, en la lista explícita de `test` en `package.json`.
