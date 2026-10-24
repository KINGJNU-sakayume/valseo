import { DT } from '../../data/balance.js';
import { removeAt } from './weapons.js';

// 감속 필드: 트레이드마크 발동, 투르 드 포스 처치 폭발이 만든다.

export function addField(state, x, y, r, duration, slow) {
  state.fields.push({ x, y, r, life: duration, maxLife: duration, slow });
}

export function updateFields(state) {
  for (let i = state.fields.length - 1; i >= 0; i--) {
    const f = state.fields[i];
    f.life -= DT;
    if (f.life <= 0) removeAt(state.fields, i);
  }
}

/** (x, y)에 걸린 가장 강한 감속 (필드는 중첩되지 않음). */
export function fieldSlow(state, x, y) {
  let slow = 0;
  for (const f of state.fields) {
    if ((x - f.x) ** 2 + (y - f.y) ** 2 <= f.r * f.r && f.slow > slow) slow = f.slow;
  }
  return slow;
}

/** 집중포화 판정: 감속 필드 안에 있는가. */
export function inField(state, x, y) {
  return state.fields.some((f) => (x - f.x) ** 2 + (y - f.y) ** 2 <= f.r * f.r);
}
