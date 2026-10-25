// 변이체 능력 (설계 v0.2 13장): 껍질·은신·보호막·산란·자폭, 막 엘리트 패턴, 보스 결정 기둥.
// 능력은 전부 제압(e.suppressed)으로 꺼진다. 실명(e.blind)은 사격 정지 + 무작위 이동.
// core 규칙: 전역 난수·시계·DOM 금지 (state.rng 만).
import { DT, SPAWN } from '../../data/balance.js';
import { ENEMIES } from '../../data/enemies.js';
import { SOURCE_TAGS } from '../../data/tags.js';
import { nextFloat } from '../rng.js';
import { damagePlayer } from './player.js';
import { clampToFloor } from './map.js';
import { damageEnemy } from './combat.js';
import { spawn } from './enemies.js';

const TAU = Math.PI * 2;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** 은신 중이 아니고 살아 있는 적 — 자동 조준·포탑·유도탄이 노릴 수 있다. */
export const targetable = (e) => e.hp > 0 && !e.hidden && !e.gone;

/** 껍질 설정 (보스는 단계별). */
function shellOf(e) {
  const def = ENEMIES[e.type];
  if (def.ai === 'boss') return def.phases[e.phase]?.shell ?? null;
  return def.shell ?? null;
}

export function shellUp(e) {
  return !!shellOf(e) && !(e.suppressed > 0) && !(e.shellOff > 0);
}

/** 범위형 피해(장판·폭발·섬멸)는 껍질을 무시한다. */
const isArea = (source) => source === 'sweep' || (SOURCE_TAGS[source] ?? []).some((t) => t === 'blast' || t === 'zone');

/**
 * 방어 배율: 껍질(앞쪽 ±arc 에서 오는 직접 피해 감소), 보스 결정 기둥(남아 있으면 감소).
 * from: 피해가 날아온 지점 (없으면 플레이어 위치).
 */
export function defenseMult(state, e, source, from) {
  let m = 1;
  const sh = shellOf(e);
  if (sh && shellUp(e) && !isArea(source)) {
    const o = from ?? state.player;
    const a = Math.atan2(o.y - e.y, o.x - e.x);
    if (Math.abs(wrap(a - (e.face ?? 0))) <= sh.arc) m *= 1 - sh.reduce;
  }
  if (e.type === 'boss' && e.pillars > 0) m *= 1 - ENEMIES.boss.pillars.reduce;
  return m;
}

/** 보호막이 먼저 깎인다. 흡수량을 돌려준다. */
export function absorbShield(e, damage) {
  if (!(e.shield > 0)) return 0;
  const a = Math.min(e.shield, damage);
  e.shield -= a;
  if (e.shield <= 0) e.shieldBy = 0;
  return a;
}

/** 피해 후 반응: 폭발 누적으로 껍질 해제, 굴절 포식자는 맞으면 잠시 드러난다. */
export function onDamaged(state, e, damage, source) {
  const def = ENEMIES[e.type];
  const sh = def.shell;
  if (sh && (SOURCE_TAGS[source] ?? []).includes('blast')) {
    e.blastAcc = (e.blastAcc ?? 0) + damage;
    if (e.blastAcc >= sh.breakBlast && !(e.shellOff > 0)) {
      e.shellOff = sh.breakTime;
      e.blastAcc = 0;
      state.events.push({ type: 'shellBreak', x: e.x, y: e.y, big: !!def.elite });
    }
  }
  if (def.stealth?.rehide) e.revealT = Math.max(e.revealT ?? 0, def.stealth.rehide);
}

/** 보상 없이 사라짐 (자폭, 부모가 죽은 산란 자식, 표식에 닿은 분신). */
export function vanish(state, e) {
  if (e.gone) return;
  e.gone = true;
  state.events.push({ type: 'vanish', x: e.x, y: e.y, enemy: e.type });
}

export function purgeGone(state) {
  const list = state.enemies;
  let j = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].gone) list[j++] = list[i];
  list.length = j;
}

const childrenOf = (state, id, pred = () => true) => state.enemies.filter((o) => o.parent === id && !o.gone && o.hp > 0 && pred(o));

/** 스폰 직후 초기화: 껍질 방향, 엘리트 호위·분신, 자기 보호막. */
export function initMutant(state, e) {
  const def = ENEMIES[e.type];
  const p = state.player;
  e.face = Math.atan2(p.y - e.y, p.x - e.x);
  if (def.selfShield) e.shield = def.selfShield.amount;
  if (def.escort) for (let i = 0; i < def.escort.count; i++) spawnNear(state, e, def.escort.type, i / def.escort.count, 'leader');
  if (def.clones) spawnClones(state, e);
}

