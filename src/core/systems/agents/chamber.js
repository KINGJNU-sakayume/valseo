// 체임버: 트레이드마크(C) · 헤드헌터(Q) · 랑데부(E) · 역작(X), 고유 패시브 집중포화.
// 형태 증강(branch)·숙련 증강(mastery)은 data/skills.js. 모든 트레이드마크 형태는 감속 필드를 만든다 (집중포화 고정점).
import { SYNTHS } from '../../../data/synth.js';
import { isElite, isBig } from '../../../data/enemies.js';
import { DT, WORLD } from '../../../data/balance.js';
import { SKILLS } from '../../../data/skills.js';
import { GUNS } from '../../../data/guns.js';
import { STATUS } from '../../../data/agents.js';
import { maxHp } from '../../stats.js';
import { clampToFloor } from '../map.js';
import { fireBullet } from '../weapons.js';
import { addField, inField } from '../fields.js';
import { damageEnemy } from '../combat.js';
import {
  skillValue, branchOf, masteryOf, masteryAlt, manualAuto, atLevel, cooldownOf, durationMult, addUltOrb, ultCost,
  gadgetBonus,
} from '../skillutil.js';

const TM = SKILLS.trademark;
const RV = SKILLS.rendezvous;
const HH = SKILLS.headhunter;
const TDF = SKILLS.tourDeForce;

export function initSkills(level) {
  return {
    c: { id: 'trademark', level: level('trademark'), branch: null, mastery: null, charges: TM.maxCharges, cd: 0, lastTrigger: null },
    e: { id: 'rendezvous', level: level('rendezvous'), branch: null, mastery: null, cd: 0, anchor: null, anchor2: null },
    q: { id: 'headhunter', level: level('headhunter'), branch: null, mastery: null, ammo: HH.magazine, regen: 0, cd: 0, chain: 0 },
    x: { id: 'tourDeForce', level: level('tourDeForce'), branch: null, mastery: null, extra: 0, extraTimer: 0, bolt: 0 },
  };
}

/** 헤드헌터 탄창 크기 (형태 반영). */
export function qMagazine(player) {
  return branchOf(player, 'q')?.magazine ?? HH.magazine;
}

/** 트레이드마크 최대 충전·덫 수 (형태 + 자동화 숙련의 자동 모드 효과). */
export function tmMaxCharges(player) {
  return (branchOf(player, 'c')?.maxCharges ?? TM.maxCharges) + (masteryAlt(player, 'c')?.charges ?? 0);
}
function tmMaxTraps(player) {
  return (branchOf(player, 'c')?.maxTraps ?? TM.maxTraps) + (masteryAlt(player, 'c')?.charges ?? 0) + gadgetBonus(player);
}
function tmCooldown(player, level) {
  return cooldownOf(player, 'trademark', level) * (branchOf(player, 'c')?.cooldownMult ?? 1) * (masteryAlt(player, 'c')?.cooldownMult ?? 1);
}
function rvCooldown(player, level) {
  return cooldownOf(player, 'rendezvous', level) * (branchOf(player, 'e')?.cooldownMult ?? 1) * (masteryAlt(player, 'e')?.cooldownMult ?? 1);
}

export function update(state, input) {
  const keys = input.keys ?? {};
  updateTrademark(state, input, !!keys.c);
  updateRendezvous(state, input, !!keys.e);
  updateHeadhunter(state);
  updateTourDeForce(state, !!keys.x);
  updateTraps(state);
  updateDecoy(state);
  updateMarkRing(state);
}

/** 집중포화: 감속 필드 안의 적에게 주는 모든 피해는 크리티컬. */
export function passiveCrit(state, e) {
  return inField(state, e.x, e.y);
}

/** 반경 안의 적 전부에게 피해 (폭발형 함정, 충격파, 잔상). */
function blast(state, x, y, r, damage, source) {
  for (const e of state.enemies) {
    const rr = r + e.r;
    if (e.hp > 0 && (e.x - x) ** 2 + (e.y - y) ** 2 <= rr * rr) damageEnemy(state, e, damage, false, source);
  }
  state.events.push({ type: 'shockwave', x, y, r });
}

/** 구금 (엘리트·보스는 저항). */
function detain(e, t) {
  const resist = e.type === 'boss' ? STATUS.bossDetainResist : isElite(e) ? STATUS.eliteDetainResist : 1;
  e.detained = Math.max(e.detained ?? 0, t * resist);
}

