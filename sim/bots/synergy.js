// synergy 봇 (설계 16장): 전투는 greedy 와 같고(autopilot), 레벨업·보상 카드는 보유 태그와 겹치는 것을 우선한다.
// --archetype <태그> 를 주면 그 태그 카드를 최우선 (아키타입별 승률 측정용).
import { choose as greedyChoose } from './greedy.js';
import { cardTags } from '../../src/core/systems/tactics.js';

export { decide } from '../../src/core/autopilot.js';

const TYPE_RANK = { skill: 0, synth: 0, tactic: 1, gunMod: 2, passive: 3, heal: 4 };

export function choose(state, opts = {}) {
  const pending = state.pending;
  if (pending.kind !== 'levelup' && pending.kind !== 'reward') return greedyChoose(state, opts);
  const o = pending.options;
  const score = (c) => {
    const tags = cardTags(state, c);
    const arch = opts.archetype && tags.includes(opts.archetype) ? 10 : 0;
    // 스킬 해금은 늘 중요하다: 잠긴 스킬이면 크게 가산
    const unlock = c.type === 'skill' && state.player.skills[c.key].level === 0 ? 6 : 0;
    return arch + unlock + (c.synergy ?? 0) * 2 - (TYPE_RANK[c.type] ?? 5) * 0.5;
  };
  let best = 0;
  o.forEach((c, i) => {
    if (score(c) > score(o[best])) best = i;
  });
  return best;
}
