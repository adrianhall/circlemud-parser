import type { FlagTable } from './types.js';

/**
 * Room flag descriptions from `data/tbamud/src/constants.c` `room_bits[]`.
 *
 * @remarks Index positions must remain aligned with the C source table because parsers use the
 * index as the public bit-position mapping.
 */
export const ROOM_FLAGS: FlagTable = [
  'DARK',
  'DEATH',
  'NO_MOB',
  'INDOORS',
  'PEACEFUL',
  'SOUNDPROOF',
  'NO_TRACK',
  'NO_MAGIC',
  'TUNNEL',
  'PRIVATE',
  'GODROOM',
  'HOUSE',
  'HCRSH',
  'ATRIUM',
  'OLC',
  '*',
  'WORLDMAP',
];

/**
 * Zone flag descriptions from `data/tbamud/src/constants.c` `zone_bits[]`.
 *
 * @remarks Index positions must remain aligned with the C source table because parsers use the
 * index as the public bit-position mapping.
 */
export const ZONE_FLAGS: FlagTable = [
  'CLOSED',
  'NO_IMMORT',
  'QUEST',
  'GRID',
  'NOBUILD',
  '!ASTRAL',
  'WORLDMAP',
];

/**
 * Shop flag descriptions from `data/tbamud/src/shop.c` `shop_bits[]`.
 *
 * @remarks Index positions must remain aligned with the C source table because parsers use the
 * index as the public bit-position mapping.
 */
export const SHOP_FLAGS: FlagTable = ['WILL_FIGHT', 'USES_BANK', 'UNLIMITED_CASH'];

/**
 * Shop no-trade flag descriptions from `data/tbamud/src/shop.c` `trade_letters[]`.
 *
 * @remarks Set bits mean the shopkeeper refuses to trade with that customer category.
 */
export const TRADE_FLAGS: FlagTable = [
  'Good',
  'Evil',
  'Neutral',
  'Magic User',
  'Cleric',
  'Thief',
  'Warrior',
];

/** Quest type descriptions from `data/tbamud/src/quest.c` `quest_types[]`. */
export const QUEST_TYPES: FlagTable = [
  'Object',
  'Room',
  'Find mob',
  'Kill mob',
  'Save mob',
  'Return object',
  'Clear room',
];

/** Quest flag descriptions from `data/tbamud/src/quest.c` `aq_flags[]`. */
export const AQ_FLAGS: FlagTable = ['REPEATABLE'];

/**
 * Exit flag descriptions from `data/tbamud/src/constants.c` `exit_bits[]`.
 *
 * @remarks Index positions must remain aligned with the C source table because parsers use the
 * index as the public bit-position mapping.
 */
export const EXIT_FLAGS: FlagTable = ['DOOR', 'CLOSED', 'LOCKED', 'PICKPROOF'];

/**
 * Mobile action flag descriptions from `data/tbamud/src/constants.c` `action_bits[]`.
 *
 * @remarks Index positions must remain aligned with the C source table because parsers use the
 * index as the public bit-position mapping.
 */
export const ACTION_FLAGS: FlagTable = [
  'SPEC',
  'SENTINEL',
  'SCAVENGER',
  'ISNPC',
  'AWARE',
  'AGGR',
  'STAY-ZONE',
  'WIMPY',
  'AGGR_EVIL',
  'AGGR_GOOD',
  'AGGR_NEUTRAL',
  'MEMORY',
  'HELPER',
  'NO_CHARM',
  'NO_SUMMN',
  'NO_SLEEP',
  'NO_BASH',
  'NO_BLIND',
  'NO_KILL',
  'DEAD',
];

/**
 * Object extra flag descriptions from `data/tbamud/src/constants.c` `extra_bits[]`.
 *
 * @remarks Index positions must remain aligned with the C source table because parsers use the
 * index as the public bit-position mapping.
 */
export const EXTRA_FLAGS: FlagTable = [
  'GLOW',
  'HUM',
  'NO_RENT',
  'NO_DONATE',
  'NO_INVIS',
  'INVISIBLE',
  'MAGIC',
  'NO_DROP',
  'BLESS',
  'ANTI_GOOD',
  'ANTI_EVIL',
  'ANTI_NEUTRAL',
  'ANTI_MAGE',
  'ANTI_CLERIC',
  'ANTI_THIEF',
  'ANTI_WARRIOR',
  'NO_SELL',
  'QUEST_ITEM',
];

/**
 * Object wear flag descriptions from `data/tbamud/src/constants.c` `wear_bits[]`.
 *
 * @remarks Index positions must remain aligned with the C source table because parsers use the
 * index as the public bit-position mapping.
 */
export const WEAR_FLAGS: FlagTable = [
  'TAKE',
  'FINGER',
  'NECK',
  'BODY',
  'HEAD',
  'LEGS',
  'FEET',
  'HANDS',
  'ARMS',
  'SHIELD',
  'ABOUT',
  'WAIST',
  'WRIST',
  'WIELD',
  'HOLD',
];

/**
 * Affect flag descriptions from `data/tbamud/src/constants.c` `affected_bits[]`.
 *
 * @remarks Index 0 is intentionally a sentinel because affect flag parsing maps `a` to bit 1.
 */
export const AFFECTED_FLAGS: FlagTable = [
  '\0',
  'BLIND',
  'INVIS',
  'DET-ALIGN',
  'DET-INVIS',
  'DET-MAGIC',
  'SENSE-LIFE',
  'WATWALK',
  'SANCT',
  'GROUP',
  'CURSE',
  'INFRA',
  'POISON',
  'PROT-EVIL',
  'PROT-GOOD',
  'SLEEP',
  'NO_TRACK',
  'FLY',
  'SCUBA',
  'SNEAK',
  'HIDE',
  'UNUSED',
  'CHARM',
];

/** Object type descriptions from `data/tbamud/src/constants.c` `item_types[]`. */
export const ITEM_TYPES: FlagTable = [
  'UNDEFINED',
  'LIGHT',
  'SCROLL',
  'WAND',
  'STAFF',
  'WEAPON',
  'FURNITURE',
  'FREE',
  'TREASURE',
  'ARMOR',
  'POTION',
  'WORN',
  'OTHER',
  'TRASH',
  'FREE2',
  'CONTAINER',
  'NOTE',
  'LIQ CONTAINER',
  'KEY',
  'FOOD',
  'MONEY',
  'PEN',
  'BOAT',
  'FOUNTAIN',
];

/** Object affect apply descriptions from `data/tbamud/src/constants.c` `apply_types[]`. */
export const APPLY_TYPES: FlagTable = [
  'NONE',
  'STR',
  'DEX',
  'INT',
  'WIS',
  'CON',
  'CHA',
  'CLASS',
  'LEVEL',
  'AGE',
  'CHAR_WEIGHT',
  'CHAR_HEIGHT',
  'MAXMANA',
  'MAXHIT',
  'MAXMOVE',
  'GOLD',
  'EXP',
  'ARMOR',
  'HITROLL',
  'DAMROLL',
  'SAVING_PARA',
  'SAVING_ROD',
  'SAVING_PETRI',
  'SAVING_BREATH',
  'SAVING_SPELL',
];
