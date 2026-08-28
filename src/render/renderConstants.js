/**
 * Shared rendering constants used by MapRenderer and its mixins.
 * Extracted to avoid circular imports between mixin files.
 */

import { TILE_W_S, TILE_H_S } from '../utils/IsoMath.js';

// Civ2 MGE player colours sampled from CITIES.GIF, matching
// Civ2GoldInterface.LoadPlayerColours(). Slot 0 belongs to the barbarians;
// normal civilizations use slots 1-7.
export const CIV_TEXT_COLORS = [
  '#f30000', // 0 barbarian red
  '#ffffff', // 1 white
  '#6fdb33', // 2 green
  '#0073ff', // 3 blue
  '#ffff00', // 4 yellow
  '#3fbbc7', // 5 cyan
  '#f3b707', // 6 orange
  '#b793ff', // 7 purple
  '#d37b2f', // 8 neutral/brown
];

export const CIV_LIGHT_COLORS = [
  '#f30000', '#efefef', '#57ab27', '#4b5fb7', '#ffff00',
  '#37afbf', '#eb830b', '#8367b3', '#97571f',
];

export const CIV_DARK_COLORS = [
  '#a70000', '#afafaf', '#17530b', '#070b67', '#f3b707',
  '#1f7b93', '#e3530f', '#6f3f87', '#5b330f',
];

// Most existing call sites draw player-coloured text or map markers.
export const CIV_COLORS = CIV_TEXT_COLORS;

// Unit sprite dimensions (upscaled)
export const UNIT_W_S = TILE_W_S;          // 128
export const UNIT_H_S = TILE_H_S * 1.5;   // 96

// Layout constants
export const TITLE_H = 20;               // Windows-style title bar
export const MENU_H  = 22;               // Menu bar below title
export const TOP_H   = TITLE_H + MENU_H; // Total chrome height (42px)
export const SB_W    = 250;              // Right sidebar width (canvas px)

// Color constants
export const CLR_HEADER_SHADOW = '#878787';
export const CLR_LABEL_SHADOW  = '#bfbfbf';

export const FONT_ARIAL = "'Tahoma','Arial','Arimo',sans-serif";
export const FONT_TIMES = "'Times New Roman','Tinos',Times,serif";

export const FONT = {
  HEADER:        `bold 28px ${FONT_TIMES}`,
  HEADER_SMALL:  `bold 20px ${FONT_TIMES}`,
  BUTTON:        `20px ${FONT_TIMES}`,
  MENU:          `14px ${FONT_ARIAL}`,
  LABEL:         `14px ${FONT_ARIAL}`,
  LABEL_BOLD:    `bold 14px ${FONT_ARIAL}`,
  BODY:          `12px ${FONT_ARIAL}`,
  BODY_SMALL:    `11px ${FONT_ARIAL}`,
  BODY_ITALIC:   `italic 12px ${FONT_ARIAL}`,
  STATUS:        `bold 16px ${FONT_TIMES}`,
  CITY_NAME:     `bold 16px ${FONT_ARIAL}`,
  UNIT_LABEL:    `12px ${FONT_ARIAL}`,
  LOG:           `12px ${FONT_ARIAL}`,
  POPUP:         `14px ${FONT_TIMES}`,
  // Additional sizes for UI elements
  TINY:          `8px ${FONT_ARIAL}`,
  TINY_BOLD:     `bold 8px ${FONT_ARIAL}`,
  SMALL:         `9px ${FONT_ARIAL}`,
  SMALL_BOLD:    `bold 9px ${FONT_ARIAL}`,
  SMALL_ITALIC:  `italic 11px ${FONT_ARIAL}`,
  BODY_BOLD:     `bold 12px ${FONT_ARIAL}`,
  BODY_ITALIC:   `italic 12px ${FONT_ARIAL}`,
  BODY_TIMES:    `12px ${FONT_TIMES}`,
  BODY_TIMES_BOLD: `bold 12px ${FONT_TIMES}`,
  LABEL_TIMES:   `13px ${FONT_TIMES}`,
  LABEL_TIMES_BOLD: `bold 13px ${FONT_TIMES}`,
  MENU_BOLD:     `bold 14px ${FONT_TIMES}`,
  MENU_ITALIC:   `italic 14px ${FONT_TIMES}`,
  TITLE:         `bold 17px ${FONT_TIMES}`,
  TITLE_LARGE:   `bold 18px ${FONT_TIMES}`,
  TITLE_XLARGE:  `bold 22px ${FONT_TIMES}`,
  TITLE_HUGE:    `bold 34px ${FONT_ARIAL}`,
  POPUP_TITLE:   `bold 11px ${FONT_TIMES}`,
  POPUP_TITLE_TIMES: `bold 11px ${FONT_TIMES}`,
  LABEL_TIMES_ARIAL: `13px ${FONT_ARIAL}`,
  LABEL_TIMES_ARIAL_BOLD: `bold 13px ${FONT_ARIAL}`,
  LABEL_TIMES_PLAIN: `13px ${FONT_TIMES}`,
  TINY_TIMES:    `bold 10px ${FONT_TIMES}`,
  SHADOW_COLOR:  CLR_HEADER_SHADOW,
  LABEL_SHADOW:  CLR_LABEL_SHADOW,
};

