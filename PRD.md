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

## 13. M8: 모멘트 기반 6-DOF 회전 동역학 (added 2026-06-20)

### Why
- 기존 회전은 "컨트롤 → 목표 각속도(레이트 직접제어)" + 임시 토크 + attitude auto-level이라
  실제 비행역학이 아니었다. 더치롤·스파이럴·단주기 같은 *창발적* 모드가 없고, HILS/국방
  충실도(비행품질 평가, 안정미계수 기반 검증)의 전제를 만족 못 함.
- M7의 결정론적 고정스텝 + `rk4Step`을 실사용하는 첫 마일스톤.

### What
- 회전 동역학을 **공력 모멘트 → 관성텐서 → 오일러 강체방정식**으로 교체.
  `ω̇ = I⁻¹·(M − ω×Iω)`, Ixz(롤↔요) 커플링 포함.
- 안정·조종 미계수 빌드업: `Cm=Cm0+Cm_α·α+Cm_q·q̂+Cm_δe·δe`, 롤/요도 동형(`Cl_*`, `Cn_*`).
- 사이드슬립 β 도입(기존엔 α만 존재) → 다이히드럴(`Cl_β<0`)·풍향계(`Cn_β>0`).
- ω 적분은 `rk4Step`(M7) 사용 — 감쇠·자이로 항까지 서브스텝 내 재평가.
- 기존 sim 부호 규약(q=ω.x, r=ω.y, p=−ω.z)·제어 매핑 보존 → HUD·오토파일럿 무변경.
- 비행성용 약한 롤 SAS만 명시적 유지(PRD §9 리스크표 sanction). 병진 동역학은 M8 범위 외(불변).

### DoD
- [x] `physics.js`에 순수 함수 `sideslipAngle`/`aeroMoments`/`bodyAngularAccel` + `INERTIA`/`AERO_DERIV`
- [x] `stepPhysics` 회전부를 모멘트 기반 + RK4 적분으로 교체, attitude auto-level 제거
- [x] 6-DOF unit test ≥ 15 (β·각 미계수 부호·오일러방정식·자이로커플링·Ixz·순수성)
- [x] `npm test` 전부 통과(106), 콘솔 에러 0
- [x] 브라우저 행동 검증: 가속→회전→상승(이륙) 성공, NaN/크래시 없음
- [x] 정적 안정 부호: Cm_α<0, Cn_β>0, Cl_β<0; 감쇠 Cm_q/Cl_p/Cn_r<0

### 의존성
- 없음. (PRD §6/§9 위반 없음.)

### Out of M8 (이후 후속)
- ~~사이드포스(Y-force, CY_β)로 병진까지 6-DOF 완성~~ → **완료 (M8-follow, 2026-06-20)**
  - `sideForce` 순수 함수 + `CY_β=-0.30`, `stepPhysics` 힘 합산에 body-right 횡력 추가. 6-DOF 완성.
- 마하/압축성, 추진 스풀·연료소모→CG 이동, 지상반력(오레오) — 별도 마일스톤
- 풍동/DATCOM 테이블 룩업으로 미계수 α·Mach 의존화

## 14. M9: 센서·액추에이터 모델 + 결함 주입 (HILS I/O) (added 2026-06-20)

### Why
- HILS/V&V의 핵심은 **truth(실제 거동)와 measured/commanded(항전이 보는 값/조종면이 실제 내는 값)의
  분리**. 이게 있어야 FCS/FMS 강건성, 센서 오차, 결함 모드를 시험할 수 있다.
- 결함 주입(fault injection)은 HILS 시험의 본질 — 센서 고장·액추에이터 고착·통신 열화로 제어계 검증.

### What
- **액추에이터 모델**(`actuators.js`): 명령 → 실제 변위 사이 rate limit·1차 대역폭·travel limit +
  결함(stuck/offset/float/slow). 물리 경로에 삽입(기본값 near-ideal → 비행감 유지).
- **센서 모델**(`sensors.js`): truth → measured 에 scale·bias·가우시안 노이즈·1차 지연 + 결함
  (frozen/dropout/bias). 노이즈는 **시드 PRNG**(mulberry32)로 M7 결정론 유지(Math.random 금지).
- **결함 주입 API**: `injectFault(target, fault)` / `clearFaults()`, `window.__hils`로 truth·measured·
  actuator 관측. 센서는 관측 탭(제어 루프 밖) → 비행 안정성 불변.
