# CLAUDE.md — flight-sim2 Operating Manual

> Read first, every session. **PRD.md wins on any conflict.**
> Lineage: this repo drifted toward a game, then was **reset to a lean GCS-first
> build** (the game-era milestones remain in git history). The Ground Control
> Station / MAVLink loop is the point.

## 0. Constitution

1. **GCS is the north star.** Prefer work that makes the MAVLink loop (telemetry up,
   commands/missions down, vehicle responds) more complete and correct over anything
   cosmetic. If a task doesn't serve the GCS loop or the sim core it depends on, push
   back or defer it.
2. **Don't ask — decide.** If ambiguous, pick the simplest working option, do it, and
   leave a one-line rationale in Log.md. Only ask when blocked by something genuinely
   the user's (external accounts, irreversible infra).
3. **No merge without tests.** Physics/nav functions get unit tests; the GCS/command
   path gets an integration check; UI gets console-0 + a screenshot/DOM check.
4. **Deterministic stays deterministic.** Never make the fixed-step sim depend on wall
   clock or `Math.random()`/`Date.now()`. The `window.__advance` path must stay
   reproducible (it's the test + HILS surface).
5. **No log, no work.** Append to Log.md every loop (format §5).
6. **Stay lean.** Do not re-introduce cockpit models, multiple maps, weather presets,
   multiplayer, AI traffic, or scoring. New deps need a PRD update first.

## 1. Run / test

```bash
# Lean sim only (static):
python3 -m http.server 8123      # → http://localhost:8123

# With the GCS bridge (serves the sim AND speaks MAVLink to QGC on UDP 14550):
npm run bridge                   # → http://localhost:8765  + MAVLink :14550
# Then start QGroundControl; it auto-connects to UDP 14550.

# Unit tests (pure physics/nav):
npm test                         # node --test tests/*.test.mjs

# Deterministic checks (need a served page + headless Chrome over CDP):
node tests/console-check.mjs "http://localhost:8123/index.html?intro=0" <cdpPort>
node tests/landing-wind-det.mjs http://localhost:8123/index.html <cdpPort> truth 6 2.5
```

## 2. Architecture map

- `src/physics.js` — 6-DOF aero/atmosphere (pure functions, unit-tested).
- `src/sensors.js`, `src/estimator.js` — sensor error model + gated Kalman nav (FDE).
- `src/autopilot.js`, `src/missions.js` — guidance + mission sequencing.
- `src/telemetry.js` — sim → bridge telemetry (MAVLink relay).
- `src/missionLink.js` — bridge → sim commands/missions (SSE) → autopilot.
- `bridge/server.mjs`, `bridge/mavlink.mjs` — HTTP/SSE ↔ MAVLink v1 UDP to the GCS.
- `src/engineering.js` — HILS dev console (state vector, surfaces, faults, charts).
- `src/main.js` — wiring + the deterministic loop.

## 3. Conventions

- ES modules, no build step. Three.js r128 (global `window.THREE` from CDN).
- **Coordinate frame (do not confuse):** Three.js right-handed, +Y up, −Z forward.
  Body frame: +X right wing, +Y top, −Z nose. Signs: pitch-up +, roll-right +,
  yaw-right +. Put this comment atop every physics/3D module.
- Physics functions are pure (no side effects) and ≤ 50 lines. Comments say *why*.
- Names: `camelCase`, constants `UPPER_SNAKE`, files `kebab-case.js` / single word.

## 4. The GCS loop is the product

When adding a MAVLink message or command:
1. Decode/encode in `bridge/mavlink.mjs` (add a unit test in `tests/mavlink.test.mjs`).
2. Relay in `bridge/server.mjs` (telemetry out) or via SSE `/commands` (commands in).
3. Wire the sim side (`telemetry.js` to emit, `missionLink.js`/autopilot to act).
4. Verify against a real GCS when possible; always keep the deterministic tests green.

## 5. Log.md format (fixed)

```markdown
## YYYY-MM-DD — M{n}: <task>

**Status**: GREEN | RED | WIP
**Files changed**: ...
**Tests**: <unit pass/fail> · <console 0?> · <autoland PASS?> · <GCS check?>
**Decisions**:
- <one line>
**Next**:
- <next loop>
**Notes**:
- <context for the user>
```

## 6. Absolutely not

- ❌ Re-adding the stripped game features (cockpit/maps/weather/MP/scoring).
- ❌ Breaking determinism or the `window.__advance` / `__hils` / `setWind` /
  `injectFault` surface.
- ❌ Merging a physics/MAVLink change without a test.
- ❌ Proceeding to the next loop without a Log.md entry.
