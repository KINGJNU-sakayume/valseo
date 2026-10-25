// 킬조이: 알람봇(C) · 나노스웜(Q) · 포탑(E) · 락다운(X), 고유 패시브 천재성.
import { DT, WORLD } from '../../../data/balance.js';
import { SKILLS, ULT } from '../../../data/skills.js';
import { STATUS, GADGET_SOURCES } from '../../../data/agents.js';
import { spawnBullet, removeAt } from '../weapons.js';
import { damageEnemy } from '../combat.js';
import { skillValue, branchOf, recharge, spendCharge, aimPoint, cooldownOf, durationMult } from '../skillutil.js';

const AB = SKILLS.alarmbot;
const NS = SKILLS.nanoswarm;
const TR = SKILLS.turret;
const LD = SKILLS.lockdown;
const NANO_TICK = 0.25; // 나노스웜 피해 간격(초)

export function initSkills(level) {
  return {
    c: { id: 'alarmbot', level: level('alarmbot'), branch: null, charges: AB.maxCharges, cd: 0 },
    e: { id: 'turret', level: level('turret'), branch: null, cd: 0 },
    q: { id: 'nanoswarm', level: level('nanoswarm'), branch: null, charges: NS.maxCharges, cd: 0 },
    x: { id: 'lockdown', level: level('lockdown'), branch: null },
  };
}

export function update(state, input) {
  const keys = input.keys ?? {};
  const p = state.player;
  const c = p.skills.c;
  const q = p.skills.q;
  if (c.level > 0) recharge(c, AB.maxCharges, cooldownOf(state.player, 'alarmbot', c.level), DT);
  if (q.level > 0) recharge(q, NS.maxCharges, cooldownOf(state.player, 'nanoswarm', q.level), DT);
  if (p.skills.e.cd > 0) p.skills.e.cd = Math.max(0, p.skills.e.cd - DT);

  if (keys.c) placeAlarmbot(state, input);
  if (keys.q) throwNanoswarm(state, input);
  if (keys.e) placeTurret(state);
  if (keys.x) startLockdown(state);

  updateDevices(state);
  updateZones(state);
  updateLockdowns(state);
}

/** 천재성: 취약 상태 적에게 설치물이 주는 피해는 크리티컬. */
export function passiveCrit(state, e, source) {
  return e.vulnerable > 0 && GADGET_SOURCES.includes(source);
}

const inRange = (e, x, y, r) => (e.x - x) ** 2 + (e.y - y) ** 2 <= (r + e.r) ** 2;

function makeVulnerable(e, duration) {
  e.vulnerable = Math.max(e.vulnerable ?? 0, duration);
}

// ── C 알람봇: 설치 → 다가온 적에게 굴러가 폭발, 피해 후 취약 ─────────────

function placeAlarmbot(state, input) {
  const p = state.player;
  const s = p.skills.c;
  if (s.level <= 0 || s.charges <= 0) return;
  const { x, y } = aimPoint(p, input, AB.range, WORLD);
  state.devices.push({ id: state.nextId++, kind: 'alarmbot', x, y, arm: AB.armTime, mode: 'idle', target: 0, rearm: branchOf(p, 'c')?.rearm ?? 0 });
  const bots = state.devices.filter((d) => d.kind === 'alarmbot');
  if (bots.length > AB.maxBots) state.devices.splice(state.devices.indexOf(bots[0]), 1);
  spendCharge(s, AB.maxCharges, cooldownOf(state.player, 'alarmbot', s.level));
  state.events.push({ type: 'alarmbotPlaced', x, y });
}

