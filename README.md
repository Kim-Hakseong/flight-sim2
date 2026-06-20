# Browser Flight Sim — MVP

> 🎮 **라이브 데모**: **https://kim-hakseong.github.io/flight-sim2/** — 설치 없이 브라우저에서 바로 조작 가능.

> 📚 **분야 입문 가이드**: [docs/FLIGHT-SIM-PRIMER.md](docs/FLIGHT-SIM-PRIMER.md) (또는 [PDF](docs/FLIGHT-SIM-PRIMER.pdf))
> — 비행 시뮬 분야가 처음이면 이거 먼저 읽으면 우리 코드의 모든 부분이 어떤 학문/산업적 맥락에서 왔는지 보임.


Mac Mini M4용 즉시 실행 가능한 3D 비행 시뮬레이터.
Three.js r128 + 직접 구현한 6-DOF 항공역학.

## 실행

```bash
# 단순:
open index.html

# CORS 회피용 로컬 서버 (필요 시):
python3 -m http.server 8000
# → http://localhost:8000
```

## 조작

| 키 | 동작 |
|---|---|
| `W` / `S` | 피치 업/다운 |
| `A` / `D` | 롤 좌/우 |
| `Q` / `E` | 요 좌/우 |
| `↑` / `↓` | 스로틀 +/− |
| `R` | 활주로 시작점 리셋 |
| `V` | 카메라 토글 (chase → cockpit → external) |
| `P` | 일시정지 |

## 이륙 가이드

1. `↑` 키를 길게 눌러 스로틀 100%까지 올린다.
2. 활주로를 직진하며 가속.
3. 약 30 m/s 도달 시 `W`를 짧게 눌러 기수 들기.
4. 양력이 중력을 이기면 떠오른다 (≈35–45 m/s).
5. 안정 비행은 입력을 놓으면 자동 안정화로 수평 회복.

상승 중 너무 큰 AoA → **STALL** 표시 + 양력 급감.
지면에 너무 빠르게 충돌 → **CRASH** 표시. `R`로 리셋.

## HUD

- 좌측: IAS (대기속도, m/s) + AoA (°)
- 우측: ALT (고도, m) + VSI (수직속도, m/s)
- 상단: HDG (자기방위 0–360°)
- 중앙: 십자선 + 피치 사다리 (10° 간격)
- 하단: THR / G-force / PITCH / ROLL / STATUS

군용 HUD 풍 (앰버 모노크롬, 모노스페이스).

## 테스트

```bash
npm test
```

물리 unit test (14 cases):
- `airDensity` (고도별 공기밀도)
- `liftCoefficient` / `dragCoefficient` (실속 포함 양력/항력 계수)
- `liftForce` / `dragForce` (양력/항력 식)
- `angleOfAttack` (받음각: 속도 ↔ 본체 축)
- 좌표계 부호 / 이륙 sanity check

## 디렉토리 구조

```
flight-sim2/
├── PRD.md, CLAUDE.md, Log.md, PROMPT_ralph.md   # 거버넌스
├── README.md
├── index.html         # 진입점 + HUD DOM
├── package.json       # test + bridge 스크립트
├── src/
│   ├── main.js        # 부트스트랩 + 시뮬 루프 (충돌/데미지/effects 통합)
│   ├── world.js       # 지면, 활주로, 빌딩, 산, 스카이, 라이팅
│   ├── aircraft.js    # 항공기 3D 모델 (디테일 + 데미지 anchors)
│   ├── physics.js     # 비행 동역학 (순수 함수)
│   ├── collision.js   # 충돌 sphere vs box/cone (M8)
│   ├── damage.js      # 부위 HP + multipliers (M8)
│   ├── effects.js     # 파티클 시스템 smoke/fire/sparks/exhaust (M8)
│   ├── controls.js    # 키보드 입력
│   ├── camera.js      # 카메라 모드 (chase/cockpit/external)
│   ├── hud.js         # HUD 갱신 + 피치 사다리 캔버스 + 데미지 bars
│   ├── autopilot.js   # M7: 자동비행 (cascade controller, TAKEOFF/NAV phase)
│   ├── missionLink.js # M7: SSE EventSource (브릿지→브라우저)
│   ├── telemetry.js   # M6: 브릿지로 시뮬 상태 POST
│   ├── recorder.js    # M9: 비행 데이터 ring buffer + CSV export + replay
│   ├── hitl.js        # M9: 외부 시뮬 state 수신 (SSE)
│   ├── audio.js       # M9: Web Audio 절차적 (엔진/풍절음/실속/임팩트)
│   ├── gamepad.js     # M9: Gamepad API (스틱/트리거 매핑)
│   ├── aiTraffic.js   # M9: NPC 항공기 원형 패턴
│   ├── scenario.js    # M9: 코스 + 스코어링
│   ├── drone.js       # M9: 멀티콥터 물리 + 메시
│   └── multiplayer.js # M9: peer-to-peer 위치 공유 (브릿지 relay)
├── bridge/            # M6/M7: QGC 연동 브릿지
│   ├── server.mjs     # HTTP(시뮬 정적 + /telemetry + /commands) + UDP(MAVLink ↔ QGC)
│   └── mavlink.mjs    # MAVLink v1 인코더/디코더 (10종 메시지)
├── examples/
│   └── hitl-producer.mjs  # M9: 외부 시뮬 흉내내는 데모 (Node)
└── tests/
    ├── physics.test.mjs
    ├── mavlink.test.mjs
    ├── collision.test.mjs
    ├── damage.test.mjs
    ├── recorder.test.mjs
    └── gamepad.test.mjs
```

