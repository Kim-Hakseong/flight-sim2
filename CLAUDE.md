# CLAUDE.md — Project Constitution & Operating Manual

> Claude Code가 매 작업 시작 시 **첫 번째로** 읽는 문서.
> PRD.md와 충돌 시 **PRD.md가 항상 우선**.

## 0. 헌법 (Constitution)

1. **사용자에게 묻지 마라.** 모호하면 PRD/CLAUDE/Log의 마지막 결정에서 단서를 찾는다. 그래도 모호하면 "가장 단순한 동작하는 옵션"을 선택하고 Log.md에 결정 근거를 1줄 남긴다.
2. **테스트 없이 머지하지 마라.** 모든 물리 함수는 unit test로 검증. UI 변경은 콘솔 에러 0 + scene graph 노드 카운트로 검증.
3. **한 번의 루프 = 한 가지 의미 있는 산출물.** Log.md의 마지막 항목이 RED/WIP면 그 작업만 끝내라. 새 일을 시작하지 마라.
4. **로그 없으면 작업 안 한 것.** 매 루프 끝에 Log.md 에 append. 형식 고정 (§5).
5. **외부 의존성 추가는 PRD에 없으면 금지.** 추가가 꼭 필요하면 PRD.md를 먼저 수정.

## 1. 디렉토리 구조 (목표)

```
flight-sim/
├── PRD.md                  # 요구사항
├── CLAUDE.md               # 이 파일
├── Log.md                  # 작업 로그 (append-only)
├── PROMPT_ralph.md         # Ralph 루프 프롬프트
├── README.md               # 사용자용 (Claude Code가 생성)
├── index.html              # 진입점 (Claude Code가 생성)
├── package.json            # test 스크립트만
├── src/
│   ├── main.js             # 부트스트랩
│   ├── world.js            # 지면, 활주로, 빌딩, 산
│   ├── aircraft.js         # 항공기 3D 모델
│   ├── physics.js          # 비행 동역학 (순수 함수 위주)
│   ├── controls.js         # 키보드 입력
│   ├── camera.js           # 카메라 모드
│   ├── hud.js              # HUD 갱신
│   └── egi.js              # (M5) INS/GPS 시뮬
└── tests/
    ├── physics.test.mjs    # 물리 unit tests
    └── smoke.test.mjs      # (선택) Playwright 스모크
```

## 2. 실행 / 테스트

### 로컬 실행
```bash
# 가장 단순:
open index.html

# CORS 이슈 회피용 로컬 서버 (필요 시):
python3 -m http.server 8000
# → http://localhost:8000
```

### 테스트
```bash
# 물리 unit test
npm test
# == node --test tests/

# (선택) 스모크
npx playwright test
```

### 성능 측정
- Chrome DevTools → Performance 탭 → 5초 녹화
- 평균 FPS ≥ 55 면 통과.

## 3. 코딩 컨벤션

### 언어 / 모듈
- ES Modules (`import` / `export`).
- HTML 에서는 `<script type="module" src="src/main.js"></script>` 로 로드.
- TypeScript 미사용.

### 명명
- 변수/함수: `camelCase`
- 상수: `UPPER_SNAKE_CASE` (특히 물리 상수: `AIR_DENSITY_SL`, `GRAVITY`, `STALL_AOA_RAD`)
- 파일: `kebab-case.js` 또는 단일 단어 (`physics.js`).

### 함수 스타일
- 물리 함수는 **순수 함수**(부수효과 없음). 단위 테스트 용이성 우선.
- 함수 ≤ 50줄. 넘으면 분리.
- 주석은 **왜**(why)에 집중. **무엇**(what)은 코드로 보여라.

### 좌표계 (절대 헷갈리지 마라)

Three.js 기본은 **우손계, +Y up, −Z forward**.
항공기 body frame을 이에 맞춘다:
- `+X` = 우측 날개 (right wing)
- `+Y` = 동체 위 (top)
- `−Z` = 기수 (nose forward)

**모든 물리/3D 모듈 상단에 이 주석을 박아라:**
```js
// COORDINATE: Three.js right-handed, +Y up, -Z forward.
// Body frame: +X right wing, +Y top, -Z nose.
```

각도 부호 규약:
- 피치 업 (기수 올림) = `+`
- 롤 우 (오른쪽 날개 내림) = `+`
- 요 우 (기수 오른쪽으로) = `+`

## 4. 작업 규율 (TDD-lite)

### 새 물리 함수 추가
1. `tests/physics.test.mjs` 에 케이스 먼저.
2. `node --test tests/` → 빨간불 확인.
3. `src/physics.js` 에 구현.
4. 다시 실행 → 초록불.
5. Log.md 에 GREEN + 테스트 케이스 수.

### UI / 3D 변경
1. 변경 전 상태 한 줄 기록.
2. 변경 후:
   - 콘솔 에러 0 (가능하면 자동 체크).
   - `console.log(scene.children.length)` 같은 한 줄 검증.
   - 사용자가 Mac Mini에서 확인할 메모를 Log.md "Notes"에 기록.
