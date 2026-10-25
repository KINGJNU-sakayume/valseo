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

  // 킬조이 (14x18): 비니 + 노란 띠, 둥근 안경, 노란 재킷
  killjoy0: [
    '....kkkkkk....',
    '...kNNNNNNk...',
    '..kNNNNNNNNk..',
    '..kyyyyyyyyk..',
    '..khsssssshk..',
    '..kswwswwssk..',
    '..kswkswksSk..',
    '...ksssssk....',
    '....kkyykk....',
    '..kkyyyyyykk..',
    '.kyyyyNNyyyyk.',
    '.kyggyNNyggyk.',
    '.ksyyyNNyyysk.',
    '.kkyyyyyyyykk.',
    '..kNNNNNNNNk..',
    '..kNNNk.kNNk..',
    '..kNNNk.kNNk..',
    '..kkkkk.kkkk..',
  ],
  killjoy1: null,

  // 킬조이 설치물
  turret: [
    '...kkkkkk...',
    '..kyyyyyyk..',
    '.kyyggggyyk.',
    '.kygkttkgyk.',
    '.kygkttkgyk.',
    '.kyyggggyyk.',
    '..kyyyyyyk..',
    '..kMk..kMk..',
    '.kMMk..kMMk.',
    '.kkkk..kkkk.',
  ],
  turret_barrel: ['kkkkkkk.', 'kMMMMMlk', 'kkkkkkk.'],
  alarmbot0: ['..kkkkk..', '.kyyyyyk.', 'kyygggyyk', 'kygkrkgyk', 'kygkrkgyk', 'kyygggyyk', '.kyyyyyk.', '..kkkkk..'],
  alarmbot1: ['..kkkkk..', '.kyyyyyk.', 'kyygggyyk', 'kygkrrkyk', 'kygkrrkyk', 'kyygggyyk', '.kyyyyyk.', '..kkkkk..'],
  nanoswarm: ['.kkkk.', 'kppppk', 'kpyypk', 'kpyypk', 'kppppk', '.kkkk.'],
  lockdown: [
    '.....k.....',
    '....kyk....',
    '...kyyyk...',
    '..kyygyyk..',
    '.kyygtgyyk.',
    'kyygtttgyyk',
    '.kyygtgyyk.',
    '..kyygyyk..',
    '...kyyyk...',
    '....kyk....',
    '.....k.....',
  ],

  // 파편충 (14x12): 등에 붉은 결정이 박힌 변이 벌레
  chaser0: [
    '...k...k......',
    '..krk.krk.....',
    '..kcrkkcrk.k..',
    '.kRRrrRRrrkck.',
    'kRRRRRRRRRRrk.',
    'kRRyyRRRRyyRRk',
    'kRRykRRRRykRRk',
    'kRRRRRRRRRRRRk',
    '.kqqqqqqqqqqk.',
    '..kqkkkkkkqk..',
    '.kqk......kqk.',
    '.kk........kk.',
  ],
  chaser1: null,

  // 돌격형 (18x14): 뿔 달린 주황 장갑 돌격체
  charger0: [
    'kk..............kk',
    'kck............kck',
    '.kck..kkkkkk..kck.',
    '..kckkoooooookkck.',
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

  // 결정갑각 (18x14): 등과 앞을 덮은 창백한 결정 껍질 (앞쪽 호는 renderer 가 따로 그린다)
  carapace0: [
    '.....kkkkkkk......',
    '...kkxxXxxXxkk....',
    '..kxXxxXxxXxxXk...',
    '.kXxkkkkkkkkkxXk..',
    '.kkRRRRRRRRRRRkk..',
    'kqRRRRRRRRRRRRRRk.',
    'kqRRRRRRRRRyyRRRk.',
    'kqRRRRRRRRRykRRRk.',
    'kqRRRRRRRRRRRRRRk.',
    '.kqRRRRRRRRRRRRk..',
    '..kqqqqqqqqqqqk...',
    '..kqk.kqk.kqk.k...',
    '..kk..kk..kk......',
    '..................',
  ],
  carapace1: null,

  // 굴절체 (14x12): 유리처럼 일렁이는 청록 몸
  refractor0: [
    '.....kk.......',
    '....ktwk......',
    '...ktwTtk.....',
    '..ktTTTTtk.kk.',
    '.ktTbbTTTtktk.',
    'ktTTbwTTTTTk..',
    'ktTTTTTTTTtk..',
    '.ktTTTTTTtk...',
    '..ktTTTTtk....',
    '...kTk.kTk....',
    '..kTk...kTk...',
    '..kk.....kk...',
  ],
  refractor1: null,

  // 공명체 (14x15): 안테나에서 빛이 뿜어지는 금색 지원형
  resonator0: [
    '......kk......',
    '.....kyyk.....',
    '......kk......',
    '......kk......',
    '....kkggkk....',
    '...kgyyyygk...',
    '..kgyGGGGygk..',
    '.kgyGbwwbGygk.',
    '.kgyGbwwbGygk.',
    '..kgyGGGGygk..',
    '...kgyyyygk...',
    '....kkggkk....',
    '....kG..Gk....',
    '...kG....Gk...',
    '...kk....kk...',
  ],
  resonator1: null,

  // 산란체 (18x16): 분홍 알주머니를 짊어진 둔한 몸
  spawner0: [
    '......kkkkkk......',
    '....kkccCCcckk....',
    '...kcccCCCCccck...',
    '..kccbcccccbccck..',
    '.kcccccccCcccccck.',
    '.kccCcccccccbccck.',
    'kcccccbcccCccccCck',
    'kcCccccccccccccbck',
    'kcccccccccccccccck',
    'kqRRRRRRRRRRRRRRqk',
    'kqRRyyRRRRRRyyRRqk',
    'kqRRykRRRRRRykRRqk',
    '.kqRRRRRRRRRRRRqk.',
    '..kqqqqqqqqqqqqk..',
    '..kqk.kqk.kqk.kqk.',
    '..kk..kk..kk..kk..',
  ],
  spawner1: null,

  // 과충전체 (12x12): 흰 노랑으로 끓는 작은 코어
  overcharger0: [
    '....kkkk....',
    '..kkyeeykk..',
    '.kyyeeeeyyk.',
    '.kyewwwweyk.',
    'kyeewbbweeyk',
    'kyeewbbweeyk',
    '.kyewwwweyk.',
    '.kyyeeeeyyk.',
    '..kkyeeykk..',
    '...kOk.kOk..',
    '..kOk...kOk.',
    '..kk.....kk.',
  ],
  overcharger1: null,

  // 결정 기둥 (16x15): 보스 2단계
  pillar: [
    '.......kk.......',
    '......kxxk......',
    '.....kxwxXk.....',
    '.....kxwxXk.....',
    '....kcxwxXCk....',
    '....kcxwxXCk....',
    '...kccxwxXCCk...',
    '...kccxxxXCCk...',
    '...kcccxXXCCk...',
    '..kccccxXCCCCk..',
    '..kccccxXCCCCk..',
    '..kcccccCCCCCk..',
    '.kMMMMMMMMMMMMk.',
    '.kmmmmmmmmmmmmk.',
    '..kkkkkkkkkkkk..',
  ],

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
  gun_spectre: [
    '...kkkkkkkkkkkk.',
    'kkkkllllllllllkk',
    'kmmmmmmMMMMk....',
    'kMMkkkMMk.......',
    '.kk..kMMk.......',
    '.....kkk........',
  ],
  gun_judge: [
    '...kkkkkkkkkkkk.',
    'kkkkllllllllllkk',
    'kOOkmmmmmmmmmmk.',
    'kOOkkkMMMMk.....',
    '.kkk.kkkkk......',
  ],
  gun_operator: [
    '..........kkkk..........',
    '.........kttTTk.........',
    'kkkkkkkkkkkkkkkkkkkkkkk.',
    'kNNNNmmmmmmmmmmmmmmmmmlk',
    'kNNkkkkMMkkkkkkkkkkkkkk.',
    'kNk...kMMk..............',
    'kk.....kk...............',
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
  // XP 보석: 값에 따라 소(7)·중(9)·대(11). 외곽선을 두껍게 해 바닥에서 떠 보이게
  xp_s: ['...k...', '..kwk..', '.kwtwk.', 'kwttTwk', '.kTtTk.', '..kTk..', '...k...'],
  xp_m: ['....k....', '...klk...', '..kwllk..', '.kwlwlBk.', 'kwllwllBk', '.kBlllBk.', '..kBlBk..', '...kBk...', '....k....'],
  xp_l: ['.....k.....', '....kyk....', '...kywyk...', '..kywyygk..', '.kywyyyygk.', 'kywyyyyyGgk', '.kgyyyyGgk.', '..kgyyGgk..', '...kgGgk...', '....kgk....', '.....k.....'],
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
  // 패시브 아이콘 (9px)
  p_xp: ['....k....', '...ktk...', '..kttTk..', '.kttwtTk.', 'kttwwwtTk', '.kTtwtTk.', '..kTtTk..', '...kTk...', '....k....'],
  p_coin: ['..kkkkk..', '.kgyyyGk.', 'kgyykyyGk', 'kgykggyGk', 'kgyykyyGk', 'kgggggGGk', '.kGGGGGk.', '..kkkkk..'],
  p_crit: ['....k....', '...kyk...', 'kkkkykkkk', 'kyyyyyyyk', '.kyygyyk.', '..kygyk..', '.kygkgyk.', 'kygk.kgyk', 'kkk...kkk'],
  p_clock: ['..kkkkk..', '.kwwwwwk.', 'kwwwkwwwk', 'kwwwkwwwk', 'kwwwkkkwk', 'kwwwwwwwk', '.kwwwwwk.', '..kkkkk..'],
  p_armor: ['.kkkkkkk.', 'kwlllllwk', 'klllglllk', 'kllgggllk', 'klllglllk', '.klllllk.', '..klllk..', '...klk...', '....k....'],
  // 유틸 (용병 계약)·유물 아이콘
  u_recon: ['.........kk', '........kwk', '.......kwk.', '......kwk..', '.....kwk...', '..k.kwk....', '..kkwk.....', '..kTk......', '.kTTkk.....', 'kTTk.......', 'kkk........'],
  u_zeroPoint: ['...k...', '..kwk..', '..kwk..', '..kwk..', '..kWk..', '.kkkkk.', 'kpppppk', '.kkpkk.', '..kpk..', '..kpk..', '..kkk..'],
  u_frag: ['...kkk...', '..kMMMk..', '...kMk...', '..kkkkk..', '.kooOook.', 'kooooOook', 'koOooooOk', 'kooOoOook', 'kOooooOok', '.kOoOoOk.', '..kkkkk..'],
  u_slowOrb: ['..kkkkk..', '.kBBBBBk.', 'kBBxxBBBk', 'kBxwxBBBk', 'kBBxBBBBk', 'kBBBBBBXk', 'kBBBBBXXk', '.kBBXXXk.', '..kkkkk..'],
  u_tailwind: ['kkkkkkkk...', 'wwwwwwwwk..', 'kkkkkkkkwk.', '...kkkkkkwk', '...ttttttwk', '...kkkkkkwk', 'kkkkkkkkwk.', 'ttttttttk..', 'kkkkkkkk...'],
  u_tracker: ['...kkk...', '..kPPPk..', '.kPpppPk.', 'kPpwkwpPk', 'kPpppppPk', '.kPpppPk.', '.kPk.kPk.', 'kPk...kPk', 'kk.....kk'],
  u_incendiary: ['....k....', '...kok...', '..koyok..', '..koyok..', '.koyyyok.', 'koyywyyok', 'koyyyyyok', '.kOoooOk.', '..kkkkk..'],
  u_smoke: ['..kkkk.....', '.kWWWWk....', 'kWWwwWWkk..', 'kWwwwwWWWk.', 'kWWwwWWWWWk', '.kWWWWWWWWk', '..kkWWWWWk.', '....kkkkk..'],
  u_wall: ['kkkkkkkkkkk', 'kXxxkxXxkxk', 'kxxXkxxxkXk', 'kkkkkkkkkkk', 'kxkXxxkxxXk', 'kxkxxXkxXxk', 'kkkkkkkkkkk'],
  u_flash: ['....k....', '...kyk...', 'k.kywyk.k', '.kywwwyk.', 'kywwwwwyk', '.kywwwyk.', 'k.kywyk.k', '...kyk...', '....k....'],
  relic: ['...kkkkk...', '..kcxxxck..', '.kcxwwxxck.', 'kCcxwxxxcCk', 'kCccxxxccCk', '.kCccxccCk.', '..kCcccCk..', '...kCcCk...', '....kCk....', '.....k.....', '...........'],
  p_heal: ['.kk...kk.', 'krrk.krrk', 'krrrkrrrk', 'krrwwwrRk', '.krrwrRk.', '..krwRk..', '...kRk...', '....k....'],
  p_hourglass: ['kkkkkkkkk', '.kyyyyyk.', '..kyyyk..', '...kyk...', '...k.k...', '..kt.tk..', '.kttttTk.', 'kkkkkkkkk'],
  p_orb: ['...kkk...', '..kyyyk..', '.kyywyyk.', 'kyywwwygk', '.kyywygk.', '..kygGk..', '...kkk...'],
  p_bubble: ['..kkkkk..', '.kw...wk.', 'kw.....wk', 'k...w...k', 'k..www..k', 'k...w...k', 'kw.....wk', '.kw...wk.', '..kkkkk..'],
};

// 걷기 2번째 프레임: 다리 행만 교체
const LEGS = {
  player1: { from: 'player0', rows: { 15: '..knnk..knnnk.', 16: '..kNNk..kNNNk.', 17: '..kkkk..kkkkk.' } },
  killjoy1: { from: 'killjoy0', rows: { 15: '..kNNk..kNNNk.', 16: '..kNNk..kNNNk.', 17: '..kkkk..kkkkk.' } },
  chaser1: { from: 'chaser0', rows: { 10: '..kMk....kMk..', 11: '..kk......kk..' } },
  charger1: { from: 'charger0', rows: { 11: '...kMMk....kMMk...', 12: '...kMMk....kMMk...', 13: '...kkkk....kkkk...' } },
  ranged1: { from: 'ranged0', rows: { 15: '.......tt.......' } },
  carapace1: { from: 'carapace0', rows: { 11: '...kqk.kqk.kqk....', 12: '...kk..kk..kk.....' } },
  refractor1: { from: 'refractor0', rows: { 9: '...kTk..kTk...', 10: '...kTk..kTk...', 11: '...kk...kk....' } },
  resonator1: { from: 'resonator0', rows: { 1: '.....kwwk.....' } },
  spawner1: { from: 'spawner0', rows: { 14: '...kqk.kqk.kqk.kqk', 15: '...kk..kk..kk..kk.' } },
  overcharger1: { from: 'overcharger0', rows: { 3: '.kyewwwweyk.'.replace(/w/g, 'e'), 9: '..kOk...kOk.', 10: '...kOk.kOk..' } },
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
