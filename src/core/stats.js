// 패시브·티어·개조를 반영한 실효 수치. 모든 시스템과 UI가 여기서 읽는다.
import { RELICS } from '../data/relics.js';
import { PLAYER, BULLET } from '../data/balance.js';
import { PASSIVES } from '../data/passives.js';
import { GUNS, TIERS, GUN_MODS } from '../data/guns.js';

const BASE = {
  maxHp: PLAYER.maxHp,
  moveSpeed: PLAYER.speed,
  magnetRadius: PLAYER.magnetRadius,
};

/** 패시브 stacks 를 덮어써서 계산할 수 있다 (카드 설명의 before → after 용). */
export function playerStat(player, key, stacks = player.passives[key] ?? 0) {
  const v = BASE[key] * (1 + stacks * PASSIVES[key].perStack);
  return player.relics?.length ? v * relicStatMult(player, key) : v;
}

/** 유물의 능력치 배율: 유리 대포(최대 HP), 무거운 손(이속). */
function relicStatMult(player, key) {
  if (key === 'maxHp' && player.relics.includes('glassCannon')) return RELICS.glassCannon.hpMult;
  if (key === 'moveSpeed' && player.relics.includes('heavyHand')) return RELICS.heavyHand.speedMult;
  return 1;
}

export const maxHp = (player) => playerStat(player, 'maxHp');

/** 패시브 효과량 = stacks × perStack (중첩이 없으면 정확히 0). */
export function passiveAdd(player, key, stacks = player.passives[key] ?? 0) {
  return stacks ? stacks * PASSIVES[key].perStack : 0;
}

/** 1 + 효과량 (중첩이 없으면 정확히 1이라 곱해도 부동소수 결과가 바뀌지 않는다). */
export const passiveMult = (player, key) => 1 + passiveAdd(player, key);

/** 피격 후 무적 시간. */
export const invulnTime = (player) => PLAYER.invulnTime + passiveAdd(player, 'invuln');

function modValue(base, key, stacks) {
  const m = GUN_MODS[key];
  return m.kind === 'pct' ? base * stacks * m.perStack : stacks * m.perStack;
}

/** 진화 경로 데이터 (진화하지 않았으면 null). slot.evolved = 공명한 태그 */
export function evoOf(slot) {
  return slot?.evolved ? GUNS[slot.id].evolutions?.[slot.evolved] ?? null : null;
}

/** 총 슬롯의 실효 수치. override 로 tier/mods 를 바꿔 미리보기할 수 있다. */
export function gunStats(slot, override = {}, player = null) {
  const g = GUNS[slot.id];
  const pistol = player?.relics?.includes('pistolMaster') && g.slot === 'sidearm';
  const belt = player?.relics?.includes('ammoBelt');
  const tier = Math.min(TIERS.max, (override.tier ?? slot.tier) + (pistol ? RELICS.pistolMaster.tierBonus : 0));
  const mods = override.mods ?? slot.mods;
  const t = tier - 1;
  const stack = (k) => mods[k] ?? 0;
  const mag = g.magazine ? Math.round(g.magazine * (1 + stack('magazine') * GUN_MODS.magazine.perStack) * (evoOf(slot)?.magazineMult ?? 1)) : 0;
  return {
    magazine: belt ? mag * RELICS.ammoBelt.magazineMult : mag,
    reloadTime: (g.reloadTime ?? 0) * (belt ? RELICS.ammoBelt.reloadMult : 1),
    spreadStill: g.spreadStill ?? 0,
    spreadMove: g.spreadMove ?? 0,
    damage: g.damage * TIERS.damageMult[t],
    fireRate: (g.fireRate * (1 + TIERS.fireRateBonus[t]) + modValue(g.fireRate, 'fireRate', stack('fireRate'))) * (pistol ? RELICS.pistolMaster.fireRateMult : 1),
    bulletSpeed: g.bulletSpeed + modValue(g.bulletSpeed, 'bulletSpeed', stack('bulletSpeed')),
    pierce: g.pierce + modValue(g.pierce, 'pierce', stack('pierce')),
    critChance: g.critChance + modValue(g.critChance, 'critChance', stack('critChance')),
    bulletRadius: g.bulletRadius,
    pellets: g.pellets ?? 1,
    spread: g.spread ?? 0,
    lifetime: g.lifetime ?? BULLET.lifetime,
  };
}
