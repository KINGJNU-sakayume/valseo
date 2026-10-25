// 밸런스 목표 (설계 문서 8장). balance.yml 이 리포트를 이 범위와 비교한다.
export const TARGETS = {
  winRate: [0.1, 0.3],
  avgSurvivalRound: [8, 11],
  avgLevelAtFinalRound: [18, 22], // 12라운드에 도달한 판의 평균 레벨
  evolutionRate: [0.4, 0.75],
};
