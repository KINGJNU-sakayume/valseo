// 균일 격자 공간 해시. 매 틱 clear → insert → query 로 사용한다.

export function createSpatialHash(cellSize) {
  // used: 이번 틱에 항목이 들어간 칸. clear 는 이것만 비운다
  // (모든 칸을 돌면 맵을 오래 돌수록 칸 수만큼 느려진다).
  return { cellSize, cells: new Map(), used: [] };
}

function key(cx, cy) {
  // 음수 좌표도 안전하도록 오프셋 후 정수 키로 합친다.
  return (cx + 32768) * 65536 + (cy + 32768);
}

export function clearHash(hash) {
  const used = hash.used;
  for (let i = 0; i < used.length; i++) used[i].length = 0;
  used.length = 0;
}

export function insert(hash, item) {
  const cs = hash.cellSize;
  const x0 = Math.floor((item.x - item.r) / cs);
  const x1 = Math.floor((item.x + item.r) / cs);
  const y0 = Math.floor((item.y - item.r) / cs);
  const y1 = Math.floor((item.y + item.r) / cs);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const k = key(cx, cy);
      let bucket = hash.cells.get(k);
      if (!bucket) hash.cells.set(k, (bucket = []));
      if (bucket.length === 0) hash.used.push(bucket);
      bucket.push(item);
    }
  }
}

/** (x, y, r) 원과 겹칠 수 있는 항목을 out 에 모은다 (중복 제거). */
export function query(hash, x, y, r, out) {
  out.length = 0;
  const cs = hash.cellSize;
  const x0 = Math.floor((x - r) / cs);
  const x1 = Math.floor((x + r) / cs);
  const y0 = Math.floor((y - r) / cs);
  const y1 = Math.floor((y + r) / cs);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const bucket = hash.cells.get(key(cx, cy));
      if (!bucket) continue;
      for (const item of bucket) if (!out.includes(item)) out.push(item);
    }
  }
  return out;
}
