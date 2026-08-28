/**
 * units.js — Civ2 MGE unit type definitions.
 *
 * Source: RULES.TXT @UNITS section.
 *
 * Fields:
 *   id          — unit index (matches sprite sheet row order)
 *   name        — display name
 *   obsoletedBy — advance ID that makes unit obsolete (-1 = never)
 *   domain      — 0=Ground, 1=Air, 2=Sea
 *   move        — movement points per turn
 *   range       — fuel turns (air units); 0 for non-air
 *   attack      — attack factor
 *   defense     — defense factor
 *   hp          — hit points (damage ×10 before elimination)
 *   fp          — firepower (damage points per hit scored)
 *   cost        — production cost (shield rows)
 *   holds       — cargo capacity (ship holds)
 *   role        — AI role: 0=Attack,1=Defend,2=NavSuper,3=AirSuper,4=SeaTransport,5=Settle,6=Diplomacy,7=Trade
 *   prereq      — advance ID required to build (-1 = always available)
 *   flags       — 15-bit capability bitmask (see FLAG_* constants below)
 *
 * Flag bits (lsb → msb):
 *   0x0001 = Two-space visibility
 *   0x0002 = Ignore zones of control
 *   0x0004 = Amphibious assault
 *   0x0008 = Submarine (advantages/disadvantages)
 *   0x0010 = Can attack air units
 *   0x0020 = Must stay near land (trireme)
 *   0x0040 = Negates city walls (howitzer)
 *   0x0080 = Can carry air units (carrier)
 *   0x0100 = Can make paradrops
 *   0x0200 = Alpine (all terrain costs 1 move)
 *   0x0400 = ×2 defense vs horses (pikemen)
 *   0x0800 = Free support under Fundamentalism
 *   0x1000 = Destroyed after attacking (missiles)
 *   0x2000 = ×2 defense vs air (AEGIS)
 *   0x4000 = Can spot submarines
 */

export const FLAGS = {
  TWO_SPACE_VIS:    0x0001,
  IGNORE_ZOC:       0x0002,
  AMPHIBIOUS:       0x0004,
  SUBMARINE:        0x0008,
  ATTACK_AIR:       0x0010,
  NEAR_LAND:        0x0020,
  NEGATE_WALLS:     0x0040,
  CARRY_AIR:        0x0080,
  PARADROP:         0x0100,
  ALPINE:           0x0200,
  ANTI_HORSE:       0x0400,
  FREE_FUND_SUPP:   0x0800,
  DESTROYED_ATTACK: 0x1000,
  AEGIS:            0x2000,
  SPOT_SUB:         0x4000,
};

