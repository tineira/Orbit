# Instrucciones para Grok (implementa)

Implementas [`README.md`](README.md) de esta carpeta, **una fase por PR, en orden**. agy valida cada fase con [`AGY.md`](AGY.md) antes de que Tomás la mergee.

## Antes de escribir código

1. Lee `AGENTS.md` (raíz del repo) completo. Manda sobre cómo trabajar aquí.
2. Lee `docs/worlds/README.md` completo, y `docs/README.md`.
3. Lee los archivos que vas a tocar en `src/game/` (sobre todo `world.ts`, `sim.ts`, `fuel.ts`, `occupancy.ts`, `runtime.ts`). Si el spec dice algo distinto del código, **gana el código**: avísale a Tomás en tu reporte, no lo inventes.
4. No necesitas Notion para implementar. Si algo del spec no se entiende sin Notion, es un hueco del spec: anótalo en el reporte y sigue con lo demás.

## Cómo trabajar cada fase

- Rama: `worlds/phase-N-<slug>` desde `main` actualizado (por ejemplo `worlds/phase-1-recipe`).
- Haz **solo** lo que dice esa fase. Si ves algo roto fuera de la fase, anótalo en el reporte; no lo arregles en el mismo PR.
- Escribe los tests **primero** cuando la fase lo pide (el snapshot de la fase 1 se toma antes de tocar `makeSystem`).
- Cada test nuevo va a la lista de `"test"` en `package.json`. Si no está en la lista, no corre.
- Identificadores, comentarios y mensajes de commit en inglés. Todo texto dentro del juego en inglés.
- **Nada de copy de historia** en el repo: ni líneas de voz, ni textos de muralla, ni transmisiones. Solo ids. Los manifests de prueba van en `public/dev/` y se leen solo con `?dev`, igual que `halley.ts` y `pilot.ts`.
- No cambies el modo aleatorio. El test de snapshot tiene que pasar sin regenerarlo. Si crees que hay que regenerarlo, para y pregúntale a Tomás.
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
Work on a new branch worlds/phase-N-<slug> from an up-to-date main.
Do only phase N. Random mode must stay identical (the snapshot test must pass unchanged).
No story copy in the repo: ids only.
Run the full gate (typecheck, lint, test, audit, build).
Write tmp/worlds-phase-N-report.md as GROK.md describes, ending with DONE.
Do not commit or push unless I ask.
```
