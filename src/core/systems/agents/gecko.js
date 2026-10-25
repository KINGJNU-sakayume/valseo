// 게코 (설계 v0.2.4 26장): 폭파봇 지옥(C) · 지원봇(Q) · 기절봇(E) · 요동봇(X), 고유 패시브 회수.
// 스킬은 자율 생물이고(state.creatures), 끝난 자리에 구슬이 남는다(state.globules). 구슬을 밟으면 그 스킬 쿨다운이 줄어든다.
// 처치로 충전·연장되는 효과가 없다: 회수 빈도는 생물 지속 + 이동 + 회수 잠금(시간)으로만 정해진다.
import { DT, WORLD } from '../../../data/balance.js';
import { SKILLS } from '../../../data/skills.js';
import { RECLAIM, STATUS } from '../../../data/agents.js';
import { SYNTHS } from '../../../data/synth.js';
import { ENEMIES, isBig } from '../../../data/enemies.js';
import { clampToFloor, pushOut } from '../map.js';
import { damageEnemy } from '../combat.js';
import {
  skillValue, branchOf, masteryOf, masteryAlt, manualAuto, cooldownOf, ultCost, aimPoint, recharge, spendCharge, durationMult, addUltOrb,
} from '../skillutil.js';

const MP = SKILLS.moshpit;
const WG = SKILLS.wingman;
const DZ = SKILLS.dizzy;
const TH = SKILLS.thrash;

export function initSkills(level) {
  const base = (id) => ({ id, level: level(id), branch: null, mastery: null, charges: 1, cd: 0, held: false, out: false });
  return {
    c: base('moshpit'),
    e: base('dizzy'),
    q: base('wingman'),
    x: { id: 'thrash', level: level('thrash'), branch: null, mastery: null, held: false, out: false },
  };
}

const growth = (state) => 1 + 0.1 * (state.round - 1);
const alive = (e) => e.hp > 0 && !e.gone;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const lvl = (p, slot) => Math.max(1, p.skills[slot].level);
/** 회수 잠금: 구슬을 회수하면 쿨다운이 이 값 이하로. 하한은 증강으로 못 뚫는다 (설계 26.2 규칙 7). */
const lockout = () => Math.max(RECLAIM.floor, RECLAIM.lockout);

/** 구금 (엘리트·보스는 저항). */
function detain(e, t) {
  const resist = e.type === 'boss' ? STATUS.bossDetainResist : ENEMIES[e.type].elite ? STATUS.eliteDetainResist : 1;
  e.detained = Math.max(e.detained ?? 0, t * resist);
}

export function update(state, input) {
  const keys = input.keys ?? {};
  const p = state.player;
  const edge = (slot) => {
    const s = p.skills[slot];
    const e = !!keys[slot] && !s.held;
    s.held = !!keys[slot];
    return e;
  };
  castMosh(state, input, edge('c'));
  castWingman(state, input, edge('q'));
  castDizzy(state, input, edge('e'));
  castThrash(state, input, edge('x'));
  updateCreatures(state);
  updateZones(state);
  updateGlobules(state);
  // 생물이나 구슬이 남아 있는 동안은 같은 스킬을 다시 쓰지 못한다 (스킬당 1개)
  for (const slot of ['c', 'q', 'e', 'x']) p.skills[slot].out = busy(state, slot);
  if (p.reclaimT > 0) p.reclaimT = Math.max(0, p.reclaimT - DT);
  p.speedBuff = p.reclaimT > 0 ? RECLAIM.speed : 0;
}

const busy = (state, slot) => (state.creatures ?? []).some((c) => c.slot === slot) || (state.globules ?? []).some((g) => g.slot === slot);

export const passiveCrit = () => false;
export const onBulletHit = () => {};
export const onKilled = () => {};

// ── C 폭파봇 지옥 ────────────────────────────────────────────────────

