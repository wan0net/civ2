/**
 * sounds.js — maps game events to sound stem names.
 *
 * Used by MapRenderer and GameState to trigger audio without knowing
 * the AudioManager internals.
 *
 * Each entry is either:
 *   string       → single sound
 *   string[]     → one chosen at random each time
 */

export const SFX = {
  // ── UI ──────────────────────────────────────────────────────────────────
  menuOk:         'MENUOK',
  menuEnd:        'MENUEND',
  pos:            'POS1',
  neg:            'NEG1',

  // ── Turn / movement ──────────────────────────────────────────────────────
  endTurn:        'ENDOTURN',
  moveUnit:       'MOVPIECE',
  foundCity:      'BLDCITY',
  sell:           'SELL',

  // ── Research / diplomacy ──────────────────────────────────────────────────
  // advanceFanfare() below selects among these by epoch + category
  advanceEarned:  ['FANFARE1','FANFARE2','FANFARE3','FANFARE4',
                   'FANFARE5','FANFARE6','FANFARE7','FANFARE8'],
  newGovt:        'NEWGOVT',
  letter:         'LETTER',       // diplomatic message
  spied:          'SPYSOUND',

  // ── City improvements / wonders ──────────────────────────────────────────
  newWonder:      'NEWONDER',
  buildBarracks:  'BARRACKS',
  buildAqueduct:  'AQUEDUCT',
  buildMarket:    'MRKTPLCE',
  buildCathedral: 'CATHEDRL',
  buildBank:      'NEWBANK',
  buildSpaceShip: 'BLDSPCSH',
  cityDisorder:   'CIVDISOR',
  cheers:         ['CHEERS1','CHEERS2','CHEERS3'],  // city growth

  // ── Combat — melee ────────────────────────────────────────────────────────
  combatSword:    'SWORDFGT',    // warriors, phalanx, etc.
  combatHorse:    'SWRDHORS',    // horsemen, chariots
  combatElephant: 'ELEPHANT',
  combatCatapult: 'CATAPULT',
  combatCavalry:  'CAVALRY',
  combatInfantry: 'INFANTRY',
  combatBigGun:   'BIGGUN',
  combatMedGun:   'MEDGUN',
  combatMachinegun:'MCHNGUNS',

  // ── Combat — ranged / air ─────────────────────────────────────────────────
  combatAirCombat:'AIRCOMBT',
  combatDiveBomb: 'DIVEBOMB',
  combatJetCombat:'JETCOMBT',
  combatJetBomb:  'JETBOMB',
  combatHeliShot: 'HELISHOT',
  combatMissile:  'MISSILE',
  combatNuke:     'NUKEXPLO',

  // ── Combat — naval ────────────────────────────────────────────────────────
  combatNaval:    'NAVBTTLE',
  combatTorpedo:  'TORPEDOS',
  boatSink:       'BOATSINK',

  // ── Explosions ────────────────────────────────────────────────────────────
  explSmall:      'SMALLEXP',
  explMed:        'MEDEXPL',
  explLarge:      'LARGEXPL',
  explFire:       'FIRE---',
  diveCrash:      'DIVCRASH',
  jetCrash:       'JETCRASH',
  guillotine:     'GUILLOTN',  // unit disbanded / executed

  // ── Engines ───────────────────────────────────────────────────────────────
  engineDiesel:   'DIESEL',
  engineJet:      'JETSPUTR',
  engineSputtering:'ENGNSPUT',

  // ── Stock market / economy ────────────────────────────────────────────────
  stockMarket:    'STKMARKT',
  pompCirc:       'POMPCIRC',  // "pomp and circumstance" (victory fanfare)

  // ── Crowd ─────────────────────────────────────────────────────────────────
  crowdBugle:     'CRWDBUGL',

  // ── Feedback ─────────────────────────────────────────────────────────────
  feedbackOk:     'FEEDBK03',
  feedbackWarn:   'FEEDBK04',
  feedbackBad:    'FEEDBKXX',
};

