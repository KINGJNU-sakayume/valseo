import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, choose, reroll, banish } from '../src/core/game.js';
import { TACTICS } from '../src/data/tactics.js';
import { PASSIVES, LEVELUP } from '../src/data/passives.js';
import { CRIT, DT } from '../src/data/balance.js';
import { ROUNDS } from '../src/data/rounds.js';
import { STATUS } from '../src/data/agents.js';
import { damageEnemy } from '../src/core/systems/combat.js';
import { spawn } from '../src/core/systems/enemies.js';
import { addField } from '../src/core/systems/fields.js';
import { gainXp, xpNeed, levelUpOptions, cardKey } from '../src/core/systems/progression.js';
import { tagCounts } from '../src/core/systems/tactics.js';
import { maxHp } from '../src/core/stats.js';

function quiet(agent = 'chamber') {
  const s = createGame(1, agent);
  s.spawnAcc = -1e9;
  s.nextSpawn = 'chaser';
  s.player.guns = [null, null];
  s.player.invuln = 1e9;
  s.roundTime = 30; // 기선 제압 시간 밖
  return s;
}
function dummy(s, x = 1300, y = 1000, hp = 1e6) {
  const e = spawn(s, 'chaser', { x, y });
  e.hp = e.maxHp = hp;
  e.speed = 0;
  return e;
}
const dealt = (s, e, base, crit, source) => {
  const before = e.hp;
  damageEnemy(s, e, base, crit, source);
  return before - e.hp;
};
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('태그형 패시브: 해당 태그 출처만 강해진다', () => {
  const s = quiet();
  s.player.passives.blastDamage = 2;
  const e = dummy(s);
  assert.ok(near(dealt(s, e, 10, false, 'trap'), 10 * (1 + 2 * PASSIVES.blastDamage.perStack)));
  assert.ok(near(dealt(s, e, 10, false, 'vandal'), 10));
});

test('정지 사격: 0.5초 멈추면 총기 피해 +25%, 스킬은 그대로', () => {
  const s = quiet();
  s.player.tactics.standStill = true;
  const e = dummy(s);
  s.player.stillT = 0.2;
  assert.ok(near(dealt(s, e, 10, false, 'vandal'), 10));
  for (let i = 0; i < 40; i++) step(s, {});
  assert.ok(s.player.stillT >= 0.5);
  assert.ok(near(dealt(s, e, 10, false, 'vandal'), 12.5));
  assert.ok(near(dealt(s, e, 10, false, 'trap'), 10));
});

test('기선 제압·냉혹·감속 증폭·집중', () => {
  const s = quiet();
  const e = dummy(s);
  s.player.tactics.opener = true;
  s.roundTime = 5;
  assert.ok(near(dealt(s, e, 10, false, 'trap'), 13));
  s.roundTime = 30;
  s.player.tactics = { ruthless: true };
  assert.ok(near(dealt(s, e, 10, false, 'trap'), 8.5));
  assert.ok(near(dealt(s, e, 10, true, 'trap'), 10 * (CRIT.multiplier + TACTICS.ruthless.critBonus)));
  s.player.tactics = { slowAmp: true };
  addField(s, e.x, e.y, 50, 5, 0.4);
  // 체임버는 감속 필드 안이면 집중포화로 크리
  assert.ok(near(dealt(s, e, 10, false, 'trap'), 10 * CRIT.multiplier * (1 + 0.4 * 0.5)));
  s.fields.length = 0;
  s.player.tactics = { focus: true };
  dealt(s, e, 10, false, 'vandal');
  assert.ok(near(dealt(s, e, 10, false, 'vandal'), 10.5), '두 번째 연속 명중 +5%');
  const other = dummy(s, 1400, 1000);
  assert.ok(near(dealt(s, other, 10, false, 'vandal'), 10), '대상이 바뀌면 초기화');
});

test('표식: 받는 피해 증가, 시간이 지나면 풀린다', () => {
  const s = quiet();
  const e = dummy(s);
  e.mark = 0.1;
  assert.ok(near(dealt(s, e, 10, false, 'trap'), 10 * STATUS.markMult));
  for (let i = 0; i < 10; i++) step(s, {});
  assert.equal(e.mark, 0);
});

test('연쇄 반응: 크리 처치 자리에 감속 장판 (내부 쿨다운)', () => {
  const s = quiet();
  s.player.tactics.chainReaction = true;
  const a = dummy(s, 1300, 1000, 1);
  const b = dummy(s, 1300, 1100, 1);
  damageEnemy(s, a, 10, true, 'vandal');
  damageEnemy(s, b, 10, true, 'vandal');
  step(s, {});
  assert.equal(s.fields.length, 1, '같은 틱 두 번째는 내부 쿨다운');
  assert.ok(Math.abs(s.fields[0].x - 1300) < 1e-9);
});

test('취약 전염: 취약 적이 죽으면 가까운 적 2명에게 취약', () => {
  const s = quiet();
  s.player.tactics.vulnSpread = true;
  const dead = dummy(s, 1300, 1000, 1);
  dead.vulnerable = 1;
  const a = dummy(s, 1350, 1000);
  const b = dummy(s, 1300, 1060);
  const far = dummy(s, 1700, 1000);
  damageEnemy(s, dead, 10, false, 'vandal');
  step(s, {});
  assert.ok(a.vulnerable > 0 && b.vulnerable > 0);
  assert.ok(!(far.vulnerable > 0));
});

