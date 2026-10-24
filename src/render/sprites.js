// 픽셀 스프라이트: 문자 격자 + 팔레트(PAL) → 오프스크린 캔버스. 오른쪽을 보는 그림으로 그리고 필요하면 뒤집는다.
import { PAL } from './palette.js';

const DEFS = {
  // 체임버풍 플레이어 (14x18): 슬릭 헤어, 염소수염, 남색 수트 + 금색 라펠
  player0: [
    '....kkkkkk....',
    '...khhhhhHk...',
    '..khhhhhhhhk..',
    '..khhhhhhhhhk.',
    '..khhsssssshk.',
    '..khsskssksk..',
    '..khsssssSsk..',
    '...ksshhhsk...',
    '....kkwwkk....',
    '..kknnwwgnkk..',
    '.knnngwwgnnnk.',
    '.knnnnwwnnnnk.',
    '.ksnnnnggnnsk.',
    '.kknnnnnnnnkk.',
    '..knnnnnnnnk..',
    '..knnnk.knnk..',
    '..kNNNk.kNNk..',
    '..kkkkk.kkkk..',
  ],
  player1: null, // player0 다리만 바꾼 프레임 (아래에서 생성)

  // 추격형 (14x12): 붉은 바이저 드론
  chaser0: [
    '....kkkkkk....',
    '..kkrrrrrrkk..',
    '.krrrrrrrrrrk.',
    '.krRRRRRRRRrk.',
    'krRbbbbbbbbRrk',
    'krRbwrbbwrbRrk',
    'krRbbbbbbbbRrk',
    '.krRRRRRRRRrk.',
    '.kqrrrrrrrrqk.',
    '..kqkkkkkkqk..',
    '.kMk......kMk.',
    '.kk........kk.',
  ],
  chaser1: null,

  // 돌격형 (18x14): 뿔 달린 주황 장갑 돌격체
  charger0: [
    'kk..............kk',
    'kOk............kOk',
    '.kOk..kkkkkk..kOk.',
    '..kOkkoooooookkOk.',
    '..kooooooooooook..',
    '.koooOOOOOOOOoook.',
    '.kooObbbbbbbbOook.',
    '.kooObrrbbrrbOook.',
    '.kooOOOOOOOOOOook.',
    '..kooooooooooook..',
    '..kOOkkkkkkkkOOk..',
    '..kMMk......kMMk..',
    '..kMMk......kMMk..',
    '..kkkk......kkkk..',
  ],
  charger1: null,

  // 원거리형 (16x16): 떠다니는 보라 포탑
  ranged0: [
    '......kkkk......',
    '.....kppppk.....',
    '....kpPPPPpk....',
    '...kpPwwwwPpk...',
    '..kpPwbbbbwPpk..',
    '.kpPwbttttbwPpk.',
    'kpPPwbtwwtbwPPpk',
    'kpPPwbtwwtbwPPpk',
    '.kpPwbttttbwPpk.',
    '..kpPwbbbbwPpk..',
    '...kpPwwwwPpk...',
    '....kpPPPPpk....',
    '.....kppppk.....',
    '......kkkk......',
    '......kPPk......',
    '.......pp.......',
  ],
  ranged1: null,

  // 총기 (오른쪽 향함, 왼쪽 중앙이 손잡이)
  gun_classic: [
    '.kkkkkkkk.',
    'kllmmmmmmk',
    'kmmmMMMMk.',
    'kMMk......',
    'kkk.......',
  ],
  gun_sheriff: [
    '..kkkkkkkkkk.',
    '.kllllllllllk',
    'kgggmmmMMkkk.',
    'kMMkk........',
    'kkk..........',
  ],
  gun_vandal: [
    '....kkkkkkkkkkkkk.',
    'kkkkllllllllllllkk',
    'kmmmmmmmmmmMMMMk..',
    'kMMkkkMMkk........',
    '.kk..kMMk.........',
    '.....kkk..........',
  ],
  gun_headhunter: [
    '.kkkkkkkkk.',
    'kyyyyyyyyyk',
    'kgggGGGGkk.',
    'kGGk.......',
    'kkk........',
  ],
  gun_tourdeforce: [
    '......kkkkkkkkkkkkkkk.',
    'kkkkkkyyyyyyyyyyyyyyyk',
    'kgggggGGGGGGGGGkkkkkk.',
    'kGGkkkkGGk............',
    '.kk...kGGk............',
  ],

  // 픽업
  xp: ['..k..', '.ktk.', 'ktwtk', '.kTk.', '..k..'],
  credit: ['.kkk.', 'kgyGk', 'kgyGk', 'kgGGk', '.kkk.'],
  orb: ['..k..', '.kyk.', 'kygGk', '.kGk.', '..k..'],
  coin: ['..kkk..', '.kgyyk.', 'kgyggGk', 'kgyggGk', 'kgggGGk', '.kGGGk.', '..kkk..'],

  // 스킬 설치물
  trap: [
    '..kkkkkk..',
    '.kggyyggk.',
    'kgGkttkGgk',
    'kgGkttkGgk',
    '.kggGGggk.',
    '..kkkkkk..',
    '.k......k.',
  ],
  trapArming: [
    '..kkkkkk..',
    '.kGGggGGk.',
    'kGMkMMkMGk',
    'kGMkMMkMGk',
    '.kGGMMGGk.',
    '..kkkkkk..',
    '.k......k.',
  ],
  anchor: [
    '....k....',
    '...kyk...',
    '..kygGk..',
    '.kygtgGk.',
    'kygtttgGk',
    '.kGgtgGk.',
    '..kGgGk..',
    '...kGk...',
    '....k....',
  ],

  // 아이콘 (9px 내외)
  heart: ['.kk...kk.', 'krrk.krrk', 'krrrkrrrk', 'krrrrrrRk', '.krrrrRk.', '..krrRk..', '...kRk...', '....k....'],
  boot: ['..kkkk...', '..kwwk...', '..kwwk...', '..knnk...', '.knnnkkk.', '.knnnnnnk', '.kNNNNNNk', '.kkkkkkkk'],
  magnet: ['.kkk.kkk.', '.krk.kwk.', '.krk.kwk.', '.krk.kwk.', '.krkkkwk.', '.krrrrwk.', '..krrrk..', '...kkk...'],
  shield: ['.kkkkkkk.', 'kwlllllwk', 'klllllllk', 'klltttllk', 'klllllllk', '.klllllk.', '.klllllk.', '..klllk..', '...klk...', '....k....'],
  medkit: ['.kkkkkkk.', 'kwwwwwwwk', 'kwwwrwwwk', 'kwwrrrwwk', 'kwwwrwwwk', 'kwwwwwwwk', '.kkkkkkk.'],
  card: ['kkkkkkk', 'kwwwwwk', 'kwtttwk', 'kwtwtwk', 'kwtttwk', 'kwwwwwk', 'kkkkkkk'],
};

