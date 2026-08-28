/**
 * City.js — a single city instance.
 *
 * id           → unique city id
 * civId        → owning civilisation index
 * col/row      → map position
 * name         → display name
 * size         → population size (1+)
 * food         → accumulated food in the granary box
 * shields      → accumulated shields in the production box
 * improvements → Set of improvement ids (improvements.js)
 * production   → { type: 'unit'|'improvement', id } or null
 */

export class City {
  constructor({ id, civId, col, row, name }) {
    this.id           = id;
    this.civId        = civId;
    this.col          = col;
    this.row          = row;
    this.name         = name;
    this.size         = 1;
    this.food         = 0;
    this.shields      = 0;
    this.improvements  = new Set();
    this.ssParts       = { 35: 0, 36: 0, 37: 0 }; // counts of SS Structural/Component/Module built
    this.production    = null;
    this.productionQueue = [];
    this.disorder      = false;   // true when unhappy citizens ≥ happy citizens
    this.manualWorked  = null;    // Set<"row,col"> when player overrides auto-assignment, else null
    this.specialists   = { entertainer: 0, taxCollector: 0, scientist: 0 };
    this.weLoveKing    = false;   // "We Love the King Day" active
    this.tradeRoutes   = [];      // [{partnerCityId, partnerCivId, tradePerTurn}] max 3
    this.governor      = false;   // auto-manage workers when true
    this.improvementSold = false;
  }
}
