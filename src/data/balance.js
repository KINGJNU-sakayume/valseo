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
  startCredits: 0,
};

export const SPAWN = {
  safeRadius: 520, // 플레이어 주변 스폰 금지 반경 (화면 밖 보장)
  ringWidth: 300, // safeRadius 바깥으로 이 폭 안에서 스폰
  maxEnemies: 500,
  maxTries: 8, // 경계 안 위치를 찾기 위한 재시도 횟수
};

export const BULLET = {
  lifetime: 1.6, // 초
  maxBullets: 2000,
};

export const CRIT = {
  multiplier: 2.0,
};

export const PICKUP = {
  radius: 6,
  pullSpeed: 520, // 자석 반경 안에서 플레이어 쪽으로 끌려오는 속도
  dropJitter: 10, // 같은 자리에 떨어진 XP/크레딧이 겹치지 않도록 흩뿌리는 반경
  maxPickups: 1500, // 넘으면 드롭 대신 즉시 획득
};

// 레벨업 필요 XP: xpNeed(L) = a + b·L + c·L²
export const XP_CURVE = { a: 6, b: 5, c: 0.5 };

export const SPATIAL = {
  cellSize: 64,
};
