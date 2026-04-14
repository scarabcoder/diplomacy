import type {
  Power,
  ProvinceData,
  UnitPositions,
  SupplyCenterOwnership,
} from './types.ts';

// ============================================================================
// PROVINCE DEFINITIONS
// 75 provinces: 56 land (inland + coastal) + 19 water
// ============================================================================

export const PROVINCES: Record<string, ProvinceData> = {
  // --- Austria (6 provinces, 3 home SCs) ---
  boh: { name: 'Bohemia', type: 'inland', supplyCenter: false, homePower: null },
  bud: { name: 'Budapest', type: 'inland', supplyCenter: true, homePower: 'austria' },
  gal: { name: 'Galicia', type: 'inland', supplyCenter: false, homePower: null },
  tri: { name: 'Trieste', type: 'coastal', supplyCenter: true, homePower: 'austria' },
  tyr: { name: 'Tyrolia', type: 'inland', supplyCenter: false, homePower: null },
  vie: { name: 'Vienna', type: 'inland', supplyCenter: true, homePower: 'austria' },

  // --- England (6 provinces, 3 home SCs) ---
  cly: { name: 'Clyde', type: 'coastal', supplyCenter: false, homePower: null },
  edi: { name: 'Edinburgh', type: 'coastal', supplyCenter: true, homePower: 'england' },
  lvp: { name: 'Liverpool', type: 'coastal', supplyCenter: true, homePower: 'england' },
  lon: { name: 'London', type: 'coastal', supplyCenter: true, homePower: 'england' },
  wal: { name: 'Wales', type: 'coastal', supplyCenter: false, homePower: null },
  yor: { name: 'Yorkshire', type: 'coastal', supplyCenter: false, homePower: null },

  // --- France (6 provinces, 3 home SCs) ---
  bre: { name: 'Brest', type: 'coastal', supplyCenter: true, homePower: 'france' },
  bur: { name: 'Burgundy', type: 'inland', supplyCenter: false, homePower: null },
  gas: { name: 'Gascony', type: 'coastal', supplyCenter: false, homePower: null },
  mar: { name: 'Marseilles', type: 'coastal', supplyCenter: true, homePower: 'france' },
  par: { name: 'Paris', type: 'inland', supplyCenter: true, homePower: 'france' },
  pic: { name: 'Picardy', type: 'coastal', supplyCenter: false, homePower: null },

  // --- Germany (6 provinces, 3 home SCs) ---
  ber: { name: 'Berlin', type: 'coastal', supplyCenter: true, homePower: 'germany' },
  kie: { name: 'Kiel', type: 'coastal', supplyCenter: true, homePower: 'germany' },
  mun: { name: 'Munich', type: 'inland', supplyCenter: true, homePower: 'germany' },
  pru: { name: 'Prussia', type: 'coastal', supplyCenter: false, homePower: null },
  ruh: { name: 'Ruhr', type: 'inland', supplyCenter: false, homePower: null },
  sil: { name: 'Silesia', type: 'inland', supplyCenter: false, homePower: null },

  // --- Italy (6 provinces, 3 home SCs) ---
  apu: { name: 'Apulia', type: 'coastal', supplyCenter: false, homePower: null },
  nap: { name: 'Naples', type: 'coastal', supplyCenter: true, homePower: 'italy' },
  pie: { name: 'Piedmont', type: 'coastal', supplyCenter: false, homePower: null },
  rom: { name: 'Rome', type: 'coastal', supplyCenter: true, homePower: 'italy' },
  tus: { name: 'Tuscany', type: 'coastal', supplyCenter: false, homePower: null },
  ven: { name: 'Venice', type: 'coastal', supplyCenter: true, homePower: 'italy' },

  // --- Russia (7 provinces, 4 home SCs) ---
  fin: { name: 'Finland', type: 'coastal', supplyCenter: false, homePower: null },
  lvn: { name: 'Livonia', type: 'coastal', supplyCenter: false, homePower: null },
  mos: { name: 'Moscow', type: 'inland', supplyCenter: true, homePower: 'russia' },
  sev: { name: 'Sevastopol', type: 'coastal', supplyCenter: true, homePower: 'russia' },
  stp: {
    name: 'St. Petersburg',
    type: 'coastal',
    supplyCenter: true,
    homePower: 'russia',
    coasts: ['nc', 'sc'],
  },
  ukr: { name: 'Ukraine', type: 'inland', supplyCenter: false, homePower: null },
  war: { name: 'Warsaw', type: 'inland', supplyCenter: true, homePower: 'russia' },

  // --- Turkey (5 provinces, 3 home SCs) ---
  ank: { name: 'Ankara', type: 'coastal', supplyCenter: true, homePower: 'turkey' },
  arm: { name: 'Armenia', type: 'coastal', supplyCenter: false, homePower: null },
  con: { name: 'Constantinople', type: 'coastal', supplyCenter: true, homePower: 'turkey' },
  smy: { name: 'Smyrna', type: 'coastal', supplyCenter: true, homePower: 'turkey' },
  syr: { name: 'Syria', type: 'coastal', supplyCenter: false, homePower: null },

  // --- Neutral land (14 provinces, 12 SCs) ---
  alb: { name: 'Albania', type: 'coastal', supplyCenter: false, homePower: null },
  bel: { name: 'Belgium', type: 'coastal', supplyCenter: true, homePower: null },
  bul: {
    name: 'Bulgaria',
    type: 'coastal',
    supplyCenter: true,
    homePower: null,
    coasts: ['ec', 'sc'],
  },
  den: { name: 'Denmark', type: 'coastal', supplyCenter: true, homePower: null },
  gre: { name: 'Greece', type: 'coastal', supplyCenter: true, homePower: null },
  hol: { name: 'Holland', type: 'coastal', supplyCenter: true, homePower: null },
  nwy: { name: 'Norway', type: 'coastal', supplyCenter: true, homePower: null },
  naf: { name: 'North Africa', type: 'coastal', supplyCenter: false, homePower: null },
  por: { name: 'Portugal', type: 'coastal', supplyCenter: true, homePower: null },
  rum: { name: 'Rumania', type: 'coastal', supplyCenter: true, homePower: null },
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
  adr: { name: 'Adriatic Sea', type: 'water', supplyCenter: false, homePower: null },
  aeg: { name: 'Aegean Sea', type: 'water', supplyCenter: false, homePower: null },
  bal: { name: 'Baltic Sea', type: 'water', supplyCenter: false, homePower: null },
  bar: { name: 'Barents Sea', type: 'water', supplyCenter: false, homePower: null },
  bla: { name: 'Black Sea', type: 'water', supplyCenter: false, homePower: null },
  eas: { name: 'Eastern Mediterranean', type: 'water', supplyCenter: false, homePower: null },
  eng: { name: 'English Channel', type: 'water', supplyCenter: false, homePower: null },
  bot: { name: 'Gulf of Bothnia', type: 'water', supplyCenter: false, homePower: null },
  gol: { name: 'Gulf of Lyon', type: 'water', supplyCenter: false, homePower: null },
  hel: { name: 'Helgoland Bight', type: 'water', supplyCenter: false, homePower: null },
  ion: { name: 'Ionian Sea', type: 'water', supplyCenter: false, homePower: null },
  iri: { name: 'Irish Sea', type: 'water', supplyCenter: false, homePower: null },
  mid: { name: 'Mid-Atlantic Ocean', type: 'water', supplyCenter: false, homePower: null },
  nat: { name: 'North Atlantic Ocean', type: 'water', supplyCenter: false, homePower: null },
  nth: { name: 'North Sea', type: 'water', supplyCenter: false, homePower: null },
  nrg: { name: 'Norwegian Sea', type: 'water', supplyCenter: false, homePower: null },
  ska: { name: 'Skagerrak', type: 'water', supplyCenter: false, homePower: null },
  tyn: { name: 'Tyrrhenian Sea', type: 'water', supplyCenter: false, homePower: null },
  wes: { name: 'Western Mediterranean', type: 'water', supplyCenter: false, homePower: null },
};

