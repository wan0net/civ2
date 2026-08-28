/**
 * SidebarMixin — Extracted from MapRenderer.js.
 * All methods installed on MapRenderer.prototype.
 */
import { UNITS } from '../../data/units.js';
import { SPECIAL_RESOURCES } from '../../data/terrain.js';
import { screenToTile, TILE_W_S, TILE_H_S } from '../../utils/IsoMath.js';
import { CIV_COLORS, CIV_LIGHT_COLORS, SB_W, TOP_H, FONT, UNITS_FLAG_LOCS, CLR } from '../renderConstants.js';

/** @param {typeof import('../MapRenderer.js').default} MapRenderer */
export function applySidebarMixin(MapRenderer) {
  // ─── Warn-once helper for render-loop error logging ───────────────────────
  const _warnedOnce = new Set();
  function _warnOnce(key, msg) {
    if (!_warnedOnce.has(key)) {
      _warnedOnce.add(key);
      console.warn(`[SidebarMixin] ${msg}`);
    }
  }

  function _drawInsetBorder(ctx, x, y, w, h) {
    ctx.fillStyle = '#434343';
    ctx.fillRect(x - 2, y - 2, w + 3, 1);
    ctx.fillRect(x - 2, y - 2, 1, h + 3);
    ctx.fillStyle = '#dfdfdf';
    ctx.fillRect(x - 2, y + h, w + 3, 1);
    ctx.fillRect(x + w, y - 2, 1, h + 3);
    ctx.fillStyle = '#434343';
    ctx.fillRect(x - 1, y - 1, w + 1, 1);
    ctx.fillRect(x - 1, y - 1, 1, h + 1);
    ctx.fillStyle = '#dfdfdf';
    ctx.fillRect(x - 1, y + h - 1, w + 1, 1);
    ctx.fillRect(x + w - 1, y - 1, 1, h + 1);
  }

  // ─── Right sidebar ─────────────────────────────────────────────────────────

  MapRenderer.prototype._drawSidebar = function(ctx, canvasW, canvasH) {
    const gs = this.gameState;
    const au = gs.activeUnit;
    const SB_X = canvasW - SB_W;
    this._drawSidebarBackground(ctx, SB_X, canvasH);
    const mm = this._drawSidebarMinimap(ctx, canvasW, canvasH, gs);
    const status = this._drawSidebarStatus(ctx, canvasW, SB_X, gs, mm);
    this._drawSidebarUnitInfo(ctx, canvasW, canvasH, SB_X, gs, au, status.unitY, status.LH, status.shadowText);
  }

  MapRenderer.prototype._drawSidebarBackground = function(ctx, SB_X, canvasH) {
    this._ensureWallpapers();
    if (this._outerWallpaper) {
      this._tilePattern(ctx, this._outerWallpaper, SB_X, TOP_H, SB_W, canvasH - TOP_H);
    } else {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(SB_X, TOP_H, SB_W, canvasH - TOP_H);
    }
    ctx.fillStyle = '#E3E3E3'; ctx.fillRect(SB_X, TOP_H, 1, canvasH - TOP_H);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(SB_X + 1, TOP_H, 1, canvasH - TOP_H);
    ctx.fillStyle = '#696969'; ctx.fillRect(SB_X + 2, TOP_H, 1, canvasH - TOP_H);
    ctx.font = FONT.HEADER;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText('World', SB_X + SB_W / 2 + 1, TOP_H + 20);
    ctx.fillStyle = '#878787';
    ctx.fillText('World', SB_X + SB_W / 2, TOP_H + 19);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  MapRenderer.prototype._drawSidebarMinimap = function(ctx, canvasW, canvasH, gs) {
    const { panelH, areaX, areaY, areaW, areaH, mapX, mapY, mapW, mapH, mmTileW, mmTileH } = this._mmGeom(canvasW, canvasH);
    const vis = gs._visibility;
    const tiles = this._tiles;
    ctx.fillStyle = '#000000';
    ctx.fillRect(areaX, areaY, areaW, areaH);
    _drawInsetBorder(ctx, areaX, areaY, areaW, areaH);

    if (this._minimapGlobe) {
      this._drawMinimapGlobe(ctx, areaX, areaY, areaW, areaH, gs);
    } else {
      for (let row = 0; row < this.mapRows; row++) {
        for (let col = 0; col < this.mapCols; col++) {
          const v = this._showHiddenTerrain ? 2 : vis[row][col];
          if (v === 0) continue;
          const t = tiles[row][col];
          const baseColor = t?.id === 7 ? CLR.MM_OCEAN : CLR.MM_LAND;
          ctx.fillStyle = v === 2 ? baseColor : this._darkenHex(baseColor, 0.5);
          const px = mapX + col * mmTileW + (row % 2 ? Math.floor(mmTileW / 2) : 0);
          ctx.fillRect(px, mapY + row * mmTileH, mmTileW, mmTileH);
        }
      }
      for (const city of gs.cities) {
        const v = this._showHiddenTerrain ? 2 : (vis[city.row]?.[city.col] ?? 0);
        if (v === 0) continue;
        const civ = gs.civs[city.civId];
        const color = CIV_COLORS[civ?.data?.color ?? 0];
        ctx.fillStyle = v === 2 ? color : this._darkenHex(color, 0.5);
        const cpx = mapX + city.col * mmTileW + (city.row % 2 ? Math.floor(mmTileW / 2) : 0);
        ctx.fillRect(cpx, mapY + city.row * mmTileH, mmTileW, mmTileH);
      }
    }

    const MAP_W = canvasW - SB_W;
    const MAP_H = canvasH - TOP_H;
    const colStep = TILE_W_S;
    const rowStep = TILE_H_S / 2;
    const vx1 = this.viewX / colStep;
    const vy1 = this.viewY / rowStep;
    const vx2 = vx1 + MAP_W / colStep;
    const vy2 = this.viewY / rowStep + MAP_H / rowStep;
    const vy1mm = mapY + vy1 * mmTileH;
    const vhMM = (vy2 - vy1) * mmTileH;
    if (!this._minimapGlobe) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      const clampedVx2 = Math.min(vx2, this.mapCols);
      ctx.strokeRect(mapX + vx1 * mmTileW, vy1mm, (clampedVx2 - vx1) * mmTileW, vhMM);
      if (vx2 > this.mapCols) ctx.strokeRect(mapX, vy1mm, (vx2 - this.mapCols) * mmTileW, vhMM);
    }
    return { panelH };
  }

  MapRenderer.prototype._drawSidebarStatus = function(ctx, canvasW, SB_X, gs, mm) {
    const divY = TOP_H + mm.panelH;
    ctx.font = FONT.HEADER;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText('Status', SB_X + SB_W / 2 + 1, divY + 17);
    ctx.fillStyle = '#878787';
    ctx.fillText('Status', SB_X + SB_W / 2, divY + 16);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    const yr = gs.year ?? -4000;
    const era = yr < 0 ? `${Math.abs(yr)} B.C.` : `${yr} A.D.`;
    const civ0 = gs.civs[0];
    const gold = civ0?.gold ?? 0;
    const resCost = civ0 ? gs.advanceCost(civ0) : 0;
    const beakers = civ0?.beakers ?? 0;
    const LH = 18;
    const infoPanelX = SB_X + 11;
    const infoPanelY = divY + 38;
    const infoPanelW = SB_W - 22;
    const infoPanelH = 60;
    if (this._innerWallpaper) {
      this._tilePattern(ctx, this._innerWallpaper, infoPanelX, infoPanelY, infoPanelW, infoPanelH);
    }
    _drawInsetBorder(ctx, infoPanelX, infoPanelY, infoPanelW, infoPanelH);
    const infoY = infoPanelY + 14;
    const shadowText = (text, tx, ty, align = 'left') => {
      ctx.font = FONT.TITLE_LARGE;
      ctx.textAlign = align;
      ctx.fillStyle = '#bfbfbf';
      ctx.fillText(text, tx + 1, ty + 1);
      ctx.fillStyle = '#333333';
      ctx.fillText(text, tx, ty);
    };

    const totalPop = gs.cities.filter(c => c.civId === 0).reduce((sum, c) => sum + c.size * 10000, 0);
    shadowText(totalPop > 0 ? `${totalPop.toLocaleString()} People` : '0 People', canvasW - 16, infoY, 'right');
    shadowText(era, infoPanelX + 5, infoY + LH);
    const taxR = (civ0?.taxRate ?? 0) / 10;
    const luxR = (civ0?.luxRate ?? 0) / 10;
    const sciR = (civ0?.sciRate ?? 0) / 10;
    shadowText(`${gold} Gold  ${taxR}.${luxR}.${sciR}`, infoPanelX + 5, infoY + LH * 2);
    shadowText(`Turn ${gs.turn}`, canvasW - 16, infoY + LH * 2, 'right');
    ctx.textAlign = 'left';

    const resPct = resCost > 0 ? beakers / resCost : 0;
    const resIcon = this._getResourceIcon(`research${Math.min(3, Math.floor(resPct * 4))}`);
    const resIconX = infoPanelX + 119;
    const resIconY = infoPanelY + 20;
    if (resIcon) ctx.drawImage(resIcon, resIconX, resIconY, 21, 21);

    let pollTotal = 0;
    const imps = gs._tileImprovements;
    if (imps) {
      for (let r = 0; r < this.mapRows; r++) {
        for (let c = 0; c < this.mapCols; c++) {
          if (imps[r]?.[c]?.pollution) pollTotal++;
        }
      }
    }
    const warmThreshold = Math.max(8, Math.floor(this.mapCols * this.mapRows / 100));
    const warmPct = warmThreshold > 0 ? pollTotal / warmThreshold : 0;
    const warmIcon = this._getResourceIcon(`warming${Math.min(3, Math.floor(warmPct * 4))}`);
    if (warmIcon) ctx.drawImage(warmIcon, resIconX + 31, resIconY, 21, 21);

    let spaceLineH = 0;
    if (gs._apolloBuilt) {
      const sp = gs.spaceshipProgress(0);
      const ready = sp.structural >= 8 && sp.component >= 4 && sp.module >= 4;
      ctx.font = FONT.TINY;
      ctx.fillStyle = ready ? '#00e060' : '#c0a000';
      ctx.textAlign = 'center';
      ctx.fillText(`\u{1F680} ${sp.structural}/8 \u25aa ${sp.component}/4 \u25aa ${sp.module}/4`, SB_X + SB_W / 2, infoY + LH * 3);
      ctx.textAlign = 'left';
      spaceLineH = 12;
      if (ready) {
        const lbX = SB_X + 10, lbY = infoY + LH * 3, lbW = SB_W - 20, lbH = 16;
        ctx.fillStyle = '#004400';
        ctx.fillRect(lbX, lbY, lbW, lbH);
        ctx.fillStyle = '#00e060';
        ctx.font = FONT.SMALL_BOLD;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('LAUNCH SPACESHIP', lbX + lbW / 2, lbY + lbH / 2);
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        this._launchRect = { x: lbX, y: lbY, w: lbW, h: lbH };
        spaceLineH = 22;
      } else {
        this._launchRect = null;
      }
    } else {
      this._launchRect = null;
    }

    return { unitY: divY + 106 + spaceLineH, LH, shadowText };
  }

  MapRenderer.prototype._drawSidebarUnitInfo = function(ctx, canvasW, canvasH, SB_X, gs, au, unitY, LH, shadowText) {
    const unitPanelX = SB_X + 11;
    const unitPanelW = SB_W - 22;
    const unitPanelH = Math.max(0, canvasH - 11 - unitY);
    if (this._innerWallpaper && unitPanelH > 0) {
      this._tilePattern(ctx, this._innerWallpaper, unitPanelX, unitY, unitPanelW, unitPanelH);
    }
    if (unitPanelH > 0) _drawInsetBorder(ctx, unitPanelX, unitY, unitPanelW, unitPanelH);
    if (gs.activeCivIdx !== 0) {
      const aiCiv = gs.civs[gs.activeCivIdx];
      if (aiCiv) {
        ctx.fillStyle = CIV_LIGHT_COLORS[aiCiv.data?.color ?? 0] ?? '#888888';
        ctx.fillRect(SB_X + SB_W - 19, canvasH - 17, 8, 6);
      }
      return;
    }
    if (au) {
      ctx.font = FONT.TITLE_LARGE; ctx.textAlign = 'center';
      ctx.fillStyle = '#000000'; ctx.fillText('Moving Units', SB_X + SB_W / 2 + 1, unitY + 10);
      ctx.fillStyle = '#FFFFFF'; ctx.fillText('Moving Units', SB_X + SB_W / 2, unitY + 10);
      ctx.textAlign = 'left';
      const civ = gs.civs[au.civId];
      const civColorIdx = civ?.data?.color ?? 0;
      const civColor = CIV_COLORS[civColorIdx];
      const shieldColor = CIV_LIGHT_COLORS[civColorIdx] ?? civColor;
      const unitData = UNITS[au.typeId];
      const hpFrac = au.hp / au.maxHp, hpColor = hpFrac > 0.667 ? 'rgb(87,171,39)' : hpFrac > 0.25 ? 'rgb(255,223,79)' : 'rgb(243,0,0)';
      const SW = 64, SH = 48, sprX = unitPanelX + 7, sprY = unitY + 27;
      try { ctx.drawImage(this._getColoredUnitSprite(Math.floor(au.typeId / 9), au.typeId % 9, civColor), sprX, sprY, SW, SH); }
      catch (e) { _warnOnce('sidebar-unit:' + au.id, 'Sidebar unit sprite unavailable: ' + e.message); ctx.fillStyle = civColor; ctx.fillRect(sprX, sprY, SW, SH); }
      const [flagX, flagY] = UNITS_FLAG_LOCS[au.typeId] ?? [12, 12];
      const sbShieldW = 12, sbShieldH = 20;
      const sbShieldX = sprX + flagX, sbShieldY = sprY + flagY;
      const sbShield = this._getShieldCanvas(shieldColor);
      if (sbShield) ctx.drawImage(sbShield, sbShieldX, sbShieldY, sbShieldW, sbShieldH);
      const sbBarY = sbShieldY + 2, sbBarH = 3;
      ctx.fillStyle = '#000'; ctx.fillRect(sbShieldX, sbBarY, sbShieldW, sbBarH);
      ctx.fillStyle = hpColor; ctx.fillRect(sbShieldX, sbBarY, Math.round(sbShieldW * hpFrac), sbBarH);
      const textX = unitPanelX + 79;
      ctx.font = FONT.TITLE_LARGE; ctx.fillStyle = '#333333';
      const movesWhole = Math.floor(au.movesLeft / 3), movesFrac = au.movesLeft % 3;
      const movesStr = movesFrac > 0 && movesWhole > 0 ? `Moves: ${movesWhole} ${movesFrac}/3` : (movesFrac > 0 ? `Moves: ${movesFrac}/3` : `Moves: ${movesWhole}`);
      ctx.fillText(movesStr, textX, unitY + 25);
      const homeCity = au.homeCity != null ? gs.cities.find(c => c.id === au.homeCity) : null;
      ctx.fillText(homeCity?.name ?? 'NONE', textX, unitY + 25 + LH);
      ctx.fillText(civ?.data?.adjective ?? civ?.data?.plural ?? '', textX, unitY + 25 + LH * 2);
      ctx.fillText(au.veteran ? `${unitData?.name ?? '?'} (Veteran)` : (unitData?.name ?? '?'), unitPanelX + 5, unitY + 83);
      let infoY = unitY + 83 + LH;
      const tile = gs.tiles?.[au.row]?.[au.col];
      if (tile) {
        let tName = tile.label ?? ''; if (tile.river) tName += ', River';
        ctx.fillText(`(${tName})`, unitPanelX + 5, infoY); infoY += LH;
        const resId = this._resources?.[au.row]?.[au.col] ?? -1;
        if (resId >= 0 && SPECIAL_RESOURCES[resId]) { ctx.fillText(`(${SPECIAL_RESOURCES[resId].label})`, unitPanelX + 5, infoY); infoY += LH; }
        const imp = gs._tileImprovements?.[au.row]?.[au.col];
        if (imp && !gs.cityAt(au.col, au.row)) {
          const impParts = []; if (imp.road && imp.railroad) impParts.push('Railroad'); else if (imp.road) impParts.push('Road');
          if (imp.irrigation) impParts.push('Irrigation'); if (imp.mine) impParts.push('Mine');
          if (impParts.length > 0) { ctx.fillText(`(${impParts.join(', ')})`, unitPanelX + 5, infoY); infoY += LH; }
          const defParts = []; if (imp.fortress) defParts.push('Fortress'); if (imp.airbase) defParts.push('Airbase');
          if (defParts.length > 0) { ctx.fillText(`(${defParts.join(', ')})`, unitPanelX + 5, infoY); infoY += LH; }
          if (imp.pollution) { ctx.fillText('(Pollution)', unitPanelX + 5, infoY); infoY += LH * 2; }
        }
      }
      if (au.buildTask) {
        const { type, turnsLeft } = au.buildTask;
        ctx.fillStyle = '#60b0ff'; ctx.fillText(`Building ${type} (${turnsLeft}t)`, unitPanelX + 5, infoY); infoY += LH;
      } else if (au.gotoTarget) {
        ctx.fillStyle = '#00ccff'; ctx.fillText('GoTo', unitPanelX + 5, infoY); infoY += LH;
      } else if (au.status === 'fortified' || au.status === 'sentry' || au.status === 'sleep') {
        ctx.fillStyle = '#999999'; ctx.fillText(au.status[0].toUpperCase() + au.status.slice(1), unitPanelX + 5, infoY); infoY += LH;
      }
      ctx.fillStyle = '#333333';
      const holds = UNITS[au.typeId]?.holds ?? 0;
      if (holds > 0) {
        const cargoCount = au.cargo?.length ?? 0;
        ctx.fillStyle = cargoCount > 0 ? '#aaddff' : '#999999';
        ctx.fillText(`Cargo: ${cargoCount}/${holds}`, unitPanelX + 5, infoY); infoY += LH;
        if (au.cargo && au.cargo.length > 0) au.cargo.slice(0, 4).forEach((c) => { ctx.fillStyle = '#cceeff'; ctx.fillText(`  ${UNITS[c.typeId]?.name ?? '?'}`, unitPanelX + 5, infoY); infoY += LH; });
      }
      if (au.inShip) { ctx.fillStyle = '#aaddff'; ctx.fillText(`Aboard: ${UNITS[au.inShip.typeId]?.name ?? 'Ship'}`, unitPanelX + 5, infoY); infoY += LH; }
      ctx.fillStyle = '#333333';
      const stackUnits = gs.unitsAt(au.col, au.row).filter(u => u.civId === au.civId && u !== au);
      for (let si = 0; si < stackUnits.length; si++) {
        if (infoY + LH * 3 > canvasH - 20) { const remaining = stackUnits.length - si; ctx.fillText(`(${remaining} More ${remaining === 1 ? 'Unit' : 'Units'})`, unitPanelX + 5, infoY); break; }
        const su = stackUnits[si], suCity = su.homeCity != null ? gs.cities.find(c => c.id === su.homeCity) : null;
        ctx.fillText(suCity?.name ?? 'NONE', unitPanelX + 5, infoY); infoY += LH;
        ctx.fillText(su.status ? su.status[0].toUpperCase() + su.status.slice(1) : '', unitPanelX + 5, infoY); infoY += LH;
        const suData = UNITS[su.typeId]; ctx.fillText(su.veteran ? `${suData?.name ?? '?'} (Veteran)` : (suData?.name ?? '?'), unitPanelX + 5, infoY); infoY += LH;
      }
      return;
    }
    ctx.font = FONT.TITLE_LARGE; ctx.textAlign = 'center';
    ctx.fillStyle = '#000000'; ctx.fillText('Viewing Pieces', SB_X + SB_W / 2 + 1, unitY + 10);
    ctx.fillStyle = '#FFFFFF'; ctx.fillText('Viewing Pieces', SB_X + SB_W / 2, unitY + 10);
    ctx.textAlign = 'left';
    if (gs.activeCivIdx === 0) {
      const eotColor = Math.floor(this._blinkTime / 500) % 2 === 0 ? '#FFFFFF' : 'rgb(135,135,135)';
      ctx.font = FONT.BODY_TIMES_BOLD; ctx.fillStyle = '#000000';
      ctx.fillText('End of Turn', unitPanelX + 6, canvasH - 51); ctx.fillText('(Press ENTER)', unitPanelX + 11, canvasH - 33);
      ctx.fillStyle = eotColor; ctx.fillText('End of Turn', unitPanelX + 5, canvasH - 51); ctx.fillText('(Press ENTER)', unitPanelX + 10, canvasH - 33);
    }
    const MAP_W = canvasW - SB_W, MAP_H_VP = canvasH - TOP_H;
    const cTile = screenToTile(MAP_W / 2, TOP_H + MAP_H_VP / 2, this.viewX, this.viewY);
    const vtCol = cTile ? ((cTile.col % this.mapCols) + this.mapCols) % this.mapCols : 0;
    const vtRow = cTile ? Math.max(0, Math.min(cTile.row, this.mapRows - 1)) : 0;
    const vt = gs.tiles?.[vtRow]?.[vtCol]; if (!vt) return;
    let vy = unitY + 22;
    const islandId = gs.getIslandId(vtCol, vtRow);
    shadowText(`Loc: (${vtCol}, ${vtRow}) ${islandId >= 0 ? islandId : ''}`, unitPanelX + 5, vy); vy += LH;
    let vtParts = vt.label ?? ''; if (vt.river) vtParts += ', River';
    shadowText(`(${vtParts})`, unitPanelX + 5, vy); vy += LH;
    const vtResId = this._resources?.[vtRow]?.[vtCol] ?? -1;
    if (vtResId >= 0 && SPECIAL_RESOURCES[vtResId]) { shadowText(`(${SPECIAL_RESOURCES[vtResId].label})`, unitPanelX + 5, vy); vy += LH; }
    const vtImp = gs._tileImprovements?.[vtRow]?.[vtCol];
    if (vtImp && !gs.cityAt(vtCol, vtRow)) {
      const impParts = []; if (vtImp.road && vtImp.railroad) impParts.push('Railroad'); else if (vtImp.road) impParts.push('Road');
      if (vtImp.irrigation) impParts.push('Irrigation'); if (vtImp.mine) impParts.push('Mine');
      if (impParts.length > 0) { ctx.fillText(`(${impParts.join(', ')})`, SB_X + 6, vy); vy += LH; }
      const defParts = []; if (vtImp.fortress) defParts.push('Fortress'); if (vtImp.airbase) defParts.push('Airbase');
      if (defParts.length > 0) { ctx.fillText(`(${defParts.join(', ')})`, SB_X + 6, vy); vy += LH; }
      if (vtImp.pollution) { ctx.fillText('(Pollution)', SB_X + 6, vy); vy += LH * 2; }
    }
    const vtUnits = gs.unitsAt(vtCol, vtRow);
    for (let i = 0; i < vtUnits.length; i++) {
      const vu = vtUnits[i];
      if (vy + LH * 3 > canvasH - 20) { const remaining = vtUnits.length - i; ctx.fillText(`(${remaining} More ${remaining === 1 ? 'Unit' : 'Units'})`, SB_X + 6, vy); break; }
      const vuData = UNITS[vu.typeId], vuCity = vu.homeCity != null ? gs.cities.find(c => c.id === vu.homeCity) : null;
      ctx.fillText(vuCity?.name ?? 'NONE', SB_X + 6, vy); vy += LH;
      ctx.fillText(vu.status ? vu.status[0].toUpperCase() + vu.status.slice(1) : '', SB_X + 6, vy); vy += LH;
      ctx.fillText(vu.veteran ? `${vuData?.name ?? '?'} (Veteran)` : (vuData?.name ?? '?'), SB_X + 6, vy); vy += LH;
    }
  }

  MapRenderer.prototype._drawSidebarBottom = function(ctx, canvasH, SB_X, gs) {
    const humanCiv = gs.civs?.[0];
    if (humanCiv) {
      const enemies = [];
      for (const [civId, status] of humanCiv.relations) {
        if (status === 'war' && gs.civs[civId]?.alive) enemies.push(gs.civs[civId].data?.name ?? `Civ ${civId}`);
      }
      if (enemies.length > 0) {
        const warY = canvasH - 4 - Math.min(gs.log.slice(0, 3).length, 3) * 13 - enemies.length * 12 - 18;
        ctx.font = FONT.SMALL_BOLD;
        ctx.fillStyle = '#cc3333';
        ctx.fillText('AT WAR WITH:', SB_X + 6, warY);
        ctx.font = FONT.SMALL;
        enemies.forEach((name, i) => {
          ctx.fillStyle = '#ff6666';
          ctx.fillText(`  ${name}`, SB_X + 6, warY + 11 + i * 12);
        });
      }
    }

    const logLines = gs.log.slice(0, 3);
    if (logLines.length > 0) {
      const lineH = 13;
      const logY = canvasH - 4 - logLines.length * lineH;
      ctx.font = FONT.SMALL;
      logLines.forEach((line, i) => {
        ctx.fillStyle = `rgba(220,200,140,${1 - i * 0.28})`;
        ctx.fillText(line.slice(0, 29), SB_X + 6, logY + i * lineH + 9);
      });
    }
  }

  MapRenderer.prototype._handleMenuBarClick = function(px) {
    for (const mb of this._menuBarRects) {
      if (px >= mb.x && px < mb.x + mb.w) {
        this._openMenu     = this._openMenu === mb.menuIdx ? null : mb.menuIdx;
        this._menuHoverIdx = null;
        this._menuItemRects = [];
        return;
      }
    }
    this._openMenu = null;
  }

  MapRenderer.prototype._handleSidebarClick = function(px, py, canvasW, canvasH) {
    const lr = this._launchRect;
    if (lr && px >= lr.x && px < lr.x + lr.w && py >= lr.y && py < lr.y + lr.h) {
      this.gameState.launchSpaceship(0);
      return;
    }
    const SB_X = canvasW - SB_W;
    const headerY = TOP_H;
    const headerH = 32;
    if (px >= SB_X && px < SB_X + SB_W && py >= headerY && py < headerY + headerH) {
      this._minimapGlobe = !this._minimapGlobe;
      this._globeAngle = 0;
      return;
    }
    if (this.isMiniMapClick(px, py, canvasW, canvasH)) {
      if (this._minimapGlobe) {
        this._minimapGlobe = false;
      } else {
        this.handleMiniMapClick(px, py, canvasW, canvasH);
      }
    }
  }

  /**
   * Orthographic globe projection of the map (axx0 MinimapPanel.cs:204-230).
   * Scanline-based: for each y compute circle x-extent, map tiles onto the arc.
   * Uses an offscreen ImageData buffer for per-pixel writes (much faster than
   * individual fillRect calls at this density).
   */
  MapRenderer.prototype._drawMinimapGlobe = function(ctx, areaX, areaY, areaW, areaH, gs) {
    const radius  = Math.min(areaW, areaH) / 2;
    const centerX = areaX + areaW / 2;
    const centerY = areaY + areaH / 2;
    const mapCols = this.mapCols;
    const mapRows = this.mapRows;
    const tiles   = this._tiles;
    const cities  = gs.cities;
    const civs    = gs.civs;
    const angle   = this._globeAngle;

    const globeW = Math.ceil(radius * 2);
    const globeH = Math.ceil(radius * 2);
    const offX   = Math.round(centerX - radius);
    const offY   = Math.round(centerY - radius);

    if (!this._globeImageData || this._globeImageData.width !== globeW || this._globeImageData.height !== globeH) {
      this._globeImageData = ctx.createImageData(globeW, globeH);
    }
    const imgData = this._globeImageData;
    const data    = imgData.data;
    data.fill(0);

    const colShift = (angle / (Math.PI * 2)) * mapCols;

    const citySet = new Set();
    for (const city of cities) {
      citySet.add(city.row * mapCols + city.col);
    }
    const cityColorMap = new Map();
    for (const city of cities) {
      const civ = civs[city.civId];
      cityColorMap.set(city.row * mapCols + city.col, CIV_COLORS[civ?.data?.color ?? 0]);
    }

    for (let py = 0; py < globeH; py++) {
      const dy = py - radius;
      const rr = radius * radius - dy * dy;
      if (rr <= 0) continue;
      const xSpan = Math.sqrt(rr);
      const xleft  = Math.round(radius - xSpan);
      const xright = Math.round(radius + xSpan);
      const spanW  = xright - xleft;
      if (spanW <= 0) continue;

      const mapRow = Math.floor((py / globeH) * mapRows);
      const clampedRow = Math.max(0, Math.min(mapRows - 1, mapRow));

      for (let px = xleft; px < xright; px++) {
        const localX = px - xleft;
        const theta = Math.asin((localX - spanW / 2) / (spanW / 2));
        const mapColF = ((theta / Math.PI + 0.5) * mapCols + colShift) % mapCols;
        const mapCol  = ((Math.floor(mapColF) % mapCols) + mapCols) % mapCols;

        const tileKey = clampedRow * mapCols + mapCol;
        const visibility = this._showHiddenTerrain
          ? 2
          : (gs._visibility[clampedRow]?.[mapCol] ?? 0);
        let r, g, b;

        if (visibility === 0) {
          r = 0; g = 0; b = 0;
        } else if (citySet.has(tileKey)) {
          const hex = cityColorMap.get(tileKey) || '#ffffff';
          r = parseInt(hex.slice(1, 3), 16);
          g = parseInt(hex.slice(3, 5), 16);
          b = parseInt(hex.slice(5, 7), 16);
        } else {
          const tile = tiles[clampedRow]?.[mapCol];
          const terrainId = tile?.id ?? 7;
          if (terrainId === 7) {
            r = 0; g = 0; b = 128;
          } else if (terrainId === 0) {
            r = 180; g = 160; b = 100;
          } else if (terrainId === 8 || terrainId === 9) {
            r = 220; g = 230; b = 240;
          } else {
            r = 40; g = 100; b = 20;
          }
        }

        const exploredShade = visibility === 1 ? 0.5 : 1;
        const shade = exploredShade * (0.6 + 0.4 * Math.cos((localX - spanW / 2) / (spanW / 2)));
        r = Math.round(r * shade);
        g = Math.round(g * shade);
        b = Math.round(b * shade);

        const idx = (py * globeW + px) * 4;
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, offX, offY);

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /**
   * Darken a CSS hex colour by multiplying each channel by `factor`.
   * Results are cached to avoid repeated string parsing.
   */
  MapRenderer.prototype._darkenHex = function(hex, factor) {
    const key = hex + factor;
    if (!this._darkCache) this._darkCache = new Map();
    if (this._darkCache.has(key)) return this._darkCache.get(key);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const v = `rgb(${Math.round(r*factor)},${Math.round(g*factor)},${Math.round(b*factor)})`;
    this._darkCache.set(key, v);
    return v;
  }



}
