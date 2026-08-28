/**
 * IsoMath — isometric coordinate helpers for Civ II's diamond grid.
 *
 * Civ II uses a "staggered" isometric layout:
 *   - Original tile size: 64×32 px
 *   - Even rows start at x=0; odd rows are offset by 32px to the right
 *   - At 2× xBRZ scale, tiles become 128×64 px
 *
 * Screen origin (0,0) = top-left of the visible viewport.
 * Map origin (0,0) = top-left tile of the world map.
 */

export const TILE_W = 64;   // original px
export const TILE_H = 32;   // original px
export const SCALE  = 2;    // xBRZ scale factor

export const TILE_W_S = TILE_W * SCALE;  // 128 — scaled tile width
export const TILE_H_S = TILE_H * SCALE;  // 64  — scaled tile height

/**
 * Convert map tile coordinates to screen pixel position (top-left of tile).
 *
 * @param {number} col   — tile column (0-based)
 * @param {number} row   — tile row (0-based)
 * @param {number} viewX — viewport horizontal scroll offset in pixels
 * @param {number} viewY — viewport vertical scroll offset in pixels
 * @returns {{ x: number, y: number }}
 */
export function tileToScreen(col, row, viewX = 0, viewY = 0, zoomScale = 1) {
  const tileWS = Math.floor(TILE_W_S * zoomScale);
  const tileHS = Math.floor(TILE_H_S * zoomScale);
  const x = col * tileWS + (row % 2 === 1 ? tileWS / 2 : 0) - viewX;
  const y = row * (tileHS / 2) - viewY;
  return { x, y };
}

/**
 * Convert screen pixel position to the nearest map tile.
 * Returns null if the point falls outside any tile area (gap between rows).
 *
 * @param {number} px    — screen x in pixels
 * @param {number} py    — screen y in pixels
 * @param {number} viewX — viewport horizontal scroll offset
 * @param {number} viewY — viewport vertical scroll offset
 * @returns {{ col: number, row: number }}
 */
export function screenToTile(px, py, viewX = 0, viewY = 0, zoomScale = 1) {
  const tileWS = Math.floor(TILE_W_S * zoomScale);
  const tileHS = Math.floor(TILE_H_S * zoomScale);
  const wx = px + viewX;
  const wy = py + viewY;
  const rowApprox = Math.floor(wy / (tileHS / 2));
  let bestCol = 0;
  let bestRow = 0;
  let bestDist = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    const row = rowApprox + dr;
    if (row < 0) continue;
    const offsetX = row % 2 === 1 ? tileWS / 2 : 0;
    const col = Math.floor((wx - offsetX) / tileWS);
    const tileTopX = col * tileWS + offsetX;
    const tileTopY = row * (tileHS / 2);
    const relX = wx - tileTopX - tileWS / 2;
    const relY = wy - tileTopY - tileHS / 2;
    const inside = Math.abs(relX) / (tileWS / 2) + Math.abs(relY) / (tileHS / 2) <= 1;
    if (inside) {
      const dist = relX * relX + relY * relY;
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = col;
        bestRow = row;
      }
    }
  }
  if (bestDist === Infinity) return null;
  return { col: bestCol, row: bestRow };
}

/**
 * Return the pixel rect of a tile for clipping/drawing purposes.
 *
 * @param {number} col
 * @param {number} row
 * @param {number} viewX
 * @param {number} viewY
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function tileRect(col, row, viewX = 0, viewY = 0) {
  const { x, y } = tileToScreen(col, row, viewX, viewY);
  return { x, y, w: TILE_W_S, h: TILE_H_S };
}
