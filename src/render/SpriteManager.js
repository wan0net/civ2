/**
 * SpriteManager — loads sprite sheets, removes magenta transparency,
 * slices individual sprites, applies xBRZ 2× upscaling, and caches results.
 *
 * Usage:
 *   const sm = new SpriteManager();
 *   await sm.load(onProgress);
 *   const canvas = sm.getSprite('units', 0, 3); // row 0, col 3
 */

import { xbrz2x } from '../utils/xbrz.js';
import { assetUrl } from '../utils/assets.js';

// ─── Sheet definitions ────────────────────────────────────────────────────────
// Coordinates sourced from axx0/Civ2-clone (GPL-3.0), Civ2GoldInterface.cs
// Formula: srcX = offsetX + col*(cellW+gapX),  srcY = offsetY + row*(cellH+gapY)

export const SHEETS = {
  // 9 cols × 7 rows, stride 65×49
  // srcX = 1 + 65*col,  srcY = 1 + 49*row
  // Palette 253=[255,0,255] magenta, 254=[0,255,0] green, 255=[135,83,135] body-fill
  // All three are chroma-key transparent; civ colour shown via shield badge only.
  units: {
    path: assetUrl('sprites/raw/197706.gif'),
    cellW: 64,
    cellH: 48,
    offsetX: 1,
    offsetY: 1,
    gapX: 1,
    gapY: 1,
    cols: 9,
    rows: 7,
    magenta: true,
    chromaKeys: [[135, 83, 135], [0, 255, 0]],
  },

  // Open (unwalled) cities — left half of sheet, 4 cols × 6 rows, stride 65×49
  // srcX = 1 + 65*col,  srcY = 39 + 49*row
  cities: {
    path: assetUrl('sprites/raw/197704.gif'),
    cellW: 64,
    cellH: 48,
    offsetX: 1,
    offsetY: 39,
    gapX: 1,
    gapY: 1,
    cols: 4,
    rows: 6,
    magenta: true,
    chromaKeys: [[135, 135, 135]],  // grey corner fill — same key as terrain
  },

  // Walled cities — right half of sheet, 4 cols × 6 rows, stride 65×49
  // srcX = 334 + 65*col,  srcY = 39 + 49*row
  citiesWalled: {
    path: assetUrl('sprites/raw/197704.gif'),
    cellW: 64,
    cellH: 48,
    offsetX: 334,
    offsetY: 39,
    gapX: 1,
    gapY: 1,
    cols: 4,
    rows: 6,
    magenta: true,
    chromaKeys: [[135, 135, 135]],  // grey corner fill — same key as terrain
  },

  // Base terrain tiles — stride 65×33
  // srcX = 1 + 65*col,  srcY = 1 + 33*row
  // Row order: 0=Desert,1=Prairie,2=Grassland,3=Forest,4=Hills,5=Mountains,
  //            6=Tundra,7=Arctic,8=Swamp,9=Jungle,10=Ocean,11=Roads,12=Railroads
  // Cols 0-1 = base tile variants; cols 2-3 = special resource overlays.
  // Grey #878787 is the corner transparency colour. Tiles drawn unclipped so
  // elevated art (trees, hills) can overhang adjacent tiles.
  terrain: {
    path: assetUrl('sprites/raw/civ2-clone/TERRAIN1.GIF'),
    cellW: 64,
    cellH: 32,
    offsetX: 1,
    offsetY: 1,
    gapX: 1,
    gapY: 1,
    magenta: true,
    chromaKeys: [[135, 135, 135]],
  },

  // Terrain overlays — stride 65×33, magenta (#FF00FF) transparency
  // Row order: 0-1=tile connections (directional green line = feature direction),
  //   2-3=rivers, 4-5=trees, 6-7=mountains, 8-9=hills, 10=river mouths
  // Cols 0-8 = directional variants (bitmask of which neighbours share the feature).
  // Green [0,255,0] used as cell-border colour in the sheet — stripped as chroma key.
  // (When tile connections are implemented, those rows will need special handling.)
  terrain2: {
    path: assetUrl('sprites/raw/civ2-clone/TERRAIN2.GIF'),
    cellW: 64,
    cellH: 32,
    offsetX: 1,
    offsetY: 1,
    gapX: 1,
    gapY: 1,
    magenta: true,
    chromaKeys: [[135, 135, 135], [0, 255, 0]],
  },

  // UI chrome — whole-image; getSprite() not applicable, use getSheet('ui')
  ui: {
    path: assetUrl('sprites/raw/61801.gif'),
    cellW: null,
    cellH: null,
    offsetX: 0,
    offsetY: 0,
    gapX: 0,
    gapY: 0,
    magenta: false,
  },

  // Extra sprites embedded in the units sheet (cities bitmap in original):
  //   Player colours: x = 1+15*col, y = 423, w=14, h=1  (9 civs)
  //   Flags:          x = 1+15*(i%9), y = 425+23*(i/9), w=14, h=22  (18 variants)
  //   HP shield:      x=597, y=30, w=12, h=20
  //   Back shield 1:  x=586, y=1,  w=12, h=20
  //   Back shield 2:  x=599, y=1,  w=12, h=20

  // Citizen face sprites.
  // Rows: 0=ancient, 1=renaissance, 2=industrial, 3=modern
  // Cols: 11 citizen variants (happy/content male/female + unhappy)
  // Dimensions confirmed from axx0/Civ2-clone Images.ImportBitmaps.cs:
  //   srcX = (27 * col) + 2 + col  →  cellW=27, offsetX=2, gapX=1
  //   srcY = (30 * row) + 6 + row  →  cellH=30, offsetY=6, gapY=1
  people: {
    path: assetUrl('sprites/raw/civ2-clone/PEOPLE.GIF'),
    cellW:   27,
    cellH:   30,
    offsetX:  2,
    offsetY:  6,
    gapX:     1,
    gapY:     1,
    cols:    11,
    rows:     4,
    magenta: true,
  },

  // City improvement & wonder icons (right half of ICONS.GIF).
  // axx0 Civ2Interface.cs:513-536: x=343+col*37, y=1+row*21, size 36×20
  // Non-wonders: 8 cols starting at y=1, wonders: 7 cols starting at y=106
  // Using cellW=36, cellH=20, gapX=1, gapY=1 matches the 37px/21px stride.
  icons: {
    path: assetUrl('sprites/raw/civ2-clone/ICONS.GIF'),
    cellW:   36,
    cellH:   20,
    offsetX: 343,
    offsetY:   1,
    gapX:      1,
    gapY:      1,
    cols:      8,
    rows:     10,
    magenta: true,
    chromaKeys: [[255, 159, 163]],
  },
};

