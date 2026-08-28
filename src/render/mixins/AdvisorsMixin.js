/**
 * AdvisorsMixin — Science, Domestic, Trade, Military, Attitude advisors,
 * Demographics, Top 5 Cities, Hall of Fame, Wonders of the World.
 *
 * Extracted from MapRenderer.js. All methods are installed on MapRenderer.prototype.
 */
import { ADVANCES } from '../../data/advances.js';
import { UNITS } from '../../data/units.js';
import { IMPROVEMENTS } from '../../data/improvements.js';
import { GOVERNMENTS } from '../../data/governments.js';
import { CIVS } from '../../data/civs.js';
import { CIV_COLORS, CLR, FONT, FONT_ARIAL, FONT_TIMES } from '../renderConstants.js';
import { SFX } from '../../audio/sounds.js';

/** @param {typeof import('../MapRenderer.js').default} MapRenderer */
export function applyAdvisorsMixin(MapRenderer) {
  MapRenderer.prototype._drawAdvisorCloseButton = function(ctx, px, py, PW, PH, rects, yOverride = null) {
    const w = 80, h = 26;
    const x = px + PW / 2 - w / 2;
    const y = yOverride == null ? (py + PH - 40) : yOverride;
    this._drawWin95Button(ctx, x, y, w, h, 'Close', FONT_TIMES);
    const rect = { x, y, w, h, action: 'close' };
    if (rects) rects.push(rect);
    return rect;
  }

  // ─── Science Advisor (F6) ───────────────────────────────────────────────────

  MapRenderer.prototype._drawScienceAdvisor = function(ctx, canvasW, canvasH) {
    const gs  = this.gameState;
    const civ = gs.civs[0];
    

    // Panel dimensions
    const PW = Math.min(640, canvasW - 40);
    const PH = Math.min(460, canvasH - 40);
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Civ2 wallpaper panel with embossed title
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Science Advisor');

    // Header info
    const civData  = gs.civs[0];
    const civMeta  = CIVS[civData?.id ?? 0] ?? CIVS[0];
    const govId    = civData?.government ?? 0;
    const govDef   = GOVERNMENTS[govId];
    const govName  = govDef?.name ?? 'Despotism';
    const isFemale = civData?.femaleLeader ?? civMeta.defaultFemale ?? false;
    const customT  = civMeta.govtTitles?.find(g => g.govt === govId);
    const ldrTitle = customT ? (isFemale ? customT.female : customT.male)
      : (isFemale ? govDef?.titleFemale : govDef?.titleMale) ?? govDef?.name ?? '';
    const year     = gs.year;
    const yearStr  = year < 0 ? `${-year} B.C.` : `A.D. ${year}`;
    ctx.font = FONT.BODY_SMALL;
    this._panelText(ctx, `${govName} of the ${civMeta.plural}`, px + 10, py + 36);
    this._panelText(ctx, `${ldrTitle} ${civMeta.leader}: ${yearStr}`, px + 10, py + 50);

    // Research progress
    const resAdv = civ.currentResearch != null ? ADVANCES[civ.currentResearch] : null;
    const cost   = gs.advanceCost(civ);
    const progressY = py + 62;
    ctx.fillStyle = '#606060';
    ctx.fillRect(px + 6, progressY, PW - 12, 32);
    ctx.fillStyle = '#dfdfdf'; ctx.fillRect(px + 6, progressY, PW - 12, 1);
    ctx.fillStyle = '#404040'; ctx.fillRect(px + 6, progressY + 31, PW - 12, 1);
    ctx.font = FONT.SMALL_BOLD; ctx.fillStyle = '#ffffff';
    if (resAdv) {
      ctx.fillText(`Researching: ${resAdv.name}`, px + 12, progressY + 13);
      const pct = Math.min(1, civ.beakers / cost);
      const barW = PW - 80;
      // Progress bar background
      ctx.fillStyle = '#333333';
      ctx.fillRect(px + 12, progressY + 18, barW, 8);
      // Progress bar fill
      ctx.fillStyle = '#44aaff';
      ctx.fillRect(px + 12, progressY + 18, Math.round(barW * pct), 8);
      ctx.font = FONT.TINY; ctx.fillStyle = '#dddddd';
      ctx.textAlign = 'right';
      ctx.fillText(`${civ.beakers}/${cost} \u2697`, px + PW - 14, progressY + 25);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = '#ffaa44';
      ctx.fillText('No research selected  \u2014  Press "Choose Research" below', px + 12, progressY + 20);
    }

    // Advances list (3 columns, known advances sorted by epoch)
    const EPOCH_COLORS = ['#c8a000', '#207820', '#1840a0', '#9a2020'];
    const EPOCH_NAMES  = ['Ancient', 'Renaissance', 'Industrial', 'Modern'];
    const CAT_ABBR     = ['Mil', 'Eco', 'Soc', 'Acad', 'App'];

    const known = [];
    for (const advId of civ.advances) {
      const adv = ADVANCES[advId];
      if (adv) known.push(adv);
    }
    known.sort((a, b) => a.epoch - b.epoch || a.name.localeCompare(b.name));

    const LIST_Y  = progressY + 38;
    const BTN_H   = 30;
    const BTN_Y   = py + PH - 8 - BTN_H;
    const LIST_H  = BTN_Y - LIST_Y - 6;
    const CELL_H  = 20;
    const COLS    = 3;
    const CELL_W  = Math.floor((PW - 12) / COLS);
    const rowsVis = Math.floor(LIST_H / CELL_H);
    const totalRows = Math.ceil(known.length / COLS);

    // Scroll clamp
    if (!this._sciScroll) this._sciScroll = 0;
    this._sciScroll = Math.max(0, Math.min(this._sciScroll, Math.max(0, totalRows - rowsVis)));

    // List background
    ctx.fillStyle = '#7a7a7a';
    ctx.fillRect(px + 6, LIST_Y, PW - 12, LIST_H);
    ctx.fillStyle = '#404040'; ctx.fillRect(px + 6, LIST_Y, PW - 12, 1);
    ctx.fillStyle = '#dfdfdf'; ctx.fillRect(px + 6, LIST_Y + LIST_H - 1, PW - 12, 1);

    // Clip and draw cells
    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 6, LIST_Y, PW - 12, LIST_H);
    ctx.clip();

    const scroll = this._sciScroll;
    for (let row = 0; row < rowsVis; row++) {
      for (let col = 0; col < COLS; col++) {
        const idx = (row + scroll) * COLS + col;
        if (idx >= known.length) break;
        const adv = known[idx];
        const cx  = px + 6 + col * CELL_W;
        const cy  = LIST_Y + row * CELL_H;

        // Alternating row background
        if ((row + scroll) % 2 === 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.fillRect(cx, cy, CELL_W, CELL_H);
        }

         // Advance category icon from ICONS.GIF
         try {
           const srcX = 343 + (adv.cat ?? 0) * 37;
           const srcY = 211 + (adv.epoch ?? 0) * 21;
           const iconSpr = this.sprites.getRegionSprite('icons', srcX, srcY, 36, 20);
           if (iconSpr) ctx.drawImage(iconSpr, cx + 1, cy + 2, 14, 14);
         } catch (e) {
           console.warn('[AdvisorsMixin] Advance icon sprite unavailable:', e.message);
           ctx.fillStyle = EPOCH_COLORS[adv.epoch] ?? '#888888';
           ctx.fillRect(cx + 3, cy + 5, 10, 10);
         }

        // Advance name
        ctx.font = FONT.TINY;
        ctx.fillStyle = '#000000';
        ctx.fillText(adv.name, cx + 16, cy + 14);

        // Category abbreviation (right-aligned within cell)
        ctx.font = FONT.SMALL;
        ctx.fillStyle = '#333333';
        ctx.textAlign = 'right';
        ctx.fillText(CAT_ABBR[adv.cat] ?? '', cx + CELL_W - 3, cy + 14);
        ctx.textAlign = 'left';
      }
    }
    ctx.restore();

    // Scroll indicator
    if (totalRows > rowsVis) {
      ctx.font = FONT.SMALL;
      ctx.textAlign = 'right';
      this._panelText(ctx, `${scroll + 1}\u2013${Math.min(scroll + rowsVis, totalRows)}/${totalRows} rows  \u2195`, px + PW - 8, LIST_Y + LIST_H + 12);
      ctx.textAlign = 'left';
    }

    // Known count
    ctx.font = FONT.TINY;
    this._panelText(ctx, `Advances known: ${known.length}`, px + 8, LIST_Y + LIST_H + 12);

    // Buttons
    this._scienceAdvisorRects = [];
    const btnW = Math.floor((PW - 18) / 2);

    const drawBtn = (label, bx, action) => {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(bx, BTN_Y, btnW, BTN_H);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, BTN_Y, btnW, 1); ctx.fillRect(bx, BTN_Y, 1, BTN_H);
      ctx.fillStyle = '#808080'; ctx.fillRect(bx, BTN_Y + BTN_H - 1, btnW, 1); ctx.fillRect(bx + btnW - 1, BTN_Y, 1, BTN_H);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(bx + 1, BTN_Y + 1, btnW - 2, 1); ctx.fillRect(bx + 1, BTN_Y + 1, 1, BTN_H - 2);
      ctx.fillStyle = '#404040'; ctx.fillRect(bx + 1, BTN_Y + BTN_H - 2, btnW - 2, 1); ctx.fillRect(bx + btnW - 2, BTN_Y + 1, 1, BTN_H - 2);
      ctx.font = FONT.SMALL_BOLD; ctx.fillStyle = '#000000';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + btnW / 2, BTN_Y + BTN_H / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      this._scienceAdvisorRects.push({ x: bx, y: BTN_Y, w: btnW, h: BTN_H, action });
    };

    drawBtn('Choose Research\u2026', px + 6, 'choose');
    drawBtn('Close', px + 6 + btnW + 6, 'close');
  }

  // ─── Domestic Advisor (F1) ──────────────────────────────────────────────────

   MapRenderer.prototype._drawDomesticAdvisor = function(ctx, canvasW, canvasH) {
     this._domesticRects = [];
     const gs     = this.gameState;
     const FA     = "'Tahoma','Arial','Arimo',sans-serif";
     const cities = gs.cities.filter(c => c.civId === 0);

    const PW = Math.min(680, canvasW - 40);
    const ROW_H = 24;
    const HEADER_H = 28;
    const maxRows = Math.floor((Math.min(480, canvasH - 60) - 90 - HEADER_H) / ROW_H);
    const visRows = Math.min(cities.length, maxRows);
    const PH = 90 + HEADER_H + visRows * ROW_H;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Clamp scroll
    this._domesticScroll = Math.max(0, Math.min(this._domesticScroll, Math.max(0, cities.length - maxRows)));

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Domestic Advisor');

    // Column visibility
    const visCols = this._domesticColumns ?? { city: true, size: true, food: true, prod: true, trade: true, building: true, turns: true };
    const allCols = [
      { key: 'city', label: 'City' },
      { key: 'size', label: 'Size' },
      { key: 'food', label: 'Food' },
      { key: 'prod', label: 'Prod' },
      { key: 'trade', label: 'Trade' },
      { key: 'building', label: 'Building' },
      { key: 'turns', label: 'Turns' },
    ];
    const activeCols = allCols.filter(c => visCols[c.key] !== false);

    // Column layout — dynamically spaced based on visible columns
    const colX = [];
    let cx = 10;
    for (const col of activeCols) {
      colX.push(cx);
      cx += col.key === 'city' ? 140 : col.key === 'building' ? 100 : 45;
    }
    const headers = activeCols.map(c => c.label);

    // Column options button (top-right of title bar)
    const optBtnW = 60, optBtnH = 20;
    const optBtnX = px + PW - optBtnW - 6, optBtnY = py + 4;
    this._drawWin95Button(ctx, optBtnX, optBtnY, optBtnW, optBtnH, 'Columns', FA);
    this._domesticRects.push({ x: optBtnX, y: optBtnY, w: optBtnW, h: optBtnH, action: 'columns' });

    // Column options popup (if open)
    if (this._domesticColumnsOpen) {
      const popX = optBtnX - 40, popY = optBtnY + optBtnH + 2;
      const popW = 130, popH = allCols.length * 20 + 8;
      ctx.fillStyle = '#c0c0c0'; ctx.fillRect(popX, popY, popW, popH);
      this._drawBevel5(ctx, popX, popY, popW, popH);
      for (let i = 0; i < allCols.length; i++) {
        const cy = popY + 4 + i * 20;
        const checked = visCols[allCols[i].key] !== false;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(popX + 8, cy + 2, 14, 14);
        ctx.strokeStyle = '#404040'; ctx.strokeRect(popX + 8, cy + 2, 14, 14);
        if (checked) {
          ctx.fillStyle = '#000'; ctx.font = FONT.BODY_BOLD;
          ctx.fillText('\u2713', popX + 10, cy + 14);
        }
        ctx.font = FONT.TINY; ctx.fillStyle = '#000000';
        ctx.fillText(allCols[i].label, popX + 28, cy + 14);
        this._domesticRects.push({ x: popX, y: cy, w: popW, h: 20, action: 'toggleCol', key: allCols[i].key });
      }
    }

    // Header row
    const hy = py + 32;
    ctx.fillStyle = '#606060';
    ctx.fillRect(px + 6, hy, PW - 12, HEADER_H);
    ctx.fillStyle = '#dfdfdf'; ctx.fillRect(px + 6, hy, PW - 12, 1);
    ctx.fillStyle = '#404040'; ctx.fillRect(px + 6, hy + HEADER_H - 1, PW - 12, 1);
    ctx.font = FONT.TINY_BOLD; ctx.fillStyle = CLR.GOLD;
    for (let i = 0; i < headers.length; i++) {
      ctx.fillText(headers[i], px + colX[i], hy + 18);
    }

    // Data rows
    const startY = hy + HEADER_H;
    const scroll = this._domesticScroll;

    for (let vi = 0; vi < visRows; vi++) {
      const ci = vi + scroll;
      if (ci >= cities.length) break;
      const city = cities[ci];
      const ry = startY + vi * ROW_H;

      // Alternating row bg
      ctx.fillStyle = vi % 2 === 0 ? '#8e8e8e' : '#878787';
      ctx.fillRect(px + 6, ry, PW - 12, ROW_H - 1);

      const yields = gs.cityYields(city);
      const foodSurplus = yields.food - city.size * 2;
      const prod = city.production;
      const prodName = prod
        ? (prod.type === 'unit' ? UNITS[prod.id]?.name : IMPROVEMENTS[prod.id]?.name) ?? '—'
        : '—';
      const prodCost = prod ? gs.productionCost(prod) : 0;
      // cityYields() already returns production after unit support and waste.
      const netShields = yields.shields;
      const turnsLeft = prodCost > 0 && yields.shields > 0
        ? Math.ceil(Math.max(0, prodCost - city.shields) / yields.shields)
        : '—';

      ctx.font = FONT.BODY_SMALL;

      // Render each visible column
      for (let ci2 = 0; ci2 < activeCols.length; ci2++) {
        const col = activeCols[ci2];
        const x = px + colX[ci2];
        switch (col.key) {
          case 'city':
            ctx.fillStyle = '#0000cc';
            ctx.fillText(city.name, x, ry + 16);
            this._domesticRects.push({ x, y: ry, w: 135, h: ROW_H, action: 'city', city });
            break;
          case 'size':
            ctx.fillStyle = '#000000';
            ctx.fillText(String(city.size), x, ry + 16);
            break;
          case 'food':
            ctx.fillStyle = foodSurplus >= 0 ? '#006600' : '#cc0000';
            ctx.fillText((foodSurplus >= 0 ? '+' : '') + foodSurplus, x, ry + 16);
            break;
          case 'prod':
            ctx.fillStyle = '#000000';
            ctx.fillText(String(yields.shields), x, ry + 16);
            break;
          case 'trade':
            ctx.fillStyle = '#000000';
            ctx.fillText(String(yields.trade), x, ry + 16);
            break;
          case 'building':
            ctx.fillStyle = '#333333';
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, ry, 95, ROW_H);
            ctx.clip();
            ctx.fillText(prodName, x, ry + 16);
            ctx.restore();
            break;
          case 'turns':
            ctx.fillStyle = '#000000';
            ctx.fillText(String(turnsLeft), x, ry + 16);
            break;
        }
      }
    }

    // Scroll indicator
    if (cities.length > maxRows) {
      ctx.font = FONT.TINY;
      ctx.textAlign = 'right';
      this._panelText(ctx, `\u2195 ${scroll + 1}\u2013${Math.min(scroll + visRows, cities.length)}/${cities.length}`,
        px + PW - 8, startY + visRows * ROW_H + 14);
      ctx.textAlign = 'left';
    }

    // Footer: empire totals
    const footerY = startY + visRows * ROW_H + (cities.length > maxRows ? 20 : 4);
    ctx.fillStyle = '#606060';
    ctx.fillRect(px + 6, footerY, PW - 12, 22);
    ctx.fillStyle = '#dfdfdf'; ctx.fillRect(px + 6, footerY, PW - 12, 1);

    const civ = gs.civs[0];
    let totalGold = 0, totalSci = 0, totalPop = 0;
    for (const c of cities) {
      const y = gs.cityYields(c);
      totalGold += Math.floor(y.trade * (civ?.taxRate ?? 50) / 100);
      totalSci  += Math.floor(y.trade * (civ?.sciRate ?? 50) / 100);
      totalPop  += c.size;
    }
    const treasury = civ?.gold ?? 0;

    ctx.font = FONT.TINY; ctx.fillStyle = CLR.GOLD;
    ctx.fillText(`Pop: ${(totalPop * 10000).toLocaleString()}  |  Gold: +${totalGold}/turn  |  Science: +${totalSci}/turn  |  Treasury: ${treasury}`,
      px + 12, footerY + 15);

    // Close button
    this._drawAdvisorCloseButton(ctx, px, py, PW, PH, this._domesticRects, footerY + 28);
  }

  MapRenderer.prototype._handleScienceAdvisorClick = function(px, py) {
    const hit = this._scienceAdvisorRects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
    if (!hit) return;
    if (hit.action === 'close') { this._scienceAdvisor = false; return; }
    if (hit.action === 'choose') {
      this._scienceAdvisor = false;
      this._researchChooser = true;
      this._researchChooserScroll = 0;
      const civ = this.gameState.civs[0];
      this._researchGoalCandidates = civ?.researchGoal != null
        ? this._researchStepsTowardGoal(civ, civ.researchGoal)
        : null;
      this._researchChooserSelectedId = this._researchGoalCandidates?.[0] ?? null;
    }
  }

  // ─── Trade Advisor (F2) ─────────────────────────────────────────────────────

  MapRenderer.prototype._drawTradeAdvisor = function(ctx, canvasW, canvasH) {
    const gs     = this.gameState;
    const civ    = gs.civs[0];
    const FA     = "'Tahoma','Arial','Arimo',sans-serif";
    const cities = gs.cities.filter(c => c.civId === 0);

    const PW     = Math.min(660, canvasW - 40);
    const ROW_H  = 22;
    const HDR_H  = 70;  // title bar + leader info
    const SUMM_H = 80;  // summary rows at bottom
    const BTN_H  = 30;
    const maxRows = Math.floor((Math.min(480, canvasH - 40) - HDR_H - SUMM_H - BTN_H - 16) / ROW_H);
    const visRows = Math.min(cities.length, maxRows);
    const PH = HDR_H + Math.max(1, visRows) * ROW_H + SUMM_H + BTN_H + 16;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Scroll clamp
    this._tradeAdvisorScroll = Math.max(0, Math.min(this._tradeAdvisorScroll, Math.max(0, cities.length - maxRows)));

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Trade Advisor');

    // Leader info
    const civMeta = CIVS[civ?.id ?? 0] ?? CIVS[0];
    const tGovId  = civ?.government ?? 0;
    const tGovDef = GOVERNMENTS[tGovId];
    const govName = tGovDef?.name ?? 'Despotism';
    const tFem    = civ?.femaleLeader ?? civMeta.defaultFemale ?? false;
    const tCustT  = civMeta.govtTitles?.find(g => g.govt === tGovId);
    const tTitle  = tCustT ? (tFem ? tCustT.female : tCustT.male)
      : (tFem ? tGovDef?.titleFemale : tGovDef?.titleMale) ?? tGovDef?.name ?? '';
    const year    = gs.year;
    const yearStr = year < 0 ? `${-year} B.C.` : `A.D. ${year}`;
    ctx.font = FONT.BODY_SMALL;
    this._panelText(ctx, `${govName} of the ${civMeta.plural}`, px + 10, py + 36);
    this._panelText(ctx, `${tTitle} ${civMeta.leader}: ${yearStr}`, px + 10, py + 50);

    // Column headers
    const COL_NAME  = 10;
    const COL_GOLD  = PW - 240;
    const COL_SCI   = PW - 160;
    const COL_LUX   = PW - 80;
    const hy = py + HDR_H;
    ctx.fillStyle = '#606060';
    ctx.fillRect(px + 6, hy, PW - 12, 20);
    ctx.fillStyle = '#dfdfdf'; ctx.fillRect(px + 6, hy, PW - 12, 1);
    ctx.fillStyle = '#404040'; ctx.fillRect(px + 6, hy + 19, PW - 12, 1);
    ctx.font = FONT.TINY_BOLD; ctx.fillStyle = '#dfbb3f';
    ctx.fillText('City',    px + COL_NAME  + 6, hy + 14);
    ctx.fillText('Gold/t',  px + COL_GOLD  + 6, hy + 14);
    ctx.fillText('Sci/t',   px + COL_SCI   + 6, hy + 14);
    ctx.fillText('Lux/t',   px + COL_LUX   + 6, hy + 14);

    // City rows
    this._tradeAdvisorRects = [];
    const scroll  = this._tradeAdvisorScroll;
    const listY0  = hy + 20;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 6, listY0, PW - 12, visRows * ROW_H);
    ctx.clip();
    let totalGold = 0, totalSci = 0, totalLux = 0;

    for (let i = 0; i < cities.length; i++) {
      const city   = cities[i];
      const yields = gs.cityYields(city);
      const gold   = Math.floor(yields.trade * (civ.taxRate / 100));
      const sci    = Math.floor(yields.trade * (civ.sciRate / 100));
      const lux    = Math.floor(yields.trade * (civ.luxRate / 100));
      totalGold += gold; totalSci += sci; totalLux += lux;
      if (i < scroll || i >= scroll + visRows) continue;
      const ry = listY0 + (i - scroll) * ROW_H;
      ctx.fillStyle = i % 2 === 0 ? '#878787' : '#8e8e8e';
      ctx.fillRect(px + 6, ry, PW - 12, ROW_H);
      ctx.font = FONT.BODY_SMALL; ctx.fillStyle = '#000000';
      ctx.fillText(city.name, px + COL_NAME + 6, ry + 15);
      ctx.textAlign = 'right';
      ctx.fillText(gold, px + COL_GOLD + 48, ry + 15);
      ctx.fillText(sci,  px + COL_SCI  + 48, ry + 15);
      ctx.fillText(lux,  px + COL_LUX  + 48, ry + 15);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    // Summary section
    const summY = listY0 + visRows * ROW_H + 6;
    ctx.fillStyle = '#888888';
    ctx.fillRect(px + 6, summY, PW - 12, SUMM_H - 6);
    ctx.fillStyle = '#dfdfdf'; ctx.fillRect(px + 6, summY, PW - 12, 1);

    const rows = [
      [`Total Income: ${totalGold} gold/turn`, `Total Science: ${totalSci} beakers/turn`],
      [`Total Luxury: ${totalLux} luxury/turn`, `Tax ${civ.taxRate}%  Science ${civ.sciRate}%  Luxury ${civ.luxRate}%`],
    ];
    ctx.font = FONT.BODY_SMALL; ctx.fillStyle = '#000000';
    rows.forEach(([left, right], ri) => {
      const ry = summY + 4 + ri * 18;
      ctx.fillText(left,  px + 12, ry + 13);
      ctx.fillText(right, px + PW / 2, ry + 13);
    });

    // Upkeep total
    let upkeepTotal = 0;
    for (const city of cities) {
      for (const impId of city.improvements) {
        const imp = IMPROVEMENTS[impId];
        if (imp?.upkeep > 0) upkeepTotal += imp.upkeep;
      }
    }
    ctx.font = FONT.SMALL_BOLD; ctx.fillStyle = '#883300';
    ctx.fillText(`Maintenance: ${upkeepTotal} gold/turn   Net: ${totalGold - upkeepTotal} gold/turn`, px + 12, summY + 43);

    // Buttons
    const BTN_Y = py + PH - BTN_H - 6;
    const btnW  = Math.floor((PW - 18) / 2);
    const drawBtn = (label, bx, action) => {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(bx, BTN_Y, btnW, BTN_H);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, BTN_Y, btnW, 1); ctx.fillRect(bx, BTN_Y, 1, BTN_H);
      ctx.fillStyle = '#808080'; ctx.fillRect(bx, BTN_Y + BTN_H - 1, btnW, 1); ctx.fillRect(bx + btnW - 1, BTN_Y, 1, BTN_H);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(bx + 1, BTN_Y + 1, btnW - 2, 1); ctx.fillRect(bx + 1, BTN_Y + 1, 1, BTN_H - 2);
      ctx.fillStyle = '#404040'; ctx.fillRect(bx + 1, BTN_Y + BTN_H - 2, btnW - 2, 1); ctx.fillRect(bx + btnW - 2, BTN_Y + 1, 1, BTN_H - 2);
      ctx.font = FONT.SMALL_BOLD; ctx.fillStyle = '#000000';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + btnW / 2, BTN_Y + BTN_H / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      this._tradeAdvisorRects.push({ x: bx, y: BTN_Y, w: btnW, h: BTN_H, action });
    };
    drawBtn('Supply & Demand', px + 6, 'noop');
    drawBtn('Close', px + 6 + btnW + 6, 'close');
  }

  MapRenderer.prototype._handleTradeAdvisorClick = function(px, py) {
    const hit = this._tradeAdvisorRects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
    if (!hit) return;
    if (hit.action === 'close') this._tradeAdvisor = false;
  }

  MapRenderer.prototype._handleDomesticClick = function(px, py) {
    const hit = this._domesticRects.find(
      r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
    );
    if (!hit) return;
    if (hit.action === 'close') { this._domesticAdvisor = false; this._domesticColumnsOpen = false; return; }
    if (hit.action === 'columns') { this._domesticColumnsOpen = !this._domesticColumnsOpen; return; }
    if (hit.action === 'toggleCol') {
      if (!this._domesticColumns) this._domesticColumns = { city: true, size: true, food: true, prod: true, trade: true, building: true, turns: true };
      // Don't allow hiding the city name column
      if (hit.key !== 'city') this._domesticColumns[hit.key] = !(this._domesticColumns[hit.key] ?? true);
      return;
    }
    if (hit.action === 'city') {
      this._domesticAdvisor = false;
      this._domesticColumnsOpen = false;
      this._cityScreen      = hit.city;
      this._cityScreenTab   = 'units';
      this._cityScreenScroll = 0;
    }
  }

  // ─── Military Advisor (F3) ──────────────────────────────────────────────────

   MapRenderer.prototype._drawMilitaryAdvisor = function(ctx, canvasW, canvasH) {
     const gs     = this.gameState;
     const FA     = "'Tahoma','Arial','Arimo',sans-serif";

     // Group human units by typeId
    const humanUnits = gs.units.filter(u => u.civId === 0);
    const groups = new Map();
    for (const u of humanUnits) {
      groups.set(u.typeId, (groups.get(u.typeId) ?? 0) + 1);
    }
    // Add unit types that are in production (but have 0 live units)
    for (const city of gs.cities.filter(c => c.civId === 0)) {
      if (city.production?.type === 'unit' && city.production.id < UNITS.length) {
        if (!groups.has(city.production.id)) groups.set(city.production.id, 0);
      }
    }
    const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);

    // Gather visible enemy info
    const enemyInfo = [];
    for (const civ of gs.civs) {
      if (civ.id === 0 || !civ.alive) continue;
      const visCount = gs.units.filter(u => u.civId === civ.id &&
        gs._visibility[u.row]?.[u.col] === 2).length;
      if (visCount > 0 || gs.civs[0]?.relations.get(civ.id)) {
        enemyInfo.push({ civ, visCount });
      }
    }

    const ROW_H = 22;
    const PW = Math.min(500, canvasW - 40);
    const forceRows = sorted.length;
    const enemyRows = enemyInfo.length;
    const PH = 90 + forceRows * ROW_H + 40 + enemyRows * ROW_H + 60;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - Math.min(PH, canvasH - 40)) / 2);

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Military Advisor');

    // Section: Your Forces
    let cy = py + 36;
    ctx.font = FONT.SMALL_BOLD; ctx.fillStyle = CLR.GOLD;
    ctx.fillText('Your Forces', px + 10, cy + 14);
    cy += 20;

    // Header — columns: Unit | A/D/M | HP/FP | Active | In Prod
    ctx.fillStyle = '#606060';
    ctx.fillRect(px + 6, cy, PW - 12, 18);
    ctx.font = FONT.TINY_BOLD; ctx.fillStyle = CLR.GOLD;
    ctx.fillText('Unit',     px + 10,  cy + 13);
    ctx.fillText('A/D/M',   px + 170, cy + 13);
    ctx.fillText('HP/FP',   px + 230, cy + 13);
    ctx.fillText('Active',  px + 285, cy + 13);
    ctx.fillText('In Prod', px + 355, cy + 13);
    cy += 18;

    for (let i = 0; i < sorted.length; i++) {
      const [typeId, count] = sorted[i];
      const ud = UNITS[typeId];
      const inProd = gs.cities.filter(c => c.civId === 0 && c.production?.type === 'unit' && c.production.id === typeId).length;
      const ry = cy + i * ROW_H;

      ctx.fillStyle = i % 2 === 0 ? '#8e8e8e' : '#878787';
      ctx.fillRect(px + 6, ry, PW - 12, ROW_H - 1);

      ctx.font = FONT.BODY_SMALL; ctx.fillStyle = '#000000';
      ctx.fillText(ud?.name ?? `Unit ${typeId}`, px + 10, ry + 15);
      ctx.fillText(`${ud?.attack ?? 0}/${ud?.defense ?? 0}/${ud?.move ?? 1}`, px + 170, ry + 15);
      ctx.fillText(`${ud?.hp ?? 1}/${ud?.fp ?? 1}`, px + 230, ry + 15);
      if (count > 0) {
        ctx.fillStyle = '#dfbb3f';
        ctx.fillText(`${count} active`, px + 285, ry + 15);
      }
      if (inProd > 0) {
        ctx.fillStyle = '#3fbbcc';
        ctx.fillText(`${inProd} in prod`, px + 355, ry + 15);
      }
    }

    cy += sorted.length * ROW_H + 10;

    // Section: Known Enemy Forces
    ctx.font = FONT.SMALL_BOLD; ctx.fillStyle = CLR.GOLD;
    ctx.fillText('Known Enemy Forces', px + 10, cy + 14);
    cy += 22;

    for (let i = 0; i < enemyInfo.length; i++) {
      const { civ, visCount } = enemyInfo[i];
      const ry = cy + i * ROW_H;
      const civColor = CIV_COLORS[civ.data.color ?? 1] ?? '#888';

      ctx.fillStyle = i % 2 === 0 ? '#8e8e8e' : '#878787';
      ctx.fillRect(px + 6, ry, PW - 12, ROW_H - 1);

      // Color strip
      ctx.fillStyle = civColor;
      ctx.fillRect(px + 7, ry + 1, 4, ROW_H - 3);

      ctx.font = FONT.BODY_SMALL; ctx.fillStyle = '#000000';
      ctx.fillText(`${civ.data.plural ?? civ.data.adjective}`, px + 16, ry + 15);
      ctx.fillText(`${visCount} visible unit${visCount !== 1 ? 's' : ''}`, px + 200, ry + 15);
    }

    if (enemyInfo.length === 0) {
      ctx.font = FONT.BODY_SMALL; ctx.fillStyle = '#666666';
      ctx.fillText('No enemy forces visible.', px + 16, cy + 14);
      cy += ROW_H;
    } else {
      cy += enemyInfo.length * ROW_H;
    }

    // Footer
    cy += 8;
    ctx.fillStyle = '#606060';
    ctx.fillRect(px + 6, cy, PW - 12, 18);
    ctx.font = FONT.TINY; ctx.fillStyle = CLR.GOLD;
    ctx.fillText(`Total units: ${humanUnits.length}`, px + 12, cy + 13);

    this._militaryRects = [];

    // Close button
    this._drawAdvisorCloseButton(ctx, px, py, PW, PH, this._militaryRects, cy + 24);
  }

  MapRenderer.prototype._handleMilitaryClick = function(px, py) {
    const hit = this._militaryRects.find(
      r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
    );
    if (!hit) return;
    if (hit.action === 'close') this._militaryAdvisor = false;
  }

  // ─── Attitude Advisor (F5) ──────────────────────────────────────────────────

   MapRenderer.prototype._drawAttitudeAdvisor = function(ctx, canvasW, canvasH) {
     const gs     = this.gameState;
     const FA     = "'Tahoma','Arial','Arimo',sans-serif";
     const civ0   = gs.civs[0];
    const cities = gs.cities.filter(c => c.civId === 0);
    const year   = gs.year;
    const eraRow = year < -500 ? 0 : year < 1400 ? 1 : year < 1800 ? 2 : 3;

    // Layout constants
    const PW      = Math.min(700, canvasW - 40);
    const ROW_H   = 30;
    const HEADER_H = 28;
    const ICON_W  = 13;
    const ICON_H  = 15;
    const ICON_GAP = 1;

    // Column positions (relative to panel px)
    const COL_NAME    = 10;
    const COL_SIZE    = 142;
    const COL_ICONS   = 170;
    // Reserve 230px for status+sources at right
    const MAX_ICONS   = Math.min(20, Math.floor((PW - COL_ICONS - 230) / (ICON_W + ICON_GAP)));
    const COL_STATUS  = COL_ICONS + MAX_ICONS * (ICON_W + ICON_GAP) + 8;
    const COL_SOURCES = COL_STATUS + 72;

    const maxRows = Math.floor((Math.min(480, canvasH - 60) - 90 - HEADER_H) / ROW_H);
    const visRows = Math.min(cities.length, maxRows);
    const PH      = 90 + HEADER_H + visRows * ROW_H;
    const px      = Math.round((canvasW - PW) / 2);
    const py      = Math.round((canvasH - PH) / 2);

    // Clamp scroll
    this._attitudeScroll = Math.max(0, Math.min(this._attitudeScroll, Math.max(0, cities.length - maxRows)));

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel with Win95 bevel
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Attitude Advisor');

    // Header row
    const hy = py + 32;
    ctx.fillStyle = '#606060';
    ctx.fillRect(px + 6, hy, PW - 12, HEADER_H);
    ctx.fillStyle = '#dfdfdf'; ctx.fillRect(px + 6, hy, PW - 12, 1);
    ctx.fillStyle = '#404040'; ctx.fillRect(px + 6, hy + HEADER_H - 1, PW - 12, 1);
    ctx.font = FONT.TINY_BOLD; ctx.fillStyle = CLR.GOLD;
    const headers = [
      [COL_NAME,    'City'],
      [COL_SIZE,    'Size'],
      [COL_ICONS,   'Citizens'],
      [COL_STATUS,  'Status'],
      [COL_SOURCES, 'Happiness Sources'],
    ];
    for (const [x, label] of headers) ctx.fillText(label, px + x, hy + 18);

    // Data rows
    this._attitudeRects = [];
    const startY = hy + HEADER_H;
    const scroll = this._attitudeScroll;

    for (let vi = 0; vi < visRows; vi++) {
      const ci = vi + scroll;
      if (ci >= cities.length) break;
      const city = cities[ci];
      const ry   = startY + vi * ROW_H;

      // Alternating row bg
      ctx.fillStyle = vi % 2 === 0 ? '#8e8e8e' : '#878787';
      ctx.fillRect(px + 6, ry, PW - 12, ROW_H - 1);

      const h  = gs.cityHappiness(city);
      const sp = city.specialists ?? { entertainer: 0, taxCollector: 0, scientist: 0 };

      // City name — red if disorder, blue otherwise (clickable)
      ctx.font = FONT.BODY_SMALL;
      ctx.fillStyle = h.disorder ? '#cc0000' : '#0000cc';
      ctx.fillText(city.name, px + COL_NAME, ry + 19);
      this._attitudeRects.push({ x: px + COL_NAME, y: ry, w: COL_SIZE - COL_NAME, h: ROW_H, action: 'city', city });

      // Size
      ctx.fillStyle = '#000000';
      ctx.fillText(String(city.size), px + COL_SIZE, ry + 19);

      // Build citizen type array for face icons
      const citizenTypes = [];
      for (let i = 0; i < h.happy;   i++) citizenTypes.push(0 + (i % 2));      // happy M/F
      for (let i = 0; i < h.content; i++) citizenTypes.push(2 + (i % 2));      // content M/F
      for (let i = 0; i < h.unhappy; i++) citizenTypes.push(4 + (i % 2));      // unhappy M/F
      for (let i = 0; i < (sp.entertainer  ?? 0); i++) citizenTypes.push(6 + (i % 2));
      for (let i = 0; i < (sp.taxCollector ?? 0); i++) citizenTypes.push(8 + (i % 2));
      for (let i = 0; i < (sp.scientist    ?? 0); i++) citizenTypes.push(10);

      const iconY    = ry + Math.round((ROW_H - ICON_H) / 2);
      const numIcons = Math.min(citizenTypes.length, MAX_ICONS);
       for (let i = 0; i < numIcons; i++) {
         const sprCol = citizenTypes[i];
         try {
           const spr = this.sprites.getSprite('people', eraRow, sprCol, true);
           ctx.drawImage(spr, px + COL_ICONS + i * (ICON_W + ICON_GAP), iconY, ICON_W, ICON_H);
         } catch (e) {
           console.warn('[AdvisorsMixin] Citizen icon sprite unavailable:', e.message);
           // Fallback colored rect
           ctx.fillStyle = sprCol < 2 ? '#ffcc00' : sprCol < 4 ? '#aaaaaa' : '#cc3333';
           ctx.fillRect(px + COL_ICONS + i * (ICON_W + ICON_GAP), iconY, ICON_W, ICON_H);
         }
       }
      if (citizenTypes.length > MAX_ICONS) {
        ctx.font = FONT.SMALL; ctx.fillStyle = '#333333';
        ctx.fillText(`+${citizenTypes.length - MAX_ICONS}`,
          px + COL_ICONS + numIcons * (ICON_W + ICON_GAP) + 2, ry + 20);
      }

      // Status badge
      ctx.font = FONT.TINY_BOLD;
      if (h.disorder) {
        ctx.fillStyle = '#cc0000';
        ctx.fillText('DISORDER', px + COL_STATUS, ry + 19);
      } else if (h.happy > 0 && h.happy > h.unhappy) {
        ctx.fillStyle = '#006600';
        ctx.fillText('Happy', px + COL_STATUS, ry + 19);
      } else {
        ctx.fillStyle = '#444444';
        ctx.fillText('Content', px + COL_STATUS, ry + 19);
      }

      // Happiness sources
      const govt   = civ0?.government ?? 0;
      const yields = gs.cityYields(city);
      const sources = [];

      if (city.improvements.has(4)) {
        sources.push(gs._civHasWonder(0, 44) ? 'Temple×2' : 'Temple');
      }
      if (city.improvements.has(11)) sources.push('Cathedral');
      if (city.improvements.has(14)) sources.push('Colosseum');
      if (city.improvements.has(33)) sources.push('Police');
      if (city.improvements.has(52)) sources.push("Shakespeare's");
      if (gs._civHasWonder(0, 49) && !city.improvements.has(11)) sources.push("Michelangelo's");
      if (gs._civHasWonder(0, 54)) sources.push("Bach's");
      if (gs._civHasWonder(0, 66)) sources.push('CfC');

      const luxuries  = Math.floor(yields.trade * (civ0?.luxRate ?? 0) / 100);
      const entLux    = (sp.entertainer ?? 0) * 2;
      const totalLux  = luxuries + entLux;
      if (totalLux > 0) sources.push(`Lux:${totalLux}`);
      if ((sp.entertainer ?? 0) > 0) sources.push(`Ent:${sp.entertainer}`);

      if (govt >= 5) {
        const milU = gs.units.filter(u => u.civId === 0 &&
          (UNITS[u.typeId]?.attack ?? 0) > 0 &&
          (u.col !== city.col || u.row !== city.row)).length;
        const adj = gs._civHasWonder(0, 60) ? Math.floor(milU / 2) : milU;
        if (adj > 0) sources.push(`-Mil:${adj}`);
      }

      if (sources.length > 0) {
        ctx.font = FONT.SMALL; ctx.fillStyle = '#333333';
        ctx.save();
        ctx.beginPath();
        ctx.rect(px + COL_SOURCES, ry, PW - COL_SOURCES - 10, ROW_H);
        ctx.clip();
        ctx.fillText(sources.join(', '), px + COL_SOURCES, ry + 19);
        ctx.restore();
      }
    }

    // Scroll indicator
    if (cities.length > maxRows) {
      ctx.font = FONT.TINY; ctx.fillStyle = '#333333';
      ctx.textAlign = 'right';
      ctx.fillText(
        `\u2195 ${scroll + 1}\u2013${Math.min(scroll + visRows, cities.length)}/${cities.length}`,
        px + PW - 8, startY + visRows * ROW_H + 14
      );
      ctx.textAlign = 'left';
    }

    // Footer: empire happiness summary
    const footerY = startY + visRows * ROW_H + (cities.length > maxRows ? 20 : 4);
    ctx.fillStyle = '#606060';
    ctx.fillRect(px + 6, footerY, PW - 12, 22);
    ctx.fillStyle = '#dfdfdf'; ctx.fillRect(px + 6, footerY, PW - 12, 1);

    let totalHappy = 0, totalContent = 0, totalUnhappy = 0, disorderCount = 0;
    for (const c of cities) {
      const hh = gs.cityHappiness(c);
      totalHappy   += hh.happy;
      totalContent += hh.content;
      totalUnhappy += hh.unhappy;
      if (hh.disorder) disorderCount++;
    }
    const luxRate = civ0?.luxRate ?? 0;

    ctx.font = FONT.TINY; ctx.fillStyle = CLR.GOLD;
    let footSummary = `Happy: ${totalHappy}  Content: ${totalContent}  Unhappy: ${totalUnhappy}  Luxury Rate: ${luxRate}%`;
    if (disorderCount > 0) footSummary += `  \u26A0 ${disorderCount} in DISORDER`;
    ctx.fillText(footSummary, px + 12, footerY + 15);

    // Close button
    this._drawAdvisorCloseButton(ctx, px, py, PW, PH, this._attitudeRects, footerY + 28);
  }

  MapRenderer.prototype._handleAttitudeClick = function(px, py) {
    const hit = this._attitudeRects.find(
      r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
    );
    if (!hit) return;
    if (hit.action === 'close') { this._attitudeAdvisor = false; return; }
    if (hit.action === 'city') {
      this._attitudeAdvisor = false;
      this._cityScreen      = hit.city;
      this._cityScreenTab   = 'units';
      this._cityScreenScroll = 0;
    }
  }

  // ─── Demographics Screen (F6) ──────────────────────────────────────────────

   MapRenderer.prototype._drawDemographicsScreen = function(ctx, canvasW, canvasH) {
     const gs     = this.gameState;

     const demo = this._computeDemographics();
    const ROW_H = 30;
    const PW = Math.min(460, canvasW - 40);
    const hasPower = (gs._powerHistory ?? []).length >= 2;
    const GRAPH_H = hasPower ? 120 : 0;
    const PH = 80 + demo.length * ROW_H + 80 + GRAPH_H;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Demographics');

    // Header row
    const hy = py + 34;
    ctx.fillStyle = '#606060';
    ctx.fillRect(px + 6, hy, PW - 12, 22);
    ctx.font = FONT.TINY_BOLD; ctx.fillStyle = CLR.GOLD;
    ctx.fillText('Category', px + 12, hy + 15);
    ctx.fillText('Your Value', px + 170, hy + 15);
    ctx.textAlign = 'right';
    ctx.fillText('Rank', px + PW - 12, hy + 15);
    ctx.textAlign = 'left';

    // Data rows
    const startY = hy + 24;
    const BAR_X = 170;   // bar graph starts after label
    const BAR_W = 120;   // max bar width
    const BAR_H = 8;     // bar height
    for (let i = 0; i < demo.length; i++) {
      const { name, value, rank, total, maxValue, isLowerBetter } = demo[i];
      const ry = startY + i * ROW_H;

      ctx.fillStyle = i % 2 === 0 ? '#8e8e8e' : '#878787';
      ctx.fillRect(px + 6, ry, PW - 12, ROW_H - 1);

      ctx.font = FONT.BODY_SMALL; ctx.fillStyle = '#000000';
      ctx.fillText(name, px + 12, ry + 15);

      // Bar graph
      const barFrac = maxValue > 0 ? value / maxValue : 0;
      const barW = Math.round(barFrac * BAR_W);
      const barY = ry + 4;
      ctx.fillStyle = '#555555';
      ctx.fillRect(px + BAR_X, barY, BAR_W, BAR_H);
      const barColor = rank === 1 ? '#2a8a2a' : rank <= Math.ceil(total / 2) ? '#c8a832' : '#aa3333';
      ctx.fillStyle = barColor;
      ctx.fillRect(px + BAR_X, barY, barW, BAR_H);

      // Value text (right of bar)
      ctx.font = FONT.TINY; ctx.fillStyle = '#222222';
      ctx.fillText(typeof value === 'number' ? value.toLocaleString() : String(value), px + BAR_X + BAR_W + 6, ry + 12);

      // Rank
      const ordinal = this._ordinal(rank);
      ctx.textAlign = 'right';
      ctx.fillStyle = rank === 1 ? '#006600' : '#333333';
      ctx.font = FONT.BODY_SMALL;
      ctx.fillText(`${ordinal} of ${total}`, px + PW - 12, ry + 19);
      ctx.textAlign = 'left';
    }

    // Best/worst summary
    const summaryY = startY + demo.length * ROW_H + 4;
    const bestCats = demo.filter(d => d.rank === 1).map(d => d.name);
    const worstCats = demo.filter(d => d.rank === d.total && d.total > 1).map(d => d.name);
    ctx.font = FONT.TINY_BOLD;
    if (bestCats.length > 0) {
      ctx.fillStyle = '#006600';
      ctx.fillText(`Best in: ${bestCats.join(', ')}`, px + 12, summaryY + 12);
    }
    if (worstCats.length > 0) {
      ctx.fillStyle = '#880000';
      ctx.fillText(`Worst in: ${worstCats.join(', ')}`, px + 12, summaryY + (bestCats.length > 0 ? 26 : 12));
    }
    const summaryH = (bestCats.length > 0 ? 14 : 0) + (worstCats.length > 0 ? 14 : 0) + 8;

    // ── Power Graph ──────────────────────────────────────────────────────────
    let graphEndY = summaryY + summaryH;
    if (hasPower) {
      const history = gs._powerHistory;
      const GX = px + 40, GY = summaryY + summaryH + 4;
      const GW = PW - 52, GH = GRAPH_H - 24;

      // Graph background
      ctx.fillStyle = '#555555';
      ctx.fillRect(GX, GY, GW, GH);
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 4; i++) {
        const gy = GY + (GH / 4) * i;
        ctx.beginPath(); ctx.moveTo(GX, gy); ctx.lineTo(GX + GW, gy); ctx.stroke();
      }

      // Title
      ctx.font = FONT.SMALL_BOLD; ctx.fillStyle = CLR.GOLD;
      ctx.textAlign = 'center';
      ctx.fillText('Power Graph', px + PW / 2, GY - 2);
      ctx.textAlign = 'left';

      // Find max power across all history
      let maxP = 1;
      for (const snap of history) {
        for (const v of Object.values(snap.ratings)) { if (v > maxP) maxP = v; }
      }

      // Draw line per civ
      for (const civ of gs.civs) {
        if (!civ.alive && !history.some(s => (s.ratings[civ.id] ?? 0) > 0)) continue;
        const color = CIV_COLORS[civ.data?.color ?? 0];
        ctx.strokeStyle = color;
        ctx.lineWidth = civ.id === 0 ? 2 : 1;
        ctx.beginPath();
        let started = false;
        for (let j = 0; j < history.length; j++) {
          const x = GX + (j / Math.max(1, history.length - 1)) * GW;
          const y = GY + GH - ((history[j].ratings[civ.id] ?? 0) / maxP) * GH;
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1;

      const LEGEND_X = GX + GW + 8;
      const LEGEND_Y = GY + 4;
      let ly = LEGEND_Y;
      for (const civ of gs.civs) {
        if (!civ.alive) continue;
        const color = CIV_COLORS[civ.data?.color ?? 0];
        ctx.fillStyle = color;
        ctx.fillRect(LEGEND_X, ly, 8, 8);
        ctx.fillStyle = '#cccccc';
        ctx.font = FONT.TINY;
        ctx.fillText((civ.data?.adjective ?? `Civ${civ.id}`).slice(0, 8), LEGEND_X + 12, ly + 7);
        ly += 12;
      }

      // Axis labels
      ctx.font = FONT.TINY; ctx.fillStyle = '#aaaaaa';
      ctx.textAlign = 'center';
      const firstTurn = history[0]?.turn ?? 0;
      const lastTurn = history[history.length - 1]?.turn ?? 0;
      ctx.fillText(String(firstTurn), GX, GY + GH + 10);
      ctx.fillText(String(lastTurn), GX + GW, GY + GH + 10);
      ctx.textAlign = 'left';

      graphEndY = GY + GH + 14;
    }

    // Close button
    this._demoCloseRect = this._drawAdvisorCloseButton(ctx, px, py, PW, PH, null, graphEndY + 2);
  }

  MapRenderer.prototype._computeDemographics = function() {
    const gs = this.gameState;
    const aliveCivs = gs.civs.filter(c => c.alive);

    const categories = [
      { name: 'Population',  fn: (civ) => gs.cities.filter(c => c.civId === civ.id).reduce((s, c) => s + c.size, 0) * 10000 },
      { name: 'Land Area',   fn: (civ) => {
        const tiles = new Set();
        for (const c of gs.cities.filter(ct => ct.civId === civ.id)) {
          // Count tiles within city radius
          const { bfc } = gs.cityWorkedTileSet(c);
          for (const t of bfc) tiles.add(`${t.row},${t.col}`);
        }
        return tiles.size;
      }},
      { name: 'Literacy',    fn: (civ) => civ.advances.size },
      { name: 'GNP',         fn: (civ) => gs.cities.filter(c => c.civId === civ.id).reduce((s, c) => s + gs.cityYields(c).trade, 0) },
      { name: 'Mfg. Goods',  fn: (civ) => gs.cities.filter(c => c.civId === civ.id).reduce((s, c) => s + gs.cityYields(c).shields, 0) },
      { name: 'Military',    fn: (civ) => gs.units.filter(u => u.civId === civ.id).length },
      { name: 'Pollution',   fn: (civ) => {
        let count = 0;
        const civCities = gs.cities.filter(c => c.civId === civ.id);
        const seen = new Set();
        for (const c of civCities) {
          const { bfc } = gs.cityWorkedTileSet(c);
          for (const t of bfc) {
            const key = `${t.row},${t.col}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (gs._tileImprovements[t.row]?.[t.col]?.pollution) count++;
          }
        }
        return count;
      }},
      { name: 'Disease',     fn: (civ) => gs.cities.filter(c => c.civId === civ.id).reduce((s, c) => s + gs.cityHappiness(c).unhappy, 0) },
    ];

    return categories.map(cat => {
      const values = aliveCivs.map(civ => ({ civId: civ.id, value: cat.fn(civ) }));
      const humanVal = values.find(v => v.civId === 0)?.value ?? 0;
      const maxVal = Math.max(...values.map(v => v.value), 1);
      // Sort descending — but for Pollution and Disease, lower is better
      const isLowerBetter = cat.name === 'Pollution' || cat.name === 'Disease';
      const sorted = [...values].sort((a, b) => isLowerBetter ? a.value - b.value : b.value - a.value);
      const rank = sorted.findIndex(v => v.civId === 0) + 1;
      return { name: cat.name, value: humanVal, rank, total: aliveCivs.length, maxValue: maxVal, isLowerBetter };
    });
  }

  MapRenderer.prototype._ordinal = function(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  MapRenderer.prototype._handleDemographicsClick = function(px, py) {
    const r = this._demoCloseRect;
    if (r && px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
      this._demographicsScreen = false;
    }
  }

  // ─── Top 5 Cities ───────────────────────────────────────────────────────────

  MapRenderer.prototype._drawTop5Cities = function(ctx, canvasW, canvasH) {
    const gs = this.gameState;
    const allCities = [...gs.cities]
      .sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))
      .slice(0, 5);

    // Tiles.dll resource 58 is the original 600x400 Egyptian mural used by
    // this report. MGE keeps the report at that fixed presentation size.
    const PW = Math.min(600, canvasW - 40);
    const PH = Math.min(400, canvasH - 40);
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'TOP FIVE CITIES');

    const contentX = px + 5, contentY = py + 23;
    const contentW = PW - 10, contentH = PH - 61;
    const top5Back = this._introImages?.top5Back;
    if (top5Back?.complete && top5Back.naturalWidth) {
      ctx.drawImage(top5Back, 0, 0, 600, 400, contentX, contentY, contentW, contentH);
    } else {
      ctx.fillStyle = '#636363';
      ctx.fillRect(contentX, contentY, contentW, contentH);
    }
    ctx.fillStyle = 'rgba(18,18,18,0.44)';
    ctx.fillRect(contentX, contentY, contentW, contentH);

    const rowX = px + 14;
    const rowW = PW - 28;
    const startY = py + 37;
    const rowH = Math.min(56, Math.floor((PH - 80) / 5));
    this._top5RenderState = { x: px, y: py, width: PW, height: PH, backdropReady: !!top5Back?.naturalWidth };
    for (let i = 0; i < allCities.length; i++) {
      const city = allCities[i];
      const civ  = gs.civs[city.civId];
      const civColor = CIV_COLORS[civ?.data?.color ?? 1] ?? '#888';
      const civName  = civ?.data?.plural ?? `Civ ${city.civId}`;
      const ry = startY + i * rowH;

      ctx.fillStyle = i % 2 === 0 ? 'rgba(205,205,205,0.76)' : 'rgba(176,176,176,0.76)';
      ctx.fillRect(rowX, ry, rowW, rowH - 3);
      ctx.fillStyle = civColor;
      ctx.fillRect(rowX, ry, 6, rowH - 3);

      try {
        const info = this._getCitySpriteInfo(city);
        const sprite = this.sprites.getSprite(info.sheet, info.styleRow, info.sizeCol);
        ctx.drawImage(sprite, rowX + 13, ry + 1, 64, 48);
      } catch (_) { /* text remains usable while sprites are still loading */ }

      ctx.fillStyle = '#151515';
      ctx.textAlign = 'left';
      ctx.font = city.civId === 0 ? FONT.BODY_TIMES_BOLD : FONT.BODY_TIMES;
      ctx.fillText(`${i + 1}. ${city.name}`, rowX + 84, ry + 20);
      ctx.font = FONT.BODY_SMALL;
      ctx.fillText(`${civName}`, rowX + 84, ry + 40);
      ctx.textAlign = 'right';
      ctx.font = FONT.BODY_TIMES_BOLD;
      ctx.fillText(`${city.size}`, rowX + rowW - 15, ry + 29);
      ctx.textAlign = 'left';
    }

    if (allCities.length === 0) {
      ctx.font = FONT.BODY_TIMES_BOLD;
      ctx.fillStyle = '#efefef';
      ctx.textAlign = 'center';
      ctx.fillText('No cities have been founded.', px + PW / 2, py + PH / 2);
      ctx.textAlign = 'left';
    }

    this._top5CloseRect = this._drawAdvisorCloseButton(ctx, px, py, PW, PH, null);
  }

  MapRenderer.prototype._handleTop5Click = function(px, py) {
    const r = this._top5CloseRect;
    if (r && px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
      this._top5Cities = false;
    }
  }

  // ─── Hall of Fame ───────────────────────────────────────────────────────────

   MapRenderer._getHallOfFame = function() {
     try {
       return JSON.parse(localStorage.getItem('civ2_hof') || '[]');
     } catch (e) {
       console.warn('[AdvisorsMixin] Failed to load Hall of Fame:', e.message);
       return [];
     }
   }

  MapRenderer._saveToHallOfFame = function(entry) {
    const hof = MapRenderer._getHallOfFame();
    hof.push(entry);
    hof.sort((a, b) => b.score - a.score);
    if (hof.length > 10) hof.length = 10;
    localStorage.setItem('civ2_hof', JSON.stringify(hof));
  }

  MapRenderer.prototype._drawHallOfFame = function(ctx, canvasW, canvasH) {
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    const FT = "'Times New Roman','Tinos',Times,serif";
    const entries = MapRenderer._getHallOfFame();

    // Tiles.dll resource 57 supplies a 600×400 Hall of Fame scene.  MGE keeps
    // that presentation at a fixed size even when the score table is empty.
    const PW = Math.min(600, canvasW - 40);
    const PH = Math.min(400, canvasH - 40);
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel
    this._drawWin95Panel(ctx, px, py, PW, PH, 'Hall of Fame');

    // Original MGE fireworks/city photograph from Tiles.dll resource 57.
    // Keep the Win95 frame and a translucent wash so the table remains legible.
    const hallBack = this._introImages?.hallOfFameBack;
    const contentX = px + 5, contentY = py + 23;
    const contentW = PW - 10, contentH = PH - 61;
    if (hallBack?.complete && hallBack.naturalWidth) {
      ctx.drawImage(hallBack, 0, 0, 600, 400, contentX, contentY, contentW, contentH);
      ctx.fillStyle = 'rgba(223,223,223,0.58)';
      ctx.fillRect(contentX, contentY, contentW, contentH);
    }

    const startY = py + 32;

    // Column headers
    ctx.font = FONT.SMALL_BOLD;
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'left';
    ctx.fillText('Rank', px + 10, startY + 14);
    ctx.fillText('Name', px + 50, startY + 14);
    ctx.fillText('Civilization', px + 180, startY + 14);
    ctx.textAlign = 'right';
    ctx.fillText('Score', px + PW - 14, startY + 14);
    ctx.textAlign = 'left';

    // Divider
    ctx.fillStyle = '#696969';
    ctx.fillRect(px + 8, startY + 20, PW - 16, 1);
    ctx.fillStyle = '#E3E3E3';
    ctx.fillRect(px + 8, startY + 21, PW - 16, 1);

    if (entries.length === 0) {
      ctx.font = FONT.BODY_TIMES;
      ctx.fillStyle = '#666666';
      ctx.textAlign = 'center';
      ctx.fillText('No entries yet. Complete a game to be added!', px + PW / 2, startY + 50);
      ctx.textAlign = 'left';
    } else {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const ry = startY + 24 + i * 28;

        ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.1)';
        ctx.fillRect(px + 6, ry, PW - 12, 26);

        ctx.font = FONT.BODY;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}.`, px + 14, ry + 18);
        ctx.fillText(e.leader || 'Unknown', px + 50, ry + 18);
        ctx.fillText(e.civ || 'Unknown', px + 180, ry + 18);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#333333';
        ctx.fillText(String(e.score ?? 0), px + PW - 14, ry + 18);
        ctx.textAlign = 'left';
      }
    }

    // Close button
    this._hofCloseRect = this._drawAdvisorCloseButton(ctx, px, py, PW, PH, null);
  }

  MapRenderer.prototype._handleHallOfFameClick = function(px, py) {
    const r = this._hofCloseRect;
    if (r && px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
      this._hallOfFame = false;
    }
  }

  // ─── Retirement Flow (POWERgraph → Score → HoF) ──────────────────────────
  // Matches original Civ2 MGE retirement sequence from screenshots

  MapRenderer.prototype._drawRetireFlow = function(ctx, canvasW, canvasH) {
    const stage = this._retireStage;
    if (!stage) return;

    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    const FT = "'Times New Roman','Tinos',Times,serif";
    this._retireRects = [];

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    if (stage === 'confirm') {
      // "Do you really want to retire?" dialog with radio buttons
      const PW = 340, PH = 140;
      const px = Math.round((canvasW - PW) / 2);
      const py = Math.round((canvasH - PH) / 2);
      this._drawCiv2Panel(ctx, px, py, PW, PH, 'Confirmation');

      ctx.font = FONT.BODY;
      this._panelText(ctx, 'Do you really want to retire?', px + 14, py + 48);

      // Radio options: Yes, No
      const opts = ['Yes', 'No'];
      const selected = this._retireConfirmChoice ?? 1;
      for (let i = 0; i < opts.length; i++) {
        const oy = py + 60 + i * 24;
        this._drawCiv2RadioBtn(ctx, px + 20, oy, i === selected);
        ctx.font = FONT.BODY;
        this._panelText(ctx, opts[i], px + 42, oy + 13);
        this._retireRects.push({ x: px + 14, y: oy, w: PW - 28, h: 22, action: 'select', idx: i });
      }

      // OK button
      const btnW = 80, btnH = 24;
      const bx = px + PW / 2 - btnW / 2, by = py + PH - 36;
      this._drawWin95Button(ctx, bx, by, btnW, btnH, 'OK', FA);
      this._retireRects.push({ x: bx, y: by, w: btnW, h: btnH, action: 'confirmOk' });

    } else if (stage === 'powergraph') {
      // Civilization POWERgraph
      const PW = Math.min(480, canvasW - 40);
      const PH = Math.min(360, canvasH - 40);
      const px = Math.round((canvasW - PW) / 2);
      const py = Math.round((canvasH - PH) / 2);
      this._drawCiv2Panel(ctx, px, py, PW, PH, 'Civilization POWERgraph');

      const gs = this.gameState;
      const COLORS = ['#ff0000', '#ffffff', '#00cc00', '#0066ff', '#ffff00', '#00ffff', '#ff8800', '#ff00ff'];

      // Chart area
      const chartX = px + 50, chartY = py + 36;
      const chartW = PW - 100, chartH = PH - 90;
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(chartX, chartY, chartW, chartH);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
      ctx.strokeRect(chartX + 0.5, chartY + 0.5, chartW - 1, chartH - 1);

      // Draw power lines for each civ (simple chart based on city count / unit count)
      const maxTurn = Math.max(1, gs.turn);
      for (let civId = 0; civId < Math.min(gs.civs.length, 8); civId++) {
        const civ = gs.civs[civId];
        if (!civ || civ.destroyed) continue;
        ctx.strokeStyle = COLORS[civId] || '#888';
        ctx.lineWidth = civId === 0 ? 2 : 1;
        ctx.beginPath();
        // Simple power metric: cities * 10 + units * 2
        const power = (gs.cities.filter(c => c.civId === civId).length * 10) +
                      (gs.units.filter(u => u.civId === civId).length * 2);
        const maxPower = 100;
        const lineY = chartY + chartH - Math.min(power / maxPower, 1) * chartH;
        const lineX = chartX + chartW * 0.9;
        ctx.moveTo(chartX + 2, chartY + chartH - 5);
        ctx.lineTo(lineX, lineY);
        ctx.stroke();
      }

      // Legend
      ctx.font = FONT.TINY;
      for (let civId = 0; civId < Math.min(gs.civs.length, 8); civId++) {
        const civ = gs.civs[civId];
        if (!civ || civ.destroyed) continue;
        const ly = py + 38 + civId * 14;
        ctx.fillStyle = COLORS[civId] || '#888';
        ctx.fillRect(px + 8, ly, 10, 10);
        ctx.fillText(civ.adjective || `Civ ${civId}`, px + 22, ly + 9);
      }

      // OK button
      const btnW = 80, btnH = 24;
      const bx = px + PW / 2 - btnW / 2;
      const by = py + PH - 36;
      this._drawWin95Button(ctx, bx, by, btnW, btnH, 'OK', FA);
      this._retireRects.push({ x: bx, y: by, w: btnW, h: btnH, action: 'nextStage' });

    } else if (stage === 'score') {
      // CIVILIZATION SCORE — original MGE composition: citizen mosaic,
      // owned-Wonder icons and achievement breakdown over Tiles.dll art.
      const gs = this.gameState;
      const civ = gs.civs[0];
      const civMeta = CIVS[civ?.id ?? 0] ?? CIVS[0];
      const score = gs.scoreBreakdown(0);
      const wonderRows = Math.ceil(score.wonderIds.length / 3);
      const PW = Math.min(620, canvasW - 32);
      const PH = Math.min(Math.max(360, 340 + wonderRows * 20), canvasH - 32);
      const px = Math.round((canvasW - PW) / 2);
      const py = Math.round((canvasH - PH) / 2);
      this._drawCiv2Panel(ctx, px, py, PW, PH, 'CIVILIZATION SCORE');

      const innerX = px + 6, innerY = py + 24, innerW = PW - 12, innerH = PH - 60;
      ctx.save();
      ctx.beginPath(); ctx.rect(innerX, innerY, innerW, innerH); ctx.clip();
      const scoreBack = this._introImages?.scoreBack;
      if (scoreBack?.complete && scoreBack.naturalWidth) {
        ctx.drawImage(scoreBack, 0, 0, 600, 400, innerX, innerY, innerW, innerH);
      } else {
        ctx.fillStyle = '#4b4b4b'; ctx.fillRect(innerX, innerY, innerW, innerH);
      }
      ctx.fillStyle = 'rgba(20,20,20,0.42)';
      ctx.fillRect(innerX, innerY, innerW, innerH);
      ctx.restore();

      const isFemale = civ?.femaleLeader ?? civMeta.defaultFemale ?? false;
      const gov = GOVERNMENTS[civ?.government ?? 1] ?? GOVERNMENTS[1];
      const customTitle = civMeta.govtTitles?.find(t => t.govt === (civ?.government ?? 1));
      const leaderTitle = customTitle
        ? (isFemale ? customTitle.female : customTitle.male)
        : (isFemale ? gov?.titleFemale : gov?.titleMale) ?? gov?.name ?? '';
      const leaderName = civ?.leaderNameOverride ?? (isFemale ? civMeta.female : civMeta.leader);
      const year = gs.year ?? -4000;
      const yearText = year < 0 ? `${-year} B.C.` : `A.D. ${year}`;

      const shadowText = (text, x, y, color = '#f2f2f2') => {
        ctx.fillStyle = '#202020'; ctx.fillText(text, x + 1, y + 1);
        ctx.fillStyle = color; ctx.fillText(text, x, y);
      };

      ctx.textAlign = 'center';
      ctx.font = FONT.BODY_TIMES_BOLD;
      shadowText(`${leaderTitle} ${leaderName} of the ${civMeta.plural}, ${yearText}`, px + PW / 2, py + 43);
      ctx.textAlign = 'left';

      // Citizen-score mosaic. MGE overlaps the PEOPLE.GIF faces tightly so a
      // large empire reads as a crowd instead of a row of oversized portraits.
      const faceLeft = px + 15, faceTop = py + 51;
      const faceRight = px + PW - 15, faceBottom = py + 172;
      const faceW = 20, faceH = 22, stepX = 16, stepY = 15;
      const facesPerRow = Math.max(1, Math.floor((faceRight - faceLeft - faceW) / stepX) + 1);
      const faceRows = Math.max(1, Math.floor((faceBottom - faceTop - faceH) / stepY) + 1);
      const faceCount = Math.min(score.citizens, facesPerRow * faceRows);
      const eraRow = this._getCivEpoch(0);
      for (let i = 0; i < faceCount; i++) {
        const row = Math.floor(i / facesPerRow);
        const col = i % facesPerRow;
        try {
          const face = this.sprites.getSprite('people', eraRow, i % 6, true);
          ctx.drawImage(face, faceLeft + col * stepX, faceTop + row * stepY, faceW, faceH);
        } catch (_) {
          ctx.fillStyle = '#b7b7b7';
          ctx.fillRect(faceLeft + col * stepX, faceTop + row * stepY, faceW - 2, faceH - 2);
        }
      }

      ctx.font = FONT.BODY_TIMES_BOLD;
      shadowText(`${civMeta.adjective} Citizens (${score.citizens})`, px + 13, py + 188);

      const wonderTop = py + 197;
      const colW = Math.floor((PW - 24) / 3);
      for (let i = 0; i < score.wonderIds.length; i++) {
        const id = score.wonderIds[i];
        const wonder = IMPROVEMENTS[id];
        const col = i % 3, row = Math.floor(i / 3);
        const wx = px + 12 + col * colW;
        const wy = wonderTop + row * 20;
        try {
          const index = id - 39;
          const icon = this.sprites.getRegionSprite('icons', 343 + (index % 7) * 37,
            106 + Math.floor(index / 7) * 21, 36, 20);
          ctx.drawImage(icon, wx, wy, 31, 17);
        } catch (_) { /* name remains usable when a sprite cannot be loaded */ }
        ctx.font = FONT.BODY_TIMES;
        shadowText(wonder?.name ?? `Wonder ${id}`, wx + 35, wy + 14, '#4fd5df');
      }

      const achievementsY = wonderTop + Math.max(1, wonderRows) * 20 + 18;
      ctx.font = FONT.BODY_TIMES_BOLD;
      shadowText(`${civMeta.adjective} Achievements (${score.achievements})`, px + 13, achievementsY);
      const achievementItems = [
        ['Spaceship', score.spaceship], ['Pollution', score.pollution], ['Peace', score.peace],
        ['Future Technology', score.futureTechnology], ['Barbarians', score.barbarians],
      ];
      ctx.font = FONT.BODY_TIMES;
      let ax = px + 13, ay = achievementsY + 18;
      for (const [label, value] of achievementItems) {
        const token = `${label}: (${value >= 0 ? '+' : ''}${value})`;
        const width = ctx.measureText(token).width + 24;
        if (ax + width > px + PW - 12) { ax = px + 13; ay += 18; }
        shadowText(token, ax, ay);
        ax += width;
      }
      ctx.font = FONT.BODY_TIMES_BOLD;
      shadowText(`Total Score: ${gs.gameOver?.score ?? score.total}`, px + 13, ay + 19);

      const btnX = px + 12, btnY = py + PH - 32, btnW = PW - 24, btnH = 22;
      this._drawWin95Button(ctx, btnX, btnY, btnW, btnH, 'Close', FT);
      this._retireRects.push({ x: btnX, y: btnY, w: btnW, h: btnH, action: 'nextStage' });

    } else if (stage === 'halloffame') {
      // Redirect to Hall of Fame + draw fireworks background (dark city night scene)
      const entries = MapRenderer._getHallOfFame();

      const PW = Math.min(600, canvasW - 40);
      const PH = Math.min(400, canvasH - 40);
      const px = Math.round((canvasW - PW) / 2);
      const py = Math.round((canvasH - PH) / 2);

      this._drawCiv2Panel(ctx, px, py, PW, PH, 'CIVILIZATION II HALL OF FAME');

      // Original MGE fireworks/city photograph from Tiles.dll resource 57.
      // It belongs inside the framed content area rather than underneath the
      // opaque Civ2 panel wallpaper.
      const hallBack = this._introImages?.hallOfFameBack;
      const contentX = px + 5, contentY = py + 23;
      const contentW = PW - 10, contentH = PH - 64;
      if (hallBack?.complete && hallBack.naturalWidth) {
        ctx.drawImage(hallBack, 0, 0, 600, 400, contentX, contentY, contentW, contentH);
        ctx.fillStyle = 'rgba(35,35,48,0.38)';
        ctx.fillRect(contentX, contentY, contentW, contentH);
      }

      const startY = py + 34;
      // Column headers
      ctx.font = FONT.TINY_BOLD;
      ctx.textAlign = 'left';
      this._panelText(ctx, '#', px + 10, startY + 12);
      this._panelText(ctx, 'Leader', px + 30, startY + 12);
      this._panelText(ctx, 'Civilization', px + 150, startY + 12);
      this._panelText(ctx, 'Difficulty', px + 280, startY + 12);
      ctx.textAlign = 'right';
      this._panelText(ctx, 'Score', px + PW - 14, startY + 12);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#696969'; ctx.fillRect(px + 8, startY + 17, PW - 16, 1);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(px + 8, startY + 18, PW - 16, 1);

      if (entries.length === 0) {
        ctx.font = FONT.BODY_TIMES;
        ctx.textAlign = 'center';
        this._panelText(ctx, 'No entries yet.', px + PW / 2, startY + 44);
        ctx.textAlign = 'left';
      } else {
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          const ry = startY + 22 + i * 26;
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,200,0.08)' : 'rgba(0,0,0,0.08)';
          ctx.fillRect(px + 6, ry, PW - 12, 24);
          ctx.font = FONT.BODY_SMALL;
          ctx.fillStyle = '#dfbb3f';
          ctx.textAlign = 'left';
          ctx.fillText(`${i + 1}.`, px + 10, ry + 17);
          this._panelText(ctx, e.leader || 'Unknown', px + 30, ry + 17);
          this._panelText(ctx, e.civ || 'Unknown', px + 150, ry + 17);
          this._panelText(ctx, e.difficulty || 'Chieftain', px + 280, ry + 17);
          ctx.textAlign = 'right';
          this._panelText(ctx, String(e.score ?? 0), px + PW - 14, ry + 17);
          ctx.textAlign = 'left';
        }
      }

      // Footer buttons: Clear, Demographics, Close
      const btnW2 = Math.floor((PW - 40) / 3);
      const btnH2 = 24;
      const btnY2 = py + PH - 36;
      const labels = ['Clear', 'Demographics', 'Close'];
      for (let b = 0; b < 3; b++) {
        const bx = px + 10 + b * (btnW2 + 5);
        this._drawWin95Button(ctx, bx, btnY2, btnW2, btnH2, labels[b], FA);
        this._retireRects.push({ x: bx, y: btnY2, w: btnW2, h: btnH2, action: labels[b].toLowerCase() });
      }
    }
  }

  MapRenderer.prototype._handleRetireFlowClick = function(px, py) {
    const hit = this._retireRects?.find(
      r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
    );
    if (!hit) return;

    const stage = this._retireStage;

    if (stage === 'confirm') {
      if (hit.action === 'select') {
        this._retireConfirmChoice = hit.idx;
      } else if (hit.action === 'confirmOk') {
        if ((this._retireConfirmChoice ?? 1) === 0) {
          // Yes — proceed to POWERgraph
          this._retireScoreOnly = false;
          // Calculate and store score
          const gs = this.gameState;
          if (!gs.gameOver) {
            const score = gs.score();
            gs.gameOver = { result: 'retire', score };
            MapRenderer._saveToHallOfFame({
              leader: gs.civs[0]?.leaderNameOverride ?? gs.civs[0]?.data?.leader ?? 'Unknown',
              civ: gs.civs[0]?.data?.plural ?? 'Unknown',
              score,
              difficulty: ['Chieftain','Warlord','Prince','King','Emperor','Deity'][gs.difficulty ?? 0] ?? 'Chieftain',
              year: gs.year,
              turn: gs.turn,
            });
          }
          this._retireStage = 'powergraph';
          this._retireRects = [];
        } else {
          // No — cancel
          this._retireStage = null;
        }
        this._play(SFX.menuOk);
      }
    } else if (stage === 'powergraph' && hit.action === 'nextStage') {
      this._retireStage = 'score';
      this._retireRects = [];
      this._play(SFX.menuOk);
    } else if (stage === 'score' && hit.action === 'nextStage') {
      this._retireStage = this._retireScoreOnly ? null : 'halloffame';
      this._retireScoreOnly = false;
      this._retireRects = [];
      this._play(SFX.menuOk);
    } else if (stage === 'halloffame') {
      if (hit.action === 'close') {
        this._retireStage = null;
        this._retireScoreOnly = false;
        this._play(SFX.menuOk);
      } else if (hit.action === 'clear') {
        localStorage.removeItem('civ2_hof');
        this._play(SFX.menuOk);
      } else if (hit.action === 'demographics') {
        this._demographicsScreen = true;
        this._play(SFX.menuOk);
      }
    }
  }

  // ─── Wonders of the World ──────────────────────────────────────────────────

   MapRenderer.prototype._drawWondersList = function(ctx, canvasW, canvasH) {
     const gs     = this.gameState;
     const FA     = "'Tahoma','Arial','Arimo',sans-serif";

     const ROW_H = 22;
    const wonderCount = 66 - 39 + 1; // IMPROVEMENTS[39..66]
    const PW = Math.min(440, canvasW - 40);
    const PH = 70 + wonderCount * ROW_H + 50;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - Math.min(PH, canvasH - 40)) / 2);
    const clampedPH = Math.min(PH, canvasH - 40);

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Panel
    this._drawCiv2Panel(ctx, px, py, PW, clampedPH, 'Wonders of the World');

    // Clip content area
    const contentY = py + 32;
    const contentH = clampedPH - 32 - 40;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, contentY, PW, contentH);
    ctx.clip();

    for (let id = 39; id <= 66; id++) {
      const imp = IMPROVEMENTS[id];
      if (!imp) continue;
      const idx = id - 39;
      const ry = contentY + idx * ROW_H;

      // Skip if out of visible area
      if (ry + ROW_H < contentY || ry > contentY + contentH) continue;

      ctx.fillStyle = idx % 2 === 0 ? '#8e8e8e' : '#878787';
      ctx.fillRect(px + 6, ry, PW - 12, ROW_H - 1);

      // Find owner city
      const ownerCity = gs.cities.find(c => c.improvements.has(id));
      // Check expired
      const expired = imp.expiresAt >= 0 &&
        gs.civs.some(c => c.alive && c.advances.has(imp.expiresAt));

      ctx.font = FONT.BODY_SMALL;
      if (ownerCity) {
        const civ = gs.civs[ownerCity.civId];
        const civName = civ?.data?.plural ?? `Civ ${ownerCity.civId}`;
        const civColor = CIV_COLORS[civ?.data?.color ?? 1] ?? '#888';

        // Color strip
        ctx.fillStyle = civColor;
        ctx.fillRect(px + 7, ry + 1, 4, ROW_H - 3);

        if (expired) {
          ctx.fillStyle = '#880000';
          ctx.fillText(`${imp.name}`, px + 16, ry + 15);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#880000';
          ctx.fillText('EXPIRED', px + PW - 12, ry + 15);
          ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = '#000000';
          ctx.fillText(`${imp.name}`, px + 16, ry + 15);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#333333';
          ctx.fillText(`${ownerCity.name} (${civName})`, px + PW - 12, ry + 15);
          ctx.textAlign = 'left';
        }
      } else {
        ctx.fillStyle = '#555555';
        ctx.fillText(`${imp.name}`, px + 16, ry + 15);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#707070';
        ctx.fillText('Not Yet Built', px + PW - 12, ry + 15);
        ctx.textAlign = 'left';
      }
    }

    ctx.restore();

    // Close button
    this._wondersCloseRect = this._drawAdvisorCloseButton(ctx, px, py, PW, clampedPH, null, py + clampedPH - 34);
  }

  MapRenderer.prototype._handleWondersClick = function(px, py) {
    const r = this._wondersCloseRect;
    if (r && px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
      this._wondersList = false;
    }
  }


}