function spawnNear(state, e, type, frac, link = 'parent', dist = e.r + 30) {
  if (state.enemies.length >= SPAWN.maxEnemies) return null;
  const a = frac * TAU + (e.spawnSpin = (e.spawnSpin ?? 0) + 0.7);
  const at = clampToFloor(state.map, e, { x: e.x + Math.cos(a) * dist, y: e.y + Math.sin(a) * dist });
  const c = spawn(state, type, at);
  if (c) {
    c[link] = e.id;
    if (link === 'parent') c.noCredit = true; // 산란된 자식은 크레딧 없음 (XP만)
  }
  return c;
}

function spawnClones(state, e) {
  const n = ENEMIES[e.type].clones.count - childrenOf(state, e.id, (o) => ENEMIES[o.type].clone).length;
  for (let i = 0; i < n; i++) {
    const c = spawnNear(state, e, ENEMIES[e.type].clones.type, (i + 0.5) / n, 'parent', 140);
    if (c) {
      c.hidden = e.hidden;
      c.face = e.face;
    }
  }
}

/** 제압이 걸리는 순간. */
function onSuppress(state, e, def) {
  if (def.support) {
    for (const o of state.enemies) if (o.shieldBy === e.id) {
      o.shield = 0;
      o.shieldBy = 0;
    }
  }
  if (def.shell) e.shellOff = Math.max(e.shellOff ?? 0, def.shell.breakTime);
  if (def.suppressVuln) e.vulnerable = Math.max(e.vulnerable, def.suppressVuln);
  if (def.fuse && e.mode === 'fuse') e.mode = 'move';
  if (e.mode === 'ambush') e.mode = 'move';
  state.events.push({ type: 'suppressed', x: e.x, y: e.y });
}

/** 매 틱 상태 (구금 중에도 돈다): 타이머, 제압 진입, 은신 판정, 표식 반응. */
export function tickMutant(state, e) {
  const def = ENEMIES[e.type];
  if (e.blind > 0) e.blind = Math.max(0, e.blind - DT);
  if (e.revealT > 0) e.revealT = Math.max(0, e.revealT - DT);
  if (e.shellOff > 0) e.shellOff = Math.max(0, e.shellOff - DT);
  if (e.invuln > 0) e.invuln = Math.max(0, e.invuln - DT);
  const sup = e.suppressed > 0;
  if (sup && !e.wasSuppressed) onSuppress(state, e, def);
  e.wasSuppressed = sup;

  const st = def.stealth;
  if (st) {
    // 표식: 분신 소멸 + 은신 해제
    if (e.mark > 0) {
      const leader = def.clone ? state.enemies.find((o) => o.id === e.parent) : e;
      if (leader) {
        const lst = ENEMIES[leader.type].stealth;
        if (lst.markReveal) leader.revealT = Math.max(leader.revealT ?? 0, lst.markReveal);
        for (const c of childrenOf(state, leader.id, (o) => ENEMIES[o.type].clone)) vanish(state, c);
      }
      if (def.clone) vanish(state, e);
    }
    const p = state.player;
    const d2 = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
    const wasHidden = !!e.hidden;
    // 분신은 본체와 같이 숨고 드러난다 (구별 불가)
    const leader = def.clone ? state.enemies.find((o) => o.id === e.parent) : null;
    const forced = leader ? !leader.hidden : false;
    e.hidden = !(sup || e.mark > 0 || e.revealT > 0 || forced || d2 <= st.reveal * st.reveal);
    if (wasHidden && !e.hidden) state.events.push({ type: 'reveal', x: e.x, y: e.y, big: !!def.elite });
    // 다시 숨으면 분신 보충
    if (def.clones && !wasHidden && e.hidden) spawnClones(state, e);
  }
}

/** 실명: 사격·능력 없이 무작위로 걷는다. */
export function wander(state, e, speed) {
  e.wanderT = (e.wanderT ?? 0) - DT;
  if (e.wanderT <= 0) {
    e.wanderA = nextFloat(state.rng) * TAU;
    e.wanderT = 0.5;
  }
  e.x += Math.cos(e.wanderA) * speed * DT;
  e.y += Math.sin(e.wanderA) * speed * DT;
}

