// 시뮬 전용 수치 패치: src/data/ 를 고치지 않고 후보 수치를 시험한다.
//
// 패치 파일(JSON) 예:
//   {
//     "title": "소이탄 약화 후보",
//     "changes": {
//       "SKILLS.ember.damage": { "mul": 0.8 },      // 곱하기 (배열이면 칸마다, null 은 그대로)
//       "SKILLS.ember.cooldown": { "add": 2 },      // 더하기
//       "COMMANDER.takenMult": 0.9                  // 그대로 바꾸기
//     }
//   }
// 경로 첫 칸은 src/data/*.js 가 내보내는 이름(SKILLS, GUNS, COMMANDER …), 나머지는 점으로 잇는다.
// 모듈을 읽을 때 한 번 계산해 두는 값(예: RELIC_IDS)은 바뀌지 않으니, 숫자 조정용으로 쓴다.
import { readFileSync } from 'node:fs';
import * as agents from '../src/data/agents.js';
import * as balance from '../src/data/balance.js';
import * as enemies from '../src/data/enemies.js';
import * as guns from '../src/data/guns.js';
import * as maps from '../src/data/maps.js';
import * as passives from '../src/data/passives.js';
import * as relics from '../src/data/relics.js';
import * as rounds from '../src/data/rounds.js';
import * as shop from '../src/data/shop.js';
import * as skills from '../src/data/skills.js';
import * as synth from '../src/data/synth.js';
import * as tactics from '../src/data/tactics.js';
import * as tags from '../src/data/tags.js';
import * as utils from '../src/data/utils.js';

const ROOTS = Object.assign({}, agents, balance, enemies, guns, maps, passives, relics, rounds, shop, skills, synth, tactics, tags, utils);

/** 파일 → { title, changes }. 최상위가 곧 changes 인 파일도 받는다. */
export function loadPatch(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const changes = raw.changes ?? Object.fromEntries(Object.entries(raw).filter(([k]) => k !== 'title'));
  const patch = { title: raw.title ?? file, changes };
  applyPatch(patch)(); // 경로를 미리 검사한다 (틀리면 worker 를 띄우기 전에 멈춘다)
  return patch;
}

function resolve(path) {
  const parts = path.split('.');
  let obj = ROOTS;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj?.[parts[i]];
    if (obj == null || typeof obj !== 'object') throw new Error(`패치 경로를 찾을 수 없음: ${path} (${parts.slice(0, i + 1).join('.')})`);
  }
  const key = parts[parts.length - 1];
  if (!(key in obj)) throw new Error(`패치 경로를 찾을 수 없음: ${path}`);
  return [obj, key];
}

function transform(cur, op, path) {
  if (op && typeof op === 'object' && !Array.isArray(op) && ('mul' in op || 'add' in op)) {
    const f = (v) => (v == null ? v : 'mul' in op ? v * op.mul : v + op.add);
    if (Array.isArray(cur)) return cur.map(f);
    if (typeof cur !== 'number') throw new Error(`mul/add 는 숫자나 숫자 배열에만: ${path}`);
    return f(cur);
  }
  return op;
}

/** 패치를 적용하고, 되돌리는 함수를 돌려준다. */
export function applyPatch(patch) {
  const undo = [];
  for (const [path, op] of Object.entries(patch?.changes ?? {})) {
    const [obj, key] = resolve(path);
    undo.push([obj, key, obj[key]]);
    obj[key] = transform(obj[key], op, path);
  }
  return () => {
    for (let i = undo.length - 1; i >= 0; i--) {
      const [obj, key, v] = undo[i];
      obj[key] = v;
    }
  };
}
