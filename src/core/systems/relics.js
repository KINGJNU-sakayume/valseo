// 유물 (설계 v0.2 10장): 보유 판정·선택지·획득과 피해 배율 훅.
// 다른 시스템 쪽 훅: stats(최대 HP·이속·총기), combat(피해), player(받는 피해), skillutil(쿨다운·궁극기 비용),
// rounds(이자·회복), economy(가격·유틸 슬롯), skills(처치 회복), agents(설치물 개수).
import { RELICS, RELIC, RELIC_IDS } from '../../data/relics.js';
import { SOURCE_TAGS } from '../../data/tags.js';
import { nextFloat } from '../rng.js';
import { SLOTS } from '../../data/guns.js';

export const hasRelic = (p, id) => !!p.relics?.includes(id);
/** 보유 중이면 유물 데이터, 아니면 null. */
export const relicOf = (p, id) => (hasRelic(p, id) ? RELICS[id] : null);

/** 유물이 주는 피해 배율 (크리 여부·출처·표식). 없으면 정확히 1. */
export function relicDamageMult(state, e, source, isCrit) {
  const p = state.player;
  if (!p.relics?.length) return 1;
  let m = 1;
  if (isCrit && hasRelic(p, 'glassCannon')) m *= RELICS.glassCannon.critMult;
  if (hasRelic(p, 'architect') && (SOURCE_TAGS[source] ?? []).includes('gun')) m *= RELICS.architect.gunDamageMult;
  if (hasRelic(p, 'eliteTrophy')) m *= 1 + RELICS.eliteTrophy.perElite * (state.stats.eliteKills ?? 0);
  if (hasRelic(p, 'radiantHeart') && source === 'ult') m *= RELICS.radiantHeart.ultDamageMult;
  if (hasRelic(p, 'crackedLens')) m *= e.mark > 0 ? RELICS.crackedLens.markedMult : RELICS.crackedLens.unmarkedMult;
  return m;
}

/** 유물 선택지: 아직 없는 유물 중 무작위 n 개 (시드 난수). */
export function relicOptions(state, n = RELIC.choices) {
  const pool = RELIC_IDS.filter((id) => !hasRelic(state.player, id));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(nextFloat(state.rng) * pool.length), 1)[0]);
  return out.map((id) => ({ relic: id, title: RELICS[id].name, desc: RELICS[id].desc, tags: RELICS[id].tags }));
}

/** 유물 획득: 즉시 효과가 있는 유물 처리. */
export function gainRelic(state, id) {
  const p = state.player;
  if (hasRelic(p, id)) return;
  (p.relics ??= []).push(id);
  if (id === 'pistolMaster') p.guns[SLOTS.primary.index] = null; // 주무기 슬롯 봉인
  state.events.push({ type: 'relic', relic: id });
}
