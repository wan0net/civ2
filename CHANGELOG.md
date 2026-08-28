# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.6.1] - 2026-08-28

### Added

- Added **Game → Report Bug...**, which creates one ZIP containing a PNG of the
  current game view, a restorable game-state snapshot, renderer/view state,
  browser diagnostics, and handling instructions.
- Added Download, system Share/Email, email-draft fallback, and prefilled GitHub
  issue routes for bug reports without storing GitHub credentials.
- Added a responsive in-game preview to the project landing page and refreshed
  its gameplay and project-page screenshots from the corrected renderer.

### Changed

- Restored the MGE-sized city production chooser, original silver listbox,
  Times headings, row geometry, unit/building icons, and fixed button layout.
- Size-one cities continue to offer Settlers and Engineers, matching MGE, but
  retain the completed production and shields until the city grows.
- Active units in cities now flash at the original 200ms cadence over the city
  and garrison flag instead of using a modern selection ring.
- Expanded browser coverage to 261 Playwright tests.

### Fixed

- Terrain and fog masks now respect transparent chroma-key pixels, removing the
  black dotted diamonds that appeared around every map square.
- Reveal-map mode no longer applies fog-edge dithering, and its minimap now
  shows the complete terrain, including blue ocean tiles, without fog.
- Corrected minimap terrain lookup so ocean and land use their intended MGE
  colours in normal play as well as reveal mode.
- Research chooser headings now widen the compact MGE dialog only when needed,
  preventing “What discovery shall our wise men pursue?” from overflowing.
- City garrison flags use the original marker offset and active units visibly
  animate over occupied cities.

## [0.6.0] - 2026-08-28

### Added

- Added a standalone project landing page and a separate game entry point.
- Added a mandatory ownership attestation before MGE-derived assets or the game
  engine load; acceptance remains local to the visitor's browser.
- Licensed original project code and documentation under BSD-3-Clause while
  explicitly excluding original Civilization II assets from that licence.
- Replaced the 665 MiB development asset dump with a 185 MiB runtime allow-list
  and removed original executables, DLLs, saves, logs, source AVIs, redundant
  Pedia material, screenshots, and sprite-comparison workspaces.
- Removed the browser's runtime dependency on the original `Tiles.dll`.
- Made asset URLs work from both the development root and GitHub Pages `/civ2/`.
- Added public-tree safety validation, contributor/security/provenance/release
  documentation, CI, and GitHub Pages deployment workflows.
