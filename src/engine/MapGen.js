/**
 * MapGen.js — Civ2-style procedural world generator.
 *
 * Algorithm (matches axx0/Civ2-clone MapGenerator.cs):
 *   1. Start with all ocean tiles + glacier at poles
 *   2. Flood-fill island growing: pick random seed, grow blob of random size
 *   3. Repeat until target land fraction is reached
 *   4. Assign terrain types based on latitude + moisture noise
 *   5. CA cleanup passes for isolated pixels
 *   6. River generation from mountains to ocean
 *   7. Special resource placement
 *
 * Returns: { tiles, resources, rivers }
 *   tiles[row][col]     — TERRAIN reference
 *   resources[row][col] — SPECIAL_RESOURCES index, or -1
 *   rivers[row][col]    — 8-bit direction bitmask
 */

import { TERRAIN, SPECIAL_RESOURCES } from '../data/terrain.js';

const MAX_RIVER_LEN   = 80;
const RIVER_MTN_RATE  = 0.30;
const RIVER_HILL_RATE = 0.15;

// Pre-built lookup: terrain key → matching SPECIAL_RESOURCES entries
const TERRAIN_KEY = Object.fromEntries(
  Object.entries(TERRAIN).map(([k, v]) => [v.id, k])
);
const TERRAIN_RESOURCES = {};
for (const key of Object.keys(TERRAIN)) {
  TERRAIN_RESOURCES[key] = SPECIAL_RESOURCES.filter(r => r.baseTerrain === key);
}

export class MapGen {
  constructor({ seed = 0xdeadbeef } = {}) {
    this.seed = seed | 0;
    this._rngState = this.seed;
  }

  /** Seeded PRNG (xorshift32) — returns float in [0,1). */
  _rng() {
    let x = this._rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this._rngState = x;
    return (x >>> 0) / 0x100000000;
  }

  /** Random int in [min, max). */
  _rngInt(min, max) {
    return min + Math.floor(this._rng() * (max - min));
  }

  /** Pick random element from an array. */
  _rngChoice(arr) {
    return arr[Math.floor(this._rng() * arr.length)];
  }