## 좌표계

Three.js 기본 — 우손계, **+Y up, −Z forward**.

본체 프레임:
- `+X` = 우측 날개
- `+Y` = 동체 위
- `−Z` = 기수 (forward)

각도 부호:
- 피치 업 = `+`
- 롤 우 = `+`
- 요 우 = `+`

## QGroundControl 연동 (M6)

브라우저 시뮬을 "MAVLink 말하는 가짜 드론"으로 만들어 QGC에 띄움.
브릿지 = Node 프로세스 (HTTP↔UDP 변환). 외부 의존성 0.

### 1회 설치
QGroundControl 다운로드: https://qgroundcontrol.com (DMG → Applications)

### 실행

```bash
# 1) 브릿지 + 시뮬 서버 동시 실행 (단일 프로세스)
npm run bridge
# → http://localhost:8765 에서 시뮬 띄움
# → MAVLink을 127.0.0.1:14550 (QGC 기본) 로 송출

# 2) QGroundControl 실행 (Auto-connect 켜져 있으면 자동 연결)
#    상단에 vehicle 1 이 잡히면 OK.

# 3) 브라우저에서 http://localhost:8765 접속 → 비행 시작
```

브라우저 HUD 우상단에 **QGC LINK** (초록) 표시되면 텔레메트리 송신 중.
QGC 화면에서 지도 위 항공기 위치 / 인공수평계 / 속도·고도 게이지 / HDG가 실시간으로 움직임.

### 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `HTTP_PORT` | 8765 | 시뮬/텔레메트리 HTTP 포트 |
| `QGC_HOST` | 127.0.0.1 | QGC 주소 |
| `QGC_PORT` | 14550 | QGC가 listen 하는 UDP 포트 |
| `BIND_PORT` | 14555 | 브릿지가 listen 하는 UDP 포트 (QGC 응답 수신용) |
| `HOME_LAT` / `HOME_LON` / `HOME_ALT` | 37.4602 / 126.4407 / 7 | 시뮬 원점이 매핑될 지구 좌표 (RKSI 인천공항) |

### 송신하는 메시지

| 메시지 | 주기 | 용도 |
|---|---|---|
| HEARTBEAT (id 0) | 1 Hz | QGC 링크 유지 + 모드 (AUTO/ARMED) 보고 |
| ATTITUDE (id 30) | 20 Hz | 인공수평계 (roll/pitch/yaw) |
| GLOBAL_POSITION_INT (id 33) | 20 Hz | 지도 위치 + NED 속도 |
| VFR_HUD (id 74) | 20 Hz | 속도/고도/방위/스로틀/상승률 |
| GPS_RAW_INT (id 24) | 20 Hz | GPS fix 정보 |
| PARAM_VALUE (id 22) | 요청 시 | QGC 파라미터 sync 만족 (더미 1개) |
| MISSION_REQUEST_INT (id 51) | 미션 업로드 중 | 다음 waypoint 요청 |
| MISSION_ACK (id 47) | 미션 업로드 후 | 수신 완료 통지 |
| MISSION_CURRENT (id 42) | 진행 시 | 현재 waypoint 인덱스 |
| MISSION_ITEM_REACHED (id 46) | 도달 시 | waypoint 통과 알림 |
| AUTOPILOT_VERSION (id 148) | 요청 시 | 능력 정보 |
| HOME_POSITION (id 242) | 요청 시 | 홈 좌표 |
| COMMAND_ACK (id 77) | 명령 수신 시 | ACCEPTED |

