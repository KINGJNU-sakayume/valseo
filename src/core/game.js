import { updateObjective, dropWeaponBox, boxOptions } from './systems/objectives.js';
import { relicOptions, gainRelic } from './systems/relics.js';
import { createState, createGunSlot } from './state.js';
import { DT, SPATIAL } from '../data/balance.js';
import { ENEMIES, isBig } from '../data/enemies.js';
import { createSpatialHash, clearHash, insert, query } from './spatial.js';
import { updatePlayer, damagePlayer } from './systems/player.js';
import { updateWeapons, updateBullets, removeAt } from './systems/weapons.js';
import { updateSpawns, updateEnemies } from './systems/enemies.js';
import { dropPickup, updatePickups } from './systems/pickups.js';
import { levelUpOptions, applyCard } from './systems/progression.js';
import { shopOptions, buy } from './systems/economy.js';
import { startRound, updateRound, updateSweep, endRound } from './systems/rounds.js';
import { gainCredits } from './systems/economy.js';
import { ROUNDS, ROUND_TYPES, MUTATIONS } from '../data/rounds.js';
import { updateSkills, onEnemyKilled, onBulletHit, killCreditMult, agentPlan } from './systems/skills.js';
import { checkEvolutions, onGunHit, onGunKill, gunHitMult, evolveOptions, evolve } from './systems/evolution.js';
import { GUNS, HEADSHOT } from '../data/guns.js';
import { nextFloat } from './rng.js';
import { branchOptions, masteryOptions } from './systems/progression.js';
import { damageEnemy } from './systems/combat.js';
import { onEnemyDeath } from './systems/mutants.js';
import { pushOut, updateMap } from './systems/map.js';
import { updateTactics, processTriggers, creditMult } from './systems/tactics.js';
import { TRIGGER_DEPTH, TACTICS } from '../data/tactics.js';
import { drawCards, cardKey, describeCard } from './systems/progression.js';

// 공간 해시와 질의 버퍼는 매 틱 재구성되는 캐시라 state 밖에 둔다 (결정성에 영향 없음).
const hash = createSpatialHash(SPATIAL.cellSize);
const near = [];

export { DT };

export function createGame(seed = 1, agent = 'chamber') {
  const state = createState(seed, agent);
  startRound(state, 1);
  state.events.length = 0;
  return state;
}

/** 1틱(DT) 진행. pending 이 있거나 전투 중이 아니면 no-op. */
export function step(state, input = {}) {
  state.events.length = 0;
  if (state.pending) return state;
  if (state.phase === 'SWEEP') {
    updateSweep(state);
    processDeaths(state);
    if (state.sweepT >= ROUNDS.sweepTime) endRound(state, false);
    refreshPending(state);
    state.tick++;
    state.time = state.tick * DT;
    return state;
  }
  if (state.phase !== 'COMBAT') {
    refreshPending(state); // BUY 인데 상점이 아직 안 열렸으면 연다
    return state;
  }
  // 계획 단계 (아스트라 라운드 시작 별 배치): 시간이 멈춘 채 배치 입력만 받는다
  if (state.planning) {
    if (input.aim) {
      state.player.aimX = input.aim.x;
      state.player.aimY = input.aim.y;
    }
    if (agentPlan(state, input)) return state;
  }

  updatePlayer(state, input);
  pushOut(state.map, state.player);
  updateTactics(state);
  updateSkills(state, input);
  updateWeapons(state);
  updateBullets(state);
  updateSpawns(state);
  updateEnemies(state);
  updateMap(state);
  resolveCollisions(state);
  if (state.phase === 'COMBAT') {
    updateObjective(state);
    const before = state.events.length;
    updatePickups(state);
    // 흡수 이벤트에 반응하는 전술 카드 (자석 폭발)
    if (state.player.tactics.magnetBlast && state.events.length > before) {
      processTriggers(state, before, 1, blastAt);
      processDeaths(state);
    }
    updateRound(state);
  }
  refreshPending(state);

  state.tick++;
  state.time = state.tick * DT;
  return state;
}

/**
 * state.pending 에 대한 응답. 성공하면 true.
 * - levelup: 카드 index 적용
 * - branch: 스킬 분기 A/B
 * - shop: 상점 항목 index 구매 ('다음 라운드' 포함)
 */
