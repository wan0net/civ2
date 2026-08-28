/**
 * MapLoader.js — parse a Civ2 MGE .MP map file into game data structures.
 *
 * Binary format (little-endian):
 *   Bytes  0-1 : uint16  rawCols  (full width including interleaved placeholders;
 *                                 actual playable width = rawCols / 2)
 *   Bytes  2-3 : uint16  rows
 *   Bytes  4-5 : uint16  (map area or flat-earth flag)
 *   Bytes  6-7 : uint16  (flat-earth flag or area)
 *   Bytes  8-9 : uint16  resource seed  (same position as in SAV map block)
 *   Bytes 10-97: rest of header (civ names, difficulty — not parsed here)
 *   Bytes 98+  : (rawCols/2) × rows  tile records × 6 bytes each
 *
 * Confirmed byte layout (empirically verified against all 7 .MP files):
 *   byte[0] bits 0-3  terrain type  (= TERRAIN1.GIF sheetRow: 0=Desert … 10=Ocean)
 *   byte[0] bit  7    special resource present (bit 6 always 0 in known files)
 *   byte[1] bit  1    suspected road/improvement flag (~1% of tiles)
 *   byte[2] bit  5    river present (0x20; confirmed by visual map inspection)
 *   byte[4]           mirrors byte[0] (purpose unclear — possibly "base terrain" backup)
 *   byte[5]           visibility/ownership flags (0xF0 = explored, 0x10 = starting area)
 *
 * Resource placement uses the exact Civ2 formula (via axx0/Civ2-clone Tile.cs):
 *   X = 2*col+(row%2),  Y = row,  seed = resourceSeed
 *   a=(X+Y)>>1; b=X-a; c=13*(b>>2)+11*((X+Y)>>3)+seed
 *   hasResource: (a&3)+4*(b&3) === (c&15)
 *   variant:     d=1<<((seed>>4)&3); (d&a)==(d&b) → 1 (B), else 0 (A)
 */

import { TERRAIN } from '../data/terrain.js';

// ─── sheetRow → TERRAIN object ────────────────────────────────────────────────
const BY_SHEET_ROW = new Array(11);
for (const t of Object.values(TERRAIN)) BY_SHEET_ROW[t.sheetRow] = t;

/**
 * Compute the Civ2 special resource index for one tile.
 * Returns -1 (none), 0 (A-variant), or 1 (B-variant).
 */
function civ2Resource(col, row, seed) {
  const X = 2 * col + (row % 2);
  const Y = row;
  const a = (X + Y) >> 1;
  const b = X - a;
  const c = 13 * (b >> 2) + 11 * ((X + Y) >> 3) + seed;
  if (((a & 3) + 4 * (b & 3)) !== (c & 15)) return -1;
  const d = 1 << ((seed >> 4) & 3);
  return ((d & a) === (d & b)) ? 1 : 0;
}

// ─── Staggered-iso neighbour offsets (matches GameState.neighbours / MapGen._nbrs)
// [dc, dr, bitIndex]  — N=0,NE=1,E=2,SE=3,S=4,SW=5,W=6,NW=7
const NBRS = [
  [ 0, -2, 0], // N
  [ 0, -1, 1], // NE  (col offset added per-tile using o = row & 1)
  [ 1,  0, 2], // E
  [ 0,  1, 3], // SE  (col offset added per-tile)
  [ 0,  2, 4], // S
  [-1,  1, 5], // SW  (col offset added per-tile)
  [-1,  0, 6], // W
  [-1, -1, 7], // NW  (col offset added per-tile)
];
// Directions where col is shifted by +o (odd-row shift): NE(1), SE(3), SW(5), NW(7)
const ODD_SHIFT = new Set([1, 3, 5, 7]);

export class MapLoader {
  /**
   * Parse a Civ2 .MP ArrayBuffer.
   *
   * @param  {ArrayBuffer} buf
   * @returns {{
   *   tiles:        Array<Array<object>>,  // tiles[row][col] → TERRAIN reference
   *   resources:    Array<Int8Array>,       // resources[row][col] → SPECIAL_RESOURCES index or -1
   *   rivers:       Array<Uint8Array>,      // rivers[row][col] → 8-bit direction bitmask
   *   improvements: Array<Uint8Array>,      // improvements[row][col] → raw byte[1] flags
   *   cols:         number,
   *   rows:         number,
   * }}
   */
  static load(buf) {
    const dv = new DataView(buf);
    const rawCols      = dv.getUint16(0, true);
    const rows         = dv.getUint16(2, true);
    const resourceSeed = dv.getUint16(8, true);  // same position as in SAV map block
    const cols         = rawCols >> 1;            // playable width

    const HEADER_SIZE = 98;

    // Allocate output arrays
    const tiles        = Array.from({ length: rows }, () => new Array(cols).fill(TERRAIN.OCEAN));
    const hasRiver     = Array.from({ length: rows }, () => new Uint8Array(cols));
    const improvements = Array.from({ length: rows }, () => new Uint8Array(cols));

    // ── Pass 1: read raw tile data ────────────────────────────────────────────
    let offset = HEADER_SIZE;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const b0 = dv.getUint8(offset);
        const b1 = dv.getUint8(offset + 1);
        const b2 = dv.getUint8(offset + 2);

        const terrainByte = b0 & 0x0F;
        const riverBit    = (b2 >> 5) & 1;    // bit 5 of byte[2]  (confirmed: 0x20)

        tiles[row][col] = BY_SHEET_ROW[terrainByte] ?? TERRAIN.OCEAN;

        // Skip rivers on ocean tiles (coastal river-mouth bits are handled separately)
        if (riverBit && terrainByte !== 10) hasRiver[row][col] = 1;

        improvements[row][col] = b1;
        offset += 6;
      }
    }

    // ── Pass 1b: compute resources using the exact Civ2 formula ──────────────
    // civ2Resource returns 0 (A-variant) or 1 (B-variant).
    // Convert to absolute SPECIAL_RESOURCES ID: sheetRow + variant * 11
    // to match MapGen's format (both store absolute IDs 0-21).
    const resources = Array.from({ length: rows }, () => new Int8Array(cols).fill(-1));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const variant = civ2Resource(col, row, resourceSeed);
        if (variant >= 0) {
          const terrain = tiles[row][col];
          resources[row][col] = terrain.sheetRow + variant * 11;
        }
      }
    }

    // ── Pass 2: compute directional river bitmasks from neighbour connectivity ─
    const rivers = Array.from({ length: rows }, () => new Uint8Array(cols));

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!hasRiver[row][col]) continue;
        const o = row & 1;   // odd-row horizontal shift
        let mask = 0;

        for (let d = 0; d < 8; d++) {
          const [baseDc, dr, bit] = NBRS[d];
          const dc = ODD_SHIFT.has(d) ? baseDc + o : baseDc;
          const nr = row + dr;
          if (nr < 0 || nr >= rows) continue;
          const nc = ((col + dc) % cols + cols) % cols;   // east-west wrap
          // Rivers connect to adjacent rivers AND ocean tiles (axx0 Draw.Terrain.cs:532)
          if (hasRiver[nr][nc] || tiles[nr][nc] === TERRAIN.OCEAN) mask |= (1 << bit);
        }

        // Isolated river tile → show a small indicator (bit 0 = N direction)
        rivers[row][col] = mask || 1;
      }
    }

    return { tiles, resources, rivers, improvements, cols, rows };
  }
}
