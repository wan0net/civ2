import { TERRAIN } from '../data/terrain.js';
import { CIVS } from '../data/civs.js';
import { UNITS } from '../data/units.js';

const MGE_VERSION = 40;

const OPTIONS_OFFSET = 12;
const PARAMS_OFFSET = 24;
const TECHS_OFFSET = 66;
const WONDERS_OFFSET = 266;
const CIV_NAMES_OFFSET = WONDERS_OFFSET + 318;

const CIV_OFFSET = 2278;
const CIV_SIZE = 1428;
const NO_ADVANCES = 100;

const MAP_OFFSET = 13702;
const UNIT_SIZE = 32;
const CITY_SIZE = 88;

const TERRAIN_ROW_BY_ID = Object.fromEntries(
  Object.values(TERRAIN).map((t) => [t.id, t.sheetRow])
);

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function writeU16(view, offset, value) {
  view.setUint16(offset, value & 0xffff, true);
}

function writeI16(view, offset, value) {
  view.setInt16(offset, value, true);
}

function writeAscii(bytes, offset, maxLen, text) {
  const s = (text ?? '').toString();
  for (let i = 0; i < maxLen; i++) {
    bytes[offset + i] = i < s.length ? (s.charCodeAt(i) & 0x7f) : 0;
  }
}

function cityCoord(col, row) {
  return { x: 2 * col + (row % 2), y: row };
}

function prodToSavByte(production) {
  if (!production) return 0xff;
  if (production.type === 'unit') return clamp(production.id ?? 0, 0, 127);
  if (production.type === 'improvement') return (~(production.id ?? 0)) & 0xff;
  return 0xff;
}

function relationToTreatyByte(relation) {
  if (relation === 'alliance') return (1 << 0) | (1 << 2) | (1 << 3);
  if (relation === 'peace') return (1 << 0) | (1 << 2);
  if (relation === 'ceasefire') return (1 << 0) | (1 << 1);
  return 0;
}

function unitOrderByte(status) {
  if (status === 'fortified') return 0;
  if (status === 'sentry' || status === 'sleep') return 1;
  return 2;
}

