// 라운드 진행, 스폰 예산, 체력 스케일링, 클리어 보너스.

export const ROUNDS = {
  count: 12,
  combatTime: 90, // 초. 이때 남은 적이 있으면 섬멸 파동
  spawnStopTime: 70, // 이후 정리 페이즈: 일반 스폰 정지, 남은 적을 다 잡으면 클린 라운드
  cleanBonus: 0.25, // 클린 라운드: 클리어 보너스 +25%
  winDelay: 0.8, // 마지막 적 처치 후 라운드 종료까지 (ROUND WIN 연출, 조각 흡수)
  sweepTime: 1.0, // 섬멸 파동 지속 (초)
  sweepRadius: 1600, // 파동 최대 반경 (플레이어 중심)
  startHealPct: 0.3, // 라운드 시작 시 최대 HP 대비 회복량
  eliteRounds: [4, 8, 11], // 막의 마무리 (설계 v0.2 12.1)
  eliteSpawnTime: 10, // 라운드 시작 후 엘리트 등장 시각(초)
  bossRound: 12, // 타이머 없음, 보스 처치 = 승리
  bossSpawnTime: 3,
};

// 라운드별 스폰 구성 비율 (fromRound 이상인 마지막 항목을 사용). 가중치라 합이 1일 필요는 없다.
// 막별 스폰 구성 (설계 13.3). fromRound 이상인 마지막 항목을 쓴다.
const R5 = { chaser: 0.5, charger: 0.2, ranged: 0.15, carapace: 0.15 };
const R9 = { chaser: 0.4, charger: 0.15, ranged: 0.15, carapace: 0.12, refractor: 0.08, resonator: 0.08, spawner: 0.05 };
export const SPAWN_MIX = [
  { fromRound: 1, weights: { chaser: 1 } },
  { fromRound: 2, weights: { chaser: 0.85, charger: 0.15 } },
  { fromRound: 3, weights: { chaser: 0.75, charger: 0.25 } },
  { fromRound: 4, weights: { chaser: 0.75, charger: 0.25, carapace: 0.08 } },
  { fromRound: 5, weights: R5 },
  { fromRound: 7, weights: { ...R5, refractor: 0.1, resonator: 0.08 } },
  { fromRound: 9, weights: R9 },
  { fromRound: 10, weights: { ...R9, overcharger: 0.12 } },
];

// 막 엘리트 (고정)
export const ELITE_BY_ROUND = { 4: 'lord', 8: 'stalker', 11: 'brood' };

// 초당 스폰 예산 S(R) = S0 + g·(R − 1)
export const SPAWN_BUDGET = { S0: 1.2, g: 0.42 }; // 설계 초기값 3 / 0.5 는 MVP 범위(총 3종)에서 감당 불가 → M7 greedy 봇 기준으로 튜닝

// 적 체력 배율 h(R) = 1 + k·(R − 1)
export const ENEMY_SCALING = { k: 0.15 };

// 클리어 보너스 B(R) = B0 + b1·R
export const CLEAR_BONUS = { B0: 200, b1: 30 };

// 라운드 유형 (설계 12.5). 일정은 고정, 변이는 2막부터 확률.
export const ROUND_TYPE_OF = {
  1: 'clear', 2: 'clear', 3: 'defuse', 4: 'elite',
  5: 'defend', 6: 'hunt', 7: 'defuse', 8: 'elite',
  9: 'defend', 10: 'hunt', 11: 'elite', 12: 'boss',
};

export const ROUND_TYPES = {
  clear: { name: '소탕', desc: '적을 쓸어 담아라' },
  defuse: {
    name: '해체',
    desc: '표시된 스파이크 지점에 7초 머물기',
    hold: 7, // 누적 초
    decay: 0.5, // 밖에 있으면 초당 감소
    radius: 80,
    credits: 500,
    tacticChoices: 3, // 보상: 전술 카드 선택
  },
  defend: {
    name: '방어',
    desc: '적이 사이트로 몰려온다 · 사이트 안에 머문 만큼 보너스',
    credits: 800, // × 머문 비율
    chaseRange: 350, // 이 안의 적은 플레이어를 쫓는다
  },
  hunt: {
    name: '사냥',
    desc: '은신 표적 3기를 찾아 처치 (표식이 닿으면 드러난다)',
    targets: 3,
    type: 'huntTarget',
    minDist: 700,
  },
  elite: { name: '엘리트', desc: '막 엘리트 · 처치하면 유물과 무기 상자' },
  boss: { name: '보스', desc: '거대 변이체' },
};

// 엘리트 무기 상자 (설계 8.6): 라운드별 티어
export const WEAPON_BOX = { tier: { 4: 2, 8: 2, 11: 3 }, guns: ['spectre', 'vandal', 'judge', 'operator'], radius: 40 };

// 변이 (2막부터 라운드마다 확률)
export const MUTATION = { fromRound: 5, chance: 0.4 };
export const MUTATIONS = {
  fog: { name: '짙은 안개', desc: '시야가 좁아진다', light: 0.6 },
  overcharge: { name: '과충전', desc: '적 이속 +10%, 크레딧 +30%', speedMult: 1.1, creditMult: 1.3 },
  storm: {
    name: '라디아나이트 폭풍',
    desc: '무작위 낙뢰 장판 — 적도 맞는다',
    interval: 3.5,
    telegraph: 1.4,
    radius: 90,
    playerDamage: 8,
    enemyDamage: 40,
    range: 500, // 플레이어 주변
  },
};