- 센서 채널: 대기속도·기압고도·자세(pitch/roll/heading)·IMU 각속도(p/q/r)·GPS(x/z).

### DoD
- [x] `actuators.js`/`sensors.js` 순수 모듈 + 시드 PRNG·가우시안
- [x] 액추에이터를 command→physics 경로에 배선(rate/bandwidth/limit/fault), 비행감 유지
- [x] 센서 관측 레이어 + `injectFault`/`__hils` 노출(제어 루프 비침투)
- [x] unit test ≥ 20 (actuator 9 + sensor 14), `npm test` 전부(134) 통과, 콘솔 에러 0
- [x] 브라우저 결함주입 검증: stuck 액추에이터 동결, 센서 bias로 measured↔truth 이탈, 정상 비행 유지

### 의존성
- 없음. (PRD §6/§9 위반 없음.)

### Out of M9 (이후 후속)
- 센서-in-the-loop: measured를 오토파일럿/추정기(칼만필터)에 투입 — M9-follow
- 텔레메트리(QGC)에 measured 송신 → GPS 재밍/스푸핑 결함을 GCS에서 시연
- Allan 분산 기반 랜덤워크·스케일팩터 드리프트, 통신 지연/패킷로스 주입

## 15. M10: measured 텔레메트리 → QGC GPS 재밍 시연 (added 2026-06-20)

### Why
- M9의 센서 모델을 GCS까지 연결. 텔레메트리가 truth가 아니라 **measured(항전 관측값)**를 보내면,
  GPS 재밍/스푸핑/고장 같은 결함이 **QGroundControl 지도·계기에 그대로 나타난다** — HILS 시연의 완성.

### What
- `mergeMeasuredIntoTelemetry(truth, measured)` 순수 함수: 센서 채널(gpsX/gpsZ→위치, altitude→고도,
  airspeed→속도, roll/pitch/heading→자세)을 truth payload에 덮어씀. measured 없으면 truth 그대로.
- `main.js`가 텔레메트리 송신 시 이 함수를 거침. 브릿지 매핑(t.x→lon, t.z→lat, t.altitude→alt) 그대로라
  GPS 결함이 지도 위치를 흔든다.
- 결함은 기존 `injectFault('gpsX', {type:'bias'|'frozen'|'dropout'})`로 주입.

### DoD
- [x] `mergeMeasuredIntoTelemetry` 순수 함수 + unit test ≥ 7
- [x] 텔레메트리 송신을 measured 경유로 배선(브릿지 오프라인 시 fail-silent 유지)
- [x] `npm test` 전부(141) 통과, 콘솔 에러 0
- [x] 캡처서버+CDP 검증: GPS bias 주입 → 전송 position이 점프(QGC라면 기체가 이동)

### 의존성
- 없음. (PRD §6/§9 위반 없음. 실제 QGC 시연은 `npm run bridge` + QGC 필요.)

### Out of M10 (이후 후속)
- 전용 재밍/스푸핑 결함 타입(점진 드리프트, 다중경로) + HUD "GPS DEGRADED" 표시
- measured를 오토파일럿/추정기(칼만)에 투입(센서-in-the-loop) — M9-follow와 합류

## 16. M11: 센서-in-the-loop (추정기/칼만 → 오토파일럿) (added 2026-06-20)

### Why
- 진짜 HILS 시험: 오토파일럿이 truth가 아니라 **measured(센서)**로 비행하면, 현실적 센서
  오차/결함에서 제어계가 안정한가? 그리고 GPS 스푸핑이 오토파일럿을 속이는가?
- 노이즈를 제어 루프에 직접 넣으면 채터링 → **추정기(칼만필터)**로 융합 후 투입.

### What
- `estimator.js`: 등속도 1-D 칼만필터(`kfStep`, 위치+속도, GPS 융합) + 1차 저역통과(`lowpassStep`,
  자세/각속도). 순수 함수.
- `main.js`: 매 프레임 sense→estimate→control 순서. 오토파일럿 입력을 `navSource`로 선택:
  `truth`(레거시) / `measured`(생센서) / `estimated`(칼만융합, **기본값**).
- GPS x/z/고도는 칼만 융합, 자세·각속도는 저역통과. `window.setNavSource()` / `window.__hils.nav` 노출.
- 추정기는 랜덤 노이즈는 줄이지만 **바이어스는 못 막음** → GPS 스푸핑이 오토파일럿 항법을 끌고 감.

