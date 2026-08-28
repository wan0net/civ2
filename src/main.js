/**
 * main.js — entry point for Civ2 Web.
 *
 * Boot sequence:
 *   1. Load sprites (progress bar)
 *   2. Load audio (background, non-blocking)
 *   3. Create a minimal default GameState
 *   4. Start renderer and immediately open the New Game overlay
 */

import { SpriteManager } from './render/SpriteManager.js';
import { Renderer }      from './render/Renderer.js';
import { MapRenderer }   from './render/MapRenderer.js';
import { GameState }     from './engine/GameState.js';
import { AudioManager }  from './audio/AudioManager.js';
import { screenToTile }  from './utils/IsoMath.js';
import { UNITS, FLAGS }  from './data/units.js';
import { TERRAIN }       from './data/terrain.js';
import { MapGen }        from './engine/MapGen.js';
import { parseEvents, executeEvents } from './engine/ScenarioEvents.js';

// ─── DOM elements ─────────────────────────────────────────────────────────────

const canvas       = document.getElementById('game-canvas');
const loadingEl    = document.getElementById('loading');
const loadProgress = document.getElementById('load-progress');
const loadStatus   = document.getElementById('load-status');

// ─── Wire up renderer + input ─────────────────────────────────────────────────

function startGame(sprites, gameState, audio) {
  const renderer  = new Renderer(canvas, sprites);
  const mapScreen = new MapRenderer(sprites, gameState, audio);

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const tile = screenToTile(px, py, mapScreen.viewX, mapScreen.viewY);
    if (tile && tile.row >= 0 && tile.row < mapScreen.mapRows) {
      const wrappedCol = ((tile.col % mapScreen.mapCols) + mapScreen.mapCols) % mapScreen.mapCols;
      mapScreen.setHoveredTile({ col: wrappedCol, row: tile.row });
    } else {
      mapScreen.setHoveredTile(null);
    }
  });

  canvas.addEventListener('mouseleave', () => mapScreen.setHoveredTile(null));

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    mapScreen.handleRawClick(
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas.clientWidth,
      canvas.clientHeight,
    );
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    mapScreen.handleRightClick(
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas.clientWidth,
      canvas.clientHeight,
    );
  });

  renderer.setScreen(mapScreen);
  renderer.start();
  return mapScreen;
}

// ─── Boot sequence ────────────────────────────────────────────────────────────

async function boot() {
  // 1. Load sprites
  const sprites = new SpriteManager();
  await sprites.load((pct, name) => {
    loadProgress.value = pct;
    loadStatus.textContent = `Loading sprites… ${name} (${pct}%)`;
  });

  // 2. Start loading audio in the background (doesn't block the game)
  const audio = new AudioManager();
  audio.load().catch(err => console.warn('Audio load error:', err));

  // 3. Create a small placeholder world (rendered behind the overlay)
  loadStatus.textContent = 'Initialising…';
  await new Promise(r => setTimeout(r, 0));
  const defaultState = await GameState.create({ seed: 0x1234abcd, mapCols: 40, mapRows: 25, numCivs: 2 });

  // 4. Start renderer and show the title screen
  loadingEl.classList.add('hidden');
  const mapScreen = startGame(sprites, defaultState, audio);
  mapScreen.openTitleScreen();

  // Expose for automated testing
  window.__civ2 = {
    mapScreen,
    UNITS,
    FLAGS,
    TERRAIN,
    modules: { MapGen, MapRenderer, ScenarioEvents: { parseEvents, executeEvents } },
    /** Start a deterministic game bypassing the UI — used by Playwright tests. */
    async startTestGame(opts = {}) {
      const gs = await GameState.create({
        seed:    0x1234abcd,
        numCivs: 2,
        mapCols: 40,
        mapRows: 25,
        startingBonuses: false,
        ...opts,
      });
      mapScreen._wireAudio(gs);
      mapScreen._resetWithGameState(gs);
    },
  };
}

boot().catch((err) => {
  console.error('Boot failed:', err);
  loadStatus.textContent = `Error: ${err.message}`;
  loadProgress.style.display = 'none';
});
