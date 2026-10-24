// 전역 수치. 코드에 매직 넘버를 두지 않고 전부 여기서 읽는다.

export const DT = 1 / 60;

export const WORLD = {
  width: 2000,
  height: 2000,
};

export const PLAYER = {
  maxHp: 100,
  speed: 220,
  magnetRadius: 90,
  radius: 14,
  invulnTime: 0.5, // 피격 후 무적 시간(초)
  startGuns: [null, 'classic'], // [주무기, 보조]
};

export const SPAWN = {
  budgetPerSec: 3, // S0: 1라운드 초당 예산
  safeRadius: 520, // 플레이어 주변 스폰 금지 반경 (화면 밖 보장)
  ringWidth: 300, // safeRadius 바깥으로 이 폭 안에서 스폰
  maxEnemies: 500,
  maxTries: 8, // 경계 안 위치를 찾기 위한 재시도 횟수
};

export const BULLET = {
  lifetime: 1.6, // 초
  maxBullets: 2000,
};

export const SPATIAL = {
  cellSize: 64,
};
