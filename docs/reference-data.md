# Reference Data

Lookup tables extracted from codebase. Canonical source is always the code itself.

## Key Constants

| Constant | Value | Notes |
|---|---|---|
| `TILE_W` | 64 | upscaled tile width (px) |
| `TILE_H` | 32 | upscaled tile height (px) |
| `SCALE` | 2 | xBRZ scale factor |

Staggered-isometric grid: odd rows shift right by `TILE_W/2`.

## Sprite Sheet Coordinates

Source: `axx0/Civ2-clone` `Civ2GoldInterface.cs` (GPL-3.0).
Formula: `srcX = offsetX + col*(cellW+gapX)`, `srcY = offsetY + row*(cellH+gapY)`

| Sheet key | cellW | cellH | offsetX | offsetY | gapX | gapY |
|---|---|---|---|---|---|---|
| `units` | 64 | 48 | 1 | 1 | 1 | 1 |
| `cities` | 64 | 48 | 1 | 39 | 1 | 1 |
| `citiesWalled` | 64 | 48 | 334 | 39 | 1 | 1 |
| `terrain` | 64 | 32 | 1 | 1 | 1 | 1 |
| `people` | 27 | 30 | 2 | 6 | 1 | 1 |

Chroma keys: magenta `[255,0,255]` for units/cities; grey `[135,135,135]` + green `[0,255,0]` for terrain2.

## Domain Values (UNITS[].domain)

| Value | Meaning |
|---|---|
| 0 | Land |
| 1 | Air |
| 2 | Sea |

## Terrain Improvement Build Keys (Settler only)

| Key | Action |
|---|---|
| R | Build road |
| L | Build railroad (requires road first) |
| I | Irrigate |
| M | Mine |

Press again while building to cancel. Also via Orders menu and unit context menu.

## Wonder IDs (IMPROVEMENTS[39-66])

Notable implemented effects:

| ID | Name | Effect |
|---|---|---|
| 39 | Pyramids | Free Granary in all cities + new cities |
| 44 | Oracle | Temple pacifies 2 unhappy (instead of 1) |
| 45 | Great Wall | All civ cities count as having City Walls |
| 46 | Sun Tzu's War Academy | All civ cities get Barracks veteran bonus |
| 49 | Michelangelo's Chapel | Cathedral effect (−3 unhappy) in all civ cities |
| 50 | Copernicus' Observatory | 2× trade in that city (pre-corruption) |
| 52 | Shakespeare's Theatre | 0 unhappy in that city |
| 54 | J. S. Bach's Cathedral | +2 content in all civ cities |
| 55 | Isaac Newton's College | 2× science beakers from that city |
| 56 | Adam Smith's Trading Co. | Skip upkeep=1 improvements |
| 57 | Darwin's Voyage | 2 free random advances on completion |
| 58 | Statue of Liberty | Instant government change (no anarchy) |
| 60 | Women's Suffrage | Halve military unhappiness (Republic/Democracy) |
| 61 | Hoover Dam | Free Hydro Plant effect for all civ cities |
| 66 | Cure for Cancer | +1 content in all civ cities |

## City Screen Layout

Source: axx0 `Civ2Interface.cs` and `ProductionBox.cs`, checked against the running MGE executable.

Virtual 640×446 canvas: a 24px web window/title allowance plus Civ2's 640×421 inner city layout. It is scaled uniformly and centered without dimming the map.

| Area | Inner Civ2 rectangle |
|---|---|
| Citizens | `3,2,433,44` |
| Resource map | `7,65,188,137` |
| Food storage | `437,0,195,163` |
| Production | `437,165,195,191` |
| Units supported | `7,215,184,69` |
| Info / support map / happiness | `193,215,242,198` |
| City improvements | `5,306,170,108` |

City map panel (left col): click a BFC tile to toggle manual tile assignment.
The production Change dialog uses `Game.txt @PRODUCTION`: width 440, 13 rows, one combined unit/improvement list, then Auto, Help, and the parser-supplied OK button. The blue production panel contains accumulated shields only; there is no production-queue UI in MGE.

## Research and Civilopedia Dialogs

- `@RESEARCH`: width 300, up to 16 rows at 23px, 36×20 advance icons, Help, Goal, and parser-supplied OK.
- `@RESEARCHGOAL`: width 480, 10-row listbox, Help and parser-supplied OK. A goal selects currently legal prerequisite steps and remains active until reached.
- Captured MGE advance index: 640×400 rendered dialog, 9 rows per column, column-major ordering, two visible columns, horizontal scrollbar, and Info / Tree / Close footer.
- Detail source titles come from `PEDIA.TXT`; narratives load from the original `PEDIA/*.PDE` files.

## Civilization Score and World-Screen Artwork

The original upper-left 600×400 image regions are extracted from the bundled MGE `Tiles.dll`; the remaining 40px right and 80px bottom areas are red chroma-key padding.

| Screen | PE GIF resource | Offset | Length | Runtime asset |
|---|---:|---:|---:|---|
| Hall of Fame | 57 | `0x7B96C` | `0xB9E0` | `hallOfFameBack.gif` |
| Top Five Cities | 58 | `0x8734C` | `0x12ACC` | `top5Back.gif` |
| Civilization Score | 59 | `0x99E18` | `0xB823` | `scoreBack.gif` |

The throne room is reconstructed from the bundled `pv.dll`: resource 100 is
the 640×480 base room and resources 105–143 contain eight groups of four
period layers. The extraction removes the original cyan and blue palette keys
before the PNG layers are composited in the browser.

`GameState.scoreBreakdown()` follows the MGE raw score shown by F9: happy citizens are worth 2, content citizens and specialists 1, Wonders 20, Future Technology 5, polluted tiles −10, world peace 3 per completed turn capped at 100, barbarian activity −50/−25/0/+25, and a complete landed spaceship 400. Difficulty affects the displayed civilization rating rather than the raw total; ordinary advances do not score.

## Save / Load

`GameState.toSaveData()` / `static fromSaveData(data)` → JSON to `localStorage`.
Save version: `1`. All fields including `manualWorked`, `buildTask`, `railroad` are serialized.

## Original MGE Movies

The browser library contains all 59 original MGE AVI movies transcoded to
WebM: 28 Wonders, the opening, victory, launch, defeat, three anarchy eras,
three High Council eras, and 21 civilization heralds. Movies with original
PCM soundtracks use Opus audio; `LOSER.AVI` and the herald AVIs are silent in
the source installation. `tools/extract-assets.sh` preserves an existing VP9
video stream when only its previously omitted soundtrack needs to be restored.

Herald ids follow `RULES.TXT @LEADERS` / `CIVS`: ROM, BAB, GER, EGY, AME,
GRE, IND, RUS, ZUL, FRE, AZT, CHI, ENG, MON, CEL, JAP, VIK, SPA, PER, CAR,
and SIO.

## Map File Format (.MP)

Header: 98 bytes. Bytes 0-1 = `uint16 rawCols`, bytes 2-3 = `uint16 rows`.
Tiles: 6 bytes each, count = `(rawCols/2) × rows`.
- `byte[0] bits 0-3`: terrain row (0=Desert … 10=Ocean)
- `byte[0] bit 7` (0x80): special resource present
- `byte[2] bit 5` (0x20): river present
- `byte[4]`: mirrors byte[0]