// ============================================================================
// ARMY ADJACENCIES
// Which provinces can an army in province X move to?
// Only land provinces (inland + coastal) have army adjacencies.
// ============================================================================

export const ARMY_ADJACENCIES: Record<string, string[]> = {
  // Austria
  boh: ['mun', 'sil', 'gal', 'vie', 'tyr'],
  bud: ['vie', 'tri', 'ser', 'rum', 'gal'],
  gal: ['boh', 'sil', 'war', 'ukr', 'rum', 'bud', 'vie'],
  tri: ['ven', 'tyr', 'vie', 'bud', 'ser', 'alb'],
  tyr: ['mun', 'boh', 'vie', 'tri', 'ven', 'pie'],
  vie: ['tyr', 'boh', 'gal', 'bud', 'tri'],

  // England
  cly: ['edi', 'lvp'],
  edi: ['cly', 'yor'],
  lvp: ['cly', 'yor', 'wal'],
  lon: ['yor', 'wal'],
  wal: ['lvp', 'yor', 'lon'],
  yor: ['edi', 'lvp', 'wal', 'lon'],

  // France
  bre: ['pic', 'par', 'gas'],
  bur: ['par', 'pic', 'bel', 'ruh', 'mun', 'mar', 'gas'],
  gas: ['bre', 'par', 'bur', 'mar', 'spa'],
  mar: ['gas', 'bur', 'pie', 'spa'],
  par: ['pic', 'bre', 'gas', 'bur'],
  pic: ['bel', 'bur', 'par', 'bre'],

  // Germany
  ber: ['kie', 'mun', 'sil', 'pru'],
  kie: ['hol', 'den', 'ber', 'mun', 'ruh'],
  mun: ['ruh', 'kie', 'ber', 'sil', 'boh', 'tyr', 'bur'],
  pru: ['ber', 'sil', 'war', 'lvn'],
  ruh: ['bel', 'hol', 'kie', 'mun', 'bur'],
  sil: ['mun', 'ber', 'pru', 'war', 'gal', 'boh'],

  // Italy
  apu: ['ven', 'rom', 'nap'],
  nap: ['rom', 'apu'],
  pie: ['mar', 'tyr', 'ven', 'tus'],
  rom: ['tus', 'apu', 'nap', 'ven'],
  tus: ['pie', 'ven', 'rom'],
  ven: ['pie', 'tyr', 'tri', 'apu', 'rom', 'tus'],

  // Russia
  fin: ['nwy', 'stp', 'swe'],
  lvn: ['stp', 'mos', 'war', 'pru'],
  mos: ['stp', 'lvn', 'war', 'ukr', 'sev'],
  sev: ['mos', 'ukr', 'rum', 'arm'],
  stp: ['fin', 'nwy', 'mos', 'lvn'],
  ukr: ['mos', 'war', 'gal', 'rum', 'sev'],
  war: ['lvn', 'mos', 'ukr', 'gal', 'sil', 'pru'],

  // Turkey
  ank: ['con', 'smy', 'arm'],
  arm: ['ank', 'smy', 'syr', 'sev'],
  con: ['ank', 'smy', 'bul'],
  smy: ['con', 'ank', 'arm', 'syr'],
  syr: ['smy', 'arm'],

  // Neutrals
  alb: ['tri', 'ser', 'gre'],
  bel: ['hol', 'ruh', 'bur', 'pic'],
  bul: ['con', 'gre', 'ser', 'rum'],
  den: ['kie', 'swe'],
  gre: ['alb', 'ser', 'bul'],
  hol: ['bel', 'ruh', 'kie'],
  nwy: ['stp', 'fin', 'swe'],
  naf: ['tun'],
  por: ['spa'],
  rum: ['bud', 'gal', 'ukr', 'sev', 'bul', 'ser'],
  ser: ['bud', 'tri', 'alb', 'gre', 'bul', 'rum'],
  spa: ['por', 'gas', 'mar'],
  swe: ['nwy', 'fin', 'den'],
  tun: ['naf'],
};

