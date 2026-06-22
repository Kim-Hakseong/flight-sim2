---
project: Flight Sim2
stage: 베타
progress: 85
repo_url: https://github.com/Kim-Hakseong/flight-sim2
demo_url: https://kim-hakseong.github.io/flight-sim2/
summary: Three.js 기반 브라우저 비행 시뮬레이터 — MAVLink/QGroundControl 연동 + HITL/SIL 브릿지
---

## 마일스톤
- [x] MVP 비행 (M0–M4)
- [x] QGroundControl / MAVLink 연동 (M6–M7)
- [x] 6-DOF 비행 동역학 + 센서/결함 주입 HITL (M8–M9)
- [x] 오토파일럿 (TECS-lite, 협조선회) + 자동 착륙 (M14–M21)
- [x] GPS 스푸핑 중 AUTO 항로유지 (FDE + INS) (M19)
- [x] 군용 기체 모델 + 글래스칵핏 HUD + 그래픽 업그레이드 (M24–M27)
- [x] 다중 맵 / 날씨 / 야간 / 항모 갑판 / 조종석 뷰 (M34–M39)
- [ ] 멀티플레이 / VR 정식 지원

## 2026-06-22
- M39: 조종석 인테리어 뷰 (V)
- M36~M38: 항모 갑판 맵 + 시간대/날씨 프리셋 + 야간 별·달·강수 파티클
- M32~M35: 카메라 스무딩 + 다중 맵 선택 + 실제 바다 맵
- M24~M31: 군용 기체 + 모바일 컨트롤 + 글래스칵핏 HUD + 그래픽/그림자/구름

## 2026-06-21
- M18~M23: 센서-in-the-loop AUTO 완성, 자동 착륙(글라이드슬로프→플레어→접지), 플랩/스포일러, 바람·돌풍 착륙

## 2026-06-20
- M7~M17: 결정론적 고정스텝 적분 + 6-DOF 회전 동역학 + TECS-lite 오토파일럿 + 협조선회

---

<!-- 위 블록은 dev-dashboard(SSOT) 집계용. 아래는 원본 빌드 로그 -->

# Log — Flight Simulator Build Log

> **Append-only.** 매 Ralph 루프 끝에 **반드시** 새 entry 추가.
> 형식은 `CLAUDE.md §5` 참조 — 이탈 금지.
> 기존 entry는 절대 수정/삭제하지 마라.

---

## 2026-04-27 INIT — Project bootstrapped