function castMosh(state, input, pressed) {
  const p = state.player;
  const s = p.skills.c;
  if (s.level <= 0) return;
  recharge(s, 1, cooldownOf(p, 'moshpit', s.level), DT);
  let at = null;
  if (!pressed && manualAuto(p, 'c', 'autoMosh') && s.charges > 0 && !s.out) {
    const pt = densest(state, p, 450, 150, 5);
    if (pt) {
      pressed = true;
      at = pt;
    }
  }
  if (!pressed || s.charges <= 0 || s.out) return;
  const to = at ?? clampToFloor(state.map, p, aimPoint(p, input, MP.range, WORLD));
  const br = branchOf(p, 'c');
  (state.creatures ??= []).push({
    kind: 'moshpit', slot: 'c', x: to.x, y: to.y, fuse: s.mastery === 'shortFuse' ? MP.masteries.shortFuse.fuse : MP.fuse, blasts: br?.count ?? 1,
  });
  spendCharge(s, 1, cooldownOf(p, 'moshpit', s.level));
  state.events.push({ type: 'moshThrow', x: to.x, y: to.y, r: moshRadius(p) });
}

const moshRadius = (p) => skillValue('moshpit', 'radius', lvl(p, 'c')) * (branchOf(p, 'c')?.radiusMult ?? 1);

function moshStep(state, c) {
  const p = state.player;
  const br = branchOf(p, 'c');
  c.fuse -= DT;
  if (c.fuse > 0) return false;
  const r = moshRadius(p);
  if (br?.sticky) {
    addZone(state, { x: c.x, y: c.y, r, life: br.sticky, dps: 0, slow: br.slow, vuln: true, src: 'geckoFire' });
    c.blasts = 0;
  } else {
    const dmg = skillValue('moshpit', 'damage', lvl(p, 'c')) * (br?.damageMult ?? 1) * (masteryAlt(p, 'c')?.damageMult ?? 1) * growth(state);
    blast(state, c, r, dmg, 'moshpit', MP.vulnerable);
    c.blasts--;
  }
  if (c.blasts > 0) {
    c.fuse = br?.gap ?? 0.5;
    return false;
  }
  if (br?.fire) addZone(state, { x: c.x, y: c.y, r, life: br.fire, dps: br.fireDps * growth(state), src: 'geckoFire' });
  return true;
}

// ── Q 지원봇 ─────────────────────────────────────────────────────────

function castWingman(state, input, pressed) {
  const p = state.player;
  const s = p.skills.q;
  if (s.level <= 0) return;
  recharge(s, 1, cooldownOf(p, 'wingman', s.level), DT);
  if (!pressed && manualAuto(p, 'q', 'autoWingman') && s.charges > 0 && !s.out) {
    const [r, n] = WG.masteries.autoWingman.surround;
    if (state.enemies.filter((e) => alive(e) && dist2(e, p) <= r * r).length >= n) pressed = true;
  }
  if (!pressed || s.charges <= 0 || s.out) return;
  const br = branchOf(p, 'q');
  const lv = lvl(p, 'q');
  const life = (skillValue('wingman', 'life', lv) + (masteryAlt(p, 'q')?.lifeBonus ?? 0)) * (br?.lifeMult ?? 1) * durationMult(p);
  const n = br?.count ?? 1;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    (state.creatures ??= []).push({
      kind: 'wingman', slot: 'q', x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24, r: 10, life, hits: 0,
      maxHits: skillValue('wingman', 'maxHits', lv), target: 0, hold: false,
    });
  }
  spendCharge(s, 1, cooldownOf(p, 'wingman', s.level));
  state.events.push({ type: 'creatureOut', kind: 'wingman', x: p.x, y: p.y });
}

function wingmanStep(state, w) {
  const p = state.player;
  const br = branchOf(p, 'q');
  const o = state.objective;
  w.life -= DT;
  const speed = WG.speed * (p.skills.q.mastery === 'charge' ? WG.masteries.charge.speedMult : 1);
  // 해체 지원봇: 해체 라운드에서는 스파이크에 서서 해체를 돕는다
  if (br?.defuse && o?.type === 'defuse' && !o.done) {
    const d = Math.hypot(o.x - w.x, o.y - w.y);
    w.hold = d <= 30;
    if (!w.hold) moveToward(state, w, o, speed);
    return w.life <= 0;
  }
  w.hold = false;
  let t = w.target ? state.enemies.find((e) => e.id === w.target && alive(e) && !(e.detained > 0)) : null;
  if (!t) {
    t = pickTarget(state, w, 700, br?.mark ? (e) => isBig(e) || e.hidden : null);
    w.target = t ? t.id : 0;
  }
  if (!t) {
    if (Math.hypot(p.x - w.x, p.y - w.y) > 120) moveToward(state, w, p, speed);
    return w.life <= 0;
  }
  if (Math.hypot(t.x - w.x, t.y - w.y) > t.r + 22) {
    moveToward(state, w, t, speed);
  } else {
    // 닿았다: 구금(또는 폭발·표식)
    const bonus = p.skills.q.mastery === 'firmDetain' ? WG.masteries.firmDetain.bonus : 0;
    if (br?.mark) t.mark = Math.max(t.mark ?? 0, br.mark);
    else if (br?.blast) blast(state, w, WG.radius, br.blast * growth(state), 'wingman');
    else for (const e of state.enemies) if (alive(e) && dist2(e, w) <= (WG.radius + e.r) ** 2) detain(e, WG.detain + bonus);
    state.events.push({ type: 'wingmanBlast', x: w.x, y: w.y, r: WG.radius });
    w.hits++;
    w.target = 0;
  }
  return w.life <= 0 || w.hits >= w.maxHits;
}

