/**
 * ScenarioEvents.js — Parse and execute Civ2 scenario events (events.txt).
 *
 * Supports triggers: TURN, TURNINTERVAL, SCENARIOLOADED, RANDOMTURN,
 *   UNITKILLED, CITYTAKEN, RECEIVEDTECHNOLOGY, NEGOTIATION, NOSCHISM
 * Supports actions: TEXT, CREATEUNIT, CHANGEMONEY, GIVETECHNOLOGY,
 *   MAKEAGGRESSION, JUSTONCE, CHANGETERRAIN, MOVEUNIT, PLAYWAVEFILE,
 *   PLAYCDTRACK, DONTPLAYWONDERS, DESTROYACIVILIZATION
 *
 * Reference: axx0/Civ2-clone Engine/src/IO/EventsLoader.cs
 */

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse an events.txt file into an array of scenario events.
 * @param {string} text — raw events.txt content
 * @param {object} ctx — { civNames: string[], unitNames: string[], cityNames: string[] }
 * @returns {Array<{trigger: object, actions: object[], justOnce: boolean, fired: boolean}>}
 */
export function parseEvents(text, ctx = {}) {
  const lines = text.split(/\r?\n/).map(l => l.trimEnd());
  const events = [];
  let i = 0;

  while (i < lines.length) {
    // Find @IF section
    if (lines[i].trim().toUpperCase() !== '@IF') { i++; continue; }
    i++; // skip @IF

    // Collect all lines until @ENDIF
    const block = [];
    while (i < lines.length && lines[i].trim().toUpperCase() !== '@ENDIF') {
      block.push(lines[i].trim());
      i++;
    }
    if (i < lines.length) i++; // skip @ENDIF

    if (block.length === 0) continue;

    const evt = parseEventBlock(block, ctx);
    if (evt) events.push(evt);
  }

  return events;
}

function readParam(lines, keyword, startIdx = 0) {
  const kw = keyword.toLowerCase();
  for (let i = startIdx; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.startsWith(kw + '=')) return lines[i].substring(kw.length + 1).trim();
  }
  return '';
}

function findCivId(name, civNames) {
  if (!name) return -1;
  const lower = name.toLowerCase();
  if (lower === 'anybody') return -2;
  if (lower === 'triggerreceiver' || lower === 'triggerdefender') return -4;
  if (lower === 'triggerattacker') return -3;
  const idx = (civNames ?? []).findIndex(n => n.toLowerCase() === lower);
  return idx >= 0 ? idx : -1;
}

function findUnitId(name, unitNames) {
  if (!name) return -1;
  if (name.toLowerCase() === 'anyunit') return -2;
  const idx = (unitNames ?? []).findIndex(n => n.toLowerCase() === name.toLowerCase());
  return idx >= 0 ? idx : -1;
}