// ============================================================================
// FLEET ADJACENCIES
// Which provinces can a fleet in province X move to?
// For multi-coast provinces (bul, spa, stp), use "province/coast" keys.
// Values may also reference "province/coast" for multi-coast destinations.
// Water provinces and coastal provinces have fleet adjacencies.
// ============================================================================

export const FLEET_ADJACENCIES: Record<string, string[]> = {
  // --- Austria ---
  tri: ['adr', 'alb', 'ven'],

  // --- England ---
  cly: ['edi', 'lvp', 'nat', 'nrg'],
  edi: ['cly', 'nth', 'nrg'],
  lvp: ['cly', 'iri', 'nat', 'wal'],
  lon: ['eng', 'nth', 'wal', 'yor'],
  wal: ['eng', 'iri', 'lon', 'lvp'],
  yor: ['lon', 'nth'],

  // --- France ---
  bre: ['eng', 'gas', 'mid', 'pic'],
  gas: ['bre', 'mid', 'spa/nc'],
  mar: ['gol', 'pie', 'spa/sc'],
  pic: ['bel', 'bre', 'eng'],

  // --- Germany ---
  ber: ['bal', 'kie', 'pru'],
  kie: ['bal', 'den', 'hel', 'hol'],
  pru: ['bal', 'ber', 'lvn'],

  // --- Italy ---
  apu: ['adr', 'ion', 'nap', 'ven'],
  nap: ['apu', 'ion', 'tyn', 'rom'],
  pie: ['gol', 'mar', 'tus'],
  rom: ['nap', 'tus', 'tyn'],
  tus: ['gol', 'pie', 'rom', 'tyn'],
  ven: ['adr', 'apu', 'tri'],

  // --- Russia ---
  fin: ['bot', 'stp/sc', 'swe'],
  lvn: ['bal', 'bot', 'pru', 'stp/sc'],
  sev: ['arm', 'bla', 'rum'],
  'stp/nc': ['bar', 'nwy'],
  'stp/sc': ['bot', 'fin', 'lvn'],

  // --- Turkey ---
  ank: ['arm', 'bla', 'con'],
  arm: ['ank', 'bla', 'sev'],
  con: ['aeg', 'bla', 'bul/ec', 'bul/sc', 'smy'],
  smy: ['aeg', 'con', 'eas', 'syr'],
  syr: ['eas', 'smy'],

  // --- Neutrals ---
  alb: ['adr', 'gre', 'ion', 'tri'],
  bel: ['eng', 'hol', 'nth', 'pic'],
  'bul/ec': ['bla', 'con', 'rum'],
  'bul/sc': ['aeg', 'con', 'gre'],
  den: ['bal', 'hel', 'kie', 'nth', 'ska', 'swe'],
  gre: ['aeg', 'alb', 'bul/sc', 'ion'],
  hol: ['bel', 'hel', 'nth'],
  nwy: ['bar', 'nth', 'nrg', 'ska', 'swe'],
  naf: ['mid', 'tun', 'wes'],
  por: ['mid', 'spa/nc', 'spa/sc'],
  rum: ['bla', 'bul/ec', 'sev'],
  'spa/nc': ['gas', 'mid', 'por'],
  'spa/sc': ['gol', 'mar', 'mid', 'por', 'wes'],
  swe: ['bal', 'bot', 'den', 'fin', 'nwy', 'ska'],
  tun: ['ion', 'naf', 'tyn', 'wes'],

  // --- Water ---
  adr: ['alb', 'apu', 'ion', 'tri', 'ven'],
  aeg: ['bul/sc', 'con', 'eas', 'gre', 'ion', 'smy'],
  bal: ['ber', 'bot', 'den', 'kie', 'lvn', 'pru', 'swe'],
  bar: ['nwy', 'nrg', 'stp/nc'],
  bla: ['ank', 'arm', 'bul/ec', 'con', 'rum', 'sev'],
  eas: ['aeg', 'ion', 'smy', 'syr'],
  eng: ['bel', 'bre', 'iri', 'lon', 'mid', 'nth', 'pic', 'wal'],
  bot: ['bal', 'fin', 'lvn', 'stp/sc', 'swe'],
  gol: ['mar', 'pie', 'spa/sc', 'tus', 'tyn', 'wes'],
  hel: ['den', 'hol', 'kie', 'nth'],
  ion: ['adr', 'aeg', 'alb', 'apu', 'eas', 'gre', 'nap', 'tun', 'tyn'],
  iri: ['eng', 'lvp', 'mid', 'nat', 'wal'],
  mid: ['bre', 'eng', 'gas', 'iri', 'naf', 'nat', 'por', 'spa/nc', 'spa/sc', 'wes'],
  nat: ['cly', 'iri', 'lvp', 'mid', 'nrg'],
  nth: ['bel', 'den', 'edi', 'eng', 'hel', 'hol', 'lon', 'nrg', 'nwy', 'ska', 'yor'],
  nrg: ['bar', 'cly', 'edi', 'nat', 'nth', 'nwy'],
  ska: ['den', 'nth', 'nwy', 'swe'],
  tyn: ['gol', 'ion', 'nap', 'rom', 'tun', 'tus', 'wes'],
  wes: ['gol', 'mid', 'naf', 'spa/sc', 'tun', 'tyn'],
};