### DoD
- [x] `estimator.js` 칼만/저역통과 + unit test ≥ 9 (수렴·노이즈저감·등속추종·공분산·순수성)
- [x] 오토파일럿 입력을 navSource(estimated 기본)로 배선, sense→estimate→control 순서
- [x] `npm test` 전부(150) 통과, 콘솔 0, 수동비행 무회귀
- [x] 행동검증: 정상 노이즈에서 estimated가 measured보다 truth에 근접, GPS bias 주입 시 항법 estimate가 truth에서 발산(스푸핑이 오토파일럿을 속임)

### 의존성
- 없음. (PRD §6/§9 위반 없음.)

### Out of M11 (이후 후속)
- 다축 EKF(자세·속도·바이어스 동시 추정), GPS/INS tightly-coupled
- 결함 탐지/배제(FDE) + HUD "NAV DEGRADED" 경고, 추정 잔차 모니터
- 미션 자동 비행 헤드리스 회귀(현재 QGC 업로드 의존 → 데모 미션 내장 검토)

## 17. M12: 데모 미션 내장 + 오토파일럿 강건화 + AUTO 헤드리스 회귀 (added 2026-06-20)

### Why
- M11에서 오토파일럿을 헤드리스로 검증할 길이 없었다(QGC 미션 업로드 의존). 내장 데모 미션으로
  AUTO 모드를 키 하나로 띄우고 자동 회귀할 수 있게 한다.
- 그 과정에서 M8(모멘트 기반 6-DOF) 이후 **오토파일럿 게인이 안 맞아 이착륙/순항이 발산**하던
  잠재 회귀가 드러났다 — 데모 미션 회귀가 이를 잡아냈다.

### What
- `missions.js`: `buildDemoMission(home)` + `localToWaypoint`(autopilot.waypointToLocal의 역). 순수.
- `K` 키 / `window.loadDemoMission()` 로 데모 미션 로드+시작. `window.__hils.auto` 로 상태 노출.
- **오토파일럿 강건화**(현실적 6-DOF 대응): 동압 기반 게인 스케줄링(`(REF/v)²`), 에너지 인식 스로틀
  (상승 시 가속 유지), 속도 보호(저속 상승 억제), ROTATE_SPEED 25→42, MAX_PITCH 18→8°,
  완만한 선회/제한된 조종면 권한.
- **센서 설정**: IMU 채널 zero-lag(실제 IMU는 고대역) — 자세/각속도 지연이 빠른 내부 루프를
  불안정하게 하므로 제거. GPS/기압은 느린 센서로 유지.
- AUTO 기본 항법을 `truth`로(신뢰성). `estimated`(센서-in-the-loop)는 opt-in 스트레스 모드.

### DoD
- [x] `missions.js` 순수 함수 + unit test ≥ 5 (round-trip/frame/circuit)
- [x] 데모 미션 로드+시작(K / window), `__hils.auto` 노출
- [x] 오토파일럿이 데모 미션을 이륙→상승→웨이포인트로 안정 비행
- [x] `npm test` 전부(155) 통과, 콘솔 0, 전 브라우저 회귀(console/fly/hils/nav/telem/mission) PASS
- [x] `tests/mission-check.mjs` 헤드리스 AUTO 회귀(이륙·상승·WP 도달·무크래시)

### 의존성
- 없음. (PRD §6/§9 위반 없음.)

### Out of M12 (이후 후속 — 오토파일럿 강건화 2단계)
- **상승 선회(climbing turn)**: 협조선회(러더)·하중제한 없어 급선회+상승 시 실속 → 현재 데모는 직진
  중심. TECS형 에너지 제어 + 협조선회가 필요.
- **견고한 sensor-in-the-loop AUTO**: estimated 항법은 회전 순간 센서 노이즈가 한계안정 내부 루프를
  PIO로 자극 → 이륙 발산. 레이트 필터링/게인 재설계 필요(별도 마일스톤).

## 18. M13: FDE(결함 탐지·배제) + NAV DEGRADED (added 2026-06-20)

### Why
- M11에서 GPS 스푸핑이 추정기를 속였다(바이어스는 못 막음). 실제 시스템은 **혁신(innovation)
  게이트**로 이상치를 탐지·배제하고 운용자에게 경고한다. 이게 HILS 항법 무결성의 핵심.

### What
- `estimator.js`: `kfStepGated` — 정규화 혁신제곱 `NIS = y²/S`(카이제곱, 1 DOF)가 게이트를 넘으면
  측정을 **배제**하고 모델 예측으로 coast. `{ rejected, nis }` 반환. 순수.
