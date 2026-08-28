import { screenToTile } from '../../utils/IsoMath.js';
import { SB_W, TOP_H } from '../renderConstants.js';

const TRACE_LIMIT = 10;
const MENU_NAMES = ['Game', 'Kingdom', 'View', 'Orders', 'Advisors', 'World', 'Cheat', 'Civilopedia'];

/** @param {typeof import('../MapRenderer.js').MapRenderer} MapRenderer */
export function applyInteractionTraceMixin(MapRenderer) {
  MapRenderer.prototype._initInteractionTrace = function() {
    this._interactionTrace = [];
    this._interactionTraceSequence = 0;
    this._activeClickTrace = null;
  };

  MapRenderer.prototype._interactionScreen = function() {
    if (this._titleScreen) {
      if (this._hallOfFame) return { name: 'hall-of-fame' };
      if (this._creditsScreen) return { name: 'credits' };
      return { name: 'title' };
    }
    if (this._wizard) return { name: 'new-game-wizard', step: this._wizard.step ?? null };
    if (this._bugReportDialog) return { name: 'bug-report', status: this._bugReportDialog.status };
    if (this._retireStage) return { name: 'retirement', stage: this._retireStage };
    if (this.gameState?.gameOver) return { name: this._replayMap ? 'replay-map' : 'game-over' };
    if (this._openMenu !== null) return { name: 'menu', menu: MENU_NAMES[this._openMenu] ?? `menu-${this._openMenu}` };
    if (this._tradeDialog) return { name: 'trade-dialog' };
    if (this._diplomatDialog) return { name: 'diplomat-dialog' };
    if (this._aiPeaceProposal) return { name: 'peace-proposal' };
    if (this._highCouncil) return { name: 'high-council' };
    if (this._advancePopup) return { name: 'advance-discovered', advanceId: this._advancePopup.advId ?? null };
    if (this._wonderSplash) return { name: 'wonder-splash', wonderId: this._wonderSplash.id ?? null };
    if (this._scenarioCivChooser) return { name: 'scenario-civilization-chooser' };
    if (this._throneUpgradeDialog) return { name: 'throne-room-upgrade' };
    if (this._palaceView) return { name: 'palace-view' };
    if (this._throneRoom) return { name: 'throne-room' };
    if (this._replayMap) return { name: 'replay-map' };
    if (this._cityNamingDialog) return { name: 'city-naming' };
    if (this._cityFoundedDialog) return { name: 'city-founded' };
    if (this._findCityDialog) return { name: 'find-city' };
    if (this._editTechsDialog) return { name: 'edit-technologies' };
    if (this._editUnitDialog) return { name: 'edit-unit' };
    if (this._editCityDialog) return { name: 'edit-city' };
    if (this._editKingDialog) return { name: 'edit-king' };
    if (this._captureDialog) return { name: 'city-captured', cityId: this._captureDialog.city?.id ?? null };
    if (this._tileInfoPopup) return { name: 'tile-information', col: this._tileInfoPopup.col, row: this._tileInfoPopup.row };
    if (this._cityScreen) {
      return {
        name: this._cityScreenProdList ? 'city-production' : 'city',
        cityId: this._cityScreen.id ?? null,
        tab: this._cityScreenTab,
      };
    }
    if (this._unitMenu) return { name: 'unit-menu', unitId: this._unitMenu.unit?.id ?? null };
    if (this._govtChooser) return { name: 'government-chooser' };
    if (this._rateDialog) return { name: 'tax-rate' };
    if (this._negotiationScreen) return { name: 'negotiation', phase: this._negotiationScreen.phase ?? null };
    if (this._diplomacyScreen) return { name: 'foreign-advisor' };
    if (this._scienceAdvisor) return { name: 'science-advisor' };
    if (this._tradeAdvisor) return { name: 'trade-advisor' };
    if (this._domesticAdvisor) return { name: 'city-status' };
    if (this._militaryAdvisor) return { name: 'defense-minister' };
    if (this._attitudeAdvisor) return { name: 'attitude-advisor' };
    if (this._demographicsScreen) return { name: 'demographics' };
    if (this._top5Cities) return { name: 'top-five-cities' };
    if (this._hallOfFame) return { name: 'hall-of-fame' };
    if (this._wondersList) return { name: 'wonders-of-the-world' };
    if (this._gameOptionsDialog) return { name: 'game-options' };
    if (this._graphicOptionsDialog) return { name: 'graphic-options' };
    if (this._cityReportOptionsDialog) return { name: 'city-report-options' };
    if (this._casualtyDialog) return { name: 'casualty-timeline' };
    if (this._spaceshipViewer) return { name: 'spaceships' };
    if (this._civilopedia) {
      return {
        name: 'civilopedia',
        tab: this._civilopedia.tab,
        mode: this._civilopedia.mode ?? null,
      };
    }
    if (this._researchChooser) {
      return { name: this._researchGoalDialog ? 'research-goal' : 'research-chooser' };
    }
    return { name: 'map' };
  };

  MapRenderer.prototype._interactionContext = function() {
    const gs = this.gameState;
    const active = gs?.activeUnit;
    return {
      turn: gs?.turn ?? null,
      activeCivilization: gs?.activeCivIdx ?? null,
      activeUnitId: active?.id ?? null,
      activeUnitTile: active ? { col: active.col, row: active.row } : null,
      cityScreenId: this._cityScreen?.id ?? null,
    };
  };

  MapRenderer.prototype._interactionMapTile = function(px, py, canvasW, screen) {
    if (screen.name !== 'map' || px >= canvasW - SB_W || py < TOP_H) return null;
    const raw = screenToTile(px, py, this.viewX, this.viewY, this._getZoomScale());
    if (!raw || raw.row < 0 || raw.row >= this.mapRows) return null;
    return {
      col: ((raw.col % this.mapCols) + this.mapCols) % this.mapCols,
      row: raw.row,
    };
  };

  MapRenderer.prototype._beginClickTrace = function(px, py, canvasW, canvasH, kind = 'click') {
    if (!this._interactionTrace) this._initInteractionTrace();
    const screenBefore = this._interactionScreen();
    const entry = {
      sequence: ++this._interactionTraceSequence,
      at: new Date().toISOString(),
      kind,
      screenBefore,
      screenAfter: null,
      pointer: { x: Math.round(px), y: Math.round(py), canvasWidth: canvasW, canvasHeight: canvasH },
      mapTile: this._interactionMapTile(px, py, canvasW, screenBefore),
      contextBefore: this._interactionContext(),
      contextAfter: null,
      action: null,
    };
    this._interactionTrace.push(entry);
    if (this._interactionTrace.length > TRACE_LIMIT) this._interactionTrace.splice(0, this._interactionTrace.length - TRACE_LIMIT);
    this._activeClickTrace = entry;
    return entry;
  };

  MapRenderer.prototype._finishClickTrace = function(entry) {
    entry.screenAfter = this._interactionScreen();
    entry.contextAfter = this._interactionContext();
    if (this._activeClickTrace === entry) this._activeClickTrace = null;
  };

  MapRenderer.prototype._annotateCurrentClickTrace = function(source, id) {
    if (this._activeClickTrace) this._activeClickTrace.action = { source, id };
  };

  MapRenderer.prototype._interactionTraceForReport = function() {
    return (this._interactionTrace ?? []).map(entry => ({
      ...entry,
      screenBefore: { ...entry.screenBefore },
      screenAfter: entry.screenAfter ? { ...entry.screenAfter } : null,
      pointer: { ...entry.pointer },
      mapTile: entry.mapTile ? { ...entry.mapTile } : null,
      contextBefore: {
        ...entry.contextBefore,
        activeUnitTile: entry.contextBefore.activeUnitTile ? { ...entry.contextBefore.activeUnitTile } : null,
      },
      contextAfter: entry.contextAfter ? {
        ...entry.contextAfter,
        activeUnitTile: entry.contextAfter.activeUnitTile ? { ...entry.contextAfter.activeUnitTile } : null,
      } : null,
      action: entry.action ? { ...entry.action } : null,
    }));
  };
}
