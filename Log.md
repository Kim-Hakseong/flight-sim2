---
project: Flight Sim2
stage: MVP
progress: 55
repo_url: https://github.com/Kim-Hakseong/flight-sim2
demo_url: https://kim-hakseong.github.io/flight-sim2/
summary: 브라우저 비행 시뮬레이터 기반 MAVLink 지상관제(GCS) 루프 — QGroundControl 연동(텔레메트리↑·미션/명령↓·GUIDED/TAKEOFF/LAND/RTL), 6-DOF·센서·HITL/SIL 벤치
---

## 마일스톤
- [x] GCS-first 린 리셋 (게임 요소 제거, MAVLink 루프에 집중)
- [x] GCS 루프 종단 검증 (텔레메트리↑ · 미션/명령↓)
- [x] faithful 모드 + arm (GCS가 기체 상태 관측·제어)
- [x] GCS 내비 명령 — GUIDED go-to / TAKEOFF / LAND / RTL
- [ ] 파라미터 (PARAM_REQUEST_LIST / PARAM_SET — GCS에서 게인 read/tune)

## 2026-06-25
- M3: GCS 내비 명령 완성 — GUIDED go-to + TAKEOFF/LAND/RTL (QGC 실연 확인, 195 unit PASS)
- M2b: 린 GCS 빌드를 flight-sim2 repo로 통합 (단일 배포 유지)

## 2026-06-24
- M2: faithful 모드 + arm — GCS가 기체 상태를 관측·제어
- M1: GCS 루프 종단 검증 (텔레메트리↑ · 미션/명령↓)
- M0: GCS-first 린 리셋 (게임 요소 제거, MAVLink 루프에 집중)

---

<!-- 위 블록은 dev-dashboard(SSOT) 집계용 frontmatter. 아래는 프로젝트 원본 빌드 로그. -->

# Log — flight-sim2

Append one entry per loop (format in CLAUDE.md §5). Newest at the bottom.

## 2026-06-24 — M0: fork from flight-sim2 + lean strip (GCS-first reset)

**Status**: GREEN (lean build verified; ready for GCS work)
**Files changed**: reset the repo to a lean GCS build; deleted 7 src modules + brand asset; new PRD/CLAUDE/README/Log; trimmed main.js/world.js/ui.js/hud.js/camera.js/index.html
**Tests**: 194 unit PASS · console-check 0 app errors · crosswind autoland PASS (110m)
**Decisions**:
- The flight-sim2 lineage drifted toward a game (cockpit models, multi-map, weather,
  multiplayer, scenario scoring). Reset to a **GCS-first** project: the MAVLink loop
  (telemetry up, missions/commands down, vehicle responds) is the product.
- **Stripped** (deleted module + all wiring): cockpit, weather, clouds, scenario,
  multiplayer, aiTraffic, drone; reduced world to a single map (plains) + single
  condition (day); removed map/condition pickers, cockpit camera mode, brand logo.
- **Kept intact**: 6-DOF physics, sensors, gated-KF nav, autopilot/missions, MAVLink
  telemetry (`telemetry.js`) + missionLink (SSE) + `bridge/` (HTTP↔MAVLink UDP),
  recorder, HITL, engineering/HILS console, damage/audio/effects. Determinism + the
  `window.__advance/__hils/setWind/injectFault/__engView` surface preserved.
- Clutter removed: docs/ (3.2MB), build/, examples/, PROMPT_ralph.md, CREDITS.md.
**Next**:
- M1: stand up the GCS loop end-to-end — `npm run bridge`, confirm telemetry in
  QGroundControl (UDP 14550) and a mission upload flies; harden the round-trip.
**Notes**:
- Run with GCS: `npm run bridge` → http://localhost:8765 + MAVLink :14550; start QGC.
- The game-era milestones (M1–M48) remain in this repo's git history.

## 2026-06-24 — M1: GCS loop verified end-to-end (telemetry up · mission/command down)

