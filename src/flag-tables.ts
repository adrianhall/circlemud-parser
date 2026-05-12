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
 * Exit flag descriptions from `data/tbamud/src/constants.c` `exit_bits[]`.
 *
 * @remarks Index positions must remain aligned with the C source table because parsers use the
 * index as the public bit-position mapping.
 */
export const EXIT_FLAGS: FlagTable = ['DOOR', 'CLOSED', 'LOCKED', 'PICKPROOF'];

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
