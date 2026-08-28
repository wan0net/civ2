/**
 * DialogsMixin — Extracted from MapRenderer.js.
 * All methods installed on MapRenderer.prototype.
 */
import { UNITS } from '../../data/units.js';
import { IMPROVEMENTS } from '../../data/improvements.js';
import { ADVANCES } from '../../data/advances.js';
import { GOVERNMENTS } from '../../data/governments.js';
import { tileToScreen, TILE_W_S, TILE_H_S } from '../../utils/IsoMath.js';
import { CIV_COLORS, TOP_H, SB_W, FONT, CLR } from '../renderConstants.js';
import { SFX } from '../../audio/sounds.js';
import { assetUrl } from '../../utils/assets.js';

// MGE KINGS/HRLD*.AVI order follows RULES.TXT @LEADERS / CIVS ids.
const HERALD_FILES = [
  'ROM', 'BAB', 'GER', 'EGY', 'AME', 'GRE', 'IND',
  'RUS', 'ZUL', 'FRE', 'AZT', 'CHI', 'ENG', 'MON',
  'CEL', 'JAP', 'VIK', 'SPA', 'PER', 'CAR', 'SIO',
];

/** @param {typeof import('../MapRenderer.js').default} MapRenderer */
export function applyDialogsMixin(MapRenderer) {
  // ─── Tax / Science / Luxury rate dialog ────────────────────────────────────

  // Returns the maximum allowed rate for a single rate category given government type.
  // Source: axx0 TaxRateWindow.cs — `_max = _civ.Government switch { 0 or 1 => 60, 2 => 70, 3 or 4 or 5 => 80, 6 => 90 }`
  MapRenderer.prototype._govtMaxRate = function(govt) {
    if (govt <= 1) return 60;  // Anarchy, Despotism
    if (govt === 2) return 70; // Monarchy
    if (govt <= 5) return 80;  // Communism, Fundamentalism, Republic
    return 90;                 // Democracy
  }

  MapRenderer.prototype._openRateDialog = function(action) {
    this._rateDialog = {
      focus:     action === 'kd_sci' ? 'sci' : action === 'kd_lux' ? 'lux' : 'tax',
      taxLocked: false,
      sciLocked: false,
      luxLocked: false,
      rects:     [],
    };
  }

  // Applies a rate change following axx0's ChangeRates() logic:
  //   - new value must be in [0, govtMax]
  //   - compensating rate is taken from the "preferred" unlocked sibling first, then fallback
  //   - preference order: tax→sci→lux, sci→lux→tax, lux→tax→sci
  //   - if neither sibling can absorb, the change is blocked (nothing happens)
  MapRenderer.prototype._applyRateChange = function(civ, rd, prop, newVal) {
    const max = this._govtMaxRate(civ.government ?? 1);
    if (newVal < 0 || newVal > max) return;
    const delta = newVal - civ[prop];
    if (delta === 0) return;

    let pref, fallb;
    if (prop === 'taxRate')      { pref = 'sciRate'; fallb = 'luxRate'; }
    else if (prop === 'sciRate') { pref = 'luxRate'; fallb = 'taxRate'; }
    else                         { pref = 'taxRate'; fallb = 'sciRate'; }

    const prefKey  = pref  === 'taxRate' ? 'tax' : pref  === 'sciRate' ? 'sci' : 'lux';
    const fallbKey = fallb === 'taxRate' ? 'tax' : fallb === 'sciRate' ? 'sci' : 'lux';
    const prefLocked  = rd[prefKey  + 'Locked'];
    const fallbLocked = rd[fallbKey + 'Locked'];

    const prefNew  = civ[pref]  - delta;
    const fallbNew = civ[fallb] - delta;

    if (!prefLocked  && prefNew  >= 0 && prefNew  <= max) { civ[prop] = newVal; civ[pref]  = prefNew;  }
    else if (!fallbLocked && fallbNew >= 0 && fallbNew <= max) { civ[prop] = newVal; civ[fallb] = fallbNew; }
    // else: blocked — neither sibling can absorb, no change
  }

  MapRenderer.prototype._drawRateDialog = function(ctx, canvasW, canvasH) {
    const gs  = this.gameState;
    const civ = gs.civs[0];
    if (!civ) { this._rateDialog = null; return; }
    const rd  = this._rateDialog;
    
    const govt    = civ.government ?? 1;
    const max     = this._govtMaxRate(govt);
    const govtName = GOVERNMENTS[govt]?.name ?? 'Despotism';

    // Compute live income / cost / discovery forecast
    const cities0 = gs.cities.filter(c => c.civId === 0);
    let goldIncome = 0, sciBeakers = 0, impCost = 0;
    for (const city of cities0) {
      const y = gs.cityYields(city);
      goldIncome += Math.floor(y.trade * civ.taxRate / 100);
      sciBeakers += Math.floor(y.trade * civ.sciRate  / 100);
      for (const impId of city.improvements) {
        const imp = IMPROVEMENTS[impId];
        if (imp?.upkeep > 0) impCost += imp.upkeep;
      }
    }
    const advCost    = gs.advanceCost(civ);
    const remaining  = Math.max(0, advCost - (civ.beakers ?? 0));
    const turnsToAdv = sciBeakers > 0 ? Math.ceil(remaining / sciBeakers) : '?';
    const advName    = civ.currentResearch != null
      ? (ADVANCES[civ.currentResearch]?.name ?? 'Unknown') : 'Nothing';

    // Panel dimensions — sized to fit axx0 layout (505px scrollbars + lock + padding)
    const PW = 590, PH = 370;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Civ2 wallpaper panel with embossed title
    const { ix, iy } = this._drawCiv2Panel(ctx, px, py, PW, PH, 'How Shall We Distribute The Wealth');

    // Info rows — light text on dark marble (axx0: #dfdfdf front, #434343 shadow)
    // axx0 uses HeaderLabelFontSizeNormal (18) but we scale to ~12px for our panel
    ctx.font = FONT.BODY;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // Government + max rate (axx0: y=top+10, centered, width=535)
    this._panelText(ctx, `Government: ${govtName}   Maximum Rate: ${max}%`, ix + 268, iy + 14);

    // Total Income / Total Cost (axx0: y=top+64)
    this._panelText(ctx, `Total Income: ${goldIncome} Gold   Total Cost: ${impCost} Gold`, ix + 268, iy + 56);

    // Discovery turns (axx0: y=top+91)
    const discText = civ.currentResearch != null
      ? `${advName}: ${turnsToAdv} turn${turnsToAdv !== 1 ? 's' : ''} to discovery`
      : 'No advance selected';
    this._panelText(ctx, discText, ix + 268, iy + 78);

    // "Lock" column header (axx0: x=left+520, y=top+140)
    ctx.font = FONT.BODY_SMALL;
    this._panelText(ctx, 'Lock', ix + 540, iy + 100);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    rd.rects = [];

    // Scrollbar constants (matching axx0 TaxRateWindow.cs)
    const SB_LEFT   = ix + 15;   // axx0: LayoutPadding.Left + 15
    const SB_W      = 505;       // axx0: Width = 505
    const SB_H      = 25;        // axx0: scrollbarDim = 25
    const SB_DIM    = 17;        // arrow button width (ScrollbarDimDefault)
    const TRACK_W   = SB_W - 2 * SB_DIM; // track area between arrows
    const LOCK_X    = ix + 545;  // axx0: LayoutPadding.Left + 545

    // Win95 scrollbar button helper (draws a raised 3D button with optional arrow)
    const drawSbBtn = (bx, by, bw, bh, arrowDir) => {
      // Face
      ctx.fillStyle = '#f0f0f0'; ctx.fillRect(bx, by, bw, bh);
      // Outer highlight top/left
      ctx.fillStyle = '#e3e3e3';
      ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by, 1, bh);
      // Inner highlight
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx+1, by+1, bw-2, 1); ctx.fillRect(bx+1, by+1, 1, bh-2);
      // Inner shadow
      ctx.fillStyle = '#a0a0a0';
      ctx.fillRect(bx+bw-2, by+1, 1, bh-1); ctx.fillRect(bx+1, by+bh-2, bw-2, 1);
      // Outer shadow
      ctx.fillStyle = '#696969';
      ctx.fillRect(bx, by+bh-1, bw, 1); ctx.fillRect(bx+bw-1, by, 1, bh);
      // Arrow
      if (arrowDir) {
        ctx.fillStyle = '#000000';
        const cx = Math.floor(bx + bw/2);
        const cy = Math.floor(by + bh/2);
        if (arrowDir === 'left') {
          // Left-pointing triangle
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(cx + 2 - i, cy - i, 1, 2*i + 1);
          }
        } else {
          // Right-pointing triangle
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(cx - 2 + i, cy - i, 1, 2*i + 1);
          }
        }
      }
    };

    // Win95 checkbox (lock indicator) — uses _drawCiv2Checkbox
    const drawLock = (bx, by, locked) => {
      this._drawCiv2Checkbox(ctx, bx, by, locked);
    };

    const rates = [
      { key: 'tax', label: 'Taxes',     prop: 'taxRate', val: civ.taxRate, locked: rd.taxLocked },
      { key: 'sci', label: 'Science',   prop: 'sciRate', val: civ.sciRate, locked: rd.sciLocked },
      { key: 'lux', label: 'Luxuries',  prop: 'luxRate', val: civ.luxRate, locked: rd.luxLocked },
    ];

    rates.forEach((r, i) => {
      // axx0: each rate section offset by 61px (tax at y=140, sci at y=201, lux at y=262)
      const baseY = iy + 100 + i * 61;

      // Rate label centered (axx0: "Taxes: 30%", centered, width=505)
      ctx.font = FONT.BODY;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      this._panelText(ctx, `${r.label}: ${r.val}%`, SB_LEFT + SB_W/2, baseY + 12);

      // "0%" left-aligned, "100%" right-aligned (axx0: same Y as label)
      ctx.font = FONT.BODY_SMALL;
      ctx.textAlign = 'left';
      this._panelText(ctx, '0%', SB_LEFT, baseY + 12);
      ctx.textAlign = 'right';
      this._panelText(ctx, '100%', SB_LEFT + SB_W, baseY + 12);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

      // Horizontal scrollbar (axx0: y=top+171+offset, width=505, height=25)
      const sbY = baseY + 18;

      // Track background (white)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(SB_LEFT, sbY, SB_W, SB_H);

      // Left arrow button
      drawSbBtn(SB_LEFT, sbY, SB_DIM, SB_H, 'left');
      rd.rects.push({ x: SB_LEFT, y: sbY, w: SB_DIM, h: SB_H, key: r.key, delta: -10 });

      // Right arrow button
      drawSbBtn(SB_LEFT + SB_W - SB_DIM, sbY, SB_DIM, SB_H, 'right');
      rd.rects.push({ x: SB_LEFT + SB_W - SB_DIM, y: sbY, w: SB_DIM, h: SB_H, key: r.key, delta: 10 });

      // Thumb position: axx0 increment = (Width - 3*SB_DIM) / Maximum
      const increment = (SB_W - 3 * SB_DIM) / 10;
      const thumbX = SB_LEFT + SB_DIM + Math.round((r.val / 10) * increment);
      drawSbBtn(thumbX, sbY, SB_DIM, SB_H, null);

      // Track click areas (left of thumb = decrease, right of thumb = increase)
      const trackLeftX = SB_LEFT + SB_DIM;
      const trackLeftW = thumbX - trackLeftX;
      if (trackLeftW > 0) {
        rd.rects.push({ x: trackLeftX, y: sbY, w: trackLeftW, h: SB_H, key: r.key, action: 'trackSet', sbLeft: SB_LEFT, sbW: SB_W, sbDim: SB_DIM, increment });
      }
      const trackRightX = thumbX + SB_DIM;
      const trackRightEnd = SB_LEFT + SB_W - SB_DIM;
      const trackRightW = trackRightEnd - trackRightX;
      if (trackRightW > 0) {
        rd.rects.push({ x: trackRightX, y: sbY, w: trackRightW, h: SB_H, key: r.key, action: 'trackSet', sbLeft: SB_LEFT, sbW: SB_W, sbDim: SB_DIM, increment });
      }

      // Lock checkbox (axx0: x=left+545, y=top+166+offset)
      drawLock(LOCK_X, sbY + 2, r.locked);
      rd.rects.push({ x: LOCK_X, y: sbY + 2, w: 14, h: 14, key: r.key, action: 'lock' });
    });

    // OK button (full width, axx0: x=left+2, y=height-bottom-30, width=panelWidth-paddingSide-4, h=28)
    const btnW2 = PW - 24, btnH2 = 28;
    const closeY = py + PH - 42;
    const cbx = px + 12;
    this._drawWin95Button(ctx, cbx, closeY, btnW2, btnH2, 'OK');
    rd.rects.push({ x: cbx, y: closeY, w: btnW2, h: btnH2, key: 'close' });
  }

  MapRenderer.prototype._handleRateDialogClick = function(cx, cy) {
    const rd  = this._rateDialog;
    const hit = rd.rects.find(r => cx >= r.x && cx < r.x+r.w && cy >= r.y && cy < r.y+r.h);
    if (!hit) return;
    if (hit.key === 'close') { this._rateDialog = null; return; }

    const civ = this.gameState.civs[0];
    if (!civ) return;

    // Lock toggle: only one rate may be locked at a time (axx0 behavior)
    if (hit.action === 'lock') {
      const lockProp = hit.key + 'Locked';
      if (rd[lockProp]) {
        rd[lockProp] = false;
      } else {
        rd.taxLocked = false; rd.sciLocked = false; rd.luxLocked = false;
        rd[lockProp] = true;
      }
      this._play(SFX.menuOk);
      return;
    }

    const propMap = { tax: 'taxRate', sci: 'sciRate', lux: 'luxRate' };

    // Track click — set position based on click location
    if (hit.action === 'trackSet') {
      const relX = cx - hit.sbLeft - hit.sbDim;
      const pos = Math.round(relX / hit.increment);
      const newVal = Math.max(0, Math.min(100, pos * 10));
      this._applyRateChange(civ, rd, propMap[hit.key], newVal);
      this._play(SFX.menuOk);
      return;
    }

    // Arrow button — delta is ±10
    this._applyRateChange(civ, rd, propMap[hit.key], civ[propMap[hit.key]] + hit.delta);
    this._play(SFX.menuOk);
  }

  // ─── Foreign Advisor / Diplomacy screen ───────────────────────────────────

  MapRenderer.prototype._startHeraldVideo = function(civId) {
    this._stopHeraldVideo();
    if (this.gameState?._graphicOptions?.animatedHeralds === false) return;
    const code = HERALD_FILES[civId];
    if (!code) return;
    const video = document.createElement('video');
    video.src = assetUrl(`sprites/extracted/heralds/HRLD${code}.webm`);
    video.muted = true; // original herald AVIs have no audio
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.display = 'none';
    document.body.appendChild(video);
    video.play().catch(() => {});
    video.addEventListener('error', () => this._stopHeraldVideo(), { once: true });
    this._heraldVideo = video;
  }

  MapRenderer.prototype._stopHeraldVideo = function() {
    if (!this._heraldVideo) return;
    this._heraldVideo.pause();
    this._heraldVideo.remove();
    this._heraldVideo = null;
    this._heraldRenderState = null;
  }

  MapRenderer.prototype._drawDiplomacyScreen = function(ctx, canvasW, canvasH) {
    const gs      = this.gameState;
    const FA      = "'Tahoma','Arial','Arimo',sans-serif";
    // Barbarians have no diplomacy screen or herald in MGE.
    const others  = gs.civs.filter(c => c.id !== 0 && c.id !== gs.barbarianCivIdx && c.alive && gs.hasContact(0, c.id));

    const ROW_H = 52;
    const PW    = Math.min(460, canvasW - 40);
    const PH    = 60 + others.length * ROW_H + 50;
    const px    = Math.round((canvasW - PW) / 2);
    const py    = Math.round((canvasH - PH) / 2);

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Civ2 wallpaper panel with embossed title
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Foreign Advisor \u2014 Diplomatic Relations');

    // Win95 button helper (inline)
    const dBtn = (bx, by, bw, bh, label) => {
      ctx.fillStyle = '#c0c0c0'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by, 1, bh);
      ctx.fillStyle = '#808080'; ctx.fillRect(bx, by + bh - 1, bw, 1); ctx.fillRect(bx + bw - 1, by, 1, bh);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(bx + 1, by + 1, bw - 2, 1); ctx.fillRect(bx + 1, by + 1, 1, bh - 2);
      ctx.fillStyle = '#404040'; ctx.fillRect(bx + 1, by + bh - 2, bw - 2, 1); ctx.fillRect(bx + bw - 2, by + 1, 1, bh - 2);
      if (label) {
        ctx.font = FONT.TINY_BOLD; ctx.fillStyle = '#000000';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + bw / 2, by + bh / 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    };

    this._diplomacyScreenRects = [];

    if (others.length === 0) {
      ctx.font = FONT.BODY;
      ctx.textAlign = 'center';
      this._panelText(ctx, 'No other civilizations known.', px + PW / 2, py + 80);
      ctx.textAlign = 'left';
    }

    others.forEach((civ, i) => {
      const ry       = py + 36 + i * ROW_H;
      const rel      = gs.civs[0].relations.get(civ.id) ?? 'peace';
      const atWar    = rel === 'war';
      const civColor = CIV_COLORS[civ.data.color ?? 1] ?? '#888';
      const govtName = GOVERNMENTS[civ.government]?.name ?? '';
      const att      = gs.attitude(civ.id, 0); // AI's attitude toward player
      const hasEmb   = gs.civs[0].embassies.has(civ.id);

      // Row tint by relation
      const rowBg = rel === 'war'       ? '#c8b0b0'
                  : rel === 'ceasefire' ? '#d4c490'
                  : rel === 'alliance'  ? '#b0b0d8'
                  : (i % 2 === 0 ? '#8e8e8e' : '#878787');
      ctx.fillStyle = rowBg;
      ctx.fillRect(px + 8, ry, PW - 16, ROW_H - 4);
      // Sunken border
      ctx.fillStyle = '#606060'; ctx.fillRect(px + 8, ry, 1, ROW_H - 4); ctx.fillRect(px + 8, ry, PW - 16, 1);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(px + 8, ry + ROW_H - 5, PW - 16, 1); ctx.fillRect(px + 8 + PW - 16 - 1, ry, 1, ROW_H - 4);

      // Civ colour strip
      ctx.fillStyle = civColor;
      ctx.fillRect(px + 9, ry + 1, 5, ROW_H - 6);

      // Leader name + civ name
      ctx.font = FONT.BODY_BOLD; ctx.fillStyle = '#000000';
      ctx.fillText(`${civ.leaderNameOverride ?? civ.data.leader}  (${civ.data.plural})`, px + 22, ry + 16);

      // Government + advances + embassy badge
      ctx.font = FONT.TINY; ctx.fillStyle = '#333333';
      const embBadge = hasEmb ? '  📬 Embassy' : '';
      ctx.fillText(`${govtName}  ·  ${civ.advances.size} advances${embBadge}`, px + 22, ry + 29);

      // Relation badge
      ctx.font = FONT.TINY_BOLD;
      const relInfo = rel === 'war'       ? { text: '⚔ AT WAR',    color: '#880000' }
                    : rel === 'ceasefire' ? { text: '☆ CEASEFIRE', color: '#884400' }
                    : rel === 'alliance'  ? { text: '★ ALLIANCE',  color: '#000088' }
                    :                       { text: '☮ PEACE',     color: '#006600' };
      ctx.fillStyle = relInfo.color;
      ctx.fillText(relInfo.text, px + 22, ry + 43);

      // Attitude mini-bar (60px wide, centred on attitude value)
      const barX = px + 110, barY = ry + 37, barW = 60, barH = 6;
      ctx.fillStyle = '#555555'; ctx.fillRect(barX, barY, barW, barH);
      const fillW = Math.round(barW * (att + 100) / 200);
      ctx.fillStyle = att >= 0 ? '#44aa44' : '#aa4444';
      ctx.fillRect(barX, barY, fillW, barH);
      ctx.strokeStyle = '#333333'; ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.fillStyle = '#222222';
      ctx.font = FONT.TINY;
      ctx.textAlign = 'center';
      ctx.fillText(att > 0 ? `+${att}` : `${att}`, barX + barW / 2, barY - 1);
      ctx.textAlign = 'left';

      // Contact button (replaces old single action button)
      const BW = 80, BH = 22;
      const bx = px + PW - 16 - BW;
      const by = ry + Math.round((ROW_H - 4 - BH) / 2);
      dBtn(bx, by, BW, BH, 'Contact');

      this._diplomacyScreenRects.push({
        x: bx, y: by, w: BW, h: BH,
        civId: civ.id,
        action: 'contact',
      });
    });

    // Close button — Win95
    const closeY = py + PH - 38;
    dBtn(px + PW/2 - 40, closeY, 80, 26, 'Close');
    this._diplomacyScreenRects.push({ x: px + PW/2 - 40, y: closeY, w: 80, h: 26, action: 'close' });
  }

  MapRenderer.prototype._handleDiplomacyClick = function(px, py) {
    const hit = this._diplomacyScreenRects.find(
      r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
    );
    if (!hit) return;
    if (hit.action === 'close') { this._diplomacyScreen = false; return; }
    if (hit.action === 'contact') {
      const civ = this.gameState.civs[hit.civId];
      this._startHeraldVideo(hit.civId);
      this._negotiationScreen = {
        civId:        hit.civId,
        phase:        'greeting',
        response:     null,
        lastProposal: null,
        techTradeMode: false,
        myAdvId:      null,
        theirAdvId:   null,
        _leaderName:  civ?.leaderNameOverride ?? civ?.data?.leader ?? 'The Leader',
        _plural:      civ?.data?.plural ?? `Civ ${hit.civId}`,
        _rects:       [],
      };
    }
  }

  // ─── Negotiation screen overlay ────────────────────────────────────────────

  MapRenderer.prototype._drawNegotiationScreen = function(ctx, canvasW, canvasH) {
    const n   = this._negotiationScreen;
    const gs  = this.gameState;
    
    const civ = gs.civs[n.civId];
    if (!civ) return;

    const rel       = gs.civs[0].relations.get(n.civId) ?? 'peace';
    const att       = gs.attitude(n.civId, 0);
    const attLabel  = att >= 70 ? 'Worshipful' : att >= 40 ? 'Cordial' : att >= 10 ? 'Receptive'
                    : att >= -10 ? 'Neutral' : att >= -40 ? 'Uncooperative' : att >= -70 ? 'Icy' : 'Hostile';
    const civColor  = CIV_COLORS[civ.data?.color ?? 1] ?? '#888';

    const PW = 480, PH = 380;
    const HERALD_W = 190, HERALD_GAP = 8;
    const showHerald = this.gameState._graphicOptions?.diplomacyScreen !== false &&
      canvasW >= PW + HERALD_W + HERALD_GAP + 20;
    const totalW = PW + (showHerald ? HERALD_W + HERALD_GAP : 0);
    const px = Math.round((canvasW - totalW) / 2) + (showHerald ? HERALD_W + HERALD_GAP : 0);
    const py = Math.round((canvasH - PH) / 2);

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Civ2 wallpaper panel with embossed title
    this._drawCiv2Panel(ctx, px, py, PW, PH, `Negotiating with ${n._leaderName} of the ${n._plural}`);

    // Original animated MGE herald. Its tall 224x436 frame is kept beside the
    // negotiation controls rather than cropped into a modern portrait card.
    if (showHerald) {
      const hx = px - HERALD_W - HERALD_GAP;
      this._drawCiv2Panel(ctx, hx, py, HERALD_W, PH, `${civ.data?.adjective ?? ''} Herald`);
      const areaX = hx + 6, areaY = py + 23, areaW = HERALD_W - 12, areaH = PH - 29;
      ctx.fillStyle = '#000000';
      ctx.fillRect(areaX, areaY, areaW, areaH);
      const video = this._heraldVideo;
      const ready = video && video.readyState >= 2;
      if (ready) {
        const scale = Math.min(areaW / video.videoWidth, areaH / video.videoHeight);
        const vw = Math.round(video.videoWidth * scale);
        const vh = Math.round(video.videoHeight * scale);
        const vx = areaX + Math.round((areaW - vw) / 2);
        const vy = areaY + Math.round((areaH - vh) / 2);
        ctx.drawImage(video, vx, vy, vw, vh);
        this._heraldRenderState = { civId: n.civId, ready: true, x: vx, y: vy, width: vw, height: vh };
      } else {
        ctx.font = FONT.TINY;
        ctx.fillStyle = '#808080';
        ctx.textAlign = 'center';
        ctx.fillText('Calling herald...', areaX + areaW / 2, areaY + areaH / 2);
        ctx.textAlign = 'left';
        this._heraldRenderState = { civId: n.civId, ready: false, x: areaX, y: areaY, width: areaW, height: areaH };
      }
    } else {
      this._heraldRenderState = { civId: n.civId, ready: false, hiddenForViewport: true };
    }

    // Civ color strip + leader info header
    ctx.fillStyle = civColor;
    ctx.fillRect(px + 10, py + 32, 8, 60);
    ctx.font = FONT.LABEL_TIMES_ARIAL_BOLD; ctx.fillStyle = '#000000';
    ctx.fillText(`${n._leaderName}  (${n._plural})`, px + 26, py + 48);
    ctx.font = FONT.TINY; ctx.fillStyle = '#333333';
    const govtName = GOVERNMENTS[civ.government]?.name ?? '';
    ctx.fillText(`${govtName}  ·  Attitude: ${attLabel} (${att > 0 ? '+' : ''}${att})`, px + 26, py + 64);

    // Win95 button helper (inline)
    const dBtn = (bx, by, bw, bh, label, grayed = false) => {
      ctx.fillStyle = grayed ? '#aaaaaa' : '#c0c0c0'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = grayed ? '#888888' : '#ffffff'; ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by, 1, bh);
      ctx.fillStyle = '#808080'; ctx.fillRect(bx, by + bh - 1, bw, 1); ctx.fillRect(bx + bw - 1, by, 1, bh);
      ctx.fillStyle = grayed ? '#999999' : '#dfdfdf'; ctx.fillRect(bx + 1, by + 1, bw - 2, 1); ctx.fillRect(bx + 1, by + 1, 1, bh - 2);
      ctx.fillStyle = '#404040'; ctx.fillRect(bx + 1, by + bh - 2, bw - 2, 1); ctx.fillRect(bx + bw - 2, by + 1, 1, bh - 2);
      ctx.font = FONT.TINY_BOLD; ctx.fillStyle = grayed ? '#888888' : '#000000';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + bw / 2, by + bh / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    };

    n._rects = [];

    if (n.phase === 'response') {
      // Show response
      const isAccept = n.response === 'accept';
      ctx.font = FONT.LABEL_BOLD; ctx.fillStyle = isAccept ? '#005500' : '#880000';
      ctx.textAlign = 'center';
      const proposalNames = { ceasefire: 'a Ceasefire', peace: 'a Peace Treaty', alliance: 'an Alliance',
                              techTrade: 'the Technology Trade', tribute: 'your Tribute', shareMap: 'the Map Exchange' };
      const pName = proposalNames[n.lastProposal] ?? 'your proposal';
      const respText = isAccept ? `${n._leaderName} agrees to ${pName}.` : `${n._leaderName} rejects ${pName}.`;
      ctx.fillText(respText, px + PW / 2, py + 140);
      ctx.textAlign = 'left';

      // Continue button
      const cBtnX = px + PW / 2 - 50, cBtnY = py + PH - 60;
      dBtn(cBtnX, cBtnY, 100, 26, 'Continue');
      n._rects.push({ x: cBtnX, y: cBtnY, w: 100, h: 26, action: 'continue' });
    } else if (n.techTradeMode) {
      // Tech trade sub-panel
      ctx.font = FONT.SMALL_BOLD; ctx.fillStyle = '#000000';
      ctx.fillText('Our Offer:', px + 20, py + 110);
      ctx.fillText('Their Offer:', px + PW / 2 + 10, py + 110);

      const playerAdv = gs.civs[0].advances;
      const aiAdv     = civ.advances;
      const offerList   = [...playerAdv].filter(id => !aiAdv.has(id)).slice(0, 8);
      const requestList = [...aiAdv].filter(id => !playerAdv.has(id)).slice(0, 8);

      offerList.forEach((advId, i) => {
        const sel = n.myAdvId === advId;
        const bx = px + 10, by = py + 118 + i * 22;
        ctx.fillStyle = sel ? '#000080' : '#c8c8c8'; ctx.fillRect(bx, by, PW / 2 - 20, 20);
        ctx.font = FONT.TINY; ctx.fillStyle = sel ? '#ffffff' : '#000000';
        ctx.fillText(ADVANCES[advId]?.name ?? `Adv ${advId}`, bx + 4, by + 14);
        n._rects.push({ x: bx, y: by, w: PW / 2 - 20, h: 20, action: 'selectMyAdv', advId });
      });

      requestList.forEach((advId, i) => {
        const sel = n.theirAdvId === advId;
        const bx = px + PW / 2 + 10, by = py + 118 + i * 22;
        ctx.fillStyle = sel ? '#000080' : '#c8c8c8'; ctx.fillRect(bx, by, PW / 2 - 20, 20);
        ctx.font = FONT.TINY; ctx.fillStyle = sel ? '#ffffff' : '#000000';
        ctx.fillText(ADVANCES[advId]?.name ?? `Adv ${advId}`, bx + 4, by + 14);
        n._rects.push({ x: bx, y: by, w: PW / 2 - 20, h: 20, action: 'selectTheirAdv', advId });
      });

      const canTrade = n.myAdvId !== null && n.theirAdvId !== null;
      const propBtnX = px + PW / 2 - 70, propBtnY = py + PH - 80;
      dBtn(propBtnX, propBtnY, 140, 26, 'Propose Trade', !canTrade);
      if (canTrade) n._rects.push({ x: propBtnX, y: propBtnY, w: 140, h: 26, action: 'proposeTradeExec' });

      const backBtnX = px + PW / 2 - 30, backBtnY = py + PH - 48;
      dBtn(backBtnX, backBtnY, 60, 20, 'Back');
      n._rects.push({ x: backBtnX, y: backBtnY, w: 60, h: 20, action: 'techTradeBack' });
    } else {
      // Greeting phase — proposal buttons
      const proposals = [];
      const hasGold = gs.civs[0].gold >= 50;
      const hasEmb  = gs.civs[0].embassies.has(n.civId);
      const canTradeTech = hasEmb && [...civ.advances].some(id => !gs.civs[0].advances.has(id))
                        && [...gs.civs[0].advances].some(id => !civ.advances.has(id));

      if (rel === 'war')                       proposals.push({ label: 'Propose Ceasefire', action: 'ceasefire' });
      if (rel === 'war' || rel === 'ceasefire') proposals.push({ label: 'Propose Peace Treaty', action: 'peace' });
      if (rel === 'peace')                     proposals.push({ label: 'Propose Alliance', action: 'alliance' });
      proposals.push({ label: `Pay Tribute (50g)`, action: 'tribute', grayed: !hasGold });
      if (canTradeTech)                        proposals.push({ label: 'Trade Technology…', action: 'techTrade' });
      if (rel === 'peace' || rel === 'alliance') proposals.push({ label: 'Exchange Maps', action: 'shareMap' });

      const startY = py + 92;
      proposals.forEach((p, i) => {
        const bx = px + PW / 2 - 110, by = startY + i * 34;
        dBtn(bx, by, 220, 26, p.label, p.grayed ?? false);
        if (!p.grayed) n._rects.push({ x: bx, y: by, w: 220, h: 26, action: p.action });
      });
    }

    // Close button (always)
    const closeBtnX = px + PW - 80, closeBtnY = py + PH - 36;
    dBtn(closeBtnX, closeBtnY, 70, 26, 'Close');
    n._rects.push({ x: closeBtnX, y: closeBtnY, w: 70, h: 26, action: 'close' });
  }

  MapRenderer.prototype._handleNegotiationClick = function(px, py) {
    const n  = this._negotiationScreen;
    const gs = this.gameState;
    if (!n) return;

    const hit = n._rects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
    if (!hit) return;

    switch (hit.action) {
      case 'close':
        this._stopHeraldVideo();
        this._negotiationScreen = null;
        // Return to FA screen
        this._diplomacyScreen = true;
        break;
      case 'continue':
        n.phase = 'greeting';
        n.response = null;
        n.lastProposal = null;
        break;
      case 'techTradeBack':
        n.techTradeMode = false;
        n.myAdvId = null;
        n.theirAdvId = null;
        break;
      case 'selectMyAdv':
        n.myAdvId = hit.advId;
        break;
      case 'selectTheirAdv':
        n.theirAdvId = hit.advId;
        break;
      case 'techTrade':
        n.techTradeMode = true;
        n.myAdvId = null;
        n.theirAdvId = null;
        break;
      case 'proposeTradeExec': {
        const ok = gs.offerTechTrade(n.civId, n.myAdvId, n.theirAdvId);
        n.phase = 'response';
        n.response = ok ? 'accept' : 'reject';
        n.lastProposal = 'techTrade';
        n.techTradeMode = false;
        break;
      }
      case 'ceasefire': {
        const ok = gs.proposeCeasefire(n.civId);
        n.phase = 'response';
        n.response = ok ? 'accept' : 'reject';
        n.lastProposal = 'ceasefire';
        break;
      }
      case 'peace': {
        const ok = gs.proposePeace(n.civId);
        n.phase = 'response';
        n.response = ok ? 'accept' : 'reject';
        n.lastProposal = 'peace';
        break;
      }
      case 'alliance': {
        const ok = gs.proposeAlliance(n.civId);
        n.phase = 'response';
        n.response = ok ? 'accept' : 'reject';
        n.lastProposal = 'alliance';
        break;
      }
      case 'tribute': {
        const ok = gs.payTribute(n.civId, 50);
        n.phase = 'response';
        n.response = ok ? 'accept' : 'reject';
        n.lastProposal = 'tribute';
        break;
      }
      case 'shareMap': {
        gs.shareMap(n.civId);
        n.phase = 'response';
        n.response = 'accept';
        n.lastProposal = 'shareMap';
        break;
      }
    }
  }

  // ─── Government chooser overlay ────────────────────────────────────────────

  MapRenderer.prototype._drawGovtChooser = function(ctx, canvasW, canvasH) {
    const gs     = this.gameState;
    const govts  = gs.availableGovernments(0);
    const FA     = "'Tahoma','Arial','Arimo',sans-serif";

    const PW = Math.min(400, canvasW - 40);
    const PH = 90 + govts.length * 44 + 20;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Civ2 wallpaper panel with embossed title
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Choose New Government');

    // Subtitle message
    ctx.font = FONT.BODY_SMALL;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.fillText('The period of anarchy is over.', px + PW / 2, py + 44);
    ctx.fillText('Choose the form of government you wish to adopt.', px + PW / 2, py + 58);
    ctx.textAlign = 'left';

    this._govtChooserRects = [];
    govts.forEach((govt, i) => {
      const by = py + 72 + i * 44;
      const bx = px + 16;
      const bw = PW - 32;
      const bh = 36;

      // Button — Win95 style
      ctx.fillStyle = '#c0c0c0'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by, 1, bh);
      ctx.fillStyle = '#808080'; ctx.fillRect(bx, by + bh - 1, bw, 1); ctx.fillRect(bx + bw - 1, by, 1, bh);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(bx + 1, by + 1, bw - 2, 1); ctx.fillRect(bx + 1, by + 1, 1, bh - 2);
      ctx.fillStyle = '#404040'; ctx.fillRect(bx + 1, by + bh - 2, bw - 2, 1); ctx.fillRect(bx + bw - 2, by + 1, 1, bh - 2);

      ctx.font = FONT.LABEL_TIMES_ARIAL_BOLD;
      ctx.fillStyle = '#000000';
      ctx.fillText(govt.name, bx + 14, by + 23);

      ctx.font = FONT.TINY;
      ctx.fillStyle = '#444444';
      ctx.textAlign = 'right';
      ctx.fillText(`${govt.titleMale} / ${govt.titleFemale}`, bx + bw - 12, by + 23);
      ctx.textAlign = 'left';

      this._govtChooserRects.push({ x: bx, y: by, w: bw, h: bh, govtId: govt.id });
    });
  }

  MapRenderer.prototype._handleGovtChooserClick = function(px, py) {
    const hit = this._govtChooserRects.find(
      r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
    );
    if (!hit) return;
    this._govtChooser = false;
    this.gameState.setGovernment(hit.govtId);
  }

  // ─── City capture dialog ───────────────────────────────────────────────────

  MapRenderer.prototype._drawCaptureDialog = function(ctx, canvasW, canvasH) {
    const city = this._captureDialog.city;
    const FA   = "'Tahoma','Arial','Arimo',sans-serif";

    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const PW = 320, PH = 160;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Civ2 wallpaper panel with embossed title
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'City Captured!');

    // Body text
    ctx.font = FONT.BODY_SMALL;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.fillText(`Capture ${city.name} and add it to your empire`, px + PW / 2, py + 50);
    ctx.fillText('\u2014 or raze it to the ground?', px + PW / 2, py + 66);

    // Buttons
    const BW = 100, BH = 28;
    const bCaptX = px + 40, bRazeX = px + PW - 40 - BW;
    const bY = py + PH - 44;

    const drawBtn = (bx, by, label) => {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(bx, by, BW, BH);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, BW, 1); ctx.fillRect(bx, by, 1, BH);
      ctx.fillStyle = '#808080'; ctx.fillRect(bx, by + BH - 1, BW, 1); ctx.fillRect(bx + BW - 1, by, 1, BH);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(bx + 1, by + 1, BW - 2, 1); ctx.fillRect(bx + 1, by + 1, 1, BH - 2);
      ctx.fillStyle = '#404040'; ctx.fillRect(bx + 1, by + BH - 2, BW - 2, 1); ctx.fillRect(bx + BW - 2, by + 1, 1, BH - 2);
      ctx.font = FONT.SMALL_BOLD;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + BW / 2, by + BH / 2);
    };

    drawBtn(bCaptX, bY, 'Capture');
    drawBtn(bRazeX, bY, 'Raze');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Store rects for click handling
    this._captureDialog._captureRect = { x: bCaptX, y: bY, w: BW, h: BH };
    this._captureDialog._razeRect    = { x: bRazeX, y: bY, w: BW, h: BH };
  }

  MapRenderer.prototype._handleCaptureDialogClick = function(px, py, canvasW, canvasH) {
    const d = this._captureDialog;
    if (!d) return;
    if (d._captureRect && px >= d._captureRect.x && px < d._captureRect.x + d._captureRect.w &&
                          py >= d._captureRect.y && py < d._captureRect.y + d._captureRect.h) {
      this.gameState._captureCity(d.city, 0);
      this._captureDialog = null;
      return;
    }
    if (d._razeRect && px >= d._razeRect.x && px < d._razeRect.x + d._razeRect.w &&
                       py >= d._razeRect.y && py < d._razeRect.y + d._razeRect.h) {
      this.gameState.razeCity(d.city);
      this._captureDialog = null;
      return;
    }
  }

  // ─── Wonder Splash dialog ──────────────────────────────────────────────────

  MapRenderer.prototype._startWonderVideo = function(wonderId) {
    this._stopWonderVideo();
    const idx = String(wonderId - 39).padStart(2, '0');
    const src = assetUrl(`sprites/extracted/wonders/WONDER${idx}.webm`);
    const vid = document.createElement('video');
    vid.src = src;
    vid.muted = false;
    vid.playsInline = true;
    vid.style.display = 'none';
    document.body.appendChild(vid);
    vid.play().catch(() => {
      vid.muted = true;
      vid.play().catch(() => {});
    });
    vid.addEventListener('ended', () => {
      // Auto-dismiss when video ends
      if (this._wonderSplash) {
        this._stopWonderVideo();
        this._wonderSplash = null;
        if (this._pendingThroneUpgradeDialog) {
          this._pendingThroneUpgradeDialog = false;
          this._throneUpgradeDialog = true;
          this._throneUpgradeRects = [];
        }
      }
    });
    this._wonderVideo = vid;
  }

  MapRenderer.prototype._dismissWonderSplash = function() {
    this._stopWonderVideo();
    this._wonderSplash = null;
    if (this._pendingThroneUpgradeDialog) {
      this._pendingThroneUpgradeDialog = false;
      this._throneUpgradeDialog = true;
      this._throneUpgradeRects = [];
    }
  }

  MapRenderer.prototype._stopWonderVideo = function() {
    if (this._wonderVideo) {
      this._wonderVideo.pause();
      this._wonderVideo.remove();
      this._wonderVideo = null;
    }
  }

  MapRenderer.prototype._drawWonderSplash = function(ctx, canvasW, canvasH) {
    const { name, city } = this._wonderSplash;
    
    const FA = "'Tahoma','Arial','Arimo',sans-serif";

    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const vid = this._wonderVideo;
    const hasVideo = vid && vid.readyState >= 2; // HAVE_CURRENT_DATA

    // Video panel dimensions — scale to fit while preserving aspect ratio
    let vw, vh;
    if (hasVideo) {
      const aspect = vid.videoWidth / vid.videoHeight;
      const maxW = Math.min(canvasW - 80, 640);
      const maxH = Math.min(canvasH - 120, 480);
      if (maxW / aspect <= maxH) { vw = maxW; vh = Math.round(maxW / aspect); }
      else { vh = maxH; vw = Math.round(maxH * aspect); }
    } else {
      vw = 440; vh = 240;
    }

    const totalH = vh + 60; // video + text area below
    const px = Math.round((canvasW - vw) / 2);
    const py = Math.round((canvasH - totalH) / 2);

    if (hasVideo) {
      // Draw video frame onto canvas
      ctx.drawImage(vid, px, py, vw, vh);

      // Subtle gold border around video
      ctx.strokeStyle = '#dfbb3f';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 1, py - 1, vw + 2, vh + 2);
    } else {
      // Fallback: dark panel with loading indicator
      ctx.fillStyle = '#1a0a2a';
      ctx.fillRect(px, py, vw, vh);
      ctx.strokeStyle = '#dfbb3f';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, vw, vh);
      ctx.font = FONT.MENU;
      ctx.fillStyle = '#808080';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Loading...', px + vw / 2, py + vh / 2);
    }

    // Wonder name below video
    const textY = py + vh + 20;
    ctx.font = FONT.TITLE_XLARGE;
    ctx.fillStyle = '#dfbb3f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvasW / 2, textY);

    // "Completed in <city>"
    ctx.font = FONT.MENU_ITALIC;
    ctx.fillStyle = '#c0a0d0';
    ctx.fillText(`Completed in ${city}`, canvasW / 2, textY + 25);

    // "Click to continue"
    ctx.font = FONT.TINY;
    ctx.fillStyle = '#606060';
    ctx.fillText('Click to dismiss', canvasW / 2, py + vh + 55);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ─── High Council ──────────────────────────────────────────────────────────

  MapRenderer.prototype._startCouncilVideo = function() {
    this._stopCouncilVideo();
    // Pick era-appropriate council video: 0=Ancient, 1=Medieval, 2=Modern
    const gs = this.gameState;
    const year = gs.year ?? 0;
    const era = year >= 1500 ? 2 : year >= 500 ? 1 : 0;
    const src = assetUrl(`sprites/extracted/video/COUNCIL${era}.webm`);
    const vid = document.createElement('video');
    vid.src = src;
    vid.muted = false;
    vid.loop = true;
    vid.playsInline = true;
    vid.style.display = 'none';
    document.body.appendChild(vid);
    vid.play().catch(() => {
      vid.muted = true;
      vid.play().catch(() => {});
    });
    this._councilVideo = vid;
  }

  MapRenderer.prototype._stopCouncilVideo = function() {
    if (this._councilVideo) {
      this._councilVideo.pause();
      this._councilVideo.remove();
      this._councilVideo = null;
    }
  }

  MapRenderer.prototype._drawHighCouncil = function(ctx, canvasW, canvasH) {
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    

    // Full-screen dark background
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const vid = this._councilVideo;
    const hasVideo = vid && vid.readyState >= 2;

    // Scale video to fill most of the screen
    let vw, vh;
    if (hasVideo) {
      const aspect = vid.videoWidth / vid.videoHeight;
      const maxW = Math.min(canvasW - 40, 800);
      const maxH = Math.min(canvasH - 100, 600);
      if (maxW / aspect <= maxH) { vw = maxW; vh = Math.round(maxW / aspect); }
      else { vh = maxH; vw = Math.round(maxH * aspect); }
    } else {
      vw = 640; vh = 480;
    }

    const px = Math.round((canvasW - vw) / 2);
    const py = Math.round((canvasH - vh - 40) / 2);

    if (hasVideo) {
      ctx.drawImage(vid, px, py, vw, vh);
      ctx.strokeStyle = '#8a6a1f';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 1, py - 1, vw + 2, vh + 2);
    } else {
      ctx.fillStyle = '#1a0a1a';
      ctx.fillRect(px, py, vw, vh);
      ctx.strokeStyle = '#8a6a1f';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, vw, vh);
      ctx.font = FONT.MENU;
      ctx.fillStyle = '#808080';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Loading council...', px + vw / 2, py + vh / 2);
    }

    // Title bar
    ctx.font = FONT.STATUS;
    ctx.fillStyle = '#dfbb3f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const gs = this.gameState;
    const year = gs.year ?? 0;
    const eraName = year >= 1500 ? 'Modern' : year >= 500 ? 'Medieval' : 'Ancient';
    ctx.fillText(`High Council — ${eraName} Era`, canvasW / 2, py + vh + 20);

    // Dismiss hint
    ctx.font = FONT.TINY;
    ctx.fillStyle = '#606060';
    ctx.fillText('Click or press ESC to dismiss', canvasW / 2, py + vh + 38);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ─── Trade Arrival dialog ──────────────────────────────────────────────────

  MapRenderer.prototype._drawTradeDialog = function(ctx, canvasW, canvasH) {
    const d  = this._tradeDialog;
    if (!d) return;
    const gs = this.gameState;
    const FA = "'Tahoma','Arial','Arimo',sans-serif";

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const isForeign = d.city.civId !== d.unit.civId;
    const isWonder  = !isForeign && d.city.production?.type === 'improvement' &&
                      IMPROVEMENTS[d.city.production.id]?.isWonder;

    const PW = 360, PH = isForeign ? 160 : (isWonder ? 160 : 120);
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Civ2 wallpaper panel with embossed title
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Trade Arrival');
    const TH = 28;

    // Body
    ctx.font = FONT.BODY_SMALL;
    ctx.fillStyle = '#000000';

    const BW = 110, BH = 28;
    const bY = py + PH - 44;

    const drawBtn = (bx, by, label) => {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(bx, by, BW, BH);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, BW, 1); ctx.fillRect(bx, by, 1, BH);
      ctx.fillStyle = '#808080'; ctx.fillRect(bx, by + BH - 1, BW, 1); ctx.fillRect(bx + BW - 1, by, 1, BH);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(bx + 1, by + 1, BW - 2, 1); ctx.fillRect(bx + 1, by + 1, 1, BH - 2);
      ctx.fillStyle = '#404040'; ctx.fillRect(bx + 1, by + BH - 2, BW - 2, 1); ctx.fillRect(bx + BW - 2, by + 1, 1, BH - 2);
      ctx.font = FONT.SMALL_BOLD;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + BW / 2, by + BH / 2);
    };

    if (isForeign) {
      // Calculate reward preview
      const homeCity = gs.cities.find(c => c.civId === d.unit.civId);
      const dist = homeCity ? Math.abs(d.city.col - homeCity.col) + Math.abs(d.city.row - homeCity.row) : 10;
      const baseMult = UNITS[d.unit.typeId].id === 49 ? 1.5 : 1.0;
      const gold = Math.floor((dist * 2 + 50) * baseMult);
      const sci  = Math.floor((dist + 25) * baseMult);

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.font = FONT.BODY_SMALL;
      ctx.fillText(`Deliver goods to ${d.city.name}?`, px + PW / 2, py + TH + 28);
      ctx.fillText(`+${gold} gold, +${sci} science`, px + PW / 2, py + TH + 44);

      const bDeliverX = px + 40, bCancelX = px + PW - 40 - BW;
      drawBtn(bDeliverX, bY, 'Deliver');
      drawBtn(bCancelX, bY, 'Cancel');
      d._deliverRect = { x: bDeliverX, y: bY, w: BW, h: BH };
      d._cancelRect  = { x: bCancelX,  y: bY, w: BW, h: BH };
      d._wonderRect  = null;
    } else if (isWonder) {
      const imp = IMPROVEMENTS[d.city.production.id];
      const contrib = UNITS[d.unit.typeId].cost * 10;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.font = FONT.BODY_SMALL;
      ctx.fillText(`Contribute to ${imp.name}?`, px + PW / 2, py + TH + 28);
      ctx.fillText(`+${contrib} shields`, px + PW / 2, py + TH + 44);

      const bContribX = px + 40, bCancelX = px + PW - 40 - BW;
      drawBtn(bContribX, bY, 'Contribute');
      drawBtn(bCancelX, bY, 'Cancel');
      d._wonderRect  = { x: bContribX, y: bY, w: BW, h: BH };
      d._cancelRect  = { x: bCancelX,  y: bY, w: BW, h: BH };
      d._deliverRect = null;
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  MapRenderer.prototype._handleTradeDialogClick = function(px, py) {
    const d = this._tradeDialog;
    if (!d) return;
    const gs = this.gameState;
    if (d._deliverRect && px >= d._deliverRect.x && px < d._deliverRect.x + d._deliverRect.w &&
                           py >= d._deliverRect.y && py < d._deliverRect.y + d._deliverRect.h) {
      gs.deliverTrade(d.unit, d.city);
      this._tradeDialog = null;
      return;
    }
    if (d._wonderRect && px >= d._wonderRect.x && px < d._wonderRect.x + d._wonderRect.w &&
                          py >= d._wonderRect.y && py < d._wonderRect.y + d._wonderRect.h) {
      gs.contributeToWonder(d.unit, d.city);
      this._tradeDialog = null;
      return;
    }
    if (d._cancelRect && px >= d._cancelRect.x && px < d._cancelRect.x + d._cancelRect.w &&
                          py >= d._cancelRect.y && py < d._cancelRect.y + d._cancelRect.h) {
      this._tradeDialog = null;
      return;
    }
  }

  // ─── Diplomat/Spy Action dialog ───────────────────────────────────────────

  MapRenderer.prototype._drawDiplomatDialog = function(ctx, canvasW, canvasH) {
    const d  = this._diplomatDialog;
    if (!d) return;
    const gs = this.gameState;
    const FA = "'Tahoma','Arial','Arimo',sans-serif";

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const hasCapital = d.city.improvements.has(1);
    const isSpy = UNITS[d.unit.typeId]?.id === 47;
    let numBtns = 4;  // Embassy, Steal, Investigate, Cancel (base)
    if (!hasCapital) numBtns++;  // Incite
    numBtns++;  // Sabotage Production
    if (isSpy) numBtns++;  // Poison Water
    if (isSpy && gs._manhattanBuilt) numBtns++;  // Plant Nuke
    const PW = 340, PH = 80 + numBtns * 34;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Civ2 wallpaper panel with embossed title
    const unitName = UNITS[d.unit.typeId]?.name ?? 'Diplomat';
    this._drawCiv2Panel(ctx, px, py, PW, PH, `${unitName} at ${d.city.name}`);
    const TH = 28;

    // Body text
    ctx.font = FONT.BODY_SMALL;
    ctx.fillStyle = '#000000';
    const civName = gs.civs[d.city.civId]?.data?.adjective ?? 'enemy';
    ctx.fillText(`Choose an action in ${civName} territory:`, px + PW / 2, py + TH + 20);

    // Buttons
    const BW = 200, BH = 28;
    const bx = px + (PW - BW) / 2;
    let by = py + TH + 34;

    const drawBtn = (bx2, by2, label) => {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(bx2, by2, BW, BH);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx2, by2, BW, 1); ctx.fillRect(bx2, by2, 1, BH);
      ctx.fillStyle = '#808080'; ctx.fillRect(bx2, by2 + BH - 1, BW, 1); ctx.fillRect(bx2 + BW - 1, by2, 1, BH);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(bx2 + 1, by2 + 1, BW - 2, 1); ctx.fillRect(bx2 + 1, by2 + 1, 1, BH - 2);
      ctx.fillStyle = '#404040'; ctx.fillRect(bx2 + 1, by2 + BH - 2, BW - 2, 1); ctx.fillRect(bx2 + BW - 2, by2 + 1, 1, BH - 2);
      ctx.font = FONT.SMALL_BOLD;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx2 + BW / 2, by2 + BH / 2);
    };

    d._rects = [];

    drawBtn(bx, by, 'Establish Embassy');
    d._rects.push({ x: bx, y: by, w: BW, h: BH, action: 'embassy' });
    by += 34;

    drawBtn(bx, by, 'Investigate City');
    d._rects.push({ x: bx, y: by, w: BW, h: BH, action: 'investigate' });
    by += 34;

    drawBtn(bx, by, 'Steal Technology');
    d._rects.push({ x: bx, y: by, w: BW, h: BH, action: 'stealTech' });
    by += 34;

    drawBtn(bx, by, 'Sabotage Production');
    d._rects.push({ x: bx, y: by, w: BW, h: BH, action: 'sabotage' });
    by += 34;

    if (!hasCapital) {
      const cost = gs.inciteRevoltCost(d.city);
      drawBtn(bx, by, `Incite Revolt (${cost} gold)`);
      d._rects.push({ x: bx, y: by, w: BW, h: BH, action: 'incite' });
      by += 34;
    }

    if (isSpy) {
      drawBtn(bx, by, 'Poison Water Supply');
      d._rects.push({ x: bx, y: by, w: BW, h: BH, action: 'poisonWater' });
      by += 34;
    }

    if (isSpy && gs._manhattanBuilt) {
      drawBtn(bx, by, 'Plant Nuclear Device');
      d._rects.push({ x: bx, y: by, w: BW, h: BH, action: 'plantNuke' });
      by += 34;
    }

    drawBtn(bx, by, 'Cancel');
    d._rects.push({ x: bx, y: by, w: BW, h: BH, action: 'cancel' });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  MapRenderer.prototype._handleDiplomatDialogClick = function(px, py) {
    const d = this._diplomatDialog;
    if (!d || !d._rects) return;
    const gs = this.gameState;

    const hit = d._rects.find(
      r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
    );
    if (!hit) return;

    switch (hit.action) {
      case 'embassy':
        gs.establishEmbassy(d.unit, d.city);
        break;
      case 'investigate':
        gs.investigateCity(d.unit, d.city);
        break;
      case 'stealTech':
        gs.stealAdvance(d.unit, d.city);
        break;
      case 'sabotage':
        gs.sabotageProduction(d.unit, d.city);
        break;
      case 'incite':
        gs.inciteRevolt(d.unit, d.city);
        break;
      case 'poisonWater':
        gs.poisonWater(d.unit, d.city);
        break;
      case 'plantNuke':
        gs.plantNuke(d.unit, d.city);
        break;
      case 'cancel':
        break;
    }
    this._diplomatDialog = null;
  }

  // ─── AI Peace Proposal dialog ──────────────────────────────────────────────

  MapRenderer.prototype._drawAiPeaceDialog = function(ctx, canvasW, canvasH) {
    const d  = this._aiPeaceProposal;
    const FA = "'Tahoma','Arial','Arimo',sans-serif";

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const PW = 320, PH = 150;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Civ2 wallpaper panel with embossed title
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Incoming Proposal');
    const TH = 28;

    // Body
    ctx.font = FONT.BODY_SMALL;
    ctx.fillStyle = '#000000';
    ctx.fillText(`${d.leaderName} of the ${d.plural}`, px + PW / 2, py + TH + 26);
    const proposalLabel = d.proposalType === 'ceasefire' ? 'proposes a Ceasefire.' : 'proposes a Peace Treaty.';
    ctx.fillText(proposalLabel, px + PW / 2, py + TH + 42);

    // Buttons
    const BW = 100, BH = 28;
    const bAccX = px + 40, bRejX = px + PW - 40 - BW;
    const bY = py + PH - 44;

    const drawBtn = (bx, by, label) => {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(bx, by, BW, BH);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, BW, 1); ctx.fillRect(bx, by, 1, BH);
      ctx.fillStyle = '#808080'; ctx.fillRect(bx, by + BH - 1, BW, 1); ctx.fillRect(bx + BW - 1, by, 1, BH);
      ctx.fillStyle = '#dfdfdf'; ctx.fillRect(bx + 1, by + 1, BW - 2, 1); ctx.fillRect(bx + 1, by + 1, 1, BH - 2);
      ctx.fillStyle = '#404040'; ctx.fillRect(bx + 1, by + BH - 2, BW - 2, 1); ctx.fillRect(bx + BW - 2, by + 1, 1, BH - 2);
      ctx.font = FONT.SMALL_BOLD;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + BW / 2, by + BH / 2);
    };

    drawBtn(bAccX, bY, 'Accept');
    drawBtn(bRejX, bY, 'Reject');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    d._acceptRect = { x: bAccX, y: bY, w: BW, h: BH };
    d._rejectRect = { x: bRejX, y: bY, w: BW, h: BH };
  }

  MapRenderer.prototype._handleAiPeaceDialogClick = function(px, py, canvasW, canvasH) {
    const d = this._aiPeaceProposal;
    if (!d) return;
    if (d._acceptRect && px >= d._acceptRect.x && px < d._acceptRect.x + d._acceptRect.w &&
                         py >= d._acceptRect.y && py < d._acceptRect.y + d._acceptRect.h) {
      const gs = this.gameState;
      if (d.proposalType === 'ceasefire') {
        // AI proposed ceasefire — apply directly (player accepts)
        gs.civs[0].relations.set(d.fromCivId, 'ceasefire');
        gs.civs[d.fromCivId]?.relations.set(0, 'ceasefire');
        gs.adjustAttitude(0, d.fromCivId, 15);
        gs._addLog(`Ceasefire agreed with the ${d.plural}.`);
        gs._emit('pos', {});
      } else {
        // AI proposed peace — apply via proposePeace but bypass AI evaluation (AI already agreed)
        gs.civs[0].relations.set(d.fromCivId, 'peace');
        gs.civs[d.fromCivId]?.relations.set(0, 'peace');
        const wk = `${Math.min(0, d.fromCivId)}_${Math.max(0, d.fromCivId)}`;
        gs._warSinceTurn.delete(wk);
        gs.adjustAttitude(0, d.fromCivId, 20);
        gs._addLog(`Peace agreed with the ${d.plural}.`);
        gs._emit('pos', {});
      }
      this._aiPeaceProposal = null;
      return;
    }
    if (d._rejectRect && px >= d._rejectRect.x && px < d._rejectRect.x + d._rejectRect.w &&
                         py >= d._rejectRect.y && py < d._rejectRect.y + d._rejectRect.h) {
      this._aiPeaceProposal = null;
      return;
    }
  }

  // ─── Go To mode cursor overlay ─────────────────────────────────────────────

  MapRenderer.prototype._drawGotoModeCursor = function(ctx, canvasW, canvasH) {
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    // Draw a translucent banner at the top of the map area
    ctx.fillStyle = 'rgba(0,0,192,0.7)';
    ctx.fillRect(0, TOP_H, canvasW - SB_W, 22);
    ctx.font = FONT.SMALL_BOLD;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Go To: Click a destination tile  (ESC to cancel)', (canvasW - SB_W) / 2, TOP_H + 11);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  MapRenderer.prototype._drawParadropOverlay = function(ctx, canvasW, canvasH) {
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    // Banner
    ctx.fillStyle = 'rgba(128,0,0,0.8)';
    ctx.fillRect(0, TOP_H, canvasW - SB_W, 22);
    ctx.font = FONT.SMALL_BOLD;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Paradrop: Click a drop zone  (ESC to cancel)', (canvasW - SB_W) / 2, TOP_H + 11);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Highlight valid drop tiles with a semi-transparent green diamond
    ctx.fillStyle = 'rgba(0, 200, 80, 0.25)';
    ctx.strokeStyle = 'rgba(0, 200, 80, 0.7)';
    ctx.lineWidth = 1;
    for (const { col, row } of this._paradropTiles) {
      const { x, y } = tileToScreen(col, row, this.viewX, this.viewY);
      if (x < -TILE_W_S || x > canvasW || y < -TILE_H_S || y > canvasH) continue;
      const W = TILE_W_S, H = TILE_H_S;
      ctx.beginPath();
      ctx.moveTo(x + W / 2, y);
      ctx.lineTo(x + W, y + H / 2);
      ctx.lineTo(x + W / 2, y + H);
      ctx.lineTo(x, y + H / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  MapRenderer.prototype._drawResearchChooser = function(ctx, canvasW, canvasH) {
    const gs    = this.gameState;
    const civ   = gs.civs[0];
    const available = gs.availableAdvances(0);
    const goalIds = this._researchGoalCandidates;
    const avail = Array.isArray(goalIds)
      ? available.filter(a => goalIds.includes(a.id))
      : available;

    const scienceEpoch = Math.max(0, ...[...civ.advances].map(id => ADVANCES[id]?.epoch ?? 0));
    const title = goalIds
      ? 'Then we should research'
      : `What discovery shall our ${scienceEpoch >= 3 ? 'scientists' : 'wise men'} pursue?`;

    // Game.txt @RESEARCH requests a 300px-wide listbox, but Civ2's dynamic
    // dialog sizing treats that as a minimum and widens the panel when its
    // Times New Roman heading is longer. Keep the title inside the bevel while
    // preserving the compact 300px panel for shorter headings.
    ctx.save();
    ctx.font = FONT.TITLE_LARGE;
    const titleWidth = Math.ceil(ctx.measureText(title).width) + 18;
    ctx.restore();
    const PW   = Math.min(Math.max(300, titleWidth), canvasW - 20);
    const rowsVis = Math.max(1, Math.min(16, avail.length));
    const ITEM_H = 23;
    const HDR = 34;
    const FOOTER_H = 31;
    const PH   = HDR + rowsVis * ITEM_H + FOOTER_H + 6;
    const px   = Math.round((canvasW - PW) / 2);
    const py   = Math.round((canvasH - PH) / 2);
    this._researchChooserRect = { x: px, y: py, w: PW, h: PH };

    this._drawCiv2Panel(ctx, px, py, PW, PH, title);

    const listY0 = py + HDR;
    const listH = rowsVis * ITEM_H;

    const scroll = Math.max(0, Math.min(this._researchChooserScroll, Math.max(0, avail.length - rowsVis)));
    this._researchChooserScroll = scroll;
    this._researchChooserRects  = [];
    if (!avail.some(a => a.id === this._researchChooserSelectedId)) {
      this._researchChooserSelectedId = avail[0]?.id ?? null;
    }

    // Clip items to list area
    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 5, listY0, PW - 10, listH);
    ctx.clip();

    for (let i = 0; i < rowsVis && (i + scroll) < avail.length; i++) {
      const adv = avail[i + scroll];
      const iy  = listY0 + i * ITEM_H;
      const isSelected = this._researchChooserSelectedId === adv.id;
      ctx.fillStyle = isSelected ? '#000080' : '#878787';
      ctx.fillRect(px + 6, iy, PW - 12, ITEM_H - 1);

      // Advance category icon from ICONS.GIF — axx0: x=343+cat*37, y=211+epoch*21, 36×20
      // Epoch=row (0-3), KnowledgeCategory=col (0-4)
       try {
         const srcX = 343 + (adv.cat ?? 0) * 37;
         const srcY = 211 + (adv.epoch ?? 0) * 21;
         const iconSpr = this.sprites.getRegionSprite('icons', srcX, srcY, 36, 20);
         if (iconSpr) ctx.drawImage(iconSpr, px + 8, iy + 1, 36, 20);
       } catch (e) {
         console.warn('[DialogsMixin] Advance icon sprite unavailable:', e.message);
         // Fallback: colored square
         ctx.fillStyle = '#555555';
         ctx.fillRect(px + 8, iy + 1, 36, 20);
       }

      ctx.font = FONT.BODY_TIMES;
      ctx.fillStyle = isSelected ? '#ffffff' : '#000000';
      ctx.fillText(adv.name, px + 49, iy + 16);

      this._researchChooserRects.push({ x: px + 6, y: iy, w: PW - 12, h: ITEM_H - 1, advId: adv.id });
    }

    ctx.restore();

    // In normal play this list never exceeds the original 16-row capacity.
    if (avail.length > rowsVis) {
      this._drawScrollbar(ctx, px + PW - 19, listY0, listH, scroll, Math.max(1, avail.length - rowsVis));
    }

    // The parser adds OK after the custom buttons declared in Game.txt.
    const btnLabels = goalIds ? ['Help', 'OK'] : ['Help', 'Goal', 'OK'];
    const gap = 4;
    const btnW = Math.floor((PW - 12 - gap * (btnLabels.length - 1)) / btnLabels.length);
    const btnH = 25;
    const btnY = py + PH - btnH - 4;
    for (let b = 0; b < btnLabels.length; b++) {
      const bx = px + 6 + b * (btnW + gap);
      this._drawWin95Button(ctx, bx, btnY, btnW, btnH, btnLabels[b], "'Times New Roman','Tinos',serif");
      const specialId = btnLabels[b] === 'Help' ? -3 : btnLabels[b] === 'Goal' ? -2 : -1;
      this._researchChooserRects.push({ x: bx, y: btnY, w: btnW, h: btnH, advId: specialId });
    }
  }

  // ─── Full Tech List (Goal Dialog) ──────────────────────────────────────────
  // "Which advance are you trying to discover?" — 2-column layout, all advances
  // Matches original Civ2 MGE screenshot (17.07.41)

  MapRenderer.prototype._drawResearchGoal = function(ctx, canvasW, canvasH) {
    const gs    = this.gameState;
    const civ   = gs.civs[0];
    const allAdv = ADVANCES.filter(a => a.id >= 0 && a.id <= 89 && !civ.advances.has(a.id));
    allAdv.sort((a, b) => a.name.localeCompare(b.name));

    // Game.txt @RESEARCHGOAL: width=480, listbox=10, Help.
    const PW   = Math.min(480, canvasW - 20);
    const ITEM_H = 23;
    const rowsVis = Math.min(10, Math.max(1, allAdv.length));
    const HDR = 34;
    const PH   = HDR + rowsVis * ITEM_H + 37;
    const px   = Math.round((canvasW - PW) / 2);
    const py   = Math.round((canvasH - PH) / 2);
    this._researchGoalRect = { x: px, y: py, w: PW, h: PH };

    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Which advance are you trying to discover?');

    const listY0 = py + HDR;
    const listH = rowsVis * ITEM_H;
    const scroll = Math.max(0, Math.min(this._researchGoalScroll ?? 0, Math.max(0, allAdv.length - rowsVis)));
    this._researchGoalScroll = scroll;
    this._researchGoalRects  = [];
    if (!allAdv.some(a => a.id === this._researchGoalSelectedId)) {
      this._researchGoalSelectedId = allAdv[0]?.id ?? null;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 5, listY0, PW - 10, listH);
    ctx.clip();

    const visible = allAdv.slice(scroll, scroll + rowsVis);
    for (let i = 0; i < visible.length; i++) {
      const adv  = visible[i];
      const ix   = px + 6;
      const iy   = listY0 + i * ITEM_H;

      const isSelected = this._researchGoalSelectedId === adv.id;
      ctx.fillStyle = isSelected ? '#000080' : '#878787';
      ctx.fillRect(ix, iy, PW - 12, ITEM_H - 1);

       // Advance category icon from ICONS.GIF
       try {
         const srcX = 343 + (adv.cat ?? 0) * 37;
         const srcY = 211 + (adv.epoch ?? 0) * 21;
         const iconSpr = this.sprites.getRegionSprite('icons', srcX, srcY, 36, 20);
         if (iconSpr) ctx.drawImage(iconSpr, ix + 2, iy + 1, 36, 20);
       } catch (e) {
         console.warn('[DialogsMixin] Research goal icon sprite unavailable:', e.message);
         ctx.fillStyle = '#555';
         ctx.fillRect(ix + 2, iy + 1, 36, 20);
       }

      ctx.font = FONT.BODY_TIMES;
      ctx.fillStyle = isSelected ? '#fff' : '#000';
      ctx.fillText(adv.name, ix + 43, iy + 16);

      this._researchGoalRects.push({ x: ix, y: iy, w: PW - 12, h: ITEM_H - 1, advId: adv.id });
    }

    ctx.restore();

    // Scrollbar
    if (allAdv.length > rowsVis) {
      this._drawScrollbar(ctx, px + PW - 19, listY0, listH, scroll, Math.max(1, allAdv.length - rowsVis));
    }

    const btnY2 = py + PH - 29;
    const gap = 4;
    const bw = Math.floor((PW - 12 - gap) / 2);
    this._drawWin95Button(ctx, px + 6, btnY2, bw, 25, 'Help', "'Times New Roman','Tinos',serif");
    this._drawWin95Button(ctx, px + 10 + bw, btnY2, bw, 25, 'OK', "'Times New Roman','Tinos',serif");
    this._researchGoalRects.push({ x: px + 6, y: btnY2, w: bw, h: 25, advId: -3 });
    this._researchGoalRects.push({ x: px + 10 + bw, y: btnY2, w: bw, h: 25, advId: -1 });
  }

  // ─── Advance Discovery Popup ────────────────────────────────────────────────
  // "Civilization Advances: English wise men discover the secret of Alphabet."
  // Matches original Civ2 MGE tech discovery dialog (screenshot 17.08.16)

  MapRenderer.prototype._drawAdvancePopup = function(ctx, canvasW, canvasH) {
    const pop = this._advancePopup;
    if (!pop) return;

    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    

    const PW = 340, PH = 120;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Civ2 wallpaper panel with embossed title
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Civilization Advance');

    // Tech category icon from ICONS.GIF — axx0: x=343+cat*37, y=211+epoch*21, 36×20
    const adv = ADVANCES[pop.advId];
    const iconX = px + 14, iconY = py + 30;
     try {
       const srcX = 343 + ((adv?.cat ?? 0)) * 37;
       const srcY = 211 + ((adv?.epoch ?? 0)) * 21;
       const iconSpr = this.sprites.getRegionSprite('icons', srcX, srcY, 36, 20);
       if (iconSpr) ctx.drawImage(iconSpr, iconX, iconY, 40, 40);
     } catch (e) {
       console.warn('[DialogsMixin] Discovery popup icon sprite unavailable:', e.message);
       const CAT_COLORS = ['#8a3030', '#306a30', '#204080', '#606000', '#806020'];
       ctx.fillStyle = adv ? (CAT_COLORS[adv.cat] ?? '#444444') : '#444444';
       ctx.fillRect(iconX, iconY, 40, 40);
     }

    // Discovery text: "English wise men discover the secret of Alphabet."
    ctx.font = FONT.BODY;
    const text = `${pop.civAdj} wise men discover the secret of ${pop.advName}.`;
    // Word wrap
    const maxW = PW - 74;
    const words = text.split(' ');
    let line = '', lineY = py + 42;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW) {
        this._panelText(ctx, line, px + 64, lineY);
        line = word;
        lineY += 16;
      } else {
        line = test;
      }
    }
    if (line) this._panelText(ctx, line, px + 64, lineY);

    // OK button
    this._drawWin95Button(ctx, px + PW / 2 - 40, py + PH - 34, 80, 24, 'OK', FT);
  }

  // ─── City Naming Dialog ──────────────────────────────────────────────────────
  // Original Civ2: "What Shall We Name This City?" with text input + OK/Cancel

  MapRenderer.prototype._openCityNamingDialog = function(unit) {
    const gs = this.gameState;
    if (!gs.canFoundCity(unit)) {
      gs.log.unshift('Cannot found a city here.');
      if (gs.log.length > 8) gs.log.length = 8;
      this._play(SFX.neg);
      return;
    }
    const name = gs.suggestCityName(unit.civId);
    this._cityNamingDialog = {
      unit,
      name,
      cursor: name.length,
    };
  }

  MapRenderer.prototype._openCityRenameDialog = function(city) {
    this._cityNamingDialog = {
      city,
      name: city.name,
      cursor: city.name.length,
    };
  }

  MapRenderer.prototype._drawCityNamingDialog = function(ctx, canvasW, canvasH) {
    const d = this._cityNamingDialog;
    if (!d) return;
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    const PW = 300, PH = 100;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    const renaming = !!d.city;
    const { iy, iw, ih } = this._drawCiv2Panel(ctx, px, py, PW, PH,
      renaming ? 'What Shall We Rename This City?' : 'What Shall We Name This City?');
    const ix = px + 11;

    // Label
    ctx.font = FONT.TINY;
    ctx.textAlign = 'left';
    this._panelText(ctx, renaming ? 'New City Name:' : 'City Name:', ix + 4, iy + 16);

    // Text input field (sunken white box)
    const labelW = renaming ? 95 : 70;
    const inputX = ix + labelW, inputY = iy + 4, inputW = iw - labelW - 4, inputH = 18;
    ctx.fillStyle = '#404040'; ctx.fillRect(inputX, inputY, inputW, 1); ctx.fillRect(inputX, inputY, 1, inputH);
    ctx.fillStyle = '#dfdfdf'; ctx.fillRect(inputX, inputY + inputH, inputW + 1, 1); ctx.fillRect(inputX + inputW, inputY, 1, inputH + 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(inputX + 1, inputY + 1, inputW - 1, inputH - 1);

    // Text content
    ctx.font = FONT.BODY_SMALL;
    ctx.fillStyle = '#000000';
    ctx.save();
    ctx.beginPath();
    ctx.rect(inputX + 2, inputY + 1, inputW - 4, inputH - 2);
    ctx.clip();
    ctx.fillText(d.name, inputX + 3, inputY + 13);

    // Cursor (blinking)
    const now = Date.now();
    if (Math.floor(now / 500) % 2 === 0) {
      const cursorX = inputX + 3 + ctx.measureText(d.name.slice(0, d.cursor)).width;
      ctx.fillStyle = '#000000';
      ctx.fillRect(cursorX, inputY + 3, 1, inputH - 5);
    }
    ctx.restore();

    // OK and Cancel buttons
    const btnW = 80, btnH = 22;
    const btnY = iy + ih - btnH - 4;
    const okX = px + PW / 2 - btnW - 8;
    const cancelX = px + PW / 2 + 8;
    this._drawWin95Button(ctx, okX, btnY, btnW, btnH, 'OK');
    this._drawWin95Button(ctx, cancelX, btnY, btnW, btnH, 'Cancel');

    // Store rects for click handling
    d._okRect = { x: okX, y: btnY, w: btnW, h: btnH };
    d._cancelRect = { x: cancelX, y: btnY, w: btnW, h: btnH };
    d._inputRect = { x: inputX, y: inputY, w: inputW, h: inputH };
  }

  MapRenderer.prototype._handleCityNamingKey = function(e) {
    const d = this._cityNamingDialog;
    if (!d) return;

    if (e.key === 'Escape') {
      this._cityNamingDialog = null;
      return;
    }
    if (e.key === 'Enter') {
      this._confirmCityNaming();
      return;
    }
    if (e.key === 'Backspace') {
      if (d.cursor > 0) {
        d.name = d.name.slice(0, d.cursor - 1) + d.name.slice(d.cursor);
        d.cursor--;
      }
      return;
    }
    if (e.key === 'Delete') {
      if (d.cursor < d.name.length) {
        d.name = d.name.slice(0, d.cursor) + d.name.slice(d.cursor + 1);
      }
      return;
    }
    if (e.key === 'ArrowLeft') { d.cursor = Math.max(0, d.cursor - 1); return; }
    if (e.key === 'ArrowRight') { d.cursor = Math.min(d.name.length, d.cursor + 1); return; }
    if (e.key === 'Home') { d.cursor = 0; return; }
    if (e.key === 'End') { d.cursor = d.name.length; return; }

    // Ctrl+A → select all (clear and retype)
    if (e.ctrlKey && e.key === 'a') { d.cursor = d.name.length; return; }

    // Printable character
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      if (d.name.length < 30) {
        d.name = d.name.slice(0, d.cursor) + e.key + d.name.slice(d.cursor);
        d.cursor++;
      }
    }
  }

  MapRenderer.prototype._handleCityNamingClick = function(px, py, canvasW, canvasH) {
    const d = this._cityNamingDialog;
    if (!d) return;
    if (d._okRect && px >= d._okRect.x && px < d._okRect.x + d._okRect.w &&
        py >= d._okRect.y && py < d._okRect.y + d._okRect.h) {
      this._confirmCityNaming();
      return;
    }
    if (d._cancelRect && px >= d._cancelRect.x && px < d._cancelRect.x + d._cancelRect.w &&
        py >= d._cancelRect.y && py < d._cancelRect.y + d._cancelRect.h) {
      this._cityNamingDialog = null;
      return;
    }
  }

  MapRenderer.prototype._confirmCityNaming = function() {
    const d = this._cityNamingDialog;
    if (!d) return;
    const gs = this.gameState;
    if (d.city) {
      const name = d.name.trim();
      if (name) d.city.name = name;
      this._cityNamingDialog = null;
      this._play(SFX.menuOk);
      return;
    }
    const name = d.name.trim() || gs.suggestCityName(d.unit.civId);
    const city = gs.foundCity(d.unit, name);
    this._cityNamingDialog = null;
    if (city) {
      this._play(SFX.foundCity);
      // Show the "Found New City" dialog
      const yr = gs.year ?? -4000;
      const era = yr < 0 ? `${Math.abs(yr)} B.C.` : `${yr} A.D.`;
      this._cityFoundedDialog = { cityName: city.name, year: era, city };
      // Pre-load the founding image
      if (!this._cityFoundedImg) {
        const img = new Image();
        img.src = assetUrl('sprites/extracted/tiles/cityBuiltAncient.png');
        this._cityFoundedImg = img;
      }
    } else {
      gs.log.unshift('Cannot found a city here.');
      if (gs.log.length > 8) gs.log.length = 8;
      this._play(SFX.neg);
    }
  }

  // ─── City Founded Dialog ─────────────────────────────────────────────────────
  // Original Civ2: "Found New City" with grayscale illustration + "London Founded, 4000 B.C."

  MapRenderer.prototype._drawCityFoundedDialog = function(ctx, canvasW, canvasH) {
    const d = this._cityFoundedDialog;
    if (!d) return;
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    

    // Size to match original dialog proportions
    const PW = 300, PH = 200;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    const { ix, iy, iw, ih } = this._drawCiv2Panel(ctx, px, py, PW, PH, 'Found New City');

    // Grayscale founding image
    const img = this._cityFoundedImg;
    if (img && img.complete && img.naturalWidth > 0) {
      const imgW = Math.min(iw - 20, 200);
      const imgH = Math.round(imgW * (img.naturalHeight / img.naturalWidth));
      const imgX = ix + Math.round((iw - imgW) / 2);
      const imgY = iy + 6;
      ctx.drawImage(img, imgX, imgY, imgW, imgH);
    }

    // "London Founded, 4000 B.C." text
    ctx.font = FONT.POPUP_TITLE;
    ctx.textAlign = 'center';
    this._panelText(ctx, `${d.cityName} Founded: ${d.year}`, px + PW / 2, py + PH - 50);
    ctx.textAlign = 'left';

    // OK button
    const btnW = 80, btnH = 22;
    const btnX = px + Math.round((PW - btnW) / 2);
    const btnY = py + PH - 38;
    this._drawWin95Button(ctx, btnX, btnY, btnW, btnH, 'OK');
    d._okRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  }

  MapRenderer.prototype._handleCityFoundedClick = function(px, py, canvasW, canvasH) {
    const d = this._cityFoundedDialog;
    if (!d) return;
    // Click anywhere (or on OK) dismisses
    this._cityFoundedDialog = null;
  }

  // ─── Find City Dialog ────────────────────────────────────────────────────────
  // Original Civ2: "Where in the heck is..." with city list + "Zoom To City"

  MapRenderer.prototype._openFindCityDialog = function() {
    const gs = this.gameState;
    const cities = gs.cities.filter(c => c.civId === 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (cities.length === 0) return;
    this._findCityDialog = {
      cities,
      selected: 0,
      scroll: 0,
      rects: [],
    };
  }

  MapRenderer.prototype._drawFindCityDialog = function(ctx, canvasW, canvasH) {
    const d = this._findCityDialog;
    if (!d) return;
    const FA = "'Tahoma','Arial','Arimo',sans-serif";
    const PW = 300, maxVisible = 10;
    const listH = Math.min(d.cities.length, maxVisible) * 16;
    const PH = listH + 80;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    const { ix, iy, iw, ih } = this._drawCiv2Panel(ctx, px, py, PW, PH, 'Where in the heck is . . .');

    // City list
    d.rects = [];
    ctx.font = FONT.TINY;
    const visCount = Math.min(d.cities.length, maxVisible);
    for (let i = 0; i < visCount; i++) {
      const ci = i + d.scroll;
      if (ci >= d.cities.length) break;
      const city = d.cities[ci];
      const ry = iy + 2 + i * 16;

      // Highlight selected
      if (ci === d.selected) {
        ctx.fillStyle = '#000080';
        ctx.fillRect(ix + 2, ry, iw - 4, 15);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(city.name, ix + 6, ry + 12);
      } else {
        ctx.textAlign = 'left';
        this._panelText(ctx, city.name, ix + 6, ry + 12);
      }

      d.rects.push({ x: ix + 2, y: ry, w: iw - 4, h: 15, idx: ci });
    }

    // Scrollbar if needed
    if (d.cities.length > maxVisible) {
      const sbX = ix + iw - 14, sbY = iy + 2, sbW = 12, sbH = listH;
      this._drawScrollbar(ctx, sbX, sbY, sbH, d.scroll, d.cities.length - maxVisible);
    }

    // Buttons: Zoom To City, OK, Cancel (matches original Civ2 MGE)
    const btnW = 80, btnH = 22;
    const btnY = iy + ih - btnH - 4;
    const totalBtnW = 3 * btnW + 20;
    const startBtnX = px + Math.floor((PW - totalBtnW) / 2);
    this._drawWin95Button(ctx, startBtnX, btnY, btnW, btnH, 'Zoom To City');
    this._drawWin95Button(ctx, startBtnX + btnW + 10, btnY, btnW, btnH, 'OK');
    this._drawWin95Button(ctx, startBtnX + 2 * (btnW + 10), btnY, btnW, btnH, 'Cancel');
    d._zoomRect = { x: startBtnX, y: btnY, w: btnW, h: btnH };
    d._okRect = { x: startBtnX + btnW + 10, y: btnY, w: btnW, h: btnH };
    d._cancelRect = { x: startBtnX + 2 * (btnW + 10), y: btnY, w: btnW, h: btnH };
  }

  MapRenderer.prototype._handleFindCityClick = function(px, py, canvasW, canvasH) {
    const d = this._findCityDialog;
    if (!d) return;

    // Check city list items
    for (const r of d.rects) {
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
        d.selected = r.idx;
        return;
      }
    }

    // Zoom To City button — center on city without closing
    if (d._zoomRect && px >= d._zoomRect.x && px < d._zoomRect.x + d._zoomRect.w &&
        py >= d._zoomRect.y && py < d._zoomRect.y + d._zoomRect.h) {
      const city = d.cities[d.selected];
      if (city) {
        this.centerOn(city.col, city.row, this._canvasW, this._canvasH);
      }
      return;
    }

    // OK button — zoom to city, open city screen, and close dialog
    if (d._okRect && px >= d._okRect.x && px < d._okRect.x + d._okRect.w &&
        py >= d._okRect.y && py < d._okRect.y + d._okRect.h) {
      const city = d.cities[d.selected];
      if (city) {
        this.centerOn(city.col, city.row, this._canvasW, this._canvasH);
        this._cityScreen = city;
      }
      this._findCityDialog = null;
      return;
    }

    // Cancel button
    if (d._cancelRect && px >= d._cancelRect.x && px < d._cancelRect.x + d._cancelRect.w &&
        py >= d._cancelRect.y && py < d._cancelRect.y + d._cancelRect.h) {
      this._findCityDialog = null;
      return;
    }
  }

}
