// 우주 장벽 (아스트라 궁극기, 설계 28장): 두 점을 지나는 직선이 맵을 두 세계로 나눈다.
// 플레이어와 다른 쪽에 있는 적은 플레이어를 볼 수 없고(헤맨다), 벽을 넘는 탄은 사라진다.
// 다른 시스템을 import 하지 않는다 (적·탄·자동 조준이 모두 이 판정을 쓴다).

/** 직선의 어느 쪽인가 (1 또는 -1). 선 위는 1. */
export function sideOf(d, x, y) {
  return Math.sign((d.bx - d.ax) * (y - d.ay) - (d.by - d.ay) * (x - d.ax)) || 1;
}

/** (x, y) 가 플레이어와 다른 세계인가. 장벽이 없으면 false. */
export function apart(state, x, y) {
  const d = state.divide;
  if (!d) return false;
  const p = state.player;
  return sideOf(d, x, y) !== sideOf(d, p.x, p.y);
}

/** 이번 틱에 (x0, y0) → (x1, y1) 로 움직인 탄이 장벽을 넘었는가. */
export function crosses(state, x0, y0, x1, y1) {
  const d = state.divide;
  return !!d && sideOf(d, x0, y0) !== sideOf(d, x1, y1);
}