- `main.js`: GPS x/z·기압고도를 게이팅 칼만으로 처리. 지속 배제 시 `navDegraded`(히스테리시스) → 
  `window.__hils.navDegraded` 노출.
- HUD: `#hud-nav` "⚠ NAV DEGRADED" 경고(navSource 무관 — 항법 무결성 모니터).
- 효과: GPS 점프/스푸핑/dropout → 탐지·배제 → 추정이 스푸핑을 따라가지 않고 truth 유지 + 경고.

### DoD
- [x] `kfStepGated` + unit test ≥ 5 (수락/배제/NIS/복구/순수성)
- [x] GPS 채널 게이팅 + navDegraded 노출 + HUD 경고
- [x] `npm test` 전부(160) 통과, 콘솔 0
- [x] 행동검증: GPS 스푸핑 시 추정이 truth 유지(배제) + NAV DEGRADED HUD/플래그 ON, 정상 시 OFF
- [x] 전 브라우저 회귀(fly/hils/telem/mission/nav) PASS

### 의존성
- 없음. (PRD §6/§9 위반 없음.)

### Out of M13 (이후 후속)
- 느린 드리프트 스푸핑(게이트 회피) 탐지 — 다중가설/누적합(CUSUM)
- 다중 GPS/INS 융합으로 배제 후에도 항법 지속(현재는 coast만)

## 19. M14: TECS-lite 종방향 오토파일럿 + 횡방향 불안정 진단 (added 2026-06-20)

### Why
- M12 오토파일럿은 분리된 pitch=고도 / throttle=속도 제어라 상승 시 속도가 빠져 실속했다.
  에너지 기반(TECS) 제어로 실속을 원리적으로 막는다.

### What (완료)
- **TECS-lite 종방향**: 피치 = 에너지 *균형*(고도 낮으면 상승, 단 느리면 고도를 속도로 교환 → 실속
  방지), 스로틀 = *총* 에너지(낮거나 느리면 가속). 협조선회 백프레셔 피드포워드(1/cos(bank)−1).
- 직진 상승이 매우 견고해짐(60→169m 부드럽게, 무실속). 게인 스케줄링·롤 댐핑 강화 동반.
- autopilot unit test(에너지 균형: 저속 시 피치/스로틀 거동) + 직진 데모 미션 헤드리스 회귀.

### 핵심 진단 (왜 선회가 안 되나)
- **횡방향(lateral) 동역학 불안정**을 규명: 깨끗한 수평 순항에서 완만히 뱅크를 줘도(수동·오토파일럿
  모두) 롤이 발산(−102°…)하며 departure. 즉 선회 실패는 *오토파일럿 튜닝이 아니라 비행 모델의
  횡-방향 안정성 문제*(러더 협조·요 댐퍼 부재, 어드버스 요 → 더치롤/스파이럴 발산).
- 따라서 데모 미션은 직진+상승으로 유지. 선회는 M15에서 횡방향부터.

### DoD
- [x] TECS-lite 종방향(에너지 균형 피치 + 총에너지 스로틀 + 선회 보상)
- [x] autopilot unit test ≥ 4, `npm test` 전부(164) 통과, 콘솔 0
- [x] 직진 데모 미션 안정 비행(헤드리스 mission-check), 전 브라우저 회귀 PASS
- [x] 횡방향 불안정 원인 규명·문서화

### Out of M14 → M15 (횡방향/협조선회)
- **러더 협조(ARI/턴 코디네이터) + 요 댐퍼**로 더치롤 억제, 협조선회 구현
- 횡방향 안정미계수(Cl_β/Cn_β/Cl_p/Cn_r) 점검 — 발산이 미계수/부호 문제인지 검증
- 이후 데모 미션을 climbing circuit으로 복원

## 20. M15: 횡방향 안정화(요 댐퍼/협조선회) + 분리형 종방향 제어 (added 2026-06-20)

### Why
- M14에서 진단한 횡방향 불안정(뱅크 시 롤 발산)을 해결하고, 종방향 고도 오버슈트도 잡는다.

### What (완료)
- **비행 모델 횡방향 미계수 재균형**(physics.js): 에일러론 권한↓(Cl_da 0.12→0.10), 롤 댐핑↑
  (Cl_p −0.45→−0.55), **요 댐핑 대폭↑(Cn_r −0.18→−0.75)** — 더치롤 모드 감쇠.
