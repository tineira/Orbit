export type PlanetKind = "star" | "rocky" | "gas" | "moon" | "asteroid" | "barycenter";

/** Closed catalog. What a body or its atmosphere can be made of. */
export type SubstanceId =
  | "h2"
  | "he"
  | "n2"
  | "co2"
  | "ch4"
  | "nh3"
  | "d"
  | "he3"
  | "lumen"
  | "h2o"
  | "silicate"
  | "iron"
  | "carbon"
  | "sulfur";

export type MixEntry = { id: SubstanceId; fraction: number };
export type Mix = MixEntry[];

/** Named recipes. A charted body picks one; barycenters have none. */
export type MatterProfileId =
  | "star-warm"
  | "star-hot"
  | "rocky-home"
  | "rocky-workshop"
  | "rocky-signal"
  | "rocky-archive"
  | "rocky-twin"
  | "gas-ammonia"
  | "gas-methane"
  | "gas-ice"
  | "gas-sulfur"
  | "gas-water"
  | "moon-rock"
  | "moon-ice"
  | "moon-ammonia"
  | "moon-he3"
  | "moon-deuterium"
  | "asteroid-silicate"
  | "asteroid-iron"
  | "asteroid-ice"
  | "asteroid-carbon";

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
  /** Asteroid silhouette. Ignored on round bodies. */
  shapeSeed?: number;
  /** Body-frame angle of the landing face, before spin. */
  padAngle?: number;
  /** Locked recipe. Null on barycenters. Not drawn. */
  matter: MatterProfileId | null;
  bulk: Mix;
  atmosphere: Mix;
};

export type FuelKind = "ch4" | "nh3" | "h2" | "ntr" | "d" | "he3" | "lumen" | "hush";

export type EngineKind = "v1" | "v2" | "thermal" | "torch" | "lumen" | "coil";

export type TankKind = "fuel" | "long" | "cryo" | "hold" | "cistern";

export type Ship = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  yaw: number;
  mass: number;
  dryMass: number;
  fuel: number;
  fuelCapacity: number;
  fuelKind: FuelKind;
  engineKind: EngineKind;
  tankKind: TankKind;
  engineIsp: number;
  engineThrust: number;
  thrusting: boolean;
  reverse: boolean;
};

export type IonWisp = {
  hostId: string;
  ox: number;
  oy: number;
  ux: number;
  uy: number;
  age: number;
  life: number;
  glow: number;
  r: number;
  g: number;
  b: number;
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
  starDriftX: number;
  starDriftY: number;
};

export type WarpRing = {
  x: number;
  y: number;
  age: number;
  life: number;
  seed: number;
  kind: "launch" | "arrive";
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

export type Phase = "creating" | "title" | "flight" | "landed" | "crashed" | "transit";

export type TransitBeat = "tunnel" | "streak" | "brake";

export type BurnCause = "flare" | "star";

export type CrashKind = "burn" | "wreck" | "sink" | "lost";

export type NearbyHeading = {
  angle: number;
  color: string;
  pal: [string, string, string];
  name: string;
};

export type LostCopy = {
  kicker: string;
  title: string;
  body: string;
};

export type FlightStatus =
  | "deep"
  | "approach"
  | "orbit"
  | "lagrange"
  | "too-fast"
  | "landed"
  | "crashed"
  | "warp";

export type CompositionReadout = {
  atmosphere: string | null;
  bulk: string | null;
};

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
  fuel: number;
  fuelCapacity: number;
  fuelKind: FuelKind;
  refueling: boolean;
  engineKind: EngineKind;
  tankKind: TankKind;
  engineIsp: number;
  engineThrust: number;
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
  crashKind: CrashKind | null;
  lostCopy: LostCopy | null;
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
  spectro: boolean;
  spectroScan: number;
  spectroScanning: boolean;
  composition: CompositionReadout | null;
  dev: boolean;
  warpCharge: number;
  transitBeat: TransitBeat | "off";
};

export type InputState = {
  keys: Set<string>;
  /** keydown edges waiting for a poll; survives a keyup before the next frame. */
  presses: Set<string>;
  qaKeys: string[] | null;
  qaSteer: number | null;
  pointer: { x: number; y: number; down: boolean } | null;
};

export type GameUiHandler = (hud: HudSnapshot) => void;
