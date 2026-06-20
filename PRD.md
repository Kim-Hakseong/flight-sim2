# PRD — Browser Flight Simulator (Mac Mini M4 Local)

## 0. 한 줄 요약

Mac Mini M4 16GB에서 **`open index.html` 한 번으로 즉시 실행되는** 키보드 조작 3D 비행 시뮬레이터를, Three.js + 직접 구현한 6-DOF 항공역학으로 구축한다. EGI(Embedded GPS/INS) 스타일 항법 시뮬은 M5에서 분리하여 추가한다.

## 1. 목적 (Why / What / Who)

### Why
- "비행 시뮬 = Unreal/Unity 필요" 통념을 깨고, 단일 HTML로 **즉시 테스트 가능한 MVP**를 만든다.
- 향후 LabVIEW/FPGA 기반 시뮬레이션의 웹 시각화 SaaS 프로토타입.

### What
- 1~2분 안에 이륙 → 기동 → 착륙(또는 추락)이 가능한 미니 비행 시뮬.
- 키보드만으로 조작.
- 사실적인 물리(Lift/Drag/Thrust/Gravity) + 군용 HUD 풍 오버레이.

### Who
- **Primary**: Haku 본인 (Mac Mini M4, Safari/Chrome).
- **Secondary**: 향후 데모 대상 — 방산/제조 클라이언트, SaaS 잠재 고객.

## 2. 사용 환경

| 항목 | 값 |
|---|---|
| OS | macOS (Mac Mini M4) |
| RAM | 16GB |
| 브라우저 | Safari 17+ / Chrome 120+ |
| 실행 | `open index.html` 또는 더블클릭 |
| 외부 의존 | Three.js (CDN, r128 고정) — 그 외 없음 |
| 인터넷 | 최초 1회만 (CDN 캐시 후 오프라인 동작) |

## 3. 범위 (In / Out)

### In Scope (이번 사이클: M0 ~ M4)
- 단일 항공기 (경비행기 ~ Cessna 172 급)
- 평지 + 활주로 + 시각 참조용 빌딩/산
- 6-DOF 비행 (피치/롤/요 + 위치 XYZ)
- 키보드 입력 (WASD + Q/E + 화살표 + R/V/P)
- HUD: 속도, 고도, 방위, AoA, G-force, 스로틀, VSI
- 카메라 시점 토글 (3인칭 추적 / 1인칭 콕핏 / 외부 자유)
- 60fps @ 1920×1080
- 단위 테스트: 물리 함수
- 스모크 검증: 페이지 로드 + 콘솔 에러 0

### Out of Scope (이번 사이클)
- 멀티플레이어, 네트워크
- 고급 그래픽 (텍스처, 셰이더, 다중 광원, 실시간 그림자)
- 다중 항공기, AI 적기
- 실제 지형 데이터(SRTM 등)
- 사운드
- 모바일 / 터치 입력
- Unity, Unreal Engine

## 4. 핵심 기능 요구사항

### F1. 즉시 실행
- **DoD**: `index.html` 더블클릭 → 5초 내에 항공기가 활주로 위에 놓이고 HUD가 보임.

### F2. 6-DOF 물리
- 양력, 항력, 추력, 중력 실시간 계산.
- 받음각(AoA) 기반 양력 계수: `CL = CL0 + CL_alpha · α`, 실속(stall) 모델 포함.
- 유도항력: `CD = CD0 + k · CL²`.
- 공기밀도 고도 보정: `ρ = ρ0 · exp(−h / H)` (H = 8500m).
- **DoD**:
  - 일정 속도(약 25 m/s) 이상에서 양력 > 중력 → 이륙 가능.
  - 정지 또는 저속 + 큰 AoA → 실속(stall) 표시.

### F3. 키보드 조작 (매핑 고정)
- `W` / `S`: 피치 업/다운 (W=기수 올림)
- `A` / `D`: 롤 좌/우 (A=왼쪽 날개 내림)
- `Q` / `E`: 요 좌/우
- `↑` / `↓`: 스로틀 +/−
- `R`: 활주로 시작점으로 리셋
- `V`: 시점 토글 (chase → cockpit → external → chase)
- `P`: 일시정지
- **DoD**: 모든 매핑 작동 + 입력 없을 시 자연 감쇠로 안정화.

### F4. HUD
- 좌측 테이프: 대기속도 (m/s)
- 우측 테이프: 고도 (m)
- 상단: 자기방위 (°, 0–360)
- 중앙: 십자선 + 피치 사다리 (artificial horizon)
- 하단 패널: 스로틀%, AoA°, VSI(m/s), G-force, 상태(OK / STALL / CRASH)
- 톤: **군용 HUD 풍** (앰버 또는 그린 모노크롬, 모노스페이스 폰트)
- **DoD**: 모든 값이 매 프레임 갱신 + 직진 수평비행 시 VSI ≈ 0, G ≈ 1.

