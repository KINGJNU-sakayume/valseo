// 킬조이: 알람봇(C) · 나노스웜(Q) · 포탑(E) · 락다운(X), 고유 패시브 천재성.
// 형태 증강(branch)·숙련 증강(mastery)은 data/skills.js. 모든 형태는 설치물 피해원을 유지한다 (천재성 고정점).
import { SYNTHS } from '../../../data/synth.js';
import { targetable } from '../mutants.js';
import { isElite } from '../../../data/enemies.js';
import { DT, WORLD, PICKUP } from '../../../data/balance.js';
import { SKILLS } from '../../../data/skills.js';
import { STATUS, GADGET_SOURCES } from '../../../data/agents.js';
import { spawnBullet, removeAt } from '../weapons.js';
import { damageEnemy } from '../combat.js';
import { maxHp } from '../../stats.js';
import { clampToFloor } from '../map.js';
import {
  skillValue, branchOf, masteryOf, masteryAlt, manualAuto, recharge, spendCharge, aimPoint, cooldownOf, durationMult, addUltOrb, ultCost,
  gadgetBonus,
} from '../skillutil.js';

const AB = SKILLS.alarmbot;
const NS = SKILLS.nanoswarm;
const TR = SKILLS.turret;
const LD = SKILLS.lockdown;
const NANO_TICK = 0.25; // 나노스웜 피해 간격(초)

export function initSkills(level) {
  return {
    c: { id: 'alarmbot', level: level('alarmbot'), branch: null, mastery: null, charges: AB.maxCharges, cd: 0, partial: 0 },
    e: { id: 'turret', level: level('turret'), branch: null, mastery: null, cd: 0, upgrades: 0 },
    q: { id: 'nanoswarm', level: level('nanoswarm'), branch: null, mastery: null, charges: NS.maxCharges, cd: 0, holdT: 0, detonated: false },
    x: { id: 'lockdown', level: level('lockdown'), branch: null, mastery: null, emergencyUsed: false, fragments: 0 },
  };
}

// ── 실효 수치 (형태 + 자동화 숙련의 자동 모드 효과) ──

export const abMaxCharges = (p) => AB.maxCharges + (masteryAlt(p, 'c')?.charges ?? 0);
const abCooldown = (p, lv) => cooldownOf(p, 'alarmbot', lv) * (masteryAlt(p, 'c')?.cooldownMult ?? 1);
export const nsMaxCharges = (p) => NS.maxCharges + (masteryAlt(p, 'q')?.charges ?? 0);
const nsCooldown = (p, lv) => cooldownOf(p, 'nanoswarm', lv);
const turretMax = (p) => (branchOf(p, 'e')?.maxTurrets ?? TR.maxTurrets) + gadgetBonus(p);
const turretRange = (p) => TR.range * (branchOf(p, 'e')?.rangeMult ?? 1) * (masteryAlt(p, 'e')?.rangeMult ?? 1);
const turretCooldown = (p, lv) => (masteryAlt(p, 'e')?.noCooldown ? 0 : cooldownOf(p, 'turret', lv));

/** 오버클럭 영역 안이면 설치물 성능 배율. */
function oc(state, x, y) {
  const o = state.overclock;
  return o && o.t > 0 && (x - o.x) ** 2 + (y - o.y) ** 2 <= o.r * o.r ? o.mult : 1;
}