// ── C 트레이드마크: 함정 설치 → 적 진입 시 감속 필드 ──────────────────────

function placeTrap(state, x, y) {
  const p = state.player;
  const s = p.skills.c;
  const max = tmMaxCharges(p);
  state.traps.push({ id: state.nextId++, x, y, arm: TM.armTime });
  while (state.traps.length > tmMaxTraps(p)) state.traps.shift(); // 가장 오래된 함정 제거
  if (s.charges >= max) s.cd = tmCooldown(p, s.level);
  s.charges--;
  state.events.push({ type: 'trapPlaced', x, y });
}

function updateTrademark(state, input, pressed) {
  const p = state.player;
  const s = p.skills.c;
  if (s.level <= 0) return;
  const max = tmMaxCharges(p);
  if (s.charges > max) s.charges = max;
  if (s.charges < max) {
    s.cd -= DT;
    if (s.cd <= 0) {
      s.charges++;
      s.cd = s.charges < max ? s.cd + tmCooldown(p, s.level) : 0;
    }
  }
  // 자동 재설치 (수동 모드 숙련): 충전이 있고 마지막 발동 지점이 비어 있으면 그 자리에 다시 깐다
  if (manualAuto(p, 'c', 'autoRearm') && s.lastTrigger && s.charges > 0 && !pressed) {
    const { x, y } = s.lastTrigger;
    s.lastTrigger = null;
    if (!state.traps.some((t) => (t.x - x) ** 2 + (t.y - y) ** 2 < 60 * 60)) placeTrap(state, x, y);
  }
  if (!pressed || s.charges <= 0) return;

  let dx = (input.aim?.x ?? p.x) - p.x;
  let dy = (input.aim?.y ?? p.y) - p.y;
  const d = Math.hypot(dx, dy);
  if (d > TM.range) {
    dx *= TM.range / d;
    dy *= TM.range / d;
  }
  const at = clampToFloor(state.map, p, { x: Math.min(WORLD.width, Math.max(0, p.x + dx)), y: Math.min(WORLD.height, Math.max(0, p.y + dy)) });
  placeTrap(state, at.x, at.y); // 벽 속에 놓지 않는다
}

