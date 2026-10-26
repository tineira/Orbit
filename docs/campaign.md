# Campaña guiada

Cómo funciona hoy la campaña en el código. No es un plan: si algo no está aquí, no existe todavía. Si este doc y `src/game/` discrepan, gana el código; arregla el doc en la misma sesión.

Qué es el juego: Notion [Construcción de mundos](https://app.notion.com/p/3f6a554c3c4081a89556d1ab58f82edf) · [Mapa de la fase 1](https://app.notion.com/p/3f6a554c3c4081cf961ed0d9604d76fe) · [Combustible](https://app.notion.com/p/3dba554c3c4081f8829df66b443c2ffe) · [Reabastecimiento](https://app.notion.com/p/3dfa554c3c4081c6bd7dc072bbcc99fa) · [Descubrimiento](https://app.notion.com/p/3e0a554c3c40819f9fe7c20f610b01b2).

## Qué es

La campaña es una ruta fija sobre el mismo motor del modo aleatorio. Hay **fichas** (lugares de historia con semilla fija y cuerpos retocados) unidas por **tramos** (cadenas de sistemas generados con una receta y garantías). Cada ficha tiene disparadores que dejan marcas, instalan entregas y revelan el rumbo a la siguiente. La nave que ganas en una ficha es la que puede cruzar el tramo que sigue. Todo se guarda en `localStorage` con un checkpoint al que vuelves si chocas.

## Cómo entras hoy

| URL | Qué pasa (`runtime.ts`, `begin`) |
|---|---|
| sin parámetros | Modo aleatorio. La campaña no existe (`sim.campaign === null`) y nada lee ni escribe el guardado. |
| `?campaign` (`=1`, `=on`, cualquier valor salvo `0`/`off`/`false`) | `campaignFromSearch` da `true`. Si hay guardado válido, lo retoma en su checkpoint (`applyCampaignBoot`). Si no, abre una campaña nueva en un sistema aleatorio con Home habitada, sin ficha ni tramo, así que no aparece ningún rumbo de ruta. |
| `?campaign&place=<id>` | `placeFromSearch` fuerza una ficha. Si el guardado es de esa misma ficha y semilla, la retoma (`resumePlaceSave`); si no, empieza una campaña nueva en esa ficha y pisa el guardado. Así empieza la fase 1: `?campaign&place=star-a`. Un id desconocido lanza un error en dev. `place` sin `campaign` se ignora. |
| `?campaign&place=probe` | Puerta de prueba (`PROBE_PLACE`, `PROBE_LEG`, `PROBE_END` en `place.ts`/`leg.ts`). No es historia. |
| `?dev` | Funciona en los dos modos. Carga los manifests de voz (ver Copy). |
| `?twins`, `?belt`, `?camp`, `?star=`, `?settlement=`, `?mine=` | Flags de debug del chart. `createSystem` los lee de la URL en cualquier modo y los mezcla **debajo** de la receta (`recipeFromChartFlags`); no apagan la campaña. |

`?free` no existe todavía. Hacer de la campaña el modo por defecto (`/` empieza o retoma la campaña, `?free` para el aleatorio) está pendiente en Linear, **TIN-89**.

## Glosario

| Notion | Código | Qué es |
|---|---|---|
| Receta | `Recipe` (`world.ts`) | Reglas para tirar un sistema. Campo ausente = se tira como el modo aleatorio |
| Ficha | `StoryPlace` (`place.ts`) | Semilla fija + receta + `bodies` (cambios por cuerpo) + `triggers` |
| Tramo | `Leg` (`leg.ts`) | Sistemas generados entre dos fichas, con receta base y pasos especiales |
| Puente | `LegStep.bridge` | Paso seco para el grado del tramo (`Leg.fuel`) |
| Marca | `CampaignFlag` (`campaign.ts`) | String que la campaña recuerda para siempre |
| Disparador | `Trigger` (`triggers.ts`) | Evento + condición (`when`) → efectos |
| Entrega | `Grant` (`campaign.ts`) | Motor, estanque o módulo que se instala |
| Campaña | `CampaignState` (`campaign.ts`) | Estado vivo + checkpoint congelado |

## Modelo de datos

- **`Recipe`** (`world.ts`): `star` (`warm`/`hot`/`massive`), `home` (`active`/`abandoned`/`none`), `rocky` (`count`, `roles`), `activePads`, `gas`, `moons`, `belt`, `nearby.count`, más los campos que vienen de los flags de debug (`twins`, `camp`, `settlement`, `mine`). `createSystem(seed, flags, pal, starName, recipe)` la pasa a `makeSystem`.
- **`StoryPlace`** (`place.ts`): `id`, `seed`, `recipe`, `bodies: BodyOverride[]`, `triggers`, `start?`, `headingRequires?`, `starName?` (`null` o ausente = al azar, `""` = sin nombre) y los campos del cometa (`cometRequires`, `cometCiv`, `cometScene`, `cometRef`). `chartStoryPlace` tira el sistema y aplica `bodies` con `applyStoryBodies`.
- **`BodyOverride`**: `ref` + `match` (`kind`, `kicker?`, `index?`, resuelto por `findBody`) y cambios: `retrograde`, `orbit`, `settlement`, `pad: "on" | "off"`, `grant`, `name`, `nickname`, `workshop`, `lumen`. Un `match` sin cuerpo es un error en dev; fuera de dev se devuelve como aviso.
- **`Leg`** (`leg.ts`): `id`, `from`, `to`, `length: [min, max]` (saltos contando la llegada), `base`, `steps` (por índice; `-1` = último paso generado), `fuel` (grado que el puente no recarga) y `codes` (rango de números `LV-`). **`LegStep`**: `recipe`, `bridge`, `guarantee`, `grant`.
- **`GameEvent`, `Effect`, `Trigger`** (`triggers.ts`): eventos `enterSystem`, `approach` (ref + radio), `orbitLock`, `land`, `takeoff`, `warpAttempt`, `flag`, `landedFor` (ref + segundos). Efectos `halley`, `thought`, `text`, `logFragment`, `grant`, `setFlag`, `revealHeading`, `halleyGlitch`.
- **`Grant`** (`campaign.ts`): `{ engine }`, `{ tank }` o `{ module }`, con `CampaignModule` = `transceiver` | `atmoTrap` | `hushDetector`.
- **`CometRequires`** (`types.ts`): una marca, `{ fuel }`, `{ engine }`, `{ tank }` o `{ module }`. Se evalúa con `cometRequireMet` (`comet.ts`).
- Datos de la fase 1: `PHASE1_PLACES` y `PHASE1_LEGS` en `src/game/campaign/phase1.ts`.

## Disparadores

- `runTriggers` (puro) cruza eventos con los disparadores de la ficha actual. Solo corre si el sistema cargado es esa ficha (misma semilla).
- `once` es `true` por defecto: el id `<placeId>:<índice>` va a `firedTriggers`. `when.has` / `when.not` filtran por marcas.
- `setFlag` que prende una marca nueva encola un evento `flag` en la misma llamada. `revealHeading` guarda el id en `revealed`.
- `approach` dispara solo al cruzar de afuera hacia adentro; sale con histéresis (`APPROACH_HYSTERESIS` = 1,25). Si la primera muestra ya está adentro, queda adentro sin disparar.
- `warpAttempt` se emite al apuntar a un rumbo cuyo requisito no se cumple o sin Δv para llegar a velocidad de salto (`jumpBlocked`).
- `runtime.ts` ejecuta `grant` (`applyBodyGrant`), `halleyGlitch` y la voz. Si cambian las marcas, las copia al checkpoint (`keepCampaignMarks`) y guarda.

## Guardado y checkpoint

- Clave `orbit.campaign.v1` (`CAMPAIGN_STORAGE_KEY`). `saveCampaign` / `loadCampaign` van envueltos en try/catch: sin storage o con un JSON corrupto, la campaña sigue en memoria y la carga devuelve `null`.
- Se guarda: ficha o tramo actual (`leg` con `id`, `step`, `seed`, `length`), marcas, `firedTriggers`, `revealed`, `salt`, nave (`fuelKind`, `engineKind`, `tankKind`, `fuel`, `hull`), módulos y el `checkpoint` congelado (lo mismo más `seed` y `landedId`). Un guardado viejo sin `revealed` carga `[]`; sin `salt`, carga `0`.
- **Sal:** `newCampaign` tira `salt` una vez por partida. Decide el largo de cada tramo y la semilla de cada paso, así que una recarga o un choque dan los mismos sistemas y nombres `LV-`. Una partida nueva tira otra sal.
- **Cuándo se escribe el checkpoint** (`sim.ts`):
  - `commitStoryCheckpoint`: al aterrizar en cualquier cuerpo del sistema de una ficha. Cierra el tramo (`leg: null`).
  - `commitPadCheckpoint`: al terminar de cargar en un pad.
  - `commitArrivalCheckpoint`: al llegar a una ficha montado en un cometa. Quedas posado en un cuerpo sólido de esa ficha sin `ref` ni entrega.
- **Choque:** `rebootSim` en campaña llama a `restoreCampaignFields`, vuelve a tirar el sistema de la semilla del checkpoint (`rechartToCheckpoint`: ficha, paso de tramo o desvío), te pone la nave guardada y te deja posado en `landedId`. Las marcas y módulos ganados después del checkpoint sobreviven (ya se copiaron); la nave y la posición no.
- El modo aleatorio no lee ni escribe la clave y sigue reiniciando con `freshShip()` en Home.

## Rumbos y tramos

- `stampCampaignHeadings` marca **uno** de los rumbos ya tirados con `target: { place }` o `target: { leg }`. No agrega rumbos y el modo aleatorio nunca la llama.
- `chartCampaignWarp` decide qué sistema tirar: rumbo a ficha → la ficha; rumbo de tramo → el paso siguiente; rumbo sin `target` → sistema aleatorio (desvío). En un desvío (`aside`) el paso y su semilla quedan quietos y el rumbo de vuelta vuelve a tirar el mismo paso.
- Largo: `pickLength` con la sal; se guarda en `leg.length`. Un tramo de largo N tiene N − 1 pasos generados (último índice `lastLegStep` = N − 2) y el salto N es la ficha.
- Receta de un paso (`stepRecipe`): `base` + `steps[i].recipe` + `steps[-1]` si es el último + `guarantee`, y al final `dryRecipe(leg.fuel)` si es puente. `LegStep.grant` se estampa en el asteroide aterrizable más grande; si es un módulo, ese asteroide queda `active` con pad.
- Nombre del paso: `legStarName` saca `LV-<n>` del rango `codes` con un RNG aparte (`seed ^ 0x4c56`), para no mover los demás sorteos.
- `headingRequires`: el rumbo a la ficha no aparece hasta tener esa marca o ese módulo, o hasta que un `revealHeading` revele su id (`headingOpen`). Si llegas a una ficha cerrada por otro camino, se tira un sistema aleatorio.
- Un puente no tiene ningún refill canónico del grado del tramo: `hasCanonicalRefill(planets, leg.fuel)` da `false`.

## Fase 1: fichas y tramos

En línea: `star-a` → `leg-1` → `star-b` → `leg-2` → `star-c` → `leg-3` → `star-d` → `leg-4` → `star-massive-1` (E) → salto por cometa → `star-f`. G no es una ficha: es el cometa marcado que sale de F.

| Ficha | Semilla | Rumbo pide | Mecánica |
|---|---|---|---|
| `star-a` | 8 | — | Sin Home, 0 pads. Empiezas posado en `a2` con 12 L (no alcanza para un salto). `a1` tiene pad `on` y entrega V2 (`hasV2`). `a3` es retrógrado; el `orbitLock` en `a3` marca `stationHeading` y revela `star-b`. |
| `star-b` | 21 | `stationHeading` | Home activa. Aterrizar en `b2` entrega `transceiver`, marca `hasTransceiver` y revela `star-c`. |
| `star-c` | 34 | `transceiver` | Home abandonada, cinturón denso, 0 pads. Aterrizar en `c1` entrega Long Tank, marca `hasLongTank` y revela `star-d`. |
| `star-d` | 55 | `hasLongTank` | Sin Home, 0 pads, dos rocosos, uno con rol Workshop. `d1` es `workshop` con pad `off`. El `orbitLock` en `d1` marca `cometHeading` y revela `star-massive-1`. |
| `star-massive-1` | 89 | `cometHeading` | Estrella masiva, sin Home. `e1` es el mundo LUMEN (`lumen: true`). Cometa E: `cometRequires: { fuel: "lumen" }`, escena `perihelion`. |
| `star-f` | 13 | (llegas por el cometa) | `starName: ""`: sin nombre en el warp ni en el chart. Gemelos, estrella `hot`. `f1` entrega `hushDetector`. Cometa: `cometRequires: { module: "hushDetector" }`, `cometCiv`, escena `marked`. |

| Tramo | Largo | `fuel` | `codes` | Pasos especiales |
|---|---|---|---|---|
| `leg-1` | `[3, 4]` | `ch4` | 115–386 | Base con 1 pad activo y cinturón suave en cada paso. |
| `leg-2` | `[4, 5]` | `nh3` | 388–920 | Base sin pads ni Home, gigante `ammonia`. Paso 0: Camp con pad y entrega `atmoTrap`. |
| `leg-3` | `[4, 5]` | `ch4` | 922–1205 | Base con gigante `ice`. Paso 0: puente sin gigante (seco para CH4, NH3 y H2). Paso 1: luna abandonada (outpost Thermal + Cryo). |
| `leg-4` | `[2, 3]` | `ntr` | 1207–1539 | Base sin gigante, estrella `warm`. Paso 0: puente. Paso 1 (solo con largo 3): garantiza un gigante `ammonia` y un rocoso Workshop para refinar NTR a mitad de tramo. |

**Cometas de la fase 1** (`sim.ts`, `comet.ts`):

- **E:** la ficha tira roces a la estrella (`spawnComet`). El rumbo del cometa solo queda si se cumple `cometRequires` (LUMEN en el tanque). Si un roce se va sin dejar rumbo, otro vuelve tras `COMET_GRAZE_GAP_S` (8 s).
- **`landedFor`:** posado en el cometa E durante 120 s seguidos (`seconds: 120`, ref `comet`) marca `knowsTruth` y revela `star-f`. Despegar, o que un chorro te levante, vuelve el contador a cero. Cuando la escena termina de frenar (`scene.arrived`), el juego salta solo a `star-f` y esa llegada es checkpoint.
- **F:** al entrar, `halleyGlitch: 4` y la marca `halleyGlitchF`. El despegue de `f1` marca `hushMarked`; desde ahí, los cometas que salen de F (`spawnLeavingComet`) llevan la carta de la ficha. El rumbo queda con el detector a bordo. Aterrizar en ese cometa (`civ`) con `hushDetector` entrega Coil + Hold (`deliverHush`). Eso es G.
- **Glitch de Halley:** `halleyGlitchDamage` (`halley.ts`) sube el daño de la señal a 1 en 0,3 s, lo sostiene y vuelve al valor de la nave en 0,8 s. No toca `hull`, enciende el CRT aunque no suene nada y corre sin manifest.

## Escalera de recarga y saltos por tanque

| Recarga | Condición | Dónde |
|---|---|---|
| Pad CH4 | Pad `active` o `pad: "on"`, 3 L/s. En campaña `beginCampaignPadRefill` no te baja motor ni estanque; si CH4 × motor × estanque no es una celda legal, no carga y avisa (`PAD_CELL_HINT`). | `fuel.ts`, `sim.ts` |
| Skim NH3 | Con `atmoTrap`, en la bruma de un gigante `gas-ammonia` o `gas-water`. Tasa `SKIM_PER_DENSITY` × densidad. | `refill.ts`, `pickSkim` |
| Skim H2 | Con `atmoTrap`, más adentro (`GAS_CLOUD_FACTOR`) de cualquier gigante. Gotea `H2_LEAK_RATE` en estanques que no son Cryo, Hold ni Cistern. | `refill.ts` |
| Outpost de luna | Aterrizar en una luna `abandoned` de un gigante con H2 en el tanque: Thermal + Cryo. | `deliverMoonOutpost` |
| NTR | Posado en un Workshop (`kicker` o `workshop: true`) con H2: refina a `NTR_REFINE_RATE`. Un skim de H2 con NTR aún en el tanque guarda esos litros en `ntrHold` para el Workshop. | `refineNtr`, `bankH2OverNtr` |
| LUMEN | Aterrizar en el mundo LUMEN entrega el motor Lumen. Con LUMEN en el tanque, la corona carga (`LUMEN_PER_DENSITY`) y calienta el casco (`CORONA_HULL_PER_DENSITY`). | `deliverLumen`, `stepFlightRefill` |
| HUSH | Cometa `civ` + `hushDetector`: Coil + Hold. Con HUSH, sostener un punto de Lagrange carga (`HUSH_CHARGE_RATE`); `sipField` sigue drenando en pozos. | `deliverHush`, `chargeHush` |

Un tanque lleva un solo grado. Un skim de un grado nuevo vacía el tanque, salvo que lleve un grado más alto con litros (`addGrade`, `GRADE_RANK`).

**Saltos por tanque:** `jumpsPerTank(fuel, engine, tank)` = Δv del tanque lleno / (`WARP_JUMP_SPEED` − `WARP_BRAKE_SPEED`). El test `jumps per tank stay within 5% of the bridge table` (`leg.test.ts`) fija, con tolerancia de ±5 %:

| Nave | Δv | Saltos |
|---|---|---|
| CH4 × V1 × Fuel | 1700 | 1,2 |
| CH4 × V2 × Fuel | 2020 | 1,4 |
| CH4 o NH3 × V2 × Long | 2880 | 2,0 |
| H2 × V2 × Cryo | 1020 | 0,7 |
| H2 × Thermal × Cryo | 1610 | 1,1 |
| NTR × Thermal × Cryo | 3580 | 2,5 |
| CH4 × V2 × Hold | 4500 | 3,2 |
| NTR × Thermal × Hold | 5350 | 3,8 |

`phase1.test.ts` comprueba con esos números que cada tramo se cruza con la nave ganada antes de él (por ejemplo, Long Tank ≥ 2 saltos para el puente de `leg-3`, NTR ≥ 2,2 para `leg-4`) y camina los sistemas que tira la sal con las reglas de recarga reales.

## Modo aleatorio

- **Snapshot:** `world-snapshot.test.ts` compara `createSystem(seed)` sin receta, semillas 1–20, contra `world-snapshot.json` (kind, kicker, settlement, radio y órbita redondeados, rumbos, start). Es el contrato del modo aleatorio. Regenera el JSON solo con un cambio deliberado al modo aleatorio, y revisa que el diff muestre solo eso.
- **Sistemas sin Home:** si la receta queda vacía (sin receta ni flags), `randomHome(seed)` decide con un RNG aparte (`mulberry32(seed ^ 0x686f6d65)`) que `RANDOM_HOMELESS_RATE` (1/6) de los sistemas salga sin Home habitada: la mitad `abandoned`, la otra `none`. Una receta cualquiera salta ese sorteo. Los desvíos de campaña también pueden salir sin Home.
- La primera carga de la página se tira con `home: "active"`, así que siempre tiene Home. Un choque en modo aleatorio sin Home habitada vuelve a tirar sistemas hasta tener una (`chartLivingHome`).

## Copy

- El texto de historia se referencia por **id** (`halley-*`, `thought:*`, `text:*`, `logFragment: n`). No hay copy en el repo.
- La voz se resuelve con los manifests de `public/dev/halley/` y `public/dev/pilot/`, que solo se cargan con `?dev` (`spokenLine`). Solo suenan ids que estén en `HALLEY_CLIP_IDS` / `PILOT_CLIP_IDS`; hoy ningún id de la fase 1 está ahí, así que la campaña corre en silencio.
- `text` y `logFragment` todavía no tienen salida en `runtime.ts`. `setFlag`, `grant`, `revealHeading` y `halleyGlitch` corren siempre.

## Dónde está

| Archivo | Qué tiene |
|---|---|
| `src/game/campaign.ts` | `CampaignState`, checkpoint, sal, guardado, `campaignFromSearch` |
| `src/game/campaign/phase1.ts` | `PHASE1_PLACES`, `PHASE1_LEGS`, ids de naves y `civ` |
| `src/game/place.ts` | `StoryPlace`, `BodyOverride`, `PROBE_PLACE`, `chartStoryPlace`, `placeFromSearch`, `applyBodyGrant` |
| `src/game/leg.ts` | `Leg`, rumbos, `chartCampaignWarp`, puentes, `jumpsPerTank` |
| `src/game/triggers.ts` | Eventos, efectos, `runTriggers`, Δv y bloqueo de salto |
| `src/game/refill.ts` | Escalera de recarga |
| `src/game/fuel.ts` | `grant`, pad de campaña, celdas legales |
| `src/game/world.ts` | `Recipe`, `makeSystem`, `createSystem`, `randomHome`, `hasLivingHome` |
| `src/game/sim.ts` | Checkpoints, reinicio, cometas de campaña, `landedFor`, sensores |
| `src/game/runtime.ts` | Arranque por URL, efectos, voz y glitch |

Tests: `campaign.test.ts`, `phase1.test.ts`, `leg.test.ts`, `place.test.ts`, `triggers.test.ts`, `refill.test.ts`, `recipe.test.ts`, `grant.test.ts`, `world-snapshot.test.ts` (todos en `src/game/`). Cada test nuevo va a la lista explícita de `test` en `package.json`, o no corre.
