/**
 * CityScreenMixin — Extracted from MapRenderer.js.
 * All methods installed on MapRenderer.prototype.
 */
import { UNITS } from '../../data/units.js';
import { IMPROVEMENTS } from '../../data/improvements.js';
import { GOVERNMENTS } from '../../data/governments.js';
import { COSMIC } from '../../data/cosmic.js';
import { tileToScreen } from '../../utils/IsoMath.js';
import { CIV_COLORS, FONT, FONT_ARIAL, FONT_TIMES, CLR } from '../renderConstants.js';

/** @param {typeof import('../MapRenderer.js').default} MapRenderer */
export function applyCityScreenMixin(MapRenderer) {
  // ─── Warn-once helper for render-loop error logging ───────────────────────
  const _warnedOnce = new Set();
  function _warnOnce(key, msg) {
    if (!_warnedOnce.has(key)) {
      _warnedOnce.add(key);
      console.warn(`[CityScreenMixin] ${msg}`);
    }
  }

  const C_HDR_SH = '#434343';
  const C_TITLE = '#878787';
  const C_FOOD = '#57ab27';
  const C_SURPLUS = '#3f8b1f';
  const C_TRADE = '#ef9f07';
  const C_CORRUPT = '#e3530f';
  const C_SCI = '#3fbbc7';
  const C_LUX = '#ffffff';
  const C_SUPPORT = '#3f4fa7';
  const C_PROD_LBL = '#070b67';
  const C_FOOD_HDR = '#4b9b23';

  // ─── City screen ───────────────────────────────────────────────────────────

  MapRenderer.prototype._drawCityScreen = function(ctx, canvasW, canvasH) {
    const city = this._cityScreen;
    const gs = this.gameState;
    const civ = gs.civs[city.civId];
    const yields = gs.cityYields(city);
    const prod = city.production;
    const prodQueue = city.productionQueue ?? [];

    const VW = 640, VH = 446;
    const TITLE_PAD = 25;
    // MGE's enlarged city window is roughly 800×558 at this design size.
    // Keep it as a floating window on larger displays; only shrink when the
    // browser viewport cannot contain it.
    const sc = Math.min(1.25, canvasW / VW, canvasH / VH);
    const OX = Math.round((canvasW - VW * sc) / 2);
    const OY = Math.round((canvasH - VH * sc) / 2);

    const vx = x => OX + x * sc;
    const vy = y => OY + y * sc;
    const vs = s => s * sc;
    const vfr = (x, y, w, h) => ({ x: vx(x), y: vy(y), w: vs(w), h: vs(h) });
    const vfl = (x, y, w, h) => ctx.fillRect(vx(x), vy(y), vs(w), vs(h));
    const vst = (x, y, w, h) => ctx.strokeRect(vx(x) + 0.5, vy(y) + 0.5, vs(w) - 1, vs(h) - 1);
    const vtx = (t, x, y) => ctx.fillText(t, vx(x), vy(y));
    const vfont = (sz, bold = true) => `${bold ? 'bold ' : ''}${vs(sz)}px ${FONT_ARIAL}`;
    const vtfont = sz => `${vs(sz)}px ${FONT_TIMES}`;

    const sh = (t, x, y, fg, bg = '#000000') => {
      ctx.fillStyle = bg;
      ctx.fillText(t, vx(x) + 1, vy(y) + 1);
      ctx.fillStyle = fg;
      ctx.fillText(t, vx(x), vy(y));
    };
    const shc = (t, x, y, fg, bg = '#000000') => {
      ctx.fillStyle = bg;
      ctx.fillText(t, vx(x) + 1, vy(y) + 1);
      ctx.fillStyle = fg;
      ctx.fillText(t, vx(x), vy(y));
    };

    const win95Btn = (bx, bby, bw, bh, label) => {
      const sx = vx(bx), sy = vy(bby), sw = vs(bw), sh2 = vs(bh);
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(sx, sy, sw, sh2);
      ctx.strokeStyle = '#646464';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh2 - 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + 2, sy + 2, sw - 3, 1);
      ctx.fillRect(sx + 2, sy + 3, 1, sh2 - 5);
      ctx.fillStyle = '#808080';
      ctx.fillRect(sx + 2, sy + sh2 - 3, sw - 4, 1);
      ctx.fillRect(sx + sw - 3, sy + 2, 1, sh2 - 4);
      ctx.fillRect(sx + 1, sy + sh2 - 2, sw - 2, 1);
      ctx.fillRect(sx + sw - 2, sy + 1, 1, sh2 - 2);
      if (label) {
        ctx.font = vfont(10, true);
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.fillText(label, sx + sw / 2, sy + sh2 * 0.7);
        ctx.textAlign = 'left';
      }
    };

    const P = TITLE_PAD;
    const CTZ_Y = P + 2, CTZ_H = 44;
    const CTZ_X = 3, CTZ_W = 433;
    const RES_TITLE_Y = P + 46;
    const MAP_X = 7, MAP_Y = P + 65, MAP_W = 188, MAP_H = 137;
    const FOOD_X = 437, FOOD_Y = P + 0, FOOD_W = 195, FOOD_H = 163;
    const PROD_X = 437, PROD_Y = P + 165, PROD_W = 195, PROD_H = 191;
    const USUP_X = 7, USUP_Y = P + 215, USUP_W = 184, USUP_H = 69;
    const INFO_X = 193, INFO_Y = P + 215, INFO_W = 242, INFO_H = 198;
    const UPRES_W = 232, UPRES_H = 84;
    const IMPR_X = 5, IMPR_Y = P + 306, IMPR_W = 170, IMPR_H = 108;
    const IMPR_ROWS = 9;
    const FOOD_ROW_Y = P + 75, TRADE_ROW_Y = P + 116, TAX_ROW_Y = P + 140, SHIELD_ROW_Y = P + 181;
    const NAV_X = 459, NAV_Y = P + 364, NAV_BW = 57, NAV_BH = 24;

    const cs = {
      ctx,
      canvasW,
      canvasH,
      city,
      gs,
      civ,
      yields,
      prod,
      prodQueue,
      VW,
      VH,
      TITLE_PAD,
      vx,
      vy,
      vs,
      vfr,
      vfl,
      vst,
      vtx,
      vfont,
      vtfont,
      sh,
      shc,
      win95Btn,
      CTZ_Y,
      CTZ_H,
      CTZ_X,
      CTZ_W,
      RES_TITLE_Y,
      MAP_X,
      MAP_Y,
      MAP_W,
      MAP_H,
      FOOD_X,
      FOOD_Y,
      FOOD_W,
      FOOD_H,
      PROD_X,
      PROD_Y,
      PROD_W,
      PROD_H,
      USUP_X,
      USUP_Y,
      USUP_W,
      USUP_H,
      INFO_X,
      INFO_Y,
      INFO_W,
      INFO_H,
      UPRES_W,
      UPRES_H,
      IMPR_X,
      IMPR_Y,
      IMPR_W,
      IMPR_H,
      IMPR_ROWS,
      FOOD_ROW_Y,
      TRADE_ROW_Y,
      TAX_ROW_Y,
      SHIELD_ROW_Y,
      NAV_X,
      NAV_Y,
      NAV_BW,
      NAV_BH,
    };

    this._drawCityScreenBackdropAndTitle(cs);
    this._drawCityScreenCitizens(cs);
    this._drawCityScreenResourceMap(cs);
    this._drawCityScreenResources(cs);
    this._drawCityScreenFoodStorage(cs);
    this._drawCityScreenProductionPanel(cs);
    this._drawCityScreenUnitsNavImprovements(cs);
    this._drawCityScreenChooserOverlay(cs);
    this._drawCityScreenPopupOverlay(cs);
  }

  MapRenderer.prototype._drawCityScreenBackdropAndTitle = function(cs) {
    const { ctx, gs, city, civ, VW, VH, TITLE_PAD, vx, vy, vs, vfl, vfr, vfont, sh, shc, win95Btn } = cs;
    this._ensureWallpapers();
    if (this._innerWallpaper) {
      this._tilePattern(ctx, this._innerWallpaper, vx(0), vy(0), vs(VW), vs(VH));
    } else {
      ctx.fillStyle = '#9a9a9a';
      vfl(0, 0, VW, VH);
    }
    this._drawBevel5(ctx, vx(0), vy(0), vs(VW), vs(VH));

    const yr = gs.year ?? -4000;
    const era = yr < 0 ? `${Math.abs(yr)} B.C.` : `A.D. ${yr}`;
    const popFmt = (city.size * 10000).toLocaleString();
    let titleText = `City of ${city.name}, ${era}, Population ${popFmt}  (Treasury: ${civ?.gold ?? 0} Gold)`;
    if (city.weLoveKing) {
      const govtTitle = GOVERNMENTS[civ?.government ?? 0]?.titleMale ?? 'King';
      titleText += `  \u2605 We Love the ${govtTitle}!`;
    }

    ctx.font = `bold ${vs(14)}px ${FONT_TIMES}`;
    ctx.textAlign = 'center';
    shc(titleText, VW / 2, TITLE_PAD / 2 + 5, city.weLoveKing ? '#ffdd00' : C_TITLE);
    ctx.textAlign = 'left';

    this._cityScreenCloseRect = vfr(VW - 22, 2, 18, 17);
    win95Btn(VW - 22, 2, 18, 17, null);
    ctx.font = vfont(11);
    ctx.textAlign = 'center';
    sh('X', VW - 13, 14, '#000000');
    ctx.textAlign = 'left';
  };

  MapRenderer.prototype._drawCityScreenCitizens = function(cs) {
    const { ctx, city, gs, CTZ_X, CTZ_Y, CTZ_W, CTZ_H, vx, vy, vs, vfl, vfr, vfont } = cs;
    this._citizenRects = [];
    const eraRow = this._getCivEpoch(city.civId);
    const h = gs.cityHappiness(city);
    const sp = city.specialists ?? { entertainer: 0, taxCollector: 0, scientist: 0 };

    const citizenTypes = [];
    for (let i = 0; i < h.happy; i++) citizenTypes.push(0 + (i % 2));
    for (let i = 0; i < h.content; i++) citizenTypes.push(2 + (i % 2));
    for (let i = 0; i < h.unhappy; i++) citizenTypes.push(4 + (i % 2));
    for (let i = 0; i < sp.entertainer; i++) citizenTypes.push(6 + (i % 2));
    for (let i = 0; i < sp.taxCollector; i++) citizenTypes.push(8 + (i % 2));
    for (let i = 0; i < sp.scientist; i++) citizenTypes.push(10);

    const fH = CTZ_H - 6;
    const fW = Math.round(fH * 27 / 30);
    const maxF = Math.floor((CTZ_W - 10) / (fW + 2));
    const numF = Math.min(citizenTypes.length, maxF);
    const faceY = CTZ_Y + Math.round((CTZ_H - fH) / 2);
    const startX = CTZ_X + 5;

    for (let i = 0; i < numF; i++) {
      const sprCol = citizenTypes[i];
      try {
        const spr = this.sprites.getSprite('people', eraRow, sprCol, true);
        const sx = vx(startX + i * (fW + 2)) + 1;
        const sy = vy(faceY) + 1;
        const sw = vs(fW), sh2 = vs(fH);
        if (!this._shadowCanvas) {
          this._shadowCanvas = document.createElement('canvas');
          this._shadowCtx = this._shadowCanvas.getContext('2d');
        }
        this._shadowCanvas.width = sw;
        this._shadowCanvas.height = sh2;
        const sc = this._shadowCtx;
        sc.clearRect(0, 0, sw, sh2);
        sc.drawImage(spr, 0, 0, sw, sh2);
        sc.globalCompositeOperation = 'source-in';
        sc.fillStyle = '#000000';
        sc.fillRect(0, 0, sw, sh2);
        sc.globalCompositeOperation = 'source-over';
        ctx.drawImage(this._shadowCanvas, sx, sy);
      } catch (e) {
        _warnOnce('citizen-shadow:' + i, 'Citizen shadow sprite unavailable: ' + e.message);
      }
    }

    for (let i = 0; i < numF; i++) {
      const sprCol = citizenTypes[i];
      try {
        const spr = this.sprites.getSprite('people', eraRow, sprCol, true);
        ctx.drawImage(spr, vx(startX + i * (fW + 2)), vy(faceY), vs(fW), vs(fH));
      } catch (e) {
        _warnOnce('citizen-face:' + i, 'Citizen face sprite unavailable: ' + e.message);
        ctx.fillStyle = CLR.GOLD;
        vfl(startX + i * (fW + 2), faceY, fW, fH);
      }
      this._citizenRects.push(vfr(startX + i * (fW + 2), faceY, fW, fH));
    }

    if (citizenTypes.length > maxF) {
      ctx.font = vfont(8);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'right';
      ctx.fillText(`+${citizenTypes.length - maxF}`, vx(CTZ_X + CTZ_W - 3), vy(CTZ_Y + CTZ_H - 3));
      ctx.textAlign = 'left';
    }
  };

  MapRenderer.prototype._drawCityScreenResourceMap = function(cs) {
    const { ctx, city, gs, MAP_X, MAP_Y, MAP_W, MAP_H, vx, vy, vs, vfl, vst, vfr, vfont, shc, win95Btn } = cs;
    ctx.font = vfont(10);
    ctx.textAlign = 'center';
    shc('Citizens', MAP_W / 2 + MAP_X, 56, CLR.GOLD, C_HDR_SH);
    ctx.textAlign = 'left';

    this._cityScreenResetRect = null;

    ctx.fillStyle = '#005b24';
    vfl(MAP_X, MAP_Y, MAP_W, MAP_H);
    ctx.strokeStyle = CLR.GOLD;
    ctx.lineWidth = vs(2);
    vst(MAP_X, MAP_Y, MAP_W, MAP_H);

    this._cityScreenTileRects = [];
    const TW = 26, TH = 13;
    const mRows = gs.mapRows, mCols = gs.mapCols;
    const cityRowParity = city.row & 1;
    const mapCX = MAP_X + MAP_W / 2;
    const mapCY = MAP_Y + MAP_H / 2;
    const { bfc, worked } = gs.cityWorkedTileSet(city);
    const bfcSet = new Set(bfc.map(t => `${t.row},${((t.col % mCols) + mCols) % mCols}`));

    ctx.save();
    ctx.beginPath();
    ctx.rect(vx(MAP_X), vy(MAP_Y), vs(MAP_W), vs(MAP_H));
    ctx.clip();

    const tileXY = (dc, dr) => {
      const r = city.row + dr;
      const parityShift = ((r & 1) - cityRowParity) * (TW / 2);
      return { x: mapCX + dc * TW + parityShift - TW / 2, y: mapCY + dr * (TH / 2) - TH / 2 };
    };

    for (let dr = -5; dr <= 5; dr++) {
      const r = city.row + dr;
      if (r < 0 || r >= mRows) continue;
      for (let dc = -4; dc <= 4; dc++) {
        const c = ((city.col + dc) % mCols + mCols) % mCols;
        const key = `${r},${c}`;
        const isCtr = dr === 0 && dc === 0;
        const inBFC = bfcSet.has(key);
        const isWorked = worked.has(key);
        const terrain = gs.tiles[r][c];
        const { x, y } = tileXY(dc, dr);

        if (inBFC || isCtr) {
          this._cityScreenTileRects.push({
            tileRow: r,
            tileCol: c,
            isCtr,
            cx: vx(x + TW / 2),
            cy: vy(y + TH / 2),
            tw: vs(TW),
            th: vs(TH),
          });
        }

        ctx.globalAlpha = (inBFC || isCtr) ? 1.0 : 0.45;
        try {
          const base = this.sprites.getSprite('terrain', terrain.sheetRow, 0);
          ctx.drawImage(base, vx(x), vy(y), vs(TW), vs(TH));
        } catch (e) {
          _warnOnce('city-map-terrain:' + r + ',' + c, 'City map terrain sprite unavailable: ' + e.message);
          ctx.fillStyle = terrain?.color ?? '#333';
          ctx.beginPath();
          ctx.moveTo(vx(x + TW / 2), vy(y));
          ctx.lineTo(vx(x + TW), vy(y + TH / 2));
          ctx.lineTo(vx(x + TW / 2), vy(y + TH));
          ctx.lineTo(vx(x), vy(y + TH / 2));
          ctx.closePath();
          ctx.fill();
        }

        if (terrain.overlayRow !== undefined) {
          try {
            const ov = this.sprites.getSprite('terrain2', terrain.overlayRow, 0);
            ctx.drawImage(ov, vx(x), vy(y), vs(TW), vs(TH));
          } catch (e) {
            _warnOnce('city-map-overlay:' + r + ',' + c, 'City map overlay sprite unavailable: ' + e.message);
          }
        }

        if (inBFC || isCtr) {
          const res = gs._resources[r][c];
          if (res >= 0) {
            try {
              const resSpr = this.sprites.getSprite('terrain', terrain.sheetRow, 2);
              ctx.drawImage(resSpr, vx(x), vy(y), vs(TW), vs(TH));
            } catch (e) {
              _warnOnce('city-map-resource:' + r + ',' + c, 'City map resource sprite unavailable: ' + e.message);
            }
          }
        }
        ctx.globalAlpha = 1.0;

        if (isWorked && !isCtr) {
          ctx.strokeStyle = '#44ff66';
          ctx.lineWidth = vs(1);
          ctx.beginPath();
          ctx.moveTo(vx(x + TW / 2), vy(y));
          ctx.lineTo(vx(x + TW), vy(y + TH / 2));
          ctx.lineTo(vx(x + TW / 2), vy(y + TH));
          ctx.lineTo(vx(x), vy(y + TH / 2));
          ctx.closePath();
          ctx.stroke();

          const tYield = gs.tileYieldFor(city, r, c);
          if (tYield) {
            const fIc = this._getResourceIcon('foodSm');
            const sIc = this._getResourceIcon('shieldsSm');
            const tIc = this._getResourceIcon('tradeSm');
            const iS = 5;
            const total = tYield.f + tYield.s + tYield.tr;
            const gap = total <= 4 ? 5 : total <= 6 ? 4 : 3;
            const totalW = total * gap + iS;
            let ix = x + TW / 2 - totalW / 2;
            for (let fi = 0; fi < tYield.f; fi++) {
              if (fIc) ctx.drawImage(fIc, vx(ix), vy(y + TH / 2 - iS / 2), vs(iS), vs(iS));
              ix += gap;
            }
            for (let si = 0; si < tYield.s; si++) {
              if (sIc) ctx.drawImage(sIc, vx(ix), vy(y + TH / 2 - iS / 2), vs(iS), vs(iS));
              ix += gap;
            }
            for (let ti = 0; ti < tYield.tr; ti++) {
              if (tIc) ctx.drawImage(tIc, vx(ix), vy(y + TH / 2 - iS / 2), vs(iS), vs(iS));
              ix += gap;
            }
          }
        }

        if (isCtr) {
          ctx.strokeStyle = '#f0c030';
          ctx.lineWidth = vs(1.5);
          ctx.beginPath();
          ctx.moveTo(vx(x + TW / 2), vy(y));
          ctx.lineTo(vx(x + TW), vy(y + TH / 2));
          ctx.lineTo(vx(x + TW / 2), vy(y + TH));
          ctx.lineTo(vx(x), vy(y + TH / 2));
          ctx.closePath();
          ctx.stroke();
          try {
            const citySprite = this._getCitySpriteInfo(city);
            const spr = this.sprites.getSprite(citySprite.sheet, citySprite.styleRow, citySprite.sizeCol);
            const cH = Math.round(TH * 48 / 32);
            ctx.drawImage(spr, vx(x), vy(y + TH / 2 - cH + TH / 2), vs(TW), vs(cH));
          } catch (e) {
            _warnOnce('city-map-city:' + city.id, 'City map city sprite unavailable: ' + e.message);
          }
        }
      }
    }

    ctx.restore();
  };

  MapRenderer.prototype._drawCityScreenResources = function(cs) {
    const { ctx, city, gs, civ, yields, MAP_X, MAP_Y, MAP_W, MAP_H, RES_TITLE_Y, FOOD_ROW_Y, TRADE_ROW_Y, TAX_ROW_Y, SHIELD_ROW_Y, vx, vy, vs, vfont, sh, shc } = cs;
    ctx.font = vfont(10);
    ctx.textAlign = 'center';
    shc('City Resources', 199 + 238 / 2, RES_TITLE_Y + 12, CLR.GOLD, C_HDR_SH);
    shc('Resource Map', MAP_X + MAP_W / 2, MAP_Y + MAP_H + 12, CLR.GOLD, '#003300');
    ctx.textAlign = 'left';

    const foodSurplus = yields.food - city.size * 2;
    const IW = 12, IH = 12;
    const barL = 203, barR = 433, barW = 230;

    const iconSpacing = (n) => {
      if (n <= 15) return 13;
      if (n <= 17) return 11;
      if (n <= 19) return 10;
      if (n <= 21) return 9;
      if (n <= 23) return 8;
      if (n <= 25) return 7;
      if (n <= 29) return 6;
      if (n <= 33) return 5;
      if (n <= 37) return 4;
      if (n <= 49) return 3;
      return 2;
    };

    const drawIconsL = (baseX, baseY, icon, count, step) => {
      if (!icon || count <= 0) return;
      for (let i = 0; i < count; i++) ctx.drawImage(icon, vx(baseX + i * step), vy(baseY), vs(IW), vs(IH));
    };
    const drawIconsR = (baseX, baseY, icon, count, step) => {
      if (!icon || count <= 0) return;
      const startX = baseX - (count - 1) * step - IW;
      for (let i = 0; i < count; i++) ctx.drawImage(icon, vx(startX + i * step), vy(baseY), vs(IW), vs(IH));
    };

    {
      const ry = FOOD_ROW_Y;
      const total = yields.food + Math.abs(foodSurplus);
      const step = Math.min(IW, iconSpacing(total));
      const foodIc = this._getResourceIcon('food');
      const hungerIc = foodSurplus < 0 ? this._getResourceIcon('hunger') : foodIc;
      ctx.font = vfont(10, true);
      ctx.textAlign = 'left';
      sh(`Food: ${yields.food}`, barL, ry - 2, C_FOOD);
      ctx.textAlign = 'right';
      sh(`${foodSurplus >= 0 ? 'Surplus' : 'Hunger'}: ${Math.abs(foodSurplus)}`, barR, ry - 2, foodSurplus >= 0 ? C_SURPLUS : '#c04020');
      ctx.textAlign = 'left';
      drawIconsL(barL, ry + 2, foodIc, yields.food, step);
      drawIconsR(barR, ry + 2, foodSurplus >= 0 ? foodIc : hungerIc, Math.abs(foodSurplus), step);
    }

    {
      const ry = TRADE_ROW_Y;
      const corruptFrac = gs._corruptionFraction ? gs._corruptionFraction(city, civ) : 0;
      const rawTrade = corruptFrac < 1 ? Math.round(yields.trade / (1 - corruptFrac)) : yields.trade;
      const corruption = rawTrade - yields.trade;
      const total = rawTrade + corruption;
      const step = Math.min(IW, iconSpacing(total));
      const tradeIc = this._getResourceIcon('trade');
      const corruptIc = this._getResourceIcon('corruption') || tradeIc;
      ctx.font = vfont(10, true);
      ctx.textAlign = 'left';
      sh(`Trade: ${rawTrade}`, barL, ry - 2, C_TRADE);
      ctx.textAlign = 'right';
      sh(`Corruption: ${corruption}`, barR, ry - 2, C_CORRUPT);
      ctx.textAlign = 'left';
      drawIconsL(barL, ry + 2, tradeIc, rawTrade, step);
      drawIconsR(barR, ry + 2, corruptIc, corruption, step);
    }

    {
      const ry = TAX_ROW_Y;
      const taxPct = civ?.taxRate ?? 50;
      const sciPct = civ?.sciRate ?? 50;
      const luxPct = civ?.luxRate ?? 0;
      const t = yields.trade;
      const taxAmt = Math.floor(t * taxPct / 100);
      const sciAmt = Math.floor(t * sciPct / 100);
      const luxAmt = t - taxAmt - sciAmt;
      const total = taxAmt + luxAmt + sciAmt;
      const step = Math.min(IW, iconSpacing(total));
      const goldIc = this._getResourceIcon('gold');
      const luxIc = this._getResourceIcon('luxury');
      const sciIc = this._getResourceIcon('science');
      drawIconsL(barL, ry, goldIc, taxAmt, step);
      if (luxAmt > 0) drawIconsL(barL + taxAmt * step + step, ry, luxIc, luxAmt, step);
      drawIconsR(barR, ry, sciIc, sciAmt, step);
      ctx.font = vfont(10);
      ctx.textAlign = 'left';
      sh(`${taxPct}% Tax: ${taxAmt}`, barL, ry + IH + 4, CLR.GOLD);
      ctx.textAlign = 'center';
      shc(`${luxPct}% Lux: ${luxAmt}`, barL + barW / 2, ry + IH + 4, C_LUX);
      ctx.textAlign = 'right';
      sh(`${sciPct}% Sci: ${sciAmt}`, barR, ry + IH + 4, C_SCI);
      ctx.textAlign = 'left';
    }

    {
      const ry = SHIELD_ROW_Y;
      const support = gs._cityShieldSupport(city);
      // cityYields() has already deducted unit support and waste, so subtracting
      // support here a second time under-reported production in the city screen.
      const netProd = yields.shields;
      const total = support + netProd;
      const step = Math.min(IW, iconSpacing(total));
      const shieldIc = this._getResourceIcon('shields');
      drawIconsL(barL, ry, shieldIc, support, step);
      drawIconsR(barR, ry, shieldIc, netProd, step);
      ctx.font = vfont(10, true);
      ctx.textAlign = 'left';
      sh(`Support: ${support}`, barL, ry + IH + 4, C_SUPPORT);
      ctx.textAlign = 'right';
      sh(`Production: ${netProd}`, barR, ry + IH + 4, C_PROD_LBL);
      ctx.textAlign = 'left';
    }
  };

  MapRenderer.prototype._drawCityScreenFoodStorage = function(cs) {
    const { ctx, city, gs, FOOD_X, FOOD_Y, FOOD_W, vs, vx, vy, vfont, shc } = cs;
    ctx.font = vfont(10);
    ctx.textAlign = 'center';
    shc('Food Storage', FOOD_X + FOOD_W / 2, FOOD_Y + 11, C_FOOD_HDR, '#000000');
    ctx.textAlign = 'left';

    const foodPerRow = city.size + 1;
    const wheat_spacing = (function(sz) {
      if (sz <= 9) return 17;
      if (sz === 10) return 16;
      if (sz === 11) return 13;
      if (sz === 12) return 12;
      if (sz === 13) return 11;
      if (sz === 14) return 10;
      if (sz <= 16) return 9;
      if (sz === 17) return 8;
      if (sz <= 20) return 7;
      if (sz <= 22) return 6;
      if (sz <= 26) return 5;
      if (sz <= 33) return 4;
      if (sz <= 40) return 3;
      if (sz <= 80) return 2;
      return 1;
    })(city.size);

    const foodIcon = this._getResourceIcon('food');
    const iconW = foodIcon ? 14 : 11;
    const iconH = foodIcon ? 14 : 11;
    const boxWidth = city.size * wheat_spacing + iconW + 7;
    const boxX = FOOD_X + FOOD_W / 2 - boxWidth / 2;
    const boxTop = FOOD_Y + 15;
    const boxBot = FOOD_Y + 160;

    ctx.strokeStyle = 'rgb(75, 155, 35)';
    ctx.lineWidth = vs(1);
    ctx.beginPath();
    ctx.moveTo(vx(boxX), vy(boxTop));
    ctx.lineTo(vx(boxX + boxWidth), vy(boxTop));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(vx(boxX), vy(boxTop));
    ctx.lineTo(vx(boxX), vy(boxBot));
    ctx.stroke();
    ctx.strokeStyle = 'rgb(0, 51, 0)';
    ctx.beginPath();
    ctx.moveTo(vx(boxX), vy(boxBot));
    ctx.lineTo(vx(boxX + boxWidth), vy(boxBot));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(vx(boxX + boxWidth), vy(boxTop));
    ctx.lineTo(vx(boxX + boxWidth), vy(boxBot));
    ctx.stroke();

    const boxRows = COSMIC.foodBoxRows ?? 10;
    const hasGranary = city.improvements.has(3) || (gs.civs[city.civId]?.wonders?.has(39));
    let count = 0;
    const startX = boxX + 3;
    for (let row = 0; row < boxRows && count < city.food; row++) {
      for (let col = 0; col < foodPerRow && count < city.food; col++) {
        const ix = startX + wheat_spacing * col;
        const iy = boxTop + 3 + iconH * row;
        if (iy + iconH > boxBot) break;
        if (foodIcon) ctx.drawImage(foodIcon, vx(ix), vy(iy), vs(iconW), vs(iconH));
        count++;
      }
    }

    if (hasGranary) {
      const lineWidth = boxWidth - 10;
      const lineStartX = startX + 2;
      const lineY = FOOD_Y + 87;
      ctx.strokeStyle = 'rgb(75, 155, 35)';
      ctx.lineWidth = vs(1);
      ctx.beginPath();
      ctx.moveTo(vx(lineStartX), vy(lineY));
      ctx.lineTo(vx(lineStartX + lineWidth), vy(lineY));
      ctx.stroke();
    }
  };

  MapRenderer.prototype._drawCityScreenProductionPanel = function(cs) {
    const { ctx, city, gs, prod, PROD_X: PX, PROD_Y: PY, PROD_W: PW, PROD_H: PH, vx, vy, vs, vfr, vfl, vfont, shc, win95Btn } = cs;
    this._cityScreenProductionShieldRect = null;
    const prodGrad = ctx.createLinearGradient(vx(PX), vy(PY), vx(PX), vy(PY + PH));
    prodGrad.addColorStop(0, '#101b82');
    prodGrad.addColorStop(1, '#4963c2');
    ctx.fillStyle = prodGrad;
    vfl(PX, PY, PW, PH);
    ctx.lineWidth = vs(1);
    ctx.strokeStyle = '#5367BF';
    ctx.beginPath();
    ctx.moveTo(vx(PX + PW), vy(PY + 0.5));
    ctx.lineTo(vx(PX + 0.5), vy(PY + 0.5));
    ctx.lineTo(vx(PX + 0.5), vy(PY + PH));
    ctx.stroke();
    ctx.strokeStyle = '#00005F';
    ctx.beginPath();
    ctx.moveTo(vx(PX), vy(PY + PH - 0.5));
    ctx.lineTo(vx(PX + PW - 0.5), vy(PY + PH - 0.5));
    ctx.lineTo(vx(PX + PW - 0.5), vy(PY));
    ctx.stroke();

    // Civ2 uses the upper strip for the production icon.  Buildings also get
    // a label; units are identified by their (larger) unit sprite alone.
    if (!prod) {
      ctx.font = vfont(10);
      ctx.textAlign = 'center';
      shc('Nothing', PX + PW / 2, PY + 12, CLR.GOLD, C_HDR_SH);
      ctx.textAlign = 'left';
    } else if (prod.type === 'improvement') {
      const improvement = IMPROVEMENTS[prod.id];
      ctx.font = vfont(10);
      ctx.textAlign = 'center';
      shc(improvement?.name ?? '?', PX + PW / 2, PY + 12, '#3f4fa7', '#000000');
      ctx.textAlign = 'left';
      try {
        const wonder = prod.id >= 39;
        const index = wonder ? prod.id - 39 : prod.id - 1;
        const cols = wonder ? 7 : 8;
        const spr = this.sprites.getRegionSprite('icons', 343 + (index % cols) * 37,
          (wonder ? 106 : 1) + Math.floor(index / cols) * 21, 36, 20);
        if (spr) ctx.drawImage(spr, vx(PX + 79.5), vy(PY + 18), vs(36), vs(20));
      } catch (e) {
        _warnOnce('production-improvement:' + prod.id, 'Production improvement sprite unavailable: ' + e.message);
      }
    }

    const buyBW = 68, buyBH = 24;
    const buyCost = prod ? gs.rushBuyCost(city) : -1;
    win95Btn(PX + 5, PY + 16, buyBW, buyBH, 'Buy');
    this._cityScreenBuyRect = prod && buyCost > 0 ? vfr(PX + 5, PY + 16, buyBW, buyBH) : null;
    win95Btn(PX + 120, PY + 16, buyBW, buyBH, 'Change');
    this._cityScreenChangeRect = vfr(PX + 120, PY + 16, buyBW, buyBH);

    if (prod && prod.type === 'unit') {
      try {
        const sprRow = Math.floor(prod.id / 9);
        const sprCol = prod.id % 9;
        const civColor = CIV_COLORS[gs.civs[city.civId]?.data?.color ?? 0];
        const unitSpr = this._getColoredUnitSprite(sprRow, sprCol, civColor);
        if (unitSpr) ctx.drawImage(unitSpr, vx(PX + 97.5 - 24), vy(PY + 18), vs(48), vs(36));
      } catch (e) {
        _warnOnce('production-unit:' + prod.id, 'Production unit sprite unavailable: ' + e.message);
      }
    }

    const prodCost = prod ? gs.productionCost(prod) : 0;
    // These arrays are retained for compatibility with saved renderer state,
    // but the original MGE city window has no production queue controls.
    this._cityScreenQueueItemRects = [];
    this._cityScreenQueueUpRects = [];
    this._cityScreenQueueDownRects = [];
    if (prodCost <= 0) {
      return;
    }

    // ProductionBox.cs: the box begins at y+42, is at most ten rows high,
    // and contains only shields already accumulated toward the current item.
    const shieldBoxRows = COSMIC.shieldBoxRows ?? 10;
    const sW = 11, sH = 11;
    const maxLines = Math.max(1, Math.floor((PH - 48) / sH));
    const requiredLines = Math.max(1, Math.ceil(prodCost / shieldBoxRows));
    const lines = Math.min(maxLines, requiredLines);
    const shieldsPerRow = maxLines > requiredLines
      ? shieldBoxRows
      : Math.ceil(prodCost / lines);
    const boxX = PX + 5;
    const boxY = PY + 42;
    const boxW = PW - 15;
    const boxH = 6 + lines * sH;
    this._cityScreenProductionShieldRect = vfr(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#5367bf';
    ctx.beginPath();
    ctx.moveTo(vx(boxX), vy(boxY + boxH));
    ctx.lineTo(vx(boxX), vy(boxY));
    ctx.lineTo(vx(boxX + boxW), vy(boxY));
    ctx.stroke();
    ctx.strokeStyle = '#00005f';
    ctx.beginPath();
    ctx.moveTo(vx(boxX), vy(boxY + boxH));
    ctx.lineTo(vx(boxX + boxW), vy(boxY + boxH));
    ctx.lineTo(vx(boxX + boxW), vy(boxY));
    ctx.stroke();

    const drawW = PW - 42;
    let spacing = sW;
    const requiredW = shieldsPerRow * spacing;
    let shieldX = boxX + 3;
    if (requiredW < drawW) shieldX += (drawW - requiredW) / 2;
    else if (shieldsPerRow > 1) spacing = (drawW - sW) / shieldsPerRow;
    const shieldIc = this._getResourceIcon('shields');
    const shown = Math.min(city.shields, prodCost);
    for (let i = 0; i < shown; i++) {
      const col = i % shieldsPerRow;
      const row = Math.floor(i / shieldsPerRow);
      if (row >= lines) break;
      if (shieldIc) ctx.drawImage(shieldIc, vx(shieldX + spacing * col), vy(boxY + 3 + sH * row), vs(sW), vs(sH));
    }
  };

  MapRenderer.prototype._drawCityScreenUnitsNavImprovements = function(cs) {
    const { ctx, city, gs, USUP_X, USUP_Y, USUP_W, USUP_H, INFO_X, INFO_Y, UPRES_W, UPRES_H, IMPR_X, IMPR_Y, IMPR_W, IMPR_H, IMPR_ROWS, NAV_X, NAV_Y, NAV_BW, NAV_BH, vx, vy, vs, vfl, vst, vfr, vtx, vfont, shc, win95Btn } = cs;
    ctx.strokeStyle = CLR.GOLD;
    ctx.lineWidth = vs(1);
    vst(USUP_X, USUP_Y, USUP_W, USUP_H);
    vst(INFO_X, INFO_Y, UPRES_W, UPRES_H);
    vst(IMPR_X, IMPR_Y, IMPR_W, IMPR_H);
    ctx.font = vfont(10);
    ctx.textAlign = 'center';
    shc('Units Supported', USUP_X + USUP_W / 2, USUP_Y + 11, CLR.GOLD, C_HDR_SH);
    ctx.textAlign = 'left';

    {
      const COLS = 4, ROWS = 2, MAX = COLS * ROWS;
      const uW = 24, uH = 24;
      const supported = gs.units.filter(u => u.civId === city.civId && u.homeCity === city.id);
      if (supported.length === 0) {
        ctx.font = vfont(9);
        ctx.fillStyle = '#888';
        vtx('(none)', USUP_X + 4, USUP_Y + 40);
      } else {
        supported.slice(0, MAX).forEach((u, i) => {
          const gc = i % COLS, gr = Math.floor(i / COLS);
          try {
            const sr2 = Math.floor(u.typeId / 9), sc2 = u.typeId % 9;
            const spr = this.sprites.getSprite('units', sr2, sc2);
            ctx.drawImage(spr, vx(USUP_X + 4 + gc * (uW + 2)), vy(USUP_Y + 14 + gr * (uH + 1)), vs(uW), vs(uH));
          } catch (e) {
            _warnOnce('supported-unit:' + u.id, 'Supported unit sprite unavailable: ' + e.message);
            ctx.fillStyle = '#888';
            vfl(USUP_X + 4 + gc * (uW + 2), USUP_Y + 14 + gr * (uH + 1), uW - 1, uH - 1);
          }
        });
      }
    }

    const infoMode = this._cityScreenTab ?? 'units';
    ctx.font = vfont(10);
    ctx.textAlign = 'center';
    shc(infoMode === 'support' ? 'Support Map' : infoMode === 'happy' ? 'Happiness Analysis' : 'Units Present',
      INFO_X + UPRES_W / 2, INFO_Y + 11, CLR.GOLD, C_HDR_SH);
    ctx.textAlign = 'left';

    if (infoMode === 'units') {
      const COLS = 5, ROWS = 2, MAX = COLS * ROWS;
      const uW = 24, uH = 24;
      const present = gs.unitsAt(city.col, city.row).filter(u => u.civId === city.civId);
      if (present.length === 0) {
        ctx.font = vfont(9);
        ctx.fillStyle = '#888';
        vtx('(none)', INFO_X + 6, INFO_Y + 40);
      } else {
        present.slice(0, MAX).forEach((u, i) => {
          const gc = i % COLS, gr = Math.floor(i / COLS);
          try {
            const sr2 = Math.floor(u.typeId / 9), sc2 = u.typeId % 9;
            const spr = this.sprites.getSprite('units', sr2, sc2);
            ctx.drawImage(spr, vx(INFO_X + 4 + gc * (uW + 2)), vy(INFO_Y + 14 + gr * (uH + 1)), vs(uW), vs(uH));
          } catch (e) {
            _warnOnce('present-unit:' + u.id, 'Present unit sprite unavailable: ' + e.message);
            ctx.fillStyle = '#888';
            vfl(INFO_X + 4 + gc * (uW + 2), INFO_Y + 14 + gr * (uH + 1), uW - 1, uH - 1);
          }
        });
      }
    } else if (infoMode === 'support') {
      const sqW = Math.min(2, (UPRES_W - 8) / gs.mapCols);
      const sqH = Math.min(1, (UPRES_H - 20) / gs.mapRows);
      const mapW = gs.mapCols * sqW;
      const mapH = gs.mapRows * sqH;
      const ox = INFO_X + (UPRES_W - mapW) / 2;
      const oy = INFO_Y + 15 + (UPRES_H - 15 - mapH) / 2;
      for (let row = 0; row < gs.mapRows; row++) {
        for (let col = 0; col < gs.mapCols; col++) {
          ctx.fillStyle = gs.tiles[row][col].id === 7 ? '#00005f' : '#377b17';
          ctx.fillRect(vx(ox + col * sqW), vy(oy + row * sqH), Math.max(1, vs(sqW)), Math.max(1, vs(sqH)));
        }
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(vx(ox + city.col * sqW), vy(oy + city.row * sqH), Math.max(1, vs(sqW)), Math.max(1, vs(sqH)));
      ctx.fillStyle = '#9f9f9f';
      for (const unit of gs.units.filter(u => u.homeCity === city.id && (u.col !== city.col || u.row !== city.row))) {
        ctx.fillRect(vx(ox + unit.col * sqW), vy(oy + unit.row * sqH), Math.max(1, vs(sqW)), Math.max(1, vs(sqH)));
      }
    } else {
      const happiness = gs.cityHappiness(city);
      const rows = [
        ['Happy Citizens', happiness.happy, '#f4c928'],
        ['Content Citizens', happiness.content, '#eeeeee'],
        ['Unhappy Citizens', happiness.unhappy, '#d84628'],
      ];
      rows.forEach(([label, count, color], i) => {
        const y = INFO_Y + 28 + i * 17;
        ctx.fillStyle = color;
        ctx.fillRect(vx(INFO_X + 8), vy(y - 8), vs(8), vs(8));
        ctx.font = vfont(9);
        ctx.fillStyle = '#000000';
        vtx(`${label}: ${count}`, INFO_X + 22, y);
      });
      ctx.font = vfont(9, true);
      ctx.fillStyle = happiness.disorder ? '#c02000' : '#1b6818';
      vtx(happiness.disorder ? 'Civil Disorder' : 'Order Maintained', INFO_X + 8, INFO_Y + 78);
    }

    this._cityScreenNavRects = [];
    const navDefs = [
      { label: 'Info', action: 'info' },
      { label: 'Map', action: 'map' },
      { label: 'Rename', action: 'rename' },
      { label: 'Happy', action: 'happy' },
      { label: 'View', action: 'view' },
      { label: 'Exit', action: 'exit' },
    ];
    navDefs.forEach(({ label, action }, i) => {
      const bc = i % 3, br = Math.floor(i / 3);
      const bx = NAV_X + bc * (NAV_BW + 1);
      const bby = NAV_Y + br * (NAV_BH + 1);
      win95Btn(bx, bby, NAV_BW, NAV_BH, label);
      this._cityScreenNavRects.push({ ...vfr(bx, bby, NAV_BW, NAV_BH), action });
    });

    ctx.font = vfont(10);
    ctx.textAlign = 'center';
    shc('City Improvements', IMPR_X + IMPR_W / 2, IMPR_Y - 12, CLR.GOLD, C_HDR_SH);
    ctx.textAlign = 'left';

    {
      const builtList = [...city.improvements];
      const itemH2 = 12;
      const scroll = Math.max(0, Math.min(this._cityScreenScroll ?? 0, Math.max(0, builtList.length - IMPR_ROWS)));
      this._cityScreenImprRects = [];
      builtList.slice(scroll, scroll + IMPR_ROWS).forEach((id, i) => {
        const ix = IMPR_X;
        const iy = IMPR_Y + i * itemH2;
        this._cityScreenImprRects.push({ ...vfr(ix, iy, IMPR_W, itemH2), impId: id });
        if (id >= 1 && id <= 66) {
          try {
            const isWonder = id >= 39;
            const idx = isWonder ? id - 39 : id - 1;
            const cols = isWonder ? 7 : 8;
            const baseY = isWonder ? 106 : 1;
            const srcX = 343 + (idx % cols) * 37;
            const srcY = baseY + Math.floor(idx / cols) * 21;
            const spr = this.sprites.getRegionSprite('icons', srcX, srcY, 36, 20);
            ctx.drawImage(spr, vx(ix), vy(iy), vs(18), vs(10));
          } catch (e) {
            _warnOnce('improvement-icon:' + id, 'Improvement icon sprite unavailable: ' + e.message);
            ctx.fillStyle = CLR.GOLD;
            vfl(ix, iy, 10, 10);
          }
        }

        ctx.font = vfont(9);
        const imp = IMPROVEMENTS[id];
        ctx.fillStyle = '#000000';
        ctx.fillText(imp?.name ?? `Impr#${id}`, vx(ix + 20) + 1, vy(iy + 9));
        ctx.fillStyle = '#ffffff';
        ctx.fillText(imp?.name ?? `Impr#${id}`, vx(ix + 20), vy(iy + 9));
        if (imp?.upkeep > 0) {
          const goldIc2 = this._getResourceIcon('gold');
          if (goldIc2) {
            for (let g = 0; g < imp.upkeep; g++) {
              ctx.drawImage(goldIc2, vx(IMPR_X + 149 - (imp.upkeep - g) * 8), vy(iy), vs(8), vs(8));
            }
          }
        }
      });

      if (builtList.length === 0) {
        ctx.font = vfont(9);
        ctx.fillStyle = '#888';
        vtx('(none)', IMPR_X + 4, IMPR_Y + 12);
      }
      if (builtList.length > IMPR_ROWS) {
        ctx.font = vfont(8);
        ctx.fillStyle = '#888888';
        ctx.fillText(`\u2195 ${scroll + 1}/${builtList.length}`, vx(IMPR_X + IMPR_W - 30), vy(IMPR_Y + IMPR_H - 2));
      }
    }

    if (infoMode === 'units') {
      const supply = gs.cityCommoditySupply(city);
      const demand = gs.cityCommodityDemand(city);
      ctx.font = vfont(8, false);
      ctx.fillStyle = C_HDR_SH;
      ctx.fillText(`Supplies: ${supply.join(', ')}`, vx(INFO_X + 2) + 1, vy(INFO_Y + 130) + 1);
      ctx.fillStyle = C_CORRUPT;
      ctx.fillText(`Supplies: ${supply.join(', ')}`, vx(INFO_X + 2), vy(INFO_Y + 130));
      ctx.fillStyle = C_HDR_SH;
      ctx.fillText(`Demands: ${demand.join(', ')}`, vx(INFO_X + 2) + 1, vy(INFO_Y + 143) + 1);
      ctx.fillStyle = C_CORRUPT;
      ctx.fillText(`Demands: ${demand.join(', ')}`, vx(INFO_X + 2), vy(INFO_Y + 143));
    }
  };

  MapRenderer.prototype._drawCityScreenChooserOverlay = function(cs) {
    const { ctx, city, prod, vx, vy, vs, vfr, vfl, vtx, vfont, vtfont, shc, win95Btn } = cs;
    if (!this._cityScreenProdList) {
      this._cityScreenQueueModeRect = null;
      return;
    }

    // Game.txt @PRODUCTION: width=440, listbox, Auto + Help; PopupBoxReader
    // appends OK. MGE displays this as a fixed-size top-level dialog rather
    // than shrinking it to the number of currently available items. The
    // virtual geometry below is measured from the original 680x268 dialog.
    const items = this.gameState.availableProduction(city);
    if (!items.some(item => this._cityScreenProductionSelection?.type === item.type && this._cityScreenProductionSelection?.id === item.id)) {
      this._cityScreenProductionSelection = prod ?? items[0] ?? null;
    }
    const rowH = 19;
    const OPW = 544;
    const OPH = 214;
    const listTop = 28;
    const listH = 152;
    const rowsVis = Math.max(1, Math.min(8, Math.floor(listH / rowH)));
    const OPX = (640 - OPW) / 2;
    const OPY = (446 - OPH) / 2;
    this._cityProductionDialogRect = vfr(OPX, OPY, OPW, OPH);
    if (this._innerWallpaper) {
      this._tilePattern(ctx, this._innerWallpaper, vx(OPX), vy(OPY), vs(OPW), vs(OPH));
    } else {
      ctx.fillStyle = '#c0c0c0';
      vfl(OPX, OPY, OPW, OPH);
    }
    const bColors = ['#e3e3e3', '#696969', '#ffffff', '#a0a0a0', '#f0f0f0', '#dfdfdf', '#434343'];
    const bvx = x => vx(OPX + x), bvy = y => vy(OPY + y);
    const bvr = x => vx(OPX + OPW - x), bvb = y => vy(OPY + OPH - y);
    [[0, 1], [2, 3], [4, 4], [5, 6], [5, 6]].forEach(([ci, co], l) => {
      ctx.strokeStyle = bColors[ci];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bvr(l), bvy(l));
      ctx.lineTo(bvx(l), bvy(l));
      ctx.lineTo(bvx(l), bvb(l));
      ctx.stroke();
      ctx.strokeStyle = bColors[co];
      ctx.beginPath();
      ctx.moveTo(bvx(l + 1), bvb(l + 1));
      ctx.lineTo(bvr(l + 1), bvb(l + 1));
      ctx.lineTo(bvr(l + 1), bvy(l));
      ctx.stroke();
    });

    // MGE listbox: flat silver field with a thin sunken edge. Empty space is
    // retained below short early-game build lists.
    ctx.fillStyle = '#c0c0c0';
    vfl(OPX + 5, OPY + listTop, OPW - 10, listH);
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx(OPX + 5) + 0.5, vy(OPY + listTop) + 0.5,
      vs(OPW - 10) - 1, vs(listH) - 1);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(vx(OPX + 6) + 0.5, vy(OPY + listTop + 1) + 0.5,
      vs(OPW - 12) - 1, vs(listH - 2) - 1);

    // Original embossed Times title (not the gold city-screen heading).
    ctx.font = `bold ${vs(15)}px ${FONT_TIMES}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`What shall we build in ${city.name}?`, vx(OPX + OPW / 2) + 1, vy(OPY + 21) + 1);
    ctx.fillStyle = '#3f3f3f';
    ctx.fillText(`What shall we build in ${city.name}?`, vx(OPX + OPW / 2), vy(OPY + 21));
    ctx.textAlign = 'left';
    this._cityScreenQueueModeRect = null;
    this._cityScreenTabRects = [];
    const listY = OPY + listTop;
    const scroll2 = Math.max(0, Math.min(this._cityScreenScroll, Math.max(0, items.length - rowsVis)));
    this._cityScreenScroll = scroll2;
    this._cityScreenItemRects = [];
    for (let i = 0; i < rowsVis && i + scroll2 < items.length; i++) {
      const item = items[i + scroll2];
      const iy = listY + i * rowH;
      const isSelected = this._cityScreenProductionSelection?.type === item.type && this._cityScreenProductionSelection?.id === item.id;
      ctx.fillStyle = isSelected ? '#808080' : '#c0c0c0';
      vfl(OPX + 6, iy, OPW - 12, rowH);
      try {
        if (item.type === 'unit') {
          const spr = this.sprites.getSprite('units', Math.floor(item.id / 9), item.id % 9);
          const imageShift = i % 2 === 1 ? 16 : 0;
          if (spr) ctx.drawImage(spr, vx(OPX + 8 + imageShift), vy(iy), vs(30), vs(19));
        } else {
          const wonder = item.id >= 39;
          const index = wonder ? item.id - 39 : item.id - 1;
          const cols = wonder ? 7 : 8;
          const spr = this.sprites.getRegionSprite('icons', 343 + (index % cols) * 37,
            (wonder ? 106 : 1) + Math.floor(index / cols) * 21, 36, 20);
          if (spr) ctx.drawImage(spr, vx(OPX + 8), vy(iy + 1), vs(36), vs(17));
        }
      } catch (e) {
        _warnOnce(`production-icon-${item.type}-${item.id}`, `Production icon unavailable: ${e.message}`);
      }
      ctx.font = `bold ${vs(13)}px ${FONT_TIMES}`;
      ctx.fillStyle = isSelected ? '#ffffff' : '#000000';
      vtx(item.name, OPX + 70, iy + 15);
      const perTurn = Math.max(1, this.gameState.cityYields(city).shields);
      const turns = Math.max(1, Math.ceil(Math.max(0, item.cost - city.shields) / perTurn));
      const unit = item.type === 'unit' ? UNITS[item.id] : null;
      const facts = unit
        ? `(${turns} Turns, ADM: ${unit.attack}/${unit.defense}/${unit.move} HP: ${unit.hp}/${unit.fp})`
        : `(${turns} Turns)`;
      ctx.font = `bold ${vs(11)}px ${FONT_TIMES}`;
      ctx.fillStyle = isSelected ? '#ffffff' : '#222222';
      ctx.textAlign = 'right';
      const factsRight = items.length > rowsVis ? OPX + OPW - 26 : OPX + OPW - 9;
      ctx.fillText(facts, vx(factsRight), vy(iy + 15));
      ctx.textAlign = 'left';
      this._cityScreenItemRects.push({ ...vfr(OPX + 6, iy, OPW - 12, rowH), item });
    }

    if (items.length > rowsVis) {
      this._drawScrollbar(ctx, vx(OPX + OPW - 20), vy(listY), vs(listH), scroll2, Math.max(1, items.length - rowsVis));
    }

    const by = OPY + OPH - 29;
    const gap = 4;
    const bw = (OPW - 20) / 3;
    win95Btn(OPX + 6, by, bw, 25, 'Auto');
    win95Btn(OPX + 6 + bw + gap, by, bw, 25, 'Help');
    win95Btn(OPX + 6 + (bw + gap) * 2, by, bw, 25, 'OK');
    this._cityScreenAutoRect = vfr(OPX + 6, by, bw, 25);
    this._cityScreenHelpRect = vfr(OPX + 6 + bw + gap, by, bw, 25);
    this._cityScreenOkRect = vfr(OPX + 6 + (bw + gap) * 2, by, bw, 25);
  };

  MapRenderer.prototype._drawCityScreenPopupOverlay = function(cs) {
    const { ctx, canvasW, canvasH, VW, VH, vx, vy, vs, vfr, vfl, vfont, win95Btn } = cs;
    if (!this._cityPopupText) return;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    const popW = 280, popH = this._cityPopupConfirm ? 64 : 48;
    const popX = (VW - popW) / 2, popY = (VH - popH) / 2;
    ctx.fillStyle = '#9a9a9a';
    vfl(popX, popY, popW, popH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx(popX) + 0.5, vy(popY) + 0.5, vs(popW) - 1, vs(popH) - 1);
    ctx.strokeStyle = '#434343';
    ctx.strokeRect(vx(popX) - 0.5, vy(popY) - 0.5, vs(popW) + 1, vs(popH) + 1);
    ctx.font = vfont(11);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText(this._cityPopupText, vx(popX + popW / 2) + 1, vy(popY + 18) + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this._cityPopupText, vx(popX + popW / 2), vy(popY + 18));

    const btnW = 60, btnH = 18, btnY2 = popY + popH - 26;
    if (this._cityPopupConfirm) {
      win95Btn(popX + popW / 2 - btnW - 8, btnY2, btnW, btnH, 'Yes');
      win95Btn(popX + popW / 2 + 8, btnY2, btnW, btnH, 'No');
      this._cityPopupYesRect = vfr(popX + popW / 2 - btnW - 8, btnY2, btnW, btnH);
      this._cityPopupNoRect = vfr(popX + popW / 2 + 8, btnY2, btnW, btnH);
    } else {
      win95Btn(popX + popW / 2 - btnW / 2, btnY2, btnW, btnH, 'OK');
      this._cityPopupOkRect = vfr(popX + popW / 2 - btnW / 2, btnY2, btnW, btnH);
    }
    ctx.textAlign = 'left';
  };

  MapRenderer.prototype._showCityPopup = function(text, confirm) {
    this._cityPopupText = text;
    this._cityPopupConfirm = !!confirm;
    this._cityPopupOkRect = null;
    this._cityPopupYesRect = null;
    this._cityPopupNoRect = null;
  };

  /** Returns the ordered list of items for the current city screen tab. */
  MapRenderer.prototype._cityScreenItems = function(city) {
    return this.gameState.availableProduction(city);
  }

  MapRenderer.prototype._handleCityScreenClick = function(px, py, canvasW, canvasH) {
    const hit = (r) => r && px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
    const city = this._cityScreen;
    const gs = this.gameState;

    if (this._cityPopupText) {
      if (hit(this._cityPopupOkRect)) {
        this._cityPopupText = null;
        return;
      }
      if (hit(this._cityPopupYesRect)) {
        if (this._pendingSellImpId != null) {
          gs.sellImprovement(city, this._pendingSellImpId);
          this._pendingSellImpId = null;
        }
        if (this._pendingProductionChange) {
          gs.changeProduction(city, this._pendingProductionChange);
          this._pendingProductionChange = null;
          this._cityScreenProdList = false;
        }
        this._cityPopupText = null;
        return;
      }
      if (hit(this._cityPopupNoRect)) {
        this._pendingSellImpId = null;
        this._pendingProductionChange = null;
        this._cityPopupText = null;
        return;
      }
      return;
    }

    // Close button (X)
    if (hit(this._cityScreenCloseRect)) { this._cityScreen = null; return; }

    // Citizen face click: cycle specialist type
    if (this._citizenRects?.length) {
      for (let i = 0; i < this._citizenRects.length; i++) {
        if (hit(this._citizenRects[i])) {
          gs.cycleSpecialist(this._cityScreen, i);
          return;
        }
      }
    }

    // Nav buttons
    for (const nb of this._cityScreenNavRects) {
      if (hit(nb)) {
        if (nb.action === 'exit')   { this._cityScreen = null; return; }
        if (nb.action === 'change') {
          this._cityScreenProdList = !this._cityScreenProdList;
          this._cityScreenScroll   = 0;
          if (this._cityScreenProdList) {
            this._cityScreenQueueAddMode = false;
            this._cityScreenProductionSelection = city.production ?? null;
          }
          return;
        }
        if (nb.action === 'info')   { this._cityScreenTab = 'units'; return; }
        if (nb.action === 'map')    { this._cityScreenTab = 'support'; return; }
        if (nb.action === 'happy')  { this._cityScreenTab = 'happy'; return; }
        if (nb.action === 'rename') {
          this._openCityRenameDialog(city);
          return;
        }
        if (nb.action === 'view') {
          this.centerOn(city.col, city.row, canvasW, canvasH);
          this._cityScreen = null;
          return;
        }
        return;
      }
    }

    // Buy button
    if (this._cityScreenBuyRect && hit(this._cityScreenBuyRect)) {
      const cost = gs.rushBuyCost(city);
      if (cost > 0 && gs.civs[city.civId]?.gold >= cost) {
        gs.rushBuy(city);
      }
      return;
    }

    // Change button
    if (hit(this._cityScreenChangeRect)) {
      this._cityScreenProdList = !this._cityScreenProdList;
      this._cityScreenScroll   = 0;
      if (this._cityScreenProdList) {
        this._cityScreenQueueAddMode = false;
        this._cityScreenProductionSelection = city.production ?? null;
      }
      return;
    }

    // Original production listbox: Auto, Help, OK, and one combined item list.
    if (this._cityScreenProdList) {
      if (hit(this._cityScreenAutoRect)) {
        city.governor = !city.governor;
        return;
      }
      if (hit(this._cityScreenHelpRect)) {
        const current = this._cityScreenProductionSelection ?? city.production ?? this.gameState.availableProduction(city)[0];
        if (current) {
          const tab = current.type === 'unit' ? 'units' : current.id >= 39 ? 'wonders' : 'improv';
          const items = this._getCivilopediaItems(tab);
          const selIdx = Math.max(0, items.findIndex(i => i.id === current.id));
          this._civilopedia = { tab, selIdx, scroll: Math.max(0, Math.floor(selIdx / 10) - 1), rects: [], mode: 'detail' };
          if (!this._pediaTexts) this._loadPediaTexts().then(() => {});
        }
        return;
      }
      if (hit(this._cityScreenOkRect)) {
        const selected = this._cityScreenProductionSelection;
        if (selected) {
          const next = { type: selected.type, id: selected.id };
          const changedCategory = city.production && city.production.type !== next.type && city.shields > 0;
          if (changedCategory && gs._cityReportOptions?.warnChangingProduction !== false) {
            this._pendingProductionChange = next;
            this._showCityPopup('Changing production will waste shields. Continue?', true);
            return;
          }
          gs.changeProduction(this._cityScreen, next);
        }
        this._cityScreenProdList = false;
        return;
      }
      for (const ir of this._cityScreenItemRects) {
        if (hit(ir)) {
          this._cityScreenProductionSelection = { type: ir.item.type, id: ir.item.id };
          return;
        }
      }
      // MGE listboxes are modal; map clicks do not dismiss them.
      return;
    }

    // Improvement list click: sell improvement
    for (const ir of this._cityScreenImprRects ?? []) {
      if (hit(ir)) {
        const imp = IMPROVEMENTS[ir.impId];
        if (!imp) return;
        if (city.improvementSold) {
          this._showCityPopup('Already sold an improvement this turn.');
          return;
        }
        if (ir.impId === 1) {
          this._showCityPopup(`Can't sell ${imp.name}.`);
          return;
        }
        if (imp.isWonder) {
          this._showCityPopup(`Can't sell ${imp.name}.`);
          return;
        }
        this._pendingSellImpId = ir.impId;
        this._showCityPopup(`Sell ${imp.name} for ${imp.cost} gold?`, true);
        return;
      }
    }

    // City map tile click: toggle worked/unworked for BFC tiles
    if (this._cityScreenTileRects?.length) {
      // Find closest BFC tile whose diamond contains the click point
      let best = null, bestDist = Infinity;
      for (const t of this._cityScreenTileRects) {
        if (t.isCtr) continue; // center always worked
        const dx = (px - t.cx) / (t.tw / 2);
        const dy = (py - t.cy) / (t.th / 2);
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist < 1.0 && dist < bestDist) { best = t; bestDist = dist; }
      }
      if (best) {
        this.gameState.toggleCityTile(this._cityScreen, best.tileRow, best.tileCol);
        return;
      }
    }
  }


}
