/**
 * terrain.js — canonical TERRAIN type definitions.
 *
 * Zero project imports — safe to import from both MapGen and MapRenderer
 * without creating circular dependencies.
 *
 * sheetRow   = row index in TERRAIN1.GIF  (srcY = 1 + 33 * sheetRow)
 * overlayRow = row index in TERRAIN2.GIF  (magenta + grey keyed feature overlay)
 *              Overlay uses 4-diagonal bitmask (NE=1,SE=2,SW=4,NW=8) across
 *              two consecutive rows (indices 0-7 on overlayRow, 8-15 on overlayRow+1).
 *
 * TERRAIN1 row order (confirmed):
 *   0=Desert, 1=Plains, 2=Grassland, 3=Forest(base), 4=Hills(base),
 *   5=Mountains(base), 6=Tundra, 7=Arctic/Glacier, 8=Swamp, 9=Jungle, 10=Ocean
 *
 * TERRAIN2 overlay rows:
 *   4-5 = trees  (Forest, Jungle, Swamp)
 *   6-7 = mountains
 *   8-9 = hills
 *
 * Game stats from Civ2 MGE RULES.TXT @TERRAIN:
 *   food / shields / trade  — base yields per turn
 *   moveCost                — movement points to enter (1=normal, 2=difficult, 3=very hard)
 *   defense                 — combat defense multiplier × 50% (2=100%, 3=150%, 4=200%, 6=300%)
 *   roadBonus               — +1 trade when road present (Desert, Plains, Grassland)
 *
 * Terrain improvement data (from RULES.TXT @TERRAIN):
 *   irrigate    — 'yes' | 'no' | TERRAIN key (converts tile to that terrain)
 *   irrigBonus  — food bonus from irrigation
 *   irrigTurns  — settler turns to irrigate
 *   aiIrrigate  — minimum govt level for AI to irrigate (0=Never … 6=Democracy)
 *   mine        — 'yes' | 'no' | TERRAIN key (converts tile to that terrain)
 *   mineBonus   — shield bonus from mining
 *   mineTurns   — settler turns to mine
 *   aiMine      — minimum govt level for AI to mine
 *   transformTo — TERRAIN key engineers can transform to, or 'no'
 */

export const TERRAIN = {
  //                                                                                ── yields ──   mv  def  road
  DESERT:    { id: 0,  sheetRow: 0,  color: '#d4c070', label: 'Desert',    food: 0, shields: 1, trade: 0, moveCost: 1, defense: 2, roadBonus: true,
               irrigate: 'yes',         irrigBonus: 1, irrigTurns:  5, aiIrrigate: 5,
               mine: 'yes',             mineBonus:  1, mineTurns:   5, aiMine: 3,
               transformTo: 'PLAINS' },

  PLAINS:    { id: 1,  sheetRow: 1,  color: '#9db85a', label: 'Plains',    food: 1, shields: 1, trade: 0, moveCost: 1, defense: 2, roadBonus: true,
               irrigate: 'yes',         irrigBonus: 1, irrigTurns:  5, aiIrrigate: 1,
               mine: 'FOREST',          mineBonus:  0, mineTurns:  15, aiMine: 0,
               transformTo: 'GRASSLAND' },

  GRASSLAND: { id: 2,  sheetRow: 2,  color: '#5a8a30', label: 'Grassland', food: 2, shields: 1, trade: 0, moveCost: 1, defense: 2, roadBonus: true,
               irrigate: 'yes',         irrigBonus: 1, irrigTurns:  5, aiIrrigate: 2,
               mine: 'FOREST',          mineBonus:  0, mineTurns:  10, aiMine: 0,
               transformTo: 'HILLS' },

  TUNDRA:    { id: 3,  sheetRow: 6,  color: '#aab8b0', label: 'Tundra',    food: 1, shields: 0, trade: 0, moveCost: 1, defense: 2, roadBonus: false,
               irrigate: 'yes',         irrigBonus: 1, irrigTurns: 10, aiIrrigate: 1,
               mine: 'no',              mineBonus:  0, mineTurns:   0, aiMine: 0,
               transformTo: 'DESERT' },

  GLACIER:   { id: 4,  sheetRow: 7,  color: '#d8eaf5', label: 'Glacier',   food: 0, shields: 0, trade: 0, moveCost: 2, defense: 2, roadBonus: false,
               irrigate: 'no',          irrigBonus: 0, irrigTurns:  0, aiIrrigate: 0,
               mine: 'yes',             mineBonus:  1, mineTurns:  15, aiMine: 3,
               transformTo: 'TUNDRA' },

  SWAMP:     { id: 5,  sheetRow: 8,  color: '#3d5840', label: 'Swamp',     food: 1, shields: 0, trade: 0, moveCost: 2, defense: 3, roadBonus: false,
               irrigate: 'GRASSLAND',   irrigBonus: 0, irrigTurns: 15, aiIrrigate: 6,
               mine: 'FOREST',          mineBonus:  0, mineTurns:  15, aiMine: 0,
               transformTo: 'PLAINS' },

  JUNGLE:    { id: 6,  sheetRow: 9,  color: '#1a5c20', label: 'Jungle',    food: 1, shields: 0, trade: 0, moveCost: 2, defense: 3, roadBonus: false,
               irrigate: 'GRASSLAND',   irrigBonus: 0, irrigTurns: 15, aiIrrigate: 6,
               mine: 'FOREST',          mineBonus:  0, mineTurns:  15, aiMine: 0,
               transformTo: 'PLAINS' },

  OCEAN:     { id: 7,  sheetRow: 10, color: '#1a4a8a', label: 'Ocean',     food: 1, shields: 0, trade: 2, moveCost: 1, defense: 2, roadBonus: false,
               irrigate: 'no',          irrigBonus: 0, irrigTurns:  0, aiIrrigate: 0,
               mine: 'no',              mineBonus:  0, mineTurns:   0, aiMine: 0,
               transformTo: 'no' },

  HILLS:     { id: 8,  sheetRow: 4,  color: '#8b7040', label: 'Hills',     food: 1, shields: 0, trade: 0, moveCost: 2, defense: 4, roadBonus: false, overlayRow: 8,
               irrigate: 'yes',         irrigBonus: 1, irrigTurns: 10, aiIrrigate: 0,
               mine: 'yes',             mineBonus:  3, mineTurns:  10, aiMine: 1,
               transformTo: 'PLAINS' },

  MOUNTAINS: { id: 9,  sheetRow: 5,  color: '#7a7068', label: 'Mountains', food: 0, shields: 1, trade: 0, moveCost: 3, defense: 6, roadBonus: false, overlayRow: 6,
               irrigate: 'no',          irrigBonus: 1, irrigTurns: 10, aiIrrigate: 0,
               mine: 'yes',             mineBonus:  1, mineTurns:  10, aiMine: 6,
               transformTo: 'HILLS' },

  FOREST:    { id: 10, sheetRow: 3,  color: '#2d5a1c', label: 'Forest',    food: 1, shields: 2, trade: 0, moveCost: 2, defense: 3, roadBonus: false, overlayRow: 4,
               irrigate: 'PLAINS',      irrigBonus: 0, irrigTurns:  5, aiIrrigate: 5,
               mine: 'no',              mineBonus:  0, mineTurns:   5, aiMine: 0,
               transformTo: 'GRASSLAND' },
};

