import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { GUNS, TIERS } from '../src/data/guns.js';
import { TAGS } from '../src/data/tags.js';
import { createGunSlot } from '../src/core/state.js';
import { gunStats } from '../src/core/stats.js';
import { openRoutes } from '../src/core/systems/evolution.js';
import { skillOrder } from '../sim/bots/greedy.js';

// 주무기 진화 경로 확장 (설계 29장): 주무기도 흔한 태그(폭발·설치물·표식·경제·총기·크리·장판)로 진화한다.

function quiet(seed = 1, agent = 'chamber') {
  const s = createGame(seed, agent);
  s.spawnAcc = -1e9;
  s.nextSpawn = 'chaser';
  s.player.invuln = 1e9;
  s.player.stillT = 1;
  return s;
}
function enemy(s, x, y, hp = 1e6) {
  const e = { id: s.nextId++, type: 'chaser', x, y, r: 12, hp, maxHp: hp, speed: 0, damage: 0, mode: 'move', t: 0, dirX: 0, dirY: 0, fireCd: 99 };
  s.enemies.push(e);
  return e;
}
const gun = (id, evolved = false) => ({ ...createGunSlot(id), tier: evolved ? TIERS.max : 1, evolved });
const aimAt = (s) => ({ aim: { x: s.player.x + 400, y: s.player.y } });

// 진화 효과 코드가 읽는 키 (오타로 효과가 조용히 사라지는 것을 막는다)
const EFFECT_KEYS = new Set([
  'name', 'desc', 'duration', 'fireRateBonus', 'firstShot', 'vulnHit', 'runFireRate', 'reloadGadget', 'magazineMult', 'pelletBonus', 'primeCooldown',
  'fieldHit', 'hop', 'pierceRamp', 'endGadget', 'markHit', 'markedMult', 'splash', 'suppressHit', 'killCredits', 'perThousand', 'streak', 'burst', 'spread', 'homing',
]);

test('진화 경로 데이터: 태그가 실재하고, 효과 키가 코드가 읽는 것이며, 이름·설명이 있다', () => {
  for (const [id, g] of Object.entries(GUNS)) {
    for (const [tag, ev] of Object.entries(g.evolutions)) {
      assert.ok(TAGS[tag], `${id}.${tag}: 없는 태그`);
      assert.ok(ev.name && ev.desc, `${id}.${tag}: 이름·설명`);
      const effects = Object.keys(ev).filter((k) => !['name', 'desc'].includes(k));
      assert.ok(effects.length > 0, `${id}.${tag}: 효과 없음`);
      for (const k of effects) assert.ok(EFFECT_KEYS.has(k), `${id}.${tag}: 알 수 없는 효과 키 ${k}`);
    }
  }
});

test('주무기는 경로가 5개 이상이고 폭발·표식 경로를 갖는다 (흔한 태그로 진화)', () => {
  for (const id of ['vandal', 'spectre', 'judge', 'operator']) {
    const tags = Object.keys(GUNS[id].evolutions);
    assert.ok(tags.length >= 5, `${id}: ${tags.length}`);
    assert.ok(tags.includes('blast'), `${id} 폭발`);
    assert.ok(tags.includes('mark') || tags.includes('zone'), `${id} 표식/장판`);
  }
});

test('공명: 폭발 태그 3개면 주무기 티어 3이 진화 경로로 인식한다', () => {
  const s = quiet();
  s.player.guns = [{ ...createGunSlot('vandal'), tier: TIERS.max }, null];
  assert.deepEqual(openRoutes(s, s.player.guns[0]), []);
  // 폭발 3 (형태·숙련 증강으로 센다)
  s.player.skills.c.level = 5;
  s.player.skills.c.branch = 'A'; // 폭발형
  s.player.tactics.blastChain = true;
  s.player.tactics.magnetBlast = true;
  assert.ok(openRoutes(s, s.player.guns[0]).includes('blast'));
});

