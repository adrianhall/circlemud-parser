/** Package version string. */
export const VERSION = '0.1.0';

export { MudParserError, ParseError } from './errors.js';
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
export {
  MobileRecord,
  MudRecord,
  ObjectRecord,
  QuestRecord,
  ShopRecord,
  WorldRecord,
  ZoneRecord,
} from './records.js';
export { parseMobile, parseMobileFile } from './parsers/mobile.js';
export { parseObject, parseObjectFile } from './parsers/object.js';
export { parseQuest, parseQuestFile } from './parsers/quest.js';
export { parseShop, parseShopFile } from './parsers/shop.js';
export { parseWorld, parseWorldFile } from './parsers/world.js';
export { parseZone, parseZoneFile } from './parsers/zone.js';
export { RecordType } from './types.js';

export type { MudParserErrorContext, ParseWarning } from './errors.js';
export type { Logger, ParseOptions } from './options.js';
export type { ReaderOptions } from './reader.js';
export type {
  ExtraDescription,
  DiceRoll,
  MobileEnhancedData,
  MobileRecordInit,
  MobileStats,
  ObjectAffect,
  ObjectRecordInit,
  QuestRecordInit,
  RoomDirection,
  ShopRecordInit,
  ShopTradeType,
  WorldRecordInit,
  ZoneCommand,
  ZoneRecordInit,
} from './records.js';
export type { BitVector, BitVectorSet, FlagTable, MudInput, SourceSpan, Vnum } from './types.js';