/**
 * Special resource definitions from RULES.TXT @TERRAIN (rows 11-32).
 * Each resource extends a base terrain with bonus food/shields/trade.
 *
 * Fields: label, baseTerrain (TERRAIN key), food, shields, trade
 */
export const SPECIAL_RESOURCES = [
  { id:  0, label: 'Oasis',       baseTerrain: 'DESERT',    food: 3, shields: 1, trade: 0, moveCost: 1, defense: 2 },
  { id:  1, label: 'Buffalo',     baseTerrain: 'PLAINS',    food: 1, shields: 3, trade: 0, moveCost: 1, defense: 2 },
  { id:  2, label: 'Grassland',   baseTerrain: 'GRASSLAND', food: 2, shields: 1, trade: 0, moveCost: 1, defense: 2 },
  { id:  3, label: 'Pheasant',    baseTerrain: 'FOREST',    food: 3, shields: 2, trade: 0, moveCost: 2, defense: 3 },
  { id:  4, label: 'Coal',        baseTerrain: 'HILLS',     food: 1, shields: 2, trade: 0, moveCost: 2, defense: 4 },
  { id:  5, label: 'Gold',        baseTerrain: 'MOUNTAINS', food: 0, shields: 1, trade: 6, moveCost: 3, defense: 6 },
  { id:  6, label: 'Game',        baseTerrain: 'TUNDRA',    food: 3, shields: 1, trade: 0, moveCost: 1, defense: 2 },
  { id:  7, label: 'Ivory',       baseTerrain: 'GLACIER',   food: 1, shields: 1, trade: 4, moveCost: 2, defense: 2 },
  { id:  8, label: 'Peat',        baseTerrain: 'SWAMP',     food: 1, shields: 4, trade: 0, moveCost: 2, defense: 3 },
  { id:  9, label: 'Gems',        baseTerrain: 'JUNGLE',    food: 1, shields: 0, trade: 4, moveCost: 2, defense: 3 },
  { id: 10, label: 'Fish',        baseTerrain: 'OCEAN',     food: 3, shields: 0, trade: 2, moveCost: 1, defense: 2 },
  { id: 11, label: 'Desert Oil',  baseTerrain: 'DESERT',    food: 0, shields: 4, trade: 0, moveCost: 1, defense: 2 },
  { id: 12, label: 'Wheat',       baseTerrain: 'PLAINS',    food: 3, shields: 1, trade: 0, moveCost: 1, defense: 2 },
  { id: 13, label: 'Grassland',   baseTerrain: 'GRASSLAND', food: 2, shields: 1, trade: 0, moveCost: 1, defense: 2 },
  { id: 14, label: 'Silk',        baseTerrain: 'FOREST',    food: 1, shields: 2, trade: 3, moveCost: 2, defense: 3 },
  { id: 15, label: 'Wine',        baseTerrain: 'HILLS',     food: 1, shields: 0, trade: 4, moveCost: 2, defense: 4 },
  { id: 16, label: 'Iron',        baseTerrain: 'MOUNTAINS', food: 0, shields: 4, trade: 0, moveCost: 3, defense: 6 },
  { id: 17, label: 'Furs',        baseTerrain: 'TUNDRA',    food: 2, shields: 0, trade: 3, moveCost: 1, defense: 2 },
  { id: 18, label: 'Glacier Oil', baseTerrain: 'GLACIER',   food: 0, shields: 4, trade: 0, moveCost: 2, defense: 2 },
  { id: 19, label: 'Fruit',       baseTerrain: 'SWAMP',     food: 4, shields: 0, trade: 1, moveCost: 2, defense: 3 },
  { id: 20, label: 'Spice',       baseTerrain: 'JUNGLE',    food: 3, shields: 0, trade: 4, moveCost: 2, defense: 3 },
  { id: 21, label: 'Whales',      baseTerrain: 'OCEAN',     food: 2, shields: 2, trade: 3, moveCost: 1, defense: 2 },
];