const MAGENTA = { r: 255, g: 0, b: 255 };

// ─── SpriteManager class ─────────────────────────────────────────────────────

// HD sprite sheets — pre-upscaled via AI, served at 2× scale
const HD_SHEETS = {
  units:        assetUrl('sprites/hd/units.png'),
  cities:       assetUrl('sprites/hd/cities.png'),
  citiesWalled: assetUrl('sprites/hd/citiesWalled.png'),
};

export class SpriteManager {
  constructor() {
    /** @type {Map<string, HTMLCanvasElement>} raw (1×) offscreen canvases per sheet */
    this._sheets = new Map();
    /** @type {Map<string, HTMLCanvasElement>} HD (2×) offscreen canvases per sheet */
    this._hdSheets = new Map();
    /** @type {Map<string, HTMLCanvasElement>} cache: `key` → upscaled canvas */
    this._cache = new Map();
    /** @type {boolean} Use AI-upscaled HD sprites instead of xBRZ */
    this.hdMode = false;
    this.ready = false;
  }

  /**
   * Load all sprite sheets. Resolves when all sheets are decoded and
   * drawn to offscreen canvases with magenta replaced by transparency.
   *
   * @param {(pct: number, label: string) => void} [onProgress]
   * @returns {Promise<void>}
   */
  async load(onProgress) {
    const names = Object.keys(SHEETS);
    const hdNames = Object.keys(HD_SHEETS);
    const total = names.length + hdNames.length;
    let done = 0;

    // Load original sheets
    await Promise.all(names.map(async (name) => {
      const def = SHEETS[name];
      const img = await this._loadImage(def.path);
      const canvas = this._imageToCanvas(img, def.magenta, def.chromaKeys ?? []);
      this._sheets.set(name, canvas);
      done++;
      if (onProgress) onProgress(Math.round(done / total * 100), name);
    }));

    // Load HD sheets (non-blocking — if missing, HD mode just won't be available)
    await Promise.allSettled(hdNames.map(async (name) => {
      const img = await this._loadImage(HD_SHEETS[name]);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      this._hdSheets.set(name, canvas);
      done++;
      if (onProgress) onProgress(Math.round(done / total * 100), `hd:${name}`);
    }));

    this.ready = true;
  }

