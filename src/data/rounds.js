// 라운드 진행, 스폰 예산, 체력 스케일링, 클리어 보너스.

export const ROUNDS = {
  count: 12,
  combatTime: 90, // 초
  startHealPct: 0.3, // 라운드 시작 시 최대 HP 대비 회복량
  eliteRounds: [3, 6, 9],
  eliteSpawnTime: 10, // 라운드 시작 후 엘리트 등장 시각(초)
  bossRound: 12, // 타이머 없음, 보스 처치 = 승리
  bossSpawnTime: 3,
};

// 라운드별 스폰 구성 비율 (fromRound 이상인 마지막 항목을 사용). 가중치라 합이 1일 필요는 없다.
export const SPAWN_MIX = [
  { fromRound: 1, weights: { chaser: 1 } },
  { fromRound: 3, weights: { chaser: 0.75, charger: 0.25 } },
  { fromRound: 5, weights: { chaser: 0.55, charger: 0.25, ranged: 0.2 } },
];

// 초당 스폰 예산 S(R) = S0 + g·(R − 1)
export const SPAWN_BUDGET = { S0: 1.2, g: 0.42 }; // 설계 초기값 3 / 0.5 는 MVP 범위(총 3종)에서 감당 불가 → M7 greedy 봇 기준으로 튜닝

// 적 체력 배율 h(R) = 1 + k·(R − 1)
export const ENEMY_SCALING = { k: 0.15 };

// 클리어 보너스 B(R) = B0 + b1·R
export const CLEAR_BONUS = { B0: 200, b1: 30 };
