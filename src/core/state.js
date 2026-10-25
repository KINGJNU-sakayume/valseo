import { createRng } from './rng.js';
import { WORLD, PLAYER } from '../data/balance.js';
import { GUNS } from '../data/guns.js';
import { initSkills } from './systems/skills.js';

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
 * @typedef {{ kind: 'xp'|'credit', x: number, y: number, r: number, value: number }} Pickup
 * @typedef {{ type: string, [k: string]: any }} GameEvent
 * @typedef {'MENU'|'COMBAT'|'LEVELUP'|'ROUND_END'|'BUY'|'VICTORY'|'DEFEAT'} Phase
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
    branchQueue: [],
    shopCard: null,
    shopCardBought: false,
    stats: { kills: 0, roundKills: 0, creditsEarned: 0, damage: 0 },
    spawnAcc: 0,
    nextSpawn: null,
    eliteSpawned: false,
    bossSpawned: false,
    nextId: 1,
  };
}

/** @returns {GunSlot} */
export function createGunSlot(id) {
  return { id, tier: 1, cooldown: 0, mods: {}, evolved: false, critStreak: 0, primed: false, primeCd: 0 };
}
