import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { BOSS } from '../src/data/enemies.js';
import { ROUNDS } from '../src/data/rounds.js';
import { DT } from '../src/data/balance.js';
import { startRound } from '../src/core/systems/rounds.js';
import { bossPhase } from '../src/core/systems/enemies.js';

function bossRound(seed = 1) {
  const s = createGame(seed);
  startRound(s, ROUNDS.bossRound);
  s.player.guns = [null, null];
  s.player.hp = 1e9;
  return s;
}
const idle = (s, n) => {
  for (let i = 0; i < n && s.phase === 'COMBAT'; i++) step(s, {});
};
const findBoss = (s) => s.enemies.find((e) => e.type === 'boss');

test('보스는 12라운드에 한 번 등장, HP 는 고정값', () => {
  const s = bossRound();
  idle(s, Math.ceil(ROUNDS.bossSpawnTime / DT) + 2);
  const boss = findBoss(s);
  assert.ok(boss);
  assert.equal(boss.maxHp, BOSS.hp);
  idle(s, 120);
  assert.equal(s.enemies.filter((e) => e.type === 'boss').length, 1);
});

test('보스 라운드는 타이머로 끝나지 않는다', () => {
  const s = bossRound();
  s.spawnAcc = -1e9;
  idle(s, Math.ceil((ROUNDS.combatTime + 5) / DT));
  assert.equal(s.phase, 'COMBAT');
  assert.equal(s.round, ROUNDS.bossRound);
});

test('체력 비율로 단계 전환: 원형 탄막 → 돌진 → 나선 + 소환', () => {
  const s = bossRound(2);
  s.spawnAcc = -1e9;
  idle(s, Math.ceil(ROUNDS.bossSpawnTime / DT) + 2);
  const boss = findBoss(s);
  assert.equal(bossPhase(BOSS, boss), 0);
  idle(s, Math.ceil(BOSS.phases[0].radial.interval / DT) + 2);
  assert.ok(s.enemyBullets.length >= BOSS.phases[0].radial.count, '원형 탄막');

  boss.hp = boss.maxHp * 0.5;
  let sawPhase = false;
  let sawDash = false;
  for (let i = 0; i < 60 * 8; i++) {
    step(s, {});
    sawPhase ||= s.events.some((e) => e.type === 'bossPhase' && e.phase === 1);
    sawDash ||= boss.mode === 'dash';
  }
  assert.ok(sawPhase && sawDash, `phase=${sawPhase} dash=${sawDash}`);

  boss.hp = boss.maxHp * 0.2;
  const before = s.enemies.length;
  idle(s, 30);
  assert.equal(boss.phase, 2);
  assert.ok(s.enemies.length >= before + BOSS.phases[2].summon.count, '소환');
});

test('보스 처치 = VICTORY', () => {
  const s = bossRound(3);
  idle(s, Math.ceil(ROUNDS.bossSpawnTime / DT) + 2);
  findBoss(s).hp = -1;
  step(s, {});
  assert.equal(s.phase, 'VICTORY');
  assert.ok(s.events.some((e) => e.type === 'victory'));
});

test('등장 후 격노 시간이 지나면 사격 간격이 줄어든다', () => {
  const s = bossRound(4);
  s.spawnAcc = -1e9;
  idle(s, Math.ceil(ROUNDS.bossSpawnTime / DT) + 2);
  const boss = findBoss(s);
  const volleys = (ticks) => {
    let n = 0;
    for (let i = 0; i < ticks; i++) {
      step(s, {});
      n += s.events.filter((e) => e.type === 'enemyShot' && e.enemy === 'boss').length;
      boss.hp = boss.maxHp; // 1단계 유지
    }
    return n;
  };
  const normal = volleys(60 * 15);
  boss.age = BOSS.enrageTime;
  const enraged = volleys(60 * 15);
  assert.ok(enraged > normal * 1.5, `normal=${normal} enraged=${enraged}`);
});
