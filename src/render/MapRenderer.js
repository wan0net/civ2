/**
 * MapRenderer — renders the isometric terrain map onto the game canvas.
 *
 * Handles:
 *   - Viewport scrolling (WASD / arrow keys)
 *   - Tile drawing using SpriteManager terrain sprites
 *   - Unit and city rendering layers on top of terrain
 *   - Hover highlight and status bar
 *   - Fallback solid-colour tiles when sprites are unavailable
 */

import { tileToScreen, screenToTile, TILE_W, TILE_H, SCALE } from '../utils/IsoMath.js';
import { TERRAIN, SPECIAL_RESOURCES } from '../data/terrain.js';
import { UNITS, FLAGS } from '../data/units.js';
import { IMPROVEMENTS } from '../data/improvements.js';
import { ADVANCES }     from '../data/advances.js';
import { COSMIC }       from '../data/cosmic.js';
import { GOVERNMENTS }  from '../data/governments.js';
import { CIVS }         from '../data/civs.js';
import { CIV_COLORS, UNIT_W_S, UNIT_H_S, TITLE_H, MENU_H, TOP_H, SB_W, FONT, FONT_ARIAL, CLR }  from './renderConstants.js';
import { applyAdvisorsMixin } from './mixins/AdvisorsMixin.js';
import { applyInfoScreensMixin } from './mixins/InfoScreensMixin.js';
import { applyDialogsMixin } from './mixins/DialogsMixin.js';
import { applyWizardMixin } from './mixins/WizardMixin.js';
import { applyCityScreenMixin } from './mixins/CityScreenMixin.js';
import { applySidebarMixin } from './mixins/SidebarMixin.js';
import { applyTerrainMixin } from './mixins/TerrainMixin.js';
import { applyBugReportMixin } from './mixins/BugReportMixin.js';
import { GameState }       from '../engine/GameState.js';
import { Civ2SaveLoader }  from '../engine/Civ2SaveLoader.js';
import { MapLoader }       from '../engine/MapLoader.js';
import { SFX, combatSoundFor, improvementSoundFor, advanceFanfare } from '../audio/sounds.js';

export { TERRAIN } from '../data/terrain.js';

// ─── Scroll speed (pixels per frame at 60fps) ─────────────────────────────────
const SCROLL_SPEED = 8;

// Font family shorthands — matching axx0 Civ2GoldInterface.cs:41-61
// Arial 14px for menus/city/labels; TNR for headers (bold 28px), buttons (20px), status (bold 16px)
// Sizes vary by context; each draw function defines them locally via FA/FT shorthands.

// ─── Menu bar definitions ─────────────────────────────────────────────────────
// Each item: { label, action, shortcut?, needsUnit? } | null (= separator)
const MENUS = [
  { label: 'Game', items: [
    { label: 'Game Options',         action: 'game_options',           shortcut: 'Ctrl+O' },
    { label: 'Graphic Options',      action: 'game_graphicoptions',   shortcut: 'Ctrl+P' },
    { label: 'City Report Options',  action: 'game_cityreportoptions', shortcut: 'Ctrl+E' },
    null,
    { label: 'Pick Music',           action: 'game_music' },
    null,
    { label: 'Save Game',            action: 'game_save',  shortcut: 'Ctrl+S' },
    { label: 'Save As MGE .SAV',     action: 'game_save_sav' },
    { label: 'Load Game',            action: 'game_load',  shortcut: 'Ctrl+L' },
    null,
    { label: 'Report Bug...',        action: 'game_reportbug' },
    null,
    { label: 'Retire',               action: 'game_retire', shortcut: 'Ctrl+R' },
    { label: 'Quit',                 action: 'game_quit',   shortcut: 'Ctrl+Q' },
  ]},
  { label: 'Kingdom', items: [
    { label: 'Tax Rate',             action: 'kd_tax',        shortcut: 'Shift+T' },
    null,
    { label: 'View Throne Room',     action: 'view_throne',   shortcut: 'Shift+H' },
    { label: 'Find City',            action: 'kd_findcity',   shortcut: 'Shift+C' },
    null,
    { label: 'REVOLUTION',           action: 'kd_revolution', shortcut: 'Shift+R' },
  ]},
  { label: 'View', items: [
    { label: 'Move Pieces',          action: 'view_movepieces', shortcut: 'V' },
    { label: 'View Pieces',          action: 'view_viewpieces', shortcut: 'V' },
    null,
    { label: 'Zoom In',              action: 'view_zoomin',  shortcut: 'Z' },
    { label: 'Zoom Out',             action: 'view_zoomout', shortcut: 'X' },
    null,
    { label: 'Max Zoom In',          action: 'view_maxzoomin',  shortcut: 'Ctrl+Z' },
    { label: 'Standard Zoom',        action: 'view_stdzoom',    shortcut: 'Shift+Z' },
    { label: 'Medium Zoom Out',      action: 'view_medzoomout', shortcut: 'Shift+X' },
    { label: 'Max Zoom Out',         action: 'view_maxzoomout', shortcut: 'Ctrl+X' },
    null,
    { label: 'Show Map Grid',        action: 'view_grid', toggle: true, shortcut: 'Ctrl+G' },
    { label: 'Arrange Windows',      action: 'view_arrange' },
    { label: 'Show Hidden Terrain',  action: 'view_hidden', toggle: true, shortcut: 'T' },
    { label: 'Center View',          action: 'view_center', shortcut: 'C' },
  ]},
  { label: 'Orders', items: [
    { label: 'Build New City',    action: 'ord_city',       shortcut: 'B', needsUnit: true },
    { label: 'Build Road',        action: 'ord_road',       shortcut: 'R', needsUnit: true },
    { label: 'Build Irrigation',  action: 'ord_irrigate',   shortcut: 'I', needsUnit: true },
    { label: 'Build Mines',       action: 'ord_mine',       shortcut: 'M', needsUnit: true },
    { label: 'Build Airbase',     action: 'ord_airbase',    shortcut: 'E', needsUnit: true },
    { label: 'Build Fortress',    action: 'ord_fortress',   shortcut: 'F', needsUnit: true },
    { label: 'Automate Settler',  action: 'ord_autosettle', shortcut: 'K', needsUnit: true },
    { label: 'Clean Up Pollution', action: 'ord_pollution', shortcut: 'P', needsUnit: true },
    null,
    { label: 'Pillage',           action: 'ord_pillage',   shortcut: 'Shift+P', needsUnit: true },
    { label: 'Unload',            action: 'ord_unload',    shortcut: 'U', needsUnit: true },
    { label: 'Go To',             action: 'ord_goto',      shortcut: 'G', needsUnit: true },
    { label: 'Paradrop',          action: 'ord_paradrop',  shortcut: 'P', needsUnit: true },
    { label: 'Airlift',           action: 'ord_airlift',   shortcut: 'L', needsUnit: true },
    { label: 'Set Home City',     action: 'ord_gohome',    shortcut: 'H', needsUnit: true },
    null,
    { label: 'Fortify',           action: 'ord_fortify',   shortcut: 'F', needsUnit: true },
    { label: 'Sleep',             action: 'ord_sleep',     shortcut: 'S', needsUnit: true },
    { label: 'Disband',           action: 'ord_disband',   shortcut: 'Shift+D', needsUnit: true },
    { label: 'Activate Unit',     action: 'ord_activate',  shortcut: 'A', needsUnit: true },
    { label: 'Wait',              action: 'ord_wait',      shortcut: 'W', needsUnit: true },
    { label: 'Skip Turn',         action: 'ord_skip',      shortcut: 'Space', needsUnit: true },
    null,
    { label: 'End Player Turn',   action: 'ord_endturn',   shortcut: 'Ctrl+N' },
  ]},
  { label: 'Advisors', items: [
    { label: 'Chat with Kings',     action: 'adv_chat',     shortcut: 'Ctrl+C' },
    { label: 'Consult High Council', action: 'adv_council' },
    null,
    { label: 'City Status',         action: 'adv_domestic', shortcut: 'F1' },
    { label: 'Defense Minister',    action: 'adv_military', shortcut: 'F2' },
    { label: 'Foreign Minister',    action: 'adv_foreign',  shortcut: 'F3' },
    null,
    { label: 'Attitude Advisor',    action: 'adv_attitude', shortcut: 'F4' },
    { label: 'Trade Advisor',       action: 'adv_trade',    shortcut: 'F5' },
    { label: 'Science Advisor',     action: 'adv_science',  shortcut: 'F6' },
    null,
    { label: 'Casualty Timeline',   action: 'adv_casualties', shortcut: 'Ctrl+D' },
  ]},
  { label: 'World', items: [
    { label: 'Wonders of the World', action: 'wld_wonders',    shortcut: 'F7' },
    { label: 'Top 5 Cities',         action: 'wld_top5',      shortcut: 'F8' },
    { label: 'Civilization Score',   action: 'wld_score',      shortcut: 'F9' },
    null,
    { label: 'Demographics',         action: 'wld_demo',       shortcut: 'F11' },
    { label: 'Spaceships',          action: 'wld_spaceships',  shortcut: 'F12' },
  ]},
  { label: 'Cheat', items: [
    { label: 'Toggle Cheat Mode',    action: 'cheat_toggle',  shortcut: 'Ctrl+K' },
    null,
    { label: 'Create Unit',          action: 'cheat_unit',    shortcut: 'Shift+F1' },
    { label: 'Reveal Map',           action: 'cheat_reveal',  shortcut: 'Shift+F2' },
    { label: 'Set Human Player',     action: 'cheat_human',   shortcut: 'Shift+F3' },
    null,
    { label: 'Set Game Year',        action: 'cheat_year',    shortcut: 'Shift+F4' },
    { label: 'Kill Civilization',    action: 'cheat_kill',    shortcut: 'Shift+F5' },
    null,
    { label: 'Technology Advance',   action: 'cheat_research', shortcut: 'Shift+F6' },
    { label: 'Edit Technologies',    action: 'cheat_edittechs', shortcut: 'Ctrl+Shift+F6' },
    { label: 'Force Government',     action: 'cheat_govt',    shortcut: 'Shift+F7' },
    { label: 'Change Terrain At Cursor', action: 'cheat_terrain', shortcut: 'Shift+F8' },
    { label: 'Destroy All Units At Cursor', action: 'cheat_destroyunits', shortcut: 'Ctrl+Shift+D' },
    { label: 'Change Money',         action: 'cheat_gold',    shortcut: 'Shift+F9' },
    null,
    { label: 'Edit Unit',            action: 'cheat_editunit',  shortcut: 'Ctrl+Shift+U' },
    { label: 'Edit City',            action: 'cheat_editcity',  shortcut: 'Ctrl+Shift+C' },
    { label: 'Edit King',            action: 'cheat_editking',  shortcut: 'Ctrl+Shift+K' },
    null,
    { label: 'Scenario Parameters',  action: 'cheat_scenario', shortcut: 'Ctrl+Shift+P' },
    { label: 'Save As Scenario',     action: 'cheat_savescen', shortcut: 'Ctrl+Shift+S' },
  ]},
  { label: 'Civilopedia', items: [
    { label: 'Civilization Advances', action: 'cpd_advances' },
    { label: 'City Improvements',     action: 'cpd_improv'   },
    { label: 'Wonders of the World',  action: 'cpd_wonders'  },
    { label: 'Military Units',        action: 'cpd_units'    },
    null,
    { label: 'Governments',           action: 'cpd_govts'    },
    { label: 'Terrain Types',         action: 'cpd_terrain'  },
    null,
    { label: 'Game Concepts',         action: 'cpd_concepts' },
    null,
    { label: 'About Civilization II', action: 'cpd_about'    },
  ]},
];

// ─── Civ colours indexed by civ.data.color (1-7; 0 = unused white) ───────────
// CIV_COLORS imported from ./renderConstants.js

// ─── Unit shield FlagLoc positions ────────────────────────────────────────────
// [flagX, flagY] in original 64×48 cell coordinates — detected from blue marker
// pixels in UNITS.GIF gap rows/columns (blue pixel above = x, left = y).

// ─── MapRenderer ─────────────────────────────────────────────────────────────

export class MapRenderer {
  /**
   * @param {import('./SpriteManager.js').SpriteManager} spriteManager
   * @param {import('../engine/GameState.js').GameState} gameState
   */
  constructor(spriteManager, gameState, audio = null) {
     this.sprites   = spriteManager;
     this.gameState = gameState;
     this.audio     = audio;

     this.mapCols = gameState.mapCols;
     this.mapRows = gameState.mapRows;
     this.viewX   = 0;
     this.viewY   = 0;

     this._scrollKeys  = { up: false, down: false, left: false, right: false };
     this._hoveredTile = null;

     // Warn-once helper for render-loop error logging
     this._warnedOnce = new Set();
     this._warnOnce = (key, msg) => {
       if (!this._warnedOnce.has(key)) {
         this._warnedOnce.add(key);
         console.warn(`[MapRenderer] ${msg}`);
       }
     };

    this._zoomLevel = 1;
    this._zoomScales = [1, 1.5, 2, 2.5];

    this._viewOnlyMode = false;
    this._showHiddenTerrain = false;

    // Cache of unit sprites with civ colour applied via template-pixel replacement.
    // Key: `${sprRow}-${sprCol}-${civColor}`
    this._unitSpriteCache = new Map();

    // Cache of shield badge canvases. Key: civColor string → 24×40 canvas.
    this._shieldCache = new Map();

    // Raw UNITS.GIF ImageData (loaded async) used to extract shield sprites.
    this._unitsRawImgData = null;
    this._loadUnitsRaw();

    // Raw CITIES sheet — scanned for flag/size marker positions (loaded async).
    this._citySpriteData = null;
    this._civFlagSprites = null;
    this._civLightColors = null;
    this._loadCitiesRaw();

    // City screen state
    this._cityScreen          = null;
    this._cityScreenTab       = 'units';
    this._cityScreenScroll    = 0;
    this._cityScreenTabRects  = [];
    this._cityScreenItemRects = [];
    this._cityScreenCloseRect = null;
    this._cityScreenProdList  = false;   // true when Change button is active
    this._cityScreenChangeRect = null;
    this._cityScreenBuyRect    = null;
    this._cityScreenOkRect     = null;
    this._cityScreenProductionShieldRect = null;
    this._cityScreenNavRects   = [];
    this._cityScreenQueueAddMode = false;
    this._cityScreenProductionSelection = null;
    this._shiftHeld = false;

    // Unit action menu state
    this._unitMenu      = null;  // { unit, items, rects, sx, sy } or null
    this._unitMoveMode  = false; // true while waiting for a target tile
    this._moveRangeTiles = null; // Map col,row→remainingMoves when in move mode

    // Right-click tile info popup
    this._tileInfoPopup = null;  // { col, row, sx, sy } or null

    // Research chooser overlay
    this._researchChooser       = false;
    this._researchChooserScroll = 0;
    this._researchChooserRects  = [];
    this._researchGoalDialog    = false;
    this._researchGoalScroll    = 0;
    this._researchGoalRects     = [];
    this._researchGoalCandidates = null;
    this._researchChooserSelectedId = null;
    this._researchGoalSelectedId = null;

    // Government chooser overlay (shown after anarchy ends)
    this._govtChooser      = false;
    this._govtChooserRects = [];

    // City capture dialog
    this._captureDialog = null;  // { city } | null
    this._advancePopup  = null;  // { advId, advName, civAdj } | null — tech discovery dialog
    this._wonderSplash  = null;  // { name, city, id } | null
    this._wonderVideo   = null;  // HTMLVideoElement | null

    // High Council video overlay
    this._highCouncil     = false;
    this._councilVideo    = null;  // HTMLVideoElement | null

    // AI peace proposal dialog
    this._aiPeaceProposal = null; // { fromCivId, civName } | null

    // Trade arrival dialog (Caravan/Freight at a city)
    this._tradeDialog = null; // { unit, city } | null

    // Diplomat/Spy action dialog (at enemy city)
    this._diplomatDialog = null; // { unit, city } | null

    // City naming dialog ("What Shall We Name This City?")
    this._cityNamingDialog = null; // { unit, name, cursor } | null
    // City founded dialog ("Found New City" with grayscale image)
    this._cityFoundedDialog = null; // { cityName, year } | null
    this._cityFoundedImg = null;    // HTMLImageElement — cached
    // Find City dialog ("Where in the heck is...")
    this._findCityDialog = null;    // { rects, scroll } | null

    this._editTechsDialog = null;
    this._editUnitDialog = null;
    this._editCityDialog = null;
    this._editKingDialog = null;

    // Go To mode
    this._gotoMode = false;
    this._paradropMode = false;
    this._paradropTiles = [];  // valid drop tiles (highlighted)
    this._airliftMode = false;  // selecting airlift destination city
    this._rebaseMode  = false;  // selecting rebase destination for air unit

    // Foreign advisor / diplomacy screen
    this._diplomacyScreen      = false;
    this._diplomacyScreenRects = [];
    this._negotiationScreen    = null; // { civId, phase, response, lastProposal, techTradeMode, myAdvId, theirAdvId, _leaderName, _plural, _rects }
    this._heraldVideo           = null;
    this._heraldRenderState     = null;

    // Domestic Advisor (F1)
    this._domesticAdvisor = false;
    this._domesticScroll  = 0;
    this._domesticRects   = [];

    // Trade Advisor (F2)
    this._tradeAdvisor      = false;
    this._tradeAdvisorRects = [];
    this._tradeAdvisorScroll = 0;

    // Military Advisor (F3)
    this._militaryAdvisor = false;
    this._militaryRects   = [];

    // Attitude Advisor (F5)
    this._attitudeAdvisor = false;
    this._attitudeScroll  = 0;
    this._attitudeRects   = [];

    // Science Advisor (F6)
    this._scienceAdvisor      = false;
    this._scienceAdvisorRects = [];
    this._sciScroll           = 0;

    // Demographics screen (F7)
    this._demographicsScreen = false;
    this._demoCloseRect      = null;

    // Top 5 Cities
    this._top5Cities    = false;
    this._top5CloseRect = null;

    // Hall of Fame
    this._hallOfFame      = false;
    this._hofCloseRect    = null;

    // Retirement / Score flow (POWERgraph → Score → Hall of Fame)
    this._retireStage     = null;  // null | 'confirm' | 'powergraph' | 'score' | 'halloffame'
    this._retireScoreOnly = false; // F9/World Score closes to the map; retirement continues to HoF
    this._retireRects     = [];

    // Wonders of the World
    this._wondersList      = false;
    this._wondersCloseRect = null;

    // Civilopedia overlay
    this._civilopedia    = null;  // { tab:'advances'|'improv'|'units'|'terrain', selIdx:0, scroll:0, rects:[] }
    this._pediaTexts     = null;  // lazy-loaded: { advances:Map, units:Map, improv:Map, terrain:Map }
    this._cpdVisibleRows = 20;   // updated each draw, used by wheel handler

    // Tax/rate dialog
    this._rateDialog = null;

    // Menu bar state
    this._openMenu      = null;  // index into MENUS, or null
    this._menuBarRects  = [];    // [{x, w, menuIdx}] — populated during draw
    this._menuItemRects = [];    // [{x,y,w,h,action,disabled}] — current dropdown
    this._menuHoverIdx  = null;  // index into _menuItemRects
    this._bugReportDialog = null;

    // Title screen state
    this._titleScreen = false;
    this._titleRects  = [];
    this._titleSelection = 0;
    this._creditsScreen = false;
    this._creditsLines = null;
    this._creditsScroll = 0;
    this._creditsCloseRect = null;
    this._pendingMapData = null;

    // New Game wizard state (9-step dialog)
    this._wizard = null;  // null = inactive; object = wizard open
    this._wizardRects = [];

    // Game-over new game button rect (populated during _drawGameOver)
    this._gameOverNewGameRect = null;
    this._gameOverReplayRect  = null;
    this._gameOverVideoPlayed = false;  // true once we've played the victory/defeat video
    this._eventVideo          = null;   // currently playing event video (revolution, victory, launch)

    // Palace View overlay
    this._palaceView     = false;
    this._palaceCloseRect = null;

    // Throne Room overlay
    this._throneRoom      = false;
    this._throneCloseRect = null;
    this._throneUpgradeDialog = false; // show decoration choice dialog
    this._throneUpgradeRects  = [];    // clickable category buttons

    // End-game replay map
    this._replayMap       = false;
    this._replayFrame     = 0;
    this._replayTimer     = 0;
    this._replayCloseRect = null;

    // Spaceship launch button rect (populated during sidebar draw)
    this._launchRect = null;

    // Game Options / Graphic Options / City Report Options dialogs
    this._gameOptionsDialog = false;
    this._gameOptionsRects  = [];
    this._graphicOptionsDialog = false;
    this._graphicOptionsRects = [];
    this._cityReportOptionsDialog = false;
    this._cityReportOptionsRects = [];

    // Casualty Timeline dialog
    this._casualtyDialog      = false;
    this._casualtyDialogRects = [];

    // View grid toggle
    this._showGrid = false;

    // Spaceships viewer dialog
    this._spaceshipViewer      = false;
    this._spaceshipViewerRects = [];

    // Find City tracking
    this._lastFoundCityId = -1;

    // Domestic Advisor column visibility (M7 City Report Options)
    this._domesticColumns = { city: true, size: true, food: true, prod: true, trade: true, building: true, turns: true };

    // Mouse position (canvas coords) — used for edge scrolling
    this._mouseX = -1;
    this._mouseY = -1;

    // Auto-scroll tracking
    this._lastActiveUnit = null;
    this._canvasW = window.innerWidth;
    this._canvasH = window.innerHeight;

    // Music era tracking (null | 'menu' | 'ancient' | 'renaissance' | 'modern')
    this._currentMusicEra = null;

    // Civ2 marble wallpaper tiles (extracted from ICONS.GIF on first use)
    this._outerWallpaper = null;  // 64×32 coarse stone
    this._innerWallpaper = null;  // 32×32 fine marble

    // Pre-extracted intro images (from Intro.dll / Tiles.dll)
    this._introImages = {};
    this._loadIntroImages();

    // Civ2 seal/emblem (backgroundImage.gif from Tiles.dll)
    this._sealImage = null;
    this._loadSealImage();

    // Active unit blink timer (ms accumulated)
    this._blinkTime = 0;

    // Globe minimap toggle (axx0 MinimapPanel.cs: ShowGlobe/RemoveGlobe toggle)
    this._minimapGlobe = false;
    this._globeAngle   = 0;      // radians, incremented each frame for rotation

    // Unit movement animation state
    // _moveAnim: { unit, fromCol, fromRow, toCol, toRow, elapsed, duration } | null
    this._moveAnim = null;
    this._moveAnimQueue = [];           // queued path steps: [{col,row}, ...]
    this._moveAnimUnit  = null;         // unit walking the queued path
    this._MOVE_ANIM_DURATION = 240;     // 8 frames × 30ms per frame (matches Civ2)

    // Combat animation state
    this._combatAnim = null;
    this._COMBAT_ROUND_DURATION = 120;  // ms per displayed round
    this._COMBAT_RESULT_PAUSE   = 400;  // ms pause showing final state
    this._COMBAT_MAX_ROUNDS     = 12;   // cap displayed rounds (group extras)
    this._combatFlashCanvas     = null; // reusable offscreen canvas for flash effect

    this._wireAudio(gameState);
    this._bindKeys();
  }

  // ─── Audio helper ──────────────────────────────────────────────────────────
  _play(sfx) {
    if (!this.audio || !sfx) return;
    if (Array.isArray(sfx)) this.audio.playRandom(sfx);
    else                    this.audio.play(sfx);
  }

  // ─── Convenience accessors ─────────────────────────────────────────────────
  get _tiles()     { return this.gameState.tiles;      }
  get _resources() { return this.gameState._resources; }
  get _rivers()    { return this.gameState._rivers;    }

  // ─── Game event → audio ────────────────────────────────────────────────────

