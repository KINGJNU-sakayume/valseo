import { DT, WORLD } from '../../data/balance.js';
import { SKILLS } from '../../data/skills.js';
import { GUNS } from '../../data/guns.js';
import { fireBullet } from './weapons.js';
import { addField, updateFields } from './fields.js';
import { damageEnemy } from './combat.js';
import { ENEMIES } from '../../data/enemies.js';

/** 스킬 수치. 배열이면 레벨에 맞는 값, 아니면 공통 값. */
export function skillValue(key, stat, level) {
  const v = SKILLS[key][stat];
  return Array.isArray(v) ? v[Math.max(1, level) - 1] : v;
}

/** 선택한 분기 데이터 (없으면 null). */
export function branchOf(player, key) {
  const b = player.skills[key].branch;
  return b ? SKILLS[key].branches[b] : null;
}

const atLevel = (arr, level) => arr[Math.max(1, level) - 1] ?? 0;

/** 헤드헌터 탄창 크기 (분기 B 반영). */
export function qMagazine(player) {
  return branchOf(player, 'q')?.magazine ?? SKILLS.q.magazine;
}

export function updateSkills(state, input) {
  const keys = input.keys ?? {};
  updateTrademark(state, input, !!keys.c);
  updateRendezvous(state, !!keys.e);
  updateHeadhunter(state);
  updateTourDeForce(state, !!keys.x);
  updateTraps(state);
  updateFields(state);
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
  const cooldown = skillValue('c', 'cooldown', s.level);
  if (s.charges < SKILLS.c.maxCharges) {
    s.cd -= DT;
    if (s.cd <= 0) {
      s.charges++;
      s.cd = s.charges < SKILLS.c.maxCharges ? s.cd + cooldown : 0;
    }
  }
  if (!pressed || s.charges <= 0) return;

  let dx = (input.aim?.x ?? p.x) - p.x;
  let dy = (input.aim?.y ?? p.y) - p.y;
  const d = Math.hypot(dx, dy);
  if (d > SKILLS.c.range) {
    dx *= SKILLS.c.range / d;
    dy *= SKILLS.c.range / d;
  }
  const x = Math.min(WORLD.width, Math.max(0, p.x + dx));
  const y = Math.min(WORLD.height, Math.max(0, p.y + dy));
  state.traps.push({ id: state.nextId++, x, y, arm: SKILLS.c.armTime });
  if (state.traps.length > SKILLS.c.maxTraps) state.traps.shift(); // 가장 오래된 함정 제거
  if (s.charges === SKILLS.c.maxCharges) s.cd = cooldown;
  s.charges--;
  state.events.push({ type: 'trapPlaced', x, y });
}

function updateTraps(state) {
  const p = state.player;
  const c = p.skills.c;
  const br = branchOf(p, 'c');
  const tr = SKILLS.c.triggerRadius;
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
    const duration = skillValue('c', 'fieldDuration', c.level) * (br?.durationMult ?? 1);
    const radius = skillValue('c', 'fieldRadius', c.level) * (br?.radiusMult ?? 1);
    addField(state, t.x, t.y, radius, duration, skillValue('c', 'slow', c.level), !!br?.stack);
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
  s.cd = skillValue('e', 'cooldown', s.level);
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
  const regen = skillValue('q', 'ammoRegen', s.level) * (br?.regenMult ?? 1);
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
    damage: skillValue('q', 'damage', s.level) * chain,
    bulletSpeed: SKILLS.q.bulletSpeed,
    bulletRadius: SKILLS.q.bulletRadius,
    pierce: SKILLS.q.pierce + (br?.pierceBonus ?? 0),
    critChance: 0,
  }, 'headhunter', true);
  s.ammo--;
  s.cd = 1 / SKILLS.q.fireRate;
}

/** 권총 명중 시 (game.js 충돌 처리에서 호출): 연쇄 헤드샷 스택. */
export function onHeadhunterHit(state) {
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
  } else if (state.ultOrbs >= SKILLS.x.orbsNeeded) {
    state.ultOrbs -= SKILLS.x.orbsNeeded;
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
  const len = SKILLS.x.beamLength;
  const damage = skillValue('x', 'damage', s.level) * (branchOf(p, 'x')?.damageMult ?? 1);
  for (const e of state.enemies) {
    const rx = e.x - p.x;
    const ry = e.y - p.y;
    const t = rx * dx + ry * dy;
    if (t < 0 || t > len) continue;
    if (Math.abs(rx * dy - ry * dx) > e.r + SKILLS.x.beamWidth) continue;
    damageEnemy(state, e, damage, false, 'ult');
  }
  state.events.push({ type: 'ult', x1: p.x, y1: p.y, x2: p.x + dx * len, y2: p.y + dy * len });
}

/** 적 처치 시: 궁극기 처치 폭발, 오브 적립. */
export function onEnemyKilled(state, e) {
  if (ENEMIES[e.type].ultOrb) addUltOrb(state);
  if (e.killedBy === 'ult') {
    const r = SKILLS.x.killFieldRadius * (branchOf(state.player, 'x')?.killFieldRadiusMult ?? 1);
    addField(state, e.x, e.y, r, SKILLS.x.killFieldDuration, SKILLS.x.killFieldSlow);
    state.events.push({ type: 'ultExplosion', x: e.x, y: e.y, r });
  }
  if (++state.killsSinceOrb >= SKILLS.x.killsPerOrb) {
    state.killsSinceOrb = 0;
    addUltOrb(state);
  }
}

export function addUltOrb(state) {
  if (state.ultOrbs >= SKILLS.x.orbsNeeded) return false;
  state.ultOrbs++;
  state.events.push({ type: 'ultOrb', orbs: state.ultOrbs });
  return true;
}

/** 라운드 종료 시 설치물 정리, 충전 회복. */
export function resetSkillsForRound(state) {
  const p = state.player;
  state.traps.length = 0;
  state.fields.length = 0;
  p.precision = false;
  p.rush = 0;
  p.skills.c.charges = SKILLS.c.maxCharges;
  p.skills.c.cd = 0;
  p.skills.e.anchor = null;
  p.skills.e.cd = 0;
  p.skills.q.ammo = qMagazine(p);
  p.skills.q.regen = 0;
  p.skills.q.chain = 0;
  p.skills.x.extra = 0;
  p.skills.x.extraTimer = 0;
}