- Restored the full Civilopedia menu indexes for advances, improvements, wonders, units, governments, terrain, and game concepts, plus separate Info and prerequisite-tree views backed by the original PEDIA files
- **Full zoom system** — 4 zoom levels (Z/X keys, Ctrl+Z, Shift+Z, etc.) with dynamic tile scaling
- **View Pieces mode** — V key toggle to disable unit selection for map viewing
- **Standardized font system** — `FONT` constants in `renderConstants.js` for consistent typography
- **Pick Music menu** — Game > Pick Music cycles through Ancient→Renaissance→Industrial→Modern
- Wonder completion videos — plays original .webm video for each of the 28 wonders
- High Council advisor screen — plays era-appropriate council video (Advisors > Consult High Council)
- Pillage order — military units can destroy tile improvements (Shift+P or context menu)
- Wait order (W key) — defer unit to later in the same turn, reactivates when all others processed
- Auto worker redistribution — new citizens auto-assigned to best tile on city growth, worst removed on shrink
- Auto-switch invalid production — cities automatically switch to next cheapest item when production becomes unavailable
- Airlift between cities — L key or context menu, requires Airport (improvement 32), one per city per turn
- Unload all cargo (U key) — unloads all units from a transport ship to adjacent land tiles
- Leonardo's Workshop auto-upgrade — all obsolete units upgraded on tech discovery (fixed from one-per-turn)
- Opening/Victory/Launch/Anarchy event videos — WINWIN.webm on victory, LAUNCH.webm on space win, ANARCHY0-2.webm on revolution
- Complete original MGE movie library: defeat (`LOSER`), all 21 animated diplomatic heralds, and original soundtracks restored to the opening, Wonder, Council, anarchy, launch, and victory movies
- Espionage actions: Investigate City, Sabotage Production, Poison Water Supply, Plant Nuclear Device
- Air unit rebase order (context menu), auto-return to base when fuel=1
- Keyboard shortcuts: Shift+T/L/S open Tax/Luxury/Science rate dialogs
- GameState now emits 'gameOver' event for all victory/defeat conditions
- TERRAIN constant exposed to test framework
- Customize World wizard — "Select Game Rules" step now offers "Customize World" with 4 sub-screens: World Age (3b/4b/5b), Temperature (cool/temperate/warm), Climate (arid/normal/wet), Landform (pangaea/continents/archipelago)
- MapGen temperature and age parameters — warm worlds produce more desert/jungle, young worlds produce more mountains
- City name labels — Civ2-authentic style: civ-colored banner with black size box and white text with shadow
- Minimap sunken bevel border — 3D inset frame matching Win95 style
- Fortress and airbase sprites from TERRAIN1.GIF (rows 7/9, col 7) with canvas fallback
- Hall of Fame — persistent top-10 high scores in localStorage, auto-saves on game over, accessible from title screen and World menu
- Original MGE World-screen artwork extracted from `Tiles.dll` for Civilization Score, Hall of Fame, and Top Five Cities
- Original MGE throne-room base and all period upgrade layers extracted from `pv.dll`
- Smarter AI production: wartime boost, size-aware improvements (Granary/Aqueduct/Sewer/SDI), naval builds
- Smarter AI movement: coordinated army targeting via `_aiPickArmyTarget()` — converge on nearest enemy city
- Smarter AI research: goal-directed chains (Republic=10, Gunpowder=12 in war), prerequisite bonuses
- Smarter AI diplomacy: AI-to-AI tech trading (30%/turn), alliance formation vs common enemy (20%/turn)
- Civ2 Save Import improvements: railroad, pollution, airbase tile parsing; wonders (39-66); war tracking; visibility
- Palace decoration system: 8 categories × 3 tiers, milestone-triggered offers (wonder/era), Win95 chooser dialog
- Scenario system: load .SCN/.SAV as scenarios, civ selection dialog, max turn limits, scenario metadata in saves
- Scenario events.txt parser and executor — 7 triggers (TURN, TURNINTERVAL, SCENARIOLOADED, RANDOMTURN, UNITKILLED, CITYTAKEN, RECEIVEDTECHNOLOGY) and 6 actions (TEXT, CREATEUNIT, CHANGEMONEY, GIVETECHNOLOGY, MAKEAGGRESSION, CHANGETERRAIN) with JUSTONCE modifier
- Barbarian ocean transport raids — Trireme with 1-2 warriors targets coastal cities after turn 20 (20% chance)
- Title screen "Begin Scenario" button enabled with file picker and civ chooser
- Playwright coverage expanded to 251 browser tests

### Changed
- The opening movie now preserves its full ultrawide frame instead of cropping it to the browser viewport; audible autoplay falls back to muted playback when required by browser policy
- Diplomacy negotiations now display the correct civilization's tall animated MGE herald beside the treaty controls
- Top Five Cities now uses its fixed 600×400 Egyptian mural report and authentic city sprites; the throne room composites the original Palace View artwork instead of procedural shapes
- Research and city-production selectors now use the compact MGE listbox geometry, native icons, original row facts, and the implicit OK button added by Civ2's popup parser
- Civilization Score now uses the original citizen mosaic, owned-Wonder icons, achievement breakdown, monumental backdrop, and full-width Close control
- The modern reconstructed title seal is retained while the surrounding title/wizard chrome follows the original MGE layout
- **Font system refactor** — replaced ~50 hardcoded font strings with `FONT` constants across 8 files
- **Import organization** — all mixins now import `FONT`, `FONT_ARIAL`, `FONT_TIMES` from `renderConstants.js`
- Roadmap rebuilt as v3 with Phase 3 audit-driven items (29 items across Audio, UI, Mechanics, Rendering, AI, Deployment)
- F-key advisor bindings fixed to match original Civ2 MGE order (F1=City Status, F2=Defense, F3=Foreign, F4=Attitude, F5=Trade, F6=Science)
- Menu labels updated: "City Status" (F1), "Defense Minister" (F2), "Foreign Minister" (F3)