### F5. EGI 스타일 항법 (선택, M5)
- INS 자세 적분: 자이로(각속도) + 가속도 누적으로 자세 추정.
- GPS 토글 (`G` 키): ON = 위치 진실값, OFF = INS만 사용 (드리프트 발생).
- HUD에 INS/GPS 상태 표시.
- **DoD**: GPS OFF 60초 후 위치 오차 ≥ 10m 측정 가능.

## 5. 비기능 요구사항

| ID | 요구사항 | 측정 방법 |
|---|---|---|
| NF1 | 60fps 유지 | 5초 평균 FPS ≥ 55 |
| NF2 | 외부 의존성 최소 | Three.js 1개만 |
| NF3 | 단일 진입점 | `index.html` (CDN 의존 OK) |
| NF4 | 디버그 가능성 | 개발자 콘솔 에러 0개 |
| NF5 | 코드 가독성 | `src/` 모듈 분리, 함수당 ≤ 50줄 |

## 6. 기술 스택 결정

### 채택
- **Three.js r128** (CDN: cdnjs).
- **Vanilla JS, ES Modules** (`<script type="module">`). 빌드 도구 없음.
- **node:test** (Node 20+ 내장) 또는 **Vitest** — 물리 unit test.
- (선택) **Playwright** — 브라우저 스모크 테스트.

### 거부
- **Unity / Unreal**: 빌드 사이클 길고 macOS Universal 빌드 복잡.
- **Cannon.js / Ammo.js**: 비행은 일반 강체 충돌이 아닌 **공력**이 본질 → 직접 구현이 명확.
- **TypeScript**: M1–M4까지 오버헤드. M5 이후 검토.

## 7. 마일스톤 (Ralph 루프 단위)

각 마일스톤은 독립적으로 테스트 가능해야 한다. 한 루프 = 한 마일스톤 또는 한 마일스톤의 한 단계.

### M0. 부트스트랩
- `index.html` + Three.js 로드 + 빈 캔버스 + 단순 큐브
- `package.json` + `tests/physics.test.mjs` placeholder
- **검증**: 페이지 열면 큐브가 회전하며 보임. `npm test` 통과 (placeholder).

### M1. 정적 월드
- 지면, 활주로(중앙선 포함), 빌딩 50개+, 산 30개
- 직사광 + 환경광 + 안개
- **검증**: 카메라가 활주로 시점에서 빌딩이 거리감 있게 보임.

### M2. 항공기 + 카메라
- 절차적 항공기 (동체/주익/미익/콕핏/프로펠러/랜딩기어)
- 3인칭 추적 카메라 (부드러운 lerp)
- **검증**: 항공기가 활주로 위에 놓이고, 카메라가 잘 따라옴.

### M3. 물리 + 입력
- 키 입력 → body angular velocity → quaternion 회전
- Lift / Drag / Thrust / Gravity 실시간
- 지면 충돌 (간단)
- **검증**: W/S/A/D로 조작, 스로틀 올리면 가속, 적정 속도에서 이륙.
- **단위 테스트**: 받음각 계산, 양력/항력 공식, 좌표 변환.

### M4. HUD
- 속도/고도/방위/AoA/G/스로틀/VSI 표시
- 피치 사다리 (artificial horizon)
- 군용 HUD 풍 톤
- **검증**: 직진 수평비행 시 HUD 값이 물리 state와 일치.

### M5. EGI 항법 (선택)
- INS 자세 적분 + GPS 토글 + 드리프트 시뮬
- HUD에 INS/GPS 상태 표시
- **검증**: GPS OFF 60초 후 위치 오차 ≥ 10m.

## 8. Definition of Done (전체)

- [ ] `index.html` 더블클릭으로 실행됨
- [ ] 60fps (Mac Mini M4 기준)
- [ ] M0–M4 모든 DoD 통과
- [ ] 콘솔 에러 0
- [ ] `npm test` 통과 (물리 unit tests ≥ 5개)
- [ ] `README.md` 에 실행/조작 방법 명시
- [ ] `Log.md` 에 모든 마일스톤 GREEN 기록

## 9. 리스크 & 대응

| 리스크 | 대응 |
|---|---|
| Three.js r128 vs 최신 API 차이 | r128 고정. 업그레이드는 별도 작업. |
| 물리 부호 혼란 (Three.js 좌표계) | 물리 모듈 상단에 좌표계 주석. 부호 단위 테스트. |
| 60fps 미달 | 빌딩 수 축소, 안티앨리어싱/그림자 동적 토글. |
| 비행이 너무 어려움 | stability augmentation(자동 안정화) 추가, 난이도 토글. |
| 탭 비활성 시 dt 폭주 | dt > 0.1s면 0.1로 클램프. |

## 11. M6: QGroundControl 연동 (added 2026-04-27)

### Why
- "비행 시뮬 = Unreal/Unity" 통념 깨기에 더해, "GCS 연동 = 비싼 HW 필요" 통념도 깬다.
- LabVIEW/FPGA 시뮬레이션의 웹 시각화 SaaS 프로토타입(§1) 각도 강화: 실제 산업 표준 GCS(QGC)에 우리 시뮬을 띄울 수 있다는 데모.