  _onGameEvent(type, data) {
    switch (type) {
      case 'neg':
        this._play(SFX.neg);
        break;
      case 'pos':
        this._play(SFX.pos);
        break;
      case 'revolutionComplete':
        this._govtChooser = true;
        this._govtChooserRects = [];
        this._play(SFX.newGovt);
        break;
      case 'governmentSet':
        this._play(SFX.newGovt);
        break;
      case 'combat': {
        this._play(combatSoundFor(data.atkData));
        const vis = this.gameState._visibility;
        const atkVis = vis?.[data.atkRow]?.[data.atkCol] ?? 0;
        const defVis = vis?.[data.defRow]?.[data.defCol] ?? 0;
        if (atkVis === 2 || defVis === 2) {
          this._startCombatAnim(data);
        }
        break;
      }
      case 'production':
        if (data.type === 'improvement') {
          this._play(improvementSoundFor(data.id, data.improvData));
          // Show wonder splash for human player's wonders
          if (data.improvData?.isWonder && data.city?.civId === 0) {
            this._wonderSplash = { name: data.improvData.name, city: data.city.name, id: data.id };
            this._startWonderVideo(data.id);
          }
        } else {
          this._play(SFX.pos);
        }
        break;
      case 'advance':
        this._play(advanceFanfare(ADVANCES[data.advId]));
        // Show tech discovery popup for human player (matches original Civ2 MGE)
        if (data.civId === 0 && ADVANCES[data.advId]) {
          const civAdj = this.gameState.civs[0]?.data?.adjective ?? '';
          this._advancePopup = { advId: data.advId, advName: ADVANCES[data.advId].name, civAdj };
        }
        break;
      case 'cityGrowth':
        this._play(SFX.cheers);
        if (data.city) {
          this._cityGrowthFlash = { col: data.city.col, row: data.city.row, elapsed: 0, duration: 500 };
        }
        break;
      case 'cityDisorder':
        this._play(SFX.cityDisorder);
        break;
      case 'cityCapture':
        this._captureDialog = { city: data.city };
        this._play(SFX.crowdBugle);
        break;
      case 'globalWarming':
        this._play(SFX.neg);
        break;
      case 'nukeStrike':
        this._play(SFX.combatNuke);
        break;
      case 'upgrade':
        this._play(SFX.pos);
        break;
      case 'apolloBuilt':
        this._play(SFX.newWonder);
        break;
      case 'spaceshipLaunched':
        this._play(SFX.pos);
        break;
      case 'buildComplete':
        // Builder (settler/engineer) finishes road/irrigation/mine/fortress/etc.
        if (data.type === 'road' || data.type === 'railroad') this._play(SFX.feedbackOk);
        else if (data.type === 'fortress' || data.type === 'buildAirbase') this._play(SFX.pos);
        else this._play(SFX.feedbackOk);
        break;
      case 'tradeArrival':
        this._tradeDialog = { unit: data.unit, city: data.city };
        this._play(SFX.pos);
        break;
      case 'tradeDelivery':
        this._play(SFX.pos);
        break;
      case 'diplomatArrival':
        this._diplomatDialog = { unit: data.unit, city: data.city };
        this._play(SFX.pos);
        break;
      case 'unitMoved': {
        // Start (or queue) a smooth slide animation for the moved unit.
        // Only animate when the unit is visible to the player (civ 0) AND
        // there is no queued auto-path running for a different unit.
        const vis = this.gameState._visibility;
        const fromVis = vis?.[data.fromRow]?.[data.fromCol] ?? 0;
        const toVis   = vis?.[data.toRow]?.[data.toCol] ?? 0;
        if (fromVis === 2 || toVis === 2) {
          this._startMoveAnim(data.unit, data.fromCol, data.fromRow, data.toCol, data.toRow);
        }
        break;
      }
      case 'aiPeaceProposal': {
        const civ = this.gameState.civs[data.fromCivId];
        this._aiPeaceProposal = {
          fromCivId:    data.fromCivId,
          proposalType: data.proposalType ?? 'peace',
          civName:   civ?.data?.adjective ?? `Civ ${data.fromCivId}`,
          leaderName: civ?.leaderNameOverride ?? civ?.data?.leader ?? 'The leader',
          plural:    civ?.data?.plural  ?? `Civ ${data.fromCivId}`,
        };
        this._play(SFX.letter);
        break;
      }
      // ── Newly wired events ──────────────────────────────────────────────
      case 'orderRestored':
        this._play(SFX.pos);
        break;
      case 'improvementSold':
        this._play(SFX.sell);
        break;
      case 'goodyHut':
        this._play(SFX.pos);
        break;
      case 'sentryWoke':
        this._play(SFX.feedbackWarn);
        break;
      case 'needResearch':
        this._researchChooser = true;
        this._researchChooserScroll = 0;
        {
          const civ = this.gameState.civs[0];
          this._researchGoalCandidates = civ?.researchGoal != null
            ? this._researchStepsTowardGoal(civ, civ.researchGoal)
            : null;
          this._researchChooserSelectedId = this._researchGoalCandidates?.[0] ?? null;
        }
        break;
      case 'needProduction':
        if (data.city) {
          this._cityScreen = data.city;
          this._cityScreenProdList = true; // open with production list visible
          this._cityScreenQueueAddMode = false;
          this._cityScreenProductionSelection = data.city.production ?? null;
        }
        break;
      case 'nukeIntercepted':
        this._play(SFX.pos);
        break;
      case 'manhattanBuilt':
      case 'unBuilt':
        this._play(SFX.newWonder);
        break;
      case 'cityRazed':
        this._play(SFX.explLarge);
        break;
      case 'unitDisbanded':
        this._play(SFX.guillotine);
        break;
      case 'gameOver': {
        this._play(SFX.pompCirc);
        const go = this.gameState.gameOver;
        if (go && !this._gameOverVideoPlayed) {
          this._gameOverVideoPlayed = true;
          // Save to Hall of Fame
          const civ0 = this.gameState.civs[0];
          MapRenderer._saveToHallOfFame({
            leader: civ0?.leaderNameOverride ?? civ0?.data?.leader ?? 'Unknown',
            civ: civ0?.data?.plural ?? 'Unknown',
            score: go.score ?? 0,
            difficulty: ['Chieftain','Warlord','Prince','King','Emperor','Deity'][this.gameState.difficulty ?? 0] ?? 'Chieftain',
            result: go.result,
            turn: this.gameState.turn,
            year: this.gameState.year,
            date: new Date().toISOString().slice(0, 10),
          });
          if (go.result === 'space-win') {
            this._playEventVideo('LAUNCH.webm', () => {
              this._playEventVideo('WINWIN.webm');
            });
          } else if (go.result === 'win' || go.result === 'score-win' || go.result === 'diplomatic-win') {
            this._playEventVideo('WINWIN.webm');
          } else {
            this._playEventVideo('LOSER.webm');
          }
        }
        break;
      }
      case 'revolutionStart': {
        this._play(SFX.neg);
        // Play era-appropriate anarchy video
        const yr = this.gameState.year ?? -4000;
        const era = yr >= 1500 ? 2 : yr >= 500 ? 1 : 0;
        this._playEventVideo(`ANARCHY${era}.webm`);
        break;
      }
      case 'weLoveKing':
        this._play(SFX.cheers);
        break;
      case 'throneUpgrade':
        // Show decoration choice dialog after a brief delay (let wonder video play first)
        this._throneUpgradeDialog = true;
        this._throneUpgradeRects  = [];
        break;
      case 'rushBuy':
        this._play(SFX.stockMarket);
        break;
      case 'pillage':
        this._play(SFX.explSmall);
        break;
      case 'airlift':
        this._play(SFX.pos);
        break;
      case 'unElection':
        this._play(SFX.pompCirc);
        break;
      case 'cityGovernorChanged':
        this._play(SFX.menuOk);
        break;
    }
  }

  // ─── Unit movement animation ───────────────────────────────────────────────

  _startMoveAnim(unit, fromCol, fromRow, toCol, toRow) {
    this._moveAnim = {
      unit, fromCol, fromRow, toCol, toRow,
      elapsed: 0,
      duration: this._MOVE_ANIM_DURATION,
    };
    // Record a dust trail at the source tile
    if (!this._moveTrails) this._moveTrails = [];
    this._moveTrails.push({ col: fromCol, row: fromRow, elapsed: 0, duration: 400 });
  }

  /** Advance the current move animation; returns true if one is still playing. */
  _tickMoveAnim(dt) {
    if (!this._moveAnim) return false;
    this._moveAnim.elapsed += dt;
    if (this._moveAnim.elapsed >= this._moveAnim.duration) {
      this._moveAnim = null;
      return false;
    }
    return true;
  }

  // ─── Combat animation ────────────────────────────────────────────────────

  _startCombatAnim(data) {
    const { combatLog, attackerWon, atkCol, atkRow, defCol, defRow,
            initialAtkHp, initialDefHp, atkMaxHp, defMaxHp,
            atkTypeId, defTypeId, atkCivId, defCivId } = data;

    // Condense log if more rounds than max — sample evenly, always include last
    let displayLog;
    if (combatLog.length <= this._COMBAT_MAX_ROUNDS) {
      displayLog = combatLog;
    } else {
      displayLog = [];
      const step = combatLog.length / this._COMBAT_MAX_ROUNDS;
      for (let i = 0; i < this._COMBAT_MAX_ROUNDS - 1; i++) {
        displayLog.push(combatLog[Math.floor(i * step)]);
      }
      displayLog.push(combatLog[combatLog.length - 1]);
    }

    // Clear any in-progress move animation — combat takes over
    this._moveAnim = null;
    this._moveAnimQueue = [];
    this._moveAnimUnit = null;

    this._combatAnim = {
      atkTypeId, defTypeId,
      atkCivId, defCivId,
      atkCol, atkRow, defCol, defRow,
      atkMaxHp, defMaxHp,
      initialAtkHp, initialDefHp,
      displayLog,
      logIndex: 0,
      elapsed: 0,
      phase: 'slide',         // start with slide-toward phase
      slideDuration: 150,     // ms for the slide toward defender
      attackerWon,
    };
  }

  _tickCombatAnim(dt) {
    if (!this._combatAnim) return false;
    const anim = this._combatAnim;
    anim.elapsed += dt;

    if (anim.phase === 'slide') {
      // Slide the attacker ~30% toward the defender, then snap back to rounds
      if (anim.elapsed >= anim.slideDuration) {
        anim.phase = 'rounds';
        anim.elapsed = 0;
      }
    } else if (anim.phase === 'rounds') {
      if (anim.elapsed >= this._COMBAT_ROUND_DURATION) {
        anim.elapsed -= this._COMBAT_ROUND_DURATION;
        anim.logIndex++;
        if (anim.logIndex >= anim.displayLog.length) {
          anim.phase = 'result';
          anim.elapsed = 0;
        }
      }
    } else if (anim.phase === 'result') {
      if (anim.elapsed >= this._COMBAT_RESULT_PAUSE) {
        this._combatAnim = null;
        return false;
      }
    }
    return true;
  }

  /** True when a movement or combat animation is actively playing. */
  get _isAnimating() { return this._moveAnim !== null || this._combatAnim !== null; }

  _wireAudio(gs) {
    gs.onEvent = (type, data) => this._onGameEvent(type, data);
  }

  // ─── Keyboard binding ──────────────────────────────────────────────────────

  _bindKeys() {
    window.addEventListener('keydown', e => {
      if (e.key === 'Shift') this._shiftHeld = true;
      this._onKeyDown(e);
    });
    window.addEventListener('keyup',   e => {
      if (e.key === 'Shift') this._shiftHeld = false;
      this._setScrollKey(e.key, false);
    });
    window.addEventListener('blur', () => { this._shiftHeld = false; });
    window.addEventListener('wheel',   e => {
      if (this._cityScreen) {
        this._cityScreenScroll = Math.max(0, this._cityScreenScroll + (e.deltaY > 0 ? 1 : -1));
        e.preventDefault();
      } else if (this._scienceAdvisor) {
        this._sciScroll = Math.max(0, (this._sciScroll ?? 0) + (e.deltaY > 0 ? 1 : -1));
        e.preventDefault();
      } else if (this._tradeAdvisor) {
        this._tradeAdvisorScroll = Math.max(0, this._tradeAdvisorScroll + (e.deltaY > 0 ? 1 : -1));
        e.preventDefault();
      } else if (this._researchChooser) {
        if (this._researchGoalDialog) {
          this._researchGoalScroll = Math.max(0, (this._researchGoalScroll ?? 0) + (e.deltaY > 0 ? 2 : -2));
        } else {
          this._researchChooserScroll = Math.max(0, this._researchChooserScroll + (e.deltaY > 0 ? 1 : -1));
        }
        e.preventDefault();
      } else if (this._editTechsDialog) {
        const d = this._editTechsDialog;
        d.scroll = Math.max(0, (d.scroll ?? 0) + (e.deltaY > 0 ? 1 : -1));
        e.preventDefault();
      } else if (this._editUnitDialog) {
        const d = this._editUnitDialog;
        d.typeScroll = Math.max(0, (d.typeScroll ?? 0) + (e.deltaY > 0 ? 1 : -1));
        e.preventDefault();
      } else if (this._editCityDialog) {
        const d = this._editCityDialog;
        d.scroll = Math.max(0, (d.scroll ?? 0) + (e.deltaY > 0 ? 1 : -1));
        e.preventDefault();
      } else if (this._editKingDialog) {
        const d = this._editKingDialog;
        d.scroll = Math.max(0, (d.scroll ?? 0) + (e.deltaY > 0 ? 1 : -1));
        e.preventDefault();
      } else if (this._domesticAdvisor) {
        this._domesticScroll = Math.max(0, this._domesticScroll + (e.deltaY > 0 ? 1 : -1));
        e.preventDefault();
      } else if (this._attitudeAdvisor) {
        this._attitudeScroll = Math.max(0, this._attitudeScroll + (e.deltaY > 0 ? 1 : -1));
        e.preventDefault();
      } else if (this._findCityDialog) {
        const d = this._findCityDialog;
        const maxScroll = Math.max(0, d.cities.length - 10);
        d.scroll = Math.max(0, Math.min(maxScroll, d.scroll + (e.deltaY > 0 ? 1 : -1)));
        e.preventDefault();
      } else if (this._civilopedia) {
        const cpd   = this._civilopedia;
        const items = this._getCivilopediaItems(cpd.tab);
        if ((cpd.mode ?? 'index') === 'index') {
          const delta = e.deltaY > 0 ? 1 : -1;
          cpd.scroll = Math.max(0, Math.min(Math.max(0, Math.ceil(items.length / 9) - 2), cpd.scroll + delta));
        }
        e.preventDefault();
      }
    }, { passive: false });

    // Track mouse position for edge scrolling
    window.addEventListener('mousemove', e => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    });