// ── E 기절봇 ─────────────────────────────────────────────────────────

function castDizzy(state, input, pressed) {
  const p = state.player;
  const s = p.skills.e;
  if (s.level <= 0) return;
  recharge(s, 1, cooldownOf(p, 'dizzy', s.level), DT);
  let at = null;
  if (!pressed && manualAuto(p, 'e', 'autoDizzy') && s.charges > 0 && !s.out) {
    const pt = densest(state, p, 450, 220, 5);
    if (pt) {
      pressed = true;
      at = pt;
    }
  }
  if (!pressed || s.charges <= 0 || s.out) return;
  const to = at ?? clampToFloor(state.map, p, aimPoint(p, input, DZ.range, WORLD));
  const br = branchOf(p, 'e');
  const life = (skillValue('dizzy', 'life', lvl(p, 'e')) + (s.mastery === 'longFlight' ? DZ.masteries.longFlight.bonus : 0)) * (masteryAlt(p, 'e')?.lifeMult ?? 1) * durationMult(p);
  (state.creatures ??= []).push({
    kind: 'dizzy', slot: 'e', x: p.x, y: p.y, r: 8, life, goal: { x: to.x, y: to.y }, shotT: 0.3, follow: !!br?.follow,
  });
  spendCharge(s, 1, cooldownOf(p, 'dizzy', s.level));
  state.events.push({ type: 'creatureOut', kind: 'dizzy', x: p.x, y: p.y });
}

function dizzyStep(state, d) {
  const p = state.player;
  const br = branchOf(p, 'e');
  d.life -= DT;
  const goal = d.follow ? { x: p.x, y: p.y - 40 } : d.goal;
  if (Math.hypot(goal.x - d.x, goal.y - d.y) > 6) moveToward(state, d, goal, d.follow ? 300 : DZ.speed, false);
  d.shotT -= DT;
  if (d.shotT <= 0) {
    const t = pickDizzyTarget(state, d, p.skills.e.mastery === 'sniper');
    if (t) {
      d.shotT += br?.interval ?? DZ.interval;
      const dmg = skillValue('dizzy', 'damage', lvl(p, 'e')) * (br?.damageMult ?? 1) * growth(state);
      damageEnemy(state, t, dmg, false, 'dizzy');
      if (!br?.noBlind) {
        const blind = br?.blind ?? DZ.blind;
        const radius = br?.blindRadius ?? 0;
        for (const e of state.enemies) {
          if (!alive(e) || e.type === 'boss') continue;
          if (e === t || (radius && dist2(e, t) <= (radius + e.r) ** 2)) e.blind = Math.max(e.blind ?? 0, blind);
        }
      }
      state.events.push({ type: 'plasma', x1: d.x, y1: d.y, x2: t.x, y2: t.y });
    } else {
      d.shotT = 0.2; // 대상이 없으면 곧 다시 찾는다
    }
  }
  return d.life <= 0;
}