export function update(state, input) {
  const keys = input.keys ?? {};
  const p = state.player;
  const c = p.skills.c;
  const q = p.skills.q;
  const x = p.skills.x;
  if (c.level > 0) {
    if (c.charges > abMaxCharges(p)) c.charges = abMaxCharges(p);
    recharge(c, abMaxCharges(p), abCooldown(p, c.level), DT);
  }
  if (q.level > 0) {
    if (q.charges > nsMaxCharges(p)) q.charges = nsMaxCharges(p);
    recharge(q, nsMaxCharges(p), nsCooldown(p, q.level), DT);
  }
  if (p.skills.e.cd > 0) p.skills.e.cd = Math.max(0, p.skills.e.cd - DT);
  if (state.overclock) {
    state.overclock.t -= DT;
    if (state.overclock.t <= 0) state.overclock = null;
  }

  // 자동화 숙련 (수동 모드)
  if (manualAuto(p, 'c', 'autoProduce') && c.level > 0 && c.charges >= abMaxCharges(p)) placeAlarmbot(state, { aim: { x: p.x, y: p.y } });
  if (manualAuto(p, 'q', 'autoThrow') && q.level > 0 && q.charges >= nsMaxCharges(p) && branchOf(p, 'q')?.maxMines == null) {
    const pt = densestPoint(state, NS.range, NS.radius * 1.5);
    if (pt) throwNanoswarm(state, { aim: pt });
  }

  if (keys.c) placeAlarmbot(state, input);
  if (branchOf(p, 'q')?.maxMines) updateMineInput(state, input, !!keys.q);
  else if (keys.q) throwNanoswarm(state, input);
  if (keys.e) placeTurret(state);
  if (keys.x) startLockdown(state);

  // 자동 재배치 (수동 모드): 포탑에서 멀어지면 쿨다운 없이 데려온다
  if (manualAuto(p, 'e', 'autoRedeploy')) {
    const range = SKILLS.turret.masteries.autoRedeploy.range;
    const far = state.devices.find((d) => d.kind === 'turret' && !d.attached && (d.x - p.x) ** 2 + (d.y - p.y) ** 2 > range * range);
    if (far) {
      far.x = p.x;
      far.y = p.y;
      state.events.push({ type: 'turretPlaced', x: p.x, y: p.y });
    }
  }
  // 비상 프로토콜: HP 25% 아래에서 무료 미니 락다운 (라운드당 1회)
  const ep = masteryOf(p, 'x');
  if (x.mastery === 'emergencyProtocol' && x.level > 0 && !x.emergencyUsed && p.hp < maxHp(p) * ep.hpPct) {
    x.emergencyUsed = true;
    startLockdown(state, { free: true, radiusMult: LD.branches.mini.radiusMult, windup: 0.5 });
  }
  // 수리 드론
  if (p.skills.e.mastery === 'repair') {
    const m = TR.masteries.repair;
    if (state.devices.some((d) => d.kind === 'turret' && (d.x - p.x) ** 2 + (d.y - p.y) ** 2 <= m.r * m.r)) p.hp = Math.min(maxHp(p), p.hp + m.hps * DT);
  }
  // 확장: 락다운 기동 중 이동속도
  p.speedBuff = x.mastery === 'expand' && state.lockdowns.length > 0 ? LD.masteries.expand.speed : 0;

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

function nearestEnemy(state, x, y, r, prefer = null) {
  let best = null;
  let bd = Infinity;
  let pbest = null;
  let pd = Infinity;
  for (const e of state.enemies) {
    if (!targetable(e)) continue; // 은신 중인 적은 설치물이 노리지 않는다
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d > (r + e.r) ** 2) continue;
    if (d < bd) {
      bd = d;
      best = e;
    }
    if (prefer && prefer(e) && d < pd) {
      pd = d;
      pbest = e;
    }
  }
  return pbest ?? best;
}

/** 사거리 안에서 반경 r 안의 적이 가장 많은 지점 (자동 투척용). */
function densestPoint(state, range, r) {
  const p = state.player;
  let best = null;
  let bn = 0;
  for (const c of state.enemies) {
    if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 > range * range) continue;
    let n = 0;
    for (const e of state.enemies) if ((e.x - c.x) ** 2 + (e.y - c.y) ** 2 <= r * r) n++;
    if (n > bn) {
      bn = n;
      best = { x: c.x, y: c.y };
    }
  }
  return best;
}

// ── C 알람봇: 설치 → 다가온 적에게 굴러가 폭발, 피해 후 취약 ─────────────

function placeAlarmbot(state, input) {
  const p = state.player;
  const s = p.skills.c;
  if (s.level <= 0 || s.charges <= 0) return;
  const br = branchOf(p, 'c');
  const { x, y } = clampToFloor(state.map, p, aimPoint(p, input, AB.range, WORLD)); // 벽 속에 놓지 않는다
  state.devices.push({
    id: state.nextId++, kind: 'alarmbot', x, y, arm: AB.armTime, mode: 'idle', target: 0, t: 0,
    rearm: br?.rearm ?? 0, guard: !!br?.biteRange, biteCd: 0,
  });
  const bots = state.devices.filter((d) => d.kind === 'alarmbot' && !d.mini);
  if (bots.length > AB.maxBots + gadgetBonus(p)) state.devices.splice(state.devices.indexOf(bots[0]), 1);
  spendCharge(s, abMaxCharges(p), abCooldown(p, s.level));
  state.events.push({ type: 'alarmbotPlaced', x, y });
}

