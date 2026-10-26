// 시뮬 작업 풀: (시드, 요원, 패치) 묶음을 worker 들이 하나씩 가져가 돌린다.
// 한 판 길이가 요원·시드마다 크게 달라서, 미리 나눠 주면 마지막에 코어가 논다 → 큐 방식.
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./worker.js', import.meta.url));

export const defaultWorkers = () => Math.max(1, cpus().length - 1);

/**
 * jobs: [{ seed, agent, patch }] (patch 는 patches 배열의 index, 없으면 원래 수치)
 * 결과는 jobs 와 같은 순서로, 각 결과에 agent·patch 가 붙는다.
 */
export function runJobs(jobs, { bot = 'greedy', botOpts = {}, patches = [], workers = defaultWorkers(), onDone } = {}) {
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const n = Math.max(1, Math.min(workers, jobs.length));
  return new Promise((resolve, reject) => {
    if (jobs.length === 0) return resolve(results);
    let alive = n;
    for (let w = 0; w < n; w++) {
      const worker = new Worker(WORKER, { workerData: { bot, botOpts, patches } });
      const feed = () => {
        if (next >= jobs.length) return worker.postMessage(null);
        const i = next++;
        worker.postMessage({ i, ...jobs[i] });
      };
      worker.on('message', (m) => {
        results[m.i] = m.result;
        done++;
        onDone?.(done, jobs.length);
        feed();
      });
      worker.on('error', reject);
      worker.on('exit', () => {
        if (--alive === 0) resolve(results);
      });
      feed();
    }
  });
}