function nearestEnemy(state, x, y, r) {
  let best = null;
  let bd = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bd && d <= (r + e.r) ** 2) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function updateAlarmbot(state, d, i) {
  const p = state.player;
  const s = p.skills.c;
  if (d.arm > 0) {
    d.arm -= DT;
    return;
  }
  let target = d.mode === 'roll' ? state.enemies.find((e) => e.id === d.target && e.hp > 0) : null;
  if (!target) {
    target = nearestEnemy(state, d.x, d.y, AB.detectRadius);
    d.mode = target ? 'roll' : 'idle';
    d.target = target ? target.id : 0;
  }
  if (!target) return;
  const dx = target.x - d.x;
  const dy = target.y - d.y;
  const dist = Math.hypot(dx, dy);
  const br = branchOf(p, 'c');
  const r = AB.blastRadius * (br?.radiusMult ?? 1);
  if (dist > target.r + AB.blastRadius * 0.4) {
    d.x += (dx / dist) * AB.rollSpeed * DT;
    d.y += (dy / dist) * AB.rollSpeed * DT;
    return;
  }
  // 폭발: 피해 먼저, 그다음 취약 (첫 폭발은 천재성 크리가 아니다)
  const hit = state.enemies.filter((e) => e.hp > 0 && inRange(e, d.x, d.y, r));
  const dmg = skillValue('alarmbot', 'damage', s.level);
  for (const e of hit) damageEnemy(state, e, dmg, false, 'alarmbot');
  for (const e of hit) makeVulnerable(e, skillValue('alarmbot', 'vulnDuration', s.level));
  state.events.push({ type: 'alarmbotBlast', x: d.x, y: d.y, r });
  if (d.rearm > 0) {
    d.rearm--;
    d.arm = AB.armTime;
    d.mode = 'idle';
    d.target = 0;
  } else {
    state.devices.splice(i, 1);
  }
}

// ── Q 나노스웜: 투척 → 착탄 지점 지속 피해 장판 ─────────────────────────

function throwNanoswarm(state, input) {
  const p = state.player;
  const s = p.skills.q;
  if (s.level <= 0 || s.charges <= 0) return;
  const br = branchOf(p, 'q');
  const to = aimPoint(p, input, NS.range, WORLD);
  state.zones.push({
    id: state.nextId++, kind: 'nano', fromX: p.x, fromY: p.y, x: to.x, y: to.y,
    flight: NS.flightTime, flightMax: NS.flightTime,
    r: NS.radius * (br?.radiusMult ?? 1),
    life: NS.duration * (br?.durationMult ?? 1) * durationMult(p),
    maxLife: NS.duration * (br?.durationMult ?? 1) * durationMult(p),
    dps: skillValue('nanoswarm', 'dps', s.level),
    vulnerable: !!br?.vulnerable,
    tick: 0,
  });
  spendCharge(s, NS.maxCharges, cooldownOf(state.player, 'nanoswarm', s.level));
  state.events.push({ type: 'nanoThrow', x: to.x, y: to.y });
}

function updateZones(state) {
  for (let i = state.zones.length - 1; i >= 0; i--) {
    const z = state.zones[i];
    if (z.flight > 0) {
      z.flight -= DT;
      if (z.flight <= 0) state.events.push({ type: 'nanoLand', x: z.x, y: z.y, r: z.r });
      continue;
    }
    z.life -= DT;
    z.tick -= DT;
    if (z.tick <= 0) {
      z.tick += NANO_TICK;
      for (const e of state.enemies) {
        if (e.hp <= 0 || !inRange(e, z.x, z.y, z.r)) continue;
        if (z.vulnerable) makeVulnerable(e, NANO_TICK * 2);
        damageEnemy(state, e, z.dps * NANO_TICK, false, 'nanoswarm');
      }
    }
    if (z.life <= 0) removeAt(state.zones, i);
  }
}

// ── E 포탑: 설치 → 사거리 안 가장 가까운 적 자동 사격 ─────────────────────

function placeTurret(state) {
  const p = state.player;
  const s = p.skills.e;
  if (s.level <= 0 || s.cd > 0) return;
  const max = TR.maxTurrets;
  const turrets = state.devices.filter((d) => d.kind === 'turret');
  if (turrets.length >= max) state.devices.splice(state.devices.indexOf(turrets[0]), 1);
  const x = Math.min(WORLD.width, Math.max(0, p.x + Math.cos(p.aim) * TR.placeDistance));
  const y = Math.min(WORLD.height, Math.max(0, p.y + Math.sin(p.aim) * TR.placeDistance));
  state.devices.push({ id: state.nextId++, kind: 'turret', x, y, aim: p.aim, fireCd: 0.3 });
  s.cd = cooldownOf(state.player, 'turret', s.level);
  state.events.push({ type: 'turretPlaced', x, y });
}