function updateTraps(state) {
  const p = state.player;
  const br = branchOf(p, 'c');
  const tr = TM.triggerRadius;
  for (let i = state.traps.length - 1; i >= 0; i--) {
    const t = state.traps[i];
    if (!t) continue; // 연쇄 발동으로 이미 빠졌다
    if (t.arm > 0) {
      t.arm -= DT;
      continue;
    }
    // 사냥개 덫: 반경 안의 가장 가까운 적에게 기어간다
    if (br?.seekRadius) {
      let best = null;
      let bd = br.seekRadius * br.seekRadius;
      for (const e of state.enemies) {
        const d2 = (e.x - t.x) ** 2 + (e.y - t.y) ** 2;
        if (e.hp > 0 && d2 < bd) {
          bd = d2;
          best = e;
        }
      }
      if (best) {
        const d = Math.sqrt(bd) || 1;
        const step = Math.min(d, br.seekSpeed * DT);
        t.x += ((best.x - t.x) / d) * step;
        t.y += ((best.y - t.y) / d) * step;
      }
    }
    const hit = state.enemies.some((e) => {
      const rr = tr + e.r;
      return (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= rr * rr;
    });
    if (hit) triggerTrap(state, t);
  }
}

/** 덫 발동: 감속 필드(+형태 효과). 연쇄 발동 숙련이면 주변 덫도 함께. */
function triggerTrap(state, t, chained = false) {
  const p = state.player;
  const c = p.skills.c;
  const br = branchOf(p, 'c');
  const idx = state.traps.indexOf(t);
  if (idx < 0) return;
  state.traps.splice(idx, 1);
  const duration = skillValue('trademark', 'fieldDuration', c.level) * (br?.durationMult ?? 1) * durationMult(p);
  const radius = skillValue('trademark', 'fieldRadius', c.level) * (br?.radiusMult ?? 1);
  addField(state, t.x, t.y, radius, duration, skillValue('trademark', 'slow', c.level), !!br?.stack);
  // 필드를 먼저 깔아서 폭발 피해도 집중포화 크리가 된다
  if (br?.blastDamage) blast(state, t.x, t.y, br.blastRadius, atLevel(br.blastDamage, c.level), 'trap');
  if (br?.detain) {
    for (const e of state.enemies) if ((e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= radius * radius) detain(e, br.detain);
  }
  c.lastTrigger = { x: t.x, y: t.y };
  state.events.push({ type: 'trapTriggered', x: t.x, y: t.y, r: radius });
  // 체크메이트 (합성): 필드 안 적마다 헤드헌터 탄
  if (p.synths?.checkmate) {
    const q = p.skills.q;
    const gun = { damage: skillValue('headhunter', 'damage', Math.max(1, q.level)), bulletSpeed: HH.bulletSpeed, bulletRadius: HH.bulletRadius, pierce: 0, critChance: 0 };
    const targets = state.enemies.filter((e) => e.hp > 0 && !e.hidden && (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= radius * radius).slice(0, SYNTHS.checkmate.maxShots);
    for (const e of targets) fireBullet(state, gun, 'headhunter', true, Math.atan2(e.y - p.y, e.x - p.x) - p.aim);
    if (targets.length) state.events.push({ type: 'synth', id: 'checkmate', x: t.x, y: t.y, n: targets.length });
  }
  if (!chained && c.mastery === 'chainTrigger') {
    const range = TM.masteries.chainTrigger.range;
    for (const o of state.traps.filter((o) => (o.x - t.x) ** 2 + (o.y - t.y) ** 2 <= range * range)) triggerTrap(state, o, true);
  }
}

/** 덫 고리 숙련: 필드 안의 적에게 표식. */
function updateMarkRing(state) {
  const p = state.player;
  if (p.skills.c.mastery !== 'markRing' || state.fields.length === 0) return;
  const t = TM.masteries.markRing.mark;
  for (const e of state.enemies) if (inField(state, e.x, e.y)) e.mark = Math.max(e.mark ?? 0, t);
}

// ── E 랑데부: 앵커 설치 / 귀환 ─────────────────────────────────────────

function updateRendezvous(state, input, pressed) {
  const p = state.player;
  const s = p.skills.e;
  if (s.cd > 0) s.cd = Math.max(0, s.cd - DT);
  if (s.level <= 0) return;
  const br = branchOf(p, 'e');
  // 비상 귀환 (수동 모드 숙련): HP 30% 아래로 떨어지면 자동 귀환
  const emergency = manualAuto(p, 'e', 'emergency') && p.hp < maxHp(p) * RV.masteries.emergency.hpPct;
  if (br?.noAnchor) {
    // 덫 귀환: 조준점에 가장 가까운 내 덫으로
    if ((!pressed && !emergency) || s.cd > 0 || state.traps.length === 0) return;
    const ax = input.aim?.x ?? p.x;
    const ay = input.aim?.y ?? p.y;
    const trap = state.traps.reduce((a, b) => ((b.x - ax) ** 2 + (b.y - ay) ** 2 < (a.x - ax) ** 2 + (a.y - ay) ** 2 ? b : a));
    teleport(state, trap.x, trap.y);
    triggerTrap(state, trap);
    return;
  }
  if (!pressed && !(emergency && s.anchor)) return;
  if (!s.anchor) {
    if (s.cd > 0) return;
    s.anchor = { x: p.x, y: p.y };
    state.events.push({ type: 'anchorPlaced', x: p.x, y: p.y });
    return;
  }
  // 이중 앵커: 두 번째 앵커가 없고 첫 앵커에서 충분히 멀면 두 번째를 깐다
  if (br?.anchors === 2 && !s.anchor2 && !emergency && (p.x - s.anchor.x) ** 2 + (p.y - s.anchor.y) ** 2 > 300 * 300) {
    s.anchor2 = { x: p.x, y: p.y };
    state.events.push({ type: 'anchorPlaced', x: p.x, y: p.y });
    return;
  }
  let to = s.anchor;
  if (s.anchor2) {
    const ax = input.aim?.x ?? p.x;
    const ay = input.aim?.y ?? p.y;
    if ((s.anchor2.x - ax) ** 2 + (s.anchor2.y - ay) ** 2 < (to.x - ax) ** 2 + (to.y - ay) ** 2) to = s.anchor2;
  }
  s.anchor = null;
  s.anchor2 = null;
  teleport(state, to.x, to.y);
}

/** 귀환 공통: 이동, 쿨다운, 형태·숙련 효과. */
function teleport(state, x, y) {
  const p = state.player;
  const s = p.skills.e;
  const br = branchOf(p, 'e');
  const m = masteryOf(p, 'e');
  const from = { x: p.x, y: p.y };
  p.x = x;
  p.y = y;
  s.cd = rvCooldown(p, s.level);
  p.rush = GUNS.vandal.evolutions.mobility.duration; // 급습 밴달이 있을 때만 의미가 있다
  if (br?.shockDamage) {
    const dmg = atLevel(br.shockDamage, s.level);
    blast(state, from.x, from.y, br.shockRadius, dmg, 'rendezvous');
    blast(state, p.x, p.y, br.shockRadius, dmg, 'rendezvous');
  }
  if (br?.invuln) {
    p.invuln = Math.max(p.invuln, br.invuln);
    if (p.skills.q.level > 0) p.skills.q.ammo = qMagazine(p);
  }
  if (br?.decoyTime) state.decoy = { x: from.x, y: from.y, t: br.decoyTime, level: s.level };
  const alt = masteryAlt(p, 'e');
  if (alt?.invuln) p.invuln = Math.max(p.invuln, alt.invuln);
  if (m && s.mastery === 'reloadRecall') {
    p.pierceBuff = m.duration;
    p.pierceBonus = m.pierce;
  }
  if (m && s.mastery === 'warp') warpPath(state, from, p, m);
  if (m && s.mastery === 'tacticalReset') {
    const c = p.skills.c;
    if (c.level > 0) c.charges = Math.min(tmMaxCharges(p), c.charges + m.charges);
  }
  state.events.push({ type: 'teleport', from, to: { x: p.x, y: p.y } });
}

/** 공간 왜곡: 출발~도착 선분 위의 적에게 피해 + 취약. */
function warpPath(state, a, b, m) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const t = Math.max(0, Math.min(1, ((e.x - a.x) * dx + (e.y - a.y) * dy) / len2));
    const px = a.x + dx * t - e.x;
    const py = a.y + dy * t - e.y;
    if (px * px + py * py > (m.width + e.r) ** 2) continue;
    damageEnemy(state, e, m.damage, false, 'rendezvous');
    e.vulnerable = Math.max(e.vulnerable ?? 0, m.vuln);
  }
}

/** 잔상 분신: 적이 노리다가 사라질 때 폭발. */
function updateDecoy(state) {
  const d = state.decoy;
  if (!d) return;
  d.t -= DT;
  if (d.t > 0) return;
  const br = SKILLS.rendezvous.branches.afterimage;
  blast(state, d.x, d.y, br.decoyRadius, atLevel(br.decoyBlast, d.level), 'rendezvous');
  state.decoy = null;
}

// ── Q 헤드헌터: 정조준 모드 (이속 감소, 크리 확정 관통 권총) ────────────

function updateHeadhunter(state) {
  const p = state.player;
  const s = p.skills.q;
  if (s.level <= 0) return;
  const br = branchOf(p, 'q');
  const mag = qMagazine(p);
  const regen = skillValue('headhunter', 'ammoRegen', s.level) * (br?.regenMult ?? 1);
  if (s.ammo > mag) s.ammo = mag;
  if (s.ammo < mag) {
    s.regen += DT;
    while (s.regen >= regen && s.ammo < mag) {
      s.ammo++;
      s.regen -= regen;
    }
  }
  if (s.ammo >= mag) s.regen = 0;
  if (!p.precision) s.chain = 0;

  s.cd = Math.max(0, s.cd - DT);
  if (!p.precision || s.cd > 0 || s.ammo <= 0) return;
  const chain = br?.chainBonus ? 1 + s.chain * br.chainBonus : 1;
  fireBullet(state, {
    damage: skillValue('headhunter', 'damage', s.level) * chain * (br?.damageMult ?? 1),
    bulletSpeed: HH.bulletSpeed,
    bulletRadius: HH.bulletRadius,
    pierce: HH.pierce + (br?.pierceBonus ?? 0),
    critChance: 0,
  }, 'headhunter', !br?.noCrit);
  s.ammo--;
  s.cd = 1 / (HH.fireRate * (br?.fireRateMult ?? 1));
}

/** 탄 명중 시 (game.js 충돌 처리): 연쇄 헤드샷 스택, 표식 사격, 처형. */
export function onBulletHit(state, b, e) {
  if (b.source !== 'headhunter') return;
  const p = state.player;
  const br = branchOf(p, 'q');
  if (br?.chainMax) p.skills.q.chain = Math.min(br.chainMax, p.skills.q.chain + 1);
  if (!e) return;
  if (br?.mark) e.mark = Math.max(e.mark ?? 0, br.mark);
  const m = masteryOf(p, 'q');
  if (p.skills.q.mastery === 'execute' && e.hp > 0 && !isBig(e) && e.type !== 'pillar' && e.hp <= e.maxHp * m.hpPct) {
    e.hp = 0;
    e.killedBy = 'headhunter';
  }
}

// ── X 역작: 관통 저격, 처치 시 감속 폭발 ─────────────────────────

function updateTourDeForce(state, pressed) {
  const p = state.player;
  const s = p.skills.x;
  if (s.bolt > 0) s.bolt -= DT;
  if (s.extra > 0) {
    s.extraTimer -= DT;
    if (s.extraTimer <= 0) s.extra = 0;
  }
  p.ultGun = s.extra > 0; // 역작을 든 상태 (HUD·그림용. 총은 계속 쏜다)
  if (s.level <= 0) return;
  const cost = ultCost(p);
  // 자동 처형 (수동 모드 숙련): 오브가 차 있고 엘리트·보스가 700 안이면 그쪽으로 자동 발사
  let angle = p.aim;
  const autoReady = s.extra > 0 ? !(s.bolt > 0) : state.ultOrbs >= cost;
  if (!pressed && manualAuto(p, 'x', 'autoExecute') && autoReady) {
    const big = state.enemies.find((e) => isBig(e) && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= 700 * 700);
    if (!big) return;
    angle = Math.atan2(big.y - p.y, big.x - p.x);
    pressed = true;
  }
  if (!pressed) return;
  const br = branchOf(p, 'x');
  let first = false;
  if (s.extra > 0) {
    if (s.bolt > 0) return; // 노리쇠 장전 중
    s.extra--;
  } else if (state.ultOrbs >= cost) {
    // 역작을 꺼낸다: 첫 발을 바로 쏘고 나머지는 extra 로
    state.ultOrbs -= cost;
    s.extra = (br?.shots ?? TDF.shots) - 1;
    s.extraTimer = TDF.holdTime + (br?.windowBonus ?? 0);
    first = true;
  } else {
    return;
  }
  s.bolt = TDF.boltTime;
  p.ultGun = s.extra > 0;
  const beams = br?.beams ?? 1;
  const damage = skillValue('tourDeForce', 'damage', s.level) * (br?.damageMult ?? 1);
  s.imprints = 0;
  let kills = 0;
  for (let k = 0; k < beams; k++) kills += fireBeam(state, angle + (k * Math.PI * 2) / beams, damage);
  // 사냥 시즌 (합성): 꺼내는 첫 발에만 표식 적마다 추가 저격
  if (first && p.synths?.huntingSeason) {
    const hs = SYNTHS.huntingSeason;
    const marked = state.enemies.filter((e) => e.hp > 0 && e.mark > 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= hs.range * hs.range).slice(0, hs.max);
    for (const e of marked) kills += fireBeam(state, Math.atan2(e.y - p.y, e.x - p.x), damage);
  }
  // 처치 환급 (숙련): 한 발로 여럿 잡으면 탄 1발 추가
  if (s.mastery === 'refund' && kills >= SKILLS.tourDeForce.masteries.refund.kills) {
    s.extra++;
    s.extraTimer = Math.max(s.extraTimer, 3);
    p.ultGun = true;
  }
}

/** 빔 하나: 직선 관통 피해. 이 빔으로 처치한 수를 돌려준다. */
function fireBeam(state, angle, damage) {
  const p = state.player;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const len = TDF.beamLength;
  let kills = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const rx = e.x - p.x;
    const ry = e.y - p.y;
    const t = rx * dx + ry * dy;
    if (t < 0 || t > len) continue;
    if (Math.abs(rx * dy - ry * dx) > e.r + TDF.beamWidth) continue;
    damageEnemy(state, e, damage, false, 'ult');
    if (e.hp <= 0) kills++;
  }
  state.events.push({ type: 'ult', x1: p.x, y1: p.y, x2: p.x + dx * len, y2: p.y + dy * len });
  return kills;
}

