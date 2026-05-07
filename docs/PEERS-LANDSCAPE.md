---
title: "우리 프로젝트의 경쟁/동료 지형"
subtitle: "웹 기반 비행 시뮬 + MAVLink GCS + HITL 어댑터 — 같은 기술 모델을 만드는 곳들"
author: "리서치 기반 정리"
date: "2026-04-28"
---

# 0. 이 문서가 다루는 것

이 문서는 산업 전체가 아니라 **우리 `flight-sim2` 와 같은 기술 시그니처를 가진 프로젝트/회사**만 핀포인트로 정리한다. 일반 산업 보고서는 [INDUSTRY-REPORT.md](INDUSTRY-REPORT.md)에 따로 있다.

## 우리 프로젝트의 기술 시그니처

다음 5개 항목이 동시에 성립하는 프로젝트를 **peer**로 본다.

1. **웹 브라우저에서 실행** (단일 HTML, 빌드 도구 없음)
2. **WebGL/Three.js/CesiumJS 등으로 자체 3D 렌더링**
3. **공력(공기 동역학)을 코드로 직접 구현** (Cannon.js 같은 강체 엔진 X)
4. **MAVLink 표준으로 외부 GCS/외부 시뮬과 통신**
5. **HITL/SITL** (외부 시스템이 비행을 계산하고 우리는 시각화) 가 핵심 사용 사례

이 5개를 모두 만족하는 곳은 사실 거의 없다. 대부분은 **2-3개씩 겹치는 인접 프로젝트**다. 그 인접 그룹을 4개 카테고리로 나눠서 본다.

```
                          ┌──────────────────┐
                          │  flight-sim2     │
                          │  (우리)          │
                          └──┬───────────┬───┘
              인접 (웹 비행)│           │인접 (MAVLink)
                  ┌────────┘           └────────┐
                  ▼                              ▼
        ┌──────────────────┐         ┌──────────────────┐
        │ A. 웹 비행 시뮬  │         │ B. 웹 MAVLink     │
        │   (GeoFS 등)     │         │    GCS           │
        │ Three/Cesium 기반│         │   (WebGCS, Helios)│
        └──────────────────┘         └──────────────────┘

        ┌──────────────────┐         ┌──────────────────┐
        │ C. 상용 SaaS     │         │ D. 한국 진영      │
        │   (Auterion,     │         │   (파이온, 두산   │
        │    Sky-Drones,   │         │    DI, dstlabs,   │
        │    Project AirSim)│        │    이노시뮬)      │
        └──────────────────┘         └──────────────────┘
```

---

# 1. A 그룹 — 웹 브라우저 비행 시뮬레이터 (오픈소스/무료)

## 1-1. **GeoFS** — 가장 직접적인 동류 (그러나 다른 엔진)

