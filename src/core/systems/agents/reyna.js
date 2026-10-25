// 레이나 (설계 v0.2.2 23장): 리어(C) · 흡수(Q) · 무시(E) · 여제(X), 고유 패시브 포식자.
// 처치하면 영혼 구슬이 떨어지고(state.souls), 밟아서 모은 영혼(p.souls)으로 흡수·무시를 쓴다.
import { DT, WORLD } from '../../../data/balance.js';
import { SKILLS } from '../../../data/skills.js';
import { SOUL } from '../../../data/agents.js';
import { ENEMIES, isBig } from '../../../data/enemies.js';
import { SYNTHS } from '../../../data/synth.js';
import { maxHp } from '../../stats.js';
import { nextFloat } from '../../rng.js';
import { clampToFloor, pushOut } from '../map.js';
import { damageEnemy } from '../combat.js';
import {
  skillValue, branchOf, masteryOf, masteryAlt, manualAuto, atLevel, cooldownOf, ultCost, aimPoint, recharge, spendCharge,
} from '../skillutil.js';

const LR = SKILLS.leer;
const DV = SKILLS.devour;
const DM = SKILLS.dismiss;
const EM = SKILLS.empress;

export function initSkills(level) {
  return {
    c: { id: 'leer', level: level('leer'), branch: null, mastery: null, charges: LR.maxCharges, cd: 0 },
    e: { id: 'dismiss', level: level('dismiss'), branch: null, mastery: null, cd: 0, free: 0, freeCd: 0, reapWindow: 0, reapUsed: false, dashing: false, hitIds: [] },
    q: { id: 'devour', level: level('devour'), branch: null, mastery: null, cd: 0, held: false, healLeft: 0, healT: 0, buff: 0 },
    x: { id: 'empress', level: level('empress'), branch: null, mastery: null, active: 0, lust: 0, stormT: 0 },
  };
}

const leerMax = (p) => branchOf(p, 'c')?.maxCharges ?? LR.maxCharges;
const leerCooldown = (p, lv) => cooldownOf(p, 'leer', lv);
const leerRadius = (p, lv) => skillValue('leer', 'radius', lv) * (branchOf(p, 'c')?.radiusMult ?? 1) * (masteryAlt(p, 'c')?.radiusMult ?? 1);
const growth = (state) => 1 + 0.1 * (state.round - 1);
const empressOn = (p) => p.skills.x.active > 0;
/** 영혼 없이 쓸 수 있는가 (영혼 왕좌 + 여제 중). */
const throne = (p) => p.skills.x.mastery === 'soulThrone' && empressOn(p);

export function update(state, input) {
  const keys = input.keys ?? {};
  const p = state.player;
  updateLeer(state, input, !!keys.c);
  const qEdge = !!keys.q && !p.skills.q.held;
  p.skills.q.held = !!keys.q;
  updateDevour(state, qEdge);
  updateDismiss(state, input, !!keys.e);
  updateEmpress(state, !!keys.x);
  updateEyes(state);
  updateSouls(state);
  // 버프 합산 (weapons.js 가 읽는다)
  const q = p.skills.q;
  const x = p.skills.x;
  const qbr = branchOf(p, 'q');
  const devourRate = q.healT > 0 ? qbr?.fireRate ?? DV.fireRate : 0;
  const xbr = branchOf(p, 'x');
  const empRate = empressOn(p) ? skillValue('empress', 'fireRate', x.level) * (xbr?.fireRateMult ?? 1) : 0;
  p.fireRateBuff = devourRate + empRate;
  p.reloadMult = empressOn(p) ? EM.reloadMult : 1;
  if (p.ghost > 0) {
    p.ghost = Math.max(0, p.ghost - DT);
    // 망령 (합성): 은신이 끝나는 순간 남은 영혼 전부 연회
    if (p.ghost === 0 && p.synths?.phantom && p.souls > 0) {
      p.skills.q.cd = 0;
      updateDevour(state, true);
    }
  }
  if (q.buff > 0) q.buff = Math.max(0, q.buff - DT);
  if (p.sprintT > 0) {
    p.sprintT = Math.max(0, p.sprintT - DT);
    p.speedBuff = p.sprintT > 0 ? DV.masteries.sprint.speed : 0;
  }
}

/** 포식자: 실명된 적에게 주는 모든 피해는 크리티컬. */
export function passiveCrit(state, e) {
  return e.blind > 0;
}