function parseEventBlock(lines, ctx) {
  const triggerType = lines[0].toUpperCase();
  let trigger = null;

  switch (triggerType) {
    case 'TURN': {
      const val = readParam(lines, 'turn', 1);
      trigger = { type: 'turn', turn: val.toLowerCase() === 'every' ? -1 : parseInt(val, 10) || 0 };
      break;
    }
    case 'TURNINTERVAL': {
      const val = readParam(lines, 'interval', 1);
      trigger = { type: 'turnInterval', interval: parseInt(val, 10) || 1 };
      break;
    }
    case 'SCENARIOLOADED':
      trigger = { type: 'scenarioLoaded' };
      break;
    case 'RANDOMTURN': {
      const val = readParam(lines, 'denominator', 1);
      trigger = { type: 'randomTurn', denominator: parseInt(val, 10) || 1 };
      break;
    }
    case 'UNITKILLED': {
      trigger = {
        type: 'unitKilled',
        unitId: findUnitId(readParam(lines, 'unit', 1), ctx.unitNames),
        attackerCivId: findCivId(readParam(lines, 'attacker', 1), ctx.civNames),
        defenderCivId: findCivId(readParam(lines, 'defender', 1), ctx.civNames),
      };
      break;
    }
    case 'CITYTAKEN': {
      trigger = {
        type: 'cityTaken',
        cityName: readParam(lines, 'city', 1),
        attackerCivId: findCivId(readParam(lines, 'attacker', 1), ctx.civNames),
        defenderCivId: findCivId(readParam(lines, 'defender', 1), ctx.civNames),
      };
      break;
    }
    case 'RECEIVEDTECHNOLOGY': {
      trigger = {
        type: 'receivedTechnology',
        techId: parseInt(readParam(lines, 'technology', 1)) || 0,
        receiverCivId: findCivId(readParam(lines, 'receiver', 1), ctx.civNames),
      };
      break;
    }
    case 'NEGOTIATION': {
      const talkerRaw = readParam(lines, 'talkertype', 1).toLowerCase();
      const listenerRaw = readParam(lines, 'listenertype', 1).toLowerCase();
      trigger = {
        type: 'negotiation',
        talkerCivId: findCivId(readParam(lines, 'talker', 1), ctx.civNames),
        listenerCivId: findCivId(readParam(lines, 'listener', 1), ctx.civNames),
        talkerType: talkerRaw === 'human' ? 1 : talkerRaw === 'computer' ? 2 : 4,
        listenerType: listenerRaw === 'human' ? 1 : listenerRaw === 'computer' ? 2 : 4,
      };
      break;
    }
    case 'NOSCHISM': {
      trigger = {
        type: 'noSchism',
        civId: findCivId(readParam(lines, 'defender', 1), ctx.civNames),
      };
      break;
    }
    default:
      console.warn('[ScenarioEvents] Unsupported trigger type:', triggerType);
      return null;
  }

  // Parse actions
  const actions = [];
  let justOnce = false;
  let j = 1;
  while (j < lines.length) {
    const upper = lines[j].toUpperCase();
    switch (upper) {
      case 'TEXT': {
        const textLines = [];
        j++;
        while (j < lines.length && lines[j].toUpperCase() !== 'ENDTEXT') {
          textLines.push(lines[j]);
          j++;
        }
        if (j < lines.length) j++; // skip ENDTEXT
        actions.push({ type: 'text', lines: textLines });
        continue;
      }
      case 'CREATEUNIT': {
        j++;
        const unitName = readParam(lines, 'unit', j);
        const owner = readParam(lines, 'owner', j);
        const veteran = readParam(lines, 'veteran', j).toLowerCase() === 'yes';
        // Parse locations block
        const locations = [];
        const locIdx = lines.findIndex((l, idx) => idx >= j && l.toLowerCase() === 'locations');
        if (locIdx >= 0) {
          let k = locIdx + 1;
          while (k < lines.length && lines[k].toLowerCase() !== 'endlocations') {
            const parts = lines[k].split(/[,.]/).map(Number);
            if (parts.length >= 2) locations.push({ col: parts[0], row: parts[1] });
            k++;
          }
        }
        actions.push({
          type: 'createUnit',
          unitId: findUnitId(unitName, ctx.unitNames),
          civId: findCivId(owner, ctx.civNames),
          veteran,
          locations,
        });
        // Skip past endlocations
        const endLoc = lines.findIndex((l, idx) => idx >= j && l.toLowerCase() === 'endlocations');
        j = endLoc >= 0 ? endLoc + 1 : j + 4;
        continue;
      }
      case 'CHANGEMONEY': {
        j++;
        const receiver = readParam(lines, 'receiver', j);
        const amount = parseInt(readParam(lines, 'amount', j)) || 0;
        actions.push({ type: 'changeMoney', civId: findCivId(receiver, ctx.civNames), amount });
        j += 2;
        continue;
      }
      case 'GIVETECHNOLOGY': {
        j++;
        const receiver = readParam(lines, 'receiver', j);
        const techId = parseInt(readParam(lines, 'technology', j)) || 0;
        actions.push({ type: 'giveTechnology', civId: findCivId(receiver, ctx.civNames), techId });
        j += 2;
        continue;
      }
      case 'MAKEAGGRESSION': {
        j++;
        const who = readParam(lines, 'who', j);
        const whom = readParam(lines, 'whom', j);
        actions.push({
          type: 'makeAggression',
          whoCivId: findCivId(who, ctx.civNames),
          whomCivId: findCivId(whom, ctx.civNames),
        });
        j += 2;
        continue;
      }
      case 'CHANGETERRAIN': {
        j++;
        const terrainTypeId = parseInt(readParam(lines, 'terraintype', j)) || 0;
        // Parse maprect
        const mrIdx = lines.findIndex((l, idx) => idx >= j && l.toLowerCase() === 'maprect');
        let mapRect = null;
        if (mrIdx >= 0 && mrIdx + 1 < lines.length) {
          const parts = lines[mrIdx + 1].split(/[,.]/).map(Number);
          if (parts.length >= 8) {
            mapRect = [
              { col: parts[0], row: parts[1] }, { col: parts[2], row: parts[3] },
              { col: parts[4], row: parts[5] }, { col: parts[6], row: parts[7] },
            ];
          }
        }
        actions.push({ type: 'changeTerrain', terrainTypeId, mapRect });
        j = mrIdx >= 0 ? mrIdx + 2 : j + 3;
        continue;
      }
      case 'MOVEUNIT': {
        j++;
        const unitName = readParam(lines, 'unit', j);
        const owner = readParam(lines, 'owner', j);
        const numberRaw = readParam(lines, 'numbertomove', j);
        const numberToMove = numberRaw.toLowerCase() === 'all' ? -2 : (parseInt(numberRaw, 10) || 1);
        const mrIdx2 = lines.findIndex((l, idx) => idx >= j && l.toLowerCase() === 'maprect');
        let srcRect = null;
        if (mrIdx2 >= 0 && mrIdx2 + 1 < lines.length) {
          const parts = lines[mrIdx2 + 1].split(/[,.]/).map(Number);
          if (parts.length >= 8) {
            srcRect = [
              { col: parts[0], row: parts[1] }, { col: parts[2], row: parts[3] },
              { col: parts[4], row: parts[5] }, { col: parts[6], row: parts[7] },
            ];
          }
        }
        const mdIdx = lines.findIndex((l, idx) => idx >= j && l.toLowerCase() === 'mapdest');
        let dest = null;
        if (mdIdx >= 0 && mdIdx + 1 < lines.length) {
          const parts = lines[mdIdx + 1].split(/[,.]/).map(Number);
          if (parts.length >= 2) dest = { col: parts[0], row: parts[1] };
        }
        actions.push({
          type: 'moveUnit',
          unitId: findUnitId(unitName, ctx.unitNames),
          civId: findCivId(owner, ctx.civNames),
          numberToMove,
          srcRect,
          dest,
        });
        j = Math.max(mrIdx2 >= 0 ? mrIdx2 + 2 : j, mdIdx >= 0 ? mdIdx + 2 : j);
        continue;
      }
      case 'PLAYWAVEFILE': {
        j++;
        const wavFile = lines[j] ?? '';
        actions.push({ type: 'playWavFile', file: wavFile });
        j++;
        continue;
      }
      case 'PLAYCDTRACK': {
        j++;
        const trackNo = parseInt(lines[j], 10) || 0;
        actions.push({ type: 'playCdTrack', trackNo });
        j++;
        continue;
      }
      case 'DONTPLAYWONDERS':
        actions.push({ type: 'dontPlayWonders' });
        j++;
        continue;
      case 'DESTROYACIVILIZATION': {
        j++;
        const whom = readParam(lines, 'whom', j);
        actions.push({ type: 'destroyCivilization', civId: findCivId(whom, ctx.civNames) });
        j += 2;
        continue;
      }
      case 'JUSTONCE':
        justOnce = true;
        j++;
        continue;
      default:
        j++;
        continue;
    }
  }

  return { trigger, actions, justOnce, fired: false };
}