function moveToward(e, t, speed, sign = 1) {
  const dx = t.x - e.x;
  const dy = t.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return;
  e.x += (dx / d) * speed * DT * sign;
  e.y += (dy / d) * speed * DT * sign;
}

/** 은신 돌격 (굴절체·굴절 포식자·분신): 드러나면 짧게 기습 돌진. */
export function updateStealth(state, e, def, slow, p, walk) {
  const st = def.stealth;
  e.ambushCd = Math.max(0, (e.ambushCd ?? 0) - DT);
  if (e.mode === 'ambush') {
    e.x += e.dirX * st.ambushSpeed * slow * DT;
    e.y += e.dirY * st.ambushSpeed * slow * DT;
    e.t -= DT;
    if (e.t <= 0) {
      e.mode = 'move';
      e.ambushCd = st.ambushCd;
    }
    return;
  }
  moveToward(e, walk, e.speed * slow);
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  if (!e.hidden && !(e.suppressed > 0) && e.ambushCd <= 0 && d <= 300 && d > 0) {
    e.mode = 'ambush';
    e.t = st.ambushTime;
    e.dirX = (p.x - e.x) / d;
    e.dirY = (p.y - e.y) / d;
    state.events.push({ type: 'ambush', x: e.x, y: e.y });
  }
}

/** 공명체: 무리 뒤에서 거리 유지, 제압되면 정지. */
export function updateSupport(state, e, def, slow, p, walk) {
  if (e.suppressed > 0) return;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  if (d > def.keepDistance + def.distanceBand) moveToward(e, walk, e.speed * slow);
  else if (d < def.keepDistance - def.distanceBand) moveToward(e, p, e.speed * slow, -1);
}

/** 과충전체: 가까워지면 1초 예고 후 폭발. 제압되면 폭발 불가. */
export function updateFuse(state, e, def, slow, p, walk) {
  const f = def.fuse;
  if (e.mode === 'fuse') {
    e.t -= DT;
    if (e.t <= 0) explode(state, e);
    return;
  }
  moveToward(e, walk, e.speed * slow);
  if (!(e.suppressed > 0) && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 <= f.trigger * f.trigger) {
    e.mode = 'fuse';
    e.t = f.time;
    state.events.push({ type: 'fuse', x: e.x, y: e.y, r: f.radius, time: f.time });
  }
}

/** 폭발: 플레이어 소량, 주변 적 대량. 다른 과충전체는 즉시 연쇄 폭발. */
export function explode(state, e) {
  if (e.exploded) return;
  e.exploded = true;
  const f = ENEMIES[e.type].fuse;
  const p = state.player;
  state.events.push({ type: 'overcharge', x: e.x, y: e.y, r: f.radius });
  const pr = f.radius + p.r;
  if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 <= pr * pr) damagePlayer(state, f.playerDamage, 'overcharger');
  vanish(state, e);
  for (const o of state.enemies) {
    if (o === e || o.gone || o.hp <= 0) continue;
    const rr = f.radius + o.r;
    if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > rr * rr) continue;
    if (ENEMIES[o.type].fuse && !(o.suppressed > 0)) explode(state, o);
    else damageEnemy(state, o, f.enemyDamage, false, 'overcharge', e);
  }
}

/**
 * 공통 능력 (이동 뒤): 껍질 방향 회전, 산란, 자기 보호막, 공명 보호막, 충격파, 호위 보충.
 * 구금·실명 중에는 부르지 않는다.
 */
