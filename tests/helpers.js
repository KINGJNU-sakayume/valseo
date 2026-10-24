import { step, choose } from '../src/core/game.js';

/** 가장 가까운 적을 조준하고 moveAt(tick)으로 움직이는 간단한 입력. */
export function botInput(state, moveAt) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return {
    move: moveAt(state.tick),
    aim: best ? { x: best.x, y: best.y } : { x: p.x + 1, y: p.y },
    keys: { c: false, q: false, e: false, x: false },
  };
}

export const circleMove = (t) => {
  const phase = Math.floor(t / 90) % 4;
  return [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }][phase];
};

/** 레벨업은 첫 카드, 상점은 살 수 있는 첫 항목을 사고 더 없으면 다음 라운드. */
export function autoChoose(state) {
  const pending = state.pending;
  if (pending.kind === 'levelup') return choose(state, 0);
  const o = pending.options;
  const i = o.findIndex((x) => x.enabled && x.kind !== 'next');
  return choose(state, i >= 0 ? i : o.findIndex((x) => x.kind === 'next'));
}

/** maxTicks 틱(선택은 자동 처리) 또는 게임 종료까지 진행. */
export function run(state, maxTicks, moveAt = circleMove) {
  while (state.tick < maxTicks && (state.phase === 'COMBAT' || state.phase === 'BUY')) {
    if (state.pending) autoChoose(state);
    else step(state, botInput(state, moveAt));
  }
  return state;
}