export function choose(state, index) {
  const pending = state.pending;
  if (!pending) return false;
  const opt = pending.options[index];
  if (!opt) return false;

  if (pending.kind === 'levelup') {
    applyCard(state, opt);
    state.levelUpsQueued--;
  } else if (pending.kind === 'branch') {
    state.player.skills[pending.key].branch = opt.branch;
    state.branchQueue.shift();
    state.events.push({ type: 'branch', skill: pending.key, branch: opt.branch });
  } else if (pending.kind === 'evolve') {
    evolve(state, state.player.guns[opt.slot], opt.route);
    state.evolveQueue.shift();
  } else if (pending.kind === 'weaponBox') {
    const b = state.boxQueue.shift();
    if (opt.take) {
      const slot = createGunSlot(b.gun);
      slot.tier = b.tier;
      state.player.guns[0] = slot;
      state.events.push({ type: 'boxTaken', gun: b.gun, tier: b.tier });
    }
  } else if (pending.kind === 'reward') {
    applyCard(state, opt);
    state.rewardQueue--;
  } else if (pending.kind === 'relic') {
    gainRelic(state, opt.relic);
    state.relicQueue--;
  } else if (pending.kind === 'mastery') {
    state.player.skills[pending.key].mastery = opt.mastery;
    state.masteryQueue.shift();
    state.events.push({ type: 'mastery', skill: pending.key, mastery: opt.mastery });
  } else if (pending.kind === 'shop') {
    if (!opt.enabled) return false;
    if (opt.kind === 'next') startRound(state, state.round + 1);
    else buy(state, opt);
  }
  state.pending = null;
  checkEvolutions(state);
  refreshPending(state);
  return true;
}

/** 레벨업 카드 3장을 새로 뽑는다 (판당 LEVELUP.rerolls 회). 성공하면 true. */
export function reroll(state) {
  if (state.pending?.kind !== 'levelup' || state.rerolls <= 0) return false;
  state.rerolls--;
  state.pending.options = levelUpOptions(state);
  state.events.push({ type: 'reroll' });
  return true;
}

/** 레벨업 카드 index 를 추방: 그 판에서 다시 나오지 않고, 그 자리는 새 카드로. 성공하면 true. */
export function banish(state, index) {
  const opts = state.pending?.kind === 'levelup' ? state.pending.options : null;
  const card = opts?.[index];
  if (!card || card.type === 'heal' || state.banishes <= 0) return false;
  state.banishes--;
  state.player.banished.push(cardKey(card));
  const [next] = drawCards(state, 1, opts.map(cardKey));
  opts[index] = describeCard(state, next ?? { type: 'heal' });
  state.events.push({ type: 'banish', card: cardKey(card) });
  return true;
}

/** 진화 → 유물 → 형태 증강 → 숙련 증강 → 레벨업 → 구매 페이즈 상점 순. */
function refreshPending(state) {
  if (state.pending) return;
  if (state.phase !== 'COMBAT' && state.phase !== 'BUY') return;
  let relicOpts = null;
  if (state.evolveQueue.length === 0 && state.relicQueue > 0) {
    relicOpts = relicOptions(state, 3 + (state.player.tactics.eliteHunter ? TACTICS.eliteHunter.extraChoice : 0));
    if (!relicOpts.length) state.relicQueue = 0; // 유물을 전부 가졌다
  }
  if (state.evolveQueue.length > 0) {
    const i = state.evolveQueue[0];
    state.pending = { kind: 'evolve', slot: i, options: evolveOptions(state, i) };
  } else if (relicOpts?.length) {
    state.pending = { kind: 'relic', options: relicOpts }; // 엘리트 유물 3지선다
  } else if (state.boxQueue?.length) {
    state.pending = { kind: 'weaponBox', options: boxOptions(state.boxQueue[0]) };
  } else if (state.rewardQueue > 0) {
    // 해체 보상: 전술 카드 선택
    const opts = drawCards(state, ROUND_TYPES.defuse.tacticChoices, [], (c) => c.type === 'tactic').map((c) => describeCard(state, c));
    if (opts.length) state.pending = { kind: 'reward', options: opts };
    else state.rewardQueue = 0;
  } else if (state.branchQueue.length > 0) {
    const key = state.branchQueue[0];
    state.pending = { kind: 'branch', key, options: branchOptions(state, key) };
  } else if (state.masteryQueue.length > 0) {
    const key = state.masteryQueue[0];
    state.pending = { kind: 'mastery', key, options: masteryOptions(state, key) };
  } else if (state.levelUpsQueued > 0) {
    state.pending = { kind: 'levelup', options: levelUpOptions(state) };
  } else if (state.phase === 'BUY') {
    state.pending = { kind: 'shop', options: shopOptions(state) };
  }
}

