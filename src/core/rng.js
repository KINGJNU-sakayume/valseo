// mulberry32 시드 RNG. 상태는 숫자 하나({ s })라 state 안에 그대로 직렬화된다.

export function createRng(seed) {
  return { s: seed >>> 0 };
}

/** mulberry32: [0, 1) 실수를 반환하고 rng.s 를 전진시킨다. */
export function nextFloat(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(rng, a, b) {
  return a + (b - a) * nextFloat(rng);
}

/** 시드 하나로 만든 독립 함수형 생성기 (테스트·도구용). */
export function mulberry32(seed) {
  const rng = createRng(seed);
  return () => nextFloat(rng);
}