3. Log.md 업데이트.

### 커밋 (git 사용 가능 시)
```
M{n}: <한 줄 요약>

- <변경 1>
- <변경 2>

Tests: <PASS/FAIL/N-A>
Refs: PRD §{번호}
```

## 5. Log.md 형식 (고정 — 이탈 금지)

매 Ralph 루프 끝에 **반드시** append:

```markdown
## YYYY-MM-DD HH:MM — M{n}: <task name>

**Status**: GREEN | RED | WIP
**Files changed**: src/physics.js, tests/physics.test.mjs
**Tests**: 3 added, 12 passing, 0 failing
**Decisions**:
- <명시적 의사결정 1줄>
**Next**:
- <다음 루프에서 할 일>
**Notes**:
- <기타 컨텍스트, 사용자가 확인할 항목>
```

## 6. Superpowers 스킬 매핑

| 상황 | Skill | 호출 |
|---|---|---|
| 마일스톤이 복잡 (3+ subtask) | planning / writing-plans | `/skill writing-plans` |
| 요구가 모호 | brainstorming | `/skill brainstorming` |
| 새 물리 함수 작성 | test-driven-development | `/skill test-driven-development` |
| 버그 발견 | root-cause-analysis | `/skill root-cause-analysis` |
| 마일스톤 병렬 진행 필요 | using-git-worktrees | `/skill using-git-worktrees` |
| 새 스킬이 필요 | skills-creating-and-editing | `/skill skills-creating-and-editing` |

스킬 목록 모르면 `/skills` 로 확인.

## 7. 자율성 / 보고 정책

### Claude Code가 **자율 결정** (보고 불필요)
- 함수 시그니처, 변수명
- 파일/모듈 분리
- 테스트 케이스 추가
- README/주석 작성
- 사소한 리팩토링
- 색상, 폰트, HUD 레이아웃 (PRD에 명시 없으면 군용 HUD 풍으로 통일)

### Claude Code가 **Log.md 기록 후 진행**
- 외부 라이브러리 추가 (PRD에 없는 경우 — 단, NF2 위반이므로 매우 신중)
- 마일스톤 순서 변경
- 큰 폴더 구조 변경

### Claude Code가 **사용자에게 물어야** 하는 경우 (드물게)
- PRD.md 자체에 모순이 있어 결정 불가
- 외부 결제/계정/인증 필요 (이번 프로젝트는 해당 없음)
- 같은 작업 3루프 연속 RED (무한루프 방지)

**원칙**: 막혀서 멈추는 것보다, 합리적 가정으로 전진하고 Log에 남기는 것이 낫다.

## 8. 절대 금지

- ❌ Unity, Unreal, native 데스크톱 빌드
- ❌ npm install로 1MB+ 추가 (3D 라이브러리 외)
- ❌ 사용자 인증, 서버 통신 (이번 사이클)
- ❌ Log.md 미기록 후 다음 작업 진행
- ❌ 테스트 없는 물리 함수 머지
- ❌ "TODO: 나중에" 주석 → PRD §10 "후속 확장" 으로 이동

## 9. 의존성 정책

| 라이브러리 | 사용 | 출처 | 비고 |
|---|---|---|---|
| Three.js | r128 | https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js | CDN 고정 |
| node:test | Node 20+ 내장 | — | 별도 설치 불필요 |
| Playwright | dev only, 선택 | npm | 무거우면 manual 체크리스트로 대체 |

추가가 꼭 필요하면 **PRD.md §6 먼저 수정**.

## 10. 디버깅 체크리스트

비행이 이상할 때 **이 순서로** 확인:

1. **콘솔 에러** — `Cannot read properties of undefined` → import/초기화 순서.
2. **좌표계 부호** — 피치/롤이 반대 → §3 좌표계 주석으로 회귀.
3. **단위** — m vs km, rad vs deg, kg vs g.
4. **dt** — `requestAnimationFrame` dt가 16.67ms 근처인지. 탭 비활성 시 폭주 방지: `dt = Math.min(dt, 0.1)`.
5. **NaN 검사** — `physics.js` 핵심 출력에 `if (!isFinite(x)) console.error(...)`.
6. **물리 ↔ HUD 일치** — HUD가 거짓말하면 디버깅 불가능.

## 11. 성능 가이드

- 빌딩 50개+ → `InstancedMesh` 로 묶기 검토 (M3 이후).
- 그림자: M4까지 OFF. 이후 토글로 추가.
- AA: `WebGLRenderer({ antialias: true })` 기본. FPS 떨어지면 OFF.
- 카메라 far plane: 20000 이하.
- `setPixelRatio(Math.min(window.devicePixelRatio, 2))` 로 고DPI 폭주 방지.

---

이 문서를 다 읽었다면, 다음으로 **PROMPT_ralph.md** 를 읽고 한 번의 루프를 실행하라.
