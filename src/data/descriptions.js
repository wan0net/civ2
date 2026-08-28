/**
 * descriptions.js — Civilopedia gameplay-effect text for improvements, wonders,
 * advances, and terrain.
 *
 * Source: PEDIA/DESCRIBE.PDE (Civ2 MGE).
 *
 * Arrays are indexed identically to improvements.js / advances.js.
 * IMPROVEMENT_DESC[0] = null (the "Nothing" slot has no description).
 * Full Civilopedia narrative text (historical background) lives in
 * PEDIA/ADVANC*.PDE and is not included here — use those files if you
 * build a Civilopedia UI.
 */

// ── City Improvements (indices 0–38) ─────────────────────────────────────────

export const IMPROVEMENT_DESC = [
  null, // 0 — Nothing
  'Marks the capital city of a civilization. Eliminates corruption and waste in the city, and decreases it in all nearby cities. Each civilization can have only one Palace at a time.',
  'Allows the city to produce Veteran ground units. Repairs damaged ground units in one turn.',
  "Only half of a city's Food store is depleted when the city increases in size.",
  'Makes one unhappy citizen content (two after the discovery of Mysticism).',
  'Increases tax and luxury output by 50%.',
  'Increases science output by 50%.',
  'Decreases corruption by 50%, and makes the city more resistant to bribery by enemy diplomats and spies. Under Democracy, the Courthouse makes one content citizen happy.',
  'The defense factor of units inside the city is tripled against all ground units except Howitzers.',
  'Allows the city to grow beyond size 8.',
  'Increases tax and luxury output by an additional 50% (cumulative with Marketplace).',
  'Makes three unhappy citizens content (two after the discovery of Communism). The discovery of Theology adds one content citizen to every city with a Cathedral.',
  'Increases science output by an additional 50% (cumulative with Library).',
  'Eliminates pollution caused by population.',
  'Three unhappy citizens are made content. (Four with Electronics.)',
  'Increases Shield production by 50%.',
  'Increases Shield production by an additional 50% (cumulative with Factory).',
  'Protects everything within three spaces of the city from nuclear attack.',
  'Decreases the pollution caused by Shield production by 2/3.',
  'Increases Factory output by 50%.',
  'Increases Factory output by 50%, and reduces pollution caused by Shield production by 50%. Hydro Plants are safer than Nuclear Plants.',
  'Increases Factory output by 50%, and reduces pollution caused by Shield production by 50%. Nuclear Plants run the risk of nuclear meltdown until Fusion Power is discovered.',
  'Increases tax and luxury output by an additional 50% (cumulative with Marketplace and Bank, for a total increase of 150%).',
  'Allows a city to grow beyond size 12.',
  "Allows double-irrigated squares in the city's radius (farmland) to produce 50% more Food.",
  "All squares in the city's radius with roads or railroads produce 50% more Trade. Increases revenue from trade routes.",
  'Increases science output by an additional 50% (cumulative with Library and University for a total increase of 150%).',
  'Doubles the defense factors of all units inside the city against air units and non-nuclear missile attacks.',
  'Doubles the defense factors of all units inside the city against shore bombardments by enemy ships.',
  'Increases Factory output by 50%, and eliminates all pollution caused by Shield production. Helps to slow the onset of global warming by absorbing atmospheric heat.',
  "Allows all Ocean squares in the city's radius to produce one extra unit of Food.",
  "Allows all Ocean squares in the city's radius to produce one Shield.",
  'Allows a city to produce Veteran air units. Any air unit spending an entire turn in the city is completely repaired. Allows airlifting of units.',
  'Reduces the number of unhappy citizens created by units away from their home city by one per unit.',
  'Allows a city to produce Veteran sea units. Any ship spending an entire turn in the city is completely repaired.',
  'Forms the framework of your spaceship.',
  'Thrust Components: Each component adds 25% to the spaceship\'s thrust. Fuel Components: Each component provides enough fuel for one Thrust Component.',
  'Population: Each module provides living space for 10,000 colonists. Life Support: Each module provides Food, air, and support for one Population Module. Solar Panel: Each module provides power for two other modules.',
  'Converts all Shield production into Taxes.',
];

