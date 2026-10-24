import { DT } from '../../data/balance.js';
import { removeAt } from './weapons.js';

// 감속 필드: 트레이드마크 발동, 투르 드 포스 처치 폭발이 만든다.

/** stack: 장기형 트레이드마크 필드. 겹치면 감속이 곱으로 누적된다. */
export function addField(state, x, y, r, duration, slow, stack = false) {
  state.fields.push({ x, y, r, life: duration, maxLife: duration, slow, stack });
}

export function updateFields(state) {
  for (let i = state.fields.length - 1; i >= 0; i--) {
    const f = state.fields[i];
    f.life -= DT;
    if (f.life <= 0) removeAt(state.fields, i);
  }
}

/**
 * (x, y)의 감속률. 일반 필드는 가장 강한 하나만, 중첩 필드는 곱으로 누적:
 * slow = 1 − (1 − 최대 일반 감속) × Π(1 − 중첩 감속)
 */
export function fieldSlow(state, x, y) {
  let best = 0;
  let keep = 1;
  for (const f of state.fields) {
    if ((x - f.x) ** 2 + (y - f.y) ** 2 > f.r * f.r) continue;
    if (f.stack) keep *= 1 - f.slow;
    else if (f.slow > best) best = f.slow;
  }
  return 1 - (1 - best) * keep;
}

/** 집중포화 판정: 감속 필드 안에 있는가. */
export function inField(state, x, y) {
  return state.fields.some((f) => (x - f.x) ** 2 + (y - f.y) ** 2 <= f.r * f.r);
}
