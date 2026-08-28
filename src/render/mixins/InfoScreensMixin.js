/**
 * InfoScreensMixin — Extracted from MapRenderer.js.
 * All methods installed on MapRenderer.prototype.
 */
import { ADVANCES } from '../../data/advances.js';
import { UNITS } from '../../data/units.js';
import { IMPROVEMENTS } from '../../data/improvements.js';
import { TERRAIN } from '../../data/terrain.js';
import { GOVERNMENTS } from '../../data/governments.js';
import { CIV_COLORS, CLR, FONT, FONT_ARIAL } from '../renderConstants.js';
import { SFX } from '../../audio/sounds.js';
import { getImprovementDesc } from '../../data/descriptions.js';
import { assetUrl } from '../../utils/assets.js';

/** @param {typeof import('../MapRenderer.js').default} MapRenderer */
export function applyInfoScreensMixin(MapRenderer) {
  // ─── Civilopedia ─────────────────────────────────────────────────────────────

  /**
   * Lazy-load narrative text from PEDIA .PDE files.
   * Files are served from public/PEDIA/ via Vite publicDir.
   */
  MapRenderer.prototype._loadPediaTexts = async function() {
    const parsePDE = raw => {
      const m = new Map();
      let name = null, buf = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith('*')) continue;           // skip file header lines
        if (line.trim() === '') {
          if (name) { m.set(name, buf.join(' ').trim()); name = null; buf = []; }
        } else if (!name) {
          name = line.trim();
        } else {
          buf.push(line.trim());
        }
      }
      if (name && buf.length) m.set(name, buf.join(' ').trim());
      return m;
    };
    try {
      const texts = await Promise.all([
        'PEDIA/ADVANC1.PDE', 'PEDIA/ADVANC2.PDE', 'PEDIA/ADVANC3.PDE', 'PEDIA/ADVANC4.PDE',
        'PEDIA/UNITS.PDE',   'PEDIA/UNITS2.PDE',
        'PEDIA/IMPROV.PDE',  'PEDIA/TERRAIN.PDE',
        'PEDIA/WONDER.PDE',  'PEDIA/GOVERN.PDE', 'PEDIA/CONCEPT.PDE',
      ].map(path => fetch(assetUrl(path)).then(r => r.text())));
      this._pediaTexts = {
        advances: new Map([...parsePDE(texts[0]), ...parsePDE(texts[1]),
                           ...parsePDE(texts[2]), ...parsePDE(texts[3])]),
        units:    new Map([...parsePDE(texts[4]), ...parsePDE(texts[5])]),
        improv:   parsePDE(texts[6]),
        terrain:  parsePDE(texts[7]),
        wonders:  parsePDE(texts[8]),
        govts:    parsePDE(texts[9]),
        concepts: parsePDE(texts[10]),
       };
     } catch (e) {
       console.warn('[InfoScreensMixin] Failed to load Civilopedia texts:', e.message);
       this._pediaTexts = {
         advances: new Map(), units: new Map(), improv: new Map(), terrain: new Map(),
         wonders: new Map(), govts: new Map(), concepts: new Map(),
       };
     }
  }

  /**
   * Return the sorted item list for the given Civilopedia tab.
   * Each item is a data record from the relevant data file.
   */
  MapRenderer.prototype._getCivilopediaItems = function(tab) {
    if (tab === 'advances') {
      return ADVANCES.filter(a => a && a.id <= 89).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (tab === 'improv') {
      return IMPROVEMENTS.filter((im, i) => im && i > 0 && i <= 38)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (tab === 'wonders') {
      return IMPROVEMENTS.filter((im, i) => im && i >= 39)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (tab === 'units') {
      return UNITS.filter(u => u && u.id > 0)
                  .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (tab === 'govts') {
      return GOVERNMENTS.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (tab === 'terrain') {
      return Object.values(TERRAIN).sort((a, b) => (a.name ?? a.label ?? '').localeCompare(b.name ?? b.label ?? ''));
    }
    if (tab === 'concepts') {
      return [...(this._pediaTexts?.concepts?.keys?.() ?? [])]
        .map((name, id) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (tab === 'about') {
      return [{ id: 0, name: 'About Civilization II' }];
    }
    return [];
  }

  /**
   * Draw word-wrapped text. Returns the Y position after the last line.
   */
  MapRenderer.prototype._wrapText = function(ctx, text, x, y, maxW, lineH) {
    if (!text) return y;
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, cy);
        cy += lineH;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) { ctx.fillText(line, x, cy); cy += lineH; }
    return cy;
  }

  /** Draw the original MGE Civilopedia index or its separate detail page. */
  MapRenderer.prototype._drawCivilopedia = function(ctx, canvasW, canvasH) {
    const cpd = this._civilopedia;
    const items = this._getCivilopediaItems(cpd.tab);
    cpd.rects = [];
    cpd.mode ??= 'index';

    const titles = {
      // The running MGE executable drops the PEDIA.TXT prefix in this picker.
      advances: 'Civilization Advances',
      units: 'Civilopedia: Unit Types',
      improv: 'Civilopedia: City Improvements',
      wonders: 'Civilopedia: Wonders of the World',
      govts: 'Civilopedia: Governments',
      terrain: 'Civilopedia: Terrain Types',
      concepts: 'Civilopedia: Game Concepts',
      about: 'About Civilization II',
    };

    const detailTitles = {
      advances: 'Civilization Advance',
      units: 'Unit Type',
      improv: 'City Improvement',
      wonders: 'Wonder of the World',
      govts: 'Government',
      terrain: 'Terrain Type',
      concepts: 'Game Concept',
      about: 'About Civilization II',
    };

    if (cpd.mode === 'tree') {
      const PW = Math.min(640, canvasW - 20);
      const PH = Math.min(400, canvasH - 20);
      const px = Math.round((canvasW - PW) / 2);
      const py = Math.round((canvasH - PH) / 2);
      this._civilopediaRect = { x: px, y: py, w: PW, h: PH };
      this._drawCiv2Panel(ctx, px, py, PW, PH, 'Civilization Advance');
      ctx.fillStyle = '#878787';
      ctx.fillRect(px + 6, py + 35, PW - 12, PH - 76);

      const item = items[Math.max(0, Math.min(cpd.selIdx, items.length - 1))];
      const prerequisiteIds = (item?.preq ?? []).filter(id => id >= 0);
      const dependents = item ? ADVANCES.filter(a => a?.preq?.includes(item.id)).slice(0, 6) : [];
      const nodeW = 172, nodeH = 42;
      const center = { x: px + (PW - nodeW) / 2, y: py + 153 };
      const leftNodes = prerequisiteIds.map((id, i) => ({
        item: ADVANCES[id], x: px + 25, y: py + 104 + i * 92,
      }));
      const rightNodes = dependents.map((adv, i) => ({
        item: adv, x: px + PW - nodeW - 25, y: py + 58 + i * 47,
      }));

      ctx.strokeStyle = '#242424';
      ctx.lineWidth = 2;
      for (const n of leftNodes) {
        ctx.beginPath();
        ctx.moveTo(n.x + nodeW, n.y + nodeH / 2);
        ctx.lineTo(center.x, center.y + nodeH / 2);
        ctx.stroke();
      }
      for (const n of rightNodes) {
        ctx.beginPath();
        ctx.moveTo(center.x + nodeW, center.y + nodeH / 2);
        ctx.lineTo(n.x, n.y + nodeH / 2);
        ctx.stroke();
      }

      const drawNode = (adv, x, y, selected = false) => {
        ctx.fillStyle = selected ? '#000080' : '#a7a7a7';
        ctx.fillRect(x, y, nodeW, nodeH);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(x + 0.5, y + 0.5, nodeW - 1, nodeH - 1);
        if (adv) {
          try {
            const spr = this.sprites.getRegionSprite('icons', 343 + (adv.cat ?? 0) * 37, 211 + (adv.epoch ?? 0) * 21, 36, 20);
            if (spr) ctx.drawImage(spr, x + 6, y + 10, 36, 20);
          } catch (e) {
            console.warn('[InfoScreensMixin] Advance tree icon unavailable:', e.message);
          }
          ctx.font = `15px 'Times New Roman','Tinos',serif`;
          ctx.fillStyle = selected ? '#ffffff' : '#000000';
          ctx.fillText(adv.name, x + 48, y + 25);
        }
      };
      leftNodes.forEach(n => drawNode(n.item, n.x, n.y));
      rightNodes.forEach(n => drawNode(n.item, n.x, n.y));
      drawNode(item, center.x, center.y, true);

      ctx.font = FONT.SMALL_BOLD;
      ctx.fillStyle = '#202020';
      ctx.fillText('Requires', px + 25, py + 55);
      ctx.fillText('Leads To', px + PW - nodeW - 25, py + 55);
      const footerY = py + PH - 35;
      const bw = Math.floor((PW - 16) / 2);
      this._drawWin95Button(ctx, px + 6, footerY, bw, 29, 'Go Back', FONT_ARIAL);
      this._drawWin95Button(ctx, px + 10 + bw, footerY, bw, 29, 'Close', FONT_ARIAL);
      cpd.rects.push({ x: px + 6, y: footerY, w: bw, h: 29, action: 'goBack' });
      cpd.rects.push({ x: px + 10 + bw, y: footerY, w: bw, h: 29, action: 'close' });
      return;
    }

    if (cpd.mode === 'detail') {
      const PW = Math.min(480, canvasW - 20);
      const PH = Math.min(400, canvasH - 20);
      const px = Math.round((canvasW - PW) / 2);
      const py = Math.round((canvasH - PH) / 2);
      this._civilopediaRect = { x: px, y: py, w: PW, h: PH };
      const footerY = py + PH - 35;
      this._drawCiv2Panel(ctx, px, py, PW, PH, detailTitles[cpd.tab] ?? 'Civilopedia');
      ctx.fillStyle = '#878787';
      ctx.fillRect(px + 6, py + 35, PW - 12, PH - 76);
      const item = items[Math.max(0, Math.min(cpd.selIdx, items.length - 1))];
      if (item) this._drawCivilopediaDetail(ctx, cpd.tab, item, px + 7, py + 36, PW - 14, PH - 78, FONT_ARIAL, '#dfbb3f');
      const bw = Math.floor((PW - 16) / 2);
      this._drawWin95Button(ctx, px + 6, footerY, bw, 29, 'Go Back', FONT_ARIAL);
      this._drawWin95Button(ctx, px + 10 + bw, footerY, bw, 29, 'Close', FONT_ARIAL);
      cpd.rects.push({ x: px + 6, y: footerY, w: bw, h: 29, action: 'goBack' });
      cpd.rects.push({ x: px + 10 + bw, y: footerY, w: bw, h: 29, action: 'close' });
      return;
    }

    // The original picker is a 9-row, column-major icon list with horizontal
    // scrolling.  At 640px two of its three columns are visible at once.
    const PW = Math.min(640, canvasW - 20);
    const PH = Math.min(400, canvasH - 20);
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);
    this._civilopediaRect = { x: px, y: py, w: PW, h: PH };
    const TITLE_H = 40;
    const ROWS = 9;
    const ROW_H = 33;
    const SCROLL_H = 20;
    const FOOTER_H = 40;
    const listY = py + TITLE_H;
    const colW = Math.floor((PW - 12) / 2);
    const totalCols = Math.max(1, Math.ceil(items.length / ROWS));
    const maxColScroll = Math.max(0, totalCols - 2);
    cpd.scroll = Math.max(0, Math.min(cpd.scroll ?? 0, maxColScroll));
    this._cpdVisibleRows = ROWS * 2;

    this._drawCiv2Panel(ctx, px, py, PW, PH, titles[cpd.tab] ?? 'Civilopedia');
    this._drawWin95Button(ctx, px + 5, py + 5, 27, 27, '×', FONT_ARIAL);
    cpd.rects.push({ x: px + 5, y: py + 5, w: 27, h: 27, action: 'close' });

    ctx.fillStyle = '#878787';
    ctx.fillRect(px + 6, listY, PW - 12, ROWS * ROW_H);

    const drawIcon = (item, x, y) => {
      try {
        if (cpd.tab === 'advances') {
          const spr = this.sprites.getRegionSprite('icons', 343 + (item.cat ?? 0) * 37, 211 + (item.epoch ?? 0) * 21, 36, 20);
          if (spr) ctx.drawImage(spr, x, y + 4, 45, 25);
        } else if (cpd.tab === 'improv' || cpd.tab === 'wonders') {
          const wonder = item.id >= 39;
          const index = wonder ? item.id - 39 : item.id - 1;
          const cols = wonder ? 7 : 8;
          const sx = 343 + (index % cols) * 37;
          const sy = (wonder ? 106 : 1) + Math.floor(index / cols) * 21;
          const spr = this.sprites.getRegionSprite('icons', sx, sy, 36, 20);
          if (spr) ctx.drawImage(spr, x, y + 4, 45, 25);
        } else if (cpd.tab === 'units') {
          const spr = this.sprites.getSprite('units', Math.floor(item.id / 9), item.id % 9);
          if (spr) ctx.drawImage(spr, x, y - 5, 40, 30);
        } else if (cpd.tab === 'terrain') {
          ctx.fillStyle = item.color ?? '#666';
          ctx.fillRect(x, y + 4, 45, 25);
        } else {
          ctx.fillStyle = '#535353';
          ctx.fillRect(x + 4, y + 4, 22, 22);
        }
      } catch (e) {
        console.warn('[InfoScreensMixin] Civilopedia icon unavailable:', e.message);
      }
    };

    for (let visibleCol = 0; visibleCol < 2; visibleCol++) {
      const itemCol = cpd.scroll + visibleCol;
      for (let row = 0; row < ROWS; row++) {
        const idx = itemCol * ROWS + row;
        if (idx >= items.length) break;
        const item = items[idx];
        const x = px + 6 + visibleCol * colW;
        const y = listY + row * ROW_H;
        const selected = idx === cpd.selIdx;
        ctx.fillStyle = selected ? '#676767' : '#878787';
        ctx.fillRect(x, y, colW - 2, ROW_H);
        drawIcon(item, x + 4, y);
        ctx.font = `16px 'Times New Roman','Tinos',serif`;
        ctx.fillStyle = selected ? '#ffffff' : '#000000';
        ctx.fillText(item.name ?? item.label ?? '', x + 51, y + 21);
        cpd.rects.push({ x, y, w: colW - 2, h: ROW_H, action: 'select', idx });
      }
    }

    const scrollY = listY + ROWS * ROW_H;
    this._drawWin95Button(ctx, px + 6, scrollY, 20, SCROLL_H, '‹', FONT_ARIAL);
    this._drawWin95Button(ctx, px + PW - 26, scrollY, 20, SCROLL_H, '›', FONT_ARIAL);
    ctx.fillStyle = '#d7d7d7';
    ctx.fillRect(px + 26, scrollY + 3, PW - 52, SCROLL_H - 6);
    const trackW = PW - 52;
    const thumbW = maxColScroll ? Math.max(40, trackW * 2 / totalCols) : trackW;
    const thumbX = px + 26 + (maxColScroll ? (trackW - thumbW) * cpd.scroll / maxColScroll : 0);
    ctx.fillStyle = '#a7a7a7';
    ctx.fillRect(thumbX, scrollY + 3, thumbW, SCROLL_H - 6);
    cpd.rects.push({ x: px + 6, y: scrollY, w: 20, h: SCROLL_H, action: 'scrollLeft' });
    cpd.rects.push({ x: px + PW - 26, y: scrollY, w: 20, h: SCROLL_H, action: 'scrollRight' });

    const footerY = py + PH - FOOTER_H + 3;
    const buttons = cpd.tab === 'advances' ? ['Info', 'Tree', 'Close'] : ['Info', 'Close'];
    const gap = 4;
    const bw = Math.floor((PW - 12 - gap * (buttons.length - 1)) / buttons.length);
    buttons.forEach((label, i) => {
      const bx = px + 6 + i * (bw + gap);
      this._drawWin95Button(ctx, bx, footerY, bw, 33, label, FONT_ARIAL);
      cpd.rects.push({ x: bx, y: footerY, w: bw, h: 33, action: label.toLowerCase() });
    });
  }

  /**
   * Draw the right-panel detail for the selected Civilopedia item.
   */
   MapRenderer.prototype._drawCivilopediaDetail = function(ctx, tab, item, dx, dy, dw, dh, FA, goldColor) {
    const MARGIN = 8;
    const textX  = dx + MARGIN;
    const textW  = dw - MARGIN * 2;
    let cy = dy + 10;

     // Title
     ctx.font = FONT.LABEL_BOLD;
     ctx.fillStyle = goldColor;
     ctx.fillText(item.name ?? item.label ?? '', textX, cy + 14);
    cy += 22;

    // Divider
    ctx.strokeStyle = '#808080'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(dx + MARGIN, cy); ctx.lineTo(dx + dw - MARGIN, cy); ctx.stroke();
    cy += 8;

    ctx.font = FONT.BODY_SMALL;
    ctx.fillStyle = '#f0f0f0';

    if (tab === 'advances') {
      const EPOCH_NAMES = ['Ancient', 'Medieval', 'Industrial', 'Modern'];
      const CAT_NAMES   = ['Military', 'Economic', 'Social', 'Science', 'Exploration'];
      ctx.fillText(`Epoch:    ${EPOCH_NAMES[item.epoch ?? 0] ?? 'Unknown'}`, textX, cy); cy += 16;
      ctx.fillText(`Category: ${CAT_NAMES[item.cat ?? 0] ?? 'Unknown'}`, textX, cy); cy += 16;
      // Prerequisites
      const p1 = (item.preq && item.preq[0] >= 0) ? (ADVANCES[item.preq[0]]?.name ?? '?') : 'None';
      const p2 = (item.preq && item.preq[1] >= 0) ? (ADVANCES[item.preq[1]]?.name ?? '?') : 'None';
      const prereqStr = (p1 === p2 || p2 === 'None') ? p1 : `${p1}, ${p2}`;
      ctx.fillText(`Requires: ${prereqStr}`, textX, cy); cy += 16;

      // "Leads to" — find all advances that require this one
      const leadsTo = ADVANCES
        .filter(a => a.preq && (a.preq[0] === item.id || a.preq[1] === item.id))
        .map(a => a.name);
      if (leadsTo.length > 0) {
        const leadsStr = `Leads to: ${leadsTo.join(', ')}`;
        if (ctx.measureText(leadsStr).width > textW) {
          cy = this._wrapText(ctx, leadsStr, textX, cy, textW, 15);
        } else {
          ctx.fillText(leadsStr, textX, cy); cy += 16;
        }
      } else {
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('Leads to: (end of tree)', textX, cy); cy += 16;
        ctx.fillStyle = '#f0f0f0';
      }
      cy += 4;

      // Narrative description
      const desc = this._pediaTexts?.advances.get(item.name) ?? null;
      if (desc) {
        ctx.fillStyle = '#e0e0e0';
        cy = this._wrapText(ctx, desc, textX, cy, textW, 15);
      } else if (this._pediaTexts === null) {
        ctx.fillStyle = '#aaaaaa'; ctx.font = FONT.SMALL_ITALIC;
        ctx.fillText('Loading description…', textX, cy);
      }

    } else if (tab === 'improv' || tab === 'wonders') {
      const isWonder = item.id >= 39;
      if (isWonder) {
        ctx.fillStyle = '#ddaa00'; ctx.font = FONT.SMALL_BOLD;
        ctx.fillText('★  WONDER OF THE WORLD', textX, cy); cy += 18;
        ctx.font = FONT.BODY_SMALL; ctx.fillStyle = '#f0f0f0';
      }
      ctx.fillText(`Cost:   ${item.cost ?? '?'} shields`, textX, cy); cy += 16;
      const upkeep = item.upkeep ?? 0;
      ctx.fillText(`Upkeep: ${upkeep > 0 ? upkeep + ' gold/turn' : 'Free'}`, textX, cy); cy += 16;
      const preqAdv = (item.prereq != null && item.prereq >= 0) ? (ADVANCES[item.prereq]?.name ?? '?') : 'None';
      ctx.fillText(`Requires: ${preqAdv}`, textX, cy); cy += 16;
      const expiresAdv = (item.expiresAt != null && item.expiresAt >= 0) ? (ADVANCES[item.expiresAt]?.name ?? '?') : 'Never';
      ctx.fillText(`Expires:  ${expiresAdv}`, textX, cy); cy += 20;
      // Gameplay effect (from descriptions.js)
      const effDesc = getImprovementDesc(item.id);
      if (effDesc) {
        ctx.fillStyle = '#e8e8c0'; ctx.font = FONT.BODY_SMALL;
        cy = this._wrapText(ctx, effDesc, textX, cy, textW, 15);
      }
      const narrative = (tab === 'wonders' ? this._pediaTexts?.wonders : this._pediaTexts?.improv)?.get(item.name) ?? null;
      if (narrative) {
        cy += 6;
        ctx.fillStyle = '#e0e0e0';
        this._wrapText(ctx, narrative, textX, cy, textW, 15);
      }

    } else if (tab === 'units') {
      const DOMAIN_NAMES = ['Land', 'Air', 'Sea'];
      ctx.fillText(`Domain: ${DOMAIN_NAMES[item.domain ?? 0] ?? 'Land'}`, textX, cy); cy += 16;
      ctx.fillText(`Atk: ${item.attack ?? 0}   Def: ${item.defense ?? 0}   HP: ${item.hp ?? 1}   FP: ${item.fp ?? 1}`, textX, cy); cy += 16;
      ctx.fillText(`Move: ${item.move ?? 1}   Cost: ${item.cost ?? 0} shields`, textX, cy); cy += 16;
      const preqAdv = (item.prereq != null && item.prereq >= 0) ? (ADVANCES[item.prereq]?.name ?? '?') : 'None';
      ctx.fillText(`Requires: ${preqAdv}`, textX, cy); cy += 20;
      // Draw unit sprite at top-right of detail panel
      try {
        const sprRow   = Math.floor(item.id / 9);
        const sprCol   = item.id % 9;
        const civColor = CIV_COLORS[this.gameState?.civs[0]?.data?.color ?? 0] ?? '#cc0000';
        const sprite   = this._getColoredUnitSprite(sprRow, sprCol, civColor);
         const sprX     = dx + dw - sprite.width - MARGIN;
         const sprY     = dy + MARGIN;
         ctx.drawImage(sprite, sprX, sprY);
       } catch (e) {
         console.warn('[InfoScreensMixin] Unit sprite unavailable:', e.message);
       }
      // Narrative description
      const desc = this._pediaTexts?.units.get(item.name) ?? null;
      if (desc) {
        ctx.fillStyle = '#e0e0e0';
        cy = this._wrapText(ctx, desc, textX, cy, textW, 15);
      } else if (this._pediaTexts === null) {
        ctx.fillStyle = '#aaaaaa'; ctx.font = FONT.SMALL_ITALIC;
        ctx.fillText('Loading description…', textX, cy);
      }

    } else if (tab === 'terrain') {
      // Terrain swatch at top-right
      const swatchX = dx + dw - 66 - MARGIN;
      const swatchY = dy + MARGIN;
      ctx.fillStyle = item.color ?? '#888888';
      ctx.fillRect(swatchX, swatchY, 66, 33);
      ctx.strokeStyle = '#606060'; ctx.lineWidth = 1;
      ctx.strokeRect(swatchX, swatchY, 66, 33);

      ctx.fillStyle = '#f0f0f0'; ctx.font = FONT.BODY_SMALL;
      ctx.fillText(`Food: ${item.food ?? 0}   Production: ${item.shields ?? 0}   Trade: ${item.trade ?? 0}`, textX, cy); cy += 16;
      const defPct = (item.defense ?? 2) * 50;
      ctx.fillText(`Defense: +${defPct}%   Move cost: ${item.moveCost ?? 1}`, textX, cy); cy += 16;

      const irrigStr = item.irrigate === 'no' ? 'N/A' :
                       (typeof item.irrigate === 'string' && item.irrigate !== 'yes') ? `→ ${item.irrigate}` :
                       `+${item.irrigBonus ?? 1} food`;
      ctx.fillText(`Irrigation: ${irrigStr}`, textX, cy); cy += 16;

      const mineStr = item.mine === 'no' ? 'N/A' :
                      (typeof item.mine === 'string' && item.mine !== 'yes') ? `→ ${item.mine}` :
                      `+${item.mineBonus ?? 1} shields`;
      ctx.fillText(`Mining: ${mineStr}`, textX, cy); cy += 16;

      const xformStr = (item.transformTo && item.transformTo !== 'no') ? item.transformTo : 'N/A';
      ctx.fillText(`Transforms to: ${xformStr}`, textX, cy); cy += 20;

      // Narrative description
      const name = item.label ?? item.name ?? '';
      const desc = this._pediaTexts?.terrain.get(name) ?? null;
      if (desc) {
        ctx.fillStyle = '#e0e0e0';
        cy = this._wrapText(ctx, desc, textX, cy, textW, 15);
      } else if (this._pediaTexts === null) {
        ctx.fillStyle = '#aaaaaa'; ctx.font = FONT.SMALL_ITALIC;
        ctx.fillText('Loading description…', textX, cy);
      }
    } else if (tab === 'govts') {
      const desc = this._pediaTexts?.govts?.get(item.name) ?? null;
      ctx.fillStyle = '#e0e0e0';
      if (desc) this._wrapText(ctx, desc, textX, cy, textW, 15);
      else ctx.fillText('Government description unavailable.', textX, cy);
    } else if (tab === 'concepts') {
      const desc = this._pediaTexts?.concepts?.get(item.name) ?? null;
      ctx.fillStyle = '#e0e0e0';
      if (desc) this._wrapText(ctx, desc, textX, cy, textW, 15);
    } else if (tab === 'about') {
      ctx.fillStyle = '#e0e0e0';
      this._wrapText(ctx,
        "Sid Meier's Civilization II Multiplayer Gold Edition. Original design by Brian Reynolds, Douglas Caspian-Kaufman and Jeff Briggs; published by MicroProse.",
        textX, cy, textW, 16);
    }
  }

  /**
   * Handle clicks inside the Civilopedia overlay.
   */
  MapRenderer.prototype._handleCivilopediaClick = function(px, py) {
    const cpd = this._civilopedia;
    for (const r of cpd.rects) {
      if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
      if (r.action === 'close') {
        this._civilopedia = null;
        return;
      }
      if (r.action === 'tab') {
        if (!cpd._history) cpd._history = [];
        cpd._history.push({ tab: cpd.tab, selIdx: cpd.selIdx, scroll: cpd.scroll });
        cpd.tab    = r.tab;
        cpd.selIdx = 0;
        cpd.scroll = 0;
        return;
      }
      if (r.action === 'select') {
        cpd.selIdx = r.idx;
        return;
      }
      if (r.action === 'scrollLeft' || r.action === 'scrollUp') {
        cpd.scroll = Math.max(0, cpd.scroll - 1);
        return;
      }
      if (r.action === 'scrollRight' || r.action === 'scrollDown') {
        const items = this._getCivilopediaItems(cpd.tab);
        cpd.scroll = Math.min(Math.max(0, Math.ceil(items.length / 9) - 2), cpd.scroll + 1);
        return;
      }
      if (r.action === 'goBack') {
        cpd.mode = 'index';
        return;
      }
      if (r.action === 'info') {
        cpd.mode = 'detail';
        return;
      }
      if (r.action === 'tree') {
        cpd.mode = 'tree';
        return;
      }
    }
  }

  // ─── Win95 button helper (shared) ──────────────────────────────────────────

  // ─── Palace View ──────────────────────────────────────────────────────────

  MapRenderer.prototype._drawPalaceView = function(ctx, canvasW, canvasH) {
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    
    const gs = this.gameState;
    const level = gs.palaceLevel(0);

    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const PW = 480, PH = 360;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Win95 panel
    this._drawWin95Panel(ctx, px, py, PW, PH, 'Palace View');

    const cy = py + 32;
    const cx = px + PW / 2;

    // Palace illustration (procedural based on level)
    const groundY = cy + 220;
    const bldgW = 60 + level * 30;
    const bldgH = 80 + level * 20;

    // Ground
    ctx.fillStyle = '#4a7a2a';
    ctx.fillRect(px + 20, groundY, PW - 40, 60);

    // Path
    ctx.fillStyle = '#c8a860';
    ctx.fillRect(cx - 15, groundY, 30, 60);

    // Main building
    const bx = cx - bldgW / 2;
    const by = groundY - bldgH;
    ctx.fillStyle = '#d4c4a0';
    ctx.fillRect(bx, by, bldgW, bldgH);

    // Roof
    ctx.fillStyle = '#8b4513';
    ctx.beginPath();
    ctx.moveTo(bx - 10, by);
    ctx.lineTo(cx, by - 30 - level * 5);
    ctx.lineTo(bx + bldgW + 10, by);
    ctx.closePath();
    ctx.fill();

    // Windows (more at higher levels)
    ctx.fillStyle = '#4060a0';
    const winRows = Math.min(level + 1, 3);
    const winCols = Math.min(level + 2, 5);
    for (let wr = 0; wr < winRows; wr++) {
      for (let wc = 0; wc < winCols; wc++) {
        const wx = bx + 10 + wc * (bldgW - 20) / winCols;
        const wy = by + 10 + wr * (bldgH - 20) / winRows;
        ctx.fillRect(wx, wy, 8 + level, 10 + level);
      }
    }

    // Door
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(cx - 8, groundY - 20, 16, 20);
    ctx.fillStyle = '#dfbb3f';
    ctx.fillRect(cx + 4, groundY - 12, 3, 3); // doorknob

    // Towers at higher levels
    if (level >= 2) {
      for (const side of [-1, 1]) {
        const tx = cx + side * (bldgW / 2 + 15);
        const tw = 20, th = bldgH + 20 + level * 5;
        ctx.fillStyle = '#c4b490';
        ctx.fillRect(tx - tw / 2, groundY - th, tw, th);
        // Tower cap
        ctx.fillStyle = '#8b4513';
        ctx.beginPath();
        ctx.moveTo(tx - tw / 2 - 3, groundY - th);
        ctx.lineTo(tx, groundY - th - 15);
        ctx.lineTo(tx + tw / 2 + 3, groundY - th);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Columns at higher levels
    if (level >= 3) {
      ctx.fillStyle = '#e0d0b0';
      for (let i = 0; i < 4; i++) {
        const colX = bx + 5 + i * (bldgW - 10) / 3;
        ctx.fillRect(colX, groundY - bldgH - 5, 4, bldgH + 5);
      }
    }

    // Flag at highest level
    if (level >= 4) {
      ctx.fillStyle = '#808080';
      ctx.fillRect(cx - 1, by - 30 - level * 5 - 25, 2, 25);
      ctx.fillStyle = CIV_COLORS[gs.civs[0]?.data?.color ?? 1];
      ctx.fillRect(cx + 1, by - 30 - level * 5 - 25, 12, 8);
    }

    // Era label
    const eras = ['Ancient', 'Classical', 'Renaissance', 'Industrial', 'Modern', 'Space Age'];
    ctx.font = FONT.MENU_BOLD;
    ctx.fillStyle = '#dfbb3f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${eras[level]} Palace`, cx, py + PH - 30);

    ctx.font = FONT.TINY;
    ctx.fillStyle = '#808080';
    ctx.fillText('Click to close', cx, py + PH - 12);
    ctx.textAlign = 'left';
  }

  // ─── Throne Room ────────────────────────────────────────────────────────────

  MapRenderer.prototype._drawThroneRoom = function(ctx, canvasW, canvasH) {
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    
    const gs = this.gameState;
    const level = gs.palaceLevel(0);
    const dec = gs._throneDecorations ?? {};

    // pv.dll contains the real MGE Palace View as a base photograph plus one
    // complete 640x480 layer for each room section and period. The layers are
    // pre-keyed to transparent PNGs by tools/extract-mge-throne-room.js.
    const palaceBase = this._introImages?.['palace-base'];
    if (palaceBase?.complete && palaceBase.naturalWidth) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasW, canvasH);

      const sourceW = 640, sourceH = 480;
      const scale = Math.min(1, canvasW / sourceW, canvasH / sourceH);
      const drawW = Math.round(sourceW * scale);
      const drawH = Math.round(sourceH * scale);
      const drawX = Math.round((canvasW - drawW) / 2);
      const drawY = Math.round((canvasH - drawH) / 2);
      const drawPalaceImage = (image) => {
        if (!image?.complete || !image.naturalWidth) return false;
        // Upgrade layers include a one-pixel palette-key border (642x482).
        const insetX = image.naturalWidth > sourceW ? 1 : 0;
        const insetY = image.naturalHeight > sourceH ? 1 : 0;
        ctx.drawImage(image, insetX, insetY, sourceW, sourceH, drawX, drawY, drawW, drawH);
        return true;
      };

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      drawPalaceImage(palaceBase);
      const categories = ['walls', 'floor', 'entrance', 'windows', 'banner', 'columns', 'throne', 'guards'];
      const layers = [];
      for (const category of categories) {
        const tier = Math.max(0, Math.min(3, dec[category] ?? 0));
        const name = `palace-${category}-${tier}`;
        if (drawPalaceImage(this._introImages?.[name])) layers.push(name);
      }
      ctx.restore();

      // MGE gives the modeless view a restrained Windows edge; leave its art
      // unobstructed rather than painting a new title or instruction over it.
      ctx.strokeStyle = '#dfdfdf';
      ctx.strokeRect(drawX + 0.5, drawY + 0.5, drawW - 1, drawH - 1);
      ctx.strokeStyle = '#404040';
      ctx.strokeRect(drawX + 1.5, drawY + 1.5, drawW - 3, drawH - 3);
      this._throneRoomRenderState = { x: drawX, y: drawY, width: drawW, height: drawH, layers };
      return;
    }

    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const PW = 480, PH = 380;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Win95 panel
    this._drawWin95Panel(ctx, px, py, PW, PH, 'Throne Room');

    const roomX = px + 20, roomY = py + 35;
    const roomW = PW - 40, roomH = PH - 80;

    // ── Floor ────────────────────────────────────────────────────────────────
    const floorTier = dec.floor ?? 0;
    const floorColors = [
      ['#8a6a3a', '#a07848'],  // tier 0: plain wood
      ['#7a5a3a', '#c0a060'],  // tier 1: polished wood
      ['#505050', '#808080'],  // tier 2: stone tiles
      ['#2a2a3a', '#4a4a5a'],  // tier 3: marble
    ];
    const [floorA, floorB] = floorColors[floorTier];
    ctx.fillStyle = floorA;
    ctx.fillRect(roomX, roomY, roomW, roomH);
    for (let r = 0; r < roomH; r += 20) {
      for (let c = 0; c < roomW; c += 20) {
        if ((r / 20 + c / 20) % 2 === 0) {
          ctx.fillStyle = floorB;
          ctx.fillRect(roomX + c, roomY + r, 20, 20);
        }
      }
    }

    // ── Entrance (carpet) ────────────────────────────────────────────────────
    const entranceTier = dec.entrance ?? 0;
    if (entranceTier >= 1) {
      const carpetColors = ['', '#8b2020', '#20508b', '#dfbb3f'];
      ctx.fillStyle = carpetColors[entranceTier] + '80';
      const cw = 20 + entranceTier * 10;
      ctx.fillRect(roomX + roomW / 2 - cw / 2, roomY + 70 + 50, cw, roomH - 130);
      // Border trim
      ctx.strokeStyle = carpetColors[entranceTier];
      ctx.lineWidth = 1;
      ctx.strokeRect(roomX + roomW / 2 - cw / 2, roomY + 70 + 50, cw, roomH - 130);
    }

    // ── Walls ────────────────────────────────────────────────────────────────
    const wallTier = dec.walls ?? 0;
    const wallColor = ['#6a5a4a', '#7a6a5a', '#5a4a6a', '#4a3a2a'][wallTier];
    ctx.fillStyle = wallColor;
    ctx.fillRect(roomX, roomY, roomW, 60);
    // Tapestries scale with tier
    if (wallTier >= 1) {
      ctx.fillStyle = '#8b2020';
      ctx.fillRect(roomX + 20, roomY + 5, 40, 50);
      ctx.fillRect(roomX + roomW - 60, roomY + 5, 40, 50);
    }
    if (wallTier >= 2) {
      ctx.fillStyle = '#20508b';
      ctx.fillRect(roomX + 80, roomY + 5, 40, 50);
      ctx.fillRect(roomX + roomW - 120, roomY + 5, 40, 50);
    }
    if (wallTier >= 3) {
      ctx.fillStyle = '#dfbb3f';
      ctx.fillRect(roomX + 140, roomY + 5, 40, 50);
      ctx.fillRect(roomX + roomW - 180, roomY + 5, 40, 50);
    }

    // ── Windows ──────────────────────────────────────────────────────────────
    const windowTier = dec.windows ?? 0;
    if (windowTier >= 1) {
      const winColors = ['', '#60a0d0', '#80c0e0', '#d0e0ff'];
      ctx.fillStyle = winColors[windowTier];
      const positions = windowTier >= 3 ? [30, roomW - 50, roomW / 2 - 10] : [40, roomW - 60];
      for (const dx of positions) {
        ctx.fillRect(roomX + dx, roomY + 10, 20, 35);
        ctx.strokeStyle = '#808060';
        ctx.lineWidth = windowTier;
        ctx.strokeRect(roomX + dx, roomY + 10, 20, 35);
      }
    }

    // ── Columns ──────────────────────────────────────────────────────────────
    const colTier = dec.columns ?? 0;
    if (colTier >= 1) {
      const colW = 6 + colTier * 2;
      const pairs = colTier >= 3 ? [-50, -90, 80, 120] : colTier >= 2 ? [-50, 80, -80, 110] : [-50, 80];
      const throneX = roomX + roomW / 2 - 30;
      for (const dx of pairs) {
        ctx.fillStyle = ['', '#c8b898', '#d8c8a8', '#e8d8b8'][colTier];
        ctx.fillRect(throneX + dx, roomY + 10, colW, roomH - 30);
        ctx.fillStyle = '#dfbb3f';
        ctx.fillRect(throneX + dx - 2, roomY + 10, colW + 4, 6);
        ctx.fillRect(throneX + dx - 2, roomY + roomH - 24, colW + 4, 4);
      }
    }

    // ── Throne ───────────────────────────────────────────────────────────────
    const throneTier = dec.throne ?? 0;
    const throneX = roomX + roomW / 2 - 30;
    const throneY = roomY + 70;
    // Platform
    ctx.fillStyle = ['#c0a060', '#d0b070', '#e0c080', '#dfbb3f'][throneTier];
    ctx.fillRect(throneX - 10 - throneTier * 5, throneY + 20, 80 + throneTier * 10, 10);
    // Chair
    ctx.fillStyle = ['#b09020', '#c0a030', '#d0b040', '#dfbb3f'][throneTier];
    ctx.fillRect(throneX, throneY - 20, 60, 40);
    // Back
    const backH = 25 + level * 5 + throneTier * 8;
    ctx.fillStyle = ['#907010', '#a08020', '#b09030', '#c0a040'][throneTier];
    ctx.fillRect(throneX + 5, throneY - 20 - backH + 20, 50, backH);
    // Cushion
    ctx.fillStyle = ['#8b2020', '#a03030', '#b04040', '#c05050'][throneTier];
    ctx.fillRect(throneX + 10, throneY - 5, 40, 15);
    // Crown (tier 2+)
    if (throneTier >= 2) {
      ctx.fillStyle = '#dfbb3f';
      const crownY = throneY - 20 - backH + 15;
      ctx.fillRect(throneX + 18, crownY, 24, 5);
      for (let i = 0; i < 3 + (throneTier - 2); i++) {
        ctx.fillRect(throneX + 16 + i * 7, crownY - 6, 4, 6);
      }
    }

    // ── Guards ───────────────────────────────────────────────────────────────
    const guardTier = dec.guards ?? 0;
    if (guardTier >= 1) {
      const guardPositions = guardTier >= 3 ? [-70, 120, -100, 150] : guardTier >= 2 ? [-70, 120, -90, 140] : [-70, 120];
      const armorColors = ['', '#404040', '#606060', '#808080'];
      for (const dx of guardPositions) {
        ctx.fillStyle = armorColors[guardTier];
        ctx.fillRect(throneX + dx, throneY - 10, 12, 30);
        ctx.fillStyle = '#a0a0a0';
        ctx.beginPath();
        ctx.arc(throneX + dx + 6, throneY - 15, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a0a0a0';
        ctx.fillRect(throneX + dx + 10, throneY - 30, 2, 50);
        // Shield (tier 2+)
        if (guardTier >= 2) {
          ctx.fillStyle = '#8b2020';
          ctx.fillRect(throneX + dx - 2, throneY - 5, 8, 12);
        }
      }
    }

    // ── Banner ───────────────────────────────────────────────────────────────
    const bannerTier = dec.banner ?? 0;
    if (bannerTier >= 1) {
      const civColor = CIV_COLORS[gs.civs[0]?.data?.color ?? 1];
      // Flagpole
      ctx.fillStyle = '#808080';
      ctx.fillRect(roomX + roomW / 2 - 1, roomY - 5, 2, 30 + bannerTier * 5);
      // Banner
      ctx.fillStyle = civColor;
      ctx.fillRect(roomX + roomW / 2 + 1, roomY - 5, 14 + bannerTier * 4, 10 + bannerTier * 3);
      if (bannerTier >= 2) {
        // Second banner on other side
        ctx.fillRect(roomX + roomW / 2 - 15 - bannerTier * 4, roomY - 5, 14 + bannerTier * 4, 10 + bannerTier * 3);
      }
    }

    // Braziers (always present, scale with level)
    for (const dx of [-30, 90]) {
      ctx.fillStyle = '#808080';
      ctx.fillRect(throneX + dx, throneY + 5, 8, 15);
      ctx.fillStyle = '#ff6020';
      ctx.beginPath();
      ctx.arc(throneX + dx + 4, throneY + 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(throneX + dx + 4, throneY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Level label
    const eras = ['Ancient', 'Classical', 'Renaissance', 'Industrial', 'Modern', 'Space Age'];
    const totalTier = Object.values(dec).reduce((s, v) => s + v, 0);
    ctx.font = FONT.BODY_TIMES_BOLD;
    ctx.fillStyle = '#dfbb3f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${eras[level]} Throne Room — ${totalTier} decoration${totalTier !== 1 ? 's' : ''}`, px + PW / 2, py + PH - 20);

    ctx.font = FONT.TINY;
    ctx.fillStyle = '#808080';
    ctx.fillText('Click to close', px + PW / 2, py + PH - 6);
    ctx.textAlign = 'left';
  }

  // ─── Throne Upgrade Dialog ──────────────────────────────────────────────────

  MapRenderer.prototype._drawThroneUpgradeDialog = function(ctx, canvasW, canvasH) {
    
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    const gs = this.gameState;
    const categories = gs._pendingThroneOffer;
    if (!categories || categories.length === 0) {
      this._throneUpgradeDialog = false;
      return;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const PW = 320, BTN_H = 28, GAP = 4, PAD = 12;
    const PH = 60 + categories.length * (BTN_H + GAP) + 20;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    this._drawWin95Panel(ctx, px, py, PW, PH, 'Throne Room Improvement');
    this._throneUpgradeRects = [];

    // Title text
    ctx.font = FONT.BODY_TIMES_BOLD;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    this._panelText(ctx, 'Which section shall we improve?', px + PW / 2, py + 48);

    const LABELS = {
      floor: 'Floor Tiles', walls: 'Wall Tapestries', throne: 'Throne',
      entrance: 'Entrance Carpet', columns: 'Columns', windows: 'Windows',
      guards: 'Entryway', banner: 'Wall Hangings',
    };

    let by = py + 60;
    for (const cat of categories) {
      const tier = (gs._throneDecorations[cat] ?? 0) + 1;
      const label = `${LABELS[cat] ?? cat} (Tier ${tier})`;
      const bx = px + PAD, bw = PW - PAD * 2;
      // Win95 button
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(bx, by, bw, BTN_H);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by, 1, BTN_H);
      ctx.fillStyle = '#808080'; ctx.fillRect(bx, by + BTN_H - 1, bw, 1); ctx.fillRect(bx + bw - 1, by, 1, BTN_H);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(bx + 1, by + 1, bw - 2, 1); ctx.fillRect(bx + 1, by + 1, 1, BTN_H - 2);
      ctx.fillStyle = '#404040'; ctx.fillRect(bx + 1, by + BTN_H - 2, bw - 2, 1); ctx.fillRect(bx + bw - 2, by + 1, 1, BTN_H - 2);
      ctx.font = FONT.SMALL_BOLD;
      ctx.fillStyle = '#000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 10, by + BTN_H / 2);
      this._throneUpgradeRects.push({ cat, x: bx, y: by, w: bw, h: BTN_H });
      by += BTN_H + GAP;
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  MapRenderer.prototype._handleThroneUpgradeClick = function(px, py) {
    const hit = this._throneUpgradeRects.find(
      r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
    );
    if (hit) {
      this.gameState.applyThroneDecoration(hit.cat);
      this._throneUpgradeDialog = false;
      this._throneRoom = true; // show updated throne room
      this._play(SFX.pos);
    }
  }

  // ─── End-Game Replay Map ────────────────────────────────────────────────────

  MapRenderer.prototype._drawReplayMap = function(ctx, canvasW, canvasH) {
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    const gs = this.gameState;
    const history = gs.territoryHistory;

    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const PW = 560, PH = 420;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Win95 panel
    this._drawWin95Panel(ctx, px, py, PW, PH, 'Replay Map — Territorial History');

    if (!history || history.length === 0) {
      ctx.font = FONT.MENU;
      ctx.fillStyle = '#808080';
      ctx.textAlign = 'center';
      ctx.fillText('No territory history recorded yet.', px + PW / 2, py + PH / 2);
      ctx.font = FONT.TINY;
      ctx.fillText('History is recorded every 5 turns.', px + PW / 2, py + PH / 2 + 20);
      ctx.fillText('Click to close', px + PW / 2, py + PH - 12);
      ctx.textAlign = 'left';
      return;
    }

    // Auto-advance frames
    this._replayTimer += 1;
    if (this._replayTimer >= 3) { // advance every ~3 frames (~100ms at 30fps)
      this._replayTimer = 0;
      this._replayFrame = (this._replayFrame + 1) % history.length;
    }

    const snap = history[this._replayFrame];
    const cols = gs.mapCols;
    const rows = gs.mapRows;

    // Minimap area
    const mapX = px + 20, mapY = py + 35;
    const mapW = PW - 40, mapH = PH - 90;

    // Scale to fit
    const scaleX = mapW / cols;
    const scaleY = mapH / rows;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = mapX + (mapW - cols * scale) / 2;
    const offsetY = mapY + (mapH - rows * scale) / 2;

    // Draw black ocean background
    ctx.fillStyle = '#102040';
    ctx.fillRect(mapX, mapY, mapW, mapH);

    // Draw each tile
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const owner = snap.owners[r * cols + c];
        if (owner === 255) {
          // Unowned — show terrain type as muted color
          const terrain = gs.tiles[r]?.[c];
          if (terrain && terrain !== TERRAIN.OCEAN) {
            ctx.fillStyle = 'rgba(60,80,40,0.4)';
            ctx.fillRect(offsetX + c * scale, offsetY + r * scale, Math.max(1, scale), Math.max(1, scale));
          }
        } else {
          // Owned territory — civ color
          const civColor = CIV_COLORS[gs.civs[owner]?.data?.color ?? 0] ?? '#808080';
          ctx.fillStyle = civColor;
          ctx.fillRect(offsetX + c * scale, offsetY + r * scale, Math.max(1, scale), Math.max(1, scale));
        }
      }
    }

    // Year label for current frame
    const yr = gs._gameYear ? gs._gameYear(snap.turn) : snap.turn;
    const yLabel = typeof yr === 'number' ? (yr < 0 ? `${Math.abs(yr)} B.C.` : `${yr} A.D.`) : `Turn ${snap.turn}`;
    ctx.font = FONT.BODY_BOLD;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${yLabel}  (${this._replayFrame + 1}/${history.length})`, px + PW / 2, py + PH - 30);

    // Progress bar
    const barX = px + 40, barY = py + PH - 22, barW = PW - 80, barH = 6;
    ctx.fillStyle = '#404040';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#dfbb3f';
    ctx.fillRect(barX, barY, barW * (this._replayFrame + 1) / history.length, barH);

    ctx.font = FONT.TINY;
    ctx.fillStyle = '#808080';
    ctx.fillText('Click to close', px + PW / 2, py + PH - 6);
    ctx.textAlign = 'left';
  }


}