// ── Wonders of the World (indices 39–66) ─────────────────────────────────────

export const WONDER_DESC = [
  // index 0 = improvements id 39 (Pyramids)
  'Counts as a Granary in every city. Effects do not expire.',
  'Makes three content citizens happy in the city where it is built, and one content citizen happy in all other friendly cities. Effects expire with the discovery of the Railroad.',
  'The city where the Colossus is built generates an extra unit of Trade in each square that is already producing Trade. Effects expire with the discovery of Flight.',
  'Triremes can move across oceans without danger of being lost at sea, and all other sea units have their movement rate increased by one. All new ships produced receive Veteran status. Effects expire with the discovery of Magnetism.',
  'The civilization automatically receives any Civilization Advance already discovered by two other civilizations. Effects expire with the discovery of Electricity.',
  'Doubles the effectiveness of all Temples. Effects expire with the discovery of Theology.',
  'Acts as City Walls in all friendly cities. Doubles unit attack strength versus Barbarians. Enemy civilizations are forced to offer cease-fire or peace during negotiations. Effects expire with the discovery of Metallurgy.',
  'All new ground units produced are Veterans, and any existing ground unit that wins in combat automatically receives Veteran status. Effects expire with the discovery of Mobile Warfare.',
  "Every square in the City Radius of the city where the Wonder is built produces one extra Shield. Effects expire with the discovery of Industrialization.",
  'You automatically establish an embassy with every rival civilization. Effects expire with the discovery of Communism.',
  'Counts as a Cathedral in each of your cities. Effects do not expire.',
  'Increases science output of the city where the Wonder is built by 50%. Effects do not expire.',
  'Increases the movement rate of all sea units by two. Effects do not expire.',
  'All unhappy citizens in the city are made content. Effects do not expire.',
  'Whenever one of your units becomes obsolete due to a new technology, it is immediately replaced by an equivalent modern unit, free of charge. Effects expire with the discovery of the Automobile.',
  'Decreases the number of unhappy citizens in every friendly city on the continent by two per city. Effects do not expire.',
  'Doubles the Science output of the city where it is built. Effects do not expire.',
  'Pays the maintenance for all City Improvements which ordinarily cost one coin per turn. (Improvements costing more than one coin per turn are not affected.) Effects do not expire.',
  'Automatically grants two Civilization Advances. Functions only on the turn it is constructed.',
  'Eliminates the period of Anarchy when changing government types, and allows the choice of any available government form. Effects do not expire.',
  "When first built (or captured), every civilization's attitude is immediately shifted 25% in your favor, and continues to gradually improve over time. Effects do not expire.",
  'Acts as a Hydro Plant in every friendly city. Effects do not expire.',
  'Acts as a Police Station in every friendly city. Effects do not expire.',
  'Allows the construction of nuclear weapons by ALL civilizations. Effects do not expire.',
  'You automatically establish an embassy with every rival civilization, and enemy civilizations are forced to offer cease-fire or peace during negotiations. Under Democracy you can successfully declare war 50% of the time. Effects do not expire.',
  'Allows the construction of spaceship improvements by ALL civilizations and reveals the entire map. Effects do not expire.',
  'Counts as a Research Lab in every friendly city, effectively doubling your science output. Effects do not expire.',
  'Makes one content citizen happy in every friendly city. Effects do not expire.',
];

/**
 * Helper: look up improvement or wonder description by improvements.js id (0–66).
 * Returns null for the "Nothing" slot.
 */
export function getImprovementDesc(id) {
  if (id < 39) return IMPROVEMENT_DESC[id] ?? null;
  return WONDER_DESC[id - 39] ?? null;
}