- **오토파일럿 횡방향**: 워시아웃 요 댐퍼(정상 선회 요레이트는 통과, 진동만 감쇠) + 사이드슬립
  협조 러더(β→0) + ARI, **레이트 제한 롤**(뱅크를 일정 속도로 진입, 오버슈트 방지).
- **분리형 종방향 제어**: 피치=고도, 스로틀=강한 속도유지 + 하드 속도가드(SAFE_SPEED 미만 강제
  노즈다운). 순항 고도/속도를 **정밀 유지**(152m·56m/s, 오버슈트 없음 — M14 대비 개선).

### 성과 / 한계
- **성과**: 요 댐핑으로 **즉시 롤 발산이 사라짐** — 기체가 선회를 견디고 130초+ 비행 가능. 순항 정밀.
- **한계**: 깨끗한 *협조선회 수렴*은 아직 미흡(완만한 wallow). 블라인드 튜닝으론 수렴 안 됨 →
  횡-방향 동역학 선형화 + 극배치(pole-placement) 오프라인 해석 필요(M16). 데모 미션은 직진 유지.

### DoD
- [x] 횡방향 미계수 재균형 + 워시아웃 요댐퍼/β협조/레이트제한 롤
- [x] 분리형 종방향(정밀 순항, 무실속), `npm test` 전부(164) 통과, 콘솔 0
- [x] 직진 데모 미션 안정(mission-check 152m), 전 브라우저 회귀(console/fly/hils/nav/telem) PASS
- [x] 즉시 발산 제거 확인(선회 생존)

### Out of M15 → M16 (협조선회 완성)
- 횡-방향 상태공간 선형화 → 더치롤/스파이럴 극배치로 게인 산출(블라인드 튜닝 탈피)
- 완성 후 데모 미션을 climbing circuit으로 복원, sensor-in-the-loop AUTO 재도전

## 21. M16: 횡-방향 안정성 해석 도구 + 발산 원인 재정의 (added 2026-06-20)

### Why
- M15까지 협조선회를 블라인드 튜닝했으나 수렴 못 함. "횡방향 불안정"이 원인이라 가정했는데,
  실제로 그런지 **수치 해석으로 확인**해야 한다.

### What
- `lateral.js`: 순수 수학 — 특성다항식(Faddeev–LeVerrier), 라우스-후르비츠 안정판정, 중앙차분
  야코비안, 그리고 실제 에어프레임 aero/관성으로 **횡-방향 동역학[β,p,r,φ]을 level trim에서
  선형화**해 모드 안정성 판정.
- `lateral.test.mjs`: 수학 프리미티브 검증 + **"에어프레임은 횡방향 안정"을 TDD로 잠금**.

### 핵심 발견 (문제 재정의)
- 라우스-후르비츠 결과: **M8·M15 모든 구성에서 에어프레임 lateral 모드가 안정**(더치롤/롤/스파이럴
  모두 음의 실수부). 즉 발산은 *불안정 에어프레임이 아니다*.
- 프로브 재분석: 모든 departure가 **aoa>60° 실속과 동시 발생**. → 진짜 원인은 **선회 중 속도
  저하 → 실속 → 비선형 post-stall departure**. 횡방향 안정화가 아니라 *선회 중 실속 방지*가 핵심.

### DoD
- [x] `lateral.js` 순수 모듈 + unit test ≥ 8 (charPoly/Routh/Jacobian/airframe 안정)
- [x] `npm test` 전부(172) 통과
- [x] 에어프레임 횡방향 안정성 수치 확인 + 발산=실속유발 재정의 문서화

### Out of M16 → M17 (실속 없는 협조선회)
- 협조 요레이트 피드포워드(r_coord = g·tan(bank)/V) + 선회 진입 속도 가드(실속 마진 확보)
- 그 후 데모 미션 circuit 복원

## 22. M17: 협조선회 완성 — 풀 서킷 AUTO 비행 (added 2026-06-20)

### Why
- M16에서 발산 원인을 "선회 중 실속"으로 재정의. 이를 해결해 **실속 없는 협조선회**로 데모
  미션 circuit을 완주한다.

### What (완료)
- **협조 요레이트 피드포워드**: 러더가 현재 뱅크의 협조 요레이트 `r_coord = g·tan(φ)/V`를 추종.
  실제 선회율을 직접 만들어 **사이드슬립을 0으로** → 다이히드럴이 뱅크를 spiral로 키우지 못함 →
  뱅크가 명령값에 머물고 하중↓·속도 유지 → **실속하지 않음**. 더치롤은 에어프레임 Cn_r이 감쇠.