/** 레이나 피해 배율: 포식(흡수 B), 피의 갈망. */
export function damageMult(state) {
  const p = state.player;
  let m = 1;
  if (p.skills.q.buff > 0) m *= 1 + (branchOf(p, 'q')?.damageBuff ?? 0);
  if (empressOn(p) && p.skills.x.lust > 0) m *= 1 + p.skills.x.lust;
  return m;
}

// ── C 리어: 눈 → 반경 안 적 실명 ─────────────────────────────────────

function updateLeer(state, input, pressed) {
  const p = state.player;
  const s = p.skills.c;
  if (s.level <= 0) return;
  recharge(s, leerMax(p), leerCooldown(p, s.level), DT);
  // 자동 시선 (수동 모드 숙련): 포위되면 발밑에
  let at = null;
  if (!pressed && manualAuto(p, 'c', 'autoLeer') && s.charges > 0) {
    const [r, n] = LR.masteries.autoLeer.surround;
    if (state.enemies.filter((e) => e.hp > 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= r * r).length >= n) {
      pressed = true;
      at = { x: p.x, y: p.y };
    }
  }
  if (!pressed || s.charges <= 0) return;
  const to = at ?? clampToFloor(state.map, p, aimPoint(p, input, LR.range, WORLD));
  placeEye(state, to.x, to.y, 1);
  spendCharge(s, leerMax(p), leerCooldown(p, s.level));
}

function placeEye(state, x, y, radiusMult) {
  const p = state.player;
  const s = p.skills.c;
  const br = branchOf(p, 'c');
  const r = leerRadius(p, Math.max(1, s.level)) * radiusMult;
  const t = skillValue('leer', 'blind', Math.max(1, s.level)) + (s.mastery === 'longStare' ? LR.masteries.longStare.blindBonus : 0);
  (state.eyes ??= []).push({ x, y, r, t, life: t });
  state.events.push({ type: 'leer', x, y, r });
  if (br?.jumps && radiusMult === 1) {
    // 연쇄 시선: 가까운 무리 두 곳으로 더 튄다
    let from = { x, y };
    const used = [{ x, y }];
    for (let k = 0; k < br.jumps; k++) {
      let best = null;
      let bn = 0;
      for (const e of state.enemies) {
        if (e.hp <= 0 || (e.x - from.x) ** 2 + (e.y - from.y) ** 2 > br.jumpRange * br.jumpRange) continue;
        if (used.some((u) => (u.x - e.x) ** 2 + (u.y - e.y) ** 2 < (r * 0.8) ** 2)) continue;
        const n = state.enemies.filter((o) => o.hp > 0 && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= 150 * 150).length;
        if (n > bn) {
          bn = n;
          best = e;
        }
      }
      if (!best) break;
      used.push({ x: best.x, y: best.y });
      placeEye(state, best.x, best.y, br.jumpRadiusMult);
      from = best;
    }
  }
}

/** 눈: 살아 있는 동안 반경 안 적 실명(또는 낙인 표식)·취약·감속. */
function updateEyes(state) {
  const p = state.player;
  const list = state.eyes ?? [];
  const br = branchOf(p, 'c');
  const slow = p.skills.c.mastery === 'afterimage' ? LR.masteries.afterimage.slow : 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const eye = list[i];
    eye.life -= DT;
    for (const e of state.enemies) {
      if (e.hp <= 0 || e.type === 'boss' || (e.x - eye.x) ** 2 + (e.y - eye.y) ** 2 > (eye.r + e.r) ** 2) continue;
      if (br?.markOnly) {
        e.mark = Math.max(e.mark ?? 0, br.markOnly);
        continue;
      }
      e.blind = Math.max(e.blind ?? 0, 0.25);
      if (br?.vulnerable) e.vulnerable = Math.max(e.vulnerable, 0.25);
      if (slow) {
        e.chill = Math.max(e.chill ?? 0, slow);
        e.chillTime = Math.max(e.chillTime ?? 0, 0.25);
      }
    }
    if (eye.life <= 0) list.splice(i, 1);
  }
}

// ── Q 흡수: 영혼 → 회복 ───────────────────────────────────────────────