function resolveCollisions(state) {
  const { enemies, bullets, player } = state;
  clearHash(hash);
  for (const e of enemies) insert(hash, e);

  // 투사체 vs 적
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    query(hash, b.x, b.y, b.r, near);
    let consumed = false;
    for (const e of near) {
      if (e.hp <= 0 || e.gone || b.hitIds.includes(e.id)) continue;
      const rr = e.r + b.r;
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      if (dx * dx + dy * dy > rr * rr) continue;
      // 헤드샷: 총탄만. 조준점이 적 위면 크리, 자동 조준은 확률 (설계 8.3)
      let hs = false;
      if (GUNS[b.source] && !b.crit) {
        hs = player.autoAim
          ? nextFloat(state.rng) < HEADSHOT.autoChance
          : (player.aimX - e.x) ** 2 + (player.aimY - e.y) ** 2 <= (e.r + HEADSHOT.margin) ** 2;
        if (hs) state.events.push({ type: 'headshot', x: e.x, y: e.y, source: b.source });
      }
      const mult = GUNS[b.source] ? gunHitMult(state, b, e) : 1;
      const crit = damageEnemy(state, e, b.damage * mult, b.crit || hs, b.source, { x: b.x - b.vx, y: b.y - b.vy });
      b.hitIds.push(e.id);
      // 밀쳐내기 (총기 특색): 탄이 날아온 방향으로. 엘리트·보스는 1/4
      const kb = GUNS[b.source]?.knockback;
      if (kb && e.hp > 0 && e.type !== 'pillar') {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const k = isBig(e) ? kb / 4 : kb;
        e.x += (b.vx / sp) * k;
        e.y += (b.vy / sp) * k;
        pushOut(state.map, e);
      }
      onBulletHit(state, b, e);
      const last = b.pierce <= 0;
      onGunHit(state, b, crit, e, last);
      if (b.pierce-- <= 0) {
        consumed = true;
        if (b.hitIds.length >= 2) state.events.push({ type: 'shrapnel', x: e.x, y: e.y, damage: b.damage }); // 관통 파편
        break;
      }
    }
    if (consumed) removeAt(bullets, i);
  }

  // 적 vs 플레이어 (접촉 피해)
  query(hash, player.x, player.y, player.r, near);
  for (const e of near) {
    if (e.hp <= 0 || e.gone) continue;
    const rr = e.r + player.r;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    if (dx * dx + dy * dy <= rr * rr) damagePlayer(state, e.damage, e.type);
  }

  processDeaths(state);
  // 전술 카드 트리거: 반응이 새 처치를 만들면 깊이 제한까지 다시 처리
  let from = 0;
  for (let depth = 1; depth <= TRIGGER_DEPTH && from < state.events.length; depth++) {
    from = processTriggers(state, from, depth, blastAt);
    processDeaths(state);
  }
}

/** 원형 범위 피해 (전술 카드 폭발 연쇄 등). */
function blastAt(state, x, y, r, damage, source) {
  for (const e of state.enemies) {
    const rr = r + e.r;
    if (e.hp > 0 && (e.x - x) ** 2 + (e.y - y) ** 2 <= rr * rr) damageEnemy(state, e, damage, false, source);
  }
}

/** 사망 처리 → XP 조각 드롭, 크레딧 즉시 지급. 섬멸 파동 처치는 XP만 (크레딧·처치 효과 없음). */
function processDeaths(state) {
  const enemies = state.enemies;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.gone) {
      removeAt(enemies, i);
      continue;
    }
    if (e.hp > 0) continue;
    const def = ENEMIES[e.type];
    const swept = e.killedBy === 'sweep';
    onEnemyDeath(state, e);
    state.stats.kills++;
    state.stats.roundKills++;
    state.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type, by: e.killedBy, crit: !!e.lastCrit, vuln: e.vulnerable > 0 });
    const markHunt = state.player.tactics.markHunt && e.mark > 0 && !swept; // 표식 사냥
    dropPickup(state, 'xp', e.x, e.y, def.xp * (markHunt ? TACTICS.markHunt.xpMult : 1));
    if (markHunt) gainCredits(state, TACTICS.markHunt.credits);
    if (!swept) {
      if (def.credits > 0 && !e.noCredit) {
        const before = state.credits;
        gainCredits(state, def.credits * creditMult(state) * killCreditMult(state, e) * (state.mutation === 'overcharge' ? MUTATIONS.overcharge.creditMult : 1));
        state.events.push({ type: 'credit', x: e.x, y: e.y, value: state.credits - before });
      }
      onEnemyKilled(state, e);
      onGunKill(state, e);
      dropWeaponBox(state, e);
    }
    removeAt(enemies, i);
    if (def.ai === 'boss' && state.phase === 'COMBAT') {
      state.phase = 'VICTORY';
      state.events.push({ type: 'victory', round: state.round, kills: state.stats.kills, time: state.time });
    }
  }
}
