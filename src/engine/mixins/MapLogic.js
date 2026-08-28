import { TERRAIN, SPECIAL_RESOURCES } from '../../data/terrain.js';
import { UNITS } from '../../data/units.js';

// ─── Staggered-isometric 8-directional neighbour offsets ─────────────────────
// o = row % 2: odd rows are shifted right by half a tile width
/**
 * Return the 8 staggered-isometric neighbours of (col, row).
 * When mapCols is provided, columns are wrapped (horizontal world loop).
 */
export function neighbours(col, row, mapCols) {
  const o = row % 2;
  const w = mapCols
    ? c => ((c % mapCols) + mapCols) % mapCols
    : c => c;
  return [
    { col: w(col),          row: row - 2 }, // N
    { col: w(col + o),      row: row - 1 }, // NE
    { col: w(col + 1),      row           }, // E
    { col: w(col + o),      row: row + 1 }, // SE
    { col: w(col),          row: row + 2 }, // S
    { col: w(col + o - 1),  row: row + 1 }, // SW
    { col: w(col - 1),      row           }, // W
    { col: w(col + o - 1),  row: row - 1 }, // NW
  ];
}

/**
 * Return all 21 tiles of the Civ2 city "fat cross" working area.
 * Includes the city center tile.
 */
export function cityRadius(col, row) {
  const o = row & 1;
  const tiles = [];
  for (const [dr, dcArr] of [
    [-4, [0]],
    [-2, [-1, 0, 1]],
    [-1, [o - 2, o - 1, o, o + 1]],
    [ 0, [-2, -1, 0, 1, 2]],
    [+1, [o - 2, o - 1, o, o + 1]],
    [+2, [-1, 0, 1]],
    [+4, [0]],
  ]) {
    for (const dc of dcArr) {
      tiles.push({ row: row + dr, col: col + dc });
    }
  }
  return tiles;  // 21 tiles
}

