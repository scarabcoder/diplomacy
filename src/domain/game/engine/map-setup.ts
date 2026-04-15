import type { Power, SupplyCenterOwnership, UnitPositions } from './types.ts';
import { PROVINCES } from './map-provinces.ts';

export const HOME_SUPPLY_CENTERS: Record<Power, string[]> = {
  austria: ['bud', 'tri', 'vie'],
  england: ['edi', 'lvp', 'lon'],
  france: ['bre', 'mar', 'par'],
  germany: ['ber', 'kie', 'mun'],
  italy: ['nap', 'rom', 'ven'],
  russia: ['mos', 'sev', 'stp', 'war'],
  turkey: ['ank', 'con', 'smy'],
};

export const SUPPLY_CENTERS: string[] = Object.entries(PROVINCES)
  .filter(([, province]) => province.supplyCenter)
  .map(([provinceId]) => provinceId);

export const STARTING_POSITIONS: UnitPositions = {
  vie: { power: 'austria', unitType: 'army', coast: null },
  bud: { power: 'austria', unitType: 'army', coast: null },
  tri: { power: 'austria', unitType: 'fleet', coast: null },
  lon: { power: 'england', unitType: 'fleet', coast: null },
  edi: { power: 'england', unitType: 'fleet', coast: null },
  lvp: { power: 'england', unitType: 'army', coast: null },
  par: { power: 'france', unitType: 'army', coast: null },
  mar: { power: 'france', unitType: 'army', coast: null },
  bre: { power: 'france', unitType: 'fleet', coast: null },
  ber: { power: 'germany', unitType: 'army', coast: null },
  mun: { power: 'germany', unitType: 'army', coast: null },
  kie: { power: 'germany', unitType: 'fleet', coast: null },
  rom: { power: 'italy', unitType: 'army', coast: null },
  ven: { power: 'italy', unitType: 'army', coast: null },
  nap: { power: 'italy', unitType: 'fleet', coast: null },
  mos: { power: 'russia', unitType: 'army', coast: null },
  war: { power: 'russia', unitType: 'army', coast: null },
  sev: { power: 'russia', unitType: 'fleet', coast: null },
  stp: { power: 'russia', unitType: 'fleet', coast: 'sc' },
  ank: { power: 'turkey', unitType: 'fleet', coast: null },
  con: { power: 'turkey', unitType: 'army', coast: null },
  smy: { power: 'turkey', unitType: 'army', coast: null },
};

export const INITIAL_SUPPLY_CENTERS: SupplyCenterOwnership = {
  bud: 'austria',
  tri: 'austria',
  vie: 'austria',
  edi: 'england',
  lvp: 'england',
  lon: 'england',
  bre: 'france',
  mar: 'france',
  par: 'france',
  ber: 'germany',
  kie: 'germany',
  mun: 'germany',
  nap: 'italy',
  rom: 'italy',
  ven: 'italy',
  mos: 'russia',
  sev: 'russia',
  stp: 'russia',
  war: 'russia',
  ank: 'turkey',
  con: 'turkey',
  smy: 'turkey',
  bel: null,
  bul: null,
  den: null,
  gre: null,
  hol: null,
  nwy: null,
  por: null,
  rum: null,
  ser: null,
  spa: null,
  swe: null,
  tun: null,
};
