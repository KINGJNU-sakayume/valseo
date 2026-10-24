import { DT, WORLD, BULLET } from '../../data/balance.js';
import { nextFloat } from '../rng.js';
import { gunStats } from '../stats.js';
import { GUNS } from '../../data/guns.js';
import { inField } from './fields.js';

const PRIMARY = 0;

export function updateWeapons(state) {
  const p = state.player;
  if (p.rush > 0) p.rush = Math.max(0, p.rush - DT);
  p.guns.forEach((slot, i) => {
    if (!slot) return;
    const gun = gunStats(slot);
    const ev = slot.evolved ? GUNS[slot.id].evolution : null;
    if (ev?.fireRateBonus && p.rush > 0) gun.fireRate *= 1 + ev.fireRateBonus; // 급습 밴달
    slot.cooldown -= DT;
    if (i === PRIMARY && p.precision) {
      slot.cooldown = Math.max(0, slot.cooldown); // 정조준 중에는 주무기 대신 권총
      return;
    }
    while (slot.cooldown <= 0) {
      slot.cooldown += 1 / gun.fireRate;
      if (ev?.burst && inField(state, p.aimX, p.aimY)) {
        // 삼연격 클래식: 조준점이 감속 필드 안이면 부채꼴 3발
        for (let k = 0; k < ev.burst; k++) fireBullet(state, gun, slot.id, false, (k - (ev.burst - 1) / 2) * ev.spread);
      } else {
        fireBullet(state, gun, slot.id);
      }
    }
  });
}

/** 조준 방향으로 투사체 1발. 크리티컬 배율은 명중 시 적용한다 (집중포화 판정과 함께). */
export function fireBullet(state, gun, source, forceCrit = false, angleOffset = 0) {
  if (state.bullets.length >= BULLET.maxBullets) return;
  const p = state.player;
  const cos = Math.cos(p.aim + angleOffset);
  const sin = Math.sin(p.aim + angleOffset);
  const crit = forceCrit || (gun.critChance > 0 && nextFloat(state.rng) < gun.critChance);
  state.bullets.push({
    x: p.x + cos * p.r,
    y: p.y + sin * p.r,
    vx: cos * gun.bulletSpeed,
    vy: sin * gun.bulletSpeed,
    r: gun.bulletRadius,
    damage: gun.damage,
    crit,
    life: BULLET.lifetime,
    pierce: gun.pierce,
    hitIds: [],
    source,
  });
  state.events.push({ type: 'shot', source });
}

export function updateBullets(state) {
  const bullets = state.bullets;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.life -= DT;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height) {
      removeAt(bullets, i);
    }
  }
}

/** 순서를 신경 쓰지 않는 O(1) 제거. */
export function removeAt(arr, i) {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
}
