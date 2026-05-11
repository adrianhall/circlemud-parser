export const VERSION = '0.1.0';

export { MudParserError } from './errors.js';
export {
  bitvectorSetToAsciiFlags,
  bitvectorToAsciiFlags,
  resolveFlagNames,
  resolveFlagSetNames,
} from './flags.js';
export {
  MudReader,
  parseAsciiAffectFlag,
  parseAsciiFlag,
  parseAt,
  readMudNumber,
  readMudString,
  skipMudSpaces,
} from './reader.js';
export { RecordType } from './types.js';

export type { MudParserErrorContext } from './errors.js';
export type { ReaderOptions } from './reader.js';
export type { BitVector, BitVectorSet, FlagTable, MudInput, SourceSpan, Vnum } from './types.js';
