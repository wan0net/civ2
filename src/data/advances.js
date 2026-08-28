/**
 * advances.js — Civ2 MGE civilization advance (technology) definitions.
 *
 * Source: RULES.TXT @CIVILIZE section.
 *
 * Fields:
 *   id      — advance index (used as reference in preq / unit / improvement arrays)
 *   name    — display name
 *   aiValue — AI valuation weight
 *   civMod  — civilize personality modifier (+ve = civs value more, -ve = military value more)
 *   preq    — [preq1, preq2] advance IDs (-1 = none required)
 *   epoch   — 0=Ancient, 1=Renaissance, 2=Industrial, 3=Modern
 *   cat     — 0=Military, 1=Economic, 2=Social, 3=Academic, 4=Applied
 */

export const ADVANCES = [
  { id:  0, name: 'Advanced Flight',     aiValue: 4, civMod: -2, preq: [66, 44], epoch: 3, cat: 4 }, // AFl
  { id:  1, name: 'Alphabet',            aiValue: 5, civMod:  1, preq: [-1, -1], epoch: 0, cat: 3 }, // Alp
  { id:  2, name: 'Amphibious Warfare',  aiValue: 3, civMod: -2, preq: [57, 81], epoch: 3, cat: 0 }, // Amp
  { id:  3, name: 'Astronomy',           aiValue: 4, civMod:  1, preq: [56, 49], epoch: 1, cat: 3 }, // Ast
  { id:  4, name: 'Atomic Theory',       aiValue: 4, civMod: -1, preq: [83, 61], epoch: 2, cat: 3 }, // Ato
  { id:  5, name: 'Automobile',          aiValue: 6, civMod: -1, preq: [14, 79], epoch: 3, cat: 4 }, // Aut
  { id:  6, name: 'Banking',             aiValue: 4, civMod:  1, preq: [84, 71], epoch: 1, cat: 1 }, // Ban
  { id:  7, name: 'Bridge Building',     aiValue: 4, civMod:  0, preq: [39, 18], epoch: 0, cat: 4 }, // Bri
  { id:  8, name: 'Bronze Working',      aiValue: 6, civMod: -1, preq: [-1, -1], epoch: 0, cat: 4 }, // Bro
  { id:  9, name: 'Ceremonial Burial',   aiValue: 5, civMod:  0, preq: [-1, -1], epoch: 0, cat: 2 }, // Cer
  { id: 10, name: 'Chemistry',           aiValue: 5, civMod: -1, preq: [85, 50], epoch: 1, cat: 3 }, // Che
  { id: 11, name: 'Chivalry',            aiValue: 4, civMod: -2, preq: [29, 36], epoch: 1, cat: 0 }, // Chi
  { id: 12, name: 'Code of Laws',        aiValue: 4, civMod:  1, preq: [ 1, -1], epoch: 0, cat: 2 }, // CoL
  { id: 13, name: 'Combined Arms',       aiValue: 5, civMod: -1, preq: [53,  0], epoch: 3, cat: 0 }, // CA
  { id: 14, name: 'Combustion',          aiValue: 5, civMod: -1, preq: [69, 28], epoch: 2, cat: 4 }, // Cmb
  { id: 15, name: 'Communism',           aiValue: 5, civMod:  0, preq: [60, 37], epoch: 2, cat: 2 }, // Cmn
  { id: 16, name: 'Computers',           aiValue: 4, civMod:  1, preq: [52, 48], epoch: 3, cat: 4 }, // Cmp
  { id: 17, name: 'Conscription',        aiValue: 7, civMod: -1, preq: [21, 51], epoch: 2, cat: 0 }, // Csc
  { id: 18, name: 'Construction',        aiValue: 4, civMod:  0, preq: [47, 20], epoch: 0, cat: 4 }, // Cst
  { id: 19, name: 'The Corporation',     aiValue: 4, civMod:  0, preq: [37, 22], epoch: 2, cat: 1 }, // Cor
  { id: 20, name: 'Currency',            aiValue: 4, civMod:  1, preq: [ 8, -1], epoch: 0, cat: 1 }, // Cur
  { id: 21, name: 'Democracy',           aiValue: 5, civMod:  1, preq: [ 6, 38], epoch: 2, cat: 2 }, // Dem
  { id: 22, name: 'Economics',           aiValue: 4, civMod:  1, preq: [85,  6], epoch: 2, cat: 1 }, // Eco
  { id: 23, name: 'Electricity',         aiValue: 4, civMod:  0, preq: [51, 45], epoch: 2, cat: 4 }, // E1
  { id: 24, name: 'Electronics',         aiValue: 4, civMod:  1, preq: [23, 19], epoch: 3, cat: 4 }, // E2
  { id: 25, name: 'Engineering',         aiValue: 4, civMod:  0, preq: [87, 18], epoch: 0, cat: 4 }, // Eng
  { id: 26, name: 'Environmentalism',    aiValue: 3, civMod:  1, preq: [68, 76], epoch: 3, cat: 2 }, // Env
  { id: 27, name: 'Espionage',           aiValue: 2, civMod: -1, preq: [15, 21], epoch: 3, cat: 0 }, // Esp
  { id: 28, name: 'Explosives',          aiValue: 5, civMod:  0, preq: [35, 10], epoch: 2, cat: 4 }, // Exp
  { id: 29, name: 'Feudalism',           aiValue: 4, civMod: -1, preq: [86, 54], epoch: 0, cat: 0 }, // Feu
  { id: 30, name: 'Flight',             aiValue: 4, civMod: -1, preq: [14, 83], epoch: 2, cat: 4 }, // Fli
  { id: 31, name: 'Fundamentalism',      aiValue: 3, civMod: -2, preq: [55, 17], epoch: 2, cat: 2 }, // Fun
  { id: 32, name: 'Fusion Power',        aiValue: 3, civMod:  0, preq: [59, 80], epoch: 3, cat: 3 }, // FP
  { id: 33, name: 'Genetic Engineering', aiValue: 3, civMod:  2, preq: [50, 19], epoch: 3, cat: 3 }, // Gen
  { id: 34, name: 'Guerrilla Warfare',   aiValue: 4, civMod:  1, preq: [15, 81], epoch: 3, cat: 0 }, // Gue
  { id: 35, name: 'Gunpowder',           aiValue: 8, civMod: -2, preq: [38, 39], epoch: 1, cat: 0 }, // Gun
  { id: 36, name: 'Horseback Riding',    aiValue: 4, civMod: -1, preq: [-1, -1], epoch: 0, cat: 0 }, // Hor
  { id: 37, name: 'Industrialization',   aiValue: 6, civMod:  0, preq: [67,  6], epoch: 2, cat: 1 }, // Ind
  { id: 38, name: 'Invention',           aiValue: 6, civMod:  0, preq: [25, 43], epoch: 1, cat: 4 }, // Inv
  { id: 39, name: 'Iron Working',        aiValue: 5, civMod: -1, preq: [ 8, 86], epoch: 0, cat: 4 }, // Iro
  { id: 40, name: 'Labor Union',         aiValue: 4, civMod: -1, preq: [48, 34], epoch: 3, cat: 2 }, // Lab
  { id: 41, name: 'The Laser',           aiValue: 4, civMod:  0, preq: [59, 48], epoch: 3, cat: 3 }, // Las
  { id: 42, name: 'Leadership',          aiValue: 5, civMod: -1, preq: [11, 35], epoch: 1, cat: 0 }, // Ldr
  { id: 43, name: 'Literacy',            aiValue: 5, civMod:  2, preq: [88, 12], epoch: 0, cat: 3 }, // Lit
  { id: 44, name: 'Machine Tools',       aiValue: 4, civMod: -2, preq: [79, 81], epoch: 2, cat: 4 }, // Too
  { id: 45, name: 'Magnetism',           aiValue: 4, civMod: -1, preq: [61, 39], epoch: 1, cat: 3 }, // Mag
  { id: 46, name: 'Map Making',          aiValue: 6, civMod: -1, preq: [ 1, -1], epoch: 0, cat: 1 }, // Map
  { id: 47, name: 'Masonry',             aiValue: 4, civMod:  1, preq: [-1, -1], epoch: 0, cat: 4 }, // Mas
  { id: 48, name: 'Mass Production',     aiValue: 5, civMod:  0, preq: [ 5, 19], epoch: 3, cat: 4 }, // MP
  { id: 49, name: 'Mathematics',         aiValue: 4, civMod: -1, preq: [ 1, 47], epoch: 0, cat: 3 }, // Mat
  { id: 50, name: 'Medicine',            aiValue: 4, civMod:  0, preq: [60, 84], epoch: 1, cat: 1 }, // Med
  { id: 51, name: 'Metallurgy',          aiValue: 6, civMod: -2, preq: [35, 85], epoch: 1, cat: 0 }, // Met
  { id: 52, name: 'Miniaturization',     aiValue: 4, civMod:  1, preq: [44, 24], epoch: 3, cat: 4 }, // Min
  { id: 53, name: 'Mobile Warfare',      aiValue: 8, civMod: -1, preq: [ 5, 81], epoch: 3, cat: 0 }, // Mob
  { id: 54, name: 'Monarchy',            aiValue: 5, civMod:  1, preq: [ 9, 12], epoch: 0, cat: 2 }, // Mon
  { id: 55, name: 'Monotheism',          aiValue: 5, civMod:  1, preq: [60, 64], epoch: 1, cat: 2 }, // MT
  { id: 56, name: 'Mysticism',           aiValue: 4, civMod:  0, preq: [ 9, -1], epoch: 0, cat: 2 }, // Mys
  { id: 57, name: 'Navigation',          aiValue: 6, civMod: -1, preq: [75,  3], epoch: 1, cat: 1 }, // Nav
  { id: 58, name: 'Nuclear Fission',     aiValue: 6, civMod: -2, preq: [ 4, 48], epoch: 3, cat: 3 }, // NF
  { id: 59, name: 'Nuclear Power',       aiValue: 3, civMod:  0, preq: [58, 24], epoch: 3, cat: 3 }, // NP
  { id: 60, name: 'Philosophy',          aiValue: 6, civMod:  1, preq: [56, 43], epoch: 1, cat: 2 }, // Phi
  { id: 61, name: 'Physics',             aiValue: 4, civMod: -1, preq: [57, 43], epoch: 1, cat: 3 }, // Phy
  { id: 62, name: 'Plastics',            aiValue: 4, civMod:  1, preq: [69, 76], epoch: 3, cat: 4 }, // Pla
  { id: 63, name: 'Plumbing',            aiValue: 4, civMod:  0, preq: [-1, -1], epoch: 1, cat: 4 }, // Plu (no prereqs per RULES.TXT)
  { id: 64, name: 'Polytheism',          aiValue: 4, civMod:  0, preq: [ 9, 36], epoch: 0, cat: 2 }, // PT
  { id: 65, name: 'Pottery',             aiValue: 4, civMod:  1, preq: [-1, -1], epoch: 0, cat: 1 }, // Pot
  { id: 66, name: 'Radio',              aiValue: 5, civMod: -1, preq: [30, 23], epoch: 3, cat: 4 }, // Rad
  { id: 67, name: 'Railroad',            aiValue: 6, civMod:  0, preq: [78,  7], epoch: 2, cat: 1 }, // RR
  { id: 68, name: 'Recycling',           aiValue: 2, civMod:  1, preq: [48, 21], epoch: 3, cat: 2 }, // Rec
  { id: 69, name: 'Refining',            aiValue: 4, civMod:  0, preq: [10, 19], epoch: 2, cat: 4 }, // Ref
  { id: 70, name: 'Refrigeration',       aiValue: 3, civMod:  1, preq: [23, 74], epoch: 3, cat: 1 }, // Rfg
  { id: 71, name: 'The Republic',        aiValue: 5, civMod:  1, preq: [12, 43], epoch: 0, cat: 2 }, // Rep
  { id: 72, name: 'Robotics',            aiValue: 5, civMod: -2, preq: [16, 53], epoch: 3, cat: 0 }, // Rob
  { id: 73, name: 'Rocketry',            aiValue: 6, civMod: -2, preq: [ 0, 24], epoch: 3, cat: 0 }, // Roc
  { id: 74, name: 'Sanitation',          aiValue: 4, civMod:  2, preq: [50, 25], epoch: 2, cat: 1 }, // San
  { id: 75, name: 'Seafaring',           aiValue: 4, civMod:  1, preq: [46, 65], epoch: 0, cat: 1 }, // Sea
  { id: 76, name: 'Space Flight',        aiValue: 4, civMod:  1, preq: [16, 73], epoch: 3, cat: 3 }, // SFl
  { id: 77, name: 'Stealth',             aiValue: 3, civMod: -2, preq: [80, 72], epoch: 3, cat: 0 }, // Sth
  { id: 78, name: 'Steam Engine',        aiValue: 4, civMod: -1, preq: [61, 38], epoch: 2, cat: 3 }, // SE
  { id: 79, name: 'Steel',              aiValue: 4, civMod: -1, preq: [23, 37], epoch: 2, cat: 4 }, // Stl
  { id: 80, name: 'Superconductor',      aiValue: 4, civMod:  1, preq: [62, 41], epoch: 3, cat: 3 }, // Sup
  { id: 81, name: 'Tactics',             aiValue: 6, civMod: -1, preq: [17, 42], epoch: 2, cat: 0 }, // Tac
  { id: 82, name: 'Theology',            aiValue: 3, civMod:  2, preq: [55, 29], epoch: 1, cat: 2 }, // The
  { id: 83, name: 'Theory of Gravity',   aiValue: 4, civMod:  0, preq: [ 3, 85], epoch: 1, cat: 3 }, // ToG
  { id: 84, name: 'Trade',              aiValue: 4, civMod:  2, preq: [20, 12], epoch: 0, cat: 1 }, // Tra
  { id: 85, name: 'University',          aiValue: 5, civMod:  1, preq: [49, 60], epoch: 1, cat: 3 }, // Uni
  { id: 86, name: 'Warrior Code',        aiValue: 4, civMod: -1, preq: [-1, -1], epoch: 0, cat: 0 }, // War
  { id: 87, name: 'The Wheel',           aiValue: 4, civMod: -1, preq: [36, -1], epoch: 0, cat: 4 }, // Whe
  { id: 88, name: 'Writing',             aiValue: 4, civMod:  2, preq: [ 1, -1], epoch: 0, cat: 3 }, // Wri
  { id: 89, name: 'Future Technology',   aiValue: 1, civMod:  0, preq: [32, 68], epoch: 3, cat: 3 }, // ...
  { id: 90, name: 'User Def Tech A',     aiValue: 3, civMod:  0, preq: [-1, -1], epoch: 0, cat: 0 }, // U1
  { id: 91, name: 'User Def Tech B',     aiValue: 3, civMod:  0, preq: [-1, -1], epoch: 0, cat: 0 }, // U2
  { id: 92, name: 'User Def Tech C',     aiValue: 3, civMod:  0, preq: [-1, -1], epoch: 0, cat: 0 }, // U3
  { id: 93, name: 'Extra Advance 1',     aiValue: 3, civMod:  0, preq: [-1, -1], epoch: 0, cat: 0 }, // X1
  { id: 94, name: 'Extra Advance 2',     aiValue: 3, civMod:  0, preq: [-1, -1], epoch: 0, cat: 0 }, // X2
  { id: 95, name: 'Extra Advance 3',     aiValue: 3, civMod:  0, preq: [-1, -1], epoch: 0, cat: 0 }, // X3
  { id: 96, name: 'Extra Advance 4',     aiValue: 3, civMod:  0, preq: [-1, -1], epoch: 0, cat: 0 }, // X4
  { id: 97, name: 'Extra Advance 5',     aiValue: 3, civMod:  0, preq: [-1, -1], epoch: 0, cat: 0 }, // X5
  { id: 98, name: 'Extra Advance 6',     aiValue: 3, civMod:  0, preq: [-1, -1], epoch: 0, cat: 0 }, // X6
  { id: 99, name: 'Extra Advance 7',     aiValue: 3, civMod:  0, preq: [-1, -1], epoch: 0, cat: 0 }, // X7
];

