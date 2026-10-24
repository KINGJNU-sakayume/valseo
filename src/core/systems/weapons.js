import { DT, WORLD, BULLET } from '../../data/balance.js';
import { GUNS } from '../../data/guns.js';

export function updateWeapons(state) {
  const p = state.player;
  for (const slot of p.guns) {
    if (!slot) continue;
    const gun = GUNS[slot.id];
    slot.cooldown -= DT;
    while (slot.cooldown <= 0) {
      slot.cooldown += 1 / gun.fireRate;
      fire(state, gun, slot.id);
    }
  }
}

function fire(state, gun, gunId) {
  if (state.bullets.length >= BULLET.maxBullets) return;
  const p = state.player;
  const cos = Math.cos(p.aim);
  const sin = Math.sin(p.aim);
  state.bullets.push({
    x: p.x + cos * p.r,
    y: p.y + sin * p.r,
    vx: cos * gun.bulletSpeed,
    vy: sin * gun.bulletSpeed,
    r: gun.bulletRadius,
    damage: gun.damage,
    life: BULLET.lifetime,
    pierce: gun.pierce,
    hitIds: [],
  });
  state.events.push({ type: 'shot', gun: gunId });
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
