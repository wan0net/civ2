# AGENTS.md — civ2

Browser-based Civilization II clone. Vite + vanilla JS, Canvas 2D rendering, xBRZ 2× upscaling.

## Goal: Pixel-accurate Civ2 MGE recreation

Exactly replicate original Civilization II Multiplayer Gold Edition — graphics, UI layout, game mechanics, and functionality. **Always cross-reference the original game's behavior** before implementing.

### Reference sources (in priority order)

1. **axx0/Civ2-clone** — C# (.NET 8) open-source Civ2 MGE re-implementation (GPL-3.0). **Local copy at `reference/Civ2-clone-master/Civ2-clone-master/`**. Primary reference for sprite coords, UI drawing, game logic, save parsing, and rules.
2. **Original Civ2 MGE** — authoritative source. Use screenshots, wikis, and fan docs when axx0 code is unclear.
3. **CivFanatics forums** — deep community knowledge on mechanics, formulas, and edge cases.

### Intentional deviations from original Civ2

1. **Click-on-unit context menu** — clicking a unit opens a floating action menu.
2. **xBRZ 2× sprite upscaling** — sprites upscaled for smoother visuals at modern resolutions.

### Workflow

- **Always** check axx0/Civ2-clone source before writing code.
- **Always** match original Civ2 graphics, colors, fonts, layout, and behavior exactly.
- Do **not** add features/UI/behaviors that weren't in original Civ2 MGE unless listed above.
- **Every new feature must have tests** — Playwright browser tests or unit tests.

## Commands

```bash
npm run dev      # dev server → http://localhost:3000
npm run build    # production build → dist/
```

## Architecture

```
src/
  main.js                   # boot: load sprites → map select screen → startGame()
  data/                     # terrain, units, improvements, advances, governments, civs, cosmic
  engine/
    GameState.js            # all game logic (map, units, cities, turns, combat, research)
    Unit.js / City.js / Civilization.js
    MapGen.js / MapLoader.js
  render/
    MapRenderer.js          # rendering + input handling (~5000 lines) + mixins/
    SpriteManager.js        # sprite loading, chroma-key, xBRZ upscaling
    Renderer.js             # canvas setup, rAF loop
    renderConstants.js      # fonts, colors, padding
  utils/
    IsoMath.js              # tile↔screen coords (TILE_W=64, TILE_H=32, SCALE=2)
    xbrz.js                 # xBRZ 2× scaling
  audio/
    AudioManager.js / sounds.js
public/                     # browser runtime assets only
tests/
  game.spec.js / site.spec.js # 260+ Playwright browser tests
```

See [docs/reference-data.md](docs/reference-data.md) for sprite coordinates, wonder IDs, city screen layout, and map file format.
