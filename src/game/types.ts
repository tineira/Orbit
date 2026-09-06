export type PlanetKind = "star" | "rocky" | "gas" | "moon";

export type Planet = {
  id: string;
  name: string;
  kind: PlanetKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  surfaceG: number;
  landable: boolean;
  rotate: number;
  spin: number;
  colorA: string;
  colorB: string;
  atmo: string;
  bands?: string[];
  parentId?: string;
  orbitR?: number;
  orbitA?: number;
  orbitW?: number;
  kicker: string;
  title: string;
  body: string;
  href?: { label: string; url: string };
  deny?: string;
};

export type Ship = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  yaw: number;
  mass: number;
  thrusting: boolean;
  reverse: boolean;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue: number;
  alive: boolean;
};

export type Camera = {
  x: number;
  y: number;
  zoom: number;
  zoomAuto: number;
  userZoom: number;
  shake: number;
  trauma: number;
};

export type Phase = "creating" | "title" | "flight" | "landed" | "crashed";

export type FlightStatus = "deep" | "approach" | "orbit" | "lagrange" | "too-fast" | "landed" | "crashed";

export type HudSnapshot = {
  phase: Phase;
  speed: number;
  drag: number;
  headingDeg: number;
  mass: number;
  nearestId: string | null;
  nearestName: string | null;
  altitude: number | null;
  status: FlightStatus;
  orbitHint: string | null;
  orbitLocked: boolean;
  orbitEcc: number;
  landedId: string | null;
  crashedId: string | null;
  muted: boolean;
  touching: boolean;
  gravityScale: number;
  atmoScale: number;
  orbitShell: boolean;
  lagrangePoints: boolean;
  lagrangeLocked: boolean;
  lagrangeLabel: string | null;
  physicsMenu: boolean;
  gravityGrid: boolean;
};

export type InputState = {
  keys: Set<string>;
  qaKeys: string[] | null;
  qaSteer: number | null;
  pointer: { x: number; y: number; down: boolean } | null;
};

export type GameUiHandler = (hud: HudSnapshot) => void;
