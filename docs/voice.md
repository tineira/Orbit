# Voz: Visor Channel (Thoughts, Ship, Radio)

| Field | Value |
|---|---|
| **Author** | Orbit |
| **Date** | 2026-09-18 |
| **Status** | Locked |
| **Scope** | Client-side 2D space-flight (`src/game/*`). Visor headset. No campaign save, no LLM chat, no 3D walking. |

This document locks the visor voice channel. Product decisions in **Key Decisions** are final — do not reopen them in implementation PRs. **Line copy is not locked.** Sentences live on Historia and must not be published to GitHub until they are closed there.

Canonical Notion page: https://app.notion.com/p/3dfa554c3c40812bb79eee3fb015c23b under Orbit parent `3d9a554c3c4081739622ed800df2f0f5`. This file is a **repo mirror of the gameplay lock**, not a PR plan. Line copy stays on Historia.

This is not shipped. The visor today shows gauges, hints, and landing cards. There is no voice channel.

Sibling locks: occupancy (`docs/occupancy.md`) — radio **reads** `settlement` / `civ`, it does not add fields. Estética (Notion) — the channel is a cabin instrument. Combustible / Composición / Reabastecimiento / comet stay closed. Do not reopen them here.

---

## Overview

One visor channel. Four listeners. Not four UIs.

The player is the pilot. The ship is an apparatus. First-person is the 2D craft visor, not a walking FPS. You always have a headset. What changes is **who can answer**.

Landing cards stay world-voice (`flavorBody`, third person). Thoughts are first person. Do not merge them.

Hear and read together. Mute kills audio; text stays. Reduced motion skips pulse, not words.

---

## Ladder

| When | Tag | Who speaks | Player talks |
|---|---|---|---|
| From first takeoff | `thought` | you, to yourself | no — automatic |
| After first orbit lock or landing | `ship` | cabin computer | later: hold-to-talk. If nobody is in radio range, the key reaches the ship |
| Near active humans (Camp, Home, staffed pad) | `radio` | people on that body | same key; range picks the listener |
| After a named civ 2 exists | `radio` (different timbre) | them | same key; maybe you do not understand yet |

Camp is the first “other humans nearby” beat. Abandoned Signal is the opposite beat: the mast still points, nobody answers.

---

## Thoughts

Automatic. No key. Short. **Firsts and states**, not a chatterbox.

Audio is dry, close, in-head. Cabin-instrument family (not world synth). First pass may be visor text + tick, no recorded VO.

Triggers (one line, then quiet):

- first takeoff
- first orbit lock
- first landing
- empty tank / adrift clock
- first Camp on the scope
- comet warning
- warp / lost

No loop. No reminder every orbit. Historia owns the sentences; the runtime owns **when** they fire.

Procedural flavor: a line may name **this** Camp, then go quiet. No campaign save.

---

## Ship

Same strip, tag `SHIP`. Cabin instrument: CRT, recorded clip. Inherits Estética, not Asteroids.

Not a chatbot. Small grammar over sim state: orbit, fuel, hull, “nobody on that mast.”

**Talking to it** is hold-to-talk (no typing, no menu). One key, two listeners: radio if in range, else the ship.

It turns on as an instrument after the first Kepler lock or the first landing. The opening is still just your own head.

---

## Radio

Occupancy readout. Not a new world field.

- **Active human** (Home, Camp, staffed Workshop / Archive / Moon / Rock): carrier, someone answers.
- **Abandoned:** you key, static, nobody answers.
- **Unexplored:** no carrier.
- **Star / giant / barycenter:** occupancy null → no radio.

Range: **orbit lock or landed on that body**. Not a free-space phone. You fly to them, then you talk.

Do not pause flight. One or two short replies, then they go quiet. You can land and read the card after.

---

## Aliens

Not now. `CivId` is still `"human"`. Occupancy already requires a name plus one mechanical difference (copy is enough) before civ 2. When that exists, it is the same PTT with a different timbre, not a new UI.

Until then the ladder is: thoughts → ship → human radio.

---

## Key Decisions

1. **POV is the pilot.** The ship is an apparatus. First-person = 2D craft visor, not walking in 3D.
2. **One channel, four listeners.** No thought-log + console + radio panel + translator.
3. **Hear and read together.** Mute = audio off, text on. Reduced motion does not drop the text.
4. **Thoughts first, automatic, event-driven.** One line per first/state.
5. **Landing cards stay separate.** They remain `flavorBody` (third person). Thoughts are first person.
6. **One PTT key.** Range decides radio vs ship. No typing. No LLM. No dialogue tree that pauses yaw/burn.
7. **Radio reads occupancy.** Active answers; abandoned = static; unexplored = no carrier; null = no radio. Range = lock or landed. Camp is the first human beat.
8. **Aliens only with a named civ 2.** Do not invent alien radio or occupancy fields.
9. **Occupancy, Composición, Reabastecimiento, comet, and the Asteroids default stay closed.** The channel inherits the cabin CRT family.
10. **Copy is not locked.** Sentences live on Historia. Do not publish lines to GitHub until they are closed there.
11. **PTT key, ship name, and recorded VO vs visor tick are not locked.** `KeyV` is free after verbose was removed; it is a candidate, not a decision.
12. **Rollback is git revert.** No persistence of “I already talked to this Camp” across charts.

---

## What this is not

- Four UIs.
- Typing, LLM chat, or RPG trees on top of flight.
- Recorded clips on hail, spool, yaw, burn, warp.
- Walking around a Camp in 3D. Radio is the social beat; landing stays the 2D pad.
- Publishing copy to GitHub before Historia.
- New occupancy fields, alien fuel, or the comet as a voice.

---

## Shipped vs this lock

Shipped: visor (`FlightVisor` in `Overlay.tsx`), `OrbitHint`, landing cards (`flavorBody`), occupancy `settlement` / `civ`, cabin audio (spec CRT, life support), mute, reduced motion.

DEV probe (`?dev`): type a line, pick a tag (`thought` / `ship` / `radio` / `static` / `alien`), Play. The visor strip and a per-tag bed + speech synth (no recorded VO). `static` is abandoned radio (no speech). `alien` is a timbre preview, not civ 2. Mute still keeps the text. Not a PTT key and not world triggers.

Not now: PTT, ship grammar, range radio, event-driven thoughts, recorded VO, Historia copy.

When implementing the real channel (do not reopen this lock): keep the queue in `src/game/voice.ts` (`source` + `text` + `ttl`); publish on `HudSnapshot`; draw under the visor next to `OrbitHint`; audio beds per source; triggers from events that already exist (takeoff, lock, land, adrift, comet enter, `settlement === "active"`). The `?dev` probe stays a probe.
