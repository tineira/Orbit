# AGENTS.md — Orbit

**Short** session contract. Product definition, gameplay, and lore live in Notion. Implementation plans live in `docs/`.

## Git (human owns)

- `git commit` / `git push` only on explicit request in that moment.
- Local gate before a push (the real gate): `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- After a `git push` to `main`, the turn is done when the Vercel **production** deploy for that SHA is Ready (aliases `https://www.tineira.com` / `https://tineira.com`). Do **not** wait for GitHub Actions (this repo has none today). On a Vercel failure, diagnose, fix, and push again (in scope of the original push).
- If GitHub Actions exists later, it is a backstop: before your **next** push, check the latest `main` run. Red → fix first. Network flake → rerun failed and move on.
- Commits that touch no app code (docs, agent skills, CI config) may add `[skip ci] [skip deploy]` to the message: Actions (when present) and the Vercel build both skip (`vercel.json` `ignoreCommand`), and there is nothing to wait for.