export function applyMapLogicMixin(GameState) {

  GameState.prototype._computeIslands = function() {
    const { mapRows: rows, mapCols: cols } = this;
    const islands = Array.from({ length: rows }, () => new Int16Array(cols));
    const visited = new Uint8Array(rows * cols);
    const key = (r, c) => r * cols + c;

    const floodFill = (startR, startC, isOcean) => {
      const tiles = [];
      const queue = [startR, startC];
      visited[key(startR, startC)] = 1;
      let head = 0;
      while (head < queue.length) {
        const r = queue[head++];
        const c = queue[head++];
        tiles.push(r, c);
        const nbrs = neighbours(c, r, cols);
        for (const n of nbrs) {
          if (n.row < 0 || n.row >= rows) continue;
          const nk = key(n.row, n.col);
          if (visited[nk]) continue;
          const nIsOcean = this.tiles[n.row][n.col] === TERRAIN.OCEAN;
          if (nIsOcean !== isOcean) continue;
          visited[nk] = 1;
          queue.push(n.row, n.col);
        }
      }
      return tiles;
    };

    // Pass 1: land tiles
    const landIslands = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (visited[key(r, c)]) continue;
        if (this.tiles[r][c] === TERRAIN.OCEAN) continue;
        landIslands.push(floodFill(r, c, false));
      }
    }
    // Sort by size descending, assign IDs 1, 2, 3, …
    landIslands.sort((a, b) => b.length - a.length);
    for (let i = 0; i < landIslands.length; i++) {
      const id = i + 1;
      const arr = landIslands[i];
      for (let j = 0; j < arr.length; j += 2) {
        islands[arr[j]][arr[j + 1]] = id;
      }
    }

    // Pass 2: ocean tiles
    const oceanIslands = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (visited[key(r, c)]) continue;
        if (this.tiles[r][c] !== TERRAIN.OCEAN) continue;
        oceanIslands.push(floodFill(r, c, true));
      }
    }
    // Largest ocean = 0, rest = lastLandId+1, lastLandId+2, …
    oceanIslands.sort((a, b) => b.length - a.length);
    const nextId = landIslands.length + 1;
    for (let i = 0; i < oceanIslands.length; i++) {
      const id = i === 0 ? 0 : nextId + i - 1;
      const arr = oceanIslands[i];
      for (let j = 0; j < arr.length; j += 2) {
        islands[arr[j]][arr[j + 1]] = id;
      }
    }

    this._islands = islands;
  };

  GameState.prototype.getIslandId = function(col, row) {
    if (!this._islands) return -1;
    if (row < 0 || row >= this.mapRows || col < 0 || col >= this.mapCols) return -1;
    return this._islands[row][col];
  };

  GameState.prototype._findFreeLandTile = function(col, row) {
    const nbrs = neighbours(col, row, this.mapCols);
    for (const n of nbrs) {
      if (n.row < 0 || n.row >= this.mapRows) continue;
      if (this.tiles[n.row][n.col] === TERRAIN.OCEAN) continue;
      if (!this.units.some(u => u.col === n.col && u.row === n.row)) return n;
    }
    return null;
  };

  GameState.prototype._tilesInRange = function(col, row, range) {
    const visited  = new Set();
    const key      = (c, r) => r * this.mapCols + c;
    const result   = [];
    let   frontier = [];

    const add = (c, r) => {
      const k = key(c, r);
      if (visited.has(k) || r < 0 || r >= this.mapRows) return;
      visited.add(k);
      result.push({ col: c, row: r });
      frontier.push({ col: c, row: r });
    };

    add(col, row);

    for (let step = 0; step < range; step++) {
      const next = frontier;
      frontier = [];
      for (const pos of next) {
        for (const n of neighbours(pos.col, pos.row, this.mapCols)) add(n.col, n.row);
      }
    }

    return result;
  };

  GameState.prototype._updateVisibility = function() {
    const vis = this._visibility;

    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        if (vis[row][col] === 2) vis[row][col] = 1;
      }
    }

    const reveal = (col, row) => { vis[row][col] = 2; };

    for (const unit of this.units) {
      if (unit.civId !== 0) continue;
      const range = (UNITS[unit.typeId].flags & 0x0001) ? 2 : 1;
      for (const t of this._tilesInRange(unit.col, unit.row, range)) reveal(t.col, t.row);
    }

    for (const city of this.cities) {
      if (city.civId !== 0) continue;
      for (const t of this._tilesInRange(city.col, city.row, 2)) reveal(t.col, t.row);
    }
  };

  GameState.prototype._landTiles = function() {
    const out = [];
    for (let row = 0; row < this.mapRows; row++) {
      for (let col = 0; col < this.mapCols; col++) {
        if (this.tiles[row][col] !== TERRAIN.OCEAN) out.push({ col, row });
      }
    }
    return out;
  };

  GameState.prototype._pickStart = function(landTiles, usedSet) {
    let best = null, bestScore = -Infinity, sampled = 0;
    for (let attempt = 0; attempt < 300 && sampled < 40; attempt++) {
      const pos = landTiles[Math.floor(this.rng() * landTiles.length)];
      if (usedSet.has(`${pos.col},${pos.row}`)) continue;
      sampled++;
      const score = this._scoreForStart(pos.col, pos.row);
      if (score > bestScore) { bestScore = score; best = pos; }
    }
    return best ?? landTiles.find(p => !usedSet.has(`${p.col},${p.row}`)) ?? null;
  };

  GameState.prototype._scoreForStart = function(col, row) {
    const o = row % 2;
    const area = [
      { col,               row        },
      { col: col - 1,      row        }, { col: col + 1,   row        },
      { col: col + o,      row: row-1 }, { col: col+o-1,   row: row-1 },
      { col: col + o,      row: row+1 }, { col: col+o-1,   row: row+1 },
      { col,               row: row-2 }, { col,            row: row+2 },
    ];

    let score = 0;
    for (const n of area) {
      if (n.row < 0 || n.row >= this.mapRows) continue;
      const nc = (n.col + this.mapCols) % this.mapCols;
      const t  = this.tiles[n.row][nc];
      if (t === TERRAIN.OCEAN) continue;

      const res = this._resources[n.row][nc];
      if (res >= 0) {
        const r = SPECIAL_RESOURCES[res];
        score += r.food * 2 + r.shields + r.trade;
      } else {
        score += t.food * 2 + t.shields + t.trade;
      }
      if (this._rivers[n.row][nc] > 0) score += 1;
    }

    const latFrac = Math.abs(row / this.mapRows - 0.5) * 2;
    if (latFrac > 0.75) score -= 40;
    return score;
  };

  GameState.prototype._tileDist = function(a, b) {
    const dr = Math.abs(a.row - b.row);
    const dc = Math.abs(a.col - b.col);
    const wdc = Math.min(dc, this.mapCols - dc);
    return dr + wdc;
  };

}