// ─── Executor ────────────────────────────────────────────────────────────────

/**
 * Check and execute scenario events for the current turn.
 * @param {GameState} gs
 * @param {string} triggerType — 'turn' | 'scenarioLoaded' | 'unitKilled' | 'cityTaken' | 'advance'
 * @param {object} [triggerData] — context data for the trigger
 */
export function executeEvents(gs, triggerType, triggerData = {}) {
  if (!gs._scenarioEvents || gs._scenarioEvents.length === 0) return;

  for (const evt of gs._scenarioEvents) {
    if (evt.justOnce && evt.fired) continue;
    if (!matchesTrigger(evt.trigger, triggerType, gs, triggerData)) continue;

    // Execute all actions
    for (const action of evt.actions) {
      executeAction(gs, action, triggerData);
    }

    evt.fired = true;
  }
}

function matchesTrigger(trigger, eventType, gs, data) {
  switch (trigger.type) {
    case 'turn':
      if (eventType !== 'turn') return false;
      return trigger.turn === -1 || trigger.turn === gs.turn;
    case 'turnInterval':
      if (eventType !== 'turn') return false;
      return gs.turn > 0 && gs.turn % trigger.interval === 0;
    case 'scenarioLoaded':
      return eventType === 'scenarioLoaded';
    case 'randomTurn':
      if (eventType !== 'turn') return false;
      return Math.random() * trigger.denominator < 1;
    case 'unitKilled':
      if (eventType !== 'unitKilled') return false;
      if (trigger.unitId !== -2 && trigger.unitId !== data.unitTypeId) return false;
      if (trigger.attackerCivId !== -2 && trigger.attackerCivId !== data.attackerCivId) return false;
      if (trigger.defenderCivId !== -2 && trigger.defenderCivId !== data.defenderCivId) return false;
      return true;
    case 'cityTaken':
      if (eventType !== 'cityTaken') return false;
      if (trigger.cityName && trigger.cityName.toLowerCase() !== (data.cityName ?? '').toLowerCase()) return false;
      if (trigger.attackerCivId !== -2 && trigger.attackerCivId !== data.attackerCivId) return false;
      if (trigger.defenderCivId !== -2 && trigger.defenderCivId !== data.defenderCivId) return false;
      return true;
    case 'receivedTechnology':
      if (eventType !== 'advance') return false;
      if (trigger.techId !== data.advId) return false;
      if (trigger.receiverCivId !== -2 && trigger.receiverCivId !== data.civId) return false;
      return true;
    case 'negotiation': {
      if (eventType !== 'negotiation') return false;
      if (trigger.talkerCivId !== -2 && trigger.talkerCivId !== data.talkerCivId) return false;
      if (trigger.listenerCivId !== -2 && trigger.listenerCivId !== data.listenerCivId) return false;
      if (trigger.talkerType !== 4 && trigger.talkerType !== data.talkerType) return false;
      if (trigger.listenerType !== 4 && trigger.listenerType !== data.listenerType) return false;
      return true;
    }
    case 'noSchism':
      if (eventType !== 'noSchism') return false;
      if (trigger.civId !== -2 && trigger.civId !== data.civId) return false;
      return true;
    default:
      return false;
  }
}

