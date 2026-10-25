// 전술 카드: "~할 때 ~한다" 조건부 효과 (설계 v0.2 7.2). 모든 요원이 공유한다.
// 한 장씩만 보유 (중첩 없음). rarity 는 PASSIVES 쪽 RARITY 가중치를 따른다.

export const TACTICS = {
  chainReaction: {
    name: '연쇄 반응', rarity: 'rare', tags: ['crit', 'zone'],
    desc: '크리로 처치하면 그 자리에 감속 장판 (반경 60, 1.5초)',
    r: 60, duration: 1.5, slow: 0.4, icd: 0.5,
  },
  standStill: {
    name: '정지 사격', rarity: 'common', tags: ['gun'],
    desc: '0.5초 이상 멈춰 있으면 총기 피해 +25%',
    still: 0.5, bonus: 0.25,
  },
  runAndGun: {
    name: '런앤건', rarity: 'common', tags: ['mobility', 'gun'],
    desc: '이동기 사용 후 3초간 연사 +20%',
    duration: 3, fireRate: 0.2,
  },
  vulnSpread: {
    name: '취약 전염', rarity: 'rare', tags: ['vuln'],
    desc: '취약 적이 죽으면 가장 가까운 적 2명에게 취약 2초',
    count: 2, range: 250, duration: 2,
  },
  slowAmp: {
    name: '감속 증폭', rarity: 'common', tags: ['slow'],
    desc: '감속된 적에게 주는 피해 + (감속률 × 50%)',
    k: 0.5,
  },
  blastChain: {
    name: '폭발 연쇄', rarity: 'rare', tags: ['blast'],
    desc: '폭발로 죽은 적은 30% 확률로 소폭발 (반경 70, 피해 25)',
    chance: 0.3, r: 70, damage: 25,
  },
  cdCycle: {
    name: '쿨다운 순환', rarity: 'rare', tags: ['gadget', 'zone', 'blast'],
    desc: '스킬 피해로 처치하면 모든 스킬 쿨다운 -0.3초',
    amount: 0.3,
  },
  crisis: {
    name: '위기 대응', rarity: 'common', tags: [],
    desc: 'HP 30% 이하일 때 스킬 쿨다운 -40%',
    hpPct: 0.3, cdr: 0.4,
  },
  ruthless: {
    name: '냉혹', rarity: 'rare', tags: ['crit'],
    desc: '크리 피해 +30%, 크리가 아닌 피해 -15%',
    critBonus: 0.3, nonCrit: 0.85,
  },
  focus: {
    name: '집중', rarity: 'common', tags: ['gun'],
    desc: '같은 적을 연속으로 맞힐 때마다 총기 피해 +5% (최대 10중첩)',
    per: 0.05, max: 10,
  },
  opener: {
    name: '기선 제압', rarity: 'common', tags: [],
    desc: '라운드 시작 15초간 모든 피해 +30%',
    time: 15, bonus: 0.3,
  },
  cleaner: {
    name: '정리 전문가', rarity: 'common', tags: ['economy'],
    desc: '정리 페이즈 동안 이동속도 +30%, 처치 크레딧 ×2',
    speed: 0.3, credit: 2,
  },
};

// 트리거 연쇄 깊이 제한 (폭발 연쇄 등이 무한히 이어지지 않게)
export const TRIGGER_DEPTH = 3;
