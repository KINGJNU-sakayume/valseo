// 체임버: 트레이드마크(C) · 헤드헌터(Q) · 랑데뷰(E) · 투르 드 포스(X), 고유 패시브 집중포화.
import { DT, WORLD } from '../../../data/balance.js';
import { SKILLS, ULT } from '../../../data/skills.js';
import { GUNS } from '../../../data/guns.js';
import { fireBullet } from '../weapons.js';
import { addField, inField } from '../fields.js';
import { damageEnemy } from '../combat.js';
import { skillValue, branchOf, atLevel, cooldownOf, durationMult } from '../skillutil.js';

const TM = SKILLS.trademark;
const HH = SKILLS.headhunter;
const TDF = SKILLS.tourDeForce;

export function initSkills(level) {
  return {
    c: { id: 'trademark', level: level('trademark'), branch: null, charges: TM.maxCharges, cd: 0 },
    e: { id: 'rendezvous', level: level('rendezvous'), branch: null, cd: 0, anchor: null },
    q: { id: 'headhunter', level: level('headhunter'), branch: null, ammo: HH.magazine, regen: 0, cd: 0, chain: 0 },
    x: { id: 'tourDeForce', level: level('tourDeForce'), branch: null, extra: 0, extraTimer: 0 },
  };
}

/** 헤드헌터 탄창 크기 (분기 B 반영). */
export function qMagazine(player) {
  return branchOf(player, 'q')?.magazine ?? HH.magazine;
}

export function update(state, input) {
  const keys = input.keys ?? {};
  updateTrademark(state, input, !!keys.c);
  updateRendezvous(state, !!keys.e);
  updateHeadhunter(state);
  updateTourDeForce(state, !!keys.x);
  updateTraps(state);
}

/** 집중포화: 감속 필드 안의 적에게 주는 모든 피해는 크리티컬. */
export function passiveCrit(state, e) {
  return inField(state, e.x, e.y);
}

/** 반경 안의 적 전부에게 피해 (폭발형 함정, 충격파). */
function blast(state, x, y, r, damage, source) {
  for (const e of state.enemies) {
    const rr = r + e.r;
    if (e.hp > 0 && (e.x - x) ** 2 + (e.y - y) ** 2 <= rr * rr) damageEnemy(state, e, damage, false, source);
  }
  state.events.push({ type: 'shockwave', x, y, r });
}

// ── C 트레이드마크: 함정 설치 → 적 진입 시 감속 필드 ──────────────────────

function updateTrademark(state, input, pressed) {
  const p = state.player;
  const s = p.skills.c;
  if (s.level <= 0) return;
  const cooldown = cooldownOf(state.player, 'trademark', s.level);
  if (s.charges < TM.maxCharges) {
    s.cd -= DT;
    if (s.cd <= 0) {
      s.charges++;
      s.cd = s.charges < TM.maxCharges ? s.cd + cooldown : 0;
    }
  }
  if (!pressed || s.charges <= 0) return;

  let dx = (input.aim?.x ?? p.x) - p.x;
  let dy = (input.aim?.y ?? p.y) - p.y;
  const d = Math.hypot(dx, dy);
  if (d > TM.range) {
    dx *= TM.range / d;
    dy *= TM.range / d;
  }
  const x = Math.min(WORLD.width, Math.max(0, p.x + dx));
  const y = Math.min(WORLD.height, Math.max(0, p.y + dy));
  state.traps.push({ id: state.nextId++, x, y, arm: TM.armTime });
  if (state.traps.length > TM.maxTraps) state.traps.shift(); // 가장 오래된 함정 제거
  if (s.charges === TM.maxCharges) s.cd = cooldown;
  s.charges--;
  state.events.push({ type: 'trapPlaced', x, y });
}

function updateTraps(state) {
  const p = state.player;
  const c = p.skills.c;
  const br = branchOf(p, 'c');
  const tr = TM.triggerRadius;
  for (let i = state.traps.length - 1; i >= 0; i--) {
    const t = state.traps[i];
    if (t.arm > 0) {
      t.arm -= DT;
      continue;
    }
    const hit = state.enemies.some((e) => {
      const rr = tr + e.r;
      return (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= rr * rr;
    });
    if (!hit) continue;
    const duration = skillValue('trademark', 'fieldDuration', c.level) * (br?.durationMult ?? 1) * durationMult(p);
    const radius = skillValue('trademark', 'fieldRadius', c.level) * (br?.radiusMult ?? 1);
    addField(state, t.x, t.y, radius, duration, skillValue('trademark', 'slow', c.level), !!br?.stack);
    // 필드를 먼저 깔아서 폭발 피해도 집중포화 크리가 된다
    if (br?.blastDamage) blast(state, t.x, t.y, br.blastRadius, atLevel(br.blastDamage, c.level), 'trap');
    state.events.push({ type: 'trapTriggered', x: t.x, y: t.y });
    state.traps.splice(i, 1);
  }
}

// ── E 랑데뷰: 앵커 설치 / 귀환 ─────────────────────────────────────────

function updateRendezvous(state, pressed) {
  const p = state.player;
  const s = p.skills.e;
  if (s.cd > 0) s.cd = Math.max(0, s.cd - DT);
  if (!pressed || s.level <= 0) return;
  if (!s.anchor) {
    if (s.cd > 0) return;
    s.anchor = { x: p.x, y: p.y };
    state.events.push({ type: 'anchorPlaced', x: p.x, y: p.y });
    return;
  }
  const from = { x: p.x, y: p.y };
  p.x = s.anchor.x;
  p.y = s.anchor.y;
  s.anchor = null;
  s.cd = cooldownOf(state.player, 'rendezvous', s.level);
  p.rush = GUNS.vandal.evolution.duration; // 급습 밴달이 있을 때만 의미가 있다
  const br = branchOf(p, 'e');
  if (br?.shockDamage) {
    const dmg = atLevel(br.shockDamage, s.level);
    blast(state, from.x, from.y, br.shockRadius, dmg, 'rendezvous');
    blast(state, p.x, p.y, br.shockRadius, dmg, 'rendezvous');
  }
  if (br?.invuln) {
    p.invuln = Math.max(p.invuln, br.invuln);
    if (p.skills.q.level > 0) p.skills.q.ammo = qMagazine(p);
  }
  state.events.push({ type: 'teleport', from, to: { x: p.x, y: p.y } });
}

// ── Q 헤드헌터: 정조준 모드 (이속 감소, 크리 확정 관통 권총) ────────────

function updateHeadhunter(state) {
  const p = state.player;
  const s = p.skills.q;
  if (s.level <= 0) return;
  const br = branchOf(p, 'q');
  const mag = qMagazine(p);
  const regen = skillValue('headhunter', 'ammoRegen', s.level) * (br?.regenMult ?? 1);
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
    damage: skillValue('headhunter', 'damage', s.level) * chain,
    bulletSpeed: HH.bulletSpeed,
    bulletRadius: HH.bulletRadius,
    pierce: HH.pierce + (br?.pierceBonus ?? 0),
    critChance: 0,
  }, 'headhunter', true);
  s.ammo--;
  s.cd = 1 / HH.fireRate;
}

