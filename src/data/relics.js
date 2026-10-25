// 유물 (설계 v0.2 10장): 장점과 단점이 같이 있는 규칙 파괴 아이템.
// 엘리트 처치 시 3개 중 1개 선택, 상점 무작위 칸(희귀). 효과는 코드 곳곳의 훅이 relic 수치를 읽는다.

export const RELIC = {
  choices: 3,
  shopChance: 0.2, // 상점 세 번째 무작위 칸이 유물일 확률
  shopPrice: [2000, 3000], // 상점 가격 범위 (유물마다 고정: 아래 price)
};

export const RELICS = {
  glassCannon: {
    name: '유리 대포',
    tags: ['crit'],
    price: 2400,
    desc: '최대 HP -40%, 크리 피해 ×2',
    hpMult: 0.6,
    critMult: 2,
  },
  pistolMaster: {
    name: '권총 고수',
    tags: ['sidearm'],
    price: 2000,
    desc: '주무기 슬롯 봉인, 보조무기 티어 +1 · 연사 ×2',
    tierBonus: 1,
    fireRateMult: 2,
  },
  architect: {
    name: '설계자',
    tags: ['gadget'],
    price: 2400,
    desc: '설치물 최대 개수 +2, 총기 피해 -20%',
    gadgetBonus: 2,
    gunDamageMult: 0.8,
  },
  gambler: {
    name: '도박꾼',
    tags: ['economy'],
    price: 2000,
    desc: '클리어 보너스 없음, 라운드 시작 시 보유 크레딧의 12% 이자 (최대 1200)',
    interest: 0.12,
    interestCap: 1200,
  },
  heavyHand: {
    name: '무거운 손',
    tags: ['gun'],
    price: 2200,
    desc: '이동속도 -20%, 멈춰 있을 때 받는 피해 -40%',
    speedMult: 0.8,
    stillDamageMult: 0.6,
    stillTime: 0.25,
  },
  overheat: {
    name: '과열 칩',
    tags: [],
    price: 2600,
    desc: '스킬 쿨다운 -40%, 스킬 사용 시 HP 1 소모',
    cooldownMult: 0.6,
    hpCost: 1,
  },
  eliteTrophy: {
    name: '엘리트 트로피',
    tags: [],
    price: 2200,
    desc: '엘리트 처치마다 모든 피해 +8% (누적)',
    perElite: 0.08,
  },
  radiantHeart: {
    name: '라디아나이트 심장',
    tags: [],
    price: 2800,
    desc: '궁극기 필요 오브 3 → 2, 궁극기 피해 -25%',
    orbDelta: -1,
    ultDamageMult: 0.75,
  },
  ammoBelt: {
    name: '탄약 벨트',
    tags: ['reload'],
    price: 2000,
    desc: '탄창 ×2, 재장전 시간 ×2',
    magazineMult: 2,
    reloadMult: 2,
  },
  twinSlot: {
    name: '쌍둥이 슬롯',
    tags: [],
    price: 2400,
    desc: '유틸 슬롯 +1 (F), 상점 가격 +20%',
    slots: 1,
    priceMult: 1.2,
  },
  vampCore: {
    name: '흡혈 코어',
    tags: [],
    price: 2200,
    desc: '처치 회복 상한 해제 · 처치당 HP +0.5, 라운드 시작 회복 없음',
    killHeal: 0.5,
  },
  crackedLens: {
    name: '깨진 렌즈',
    tags: ['mark'],
    price: 2400,
    desc: '표식 적에게 피해 +50%, 표식 없는 적에게 -15%',
    markedMult: 1.5,
    unmarkedMult: 0.85,
  },
};

export const RELIC_IDS = Object.keys(RELICS);