export function updateAbilities(state, e, def, aimAt) {
  const sup = e.suppressed > 0;
  // 껍질은 대상 쪽으로 천천히 돈다 (돌아 들어가면 측면)
  if (def.turnRate) {
    const want = Math.atan2(aimAt.y - e.y, aimAt.x - e.x);
    const diff = wrap(want - (e.face ?? want));
    const max = def.turnRate * DT;
    e.face = wrap((e.face ?? want) + Math.max(-max, Math.min(max, diff)));
  }
  if (sup) return;
  const br = def.brood;
  if (br) {
    e.broodT = (e.broodT ?? 0) + DT;
    if (e.broodT >= br.interval) {
      e.broodT = 0;
      const room = br.max - childrenOf(state, e.id, (o) => !ENEMIES[o.type].clone).length;
      const n = Math.min(br.count, room);
      for (let i = 0; i < n; i++) spawnNear(state, e, br.type, i / n);
      if (n > 0) state.events.push({ type: 'brood', x: e.x, y: e.y, n });
    }
  }
  const ss = def.selfShield;
  if (ss) {
    e.selfShieldT = (e.selfShieldT ?? 0) + DT;
    if (e.selfShieldT >= ss.interval) {
      e.selfShieldT = 0;
      if (!(e.shield >= ss.amount)) {
        e.shield = ss.amount;
        e.shieldBy = e.id;
        state.events.push({ type: 'shieldPulse', x: e.x, y: e.y, r: e.r + 12 });
      }
    }
  }
  const sp = def.support;
  if (sp) {
    e.pulseT = (e.pulseT ?? 0) + DT;
    if (e.pulseT >= sp.interval) {
      e.pulseT = 0;
      const amount = sp.shield * (e.maxHp / def.hp); // 라운드 체력 배율을 따른다
      const near = state.enemies
        .filter((o) => o !== e && !o.gone && o.hp > 0 && o.type !== 'boss' && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= sp.radius * sp.radius)
        .sort((a, b) => (a.x - e.x) ** 2 + (a.y - e.y) ** 2 - ((b.x - e.x) ** 2 + (b.y - e.y) ** 2) || a.id - b.id)
        .slice(0, sp.max);
      for (const o of near) {
        if (!(o.shield >= amount)) {
          o.shield = amount;
          o.shieldBy = e.id;
        }
      }
      state.events.push({ type: 'shieldPulse', x: e.x, y: e.y, r: sp.radius, n: near.length });
    }
  }
  const sk = def.shock;
  if (sk) {
    if (e.shockWind > 0) {
      e.shockWind -= DT;
      if (e.shockWind <= 0) {
        const p = state.player;
        const rr = sk.radius + p.r;
        if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 <= rr * rr) damagePlayer(state, sk.damage, e.type);
        state.events.push({ type: 'lordShock', x: e.x, y: e.y, r: sk.radius });
      }
    } else {
      e.shockT = (e.shockT ?? 0) + DT;
      if (e.shockT >= sk.interval) {
        e.shockT = 0;
        e.shockWind = sk.telegraph;
        state.events.push({ type: 'shockTele', x: e.x, y: e.y, r: sk.radius, time: sk.telegraph });
      }
    }
  }
  const es = def.escort;
  if (es) {
    const alive = state.enemies.filter((o) => o.leader === e.id && !o.gone && o.hp > 0).length;
    if (alive < es.count) {
      e.escortT = (e.escortT ?? 0) + DT;
      if (e.escortT >= es.respawn) {
        e.escortT = 0;
        spawnNear(state, e, es.type, alive / es.count, 'leader');
      }
    } else e.escortT = 0;
  }
}

/** 보스 2단계 진입: 사이트마다 결정 기둥 (맵에 사이트가 없으면 보스 주위). */
export function spawnPillars(state, boss) {
  const cfg = ENEMIES.boss.pillars;
  const sites = Object.values(state.map?.sites ?? {});
  for (let i = 0; i < cfg.count; i++) {
    const s = sites[i] ?? {
      x: boss.x + Math.cos((i / cfg.count) * TAU) * 400,
      y: boss.y + Math.sin((i / cfg.count) * TAU) * 400,
    };
    const at = clampToFloor(state.map, boss, s);
    const c = spawn(state, 'pillar', at);
    if (c) c.leader = boss.id;
  }
  state.events.push({ type: 'pillars', count: cfg.count });
}

export function pillarCount(state, boss) {
  let n = 0;
  for (const o of state.enemies) if (o.type === 'pillar' && o.leader === boss.id && o.hp > 0 && !o.gone) n++;
  return n;
}

/** 사망 직전 (보상 처리 전): 기둥 → 보스 취약, 산란체·포식자 → 자식·분신 소멸. */
export function onEnemyDeath(state, e) {
  if (e.type === 'pillar') {
    const boss = state.enemies.find((o) => o.id === e.leader && o.hp > 0);
    if (boss) {
      boss.vulnerable = Math.max(boss.vulnerable, ENEMIES.boss.pillars.vuln);
      state.events.push({ type: 'pillarBreak', x: e.x, y: e.y, bx: boss.x, by: boss.y });
    }
  }
  for (const o of state.enemies) if (o.parent === e.id && !o.gone && o.hp > 0) vanish(state, o);
}
