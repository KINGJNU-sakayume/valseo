# 집중포화 (CROSSFIRE)

체임버 모티브의 뱀서류 트윈스틱 슈터. 설계: [docs/crossfire-design.md](docs/crossfire-design.md)

현재 진행: **M1 뼈대** (이동, 마우스 조준, 클래식 자동 발사, 추격형 적).

## 실행

ES modules라 `file://`로는 열리지 않으니 로컬 서버가 필요합니다.

```sh
npm run serve        # = python3 -m http.server 8000
# 브라우저에서 http://localhost:8000  (시드 고정: ?seed=42)
```

조작: WASD 이동 · 마우스 조준 (발사는 자동) · 패배 후 R로 재시작

## 테스트

```sh
npm test             # = node --test tests/*.test.js
```

- `tests/core.test.js`: core를 Node에서 실행, RNG/결정성/처치/패배/공간 해시
- `tests/purity.test.js`: `src/core`, `src/data`에 `Math.random`·`Date.now`·DOM 사용 금지 검사

## GitHub Actions

| 워크플로 | 트리거 | 내용 |
|---|---|---|
| `test.yml` | 모든 push / PR / 수동 | `npm test` |
| `pages.yml` | `main` push / 수동 | 테스트 → `index.html` + `src/`만 묶어 GitHub Pages 배포 |

Pages를 처음 쓸 때는 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 바꿔야 합니다.
`balance.yml`은 시뮬레이터(M7)가 생기면 M8에서 추가합니다.
