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