**Status**: GREEN (full MAVLink round-trip verified headlessly; ready for real QGC)
**Files changed**: tests/gcs-loop-check.mjs(new), tests/gcs-browser-check.mjs(new), bridge/server.mjs(cleanup), package.json(gcs-check script)
**Tests**: 194 unit PASS · gcs-loop-check 11/11 · gcs-browser-check 5/5
**Decisions**:
- Verified the whole GCS loop without needing QGroundControl, via two headless
  acceptance tests + a "fake GCS" UDP endpoint bound to the QGC port (14550):
  - **gcs-loop-check** (packet level): bridge HEARTBEAT (1 Hz); POST /telemetry →
    ATTITUDE/GLOBAL_POSITION_INT/VFR_HUD/GPS_RAW_INT with geodetically-sane values
    (sim local → lat/lon/alt); mission upload handshake (COUNT→REQUEST_INT→ITEM_INT
    →ACK); MISSION_START (CMD 300) → COMMAND_ACK + HEARTBEAT base_mode gains AUTO.
  - **gcs-browser-check** (full loop): serve the sim FROM the bridge → the browser
    missionLink receives the uploaded mission over SSE (autopilot len=2), engages on
    MISSION_START (phase=TAKEOFF), and the flying sim POSTs telemetry that the bridge
    relays back to the GCS (GLOBAL_POSITION_INT, 61 frames). QGC→bridge→sim→bridge→QGC.
- The bridge GCS implementation was already substantial; M1 hardened + proved it.
- Cleanup: removed the dead `/mp/state` endpoint (multiplayer was stripped in M0),
  fixed the boot banner name. Added `npm run gcs-check`.
- Harness bug found+fixed: a CDP `awaitPromise:true` on the `location.href=`
  navigation eval left the session on a stale context → mission appeared undelivered.
  Product loop was fine; the test was flaky.
**Next**:
- M2: command loop — ARM/DISARM, explicit MODE handling, NAV_TAKEOFF/NAV_LAND/RTL via
  COMMAND_LONG with proper COMMAND_ACK results; surface mode/arm state in the sim HUD.
**Notes**:
- Live with real QGC: `npm run bridge` → open http://localhost:8765 → start QGC
  (auto-connects UDP 14550) → telemetry shows; upload a mission + MISSION_START flies it.
- Headless re-verify: `npm run gcs-check`; browser loop: start Chrome with
  --remote-debugging-port=PORT then `node tests/gcs-browser-check.mjs PORT`.

## 2026-06-24 — M2: faithful mode & arm (GCS sees + controls the vehicle state)

**Status**: GREEN (mode sync + arm/disarm act on the sim; verified headless)
**Files changed**: src/main.js (armed state + mode/armed telemetry + disarm throttle-cut + HUD), bridge/server.mjs (HEARTBEAT from sim mode/arm), tests/gcs-loop-check.mjs + tests/gcs-browser-check.mjs (assertions)
**Tests**: 194 unit PASS · console 0 · autoland PASS · gcs-loop-check 13/13 · gcs-browser-check 7/7
**Decisions**:
- The live QGC screenshot showed a mismatch: sim flying AUTO·APPROACH but QGC showed
  "Manual" — the bridge tracked only GCS-commanded mode, not the sim's real mode.
- **Sim is now authoritative for mode/arm.** Telemetry carries `mode` (AUTO/MANUAL) and
  `armed`; the bridge maps these into the HEARTBEAT base_mode, so QGC shows the vehicle's
  TRUE state. Verified: telemetry mode=AUTO → base_mode 0x84 (AUTO|ARMED); mode=MANUAL,
  armed=false → 0x40 (MANUAL, disarmed).
- **GCS ARM/DISARM acts on the sim.** COMMAND_LONG 400 → bridge broadcasts `mode {armed}`
  → sim sets `armed`; disarm cuts the throttle to idle in stepSimAndControl (the airframe
  glides). Reflected back to QGC via telemetry → HEARTBEAT. Sim HUD shows DISARMED.
  Verified end-to-end: GCS disarm → sim __arm()=false → throttle=0.
