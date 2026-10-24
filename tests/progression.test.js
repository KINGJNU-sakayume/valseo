import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose } from '../src/core/game.js';
import { xpNeed, gainXp } from '../src/core/systems/progression.js';
import { clearBonus } from '../src/core/systems/economy.js';
import { spawnBudget, hpScale } from '../src/core/systems/enemies.js';
import { damagePlayer } from '../src/core/systems/player.js';
import { endRound } from '../src/core/systems/rounds.js';
import { maxHp } from '../src/core/stats.js';
import { ROUNDS, SPAWN_BUDGET, ENEMY_SCALING, CLEAR_BONUS } from '../src/data/rounds.js';
import { XP_CURVE } from '../src/data/balance.js';
import { SHOP } from '../src/data/shop.js';
import { PASSIVES } from '../src/data/passives.js';
import { run } from './helpers.js';

const shopIndex = (s, pred) => s.pending.options.findIndex(pred);

test('공식: xpNeed / 스폰 예산 / 체력 배율 / 클리어 보너스', () => {
  const { a, b, c } = XP_CURVE;
  for (const L of [1, 10, 20]) assert.equal(xpNeed(L), a + b * L + c * L * L);
  assert.equal(spawnBudget(1), SPAWN_BUDGET.S0);
  assert.ok(Math.abs(spawnBudget(12) - (SPAWN_BUDGET.S0 + 11 * SPAWN_BUDGET.g)) < 1e-9);
  assert.ok(Math.abs(hpScale(12) - (1 + 11 * ENEMY_SCALING.k)) < 1e-9);
  assert.equal(clearBonus(3), CLEAR_BONUS.B0 + 3 * CLEAR_BONUS.b1);
});

test('XP 로 레벨업 → pending 동안 step 정지 → choose 로 카드 적용', () => {
  const s = createGame(1);
  gainXp(s, xpNeed(1) + xpNeed(2)); // 두 번 레벨업
  assert.equal(s.player.level, 3);
  assert.equal(s.levelUpsQueued, 2);
  step(s, {});
  assert.equal(s.pending.kind, 'levelup');
  assert.equal(s.pending.options.length, 3);
  const tick = s.tick;
  step(s, {});
  assert.equal(s.tick, tick, 'pending 중에는 진행하지 않는다');

  const card = s.pending.options[0];
  assert.ok(card.title && card.desc.includes('→'), '카드에 변화량 표시');
  assert.equal(choose(s, 0), true);
  assert.equal(s.pending.kind, 'levelup', '두 번째 레벨업이 이어서 뜬다');
  choose(s, 0);
  assert.equal(s.pending, null);
  assert.equal(s.levelUpsQueued, 0);
});

test('최대 HP 패시브는 늘어난 만큼 회복, 최대 중첩 후에는 후보에서 빠진다', () => {
  const s = createGame(1);
  const before = maxHp(s.player);
  s.pending = { kind: 'levelup', options: [{ type: 'passive', key: 'maxHp' }] };
  s.levelUpsQueued = 1;
  choose(s, 0);
  assert.ok(Math.abs(maxHp(s.player) - before * (1 + PASSIVES.maxHp.perStack)) < 1e-9);
  assert.ok(Math.abs(s.player.hp - maxHp(s.player)) < 1e-9);

  s.player.passives = { maxHp: 5, moveSpeed: 5, magnetRadius: 5 };
  for (const k of Object.keys(s.player.skills)) s.player.skills[k].level = 5;
  s.player.guns.forEach((g) => g && (g.mods = { fireRate: 5, pierce: 5, bulletSpeed: 5, critChance: 5 }));
  gainXp(s, xpNeed(s.player.level));
  step(s, {});
  assert.deepEqual(s.pending.options.map((o) => o.type), ['heal'], '후보가 없으면 대체 카드');
});