  /**
   * Return a cached, upscaled (2×) canvas for a single sprite cell.
   *
   * @param {string} sheetName — one of 'units', 'cities', 'terrain', 'ui'
   * @param {number} row       — 0-based row index
   * @param {number} col       — 0-based column index
   * @param {boolean} [useXbrz=true] — use xBRZ; false = nearest-neighbour
   * @returns {HTMLCanvasElement}
   */
  getSprite(sheetName, row, col, useXbrz = true) {
    const hdSuffix = this.hdMode && this._hdSheets.has(sheetName) ? 'hd' : (useXbrz ? 'x' : 'n');
    const key = `${sheetName}:${row}:${col}:${hdSuffix}`;
    if (this._cache.has(key)) return this._cache.get(key);

    const def = SHEETS[sheetName];
    if (!def || !def.cellW) {
      return this._sheets.get(sheetName);
    }

    // HD mode: extract from pre-upscaled 2× sheet (no xBRZ needed)
    if (this.hdMode && this._hdSheets.has(sheetName)) {
      const hdSheet = this._hdSheets.get(sheetName);
      const srcX = (def.offsetX + col * (def.cellW + def.gapX)) * 2;
      const srcY = (def.offsetY + row * (def.cellH + def.gapY)) * 2;
      const w = def.cellW * 2;
      const h = def.cellH * 2;

      const result = document.createElement('canvas');
      result.width = w;
      result.height = h;
      const ctx = result.getContext('2d');
      ctx.drawImage(hdSheet, srcX, srcY, w, h, 0, 0, w, h);

      this._cache.set(key, result);
      return result;
    }

    // Standard path: extract from raw sheet + xBRZ upscale
    const sheet = this._sheets.get(sheetName);
    if (!sheet) throw new Error(`Sheet '${sheetName}' not loaded`);

    const srcX = def.offsetX + col * (def.cellW + def.gapX);
    const srcY = def.offsetY + row * (def.cellH + def.gapY);

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width  = def.cellW;
    srcCanvas.height = def.cellH;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(sheet, srcX, srcY, def.cellW, def.cellH, 0, 0, def.cellW, def.cellH);

    let result;
    if (useXbrz) {
      const srcData = srcCtx.getImageData(0, 0, def.cellW, def.cellH);
      const scaled  = xbrz2x(srcData);
      result = document.createElement('canvas');
      result.width  = scaled.width;
      result.height = scaled.height;
      result.getContext('2d').putImageData(scaled, 0, 0);
    } else {
      result = document.createElement('canvas');
      result.width  = def.cellW * 2;
      result.height = def.cellH * 2;
      const ctx = result.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(srcCanvas, 0, 0, def.cellW * 2, def.cellH * 2);
    }

    this._cache.set(key, result);
    return result;
  }

  /**
   * Toggle HD mode and clear the sprite cache so sprites are re-extracted.
   * @param {boolean} enabled
   */
  setHdMode(enabled) {
    if (this.hdMode === enabled) return;
    this.hdMode = enabled;
    this._cache.clear();
  }

  /**
   * Extract an arbitrary pixel region from a loaded sheet, upscaled 2×.
   * Cached by key. Used for sprites that don't align with the sheet grid
   * (e.g. fortress, airbase from CITIES.GIF).
   *
   * @param {string} sheetName — sheet to extract from
   * @param {number} srcX — source x in the raw sheet
   * @param {number} srcY — source y in the raw sheet
   * @param {number} w — width in raw pixels
   * @param {number} h — height in raw pixels
   * @returns {HTMLCanvasElement}
   */
  getRegionSprite(sheetName, srcX, srcY, w, h) {
    const key = `region:${sheetName}:${srcX}:${srcY}:${w}:${h}`;
    if (this._cache.has(key)) return this._cache.get(key);

    const sheet = this._sheets.get(sheetName);
    if (!sheet) throw new Error(`Sheet '${sheetName}' not loaded`);

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = w;
    srcCanvas.height = h;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(sheet, srcX, srcY, w, h, 0, 0, w, h);

    const srcData = srcCtx.getImageData(0, 0, w, h);
    const scaled = xbrz2x(srcData);
    const result = document.createElement('canvas');
    result.width = scaled.width;
    result.height = scaled.height;
    result.getContext('2d').putImageData(scaled, 0, 0);

    this._cache.set(key, result);
    return result;
  }