### What
- 브라우저 시뮬을 MAVLink v1 화자 가짜 항공기로 만든다.
- Node 브릿지(`bridge/server.mjs`)가 시뮬 상태를 받아 MAVLink → UDP `127.0.0.1:14550` 송출.
- QGC가 자동 연결하여 지도/HUD/계기에 실시간 표시.

### 송신 메시지 (단방향)
- HEARTBEAT (1 Hz) — 링크 유지
- ATTITUDE (20 Hz) — 인공수평계
- GLOBAL_POSITION_INT (20 Hz) — 지도 위치
- VFR_HUD (20 Hz) — 속도/고도/방위/스로틀/VSI
- GPS_RAW_INT (20 Hz) — GPS fix

### DoD
- [ ] `npm run bridge` 한 줄로 시뮬 + 브릿지 동시 기동
- [ ] QGC가 자동 연결 → vehicle 1로 인식
- [ ] 브라우저 비행 시 QGC 지도에 위치 이동 + 인공수평계 동기
- [ ] 브릿지 미실행 시 시뮬은 그대로 동작 (fail-silent)
- [ ] MAVLink 인코더 unit test ≥ 8개 통과

### 의존성
- 없음. Node built-ins(`http`, `dgram`)만 사용.
- (PRD §6의 "거부" 목록 위반 없음. PRD §9의 의존성 정책 위반 없음.)

### Out of M6 (M7 이후 후속)
- QGC → 시뮬 방향 (RC override / setpoint / mission 추종)
- 다중 vehicle
- TCP / Serial 트랜스포트 (현재 UDP만)
- MAVLink v2 (현재 v1만)

## 12. M7: 결정론적 고정스텝 적분 (added 2026-06-20)

### Why
- HILS / 국방 M&S의 전제는 **재현성(reproducibility)**: 동일 초기상태 + 동일 입력열 → 동일 궤적.
- 현재 적분은 `requestAnimationFrame` 가변 dt(`main.js`)라 30fps와 144fps에서 결과가 갈린다.
  이대로면 record/replay·V&V·외부 HW 락스텝이 모두 깨진다. M7은 이후 모든 HILS 확장의 토대.

### What
- 렌더레이트와 **물리레이트를 분리**한다. 물리는 고정 `DT_PHYS`(200 Hz, 0.005 s) 단위로만 전진.
- 누산기(accumulator) 패턴: 프레임 dt를 모아 고정 스텝 N회 실행, 나머지는 다음 프레임으로 이월.
- 스파이럴-오브-데스 방지: 프레임당 서브스텝을 `MAX_SUBSTEPS`로 클램프, 버려진 sim-time을 보고.
- 순수 `planSteps()`(스케줄러) + 순수 `rk4Step()`(향후 모멘트 기반 6-DOF용 4차 적분기) 제공.
- 컨트롤(게임패드/오토파일럿/스로틀)은 프레임당 1회 샘플 → 서브스텝 간 ZOH(영차홀드).

### DoD
- [ ] `src/fixedStep.js` 순수 함수 모듈 (`planSteps`, `rk4Step`, `DT_PHYS`, `MAX_SUBSTEPS`)
- [ ] 물리는 고정 dt로만 전진 — `stepPhysics`가 받는 dt가 항상 `DT_PHYS`
- [ ] 누산 스케줄러 unit test ≥ 6개 (경계·이월·스파이럴가드·레이트 독립성)
- [ ] RK4 적분기 정확도 테스트(지수감쇠·조화진동 해석해 대조) + 결정론/순수성 테스트
- [ ] `npm test` 전부 통과, 콘솔 에러 0
- [ ] 동일 입력열에서 프레임 분할이 달라도 총 스텝 수·sim-time 동일 (레이트 독립성)

### 의존성
- 없음. Node built-ins(`node:test`)만. (PRD §6/§9 위반 없음.)

### Out of M7 (이후 후속)
- 입력 샘플링의 sim-time 바인딩(완전 bit-determinism record/replay) — M7-follow
- 모멘트 기반 완전 6-DOF(관성텐서·안정미계수)로 `rk4Step` 실사용 — 별도 마일스톤
- 외부 HW 클럭 락스텝(HITL lockstep) — `hitl.js` 위에 별도

## 10. 후속 확장 (Out of this PRD — 별도 사이클)

- 음향 (엔진음 + 풍절음, Web Audio API)
- 실제 지형 데이터 (Mapbox / SRTM)
- 다중 항공기 + AI 적기
- 모바일 가상 조이스틱
- 멀티플레이어 (WebRTC / WebSocket)
- 텔레메트리 기록 → CSV → LabVIEW/MATLAB 분석
- **SaaS 각도**: B2B 비행 데이터 분석 대시보드, 군용 시뮬 SaaS, 드론/UAM 시뮬 화이트라벨
