/**
 * Civ2SaveLoader.js — Parse original Civilization II .SAV files.
 *
 * Supports:
 *   Classic (version ≤ 39)  — Civ2 original / Conflicts in Civilization
 *   Gold / MGE (version 40–44) — Civ2 Gold / Multiplayer Gold Edition
 *
 * Test of Time (> 44) is detected but not supported.
 *
 * Reference: axx0/Civ2-clone (GPL-3.0)
 *   Engine/src/OriginalSaves/Read.ClassicSav.cs
 */

import { TERRAIN }       from '../data/terrain.js';
import { CIVS }          from '../data/civs.js';
import { UNITS }         from '../data/units.js';
import { Civilization }  from './Civilization.js';
import { Unit }          from './Unit.js';
import { City }          from './City.js';
import { GameState }     from './GameState.js';
import { parseEvents, executeEvents } from './ScenarioEvents.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read little-endian uint16. */
const u16 = (b, o) => b[o] | (b[o + 1] << 8);

/** Read a null-terminated ASCII string (max `len` bytes). */
function readStr(b, offset, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = b[offset + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** Test whether bit `n` is set in `byte`. */
const bit = (byte, n) => !!(byte & (1 << n));

/** Convert a raw unsigned byte to signed (-128..127). */
const s8 = (x) => (x > 127 ? x - 256 : x);

// Build a lookup table: sheetRow → TERRAIN object
// SAV terrain byte (bits 0-3) encodes the sprite sheetRow directly.
const TERRAIN_BY_ROW = {};
for (const t of Object.values(TERRAIN)) TERRAIN_BY_ROW[t.sheetRow] = t;

// Isometric staggered-grid 8-directional neighbour deltas [dcol, drow]
// for each direction: N, NE, E, SE, S, SW, W, NW  (matches GameState neighbours())
function isoDeltas(row) {
  const o = row % 2;
  return [
    [0,    -2],   // N
    [o,    -1],   // NE
    [1,     0],   // E
    [o,     1],   // SE
    [0,     2],   // S
    [o - 1, 1],   // SW
    [-1,    0],   // W
    [o - 1, -1],  // NW
  ];
}

// ─── Main loader ──────────────────────────────────────────────────────────────

export class Civ2SaveLoader {
  /**
   * Parse an original Civ2 .SAV file and return a GameState.
   * @param {ArrayBuffer} buffer — raw file contents
   * @returns {GameState}
   */
  static fromBuffer(buffer) {
    const b = new Uint8Array(buffer);

    const gameVersion = b[10];
    if (gameVersion > 44) {
      throw new Error(
        `Test of Time saves (version ${gameVersion}) are not supported.`
      );
    }

    const isMGE = gameVersion >= 40;  // Gold / MGE
    const isCiC = !isMGE;             // Classic / Conflicts

    // ── Parameters (offset 24 for ≤MGE) ────────────────────────────────────
    const paramsOffset = 24;
    const turnNumber       = u16(b, paramsOffset + 4);
    const playersCivIdx    = b[paramsOffset + 15]; // 1-7 (0 = Barbarians)
    const mapRevealed      = b[paramsOffset + 19] === 1;
    const difficultyLevel  = b[paramsOffset + 20];
    const civsInPlay       = Array.from({ length: 8 }, (_, i) => bit(b[paramsOffset + 22], i));
    const numberOfUnits    = u16(b, paramsOffset + 34);
    const numberOfCities   = u16(b, paramsOffset + 36);

    // ── Civilization data ───────────────────────────────────────────────────
    const offsetT  = isMGE ? 2278 : 2264;
    const sizeT    = isMGE ? 1428 : 1396;
    const noAdv    = isMGE ? 100  : 93;  // advance count

    const savCivs = [];
    for (let savId = 0; savId < 8; savId++) {
      const base = offsetT + sizeT * savId;

      const gold           = u16(b, base + 2);
      const tribeId        = b[base + 6];    // index into CIVS[]
      const beakers        = u16(b, base + 8);
      const resRaw         = b[base + 10];
      const currentResearch = (resRaw === 0xFF) ? null : resRaw;
      const sciRate        = b[base + 19] * 10;  // stored as ×10 e.g. 5 = 50%
      const taxRate        = b[base + 20] * 10;
      const govtId         = b[base + 21];

      // Advances: 13 bytes × 8 bits, skipping if index ≥ noAdv-1
      const advances = new Set();
      for (let block = 0; block < 13; block++) {
        for (let bi = 0; bi < 8; bi++) {
          const advId = block * 8 + bi;
          if (advId >= noAdv - 1) break;
          if (bit(b[base + 88 + block], bi)) advances.add(advId);
        }
      }

      // Diplomatic relations (7 bytes × 8 civs, packed in 4-byte groups)
      const relations = new Map();
      const contacts = new Set();
      for (let other = 0; other < 8; other++) {
        const t0 = b[base + 32 + 4 * other];
        const t1 = b[base + 32 + 4 * other + 1];
        if (bit(t0, 0)) contacts.add(other);
        const isWar = bit(t1, 5);
        relations.set(other, isWar ? 'war' : 'peace');
      }

      const savedUnitTypeCount = isMGE ? 62 : 54;
      const late = 216 + 3 * savedUnitTypeCount + 592;
      const hasSpaceship = bit(b[base + late + 30], 0);
      const spaceship = {
        structural: u16(b, base + late + 38),
        propulsion: u16(b, base + late + 40),
        fuel: u16(b, base + late + 42),
        habitation: u16(b, base + late + 44),
        lifeSupport: u16(b, base + late + 46),
        solar: u16(b, base + late + 48),
        unassignedComponents: 0,
        unassignedModules: 0,
        launched: hasSpaceship,
        launchYear: hasSpaceship ? u16(b, base + late + 34) : null,
        arrivalYear: hasSpaceship ? u16(b, base + late + 32) : null,
      };

      savCivs.push({
        savId, tribeId, gold, beakers, currentResearch,
        sciRate, taxRate, govtId, advances, relations, contacts, spaceship,
        alive: civsInPlay[savId],
      });
    }

    // ── Map ─────────────────────────────────────────────────────────────────
    const offsetM      = isMGE ? 13702 : 13432;
    const mapXdimX2   = u16(b, offsetM + 0);   // actual cols × 2
    const mapYdim     = u16(b, offsetM + 2);   // actual rows
    const mapArea     = u16(b, offsetM + 4);   // XDim × YDim (total tiles)
    const resourceSeed = u16(b, offsetM + 8);  // map resource seed (0–63 used by formula)
    const mapLocX     = u16(b, offsetM + 10);  // minimap locator width
    const mapLocY     = u16(b, offsetM + 12);  // minimap locator height

    const mapCols   = mapXdimX2 / 2;
    const mapRows   = mapYdim;

    // Block 1: per-civ improvement visibility (7 civs × mapArea bytes)
    const ofsetB1 = offsetM + 14;
    // Block 2: terrain type + improvements + visibility (mapArea × 6 bytes)
    const ofsetB2 = ofsetB1 + 7 * mapArea;

    // --- Parse tiles ---
    const tiles            = Array.from({ length: mapRows }, () => new Array(mapCols).fill(null));
    const riverPresent     = Array.from({ length: mapRows }, () => new Uint8Array(mapCols));
    const resourcePresent  = Array.from({ length: mapRows }, () => new Uint8Array(mapCols));
    const tileImprovements = Array.from({ length: mapRows }, () =>
      Array.from({ length: mapCols }, () => ({
        road: false, railroad: false, irrigation: false, mine: false,
        fortress: false, pollution: false, fallout: false, hut: false, airbase: false,
      }))
    );
    const visibility = Array.from({ length: mapRows }, () => new Uint8Array(mapCols));

    for (let col = 0; col < mapCols; col++) {
      for (let row = 0; row < mapRows; row++) {
        const i   = row * mapCols + col;
        const b0  = b[ofsetB2 + i * 6 + 0]; // terrain + river/resource
        const b1  = b[ofsetB2 + i * 6 + 1]; // improvements
        const b4  = b[ofsetB2 + i * 6 + 4]; // visibility per civ (bit 0-7)

        const sheetRow = b0 & 0x0F;
        tiles[row][col]           = TERRAIN_BY_ROW[sheetRow] ?? TERRAIN.OCEAN;
        riverPresent[row][col]    = bit(b0, 7) ? 1 : 0;
        resourcePresent[row][col] = bit(b0, 6) ? 1 : 0;

        // Tile improvements — bit layout from axx0 Read.ClassicSav.cs:
        // bit 0: unit present, bit 1: city present, bit 2: irrigation/farmland,
        // bit 3: mining/farmland, bit 4: road, bit 5: railroad (requires road),
        // bit 6: fortress (or airbase if city), bit 7: pollution
        const hasCity      = bit(b1, 1);
        const hasIrr       = bit(b1, 2);
        const hasMine      = bit(b1, 3);
        const hasRoad      = bit(b1, 4);
        const hasRailroad  = hasRoad && bit(b1, 5);
        const hasFortress  = bit(b1, 6) && !hasCity;
        const hasAirbase   = bit(b1, 6) && hasCity; // city + fortress bit = airbase
        const hasPollution = bit(b1, 7) && !hasCity; // city + pollution bit = transporter (ignore)
        tileImprovements[row][col] = {
          road:       hasRoad,
          railroad:   hasRailroad,
          irrigation: hasIrr && !hasMine,  // irrigation only (not farmland)
          mine:       hasMine && !hasIrr,  // mine only (not farmland)
          fortress:   hasFortress,
          pollution:  hasPollution,
          fallout:    false,  // not stored in classic SAV format
          hut:        false,  // not stored in classic SAV format
          airbase:    hasAirbase,
        };

        // Player civ visibility (bit playersCivIdx of b4)
        if (mapRevealed) {
          visibility[row][col] = 2;
        } else {
          visibility[row][col] = bit(b4, playersCivIdx) ? 2 : 0;
        }
      }
    }

    // --- Compute river bitmasks from presence map ---
    const rivers = Array.from({ length: mapRows }, () => new Uint8Array(mapCols));
    for (let row = 0; row < mapRows; row++) {
      for (let col = 0; col < mapCols; col++) {
        if (!riverPresent[row][col]) continue;
        let mask = 0;
        const deltas = isoDeltas(row);
        for (let d = 0; d < 8; d++) {
          const nc = ((col + deltas[d][0]) % mapCols + mapCols) % mapCols;
          const nr = row + deltas[d][1];
          if (nr >= 0 && nr < mapRows && riverPresent[nr][nc]) mask |= (1 << d);
        }
        rivers[row][col] = mask;
      }
    }

    // --- Compute resources using the exact Civ2 formula ---
    // Reference: civfanatics.com/threads/518649  (via axx0/Civ2-clone Tile.cs)
    // X = 2*col + (row%2)  (C2 coordinate),  Y = row,  seed = mapResourceSeed
    //   a = (X+Y)>>1
    //   b = X - a
    //   c = 13*(b>>2) + 11*((X+Y)>>3) + seed
    //   has resource ↔  (a&3) + 4*(b&3) === (c&15)
    //   variant: d = 1<<((seed>>4)&3);  (d&a)==(d&b) → 1 (B), else 0 (A)
    const seed = resourceSeed & 0xFFFF;
    const resources = Array.from({ length: mapRows }, () => new Int8Array(mapCols).fill(-1));
    for (let row = 0; row < mapRows; row++) {
      for (let col = 0; col < mapCols; col++) {
        const X = 2 * col + (row % 2);
        const Y = row;
        const a = (X + Y) >> 1;
        const b = X - a;
        const c = 13 * (b >> 2) + 11 * ((X + Y) >> 3) + seed;
        if (((a & 3) + 4 * (b & 3)) === (c & 15)) {
          const d = 1 << ((seed >> 4) & 3);
          resources[row][col] = ((d & a) === (d & b)) ? 1 : 0;  // 1=B, 0=A
        }
      }
    }

    // ── Unit section ────────────────────────────────────────────────────────
    // After block 2, there are two unknown blocks before unit data.
    const ofsetUb1  = ofsetB2 + 6 * mapArea;
    const ofsetUb2  = ofsetUb1 + 2 * mapLocX * mapLocY;
    const unitMulti = isMGE ? 32 : 26;
    const ofsetU    = ofsetUb2 + 1024;

    const rawUnits = [];
    for (let i = 0; i < numberOfUnits; i++) {
      const base   = ofsetU + unitMulti * i;
      const savX   = u16(b, base + 0);
      const savY   = u16(b, base + 2);

      // Skip dead units (coordinates out of range)
      if (savX >= mapXdimX2 || savY >= mapYdim) continue;
      // C2 validity: x%2 must equal y%2
      if ((savX % 2) !== (savY % 2)) continue;

      // Convert C2 coords → (col, row)
      const col = (savX - savY % 2) / 2;
      const row = savY;

      const typeId       = b[base + 6];
      const savCivId     = b[base + 7];
      const moveLost     = b[base + 8];
      const hpLost       = b[base + 10];
      const isVeteran    = bit(b[base + 5], 5);
      const orderByte    = b[base + 15];
      const homeCityIdx  = b[base + 16];

      rawUnits.push({
        col, row, typeId, savCivId, moveLost, hpLost,
        isVeteran, orderByte, homeCityIdx,
      });
    }

    // ── City section ────────────────────────────────────────────────────────
    const cityMulti = isMGE ? 88 : 84;
    const ofsetC    = ofsetU + unitMulti * numberOfUnits;

    const rawCities = [];
    for (let i = 0; i < numberOfCities; i++) {
      const base = ofsetC + cityMulti * i;
      const savX = u16(b, base + 0);
      const savY = u16(b, base + 2);

      if (savX >= mapXdimX2 || savY >= mapYdim) continue;
      if ((savX % 2) !== (savY % 2)) continue;

      const col      = (savX - savY % 2) / 2;
      const row      = savY;
      const savCivId = b[base + 8];
      const size     = b[base + 9];
      const food     = u16(b, base + 26);
      const shields  = u16(b, base + 28);
      const name     = readStr(b, base + 32, 16);

      // Improvements bitmask: 9 bytes × 8 bits = 72 slots.
      // Index 0 = "Nothing" (skip), then ids 1-38 = improvements, 39-66 = wonders.
      const improvements = new Set();
      for (let block = 0; block < 9; block++) {
        const by = b[base + 52 + block];
        for (let bi = 0; bi < 8; bi++) {
          const id = block * 8 + bi;
          if (id === 0) continue; // "Nothing" placeholder
          if (id > 66) break;    // past last wonder
          if (by & (1 << bi)) improvements.add(id);
        }
      }

      // Production item: ≥0 = unit typeId; <0 = ~value gives improvement/wonder id
      const prodRaw  = b[base + 57];
      const prodSign = s8(prodRaw);
      let production = null;
      if (prodSign >= 0 && prodSign < UNITS.length) {
        production = { type: 'unit', id: prodSign };
      } else if (prodSign < 0) {
        const improvId = ~prodSign; // ~(-1)=0 (Nothing), ~(-2)=1 (Palace), …
        if (improvId > 0 && improvId <= 66) {
          production = { type: 'improvement', id: improvId };
        }
      }

      rawCities.push({ col, row, savCivId, size, food, shields, name, improvements, production });
    }

    // ── Build GameState ─────────────────────────────────────────────────────
    const gs = new GameState({ _skipInit: true });

    gs.mapCols = mapCols;
    gs.mapRows = mapRows;
    gs.turn    = Math.max(1, turnNumber);
    gs.activeCivIdx = 0;  // Start on human's turn
    gs.activeUnit   = null;
    gs._waitingUnits = [];
    gs.log          = [`Loaded Civ2 save (turn ${turnNumber}).`];
    gs.onEvent      = null;
    gs.gameOver     = null;
    gs.difficulty   = difficultyLevel;
    gs.barbarians   = 'sedentary';
    gs.barbarianCivIdx = -1;

    // War tracking, wonder flags, territory history
    gs._warSinceTurn     = new Map();
    gs._apolloBuilt      = false;
    gs._manhattanBuilt   = false;
    gs._unElectionUsed   = false;
    gs._territoryHistory = [];
    gs._palaceLevel      = [];

    gs.tiles             = tiles;
    gs._resources        = resources;
    gs._rivers           = rivers;
    gs._tileImprovements = tileImprovements;
    gs._visibility       = visibility;

    // --- Civ remapping: playersCivIdx (1-7) → ourCivId 0; others follow ---
    // SAV civ 0 = Barbarians (skip).
    const civMapping = new Map();        // savCivId → ourCivId
    civMapping.set(playersCivIdx, 0);    // human is always gs.civs[0]
    let ourIdx = 1;
    for (let sId = 1; sId <= 7; sId++) {
      if (sId !== playersCivIdx && civsInPlay[sId]) {
        civMapping.set(sId, ourIdx++);
      }
    }

    // Build gs.civs ordered by ourCivId
    const civArray = new Array(ourIdx).fill(null);
    for (const [savId, ourId] of civMapping) {
      const sd  = savCivs[savId];
      const tribeData = CIVS[sd.tribeId] ?? CIVS[0];
      const civ = new Civilization({ id: ourId, data: tribeData });
      civ.advances         = sd.advances;
      civ.gold             = sd.gold;
      civ.government       = sd.govtId;
      civ.sciRate          = sd.sciRate;
      civ.taxRate          = sd.taxRate;
      civ.luxRate          = Math.max(0, 100 - sd.sciRate - sd.taxRate);
      civ.beakers          = sd.beakers;
      civ.currentResearch  = sd.currentResearch;
      civ.anarchyTurnsLeft = 0;
      civ.alive            = sd.alive;
      // Translate relations: savCivId → ourCivId
      civ.relations = new Map();
      for (const [otherSavId, rel] of sd.relations) {
        if (civMapping.has(otherSavId)) {
          civ.relations.set(civMapping.get(otherSavId), rel);
        }
      }
      civ.contacts = new Set(
        [...sd.contacts].filter(otherSavId => civMapping.has(otherSavId)).map(otherSavId => civMapping.get(otherSavId))
      );
      civ.spaceship = { ...civ.spaceship, ...sd.spaceship };
      civArray[ourId] = civ;
    }
    gs.civs = civArray.filter(Boolean);

    // --- Units ---
    gs._nextUnitId = 0;
    gs.units = [];
    for (const ru of rawUnits) {
      if (!civMapping.has(ru.savCivId)) continue;       // skip barbarians + unknown
      if (ru.typeId >= UNITS.length) continue;           // unknown unit type
      const unitDef = UNITS[ru.typeId];
      const ourCivId = civMapping.get(ru.savCivId);
      const maxMoves = unitDef.move;
      const maxHp    = unitDef.hp;
      const movesLeft = (ourCivId === 0)
        ? Math.max(0, maxMoves - Math.floor(ru.moveLost / 3))
        : 0;
      const hp = Math.max(1, maxHp - ru.hpLost);

      const u = new Unit({
        id:       gs._nextUnitId++,
        typeId:   ru.typeId,
        civId:    ourCivId,
        col:      ru.col,
        row:      ru.row,
        hp,
        maxMoves,
      });
      u.maxHp    = maxHp;
      u.hp       = hp;
      u.veteran  = ru.isVeteran;
      u.movesLeft = movesLeft;

      // Map order byte to status
      if (ourCivId === 0) {
        if (ru.orderByte === 0) {
          u.status = 'fortified';
        } else if (ru.orderByte === 1) {
          u.status = 'sentry';
        } else if (movesLeft === 0) {
          u.status = 'done';
        } else {
          u.status = 'active';
        }
      } else {
        u.status = 'done';
      }

      // Home city (savCivId doesn't affect this — it's a city index)
      u.homeCity = (ru.homeCityIdx < numberOfCities) ? ru.homeCityIdx : null;

      gs.units.push(u);
    }

    // --- Cities ---
    gs._nextCityId = 0;
    gs.cities = [];
    for (const rc of rawCities) {
      if (!civMapping.has(rc.savCivId)) continue;
      const ourCivId = civMapping.get(rc.savCivId);
      const c = new City({
        id:    gs._nextCityId++,
        civId: ourCivId,
        col:   rc.col,
        row:   rc.row,
        name:  rc.name || `City ${gs._nextCityId}`,
      });
      c.size        = Math.max(1, rc.size);
      c.food        = rc.food;
      c.shields     = rc.shields;
      c.improvements = rc.improvements;
      c.production  = rc.production;
      gs.cities.push(c);
    }

    // Detect global wonder flags from city improvements
    for (const city of gs.cities) {
      if (city.improvements.has(62)) gs._manhattanBuilt = true;  // Manhattan Project
      if (city.improvements.has(64)) gs._apolloBuilt = true;     // Apollo Program
    }

    // Initialize war states from civ relations
    for (const civ of gs.civs) {
      for (const [otherId, rel] of civ.relations) {
        if (rel === 'war') {
          const key = `${Math.min(civ.id, otherId)}_${Math.max(civ.id, otherId)}`;
          if (!gs._warSinceTurn.has(key)) gs._warSinceTurn.set(key, gs.turn);
        }
      }
    }

    // Select first active human unit
    gs.activeUnit = gs.units.find(
      u => u.civId === 0 && u.status === 'active' && u.movesLeft > 0
    ) ?? null;

    // Update visibility around human units and cities
    gs._updateVisibility();

    return gs;
  }

  /**
   * Extract scenario metadata from a .SCN/.SAV buffer without full parsing.
   * Returns { civsInPlay: [{savId, tribeId, name}], turnNumber, difficultyLevel }.
   */
  static getScenarioInfo(buffer) {
    const b = new Uint8Array(buffer);
    const gameVersion = b[10];
    if (gameVersion > 44) throw new Error('Test of Time not supported');
    const isMGE = gameVersion >= 40;

    const paramsOffset = 24;
    const turnNumber      = u16(b, paramsOffset + 4);
    const difficultyLevel = b[paramsOffset + 20];
    const civsInPlayBits  = b[paramsOffset + 22];

    const offsetT = isMGE ? 2278 : 2264;
    const sizeT   = isMGE ? 1428 : 1396;

    const civsInPlay = [];
    for (let savId = 1; savId <= 7; savId++) {
      if (!(civsInPlayBits & (1 << savId))) continue;
      const base = offsetT + sizeT * savId;
      const tribeId = b[base + 6];
      const name = CIVS[tribeId]?.plural ?? `Civilization ${savId}`;
      civsInPlay.push({ savId, tribeId, name });
    }

    return { civsInPlay, turnNumber, difficultyLevel };
  }

  /**
   * Load a scenario from buffer, letting the player choose which civ to play.
   * @param {ArrayBuffer} buffer — raw file contents
   * @param {number} playerSavId — savId (1-7) of the civ the player wants to control
   * @param {object} [opts] — optional overrides: { maxTurns, scenarioName }
   * @returns {GameState}
   */
  static fromScenario(buffer, playerSavId, opts = {}) {
    // Patch the buffer to set playersCivIdx before parsing
    const b = new Uint8Array(buffer.slice(0)); // copy
    b[24 + 15] = playerSavId; // set playersCivIdx
    const gs = Civ2SaveLoader.fromBuffer(b.buffer);

    // Scenario metadata
    gs._scenarioName = opts.scenarioName ?? 'Scenario';
    gs._maxTurns     = opts.maxTurns ?? 0; // 0 = no limit
    gs._isScenario   = true;

    // Parse events.txt if provided
    if (opts.eventsText) {
      const ctx = {
        civNames:  gs.civs.map(c => c.data?.plural ?? ''),
        unitNames: UNITS.map(u => u.name),
        cityNames: gs.cities.map(c => c.name),
      };
      gs._scenarioEvents = parseEvents(opts.eventsText, ctx);
    }

    // Fire scenarioLoaded trigger
    executeEvents(gs, 'scenarioLoaded');

    return gs;
  }
}
