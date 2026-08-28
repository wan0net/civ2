/**
 * Civilization.js — runtime state for one civilization.
 *
 * id         → civ index (0 = human player)
 * data       → reference to CIVS[id] (static civ definition)
 * advances   → Set of discovered advance ids
 * gold       → treasury gold
 * government → government type id (0=Anarchy … 6=Democracy)
 * sciRate    → science rate 0-100 (% of trade going to science)
 * taxRate    → tax rate 0-100
 * luxRate    → luxury rate 0-100  (sciRate + taxRate + luxRate = 100)
 * alive      → false when civ is eliminated
 */

export class Civilization {
  constructor({ id, data }) {
    this.id         = id;
    this.data       = data;
    this.advances        = new Set();
    this.gold            = 0;
    this.government      = 1;    // start in Despotism
    this.sciRate         = 50;
    this.taxRate         = 50;
    this.luxRate         = 0;
    this.alive           = true;
    this.beakers         = 0;    // accumulated science beakers
    this.currentResearch = null; // advance id being researched, or null
    this.researchGoal    = null; // optional long-term goal chosen in the Science Advisor
    this.startingAdvanceIds = []; // original-game start compensation advances
    /** Player-selected pre-industrial city appearance (0..3). */
    this.cityStyle = data?.cityStyle ?? 0;

    /** Turns remaining in anarchy after a revolution (0 = not in anarchy). */
    this.anarchyTurnsLeft = 0;

    /**
     * Diplomatic relations with other civs.
     * Map<civId, 'war'|'ceasefire'|'peace'|'alliance'>  — populated by GameState after all civs are created.
     */
    this.relations = new Map();

    /**
     * Per-civ attitude toward this civ's rivals.
     * Map<civId, integer -100..+100>  (0 = neutral; positive = friendly; negative = hostile)
     */
    this.attitude = new Map();

    /** Global reputation: 0=untrustworthy, 100=honorable. Breaking treaties reduces this. */
    this.reputation = 50;

    /** Set of civIds with which this civ has established an embassy. */
    this.embassies = new Set();

    /** Set of civIds this civilization has actually encountered. */
    this.contacts = new Set();

    /** Civilization II spaceship construction and flight state. */
    this.spaceship = {
      structural: 0,
      propulsion: 0,
      fuel: 0,
      habitation: 0,
      lifeSupport: 0,
      solar: 0,
      unassignedComponents: 0,
      unassignedModules: 0,
      launched: false,
      launchYear: null,
      arrivalYear: null,
    };

    /** Custom leader name set by the player (null = use default from civs.js). */
    this.leaderNameOverride = null;

    /** Number of Future Technology advances discovered (after all 100 normal advances). */
    this.futureTechCount = 0;
  }
}