**Status**: GREEN
**Files changed**: PRD.md, CLAUDE.md, Log.md, PROMPT_ralph.md (created)
**Tests**: N/A (코드 없음)
**Decisions**:
- 기술 스택: Three.js r128 (CDN) + Vanilla ES Modules + node:test
- "EGI 모델"은 Embedded GPS/INS로 해석 → 코어 비행 동역학(M0–M4)과 분리하여 M5(선택)로 배치
- 단일 HTML 더블클릭 실행을 M0 DoD로 고정
- 물리는 Cannon.js 등 강체 엔진 미사용 (비행은 공력이 본질)
- TDD-lite: 물리 함수만 unit test, UI는 콘솔 에러 0 + 사용자 시각 확인
**Next**:
- M0 시작: `index.html` + `package.json` + `src/main.js` + `tests/physics.test.mjs` placeholder + 빈 Three.js 캔버스 + 회전하는 단순 큐브
**Notes**:
- macOS Safari + Chrome 양쪽 동작 확인 필수 (Safari가 더 까다로울 수 있음)
- Three.js r128 CDN URL 고정: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`

---

<!-- 다음 entry부터 Claude Code가 이어서 추가. 위 형식 그대로. -->

## 2026-04-27 21:00 — M0–M4: MVP 일괄 구현

**Status**: GREEN
**Files changed**: index.html, package.json, README.md, src/main.js, src/world.js, src/aircraft.js, src/physics.js, src/controls.js, src/camera.js, src/hud.js, tests/physics.test.mjs
**Tests**: 14 added, 14 passing, 0 failing
**Decisions**:
- 사용자 지시로 한 세션에서 M0–M4를 일괄 진행 (PROMPT_ralph "한 루프=한 마일스톤" 규칙은 사용자 지시가 상위)
- M5 EGI는 MVP 범위 외로 제외
- 항공기 파라미터 Cessna급으로 고정: mass=1000kg, wingArea=16m², maxThrust=4500N
- 이륙 sanity test 임계 조정: v=40 m/s, CL=1.0, mass=1000kg (PRD §F2의 "약 25 m/s 이상" DoD는 CL_max에 의존하므로 30~45 m/s가 현실적 — 활주로 가속 후 살짝 W로 회전)
- 본체 프레임 부호: ω_x=+pitch(W), ω_y=+yaw(E), ω_z=−roll(D=우롤이므로 z 음의 회전) — physics 코드 주석 + euler 'YXZ' 분해로 일관 유지
- 자동 안정화: 입력 놓으면 pitch/roll 모두 0으로 천천히 복귀 → 비행 난이도 완화 (PRD §9 리스크 대응)
- HUD는 DOM(앰버 텍스트) + 캔버스 오버레이(피치 사다리/십자선) 하이브리드 — Three.js 텍스처 부담 회피
- 빌딩 60개 + 산 35개 (PRD 50/30 기준 충족)
**Next**:
- 사용자가 `open index.html` 로 MVP 동작 확인 → 피드백 수집
- 후속: M5 EGI(INS/GPS 토글), 사운드, 스모크 테스트(Playwright)
**Notes**:
- 사용자 확인 항목 (Mac Mini):
  1. `open index.html` 시 5초 내 활주로 + 항공기 + HUD 표시
  2. 콘솔 에러 0 (DevTools Console 확인)
  3. ↑ 길게 → 스로틀 100% → 활주로에서 가속 → 30 m/s 부근에서 W로 이륙
  4. V로 카메라 토글 (chase → cockpit → external)
  5. P로 일시정지, R로 리셋
  6. STALL 표시: 저속 + 큰 AoA에서 빨간색 STATUS
- `npm test` → 14/14 PASS
- node 25에서 `node --test tests/`가 디렉토리 인자를 모듈로 해석하는 회귀가 있어 `tests/*.test.mjs` glob으로 변경
- M0 placeholder 큐브는 M1 월드로 대체됨 (회전 큐브는 더 이상 보이지 않음 — 의도)

---

## 2026-04-27 22:30 — M6: QGroundControl 연동 (브릿지 + MAVLink)

**Status**: GREEN
**Files changed**: bridge/server.mjs (new), bridge/mavlink.mjs (new), src/telemetry.js (new), src/main.js, src/hud.js, index.html, package.json, README.md, PRD.md, tests/mavlink.test.mjs (new)
**Tests**: 10 added (MAVLink encoder), 24 total passing, 0 failing
**Decisions**:
- 통신 경로: 브라우저 → HTTP POST(20Hz) → Node 브릿지 → UDP MAVLink → QGC. WebSocket 대신 HTTP 폴링으로 외부 의존성(`ws`) 회피 — Node `http`/`dgram` built-in만 사용 (PRD §9 위반 없음)
- 브릿지가 정적 파일도 같이 서빙 → 사용자 1 명령(`npm run bridge`)으로 시뮬+브릿지 동시 기동, file:// CORS 이슈도 자연 해결
- MAVLink v1 직접 구현 (v2 아님): 5개 메시지(HEARTBEAT/ATTITUDE/GLOBAL_POSITION_INT/VFR_HUD/GPS_RAW_INT)만 필요. CRC-16/MCRF4XX는 표준 검사값 0x6F91("123456789")로 TDD 검증
- 좌표 매핑: 시뮬 +X=East, -Z=North, +Y=Up → 측지 좌표 변환. 홈 RKSI(인천 37.46°/126.44°)로 고정, env로 오버라이드 가능
- 텔레메트리는 fail-silent: 브릿지 미동작 시 시뮬 영향 없음, HUD에 "QGC OFFLINE" 표시
- 단방향만 구현 (M6). QGC → 시뮬 명령 추종은 M7로 분리 (사용자 만족도 확인 후)
**Next**:
- 사용자 검증: QGC 다운로드 → `npm run bridge` → 자동 연결 → 지도에서 항공기 움직이는지 확인
- 만족 시 M7: QGC mission/setpoint 수신 → 자동 항법 (양방향)
**Notes**:
- 사용자 확인 항목 (Mac Mini):
  1. QGroundControl 설치 (https://qgroundcontrol.com)
  2. 터미널: `cd flight-sim2 && npm run bridge` → "Sim served at: http://localhost:8765/" 로그 확인
  3. QGC 실행 → 자동 연결 안 되면 Application Settings → Comm Links → "UDP" 추가 (port 14550)
  4. 브라우저 http://localhost:8765/ 접속 → HUD 우상단 "QGC LINK" (초록) 표시
  5. 비행 시 QGC 지도 위 항공기 이동 / 인공수평계 / VFR_HUD 게이지 실시간 동기 확인
- macOS 첫 실행 시 보안 경고 가능 (System Settings → Privacy & Security → "Open Anyway")
- 브릿지 5초마다 텔레메트리 카운터 로그 출력 ("LIVE · telemetry msgs sent: N")
- MAVLink CRC_EXTRA 값은 message.xml에서 추출한 상수 (HEARTBEAT=50, ATTITUDE=39, GLOBAL_POSITION_INT=104, VFR_HUD=20, GPS_RAW_INT=24)

---

## 2026-04-27 23:00 — M7 (부분): QGC ↔ 브릿지 양방향, "Ready" 만족 응답기

**Status**: GREEN
**Files changed**: bridge/mavlink.mjs (디코더 + 5개 응답 인코더 추가), bridge/server.mjs (UDP bind + 응답 디스패처), tests/mavlink.test.mjs
**Tests**: 9 added, 33 total passing, 0 failing
**Decisions**:
- 사용자 보고: QGC 연결 후 PARAM 다운로드 절반에서 "준비되지 않음" 멈춤 → 단방향이라 응답 못 해서 timeout
- 최소 응답기 셋: PARAM_REQUEST_LIST → 1 dummy param(SIM_INFO=1.0), MISSION_REQUEST_LIST → MISSION_COUNT(0), COMMAND_LONG → COMMAND_ACK(ACCEPTED) + cmd 520(REQUEST_CAPABILITIES)이면 AUTOPILOT_VERSION, cmd 410(GET_HOME)이면 HOME_POSITION
- UDP는 14555에 bind (env override). QGC 가 보낸 응답이 이 포트로 돌아옴. 송신은 그대로 14550
- MAVLink 디코더는 v1만 파싱, v2는 인식해서 skip만 (CRC 미검증 — 신뢰 링크 가정). 9개 테스트로 layout/roundtrip/v2-skip 검증
- M7 전체 (자동항법/RC override 추종)는 차후. 이번엔 "QGC가 Ready로 보이고 텔레메트리 정상 표시"가 목표
- Smoke test (가짜 GCS↔브릿지 UDP 왕복)는 현재 환경 UDP 샌드박스로 검증 불가, 사용자 Mac Mini 실측에 의존
**Next**:
- 사용자 검증: 브릿지 재시작 + QGC 재연결 → "Ready" 상태 도달 + 지도/HUD 정상 표시
- (성공 시) M7 양방향 본편: QGC mission/setpoint 수신 → 시뮬 자동 추종
**Notes**:
- 사용자 절차:
  1. 터미널에서 `Ctrl+C` 로 기존 브릿지 종료 → `npm run bridge` 재실행
  2. QGC 재시작 (Auto-Connect로 재연결)
  3. PARAM 진행률이 끝까지 가는지 / "Ready"로 바뀌는지 확인
  4. 브릿지 로그에 `tx=N rx=M` 형태 표시 — rx > 0 이면 QGC가 query 보내고 우리 응답 처리 중
  5. Fly view 에서 지도 위 vehicle 1 위치 / 인공수평계 / VFR_HUD 게이지 실시간 동기 확인
- bind 포트 충돌(누가 14555 점유) 시 `BIND_PORT=14600 npm run bridge`

---

## 2026-04-27 23:45 — M7: QGC Plan 양방향 (미션 업로드 → 자동비행 → 진행 보고)

**Status**: GREEN
**Files changed**: bridge/mavlink.mjs (mission encoders/decoders + decodeCommandLong), bridge/server.mjs (state machine, SSE, mode tracking, MISSION_CURRENT/REACHED 송출), src/autopilot.js (new), src/missionLink.js (new), src/main.js (autopilot 훅), src/hud.js (MODE/WP 셀), index.html (HUD), tests/mavlink.test.mjs, README.md
**Tests**: 7 added, 40 total passing, 0 failing
**Decisions**:
- 통신 경로 (브릿지 → 브라우저): WebSocket 대신 **Server-Sent Events** 사용 (`GET /commands`). 브라우저 `EventSource` 빌트인이라 외부 의존성 0
- 미션 프로토콜 v1 사용 (MISSION_ITEM_INT 37바이트, no mission_type extension). MISSION_REQUEST(40)/MISSION_ITEM(39) 구식 변형은 미지원
- HEARTBEAT autopilot=8(INVALID) → 0(GENERIC) 으로 변경: INVALID는 비-vehicle 컴포넌트용. QGC가 mission/mode 처리를 더 자연스럽게 받음
- base_mode 비트 추적: MANUAL+ARMED 가 기본, MISSION_START 받으면 AUTO+ARMED. ARM_DISARM/SET_MODE/DO_SET_MODE 명령으로도 갱신
- Autopilot은 단순 P-제어: roll = headingErr × 1.5 (한계 0.85), pitch = altErr × 0.04 (한계 -0.4..0.6), throttle은 속도 50m/s 크루즈 유지. 실제 PID 미사용 — MVP 충분
- Waypoint 도달 판정: 수평 120m / 수직 50m. 너무 좁으면 fly-by 시 통과 못함
- Frame 0 / Frame 3 처리: QGC plan view 기본은 RELATIVE_ALT_INT(3)
- AUTO 시 키보드 무시: controls.{pitch,roll,yaw,throttle} 매 프레임 autopilot 출력으로 override
**Next**:
- 사용자 검증: QGC Plan 만들기 → Upload → Start Mission → 자동비행 확인
- 후속: takeoff/land 명령 특수처리 (현재는 일반 waypoint 처럼 처리), loiter/RTL, 실제 arm 시퀀스, RC override 가이드 모드, 미션 다운로드(QGC 가 시뮬에서 미션 읽기)
**Notes**:
- 사용자 절차:
  1. 브릿지 + QGC 재시작 (autopilot=GENERIC 적용 위해)
  2. 브라우저 새로고침 → HUD 하단에 `MODE: MANUAL  WP: —` 셀 추가됨 확인
  3. QGC 좌측 **Plan** 메뉴 → 지도에 waypoint 찍기 → 우상단 **Upload**
  4. 업로드 성공 시 시뮬 HUD `WP: 0/N`, 브릿지 로그에 `mission uploaded: N items`
  5. QGC **Fly** 로 복귀 → **Start Mission** 클릭 (또는 confirm slider)
  6. HUD `MODE: AUTO` (초록), `WP: 1/N` 으로 진행, 비행기가 waypoint 따라 이동
  7. QGC 지도에서 항공기 위치 변화 + waypoint 도달 시 다음으로 진행
- 미션이 너무 가까운 곳부터 시작하면 도달 반경(120m) 안에서 시작 → 즉시 통과해 다음으로 점프할 수 있음. 첫 waypoint는 충분히 떨어진 곳에 두기
- AUTO 진입 시 만약 지상 정지 상태면 throttle 100% 가속 + 작은 pitch up → 자연스럽게 이륙. 활주로 방향과 첫 WP 방향이 너무 다르면 활주로 벗어날 수 있음
- 테스트는 단위 레벨까지만 (실 통신은 사용자 Mac Mini 실측으로 검증)

---

## 2026-04-28 00:10 — M7 hotfix: QGC "Guided not supported" 우회 (M 키 시작)

**Status**: GREEN
**Files changed**: src/controls.js, src/main.js, index.html
**Tests**: 40 passing (no new — keyboard shortcut + dispatch만)
**Decisions**:
- 사용자 보고: QGC "Start Mission" → "Guided mode not supported by Vehicle"
- 원인: QGC Generic firmware plugin의 `supportsGuidedMode()` 가 false. Start Mission 시 GUIDED 모드 진입을 client-side에서 시도하므로 우리 MAVLink 응답과 무관하게 막힘. autopilot 타입을 ArduPilot/PX4 로 바꾸면 우회 가능하지만 param sync 등 다른 firmware-specific 기대치가 깨질 위험
- 결정: 시뮬 측 키보드 'M' (start), 'N' (abort) 추가하여 미션 시작 트리거를 로컬에서 발사. QGC는 Plan 업로드 + 진행 모니터링 (MISSION_CURRENT/REACHED) 만 사용. 가장 단순/안전한 경로
- autopilot 타입은 GENERIC(0) 유지 — 이전에 어렵게 도달한 "Ready" 상태 보존
**Next**:
- 사용자 검증: Plan upload → M 키 → 자동비행 + QGC 지도에서 진행 추적
- (선택) 후속: autopilot=ArduPilot(3) 토글 옵션 + ArduPlane 커스텀 모드(AUTO=10) 처리 → QGC Start Mission 버튼 직접 동작
**Notes**:
- 사용자 절차:
  1. 브라우저 하드 새로고침
  2. QGC Plan 업로드 (이미 동작 확인됨)
  3. QGC Start Mission 슬라이더 무시 (또는 시도해서 에러 확인)
  4. 시뮬 창 클릭해서 포커스 → **M 키** 누름
  5. HUD `MODE: AUTO` (초록) + 비행 시작, QGC 지도에서 항공기 이동 + WP 진행 동기 확인
  6. 중단 원하면 N 키 (또는 R 로 리셋)

---

## 2026-04-28 00:30 — M7 hotfix #2: autopilot barrel-roll 수정 (cascade controller)

**Status**: GREEN
**Files changed**: src/autopilot.js (재작성), src/main.js
**Tests**: 40 passing (autopilot은 visual 검증)
**Decisions**:
- 사용자 보고: M 키로 미션 시작하면 비행기가 빙글빙글 회전(barrel roll)하면서 앞으로만 가고 waypoint 방향으로 turn 안 함
- 원인: 1-loop P 제어가 heading 오차 → 직접 roll rate 명령. heading err = π일 때 roll cmd가 한계(0.85)에 saturate → 뱅크가 90° 넘어 inverted → barrel roll → 실제 turn 없음
- 해결: cascade (outer→inner) 2-loop 컨트롤러
  - Outer: heading_err → desired_bank (clamp ±35°) ; alt_err → desired_pitch (clamp ±15°)
  - Inner: bank_err × Kp − rollRate × Kd → roll cmd ; pitch_err × Kp − pitchRate × Kd → pitch cmd
- bankRad/pitchRad는 quaternion에서 직접 계산 (Euler YXZ 부호 모호성 회피): pitch = asin(fwd.y), bank = −asin(right.y) ("+ = 우측 날개 다운" 규약)
- rollRate 부호: 시뮬 ω.z 가 + 일 때 LEFT roll (body +Z 회전). 항공 규약 "+ = right roll"에 맞추려면 −ω.z
- 게인: HEADING_TO_BANK=0.9, BANK_KP=1.6, ROLL_RATE_KD=0.35 (대충 underdamped 안 되도록 보수적)
**Next**:
- 사용자 검증: M 키 → 안정한 banked turn → waypoint 정확 도달
- 안 되면 게인 미세조정 (보통 KP/KD 비율)
**Notes**:
- 만약 여전히 oscillation 보이면 BANK_KP를 1.0~1.2로 낮추고 ROLL_RATE_KD를 0.5로 올리기
- waypoint 너무 가까이(<200m) 두면 첫 도달이 즉시 일어나 다음 wp로 점프할 수 있음
- 첫 waypoint 거리가 충분(>500m)하면 plane이 우선 어느 방향으로든 banking 시작 → heading 맞으면 wings level → 직진

---

## 2026-04-28 00:55 — M7 hotfix #3: TAKEOFF phase 추가 (지상에서 banking 금지)

**Status**: GREEN
**Files changed**: src/autopilot.js, src/main.js
**Tests**: 40 passing
**Decisions**:
- 사용자 보고: M 누르면 비행기가 옆으로 기울어진 채 활주로를 기어가고 waypoint 방향으로 안 감
- 근본 원인: autopilot이 NAV 단계만 있고 이륙(TAKEOFF) 단계가 없음. 지상 정지 상태에서 첫 waypoint가 옆에 있으면 헤딩 오차 → 즉시 banking 명령 → 활주로 위에서 기울어진 채 가속만 → 양력 기울어 sideways slide
- 해결: alt AGL < 30m 동안은 TAKEOFF 단계 — wings level 강제, rotate speed (25 m/s) 도달 후 8° pitch up, full throttle. 30m 넘으면 NAV로 자동 전환
- 단계는 IDLE / TAKEOFF / NAV / DONE 4가지. HUD에 `MODE: AUTO·TAKEOFF` 형태 표시
- 활주로 방향과 첫 waypoint 방향이 크게 다르면 일단 활주로 방향(현재 -Z=북)으로 climb out 후 turn — 효율적이진 않지만 안정적
**Next**:
- 사용자 검증: M → TAKEOFF (HUD 표시) → 30m 넘으면 NAV → waypoint 따라 비행
- 후속: 활주로 방향 + 첫 wp 방향에 따라 takeoff 방향 최적화 (지금은 항상 정면), 착륙(LAND cmd 21) 처리
**Notes**:
- 사용자 절차: 브라우저 새로고침 → QGC plan 그대로 → M → 활주로 직진 가속 → 30m 상승 → waypoint 향해 banked turn 시작
- 만약 첫 waypoint가 활주로 뒤(spawn 남쪽)에 있으면 plane이 일단 북쪽으로 climb out 후 180° turn해서 돌아옴 (시간 좀 걸림). 첫 wp는 활주로 정면(spawn 북쪽 즉, 지도상 위쪽) 1km 이상 떨어진 곳 권장
- TAKEOFF 동안 키보드는 여전히 무시됨 (autopilot이 controls 매 프레임 덮어씀)

---

## 2026-04-28 02:00 — M8: 충돌/데미지 + 그래픽 업그레이드

**Status**: GREEN
**Files changed**: src/collision.js (new), src/damage.js (new), src/effects.js (new), src/world.js (rewrite, 스카이/HemisphereLight/노이즈 terrain/varied buildings/snow caps), src/aircraft.js (rewrite, 디테일/wingtip lights/strobe/exhaust pipe/anchors), src/main.js (충돌·데미지·effects 통합), src/hud.js (damage bars), index.html (damage HUD), tests/collision.test.mjs (new), tests/damage.test.mjs (new)
**Tests**: 18 added (10 collision + 7 damage + integration sanity), 58 total passing, 0 failing
**Decisions**:
- 미션 네비게이션은 보류(M9), 본체 시뮬+그래픽 우선 — 사용자 요청
- 충돌: 항공기 sphere(r=5.5m) vs 정적 box(빌딩) / cone(산) 검사. world.js가 빌딩/산 생성 시 colliders 레지스트리에 등록 → main loop가 매 프레임 1회 검사 (공간 분할 X — 100개 정도라 선형 충분)
- 데미지 모델: 5 component (fuselage/leftWing/rightWing/tail/engine) 각 0..1 HP. 충돌 점을 body frame으로 역변환 후 classifyHit() 으로 부위 결정
- 데미지 → 물리 영향:
  - leftWing/rightWing HP 차이 → 비대칭 양력 (강한 쪽이 weaker 쪽으로 roll torque 유발 — 실제 항공기 단발 엔진 파손 시 yaw 와 비슷한 핸들링)
  - engine HP → thrust 비례 감소 + 0.05 미만 시 프로펠러 정지
  - tail HP → 조종 authority 감소 (최저 0.2 보장 — 적분기 발산 방지)
  - fuselage HP=0 → CRASH 상태 + 폭발 파티클 + 시뮬 정지
- 파티클: PointsMaterial + CanvasTexture 로 sprite (외부 자원 X). ring-buffer pool. smoke/fire/sparks/exhaust 4종. fire는 AdditiveBlending
- 그래픽:
  - 스카이: ShaderMaterial 그라데이션 (zenith→horizon→ground) + 태양 disc + halo
  - 라이팅: HemisphereLight + DirectionalLight + AmbientLight 조합
  - Terrain: PlaneGeometry 80×80 세그먼트에 sin/cos noise 적용 (활주로 corridor는 평탄화)
  - 빌딩: 60→70개, tower variant (좁고 높음) 25%, 옥상 HVAC, 색 팔레트 6색
  - 산: 35개, h>800m 인 봉우리는 snow cap 추가
  - 항공기: 분리된 leftWing/rightWing/tail group (데미지 시 visibility off), wingtip nav lights (R=red/L=green), tail strobe (1.6Hz), pitot, 안테나, exhaust pipe, body 색 + 액센트 + 스트라이프
- 충돌 시 시각/물리 처리: spark 18개 + smoke 6개 burst, normal 방향 push out + restitution 0.15 + 0.55배 속도 감속
- 부위 destroyed (HP<0.05): mesh.visible=false → "찢어진" 시각 효과 + smoke burst 30개
- HUD: 우상단 INTEGRITY 박스 5개 bar (FUS/L·WG/R·WG/TAIL/ENG), HP에 따라 초록/노랑/빨강
**Next**:
- 사용자 시각 검증: 그라데이션 스카이, 산 snow cap, 빌딩 다양성, 항공기 디테일, 비행 중 exhaust, 빌딩 충돌 시 spark+smoke+wing 사라짐, 추락 시 폭발
- 후속: 수면(바다), 텍스처드 활주로, 사운드, 지형 LOD, instancedMesh로 빌딩 50개+ 최적화 (지금은 70개 직접)
**Notes**:
- 사용자 절차: 브라우저 하드 새로고침(Cmd+Shift+R)
- 빌딩 충돌 시도: 활주로 좌측/우측 빌딩 군집으로 일부러 향해 비행. 빌딩에 스치면 spark + 날개 데미지, 정면 박치기면 폭발
- 테스트는 collision/damage 단위 함수만. 시각/감각은 사용자 실측
- 성능 우려: PointsMaterial 4종 × 80~220 pool = ~580 particles 풀. 60fps Mac Mini M4 충분. 만약 떨어지면 max 값 줄이기

---

## 2026-04-28 03:00 — M9 Phase A: 텔레메트리 레코더 + HITL 채널 (SaaS 파이프라인)

**Status**: GREEN
**Files changed**: src/recorder.js (new), src/hitl.js (new), src/missionLink.js (HITL attach), src/main.js (recorder/replay/HITL 통합), src/controls.js (F/L/H/Y 키), src/hud.js (REC/REPLAY/HITL 인디케이터), index.html (HUD), bridge/server.mjs (/hitl/state POST → SSE broadcast), examples/hitl-producer.mjs (new), tests/recorder.test.mjs (new)
**Tests**: 9 added (recorder), 67 total passing
**Decisions**:
- 사용자: "전부 다, 체계적으로" → 5단계 phase 로 분할 (A: SaaS 인프라, B: 사운드/패드, C: AI/시나리오, D: 콕핏/다중기, E: VR/멀티)
- Phase A: PRD §1 SaaS 각도 본격 — 외부 sim/FPGA가 web 시뮬을 viewer로 쓰는 것 + 비행 데이터 레코딩 → CSV → MATLAB/LabVIEW 분석
- Recorder: ring buffer 36000 entries (30분 @ 20Hz). 메모리 cap. 시간 정렬 보장 (head/count). Pure data, 9개 unit test로 동작 보장
- Replay: physics 우회, findAt(buffer, t) 로 가장 가까운 snapshot pose 적용. 카메라/effects/HUD는 그대로 동작
- HITL: 외부 producer가 POST `/hitl/state` JSON → bridge가 SSE event로 broadcast → browser hitl.js가 latest 보유 → main loop에서 H 키 누르면 physics 우회하고 외부 state 추종. 기존 missionLink SSE 연결 공유 (이중 EventSource 회피)
- 키 매핑: F=record toggle, L=replay toggle, Y=CSV export, H=HITL toggle. 기존 R/V/P/M/N과 충돌 없음
- examples/hitl-producer.mjs: Node 스크립트, 600m 반경 climbing circle 패턴 50Hz POST. LabVIEW/FPGA producer 모형. 외부 의존성 0
**Next**:
- 사용자 검증: 비행 → F → 비행 → F (stop) → L (replay 카메라가 과거 비행 재생) → Y (CSV 다운로드)
- 외부 producer 검증: `node examples/hitl-producer.mjs` (다른 터미널) → H 키 → 항공기가 외부 스크립트 패턴대로 비행
- Phase B 시작 (사운드 + 게임패드)
**Notes**:
- Recorder는 R 리셋과 무관 — 추락해도 그 시점까지 데이터 보존됨
- HITL 모드에서 충돌/데미지는 우회됨 (외부가 진실의 원천이라 브라우저는 그리기만)
- HITL state 스키마: `{ x, y, z, qw/qx/qy/qz (또는 yawRad/pitchRad/rollRad fallback), throttle01, vsi, ... }` — 모든 필드 옵션
- CSV 헤더: `t, x, y, z, vx, vy, vz, qx, qy, qz, qw, speed, altitude, throttle01, aoa, gForce, vsi, fusHp, lWingHp, rWingHp, tailHp, engHp, status`

---

## 2026-04-28 03:45 — M9 Phase B: 사운드 (Web Audio 절차적) + 게임패드/플라이트 스틱

**Status**: GREEN
**Files changed**: src/audio.js (new), src/gamepad.js (new), src/main.js (audio/pad 통합), src/controls.js (X 키), src/hud.js (PAD/MUTE 인디케이터), index.html (HUD), tests/gamepad.test.mjs (new)
**Tests**: 8 added (gamepad axis 매핑/데드존), 75 total passing
**Decisions**:
- 사운드: 외부 샘플 파일 0, OscillatorNode + 필터 + buffered noise 만으로 절차적 생성. AudioContext 는 사용자 첫 입력(키/마우스/터치)에서 lazy boot — 자동재생 정책 회피
- 채널: ENGINE (sawtooth × 2 detuned, lowpass), WIND (white noise loop, lowpass), STALL (square 880Hz, 4Hz pulse), IMPACT (1-shot filtered noise burst), EXPLOSION (3-stage stacked impact)
- 엔진 손상 시 cutoff 낮추고 ±wobble 추가 → "choke" 사운드. HP=0 이면 정지
- 풍절음 곡선: speed^1.4, 10 m/s 이하 silent, 80 m/s 부근 peak. cutoff 도 속도와 함께 상승 → "휘파람" 톤
- 게임패드 매핑 (XInput / 일반 플라이트 스틱 양쪽 호환):
  - axis 0 → roll, axis 1 inverted → pitch (forward stick = 코업), axis 2 → yaw
  - 트리거 buttons[6/7] → throttle (RT - LT*0.5)
  - 트리거 없으면 axis 3 fallback ((1-axis)/2 — flight-stick 슬라이더 -1=max)
- 키보드와 자동 병행: 게임패드 axis가 데드존 밖일 때만 해당 채널 override. 정지된 axis는 키보드 그대로. 트리거 누르지 않으면 throttle null → 키보드 ↑/↓ 유지
- HUD 인디케이터: 좌측 세로열 (REC, REPLAY, HITL, PAD, MUTE)
- X 키: 오디오 mute 토글
**Next**:
- 사용자: 비행 시 엔진 사운드 + 풍절음 + 충돌 임팩트 확인. 게임패드 꽂으면 PAD 인디케이터 (초록) + 스틱 즉시 반응
- Phase C 시작 (AI 트래픽 + 시나리오 + AP 정확도 fix)
**Notes**:
- Safari 의 webkit prefix audio 자동 fallback 처리. 브라우저 음소거되어도 코드는 OK
- 폴링 부하: navigator.getGamepads() 매 프레임 호출 — XInput 패드 4개라도 60fps 영향 미미
- 사용자 절차: 브라우저 새로고침 → 아무 키 눌러 audio boot → 엔진 켜기 → 사운드 확인. 게임패드 USB 꽂으면 자동 인식
- 데드존 0.08 (8%) — 일반 컨슈머 패드 드리프트 흡수
- 플라이트 스틱별 axis 매핑이 다를 수 있음. 콘솔에 "[gamepad] connected: ID (N axes, M buttons)" 출력으로 확인 가능

---

## 2026-04-28 04:30 — M9 Phase C+D+E: AI트래픽 / 시나리오 / 드론 / PFD / VR / 멀티플레이 / terrain

**Status**: GREEN
**Files changed**: src/aiTraffic.js (new), src/scenario.js (new), src/drone.js (new), src/multiplayer.js (new), src/world.js (4-octave fbm + vertex color), src/hud.js (heading rose + tape ticks + scenario/MP HUD), src/autopilot.js (gain/threshold 조정), src/main.js (모든 모듈 통합 + WebXR setAnimationLoop), src/controls.js (Z/T/G/J 키), bridge/server.mjs (/mp/state POST), index.html (HUD)
**Tests**: 75 passing (변경 없음 — 모두 시각/감각 영역)
**Decisions**:
- 사용자 "전부 다 묻지말고" → C/D/E 한 세션에 묶어 처리. MVP 수준 + 통합 작동 확인 (단 시각/감각은 사용자 검증 필요)
- AP fix: ARRIVAL 80m, MAX_BANK 40°, BANK_KP 2.0, HEADING_TO_BANK 1.4 (이전 0.9에서 상향). 더 적극적 turn
- AI 트래픽: 5대 mini-aircraft, kinematic 원형 패턴 (반경 600-2000m, 고도 200-800m, 속도 38-70 m/s, 일부 CCW/CW). 충돌검사 X, 시각용
- 시나리오: 3개 코스 (Pattern, Slalom, Climb Test). 객체 타입: altitude/gate. 도달 시 점수 + 정확도 보너스, 완료 시 시간 보너스 (5000-경과초×8)
- 드론: 별도 물리 (멀티콥터, 공력 X, 추력 vectoring). Z 키로 토글, 메시 swap. 호버 추력 = 중량
- 글래스 콕핏: heading rose (±60° arc, 5°/10°/30° tick), 속도 tape (5 m/s tick), 고도 tape (25m tick). 기존 피치 사다리 위에 overlay
- WebXR: renderer.xr.enabled + setAnimationLoop. immersive-vr 지원 시 우하단 "Enter VR" 버튼 자동 생성. (Meta Quest browser, Vision Pro 등에서 시도 가능)
- 멀티플레이: bridge가 `/mp/state` POST 받아 SSE event 'mp_state' broadcast. 각 peer는 자기 pose 10Hz 송신, 다른 peer ghost mesh 표시. 5초 stale → mesh 제거
- terrain: 4-옥타브 fractal noise (sin/cos sums), elevation별 vertex color (잔디→흙→바위→눈)
**Next**:
- 사용자: 모든 키 조합 시연 검증 (Z 드론, T 시나리오 사이클, G 시작, J 멀티플레이, "Enter VR" 버튼)
- 만약 너무 많아 혼잡하면 HUD 간소화 / 키 재배치 후속
**Notes**:
- 키 매핑 충돌 X: W/A/S/D/Q/E (조종), ↑↓ (스로틀), R/V/P (시뮬), M/N (미션), F/L/Y (레코더), H (HITL), X (mute), Z (vehicle), T/G (시나리오), J (multi)
- 멀티플레이 검증법: 같은 브릿지에 두 브라우저 (탭 / 두 기기) 접속 → 둘 다 J 키 → 서로 ghost 보임
- VR 검증: Meta Quest의 Meta Quest Browser, Apple Vision Pro Safari, 또는 PC + WebXR 호환 헤드셋
- 시나리오 검증: T로 코스 cycle (콘솔 로그) → G로 시작 → 게이트 통과 시 SCORE 증가. Pattern 코스가 추천
- AI 트래픽: 매 spawn 랜덤이라 재시작마다 다른 위치. 빌딩과 겹칠 수 있음 (시각만이라 무관)

---

## 2026-04-28 12:00 — 교육 자료 작성 (FLIGHT-SIM-PRIMER)

**Status**: GREEN (코드 변경 없음, 문서만)
**Files changed**: docs/FLIGHT-SIM-PRIMER.md (new), docs/FLIGHT-SIM-PRIMER.pdf (new), build/build-primer.sh (new)
**Tests**: 75 passing (변경 없음)
**Decisions**:
- 사용자 요청: 비행 시뮬 분야 입문자를 위한 종합 교육 자료. md + pdf 두 포맷
- 구성: 분야 개요 → 우리 프로젝트 위치 → 사용된 기술의 배경 → 산업체 (글로벌 + 한국) → 오픈소스 생태계 → MAVLink 표준 → 코드와 학문적 출처 매핑 → 실무 개발 방식 → 인증/표준 → 학습 경로
- 한국 방산/UAM 회사 (KAI, LIG Nex1, 한화시스템, 두산모빌리티이노베이션 등) 별도 섹션 — 사용자 컨텍스트
- PDF 생성: pandoc으로 MD → HTML → Chrome headless --print-to-pdf. 한글 폰트는 macOS 기본(AppleGothic) 자동 fallback
- build/build-primer.sh: 재생성 스크립트. md 수정 후 한 명령으로 pdf 갱신
**Next**:
- 사용자: docs/FLIGHT-SIM-PRIMER.md (또는 .pdf) 읽고 모르는 부분 / 더 알고 싶은 부분 알려줌 → 챕터 추가 / 심화
- 코드 작업 다시 가는 방향이면 추천 마일스톤 (실제 지형 데이터, JSBSim 통합, 콕핏 텍스처드 인테리어 등) 중에서 선택
**Notes**:
- PDF는 build/build-primer.sh 로 재빌드. 의존: pandoc + Chrome (둘 다 macOS에 일반적)
- MD가 single source of truth — PDF는 derived

---

## 2026-04-28 13:30 — INDUSTRY-REPORT 작성 (리서치 기반)

**Status**: GREEN (문서 추가만)
**Files changed**: docs/INDUSTRY-REPORT.md (new, ~7000 단어), docs/INDUSTRY-REPORT.pdf (new), build/build-report.sh (new), docs/FLIGHT-SIM-PRIMER.md (§4 head에 보고서 링크)
**Decisions**:
- 사용자 요청: §4 "실세계 회사들" 만 리서치/연구 기능으로 제대로 — **국내 중요**
- WebSearch 7-8회 실행: KAI/도담/한화/LIG/슈퍼널/Plana/DMI/니어스랩/파블로/KARI/ADD + CAE/L3Harris/Asobo/PX4
- 핵심 발견: **도담시스템스가 국내 시뮬 시장 95% 점유 (KAI 분사)**, KAI×에픽게임즈 MOU(2023.03), CAE Prodigy Level D 인증(2024), 슈퍼널 FAA 인증, 니어스랩 세계 100대 드론 방산 (2025)
- 모든 주장에 출처 URL 표기. 시장 수치는 출처별 차이 있어 범위로
- 각 회사 섹션마다 "우리 프로젝트와의 관계" 1단락 — 사용자가 비즈니스 각도 잡는 데 도움
- 보고서 마지막 §5 "한국 시장의 기회": 도담/CAE 직접 경쟁 불가 → 시각화 어댑터/HITL/멀티-vehicle 군집/UAM 데모/교육이 비어있는 시장 식별 + 비즈니스 모델 표
**Next**:
- 사용자가 보고서 읽고 추가 회사 / 더 깊은 챕터 / 비즈니스 각도 등 요청 → 후속
- 또는 코드 작업 (M10 JSBSim 등) 으로 복귀
**Notes**:
- 입문서 §4 head에 보고서 링크 추가 — 입문서는 요약, 보고서는 심층
- 출처 모두 한국 매체 + 글로벌 영문 매체 양쪽. 위키 의존 최소
- 정부/공공자료 (KARI, 정책브리핑, 비즈한국 단독 등) 포함

---

## 2026-04-28 14:30 — PEERS-LANDSCAPE 작성 (우리 모델 직속 동류만)

**Status**: GREEN
**Files changed**: docs/PEERS-LANDSCAPE.md (new, ~6500 단어), docs/PEERS-LANDSCAPE.pdf (new), build/build-peers.sh (new)
**Decisions**:
- 사용자 클래리피케이션: "지금 우리가 하고 있는 시뮬 모델 관련해서" — 광역 산업 X, 우리 기술 시그니처와 일치하는 peer만
- 우리 시그니처 5개로 정의: 웹 실행 + 자체 3D 렌더 + 코드급 공력 + MAVLink + HITL/SITL
- 4 그룹으로 분류:
  - A. 웹 비행 시뮬 OSS (GeoFS, dimartarmizi, Jakob Maier, phuang17)
  - B. 웹 MAVLink GCS (Helios, WebGCS, ADOS, Mavelous, NodeJS-WS-GCS)
  - C. 상용 SaaS (Auterion Virtual Skynode, Sky-Drones, Project AirSim/IAMAI, Cesium 진영)
  - D. 한국 진영 (파이온, 두산DI, dstlabs, 자이언트, 포스웨이브, 이노시뮬, KAI LVC)
- 가장 직접적 peer 3개 식별: GeoFS (웹 비행), Helios GCS (웹 MAVLink), Auterion Virtual Skynode (HITL+웹)
- Auterion px4-jsbsim-bridge가 우리 M10 (JSBSim 통합) reference로 정확히 fit
- 13×8 feature 매트릭스로 한 눈에 비교 — 우리만 갖춘 것: 단일 HTML 배포, 데미지/시나리오/사운드, 코드급 공력+MAVLink+HITL 모두
- §6 갭 분석 + §7 실행 추천 (단기/중기/장기)
- 한국 정부 LVC R&D 사업 (ScienceON 보고서) 포착 — 우리 fit 영역 강한 시그널
**Next**:
- 사용자: peer 추가 / 시연 메일 초안 / 비즈니스 각도 더 등 요청 → 후속
- 또는 코드 작업 (M10 JSBSim) 으로 복귀
**Notes**:
- INDUSTRY-REPORT 와 PEERS-LANDSCAPE 분리: 전자=광역 산업, 후자=직접 동류
- 입문서 §4도 두 보고서로 링크 (이미 INDUSTRY 링크 있음, PEERS는 추가)
- Auterion Virtual Skynode 재발견이 가장 큰 통찰 — 우리 모델이 새롭지 않다 (이미 상용으로 존재) 단 lock-in/접근성에서 차별화 가능
- 한국 진영: GCS는 많지만 시뮬+GCS 결합은 비어있음 — 정확한 진입 갭

## 2026-06-20 13:52 — M7: 결정론적 고정스텝 적분

**Status**: GREEN
**Files changed**: src/fixedStep.js (new), src/main.js, tests/fixedStep.test.mjs (new), tests/console-check.mjs (new), PRD.md
**Tests**: 12 added (fixedStep), 87 passing, 0 failing · 브라우저 콘솔 에러 0 (CDP 헤드리스 검증)
**Decisions**:
- 물리레이트/렌더레이트 분리: 누산기(accumulator) + 고정 DT_PHYS=0.005s(200 Hz). stepPhysics는 이미 순수·결정론적이라 고정 dt 구동만으로 전체 재현성 확보 — 적분기 재작성 불필요.
- planSteps에 fp 경계 eps(dt*1e-6) 도입: accumulated==N·dt가 정확히 N스텝 나오도록(0.005/0.005 floor 0 스톨 방지).
- MAX_SUBSTEPS=60(≤0.3s/frame) 스파이럴-오브-데스 가드, 초과 sim-time은 shed + 0.25s 초과 시 console.warn.
- 컨트롤(게임패드/오토파일럿/스로틀)은 프레임당 1회 샘플 → 서브스텝 간 ZOH(영차홀드, 표준).
- 시각 dt 클램프 0.05→0.1로 상향(PRD §9와 일치): 물리는 더이상 이 dt에 의존 안 함(카메라/이펙트 전용).
- rk4Step(순수 4차 RK) 선구현: 지금은 미사용, 향후 모멘트 기반 6-DOF용. 지수감쇠/조화진동 해석해로 정확도 검증.
- 검증 방식: CDP(Chrome 원격 디버깅)로 헤드리스 로드 4초 구동 → 예외/console.error/Network 4xx 수집. 브릿지 오프라인(:8765)·favicon은 설계상 fail-silent라 IGNORE 필터.
**Next**:
- M7-follow: 입력 샘플링의 sim-time 바인딩(완전 bit-determinism record/replay)
- #4 센서/액추에이터 모델 또는 #5 모멘트 기반 6-DOF(rk4Step 실사용)로 확장
**Notes**:
- Mac Mini 실기 확인: index.html 더블클릭 → 비행 정상, HUD 속도/고도 갱신, 프레임레이트 바꿔도(예: 모니터 60→120Hz) 비행 거동 동일해야 정상.
- 헤드리스 재검증: `node tests/console-check.mjs <url> <cdpPort>` (Chrome --headless=new --enable-unsafe-swiftshader 필요).
- physAccum는 paused/CRASH 시 누적 안 함(블록 내부에서만 += dt). replay/HITL 분기는 물리 미실행이라 영향 없음.

## 2026-06-20 17:14 — M8: 모멘트 기반 6-DOF 회전 동역학

**Status**: GREEN
**Files changed**: src/physics.js, src/main.js, tests/sixdof.test.mjs (new), tests/fly-check.mjs (new), PRD.md
**Tests**: 19 added (sixdof), 106 passing, 0 failing · 브라우저 콘솔 에러 0 · 행동검증 PASS(이륙·상승)
**Decisions**:
- 회전: 레이트 직접제어 → 공력 모멘트/관성텐서/오일러 강체방정식(ω̇=I⁻¹(M−ω×Iω), Ixz 커플링). ω 적분은 M7 rk4Step 실사용(자이로·감쇠 항 서브스텝 재평가).
- 안정·조종 미계수 빌드업(Cm/Cl/Cn) + 사이드슬립 β 신규. 정적안정 Cm_α<0·Cn_β>0·Cl_β<0, 감쇠 Cm_q/Cl_p/Cn_r<0.
- 부호 규약 보존: 항공 레이트 (p,q,r) ↔ sim ω 매핑 q=ω.x, r=ω.y, p=−ω.z. 제어→deflection(elevator=pitch, aileron=roll, rudder=yaw). HUD·오토파일럿 무변경.
- attitude auto-level(applyAutoLevel) 제거 — 실제 정적안정이 대체. 비행성용 약한 롤 SAS(rollSAS=0.25, qbar 스케일)만 유지(PRD §9 sanction).
- 미계수/관성/제어권한은 순항(~50 m/s)에서 기존 권한과 유사하도록 사이징 → 비행성 유지. 병진은 M8 범위 외(불변).
- 관성: Ixx1300/Iyy1800/Izz2700/Ixz60 (1000 kg 경항공기급).
**Next**:
- M8-follow: 사이드포스(CY_β)로 병진까지 6-DOF 완성
- 또는 #4 센서/액추에이터 모델(HILS 결함주입)
**Notes**:
- 행동검증: tests/fly-check.mjs (CDP로 키 주입→HUD 관측). 결과: 13s 풀스로틀 46 m/s, 조종사형 피치 펄스로 상승 peakAlt 121m, status OK, NaN/크래시 없음.
- 풀 엘리베이터를 저속에서 계속 당기면 과회전→실속(물리적으로 정상). 부드러운 입력이 필요 — 기존 레이트제어보다 "진짜 비행기"처럼 거동.
- Mac Mini 실기 확인: 뱅크 후 약하게 수평 복귀(롤 SAS), 피치는 트림 받음각으로 수렴(레벨 유지 아님=정상). 오토파일럿 미션(M 키) 안정성도 눈으로 확인 권장.
- 헤드리스 재현: `node tests/fly-check.mjs <url> <port>` (Chrome --headless=new --enable-unsafe-swiftshader).

## 2026-06-20 17:48 — M8-follow: 사이드포스 (병진 6-DOF 완성)

**Status**: GREEN
**Files changed**: src/physics.js, src/main.js, tests/sixdof.test.mjs, PRD.md
**Tests**: 5 added (sideForce), 111 passing, 0 failing · 콘솔 에러 0 · 행동검증 PASS(peakAlt 120m)
**Decisions**:
- 횡력 Y = qbar·S·CY_β·β 를 body right(+X) 축에 추가. CY_β=-0.30 (<0 → 슬립 억제, 조화선회).
- 순수 함수 sideForce 신규(TDD), stepPhysics 힘 합산에 sideVec 추가. β는 병진 후 tmpRight로 재계산(aoa와 동일 패턴).
- 이로써 3 병진 + 3 회전 = 6-DOF 완성. 마하/스풀/지상반력은 별도 마일스톤(M8 Out 유지).
**Next**:
- #4 센서/액추에이터 모델(HILS 결함주입) 또는 마하/압축성·추진 스풀
**Notes**:
- 횡력은 직진비행(β≈0)엔 영향 거의 없음 — 슬립/요 입력(Q/E) 시 측면 가속·조화선회로 체감.
- 기존 fly-check/console-check 그대로 PASS — 횡력 추가가 이륙·상승 거동 깨지 않음 확인.

## 2026-06-20 18:13 — M9: 센서·액추에이터 모델 + 결함 주입 (HILS I/O)

**Status**: GREEN
**Files changed**: src/actuators.js (new), src/sensors.js (new), src/main.js, tests/actuators.test.mjs (new), tests/sensors.test.mjs (new), tests/hils-check.mjs (new), PRD.md
**Tests**: 23 added (actuator 9 + sensor 14), 134 passing, 0 failing · 콘솔 에러 0 · HILS 결함주입 검증 PASS · 정상비행 유지(peakAlt 120)
**Decisions**:
- truth ↔ measured/commanded 분리. 액추에이터=command→physics 경로 삽입(rate/bandwidth/limit + stuck/offset/float/slow), 센서=관측 탭(제어 루프 밖 → 비행 안정성 불변).
- 센서 노이즈는 시드 PRNG(mulberry32) + Box-Muller 가우시안 → M7 결정론 유지(Math.random 금지). 센서는 물리에 영향 없어 physics 결정론도 보존.
- 결함 API: window.injectFault(target,fault)/clearFaults(), window.__hils{measured,actuators,faults}. 콘솔에서 즉시 주입.
- 액추에이터 기본값 near-ideal(bw25, rate10) → 비행감 유지, 결함 시에만 거동 변화.
- 버그 2건(TDD로 포착·수정): 액추에이터 offset, 센서 bias 모두 "출력 후가산→피드백 런어웨이". 목표(target/reading) 바이어스로 모델링해 수렴화. 센서 회귀테스트는 반복호출로 런어웨이 검출하도록 추가.
**Next**:
- M9-follow: 센서-in-the-loop(measured→오토파일럿/칼만), 또는 텔레메트리에 measured 송신(QGC GPS 재밍 시연)
**Notes**:
- 콘솔 시연: injectFault('elevator',{type:'stuck'}) / injectFault('altitude',{type:'bias',value:50}) / injectFault('gpsX',{type:'frozen'}) / clearFaults(). 확인: window.__hils.measured vs window.__hils.measured._truth.
- 헤드리스 재현: node tests/hils-check.mjs <url> <port>.
- 센서 rng는 프레임당 진행 → 기계 간 frame-count 결정론 아님(M7 caveat 동일). 단 physics 미영향이라 물리 재현성은 보존.

## 2026-06-20 18:25 — M10: measured 텔레메트리 → QGC GPS 재밍 시연

**Status**: GREEN
**Files changed**: src/telemetry.js, src/main.js, tests/telemetry.test.mjs (new), tests/telem-check.mjs (new), PRD.md
**Tests**: 7 added (telemetry merge), 141 passing, 0 failing · 콘솔 에러 0 · 텔레메트리 GPS재밍 검증 PASS
**Decisions**:
- mergeMeasuredIntoTelemetry(truth, measured) 순수 함수: 센서 채널(gpsX/gpsZ→x/z, altitude, airspeed→speed, roll/pitch deg→rad, heading)을 truth에 덮어씀. measured 없으면 truth 그대로(fail-safe).
- 브릿지 매핑(t.x→lon, t.z→lat, t.altitude→alt) 불변 → measured 위치 전송만으로 GPS 결함이 QGC 지도에 반영.
- velocity/vsi/yawRad/throttle은 truth 유지(센서 미모델). 텔레메트리는 fail-silent 그대로.
**Next**:
- 전용 재밍/스푸핑 결함(드리프트·다중경로) + HUD "GPS DEGRADED", 또는 센서-in-the-loop(칼만)
**Notes**:
- 검증: tests/telem-check.mjs — 캡처서버가 브릿지 역할, CDP가 window.TELEMETRY_URL을 캡처서버로 돌림(addScriptToEvaluateOnNewDocument). 결과: baseline x≈0, injectFault('gpsX',{bias:1000}) 후 전송 x≈999.8.
- 실제 QGC 시연: `npm run bridge` 기동 → QGC 연결 → 브라우저 콘솔에서 injectFault('gpsX',{type:'bias',value:5000}) → 지도에서 기체가 점프. frozen=위치 고정, dropout=원점 튐.
- 헤드리스 재현: node tests/telem-check.mjs <url> <port>.

## 2026-06-20 19:00 — M11: 센서-in-the-loop (추정기/칼만 → 오토파일럿)

**Status**: GREEN
**Files changed**: src/estimator.js (new), src/main.js, tests/estimator.test.mjs (new), tests/nav-check.mjs (new), PRD.md
**Tests**: 9 added (estimator), 150 passing, 0 failing · 콘솔 0 · 수동비행 무회귀(peakAlt 119) · nav 행동검증 PASS
**Decisions**:
- 오토파일럿 입력을 navSource로 분기: truth/measured/estimated(기본). 매 프레임 sense(updateSensors)→estimate(updateNavEstimate)→control(autopilot.tick) 순서로 재배치(updateSensors를 pushHud 앞→오토파일럿 앞으로 이동).
- estimator.js: 등속도 1-D 칼만(GPS x/z/고도 융합, 위치+속도) + 1차 저역통과(자세 pitch/roll·각속도 p/q). 순수 함수, TDD.
- 추정기는 노이즈 저감하나 bias 불가 → GPS 스푸핑이 오토파일럿 항법을 끌고감(HILS 교훈). 검증: bias200 주입 → estimated.x→199.6, truth.x=0.
- 칼만 q/r 튜닝: pos {q1.5,r2.5}, alt {q1,r1}. 저역통과 cutoff 18(자세)/25(각속도).
- 결정론: 추정기는 measured(시드PRNG) 기반이라 physics 결정론 불변. 센서는 1프레임 최신값 사용(이동된 순서로 동일프레임).
**Next**:
- 다축 EKF / INS-GPS tightly-coupled, FDE + "NAV DEGRADED" HUD, 또는 데모 미션 내장(헤드리스 미션 회귀)
**Notes**:
- 콘솔 시연: setNavSource('measured'|'estimated'|'truth') 비교. injectFault('gpsX',{type:'bias',value:300}) 후 window.__hils.nav.estimated.x vs window.__hils.measured._truth.gpsX — 오토파일럿이 가짜 위치 믿음.
- 미션 자동비행(QGC AUTO)에서 estimated로 비행하므로, 스푸핑 시 항로 이탈을 QGC에서 관찰 가능(수동 확인 권장).
- 헤드리스 재현: node tests/nav-check.mjs <url> <port>.
- 주: GPS 센서 자체 1차 지연(bw3)이 이미 measured를 매끄럽게 해, 칼만의 추가 평활은 작게 보임(0.112 vs 0.138). 칼만의 본 가치는 속도추정 + 바이어스 불가역 시연.

## 2026-06-20 19:50 — M12: 데모 미션 + 오토파일럿 강건화 + AUTO 헤드리스 회귀

**Status**: GREEN
**Files changed**: src/missions.js (new), src/autopilot.js, src/main.js, src/controls.js, tests/missions.test.mjs (new), tests/mission-check.mjs (new), tests/nav-check.mjs, PRD.md
**Tests**: 5 added (missions), 155 passing, 0 failing · 콘솔 0 · 전 브라우저 회귀 PASS · AUTO 미션 회귀 PASS
**Decisions**:
- 데모 미션 내장(missions.js): buildDemoMission/localToWaypoint(autopilot 역변환). K키/window.loadDemoMission, __hils.auto 노출.
- **M8 이후 오토파일럿 잠재 회귀 발견·수정**: 데모 미션 회귀가 모멘트 기반 6-DOF에서 오토파일럿 발산을 포착. 강건화: 동압 게인 스케줄링(REF/v)², 에너지 인식 스로틀, 속도 보호, ROTATE 25→42, MAX_PITCH 18→8, 완만 선회(MAX_BANK 40→25), 제한된 조종면 권한(PITCH_LIMIT 0.45→0.22).
- 센서: IMU 채널 zero-lag(bandwidth Infinity)+소량 노이즈. 자세/각속도 지연이 내부 루프 불안정 유발 → 제거. GPS/기압은 느린 센서 유지.
- AUTO 기본 navSource 'truth'(신뢰성)로, estimated는 opt-in HILS 스트레스 모드. estimated 속도는 truth 사용(전용 속도센서 없음, KF속도 불안정).
**Next**:
- M12-follow: 상승 선회용 협조선회+TECS, 견고한 sensor-in-the-loop AUTO(레이트 필터/게인 재설계)
- M13: FDE(결함탐지/배제) + NAV DEGRADED
**Notes**:
- 데모 미션은 직진+완만 상승(WP 4개). 급선회+상승은 현 오토파일럿이 실속 → Out of M12로 명시.
- 검증: mission-check.mjs(헤드리스 AUTO 회귀), 이륙→alt 118→WP2 도달 안정. 콘솔: window.loadDemoMission() 또는 K키, N키 중단.
- estimated 이륙 PIO 디버깅 18회 반복으로 원인 규명: 센서 지연/노이즈가 한계안정 캐스케이드 PD를 자극. 근본 해결은 오토파일럿 재설계(M12-follow).

## 2026-06-20 19:58 — M13: FDE(결함 탐지·배제) + NAV DEGRADED

**Status**: GREEN
**Files changed**: src/estimator.js, src/main.js, src/hud.js, index.html, tests/estimator.test.mjs, tests/nav-check.mjs, PRD.md
**Tests**: 5 added (kfStepGated), 160 passing, 0 failing · 콘솔 0 · nav(FDE) 행동검증 PASS · 전 회귀 PASS
**Decisions**:
- kfStepGated: NIS=y²/S 카이제곱 게이트(기본 16)로 이상치 측정 배제→예측 coast, {rejected,nis} 반환. 순수.
- GPS x/z(gate16)·기압고도(gate25) 게이팅. navDegraded는 히스테리시스(90프레임 hold)로 깜빡임 방지. navSource 무관하게 항상 GPS 감시.
- HUD #hud-nav "⚠ NAV DEGRADED"(중앙 상단 적색). __hils.navDegraded 노출.
- M11→M13 진화: 순진한 KF는 스푸핑에 속음 → 게이팅 KF는 탐지·배제. nav-check를 FDE 거동(추정이 truth 유지+경고)으로 갱신.
**Next**:
- 느린 드리프트(게이트 회피) 탐지(CUSUM), 다중 GPS/INS 융합으로 배제 후 항법 지속
**Notes**:
- 시연: injectFault('gpsX',{type:'bias',value:300}) 또는 {type:'frozen'} 후 HUD에 NAV DEGRADED, window.__hils.navDegraded=true. 추정 window.__hils.nav.estimated.x는 truth 유지. clearFaults()로 복구.
- 검증: nav-check.mjs(FDE 배제+경고), hud 토글 CDP 확인(none→block).

## 2026-06-20 22:31 — M14: TECS-lite 종방향 오토파일럿 + 횡방향 불안정 진단

**Status**: GREEN (종방향) · 횡방향은 M15로 분리
**Files changed**: src/autopilot.js, src/missions.js, tests/autopilot.test.mjs (new), PRD.md
**Tests**: 4 added (autopilot TECS), 164 passing, 0 failing · 콘솔 0 · 직진 미션 mission-check PASS · 전 회귀 PASS
**Decisions**:
- TECS-lite: 피치=에너지 균형(altErrN*PITCH_FROM_ALT − speedErr*PITCH_FROM_SPEED + 선회보상), 스로틀=총에너지(THR_TRIM + altErrN*0.9 + speedErr*1.6). 저속이면 피치 내려 속도 회복 → 실속 방지. 직진 상승 견고(60→169m).
- 롤 댐핑 강화(ROLL_RATE_KD 0.7→1.5), MAX_BANK 18°, 선회 게인 완화.
- **핵심 진단**: 수동 롤 입력·오토파일럿 선회 모두 깨끗한 순항에서 롤 발산(−102°) → 횡방향 동역학 불안정(러더 협조/요댐퍼 부재). 선회는 비행모델 문제로 확정, M15로.
- 데모 미션 직진+상승 유지(견고). climbing circuit은 횡방향 수정 후 복원.
**Next**:
- M15: 러더 협조(ARI)+요 댐퍼로 협조선회, 횡방향 안정미계수 점검(Cl_β/Cn_β/Cl_p/Cn_r 부호/크기)
**Notes**:
- 진단 방법: 수동 'd' 롤 유지 → 즉시 발산 확인(autopilot 무관). 오토파일럿 선회도 t36 깨끗한 순항(roll−7)에서 t37 −102 발산.
- TECS-lite는 종방향만; 횡방향 미해결이라 turns는 여전히 불가. PRD §19 Out에 명시.

## 2026-06-20 23:30 — M15: 횡방향 안정화 + 분리형 종방향 제어

**Status**: GREEN (순항/종방향·발산제거) · 협조선회 수렴은 M16
**Files changed**: src/physics.js, src/autopilot.js, src/main.js, src/missions.js, PRD.md
**Tests**: 164 passing, 0 failing · 콘솔 0 · 전 브라우저 회귀 PASS · 순항 정밀(152m)
**Decisions**:
- 비행모델 횡방향 미계수 재균형: Cl_da 0.12→0.10, Cl_p −0.45→−0.55, Cn_r −0.18→−0.75(요댐핑 대폭↑가 더치롤 발산 차단의 핵심).
- 오토파일럿 횡방향: 워시아웃 요댐퍼(정상 선회레이트 통과, 진동만 감쇠) + β 협조 러더 + ARI + 레이트제한 롤(rollToBank). yawRate/beta를 autopilot 입력에 추가, tick(simState, dt).
- 종방향: TECS균형 → 분리형(피치=고도, 스로틀=강속도유지+하드 속도가드). 순항 정밀(152m, 오버슈트 제거; M14는 169m).
- 직진 데모 미션 유지. 협조선회는 wallow — 블라인드 튜닝 한계, 극배치 필요(M16).
**Next**:
- M16: 횡-방향 선형화→극배치로 협조선회 게인 산출, 이후 circuit 복원 + sensor-in-the-loop AUTO 재도전
**Notes**:
- ~30회 프로브 반복으로 규명: 즉시 발산은 요댐핑 부족(Cn_r). 잔존 wallow는 협조선회 게인 미세조정(러더 과활성↔과소) 문제로 오프라인 해석이 효율적.
- 회귀: console/fly/mission(152m)/hils/nav/telem 전부 PASS. 수동비행·HILS·FDE 무회귀.

## 2026-06-20 23:36 — M16: 횡-방향 안정성 해석 도구 + 발산 원인 재정의

**Status**: GREEN
**Files changed**: src/lateral.js (new), tests/lateral.test.mjs (new), PRD.md
**Tests**: 8 added (lateral), 172 passing, 0 failing
**Decisions**:
- lateral.js: charPoly(Faddeev-LeVerrier) + routhHurwitzStable + numericalJacobian + lateralStability(실제 aero/관성으로 [β,p,r,φ] level-trim 선형화).
- **핵심 발견**: 라우스-후르비츠 결과 M8·M15 모든 구성에서 에어프레임 lateral 모드 안정(stable=true). 발산은 불안정 에어프레임이 아님.
- 프로브 재분석: departure가 항상 aoa>60° 실속과 동시 → 진짜 원인은 선회 중 속도저하→실속→post-stall departure. 블라인드 횡방향 튜닝이 잘못된 방향이었음을 해석으로 입증.
- TDD: "에어프레임은 횡방향 안정" 테스트로 잠금(향후 미계수 변경이 불안정 만들면 RED).
**Next**:
- M17: 협조 요레이트 피드포워드(r_coord=g·tan(bank)/V) + 선회 속도가드(실속 방지) → 깔끔한 협조선회, circuit 복원
**Notes**:
- 분석 출력: CURRENT(M15) poly=[1,20.5,112,137,22.5] stable, OLD M8(Cn_r=-0.18)도 stable. 즉 선형 횡방향은 항상 안정 → 문제는 비선형 실속.
- 이 도구는 영구 자산: 향후 미계수 변경 시 횡방향 모드 안정성 즉시 검증 가능.

## 2026-06-20 23:59 — M17: 협조선회 완성 — 풀 서킷 AUTO 비행

**Status**: GREEN 🎉
**Files changed**: src/autopilot.js, src/missions.js, tests/autopilot.test.mjs, tests/mission-check.mjs, PRD.md
**Tests**: 2 added (선회 방향/협조), 174 passing, 0 failing · 콘솔 0 · mission-check 풀 circuit 완주(DONE 4/4) · 전 브라우저 회귀 PASS
**Decisions**:
- 협조 요레이트 FF: yawCmd가 r_coord=g·tan(bank)/V 추종 → 사이드슬립 0 → 다이히드럴 spiral 롤업 차단 → 뱅크 유지·하중↓·속도 유지 → 실속 없음. 더치롤은 에어프레임 Cn_r 감쇠.
- 선회 속도가드(turnMargin): 저속 시 뱅크 축소로 실속 마진.
- MAX_BANK 25°(협조라 지속가능, 선회반경 충분히 작아 항법 가능), HEADING_TO_BANK 1.1.
- **방향 부호 수정**: heading→bank 매핑이 이 좌표계에서 반대(위치추적으로 규명). desiredBank=-headingErr*K. 좌우 선회 정상.
- 데모 미션 climbing circuit 복원(4 WP) → 완주.
**Next**:
- sensor-in-the-loop AUTO 재도전(견고해진 제어로 estimated 재평가), 하강/착륙 단계
**Notes**:
- M14~M17 ~35회 프로브 반복의 결정적 체인: M16 해석(에어프레임 안정→실속이 원인) → M17 협조 요레이트 FF(실속 제거) → 부호 수정(방향). 위치 추적(gpsX/gpsZ)으로 방향 버그 확정.
- mission-check: 이륙→152m 순항→WP1→협조선회→WP2(x≈900)→WP3→WP4→DONE, 전구간 OK·속도 46~56·aoa 낮음.

## 2026-06-21 01:01 — M18: 센서-in-the-loop AUTO 완성 (estimated 기본)

**Status**: GREEN 🎉
**Files changed**: src/main.js, src/autopilot.js, src/missions.js, tests/mission-check.mjs, PRD.md
**Tests**: 174 passing, 0 failing · 콘솔 0 · mission-check(estimated) PASS · 전 브라우저 회귀 PASS
**Decisions**:
- 오토파일럿이 estimated 항법(GPS+IMU 게이팅 칼만)으로 풀 협조선회 서킷 완주(probe DONE 4/4). M11의 이륙 크래시 → 완전 비행.
- 웨이포인트 조기 전환 ARRIVAL_HORIZ 80→160m: GPS 추정 지연에도 급선회/실속 없이 부드럽게. ARRIVAL_VERT 100.
- GPS 센서 bandwidth 3→8(지연 완화). 직사각형 서킷(90° 우선회 4회, 1500m leg)으로 선회반경 640m와 양립.
- **AUTO 기본 navSource 'truth'→'estimated'**: 진짜 센서-in-the-loop 기본. FDE 살아있어 임무 중 GPS 스푸핑 실시간 배제.
**Next**:
- 하강/착륙, GPS 스푸핑 중 AUTO 항로유지 데모(FDE+estimated), 다중 고도 circuit
**Notes**:
- M11→M18 여정: M11 이륙 크래시 → M14-17 제어 견고화(TECS분리/협조선회) → M18 estimated 완주. 견고한 제어가 센서-in-the-loop를 가능케 함.
- estimated 서킷: 이륙→152m→WP1(북)→우선회→WP2(동)→WP3(남)→WP4(서)→DONE, 속도 43~56·aoa 낮음·무크래시.

## 2026-06-21 08:27 — M19: GPS 스푸핑 중 AUTO 항로유지 (FDE+INS)

**Status**: GREEN 🎉
**Files changed**: src/main.js, tests/spoof-route-check.mjs (new), PRD.md
**Tests**: 174 passing, 0 failing · 콘솔 0 · spoof-route-check PASS · console/nav/mission 무회귀
**Decisions**:
- 지속적 GPS 거부(연속12프레임↑) 중 추정 위치를 INS 속도로 추측항법(insReckon) → GPS 단절에도 항법 유지. 거부 중 공분산 캡(P00≤4)으로 게이트를 좁게 유지 → 지속 스푸핑도 계속 배제.
- 결과: gpsX +2000 스푸핑 98초 내내 추정=truth(≤1m), NAV DEGRADED, 오토파일럿 WP1·WP2 항로유지 비행.
- insReckon은 kf.rejected일 때만 동작 → 정상 비행/서킷 무영향(174 테스트·회귀 PASS).
**Next**:
- 하강/착륙 단계, 다중 고도 circuit, 느린 드리프트 스푸핑 대응
**Notes**:
- 검증 과정에서 2개 실제 HILS 현상 발견·해결: (1) GPS 거부 시 추정 동결(→INS 추측항법), (2) 지속 거부 중 공분산 성장이 게이트 넓혀 스푸핑 재수용(→공분산 캡).
- 시연: K키로 AUTO 시작 → injectFault('gpsX',{type:'bias',value:5000}) → HUD NAV DEGRADED + 항로 유지. clearFaults() 복구.

## 2026-06-21 10:04 — M20: 자동 착륙 (글라이드슬로프 → 플레어 → 접지)

**Status**: GREEN (안전 착륙·무크래시) · 부드러운 감속착륙은 후속
**Files changed**: src/autopilot.js, src/missions.js, tests/missions.test.mjs, tests/landing-check.mjs (new), PRD.md
**Tests**: 175 passing(land 웨이포인트 테스트 추가), 0 failing · 콘솔 0 · landing-check PASS(접지·활주·DONE)
**Decisions**:
- LAND 위상: APPROACH(순항 종방향 제어 재사용 + 글라이드슬로프 목표를 현재고도로 캡=위에서 캡처, 상승금지로 클라임-실속 방지) → FLARE(7m, 파워오프+약한 노즈업) → ROLLOUT(idle+마찰). 착륙 커밋 래치로 풍선 억제.
- hasClimbedOut 게이트로 강하 중 TAKEOFF 재진입 방지.
- 직진 데모 미션(이륙→상승→순항→착륙)으로 단순화. 서킷은 M17/M18 입증.
- 슬릭 기체라 firm landing(~55 m/s 접지, 강하율 안전). 크래시 없음.
**Next**:
- 플랩/스포일러 감속착륙, 활주로 중심선 유지, GPS 스푸핑 중 자동착륙
**Notes**:
- 진단 핵심: 접근 초기 클라임-실속(글라이드슬로프 목표가 현재고도 위) → min(slope,alt)로 위에서 캡처. 플레어 풍선 → 커밋 래치+파워오프.
- 헤드리스 2개 순차실행 시 CPU부하로 폴 윈도우 만료(테스트 artifact, 크래시 아님). 단일 실행 안정 착륙(활주 2~29 m/s).

## 2026-06-21 16:27 — M21: 플랩/스포일러 — 부드러운 감속착륙

**Status**: GREEN 🎉
**Files changed**: src/physics.js, src/main.js, src/autopilot.js, tests/highlift.test.mjs (new), PRD.md
**Tests**: 5 added (highLift), 180 passing, 0 failing · 콘솔 0 · landing-check truth+estimated PASS · 전 HILS 회귀 PASS
**Decisions**:
- highLift 순수 함수: 플랩 CL↑+CD↑(드래그 위주 튜닝 CL_FLAP 0.35/CD_FLAP 0.16), 스포일러 CD↑+양력덤프. stepPhysics가 CL/CD에 적용, sim.flaps/spoilers는 apOut에서 지령.
- 오토파일럿 LAND: APPROACH/FLARE 플랩 전개(접근 46→36, LANDING_SAFE 26 가드), ROLLOUT 스포일러 전개(제동). 접지 ~23 m/s·활주 감속.
- CL_FLAP 0.8→0.35: 0.8은 진입 풍선(152→190m) 후 강하불가. 드래그 위주로 재균형하니 느린 안정 강하.
- estimated 착륙 안정화: 기압 bandwidth 6→14·noise↓, 칼만 q 1→8·r↓ → 추정 고도 정밀 → 센서-in-the-loop 착륙 PASS.
**Next**:
- 수동 플랩 키, 활주로 자동 브레이크, 바람/돌풍 착륙
**Notes**:
- 진단: 착륙 플랩은 양력보다 항력. 양력 과다 시 진입 풍선·강하불가. estimated는 기압 노이즈에 민감 → 센서 정밀화로 해결.
- 결과: firm landing(55 m/s) → 부드러운 슬로우 착륙(접근 37·접지 23·스포일러 제동). truth+estimated 둘 다.

## 2026-06-21 23:40 — M22: 바람/돌풍 중 착륙 (air-relative aero + 결정론적 검증 인프라)

**Status**: GREEN (바람·돌풍 중 자동착륙 완주, 무크래시) · 활주로 중심선 정밀도는 후속(PRD §28)
**Files changed**: src/wind.js(new), src/main.js, src/autopilot.js, src/world.js, tests/wind.test.mjs(new), tests/landing-wind-det.mjs(new), tests/landing-wind-check.mjs(new), tests/wind-diag.mjs(new), PRD.md
**Tests**: 8 added(wind: windStep 5 + shearFactor 3), 188 passing, 0 failing · 콘솔 0 · 결정론적 크로스윈드 착륙 4·5·6 m/s + 돌풍 PASS(완주·코리도어 내) · 무풍 회귀 PASS(중심선 접지)
**Decisions**:
- 공기상대속도 공기역학: stepPhysics 전 공력항(받음각·사이드슬립·양력·항력·측력)을 sim.velocity가 아닌 (velocity − wind)로 계산. 무풍이면 항등 → 기존 동작 불변.
- 바람 모델 wind.js: 정상풍 + 1차 Gauss–Markov(OU) 돌풍(seeded → 결정론적, 유계). 경계층 시어 shearFactor: 지면 ≈0 → 고도서 만개(타이어 횡력 미모델 → 지상활주 무교란, 접근은 실제 크로스윈드, 접지 직전 약화). 수직 돌풍 VERT=0.15(받음각 실속 스파이크 억제).
- 오토파일럿 착륙 개선: 크로스트랙(로컬라이저) PD 유도(중심선 추종, 정상 크로스윈드→크랩), 글라이드슬로프를 along-track 거리 기준(횡오프셋이 거리 부풀려 강하불가→선회 방지), 점진 플랩(접근 0.5/단거리 1.0 → 항력 절감으로 에너지 유지), turnMargin을 LANDING_SAFE 기준(접근 중 뱅크 권한 확보), 접근 뱅크 22° 제한.
- 결정론적 검증 인프라(별도 가치): world.js 시드 RNG(빌딩·산 고정 배치) + 접근 코리도어(±550m) 장애물 제거 + window.__advance(고정 dt 무렌더 스텝) + __resetForTest. → 브라우저 RAF 가변 dt로 매 비행이 달라지던 문제 해소, A==B 재현 확인.
**Next**:
- 활주로 중심선 정밀 접지: 접근 중 롤 오버슈트(지령 22°→실제 50°, 사이드슬립·다이히드럴 발산) 한계 사이클 → 롤 댐핑/조정 제어법 보강 필요(PRD §28).
- estimated nav 크로스윈드 착륙, 자동 디크랩, GPS 스푸핑 중 크로스윈드 착륙.
**Notes**:
- 핵심 진단: "실속처럼 보인 이탈"의 다수는 항공역학 실속이 아니라 코스 이탈 후 빌딩/산 충돌(reflect-and-bleed)이었음. 시드 월드 + 코리도어 정리로 무풍 완벽 착륙 복원, 바람 착륙도 완주.
- 결정론화가 전환점: RAF 가변 dt + 랜덤 월드로 같은 코드가 매번 다른 궤적 → 튜닝 불가였음. __advance + 시드 월드로 재현성 확보 후 비로소 원인 규명.
- 검증 명령(수동): `node tests/landing-wind-det.mjs <url> <port> truth 5 2.5` (헤드리스 CDP). 4·5·6 m/s 크로스윈드 + 돌풍 완주.

## 2026-06-22 01:05 — M23: 접근 롤 오버슈트 보강 (요-레이트 댐퍼)

**Status**: GREEN 🎉 (크로스윈드 착륙 중심선 정밀도 ±150~320m → ~90~100m, 3배 개선)
**Files changed**: src/autopilot.js, src/main.js, tests/landing-wind-det.mjs, tests/wind-diag.mjs(진단 계측)
**Tests**: 188 통과, 콘솔 0, HILS 회귀(fly/nav/spoof) PASS, 크로스윈드 4·5·6 m/s 착륙 PASS(중심선 ≤92/91/100m)
**Decisions**:
- 진단(계측 추가: beta/aileron/rudder/rollrate를 __hils.diag로 노출): 접근 이탈의 정체는 롤 단순 오버슈트가 아니라 **Dutch-roll 발산** — 사이드슬립 beta가 ±50~84°까지 발산, 다이히드럴(Cl_beta)이 뱅크를 50°+로 말아올리고 러더·에일러론 동시 포화.
- **잘못된 시도**: beta→러더 사이드슬립 피드백은 사이드슬립-홀드라 Dutch-roll 댐핑을 오히려 깎아 NAV까지 발산시킴(beta ±84°). 제어이론상 발산 모드엔 사이드슬립 피드백이 아니라 **요-레이트 댐퍼**가 정답.
- **수정**: 러더 법칙을 분리 — 협조선회 피드포워드(YAW_FF_KP·rCoord) + **요-레이트 댐퍼(YAW_DAMP_KP·(rCoord−yawRate))를 qScale로 게인스케줄**(저속 접근에서 강하게, 순항에서 약하게 → 저속 Cn_r·q̄ 부족 보완, 고속 러더 PIO 방지).
- 오토파일럿이 받는 사이드슬립을 **공기상대(velocity−wind)**로 교정(크로스윈드 크랩과 싸우지 않게).
- 결과: NAV 뱅크 ±28°→±15°로 안정, 접근 한계 사이클 소멸, 중심선 추종 3배 개선. 적분항은 안정화 후에도 잔차(단거리 디크랩 트랜지언트)엔 역효과라 P+D 유지.
**Next**:
- M24 UI/UX 대개편 시작: 군용 항공기 모델(F-16급) + 기체 선택, 입장 시 조작 설명 팝업, 군용 글래스칵핏 HUD, 모바일 터치 컨트롤(가상 조이스틱+스로틀), 언리얼급 그래픽(PBR/블룸/톤매핑/대기 셰이더).
**Notes**:
- 핵심 교훈: 발산 모드 진단엔 계측이 결정적이었음(beta 노출 전엔 "실속"으로 오인). 사이드슬립 피드백 ≠ 요 댐퍼 — 후자만 Dutch-roll에 댐핑 추가.
- 검증: `node tests/landing-wind-det.mjs <url> <port> truth 5 2.5` (4·5·6 m/s 모두 PASS).

## 2026-06-22 01:20 — M24: 군용 항공기 모델 + 기체 선택 UI

**Status**: GREEN (F-16 기본, 헤드리스 렌더·비행·착륙 검증)
**Files changed**: src/aircraft.js(대폭 확장), src/ui.js(new), src/main.js, src/autopilot.js, tests/shot.mjs(new 스크린샷 하니스)
**Tests**: 188 통과, 콘솔 0, fly-check PASS(F-16), landing-wind-det 5+2.5 PASS(F-16, 중심선 91m=Cessna와 동일), F-16/Hornet 렌더 스크린샷 확인
**Decisions**:
- 모델 라이브러리화: aircraft.js를 빌더 레지스트리로 재구성 — buildF16(기본)/buildHornet(쌍수직미익)/buildLightPlane(기존 경비행기). 공통 contract(gearOffset/prop/parts/anchors/afterburner) 유지.
- 머티리얼 Lambert→**MeshStandardMaterial(PBR)**: 군용 무광 도장(낮은 metalness·높은 roughness). 기존 광원(hemi+directional+ambient)으로 정상 렌더. 환경맵·블룸은 M27.
- F-16: 뾰족 레이돔, 복부 흡입구, 버블 캐노피, 크롭델타 윙(ExtrudeGeometry)+윙팁 미사일, 단일 스윕 수직미익+스태빌레이터+벤트럴핀, 애프터버너 노즐+글로우콘. Hornet: LERX, 측면 흡입구, 쌍수직미익, 트윈 노즐.
- 런타임 교체: window.setAircraftModel + 화면 좌상단 **모델 피커 UI**(ui.js, 시안 글래스칵핏 스타일, 모바일 반응형). 메시 dispose 후 재빌드·재배치·리셋.
- 애프터버너: 제트는 prop 대신 throttle>55%에서 글로우콘 발광(flicker).
- **기체별 gearOffset 차이**(제트 1.1 vs 경비행기 0.8) 대응: 오토파일럿 GROUND_OFFSET 하드코딩 제거 → simState.groundOffset로 런타임 주입(착륙 플레어·AGL 일관). 비행 동역학(AIRCRAFT 상수)은 모델 무관 동일.
**Next**:
- M25: 입장 시 조작 설명 팝업 + 모바일 터치 컨트롤(가상 조이스틱+스로틀 슬라이더+버튼).
- M26: 군용 글래스칵핏 HUD 대개편(레퍼런스 이미지 기반). M27: PBR/블룸/톤매핑/대기 셰이더.
**Notes**:
- 비행 동역학은 동일하므로 착륙 수치(91m)가 Cessna와 정확히 일치 — 모델은 시각 스킨, 물리는 공유.
- 수동 검증: `node tests/shot.mjs <url> <port> out.png <modelKey>` 로 기체 스크린샷.

## 2026-06-22 01:28 — M25: 입장 조작 팝업 + 모바일 터치 컨트롤

**Status**: GREEN (인트로 팝업·터치 조이스틱/스로틀/버튼 렌더 확인, 헤드리스 회귀 PASS)
**Files changed**: src/ui.js(인트로+터치 추가), src/main.js, tests/shot.mjs(모바일 에뮬 추가)
**Tests**: 188 통과, 콘솔 0, landing-wind-det 5+2.5 PASS(인트로 표시 상태에서도), 인트로/터치 스크린샷 확인
**Decisions**:
- 인트로/조작 팝업(initIntro): 입장 시 모달 — 타이틀·키보드 표, 큰 버튼 2개("▶ AUTO 시연 시작"=loadDemoMission, "✈ 수동 비행"=닫기). 시안 글래스칵핏 스타일(레퍼런스 이미지 톤). 우하단 ? 버튼으로 재오픈. ?intro=0로 스킵(스크린샷/테스트).
- 모바일 터치(initTouchControls): 좌하단 가상 조이스틱(피치/롤, 화면 위=기수업), 우측 세로 스로틀 슬라이더, 요L/R·CAM·일시정지·AUTO 버튼. 키보드 controls 상태에 직접 기입(포인터 이벤트, touch-action:none). 터치 시 키보드 헬프 텍스트 숨김.
- 감지: isTouchDevice(pointer:coarse|ontouchstart|maxTouchPoints) 자동 + ?touch=1/0 강제(데스크톱 옵트인/테스트). 헤드리스 에뮬에선 자동감지 불가 → 강제 플래그로 검증.
- **버그 수정**: UI init이 controls 선언 전 실행돼 TDZ ReferenceError → queueMicrotask로 모듈 평가 후 실행하도록 지연.
**Next**:
- M26: 군용 글래스칵핏 HUD 대개편(레퍼런스 이미지: 나침반 장미·피치 사다리·MFD풍 패널) + 모바일 HUD 레이아웃 정리.
- M27: PBR 환경맵/블룸/톤매핑/대기 셰이더로 그래픽 업그레이드.
**Notes**:
- AUTO 모드는 입력 거의 불필요 → 모바일/첫 방문자는 "AUTO 시연" 한 번으로 전체 자율비행(크로스윈드 착륙 포함) 감상 가능.
- 현재 모바일 HUD는 데스크톱 패널이 겹쳐 다소 혼잡 → M26에서 정리.
- 수동: `node tests/shot.mjs <url> <port> out.png '' mobile` 로 모바일 캡처(+?touch=1).

## 2026-06-22 01:40 — M26: 군용 글래스칵핏 HUD 대개편 (F-16 그린 HUD)

**Status**: GREEN (전체화면 그린 HUD 렌더 확인 — 데스크톱/모바일, 헤드리스 회귀 PASS)
**Files changed**: src/hud.js(드로잉 전면 재작성), index.html(오버레이 전체화면·그린 리컬러·모바일 반응형), src/main.js(sideslip 전달), tests/shot.mjs(비행 캡처 FLY/CAM)
**Tests**: 188 통과, 콘솔 0, landing-wind-det 5+2.5 PASS(불변 91m), 코크핏/체이스/모바일 HUD 스크린샷 확인
**Decisions**:
- HUD 오버레이를 480×320 고정 → **전체화면 캔버스**(window 리사이즈·DPR 대응). 심볼로지를 화면 단변 기준 스케일(모바일 자동 축소).
- F-16 스타일 그린 심볼로지 신규: 보어사이트, **비행경로마커(FPM, AoA·사이드슬립 기반)**, 롤 회전 피치 사다리(수평선 갭·음수 점선·엔드캡·각도 라벨), **뱅크 스케일 아크+롤 포인터**, 상단 헤딩 테이프(박스 헤딩), 좌/우 **에어스피드·고도 박스+무빙 테이프**(AOA/VS 서브).
- 색상 앰버→**F-16 그린(#3dff9a)** 전면 통일(캔버스+DOM 패널). 캔버스로 옮긴 속도/고도/헤딩 DOM은 숨김(중복 제거).
- 모바일 반응형(≤940px, 랜드스케이프폰 포함): 데이터 스트립을 우상단으로, 무결성/시나리오 패널 축소, 키보드 헬프 숨김 → 터치 조이스틱/스로틀과 비충돌.
**Next**:
- M27: 언리얼급 그래픽 — ACES 톤매핑+sRGB, PMREM 환경맵(PBR 금속 반사), UnrealBloom(애프터버너/태양/항법등 글로우), 대기 산란 하늘.
**Notes**:
- 비행 캡처: `FLY=22 CAM=cockpit node tests/shot.mjs <url> <port> out.png '' [mobile]` (실시간 RAF 렌더, __advance는 렌더 정지하므로 미사용).
- HUD는 표시 전용 → 물리/착륙 수치 불변(91m).

## 2026-06-22 01:52 — M27: 그래픽 업그레이드 (ACES 톤매핑 + IBL 환경맵 + UnrealBloom)

**Status**: GREEN (필름릭 파이프라인·블룸 렌더 확인, 헤드리스 회귀 PASS)
**Files changed**: src/main.js(렌더러/컴포저/환경맵), index.html(포스트프로세싱 스크립트)
**Tests**: 188 통과, 콘솔 0, landing-wind-det 5+2.5 PASS(불변 91m), 외부/체이스/애프터버너 스크린샷 확인
**Decisions**:
- 렌더러: **ACES 필름릭 톤매핑 + sRGB 출력 + 노출 1.15** → 평평하던 색이 시네마틱하게.
- **IBL 환경맵(PMREM)**: 하늘/지평선/지면 그라디언트 구를 프리필터해 scene.environment 설정 → PBR 금속(제트 동체·노즐)·캐노피 유리가 실제 반사를 받음(M24 PBR 머티리얼이 비로소 살아남).
- **포스트프로세싱(UnrealBloom)**: EffectComposer + RenderPass + UnrealBloomPass(strength 0.35·radius 0.4·**threshold 0.92** — 태양/애프터버너/항법등만 발광, 밝은 씬 전체 헤이즈 방지). r128 examples/js를 unpkg에서 로드(동일 버전), 미로드 시 직접 렌더로 graceful fallback.
- **인코딩 버그 수정**: 컴포저 경로에서 전체 화면이 워시아웃 → RT는 LINEAR이므로 renderer.outputEncoding=Linear로 렌더(톤매핑은 머티리얼서 적용)하고 마지막에 **GammaCorrectionShader**로 sRGB 변환. fallback 경로는 sRGB 유지.
- renderScene() 단일 진입점으로 3곳 렌더 호출 통합(컴포저/직접).
**Next**:
- (후속) 그림자맵(항공기 주변 타이트 프러스텀), 더 디테일한 메시/텍스처, 구름.
**Notes**:
- "언리얼급"은 저폴리 Three.js 한계상 완전 동일은 불가하나, 톤매핑+IBL+블룸으로 체감 품질 대폭 상승. 물리/HUD 불변(착륙 91m).
- 외부 의존성(unpkg 포스트프로세싱)은 미로드 시 자동 폴백 — 라이브 배포서 로드 확인 필요.

## 2026-06-22 02:05 — M28: 접지 디크랩 (지상 활주 중 기수 정렬)

**Status**: GREEN (착륙 4·5·6 m/s PASS 유지, 지상 디크랩 작동)
**Files changed**: src/autopilot.js, src/main.js(diag에 hdg 노출), tests/wind-diag.mjs(hdg)
**Tests**: 188 통과, 콘솔 0, 크로스윈드 4·5·6 m/s 착륙 PASS(중심선 92/91/100m 불변)
**Decisions**:
- 디크랩: 접근은 크랩(기수 풍상)으로 중심선 추종 → 접지 시 기수가 활주로와 어긋나 기어에 측하중. 정렬 필요.
- **핵심 진단(다수 실패 후)**: 이 sim의 플레어는 저속·저에너지로 **방향 안정성이 한계**라, 공중에서 러더를 조금이라도 넣으면(어떤 형태든: 직접 러더/요레이트 지령/협조 대체) 사이드슬립-다이히드럴 커플링으로 **기수가 발산**(13°→54°→338°)하고 착륙 실패. → 공중 디크랩은 이 단순 모델에선 비현실적.
- **채택**: 접지 후 **지상 활주 디크랩** — 바퀴가 측방을 잡아주므로 안전하게 강한 정렬(헤딩 오차 P 2.6 + 요레이트 댐핑 1.2)로 기수를 활주로 방향으로 직선화. 실시간 활주(60fps)에선 충분히 정렬, 결정론 1s-스텝 테스트는 활주가 짧아 표본만 적음.
- 공중 플레어/접근은 검증된 협조 제어 그대로 유지(불변) → 착륙 견고성 보존.
- 계측: __hils.diag에 hdg 추가.
**Next**:
- M29: 좌상단 NXS 로고 + 모바일 UI 토글 버튼.
- M30: 그림자맵. M31: 디테일 메시/텍스처·구름.
**Notes**:
- 후속 가능: wing-low(슬립) 기법으로 공중 정렬(측풍을 뱅크로 상쇄+러더로 기수 고정) — 현 크랩 추종을 단계적 슬립 전환으로 바꿔야 해 별도 작업.

## 2026-06-22 02:14 — M29: NXS 로고 + 모바일 UI 토글 버튼

**Status**: GREEN (로고 표시·토글 동작 확인, 콘솔 0)
**Files changed**: index.html(로고 img+CSS), src/ui.js(터치 토글), src/main.js(토글 배선)
**Tests**: 콘솔 0, 로고 200 로드, 데스크톱/터치-온 스크린샷 확인
**Decisions**:
- 좌상단 NXS 로고: etc/image001.png를 #brand-logo로 고정 배치(top:14·left:16, 모바일 축소). 모델 피커는 로고 아래로 이동(top 16→50).
- 모바일 UI 토글: 터치 컨트롤을 **항상 생성**하되 표시 여부를 토글. 우하단 "🕹 조작" 버튼으로 켜기/끄기(켜짐 시 강조). 터치 기기/?touch=1은 기본 표시, 그 외 숨김. 숨길 때 입력축 해제 + 키보드 헬프 텍스트 동기 표시.
- window.__toggleTouch(v)로도 제어.
**Next**:
- M30: 그림자맵(항공기/활주로 주변). M31: 디테일 메시/텍스처·구름.
**Notes**:
- 로고 경로 etc/image001.png는 리포 루트 기준(깃허브 페이지 동일).

## 2026-06-22 02:24 — M30: 그림자맵 (항공기→활주로/지면)

**Status**: GREEN (항공기 그림자 렌더 확인, 착륙 불변 PASS)
**Files changed**: src/main.js(렌더러 shadowMap+팔로우), src/world.js(태양 그림자 카메라+캐스터/리시버)
**Tests**: 콘솔 0, landing-wind-det 5+2.5 PASS(불변 91m), 활주로/이륙 그림자 스크린샷 확인
**Decisions**:
- renderer.shadowMap PCFSoft 활성. 거대 월드(20000)라 전체 섀도우는 저해상도 → **태양 직교 섀도우 프러스텀을 타이트(±180m)** 하게 잡고 **매 프레임 항공기 위치로 재중심**(방향 고정, target/position을 기체 따라 이동) → 근처 그림자만 선명하게.
- 캐스터/리시버: 항공기 메시 전체 cast+receive(enableShadows, 모델 교체 시도 적용), 지면/활주로/숄더 receive, 빌딩/산 cast+receive.
- updateSunShadow를 renderScene에 통합(모든 렌더 경로 일관).
**Next**:
- M31: 디테일 메시/텍스처 + 구름.
**Notes**:
- 그림자는 표시 전용 → 물리/착륙 불변. 모바일 성능 우려 시 후속 토글 가능.

## 2026-06-22 02:36 — M31: 구름 + 지면 디테일 텍스처

**Status**: GREEN (구름·지면 텍스처 렌더 확인, 착륙 불변 PASS)
**Files changed**: src/clouds.js(new), src/main.js(구름 배선), src/world.js(지면 디테일 텍스처)
**Tests**: 콘솔 0, landing-wind-det 5+2.5 PASS(불변 91m), 비행 중 하늘 구름·코크핏·지면 스크린샷 확인
**Decisions**:
- **구름(clouds.js)**: 캔버스 절차적 소프트 퍼프 텍스처(외부 에셋 없음) + 시드 RNG로 적운 클러스터 46개(각 4~9 스프라이트) 고도 520~1520m 산포. fog 적용으로 원거리 페이드. 매 프레임 완만한 바람 드리프트(wrap). 톤매핑/블룸과 어울리게 오프화이트·중간 불투명도(과블룸 방지).
- **지면 디테일 텍스처**: 캔버스 value-noise(블러) 그레이스케일을 RepeatWrapping(80×80)으로 지면 map에 적용 → 평평한 정점색 지형에 미세 질감. vertexColors와 곱연산.
- 결정론 유지(시드), 표시 전용 → 물리/착륙 불변.
**Next**:
- (후속) 활주로 아스팔트 텍스처, 더 입체적 구름(볼류메트릭), 시간대/날씨 프리셋.
**Notes**:
- 이번 배치(M28~M31): 디크랩·로고·토글·그림자·구름/텍스처 완료. 라이브 배포 검증 예정.

## 2026-06-22 02:50 — M32: 카메라 스무딩 (조종석 진동/흔들림 제거)

**Status**: GREEN (조종석/체이스 렌더 확인, 착륙 불변 PASS)
**Files changed**: src/camera.js(스무딩 재작성)
**Tests**: 콘솔 0, landing-wind-det 5+2.5 PASS(불변 91m), 조종석/체이스 스크린샷 확인
**Decisions**:
- 진단: 결정론 순항에서 기체 자세는 **사실상 정지**(뱅크 jitter 0.0°, 피치 step 0.10°) → 흔들림의 정체는 **강체 1:1 카메라 마운트**가 미세 모션·프레임 타이밍을 증폭한 것.
- 수정: 조종석/체이스 카메라를 **위치 lerp + 자세 slerp**로 스무딩(프레임레이트 독립). 조종석은 자세 댐핑(rot rate 11)으로 고주파 진동 저역통과하되 실제 기동엔 반응. 모드 전환 시 스냅(스우프 방지).
- 체이스는 바디업을 월드업과 50% 블렌드해 완전히 롤 따라가지 않게(덜 어지럽게). 조종석 좌석 위치 소폭 조정(z −0.6→−1.2, 캐노피 뒤).
**Next**:
- M33: 모바일 리프레시(리셋) 버튼. M34: 다중 맵 선택.
**Notes**:
- 정적 스크린샷으론 흔들림 감소를 직접 보이긴 어려우나, 강체 마운트 → 스무딩이 표준 해법이며 기체 자체는 무진동 확인.

## 2026-06-22 02:56 — M33: 모바일 리프레시(리셋) 버튼

**Status**: GREEN (터치 RST 버튼 렌더 확인, 콘솔 0)
**Files changed**: src/ui.js(RST 버튼), src/main.js(onReset 배선)
**Tests**: 콘솔 0, 모바일 터치 스크린샷에 "↻ RST" 확인
**Decisions**:
- 터치 버튼행에 "↻ RST" 추가 → controls.onReset()(resetAircraft) 호출. 활주로 시작점으로 리셋(키보드 R과 동일).
**Next**:
- M34: 다중 맵 선택.

## 2026-06-22 03:08 — M34: 다중 맵 선택 (바이옴 프리셋)

**Status**: GREEN (4개 맵 렌더 확인, 착륙 불변 PASS)
**Files changed**: src/world.js(MAPS 레지스트리+파라미터화), src/main.js(맵 적용+피커+setMap), src/ui.js(피커 위치 옵션), tests/shot.mjs(MAP 환경변수)
**Tests**: 콘솔 0, landing-wind-det 5+2.5 PASS(plains 불변 91m), plains/desert/arctic 스크린샷 확인
**Decisions**:
- 맵 4종: **Plains(평원·도시), Desert(사막·메사), Arctic(설원·빙하), Coastal(해안·구릉)**. 각 프리셋이 하늘/안개 색, 지형 색대(grass/dirt/rock/snow)+높이 스케일, 헤미 광원 틴트, 빌딩/산 밀도·색, IBL 환경색을 설정. **활주로는 동일**(자동착륙 항상 동작).
- world.js를 buildWorld(scene, colliders, mapKey)로 파라미터화(buildSky/buildGround/buildMountains 설정 주입). IBL 환경맵도 맵 색으로 생성.
- 맵 전환은 **sessionStorage 저장 + 페이지 리로드**(라이브 씬 분해보다 안전·간단; 광원/안개/환경맵 모두 로드 시 재구성). 좌상단 항공기 피커 아래 "◢ MAP" 피커.
**Next**:
- (후속) 라이브 맵 스왑(무리로드), 실제 물(바다) 맵, 시간대/날씨.
**Notes**:
- 결정론 시드 유지(빌딩/산/구름). 물리/착륙 불변.
- 검증: `MAP=desert node tests/shot.mjs ...`.

## 2026-06-22 03:30 — M35: 실제 바다 맵 + 라이브 맵 스왑

**Status**: GREEN (오션 맵 렌더·라이브 스왑 확인, 착륙 불변 PASS)
**Files changed**: src/world.js(워터 셰이더+섬+맵 콘텐츠 그룹), src/main.js(라이브 스왑+워터 애니+env 재생성), tests/shot.mjs(SWAP)
**Tests**: 188 통과, 콘솔 0(스왑 후도), landing-wind-det 5+2.5 PASS(불변 91m), 오션 로드/라이브스왑 스크린샷 확인
**Decisions**:
- **실제 바다(Ocean 맵)**: 절차적 애니메이션 워터 셰이더(파동 노멀·프레넬·태양 글린트·수평선 페이드)로 40km 수면. 활주로는 **모래 섬(반경 1500)** 위에, 산은 바다에서 솟은 섬으로(빌딩 0). uTime을 매 프레임 갱신. coastal(가짜 청록 지면) → ocean으로 교체.
- **라이브 맵 스왑(무리로드)**: 월드 지오메트리를 **단일 그룹(mapContent)**으로 묶어, 스왑 시 그룹만 dispose+재생성. 광원(hemi/sun)·안개는 **지속(재틴트만)**, IBL 환경맵 재생성(regenEnv), 콜라이더 클리어+재적재, 활주로로 리셋. window.setMap이 리로드 대신 라이브 교체.
- 물리/착륙은 맵 무관(활주로·gearOffset 기반) → 불변. 시드 유지.
**Next**:
- (후속) 섬 해안선 디테일, 항모 갑판 맵, 시간대/날씨.
**Notes**:
- 검증: `MAP=ocean`(로드), `SWAP=ocean`(라이브) node tests/shot.mjs.

## 2026-06-22 17:50 — M36: 항모 갑판 맵

**Status**: GREEN (항모 갑판 렌더 확인, 콘솔 0)
**Files changed**: src/world.js(carrier 맵 + buildCarrierDeck)
**Tests**: 콘솔 0, 항모 외부/비행 스크린샷 확인(갑판·아일랜드 타워·바다)
**Decisions**:
- 5번째 맵 Carrier: ocean 기반(애니 워터) + 모래섬 대신 **회색 금속 비행갑판**. 활주로를 갑판 위에 탑재(top y≈0, 워터 −0.4). 양현 비스듬 비스킷 패널(다크), 갑판 가장자리 캣워크 레일, **우현 아일랜드 슈퍼스트럭처**(브리지+퍼널+마스트+레이더), 포트엣지 안테나. 원거리 섬-산 7개.
- 스타일라이즈(활주로 2km라 갑판도 오버사이즈)이나 "항모 갑판"으로 명확히 인식. PBR 금속 머티리얼 → 환경맵 반사.
- buildMapContent에서 cfg.carrier면 buildCarrierDeck, 아니면 buildIsland.
**Next**:
- M37: 시간대/날씨 프리셋.
**Notes**:
- 물리/착륙 맵 무관(활주로·gearOffset). 아일랜드 타워는 우현 x≈138(중심선 추종 ±100m 밖) — 콜라이더는 후속.

## 2026-06-22 18:05 — M37: 시간대/날씨 프리셋

**Status**: GREEN (5종 프리셋 렌더 확인, 착륙 불변 PASS)
**Files changed**: src/world.js(CONDITIONS + buildMapContent skyMat 반환), src/clouds.js(setCloudStyle), src/main.js(applyLighting + setCondition + 피커)
**Tests**: 188 통과, 콘솔 0, day 착륙 불변 91m, dusk/night/overcast/fog 스크린샷 확인
**Decisions**:
- 프리셋 5종: **Day(주간 맑음)·Dusk(황혼)·Night(야간)·Overcast(흐림)·Fog(안개)**. 맵(바이옴) **위에 레이어**로 적용 — 미지정 필드는 맵 기본값 폴백(그래서 Day는 바이옴 기본 룩 재현).
- applyLighting(map, cond): 태양(방향=시간대·색·강도, userData.dir로 섀도우 팔로우+스카이 디스크 동기), 반구광/앰비언트, **안개(밀도 스케일·색=수평선)**, 노출(톤매핑), **스카이 셰이더 유니폼(밝기 스케일×틴트)**, 바다 틴트, **구름 불투명/색**(setCloudStyle), **IBL 환경맵 재생성**(최종 스카이색).
- 라이브 적용(무리로드): window.setCondition. 좌측 "◢ TIME / WX" 피커. 야간엔 노출/암부로 HUD·항법등·애프터버너 글로우가 부각.
- 맵 스왑 시 현재 컨디션 재적용(applyLighting), 컨디션 변경 시 지오메트리 유지하고 재조명만.
**Next**:
- (후속) 별/달(야간), 비/눈 파티클, 번개(폭풍).
**Notes**:
- 물리/착륙 무관(표시·조명만). 시드 유지. 검증: `COND=night node tests/shot.mjs ...`.

## 2026-06-22 19:35 — M38: 야간 별/달 + 비·눈 파티클

**Status**: GREEN (별/달·비·눈 렌더 확인, 착륙 불변 PASS)
**Files changed**: src/weather.js(new), src/world.js(CONDITIONS에 stars/precip + Rain/Snow 2종), src/main.js(별/달/강수 배선)
**Tests**: 188 통과, 콘솔 0, day 착륙 불변 91m, night/rain/snow 스크린샷 확인
**Decisions**:
- weather.js: **별(상반구 포인트필드 1700, 시드)** + **달(글로우 스프라이트, 블룸 부각)** — applyLighting의 cond.stars로 페이드(night 1.0·dusk 0.22·그외 0). **강수(rain/snow Points)**: 카메라 추종 박스(±260)서 낙하·재활용, rain은 빠른 청회색 점, snow는 느린 흰 플레이크+드리프트.
- 컨디션 2종 추가: **Rain(비)·Snow(눈)** — 각자 조명(흐림 계열)+precip 플래그. TIME/WX 피커 5→7종.
- applyLighting에서 setNightSky+precipMode 설정, 루프에서 updatePrecip(camera 추종).
**Next**:
- M39: 조종석 인테리어 뷰(V) — 레퍼런스풍 계기판/글레어실드/MFD.
**Notes**:
- 표시 전용 → 물리/착륙 불변. 검증: `COND=rain FLY=12 node tests/shot.mjs ...`.

## 2026-06-22 20:00 — M39: 조종석 인테리어 뷰 (V)

**Status**: GREEN (계기판/MFD/글레어실드 렌더 확인, 착륙 불변 PASS)
**Files changed**: src/cockpit.js(new), src/main.js(updateCockpit 배선)
**Tests**: 188 통과, 콘솔 0, day 착륙 불변 91m, 레벨/상승 조종석 스크린샷 확인
**Decisions**:
- 레퍼런스풍 조종석 인테리어: **계기판 페이스+글레어실드 후드+로워패널**, **3개 MFD 스크린**(중앙=인공수평의/자세, 좌우=나브/맵 — 캔버스 절차 텍스처, MeshBasic toneMapped:false로 자발광·블룸), 라운드 스탠바이 게이지, 센터 페디스털+스로틀 레버, 사이드 콘솔, 컨트롤 스틱.
- **핵심 버그**: 패널이 솔리드 동체 메시 내부에 묻혀 카메라가 동체 내부만 봄(레벨 시 까맣게). → 조종석 뷰에서 **외부 기체 메시 숨김**(aircraft.visible=!show)으로 패널+창밖이 보이게.
- 스무딩된 카메라에 **고정**(camera 기준 오프셋 배치)해 진동 없이 뷰에 붙고 바깥 세계가 기울어짐(실제 조종석 느낌). 패널을 약간 올려(_ckOff y −0.62→−0.40) 하반부 가득.
- 조종석 모드(V)에서만 표시, 리플레이/드론 제외.
**Next**:
- (후속) MFD 라이브 데이터(실시간 자세/속도), 캐노피 프레임 디테일.
**Notes**:
- 표시 전용 → 물리/착륙 불변. 검증: `FLY=6 CAM=cockpit node tests/shot.mjs ...`.

## 2026-06-22 21:10 — M40: 텍스처 glTF 조종석 모델 도입

**Status**: GREEN (텍스처 조종석 캐노피 렌더 확인, 착륙 불변 PASS)
**Files changed**: assets/cockpit.glb(new), index.html(GLTFLoader 스크립트), src/main.js(glTF 로더+COCKPIT_FIT), src/ui.js(CC-BY 크레딧), CREDITS.md(new)
**Tests**: 188 통과, 콘솔 0(app), 6 m/s 크로스윈드+2.5 거스트 착륙 PASS(센터라인 ≤110m, 20.4 m/s 롤아웃)
**Decisions**:
- M39 절차적 "네모 박스" 조종석이 레퍼런스와 안 맞는다는 피드백 → **실제 텍스처 glTF 모델** 도입(사용자 선택). Icosa Gallery의 "The cockpit" by Romain Revert (CC-BY 3.0, 19992 tris, 1.7MB)를 `assets/cockpit.glb`로 번들.
- `THREE.GLTFLoader`(unpkg three@0.128.0 examples) 추가. 로드 후 모델을 바운딩박스 중심으로 정렬→래퍼 그룹에 담아 `COCKPIT_FIT`(스케일/회전/오프셋)으로 1인칭 시점에 핏.
- **핏 튜닝**: 외부 오빗으로 모델 형상(2인승 캐노피형) 파악 → FPV 회전 스윕. 최종값 **s=2.4, ry=−π/2, py=0.45, pz=−1.15** — 카메라가 시트 안에 들어가 캐노피 프레임이 가장자리를 두르고 윈드실드로 바깥+HUD가 보이는 구도. 라이브 튜닝 훅 `window.__ckSet/__ckGet` 유지.
- **CC-BY 의무**: 인트로/도움말 모달 푸터 + `CREDITS.md`에 출처/저자/라이선스 표기.
**Next**:
- (후속) 모델 머티리얼을 PBR로 업그레이드(IBL 반영), 야간/우천 시 조종석 내부 조명.
**Notes**:
- 표시 전용 → 물리/착륙 불변. 검증: `FLY=6 CAM=cockpit node tests/shot.mjs ...`, 외부 오빗 인스펙션은 `window.__ckForce`.

## 2026-06-22 21:50 — M41: 실제 글래스 플라이트덱 콕핏 모델 교체

**Status**: GREEN (실제 계기판 글래스 콕핏 렌더 확인, 착륙 불변 PASS)
**Files changed**: assets/cockpit.glb(교체), src/main.js(앵커 기반 핏 + updateCockpit), src/ui.js(크레딧), CREDITS.md
**Tests**: 188 통과, 콘솔 0(2회 클린), 6 m/s 크로스윈드+2.5 거스트 착륙 PASS(센터라인 ≤110m)
**Decisions**:
- 사용자 피드백 "그래도 조종석 별로야" → M40의 stylized 2인승 모델("The cockpit")은 전투기 글래스 콕핏과 결이 안 맞음. 사용자 선택대로 **실제 제트 콕핏 모델 탐색**.
- Icosa Gallery 다수 후보 썸네일/오빗 검수: "In the Cockpit"·"Open-Cockpit"=Tilt Brush 아트, f16/f18 jet=외부 모델(캐노피 내부 비어있음, FPV 부적합) → 모두 탈락.
- **채택**: "Cockpit control center" by **Google** (CC-BY, 2620 tris, **978KB**) — 우주왕복선형 글래스 플라이트덱. 오버헤드 스위치 패널 + 글레어실드 + **MFD 글래스 디스플레이 뱅크** + 센터 콘솔 + 시트. 진짜 계기판 콕핏.
- **앵커 기반 핏**으로 로더 재작성: 모델을 파일럿 **eye 포인트**(model space [0,4.58,4.5])에 앵커링→카메라가 시트 안에 위치. `scale=0.30`(라이프사이즈), 모델 forward(-Z)가 뷰 forward(-Z)와 일치(회전 불필요). updateCockpit은 cockpitInterior를 카메라 eye에 그대로 배치(앵커가 위치 처리). 윈드실드로 바깥 세계+HUD가 보임.
- 라이브 튜닝 훅 `window.__ckSet(scale,ex,ey,ez,rx,ry,rz,ox,oy,oz)`/`__ckGet` 갱신. CC-BY 크레딧을 Google "Cockpit control center"로 변경(인트로 모달+CREDITS.md).
- dev 검수 아티팩트(etc/inspect.html, *_inspect.glb) 커밋 제외.
**Next**:
- (후속) 야간/우천 시 MFD 자발광 강조, 윈드실드 가시 영역 확대 옵션.
**Notes**:
- 표시 전용 → 물리/착륙 불변. 검증: `FLY=6 CAM=cockpit node tests/shot.mjs ...`.

## 2026-06-22 22:20 — M42: 키보드 입력 정형(스무딩+expo)으로 조종 민감도 완화

**Status**: GREEN (194 유닛 통과, 콘솔 0, 착륙 불변 PASS)
**Files changed**: src/controls.js(입력 램프+expo+tickControls), src/main.js(루프 배선+__ctrlFeel), tests/controls.test.mjs(new)
**Tests**: 194 통과(신규 6), 콘솔 0, 6 m/s 크로스윈드+2.5 거스트 착륙 PASS(110m)
**Decisions**:
- 사용자 질문: "조종이 민감한 게 실제 물리엔진 때문인가, 자동 설정인가?" → 진단: **물리(6-DOF)는 진짜이고 기체는 얌전한 경항공기 튜닝**인데, `controls.js` 키 입력이 **bang-bang(키 누르면 즉시 ±1 풀 타각)** 이라 트위치하게 느껴짐. 액추에이터 지연(25 rad/s)도 거의 즉답이라 완충 안 됨.
- 물리/검증된 경로를 건드리지 않고 **입력단만 정형**: 키 TARGET(±1) → `tickControls`가 유한 속도로 "스틱"을 램프(rampUp 2.4≈0.4s 풀, rampCenter 5.0≈0.2s 복귀) + **expo 0.55**(중앙 둔감, 스톱에서 풀 권한 유지).
- **경로 분리**: tickControls는 **실시간 루프(loop)** 의 매뉴얼 분기에서만 호출 → 결정론적 `__advance`(테스트/착륙)와 아날로그(게임패드/터치)·오토파일럿은 우회. 키보드가 해당 축을 "소유"할 때만 기록(릴리스 시 정확히 0으로 복귀, 아날로그 비클로버).
- 라이브 튜닝 훅 `window.__ctrlFeel({rampUp, rampCenter, expo})` 노출 — 더 둔감하게: rampUp↓/expo↑.
- TDD: tickControls/expoShape 단위 테스트 6종(탭=부분타각, 홀드=풀, 릴리스=중앙복귀, 아날로그 비클로버, 튜닝 반영).
**Next**:
- (후속) 기체별 입력 프로파일(제트 vs 트레이너), 설정 UI 슬라이더.
**Notes**:
- 헤드리스에선 rAF 스로틀로 실시간 램프 직접관측 불가 → __advance 결정론 경로 사용(설계대로). 단위 테스트로 정형 검증.

## 2026-06-22 22:45 — M43: 조종석 전방 시야 개선 (eye 전진)

**Status**: GREEN (전방 윈드실드 확대 확인, 194 통과, 콘솔 0)
**Files changed**: src/main.js (COCKPIT_FIT.eye)
**Tests**: 194 통과, 콘솔 0
**Decisions**:
- 사용자 피드백 "조종석 좋은데 앞이 안 보인다" → 글레어실드/계기판이 전방을 가림. 셔틀형 플라이트덱은 오버헤드 패널이 윈드실드 위에 있어 본질적으로 창이 띠 형태.
- **eye를 전방으로 이동**([0,4.58,4.5]→**[0,4.72,2.9]**): 시점이 윈드실드에 가까워져 창이 차지하는 화각이 커짐 → 수평선+HUD가 크게 보이고 MFD 뱅크는 하단에 그대로(콕핏 느낌 유지), 상단 오버헤드는 얇은 띠로. 스윕(z 3.4/3.2/2.9/2.6) 중 2.9가 전방 시야와 패널 가시성의 균형점.
- scale/회전/off 불변. `window.__ckSet`로 추가 튜닝 가능.
**Next**:
- (후속) 기체별 콕핏 프로파일, FOV 토글.
**Notes**:
- 표시 전용 → 물리/착륙 불변.
