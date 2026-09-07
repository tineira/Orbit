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
  orbitE?: number;
  orbitPeri?: number;
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

export type SolarFlare = {
  angle: number;
  span: number;
  spin: number;
  reach: number;
  baseW: number;
  life: number;
  max: number;
  seed: number;
  strands: number;
};

export type Phase = "creating" | "title" | "flight" | "landed" | "crashed";

export type BurnCause = "flare" | "star";

export type FlightStatus = "deep" | "approach" | "orbit" | "lagrange" | "too-fast" | "landed" | "crashed";

export type VerboseDiag = {
  gate: string;
  ok: boolean;
  relSpeed: number;
  vCirc: number | null;
  ecc: number | null;
  eccLim: number;
  energy: number | null;
  alt: number | null;
  shellMin: number | null;
  shellMax: number | null;
  drag: number;
  dragLim: number;
  perturb: number;
  perturbLim: number;
  accelG: number;
  accelThrust: number;
  accelDrag: number;
  well: number | null;
  wellLim: number | null;
  periAlt: number | null;
  apoAlt: number | null;
  lagrange: string | null;
};

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
  burned: boolean;
  burnCause: BurnCause | null;
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
  verbose: boolean;
  verboseDiag: VerboseDiag | null;
};

export type InputState = {
  keys: Set<string>;
  qaKeys: string[] | null;
  qaSteer: number | null;
  pointer: { x: number; y: number; down: boolean } | null;
};

export type GameUiHandler = (hud: HudSnapshot) => void;
