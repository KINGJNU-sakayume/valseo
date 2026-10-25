import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAMBER_ART } from '../src/render/art/chamber.js';
import { KILLJOY_ART } from '../src/render/art/killjoy.js';
import { PAL } from '../src/render/palette.js';

// 스킨 그림은 글자 격자다: 모든 줄 폭이 같고, 팔레트에 없는 문자가 없어야 한다 (브라우저에서만 터지는 오류를 미리 막는다).
const ALL_ART = { ...CHAMBER_ART, ...KILLJOY_ART };

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