function updateTurret(state, d) {
  const s = state.player.skills.e;
  d.fireCd = Math.max(0, d.fireCd - DT);
  const target = nearestEnemy(state, d.x, d.y, TR.range);
  if (!target) return;
  d.aim = Math.atan2(target.y - d.y, target.x - d.x);
  if (d.fireCd > 0) return;
  d.fireCd = 1 / (TR.fireRate * (branchOf(state.player, 'e')?.fireRateMult ?? 1));
  spawnBullet(state, d.x, d.y, d.aim, {
    damage: skillValue('turret', 'damage', s.level),
    bulletSpeed: TR.bulletSpeed,
    bulletRadius: TR.bulletRadius,
    pierce: 0,
  }, 'turret');
  state.events.push({ type: 'turretShot', x: d.x, y: d.y });
}

/** 냉각탄 분기: 포탑 탄 명중 시 감속. */
export function onBulletHit(state, b, e) {
  if (b.source !== 'turret') return;
  const br = branchOf(state.player, 'e');
  if (!br?.chill) return;
  e.chill = br.chill;
  e.chillTime = br.chillDuration;
}

function updateDevices(state) {
  for (let i = state.devices.length - 1; i >= 0; i--) {
    const d = state.devices[i];
    if (d.kind === 'alarmbot') updateAlarmbot(state, d, i);
    else updateTurret(state, d);
  }
}

// ── X 락다운: 기동 → 거대 반경 안 적 전부 구금 ─────────────────────────

function startLockdown(state) {
  const p = state.player;
  const s = p.skills.x;
  if (s.level <= 0 || state.ultOrbs < ULT.orbsNeeded) return;
  state.ultOrbs -= ULT.orbsNeeded;
  const br = branchOf(p, 'x');
  const windup = br?.windup ?? LD.windup;
  state.lockdowns.push({
    x: p.x, y: p.y, t: windup, windup,
    r: skillValue('lockdown', 'radius', s.level),
    duration: skillValue('lockdown', 'detainDuration', s.level),
    vulnerable: !!br?.vulnerable,
  });
  state.events.push({ type: 'lockdownStart', x: p.x, y: p.y, windup });
}

function updateLockdowns(state) {
  for (let i = state.lockdowns.length - 1; i >= 0; i--) {
    const l = state.lockdowns[i];
    l.t -= DT;
    if (l.t > 0) continue;
    let n = 0;
    for (const e of state.enemies) {
      if (e.hp <= 0 || !inRange(e, l.x, l.y, l.r)) continue;
      const resist = e.type === 'boss' ? STATUS.bossDetainResist : e.type === 'elite' ? STATUS.eliteDetainResist : 0;
      const dur = l.duration * (1 - resist);
      e.detained = Math.max(e.detained ?? 0, dur);
      if (l.vulnerable) makeVulnerable(e, dur);
      n++;
    }
    state.events.push({ type: 'lockdownFire', x: l.x, y: l.y, r: l.r, count: n });
    state.lockdowns.splice(i, 1);
  }
}

export function onKilled() {}

export function resetRound(state) {
  const p = state.player;
  p.skills.c.charges = AB.maxCharges;
  p.skills.c.cd = 0;
  p.skills.q.charges = NS.maxCharges;
  p.skills.q.cd = 0;
  p.skills.e.cd = 0;
}

export function abilityStatus(state, slot) {
  const s = state.player.skills[slot];
  if (slot === 'c' || slot === 'q') {
    const id = slot === 'c' ? 'alarmbot' : 'nanoswarm';
    const max = SKILLS[id].maxCharges;
    return {
      ready: s.charges > 0 ? 1 : 1 - s.cd / cooldownOf(state.player, id, s.level),
      pips: Array.from({ length: max }, (_, j) => j < s.charges),
      label: s.charges === 0 ? String(Math.ceil(s.cd)) : '',
    };
  }
  if (slot === 'e') {
    const n = state.devices.filter((d) => d.kind === 'turret').length;
    return {
      ready: s.cd > 0 ? 1 - s.cd / cooldownOf(state.player, 'turret', s.level) : 1,
      pips: n ? Array.from({ length: n }, () => true) : [],
      label: s.cd > 0 ? String(Math.ceil(s.cd)) : '',
    };
  }
  const pending = state.lockdowns.length > 0;
  return {
    ready: pending ? 1 : state.ultOrbs / ULT.orbsNeeded,
    pips: Array.from({ length: ULT.orbsNeeded }, (_, j) => j < state.ultOrbs),
    label: pending ? String(Math.ceil(state.lockdowns[0].t)) : '',
  };
}
