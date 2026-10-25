import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { GUNS, TIERS, HEADSHOT } from '../src/data/guns.js';
import { DT } from '../src/data/balance.js';
import { createGunSlot } from '../src/core/state.js';
import { gunStats } from '../src/core/stats.js';

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
const shotsBy = (s, id) => s.events.filter((e) => e.type === 'shot' && e.source === id).length;

test('주무기 우선: 탄창을 다 쓰면 재장전, 그동안 보조무기가 쏜다', () => {
  const s = quiet();
  s.player.guns = [gun('vandal'), gun('classic')];
  const aim = { x: s.player.x + 400, y: s.player.y };
  let v = 0;
  let c = 0;
  let t = 0;
  while (v < GUNS.vandal.magazine && t++ < 600) {
    step(s, { aim });
    v += shotsBy(s, 'vandal');
    c += shotsBy(s, 'classic');
  }
  assert.equal(v, GUNS.vandal.magazine);
  assert.equal(c, 0, '주무기에 탄이 있으면 보조무기는 쉰다');
  assert.ok(s.player.guns[0].reload > 0);
  let during = 0;
  for (let i = 0; i < Math.floor(GUNS.vandal.reloadTime / DT) - 2; i++) {
    step(s, { aim });
    assert.equal(shotsBy(s, 'vandal'), 0);
    during += shotsBy(s, 'classic');
  }
  assert.ok(during >= 5, `재장전 중 보조무기 ${during}발`);
  for (let i = 0; i < 10; i++) step(s, { aim });
  assert.equal(s.player.guns[0].reload, 0);
  assert.ok(s.player.guns[0].ammo > 0);
});

test('주무기가 없으면 보조무기 상시 발사, 탄창 개조는 주무기에만', () => {
  const s = quiet();
  s.player.guns = [null, gun('classic')];
  let c = 0;
  for (let i = 0; i < 60; i++) {
    step(s, { aim: { x: s.player.x + 300, y: s.player.y } });
    c += shotsBy(s, 'classic');
  }
  assert.ok(c >= 2);
  const v = gun('vandal');
  v.mods.magazine = 2;
  assert.equal(gunStats(v).magazine, Math.round(25 * 1.4));
});

test('이동 중 탄 퍼짐: 오퍼레이터는 멈추면 정확, 움직이면 퍼진다', () => {
  const angles = (move) => {
    const out = [];
    for (let seed = 1; seed <= 12; seed++) {
      const s = quiet(seed);
      s.player.guns = [gun('operator'), null];
      if (!move) s.player.stillT = 1;
      step(s, { aim: { x: s.player.x + 500, y: s.player.y }, move: move ? { x: 0, y: 1 } : undefined });
      const b = s.bullets.find((x) => x.source === 'operator');
      out.push(Math.atan2(b.vy, b.vx));
    }
    return out;
  };
  const still = angles(false);
  assert.ok(still.every((a) => Math.abs(a) < 1e-9), '정지: 정확');
  const moving = angles(true);
  assert.ok(Math.max(...moving) - Math.min(...moving) > 0.05, '이동: 퍼짐');
});

test('헤드샷: 조준점이 적 위면 크리, 자동 조준은 확률', () => {
  const s = quiet();
  s.player.guns = [null, gun('classic')];
  const e = enemy(s, s.player.x + 200, s.player.y);
  let hit = null;
  for (let i = 0; i < 60 && !hit; i++) {
    step(s, { aim: { x: e.x, y: e.y } });
    hit = s.events.find((ev) => ev.type === 'hit');
  }
  assert.ok(hit.crit);
  assert.ok(s.events.some((ev) => ev.type === 'headshot'));

  const t = quiet(5);
  t.player.guns = [null, gun('classic')];
  const f = enemy(t, t.player.x + 200, t.player.y);
  let hits = 0;
  let crits = 0;
  for (let i = 0; i < 60 * 40; i++) {
    step(t, { aim: { x: f.x, y: f.y }, autoAim: true });
    for (const ev of t.events) if (ev.type === 'hit') {
      hits++;
      if (ev.crit) crits++;
    }
  }
  const rate = crits / hits;
  assert.ok(Math.abs(rate - HEADSHOT.autoChance) < 0.08, `자동 조준 헤드샷 비율 ${rate}`);
});

