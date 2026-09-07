# Orbit

A small 2D space flight. You are a craft with mass and inertia. Each world has its own well. Catch a circular or elliptical orbit and it locks. Burn to leave. Land if you arrive slow.

Every load charts a new system — names, sizes, and orbits are rolled on the spot.

## Fly

- **Left / right** (or A / D) yaw
- **Up** (or W) burns
- **Down** (or S) retro
- **Enter** enters the system, takes off, or reboots after a crash
- **N** (or **Create new world**) charts a new system from the title or after a crash
- On a phone, hold the sky — the ship turns toward your finger and fires

Arrive slow enough to land. Too fast and the well wins.

## Run

```bash
npm install
npm run dev
```

Then open the URL Vite prints. `npm run build` produces a production bundle.

## Stack

TanStack Start, React 19, Vite, Canvas 2D.
