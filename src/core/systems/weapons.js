// 총기: 주무기 우선 발사 + 탄창·재장전 → 재장전 중엔 보조무기 (설계 v0.2 8.1), 이동 중 정확도 (8.2), 진화 효과 (8.5).
import { GUNS } from '../../data/guns.js';
import { TACTICS } from '../../data/tactics.js';
import { targetable } from './mutants.js';
import { DT, WORLD, BULLET } from '../../data/balance.js';
import { nextFloat } from '../rng.js';
import { gunStats, evoOf } from '../stats.js';
import { inField } from './fields.js';
import { fireRateMult } from './tactics.js';
import { freeGadget } from './skills.js';
import { blocked } from './map.js';

export function updateWeapons(state) {
  const p = state.player;
  if (p.rush > 0) p.rush = Math.max(0, p.rush - DT);
  const [primary, side] = p.guns;
  let primaryActive = false;
  if (primary) primaryActive = updateSlot(state, primary, !p.precision); // 정조준 중에는 주무기 대신 권총(헤드헌터)
  if (side) updateSlot(state, side, !primaryActive);
}

/** 슬롯 하나: 재장전·쿨다운·발사. 발사 가능한 상태(재장전 중이 아님)였으면 true. */
function updateSlot(state, slot, allowFire) {
  const p = state.player;
  const gun = gunStats(slot, {}, state.player);
  const ev = evoOf(slot);
  if (slot.primeCd > 0) slot.primeCd = Math.max(0, slot.primeCd - DT);
  if (slot.gadgetCd > 0) slot.gadgetCd = Math.max(0, slot.gadgetCd - DT);
  if (gun.magazine > 0) {
    if (slot.ammo == null || slot.ammo > gun.magazine) slot.ammo = Math.min(slot.ammo ?? gun.magazine, gun.magazine);
    if (slot.reload > 0) {
      slot.reload -= DT;
      slot.cooldown = Math.max(0, slot.cooldown - DT);
      if (slot.reload <= 0) {
        slot.reload = 0;
        slot.ammo = gun.magazine;
        state.events.push({ type: 'reloadDone', gun: slot.id });
      }
      return false;
    }
  }
  if (!allowFire) {
    slot.cooldown = Math.max(0, slot.cooldown - DT);
    return false;
  }
  if (ev?.fireRateBonus && p.rush > 0) gun.fireRate *= 1 + ev.fireRateBonus; // 급습 밴달
  if (ev?.runFireRate && p.stillT === 0) gun.fireRate *= 1 + ev.runFireRate; // 질주 스펙터
  if (p.runGun > 0) gun.fireRate *= fireRateMult(state); // 런앤건
  if (p.fireRateBuff > 0) gun.fireRate *= 1 + p.fireRateBuff; // 레이나 여제·흡수
  // 보조 전문가: 주무기 재장전 중 보조무기 연사
  if (p.tactics.sidearmPro && GUNS[slot.id].slot === 'sidearm' && p.guns[0]?.reload > 0) gun.fireRate *= 1 + TACTICS.sidearmPro.fireRate;
  slot.cooldown -= DT;
  while (slot.cooldown <= 0) {
    slot.cooldown += 1 / gun.fireRate;
    fireVolley(state, slot, gun, ev);
    if (gun.magazine > 0 && --slot.ammo <= 0) {
      slot.reload = gun.reloadTime * (p.reloadMult ?? 1);
      slot.cooldown = Math.max(0, slot.cooldown);
      state.events.push({ type: 'reload', gun: slot.id, time: gun.reloadTime });
      if (ev?.reloadGadget) freeGadget(state, p.x, p.y); // 공학 탄창 스펙터
      break;
    }
  }
  return true;
}