- **선회 속도가드**: 속도가 SAFE_SPEED로 떨어지면 뱅크를 줄여 실속 마진 확보.
- **방향 부호 수정**: heading→bank 매핑이 이 sim 좌표계에서 반대였음(위치 추적으로 규명) → 수정.
  좌/우 선회 방향이 올바르게.
- 결과: 25° 협조선회로 **데모 circuit 4개 웨이포인트 완주(phase=DONE)**, 전 구간 aoa 낮음·속도
  유지·무크래시.

### DoD
- [x] 협조 요레이트 FF + 속도가드 + 방향 부호 수정
- [x] autopilot unit test(선회 방향 좌우 반대·협조 러더) + `npm test` 전부(174) 통과, 콘솔 0
- [x] mission-check: **풀 circuit 완주(DONE, 4/4 WP)** 헤드리스 검증, 전 브라우저 회귀 PASS
- [x] 데모 미션을 climbing→level circuit으로 복원(이제 비행 가능)

### Out of M17 (이후 후속)
- sensor-in-the-loop AUTO 재도전(이제 비행 모델/제어가 견고하니 estimated 항법 재평가)
- 하강/착륙 단계, 다중 고도 circuit

## 23. M18: 센서-in-the-loop AUTO 완성 (estimated 기본) (added 2026-06-21)

### Why
- M11에서 시도했으나 센서 지연/노이즈가 한계안정 제어를 무너뜨려 이륙 즉시 크래시했다. M17까지
  제어가 견고해졌으니, 오토파일럿이 **truth가 아닌 융합 센서 항법으로** 전체 임무를 비행하게 한다.

### What (완료)
- 오토파일럿이 **estimated 항법**(GPS+IMU 게이팅 칼만 융합)으로 풀 협조선회 서킷 완주.
- **웨이포인트 조기 전환(anticipation)**: ARRIVAL_HORIZ 160 m — GPS 추정 지연에도 급선회 없이 부드럽게.
- GPS 센서 지연 완화(bandwidth 3→8), 직사각형 서킷(90° 우선회 4회, 1500 m leg)으로 선회반경과 양립.
- **AUTO 기본 항법을 `estimated`로** 전환 — 진짜 센서-in-the-loop가 기본. FDE가 살아있어 임무 중
  GPS 스푸핑/재밍을 실시간 배제(M13).

### DoD
- [x] estimated 항법으로 데모 서킷 완주(헤드리스 probe: DONE 4/4; mission-check: WP3+ on estimated)
- [x] `npm test` 전부(174) 통과, 콘솔 0, 전 브라우저 회귀 PASS
- [x] AUTO 기본 navSource='estimated' (truth는 setNavSource로 비교용)

### Out of M18 (이후 후속)
- 하강/착륙 단계, 다중 고도 circuit, GPS 스푸핑 중 AUTO 항로 유지 데모(FDE+estimated)

## 24. M19: GPS 스푸핑 중 AUTO 항로유지 (FDE+INS) (added 2026-06-21)

### Why
- M13(FDE)+M18(센서-in-the-loop AUTO)의 결정타 데모: 임무 중 GPS 스푸핑을 주입해도 항법이
  속지 않고 오토파일럿이 항로를 유지하는지 증명.

### What (완료)
- 임무 중 `injectFault('gpsX',{type:'bias',value:2000})` → 게이팅 칼만이 이상치 배제(NAV DEGRADED) →
  추정 위치가 스푸핑(+2000)을 따라가지 않음.
- **INS 추측항법(dead-reckoning)**: **지속적** GPS 거부(연속 12프레임↑ = 실제 스푸핑) 시 추정 위치를
  INS 속도로 적분 → GPS 단절에도 항법 유지(추정이 truth를 ≈0m로 추종). 거부 중 공분산을 묶어 게이트를
  좁게 유지(지속 스푸핑 계속 배제). 정상 선회의 일시적 거부는 표준 게이팅 칼만으로 즉시 회복(무영향).
- 결과: 스푸핑 98초 내내 추정=truth, 오토파일럿이 WP1·WP2 항로 유지 비행, 무크래시.