export function exportCiv2Sav(gameState) {
  const cols = gameState.mapCols;
  const rows = gameState.mapRows;
  const mapArea = cols * rows;
  const mapXdimX2 = cols * 2;
  const mapYdim = rows;
  const mapLocatorX = cols;
  const mapLocatorY = Math.ceil(rows / 4);

  const numberOfUnits = gameState.units.length;
  const numberOfCities = gameState.cities.length;

  const offsetB1 = MAP_OFFSET + 14;
  const offsetB2 = offsetB1 + 7 * mapArea;
  const offsetUb1 = offsetB2 + 6 * mapArea;
  const offsetUb2 = offsetUb1 + 2 * mapLocatorX * mapLocatorY;
  const offsetU = offsetUb2 + 1024;
  const offsetC = offsetU + UNIT_SIZE * numberOfUnits;
  const tailSlack = 8192;
  const totalBytes = offsetC + CITY_SIZE * numberOfCities + tailSlack;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  bytes[10] = MGE_VERSION;

  bytes[OPTIONS_OFFSET + 0] = 0x10;
  bytes[OPTIONS_OFFSET + 2] = (1 << 3) | (1 << 4);

  writeU16(view, PARAMS_OFFSET + 4, clamp(gameState.turn ?? 1, 1, 0xffff));
  bytes[PARAMS_OFFSET + 15] = 1;
  bytes[PARAMS_OFFSET + 19] = 0;
  bytes[PARAMS_OFFSET + 20] = clamp(gameState.difficulty ?? 1, 0, 5);

  const savToOurCiv = new Array(8).fill(-1);
  savToOurCiv[1] = 0;
  for (let savId = 2; savId <= 7; savId++) {
    const ourId = savId - 1;
    if (ourId < gameState.civs.length) savToOurCiv[savId] = ourId;
  }
  const ourToSavCiv = new Map();
  savToOurCiv.forEach((ourId, savId) => {
    if (ourId >= 0) ourToSavCiv.set(ourId, savId);
  });

  let civsInPlayBits = 0;
  let humanPlayersBits = 0;
  humanPlayersBits |= (1 << 1);
  for (let savId = 1; savId <= 7; savId++) {
    const ourId = savToOurCiv[savId];
    const civ = ourId >= 0 ? gameState.civs[ourId] : null;
    if (civ?.alive !== false) civsInPlayBits |= (1 << savId);
  }
  bytes[PARAMS_OFFSET + 22] = civsInPlayBits;
  bytes[PARAMS_OFFSET + 23] = humanPlayersBits;
  writeU16(view, PARAMS_OFFSET + 34, numberOfUnits);
  writeU16(view, PARAMS_OFFSET + 36, numberOfCities);

  const techDiscovery = new Uint8Array(NO_ADVANCES).fill(0);
  for (let techId = 0; techId < NO_ADVANCES; techId++) {
    let discoveredBy = 0;
    for (let savId = 1; savId <= 7; savId++) {
      const ourId = savToOurCiv[savId];
      const civ = ourId >= 0 ? gameState.civs[ourId] : null;
      if (civ?.advances?.has(techId)) {
        discoveredBy = savId;
        break;
      }
    }
    techDiscovery[techId] = discoveredBy;
  }
  bytes.set(techDiscovery, TECHS_OFFSET);
  for (let techId = 0; techId < NO_ADVANCES; techId++) {
    let mask = 0;
    for (let savId = 0; savId < 8; savId++) {
      const ourId = savToOurCiv[savId];
      const civ = ourId >= 0 ? gameState.civs[ourId] : null;
      if (civ?.advances?.has(techId)) mask |= (1 << savId);
    }
    bytes[TECHS_OFFSET + NO_ADVANCES + techId] = mask;
  }

  for (let i = 0; i < 28; i++) writeI16(view, WONDERS_OFFSET + 2 * i, -1);

  for (let savId = 1; savId <= 7; savId++) {
    const ourId = savToOurCiv[savId];
    const civ = ourId >= 0 ? gameState.civs[ourId] : null;
    const block = CIV_NAMES_OFFSET + (savId - 1) * 242;
    const civData = civ?.data ?? CIVS[(savId - 1) % CIVS.length];
    bytes[block + 0] = clamp(civ?.cityStyle ?? civData?.cityStyle ?? 1, 0, 3);
    writeAscii(bytes, block + 2, 24, civData?.leader ?? 'Leader');
    writeAscii(bytes, block + 26, 24, civData?.plural ?? 'Civilization');
    writeAscii(bytes, block + 50, 24, civData?.adjective ?? 'Civilized');
  }

  const cityIndexById = new Map(gameState.cities.map((c, idx) => [c.id, idx]));

  for (let savId = 0; savId < 8; savId++) {
    const ourId = savToOurCiv[savId];
    const civ = ourId >= 0 ? gameState.civs[ourId] : null;
    const base = CIV_OFFSET + CIV_SIZE * savId;

    if (!civ) {
      bytes[base + 10] = 0xff;
      continue;
    }

    const civData = civ.data ?? CIVS[0];
    const tribeId = clamp(civData?.id ?? (ourId % CIVS.length), 0, CIVS.length - 1);
    const sciRate = clamp(Math.round((civ.sciRate ?? 50) / 10), 0, 10);
    const taxRate = clamp(Math.round((civ.taxRate ?? 50) / 10), 0, 10);
    const govt = clamp(civ.government ?? 1, 0, 6);

    bytes[base + 1] = civ.femaleLeader ? 2 : 0;
    writeU16(view, base + 2, clamp(civ.gold ?? 0, 0, 0xffff));
    bytes[base + 6] = tribeId;
    writeU16(view, base + 8, clamp(civ.beakers ?? 0, 0, 0xffff));
    bytes[base + 10] = (civ.currentResearch == null) ? 0xff : clamp(civ.currentResearch, 0, NO_ADVANCES - 1);
    bytes[base + 16] = clamp(civ.advances?.size ?? 0, 0, 255);
    bytes[base + 17] = clamp(civ.futureTechCount ?? 0, 0, 255);
    bytes[base + 19] = sciRate;
    bytes[base + 20] = taxRate;
    bytes[base + 21] = govt;
    bytes[base + 30] = clamp(civ.reputation ?? 50, 0, 255);

    for (let otherSav = 0; otherSav < 8; otherSav++) {
      const otherOur = savToOurCiv[otherSav];
      const rel = otherOur >= 0 ? (civ.relations?.get(otherOur) ?? 'peace') : 'peace';
      const treaty = relationToTreatyByte(rel);
      bytes[base + 32 + 4 * otherSav + 0] = treaty;
      if (rel === 'war') bytes[base + 32 + 4 * otherSav + 1] |= (1 << 5);

      const attitudeRaw = otherOur >= 0 ? (civ.attitude?.get(otherOur) ?? 0) : 0;
      bytes[base + 64 + otherSav] = clamp(100 + attitudeRaw, 0, 255);
    }

    for (let block = 0; block < 13; block++) {
      let advMask = 0;
      for (let bi = 0; bi < 8; bi++) {
        const advId = block * 8 + bi;
        if (advId >= NO_ADVANCES - 1) continue;
        if (civ.advances?.has(advId)) advMask |= (1 << bi);
      }
      bytes[base + 88 + block] = advMask;
    }

    const civUnits = gameState.units.filter((u) => u.civId === ourId);
    const civCities = gameState.cities.filter((c) => c.civId === ourId);
    writeU16(view, base + 102, clamp(civUnits.length, 0, 0xffff));
    writeU16(view, base + 104, clamp(civCities.length, 0, 0xffff));
    const sumCitySizes = civCities.reduce((sum, c) => sum + clamp(c.size ?? 1, 1, 255), 0);
    writeU16(view, base + 108, clamp(sumCitySizes, 0, 0xffff));
  }

  const wonderOwnerCity = new Array(28).fill(-1);
  for (let i = 0; i < gameState.cities.length; i++) {
    const city = gameState.cities[i];
    for (const impId of city.improvements ?? []) {
      if (impId >= 39 && impId <= 66) {
        const wonderIdx = impId - 39;
        if (wonderOwnerCity[wonderIdx] === -1) wonderOwnerCity[wonderIdx] = i;
      }
    }
  }
  for (let i = 0; i < wonderOwnerCity.length; i++) {
    writeI16(view, WONDERS_OFFSET + 2 * i, wonderOwnerCity[i]);
  }

  writeU16(view, MAP_OFFSET + 0, mapXdimX2);
  writeU16(view, MAP_OFFSET + 2, mapYdim);
  writeU16(view, MAP_OFFSET + 4, mapArea);
  writeU16(view, MAP_OFFSET + 8, 0);
  writeU16(view, MAP_OFFSET + 10, mapLocatorX);
  writeU16(view, MAP_OFFSET + 12, mapLocatorY);

  const unitsByTile = new Map();
  for (const u of gameState.units) {
    unitsByTile.set(`${u.col},${u.row}`, true);
  }
  const citiesByTile = new Map();
  for (const c of gameState.cities) {
    citiesByTile.set(`${c.col},${c.row}`, true);
  }

  for (let civNo = 0; civNo < 7; civNo++) {
    for (let i = 0; i < mapArea; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const t = gameState._tileImprovements?.[row]?.[col] ?? {};
      let b = 0;
      if (unitsByTile.get(`${col},${row}`)) b |= (1 << 0);
      if (citiesByTile.get(`${col},${row}`)) b |= (1 << 1);
      if (t.irrigation || t.farmland) b |= (1 << 2);
      if (t.mine || t.farmland) b |= (1 << 3);
      if (t.road || t.railroad) b |= (1 << 4);
      if ((t.railroad && (t.road || t.railroad))) b |= (1 << 5);
      if (t.fortress || t.airbase) b |= (1 << 6);
      if (t.pollution) b |= (1 << 7);
      bytes[offsetB1 + civNo * mapArea + i] = b;
    }
  }

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const i = row * cols + col;
      const base = offsetB2 + i * 6;
      const terrain = gameState.tiles?.[row]?.[col];
      const terrainRow = TERRAIN_ROW_BY_ID[terrain?.id] ?? TERRAIN.OCEAN.sheetRow;
      const hasRiver = (gameState._rivers?.[row]?.[col] ?? 0) !== 0;
      const hasResource = (gameState._resources?.[row]?.[col] ?? -1) >= 0;

      let b0 = terrainRow & 0x0f;
      if (hasResource) b0 |= (1 << 6);
      if (hasRiver) b0 |= (1 << 7);
      bytes[base + 0] = b0;

      const t = gameState._tileImprovements?.[row]?.[col] ?? {};
      const hasCity = citiesByTile.get(`${col},${row}`) === true;
      let b1 = 0;
      if (unitsByTile.get(`${col},${row}`)) b1 |= (1 << 0);
      if (hasCity) b1 |= (1 << 1);
      if (t.irrigation || t.farmland) b1 |= (1 << 2);
      if (t.mine || t.farmland) b1 |= (1 << 3);
      if (t.road || t.railroad) b1 |= (1 << 4);
      if (t.railroad && (t.road || t.railroad)) b1 |= (1 << 5);
      if (t.airbase || t.fortress) b1 |= (1 << 6);
      if (t.pollution) b1 |= (1 << 7);
      bytes[base + 1] = b1;

      bytes[base + 2] = 0;
      bytes[base + 3] = 0;

      const vis = gameState._visibility?.[row]?.[col] ?? 0;
      if (vis > 0) bytes[base + 4] = (1 << 1);
      else bytes[base + 4] = 0;

      bytes[base + 5] = 0;
    }
  }

  for (let i = 0; i < numberOfUnits; i++) {
    const u = gameState.units[i];
    const base = offsetU + UNIT_SIZE * i;
    const c2 = cityCoord(u.col, u.row);
    const def = UNITS[u.typeId] ?? { move: 1, hp: 1 };
    const maxMovesSav = Math.max(1, def.move ?? 1);
    const movesSav = clamp(Math.floor((u.movesLeft ?? 0) / 3), 0, maxMovesSav);
    const moveLost = clamp((maxMovesSav - movesSav) * 3, 0, 255);
    const maxHpSav = Math.max(1, def.hp ?? 1);
    const hpSav = clamp(Math.ceil((u.hp ?? maxHpSav) / 10), 1, maxHpSav);
    const hpLost = clamp(maxHpSav - hpSav, 0, 255);
    const ownerSav = ourToSavCiv.get(u.civId) ?? 0;

    writeU16(view, base + 0, c2.x);
    writeU16(view, base + 2, c2.y);
    bytes[base + 5] = u.veteran ? (1 << 5) : 0;
    bytes[base + 6] = clamp(u.typeId ?? 0, 0, 255);
    bytes[base + 7] = clamp(ownerSav, 0, 7);
    bytes[base + 8] = moveLost;
    bytes[base + 9] = (1 << clamp(ownerSav, 0, 7));
    bytes[base + 10] = hpLost;
    bytes[base + 11] = 0xff;

    if (u.buildTask) bytes[base + 13] = clamp(u.buildTask.turnsLeft ?? 0, 0, 255);

    bytes[base + 15] = unitOrderByte(u.status);

    const homeIdx = (u.homeCity == null) ? 0xff : (cityIndexById.get(u.homeCity) ?? 0xff);
    bytes[base + 16] = clamp(homeIdx, 0, 255);

    const goto = u.gotoTarget ?? { col: u.col, row: u.row };
    const gotoC2 = cityCoord(goto.col, goto.row);
    writeU16(view, base + 18, gotoC2.x);
    writeU16(view, base + 20, gotoC2.y);
    writeU16(view, base + 22, 0xffff);
    writeU16(view, base + 24, 0xffff);
  }

  for (let i = 0; i < numberOfCities; i++) {
    const c = gameState.cities[i];
    const base = offsetC + CITY_SIZE * i;
    const c2 = cityCoord(c.col, c.row);
    const ownerSav = ourToSavCiv.get(c.civId) ?? 0;

    writeU16(view, base + 0, c2.x);
    writeU16(view, base + 2, c2.y);

    let cityFlags = 0;
    if (c.disorder) cityFlags |= (1 << 0);
    if (c.weLoveKing) cityFlags |= (1 << 1);
    bytes[base + 4] = cityFlags;

    bytes[base + 8] = clamp(ownerSav, 0, 7);
    bytes[base + 9] = clamp(c.size ?? 1, 1, 255);
    bytes[base + 10] = clamp(ownerSav, 0, 7);

    bytes[base + 12] = 0xff;
    for (let civ = 0; civ < 8; civ++) bytes[base + 13 + civ] = clamp(c.size ?? 1, 1, 255);

    writeU16(view, base + 26, clamp(c.food ?? 0, 0, 0xffff));
    writeU16(view, base + 28, clamp(c.shields ?? 0, 0, 0xffff));
    writeAscii(bytes, base + 32, 16, c.name ?? `City ${i + 1}`);

    for (let j = 0; j < 3; j++) bytes[base + 48 + j] = 0;

    const specialistCount = (c.specialists?.entertainer ?? 0) + (c.specialists?.taxCollector ?? 0) + (c.specialists?.scientist ?? 0);
    bytes[base + 51] = clamp(specialistCount * 4, 0, 255);

    for (let block = 0; block < 9; block++) bytes[base + 52 + block] = 0;
    for (const impId of c.improvements ?? []) {
      if (impId <= 0 || impId > 66) continue;
      const block = Math.floor(impId / 8);
      const bit = impId % 8;
      bytes[base + 52 + block] |= (1 << bit);
    }

    bytes[base + 57] = prodToSavByte(c.production);
    bytes[base + 58] = clamp((c.tradeRoutes ?? []).length, 0, 3);
    for (let j = 0; j < 3; j++) {
      bytes[base + 59 + j] = j;
      bytes[base + 62 + j] = (j + 8) % 16;
      bytes[base + 65 + j] = 0;
      writeU16(view, base + 68 + 2 * j, 0);
    }
  }

  return buffer;
}