// Standard dialog padding (axx0 Civ2GoldInterface.cs: 11px sides, 7+header top, 46px footer, 10px no-footer)
export const DIALOG_PAD = { side: 11, top: 7, footer: 46, noFooter: 10 };

// WIN95 color palette constants
export const CLR = {
  WIN95_FACE:       '#c0c0c0',
  WIN95_LIGHT:      '#ffffff',
  WIN95_SHADOW:     '#808080',
  WIN95_DARK_SHADOW:'#404040',
  WIN95_LIGHT_EDGE: '#dfdfdf',
  WIN95_DARK_EDGE:  '#434343',
  WIN95_HIGHLIGHT:  '#000080',
  WIN95_HIGHLIGHT_TEXT: '#ffffff',
  WIN_COLOR:        '#006600',
  LOSS_COLOR:       '#880000',
  BEVEL_1_LIGHT:    '#e3e3e3',
  BEVEL_1_DARK:     '#696969',
  BEVEL_2_LIGHT:    '#ffffff',
  BEVEL_2_DARK:     '#a0a0a0',
  BEVEL_3:          '#f0f0f0',
  BEVEL_4:          '#dfdfdf',
  BEVEL_5:          '#434343',
  // Game UI colors
  GOLD:             '#dfbb3f',  // section heading gold (RGB 223,187,63)
  HEADER_SHADOW:    '#434343',  // heading drop-shadow
  TEXT_SHADOW:      '#000000',  // default text shadow
  // Minimap colors
  MM_OCEAN:         '#00005f',  // minimap ocean
  MM_LAND:          '#377b17',  // minimap land
};

// Shield flag pixel offsets per unit type (at 1× scale; multiply by 2 for screen coords)
// Indices match UNITS[typeId].
export const UNITS_FLAG_LOCS = [
  [12,12],[15,15],[13,15],[12,12],[10,11],[40,13],[41,11],[40,10],[12,13], // 0-8
  [17, 9],[38, 7],[11,11],[14, 5],[15, 6],[34, 6],[13, 5],[42,13],[48, 6], // 9-17
  [12, 6],[40, 5],[18, 5],[39, 4],[ 6, 9],[11, 7],[ 9,12],[21, 8],[17, 5], // 18-26
  [46, 8],[38, 5],[41,13],[16, 7],[39, 8],[10, 9],[38, 3],[ 5, 6],[ 8, 8], // 27-35
  [18, 5],[24, 4],[20, 9],[15,13],[ 6,13],[29, 2],[13,13],[32, 2],[38,23], // 36-44
  [34, 9],[16,14],[37,15],[13,14],[15, 8],[14,10],[10, 9],[29, 7],[ 2,17], // 45-53
  [12, 8],[12, 8],[12, 8],[12, 8],[12, 8],[12, 8],[12, 8],[12, 8],[12, 8], // 54-62
];