/** 역작로 처치하면 감속 폭발 (+덫 각인). 헤드헌터 처치는 탄 회수. */
export function onKilled(state, e) {
  const p = state.player;
  if (e.killedBy === 'headhunter') {
    const q = p.skills.q;
    let refund = branchOf(p, 'q')?.refundOnKill ? 1 : 0;
    if (q.mastery === 'headshotRefund') refund += HH.masteries.headshotRefund.refund;
    if (refund) q.ammo = Math.min(qMagazine(p), q.ammo + refund);
  }
  // 처형장: 필드 안에서 죽으면 그 필드 지속 연장
  if (p.skills.c.mastery === 'killZone') {
    const kz = TM.masteries.killZone;
    for (const f of state.fields) {
      if ((e.x - f.x) ** 2 + (e.y - f.y) ** 2 <= f.r * f.r) f.life = Math.min(f.maxLife * kz.maxMult, f.life + kz.extend);
    }
  }
  if (e.killedBy !== 'ult') return;
  const r = TDF.killFieldRadius * (branchOf(p, 'x')?.killFieldRadiusMult ?? 1);
  addField(state, e.x, e.y, r, TDF.killFieldDuration, TDF.killFieldSlow);
  state.events.push({ type: 'ultExplosion', x: e.x, y: e.y, r });
  const x = p.skills.x;
  if (x.mastery === 'trapImprint' && (x.imprints ?? 0) < 2) {
    x.imprints = (x.imprints ?? 0) + 1;
    state.traps.push({ id: state.nextId++, x: e.x, y: e.y, arm: TM.armTime });
  }
}

