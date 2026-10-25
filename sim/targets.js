// 밸런스 목표 (설계 문서 8장). balance.yml 이 리포트를 이 범위와 비교한다.
export const TARGETS = {
  winRate: [0.1, 0.3],
  avgSurvivalRound: [8, 11],
  avgLevelAtFinalRound: [18, 22], // 12라운드에 도달한 판의 평균 레벨
  evolutionRate: [0.4, 0.75],
  buildEntropy: [1.5, 5], // 아키타입 분포가 한쪽으로 쏠리지 않게 (비트)
};

// 다양성 목표 (설계 16장): 어느 아키타입도 전체 승률의 ±50% 를 벗어나지 않고, 점유율 40% 이하.
// 판 수가 적은 아키타입(minGames 미만)은 판정에서 뺀다.
export const DIVERSITY = { winSpread: 0.5, shareMax: 0.4, minGames: 10 };