    // Menu item hover tracking (only active while a dropdown is open)
    window.addEventListener('mousemove', e => {
      if (this._openMenu === null) { this._menuHoverIdx = null; return; }
      const px = e.clientX, py = e.clientY;
      // Switch menu on bar hover while a dropdown is already open
      for (const mb of this._menuBarRects) {
        if (px >= mb.x && px < mb.x + mb.w && py >= TITLE_H && py < TOP_H) {
          if (mb.menuIdx !== this._openMenu) {
            this._openMenu = mb.menuIdx;
            this._menuHoverIdx = null;
            this._menuItemRects = [];
          }
          return;
        }
      }
      // Track hovered item in open dropdown
      this._menuHoverIdx = null;
      for (let i = 0; i < this._menuItemRects.length; i++) {
        const r = this._menuItemRects[i];
        if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
          this._menuHoverIdx = i; break;
        }
      }
    });
  }

  _onKeyDown(e) {
    if (this._titleScreen) { this._handleTitleScreenKey(e); return; }
    // ── Wizard intercepts all keys when active ──────────────────────────────
    if (this._wizard) { this._handleWizardKey(e); return; }
    if (this._bugReportDialog) { this._handleBugReportKey(e); return; }
    if (this._editCityDialog) { this._handleEditCityKey(e); return; }
    if (this._editTechsDialog) { this._handleEditTechsKey(e); return; }
    if (this._editUnitDialog) { this._handleEditUnitKey(e); return; }
    if (this._editKingDialog) { this._handleEditKingKey(e); return; }
    // City naming dialog intercepts typing
    if (this._cityNamingDialog) { this._handleCityNamingKey(e); return; }
    // City founded dialog — Enter/Escape/click dismisses
    if (this._cityFoundedDialog) {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') this._cityFoundedDialog = null;
      return;
    }
    // Find city dialog — arrow keys + Enter
    if (this._findCityDialog) {
      const d = this._findCityDialog;
      if (e.key === 'Escape') { this._findCityDialog = null; return; }
      if (e.key === 'ArrowDown') { d.selected = Math.min(d.cities.length - 1, d.selected + 1); if (d.selected >= d.scroll + 10) d.scroll = d.selected - 9; return; }
      if (e.key === 'ArrowUp') { d.selected = Math.max(0, d.selected - 1); if (d.selected < d.scroll) d.scroll = d.selected; return; }
      if (e.key === 'Enter') {
        const city = d.cities[d.selected];
        if (city) { this.centerOn(city.col, city.row, this._canvasW, this._canvasH); this._cityScreen = city; }
        this._findCityDialog = null;
        return;
      }
      return;
    }
    // Block game keys during combat animation
    if (this._combatAnim) return;

    this._setScrollKey(e.key, true);

    if (this._handleDialogKey(e)) return;
    this._handleGameKey(e);
  }

  _handleDialogKey(e) {
    if (e.key !== 'Escape') return false;

    const gs = this.gameState;

    // Modal dialogs first
    if (this._bugReportDialog) { this._bugReportDialog = null;                       return true; }
    if (this._civilopedia)     { this._civilopedia = null;                             return true; }
    if (this._cityScreen && this._cityScreenProdList) {
      this._cityScreenProdList = false;
      return true;
    }
    if (this._cityScreen)      { this._cityScreen = null;                              return true; }
    if (this._tileInfoPopup)   { this._tileInfoPopup = null;                            return true; }
    if (this._unitMenu)        { this._unitMenu = null;                                return true; }
    if (this._captureDialog)   { gs._captureCity(this._captureDialog.city, 0); this._captureDialog = null; return true; }
    if (this._cityNamingDialog)  { this._cityNamingDialog = null;                       return true; }
    if (this._cityFoundedDialog) { this._cityFoundedDialog = null;                      return true; }
    if (this._findCityDialog)    { this._findCityDialog = null;                         return true; }
    if (this._editTechsDialog)   { this._closeEditTechsDialog();                        return true; }
    if (this._editUnitDialog)    { this._editUnitDialog = null;                         return true; }
    if (this._editCityDialog)    { this._editCityDialog = null;                         return true; }
    if (this._editKingDialog)    { this._editKingDialog = null;                         return true; }
    if (this._throneUpgradeDialog) { return true; }

    // Dialogs & choosers
    if (this._advancePopup)    { this._advancePopup = null;                             return true; }
    if (this._researchChooser) {
      this._researchChooser = false;
      this._researchGoalDialog = false;
      this._researchGoalCandidates = null;
      this._researchChooserSelectedId = null;
      this._researchGoalSelectedId = null;
      return true;
    }
    if (this._rateDialog)      { this._rateDialog = null;                             return true; }
    if (this._tradeDialog)     { this._tradeDialog = null;                                return true; }
    if (this._diplomatDialog)  { this._diplomatDialog = null;                             return true; }
    if (this._negotiationScreen) { this._stopHeraldVideo(); this._negotiationScreen = null; return true; }
    if (this._diplomacyScreen) { this._diplomacyScreen = false;                      return true; }
    if (this._aiPeaceProposal) { this._aiPeaceProposal = null;                          return true; }
    if (this._highCouncil)     { this._stopCouncilVideo(); this._highCouncil = false;     return true; }
    if (this._wonderSplash)    { this._stopWonderVideo(); this._wonderSplash = null;      return true; }
    if (this._scenarioCivChooser)  { this._scenarioCivChooser = false; this._scenarioPending = null; return true; }

    // Advisors & info screens
    if (this._retireStage)        { this._retireStage = null; this._retireScoreOnly = false; return true; }
    if (this._scienceAdvisor)     { this._scienceAdvisor = false;                     return true; }
    if (this._tradeAdvisor)       { this._tradeAdvisor = false;                       return true; }
    if (this._domesticAdvisor)    { this._domesticAdvisor = false; this._domesticColumnsOpen = false; return true; }
    if (this._militaryAdvisor)    { this._militaryAdvisor = false;                    return true; }
    if (this._attitudeAdvisor)    { this._attitudeAdvisor = false;                    return true; }
    if (this._demographicsScreen) { this._demographicsScreen = false;                 return true; }
    if (this._top5Cities)         { this._top5Cities = false;                         return true; }
    if (this._hallOfFame)         { this._hallOfFame = false;                         return true; }
    if (this._wondersList)        { this._wondersList = false;                        return true; }
    if (this._gameOptionsDialog)       { this._gameOptionsDialog = false;                  return true; }
    if (this._graphicOptionsDialog)    { this._graphicOptionsDialog = false;               return true; }
    if (this._cityReportOptionsDialog) { this._cityReportOptionsDialog = false;            return true; }
    if (this._casualtyDialog)     { this._casualtyDialog = false;                     return true; }
    if (this._spaceshipViewer)    { this._spaceshipViewer = false;                    return true; }
    if (this._palaceView)         { this._palaceView = false;                        return true; }
    if (this._throneRoom)         { this._throneRoom = false;                        return true; }
    if (this._replayMap)          { this._replayMap = false;                         return true; }
    if (this._govtChooser)     { return true; }

    // Movement modes (lowest priority — background state)
    if (this._unitMoveMode)    { this._unitMoveMode = false; this._moveRangeTiles = null; return true; }
    if (this._gotoMode)        { this._gotoMode = false;                              return true; }
    if (this._paradropMode)    { this._paradropMode = false; this._paradropTiles = []; return true; }
    if (this._airliftMode)     { this._airliftMode = false;                           return true; }
    if (this._rebaseMode)      { this._rebaseMode = false;                            return true; }

    return false;
  }

  _handleGameKey(e) {
    const gs = this.gameState;

    // Shift+C → Find City (axx0: Shift+C)
    if (e.shiftKey && e.key === 'C') { this._executeMenuAction('kd_findcity'); return true; }

    // Shift+H → View Throne Room (axx0: Shift+H)
    if (e.shiftKey && e.key === 'H') { this._executeMenuAction('view_throne'); return true; }

    // Shift+R → REVOLUTION (axx0: Shift+R)
    if (e.shiftKey && e.key === 'R') { this._executeMenuAction('kd_revolution'); return true; }

    // Ctrl shortcuts (axx0 Game menu)
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); this._executeMenuAction('game_options'); return true; }
    if (e.ctrlKey && e.key === 'p') { e.preventDefault(); this._executeMenuAction('game_graphicoptions'); return true; }
    if (e.ctrlKey && e.key === 'e') { e.preventDefault(); this._executeMenuAction('game_cityreportoptions'); return true; }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); this._executeMenuAction('game_save'); return true; }
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); this._executeMenuAction('game_load'); return true; }
    if (e.ctrlKey && e.key === 'r') { e.preventDefault(); this._executeMenuAction('game_retire'); return true; }
    if (e.ctrlKey && e.key === 'q') { e.preventDefault(); this._executeMenuAction('game_quit'); return true; }

    // Ctrl+N → End Player Turn (axx0: Ctrl+N)
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); this._executeMenuAction('ord_endturn'); return true; }

    // Ctrl+D → Casualty Timeline (axx0: Ctrl+D)
    if (e.ctrlKey && e.key === 'd') { e.preventDefault(); this._executeMenuAction('adv_casualties'); return true; }

    // F-key advisor shortcuts (axx0)
    if (e.key === 'F1')  { this._executeMenuAction('adv_domestic'); return true; }
    if (e.key === 'F2')  { this._executeMenuAction('adv_military'); return true; }
    if (e.key === 'F3')  { this._executeMenuAction('adv_foreign');  return true; }
    if (e.key === 'F4')  { this._executeMenuAction('adv_attitude'); return true; }
    if (e.key === 'F5')  { this._executeMenuAction('adv_trade');    return true; }
    if (e.key === 'F6')  { this._executeMenuAction('adv_science');  return true; }
    if (e.key === 'F7')  { this._executeMenuAction('wld_wonders');  return true; }
    if (e.key === 'F8')  { this._executeMenuAction('wld_top5');     return true; }
    if (e.key === 'F9')  { this._executeMenuAction('wld_score');    return true; }
    if (e.key === 'F11') { this._executeMenuAction('wld_demo');     return true; }
    if (e.key === 'F12') { this._executeMenuAction('wld_spaceships'); return true; }

    // Shift+T → Tax Rate (axx0: Shift+T)
    if (e.shiftKey && e.key === 'T') { this._openRateDialog('kd_tax'); return true; }

    // Ctrl+G → Show Map Grid (axx0: Ctrl+G)
    if (e.ctrlKey && e.key === 'g') { e.preventDefault(); this._executeMenuAction('view_grid'); return true; }
    // Ctrl+K → Toggle Cheat Mode (axx0: Ctrl+K)
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); this._executeMenuAction('cheat_toggle'); return true; }
    // Ctrl+Z → Max Zoom In (axx0: Ctrl+Z)
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this._executeMenuAction('view_maxzoomin'); return true; }
    // Ctrl+X → Max Zoom Out (axx0: Ctrl+X)
    if (e.ctrlKey && e.key === 'x') { e.preventDefault(); this._executeMenuAction('view_maxzoomout'); return true; }
    // Shift+Z → Standard Zoom (axx0: Shift+Z)
    if (e.shiftKey && e.key === 'Z') { this._executeMenuAction('view_stdzoom'); return true; }
    // Shift+X → Medium Zoom Out (axx0: Shift+X)
    if (e.shiftKey && e.key === 'X') { this._executeMenuAction('view_medzoomout'); return true; }

    // City screen swallows all other keys
    if (this._cityScreen) return true;

    const au = gs.activeUnit;

    // Tab → cycle through units in the active unit's stack
    if (e.key === 'Tab') {
      e.preventDefault();
      if (au) gs.cycleStack(1);
      return true;
    }

    if (this._handleUnitKey(e, au)) return true;

    // View shortcuts (no modifier, no conflict with unit keys above)
    if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
      if (e.key === 't') { this._executeMenuAction('view_hidden'); return true; }
      if (e.key === 'c') { this._executeMenuAction('view_center'); return true; }
      if (e.key === 'v') { this._executeMenuAction(this._viewOnlyMode ? 'view_movepieces' : 'view_viewpieces'); return true; }
      if (e.key === 'z') { this._executeMenuAction('view_zoomin'); return true; }
      if (e.key === 'x') { this._executeMenuAction('view_zoomout'); return true; }
    }

    // Space / Enter → end turn (Space falls here only when no active unit)
    if (e.key === ' ' || e.key === 'Enter') {
      if (gs.activeCivIdx === 0) { gs.endTurn(); this._play(SFX.endTurn); }
      return true;
    }

    return false;
  }

  _handleUnitKey(e, au) {
    const gs = this.gameState;
    if (!(au && au.civId === 0)) return false;

    // Space → skip turn (axx0: SPACE)
    if (e.key === ' ') { gs.skipUnit(au); return true; }
    // F → fortify (axx0: f)
    if (e.key === 'f' || e.key === 'F') { gs.fortifyUnit(au); return true; }
    // S → sleep (axx0: s)
    if (e.key === 's' || e.key === 'S') { gs.sleepUnit(au); return true; }
    // W → wait (axx0: w)
    if (e.key === 'w' || e.key === 'W') { gs.waitUnit?.(au); return true; }
    // U → unload (axx0: u)
    if (e.key === 'u' || e.key === 'U') { if (au.cargo?.length) gs.unloadAll(au); return true; }
    // H → set home city (axx0: h)
    if (e.key === 'h' || e.key === 'H') { gs.goHomeUnit(au); return true; }
    // G → go to (axx0: g)
    if (e.key === 'g' || e.key === 'G') { this._gotoMode = true; return true; }
    // A → activate unit (axx0: a)
    if (e.key === 'a' || e.key === 'A') {
      au.sleeping = false; au.fortified = false; au.sentry = false;
      return true;
    }
    // Shift+P → Pillage (axx0: Shift+P)
    if (e.key === 'P' && e.shiftKey) {
      if (gs.pillageUnit) gs.pillageUnit(au);
      return true;
    }
    // Shift+D → Disband (axx0: Shift+D)
    if (e.key === 'D' && e.shiftKey) { gs.disbandUnit(au); return true; }
    // P → paradrop (axx0: p)
    if (e.key === 'p' || e.key === 'P') {
      const info = gs.getParadropInfo(au);
      if (info.canParadrop) {
        this._paradropMode = true;
        this._paradropTiles = info.validTiles;
      }
      return true;
    }
    // L → airlift (axx0: l; settlers use L for railroad in build keys below)
    if ((e.key === 'l' || e.key === 'L') && UNITS[au.typeId]?.role !== 5) {
      const targets = gs.getAirliftTargets(au);
      if (targets.length > 0) {
        this._airliftMode = true;
      }
      return true;
    }
    // K → automate settler (axx0: k)
    if ((e.key === 'k' || e.key === 'K') && UNITS[au.typeId]?.role === 5) {
      au.autoSettler = !au.autoSettler;
      return true;
    }
    // B → build new city (axx0: b)
    if (e.key === 'b' || e.key === 'B') {
      if (UNITS[au.typeId].role === 5) {
        this._openCityNamingDialog(au);
      }
      return true;
    }

    // Settler terrain-improvement keys (R=road, L=railroad, I=irrigate, M=mine)
    // These override the R=research-chooser shortcut when a settler is active.
    if (UNITS[au.typeId]?.role === 5) {
      if (!au.buildTask) {
        if (e.key === 'r' || e.key === 'R') { gs.startBuild(au, 'road');       return true; }
        if (e.key === 'l' || e.key === 'L') { gs.startBuild(au, 'railroad');   return true; }
        if (e.key === 'i' || e.key === 'I') { gs.startBuild(au, 'irrigation'); return true; }
        if (e.key === 'm' || e.key === 'M') { gs.startBuild(au, 'mine');       return true; }
        if (e.key === 'p' || e.key === 'P') { gs.startBuild(au, 'cleanPollution'); return true; }
        if (e.key === 'o' || e.key === 'O') { gs.startBuild(au, 'transformTerrain'); return true; }
        if (e.key === 'e' || e.key === 'E') { gs.startBuild(au, 'buildAirbase'); return true; }
      } else {
        // Pressing any build key while building → cancel the task
        if (e.key === 'r' || e.key === 'R' ||
            e.key === 'l' || e.key === 'L' ||
            e.key === 'i' || e.key === 'I' ||
            e.key === 'm' || e.key === 'M' ||
            e.key === 'p' || e.key === 'P' ||
            e.key === 'o' || e.key === 'O' ||
            e.key === 'e' || e.key === 'E') { gs.cancelBuild(au); return true; }
      }
    }

    return false;
  }

  _setScrollKey(key, down) {
    switch (key) {
      case 'ArrowUp':    case 'w': case 'W': this._scrollKeys.up    = down; break;
      case 'ArrowDown':                       this._scrollKeys.down  = down; break;
      case 'ArrowLeft':  case 'a': case 'A': this._scrollKeys.left  = down; break;
      case 'ArrowRight':                      this._scrollKeys.right = down; break;
      // s/d intentionally omitted — bound to Sleep and Shift+D=Disband unit actions
    }
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  update(dt = 0) {
    this._blinkTime += dt;

    if (this._minimapGlobe) {
      this._globeAngle += dt * 0.003;
    }

    // Tick unit movement animation
    if (this._moveAnim) {
      this._tickMoveAnim(dt);
      // When animation finishes and there are queued path steps, execute the next
      if (!this._moveAnim && this._moveAnimQueue.length > 0) {
        const au = this._moveAnimUnit;
        if (au && au.movesLeft > 0 && au.status === 'active') {
          const step = this._moveAnimQueue.shift();
          this.gameState.moveUnit(au, step.col, step.row);
          this._play(SFX.moveUnit);
        } else {
          // Unit can't continue — clear queue
          this._moveAnimQueue = [];
          this._moveAnimUnit  = null;
          this._unitMoveMode  = false;
          this._moveRangeTiles = null;
        }
        // After queue empties, update range tiles or exit move mode
        if (this._moveAnimQueue.length === 0 && this._moveAnimUnit) {
          const au = this._moveAnimUnit;
          if (this.gameState.activeUnit === au && au.movesLeft > 0 && au.status === 'active') {
            this._moveRangeTiles = this._calcReachableTiles(au);
          } else {
            this._unitMoveMode   = false;
            this._moveRangeTiles = null;
          }
          this._moveAnimUnit = null;
        }
      }
    }

    // Tick combat animation
    if (this._combatAnim) {
      this._tickCombatAnim(dt);
    }

    // Tick city growth flash
    if (this._cityGrowthFlash) {
      this._cityGrowthFlash.elapsed += dt;
      if (this._cityGrowthFlash.elapsed >= this._cityGrowthFlash.duration) {
        this._cityGrowthFlash = null;
      }
    }

    // Tick "no units" city flash box
    if (this._cityFlashBox) {
      this._cityFlashBox.elapsed += dt;
      if (this._cityFlashBox.elapsed >= this._cityFlashBox.duration) {
        this._cityFlashBox = null;
      }
    }

    // Tick movement trails
    if (this._moveTrails) {
      for (let i = this._moveTrails.length - 1; i >= 0; i--) {
        this._moveTrails[i].elapsed += dt;
        if (this._moveTrails[i].elapsed >= this._moveTrails[i].duration) {
          this._moveTrails.splice(i, 1);
        }
      }
    }

    // Wizard cursor blink (step 7 = name input)
    if (this._wizard && this._wizard.step === 7) {
      this._wizard.cursorBlink += dt;
    }

    if (this._creditsScreen) this._creditsScroll += dt * 0.018;

    // Check if music era needs to change
    if (this.gameState && !this._titleScreen && !this._wizard) {
      this._startEraMusic(this.gameState.year);
    }

    const EDGE   = 20;
    const tileWS = this._getTileWS();
    const tileHS = this._getTileHS();
    const totalW = this.mapCols * tileWS;
    const MAP_W  = this._canvasW - SB_W;
    const maxY   = this.mapRows * (tileHS / 2) + tileHS;

    if (!this._titleScreen) {
      if (this._scrollKeys.up)    this.viewY -= SCROLL_SPEED;
      if (this._scrollKeys.down)  this.viewY += SCROLL_SPEED;
      if (this._scrollKeys.left)  this.viewX -= SCROLL_SPEED;
      if (this._scrollKeys.right) this.viewX += SCROLL_SPEED;
    }

    // Edge scrolling — only when no overlay is open and mouse is in the map area
    const noOverlay = !this._titleScreen && !this._cityScreen && !this._wizard && !this._rateDialog &&
                      !this._govtChooser && !this._researchChooser && !this._diplomacyScreen &&
                      !this._captureDialog && !this._tradeDialog && !this._diplomatDialog &&
                      !this._scienceAdvisor && !this._tradeAdvisor && !this._domesticAdvisor && !this._militaryAdvisor && !this._attitudeAdvisor &&
                      !this._demographicsScreen && !this._top5Cities && !this._hallOfFame && !this._wondersList &&
                      !this._gameOptionsDialog && !this._casualtyDialog && !this._spaceshipViewer &&
                      !this._civilopedia && !this._cityNamingDialog && !this._cityFoundedDialog && !this._findCityDialog;
    if (noOverlay && this._mouseX >= 0 && this._mouseY >= TOP_H && this._mouseX < MAP_W) {
      if (this._mouseX < EDGE)                    this.viewX -= SCROLL_SPEED;
      if (this._mouseX > MAP_W - EDGE)            this.viewX += SCROLL_SPEED;
      if (this._mouseY < TOP_H + EDGE)            this.viewY -= SCROLL_SPEED;
      if (this._mouseY > this._canvasH - EDGE)    this.viewY += SCROLL_SPEED;
    }

    // Horizontal wrap (world loop), vertical clamp
    this.viewX = ((this.viewX % totalW) + totalW) % totalW;
    this.viewY = Math.max(0, Math.min(this.viewY, maxY));

    // Auto-scroll: if the active unit changed (game selected the next one),
    // centre the viewport on it — but don't override manual scroll keys.
    const au = this.gameState.activeUnit;
    if (au !== this._lastActiveUnit) {
      // Auto-enter move mode when a new unit becomes active
      if (au && au.movesLeft > 0 && au.status === 'active') {
        this._unitMoveMode   = true;
        this._moveRangeTiles = this._calcReachableTiles(au);
        this._unitMenu       = null;
      }
      // Flash city box when no units left to move
      if (!au && this._lastActiveUnit && this.gameState.activeCivIdx === 0) {
        const city = this.gameState.cities.find(c => c.civId === 0);
        if (city) {
          this._cityFlashBox = { col: city.col, row: city.row, elapsed: 0, duration: 1500 };
        }
      }
      this._lastActiveUnit = au;
      const scrolling = Object.values(this._scrollKeys).some(Boolean);
      if (au && !scrolling) {
        this.centerOn(au.col, au.row, this._canvasW, this._canvasH);
      }
    }
  }

  setHoveredTile(tile) {
    this._hoveredTile = tile;
  }

  _setZoomLevel(level) {
    if (level === this._zoomLevel) return;
    const oldLevel = this._zoomLevel;
    this._zoomLevel = Math.max(1, Math.min(4, level));
    if (this._zoomLevel !== oldLevel) {
      this.gameState.log.unshift(`Zoom level ${this._zoomLevel}`);
    }
  }

  _getZoomScale() {
    return this._zoomScales[this._zoomLevel - 1];
  }

  _getTileWS() {
    return Math.floor(TILE_W * SCALE * this._getZoomScale());
  }

  _getTileHS() {
    return Math.floor(TILE_H * SCALE * this._getZoomScale());
  }

  /**
   * Centre the viewport on tile (col, row).
   * @param {number} col
   * @param {number} row
   * @param {number} canvasW
   * @param {number} canvasH
   */
  centerOn(col, row, canvasW, canvasH) {
    const tileWS = this._getTileWS();
    const tileHS = this._getTileHS();
    const zoomScale = this._getZoomScale();
    const totalW = this.mapCols * tileWS;
    const { x, y } = tileToScreen(col, row, 0, 0, zoomScale);
    const rawX = x - (canvasW - SB_W) / 2 + tileWS / 2;
    this.viewX = ((rawX % totalW) + totalW) % totalW;
    this.viewY = Math.max(0, y - (canvasH - TOP_H) / 2 + tileHS / 2);
  }

  // ─── Click handling ────────────────────────────────────────────────────────

  /**
   * Right-click on the map: show tile info popup (Civ2 "View Piece").
   */
  handleRightClick(px, py, canvasW, canvasH) {
    if (this._titleScreen || this._wizard || this._cityScreen) return;
    if (this.gameState.gameOver) return;

    const zoomScale = this._getZoomScale();
    const rawTile = screenToTile(px, py, this.viewX, this.viewY, zoomScale);
    if (!rawTile) return;
    const col = ((rawTile.col % this.mapCols) + this.mapCols) % this.mapCols;
    const row = rawTile.row;
    if (row < 0 || row >= this.mapRows) return;

    const vis = this.gameState._visibility?.[row]?.[col] ?? 2;
    if (vis === 0) return;

    this._tileInfoPopup = { col, row, sx: px, sy: py };
  }

  /**
   * Single entry-point for all canvas clicks. Routes to city screen,
   * mini-map, or tile game-logic as appropriate.
   */
  handleRawClick(px, py, canvasW, canvasH) {
    // ── Title screen takes highest priority ───────────────────────────────────
    if (this._titleScreen) {
      if (this._hallOfFame) { this._handleHallOfFameClick(px, py); return; }
      if (this._creditsScreen) { this._handleCreditsClick(px, py); return; }
      this._handleTitleScreenClick(px, py, canvasW, canvasH);
      return;
    }

    // ── New Game wizard takes priority ─────────────────────────────────────────
    if (this._wizard) {
      this._handleNewGameWizardClick(px, py, canvasW, canvasH);
      return;
    }

    if (this._bugReportDialog) {
      this._handleBugReportClick(px, py);
      return;
    }

    // ── Retirement flow (POWERgraph → Score → HoF) ──────────────────────────
    if (this._retireStage) {
      this._handleRetireFlowClick(px, py);
      return;
    }

    // ── Game-over screen — New Game and Replay buttons ──────────────────────
    if (this.gameState.gameOver) {
      if (this._replayMap) { this._replayMap = false; return; }
      const r = this._gameOverNewGameRect;
      if (r && px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
        this._openNewGameWizard();
        return;
      }
      const rr = this._gameOverReplayRect;
      if (rr && px >= rr.x && px < rr.x + rr.w && py >= rr.y && py < rr.y + rr.h) {
        this._replayMap = true;
        this._replayFrame = 0;
        this._replayTimer = 0;
        return;
      }
      return;
    }

    // ── Open dropdown: consume click (execute action or close) ────────────────
    if (this._openMenu !== null) {
      const hit = this._menuItemRects.find(
        r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
      );
      this._openMenu = null;
      this._menuHoverIdx = null;
      if (hit && !hit.disabled) { this._executeMenuAction(hit.action); return; }
      // Click on menu bar → re-open (handled below after clearing state)
      for (const mb of this._menuBarRects) {
        if (px >= mb.x && px < mb.x + mb.w && py >= TITLE_H && py < TOP_H) {
          this._openMenu = mb.menuIdx; return;
        }
      }
      return; // click elsewhere — just close
    }

    // Trade arrival dialog
    if (this._tradeDialog) {
      this._handleTradeDialogClick(px, py, canvasW, canvasH);
      return;
    }

    // Diplomat action dialog
    if (this._diplomatDialog) {
      this._handleDiplomatDialogClick(px, py, canvasW, canvasH);
      return;
    }

    // AI peace proposal dialog
    if (this._aiPeaceProposal) {
      this._handleAiPeaceDialogClick(px, py, canvasW, canvasH);
      return;
    }

    // High Council — click anywhere to dismiss
    if (this._highCouncil) { this._stopCouncilVideo(); this._highCouncil = false; return; }

    // Advance discovery popup — click anywhere to dismiss
    if (this._advancePopup) { this._advancePopup = null; return; }

    // Wonder splash — click anywhere to dismiss
    if (this._wonderSplash) { this._stopWonderVideo(); this._wonderSplash = null; return; }

    // Scenario civ chooser
    if (this._scenarioCivChooser) { this._handleScenarioCivClick(px, py); return; }

    // Throne upgrade dialog — pick a category
    if (this._throneUpgradeDialog) { this._handleThroneUpgradeClick(px, py); return; }

    // Palace view — click anywhere to close
    if (this._palaceView) { this._palaceView = false; return; }

    // Throne room — click anywhere to close
    if (this._throneRoom) { this._throneRoom = false; return; }

    // Replay map — click anywhere to close
    if (this._replayMap) { this._replayMap = false; return; }

    // City naming dialog
    if (this._cityNamingDialog) {
      this._handleCityNamingClick(px, py, canvasW, canvasH);
      return;
    }

    // City founded dialog — click OK to dismiss
    if (this._cityFoundedDialog) {
      this._handleCityFoundedClick(px, py, canvasW, canvasH);
      return;
    }

    // Find City dialog
    if (this._findCityDialog) {
      this._handleFindCityClick(px, py, canvasW, canvasH);
      return;
    }

    if (this._editTechsDialog) {
      this._handleEditTechsClick(px, py, canvasW, canvasH);
      return;
    }

    if (this._editUnitDialog) {
      this._handleEditUnitClick(px, py, canvasW, canvasH);
      return;
    }

    if (this._editCityDialog) {
      this._handleEditCityClick(px, py, canvasW, canvasH);
      return;
    }

    if (this._editKingDialog) {
      this._handleEditKingClick(px, py, canvasW, canvasH);
      return;
    }

    // City capture dialog
    if (this._captureDialog) {
      this._handleCaptureDialogClick(px, py, canvasW, canvasH);
      return;
    }

    // Dismiss tile info popup on any left-click
    if (this._tileInfoPopup) { this._tileInfoPopup = null; return; }

    if (this._cityScreen) {
      this._handleCityScreenClick(px, py, canvasW, canvasH);
      return;
    }

    // Unit action menu
    if (this._unitMenu) {
      const hit = this._unitMenu.rects.find(
        r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
      );
      if (hit) {
        this._executeUnitMenuAction(hit.id);
      } else {
        this._unitMenu = null;
      }
      return;
    }

    // Government chooser
    if (this._govtChooser) {
      this._handleGovtChooserClick(px, py);
      return;
    }

    // Tax/rate dialog
    if (this._rateDialog) {
      this._handleRateDialogClick(px, py);
      return;
    }

    // Negotiation screen (overlays on top of FA screen)
    if (this._negotiationScreen) {
      this._handleNegotiationClick(px, py);
      return;
    }

    // Diplomacy screen
    if (this._diplomacyScreen) {
      this._handleDiplomacyClick(px, py);
      return;
    }

    // Science Advisor
    if (this._scienceAdvisor) {
      this._handleScienceAdvisorClick(px, py);
      return;
    }

    // Trade Advisor
    if (this._tradeAdvisor) {
      this._handleTradeAdvisorClick(px, py);
      return;
    }

    // Domestic Advisor
    if (this._domesticAdvisor) {
      this._handleDomesticClick(px, py);
      return;
    }

    // Military Advisor
    if (this._militaryAdvisor) {
      this._handleMilitaryClick(px, py);
      return;
    }

    // Attitude Advisor
    if (this._attitudeAdvisor) {
      this._handleAttitudeClick(px, py);
      return;
    }

    // Demographics screen
    if (this._demographicsScreen) {
      this._handleDemographicsClick(px, py);
      return;
    }

    // Top 5 Cities
    if (this._top5Cities) {
      this._handleTop5Click(px, py);
      return;
    }

    // Hall of Fame
    if (this._hallOfFame) {
      this._handleHallOfFameClick(px, py);
      return;
    }

    // Wonders of the World
    if (this._wondersList) {
      this._handleWondersClick(px, py);
      return;
    }

    // Game Options / Graphic Options / City Report Options dialogs
    for (const [dialogFlag, rectsKey, optsKey] of [
      ['_gameOptionsDialog', '_gameOptionsRects', '_gameOptions'],
      ['_graphicOptionsDialog', '_graphicOptionsRects', '_graphicOptions'],
      ['_cityReportOptionsDialog', '_cityReportOptionsRects', '_cityReportOptions'],
    ]) {
      if (this[dialogFlag] && this[rectsKey]) {
        const hit = this[rectsKey].find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
        if (hit) {
          if (hit.key === '_close') {
            this[dialogFlag] = false;
          } else {
            const opts = this.gameState[optsKey] ?? (this.gameState[optsKey] = {});
            opts[hit.key] = !opts[hit.key];
            // Sync HD sprites toggle with SpriteManager
            if (hit.key === 'hdSprites') {
              this.sprites.setHdMode(!!opts[hit.key]);
            }
          }
          return;
        }
      }
    }

    // Casualty Timeline dialog
    if (this._casualtyDialog && this._casualtyDialogRects) {
      const hit = this._casualtyDialogRects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
      if (hit && hit.key === '_close') { this._casualtyDialog = false; }
      return; // block click-through to map
    }

    // Spaceships Viewer dialog
    if (this._spaceshipViewer && this._spaceshipViewerRects) {
      const hit = this._spaceshipViewerRects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
      if (hit && hit.key === '_close') { this._spaceshipViewer = false; }
      return; // block click-through to map
    }

    // Civilopedia
    if (this._civilopedia) {
      this._handleCivilopediaClick(px, py);
      return;
    }

    // Research chooser
    if (this._researchChooser) {
      this._handleResearchChooserClick(px, py);
      return;
    }

    // Title bar — ignore
    if (py < TITLE_H) return;

    // Menu bar — open dropdown
    if (py < TOP_H) { this._handleMenuBarClick(px); return; }

    // Sidebar — route to sidebar handler
    if (px >= canvasW - SB_W) {
      this._handleSidebarClick(px, py, canvasW, canvasH);
      return;
    }

    const zoomScale = this._getZoomScale();
    const rawTile = screenToTile(px, py, this.viewX, this.viewY, zoomScale);
    if (!rawTile) return;
    const tile = {
      col: ((rawTile.col % this.mapCols) + this.mapCols) % this.mapCols,
      row: rawTile.row,
    };
    if (tile.row < 0 || tile.row >= this.mapRows) return;

    // Block map clicks while an animation is playing
    if (this._moveAnim || this._moveAnimQueue.length > 0 || this._combatAnim) return;

    // Go To mode — set goto target
    if (this._paradropMode) {
      const au = this.gameState.activeUnit;
      if (au) {
        const ok = this.gameState.paradropUnit(au, tile.col, tile.row);
        if (!ok) this._play(SFX.neg ?? 0);
      }
      this._paradropMode = false;
      this._paradropTiles = [];
      return;
    }

    if (this._airliftMode) {
      const au = this.gameState.activeUnit;
      if (au) {
        const destCity = this.gameState.cityAt(tile.col, tile.row);
        if (destCity) {
          const ok = this.gameState.airliftUnit(au, destCity);
          if (!ok) this._play(SFX.neg ?? 0);
        }
      }
      this._airliftMode = false;
      return;
    }

    if (this._rebaseMode) {
      const au = this.gameState.activeUnit;
      if (au) {
        const ok = this.gameState.rebaseUnit(au, tile.col, tile.row);
        if (!ok) this._play(SFX.neg ?? 0);
      }
      this._rebaseMode = false;
      return;
    }

    if (this._gotoMode) {
      const au = this.gameState.activeUnit;
      if (au) {
        this.gameState.startGoto(au, tile.col, tile.row);
      }
      this._gotoMode = false;
      return;
    }

    // Move mode — auto-path to clicked tile, animated step by step
    if (this._unitMoveMode) {
      const au = this.gameState.activeUnit;
      if (au) {
        const path = this._findPath(au, tile.col, tile.row);
        if (path.length > 0) {
          // Queue the path and execute the first step; the rest are
          // executed one at a time from update() as each animation completes.
          this._moveAnimUnit  = au;
          this._moveAnimQueue = path.slice(1); // remaining steps after first
          this.gameState.moveUnit(au, path[0].col, path[0].row);
          this._play(SFX.moveUnit);
          return;
        }
      }
      this._unitMoveMode   = false;
      this._moveRangeTiles = null;
      return;
    }

    this._handleTileClick(tile);
  }

  _handleTileClick(tile) {
    const gs = this.gameState;
    if (gs.activeCivIdx !== 0) return;

    const { col, row } = tile;

    // In View Pieces mode, show info popup instead of activating units
    if (this._viewOnlyMode) {
      this._tileInfoPopup = { col, row, sx: 0, sy: 0 };
      return;
    }

    // Friendly unit on tile
    const friendlies = gs.unitsAt(col, row).filter(u => u.civId === 0);
    if (friendlies.length > 0) {
      let unit;
      if (gs.activeUnit?.col === col && gs.activeUnit?.row === row) {
        // Active unit already on this tile — open context menu (with stack cycling)
        const idx = friendlies.indexOf(gs.activeUnit);
        unit = friendlies[(idx + 1) % friendlies.length];
        if (unit.status === 'fortified' || unit.status === 'sentry') unit.status = 'active';
        gs.activeUnit = unit;
        this._unitMoveMode   = false;
        this._moveRangeTiles = null;
        const zoomScale = this._getZoomScale();
        const tileWS = this._getTileWS();
        const { x, y } = tileToScreen(col, row, this.viewX, this.viewY, zoomScale);
        this._openUnitMenu(unit, x + tileWS, y);
      } else {
        // Different tile — select unit and enter move mode by default
        unit = friendlies.find(u => u === gs.activeUnit) ?? friendlies[0];
        gs.selectUnit(unit);
        if (unit.movesLeft > 0) {
          this._unitMoveMode   = true;
          this._moveRangeTiles = this._calcReachableTiles(unit);
        }
      }
      return;
    }

    // Own city with no units on it → open city screen
    const city = gs.cityAt(col, row);
    if (city && city.civId === 0) {
      this._cityScreen      = city;
      this._cityScreenTab   = 'units';
      this._cityScreenScroll = 0;
      return;
    }
  }

  // ─── Unit action menu ──────────────────────────────────────────────────────

  /** Build and show the action menu anchored near (sx, sy) in canvas space. */
  _openUnitMenu(unit, sx, sy) {
    const items = this._unitMenuItems(unit);
    // Rects are filled in during _drawUnitMenu; pre-create empty array
    this._unitMenu = { unit, items, rects: [], sx, sy };
  }

  _unitMenuItems(unit) {
    const items = [];
    const ud = UNITS[unit.typeId];

    // If currently building, offer cancel and nothing else
    if (unit.buildTask) {
      items.push({ id: 'cancelBuild', label: `Cancel (${unit.buildTask.turnsLeft}t left)` });
      return items;
    }

    if (unit.movesLeft > 0) items.push({ id: 'move', label: 'Move' });
    if (unit.gotoTarget) {
      items.push({ id: 'cancelGoto', label: 'Cancel Go To' });
    } else {
      items.push({ id: 'goto', label: 'Go To (G)' });
    }

    if (UNITS[unit.typeId]?.role === 5) {
      items.push({ id: 'foundCity', label: 'Found City (B)' });
      const gs      = this.gameState;
      const terrain = gs.tiles[unit.row]?.[unit.col];
      const ti      = gs._tileImprovements[unit.row]?.[unit.col];
      if (terrain && terrain !== TERRAIN.OCEAN && !ti?.road)
        items.push({ id: 'buildRoad',     label: 'Build Road (R)' });
      if (terrain && terrain !== TERRAIN.OCEAN && ti?.road && !ti?.railroad)
        items.push({ id: 'buildRailroad', label: 'Build Railroad (L)' });
      if (terrain?.irrigate !== 'no' && !ti?.irrigation)
        items.push({ id: 'buildIrrigate', label: 'Irrigate (I)' });
      if (terrain?.mine !== 'no' && !ti?.mine)
        items.push({ id: 'buildMine',     label: 'Mine (M)' });
      if (terrain && terrain !== TERRAIN.OCEAN && !ti?.fortress)
        items.push({ id: 'buildFortress', label: 'Build Fortress' });
      if (ti?.pollution || ti?.fallout)
        items.push({ id: 'cleanPollution', label: ti?.fallout ? 'Clean Fallout (P)' : 'Clean Pollution (P)' });
      if (terrain?.transformTo && terrain.transformTo !== 'no') {
        const targetLabel = TERRAIN[terrain.transformTo]?.label ?? terrain.transformTo;
        items.push({ id: 'transform', label: `Transform→${targetLabel} (O)` });
      }
    }

    // Trade unit (role=7) — show deliver/contribute options when on a city tile
    if (UNITS[unit.typeId]?.role === 7) {
      const gs   = this.gameState;
      const city = gs.cityAt(unit.col, unit.row);
      if (city && city.civId !== unit.civId) {
        items.push({ id: 'deliverTrade', label: 'Deliver Trade' });
      }
      if (city && city.civId === unit.civId && city.production?.type === 'improvement' &&
          IMPROVEMENTS[city.production.id]?.isWonder) {
        items.push({ id: 'helpWonder', label: `Help Build ${IMPROVEMENTS[city.production.id].name}` });
      }
    }

    // Diplomat/Spy (role=6) — show actions when on an enemy city tile
    if (UNITS[unit.typeId]?.role === 6) {
      const gs   = this.gameState;
      const city = gs.cityAt(unit.col, unit.row);
      if (city && city.civId !== unit.civId) {
        items.push({ id: 'embassy',    label: 'Establish Embassy' });
        items.push({ id: 'stealTech',  label: 'Steal Technology' });
        if (!city.improvements.has(1)) {
          const cost = gs.inciteRevoltCost(city);
          items.push({ id: 'incite', label: `Incite Revolt (${cost}✧)` });
        }
      }
      // Bribe adjacent enemy unit
      const adjEnemies = gs.units.filter(u =>
        u.civId !== unit.civId && gs._isAdjacent(unit.col, unit.row, u.col, u.row)
      );
      for (const enemy of adjEnemies) {
        const cost = UNITS[enemy.typeId].cost * 20;
        items.push({ id: `bribe_${enemy.id}`, label: `Bribe ${UNITS[enemy.typeId].name} (${cost}✧)` });
      }
    }

    // Upgrade option (pay gold) when obsolete and in a city
    const upgradeInfo = this.gameState.unitUpgradeAvailable(unit);
    if (upgradeInfo) {
      const civ = this.gameState.civs[unit.civId];
      const canAfford = civ && civ.gold >= upgradeInfo.cost;
      items.push({
        id:       'upgrade',
        label:    `Upgrade→${upgradeInfo.newName} (${upgradeInfo.cost}✧)`,
        disabled: !canAfford,
      });
    }

    items.push({ id: 'wait',    label: 'Wait' });
    items.push({ id: 'fortify', label: 'Fortify' });
    items.push({ id: 'sentry',  label: 'Sentry' });
    items.push({ id: 'sleep',   label: 'Sleep' });
    items.push({ id: 'goHome',  label: 'Go Home' });
    // Airlift — land units in a city with airport
    if (ud.domain === 0 && this.gameState.getAirliftTargets(unit).length > 0) {
      items.push({ id: 'airlift', label: 'Airlift' });
    }
    // Rebase — air units
    if (ud.domain === 1) {
      items.push({ id: 'rebase', label: 'Rebase' });
    }
    // Pillage — military units with attack > 0 and improvements on tile
    if (ud.attack > 0) {
      const imp = this.gameState._tileImprovements[unit.row]?.[unit.col];
      if (imp && (imp.road || imp.railroad || imp.irrigation || imp.mine || imp.fortress || imp.airbase)) {
        items.push({ id: 'pillage', label: 'Pillage' });
      }
    }
    items.push({ id: 'skip',    label: 'Skip Turn' });
    items.push({ id: 'disband', label: 'Disband' });

    // Stack cycling — shown when 2+ friendly units share this tile
    const stackCount = this.gameState.unitsAt(unit.col, unit.row).filter(u => u.civId === 0).length;
    if (stackCount > 1) {
      items.push({ id: 'next_in_stack', label: `Next in Stack (${stackCount})` });
    }

    return items;
  }

  _executeUnitMenuAction(id) {
    const gs   = this.gameState;
    const unit = this._unitMenu.unit;
    this._unitMenu         = null;
    this._unitMoveMode     = false;
    this._moveRangeTiles   = null;
    switch (id) {
      case 'move':
        this._unitMoveMode   = true;
        this._moveRangeTiles = this._calcReachableTiles(unit);
        break;
      case 'goto':
        this._gotoMode = true;
        break;
      case 'cancelGoto':
        gs.cancelGoto(unit);
        break;
      case 'foundCity':
        this._openCityNamingDialog(unit);
        break;
      case 'wait':          gs.waitUnit(unit);                  break;
      case 'fortify':       gs.fortifyUnit(unit);               break;
      case 'sentry':        gs.sentryUnit(unit);                break;
      case 'sleep':         gs.sleepUnit(unit);                 break;
      case 'goHome':        gs.goHomeUnit(unit);                break;
      case 'skip':          gs.skipUnit(unit);                  break;
      case 'pillage':       gs.pillageUnit(unit);               break;
      case 'airlift':       this._airliftMode = true;           break;
      case 'rebase':        this._rebaseMode  = true;           break;
      case 'disband':       gs.disbandUnit(unit);               break;
      case 'next_in_stack': gs.cycleStack(1);                   break;
      case 'buildRoad':     gs.startBuild(unit, 'road');        break;
      case 'buildRailroad': gs.startBuild(unit, 'railroad');   break;
      case 'buildIrrigate': gs.startBuild(unit, 'irrigation');  break;
      case 'buildMine':     gs.startBuild(unit, 'mine');        break;
      case 'buildFortress':  gs.startBuild(unit, 'fortress');       break;
      case 'cleanPollution': gs.startBuild(unit, 'cleanPollution'); break;
      case 'transform':      gs.startBuild(unit, 'transformTerrain'); break;
      case 'cancelBuild':    gs.cancelBuild(unit);                  break;
      case 'deliverTrade':   gs.deliverTrade(unit, gs.cityAt(unit.col, unit.row)); break;
      case 'helpWonder':     gs.contributeToWonder(unit, gs.cityAt(unit.col, unit.row)); break;
      case 'embassy':        gs.establishEmbassy(unit, gs.cityAt(unit.col, unit.row)); break;
      case 'stealTech':      gs.stealAdvance(unit, gs.cityAt(unit.col, unit.row)); break;
      case 'incite':         gs.inciteRevolt(unit, gs.cityAt(unit.col, unit.row)); break;
      case 'upgrade':
        if (!gs.upgradeUnit(unit)) {
          gs.log.unshift('Cannot upgrade: insufficient gold or no successor available.');
          if (gs.log.length > 8) gs.log.length = 8;
          this._play(SFX.neg);
        } else {
          this._play(SFX.pos);
        }
        break;
      default:
        // Handle bribe_<unitId> actions
        if (id.startsWith('bribe_')) {
          const targetId = parseInt(id.slice(6), 10);
          const target = gs.units.find(u => u.id === targetId);
          if (target) gs.bribeUnit(unit, target);
        }
        break;
    }
  }

  /**
   * Draw the floating unit action menu and populate `_unitMenu.rects`
   * so that `handleRawClick` can hit-test it.
   */
  /**
   * Draw right-click tile info popup (Civ2 "View Piece").
   * Shows terrain, special resource, improvements, units, and city.
   */
  _drawTileInfoPopup(ctx, canvasW, canvasH) {
    const p    = this._tileInfoPopup;
    const gs   = this.gameState;
    const col  = p.col;
    const row  = p.row;
    const tile = gs.tiles[row]?.[col];
    if (!tile) { this._tileInfoPopup = null; return; }

    
    const lines = [];

    // Terrain name
    let terrainName = tile.label ?? 'Unknown';

    // Special resource
    const resIdx = gs._resources?.[row]?.[col] ?? -1;
    if (resIdx >= 0 && resIdx < SPECIAL_RESOURCES.length) {
      terrainName += ` (${SPECIAL_RESOURCES[resIdx].label})`;
    }

    // River
    if (gs._rivers?.[row]?.[col] > 0 && tile !== TERRAIN.OCEAN) {
      terrainName += ', River';
    }

    lines.push(terrainName);

    // Improvements
    const imp = gs._tileImprovements?.[row]?.[col];
    if (imp) {
      const parts = [];
      if (imp.road)       parts.push(imp.railroad ? 'Railroad' : 'Road');
      if (imp.irrigation) parts.push('Irrigation');
      if (imp.mine)       parts.push('Mine');
      if (imp.fortress)   parts.push('Fortress');
      if (imp.airbase)    parts.push('Airbase');
      if (imp.pollution)  parts.push('Pollution');
      if (imp.fallout)    parts.push('Fallout');
      if (parts.length)   lines.push(parts.join(', '));
    }

    // Yields
    lines.push(`Move cost: ${tile.moveCost ?? 1}  Defense: ${tile.defense ?? 2}`);

    // City
    const city = gs.cities.find(c => c.col === col && c.row === row);
    if (city) {
      const civName = gs.civs[city.civId]?.data?.plural ?? 'Unknown';
      lines.push(`${city.name} (${civName}), pop ${city.size}`);
    }

    // Units (only show visible ones)
    const vis = gs._visibility?.[row]?.[col] ?? 2;
    if (vis === 2) {
      const units = gs.unitsAt(col, row);
      for (const u of units.slice(0, 4)) {
        const uName = UNITS[u.typeId]?.name ?? 'Unit';
        const civName = gs.civs[u.civId]?.data?.adjective ?? '';
        lines.push(`${civName} ${uName} (hp ${u.hp}/${u.maxHp})`);
      }
      if (units.length > 4) lines.push(`...and ${units.length - 4} more`);
    }

    // Position
    lines.push(`(${col}, ${row})`);

    // ── Draw Win95-style popup ──
    const LINE_H = 16;
    const PAD    = 8;
    ctx.font = FONT.BODY_SMALL;
    const maxTextW = lines.reduce((mx, l) => Math.max(mx, ctx.measureText(l).width), 0);
    const popW = maxTextW + PAD * 2;
    const popH = lines.length * LINE_H + PAD * 2;

    let mx = p.sx + 8;
    let my = p.sy + 8;
    if (mx + popW > canvasW - 4) mx = canvasW - popW - 4;
    if (my + popH > canvasH - 4) my = canvasH - popH - 4;
    if (mx < 4) mx = 4;
    if (my < 4) my = 4;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(mx + 3, my + 3, popW, popH);

    // Panel background
                ctx.fillStyle = CLR.WIN95_FACE;
                ctx.fillRect(mx, my, popW, popH);
                // Bevel
                ctx.fillStyle = CLR.WIN95_LIGHT; ctx.fillRect(mx, my, popW, 1); ctx.fillRect(mx, my, 1, popH);
                ctx.fillStyle = CLR.WIN95_SHADOW; ctx.fillRect(mx, my + popH - 1, popW, 1); ctx.fillRect(mx + popW - 1, my, 1, popH);
                ctx.fillStyle = CLR.WIN95_LIGHT_EDGE; ctx.fillRect(mx + 1, my + 1, popW - 2, 1); ctx.fillRect(mx + 1, my + 1, 1, popH - 2);
                ctx.fillStyle = CLR.WIN95_DARK_SHADOW; ctx.fillRect(mx + 1, my + popH - 2, popW - 2, 1); ctx.fillRect(mx + popW - 2, my + 1, 1, popH - 2);

    // Text
    ctx.font = FONT.BODY_SMALL;
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
                ctx.fillStyle = i === 0 ? CLR.WIN95_HIGHLIGHT : '#000000';
      ctx.font = i === 0 ? FONT.SMALL_BOLD : FONT.BODY_SMALL;
      ctx.fillText(lines[i], mx + PAD, my + PAD + i * LINE_H + 11);
    }
  }

  _drawUnitMenu(ctx, canvasW, canvasH) {
    const menu     = this._unitMenu;
    const items    = menu.items;
    const ITEM_W   = items.some(it => it.id === 'upgrade') ? 190 : 140;
    const ITEM_H   = 26;
    const PAD      = 6;
    const HDR_H    = 22;
    const menuW    = ITEM_W + PAD * 2;
    const menuH    = HDR_H + items.length * ITEM_H + PAD;

    // Keep menu on-screen
    let mx = menu.sx;
    let my = menu.sy;
    if (mx + menuW > canvasW - 4) mx = canvasW - menuW - 4;
    if (my + menuH > canvasH - 4) my = canvasH - menuH - 4;
    if (mx < 4) mx = 4;
    if (my < 4) my = 4;



    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(mx + 3, my + 3, menuW, menuH);

    // Panel background — Win95 gray
                ctx.fillStyle = CLR.WIN95_FACE;
                ctx.fillRect(mx, my, menuW, menuH);
                // Bevel
                ctx.fillStyle = CLR.WIN95_LIGHT; ctx.fillRect(mx, my, menuW, 1); ctx.fillRect(mx, my, 1, menuH);
                ctx.fillStyle = CLR.WIN95_SHADOW; ctx.fillRect(mx, my + menuH - 1, menuW, 1); ctx.fillRect(mx + menuW - 1, my, 1, menuH);
                ctx.fillStyle = CLR.WIN95_LIGHT_EDGE; ctx.fillRect(mx + 1, my + 1, menuW - 2, 1); ctx.fillRect(mx + 1, my + 1, 1, menuH - 2);
                ctx.fillStyle = CLR.WIN95_DARK_SHADOW; ctx.fillRect(mx + 1, my + menuH - 2, menuW - 2, 1); ctx.fillRect(mx + menuW - 2, my + 1, 1, menuH - 2);

    // Header: dark blue Windows title bar
    ctx.fillStyle = '#000080';
    ctx.fillRect(mx + 2, my + 2, menuW - 4, HDR_H - 2);
    const unitName = UNITS[menu.unit.typeId]?.name ?? 'Unit';
    ctx.font = FONT.SMALL_BOLD;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(unitName, mx + menuW / 2, my + HDR_H - 5);
    ctx.textAlign = 'left';

    // Move mode indicator (shown in header when active)
    if (this._unitMoveMode) {
      ctx.font = FONT.TINY;
      ctx.fillStyle = '#000080';
      ctx.textAlign = 'center';
      ctx.fillText('Click a tile to move', mx + menuW / 2, my + HDR_H + 14);
      ctx.textAlign = 'left';
      menu.rects = []; // no clickable items shown while in move mode
      return;
    }

    // Items — Win95 menu style
    menu.rects = [];
    items.forEach((item, i) => {
      const ix = mx + PAD;
      const iy = my + HDR_H + i * ITEM_H;
      const iw = ITEM_W;
      const ih = ITEM_H - 1;

      // Separator-style thin border between items
      if (i > 0) {
                ctx.fillStyle = CLR.WIN95_SHADOW; ctx.fillRect(ix, iy, iw, 1);
      }

      ctx.font = FONT.BODY_SMALL;
                ctx.fillStyle = item.disabled ? CLR.WIN95_SHADOW : '#000000';
      ctx.fillText(item.label, ix + 8, iy + ih - 6);

      if (!item.disabled) menu.rects.push({ id: item.id, x: ix, y: iy, w: iw, h: ih });
    });
  }

  /**
   * Dijkstra least-cost path from (fromCol,fromRow) to (toCol,toRow).
   * Returns an array of {col,row} steps (not including the start tile).
   * Returns [] if already at destination or unreachable.
   */
  _findPath(unit, toCol, toRow) {
    const fromCol = unit.col, fromRow = unit.row;
    if (fromCol === toCol && fromRow === toRow) return [];

    const gs    = this.gameState;
    const tiles = gs.tiles;
    const imps  = gs._tileImprovements;
    const rows  = gs.mapRows;
    const cols  = gs.mapCols;
    const uFlags = UNITS[unit.typeId]?.flags ?? 0;
    const uDomain = UNITS[unit.typeId]?.domain ?? 0;

    const dist = new Map();
    const prev = new Map();
    dist.set(`${fromCol},${fromRow}`, 0);
    const pq = [{ col: fromCol, row: fromRow, cost: 0 }];

    while (pq.length > 0) {
      // Pop minimum-cost entry
      let bi = 0;
      for (let i = 1; i < pq.length; i++) {
        if (pq[i].cost < pq[bi].cost) bi = i;
      }
      const { col, row, cost } = pq.splice(bi, 1)[0];

      if (col === toCol && row === toRow) break;
      if ((dist.get(`${col},${row}`) ?? Infinity) < cost) continue;

      const o = row % 2;
      const wc = c => ((c % cols) + cols) % cols;
      const neighbors = [
        [row - 2, wc(col)],
        [row - 1, wc(col + o)],
        [row,     wc(col + 1)],
        [row + 1, wc(col + o)],
        [row + 2, wc(col)],
        [row + 1, wc(col + o - 1)],
        [row,     wc(col - 1)],
        [row - 1, wc(col + o - 1)],
      ];

      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= rows) continue;
        const nTile = tiles[nr][nc];
        if (uDomain === 0 && nTile === TERRAIN.OCEAN) continue;
        if (uDomain === 2 && nTile !== TERRAIN.OCEAN) continue;
        const isRailroad = imps[row]?.[col]?.railroad && imps[nr]?.[nc]?.railroad;
        const isRoad     = imps[row]?.[col]?.road     && imps[nr]?.[nc]?.road;
        const baseCost   = (uFlags & FLAGS.ALPINE) ? 1 : (nTile.moveCost ?? 1);
        const stepCost   = isRailroad ? 0 : isRoad ? 1 : baseCost * COSMIC.roadMultiplier;
        const newCost    = cost + stepCost;
        const key = `${nc},${nr}`;
        if ((dist.get(key) ?? Infinity) <= newCost) continue;
        dist.set(key, newCost);
        prev.set(key, `${col},${row}`);
        pq.push({ col: nc, row: nr, cost: newCost });
      }
    }

    // Reconstruct path from dest back to start
    const path = [];
    let key = `${toCol},${toRow}`;
    while (prev.has(key)) {
      const [c, r] = key.split(',').map(Number);
      path.unshift({ col: c, row: r });
      key = prev.get(key);
    }
    return path;
  }

  /**
   * Dijkstra from the unit's position.
   * Returns a Map keyed by `"col,row"` → remaining move points after entering.
   * Only tiles reachable within unit.movesLeft are included.
   */
  _calcReachableTiles(unit) {
    const gs     = this.gameState;
    const tiles  = gs.tiles;
    const imps   = gs._tileImprovements;
    const rows   = gs.mapRows;
    const cols   = gs.mapCols;
    const uFlags = UNITS[unit.typeId]?.flags ?? 0;
    const domain = UNITS[unit.typeId]?.domain ?? 0;

    // dist: key → max remaining moves on arrival
    const dist = new Map();
    dist.set(`${unit.col},${unit.row}`, unit.movesLeft);

    // Priority queue (max-remaining first) — simple array splice, fine for small ranges
    const pq = [{ col: unit.col, row: unit.row, moves: unit.movesLeft }];

    while (pq.length > 0) {
      // Pop the entry with the most remaining moves
      let bi = 0;
      for (let i = 1; i < pq.length; i++) {
        if (pq[i].moves > pq[bi].moves) bi = i;
      }
      const { col, row, moves } = pq.splice(bi, 1)[0];

      // Stale entry check
      if ((dist.get(`${col},${row}`) ?? -1) > moves) continue;
      if (moves <= 0) continue;

      const o = row % 2;
      const wc = c => ((c % cols) + cols) % cols;
      const neighbors = [
        [row - 2, wc(col)],
        [row - 1, wc(col + o)],
        [row,     wc(col + 1)],
        [row + 1, wc(col + o)],
        [row + 2, wc(col)],
        [row + 1, wc(col + o - 1)],
        [row,     wc(col - 1)],
        [row - 1, wc(col + o - 1)],
      ];

      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= rows) continue;
        // Domain check: land units can't enter ocean, sea units can't enter land
        const nTerrain = tiles[nr][nc];
        if (domain === 0 && nTerrain === TERRAIN.OCEAN) continue;
        if (domain === 2 && nTerrain !== TERRAIN.OCEAN) continue;
        const isRailroad = imps[row]?.[col]?.railroad && imps[nr]?.[nc]?.railroad;
        const isRoad     = imps[row]?.[col]?.road     && imps[nr]?.[nc]?.road;
        const baseCost   = (uFlags & FLAGS.ALPINE) ? 1 : (nTerrain.moveCost ?? 1);
        const cost       = isRailroad ? 0 : isRoad ? 1 : baseCost * COSMIC.roadMultiplier;
        const remaining = moves - cost;
        // Civ2 rule: a unit with full moves can always move at least 1 tile
        if (remaining < 0 && moves < unit.maxMoves) continue;
        const clampedRemaining = Math.max(0, remaining);
        const key = `${nc},${nr}`;
        if ((dist.get(key) ?? -1) >= clampedRemaining) continue;
        dist.set(key, clampedRemaining);
        pq.push({ col: nc, row: nr, moves: clampedRemaining });
      }
    }

    // Remove the unit's own tile — it's the origin, not a destination
    dist.delete(`${unit.col},${unit.row}`);
    return dist;
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} canvasW
   * @param {number} canvasH
   */
  render(ctx, canvasW, canvasH) {
    this._canvasW = canvasW;
    this._canvasH = canvasH;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Title screen — skip all map/UI rendering
    if (this._titleScreen) {
      this._drawTitleScreen(ctx, canvasW, canvasH);
      if (this._hallOfFame) this._drawHallOfFame(ctx, canvasW, canvasH);
      if (this._creditsScreen) this._drawCreditsScreen(ctx, canvasW, canvasH);
      return;
    }

    const MAP_W = canvasW - SB_W;
    const MAP_H = canvasH - TOP_H;

    const spritesReady = this.sprites?.ready;
    const vis = this.gameState._visibility;

    // Clip tile drawing to visible canvas area
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvasW, canvasH);
    ctx.clip();

    const tileWS = this._getTileWS();
    const tileHS = this._getTileHS();
    const zoomScale = this._getZoomScale();
    const colsVisible = Math.ceil(MAP_W / tileWS) + 3;
    const colStart    = Math.floor(this.viewX / tileWS) - 1;
    const colEnd      = colStart + colsVisible;

    for (let row = 0; row < this.mapRows; row++) {
      for (let drawCol = colStart; drawCol < colEnd; drawCol++) {
        const col = ((drawCol % this.mapCols) + this.mapCols) % this.mapCols;
        const { x, y } = tileToScreen(drawCol, row, this.viewX, this.viewY, zoomScale);

        // Bounds check - include tiles partially off-screen
        if (x + tileWS < 0 || x > MAP_W) continue;
        if (y + tileHS < 0 || y > canvasH) continue;

        const v = vis[row][col];

        if (v === 0 && !this._showHiddenTerrain) continue;

        const terrain = this._tiles[row][col];
        if (spritesReady) {
          this._drawTileSprite(ctx, terrain, col, row, x, y);
        } else {
          this._drawTileFallback(ctx, terrain, x, y);
        }

        if (spritesReady) this._drawRiver(ctx, col, row, x, y);
        if (spritesReady) this._drawTileResource(ctx, terrain, col, row, x, y);
        this._drawTileImprovements(ctx, col, row, x, y);
        this._drawFogDither(ctx, x, y, col, row);

         if (this._showGrid && spritesReady) {
           try {
             const gridSpr = this.sprites.getRegionSprite('icons', 183, 430, 64, 32);
             ctx.drawImage(gridSpr, x, y, tileWS, tileHS);
           } catch (e) {
             this._warnOnce('grid:' + col + ',' + row, 'Grid sprite unavailable: ' + e.message);
           }
         }

        // Pass 2 — city (show in explored and visible areas)
        const city = this.gameState.cityAt(col, row);
        if (city) {
          this._drawCity(ctx, city, x, y, spritesReady);
          // Collect cities for name rendering in a separate last pass
          if (!this._cityNameQueue) this._cityNameQueue = [];
          this._cityNameQueue.push({ city, x, y });

          // In MGE the city and garrison flag remain in the base map, while
          // the ready unit flashes on top as a separate animation frame.
          // Queue it for the final map pass. The original MGE waiting frames
          // then redraw city names over the unit.
          const active = this.gameState.activeUnit;
          const combatAtCity = this._combatAnim &&
            ((col === this._combatAnim.atkCol && row === this._combatAnim.atkRow) ||
             (col === this._combatAnim.defCol && row === this._combatAnim.defRow));
          if (v === 2 && active?.col === col && active?.row === row &&
              (!this._moveAnim || this._moveAnim.unit !== active) && !combatAtCity) {
            if (!this._activeCityUnitQueue) this._activeCityUnitQueue = [];
            this._activeCityUnitQueue.push({ unit: active, x, y });
          }
        }

        if (v === 2) {
          // Pass 3 — units (only in currently visible tiles, skip if city present)
          // axx0 Draw.Map.cs: units not drawn at city tiles (city sprite + flag handles it)
          if (!city) {
            const allUnits = this.gameState.unitsAt(col, row);
            // Filter: enemy submarines are invisible unless a human SPOT_SUB unit is adjacent
            const units = allUnits.filter(u => {
              if (u.civId === 0) return true; // human units always visible
              if (!(UNITS[u.typeId]?.flags & FLAGS.SUBMARINE)) return true; // non-sub always visible
              // Enemy sub: only visible if human has a SPOT_SUB unit within 1 tile (Chebyshev)
              return this.gameState.units.some(hu => {
                if (hu.civId !== 0) return false;
                if (!(UNITS[hu.typeId]?.flags & FLAGS.SPOT_SUB)) return false;
                const dr = Math.abs(hu.row - u.row);
                const dc = Math.min(Math.abs(hu.col - u.col), this.gameState.mapCols - Math.abs(hu.col - u.col));
                return Math.max(dr, dc) <= 1;
              });
            });
            if (units.length > 0) {
              const draw = units.find(u => u === this.gameState.activeUnit) ?? units[0];
              // Skip the animating unit here — it will be drawn at interpolated position below
              if (this._moveAnim && draw === this._moveAnim.unit) {
                // skip — drawn at interpolated position in Pass 5
              } else if (this._combatAnim &&
                         ((col === this._combatAnim.atkCol && row === this._combatAnim.atkRow) ||
                          (col === this._combatAnim.defCol && row === this._combatAnim.defRow))) {
                // skip — combat animation draws these in Pass 6
              } else {
                // Stack shadow: dim offset copy behind top unit when 2+ units on tile
                if (units.length > 1 && spritesReady) {
                  const shadow   = units.find(u => u !== draw) ?? units[1];
                  const civColor = CIV_COLORS[this.gameState.civs[shadow.civId]?.data?.color ?? 0];
                  const sRow = Math.floor(shadow.typeId / 9);
                  const sCol = shadow.typeId % 9;
                   try {
                     const spr = this._getColoredUnitSprite(sRow, sCol, civColor);
                     ctx.globalAlpha = 0.45;
                     const tileHS = this._getTileHS();
                     ctx.drawImage(spr, x + 4, y - tileHS / 2 - 4, UNIT_W_S, UNIT_H_S);
                     ctx.globalAlpha = 1;
                   } catch (e) {
                     this._warnOnce('unit-shadow:' + shadow.id, 'Unit shadow sprite unavailable: ' + e.message);
                     ctx.globalAlpha = 1;
                   }
                }
                this._drawUnit(ctx, draw, x, y, spritesReady);
              }
            }
          }
        }
      }
    }

    if (this._moveAnim) {
      const anim = this._moveAnim;
      const t = Math.min(1, anim.elapsed / anim.duration);
      let fromDraw = anim.fromCol;
      let toDraw   = anim.toCol;
      const half = this.mapCols / 2;
      let diff = toDraw - fromDraw;
      if (diff > half)       toDraw -= this.mapCols;
      else if (diff < -half) toDraw += this.mapCols;
      const fromX = fromDraw * tileWS + (anim.fromRow % 2 ? tileWS / 2 : 0) - this.viewX;
      const fromY = anim.fromRow * (tileHS / 2) - this.viewY;
      const toX   = toDraw * tileWS + (anim.toRow % 2 ? tileWS / 2 : 0) - this.viewX;
      const toY   = anim.toRow * (tileHS / 2) - this.viewY;
      const ax = fromX + (toX - fromX) * t;
      const ay = fromY + (toY - fromY) * t;
      this._drawUnit(ctx, anim.unit, ax, ay, spritesReady);
    }

    // Pass 6 — combat animation (both combatants + flashing + HP bars)
    if (this._combatAnim) {
      this._drawCombatAnim(ctx, spritesReady);
    }

    if (this._cityGrowthFlash) {
      const f = this._cityGrowthFlash;
      const alpha = 0.5 * (1 - f.elapsed / f.duration);
      const { x: fx, y: fy } = tileToScreen(f.col, f.row, this.viewX, this.viewY, zoomScale);
      ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
      ctx.fillRect(fx, fy, tileWS, tileHS);
    }

    if (this._cityFlashBox) {
      const f = this._cityFlashBox;
      const pulse = Math.sin(f.elapsed * 0.006 * Math.PI) * 0.5 + 0.5;
      const { x: fx, y: fy } = tileToScreen(f.col, f.row, this.viewX, this.viewY, zoomScale);
      ctx.strokeStyle = `rgba(255, 255, 255, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(fx - 2, fy - 2, tileWS + 4, tileHS + 4);
    }

    // Active units in cities are animation elements in MGE: their sprite and
    // shield blink over the otherwise-static city and flag.
    if (this._activeCityUnitQueue) {
      for (const { unit, x: ux, y: uy } of this._activeCityUnitQueue) {
        this._drawUnit(ctx, unit, ux, uy, spritesReady);
      }
      this._activeCityUnitQueue = null;
    }

    // Pass LAST — city names remain readable above units, exactly as MGE's
    // WaitingAnimation redraws them after its active-unit frame.
    if (this._cityNameQueue) {
      for (const { city, x: cx, y: cy } of this._cityNameQueue) {
        this._drawCityName(ctx, city, cx, cy);
      }
      this._cityNameQueue = null;
    }

    ctx.restore();

    // Chrome (drawn outside the clip)
    this._drawTopBar(ctx, canvasW);
    this._drawSidebar(ctx, canvasW, canvasH);
    this._drawHud(ctx, canvasW, canvasH);

    // Overlays (full canvas — city screen, unit menu, research)
    if (this._tileInfoPopup)   this._drawTileInfoPopup(ctx, canvasW, canvasH);
    if (this._unitMenu)        this._drawUnitMenu(ctx, canvasW, canvasH);
    if (this._researchChooser) {
      this._drawResearchChooser(ctx, canvasW, canvasH);
      if (this._researchGoalDialog) this._drawResearchGoal(ctx, canvasW, canvasH);
    }
    if (this._govtChooser)     this._drawGovtChooser(ctx, canvasW, canvasH);
    if (this._rateDialog)      this._drawRateDialog(ctx, canvasW, canvasH);
    if (this._diplomacyScreen) this._drawDiplomacyScreen(ctx, canvasW, canvasH);
    if (this._negotiationScreen) this._drawNegotiationScreen(ctx, canvasW, canvasH);
    if (this._scienceAdvisor)     this._drawScienceAdvisor(ctx, canvasW, canvasH);
    if (this._tradeAdvisor)       this._drawTradeAdvisor(ctx, canvasW, canvasH);
    if (this._domesticAdvisor)    this._drawDomesticAdvisor(ctx, canvasW, canvasH);
    if (this._militaryAdvisor)    this._drawMilitaryAdvisor(ctx, canvasW, canvasH);
    if (this._attitudeAdvisor)    this._drawAttitudeAdvisor(ctx, canvasW, canvasH);
    if (this._demographicsScreen) this._drawDemographicsScreen(ctx, canvasW, canvasH);
    if (this._top5Cities)         this._drawTop5Cities(ctx, canvasW, canvasH);
    if (this._hallOfFame)         this._drawHallOfFame(ctx, canvasW, canvasH);
    if (this._wondersList)        this._drawWondersList(ctx, canvasW, canvasH);
    if (this._gameOptionsDialog)       this._drawGameOptionsDialog(ctx, canvasW, canvasH);
    if (this._graphicOptionsDialog)    this._drawGraphicOptionsDialog(ctx, canvasW, canvasH);
    if (this._cityReportOptionsDialog) this._drawCityReportOptionsDialog(ctx, canvasW, canvasH);
    if (this._casualtyDialog)     this._drawCasualtyDialog(ctx, canvasW, canvasH);
    if (this._spaceshipViewer)    this._drawSpaceshipViewer(ctx, canvasW, canvasH);
    if (this._cityScreen)         this._drawCityScreen(ctx, canvasW, canvasH);
    if (this._civilopedia)        this._drawCivilopedia(ctx, canvasW, canvasH);
    if (this._tradeDialog)     this._drawTradeDialog(ctx, canvasW, canvasH);
    if (this._diplomatDialog)  this._drawDiplomatDialog(ctx, canvasW, canvasH);
    if (this._aiPeaceProposal) this._drawAiPeaceDialog(ctx, canvasW, canvasH);
    if (this._captureDialog)   this._drawCaptureDialog(ctx, canvasW, canvasH);
    if (this._cityNamingDialog)  this._drawCityNamingDialog(ctx, canvasW, canvasH);
    if (this._cityFoundedDialog) this._drawCityFoundedDialog(ctx, canvasW, canvasH);
    if (this._findCityDialog)    this._drawFindCityDialog(ctx, canvasW, canvasH);
    if (this._advancePopup)    this._drawAdvancePopup(ctx, canvasW, canvasH);
    if (this._highCouncil)     this._drawHighCouncil(ctx, canvasW, canvasH);
    if (this._wonderSplash)    this._drawWonderSplash(ctx, canvasW, canvasH);
    if (this._editTechsDialog) this._drawEditTechsDialog(ctx, canvasW, canvasH);
    if (this._editUnitDialog) this._drawEditUnitDialog(ctx, canvasW, canvasH);
    if (this._editCityDialog) this._drawEditCityDialog(ctx, canvasW, canvasH);
    if (this._editKingDialog) this._drawEditKingDialog(ctx, canvasW, canvasH);
    if (this._gotoMode)        this._drawGotoModeCursor(ctx, canvasW, canvasH);
    if (this._paradropMode)    this._drawParadropOverlay(ctx, canvasW, canvasH);
    if (this._palaceView)      this._drawPalaceView(ctx, canvasW, canvasH);
    if (this._throneRoom)      this._drawThroneRoom(ctx, canvasW, canvasH);
    if (this._throneUpgradeDialog) this._drawThroneUpgradeDialog(ctx, canvasW, canvasH);
    if (this._scenarioCivChooser)  this._drawScenarioCivChooser(ctx, canvasW, canvasH);
    if (this._replayMap)       this._drawReplayMap(ctx, canvasW, canvasH);

    // Retirement flow (POWERgraph → Score → HoF) — drawn on top of everything
    if (this._retireStage) this._drawRetireFlow(ctx, canvasW, canvasH);

    // New game wizard (topmost — drawn over everything including game over)
    if (this._wizard) this._drawNewGameWizard(ctx, canvasW, canvasH);

    // Game-over screen
    if (!this._wizard && !this._retireStage && this.gameState.gameOver) this._drawGameOver(ctx, canvasW, canvasH);

    // Modern support feature, intentionally topmost so its controls cannot be
    // obscured by the MGE screens included in the captured report.
    if (this._bugReportDialog) this._drawBugReportDialog(ctx, canvasW, canvasH);
  }

  _drawGameOver(ctx, canvasW, canvasH) {
    const go = this.gameState.gameOver;
    const win = go.result === 'win' || go.result === 'score-win' || go.result === 'space-win' || go.result === 'diplomatic-win';



    // Dim the whole canvas
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Centre panel — Civ2 gray
    const PW = 420, PH = 230;
    const px = (canvasW - PW) / 2, py = (canvasH - PH) / 2;

    const titleBar = win ? 'Civilization II \u2014 Victory!' : 'Civilization II \u2014 Game Over';
    this._drawCiv2Panel(ctx, px, py, PW, PH, titleBar);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    // Large result text
    const title = go.result === 'win'             ? 'VICTORY!'
                : go.result === 'score-win'        ? 'SCORE VICTORY!'
                : go.result === 'space-win'        ? 'SPACE VICTORY!'
                : go.result === 'diplomatic-win'   ? 'DIPLOMATIC VICTORY!'
                : go.result === 'lose'             ? 'DEFEAT'
                : go.result === 'space-lose'       ? 'SPACE DEFEAT'
                : go.result === 'diplomatic-lose'  ? 'DIPLOMATIC DEFEAT'
                : 'SCORE DEFEAT';
    ctx.fillStyle = win ? CLR.WIN_COLOR : CLR.LOSS_COLOR;
    ctx.font = FONT.TITLE_HUGE;
    ctx.fillText(title, canvasW / 2, py + 72);

    // Subtitle
    const sub = go.result === 'win'
      ? 'All rival civilizations have been eliminated.'
      : go.result === 'lose'
      ? 'Your civilization has been destroyed.'
      : go.result === 'score-win'
      ? 'The year is 2050 A.D. — you lead in score.'
      : go.result === 'space-win'
      ? 'YOUR CIVILIZATION REACHED THE STARS!'
      : go.result === 'space-lose'
      ? 'An enemy civilization reached Alpha Centauri first…'
      : go.result === 'diplomatic-win'
      ? 'The United Nations has elected you World Leader!'
      : go.result === 'diplomatic-lose'
      ? 'A rival civilization was elected World Leader.'
      : 'The year is 2050 A.D. — a rival civilization surpassed you.';
    ctx.font = FONT.LABEL_TIMES;
    this._panelText(ctx, sub, canvasW / 2, py + 100);

    // Score
    ctx.font = FONT.STATUS;
    this._panelText(ctx, `Final Score: ${go.score}`, canvasW / 2, py + 132);

    const yr = this.gameState.year;
    const yLabel = yr < 0 ? `${Math.abs(yr)} B.C.` : `${yr} A.D.`;
    ctx.font = FONT.BODY;
    this._panelText(ctx, `Year ${yLabel}  ·  Turn ${this.gameState.turn}`, canvasW / 2, py + 156);

    // Replay Map button — Win95 style
    const RBW = 120, RBH = 24;
    const rbx = Math.round(canvasW / 2 - RBW / 2);
    const rby = py + 168;
    this._drawWin95Button(ctx, rbx, rby, RBW, RBH, 'Replay Map');
    this._gameOverReplayRect = { x: rbx, y: rby, w: RBW, h: RBH };

    // New Game button — Win95 style
    const BW = 140, BH = 28;
    const bx = Math.round(canvasW / 2 - BW / 2);
    const by = py + PH - 44;
    ctx.fillStyle = CLR.WIN95_FACE; ctx.fillRect(bx, by, BW, BH);
    ctx.fillStyle = CLR.WIN95_LIGHT; ctx.fillRect(bx, by, BW, 1); ctx.fillRect(bx, by, 1, BH);
    ctx.fillStyle = CLR.WIN95_SHADOW; ctx.fillRect(bx, by + BH - 1, BW, 1); ctx.fillRect(bx + BW - 1, by, 1, BH);
    ctx.fillStyle = CLR.WIN95_LIGHT_EDGE; ctx.fillRect(bx + 1, by + 1, BW - 2, 1); ctx.fillRect(bx + 1, by + 1, 1, BH - 2);
    ctx.fillStyle = CLR.WIN95_DARK_SHADOW; ctx.fillRect(bx + 1, by + BH - 2, BW - 2, 1); ctx.fillRect(bx + BW - 2, by + 1, 1, BH - 2);
    // Focus ring
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 3.5, by + 3.5, BW - 7, BH - 7);
    ctx.fillStyle = '#000000';
    ctx.font = FONT.BODY_BOLD;
    ctx.textBaseline = 'middle';
    ctx.fillText('Start New Game', canvasW / 2, by + BH / 2);
    // Store rect for click handling
    this._gameOverNewGameRect = { x: bx, y: by, w: BW, h: BH };

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }


  // ─── TerrainMixin (extracted to mixins/TerrainMixin.js) ─────────────

  // ─── Mini-map ──────────────────────────────────────────────────────────────

  /** Returns the mini-map geometry anchored in the right sidebar.
   *
   * Iso tiles are 2:1 (width:height), so each mini-map tile uses mmTileW = 2×mmTileH
   * to preserve the correct map proportions.
   */
  _mmGeom(canvasW, canvasH) {
    const SB_X    = canvasW - SB_W;
    // Original MGE plots every stored map tile as a fixed 2×1 pixel mark.
    // The map is centred inside a 240×100 draw area (for the original
    // 262px sidebar), rather than enlarged to fill the available space.
    const panelH  = 148;
    const padX    = 11;
    const headerH = 38;
    const padBottom = 10;
    const areaX   = SB_X + padX;
    const areaY   = TOP_H + headerH;
    const areaW   = SB_W - padX * 2;
    const areaH   = panelH - headerH - padBottom;
    const mmTileW = 2;
    const mmTileH = 1;
    const mapW    = this.mapCols * mmTileW;
    const mapH    = this.mapRows * mmTileH;
    const mapX    = areaX + Math.floor((areaW - mapW) / 2);
    const mapY    = areaY + Math.floor((areaH - mapH) / 2);
    return { panelX: SB_X, panelY: TOP_H, panelW: SB_W, panelH,
             areaX, areaY, areaW, areaH,
             mapX, mapY, mapW, mapH, mmTileW, mmTileH };
  }

  /** True if canvas pixel (px, py) falls inside the mini-map map area. */
  isMiniMapClick(px, py, canvasW, canvasH) {
    const { mapX, mapY, mapW, mapH } = this._mmGeom(canvasW, canvasH);
    return px >= mapX && px < mapX + mapW && py >= mapY && py < mapY + mapH;
  }

  /** Centre the viewport on the tile the user clicked on the mini-map. */
  handleMiniMapClick(px, py, canvasW, canvasH) {
    const { mapX, mapY, mmTileW, mmTileH } = this._mmGeom(canvasW, canvasH);
    const col = Math.floor((px - mapX) / mmTileW);
    const row = Math.floor((py - mapY) / mmTileH);
    this.centerOn(col, row, canvasW, canvasH);
  }

  /** Draw a 5-layer raised bevel border matching original Civ2 Win95 chrome. */
  _drawBevel5(ctx, x, y, w, h) {
    // Layer 1: outer highlight/shadow
    ctx.fillStyle = CLR.BEVEL_1_LIGHT; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = CLR.BEVEL_1_DARK; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
    // Inner bevel
    ctx.fillStyle = CLR.BEVEL_2_LIGHT; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
    ctx.fillStyle = CLR.BEVEL_2_DARK; ctx.fillRect(x + 1, y + h - 2, w - 2, 1); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
    // Innermost bevel
    ctx.fillStyle = CLR.BEVEL_3; ctx.fillRect(x + 2, y + 2, w - 4, 1); ctx.fillRect(x + 2, y + 2, 1, h - 4);
    ctx.fillStyle = CLR.BEVEL_3; ctx.fillRect(x + 2, y + h - 3, w - 4, 1); ctx.fillRect(x + w - 3, y + 2, 1, h - 4);
    // Innermost dark bevel
    ctx.fillStyle = CLR.BEVEL_4; ctx.fillRect(x + 3, y + 3, w - 6, 1); ctx.fillRect(x + 3, y + 3, 1, h - 6);
    ctx.fillStyle = CLR.BEVEL_5; ctx.fillRect(x + 3, y + h - 4, w - 6, 1); ctx.fillRect(x + w - 4, y + 3, 1, h - 6);
    ctx.fillStyle = CLR.BEVEL_4; ctx.fillRect(x + 4, y + 4, w - 8, 1); ctx.fillRect(x + 4, y + 4, 1, h - 8);
    ctx.fillStyle = CLR.BEVEL_5; ctx.fillRect(x + 4, y + h - 5, w - 8, 1); ctx.fillRect(x + w - 5, y + 4, 1, h - 8);
  }

  /** Draw a sunken (inset) 5-layer bevel — reverse of raised. */
  _drawBevel5Sunken(ctx, x, y, w, h) {
    ctx.fillStyle = CLR.BEVEL_1_DARK; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = CLR.BEVEL_1_LIGHT; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = CLR.BEVEL_2_DARK; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
    ctx.fillStyle = CLR.BEVEL_2_LIGHT; ctx.fillRect(x + 1, y + h - 2, w - 2, 1); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
  }

  /**
   * Draw a standard Civ2 dialog panel with wallpaper background, bevel border,
   * inner sunken content area, and optional embossed title text.
   * Matches axx0 Civ2GoldInterface.cs dialog rendering.
   * @returns {{ ix, iy, iw, ih }} inner content area bounds
   */
  _drawCiv2Panel(ctx, px, py, pw, ph, title) {
    this._ensureWallpapers();
    // Outer wallpaper background
    if (this._outerWallpaper) {
      this._tilePattern(ctx, this._outerWallpaper, px, py, pw, ph);
    } else {
      ctx.fillStyle = '#9a9a9a'; ctx.fillRect(px, py, pw, ph);
    }
    // 5-layer raised bevel border
    this._drawBevel5(ctx, px, py, pw, ph);
    // Title text — Civ2 embossed style (dark gray with black shadow)
    // axx0: HeaderLabelFontSizeNormal=28, TnRbold, #878787, shadow black at +1,+1
    const titleH = title ? 28 : 5;
    if (title) {
      
      ctx.font = FONT.TITLE_LARGE;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000000';
      ctx.fillText(title, px + pw / 2 + 1, py + 20 + 1);
      ctx.fillStyle = '#878787';
      ctx.fillText(title, px + pw / 2, py + 20);
      ctx.textAlign = 'left';
    }
    // Inner sunken border — 2 parallel lines (axx0 Civ2GoldInterface.cs:678-688)
    // pen7=#434343 top/left, pen6=#dfdfdf bottom/right, starts at PAD=9
    const PAD = 9;
    const ix = px + PAD, iy = py + titleH;
    const iw = pw - 2 * PAD, ih = ph - titleH - PAD;
    // Outer border line
    ctx.fillStyle = CLR.BEVEL_5;
    ctx.fillRect(ix, iy, iw, 1);     // top
    ctx.fillRect(ix, iy, 1, ih);     // left
    ctx.fillStyle = CLR.BEVEL_4;
    ctx.fillRect(ix, iy + ih - 1, iw, 1);  // bottom
    ctx.fillRect(ix + iw - 1, iy, 1, ih);  // right
    // Inner border line (1px inward)
    ctx.fillStyle = CLR.BEVEL_5;
    ctx.fillRect(ix + 1, iy + 1, iw - 2, 1);
    ctx.fillRect(ix + 1, iy + 1, 1, ih - 2);
    ctx.fillStyle = CLR.BEVEL_4;
    ctx.fillRect(ix + 1, iy + ih - 2, iw - 2, 1);
    ctx.fillRect(ix + iw - 2, iy + 1, 1, ih - 2);
    // Inner wallpaper fill
    if (this._innerWallpaper) {
      this._tilePattern(ctx, this._innerWallpaper, ix + 2, iy + 2, iw - 4, ih - 4);
    } else {
      ctx.fillStyle = '#bfbfbf'; ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);
    }
    return { ix: ix + 2, iy: iy + 2, iw: iw - 4, ih: ih - 4 };
  }

  /**
   * Draw text on inner wallpaper panel with proper light color + shadow.
   * axx0: colorFront=#dfdfdf, colorShadow=#434343, offset (+1,+1).
   */
  _panelText(ctx, text, x, y) {
    ctx.fillStyle = CLR.BEVEL_5;
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = CLR.BEVEL_4;
    ctx.fillText(text, x, y);
  }

  // ─── Top menu bar ──────────────────────────────────────────────────────────

  _drawTopBar(ctx, canvasW) {
    const gs  = this.gameState;
    const civ0 = gs.civs[0];

    // ── Windows title bar (y = 0 .. TITLE_H) ──────────────────────────────────
    // Active-window blue gradient
    const grad = ctx.createLinearGradient(0, 0, canvasW - 70, 0);
    grad.addColorStop(0, CLR.WIN95_HIGHLIGHT);
    grad.addColorStop(1, '#1084d0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW - 60, TITLE_H);
    // Gray section behind the system buttons
    ctx.fillStyle = CLR.WIN95_FACE;
    ctx.fillRect(canvasW - 60, 0, 60, TITLE_H);

    // Small icon (gold square with "C2")
    ctx.fillStyle = '#c89010';
    ctx.fillRect(4, 3, 14, 14);
    ctx.font = FONT.TINY_BOLD;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C2', 11, 10);

    // Title text (matches original Civ2 MGE window title)
    ctx.font = FONT.SMALL_BOLD;
    ctx.fillStyle = CLR.WIN95_LIGHT;
    ctx.textAlign = 'left';
    ctx.fillText("Civilization II Multiplayer Gold", 24, TITLE_H / 2);

    // Win95 system buttons  — □ ×
    const BTN_W = 16, BTN_H = 14;
    const btns  = ['\u2014', '\u25A1', '\u00D7'];
    btns.forEach((label, i) => {
      const bx = canvasW - 4 - (btns.length - i) * (BTN_W + 2);
      const by = Math.round((TITLE_H - BTN_H) / 2);
      ctx.fillStyle = CLR.WIN95_FACE;
      ctx.fillRect(bx, by, BTN_W, BTN_H);
      // Raised bevel
      ctx.strokeStyle = CLR.WIN95_LIGHT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by + BTN_H - 1); ctx.lineTo(bx, by); ctx.lineTo(bx + BTN_W - 1, by);
      ctx.stroke();
      ctx.strokeStyle = CLR.WIN95_SHADOW;
      ctx.beginPath();
      ctx.moveTo(bx + BTN_W - 0.5, by); ctx.lineTo(bx + BTN_W - 0.5, by + BTN_H - 0.5);
      ctx.lineTo(bx, by + BTN_H - 0.5);
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = label === '\u00D7' ? FONT.SMALL_BOLD : FONT.BODY_SMALL;
      ctx.textAlign = 'center';
      ctx.fillText(label, bx + BTN_W / 2, by + BTN_H / 2);
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // ── Menu bar (y = TITLE_H .. TOP_H) ───────────────────────────────────────
    ctx.fillStyle = CLR.WIN95_FACE;
    ctx.fillRect(0, TITLE_H, canvasW, MENU_H);

    // Bevel: white top edge, dark bottom edge
    ctx.strokeStyle = CLR.WIN95_LIGHT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, TITLE_H + 0.5); ctx.lineTo(canvasW, TITLE_H + 0.5);
    ctx.stroke();
    ctx.strokeStyle = CLR.WIN95_SHADOW;
    ctx.beginPath();
    ctx.moveTo(0, TOP_H - 0.5); ctx.lineTo(canvasW, TOP_H - 0.5);
    ctx.stroke();

    // Menu item labels — measure positions and store hit rects
    ctx.font = FONT.BODY_SMALL;
    ctx.textBaseline = 'middle';
    this._menuBarRects = [];
    let mx = 4;
    MENUS.forEach((menu, idx) => {
      const tw  = ctx.measureText(menu.label).width;
      const iw  = tw + 12;   // 6px padding each side
      const iy  = TITLE_H + 1;
      const ih  = MENU_H - 2;
      const active = this._openMenu === idx;
      if (active) {
                ctx.fillStyle = CLR.WIN95_HIGHLIGHT;
                ctx.fillRect(mx, iy, iw, ih);
                // Text
                ctx.fillStyle = CLR.WIN95_LIGHT;
      } else {
        ctx.fillStyle = '#000000';
      }
      ctx.textAlign = 'left';
      ctx.fillText(menu.label, mx + 6, TITLE_H + MENU_H / 2);
      this._menuBarRects.push({ x: mx, w: iw, menuIdx: idx });
      mx += iw + 2;
    });

    // "{Civ adjective} Map" centered in menu bar (matches original Civ2)
    const civAdj = civ0?.data?.adjective ?? civ0?.data?.plural ?? '';
    if (civAdj) {
      ctx.fillStyle = '#000000';
      ctx.font = FONT.BODY_SMALL;
      ctx.textAlign = 'center';
      ctx.fillText(`${civAdj} Map`, canvasW / 2, TITLE_H + MENU_H / 2);
    }

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // Draw open dropdown on top of everything
    if (this._openMenu !== null) this._drawMenuDropdown(ctx, canvasW);
  }

  _drawMenuDropdown(ctx, canvasW) {
    const menu    = MENUS[this._openMenu];
    const barRect = this._menuBarRects[this._openMenu];
    if (!menu || !barRect) return;

    const ITEM_H  = 20;
    const SEP_H   = 7;
    const PAD_L   = 30; // axx0: _paddingLeft=35 for checkmark zone
    const PAD_R   = 12;

    // Measure widths to compute panel size
    ctx.font = FONT.BODY_SMALL;
    let maxLblW = 0, maxSCW = 0;
    for (const item of menu.items) {
      if (!item) continue;
      maxLblW = Math.max(maxLblW, ctx.measureText(item.label).width);
      if (item.shortcut) maxSCW = Math.max(maxSCW, ctx.measureText(item.shortcut).width);
    }
    const panelW = Math.max(180, maxLblW + (maxSCW > 0 ? maxSCW + 35 : 0) + PAD_L + PAD_R + 4);

    let panelH = 4;
    for (const item of menu.items) panelH += item ? ITEM_H : SEP_H;
    panelH += 4;

    // Anchor to the bar item, clamp to canvas width
    let bx = barRect.x;
    if (bx + panelW > canvasW - 4) bx = canvasW - panelW - 4;
    const by = TOP_H;

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(bx + 4, by + 4, panelW, panelH);

    // Panel background (Win95 gray)
    ctx.fillStyle = CLR.WIN95_FACE;
    ctx.fillRect(bx, by, panelW, panelH);

    // 3-D border: white highlight top/left, dark shadow bottom/right
    ctx.strokeStyle = CLR.WIN95_LIGHT; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx, by + panelH - 1); ctx.lineTo(bx, by); ctx.lineTo(bx + panelW - 1, by);
    ctx.stroke();
    ctx.strokeStyle = CLR.WIN95_SHADOW;
    ctx.beginPath();
    ctx.moveTo(bx + panelW - 0.5, by); ctx.lineTo(bx + panelW - 0.5, by + panelH - 0.5);
    ctx.lineTo(bx, by + panelH - 0.5);
    ctx.stroke();
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(bx + panelW, by + 1); ctx.lineTo(bx + panelW, by + panelH);
    ctx.lineTo(bx + 1, by + panelH);
    ctx.stroke();

    const gs = this.gameState;
    const au = gs.activeUnit;
    this._menuItemRects = [];
    let iy = by + 4;

    menu.items.forEach(item => {
       if (!item) {
         // Separator
         ctx.fillStyle = CLR.WIN95_SHADOW;
         ctx.fillRect(bx + 2, iy + 2, panelW - 4, 1);
         ctx.fillStyle = CLR.WIN95_LIGHT;
         ctx.fillRect(bx + 2, iy + 3, panelW - 4, 1);
         iy += SEP_H;
         return;
       }

      const disabled = !!(item.needsUnit && !(au && au.civId === 0));
      const hovered  = !disabled && this._menuHoverIdx === this._menuItemRects.length;

      if (hovered) {
                ctx.fillStyle = CLR.WIN95_HIGHLIGHT;
        ctx.fillRect(bx + 2, iy, panelW - 4, ITEM_H);
      }

      // Checkmark for toggle items (axx0: blue square + checkmark at left)
      const isChecked = item.toggle && this._isMenuItemChecked(item.action);
      if (isChecked) {
        const ckX = bx + 6, ckY = iy + 3, ckS = 14;
        ctx.fillStyle = hovered ? '#4090d0' : '#56b0fa';
        ctx.fillRect(ckX, ckY, ckS, ckS);
        ctx.strokeStyle = hovered ? '#ffffff' : '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ckX + 3, ckY + 7); ctx.lineTo(ckX + 6, ckY + 10); ctx.lineTo(ckX + 11, ckY + 3);
        ctx.stroke();
      }

      ctx.font = FONT.BODY_SMALL;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = disabled ? CLR.WIN95_SHADOW : hovered ? CLR.WIN95_LIGHT : '#000000';
      ctx.fillText(item.label, bx + PAD_L, iy + ITEM_H / 2);

      if (item.shortcut) {
        ctx.textAlign = 'right';
        ctx.fillStyle = disabled ? CLR.BEVEL_2_DARK : hovered ? '#c0d0ff' : '#505050';
        ctx.fillText(item.shortcut, bx + panelW - PAD_R, iy + ITEM_H / 2);
      }

      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';

      this._menuItemRects.push({ x: bx, y: iy, w: panelW, h: ITEM_H, action: item.action, disabled });
      iy += ITEM_H;
    });
  }

  _isMenuItemChecked(action) {
    switch (action) {
      case 'view_grid': return !!this._showGrid;
      case 'view_hidden': return !!this._showHiddenTerrain;
      case 'cheat_toggle': return !!this._cheatMode;
      default: return false;
    }
  }

  _executeMenuAction(action) {
    if (this._executeGameAction(action)) return;
    if (this._executeViewAction(action)) return;
    if (this._executeKingdomAction(action)) return;
    if (this._executeOrdersAction(action)) return;
    if (this._executeAdvisorsAction(action)) return;
    if (this._executeWorldAction(action)) return;
    if (this._executeCheatAction(action)) return;
    this._executeCivilopediaAction(action);
  }

  _executeGameAction(action) {
    switch (action) {
      case 'game_quit':
        if (confirm('Quit Civilization II?')) window.location.reload();
        return true;
      case 'game_new':
        this._openNewGameWizard();
        return true;
      case 'game_retire':
        this._retireScoreOnly = false;
        this._retireStage = 'confirm';
        this._retireRects = [];
        return true;
      case 'game_save':
        this._saveGame();
        return true;
      case 'game_save_sav':
        this._saveGameAsSav();
        return true;
      case 'game_load':
        this._loadGame();
        return true;
      case 'game_reportbug':
        this._openBugReportDialog();
        return true;
      case 'game_options':
        this._gameOptionsDialog = true;
        this._gameOptionsRects = [];
        return true;
      case 'game_graphicoptions':
        this._graphicOptionsDialog = true;
        this._graphicOptionsRects = [];
        return true;
      case 'game_cityreportoptions':
        this._cityReportOptionsDialog = true;
        this._cityReportOptionsRects = [];
        return true;
      case 'game_music':
        this._showMusicPicker();
        return true;
      default:
        return false;
    }
  }

  _executeViewAction(action) {
    const gs = this.gameState;
    const au = gs.activeUnit;

    switch (action) {
      case 'view_center':
        if (au) this.centerOn(au.col, au.row, this._canvasW, this._canvasH);
        return true;
      case 'view_zoomin':
        this._setZoomLevel(Math.min(4, this._zoomLevel + 1));
        return true;
      case 'view_zoomout':
        this._setZoomLevel(Math.max(1, this._zoomLevel - 1));
        return true;
      case 'view_maxzoomin':
        this._setZoomLevel(4);
        return true;
      case 'view_stdzoom':
        this._setZoomLevel(1);
        return true;
      case 'view_medzoomout':
        this._setZoomLevel(2);
        return true;
      case 'view_maxzoomout':
        this._setZoomLevel(1);
        return true;
      case 'view_palace':
        this._palaceView = !this._palaceView;
        return true;
      case 'view_throne':
        this._throneRoom = !this._throneRoom;
        return true;
      case 'view_grid':
        this._showGrid = !this._showGrid;
        return true;
      case 'view_movepieces':
        this._viewOnlyMode = false;
        this.gameState.log.unshift('Move Pieces');
        return true;
      case 'view_viewpieces':
        this._viewOnlyMode = true;
        this.gameState.log.unshift('View Pieces');
        return true;
      case 'view_hidden':
        this._showHiddenTerrain = !this._showHiddenTerrain;
        this.gameState.log.unshift(this._showHiddenTerrain ? 'Hidden terrain shown.' : 'Hidden terrain hidden.');
        return true;
      default:
        return false;
    }
  }

  _executeKingdomAction(action) {
    const gs = this.gameState;

    switch (action) {
      case 'kd_tax':
        this._openRateDialog(action);
        return true;
      case 'kd_findcity':
        this._openFindCityDialog();
        return true;
      case 'kd_revolution':
        if (gs.civs[0]?.government !== 0) {
          gs.startRevolution();
        } else {
          gs.log.unshift('Already in anarchy!');
        }
        return true;
      default:
        return false;
    }
  }

  _executeOrdersAction(action) {
    const gs = this.gameState;
    const au = gs.activeUnit;

    switch (action) {
      case 'ord_city':
        if (au && au.civId === 0 && UNITS[au.typeId]?.role === 5) {
          this._openCityNamingDialog(au);
        }
        return true;
      case 'ord_road':
        if (au && au.civId === 0 && UNITS[au.typeId]?.role === 5) gs.startBuild(au, 'road');
        return true;
      case 'ord_railroad':
        if (au && au.civId === 0 && UNITS[au.typeId]?.role === 5) gs.startBuild(au, 'railroad');
        return true;
      case 'ord_irrigate':
        if (au && au.civId === 0 && UNITS[au.typeId]?.role === 5) gs.startBuild(au, 'irrigation');
        return true;
      case 'ord_mine':
        if (au && au.civId === 0 && UNITS[au.typeId]?.role === 5) gs.startBuild(au, 'mine');
        return true;
      case 'ord_fortress':
        if (au && au.civId === 0 && UNITS[au.typeId]?.role === 5) gs.startBuild(au, 'fortress');
        return true;
      case 'ord_airbase':
        if (au && au.civId === 0 && UNITS[au.typeId]?.role === 5) gs.startBuild(au, 'buildAirbase');
        return true;
      case 'ord_pollution':
        if (au && au.civId === 0 && UNITS[au.typeId]?.role === 5) gs.startBuild(au, 'cleanPollution');
        return true;
      case 'ord_pillage':
        if (au && au.civId === 0) { if (gs.pillage) gs.pillage(au); }
        return true;
      case 'ord_unload':
        if (au && au.civId === 0 && au.cargo?.length) {
          for (const c of [...au.cargo]) gs.disembarkUnit?.(c);
        }
        return true;
      case 'ord_goto':
        if (au && au.civId === 0) { this._gotoMode = true; }
        return true;
      case 'ord_airlift':
        if (au && au.civId === 0) {
          const targets = gs.getAirliftTargets?.(au);
          if (targets?.length) { this._airliftMode = true; this._airliftTargets = targets; }
        }
        return true;
      case 'ord_autosettle':
        if (au && au.civId === 0 && UNITS[au.typeId]?.role === 5) {
          au.autoSettler = !au.autoSettler;
        }
        return true;
      case 'ord_fortify':  if (au && au.civId === 0) gs.fortifyUnit(au);  return true;
      case 'ord_sleep':    if (au && au.civId === 0) gs.sleepUnit(au);    return true;
      case 'ord_gohome':   if (au && au.civId === 0) gs.goHomeUnit(au);   return true;
      case 'ord_activate':
        if (au && au.civId === 0) { au.sleeping = false; au.fortified = false; au.sentry = false; }
        return true;
      case 'ord_wait':
        if (au && au.civId === 0) gs.waitUnit?.(au);
        return true;
      case 'ord_paradrop':
        if (au && au.civId === 0) {
          const info = gs.getParadropInfo(au);
          if (info.canParadrop) {
            this._paradropMode = true;
            this._paradropTiles = info.validTiles;
          }
        }
        return true;
      case 'ord_disband':  if (au && au.civId === 0) gs.disbandUnit(au);  return true;
      case 'ord_skip':     if (au && au.civId === 0) gs.skipUnit(au);     return true;
      case 'ord_endturn':  if (gs.activeCivIdx === 0) { gs.endTurn(); this._play(SFX.endTurn); } return true;
      default:
        return false;
    }
  }

  _executeAdvisorsAction(action) {
    switch (action) {
      case 'adv_science':
        this._scienceAdvisor      = !this._scienceAdvisor;
        this._scienceAdvisorRects = [];
        return true;
      case 'adv_foreign':
        this._diplomacyScreen = true;
        this._diplomacyScreenRects = [];
        return true;
      case 'adv_domestic':
        this._domesticAdvisor = !this._domesticAdvisor;
        this._domesticScroll = 0;
        this._domesticRects = [];
        return true;
      case 'adv_trade':
        this._tradeAdvisor       = !this._tradeAdvisor;
        this._tradeAdvisorRects  = [];
        this._tradeAdvisorScroll = 0;
        return true;
      case 'adv_military':
        this._militaryAdvisor = !this._militaryAdvisor;
        this._militaryRects = [];
        return true;
      case 'adv_attitude':
        this._attitudeAdvisor = !this._attitudeAdvisor;
        this._attitudeScroll  = 0;
        this._attitudeRects   = [];
        return true;
      case 'adv_council':
        if (this._highCouncil) { this._stopCouncilVideo(); this._highCouncil = false; }
        else { this._highCouncil = true; this._startCouncilVideo(); }
        return true;
      case 'adv_casualties':
        this._casualtyDialog = !this._casualtyDialog;
        this._casualtyDialogRects = [];
        return true;
      default:
        return false;
    }
  }

  _executeWorldAction(action) {
    const gs = this.gameState;

    switch (action) {
      case 'wld_wonders':
        this._wondersList = !this._wondersList;
        return true;
      case 'wld_top5':
        this._top5Cities = !this._top5Cities;
        return true;
      case 'wld_demo':
        this._demographicsScreen = !this._demographicsScreen;
        return true;
      case 'wld_hof':
        this._hallOfFame = !this._hallOfFame;
        return true;
      case 'wld_unelect': {
        const result = gs.proposeUnElection();
        if (!result.eligible) {
          gs._addLog('You must own the United Nations to call an election.');
        } else if (result.alreadyUsed) {
          gs._addLog('The UN Election has already been held this game.');
        }
        // Victory/defeat is set inside proposeUnElection if applicable.
        return true;
      }
      case 'wld_spaceships':
        this._spaceshipViewer = !this._spaceshipViewer;
        this._spaceshipViewerRects = [];
        return true;
      case 'wld_replay':
        this._replayMap   = !this._replayMap;
        this._replayFrame = 0;
        this._replayTimer = 0;
        return true;
      case 'wld_score':
        this._retireScoreOnly = true;
        this._retireStage = 'score';
        this._retireRects = [];
        return true;
      default:
        return false;
    }
  }

  _executeCheatAction(action) {
    const gs = this.gameState;

    switch (action) {
      case 'cheat_reveal':
        for (let r = 0; r < gs.mapRows; r++)
          for (let c = 0; c < gs.mapCols; c++)
            gs._visibility[r][c] = 2;
        gs.log.unshift('Map revealed.');
        return true;
      case 'cheat_gold':
        if (gs.civs[0]) {
          gs.civs[0].gold = (gs.civs[0].gold ?? 0) + 1000;
          gs.log.unshift('+1000 gold added.');
        }
        return true;
      case 'cheat_research':
        if (gs.civs[0] && gs.civs[0].currentResearch != null) {
          gs.civs[0].beakers = gs.advanceCost(gs.civs[0]);
          gs.log.unshift('Research completed next turn.');
        }
        return true;
      case 'cheat_destroyunits': {
        // Destroy all units at the cursor position (axx0: Ctrl+Shift+D)
        const vt = this._hoveredTile;
        if (vt) {
          const toRemove = gs.units.filter(u => u.col === vt.col && u.row === vt.row);
          for (const u of toRemove) gs._removeUnit(u);
          if (toRemove.length) gs.log.unshift(`Destroyed ${toRemove.length} unit(s).`);
        }
        return true;
      }
      case 'cheat_edittechs':
        this._openEditTechsDialog();
        return true;
      case 'cheat_editunit':
        this._openEditUnitDialog();
        return true;
      case 'cheat_editcity':
        this._openEditCityDialog();
        return true;
      case 'cheat_editking':
        this._openEditKingDialog();
        return true;
      default:
        return false;
    }
  }

  _executeCivilopediaAction(action) {
    switch (action) {
      case 'cpd_advances': case 'cpd_improv': case 'cpd_units': case 'cpd_terrain':
      case 'cpd_wonders': case 'cpd_govts': case 'cpd_concepts': case 'cpd_about': {
        const tabMap = {
          cpd_advances: 'advances', cpd_improv: 'improv', cpd_units: 'units',
          cpd_terrain: 'terrain', cpd_wonders: 'wonders', cpd_govts: 'govts',
          cpd_concepts: 'concepts', cpd_about: 'about',
        };
        this._civilopedia = { tab: tabMap[action], selIdx: 0, scroll: 0, rects: [], mode: 'index' };
        if (!this._pediaTexts) this._loadPediaTexts().then(() => {});
        return true;
      }
      default:
        return false;
    }
  }


  // ─── SidebarMixin (extracted to mixins/SidebarMixin.js) ─────────────

  // ─── CityScreenMixin (extracted to mixins/CityScreenMixin.js) ─────────────

  // ─── Research chooser overlay ──────────────────────────────────────────────

  _researchStepsTowardGoal(civ, goalId) {
    const available = new Set(this.gameState.availableAdvances(civ.id).map(a => a.id));
    const next = new Set();
    const visit = (id, seen = new Set()) => {
      if (id == null || id < 0 || civ.advances.has(id) || seen.has(id)) return;
      if (available.has(id)) { next.add(id); return; }
      const branch = new Set(seen);
      branch.add(id);
      const adv = ADVANCES[id];
      if (!adv) return;
      for (const preq of adv.preq ?? []) visit(preq, branch);
    };
    visit(goalId);
    const candidates = [...next];
    return candidates.length ? candidates : [...available];
  }

  _handleResearchChooserClick(px, py) {
    // Research Goal dialog is shown on top
    if (this._researchGoalDialog) {
      for (const r of (this._researchGoalRects ?? [])) {
        if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
          if (r.advId === -3) {
            const items = this._getCivilopediaItems('advances');
            const selIdx = Math.max(0, items.findIndex(a => a.id === this._researchGoalSelectedId));
            this._civilopedia = { tab: 'advances', selIdx, scroll: 0, rects: [], mode: 'detail' };
            if (!this._pediaTexts) this._loadPediaTexts().then(() => {});
          } else if (r.advId === -1 && this._researchGoalSelectedId != null) {
            // A Civ2 research goal is not a prerequisite bypass.  It narrows
            // the normal chooser to currently researchable steps on the path.
            const civ = this.gameState.civs[0];
            civ.researchGoal = this._researchGoalSelectedId;
            this._researchGoalCandidates = this._researchStepsTowardGoal(civ, this._researchGoalSelectedId);
            this._researchGoalDialog = false;
            this._researchChooserScroll = 0;
            this._researchChooserSelectedId = this._researchGoalCandidates[0] ?? null;
            this._play(SFX.menuOk);
          } else if (r.advId >= 0) {
            this._researchGoalSelectedId = r.advId;
          }
          return;
        }
      }
      // MGE dialogs are modal; clicking the map does not dismiss them.
      return;
    }

    // Item rows + buttons
    for (const r of this._researchChooserRects) {
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
        if (r.advId === -2) {
          // Goal button — open full tech list
          this._researchGoalDialog = true;
          this._researchGoalScroll = 0;
          this._researchGoalSelectedId = null;
          this._play(SFX.menuOk);
        } else if (r.advId === -3) {
          const selected = ADVANCES[this._researchChooserSelectedId] ?? ADVANCES[0];
          const items = this._getCivilopediaItems('advances');
          const selIdx = Math.max(0, items.findIndex(a => a.id === selected?.id));
          this._civilopedia = { tab: 'advances', selIdx, scroll: 0, rects: [], mode: 'detail' };
          if (!this._pediaTexts) this._loadPediaTexts().then(() => {});
        } else if (r.advId === -1 && this._researchChooserSelectedId != null) {
          this.gameState.startResearch(0, this._researchChooserSelectedId);
          this._researchChooser = false;
          this._researchGoalCandidates = null;
          this._researchChooserSelectedId = null;
          this._play(SFX.menuOk);
        } else if (r.advId >= 0) {
          this._researchChooserSelectedId = r.advId;
        }
        return;
      }
    }
    // MGE dialogs are modal; clicks outside do not cancel the choice.
  }


  // ─── WizardMixin (extracted to mixins/WizardMixin.js) ─────────────

  // ─── Civ2 .SAV import ─────────────────────────────────────────────────────

  _triggerMapImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp,.MP';
    input.style.display = 'none';
    document.body.appendChild(input);

    const restoreTitle = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
      this._titleScreen = true;
    };
    input.addEventListener('cancel', restoreTitle, { once: true });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) { this._titleScreen = true; return; }
      try {
        this._pendingMapData = MapLoader.load(await file.arrayBuffer());
        this._openNewGameWizard(true);
        // A premade world replaces the size/custom-world screens.
        this._wizard.step = 1;
      } catch (e) {
        console.error('Map import failed:', e);
        this._titleScreen = true;
      }
    }, { once: true });
    input.click();
  }

  _triggerSavImport(returnToTitle = false) {
    // Create a transient file input and immediately click it.
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.sav,.SAV';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('cancel', () => {
      if (input.parentNode) input.parentNode.removeChild(input);
      if (returnToTitle) this._titleScreen = true;
    }, { once: true });

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) { if (returnToTitle) this._titleScreen = true; return; }
      try {
        const buffer = await file.arrayBuffer();
        this._importCiv2Save(buffer);
      } catch (e) {
        console.error('SAV import failed:', e);
        this.gameState.log.unshift(`Import failed: ${e.message}`);
        if (this.gameState.log.length > 8) this.gameState.log.length = 8;
        if (returnToTitle) this._titleScreen = true;
      }
    });

    input.click();
  }

  _importCiv2Save(buffer) {
    const gs = Civ2SaveLoader.fromBuffer(buffer);
    this._wireAudio(gs);
    this._resetWithGameState(gs);
    this._wizard = null;
    this._play(SFX.pos);
  }

  // ─── Scenario Import ─────────────────────────────────────────────────────

  _triggerScenarioImport(returnToTitle = false) {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.scn,.SCN,.sav,.SAV';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('cancel', () => {
      if (input.parentNode) input.parentNode.removeChild(input);
      if (returnToTitle) this._titleScreen = true;
    }, { once: true });

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (!file) { if (returnToTitle) this._titleScreen = true; return; }
      try {
        const buffer = await file.arrayBuffer();
        const info = Civ2SaveLoader.getScenarioInfo(buffer);
        const scenarioName = file.name.replace(/\.(scn|sav)$/i, '');
        this._scenarioPending = { buffer, info, scenarioName };
        this._scenarioCivChooser = true;
        this._scenarioCivRects = [];
      } catch (e) {
        console.error('Scenario import failed:', e);
        this.gameState.log.unshift(`Scenario failed: ${e.message}`);
        if (this.gameState.log.length > 8) this.gameState.log.length = 8;
        if (returnToTitle) this._titleScreen = true;
      }
    });

    input.click();
  }

  _drawScenarioCivChooser(ctx, canvasW, canvasH) {
    
    
    const pending = this._scenarioPending;
    if (!pending) return;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const civs = pending.info.civsInPlay;
    const BTN_H = 28, GAP = 4, PAD = 12;
    const PW = 320;
    const PH = 80 + civs.length * (BTN_H + GAP) + 20;
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);

    this._drawWin95Panel(ctx, px, py, PW, PH, `Scenario: ${pending.scenarioName}`);
    this._scenarioCivRects = [];

    ctx.font = FONT.BODY_TIMES_BOLD;
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Choose your civilization:', px + PW / 2, py + 48);

    let by = py + 60;
    for (const civ of civs) {
      const bx = px + PAD, bw = PW - PAD * 2;
      ctx.fillStyle = CLR.WIN95_FACE;
      ctx.fillRect(bx, by, bw, BTN_H);
      ctx.fillStyle = CLR.WIN95_LIGHT; ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by, 1, BTN_H);
      ctx.fillStyle = CLR.WIN95_SHADOW; ctx.fillRect(bx, by + BTN_H - 1, bw, 1); ctx.fillRect(bx + bw - 1, by, 1, BTN_H);
      ctx.fillStyle = CLR.WIN95_LIGHT_EDGE; ctx.fillRect(bx + 1, by + 1, bw - 2, 1); ctx.fillRect(bx + 1, by + 1, 1, BTN_H - 2);
      ctx.fillStyle = CLR.WIN95_DARK_SHADOW; ctx.fillRect(bx + 1, by + BTN_H - 2, bw - 2, 1); ctx.fillRect(bx + bw - 2, by + 1, 1, BTN_H - 2);

      // Civ color swatch
      const civColor = CIV_COLORS[CIVS[civ.tribeId]?.color ?? 1];
      ctx.fillStyle = civColor;
      ctx.fillRect(bx + 6, by + 6, 16, 16);

      ctx.font = FONT.SMALL_BOLD;
      ctx.fillStyle = '#000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(civ.name, bx + 28, by + BTN_H / 2);
      this._scenarioCivRects.push({ savId: civ.savId, x: bx, y: by, w: bw, h: BTN_H });
      by += BTN_H + GAP;
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  _handleScenarioCivClick(px, py) {
    const hit = this._scenarioCivRects.find(
      r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
    );
    if (!hit || !this._scenarioPending) return;
    try {
      const { buffer, scenarioName } = this._scenarioPending;
      const gs = Civ2SaveLoader.fromScenario(buffer, hit.savId, { scenarioName });
      this._wireAudio(gs);
      this._resetWithGameState(gs);
      this._wizard = null;
      this._scenarioCivChooser = false;
      this._scenarioPending = null;
      this._play(SFX.pos);
    } catch (e) {
      console.error('Scenario load failed:', e);
      this._scenarioCivChooser = false;
      this._scenarioPending = null;
    }
  }

  // ─── Save / Load ──────────────────────────────────────────────────────────

  _saveGame() {
    try {
      const data = this.gameState.toSaveData();
      localStorage.setItem('civ2_save', JSON.stringify(data));
      this.gameState.log.unshift('Game saved.');
      if (this.gameState.log.length > 8) this.gameState.log.length = 8;
      this._play(SFX.pos);
    } catch (e) {
      console.error('Save failed:', e);
      this.gameState.log.unshift('Save failed — storage unavailable.');
      if (this.gameState.log.length > 8) this.gameState.log.length = 8;
      this._play(SFX.neg);
    }
  }

  _saveGameAsSav() {
    try {
      const buffer = this.gameState.exportSav();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      a.href = url;
      a.download = `civ2_save_${yyyy}-${mm}-${dd}.sav`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.gameState.log.unshift('SAV exported.');
      if (this.gameState.log.length > 8) this.gameState.log.length = 8;
      this._play(SFX.pos);
    } catch (e) {
      console.error('SAV export failed:', e);
      this.gameState.log.unshift('SAV export failed.');
      if (this.gameState.log.length > 8) this.gameState.log.length = 8;
      this._play(SFX.neg);
    }
  }

  _loadGame() {
    try {
      const raw = localStorage.getItem('civ2_save');
      if (!raw) {
        this.gameState.log.unshift('No saved game found.');
        if (this.gameState.log.length > 8) this.gameState.log.length = 8;
        this._play(SFX.neg);
        return;
      }
      const data = JSON.parse(raw);
      const gs = GameState.fromSaveData(data);
      this._wireAudio(gs);
      this._resetWithGameState(gs);
      this._play(SFX.pos);
    } catch (e) {
      console.error('Load failed:', e);
      this.gameState.log.unshift('Load failed — save data corrupted.');
      if (this.gameState.log.length > 8) this.gameState.log.length = 8;
      this._play(SFX.neg);
    }
  }

  _resetWithGameState(gs) {
    this.gameState  = gs;
    this.mapCols    = gs.mapCols;
    this.mapRows    = gs.mapRows;
    this.viewX = 0;
    this.viewY = 0;
    this._unitSpriteCache.clear();
    this._shieldCache?.clear();
    this._ditherMasks = null;
    this._ditherCache = null;
    this._fogDitherQuads = null;
    this._cityScreen          = null;
    this._cityScreenProdList  = false;
    this._cityScreenQueueAddMode = false;
    this._unitMenu            = null;
    this._unitMoveMode        = false;
    this._moveRangeTiles      = null;
    this._tileInfoPopup       = null;
    this._researchChooser     = false;
    this._researchGoalCandidates = null;
    this._editTechsDialog     = null;
    this._editUnitDialog      = null;
    this._editCityDialog      = null;
    this._editKingDialog      = null;
    this._govtChooser         = false;
    this._rateDialog          = null;
    this._diplomacyScreen     = false;
    this._stopHeraldVideo();
    this._negotiationScreen   = null;
    this._aiPeaceProposal     = null;
    this._captureDialog       = null;
    this._bugReportDialog     = null;
    this._stopWonderVideo();
    this._wonderSplash        = null;
    this._wonderVideo         = null;
    this._stopCouncilVideo();
    this._highCouncil         = false;
    this._councilVideo        = null;
    this._gotoMode            = false;
    this._paradropMode        = false;
    this._paradropTiles       = [];
    this._airliftMode         = false;
    this._rebaseMode          = false;
    this._scienceAdvisor      = false;
    this._scienceAdvisorRects = [];
    this._sciScroll           = 0;
    this._tradeAdvisor        = false;
    this._tradeAdvisorRects   = [];
    this._tradeAdvisorScroll  = 0;
    this._attitudeAdvisor     = false;
    this._attitudeScroll      = 0;
    this._attitudeRects       = [];
    this._civilopedia         = null;   // keep _pediaTexts across resets (already fetched)
    this._palaceView          = false;
    this._throneRoom          = false;
    this._throneUpgradeDialog = false;
    this._throneUpgradeRects  = [];
    this._scenarioCivChooser  = false;
    this._scenarioPending     = null;
    this._scenarioCivRects    = [];
    this._replayMap           = false;
    this._replayFrame         = 0;
    this._replayTimer         = 0;
    this._wizard              = null;
    this._titleScreen         = false;
    this._gameOverVideoPlayed = false;
    this._stopEventVideo();
    // Suppress any opening video overlay still in the DOM (prevent it from re-enabling title screen)
    this._openingVideoDone = true;
    const openVid = document.querySelector('video[src*="OPENING"]');
    if (openVid?.parentNode) {
      openVid.pause();
      openVid.parentNode.removeChild(openVid);
    }
    this._openMenu            = null;
    this._menuItemRects       = [];
    this._lastActiveUnit      = null;
    this._moveAnim            = null;
    this._moveAnimQueue       = [];
    this._moveAnimUnit        = null;
    this._combatAnim          = null;
    this._gameOptionsDialog   = false;
    this._gameOptionsRects    = [];
    this._casualtyDialog      = false;
    this._casualtyDialogRects = [];
    this._showGrid            = false;
    this._showHiddenTerrain   = false;
    this._spaceshipViewer     = false;
    this._spaceshipViewerRects = [];
    this._lastFoundCityId     = -1;

    // Start era-appropriate music
    this._startEraMusic(gs.year);

    // Ensure visibility is computed for the new game state
    if (typeof gs._updateVisibility === 'function') {
      gs._updateVisibility();
    }

    const firstUnit = gs.activeUnit ?? gs.units[0];
    if (firstUnit) {
      this.centerOn(firstUnit.col, firstUnit.row, this._canvasW, this._canvasH);
    } else if (gs.cities.length > 0) {
      const firstCity = gs.cities[0];
      this.centerOn(firstCity.col, firstCity.row, this._canvasW, this._canvasH);
    }
  }

  /** Determine the music era from game year and start the matching CD track. */
  _startEraMusic(year) {
    let era;
    if (year < 0)    era = 'ancient';
    else if (year < 1500) era = 'renaissance';
    else             era = 'modern';

    if (this._currentMusicEra === era) return;
    this._currentMusicEra = era;

    this.audio?.playCDMusic(era);
  }


  // ─── DialogsMixin (extracted to mixins/DialogsMixin.js) ─────────────

  // ─── HUD ───────────────────────────────────────────────────────────────────

  _drawHud(ctx, canvasW, canvasH) {
    // Kept as an extension point for non-map HUD overlays. Movement remains
    // mouse-friendly, but MGE does not paint a banner or range tint on the map.
  }


  // ─── Advisors (extracted to mixins/AdvisorsMixin.js) ───────────────────────


  // ─── InfoScreensMixin (extracted to mixins/InfoScreensMixin.js) ─────────────

  // ─── Win95 Panel Helper ─────────────────────────────────────────────────────

  _drawWin95Panel(ctx, px, py, pw, ph, title) {
    return this._drawCiv2Panel(ctx, px, py, pw, ph, title);
  }

  /**
   * Draw a Win95-style raised button.
   * Based on axx0 Civ2GoldInterface.cs DrawButton (lines 711-725).
   */
  _drawWin95Button(ctx, bx, by, bw, bh, label, fontFamily) {
    // Outer border — rgb(100,100,100) matching axx0 reference
    ctx.strokeStyle = 'rgb(100,100,100)'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    // Inner white highlight fill
    ctx.fillStyle = CLR.WIN95_LIGHT;
    ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    // Button face — inset 3px from edge
    ctx.fillStyle = CLR.WIN95_FACE;
    ctx.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
    // Bottom shadow — 2 lines
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(bx + 2, by + bh - 2, bw - 4, 1);
    ctx.fillRect(bx + 3, by + bh - 3, bw - 5, 1);
    // Right shadow — 2 lines
    ctx.fillRect(bx + bw - 1, by + 2, 1, bh - 3);
    ctx.fillRect(bx + bw - 2, by + 3, 1, bh - 4);
    if (label) {
      // axx0: Fonts.Tnr (Times New Roman), ButtonFontSize=20
      ctx.font = fontFamily ? `13px ${fontFamily}` : FONT.BUTTON; ctx.fillStyle = '#000000';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + bw / 2, by + bh / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }

  /**
   * Draw a pixel-accurate Win95 checkbox.
   * Based on axx0/Civ2-clone PaintCheckbox (RaylibUI/Bitmaps/ImageUtils.cs).
   * The checkbox is ~20×20 pixels drawn at (x, y). Checkmark extends to ~26px wide.
   */
  _drawCiv2Checkbox(ctx, x, y, checked) {
    // White base fill (rounded corners)
    ctx.fillStyle = CLR.WIN95_LIGHT;
    ctx.fillRect(x + 3, y + 2, 15, 17);
    ctx.fillRect(x + 2, y + 3, 17, 15);
    // Gray inset fill
    ctx.fillStyle = CLR.WIN95_SHADOW;
    ctx.fillRect(x + 4, y + 3, 13, 15);
    ctx.fillRect(x + 3, y + 4, 15, 13);
    // Black top-left border
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 4, y + 3, 12, 1);       // top edge
    ctx.fillRect(x + 3, y + 4, 1, 12);        // left edge
    ctx.fillRect(x + 3, y + 4, 2, 1);         // corner
    // Black bottom-right border
    ctx.fillRect(x + 4, y + 19, 14, 1);       // bottom edge
    ctx.fillRect(x + 18, y + 18, 1, 1);       // corner
    ctx.fillRect(x + 19, y + 4, 1, 13);       // right edge

    if (checked) {
      // Checkmark body (black)
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + 21, y + 3, 4, 1);
      ctx.fillRect(x + 20, y + 4, 3, 1);
      ctx.fillRect(x + 19, y + 5, 2, 1);
      ctx.fillRect(x + 18, y + 6, 2, 1);
      ctx.fillRect(x + 17, y + 7, 2, 1);
      ctx.fillRect(x + 16, y + 8, 2, 1);
      ctx.fillRect(x + 15, y + 9, 2, 1);
      ctx.fillRect(x + 5, y + 10, 1, 1);
      ctx.fillRect(x + 14, y + 10, 2, 1);
      ctx.fillRect(x + 6, y + 11, 1, 1);
      ctx.fillRect(x + 14, y + 11, 2, 1);
      ctx.fillRect(x + 7, y + 12, 1, 1);
      ctx.fillRect(x + 13, y + 12, 2, 1);
      ctx.fillRect(x + 8, y + 13, 6, 1);
      ctx.fillRect(x + 12, y + 14, 2, 1);
      ctx.fillRect(x + 9, y + 15, 3, 1);
      ctx.fillRect(x + 10, y + 16, 2, 1);
      ctx.fillRect(x + 11, y + 17, 1, 1);
      // Checkmark highlight (white + light gray)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 20, y + 1, 2, 1);
      ctx.fillRect(x + 19, y + 2, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 20, y + 2, 2, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 18, y + 3, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 19, y + 3, 1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 17, y + 4, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 18, y + 4, 1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 16, y + 5, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 17, y + 5, 1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 15, y + 6, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 16, y + 6, 1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 14, y + 7, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 15, y + 7, 1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 4, y + 8, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 5, y + 8, 1, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 13, y + 8, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 14, y + 8, 1, 1);
      ctx.fillRect(x + 6, y + 9, 1, 2);
      ctx.fillRect(x + 13, y + 9, 1, 1);
      ctx.fillRect(x + 7, y + 10, 1, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 12, y + 10, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 13, y + 10, 1, 2);
      ctx.fillRect(x + 8, y + 11, 1, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 11, y + 11, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 12, y + 11, 1, 2);
      ctx.fillRect(x + 9, y + 12, 1, 2);
      ctx.fillRect(x + 11, y + 12, 1, 1);
      ctx.fillRect(x + 9, y + 13, 2, 1);
      ctx.fillRect(x + 9, y + 14, 2, 1);
      ctx.fillRect(x + 10, y + 14, 1, 2);
    }
  }

  /** Draw a Win95-style vertical scrollbar. */
  _drawScrollbar(ctx, x, y, h, scrollPos, maxScroll) {
    if (maxScroll <= 0) return;
    const W = 16;
    ctx.fillStyle = CLR.WIN95_FACE; ctx.fillRect(x, y, W, h);
    ctx.strokeStyle = CLR.WIN95_SHADOW; ctx.strokeRect(x, y, W, h);
    ctx.fillStyle = CLR.WIN95_LIGHT_EDGE; ctx.fillRect(x + 1, y + 1, W - 2, W - 2);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(x + W / 2, y + 4); ctx.lineTo(x + 4, y + W - 4); ctx.lineTo(x + W - 4, y + W - 4); ctx.fill();
    ctx.fillStyle = CLR.WIN95_LIGHT_EDGE; ctx.fillRect(x + 1, y + h - W + 1, W - 2, W - 2);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(x + W / 2, y + h - 4); ctx.lineTo(x + 4, y + h - W + 4); ctx.lineTo(x + W - 4, y + h - W + 4); ctx.fill();
    const trackH = h - W * 2;
    const thumbH = Math.max(20, trackH * Math.min(1, h / (h + maxScroll)));
    const thumbY = y + W + (trackH - thumbH) * (scrollPos / maxScroll);
    ctx.fillStyle = CLR.WIN95_FACE; ctx.fillRect(x + 1, thumbY, W - 2, thumbH);
    ctx.fillStyle = CLR.WIN95_LIGHT; ctx.fillRect(x + 1, thumbY, W - 2, 1); ctx.fillRect(x + 1, thumbY, 1, thumbH);
    ctx.fillStyle = CLR.WIN95_SHADOW; ctx.fillRect(x + 1, thumbY + thumbH - 1, W - 2, 1); ctx.fillRect(x + W - 2, thumbY, 1, thumbH);
  }

  _drawGameOptionsDialog(ctx, canvasW, canvasH) {
    if (!this._gameOptionsDialog) return;
    
    // All options matching original Civ2 MGE (screenshot 17.09.07)
    const labels = [
      ['soundEffects',        'Sound Effects'],
      ['music',               'Music'],
      ['alwaysWait',          'Always wait at end of turn.'],
      ['autoSave',            'Autosave each turn.'],
      ['showEnemyMoves',      'Show enemy moves.'],
      ['noPauseEnemyMoves',   'No pause after enemy moves.'],
      ['fastPieceSlide',      'Fast piece slide.'],
      ['instantAdvice',       'Instant advice.'],
      ['tutorialHelp',        'Tutorial help.'],
      ['showMovePaths',       'Move units w/ mouse (cursor arrows).'],
      ['enterAdvances',       'ENTER key closes City Screen.'],
    ];
    const DW = 440, DH = 50 + labels.length * 24 + 50;
    const dx = (canvasW - DW) / 2, dy = (canvasH - DH) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, canvasW, canvasH);
    // Version string as panel title (matches original Civ2 MGE Game Options dialog)
    this._drawCiv2Panel(ctx, dx, dy, DW, DH, 'Civilization II Multiplayer Gold 5.4.0f Multiplayer 26-March-99 Patch 3');
    const opts = this.gameState._gameOptions ?? {};
    this._gameOptionsRects = [];
    ctx.textAlign = 'left';
    labels.forEach(([key, label], i) => {
      const oy = dy + 46 + i * 24;
      const checked = opts[key] ?? (key === 'soundEffects' || key === 'alwaysWait' || key === 'showEnemyMoves' || key === 'enterAdvances');
      this._drawCiv2Checkbox(ctx, dx + 18, oy - 2, checked);
      ctx.font = FONT.BODY;
      this._panelText(ctx, label, dx + 40, oy + 11);
      this._gameOptionsRects.push({ x: dx + 14, y: oy - 2, w: DW - 28, h: 20, key });
    });
    // OK + Cancel buttons
    const bw = 80, bh = 24;
    const btnY = dy + DH - 38;
    this._drawWin95Button(ctx, dx + DW / 2 - bw - 10, btnY, bw, bh, 'OK');
    this._gameOptionsRects.push({ x: dx + DW / 2 - bw - 10, y: btnY, w: bw, h: bh, key: '_close' });
    this._drawWin95Button(ctx, dx + DW / 2 + 10, btnY, bw, bh, 'Cancel');
    this._gameOptionsRects.push({ x: dx + DW / 2 + 10, y: btnY, w: bw, h: bh, key: '_close' });
    ctx.textAlign = 'left';
  }

  _drawGraphicOptionsDialog(ctx, canvasW, canvasH) {
    if (!this._graphicOptionsDialog) return;
    
    // Matching original Civ2 MGE Graphics Options (screenshot 17.09.15)
    const labels = [
      ['throneRoom',        'Throne Room'],
      ['diplomacyScreen',   'Diplomacy Screen'],
      ['animatedHeralds',   'Animated Heralds (Requires 16 megabytes RAM)'],
      ['civilopediaAdvances', 'Civilopedia for Advances'],
      ['highCouncil',       'High Council'],
      ['wonderMovies',      'Wonder Movies'],
      ['hdSprites',         'HD Sprites (AI-upscaled units & cities)'],
    ];
    const DW = 380, DH = 50 + labels.length * 24 + 50;
    const dx = (canvasW - DW) / 2, dy = (canvasH - DH) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, canvasW, canvasH);
    this._drawCiv2Panel(ctx, dx, dy, DW, DH, 'Select Graphic Options');
    const opts = this.gameState._graphicOptions ?? {};
    this._graphicOptionsRects = [];
    ctx.textAlign = 'left';
    const DEFAULTS_OFF = new Set(['hdSprites']); // these default to unchecked
    labels.forEach(([key, label], i) => {
      const oy = dy + 46 + i * 24;
      const checked = opts[key] ?? !DEFAULTS_OFF.has(key);
      this._drawCiv2Checkbox(ctx, dx + 18, oy - 2, checked);
      ctx.font = FONT.BODY;
      this._panelText(ctx, label, dx + 40, oy + 11);
      this._graphicOptionsRects.push({ x: dx + 14, y: oy - 2, w: DW - 28, h: 20, key });
    });
    const bw = 80, bh = 24;
    const btnY = dy + DH - 38;
    this._drawWin95Button(ctx, dx + DW / 2 - bw - 10, btnY, bw, bh, 'OK');
    this._graphicOptionsRects.push({ x: dx + DW / 2 - bw - 10, y: btnY, w: bw, h: bh, key: '_close' });
    this._drawWin95Button(ctx, dx + DW / 2 + 10, btnY, bw, bh, 'Cancel');
    this._graphicOptionsRects.push({ x: dx + DW / 2 + 10, y: btnY, w: bw, h: bh, key: '_close' });
    ctx.textAlign = 'left';
  }

  _drawCityReportOptionsDialog(ctx, canvasW, canvasH) {
    if (!this._cityReportOptionsDialog) return;
    
    // Matching original Civ2 MGE City Report Options (screenshot 17.09.23)
    const labels = [
      ['warnBuildCity',     'Warn when city growth halted (Aqueduct/Sewer System).'],
      ['showCityImprovements', 'Show city improvements built.'],
      ['showNonCombatUnits',   'Show non-combat units built.'],
      ['showInitialBuildInstructions', 'Show invalid build instructions.'],
      ['announceDiscoveries', 'Announce cities in disorder.'],
      ['announceOrder',       'Announce order restored in city.'],
      ['announceWeLoveKing',  'Announce "We Love The King Day".'],
      ['warnFoodDecrease',    'Warn when food dangerously low.'],
      ['warnPollution',       'Warn when new pollution occurs.'],
      ['warnChangingProduction', 'Warn when changing production will cost shields.'],
      ['zoomToCombat',        '"Zoom-to-City" NOT default action.'],
    ];
    const DW = 420, DH = 50 + labels.length * 22 + 50;
    const dx = (canvasW - DW) / 2, dy = (canvasH - DH) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, canvasW, canvasH);
    this._drawCiv2Panel(ctx, dx, dy, DW, DH, 'Select City Report Options');
    const opts = this.gameState._cityReportOptions ?? {};
    this._cityReportOptionsRects = [];
    ctx.textAlign = 'left';
    labels.forEach(([key, label], i) => {
      const oy = dy + 44 + i * 22;
      const checked = opts[key] ?? true;
      this._drawCiv2Checkbox(ctx, dx + 16, oy - 2, checked);
      ctx.font = FONT.BODY_SMALL;
      this._panelText(ctx, label, dx + 36, oy + 10);
      this._cityReportOptionsRects.push({ x: dx + 12, y: oy - 2, w: DW - 24, h: 18, key });
    });
    const bw = 80, bh = 24;
    const btnY = dy + DH - 38;
    this._drawWin95Button(ctx, dx + DW / 2 - bw - 10, btnY, bw, bh, 'OK');
    this._cityReportOptionsRects.push({ x: dx + DW / 2 - bw - 10, y: btnY, w: bw, h: bh, key: '_close' });
    this._drawWin95Button(ctx, dx + DW / 2 + 10, btnY, bw, bh, 'Cancel');
    this._cityReportOptionsRects.push({ x: dx + DW / 2 + 10, y: btnY, w: bw, h: bh, key: '_close' });
    ctx.textAlign = 'left';
  }

  _drawCasualtyDialog(ctx, canvasW, canvasH) {
    if (!this._casualtyDialog) return;
    
    const gs = this.gameState;
    const casualties = gs._casualties ?? [];
    const DW = 420, DH = 360;
    const dx = (canvasW - DW) / 2, dy = (canvasH - DH) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, canvasW, canvasH);
    this._drawCiv2Panel(ctx, dx, dy, DW, DH, 'Casualty Timeline');
    ctx.textAlign = 'left';
     const hdrY = dy + 40;
     ctx.font = FONT.SMALL_BOLD;
     this._panelText(ctx, 'Turn', dx + 10, hdrY); this._panelText(ctx, 'Unit Killed', dx + 60, hdrY);
     this._panelText(ctx, 'Owner', dx + 220, hdrY); this._panelText(ctx, 'Killed By', dx + 310, hdrY);
      ctx.fillStyle = CLR.WIN95_SHADOW; ctx.fillRect(dx + 6, hdrY + 4, DW - 12, 1);
      const listY = hdrY + 10, rowH = 18;
      const maxRows = Math.min(15, Math.floor((DH - 100) / rowH));
      const recent = casualties.slice(-maxRows).reverse();
      ctx.font = FONT.BODY_SMALL;
      recent.forEach((c, i) => {
        const ry = listY + i * rowH;
        ctx.fillStyle = i % 2 === 0 ? '#b8b8b8' : CLR.WIN95_FACE; ctx.fillRect(dx + 6, ry, DW - 12, rowH);
       ctx.fillStyle = '#000';
       ctx.fillText(`${c.turn}`, dx + 10, ry + 13);
       ctx.fillText(UNITS[c.unitTypeId]?.name ?? `Unit#${c.unitTypeId}`, dx + 60, ry + 13);
       const ownerCiv = gs.civs[c.defenderCivId];
       ctx.fillText((ownerCiv?.data?.plural ?? `Civ#${c.defenderCivId}`).slice(0, 14), dx + 220, ry + 13);
       const killerCiv = gs.civs[c.killerCivId];
       ctx.fillText((killerCiv?.data?.plural ?? `Civ#${c.killerCivId}`).slice(0, 14), dx + 310, ry + 13);
     });
     if (casualties.length === 0) {
       ctx.font = FONT.BODY_ITALIC; ctx.fillStyle = '#666'; ctx.textAlign = 'center';
       ctx.fillText('No casualties recorded yet.', dx + DW / 2, dy + DH / 2); ctx.textAlign = 'left';
     }
    this._casualtyDialogRects = [];
    const bx = dx + DW / 2 - 40, by = dy + DH - 36, bw = 80, bh = 24;
    this._drawWin95Button(ctx, bx, by, bw, bh, 'Close');
    this._casualtyDialogRects.push({ x: bx, y: by, w: bw, h: bh, key: '_close' });
  }

  _drawSpaceshipViewer(ctx, canvasW, canvasH) {
    if (!this._spaceshipViewer) return;
    
    const gs = this.gameState;
    const DW = 400, DH = 320;
    const dx = (canvasW - DW) / 2, dy = (canvasH - DH) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, canvasW, canvasH);
    this._drawCiv2Panel(ctx, dx, dy, DW, DH, 'Spaceship Status');
    ctx.textAlign = 'left';
     const hdrY = dy + 42;
     ctx.font = FONT.SMALL_BOLD;
     this._panelText(ctx, 'Civilization', dx + 10, hdrY); this._panelText(ctx, 'Structural', dx + 150, hdrY);
     this._panelText(ctx, 'Component', dx + 230, hdrY); this._panelText(ctx, 'Module', dx + 310, hdrY);
      ctx.fillStyle = CLR.WIN95_SHADOW; ctx.fillRect(dx + 6, hdrY + 4, DW - 12, 1);
      const rowH = 22;
      let ri = 0;
      for (const civ of gs.civs) {
        if (!civ || !civ.alive) continue;
        const progress = gs.spaceshipProgress(civ.id);
        const ry = hdrY + 10 + ri * rowH;
        if (ry + rowH > dy + DH - 40) break;
        ctx.fillStyle = ri % 2 === 0 ? '#b8b8b8' : CLR.WIN95_FACE; ctx.fillRect(dx + 6, ry, DW - 12, rowH);
        ctx.font = FONT.BODY_SMALL; ctx.fillStyle = '#000';
        ctx.fillText((civ.data?.plural ?? `Civ#${civ.id}`).slice(0, 18), dx + 10, ry + 15);
        ctx.fillStyle = progress.structural >= 8 ? CLR.WIN_COLOR : '#000'; ctx.fillText(`${progress.structural}/8`, dx + 165, ry + 15);
        ctx.fillStyle = progress.component >= 4 ? CLR.WIN_COLOR : '#000'; ctx.fillText(`${progress.component}/4`, dx + 245, ry + 15);
        ctx.fillStyle = progress.module >= 4 ? CLR.WIN_COLOR : '#000'; ctx.fillText(`${progress.module}/4`, dx + 320, ry + 15);
        if (gs.spaceshipReady(civ.id)) { ctx.fillStyle = CLR.WIN_COLOR; ctx.font = FONT.TINY_BOLD; ctx.fillText('READY', dx + 365, ry + 15); }
       ri++;
     }
     if (ri === 0) {
       ctx.font = FONT.BODY_ITALIC; ctx.fillStyle = '#666'; ctx.textAlign = 'center';
       ctx.fillText('No civilizations with spaceship parts.', dx + DW / 2, dy + DH / 2); ctx.textAlign = 'left';
     }
    this._spaceshipViewerRects = [];
    const bx = dx + DW / 2 - 40, by = dy + DH - 36, bw = 80, bh = 24;
    this._drawWin95Button(ctx, bx, by, bw, bh, 'Close');
    this._spaceshipViewerRects.push({ x: bx, y: by, w: bw, h: bh, key: '_close' });
  }

  _editorLog(msg) {
    if (typeof this.gameState?._addLog === 'function') {
      this.gameState._addLog(msg);
      return;
    }
    if (!this.gameState?.log) return;
    this.gameState.log.unshift(msg);
    if (this.gameState.log.length > 8) this.gameState.log.length = 8;
  }

  _clampEditorInt(value, min, max) {
    const n = Number(value);
    const safe = Number.isFinite(n) ? Math.round(n) : min;
    return Math.max(min, Math.min(max, safe));
  }

  _cycleEditorChoice(list, current, delta) {
    if (!list.length) return current;
    const idx = Math.max(0, list.indexOf(current));
    return list[(idx + delta + list.length) % list.length];
  }

  _getEditorCursorTile() {
    if (this._hoveredTile) return this._hoveredTile;
    const au = this.gameState?.activeUnit;
    return au ? { col: au.col, row: au.row } : null;
  }

  _drawEditorInputBox(ctx, x, y, w, h, text, cursor = null, active = false) {
    ctx.fillStyle = CLR.WIN95_DARK_SHADOW;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = CLR.WIN95_LIGHT_EDGE;
    ctx.fillRect(x, y + h, w + 1, 1);
    ctx.fillRect(x + w, y, 1, h + 1);
    ctx.fillStyle = CLR.WIN95_LIGHT;
    ctx.fillRect(x + 1, y + 1, w - 1, h - 1);

    ctx.font = FONT.BODY_SMALL;
    ctx.fillStyle = '#000000';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 1, w - 4, h - 2);
    ctx.clip();
    ctx.fillText(text, x + 3, y + 13);
    if (active && cursor != null && Math.floor(Date.now() / 500) % 2 === 0) {
      const cursorX = x + 3 + ctx.measureText(text.slice(0, cursor)).width;
      ctx.fillRect(cursorX, y + 3, 1, h - 5);
    }
    ctx.restore();
  }

  _drawEditorStepper(ctx, x, y, label, value, rects, key, min, max, step = 1, fieldW = 60) {
    ctx.font = FONT.BODY;
    ctx.textAlign = 'left';
    this._panelText(ctx, label, x, y + 13);
    const bx = x + 118;
    const btnW = 24;
    const btnH = 22;
    this._drawWin95Button(ctx, bx, y, btnW, btnH, '-', FONT_ARIAL);
    this._drawEditorInputBox(ctx, bx + btnW + 4, y + 1, fieldW, btnH - 2, `${value}`);
    this._drawWin95Button(ctx, bx + btnW + fieldW + 8, y, btnW, btnH, '+', FONT_ARIAL);
    rects.push({ kind: 'step', key, delta: -step, min, max, x: bx, y, w: btnW, h: btnH });
    rects.push({ kind: 'step', key, delta: step, min, max, x: bx + btnW + fieldW + 8, y, w: btnW, h: btnH });
  }

  _drawEditorCycle(ctx, x, y, label, value, rects, key, fieldW = 180) {
    ctx.font = FONT.BODY;
    this._panelText(ctx, label, x, y + 13);
    const bx = x + 118;
    const btnW = 24;
    const btnH = 22;
    this._drawWin95Button(ctx, bx, y, btnW, btnH, '<', FONT_ARIAL);
    this._drawEditorInputBox(ctx, bx + btnW + 4, y + 1, fieldW, btnH - 2, value);
    this._drawWin95Button(ctx, bx + btnW + fieldW + 8, y, btnW, btnH, '>', FONT_ARIAL);
    rects.push({ kind: 'cycle', key, delta: -1, x: bx, y, w: btnW, h: btnH });
    rects.push({ kind: 'cycle', key, delta: 1, x: bx + btnW + fieldW + 8, y, w: btnW, h: btnH });
  }

  _closeEditTechsDialog() {
    const d = this._editTechsDialog;
    const gs = this.gameState;
    const civ = gs?.civs?.[0];
    if (d && civ) {
      if (civ.currentResearch != null && civ.currentResearch !== 100 && civ.advances.has(civ.currentResearch)) {
        civ.currentResearch = null;
      }
      const available = gs.availableAdvances?.(0) ?? [];
      if (civ.currentResearch === 100 && available.length > 0) civ.currentResearch = null;
      if (civ.currentResearch == null && available.length === 0) civ.currentResearch = 100;
      if (d.dirtyVisibility) gs._updateVisibility?.();
    }
    this._editTechsDialog = null;
  }

  _openEditTechsDialog() {
    if (!this.gameState?.civs?.[0]) return;
    this._editTechsDialog = { scroll: 0, rects: [], dirtyVisibility: false };
    this._play(SFX.menuOk);
  }

  _handleEditTechsKey(e) {
    if (e.key === 'Escape') {
      this._closeEditTechsDialog();
      return;
    }
    if (e.key === 'Enter') {
      this._closeEditTechsDialog();
    }
  }

  _handleEditTechsClick(px, py) {
    const d = this._editTechsDialog;
    const civ = this.gameState?.civs?.[0];
    if (!d || !civ) return;
    const hit = d.rects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
    if (!hit) return;
    if (hit.kind === 'close') {
      this._closeEditTechsDialog();
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind !== 'tech') return;
    if (civ.advances.has(hit.advId)) civ.advances.delete(hit.advId);
    else civ.advances.add(hit.advId);
    d.dirtyVisibility = true;
    this._play(SFX.menuOk);
  }

  _drawEditTechsDialog(ctx, canvasW, canvasH) {
    const d = this._editTechsDialog;
    const civ = this.gameState?.civs?.[0];
    if (!d || !civ) return;
    const PW = Math.min(560, canvasW - 40);
    const PH = Math.min(460, canvasH - 40);
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);
    const rowH = 24;
    const listX = px + 10;
    const listY = py + 40;
    const listH = PH - 86;
    const maxScroll = Math.max(0, ADVANCES.length - Math.max(1, Math.floor(listH / rowH)));
    d.scroll = Math.max(0, Math.min(d.scroll ?? 0, maxScroll));
    d.rects = [];

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Edit Technologies');

    ctx.font = FONT.BODY_SMALL;
    this._panelText(ctx, `Known advances: ${civ.advances.size}/${ADVANCES.length}`, listX, py + 30);

    const showScrollbar = maxScroll > 0;
    const listW = PW - 24 - (showScrollbar ? 18 : 0);
    const rowsVis = Math.max(1, Math.floor(listH / rowH));

    ctx.save();
    ctx.beginPath();
    ctx.rect(listX, listY, listW, listH);
    ctx.clip();

    for (let i = 0; i < rowsVis && i + d.scroll < ADVANCES.length; i++) {
      const adv = ADVANCES[i + d.scroll];
      const ry = listY + i * rowH;
      const known = civ.advances.has(adv.id);
      ctx.fillStyle = known ? '#5a8acc' : (i % 2 === 0 ? '#b8b8b8' : CLR.WIN95_FACE);
      ctx.fillRect(listX + 1, ry, listW - 2, rowH - 1);
      this._drawCiv2Checkbox(ctx, listX + 6, ry + 2, known);
      ctx.font = known ? FONT.SMALL_BOLD : FONT.BODY_SMALL;
      ctx.fillStyle = known ? CLR.WIN95_LIGHT : '#000000';
      ctx.fillText(adv.name, listX + 34, ry + 15);
      ctx.textAlign = 'right';
      ctx.fillStyle = known ? '#f7f7f7' : CLR.WIN95_DARK_SHADOW;
      ctx.fillText(`${adv.id}`, listX + listW - 10, ry + 15);
      ctx.textAlign = 'left';
      d.rects.push({ kind: 'tech', advId: adv.id, x: listX + 1, y: ry, w: listW - 2, h: rowH - 1 });
    }

    ctx.restore();

    if (showScrollbar) this._drawScrollbar(ctx, listX + listW + 2, listY, listH, d.scroll, maxScroll);

    const bx = px + Math.round((PW - 90) / 2);
    const by = py + PH - 34;
    this._drawWin95Button(ctx, bx, by, 90, 24, 'Close');
    d.rects.push({ kind: 'close', x: bx, y: by, w: 90, h: 24 });
  }

  _openEditUnitDialog() {
    const unit = this.gameState?.activeUnit;
    if (!unit || unit.civId !== 0) {
      this._editorLog('Select a unit first.');
      this._play(SFX.neg);
      return;
    }
    this._editUnitDialog = {
      unit,
      typeId: unit.typeId,
      hpValue: this._clampEditorInt((unit.hp ?? 1) * 10, 10, 100),
      movesLeft: this._clampEditorInt(unit.movesLeft ?? 0, 0, 99),
      veteran: !!unit.veteran,
      homeCityId: unit.homeCity ?? null,
      typeScroll: Math.max(0, unit.typeId - 5),
      rects: [],
    };
    this._play(SFX.menuOk);
  }

  _handleEditUnitKey(e) {
    if (e.key === 'Escape') {
      this._editUnitDialog = null;
      return;
    }
    if (e.key === 'Enter') this._applyEditUnitDialog();
  }

  _applyEditUnitDialog() {
    const d = this._editUnitDialog;
    if (!d?.unit) return;
    const unit = d.unit;
    const data = UNITS[d.typeId] ?? UNITS[unit.typeId];
    const hp = this._clampEditorInt(Math.round(d.hpValue / 10), 1, 100);
    unit.typeId = d.typeId;
    unit.hp = hp;
    unit.maxHp = Math.max(hp, data?.hp ?? 1);
    unit.movesLeft = this._clampEditorInt(d.movesLeft, 0, 99);
    unit.maxMoves = Math.max(data?.move ?? 0, unit.movesLeft);
    unit.veteran = !!d.veteran;
    unit.homeCity = d.homeCityId ?? null;
    unit.fuel = data?.domain === 1 && (data?.range ?? 0) > 0 ? data.range : 0;
    if (this.gameState.activeUnit === unit) {
      this._moveRangeTiles = unit.movesLeft > 0 ? this._calcReachableTiles(unit) : null;
      if (unit.movesLeft <= 0) this._unitMoveMode = false;
    }
    if (unit.civId === 0) this.gameState._updateVisibility?.();
    this._editUnitDialog = null;
    this._play(SFX.menuOk);
  }

  _handleEditUnitClick(px, py) {
    const d = this._editUnitDialog;
    if (!d) return;
    const hit = d.rects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
    if (!hit) return;
    if (hit.kind === 'apply') {
      this._applyEditUnitDialog();
      return;
    }
    if (hit.kind === 'cancel') {
      this._editUnitDialog = null;
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'type') {
      d.typeId = hit.typeId;
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'step') {
      d[hit.key] = this._clampEditorInt((d[hit.key] ?? 0) + hit.delta, hit.min, hit.max);
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'toggle') {
      d.veteran = !d.veteran;
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'cycle') {
      const choices = [null, ...this.gameState.cities.filter(c => c.civId === 0).map(c => c.id)];
      d.homeCityId = this._cycleEditorChoice(choices, d.homeCityId, hit.delta);
      this._play(SFX.menuOk);
    }
  }

  _drawEditUnitDialog(ctx, canvasW, canvasH) {
    const d = this._editUnitDialog;
    if (!d?.unit) return;
    const PW = Math.min(620, canvasW - 40);
    const PH = Math.min(430, canvasH - 40);
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);
    const cities = this.gameState.cities.filter(c => c.civId === 0).sort((a, b) => a.name.localeCompare(b.name));
    const selectedType = UNITS[d.typeId];
    const listX = px + 10;
    const listY = py + 40;
    const listW = 220;
    const listH = PH - 86;
    const rowH = 22;
    const maxScroll = Math.max(0, UNITS.length - Math.max(1, Math.floor(listH / rowH)));
    d.typeScroll = Math.max(0, Math.min(d.typeScroll ?? 0, maxScroll));
    d.rects = [];

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Edit Unit');

    ctx.save();
    ctx.beginPath();
    ctx.rect(listX, listY, listW, listH);
    ctx.clip();
    const rowsVis = Math.max(1, Math.floor(listH / rowH));
    for (let i = 0; i < rowsVis && i + d.typeScroll < UNITS.length; i++) {
      const unitData = UNITS[i + d.typeScroll];
      const ry = listY + i * rowH;
      const selected = unitData.id === d.typeId;
      ctx.fillStyle = selected ? '#5a8acc' : (i % 2 === 0 ? '#b8b8b8' : CLR.WIN95_FACE);
      ctx.fillRect(listX + 1, ry, listW - 2, rowH - 1);
      ctx.font = selected ? FONT.SMALL_BOLD : FONT.BODY_SMALL;
      ctx.fillStyle = selected ? CLR.WIN95_LIGHT : '#000000';
      ctx.fillText(unitData.name, listX + 8, ry + 14);
      d.rects.push({ kind: 'type', typeId: unitData.id, x: listX + 1, y: ry, w: listW - 2, h: rowH - 1 });
    }
    ctx.restore();
    if (maxScroll > 0) this._drawScrollbar(ctx, listX + listW + 2, listY, listH, d.typeScroll, maxScroll);

    const rx = listX + listW + 28;
    ctx.font = FONT.SMALL_BOLD;
    this._panelText(ctx, selectedType?.name ?? 'Unknown Unit', rx, py + 30);
    ctx.font = FONT.BODY_SMALL;
    this._panelText(ctx, `A ${selectedType?.attack ?? 0}  D ${selectedType?.defense ?? 0}  M ${selectedType?.move ?? 0}  HP ${selectedType?.hp ?? 0}`, rx, py + 48);
    this._panelText(ctx, `Role ${selectedType?.role ?? 0}  Domain ${selectedType?.domain ?? 0}`, rx, py + 64);

    this._drawEditorStepper(ctx, rx, py + 90, 'HP', d.hpValue, d.rects, 'hpValue', 10, 100, 10);
    this._drawEditorStepper(ctx, rx, py + 122, 'Moves Left', d.movesLeft, d.rects, 'movesLeft', 0, 99, 1);

    const cbY = py + 160;
    this._drawCiv2Checkbox(ctx, rx, cbY, d.veteran);
    ctx.font = FONT.BODY;
    this._panelText(ctx, 'Veteran', rx + 28, cbY + 13);
    d.rects.push({ kind: 'toggle', x: rx, y: cbY, w: 120, h: 20 });

    const homeName = cities.find(c => c.id === d.homeCityId)?.name ?? 'None';
    this._drawEditorCycle(ctx, rx, py + 194, 'Home City', homeName, d.rects, 'homeCityId', 170);

    const btnY = py + PH - 34;
    const applyX = px + PW / 2 - 92;
    const cancelX = px + PW / 2 + 12;
    this._drawWin95Button(ctx, applyX, btnY, 80, 24, 'Apply');
    this._drawWin95Button(ctx, cancelX, btnY, 80, 24, 'Cancel');
    d.rects.push({ kind: 'apply', x: applyX, y: btnY, w: 80, h: 24 });
    d.rects.push({ kind: 'cancel', x: cancelX, y: btnY, w: 80, h: 24 });
  }

  _openEditCityDialog() {
    const tile = this._getEditorCursorTile();
    const city = tile ? this.gameState.cityAt(tile.col, tile.row) : null;
    if (!city) {
      this._editorLog('Move the cursor onto a city first.');
      this._play(SFX.neg);
      return;
    }
    this._editCityDialog = {
      city,
      name: city.name,
      cursor: city.name.length,
      size: this._clampEditorInt(city.size, 1, 127),
      food: this._clampEditorInt(city.food ?? 0, 0, 999),
      shields: this._clampEditorInt(city.shields ?? 0, 0, 999),
      ownerId: city.civId,
      improvements: new Set(city.improvements),
      scroll: 0,
      rects: [],
    };
    this._play(SFX.menuOk);
  }

  _handleEditCityKey(e) {
    const d = this._editCityDialog;
    if (!d) return;
    if (e.key === 'Escape') {
      this._editCityDialog = null;
      return;
    }
    if (e.key === 'Enter') {
      this._applyEditCityDialog();
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
      if (d.cursor < d.name.length) d.name = d.name.slice(0, d.cursor) + d.name.slice(d.cursor + 1);
      return;
    }
    if (e.key === 'ArrowLeft') { d.cursor = Math.max(0, d.cursor - 1); return; }
    if (e.key === 'ArrowRight') { d.cursor = Math.min(d.name.length, d.cursor + 1); return; }
    if (e.key === 'Home') { d.cursor = 0; return; }
    if (e.key === 'End') { d.cursor = d.name.length; return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && d.name.length < 30) {
      d.name = d.name.slice(0, d.cursor) + e.key + d.name.slice(d.cursor);
      d.cursor++;
    }
  }

  _applyEditCityDialog() {
    const d = this._editCityDialog;
    const gs = this.gameState;
    if (!d?.city) return;
    const city = d.city;
    const oldOwner = city.civId;
    const nextImprovements = new Set(d.improvements);
    for (const impId of nextImprovements) {
      if (!IMPROVEMENTS[impId]?.isWonder) continue;
      for (const other of gs.cities) {
        if (other !== city) other.improvements.delete(impId);
      }
    }
    city.name = d.name.trim() || city.name;
    city.size = this._clampEditorInt(d.size, 1, 127);
    city.food = this._clampEditorInt(d.food, 0, 999);
    city.shields = this._clampEditorInt(d.shields, 0, 999);
    city.civId = d.ownerId;
    city.improvements = nextImprovements;
    if (oldOwner !== city.civId) city.manualWorked = null;
    if (city.production?.type === 'improvement' && city.improvements.has(city.production.id)) city.production = null;
    if (this._cityScreen === city && city.civId !== 0) this._cityScreen = null;
    gs._updateVisibility?.();
    this._editCityDialog = null;
    this._play(SFX.menuOk);
  }

  _handleEditCityClick(px, py) {
    const d = this._editCityDialog;
    if (!d) return;
    const hit = d.rects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
    if (!hit) return;
    if (hit.kind === 'apply') {
      this._applyEditCityDialog();
      return;
    }
    if (hit.kind === 'cancel') {
      this._editCityDialog = null;
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'name') return;
    if (hit.kind === 'step') {
      d[hit.key] = this._clampEditorInt((d[hit.key] ?? 0) + hit.delta, hit.min, hit.max);
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'cycle') {
      const civIds = this.gameState.civs.map(c => c?.id).filter(id => id != null);
      d.ownerId = this._cycleEditorChoice(civIds, d.ownerId, hit.delta);
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'improvement') {
      if (d.improvements.has(hit.impId)) d.improvements.delete(hit.impId);
      else d.improvements.add(hit.impId);
      this._play(SFX.menuOk);
    }
  }

  _drawEditCityDialog(ctx, canvasW, canvasH) {
    const d = this._editCityDialog;
    if (!d?.city) return;
    const PW = Math.min(720, canvasW - 40);
    const PH = Math.min(500, canvasH - 40);
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);
    const leftX = px + 12;
    const rightX = px + 320;
    const improvements = IMPROVEMENTS.filter(i => i.id > 0);
    const rowH = 22;
    const listY = py + 40;
    const listH = PH - 86;
    const maxScroll = Math.max(0, improvements.length - Math.max(1, Math.floor(listH / rowH)));
    d.scroll = Math.max(0, Math.min(d.scroll ?? 0, maxScroll));
    d.rects = [];

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Edit City');

    ctx.font = FONT.BODY;
    this._panelText(ctx, 'Name', leftX, py + 56);
    this._drawEditorInputBox(ctx, leftX + 74, py + 44, 190, 18, d.name, d.cursor, true);
    d.rects.push({ kind: 'name', x: leftX + 74, y: py + 44, w: 190, h: 18 });

    this._drawEditorStepper(ctx, leftX, py + 76, 'Size', d.size, d.rects, 'size', 1, 127, 1);
    this._drawEditorStepper(ctx, leftX, py + 108, 'Food', d.food, d.rects, 'food', 0, 999, 1);
    this._drawEditorStepper(ctx, leftX, py + 140, 'Shields', d.shields, d.rects, 'shields', 0, 999, 1);
    const ownerName = CIVS[d.ownerId]?.plural ?? `Civ ${d.ownerId}`;
    this._drawEditorCycle(ctx, leftX, py + 176, 'Owner', ownerName, d.rects, 'ownerId', 170);

    ctx.font = FONT.SMALL_BOLD;
    this._panelText(ctx, 'Improvements and Wonders', rightX, py + 30);

    const listW = PW - (rightX - px) - 24 - (maxScroll > 0 ? 18 : 0);
    const rowsVis = Math.max(1, Math.floor(listH / rowH));
    ctx.save();
    ctx.beginPath();
    ctx.rect(rightX, listY, listW, listH);
    ctx.clip();
    for (let i = 0; i < rowsVis && i + d.scroll < improvements.length; i++) {
      const imp = improvements[i + d.scroll];
      const ry = listY + i * rowH;
      const checked = d.improvements.has(imp.id);
      ctx.fillStyle = checked ? '#5a8acc' : (i % 2 === 0 ? '#b8b8b8' : CLR.WIN95_FACE);
      ctx.fillRect(rightX + 1, ry, listW - 2, rowH - 1);
      this._drawCiv2Checkbox(ctx, rightX + 6, ry + 1, checked);
      ctx.font = checked ? FONT.SMALL_BOLD : FONT.BODY_SMALL;
      ctx.fillStyle = checked ? CLR.WIN95_LIGHT : (imp.isWonder ? '#6a3f00' : '#000000');
      ctx.fillText(imp.name, rightX + 34, ry + 14);
      d.rects.push({ kind: 'improvement', impId: imp.id, x: rightX + 1, y: ry, w: listW - 2, h: rowH - 1 });
    }
    ctx.restore();
    if (maxScroll > 0) this._drawScrollbar(ctx, rightX + listW + 2, listY, listH, d.scroll, maxScroll);

    const btnY = py + PH - 34;
    const applyX = px + PW / 2 - 92;
    const cancelX = px + PW / 2 + 12;
    this._drawWin95Button(ctx, applyX, btnY, 80, 24, 'Apply');
    this._drawWin95Button(ctx, cancelX, btnY, 80, 24, 'Cancel');
    d.rects.push({ kind: 'apply', x: applyX, y: btnY, w: 80, h: 24 });
    d.rects.push({ kind: 'cancel', x: cancelX, y: btnY, w: 80, h: 24 });
  }

  _kingResearchOptions(currentResearch = null) {
    const civ = this.gameState?.civs?.[0];
    if (!civ) return [{ id: null, name: 'None' }];
    const opts = [{ id: null, name: 'None' }, ...this.gameState.availableAdvances(0).map(a => ({ id: a.id, name: a.name }))];
    if (currentResearch === 100 || (!opts.some(o => o.id === 100) && this.gameState.availableAdvances(0).length === 0)) {
      opts.push({ id: 100, name: 'Future Technology' });
    }
    if (currentResearch != null && !opts.some(o => o.id === currentResearch)) {
      opts.push({ id: currentResearch, name: ADVANCES[currentResearch]?.name ?? 'Future Technology' });
    }
    return opts;
  }

  _normalizeEditorRates(d) {
    const keys = ['taxRate', 'sciRate', 'luxRate'];
    const max = this._govtMaxRate(d.government ?? 1);
    for (const key of keys) d[key] = this._clampEditorInt(Math.round((d[key] ?? 0) / 10) * 10, 0, max);
    let total = d.taxRate + d.sciRate + d.luxRate;
    while (total > 100) {
      const key = keys.slice().sort((a, b) => d[b] - d[a]).find(k => d[k] > 0);
      if (!key) break;
      d[key] -= 10;
      total -= 10;
    }
    while (total < 100) {
      const key = keys.slice().sort((a, b) => d[a] - d[b]).find(k => d[k] < max);
      if (!key) break;
      d[key] += 10;
      total += 10;
    }
  }

  _setKingRate(d, prop, newVal) {
    const temp = {
      government: d.government,
      taxRate: d.taxRate,
      sciRate: d.sciRate,
      luxRate: d.luxRate,
    };
    this._applyRateChange(temp, { taxLocked: false, sciLocked: false, luxLocked: false }, prop, this._clampEditorInt(newVal, 0, 100));
    d.taxRate = temp.taxRate;
    d.sciRate = temp.sciRate;
    d.luxRate = temp.luxRate;
  }

  _drawKingRateControl(ctx, x, y, label, prop, value, rects) {
    const trackX = x + 118;
    const trackY = y + 4;
    const trackW = 170;
    const trackH = 14;
    ctx.font = FONT.BODY;
    this._panelText(ctx, `${label} ${value}%`, x, y + 13);
    this._drawWin95Button(ctx, trackX - 28, y, 24, 22, '-', FONT_ARIAL);
    this._drawWin95Button(ctx, trackX + trackW + 4, y, 24, 22, '+', FONT_ARIAL);
    rects.push({ kind: 'kingRateStep', prop, delta: -10, x: trackX - 28, y, w: 24, h: 22 });
    rects.push({ kind: 'kingRateStep', prop, delta: 10, x: trackX + trackW + 4, y, w: 24, h: 22 });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(trackX, trackY, trackW, trackH);
    ctx.strokeStyle = '#404040';
    ctx.strokeRect(trackX + 0.5, trackY + 0.5, trackW, trackH);
    const thumbX = trackX + Math.round((trackW - 10) * (value / 100));
    ctx.fillStyle = '#5a8acc';
    ctx.fillRect(trackX + 1, trackY + 1, Math.max(0, thumbX - trackX + 8), trackH - 2);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(thumbX, trackY - 2, 10, trackH + 4);
    ctx.strokeStyle = '#808080';
    ctx.strokeRect(thumbX + 0.5, trackY - 1.5, 10, trackH + 4);
    rects.push({ kind: 'kingRateTrack', prop, x: trackX, y: trackY - 2, w: trackW, h: trackH + 4 });
  }

  _openEditKingDialog() {
    const civ = this.gameState?.civs?.[0];
    if (!civ) return;
    this._editKingDialog = {
      gold: this._clampEditorInt(civ.gold ?? 0, 0, 99999),
      government: civ.government ?? 1,
      taxRate: civ.taxRate ?? 50,
      sciRate: civ.sciRate ?? 50,
      luxRate: civ.luxRate ?? 0,
      currentResearch: civ.currentResearch,
      scroll: 0,
      rects: [],
    };
    this._normalizeEditorRates(this._editKingDialog);
    this._play(SFX.menuOk);
  }

  _handleEditKingKey(e) {
    if (e.key === 'Escape') {
      this._editKingDialog = null;
      return;
    }
    if (e.key === 'Enter') this._applyEditKingDialog();
  }

  _applyEditKingDialog() {
    const d = this._editKingDialog;
    const civ = this.gameState?.civs?.[0];
    if (!d || !civ) return;
    this._normalizeEditorRates(d);
    civ.gold = this._clampEditorInt(d.gold, 0, 99999);
    civ.government = d.government;
    civ.taxRate = d.taxRate;
    civ.sciRate = d.sciRate;
    civ.luxRate = d.luxRate;
    civ.currentResearch = d.currentResearch;
    if (civ.currentResearch != null && civ.currentResearch !== 100 && civ.advances.has(civ.currentResearch)) civ.currentResearch = null;
    this._editKingDialog = null;
    this._play(SFX.menuOk);
  }

  _handleEditKingClick(px, py) {
    const d = this._editKingDialog;
    if (!d) return;
    const hit = d.rects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
    if (!hit) return;
    if (hit.kind === 'apply') {
      this._applyEditKingDialog();
      return;
    }
    if (hit.kind === 'cancel') {
      this._editKingDialog = null;
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'step') {
      d[hit.key] = this._clampEditorInt((d[hit.key] ?? 0) + hit.delta, hit.min, hit.max);
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'cycle') {
      d.government = this._cycleEditorChoice(GOVERNMENTS.map(g => g.id), d.government, hit.delta);
      this._normalizeEditorRates(d);
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'kingRateStep') {
      this._setKingRate(d, hit.prop, (d[hit.prop] ?? 0) + hit.delta);
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'kingRateTrack') {
      const rel = Math.max(0, Math.min(hit.w, px - hit.x));
      const next = Math.round((rel / hit.w) * 10) * 10;
      this._setKingRate(d, hit.prop, next);
      this._play(SFX.menuOk);
      return;
    }
    if (hit.kind === 'research') {
      d.currentResearch = hit.advId;
      this._play(SFX.menuOk);
    }
  }

  _drawEditKingDialog(ctx, canvasW, canvasH) {
    const d = this._editKingDialog;
    if (!d) return;
    const PW = Math.min(640, canvasW - 40);
    const PH = Math.min(440, canvasH - 40);
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);
    const leftX = px + 12;
    const rightX = px + 346;
    const options = this._kingResearchOptions(d.currentResearch);
    const rowH = 22;
    const listY = py + 52;
    const listH = PH - 98;
    const maxScroll = Math.max(0, options.length - Math.max(1, Math.floor(listH / rowH)));
    d.scroll = Math.max(0, Math.min(d.scroll ?? 0, maxScroll));
    d.rects = [];

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    this._drawCiv2Panel(ctx, px, py, PW, PH, 'Edit King');

    this._drawEditorStepper(ctx, leftX, py + 44, 'Gold', d.gold, d.rects, 'gold', 0, 99999, 100, 84);
    this._drawEditorCycle(ctx, leftX, py + 78, 'Government', GOVERNMENTS[d.government]?.name ?? 'Despotism', d.rects, 'government', 150);
    this._drawKingRateControl(ctx, leftX, py + 118, 'Taxes', 'taxRate', d.taxRate, d.rects);
    this._drawKingRateControl(ctx, leftX, py + 152, 'Science', 'sciRate', d.sciRate, d.rects);
    this._drawKingRateControl(ctx, leftX, py + 186, 'Luxuries', 'luxRate', d.luxRate, d.rects);
    ctx.font = FONT.BODY_SMALL;
    this._panelText(ctx, `Rate total ${d.taxRate + d.sciRate + d.luxRate}%`, leftX, py + 232);

    ctx.font = FONT.SMALL_BOLD;
    this._panelText(ctx, 'Current Research', rightX, py + 34);
    const listW = PW - (rightX - px) - 24 - (maxScroll > 0 ? 18 : 0);
    const rowsVis = Math.max(1, Math.floor(listH / rowH));
    ctx.save();
    ctx.beginPath();
    ctx.rect(rightX, listY, listW, listH);
    ctx.clip();
    for (let i = 0; i < rowsVis && i + d.scroll < options.length; i++) {
      const opt = options[i + d.scroll];
      const ry = listY + i * rowH;
      const selected = opt.id === d.currentResearch;
      ctx.fillStyle = selected ? '#5a8acc' : (i % 2 === 0 ? '#b8b8b8' : CLR.WIN95_FACE);
      ctx.fillRect(rightX + 1, ry, listW - 2, rowH - 1);
      ctx.font = selected ? FONT.SMALL_BOLD : FONT.BODY_SMALL;
      ctx.fillStyle = selected ? CLR.WIN95_LIGHT : '#000000';
      ctx.fillText(opt.name, rightX + 8, ry + 14);
      d.rects.push({ kind: 'research', advId: opt.id, x: rightX + 1, y: ry, w: listW - 2, h: rowH - 1 });
    }
    ctx.restore();
    if (maxScroll > 0) this._drawScrollbar(ctx, rightX + listW + 2, listY, listH, d.scroll, maxScroll);

    const btnY = py + PH - 34;
    const applyX = px + PW / 2 - 92;
    const cancelX = px + PW / 2 + 12;
    this._drawWin95Button(ctx, applyX, btnY, 80, 24, 'Apply');
    this._drawWin95Button(ctx, cancelX, btnY, 80, 24, 'Cancel');
    d.rects.push({ kind: 'apply', x: applyX, y: btnY, w: 80, h: 24 });
    d.rects.push({ kind: 'cancel', x: cancelX, y: btnY, w: 80, h: 24 });
  }

  _showMusicPicker() {
    const eras = ['ancient', 'renaissance', 'modern'];
    const current = this._currentMusicEra ?? 'menu';
    const idx = eras.indexOf(current);
    const nextEra = eras[(idx + 1) % eras.length];
    this._currentMusicEra = nextEra;
    this.audio?.playCDMusic(nextEra);
    const trackName = this.audio?.currentTrackName ?? nextEra;
    this.gameState?.log.unshift(`Now playing: ${trackName}`);
  }
}

// Apply mixins — install methods extracted from this file onto MapRenderer.prototype
applyTerrainMixin(MapRenderer);
applySidebarMixin(MapRenderer);
applyCityScreenMixin(MapRenderer);
applyWizardMixin(MapRenderer);
applyDialogsMixin(MapRenderer);
applyAdvisorsMixin(MapRenderer);
applyInfoScreensMixin(MapRenderer);
applyBugReportMixin(MapRenderer);