/** 무료 덫 1개 (진화 총 효과). 덫이 너무 쌓이지 않게 상한 +2. */
export function freeGadget(state, x, y) {
  state.traps.push({ id: state.nextId++, x, y, arm: TM.armTime });
  while (state.traps.length > tmMaxTraps(state.player) + 2) state.traps.shift();
}

/** 처치 크레딧 배율: 금괴 탄 숙련. */
export function creditMult(state, e) {
  const x = state.player.skills.x;
  return x.mastery === 'goldRounds' && e.killedBy === 'ult' ? TDF.masteries.goldRounds.creditMult : 1;
}

export function resetRound(state) {
  const p = state.player;
  p.skills.c.charges = tmMaxCharges(p);
  p.skills.c.cd = 0;
  p.skills.c.lastTrigger = null;
  p.skills.e.anchor = null;
  p.skills.e.anchor2 = null;
  p.skills.e.cd = 0;
  p.skills.q.ammo = qMagazine(p);
  p.skills.q.regen = 0;
  p.skills.q.chain = 0;
  p.skills.x.extra = 0;
  p.skills.x.extraTimer = 0;
  p.skills.x.bolt = 0;
  p.ultGun = false;
  state.decoy = null;
}

/** HUD 용 스킬 상태: ready 0~1, pips(충전·탄창·오브), label(남은 쿨다운). */
export function abilityStatus(state, slot) {
  const p = state.player;
  const s = p.skills[slot];
  if (slot === 'c') {
    const max = tmMaxCharges(p);
    return {
      ready: s.charges > 0 ? 1 : 1 - s.cd / tmCooldown(p, s.level),
      pips: Array.from({ length: max }, (_, j) => j < s.charges),
      label: s.charges === 0 ? String(Math.ceil(s.cd)) : '',
    };
  }
  if (slot === 'e') {
    const trapMode = branchOf(p, 'e')?.noAnchor;
    return {
      ready: s.cd > 0 ? 1 - s.cd / rvCooldown(p, s.level) : trapMode && state.traps.length === 0 ? 0 : 1,
      pips: trapMode ? [] : [s.anchor, s.anchor2].filter(Boolean).map(() => true),
      label: s.cd > 0 ? String(Math.ceil(s.cd)) : '',
    };
  }
  if (slot === 'q') {
    return { ready: s.ammo > 0 ? 1 : 0, pips: Array.from({ length: qMagazine(p) }, (_, j) => j < s.ammo), label: '' };
  }
  const cost = ultCost(p);
  // 역작을 든 동안: 남은 탄을 핍으로, 장전 중이면 차오르는 표시
  if (s.extra > 0) {
    return {
      ready: s.bolt > 0 ? 1 - s.bolt / TDF.boltTime : 1,
      pips: Array.from({ length: s.extra }, () => true),
      label: String(Math.ceil(s.extraTimer)),
    };
  }
  return {
    ready: Math.min(1, state.ultOrbs / cost),
    pips: Array.from({ length: cost }, (_, j) => j < state.ultOrbs),
    label: '',
  };
}
