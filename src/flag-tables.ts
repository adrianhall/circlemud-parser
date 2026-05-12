import type { FlagTable } from './types.js';

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