function updateDevour(state, pressed) {
  const p = state.player;
  const s = p.skills.q;
  if (s.cd > 0) s.cd = Math.max(0, s.cd - DT);
  // 회복 진행
  if (s.healT > 0) {
    const dt = Math.min(DT, s.healT);
    const amount = (s.healLeft * dt) / s.healT;
    s.healLeft -= amount;
    s.healT -= dt;
    heal(state, amount);
  }
  if (s.level <= 0) return;
  if (!pressed && manualAuto(p, 'q', 'autoDevour') && p.hp < maxHp(p) * DV.masteries.autoDevour.hpPct && p.souls > 0 && s.healT <= 0) pressed = true;
  if (!pressed || s.cd > 0 || (!(p.souls > 0) && !throne(p))) return;
  const br = branchOf(p, 'q');
  const n = br?.all && !throne(p) ? p.souls : 1;
  if (!throne(p)) p.souls -= n;
  let amount = skillValue('devour', 'heal', s.level) * (br?.healMult ?? 1) * (masteryAlt(p, 'q')?.healMult ?? 1) * n;
  if (s.mastery === 'thirst') amount *= 1 + DV.masteries.thirst.perMissing * (maxHp(p) - p.hp);
  s.healLeft += amount;
  s.healT = DV.time;
  s.cd = DV.cooldown;
  if (br?.damageBuff) s.buff = br.buffTime;
  if (s.mastery === 'soulArmor') addShield(p, DV.masteries.soulArmor.shield);
  if (s.mastery === 'sprint') p.sprintT = DV.masteries.sprint.time;
  if (br?.drainRadius) {
    // 연회: 영혼마다 주변 흡혈 피해
    for (const e of state.enemies) {
      if (e.hp > 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= (br.drainRadius + e.r) ** 2) damageEnemy(state, e, br.drainDamage * n * growth(state), false, 'devour');
    }
  }
  state.events.push({ type: 'devour', x: p.x, y: p.y, n, r: br?.drainRadius ?? 0 });
}

function heal(state, amount) {
  const p = state.player;
  const room = maxHp(p) - p.hp;
  p.hp += Math.min(room, amount);
  const over = amount - room;
  const cap = branchOf(p, 'q')?.overshield;
  if (over > 0 && cap) addShield(p, Math.min(over, cap - p.shield > 0 ? cap - p.shield : 0));
}

function addShield(p, v) {
  if (v <= 0) return;
  p.shield += v;
  p.shieldMax = Math.max(p.shieldMax ?? 0, p.shield);
}

// ── E 무시: 영혼 → 무적 질주 ─────────────────────────────────────────

function updateDismiss(state, input, pressed) {
  const p = state.player;
  const s = p.skills.e;
  if (s.cd > 0) s.cd = Math.max(0, s.cd - DT);
  if (s.freeCd > 0) s.freeCd = Math.max(0, s.freeCd - DT);
  if (s.reapWindow > 0) s.reapWindow = Math.max(0, s.reapWindow - DT);
  // 수확 질주: 질주 중 지나간 적 피해
  const br = branchOf(p, 'e');
  if (s.dashing) {
    if (!p.dash) s.dashing = false;
    else if (br?.pathDamage) {
      for (const e of state.enemies) {
        if (e.hp <= 0 || s.hitIds.includes(e.id) || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > (br.pathWidth + e.r) ** 2) continue;
        s.hitIds.push(e.id);
        damageEnemy(state, e, atLevel(br.pathDamage, s.level) * growth(state), false, 'dismiss');
        if (e.hp <= 0 && !s.reapRefund) {
          s.reapRefund = true;
          gainSoul(state, 1);
        }
      }
    }
  }
  if (s.level <= 0) return;
  if (!pressed && manualAuto(p, 'e', 'autoDismiss') && (p.souls > 0 || s.free > 0)) {
    const [r, n] = DM.masteries.autoDismiss.surround;
    if (state.enemies.filter((e) => e.hp > 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= r * r).length >= n) pressed = true;
  }
  const canPay = s.free > 0 || p.souls > 0 || throne(p);
  if (!pressed || s.cd > 0 || !canPay || p.dash) return;
  if (s.free > 0) s.free--;
  else if (!throne(p)) p.souls--;
  s.cd = DM.cooldown;
  const invuln = DM.time + 0.05 + (masteryAlt(p, 'e')?.invulnBonus ?? 0);
  p.invuln = Math.max(p.invuln, invuln);
  if (br?.blink) {
    const to = clampToFloor(state.map, p, aimPoint(p, input, br.blink, WORLD));
    state.events.push({ type: 'teleport', from: { x: p.x, y: p.y }, to: { x: to.x, y: to.y } });
    p.x = to.x;
    p.y = to.y;
    pushOut(state.map, p);
  } else {
    let dx = input.move?.x ?? 0;
    let dy = input.move?.y ?? 0;
    if (!dx && !dy) {
      dx = (input.aim?.x ?? p.x + 1) - p.x;
      dy = (input.aim?.y ?? p.y) - p.y;
    }
    const d = Math.hypot(dx, dy) || 1;
    const dist = skillValue('dismiss', 'distance', s.level) * (br?.distanceMult ?? 1);
    p.dash = { vx: (dx / d) * (dist / DM.time), vy: (dy / d) * (dist / DM.time), t: DM.time };
    s.dashing = true;
    s.hitIds = [];
    s.reapRefund = false;
    state.events.push({ type: 'teleport', from: { x: p.x, y: p.y }, to: { x: p.x + (dx / d) * dist, y: p.y + (dy / d) * dist }, dismiss: true });
  }
  if (br?.ghost) p.ghost = br.ghost;
  if (s.mastery === 'ghostRounds') p.casingCrits = Math.max(p.casingCrits ?? 0, DM.masteries.ghostRounds.shots);
  if (s.mastery === 'piercing') {
    p.pierceBuff = DM.masteries.piercing.time;
    p.pierceBonus = DM.masteries.piercing.pierce;
  }
  if (s.mastery === 'quickReap') {
    s.reapWindow = DM.masteries.quickReap.span;
    s.reapUsed = false;
  }
}