### DoD
- [x] `main.js` updateNavEstimate에 INS 추측항법(거부 시) + 공분산 캡
- [x] `tests/spoof-route-check.mjs` 헤드리스 검증: 스푸핑→FDE 배제·NAV DEGRADED·추정 truth 유지·항로 진행
- [x] `npm test` 전부(174) 통과, 콘솔 0, 정상 estimated 서킷·전 회귀 무영향(거부 시에만 동작)

### Out of M19 (이후 후속)
- 느린 드리프트 스푸핑(게이트 회피) 대응, INS 드리프트 모델(장시간 GPS 거부)

## 25. M20: 자동 착륙 (글라이드슬로프 접근 → 플레어 → 접지) (added 2026-06-21)

### Why
- 비행 사이클 완성: 이륙 → 순항 → **접근·착륙**. AUTO가 활주로로 내려와 접지·활주한다.

### What (완료)
- `land:true` 웨이포인트(접지점, alt 0) + 오토파일럿 **LAND 위상**: hasClimbedOut 게이트로 강하 중
  TAKEOFF 재진입 방지.
- **APPROACH**: 검증된 순항 종방향 제어(피치=고도, 하드 속도가드, 스로틀=속도)를 재사용하되 목표
  고도를 글라이드슬로프(4°)로 하강. 글라이드슬로프 목표를 현재 고도로 캡(상승 금지 → **위에서 캡처**,
  클라임-실속 방지). → 안정적 강하(vsi −3.8 일정, 무실속).
- **FLARE**(7m AGL): 파워오프 + 약한 노즈업으로 부드럽게 접지. 착륙 커밋 래치로 풍선/부유 억제.
- **ROLLOUT**: 접지 후 idle, 지면 마찰로 감속 → DONE.
- 직진 데모 미션(이륙→상승→순항→착륙)으로 단순화(신뢰성). 서킷·협조선회는 M17/M18에서 입증.

### DoD
- [x] LAND 위상(접근/플레어/활주) + land 웨이포인트
- [x] `tests/landing-check.mjs` 헤드리스 검증: 안정 접근→플레어→접지→활주(DONE, 무크래시)
- [x] `npm test` 전부(175) 통과, 콘솔 0

### 한계/주의
- 슬릭 기체(플랩 없음)라 ~55 m/s로 빠르게 접지(firm landing) — 강하율은 안전(<8 m/s). 저사양/부하
  시 지면효과 부유로 활주 완료가 늦어질 수 있음(크래시는 없음). 부드러운 감속착륙은 플랩/스포일러
  모델 + TECS 접근으로 후속.

### Out of M20 (이후 후속)
- 플랩/스포일러로 감속착륙, 활주로 정렬·중심선 유지 강화, GPS 스푸핑 중 자동착륙

## 26. M21: 플랩/스포일러 — 부드러운 감속착륙 (added 2026-06-21)

### Why
- M20는 슬릭 기체라 ~55 m/s firm landing이었다. 고양력 장치로 느린 접근·gentle 접지·활주 제동을 구현.

### What (완료)
- **물리(`highLift` 순수 함수)**: 플랩 = CL↑(CL_FLAP)+CD↑(CD_FLAP) → 저속 비행·강하 중 가속 억제.
  스포일러 = CD↑(CD_SPOILER)+양력 덤프(SPOILER_LIFT_DUMP). 착륙용이라 양력보다 **드래그 위주**로 튜닝.
- `stepPhysics`가 CL/CD에 highLift 적용. `sim.flaps/spoilers`는 오토파일럿 출력에서 지령.
- **오토파일럿 LAND**: APPROACH/FLARE에 플랩 전개(접근속도 46→36 m/s, 플랩 실속가드 LANDING_SAFE),
  ROLLOUT에 스포일러 전개(공력 제동). → 느린 접근(~37)·gentle 접지(~23 m/s)·빠른 감속.
- estimated 항법용 기압고도 정밀화(센서 bandwidth 6→14, 칼만 q↑)로 센서-in-the-loop 착륙도 안정.

### DoD
- [x] `highLift` 순수 함수 + unit test 5
- [x] 플랩/스포일러 물리 배선 + 오토파일럿 LAND 지령
- [x] landing-check: **truth·estimated 둘 다** 부드러운 착륙(접지 ~23 m/s, 스포일러 활주, DONE)
- [x] `npm test` 전부(180) 통과, 콘솔 0, 전 HILS 회귀(console/fly/hils/nav/telem/spoof) PASS