test('파쇄탄 밴달: 명중한 적 주변 적에게 튄다', () => {
  const s = quiet();
  s.player.guns = [gun('vandal', 'blast'), null];
  const a = enemy(s, s.player.x + 200, s.player.y);
  const b = enemy(s, s.player.x + 200, s.player.y + 30);
  for (let i = 0; i < 20; i++) step(s, { aim: { x: a.x + 100, y: a.y } });
  assert.ok(b.hp < b.maxHp);
});

test('황금탄 밴달: 처치 크레딧 +4', () => {
  const s = quiet();
  s.player.guns = [gun('vandal', 'economy'), null];
  enemy(s, s.player.x + 150, s.player.y, 1);
  const before = s.credits;
  for (let i = 0; i < 20; i++) step(s, aimAt(s));
  assert.ok(s.credits - before >= GUNS.vandal.evolutions.economy.killCredits);
});

test('추적 스펙터·추적 저지: 명중한 적에게 표식', () => {
  for (const id of ['spectre', 'judge']) {
    const s = quiet();
    s.player.guns = [gun(id, 'mark'), null];
    const e = enemy(s, s.player.x + 120, s.player.y);
    for (let i = 0; i < 20; i++) step(s, { aim: { x: e.x + 100, y: e.y } });
    assert.ok(e.mark > 0, id);
  }
});

test('공학탄 밴달: 명중 지점에 요원의 C 설치물, 3초에 한 번', () => {
  const s = quiet(1, 'chamber');
  s.player.guns = [gun('vandal', 'gadget'), null];
  enemy(s, s.player.x + 150, s.player.y);
  for (let i = 0; i < 30; i++) step(s, aimAt(s));
  // 놓인 덫은 곁의 적에게 발동해 감속 필드가 된다: 덫이든 필드든 연사해도 한 번만 (내부 쿨다운)
  assert.equal(s.traps.length + s.fields.length, 1);
});

test('중력탄 오퍼레이터: 사격마다 첫 착탄 지점에 감속 장판', () => {
  const s = quiet();
  s.player.guns = [gun('operator', 'zone'), null];
  enemy(s, s.player.x + 150, s.player.y);
  for (let i = 0; i < 10; i++) step(s, aimAt(s));
  assert.ok(s.fields.length >= 1);
});

test('정조준 오퍼레이터·저지: 탄창 첫 발은 크리, 관통은 그대로', () => {
  for (const id of ['operator', 'judge', 'spectre']) {
    const s = quiet();
    s.player.guns = [gun(id, 'crit'), null];
    step(s, aimAt(s));
    assert.ok(s.bullets.length >= 1, id);
    assert.ok(s.bullets.every((b) => b.crit), `${id} 첫 발 크리`);
    assert.ok(s.bullets.every((b) => b.pierce === GUNS[id].pierce), `${id} 관통 변화 없음`);
  }
});

test('확장 탄창 밴달·드럼 저지·장전 오퍼레이터: 탄창 배율', () => {
  for (const [id, route] of [['vandal', 'gun'], ['judge', 'gun'], ['operator', 'gun']]) {
    const base = gunStats(gun(id), {}, null).magazine;
    const evo = gunStats(gun(id, route), {}, null).magazine;
    assert.equal(evo, Math.round(base * GUNS[id].evolutions[route].magazineMult), id);
  }
});

test('봇 스킬 우선순위: 시드마다 맨 앞 스킬이 돌고, opts.skill 로 고정할 수 있다', () => {
  const firsts = new Set();
  for (let seed = 1; seed <= 16; seed++) firsts.add(skillOrder({ seed })[0]);
  assert.deepEqual([...firsts].sort(), ['c', 'e', 'q', 'x']);
  assert.deepEqual(skillOrder({ seed: 1 }, { skill: 'e' }), ['e', 'c', 'x', 'q']);
  assert.equal(skillOrder({ seed: 1 }).length, 4);
});