// ── X 여제 ───────────────────────────────────────────────────────────

function updateEmpress(state, pressed) {
  const p = state.player;
  const s = p.skills.x;
  if (s.active > 0) {
    s.active = Math.max(0, s.active - DT);
    // 영혼 폭풍 (합성): 3초마다 가장 밀집한 곳에 무료 리어
    if (p.synths?.soulStorm) {
      s.stormT -= DT;
      if (s.stormT <= 0) {
        s.stormT = SYNTHS.soulStorm.every;
        const pt = densest(state, p, 450);
        if (pt) placeEye(state, pt.x, pt.y, 1);
      }
    }
    if (s.active === 0) state.events.push({ type: 'empressEnd', x: p.x, y: p.y });
    return;
  }
  if (s.level <= 0) return;
  const cost = ultCost(p);
  if (!pressed && manualAuto(p, 'x', 'autoEmpress') && state.ultOrbs >= cost) {
    const big = state.enemies.some((e) => isBig(e) && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= 700 * 700);
    const crowd = state.enemies.filter((e) => (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= 300 * 300).length >= 12;
    pressed = big || crowd;
  }
  if (!pressed || state.ultOrbs < cost) return;
  state.ultOrbs -= cost;
  s.active = skillValue('empress', 'duration', s.level) * (branchOf(p, 'x')?.durationMult ?? 1);
  s.lust = 0;
  s.stormT = 0;
  state.events.push({ type: 'empress', x: p.x, y: p.y });
}

function densest(state, p, range) {
  let best = null;
  let bn = 2;
  for (const e of state.enemies) {
    if (e.hp <= 0 || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > range * range) continue;
    const n = state.enemies.filter((o) => o.hp > 0 && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= 180 * 180).length;
    if (n > bn) {
      bn = n;
      best = { x: e.x, y: e.y };
    }
  }
  return best;
}

// ── 영혼 구슬 ────────────────────────────────────────────────────────

function gainSoul(state, n) {
  const p = state.player;
  p.souls = Math.min(SOUL.max, (p.souls ?? 0) + n);
  state.events.push({ type: 'soul', n, souls: p.souls });
}

function dropSoul(state, x, y) {
  (state.souls ??= []).push({ x, y, life: SOUL.life });
  state.events.push({ type: 'soulDrop', x, y });
}

/** 구슬: 수명, 자석, 흡수 (가득 차 있으면 남는다). */
function updateSouls(state) {
  const p = state.player;
  const list = state.souls ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i];
    o.life -= DT;
    const d = Math.hypot(p.x - o.x, p.y - o.y);
    if ((p.souls ?? 0) < SOUL.max) {
      if (d <= p.r + SOUL.radius) {
        list.splice(i, 1);
        gainSoul(state, 1);
        continue;
      }
      if (d <= SOUL.magnet) {
        const step = Math.min(d, SOUL.pull * DT);
        o.x += ((p.x - o.x) / d) * step;
        o.y += ((p.y - o.y) / d) * step;
      }
    }
    if (o.life <= 0) list.splice(i, 1);
  }
}

