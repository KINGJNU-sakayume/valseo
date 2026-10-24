// 패시브·티어·개조를 반영한 실효 수치. 모든 시스템과 UI가 여기서 읽는다.
import { PLAYER } from '../data/balance.js';
import { PASSIVES } from '../data/passives.js';
import { GUNS, TIERS, GUN_MODS } from '../data/guns.js';

const BASE = {
  maxHp: PLAYER.maxHp,
  moveSpeed: PLAYER.speed,
  magnetRadius: PLAYER.magnetRadius,
};

/** 패시브 stacks 를 덮어써서 계산할 수 있다 (카드 설명의 before → after 용). */
export function playerStat(player, key, stacks = player.passives[key] ?? 0) {
  return BASE[key] * (1 + stacks * PASSIVES[key].perStack);
}

export const maxHp = (player) => playerStat(player, 'maxHp');

function modValue(base, key, stacks) {
  const m = GUN_MODS[key];
  return m.kind === 'pct' ? base * stacks * m.perStack : stacks * m.perStack;
}

/** 총 슬롯의 실효 수치. override 로 tier/mods 를 바꿔 미리보기할 수 있다. */
export function gunStats(slot, override = {}) {
  const g = GUNS[slot.id];
  const tier = override.tier ?? slot.tier;
  const mods = override.mods ?? slot.mods;
  const t = tier - 1;
  const stack = (k) => mods[k] ?? 0;
  return {
    damage: g.damage * TIERS.damageMult[t],
    fireRate: g.fireRate * (1 + TIERS.fireRateBonus[t]) + modValue(g.fireRate, 'fireRate', stack('fireRate')),
    bulletSpeed: g.bulletSpeed + modValue(g.bulletSpeed, 'bulletSpeed', stack('bulletSpeed')),
    pierce: g.pierce + modValue(g.pierce, 'pierce', stack('pierce')),
    critChance: g.critChance + modValue(g.critChance, 'critChance', stack('critChance')),
    bulletRadius: g.bulletRadius,
  };
}
