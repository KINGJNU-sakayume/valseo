import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playOne } from '../sim/run.js';
import * as greedy from '../sim/bots/greedy.js';

test('시뮬레이터: greedy 봇 한 판이 끝까지 돌고 같은 시드는 같은 결과', () => {
  const a = playOne(1, greedy);
  const b = playOne(1, greedy);
  assert.deepEqual(a, b);
  assert.ok(a.round >= 1 && a.level >= 1 && a.kills > 0);
  assert.ok(a.damage > 0 && a.combatTicks > 0);
  for (const v of Object.values(a.cards)) assert.ok(v <= 20, '카드 집계가 중복되지 않는다');
});

test('시뮬레이터: 킬조이 한 판도 끝까지 돌고 결정적', () => {
  const a = playOne(2, greedy, { agent: 'killjoy' });
  const b = playOne(2, greedy, { agent: 'killjoy' });
  assert.deepEqual(a, b);
  assert.ok(a.round >= 1 && a.kills > 0);
  assert.equal(a.skills.c, `${a.skills.c}`);
});
