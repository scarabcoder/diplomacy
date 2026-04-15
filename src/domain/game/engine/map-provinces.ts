import type { ProvinceData } from './types.ts';

export const PROVINCES: Record<string, ProvinceData> = {
  // --- Austria (6 provinces, 3 home SCs) ---
  boh: {
    name: 'Bohemia',
    type: 'inland',
    supplyCenter: false,
    homePower: null,
  },
  bud: {
    name: 'Budapest',
    type: 'inland',
    supplyCenter: true,
    homePower: 'austria',
  },
  gal: {
    name: 'Galicia',
    type: 'inland',
    supplyCenter: false,
    homePower: null,
  },
  tri: {
    name: 'Trieste',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'austria',
  },
  tyr: {
    name: 'Tyrolia',
    type: 'inland',
    supplyCenter: false,
    homePower: null,
  },
  vie: {
    name: 'Vienna',
    type: 'inland',
    supplyCenter: true,
    homePower: 'austria',
  },

  // --- England (6 provinces, 3 home SCs) ---
  cly: { name: 'Clyde', type: 'coastal', supplyCenter: false, homePower: null },
  edi: {
    name: 'Edinburgh',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'england',
  },
  lvp: {
    name: 'Liverpool',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'england',
  },
  lon: {
    name: 'London',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'england',
  },
  wal: { name: 'Wales', type: 'coastal', supplyCenter: false, homePower: null },
  yor: {
    name: 'Yorkshire',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },

  // --- France (6 provinces, 3 home SCs) ---
  bre: {
    name: 'Brest',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'france',
  },
  bur: {
    name: 'Burgundy',
    type: 'inland',
    supplyCenter: false,
    homePower: null,
  },
  gas: {
    name: 'Gascony',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },
  mar: {
    name: 'Marseilles',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'france',
  },
  par: {
    name: 'Paris',
    type: 'inland',
    supplyCenter: true,
    homePower: 'france',
  },
  pic: {
    name: 'Picardy',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },

  // --- Germany (6 provinces, 3 home SCs) ---
  ber: {
    name: 'Berlin',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'germany',
  },
  kie: {
    name: 'Kiel',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'germany',
  },
  mun: {
    name: 'Munich',
    type: 'inland',
    supplyCenter: true,
    homePower: 'germany',
  },
  pru: {
    name: 'Prussia',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },
  ruh: { name: 'Ruhr', type: 'inland', supplyCenter: false, homePower: null },
  sil: {
    name: 'Silesia',
    type: 'inland',
    supplyCenter: false,
    homePower: null,
  },

  // --- Italy (6 provinces, 3 home SCs) ---
  apu: {
    name: 'Apulia',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },
  nap: {
    name: 'Naples',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'italy',
  },
  pie: {
    name: 'Piedmont',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },
  rom: {
    name: 'Rome',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'italy',
  },
  tus: {
    name: 'Tuscany',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },
  ven: {
    name: 'Venice',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'italy',
  },

  // --- Russia (7 provinces, 4 home SCs) ---
  fin: {
    name: 'Finland',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },
  lvn: {
    name: 'Livonia',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },
  mos: {
    name: 'Moscow',
    type: 'inland',
    supplyCenter: true,
    homePower: 'russia',
  },
  sev: {
    name: 'Sevastopol',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'russia',
  },
  stp: {
    name: 'St. Petersburg',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'russia',
    coasts: ['nc', 'sc'],
  },
  ukr: {
    name: 'Ukraine',
    type: 'inland',
    supplyCenter: false,
    homePower: null,
  },
  war: {
    name: 'Warsaw',
    type: 'inland',
    supplyCenter: true,
    homePower: 'russia',
  },

  // --- Turkey (5 provinces, 3 home SCs) ---
  ank: {
    name: 'Ankara',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'turkey',
  },
  arm: {
    name: 'Armenia',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },
  con: {
    name: 'Constantinople',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'turkey',
  },
  smy: {
    name: 'Smyrna',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'turkey',
  },
  syr: { name: 'Syria', type: 'coastal', supplyCenter: false, homePower: null },

  // --- Neutral land (14 provinces, 12 SCs) ---
  alb: {
    name: 'Albania',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },
  bel: {
    name: 'Belgium',
    type: 'coastal',
    supplyCenter: true,
    homePower: null,
  },
  bul: {
    name: 'Bulgaria',
    type: 'coastal',
    supplyCenter: true,
    homePower: null,
    coasts: ['ec', 'sc'],
  },
  den: {
    name: 'Denmark',
    type: 'coastal',
    supplyCenter: true,
    homePower: null,
  },
  gre: { name: 'Greece', type: 'coastal', supplyCenter: true, homePower: null },
  hol: {
    name: 'Holland',
    type: 'coastal',
    supplyCenter: true,
    homePower: null,
  },
  nwy: { name: 'Norway', type: 'coastal', supplyCenter: true, homePower: null },
  naf: {
    name: 'North Africa',
    type: 'coastal',
    supplyCenter: false,
    homePower: null,
  },
  por: {
    name: 'Portugal',
    type: 'coastal',
    supplyCenter: true,
    homePower: null,
  },
  rum: {
    name: 'Rumania',
    type: 'coastal',
    supplyCenter: true,
    homePower: null,
  },
  ser: { name: 'Serbia', type: 'inland', supplyCenter: true, homePower: null },
  spa: {
    name: 'Spain',
    type: 'coastal',
    supplyCenter: true,
    homePower: null,
    coasts: ['nc', 'sc'],
  },
  swe: { name: 'Sweden', type: 'coastal', supplyCenter: true, homePower: null },
  tun: { name: 'Tunis', type: 'coastal', supplyCenter: true, homePower: null },

  // --- Water (19 provinces) ---
  adr: {
    name: 'Adriatic Sea',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  aeg: {
    name: 'Aegean Sea',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  bal: {
    name: 'Baltic Sea',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  bar: {
    name: 'Barents Sea',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  bla: {
    name: 'Black Sea',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  eas: {
    name: 'Eastern Mediterranean',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  eng: {
    name: 'English Channel',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  bot: {
    name: 'Gulf of Bothnia',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  gol: {
    name: 'Gulf of Lyon',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  hel: {
    name: 'Helgoland Bight',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  ion: {
    name: 'Ionian Sea',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  iri: {
    name: 'Irish Sea',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  mid: {
    name: 'Mid-Atlantic Ocean',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  nat: {
    name: 'North Atlantic Ocean',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  nth: {
    name: 'North Sea',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  nrg: {
    name: 'Norwegian Sea',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  ska: {
    name: 'Skagerrak',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  tyn: {
    name: 'Tyrrhenian Sea',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
  wes: {
    name: 'Western Mediterranean',
    type: 'water',
    supplyCenter: false,
    homePower: null,
  },
};