// ============================================================================
// HOME SUPPLY CENTERS
// ============================================================================

export const HOME_SUPPLY_CENTERS: Record<Power, string[]> = {
  austria: ['bud', 'tri', 'vie'],
  england: ['edi', 'lvp', 'lon'],
  france: ['bre', 'mar', 'par'],
  germany: ['ber', 'kie', 'mun'],
  italy: ['nap', 'rom', 'ven'],
  russia: ['mos', 'sev', 'stp', 'war'],
  turkey: ['ank', 'con', 'smy'],
};

// ============================================================================
// ALL SUPPLY CENTERS (34 total)
// ============================================================================

export const SUPPLY_CENTERS: string[] = Object.entries(PROVINCES)
  .filter(([_, p]) => p.supplyCenter)
  .map(([id]) => id);

// ============================================================================
// STARTING POSITIONS (22 units)
// ============================================================================

export const STARTING_POSITIONS: UnitPositions = {
  // Austria: A Vienna, A Budapest, F Trieste
  vie: { power: 'austria', unitType: 'army', coast: null },
  bud: { power: 'austria', unitType: 'army', coast: null },
  tri: { power: 'austria', unitType: 'fleet', coast: null },

  // England: F London, F Edinburgh, A Liverpool
  lon: { power: 'england', unitType: 'fleet', coast: null },
  edi: { power: 'england', unitType: 'fleet', coast: null },
  lvp: { power: 'england', unitType: 'army', coast: null },

  // France: A Paris, A Marseilles, F Brest
  par: { power: 'france', unitType: 'army', coast: null },
  mar: { power: 'france', unitType: 'army', coast: null },
  bre: { power: 'france', unitType: 'fleet', coast: null },

  // Germany: A Berlin, A Munich, F Kiel
  ber: { power: 'germany', unitType: 'army', coast: null },
  mun: { power: 'germany', unitType: 'army', coast: null },
  kie: { power: 'germany', unitType: 'fleet', coast: null },

  // Italy: A Rome, A Venice, F Naples
  rom: { power: 'italy', unitType: 'army', coast: null },
  ven: { power: 'italy', unitType: 'army', coast: null },
  nap: { power: 'italy', unitType: 'fleet', coast: null },

  // Russia: A Moscow, A Warsaw, F Sevastopol, F St. Petersburg (south coast)
  mos: { power: 'russia', unitType: 'army', coast: null },
  war: { power: 'russia', unitType: 'army', coast: null },
  sev: { power: 'russia', unitType: 'fleet', coast: null },
  stp: { power: 'russia', unitType: 'fleet', coast: 'sc' },

  // Turkey: F Ankara, A Constantinople, A Smyrna
  ank: { power: 'turkey', unitType: 'fleet', coast: null },
  con: { power: 'turkey', unitType: 'army', coast: null },
  smy: { power: 'turkey', unitType: 'army', coast: null },
};