/** 아직 눈멀지 않은 가장 가까운 적 (없으면 가장 가까운 적). 저격수는 엘리트 우선. */
function pickDizzyTarget(state, d, bigFirst) {
  let best = null;
  let bd = Infinity;
  let any = null;
  let ad = Infinity;
  for (const e of state.enemies) {
    if (!alive(e)) continue;
    const dd = dist2(e, d);
    if (dd > 450 * 450) continue;
    const pri = bigFirst && isBig(e) ? -1e9 : 0;
    if (dd + pri < ad) {
      ad = dd + pri;
      any = e;
    }
    if (!(e.blind > 0.3) && dd + pri < bd) {
      bd = dd + pri;
      best = e;
    }
  }
  return best ?? any;
}

// ── X 요동봇 ─────────────────────────────────────────────────────────

function castThrash(state, input, pressed) {
  const p = state.player;
  const s = p.skills.x;
  if (s.level <= 0) return;
  const cost = ultCost(p);
  if (!pressed && manualAuto(p, 'x', 'autoThrash') && state.ultOrbs >= cost && !s.out) {
    const big = state.enemies.some((e) => alive(e) && isBig(e) && dist2(e, p) <= 600 * 600);
    if (big || densest(state, p, 450, 300, 10)) pressed = true;
  }
  if (!pressed || state.ultOrbs < cost || s.out) return;
  state.ultOrbs -= cost;
  const br = branchOf(p, 'x');
  const lv = lvl(p, 'x');
  let dx = (input.aim?.x ?? p.x + 1) - p.x;
  let dy = (input.aim?.y ?? p.y) - p.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  (state.creatures ??= []).push({
    kind: 'thrash', slot: 'x', x: p.x, y: p.y, dx, dy, r: TH.radius * (br?.radiusMult ?? 1), life: skillValue('thrash', 'life', lv) * (br?.lifeMult ?? 1) * durationMult(p),
    hits: 0, maxHits: TH.maxHits, hit: new Map(), angle: Math.atan2(dy, dx), t: 0,
  });
  state.events.push({ type: 'thrashOut', x: p.x, y: p.y });
}

function thrashStep(state, c) {
  const p = state.player;
  const br = branchOf(p, 'x');
  const lv = lvl(p, 'x');
  c.life -= DT;
  c.t += DT;
  const speed = TH.speed * (br?.speedMult ?? 1);
  if (br?.guard) {
    c.angle += 3 * DT;
    c.x = p.x + Math.cos(c.angle) * br.guard;
    c.y = p.y + Math.sin(c.angle) * br.guard;
  } else {
    const t = pickTarget(state, c, 500);
    if (t) {
      const d = Math.hypot(t.x - c.x, t.y - c.y) || 1;
      c.dx = (t.x - c.x) / d;
      c.dy = (t.y - c.y) / d;
    }
    c.x += c.dx * speed * DT;
    c.y += c.dy * speed * DT;
    c.x = Math.min(WORLD.width - c.r, Math.max(c.r, c.x));
    c.y = Math.min(WORLD.height - c.r, Math.max(c.r, c.y));
    if (state.map) {
      const ent = { x: c.x, y: c.y, r: 14 };
      pushOut(state.map, ent);
      c.x = ent.x;
      c.y = ent.y;
    }
  }
  const mast = p.skills.x.mastery;
  const dur = TH.detain + (mast === 'extend' ? TH.masteries.extend.bonus : 0);
  const dmg = skillValue('thrash', 'damage', lv) * growth(state);
  for (const e of state.enemies) {
    if (!alive(e) || dist2(e, c) > (c.r + e.r) ** 2) continue;
    // 수호형은 같은 적을 3초마다 다시, 그 밖에는 한 번만
    const last = c.hit.get(e.id);
    if (last !== undefined && (!br?.guard || c.t - last < 3)) continue;
    c.hit.set(e.id, c.t);
    detain(e, dur);
    if (mast === 'quake') e.vulnerable = Math.max(e.vulnerable, dur);
    damageEnemy(state, e, dmg, false, 'thrash');
    if (mast === 'chainDetain') {
      const near = state.enemies.find((o) => o !== e && alive(o) && !(o.detained > 0) && dist2(o, e) <= TH.masteries.chainDetain.range ** 2);
      if (near) detain(near, dur);
    }
    c.hits++;
    if (c.hits >= c.maxHits) break;
  }
  if (c.life <= 0 || c.hits >= c.maxHits) {
    if (br?.blast) {
      blast(state, c, br.blastRadius, br.blast * growth(state), 'thrash');
      if (p.synths?.epicenter) addZone(state, { x: c.x, y: c.y, r: br.blastRadius, life: SYNTHS.epicenter.fire, dps: SYNTHS.epicenter.dps * growth(state), src: 'geckoFire' });
    }
    return true;
  }
  return false;
}