/** 탄 명중 시 (game.js 충돌 처리): 연쇄 헤드샷 스택. */
export function onBulletHit(state, b) {
  if (b.source !== 'headhunter') return;
  const p = state.player;
  const br = branchOf(p, 'q');
  if (br?.chainMax) p.skills.q.chain = Math.min(br.chainMax, p.skills.q.chain + 1);
}

// ── X 투르 드 포스: 관통 저격, 처치 시 감속 폭발 ─────────────────────────

function updateTourDeForce(state, pressed) {
  const p = state.player;
  const s = p.skills.x;
  if (s.extra > 0) {
    s.extraTimer -= DT;
    if (s.extraTimer <= 0) s.extra = 0;
  }
  if (!pressed || s.level <= 0) return;
  if (s.extra > 0) {
    s.extra--;
  } else if (state.ultOrbs >= ULT.orbsNeeded) {
    state.ultOrbs -= ULT.orbsNeeded;
    const br = branchOf(p, 'x');
    if (br?.shots) {
      s.extra = br.shots - 1;
      s.extraTimer = br.secondWindow;
    }
  } else {
    return;
  }
  const dx = Math.cos(p.aim);
  const dy = Math.sin(p.aim);
  const len = TDF.beamLength;
  const damage = skillValue('tourDeForce', 'damage', s.level) * (branchOf(p, 'x')?.damageMult ?? 1);
  for (const e of state.enemies) {
    const rx = e.x - p.x;
    const ry = e.y - p.y;
    const t = rx * dx + ry * dy;
    if (t < 0 || t > len) continue;
    if (Math.abs(rx * dy - ry * dx) > e.r + TDF.beamWidth) continue;
    damageEnemy(state, e, damage, false, 'ult');
  }
  state.events.push({ type: 'ult', x1: p.x, y1: p.y, x2: p.x + dx * len, y2: p.y + dy * len });
}

/** 투르 드 포스로 처치하면 감속 폭발. */
export function onKilled(state, e) {
  if (e.killedBy !== 'ult') return;
  const r = TDF.killFieldRadius * (branchOf(state.player, 'x')?.killFieldRadiusMult ?? 1);
  addField(state, e.x, e.y, r, TDF.killFieldDuration, TDF.killFieldSlow);
  state.events.push({ type: 'ultExplosion', x: e.x, y: e.y, r });
}

export function resetRound(state) {
  const p = state.player;
  p.skills.c.charges = TM.maxCharges;
  p.skills.c.cd = 0;
  p.skills.e.anchor = null;
  p.skills.e.cd = 0;
  p.skills.q.ammo = qMagazine(p);
  p.skills.q.regen = 0;
  p.skills.q.chain = 0;
  p.skills.x.extra = 0;
  p.skills.x.extraTimer = 0;
}

/** HUD 용 스킬 상태: ready 0~1, pips(충전·탄창·오브), label(남은 쿨다운). */
export function abilityStatus(state, slot) {
  const p = state.player;
  const s = p.skills[slot];
  if (slot === 'c') {
    return {
      ready: s.charges > 0 ? 1 : 1 - s.cd / cooldownOf(state.player, 'trademark', s.level),
      pips: Array.from({ length: TM.maxCharges }, (_, j) => j < s.charges),
      label: s.charges === 0 ? String(Math.ceil(s.cd)) : '',
    };
  }
  if (slot === 'e') {
    return {
      ready: s.cd > 0 ? 1 - s.cd / cooldownOf(state.player, 'rendezvous', s.level) : 1,
      pips: s.anchor ? [true] : [],
      label: s.cd > 0 ? String(Math.ceil(s.cd)) : '',
    };
  }
  if (slot === 'q') {
    return { ready: s.ammo > 0 ? 1 : 0, pips: Array.from({ length: qMagazine(p) }, (_, j) => j < s.ammo), label: '' };
  }
  return {
    ready: s.extra > 0 ? 1 : state.ultOrbs / ULT.orbsNeeded,
    pips: Array.from({ length: ULT.orbsNeeded }, (_, j) => j < state.ultOrbs || s.extra > 0),
    label: '',
  };
}