// ============================================================================
// INITIAL SUPPLY CENTER OWNERSHIP
// ============================================================================

export const INITIAL_SUPPLY_CENTERS: SupplyCenterOwnership = {
  // Austria
  bud: 'austria',
  tri: 'austria',
  vie: 'austria',
  // England
  edi: 'england',
  lvp: 'england',
  lon: 'england',
  // France
  bre: 'france',
  mar: 'france',
  par: 'france',
  // Germany
  ber: 'germany',
  kie: 'germany',
  mun: 'germany',
  // Italy
  nap: 'italy',
  rom: 'italy',
  ven: 'italy',
  // Russia
  mos: 'russia',
  sev: 'russia',
  stp: 'russia',
  war: 'russia',
  // Turkey
  ank: 'turkey',
  con: 'turkey',
  smy: 'turkey',
  // Neutral supply centers
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the base province ID from a province/coast reference.
 * e.g., "stp/nc" -> "stp", "lon" -> "lon"
 */
export function getBaseProvince(provinceRef: string): string {
  const slashIndex = provinceRef.indexOf('/');
  return slashIndex === -1 ? provinceRef : provinceRef.substring(0, slashIndex);
}

/**
 * Get the coast from a province/coast reference.
 * e.g., "stp/nc" -> "nc", "lon" -> null
 */
export function getCoast(provinceRef: string): string | null {
  const slashIndex = provinceRef.indexOf('/');
  return slashIndex === -1 ? null : provinceRef.substring(slashIndex + 1);
}

/**
 * Check if a province is a multi-coast province.
 */
export function isMultiCoast(provinceId: string): boolean {
  const province = PROVINCES[provinceId];
  return province?.coasts != null && province.coasts.length > 0;
}

/**
 * Get valid army destinations from a province.
 */
export function getArmyMoves(province: string): string[] {
  return ARMY_ADJACENCIES[province] ?? [];
}

/**
 * Get valid fleet destinations from a province (optionally on a specific coast).
 * For multi-coast provinces, the coast must be specified.
 */
export function getFleetMoves(province: string, coast?: string | null): string[] {
  if (coast) {
    return FLEET_ADJACENCIES[`${province}/${coast}`] ?? [];
  }
  // Try the direct province key (for non-multi-coast provinces and water)
  return FLEET_ADJACENCIES[province] ?? [];
}

/**
 * Check if a unit can move from one province to an adjacent province.
 */
export function isAdjacent(
  from: string,
  to: string,
  unitType: 'army' | 'fleet',
  fromCoast?: string | null,
): boolean {
  if (unitType === 'army') {
    const destinations = getArmyMoves(from);
    // For armies, strip coast from destination (armies don't use coasts)
    return destinations.includes(getBaseProvince(to));
  }

  const destinations = getFleetMoves(from, fromCoast);
  // Fleet destinations may include coast-specific references
  // Check both exact match and base province match
  if (destinations.includes(to)) return true;

  // If destination is a multi-coast province and the move reference doesn't include a coast,
  // check if any coast of the destination is in the adjacency list
  const baseTo = getBaseProvince(to);
  if (isMultiCoast(baseTo) && !to.includes('/')) {
    return destinations.some((d) => getBaseProvince(d) === baseTo);
  }

  return false;
}

/**
 * Get the number of supply centers controlled by each power.
 */
export function countSupplyCenters(
  ownership: SupplyCenterOwnership,
): Record<Power, number> {
  const counts: Record<Power, number> = {
    england: 0,
    france: 0,
    germany: 0,
    russia: 0,
    austria: 0,
    italy: 0,
    turkey: 0,
  };

  for (const power of Object.values(ownership)) {
    if (power) {
      counts[power]++;
    }
  }

  return counts;
}

/**
 * Get the number of units each power has on the board.
 */
export function countUnits(positions: UnitPositions): Record<Power, number> {
  const counts: Record<Power, number> = {
    england: 0,
    france: 0,
    germany: 0,
    russia: 0,
    austria: 0,
    italy: 0,
    turkey: 0,
  };

  for (const unit of Object.values(positions)) {
    counts[unit.power]++;
  }

  return counts;
}