test('라운드 종료: 적 소멸, 조각 자동 흡수, 클리어 보너스, BUY 진입', () => {
  const s = createGame(3);
  for (let i = 0; i < 60 * 20; i++) {
    if (s.pending) choose(s, 0);
    else step(s, {});
  }
  s.enemies.push({ id: 999, type: 'chaser', x: 0, y: 0, r: 1, hp: 1, maxHp: 1, speed: 0, damage: 0 });
  s.pickups.push({ kind: 'credit', x: 0, y: 0, r: 1, value: 77 });
  const credits = s.credits;
  endRound(s);
  assert.equal(s.phase, 'BUY');
  assert.equal(s.enemies.length, 0);
  assert.equal(s.pickups.length, 0);
  assert.equal(s.credits, credits + 77 + clearBonus(1));
});

test('라운드 타이머가 끝나면 BUY, 다음 라운드에서 HP 회복', () => {
  const s = createGame(4);
  s.player.guns = [null, null];
  s.player.invuln = 1e9; // 피해 무시
  while (s.phase === 'COMBAT') {
    if (s.pending) choose(s, 0);
    else step(s, {});
  }
  assert.equal(s.phase, 'BUY');
  assert.ok(s.roundTime >= ROUNDS.combatTime);
  while (s.pending.kind !== 'shop') choose(s, 0);
  s.player.hp = 10;
  choose(s, shopIndex(s, (o) => o.kind === 'next'));
  assert.equal(s.phase, 'COMBAT');
  assert.equal(s.round, 2);
  assert.ok(Math.abs(s.player.hp - (10 + maxHp(s.player) * ROUNDS.startHealPct)) < 1e-9);
});

test('상점: 총 구매, 티어 업, 방어구, 크레딧 부족 시 거절', () => {
  const s = createGame(5);
  endRound(s);
  while (s.pending?.kind !== 'shop') choose(s, 0) || step(s, {});
  s.credits = 0;
  s.pending = null;
  step(s, {}); // phase BUY → 상점 재생성
  const sheriff = shopIndex(s, (o) => o.kind === 'buyGun' && o.id === 'sheriff');
  assert.equal(choose(s, sheriff), false, '크레딧 부족');

  s.credits = 10000;
  s.pending = null;
  step(s, {});
  choose(s, shopIndex(s, (o) => o.kind === 'buyGun' && o.id === 'sheriff'));
  assert.equal(s.player.guns[0].id, 'sheriff');
  assert.equal(s.credits, 10000 - SHOP.guns.sheriff);
  assert.equal(shopIndex(s, (o) => o.kind === 'buyGun' && o.id === 'sheriff'), -1, '보유 총은 목록에서 제외');

  choose(s, shopIndex(s, (o) => o.kind === 'tierUp' && o.slot === 0));
  assert.equal(s.player.guns[0].tier, 2);

  choose(s, shopIndex(s, (o) => o.kind === 'armor' && o.id === 'heavy'));
  assert.equal(s.player.shield, SHOP.armor.heavy.shield);
  assert.equal(s.pending.options[shopIndex(s, (o) => o.kind === 'armor' && o.id === 'light')].enabled, false);

  choose(s, shopIndex(s, (o) => o.kind === 'buyGun' && o.id === 'vandal'));
  assert.equal(s.player.guns[0].id, 'vandal', '주무기 슬롯 교체');
  assert.equal(s.player.guns[1].id, 'classic');
});

test('실드가 HP보다 먼저 피해를 흡수한다', () => {
  const s = createGame(1);
  s.player.shield = s.player.shieldMax = 25;
  damagePlayer(s, 10, 'test');
  assert.equal(s.player.shield, 15);
  assert.equal(s.player.hp, maxHp(s.player));
  s.player.invuln = 0;
  damagePlayer(s, 20, 'test');
  assert.equal(s.player.shield, 0);
  assert.equal(s.player.hp, maxHp(s.player) - 5);
});

test('여러 라운드를 거치는 전체 런이 결정적이고 크레딧을 쓴다', () => {
  const a = run(createGame(11), 60 * 60 * 6);
  const b = run(createGame(11), 60 * 60 * 6);
  assert.equal(JSON.stringify([a.tick, a.round, a.credits, a.player]), JSON.stringify([b.tick, b.round, b.credits, b.player]));
  assert.ok(a.round >= 2, `round=${a.round}`);
  assert.ok(a.player.level > 1);
  assert.ok(a.player.guns[0], '상점에서 주무기를 샀다');
});