/** 탄 명중: 여제 처형. */
export function onBulletHit(state, b, e) {
  const p = state.player;
  if (!e || !empressOn(p)) return;
  const br = branchOf(p, 'x');
  if (br?.hpPct && e.hp > 0 && !isBig(e) && e.type !== 'pillar' && e.hp <= e.maxHp * br.hpPct) {
    e.hp = 0;
    e.killedBy = b.source;
    state.events.push({ type: 'execute', x: e.x, y: e.y });
  }
}

/** 처치: 영혼 드롭, 여제 연장·피의 갈망·사냥, 재빠른 수확. */
export function onKilled(state, e) {
  const p = state.player;
  const x = p.skills.x;
  const cbr = branchOf(p, 'c');
  const sure = e.blind > 0 || e.lastCrit || ENEMIES[e.type].elite || empressOn(p) || (cbr?.markOnly && e.mark > 0);
  if (sure || nextFloat(state.rng) < SOUL.dropChance) {
    dropSoul(state, e.x, e.y);
    if (e.blind > 0 && p.skills.c.mastery === 'soulEye') dropSoul(state, e.x + 12, e.y);
  }
  if (empressOn(p)) {
    const br = branchOf(p, 'x');
    if (!br?.noExtend) x.active += EM.extend + (x.mastery === 'endless' ? EM.masteries.endless.extendBonus : 0);
    if (x.mastery === 'bloodlust') x.lust = Math.min(EM.masteries.bloodlust.max, x.lust + EM.masteries.bloodlust.per);
    const ds = p.skills.e;
    if (br?.freeDismiss && ds.freeCd <= 0 && ds.level > 0) {
      ds.free = Math.min(1, ds.free + 1);
      ds.freeCd = 1;
    }
  }
  const ds = p.skills.e;
  if (ds.reapWindow > 0 && !ds.reapUsed) {
    ds.reapUsed = true;
    gainSoul(state, 1);
  }
}

/** 무료 "설치물" (공학 탄창·덫 각인 진화): 레이나는 영혼 구슬. */
export function freeGadget(state, x, y) {
  dropSoul(state, x, y);
}

export function resetRound(state) {
  const p = state.player;
  p.skills.c.charges = leerMax(p);
  p.skills.c.cd = 0;
  p.skills.q.cd = 0;
  p.skills.q.healLeft = 0;
  p.skills.q.healT = 0;
  p.skills.q.buff = 0;
  p.skills.e.cd = 0;
  p.skills.e.free = 0;
  p.skills.e.dashing = false;
  p.skills.x.active = 0;
  p.skills.x.lust = 0;
  p.fireRateBuff = 0;
  p.reloadMult = 1;
  p.ghost = 0;
  p.sprintT = 0;
  p.speedBuff = 0;
  state.eyes = [];
  state.souls = [];
}

/** HUD: 리어 충전, 흡수·무시는 영혼 수, 여제는 남은 시간 또는 오브. */
export function abilityStatus(state, slot) {
  const p = state.player;
  const s = p.skills[slot];
  const souls = p.souls ?? 0;
  const soulPips = Array.from({ length: SOUL.max }, (_, j) => j < souls);
  if (slot === 'c') {
    const max = leerMax(p);
    return {
      ready: s.charges > 0 ? 1 : 1 - s.cd / leerCooldown(p, Math.max(1, s.level)),
      pips: Array.from({ length: max }, (_, j) => j < s.charges),
      label: s.charges === 0 ? String(Math.ceil(s.cd)) : '',
    };
  }
  if (slot === 'q' || slot === 'e') {
    const free = slot === 'e' && s.free > 0;
    const ok = (souls > 0 || free || throne(p)) && !(s.cd > 0);
    return { ready: ok ? 1 : 0, pips: soulPips, label: slot === 'q' && s.healT > 0 ? '+' : '' };
  }
  if (s.active > 0) return { ready: 1, pips: [], label: String(Math.ceil(s.active)) };
  const cost = ultCost(p);
  return { ready: Math.min(1, state.ultOrbs / cost), pips: Array.from({ length: cost }, (_, j) => j < state.ultOrbs), label: '' };
}

export { masteryOf };
