# Docs de Orbit (cómo funciona hoy)

Prosa en **tuteo** (tú / tienes / eres). Nunca voseo (vos / tenés / sos). Los identificadores de código quedan en inglés.

Dónde vive cada cosa:

- **Notion** [Orbit](https://app.notion.com/p/3d9a554c3c4081739622ed800df2f0f5): definición, gameplay, historia y estética. Empieza ahí para producto.
- **Linear** (proyecto Orbit): lo pendiente, y el plan de construcción de cada tarea (split de PRs, archivos, fases) en la descripción del issue.
- **Esta carpeta:** cómo funciona hoy lo que ya está en `main`. Si un doc discrepa del código, gana `src/game/`; arregla el doc en la misma sesión.

| Archivo | Qué cubre | Hermano en Notion (jugador) |
|---|---|---|
| [`campaign.md`](campaign.md) | Campaña guiada: recetas, fichas, tramos, puentes, disparadores, entregas, guardado, escalera de recarga y el modo aleatorio | [Construcción de mundos](https://app.notion.com/p/3f6a554c3c4081a89556d1ab58f82edf), [Mapa de la fase 1](https://app.notion.com/p/3f6a554c3c4081cf961ed0d9604d76fe) |
| [`comet.md`](comet.md) | Cometa: visitante del chart y su escena | [Cometa](https://app.notion.com/p/3dfa554c3c408183b66cd95df28a84da) |
| [`occupancy.md`](occupancy.md) | Settlement y civ en los cuerpos chartados: tipos, pesos, flags | [Mundos](https://app.notion.com/p/3dfa554c3c40810b838edf3fe5cceecd) |
| [`voice.md`](voice.md) | Canal de voz del visor: pensamientos, Halley en el CRT, radio, probe `?dev` | [Voz](https://app.notion.com/p/3dfa554c3c40812bb79eee3fb015c23b) |

No pongas planes de PRs, listas de archivos ni sketches de TypeScript aquí ni en Notion: van al issue de Linear. No pongas lore, copy de líneas ni tablas de producto cerradas aquí.

Los planes ya construidos se borraron de esta carpeta el 26 oct 2026. Siguen en la historia de git: [`docs/` en `8cf67e5`](https://github.com/tineira/Orbit/tree/8cf67e5/docs) (`worlds/` con las 11 fases y las instrucciones de Grok y agy, `art/` con el plan en 4 fases, las imágenes fuente y el código de la maqueta, y el `comet.md` original). El `todo.md` de la raíz pasó a Linear (TIN-80).
