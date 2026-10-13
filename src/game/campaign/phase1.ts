import type { Leg } from "../leg.ts";
import type { StoryPlace } from "../place.ts";

/** Ship ids. Not shown yet. */
export const PHASE1_SHIPS = {
  patna: "pcss-patna",
  tremolino: "pcss-tremolino",
  torrens: "pcss-torrens",
} as const;

/** Civilization name until the real one is chosen. */
export const PHASE1_CIV = "civ";

const HOLD_S = 120;

/**
 * Phase 1 cards. Text is ids. Seeds are the first charts that hold each card's bodies.
 * G is not a star. At F, one leaving comet is marked; landing on it is G.
 */
export const PHASE1_PLACES: StoryPlace[] = [
  {
    id: "star-a",
    seed: 8,
    starName: "Eta Caeli",
    recipe: { home: "none", belt: { camp: false, landable: 3 }, activePads: 0 },
    start: { ref: "a2", fuel: 12 },
    bodies: [
      {
        ref: "a1",
        match: { kind: "asteroid", index: 0 },
        pad: "on",
        settlement: "abandoned",
        grant: { engine: "v2" },
      },
      {
        ref: "a2",
        match: { kind: "asteroid", index: 1 },
        pad: "off",
        settlement: "abandoned",
        name: "LV-114",
        nickname: "Lethe",
      },
      {
        ref: "a3",
        match: { kind: "asteroid", index: 2 },
        retrograde: true,
        settlement: "abandoned",
      },
    ],
    triggers: [
      {
        on: "approach",
        ref: "a2",
        radius: 480,
        effects: [{ setFlag: "sawCrew" }, { thought: "thought:a2-ship" }],
      },
      {
        on: "approach",
        ref: "a2",
        radius: 200,
        effects: [{ setFlag: "sawWall" }, { text: "text:a2-wall" }],
      },
      {
        on: "land",
        ref: "a1",
        effects: [
          { setFlag: "hasV2" },
          { logFragment: 1 },
          { halley: "halley-a1" },
          { thought: "thought:a1-clean" },
        ],
      },
      {
        on: "orbitLock",
        ref: "a3",
        effects: [
          { setFlag: "stationHeading" },
          { text: "text:a3-tx" },
          { thought: "thought:a3-fear" },
          { revealHeading: "star-b" },
        ],
      },
    ],
  },
  {
    id: "star-b",
    seed: 21,
    starName: "Theta Pyxidis",
    headingRequires: "stationHeading",
    recipe: { home: "active", belt: { camp: false, landable: 1 } },
    bodies: [
      {
        ref: "b1",
        match: { kind: "rocky", kicker: "Home" },
        name: "LV-387",
        nickname: "Styx",
      },
      {
        ref: "b2",
        match: { kind: "asteroid", index: 0 },
        settlement: "abandoned",
        pad: "off",
        grant: { module: "transceiver" },
      },
    ],
    triggers: [
      { on: "enterSystem", effects: [{ text: "text:b-welcome" }] },
      {
        on: "approach",
        ref: "b1",
        radius: 360,
        effects: [{ setFlag: "sawList" }, { thought: "thought:b-list" }],
      },
      {
        on: "land",
        ref: "b2",
        effects: [
          { setFlag: "hasTransceiver" },
          { logFragment: 2 },
          { halley: "halley-b" },
          { revealHeading: "star-c" },
        ],
      },
    ],
  },
  {
    id: "star-c",
    seed: 34,
    starName: "Kappa Fornacis",
    headingRequires: "transceiver",
    recipe: { home: "abandoned", belt: "dense", activePads: 0 },
    bodies: [
      {
        ref: "c1",
        match: { kind: "asteroid", index: 0 },
        name: "LV-921",
        nickname: "Cocytus",
        grant: { tank: "long" },
      },
    ],
    triggers: [
      {
        on: "approach",
        ref: "c1",
        radius: 500,
        effects: [{ halley: "halley-c-same" }],
      },
      {
        on: "approach",
        ref: "c1",
        radius: 180,
        effects: [{ setFlag: "childhood" }, { thought: "thought:c-child" }],
      },
      {
        on: "land",
        ref: "c1",
        effects: [
          { setFlag: "hasLongTank" },
          { logFragment: 3 },
          { revealHeading: "star-d" },
        ],
      },
    ],
  },
  {
    id: "star-d",
    seed: 55,
    starName: "Nu Pictoris",
    headingRequires: "hasLongTank",
    recipe: {
      home: "none",
      activePads: 0,
      belt: "none",
      rocky: { count: 2, roles: ["workshop"] },
    },
    bodies: [
      {
        ref: "d1",
        match: { kind: "rocky", kicker: "Workshop" },
        workshop: true,
        pad: "off",
        settlement: "abandoned",
        name: "LV-1206",
        nickname: "Marlow's Rest",
      },
    ],
    triggers: [
      {
        on: "orbitLock",
        ref: "d1",
        effects: [
          { setFlag: "cometHeading" },
          { text: "text:d-lie" },
          { revealHeading: "star-massive-1" },
        ],
      },
      {
        on: "land",
        ref: "d1",
        effects: [{ logFragment: 4 }, { thought: "thought:d-child" }],
      },
    ],
  },
  {
    id: "star-massive-1",
    seed: 89,
    starName: "Mu Doradus",
    headingRequires: "cometHeading",
    recipe: { star: "massive", home: "none", rocky: { count: 3, roles: ["signal"] } },
    cometRequires: { fuel: "lumen" },
    cometScene: "perihelion",
    cometRef: "comet",
    bodies: [
      {
        ref: "e1",
        match: { kind: "rocky", kicker: "Signal", index: 0 },
        lumen: true,
        settlement: "abandoned",
        name: "LV-1540",
        nickname: "Phlegethon",
      },
    ],
    triggers: [
      {
        on: "landedFor",
        ref: "comet",
        seconds: HOLD_S,
        effects: [
          { setFlag: "knowsTruth" },
          { logFragment: 5 },
          { halley: "halley-e-fight" },
          { revealHeading: "star-f" },
        ],
      },
    ],
  },
  {
    id: "star-f",
    seed: 13,
    starName: "",
    recipe: { twins: "on", star: "hot", rocky: { count: 3 } },
    cometRequires: { module: "hushDetector" },
    cometCiv: true,
    cometScene: "marked",
    cometRef: "comet",
    bodies: [
      {
        ref: "f1",
        match: { kind: "rocky", kicker: "Twin", index: 0 },
        grant: { module: "hushDetector" },
      },
    ],
    triggers: [
      {
        on: "enterSystem",
        effects: [
          { halleyGlitch: 4 },
          { halley: "halley-f-arrive" },
          { setFlag: "halleyGlitchF" },
        ],
      },
      {
        on: "land",
        ref: "f1",
        effects: [{ setFlag: "hasDetector" }, { thought: "thought:f-ask" }],
      },
      {
        on: "takeoff",
        ref: "f1",
        effects: [{ setFlag: "hushMarked" }],
      },
    ],
  },
];

