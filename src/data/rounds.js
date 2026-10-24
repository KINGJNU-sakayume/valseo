// 라운드 진행, 스폰 예산, 체력 스케일링, 클리어 보너스.

export const ROUNDS = {
  count: 12,
  combatTime: 90, // 초
  startHealPct: 0.3, // 라운드 시작 시 최대 HP 대비 회복량
};

// 초당 스폰 예산 S(R) = S0 + g·(R − 1)
export const SPAWN_BUDGET = { S0: 1.2, g: 0.4 }; // 설계 초기값 3 / 0.5 는 스킬(M4) 없이는 감당 불가 → M7 에서 재튜닝

// 적 체력 배율 h(R) = 1 + k·(R − 1)
export const ENEMY_SCALING = { k: 0.15 };

// 클리어 보너스 B(R) = B0 + b1·R
export const CLEAR_BONUS = { B0: 200, b1: 30 };
