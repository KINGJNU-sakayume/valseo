import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { SYNTHS } from '../src/data/synth.js';
import { ULT } from '../src/data/skills.js';
import { spawn } from '../src/core/systems/enemies.js';
import { levelUpOptions, synthReady } from '../src/core/systems/progression.js';

function quiet(agent = 'chamber') {
  const s = createGame(1, agent);
  s.spawnAcc = -1e9;
  s.player.guns = [null, null];
  s.player.invuln = 1e9;
  s.roundTime = 30;
  return s;
}
const dummy = (s, x, y) => Object.assign(spawn(s, 'chaser', { x, y }), { hp: 1e6, maxHp: 1e6, speed: 0, damage: 0 });

test('합성 카드: 재료가 갖춰지고 레벨 10 이상이면 레벨업 풀에 나온다', () => {
  const s = quiet();
  const p = s.player;
  p.skills.e.level = 2;
  p.skills.e.branch = 'trapRecall';
  p.skills.c.level = 5;
  assert.ok(synthReady(p, SYNTHS.checkmate));
  p.level = 12;
  let seen = false;
  for (let i = 0; i < 300 && !seen; i++) seen = levelUpOptions(s).some((o) => o.type === 'synth' && o.key === 'checkmate');
  assert.ok(seen);
  p.level = 5;
  for (let i = 0; i < 100; i++) assert.ok(!levelUpOptions(s).some((o) => o.type === 'synth'), '레벨 10 미만');
  const k = quiet('killjoy');
  k.player.level = 12;
  for (let i = 0; i < 100; i++) assert.ok(!levelUpOptions(k).some((o) => o.type === 'synth'), '재료 없음');
});

test('체크메이트: 덫이 발동하면 필드 안 적마다 헤드헌터 탄', () => {
  const s = quiet();
  s.player.synths = { checkmate: true };
  const p = s.player;
  step(s, { keys: { c: true }, aim: { x: p.x + 200, y: p.y } });
  for (let i = 0; i < 90; i++) step(s, {});
  dummy(s, p.x + 200, p.y);
  dummy(s, p.x + 220, p.y + 20);
  let shots = 0;
  for (let i = 0; i < 60 && shots === 0; i++) {
    step(s, {});
    shots = s.bullets.filter((b) => b.source === 'headhunter').length;
  }
  assert.ok(shots >= 2, `shots=${shots}`);
});

test('사냥 시즌: 역작이 표식 적마다 추가 저격', () => {
  const s = quiet();
  s.player.synths = { huntingSeason: true };
  const p = s.player;
  p.skills.x.level = 1;
  s.ultOrbs = ULT.orbsNeeded;
  const a = dummy(s, p.x, p.y + 300);
  a.mark = 5;
  const b = dummy(s, p.x - 300, p.y);
  b.mark = 5;
  step(s, { keys: { x: true }, aim: { x: p.x + 500, y: p.y } });
  assert.ok(a.hp < 1e6 && b.hp < 1e6);
  assert.equal(s.events.filter((e) => e.type === 'ult').length, 3);
});

test('나노 포격: 박격 포탄 착탄 지점에 은닉 지뢰 / 총동원: 봉쇄 발동 시 알람봇 8개', () => {
  const s = quiet('killjoy');
  const p = s.player;
  p.synths = { nanoBarrage: true, allIn: true };
  p.skills.e.level = 2;
  p.skills.e.branch = 'mortar';
  dummy(s, p.x + 250, p.y);
  step(s, { keys: { e: true } });
  let mines = 0;
  for (let i = 0; i < 300 && !mines; i++) {
    step(s, {});
    mines = s.zones.filter((z) => z.dormant).length;
  }
  assert.ok(mines >= 1);
  p.skills.x.level = 1;
  s.ultOrbs = ULT.orbsNeeded;
  step(s, { keys: { x: true } });
  for (let i = 0; i < 300 && !s.events.some((e) => e.type === 'synth' && e.id === 'allIn'); i++) step(s, {});
  assert.ok(s.devices.filter((d) => d.allIn).length >= SYNTHS.allIn.count - 2);
});