// ── 생물 공통 ────────────────────────────────────────────────────────

function updateCreatures(state) {
  const list = state.creatures ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    let done = false;
    if (c.kind === 'moshpit') done = moshStep(state, c);
    else if (c.kind === 'wingman') done = wingmanStep(state, c);
    else if (c.kind === 'dizzy') done = dizzyStep(state, c);
    else if (c.kind === 'thrash') done = thrashStep(state, c);
    if (!done) continue;
    list.splice(i, 1);
    leaveGlobule(state, c);
  }
}

/** 생물이 끝난 자리에 구슬 (같은 스킬의 구슬은 하나만). */
function leaveGlobule(state, c) {
  const p = state.player;
  const list = (state.globules ??= []);
  if (list.some((g) => g.slot === c.slot)) return;
  const wide = c.slot === 'c' && p.skills.c.mastery === 'wideOrb' ? MP.masteries.wideOrb.pickupMult : 1;
  list.push({ x: c.x, y: c.y, slot: c.slot, life: RECLAIM.life, r: RECLAIM.radius * wide });
  state.events.push({ type: 'globule', x: c.x, y: c.y, slot: c.slot });
}

/** 구슬: 수명, 밟으면 회수 (자석 없음). */
function updateGlobules(state) {
  const p = state.player;
  const list = state.globules ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const g = list[i];
    g.life -= DT;
    if (g.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    if (dist2(g, p) <= (p.r + g.r) ** 2) reclaim(state, g);
  }
}

function reclaim(state, g) {
  const p = state.player;
  const s = p.skills[g.slot];
  state.globules = state.globules.filter((o) => o.slot !== g.slot);
  if (g.slot === 'x') addUltOrb(state); // 궁극기는 쿨다운이 아니라 오브 1개 (설계 26.2 규칙 6)
  else if (s.charges <= 0) s.cd = Math.min(s.cd, lockout());
  p.reclaimT = RECLAIM.speedTime;
  // 회수 공명 (합성): 다른 스킬도 잠금 이하로
  if (p.synths?.reclaimResonance) {
    for (const slot of ['c', 'q', 'e']) if (p.skills[slot].charges <= 0) p.skills[slot].cd = Math.min(p.skills[slot].cd, lockout());
  }
  if (g.slot === 'c' && s.mastery === 'reclaimBlast') {
    const m = MP.masteries.reclaimBlast;
    blast(state, g, m.radius, m.damage * growth(state), 'moshpit');
  }
  const shield = g.slot === 'q' && s.mastery === 'guardOrb' ? WG.masteries.guardOrb.shield : g.slot === 'e' && s.mastery === 'shieldOrb' ? DZ.masteries.shieldOrb.shield : 0;
  if (shield) {
    p.shield += shield;
    p.shieldMax = Math.max(p.shieldMax ?? 0, p.shield);
  }
  state.events.push({ type: 'reclaim', x: g.x, y: g.y, slot: g.slot });
}

// ── 장판 (잔불·끈끈) ─────────────────────────────────────────────────

function addZone(state, z) {
  (state.gzones ??= []).push({ tick: 0, slow: 0, vuln: false, ...z, maxLife: z.life });
}

function updateZones(state) {
  const list = state.gzones ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i];
    z.life -= DT;
    z.tick -= DT;
    if (z.tick <= 0) {
      z.tick += 0.25;
      for (const e of state.enemies) {
        if (!alive(e) || dist2(e, z) > (z.r + e.r) ** 2) continue;
        if (z.slow) {
          e.chill = Math.max(e.chill ?? 0, z.slow);
          e.chillTime = Math.max(e.chillTime ?? 0, 0.25);
        }
        if (z.vuln) e.vulnerable = Math.max(e.vulnerable, 0.5);
        if (z.dps) damageEnemy(state, e, z.dps * 0.25, false, z.src);
      }
    }
    if (z.life <= 0) list.splice(i, 1);
  }
}

// ── 공통 보조 ────────────────────────────────────────────────────────

