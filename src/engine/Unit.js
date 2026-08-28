/**
 * Unit.js — a single game unit instance.
 *
 * typeId  → index into UNITS[] (units.js)
 * civId   → owning civilisation index
 * col/row → current map position (staggered isometric grid)
 * hp      → current hit points (= unitData.hp at creation)
 * maxHp   → maximum hit points
 * movesLeft → movement points remaining this turn
 * maxMoves  → total movement points per turn
 * status    → 'active' | 'fortified' | 'sentry' | 'sleep' | 'building' | 'done'
 *              sentry: skips turns, wakes when enemy enters visual range (2 tiles)
 *              sleep:  skips turns indefinitely until manually clicked/activated
 * veteran   → boolean — earned in combat
 * homeCity  → City.id or null
 * buildTask  → { type, col, row, turnsLeft } | null  (terrain improvement in progress)
 * gotoTarget → { col, row } | null  (automated multi-turn movement destination)
 * cargo     → Unit[]  — units carried aboard this ship (domain=2, holds>0)
 * inShip    → Unit | null  — the ship this unit is currently aboard
 */

export class Unit {
  constructor({ id, typeId, civId, col, row, hp, maxMoves }) {
    this.id         = id;
    this.typeId     = typeId;
    this.civId      = civId;
    this.col        = col;
    this.row        = row;
    this.hp         = hp;
    this.maxHp      = hp;
    this.movesLeft  = maxMoves;
    this.maxMoves   = maxMoves;
    this.status     = 'active';
    this.veteran    = false;
    this.homeCity   = null;
    this.buildTask  = null;
    this.gotoTarget = null;
    this.fuel       = 0;   // remaining fuel turns (domain=1 air units only; 0 = unlimited for range=0)
    this.cargo      = [];  // carried units (only valid for ships with holds > 0)
    this.inShip     = null; // ship this unit is aboard, or null
  }
}
