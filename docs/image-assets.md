# Image Assets

The runtime images in `public/sprites/extracted/intro/` are used for the title screen, new game wizard backgrounds, and the Civ2 seal emblem. Only the two high-resolution seal files actually requested by the browser remain in `hires/`; local comparison and extraction material is excluded from the public tree.

## Sourcing Strategy

The original Civ2 MGE shipped with 13 intro/background images at low resolution (~583x257 or ~406x258 pixels). For this browser recreation, we replaced each with the highest-quality version available:

1. **Original source photos/artwork** — where the original Civ2 image could be identified as a real photograph or historical artwork, we sourced the actual high-resolution original from Wikimedia Commons, NASA, or the Library of Congress.
2. **AI upscaling** — where the original source could not be identified (engravings, composite images), we upscaled the extracted Civ2 originals using [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) (x4plus model, 4x scale factor), then resized to 1920px wide.

## Intro/Background Images

| Image | Resolution | Source | Method | License |
|-------|-----------|--------|--------|---------|
| `sinaiPic` | 1920x1150 | NASA Gemini 11 photo s66-54893 — Sinai Peninsula from orbit | Original hi-res source | Public domain (NASA) |
| `stPeterburgPic` | 1920x848 | Truscott Map of St. Petersburg, 1753 | Original hi-res source | Public domain |
| `templePic` | 1920x848 | Gate of Divine Might, Forbidden City, Beijing | Original hi-res source | CC-BY-SA (Wikimedia) |
| `mingGeneralPic` | 1920x846 | Ming Tombs Sacred Way stone general statue | Original hi-res source | CC-BY (Wikimedia) |
| `canyonPic` | 1920x1220 | Grand Canyon South Rim, near Tusayan | Original hi-res source | CC-BY-SA (Wikimedia) |
| `desertPic` | 1920x1219 | Overcast Monument Valley panorama | Original hi-res source | CC-BY-SA (Wikimedia) |
| `snowPic` | 1920x1220 | Peyto Lake, Banff National Park, Canada | Original hi-res source | CC-BY-SA (Wikimedia) |
| `galleyPic` | 1920x848 | Original Civ2 engraving (ship/galley scene) | AI upscaled (Real-ESRGAN x4plus) | Original (MicroProse) |
| `ancientPersonsPic` | 1920x846 | Original Civ2 engraving (ancient figures) | AI upscaled (Real-ESRGAN x4plus) | Original (MicroProse) |
| `barbariansPic` | 1920x846 | Original Civ2 engraving (barbarian warriors) | AI upscaled (Real-ESRGAN x4plus) | Original (MicroProse) |
| `peoplePic1` | 1920x848 | Original Civ2 engraving (people scene 1) | AI upscaled (Real-ESRGAN x4plus) | Original (MicroProse) |
| `peoplePic2` | 1920x848 | Original Civ2 engraving (people scene 2) | AI upscaled (Real-ESRGAN x4plus) | Original (MicroProse) |
| `islandPic` | 1920x1220 | Original Civ2 photograph (tropical island) | AI upscaled (Real-ESRGAN x4plus) | Original (MicroProse) |

## Civ2 Seal Emblem

| Image | Resolution | Source | Method | License |
|-------|-----------|--------|--------|---------|
| `backgroundImage` | 2120x1920 | Extracted from original `Tiles.dll` (offset 0xF7454) — the "In Omnia Paratus" seal with Athena figure | Edge-aware denoise (PIL median filter preserving text/edges) → AI upscaled (Real-ESRGAN x4plus 4x) → background color-matched to game tan (#8F7B63) with smooth edge blending | Original (MicroProse) |

## AI Upscaling Process

For images where the original high-resolution source could not be found, we used the following pipeline:

1. **Extract** the original low-res image from Civ2 game files (Intro.dll, Tiles.dll)
2. **Pre-process** (seal only): edge-aware denoising using PIL — a local variance map preserves text and fine detail while smoothing flat areas that contain GIF compression noise
3. **Upscale** using [Real-ESRGAN ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN) v0.2.5.0 with the `realesrgan-x4plus` model at 4x scale
4. **Post-process** (seal only): replace near-background pixels with exact target color (#8F7B63), blend edge pixels for smooth transition into the game background
5. **Resize** to 1920px wide (intro images) or keep at native 4x resolution (seal)

## Music

The 24 gameplay tracks and original menu track requested by the audio manager are stored as MP3 files in `public/Music/`. Unused duplicate music, standalone event audio superseded by the original movie soundtracks, and comparison encodes are not part of the runtime allow-list. Gameplay tracks are assigned to three eras:

| Era | Tracks |
|-----|--------|
| Ancient (before 1 AD) | 7 tracks |
| Renaissance (1 AD–1500) | 7 tracks |
| Modern (1500+) | 10 tracks |

Tracks cycle automatically within each era. The title screen uses the original Civilization II menu track.