### 수신/처리 메시지 (M7)

| 메시지 | 동작 |
|---|---|
| MISSION_COUNT (id 44) | 업로드 시작 → REQUEST_INT 루프 |
| MISSION_ITEM_INT (id 73) | waypoint 저장 |
| COMMAND_LONG MISSION_START (cmd 300) | AUTO 모드 진입 + 자동비행 시작 |
| COMMAND_LONG ARM_DISARM (cmd 400) | 무장/해제 (HEARTBEAT 모드 비트 갱신) |
| COMMAND_LONG DO_SET_MODE (cmd 176) / SET_MODE (id 11) | base_mode 설정 |
| PARAM_REQUEST_LIST (id 21) | 더미 파라미터 응답 |

### 좌표 매핑

시뮬 로컬 좌표 → 지구 좌표:
- 시뮬 `+X` = 동쪽 (lon 증가)
- 시뮬 `−Z` = 북쪽 (lat 증가)
- 시뮬 `+Y` = 위 (alt 증가)

NED (MAVLink 표준) 변환:
- North = `−vz_sim`, East = `+vx_sim`, Down = `−vy_sim`

## 충돌 & 데미지 (M8)

빌딩 / 산에 부딪히면 부위별 데미지 → 물리에 직접 영향.

### 부위
| 부위 | HP=0 시 영향 |
|---|---|
| FUS (동체) | CRASH (폭발 파티클, 시뮬 정지). R 키로 리셋 |
| L·WG / R·WG (좌/우 날개) | 양력 절반 + 비대칭 → roll torque (한쪽으로 기울어짐) |
| TAIL (꼬리) | 조종 authority 0.2까지 감소 (W/A/S/D 응답 감퇴) |
| ENG (엔진) | 추력 비례 감소 + HP<0.05 시 프로펠러 정지 |

부위 HP가 0.05 미만이면 mesh가 visibility off → "찢어진 날개" 효과. 데미지 부위에서 연기 파티클 지속 emit, 엔진 HP<0.4 부터 화염 추가.

### HUD INTEGRITY 게이지
우상단에 5개 bar:
- 초록 = 60% 이상 (정상)
- 노랑 = 25-60% (경고)
- 빨강 = 25% 미만 (위험)

### 충돌 검사
sphere(r=5.5m) vs 빌딩 box / 산 cone. 매 프레임 선형 검사 (~105 obstacles). 충돌 시:
- normal 방향 push out
- 충돌 속도 기반 severity (8 m/s 이하면 0, 80 m/s 이상이면 1.0)
- spark + smoke 파티클 burst
- 부위 분류 (충돌점을 body frame으로 역변환 후 zone 매핑)

## 그래픽 (M8)

- **스카이**: ShaderMaterial 그라데이션 (지평선→천정 + 태양 disc + halo)
- **라이팅**: HemisphereLight (하늘 ↔ 지면 톤) + DirectionalLight (태양) + AmbientLight (fill)
- **Terrain**: 80×80 세그먼트에 noise (활주로 주변은 평탄)
- **빌딩**: 70개, tower variant 25%, 옥상 HVAC, 6색 팔레트
- **산**: 35개, 높이 800m+ 봉우리에 snow cap
- **항공기**: 분리된 wing/tail mesh (데미지 시 분리), wingtip nav lights (R 그린/L 레드), tail strobe (1.6Hz 깜빡임), pitot tube, 안테나, exhaust pipe, body+stripe+accent
- **파티클**: 스로틀 시 exhaust trail, 데미지 부위 smoke, 엔진 화염, 충돌 spark, 추락 폭발

## 한계 (현재 사이클)

- 단일 항공기, AI/멀티플레이 없음
- 실제 지형 데이터 없음 (절차적 빌딩 + 산 + noise terrain)
- 사운드 없음
- 실시간 그림자 없음
- EGI 항법 (M5) — 후속
- QGC plan 자동비행 정확도 (M9) — 후속
- QGC RC override / guided 모드 — 후속

## 텔레메트리 레코더 + 리플레이 (M9 Phase A)