// 걷기 2번째 프레임: 다리 행만 교체
const LEGS = {
  player1: { from: 'player0', rows: { 15: '..knnk..knnnk.', 16: '..kNNk..kNNNk.', 17: '..kkkk..kkkkk.' } },
  chaser1: { from: 'chaser0', rows: { 10: '..kMk....kMk..', 11: '..kk......kk..' } },
  charger1: { from: 'charger0', rows: { 11: '...kMMk....kMMk...', 12: '...kMMk....kMMk...', 13: '...kkkk....kkkk...' } },
  ranged1: { from: 'ranged0', rows: { 15: '.......tt.......' } },
};
for (const [name, { from, rows }] of Object.entries(LEGS)) {
  DEFS[name] = DEFS[from].map((r, i) => rows[i] ?? r);
}

function build(rows, name) {
  const w = rows[0].length;
  for (const r of rows) if (r.length !== w) throw new Error(`sprite ${name}: row width ${r.length} != ${w}`);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = rows.length;
  const ctx = c.getContext('2d');
  rows.forEach((r, y) => {
    for (let x = 0; x < w; x++) {
      const color = PAL[r[x]];
      if (color === undefined) throw new Error(`sprite ${name}: unknown palette key ${r[x]}`);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

function variant(src, fn) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d');
  fn(ctx, src);
  return c;
}

const flipped = (src) => variant(src, (ctx) => {
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
});

/** 피격 깜빡임용 흰 실루엣. */
const silhouette = (src, color = '#ffffff') => variant(src, (ctx) => {
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, src.width, src.height);
});

let cache = null;

/** 모든 스프라이트를 한 번만 만든다: { name: { img, flip, white } } */
export function sprites() {
  if (cache) return cache;
  cache = {};
  for (const [name, rows] of Object.entries(DEFS)) {
    const img = build(rows, name);
    cache[name] = { img, flip: flipped(img), white: silhouette(img), w: img.width, h: img.height };
  }
  return cache;
}

/** 스프라이트를 중심 (x, y)에 그린다 (버퍼 픽셀 좌표). */
export function drawSprite(ctx, name, x, y, { flip = false, white = false, alpha = 1, scale = 1 } = {}) {
  const s = sprites()[name];
  const img = white ? s.white : flip ? s.flip : s.img;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  const w = s.w * scale;
  const h = s.h * scale;
  ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/** 총: 손잡이 기준으로 각도만큼 회전해 그린다. 왼쪽을 보면 위아래를 뒤집는다. */
export function drawGun(ctx, name, x, y, angle, kick = 0) {
  const s = sprites()[name];
  const left = Math.cos(angle) < 0;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  if (left) ctx.scale(1, -1);
  ctx.drawImage(s.img, Math.round(-2 - kick), -Math.floor(s.h / 2));
  ctx.restore();
}
