import { createRng } from './rng.js';
import { WORLD, PLAYER } from '../data/balance.js';
import { GUNS } from '../data/guns.js';

/**
 * @typedef {{ x: number, y: number }} Vec
 * @typedef {{ id: string, cooldown: number }} GunSlot
 * @typedef {{
 *   x: number, y: number, r: number,
 *   hp: number, maxHp: number,
 *   aim: number,            // 조준 각도(rad)
 *   invuln: number,         // 남은 무적 시간
 *   guns: (GunSlot|null)[], // [주무기, 보조]
 * }} Player
 * @typedef {{ id: number, type: string, x: number, y: number, r: number, hp: number, speed: number, damage: number }} Enemy
 * @typedef {{ x: number, y: number, vx: number, vy: number, r: number, damage: number, life: number, pierce: number, hitIds: number[] }} Bullet
 * @typedef {{ type: string, [k: string]: any }} GameEvent
 * @typedef {'MENU'|'COMBAT'|'LEVELUP'|'ROUND_END'|'BUY'|'VICTORY'|'DEFEAT'} Phase
 * @typedef {{
 *   seed: number, tick: number, time: number, phase: Phase,
 *   rng: { s: number },
 *   player: Player,
 *   enemies: Enemy[], bullets: Bullet[],
 *   events: GameEvent[],
 *   pending: null | { kind: string, options: any[] },
 *   stats: { kills: number },
 *   spawnAcc: number, nextId: number,
 * }} GameState
 */

/** @returns {GameState} */
export function createState(seed) {
  return {
    seed,
    tick: 0,
    time: 0,
    phase: 'COMBAT', // M1: 메뉴 없이 바로 전투
    rng: createRng(seed),
    player: {
      x: WORLD.width / 2,
      y: WORLD.height / 2,
      r: PLAYER.radius,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      aim: 0,
      invuln: 0,
      guns: PLAYER.startGuns.map((id) => (id && GUNS[id] ? { id, cooldown: 0 } : null)),
    },
    enemies: [],
    bullets: [],
    events: [],
    pending: null,
    stats: { kills: 0 },
    spawnAcc: 0,
    nextId: 1,
  };
}