비행 중 매 프레임 상태를 ring buffer에 기록 → 재생 / CSV export.

| 키 | 동작 |
|---|---|
| `F` | 녹화 시작/정지 (REC 인디케이터 빨강) |
| `L` | 리플레이 토글 (REPLAY 인디케이터 파랑) — physics 우회, 카메라가 과거 재생 |
| `Y` | 현재 버퍼를 CSV 파일로 다운로드 |

CSV 컬럼: `t, x, y, z, vx, vy, vz, qx, qy, qz, qw, speed, altitude, throttle01, aoa, gForce, vsi, fusHp, lWingHp, rWingHp, tailHp, engHp, status`. MATLAB / Python / LabVIEW 에 바로 import.

기본 capacity: 30분 @ 20Hz = 36000 snapshot. 그 이후엔 가장 오래된 것부터 덮어씀.

## HITL: 외부 시뮬레이터 → 브라우저 시각화 (M9 Phase A)

외부 시스템(LabVIEW VI / FPGA / Python sim / 다른 시뮬)이 항공기 state를 push 하면 브라우저는 순수 3D viewer로 동작. **PRD §1 의 "SaaS 프로토타입" 본 구현.**

### 데이터 흐름
```
외부 producer  ──POST /hitl/state──▶  Node bridge  ──SSE event──▶  Browser
   (LabVIEW                                                          (mesh follows
    FPGA, Python                                                      external state)
    이 시뮬…)
```

### 사용

```bash
# 1) 브릿지 실행
npm run bridge

# 2) 데모 producer (climbing circle 패턴 흉내)
node examples/hitl-producer.mjs

# 3) 브라우저 (http://localhost:8765/) 에서 H 키 → HITL 인디케이터 (오렌지) 표시
#    항공기 mesh가 외부 producer 패턴대로 비행
```

### 키 단축

| 키 | 동작 |
|---|---|
| `H` | HITL 토글 |

### State 스키마

POST body (모든 필드 optional 단 위치는 필수):

```json
{
  "t": 1234567890,
  "x": 0, "y": 100, "z": -500,
  "qx": 0, "qy": 0, "qz": 0, "qw": 1,
  "yawRad": 0, "pitchRad": 0.05, "rollRad": -0.4,
  "vx": 0, "vy": 4, "vz": -50,
  "speed": 50, "altitude": 100,
  "throttle01": 0.7, "vsi": 4
}
```

Quaternion 우선, 없으면 Euler (YXZ) 사용. HITL 모드 동안 충돌/데미지/물리 모두 외부 책임.

## 사운드 (M9 Phase B)

Web Audio API 절차적 생성 — 외부 샘플 0개. 첫 키 입력 시 lazy boot.

| 사운드 | 설명 |
|---|---|
| 엔진 | sawtooth × 2 detuned + lowpass. throttle ↑ → 피치 + 음량. 손상 시 choke |
| 풍절음 | white noise loop + lowpass. 속도^1.4 비례, 10 m/s 이하 silent, 80 m/s 피크 |
| 실속 경고 | 880 Hz square, 4 Hz pulse |
| 충돌 임팩트 | filtered noise 1-shot, severity에 따라 dur/intensity |
| 폭발 | 3-stage 적층 impact |

`X` 키로 음소거 토글 (HUD 좌측 MUTE 인디케이터).

## 게임패드 / 플라이트 스틱 (M9 Phase B)

Gamepad API. XInput 패드 (Xbox/Logitech F710) + 컨슈머 플라이트 스틱 (Logitech Extreme 3D Pro 등) 호환.

### 기본 매핑
| 입력 | 동작 |
|---|---|
| axis 0 | 롤 |
| axis 1 (inverted) | 피치 (forward stick = 코업) |
| axis 2 | 요 |
| 트리거 buttons[6/7] | 스로틀 (RT - LT × 0.5) |
| axis 3 (fallback) | 스로틀 슬라이더 (-1 = max) |

키보드와 자동 병행 — 게임패드 axis 데드존 밖이면 해당 채널만 override. 트리거 누르지 않으면 ↑/↓ 키 그대로 동작.

USB 패드 꽂으면 HUD 좌측 **PAD** 인디케이터 (초록) 표시. 콘솔에 `[gamepad] connected: ID` 로그.

## AI 트래픽 / 시나리오 / 드론 모드 / PFD / VR / 멀티플레이 (M9 Phase C+D+E)

