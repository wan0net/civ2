/**
 * GameState.js — central game state container.
 *
 * Owns the map tiles, all civilisations, units, and cities.
 * Drives turn flow: human player is always civ[0]; AI civs auto-pass.
 *
 * Public API used by MapRenderer:
 *   .tiles          — tiles[row][col] → TERRAIN reference
 *   .mapCols / .mapRows
 *   .civs[]         — Civilization instances
 *   .units[]        — Unit instances
 *   .cities[]       — City instances
 *   .turn           — current game turn (1-based)
 *   .activeCivIdx   — index of civ whose turn it is
 *   .activeUnit     — Unit | null
 *   .log            — string[] of recent event messages (newest first)
 *   .selectUnit(u)
 *   .moveUnit(u, col, row) → true on success (move or attack)
 *   .foundCity(u)          → City | false
 *   .endTurn()
 *   .unitsAt(col, row)  → Unit[]
 *   .cityAt(col, row)   → City | null
 *   .cityYields(city)   → { food, shields, trade }
 *   .advanceCost(civ)   → beaker cost for next advance
 *   .availableAdvances(civIdx) → ADVANCES[] that can be researched now
 *   .startResearch(civIdx, advId)
 */

import { MapGen }        from './MapGen.js';
import { TERRAIN, SPECIAL_RESOURCES } from '../data/terrain.js';
import { CIVS }          from '../data/civs.js';
import { UNITS, FLAGS }  from '../data/units.js';
import { IMPROVEMENTS }  from '../data/improvements.js';
import { COSMIC }        from '../data/cosmic.js';
import { GOVERNMENTS }   from '../data/governments.js';
import { ADVANCES }      from '../data/advances.js';
import { CITY_NAMES, EXTRA_CITIES } from '../data/cities.js';
import { Unit }          from './Unit.js';
import { City }          from './City.js';
import { Civilization }  from './Civilization.js';
import { exportCiv2Sav } from './Civ2SaveWriter.js';
import { executeEvents } from './ScenarioEvents.js';

import { neighbours, cityRadius, applyMapLogicMixin } from './mixins/MapLogic.js';

const MAX_LOG = 8;

// ─── Trade Commodities (from RULES.TXT @CARAVAN) ─────────────────────────────
const COMMODITIES = [
  'Hides', 'Wool', 'Beads', 'Cloth', 'Salt', 'Coal', 'Copper', 'Dye',
  'Wine', 'Silk', 'Silver', 'Spice', 'Gems', 'Gold', 'Oil', 'Uranium',
];

// ─── Game Logic Constants ──────────────────────────────────────────────────────
const HP_SCALE = 10;                    // HP damage scale factor (10 = 1 HP)
const BARB_TECH_TIER2 = 10;             // Barbarian tech threshold for tier 2
const BARB_TECH_TIER1 = 4;              // Barbarian tech threshold for tier 1
const BARB_MIN_DIST = 3;                // Minimum distance from player cities for barbarian spawn
const BARB_MAX_DIST = 50;               // Maximum distance from player cities for barbarian spawn
const PATHFIND_MAX_TILES = 800;         // BFS pathfinding cap for performance

