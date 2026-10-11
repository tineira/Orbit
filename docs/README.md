# Docs de Orbit (implementación)

Prosa en **tuteo** (tú / tienes / eres). Nunca voseo (vos / tenés / sos). Los identificadores de código quedan en inglés.

Notion guarda **definición, gameplay e historia**. Esta carpeta guarda **cómo se construye**: tipos, archivos, tests, split de PRs.

Espacio canónico: [Orbit](https://app.notion.com/p/3d9a554c3c4081739622ed800df2f0f5). Empieza ahí para producto. Empieza aquí antes de un PR.

| Archivo | Qué es | Hermano en Notion (jugador) |
|---|---|---|
| `occupancy.md` | Tipos settlement / civ, pesos, flags | [Mundos](https://app.notion.com/p/3dfa554c3c40810b838edf3fe5cceecd) |
| `comet.md` | Actor visitante, rumbo leftover, KeyC | [Cometa](https://app.notion.com/p/3dfa554c3c408183b66cd95df28a84da) |
| `voice.md` | Espejo del lock del canal del visor. Habla: clips pregrabados (Halley en CRT, pensamientos del piloto), sin sintetizador; los clips viven fuera del repo. El copy de líneas no va a GitHub. | [Voz](https://app.notion.com/p/3dfa554c3c40812bb79eee3fb015c23b) |
| `art/README.md` | Plan en 4 fases para llevar la dirección de arte al juego (nave, Halley, pensamientos, planetas nivel 2), con sprite, imagen base y código de la maqueta en `art/`. Los clips de voz quedan fuera hasta cerrar el copy | [Estética](https://app.notion.com/p/3dca554c3c4081e688cfd840bc142f62) |
| `worlds/README.md` | Spec de mundos guiados: recetas, fichas, tramos, puentes, campaña con guardado, escalera de recarga y chart del cometa, en 10 fases. Lo implementa Grok (`worlds/GROK.md`) y lo valida agy (`worlds/AGY.md`) | [Construcción de mundos](https://app.notion.com/p/3f6a554c3c4081a89556d1ab58f82edf), [Mapa de la fase 1](https://app.notion.com/p/3f6a554c3c4081cf961ed0d9604d76fe) |

No pongas planes de PRs, listas de archivos ni sketches de TypeScript en Notion. No pongas lore, copy de líneas ni tablas de producto cerradas aquí.

Hechos de runtime: gana `src/game/` si una nota discrepa del código.