function resolveCivId(id, gs, triggerData) {
  if (id === -4) return triggerData.defenderCivId ?? triggerData.receiverCivId ?? 0;
  if (id === -3) return triggerData.attackerCivId ?? 0;
  if (id >= 0 && id < gs.civs.length) return id;
  return 0;
}

function executeAction(gs, action, triggerData) {
  switch (action.type) {
    case 'text':
      gs._addLog(action.lines.join(' '));
      gs._emit('scenarioText', { lines: action.lines });
      break;
    case 'createUnit': {
      if (action.unitId < 0) break;
      const civId = resolveCivId(action.civId, gs, triggerData);
      for (const loc of action.locations) {
        if (loc.row >= 0 && loc.row < gs.mapRows) {
          const col = ((loc.col % gs.mapCols) + gs.mapCols) % gs.mapCols;
          const u = gs._spawnUnit(action.unitId, civId, col, loc.row);
          if (u && action.veteran) u.veteran = true;
        }
      }
      break;
    }
    case 'changeMoney': {
      const civId = resolveCivId(action.civId, gs, triggerData);
      const civ = gs.civs[civId];
      if (civ) civ.gold = Math.max(0, civ.gold + action.amount);
      break;
    }
    case 'giveTechnology': {
      const civId = resolveCivId(action.civId, gs, triggerData);
      const civ = gs.civs[civId];
      if (civ && action.techId >= 0) {
        civ.advances.add(action.techId);
        gs._addLog(`${civ.data?.adjective ?? 'A civilization'} receives new technology!`);
      }
      break;
    }
    case 'makeAggression': {
      const who = resolveCivId(action.whoCivId, gs, triggerData);
      const whom = resolveCivId(action.whomCivId, gs, triggerData);
      if (who !== whom && gs.civs[who] && gs.civs[whom]) {
        gs.civs[who].relations.set(whom, 'war');
        gs.civs[whom].relations.set(who, 'war');
        gs._addLog(`${gs.civs[who].data?.plural ?? 'A nation'} declares war!`);
      }
      break;
    }
    case 'changeTerrain': {
      break;
    }
    case 'moveUnit': {
      if (!action.dest || action.unitId < 0) break;
      const civId = resolveCivId(action.civId, gs, triggerData);
      const destCol = ((action.dest.col % gs.mapCols) + gs.mapCols) % gs.mapCols;
      const destRow = action.dest.row;
      if (destRow < 0 || destRow >= gs.mapRows) break;
      let moved = 0;
      for (const unit of gs.units) {
        if (action.numberToMove !== -2 && moved >= action.numberToMove) break;
        if (action.unitId !== -2 && unit.typeId !== action.unitId) continue;
        if (civId >= 0 && unit.civId !== civId) continue;
        if (action.srcRect) {
          const cols = action.srcRect.map(p => p.col);
          const rows = action.srcRect.map(p => p.row);
          const minC = Math.min(...cols), maxC = Math.max(...cols);
          const minR = Math.min(...rows), maxR = Math.max(...rows);
          if (unit.col < minC || unit.col > maxC || unit.row < minR || unit.row > maxR) continue;
        }
        unit.col = destCol;
        unit.row = destRow;
        unit.movesLeft = 0;
        moved++;
      }
      break;
    }
    case 'playWavFile':
      gs._emit('scenarioPlayWav', { file: action.file });
      break;
    case 'playCdTrack':
      gs._emit('scenarioPlayCdTrack', { trackNo: action.trackNo });
      break;
    case 'dontPlayWonders':
      gs._emit('scenarioDontPlayWonders', {});
      break;
    case 'destroyCivilization': {
      const civId = resolveCivId(action.civId, gs, triggerData);
      const civ = gs.civs[civId];
      if (civ && civId > 0) {
        civ.alive = false;
        for (const unit of gs.units.filter(u => u.civId === civId)) {
          gs.units.splice(gs.units.indexOf(unit), 1);
        }
        for (const city of gs.cities.filter(c => c.civId === civId)) {
          gs.cities.splice(gs.cities.indexOf(city), 1);
        }
        gs._addLog(`The ${civ.data?.plural ?? 'civilization'} has been destroyed!`);
        gs._emit('civDestroyed', { civId });
      }
      break;
    }
  }
}
