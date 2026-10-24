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
