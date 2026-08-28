/**
 * improvements.js — Civ2 MGE city improvements and wonders.
 *
 * Source: RULES.TXT @IMPROVE and @ENDWONDER sections.
 *
 * Indices 0–38  = city improvements (0 = "Nothing" placeholder)
 * Indices 39–66 = wonders of the world
 *
 * Fields:
 *   id        — improvement index
 *   name      — display name
 *   cost      — production cost (in shield rows × 10 = total shields needed)
 *   upkeep    — gold per turn maintenance
 *   prereq    — advance ID required to build (-1 = always available)
 *   isWonder  — true for wonders of the world
 *   expiresAt — advance ID that makes wonder obsolete (-1 = never expires, wonders only)
 */

export const IMPROVEMENTS = [
  // ── City Improvements ────────────────────────────────────────────────────────
  { id:  0, name: 'Nothing',                  cost:  1, upkeep: 0, prereq: -1, isWonder: false },
  { id:  1, name: 'Palace',                   cost: 10, upkeep: 0, prereq: 47, isWonder: false },
  { id:  2, name: 'Barracks',                 cost:  4, upkeep: 1, prereq: -1, isWonder: false },
  { id:  3, name: 'Granary',                  cost:  6, upkeep: 1, prereq: 65, isWonder: false },
  { id:  4, name: 'Temple',                   cost:  4, upkeep: 1, prereq:  9, isWonder: false },
  { id:  5, name: 'MarketPlace',              cost:  8, upkeep: 1, prereq: 20, isWonder: false },
  { id:  6, name: 'Library',                  cost:  8, upkeep: 1, prereq: 88, isWonder: false },
  { id:  7, name: 'Courthouse',               cost:  8, upkeep: 1, prereq: 12, isWonder: false },
  { id:  8, name: 'City Walls',               cost:  8, upkeep: 0, prereq: 47, isWonder: false },
  { id:  9, name: 'Aqueduct',                 cost:  8, upkeep: 2, prereq: 18, isWonder: false },
  { id: 10, name: 'Bank',                     cost: 12, upkeep: 3, prereq:  6, isWonder: false },
  { id: 11, name: 'Cathedral',                cost: 12, upkeep: 3, prereq: 55, isWonder: false },
  { id: 12, name: 'University',               cost: 16, upkeep: 3, prereq: 85, isWonder: false },
  { id: 13, name: 'Mass Transit',             cost: 16, upkeep: 4, prereq: 48, isWonder: false },
  { id: 14, name: 'Colosseum',                cost: 10, upkeep: 4, prereq: 18, isWonder: false },
  { id: 15, name: 'Factory',                  cost: 20, upkeep: 4, prereq: 37, isWonder: false },
  { id: 16, name: 'Manufacturing Plant',      cost: 32, upkeep: 6, prereq: 72, isWonder: false },
  { id: 17, name: 'SDI Defense',              cost: 20, upkeep: 4, prereq: 41, isWonder: false },
  { id: 18, name: 'Recycling Center',         cost: 20, upkeep: 2, prereq: 68, isWonder: false },
  { id: 19, name: 'Power Plant',              cost: 16, upkeep: 4, prereq: 69, isWonder: false },
  { id: 20, name: 'Hydro Plant',              cost: 24, upkeep: 4, prereq: 24, isWonder: false },
  { id: 21, name: 'Nuclear Plant',            cost: 16, upkeep: 2, prereq: 59, isWonder: false },
  { id: 22, name: 'Stock Exchange',           cost: 16, upkeep: 4, prereq: 22, isWonder: false },
  { id: 23, name: 'Sewer System',             cost: 12, upkeep: 2, prereq: 74, isWonder: false },
  { id: 24, name: 'Supermarket',              cost:  8, upkeep: 3, prereq: 70, isWonder: false },
  { id: 25, name: 'Superhighways',            cost: 20, upkeep: 5, prereq:  5, isWonder: false },
  { id: 26, name: 'Research Lab',             cost: 16, upkeep: 3, prereq: 16, isWonder: false },
  { id: 27, name: 'SAM Missile Battery',      cost: 10, upkeep: 2, prereq: 73, isWonder: false },
  { id: 28, name: 'Coastal Fortress',         cost:  8, upkeep: 1, prereq: 51, isWonder: false },
  { id: 29, name: 'Solar Plant',              cost: 32, upkeep: 4, prereq: 26, isWonder: false },
  { id: 30, name: 'Harbor',                   cost:  6, upkeep: 1, prereq: 75, isWonder: false },
  { id: 31, name: 'Offshore Platform',        cost: 16, upkeep: 3, prereq: 52, isWonder: false },
  { id: 32, name: 'Airport',                  cost: 16, upkeep: 3, prereq: 66, isWonder: false },
  { id: 33, name: 'Police Station',           cost:  6, upkeep: 2, prereq: 15, isWonder: false },
  { id: 34, name: 'Port Facility',            cost:  8, upkeep: 3, prereq:  2, isWonder: false },
  { id: 35, name: 'SS Structural',            cost:  8, upkeep: 0, prereq: 76, isWonder: false },
  { id: 36, name: 'SS Component',             cost: 16, upkeep: 0, prereq: 62, isWonder: false },
  { id: 37, name: 'SS Module',                cost: 32, upkeep: 0, prereq: 80, isWonder: false },
  { id: 38, name: '(Capitalization)',          cost: 60, upkeep: 0, prereq: 19, isWonder: false },

  // ── Wonders of the World ─────────────────────────────────────────────────────
  { id: 39, name: 'Pyramids',                  cost: 20, upkeep: 0, prereq: 47, isWonder: true, expiresAt: -1 },
  { id: 40, name: 'Hanging Gardens',           cost: 20, upkeep: 0, prereq: 65, isWonder: true, expiresAt: 67 },
  { id: 41, name: 'Colossus',                  cost: 20, upkeep: 0, prereq:  8, isWonder: true, expiresAt: 30 },
  { id: 42, name: 'Lighthouse',                cost: 20, upkeep: 0, prereq: 46, isWonder: true, expiresAt: 45 },
  { id: 43, name: 'Great Library',             cost: 30, upkeep: 0, prereq: 43, isWonder: true, expiresAt: 23 },
  { id: 44, name: 'Oracle',                    cost: 30, upkeep: 0, prereq: 56, isWonder: true, expiresAt: 82 },
  { id: 45, name: 'Great Wall',                cost: 30, upkeep: 0, prereq: 47, isWonder: true, expiresAt: 51 },
  { id: 46, name: "Sun Tzu's War Academy",     cost: 30, upkeep: 0, prereq: 29, isWonder: true, expiresAt: 53 },
  { id: 47, name: "King Richard's Crusade",    cost: 30, upkeep: 0, prereq: 25, isWonder: true, expiresAt: 37 },
  { id: 48, name: "Marco Polo's Embassy",      cost: 20, upkeep: 0, prereq: 84, isWonder: true, expiresAt: 15 },
  { id: 49, name: "Michelangelo's Chapel",     cost: 40, upkeep: 0, prereq: 55, isWonder: true, expiresAt: -1 },
  { id: 50, name: "Copernicus' Observatory",   cost: 30, upkeep: 0, prereq:  3, isWonder: true, expiresAt: -1 },
  { id: 51, name: "Magellan's Expedition",     cost: 40, upkeep: 0, prereq: 57, isWonder: true, expiresAt: -1 },
  { id: 52, name: "Shakespeare's Theatre",     cost: 30, upkeep: 0, prereq: 50, isWonder: true, expiresAt: -1 },
  { id: 53, name: "Leonardo's Workshop",       cost: 40, upkeep: 0, prereq: 38, isWonder: true, expiresAt:  5 },
  { id: 54, name: "J. S. Bach's Cathedral",    cost: 40, upkeep: 0, prereq: 82, isWonder: true, expiresAt: -1 },
  { id: 55, name: "Isaac Newton's College",    cost: 40, upkeep: 0, prereq: 83, isWonder: true, expiresAt: -1 },
  { id: 56, name: "Adam Smith's Trading Co.",  cost: 40, upkeep: 0, prereq: 22, isWonder: true, expiresAt: -1 },
  { id: 57, name: "Darwin's Voyage",           cost: 40, upkeep: 0, prereq: 67, isWonder: true, expiresAt: -1 },
  { id: 58, name: 'Statue of Liberty',         cost: 40, upkeep: 0, prereq: 21, isWonder: true, expiresAt: -1 },
  { id: 59, name: 'Eiffel Tower',              cost: 30, upkeep: 0, prereq: 78, isWonder: true, expiresAt: -1 },
  { id: 60, name: "Women's Suffrage",          cost: 60, upkeep: 0, prereq: 37, isWonder: true, expiresAt: -1 },
  { id: 61, name: 'Hoover Dam',                cost: 60, upkeep: 0, prereq: 24, isWonder: true, expiresAt: -1 },
  { id: 62, name: 'Manhattan Project',         cost: 60, upkeep: 0, prereq: 58, isWonder: true, expiresAt: -1 },
  { id: 63, name: 'United Nations',            cost: 60, upkeep: 0, prereq: 15, isWonder: true, expiresAt: -1 },
  { id: 64, name: 'Apollo Program',            cost: 60, upkeep: 0, prereq: 76, isWonder: true, expiresAt: -1 },
  { id: 65, name: 'SETI Program',              cost: 60, upkeep: 0, prereq: 16, isWonder: true, expiresAt: -1 },
  { id: 66, name: 'Cure for Cancer',           cost: 60, upkeep: 0, prereq: 33, isWonder: true, expiresAt: -1 },
];
