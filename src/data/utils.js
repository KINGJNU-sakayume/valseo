// 유틸 슬롯: 용병 계약 (설계 v0.2 9장). 다른 요원의 경량판 스킬을 크레딧으로 산다.
// 키: 우클릭 (F 겸용), 모바일은 다섯 번째 칸. 계약은 영구, 매 라운드 충전 1개 무료.
// 자동 규칙(auto)은 스킬과 같은 어휘 (설계 21.3). 이름은 이곳에만 둔다.

export const UTIL = {
  slots: 1, // 기본 슬롯 수 (유물 "쌍둥이 슬롯" +1)
  maxCharges: 3,
  chargePrice: 200,
  freePerRound: 1,
  upgradePrice: { 2: 500, 3: 800 }, // Lv2·Lv3 업그레이드
  useCooldown: 1, // 연속 사용 간격 (초)
  throwSpeed: 900, // 던지는 유틸의 비행 속도
  damageGrowth: 0.12, // 라운드마다 유틸 피해 +12%
  shopOffers: 2, // 상점 무작위 칸의 계약 수
};

export const UTILS = {
  recon: {
    name: '정찰 화살',
    origin: '소바',
    tags: ['mark'],
    price: 800,
    desc: '착탄 지점 반경 300을 두 번 스캔, 감지한 적 표식 4초 (은신 해제)',
    range: 900,
    radius: 300,
    scans: [2, 2, 3], // 레벨별 스캔 횟수
    scanGap: 1,
    mark: [4, 6, 6],
    levelDesc: { 2: '표식 6초', 3: '스캔 3회' },
    auto: { when: [['hidden', 800], ['crowd', 300, 10]], at: 'hiddenOrDensest' },
  },
  zeroPoint: {
    name: '제로/포인트',
    origin: '케이오',
    tags: ['suppress', 'mark'],
    price: 900,
    desc: '칼 착탄 0.5초 뒤 반경 220 적 제압 5초 + 표식 (능력 정지)',
    range: 650,
    windup: 0.5,
    radius: [220, 220, 330],
    suppress: [5, 7, 7],
    mark: 5,
    levelDesc: { 2: '제압 7초', 3: '반경 +50%' },
    auto: { when: [['ability', 300, 2], ['elite', 500]], at: 'abilityOrBig' },
  },
  frag: {
    name: '분열탄',
    origin: '레이즈',
    tags: ['blast'],
    price: 600,
    desc: '폭발(반경 140, 피해 60) 후 소형 폭탄 4개로 분열 (피해 25)',
    range: 550,
    fuse: 0.6,
    radius: 140,
    damage: [60, 84, 84],
    split: { count: 4, delay: 0.4, spread: 110, radius: 75, damage: [25, 35, 35] },
    stages: [1, 1, 2], // 분열 단계
    levelDesc: { 2: '피해 +40%', 3: '분열 2단계' },
    auto: { when: [['crowd', 220, 8]], at: 'densest' },
  },
  slowOrb: {
    name: '슬로우 오브',
    origin: '세이지',
    tags: ['slow', 'zone'],
    price: 500,
    desc: '반경 150 감속 장판 5초 (체임버는 집중포화 적용)',
    range: 600,
    radius: 150,
    slow: [0.5, 0.6, 0.6],
    duration: [5, 5, 10],
    levelDesc: { 2: '감속 60%', 3: '지속 2배' },
    auto: { when: [['crowd', 220, 8]], at: 'densest' },
  },
  tailwind: {
    name: '순풍',
    origin: '제트',
    tags: ['mobility'],
    price: 600,
    desc: '이동 방향으로 대시 (대시 중 무적)',
    distance: [240, 310, 310],
    time: 0.15,
    freeCharges: [1, 1, 2], // 라운드당 무료 충전
    levelDesc: { 2: '거리 +30%', 3: '라운드 충전 +1' },
    auto: { when: [['surrounded', 120, 6], ['hpBelow', 0.3]], at: 'away' },
  },
};

export const UTIL_IDS = Object.keys(UTILS);
