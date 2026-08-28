/**
 * TerrainMixin — Extracted from MapRenderer.js.
 * All methods installed on MapRenderer.prototype.
 */
import { UNITS } from '../../data/units.js';
import { ADVANCES } from '../../data/advances.js';
import { TERRAIN, SPECIAL_RESOURCES } from '../../data/terrain.js';
import { tileToScreen, TILE_W_S, TILE_H_S } from '../../utils/IsoMath.js';
import {
  CIV_COLORS,
  CIV_LIGHT_COLORS,
  CIV_DARK_COLORS,
  UNIT_W_S,
  UNIT_H_S,
  UNITS_FLAG_LOCS,
  FONT,
  FONT_TIMES,
} from '../renderConstants.js';
import { assetUrl } from '../../utils/assets.js';

/** @param {typeof import('../MapRenderer.js').default} MapRenderer */
export function applyTerrainMixin(MapRenderer) {
  // ─── Warn-once helper for render-loop error logging ───────────────────────
  const _warnedOnce = new Set();
  function _warnOnce(key, msg) {
    if (!_warnedOnce.has(key)) {
      _warnedOnce.add(key);
      console.warn(`[TerrainMixin] ${msg}`);
    }
  }

  // ─── Terrain ───────────────────────────────────────────────────────────────

  MapRenderer.prototype._drawTileSprite = function(ctx, terrain, col, row, x, y) {
    // Validate terrain object before attempting to render
    if (!terrain || typeof terrain.sheetRow !== 'number') {
      this._drawTileFallback(ctx, terrain || { color: '#8b4513' }, x, y);
      return;
    }
    
    try {
      const base = this.sprites.getSprite('terrain', terrain.sheetRow, 0);
      ctx.drawImage(base, x, y, TILE_W_S, TILE_H_S);

      // Diagonal terrain blending — draw each diagonal neighbour's terrain
      // clipped to the corresponding corner triangle of this tile.
      this._drawDiagBlend(ctx, col, row, x, y);

      if (terrain === TERRAIN.OCEAN) {
        this._drawCoast(ctx, col, row, x, y);
        // River mouths on ocean tiles (axx0 Draw.Terrain.cs:125-145, TerrainLoader.cs:100-105)
        // TERRAIN2 row 10, cols 0-3 = NE, SE, SW, NW river mouths
        this._drawRiverMouths(ctx, col, row, x, y);
      }

      if (terrain.overlayRow !== undefined) {
        const mask    = this._overlayBitmask(terrain, col, row);
        const sprRow  = terrain.overlayRow + (mask >= 8 ? 1 : 0);
        const sprCol  = mask % 8;
        const overlay = this.sprites.getSprite('terrain2', sprRow, sprCol);
        ctx.drawImage(overlay, x, y, TILE_W_S, TILE_H_S);
      }
    } catch (e) {
      _warnOnce('tile-sprite:' + col + ',' + row, 'Sprite unavailable: ' + e.message);
      this._drawTileFallback(ctx, terrain, x, y);
    }
  }

  /**
   * Draw grassland shield and special resource overlays.
   * Called AFTER rivers (axx0 MapImage.cs:117-148 — rivers drawn before shield/resource).
   */
  MapRenderer.prototype._drawTileResource = function(ctx, terrain, col, row, x, y) {
    try {
      const resId = this._resources?.[row]?.[col] ?? -1;

      // Grassland shield overlay — drawn on tiles that produce shields (axx0 MapImage.cs lines 135-142)
      if (terrain === TERRAIN.GRASSLAND && resId < 0) {
        const X = 2 * col + (row % 2), Y = row;
        const rez4 = (Math.floor(Y / 2) + 2 * (Y % 2)) % 4;
        const rez3 = 8 - 2 * (rez4 % 4);
        if (((X - (Y % 2) + rez3) % 8) < 4) {
          const shieldSpr = this.sprites.getSprite('terrain', 7, 7);
          ctx.drawImage(shieldSpr, x, y, TILE_W_S, TILE_H_S);
        }
      }

      // Special resource overlay — sprite col 2 (first variant) or 3 (second)
       if (resId >= 0) {
         const resCol = resId >= 11 ? 3 : 2;
         const resSprite = this.sprites.getSprite('terrain', terrain.sheetRow, resCol);
         ctx.drawImage(resSprite, x, y, TILE_W_S, TILE_H_S);
       }
     } catch (e) {
       _warnOnce('resource:' + col + ',' + row, 'Resource sprite unavailable: ' + e.message);
     }
  }

  /**
   * Draw each diagonal neighbour's terrain clipped to the corresponding
   * corner triangle of this tile, creating Civ2-style terrain blending.
   *
   * Iso geometry: diagonal neighbours are always at pixel offsets
   *   NE (+64, -32),  SE (+64, +32),  SW (-64, +32),  NW (-64, -32)
   * relative to the current tile's screen top-left. Drawing the neighbour's
   * sprite at that offset and clipping to the corner quadrant produces a
   * seamless edge blend without needing special transition sprites.
   */
  /**
   * Dither-based terrain blending matching original Civ2.
   *
   * The dither tile (TERRAIN1 at 1,447 64×32) is a checkerboard mask split into
   * 4 quadrants (NE, SE, SW, NW). For each direct neighbour with a different
   * terrain type, the neighbour's base tile is drawn through the dither mask
   * at the corresponding quadrant, creating the classic stippled edge blend.
   */
  MapRenderer.prototype._drawDiagBlend = function(ctx, col, row, x, y) {
    const myTerrain = this._tiles[row]?.[col];
    if (!myTerrain || myTerrain === TERRAIN.OCEAN) return;

    // Build dither masks on first use (4 quadrants, each 32×16 → upscaled 64×32)
    if (!this._ditherMasks) {
      this._ditherMasks = this._buildDitherMasks();
    }

    const o = row & 1;
    // Direct neighbours in staggered iso: NE, SE, SW, NW
    // Each maps to a quadrant of the dither tile and a draw offset on the target tile
    const DIRS = [
      { dc:  o,   dr: -1, qx: 32, qy: 0  },  // NE quadrant
      { dc:  o,   dr: +1, qx: 32, qy: 16 },  // SE quadrant
      { dc: o-1,  dr: +1, qx: 0,  qy: 16 },  // SW quadrant
      { dc: o-1,  dr: -1, qx: 0,  qy: 0  },  // NW quadrant
    ];

    for (let i = 0; i < DIRS.length; i++) {
      const { dc, dr } = DIRS[i];
      const nr = row + dr;
      if (nr < 0 || nr >= this.mapRows) continue;
      const nc = ((col + dc) % this.mapCols + this.mapCols) % this.mapCols;

      let nb = this._tiles[nr]?.[nc];
      if (!nb || nb === myTerrain) continue;
      // Ocean neighbours blend as grassland (matches axx0)
      if (nb === TERRAIN.OCEAN) nb = TERRAIN.GRASSLAND;

       try {
         const ditherSprite = this._getDitheredQuadrant(nb.sheetRow, i);
         if (!ditherSprite) continue;
         // Each quadrant is half the tile: draw at the corresponding corner
         // Upscaled quadrant is 64×32, placed at quadrant offset within 128×64 tile
         const drawX = x + DIRS[i].qx * 2;  // upscaled offset
         const drawY = y + DIRS[i].qy * 2;
         ctx.drawImage(ditherSprite, drawX, drawY);
       } catch (e) {
         _warnOnce('diag-blend:' + col + ',' + row, 'Dither sprite unavailable: ' + e.message);
       }
    }
  }

  /** Build dither mask canvases from TERRAIN1 dither tile (1, 447, 64, 32). */
  MapRenderer.prototype._buildDitherMasks = function() {
    const sheet = this.sprites.getSheet('terrain');
    if (!sheet) return null;

    // Extract full dither tile at raw (1×) resolution
    const full = document.createElement('canvas');
    full.width = 64; full.height = 32;
    full.getContext('2d').drawImage(sheet, 1, 447, 64, 32, 0, 0, 64, 32);

    // Read pixel data — black pixels are "show neighbour", magenta/grey are "keep original"
    const fullData = full.getContext('2d').getImageData(0, 0, 64, 32);

    // Split into 4 quadrants (32×16 each) and convert to binary alpha masks
    // Quadrants: 0=NE(32,0), 1=SE(32,16), 2=SW(0,16), 3=NW(0,0)
    const quads = [
      { x: 32, y: 0 },   // NE
      { x: 32, y: 16 },  // SE
      { x: 0,  y: 16 },  // SW
      { x: 0,  y: 0 },   // NW
    ];

    const masks = [];
    for (const q of quads) {
      const qCanvas = document.createElement('canvas');
      qCanvas.width = 32; qCanvas.height = 16;
      const qCtx = qCanvas.getContext('2d');
      qCtx.drawImage(full, q.x, q.y, 32, 16, 0, 0, 32, 16);
      const qData = qCtx.getImageData(0, 0, 32, 16);
      const d = qData.data;
      // Convert: non-transparent dark pixels → opaque white (mask pass-through)
      // Everything else → transparent (mask blocked)
      for (let p = 0; p < d.length; p += 4) {
        const r = d[p], g = d[p+1], b = d[p+2], a = d[p+3];
        // Dark, opaque pixels are the dither dots where the neighbour shows.
        // SpriteManager has already keyed the mask's magenta and grey pixels
        // to transparent black, so alpha must participate in this test.
        const isDark = a > 0 && r < 80 && g < 80 && b < 80;
        if (isDark) {
          d[p] = 255; d[p+1] = 255; d[p+2] = 255; d[p+3] = 255;
        } else {
          d[p] = 0; d[p+1] = 0; d[p+2] = 0; d[p+3] = 0;
        }
      }
      qCtx.putImageData(qData, 0, 0);

      // Upscale 2× via nearest neighbour (not xBRZ — mask must stay crisp)
      const upCanvas = document.createElement('canvas');
      upCanvas.width = 64; upCanvas.height = 32;
      const upCtx = upCanvas.getContext('2d');
      upCtx.imageSmoothingEnabled = false;
      upCtx.drawImage(qCanvas, 0, 0, 64, 32);
      masks.push(upCanvas);
    }
    return masks;
  }

  /**
   * Get a dithered quadrant: the neighbour terrain's base tile masked by the
   * dither pattern for the given quadrant index.
   * Cached per (terrainRow, quadrant).
   */
  MapRenderer.prototype._getDitheredQuadrant = function(terrainSheetRow, quadIdx) {
    if (!this._ditherMasks) return null;
    const key = `dq:${terrainSheetRow}:${quadIdx}`;
    if (this._ditherCache?.has(key)) return this._ditherCache.get(key);
    if (!this._ditherCache) this._ditherCache = new Map();

    const mask = this._ditherMasks[quadIdx];
    if (!mask) return null;

    // Get the base terrain sprite (upscaled 2×)
    const baseSprite = this.sprites.getSprite('terrain', terrainSheetRow, 0);
    if (!baseSprite) return null;

    // Crop the base sprite to the quadrant region
    const qOffsets = [
      { x: 32, y: 0 },  // NE
      { x: 32, y: 16 }, // SE
      { x: 0,  y: 16 }, // SW
      { x: 0,  y: 0 },  // NW
    ];
    const qx = qOffsets[quadIdx].x * 2; // upscaled
    const qy = qOffsets[quadIdx].y * 2;

    const result = document.createElement('canvas');
    result.width = 64; result.height = 32;
    const rCtx = result.getContext('2d');

    // Draw the terrain quadrant
    rCtx.drawImage(baseSprite, qx, qy, 64, 32, 0, 0, 64, 32);
    // Apply dither mask: only keep pixels where mask is opaque
    rCtx.globalCompositeOperation = 'destination-in';
    rCtx.drawImage(mask, 0, 0);
    rCtx.globalCompositeOperation = 'source-over';

    this._ditherCache.set(key, result);
    return result;
  }

  MapRenderer.prototype._overlayBitmask = function(terrain, col, row) {
    const o    = row % 2;
    const tiles = this._tiles;
    const rows  = this.mapRows;
    const cols  = this.mapCols;

    const same = (r, c) => {
      if (r < 0 || r >= rows) return false;
      return tiles[r][((c % cols) + cols) % cols] === terrain;
    };

    const NE = same(row - 1, col + o);
    const SE = same(row + 1, col + o);
    const SW = same(row + 1, col + o - 1);
    const NW = same(row - 1, col + o - 1);

    return (NE ? 1 : 0) | (SE ? 2 : 0) | (SW ? 4 : 0) | (NW ? 8 : 0);
  }

  MapRenderer.prototype._drawCoast = function(ctx, col, row, x, y) {
    const tiles = this._tiles;
    const rows  = this.mapRows;
    const cols  = this.mapCols;
    const o     = row % 2;

    const isLand = (r, c) => {
      if (r < 0 || r >= rows) return false;
      return tiles[r][((c % cols) + cols) % cols] !== TERRAIN.OCEAN;
    };

    const N  = isLand(row - 2, col);
    const NE = isLand(row - 1, col + o);
    const E  = isLand(row,     col + 1);
    const SE = isLand(row + 1, col + o);
    const S  = isLand(row + 2, col);
    const SW = isLand(row + 1, col + o - 1);
    const W  = isLand(row,     col - 1);
    const NW = isLand(row - 1, col + o - 1);

    const vN = (NW ? 1 : 0) | (N  ? 2 : 0) | (NE ? 4 : 0);
    const vS = (SE ? 1 : 0) | (S  ? 2 : 0) | (SW ? 4 : 0);
    const vW = (SW ? 1 : 0) | (W  ? 2 : 0) | (NW ? 4 : 0);
    const vE = (NE ? 1 : 0) | (E  ? 2 : 0) | (SE ? 4 : 0);

    const W2 = TILE_W_S / 2, H2 = TILE_H_S / 2;
    const W4 = TILE_W_S / 4, H4 = TILE_H_S / 4;

    try {
      ctx.drawImage(this.sprites.getCoastSprite(vN, 0), x + W4, y,      W2, H2);
      ctx.drawImage(this.sprites.getCoastSprite(vS, 1), x + W4, y + H2, W2, H2);
      ctx.drawImage(this.sprites.getCoastSprite(vW, 2), x,      y + H4, W2, H2);
      ctx.drawImage(this.sprites.getCoastSprite(vE, 3), x + W2, y + H4, W2, H2);
    } catch (e) {
      _warnOnce('coast:' + col + ',' + row, 'Coast sprites unavailable: ' + e.message);
    }
  }

  MapRenderer.prototype._drawTileFallback = function(ctx, terrain, x, y) {
    const cx = x + TILE_W_S / 2;
    const cy = y + TILE_H_S / 2;
    const hw = TILE_W_S / 2;
    const hh = TILE_H_S / 2;

    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx,      cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = terrain.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Green tinted diamond highlight on a reachable tile in move mode. */
  MapRenderer.prototype._drawRangeReachable = function(ctx, x, y) {
    const cx = x + TILE_W_S / 2;
    const cy = y + TILE_H_S / 2;
    const hw = TILE_W_S / 2;
    const hh = TILE_H_S / 2;

    // Green fill
    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx,      cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 210, 80, 0.22)';
    ctx.fill();

    // Green border
    ctx.strokeStyle = 'rgba(0, 240, 80, 0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Original Civ2 does not show remaining-move labels on tiles
  }

  /** Red-tinted diamond on a visible-but-out-of-range tile in move mode. */
  MapRenderer.prototype._drawRangeBlocked = function(ctx, x, y) {
    const cx = x + TILE_W_S / 2;
    const cy = y + TILE_H_S / 2;
    const hw = TILE_W_S / 2;
    const hh = TILE_H_S / 2;
    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx,      cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(200, 40, 0, 0.20)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 60, 0, 0.40)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Semi-transparent black diamond drawn over explored-but-not-visible tiles. */
  /**
   * Draw dithered fog edges on a tile where its direct neighbours are unexplored (vis=0).
   * Matching axx0 MapImage.cs lines 240-249: each quadrant gets a checkerboard dither
   * mask if the neighbour in that direction has never been explored.
   *
   * Original Civ2 does NOT darken explored-but-not-visible tiles globally —
   * the only visual cue is a dithered edge at boundaries with unexplored areas.
   */
  MapRenderer.prototype._drawFogDither = function(ctx, x, y, col, row) {
    // axx0 MapImage.cs suppresses fog-edge dithering when MapRevealed is set.
    // Otherwise every normally hidden tile sees four hidden neighbours and
    // the revealed map becomes a distracting grid of black dotted diamonds.
    if (this._showHiddenTerrain) return;

    const vis = this.gameState._visibility;
    const o = row % 2;
    // Direct (diagonal) neighbours: NE, SE, SW, NW — matching axx0's directNeighbours order
    const DIRS = [
      { dc:  o,   dr: -1 },  // NE
      { dc:  o,   dr: +1 },  // SE
      { dc: o-1,  dr: +1 },  // SW
      { dc: o-1,  dr: -1 },  // NW
    ];

    // Build quadrant dither masks once from TERRAIN1 dither tile
    // Creates semi-transparent black fog instead of using dark blank tile
    if (!this._fogDitherQuads) {
      this._fogDitherQuads = [];
      const sheet = this.sprites.getSheet('terrain');
      if (sheet) {
        const hw = 32, hh = 16;
        // Quadrants ordered to match DIRS: NE, SE, SW, NW
        // Each quad specifies: source position in sprite (sx, sy), draw offset (ox, oy)
        // DitherMaps[0] is NE edge, drawn at top-right (32,0) -> upscaled (64,0)
        // DitherMaps[1] is SE edge, drawn at bottom-right (32,16) -> upscaled (64,32)
        // DitherMaps[2] is SW edge, drawn at bottom-left (0,16) -> upscaled (0,32)
        // DitherMaps[3] is NW edge, drawn at top-left (0,0) -> upscaled (0,0)
        const quads = [
          { sx: 32, sy: 0,  ox: 64, oy: 0  },  // index 0: NE edge, top-right of tile
          { sx: 32, sy: 16, ox: 64, oy: 32 },  // index 1: SE edge, bottom-right of tile
          { sx: 0,  sy: 16, ox: 0,  oy: 32 },  // index 2: SW edge, bottom-left of tile
          { sx: 0,  sy: 0,  ox: 0,  oy: 0  },  // index 3: NW edge, top-left of tile
        ];
        for (const q of quads) {
          const maskC = document.createElement('canvas');
          maskC.width = hw; maskC.height = hh;
          const maskCtx = maskC.getContext('2d');
          maskCtx.drawImage(sheet, 1 + q.sx, 447 + q.sy, hw, hh, 0, 0, hw, hh);
          const maskData = maskCtx.getImageData(0, 0, hw, hh);
          const d = maskData.data;
          for (let p = 0; p < d.length; p += 4) {
            const r = d[p], g = d[p+1], b = d[p+2], a = d[p+3];
            // SpriteManager has already chroma-keyed the magenta/grey guide
            // pixels. Canvas reports those transparent pixels as black, so
            // alpha must participate in the test or the whole quadrant turns
            // into fog instead of retaining the sparse MGE dither dots.
            const isDark = a > 0 && r < 80 && g < 80 && b < 80;
            d[p] = 0; d[p+1] = 0; d[p+2] = 0;
            d[p+3] = isDark ? 128 : 0;
          }
          maskCtx.putImageData(maskData, 0, 0);

          const upC = document.createElement('canvas');
          upC.width = hw * 2; upC.height = hh * 2;
          const upCtx = upC.getContext('2d');
          upCtx.imageSmoothingEnabled = false;
          upCtx.drawImage(maskC, 0, 0, hw * 2, hh * 2);

          this._fogDitherQuads.push({ canvas: upC, ox: q.ox, oy: q.oy });
        }
      }
    }

    if (!this._fogDitherQuads.length) return;

    for (let i = 0; i < 4; i++) {
      const d = DIRS[i];
      const nc = ((col + d.dc) % this.mapCols + this.mapCols) % this.mapCols;
      const nr = row + d.dr;
      // Draw dither if neighbour is off-map or unexplored (vis=0)
      if (nr < 0 || nr >= this.mapRows || (vis[nr]?.[nc] ?? 0) === 0) {
        const q = this._fogDitherQuads[i];
        ctx.drawImage(q.canvas, x + q.ox, y + q.oy);
      }
    }
  }

  /**
   * Draw terrain improvement icons on a tile: roads (lines), irrigation (blue
   * stripes), mines (crossed lines), fortress (square border).
   */
  MapRenderer.prototype._drawTileImprovements = function(ctx, col, row, x, y) {
    const ti = this.gameState._tileImprovements[row]?.[col];
    if (!ti || (!ti.road && !ti.railroad && !ti.irrigation && !ti.mine && !ti.pollution && !ti.fallout && !ti.hut && !ti.fortress && !ti.airbase)) return;

    const cx = x + TILE_W_S / 2;
    const cy = y + TILE_H_S / 2;

    // Road/Railroad sprites — uses TERRAIN1.GIF rows 11/12 (9 directional segments)
    // Segment indices: 0=isolated dot, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW, 8=N
    // axx0 Civ2GoldInterface.cs: road srcY=363, railroad srcY=397, both srcX=1+65*col, w=64, h=32
    if (ti.road || ti.railroad) {
      const o = row % 2;
      // Direction order: N, NE, E, SE, S, SW, W, NW → segment indices 8,1,2,3,4,5,6,7
      const nbDirs = [
        { dc: 0,   dr: -2, segIdx: 8 }, // N
        { dc: o,   dr: -1, segIdx: 1 }, // NE
        { dc: 1,   dr:  0, segIdx: 2 }, // E
        { dc: o,   dr:  1, segIdx: 3 }, // SE
        { dc: 0,   dr:  2, segIdx: 4 }, // S
        { dc: o-1, dr:  1, segIdx: 5 }, // SW
        { dc: -1,  dr:  0, segIdx: 6 }, // W
        { dc: o-1, dr: -1, segIdx: 7 }, // NW
      ];

      if (ti.road) {
        // Draw road segment for each neighbour that also has road
        // axx0: srcY=363 (NOT 1+11*33=364 — off by 1), srcX=1+65*col
        let hasNeighbor = false;
        for (const { dc, dr, segIdx } of nbDirs) {
          const nc = ((col + dc) % this.mapCols + this.mapCols) % this.mapCols;
          const nr = row + dr;
          if (nr < 0 || nr >= this.mapRows) continue;
          if (!this.gameState._tileImprovements[nr]?.[nc]?.road) continue;
          hasNeighbor = true;
          const spr = this.sprites.getRegionSprite('terrain', 1 + 65 * segIdx, 363, 64, 32);
          if (spr) ctx.drawImage(spr, x, y, TILE_W_S, TILE_H_S);
        }
        if (!hasNeighbor) {
          const spr = this.sprites.getRegionSprite('terrain', 1, 363, 64, 32);
          if (spr) ctx.drawImage(spr, x, y, TILE_W_S, TILE_H_S);
        }
      }

      if (ti.railroad) {
        let hasNeighbor = false;
        for (const { dc, dr, segIdx } of nbDirs) {
          const nc = ((col + dc) % this.mapCols + this.mapCols) % this.mapCols;
          const nr = row + dr;
          if (nr < 0 || nr >= this.mapRows) continue;
          if (!this.gameState._tileImprovements[nr]?.[nc]?.railroad) continue;
          hasNeighbor = true;
          const spr = this.sprites.getSprite('terrain', 12, segIdx);
          if (spr) ctx.drawImage(spr, x, y, TILE_W_S, TILE_H_S);
        }
        if (!hasNeighbor) {
          const spr = this.sprites.getSprite('terrain', 12, 0);
          if (spr) ctx.drawImage(spr, x, y, TILE_W_S, TILE_H_S);
        }
      }
    }

    // Irrigation / Farmland — TERRAIN1.GIF
    // axx0: irrigation at (456,100,64,32), farmland at (456,133,64,32)
    if (ti.irrigation) {
      try {
        if (ti.farmland) {
          const spr = this.sprites.getRegionSprite('terrain', 456, 133, 64, 32);
          if (spr) ctx.drawImage(spr, x, y, TILE_W_S, TILE_H_S);
        } else {
          const spr = this.sprites.getSprite('terrain', 3, 7);
          if (spr) ctx.drawImage(spr, x, y, TILE_W_S, TILE_H_S);
        }
      } catch (e) {
        _warnOnce('irrigation:' + col + ',' + row, 'Irrigation sprite unavailable: ' + e.message);
      }
    }

    // Mine — TERRAIN1.GIF at (456, 166) = terrain row=5, col=7
    if (ti.mine) {
      try {
        const spr = this.sprites.getSprite('terrain', 5, 7);
        if (spr) ctx.drawImage(spr, x, y, TILE_W_S, TILE_H_S);
      } catch (e) {
        _warnOnce('mine:' + col + ',' + row, 'Mine sprite unavailable: ' + e.message);
      }
    }

    if (ti.fortress) {
      try {
        // Fortress: CITIES.GIF at (208, 423, 64, 48) — axx0 Civ2GoldInterface.cs
        const spr = this.sprites.getRegionSprite('cities', 208, 423, 64, 48);
        if (spr) ctx.drawImage(spr, x, y - TILE_H_S / 2, TILE_W_S, TILE_H_S * 1.5);
      } catch (e) {
        _warnOnce('fortress:' + col + ',' + row, 'Fortress sprite unavailable: ' + e.message);
      }
    }

    // Pollution — TERRAIN1.GIF at (456, 199) = terrain row=6, col=7
    if (ti.pollution) {
      try {
        const spr = this.sprites.getSprite('terrain', 6, 7);
        if (spr) ctx.drawImage(spr, x, y, TILE_W_S, TILE_H_S);
      } catch (e) {
        _warnOnce('pollution:' + col + ',' + row, 'Pollution sprite unavailable: ' + e.message);
      }
    }

    // Fallout — uses same sprite as pollution (axx0 has no distinct fallout sprite)
    if (ti.fallout) {
      try {
        const spr = this.sprites.getSprite('terrain', 6, 7);
        if (spr) ctx.drawImage(spr, x, y, TILE_W_S, TILE_H_S);
      } catch (e) {
        _warnOnce('fallout:' + col + ',' + row, 'Fallout sprite unavailable: ' + e.message);
      }
    }

    // Hut — TERRAIN1.GIF at (456, 265) = terrain row=8, col=7
    if (ti.hut) {
      try {
        const spr = this.sprites.getSprite('terrain', 8, 7);
        if (spr) ctx.drawImage(spr, x, y, TILE_W_S, TILE_H_S);
      } catch (e) {
        _warnOnce('hut:' + col + ',' + row, 'Hut sprite unavailable: ' + e.message);
      }
    }

    if (ti.airbase) {
      try {
        // Airbase: CITIES.GIF at (273, 423, 64, 48) empty, (338, 423, 64, 48) full
        // axx0 CityLoader.cs: UnitLevels drawn when tile.IsUnitPresent
        const hasUnits = this.gameState.unitsAt(col, row).length > 0;
        const srcX = hasUnits ? 338 : 273;
        const spr = this.sprites.getRegionSprite('cities', srcX, 423, 64, 48);
        if (spr) ctx.drawImage(spr, x, y - TILE_H_S / 2, TILE_W_S, TILE_H_S * 1.5);
      } catch (e) {
        _warnOnce('airbase:' + col + ',' + row, 'Airbase sprite unavailable: ' + e.message);
      }
    }
  }

  /**
   * Draw river overlay using TERRAIN2 rows 2-3.
   * Uses the same 4-diagonal-neighbour bitmask as forest/hills overlays:
   *   NE=bit0, SE=bit1, SW=bit2, NW=bit3 → 16 combinations across 2 rows × 8 cols.
   */
  MapRenderer.prototype._drawRiver = function(ctx, col, row, x, y) {
    const riverMask = this._rivers?.[row]?.[col] ?? 0;
    if (!riverMask) return;

    // MapLoader stores 8-bit directional connectivity: N=0,NE=1,E=2,SE=3,S=4,SW=5,W=6,NW=7
    // Extract the 4 diagonal bits — these correspond to tile-edge connections in staggered iso.
    // Remap to the TERRAIN2 4-bit overlay format: NE=bit0, SE=bit1, SW=bit2, NW=bit3
    const NE = (riverMask >> 1) & 1;
    const SE = (riverMask >> 3) & 1;
    const SW = (riverMask >> 5) & 1;
    const NW = (riverMask >> 7) & 1;

    const mask   = NE | (SE << 1) | (SW << 2) | (NW << 3);
    const sprRow = 2 + (mask >= 8 ? 1 : 0);
    const sprCol = mask % 8;

    try {
      const sprite = this.sprites.getSprite('terrain2', sprRow, sprCol);
      ctx.drawImage(sprite, x, y, TILE_W_S, TILE_H_S);
    } catch (e) {
      _warnOnce('river:' + col + ',' + row, 'River sprite unavailable: ' + e.message);
    }
  }

  /**
   * Draw river mouth sprites on ocean tiles where adjacent land tiles have rivers.
   * axx0 Draw.Terrain.cs:125-145, TerrainLoader.cs:100-105.
   * TERRAIN2 row 10, cols 0=NE, 1=SE, 2=SW, 3=NW.
   */
  MapRenderer.prototype._drawRiverMouths = function(ctx, col, row, x, y) {
    const o = row % 2;
    // Diagonal neighbours: NE, SE, SW, NW (matching staggered iso)
    const DIRS = [
      { dc:  o,   dr: -1 },  // NE
      { dc:  o,   dr: +1 },  // SE
      { dc: o-1,  dr: +1 },  // SW
      { dc: o-1,  dr: -1 },  // NW
    ];
    for (let i = 0; i < 4; i++) {
      const d = DIRS[i];
      const nc = ((col + d.dc) % this.mapCols + this.mapCols) % this.mapCols;
      const nr = row + d.dr;
      if (nr < 0 || nr >= this.mapRows) continue;
      const nTerrain = this._tiles?.[nr]?.[nc];
      if (!nTerrain || nTerrain === TERRAIN.OCEAN) continue; // must be land
      const nRiver = this._rivers?.[nr]?.[nc] ?? 0;
      if (!nRiver) continue; // land tile must have a river
      try {
        const mouthSpr = this.sprites.getSprite('terrain2', 10, i);
        ctx.drawImage(mouthSpr, x, y, TILE_W_S, TILE_H_S);
      } catch (e) {
        _warnOnce('river-mouth:' + col + ',' + row, 'River mouth sprite unavailable: ' + e.message);
      }
    }
  }

  MapRenderer.prototype._drawHoverHighlight = function(ctx, x, y) {
    const cx = x + TILE_W_S / 2;
    const cy = y + TILE_H_S / 2;
    const hw = TILE_W_S / 2;
    const hh = TILE_H_S / 2;

    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx,      cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 255, 200, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ─── City ──────────────────────────────────────────────────────────────────

  /** Resolve the exact MGE city sprite for map and city-screen rendering. */
  MapRenderer.prototype._getCitySpriteInfo = function(city) {
    const civ  = this.gameState.civs[city.civId];
    const pop  = city.size;

    // Compute civ epoch from highest-epoch advance discovered
    // 0=Ancient, 1=Renaissance, 2=Industrial, 3=Modern
    const civEpoch = this._getCivEpoch(city.civId);

    // City style row: styles 0-3 for Ancient/Renaissance, 4 for Industrial, 5 for Modern
    // Matches axx0 Civ2Interface.GetCityStyleIndexFromEpoch
    const baseStyle = civ?.cityStyle ?? civ?.data?.cityStyle ?? 0;
    const styleRow = civEpoch >= 3 ? 5 : civEpoch >= 2 ? 4 : baseStyle;

    // Size column within style — matches axx0 Civ2Interface.GetCityIndexForStyle
    let sizeCol;
    if (styleRow === 5) {        // Modern
      sizeCol = pop <= 4 ? 0 : pop <= 10 ? 1 : pop <= 18 ? 2 : 3;
    } else if (styleRow === 4) { // Industrial
      sizeCol = pop <= 4 ? 0 : pop <= 7 ? 1 : pop <= 10 ? 2 : 3;
    } else {                     // Ancient/Renaissance (styles 0-3)
      sizeCol = pop <= 3 ? 0 : pop <= 5 ? 1 : pop <= 7 ? 2 : 3;
    }

    // Capital city gets +1 to column (Palace = improvement 1)
    if (sizeCol < 3 && city.improvements?.has(1)) sizeCol++;

    // Use citiesWalled sheet if city has City Walls (improvement id 8)
    // or Great Wall wonder (id 45) is active for this civ (axx0 Draw.City.cs:75-78)
    const gs = this.gameState;
    const hasWalls = city.improvements?.has(8) ||
      gs._civHasWonder(city.civId, 45);
    const sheet = hasWalls ? 'citiesWalled' : 'cities';

    return { styleRow, sizeCol, sheet, hasWalls };
  };

  MapRenderer.prototype._drawCity = function(ctx, city, x, y, spritesReady) {
    const civ  = this.gameState.civs[city.civId];
    const pop  = city.size;
    const gs = this.gameState;
    const { styleRow, sizeCol, sheet, hasWalls } = this._getCitySpriteInfo(city);

    const scale  = UNIT_W_S / 64;   // = 2 at native xBRZ scale
    const destX  = x;
    const destY  = y - TILE_H_S / 2;

    if (spritesReady) {
      try {
        const sprite = this.sprites.getSprite(sheet, styleRow, sizeCol);
        ctx.drawImage(sprite, destX, destY, UNIT_W_S, UNIT_H_S);
      } catch (e) {
        _warnOnce('city:' + city.col + ',' + city.row, 'City sprite unavailable: ' + e.message);
      }
    }

    if (!spritesReady) {
      const color = CIV_COLORS[civ?.data?.color ?? 0];
      ctx.fillStyle = color;
      ctx.fillRect(x + TILE_W_S / 4, y, TILE_W_S / 2, TILE_H_S);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + TILE_W_S / 4, y, TILE_W_S / 2, TILE_H_S);
    }

    // Population size badge + flag (axx0 Draw.City.cs:91-129)
    const sheetType = hasWalls ? 'walled' : 'open';
    const cellData = this._citySpriteData?.[sheetType]?.[styleRow]?.[sizeCol];
    const civColorIdx = civ?.data?.color ?? 0;
    if (cellData && spritesReady) {
      // Size badge: civ light-colour rect with black border + population number
      const { sizeLoc, flagLoc } = cellData;
      const sizeText = String(pop);
      ctx.font = `bold ${10 * scale}px ${FONT_TIMES}`;
      const tm = ctx.measureText(sizeText);
      const tw = Math.ceil(tm.width);
      const th = Math.ceil(10 * scale);
      const bx = destX + sizeLoc.x * scale - scale;
      const by = destY + sizeLoc.y * scale - scale;

      // Black border
      ctx.fillStyle = '#000000';
      ctx.fillRect(bx, by, tw + 2 * scale, th + 2 * scale);
      // Civ light-colour fill
      const lightClr = this._civLightColors?.[civColorIdx] ?? CIV_COLORS[civColorIdx];
      ctx.fillStyle = lightClr;
      ctx.fillRect(bx + scale, by + scale, tw, th);
      // Population number in black
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sizeText, bx + tw / 2 + scale, by + th / 2 + scale);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // Flag sprite if units are present in the city.  The marker is the
      // flag's left edge; only its Y position is raised by flagHeight - 5
      // (axx0 BaseGameView.cs:244-247).
      const unitsPresent = gs.unitsAt(city.col, city.row).length > 0;
      if (unitsPresent && this._civFlagSprites?.[civColorIdx]) {
        const flagSpr = this._civFlagSprites[civColorIdx];
        ctx.drawImage(flagSpr,
          destX + flagLoc.x * scale,
          destY + (flagLoc.y - 17) * scale,
          14 * scale, 22 * scale);
      }
    }

    // City name is drawn in a separate last pass (_drawCityName)
    // so it appears on top of all other map elements (axx0 Draw.Map.cs:135-140)
  }

  /**
   * Draw city name label — called in a separate pass after all tiles/units/cities.
   * axx0 Draw.City.cs lines 132-184: TNR font, L-shaped black shadow, civ TextColour.
   */
  MapRenderer.prototype._drawCityName = function(ctx, city, x, y) {
    const civ = this.gameState.civs[city.civId];
    const civColor = CIV_COLORS[civ?.data?.color ?? 0];
    ctx.font = FONT.BUTTON;
    const nameX = x + TILE_W_S / 2;
    const labelY = y + TILE_H_S / 2 + 10;
    ctx.textAlign = 'center';
    // Black shadow — L-shaped: 2px right AND 2px down (axx0 Draw.City.cs:135-154, offset=2 at zoom=0)
    ctx.fillStyle = '#000000';
    ctx.fillText(city.name, nameX + 2, labelY);     // shadow right
    ctx.fillText(city.name, nameX, labelY + 2);     // shadow down
    // Civ-coloured front text
    ctx.fillStyle = civColor;
    ctx.fillText(city.name, nameX, labelY);
    ctx.textAlign = 'left';
  }

  /**
   * Compute a civ's current epoch (0=Ancient, 1=Renaissance, 2=Industrial, 3=Modern)
   * based on the highest epoch of any advance they've discovered.
   */
  MapRenderer.prototype._getCivEpoch = function(civId) {
    const civ = this.gameState.civs[civId];
    if (!civ?.advances?.size) return 0;
    let maxEpoch = 0;
    for (const advId of civ.advances) {
      const adv = ADVANCES[advId];
      if (adv && adv.epoch > maxEpoch) maxEpoch = adv.epoch;
    }
    return maxEpoch;
  }

  // ─── Unit ──────────────────────────────────────────────────────────────────

  MapRenderer.prototype._drawUnit = function(ctx, unit, x, y, spritesReady) {
    const civ      = this.gameState.civs[unit.civId];
    const color    = CIV_COLORS[civ?.data?.color ?? 0];
    const unitData = UNITS[unit.typeId];
    const sprRow   = Math.floor(unit.typeId / 9);
    const sprCol   = unit.typeId % 9;
    const isActive = unit === this.gameState.activeUnit;
    const isEnemy  = unit.civId !== 0;

    // Original MGE waiting animation: 200ms on / 200ms off.
    const blinkVisible = !isActive || Math.floor(this._blinkTime / 200) % 2 === 0;

    if (spritesReady) {
      try {
        if (blinkVisible) {
          if (isEnemy) ctx.globalAlpha = 0.75;
          // Shield badge drawn FIRST (behind unit sprite), matching axx0 draw order.
          // [135,83,135] "wing" pixels in the unit sprite are now transparent, so the
          // badge peeks through the unit figure just as in original Civ2 MGE.
          this._drawUnitShield(ctx, unit, x, y);
          const sprite = this._getColoredUnitSprite(sprRow, sprCol, color);
          if (unit.status === 'sleep') {
            const graySprite = this._getSolidGraySprite(sprRow, sprCol, sprite);
            ctx.drawImage(graySprite, x, y - TILE_H_S / 2, UNIT_W_S, UNIT_H_S);
          } else {
            ctx.drawImage(sprite, x, y - TILE_H_S / 2, UNIT_W_S, UNIT_H_S);
          }
          // Fortify overlay (axx0: CITIES sheet at 143,423 64×48)
           if (unit.status === 'fortified') {
             try {
               const fortSpr = this.sprites.getRegionSprite('cities', 143, 423, 64, 48);
               ctx.drawImage(fortSpr, x, y - TILE_H_S / 2, UNIT_W_S, UNIT_H_S);
             } catch (e) {
               _warnOnce('fortified:' + unit.id, 'Fortified sprite unavailable: ' + e.message);
             }
           }
          ctx.globalAlpha = 1;
        }

         if (unit.buildTask) this._drawBuildProgress(ctx, unit, x, y);
         return;
       } catch (e) {
         _warnOnce('unit:' + unit.id, 'Unit sprite unavailable: ' + e.message);
         ctx.globalAlpha = 1;
       }
    }

    // Fallback: coloured diamond with unit letter
    if (blinkVisible) this._drawUnitFallback(ctx, unit, x, y, color, isActive, unitData);
  }

  /**
   * Load raw UNITS.GIF ImageData for shield extraction.
   * Called once from the constructor; sets _unitsRawImgData when done.
   */
  MapRenderer.prototype._loadUnitsRaw = function() {
    const img = new Image();
    img.src = assetUrl('sprites/raw/civ2-clone/UNITS.GIF');
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      this._unitsRawImgData = cx.getImageData(0, 0, img.width, img.height);
      // Invalidate caches — they may have been built with fallback rendering.
      this._shieldCache.clear();
      this._unitSpriteCache.clear();
    };
  }

  /**
   * Load raw CITIES sheet (197704.gif) and scan for flag/size marker positions.
   * Also extracts flag sprites and light colours for each civ.
   * (axx0 CityLoader.cs — MakeCityImage scans marker row/column for blue and
   * non-border pixels to find flag and size-window positions.)
   */
  MapRenderer.prototype._loadCitiesRaw = function() {
    const img = new Image();
    img.src = assetUrl('sprites/raw/197704.gif');
    img.onload = () => {
      const cvs = document.createElement('canvas');
      cvs.width = img.width;
      cvs.height = img.height;
      const cx = cvs.getContext('2d');
      cx.drawImage(img, 0, 0);
      const imgData = cx.getImageData(0, 0, img.width, img.height);
      const w = img.width;

      const getPixel = (px, py) => {
        const i = (py * w + px) * 4;
        return [imgData.data[i], imgData.data[i+1], imgData.data[i+2]];
      };
      const colorEq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
      const BLUE = [0, 0, 255];

      // Scan a city cell's marker row/column. Civ2 stores these guide pixels
      // immediately outside the 64x48 sprite: one row above and one column
      // left (axx0 Images.ImportBitmaps.cs SearchFlagLoc).
      const STRIDE_X = 65, STRIDE_Y = 49;
      const scanCell = (cellX, cellY) => {
        let flagX = -1, flagY = -1, sizeX = -1, sizeY = -1;
        const ORANGE = [255, 155, 0];

        for (let offset = 0; offset < 64; offset++) {
          const c = getPixel(cellX + offset, cellY - 1);
          if (colorEq(c, BLUE)) flagX = offset;
          else if (colorEq(c, ORANGE)) sizeX = offset;
        }
        for (let offset = 0; offset < 48; offset++) {
          const c = getPixel(cellX - 1, cellY + offset);
          if (colorEq(c, BLUE)) flagY = offset;
          else if (colorEq(c, ORANGE)) sizeY = offset;
        }
        if (flagX < 0 || flagY < 0 || sizeX < 0 || sizeY < 0) return null;
        return { flagLoc: { x: flagX, y: flagY }, sizeLoc: { x: sizeX, y: sizeY } };
      };

      // Scan all 48 city cells: 6 rows × 4 cols (open + walled)
      this._citySpriteData = { open: [], walled: [] };
      for (let row = 0; row < 6; row++) {
        this._citySpriteData.open[row] = [];
        this._citySpriteData.walled[row] = [];
        for (let col = 0; col < 4; col++) {
          this._citySpriteData.open[row][col] = scanCell(1 + STRIDE_X * col, 39 + STRIDE_Y * row);
          this._citySpriteData.walled[row][col] = scanCell(334 + STRIDE_X * col, 39 + STRIDE_Y * row);
        }
      }

      // Extract 9 civ flag sprites (14×22) — axx0: (1+15*i, 425, 14, 22)
      this._civFlagSprites = [];
      for (let i = 0; i < 9; i++) {
        const fx = 1 + 15 * i, fy = 425, fw = 14, fh = 22;
        const fc = document.createElement('canvas');
        fc.width = fw; fc.height = fh;
        const fctx = fc.getContext('2d');
        fctx.drawImage(cvs, fx, fy, fw, fh, 0, 0, fw, fh);
        // Remove magenta/border transparency
        const fd = fctx.getImageData(0, 0, fw, fh);
        for (let p = 0; p < fd.data.length; p += 4) {
          if (fd.data[p] > 220 && fd.data[p+1] < 35 && fd.data[p+2] > 220) fd.data[p+3] = 0;
        }
        fctx.putImageData(fd, 0, 0);
        this._civFlagSprites[i] = fc;
      }

      // Sample civ light colours from flag sprite pixel (8, 3) — axx0 Civ2GoldInterface.cs:559
      this._civLightColors = [];
      for (let i = 0; i < 9; i++) {
        const c = getPixel(1 + 15 * i + 8, 425 + 3);
        this._civLightColors[i] = `rgb(${c[0]},${c[1]},${c[2]})`;
      }
    };
  }

  /**
   * Return a cached unit sprite.
   *
   * [135,83,135] (GIF palette index 255) and [0,255,0] (palette 254) are now
   * removed as chroma keys in SpriteManager, so the sprite already has
   * fully-transparent "wings".  Civ colour is shown only via the shield badge
   * drawn separately by _drawUnitShield().
   *
   * @param {number} sprRow
   * @param {number} sprCol
   * @param {string} _civColor  — unused; kept for call-site compatibility
   * @returns {HTMLCanvasElement}
   */
  MapRenderer.prototype._getColoredUnitSprite = function(sprRow, sprCol, _civColor) {
    const key = `${sprRow}-${sprCol}`;
    if (this._unitSpriteCache.has(key)) return this._unitSpriteCache.get(key);
    const spr = this.sprites.getSprite('units', sprRow, sprCol);
    this._unitSpriteCache.set(key, spr);
    return spr;
  }

  MapRenderer.prototype._getSolidGraySprite = function(sprRow, sprCol, srcSprite) {
    const key = `gray-${sprRow}-${sprCol}`;
    if (this._unitSpriteCache.has(key)) return this._unitSpriteCache.get(key);
    const w = srcSprite.width, h = srcSprite.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const gCtx = c.getContext('2d');
    gCtx.drawImage(srcSprite, 0, 0);
    const imgData = gCtx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) { d[i] = 128; d[i + 1] = 128; d[i + 2] = 128; }
    }
    gCtx.putImageData(imgData, 0, 0);
    this._unitSpriteCache.set(key, c);
    return c;
  }

  /**
   * Return a 24×40 canvas (2× scale) of the Civ2 unit shield badge colorised
   * with the given civ colour.  The shield template is extracted from UNITS.GIF
   * at (597,30,12×20); green [0,255,0] pixels become the civ colour;
   * magenta [255,0,255] becomes transparent.
   *
   * Reads Back Shield 2 (x=599, y=1, 12×20) from the raw units sheet.
   * Red [255,0,0] pixels are the civ-colour template; [135,83,135] and magenta
   * are the transparent background.  The visible badge is roughly 12×12 px
   * (rows 0-11 at native scale = 24×24 at 2×).  HP bar is overlaid separately.
   *
   * Returns null if the raw image data hasn't loaded yet.
   *
   * @param {string} civColor  — CSS hex colour string
   * @returns {HTMLCanvasElement|null}
   */
  /**
   * @param {string} civColor  — CSS hex colour string
   * @param {'front'|'back'|'shadow'} type — shield variant (axx0 Civ2GoldInterface.cs:534-548)
   *   front: backShield1 with red→civColor, top 7 rows painted black (HP bar area)
   *   back:  backShield1 with red→civColor (raw, for stacking indicator)
   *   shadow: backShield1 with red→(51,51,51) dark grey (drawn offset as shadow)
   */
  MapRenderer.prototype._getShieldCanvas = function(civColor, type = 'front') {
    if (!this._unitsRawImgData) return null;
    const key = `shield-${type}-${civColor}`;
    if (this._shieldCache.has(key)) return this._shieldCache.get(key);

    const isShadow = type === 'shadow';
    const isFront  = type === 'front';

    // Shadow uses fixed dark grey; front/back use civ colour
    let cr, cg, cb;
    if (isShadow) {
      cr = 51; cg = 51; cb = 51;
    } else {
      const m = civColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      cr = m ? parseInt(m[1], 16) : 255;
      cg = m ? parseInt(m[2], 16) : 0;
      cb = m ? parseInt(m[3], 16) : 0;
    }

    const SW = 12, SH = 20;          // shield native size
    const scale = 2;
    const c  = document.createElement('canvas');
    c.width  = SW * scale;
    c.height = SH * scale;
    const cx = c.getContext('2d');
    const out = cx.createImageData(SW * scale, SH * scale);
    const raw = this._unitsRawImgData;

    for (let sy = 0; sy < SH; sy++) {
      for (let sx = 0; sx < SW; sx++) {
        // Back Shield 1 at (586, 1) — axx0 uses backShield1 for all shield variants
        const srcI = ((1 + sy) * raw.width + (586 + sx)) * 4;
        let pr = raw.data[srcI], pg = raw.data[srcI + 1];
        let pb = raw.data[srcI + 2], pa = raw.data[srcI + 3];

        if ((pr === 255 && pg === 0   && pb === 255) ||
            (pr === 135 && pg === 83  && pb === 135)) {
          pa = 0;                     // magenta / body-fill → transparent
        } else if (pr === 255 && pg === 0 && pb === 0) {
          pr = cr; pg = cg; pb = cb;  // red template → civ/shadow colour
          pa = 255;
        } else {
          pa = 255;                   // black outline — keep opaque
        }

        // Front shield: top 7 rows painted black (axx0: shieldFront.DrawRectangle(0,0,w,7,Black))
        if (isFront && sy < 7 && pa > 0) {
          pr = 0; pg = 0; pb = 0;
        }

        // 2× nearest-neighbour upscale
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const dstI = ((sy * scale + dy) * SW * scale + (sx * scale + dx)) * 4;
            out.data[dstI]     = pr;
            out.data[dstI + 1] = pg;
            out.data[dstI + 2] = pb;
            out.data[dstI + 3] = pa;
          }
        }
      }
    }
    cx.putImageData(out, 0, 0);

    this._shieldCache.set(key, c);
    return c;
  }

  /**
   * Return a cached resource icon canvas extracted from ICONS.GIF.
   * Names: 'food','shields','trade','gold','science','luxury',
   *        'hunger','shortage','corruption',
   *        'foodSm','shieldsSm','tradeSm'
   * @param {string} name
   * @returns {HTMLCanvasElement|null}
   */
  MapRenderer.prototype._getResourceIcon = function(name) {
    if (!this._resIconCache) this._resIconCache = new Map();
    if (this._resIconCache.has(name)) return this._resIconCache.get(name);

    // Coordinates in ICONS.GIF (raw, before chroma-key processing)
    const COORDS = {
      food:       [1,  305, 14, 14],
      shields:    [16, 305, 14, 14],
      trade:      [31, 305, 14, 14],
      luxury:     [1,  320, 14, 14],
      gold:       [16, 320, 14, 14],
      science:    [31, 320, 14, 14],
      hunger:     [1,  290, 14, 14],
      shortage:   [16, 290, 14, 14],
      corruption: [31, 290, 14, 14],
      foodSm:     [49, 334, 10, 10],
      shieldsSm:  [60, 334, 10, 10],
      tradeSm:    [71, 334, 10, 10],
      // 4-stage research progress icons (beaker filling up)
      research0:  [49, 290, 14, 14],
      research1:  [64, 290, 14, 14],
      research2:  [79, 290, 14, 14],
      research3:  [94, 290, 14, 14],
      // 4-stage global warming icons
      warming0:   [49, 305, 14, 14],
      warming1:   [64, 305, 14, 14],
      warming2:   [79, 305, 14, 14],
      warming3:   [94, 305, 14, 14],
    };
    const c = COORDS[name];
    if (!c) return null;

    const icon = this.sprites.getRegion('icons', c[0], c[1], c[2], c[3]);
    this._resIconCache.set(name, icon);
    return icon;
  }

  /**
   * Draw the Civ2-style shield badge at the unit's FlagLoc position.
   * The badge shows:
   *   • The shield shape (civ-coloured, 24×40 at 2× scale)
   *   • An HP bar across the top-interior of the badge (rows 2-4 at native scale)
   *
   * Replaces the old _drawHpBar() call in _drawUnit().
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../engine/Unit.js').Unit} unit
   * @param {number} x  — screen x of tile origin
   * @param {number} y  — screen y of tile centre row
   */
  MapRenderer.prototype._drawUnitShield = function(ctx, unit, x, y) {
    const typeId = unit.typeId;
    const [flagX, flagY] = UNITS_FLAG_LOCS[typeId] ?? [12, 12];
    const colorIdx = this.gameState.civs[unit.civId]?.data?.color ?? 0;
    const civColor = CIV_LIGHT_COLORS[colorIdx] ?? CIV_LIGHT_COLORS[0];
    const darkColor = CIV_DARK_COLORS[colorIdx] ?? CIV_DARK_COLORS[0];
    const scale    = UNIT_W_S / 64;           // = 2 at native xBRZ scale

    // Shield screen position (FlagLoc is in original 64×48 cell coords)
    const sx = x + flagX * scale;
    const sy = (y - TILE_H_S / 2) + flagY * scale;
    const sw = 12 * scale;                    // 24
    const sh = 20 * scale;                    // 40

    // Shadow offset: left-flagged units shadow left, right-flagged shadow right (axx0 ImageUtils.cs:432-438)
    const shadowDx = (flagX < 32 ? -1 : 1) * scale;
    const shadowDy = 1 * scale;
    const shieldShadow = this._getShieldCanvas(civColor, 'shadow');

    // Back shield for stacked units (axx0 ImageUtils.cs:415-430)
    const isStacked = this.gameState.unitsAt(unit.col, unit.row).length > 1;
    if (isStacked) {
      const backOffX = flagX < 32 ? -4 : 4;
      const bx = x + (flagX + backOffX) * scale;
      const by = (y - TILE_H_S / 2) + flagY * scale;
      // Stack shadow
      if (shieldShadow) ctx.drawImage(shieldShadow, bx + shadowDx, by + shadowDy, sw, sh);
      // Back shield (raw, no black top)
      const backShield = this._getShieldCanvas(darkColor, 'back');
      if (backShield) {
        ctx.drawImage(backShield, bx, by, sw, sh);
      } else {
        ctx.fillStyle = civColor;
        ctx.fillRect(bx, by, sw, 6 * scale);
      }
    }

    // Main shield shadow (drawn for ALL units, not just stacked)
    if (shieldShadow) ctx.drawImage(shieldShadow, sx + shadowDx, sy + shadowDy, sw, sh);

    // Draw front shield badge (top 7 rows black for HP bar area)
    const shield = this._getShieldCanvas(civColor, 'front');
    if (shield) {
      ctx.drawImage(shield, sx, sy, sw, sh);
    } else {
      ctx.fillStyle = civColor;
      ctx.fillRect(sx, sy, sw, 6 * scale);
    }

    // HP bar drawn over the black top rows (rows 2-4 native = y+4..y+9 at 2×)
    // axx0: hpBarX = floor(hp * 12 / maxHp); color thresholds use hpBarX <= 3 / <= 8
    const hpBarX  = Math.floor(Math.max(0, unit.hp) * 12 / Math.max(1, unit.maxHp));
    const hpW     = hpBarX * scale;
    const hpColor = hpBarX <= 3 ? 'rgb(243,0,0)' : hpBarX <= 8 ? 'rgb(255,223,79)' : 'rgb(87,171,39)';
    const barY    = sy + 2 * scale;           // starts at row 2 (inside black frame)
    const barH    = 3 * scale;                // 3-row tall bar

    // Coloured HP fill (black backing is already part of the front shield's top 7 rows)
    ctx.fillStyle = hpColor;
    ctx.fillRect(sx, barY, hpW, barH);

    // Unit order letter on shield (axx0 TextElement.cs — Arial, height = shield.Height - 7)
    let orderChar = '-';
    if (unit.status === 'fortified') orderChar = 'F';
    else if (unit.status === 'sentry') orderChar = 'S';
    else if (unit.status === 'sleep') orderChar = 'S';
    else if (unit.buildTask) {
      const t = unit.buildTask.type;
      if (t === 'road' || t === 'railroad') orderChar = 'R';
      else if (t === 'irrigation') orderChar = 'I';
      else if (t === 'mine') orderChar = 'm';
      else if (t === 'fortress') orderChar = 'F';
      else if (t === 'airbase') orderChar = 'E';
      else if (t === 'pollution') orderChar = 'p';
      else if (t === 'transform') orderChar = 'O';
    } else if (unit.gotoTarget) orderChar = 'G';
    ctx.font = `${13 * scale}px Arial`;       // axx0: OrderTextHeight = shield.Height - 7 = 13
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText(orderChar, sx + sw / 2, sy + 7 * scale + (13 * scale) / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  MapRenderer.prototype._drawHpBar = function(ctx, unit, x, y) {
    const hpFrac  = unit.hp / unit.maxHp;
    const barW    = TILE_W_S / 2;
    const bx      = x + TILE_W_S / 4;
    const by      = y + TILE_H_S - 6;
    const hpColor = hpFrac > 0.667 ? 'rgb(87,171,39)' : hpFrac > 0.25 ? 'rgb(255,223,79)' : 'rgb(243,0,0)';

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, 5);
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, barW, 3);
    ctx.fillStyle = hpColor;
    ctx.fillRect(bx, by, Math.round(barW * hpFrac), 3);
  }

  // ─── Combat animation rendering ──────────────────────────────────────────

  MapRenderer.prototype._drawCombatAnim = function(ctx, spritesReady) {
    const anim = this._combatAnim;
    if (!anim) return;

    // Screen positions for both tiles
    const atkBaseX = anim.atkCol * TILE_W_S + (anim.atkRow % 2 ? TILE_W_S / 2 : 0) - this.viewX;
    const atkBaseY = anim.atkRow * (TILE_H_S / 2) - this.viewY;
    const defX = anim.defCol * TILE_W_S + (anim.defRow % 2 ? TILE_W_S / 2 : 0) - this.viewX;
    const defY = anim.defRow * (TILE_H_S / 2) - this.viewY;

    // Slide phase: offset attacker ~30% toward defender, then snap back
    let atkX = atkBaseX;
    let atkY = atkBaseY;
    if (anim.phase === 'slide') {
      const progress = Math.min(1, anim.elapsed / anim.slideDuration);
      atkX = atkBaseX + progress * 0.3 * (defX - atkBaseX);
      atkY = atkBaseY + progress * 0.3 * (defY - atkBaseY);
    }

    // Determine current HP values for the bars
    let curAtkHp, curDefHp;
    if (anim.phase === 'slide') {
      // During slide, show initial HP
      curAtkHp = anim.initialAtkHp;
      curDefHp = anim.initialDefHp;
    } else if (anim.phase === 'rounds' && anim.logIndex < anim.displayLog.length) {
      if (anim.logIndex === 0) {
        // First round being shown — display initial HP
        curAtkHp = anim.initialAtkHp;
        curDefHp = anim.initialDefHp;
      } else {
        // Show HP from the previous completed round (after damage)
        const prev = anim.displayLog[anim.logIndex - 1];
        curAtkHp = prev.atkHpAfter;
        curDefHp = prev.defHpAfter;
      }
    } else {
      // Result phase: show final HP (after damage)
      const last = anim.displayLog[anim.displayLog.length - 1];
      curAtkHp = last.atkHpAfter;
      curDefHp = last.defHpAfter;
    }

    // Determine which unit is being "hit" this round (for flash effect)
    const currentRound = anim.phase === 'rounds' && anim.logIndex < anim.displayLog.length
      ? anim.displayLog[anim.logIndex] : null;
    const flashAttacker = currentRound && !currentRound.attackerWins;
    const flashDefender = currentRound && currentRound.attackerWins;

    // Flash timing: toggle every 60ms within the round
    const flashOn = currentRound && Math.floor(anim.elapsed / 60) % 2 === 0;

    // Draw attacker unit
    this._drawCombatUnit(ctx, spritesReady, anim.atkTypeId, anim.atkCivId,
      atkX, atkY, flashAttacker && flashOn);

    // Draw defender unit
    this._drawCombatUnit(ctx, spritesReady, anim.defTypeId, anim.defCivId,
      defX, defY, flashDefender && flashOn);

    // HP bars for both units
    this._drawAnimHpBar(ctx, curAtkHp, anim.atkMaxHp, atkX, atkY);
    this._drawAnimHpBar(ctx, curDefHp, anim.defMaxHp, defX, defY);

    // Result phase: golden highlight around the winner
    if (anim.phase === 'result') {
      const winX = anim.attackerWon ? atkX : defX;
      const winY = anim.attackerWon ? atkY : defY;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const cx = winX + TILE_W_S / 2;
      const cy = winY + TILE_H_S / 2;
      ctx.ellipse(cx, cy, TILE_W_S / 2 - 2, TILE_H_S / 2 - 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  MapRenderer.prototype._drawCombatUnit = function(ctx, spritesReady, typeId, civId, x, y, isFlashing) {
    const civ   = this.gameState.civs[civId];
    const color = CIV_COLORS[civ?.data?.color ?? 0];
    const sprRow = Math.floor(typeId / 9);
    const sprCol = typeId % 9;

    if (spritesReady) {
      try {
        const sprite = this._getColoredUnitSprite(sprRow, sprCol, color);
        if (isFlashing) {
          // Flash effect: draw sprite with white overlay using offscreen canvas
          if (!this._combatFlashCanvas) {
            this._combatFlashCanvas = document.createElement('canvas');
          }
          const tmp = this._combatFlashCanvas;
          tmp.width  = sprite.width;
          tmp.height = sprite.height;
          const tc = tmp.getContext('2d');
          tc.clearRect(0, 0, tmp.width, tmp.height);
          tc.drawImage(sprite, 0, 0);
          tc.globalCompositeOperation = 'source-atop';
          tc.fillStyle = 'rgba(255,255,255,0.55)';
          tc.fillRect(0, 0, tmp.width, tmp.height);
          tc.globalCompositeOperation = 'source-over';
          ctx.drawImage(tmp, x, y - TILE_H_S / 2, UNIT_W_S, UNIT_H_S);
        } else {
          ctx.drawImage(sprite, x, y - TILE_H_S / 2, UNIT_W_S, UNIT_H_S);
        }
         return;
       } catch (e) {
         _warnOnce('combat-unit:' + typeId, 'Combat unit sprite unavailable: ' + e.message);
       }
    }

    // Fallback: coloured diamond
    const hw = TILE_W_S / 2 - 4;
    const hh = TILE_H_S / 2 - 4;
    const cx = x + TILE_W_S / 2;
    const cy = y + TILE_H_S / 2;
    ctx.fillStyle = isFlashing ? '#ffffff' : color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fill();
  }

  MapRenderer.prototype._drawAnimHpBar = function(ctx, hp, maxHp, x, y) {
    const hpFrac  = Math.max(0, hp) / maxHp;
    const barW    = TILE_W_S / 2;
    const bx      = x + TILE_W_S / 4;
    const by      = y + TILE_H_S - 6;
    const hpColor = hpFrac > 0.667 ? 'rgb(87,171,39)' : hpFrac > 0.25 ? 'rgb(255,223,79)' : 'rgb(243,0,0)';

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, 5);
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, barW, 3);
    ctx.fillStyle = hpColor;
    ctx.fillRect(bx, by, Math.round(barW * hpFrac), 3);
  }

  /** Small blue progress bar below the unit sprite showing build progress. */
  MapRenderer.prototype._drawBuildProgress = function(ctx, unit, x, y) {
    const { turnsLeft, turnsTotal, type } = unit.buildTask;
    const frac = 1 - turnsLeft / Math.max(1, turnsTotal);
    const bx   = x + TILE_W_S / 4;
    const by   = y + TILE_H_S + 2;
    const bw   = TILE_W_S / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = '#4090ff';
    ctx.fillRect(bx, by, Math.max(1, Math.round(bw * frac)), 5);
    ctx.strokeStyle = '#668';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + .5, by + .5, bw - 1, 4);
  }

  MapRenderer.prototype._drawSelectionRing = function(ctx, x, y) {
    const cx = x + TILE_W_S / 2;
    const cy = y + TILE_H_S / 2;
    const hw = TILE_W_S / 2 - 4;
    const hh = TILE_H_S / 2 - 4;

    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx,      cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  MapRenderer.prototype._drawUnitFallback = function(ctx, unit, x, y, color, isActive, unitData) {
    const cx = x + TILE_W_S / 2;
    const cy = y + TILE_H_S / 2;
    const hw = TILE_W_S / 3;
    const hh = TILE_H_S / 3;

    ctx.beginPath();
    ctx.moveTo(cx,      cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx,      cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = isActive ? '#fff' : '#000';
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.stroke();

    // First letter of unit name
    ctx.fillStyle = '#000';
    ctx.font = FONT.LABEL_BOLD;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((unitData?.name ?? '?')[0], cx, cy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }


}