| 키 | 동작 |
|---|---|
| `T` | 시나리오 코스 사이클 (Pattern / Slalom / Climb Test) — 콘솔 로그로 현재 선택 확인 |
| `G` | 선택된 코스 시작 — HUD 좌하단에 객체 + 점수 표시 |
| `Z` | vehicle 토글 (plane ↔ drone) — 드론은 멀티콥터 물리 |
| `J` | 멀티플레이어 toggle — 같은 브릿지에 접속한 다른 peer가 ghost로 표시 |
| (좌하단) | "Enter VR" 버튼 — WebXR 헤드셋 보유 시 자동 표시, 클릭 시 VR 진입 |

### AI 트래픽
시작 시 자동으로 5대의 NPC 항공기가 랜덤 위치/고도/반경의 원형 패턴을 비행. 충돌 검사는 안 됨 (시각 효과).

### 시나리오 코스
- **Pattern**: 200m 상승 → 직사각형 패턴 → 최종 접근. 가장 표준적
- **Slalom**: 5개 게이트 지그재그 (저고도)
- **Climb Test**: 1000m 도달 시간 측정

객체 통과 시 정확도 보너스 (게이트 중심 가까울수록), 완료 시 시간 보너스.

### 드론 모드 (Z 키)
- 멀티콥터 물리: 공력 X, 추력 = 본체 +Y 방향
- 호버는 throttle ≈ 0.5 (추력 = 중량)
- 더 민첩한 attitude rate (W/A/S/D/Q/E 응답이 더 즉각적)

### Glass Cockpit PFD
- 상단 heading rose (±60°, N/E/S/W cardinal + 30° major / 10° minor)
- 좌측 속도 tape (5 m/s tick, 10 m/s major)
- 우측 고도 tape (25 m tick, 100 m major)

### VR / WebXR
WebXR 호환 환경 (Meta Quest Browser, Apple Vision Pro Safari, PC + 헤드셋 + Chrome)에서 우하단 "Enter VR" 버튼 등장. 클릭 → 콕핏 뷰로 immersive 진입.

### 멀티플레이어
- 같은 브릿지에 접속한 모든 peer가 자동으로 서로의 비행을 봄
- 각자 J 키로 송신 활성화 → 좌측 HUD에 `MP N` 카운터 (다른 peer 수)
- 다른 peer는 ghost 항공기로 표시 (5초 stale 시 제거)
- 검증: 두 탭 / 두 기기에서 `http://localhost:8765` 접속 → 둘 다 J → 서로 보임

## QGC Plan 실행 (M7)

QGC에서 만든 plan을 시뮬에 업로드하고 자동비행:

1. `npm run bridge` 로 시뮬+브릿지 실행, 브라우저 `http://localhost:8765` 열고 QGC 연결 확인
2. QGC 좌측 메뉴 **Plan** 클릭
3. 지도에서 waypoint 추가 (Takeoff → 여러 Waypoint → Land 순서 권장)
4. 우상단 **Upload** 클릭 → 시뮬 HUD에 `WP 0/N` 표시되면 업로드 성공
5. **Fly view** 로 돌아가 우측 메뉴의 **Start Mission** (또는 토스트 알림에서 confirm)
6. HUD `MODE` 가 **AUTO** (초록), `WP n/N` 이 자동 진행
7. QGC 지도 위에서 비행기가 waypoint 따라 이동하는 모습 실시간 확인

### Autopilot 동작

- 단순 비례 제어: 다음 waypoint로 향하도록 롤(heading 오차) + 피치(고도 오차) + 스로틀(50 m/s 크루즈)
- waypoint 도달 판정: 수평 120m, 수직 50m 이내
- 도달 시 자동으로 다음 waypoint, 마지막 도달 후 수평 비행 유지
- AUTO 중 키보드 입력은 무시됨 (autopilot이 매 프레임 controls를 덮어씀)
- AUTO 해제: QGC에서 SET_MODE 로 AUTO 비트 끄기 (또는 브릿지 재시작)

### 좌표계 / Frame 처리

- Frame 0 (MAV_FRAME_GLOBAL, MSL alt): wp.alt - HOME.alt 가 시뮬 Y
- Frame 3 (MAV_FRAME_GLOBAL_RELATIVE_ALT_INT): wp.alt 그대로 시뮬 Y
- 그 외: relative로 가정
