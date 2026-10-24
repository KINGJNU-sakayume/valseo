import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN = [/Math\.random/, /Date\.now/, /\bwindow\b/, /\bdocument\b/, /\bperformance\b/, /\bcanvas\b/i];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('src/core 와 src/data 는 DOM·비결정 API 를 쓰지 않는다', () => {
  const files = [...walk(join(root, 'src/core')), ...walk(join(root, 'src/data'))];
  assert.ok(files.length > 0);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const re of FORBIDDEN) assert.ok(!re.test(src), `${f} 에 금지 패턴 ${re}`);
  }
});