- `window.__arm(bool)` added for tests. Armed defaults true → autoland unchanged.
**Next**:
- M3: GUIDED + nav commands — NAV_TAKEOFF / NAV_LAND / RTL via COMMAND_LONG driving the
  autopilot; GCS-set target position (reposition) with position feedback.
**Notes**:
- Verify in QGC: arm/disarm from QGC now flips the sim's engine + the displayed mode
  tracks AUTO vs MANUAL. `npm run gcs-check` for the packet-level regression.

## 2026-06-25 — M2b: collapse the GCS build back into the flight-sim2 repo

**Status**: GREEN (single repo/deployment; lean GCS build adopted in place)
**Files changed**: whole tree replaced with the lean GCS build; renamed flight-sim-gcs → flight-sim2 (package/docs/bridge banner)
**Tests**: (re-verified below)
**Decisions**:
- A separate `flight-sim-gcs` repo was unnecessary — adopt the lean GCS build directly
  in **this** repo (flight-sim2) so the existing deployment carries it; no second
  GitHub Pages / Vercel hookup to manage.
- The flight-sim2 game history (M1–M48) stays in git; HEAD is now the lean GCS build.
**Next**:
- M3: GUIDED + nav commands (NAV_TAKEOFF / NAV_LAND / RTL via COMMAND_LONG; GCS go-to).
**Notes**:
- Pages: https://kim-hakseong.github.io/flight-sim2/ . `npm run bridge` for the GCS loop.

## 2026-06-25 — M3: GCS nav commands — GUIDED go-to + TAKEOFF / LAND / RTL

**Status**: GREEN (all four commands fly via the autopilot; verified headless)
**Files changed**: bridge/mavlink.mjs (decodeCommandInt), bridge/server.mjs (nav cmds + sendNav buffer/re-send), src/autopilot.js (loiter), src/missionLink.js (nav listeners + __seq dedup), src/main.js (nav builders), tests/gcs-nav-check.mjs(new), tests/mavlink.test.mjs
**Tests**: 195 unit PASS · console 0 · autoland PASS · gcs-loop-check 13/13 · gcs-browser-check 7/7 · gcs-nav-check 12/12
**Decisions**:
- The GCS can now command the vehicle in real time (standard MAVLink IDs first):
  - **NAV_TAKEOFF (22)** → climb out + hold; **NAV_LAND (21)** → glideslope approach to
    the runway (reuses the tuned autoland); **RTL (20)** → return over the launch point +
    loiter; **DO_REPOSITION (192, COMMAND_INT/LONG)** → GUIDED go-to a GCS-set point.
  - bridge decodes the commands → SSE → missionLink → main.js nav builders, which
    construct a small mission on the proven autopilot guidance (`localToWaypoint`).
    Added a `loiter` mode to the autopilot (orbit the final waypoint for go-to/RTL/takeoff).
- **Reliability fix**: one-shot SSE command events are lost if the browser's EventSource
  drops/reconnects (saw a "zombie" early connection in headless). The bridge now BUFFERS
  the latest nav command with a monotonic `__seq` and re-sends it on every SSE connect;
  the sim dedupes by `__seq` (apply once). GCS links drop in the field too — this is the
  right production behaviour, not just a test fix.
- Verified in two robust halves (the headless app-EventSource is flaky, but the same path
  is confirmed live in QGC for M1/M2): A) bridge broadcasts the right SSE event per
  command (Node SSE client); B) the nav builders fly correctly via window.__nav (TAKEOFF
  →152m, GOTO 3338→2110m toward target, RTL engages, LAND descends 202→157m).
- window.__nav { takeoff, goto, land, rtl } exposed for manual/console use.
**Next**:
- M4: parameters (PARAM_REQUEST_LIST / PARAM_SET) so the GCS can read/tune gains.
**Notes**:
- Live in QGC: arm → Takeoff slider → climbs; click "Go to location" → flies there + loiters;
  Return → comes home; Land → approaches the runway. Standard IDs; adjust if QGC sends
  SET_POSITION_TARGET for GUIDED on a generic autopilot.

## 2026-06-25 — audio: realistic jet engine + remove engine exhaust smoke