  /**
   * Return the raw (1×) full sheet canvas for direct drawing.
   * @param {string} sheetName
   * @returns {HTMLCanvasElement}
   */
  getSheet(sheetName) {
    return this._sheets.get(sheetName) ?? null;
  }

  /**
   * Extract a single coast sprite from TERRAIN2, upscaled 2× (32×16 → 64×32).
   *
   * Source coordinates from axx0/Civ2-clone, Civ2GoldInterface.cs:
   *   N: srcX = 1 + 66*variant,  srcY = 429
   *   S: srcX = 1 + 66*variant,  srcY = 446
   *   W: srcX = 1 + 66*variant,  srcY = 463
   *   E: srcX = 34 + 66*variant, srcY = 463   (East lives in right half of same strip)
   *
   * @param {number} variant — 0-7 (3-bit bitmask from neighbour check)
   * @param {number} dir     — 0=North, 1=South, 2=West, 3=East
   * @returns {HTMLCanvasElement} 64×32 canvas
   */
  getCoastSprite(variant, dir) {
    const key = `coast:${variant}:${dir}`;
    if (this._cache.has(key)) return this._cache.get(key);

    const sheet = this._sheets.get('terrain2');
    if (!sheet) throw new Error("terrain2 sheet not loaded");

    const srcY = dir === 0 ? 429 : dir === 1 ? 446 : 463;
    const srcX = dir === 3 ? 34 + 66 * variant : 1 + 66 * variant;

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width  = 32;
    srcCanvas.height = 16;
    srcCanvas.getContext('2d').drawImage(sheet, srcX, srcY, 32, 16, 0, 0, 32, 16);

    const srcData = srcCanvas.getContext('2d').getImageData(0, 0, 32, 16);
    const scaled  = xbrz2x(srcData);   // → 64×32
    const result  = document.createElement('canvas');
    result.width  = scaled.width;
    result.height = scaled.height;
    result.getContext('2d').putImageData(scaled, 0, 0);

    this._cache.set(key, result);
    return result;
  }

  /**
   * Extract an arbitrary rectangle from a sheet, upscaled 2× via xBRZ.
   * @param {string} sheetName — e.g. 'terrain'
   * @param {number} sx — source X
   * @param {number} sy — source Y
   * @param {number} sw — source width
   * @param {number} sh — source height
   * @returns {HTMLCanvasElement} upscaled canvas (sw*2 × sh*2)
   */
  getRegion(sheetName, sx, sy, sw, sh) {
    const key = `region:${sheetName}:${sx}:${sy}:${sw}:${sh}`;
    if (this._cache.has(key)) return this._cache.get(key);

    const sheet = this._sheets.get(sheetName);
    if (!sheet) throw new Error(`Sheet '${sheetName}' not loaded`);

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width  = sw;
    srcCanvas.height = sh;
    srcCanvas.getContext('2d').drawImage(sheet, sx, sy, sw, sh, 0, 0, sw, sh);

    const srcData = srcCanvas.getContext('2d').getImageData(0, 0, sw, sh);
    const scaled  = xbrz2x(srcData);
    const result  = document.createElement('canvas');
    result.width  = scaled.width;
    result.height = scaled.height;
    result.getContext('2d').putImageData(scaled, 0, 0);

    this._cache.set(key, result);
    return result;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Load an image from URL into an HTMLImageElement. */
  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load sprite: ${url}`));
      img.src = url;
    });
  }

  /**
   * Draw an image onto an offscreen canvas, replacing chroma-key colours with
   * full transparency.
   *
   * @param {HTMLImageElement} img
   * @param {boolean} removeMagenta  — include #FF00FF in the keys to strip
   * @param {[number,number,number][]} chromaKeys — additional RGB keys to strip
   */
  _imageToCanvas(img, removeMagenta, chromaKeys = []) {
    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Build list of colours to strip
    const keys = [];
    if (removeMagenta) keys.push([MAGENTA.r, MAGENTA.g, MAGENTA.b]);
    for (const key of chromaKeys) keys.push(key);

    if (keys.length) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        for (const [kr, kg, kb] of keys) {
          if (d[i] === kr && d[i+1] === kg && d[i+2] === kb) {
            d[i] = d[i+1] = d[i+2] = d[i+3] = 0;
            break;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    return canvas;
  }
}
