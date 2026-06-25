# PRD — flight-sim2

## Vision

A deterministic, browser-based **6-DOF flight simulator whose primary interface is a
Ground Control Station (GCS)** over MAVLink. The simulated aircraft streams telemetry
to the GCS (QGroundControl / Mission Planner) and is **commanded by the GCS** —
missions, mode changes, arm / takeoff / land — closing the loop:

```
GCS command ──▶ autopilot ──▶ 6-DOF sim ──▶ telemetry ──▶ GCS
       ▲                                                    │
       └──────────────────── feedback ──────────────────────┘
```

This is a **HILS-style development simulator, not a game.** No cockpit eye-candy,
multiple maps, weather presets, scoring, or multiplayer.

## Core principles

1. **The GCS is the boss.** The sim behaves like a real vehicle on a MAVLink link;
   anything a real GCS does (see telemetry, upload a mission, change mode, send a
   command) works against the sim.
2. **Deterministic.** Fixed-step physics, seeded — the same inputs reproduce the
   same trajectory (needed for repeatable HILS tests).
3. **Observable & verifiable.** Every state is readable via MAVLink and a small dev
   console (`window.__hils`, the engineering panel); every change ships with tests.

## Architecture

- **Browser sim** (Three.js, ES modules): 6-DOF rigid-body dynamics, atmosphere,
  wind/gust, sensors (noise/bias/lag), nav (gated Kalman / FDE), autopilot.
- **Bridge** (`bridge/server.mjs`, Node): HTTP + SSE on `:8765` ↔ MAVLink v1 UDP
  `:14550` to the GCS.
  - Sim → bridge: `POST /telemetry` (~50 ms) → MAVLink `HEARTBEAT`, `ATTITUDE`,
    `GLOBAL_POSITION_INT`, `VFR_HUD`, `GPS_RAW_INT` to the GCS.
  - GCS → bridge → sim: mission upload + `COMMAND_LONG` + mode → SSE `/commands`
    → autopilot (`src/missionLink.js`).
- **Determinism / test surface:** `window.__advance`, `__resetForTest`, `setWind`,
  `injectFault`, `__hils`, `__engView`.

## Milestones (GCS-first)

- **M1 — Lean baseline.** Sim core + MAVLink bridge; telemetry visible in the GCS,
  mission upload flies. (Verify: GCS sees the aircraft move; autoland still PASS.)
- **M2 — Command loop.** `ARM`/`DISARM`, `MODE` (MANUAL/AUTO/GUIDED), `NAV_TAKEOFF`
  / `NAV_LAND` / `RTL` via `COMMAND_LONG`; correct `COMMAND_ACK`.
- **M3 — GUIDED.** GCS sets a target position/waypoint; the sim flies to it; position
  feedback closes the loop in the GCS map.
- **M4 — Parameters.** `PARAM_REQUEST_LIST` / `PARAM_SET` for key gains (autopilot,
  sensor noise) so the GCS can tune the vehicle.
- **M5 — HITL / HILS.** External state injection + fault injection surfaced over
  MAVLink (sensor faults visible in the GCS).
- **M6 — Telemetry completeness.** `SYS_STATUS`, battery, EKF status, `STATUSTEXT`;
  mission progress (`MISSION_CURRENT` / `MISSION_ITEM_REACHED`).

## Non-goals

Cockpit interiors, multiple maps, weather presets, multiplayer, AI traffic, game
scoring. (These were stripped from the flight-sim2 lineage that drifted toward a game.)

## Verification

- `npm test` (physics / unit), deterministic console-check (0 app errors), crosswind
  autoland PASS (`tests/landing-wind-det.mjs`).
- **GCS integration:** `npm run bridge`, open the served sim, connect QGroundControl
  (UDP 14550) — telemetry shows live, mission upload + mode/command round-trip.