**Status**: GREEN (195 tests, console 0, autoland PASS)
**Files changed**: src/audio.js (engine voices), src/main.js (drop exhaust emit)
**Decisions**:
- The old engine was two near-unison detuned sawtooths (80/84 Hz) that beat at a few
  Hz — sounding like a chopping/broken helicopter, especially at ground idle. Replaced
  with a 3-voice procedural jet/turbofan: a single low body tone (no beating), a turbine
  whine that spools up ∝ throttle² (the "jet" character), and band-passed brown-noise
  combustion roar. Smooth idle on the ground; full, flight-sim-like at power.
- Removed the continuous engine **exhaust smoke** emission (clean jet, per request).
  Damage smoke/fire remain but only fire if the airframe is damaged (never in this sim).
**Next**:
- Graphics quality options (no Unreal/Unity) — proposed to the user.
**Notes**:
- Audio still starts on first user gesture (browser policy); 'X' mutes.

## 2026-06-25 — graphics: high-quality cinematic view (sky + SSAO + SMAA + IBL)

**Status**: GREEN (cinematic post-FX stack; eng default unchanged; 195 tests, console 0, autoland PASS)
**Files changed**: index.html (Sky/SSAO/SMAA + SMAAShader scripts), src/main.js (composer rebuild + atmospheric sky + applyEngView toggles), src/world.js (expose sky mesh)
**Decisions**:
- Without Unreal/Unity, boosted the **cinematic view ('B' off)** with a Three.js post-FX
  stack — engineering view stays flat/fast/data-first:
  - **Atmospheric sky** (Sky.js, Rayleigh/Mie) shown in cinematic; the flat gradient sky
    shows in eng. ACES exposure 0.5 (Sky.js is HDR — high exposure washed it out).
  - **SSAO** (SSAOPass; AO via output mode — Beauty in eng, Default in cinematic).
  - **SMAA** edge AA (needs SMAAShader.js — that omission broke the composer until added).
  - **Bloom** 0.6 + **IBL**: envMapIntensity 1.4 in cinematic for stronger reflections.
- Honest limit: the procedural terrain/mountains are low-poly flat-shaded, so post-FX is a
  real but bounded bump. The next-level jump needs better geometry/textures (asset work),
  not more post-FX.
**Next**:
- (option) higher-detail terrain + PBR textures/normal maps for a bigger visual jump; else M4.
**Notes**:
- 'B' toggles cinematic ↔ engineering. Graphics degrade gracefully if the example scripts
  fail to load (falls back to RenderPass / gradient sky).

## 2026-06-25 — controls: ←/→ roll, real manual↔auto toggle (N/M), key legend

**Status**: GREEN (197 unit incl. +2 controls, console 0, autoland PASS, B/M/N verified headless)
**Files changed**: src/controls.js, src/main.js, index.html, tests/controls.test.mjs
**Decisions** (user reported "A/D·←/→·N/M·B 안 먹힘"):
- Diagnosed: B works (verified true→false), and W/S/A/D share one path (tickControls) —
  A/D roll *does* work but is invisible on the runway (gear holds wings level). The real
  gaps were: ←/→ unmapped, and N/M = mission start/abort (dead without a QGC plan), which
  the user expected to be a manual/auto toggle.
- ←/→ now alias A/D (roll) via a new pure `axesFromKeys(keys)` (TDD: RED→GREEN). ↑/↓ stay
  throttle-only.
- M = AUTO: flies the uploaded plan, or auto-loads the built-in demo circuit so AUTO works
  without QGC. N = MANUAL (release autopilot). The HUD MODE cell reflects it.
- Updated the on-screen key legend (added ←/→, B, reworded M/N).
**Next**:
- M4 (parameters) — PARAM_REQUEST_LIST / PARAM_SET for GCS gain tuning.
**Notes**:
- Real-time manual flight can't be tested headless (background RAF is throttled → only a
  few frames integrate); that's why the suite uses the deterministic __advance path. Manual
  axis feel must be eyeballed on the Mac. Discrete toggles (B/M/N) ARE headless-verifiable
  and pass.