[geo-fs.com](https://www.geo-fs.com/)

| 항목 | 내용 |
|---|---|
| 운영 | 1인 개발자 (Xavier Tassin, 프랑스) |
| 엔진 | **CesiumJS** (Three.js 아님) — 3D 지구 + 위성영상 |
| 항공기 | **100+ 종**, 글라이더 → 여객기 → 로켓까지 |
| 물리 | 모든 조종면에 양력/항력/실속 — 코드 기반 공력 |
| 멀티플레이 | **수백 명 동시** + 실제 ADS-B 트래픽 통합 |
| 무료/유료 | 무료 + HD 위성영상 구독 |
| 라이선스 | Closed source (커뮤니티 플러그인은 GitHub) |

### 우리와의 비교

| 차원 | GeoFS | flight-sim2 |
|---|---|---|
| 3D 엔진 | CesiumJS | Three.js |
| 지형 | 전 세계 위성 (Cesium Ion) | 절차적 (RKSI 가상) |
| 항공기 수 | 100+ | 2 (plane + drone) |
| 멀티플레이 | 수백 명 | peer-to-peer (브릿지 relay) |
| MAVLink | **없음** | **있음 (핵심)** |
| HITL | 없음 | **있음** |
| 시나리오/스코어링 | 없음 | 있음 |
| 데미지/충돌 | 없음 (비현실적) | 있음 |
| 라이선스 | 폐쇄 | 오픈 (사실상) |

**GeoFS가 우리에게 주는 의미**: "웹 비행 시뮬은 작동한다, 수익화도 가능 (구독 모델)"의 증거. 다만 GeoFS는 **엔터테인먼트** 노선이고 우리는 **엔지니어링/HITL** 노선이라 직접 경쟁은 아님.

**출처**:
- [GeoFS 공식](https://www.geo-fs.com/)
- [GeoFS Wiki - Aircraft 개발 가이드](https://geofs.fandom.com/wiki/Tutorials/Making_an_aircraft)
- [GeoFS Plugins Aircraft Warehouse - GitHub](https://github.com/geofs-plugins/aircraft-warehouse)

## 1-2. **dimartarmizi/web-flight-simulator** — Three.js + CesiumJS 하이브리드

[GitHub repo](https://github.com/dimartarmizi/web-flight-simulator)

- **Three.js** 항공기 + **CesiumJS** 지형
- 아케이드 스타일 (정밀 공력 X)
- 2025년 Hacker News 게재 ([item 46948113](https://news.ycombinator.com/item?id=46948113)) → 화제
- 단일 개발자 사이드 프로젝트

**우리와의 차이**: 우리는 절차적 지형 + 정밀 공력 (Cessna급) + MAVLink. 이 프로젝트는 시각화 + 게임성 위주.

## 1-3. **Jakob Maier 블로그 시리즈** — Three.js 비행 시뮬 튜토리얼

[jakobmaier.at - Building a Flight Simulator with JavaScript and THREE.js](https://www.jakobmaier.at/posts/flight-simulator-in-javascript/)

- 교육용 글, 단계별 빌드
- Three.js 기반, 절차적
- 2024 작성, 우리와 가장 유사한 학습 경로

**우리에게 주는 의미**: 이 사람의 블로그 시리즈가 **flight-sim2의 입문서로 추천 가능**. 우리 코드를 시각적으로 더 잘 만드는 데 참고할 수 있다.

## 1-4. **phuang17/FlightSimulator** — Three.js + WebGL

[GitHub](https://github.com/phuang17/FlightSimulator) — 미니멀 Three.js 비행 시뮬, 학습용

요약: A 그룹에서 **GeoFS 외에는 모두 1인/사이드 프로젝트 수준**. 우리 프로젝트가 5000+ LOC + MAVLink + HITL + 시나리오까지 갖췄으면 **이 그룹에서 코드 완성도 측면 상위권**.

---

# 2. B 그룹 — 웹 MAVLink GCS (브릿지 + 브라우저)

이 그룹이 우리 `bridge/server.mjs` + `src/missionLink.js` 와 직접 겹친다.

## 2-1. **Helios GCS** — 가장 완성도 높은 오픈 GCS

[heliosgcs.com](https://heliosgcs.com/)

| 항목 | 내용 |
|---|---|
| 라이선스 | 오픈소스, 무료 |
| 플랫폼 | macOS / Windows / Linux / iOS / Android / **웹** (모두 지원) |
| 호환 | ArduPilot + PX4 |
| 기능 | 실시간 텔레메트리, 미션 플래닝, **DuckDB 분석** |
| 특이점 | 오프라인 분석에 DuckDB 내장 |

**우리와의 비교**: Helios는 **GCS만** (시각화+분석). 우리 브릿지는 **시뮬+GCS+HITL** 통합. Helios + 우리 시뮬을 합치면 더 강력.

## 2-2. **WebGCS** — Tornado + WebSocket

[webgcs.org](https://webgcs.org/) / [GitHub - kiorpesc/WebGCS](https://github.com/kiorpesc/WebGCS)

- Python Tornado 서버 + JavaScript 브라우저
- **태블릿/노트북/스마트폰 호환**, 설치 없음
- 우리 브릿지와 같은 아키텍처 (다른 언어)

## 2-3. **ADOS Mission Control** — 다중 드론 fleet

[GitHub - altnautica/ADOSMissionControl](https://github.com/altnautica/ADOSMissionControl)

- 웹 기반 GCS, FC config + 센서 캘리브레이션 + 미션 플래닝
- **다중 드론 fleet** 지원
- ArduPilot SITL 직접 launch 가능
- "True software-defined drones" 컨셉

**우리와의 비교**: ADOS는 **fleet management 측 + 설정/캘리브레이션** 강함. 우리는 **시각화 + HITL** 강함. 보완재.

## 2-4. **Mavelous** — 원조 브라우저 MAVLink GCS

[GitHub - wiseman/mavelous](https://github.com/wiseman/mavelous) / [DIYDrones 글](https://diydrones.com/profiles/blogs/mavelous-the-browser-based-mavlink-gcs-is-coming-on-strong)

- 2012-2014 활발, 이후 정체
- "브라우저에서 MAVLink GCS" 컨셉 최초 증명
- 우리 영역의 **역사적 출발점**

## 2-5. **Nodejs-Websockets-GCS / nodegcs** — Node.js 시도들

- [gaelbillon/Nodejs-Websockets-GCS](https://github.com/gaelbillon/Nodejs-Websockets-GCS)
- [kvenux/nodegcs](https://github.com/kvenux/nodegcs)

Node.js + WebSocket으로 MAVLink relay. 1인 프로젝트, 메인테넌스 미흡. 우리 브릿지의 직속 친척이지만 더 단순.

## B 그룹 종합

- 가장 활발: **Helios GCS** (다중 플랫폼 + 분석)
- 다중 드론 강자: **ADOS**
- 가장 단순/직접: **WebGCS, NodeJS-WebSocket-GCS**

이들과 우리의 차이: **우리는 GCS가 아니라 SIMULATOR + GCS 어댑터**. GCS만 하는 도구들과는 정면 경쟁이 아니라 **합쳐 쓸 수 있는 보완재**.

---

# 3. C 그룹 — 상용 SaaS / 산업급

## 3-1. **Auterion Virtual Skynode** ★ 우리와 가장 유사한 상용 제품

[Auterion docs - Virtual Skynode](https://docs.auterion.com/app-development/simulation/virtual-skynode)

| 항목 | 내용 |
|---|---|
| 회사 | Auterion (스위스, PX4 핵심 메인테이너) |
| 모델 | **PX4 Autopilot 코드를 가상 Skynode 위에서 실행** |
| 웹 인터페이스 | http://10.41.200.2 (브라우저 접속) |
| 시뮬 모드 | **SIH** (자체 내장, Gazebo 불필요) / Gazebo / **AirSim** (Unreal) |
| 통신 | **MAVLink + Mission Control 직접 연결** |
| 가격 | Skynode 하드웨어 + 라이선스 (정확 가격 비공개) |

### 왜 이게 우리 모델과 가장 유사한가

```
flight-sim2:
  외부 sim → POST /hitl/state → bridge → SSE → browser → mesh

Virtual Skynode:
  PX4 코드 → Skynode VM → SIH/AirSim → 웹 UI에서 시각화
```

같은 컨셉. 우리는 **HTML 5000줄 오픈소스**, Auterion은 **상용 + PX4 메인테이너 권위**.

### 그러나 다른 부분

- Auterion은 **PX4 한정**. 우리는 MAVLink 호환되는 모든 것.
- Auterion은 **자체 코드를 Virtual FMU에서 돌림**. 우리는 외부 sim → JSON state → 시각화.
- Auterion은 **상용 lock-in**. 우리는 **단일 HTML, lock-in 0**.

→ Auterion 고객 (PX4 진영 드론 회사) 중 **상용 lock-in 부담스러운 곳**이 우리 잠재 사용자.

**출처**:
- [Auterion Documentation - Virtual Skynode](https://docs.auterion.com/app-development/simulation/virtual-skynode)
- [Auterion Documentation - AirSim Reference](https://docs.auterion.com/app-development/simulation/virtual-skynode/simulation-airsim-reference)
- [PX4 Guide - Auterion Skynode](https://docs.px4.io/main/en/companion_computer/auterion_skynode)
- [GitHub - Auterion/px4-jsbsim-bridge](https://github.com/Auterion/px4-jsbsim-bridge) (우리 M10 추천 — JSBSim 통합 — 의 reference)

## 3-2. **Sky-Drones SmartLink + Cloud**

[sky-drones.com](https://sky-drones.com/)

| 항목 | 내용 |
|---|---|
| 회사 | Sky-Drones Technologies (영국 런던) |
| 제품 | SmartLink (datalink HW $3,990) + Cloud (SaaS) |
| 모델 | **드론 fleet management + 실시간 제어 + AI 분석** |
| 클라이언트 | 군 / 보안 / 응급대응 / 엔터프라이즈 UAV |

Sky-Drones는 **웹 기반이지만 시뮬레이터가 아님** — 진짜 드론 운영 플랫폼. 우리 시뮬이 데모/마케팅 도구라면, Sky-Drones는 **그 후 실제 운영 플랫폼**. 보완재.

## 3-3. **Microsoft Project AirSim → IAMAI 후속**

| 시기 | 상태 |
|---|---|
| 2017-2022 | Microsoft AirSim (오픈소스, Unreal) |
| 2022.07 | **Project AirSim** 상용 클라우드 출시 (Farnborough Airshow) |
| 2024 | Microsoft 정식 단종 |
| 2024-현재 | **IAMAI Consulting Corp** (전 AirSim 엔지니어들) 오픈소스로 부활 |

[GitHub - iamaisim/ProjectAirSim](https://github.com/iamaisim/ProjectAirSim)

- **Unreal Engine 5 기반**, 우리 Three.js와 다른 기술
- 엔터프라이즈/방산용 자율비행 시뮬
- AI 학습용 합성 데이터 생성 강함

**우리와 비교**: AirSim은 **데스크톱/Unreal**, 우리는 **웹/Three.js**. 시장이 다르다 — Unreal 기반은 visual fidelity 우선, 우리는 즉시성/접근성 우선.

**출처**:
- [GeekWire - Microsoft's Project AirSim](https://www.geekwire.com/2022/microsofts-project-airsim-is-pushing-drone-simulation-software-to-new-heights/)
- [Wikipedia - AirSim](https://en.wikipedia.org/wiki/AirSim)
- [GitHub - iamaisim/ProjectAirSim](https://github.com/iamaisim/ProjectAirSim)

## 3-4. **Cesium 기반 상용 스택** (드론 분야)

| 회사/제품 | 특기 |
|---|---|
| [Cesium ion](https://cesium.com/) | 3D 지구 platform, 본진 |
| [Propeller Aero](https://www.propelleraero.com/) | 드론 측량, **CesiumJS 기반** 시각화 |
| [Anvil Labs](https://anvil.so/post/custom-plugins-for-drone-data-in-cesium) | 드론 데이터용 Cesium 커스텀 플러그인 |
| [Sky-Drones + Cesium](https://cesium.com/blog/2021/01/25/sky-drones/) | 원격 드론 운영 + UTM에 Cesium 활용 |

이 그룹의 공통점: **3D 지구 시각화 = CesiumJS 사실상 표준**. 우리가 진짜 지형으로 가려면 (M12) Cesium 통합이 옵션. 또는 Three.js + Mapbox terrain tiles.

**MATLAB UAV Toolbox + Cesium 통합**도 존재 — 학계/연구실에서 시뮬-시각화 분리할 때 표준 스택.

[MATLAB - Visualize with Cesium](https://www.mathworks.com/help/uav/ug/visualize-with-cesium.html)

---

# 4. D 그룹 — 한국 진영 (우리와 같은 모델)

이 섹션이 사용자 관점에서 가장 중요하다.

## 4-1. **파이온시스템즈 (Paion Systems) — OMNI-GCS**

[fionsystems.com/gcs](http://fionsystems.com/gcs/)

| 항목 | 내용 |
|---|---|
| 본사 | 한국 |
| 제품 | **OMNI-GCS** — 자체 개발 |
| 모델 | **웹 기반 다기종 다중 드론** 지상관제 |
| 위치 | 우리 브릿지 + GCS 영역 |

**한국에서 가장 우리와 유사한 회사**. 다만 시뮬이 아닌 **운영 GCS**. PX4/ArduPilot 호환 드론을 웹에서 관제.

→ **잠재 협력 대상**: 우리 시뮬이 그들 GCS의 **데모/훈련 모드**가 될 수 있음.

## 4-2. **두산디지털이노베이션 — APX Solution**

[YouTube - 두산디지털이노베이션 APX Solution #1 GCS (웹 기반)](https://www.youtube.com/watch?v=DbugIjJRX3s)

- 두산 그룹 디지털 사업
- **드론 플랫폼 서비스 APX Solution** — 웹 기반 GCS가 1번 모듈
- 두산모빌리티이노베이션 (수소드론) + 시너지

→ **두산 생태계 안에 우리 컨셉이 이미 존재**. 두산 DI가 GCS, DMI가 드론 만들고, 우리 같은 시뮬은 외부 통합 가능.

## 4-3. **Drone Software Technology Lab (dstlabs.co.kr)**

[dstlabs.co.kr](https://dstlabs.co.kr/)

- ArduPilot **Mission Planner 기반 오픈소스** 드론 제어 SW
- 2025년 5월 신서비스 출시 예정
- 한국 ArduPilot 진영의 거점

→ ArduPilot 진영이라 우리 MAVLink 브릿지 + ArduPilot 호환성 확장 시 협업 가능.

## 4-4. **이노시뮬레이션** — 한화에어로스페이스 LVC 시뮬

[VentureSquare - 이노시뮬레이션, 한화에어로스페이스 무기체계운용 훈련 시뮬레이터](https://www.venturesquare.net/957806/)

- 한국 LVC (Live-Virtual-Constructive) 시뮬 전문
- **한화에어로스페이스 무기체계 운용 훈련 시뮬레이터** 공급
- 우리와는 다른 영역 (군용 통합 훈련) 이지만 **LVC 표준이 우리 멀티플레이어와 컨셉 유사**

**LVC 의미**:
- **Live**: 실제 인원/장비
- **Virtual**: 시뮬에서 사람 조종
- **Constructive**: AI/computational 모델 (NPC 등)

우리 프로젝트의 **AI 트래픽 (Constructive) + 멀티플레이어 (Virtual) + HITL (Live HW)** 조합이 사실상 LVC 미니어처. 한국군 LVC 시장에 우리 프로젝트가 **저예산 demo/POC 도구**로 fit 가능.

## 4-5. **자이언트드론 (Giantdrone)**

[giantdrone.com - FCS, GCS](http://www.giantdrone.com/m/newtech/fcs.php)

- 한국 드론 제조 + FCS(Flight Control System) + GCS 자체 개발
- 산업 분야 드론 솔루션 위주

## 4-6. **포스웨이브, 피앤유드론, kndrone**

[포스웨이브 GCS](http://fourthwave.co.kr/product/gcs.php) / [kndrone 웹 GCS](http://www.kndrone.com/sw_gcs_web.html) / [피앤유드론](https://www.pnudrone.com/)

- 중소 GCS 전문/드론 솔루션 회사들
- 각자 자체 GCS, 웹 기반 일부

이들 중소회사들이 잠재 고객 또는 OEM 통합 파트너 가능성.

## 4-7. **한국 정부 R&D — LVC 드론 시뮬레이터**

[ScienceON - LVC 기반 드론 활용 전술훈련 시뮬레이터 개발](https://scienceon.kisti.re.kr/srch/selectPORSrchReport.do?cn=TRKO202400004586)

정부 출연 연구로 진행된 **LVC 기반 드론 전술훈련 시뮬레이터** 개발 보고서. 결과물:
- **드론 전술훈련 시뮬레이터**
- 가상 드론 훈련 콘텐츠
- **LVC 기반 디지털트윈 지상운용 관제 시스템**

→ 한국 정부가 이 영역에 자금을 쏟고 있다는 강한 시그널. KISTI/ScienceON에 보고서 다수.

## 4-8. **KAI LVC 시장 진출 (2021)**

[파이낸셜뉴스 - KAI 미래형 훈련체계 LVC 시장 진출](https://www.fnnews.com/news/202103111343193030)

- VR + AR + 4차 산업 기술 기반 미래형 훈련체계
- 글로벌 방산시장에서 잠재력 큰 분야로 평가
- 국방부가 통합훈련체계 구축 추진 중

→ KAI가 도담시스템스 + 에픽게임즈 코리아에 더해 **LVC 시장으로 확장 중**. 우리 프로젝트의 LVC 미니어처 컨셉이 시기적으로 맞물림.

---

# 5. Feature 매트릭스 — 한 눈에 비교

| 기능 | flight-sim2 | GeoFS | Helios | ADOS | Auterion VS | Project AirSim | OMNI-GCS | APX |
|---|---|---|---|---|---|---|---|---|
| 웹 브라우저 실행 | ★ | ★ | ☆ | ★ | ☆ (별도 IP) | ✗ | ★ | ★ |
| 단일 HTML 배포 | ★ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 자체 3D 렌더 | Three.js | CesiumJS | (없음/지도) | (지도) | UE | UE | (지도) | (지도) |
| 코드급 공력 | ★ | ★ | ✗ | ✗ | (PX4) | ★ | ✗ | ✗ |
| MAVLink 통신 | ★ | ✗ | ★ | ★ | ★ | ✗ | ★ | ★ |
| HITL/SITL | ★ | ✗ | ✗ | ★ | ★ | ★ | ✗ | ✗ |
| 미션 플래닝 | ★ | ✗ | ★ | ★ | ★ | ★ | ★ | ★ |
| 멀티 vehicle | ★ (peer) | ★ | ✗ | ★ | ★ | ★ | ★ | ★ |
| 데미지 모델 | ★ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 시나리오/스코어 | ★ | ✗ | ✗ | ✗ | ✗ | ★ | ✗ | ✗ |
| 사운드 | ★ | ★ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 데이터 레코더 | ★ | ✗ | ★ | ★ | ★ | ★ | ★ | ★ |
| 오픈소스 | ★ | ✗ | ★ | ★ | ✗ | ★ | ✗ | ✗ |
| 한국 회사/지원 | — | ✗ | ✗ | ✗ | ✗ | ✗ | ★ | ★ |

★ = 있음 / ☆ = 부분 / ✗ = 없음

## 매트릭스가 보여주는 것

1. **단일 HTML 배포 = 우리만의 강점.** 다른 모든 도구는 설치/계정/하드웨어 요구.
2. **자체 3D 렌더 + 코드급 공력 + MAVLink + HITL 모두 갖춘 건 우리뿐**. AirSim도 비슷하지만 Unreal이라 진입장벽 높음.
3. **데미지 / 시나리오 / 사운드는 게임적 요소** — 운영 GCS들이 안 하는 것. 우리가 이 영역에서 차별화.
4. **한국 진영은 시뮬보다 GCS 위주** — 시뮬+GCS 결합한 우리 컨셉이 한국에서 비어있음.

---

# 6. 갭 분석 — 우리가 차지할 수 있는 공간

## 6-1. 시장의 빈 자리 (B2B)

다음 시나리오에서 기존 도구들이 모두 부족하다:

### 시나리오 A: "우리 비행 알고리즘 시연 회의"
- 한국 드론 스타트업 (니어스랩, 파블로항공) PM이 **투자자에게 자사 군집 알고리즘 시연**
- 옵션:
  - AirSim: Unreal 빌드 보내야 함 (10GB+, 기술자 필요)
  - QGC + Gazebo: 데스크톱 앱 설치 필요
  - **우리**: URL 한 줄 → 즉시 시연 가능. 회의실 빔 프로젝터에 띄워도 OK.

### 시나리오 B: "FPGA 기반 비행 SW 시연"
- KARI/ADD/대학 연구실이 **MATLAB/Simulink 또는 LabVIEW** 로 비행 알고리즘 만들어 놓고 시연이 필요
- 옵션:
  - 직접 시뮬 만들기: 6개월
  - 외주 (도담 등): 비용·시간 큼
  - **우리 + HITL**: WebSocket으로 state push → 즉시 시각화

### 시나리오 C: "교육용 드론 SW 학습"
- 대학생/주니어 엔지니어가 PX4/MAVLink 학습
- 옵션:
  - PX4 SITL + Gazebo: Linux 환경 + 학습 곡선
  - **우리**: 브라우저에서 즉시 코드 읽고 실행

## 6-2. 우리만 할 수 있는 것 (Auterion 대비 우위)

| 차원 | Auterion Virtual Skynode | flight-sim2 |
|---|---|---|
| 배포 | 가상 머신 + IP 라우팅 | URL 한 줄 |
| 종속성 | PX4 lock-in | MAVLink만 호환되면 누구든 |
| 비용 | 라이선스 (수천 달러+) | 0 (오픈소스) |
| 커스터마이징 | Auterion 정책 따름 | 코드 직접 수정 |
| 시각 디테일 | Unreal 기반 (강함) | Three.js (보통) |
| HITL 어댑터 | PX4 코드만 | 임의 외부 시스템 |

## 6-3. 우리가 약한 것 (당장 보강해야 할)

| 약점 | 보강 방법 (어디서 빌려옴) |
|---|---|
| 정통 공력 모델 부족 | **JSBSim 통합 (M10)** — Auterion px4-jsbsim-bridge가 reference |
| 진짜 지형 데이터 없음 | **Cesium ion 통합 (M12)** — Propeller/Anvil처럼 |
| 미션 분석 SW 부족 | **DuckDB 내장** (Helios GCS 처럼) |
| 인증급 검증 부족 | (장기) DO-178C path |
| 사용자 베이스/홍보 | 한국 LVC R&D 진영에 침투 |

---

# 7. 실행 추천

## 7-1. 단기 (1-2개월)

1. **`README.md` 영문화 + 짧은 데모 영상** — 글로벌 OSS 진영 (PX4 Discord, ArduPilot Forum) 노출
2. **JSBSim 통합 (M10)** — Auterion px4-jsbsim-bridge 패턴을 웹으로 포팅. 게임 시뮬 → 엔지니어링 시뮬 격상
3. **한국 한정 추가 작업**: 인천공항(RKSI) 실제 활주로 데이터 + 한글 HUD 옵션

## 7-2. 중기 (3-6개월)

1. **dstlabs.co.kr / 파이온시스템즈 / 두산DI 에 데모 메일** — 통합 가능성 타진
2. **KARI/ADD R&D 입찰 모니터링** ([scienceon.kisti.re.kr](https://scienceon.kisti.re.kr/) ) — LVC 드론 사업 후속이 우리 fit
3. **한국 UAM 회사 (슈퍼널, Plana)에 시연 도구 제안** — 투자자/규제기관 데모용

## 7-3. 장기 (6-12개월)

1. **B2B SaaS 라이선스 모델 시작** — 월 $500-2000 (드론 스타트업), $2000-5000 (UAM/방산)
2. **LVC 통합 데모 — 한국 국방부 합성훈련환경 사업 follow** ([defense report](https://www.fnnews.com/news/202103111343193030))
3. **Cesium ion 통합 → 글로벌 시장** (북미 Sky-Drones / Propeller 같은 위치)

---

# 8. 한 줄 요약

> **우리 프로젝트의 진짜 동류는 GeoFS (웹 비행 시뮬), Helios GCS (웹 MAVLink), Auterion Virtual Skynode (HITL+웹) 셋이다. 이 세 가지를 모두 합친 단일 HTML이 시장에 없다. 한국에서는 OMNI-GCS, APX Solution, 이노시뮬레이션 LVC 같은 인접 회사들이 있지만, 시뮬+GCS 결합은 비어 있다. 우리가 정확히 겨냥할 수 있는 시장이다.**

---

# 부록 — 출처

## 오픈소스 / 무료
- [GeoFS](https://www.geo-fs.com/) — Free Online Flight Simulator
- [GitHub - dimartarmizi/web-flight-simulator](https://github.com/dimartarmizi/web-flight-simulator)
- [Jakob Maier - Flight Simulator with JS+THREE.js](https://www.jakobmaier.at/posts/flight-simulator-in-javascript/)
- [Helios GCS](https://heliosgcs.com/)
- [WebGCS](https://webgcs.org/) / [GitHub kiorpesc/WebGCS](https://github.com/kiorpesc/WebGCS)
- [GitHub altnautica/ADOSMissionControl](https://github.com/altnautica/ADOSMissionControl)
- [GitHub wiseman/mavelous](https://github.com/wiseman/mavelous)
- [GitHub gaelbillon/Nodejs-Websockets-GCS](https://github.com/gaelbillon/Nodejs-Websockets-GCS)
- [GitHub kvenux/nodegcs](https://github.com/kvenux/nodegcs)
- [GitHub iamaisim/ProjectAirSim](https://github.com/iamaisim/ProjectAirSim)
- [GitHub Auterion/px4-jsbsim-bridge](https://github.com/Auterion/px4-jsbsim-bridge)
- [JSBSim 공식](https://jsbsim.sourceforge.net/)

## 상용
- [Auterion - Virtual Skynode](https://docs.auterion.com/app-development/simulation/virtual-skynode)
- [Sky-Drones Technologies](https://sky-drones.com/)
- [Cesium ion (use case: drones)](https://cesium.com/use-cases/drones/)
- [MATLAB UAV Toolbox + Cesium](https://www.mathworks.com/help/uav/ug/visualize-with-cesium.html)
- [Propeller Aero - drone surveys](https://www.propelleraero.com/)
- [Anvil Labs - Cesium plugins](https://anvil.so/post/custom-plugins-for-drone-data-in-cesium)
- [GeekWire - Microsoft Project AirSim](https://www.geekwire.com/2022/microsofts-project-airsim-is-pushing-drone-simulation-software-to-new-heights/)

## 한국
- [파이온시스템즈 OMNI-GCS](http://fionsystems.com/gcs/)
- [두산디지털이노베이션 APX Solution (YouTube)](https://www.youtube.com/watch?v=DbugIjJRX3s)
- [Drone Software Technology Lab](https://dstlabs.co.kr/)
- [자이언트드론 FCS/GCS](http://www.giantdrone.com/m/newtech/fcs.php)
- [포스웨이브 GCS](http://fourthwave.co.kr/product/gcs.php)
- [kndrone 웹 GCS](http://www.kndrone.com/sw_gcs_web.html)
- [피앤유드론](https://www.pnudrone.com/)
- [VentureSquare - 이노시뮬레이션 한화에어로 LVC](https://www.venturesquare.net/957806/)
- [ScienceON - LVC 드론 시뮬레이터 보고서](https://scienceon.kisti.re.kr/srch/selectPORSrchReport.do?cn=TRKO202400004586)
- [파이낸셜뉴스 - KAI LVC 시장 진출](https://www.fnnews.com/news/202103111343193030)
- [DBpia - 디지털 트윈 통합전투훈련플랫폼](https://www.dbpia.co.kr/journal/articleDetail?nodeId=NODE10549917)

---

*본 보고서는 2026.04.28 기준 공개 자료. 우리 프로젝트의 직접 peer만 다룸 (광역 산업은 INDUSTRY-REPORT.md). 한국 회사 정보는 공개 웹/공시 기반이며 비공개 사정은 포함하지 않음.*