/** 한 번의 사격 (펠릿·점사·단발). 이동 중이면 탄이 퍼진다 (런앤건 중엔 정지 수준). */
function fireVolley(state, slot, gun, ev) {
  const p = state.player;
  const moving = p.stillT === 0 && !(p.runGun > 0);
  const spread = moving ? gun.spreadMove : gun.spreadStill;
  const jitter = spread > 0 ? (nextFloat(state.rng) * 2 - 1) * spread : 0;
  const extra = {};
  if (ev?.firstShot && gun.magazine > 0 && slot.ammo === gun.magazine) {
    extra.crit = true; // 원탭 밴달: 탄창 첫 발
    extra.pierce = ev.firstShot.pierce;
  }
  if (ev?.perThousand) extra.damageMult = 1 + ev.perThousand * Math.floor(state.credits / 1000); // 황금 셰리프
  // 마지막 한 발: 탄창 마지막 탄
  if (p.tactics.lastShot && gun.magazine > 0 && slot.ammo === 1) extra.damageMult = (extra.damageMult ?? 1) * TACTICS.lastShot.mult;
  // 탄피 회수: 재장전 직후 크리
  if (p.casingCrits > 0) {
    p.casingCrits--;
    extra.crit = true;
  }
  if (ev?.homing) extra.homing = ev.homing;
  if (ev?.fieldHit) slot.fieldReady = true; // 화염 저지: 이번 사격의 첫 착탄
  if (gun.pellets > 1) {
    // 산탄 (저지): 부채꼴로 펠릿을 고르게. 처형 저지는 처치 직후 한 번 펠릿 추가
    const n = gun.pellets + (slot.primed && ev?.pelletBonus ? ev.pelletBonus : 0);
    slot.primed = false;
    for (let k = 0; k < n; k++) fireBullet(state, gun, slot.id, false, (k / (n - 1) - 0.5) * gun.spread + jitter, extra);
  } else if (ev?.burst && burstZone(state, p.aimX, p.aimY)) {
    // 삼연격 클래식: 조준점이 감속 필드·장판 안이면 부채꼴 3발
    for (let k = 0; k < ev.burst; k++) fireBullet(state, gun, slot.id, false, (k - (ev.burst - 1) / 2) * ev.spread + jitter, extra);
  } else {
    fireBullet(state, gun, slot.id, false, jitter, extra);
  }
  if (ev?.hop) {
    // 반동 도약 저지: 조준 반대쪽으로 짧게
    p.x = Math.min(WORLD.width - p.r, Math.max(p.r, p.x - Math.cos(p.aim) * ev.hop.dist));
    p.y = Math.min(WORLD.height - p.r, Math.max(p.r, p.y - Math.sin(p.aim) * ev.hop.dist));
    p.invuln = Math.max(p.invuln, ev.hop.invuln);
  }
}

/** 조준 방향으로 투사체 1발. 크리티컬 배율은 명중 시 적용한다 (집중포화·헤드샷 판정과 함께). */
export function fireBullet(state, gun, source, forceCrit = false, angleOffset = 0, extra = null) {
  if (state.bullets.length >= BULLET.maxBullets) return;
  const p = state.player;
  const cos = Math.cos(p.aim + angleOffset);
  const sin = Math.sin(p.aim + angleOffset);
  const crit = forceCrit || !!extra?.crit || (gun.critChance > 0 && nextFloat(state.rng) < gun.critChance);
  state.bullets.push({
    x: p.x + cos * p.r,
    y: p.y + sin * p.r,
    vx: cos * gun.bulletSpeed,
    vy: sin * gun.bulletSpeed,
    r: gun.bulletRadius,
    damage: gun.damage * (extra?.damageMult ?? 1),
    crit,
    life: gun.lifetime ?? BULLET.lifetime,
    pierce: gun.pierce + (p.pierceBuff > 0 ? p.pierceBonus : 0) + (extra?.pierce ?? 0), // 귀환 장전 (랑데뷰 숙련)
    hitIds: [],
    source,
    homing: extra?.homing ?? null,
  });
  state.events.push({ type: 'shot', source });
}

export function updateBullets(state) {
  const bullets = state.bullets;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.homing) steer(state, b);
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.life -= DT;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.width || b.y > WORLD.height || blocked(state.map, b.x, b.y)) {
      removeAt(bullets, i); // 벽은 아군 탄도 막는다
    }
  }
}

/** 추적 클래식: 반경 안의 가장 가까운 표식 적 쪽으로 방향을 튼다. */
function steer(state, b) {
  let best = null;
  let bd = b.homing.r * b.homing.r;
  for (const e of state.enemies) {
    if (!(e.mark > 0) || !targetable(e) || b.hitIds.includes(e.id)) continue;
    const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (!best) return;
  const speed = Math.hypot(b.vx, b.vy);
  const cur = Math.atan2(b.vy, b.vx);
  let diff = Math.atan2(best.y - b.y, best.x - b.x) - cur;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const turn = Math.max(-b.homing.turn * DT, Math.min(b.homing.turn * DT, diff));
  b.vx = Math.cos(cur + turn) * speed;
  b.vy = Math.sin(cur + turn) * speed;
}

/** 삼연격 조건: 조준점이 감속 필드(체임버) 또는 착탄한 나노스웜 장판(킬조이) 안. */
function burstZone(state, x, y) {
  if (inField(state, x, y)) return true;
  return state.zones.some((z) => z.flight <= 0 && (z.x - x) ** 2 + (z.y - y) ** 2 <= z.r * z.r);
}

/** 플레이어가 아닌 지점(포탑 등)에서 각도 방향으로 1발. */
export function spawnBullet(state, x, y, angle, gun, source) {
  if (state.bullets.length >= BULLET.maxBullets) return;
  state.bullets.push({
    x, y,
    vx: Math.cos(angle) * gun.bulletSpeed,
    vy: Math.sin(angle) * gun.bulletSpeed,
    r: gun.bulletRadius,
    damage: gun.damage,
    crit: false,
    life: BULLET.lifetime,
    pierce: gun.pierce,
    hitIds: [],
    source,
    homing: null,
  });
}

/** 순서를 신경 쓰지 않는 O(1) 제거. */
export function removeAt(arr, i) {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
}
