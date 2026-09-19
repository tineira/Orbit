# Orbit docs (implementation)

Notion holds **definition, gameplay, and history**. This folder holds **how to build it**: PR splits, types, files, tests.

Canonical Notion space: [Orbit](https://app.notion.com/p/3d9a554c3c4081739622ed800df2f0f5). Start there for product. Start here before writing a PR.

| File | What it is | Notion sibling (player-facing) |
|---|---|---|
| `occupancy.md` | Settlement / civ types, weights, flags, PR split | [Mundos](https://app.notion.com/p/3dfa554c3c40810b838edf3fe5cceecd) |
| `comet.md` | Visitor actor, leftover warp heading, KeyC, PRs | [Cometa](https://app.notion.com/p/3dfa554c3c408183b66cd95df28a84da) |
| `voice.md` | Mirror of the visor-channel **lock** (not a PR plan). Line copy stays off GitHub. | [Voz](https://app.notion.com/p/3dfa554c3c40812bb79eee3fb015c23b) |

Do not put PR plans, file lists, or TypeScript sketches on Notion. Do not put lore, line copy, or closed product tables in this folder.

Runtime facts: `src/game/` wins if a note disagrees with code.