/**
 * Pick the appropriate combat sound for a unit type.
 * @param {import('../data/units.js').UnitDef} unitData
 * @returns {string|string[]} sound stem(s)
 */
export function combatSoundFor(unitData) {
  const n = unitData.name.toLowerCase();
  if (n.includes('nuke') || n.includes('nuclear')) return SFX.combatNuke;
  if (n.includes('missile') || n.includes('cruise')) return SFX.combatMissile;
  if (n.includes('bomber') || n.includes('stealth b')) return SFX.combatJetBomb;
  if (n.includes('fighter') || n.includes('jet') || n.includes('stealth f')) return SFX.combatJetCombat;
  if (n.includes('helicopter')) return SFX.combatHeliShot;
  if (n.includes('cannon') || n.includes('artillery') || n.includes('howitzer')) return SFX.combatBigGun;
  if (n.includes('battleship') || n.includes('cruiser') || n.includes('destroyer')) return SFX.combatNaval;
  if (n.includes('submarine')) return SFX.combatTorpedo;
  if (n.includes('transport') || n.includes('carrier') || n.includes('frigate')) return SFX.combatNaval;
  if (n.includes('elephant') || n.includes('cataphract')) return SFX.combatElephant;
  if (n.includes('catapult') || n.includes('trebuchet')) return SFX.combatCatapult;
  if (n.includes('cavalry') || n.includes('cossack') || n.includes('dragoon')) return SFX.combatCavalry;
  if (n.includes('horse') || n.includes('chariot') || n.includes('knight') || n.includes('crusader')) return SFX.combatHorse;
  if (n.includes('mech') || n.includes('armor') || n.includes('tank')) return SFX.combatMedGun;
  if (n.includes('riflemen') || n.includes('musket') || n.includes('musketeers')) return SFX.combatInfantry;
  if (n.includes('infantry') || n.includes('marines') || n.includes('partisan') || n.includes('alpine')) return SFX.combatMachinegun;
  // default: melee
  return SFX.combatSword;
}

/**
 * Pick the completion sound for a city improvement id.
 * @param {number} improvId
 * @param {import('../data/improvements.js').ImprovementDef} improvData
 * @returns {string|null}
 */
/**
 * Pick the fanfare for a discovered advance based on its epoch and category.
 *
 * Mapping (epoch 0-3) × (military vs peaceful):
 *   epoch 0 (Ancient)      military → FANFARE1   peaceful → FANFARE2
 *   epoch 1 (Renaissance)  military → FANFARE3   peaceful → FANFARE4
 *   epoch 2 (Industrial)   military → FANFARE5   peaceful → FANFARE6
 *   epoch 3 (Modern)       military → FANFARE7   peaceful → FANFARE8
 *
 * cat 0 = Military; cats 1-4 = peaceful.
 *
 * @param {{ epoch: number, cat: number }} advanceData
 * @returns {string}
 */
export function advanceFanfare(advanceData) {
  const epoch    = advanceData?.epoch ?? 0;          // 0-3
  const military = (advanceData?.cat ?? 1) === 0;    // cat 0 = Military
  const base     = Math.min(3, epoch) * 2;           // 0, 2, 4, 6
  return `FANFARE${base + (military ? 1 : 2)}`;
}

export function improvementSoundFor(improvId, improvData) {
  const n = (improvData?.name ?? '').toLowerCase();
  if (improvData?.wonder)                         return SFX.newWonder;
  if (n.includes('barracks'))                      return SFX.buildBarracks;
  if (n.includes('aqueduct'))                      return SFX.buildAqueduct;
  if (n.includes('marketplace') || n.includes('market')) return SFX.buildMarket;
  if (n.includes('cathedral') || n.includes('temple') || n.includes('church')) return SFX.buildCathedral;
  if (n.includes('bank'))                          return SFX.buildBank;
  if (n.includes('space'))                         return SFX.buildSpaceShip;
  return SFX.pos;  // generic positive feedback
}
