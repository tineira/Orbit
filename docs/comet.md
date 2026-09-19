# Cometa: visitante del chart y rumbo leftover

| Campo | Valor |
|---|---|
| **Autor** | Orbit |
| **Fecha** | 2026-09-17 |
| **Estado** | Locked (flyby shipped; chase no) |
| **Alcance** | Vuelo 2D en cliente (`src/game/*`). Visitante del chart actual. Sin persistencia, sin sim de server. El minijuego de persecución **no** está especificado aquí. |

Lock para el jugador: Notion [Cometa](https://app.notion.com/p/3dfa554c3c408183b66cd95df28a84da). **Este archivo es el plan de implementación** (tipos, archivos, tests). No copies planes de PRs de vuelta a Notion.

Prosa en tuteo (tú). Se escribe **comet**, no commet. Las **Decisiones cerradas** son finales: no las reabras en un PR.

El minijuego (llegada, cámara, aterrizaje, escombros) **no** está lockeado. Lo único lockeado del destino: saltar al rumbo del cometa entra a un minijuego en vez de `createSystem`.

Hermanos: Combustible (Notion). Occupancy: `docs/occupancy.md`. El cometa no es un cuerpo de ese modelo.

---

## Qué es

Un actor del sim, no un `Planet`. Cruza el pozo en **15–25 s**, avisa, deja un rumbo warp rojo, y se va. En este chart no lo cazas: el núcleo no colisiona. Atraparlo es warp → minijuego.

Hasta que exista el spec del chase, el salto al rumbo es un **stub reservado**: no tira un sistema nuevo, no entra a lost, no te saca del chart.

---

## Decisiones cerradas

1. **Es un actor nuevo, no `Planet` / `PlanetKind`.** Occupancy, rieles Kepler, spectro, kickers y `padHasFuel` asumen `Planet`. Tipo en `src/game/types.ts` / `src/game/comet.ts`, stepped desde `Sim`, dibujado en su propio pass.
2. **Física tipo nave, no n-body.** El cometa **siente** `gravityAt` y `dragNear`. **No** entra a `gravityAt` como fuente. Sin `orbitR` / `orbitA` / `orbitW`.
3. **Inatrapable en este chart.** Cruce = `2 × getMinimapWorldR()` / 15–25 s (~864–1440 u/s en un chart de 10800; `WARP_JUMP_SPEED = 1500`). El núcleo **no** es target de `collidePlanets` aquí.
4. **Periapsis es un avistaje, no un segundo flare.** Piso lockeado: centro-núcleo a centro-estrella ≥ `COMET_PERI_CLEAR = 4.2 * star.radius + COMET_NUCLEUS_R`. El impact parameter `b` **es** esa cantidad.
5. **Cola iónica anti-estrella, no anti-velocidad.** El polvo sigue el rumbo (estela).
6. **El rumbo leftover es un token warp**, mismos verbos que una estrella vecina. `NearbyHeading.kind = "comet"` en el bearing de salida. Flecha roja + HUD warp. Queda el resto del chart, incluido reboot al pad.
7. **Discriminación por `kind` en headings, no un cono paralelo.** `NearbyHeading.kind: "star" | "comet"`. `warpHeadings(nearby, cometHeading)` concatena. El salto branch en `aim.kind === "comet"`. No lo metas en `ChartedSystem.nearby` como estrella falsa.
8. **Separación angular ~52° de los rumbos estrella.** `HEADING_MIN_SEP` y `angDiff` exportados de `world.ts`. `separateCometHeading` rota el **token**, no el path físico.
9. **Saltar a ese rumbo no llama `createSystem`.** Stub: no transit, no lost, no estrella al azar. Tira la velocidad bajo `WARP_JUMP_SPEED` para que el check no dispare cada frame.
10. **`KeyC` es el probe `?dev`; un tiro por chart.** `consumeComet() && devTools` (ese orden), luego `trySpawnComet(sim)` desde `sim.ts`. Fases `landed` | `flight`. Title / transit / crashed **sin gastar**. `rebootSim` **no** recarga. Warp a estrella y `createSim` / KeyN **sí**.
11. **SFX de entrada es one-shot al cruzar al chart, no al pulsar C.** No llames `audio.warn()`.
12. **Spawn natural queda para después; el flag `cometSpent` se comparte.** Primera pasada = sólo C. Después: a lo más un visitante por chart, no un timer.
13. **Reduced motion salta sólo la animación de cola.** Pip, flecha leftover y aviso quedan.
14. **Sin cloud rollout, sin reabrir occupancy.** Rollback es git revert. Civ en el cometa (HUSH, Descubrimiento) es un flag del **actor**, no PlanetKind.
15. **Combate del minijuego: sólo intención.** En el *chase*, el núcleo usa `LAND_SPEED` / `vn`. La cola es drag + ticks de casco. Números, cámara y layout **no** están lockeados.

---

## Constantes y módulos

- `COMET_RED = "#e24b3a"`
- `COMET_NUCLEUS_R = 27`
- `COMET_PERI_CLEAR(star) = 4.2 * star.radius + COMET_NUCLEUS_R`
- `COMET_CROSS_MIN_S = 15`, `COMET_CROSS_MAX_S = 25`

```ts
export type NearbyHeadingKind = "star" | "comet";

export type Comet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number; // nada lo siente; para un land futuro
};
```

En `Sim`: `comet`, `cometSpent`, `cometHeading`, `cometEntered`.

| Módulo | Qué hace |
|---|---|
| `src/game/comet.ts` | `COMET_RED`, `spawnComet`, `warpHeadings`, `separateCometHeading`, `makeCometHeading`. **No** importa `sim.ts` ni `draw.ts`. |
| `src/game/sim.ts` | `stepComet` (usa `dragNear` privado), `trySpawnComet`, `resetCometChart`. |
| `src/game/draw.ts` | Importa `COMET_RED` / `warpHeadings`. Pip, flecha, núcleo, cola. |
| `src/game/runtime.ts` | `consumeComet() && devTools` → `trySpawnComet`. `cometEnter` en el flanco `cometEntered`. |
| `src/game/audio.ts` | `cometEnter()`. No reuses `warn()`. |

`createSim` y el `punchWarp` a estrella llaman `resetCometChart`. `rebootSim` no. No resets desde `clearFlightLocks` / `enterWarp`.

`cometEntered` es sticky: se prende al cruzar `R` hacia adentro, nunca al pulsar C.

---

## Stub de warp

El sitio de salto usa `warpHeadings(nearby, cometHeading)`. Si `aim.kind === "comet"`: stub — no `enterWarp`, no `createSystem`, no lost, te quedas en `phase: "flight"`, dump de velocidad, `decayParticles` + `updateCamera` + `return`.

El HUD del cometa es **siempre** `COMET_RED`, nunca el verde `#7d9b86` de lock de estrella.

---

## Minijuego (TBD)

No implementes esto como si estuviera lockeado. El branch (no `createSystem`) **sí** lo está; el destino no.

1. Llegada — skip vs freno relativo, pose de drop-in.
2. Cámara — streaks a velocidad de warp.
3. Layout — misma estrella outbound vs chart ralo; escombros; aterrizaje-oasis vs one-way; spectro; takeoff.

F-1 no puede “llamar `enterWarp`”. El `enterWarp` de reduced-motion hoy corta a `punchWarp` → `createSystem`. Eso no puede pasar para `kind: "comet"`.

Descubrimiento de HUSH (Notion): aterrizar un cometa con civ **active**. El land es este chase. Flag de civ en el actor. Recarga de HUSH = Lagrange, no el flyby.

---

## PRs

1. **Shipped.** Actor + flyby + KeyC + pip. `comet.ts` no importa `sim.ts` / `draw.ts`.
2. **Shipped.** Rumbo leftover + stub que no llama `createSystem`.
3. **Shipped.** Núcleo, cola anti-estrella, sting de entrada.
4. **Bloqueado** en un spec escrito: chase. Reemplaza el stub.
5. **Después:** spawn natural, a lo más uno por chart (`cometSpent`).

Tests: `src/game/comet.test.ts` (y casos en `warp.test.ts`) en la lista explícita de `package.json`.
