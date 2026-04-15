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
  edi: ['cly', 'lvp', 'yor'],
  lvp: ['cly', 'edi', 'yor', 'wal'],
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

export const FLEET_ADJACENCIES: Record<string, string[]> = {
  // --- Austria ---
  tri: ['adr', 'alb', 'ven'],

  // --- England ---
  cly: ['edi', 'lvp', 'nao', 'nwg'],
  edi: ['cly', 'nth', 'nwg', 'yor'],
  lvp: ['cly', 'iri', 'nao', 'wal'],
  lon: ['eng', 'nth', 'wal', 'yor'],
  wal: ['eng', 'iri', 'lon', 'lvp'],
  yor: ['edi', 'lon', 'nth'],

  // --- France ---
  bre: ['eng', 'gas', 'mao', 'pic'],
  gas: ['bre', 'mao', 'spa/nc'],
  mar: ['lyo', 'pie', 'spa/sc'],
  pic: ['bel', 'bre', 'eng'],

  // --- Germany ---
  ber: ['bal', 'kie', 'pru'],
  kie: ['bal', 'den', 'hel', 'hol'],
  pru: ['bal', 'ber', 'lvn'],

  // --- Italy ---
  apu: ['adr', 'ion', 'nap', 'ven'],
  nap: ['apu', 'ion', 'tys', 'rom'],
  pie: ['lyo', 'mar', 'tus'],
  rom: ['nap', 'tus', 'tys'],
  tus: ['lyo', 'pie', 'rom', 'tys'],
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
  nwy: ['bar', 'nth', 'nwg', 'ska', 'stp/nc', 'swe'],
  naf: ['mao', 'tun', 'wes'],
  por: ['mao', 'spa/nc', 'spa/sc'],
  rum: ['bla', 'bul/ec', 'sev'],
  'spa/nc': ['gas', 'mao', 'por'],
  'spa/sc': ['lyo', 'mar', 'mao', 'por', 'wes'],
  swe: ['bal', 'bot', 'den', 'fin', 'nwy', 'ska'],
  tun: ['ion', 'naf', 'tys', 'wes'],

  // --- Water ---
  adr: ['alb', 'apu', 'ion', 'tri', 'ven'],
  aeg: ['bul/sc', 'con', 'eas', 'gre', 'ion', 'smy'],
  bal: ['ber', 'bot', 'den', 'kie', 'lvn', 'pru', 'swe'],
  bar: ['nwy', 'nwg', 'stp/nc'],
  bla: ['ank', 'arm', 'bul/ec', 'con', 'rum', 'sev'],
  eas: ['aeg', 'ion', 'smy', 'syr'],
  eng: ['bel', 'bre', 'iri', 'lon', 'mao', 'nth', 'pic', 'wal'],
  bot: ['bal', 'fin', 'lvn', 'stp/sc', 'swe'],
  lyo: ['mar', 'pie', 'spa/sc', 'tus', 'tys', 'wes'],
  hel: ['den', 'hol', 'kie', 'nth'],
  ion: ['adr', 'aeg', 'alb', 'apu', 'eas', 'gre', 'nap', 'tun', 'tys'],
  iri: ['eng', 'lvp', 'mao', 'nao', 'wal'],
  mao: [
    'bre',
    'eng',
    'gas',
    'iri',
    'naf',
    'nao',
    'por',
    'spa/nc',
    'spa/sc',
    'wes',
  ],
  nao: ['cly', 'iri', 'lvp', 'mao', 'nwg'],
  nth: [
    'bel',
    'den',
    'edi',
    'eng',
    'hel',
    'hol',
    'lon',
    'nwg',
    'nwy',
    'ska',
    'yor',
  ],
  nwg: ['bar', 'cly', 'edi', 'nao', 'nth', 'nwy'],
  ska: ['den', 'nth', 'nwy', 'swe'],
  tys: ['lyo', 'ion', 'nap', 'rom', 'tun', 'tus', 'wes'],
  wes: ['lyo', 'mao', 'naf', 'spa/sc', 'tun', 'tys'],
};
