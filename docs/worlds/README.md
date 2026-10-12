# Mundos guiados: recetas, fichas, tramos y campaña

Spec de desarrollo para que el juego soporte la **fase 1 guiada**: lugares de historia escritos a mano, separados por tramos de sistemas generados con reglas, y una escalera de capacidades que de verdad se necesita para avanzar.

Prosa en tuteo. Identificadores, comentarios, commits y PRs en inglés. Todo texto dentro del juego, en inglés.

- **Implementa:** Grok. Instrucciones en [`GROK.md`](GROK.md).
- **Valida:** agy (Antigravity). Instrucciones en [`AGY.md`](AGY.md).

## Fuentes

El **qué** vive en Notion; aquí está el **cómo**. Si este doc y Notion discrepan sobre qué es el juego, gana Notion. Si discrepan sobre el código, gana `src/game/`.

| Notion | Qué define |
|---|---|
| [Construcción de mundos (borrador)](https://app.notion.com/p/3f6a554c3c4081a89556d1ab58f82edf) | Receta, ficha, tramo, puente, saltos por tanque. Las 4 decisiones reabiertas |
| [Mapa de la fase 1 (borrador)](https://app.notion.com/p/3f6a554c3c4081cf961ed0d9604d76fe) | Los lugares A–G y los tramos 1–4 con su contenido |
| [Combustible](https://app.notion.com/p/3dba554c3c4081f8829df66b443c2ffe) | Grados, motores, estanques, `DRIVE_CELLS` |
| [Reabastecimiento](https://app.notion.com/p/3dfa554c3c4081c6bd7dc072bbcc99fa) | Un refill canónico por grado |
| [Descubrimiento](https://app.notion.com/p/3e0a554c3c40819f9fe7c20f610b01b2) | Cómo se gana cada grado y motor |
| [Mundos](https://app.notion.com/p/3dfa554c3c40810b838edf3fe5cceecd), [Cometa](https://app.notion.com/p/3dfa554c3c408183b66cd95df28a84da) | Catálogo de cuerpos y lock del cometa |

**Decisiones reabiertas por Tomás (11 oct 2026).** "Home siempre habitado", "el cometa no se aterriza", "mundo LUMEN con vida alien" y "no hay estrella masiva" se reabrieron en Notion (aviso naranjo arriba de Mundos, Descubrimiento y Cometa) y **Tomás aprobó las cuatro propuestas el 11 oct** (✅ en Construcción de mundos). No reabras nada más.

**Decisiones del 11 oct que tocan este spec** (✅ en Construcción de mundos y en el Mapa):

| Decisión | Dónde entra |
|---|---|
| La receta puede forzar `home: "none"` en varios sistemas seguidos; los aleatorios **a veces** salen sin Home | Fase 1 (ya está) y fase 11 |
| Choque en campaña: vuelves al último pad donde cargaste o a la última ficha, la más reciente, con la nave que tenías | Fase 3 (ya está) |
| Mundo LUMEN = estación vieja de la civilización | Fase 8.5 y 10 |
| Cometa (cambiado 12 oct): inatrapable; su rumbo aparece con LUMEN (E) o el detector de hush (G); saltar entra a una escena propia donde solo hay que aterrizar entre chorros y rocas. El look lo fija Tomás | Fase 9 |
| La civilización se llama `civ` en el código; su nombre queda pendiente | Fase 9 y 10 |
| Transceptor rescatado de una nave desguazada en el hangar de la estación | Fase 10 |
| Lugares en línea, A→G; cada uno revela el siguiente | Fase 10 |
| Saltos por tramo como en el Mapa (13–17 en total) | Fase 10 |
| Posado ~120 s en el cometa E antes de que desacelere | Fase 10 |
| Nombres: homenaje a Alien (tabla en el Mapa) | Fase 10 |
| Glitch de Halley al llegar a F | Fase 10 |
| La campaña es el modo por defecto; el aleatorio pasa a `?free` | Fase 11 |

**Copy:** las líneas de voz, los textos de muralla y las transmisiones no van al repo hasta que se cierren en Historia. En código, todo texto de historia se referencia por **id** (`text:a2-wall`, `halley-05`, `thought-07`) y se resuelve desde un manifest en `public/dev/` solo con `?dev`, igual que `halley.ts` y `pilot.ts`. Sin manifest, el efecto se salta en silencio. La única excepción es `halleyGlitch` (fase 10), que es visual y corre igual.

## Glosario

| Notion | Código | Qué es |
|---|---|---|
| Receta | `Recipe` | Reglas para tirar **un** sistema. Campo ausente = se tira como hoy |
| Ficha | `StoryPlace` | Lugar de historia: receta con semilla fija + cambios por cuerpo + disparadores |
| Tramo | `Leg` | Cadena de sistemas generados entre dos fichas, con garantías y un rumbo |
| Puente | `bridge: true` en un salto de un `Leg` | Sistema seco: nada que tu nave pueda cargar |
| Marca | `CampaignFlag` (string) | Algo que la campaña recuerda para siempre |
| Disparador | `Trigger` | Evento + condición → efectos |
| Entrega | `Grant` | Motor, estanque o módulo que se instala |
| Campaña | `Campaign` | Fichas + tramos + estado guardado |

## Cómo funciona hoy (main, 11 oct 2026)

- `createSystem(seed, flags, starPal, starName)` en `src/game/world.ts` llama a `makeSystem(seed, flags)` y después a `rollNearby`. Semilla aleatoria por salto (`punchWarp` en `src/game/sim.ts`).
- `makeSystem` siempre tira: una estrella (`star-warm` o `star-hot`, radio 220–300), 3–4 rocosos con **Home en el asiento 0, siempre `active`**, cinturón en ~34%, un gigante con 1–2 lunas. Después `assignOccupancy` y `assignEngineUnlocks` (V2 en el Camp).
- `ChartFlags` (`twins`, `belt`, `camp`, `settlement`, `mine`) fuerzan partes de la receta, pero solo desde la URL.
- El jugador **siempre empieza en Home** (`getStart`).
- `rollNearby` da 1–3 rumbos al azar. No hay distancia: cualquier vecino se alcanza igual.
- **Warp:** 1500 u/s apuntando a ±0.5° de un rumbo (`WARP_JUMP_SPEED`, `WARP_AIM_DEG`). No cobra combustible aparte, pero acelerar hasta 1500 sí. Al llegar vas a 88 u/s (`WARP_BRAKE_SPEED`).
- **Carga:** solo CH4 en pads `active` (`padHasFuel`, `beginPadRefill`, 3 L/s). `fuelInMix` existe y no está cableado.
- **Capacidades:** V2 se gana en el Camp. Todo lo demás solo con `?dev` (`cycleDrive`, `cycleTank`).
- **Choque:** `rebootSim` → `freshShip()` → CH4 × V1 × Fuel Tank en Home. Nada se guarda entre cargas de página.
- **Cometa:** actor de paso (`comet.ts`), inatrapable. Saltar a su rumbo entra a la escena del cometa (`comet-scene.ts`, fase 9).
- **Despegue** es un empujón gratis; **aterrizar** solo mira la velocidad (< 30). No se cambia en este spec.

## El invariante más importante

**El modo aleatorio no cambia.** `createSystem(seed)` sin receta y sin campaña tiene que producir exactamente los mismos planetas, rumbos y punto de partida que hoy para la misma semilla. La fase 1 agrega un test que lo asegura (snapshot de N semillas tomado **antes** de tocar `makeSystem`). Si un cambio rompe ese test, el cambio está mal.

## Modelo de datos

Sketch de tipos. Los nombres pueden ajustarse; la forma no.

```ts
type StarKind = "warm" | "hot" | "massive";
type HomeMode = "active" | "abandoned" | "none";

/** Reglas para tirar un sistema. Todo opcional: ausente = como hoy. */
type Recipe = {
  star?: StarKind;
  home?: HomeMode;
  rocky?: { count?: number; roles?: ("workshop" | "signal" | "archive" | "twin")[] };
  /** Cuántos cuerpos landables quedan `active` (pad con CH4). "natural" = pesos de hoy. */
  activePads?: number | "natural";
  gas?: "none" | "ammonia" | "water" | "methane" | "ice" | "sulfur";
  moons?: { matter?: MatterProfileId; settlement?: Settlement; grant?: Grant }[];
  belt?: "none" | "soft" | "dense" | { camp?: boolean; grant?: Grant };
  /** Rumbos de warp. El juego agrega los que pide la campaña. */
  nearby?: { count?: 1 | 2 | 3 };
};

type BodyRef = string; // id estable dentro de una ficha: "a1", "a2", "a3", "station"…

type BodyOverride = {
  ref: BodyRef;
  match: { kind: PlanetKind; kicker?: string; index?: number }; // cómo encontrarlo en el sistema tirado
  retrograde?: boolean;      // invierte el sentido de la órbita
  orbit?: { a?: number; e?: number };
  settlement?: Settlement;
  pad?: "on" | "off";        // el pad puede funcionar sin gente (a1) o no funcionar con gente (refugio)
  grant?: Grant;             // se instala al aterrizar
  workshop?: boolean;        // refina NTR (fase 8)
};

type Grant =
  | { engine: EngineKind }
  | { tank: TankKind }
  | { module: "transceiver" | "atmoTrap" | "hushDetector" };

type TriggerEvent =
  | { on: "enterSystem" }
  | { on: "approach"; ref: BodyRef; radius: number }
  | { on: "orbitLock"; ref: BodyRef }
  | { on: "land"; ref: BodyRef }
  | { on: "takeoff"; ref: BodyRef }
  | { on: "warpAttempt"; heading: string }   // apuntar a un rumbo sin poder llegar
  | { on: "flag"; flag: CampaignFlag };       // al prenderse una marca

type Effect =
  | { halley: string }          // id de clip
  | { thought: string }         // id de clip
  | { text: string }            // id de texto en pantalla
  | { logFragment: number }
  | { grant: Grant }
  | { setFlag: CampaignFlag }
  | { revealHeading: string };  // id de ficha o de tramo

type Trigger = TriggerEvent & {
  when?: { has?: CampaignFlag[]; not?: CampaignFlag[] };
  once?: boolean;               // default true
  effects: Effect[];
};

type StoryPlace = {
  id: string;                   // "A", "B"… o ids más largos
  seed: number;                 // fija
  recipe: Recipe;
  bodies: BodyOverride[];
  triggers: Trigger[];
  start?: { ref: BodyRef; fuel: number }; // solo la ficha inicial
  /** Si existe, el rumbo a esta ficha solo aparece con esta marca o módulo. */
  headingRequires?: CampaignFlag | "transceiver";
};

type LegStep = {
  recipe?: Recipe;              // se mezcla sobre la receta base del tramo
  bridge?: boolean;             // sistema seco (ver Puentes)
  guarantee?: Recipe;           // lo que sí o sí aparece en este salto
};

type Leg = {
  id: string;
  from: string;                 // id de ficha
  to: string;                   // id de ficha
  length: [min: number, max: number];
  base: Recipe;
  steps?: Record<number, LegStep>; // por índice de salto (0 = primero); "last" con -1
  voices?: { thoughts?: string[]; halley?: string[] };
};

type CampaignState = {
  version: 1;
  place: string | null;         // ficha actual, o null en un tramo
  leg: { id: string; step: number; seed: number } | null;
  flags: CampaignFlag[];
  firedTriggers: string[];      // "<placeId>:<index>"
  ship: Pick<Ship, "fuelKind" | "engineKind" | "tankKind" | "fuel" | "hull">;
  modules: Grant[];
  checkpoint: CampaignCheckpoint;
};
```

## Puentes y saltos por tanque

Un salto pide ir de 88 a 1500 u/s: **Δv ≈ 1412**. Con la fórmula de `fuel.ts` (velocidad de escape ≈ 5657 × Isp del grado × Isp del motor; masa seca 0.75 + motor + estanque; masa de fuel = litros × densidad × 0.0035):

| Nave | Δv tanque lleno | Saltos por tanque |
|---|---|---|
| CH4 × V1 × Fuel Tank | ~1700 | 1,2 |
| CH4 × V2 × Fuel Tank | ~2020 | 1,4 |
| CH4 o NH3 × V2 × Long Tank | ~2880 | 2,0 |
| H2 × V2 × Cryo | ~1020 | 0,7 |
| H2 × Thermal × Cryo | ~1610 | 1,1 |
| NTR × Thermal × Cryo | ~3580 | 2,5 |
| CH4 × V2 × Hold | ~4500 | 3,2 |
| NTR × Thermal × Hold | ~5350 | 3,8 |

- **Puente simple** (un sistema seco): pide 2 saltos por tanque. **Puente doble**: 3.
- Un sistema es **seco para una nave** si no hay ningún refill canónico (Reabastecimiento) del grado que esa nave puede quemar: ni pad `active`, ni gigante del skim que corresponde, ni luna de mina, ni corona útil.
- Un salto con `bridge: true` en un `Leg` genera un sistema seco **para la nave que el tramo exige** (no para cualquiera): `activePads: 0`, `home: "none"` o `"abandoned"`, y gigante, lunas y estrella elegidos para que no haya refill del grado esperado.
- Esta tabla se vuelve un test (`jumpsPerTank`) en la fase 6, para que un cambio de números no rompa los puentes sin que nadie lo note.

## Fases (un PR cada una, en este orden)

Cada fase deja el juego jugable, con el modo aleatorio idéntico. Cada test nuevo va a la lista explícita de `npm test` en `package.json`, o no corre.

### Fase 1: receta en `makeSystem`

- Antes de tocar nada: test `src/game/world-snapshot.test.ts` que guarda un resumen estable (kind, kicker, settlement, radio redondeado, órbita redondeada, rumbos, start) de 20 semillas fijas. El snapshot se genera con el código de hoy y se commitea.
- `makeSystem(seed, flags, …)` pasa a `makeSystem(seed, recipe, …)`. `ChartFlags` de la URL se traducen a una `Recipe` (los flags de debug siguen funcionando igual).
- Implementa los campos de `Recipe`: `star` (warm/hot; massive en fase 2), `home`, `rocky`, `activePads`, `gas`, `moons`, `belt`, `nearby.count`.
- `home: "none"`: el asiento 0 se vuelve un rocoso común. `getStart` necesita un punto de partida aunque no haya Home: en modo aleatorio siempre hay Home; en campaña el start lo da la ficha (fase 4).
- `activePads: n`: después de `assignOccupancy`, fuerza exactamente `n` landables `active` (los demás pasan a `abandoned`/`unexplored` según su kind).
- **Aceptación:** el snapshot no cambia. Tests por campo en `src/game/recipe.test.ts`.

### Fase 2: estrella masiva

- `star: "massive"`: radio ~400–500, `surfaceG` mayor que `star-hot`, corona (`STAR_ATMO_FACTOR`) más ancha, receta de materia nueva `star-massive` con más `lumen` en la atmósfera que `star-hot`. Paleta blanco-azul más intensa.
- `placeOnRails` tiene que dejar espacio: el primer riel empieza más lejos.
- Flares: misma lógica, escalada al radio.
- Solo aparece si una receta lo pide. **Aceptación:** snapshot intacto; test de que `star: "massive"` produce la receta y el radio pedidos.

### Fase 3: estado de campaña, guardado y checkpoint

- Nuevo módulo `src/game/campaign.ts` (puro, sin DOM) con `CampaignState`, `newCampaign()`, `saveCampaign()`/`loadCampaign()` sobre `localStorage` (clave `orbit.campaign.v1`, envuelto en try/catch: si falla, la campaña sigue en memoria).
- Modo: `?campaign` activa la campaña. Sin `?campaign`, nada cambia. (Tomás decidió el 11 oct que la campaña será el modo por defecto: eso es la fase 11, no esta.)
- **Checkpoint:** se guarda al aterrizar en una ficha y al terminar de cargar combustible en cualquier pad. Guarda nave, módulos, marcas, ficha o tramo y semilla.
- **Choque o muerte a la deriva en campaña:** en vez de `freshShip()` en Home, `restoreCheckpoint()` (en el código quedó como `rechartToCheckpoint` en `sim.ts`): mismo sistema (misma semilla), misma nave, posado donde se guardó. En modo aleatorio, `rebootSim` sigue igual.
- **Aceptación:** tests de serialización, de restaurar, y de que el modo aleatorio no lee ni escribe `localStorage`.

### Fase 4: fichas (lugares de historia)

- `StoryPlace` con semilla fija y receta. `createSystem` en campaña recibe la ficha y aplica `bodies` después de tirar el sistema.
- `match`: encuentra el cuerpo por kind/kicker/índice en el sistema tirado. Si no lo encuentra, **error en dev** (la ficha está mal escrita), no un fallo silencioso.
- `retrograde`: invierte `orbitW` y la velocidad del cuerpo en su riel. Las lunas y Lagrange tienen que seguir funcionando.
- `pad: "on"` hace que `padHasFuel` devuelva true aunque `settlement` no sea `active`; `pad: "off"` lo contrario. Hoy `padHasFuel` lee solo `settlement`: agrega el override sin cambiar el modo aleatorio.
- `grant`: se instala al aterrizar (generaliza `installEngine`, fase 7).
- `start`: la ficha inicial empieza posada en `ref` con `fuel` litros.
- Volver a una ficha da el mismo sistema (misma semilla y cambios).
- **Aceptación:** test con una ficha de prueba (no de historia) que tiene un asteroide retrógrado, un pad `on` sin gente y un start fuera de Home.

### Fase 5: disparadores y efectos

- `src/game/triggers.ts` (puro): recibe eventos del sim y el estado de campaña, devuelve efectos. `runtime.ts` ejecuta los efectos (voz por los canales que ya existen en `halley.ts` y `pilot.ts`, texto por el visor).
- Eventos desde `sim.ts`: `enterSystem` (al terminar el warp), `approach` (distancia al cuerpo < radio, con histéresis), `orbitLock` (`captureOrbit`), `land` (en `collidePlanets` al aterrizar), `takeoff`, `warpAttempt` (apuntar a un rumbo con `headingRequires` que no se cumple, o sin Δv para llegar), `flag`.
- `once` por defecto: el id del disparador va a `firedTriggers`.
- Los textos, voces y fragmentos del log son ids. Sin manifest, el efecto de voz o texto no hace nada, pero `setFlag`, `grant` y `revealHeading` sí corren.
- **Aceptación:** tests de cada evento y de `once`, `when.has`, `when.not`.

### Fase 6: tramos y rumbos

- En campaña, `punchWarp` decide qué sistema tirar:
  - Rumbo a una ficha → la ficha.
  - Rumbo del tramo → siguiente paso del tramo (`leg.step + 1`), con semilla nueva y receta = `base` + `steps[i].recipe` + `steps[i].guarantee`.
  - Cualquier otro rumbo → sistema aleatorio (desvío). El rumbo de vuelta al tramo se mantiene.
- `NearbyHeading` gana un campo opcional `target?: { place?: string; leg?: string }`. Cada sistema de un tramo tiene **al menos un** rumbo que acerca (`target.leg` o, en el último paso, `target.place`).
- `headingRequires`: el rumbo no aparece hasta tener la marca o el módulo.
- `bridge: true`: ver Puentes. Test `jumpsPerTank` con la tabla de arriba (tolerancia ±5%).
- **Aceptación:** tests de que un tramo de largo N llega a la ficha en N saltos siguiendo los rumbos, de que un desvío no rompe el tramo, y de que un puente no tiene refill para la nave exigida.

### Fase 7: entregas y módulos

- `grant()` reemplaza a `installEngine`: motor y estanque pasan por `legalizeLoadout`/`snapTank`; un estanque nuevo conserva el combustible que quepa.
- Módulos: `transceiver` (habilita rumbos con `headingRequires: "transceiver"`), `atmoTrap` (habilita skim, fase 8), `hushDetector` (el mass spec puede mostrar HUSH en cometas, fase 9).
- En campaña, `beginPadRefill` **no** te baja el motor ni el estanque ganados: solo cambia el grado a CH4 si la celda es legal; si no es legal, el pad no carga (te avisa). En modo aleatorio, sigue como hoy.
- **Aceptación:** tests de cada grant y del pad en campaña.

### Fase 8: escalera de recarga (Reabastecimiento)

Lo que el lock ya definió y nunca se implementó. Un PR por punto, en este orden:

1. **Skim de atmósfera (NH3):** con `atmoTrap`, volar dentro de la bruma de un gigante `gas-ammonia` o `gas-water` carga NH3. Se usa el drag que ya existe; la tasa crece con la densidad. Cambiar de grado tira el anterior (un tanque, un grado).
2. **Skim profundo (H2):** cualquier gigante, más adentro. En un estanque que no es Cryo, Hold ni Cistern, el H2 **gotea** con el tiempo.
3. **Outpost de luna (Thermal + Cryo):** aterrizar en una luna `abandoned` de un gigante con H2 en el tanque entrega Thermal + Cryo.
4. **Refinar NTR:** aterrizado en un Workshop (cualquier settlement), con H2 en el tanque, convierte H2 en NTR a una tasa fija.
5. **LUMEN:** el mundo LUMEN (rocoso chico interior junto a una estrella caliente o masiva; en campaña lo pone una ficha o un tramo) entrega LUMEN × Lumen drive al aterrizar. Recarga: **paso rasante por la corona** de cualquier estrella: dentro de la corona carga, más adentro carga más y calienta el casco. Usa la corona y los flares que ya existen.
6. **HUSH en Lagrange:** sostener un punto de Lagrange carga HUSH (el lock de Lagrange ya existe). `sipField` sigue drenando en pozos.

**Aceptación de cada punto:** test de la tasa, de la condición (sin trap no hay skim, sin Cryo gotea, etc.) y del snapshot intacto.

### Fase 9: la escena del cometa

Cambió el 12 oct (Tomás). Ya no se iguala la velocidad del cometa en el chart: con la gravedad de la estrella, aterrizar en perihelio quedaba al límite (29,6 contra 30) y no era estable. Fuente: Notion [Cometa](https://app.notion.com/p/3dfa554c3c408183b66cd95df28a84da), sección **La escena del cometa**. Calza con el lock de Cometa (decisiones 2 y 5): el cometa sigue inatrapable en el chart y saltar a su rumbo entra al minijuego.

- **El cometa en el chart no cambia.** Sigue siendo el actor de paso de hoy (`comet.ts`), más rápido que el warp, sin colisión. Nada de planear una pose de llegada ni de igualar su velocidad: si tienes trabajo sin commitear con `planAphelion` o `cometArrivalPose`, bórralo.
- **Entrar.** El warp de siempre: 1500 u/s apuntando al rumbo del cometa (`enterWarp`). En el golpe del tránsito, si `warpTarget.kind === "comet"`, `enterCometScene` abre la escena en vez de `createSystem`. La escena vive en `sim.cometScene` (null fuera de ella); `stepSim` le delega todo menos el tránsito. Para probar: `?comet=perihelion|inbound|marked`; arranca con motor Lumen y el tanque lleno de LUMEN.
- **La escena.** Marco del núcleo: el núcleo está quieto en el origen y gira despacio (ω ≈ 0,11 rad/s). No hay estrella ni planetas ni su gravedad; el núcleo tiene una gravedad propia débil. Cámara desde arriba, centrada en el núcleo: lejos al llegar (~1500 u en el lado corto) y se acerca sola a medida que bajas (~640 u junto al suelo; `cometViewUnits`). Las estrellas del fondo se dibujan como trazos a velocidad warp, en contra del viaje del cometa (`COMET_TRAVEL`: se aleja del sol, porque lo alcanzas cuando deja el sistema). La nave entra siempre **desde atrás**, que siempre es el **lado de día**, alcanzándolo ya casi igualada (~70 u/s hacia el núcleo).
- **El desafío es solo aterrizar.** Contacto con la superficie con velocidad relativa a la superficie que gira bajo `LAND_SPEED` (30): posado. Si no, choque.
  - **Chorros:** puntos fijos del núcleo que giran con él. Cada uno tiene periodo, fracción encendida y fuerza. Encendido, empuja la nave dentro de su cono y suelta gas y rocas.
  - **Rocas:** salen de los chorros encendidos al sol y vuelan con la gravedad del núcleo; algunas caen de vuelta sobre el lado de noche. Pegan con la regla del cinturón (`hullDamage` en `hull.ts`, mismos ticks y ruido): bajo 10 u/s de cierre no hacen nada, una chica resta ≤ 4, una mediana 6–18. Solo el casco en 0 es choque (`comet-rocks`).
  - **Noche:** un chorro que pasa al lado oscuro sigue soplando 4–11 s (retraso térmico) y se apaga; en la noche empuja pero no suelta rocas. Un chorro que despierta bajo la nave posada, o un estallido cerca, la levanta.
  - **Estallidos:** avisan siempre (punto que late y goteo), solo en el lado de día, cada ~5,5 / 8,5 / 13 s según el cometa.
  - **Hielo y chorros en el casco:** los granos sueltos de hielo y gas suenan como grava del cinturón, sin daño. Dentro del cono de un chorro, o de un estallido, el golpe suena como piedras chicas y daña el casco (hasta ~4 golpes por segundo de 1 a 6 cada uno, según lo cerca del respiradero; `sceneGasHits`).
  - **Cueva (solo E, `cave` en `COMET_SCENES`):** un tubo bajo un techo de roca en el lóbulo grande, ~3 naves de ancho y ~4 de profundidad, con piso. Desde arriba es solo una zona algo más oscura y hundida, de bordes irregulares. Adentro, roca suelta tapa la mitad de abajo de la nave (la de arriba se ve normal); la luz del motor llega al fondo más débil. No llegan chorros, estallidos, rocas ni sol. El refugio es el piso, no el camino: los bordes de la boca tienen respiraderos y estallidos como cualquier otra parte. Las paredes se rozan lento; un golpe sobre 30 es choque. HUD: `SITE CAVE`. Idea de Tomás (12 oct): podría ser la entrada al asentamiento antiguo.
  - **Sin reparación** en el núcleo (`hullSafeKind` da null en la escena).
  - **Choque** en la escena = el choque de campaña (vuelves al checkpoint).
- **Parámetros por cometa:** `COMET_SCENES` en `comet-scene.ts`, tres tipos: `perihelion` (E), `inbound` (intermedio, la referencia) y `marked` (G). Chorros 7 / 5 / 3, fuerza 1 / 0,8 / 0,6, rocas 1,5 / 1 / 0,6. Los chorros solo se encienden al sol (Día y noche).
- **Quedarse posado:** `COMET_HOLD_S` = 120 s posado sin despegar. Despegar, o que un chorro te levante, vuelve el contador a cero (Tomás, 12 oct). HUD arriba: `HOLD n s` y `SITE DAY/NIGHT`. Al cumplirlos el cometa desacelera y la nave sale por warp a un sistema nuevo (`finishCometHold`). En campaña, la fase 10 cambia esa salida por el efecto de la ficha.
- **Salir.** Despegas y te alejas. Si cruzas el borde de la escena a velocidad warp, es el warp perdido de siempre (`warpLost`).
- **Look cerrado (Tomás, 12 oct):** Día y noche con chorros Hielo, referencia el cometa intermedio. Artefacto [Escena del cometa](https://claude.ai/artifact/M3TkVdBvpS7N5fFFkZFxGt). Todo el dibujo vive en `src/game/comet-scene-draw.ts`; el motor ilumina el suelo, la escarcha y las rocas cercanas.
- **Aceptación:** tests puros de la escena (`comet-scene.test.ts`): entrar por el warp a un rumbo de cometa, aterrizar bajo 30 relativo a la superficie que gira, choque sobre 30, rocas con la regla del cinturón, empuje de un chorro dentro y fuera de su cono, retraso térmico de noche, sin reparación, la espera de 120 s, el chorro bajo el casco, el warp perdido al cruzar el borde y las rocas que vuelven a caer. Ningún test depende de la gravedad de una estrella.
- **Pasa a la fase 10** (necesita las fichas): el rumbo del cometa con requisito (`cometRequires`), el flag `civ` con el grant de HUSH, y el disparador `landedFor` de la ficha.

### Fase 10: datos de la fase 1

- **Del cometa (viene de la fase 9):**
  - **El rumbo del cometa aparece cuando la nave puede.** `sim.cometHeading` solo se crea si se cumple lo que pide la ficha: `cometRequires?: CampaignFlag | Grant | { fuel: FuelKind }` en `StoryPlace` o en el `comet` que trae el rumbo. El cometa E pide `{ fuel: "lumen" }` (LUMEN en el tanque), el G pide el módulo `hushDetector`. Sin eso, el cometa cruza y se va sin dejar rumbo. En modo libre, como hoy (`?dev` + C) y sin requisito.
  - Flag `civ` en el cometa. Aterrizar en uno con `civ` y con `hushDetector` entrega HUSH × Coil + Hold (fila de Descubrimiento).
  - "Quedarse posado" en un cometa de ficha lleva a otra ficha: disparador `{ on: "landedFor"; ref; seconds }` + `revealHeading` + salto automático. Si despegas antes, el contador vuelve a cero.

- `src/game/campaign/phase1.ts`: las fichas A–G y los tramos 1–4 del Mapa en Notion, traducidos a datos. Todo texto por id. Sin copy.
- Ids de cuerpos y marcas en inglés corto (`a1`, `a2`, `a3`, `hasV2`, `sawWall`).
- Las semillas de las fichas se eligen jugando: busca semillas cuyo sistema tirado se vea bien y deja el número fijo.
- **En línea:** A→B→C→D→E→F→G. Cada ficha revela el rumbo a la siguiente (`revealHeading`); no hay otro orden. Largos de tramo como en el Mapa: tramo 1 `[3, 4]`, tramo 2 `[4, 5]`, tramo 3 `[4, 5]`, tramo 4 `[2, 3]`.
- **Estación (B):** el transceptor es una entrega al aterrizar junto a la nave desguazada del hangar (un `BodyOverride` con `grant: "transceiver"`), no un depósito ni una compra.
- **Cometa E:** disparador `landedFor` con `seconds: 120` (unos 2 minutos sin despegar). Si despegas antes, el contador vuelve a cero.
- **Glitch de Halley (nuevo efecto):** agrega `{ halleyGlitch: number }` a `Effect` (segundos). Sube el daño de la señal de Halley (`halley.ts`: CRT y audio) a 1 durante esos segundos y vuelve solo al valor de la nave, sin tocar `hull`. Si suena un clip, se traba y se repite como en el daño máximo. Curva: sube a 1 en 0,3 s, se sostiene el resto y baja al valor de la nave en 0,8 s. Prende el CRT de Halley aunque no suene ningún clip. Lo usa la ficha F en `enterSystem` (`halleyGlitch: 4`), junto con la línea de llegada por id. Sin manifest, el glitch corre igual (es visual). Test puro de la curva: sube, se sostiene y vuelve.
- **Nombres (homenaje a Alien, aprobados en el Mapa).** Son nombres propios cerrados en Notion, no copy: pueden ir en el código.

  Agrega `starName?: string | null` a `StoryPlace` (`place.ts`) y pásalo a `createSystem` como `starNameForced`. Ojo: `makeSystem` prueba `starNameForced` como verdadero o falso (`world.ts`), así que `""` hoy cae en un nombre al azar. F pasa `""` y necesita que `""` signifique "sin nombre" (distinto de `null`, que sigue siendo "al azar"). El rumbo que lleva a cada ficha (`NearbyHeading.name`) usa el mismo nombre.

  | Ficha | Estrella (`starName`) | Cuerpo clave | Apodo |
  |---|---|---|---|
  | A | `Eta Caeli` | asteroide 2: `LV-114` | `Lethe` |
  | B | `Theta Pyxidis` | estación: `LV-387` | `Styx` |
  | C | `Kappa Fornacis` | naufragio: `LV-921` | `Cocytus` |
  | D | `Nu Pictoris` | Workshop viejo: `LV-1206` | colonia `Marlow's Rest` |
  | Tramo 4 y E | `Mu Doradus` (masiva) | mundo LUMEN: `LV-1540` | `Phlegethon` |
  | F | **sin nombre**: el campo de nombre queda vacío en el warp y el chart | — | — |

  - Los sistemas de los tramos llevan como estrella un código `LV-` con un número dentro del rango del tramo (tramo 1: 115–386, tramo 2: 388–920, tramo 3: 922–1205, tramo 4: 1207–1539). El nombre lo pone el **rumbo** que lleva a ese paso del tramo (el `NearbyHeading` con `target.leg`, que hoy nombra `rollNearby` en el sistema de origen) y viaja como `starName` al tirar el sistema. El número sale de la semilla del paso del tramo con un RNG aparte (`mulberry32(seed ^ 0x4c56)` o similar), para no correr los demás sorteos. Los rumbos de desvío siguen con los nombres al azar de hoy.
  - Naves (ids, por ahora no se muestran): la tuya `pcss-patna`, la del cometa `pcss-tremolino`, la misión muerta `pcss-torrens`.
  - Civilización: `civ`. Si un tipo o una función necesita nombre, usa `civ`; el nombre real se decide después.
- **Aceptación:** un test recorre la campaña "en papel" (marcas y grants en orden) y comprueba que cada tramo es cruzable con la nave que se gana antes de él, usando `jumpsPerTank`. Otro test comprueba que F no tiene nombre y que las fichas A–E usan los de la tabla.

### Fase 11: el modo aleatorio cambia (a propósito)

La única fase que **sí** cambia el modo aleatorio. Lo pidió Tomás el 11 oct. Va al final, cuando la campaña de la fase 10 se puede jugar entera. Dos PR, en este orden.

1. **Aleatorios a veces sin Home.**
   - En `makeSystem` sin receta, 1 de cada 6 sistemas sale sin Home habitada: la mitad con `home: "abandoned"` y la otra mitad con `home: "none"`. La decisión es función de la semilla con un **RNG aparte** (`mulberry32(seed ^ K)`, sin `Math.random`), para no correr los sorteos del resto del sistema. La proporción va en una constante (`RANDOM_HOMELESS_RATE = 1 / 6`) para ajustarla jugando.
   - El sistema con el que empieza la página siempre tiene Home habitada: en `?free`, la primera carga se tira con receta `home: "active"` (no se cambia la semilla).
   - Choque en modo aleatorio en un sistema sin Home: `rebootSim` tira una semilla nueva hasta tener Home habitada y te deja ahí con `freshShip()`, como hoy.
   - El snapshot **se regenera en este PR y solo en este**. El diff del snapshot tiene que mostrar solo cambios de Home (asiento 0, settlement y lo que dependa de él); si cambia otra cosa, está mal. agy lo revisa línea por línea.
   - Otros tests que usan una semilla fija y esperan Home (por ejemplo `adrift.test.ts` con `createSystem(3)`) pueden pasar `home: "active"` en la receta. No cambies lo que prueban.
   - **Aceptación:** test de la proporción en 600 semillas (entre 1/8 y 1/4.5), test de que la primera carga siempre tiene Home, test del reboot.
2. **La campaña es el modo por defecto.**
   - `/` empieza la campaña, o la retoma si hay guardado. `?free` es el modo aleatorio de siempre. `?campaign` sigue funcionando (alias de `/`); `?campaign=0`, `off` o `false` equivalen a `?free`. `?place=<id>` (la puerta de prueba, por ejemplo `probe`) funciona sin `?campaign`.
   - `campaignFromSearch` hoy devuelve un booleano; puede seguir así (true salvo `?free`, flags de debug o `?campaign=0`) o pasar a un modo `"campaign" | "free"`.
   - Los flags de debug del chart (`?camp`, `?belt`, `?twins`, `?settlement=`, `?mine=`) implican `?free`. `?dev` funciona en los dos modos.
   - En `?free`, nada lee ni escribe `orbit.campaign.v1`.
   - La pantalla de título no cambia.
   - **Aceptación:** test de `campaignFromSearch` (o su reemplazo) para `/`, `?free`, `?campaign`, `?campaign=0` y cada flag de debug.

## Qué no hacer

- No cambiar el modo aleatorio, salvo en la fase 11. El snapshot manda.
- No inventar física: aterrizar sigue siendo velocidad < 30 y despegar sigue siendo el empujón de hoy.
- No subir copy de líneas, muralla ni transmisiones. Solo ids.
- No mezclar dos fases en un PR.
- No reabrir decisiones cerradas fuera de las cuatro de arriba.
- No tocar los eclipses (`stampBodyShadows`, `pointUmbra`, `pointUmbraMax` en `src/game/draw.ts`).

## Gate de cada PR

`npm run typecheck`, `npm run lint` (cero errores), `npm test`, `npm audit --omit=dev --audit-level=high`, `npm run build`. Después, agy valida con [`AGY.md`](AGY.md). Commit y push solo cuando Tomás lo pida.
