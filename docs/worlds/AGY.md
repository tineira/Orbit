# Instrucciones para agy (valida)

Validas cada fase que Grok implementa de [`README.md`](README.md). No escribes la fase: la revisas, la pruebas y das un veredicto. Si encuentras algo, lo reportas con `archivo:línea` y un caso concreto; Grok lo arregla.

## Qué recibes

- La rama de la fase (`worlds/phase-N-<slug>`).
- El reporte de Grok: `tmp/worlds-phase-N-report.md`.
- Las páginas de Notion de la tabla Fuentes de `README.md`, si tienes acceso. Úsalas para revisar que lo implementado calza con lo que es el juego; no las edites.

## Qué revisas, en este orden

### 1. El gate, tú mismo

```bash
git fetch origin && git checkout worlds/phase-N-<slug>
npm install --ignore-scripts --no-save
npm run typecheck
npm run lint
npm test
npm audit --omit=dev --audit-level=high
npm run build
```

Compara con `main`: un fallo que ya estaba en `main` no es de la fase, pero anótalo.

### 2. Los invariantes (valen para todas las fases)

- [ ] **Modo aleatorio idéntico.** `src/game/world-snapshot.test.ts` pasa y su snapshot **no** cambió en el diff (`git diff main -- '*snapshot*'`). Si cambió, es FAIL salvo en la fase 11, punto 1: ahí tiene que cambiar, y solo en lo que depende de Home.
- [ ] **Sin copy de historia.** Busca en el diff frases en inglés que parezcan líneas de voz, muralla o transmisión. Solo ids. Los manifests con texto viven en `public/dev/` y se leen solo con `?dev`.
- [ ] **Solo la fase N.** Nada de cambios de otras fases ni refactors no pedidos.
- [ ] **Tests en la lista.** Cada `*.test.ts` nuevo aparece en `"test"` de `package.json`.
- [ ] **Eclipses intactos.** `stampBodyShadows`, `pointUmbra` y `pointUmbraMax` en `src/game/draw.ts` sin cambios.
- [ ] **Modo campaña aislado** (desde la fase 3): sin `?campaign`, el juego no lee ni escribe `localStorage` de campaña y `rebootSim` sigue mandando a Home con la nave de arranque.

### 3. La aceptación de la fase

Cada fase de `README.md` termina con **Aceptación**. Verifica cada punto contra el código y los tests. Lee los tests: un test que no prueba lo que dice no cuenta.

### 4. Prueba a mano

`npm run dev` y abre el juego.

| Fase | Qué probar |
|---|---|
| 1 | `/` en varias cargas: se ve como siempre. `?camp`, `?belt`, `?twins`, `?settlement=abandoned` siguen funcionando |
| 2 | Un sistema con estrella masiva (por la vía que deje la fase): radio, corona y flares escalados; los planetas no quedan adentro de la corona |
| 3 | `/?campaign`: aterriza en un pad, carga, recarga la página: vuelves al mismo lugar con la misma nave. Choca: vuelves al checkpoint, no a Home con V1 |
| 4 | La ficha de prueba: empiezas fuera de Home, el asteroide retrógrado gira al revés, el pad sin gente carga |
| 5 | Disparadores de la ficha de prueba: cada uno una sola vez; recargar la página no los repite |
| 6 | Un tramo de prueba: siguiendo el rumbo llegas a la ficha en N saltos; un desvío no rompe el tramo; en el puente no hay dónde cargar |
| 7 | Cada entrega se instala; en campaña el pad no te baja el motor |
| 8 | Cada recarga nueva con su condición (sin trap no hay skim, sin Cryo el H2 gotea, el paso rasante calienta) |
| 9 | El cometa se aterriza solo igualando velocidad; en perihelio solo con LUMEN |
| 10 | La campaña de la fase 1 de punta a punta con `?dev` para acelerar donde haga falta. Al llegar a F, Halley se traba unos segundos y vuelve; F no tiene nombre en el warp ni en el chart |
| 11 | `/` empieza o retoma la campaña; `?free` es el aleatorio; `?camp` cae en aleatorio. En `?free`, varias cargas: algunos sistemas sin Home; chocar en uno te deja en un sistema con Home |

### 5. Lee el diff como adversario

¿Qué rompe esto? Semillas raras, sistemas sin gigante, sin cinturón, `home: "none"` en modo aleatorio, cargar un guardado viejo o corrupto, `localStorage` bloqueado, reduced motion, la pantalla de título.

## Veredicto

Escribe `tmp/worlds-phase-N-review.md`:

1. **PASS** o **FAIL** en la primera línea.
2. Gate: resumen de cada comando.
3. Invariantes: cada casilla con ✓ o ✗.
4. Hallazgos, de más grave a menos, cada uno con `archivo:línea`, qué pasa y cómo reproducirlo.
5. Notas que no bloquean.
6. Última línea: `DONE`.

FAIL si: falla el gate por culpa de la fase, se rompe un invariante, o falta un punto de la aceptación.

## Prompt para empezar

Copia esto en agy, cambiando `N` y la rama:

```text
You are validating phase N of docs/worlds/README.md in the Orbit repo. Grok implemented it on branch worlds/phase-N-<slug>; its report is tmp/worlds-phase-N-report.md.
Read AGENTS.md, docs/worlds/README.md and docs/worlds/AGY.md, then follow AGY.md exactly: run the gate yourself, check every invariant, verify the phase's acceptance against code and tests, test by hand, and read the diff adversarially.
Do not fix anything yourself. Write tmp/worlds-phase-N-review.md with PASS or FAIL on the first line and DONE on the last.
```