test('폭발 연쇄: 폭발로 죽은 적이 소폭발 (깊이 제한)', () => {
  const s = quiet();
  s.player.tactics.blastChain = true;
  const old = TACTICS.blastChain.chance;
  TACTICS.blastChain.chance = 1;
  try {
    const chain = [0, 1, 2, 3, 4, 5].map((i) => dummy(s, 1300 + i * 60, 1000, 1));
    damageEnemy(s, chain[0], 10, false, 'trap');
    step(s, {});
    const alive = chain.filter((e) => s.enemies.includes(e)).length;
    assert.ok(alive < 5, '연쇄로 이웃이 죽는다');
    assert.ok(alive > 0, '깊이 제한으로 끝없이 이어지지 않는다');
  } finally {
    TACTICS.blastChain.chance = old;
  }
});

test('쿨다운 순환·위기 대응', () => {
  const s = quiet('killjoy');
  s.player.skills.e.level = 1;
  s.player.skills.e.cd = 5;
  s.player.tactics.cdCycle = true;
  damageEnemy(s, dummy(s, 1300, 1000, 1), 10, false, 'alarmbot');
  step(s, {});
  assert.ok(s.player.skills.e.cd < 5 - TACTICS.cdCycle.amount + 1e-9);

  const t = quiet('killjoy');
  t.player.skills.e.level = 1;
  t.player.tactics.crisis = true;
  t.player.skills.e.cd = 5;
  t.player.hp = maxHp(t.player) * 0.2;
  step(t, {});
  const fast = 5 - t.player.skills.e.cd;
  assert.ok(fast > DT * 1.5, `위기 대응 중 쿨다운이 빨리 돈다 (${fast})`);
});

test('런앤건: 순간이동 후 연사 증가', () => {
  const s = quiet();
  s.player.tactics.runAndGun = true;
  s.events.length = 0;
  s.player.skills.e.level = 1;
  step(s, { keys: { e: true } }); // 앵커
  for (let i = 0; i < 30; i++) step(s, {});
  step(s, { keys: { e: true } }); // 귀환
  assert.ok(s.player.runGun > 0);
});

test('정리 전문가: 정리 페이즈에 이동속도·처치 크레딧 증가', () => {
  const s = quiet();
  s.player.tactics.cleaner = true;
  s.cleanup = true;
  const x = s.player.x;
  step(s, { move: { x: 1, y: 0 } });
  const moved = s.player.x - x;
  const t = quiet();
  t.cleanup = true;
  step(t, { move: { x: 1, y: 0 } });
  assert.ok(moved > (t.player.x - x) * 1.2);
  dummy(s, 1300, 1300, 0).hp = 0;
  s.enemies.push(dummy(s, 1300, 1300, 1));
  const c = s.credits;
  damageEnemy(s, s.enemies[s.enemies.length - 1], 10, false, 'vandal');
  step(s, {});
  assert.ok(s.credits - c >= 10 * TACTICS.cleaner.credit);
});

test('리롤·추방: 횟수 제한, 추방한 카드는 다시 안 나온다', () => {
  const s = quiet();
  gainXp(s, xpNeed(s.player.level));
  step(s, {});
  assert.equal(s.pending.kind, 'levelup');
  for (let i = 0; i < LEVELUP.rerolls; i++) assert.ok(reroll(s));
  assert.equal(reroll(s), false);
  const key = cardKey(s.pending.options[0]);
  assert.ok(banish(s, 0));
  assert.notEqual(cardKey(s.pending.options[0]), key);
  for (let i = 0; i < 40; i++) {
    for (const o of levelUpOptions(s)) assert.notEqual(cardKey(o), key);
  }
  assert.ok(banish(s, 1));
  assert.equal(banish(s, 2), false, '추방 횟수 소진');
  choose(s, 0);
});

test('시너지 가중: 보유 태그와 겹치는 전술 카드가 더 자주 나온다', () => {
  const count = (setup) => {
    let n = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const s = createGame(seed);
      setup(s);
      for (const o of levelUpOptions(s)) if (o.type === 'tactic' && TACTICS[o.key].tags.includes('blast')) n++;
    }
    return n;
  };
  const base = count(() => {});
  const withBlast = count((s) => {
    s.player.passives.blastDamage = 1;
  });
  assert.ok(withBlast > base, `${withBlast} > ${base}`);
});

test('태그 수: 카드·패시브만 (공명용) vs 킷 포함', () => {
  const s = quiet();
  s.player.tactics.ruthless = true;
  s.player.passives.zoneDamage = 1;
  const res = tagCounts(s, false);
  assert.deepEqual(res, { crit: 1, zone: 1 });
  const all = tagCounts(s, true);
  assert.ok(all.gadget >= 1 && all.zone >= 2, '트레이드마크 태그 포함');
});

test('결정성: 전술 카드가 있어도 같은 시드는 같은 결과', () => {
  const play = () => {
    const s = createGame(21);
    s.player.tactics = { chainReaction: true, blastChain: true, focus: true, opener: true };
    for (let i = 0; i < 60 * 40; i++) {
      if (s.pending) choose(s, 0);
      else step(s, { aim: { x: s.player.x + 100, y: s.player.y } });
    }
    return JSON.stringify([s.tick, s.stats, s.credits, s.player.hp]);
  };
  assert.equal(play(), play());
  assert.ok(ROUNDS.count > 0);
});
