import { DT, WORLD } from '../../data/balance.js';
import { SKILLS } from '../../data/skills.js';
import { fireBullet } from './weapons.js';
import { addField, updateFields } from './fields.js';
import { damageEnemy } from './combat.js';
import { ENEMIES } from '../../data/enemies.js';

/** 스킬 수치. 배열이면 레벨에 맞는 값, 아니면 공통 값. */
export function skillValue(key, stat, level) {
  const v = SKILLS[key][stat];
  return Array.isArray(v) ? v[Math.max(1, level) - 1] : v;
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
  const c = state.player.skills.c;
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
    addField(state, t.x, t.y, skillValue('c', 'fieldRadius', c.level), skillValue('c', 'fieldDuration', c.level), skillValue('c', 'slow', c.level));
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
  state.events.push({ type: 'teleport', from, to: { x: p.x, y: p.y } });
}

// ── Q 헤드헌터: 정조준 모드 (이속 감소, 크리 확정 관통 권총) ────────────

function updateHeadhunter(state) {
  const p = state.player;
  const s = p.skills.q;
  if (s.level <= 0) return;
  const mag = SKILLS.q.magazine;
  const regen = skillValue('q', 'ammoRegen', s.level);
  if (s.ammo < mag) {
    s.regen += DT;
    while (s.regen >= regen && s.ammo < mag) {
      s.ammo++;
      s.regen -= regen;
    }
  }
  if (s.ammo >= mag) s.regen = 0;

  s.cd = Math.max(0, s.cd - DT);
  if (!p.precision || s.cd > 0 || s.ammo <= 0) return;
  fireBullet(state, {
    damage: skillValue('q', 'damage', s.level),
    bulletSpeed: SKILLS.q.bulletSpeed,
    bulletRadius: SKILLS.q.bulletRadius,
    pierce: SKILLS.q.pierce,
    critChance: 0,
  }, 'headhunter', true);
  s.ammo--;
  s.cd = 1 / SKILLS.q.fireRate;
}

// ── X 투르 드 포스: 관통 저격, 처치 시 감속 폭발 ─────────────────────────

function updateTourDeForce(state, pressed) {
  const p = state.player;
  const s = p.skills.x;
  if (!pressed || s.level <= 0 || state.ultOrbs < SKILLS.x.orbsNeeded) return;
  state.ultOrbs -= SKILLS.x.orbsNeeded;
  const dx = Math.cos(p.aim);
  const dy = Math.sin(p.aim);
  const len = SKILLS.x.beamLength;
  const damage = skillValue('x', 'damage', s.level);
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
    addField(state, e.x, e.y, SKILLS.x.killFieldRadius, SKILLS.x.killFieldDuration, SKILLS.x.killFieldSlow);
    state.events.push({ type: 'ultExplosion', x: e.x, y: e.y, r: SKILLS.x.killFieldRadius });
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
  p.skills.c.charges = SKILLS.c.maxCharges;
  p.skills.c.cd = 0;
  p.skills.e.anchor = null;
  p.skills.e.cd = 0;
  p.skills.q.ammo = SKILLS.q.magazine;
  p.skills.q.regen = 0;
}
