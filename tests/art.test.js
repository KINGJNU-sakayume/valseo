import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAMBER_ART } from '../src/render/art/chamber.js';
import { KILLJOY_ART } from '../src/render/art/killjoy.js';
import { REYNA_ART } from '../src/render/art/reyna.js';
import { BRIMSTONE_ART } from '../src/render/art/brimstone.js';
import { GECKO_ART } from '../src/render/art/gecko.js';
import { ENEMY_ART } from '../src/render/art/enemies.js';
import { GUN_ART } from '../src/render/art/guns.js';
import { HANDS } from '../src/render/sprites.js';
import { PAL } from '../src/render/palette.js';

// 스킨 그림은 글자 격자다: 모든 줄 폭이 같고, 팔레트에 없는 문자가 없어야 한다 (브라우저에서만 터지는 오류를 미리 막는다).
const ALL_ART = { ...CHAMBER_ART, ...KILLJOY_ART, ...REYNA_ART, ...BRIMSTONE_ART, ...GECKO_ART, ...ENEMY_ART, ...GUN_ART };

test('스킨: 격자 폭이 일정하고 팔레트 문자만 쓴다', () => {
  for (const [name, rows] of Object.entries(ALL_ART)) {
    const w = rows[0].length;
    rows.forEach((r, y) => {
      assert.equal(r.length, w, `${name} 줄 ${y} 폭`);
      for (const ch of r) assert.ok(ch in PAL, `${name} 줄 ${y}: 팔레트에 없는 문자 ${ch}`);
    });
  }
});

test('체임버 스킨: 크기 규격 (24x32 기본, 32x44 비교용, 걷기 프레임은 같은 크기)', () => {
  const size = (n) => [CHAMBER_ART[n][0].length, CHAMBER_ART[n].length];
  assert.deepEqual(size('chamber_s0'), [24, 32]);
  assert.deepEqual(size('chamber_s1'), [24, 32]);
  assert.deepEqual(size('chamber_l0'), [32, 44]);
  assert.deepEqual(size('chamber_l1'), [32, 44]);
  for (const n of ['ico_trademark', 'ico_headhunter', 'ico_rendezvous', 'ico_tourdeforce']) assert.deepEqual(size(n), [22, 22]);
});

test('체임버 스킨: 걷기 프레임이 서 있는 프레임과 다르다', () => {
  assert.notDeepEqual(CHAMBER_ART.chamber_s0, CHAMBER_ART.chamber_s1);
  assert.notDeepEqual(CHAMBER_ART.chamber_l0, CHAMBER_ART.chamber_l1);
});

test('킬조이 스킨: 24x32, 걷기 프레임, HUD 아이콘 22x22', () => {
  const size = (n) => [KILLJOY_ART[n][0].length, KILLJOY_ART[n].length];
  assert.deepEqual(size('killjoy0'), [24, 32]);
  assert.deepEqual(size('killjoy1'), [24, 32]);
  assert.notDeepEqual(KILLJOY_ART.killjoy0, KILLJOY_ART.killjoy1);
  for (const n of ['ico_alarmbot', 'ico_turret', 'ico_nanoswarm', 'ico_lockdown']) assert.deepEqual(size(n), [22, 22]);
});

test('레이나 스킨: 24x32, 걷기 프레임, HUD 아이콘 22x22', () => {
  const size = (n) => [REYNA_ART[n][0].length, REYNA_ART[n].length];
  assert.deepEqual(size('reyna0'), [24, 32]);
  assert.deepEqual(size('reyna1'), [24, 32]);
  assert.notDeepEqual(REYNA_ART.reyna0, REYNA_ART.reyna1);
  for (const n of ['ico_leer', 'ico_devour', 'ico_dismiss', 'ico_empress']) assert.deepEqual(size(n), [22, 22]);
});

test('브림스톤 스킨: 24x32, 걷기 프레임, HUD 아이콘 22x22', () => {
  const size = (n) => [BRIMSTONE_ART[n][0].length, BRIMSTONE_ART[n].length];
  assert.deepEqual(size('brimstone0'), [24, 32]);
  assert.deepEqual(size('brimstone1'), [24, 32]);
  assert.notDeepEqual(BRIMSTONE_ART.brimstone0, BRIMSTONE_ART.brimstone1);
  for (const n of ['ico_incendiary', 'ico_skysmoke', 'ico_beacon', 'ico_orbital']) assert.deepEqual(size(n), [22, 22]);
});

test('게코 스킨: 24x32, 걷기 프레임, 생물 2프레임, 구슬 4색, HUD 아이콘 22x22', () => {
  const size = (n) => [GECKO_ART[n][0].length, GECKO_ART[n].length];
  assert.deepEqual(size('gecko0'), [24, 32]);
  assert.deepEqual(size('gecko1'), [24, 32]);
  assert.notDeepEqual(GECKO_ART.gecko0, GECKO_ART.gecko1);
  for (const k of ['wingman', 'dizzy', 'moshpit', 'thrash']) assert.notDeepEqual(GECKO_ART[`${k}0`], GECKO_ART[`${k}1`], `${k} 프레임`);
  for (const s of 'cqex') assert.deepEqual(size(`globule_${s}`), [9, 9]);
  for (const n of ['ico_wingman', 'ico_dizzy', 'ico_moshpit', 'ico_thrash']) assert.deepEqual(size(n), [22, 22]);
});

test('총 쥐는 손: 그림 안쪽의 칠해진 픽셀이고, 몸 가운데가 아니라 옆이다', () => {
  const art = { chamber: CHAMBER_ART.chamber_s0, killjoy: KILLJOY_ART.killjoy0, reyna: REYNA_ART.reyna0, brimstone: BRIMSTONE_ART.brimstone0, gecko: GECKO_ART.gecko0 };
  for (const [name, [x, y]] of Object.entries(HANDS)) {
    const rows = art[name];
    assert.ok(rows, name);
    assert.notEqual(rows[y]?.[x] ?? '.', '.', `${name} 손 위치가 비어 있다`);
    assert.ok(x - rows[0].length / 2 >= 4, `${name} 손이 몸 가운데에 너무 가깝다`);
    assert.ok(y < rows.length - 4, `${name} 손이 발 높이다`);
  }
});

test('적 스킨: 종류마다 2프레임이고 서로 다르다', () => {
  for (const n of ['chaser', 'charger', 'ranged', 'carapace', 'refractor', 'resonator', 'spawner', 'overcharger', 'elite', 'lord', 'stalker', 'brood']) {
    assert.ok(ENEMY_ART[`${n}0`] && ENEMY_ART[`${n}1`], n);
    assert.notDeepEqual(ENEMY_ART[`${n}0`], ENEMY_ART[`${n}1`], `${n} 프레임`);
  }
});