### Fixed
- New-game city-style selection now persists into the civilization and save data, so choosing Medieval Castle visibly affects founded cities; world generation also shows immediate progress after OK
- City Info, Map, Happy, Rename, and View controls now perform their original roles; the non-MGE production queue and resource-map Reset button were removed from the city window
- Civilization scoring now follows MGE raw-score components: happy/content citizens, Wonders, spaceship, pollution, world peace, Future Technology, and barbarian activity; ordinary advances and difficulty no longer inflate the raw total
- World → Civilization Score now closes back to the map instead of incorrectly continuing into the retirement Hall of Fame sequence
- Retirement/score controls no longer throw from a missing sound-table import, and retired Hall of Fame entries use the actual leader and civilization names
- City production again renders the original accumulated-shield box instead of queue rows, including the correct unit/building icon treatment
- Research Goal now selects legal prerequisite advances, persists the route between discoveries, and can no longer grant an unavailable target directly
- Civilopedia restored the captured 640×400, nine-row, column-major advance picker with horizontal scrolling instead of the modern tab/detail dashboard
- Original MGE sidebar geometry restored: fixed 2×1 minimap pixels in a 148px panel, anchored status/unit panels, inner marble texture, 64×48 unit preview, light-colour shield, and 8×6 AI-turn marker
- Removed non-MGE movement range tint, hover diamonds, movement trails, banner, and custom war/log overlay from the rendered map while retaining mouse controls
- City screen once again renders after founding a city; missing `FONT`/`FONT_TIMES` imports had crashed both the city map sprite and city overlay render paths
- City screen restored as an undimmed floating MGE-sized window with marble texture, green resource map, gold section frames, and the original lighter blue production panel
- AI naval invasions now board before movement, keep cargo aboard at the home coast, sail to a reachable enemy approach tile, disembark through normal combat, and capture undefended coastal cities
- Combat units can capture undefended enemy cities by entering them; previously city capture only ran after defeating a defender
- Browser tests now fail on uncaught render-loop errors instead of silently passing while the canvas is broken
- Civilopedia detail and footer rendering no longer crashes on an undefined font alias
- Original MGE player-colour palette restored from `CITIES.GIF` (white/green/blue/yellow/cyan/orange/purple), including light front shields and dark stacked-unit shields
- City population badges and flags now use the original blue/orange marker pixels stored immediately outside each city sprite cell
- City-screen and city-style-wizard previews now use the same era/size/walls sprite coordinates as the original; Great Wall cities also render with walls
- City rendering no longer throws after a civilization learns an advance and its visual era is recalculated
- End-game territorial replay no longer throws while drawing unowned land
- City food storage now reads the canonical `foodBoxRows` cosmic rule
- City-screen and Domestic Advisor production no longer deduct unit support a second time; their shield totals now match the engine's post-support yield
- **Unit obsolescence data** — Fanatics, Partisans, and Transport now retain the `nil` obsolescence defined by MGE `RULES.TXT`, so learning their prerequisite no longer removes them from production
- **Roadmap accuracy** — marked ~10 items as complete that were already implemented
- Leonardo's Workshop: was using advance ID as unit type ID (bug); now finds proper successor unit
- `ud` undefined in `_unitMenuItems()` — airlift/rebase/pillage menu items crashed
- Opening video stall in headless browsers — added fallback timeout and done flag
- Opening video not dismissed when starting test game — `_resetWithGameState` now removes video overlay
- Test suite now drives the engine's seeded RNG for deterministic combat and goody-hut checks
- Title screen button coordinates updated to match actual panel size (280×292)
- Wizard step count corrected (10 steps including narrative screen)

## [0.5.0] - 2026-03-06

### Added
- Trade commodity system (16 commodities from RULES.TXT @CARAVAN)
- City governor auto-management toggle
- Palace view with 6-level procedural graphics
- Throne room with era-scaled decorations
- Wonder completion splash screen
- End-game replay map with territory animation
- Territory history snapshots (every 5 turns)
- 13 new Playwright tests

## [0.4.0] - 2026-03-06

### Added
- Tech tree "Leads to" connections in Civilopedia advances
- Win95 title bar for wizard and title screens
- Civ2 seal emblem finalized (Real-ESRGAN upscaled)
- CD music tracks (9 of 13 original tracks)
- Wizard and title screen visual overhaul
- Sidebar marble texture background

## [0.3.0] - 2026-03-05

### Fixed
- Chroma keys for unit and city sprites corrected
- Civ-coloured shield badge added to unit sprites

## [0.2.0] - 2026-03-05

### Added
- Unit stacking with shadow indicator and Tab cycling
- Civilopedia with 4 tabs and PEDIA text support
- Attitude Advisor (F5) with per-city happiness breakdown

## [0.1.0] - 2026-03-05

### Added
- Initial implementation of Civilization II MGE web clone
- Canvas 2D rendering with staggered-isometric grid
- xBRZ 2x sprite upscaling
- Full game engine: map generation, units, cities, combat, research, diplomacy
- 6 advisor screens (F1-F7)
- All 28 wonder effects
- Spaceship and diplomatic victory paths
- Nuclear mechanics with SDI defense
- Transport loading/unloading
- Paradrop, submarine stealth, ZOC enforcement
- Tax rate constraints with government-specific caps
- Barbarian spawning with difficulty scaling
- Terrain blending with dither masks
- Road/railroad/irrigation/mine sprites
- Resource icons from ICONS.GIF
- City style variants by era
- Score formula matching axx0 reference
- Save/load to localStorage
- 167 Playwright tests
