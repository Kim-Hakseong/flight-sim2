# flight-sim2

A deterministic, browser-based **6-DOF flight simulator that flies under a Ground
Control Station** (QGroundControl / Mission Planner) over MAVLink. The GCS is the
primary interface: it sees the vehicle's telemetry and commands it (missions, modes,
arm/takeoff/land). A HILS-style development simulator — not a game.

> Forked from `flight-sim2` and stripped down to the sim core + GCS loop.

## Run

### Sim only (no GCS)
```bash
python3 -m http.server 8123
# open http://localhost:8123
```

### With the GCS (MAVLink)
```bash
npm run bridge          # serves the sim on :8765 and speaks MAVLink on UDP :14550
# open http://localhost:8765
# start QGroundControl — it auto-connects to UDP 14550 and shows the aircraft.
```

The bridge (`bridge/server.mjs`) relays browser telemetry → MAVLink to the GCS, and
GCS missions/commands → the sim's autopilot (via SSE).

## Test
```bash
npm test                # pure physics / nav / MAVLink unit tests
```
Deterministic integration checks (need headless Chrome + a served page) live in
`tests/` — see `CLAUDE.md` §1.

## Dev surface (browser console)
- `window.__hils` — live state, sensors, actuators, nav, faults.
- `window.setWind(east, north, gust)` — inject wind/gusts.
- `window.injectFault(target, spec)` / `window.clearFaults()` — actuator/sensor faults.
- `window.__advance(seconds)` — step the deterministic sim headless.
- `window.__engView(bool)` — engineering / cinematic view toggle.

## Status
See `PRD.md` for the milestone roadmap (GCS-first) and `Log.md` for the work log.
