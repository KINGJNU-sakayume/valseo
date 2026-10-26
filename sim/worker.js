// pool.js 의 worker: 작업을 하나씩 받아 한 판을 돌리고 결과를 돌려준다.
import { parentPort, workerData } from 'node:worker_threads';
import { playOne } from './run.js';
import { applyPatch } from './patch.js';

const { bot: botName, botOpts, patches } = workerData;
const bot = await import(`./bots/${botName}.js`);

let current = null; // 지금 적용된 패치 index
let undo = null;

parentPort.on('message', (job) => {
  if (job === null) return parentPort.close();
  const want = job.patch ?? null;
  if (want !== current) {
    undo?.();
    undo = want == null ? null : applyPatch(patches[want]);
    current = want;
  }
  const result = playOne(job.seed, bot, { ...botOpts, agent: job.agent });
  result.agent = job.agent;
  if (want != null) result.patch = want;
  parentPort.postMessage({ i: job.i, result });
});
