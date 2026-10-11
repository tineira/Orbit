# AGENTS.md — Orbit

**Short** session contract. Coding agents auto-load this file. Keep it under ~60 lines.

## What it is

A small 2D space flight: TanStack Start, React 19, Vite, Canvas 2D. Every load charts a new system. Human play notes: [`README.md`](README.md).

## Docs

- Notion [Orbit](https://app.notion.com/p/3d9a554c3c4081739622ed800df2f0f5) holds definition, gameplay and story. `docs/` holds how it is built: types, files, tests, PR splits. Index: [`docs/README.md`](docs/README.md).
- Docs prose in **tuteo** (tú), never voseo. Code identifiers, comments, commits and PRs in English.
- Each doc's **Decisiones cerradas** are final. Do not reopen them in a PR.
- If a doc disagrees with the code, `src/game/` wins. Fix the doc in the same session.
- New tests go on the explicit list in `package.json` `test`, or they never run.
- Visor line copy is not locked and is not published to GitHub until closed in Notion. Speech lives only behind `?dev`.

## Git (human owns)

- `git commit` / `git push` only on explicit request in that moment.
- Local gate before a push: `npm run typecheck`, `npm run lint` (zero errors), `npm test`, `npm audit --omit=dev --audit-level=high`, and `npm run build`, plus a **Reviewer from another harness** on the diff (Grok unattended; never Codex unattended). Fix what the Reviewer finds before pushing.
- No GitHub Actions here. The local gate is the gate; a green production deploy is the close-out.
- `npm run build` runs `db:migrate`, which skips without `DATABASE_URL`. That is fine locally.
- Throwaway verification shots go in `.playwright-mcp/` (gitignored) or `tmp/`, never the repo root.

## Do not

- Commit `.env*` or any key.
- Put PR plans, file lists or TypeScript sketches in Notion, or lore and line copy in `docs/`.
- Reopen a closed decision inside an implementation PR.

## Conflict

- **This file** wins for how to work in this repo.
- Notion Orbit wins for what the game is. If they disagree, update the loser in the same session.
