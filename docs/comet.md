# Cometa

Para el jugador: Notion [Cometa](https://app.notion.com/p/3dfa554c3c408183b66cd95df28a84da). Este archivo describe cómo funciona hoy en `src/game/`; si discrepa del código, gana el código.

## Qué es

Un visitante del chart que no puedes atrapar: un actor `Comet` (no un `Planet`) que cruza el pozo más rápido que el warp, sin colisión, y al salir deja un rumbo warp rojo. Saltar a ese rumbo no tira un sistema nuevo: abre la escena del cometa (`sim.cometScene`), el núcleo en su propio marco, donde el único desafío es aterrizar. `createSystem` no entra en ese salto.

## En el chart

- **Física.** `stepComet` (`sim.ts`): siente `gravityAt` y `dragNear` como una nave, pero no es fuente de gravedad ni target de colisión. Gira con `NUCLEUS_OMEGA`, igual que en la escena.
- **Spawn de paso** (`spawnComet`): nace en `1.02 × getMinimapWorldR()` y cruza en `COMET_CROSS_MIN_S`–`COMET_CROSS_MAX_S` (15–25 s). Apunta para que el periapsis real (con la gravedad de la estrella) quede en `COMET_PERI_CLEAR`; prueba hasta 12 cuerdas, descarta las que cortan un gigante gaseoso y se queda con la más despejada de los cuerpos.
- **Spawn de salida** (`spawnLeavingComet`): ya dentro del chart (0,62–0,78 R), en una cuerda hacia afuera a `2R / 15 s`. No roza la estrella. Lo usa el chorro marcado de campaña.
- **`KeyC`** (solo con `?dev`): `consumeComet() && devTools` → `trySpawnComet`. Un tiro por chart (`cometSpent`), solo en fase `landed` o `flight`; title, transit y crashed no lo gastan. `rebootSim` no lo repone; `createSim`, un warp a estrella y todo rechart sí (`resetCometChart`). El actor de `KeyC` queda `unmarked`: en modo libre deja rumbo; en campaña no hereda la ficha del lugar, así que no deja rumbo.
- **Entrada.** `cometEntered` se prende al cruzar `R` hacia adentro y queda prendido. El runtime toca `audio.cometEnter()` en ese flanco, nunca al pulsar C ni con un cometa estacionado.
- **Rumbo leftover.** Cuando el cometa vuelve a cruzar `R` hacia afuera, `stepLiveComet` lo borra y, si `cometCardForHeading` lo permite, deja `sim.cometHeading = makeCometHeading(...)` con `kind: "comet"` en su bearing de salida, rotado por `separateCometHeading` para quedar a `HEADING_MIN_SEP` (52°) de cada rumbo estrella. Se suma a los de estrellas con `warpHeadings(nearby, cometHeading)`; no vive en `ChartedSystem.nearby`. Dura el resto del chart, reboot incluido.
- **Dibujo** (`comet-chart-draw.ts`): es la escena vista de lejos. `drawNucleusSprite` (misma forma, luz y giro) y `drawCometAtmosphere` (coma, polvo, columna de sombra). Bajo ~2,5 px en pantalla es un punto gris. `drawChartCometMark` pone esquinas rojas y `COMET`, o una flecha roja al borde si está fuera de vista (sigue el modo del HUD). `drawChartCometPath` puntea en rojo sus próximos 10 s (`predictCometPath`). En el minimapa es un pip `COMET_RED`; el rumbo va en `COMET_RED`, nunca en el verde de lock de estrella.
- **Reduced motion** no cambia el dibujo del cometa en el chart: pip, marca, trayectoria y rumbo quedan iguales.

## La escena

- **Entrar.** El warp de siempre al rumbo del cometa (`enterWarp`). En el golpe del tránsito, si `warpTarget.kind === "comet"`, `enterCometScene` abre la escena con el `scene` de la ficha (por defecto `inbound`). Con reduced motion, `enterWarp` va directo a la escena. Entrar borra el chart del cometa perseguido (`resetCometChart`).
- **Marco.** El núcleo (dos lóbulos, `NUCLEUS_LOBES`) queda quieto en el origen y gira a `NUCLEUS_OMEGA`. Sin estrella, sin planetas, sin su gravedad: solo la del núcleo (`NUCLEUS_GRAV_K / d²`). `stepSim` delega en `stepCometSim`.
- **Llegada.** `cometEntryPose`: siempre desde atrás, a `COMET_ENTRY_DIST` y a `COMET_ENTRY_SPEED` a lo largo de `COMET_TRAVEL`, que es el lado de día (`COMET_SUN` queda fijo en pantalla).
- **Cámara** (`cometCamera`): centrada en el núcleo. `cometViewUnits` va de `COMET_VIEW_UNITS_FAR` lejos a `COMET_VIEW_UNITS` junto al suelo, y siempre deja la nave dentro de `COMET_VIEW_KEEP` del medio ancho. El fondo son trazos a velocidad warp contra `COMET_TRAVEL`; con reduced motion casi no se mueven, no hay grano ni sacudida y salen menos cristales de gas.
- **Chorros.** Puntos fijos del núcleo, con periodo, fracción encendida y fuerza. Solo se encienden al sol; al pasar a la noche siguen soplando 4–11 s (retraso térmico) sin soltar rocas. Encendidos, empujan dentro de su cono y sueltan gas y rocas.
- **Estallidos.** Solo en el lado de día, cada ~`burstEvery` s, siempre con aviso previo (`BURST_WARN_S`).
- **Rocas.** Salen de chorros al sol y vuelan con la gravedad del núcleo; las lentas vuelven a caer y levantan un impacto. Pegan con la regla del cinturón (`hullDamage` de `hull.ts`). Rebotan en el casco; bajo 8 de cierre o al tercer golpe se deshacen, y una de radio ≥ 6 que pega a 40 o más se parte en 3 o 4.
- **Gas en el casco** (`sceneGasHits`): el hielo suelto solo suena; dentro del cono de un chorro o de un estallido el golpe daña (hasta ~4 golpes/s de 1 a 6).
- **Cueva** (solo `perihelion`, `cave` en `COMET_SCENES`): un tubo con piso donde no llegan chorros, estallidos, rocas ni sol; los bordes de la boca sí tienen respiraderos. Rozar las paredes desliza; un golpe sobre `LAND_SPEED` es choque.
- **Aterrizar.** Contacto con la superficie a menos de `LAND_SPEED` (30) relativo al suelo que gira: posado (`landedId = COMET_CRASH_NUCLEUS`). Si no, choque `comet-nucleus`.
- **Qué te daña.** Rocas y chorros sobre el casco. Solo el casco en 0 es choque (`comet-rocks`). No hay reparación en el núcleo (`hullSafeKind` da null). Un chorro o estallido bajo la nave posada la levanta (`ventUnderSite`).
- **Quedarse.** `scene.held` suma tiempo posado sin interrupción. Despegar o que un chorro te levante lo vuelve a cero. Con `COMET_HOLD_S` (120 s) el cometa frena dentro de la escena (`startArrival`, `COMET_ARRIVE_S`): los trazos se detienen y la luz gira hasta una estrella nueva adelante. Mientras frena no despegas ni te levantan los chorros; después sí. HUD: `HOLD`, `SITE DAY/NIGHT/CAVE`, `COMET DECELERATING`, `COMET IN ORBIT`.
- **Salir sin llegar.** Cruzar `COMET_SCENE_EDGE` a velocidad warp es el warp perdido (`warpOutOfScene`, `warpLost`); más lento, perdido en el espacio. Ambos terminan en choque `lost`.
- **Salir en órbita.** Con `scene.arrived`, cruzar el borde abre el sistema nuevo (`chartNewSystem`) y `parkComet` deja el cometa en un riel circular lento alrededor de la estrella (`PARKED_ORBIT`, 0,42–0,8 R, lejos de cada órbita; `stepParkedComet`). Posición y velocidad cruzan escaladas por `cometSceneScale`. `Comet.parked` guarda tipo, semilla, giro y `civ`/`ref`.
- **Volver a entrar.** A `COMET_REENTRY_DIST` escalado de un cometa estacionado, `tryEnterParkedComet` reabre su escena ya en órbita, donde estabas y a la misma velocidad, con la luz desde la estrella del chart. Cerca de él la cámara del chart pasa a la de la escena (`applyCometZoom`) y la escena usa el cielo del chart (`sceneSkyMix`, `COMET_ORBIT_VIGNETTE`), así cruzar es la misma imagen.
- **Choque.** `wreckInScene` → `breachHull`. El reboot cierra la escena; en campaña vuelves al checkpoint.
- **QA.** `?comet=perihelion|inbound|marked` arranca en la escena con motor Lumen y tanque lleno; `&landed` te posa anclado en el lado de día; `&hold=n` adelanta la espera.

## Ganchos de campaña

- **Ficha.** `StoryPlace` lleva `cometRequires`, `cometCiv`, `cometRef` y `cometScene`; `cometCardFromPlace` arma la `CometCard`. El rumbo copia la ficha en `NearbyHeading.comet`, y la escena la lee como `sim.cometMark`.
- **Cuándo aparece el rumbo.** `cometCardForHeading`: en modo libre siempre; en campaña solo si el lugar (o el actor) tiene ficha y `cometRequireMet` se cumple. En `phase1.ts`, E (`star-massive-1`) pide `{ fuel: "lumen" }` y F (`star-f`) pide `{ module: "hushDetector" }`.
- **Roces de E** (`spawnCampaignComet`): un cometa de paso a la vez. Si el roce no deja rumbo, espera `COMET_GRAZE_GAP_S` (8 s) y manda otro, hasta que uno lo deje.
- **Chorro marcado de F** (`civ` o `scene: "marked"`): manda cometas de salida, uno a la vez. Sin el flag `hushMarked` salen `unmarked` y no dejan rumbo; con él llevan la ficha, y `markLeavingComet` marca el que ya va saliendo.
- **`landedFor`.** Posado en un cometa con `ref`, `noteCometLanded` empuja `{ on: "landedFor", ref, seconds }` una vez por estadía, cuando `held` alcanza los segundos del trigger; despegar lo rearma. Si el trigger trae `revealHeading`, ese lugar espera hasta `scene.arrived` y entonces `beginCometStoryJump` hace warp allí.
- **Checkpoint en la llegada.** Ese salto marca `cometRideCheckpoint`; al llegar (`arriveInSystem`), `commitArrivalCheckpoint` guarda el lugar, posado en un cuerpo sólido sin historia propia. Con reduced motion también.
- **HUSH en un cometa civ.** Aterrizar con `cometMark.civ` y el módulo `hushDetector` llama `deliverHush` (`refill.ts`). `civ` es flag del actor, no un `PlanetKind`.

## Decisiones cerradas

1. Se escribe **comet**, no commet.
2. Es un actor propio (`Comet` en `types.ts`), no `Planet` / `PlanetKind`; occupancy no lo ve.
3. Física tipo nave: siente gravedad y drag, no es fuente de gravedad.
4. Inatrapable en el chart: más rápido que el warp y sin colisión. Se llega solo por su rumbo.
5. El periapsis queda fuera de `COMET_PERI_CLEAR`: es un avistaje, no un flare.
6. El rumbo es un token warp con `kind: "comet"` en `NearbyHeading`, no una estrella falsa en `nearby`; se separa de las estrellas rotando el token, no la trayectoria.
7. Saltar al rumbo nunca llama `createSystem`: abre la escena.
8. En la escena no hay estrella ni planetas ni su gravedad; el único desafío es aterrizar bajo `LAND_SPEED`.
9. Siempre entras desde atrás, por el lado de día.
10. Sin reparación en el núcleo.
11. El aviso sonoro de entrada es un one-shot al cruzar al chart; nunca al pulsar C ni al volver a un cometa estacionado.
12. Un cometa estacionado no se va del sistema: va en riel, no con gravedad libre.

## Constantes

| Constante | Valor | Archivo |
|---|---|---|
| `COMET_RED` | `#e24b3a` | `comet.ts` |
| `COMET_NUCLEUS_R` | 27 (radio en el chart) | `comet.ts` |
| `COMET_CROSS_MIN_S` / `MAX_S` | 15 / 25 | `comet.ts` |
| `COMET_PERI_CLEAR(star)` | `4.2 × star.radius + COMET_NUCLEUS_R` | `comet.ts` |
| `HEADING_MIN_SEP` | 52° | `world.ts` |
| `COMET_GRAZE_GAP_S` | 8 | `sim.ts` |
| `NUCLEUS_R` / `NUCLEUS_OMEGA` / `NUCLEUS_GRAV_K` | 78 / 0,11 rad/s / 1,6e5 | `comet-scene.ts` |
| `COMET_ENTRY_DIST` / `COMET_ENTRY_SPEED` | 640 / 70 | `comet-scene.ts` |
| `COMET_SCENE_EDGE` / `COMET_REENTRY_DIST` | 1100 / 1000 | `comet-scene.ts` |
| `COMET_VIEW_UNITS` / `COMET_VIEW_UNITS_FAR` | 640 / 1500 | `comet-scene.ts` |
| `COMET_HOLD_S` / `COMET_ARRIVE_S` | 120 / 14 | `comet-scene.ts` |
| `COMET_SCENES` | `perihelion` (E): 7 chorros, cueva · `inbound` (defecto): 5 · `marked` (G): 3 | `comet-scene.ts` |

## Dónde está

| Archivo | Qué hace |
|---|---|
| `src/game/comet.ts` | Spawns, `warpHeadings`, `makeCometHeading`, `separateCometHeading`, `cometRequireMet`. No importa `sim.ts` ni `draw.ts`. |
| `src/game/comet-scene.ts` | Estado y paso de la escena: núcleo, chorros, rocas, estallidos, cueva, golpes, llegada, pose de entrada. |
| `src/game/comet-scene-draw.ts` | Todo el dibujo de la escena y el HUD de la escena; `drawNucleusSprite` y `drawCometAtmosphere` los comparte el chart. |
| `src/game/comet-chart-draw.ts` | El cometa en el chart: núcleo, marca, trayectoria, sombra sobre la nave. |
| `src/game/sim.ts` | `stepComet`, `trySpawnComet`, `resetCometChart`, spawns de campaña, `enterCometScene`, `stepCometSim`, estacionar y volver a entrar, `landedFor`, checkpoint de llegada. |
| `src/game/runtime.ts` | `KeyC` con `?dev`, `applyDebugComet`, `audio.cometEnter`. |
| `src/game/place.ts`, `campaign/phase1.ts`, `triggers.ts`, `refill.ts` | Ficha del cometa, lugares E y F, trigger `landedFor`, `deliverHush`. |

Tests: `src/game/comet.test.ts` (actor, `KeyC`, rumbo, salto), `comet-scene.test.ts` (la escena), `comet-story.test.ts` (fichas, HUSH, `landedFor`, checkpoint) y `warp.test.ts`. Todo test nuevo va en la lista explícita de `test` en `package.json`, o no corre.