### Out of M21 (이후 후속)
- 수동 플랩/스포일러 키, 활주로 정렬·자동 브레이크, 바람/돌풍 중 착륙

## 27. M22: 바람/돌풍 중 착륙 + 결정론적 검증 인프라 (added 2026-06-21)

### Why
- HILS/국방 시뮬에서 대기 외란(정상풍·돌풍·시어)은 핵심 시나리오. 공력을 **공기상대속도**로
  바꾸고 자동착륙이 크로스윈드+돌풍을 견디게 한다. 더불어 모든 비행 테스트를 **재현 가능**하게 만든다.

### What (완료)
- **공기상대 공기역학**: `stepPhysics`의 모든 공력항(받음각·사이드슬립·양력·항력·측력)을
  `sim.velocity`가 아닌 `(velocity − wind)`로 계산. 무풍이면 항등 → 기존 동작 불변.
- **바람 모델(`src/wind.js`, 순수 함수)**: `windStep` = 정상풍 + 1차 Gauss–Markov(OU) 돌풍
  (seeded RNG → 결정론적, 유계). `shearFactor` = 경계층 시어(지면 ≈0 → 기준고도서 만개):
  타이어 횡력을 모델하지 않으므로 지상활주는 무교란, 접근은 실제 크로스윈드, 접지 직전 약화.
- **오토파일럿 착륙 보강**: 크로스트랙(로컬라이저) **PD 유도**(중심선 추종·정상 크로스윈드→크랩),
  글라이드슬로프를 **along-track 거리** 기준(횡오프셋이 3D거리를 부풀려 강하불가→선회하던 버그 제거),
  **점진 플랩**(접근 0.5/단거리 1.0 → 항력↓로 에너지 유지), `turnMargin`을 플랩실속(LANDING_SAFE)
  기준으로(접근 중 뱅크 권한 확보), 접근 뱅크 22° 제한.
- **결정론적 검증 인프라**(별도 가치): `world.js` 시드 RNG(빌딩·산 고정) + **접근 코리도어(±550m)
  장애물 제거**(에어포트 접근면), `window.__advance`(고정 dt·무렌더 스텝) + `__resetForTest`.
  → 브라우저 RAF 가변 dt + 랜덤 월드로 매 비행이 달라지던 문제 해소(A==B 재현 확인).

### DoD
- [x] `windStep`(5) + `shearFactor`(3) unit test, `npm test` 전부(188) 통과
- [x] 공기상대 공력 배선(무풍 항등 — 무풍 착륙 회귀 PASS, 중심선 접지)
- [x] 결정론적 헤드리스 착륙(`landing-wind-det.mjs`): 크로스윈드 4·5·6 m/s + 돌풍에서 **완주**
      (이륙→크랩 접근→플레어→접지→DONE, 무크래시, 코리도어 내), 콘솔 0
- [x] 시드 월드 + `__advance`로 재현성(동일 코드 → 동일 궤적) 확보

### Out of M22 (이후 후속 — §28)
- **활주로 중심선 정밀 접지**: 접근 중 롤 오버슈트(지령 22°→실제 50°, 사이드슬립·다이히드럴 발산)로
  중심선 ±150~320m 한계 사이클. 롤 댐핑/협조 제어법 보강 필요(현재는 코리도어 내 안전 접지까지).
- estimated nav 크로스윈드 착륙, 자동 디크랩(접지 전 크랩 해소), GPS 스푸핑 중 크로스윈드 착륙.

## 28. 알려진 한계 / 후속 (Known limitations)

- **크로스윈드 중심선 정밀도**: 자동착륙은 바람/돌풍 중 완주·안전 접지하나, 접근 롤 제어의
  오버슈트(다이히드럴-사이드슬립 발산)로 단거리 중심선 오차가 ±150~320m. 활주로 폭 내 정밀
  접지는 롤 내부루프 댐핑/협조 보강이 필요(M22 범위 밖).

## 10. 후속 확장 (Out of this PRD — 별도 사이클)

- 음향 (엔진음 + 풍절음, Web Audio API)
- 실제 지형 데이터 (Mapbox / SRTM)
- 다중 항공기 + AI 적기
- 모바일 가상 조이스틱
- 멀티플레이어 (WebRTC / WebSocket)
- 텔레메트리 기록 → CSV → LabVIEW/MATLAB 분석
- **SaaS 각도**: B2B 비행 데이터 분석 대시보드, 군용 시뮬 SaaS, 드론/UAM 시뮬 화이트라벨