/**
 * Abbreviation → advance ID lookup table.
 * Useful when resolving cross-references in the rules data.
 */
export const ADV = {
  AFl:  0, Alp:  1, Amp:  2, Ast:  3, Ato:  4, Aut:  5, Ban:  6, Bri:  7, Bro:  8, Cer:  9,
  Che: 10, Chi: 11, CoL: 12, CA:  13, Cmb: 14, Cmn: 15, Cmp: 16, Csc: 17, Cst: 18, Cor: 19,
  Cur: 20, Dem: 21, Eco: 22, E1:  23, E2:  24, Eng: 25, Env: 26, Esp: 27, Exp: 28, Feu: 29,
  Fli: 30, Fun: 31, FP:  32, Gen: 33, Gue: 34, Gun: 35, Hor: 36, Ind: 37, Inv: 38, Iro: 39,
  Lab: 40, Las: 41, Ldr: 42, Lit: 43, Too: 44, Mag: 45, Map: 46, Mas: 47, MP:  48, Mat: 49,
  Med: 50, Met: 51, Min: 52, Mob: 53, Mon: 54, MT:  55, Mys: 56, Nav: 57, NF:  58, NP:  59,
  Phi: 60, Phy: 61, Pla: 62, Plu: 63, PT:  64, Pot: 65, Rad: 66, RR:  67, Rec: 68, Ref: 69,
  Rfg: 70, Rep: 71, Rob: 72, Roc: 73, San: 74, Sea: 75, SFl: 76, Sth: 77, SE:  78, Stl: 79,
  Sup: 80, Tac: 81, The: 82, ToG: 83, Tra: 84, Uni: 85, War: 86, Whe: 87, Wri: 88,
  FutureTech: 89, U1: 90, U2: 91, U3: 92, X1: 93, X2: 94, X3: 95, X4: 96, X5: 97, X6: 98, X7: 99,
  nil: -1, no: -1,
};