// ─── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────
/**
 * Mulberry32 — fast, simple seeded PRNG.
 * Returns a function that generates floats in [0, 1).
 */
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class GameState {
  /**
   * @param {object} opts
   * @param {number}  [opts.seed=0xdeadbeef]
   * @param {number}  [opts.numCivs=3]
   * @param {number}  [opts.mapCols=80]
   * @param {number}  [opts.mapRows=50]
   * @param {object|null} [opts.mapData]  — pre-parsed map from MapLoader.load(); if supplied,
   *                                        MapGen is skipped and mapCols/mapRows are ignored.
   */
  static async create(opts = {}) {
    if (opts.mapData || opts._skipInit) {
      return new GameState(opts);
    }
    
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./MapGenWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        if (e.data.type === 'done') {
          worker.terminate();
          const { tiles, resources, rivers } = e.data.result;
          
          // Re-map cloned TERRAIN objects back to actual references
          for (let r = 0; r < (opts.mapRows || 50); r++) {
            for (let c = 0; c < (opts.mapCols || 80); c++) {
              const tId = tiles[r][c].id;
              tiles[r][c] = Object.values(TERRAIN).find(t => t.id === tId) || TERRAIN.OCEAN;
            }
          }
          
          opts.mapData = { cols: opts.mapCols || 80, rows: opts.mapRows || 50, tiles, resources, rivers };
          resolve(new GameState(opts));
        } else if (e.data.type === 'progress') {
          if (opts.onProgress) opts.onProgress(e.data.message);
        }
      };
      
      worker.onerror = (err) => reject(err);
      
      worker.postMessage({
        cols: opts.mapCols || 80,
        rows: opts.mapRows || 50,
        worldType: opts.worldType || 'continents',
        climate: opts.climate || 'normal',
        temperature: opts.temperature || 'temperate',
        age: opts.age || '4b',
        landMass: opts.landMass || 1,
        seed: opts.seed || 0xdeadbeef
      });
    });
  }

   constructor({ seed = 0xdeadbeef, numCivs = 3, mapCols = 80, mapRows = 50,
                 scenario = null, mapData = null,
                 playerCiv = 0, difficulty = 1,
                 worldType = 'continents', climate = 'normal',
                 temperature = 'temperate', age = '4b',
                 barbarians = 'sedentary', landMass = 1, flatEarth = false,
                 startingBonuses = true,
                 _skipInit = false } = {}) {
     if (_skipInit) return; // Used by fromSaveData — fields are set manually after construction

     this.seed = seed;
     this.rng = mulberry32(seed);
     this.barbarians = barbarians;
     this.flatEarth = flatEarth;

    // ── Map source: loaded .MP file or procedurally generated ─────────────────
    let cols, rows, tiles, resources, rivers, rawImprovements;
    if (mapData) {
      ({ cols, rows, tiles, resources, rivers } = mapData);
      rawImprovements = mapData.improvements ?? null;
    } else {
      cols = mapCols;
      rows = mapRows;
      // Fallback for synchronous generation, e.g. in tests
      ({ tiles, resources, rivers } = new MapGen({ seed }).generate(cols, rows, worldType, climate, temperature, age, landMass));
      rawImprovements = null;
    }

    this.mapCols = cols;
    this.mapRows = rows;
    this.turn    = 1;

    this.activeCivIdx = 0;
    this.activeUnit   = null;
    this._waitingUnits = [];  // units deferred via Wait order (W key)

    this._nextUnitId = 0;
    this._nextCityId = 0;

    /** @type {string[]} Recent event messages, newest first. */
    this.log = [];

    /**
     * Optional audio/event callback.  MapRenderer sets this after construction.
     * @type {((type: string, data?: any) => void) | null}
     */
    this.onEvent = null;

    /**
     * Set to { result: 'win'|'lose'|'score-win'|'score-lose', score: number }
     * when the game ends. Null while the game is in progress.
     * @type {null|{result: string, score: number}}
     */
    this.gameOver = null;
    // Consecutive completed turns in which no surviving civilization was at
    // war. Civ2 awards three score points per turn of world peace, capped at
    // 100 points.
    this._worldPeaceTurns = 0;

    // Track which turn each war started: key = "civA_civB" (both orderings).
    /** @type {Map<string, number>} */
    this._warSinceTurn = new Map();

    /** Whether any civ has built the Apollo Program wonder (id=64). */
    this._apolloBuilt = false;

    /** Whether any civ has built the Manhattan Project wonder (id=62). Enables nukes for all. */
    this._manhattanBuilt = false;

    /** Whether the UN election (id=63) has already been called this game. */
    this._unElectionUsed = false;

    /**
     * Territory history for end-game replay map.
     * Array of snapshots, one per turn: { turn, owners: Map<"row,col", civIdx> }
     * Only tracks city BFC tiles (owned territory). Capped to avoid memory bloat.
     * @type {Array<{turn: number, owners: Uint8Array}>}
     */
    this._territoryHistory = [];

    /**
     * Palace level per civ (0-5). Increases as civ advances through eras.
     * @type {number[]}
     */
    this._palaceLevel = [];

    /**
     * Throne room decoration upgrades (human player).
     * Each category has an original-MGE period tier 0-3 (primitive to ornate).
     * Upgrades are offered on milestones: wonder completion, era advancement.
     * @type {{floor:number,walls:number,throne:number,entrance:number,columns:number,windows:number,guards:number,banner:number}}
     */
    this._throneDecorations = {
      floor: 0, walls: 0, throne: 0, entrance: 0,
      columns: 0, windows: 0, guards: 0, banner: 0,
    };
    /** Pending throne decoration offer (category choices for player). null = no offer. */
    this._pendingThroneOffer = null;

    /** Scenario fields — set by Civ2SaveLoader.fromScenario() */
    this._isScenario   = false;
    this._scenarioName = null;
    this._maxTurns     = 0; // 0 = no turn limit
    /** @type {Array<{trigger:object, actions:object[], justOnce:boolean, fired:boolean}>} */
    this._scenarioEvents = [];

    /** Game options — persisted in save data. */
    this._gameOptions = {
      animations: true,
      autoSave: true,
      tutorialHelp: false,
      productionAlerts: true,
      endOfTurnMessages: true,
    };

    /** Casualty log: each entry { turn, unitTypeId, defenderCivId, killerCivId }. */
    this._casualties = [];

    /** Power history: one entry per turn snapshot, each: { turn, ratings: [civId → number] }. */
    this._powerHistory = [];

    this.tiles      = tiles;
    this._resources = resources;  // resources[row][col] = SPECIAL_RESOURCES index or -1
    this._rivers    = rivers;     // rivers[row][col]    = 8-bit direction bitmask

    // Visibility for the human player (civ 0).
    // 0 = never seen (black), 1 = explored (greyed terrain, no units), 2 = currently visible.
    this._visibility = Array.from({ length: rows }, () => new Uint8Array(cols));

    // Per-tile improvement flags — independent of terrain type.
    this._tileImprovements = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () =>
        ({ road: false, railroad: false, irrigation: false, farmland: false, mine: false, fortress: false, pollution: false, fallout: false, hut: false, airbase: false })
      )
    );

    // Populate improvements from .MP file data if present.
    // byte[1] bit encoding: 0=road, 1=railroad, 2=irrigation, 3=mine, 4=fortress,
    //   5=pollution, 6=farmland/fallout, 7=airbase
    if (rawImprovements) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const b = rawImprovements[r][c];
          this._tileImprovements[r][c] = {
            road:       !!(b & 0x01),
            railroad:   !!(b & 0x02),
            irrigation: !!(b & 0x04),
            farmland:   false,
            mine:       !!(b & 0x08),
            fortress:   !!(b & 0x10),
            pollution:  !!(b & 0x20),
            fallout:    !!(b & 0x40),
            hut:        false,
            airbase:    !!(b & 0x80),
          };
        }
      }
    }

    this.difficulty = difficulty;  // 0=Chieftain … 5=Deity

    // Create civilisations — playerCiv controls which CIVS entry the human plays;
    // that entry is placed at local index 0 (human is always civs[0]).
    const civOrder = [playerCiv % CIVS.length];
    for (let i = 0; civOrder.length < Math.min(numCivs, CIVS.length); i++) {
      if (i !== (playerCiv % CIVS.length)) civOrder.push(i);
    }
    this.civs = [];
    civOrder.forEach((civIdx, localId) => {
      this.civs.push(new Civilization({ id: localId, data: CIVS[civIdx] }));
    });
    // Initialise all civ pairs to 'peace'
    for (const a of this.civs) {
      for (const b of this.civs) {
        if (a.id !== b.id) a.relations.set(b.id, 'peace');
      }
    }

    // ── Barbarian civ ─────────────────────────────────────────────────────────
    if (barbarians !== 'none') {
      const barbId = this.civs.length;
      const barbData = {
        id: -1, plural: 'Barbarians', adjective: 'Barbarian', leader: 'Attila',
        attack: 1, expand: -1, civilize: -1, color: 7
      };
      this.civs.push(new Civilization({ id: barbId, data: barbData }));
      this.barbarianCivIdx = barbId;
      // At war with everyone
      for (const civ of this.civs) {
        if (civ.id !== barbId) {
          civ.relations.set(barbId, 'war');
          this.civs[barbId].relations.set(civ.id, 'war');
        }
      }
    } else {
      this.barbarianCivIdx = -1;
    }

    this.units  = [];
    this.cities = [];

    // Place starting units — each civ gets one Settler on a land tile
    const landTiles = this._landTiles();
    const usedSet   = new Set();

    for (const civ of this.civs) {
      const pos = this._pickStart(landTiles, usedSet);
      if (!pos) continue;
      this._spawnUnit(0 /* Settlers */, civ.id, pos.col, pos.row);
      // Reserve a radius so civs start well apart
      for (let dr = -5; dr <= 5; dr++) {
        for (let dc = -5; dc <= 5; dc++) {
          usedSet.add(`${pos.col + dc},${pos.row + dr}`);
        }
      }
    }

    if (scenario === 'combat') this._setupCombatScenario();

    // Place goody huts on land tiles (~5% density, not on city/unit start positions)
    this._placeGoodyHuts(seed);

    // Compute island/continent numbering (axx0: Islands.cs flood-fill)
    this._computeIslands();

    // Civ2 compensates civilizations with comparatively poor starts using
    // one or more advances and, for a large disadvantage, a second Settler.
    if (startingBonuses) this._applyStartingBonuses();

     this._beginCivTurn(0);
     this._selectNextUnit();
     this._updateVisibility();
   }

  /**
   * Apply Civ2's relative starting-position handicap bonuses.
   *
   * The documented original procedure scores isolation, nearby terrain and
   * continent size from 0..8. A civ receives maxHandicap-ownHandicap bonus
   * points: four points buy a second Settler (then subtract three), and each
   * remaining point grants one prerequisite-valid ancient advance.
   */
  _applyStartingBonuses() {
    const playableCivs = this.civs.filter(civ => civ.id !== this.barbarianCivIdx);
    const starts = playableCivs.map(civ => ({
      civ,
      unit: this.units.find(unit => unit.civId === civ.id && unit.typeId === 0),
    })).filter(entry => entry.unit);
    if (!starts.length) return;

    const islandSizes = new Map();
    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        const id = this.getIslandId(col, row);
        if (id > 0) islandSizes.set(id, (islandSizes.get(id) ?? 0) + 1);
      }
    }

    const distance = (a, b) => {
      const dc0 = Math.abs(a.col - b.col);
      const dc = this.flatEarth ? dc0 : Math.min(dc0, this.mapCols - dc0);
      return Math.hypot(dc, a.row - b.row);
    };

    const scored = starts.map(entry => {
      const { unit } = entry;
      const islandId = this.getIslandId(unit.col, unit.row);
      const sameIsland = starts.filter(other =>
        other !== entry && this.getIslandId(other.unit.col, other.unit.row) === islandId);

      let handicap = 0;
      if (!sameIsland.length) handicap += 4;
      else {
        const nearest = Math.min(...sameIsland.map(other => distance(unit, other.unit)));
        if (nearest >= 20) handicap += 2;
        else if (nearest >= 10) handicap += 1;
      }

      const localTiles = [{ col: unit.col, row: unit.row }, ...neighbours(unit.col, unit.row, this.mapCols)]
        .filter(tile => tile.row >= 0 && tile.row < this.mapRows);
      if (localTiles.some(tile => (this._rivers[tile.row]?.[tile.col] ?? 0) > 0)) handicap += 2;
      else if (localTiles.filter(tile => this.tiles[tile.row][tile.col] === TERRAIN.GRASSLAND).length >= 3) handicap += 1;

      const islandSize = islandSizes.get(islandId) ?? 0;
      if (islandSize >= 200) handicap += 2;
      else if (islandSize >= 100) handicap += 1;
      return { ...entry, handicap };
    });

    const maximumHandicap = Math.max(...scored.map(entry => entry.handicap));
    this._startingHandicaps = scored.map(entry => entry.handicap);
    this._startingBonuses = [];

    for (const entry of scored) {
      let bonus = maximumHandicap - entry.handicap;
      const originalBonus = bonus;
      if (bonus >= 4) {
        const freeTile = this._findFreeLandTile(entry.unit.col, entry.unit.row);
        if (freeTile) this._spawnUnit(0, entry.civ.id, freeTile.col, freeTile.row);
        bonus -= 3;
      }

      entry.civ.startingAdvanceIds = [];
      for (let i = 0; i < bonus; i++) {
        const available = ADVANCES.filter(advance => {
          if (advance.id >= 89 || advance.epoch !== 0 || entry.civ.advances.has(advance.id)) return false;
          return advance.preq.every(prereq => prereq === -1 || entry.civ.advances.has(prereq));
        });
        if (!available.length) break;

        const weights = available.map(advance =>
          Math.max(1, advance.aiValue + advance.civMod * (entry.civ.data?.civilize ?? 0)));
        const total = weights.reduce((sum, value) => sum + value, 0);
        let roll = this.rng() * total;
        let chosen = available[available.length - 1];
        for (let index = 0; index < available.length; index++) {
          roll -= weights[index];
          if (roll < 0) { chosen = available[index]; break; }
        }
        entry.civ.advances.add(chosen.id);
        entry.civ.startingAdvanceIds.push(chosen.id);
      }
      this._startingBonuses.push(originalBonus);
    }
  }

   // ─── Column wrapping (respects flatEarth mode) ──────────────────────────────

   /**
    * Normalize column to valid range, respecting flatEarth mode.
    * If flatEarth is true, clamps to [0, mapCols). Otherwise wraps toroidally.
    */
   _wrapCol(col) {
     if (this.flatEarth) {
       return Math.max(0, Math.min(col, this.mapCols - 1));
     }
     return ((col % this.mapCols) + this.mapCols) % this.mapCols;
   }

   // ─── Debug scenarios ───────────────────────────────────────────────────────

  /**
   * Combat test scenario.
   * Places 2 human Warriors adjacent to the human Settler, and 2 AI Warriors
   * immediately adjacent to those — so combat is one click away.
   */
  _setupCombatScenario() {
    const settler = this.units.find(u => u.civId === 0);
    if (!settler) return;

    const landNeighbours = (col, row) =>
      neighbours(col, row, this.mapCols).filter(n =>
        n.row >= 0 && n.row < this.mapRows &&
        this.tiles[n.row][n.col] !== TERRAIN.OCEAN
      );

    // Find two land tiles adjacent to the Settler for human Warriors
    const adjToSettler = landNeighbours(settler.col, settler.row);
    if (adjToSettler.length < 2) return;

    const occupied = new Set(this.units.map(u => `${u.col},${u.row}`));

    const freeAdj = adjToSettler.filter(n => !occupied.has(`${n.col},${n.row}`));
    if (freeAdj.length < 2) return;

    const hw1 = freeAdj[0];
    const hw2 = freeAdj[1];
    this._spawnUnit(22 /* Armor */, 0, hw1.col, hw1.row);
    this._spawnUnit(22,             0, hw2.col, hw2.row);
    occupied.add(`${hw1.col},${hw1.row}`);
    occupied.add(`${hw2.col},${hw2.row}`);

    // Place one AI Warrior adjacent to each human Warrior
    for (const hwPos of [hw1, hw2]) {
      const aiPos = landNeighbours(hwPos.col, hwPos.row)
        .find(n => !occupied.has(`${n.col},${n.row}`));
      if (aiPos) {
        this._spawnUnit(2, 1, aiPos.col, aiPos.row);
        occupied.add(`${aiPos.col},${aiPos.row}`);
      }
    }

    this._addLog('Combat scenario: move a Warrior onto an enemy to attack!');
  }

  // ─── Island / Continent numbering (axx0: Islands.cs) ─────────────────────
  // (Moved to MapLogic.js mixin)

  // ─── Goody Huts ────────────────────────────────────────────────────────────

  _placeGoodyHuts(seed) {
    // Simple LCG seeded by map seed for deterministic placement
    let rng = seed >>> 0;
    const next = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 0x100000000; };
    const occupiedSet = new Set(this.units.map(u => `${u.col},${u.row}`));

    for (let r = 0; r < this.mapRows; r++) {
      for (let c = 0; c < this.mapCols; c++) {
        const tile = this.tiles[r][c];
        // Only land tiles, not adjacent to ocean if possible
        if (!tile || tile === TERRAIN.OCEAN) continue;
        if (occupiedSet.has(`${c},${r}`)) continue;
        if (next() < 0.05) { // ~5% of land tiles
          this._tileImprovements[r][c].hut = true;
        }
      }
    }
  }

  /**
  /**
   * Triggered when a unit lands on a goody hut tile.
   * Consumes the hut and grants a random reward.
   */
  _goodyHutReward(unit, col, row) {
    const civ = this.civs[unit.civId];
    if (!civ) return;
    this._tileImprovements[row][col].hut = false;

    const roll = this.rng();
    let reward;
    if (roll < 0.30) {
      // Gold (50 gold)
      const amount = 25 + Math.floor(this.rng() * 50);
      civ.gold += amount;
      reward = { type: 'gold', amount };
      this._addLog(`Found a friendly tribe! They give you ${amount} gold.`);
    } else if (roll < 0.55) {
      // Free advance
      const avail = this.availableAdvances(unit.civId);
      if (avail.length > 0) {
        const adv = avail[Math.floor(this.rng() * avail.length)];
        civ.advances.add(adv.id);
        reward = { type: 'advance', advId: adv.id, advName: adv.name };
        this._addLog(`Ancient scrolls teach your people ${adv.name}!`);
      } else {
        // Fallback: gold if no advances available
        const amount = 50;
        civ.gold += amount;
        reward = { type: 'gold', amount };
        this._addLog(`Friendly tribe gives you ${amount} gold.`);
      }
    } else if (roll < 0.75) {
      // Free unit (Warriors typeId=2)
      const placed = this._findFreeLandTile(col, row);
      if (placed) {
        this._spawnUnit(2, unit.civId, placed.col, placed.row);
        reward = { type: 'unit', unitName: 'Warriors' };
        this._addLog('Friendly barbarians join your empire!');
      } else {
        const amount = 25;
        civ.gold += amount;
        reward = { type: 'gold', amount };
        this._addLog(`Friendly tribe gives you ${amount} gold.`);
      }
    } else if (roll < 0.85) {
      // Population bonus — grow nearest city by 1
      const nearestCity = this.cities.filter(c => c.civId === unit.civId)
        .sort((a, b) => Math.abs(a.col - col) + Math.abs(a.row - row) -
                        (Math.abs(b.col - col) + Math.abs(b.row - row)))[0];
      if (nearestCity) {
        nearestCity.size = Math.min(nearestCity.size + 1, 30);
        reward = { type: 'population', cityName: nearestCity.name };
        this._addLog(`New settlers swell the population of ${nearestCity.name}!`);
      } else {
        // Fallback: gold
        const amount = 25;
        civ.gold += amount;
        reward = { type: 'gold', amount };
      }
    } else {
      // Barbarian attack — spawn a warrior for the barbarian civ nearby
      const barbCivIdx = this.barbarianCivIdx ?? -1;
      if (barbCivIdx >= 0) {
        const placed = this._findFreeLandTile(col, row);
        if (placed) {
          this._spawnUnit(2, barbCivIdx, placed.col, placed.row);
          reward = { type: 'barbarians' };
          this._addLog('Barbarians attack from the village!');
        }
      } else {
        const amount = 25;
        civ.gold += amount;
        reward = { type: 'gold', amount };
      }
    }

    if (unit.civId === 0) {
      this._emit('goodyHut', { unit, col, row, reward });
    }
  }

  // ─── Turn → calendar year ───────────────────────────────────────────────────

  /**
   * In-game calendar year (negative = B.C.) for the given 1-based turn number.
   * Difficulty-scaled acceleration schedule, ported directly from axx0 Date.cs GameYear().
   *
   * Difficulty mapping (matches axx0 DifficultyType enum):
   *   0=Chieftain, 1=Warlord → schedule A (slow early, fast late)
   *   2=Prince               → schedule B
   *   3=King                 → schedule C
   *   4=Emperor, 5=Deity     → schedule D (fastest acceleration)
   *
   * All schedules start at -4000 (4000 BC) and end at or near 2050 AD.
   */
  _gameYear(turnNo) {
    const n  = turnNo - 1; // turns elapsed (0-based)
    const sy = -4000;
    switch (this.difficulty ?? 1) {
      case 0: case 1: // Chieftain / Warlord
        return sy + Math.min(250,n)*20 + Math.min(50,Math.max(0,n-250))*10
             + Math.min(50,Math.max(0,n-300))*5 + Math.min(50,Math.max(0,n-350))*2
             + Math.max(0,n-400);
      case 2: // Prince
        return sy + Math.min(60,n)*50 + Math.min(40,Math.max(0,n-60))*25
             + Math.min(150,Math.max(0,n-100))*10 + Math.min(50,Math.max(0,n-250))*5
             + Math.min(50,Math.max(0,n-300))*2 + Math.max(0,n-350);
      case 3: // King
        return sy + Math.min(60,n)*50 + Math.min(40,Math.max(0,n-60))*25
             + Math.min(50,Math.max(0,n-100))*20 + Math.min(50,Math.max(0,n-150))*10
             + Math.min(50,Math.max(0,n-200))*5 + Math.min(50,Math.max(0,n-250))*2
             + Math.max(0,n-300);
      default: // Emperor / Deity
        return sy + Math.min(60,n)*50 + Math.min(40,Math.max(0,n-60))*25
             + Math.min(75,Math.max(0,n-100))*20 + Math.min(25,Math.max(0,n-175))*10
             + Math.min(50,Math.max(0,n-200))*2 + Math.max(0,n-250);
    }
  }

  get year() { return this._gameYear(this.turn); }

  // ─── Visibility ────────────────────────────────────────────────────────────
  // (Moved to MapLogic.js mixin)

  // ─── Map helpers ───────────────────────────────────────────────────────────
  // (Moved to MapLogic.js mixin)

  // ─── Unit factory ──────────────────────────────────────────────────────────

  _spawnUnit(typeId, civId, col, row) {
    const data = UNITS[typeId];
    // Moves stored in "road units": 1 move = COSMIC.roadMultiplier internal units.
    // A road step costs 1 internal unit; a non-road step costs moveCost × roadMultiplier.
    // HP is scaled ×10 to match Civ2 reference: each point of firepower does 1 damage
    // on a 0–(hitPoints×10) scale, requiring multiple rounds to kill.
    const unit = new Unit({ id: this._nextUnitId++, typeId, civId, col, row,
                            hp: data.hp * 10, maxMoves: data.move * COSMIC.roadMultiplier });
    if (data.domain === 1 && data.range > 0) unit.fuel = data.range;
    this.units.push(unit);
    return unit;
  }

  // ─── Turn management ───────────────────────────────────────────────────────

  _beginCivTurn(civIdx) {
    if (civIdx === 0) this._waitingUnits.length = 0;
    // Reset airlift flags for this civ's cities
    for (const c of this.cities) {
      if (c.civId === civIdx) c._airliftUsedThisTurn = false;
    }
    for (const u of this.units) {
      if (u.civId !== civIdx) continue;
      // Building units keep their status — their turn is consumed by the build task.
      if (u.buildTask) { u.movesLeft = 0; continue; }
      u.movesLeft = u.maxMoves;
      if (u.status === 'done') u.status = 'active';
    }

    // Lighthouse (42): +1 ocean movement tile for all sea units of owning civ
    const lighthouseCivId = this.cities.find(c => c.improvements.has(42))?.civId ?? -1;
    if (civIdx === lighthouseCivId) {
      for (const u of this.units) {
        if (u.civId === civIdx && UNITS[u.typeId]?.domain === 2) {
          u.movesLeft += COSMIC.roadMultiplier;
        }
      }
    }

    // Magellan's Expedition (51): +2 movement for all sea units of owning civ
    const magellanCivId = this.cities.find(c => c.improvements.has(51))?.civId ?? -1;
    if (civIdx === magellanCivId) {
      for (const u of this.units) {
        if (u.civId === civIdx && UNITS[u.typeId]?.domain === 2) {
          u.movesLeft += 2 * COSMIC.roadMultiplier;
        }
      }
    }

    // Wake sentry units if an enemy enters their visual range (2-tile Chebyshev)
    // Sleep units (status='sleep') are NOT woken automatically
    if (civIdx === 0) {
      for (const u of this.units) {
        if (u.civId !== 0 || u.status !== 'sentry') continue;
        const enemyNearby = this.units.some(e => {
          if (e.civId === 0 || !this.civs[e.civId]?.alive) return false;
          const dc = Math.abs(e.col - u.col);
          const dr = Math.abs(e.row - u.row);
          const chebyshev = Math.max(dc, dr);
          return chebyshev <= 2;
        });
        if (enemyNearby) {
          u.status = 'active';
          this._addLog(`${UNITS[u.typeId]?.name ?? 'Unit'} woken by approaching enemy!`);
          this._emit('sentryWoke', { unit: u });
        }
      }
    }

    // Execute one step of goto orders for human player units
    if (civIdx === 0) {
      for (const u of [...this.units]) {
        if (u.civId !== 0 || !u.gotoTarget || u.buildTask) continue;
        this._executeGotoStep(u);
      }
    }

    // Prompt human player to choose research if none selected
    if (civIdx === 0 && this.civs[0]?.currentResearch == null && this.cities.some(c => c.civId === 0)) {
      this._emit('needResearch', {});
    }

    // Prompt human player to choose production for cities with no build target
    if (civIdx === 0) {
      for (const city of this.cities) {
        if (city.civId === 0 && !city.production) {
          this._emit('needProduction', { city });
          break; // one prompt at a time
        }
      }
    }
  }

  _selectNextUnit() {
    const civIdx = this.activeCivIdx;
    const canSelect = u => u.civId === civIdx && u.status === 'active' && u.movesLeft > 0 && !u.buildTask;

    // 1. Prefer units on the same tile as the previously active unit
    const prev = this.activeUnit;
    if (prev) {
      const sameTile = this.units.find(u => u !== prev && canSelect(u) && u.col === prev.col && u.row === prev.row);
      if (sameTile) { this.activeUnit = sameTile; return; }

      // 2. Then check adjacent tiles
      const nbrs = neighbours(prev.col, prev.row, this.mapCols);
      for (const n of nbrs) {
        const adj = this.units.find(u => canSelect(u) && u.col === n.col && u.row === n.row);
        if (adj) { this.activeUnit = adj; return; }
      }
    }

    // 3. Fall back to any unit with moves remaining (exclude waiting)
    const waitSet = new Set(this._waitingUnits);
    this.activeUnit = this.units.find(u => canSelect(u) && !waitSet.has(u)) ?? null;

    // 4. If no regular units left, reactivate waiting units
    if (!this.activeUnit && this._waitingUnits.length > 0) {
      const reactivated = this._waitingUnits.filter(u => this.units.includes(u) && canSelect(u));
      this._waitingUnits.length = 0;
      if (reactivated.length > 0) {
        this.activeUnit = reactivated[0];
      }
    }
  }

  /** Barbarian AI: no city production, no diplomacy — just move units to attack. */
  _doBarbarianTurn(civIdx) {
    // Barbarian-owned cities: assign production (simple military units)
    for (const city of this.cities) {
      if (city.civId !== civIdx) continue;
      if (!city.production) {
        // Pick cheapest military unit the barbarians can build
        const candidates = UNITS.filter(u => u && u.domain === 0 && (u.attack ?? 0) > 0 && (u.cost ?? 99) <= 4);
        const pick = candidates.length > 0
          ? candidates.reduce((a, b) => a.cost < b.cost ? a : b)
          : (UNITS.find(u => u?.name === 'Warriors') ?? UNITS[2]); // Warriors fallback
        city.production = { type: 'unit', id: pick.id, name: pick.name };
      }
    }

    const units = this.units.filter(u => u.civId === civIdx);
    for (const unit of units) {
      if (!this.units.includes(unit)) continue; // killed earlier this turn
      // Barbarians prioritize attacking nearby cities over other targets
      const cityTarget = this._aiNearestEnemyCity(unit);
      const unitTarget = this._aiNearestEnemyTarget(unit);
      // Prefer a city within 8 tiles, otherwise fall back to nearest enemy
      const target = (cityTarget && this._tileDist(unit, cityTarget) <= 8) ? cityTarget : unitTarget;
      if (target) this._aiMoveToward(unit, target.col, target.row);
      else        this._aiWander(unit);
      if (this.units.includes(unit)) unit.status = 'done';
    }
  }

  /** Manhattan distance between two objects with col/row. */
  _tileDist(a, b) {
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
  }

  /** Find the nearest enemy city the unit can target. */
  _aiNearestEnemyCity(unit) {
    let best = null, bestDist = 9999;
    for (const city of this.cities) {
      if (city.civId === unit.civId) continue;
      if (!this.isAtWar(unit.civId, city.civId)) continue;
      const dist = Math.abs(city.col - unit.col) + Math.abs(city.row - unit.row);
      if (dist < bestDist) { bestDist = dist; best = city; }
    }
    return best;
  }

  _doAiTurn(civIdx) {
    // Barbarians: simplified AI — just move units, no cities/diplomacy
    if (civIdx === this.barbarianCivIdx) {
      this._doBarbarianTurn(civIdx);
      return;
    }

    // Assign production for any AI city that has none
    for (const city of this.cities) {
      if (city.civId === civIdx && !city.production) this._aiPickProduction(city);
    }

    // Proactive war declaration: chance scaled by civ.attack personality (-1..+1)
    // Original Civ2: AI doesn't declare unprovoked war before turn 20
    const attackPersonality = this.civs[civIdx]?.data?.attack ?? 0;
    const warChance = 0.04 + attackPersonality * 0.03;  // -1→1%, 0→4%, +1→7%
    if (this.turn >= 20 && this.rng() < warChance) {
      const myUnits = this.units.filter(u => u.civId === civIdx).length;
      for (const other of this.civs) {
        if (other.id === civIdx) continue;
        if (this.isAtWar(civIdx, other.id)) continue;
        const theirUnits = this.units.filter(u => u.civId === other.id).length;
        if (myUnits > theirUnits) {
          this._declareWarInternal(civIdx, other.id);
          break;
        }
      }
    }

    // Compute army target for coordinated movement — all military units converge on it
    this._aiArmyTarget = this._aiPickArmyTarget(civIdx);

    // Load troops before they spend their movement, then let loaded transports
    // sail or unload. Cargo and occupied transports are skipped by the generic
    // unit driver below; otherwise cargo walks independently and ships try to
    // path directly onto an impassable land city.
    this._aiNavalTransport(this.civs[civIdx]);
    this._aiNavalUnload(this.civs[civIdx]);

    // Move units (snapshot array — units may be removed during combat)
    const units = this.units.filter(u => u.civId === civIdx);
    for (const unit of units) {
      if (!this.units.includes(unit)) continue; // killed earlier this turn
      if (unit.inShip) continue;
      const unitData = UNITS[unit.typeId];
      if (unitData?.domain === 2 && (unitData.holds ?? 0) > 0 && unit.cargo.length > 0) continue;
      this._aiMoveUnit(unit);
      if (this.units.includes(unit)) unit.status = 'done';
    }
    this._aiArmyTarget = null;

    // Consider proposing peace to enemies after prolonged war
    this._considerPeace(civIdx);

    // AI diplomacy: tech trading + alliance formation
    if (this.rng() < 0.3) this._aiTechTrade(civIdx);
    if (this.rng() < 0.2) this._aiConsiderAlliance(civIdx);
  }

  /**
   * AI diplomacy: consider proposing ceasefire or peace to civs this AI is at war/ceasefire with.
   * Called once per AI turn after unit moves.
   */
  _considerPeace(civIdx) {
    if (civIdx === this.barbarianCivIdx) return; // barbarians never propose peace
    const civ = this.civs[civIdx];
    if (!civ?.alive) return;

    const myUnits = this.units.filter(u => u.civId === civIdx).length;
    // Peaceful personality: attack < 0 → more likely to seek peace
    const peaceBonus = -(civ.data?.attack ?? 0) * 0.02;

    for (const other of this.civs) {
      if (!other.alive || other.id === civIdx) continue;
      const rel = civ.relations.get(other.id) ?? 'peace';
      if (rel !== 'war' && rel !== 'ceasefire') continue;

      const wk = `${Math.min(civIdx, other.id)}_${Math.max(civIdx, other.id)}`;
      const warAge = this.turn - (this._warSinceTurn.get(wk) ?? this.turn);

      const theirUnits = this.units.filter(u => u.civId === other.id).length;

      if (rel === 'war') {
        if (warAge <= 10) continue;
        if (myUnits >= theirUnits) continue; // only propose when outgunned
        const chance = 0.03 + peaceBonus;
        if (this.rng() >= chance) continue;

        if (other.id === 0) {
          // Propose ceasefire to human — show dialog
          this._emit('aiPeaceProposal', { fromCivId: civIdx, proposalType: 'ceasefire' });
          return;
        } else {
          // AI vs AI: auto-apply ceasefire
          civ.relations.set(other.id, 'ceasefire');
          other.relations.set(civIdx, 'ceasefire');
          const nameA = civ.data?.adjective ?? CIVS[civIdx]?.adjective ?? `Civ ${civIdx}`;
          const nameB = other.data?.adjective ?? CIVS[other.id]?.adjective ?? `Civ ${other.id}`;
          this._addLog(`${nameA} and ${nameB} agree to a ceasefire.`);
        }
      } else if (rel === 'ceasefire') {
        if (warAge <= 20) continue;
        const chance = 0.02 + peaceBonus;
        if (this.rng() >= chance) continue;

        if (other.id === 0) {
          this._emit('aiPeaceProposal', { fromCivId: civIdx, proposalType: 'peace' });
          return;
        } else {
          // AI vs AI: auto-apply peace
          civ.relations.set(other.id, 'peace');
          other.relations.set(civIdx, 'peace');
          this._warSinceTurn.delete(wk);
          const nameA = civ.data?.adjective ?? CIVS[civIdx]?.adjective ?? `Civ ${civIdx}`;
          const nameB = other.data?.adjective ?? CIVS[other.id]?.adjective ?? `Civ ${other.id}`;
          this._addLog(`${nameA} and ${nameB} sign a peace treaty.`);
        }
      }
    }
  }

  /**
   * AI tech trading: once per turn, try to exchange an advance with a friendly AI civ.
   * Only AI-to-AI; doesn't involve the human player.
   */
  _aiTechTrade(civIdx) {
    if (civIdx === this.barbarianCivIdx) return;
    const civ = this.civs[civIdx];
    if (!civ?.alive) return;

    for (const other of this.civs) {
      if (!other.alive || other.id === civIdx || other.id === 0) continue; // skip human
      const rel = civ.relations.get(other.id) ?? 'peace';
      if (rel === 'war') continue; // no trades in wartime

      // Find an advance we have that they don't
      let weGive = null;
      for (const advId of civ.advances) {
        if (!other.advances.has(advId)) { weGive = advId; break; }
      }
      // Find an advance they have that we don't
      let theyGive = null;
      for (const advId of other.advances) {
        if (!civ.advances.has(advId)) { theyGive = advId; break; }
      }

      if (weGive !== null && theyGive !== null) {
        // Trade!
        civ.advances.add(theyGive);
        other.advances.add(weGive);
        const nameA = civ.data?.adjective ?? `Civ ${civIdx}`;
        const nameB = other.data?.adjective ?? `Civ ${other.id}`;
        this._addLog(`The ${nameA} and ${nameB} exchange knowledge.`);
        return; // one trade per turn
      }
    }
  }

  /**
   * AI alliance formation: form alliance against a common enemy if both at war.
   * Upgrade peace → alliance if both civs are at war with the same third civ.
   */
  _aiConsiderAlliance(civIdx) {
    if (civIdx === this.barbarianCivIdx) return;
    const civ = this.civs[civIdx];
    if (!civ?.alive) return;

    const myEnemies = new Set();
    for (const other of this.civs) {
      if (other.alive && this.isAtWar(civIdx, other.id)) myEnemies.add(other.id);
    }
    if (myEnemies.size === 0) return;

    for (const other of this.civs) {
      if (!other.alive || other.id === civIdx || other.id === 0) continue;
      const rel = civ.relations.get(other.id) ?? 'peace';
      if (rel !== 'peace') continue; // only upgrade from peace

      // Check for common enemy
      for (const enemyId of myEnemies) {
        if (this.isAtWar(other.id, enemyId)) {
          // Form alliance
          civ.relations.set(other.id, 'alliance');
          other.relations.set(civIdx, 'alliance');
          const nameA = civ.data?.adjective ?? `Civ ${civIdx}`;
          const nameB = other.data?.adjective ?? `Civ ${other.id}`;
          this._addLog(`The ${nameA} and ${nameB} form an alliance.`);
          return;
        }
      }
    }
  }

  // ─── AI helpers ─────────────────────────────────────────────────────────────

  /** Pick a sensible next production for an AI city, weighted by civ personality. */
  _aiPickProduction(city) {
    const available = this.availableProduction(city);
    if (!available.length) return;

    const civ      = this.civs[city.civId];
    const civData  = civ?.data ?? {};
    const civBias  = civData.civilize ?? 0;   // +1=improvements, -1=military
    const expBias  = civData.expand   ?? 0;   // +1=expand, -1=build up

    const milCount  = this.units.filter(u => u.civId === city.civId && (UNITS[u.typeId]?.attack ?? 0) > 0).length;
    const cityCount = this.cities.filter(c => c.civId === city.civId).length;
    const milThreshold = 2 - civBias * 0.5;
    const wantMil = milCount < cityCount * milThreshold;

    // Check if any enemy units are within 5 tiles (threat detection)
    const threatened = this.units.some(u =>
      u.civId !== city.civId && this.isAtWar(city.civId, u.civId) &&
      Math.abs(u.col - city.col) + Math.abs(u.row - city.row) <= 5
    );

    // Check if city has walls (improvement 2)
    const hasWalls = city.improvements.has(2);

    const settlers  = available.filter(i => i.type === 'unit' && UNITS[i.id]?.role === 5);
    const milUnits  = available.filter(i => i.type === 'unit' && (UNITS[i.id]?.attack ?? 0) > 0);
    const imprs     = available.filter(i => i.type === 'improvement');
    const anyUnit   = available.filter(i => i.type === 'unit');
    const wonders   = imprs.filter(i => IMPROVEMENTS[i.id]?.isWonder);

    // Check if another civ is already building a wonder (wonder race awareness)
    const wondersInProgress = new Set();
    for (const c of this.cities) {
      if (c.civId !== city.civId && c.production?.type === 'improvement' &&
          IMPROVEMENTS[c.production.id]?.isWonder) {
        wondersInProgress.add(c.production.id);
      }
    }

    // Check if at war with anyone
    const atWar = this.civs.some(c => c && c.alive && c.id !== city.civId &&
      this.isAtWar(city.civId, c.id));

    // Score each option
    let bestPick = available[0], bestScore = -Infinity;
    for (const item of available) {
      let score = 0;
      if (item.type === 'unit') {
        const ud = UNITS[item.id];
        if (ud.role === 5) {
          // Settler: good if under city cap and expansionist
          score = cityCount < 5 ? 20 + expBias * 15 : -10;
        } else if ((ud.attack ?? 0) > 0) {
          // Military: higher score if under threshold or threatened
          score = wantMil ? 15 : 5;
          if (threatened) score += 20;
          if (atWar) score += 10;  // wartime military boost
          score += (ud.attack + ud.defense) * 2;  // prefer stronger units
          score -= civBias * 8;  // civilized civs prefer improvements
        } else if (ud.domain === 2 && cityCount > 3) {
          score = 8;  // naval units for larger empires
        } else {
          score = 3; // non-combat, non-settler units
        }
      } else {
        // Improvement
        const imp = IMPROVEMENTS[item.id];
        if (imp?.isWonder) {
          // Wonder race: penalize if another civ is already building it
          if (wondersInProgress.has(item.id)) {
            score = 5;
          } else {
            score = 25 + civBias * 10;
          }
        } else if (item.id === 2 && !hasWalls && threatened) {
          score = 30;  // City Walls when threatened
        } else if (item.id === 3) {
          score = city.size >= 3 ? 15 : 8;  // Granary — more valuable at size 3+
        } else if (item.id === 6 || item.id === 7) {
          score = 10;  // Temple/Colosseum — happiness
        } else if (item.id === 10 || item.id === 11 || item.id === 12) {
          score = 14;  // Marketplace/Bank/Stock Exchange — gold
        } else if (item.id === 13 || item.id === 14) {
          score = 14;  // Library/University — science
        } else if (item.id === 15) {
          score = city.size >= 7 ? 25 : 5;  // Aqueduct — critical near size 8
        } else if (item.id === 16) {
          score = city.size >= 11 ? 25 : 3; // Sewer System — critical near size 12
        } else if (item.id === 4 || item.id === 5) {
          score = 8;   // Barracks/Harbor
        } else if (item.id === 17) {
          score = atWar ? 18 : 6;  // SDI Defense — high priority in wartime
        } else {
          score = 8 + civBias * 5;
        }
      }
      if (score > bestScore) { bestScore = score; bestPick = item; }
    }

    city.production = { type: bestPick.type, id: bestPick.id };
  }

  /** Drive a single AI unit for one turn. */
  _aiMoveUnit(unit) {
    const unitData = UNITS[unit.typeId];

    // Settler / Engineers: found city at best nearby site or improve terrain
    if (unitData.role === 5) {
      // Evaluate current tile vs. best nearby tile before founding
      const curScore = this._aiCitySiteScore(unit.col, unit.row);
      const target = this._aiPickFoundingSpot(unit);
      if (target && this._aiCitySiteScore(target.col, target.row) > curScore + 5) {
        // Better site exists — move toward it
        this._aiMoveToward(unit, target.col, target.row);
        // After moving, try to found at new location
        if (this.units.includes(unit)) this.foundCity(unit);
      } else {
        // Current tile is good enough (or no better site) — found here
        if (!this.foundCity(unit)) {
          if (target) this._aiMoveToward(unit, target.col, target.row);
          else        this._aiWander(unit);
        }
      }
      return;
    }
    // Engineers (role 5, id 1): improve terrain if standing on an improvable tile
    if (unitData.role === 5 || unitData.id === 1) {
      const tile = this.tiles[unit.row][unit.col];
      const imp  = this._tileImprovements[unit.row][unit.col];
      if (!imp.irrigation && tile.aiIrrigate) {
        this.startBuild(unit, 'irrigation'); return;
      }
      if (!imp.mine && tile.aiMine) {
        this.startBuild(unit, 'mine'); return;
      }
      if (!imp.road) {
        this.startBuild(unit, 'road'); return;
      }
    }

    // Military units
    if ((unitData.attack ?? 0) > 0) {
      // If city needs garrison (no friendly military on tile), stay
      const onCity = this.cityAt(unit.col, unit.row);
      if (onCity && onCity.civId === unit.civId) {
        const garrison = this.units.filter(u =>
          u !== unit && u.civId === unit.civId && u.col === unit.col && u.row === unit.row &&
          (UNITS[u.typeId]?.attack ?? 0) > 0
        );
        if (garrison.length === 0) {
          unit.status = 'fortified';
          return;
        }
      }

      // Retreat logic: if HP is low (<30%), retreat to nearest friendly city
      if (unit.hp < unit.maxHp * 0.3) {
        const nearCity = this._aiNearestFriendlyCity(unit);
        if (nearCity) {
          this._aiMoveToward(unit, nearCity.col, nearCity.row);
          return;
        }
      }

      const target = this._aiNearestEnemyTarget(unit);
      if (target) {
        // Avoid suicidal attacks: don't attack if target is much stronger
        const targetData = target.typeId !== undefined ? UNITS[target.typeId] : null;
        if (targetData) {
          const myStrength = unitData.attack * unitData.fp * (unit.hp / unit.maxHp);
          const theirStrength = targetData.defense * targetData.fp * ((target.hp ?? 10) / (target.maxHp ?? 10));
          if (myStrength < theirStrength * 0.3) {
            // Too weak — retreat to nearest city if possible, else fortify
            const nearCity = this._aiNearestFriendlyCity(unit);
            if (nearCity && !(nearCity.col === unit.col && nearCity.row === unit.row)) {
              this._aiMoveToward(unit, nearCity.col, nearCity.row);
            } else {
              unit.status = 'fortified';
            }
            return;
          }
        }
        this._aiMoveToward(unit, target.col, target.row);
        return;
      }

      // No nearby enemy — coordinate with army target if available
      if (this._aiArmyTarget) {
        this._aiMoveToward(unit, this._aiArmyTarget.col, this._aiArmyTarget.row);
        return;
      }

      // No army target — defensive positioning: move toward undefended friendly cities
      const undefCity = this._aiUndefendedCity(unit);
      if (undefCity) {
        this._aiMoveToward(unit, undefCity.col, undefCity.row);
        return;
      }
    }

    this._aiWander(unit);
  }

  /** Find the closest enemy unit or city (war targets only). */
  _aiNearestEnemyTarget(unit) {
    let best = null, bestDist = 9999;
    const d = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

    for (const other of this.units) {
      if (other.civId === unit.civId) continue;
      if (!this.isAtWar(unit.civId, other.civId)) continue;
      const dist = d(unit, other);
      if (dist < bestDist) { bestDist = dist; best = other; }
    }
    for (const city of this.cities) {
      if (city.civId === unit.civId) continue;
      if (!this.isAtWar(unit.civId, city.civId)) continue;
      const dist = d(unit, city) + 2;
      if (dist < bestDist) { bestDist = dist; best = city; }
    }
    return best;
  }

  /** Pick a primary army target for coordinated movement — the nearest enemy city. */
  _aiPickArmyTarget(civIdx) {
    let best = null, bestDist = 9999;
    // Find the centroid of our military units
    const milUnits = this.units.filter(u => u.civId === civIdx && (UNITS[u.typeId]?.attack ?? 0) > 0);
    if (milUnits.length === 0) return null;
    const cx = milUnits.reduce((s, u) => s + u.col, 0) / milUnits.length;
    const cy = milUnits.reduce((s, u) => s + u.row, 0) / milUnits.length;
    for (const city of this.cities) {
      if (city.civId === civIdx) continue;
      if (!this.isAtWar(civIdx, city.civId)) continue;
      const dist = Math.abs(city.col - cx) + Math.abs(city.row - cy);
      if (dist < bestDist) { bestDist = dist; best = city; }
    }
    return best;
  }

  /** Find the nearest friendly city for retreat. */
  _aiNearestFriendlyCity(unit) {
    let best = null, bestDist = 9999;
    for (const city of this.cities) {
      if (city.civId !== unit.civId) continue;
      const dist = Math.abs(city.col - unit.col) + Math.abs(city.row - unit.row);
      if (dist < bestDist) { bestDist = dist; best = city; }
    }
    return best;
  }

  /** Find a friendly city with no military garrison. */
  _aiUndefendedCity(unit) {
    let best = null, bestDist = 9999;
    for (const city of this.cities) {
      if (city.civId !== unit.civId) continue;
      const hasGarrison = this.units.some(u =>
        u.civId === unit.civId && u.col === city.col && u.row === city.row &&
        (UNITS[u.typeId]?.attack ?? 0) > 0
      );
      if (hasGarrison) continue;
      const dist = Math.abs(city.col - unit.col) + Math.abs(city.row - unit.row);
      if (dist < bestDist) { bestDist = dist; best = city; }
    }
    return best;
  }

  /** AI: attempt to load idle land units onto nearby transports for cross-ocean movement. */
  _aiNavalTransport(civ) {
    if (!civ?.alive) return;
    const transports = this.units.filter(u =>
      u.civId === civ.id && UNITS[u.typeId].domain === 2 &&
      (UNITS[u.typeId].holds ?? 0) > 0 && u.cargo.length < UNITS[u.typeId].holds
    );
    if (transports.length === 0) return;

    for (const ship of transports) {
      if (ship.cargo.length >= UNITS[ship.typeId].holds) continue;
      const adjacent = neighbours(ship.col, ship.row, this.mapCols);
      for (const adj of adjacent) {
        if (adj.row < 0 || adj.row >= this.mapRows) continue;
        if (ship.cargo.length >= UNITS[ship.typeId].holds) break;
        // Prefer attackers and never strip the only military garrison from a
        // city. Multiple units may board from the same adjacent tile.
        const candidates = this.units.filter(u =>
          u.civId === civ.id && u.col === adj.col && u.row === adj.row &&
          UNITS[u.typeId].domain === 0 && !u.inShip && u.movesLeft > 0
        ).filter(u => {
          const city = this.cityAt(u.col, u.row);
          if (!city || city.civId !== civ.id || (UNITS[u.typeId].attack ?? 0) <= 0) return true;
          return this.units.some(other =>
            other !== u && other.civId === civ.id && other.col === city.col && other.row === city.row &&
            (UNITS[other.typeId].attack ?? 0) > 0 && !other.inShip
          );
        }).sort((a, b) => (UNITS[b.typeId].attack ?? 0) - (UNITS[a.typeId].attack ?? 0));

        for (const landUnit of candidates) {
          if (ship.cargo.length >= UNITS[ship.typeId].holds) break;
          landUnit.col = ship.col;
          landUnit.row = ship.row;
          landUnit.inShip = ship;
          landUnit.status = 'sleep';
          ship.cargo.push(landUnit);
          landUnit.movesLeft = 0;
        }
      }
    }
  }

  /** Find a reachable ocean tile adjacent to a coastal enemy city. */
  _aiNavalApproach(ship) {
    let best = null;
    let bestDist = Infinity;
    for (const city of this.cities) {
      if (city.civId === ship.civId || !this.isAtWar(ship.civId, city.civId)) continue;
      for (const n of neighbours(city.col, city.row, this.mapCols)) {
        if (n.row < 0 || n.row >= this.mapRows || this.tiles[n.row][n.col] !== TERRAIN.OCEAN) continue;
        const atTarget = ship.col === n.col && ship.row === n.row;
        if (!atTarget && !this._aiNextStep(ship, n.col, n.row)) continue;
        const rawDc = Math.abs(n.col - ship.col);
        const dist = Math.min(rawDc, this.mapCols - rawDc) + Math.abs(n.row - ship.row);
        if (dist < bestDist) {
          bestDist = dist;
          best = { city, col: n.col, row: n.row };
        }
      }
    }
    return best;
  }

  /** AI: sail loaded transports to an enemy coast, then disembark. */
  _aiNavalUnload(civ) {
    if (!civ?.alive) return;
    const transports = this.units.filter(u =>
      u.civId === civ.id && UNITS[u.typeId].domain === 2 &&
      u.cargo && u.cargo.length > 0
    );
    for (const ship of transports) {
      const approach = this._aiNavalApproach(ship);
      if (!approach) continue;
      if (ship.col !== approach.col || ship.row !== approach.row) {
        if (ship.movesLeft > 0) this._aiMoveToward(ship, approach.col, approach.row);
        if (ship.col !== approach.col || ship.row !== approach.row) continue;
      }

      // Use normal movement/combat so an amphibious landing fights defenders
      // and an empty enemy city is captured through the regular city path.
      for (const cargo of [...ship.cargo]) {
        if (cargo.movesLeft <= 0) continue;
        cargo.status = 'active';
        this.moveUnit(cargo, approach.city.col, approach.city.row);
        if (approach.city.civId === civ.id) break;
      }
    }
  }

  /** AI: find nearest enemy city on the coast (adjacent to ocean). */
  _aiNearestEnemyCoast(unit) {
    let best = null, bestDist = 9999;
    for (const city of this.cities) {
      if (city.civId === unit.civId) continue;
      if (!this.isAtWar(unit.civId, city.civId)) continue;
      // Check if city is coastal (any adjacent tile is ocean)
      const adj = neighbours(city.col, city.row, this.mapCols);
      const coastal = adj.some(n =>
        n.row >= 0 && n.row < this.mapRows && this.tiles[n.row][n.col] === TERRAIN.OCEAN
      );
      if (!coastal) continue;
      const dist = Math.abs(city.col - unit.col) + Math.abs(city.row - unit.row);
      if (dist < bestDist) { bestDist = dist; best = city; }
    }
    return best;
  }

  /** Score a tile for city placement (higher = better). */
  _aiCitySiteScore(col, row) {
    let score = 0;
    // Check BFC tiles (city radius)
    for (const n of cityRadius(col, row)) {
      if (n.row < 0 || n.row >= this.mapRows) continue;
      const t = this.tiles[n.row]?.[n.col];
      if (!t || t === TERRAIN.OCEAN) continue;
      score += (t.food ?? 0) + (t.shields ?? 0) + (t.trade ?? 0);
    }
    // Penalty for being too close to existing cities
    for (const c of this.cities) {
      const dist = Math.abs(c.col - col) + Math.abs(c.row - row);
      if (dist < 4) score -= 50;
      else if (dist < 6) score -= 10;
    }
    return score;
  }

  /** Find the best founding spot: evaluate nearby tiles and some random tiles. */
  _aiPickFoundingSpot(unit) {
    let best = null, bestScore = -Infinity;

    // Evaluate tiles near the settler (within 10 tiles)
    const candidates = [];
    for (let dr = -10; dr <= 10; dr++) {
      for (let dc = -10; dc <= 10; dc++) {
        const r = unit.row + dr;
        const c = this._wrapCol(unit.col + dc);
        if (r < 0 || r >= this.mapRows) continue;
        if (this.tiles[r][c] === TERRAIN.OCEAN) continue;
        candidates.push({ col: c, row: r });
      }
    }
    // Also add some random tiles for variety
    for (let attempt = 0; attempt < 15; attempt++) {
      const r = Math.floor(this.rng() * this.mapRows);
      const c = Math.floor(this.rng() * this.mapCols);
      if (this.tiles[r][c] !== TERRAIN.OCEAN) {
        candidates.push({ col: c, row: r });
      }
    }

    for (const cand of candidates) {
      const score = this._aiCitySiteScore(cand.col, cand.row);
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    return best;
  }

  /**
   * Step the unit repeatedly toward (toCol, toRow) until it runs out of moves,
   * reaches the target, or gets blocked (e.g. by combat).
   */
  _aiMoveToward(unit, toCol, toRow) {
    while (unit.movesLeft > 0) {
      const step = this._aiNextStep(unit, toCol, toRow);
      if (!step) break;
      if (!this.moveUnit(unit, step.col, step.row)) break;
      if (unit.col === toCol && unit.row === toRow) break;
      if (!this.units.includes(unit)) break; // unit was killed in combat
    }
  }

  /**
   * BFS to find the first adjacent step on the shortest path from the unit
   * to (toCol, toRow), respecting terrain domain.
   * Returns {col, row} of the adjacent step, or null if unreachable.
   */
  _aiNextStep(unit, toCol, toRow) {
    const unitData = UNITS[unit.typeId];
    const passable = (r, c) => {
      if (r < 0 || r >= this.mapRows) return false; // col is already wrapped
      const tile = this.tiles[r][c];
      if (unitData.domain === 0 && tile === TERRAIN.OCEAN) return false;
      if (unitData.domain === 2 && tile !== TERRAIN.OCEAN) return false;
      return true;
    };

    const visited = new Set([`${unit.col},${unit.row}`]);
    const queue   = [{ col: unit.col, row: unit.row, first: null }];

     while (queue.length > 0) {
       const { col, row, first } = queue.shift();
       if (visited.size > PATHFIND_MAX_TILES) break;

      for (const n of neighbours(col, row, this.mapCols)) {
        const key = `${n.col},${n.row}`;
        if (visited.has(key) || !passable(n.row, n.col)) continue;
        visited.add(key);
        const step = first ?? n;
        if (n.col === toCol && n.row === toRow) return step;
        queue.push({ col: n.col, row: n.row, first: step });
      }
    }
    return null;
  }

  /** Move the unit to a random valid adjacent tile (exploration / fallback). */
  _aiWander(unit) {
    const unitData = UNITS[unit.typeId];
    while (unit.movesLeft > 0) {
      const opts = neighbours(unit.col, unit.row, this.mapCols).filter(n => {
        if (n.row < 0 || n.row >= this.mapRows) return false; // col already wrapped
        const tile = this.tiles[n.row][n.col];
        if (unitData.domain === 0 && tile === TERRAIN.OCEAN) return false;
        if (unitData.domain === 2 && tile !== TERRAIN.OCEAN) return false;
        return true;
      });
      if (!opts.length) break;
      const n = opts[Math.floor(this.rng() * opts.length)];
      if (!this.moveUnit(unit, n.col, n.row)) break;
    }
  }

  // ─── Go To order ───────────────────────────────────────────────────────────

  _executeGotoStep(unit) {
    while (unit.movesLeft > 0) {
      if (unit.col === unit.gotoTarget.col && unit.row === unit.gotoTarget.row) {
        unit.gotoTarget = null;
        // Auto-fortify land combat units on arrival (original Civ2 behavior)
        // Don't fortify: settlers, engineers, diplomats, spies, caravans, freights, air/sea units
        const unitDef = UNITS[unit.typeId];
        const isNonCombat = unit.typeId === 0 || unit.typeId === 1 || unit.typeId === 46 || 
                            unit.typeId === 47 || unit.typeId === 48 || unit.typeId === 49;
        if (unitDef.domain === 0 && !isNonCombat) {
          unit.status = 'fortified';
        } else {
          unit.status = 'active';
        }
        return;
      }
      const step = this._aiNextStep(unit, unit.gotoTarget.col, unit.gotoTarget.row);
      if (!step) { unit.gotoTarget = null; unit.status = 'active'; return; }
      if (!this.moveUnit(unit, step.col, step.row)) { unit.gotoTarget = null; return; }
      if (!this.units.includes(unit)) return; // killed in combat
    }
    unit.status = 'done'; // out of moves — resumes next turn
  }

  startGoto(unit, col, row) {
    if (unit.civId !== 0) return;
    unit.gotoTarget = { col: this._wrapCol(col), row };
    unit.status = 'done';
    this._selectNextUnit();
  }

  cancelGoto(unit) {
    unit.gotoTarget = null;
    unit.status = 'active';
  }

  // ─── Terrain improvements ──────────────────────────────────────────────────

  /** Tick all in-progress build tasks; complete any that reach 0. */
  _processBuildTasks() {
    for (const unit of this.units) {
      if (!unit.buildTask) continue;
      unit.buildTask.turnsLeft--;
      if (unit.buildTask.turnsLeft <= 0) this._completeBuild(unit);
    }
  }

  _completeBuild(unit) {
    const { type, col, row } = unit.buildTask;
    const imp     = this._tileImprovements[row][col];
    const terrain = this.tiles[row][col];

    switch (type) {
      case 'road':
        imp.road = true;
        this._addLog(`Road built near ${col},${row}.`);
        break;
      case 'railroad':
        imp.railroad = true;
        this._addLog(`Railroad built near ${col},${row}.`);
        break;
      case 'irrigation':
        if (imp.irrigation && !imp.farmland) {
          // Upgrade irrigation → farmland
          imp.farmland = true;
          this._addLog(`Farmland complete.`);
        } else if (terrain.irrigate === 'yes') {
          imp.irrigation = true;
          this._addLog(`Irrigation complete.`);
        } else if (terrain.irrigate && terrain.irrigate !== 'no') {
          // Terrain conversion (e.g. Jungle → Grassland)
          this.tiles[row][col] = TERRAIN[terrain.irrigate];
          imp.irrigation = false;
          this._addLog(`Irrigation complete.`);
        } else {
          this._addLog(`Irrigation complete.`);
        }
        break;
      case 'mine':
        if (terrain.mine === 'yes') {
          imp.mine = true;
        } else if (terrain.mine && terrain.mine !== 'no') {
          // Terrain conversion (e.g. Plains → Forest)
          this.tiles[row][col] = TERRAIN[terrain.mine];
          imp.mine = false;
        }
        this._addLog(`Mine complete.`);
        break;
      case 'fortress':
        imp.fortress = true;
        this._addLog(`Fortress complete.`);
        break;
      case 'cleanPollution':
        imp.pollution = false;
        imp.fallout   = false;
        this._addLog(`Pollution/fallout cleaned.`);
        break;
      case 'transformTerrain': {
        const newTerrain = TERRAIN[terrain.transformTo];
        if (newTerrain) {
          this.tiles[row][col] = newTerrain;
          imp.irrigation = false;
          imp.mine = false;
          this._addLog(`Terrain transformed to ${newTerrain.label}.`);
        }
        break;
      }
      case 'buildAirbase':
        imp.airbase = true;
        this._addLog(`Airbase complete.`);
        break;
    }

    this._emit('buildComplete', { type, unit, col, row });
    unit.buildTask = null;
    unit.status    = 'active';
    unit.movesLeft = unit.maxMoves;
    if (unit.civId === 0) this._selectNextUnit();
  }

  /**
   * Start a terrain-improvement task for a settler/engineer unit.
   * @param {Unit}   unit
   * @param {string} type  'road' | 'railroad' | 'irrigation' | 'mine' | 'fortress' | 'cleanPollution' | 'transformTerrain' | 'buildAirbase'
   * @returns {boolean}
   */
  startBuild(unit, type) {
    if (!unit) return false;
    const terrain = this.tiles[unit.row]?.[unit.col];
    if (!terrain) return false;
    const imp = this._tileImprovements[unit.row][unit.col];

    let turns = 0;
    switch (type) {
      case 'road':
        if (terrain === TERRAIN.OCEAN)          { this._addLog('Cannot build roads on ocean.'); return false; }
        if (imp.road)                            { this._addLog('Road already exists here.'); return false; }
        turns = (terrain.moveCost ?? 1) * 2; // Civ2: road build time = terrain moveCost × 2
        break;
      case 'railroad':
        if (terrain === TERRAIN.OCEAN)          { this._addLog('Cannot build railroad on ocean.'); return false; }
        if (!imp.road)                           { this._addLog('Build a road here first.'); return false; }
        if (imp.railroad)                        { this._addLog('Railroad already here.'); return false; }
        turns = (terrain.moveCost ?? 1) * 2;
        break;
      case 'irrigation': {
        if (terrain.irrigate === 'no')           { this._addLog('Cannot irrigate this terrain.'); return false; }
        // Farmland upgrade: if already irrigated, check for Supermarket (improvement 24)
        if (imp.irrigation && !imp.farmland) {
          const hasSupermarket = this.cities.some(c => c.civId === unit.civId && c.improvements.has(24));
          if (!hasSupermarket) { this._addLog('Build a Supermarket to upgrade to farmland.'); return false; }
          turns = terrain.irrigTurns ?? 5;
          break;
        }
        if (imp.irrigation && imp.farmland)      { this._addLog('Already farmland.'); return false; }
        // Irrigation requires adjacency to a river, ocean, or already-irrigated tile (H4)
        const hasWaterAdj = neighbours(unit.col, unit.row, this.mapCols).some(n => {
          if (n.row < 0 || n.row >= this.mapRows) return false;
          const nc = this._wrapCol(n.col);
          if (this.tiles[n.row][nc] === TERRAIN.OCEAN) return true;
          if (this._rivers[n.row][nc] > 0) return true;
          if (this._tileImprovements[n.row][nc].irrigation) return true;
          return false;
        });
        if (!hasWaterAdj) { this._addLog('Irrigation requires water or irrigated land nearby.'); return false; }
        turns = terrain.irrigTurns ?? 5;
        break;
      }
      case 'mine':
        if (terrain.mine === 'no')               { this._addLog('Cannot mine this terrain.'); return false; }
        if (imp.mine)                            { this._addLog('Already mined.'); return false; }
        turns = terrain.mineTurns ?? 10;
        break;
      case 'fortress':
        if (terrain === TERRAIN.OCEAN)           { this._addLog('Cannot build fortress on ocean.'); return false; }
        if (imp.fortress)                        { this._addLog('Fortress already here.'); return false; }
        turns = 5;
        break;
      case 'cleanPollution':
        if (!imp.pollution && !imp.fallout)      { this._addLog('No pollution/fallout here.'); return false; }
        turns = 3;
        break;
      case 'transformTerrain': {
        const target = terrain.transformTo;
        if (!target || target === 'no')  { this._addLog('Cannot transform this terrain.'); return false; }
        if (terrain === TERRAIN.OCEAN)   { this._addLog('Cannot transform ocean.'); return false; }
        turns = 20;
        break;
      }
      case 'buildAirbase':
        if (terrain === TERRAIN.OCEAN)   { this._addLog('Cannot build airbase on ocean.'); return false; }
        if (imp.airbase)                 { this._addLog('Airbase already here.'); return false; }
        turns = 3;
        break;
      default:
        return false;
    }

    unit.buildTask = { type, col: unit.col, row: unit.row, turnsLeft: turns, turnsTotal: turns };
    unit.status    = 'building';
    unit.movesLeft = 0;
    this._addLog(`Building ${type} (${turns} turns)…`);
    this._selectNextUnit();
    return true;
  }

  /** Cancel a unit's current build task and return it to active status. */
  cancelBuild(unit) {
    if (!unit.buildTask) return;
    unit.buildTask = null;
    unit.status    = 'active';
    unit.movesLeft = unit.maxMoves;
    this._addLog('Build cancelled.');
  }

  // ─── Pollution ──────────────────────────────────────────────────────────────

  /**
   * Returns true if the city should generate a pollution tile this turn.
   * Factory(15) or Mfg.Plant(16) are required; Mass Transit(13) + Recycling Center(18) fully suppress it.
   */
  _generatePollution(city) {
    if (!city.improvements.has(15) && !city.improvements.has(16)) return false;
    const hasMassTransit   = city.improvements.has(13);
    const hasRecyclingCtr  = city.improvements.has(18);
    if (hasMassTransit && hasRecyclingCtr) return false;  // fully suppressed
    if (hasMassTransit || hasRecyclingCtr) return this.rng() >= 0.5; // 50% chance
    return true;
  }

  /** Place a pollution marker on a random non-ocean, non-polluted BFC tile near the city. */
  _addPollutionNear(city) {
    const candidates = [];
    for (const n of cityRadius(city.col, city.row)) {
      const r = n.row, c = this._wrapCol(n.col);
      if (r < 0 || r >= this.mapRows) continue;
      if (this.tiles[r][c] === TERRAIN.OCEAN) continue;
      if (this._tileImprovements[r][c].pollution) continue;
      candidates.push({ r, c });
    }
    if (!candidates.length) return;
    const pick = candidates[Math.floor(this.rng() * candidates.length)];
    this._tileImprovements[pick.r][pick.c].pollution = true;
  }

  /** Check total pollution count and potentially degrade terrain. */
  _doGlobalWarming() {
    let total = 0;
    for (let r = 0; r < this.mapRows; r++)
      for (let c = 0; c < this.mapCols; c++)
        if (this._tileImprovements[r][c].pollution) total++;

    const threshold = Math.max(8, Math.floor(this.mapCols * this.mapRows / 100));
    if (total < threshold) return;

    const chance = Math.min(0.60, (total - threshold) * 0.15);
    if (this.rng() > chance) return;

    const DEGRADE = {
      FOREST: 'PLAINS', JUNGLE: 'SWAMP', GRASSLAND: 'DESERT',
      PLAINS: 'DESERT',  SWAMP: 'DESERT', TUNDRA: 'DESERT',
    };
    let changed = 0;
    for (let attempts = 0; attempts < 40 && changed < 3; attempts++) {
      const r = Math.floor(this.rng() * this.mapRows);
      const c = Math.floor(this.rng() * this.mapCols);
      const t = this.tiles[r][c];
      const key = Object.keys(TERRAIN).find(k => TERRAIN[k] === t);
      if (key && DEGRADE[key]) {
        this.tiles[r][c] = TERRAIN[DEGRADE[key]];
        changed++;
      }
    }
    if (changed > 0) {
      this._addLog('Global Warming strikes! The climate is changing!');
      this._emit('globalWarming', {});
    }
  }

  // ─── Barbarian spawning ──────────────────────────────────────────────────

  /**
   * Spawn barbarian hordes periodically (axx0 barbarian.ai.lua).
   * Triggered every N turns depending on barbarian setting.
   * Tries 3 random tiles per trigger; valid tile must be:
   *   - Land, including ocean crossings when transports are available
   *   - ≥ 3 tile Chebyshev distance from all player units/cities
   *   - ≤ 50 tile Chebyshev distance from some player unit/city (target exists)
   * Spawns 1–2 units (infantry/cavalry) scaled to player's current tech era.
   */
  _spawnBarbarians() {
    if (this.barbarianCivIdx < 0) return;

    // Spawn interval by barbarian setting (axx0: every 16 turns for roaming)
    const interval = { sedentary: 32, restless: 16, raging: 8 }[this.barbarians] ?? 0;
    if (interval <= 0 || this.turn < interval || this.turn % interval !== 0) return;

    // Player targets (human + AI but not barbarians)
    const playerUnits  = this.units.filter(u => u.civId !== this.barbarianCivIdx);
    const playerCities = this.cities.filter(c => c.civId !== this.barbarianCivIdx);
    if (playerUnits.length + playerCities.length === 0) return;

     // Choose best infantry/cavalry unit barbarians can field (based on player's tech era)
     const playerCiv = this.civs[0];
     const epoch = playerCiv?.advances?.size >= BARB_TECH_TIER2 ? 2 : playerCiv?.advances?.size >= BARB_TECH_TIER1 ? 1 : 0;
    // Infantry pool by era: Warriors → Phalanx → Musketeers
    const infantryPool = [[2], [2, 3], [2, 7]][epoch] ?? [2];
    // Cavalry pool by era: Horsemen → Chariots → Cavalry
    const cavPool      = [[15], [15, 16], [15, 21]][epoch] ?? [15];
    const usesCav      = this.rng() < 0.5;
    const pool         = usesCav ? cavPool : infantryPool;

    // Number of hordes: raging = 2, others = 1
    const numHordes = this.barbarians === 'raging' ? 2 : 1;

    for (let h = 0; h < numHordes; h++) {
      // 3 attempts to find a valid spawn tile (axx0 tries = 3)
      let spawnTile = null;
      for (let attempt = 0; attempt < 3 && !spawnTile; attempt++) {
        const r = Math.floor(this.rng() * this.mapRows);
        const c = Math.floor(this.rng() * this.mapCols);

        if (this.tiles[r][c] === TERRAIN.OCEAN) continue;
        if (this.units.some(u => u.col === c && u.row === r)) continue;

        // Chebyshev distance helpers
        const cheb = (ac, ar, bc, br) => Math.max(Math.abs(ac - bc), Math.abs(ar - br));

         // Must be ≥ BARB_MIN_DIST from all player entities (not too close)
         const tooClose = [...playerUnits, ...playerCities].some(e =>
           cheb(c, r, e.col, e.row) < BARB_MIN_DIST
         );
         if (tooClose) continue;

         // Must be ≤ BARB_MAX_DIST from some player entity (target exists)
         const hasTarget = [...playerUnits, ...playerCities].some(e =>
           cheb(c, r, e.col, e.row) <= BARB_MAX_DIST
         );
        if (!hasTarget) continue;

        spawnTile = { col: c, row: r };
      }

      if (!spawnTile) continue;

      // Spawn 1–2 units per horde (axx0 spawns first unit + optional diplomat)
      const typeId = pool[Math.floor(this.rng() * pool.length)];
      this._spawnUnit(typeId, this.barbarianCivIdx, spawnTile.col, spawnTile.row);

      // Second unit for raging barbarians
      if (this.barbarians === 'raging') {
        const adj = this._findFreeLandTile(spawnTile.col, spawnTile.row);
        if (adj) {
          const type2 = pool[Math.floor(this.rng() * pool.length)];
          this._spawnUnit(type2, this.barbarianCivIdx, adj.col, adj.row);
        }
      }
    }

    // ── Barbarian ocean transport raids ──────────────────────────────────────
    // After turn 20, 20% chance per spawn to launch a pirate raid on a coastal city
    if (this.turn >= 20 && this.rng() < 0.2) {
      this._spawnBarbarianNavalRaid();
    }
  }

  /**
   * Spawn a barbarian naval raid: Trireme with 1-2 warriors near a coastal city.
   */
  _spawnBarbarianNavalRaid() {
    if (this.barbarianCivIdx < 0) return;

    // Find coastal player cities (has at least one adjacent ocean tile)
    const coastalCities = this.cities.filter(c => {
      if (c.civId === this.barbarianCivIdx) return false;
      return neighbours(c.col, c.row, this.mapCols).some(n =>
        n.row >= 0 && n.row < this.mapRows && this.tiles[n.row][n.col] === TERRAIN.OCEAN
      );
    });
    if (coastalCities.length === 0) return;

    const target = coastalCities[Math.floor(this.rng() * coastalCities.length)];

    // Find an ocean tile near the target city (within 3-8 tiles) for the Trireme
    let spawnOcean = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const dr = Math.floor(this.rng() * 12) - 6 + target.row;
      const dc = Math.floor(this.rng() * 12) - 6 + target.col;
      const r = Math.max(0, Math.min(this.mapRows - 1, dr));
      const c = this._wrapCol(dc);
      if (this.tiles[r][c] !== TERRAIN.OCEAN) continue;
      if (this.units.some(u => u.col === c && u.row === r)) continue;
      const dist = Math.abs(r - target.row) + Math.abs(c - target.col);
      if (dist < 3 || dist > 8) continue;
      spawnOcean = { col: c, row: r };
      break;
    }
    if (!spawnOcean) return;

    // Spawn Trireme (id=32, holds 2) with 1-2 warriors aboard
    const ship = this._spawnUnit(32, this.barbarianCivIdx, spawnOcean.col, spawnOcean.row);
    if (!ship) return;

    const numCargo = this.barbarians === 'raging' ? 2 : 1;
    for (let i = 0; i < numCargo; i++) {
      const warrior = this._spawnUnit(2, this.barbarianCivIdx, spawnOcean.col, spawnOcean.row);
      if (warrior) {
        warrior.inShip = ship;
        warrior.status = 'sleep';
        ship.cargo.push(warrior);
      }
    }
  }

  /**
   * Process one full game turn: city growth, food, shields, production.
   * Called when turn increments (all civs have passed).
   */
  _processTurn() {
    // Tick terrain-improvement build tasks first
    this._processBuildTasks();

    // ── Barbarian spawning ───────────────────────────────────────────────────
    this._spawnBarbarians();

    // ── Pollution generation ─────────────────────────────────────────────────
    for (const city of this.cities) {
      if (this._generatePollution(city)) this._addPollutionNear(city);
    }
    this._doGlobalWarming();

    // ── Territory snapshot for end-game replay ─────────────────────────────
    this._recordTerritorySnapshot();

    // Leonardo's Workshop auto-upgrade moved to _doResearch (triggers on tech discovery)

    // ── Unit healing per turn ────────────────────────────────────────────────
    for (const u of this.units) {
      if (u.hp >= u.maxHp) continue;
      const c = this.cityAt(u.col, u.row);
      if (c) {
        // In city with repair facility → full heal
        const domain = UNITS[u.typeId]?.domain ?? 0;
        const repairId = domain === 0 ? 0 : domain === 2 ? 34 : 32; // Barracks/Port Facility/Airport
        if (c.improvements.has(repairId)) {
          u.hp = u.maxHp;
        } else {
          // In city without facility → +10 HP
          u.hp = Math.min(u.hp + 10, u.maxHp);
        }
      } else if (this._tileImprovements[u.row]?.[u.col]?.fortress) {
        // On fortress tile → +10 HP
        u.hp = Math.min(u.hp + 10, u.maxHp);
      } else if (u.status === 'fortified') {
        // Fortified in the field → +10 HP
        u.hp = Math.min(u.hp + 10, u.maxHp);
      }
    }

    for (const city of this.cities) {
      city.improvementSold = false;

      // City governor auto-manages workers before calculating yields
      if (city.governor) this._governorAssignWorkers(city);

      const civ    = this.civs[city.civId];
      const yields = this.cityYields(city);

      // ── Food ────────────────────────────────────────────────────────────────
      const consumption = city.size * COSMIC.foodPerCitizen;
      const netFood     = yields.food - consumption;
      city.food += netFood;

      const foodNeeded = (city.size + 1) * COSMIC.foodBoxRows;

      if (city.food >= foodNeeded) {
        // Infrastructure limits: Aqueduct needed above size 8, Sewer above size 12
        if (city.size >= COSMIC.sewerLimit && !city.improvements.has(23)) {
          city.food = foodNeeded - 1;
          this._addLog(`${city.name} needs a Sewer System to grow!`);
        } else if (city.size >= COSMIC.aqueductLimit && !city.improvements.has(9)) {
          city.food = foodNeeded - 1;
          this._addLog(`${city.name} needs an Aqueduct to grow!`);
        } else {
          const hasGranary = city.improvements.has(3) || this._civHasWonder(city.civId, 39);
          city.food = hasGranary ? Math.floor(foodNeeded / 2) : 0;
          city.size++;
          this._autoAssignNewWorker(city);
          this._addLog(`${city.name} grows to size ${city.size}!`);
          this._emit('cityGrowth', { city });
        }
      } else if (city.food < 0) {
        if (city.size > 1) {
          city.size--;
          this._autoRemoveWorker(city);
          city.food = 0;
          this._addLog(`${city.name} shrinks due to famine!`);
        } else {
          city.food = 0;
        }
      }

      // ── Shields / production ────────────────────────────────────────────────
      this._trimProductionQueue(city);

      // Auto-switch if current production became invalid
      if (city.production) {
        const avail = this.availableProduction(city);
        const still = avail.some(p => p.type === city.production.type && p.id === city.production.id);
        if (!still) {
          const queued = this._dequeueNextProduction(city, avail);
          const same = avail.filter(p => p.type === city.production.type);
          const next = queued ?? (same.length ? same.reduce((a, b) => this._productionCost(a) < this._productionCost(b) ? a : b) : avail[0] || null);
          if (next) {
            city.production = { type: next.type, id: next.id };
            this._addLog(`${city.name}: switched to ${next.name || 'new item'}`);
          } else {
            city.production = null;
          }
        }
      }
      // ── Happiness / disorder ────────────────────────────────────────────────
      // Must be computed BEFORE production — disorder blocks all production (axx0 GameTurn.cs)
      const happiness   = this.cityHappiness(city);
      const wasDisorder = city.disorder;
      city.disorder     = happiness.disorder;
      if (!wasDisorder && city.disorder && city.civId === 0) {
        this._addLog(`${city.name} is in disorder!`);
        this._emit('cityDisorder', { city });
      }
      if (wasDisorder && !city.disorder && city.civId === 0) {
        this._addLog(`Order restored in ${city.name}.`);
        this._emit('orderRestored', { city });
      }

      // Disorder skips production entirely (matching axx0 `continue` on disorder)
      if (city.production && !city.disorder) {
        // Capitalization (38): convert all shields to gold — never completes
        if (city.production.type === 'improvement' && city.production.id === 38) {
          if (civ) civ.gold += yields.shields;
        } else {
          city.shields += yields.shields;
          const cost = this._productionCost(city.production);
          if (city.shields >= cost && this._completeProduction(city)) {
            city.shields = Math.max(0, city.shields - cost);
          }
        }
      }

      // ── "We Love the King Day" ─────────────────────────────────────────────
      const wasWLtKD = city.weLoveKing;
      city.weLoveKing = happiness.happy > 0 && happiness.unhappy === 0
                     && happiness.happy >= Math.ceil(city.size / 2);
      if (city.disorder) city.weLoveKing = false;

      if (city.weLoveKing && !wasWLtKD) {
        const govtTitle = GOVERNMENTS[civ?.government ?? 0]?.titleMale ?? 'King';
        this._addLog(`${city.name}: "We love the ${govtTitle}" day!`);
        this._emit('weLoveKing', { city });
      }

      // Republic(5)/Democracy(6): WLtKD grants free +1 population growth (respects Aqueduct/Sewer limits)
      if (city.weLoveKing && (civ?.government === 5 || civ?.government === 6)) {
        const canGrow = city.size < COSMIC.sewerLimit || city.improvements.has(23);
        const canGrow2 = city.size < COSMIC.aqueductLimit || city.improvements.has(9);
        if (canGrow && canGrow2) {
          city.size++;
          this._addLog(`${city.name} celebrates and grows to size ${city.size}!`);
        }
      }

      // ── Treasury: tax income and improvement upkeep ─────────────────────────
      // Disorder skips tax and upkeep (axx0 GameTurn.cs:77 `continue` on disorder)
      if (civ && !city.disorder) {
        civ.gold += Math.floor(yields.trade * (civ.taxRate / 100));
        // Tax collector specialists: 3 gold each
        civ.gold += (city.specialists?.taxCollector ?? 0) * 3;
        // Adam Smith's Trading Co. (56): skip upkeep for improvements with upkeep === 1
        const adamSmith = this._civHasWonder(city.civId, 56);
        const toSell = [];
        for (const impId of city.improvements) {
          const imp = IMPROVEMENTS[impId];
          if (imp?.upkeep > 0) {
            if (adamSmith && imp.upkeep === 1) continue;
            if (civ.gold >= imp.upkeep) {
              civ.gold -= imp.upkeep;
            } else {
              // Can't afford — schedule for auto-sell (axx0 GameTurn.cs line 143)
              toSell.push(impId);
            }
          }
        }
        for (const impId of toSell) {
          const imp = IMPROVEMENTS[impId];
          city.improvements.delete(impId);
          civ.gold += imp.cost;  // Refund improvement cost (axx0 GameTurn.cs line 144)
          this._addLog(`${city.name} loses ${imp.name} (can't maintain).`);
          this._emit('improvementSold', { city, impId, impName: imp.name });
        }
        this._enforceInfrastructureLimits(city);
      }
    }

    // ── Settler food consumption ─────────────────────────────────────────────
    // Settlers eat 1 food (govt ≤ Monarchy) or 2 food (govt ≥ Communism) from nearest city
    for (const u of this.units) {
      const uData = UNITS[u.typeId];
      if (uData.role !== 5) continue;  // settlers / engineers only (role 5)
      const civ = this.civs[u.civId];
      if (!civ?.alive) continue;
      const eat = civ.government >= 3 ? COSMIC.settlersEatCommunism : COSMIC.settlersEatMonarchy;
      const ownCities = this.cities.filter(c => c.civId === u.civId);
      if (!ownCities.length) continue;
      const nearest = ownCities.reduce((best, c) => {
        const d = Math.abs(c.col - u.col) + Math.abs(c.row - u.row);
        return d < best.d ? { c, d } : best;
      }, { c: ownCities[0], d: Infinity }).c;
      nearest.food -= eat;
    }

    // ── Fundamentalism unit maintenance (gold per unit beyond 10 free) ─────────
    // Non-Fundamentalism govts use shield support deducted in cityYields() via _cityShieldSupport().
    for (const civ of this.civs) {
      if (!civ.alive || civ.government !== 4) continue;
      const civCities = this.cities.filter(c => c.civId === civ.id);
      const freeUnits = civCities.length * COSMIC.fundamentalismFreeSupport;
      const paidList = this.units.filter(u => {
        if (u.civId !== civ.id || u.buildTask) return false;
        if ((UNITS[u.typeId]?.flags ?? 0) & FLAGS.FREE_FUND_SUPP) return false;
        return true;
      });
      const paidUnits = Math.max(0, paidList.length - freeUnits);
      civ.gold -= paidUnits;
      if (civ.gold < 0) {
        if (civ.id === 0) this._addLog('Your treasury is bankrupt!');
        civ.gold = 0;
      }
    }

    // ── NEAR_LAND / trireme risk ──────────────────────────────────────────────
    // Units with NEAR_LAND flag (triremes) that end a turn in open ocean risk sinking.
    for (const u of this.units) {
      if (!((UNITS[u.typeId]?.flags ?? 0) & FLAGS.NEAR_LAND)) continue;
      // Lighthouse (42): prevents trireme sinking in open ocean
      if (this._civHasWonder(u.civId, 42)) continue;
      // Open ocean = no land tile within 1 staggered-iso step
      const nbrs = neighbours(u.col, u.row);
      const nearLand = nbrs.some(n =>
        n.row >= 0 && n.row < this.mapRows &&
        n.col >= 0 && n.col < this.mapCols &&
        this.tiles[n.row][n.col] !== TERRAIN.OCEAN
      );
      if (!nearLand && this.rng() < 1 / COSMIC.triremeRisk) {
        const name = UNITS[u.typeId]?.name ?? 'Trireme';
        this._addLog(`${CIVS[u.civId]?.adjective ?? ''} ${name} lost at sea!`);
        this._removeUnit(u);
      }
    }

    // ── Air unit fuel tick ───────────────────────────────────────────────────
    for (const u of [...this.units]) {
      const uData = UNITS[u.typeId];
      if (uData?.domain !== 1) continue;
      // Helicopter (range=0): takes 1 damage per turn outside city/airbase
      if (uData.range === 0) {
        const onCity = this.cityAt(u.col, u.row) !== null;
        const onAirbase = this._tileImprovements[u.row]?.[u.col]?.airbase ?? false;
        if (!onCity && !onAirbase) {
          u.hp = Math.max(0, u.hp - HP_SCALE);
          if (u.hp <= 0) {
            this._addLog(`${CIVS[u.civId]?.adjective ?? ''} ${uData.name} crashes!`);
            this._removeUnit(u);
          }
        }
        continue;
      }
      if (!(uData.range > 0)) continue; // skip unlimited-range non-helicopter
      const onCity = this.cityAt(u.col, u.row) !== null;
      const onAirbase = this._tileImprovements[u.row]?.[u.col]?.airbase ?? false;
      if (onCity || onAirbase) {
        u.fuel = uData.range; // refuel at city or airbase
      } else {
        u.fuel = Math.max(0, (u.fuel ?? 0) - 1);
        if (u.fuel <= 0) {
          this._addLog(`${CIVS[u.civId]?.adjective ?? ''} ${uData.name} runs out of fuel and crashes!`);
          this._removeUnit(u);
        } else if (u.fuel === 1 && !u.gotoTarget) {
          // Auto-return: find nearest city/airbase and set goto
          const base = this._nearestAirBase(u);
          if (base) {
            u.gotoTarget = { col: base.col, row: base.row };
            this._addLog(`${uData.name} low on fuel — returning to base.`);
          }
        }
      }
    }

    // ── Anarchy countdown ───────────────────────────────────────────────────
    const playerCiv = this.civs[0];
    if (playerCiv?.alive && playerCiv.anarchyTurnsLeft > 0) {
      playerCiv.anarchyTurnsLeft--;
      if (playerCiv.anarchyTurnsLeft === 0) {
        this._emit('revolutionComplete', {});
      }
    }

    // ── Research ────────────────────────────────────────────────────────────
    for (const civ of this.civs) {
      if (civ.alive) this._doResearch(civ);
    }

    // ── Scenario events (turn trigger) ────────────────────────────────────
    if (this._isScenario) executeEvents(this, 'turn');

    // ── Power history snapshot ───
    const ratings = {};
    for (const civ of this.civs) {
      if (!civ.alive) { ratings[civ.id] = 0; continue; }
      const pop = this.cities.filter(c => c.civId === civ.id).reduce((s, c) => s + c.size, 0);
      const mil = this.units.filter(u => u.civId === civ.id)
        .reduce((s, u) => s + (UNITS[u.typeId]?.attack ?? 0) + (UNITS[u.typeId]?.defense ?? 0), 0);
      const tech = civ.advances.size;
      const gold = Math.floor(civ.gold / 256);
      ratings[civ.id] = pop + mil + tech + gold;
    }
    this._powerHistory.push({ turn: this.turn, ratings });
  }

  /**
   * Free units per city for Monarchy/Communism/Fundamentalism.
   * Anarchy/Despotism use city.size (handled in the unit-support loop directly).
   * Republic/Democracy: 0 free units.
   * Source: axx0 RulesParser.SupportFromLevel() + COSMIC support values.
   */
  _govtFreeSupport(govt) {
    if (govt === 2) return COSMIC.monarchyFreeSupport;       // Monarchy: 3
    if (govt === 3) return COSMIC.communismFreeSupport;      // Communism: 3
    if (govt === 4) return COSMIC.fundamentalismFreeSupport; // Fundamentalism: 10
    return 0;                                                 // Republic/Democracy: none
  }

  _cityShieldSupport(city) {
    const civ = this.civs[city.civId];
    if (!civ) return 0;
    const govt = civ.government ?? 1;
    if (govt === 4) return 0;
    const supported = this.units.filter(u => {
      if (u.civId !== city.civId || u.homeCity !== city.id) return false;
      if (u.buildTask) return false;
      return true;
    });
    const freePerCity = govt <= 1 ? city.size : this._govtFreeSupport(govt);
    return Math.max(0, supported.length - freePerCity);
  }

  /**
   * Fraction of trade (and shields) lost to corruption for a city.
   *
   * Source: axx0 CityExtensions.CalculateOutput() + ComputeDistanceFactor() + RulesParser.DefaultDistanceFromIndex()
   * Formula: corruptFrac = min(32, distance) × 15 / (4 + effGovt) / 100
   *   where effGovt = government index + 1 if WeLoveKingDay (acts as higher govt → less corruption)
   *
   * Fixed-distance governments (distance=0 → no corruption):
   *   Communism (3): COSMIC.communismPalaceDist (0 in RULES.TXT)
   *   Fundamentalism (4): 0
   *   Democracy (6): 0
   *
   * Variable-distance governments compute Manhattan distance to palace.
   *   Anarchy (level < 1): adds difficulty level to distance (higher difficulty = more corruption).
   *   Courthouse (id=7) halves effective distance.
   */
  _corruptionFraction(city, civ) {
    if (!civ) return 0;
    const govt = civ.government ?? 1;

    // Fixed-distance = 0 → no corruption or waste
    if (govt === 4) return 0;  // Fundamentalism
    if (govt === 6) return 0;  // Democracy
    if (govt === 3) {
      if (COSMIC.communismPalaceDist === 0) return 0;
      // Non-zero communismPalaceDist: treat as fixed distance
      const effGovt3 = govt + (city.weLoveKing ? 1 : 0);
      return Math.min(0.99, COSMIC.communismPalaceDist * 15 / (4 + effGovt3) / 100);
    }

    // Capital city (has Palace, improvement id 1): distance = 0 → no corruption
    if (city.improvements.has(1)) return 0;

    // Compute Manhattan distance to palace
    const palace = this.cities.find(c => c.civId === civ.id && c.improvements.has(1));
    let dist = palace
      ? Math.abs(city.col - palace.col) + Math.abs(city.row - palace.row)
      : 32;

    // Anarchy (govt level < 1): add difficulty level to distance (worse corruption at high difficulty)
    if (govt === 0) dist += this.difficulty ?? 1;

    // Courthouse (id 7) halves effective distance
    if (city.improvements.has(7)) dist = Math.max(1, Math.floor(dist / 2));

    // WeLoveKingDay: government acts as +1 (less corruption)
    // Source: axx0 CityExtensions.CalculateOutput() line 47
    const effGovt = govt + (city.weLoveKing ? 1 : 0);

    // axx0 formula: corruption = trade × min(32,dist) × 15/(4+govt) / 100
    return Math.min(0.99, Math.min(32, dist) * 15 / (4 + effGovt) / 100);
  }

  /**
   * Compute shield waste fraction for a city (separate from trade corruption).
   * axx0 CityExtensions.cs: wasteFactor = 15 / (4 + gov*4), distance capped at 16.
   */
  _wasteFraction(city, civ) {
    if (!civ) return 0;
    const govt = civ.government ?? 1;
    if (govt === 4) return 0;  // Fundamentalism: no waste
    if (govt === 6) return 0;  // Democracy: no waste
    if (govt === 3) {
      if (COSMIC.communismPalaceDist === 0) return 0;
      const effGovt3 = govt + (city.weLoveKing ? 1 : 0);
      return Math.min(0.99, COSMIC.communismPalaceDist * 15 / (4 + effGovt3 * 4) / 100);
    }
    if (city.improvements.has(1)) return 0; // Capital
    const palace = this.cities.find(c => c.civId === civ.id && c.improvements.has(1));
    let dist = palace
      ? Math.abs(city.col - palace.col) + Math.abs(city.row - palace.row)
      : 16;
    if (govt === 0) dist += this.difficulty ?? 1;
    if (city.improvements.has(7)) dist = Math.max(1, Math.floor(dist / 2));
    const effGovt = govt + (city.weLoveKing ? 1 : 0);
    return Math.min(0.99, Math.min(16, dist) * 15 / (4 + effGovt * 4) / 100);
  }

  /**
   * Apply production-change shield penalty (COSMIC.productionChangePenalty %).
   * Use this when the human player voluntarily switches production.
   */
  changeProduction(city, newProduction) {
    this._trimProductionQueue(city);
    const prev = city.production;
    const changed = prev && (prev.type !== newProduction.type || prev.id !== newProduction.id);

    if (city.production &&
        newProduction.type !== city.production.type &&
        city.shields > 0) {
      city.shields = Math.floor(city.shields * (1 - COSMIC.productionChangePenalty / 100));
    }

    city.production = newProduction;

    if (changed) {
      city.productionQueue.unshift({ type: prev.type, id: prev.id });
      this._trimProductionQueue(city);
    }
  }

  queueProduction(city, prod) {
    if (!city || !prod) return false;
    this._trimProductionQueue(city);

    if (!city.production) {
      this.changeProduction(city, { type: prod.type, id: prod.id });
      return true;
    }

    if (!this._productionStillAvailable(city, prod)) return false;
    if (city.productionQueue.length >= this.maxProductionQueueLength()) return false;
    city.productionQueue.push({ type: prod.type, id: prod.id });
    return true;
  }

  removeFromProductionQueue(city, idx) {
    this._trimProductionQueue(city);
    if (!city || idx < 0 || idx >= city.productionQueue.length) return false;
    city.productionQueue.splice(idx, 1);
    return true;
  }

  moveProductionQueueItem(city, fromIdx, toIdx) {
    this._trimProductionQueue(city);
    if (!city) return false;
    const q = city.productionQueue;
    if (fromIdx < 0 || fromIdx >= q.length) return false;
    if (toIdx < 0 || toIdx >= q.length) return false;
    if (fromIdx === toIdx) return true;
    const [item] = q.splice(fromIdx, 1);
    q.splice(toIdx, 0, item);
    return true;
  }

  maxProductionQueueLength() {
    return 5;
  }

  _trimProductionQueue(city) {
    if (!city) return;
    if (!Array.isArray(city.productionQueue)) city.productionQueue = [];
    city.productionQueue = city.productionQueue
      .filter(p => p && (p.type === 'unit' || p.type === 'improvement') && Number.isInteger(p.id))
      .slice(0, this.maxProductionQueueLength());
  }

  _productionStillAvailable(city, prod, avail = null) {
    const list = avail ?? this.availableProduction(city);
    return list.some(p => p.type === prod.type && p.id === prod.id);
  }

  _productionName(prod) {
    if (!prod) return 'item';
    return prod.type === 'unit'
      ? (UNITS[prod.id]?.name ?? 'unit')
      : (IMPROVEMENTS[prod.id]?.name ?? 'improvement');
  }

  _dequeueNextProduction(city, avail = null) {
    this._trimProductionQueue(city);
    if (!city.productionQueue.length) return null;

    const list = avail ?? this.availableProduction(city);
    while (city.productionQueue.length > 0) {
      const next = city.productionQueue.shift();
      if (this._productionStillAvailable(city, next, list)) return next;
      this._addLog(`${city.name}: skipped queued ${this._productionName(next)} (no longer available).`);
    }
    return null;
  }

  productionCost(prod) { return this._productionCost(prod); }

  _productionCost({ type, id }) {
    if (type === 'unit')        return UNITS[id].cost        * 10;
    if (type === 'improvement') return IMPROVEMENTS[id]?.cost * 10 ?? 9999;
    return 9999;
  }

  /**
   * Calculate rush-buy cost for a city's current production.
   * Civ2 formula:
   *   Units:        2P + P²/20  (P = remaining shields)
   *   Improvements: 2P
   *   Wonders:      4P
   *   If no shields contributed yet, cost doubles.
   * Returns gold cost, or -1 if nothing is being produced.
   */
  rushBuyCost(city) {
    if (!city.production) return -1;
    const totalCost = this._productionCost(city.production);
    const remaining = Math.max(0, totalCost - city.shields);
    if (remaining <= 0) return 0;

    const { type, id } = city.production;
    const isWonder = type === 'improvement' && id >= 39;
    let cost;
    if (type === 'unit') {
      cost = 2 * remaining + Math.floor(remaining * remaining / 20);
    } else if (isWonder) {
      cost = 4 * remaining;
    } else {
      cost = 2 * remaining;
    }
    // Double cost if no shields contributed yet
    if (city.shields === 0) cost *= 2;
    return cost;
  }

  /**
   * Rush-buy the current production in a city.
   * Returns true if successful, false if not enough gold or nothing to buy.
   */
  rushBuy(city) {
    const cost = this.rushBuyCost(city);
    if (cost <= 0) return false;
    const civ = this.civs[city.civId];
    if (!civ || civ.gold < cost) return false;

    civ.gold -= cost;
    // Fill shields to complete on next turn processing
    const totalCost = this._productionCost(city.production);
    city.shields = totalCost;
    this._addLog(`${city.name} rush-buys ${city.production.type === 'unit' ? UNITS[city.production.id]?.name : IMPROVEMENTS[city.production.id]?.name}!`);
    this._emit('rushBuy', { city, cost });
    return true;
  }

  sellImprovement(city, impId) {
    if (city.improvementSold) return false;
    if (impId === 1) return false;
    const imp = IMPROVEMENTS[impId];
    if (!imp || imp.isWonder) return false;
    if (!city.improvements.has(impId)) return false;
    city.improvements.delete(impId);
    city.improvementSold = true;
    const civ = this.civs[city.civId];
    if (civ) civ.gold += imp.cost;
    this._enforceInfrastructureLimits(city);
    this._addLog(`${city.name} sells ${imp.name} for ${imp.cost} gold.`);
    this._emit('improvementSold', { city, impId, impName: imp.name });
    return true;
  }

  _completeProduction(city) {
    const { type, id } = city.production;

    if (type === 'unit') {
      let spawnCol = city.col, spawnRow = city.row;
      const unitData = UNITS[id];
      // MGE keeps Settlers/Engineers in the production chooser at size 1,
      // but holds the completed item (and its shields) until the city grows.
      if (unitData.role === 5 && city.size <= 1) return false;
      if (unitData.domain === 2) {
        // Sea units must spawn on an adjacent ocean tile (coastal city)
        const oceanAdj = neighbours(city.col, city.row, this.mapCols).find(n => {
          if (n.row < 0 || n.row >= this.mapRows) return false;
          const nc = this._wrapCol(n.col);
          return this.tiles[n.row][nc] === TERRAIN.OCEAN &&
                 !this.units.some(u => u.col === nc && u.row === n.row && u.civId === city.civId);
        });
        if (oceanAdj) { spawnCol = oceanAdj.col; spawnRow = oceanAdj.row; }
      } else {
        // Land/air: try city tile; if blocked, use a free adjacent non-ocean tile
        const blocked = this.units.some(u => u.civId === city.civId && u.col === city.col && u.row === city.row);
        if (blocked) {
          const free = neighbours(city.col, city.row, this.mapCols).find(n =>
            n.row >= 0 && n.row < this.mapRows &&
            this.tiles[n.row][this._wrapCol(n.col)] !== TERRAIN.OCEAN &&
            !this.units.some(u => u.col === n.col && u.row === n.row && u.civId === city.civId)
          );
          if (free) { spawnCol = free.col; spawnRow = free.row; }
        }
      }
      const newUnit = this._spawnUnit(id, city.civId, spawnCol, spawnRow);
      newUnit.homeCity = city.id;
      // Barracks (improvement id 0) or Sun Tzu's War Academy (46): land units start as veterans
      // Sun Tzu's War Academy applies to all cities of the owning civ, not just the one with Barracks.
      const hasBarracksEffect = city.improvements.has(0) || this._civHasWonder(city.civId, 46);
      const hasAirport = city.improvements.has(32);
      if ((hasBarracksEffect && unitData.domain === 0) || hasAirport) {
        newUnit.veteran = true;
        newUnit.hp    += 10;   // +1 Civ2 HP point in the ×10 scale
        newUnit.maxHp += 10;
      }
      // Settlers/Engineers (role 5) consume 1 population (axx0 UnitProductionOrder.cs:51-53)
      if (unitData.role === 5 && city.size > 1) {
        city.size--;
        this._autoRemoveWorker(city);
      }
      this._addLog(`${city.name} produces ${UNITS[id]?.name ?? 'unit'}!`);
      this._emit('production', { city, type: 'unit', id });
    } else if (type === 'improvement') {
      // SS parts (35-37) are stackable — track in ssParts, not improvements
      if (id === 35 || id === 36 || id === 37) {
        city.ssParts[id] = (city.ssParts[id] ?? 0) + 1;
      } else {
        city.improvements.add(id);
      }
      this._addLog(`${city.name} completes ${IMPROVEMENTS[id]?.name ?? 'improvement'}!`);
      this._emit('production', { city, type: 'improvement', id, improvData: IMPROVEMENTS[id] });

      // ── Throne decoration upgrade on wonder completion for human ──────────
      if (IMPROVEMENTS[id]?.isWonder && city.civId === 0) {
        this._offerThroneUpgrade();
      }

      // ── Wonder one-time grants ──────────────────────────────────────────────
      if (IMPROVEMENTS[id]?.isWonder) {
        // Pyramids (39): add Granary to all existing civ cities
        if (id === 39) {
          for (const c of this.cities) {
            if (c.civId === city.civId && !c.improvements.has(3)) {
              c.improvements.add(3);
            }
          }
          this._addLog('The Pyramids inspire construction of Granaries in all cities!');
        }

        // Darwin's Voyage (57): grant 2 random available advances
        if (id === 57) {
          const civ = this.civs[city.civId];
          const available = this.availableAdvances(city.civId);
          const picked = available.sort(() => this.rng() - 0.5).slice(0, 2);
          for (const adv of picked) {
            civ.advances.add(adv.id);
            this._addLog(`Darwin's Voyage: ${civ?.data?.adjective ?? ''} discovers ${adv.name}!`);
            this._emit('advance', { civ, advId: adv.id });
          }
          if (civ.currentResearch && civ.advances.has(civ.currentResearch)) {
            civ.currentResearch = null;
          }
        }

        // Statue of Liberty (58): effect is checked in startRevolution() — no special action on build

        // Eiffel Tower (59): all foreign civs' attitude toward the builder improves by +10
        if (id === 59) {
          for (const other of this.civs) {
            if (!other || !other.alive || other.id === city.civId) continue;
            this.adjustAttitude(other.id, city.civId, 10);
          }
          this._addLog(`The Eiffel Tower improves international relations!`);
        }

        // Manhattan Project (62): enables nuclear weapons production for ALL civs
        if (id === 62) {
          this._manhattanBuilt = true;
          const civName = this.civs[city.civId]?.data?.adjective ?? '';
          this._addLog(`The ${civName} Manhattan Project enables nuclear weapons for all civilizations!`);
          this._emit('manhattanBuilt', { civId: city.civId });
        }

        // Marco Polo's Embassy (48): automatically establish embassy with all known civs
        if (id === 48) {
          const ownerCiv = this.civs[city.civId];
          if (ownerCiv) {
            for (const other of this.civs) {
              if (!other || !other.alive || other.id === city.civId) continue;
              ownerCiv.embassies.add(other.id);
            }
            this._addLog(`Marco Polo's Embassy establishes relations with all civilizations!`);
          }
        }

        // United Nations (63): diplomatic wonder — tracked for election
        if (id === 63) {
          const civName = this.civs[city.civId]?.data?.adjective ?? '';
          this._addLog(`The ${civName} United Nations opens diplomatic channels!`);
          this._emit('unBuilt', { civId: city.civId });
        }

        // Apollo Program (64): unlocks SS parts for all civs
        if (id === 64) {
          this._apolloBuilt = true;
          const civName = this.civs[city.civId]?.data?.adjective ?? '';
          this._addLog(`The ${civName} Apollo Program opens the Space Race!`);
          this._emit('apolloBuilt', { civId: city.civId });
        }
      }
    }

    const nextQueued = this._dequeueNextProduction(city);
    if (nextQueued) {
      city.production = { type: nextQueued.type, id: nextQueued.id };
    } else if (city.civId !== 0) {
      this._aiPickProduction(city);
    } else {
      city.production = null;
    }
    return true;
  }

  // ─── Research ──────────────────────────────────────────────────────────────

  /**
   * Cost (in beakers) to research the next advance for `civ`.
   * Scales with the number of advances already owned.
   */
  advanceCost(civ) {
    // axx0 AdvanceFunctions.cs:184-198: baseCost × (n+1), linear in n
    const n = civ.advances.size;
    return COSMIC.techParadigm * (n + 1);
  }

  /**
   * Returns all ADVANCES that `civIdx` can research right now:
   *   - not yet owned
   *   - both prerequisites satisfied (or -1)
   *   - id 0-89 only (skip user/extra slots 90-99)
   */
  availableAdvances(civIdx) {
    const civ = this.civs[civIdx];
    const normal = ADVANCES.filter(a => {
      if (a.id > 89)                                 return false;
      if (civ.advances.has(a.id))                    return false;
      const [p1, p2] = a.preq;
      if (p1 !== -1 && !civ.advances.has(p1))        return false;
      if (p2 !== -1 && !civ.advances.has(p2))        return false;
      return true;
    });
    // If all normal advances are discovered, offer Future Technology
    if (normal.length === 0) {
      return [{ id: 100, name: 'Future Technology', preq: [-1, -1], epoch: 3, cat: 0 }];
    }
    return normal;
  }

  /**
   * Returns all units and improvements a city can build right now:
   *   - unit/improvement prereq advance must be owned (or prereq === -1)
   *   - improvements already built in this city are excluded
   *   - wonders already built anywhere are excluded
   *   - land-domain units only (domain === 0) for now
   */
  availableProduction(city) {
    const civ   = this.civs[city.civId];
    const items = [];

    for (const u of UNITS) {
      if (u.prereq !== -1 && !civ.advances.has(u.prereq)) continue;
      if (u.obsoletedBy !== -1 && civ.advances.has(u.obsoletedBy)) continue;
      // Nuclear Missile (id=45) requires Manhattan Project (62) to have been built by any civ
      if (u.id === 45 && !this._manhattanBuilt) continue;
      items.push({ type: 'unit', id: u.id, name: u.name, cost: u.cost * 10 });
    }

    const builtWonders = new Set(
      this.cities.flatMap(c => [...c.improvements].filter(id => IMPROVEMENTS[id]?.isWonder))
    );
    for (const imp of IMPROVEMENTS) {
      if (imp.id === 0)  continue;
      if (imp.id === 38) continue;                                  // Capitalisation: not a real improvement
      if (imp.id >= 35 && imp.id <= 37) {
        // SS parts only available after Apollo Program (64) is built
        if (!this._apolloBuilt) continue;
        // Each SS part can be built multiple times (no "already built" check)
      } else if (imp.id > 38) {
        // Wonders: id 39+
        if (imp.isWonder && builtWonders.has(imp.id)) continue;    // wonder already built elsewhere
      } else {
        if (city.improvements.has(imp.id)) continue;               // already built here
        if (imp.isWonder && builtWonders.has(imp.id)) continue;
      }
      if (imp.prereq !== -1 && !civ.advances.has(imp.prereq)) continue;
      items.push({ type: 'improvement', id: imp.id, name: imp.name, cost: imp.cost * 10 });
    }

    return items;
  }

  /**
   * Set the human player's current research target.
   */
  startResearch(civIdx, advId) {
    this.civs[civIdx].currentResearch = advId;
  }

  // ─── Government / revolution ───────────────────────────────────────────────

  /**
   * Governments the given civ can adopt (based on advances owned).
   * Always includes Despotism (1) as a fallback.
   * Advance prerequisites: Monarchy=54, Republic=71, Democracy=21,
   *                        Communism=15, Fundamentalism=31.
   */
  availableGovernments(civIdx) {
    const civ = this.civs[civIdx];
    if (!civ) return [];
    const has = id => civ.advances.has(id);
    const govts = [GOVERNMENTS[1]];                       // Despotism always available
    if (has(54)) govts.push(GOVERNMENTS[2]);              // Monarchy
    if (has(15)) govts.push(GOVERNMENTS[3]);              // Communism
    if (has(31)) govts.push(GOVERNMENTS[4]);              // Fundamentalism
    if (has(71)) govts.push(GOVERNMENTS[5]);              // Republic
    if (has(21)) govts.push(GOVERNMENTS[6]);              // Democracy
    return govts;
  }

  /**
   * Start a revolution for civ 0.
   * Enters Anarchy for a random 1–5 turn period, then fires 'revolution' event.
   */
  startRevolution() {
    const civ = this.civs[0];
    if (!civ) return;
    // Statue of Liberty (58): instant government change — no anarchy
    if (this._civHasWonder(0, 58)) {
      civ.government = 0;
      civ.anarchyTurnsLeft = 0;
      this._addLog('The Statue of Liberty allows instant government change!');
      this._emit('revolutionComplete', {});
      return;
    }
    const turns = Math.floor(this.rng() * 5) + 1;
    civ.government        = 0;   // Anarchy
    civ.anarchyTurnsLeft  = turns;
    this._addLog(`The people revolt! ${turns} turn${turns > 1 ? 's' : ''} of anarchy.`);
    this._emit('revolutionStart', { turns });
  }

  /**
   * Adopt a new government for civ 0 (called after anarchy ends).
   */
  setGovernment(govtId) {
    const civ = this.civs[0];
    if (!civ) return;
    civ.government       = govtId;
    civ.anarchyTurnsLeft = 0;
    this._addLog(`The people adopt ${GOVERNMENTS[govtId]?.name ?? 'a new government'}!`);
    this._emit('governmentSet', { govtId });
    this._play?.(SFX?.newGovt);
  }

  /**
   * Accumulate beakers for `civ` this turn and complete research if cost met.
   * AI civs auto-pick an advance if they have none queued.
   */
  _doResearch(civ) {
    if (civ.currentResearch === null) {
      if (civ.id !== 0) this._aiPickResearch(civ);
      else return; // human must choose via UI
    }

    // Fundamentalism caps science rate at fundamentalismMaxSci × 10 (= 50%)
    const sciRate = civ.government === 4
      ? Math.min(civ.sciRate, COSMIC.fundamentalismMaxSci * 10)
      : civ.sciRate;

    // Accumulate science output from all owned cities
    for (const city of this.cities) {
      if (city.civId !== civ.id) continue;
      if (city.disorder) continue; // Disorder skips science (axx0 GameTurn.cs:77)
      const yields = this.cityYields(city);
      // Science multipliers: Library(6) × 1.5, University(12) × 1.5, Research Lab(26) × 1.5
      let sciMult = 1;
      if (city.improvements.has(6))  sciMult *= 1.5;
      if (city.improvements.has(12)) sciMult *= 1.5;
      if (city.improvements.has(26)) sciMult *= 1.5;
      // Isaac Newton's College (55): 2× science beakers from the city that owns it
      if (city.improvements.has(55)) sciMult *= 2;
      // SETI Program (65): 2× science in the city that owns it
      if (city.improvements.has(65)) sciMult *= 2;
      // Fundamentalism also loses fundamentalismSciLoss% of science output
      if (civ.government === 4) sciMult *= (1 - COSMIC.fundamentalismSciLoss / 100);
      civ.beakers += Math.max(0, Math.floor(yields.trade * sciRate / 100 * sciMult));
      // Scientist specialists: 2 beakers each (flat, not multiplied by library/university/etc.)
      civ.beakers += (city.specialists?.scientist ?? 0) * 2;
    }

    const cost = this.advanceCost(civ);
    if (civ.beakers >= cost) {
      civ.beakers -= cost;
      const advId = civ.currentResearch;

      // Future Technology (pseudo-advance 100): increment counter, auto-queue next
      if (advId === 100) {
        civ.futureTechCount++;
        this._addLog(`${CIVS[civ.id]?.adjective ?? 'Player'} discovers Future Technology ${civ.futureTechCount}!`);
        this._emit('advance', { civ, advId: 100 });
        civ.currentResearch = 100; // auto-continue researching future tech
        return;
      }

      const adv   = ADVANCES[advId];
      const prevLevel = this.palaceLevel(civ.id);
      civ.advances.add(advId);
      if (civ.researchGoal === advId) civ.researchGoal = null;
      this._addLog(`${CIVS[civ.id]?.adjective ?? 'Player'} discovers ${adv?.name ?? '?'}!`);
      this._emit('advance', { civ, advId });
      civ.currentResearch = null;

      // Scenario event: received technology
      if (this._isScenario) {
        executeEvents(this, 'advance', { advId, civId: civ.id });
      }

      // Throne decoration upgrade on era advancement (human only)
      if (civ.id === 0 && this.palaceLevel(0) > prevLevel) {
        this._offerThroneUpgrade();
      }

      // Wonder expiration: any wonder with expiresAt === this advance is obsoleted
      for (const c of this.cities) {
        for (const impId of [...c.improvements]) {
          const imp = IMPROVEMENTS[impId];
          if (imp?.isWonder && imp.expiresAt === advId) {
            c.improvements.delete(impId);
            this._addLog(`The ${imp.name} has crumbled into dust!`);
          }
        }
      }

      // Unit obsolescence: flag any units of types obsoleted by this advance
      for (const u of this.units) {
        if (u.civId === civ.id) {
          const uData = UNITS[u.typeId];
          if (uData.obsoletedBy !== -1 && uData.obsoletedBy === advId) {
            u.obsolete = true;
          }
        }
      }

      // Leonardo's Workshop (53): auto-upgrade ALL obsolete units of this civ for free
      if (this._civHasWonder(civ.id, 53)) {
        this._leonardoUpgradeAll(civ);
      }

      // If all normal advances discovered, auto-set to Future Technology
      if (this.availableAdvances(civ.id).length === 0) {
        civ.currentResearch = 100;
      } else if (civ.id !== 0) {
        this._aiPickResearch(civ);
      }
    }

    // Great Library (43): automatically receive any advance already known by 2+ other civs
    if (this._civHasWonder(civ.id, 43)) {
      const otherCivs = this.civs.filter(c => c && c.alive && c.id !== civ.id);
      for (let advId = 0; advId < ADVANCES.length; advId++) {
        if (civ.advances.has(advId)) continue;
        const knownByCount = otherCivs.filter(c => c.advances.has(advId)).length;
        if (knownByCount >= 2) {
          civ.advances.add(advId);
          this._addLog(`The Great Library grants ${ADVANCES[advId]?.name ?? '?'} to ${CIVS[civ.id]?.adjective ?? 'the player'}!`);
          this._emit('advance', { civ, advId });
          if (civ.currentResearch === advId) civ.currentResearch = null;
        }
      }
    }
  }

  /** Choose the best available advance for an AI civ, weighted by aiValue and civMod personality. */
  _aiPickResearch(civ) {
    const available = this.availableAdvances(civ.id);
    if (!available.length) return;
    const civData = civ.data ?? {};

    // Goal-directed research: prioritize techs on path to key targets
    const atWar = this.civs.some(c => c && c.alive && c.id !== civ.id &&
      this.isAtWar(civ.id, c.id));

    // Strategic goals with priority bonuses
    const goalBonuses = new Map();
    // Early government: Monarchy(54) → Republic(71) → Democracy(21)
    if (!civ.advances.has(54)) goalBonuses.set(54, 8);  // Monarchy
    if (!civ.advances.has(71)) goalBonuses.set(71, 10); // Republic
    if (!civ.advances.has(21)) goalBonuses.set(21, 6);  // Democracy
    // Military goals when at war
    if (atWar) {
      if (!civ.advances.has(35)) goalBonuses.set(35, 12); // Gunpowder
      if (!civ.advances.has(51)) goalBonuses.set(51, 8);  // Metallurgy
      if (!civ.advances.has(67)) goalBonuses.set(67, 8);  // Railroad
    }
    // Infrastructure
    if (!civ.advances.has(57)) goalBonuses.set(57, 4); // Navigation
    if (!civ.advances.has(67)) goalBonuses.set(67, 5); // Railroad

    // Check if any available advance is a prerequisite for a goal
    const prereqBonus = (adv) => {
      let bonus = 0;
      for (const [goalId, goalScore] of goalBonuses) {
        const goal = ADVANCES[goalId];
        if (!goal) continue;
        // Direct prereq of a goal tech
        if (goal.preq[0] === adv.id || goal.preq[1] === adv.id) {
          bonus = Math.max(bonus, Math.floor(goalScore * 0.7));
        }
      }
      return bonus;
    };

    available.sort((a, b) => {
      const scoreA = (a.aiValue ?? 0) + this._advPersonalityScore(a, civData)
        + (goalBonuses.get(a.id) ?? 0) + prereqBonus(a)
        + (atWar && a.cat === 0 ? 3 : 0);  // military category boost in wartime
      const scoreB = (b.aiValue ?? 0) + this._advPersonalityScore(b, civData)
        + (goalBonuses.get(b.id) ?? 0) + prereqBonus(b)
        + (atWar && b.cat === 0 ? 3 : 0);
      return scoreB - scoreA;
    });
    civ.currentResearch = available[0].id;
  }

  /**
   * Score how well an advance matches a civ's personality.
   * civMod is a scalar: positive = civilized-favored tech, negative = military-favored.
   * Multiplied by civ.civilize (-1=militaristic, +1=civilized) for the bonus.
   */
  _advPersonalityScore(adv, civData) {
    const mod = adv.civMod ?? 0;
    return mod * (civData.civilize ?? 0);
  }

  // ─── Diplomacy ─────────────────────────────────────────────────────────────

  isAtWar(civA, civB) {
    return this.civs[civA]?.relations.get(civB) === 'war';
  }

  _declareWarInternal(civA, civB) {
    if (this.isAtWar(civA, civB)) return;
    this.civs[civA]?.relations.set(civB, 'war');
    this.civs[civB]?.relations.set(civA, 'war');
    const wk = `${Math.min(civA, civB)}_${Math.max(civA, civB)}`;
    this._warSinceTurn.set(wk, this.turn);
    const nameA = civA === 0 ? 'You'  : (this.civs[civA]?.data?.adjective ?? CIVS[civA]?.adjective ?? `Civ ${civA}`);
    const nameB = civB === 0 ? 'you'  : (this.civs[civB]?.data?.adjective ?? CIVS[civB]?.adjective ?? `Civ ${civB}`);
    if (civA === 0) {
      this._addLog(`WAR: You declare war on the ${nameB}!`);
    } else if (civB === 0) {
      this._addLog(`WAR: The ${nameA} declare war on you!`);
    } else {
      this._addLog(`WAR: ${nameA} declare war on the ${nameB}.`);
    }
    this._cancelTradeRoutesBetween(civA, civB);
  }

  _cancelTradeRoutesBetween(civA, civB) {
    for (const city of this.cities) {
      if (city.civId !== civA && city.civId !== civB) continue;
      const before = city.tradeRoutes?.length ?? 0;
      if (before === 0) continue;
      const enemyCiv = city.civId === civA ? civB : civA;
      city.tradeRoutes = city.tradeRoutes.filter(r => r.partnerCivId !== enemyCiv);
      const cancelled = before - city.tradeRoutes.length;
      if (cancelled > 0) {
        this._addLog(`${city.name} loses ${cancelled} trade route${cancelled > 1 ? 's' : ''} due to war.`);
      }
    }
  }

  /** Return civA's attitude toward civB (integer -100..+100; 0 = neutral). */
  attitude(civA, civB) {
    return this.civs[civA]?.attitude.get(civB) ?? 0;
  }

  /**
   * Adjust civA's attitude toward civB by delta, clamped to [-100, +100].
   * Symmetric: also adjusts civB's attitude toward civA by the same delta.
   */
  adjustAttitude(civA, civB, delta) {
    for (const [a, b] of [[civA, civB], [civB, civA]]) {
      const c = this.civs[a];
      if (!c) continue;
      c.attitude.set(b, Math.max(-100, Math.min(100, (c.attitude.get(b) ?? 0) + delta)));
    }
  }

  /**
   * Determine whether AI civ (aiCivId) would accept a player proposal.
   * @param {number} aiCivId
   * @param {'ceasefire'|'peace'|'alliance'|'techTrade'} proposalType
   * @param {object} [data]  — extra data for techTrade: { myAdvId, theirAdvId }
   * @returns {boolean}
   */
  aiWillAccept(aiCivId, proposalType, data = {}) {
    const civ = this.civs[aiCivId];
    if (!civ?.alive) return false;
    const att     = civ.attitude.get(0) ?? 0;       // AI's attitude toward player
    const attack  = civ.data?.attack ?? 0;           // -1=rational, 1=aggressive
    const repBonus = ((this.civs[0]?.reputation ?? 50) - 50) * 0.3; // -15..+15

    switch (proposalType) {
      case 'ceasefire':
        return att + repBonus > -40 - attack * 20;
      case 'peace':
        return att + repBonus > -10 - attack * 20;
      case 'alliance':
        return !this.isAtWar(0, aiCivId) && att + repBonus > 50;
      case 'techTrade': {
        const { myAdvId, theirAdvId } = data;
        const playerCiv = this.civs[0];
        if (myAdvId === undefined || theirAdvId === undefined) return false;
        if (!civ.advances.has(myAdvId) || playerCiv?.advances.has(theirAdvId)) return false;
        return att + repBonus > 0;
      }
      default:
        return false;
    }
  }

  // ─── Combat ────────────────────────────────────────────────────────────────

  /**
   * Compute defense factor for a unit, matching axx0 UnitExtensions.cs DefenseFactor().
   * Ground bonuses (fortress, fortified, walls) don't stack — only the best applies.
   * Terrain defense is applied as a final multiplier.
   */
  _defenseFactor(defender, attacker) {
    const defData = UNITS[defender.typeId];
    const atkData = UNITS[attacker.typeId];
    const tile    = this.tiles[defender.row][defender.col];
    const atkFlags = atkData.flags ?? 0;
    const defFlags = defData.flags ?? 0;

    // Carried units cannot defend (axx0 UnitExtensions.cs:33)
    if (defender.inShip) return 0;

    // Base defense × veteran
    let df = defData.defense * (defender.veteran ? 1.5 : 1);

    const city = this.cityAt(defender.col, defender.row);

    // Ground defense bonuses: take MAX of fortress, fortified, walls (they don't stack)
    if (defData.domain === 0) {
      let bestGroundBonus = 0;

      // Fortress: +100% defense (not vs air attackers)
      const hasFortress = this._tileImprovements[defender.row]?.[defender.col]?.fortress;
      if (hasFortress && atkData.domain !== 1) {
        bestGroundBonus = df; // +100% of base
      }

      // Fortified: +50% defense
      if (defender.status === 'fortified') {
        bestGroundBonus = Math.max(bestGroundBonus, df * 0.5);
      }

      // City Walls (improvement 8) / Great Wall (wonder 45): +200% defense
      const hasWalls = (city?.improvements.has(8) ?? false) ||
                       (city && this._civHasWonder(city.civId, 45));
      const negateWalls = !!(atkFlags & FLAGS.NEGATE_WALLS);
      if (hasWalls && !negateWalls) {
        bestGroundBonus = Math.max(bestGroundBonus, df * 2);
      }

      df += bestGroundBonus;
    } else if (defData.domain === 1 && defData.range === 0 && (atkFlags & FLAGS.ATTACK_AIR)) {
      // Helicopter vulnerability: defense halved vs air-capable attackers (axx0 UnitExtensions.cs:77-80)
      df /= 2;
    }

    // ANTI_HORSE: ×2 defense vs cavalry-class attackers
    const isHorse = atkData.domain === 0 && atkData.move >= 2 && atkData.attack > 0;
    if ((defFlags & FLAGS.ANTI_HORSE) && isHorse) df *= 2;

    // AEGIS: ×2 defense vs air attackers
    if ((defFlags & FLAGS.AEGIS) && atkData.domain === 1) df *= 2;

    // City-based bonuses
    if (city) {
      if (atkData.domain === 1) {
        if (defData.domain === 1 && defData.range === 1) {
          // Fighter scramble: ×4 vs non-fighters, ×2 vs fighters (axx0 UnitExtensions.cs:86-96)
          df *= (atkData.range !== 1) ? 4 : 2;
        } else {
          // SAM Missile Battery (improvement 27): ×2 defense vs air
          if (city.improvements.has(27)) df *= 2;
        }
      } else if (atkData.domain === 2) {
        // Coastal Fortress (improvement 28): ×2 defense vs sea for ground units
        if (city.improvements.has(28) && defData.domain === 0) df *= 2;
      }
    }

    // Terrain defense applied last (defense/2: 2=×1, 3=×1.5, 4=×2, 6=×3)
    df *= tile.defense / 2;

    return df;
  }

  /**
   * Select the best defender from all units on a tile.
   * Matches axx0 MovementFunctions.cs Attack() lines 328-340.
   */
  _selectBestDefender(attacker, col, row) {
    const enemies = this.units.filter(u => u.col === col && u.row === row && u.civId !== attacker.civId);
    if (enemies.length === 0) return null;
    let best = enemies[0];
    let bestDf = this._defenseFactor(best, attacker);
    for (let i = 1; i < enemies.length; i++) {
      const df = this._defenseFactor(enemies[i], attacker);
      if (df > bestDf) { best = enemies[i]; bestDf = df; }
    }
    return best;
  }

  /**
   * Resolve combat between attacker and defender (Civ2 round-based model).
   * Matches axx0 MovementFunctions.cs Attack() — fixed probability per battle,
   * NOT HP-ratio adjusted.
   */
  _combat(attacker, defender) {
    const atkData = UNITS[attacker.typeId];
    const defData = UNITS[defender.typeId];
    const tile    = this.tiles[defender.row][defender.col];

    // Attack factor: base × veteran, reduced for partial movement
    let atkStr = atkData.attack * (attacker.veteran ? 1.5 : 1);
    const moveMultiplier = COSMIC.roadMultiplier;
    if (attacker.movesLeft < moveMultiplier) {
      atkStr = atkStr * attacker.movesLeft / moveMultiplier;
    }

    // Defense factor via the full defense calculation
    const defStr = this._defenseFactor(defender, attacker);

    // Civ2 combat probability formula (axx0 MovementFunctions.cs:371)
    // Fixed for the entire battle — does NOT change per round.
    let P;
    if (defStr >= atkStr) {
      P = (atkStr * 8 - 1) / (2 * defStr * 8);
    } else {
      P = 1 - (defStr * 8 + 1) / (2 * atkStr * 8);
    }

    // Snapshot HP before combat for animation
    const initialAtkHp = attacker.hp;
    const initialDefHp = defender.hp;
    let atkHp = attacker.hp;
    let defHp = defender.hp;

    // Firepower modifications — ported from axx0 MovementFunctions.cs Attack()
    let atkFp = atkData.fp;
    let defFp = defData.fp;
    if (atkData.domain === 2 && defData.domain === 0) {
      // Naval bombardment: sea attacks land → both fp reduced to 1
      atkFp = 1;
      defFp = 1;
    } else if (atkData.domain !== 2 && defData.domain === 2 && tile !== TERRAIN.OCEAN) {
      // Caught in port: land/air attacks sea unit on a land tile → attacker fp ×2, defender fp=1
      atkFp *= 2;
      defFp = 1;
    } else if (atkData.domain === 1 && defData.domain === 1 && defData.range === 0) {
      // Helicopter (range=0) attacked by any air unit → helicopter fp=1
      defFp = 1;
    }

    // Combat loop: fixed probability per round (axx0 MovementFunctions.cs:378-394)
    const combatLog = [];
    while (atkHp > 0 && defHp > 0) {
      combatLog.push({ attackerWins: false, atkHp, defHp });
      const attackerWins = this.rng() < P;
      if (attackerWins) {
        defHp -= atkFp;
      } else {
        atkHp -= defFp;
      }
      combatLog[combatLog.length - 1].attackerWins = attackerWins;
      combatLog[combatLog.length - 1].atkHpAfter = Math.max(0, atkHp);
      combatLog[combatLog.length - 1].defHpAfter = Math.max(0, defHp);
    }

    const attackerWon = defHp <= 0;

    // Emit combat event with full round log BEFORE modifying units (positions/removal).
    // Snapshot positions now because attacker.col/row mutate on victory.
    this._emit('combat', {
      attacker, defender, atkData, defData,
      combatLog, attackerWon,
      atkCol: attacker.col, atkRow: attacker.row,
      defCol: defender.col, defRow: defender.row,
      initialAtkHp, initialDefHp,
      atkMaxHp: attacker.maxHp, defMaxHp: defender.maxHp,
      atkTypeId: attacker.typeId, defTypeId: defender.typeId,
      atkCivId: attacker.civId, defCivId: defender.civId,
    });

    // Consume attacker's moves
    attacker.movesLeft = 0;
    attacker.status    = 'done';

    const atkName = `${this.civs[attacker.civId]?.data?.adjective ?? CIVS[attacker.civId]?.adjective ?? ''} ${atkData.name}`;
    const defName = `${this.civs[defender.civId]?.data?.adjective ?? CIVS[defender.civId]?.adjective ?? ''} ${defData.name}`;

    if (defHp <= 0) {
      // Attacker wins — record defender position/civ before removal
      const dCol   = defender.col;
      const dRow   = defender.row;
      const dCivId = defender.civId;
      // Casualty tracking
      this._casualties.push({ turn: this.turn, unitTypeId: defender.typeId, defenderCivId: defender.civId, killerCivId: attacker.civId });
      attacker.hp = Math.max(1, atkHp);
      this._removeUnit(defender);
      // Scenario event: unit killed
      if (this._isScenario) {
        executeEvents(this, 'unitKilled', {
          unitTypeId: defender.typeId, attackerCivId: attacker.civId, defenderCivId: defender.civId,
        });
      }
      // Gold reward for killing a barbarian
      if (dCivId === this.barbarianCivIdx && attacker.civId === 0) {
        const reward = 25 * (1 + Math.floor(this.turn / 50));
        this.civs[0].gold += reward;
        this._addLog(`Received ${reward} gold for defeating barbarians.`);
      }
      // Stack elimination: units in cities or fortresses are protected — only
      // open-terrain stacks get wiped when the defender dies (C3)
      const inFortress = this._tileImprovements[dRow]?.[dCol]?.fortress;
      const cityOnTile = this.cityAt(dCol, dRow);
      if (!cityOnTile && !inFortress) {
        const stack = this.units.filter(u => u.col === dCol && u.row === dRow && u.civId === dCivId);
        for (const u of [...stack]) this._removeUnit(u);
      }
      // DESTROYED_ATTACK: unit is destroyed after attacking (missiles, etc.)
      if ((atkData.flags ?? 0) & FLAGS.DESTROYED_ATTACK) {
        this._addLog(`${atkName} destroys ${defName}!`);
        this._removeUnit(attacker);
      } else {
        attacker.col = dCol;
        attacker.row = dRow;
        if (!attacker.veteran && this.rng() < 0.5) {
          attacker.veteran = true;
          this._addLog(`${atkName} defeats ${defName} and earns Veteran status!`);
        } else {
          this._addLog(`${atkName} defeats ${defName}.`);
        }
        // City capture: if the tile had a city, it now belongs to the attacker
        const capturedCity = this.cityAt(dCol, dRow);
        if (capturedCity && capturedCity.civId !== attacker.civId) {
          if (attacker.civId === 0) {
            this._emit('cityCapture', { city: capturedCity });
          } else {
            this._captureCity(capturedCity, attacker.civId);
          }
        }
      }
    } else {
      // Defender wins — write back both HPs
      defender.hp = Math.max(1, defHp);
      attacker.hp = Math.max(0, atkHp);
      if (attacker.hp === 0) {
        // Casualty tracking
        this._casualties.push({ turn: this.turn, unitTypeId: attacker.typeId, defenderCivId: attacker.civId, killerCivId: defender.civId });
        this._removeUnit(attacker);
        this._addLog(`${defName} repels ${atkName}!`);
      } else {
        this._addLog(`${atkName} attacks ${defName} but is driven back.`);
      }
    }

    this._selectNextUnit();
    return true;
  }

  _removeUnit(unit) {
    // If this is a ship, sink all cargo with it
    if (unit.cargo && unit.cargo.length > 0) {
      for (const c of [...unit.cargo]) {
        c.inShip = null;
        this.units = this.units.filter(u => u !== c);
        if (this.activeUnit === c) this.activeUnit = null;
      }
      unit.cargo = [];
    }
    // If this unit was aboard a ship, remove it from the ship's cargo
    if (unit.inShip) {
      unit.inShip.cargo = unit.inShip.cargo.filter(u => u !== unit);
      unit.inShip = null;
    }
    this.units = this.units.filter(u => u !== unit);
    if (this.activeUnit === unit) this.activeUnit = null;
  }

  _captureCity(city, newCivId) {
    const oldCivId = city.civId;
    city.civId = newCivId;
    city.improvements.delete(8);   // city walls destroyed on capture
    if (city.size > 1) city.size--;
    city.shields = 0;
    city.production = null;
    city.productionQueue = [];
    city.manualWorked = null;
    if (newCivId !== 0) this._aiPickProduction(city);
    this._addLog(`${city.name} captured!`);
    this._emit('cityCaptured', { city });
    // Scenario event: city taken
    if (this._isScenario) {
      executeEvents(this, 'cityTaken', {
        cityName: city.name, attackerCivId: newCivId, defenderCivId: oldCivId,
      });
    }
    this._updateVisibility();
  }

  razeCity(city) {
    this.cities = this.cities.filter(c => c !== city);
    this._addLog(`${city.name} razed to the ground!`);
    this._emit('cityRazed', { city });
    this._updateVisibility();
  }

  // ─── Trade Routes (Caravan / Freight) ───────────────────────────────────────

  /**
   * Deliver a trade unit to a target city for a one-time gold+science reward
   * and establish a persistent trade route (up to 3 per city).
   * The unit is consumed on delivery.
   */
  deliverTrade(unit, targetCity) {
    const uData = UNITS[unit.typeId];
    if (uData.role !== 7) return false;

    const homeCity = (unit.homeCity != null && this.cities.find(c => c.id === unit.homeCity))
                   || this.cities.find(c => c.civId === unit.civId);
    if (!homeCity) return false;

    const dist = Math.abs(targetCity.col - homeCity.col) + Math.abs(targetCity.row - homeCity.row);
    const foreign = targetCity.civId !== unit.civId;
    const baseMult = uData.id === 49 ? 1.5 : 1.0;  // Freight gets 50% bonus

    const goldReward = Math.floor((dist * 2 + (foreign ? 50 : 10)) * baseMult);
    const sciReward  = Math.floor((dist + (foreign ? 25 : 5)) * baseMult);

    const civ = this.civs[unit.civId];
    civ.gold += goldReward;
    civ.beakers += sciReward;

    // Establish persistent trade route (max 3 per city)
    const tradePerTurn = Math.max(1, Math.floor((dist + (foreign ? 8 : 2)) * baseMult / 2));
    let routeMsg = '';
    if (homeCity.tradeRoutes.length < 3) {
      homeCity.tradeRoutes.push({
        partnerCityId: targetCity.id,
        partnerCivId: targetCity.civId,
        tradePerTurn,
      });
      routeMsg = ` Trade route established (+${tradePerTurn}/turn).`;
    }

    this._addLog(`Trade delivery to ${targetCity.name}: +${goldReward} gold, +${sciReward} science!${routeMsg}`);
    this._emit('tradeDelivery', { unit, targetCity, gold: goldReward, science: sciReward, tradePerTurn: routeMsg ? tradePerTurn : 0 });
    this._removeUnit(unit);
    this._selectNextUnit();
    return true;
  }

  /**
   * Caravan/Freight contributes shields to a Wonder being built in a friendly city.
   * The unit is consumed.
   */
  contributeToWonder(unit, targetCity) {
    if (targetCity.civId !== unit.civId) return false;
    if (!targetCity.production || targetCity.production.type !== 'improvement') return false;
    const imp = IMPROVEMENTS[targetCity.production.id];
    if (!imp?.isWonder) return false;

    const uData = UNITS[unit.typeId];
    const contrib = uData.cost * 10;
    targetCity.shields += contrib;

    this._addLog(`${uData.name} contributes ${contrib} shields to ${imp.name} in ${targetCity.name}.`);
    this._removeUnit(unit);
    this._selectNextUnit();
    return true;
  }

  // ─── Diplomat / Spy Actions ────────────────────────────────────────────────

  /**
   * Determine whether an espionage action succeeds.
   * Base: Diplomat (typeId 46) 60%, Spy (typeId 47) 80%.
   * +10% if veteran. −10% if target city has Courthouse (id 7).
   */
  _espionageSuccess(unit, targetCity) {
    let chance = unit.typeId === 47 ? 0.8 : 0.6;
    if (unit.veteran) chance += 0.1;
    if (targetCity && this.civs[unit.civId]?.embassies?.has(targetCity.civId)) chance += 0.1;
    if (targetCity?.improvements?.has(7)) chance -= 0.1;
    return this.rng() < chance;
  }

  _onSpyCaught(unit, targetCivId) {
    this._emit('spyCaught', { unit });
    this.adjustAttitude(targetCivId, unit.civId, -20);
    if (!this.isAtWar(targetCivId, unit.civId) && unit.civId !== 0 && this.rng() < 0.33) {
      this._declareWarInternal(targetCivId, unit.civId);
    }
    this._removeUnit(unit);
    this._selectNextUnit();
  }

  /**
   * Establish an embassy with the target city's civilization.
   * Reveals all their cities (explored visibility). Unit survives.
   */
  establishEmbassy(unit, targetCity) {
    const uData = UNITS[unit.typeId];
    if (uData.role !== 6) return false;
    if (targetCity.civId === unit.civId) return false;

    const targetCivId = targetCity.civId;
    // Reveal all cities of target civ
    for (const city of this.cities) {
      if (city.civId !== targetCivId) continue;
      for (const t of this._tilesInRange(city.col, city.row, 2)) {
        if (this._visibility[t.row][t.col] === 0) {
          this._visibility[t.row][t.col] = 1; // explored
        }
      }
    }

    this.civs[unit.civId].embassies.add(targetCivId);
    this._addLog(`Embassy established with the ${this.civs[targetCivId]?.data?.plural ?? 'enemy'}!`);
    // Unit survives — just exhaust moves
    unit.movesLeft = 0;
    unit.status = 'done';
    this._selectNextUnit();
    return true;
  }

  /**
   * Steal a random technology from the target civilization.
   * Diplomat is always consumed; Spy has 50% survival chance.
   */
  stealAdvance(unit, targetCity) {
    const uData = UNITS[unit.typeId];
    if (uData.role !== 6) return false;

    const myCiv = this.civs[unit.civId];
    const theirCiv = this.civs[targetCity.civId];
    if (!myCiv || !theirCiv) return false;

    // Find advances they have that we don't
    const stealable = [];
    for (const advId of theirCiv.advances) {
      if (!myCiv.advances.has(advId)) stealable.push(advId);
    }
    if (stealable.length === 0) {
      this._addLog('Nothing to steal — they have no advances we lack.');
      return false;
    }

    // Espionage success check
    if (!this._espionageSuccess(unit, targetCity)) {
      this._addLog(`Our ${UNITS[unit.typeId]?.name ?? 'agent'} was caught and executed!`);
      this._onSpyCaught(unit, targetCity.civId);
      return false;
    }

    const stolenId = stealable[Math.floor(this.rng() * stealable.length)];
    myCiv.advances.add(stolenId);
    const advName = ADVANCES[stolenId]?.name ?? `Advance ${stolenId}`;
    this._addLog(`Stole ${advName} from the ${theirCiv.data?.plural ?? 'enemy'}!`);
    this._emit('advance', { civ: myCiv, advId: stolenId });

    // Diplomat always consumed; Spy has 50% survival chance
    if (uData.id === 47 && this.rng() < 0.5) {
      unit.movesLeft = 0;
      unit.status = 'done';
      this._selectNextUnit();
    } else {
      this._removeUnit(unit);
      this._selectNextUnit();
    }
    return true;
  }

  /**
   * Incite revolt in a target city — costs gold, city switches to diplomat's civ.
   * Cannot target capital (city with Palace id=1).
   */
  inciteRevolt(unit, targetCity) {
    const uData = UNITS[unit.typeId];
    if (uData.role !== 6) return false;
    if (targetCity.civId === unit.civId) return false;

    // Cannot incite capital (has Palace)
    if (targetCity.improvements.has(1)) {
      this._addLog('Cannot incite revolt in a capital city!');
      return false;
    }

    const dist = Math.abs(targetCity.col - unit.col) + Math.abs(targetCity.row - unit.row);
    const cost = Math.max(50, targetCity.size * 50 - dist * 5);

    const civ = this.civs[unit.civId];
    if (civ.gold < cost) {
      this._addLog(`Inciting revolt costs ${cost} gold — not enough!`);
      return false;
    }

    // Espionage success check
    if (!this._espionageSuccess(unit, targetCity)) {
      this._addLog(`Our ${UNITS[unit.typeId]?.name ?? 'agent'} was caught and executed!`);
      this._onSpyCaught(unit, targetCity.civId);
      return false;
    }

    civ.gold -= cost;
    targetCity.civId = unit.civId;
    targetCity.shields = 0;
    targetCity.production = null;
    targetCity.productionQueue = [];
    targetCity.manualWorked = null;
    if (unit.civId !== 0) this._aiPickProduction(targetCity);

    this._addLog(`Revolution in ${targetCity.name}! The city joins us! (cost: ${cost} gold)`);
    this._removeUnit(unit);
    this._selectNextUnit();
    this._updateVisibility();
    return true;
  }

  /**
   * Investigate city — peek at target city's details. Diplomat survives, Spy always survives.
   * Returns city info object for display.
   */
  investigateCity(unit, targetCity) {
    const uData = UNITS[unit.typeId];
    if (uData.role !== 6) return null;
    if (targetCity.civId === unit.civId) return null;

    const yields = this.cityYields(targetCity);
    const info = {
      name: targetCity.name,
      size: targetCity.size,
      improvements: [...targetCity.improvements].map(id => IMPROVEMENTS[id]?.name).filter(Boolean),
      production: targetCity.production,
      food: yields.food,
      shields: yields.shields,
      trade: yields.trade,
    };

    this._addLog(`Investigated ${targetCity.name}: size ${targetCity.size}, ${info.improvements.length} improvements.`);
    unit.movesLeft = 0;
    unit.status = 'done';
    this._selectNextUnit();
    return info;
  }

  /**
   * Sabotage production — destroys current production in target city.
   * Diplomat is consumed; Spy has 50% survival.
   */
  sabotageProduction(unit, targetCity) {
    const uData = UNITS[unit.typeId];
    if (uData.role !== 6) return false;
    if (targetCity.civId === unit.civId) return false;

    // Espionage success check
    if (!this._espionageSuccess(unit, targetCity)) {
      this._addLog(`Our ${UNITS[unit.typeId]?.name ?? 'agent'} was caught and executed!`);
      this._onSpyCaught(unit, targetCity.civId);
      return false;
    }

    const lostShields = targetCity.shields;
    targetCity.shields = 0;
    this._addLog(`Sabotage! ${targetCity.name} loses ${lostShields} production shields.`);

    // Diplomat always consumed; Spy 50% survival
    if (uData.id === 47 && this.rng() < 0.5) {
      unit.movesLeft = 0;
      unit.status = 'done';
      this._selectNextUnit();
    } else {
      this._removeUnit(unit);
      this._selectNextUnit();
    }
    return true;
  }

  /**
   * Poison water supply — reduce target city population by 1 (min 1).
   * Spy only (typeId 47). Spy has 50% survival.
   */
  poisonWater(unit, targetCity) {
    const uData = UNITS[unit.typeId];
    if (uData.id !== 47) return false;  // Spy only
    if (targetCity.civId === unit.civId) return false;
    if (targetCity.size <= 1) return false;

    // Espionage success check
    if (!this._espionageSuccess(unit, targetCity)) {
      this._addLog(`Our ${UNITS[unit.typeId]?.name ?? 'agent'} was caught and executed!`);
      this._onSpyCaught(unit, targetCity.civId);
      return false;
    }

    targetCity.size--;
    this._addLog(`Water poisoned in ${targetCity.name}! Population reduced to ${targetCity.size}.`);

    // 50% survival
    if (this.rng() < 0.5) {
      unit.movesLeft = 0;
      unit.status = 'done';
      this._selectNextUnit();
    } else {
      this._removeUnit(unit);
      this._selectNextUnit();
    }
    return true;
  }

  /**
   * Plant nuclear device — causes nuclear explosion at target city.
   * Spy only (typeId 47). Requires Manhattan Project. Spy is always consumed.
   */
  plantNuke(unit, targetCity) {
    const uData = UNITS[unit.typeId];
    if (uData.id !== 47) return false;  // Spy only
    if (targetCity.civId === unit.civId) return false;
    if (!this._manhattanBuilt) return false;

    // Espionage success check
    if (!this._espionageSuccess(unit, targetCity)) {
      this._addLog(`Our ${UNITS[unit.typeId]?.name ?? 'agent'} was caught and executed!`);
      this._onSpyCaught(unit, targetCity.civId);
      return false;
    }

    // Trigger nuclear strike at city
    this._nukeStrike(unit, targetCity.col, targetCity.row);
    this._addLog(`Nuclear device detonated in ${targetCity.name}!`);
    this._removeUnit(unit);
    this._selectNextUnit();
    return true;
  }

  /**
   * Calculate the gold cost to incite revolt in a city.
   */
  inciteRevoltCost(targetCity) {
    // Diplomat is on the city tile, so distance = 0
    return Math.max(50, targetCity.size * 50);
  }

  /**
   * Bribe an enemy unit — costs gold, unit switches to diplomat's civ.
   */
  bribeUnit(diplomatUnit, targetUnit) {
    const uData = UNITS[diplomatUnit.typeId];
    if (uData.role !== 6) return false;
    if (targetUnit.civId === diplomatUnit.civId) return false;

    let cost = UNITS[targetUnit.typeId].cost * 20;
    if (targetUnit.veteran) cost = Math.floor(cost * 1.5);
    cost = Math.floor(cost * targetUnit.hp / targetUnit.maxHp);
    const civ = this.civs[diplomatUnit.civId];
    if (civ.gold < cost) {
      this._addLog(`Bribing costs ${cost} gold — not enough!`);
      return false;
    }

    // Espionage success check (no target city for courthouse bonus)
    if (!this._espionageSuccess(diplomatUnit, null)) {
      this._addLog(`Our ${UNITS[diplomatUnit.typeId]?.name ?? 'agent'} was caught and executed!`);
      this._onSpyCaught(diplomatUnit, targetUnit.civId);
      return false;
    }

    civ.gold -= cost;
    targetUnit.civId = diplomatUnit.civId;
    this._addLog(`${UNITS[targetUnit.typeId].name} bribed for ${cost} gold!`);
    this._removeUnit(diplomatUnit);
    this._selectNextUnit();
    this._updateVisibility();
    return true;
  }

  /**
   * AI diplomat action: try to steal tech, otherwise establish embassy.
   */
  _aiDiplomatAction(unit, city) {
    const myCiv = this.civs[unit.civId];
    const theirCiv = this.civs[city.civId];
    if (!myCiv || !theirCiv) return;

    // Try to steal tech if they have something we don't
    for (const advId of theirCiv.advances) {
      if (!myCiv.advances.has(advId)) {
        this.stealAdvance(unit, city);
        return;
      }
    }
    // Otherwise establish embassy
    this.establishEmbassy(unit, city);
  }

  // ─── Logging & events ──────────────────────────────────────────────────────

  _addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
  }

  _emit(type, data) {
    this.onEvent?.(type, data);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Check whether a Settler unit can found a city at its current location.
   * @param {Unit} unit
   * @returns {boolean}
   */
  canFoundCity(unit) {
    if (UNITS[unit.typeId].role !== 5) return false;
    if (this.tiles[unit.row]?.[unit.col] === TERRAIN.OCEAN) return false;
    const forbidden = new Set(
      [{ col: unit.col, row: unit.row }, ...neighbours(unit.col, unit.row)]
        .map(n => `${n.col},${n.row}`)
    );
    return !this.cities.some(c => forbidden.has(`${c.col},${c.row}`));
  }

  /**
   * Suggest the default city name for a settler's civ.
   * @param {number} civId
   * @returns {string}
   */
  suggestCityName(civId) {
    const ownCount = this.cities.filter(c => c.civId === civId).length;
    const civsIdx  = this.civs[civId]?.data?.id ?? civId;
    const nameList = CITY_NAMES[civsIdx] ?? [];
    return nameList[ownCount]
      ?? EXTRA_CITIES[ownCount % EXTRA_CITIES.length]
      ?? `City ${this._nextCityId}`;
  }

  /**
   * Found a city with a Settler unit.
   * @param {Unit} unit — must be a Settler (role 5)
   * @param {string} [customName] — optional custom name (defaults to auto-generated)
   * @returns {City|false}
   */
  foundCity(unit, customName) {
    if (!this.canFoundCity(unit)) return false;

    const civId = unit.civId;
    const name  = customName || this.suggestCityName(civId);

    const city = new City({ id: this._nextCityId++, civId, col: unit.col, row: unit.row, name });

    // First city for a civ gets a free Palace (improvement 1)
    if (!this.cities.some(c => c.civId === civId)) {
      city.improvements.add(1);
    }

    // Pyramids (39): new city gets a free Granary if civ owns the Pyramids
    if (this._civHasWonder(civId, 39)) city.improvements.add(3);

    // In original Civ2, founding a city on Forest or Jungle clears terrain to Plains.
    // Swamp also becomes Plains. This prevents forest/jungle overlays from rendering under cities.
    const tId = this.tiles[unit.row]?.[unit.col];
    if (tId === TERRAIN.FOREST || tId === TERRAIN.JUNGLE || tId === TERRAIN.SWAMP) {
      this.tiles[unit.row][unit.col] = TERRAIN.PLAINS;
      // Clear any special resource on the tile since terrain changed
      if (this._resources) this._resources[unit.row][unit.col] = -1;
    }

    // City center tile always has a road (Civ2 rule — provides trade bonus)
    this._tileImprovements[unit.row][unit.col].road = true;

    this.cities.push(city);
    // Auto-queue first available unit (human cities will prompt if production stays null)
    if (civId !== 0) this._aiPickProduction(city);
    this._removeUnit(unit);
    this._addLog(`${name} founded!`);
    this._selectNextUnit();
    this._updateVisibility();
    return city;
  }

  /**
   * Select a unit belonging to the human player.
   * Clicking a fortified / sentry unit reactivates it first.
   */
  selectUnit(unit) {
    if (unit.civId !== 0) return;
    if (unit.status === 'fortified' || unit.status === 'sentry' || unit.status === 'sleep') unit.status = 'active';
    if (unit.movesLeft <= 0) return;
    this.activeUnit = unit;
  }

  /**
   * Cycle activeUnit to the next (or previous) friendly unit in the stack on
   * the active unit's tile. Bypasses the movesLeft check so exhausted units
   * can still be viewed / ordered.
   */
  cycleStack(direction = 1) {
    const au = this.activeUnit;
    if (!au) return;
    const stack = this.unitsAt(au.col, au.row).filter(u => u.civId === 0);
    if (stack.length <= 1) return;
    const idx  = stack.indexOf(au);
    const next = stack[((idx + direction) % stack.length + stack.length) % stack.length];
    // Force-reactivate so the unit is visible in the sidebar
    if (next.status === 'fortified' || next.status === 'sentry' || next.status === 'sleep') next.status = 'active';
    this.activeUnit = next;
  }

  /** Skip this unit for the current turn; it will be re-activated next turn. */
  skipUnit(unit) {
    if (unit.civId !== 0) return;
    unit.status = 'done';
    this._selectNextUnit();
  }

  /** Unload all cargo from a transport ship onto adjacent land tiles. */
  unloadAll(ship) {
    if (!ship.cargo || ship.cargo.length === 0) return 0;
    const adjLand = neighbours(ship.col, ship.row, this.mapCols)
      .filter(n => n.row >= 0 && n.row < this.mapRows && this.tiles[n.row][n.col] !== TERRAIN.OCEAN);
    if (adjLand.length === 0) return 0;
    let count = 0;
    for (const c of [...ship.cargo]) {
      const dest = adjLand[count % adjLand.length];
      c.inShip = null;
      ship.cargo = ship.cargo.filter(u => u !== c);
      c.col = dest.col;
      c.row = dest.row;
      c.status = 'active';
      c.movesLeft = 0;
      count++;
    }
    if (count > 0) {
      this._addLog(`Unloaded ${count} unit${count > 1 ? 's' : ''}.`);
      if (ship.civId === 0) this._updateVisibility();
    }
    return count;
  }

  /** Wait — defer this unit to later in the current turn. */
  waitUnit(unit) {
    if (unit.civId !== 0 || unit.movesLeft <= 0) return;
    this._waitingUnits.push(unit);
    this._selectNextUnit();
  }

  /** Fortify unit in place — stays fortified across turns until reactivated. */
  fortifyUnit(unit) {
    if (unit.civId !== 0) return;
    unit.status = 'fortified';
    this._selectNextUnit();
  }

  /**
   * Sentry: unit skips turns but wakes when an enemy enters visual range.
   * Sleep: unit skips turns indefinitely until manually clicked/activated.
   */
  sentryUnit(unit) {
    if (unit.civId !== 0) return;
    unit.status = 'sentry';
    this._selectNextUnit();
  }

  sleepUnit(unit) {
    if (unit.civId !== 0) return;
    unit.status = 'sleep';
    this._selectNextUnit();
  }

  /**
   * GoHome: navigate unit to its home city (or nearest owned city if no home city set).
   * Uses the existing GoTo pathfinding mechanism.
   */
  goHomeUnit(unit) {
    if (unit.civId !== 0) return;
    const ownCities = this.cities.filter(c => c.civId === 0);
    if (!ownCities.length) return;
    const home = unit.homeCity
      ? ownCities.find(c => c.id === unit.homeCity) ?? null
      : null;
    const target = home ?? ownCities.reduce((best, c) => {
      const d = Math.abs(c.col - unit.col) + Math.abs(c.row - unit.row);
      const bd = Math.abs(best.col - unit.col) + Math.abs(best.row - unit.row);
      return d < bd ? c : best;
    });
    this.startGoto(unit, target.col, target.row);
  }

  /**
   * Pillage a tile improvement under the unit.
   * Military land units can destroy one improvement on their current tile.
   * Returns { pillaged: string|null, gold: number }.
   */
  pillageUnit(unit) {
    const ud = UNITS[unit.typeId];
    if (!ud || ud.attack <= 0) return { pillaged: null, gold: 0 };
    if (unit.movesLeft <= 0) return { pillaged: null, gold: 0 };

    const imp = this._tileImprovements[unit.row]?.[unit.col];
    if (!imp) return { pillaged: null, gold: 0 };

    // Priority: railroad, road, irrigation, mine, fortress, airbase
    const pillageable = ['railroad', 'road', 'irrigation', 'mine', 'fortress', 'airbase'];
    let target = null;
    for (const key of pillageable) {
      if (imp[key]) { target = key; break; }
    }
    if (!target) return { pillaged: null, gold: 0 };

    imp[target] = false;
    // Railroad requires road — if we pillage railroad the road stays
    // If we pillage road, also remove railroad
    if (target === 'road' && imp.railroad) imp.railroad = false;

    unit.movesLeft = 0;
    const gold = Math.floor(this.rng() * 20) + 1;
    const civ = this.civs[unit.civId];
    if (civ) civ.gold += gold;

    this.log.unshift(`Pillaged ${target} (+${gold}g)`);
    this._emit('pillage', { unit, target, gold, col: unit.col, row: unit.row });
    return { pillaged: target, gold };
  }

  /**
   * Rebase an air unit — send it to a friendly city or airbase via GoTo.
   * @param {Unit} unit — air unit
   * @param {number} col — destination column
   * @param {number} row — destination row
   */
  rebaseUnit(unit, col, row) {
    const ud = UNITS[unit.typeId];
    if (!ud || ud.domain !== 1) return false;
    if (unit.movesLeft <= 0) return false;
    // Destination must be a friendly city or airbase
    const city = this.cityAt(col, row);
    const airbase = this._tileImprovements[row]?.[col]?.airbase ?? false;
    if (!city && !airbase) return false;
    if (city && city.civId !== unit.civId) return false;

    this.startGoto(unit, col, row);
    return true;
  }

  /**
   * Find nearest friendly city or airbase for an air unit (for auto-return).
   */
  _nearestAirBase(unit) {
    let best = null, bestDist = Infinity;
    for (const c of this.cities) {
      if (c.civId !== unit.civId) continue;
      const d = Math.abs(c.col - unit.col) + Math.abs(c.row - unit.row);
      if (d < bestDist) { best = { col: c.col, row: c.row }; bestDist = d; }
    }
    for (let r = 0; r < this.mapRows; r++) {
      for (let c = 0; c < this.mapCols; c++) {
        if (this._tileImprovements[r]?.[c]?.airbase) {
          const d = Math.abs(c - unit.col) + Math.abs(r - unit.row);
          if (d < bestDist) { best = { col: c, row: r }; bestDist = d; }
        }
      }
    }
    return best;
  }

  /**
   * Airlift a land unit from one city with an Airport to another city with an Airport.
   * Each city can only airlift one unit per turn (tracked per-city per-turn).
   * Unit must be land domain, standing on a friendly city with Airport (improvement 32).
   */
  airliftUnit(unit, destCity) {
    const ud = UNITS[unit.typeId];
    if (!ud || ud.domain !== 0) return false;        // land units only
    if (unit.movesLeft <= 0) return false;

    const srcCity = this.cityAt(unit.col, unit.row);
    if (!srcCity || srcCity.civId !== unit.civId) return false;
    if (!srcCity.improvements.has(32)) return false;  // source needs Airport
    if (!destCity || destCity.civId !== unit.civId) return false;
    if (!destCity.improvements.has(32)) return false;  // dest needs Airport
    if (srcCity.id === destCity.id) return false;

    // One airlift per city per turn
    if (srcCity._airliftUsedThisTurn) return false;
    if (destCity._airliftUsedThisTurn) return false;

    unit.col = destCity.col;
    unit.row = destCity.row;
    unit.movesLeft = 0;
    srcCity._airliftUsedThisTurn = true;
    destCity._airliftUsedThisTurn = true;

    this._addLog(`${ud.name} airlifted from ${srcCity.name} to ${destCity.name}.`);
    this._emit('airlift', { unit, srcCity, destCity });
    if (unit.civId === 0) this._updateVisibility();
    this._selectNextUnit();
    return true;
  }

  /**
   * Get list of valid airlift destination cities for a unit.
   */
  getAirliftTargets(unit) {
    const ud = UNITS[unit.typeId];
    if (!ud || ud.domain !== 0 || unit.movesLeft <= 0) return [];

    const srcCity = this.cityAt(unit.col, unit.row);
    if (!srcCity || srcCity.civId !== unit.civId) return [];
    if (!srcCity.improvements.has(32)) return [];
    if (srcCity._airliftUsedThisTurn) return [];

    return this.cities.filter(c =>
      c.civId === unit.civId &&
      c.id !== srcCity.id &&
      c.improvements.has(32) &&
      !c._airliftUsedThisTurn
    );
  }

  /**
   * Check if a unit can paradrop and return valid drop tiles.
   * Paratroopers: domain=0, flags&PARADROP bit set.
   * Can drop within COSMIC.paradropRange of any friendly city.
   * @param {Unit} unit
   * @returns {{ canParadrop: boolean, validTiles: {col,row}[] }}
   */
  getParadropInfo(unit) {
    const unitData = UNITS[unit.typeId];
    if (!unitData || unitData.domain !== 0 || !(unitData.flags & FLAGS.PARADROP)) {
      return { canParadrop: false, validTiles: [] };
    }
    if (unit.movesLeft <= 0) return { canParadrop: false, validTiles: [] };

    const range = COSMIC.paradropRange;
    const ownCities = this.cities.filter(c => c.civId === unit.civId);
    if (!ownCities.length) return { canParadrop: false, validTiles: [] };

    const validTiles = [];
    for (let r = 0; r < this.mapRows; r++) {
      for (let c = 0; c < this.mapCols; c++) {
        const tile = this.tiles[r][c];
        if (!tile || tile === TERRAIN.OCEAN) continue;
        // Must be within range of at least one friendly city (Chebyshev distance)
        const inRange = ownCities.some(city => {
          const dr = Math.abs(r - city.row);
          const dc = Math.min(Math.abs(c - city.col), this.mapCols - Math.abs(c - city.col));
          return Math.max(dr, dc) <= range;
        });
        if (inRange) validTiles.push({ col: c, row: r });
      }
    }
    return { canParadrop: true, validTiles };
  }

  /**
   * Execute a paradrop to (col, row).
   * Costs all remaining moves. Attacks if enemy on tile.
   * @param {Unit} unit
   * @param {number} col
   * @param {number} row
   * @returns {boolean} success
   */
  paradropUnit(unit, col, row) {
    col = this._wrapCol(col);
    if (row < 0 || row >= this.mapRows) return false;

    const unitData = UNITS[unit.typeId];
    if (!unitData || unitData.domain !== 0 || !(unitData.flags & FLAGS.PARADROP)) return false;
    if (unit.movesLeft <= 0) return false;

    const tile = this.tiles[row][col];
    if (!tile || tile === TERRAIN.OCEAN) return false;

    // Verify in range of a friendly city
    const { canParadrop, validTiles } = this.getParadropInfo(unit);
    if (!canParadrop) return false;
    const inRange = validTiles.some(t => t.col === col && t.row === row);
    if (!inRange) return false;

    // Attack if enemy present (select best defender)
    const anyEnemy = this.units.find(u => u.col === col && u.row === row && u.civId !== unit.civId);
    const enemy = anyEnemy ? this._selectBestDefender(unit, col, row) : null;
    if (anyEnemy) {
      this._declareWarInternal(unit.civId, anyEnemy.civId);
    }

    const fromCol = unit.col, fromRow = unit.row;
    unit.col      = col;
    unit.row      = row;
    unit.movesLeft = 0;
    unit.status   = 'done';

    if (unit.civId === 0) this._updateVisibility();
    this._addLog(`${unitData.name} paradropped to (${col}, ${row}).`);
    this._emit('unitMoved', { unit, fromCol, fromRow, toCol: col, toRow: row });

    if (enemy) {
      this._combat(unit, enemy);
    } else {
      this._selectNextUnit();
    }
    return true;
  }

  /** Remove unit from the game. Credit 50% of unit cost as shields to nearest friendly city. */
  disbandUnit(unit) {
    if (unit.civId !== 0) return;
    const unitData = UNITS[unit.typeId];
    const shieldCredit = Math.floor((unitData?.cost ?? 0) * COSMIC.shieldRows / 2);
    if (shieldCredit > 0) {
      let city = this.cities.find(c => c.civId === unit.civId && c.col === unit.col && c.row === unit.row);
      if (!city) {
        let minDist = Infinity;
        for (const c of this.cities) {
          if (c.civId !== unit.civId) continue;
          const dx = Math.abs(c.col - unit.col), dy = Math.abs(c.row - unit.row);
          const d = dx + dy;
          if (d < minDist) { minDist = d; city = c; }
        }
      }
      if (city) city.shields += shieldCredit;
    }
    this._addLog(`${unitData?.name ?? 'Unit'} disbanded.`);
    this._emit('unitDisbanded', { unit });
    this._removeUnit(unit);
    this._selectNextUnit();
  }

  /**
   * Attempt to move `unit` to (col, row).
   * If an enemy occupies the target tile, attacks instead.
   * @returns {boolean}
   */
  moveUnit(unit, col, row) {
    col = this._wrapCol(col); // horizontal wrap
    if (row < 0 || row >= this.mapRows) return false;

    const tile     = this.tiles[row][col];
    const unitData = UNITS[unit.typeId];
    const isAir    = unitData.domain === 1;

    // Sea ships can't move to non-ocean tiles (land units can move to ocean to embark)
    if (!isAir && unitData.domain === 2 && tile !== TERRAIN.OCEAN) return false;
    // Ground unit moving to ocean: must board a ship
    if (!isAir && unitData.domain === 0 && tile === TERRAIN.OCEAN) {
      // If this unit is already aboard a ship and moves to adjacent ocean, it's trying to
      // move within the ship — not allowed (must disembark to land).
      if (unit.inShip) return false;
      const ship = this.units.find(u =>
        u.col === col && u.row === row &&
        u.civId === unit.civId &&
        UNITS[u.typeId].domain === 2 &&
        UNITS[u.typeId].holds > u.cargo.length
      );
      if (!ship) return false; // no ship available to board
      // Embark: consume all remaining moves (boarding uses full turn)
      const fromCol = unit.col, fromRow = unit.row;
      unit.col      = col;
      unit.row      = row;
      unit.movesLeft = 0;
      unit.status   = 'sleep';
      unit.inShip   = ship;
      ship.cargo.push(unit);
      if (unit.civId === 0) this._updateVisibility();
      this._addLog(`${UNITS[unit.typeId].name} boarded ${UNITS[ship.typeId].name}.`);
      this._emit('unitMoved', { unit, fromCol, fromRow, toCol: col, toRow: row });
      this._selectNextUnit();
      return true;
    }
    // Ground unit aboard a ship moving to land: disembark
    if (!isAir && unitData.domain === 0 && unit.inShip && tile !== TERRAIN.OCEAN) {
      const ship = unit.inShip;
      ship.cargo = ship.cargo.filter(u => u !== unit);
      unit.inShip = null;
      // Continue with normal move below
    }
    if (!this._isAdjacent(unit.col, unit.row, col, row))  return false;
    if (unit.movesLeft <= 0)                               return false;

    // Nuclear Missile (typeId=45): area-effect nuke strike instead of normal combat
    if (unitData.id === 45) {
      return this._nukeStrike(unit, col, row);
    }

    // Trade units (role=7) and Diplomats/Spies (role=6) can't attack
    const anyEnemy = this.units.find(u => u.col === col && u.row === row && u.civId !== unit.civId);
    if (anyEnemy) {
      if (unitData.role === 7) { this._addLog('Caravans cannot attack.'); return false; }
      if (unitData.role === 6) { this._addLog('Diplomats cannot attack.'); return false; }
      // Select best defender (highest defense factor, excluding cargo units)
      const enemy = this._selectBestDefender(unit, col, row);
      if (!enemy) return false;
      // Submarines can only be attacked by units with the SPOT_SUB flag
      if (UNITS[enemy.typeId].flags & FLAGS.SUBMARINE) {
        if (!(unitData.flags & FLAGS.SPOT_SUB)) {
          this._addLog(`${unitData.name} cannot attack submarines.`);
          return false;
        }
      }
      this._declareWarInternal(unit.civId, enemy.civId);
      return this._combat(unit, enemy);
    }

    // Move — costs in "road units" (maxMoves = data.move × COSMIC.roadMultiplier)
    const uFlags = unitData.flags ?? 0;
    const srcImp = this._tileImprovements[unit.row][unit.col];
    const dstImp = this._tileImprovements[row][col];
    // ALPINE: treat all terrain as moveCost=1; road on both ends → 1 unit; else scale
    const baseCost = (uFlags & FLAGS.ALPINE) ? 1 : tile.moveCost;
    // Railroad on both ends: free movement (M1); road on both ends: 1 unit; else scale
    let moveCost;
    if (srcImp.railroad && dstImp.railroad) moveCost = 0;
    else if (srcImp.road && dstImp.road)    moveCost = 1;
    else                                    moveCost = baseCost * COSMIC.roadMultiplier;

    // River movement: diagonal moves between two river tiles cost riverMovement (axx0 MovementFunctions.cs:681-686)
    const isDiagonal = Math.abs(col - unit.col) === 1 && Math.abs(row - unit.row) === 1;
    if (isDiagonal && this._rivers[unit.row]?.[unit.col] > 0 && this._rivers[row]?.[col] > 0
        && COSMIC.riverMovement < moveCost) {
      moveCost = COSMIC.riverMovement;
    }

    // Zone of Control (axx0 MovementFunctions.cs line 450):
    // Block movement if: unit doesn't ignore ZOC AND destination is not friendly AND
    // source tile is adjacent to an enemy ground unit AND dest tile is adjacent to an enemy ground unit.
    // Air and Sea units always ignore ZOC (per IgnoreZonesOfControl = flags[1] || air || sea).
    const isFriendlyDest = this.units.some(u => u.civId === unit.civId && u.col === col && u.row === row)
                        || this.cityAt(col, row)?.civId === unit.civId;
    if (!(uFlags & FLAGS.IGNORE_ZOC)
        && unitData.domain === 0
        && !isFriendlyDest
        && this._isInEnemyZoc(unit.civId, unit.col, unit.row)
        && this._isInEnemyZoc(unit.civId, col, row)) {
      return false; // blocked by ZOC
    }

    const fromCol = unit.col;
    const fromRow = unit.row;
    unit.col = col;
    unit.row = row;
    // Cargo moves with the ship
    for (const cargo of unit.cargo) {
      cargo.col = col;
      cargo.row = row;
    }
    // Auto-embark: when a ship departs, pick up unboarded ground units from the source tile
    // (axx0 MovementFunctions.cs:529-554)
    if (unitData.domain === 2 && unitData.holds > 0 && unit.cargo.length < unitData.holds) {
      const fromTile = this.tiles[fromRow][fromCol];
      const isFromOcean = fromTile === TERRAIN.OCEAN;
      const isFromCity = !!this.cityAt(fromCol, fromRow);
      if (isFromOcean || isFromCity) {
        const candidates = this.units.filter(u =>
          u.col === fromCol && u.row === fromRow &&
          u.civId === unit.civId &&
          UNITS[u.typeId].domain === 0 &&
          !u.inShip &&
          (isFromOcean || u.status === 'sleep')
        );
        const space = unitData.holds - unit.cargo.length;
        for (let i = 0; i < Math.min(candidates.length, space); i++) {
          const passenger = candidates[i];
          passenger.inShip = unit;
          passenger.col = col;
          passenger.row = row;
          if (isFromCity) passenger.status = 'sleep';
          unit.cargo.push(passenger);
        }
      }
    }
    unit.movesLeft = Math.max(0, unit.movesLeft - moveCost);
    if (unit.movesLeft === 0) {
      unit.status = 'done';
      this._selectNextUnit();
    }
    if (unit.civId === 0) this._updateVisibility();
    this._emit('unitMoved', { unit, fromCol, fromRow, toCol: col, toRow: row });

    // Entering an undefended enemy city captures it. Previously capture was
    // only reached through the combat-victory branch, leaving empty cities
    // impossible to take (and blocking naval invasions).
    const enteredCity = this.cityAt(col, row);
    if (enteredCity && enteredCity.civId !== unit.civId && unitData.domain === 0 && (unitData.attack ?? 0) > 0) {
      this._declareWarInternal(unit.civId, enteredCity.civId);
      if (unit.civId === 0) this._emit('cityCapture', { city: enteredCity });
      else this._captureCity(enteredCity, unit.civId);
    }

    // Goody hut pickup (land units only; air units don't pick up huts)
    if (!isAir && this._tileImprovements[row][col].hut) {
      this._goodyHutReward(unit, col, row);
    }

    // Trade unit (role=7) arrival at a city
    if (unitData.role === 7) {
      const city = this.cityAt(col, row);
      if (city && city.civId !== unit.civId) {
        // Foreign city — deliver trade
        if (unit.civId === 0) {
          this._emit('tradeArrival', { unit, city });
        } else {
          this.deliverTrade(unit, city);
        }
      } else if (city && city.civId === unit.civId) {
        // Own city — could contribute to wonder
        if (unit.civId === 0 && city.production?.type === 'improvement' &&
            IMPROVEMENTS[city.production.id]?.isWonder) {
          this._emit('tradeArrival', { unit, city });
        }
      }
    }

    // Diplomat/Spy (role=6) arrival at enemy city
    if (unitData.role === 6) {
      const city = this.cityAt(col, row);
      if (city && city.civId !== unit.civId) {
        if (unit.civId === 0) {
          executeEvents(this, 'negotiation', {
            talkerCivId: unit.civId,
            listenerCivId: city.civId,
            talkerType: 1,
            listenerType: 2,
          });
          this._emit('diplomatArrival', { unit, city });
        } else {
          executeEvents(this, 'negotiation', {
            talkerCivId: unit.civId,
            listenerCivId: city.civId,
            talkerType: 2,
            listenerType: city.civId === 0 ? 1 : 2,
          });
          this._aiDiplomatAction(unit, city);
        }
      }
    }

    return true;
  }

  _isAdjacent(fromCol, fromRow, toCol, toRow) {
    return neighbours(fromCol, fromRow, this.mapCols).some(n => n.col === toCol && n.row === toRow);
  }

  /** Public wrapper around the module-level neighbours() function. */
  _getNeighbours(col, row) {
    return neighbours(col, row, this.mapCols);
  }

  /**
   * Nuclear Missile area-effect strike.
   * SDI Defense (improvement 17) in target city gives 50% interception chance.
   * On hit: affects 3×3 blast radius — destroys units, damages cities, adds fallout,
   * removes tile improvements, contributes to global pollution.
   * The missile itself is always destroyed.
   */
  _nukeStrike(attacker, col, row) {
    const c = this._wrapCol(col);

    // SDI Defense (improvement 17): 50% chance to intercept if target city has SDI
    const targetCity = this.cityAt(c, row);
    if (targetCity && targetCity.improvements.has(17)) {
      if (this.rng() < 0.5) {
        this._addLog(`SDI Defense in ${targetCity.name} intercepts nuclear missile!`);
        this._removeUnit(attacker);
        this._emit('nukeIntercepted', { col: c, row, cityName: targetCity.name });
        return true;
      }
    }

    // Blast radius: target tile + all 8 adjacent tiles (3×3 area)
    const blastTiles = [{ col: c, row }];
    const nbrs = neighbours(c, row, this.mapCols);
    for (const n of nbrs) {
      if (n.row >= 0 && n.row < this.mapRows) {
        blastTiles.push({ col: this._wrapCol(n.col), row: n.row });
      }
    }

    let pollutionAdded = 0;
    for (const tile of blastTiles) {
      const tc = tile.col;
      const tr = tile.row;

      // Destroy all units on this tile (friend and foe — nukes don't discriminate)
      const targets = this.units.filter(u => u.col === tc && u.row === tr);
      for (const u of [...targets]) {
        if (u === attacker) continue;
        this._removeUnit(u);
      }

      // Damage any city on this tile
      const city = this.cityAt(tc, tr);
      if (city) {
        // Halve city size (minimum 1)
        const newSize = Math.max(1, Math.floor(city.size / 2));
        city.size = newSize;
        // Remove one random non-wonder improvement
        const imps = [...city.improvements].filter(id => id < 39);
        if (imps.length > 0) {
          const toRemove = imps[Math.floor(this.rng() * imps.length)];
          city.improvements.delete(toRemove);
        }
      }

      // Clear tile improvements and set fallout (not on ocean)
      if (this.tiles[tr]?.[tc] && this.tiles[tr][tc] !== TERRAIN.OCEAN) {
        const imp = this._tileImprovements[tr][tc];
        imp.road        = false;
        imp.railroad    = false;
        imp.irrigation  = false;
        imp.mine        = false;
        imp.fallout     = true;
        pollutionAdded++;
      }
    }

    // Global pollution contribution from nuke
    this._pollutionCount = (this._pollutionCount ?? 0) + pollutionAdded;

    // Destroy the missile
    this._addLog(`Nuclear strike at (${c},${row})! ${blastTiles.length} tiles affected.`);
    this._removeUnit(attacker);
    this._emit('nukeStrike', { col: c, row, blastTiles });
    return true;
  }

  /**
   * Return true if (col, row) is within the Zone of Control of an enemy military unit.
   * A tile is in ZOC if any enemy unit with attack > 0 (at war) is adjacent to it.
   * @param {number} civId  — the moving unit's civilisation
   */
  _isInEnemyZoc(civId, col, row) {
    for (const u of this.units) {
      if (u.civId === civId) continue;
      if (u.inShip) continue;                        // units aboard ships don't exert ZOC
      if (!this.isAtWar(civId, u.civId)) continue;
      if ((UNITS[u.typeId]?.attack ?? 0) === 0) continue;
      if (UNITS[u.typeId]?.domain !== 0) continue;  // only land units exert ZOC
      if (this._isAdjacent(u.col, u.row, col, row)) return true;
    }
    return false;
  }

  /**
   * Returns true if any city owned by civId has the given wonder built.
   * @param {number} civId
   * @param {number} wonderId
   */
  _civHasWonder(civId, wonderId) {
    return this.cities.some(c => c.civId === civId && c.improvements.has(wonderId));
  }

  /**
   * Leonardo's Workshop: auto-upgrade all obsolete units for the given civ.
   * Finds successor = cheapest buildable non-obsolete unit in same domain with higher cost.
   */
  _leonardoUpgradeAll(civ) {
    const obsoleteUnits = this.units.filter(u =>
      u.civId === civ.id && u.obsolete
    );
    for (const u of obsoleteUnits) {
      const data = UNITS[u.typeId];
      if (!data) continue;
      // Find successor: cheapest buildable unit in same domain, higher cost, not itself obsolete
      let best = null;
      for (const candidate of UNITS) {
        if (candidate.domain !== data.domain) continue;
        if (candidate.id === u.typeId) continue;
        if (candidate.cost <= data.cost) continue;
        if (candidate.prereq !== -1 && !civ.advances.has(candidate.prereq)) continue;
        if (candidate.obsoletedBy !== -1 && civ.advances.has(candidate.obsoletedBy)) continue;
        if (!best || candidate.cost < best.cost) best = candidate;
      }
      if (best) {
        const oldName     = data.name;
        u.typeId          = best.id;
        u.maxMoves        = best.move * COSMIC.roadMultiplier;
        u.maxHp           = best.hp * 10;
        u.hp              = Math.min(u.hp, u.maxHp);
        u.obsolete        = false;
        this._addLog(`Leonardo's Workshop upgrades ${oldName} to ${best.name}!`);
      }
    }
  }

  // ─── Territory History (for end-game replay map) ──────────────────────────

  /**
   * Record a snapshot of which civ owns each tile (via city BFC).
   * Stored as a flat Uint8Array (one byte per tile, 255 = unowned).
   * Only record every 5 turns to save memory.
   */
  _recordTerritorySnapshot() {
    if (this.turn % 5 !== 0 && this.turn !== 1) return;
    const owners = new Uint8Array(this.mapRows * this.mapCols).fill(255);
    for (const city of this.cities) {
      for (const t of cityRadius(city.col, city.row)) {
        if (t.row < 0 || t.row >= this.mapRows) continue;
        const c = this._wrapCol(t.col);
        owners[t.row * this.mapCols + c] = city.civId;
      }
    }
    this._territoryHistory.push({ turn: this.turn, owners });
  }

  /**
   * Get territory history for replay animation.
   * @returns {Array<{turn: number, owners: Uint8Array}>}
   */
  get territoryHistory() { return this._territoryHistory; }

  // ─── Commodity Supply / Demand ────────────────────────────────────────────

  /**
   * Determine which 3 commodities a city supplies based on its terrain and size.
   * Uses a deterministic hash so results are stable.
   * @param {City} city
   * @returns {string[]}
   */
  cityCommoditySupply(city) {
    const hash = (city.col * 31 + city.row * 17 + city.size) & 0xFFFF;
    const result = [];
    for (let i = 0; i < 3; i++) {
      result.push(COMMODITIES[(hash + i * 5) % COMMODITIES.length]);
    }
    return result;
  }

  /**
   * Determine which 3 commodities a city demands.
   * Offset from supply so there's no overlap.
   * @param {City} city
   * @returns {string[]}
   */
  cityCommodityDemand(city) {
    const hash = (city.col * 13 + city.row * 29 + city.size * 3) & 0xFFFF;
    const result = [];
    for (let i = 0; i < 3; i++) {
      result.push(COMMODITIES[(hash + i * 7 + 8) % COMMODITIES.length]);
    }
    return result;
  }

  // ─── City Governor (Auto-manage) ──────────────────────────────────────────

  /**
   * Toggle city governor on/off. When active, auto-assigns workers each turn.
   * @param {City} city
   */
  toggleCityGovernor(city) {
    city.governor = !city.governor;
    if (city.governor) {
      city.manualWorked = null; // clear manual overrides
      this._emit('cityGovernorChanged', { city, enabled: true });
    } else {
      this._emit('cityGovernorChanged', { city, enabled: false });
    }
  }

  /**
   * Auto-assign city workers to maximise food first (avoid starvation),
   * then shields, then trade. Called during city processing if governor is active.
   * @param {City} city
   */
  _governorAssignWorkers(city) {
    if (!city.governor) return;
    // Clear any manual overrides — governor takes over
    city.manualWorked = null;
    // The existing auto-assignment in cityWorkedTileSet already optimises
    // by yield priority (food > shields > trade). Governor just ensures
    // manual overrides don't interfere.
    // Additionally, governor adjusts specialists: if food surplus < 0,
    // remove entertainers; if we have excess food, add scientists.
    const yields = this.cityYields(city);
    const foodNeeded = city.size * 2;
    if (yields.food < foodNeeded && city.specialists.entertainer > 0) {
      city.specialists.entertainer = Math.max(0, city.specialists.entertainer - 1);
    } else if (yields.food > foodNeeded + 4 && city.size > 4) {
      // Excess food — add a scientist if possible
      const totalSpec = city.specialists.entertainer + city.specialists.taxCollector + city.specialists.scientist;
      if (totalSpec < city.size - 1) {
        city.specialists.scientist++;
      }
    }
  }

  /**
   * Auto-assign a new citizen to the best available tile when city grows.
   * If manualWorked is set, add the best unworked tile to it.
   */
  _autoAssignNewWorker(city) {
    if (city.manualWorked === null) return; // auto-assignment handles it
    const ring = cityRadius(city.col, city.row).filter(t =>
      t.row >= 0 && t.row < this.mapRows && !(t.row === city.row && t.col === city.col)
    );
    const otherCities = this.cities.filter(c => c.id !== city.id);
    const worked = new Set(city.manualWorked);
    let best = null, bestVal = -1;
    for (const t of ring) {
      const key = `${t.row},${t.col}`;
      if (worked.has(key)) continue;
      // Skip tiles worked by other cities
      const blocked = otherCities.some(oc => {
        const ow = this.cityWorkedTileSet(oc);
        return ow.has(key);
      });
      if (blocked) continue;
      const ter = this.tiles[t.row]?.[t.col];
      if (!ter) continue;
      const val = (ter.food ?? 0) * 3 + (ter.shields ?? 0) * 2 + (ter.trade ?? 0);
      if (val > bestVal) { bestVal = val; best = key; }
    }
    if (best) city.manualWorked.add(best);
  }

  /**
   * Remove the lowest-value worked tile when city shrinks.
   * If manualWorked is set, remove the worst tile. Also reduces specialists if needed.
   */
  _autoRemoveWorker(city) {
    if (city.manualWorked === null) return; // auto-assignment handles it
    // If there are specialists, remove one first (entertainer > taxCollector > scientist)
    if (city.specialists.entertainer > 0) { city.specialists.entertainer--; return; }
    if (city.specialists.taxCollector > 0) { city.specialists.taxCollector--; return; }
    if (city.specialists.scientist > 0) { city.specialists.scientist--; return; }
    // Otherwise remove worst worked tile
    let worst = null, worstVal = Infinity;
    for (const key of city.manualWorked) {
      const [r, c] = key.split(',').map(Number);
      const ter = this.tiles[r]?.[c];
      if (!ter) continue;
      const val = (ter.food ?? 0) * 3 + (ter.shields ?? 0) * 2 + (ter.trade ?? 0);
      if (val < worstVal) { worstVal = val; worst = key; }
    }
    if (worst) city.manualWorked.delete(worst);
  }

  // ─── Palace Level ─────────────────────────────────────────────────────────

  /**
   * Get the palace level for a civ (0-5) based on their era progress.
   * Level advances when civ reaches new epoch milestones.
   * @param {number} civIdx
   * @returns {number}
   */
  palaceLevel(civIdx) {
    const civ = this.civs[civIdx];
    if (!civ) return 0;
    // Count advances to determine era
    const advCount = civ.advances.size;
    if (advCount >= 80) return 5; // Space age
    if (advCount >= 60) return 4; // Modern
    if (advCount >= 40) return 3; // Industrial
    if (advCount >= 20) return 2; // Renaissance
    if (advCount >= 8)  return 1; // Classical
    return 0; // Ancient
  }

  /** Throne decoration category names. */
  static get THRONE_CATEGORIES() {
    return ['floor', 'walls', 'throne', 'entrance', 'columns', 'windows', 'guards', 'banner'];
  }

  /**
   * Offer a throne decoration upgrade to the human player.
   * Called on wonder completion, era advancement.
   * Only offers categories that haven't hit max tier (3).
   */
  _offerThroneUpgrade() {
    const avail = GameState.THRONE_CATEGORIES.filter(
      cat => (this._throneDecorations[cat] ?? 0) < 3
    );
    if (avail.length === 0) return;
    this._pendingThroneOffer = avail;
    this._emit('throneUpgrade', { categories: avail });
  }

  /**
   * Apply a throne decoration choice.
   * @param {string} category — one of THRONE_CATEGORIES
   */
  applyThroneDecoration(category) {
    if (!this._throneDecorations) return;
    const current = this._throneDecorations[category] ?? 0;
    if (current < 3) {
      this._throneDecorations[category] = current + 1;
    }
    this._pendingThroneOffer = null;
  }

  /**
   * End the human player's turn, run AI passes, begin next human turn.
   */
  endTurn() {
    if (this.gameOver) return;   // frozen after end

    for (const u of this.units) {
      if (u.civId === this.activeCivIdx && u.status === 'active') u.status = 'done';
    }

    do {
      this.activeCivIdx = (this.activeCivIdx + 1) % this.civs.length;
      if (this.activeCivIdx === 0) {
        this.turn++;
        const living = this.civs.filter(c => c?.alive && c.id !== this.barbarianCivIdx);
        const worldAtPeace = living.every((civ, i) =>
          living.slice(i + 1).every(other => civ.relations.get(other.id) !== 'war')
        );
        this._worldPeaceTurns = worldAtPeace ? (this._worldPeaceTurns ?? 0) + 1 : 0;
        this._processTurn();
      }
      this._beginCivTurn(this.activeCivIdx);
      if (this.activeCivIdx !== 0) this._doAiTurn(this.activeCivIdx);
    } while (this.activeCivIdx !== 0);

    this._checkVictory();
    this._selectNextUnit();
    this._updateVisibility();
  }

  /** Find next city with a pending issue (disorder, starvation, production complete). */
  findNextActionCity(afterCityId = -1) {
    const playerCities = this.cities.filter(c => c.civId === 0);
    if (playerCities.length === 0) return null;

    // Start searching after the given city
    let startIdx = 0;
    if (afterCityId >= 0) {
      const idx = playerCities.findIndex(c => c.id === afterCityId);
      if (idx >= 0) startIdx = idx + 1;
    }

    // Check for cities with issues: disorder, no production set
    for (let i = 0; i < playerCities.length; i++) {
      const c = playerCities[(startIdx + i) % playerCities.length];
      if (c.disorder) return c;
      if (!c.production || c.production.id < 0) return c;
    }

    // No urgent cities — just cycle to next
    if (playerCities.length > 0) {
      return playerCities[startIdx % playerCities.length];
    }
    return null;
  }

  /** Return the original Civ2 raw-score components for one civilization. */
  scoreBreakdown(civIdx = 0) {
    const civ = this.civs[civIdx];
    if (!civ) {
      return { happy: 0, content: 0, specialists: 0, citizens: 0, wonderIds: [], wonders: 0,
        spaceship: 0, pollution: 0, peace: 0, futureTechnology: 0, barbarians: 0,
        achievements: 0, total: 0 };
    }

    const cities = this.cities.filter(city => city.civId === civIdx);
    let happy = 0, content = 0, specialists = 0;
    for (const city of cities) {
      const h = this.cityHappiness(city);
      const workerCount = this._numWorkers(city);
      const scoredHappy = Math.min(workerCount, Math.max(0, h.happy));
      const scoredContent = Math.min(workerCount - scoredHappy, Math.max(0, h.content));
      happy += scoredHappy;
      content += scoredContent;
      specialists += Math.max(0, city.size - workerCount);
    }
    const citizens = happy * 2 + content + specialists;

    const wonderIds = [...new Set(cities.flatMap(city => [...city.improvements]
      .filter(id => IMPROVEMENTS[id]?.isWonder)))].sort((a, b) => a - b);
    const wonders = wonderIds.length * 20;

    let pollutedTiles = 0;
    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        if (this._tileImprovements[row][col].pollution) pollutedTiles++;
      }
    }
    const pollution = pollutedTiles * -10;
    const peace = Math.min(100, Math.max(0, this._worldPeaceTurns ?? 0) * 3);
    const futureTechnology = Math.max(0, civ.futureTechCount ?? 0) * 5;
    const barbarians = ({ none: -50, sedentary: -25, restless: 0, raging: 25 })[this.barbarians] ?? 0;
    // This implementation launches only a complete ship, which receives the
    // original maximum 400-point spaceship award.
    const spaceship = civIdx === 0 && this.gameOver?.result === 'space-win' ? 400 : 0;
    const achievements = spaceship + pollution + peace + futureTechnology + barbarians;

    return {
      happy, content, specialists, citizens, wonderIds, wonders,
      spaceship, pollution, peace, futureTechnology, barbarians,
      achievements, total: citizens + wonders + achievements,
    };
  }

  /** Compute the human player's current raw Civilization Score. */
  score() {
    return this.scoreBreakdown(0).total;
  }

  /**
   * Check end-game conditions after each turn.
   * Sets this.gameOver when the game ends.
   */
  _checkVictory() {
    // Scenario max turns check
    if (this._maxTurns > 0 && this.turn >= this._maxTurns) {
      const humanScore = this.score();
      const result = humanScore > 0 ? 'score-win' : 'score-lose';
      this.gameOver = { result, score: humanScore };
      this._addLog(`Scenario ends after ${this._maxTurns} turns!`);
      this._emit('gameOver', this.gameOver);
      return;
    }

    const humanCities = this.cities.filter(c => c.civId === 0);
    const humanUnits  = this.units.filter(u => u.civId === 0);

    // Defeat: human has nothing left
    if (humanCities.length === 0 && humanUnits.length === 0) {
      this.gameOver = { result: 'lose', score: this.score() };
      this._emit('gameOver', this.gameOver);
      return;
    }

    // UN Diplomatic Victory: if an AI civ built the UN and calls an election and wins,
    // that triggers a loss for the human. The AI auto-calls the election when building.
    // (Human election is triggered manually via proposeUnElection.)
    // Check if any AI civ holds the UN and the election hasn't happened yet.
    if (!this._unElectionUsed) {
      for (const civ of this.civs.slice(1)) {
        if (!civ || !civ.alive || civ.id === this.barbarianCivIdx) continue;
        if (!this._civHasWonder(civ.id, 63)) continue;
        // AI built UN: auto-call election
        this._unElectionUsed = true;
        const livingAI = this.civs.slice(1).filter(c => c && c.alive && c.id !== this.barbarianCivIdx && c.id !== civ.id);
        const humanCiv = this.civs[0];
        let forVotes = 0, againstVotes = 0;
        for (const voter of livingAI) {
          if ((voter.attitude.get(civ.id) ?? 0) >= 0) forVotes++;
          else againstVotes++;
        }
        // Human player also votes — negative attitude means voting against AI
        const humanAtt = humanCiv ? (humanCiv.attitude.get(civ.id) ?? 0) : 0;
        if (humanAtt >= 0) forVotes++; else againstVotes++;
        const won = forVotes > againstVotes;
        if (won) {
          this._addLog(`${civ.data.plural} win the UN election and become World Leader!`);
          this.gameOver = { result: 'diplomatic-lose', score: this.score() };
          this._emit('gameOver', this.gameOver);
          this._emit('unElection', { won: true, winner: civ.id });
          return;
        } else {
          this._addLog(`${civ.data.plural} called a UN election but failed to gain majority.`);
          this._emit('unElection', { won: false, winner: civ.id });
        }
      }
    }

    // Elimination victory: all AI civs extinct (no cities, no units)
    // Barbarians are excluded — you don't need to eliminate them to win
    const allAiDead = this.civs.slice(1).every(civ => {
      if (civ.id === this.barbarianCivIdx) return true; // skip barbarians
      const alive = this.cities.some(c => c.civId === civ.id)
                 || this.units.some(u => u.civId === civ.id);
      return !alive;
    });
    if (allAiDead) {
      this.gameOver = { result: 'win', score: this.score() };
      this._emit('gameOver', this.gameOver);
      return;
    }

    // Space race: check if any civ has met the spaceship quota
    if (this._apolloBuilt && !this.gameOver) {
      // Check AI civs first (if AI wins, human loses)
      for (const civ of this.civs.slice(1)) {
        if (!civ.alive) continue;
        if (this.spaceshipReady(civ.id)) {
          this.launchSpaceship(civ.id);
          return;
        }
      }
      // Check human
      if (this.spaceshipReady(0)) {
        this.launchSpaceship(0);
        return;
      }
    }

    // Score victory: game ends at 2050 A.D.
    if (this.year >= 2050) {
      const humanScore = this.score();
      const aiScores   = this.civs.slice(1).map(civ => {
        if (!civ || !civ.alive) return 0;
        const c = this.cities.filter(x => x.civId === civ.id);
        return c.reduce((s, x) => s + x.size * (x.size + 1) / 2, 0)
             + civ.advances.size * 5
             + c.reduce((s, x) => s + [...x.improvements].filter(id => IMPROVEMENTS[id]?.isWonder).length * 20, 0);
      });
      const humanWins = aiScores.every(s => humanScore >= s);
      this.gameOver = {
        result: humanWins ? 'score-win' : 'score-lose',
        score:  humanScore,
      };
      this._emit('gameOver', this.gameOver);
    }
  }

  /** Number of citizens working tiles (city.size minus specialists). */
  _numWorkers(city) {
    const s = city.specialists ?? { entertainer: 0, taxCollector: 0, scientist: 0 };
    return city.size - (s.entertainer + s.taxCollector + s.scientist);
  }

  /**
   * Compute food/shield/trade yields for a city from the terrain it sits on
   * Full 21-tile "fat cross" working area (Civ2 city radius 2).
   *
   * @param {City} city
   * @returns {{ food: number, shields: number, trade: number }}
   */
  cityYields(city) {
    const imp  = this._tileImprovements;
    const cols = this.mapCols;
    const civ  = this.civs[city.civId];
    const govt = civ?.government ?? 0;
    let food = 0, shields = 0, trade = 0;

    const tileYield = (row, col) => {
      if (row < 0 || row >= this.mapRows) return null;
      const c = ((col % cols) + cols) % cols;
      const t   = this.tiles[row][c];
      const ti  = imp[row][c];
      const res = this._resources[row][c];

      let f, s, tr;
      if (res >= 0) {
        const r = SPECIAL_RESOURCES[res];
        f = r.food; s = r.shields; tr = r.trade;
      } else {
        f = t.food; s = t.shields; tr = t.trade;
        // C6: Grassland shield placement — exact Civ2 formula from axx0 Tile.cs HasSheild()
        // X/Y are absolute coords: X = 2*col+(row%2), Y = row
        if (t === TERRAIN.GRASSLAND) {
          const X = 2 * c + (row % 2), Y = row;
          const rez4 = (Math.floor(Y / 2) + 2 * (Y % 2)) % 4;
          const rez3 = 8 - 2 * (rez4 % 4);
          s = ((X - (Y % 2) + rez3) % 8) < 4 ? 1 : 0;
        }
      }

      if (ti.irrigation && t.irrigate === 'yes') f  += t.irrigBonus ?? 0;
      if (ti.mine       && t.mine     === 'yes') s  += t.mineBonus  ?? 0;
      if (ti.road       && t.roadBonus)          tr += 1;
      // Railroad bonus: +50% shields and trade per tile (stacks with road bonus)
      if (ti.railroad) { s = Math.floor(s * 1.5); tr = Math.floor(tr * 1.5); }

      if (this._rivers[row][c] > 0 &&
          t !== TERRAIN.OCEAN && t !== TERRAIN.JUNGLE && t !== TERRAIN.SWAMP) {
        tr += 1;
      }

      // Harbor (30): +1 food on ocean tiles
      if (city.improvements.has(30) && t === TERRAIN.OCEAN) f += 1;
      // Port Facility (34): +1 shield on ocean tiles
      if (city.improvements.has(34) && t === TERRAIN.OCEAN) s += 1;
      // Offshore Platform (31): +1 shield on ocean tiles (stacks with Port Facility)
      if (city.improvements.has(31) && t === TERRAIN.OCEAN) s += 1;
      // Colossus (41, wonder): +1 trade on tiles already producing ≥1 trade
      if (city.improvements.has(41) && tr >= 1) tr += 1;

      // Despotism/Anarchy tile penalty: any yield component ≥ 3 loses 1
      if (govt <= 1) {
        if (f  >= 3) f  -= 1;
        if (s  >= 3) s  -= 1;
        if (tr >= 3) tr -= 1;
      }

      // King Richard's Crusade (47): +1 shield from all tiles in the city that owns it
      // Applied after government penalty (same as Colossus/trade bonuses in higher govts)
      if (city.improvements.has(47)) s += 1;

      // C7: Republic/Democracy +1 trade on tiles already producing ≥1 trade
      if ((govt === 5 || govt === 6) && tr >= 1) tr += 1;

      // "We Love the King Day": Monarchy(2)/Republic(5) +1 trade on tiles producing ≥1 trade
      if (city.weLoveKing && (govt === 2 || govt === 5) && tr >= 1) tr += 1;

      return { row, col: ((col % cols) + cols) % cols, f, s, tr };
    };

    // City center is always worked; citizens (city.size) work the best remaining tiles.
    // H5: Center tile enforces minimum food=1, shields=1 regardless of terrain.
    const center = tileYield(city.row, city.col) ?? { f: 0, s: 0, tr: 0 };
    food    += Math.max(center.f, 1);  // minimum 1 food from center (replaces old +1 hack)
    shields += Math.max(center.s, 1);  // minimum 1 shield from center always
    trade   += center.tr;

    const ring = [];
    for (const n of cityRadius(city.col, city.row)) {
      if (n.row === city.row && n.col === city.col) continue;  // skip center
      const y = tileYield(n.row, n.col);
      if (y) ring.push(y);
    }

    const numWorkers = this._numWorkers(city);
    let workedTiles;
    if (city.manualWorked !== null) {
      // Use player's manual tile selection (capped at numWorkers)
      workedTiles = ring.filter(y => city.manualWorked.has(`${y.row},${y.col}`))
                       .slice(0, numWorkers);
    } else {
      // Auto-assign: sort by total value (food + shields + trade), food-first tiebreak.
      // Matches original Civ2 governor default priority.
      ring.sort((a, b) => (b.f + b.s + b.tr) - (a.f + a.s + a.tr) || (b.f - a.f) || (b.s - a.s));
      workedTiles = ring.slice(0, numWorkers);
    }
    for (const y of workedTiles) {
      food    += y.f;
      shields += y.s;
      trade   += y.tr;
    }

    // Copernicus' Observatory (50): 2× trade in the specific city that owns it (before corruption)
    if (city.improvements.has(50)) trade *= 2;

    // Unit shield support: deducted before waste (axx0 CityExtensions.cs:35,55,75)
    const support = this._cityShieldSupport(city);
    shields = Math.max(0, shields - support);

    // Corruption (trade) and waste (shields) — separate formulas per axx0 CityExtensions.cs
    const corruptFrac = this._corruptionFraction(city, civ);
    trade   = Math.floor(trade   * (1 - corruptFrac));
    const wasteFrac = this._wasteFraction(city, civ);
    shields = Math.floor(shields * (1 - wasteFrac));

    const has = id => city.improvements.has(id);

    // Shield multipliers: Factory(15) × 1.5, Manufacturing Plant(16) × 1.5,
    //   one Power source (Power Plant 19 / Hydro 20 / Nuclear 21 / Solar 29) × 1.5
    // Hoover Dam (61): free Hydro Plant (20) effect for all cities of owning civ
    let shieldMult = 1;
    if (has(15)) shieldMult *= 1.5;
    if (has(16)) shieldMult *= 1.5;
    if (has(19) || has(20) || has(21) || has(29) || this._civHasWonder(city.civId, 61)) shieldMult *= 1.5;
    shields = Math.floor(shields * shieldMult);

    // Persistent trade route income (added before trade multipliers)
    if (city.tradeRoutes) {
      for (const route of city.tradeRoutes) {
        // Route is broken if partner city no longer exists
        const partner = this.cities.find(c => c.id === route.partnerCityId);
        if (partner) trade += route.tradePerTurn;
      }
    }

    // Trade multipliers: Marketplace(5), Bank(10), Stock Exchange(22), Superhighways(25) × 1.5 each
    let tradeMult = 1;
    if (has(5))  tradeMult *= 1.5;
    if (has(10)) tradeMult *= 1.5;
    if (has(22)) tradeMult *= 1.5;
    if (has(25)) tradeMult *= 1.5;
    trade = Math.floor(trade * tradeMult);

    return { food, shields, trade };
  }

  /**
   * Return the yield of a single tile in the context of a given city.
   * Used by the city screen to render small resource icons on worked BFC tiles.
   */
  tileYieldFor(city, row, col) {
    const imp  = this._tileImprovements;
    const cols = this.mapCols;
    const civ  = this.civs[city.civId];
    const govt = civ?.government ?? 0;
    if (row < 0 || row >= this.mapRows) return null;
    const c = ((col % cols) + cols) % cols;
    const t   = this.tiles[row][c];
    const ti  = imp[row][c];
    const res = this._resources[row][c];
    let f, s, tr;
    if (res >= 0) {
      const r = SPECIAL_RESOURCES[res];
      f = r.food; s = r.shields; tr = r.trade;
    } else {
      f = t.food; s = t.shields; tr = t.trade;
      if (t === TERRAIN.GRASSLAND) {
        const X = 2 * c + (row % 2), Y = row;
        const rez4 = (Math.floor(Y / 2) + 2 * (Y % 2)) % 4;
        const rez3 = 8 - 2 * (rez4 % 4);
        s = ((X - (Y % 2) + rez3) % 8) < 4 ? 1 : 0;
      }
    }
    if (ti.irrigation && t.irrigate === 'yes') f  += t.irrigBonus ?? 0;
    if (ti.mine       && t.mine     === 'yes') s  += t.mineBonus  ?? 0;
    if (ti.road       && t.roadBonus)          tr += 1;
    if (ti.railroad) { s = Math.floor(s * 1.5); tr = Math.floor(tr * 1.5); }
    if (this._rivers[row][c] > 0 &&
        t !== TERRAIN.OCEAN && t !== TERRAIN.JUNGLE && t !== TERRAIN.SWAMP) tr += 1;
    if (city.improvements.has(30) && t === TERRAIN.OCEAN) f += 1;
    if (city.improvements.has(34) && t === TERRAIN.OCEAN) s += 1;
    if (city.improvements.has(31) && t === TERRAIN.OCEAN) s += 1;
    if (city.improvements.has(41) && tr >= 1) tr += 1;
    if (govt <= 1) {
      if (f  >= 3) f  -= 1;
      if (s  >= 3) s  -= 1;
      if (tr >= 3) tr -= 1;
    }
    if (city.improvements.has(47)) s += 1;
    if (city.weLoveKing && (govt === 2 || govt === 5) && tr >= 1) tr += 1;
    if ((govt === 5 || govt === 6) && tr >= 1) tr += 1;
    return { f, s, tr };
  }

  /**
   * Return the set of tile coordinates worked by a city, plus the full BFC list.
   * Used by the city screen map panel to highlight worked tiles.
   *
   * @param {City} city
   * @returns {{ bfc: Array<{row,col}>, worked: Set<string> }}
   *   bfc     — all 21 BFC tiles (including center)
   *   worked  — "row,col" strings for the center + up to city.size worked tiles
   */
  cityWorkedTileSet(city) {
    const cols = this.mapCols;
    const imp  = this._tileImprovements;
    const civ  = this.civs[city.civId];
    const govt = civ?.government ?? 0;

    const tileYield = (row, col) => {
      if (row < 0 || row >= this.mapRows) return null;
      const c = ((col % cols) + cols) % cols;
      const t   = this.tiles[row][c];
      const ti  = imp[row][c];
      const res = this._resources[row][c];
      let f, s, tr;
      if (res >= 0) { const r = SPECIAL_RESOURCES[res]; f = r.food; s = r.shields; tr = r.trade; }
      else {
        f = t.food; s = t.shields; tr = t.trade;
        // C6: Grassland shields only on every 4th tile
        if (t === TERRAIN.GRASSLAND) {
          const X = 2 * c + (row % 2), Y = row;
          const rez4 = (Math.floor(Y / 2) + 2 * (Y % 2)) % 4;
          const rez3 = 8 - 2 * (rez4 % 4);
          s = ((X - (Y % 2) + rez3) % 8) < 4 ? 1 : 0;
        }
      }
      if (ti.irrigation && t.irrigate === 'yes') f  += t.irrigBonus ?? 0;
      if (ti.mine       && t.mine     === 'yes') s  += t.mineBonus  ?? 0;
      if (ti.road       && t.roadBonus)          tr += 1;
      if (ti.railroad) { s = Math.floor(s * 1.5); tr = Math.floor(tr * 1.5); }
      if (this._rivers[row][c] > 0 && t !== TERRAIN.OCEAN && t !== TERRAIN.JUNGLE && t !== TERRAIN.SWAMP) tr += 1;
      if (govt <= 1) { if (f >= 3) f -= 1; if (s >= 3) s -= 1; if (tr >= 3) tr -= 1; }
      // C7: Republic/Democracy +1 trade on tiles producing ≥1 trade
      if ((govt === 5 || govt === 6) && tr >= 1) tr += 1;
      // WLtKD: Monarchy(2)/Republic(5) +1 trade on tiles producing ≥1 trade
      if (city.weLoveKing && (govt === 2 || govt === 5) && tr >= 1) tr += 1;
      return { row, col: c, f, s, tr };
    };

    const bfc = cityRadius(city.col, city.row);
    const centerCol = ((city.col % cols) + cols) % cols;
    const centerKey = `${city.row},${centerCol}`;
    const worked = new Set();
    worked.add(centerKey); // center always worked

    if (city.manualWorked !== null) {
      // Player has manually assigned tiles: use their set (center already included above)
      for (const key of city.manualWorked) {
        if (key !== centerKey) worked.add(key);
      }
    } else {
      const ring = [];
      for (const n of bfc) {
        if (n.row === city.row && n.col === city.col) continue;
        const y = tileYield(n.row, n.col);
        if (y) ring.push(y);
      }
      ring.sort((a, b) => (b.f + b.s + b.tr) - (a.f + a.s + a.tr) || (b.f - a.f) || (b.s - a.s));
      for (const y of ring.slice(0, this._numWorkers(city))) {
        worked.add(`${y.row},${y.col}`);
      }
    }

    return { bfc, worked };
  }

  /**
   * Compute happy/content/unhappy citizen counts for a city.
   *
   * Unhappy citizens appear when city.size > threshold:
   *   threshold = COSMIC.firstUnhappySize + riotFactor-based bonus from many cities
   *   (difficulty is fixed at Chieftain for now, so firstUnhappySize = 7 baseline)
   *
   * Luxury goods (from luxRate) convert content→happy; Colosseum/Temple/Cathedral
   * also pacify unhappy citizens.
   *
   * Returns { happy, content, unhappy, disorder }
   */
  cityHappiness(city) {
    const civ        = this.civs[city.civId];
    const govt       = civ?.government ?? 0;
    const cityCount  = this.cities.filter(c => c.civId === city.civId).length;

    // Base threshold for first unhappy citizen.
    // Difficulty lowers it (harder = more unhappiness), riotFactor scales with city count.
    const diffPenalty = this.difficulty ?? 1;
    const threshold   = Math.max(1,
      COSMIC.firstUnhappySize - diffPenalty - Math.floor(cityCount / COSMIC.riotFactor));

    // Under Republic, each military unit from this city that's away causes 1 unhappy;
    // under Democracy, each causes 2 unhappy (Civ2 mechanic).
    // Only units whose homeCity matches this city count (per-city, not global).
    const awayMilitary = (govt >= 5)
      ? this.units.filter(u => u.homeCity === city.id &&
          (UNITS[u.typeId]?.attack ?? 0) > 0 &&
          (u.col !== city.col || u.row !== city.row)).length
      : 0;
    let militaryUnhappy = awayMilitary * (govt === 6 ? 2 : 1);
    // Women's Suffrage (60): halve military unit unhappiness under Republic/Democracy
    if (govt >= 5 && this._civHasWonder(city.civId, 60)) {
      militaryUnhappy = Math.floor(militaryUnhappy / 2);
    }

    // Only workers (not specialists) count for happiness base population
    const numWorkers = this._numWorkers(city);
    let unhappy = Math.max(0, numWorkers - threshold) + militaryUnhappy;
    let happy   = 0;
    let content = numWorkers - unhappy;

    // Martial law: under Despotism/Monarchy/Communism, garrisoned military units pacify unhappy citizens
    if (govt >= 1 && govt <= 3) {
      const garrisoned = this.units.filter(u => u.civId === city.civId
        && u.col === city.col && u.row === city.row
        && (UNITS[u.typeId]?.attack ?? 0) > 0).length;
      const martialLaw = Math.min(Math.min(garrisoned, 3), unhappy);
      unhappy -= martialLaw;
      content += martialLaw;
    }

    // Hanging Gardens (40): +1 content in every city of owning civ
    if (this._civHasWonder(city.civId, 40)) content += 1;
    // J. S. Bach's Cathedral (54): +2 content in every city of owning civ
    if (this._civHasWonder(city.civId, 54)) content += 2;
    // Cure for Cancer (66): +1 content in every city of owning civ
    if (this._civHasWonder(city.civId, 66)) content += 1;

    // Shakespeare's Theatre (52): 0 unhappy in the city that owns it
    if (city.improvements.has(52)) unhappy = 0;

    // Luxury goods: each 2 luxuries (from trade × luxRate) produce 1 happy citizen
    const yields  = this.cityYields(city);
    const luxuries = Math.floor(yields.trade * (civ?.luxRate ?? 0) / 100);
    // Entertainer specialists produce 2 luxury each
    const entLux   = (city.specialists?.entertainer ?? 0) * 2;
    const totalLux = luxuries + entLux;
    const luxHappy = Math.floor(totalLux / 2);
    const fromLux  = Math.min(luxHappy, unhappy);   // convert unhappy→content first
    unhappy  -= fromLux;
    content  += fromLux;
    const extraLux = luxHappy - fromLux;
    const fromLux2 = Math.min(extraLux, content);   // then content→happy
    content  -= fromLux2;
    happy    += fromLux2;

    // City improvements that reduce unhappiness
    const hasTemple     = city.improvements.has(4);   // Temple: -1 unhappy
    const hasColosseum  = city.improvements.has(14);  // Colosseum: -3 unhappy
    const hasCathedral  = city.improvements.has(11);  // Cathedral: -3 unhappy
    // Oracle (44): Temple pacifies 2 unhappy instead of 1 for owning civ
    const templeBonus = (hasTemple && this._civHasWonder(city.civId, 44)) ? 2 : hasTemple ? 1 : 0;
    // Michelangelo's Chapel (49): Cathedral effect (−3 unhappy) in every city of owning civ
    const michelangeloBonus = (!hasCathedral && this._civHasWonder(city.civId, 49)) ? 3 : 0;
    // Police Station (33): -1 unhappy
    const policeBonus = city.improvements.has(33) ? 1 : 0;
    const calmUnhappy = templeBonus + (hasColosseum ? 3 : 0) + (hasCathedral ? 3 : 0) + michelangeloBonus + policeBonus;
    const calmed = Math.min(calmUnhappy, unhappy);
    unhappy -= calmed;
    content += calmed;

    // Disorder: unhappy ≥ happy (and at least 1 unhappy)
    const disorder = unhappy > 0 && unhappy >= happy;
    return { happy, content, unhappy, disorder };
  }

  /**
   * Toggle a BFC tile in/out of the manual-worked set for a city.
   * Center tile cannot be toggled. Auto-worked set is computed from cityWorkedTileSet
   * on first toggle so the player starts from the current best assignment.
   */
  toggleCityTile(city, tileRow, tileCol) {
    const cols = this.mapCols;
    const c = ((tileCol % cols) + cols) % cols;
    const key = `${tileRow},${c}`;
    const centerKey = `${city.row},${((city.col % cols) + cols) % cols}`;
    if (key === centerKey) return; // center always worked

    if (city.manualWorked === null) {
      // Initialise from current auto-assignment
      const { worked } = this.cityWorkedTileSet(city);
      city.manualWorked = new Set(worked);
    }

    if (city.manualWorked.has(key)) {
      city.manualWorked.delete(key);
    } else if (city.manualWorked.size < this._numWorkers(city) + 1) { // +1 for center
      city.manualWorked.add(key);
    }
  }

  /**
   * Cycle a citizen through specialist types when clicked in the city screen.
   * citizenIndex is 0-based from left to right: workers first, then specialists.
   * Worker → Entertainer → Tax Collector → Scientist → Worker.
   */
  cycleSpecialist(city, citizenIndex) {
    const s = city.specialists ?? (city.specialists = { entertainer: 0, taxCollector: 0, scientist: 0 });
    const numWorkers = this._numWorkers(city);
    const entStart = numWorkers;
    const taxStart = entStart + s.entertainer;
    const sciStart = taxStart + s.taxCollector;
    const sciEnd   = sciStart + s.scientist;

    if (citizenIndex < numWorkers) {
      // Worker → Entertainer: one fewer tile worker, one more entertainer
      s.entertainer++;
    } else if (citizenIndex < taxStart) {
      // Entertainer → Tax Collector
      s.entertainer--;
      s.taxCollector++;
    } else if (citizenIndex < sciStart) {
      // Tax Collector → Scientist
      s.taxCollector--;
      s.scientist++;
    } else if (citizenIndex < sciEnd) {
      // Scientist → Worker (remove specialist)
      s.scientist--;
    }

    // Clamp specialists: total cannot exceed city.size - 1 (at least 1 worker)
    const total = s.entertainer + s.taxCollector + s.scientist;
    if (total >= city.size) {
      // Remove excess from scientist first, then tax, then entertainer
      let excess = total - city.size + 1;
      const dec = (field) => { const d = Math.min(excess, s[field]); s[field] -= d; excess -= d; };
      dec('scientist'); dec('taxCollector'); dec('entertainer');
    }
  }

  /** Shrink city if it exceeds Aqueduct/Sewer size limits without the required improvement. */
  _enforceInfrastructureLimits(city) {
    while (city.size >= COSMIC.sewerLimit && !city.improvements.has(23) && city.size > 1) {
      city.size--;
      this._autoRemoveWorker(city);
    }
    while (city.size >= COSMIC.aqueductLimit && !city.improvements.has(9) && city.size > 1) {
      city.size--;
      this._autoRemoveWorker(city);
    }
  }

  /** Clear manual tile assignment; city reverts to auto-greedy assignment. */
  resetCityTiles(city) {
    city.manualWorked = null;
  }

  /** Returns all units on tile (col, row). Wraps col horizontally. */
  unitsAt(col, row) {
    const c = this._wrapCol(col);
    return this.units.filter(u => u.col === c && u.row === row);
  }

  /** Returns the city on tile (col, row), or null. Wraps col horizontally. */
  cityAt(col, row) {
    const c = this._wrapCol(col);
    return this.cities.find(city => city.col === c && city.row === row) ?? null;
  }

  // ─── Diplomacy ─────────────────────────────────────────────────────────────

  /**
   * Declare war on a civ (player-facing). Applies reputation penalty if breaking a treaty.
   * @param {number} targetCivId
   */
  declareWar(targetCivId) {
    const player = this.civs[0];
    const target = this.civs[targetCivId];
    if (!player || !target || !target.alive) return;

    // Reputation penalty for breaking existing treaties
    const prevRel = player.relations.get(targetCivId) ?? 'peace';
    if (prevRel === 'ceasefire') {
      player.reputation = Math.max(0, player.reputation - 20);
      this.adjustAttitude(targetCivId, 0, -25);
    } else if (prevRel === 'peace') {
      player.reputation = Math.max(0, player.reputation - 30);
      this.adjustAttitude(targetCivId, 0, -40);
    } else if (prevRel === 'alliance') {
      player.reputation = Math.max(0, player.reputation - 40);
      this.adjustAttitude(targetCivId, 0, -60);
    }

    player.relations.set(targetCivId, 'war');
    target.relations.set(0, 'war');
    const wk = `${Math.min(0, targetCivId)}_${Math.max(0, targetCivId)}`;
    this._warSinceTurn.set(wk, this.turn);
    this._addLog(`You declared war on the ${target.data.plural}!`);
    this._emit('neg', {});
  }

  /**
   * Propose peace to a civ. AI evaluates based on attitude + personality.
   * @param {number} targetCivId
   * @returns {boolean} true if accepted
   */
  proposePeace(targetCivId) {
    const player = this.civs[0];
    const target = this.civs[targetCivId];
    if (!player || !target || !target.alive) return false;

    const rel = player.relations.get(targetCivId) ?? 'peace';
    if (rel === 'peace' || rel === 'alliance') return false; // already at peace

    const accepted = this.aiWillAccept(targetCivId, 'peace');
    if (!accepted) {
      this._addLog(`The ${target.data.plural} reject your peace proposal.`);
      this._emit('neg', {});
      return false;
    }

    player.relations.set(targetCivId, 'peace');
    target.relations.set(0, 'peace');
    const wk = `${Math.min(0, targetCivId)}_${Math.max(0, targetCivId)}`;
    this._warSinceTurn.delete(wk);
    this.adjustAttitude(0, targetCivId, 20);
    this._addLog(`Peace agreed with the ${target.data.plural}.`);
    this._emit('pos', {});
    return true;
  }

  /**
   * Propose a ceasefire. Easier threshold than full peace.
   * @param {number} targetCivId
   * @returns {boolean} true if accepted
   */
  proposeCeasefire(targetCivId) {
    const player = this.civs[0];
    const target = this.civs[targetCivId];
    if (!player || !target || !target.alive) return false;

    const rel = player.relations.get(targetCivId) ?? 'peace';
    if (rel !== 'war') return false; // ceasefire only from war

    const accepted = this.aiWillAccept(targetCivId, 'ceasefire');
    if (!accepted) {
      this._addLog(`The ${target.data.plural} reject your ceasefire proposal.`);
      this._emit('neg', {});
      return false;
    }

    player.relations.set(targetCivId, 'ceasefire');
    target.relations.set(0, 'ceasefire');
    this.adjustAttitude(0, targetCivId, 15);
    this._addLog(`Ceasefire agreed with the ${target.data.plural}.`);
    this._emit('pos', {});
    return true;
  }

  /**
   * Propose an alliance. Requires positive relations and not at war.
   * @param {number} targetCivId
   * @returns {boolean} true if accepted
   */
  proposeAlliance(targetCivId) {
    const player = this.civs[0];
    const target = this.civs[targetCivId];
    if (!player || !target || !target.alive) return false;

    const rel = player.relations.get(targetCivId) ?? 'peace';
    if (rel === 'war' || rel === 'ceasefire') return false;
    if (rel === 'alliance') return false; // already allied

    const accepted = this.aiWillAccept(targetCivId, 'alliance');
    if (!accepted) {
      this._addLog(`The ${target.data.plural} decline your alliance proposal.`);
      this._emit('neg', {});
      return false;
    }

    player.relations.set(targetCivId, 'alliance');
    target.relations.set(0, 'alliance');
    this.adjustAttitude(0, targetCivId, 25);
    this._addLog(`Alliance formed with the ${target.data.plural}!`);
    this._emit('pos', {});
    return true;
  }

  /**
   * Pay gold tribute to improve AI attitude toward player.
   * @param {number} targetCivId
   * @param {number} amount  gold to pay (minimum 10)
   * @returns {boolean} true if player had enough gold
   */
  payTribute(targetCivId, amount) {
    const player = this.civs[0];
    const target = this.civs[targetCivId];
    if (!player || !target || !target.alive) return false;
    if (player.gold < amount) return false;

    player.gold -= amount;
    target.gold += amount;
    const attGain = Math.min(30, Math.round(amount / 5));
    this.adjustAttitude(0, targetCivId, attGain);
    this._addLog(`Paid ${amount}g tribute to the ${target.data.plural}.`);
    this._emit('pos', {});
    return true;
  }

  /**
   * Propose a UN election. The human must own the United Nations (id=63).
   * Each living AI civ votes: +1 for owner if attitude >= 0, -1 against.
   * Barbarians don't vote. Owner wins if votes_for > votes_against.
   * Can only be called once per game (one election per UN build).
   *
   * Returns an object: { eligible, alreadyUsed, votes, forVotes, againstVotes, won }
   */
  proposeUnElection() {
    const ownsUN = this._civHasWonder(0, 63);
    if (!ownsUN)        return { eligible: false };
    if (this._unElectionUsed) return { eligible: true, alreadyUsed: true };

    this._unElectionUsed = true;
    const player = this.civs[0];

    let forVotes = 0;
    let againstVotes = 0;
    const votes = [];
    const livingAI = this.civs.slice(1).filter(c => c && c.alive && c.id !== this.barbarianCivIdx);

    for (const civ of livingAI) {
      const att = civ.attitude.get(0) ?? 0;
      const votes_for = att >= 0;
      if (votes_for) forVotes++;
      else againstVotes++;
      votes.push({ civId: civ.id, name: civ.data.plural, attitude: att, for: votes_for });
    }

    const won = forVotes > againstVotes && livingAI.length > 0;

    if (won) {
      this._addLog(`UN Election: The world votes you World Leader! Diplomatic Victory!`);
      this.gameOver = { result: 'diplomatic-win', score: this.score() };
      this._emit('gameOver', this.gameOver);
    } else {
      this._addLog(`UN Election: The world rejects your candidacy (${forVotes} for, ${againstVotes} against).`);
    }

    this._emit('unElection', { won, forVotes, againstVotes, votes });
    return { eligible: true, alreadyUsed: false, votes, forVotes, againstVotes, won };
  }

  /**
   * Offer a tech trade: player gives myAdvId, receives theirAdvId.
   * @param {number} targetCivId
   * @param {number} myAdvId      advance player offers
   * @param {number} theirAdvId   advance player requests
   * @returns {boolean} true if accepted
   */
  offerTechTrade(targetCivId, myAdvId, theirAdvId) {
    const player = this.civs[0];
    const target = this.civs[targetCivId];
    if (!player || !target || !target.alive) return false;

    const accepted = this.aiWillAccept(targetCivId, 'techTrade', { myAdvId, theirAdvId });
    if (!accepted) {
      this._addLog(`The ${target.data.plural} decline your technology offer.`);
      this._emit('neg', {});
      return false;
    }

    player.advances.add(theirAdvId);
    target.advances.add(myAdvId);
    this.adjustAttitude(0, targetCivId, 10);
    this._addLog(`Technology exchange with the ${target.data.plural} completed.`);
    this._emit('pos', {});
    return true;
  }

  /**
   * Share player's explored map with target civ (reveals explored tiles to them conceptually).
   * In-game effect: minor attitude boost.
   * @param {number} targetCivId
   * @returns {boolean}
   */
  shareMap(targetCivId) {
    const player = this.civs[0];
    const target = this.civs[targetCivId];
    if (!player || !target || !target.alive) return false;

    this.adjustAttitude(0, targetCivId, 5);
    this._addLog(`Shared maps with the ${target.data.plural}.`);
    this._emit('pos', {});
    return true;
  }

  // ─── Space Race ────────────────────────────────────────────────────────────

  /**
   * Count how many SS parts a civ has built across all its cities.
   * Returns { structural, component, module }.
   * Quota: 8 structural + 4 component + 4 module.
   */
  spaceshipProgress(civIdx) {
    let structural = 0, component = 0, module = 0;
    for (const city of this.cities) {
      if (city.civId !== civIdx) continue;
      structural += city.ssParts?.[35] ?? 0;
      component  += city.ssParts?.[36] ?? 0;
      module     += city.ssParts?.[37] ?? 0;
    }
    return { structural, component, module };
  }

  /** Returns true if a civ meets the quota to launch their spaceship. */
  spaceshipReady(civIdx) {
    const p = this.spaceshipProgress(civIdx);
    return p.structural >= 8 && p.component >= 4 && p.module >= 4;
  }

  /** Launch the spaceship for the given civ, triggering the appropriate victory/defeat. */
  launchSpaceship(civIdx) {
    if (this.gameOver) return;
    if (civIdx === 0) {
      this.gameOver = { result: 'space-win', score: this.score() };
    } else {
      // AI civ wins — human loses (unless human already launched)
      this.gameOver = { result: 'space-lose', score: this.score() };
    }
    this._emit('gameOver', this.gameOver);
    this._emit('spaceshipLaunched', { civIdx });
  }

  // ─── Unit Upgrades ─────────────────────────────────────────────────────────

  /**
   * Check if a unit can be upgraded by paying gold.
   * A unit can be upgraded when:
   *   - unit.obsolete is true (this civ knows the advance that makes it obsolete)
   *   - The unit is standing on a city tile owned by the same civ
   * Returns { newTypeId, newName, cost } or null.
   */
  unitUpgradeAvailable(unit) {
    const data = UNITS[unit.typeId];
    if (!unit.obsolete) return null;

    // Must be in a friendly city
    const city = this.cityAt(unit.col, unit.row);
    if (!city || city.civId !== unit.civId) return null;

    const civ = this.civs[unit.civId];
    if (!civ) return null;

    // Find the cheapest buildable unit in the same domain with higher cost (the successor)
    let best = null;
    for (const u of UNITS) {
      if (u.domain !== data.domain) continue;
      if (u.id === unit.typeId) continue;
      if (u.cost <= data.cost) continue;                              // must cost more
      if (u.prereq !== -1 && !civ.advances.has(u.prereq)) continue;  // must be researchable
      if (u.obsoletedBy !== -1 && civ.advances.has(u.obsoletedBy)) continue; // must not be obsolete
      if (!best || u.cost < best.cost) best = u;
    }
    if (!best) return null;

    const goldCost = Math.max(10, (best.cost - data.cost) * 4);
    return { newTypeId: best.id, newName: best.name, cost: goldCost };
  }

  /**
   * Upgrade a unit to its successor type, deducting gold.
   * Caller should verify unitUpgradeAvailable() returns non-null first.
   */
  upgradeUnit(unit) {
    const info = this.unitUpgradeAvailable(unit);
    if (!info) return false;
    const civ = this.civs[unit.civId];
    if (!civ || civ.gold < info.cost) return false;

    civ.gold -= info.cost;
    const newData    = UNITS[info.newTypeId];
    unit.typeId      = info.newTypeId;
    unit.maxMoves    = newData.move * COSMIC.roadMultiplier;
    unit.movesLeft   = Math.min(unit.movesLeft, unit.maxMoves);
    const newMaxHp   = newData.hp * 10;
    unit.hp          = Math.min(unit.hp, newMaxHp);
    unit.maxHp       = newMaxHp;
    unit.obsolete    = false;
    this._addLog(`${newData.name} upgrade complete! (–${info.cost} gold)`);
    this._emit('upgrade', {});
    return true;
  }

  // ─── Save / Load ───────────────────────────────────────────────────────────

  exportSav() {
    return exportCiv2Sav(this);
  }

  /** Serialize the full game state to a plain JSON-safe object. */
  toSaveData() {
      return {
        version:      1,
        seed:         this.seed,
        mapCols:      this.mapCols,
        mapRows:      this.mapRows,
        turn:         this.turn,
        activeCivIdx: this.activeCivIdx,
        activeUnitId: this.activeUnit?.id ?? null,
        difficulty:   this.difficulty,
        barbarians:      this.barbarians ?? 'sedentary',
        barbarianCivIdx: this.barbarianCivIdx ?? -1,
        flatEarth:    this.flatEarth ?? false,
      gameOver:     this.gameOver,
      worldPeaceTurns: this._worldPeaceTurns ?? 0,
       log:          [...this.log],
      nextUnitId:   this._nextUnitId,
      nextCityId:   this._nextCityId,
      warSinceTurn: Object.fromEntries(this._warSinceTurn),
      apolloBuilt:    this._apolloBuilt,
      manhattanBuilt: this._manhattanBuilt,
      unElectionUsed: this._unElectionUsed,

      tiles:        this.tiles.map(row => row.map(t => t?.id ?? 0)),
      resources:    this._resources.map(row => Array.from(row)),
      rivers:       this._rivers.map(row => Array.from(row)),
      improvements: this._tileImprovements.map(row =>
        row.map(ti => (ti.road ? 1 : 0) | (ti.railroad ? 2 : 0) | (ti.irrigation ? 4 : 0) | (ti.mine ? 8 : 0) | (ti.fortress ? 16 : 0) | (ti.pollution ? 32 : 0) | (ti.fallout ? 64 : 0) | (ti.hut ? 128 : 0) | (ti.airbase ? 256 : 0) | (ti.farmland ? 512 : 0))
      ),
      visibility:   this._visibility.map(row => Array.from(row)),

      civs: this.civs.map(civ => ({
        id:               civ.id,
        dataIdx:          CIVS.indexOf(civ.data),
        advances:         [...civ.advances],
        gold:             civ.gold,
        government:       civ.government,
        sciRate:          civ.sciRate,
        taxRate:          civ.taxRate,
        luxRate:          civ.luxRate,
        alive:            civ.alive,
        beakers:          civ.beakers,
        currentResearch:  civ.currentResearch,
        researchGoal:     civ.researchGoal ?? null,
        cityStyle:        civ.cityStyle ?? civ.data?.cityStyle ?? 0,
        anarchyTurnsLeft: civ.anarchyTurnsLeft,
        femaleLeader:        civ.femaleLeader ?? false,
        leaderNameOverride:  civ.leaderNameOverride ?? null,
        relations:           Object.fromEntries(civ.relations),
        attitude:            [...civ.attitude.entries()],
        reputation:          civ.reputation,
        embassies:           [...civ.embassies],
        futureTechCount:     civ.futureTechCount ?? 0,
      })),

      units: this.units.map(u => ({
        id:        u.id,
        typeId:    u.typeId,
        civId:     u.civId,
        col:       u.col,
        row:       u.row,
        movesLeft: u.movesLeft,
        maxMoves:  u.maxMoves,
        status:    u.status,
        hp:        u.hp,
        maxHp:     u.maxHp,
        veteran:   u.veteran,
        homeCity:  u.homeCity,
        buildTask:  u.buildTask,
        gotoTarget: u.gotoTarget ?? null,
        fuel:       u.fuel ?? 0,
        obsolete:   u.obsolete ?? false,
        cargo:      u.cargo.map(c => c.id),
        inShip:     u.inShip?.id ?? null,
      })),

      cities: this.cities.map(c => ({
        id:           c.id,
        civId:        c.civId,
        col:          c.col,
        row:          c.row,
        name:         c.name,
        size:         c.size,
        food:         c.food,
        shields:      c.shields,
        improvements: [...c.improvements],
        ssParts:      c.ssParts ?? { 35: 0, 36: 0, 37: 0 },
        production:   c.production,
        productionQueue: c.productionQueue ?? [],
        disorder:     c.disorder,
        manualWorked: c.manualWorked ? [...c.manualWorked] : null,
        specialists: c.specialists ?? { entertainer: 0, taxCollector: 0, scientist: 0 },
        weLoveKing: c.weLoveKing ?? false,
        tradeRoutes: c.tradeRoutes ?? [],
        governor: c.governor ?? false,
      })),

      territoryHistory: this._territoryHistory.map(s => ({
        turn: s.turn,
        owners: Array.from(s.owners),
      })),

      throneDecorations: { ...this._throneDecorations },
      palaceLevel: [...(this._palaceLevel ?? [])],

      isScenario:     this._isScenario ?? false,
      scenarioName:   this._scenarioName ?? null,
      maxTurns:       this._maxTurns ?? 0,
      scenarioEvents: this._scenarioEvents ?? [],
      gameOptions:    { ...(this._gameOptions ?? {}) },
      casualties:     [...(this._casualties ?? [])],
      powerHistory:   [...(this._powerHistory ?? [])],
    };
  }

  /**
   * Reconstruct a GameState from data returned by toSaveData().
   * @param {object} data
   * @returns {GameState}
   */
  static fromSaveData(data) {
    if (data.version !== 1) throw new Error(`Unknown save version: ${data.version}`);

     const gs = new GameState({ _skipInit: true });

     // ── Seed and RNG ────────────────────────────────────────────────────────
     gs.seed = data.seed ?? 0xdeadbeef;
     gs.rng = mulberry32(gs.seed);

     // ── Map dimensions ──────────────────────────────────────────────────────
     gs.mapCols = data.mapCols;
     gs.mapRows = data.mapRows;

    // ── Terrain lookup by id ────────────────────────────────────────────────
    const terrainById = Object.fromEntries(Object.values(TERRAIN).map(t => [t.id, t]));
    gs.tiles      = data.tiles.map(row => row.map(id => terrainById[id] ?? TERRAIN.OCEAN));
    gs._resources = data.resources.map(row => [...row]);
    gs._rivers    = data.rivers.map(row => [...row]);

    gs._tileImprovements = data.improvements.map(row =>
      row.map(b => ({
        road:       !!(b & 1),
        railroad:   !!(b & 2),
        irrigation: !!(b & 4),
        farmland:   !!(b & 512),
        mine:       !!(b & 8),
        fortress:   !!(b & 16),
        pollution:  !!(b & 32),
        fallout:    !!(b & 64),
        hut:        !!(b & 128),
        airbase:    !!(b & 256),
      }))
    );
    gs._visibility = data.visibility.map(row => new Uint8Array(row));

     // ── Turn state ──────────────────────────────────────────────────────────
     gs.turn         = data.turn;
     gs.activeCivIdx = data.activeCivIdx;
     gs._nextUnitId  = data.nextUnitId;
     gs._nextCityId  = data.nextCityId;
     gs.difficulty      = data.difficulty;
     gs.barbarians      = data.barbarians ?? 'sedentary';
     gs.barbarianCivIdx = data.barbarianCivIdx ?? -1;
     gs.flatEarth       = data.flatEarth ?? false;
     gs.gameOver        = data.gameOver ?? null;
     gs._worldPeaceTurns = data.worldPeaceTurns ?? 0;
     gs.log             = [...(data.log ?? [])];
     gs._warSinceTurn   = new Map(Object.entries(data.warSinceTurn ?? {}).map(([k, v]) => [k, v]));
     gs._apolloBuilt    = data.apolloBuilt    ?? false;
     gs._manhattanBuilt = data.manhattanBuilt ?? false;
     gs._unElectionUsed = data.unElectionUsed ?? false;
     gs.onEvent         = null;

    // ── Civilizations ───────────────────────────────────────────────────────
    gs.civs = data.civs.map(cd => {
      // Barbarian civ has synthetic data (dataIdx === -1)
      const civData = cd.dataIdx >= 0 ? CIVS[cd.dataIdx] : {
        id: -1, plural: 'Barbarians', adjective: 'Barbarian', leader: 'Attila',
        attack: 1, expand: -1, civilize: -1, color: 7
      };
      const civ = new Civilization({ id: cd.id, data: civData });
      civ.advances         = new Set(cd.advances);
      civ.gold             = cd.gold;
      civ.government       = cd.government;
      civ.sciRate          = cd.sciRate;
      civ.taxRate          = cd.taxRate;
      civ.luxRate          = cd.luxRate;
      civ.alive            = cd.alive;
      civ.beakers          = cd.beakers;
      civ.currentResearch  = cd.currentResearch;
      civ.researchGoal     = cd.researchGoal ?? null;
      civ.cityStyle        = cd.cityStyle ?? civ.data?.cityStyle ?? 0;
      civ.anarchyTurnsLeft = cd.anarchyTurnsLeft ?? 0;
      civ.femaleLeader        = cd.femaleLeader ?? false;
      civ.leaderNameOverride  = cd.leaderNameOverride ?? null;
      civ.relations           = new Map(
        Object.entries(cd.relations).map(([k, v]) => [parseInt(k, 10), v])
      );
      civ.attitude    = new Map((cd.attitude ?? []).map(([k, v]) => [parseInt(k, 10), v]));
      civ.reputation  = cd.reputation ?? 50;
      civ.embassies   = new Set(cd.embassies ?? []);
      civ.futureTechCount = cd.futureTechCount ?? 0;
      return civ;
    });

    // ── Units ───────────────────────────────────────────────────────────────
    gs.units = data.units.filter(ud => ud.typeId >= 0 && ud.typeId < UNITS.length).map(ud => {
      const u = new Unit({ id: ud.id, typeId: ud.typeId, civId: ud.civId,
                           col: ud.col, row: ud.row, hp: ud.hp, maxMoves: ud.maxMoves });
      u.hp        = ud.hp;
      u.maxHp     = ud.maxHp;
      u.movesLeft = ud.movesLeft;
      u.status    = ud.status;
      u.veteran   = ud.veteran;
      u.homeCity   = ud.homeCity ?? null;
      u.buildTask  = ud.buildTask ?? null;
      u.gotoTarget = ud.gotoTarget ?? null;
      u.fuel       = ud.fuel ?? 0;
      u.obsolete   = ud.obsolete ?? false;
      u._savedCargoIds  = ud.cargo  ?? [];
      u._savedInShipId  = ud.inShip ?? null;
      return u;
    });
    // Reconnect cargo/inShip references after all units are created
    const unitById = new Map(gs.units.map(u => [u.id, u]));
    for (const u of gs.units) {
      u.cargo  = (u._savedCargoIds ?? []).map(id => unitById.get(id)).filter(Boolean);
      u.inShip = u._savedInShipId != null ? (unitById.get(u._savedInShipId) ?? null) : null;
      delete u._savedCargoIds;
      delete u._savedInShipId;
    }

    // ── Cities ──────────────────────────────────────────────────────────────
    gs.cities = data.cities.map(cd => {
      const c = new City({ id: cd.id, civId: cd.civId, col: cd.col, row: cd.row, name: cd.name });
      c.size         = cd.size;
      c.food         = cd.food;
      c.shields      = cd.shields;
      c.improvements = new Set((cd.improvements ?? []).filter(id => id >= 0 && id < IMPROVEMENTS.length));
      c.ssParts      = cd.ssParts ?? { 35: 0, 36: 0, 37: 0 };
      c.production   = cd.production ?? null;
      c.productionQueue = Array.isArray(cd.productionQueue)
        ? cd.productionQueue.filter(p => p && (p.type === 'unit' || p.type === 'improvement') && Number.isInteger(p.id)).slice(0, 5)
        : [];
      c.disorder     = cd.disorder ?? false;
      c.manualWorked = cd.manualWorked ? new Set(cd.manualWorked) : null;
      c.specialists  = cd.specialists ?? { entertainer: 0, taxCollector: 0, scientist: 0 };
      c.weLoveKing   = cd.weLoveKing ?? false;
      c.tradeRoutes  = cd.tradeRoutes ?? [];
      c.governor     = cd.governor ?? false;
      return c;
    });

    // ── Restore activeUnit reference ────────────────────────────────────────
    gs.activeUnit = gs.units.find(u => u.id === data.activeUnitId) ?? null;

    // ── Territory history ─────────────────────────────────────────────────
    gs._territoryHistory = (data.territoryHistory ?? []).map(s => ({
      turn: s.turn,
      owners: new Uint8Array(s.owners),
    }));
    gs._palaceLevel = data.palaceLevel ?? [];
    gs._throneDecorations = data.throneDecorations ?? {
      floor: 0, walls: 0, throne: 0, entrance: 0,
      columns: 0, windows: 0, guards: 0, banner: 0,
    };
    gs._pendingThroneOffer = null;
    gs._isScenario   = data.isScenario ?? false;
    gs._scenarioName = data.scenarioName ?? null;
    gs._maxTurns     = data.maxTurns ?? 0;
    gs._scenarioEvents = data.scenarioEvents ?? [];
    gs._gameOptions    = data.gameOptions ?? {
      animations: true,
      autoSave: true,
      tutorialHelp: false,
      productionAlerts: true,
      endOfTurnMessages: true,
    };
    gs._casualties     = data.casualties ?? [];
    gs._powerHistory   = data.powerHistory ?? [];
    gs._waitingUnits   = [];

    // Recompute island/continent numbering from the loaded map
    gs._computeIslands();

    return gs;
  }
}

applyMapLogicMixin(GameState);
