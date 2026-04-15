// --- Powers ---
export const POWERS = [
  'england',
  'france',
  'germany',
  'russia',
  'austria',
  'italy',
  'turkey',
] as const;
export type Power = (typeof POWERS)[number];

// --- Seasons ---
export const SEASONS = ['spring', 'fall'] as const;
export type Season = (typeof SEASONS)[number];

// --- Unit Types ---
export const UNIT_TYPES = ['army', 'fleet'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

// --- Order Types ---
export const ORDER_TYPES = ['hold', 'move', 'support', 'convoy'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

// --- Game Phases ---
export const GAME_PHASES = [
  'order_submission',
  'order_resolution',
  'retreat_submission',
  'retreat_resolution',
  'build_submission',
  'build_resolution',
] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

// --- Room Statuses ---
export const ROOM_STATUSES = [
  'lobby',
  'playing',
  'completed',
  'abandoned',
] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

// --- Player Statuses ---
export const PLAYER_STATUSES = [
  'active',
  'civil_disorder',
  'eliminated',
] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

// --- Build Actions ---
export const BUILD_ACTIONS = ['build', 'disband', 'waive'] as const;
export type BuildAction = (typeof BUILD_ACTIONS)[number];

// --- Province Types ---
export const PROVINCE_TYPES = ['inland', 'water', 'coastal'] as const;
export type ProvinceType = (typeof PROVINCE_TYPES)[number];

// --- Order Result Types ---
export const ORDER_RESULT_TYPES = [
  'executed',
  'bounced',
  'dislodged',
  'cut',
  'void',
  'no_order',
] as const;
export type OrderResultType = (typeof ORDER_RESULT_TYPES)[number];

// --- Power Colors (for UI) ---
export const POWER_COLORS: Record<Power, string> = {
  austria: '#C41E3A',
  england: '#1E3A5F',
  france: '#4169E1',
  germany: '#2C2C2C',
  italy: '#228B22',
  russia: '#F5F5F5',
  turkey: '#DAA520',
};

// --- Unit ---
export interface Unit {
  power: Power;
  unitType: UnitType;
  coast?: string | null;
}

// --- Unit Positions: province ID -> unit occupying it ---
export type UnitPositions = Record<string, Unit>;

// --- Supply Center Ownership: province ID -> owning power (null = unowned) ---
export type SupplyCenterOwnership = Record<string, Power | null>;

// --- Dislodged Unit ---
export interface DislodgedUnit {
  power: Power;
  unitType: UnitType;
  province: string;
  coast?: string | null;
  dislodgedFrom: string;
  retreatOptions: string[];
}

// --- Order (engine input) ---
export interface Order {
  power: Power;
  unitType: UnitType;
  unitProvince: string;
  orderType: OrderType;
  targetProvince?: string | null;
  supportedUnitProvince?: string | null;
  viaConvoy?: boolean;
  coast?: string | null;
}

// --- Order Result (engine output) ---
export interface OrderResult {
  order: Order;
  success: boolean;
  resultType: OrderResultType;
  dislodgedFrom?: string | null;
  retreatOptions?: string[];
}

// --- Full Resolution Result ---
export interface ResolutionResult {
  orderResults: OrderResult[];
  newPositions: UnitPositions;
  dislodgedUnits: DislodgedUnit[];
  standoffProvinces: string[];
}

// --- Retreat Order ---
export interface RetreatOrder {
  power: Power;
  unitType: UnitType;
  unitProvince: string;
  retreatTo: string | null; // null = disband
}

export const RETREAT_RESULT_TYPES = [
  'retreated',
  'disbanded',
  'failed',
] as const;
export type RetreatResultType = (typeof RETREAT_RESULT_TYPES)[number];

export interface RetreatOrderResult {
  order: RetreatOrder;
  success: boolean;
  resultType: RetreatResultType;
  reason?: string | null;
}

// --- Retreat Resolution Result ---
export interface RetreatResult {
  newPositions: UnitPositions;
  disbandedUnits: Array<{ power: Power; unitType: UnitType; province: string }>;
  orderResults: RetreatOrderResult[];
}

// --- Build Order ---
export interface BuildOrder {
  power: Power;
  action: BuildAction;
  unitType?: UnitType | null;
  province: string;
  coast?: string | null;
}

// --- Build Resolution Result ---
export interface BuildResult {
  newPositions: UnitPositions;
  executed: BuildOrder[];
  failed: Array<{ order: BuildOrder; reason: string }>;
}

// --- Build Count (per power) ---
export interface BuildCount {
  power: Power;
  count: number; // positive = can build, negative = must disband
  availableHomeSCs: string[]; // unoccupied home SCs the power controls (for builds)
}

// --- Province Data ---
export interface ProvinceData {
  name: string;
  type: ProvinceType;
  supplyCenter: boolean;
  homePower: Power | null;
  coasts?: string[];
}
