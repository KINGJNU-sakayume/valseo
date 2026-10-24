# 집중포화 (CROSSFIRE)

체임버 모티브의 뱀서류 트윈스틱 슈터. 설계: [docs/crossfire-design.md](docs/crossfire-design.md)

현재 진행: **M1~M6** — 이동·조준·자동 발사, XP 레벨업(스킬·패시브·총기 개조), 12라운드, 크레딧과 구매 페이즈, 스킬 4종(C/E/Q/X)과 감속 필드·집중포화, 적 3종(추격·돌격·원거리) + 엘리트(3·6·9R), 스킬 3레벨 분기 A/B, 총기 진화.

## 실행

ES modules라 `file://`로는 열리지 않으니 로컬 서버가 필요합니다.

```sh
npm run serve        # = python3 -m http.server 8000
# 브라우저에서 http://localhost:8000  (시드 고정: ?seed=42)
```

조작: WASD 이동 · 마우스 조준 (발사는 자동) · 레벨업/상점은 클릭 또는 숫자 키, Enter = 다음 라운드 · 종료 후 R로 재시작

| 키 | 스킬 | 동작 |
|---|---|---|
| C | 트레이드마크 | 조준점에 함정 설치(충전 2). 적이 밟으면 감속 필드 |
| E | 랑데뷰 | 앵커 설치 → 다시 E로 앵커 위치 귀환 |
| Q (누르고 있기) | 헤드헌터 | 정조준: 이속 50%, 주무기 대신 크리 확정·관통 권총(탄창 8) |
| X | 투르 드 포스 | 오브 3개로 관통 저격, 처치 지점에 감속 폭발 |

**집중포화**: 감속 필드 안의 적에게 들어가는 모든 피해는 크리티컬. C는 처음부터 보유, E/Q/X는 레벨업 카드로 해금.
스킬이 Lv3이 되면 분기 A/B 중 하나를 고른다.

**진화** (총 티어 3 + 스킬 Lv3 달성 즉시)

| 총 | 조건 | 진화형 |
|---|---|---|
| 클래식 | 트레이드마크 Lv3 | 삼연격 클래식: 조준점이 감속 필드 안이면 3점사 |
| 셰리프 | 헤드헌터 Lv3 | 집행자 셰리프: 크리티컬 6연속 명중 시 즉시 재장전 |
| 밴달 | 랑데뷰 Lv3 | 급습 밴달: 귀환 후 3초간 연사 +50% |

## 테스트

```sh
npm test             # = node --test tests/*.test.js
```

- `tests/core.test.js`: core를 Node에서 실행, RNG/결정성/처치/패배/공간 해시
- `tests/progression.test.js`: 수식, 레벨업 pending, 라운드 전환, 상점, 실드
- `tests/skills.test.js`: C/E/Q/X, 감속, 집중포화, 오브, 라운드 정리
- `tests/enemies.test.js`: 라운드 구성, 스폰 예산, 돌격/원거리/엘리트 AI, 적 투사체
- `tests/evolution.test.js`: 분기 선택 흐름, 분기 8종 효과, 진화 조건과 진화 효과 3종
- `tests/purity.test.js`: `src/core`, `src/data`에 `Math.random`·`Date.now`·DOM 사용 금지 검사

## GitHub Actions

| 워크플로 | 트리거 | 내용 |
|---|---|---|
| `test.yml` | 모든 push / PR / 수동 | `npm test` |
| `pages.yml` | `main` push / 수동 | 테스트 → `index.html` + `src/`만 묶어 GitHub Pages 배포 |

Pages를 처음 쓸 때는 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 바꿔야 합니다.
`balance.yml`은 시뮬레이터(M7)가 생기면 M8에서 추가합니다.
