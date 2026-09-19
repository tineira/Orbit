# Occupancy: settlement y civilización en cuerpos chartados

| Campo | Valor |
|---|---|
| **Autor** | Orbit |
| **Fecha** | 2026-09-17 |
| **Estado** | Locked (shipped) |
| **Alcance** | Vuelo 2D en cliente (`src/game/*`). Charting procedural local. Sin persistencia de occupancy, sin sim de server, sin occupancy multiplayer. |

Catálogo para el jugador: Notion [Mundos](https://app.notion.com/p/3dfa554c3c40810b838edf3fe5cceecd) (con fotos). **Este archivo es el lock de implementación** (tipos, pesos, flags). No copies planes de PRs de vuelta a Notion.

Prosa en tuteo (tú). Las **Decisiones cerradas** son finales: no las reabras en un PR.

---

## Qué es

Cada `Planet` carga dos campos planos, ortogonales al `kicker`:

- `settlement`: `active` · `abandoned` · `unexplored` · `null`
- `civ`: hoy `"human"` o `null`

`settlement` manda servicios (pad de metano). `civ` manda sabor y, más tarde, compatibilidad. `kicker` sigue siendo una etiqueta corta (`Home`, `Camp`, `Moon`…). Occupancy es verdad del mundo, chartada en `makeSystem` y se descarta con el sistema; lo que sabe el jugador sigue en `scannedIds`.

`null` / `null` es para lo que no es superficie: estrella, gigante, baricentro. Un shard sí es superficie: siempre `unexplored`.

Código: `src/game/occupancy.ts`, `src/game/world.ts` (`assignOccupancy`), `src/game/types.ts`.

---

## Decisiones cerradas

1. **Dos campos planos, no una unión etiquetada `Occupancy`.** `Planet` ya es un struct ancho. Los invariantes los prueba `occupancyLegal`, no sólo el typechecker.
2. **`settlement` manda servicios; `civ` manda sabor; `kicker` es etiqueta.** `padHasFuel` lee settlement. Las recetas de materia siguen por kicker / kind. Occupancy no elige mixes.
3. **Occupancy es verdad del mundo. `scannedIds` es conocimiento del jugador.** El spectro no *es* el campo civ.
4. **`unexplored` más un civ es ilegal.** Ruinas de civ desconocida son un follow-up, no un abuso de unexplored.
5. **Fuel es civilización. Hull es geología.** `padHasFuel(p) === (p.settlement === "active")`. El casco se repara en cualquier aterrizaje (y en órbita / Lagrange).
6. **Catálogo cerrado `CivId` desde el día uno.** Persiste `"human"`. Nunca `"civ1"` / `"civ2"`. Civ 2 necesita un id estable con nombre.
7. **Primera pasada: sólo human.** Agregar civ 2 es un id nuevo + tabla de copy, no un rewrite de `Planet`.
8. **Shards son `unexplored`, no `null`.** `null` queda para star / gas / barycenter.
9. **`?belt` sólo fuerza cinturón.** El Camp natural sigue `rng() < 0.2` en el primary. `?camp` fuerza cinturón + Camp. `makeSystem` trata `flags.camp === true` como `wantBelt = true`.
10. **Materia sigue por kicker / kind.** Un Workshop abandoned sigue siendo hierro.
11. **Sin feature-flag service.** Rollback es git revert. Debug = URL (`?camp`, `?settlement=`, `?dev`).
12. **Occupancy es un segundo paso al final de `makeSystem`.** Después de kind / kicker / landable / matter. No mezcles el roll de Camp / `extraLand` con settlement.
13. **Kicker es clave invariante para Home / Camp / Shard.** `occupancyLegal` lee `kicker` y `landable`. `padHasFuel` no.
14. **Asteroide occupancy es un camp de mina en el pad.** Active y abandoned landable comparten derricks. Unexplored y shards no tienen torres.
15. **Rocoso occupancy es luz en el lado noche.** Active: clusters ámbar en la umbra (Home el más denso). Abandoned: las mismas manzanas oscuras al día. Unexplored: disco virgen. Sin derricks ni beacons rojos.
16. **Luna occupancy es un solo outpost** en el limbo (pad, hábitat, mástil). No una ciudad. Active brilla de noche. Abandoned es el mismo cluster en carbón.

---

## Modelo

```ts
export type Settlement = "active" | "abandoned" | "unexplored";
export type CivId = "human"; // catálogo cerrado; ids con nombre después

// en Planet
settlement: Settlement | null; // null = star / gas / barycenter
civ: CivId | null;             // null salvo active o abandoned
```

| Settlement | `civ` | Significado |
|---|---|---|
| `unexplored` | `null` | Sin rastros. |
| `abandoned` | obligatorio | Pad vacío, constructores identificables. |
| `active` | obligatorio | Esa civ está ahora. |
| `null` | `null` | No es superficie. |

Invariantes (`occupancyLegal`, tests por seed y fixtures ilegales):

- `kind ∈ {star, gas, barycenter}` ⇒ `settlement == null && civ == null`
- `kind ∈ {rocky, moon, asteroid}` ⇒ `settlement != null`
- `unexplored` ⇒ `civ == null`
- `active` | `abandoned` ⇒ `civ != null`
- Home ⇒ `{ active, human }`
- Camp ⇒ `{ active, human }`
- Shard (`!landable` o `kicker === "Shard"`) ⇒ `{ unexplored, null }`
- `Rock` + `active` es **legal** (debug `?settlement=active`). No lo renombres a Camp.

`isGhostBody` sigue siendo `kind === "barycenter"`. No lo reuses para pads abandoned.

### Quién lee qué

| Campo | Lo lee | No lo lee |
|---|---|---|
| `settlement` | `padHasFuel`, luces del pad | recetas de materia, `scannedIds`, hull |
| `civ` | tabla de copy, más tarde fittings | `padHasFuel` en v1 |
| `kicker` | lista del título, ceja de landing card, `rockyProfileId`, Home / Camp / Shard en `occupancyLegal` | `padHasFuel` |
| `landable` | aterrizaje vs crash, shards en `occupancyLegal` | `padHasFuel` |

Helpers en `src/game/occupancy.ts`: `isOccupiableKind`, `occupancyLegal`, `padHasFuel`, `rollSettlement`, `flavorBody`. Producción: `sim.ts` importa `padHasFuel`. `runtime.ts` sigue llamando `shipIsRefueling(sim)` — no le agregues ese import.

---

## Pesos naturales

Segundo paso, después del roll de Camp / `extraLand`. Home y Camp ignoran `?settlement=`. Shard también.

| Cuerpo | Active | Abandoned | Unexplored |
|---|---|---|---|
| Home | siempre human | nunca | nunca |
| Workshop / Signal / Archive / Twin | 25% | 40% | 35% |
| Luna | 3% | 12% | 85% |
| Camp | siempre human | nunca | nunca |
| Rock landable | no natural (legal en debug) | 8% | 92% |
| Shard | nunca | nunca | siempre |
| Star / gas / bary | — | — | occupancy null |

Twins: occupancy **independiente** en cada cuerpo.

---

## Flags de chart (URL, persisten al warp)

| Flag | Efecto |
|---|---|
| `?belt` | Fuerza cinturón. No fuerza Camp. |
| `?camp` | Fuerza cinturón + Camp lit. |
| `?twins` / `?twins=tight` | Fuerza un par. |
| `?settlement=active\|abandoned\|unexplored` | Override en landables que no sean Home / Camp / Shard. |
| `?mine` / `mine=active` | Camp lit. |
| `?mine=abandoned` | Cinturón, sin Camp, Rock muerto. |
| `?mine=both` | Camp + extra Rock wrecked. |

`flags.camp === true` implica belt. `{ camp: true, belt: false }` igual arma cinturón con Camp. `{ camp: true, settlement: "abandoned" }` deja el Camp active y seca el resto.

---

## Copy

`flavorBody` es un lookup kicker × settlement × civ. Clave faltante **tira**. Las frases se escriben en el PR de charting y se revisan como prosa, no como arquitectura. Landing card: kicker + body. Lista del título: kicker. El spectro no publica occupancy.

---

## Qué no

- Un segundo `CivId` en este lock.
- Ruinas de civ desconocida, occupancy mixto en un cuerpo, fuel alien.
- Gating de hull repair por settlement.
- Occupancy en estrellas, gigantes o baricentros.
- Persistir occupancy entre reloads, warps o usuarios.
- Enseñar `rockyProfileId` a leer settlement.
- Un widget HUD de occupancy.

---

## PRs (ya shipped)

1. Tipos + helpers + stub pass 2: `padHasFuel` lee `settlement === "active"`. Sin pesos nuevos ni flags.
2. Charting + copy + flags + prueba de pad seco: `assignOccupancy`, `?camp`, `?settlement=`, hull sigue reparando en pad seco.

Código: `src/game/occupancy.ts`, `src/game/occupancy.test.ts`, `src/game/world.ts`, `src/game/sim.ts`. Tests en la lista explícita de `package.json`.
