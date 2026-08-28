/**
 * cosmic.js — Civ2 MGE global game parameters.
 *
 * Source: RULES.TXT @COSMIC section (Civilization II MGE).
 */

export const COSMIC = {
  roadMultiplier:             3,   // Road movement multiplier
  triremeRisk:                2,   // 1-in-x chance trireme sinks (modified by Seafaring/Navigation)
  foodPerCitizen:             2,   // Food each citizen eats per turn
  foodBoxRows:               10,   // Rows in food box (rows × city_size+1 = box size)
  shieldBoxRows:             10,   // Rows in shield box
  settlersEatMonarchy:        1,   // Settlers eat (govt ≤ Monarchy)
  settlersEatCommunism:       2,   // Settlers eat (govt ≥ Communism)
  firstUnhappySize:           7,   // City size for first unhappiness at Chieftain level
  riotFactor:                14,   // Riot factor based on # cities (higher lessens effect)
  aqueductLimit:              8,   // Aqueduct needed to exceed this size
  sewerLimit:                12,   // Sewer System needed to exceed this size
  techParadigm:              10,   // Tech paradigm (higher slows research)
  engineerTransformBase:     20,   // Base turns for engineers to transform terrain (×2)
  monarchyFreeSupport:        3,   // Monarchy pays support for all units past this
  communismFreeSupport:       3,   // Communism pays support for all units past this
  fundamentalismFreeSupport: 10,   // Fundamentalism pays support for all units past this
  communismPalaceDist:        0,   // Communism is equivalent of this palace distance
  fundamentalismSciLoss:     50,   // Fundamentalism loses this % of science
  productionChangePenalty:   50,   // % shield penalty for production type change
  paradropRange:             10,   // Max paradrop range (tiles)
  massThrustParadigm:        75,   // Mass/Thrust paradigm (increasing slows spaceship time)
  fundamentalismMaxSci:       5,   // Max science rate in fundamentalism (×10 → 50%)
  riverMovement:              1,   // Movement cost along rivers (diagonal only, both tiles must be river)
};
