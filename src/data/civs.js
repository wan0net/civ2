/**
 * civs.js — Civ2 MGE civilization/leader definitions.
 *
 * Source: RULES.TXT @LEADERS section.
 *
 * Fields:
 *   leader        — male leader name
 *   female        — female leader name
 *   defaultFemale — true if female leader shown by default
 *   color         — color set (1–7)
 *   cityStyle     — 0=Bronze Age, 1=Classical, 2=Far East, 3=Medieval
 *   plural        — plural civ name ("Romans")
 *   adjective     — adjective form ("Roman")
 *   attack        — personality: 1=aggressive, -1=rational
 *   expand        — personality: 1=expansionist, -1=perfectionist
 *   civilize      — personality: 1=civilized, -1=militaristic
 *   govtTitles    — optional govt-specific title overrides:
 *                   [{ govt: <id>, male: <title>, female: <title> }, …]
 */

export const CIVS = [
  {
    id: 0, leader: 'Caesar',          female: 'Livia',               defaultFemale: false,
    color: 1, cityStyle: 1, plural: 'Romans',          adjective: 'Roman',
    attack: 0, expand: 1, civilize: 1,
    govtTitles: [
      { govt: 1, male: 'Dictator',   female: 'Dictator'   },
      { govt: 2, male: 'Imperator',  female: 'Imperatrix' },
    ],
  },
  {
    id: 1, leader: 'Hammurabi',       female: 'Ishtari',             defaultFemale: false,
    color: 2, cityStyle: 0, plural: 'Babylonians',    adjective: 'Babylonian',
    attack: -1, expand: -1, civilize: 1,
    govtTitles: [],
  },
  {
    id: 2, leader: 'Frederick',       female: 'Maria Theresa',       defaultFemale: false,
    color: 3, cityStyle: 3, plural: 'Germans',         adjective: 'German',
    attack: 1, expand: -1, civilize: 1,
    govtTitles: [
      { govt: 4, male: 'Archbishop', female: 'Archbishop' },
      { govt: 6, male: 'Chancellor', female: 'Chancellor' },
    ],
  },
  {
    id: 3, leader: 'Ramesses',        female: 'Cleopatra',           defaultFemale: true,
    color: 4, cityStyle: 0, plural: 'Egyptians',       adjective: 'Egyptian',
    attack: 0, expand: 0, civilize: 1,
    govtTitles: [
      { govt: 1, male: 'Pharaoh',       female: 'Pharaoh'       },
      { govt: 2, male: 'Great Pharaoh', female: 'Great Pharaoh' },
    ],
  },
  {
    id: 4, leader: 'Abe Lincoln',     female: 'E. Roosevelt',        defaultFemale: false,
    color: 5, cityStyle: 1, plural: 'Americans',       adjective: 'American',
    attack: -1, expand: 0, civilize: 1,
    govtTitles: [
      { govt: 4, male: 'Reverend', female: 'Reverend' },
      { govt: 5, male: 'Speaker',  female: 'Speaker'  },
    ],
  },
  {
    id: 5, leader: 'Alexander',       female: 'Hippolyta',           defaultFemale: true,
    color: 6, cityStyle: 1, plural: 'Greeks',           adjective: 'Greek',
    attack: 0, expand: 1, civilize: -1,
    govtTitles: [
      { govt: 6, male: 'Prime Minister', female: 'Prime Minister' },
    ],
  },
  {
    id: 6, leader: 'Mohandas Gandhi', female: 'Indira Gandhi',       defaultFemale: false,
    color: 7, cityStyle: 2, plural: 'Indians',          adjective: 'Indian',
    attack: -1, expand: -1, civilize: 0,
    govtTitles: [
      { govt: 2, male: 'Maharaja', female: 'Maharaja' },
    ],
  },
  {
    id: 7, leader: 'Lenin',           female: 'Catherine the Great', defaultFemale: true,
    color: 1, cityStyle: 3, plural: 'Russians',         adjective: 'Russian',
    attack: 1, expand: 0, civilize: -1,
    govtTitles: [
      { govt: 2, male: 'Czar',      female: 'Czarina'  },
      { govt: 4, male: 'Patriarch', female: 'Matriarch' },
    ],
  },
  {
    id: 8, leader: 'Shaka',           female: 'Shakala',             defaultFemale: false,
    color: 2, cityStyle: 0, plural: 'Zulus',             adjective: 'Zulu',
    attack: 1, expand: 0, civilize: 0,
    govtTitles: [],
  },
  {
    id: 9, leader: 'Louis XIV',       female: 'Joan of Arc',         defaultFemale: false,
    color: 3, cityStyle: 3, plural: 'French',            adjective: 'French',
    attack: 1, expand: 1, civilize: 1,
    govtTitles: [
      { govt: 4, male: 'Archbishop', female: 'Archbishop' },
      { govt: 6, male: 'Premier',    female: 'Premier'    },
    ],
  },
  {
    id: 10, leader: 'Montezuma',      female: 'Nazca',               defaultFemale: false,
    color: 4, cityStyle: 0, plural: 'Aztecs',             adjective: 'Aztec',
    attack: 0, expand: -1, civilize: 1,
    govtTitles: [],
  },
  {
    id: 11, leader: 'Mao Tse Tung',   female: 'Wu Zhao',             defaultFemale: false,
    color: 5, cityStyle: 2, plural: 'Chinese',            adjective: 'Chinese',
    attack: 0, expand: 0, civilize: 1,
    govtTitles: [
      { govt: 3, male: 'Chairman', female: 'Chairperson' },
    ],
  },
  {
    id: 12, leader: 'Henry VIII',     female: 'Elizabeth I',         defaultFemale: true,
    color: 6, cityStyle: 3, plural: 'English',            adjective: 'English',
    attack: 0, expand: 1, civilize: 0,
    govtTitles: [
      { govt: 4, male: 'Lord Protector', female: 'Lady Protector'  },
      { govt: 6, male: 'Prime Minister', female: 'Prime Minister'  },
    ],
  },
  {
    id: 13, leader: 'Genghis Khan',   female: 'Bortei',              defaultFemale: false,
    color: 7, cityStyle: 0, plural: 'Mongols',            adjective: 'Mongol',
    attack: 1, expand: 1, civilize: -1,
    govtTitles: [],
  },
  {
    id: 14, leader: 'Cunobelin',      female: 'Boadicea',            defaultFemale: true,
    color: 1, cityStyle: 0, plural: 'Celts',               adjective: 'Celtic',
    attack: -1, expand: 1, civilize: 0,
    govtTitles: [
      { govt: 4, male: 'Druid', female: 'Druid' },
    ],
  },
  {
    id: 15, leader: 'Tokugawa',       female: 'Amaterasu',           defaultFemale: false,
    color: 2, cityStyle: 2, plural: 'Japanese',           adjective: 'Japanese',
    attack: 1, expand: -1, civilize: -1,
    govtTitles: [
      { govt: 2, male: 'Shogun',        female: 'Shogun'        },
      { govt: 6, male: 'Prime Minister', female: 'Prime Minister' },
    ],
  },
  {
    id: 16, leader: 'Canute',         female: 'Gunnhild',            defaultFemale: true,
    color: 3, cityStyle: 3, plural: 'Vikings',            adjective: 'Viking',
    attack: 1, expand: 1, civilize: 0,
    govtTitles: [
      { govt: 1, male: 'Warlord', female: 'Warlord' },
    ],
  },
  {
    id: 17, leader: 'Philip II',      female: 'Isabella',            defaultFemale: true,
    color: 4, cityStyle: 3, plural: 'Spanish',            adjective: 'Spanish',
    attack: -1, expand: 1, civilize: -1,
    govtTitles: [
      { govt: 4, male: 'Archbishop', female: 'Archbishop' },
    ],
  },
  {
    id: 18, leader: 'Xerxes',         female: 'Scheherezade',        defaultFemale: false,
    color: 5, cityStyle: 0, plural: 'Persians',           adjective: 'Persian',
    attack: 0, expand: -1, civilize: 0,
    govtTitles: [
      { govt: 2, male: 'Shah',      female: 'Shah'      },
      { govt: 4, male: 'Ayatollah', female: 'Ayatollah' },
    ],
  },
  {
    id: 19, leader: 'Hannibal',       female: 'Dido',                defaultFemale: false,
    color: 6, cityStyle: 1, plural: 'Carthaginians',     adjective: 'Carthaginian',
    attack: 0, expand: 0, civilize: -1,
    govtTitles: [],
  },
  {
    id: 20, leader: 'Sitting Bull',   female: 'Sacajawea',           defaultFemale: false,
    color: 7, cityStyle: 0, plural: 'Sioux',              adjective: 'Sioux',
    attack: 0, expand: 0, civilize: 0,
    govtTitles: [
      { govt: 1, male: 'Chief',       female: 'Chief'       },
      { govt: 2, male: 'Great Chief', female: 'Great Chief' },
    ],
  },
];