export const UNITS = [
  // id  name                 obsBy  dom  mv  rng  att  def  hp  fp  cost  hld  role  preq  flags
  { id:  0, name: 'Settlers',        obsoletedBy: 28, domain: 0, move:  1, range: 0, attack:  0, defense:  1, hp: 2, fp: 1, cost:  4, holds: 0, role: 5, prereq: -1, flags: 0x0000 },
  { id:  1, name: 'Engineers',       obsoletedBy: -1, domain: 0, move:  2, range: 0, attack:  0, defense:  2, hp: 2, fp: 1, cost:  4, holds: 0, role: 5, prereq: 28, flags: 0x0000 },
  { id:  2, name: 'Warriors',        obsoletedBy: 29, domain: 0, move:  1, range: 0, attack:  1, defense:  1, hp: 1, fp: 1, cost:  1, holds: 0, role: 1, prereq: -1, flags: 0x0000 },
  { id:  3, name: 'Phalanx',         obsoletedBy: 29, domain: 0, move:  1, range: 0, attack:  1, defense:  2, hp: 1, fp: 1, cost:  2, holds: 0, role: 1, prereq:  8, flags: 0x0000 },
  { id:  4, name: 'Archers',         obsoletedBy: 35, domain: 0, move:  1, range: 0, attack:  3, defense:  2, hp: 1, fp: 1, cost:  3, holds: 0, role: 1, prereq: 86, flags: 0x0000 },
  { id:  5, name: 'Legion',          obsoletedBy: 35, domain: 0, move:  1, range: 0, attack:  4, defense:  2, hp: 1, fp: 1, cost:  4, holds: 0, role: 1, prereq: 39, flags: 0x0000 },
  { id:  6, name: 'Pikemen',         obsoletedBy: 35, domain: 0, move:  1, range: 0, attack:  1, defense:  2, hp: 1, fp: 1, cost:  2, holds: 0, role: 1, prereq: 29, flags: 0x0400 },
  { id:  7, name: 'Musketeers',      obsoletedBy: 17, domain: 0, move:  1, range: 0, attack:  3, defense:  3, hp: 2, fp: 1, cost:  3, holds: 0, role: 1, prereq: 35, flags: 0x0000 },
  { id:  8, name: 'Fanatics',        obsoletedBy: -1, domain: 0, move:  1, range: 0, attack:  4, defense:  4, hp: 2, fp: 1, cost:  2, holds: 0, role: 1, prereq: 31, flags: 0x0800 },
  { id:  9, name: 'Partisans',       obsoletedBy: -1, domain: 0, move:  1, range: 0, attack:  4, defense:  4, hp: 2, fp: 1, cost:  5, holds: 0, role: 1, prereq: 34, flags: 0x0202 },
  { id: 10, name: 'Alpine Troops',   obsoletedBy: -1, domain: 0, move:  1, range: 0, attack:  5, defense:  5, hp: 2, fp: 1, cost:  5, holds: 0, role: 1, prereq: 81, flags: 0x0200 },
  { id: 11, name: 'Riflemen',        obsoletedBy: -1, domain: 0, move:  1, range: 0, attack:  5, defense:  4, hp: 2, fp: 1, cost:  4, holds: 0, role: 1, prereq: 17, flags: 0x0000 },
  { id: 12, name: 'Marines',         obsoletedBy: -1, domain: 0, move:  1, range: 0, attack:  8, defense:  5, hp: 2, fp: 1, cost:  6, holds: 0, role: 0, prereq:  2, flags: 0x0004 },
  { id: 13, name: 'Paratroopers',    obsoletedBy: -1, domain: 0, move:  1, range: 0, attack:  6, defense:  4, hp: 2, fp: 1, cost:  6, holds: 0, role: 1, prereq: 13, flags: 0x0100 },
  { id: 14, name: 'Mech. Inf.',      obsoletedBy: -1, domain: 0, move:  3, range: 0, attack:  6, defense:  6, hp: 3, fp: 1, cost:  5, holds: 0, role: 1, prereq: 40, flags: 0x0000 },
  { id: 15, name: 'Horsemen',        obsoletedBy: 11, domain: 0, move:  2, range: 0, attack:  2, defense:  1, hp: 1, fp: 1, cost:  2, holds: 0, role: 0, prereq: 36, flags: 0x0000 },
  { id: 16, name: 'Chariot',         obsoletedBy: 64, domain: 0, move:  2, range: 0, attack:  3, defense:  1, hp: 1, fp: 1, cost:  3, holds: 0, role: 0, prereq: 87, flags: 0x0000 },
  { id: 17, name: 'Elephant',        obsoletedBy: 55, domain: 0, move:  2, range: 0, attack:  4, defense:  1, hp: 1, fp: 1, cost:  4, holds: 0, role: 0, prereq: 64, flags: 0x0000 },
  { id: 18, name: 'Crusaders',       obsoletedBy: 42, domain: 0, move:  2, range: 0, attack:  5, defense:  1, hp: 1, fp: 1, cost:  4, holds: 0, role: 0, prereq: 55, flags: 0x0000 },
  { id: 19, name: 'Knights',         obsoletedBy: 42, domain: 0, move:  2, range: 0, attack:  4, defense:  2, hp: 1, fp: 1, cost:  4, holds: 0, role: 0, prereq: 11, flags: 0x0000 },
  { id: 20, name: 'Dragoons',        obsoletedBy: 81, domain: 0, move:  2, range: 0, attack:  5, defense:  2, hp: 2, fp: 1, cost:  5, holds: 0, role: 0, prereq: 42, flags: 0x0000 },
  { id: 21, name: 'Cavalry',         obsoletedBy: 53, domain: 0, move:  2, range: 0, attack:  8, defense:  3, hp: 2, fp: 1, cost:  6, holds: 0, role: 0, prereq: 81, flags: 0x0000 },
  { id: 22, name: 'Armor',           obsoletedBy: -1, domain: 0, move:  3, range: 0, attack: 10, defense:  5, hp: 3, fp: 1, cost:  8, holds: 0, role: 0, prereq: 53, flags: 0x0000 },
  { id: 23, name: 'Catapult',        obsoletedBy: 51, domain: 0, move:  1, range: 0, attack:  6, defense:  1, hp: 1, fp: 1, cost:  4, holds: 0, role: 0, prereq: 49, flags: 0x0000 },
  { id: 24, name: 'Cannon',          obsoletedBy: 44, domain: 0, move:  1, range: 0, attack:  8, defense:  1, hp: 2, fp: 1, cost:  4, holds: 0, role: 0, prereq: 51, flags: 0x0000 },
  { id: 25, name: 'Artillery',       obsoletedBy: 72, domain: 0, move:  1, range: 0, attack: 10, defense:  1, hp: 2, fp: 2, cost:  5, holds: 0, role: 0, prereq: 44, flags: 0x0000 },
  { id: 26, name: 'Howitzer',        obsoletedBy: -1, domain: 0, move:  2, range: 0, attack: 12, defense:  2, hp: 3, fp: 2, cost:  7, holds: 0, role: 0, prereq: 72, flags: 0x0040 },
  { id: 27, name: 'Fighter',         obsoletedBy: 77, domain: 1, move: 10, range: 1, attack:  4, defense:  3, hp: 2, fp: 2, cost:  6, holds: 0, role: 3, prereq: 30, flags: 0x0011 },
  { id: 28, name: 'Bomber',          obsoletedBy: 77, domain: 1, move:  8, range: 2, attack: 12, defense:  1, hp: 2, fp: 2, cost: 12, holds: 0, role: 0, prereq:  0, flags: 0x0001 },
  { id: 29, name: 'Helicopter',      obsoletedBy: -1, domain: 1, move:  6, range: 0, attack: 10, defense:  3, hp: 2, fp: 2, cost: 10, holds: 0, role: 0, prereq: 13, flags: 0x4001 },
  { id: 30, name: 'Stlth Ftr.',      obsoletedBy: -1, domain: 1, move: 14, range: 1, attack:  8, defense:  4, hp: 2, fp: 2, cost:  8, holds: 0, role: 3, prereq: 77, flags: 0x0011 },
  { id: 31, name: 'Stlth Bmbr.',     obsoletedBy: -1, domain: 1, move: 12, range: 2, attack: 14, defense:  5, hp: 2, fp: 2, cost: 16, holds: 0, role: 0, prereq: 77, flags: 0x0001 },
  { id: 32, name: 'Trireme',         obsoletedBy: 57, domain: 2, move:  3, range: 0, attack:  1, defense:  1, hp: 1, fp: 1, cost:  4, holds: 2, role: 4, prereq: 46, flags: 0x0020 },
  { id: 33, name: 'Caravel',         obsoletedBy: 45, domain: 2, move:  3, range: 0, attack:  2, defense:  1, hp: 1, fp: 1, cost:  4, holds: 3, role: 4, prereq: 57, flags: 0x0000 },
  { id: 34, name: 'Galleon',         obsoletedBy: 37, domain: 2, move:  4, range: 0, attack:  0, defense:  2, hp: 2, fp: 1, cost:  4, holds: 4, role: 4, prereq: 45, flags: 0x0000 },
  { id: 35, name: 'Frigate',         obsoletedBy: 23, domain: 2, move:  4, range: 0, attack:  4, defense:  2, hp: 2, fp: 1, cost:  5, holds: 2, role: 2, prereq: 45, flags: 0x0000 },
  { id: 36, name: 'Ironclad',        obsoletedBy: 23, domain: 2, move:  4, range: 0, attack:  4, defense:  4, hp: 3, fp: 1, cost:  6, holds: 0, role: 2, prereq: 78, flags: 0x0000 },
  { id: 37, name: 'Destroyer',       obsoletedBy: -1, domain: 2, move:  6, range: 0, attack:  4, defense:  4, hp: 3, fp: 1, cost:  6, holds: 0, role: 2, prereq: 23, flags: 0x4001 },
  { id: 38, name: 'Cruiser',         obsoletedBy: 73, domain: 2, move:  5, range: 0, attack:  6, defense:  6, hp: 3, fp: 2, cost:  8, holds: 0, role: 2, prereq: 79, flags: 0x4001 },
  { id: 39, name: 'AEGIS Cruiser',   obsoletedBy: -1, domain: 2, move:  5, range: 0, attack:  8, defense:  8, hp: 3, fp: 2, cost: 10, holds: 0, role: 2, prereq: 73, flags: 0x6001 },
  { id: 40, name: 'Battleship',      obsoletedBy: -1, domain: 2, move:  4, range: 0, attack: 12, defense: 12, hp: 4, fp: 2, cost: 16, holds: 0, role: 2, prereq:  5, flags: 0x0001 },
  { id: 41, name: 'Submarine',       obsoletedBy: -1, domain: 2, move:  3, range: 0, attack: 10, defense:  2, hp: 3, fp: 2, cost:  6, holds: 0, role: 2, prereq: 14, flags: 0x0009 },
  { id: 42, name: 'Carrier',         obsoletedBy: -1, domain: 2, move:  5, range: 0, attack:  1, defense:  9, hp: 4, fp: 2, cost: 16, holds: 0, role: 2, prereq:  0, flags: 0x0081 },
  { id: 43, name: 'Transport',       obsoletedBy: -1, domain: 2, move:  5, range: 0, attack:  0, defense:  3, hp: 3, fp: 1, cost:  5, holds: 8, role: 4, prereq: 37, flags: 0x0000 },
  { id: 44, name: 'Cruise Msl.',     obsoletedBy: -1, domain: 1, move: 12, range: 1, attack: 18, defense:  0, hp: 1, fp: 3, cost:  6, holds: 0, role: 0, prereq: 73, flags: 0x1000 },
  { id: 45, name: 'Nuclear Msl.',    obsoletedBy: -1, domain: 1, move: 16, range: 1, attack: 99, defense:  0, hp: 1, fp: 1, cost: 16, holds: 0, role: 0, prereq: 73, flags: 0x1000 },
  { id: 46, name: 'Diplomat',        obsoletedBy: 27, domain: 0, move:  2, range: 0, attack:  0, defense:  0, hp: 1, fp: 1, cost:  3, holds: 0, role: 6, prereq: 88, flags: 0x0002 },
  { id: 47, name: 'Spy',             obsoletedBy: -1, domain: 0, move:  3, range: 0, attack:  0, defense:  0, hp: 1, fp: 1, cost:  3, holds: 0, role: 6, prereq: 27, flags: 0x0003 },
  { id: 48, name: 'Caravan',         obsoletedBy: 19, domain: 0, move:  1, range: 0, attack:  0, defense:  1, hp: 1, fp: 1, cost:  5, holds: 0, role: 7, prereq: 84, flags: 0x0002 },
  { id: 49, name: 'Freight',         obsoletedBy: -1, domain: 0, move:  2, range: 0, attack:  0, defense:  1, hp: 1, fp: 1, cost:  5, holds: 0, role: 7, prereq: 19, flags: 0x0002 },
  { id: 50, name: 'Explorer',        obsoletedBy: 34, domain: 0, move:  1, range: 0, attack:  0, defense:  1, hp: 1, fp: 1, cost:  3, holds: 0, role: 0, prereq: 75, flags: 0x0202 },
];
