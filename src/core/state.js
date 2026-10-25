import { createRng } from './rng.js';
import { WORLD, PLAYER } from '../data/balance.js';
import { GUNS } from '../data/guns.js';
import { initSkills } from './systems/skills.js';
import { LEVELUP } from '../data/passives.js';

/**
 * @typedef {{ x: number, y: number }} Vec
 * @typedef {{ id: string, tier: number, cooldown: number, mods: Record<string, number>, evolved: boolean, critStreak: number }} GunSlot
 * @typedef {{
 *   x: number, y: number, r: number,
 *   hp: number,
 *   shield: number, shieldMax: number,
 *   aim: number,            // 조준 각도(rad)
 *   aimX: number, aimY: number, // 조준점(월드)
 *   rush: number,           // 급습 밴달 버프 남은 시간
 *   invuln: number,         // 남은 무적 시간
 *   guns: (GunSlot|null)[], // [주무기, 보조]
 *   passives: Record<string, number>,
 *   level: number, xp: number,
 *   precision: boolean,     // Q 정조준 중
 *   skills: Skills,
 * }} Player
 * @typedef {{
 *   c: SkillSlot, e: SkillSlot, q: SkillSlot, x: SkillSlot,
 * }} Skills  슬롯 키(c/e/q/x). 상세 필드는 에이전트 모듈(agents/*.js)의 initSkills 참고
 * @typedef {{ id: string, level: number, branch: 'A'|'B'|null, [k: string]: any }} SkillSlot
 * @typedef {{ id: number, kind: 'alarmbot'|'turret', x: number, y: number, [k: string]: any }} Device
 * @typedef {{ id: number, kind: 'nano', x: number, y: number, r: number, life: number, [k: string]: any }} Zone
 * @typedef {{ id: number, x: number, y: number, arm: number }} Trap
 * @typedef {{ x: number, y: number, r: number, life: number, maxLife: number, slow: number }} Field
 * @typedef {{
 *   id: number, type: string, x: number, y: number, r: number,
 *   hp: number, maxHp: number, speed: number, damage: number,
 *   mode: string, t: number, dirX: number, dirY: number, fireCd: number,
 *   killedBy?: string,
 * }} Enemy
 * @typedef {{ x: number, y: number, vx: number, vy: number, r: number, damage: number, life: number, source: string }} EnemyBullet
 * @typedef {{ x: number, y: number, vx: number, vy: number, r: number, damage: number, crit: boolean, life: number, pierce: number, hitIds: number[], source: string }} Bullet
 * @typedef {{ kind: 'xp', x: number, y: number, r: number, value: number }} Pickup  크레딧은 처치 즉시 지급 (물리 드롭 없음)
 * @typedef {{ type: string, [k: string]: any }} GameEvent
 * @typedef {'MENU'|'COMBAT'|'SWEEP'|'BUY'|'VICTORY'|'DEFEAT'} Phase
 * @typedef {{ kind: 'levelup'|'shop', options: any[] }} Pending
 * @typedef {{
 *   seed: number, tick: number, time: number, phase: Phase,
 *   rng: { s: number },
 *   round: number, roundTime: number,
 *   credits: number,
 *   player: Player,
 *   enemies: Enemy[], bullets: Bullet[], pickups: Pickup[], enemyBullets: EnemyBullet[],
 *   nextSpawn: string|null, eliteSpawned: boolean, bossSpawned: boolean,
 *   agent: string,
 *   traps: Trap[], fields: Field[], devices: Device[], zones: Zone[], lockdowns: any[],
 *   ultOrbs: number, killsSinceOrb: number,
 *   events: GameEvent[],
 *   pending: null | Pending,
 *   levelUpsQueued: number, roundHealed: number,
 *   branchQueue: string[],  // 분기 선택을 기다리는 스킬 키
 *   shopCard: any, shopCardBought: boolean,
 *   stats: { kills: number, roundKills: number, creditsEarned: number, damage: number },
 *   spawnAcc: number, nextId: number,
 * }} GameState
 */

/** @returns {GameState} */
export function createState(seed, agent = 'chamber') {
  return {
    seed,
    agent,
    tick: 0,
    time: 0,
    phase: 'COMBAT', // 메뉴 없이 바로 전투
    rng: createRng(seed),
    round: 1,
    roundTime: 0,
    credits: PLAYER.startCredits,
    player: {
      x: WORLD.width / 2,
      y: WORLD.height / 2,
      r: PLAYER.radius,
      hp: PLAYER.maxHp,
      shield: 0,
      shieldMax: 0,
      aim: 0,
      aimX: WORLD.width / 2 + 1,
      aimY: WORLD.height / 2,
      rush: 0,
      invuln: 0,
      guns: PLAYER.startGuns.map((id) => (id && GUNS[id] ? createGunSlot(id) : null)),
      passives: {},
      level: 1,
      xp: 0,
      precision: false,
      skills: initSkills(agent),
      tactics: {}, // 보유 전술 카드 id → true
      banished: [], // 추방한 카드 키 (그 판에서 다시 안 나옴)
      stillT: 0, // 멈춰 있은 시간 (정지 사격)
      runGun: 0, // 런앤건 남은 시간
      focus: { id: -1, n: 0 }, // 집중: 연속 명중 대상과 중첩
      autoMode: false, // 스킬 자동 사용 중 (input.autoSkills)
      autoAim: false, // 자동 조준 중 (input.autoAim, 헤드샷이 확률이 된다)
      reflexCd: 0, // 반사 신경 숙련
      pierceBuff: 0, // 귀환 장전 숙련: 남은 시간
      pierceBonus: 0,
    },
    enemies: [],
    bullets: [],
    enemyBullets: [],
    pickups: [],
    traps: [],
    fields: [],
    devices: [],
    zones: [],
    lockdowns: [],
    ultOrbs: 0,
    killsSinceOrb: 0,
    events: [],
    pending: null,
    levelUpsQueued: 0,
    roundHealed: 0, // 처치 회복 패시브의 이번 라운드 누적량
    branchQueue: [], // 형태 증강 선택을 기다리는 스킬 키
    masteryQueue: [], // 숙련 증강 선택을 기다리는 스킬 키
    evolveQueue: [], // 진화 경로 선택을 기다리는 총 슬롯 index
    decoy: null, // 잔상 분신 { x, y, t }
    overclock: null, // 킬조이 오버클럭 영역 { x, y, r, t, mult }
    shopCard: null,
    shopCardBought: false,
    rerolls: LEVELUP.rerolls,
    banishes: LEVELUP.banishes,
    tacticCd: {}, // 전술 카드 내부 쿨다운
    stats: { kills: 0, roundKills: 0, creditsEarned: 0, damage: 0 },
    spawnAcc: 0,
    nextSpawn: null,
    eliteSpawned: false,
    bossSpawned: false,
    cleanup: false, // 정리 페이즈 (스폰 정지)
    roundWon: false, // 정리 페이즈 중 전멸 → 클린 라운드 종료 대기
    winTimer: 0,
    sweepT: 0, // 섬멸 파동 경과 (phase 'SWEEP')
    nextId: 1,
  };
}

/** @returns {GunSlot} */
export function createGunSlot(id) {
  // evolved: 진화한 경로(공명 태그) 또는 false. ammo/reload: 탄창이 있는 주무기만
  return { id, tier: 1, cooldown: 0, mods: {}, evolved: false, critStreak: 0, primed: false, primeCd: 0, ammo: null, reload: 0, gadgetCd: 0, fieldReady: false };
}