test('진화 효과: 작렬·부식탄·표식탄·원탭·반동 도약·화염 저지·황금 셰리프', () => {
  // 작렬 클래식: 주변 적에게 튄다
  let s = quiet();
  s.player.guns = [null, gun('classic', 'blast')];
  const a = enemy(s, s.player.x + 200, s.player.y);
  const b = enemy(s, s.player.x + 200, s.player.y + 30);
  for (let i = 0; i < 40; i++) step(s, { aim: { x: a.x + 100, y: a.y } });
  assert.ok(b.hp < b.maxHp, '작렬');

  // 부식탄 밴달
  s = quiet();
  s.player.guns = [gun('vandal', 'vuln'), null];
  const c = enemy(s, s.player.x + 200, s.player.y);
  for (let i = 0; i < 20; i++) step(s, { aim: { x: c.x + 100, y: c.y } });
  assert.ok(c.vulnerable > 0);

  // 표식탄 오퍼레이터: 표식 + 표식 적에게 2배
  s = quiet();
  s.player.guns = [gun('operator', 'mark'), null];
  const m = enemy(s, s.player.x + 200, s.player.y);
  for (let i = 0; i < 20; i++) step(s, { aim: { x: m.x + 100, y: m.y } });
  assert.ok(m.mark > 0);

  // 원탭 밴달: 탄창 첫 발은 크리
  s = quiet();
  s.player.guns = [gun('vandal', 'sniper'), null];
  step(s, { aim: { x: s.player.x + 400, y: s.player.y } });
  assert.ok(s.bullets[0].crit && s.bullets[0].pierce >= 2);

  // 반동 도약 저지
  s = quiet();
  s.player.guns = [gun('judge', 'mobility'), null];
  const x0 = s.player.x;
  step(s, { aim: { x: s.player.x + 400, y: s.player.y } });
  assert.ok(s.player.x < x0 - 40);

  // 화염 저지: 첫 착탄 지점에 감속 장판
  s = quiet();
  s.player.guns = [gun('judge', 'zone'), null];
  enemy(s, s.player.x + 100, s.player.y);
  for (let i = 0; i < 10; i++) step(s, { aim: { x: s.player.x + 400, y: s.player.y } });
  assert.equal(s.fields.length, 1);

  // 황금 셰리프: 처치 크레딧 +5
  s = quiet();
  s.player.guns = [null, gun('sheriff', 'economy')];
  enemy(s, s.player.x + 150, s.player.y, 1);
  const cr = s.credits;
  for (let i = 0; i < 30; i++) step(s, { aim: { x: s.player.x + 400, y: s.player.y } });
  assert.ok(s.credits - cr >= 10 + 5);
});

test('공학 탄창 스펙터: 재장전 때 요원의 C 설치물 (체임버 덫 / 킬조이 알람봇)', () => {
  for (const [agent, has] of [['chamber', (s) => s.traps.length > 0], ['killjoy', (s) => s.devices.some((d) => d.kind === 'alarmbot')]]) {
    const s = quiet(1, agent);
    s.player.guns = [gun('spectre', 'gadget'), null];
    s.player.guns[0].ammo = 1;
    step(s, { aim: { x: s.player.x + 400, y: s.player.y } });
    assert.ok(has(s), agent);
  }
});

test('추적 클래식: 표식 적 쪽으로 탄이 휜다', () => {
  const s = quiet();
  s.player.guns = [null, gun('classic', 'mark')];
  const e = enemy(s, s.player.x + 200, s.player.y + 60);
  e.mark = 99;
  for (let i = 0; i < 40; i++) step(s, { aim: { x: s.player.x + 400, y: s.player.y } });
  assert.ok(e.hp < e.maxHp);
});