/** 곧장 이동 + 벽 미끄러짐 (flow field 는 쓰지 않는다: 목표가 매 틱 바뀌면 재계산된다). */
function moveToward(state, c, to, speed, slide = true) {
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const step = Math.min(d, speed * DT);
  c.x += (dx / d) * step;
  c.y += (dy / d) * step;
  if (slide && state.map) {
    const ent = { x: c.x, y: c.y, r: c.r ?? 10 };
    pushOut(state.map, ent);
    c.x = ent.x;
    c.y = ent.y;
  }
}

/** 구금·표식되지 않은 가장 가까운 적 (pref 가 있으면 그 조건의 적을 먼저). */
function pickTarget(state, from, range, pref = null) {
  let best = null;
  let bd = range * range;
  let pbest = null;
  let pd = range * range;
  for (const e of state.enemies) {
    if (!alive(e) || e.detained > 0) continue;
    const d = dist2(e, from);
    if (d < bd) {
      bd = d;
      best = e;
    }
    if (pref && pref(e) && d < pd) {
      pd = d;
      pbest = e;
    }
  }
  return pbest ?? best;
}

/** 반경 안 모든 적에게 한 번 피해 (+취약). */
function blast(state, c, r, damage, source, vulnerable = 0) {
  state.events.push({ type: 'fragBlast', x: c.x, y: c.y, r, big: false });
  for (const e of state.enemies) {
    if (!alive(e) || dist2(e, c) > (r + e.r) ** 2) continue;
    damageEnemy(state, e, damage, false, source);
    if (vulnerable) e.vulnerable = Math.max(e.vulnerable, vulnerable);
  }
}

/** 사거리 안에서 반경 r 안의 적이 n 이상으로 가장 밀집한 지점 (가까운 적 위치를 후보로). */
function densest(state, from, range, r, n) {
  const cands = state.enemies.filter((e) => alive(e) && dist2(e, from) <= range * range).slice(0, 40);
  let best = null;
  let bn = n - 1;
  for (const c of cands) {
    const k = state.enemies.filter((o) => alive(o) && dist2(o, c) <= r * r).length;
    if (k > bn) {
      bn = k;
      best = { x: c.x, y: c.y };
    }
  }
  return best;
}

/** 해체 라운드에서 스파이크에 서 있는 지원봇 (objectives.js 가 해체 진행에 더한다). */
export function holders(state) {
  return (state.creatures ?? []).filter((c) => c.kind === 'wingman' && c.hold).map((c) => ({ x: c.x, y: c.y, rate: WG.branches.defuser.defuse }));
}

/** 자동 이동이 가중을 줄 구슬 목록. */
export const globules = (state) => state.globules ?? [];

/** 무료 "설치물" (공학 탄창·덫 각인 진화): 게코는 작은 화염 장판. */
export function freeGadget(state, x, y) {
  addZone(state, { x, y, r: 80, life: 2.5, dps: 25 * growth(state), src: 'geckoFire' });
}

export function resetRound(state) {
  const p = state.player;
  for (const slot of ['c', 'q', 'e']) {
    p.skills[slot].charges = 1;
    p.skills[slot].cd = 0;
    p.skills[slot].out = false;
  }
  p.skills.x.out = false;
  state.creatures = [];
  state.globules = [];
  state.gzones = [];
  p.reclaimT = 0;
  p.speedBuff = 0;
}

/** HUD: 충전과 "생물·구슬이 나가 있는가". 구슬이 남아 있으면 남은 수명을 보여준다. */
export function abilityStatus(state, slot) {
  const p = state.player;
  const s = p.skills[slot];
  if (slot === 'x') {
    const cost = ultCost(p);
    return { ready: s.out ? 0 : Math.min(1, state.ultOrbs / cost), pips: Array.from({ length: cost }, (_, j) => j < state.ultOrbs), label: s.out ? '↺' : '' };
  }
  const g = (state.globules ?? []).find((o) => o.slot === slot);
  const label = g ? String(Math.ceil(g.life)) : s.out ? '…' : s.charges === 0 ? String(Math.ceil(s.cd)) : '';
  return {
    ready: s.out ? 0 : s.charges > 0 ? 1 : 1 - s.cd / cooldownOf(p, s.id, Math.max(1, s.level)),
    pips: [s.charges > 0 && !s.out],
    label,
  };
}

export { masteryOf };
