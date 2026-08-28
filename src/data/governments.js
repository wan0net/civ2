/**
 * governments.js — Civ2 MGE government types.
 *
 * Source: RULES.TXT @GOVERNMENTS section.
 * Index matches internal govt ID (0=Anarchy … 6=Democracy).
 */

export const GOVERNMENTS = [
  { id: 0, name: 'Anarchy',         titleMale: 'Mr.',          titleFemale: 'Ms.'            },
  { id: 1, name: 'Despotism',       titleMale: 'Emperor',      titleFemale: 'Empress'        },
  { id: 2, name: 'Monarchy',        titleMale: 'King',         titleFemale: 'Queen'          },
  { id: 3, name: 'Communism',       titleMale: 'Comrade',      titleFemale: 'Comrade'        },
  { id: 4, name: 'Fundamentalism',  titleMale: 'High Priest',  titleFemale: 'High Priestess' },
  { id: 5, name: 'Republic',        titleMale: 'Consul',       titleFemale: 'Consul'         },
  { id: 6, name: 'Democracy',       titleMale: 'President',    titleFemale: 'President'      },
];