function updateAlarmbot(state, d, i) {
  const p = state.player;
  const br = branchOf(p, 'c');
  if (d.arm > 0) {
    d.arm -= DT;
    return;
  }
  if (d.guard) return updateGuard(state, d, br);
  // 자석봇: 적이 감지되면 끌어모은 뒤 그 자리에서 폭발
  if (br?.pullTime && !d.mini) {
    if (d.mode !== 'pull') {
      if (!nearestEnemy(state, d.x, d.y, AB.detectRadius)) return;
      d.mode = 'pull';
      d.t = br.pullTime;
    }
    d.t -= DT;
    for (const e of state.enemies) {
      if (e.hp <= 0 || e.type === 'boss' || !inRange(e, d.x, d.y, br.pullRadius)) continue;
      const dist = Math.hypot(d.x - e.x, d.y - e.y) || 1;
      const step = Math.min(dist, br.pullSpeed * DT);
      e.x += ((d.x - e.x) / dist) * step;
      e.y += ((d.y - e.y) / dist) * step;
    }
    if (d.t <= 0) botBlast(state, d);
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
  if (dist > target.r + AB.blastRadius * 0.4) {
    d.x += (dx / dist) * AB.rollSpeed * DT;
    d.y += (dy / dist) * AB.rollSpeed * DT;
    return;
  }
  botBlast(state, d);
}

/** 봇 폭발: 피해 먼저, 그다음 취약 (첫 폭발은 천재성 크리가 아니다). 분열·재전개·과열 코어. */
function botBlast(state, d) {
  const p = state.player;
  const s = p.skills.c;
  const br = branchOf(p, 'c');
  const r = AB.blastRadius * (br?.radiusMult ?? 1);
  const hit = state.enemies.filter((e) => e.hp > 0 && inRange(e, d.x, d.y, r));
  const dmg = skillValue('alarmbot', 'damage', s.level) * (br?.damageMult ?? 1) * (d.mini ? br?.miniMult ?? 1 : 1) * oc(state, d.x, d.y);
  for (const e of hit) damageEnemy(state, e, dmg, false, 'alarmbot');
  for (const e of hit) makeVulnerable(e, skillValue('alarmbot', 'vulnDuration', s.level));
  state.events.push({ type: 'alarmbotBlast', x: d.x, y: d.y, r });
  if (s.mastery === 'overheat') {
    for (const z of state.zones) if (z.flight <= 0 && !z.dormant && (z.x - d.x) ** 2 + (z.y - d.y) ** 2 <= (z.r + r) ** 2) z.life = z.maxLife;
  }
  if (br?.count && !d.mini) {
    for (let k = 0; k < br.count; k++) {
      const a = (k / br.count) * Math.PI * 2;
      state.devices.push({
        id: state.nextId++, kind: 'alarmbot', x: d.x + Math.cos(a) * 25, y: d.y + Math.sin(a) * 25,
        arm: 0.2, mode: 'idle', target: 0, t: 0, rearm: 0, guard: false, biteCd: 0, mini: true,
      });
    }
  }
  if (d.rearm > 0) {
    d.rearm--;
    d.arm = AB.armTime;
    d.mode = 'idle';
    d.target = 0;
  } else {
    const at = state.devices.indexOf(d);
    if (at >= 0) state.devices.splice(at, 1);
  }
}

/** 경비견: 플레이어를 따라다니며 가까운 적을 문다. */
function updateGuard(state, d, br) {
  const p = state.player;
  const s = p.skills.c;
  const a = (d.id % 6) * (Math.PI / 3);
  const tx = p.x + Math.cos(a) * 36;
  const ty = p.y + Math.sin(a) * 36;
  const dist = Math.hypot(tx - d.x, ty - d.y);
  if (dist > 1) {
    const step = Math.min(dist, AB.rollSpeed * 1.4 * DT);
    d.x += ((tx - d.x) / dist) * step;
    d.y += ((ty - d.y) / dist) * step;
  }
  d.biteCd -= DT;
  if (d.biteCd > 0) return;
  const e = nearestEnemy(state, d.x, d.y, br.biteRange);
  if (!e) return;
  d.biteCd = br.biteEvery;
  damageEnemy(state, e, skillValue('alarmbot', 'damage', s.level) * br.biteMult * oc(state, d.x, d.y), false, 'bite');
  makeVulnerable(e, skillValue('alarmbot', 'vulnDuration', s.level) * 0.5);
  state.events.push({ type: 'bite', x: e.x, y: e.y });
}

// ── Q 나노스웜: 투척 → 착탄 지점 지속 피해 장판 ─────────────────────────

function zoneRadius(p) {
  return NS.radius * (branchOf(p, 'q')?.radiusMult ?? 1) * (masteryAlt(p, 'q')?.radiusMult ?? 1);
}

function throwNanoswarm(state, input, dormant = false) {
  const p = state.player;
  const s = p.skills.q;
  if (s.level <= 0 || s.charges <= 0) return;
  const br = branchOf(p, 'q');
  const to = aimPoint(p, input, NS.range, WORLD);
  const life = NS.duration * (br?.durationMult ?? 1) * durationMult(p);
  state.zones.push({
    id: state.nextId++, kind: 'nano', fromX: p.x, fromY: p.y, x: to.x, y: to.y,
    flight: NS.flightTime, flightMax: NS.flightTime,
    r: zoneRadius(p), life, maxLife: life,
    dps: skillValue('nanoswarm', 'dps', s.level),
    vulnerable: !!br?.vulnerable,
    follow: br?.followSpeed ?? 0,
    crystal: p.skills.q.branch === 'crystal', // 결정화: 이 장판 안에서 죽으면 작은 장판
    dormant,
    source: 'nanoswarm',
    tick: 0,
  });
  if (dormant) {
    const mines = state.zones.filter((z) => z.dormant);
    if (mines.length > br.maxMines) state.zones.splice(state.zones.indexOf(mines[0]), 1);
  }
  spendCharge(s, nsMaxCharges(p), nsCooldown(p, s.level));
  state.events.push({ type: 'nanoThrow', x: to.x, y: to.y });
}

/** 나노 포격: 포탄 자리에 은닉 지뢰 (은닉 지뢰 최대 수 공유, 충전 소모 없음). */
function plantMine(state, x, y) {
  const p = state.player;
  const br = NS.branches.hidden;
  const life = NS.duration * (br.durationMult ?? 1) * durationMult(p);
  state.zones.push({
    id: state.nextId++, kind: 'nano', fromX: x, fromY: y, x, y, flight: 0, flightMax: 0,
    r: zoneRadius(p), life, maxLife: life, dps: skillValue('nanoswarm', 'dps', Math.max(1, p.skills.q.level)),
    vulnerable: false, follow: 0, crystal: false, dormant: true, source: 'nanoswarm', tick: 0,
  });
  const mines = state.zones.filter((z) => z.dormant);
  if (mines.length > br.maxMines) state.zones.splice(state.zones.indexOf(mines[0]), 1);
  state.events.push({ type: 'synth', id: 'nanoBarrage', x, y });
}

/** 은닉 지뢰: Q 짧게 = 설치, 길게 = 전부 동시 발동. */
function updateMineInput(state, input, held) {
  const p = state.player;
  const s = p.skills.q;
  const br = branchOf(p, 'q');
  if (held) {
    if (s.holdT === 0) s.mineAim = input.aim ? { x: input.aim.x, y: input.aim.y } : { x: p.aimX, y: p.aimY }; // 놓을 때 쓸 조준점
    s.holdT += DT;
    if (s.holdT >= br.holdTime && !s.detonated) {
      s.detonated = true;
      const mines = state.zones.filter((z) => z.dormant && z.flight <= 0);
      const bonus = mines.length >= 2 ? 1 + br.multiBonus : 1;
      for (const z of mines) {
        z.dormant = false;
        z.life = z.maxLife;
        z.dps *= bonus;
      }
      if (mines.length) state.events.push({ type: 'nanoDetonate', count: mines.length, x: p.x, y: p.y });
    }
    return;
  }
  if (s.holdT > 0 && s.holdT < br.tapTime) throwNanoswarm(state, { aim: s.mineAim }, true);
  s.holdT = 0;
  s.detonated = false;
}

function updateZones(state) {
  const p = state.player;
  const infect = p.skills.q.mastery === 'infect';
  for (let i = state.zones.length - 1; i >= 0; i--) {
    const z = state.zones[i];
    if (z.flight > 0) {
      z.flight -= DT;
      if (z.flight <= 0 && !z.dormant) state.events.push({ type: 'nanoLand', x: z.x, y: z.y, r: z.r });
      if (z.flight <= 0 && z.source === 'shell' && p.synths?.nanoBarrage) plantMine(state, z.x, z.y); // 나노 포격 (합성)
      continue;
    }
    if (z.dormant) continue; // 숨긴 지뢰: 발동 전까지 대기
    if (z.follow) {
      const e = nearestEnemy(state, z.x, z.y, 600);
      if (e) {
        const d = Math.hypot(e.x - z.x, e.y - z.y) || 1;
        const step = Math.min(d, z.follow * DT);
        z.x += ((e.x - z.x) / d) * step;
        z.y += ((e.y - z.y) / d) * step;
      }
    }
    z.life -= DT;
    z.tick -= DT;
    if (z.tick <= 0) {
      z.tick += NANO_TICK;
      const mult = oc(state, z.x, z.y);
      for (const e of state.enemies) {
        if (e.hp <= 0 || !inRange(e, z.x, z.y, z.r)) continue;
        if (z.vulnerable) makeVulnerable(e, NANO_TICK * 2);
        if (infect && z.source === 'nanoswarm') e.infected = true;
        damageEnemy(state, e, z.dps * NANO_TICK * mult, false, z.source ?? 'nanoswarm');
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
  const br = branchOf(p, 'e');
  const turrets = state.devices.filter((d) => d.kind === 'turret');
  if (turrets.length >= turretMax(p)) state.devices.splice(state.devices.indexOf(turrets[0]), 1);
  const x = Math.min(WORLD.width, Math.max(0, p.x + Math.cos(p.aim) * TR.placeDistance));
  const y = Math.min(WORLD.height, Math.max(0, p.y + Math.sin(p.aim) * TR.placeDistance));
  state.devices.push({ id: state.nextId++, kind: 'turret', x, y, aim: p.aim, fireCd: 0.3, attached: !!br?.attached, rampId: 0, ramp: 0 });
  s.cd = turretCooldown(p, s.level);
  state.events.push({ type: 'turretPlaced', x, y });
}

function updateTurret(state, d) {
  const p = state.player;
  const s = p.skills.e;
  const br = branchOf(p, 'e');
  if (d.attached) {
    d.x = p.x + 12;
    d.y = p.y - 10;
  }
  d.fireCd = Math.max(0, d.fireCd - DT * (state.syncT > 0 ? 2 : 1)); // 설치 동기화
  const prefer = s.mastery === 'targeting' ? (e) => e.mark > 0 || e.vulnerable > 0 : null;
  const target = nearestEnemy(state, d.x, d.y, turretRange(p), prefer);
  if (!target) return;
  d.aim = Math.atan2(target.y - d.y, target.x - d.x);
  if (d.fireCd > 0) return;
  const feed = p.skills.q.mastery === 'feed' && state.zones.some((z) => z.flight <= 0 && !z.dormant && (z.x - d.x) ** 2 + (z.y - d.y) ** 2 <= z.r * z.r)
    ? NS.masteries.feed.fireRateMult : 1;
  const mult = oc(state, d.x, d.y);
  d.fireCd = 1 / (TR.fireRate * (br?.fireRateMult ?? 1) * feed * mult);
  const upgrade = s.mastery === 'upgrade' ? 1 + s.upgrades * TR.masteries.upgrade.per : 1;
  let damage = skillValue('turret', 'damage', s.level) * (br?.damageMult ?? 1) * upgrade;
  if (br?.shellRadius) {
    // 박격: 목표 지점에 곡사 → 착탄하면 작은 장판
    state.zones.push({
      id: state.nextId++, kind: 'nano', fromX: d.x, fromY: d.y, x: target.x, y: target.y,
      flight: br.flight, flightMax: br.flight, r: br.shellRadius, life: br.shellLife, maxLife: br.shellLife,
      dps: damage * br.shellDpsMult, vulnerable: false, follow: 0, crystal: false, dormant: false, source: 'shell', tick: 0,
    });
    state.events.push({ type: 'turretShot', x: d.x, y: d.y });
    return;
  }
  if (br?.rampPer) {
    if (d.rampId === target.id) d.ramp = Math.min(br.rampMax, d.ramp + br.rampPer);
    else {
      d.rampId = target.id;
      d.ramp = 0;
    }
    damage *= 1 + d.ramp;
  }
  spawnBullet(state, d.x, d.y, d.aim, {
    damage,
    bulletSpeed: TR.bulletSpeed,
    bulletRadius: TR.bulletRadius,
    pierce: br?.pierce ?? 0,
  }, 'turret');
  state.events.push({ type: 'turretShot', x: d.x, y: d.y });
}

/** 냉각탄 형태: 포탑 탄 명중 시 감속. */
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
    if (!d) continue;
    if (d.kind === 'alarmbot') updateAlarmbot(state, d, i);
    else updateTurret(state, d);
  }
}

// ── X 락다운: 기동 → 거대 반경 안 적 전부 구금 ─────────────────────────

function startLockdown(state, opts = {}) {
  const p = state.player;
  const s = p.skills.x;
  if (s.level <= 0) return;
  if (!opts.free) {
    const cost = ultCost(p);
    if (state.ultOrbs < cost || state.lockdowns.length > 0) return;
    state.ultOrbs -= cost;
  }
  const br = branchOf(p, 'x');
  const windup = opts.windup ?? br?.windup ?? LD.windup;
  const radiusMult = (opts.radiusMult ?? br?.radiusMult ?? 1) * (s.mastery === 'expand' ? LD.masteries.expand.radiusMult : 1);
  state.lockdowns.push({
    x: p.x, y: p.y, t: windup, windup,
    r: skillValue('lockdown', 'radius', s.level) * radiusMult,
    duration: skillValue('lockdown', 'detainDuration', s.level) * (br?.durationMult ?? 1),
    vulnerable: !!br?.vulnerable,
    follow: !!br?.follow,
    overclock: opts.free ? 0 : br?.overclock ?? 0,
  });
  state.events.push({ type: 'lockdownStart', x: p.x, y: p.y, windup });
}

function updateLockdowns(state) {
  const p = state.player;
  const suppress = p.skills.x.mastery === 'suppress' ? LD.masteries.suppress.suppress : 0;
  for (let i = state.lockdowns.length - 1; i >= 0; i--) {
    const l = state.lockdowns[i];
    if (l.follow) {
      l.x = p.x;
      l.y = p.y;
    }
    l.t -= DT;
    if (l.t > 0) continue;
    let n = 0;
    if (l.overclock) {
      state.overclock = { x: l.x, y: l.y, r: l.r, t: l.overclock, mult: LD.branches.overclock.mult };
      state.events.push({ type: 'overclock', x: l.x, y: l.y, r: l.r });
    } else {
      for (const e of state.enemies) {
        if (e.hp <= 0 || !inRange(e, l.x, l.y, l.r)) continue;
        const resist = e.type === 'boss' ? STATUS.bossDetainResist : isElite(e) ? STATUS.eliteDetainResist : 0;
        const dur = l.duration * (1 - resist);
        e.detained = Math.max(e.detained ?? 0, dur);
        if (l.vulnerable) makeVulnerable(e, dur);
        if (suppress) e.suppressed = Math.max(e.suppressed ?? 0, dur + suppress);
        n++;
      }
    }
    state.events.push({ type: 'lockdownFire', x: l.x, y: l.y, r: l.r, count: n });
    // 총동원 (합성): 경계에 미니 알람봇
    if (p.synths?.allIn) {
      const k = SYNTHS.allIn.count;
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI * 2;
        const at = clampToFloor(state.map, l, { x: l.x + Math.cos(a) * l.r * 0.9, y: l.y + Math.sin(a) * l.r * 0.9 });
        state.devices.push({ id: state.nextId++, kind: 'alarmbot', x: at.x, y: at.y, arm: AB.armTime, mode: 'idle', target: 0, t: 0, rearm: 0, guard: false, biteCd: 0, mini: true, allIn: true });
      }
      state.events.push({ type: 'synth', id: 'allIn', x: l.x, y: l.y, n: k });
    }
    state.lockdowns.splice(i, 1);
  }
}

/** 무료 알람봇 1개 (진화 총 효과). 충전을 쓰지 않는다. */
export function freeGadget(state, x, y) {
  state.devices.push({ id: state.nextId++, kind: 'alarmbot', x, y, arm: AB.armTime, mode: 'idle', target: 0, t: 0, rearm: 0, guard: false, biteCd: 0, mini: true });
  const extra = state.devices.filter((d) => d.kind === 'alarmbot' && d.mini);
  if (extra.length > 6) state.devices.splice(state.devices.indexOf(extra[0]), 1);
}

/** 처치: 취약 전이, 재활용, 결정화, 수확, 나노 감염, 구금 수확. */
export function onKilled(state, e) {
  const p = state.player;
  const s = p.skills;
  if (s.c.mastery === 'vulnTransfer' && e.vulnerable > 0) {
    const n = nearestEnemy(state, e.x, e.y, AB.masteries.vulnTransfer.range, (o) => o !== e && o.hp > 0);
    if (n && n !== e) makeVulnerable(n, Math.max(e.vulnerable, 2));
  }
  if (s.c.mastery === 'recycle' && e.killedBy === 'alarmbot') {
    s.c.partial += AB.masteries.recycle.refund;
    while (s.c.partial >= 1) {
      s.c.partial -= 1;
      if (s.c.charges < abMaxCharges(p)) s.c.charges++;
    }
  }
  const zone = state.zones.find((z) => z.flight <= 0 && !z.dormant && z.source === 'nanoswarm' && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= z.r * z.r);
  if (zone) {
    const br = branchOf(p, 'q');
    if (zone.crystal && br?.lifeMult) {
      const life = zone.maxLife * br.lifeMult;
      state.zones.push({ ...zone, id: state.nextId++, x: e.x, y: e.y, r: zone.r * br.radiusMult, life, maxLife: life, crystal: false, tick: 0 });
    }
    if (s.q.mastery === 'harvest') state.pickups.push({ kind: 'xp', x: e.x, y: e.y, r: PICKUP.radius, value: 1 });
  }
  if (s.q.mastery === 'infect' && e.infected) {
    const m = NS.masteries.infect;
    for (const o of state.enemies) if (o !== e && o.hp > 0 && inRange(o, e.x, e.y, m.r)) damageEnemy(state, o, m.damage, false, 'infect');
    state.events.push({ type: 'alarmbotBlast', x: e.x, y: e.y, r: m.r });
  }
  if (s.x.mastery === 'harvestOrb' && e.detained > 0) {
    s.x.fragments++;
    if (s.x.fragments >= LD.masteries.harvestOrb.per) {
      s.x.fragments = 0;
      addUltOrb(state);
    }
  }
}

export function resetRound(state) {
  const p = state.player;
  p.skills.c.charges = abMaxCharges(p);
  p.skills.c.cd = 0;
  p.skills.q.charges = nsMaxCharges(p);
  p.skills.q.cd = 0;
  p.skills.q.holdT = 0;
  p.skills.q.detonated = false;
  p.skills.e.cd = 0;
  if (p.skills.e.mastery === 'upgrade') p.skills.e.upgrades++;
  p.skills.x.emergencyUsed = false;
  p.speedBuff = 0;
  state.overclock = null;
}

export function abilityStatus(state, slot) {
  const p = state.player;
  const s = p.skills[slot];
  if (slot === 'c' || slot === 'q') {
    const max = slot === 'c' ? abMaxCharges(p) : nsMaxCharges(p);
    const cd = slot === 'c' ? abCooldown(p, s.level) : nsCooldown(p, s.level);
    const mines = slot === 'q' && branchOf(p, 'q')?.maxMines ? state.zones.filter((z) => z.dormant).length : 0;
    return {
      ready: s.charges > 0 ? 1 : 1 - s.cd / cd,
      pips: Array.from({ length: max }, (_, j) => j < s.charges),
      label: s.charges === 0 ? String(Math.ceil(s.cd)) : mines ? `${mines}` : '',
    };
  }
  if (slot === 'e') {
    const n = state.devices.filter((d) => d.kind === 'turret').length;
    const cd = turretCooldown(p, s.level);
    return {
      ready: s.cd > 0 && cd > 0 ? 1 - s.cd / cd : 1,
      pips: n ? Array.from({ length: n }, () => true) : [],
      label: s.cd > 0 ? String(Math.ceil(s.cd)) : '',
    };
  }
  const pending = state.lockdowns.length > 0;
  const cost = ultCost(p);
  return {
    ready: pending ? 1 : Math.min(1, state.ultOrbs / cost),
    pips: Array.from({ length: cost }, (_, j) => j < state.ultOrbs),
    label: pending ? String(Math.ceil(state.lockdowns[0].t)) : '',
  };
}