  /**
   * Generate a world map.
   * @param {number} cols
   * @param {number} rows
   * @param {'pangaea'|'continents'|'archipelago'|'random'} [worldType='continents']
   * @param {'arid'|'normal'|'wet'} [climate='normal']
   * @param {'cool'|'temperate'|'warm'} [temperature='temperate']
   * @param {'3b'|'4b'|'5b'} [age='4b']
   * @param {number} [landMass=1] — 0=Small, 1=Normal, 2=Large (Game.txt @CUSTOMLAND)
   * @returns {{ tiles, resources, rivers }}
   */
  generate(cols, rows, worldType = 'continents', climate = 'normal',
           temperature = 'temperate', age = '4b', landMass = 1) {
    this._rngState = this.seed; // Reset RNG for reproducibility

    // ── 1. Initialize all ocean + glacier at poles ──────────────────────────
    const tiles = [];
    for (let r = 0; r < rows; r++) {
      tiles[r] = [];
      for (let c = 0; c < cols; c++) {
        if (r === 0 || r === rows - 1) {
          tiles[r][c] = TERRAIN.GLACIER;
        } else {
          tiles[r][c] = TERRAIN.OCEAN;
        }
      }
    }

    // ── 2. Determine land fraction based on world type ──────────────────────
    // PropLand: pangaea = most land, archipelago = least
    const PROP_LAND = {
      pangaea:     0.42,
      continents:  0.30,
      archipelago: 0.18,
    };
    const resolvedType = worldType === 'random'
      ? this._rngChoice(['pangaea', 'continents', 'archipelago'])
      : worldType;
    // Land mass scaling: 0=Small (×0.75), 1=Normal (×1.0), 2=Large (×1.25)
    const LAND_SCALE = [0.75, 1.0, 1.25];
    const baseFraction = PROP_LAND[resolvedType] ?? PROP_LAND.continents;
    const landFraction = Math.min(0.55, baseFraction * (LAND_SCALE[landMass] ?? 1.0));
    const landRequired = Math.floor(cols * rows * landFraction);

    // Island size ranges depend on world type
    const ISLAND_SIZES = {
      pangaea:     [20, Math.floor(cols * rows * 0.15)],  // few large continents
      continents:  [5, Math.floor(cols * rows * 0.06)],   // medium landmasses
      archipelago: [2, 15],                                // many small islands
    };
    const [minIsland, maxIsland] = ISLAND_SIZES[resolvedType] ?? ISLAND_SIZES.continents;

    // ── 3. Flood-fill island growing ────────────────────────────────────────
    // Available tiles (not yet assigned, excluding poles)
    const available = new Set();
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        available.add(r * cols + c);
      }
    }

    let landUsed = 0;
    const landTiles = new Set();  // track which tiles became land

    while (landUsed < landRequired && available.size > 0) {
      // Pick a random available tile as island seed
      const avArr = [...available];
      const seedIdx = avArr[this._rngInt(0, avArr.length)];
      const seedR = Math.floor(seedIdx / cols);
      const seedC = seedIdx % cols;
      available.delete(seedIdx);

      // Skip if too close to poles (leave tundra buffer)
      if (seedR <= 1 || seedR >= rows - 2) continue;

      const islandSize = this._rngInt(minIsland, maxIsland + 1);
      const island = [seedIdx];
      tiles[seedR][seedC] = TERRAIN.GRASSLAND;  // placeholder — terrain assigned later
      landTiles.add(seedIdx);

      // Edge set: available neighbours of the growing island
      const edgeSet = [];
      const inEdge = new Set();

      // Add neighbours of seed to edge set
      this._addNeighboursToEdge(seedC, seedR, cols, rows, available, edgeSet, inEdge);

      // Grow the island
      while (island.length < islandSize && edgeSet.length > 0) {
        // Pick random edge tile
        const ei = this._rngInt(0, edgeSet.length);
        const chosen = edgeSet[ei];
        edgeSet[ei] = edgeSet[edgeSet.length - 1];
        edgeSet.pop();
        inEdge.delete(chosen);

        const cr = Math.floor(chosen / cols);
        const cc = chosen % cols;

        // Skip poles
        if (cr <= 0 || cr >= rows - 1) continue;

        island.push(chosen);
        tiles[cr][cc] = TERRAIN.GRASSLAND;  // placeholder
        landTiles.add(chosen);
        available.delete(chosen);

        this._addNeighboursToEdge(cc, cr, cols, rows, available, edgeSet, inEdge);
      }

      // Reserve coastal buffer — remove adjacent ocean tiles from available
      // to create spacing between islands (especially for continents/archipelago)
      for (const idx of edgeSet) {
        available.delete(idx);
      }

      landUsed += island.length;
    }

    // ── 4. Assign terrain types based on latitude + moisture noise ──────────
    const CL = {
      arid:   { moistDry: 0.45, moistMed: 0.65 },
      normal: { moistDry: 0.30, moistMed: 0.55 },
      wet:    { moistDry: 0.18, moistMed: 0.45 },
    };
    const cl = CL[climate] ?? CL.normal;

    const TMP = { cool: 0.82, temperate: 0.72, warm: 0.60 };
    const tempHot = TMP[temperature] ?? TMP.temperate;

    const AGE = {
      '3b': { mtnProb: 0.12, hillProb: 0.18 },  // young — many mountains
      '4b': { mtnProb: 0.07, hillProb: 0.13 },   // normal
      '5b': { mtnProb: 0.03, hillProb: 0.08 },   // old — few mountains
    };
    const ag = AGE[age] ?? AGE['4b'];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!landTiles.has(r * cols + c)) continue; // skip ocean/glacier

        const latTemp = 1 - Math.abs((r / (rows - 1)) * 2 - 1); // 0 at poles, 1 at equator

        // Near-polar land → tundra
        if (latTemp < 0.12) { tiles[r][c] = TERRAIN.TUNDRA; continue; }

        // Moisture from seeded noise
        const moist = this._noiseAt(c, r, cols, 2);

        // Mountains/hills: random chance modified by age
        const roughRoll = this._noiseAt(c, r, cols, 3);
        if (roughRoll < ag.mtnProb) {
          tiles[r][c] = latTemp < 0.2 ? TERRAIN.TUNDRA : TERRAIN.MOUNTAINS;
          continue;
        }
        if (roughRoll < ag.mtnProb + ag.hillProb) {
          tiles[r][c] = latTemp < 0.2 ? TERRAIN.TUNDRA : TERRAIN.HILLS;
          continue;
        }

        // Flat land — classified by moisture × temperature
        if (moist < cl.moistDry) {
          tiles[r][c] = latTemp < 0.30 ? TERRAIN.PLAINS : TERRAIN.DESERT;
        } else if (moist < cl.moistMed) {
          tiles[r][c] = latTemp > tempHot ? TERRAIN.PLAINS : TERRAIN.GRASSLAND;
        } else if (moist < 0.75) {
          tiles[r][c] = latTemp > tempHot ? TERRAIN.JUNGLE : TERRAIN.FOREST;
        } else {
          // Very wet
          if (latTemp > tempHot)       tiles[r][c] = TERRAIN.JUNGLE;
          else if (latTemp > 0.50)     tiles[r][c] = TERRAIN.SWAMP;
          else                         tiles[r][c] = TERRAIN.FOREST;
        }
      }
    }

    // ── 5. CA cleanup (2 passes) ────────────────────────────────────────────
    this._caSmooth(tiles, rows, cols);
    this._caSmooth(tiles, rows, cols);

    // ── 6. Rivers ───────────────────────────────────────────────────────────
    const rivers = this._generateRivers(tiles, rows, cols);

    // ── 7. Special resources ────────────────────────────────────────────────
    const resources = this._placeResources(tiles, rows, cols);

    return { tiles, resources, rivers };
  }

  /** Add grid neighbours of (c,r) to the edge set if they're still available. */
  _addNeighboursToEdge(c, r, cols, rows, available, edgeSet, inEdge) {
    // Use staggered-iso 6 cardinal directions for more organic shapes
    const o = r & 1;
    const nbrs = [
      [r - 2, c],             // N
      [r - 1, c + o],         // NE
      [r - 1, c + o - 1],     // NW
      [r + 1, c + o],         // SE
      [r + 1, c + o - 1],     // SW
      [r + 2, c],             // S
    ];
    for (const [nr, nc_raw] of nbrs) {
      if (nr < 1 || nr >= rows - 1) continue;
      const nc = ((nc_raw % cols) + cols) % cols;
      const idx = nr * cols + nc;
      if (available.has(idx) && !inEdge.has(idx)) {
        edgeSet.push(idx);
        inEdge.add(idx);
      }
    }
  }

  /** Seeded noise at a tile — returns [0,1). */
  _noiseAt(c, r, cols, channel) {
    return this._hash(c, r, 0, (this.seed ^ (Math.imul(channel, 0x9e3779b9) | 0)) | 0);
  }

  // ── Cellular-automaton smoothing ────────────────────────────────────────────
  _caSmooth(tiles, rows, cols) {
    const changes = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tiles[r][c];
        if (t === TERRAIN.GLACIER || t === TERRAIN.TUNDRA) continue;

        const isLand = t !== TERRAIN.OCEAN;
        let landCnt = 0;

        const cardinals = [
          [r - 1, c], [r + 1, c],
          [r, (c - 1 + cols) % cols], [r, (c + 1) % cols],
        ];
        for (const [nr, nc] of cardinals) {
          if (nr < 0 || nr >= rows) continue;
          if (tiles[nr][nc] !== TERRAIN.OCEAN) landCnt++;
        }

        if (isLand  && landCnt === 0) changes.push([r, c, TERRAIN.OCEAN]);
        if (!isLand && landCnt === 4) changes.push([r, c, TERRAIN.PLAINS]);
      }
    }
    for (const [r, c, t] of changes) tiles[r][c] = t;
  }

  // ── Staggered-iso 8-direction neighbours ────────────────────────────────────
  _nbrs(col, row, cols, rows) {
    const o = row % 2;
    return [
      { c: col,         r: row - 2, dir: 0 },
      { c: col + o,     r: row - 1, dir: 1 },
      { c: col + 1,     r: row,     dir: 2 },
      { c: col + o,     r: row + 1, dir: 3 },
      { c: col,         r: row + 2, dir: 4 },
      { c: col + o - 1, r: row + 1, dir: 5 },
      { c: col - 1,     r: row,     dir: 6 },
      { c: col + o - 1, r: row - 1, dir: 7 },
    ].map(n => ({ ...n, c: (n.c + cols) % cols }))
     .filter(n => n.r >= 0 && n.r < rows);
  }

  // ── River generation ────────────────────────────────────────────────────────
  _generateRivers(tiles, rows, cols) {
    const rivers = Array.from({ length: rows }, () => new Uint8Array(cols));

    // Build elevation map from terrain types (mountains highest, ocean lowest)
    const ELEV = {
      [TERRAIN.MOUNTAINS.id]: 6,
      [TERRAIN.HILLS.id]:     5,
      [TERRAIN.FOREST.id]:    3,
      [TERRAIN.JUNGLE.id]:    3,
      [TERRAIN.SWAMP.id]:     2,
      [TERRAIN.DESERT.id]:    2,
      [TERRAIN.PLAINS.id]:    2,
      [TERRAIN.GRASSLAND.id]: 2,
      [TERRAIN.TUNDRA.id]:    2,
      [TERRAIN.GLACIER.id]:   4,
      [TERRAIN.OCEAN.id]:     0,
    };

    // Add noise to elevation for variety
    const elev = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const base = ELEV[tiles[r][c].id] ?? 2;
        elev[r * cols + c] = base + this._hash(c, r, 0, 0x31337abc) * 1.5;
      }
    }

    // Collect sources
    const sources = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tiles[r][c];
        const isMtn = t === TERRAIN.MOUNTAINS;
        const isHill = t === TERRAIN.HILLS;
        if (!isMtn && !isHill) continue;
        const rate = isMtn ? RIVER_MTN_RATE : RIVER_HILL_RATE;
        if (this._hash(c, r, 0, 0xaaaa1234) < rate) {
          sources.push({ c, r, elev: elev[r * cols + c] });
        }
      }
    }

    sources.sort((a, b) => b.elev - a.elev);

    for (const src of sources) {
      let c = src.c, r = src.r;
      const visited = new Set();

      for (let step = 0; step < MAX_RIVER_LEN; step++) {
        const key = `${c},${r}`;
        if (visited.has(key)) break;
        visited.add(key);

        const nbrs = this._nbrs(c, r, cols, rows);
        let best = null, bestElev = elev[r * cols + c];
        for (const n of nbrs) {
          const ne = elev[n.r * cols + n.c];
          if (ne < bestElev) { bestElev = ne; best = n; }
        }
        if (!best) break;

        rivers[r][c] |= (1 << best.dir);
        rivers[best.r][best.c] |= (1 << ((best.dir + 4) % 8));

        if (tiles[best.r][best.c] === TERRAIN.OCEAN) break;

        c = best.c;
        r = best.r;
      }
    }

    // Post-process: add ocean adjacency bits to all river tiles
    // (axx0 Draw.Terrain.cs:532 — rivers connect to adjacent ocean tiles)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!rivers[r][c] || tiles[r][c] === TERRAIN.OCEAN) continue;
        const nbrs = this._nbrs(c, r, cols, rows);
        for (const n of nbrs) {
          if (tiles[n.r][n.c] === TERRAIN.OCEAN) rivers[r][c] |= (1 << n.dir);
        }
      }
    }

    return rivers;
  }

  // ── Special resource placement ──────────────────────────────────────────────
  _placeResources(tiles, rows, cols) {
    const resources = Array.from({ length: rows }, () => new Int8Array(cols).fill(-1));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tiles[r][c];
        const key = TERRAIN_KEY[t.id];
        if (!key) continue;

        const resList = TERRAIN_RESOURCES[key];
        if (!resList || resList.length === 0) continue;

        if ((this._hash(c, r, 0, 0x5f3759df) * 256 | 0) % 8 !== 0) continue;

        const variantIdx = (this._hash(c, r, 0, 0x12345678) * 2 | 0) % resList.length;
        resources[r][c] = resList[variantIdx].id;
      }
    }

    return resources;
  }

  /** Wang hash: (ix, iy, iz, salt) → float in [0,1]. */
  _hash(ix, iy, iz, salt) {
    let h = (this.seed ^ (salt | 0)) | 0;
    h ^= Math.imul(ix | 0, 0x6c62272e) | 0;
    h ^= Math.imul(iy | 0, 0x4c957f2d) | 0;
    h ^= Math.imul(iz | 0, 0xeef31db1) | 0;
    h  = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
    h  = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
    h ^= h >>> 16;
    return (h >>> 0) / 0xffffffff;
  }
}
