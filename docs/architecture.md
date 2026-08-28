# Architecture

The project is a static, client-side application. It has no account system,
server API, analytics pipeline, or database.

## Entry points

- `index.html` is the public project page.
- `game.html` presents the ownership attestation.
- `src/gate.js` loads `src/main.js` only after the attestation is accepted.
- `src/main.js` creates the renderer, sprite manager, audio manager, and game
  state, then opens the original MGE title screen.

The gate is deliberately ahead of the game module. MGE-derived sprites,
audio, Pedia files, and movies are not requested while the terms screen is
waiting for acceptance.

## Game structure

- `src/engine/` owns maps, turns, units, cities, civilizations, research,
  diplomacy, combat, AI, scenarios, and save/load.
- `src/render/` owns Canvas 2D drawing and input. `MapRenderer` installs
  focused rendering mixins for the map, dialogs, city screen, advisors,
  Civilopedia, and setup wizard.
- `src/data/` contains independently encoded MGE rules data.
- `src/audio/` manages short effects and streaming background music.
- `src/utils/assets.js` makes every public-file request work from both `/` in
  development and `/civ2/` on GitHub Pages.

## Static assets

`public/` is an explicit runtime allow-list. It must never be replaced with a
copy of an installation directory. Original executables, DLLs, saves, logs,
source movies, duplicate extractions, and private references belong under an
ignored `reference-local/` directory.

The production build is a static `dist/` directory suitable for any ordinary
file host. GitHub Pages uses the second Vite entry point and `/civ2/` base.
