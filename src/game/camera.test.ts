import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSim,
  rebootSim,
  setUserZoom,
  stepSim,
  takeoff,
  USER_ZOOM_MAX,
  USER_ZOOM_MIN,
} from "./sim.ts";
import { createSystem } from "./world.ts";

const idle = {
  steer: 0,
  forward: false,
  reverse: false,
  aimYaw: null,
  aimThrust: false,
};

test("the pad starts almost fully zoomed in", () => {
  createSystem(1);
  const sim = createSim();
  assert.equal(sim.padZoomLock, true);
  assert.ok(sim.camera.zoomAuto > 6, `zoomAuto ${sim.camera.zoomAuto}`);
  assert.ok(sim.camera.zoom > 6, `zoom ${sim.camera.zoom}`);
  sim.viewCssW = 1280;
  sim.viewCssH = 800;
  stepSim(sim, 1 / 60, idle);
  assert.ok(sim.camera.zoomAuto > 6, `zoomAuto after step ${sim.camera.zoomAuto}`);
});

test("zoom-out stays locked until takeoff", () => {
  createSystem(1);
  const sim = createSim();
  const z0 = sim.camera.userZoom;
  setUserZoom(sim, 0.2);
  assert.equal(sim.camera.userZoom, z0);
  takeoff(sim);
  assert.equal(sim.padZoomLock, false);
  setUserZoom(sim, 0.2);
  assert.equal(sim.camera.userZoom, Math.max(USER_ZOOM_MIN, 0.2));
});

test("takeoff eases out to the user's max zoom, not the whole chart", () => {
  createSystem(1);
  const sim = createSim();
  sim.viewCssW = 1280;
  sim.viewCssH = 800;
  const padZ = sim.camera.zoom;
  takeoff(sim);
  assert.equal(sim.padZoomLock, false);
  assert.equal(sim.camera.userZoom, USER_ZOOM_MAX);
  assert.ok(Math.abs(sim.camera.zoom - padZ) < 1e-6, `zoom jumped on unlock ${sim.camera.zoom}`);
  for (let i = 0; i < 240; i++) stepSim(sim, 1 / 60, idle);
  assert.equal(sim.camera.userZoom, USER_ZOOM_MAX);
  assert.ok(sim.camera.zoom > 2.2, `zoom ${sim.camera.zoom} pulled out past user max`);
  assert.ok(sim.camera.zoom < padZ, `still eases out from the pad ${sim.camera.zoom} vs ${padZ}`);
});

test("rebooting on the pad restores the close zoom lock", () => {
  createSystem(1);
  const sim = createSim();
  takeoff(sim);
  setUserZoom(sim, 0.2);
  rebootSim(sim);
  assert.equal(sim.padZoomLock, true);
  assert.equal(sim.camera.userZoom, 1);
  assert.ok(sim.camera.zoomAuto > 6);
});
