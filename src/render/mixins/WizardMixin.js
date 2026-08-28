/**
 * WizardMixin — Extracted from MapRenderer.js.
 * All methods installed on MapRenderer.prototype.
 */
import { CIVS } from '../../data/civs.js';
import { ADVANCES } from '../../data/advances.js';
import { CLR, TITLE_H, MENU_H, TOP_H, FONT, FONT_ARIAL, FONT_TIMES } from '../renderConstants.js';
import { GameState } from '../../engine/GameState.js';
import { assetUrl } from '../../utils/assets.js';

/** @param {typeof import('../MapRenderer.js').default} MapRenderer */
export function applyWizardMixin(MapRenderer) {
  // ─── Title screen ──────────────────────────────────────────────────────────

  MapRenderer.prototype._drawTitleScreen = function(ctx, canvasW, canvasH) {
    // axx0 Civ2dialog derives this from GAME.TXT @MAINMENU: 8 rows at 32px,
    // 38px header, 46px footer, and a title-expanded 338px outer width.
    const PW = 338, PH = 338;
    this._ensureWallpapers();
    // MainMenu.cs uses (-0.08,-0.07): 8% from right, 7% from bottom.
    const px = Math.max(0, Math.round(canvasW * 0.92 - PW));
    const py = Math.max(TOP_H, Math.round(canvasH * 0.93 - PH));
    this._titleDialogRect = { x: px, y: py, w: PW, h: PH };

    this._titleRects = [];

    // Draw wizard background: tan + seal + Sinai photo (matches original Civ2 MGE title)
    // Title screen uses gray frame; wizard steps use orange/gold frame
    const titleBg = MapRenderer._STEP_BACKGROUNDS.title;
    this._drawWizardBackground(ctx, canvasW, canvasH, titleBg.img, titleBg.xPos, '#808080');

    // Outer area — marble wallpaper tile (panel background)
    if (this._outerWallpaper) {
      this._tilePattern(ctx, this._outerWallpaper, px, py, PW, PH);
    } else {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(px, py, PW, PH);
    }

    // 5-layer outer bevel border
    this._drawBevel5(ctx, px, py, PW, PH);

    // GAME.TXT dialog layout: inner wallpaper from y=38 to the 46px footer.
    const INS = 11;
    const ix = px + INS, iy = py + 38, iw = PW - INS * 2, ih = PH - 38 - 42;

    // Inner sunken border (2 layers)
    ctx.fillStyle = '#434343'; ctx.fillRect(ix - 2, iy - 2, iw + 4, 1);          ctx.fillRect(ix - 2, iy - 2, 1, ih + 4);
    ctx.fillStyle = '#DFDFDF'; ctx.fillRect(ix - 2, iy + ih + 1, iw + 4, 1);    ctx.fillRect(ix + iw + 1, iy - 2, 1, ih + 4);
    ctx.fillStyle = '#434343'; ctx.fillRect(ix - 1, iy - 1, iw + 2, 1);          ctx.fillRect(ix - 1, iy - 1, 1, ih + 2);
    ctx.fillStyle = '#DFDFDF'; ctx.fillRect(ix - 1, iy + ih, iw + 2, 1);        ctx.fillRect(ix + iw, iy - 1, 1, ih + 2);

    // Inner fill — fine marble wallpaper
    if (this._innerWallpaper) {
      this._tilePattern(ctx, this._innerWallpaper, ix, iy, iw, ih);
    } else {
      ctx.fillStyle = '#bfbfbf';
      ctx.fillRect(ix, iy, iw, ih);
    }

    // Title text — serif with shadow on outer wallpaper area
    ctx.font = FONT.TITLE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText('Civilization II Multiplayer Gold', px + PW / 2 + 1, py + 13 + 1);
    ctx.fillStyle = '#878787';
    ctx.fillText('Civilization II Multiplayer Gold', px + PW / 2, py + 13);

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    const options = [
      'Start a New Game',
      'Start on Premade World',
      'Customize World',
      'Begin Scenario',
      'Load a Game',
      'Multiplayer Game',
      'View Hall of Fame',
      'View Credits',
    ];
    this._titleSelection = Math.max(0, Math.min(options.length - 1, this._titleSelection ?? 0));
    ctx.font = `18px ${FONT_TIMES}`;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < options.length; i++) {
      const rowY = py + 39 + i * 32;
      const disabled = i === 5; // network multiplayer is not available in the browser build
      this._drawCiv2RadioBtn(ctx, px + 18, rowY + 7, this._titleSelection === i);
      ctx.fillStyle = disabled ? '#777777' : '#333333';
      ctx.fillText(options[i], px + 47, rowY + 16);
      if (this._titleSelection === i) {
        ctx.strokeStyle = '#404040';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 44.5, rowY + 2.5, PW - 52, 27);
      }
      this._titleRects.push({ id: 'option', index: i, disabled, x: px + 12, y: rowY, w: PW - 24, h: 32 });
    }
    ctx.textBaseline = 'alphabetic';

    // Original dialog buttons span the full footer (Civ2dialog.cs).
    const buttonY = py + PH - 40;
    const buttonW = Math.floor((PW - 21) / 2);
    this._drawWin95Button(ctx, px + 9, buttonY, buttonW, 36, 'OK');
    this._drawWin95Button(ctx, px + 12 + buttonW, buttonY, buttonW, 36, 'Cancel');
    this._titleRects.push({ id: 'ok', x: px + 9, y: buttonY, w: buttonW, h: 36 });
    this._titleRects.push({ id: 'cancel', x: px + 12 + buttonW, y: buttonY, w: buttonW, h: 36 });
  };

  MapRenderer.prototype._handleTitleScreenClick = function(px, py, canvasW, canvasH) {
    const hit = this._titleRects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
    if (!hit) return;
    if (hit.id === 'option' && !hit.disabled) this._titleSelection = hit.index;
    else if (hit.id === 'ok') this._activateTitleSelection();
    // Cancel intentionally remains a harmless no-op: a web page cannot quit
    // its containing browser the way the original executable exits Windows.
  };

  MapRenderer.prototype._activateTitleSelection = function() {
    switch (this._titleSelection ?? 0) {
      case 0:
        this._titleScreen = false;
        this._openNewGameWizard(true);
        break;
      case 1:
        this._titleScreen = false;
        this._triggerMapImport();
        break;
      case 2:
        this._titleScreen = false;
        this._openNewGameWizard(true);
        this._wizard.customizeStep = 0;
        break;
      case 3:
        this._titleScreen = false;
        this._triggerScenarioImport(true);
        break;
      case 4: {
        this._titleScreen = false;
        if (localStorage.getItem('civ2_save')) this._loadGame();
        else this._triggerSavImport(true);
        break;
      }
      case 6:
        this._hallOfFame = true;
        break;
      case 7:
        this._creditsScreen = true;
        this._creditsScroll = 0;
        this._loadCreditsText();
        break;
    }
  };

  MapRenderer.prototype._handleTitleScreenKey = function(e) {
    if (this._creditsScreen) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this._creditsScreen = false;
      return;
    }
    if (this._hallOfFame) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this._hallOfFame = false;
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      let next = this._titleSelection ?? 0;
      do next = (next + dir + 8) % 8; while (next === 5);
      this._titleSelection = next;
      return;
    }
    if (e.key === 'Enter') this._activateTitleSelection();
  };

  MapRenderer.prototype._loadCreditsText = async function() {
    if (this._creditsLines) return;
    try {
      const response = await fetch(assetUrl('data/mpcredits.txt'));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this._creditsLines = (await response.text()).split(/\r?\n/)
        .filter(line => line.trim() && !line.startsWith('@'))
        .map(line => ({ text: line.replace(/^\^/, ''), heading: line.startsWith('^') }));
    } catch (error) {
      console.warn('Unable to load MGE credits:', error);
      this._creditsLines = [
        { text: 'Civilization II', heading: true },
        { text: 'Multiplayer Gold Edition', heading: true },
      ];
    }
  };

  MapRenderer.prototype._drawCreditsScreen = function(ctx, canvasW, canvasH) {
    const PW = Math.min(614, canvasW - 30);
    const PH = Math.min(414, canvasH - TOP_H - 24);
    const px = Math.round((canvasW - PW) / 2);
    const py = Math.round((canvasH - PH) / 2);
    this._ensureWallpapers();
    if (this._outerWallpaper) this._tilePattern(ctx, this._outerWallpaper, px, py, PW, PH);
    else { ctx.fillStyle = '#999'; ctx.fillRect(px, py, PW, PH); }
    this._drawBevel5(ctx, px, py, PW, PH);

    const ix = px + 11, iy = py + 11, iw = PW - 22, ih = PH - 54;
    const grad = ctx.createLinearGradient(ix, iy, ix, iy + ih);
    grad.addColorStop(0, '#625d4d');
    grad.addColorStop(1, '#1e211a');
    ctx.fillStyle = grad;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = '#434343';
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ix + 2, iy + 2, iw - 4, ih - 4);
    ctx.clip();
    const lines = this._creditsLines ?? [{ text: 'Civilization II Multiplayer Gold', heading: true }];
    const totalH = Math.max(1, lines.length * 24 + ih);
    let y = iy + ih - (this._creditsScroll % totalH);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const line of lines) {
      ctx.font = line.heading ? `bold 21px ${FONT_TIMES}` : `16px ${FONT_TIMES}`;
      ctx.fillStyle = line.heading ? '#fff4c4' : '#ffffff';
      ctx.fillText(line.text, px + PW / 2, y);
      y += 24;
    }
    ctx.restore();

    const closeY = py + PH - 40;
    this._drawWin95Button(ctx, px + 9, closeY, PW - 18, 36, 'Close');
    this._creditsCloseRect = { x: px + 9, y: closeY, w: PW - 18, h: 36 };
  };

  MapRenderer.prototype._handleCreditsClick = function(px, py) {
    const r = this._creditsCloseRect;
    if (r && px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) {
      this._creditsScreen = false;
    }
  };

  // ─── New Game Wizard (9-step) ─────────────────────────────────────────────

  MapRenderer._MAP_SIZES = [
    { label: 'Small',  cols:  40, rows:  25, desc: '40x50 squares, quick game' },
    { label: 'Normal', cols:  80, rows:  50, desc: '50x80 squares' },
    { label: 'Large',  cols: 100, rows:  65, desc: '75x120 squares, long game' },
  ];

  MapRenderer._DIFFICULTIES = ['Chieftain (easiest)', 'Warlord', 'Prince', 'King', 'Emperor', 'Deity (toughest)'];

  MapRenderer._BARBARIANS = ['Villages Only', 'Roving Bands', 'Restless Tribes', 'Raging Hordes'];
  MapRenderer._CITY_STYLES = ['Bronze Age Monolith', 'Classical Forum', 'Far East Pavilion', 'Medieval Castle'];

  /** Public entry point — called by main.js on boot. */
  MapRenderer.prototype.openTitleScreen = function() {
    // Play OPENING.webm intro video first, then show title screen
    this._playOpeningVideo(() => {
      this._titleScreen = true;
      this._titleSelection = 0;
      // Play looping menu music
      this.audio?.playCDMusic('menu');
      this._currentMusicEra = 'menu';
    });
  }

  MapRenderer.prototype._openNewGameWizard = function(fromTitle = false) {
    this._pendingWizardGame = null;
    this._wizardGameLoading = false;
    this._wizard = {
      step:        0,
      mapSizeIdx:  1,      // Normal
      difficulty:  2,      // Prince
      numCivs:     4,      // 3-7
      barbarians:  2,      // Restless Tribes (Game.txt @default=2)
      gender:      0,      // 0=Male, 1=Female
      playerCiv:   0,      // CIVS index
      leaderName:  '',     // editable text
      cityStyle:   0,      // 0-3
      cursorBlink: 0,      // ms counter for blinking cursor
      fromTitle,
      // Custom features (checkboxes in "Select Custom Features" step)
      customFeatures: [false, false, false, false, false, false], // all unchecked (no @default in Game.txt)
      // Game Rules (step 4): 0=Standard, 1=Customize
      _gameRulesIdx: 0,
      _showAdvanced: false, // true = showing ADVANCED checkboxes sub-step
      // Customize World sub-steps (null = standard size, 0-3 = sub-step)
      customizeStep: null,
      landMass:    1,      // 0=Small, 1=Normal, 2=Large (Game.txt @CUSTOMLAND)
      worldType:   1,      // 0=Archipelago, 1=Varied, 2=Continents (Game.txt @CUSTOMFORM)
      climate:     1,      // 0=Arid, 1=Normal, 2=Wet
      temperature: 1,      // 0=Cool, 1=Temperate, 2=Warm
      worldAge:    1,      // 0=3 billion, 1=4 billion, 2=5 billion
    };
    this._wizardRects = [];
  }

  // ── Intro background images (from pre-extracted Intro.dll / Tiles.dll) ────

  // Mapping: wizard step → { image, xPos } (matches original Civ2 MGE sequence).
  // Values come from axx0's Civ2GoldInterface Decorations: positive anchors
  // from the left, negative anchors from the right, and zero centres.
  MapRenderer._STEP_BACKGROUNDS = {
    // Position values are the actual normalized coordinates used by axx0's
    // Civ2GoldInterface Decorations. Positive values anchor from the left,
    // zero centres, and negative values anchor from the right.
    title: { img: 'sinaiPic',          xPos:  0.08 },
    0:     { img: 'stPeterburgPic',    xPos:  0    },
    1:     { img: 'mingGeneralPic',    xPos: -0.08 },
    2:     { img: 'ancientPersonsPic', xPos:  0.08 },
    3:     { img: 'barbariansPic',     xPos: -0.08 },
    4:     { img: 'galleyPic',         xPos:  0.08 },
    5:     { img: 'peoplePic1',        xPos:  0    },
    6:     { img: 'peoplePic2',        xPos:  0    },
    7:     { img: 'peoplePic2',        xPos:  0    },
    8:     { img: 'templePic',         xPos:  0.08 },
    9:     { img: 'desertPic',         xPos:  0    },
  };

  MapRenderer.prototype._loadIntroImages = function() {
    const names = [
      'sinaiPic', 'stPeterburgPic', 'desertPic', 'snowPic', 'canyonPic',
      'mingGeneralPic', 'islandPic', 'ancientPersonsPic', 'barbariansPic',
      'galleyPic', 'peoplePic1', 'peoplePic2', 'templePic',
    ];
    for (const name of names) {
      const img = new Image();
      // These are the actual Intro.dll bitmaps. Drawing the reconstructed
      // replacements changed their crop, contrast and texture substantially.
      img.src = assetUrl(`sprites/extracted/intro/${name}.png`);
      this._introImages[name] = img;
    }

    // Original 640x480 MGE World-screen backdrops extracted from Tiles.dll.
    // Only the upper-left 600x400 image area is drawn; the remaining red area
    // in each resource is the original chroma-key padding.
    for (const name of ['hallOfFameBack', 'top5Back', 'scoreBack']) {
      const img = new Image();
      img.src = assetUrl(`sprites/extracted/tiles/${name}.gif`);
      this._introImages[name] = img;
    }

    // Original MGE throne room from pv.dll. Each category has four complete
    // period variants, composited over the original 640x480 empty room.
    for (const name of ['base', ...[
      'walls', 'floor', 'entrance', 'windows', 'banner', 'columns', 'throne', 'guards',
    ].flatMap(category => [0, 1, 2, 3].map(tier => `${category}-${tier}`))]) {
      const img = new Image();
      img.src = `${assetUrl(`sprites/extracted/palace/${name}.png`)}?v=4`;
      this._introImages[`palace-${name}`] = img;
    }
  }

  MapRenderer.prototype._loadSealImage = function() {
    const img = new Image();
    img.src = assetUrl('sprites/extracted/intro/hires/backgroundImage.png');
    this._sealImage = img;

    // Tileable background texture (extracted from seal image background)
    const bgTile = new Image();
    bgTile.src = assetUrl('sprites/extracted/intro/hires/sealBackground.png');
    bgTile.onload = () => { this._sealBgTile = bgTile; };
    this._sealBgTile = null;
  }

  /** Play the OPENING.webm intro video, then call onDone. Click/key skips. */
  MapRenderer.prototype._playOpeningVideo = function(onDone) {
    const video = document.createElement('video');
    video.src = assetUrl('sprites/extracted/video/OPENING.webm');
    video.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:9999;background:#000;cursor:pointer';
    video.playsInline = true;
    video.muted = false;
    let soundButton = null;

    const finish = () => {
      if (this._openingVideoDone) return;
      this._openingVideoDone = true;
      clearTimeout(stallTimer);
      document.removeEventListener('keydown', skipOnKey);
      soundButton?.remove();
      if (video.parentNode) video.parentNode.removeChild(video);
      onDone();
    };

    this._openingVideoDone = false;

    // Fallback: if video stalls or never fires ended (e.g. headless browser), skip after 60s
    const stallTimer = setTimeout(finish, 60_000);

    video.addEventListener('ended', finish);
    video.addEventListener('click', finish);
    const skipOnKey = () => finish();
    document.addEventListener('keydown', skipOnKey);

    video.addEventListener('canplay', async () => {
      try {
        await video.play();
      } catch (_) {
        // Audible autoplay is blocked before the first user gesture in modern
        // browsers. Keep the original movie visible and offer sound explicitly.
        video.muted = true;
        video.play().then(() => {
          soundButton = document.createElement('button');
          soundButton.type = 'button';
          soundButton.textContent = 'Enable sound';
          soundButton.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10000;padding:7px 18px;background:#c0c0c0;color:#000;border:2px outset #fff;font:13px Arial,sans-serif;cursor:pointer';
          soundButton.addEventListener('click', event => {
            event.stopPropagation();
            video.muted = false;
            soundButton.remove();
            soundButton = null;
          });
          document.body.appendChild(soundButton);
        }).catch(() => finish());
      }
    }, { once: true });
    video.addEventListener('error', () => { finish(); }, { once: true });

    document.body.appendChild(video);
  }

  /**
   * Play a short event video (victory, spaceship launch, anarchy transition).
   * Video is full-screen overlay, skippable by click/key/ESC, auto-dismissed on end.
   */
  MapRenderer.prototype._playEventVideo = function(filename, onDone) {
    if (this._eventVideo) return;  // already playing

    // Fade out CD music during video playback
    const wasPlayingMusic = this.audio?.musicPlaying;
    this.audio?.stopMusic(500);

    const video = document.createElement('video');
    video.src = assetUrl(`sprites/extracted/video/${filename}`);
    video.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:9999;background:#000;cursor:pointer';
    video.playsInline = true;
    video.muted = false;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (video.parentNode) video.parentNode.removeChild(video);
      document.removeEventListener('keydown', skipOnKey, true);
      this._eventVideoSkipHandler = null;
      this._eventVideo = null;
      // Resume CD music after video
      if (wasPlayingMusic) {
        this._currentMusicEra = null;
        this._startEraMusic(this.gameState?.year ?? -4000);
      }
      if (onDone) onDone();
    };

    video.addEventListener('ended', finish);
    video.addEventListener('click', finish);
    const skipOnKey = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') finish();
    };
    document.addEventListener('keydown', skipOnKey, true);
    this._eventVideoSkipHandler = skipOnKey;

    video.addEventListener('canplay', async () => {
      try {
        await video.play();
      } catch (_) {
        video.muted = true;
        video.play().catch(() => finish());
      }
    }, { once: true });
    video.addEventListener('error', () => finish(), { once: true });

    this._eventVideo = video;
    document.body.appendChild(video);
  }

  MapRenderer.prototype._stopEventVideo = function() {
    if (this._eventVideoSkipHandler) {
      document.removeEventListener('keydown', this._eventVideoSkipHandler, true);
      this._eventVideoSkipHandler = null;
    }
    if (this._eventVideo) {
      if (this._eventVideo.parentNode) this._eventVideo.parentNode.removeChild(this._eventVideo);
      this._eventVideo = null;
    }
  }

  /**
   * Draw Win95 title bar + menu bar for title/wizard screens.
   * Simpler version of _drawTopBar — no game state needed.
   */
  MapRenderer.prototype._drawWin95Chrome = function(ctx, canvasW) {
    

    // ── Title bar ──
    const grad = ctx.createLinearGradient(0, 0, canvasW - 70, 0);
    grad.addColorStop(0, '#000080');
    grad.addColorStop(1, '#1084d0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW - 60, TITLE_H);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(canvasW - 60, 0, 60, TITLE_H);

    // Civ2 icon (gold square with "C2")
    ctx.fillStyle = '#c89010';
    ctx.fillRect(4, 3, 14, 14);
    ctx.font = FONT.TINY_BOLD;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C2', 11, 10);

    // Title text
    ctx.font = FONT.SMALL_BOLD;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText("Sid Meier's Civilization II", 24, TITLE_H / 2);

    // Win95 system buttons — □ ×
    const BTN_W = 16, BTN_H = 14;
    const btns = ['\u2014', '\u25A1', '\u00D7'];
    btns.forEach((label, i) => {
      const bx = canvasW - 4 - (btns.length - i) * (BTN_W + 2);
      const by = Math.round((TITLE_H - BTN_H) / 2);
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(bx, by, BTN_W, BTN_H);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by + BTN_H - 1); ctx.lineTo(bx, by); ctx.lineTo(bx + BTN_W - 1, by);
      ctx.stroke();
      ctx.strokeStyle = '#808080';
      ctx.beginPath();
      ctx.moveTo(bx + BTN_W - 0.5, by); ctx.lineTo(bx + BTN_W - 0.5, by + BTN_H - 0.5);
      ctx.lineTo(bx, by + BTN_H - 0.5);
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = label === '\u00D7' ? `bold 11px ${FONT_ARIAL}` : `11px ${FONT_ARIAL}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, bx + BTN_W / 2, by + BTN_H / 2);
    });

    // ── Menu bar ──
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(0, TITLE_H, canvasW, MENU_H);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, TITLE_H + 0.5); ctx.lineTo(canvasW, TITLE_H + 0.5);
    ctx.stroke();
    ctx.strokeStyle = '#808080';
    ctx.beginPath();
    ctx.moveTo(0, TOP_H - 0.5); ctx.lineTo(canvasW, TOP_H - 0.5);
    ctx.stroke();

    // Menu labels (non-interactive on title/wizard — match original Civ2 MGE menu bar)
    const labels = ['Game', 'Kingdom', 'View', 'Orders', 'Advisors', 'World', 'Cheat', 'Edit', 'Civilopedia'];
    ctx.font = FONT.BODY_SMALL;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#808080'; // grayed out — not active during wizard
    ctx.textAlign = 'left';
    let mx = 4;
    for (const lbl of labels) {
      ctx.fillText(lbl, mx + 6, TITLE_H + MENU_H / 2);
      mx += ctx.measureText(lbl).width + 14;
    }

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  /**
   * Draw the Civ2 wizard background: tan fill + centered seal + framed photo.
   * Matches original Civ2 MGE layout from axx0 reference.
   * @param {number} xPos normalized placement: positive=left, 0=center, negative=right
   */
  MapRenderer.prototype._drawWizardBackground = function(ctx, canvasW, canvasH, imageName, xPos = 0, frameColor = '#D4871C') {
    // 1. Tan background (matches original Civ2)
    // Matches the reconstructed seal's sampled background exactly so its
    // square source canvas disappears into the original tan field.
    ctx.fillStyle = '#8F7B63';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 2. Reconstructed seal, cropped to the square footprint of the original
    // 530x480 background image. This deliberately preserves the modern seal
    // while restoring MGE's native 480px placement and apparent emblem size.
    const seal = this._sealImage;
    if (seal && seal.naturalWidth) {
      const destSize = Math.min(480, canvasH - TOP_H - 20, canvasW);
      const cropSize = Math.min(seal.naturalWidth, seal.naturalHeight);
      const cropX = Math.floor((seal.naturalWidth - cropSize) / 2);
      const cropY = Math.floor((seal.naturalHeight - cropSize) / 2);
      const sx = Math.round((canvasW - destSize) / 2);
      const sy = Math.round((canvasH - destSize) / 2);
      this._wizardSealRect = { x: sx, y: sy, w: destSize, h: destSize };
      ctx.drawImage(seal, cropX, cropY, cropSize, cropSize, sx, sy, destSize, destSize);
    }

    // 3. Intro.dll photo at native resolution inside the original 11px panel.
    const img = this._introImages[imageName];
    if (img && img.naturalWidth) {
      this._ensureWallpapers();
      const panelW = img.naturalWidth + 22;
      const panelH = img.naturalHeight + 22;
      let panelX;
      if (xPos > 0) panelX = Math.round(canvasW * xPos);
      else if (xPos < 0) panelX = Math.round((1 + xPos) * canvasW - panelW);
      else panelX = Math.round((canvasW - panelW) / 2);
      const panelY = Math.round(canvasH * 0.09);
      this._wizardPhotoRect = { x: panelX, y: panelY, w: panelW, h: panelH };

      if (this._outerWallpaper) this._tilePattern(ctx, this._outerWallpaper, panelX, panelY, panelW, panelH);
      else { ctx.fillStyle = '#9a9a9a'; ctx.fillRect(panelX, panelY, panelW, panelH); }
      this._drawBevel5(ctx, panelX, panelY, panelW, panelH);

      ctx.fillStyle = frameColor;
      ctx.fillRect(panelX + 7, panelY + 7, img.naturalWidth + 8, img.naturalHeight + 8);
      ctx.fillStyle = '#333333';
      ctx.fillRect(panelX + 10, panelY + 10, img.naturalWidth + 2, img.naturalHeight + 2);
      const smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, panelX + 11, panelY + 11);
      ctx.imageSmoothingEnabled = smoothing;
    }

    // 4. Win95 title bar + menu bar on top
    this._drawWin95Chrome(ctx, canvasW);
  }

  // ── Shared wizard drawing helpers ─────────────────────────────────────────

  /** Extract marble wallpaper tiles from ICONS.GIF (one-time). */
  MapRenderer.prototype._ensureWallpapers = function() {
    if (this._outerWallpaper) return;
    const sheet = this.sprites.getSheet('icons');
    if (!sheet) return;
    // Outer wallpaper: 64×32 coarse stone at (199, 322)
    const ow = document.createElement('canvas');
    ow.width = 64; ow.height = 32;
    ow.getContext('2d').drawImage(sheet, 199, 322, 64, 32, 0, 0, 64, 32);
    this._outerWallpaper = ow;
    // Inner wallpaper: 32×32 fine marble at (298, 190)
    const iw = document.createElement('canvas');
    iw.width = 32; iw.height = 32;
    iw.getContext('2d').drawImage(sheet, 298, 190, 32, 32, 0, 0, 32, 32);
    this._innerWallpaper = iw;
  }

  /** Fill (x,y,w,h) with a repeating tile pattern. */
  MapRenderer.prototype._tilePattern = function(ctx, tile, x, y, w, h) {
    const pat = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  MapRenderer.prototype._drawWizardPanel = function(ctx, canvasW, canvasH, PW, PH, titleText) {
    const FS = "'Times New Roman','Tinos',Times,serif";
    this._ensureWallpapers();

    // Reproduce BaseDialog coordinates used by the MGE reconstruction. Most
    // setup dialogs sit three percent above the bottom and alternate left/right
    // so they do not obscure the associated photo. Custom-world pages and the
    // final INIT narrative are centred in both axes.
    const wizard = this._wizard;
    let dialogX = 0;
    let dialogY = -0.03;
    switch (wizard?.step) {
      case 1: dialogX = 0.085; break;   // Difficulty
      case 2: dialogX = -0.085; break;  // Number of civilizations
      case 3: dialogX = 0.085; break;   // Barbarian activity
      case 4: dialogX = wizard._showAdvanced ? 0.085 : -0.085; break;
      case 8: dialogX = -0.085; break;  // City style
      case 9: dialogY = -5; break;      // GAME.TXT @INIT: @y=-5
      default: break;
    }
    if (wizard?.step === 0 && wizard.customizeStep !== null) dialogY = 0;

    const stepBg = MapRenderer._STEP_BACKGROUNDS[this._wizard?.step ?? 0];
    const px = dialogX === 0
      ? Math.floor((canvasW - PW) / 2)
      : dialogX > 0
        ? Math.floor(dialogX * canvasW)
        : Math.floor((1 + dialogX) * canvasW - PW);
    const py = dialogY === 0
      ? Math.floor((canvasH - PH) / 2)
      : dialogY < -1
        ? Math.floor(canvasH + dialogY - PH)
        : Math.floor((1 + dialogY) * canvasH - PH);
    this._wizardDialogRect = { x: px, y: py, w: PW, h: PH };

    // Draw wizard background: tan + seal + framed photo at top
    if (stepBg) {
      this._drawWizardBackground(ctx, canvasW, canvasH, stepBg.img, stepBg.xPos ?? 0);
    } else {
      ctx.fillStyle = '#8F7B63';
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // Outer area — marble wallpaper tile
    if (this._outerWallpaper) {
      this._tilePattern(ctx, this._outerWallpaper, px, py, PW, PH);
    } else {
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(px, py, PW, PH);
    }

    // 5-layer outer bevel border
    this._drawBevel5(ctx, px, py, PW, PH);

    // Inner panel — reference: border at x=9, content at x=11
    const INS = 11;
    const ix = px + INS, iy = py + 34, iw = PW - INS * 2, ih = PH - 34 - 44;

    // Inner sunken border (2 layers): pen7 #434343 top/left, pen6 #DFDFDF bot/right
    ctx.fillStyle = '#434343'; ctx.fillRect(ix - 2, iy - 2, iw + 4, 1);          ctx.fillRect(ix - 2, iy - 2, 1, ih + 4);
    ctx.fillStyle = '#DFDFDF'; ctx.fillRect(ix - 2, iy + ih + 1, iw + 4, 1);    ctx.fillRect(ix + iw + 1, iy - 2, 1, ih + 4);
    ctx.fillStyle = '#434343'; ctx.fillRect(ix - 1, iy - 1, iw + 2, 1);          ctx.fillRect(ix - 1, iy - 1, 1, ih + 2);
    ctx.fillStyle = '#DFDFDF'; ctx.fillRect(ix - 1, iy + ih, iw + 2, 1);        ctx.fillRect(ix + iw, iy - 1, 1, ih + 2);

    // Inner fill — fine marble wallpaper
    if (this._innerWallpaper) {
      this._tilePattern(ctx, this._innerWallpaper, ix, iy, iw, ih);
    } else {
      ctx.fillStyle = '#bfbfbf';
      ctx.fillRect(ix, iy, iw, ih);
    }

    // Title text — serif with embossed shadow on outer wallpaper area
    // Reference: HeaderLabelColour = RGB(135,135,135), shadow = true
    ctx.font = FONT.TITLE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText(titleText, px + PW / 2 + 1, py + 17 + 1);
    ctx.fillStyle = '#878787';
    ctx.fillText(titleText, px + PW / 2, py + 17);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    return { px, py };
  }

  /**
   * Draw a pixel-accurate Win95 radio button.
   * Based on axx0/Civ2-clone PaintRadioButton (RaylibUI/Bitmaps/ImageUtils.cs).
   * The button is ~17×17 pixels drawn at (x, y).
   */
  MapRenderer.prototype._drawCiv2RadioBtn = function(ctx, x, y, selected) {
    // Base gray filled circle
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.beginPath(); ctx.arc(x + 8, y + 8, 8, 0, Math.PI * 2); ctx.fill();
    // Black circle outline offset by (1,1)
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + 9, y + 9, 8, 0, Math.PI * 2); ctx.stroke();
    // Black corner corrections for crispness
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 1, y + 4, 2, 3);
    ctx.fillRect(x + 3, y + 2, 2, 2);
    ctx.fillRect(x + 6, y + 1, 1, 1);
    ctx.fillRect(x + 11, y + 15, 3, 2);
    ctx.fillRect(x + 14, y + 13, 2, 2);
    ctx.fillRect(x + 16, y + 11, 1, 1);
    // White circle outline at (0,0)
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + 8, y + 8, 8, 0, Math.PI * 2); ctx.stroke();

    if (!selected) {
      // Light gray cross-shaped fill
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 6, y + 4, 5, 9);
      ctx.fillRect(x + 4, y + 6, 9, 5);
      // White highlight (top-left inner edge)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 5, y + 11, 1, 1);
      ctx.fillRect(x + 4, y + 6, 1, 5);
      ctx.fillRect(x + 5, y + 5, 1, 2);
      ctx.fillRect(x + 6, y + 4, 1, 2);
      ctx.fillRect(x + 7, y + 4, 4, 1);
      ctx.fillRect(x + 11, y + 5, 1, 1);
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 11, y + 11, 1, 1);
      // White bottom-right edge
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 7, y + 13, 4, 1);
      ctx.fillRect(x + 11, y + 12, 1, 1);
      ctx.fillRect(x + 12, y + 11, 1, 1);
      ctx.fillRect(x + 13, y + 7, 1, 4);
    } else {
      // Selected: larger light gray cross + black center
      ctx.fillStyle = 'rgb(192,192,192)';
      ctx.fillRect(x + 7, y + 4, 4, 10);
      ctx.fillRect(x + 4, y + 7, 10, 4);
      ctx.fillRect(x + 6, y + 5, 6, 8);
      ctx.fillRect(x + 5, y + 6, 8, 6);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + 7, y + 6, 4, 6);
      ctx.fillRect(x + 6, y + 7, 6, 4);
    }
  }

  MapRenderer.prototype._drawWizardRadioList = function(ctx, px, py, PW, PH, options, selectedIdx, buttons) {
    const FS = "'Times New Roman','Tinos',Times,serif";
    const INS = 11;
    const ITEM_H = 32;
    const listTop = py + 34;

    for (let i = 0; i < options.length; i++) {
      const iy = listTop + i * ITEM_H;
      const sel = i === selectedIdx;

      // Selection rectangle around selected row (reference: pen color rgb(64,64,64))
      if (sel) {
        ctx.strokeStyle = 'rgb(64,64,64)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + INS + 32 + 0.5, iy + 2.5, PW - 2 * INS - 35, ITEM_H - 4);
      }

      // Win95 radio button (17×17) — pixel-accurate from axx0 reference
      this._drawCiv2RadioBtn(ctx, px + INS + 10, iy + Math.floor((ITEM_H - 17) / 2), sel);

      // Label text — serif (reference: Times New Roman 18px, color rgb(51,51,51))
      const lx = px + INS + 34, ly = iy + ITEM_H / 2;
      ctx.font = `18px ${FONT_TIMES}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#333333';
      ctx.fillText(options[i], lx, ly);

      this._wizardRects.push({ id: 'opt', idx: i, x: px + 10, y: iy, w: PW - 20, h: ITEM_H });
    }
    ctx.textBaseline = 'alphabetic';

    // Buttons at bottom — configurable (default: OK + Cancel)
    const btns = buttons || ['OK', 'Cancel'];
    const btnY = py + PH - 39;
    const btnH = 34;
    const gap = 4;
    const footerX = px + 7;
    const footerW = PW - 14;
    const btnW = Math.floor((footerW - gap * (btns.length - 1)) / btns.length);
    let bx = footerX;

    for (const label of btns) {
      this._drawWin95Button(ctx, bx, btnY, btnW, btnH, label, FS);
      const id = label.toLowerCase();
      this._wizardRects.push({ id, x: bx, y: btnY, w: btnW, h: btnH });
      if (label === 'OK') {
        ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
        ctx.strokeRect(bx + 3.5, btnY + 3.5, btnW - 7, btnH - 7);
      }
      bx += btnW + gap;
    }
  }

  // ── Main wizard dispatch ──────────────────────────────────────────────────

  MapRenderer.prototype._drawNewGameWizard = function(ctx, canvasW, canvasH) {
    this._wizardRects = [];
    const w = this._wizard;
    switch (w.step) {
      case 0: this._drawWizardStep0(ctx, canvasW, canvasH); break;
      case 1: this._drawWizardStep1(ctx, canvasW, canvasH); break;
      case 2: this._drawWizardStep2(ctx, canvasW, canvasH); break;
      case 3: this._drawWizardStep3(ctx, canvasW, canvasH); break;
      case 4: this._drawWizardStep4(ctx, canvasW, canvasH); break;
      case 5: this._drawWizardStep5(ctx, canvasW, canvasH); break;
      case 6: this._drawWizardStep6(ctx, canvasW, canvasH); break;
      case 7: this._drawWizardStep7(ctx, canvasW, canvasH); break;
      case 8: this._drawWizardStep8(ctx, canvasW, canvasH); break;
      case 9: this._drawWizardStep9(ctx, canvasW, canvasH); break;
    }
  }

  // Step 0: Select Size of World (Game.txt @SIZEOFMAP — button=Custom → Customize World sub-steps)
  MapRenderer.prototype._drawWizardStep0 = function(ctx, cw, ch) {
    const w = this._wizard;
    if (w.customizeStep === null) {
      // Main world size selection
      const PW = 500, PH = 178;
      const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, 'Select Size of World');
      const sizes = MapRenderer._MAP_SIZES;
      this._drawWizardRadioList(ctx, px, py, PW, PH,
        sizes.map(s => `${s.label}  (${s.desc})`),
        w.mapSizeIdx,
        ['Custom', 'OK', 'Cancel']);
    } else {
      // Customize World sub-steps (Game.txt order: CUSTOMLAND → CUSTOMFORM → CUSTOMCLIMATE → CUSTOMTEMP → CUSTOMAGE)
      const titles = [
        'Customize: Land Mass',   // @CUSTOMLAND
        'Customize: Land Form',   // @CUSTOMFORM
        'Customize: Climate',     // @CUSTOMCLIMATE
        'Customize: Temperature', // @CUSTOMTEMP
        'Customize: Age',         // @CUSTOMAGE
      ];
      const options = [
        ['Small', 'Normal', 'Large'],                       // @CUSTOMLAND
        ['Archipelago', 'Varied', 'Continents'],             // @CUSTOMFORM
        ['Arid', 'Normal', 'Wet'],                           // @CUSTOMCLIMATE
        ['Cool', 'Temperate', 'Warm'],                       // @CUSTOMTEMP
        ['3 billion years', '4 billion years', '5 billion years'], // @CUSTOMAGE
      ];
      const values = [w.landMass, w.worldType, w.climate, w.temperature, w.worldAge];
      const PW = 500, PH = 178;
      const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, titles[w.customizeStep]);
      this._drawWizardRadioList(ctx, px, py, PW, PH,
        options[w.customizeStep], values[w.customizeStep],
        ['Random', 'OK', 'Cancel']);
    }
  }

  // Step 1: Select Difficulty Level
  MapRenderer.prototype._drawWizardStep1 = function(ctx, cw, ch) {
    const PW = 500, PH = 275;
    const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, 'Select Difficulty Level');
    this._drawWizardRadioList(ctx, px, py, PW, PH,
      MapRenderer._DIFFICULTIES,
      this._wizard.difficulty);
  }

  // Step 2: Select Level Of Competition (Game.txt @ENEMIES — 7→3 descending, button=Random)
  MapRenderer.prototype._drawWizardStep2 = function(ctx, cw, ch) {
    const PW = 500, PH = 242;
    const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, 'Select Level Of Competition');
    const opts = [7, 6, 5, 4, 3];
    this._drawWizardRadioList(ctx, px, py, PW, PH,
      opts.map(n => `${n} Civilizations`),
      opts.indexOf(this._wizard.numCivs),
      ['Random', 'OK', 'Cancel']);
  }

  // Step 3: Select Level Of Barbarian Activity (Game.txt @BARBARITY — button=Random)
  MapRenderer.prototype._drawWizardStep3 = function(ctx, cw, ch) {
    const PW = 500, PH = 210;
    const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, 'Select Level Of Barbarian Activity');
    this._drawWizardRadioList(ctx, px, py, PW, PH,
      MapRenderer._BARBARIANS,
      this._wizard.barbarians,
      ['Random', 'OK', 'Cancel']);
  }

  // Custom feature labels (matches original Civ2 MGE "Select Custom Features" dialog)
  MapRenderer._CUSTOM_FEATURES = [
    'Simplified Combat',
    'Flat World',
    'Select Computer Opponents',
    'Accelerated Startup',
    'Bloodlust (No spaceships allowed)',
    "Don't Restart Eliminated Players",
  ];

  // Step 4: Select Game Rules (Game.txt @RULES) / Select Custom Features (@ADVANCED sub-step)
  MapRenderer.prototype._drawWizardStep4 = function(ctx, cw, ch) {
    const w = this._wizard;
    if (!w._showAdvanced) {
      // "Select Game Rules" — radio buttons (Game.txt @RULES)
      const PW = 500, PH = 146;
      const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, 'Select Game Rules');
      this._drawWizardRadioList(ctx, px, py, PW, PH,
        ['Use Standard Rules', 'Customize Rules'],
        w._gameRulesIdx);
    } else {
      // "Select Custom Features" — checkboxes (Game.txt @ADVANCED)
      const FS = "'Times New Roman','Tinos',Times,serif";
      const labels = MapRenderer._CUSTOM_FEATURES;
      const PW = 680, PH = 274;
      const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, 'Select Custom Features');

      const INS = 11;
      const listTop = py + 34;
      const ITEM_H = 32;

      for (let i = 0; i < labels.length; i++) {
        const iy = listTop + i * ITEM_H;
        const checked = w.customFeatures[i];

        // Checkbox
        this._drawCiv2Checkbox(ctx, px + INS + 6, iy, checked);

        // Label
        ctx.font = `18px ${FONT_TIMES}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#333333';
        ctx.fillText(labels[i], px + INS + 34, iy + ITEM_H / 2);

        this._wizardRects.push({ id: 'feat', idx: i, x: px + INS, y: iy, w: PW - 2 * INS, h: ITEM_H });
      }
      ctx.textBaseline = 'alphabetic';

      // OK and Cancel buttons (axx0 AdvancedRules.cs handles both)
      const btnH = 34;
      const btnY = py + PH - 39;
      const gap = 4;
      const btnW = Math.floor((PW - 14 - gap) / 2);
      let bx = px + 7;

      this._drawWin95Button(ctx, bx, btnY, btnW, btnH, 'OK', FS);
      ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
      ctx.strokeRect(bx + 3.5, btnY + 3.5, btnW - 7, btnH - 7);
      this._wizardRects.push({ id: 'ok', x: bx, y: btnY, w: btnW, h: btnH });
      bx += btnW + gap;
      this._drawWin95Button(ctx, bx, btnY, btnW, btnH, 'Cancel', FS);
      this._wizardRects.push({ id: 'cancel', x: bx, y: btnY, w: btnW, h: btnH });
    }
  }

  // Step 5: Select Your Gender
  MapRenderer.prototype._drawWizardStep5 = function(ctx, cw, ch) {
    const PW = 500, PH = 146;
    const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, 'Select Gender');
    this._drawWizardRadioList(ctx, px, py, PW, PH,
      ['Male', 'Female'],
      this._wizard.gender);
  }

  // Step 6: Select Your Tribe — 3-column grid with color swatches
  MapRenderer.prototype._drawWizardStep6 = function(ctx, cw, ch) {
    const FS = "'Times New Roman','Tinos',Times,serif";
    // MGE's tribe chooser fits inside an 800×600 desktop. Keep the wider
    // reconstruction at large sizes, but contract the three equal columns
    // instead of allowing the dialog to run off either edge.
    const PW = Math.min(920, Math.max(620, cw - 20)), PH = 304;
    const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, 'Select Your Tribe');

    const COL_W = Math.floor((PW - 28) / 3), ROW_H = 32;
    const ROWS = 7;
    const startX = px + 14, startY = py + 34;

    for (let i = 0; i < CIVS.length; i++) {
      // GAME.TXT @columns=3 fills each seven-row column before the next.
      const col = Math.floor(i / ROWS), row = i % ROWS;
      const cx = startX + col * COL_W;
      const cy = startY + row * ROW_H;
      const sel = this._wizard.playerCiv === i;

      // Original MGE uses a thin focus rectangle around the selected label.
      if (sel) {
        ctx.strokeStyle = '#404040';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + 33.5, cy + 2.5, COL_W - 40, ROW_H - 5);
      }

      this._drawCiv2RadioBtn(ctx, cx + 4, cy + 7, sel);

      // Civ name — the original selector does not add modern colour swatches.
      ctx.font = `18px ${FONT_TIMES}`;
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(CIVS[i].plural, cx + 35, cy + ROW_H / 2);

      this._wizardRects.push({ id: 'tribe', idx: i, x: cx, y: cy, w: COL_W - 4, h: ROW_H - 2 });
    }
    ctx.textBaseline = 'alphabetic';

    // Custom / OK / Cancel buttons (Game.txt @TRIBE: @button=Custom)
    const btnH = 34;
    const btnY = py + PH - 39;
    const gap = 4;
    const btnW = Math.floor((PW - 14 - 2 * gap) / 3);
    let bx = px + 7;

    this._drawWin95Button(ctx, bx, btnY, btnW, btnH, 'Custom', FS);
    this._wizardRects.push({ id: 'custom', x: bx, y: btnY, w: btnW, h: btnH });
    bx += btnW + gap;
    this._drawWin95Button(ctx, bx, btnY, btnW, btnH, 'OK', FS);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 3.5, btnY + 3.5, btnW - 7, btnH - 7);
    this._wizardRects.push({ id: 'ok', x: bx, y: btnY, w: btnW, h: btnH });
    bx += btnW + gap;
    this._drawWin95Button(ctx, bx, btnY, btnW, btnH, 'Cancel', FS);
    this._wizardRects.push({ id: 'cancel', x: bx, y: btnY, w: btnW, h: btnH });
  }

  // Step 7: What is Your Name? — canvas text input
  MapRenderer.prototype._drawWizardStep7 = function(ctx, cw, ch) {
    const FS = "'Times New Roman','Tinos',Times,serif";
    const PW = 680, PH = 120;
    const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, 'Please Enter Your Name');

    const w = this._wizard;
    const civData = CIVS[w.playerCiv];
    const tribeName = civData?.plural ?? 'Unknown';

    // Prompt text — Game.txt @NAME: just "Name:" field label
    const promptText = 'Name:';
    ctx.font = `bold 14px ${FONT_TIMES}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#BFBFBF';
    ctx.fillText(promptText, px + 9, py + 52 + 1);
    ctx.fillStyle = '#333333';
    ctx.fillText(promptText, px + 8, py + 52);

    // Sunken text field (Win95 inset bevel)
    const fx = px + 78, fy = py + 37, fw = 342, fh = 30;
    ctx.fillStyle = '#808080'; ctx.fillRect(fx, fy, fw, 1);        ctx.fillRect(fx, fy, 1, fh);
    ctx.fillStyle = '#404040'; ctx.fillRect(fx + 1, fy + 1, fw - 2, 1); ctx.fillRect(fx + 1, fy + 1, 1, fh - 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(fx, fy + fh - 1, fw, 1); ctx.fillRect(fx + fw - 1, fy, 1, fh);
    ctx.fillStyle = '#dfdfdf'; ctx.fillRect(fx + 1, fy + fh - 2, fw - 2, 1); ctx.fillRect(fx + fw - 2, fy + 1, 1, fh - 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(fx + 2, fy + 2, fw - 4, fh - 4);

    // Text content — serif
    ctx.font = `18px ${FONT_TIMES}`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const text = w.leaderName;
    ctx.fillText(text, fx + 6, fy + fh / 2);

    // Blinking cursor
    const showCursor = Math.floor(w.cursorBlink / 500) % 2 === 0;
    if (showCursor) {
      const textW = ctx.measureText(text).width;
      ctx.fillStyle = '#000000';
      ctx.fillRect(fx + 6 + textW, fy + 5, 1, fh - 10);
    }

    ctx.textBaseline = 'alphabetic';

    // OK / Cancel buttons
    const btnY = py + PH - 39;
    const btnH = 34, gap = 4;
    const btnW = Math.floor((PW - 14 - gap) / 2);
    const okX = px + 7, cancelX = okX + btnW + gap;
    this._drawWin95Button(ctx, cancelX, btnY, btnW, btnH, 'Cancel', FS);
    this._wizardRects.push({ id: 'cancel', x: cancelX, y: btnY, w: btnW, h: btnH });
    this._drawWin95Button(ctx, okX, btnY, btnW, btnH, 'OK', FS);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
    ctx.strokeRect(okX + 3.5, btnY + 3.5, btnW - 7, btnH - 7);
    this._wizardRects.push({ id: 'ok', x: okX, y: btnY, w: btnW, h: btnH });
  }

  // Step 8: Select Your City Style — with building preview thumbnails
  MapRenderer.prototype._drawWizardStep8 = function(ctx, cw, ch) {
    const FS = "'Times New Roman','Tinos',Times,serif";
    const PW = 500, PH = 286;
    const title = this._wizardGameLoading ? 'Generating World . . .' : 'Select Your City Style';
    const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, title);
    this._wizardRects = this._wizardRects || [];

    const INS = 11;
    const ITEM_H = 52;
    const listTop = py + 34;
    const styles = MapRenderer._CITY_STYLES;

    for (let i = 0; i < styles.length; i++) {
      const iy = listTop + i * ITEM_H;
      const sel = i === this._wizard.cityStyle;

      // Focus rectangle around the selected text, matching the native icon list.
      if (sel) {
        ctx.strokeStyle = 'rgb(64,64,64)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + INS + 69.5, iy + 7.5, PW - 2 * INS - 73, ITEM_H - 15);
      }

      // Reference selects CityImages.Sets[style][6]: walled variant, size col 2.
      const sprite = this.sprites.getSprite('citiesWalled', i, 2);
      if (sprite) {
        const thumbX = px + INS;
        const thumbY = iy + 2;
        ctx.drawImage(sprite, thumbX, thumbY, 64, 48);
      }

      // Label text
      const lx = px + INS + 70, ly = iy + ITEM_H / 2;
      ctx.font = `18px ${FONT_TIMES}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#333333';
      ctx.fillText(styles[i], lx, ly);

      this._wizardRects.push({ id: 'opt', idx: i, x: px + 10, y: iy, w: PW - 20, h: ITEM_H });
    }
    ctx.textBaseline = 'alphabetic';

    // While the worker is building the map, replace the active buttons with a
    // conspicuous progress field. Previously only the title bar changed, so
    // clicking OK could look like a dead button on slower world sizes.
    const btnY = py + PH - 39;
    const btnH = 34, gap = 4;
    if (this._wizardGameLoading) {
      const dots = '.'.repeat(1 + (Math.floor(performance.now() / 350) % 3));
      const status = this._wizard.generationMessage || `Creating your world${dots}`;
      ctx.fillStyle = '#bfbfbf';
      ctx.fillRect(px + 7, btnY, PW - 14, btnH);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px + 7, btnY, PW - 14, 1);
      ctx.fillRect(px + 7, btnY, 1, btnH);
      ctx.fillStyle = '#808080';
      ctx.fillRect(px + 7, btnY + btnH - 1, PW - 14, 1);
      ctx.fillRect(px + PW - 8, btnY, 1, btnH);
      ctx.font = `18px ${FONT_TIMES}`;
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(status, px + PW / 2, btnY + btnH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      return;
    }

    const btnW = Math.floor((PW - 14 - gap) / 2);
    let bx = px + 7;
    this._drawWin95Button(ctx, bx, btnY, btnW, btnH, 'OK', FS);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 3.5, btnY + 3.5, btnW - 7, btnH - 7);
    this._wizardRects.push({ id: 'ok', x: bx, y: btnY, w: btnW, h: btnH });
    bx += btnW + gap;
    this._drawWin95Button(ctx, bx, btnY, btnW, btnH, 'Cancel', FS);
    this._wizardRects.push({ id: 'cancel', x: bx, y: btnY, w: btnW, h: btnH });
  }

  // Step 9: "In the Beginning..." narrative screen
  // Original Civ2: shows small thumbnail image on left + flowing paragraph text
  MapRenderer.prototype._drawWizardStep9 = function(ctx, cw, ch) {
    const FS = "'Times New Roman','Tinos',Times,serif";
    const w = this._wizard;
    const civData = CIVS[w.playerCiv];
    const leaderName = w.leaderName || civData?.leader || 'Leader';
    const tribeName = civData?.plural || 'People';

    const PW = 744, PH = 163;
    const { px, py } = this._drawWizardPanel(ctx, cw, ch, PW, PH, 'In the Beginning . . .');

    const INS = 11;
    const IMG_SIZE = 64;
    const imgX = px + INS + 6;
    const imgY = py + 34;

    // Small thumbnail image (from seal/background) — matches original INIT dialog
    if (!this._initThumbImg && !this._initThumbLoading) {
      this._initThumbLoading = true;
      // Extracted once from Tiles.dll by tools/extract-mge-ui-backgrounds.js;
      // the original DLL is never needed by the public browser build.
      const image = new Image();
      image.onload = () => {
        this._initThumbImg = image;
        this._initThumbLoading = false;
      };
      image.onerror = () => {
        this._initThumbImg = null;
        this._initThumbLoading = false;
      };
      image.src = assetUrl('sprites/extracted/tiles/bgSmall.png');
    }
    if (this._initThumbImg?.complete && this._initThumbImg.naturalWidth > 0) {
      // Exact Tiles.dll rectangle used by Civ2GoldInterface backgroundImageSmall1.
      ctx.drawImage(this._initThumbImg, 332, 134, 64, 64, imgX, imgY, IMG_SIZE, IMG_SIZE);
      // Border around thumbnail
      ctx.strokeStyle = '#808080'; ctx.lineWidth = 1;
      ctx.strokeRect(imgX - 0.5, imgY - 0.5, IMG_SIZE + 1, IMG_SIZE + 1);
    }

    // Text — flowing paragraph to the right of the thumbnail
    // Game.txt @INIT: double space after "prosperous." and %STRING2 for bonus tech
    const bonusTech = w.startingTechNames?.length
      ? `${w.startingTechNames.join(', ')}, `
      : '';
    const fullText = `${leaderName}, you have risen to become leader of the ${tribeName}.  ` +
      `May your reign be long and prosperous.  The ${tribeName} have knowledge of ` +
      `Irrigation, Mining, ${bonusTech}and Roads.`;

    const textX = imgX + IMG_SIZE + 10;
    const textY = py + 38;
    const textW = px + PW - INS - 6 - textX;

    ctx.font = `18px ${FONT_TIMES}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Word-wrap the text
    const words = fullText.split(' ');
    let line = '';
    let ly = textY;
    const LINE_H = 24;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > textW && line) {
        ctx.fillStyle = '#BFBFBF'; ctx.fillText(line, textX + 1, ly + 1);
        ctx.fillStyle = '#333333'; ctx.fillText(line, textX, ly);
        ly += LINE_H;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillStyle = '#BFBFBF'; ctx.fillText(line, textX + 1, ly + 1);
      ctx.fillStyle = '#333333'; ctx.fillText(line, textX, ly);
    }

    ctx.textBaseline = 'alphabetic';

    // Single OK button centered at bottom
    const btnH = 34;
    const btnX = px + 7;
    const btnW = PW - 14;
    const btnY = py + PH - 39;
    this._drawWin95Button(ctx, btnX, btnY, btnW, btnH, 'OK', FS);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
    ctx.strokeRect(btnX + 3.5, btnY + 3.5, btnW - 7, btnH - 7);
    this._wizardRects.push({ id: 'ok', x: btnX, y: btnY, w: btnW, h: btnH });
  }

  // ── Click handling ──────────────────────────────────────────────────────────

  MapRenderer.prototype._handleNewGameWizardClick = function(px, py) {
    const hit = this._wizardRects.find(
      r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h
    );
    if (!hit) return;

    const w = this._wizard;
    switch (hit.id) {
      case 'opt':
        this._wizardSelectOption(hit.idx);
        break;
      case 'tribe':
        w.playerCiv = hit.idx;
        break;
      case 'ok':
        this._wizardNext();
        break;
      case 'random':
        this._wizardRandomize();
        this._wizardNext();
        break;
      case 'custom':
        // "Custom" button on World Size (step 0) → enter Customize World sub-steps
        if (w.step === 0) {
          w.customizeStep = 0;
        }
        break;
      case 'feat':
        // Toggle custom feature checkbox
        w.customFeatures[hit.idx] = !w.customFeatures[hit.idx];
        break;
      case 'cancel':
        this._wizardBack();
        break;
    }
  }

  MapRenderer.prototype._wizardSelectOption = function(idx) {
    const w = this._wizard;
    switch (w.step) {
      case 0:
        if (w.customizeStep !== null) {
          // Order: CUSTOMLAND(0) → CUSTOMFORM(1) → CUSTOMCLIMATE(2) → CUSTOMTEMP(3) → CUSTOMAGE(4)
          switch (w.customizeStep) {
            case 0: w.landMass = idx; break;
            case 1: w.worldType = idx; break;
            case 2: w.climate = idx; break;
            case 3: w.temperature = idx; break;
            case 4: w.worldAge = idx; break;
          }
        } else {
          w.mapSizeIdx = idx;
        }
        break;
      case 1: w.difficulty = idx; break;
      case 2: w.numCivs = [7, 6, 5, 4, 3][idx] ?? 4; break;
      case 3: w.barbarians = idx; break;
      case 4:
        if (!w._showAdvanced) {
          w._gameRulesIdx = idx;
        }
        break;
      case 5: w.gender = idx; break;
      case 8: w.cityStyle = idx; break;
    }
  }

  MapRenderer.prototype._wizardNext = function() {
    const w = this._wizard;

    // Step 0: handle Customize World sub-steps
    if (w.step === 0 && w.customizeStep !== null) {
      if (w.customizeStep < 4) {
        w.customizeStep++;
        return;
      }
      // Finished last customize sub-step → advance to step 1
      w.customizeStep = null;
      w.step = 1;
      return;
    }

    // Step 4: Select Game Rules / Select Custom Features
    if (w.step === 4) {
      if (w._showAdvanced) {
        // OK on ADVANCED → go to Gender (step 5) — per axx0 AdvancedRules.cs
        w._showAdvanced = false;
        w.step = 5;
        return;
      }
      if (w._gameRulesIdx === 1) {
        // "Customize Rules" + OK → show ADVANCED checkboxes
        w._showAdvanced = true;
        return;
      }
      // "Use Standard Rules" + OK → skip to Gender (step 5)
      w.step = 5;
      return;
    }

    // On step 6→7 transition: populate leader name from selected civ
    if (w.step === 6) {
      const civData = CIVS[w.playerCiv];
      w.leaderName = w.gender === 1
        ? (civData?.female ?? civData?.leader ?? '')
        : (civData?.leader ?? '');
      w.cityStyle = civData?.cityStyle ?? 0;
      w.cursorBlink = 0;
    }

    // MGE finishes map creation before showing INIT so its narrative can list
    // the starting-position compensation advances that were actually awarded.
    if (w.step === 8) {
      if (this._pendingWizardGame) {
        w.startingTechNames = this._pendingWizardGame.civs[0]?.startingAdvanceIds
          ?.map(id => ADVANCES[id]?.name).filter(Boolean) ?? [];
        w.step = 9;
        this._currentMusicEra = 'ancient';
        this.audio?.playCDMusic('ancient');
        return;
      }
      if (this._wizardGameLoading) return;
      this._wizardGameLoading = true;
      w.generationError = false;
      w.generationMessage = 'Creating your world...';
      this._createGameFromWizard(w)
        .then(gs => {
          if (this._wizard !== w || w.step !== 8) return;
          this._pendingWizardGame = gs;
          w.startingTechNames = gs.civs[0]?.startingAdvanceIds
            ?.map(id => ADVANCES[id]?.name).filter(Boolean) ?? [];
          w.step = 9;
          this._currentMusicEra = 'ancient';
          this.audio?.playCDMusic('ancient');
        })
        .catch(error => {
          console.error('Failed to generate world:', error);
          if (this._wizard === w) {
            w.generationError = true;
            w.generationMessage = 'World generation failed. Click OK to retry.';
          }
        })
        .finally(() => {
          this._wizardGameLoading = false;
          if (this._wizard === w && !w.generationError) w.generationMessage = '';
        });
      return;
    }

    if (w.step < 9) {
      w.step++;
    } else {
      this._startNewGameFromWizard();
    }
  }

  MapRenderer.prototype._wizardRandomize = function() {
    const w = this._wizard;
    if (w.step === 0 && w.customizeStep !== null) {
      // Random on customize sub-steps
      switch (w.customizeStep) {
        case 0: w.landMass = Math.floor(Math.random() * 3); break;
        case 1: w.worldType = Math.floor(Math.random() * 3); break;
        case 2: w.climate = Math.floor(Math.random() * 3); break;
        case 3: w.temperature = Math.floor(Math.random() * 3); break;
        case 4: w.worldAge = Math.floor(Math.random() * 3); break;
      }
      return;
    }
    switch (w.step) {
      case 0: w.mapSizeIdx = Math.floor(Math.random() * MapRenderer._MAP_SIZES.length); break;
      case 2: w.numCivs = [7, 6, 5, 4, 3][Math.floor(Math.random() * 5)]; break;
      case 3: w.barbarians = Math.floor(Math.random() * MapRenderer._BARBARIANS.length); break;
    }
  }

  MapRenderer.prototype._wizardBack = function() {
    const w = this._wizard;
    // Step 9 ("In the Beginning...") is one-way — Escape acts as OK
    if (w.step === 9) {
      this._wizardNext();
      return;
    }
    // Back within Customize World sub-steps (step 0)
    if (w.step === 0 && w.customizeStep !== null) {
      if (w.customizeStep > 0) {
        w.customizeStep--;
      } else {
        w.customizeStep = null; // return to Select Size of World
      }
      return;
    }
    // Cancel from ADVANCED → go to Gender (per axx0 AdvancedRules.cs: Cancel → SelectGender)
    if (w.step === 4 && w._showAdvanced) {
      w._showAdvanced = false;
      w.step = 5;
      return;
    }
    if (w.step > 0) {
      w.step--;
    } else {
      // Step 0 cancel → return to title screen or close
      if (w.fromTitle) this._titleScreen = true;
      this._wizard = null;
    }
  }

  // ── Key handling ──────────────────────────────────────────────────────────

  MapRenderer.prototype._handleWizardKey = function(e) {
    const w = this._wizard;

    if (e.key === 'Escape') {
      this._wizardBack();
      return;
    }
    if (e.key === 'Enter') {
      this._wizardNext();
      return;
    }

    // Step 7: text input
    if (w.step === 7) {
      if (e.key === 'Backspace') {
        w.leaderName = w.leaderName.slice(0, -1);
        w.cursorBlink = 0;
        return;
      }
      // Allow printable characters, max 24
      if (e.key.length === 1 && w.leaderName.length < 24) {
        w.leaderName += e.key;
        w.cursorBlink = 0;
        return;
      }
    }

    // Arrow keys to navigate radio options
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      let count, current;

      if (w.step === 0 && w.customizeStep !== null) {
        // Customize World sub-steps: all have 3 options
        count = 3;
        current = [w.landMass, w.worldType, w.climate, w.temperature, w.worldAge][w.customizeStep];
      } else if (w.step === 4 && w._showAdvanced) {
        // ADVANCED checkboxes — no arrow navigation
        return;
      } else {
        const stepOptionCounts = [3, 6, 5, 4, 2, 2, 21, 0, 4, 0];
        count = stepOptionCounts[w.step] || 0;
        switch (w.step) {
          case 0: current = w.mapSizeIdx; break;
          case 1: current = w.difficulty; break;
          case 2: current = [7,6,5,4,3].indexOf(w.numCivs); break;
          case 3: current = w.barbarians; break;
          case 4: current = w._gameRulesIdx; break;
          case 5: current = w.gender; break;
          case 6: current = w.playerCiv; break;
          case 8: current = w.cityStyle; break;
          default: return;
        }
      }

      if (count === 0) return;
      const next = Math.max(0, Math.min(count - 1, current + dir));
      this._wizardSelectOption(next);
      if (w.step === 6) w.playerCiv = next;
    }
  }

  // ── Start game from wizard ────────────────────────────────────────────────

  MapRenderer.prototype._createGameFromWizard = async function(w) {
    const sizes = MapRenderer._MAP_SIZES;
    const size = sizes[w.mapSizeIdx] ?? sizes[1];
    const barbs = ['none', 'sedentary', 'restless', 'raging'];
    const worldTypes = ['archipelago', 'continents', 'continents'];
    const climates = ['arid', 'normal', 'wet'];
    const temps = ['cool', 'temperate', 'warm'];
    const ages = ['3b', '4b', '5b'];

    const gs = await GameState.create({
      seed:        (Math.random() * 0xFFFFFFFF) >>> 0,
      numCivs:     w.numCivs,
      mapCols:     size.cols,
      mapRows:     size.rows,
      playerCiv:   w.playerCiv,
      difficulty:  w.difficulty,
      worldType:   worldTypes[w.worldType] ?? 'continents',
      climate:     climates[w.climate] ?? 'normal',
      temperature: temps[w.temperature] ?? 'temperate',
      age:         ages[w.worldAge] ?? '4b',
      barbarians:  barbs[w.barbarians] ?? 'sedentary',
      landMass:    w.landMass ?? 1,
      flatEarth:   w.customFeatures[1] ?? false,
      mapData:     this._pendingMapData ?? null,
      onProgress: message => {
        if (this._wizard === w && w.step === 8) {
          w.generationMessage = message || 'Creating your world...';
        }
      },
    });
    this._pendingMapData = null;
    return gs;
  };

  MapRenderer.prototype._startNewGameFromWizard = async function() {
    const w     = this._wizard;

    // Save settings for Quick Game
    const settings = {
      mapSizeIdx:  w.mapSizeIdx,
      numCivs:     w.numCivs,
      playerCiv:   w.playerCiv,
      difficulty:  w.difficulty,
      worldType:   w.worldType,
      climate:     w.climate,
      temperature: w.temperature,
      worldAge:    w.worldAge,
      barbarians:  w.barbarians,
      landMass:    w.landMass ?? 1,
      gender:      w.gender,
      leaderName:  w.leaderName,
      cityStyle:   w.cityStyle,
    };
    localStorage.setItem('civ2_quickGameSettings', JSON.stringify(settings));

    const gs = this._pendingWizardGame ?? await this._createGameFromWizard(w);
    this._pendingWizardGame = null;

    if (gs.civs[0]) {
      gs.civs[0].femaleLeader = w.gender === 1;
      gs.civs[0].cityStyle = w.cityStyle ?? gs.civs[0].data?.cityStyle ?? 0;
      const civData = CIVS[w.playerCiv];
      const defaultName = w.gender === 1
        ? (civData?.female ?? civData?.leader ?? '')
        : (civData?.leader ?? '');
      if (w.leaderName && w.leaderName !== defaultName) {
        gs.civs[0].leaderNameOverride = w.leaderName;
      }
    }

    this._wireAudio(gs);
    this._resetWithGameState(gs);
  }

  MapRenderer.prototype._startQuickGame = async function() {
    const saved = localStorage.getItem('civ2_quickGameSettings');
    if (!saved) {
      this._openNewGameWizard(true);
      return;
    }

    const w = JSON.parse(saved);
    const sizes = MapRenderer._MAP_SIZES;
    const size  = sizes[w.mapSizeIdx] ?? sizes[1];
    const barbs = ['none', 'sedentary', 'restless', 'raging'];
    const worldTypes = ['archipelago', 'continents', 'continents'];
    const climates   = ['arid', 'normal', 'wet'];
    const temps      = ['cool', 'temperate', 'warm'];
    const ages       = ['3b', '4b', '5b'];

    const gs = await GameState.create({
      seed:        (Math.random() * 0xFFFFFFFF) >>> 0,
      numCivs:     w.numCivs ?? 7,
      mapCols:     size.cols,
      mapRows:     size.rows,
      playerCiv:   w.playerCiv ?? 0,
      difficulty:  w.difficulty ?? 2,
      worldType:   worldTypes[w.worldType] ?? 'continents',
      climate:     climates[w.climate] ?? 'normal',
      temperature: temps[w.temperature] ?? 'temperate',
      age:         ages[w.worldAge] ?? '4b',
      barbarians:  barbs[w.barbarians] ?? 'sedentary',
      landMass:    w.landMass ?? 1,
    });

    if (gs.civs[0]) {
      gs.civs[0].femaleLeader = (w.gender === 1);
      gs.civs[0].cityStyle = w.cityStyle ?? gs.civs[0].data?.cityStyle ?? 0;
      if (w.leaderName) {
        gs.civs[0].leaderNameOverride = w.leaderName;
      }
    }

    this._wireAudio(gs);
    this._resetWithGameState(gs);
  }


}