/** A → B → C → D → E. F is the comet jump. G is the marked comet. */
export const PHASE1_LEGS: Leg[] = [
  {
    id: "leg-1",
    from: "star-a",
    to: "star-b",
    length: [3, 4],
    fuel: "ch4",
    codes: [115, 386],
    base: { activePads: 1, belt: "soft" },
  },
  {
    id: "leg-2",
    from: "star-b",
    to: "star-c",
    length: [4, 5],
    fuel: "nh3",
    codes: [388, 920],
    base: { activePads: 0, home: "none", belt: "none", gas: "ammonia" },
    steps: {
      0: {
        recipe: { belt: { camp: true }, activePads: 1, gas: "ammonia" },
        grant: { module: "atmoTrap" },
      },
    },
  },
  {
    id: "leg-3",
    from: "star-c",
    to: "star-d",
    length: [4, 5],
    fuel: "ch4",
    codes: [922, 1205],
    base: { activePads: 0, home: "none", belt: "none", gas: "ice" },
    steps: {
      0: { bridge: true, recipe: { gas: "none" } },
      1: { recipe: { moons: [{ settlement: "abandoned" }] } },
    },
  },
  {
    id: "leg-4",
    from: "star-d",
    to: "star-massive-1",
    length: [2, 3],
    fuel: "ntr",
    codes: [1207, 1539],
    base: { activePads: 0, home: "none", belt: "none", gas: "none", star: "warm" },
    steps: {
      0: { bridge: true },
      1: { guarantee: { gas: "ammonia", rocky: { count: 1, roles: ["workshop"] } } },
    },
  },
];
