import { createRng } from './rng.js';
import { WORLD, PLAYER } from '../data/balance.js';
import { GUNS } from '../data/guns.js';

/**
 * @typedef {{ x: number, y: number }} Vec
 * @typedef {{ id: string, tier: number, cooldown: number, mods: Record<string, number> }} GunSlot
 * @typedef {{
 *   x: number, y: number, r: number,
 *   hp: number,
 *   shield: number, shieldMax: number,
 *   aim: number,            // 조준 각도(rad)
 *   invuln: number,         // 남은 무적 시간
 *   guns: (GunSlot|null)[], // [주무기, 보조]
 *   passives: Record<string, number>,
 *   level: number, xp: number,
 * }} Player
 * @typedef {{ id: number, type: string, x: number, y: number, r: number, hp: number, maxHp: number, speed: number, damage: number }} Enemy
 * @typedef {{ x: number, y: number, vx: number, vy: number, r: number, damage: number, crit: boolean, life: number, pierce: number, hitIds: number[] }} Bullet
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
 *   enemies: Enemy[], bullets: Bullet[], pickups: Pickup[],
 *   events: GameEvent[],
 *   pending: null | Pending,
 *   levelUpsQueued: number,
 *   shopCard: any, shopCardBought: boolean,
 *   stats: { kills: number, roundKills: number, creditsEarned: number },
 *   spawnAcc: number, nextId: number,
 * }} GameState
 */

/** @returns {GameState} */
export function createState(seed) {
  return {
    seed,
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
      invuln: 0,
      guns: PLAYER.startGuns.map((id) => (id && GUNS[id] ? createGunSlot(id) : null)),
      passives: {},
      level: 1,
      xp: 0,
    },
    enemies: [],
    bullets: [],
    pickups: [],
    events: [],
    pending: null,
    levelUpsQueued: 0,
    shopCard: null,
    shopCardBought: false,
    stats: { kills: 0, roundKills: 0, creditsEarned: 0 },
    spawnAcc: 0,
    nextId: 1,
  };
}

/** @returns {GunSlot} */
export function createGunSlot(id) {
  return { id, tier: 1, cooldown: 0, mods: {} };
}
