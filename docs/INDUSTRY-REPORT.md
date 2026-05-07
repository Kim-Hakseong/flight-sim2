---
title: "비행 시뮬레이션 산업 보고서"
subtitle: "국내 중심 — 회사별 위치, 기술, 시장 (2024-2026 기준)"
author: "리서치 기반 정리"
date: "2026-04-28"
---

# 0. Executive Summary

이 보고서는 비행 시뮬레이션 산업의 **국내 플레이어를 중심으로**, 글로벌 컨텍스트와 함께 정리한 자료다. 일반 위키/블로그 1차 정보가 아니라 2025-2026년 공식 발표, 매체 보도, 회사 IR 자료를 직접 확인했다 (각 항목에 출처 표기).

## 핵심 발견 (TL;DR)

1. **한국 비행 시뮬레이터 시장의 진짜 1위는 KAI나 한화가 아니라 [도담시스템스](#21-도담시스템스-국내-시뮬레이터-시장-1위)다** — 국내 항공 시뮬레이터의 **95%를 납품**. KAI에서 2000년 분사한 강소기업.
2. **KAI는 2023년 에픽게임즈 코리아와 MOU를 체결**, KF-21 비행 훈련에 **언리얼 엔진 5 기반 VR 시뮬레이터**를 도입. 게임 엔진의 산업 시뮬 진입을 한국이 빠르게 좇고 있다.
3. **CAE가 2021년 L3Harris 군용 훈련 사업부를 $1.05B에 인수** — 글로벌 군 훈련 시뮬 시장이 사실상 CAE 단일 주자로 재편.
4. **CAE Prodigy가 2024년 게임 엔진 기반 풀-플라이트 시뮬레이터로 처음 Level D 인증** 획득. 우리가 만든 Three.js 시뮬과 같은 계보의 기술이 인증급으로 진입했다는 신호.
5. **현대 슈퍼널이 2025년 FAA에서 eVTOL 인증을 획득**, Microsoft와 AI 비행 시뮬 협업. 단, 상용화는 2028년으로 지연 + 조직 축소.
6. **한국 드론 군집 기술이 세계급**: 니어스랩이 미국 디펜스포스트 "2025년 세계 100대 드론 방산기업" 선정. 파블로항공이 군집 조율 4단계 국내 최초 도달.
7. **민간 항공 시뮬 시장은 2025년 $5.78B → 2030년 $7.53B**. 군용 포함 전체 비행 시뮬 시장은 $6.21B → $8.59B (2034).

---

# 1. 시장 규모 (2025 기준)

| 시장 분류 | 2025 규모 | 2030/2034 예상 | 출처 |
|---|---|---|---|
| 비행 시뮬레이터 (전체, 군+민) | $6.21B | $8.59B (2034) | Fortune Business Insights |
| 민간 항공 비행 훈련/시뮬 | $5.78B | $7.53B (2030) | Mordor Intelligence |
| 시뮬레이터 (전 분야) | $12.28B | $16.79B (2030) | Mordor Intelligence |
| **북미 점유율** | **35.85%** | — | Mordor Intelligence |

CAE가 단독으로 **$11.8B 백로그** (2025.09 기준), 분기 매출 **$1.09B**. 한 회사가 시장의 ~20%를 차지한다는 뜻이고, 인수합병으로 1위 격차가 벌어지는 추세.

---

# 2. 국내 (한국) 산업체

## 2-1. 도담시스템스 — 국내 시뮬레이터 시장 1위

| 항목 | 내용 |
|---|---|
| 설립 | **2000년 6월** (KAI에서 분사) |
| 본사 | 사천 (KAI 본사 인근) |
| 인원 | 약 80명 (2022 기준) |
| 시장 점유 | **국내 항공 시뮬레이터의 95%** |
| 특기 | **Level D급** 풀-플라이트 시뮬레이터, 항공전자 장비 |

### 핵심 실적

- **T-50 Level D 시뮬레이터를 국내 최초로 개발** → 공군 설치·운영
- **KF-21 시뮬레이터** 개발 — 실제 KF-21 조종 환경과 **99% 이상 동일**, 좌우 210도·상하 170도 화면, 주야간·우천·강설 모든 기상 조건 재현
- 무인경계 시스템 + 로봇 시스템 기술까지 확장

### 우리 프로젝트와의 관계

도담시스템스가 만드는 **Level D 시뮬레이터는 한 대 ~$10-15M** 가격대. 우리 프로젝트가 직접 경쟁할 수는 없지만, **그들이 사용하는 LabVIEW/MATLAB/시뮬링크 모델을 웹에서 즉시 시각화하는 어댑터** (HITL 채널) 로는 보완재 가치가 있다.

**출처**:
- [테크월드뉴스 - 시뮬레이터 전문 기업 도담시스템스](http://www.epnc.co.kr/news/articleView.html?idxno=45083)
- [디펜스투데이 - KF-21 시뮬레이터 공개](https://www.defensetoday.kr/news/articleView.html?idxno=3198)
- [다음뉴스 - 르포: 실제와 99% 동일 KF-21 시뮬레이터 타보니 (2025.04)](https://v.daum.net/v/20250417082733505)

## 2-2. KAI (한국항공우주산업) — 항공기 OEM + 자체 시뮬 생태계

| 항목 | 내용 |
|---|---|
| 설립 | 1999년 |
| 본사 | 사천 |
| 핵심 제품 | T-50 골든이글, FA-50, **KF-21 보라매**, KUH-1 수리온 |
| 2026 마일스톤 | KF-21 첫 양산기 인도 (2026.03.25, 대통령 참석) |
| 시뮬 전략 | 자체 풀-플라이트 + 에픽게임즈 협업 VR |

### KAI × 에픽게임즈 코리아 MOU (2023.03)

이 MOU는 한국 시뮬 산업의 분기점이다.

- **언리얼 엔진 5 기반 VR 비행 훈련 시뮬레이터** 공동 개발
- 기존 풀-플라이트(Level D) 시뮬레이션 **이전 단계**의 hands-on 훈련 환경 → 대규모 합동 훈련 가능
- KAI는 항공기 + 훈련 시스템 개발 기술에 **XR/VR/메타버스 + 4차 산업혁명 기술**을 결합한 미래 훈련 모델 구축
- KF-21 외 다른 항공기 정비훈련 시뮬, 가상비행시험 플랫폼으로 확장

### 의미

- 산업 시뮬은 **자체 엔진** 또는 **CAE의 Medallion** 같은 폐쇄 솔루션이 표준이었음
- 한국이 **언리얼 엔진을 산업 시뮬에 도입한 선도 사례** — 개발 속도·인력 풀·콘텐츠 재사용성 측면에서 큰 이점
- 2024년 CAE Prodigy도 게임 엔진 기반으로 Level D 인증 → **트렌드와 맞물림**

### KF-21 양산 / 시뮬 일정

- 2026.01.13 개발시험 종료 (1,600회 비행 무사고)
- 2026.03.25 첫 양산기 인도
- 시뮬레이터: 도담 (Level D) + KAI (VR) 양 트랙 운영
- KAI는 **2번째 KF-21 계약 ₩2.4조원** 추가 수주 (2025)

**출처**:
- [Korea IT Times - KAI Epic Games MOU](https://www.koreaittimes.com/news/articleView.html?idxno=119885)
- [Unreal Engine 공식 - KAI Next-Gen Simulation Ecosystem](https://www.unrealengine.com/developer-interviews/introducing-kai-s-next-gen-simulation-ecosystem-powered-by-unreal-engine)
- [Korea Herald - KAI W2.4tr KF-21 deal](https://www.koreaherald.com/article/10519467)
- [모터매거진 - 언리얼 엔진 KF-21 비행 시뮬레이터 적용](https://www.motormag.co.kr/news/articleView.html?idxno=4802)

## 2-3. 한화시스템 — 항공전자 + AESA 레이더

| 항목 | 내용 |
|---|---|
| 설립 | 2014 (한화탈레스 → 2018 한화시스템) |
| 본사 | 성남 (판교 R&D) |
| 핵심 사업 | 방산 IT, **AESA 레이더**, IRST, EOTS, 항공전자 |
| KF-21 역할 | AESA 레이더 + IRST + EOTS, 잔여 사업 ₩1248억 |

한화시스템은 **시뮬레이터를 직접 만들지 않지만**, 시뮬레이터가 모사해야 하는 **센서 시스템 전체**를 공급한다. 다시 말해, 한화시스템 레이더의 동작 모델을 정확히 시뮬할 수 있는 회사가 도담/KAI다. 한국 방산 시뮬 산업의 **공급 사슬 핵심**.

**출처**:
- [한화시스템 - 차세대 한국형 전투기](https://www.hanwhasystems.com/kr/business/defense/space/avonics01.do)
- [아주경제 - KAI/한화에어로/한화시스템 KF-21 추가 계약 ₩3.2조원](https://www.ajunews.com/view/20250626171850775)

## 2-4. 한화에어로스페이스 — 엔진

| 항목 | 내용 |
|---|---|
| KF-21 엔진 공급 | F414-GE-400, **80기 ₩6,232억** (2028.12까지) |
| 누적 엔진 생산 | **10,000기+ (46년)** — F-4(1979) → KF-21 |
| 독자 개발 엔진 | **11종** |
| 2025 마일스톤 | **6세대 전투기 엔진 독자 개발 착수** |

엔진은 시뮬레이션 정확도의 핵심 입력. 한화에어로의 엔진 모델 데이터(추력/연비/응답)가 도담의 시뮬레이터에 들어간다. 우리 프로젝트에서 `physics.js`의 `maxThrust = 4500N` 같은 단일 상수로 처리한 부분이 산업급에서는 **수천 개 파라미터의 룩업 테이블**로 모델링된다.

**출처**:
- [한화그룹 - KF-21 최초 양산 엔진 전량 공급](https://www.hanwha.co.kr/newsroom/media_center/news/news_view.do?seq=14239)
- [전자신문 - 한화에어로 KF-21 엔진 공급](https://www.etnews.com/20250626000441)
- [글로벌이코노믹 - 한화에어로 6세대 전투기 엔진](https://m.g-enews.com/view.php?ud=202505010926505063fbbec65dfb_1)

## 2-5. LIG Nex1 — 무인기 + 군집 + 미사일

| 항목 | 내용 |
|---|---|
| 설립 | 2014 (LG넥스원 분리) |
| 본사 | 성남 (판교) |
| 강점 | 미사일·레이더·통신·EW (전자전), 무인기 |
| 시뮬 영역 | **무인기 훈련 시뮬, AI 군집 무인기** |

ADD와 함께 **AI 군집 무인기**를 2025년 최초 공개 (비즈한국 단독). 한국 무인기 시뮬 시장은 LIG가 사실상 단독.

**출처**:
- [비즈한국 - ADD/LIG넥스원 AI 군집 무인기 최초 공개](https://www.bizhankook.com/bk/article/31593)
- [LIG Nex1 항공전자·드론](https://www.lignex1.com/business/avncDrnList.do)

## 2-6. 현대자동차 슈퍼널 (Supernal) — UAM eVTOL

| 항목 | 내용 |
|---|---|
| 설립 | 2020 (Hyundai Aerospace → 2021 Supernal로 리브랜드) |
| 본사 | 워싱턴 D.C. (미국 법인) + 용산 AAM 연구소 (2026 완공) |
| 항공기 | **S-A2** (5인승 eVTOL, 시속 200 km, 항속 100 km) |
| 인증 | **2025 FAA eVTOL 인증 획득** (신청 후 9개월) |
| 시뮬 협업 | **Microsoft와 AI 비행 시뮬 플랫폼** (2025.01) |
| 상용화 목표 | **2028년** (당초 2025 → 2028로 지연) |

### 현황 (2026 기준)

- FAA 인증 진척 → **글로벌 1위급 진도** (Joby, Archer 다음)
- 다만 산업 전반 인증 강화 + 수요 불확실성으로 조직 축소 진행
- **용산 AAM 연구소 (지하 5층 + 지상 7층, 1만+ 명 상주)**: 2026 완공 예정

### 우리 프로젝트와의 관계

슈퍼널은 자체 시뮬을 Microsoft와 함께 만든다. 우리가 직접 경쟁할 수는 없지만, **UAM 회사들이 자기 비행 데이터를 클라이언트에게 보여주는 데모 도구**로는 우리 같은 웹 기반 시각화의 가치가 명확.

**출처**:
- [The Guru - 현대차 슈퍼널 FAA eVTOL 인증 획득](https://www.theguru.co.kr/news/article.html?no=76575)
- [EBN - 슈퍼널 조직 재정비](https://www.ebn.co.kr/news/articleView.html?idxno=1692193)
- [전자신문 - 슈퍼널 새이름 공개](https://www.etnews.com/20211109000273)
- [나무위키 - 슈퍼널](https://namu.wiki/w/%EC%8A%88%ED%8D%BC%EB%84%90)

## 2-7. Plana — 하이브리드 eVTOL 스타트업

| 항목 | 내용 |
|---|---|
| 설립 | 2021 (한국) |
| 항공기 | **Plana CP-01** — 6인승 + 1조종사, 시속 350+ km, 항속 480+ km |
| 차별화 | **하이브리드** (터보제너레이터 + 배터리) — 순수 전기 eVTOL의 항속 한계 극복 |
| 2025 펀딩 | VONAER로부터 **20대 (5대 인증, 15대 상업) 사전주문, 총 $664M 가치** |
| 위치 | **2025년 미국 이전** 진행 중 (FAA 인증 가속) |
| 한국 사업 | **K-UAM Grand Challenge** 데모 항공기 참여 |

### 특이점

순수 전기 eVTOL (Joby/Archer/Volocopter) 대부분이 **항속 100-150km** 한계 → Plana는 하이브리드로 **480km+** 가능 → 도시간 + 단거리 노선 (서울-도쿄 같은) 노림.

**SkyScape (일본) + Plana**: 한국-일본 첫 eVTOL 노선 개발 발표 (2025).

**출처**:
- [Autoevolution - Plana Aero hybrid eVTOL US](https://www.autoevolution.com/news/south-korean-plana-aero-is-bringing-its-hybrid-evtol-to-the-us-211434.html)
- [DroneLife - PLANA secures pre-order from VONAER (2025.09)](https://dronelife.com/2025/09/23/plana-secures-pre-order-for-20-hybrid-evtol-aircraft-from-vonaer/)
- [Urban Air Mobility News - SkyScape + Plana Korea-Japan eVTOL route](https://www.urbanairmobilitynews.com/aam-uam-route-and-programme-news/skyscape-and-plana-plan-to-develop-asias-first-evtol-route-between-korea-and-japan/)
- [eVTOL.news - Plana CP-01](https://evtol.news/plana-unnamed)

## 2-8. 두산모빌리티이노베이션 (DMI) — 수소 드론

| 항목 | 내용 |
|---|---|
| 설립 | 2016 (두산 그룹) |
| 첫 양산 | **2019 — 세계 최초 수소 연료전지 드론 양산** |
| 성능 | 비행 시간 **2시간**, 운전 반경 **40 km** (배터리 드론 대비 4-5배) |
| 가격 | 약 5,000만원 (대량 보급 한계) |
| 2025 전략 | 물류 드론, 카고 드론 사업화 |
| PX4 사용 | **PX4 기반** 비행 제어 |

DMI는 **MAVLink/PX4 표준을 사용하는 한국 회사** → 우리 브릿지 (`bridge/server.mjs`) 기술과 직접 호환.

**출처**:
- [두산모빌리티이노베이션 공식](https://www.doosanmobility.com/kr)
- [ZDNet Korea - 드론부터 건물 발전까지 수소 주도권](https://zdnet.co.kr/view/?no=20250307154828)
- [로봇신문 - DMI 수소 연료전지 드론 상용화](https://www.irobotnews.com/news/articleView.html?idxno=23589)

## 2-9. 니어스랩 (NearthLab) — 군집 자폭 / 요격 드론

| 항목 | 내용 |
|---|---|
| 설립 | **2015년** (최재혁 대표) |
| 출발점 | 풍력발전 점검 드론 → 방산 확장 |
| 2025 위상 | **세계 100대 드론 방산기업** (미국 디펜스포스트 선정) |
| 핵심 제품 | **자이든** (군집 자폭드론, 1명이 100대 운영, AI 통신두절 자율) |
| | **카이든** (직충돌 요격드론, 시속 250 km+) |
| 매출 성장 | ₩80억 (2024) → **₩204억 (2025), 2.5배** |
| 2026 계획 | 코스닥 IPO 추진 |

### 의미

니어스랩은 **PX4/ArduPilot 같은 오픈소스 + 자체 AI** 조합. 한국 드론 방산의 대표 사례. 군집 자율 비행 알고리즘 검증에 **시뮬레이션이 핵심** — 1대 시제기 비행시험 비용 vs 100대 가상 시뮬의 차이가 명확.

**출처**:
- [유니콘팩토리 - 니어스랩 IPO 자금 조달](https://www.unicornfactory.co.kr/article/2025071614490772672)
- [E데일리 - 소버린 드론 AI 기반 자율비행](https://m.edaily.co.kr/amp/read?newsId=04982326642074784&mediaCodeNo=257)
- [니어스랩 공식](https://nearthlab.com/kr/)

## 2-10. 파블로항공 — 군집 조율 SW

| 항목 | 내용 |
|---|---|
| 강점 | 군집 드론 SW (드론쇼 유명, AI 군집 조율) |
| 2025 펀딩 | **₩110억** (대한항공, LIG넥스원-IBK 방산혁신펀드, 비하이인베스트먼트) |
| 기술 마일스톤 | 군집 조율 기술 단계 중 **4단계 국내 최초 도달** |
| 2025 진출 | DSK 전시회에서 **국방 드론 최초 공개** → 국방 산업 진출 |

**출처**:
- [AI타임스 - 파블로항공 DSK 국방 드론](https://www.aitimes.com/news/articleView.html?idxno=168226)
- [파블로항공 공식](https://www.pabloair.com/)

## 2-11. 정부 R&D — KARI · ADD

### KARI (한국항공우주연구원)

| 사업 | 내용 |
|---|---|
| **드론교통관리시스템 (UTM) 1단계** | 2017-2022 (저고도 150m 이하, 150kg 이하) |
| **UTM 2단계** | **2023-2026 진행** |
| **드론캅 (Drone-Cop)** | 2021-2025, 안티 드론 시스템 (불법 드론 무력화) |
| 공공안전 무인기 | 산림 화재, 재난 감시 등 |

### ADD (국방과학연구소)

| 사업 | 내용 |
|---|---|
| 무인기 자율항법 임무관리 기술 | 2017-2020, 무인기가 외부 위협에 자율 대응 |
| **AI 군집 무인기** | LIG Nex1과 합작, 2025 공개 |

**출처**:
- [KARI - 드론교통관리시스템](https://www.kari.re.kr/kor/contents/20)
- [정책브리핑 - ADD 무인기 자율화 기술](https://www.korea.kr/news/pressReleaseView.do?newsId=156451254)

## 2-12. 학계 — KAIST · 서울대

### KAIST 무인시스템 및 제어 연구실

- 2025년 **PIBOT** (Humanoid Robot Pilot for Human-Centric Aircraft Cockpits) 공개
- 휴머노이드가 **기존 인간용 콕핏을 그대로 조작** → 항공기 개조 없이 자율비행 가능
- 시뮬-투-실기 transfer learning 연구의 한국 대표

### 서울대 항공우주공학과

- 기초학문 + 설계 지향 + 융합 연구
- KARI/ADD/KAI에 인력 공급의 핵심

**출처**:
- [KAIST 무인시스템 및 제어 연구실](https://unmanned.kaist.ac.kr/)
- [서울대 항공우주공학과](https://aerospace.snu.ac.kr/)

---

# 3. 글로벌 산업체 (한국과의 비교)

## 3-1. 게임 / 엔터테인먼트

### Asobo Studio (Microsoft Flight Simulator 2024)

- 본사: 프랑스 보르도, ~400명
- 자체 엔진 (Unity/Unreal 아님)
- 2024 발표: **20개 이상 핵심 시스템 비동기 멀티스레드 재구조** + EFB + 향상된 물리
- Bing Maps + Azure AI → 전 세계 1:1 스케일 지형
- 200명 이상 코어 + 30+ 외부 파트너

### Eagle Dynamics (DCS World)

- 본사: 스위스, 개발팀 러시아·우크라이나
- 자체 엔진, 군용기 정밀 시뮬 ("study sim")
- F-16, F-18, A-10 등 실 매뉴얼 수준 재현
- 라이선스 모델: 무료 + DLC 항공기 ($60-80)

### Laminar Research (X-Plane 12)

- 본사: 미국 콜로라도, ~30명 (소규모)
- 1992년 Austin Meyer 단독 시작
- **Blade Element Theory** 정통 공력
- **FAA Level D 인증된 유일한 게임 출신 엔진**

**출처**:
- [Wikipedia - Microsoft Flight Simulator 2024](https://en.wikipedia.org/wiki/Microsoft_Flight_Simulator_2024)
- [Wikipedia - Asobo Studio](https://en.wikipedia.org/wiki/Asobo_Studio)
- [WCCFTech - MFS 2024 evolved engine](https://wccftech.com/microsoft-flight-simulator-2024-announced/)

## 3-2. 훈련 / 방산 1티어

### CAE — 글로벌 단독 1위

- 본사: 캐나다 몬트리올, 1947 설립
- 시가총액 ~$8B
- 2025 백로그 **$11.8B** (record)
- 분기 매출 **$1.09B** (10% YoY 증가)
- **2021년 L3Harris 군 훈련 사업부 $1.05B에 인수** → 사실상 군용 훈련 통합
- 자체 엔진: **Medallion-6000** (visual), **Tropos** (지형), **CAE Prodigy** (게임 엔진 기반)
- 2024 마일스톤: **CAE Prodigy로 게임 엔진 기반 풀-플라이트 시뮬레이터 첫 Level D 인증** ★

CAE Prodigy의 Level D 인증은 우리 프로젝트가 (이론상) 갈 수 있는 길을 보여준다. 게임 엔진 = 인증 못 받음 이라는 통념이 깨진 해.

### L3Harris (military training 부문 → CAE 흡수, 본체는 항공우주/방위)

- 합병체 (L3 + Harris, 2019)
- 군 훈련 시뮬 부문은 CAE에 매각, 핵심은 통신/EW/탑재시스템
- 미 공군 **2,400대 시뮬 / 300+ 위치** 업그레이드 주관 (CAE/Dell/CymSTAR/Leidos 컨소시엄)

### FlightSafety International

- 1951 설립, **Berkshire Hathaway** (워런 버핏) 자회사
- Gulfstream, Cessna 등 비즈니스 제트 훈련 강세
- CAE의 미국 대안

### Boeing / Airbus

- 자체 시뮬 부서 보유 (특히 항공기 인증용)
- 단, 조종사 훈련 시뮬은 CAE/FlightSafety 같은 외주 의존도 큼

**출처**:
- [Shephard Media - CAE completes L3Harris S&T deal](https://www.shephardmedia.com/news/training-simulation/cae-completes-deal-l3harris-technologies/)
- [PR Newswire - CAE acquires L3Harris Military Training $1.05B](https://www.prnewswire.com/news-releases/cae-to-acquire-l3harris-technologies-military-training-business-for-us1-05-billion-301237025.html)
- [CAE 공식 - Prodigy game engine Level D](https://www.cae.com/media-centre/press-releases/first-full-flight-simulator-with-gaming-engine-powered-cae-prodigy-image-generator-achieves-level-d-qualification)
- [Mordor - Civil Aviation Flight Training Market](https://www.mordorintelligence.com/industry-reports/global-civil-aviation-flight-training-and-simulation-market-industry)

## 3-3. UAM / eVTOL

| 회사 | 본사 | 항공기 | 2025 진척 |
|---|---|---|---|
| **Joby Aviation** | 미국 | 5인승 eVTOL | FAA 인증 막바지, Toyota 투자 |
| **Archer Aviation** | 미국 | Midnight | United Airlines 주문 |
| **Beta Technologies** | 미국 | ALIA | 군 + 화물 우선 |
| **Lilium** (독일) | 독일 | Jet | **2024 파산 후 재구조** |
| **Volocopter** (독일) | 독일 | VoloCity | **2024 파산 후 재구조** |
| **Eve Air Mobility** (브라질) | 브라질 | — | Embraer 자회사 |
| **현대 슈퍼널** | 한국/미국 | S-A2 | **2025 FAA 인증 획득** |
| **Plana** | 한국→미국 | CP-01 (하이브리드) | **2025 VONAER 20대** |

UAM은 2024년 유럽 거품이 꺼지면서 (Lilium, Volocopter 파산) **미국·한국·브라질 중심 재편**. 한국 두 회사가 Top 5에 포함된 건 의미 있다.

**출처**:
- [eVTOL.news](https://evtol.news/)
- [The Guru - 슈퍼널 FAA eVTOL 인증](https://www.theguru.co.kr/news/article.html?no=76575)
- [DroneLife - PLANA + VONAER](https://dronelife.com/2025/09/23/plana-secures-pre-order-for-20-hybrid-evtol-aircraft-from-vonaer/)

## 3-4. 자율 드론 / 방산 신생

| 회사 | 특기 | 2025 |
|---|---|---|
| **Skydio** (미국) | 자율비행 드론 1위, 군용 진출 | 미군 지속 수주 |
| **Anduril** (미국) | AI 통합 방산 | 폭발적 성장, 시총 $14B |
| **Shield AI** | 정찰 AI | V-BAT 시뮬 / 실기 |
| **Microsoft AirSim** | Unreal 기반 자율 시뮬 | **2022 단종 → ProjectAirSim** |
| **NVIDIA Isaac Sim** | Omniverse 기반 로봇·드론 | 활발 |
| **Cosys-Lab AirSim Fork** | AirSim 후속 OSS | 학계 사용 |

### Microsoft의 AirSim → ProjectAirSim 전환 (2024)

AirSim이 단종되고 후속이 나왔다. Microsoft가 **자체 시뮬 플랫폼**을 만들어 슈퍼널 등에 제공. 우리 프로젝트가 노리는 영역과 겹친다 — 다만 우리는 웹 기반, MS는 데스크톱.

## 3-5. 오픈소스 (산업 표준이 된)

| 프로젝트 | 운영 | 위치 | 우리 프로젝트와 |
|---|---|---|---|
| **PX4** | PX4 Foundation (Linux Foundation) | 취리히/글로벌 | MAVLink 호환 직접 |
| **ArduPilot** | DIY Drones community | 글로벌 | MAVLink 호환 직접 |
| **QGroundControl** | MAVLink Foundation + Auterion | 스위스 | **이미 통합** |
| **ROS / Gazebo** | OSRF | 미국 | 미통합, 차후 가능 |
| **JSBSim** | NASA + 커뮤니티 | 미국 | **M10 통합 추천** |
| **FlightGear** | 커뮤니티 | 글로벌 | 우리 후순위 |

PX4 + Gazebo + MAVLink + QGC가 사실상 **드론 SITL의 표준 스택**. Plana, DMI, 슈퍼널, 니어스랩 모두 이 생태계 위에 있다.

**출처**:
- [PX4 Documentation - Simulation](https://docs.px4.io/main/en/simulation/)
- [GovStateU OPUS - ArduPilot vs AirSim 비교 연구 (2025)](https://opus.govst.edu/research_day/2025/wed/13/)

---

# 4. 산업 전체의 핵심 트렌드 (2024-2026)

## 4-1. 게임 엔진의 산업 시뮬 진입

10년 전: "Unity/Unreal은 게임용. 산업 시뮬은 자체 엔진"
2024-2026: **CAE Prodigy = 언리얼 + Level D 인증** / **KAI = 언리얼 + KF-21 VR**

이유:
- 게임 엔진의 렌더링 품질이 자체 엔진 대비 우월
- 인력 풀: 언리얼/유니티 개발자 >> 자체 엔진 개발자
- 콘텐츠 재사용 (3D 자산 마켓플레이스)
- 인증 절차 자체가 "엔진"이 아니라 "behaviour"를 검증 → 게임 엔진도 통과 가능

## 4-2. AI / 자율비행 시뮬의 폭발

- 슈퍼널 + Microsoft AI 비행 시뮬
- ADD/LIG 군집 무인기 시뮬
- 니어스랩 자이든의 통신 두절 자율 모드
- 파블로항공 4단계 군집 조율
- KAIST PIBOT (휴머노이드 조종사)

자율비행은 **수백만 시간 시뮬 학습** 없이는 못 함. 시뮬레이션 = 자율 시스템의 인프라.

## 4-3. UAM의 재편 + 한국의 부상

- 유럽 (Lilium/Volocopter) 거품 꺼짐
- 미국 (Joby/Archer/Beta) 인증 막바지
- **한국 (슈퍼널/Plana) FAA 인증 획득** → 글로벌 Top tier 진입
- 단, 2025 → 2028 상용화 지연 공통

## 4-4. 게임 엔진 vs 정통 공력 모델 양극화

- **CAE Prodigy / KAI VR / Asobo MFS**: 게임 엔진 + 단순화 공력 → 일반 훈련/엔터테인먼트
- **JSBSim / FlightGear / X-Plane**: 정통 공력 → 인증 + 연구

→ 우리 `flight-sim2`는 현재 게임 엔진 진영. M10 (JSBSim 통합) 가면 양 진영 다리 역할 가능.

## 4-5. CAE의 단독 천하 + 도담의 국내 천하

- 글로벌 군 훈련: CAE (35% 시장 + L3Harris 흡수)
- 국내 항공 시뮬: **도담시스템스 (95%)**
- 두 회사 모두 **자체 엔진 + 풀-플라이트 + Level D**

→ 신규 진입자가 1위 자리 노리는 건 비현실적. **틈새 (어댑터, 데이터 파이프라인, 시각화)** 가 현실적 진입 전략.

---

# 5. 한국 시장의 기회 — 우리 프로젝트 관점

이 보고서를 종합하면, 한국 비행 시뮬 산업은 다음 구조다.

```
┌──────────────────────────────────────────────┐
│         글로벌 1위: CAE (캐나다)              │
│         (월 ~$1.09B 매출, $11.8B 백로그)      │
└──────────────────────────────────────────────┘
                    │
                    │ 일부 수입
                    ▼
┌──────────────────────────────────────────────┐
│  국내 1위: 도담시스템스 (95% 점유)            │
│  - T-50, KF-21 Level D                       │
│  - 80명, 사천 본사                            │
└──────────────────────────────────────────────┘
                    │
                    │ 협력
                    ▼
┌──────────────────────────────────────────────┐
│  OEM: KAI (KF-21, T-50, FA-50, KUH-1)        │
│  + 에픽게임즈 코리아 (UE5 VR 시뮬)             │
│  + 한화시스템 (AESA)                          │
│  + 한화에어로 (엔진)                          │
└──────────────────────────────────────────────┘
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
┌─────────────┐         ┌────────────────┐
│ 방산 무인기 │         │ UAM eVTOL      │
│ - LIG Nex1  │         │ - 슈퍼널        │
│ - 니어스랩  │         │ - Plana         │
│ - 파블로항공│         │                │
│ - DMI (수소)│         │                │
└─────────────┘         └────────────────┘
                                │
                                ▼
                    ┌────────────────────┐
                    │ R&D + 학계         │
                    │ - KARI (UTM)       │
                    │ - ADD (자율)       │
                    │ - KAIST (PIBOT)    │
                    │ - 서울대           │
                    └────────────────────┘
```

## 5-1. 우리 프로젝트의 진짜 fit

**도담/CAE 같은 풀-플라이트 시뮬은 직접 경쟁 불가능.** 하지만 다음 시장은 비어 있거나 약하다:

### A. 시각화 어댑터 (HITL Bridge)

- LIG/ADD/KARI/대학이 **MATLAB/Simulink/LabVIEW로 만든 비행 알고리즘**을 빠르게 시연하고 싶을 때
- 자체 시뮬 부서 없는 회사 (니어스랩, 파블로항공, DMI) 가 **고객/투자자에게 화면을 보여줄 때**
- 우리 HITL 채널이 정확히 이 갭

### B. 멀티-vehicle 군집 시각화

- ADD/LIG/니어스랩의 **AI 군집 무인기** 알고리즘을 100대 동시 시각화하는 도구가 부족
- 우리 멀티플레이어 + AI 트래픽 조합이 베이스
- 우리 tests/scenarios.test.mjs 같은 시나리오 검증 도구도 가치 있음

### C. UAM 데모 / 마케팅 도구

- 슈퍼널/Plana가 투자자/규제기관 데모할 때 **웹 한 줄 URL**로 보여줄 수 있는 시뮬레이터 부족
- 우리 프로젝트의 "단일 HTML, 즉시 실행"이 정확한 솔루션

### D. 학습 / 교육

- KAIST/서울대 학생들이 PX4/MAVLink/MAVLink 표준을 배울 때 우리 코드 = 깔끔한 reference

## 5-2. 비즈니스 모델 (사용자가 사업적으로 검토할 때)

| 고객 | 가치 제안 | 가격대 |
|---|---|---|
| 드론 스타트업 (니어스랩급) | 알고리즘 시연 + 마케팅 | 월 $500-2000 |
| UAM 회사 (Plana급) | 투자자 데모 + 규제 demo | 월 $2000-5000 |
| 대학 연구실 | PX4/MAVLink 학습 도구 | 무료 (open source) |
| KARI/ADD | 시각화 어댑터 + 통합 컨설팅 | 프로젝트 단위 ₩5천만-₩5억 |
| 게임/엔터 | flight-sim 라이브러리 | 라이선스 |

**참고**: 도담시스템스가 시뮬레이터 한 대 ~₩100-200억 수주하는 시장에서, 우리는 그 100분의 1 ~ 1000분의 1 가격대의 보완재로 자리 잡는 그림이 현실적.

---

# 6. 결론 — 보고서 한 줄 요약

> **국내 비행 시뮬 산업의 진짜 1위는 도담시스템스 (95%)지만, 그들이 다루지 않는 "웹 기반 시각화 + HITL 어댑터" 시장은 비어 있다. 한국 UAM/드론/방산 R&D 진영이 빠르게 자라면서 (슈퍼널 FAA 인증, 니어스랩 세계 100대, KAI Epic Games MOU) 그 보완재 수요는 늘고 있다. 우리 프로젝트는 이 갭을 정확히 겨냥할 수 있다.**

---

# 부록 A — 출처 일괄 (참고용)

## 한국

- [KAI 한국항공우주산업주식회사 공식](https://www.koreaaero.com/)
- [Korea IT Times - KAI Epic Games MOU](https://www.koreaittimes.com/news/articleView.html?idxno=119885)
- [Unreal Engine - KAI's Next-Gen Simulation](https://www.unrealengine.com/developer-interviews/introducing-kai-s-next-gen-simulation-ecosystem-powered-by-unreal-engine)
- [Korea Herald - KAI W2.4tr KF-21 deal](https://www.koreaherald.com/article/10519467)
- [디펜스투데이 - KF-21 시뮬레이터 공개](https://www.defensetoday.kr/news/articleView.html?idxno=3198)
- [테크월드뉴스 - 도담시스템스 도약](http://www.epnc.co.kr/news/articleView.html?idxno=45083)
- [다음뉴스 - KF-21 시뮬레이터 르포 (2025.04)](https://v.daum.net/v/20250417082733505)
- [한화그룹 - KF-21 엔진 전량 공급](https://www.hanwha.co.kr/newsroom/media_center/news/news_view.do?seq=14239)
- [한화시스템 - 차세대 한국형 전투기](https://www.hanwhasystems.com/kr/business/defense/space/avonics01.do)
- [LIG Nex1 항공전자·드론](https://www.lignex1.com/business/avncDrnList.do)
- [비즈한국 - ADD/LIG넥스원 AI 군집 무인기](https://www.bizhankook.com/bk/article/31593)
- [The Guru - 슈퍼널 FAA eVTOL 인증](https://www.theguru.co.kr/news/article.html?no=76575)
- [EBN - 슈퍼널 조직 재정비](https://www.ebn.co.kr/news/articleView.html?idxno=1692193)
- [DroneLife - PLANA VONAER 20대](https://dronelife.com/2025/09/23/plana-secures-pre-order-for-20-hybrid-evtol-aircraft-from-vonaer/)
- [Autoevolution - Plana hybrid eVTOL US](https://www.autoevolution.com/news/south-korean-plana-aero-is-bringing-its-hybrid-evtol-to-the-us-211434.html)
- [두산모빌리티이노베이션 공식](https://www.doosanmobility.com/kr)
- [ZDNet - DMI 수소 주도권](https://zdnet.co.kr/view/?no=20250307154828)
- [유니콘팩토리 - 니어스랩 IPO](https://www.unicornfactory.co.kr/article/2025071614490772672)
- [E데일리 - 니어스랩 자율비행](https://m.edaily.co.kr/amp/read?newsId=04982326642074784&mediaCodeNo=257)
- [AI타임스 - 파블로항공 DSK 국방 드론](https://www.aitimes.com/news/articleView.html?idxno=168226)
- [KARI 드론교통관리시스템](https://www.kari.re.kr/kor/contents/20)
- [정책브리핑 - ADD 무인기 자율화](https://www.korea.kr/news/pressReleaseView.do?newsId=156451254)
- [KAIST 무인시스템 및 제어 연구실](https://unmanned.kaist.ac.kr/)

## 글로벌

- [Wikipedia - Microsoft Flight Simulator 2024](https://en.wikipedia.org/wiki/Microsoft_Flight_Simulator_2024)
- [Wikipedia - Asobo Studio](https://en.wikipedia.org/wiki/Asobo_Studio)
- [Wikipedia - CAE Inc.](https://en.wikipedia.org/wiki/CAE_Inc.)
- [CAE 공식 - Prodigy game engine Level D](https://www.cae.com/media-centre/press-releases/first-full-flight-simulator-with-gaming-engine-powered-cae-prodigy-image-generator-achieves-level-d-qualification)
- [Shephard Media - CAE/L3Harris](https://www.shephardmedia.com/news/training-simulation/cae-completes-deal-l3harris-technologies/)
- [PR Newswire - CAE acquires L3Harris $1.05B](https://www.prnewswire.com/news-releases/cae-to-acquire-l3harris-technologies-military-training-business-for-us1-05-billion-301237025.html)
- [Mordor - Civil Aviation Flight Training Market](https://www.mordorintelligence.com/industry-reports/global-civil-aviation-flight-training-and-simulation-market-industry)
- [Fortune Business Insights - Flight Simulator Market](https://www.fortunebusinessinsights.com/flight-simulator-market-102592)
- [PX4 Documentation - Simulation](https://docs.px4.io/main/en/simulation/)
- [GovStateU OPUS - ArduPilot vs AirSim (2025)](https://opus.govst.edu/research_day/2025/wed/13/)

---

*본 보고서는 2026.04.28 기준 공개 자료를 종합. 시장 수치는 출처별로 차이가 있어 범위로 표기. 회사 내부 사정/매출 디테일은 공시·보도 기반. 비공개 R&D 프로젝트는 포함하지 않음.*
