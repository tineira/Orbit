# Instrucciones para Grok (implementa)

Implementas [`README.md`](README.md) de esta carpeta, **una fase por PR, en orden**. agy valida cada fase con [`AGY.md`](AGY.md) antes de que Tomás la mergee.

## Antes de escribir código

1. Lee `AGENTS.md` (raíz del repo) completo. Manda sobre cómo trabajar aquí.
2. Lee `docs/worlds/README.md` completo, y `docs/README.md`.
3. Lee los archivos que vas a tocar en `src/game/` (sobre todo `world.ts`, `sim.ts`, `fuel.ts`, `occupancy.ts`, `runtime.ts`). Si el spec dice algo distinto del código, **gana el código**: avísale a Tomás en tu reporte, no lo inventes.
4. **Lee en Notion las páginas de la tabla Fuentes de `README.md`** antes de cada fase, empezando por [Construcción de mundos](https://app.notion.com/p/3f6a554c3c4081a89556d1ab58f82edf) y el [Mapa de la fase 1](https://app.notion.com/p/3f6a554c3c4081cf961ed0d9604d76fe). Notion dice **qué** es el juego; este spec dice **cómo** construirlo. Para la fase 8 lee también Reabastecimiento y Descubrimiento; para la fase 10, el Mapa completo.
5. Si Notion y este spec no calzan sobre qué es el juego, gana Notion: implementa lo de Notion y anótalo en el reporte. Notion solo se lee: no lo edites. Las páginas de Notion dicen "(borrador)" en el título, pero lo marcado con ✅ está decidido y manda. Lo que siga como propuesta sin ✅ se implementa como dice el spec.

## Cómo trabajar cada fase

- Rama: `worlds/phase-N-<slug>` desde `main` actualizado (por ejemplo `worlds/phase-1-recipe`).
- Haz **solo** lo que dice esa fase. Si ves algo roto fuera de la fase, anótalo en el reporte; no lo arregles en el mismo PR.
- Escribe los tests **primero** cuando la fase lo pide (el snapshot de la fase 1 se toma antes de tocar `makeSystem`).
- Cada test nuevo va a la lista de `"test"` en `package.json`. Si no está en la lista, no corre.
- Identificadores, comentarios y mensajes de commit en inglés. Todo texto dentro del juego en inglés.
- **Nada de copy de historia** en el repo: ni líneas de voz, ni textos de muralla, ni transmisiones. Solo ids. Los manifests de prueba van en `public/dev/` y se leen solo con `?dev`, igual que `halley.ts` y `pilot.ts`.
- No cambies el modo aleatorio. El test de snapshot tiene que pasar sin regenerarlo. La única excepción es la fase 11, punto 1, que lo regenera a propósito. Si crees que hay que regenerarlo en otra fase, para y pregúntale a Tomás.
- No toques los eclipses (`stampBodyShadows`, `pointUmbra`, `pointUmbraMax` en `src/game/draw.ts`).

## Gate (antes de pedir validación)

```bash
npm run typecheck
npm run lint            # cero errores
npm test
npm audit --omit=dev --audit-level=high
npm run build
```

Si algo falla y ya fallaba en `main` antes de tu cambio, dilo en el reporte con la salida. Si lo rompiste tú, arréglalo.

Para probar a mano: `npm install --ignore-scripts --no-save` y `npm run dev`. Modo aleatorio: `/`. Campaña (desde la fase 3): `/?campaign`. Herramientas: `?dev`.

## Reporte

Al terminar cada fase escribe `tmp/worlds-phase-N-report.md` con:

1. Qué hiciste, en 5–10 líneas.
2. Archivos tocados.
3. Tests nuevos y la salida del gate (resumen).
4. Cómo probarlo a mano (URL y pasos).
5. Dudas o huecos del spec.
6. Última línea: `DONE`.

No hagas commit ni push hasta que Tomás lo pida. Cuando lo pida: commit en la rama de la fase y push de esa rama (nunca a `main` sin que lo diga).

## Prompt para empezar

Copia esto en Grok, cambiando `N`:

```text
You are implementing docs/worlds/README.md in the Orbit repo, phase N only.
Read AGENTS.md, docs/README.md and docs/worlds/README.md first, then docs/worlds/GROK.md and follow it exactly.
Before coding, read the Notion pages listed under Fuentes in docs/worlds/README.md (start with Construcción de mundos and Mapa de la fase 1). Notion says what the game is; the spec says how to build it. Read Notion only, never edit it.
Work on a new branch worlds/phase-N-<slug> from an up-to-date main.
Do only phase N. Random mode must stay identical (the snapshot test must pass unchanged), except in phase 11 step 1.
No story copy in the repo: ids only.
Run the full gate (typecheck, lint, test, audit, build).
Write tmp/worlds-phase-N-report.md as GROK.md describes, ending with DONE.
Do not commit or push unless I ask.
```
