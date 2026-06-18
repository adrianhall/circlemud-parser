/**
 * Parser for CircleMUD/tbaMUD world room files (`.wld`).
 *
 * World files contain one or more room records. Each room preserves unresolved VNUM references,
 * exposes resolved room and exit flag names, and keeps DG trigger attachments as trigger VNUMs.
 */
import { readFileSync } from 'node:fs';

import { EXIT_FLAGS, ROOM_FLAGS } from '../flag-tables.js';
import {
  bitvectorSetToAsciiFlags,
  bitvectorToAsciiFlags,
  resolveFlagNames,
  resolveFlagSetNames,
} from '../flags.js';
import { type ParseOptions } from '../options.js';
import { MudReader, parseAsciiFlag, skipMudSpaces } from '../reader.js';
import { WorldRecord } from '../records/index.js';
import { RecordType } from '../types.js';
import {
  emitWarning,
  fail,
  normalizeParseOptions,
  parseFourBitVectorTokens,
  parseRecordHeader,
  parseTokenInteger,
  parseTriggerAttachmentLine,
  readContentLine,
  readerOptionsFrom,
  readSourceString,
  requireContentLine,
  sourceForLine,
  sourceForReader,
  splitKeywords,
  type ParserContext,
  type SourceLine,
} from './internal/index.js';
import type { BitVector, BitVectorSet, MudInput, Vnum } from '../types.js';
import type { ExtraDescription, RoomDirection } from '../records/index.js';

type WorldParserContext = ParserContext<RecordType.World>;

/** Parsed room numeric fields before public flag-name resolution. */
interface RoomNumbers {
  /** Four-element room flag bitvector set. */
  readonly roomFlagsSet: BitVectorSet;

  /** Numeric sector type from the room header. */
  readonly sectorType: number;
}

/** Result of parsing one room record plus any lookahead line for the next record. */
interface WorldRecordParseResult {
  /** Parsed world room record. */
  readonly record: WorldRecord;

  /** Already-read next non-trigger line, when present. */
  readonly nextLine?: SourceLine;
}

/** Parsed trigger attachment block following an `S` room terminator. */
interface TriggerBlockResult {
  /** DG trigger VNUMs attached to the room. */
  readonly triggerVnums: readonly Vnum[];

  /** Last source line considered part of the room record. */
  readonly endLine: number;

  /** Already-read next non-trigger line, when present. */
  readonly nextLine?: SourceLine;
}

/** Parsed three-number direction control line. */
interface DirectionNumbers {
  /** Encoded tbaMUD door type value. */
  readonly doorType: number;

  /** Raw key VNUM or absent-key sentinel. */
  readonly keyVnum: Vnum;

  /** Raw target room VNUM or absent-room sentinel. */
  readonly toRoomVnum: Vnum;
}

const RECORD_SENTINEL_VNUM = 99999;
const SECT_INSIDE = 0;
const NUM_ROOM_SECTORS = 10;
const NUM_OF_DIRS = 10;

/**
 * Reads and parses one `.wld` file from disk.
 *
 * @param fileName - Path to the world file to read.
 * @param options - Parser options controlling encoding, source names, warnings, and logging.
 * @returns Parsed world room records.
 * @throws ParseError if the file contents are not valid world data.
 */
export function parseWorldFile(fileName: string, options: ParseOptions = {}): WorldRecord[] {
  const input = readFileSync(fileName);
  return parseWorld(input, {
    ...options,
    sourceName: options.sourceName ?? fileName,
  });
}

/**
 * Parses world room content from a string or Buffer.
 *
 * Supports both the old three-field room numeric line and the newer tbaMUD six-field layout with
 * four room flag bitvectors. Room exits preserve target/key VNUMs unless source sentinel values
 * explicitly mark them absent.
 *
 * @param input - World file contents as a string or Buffer.
 * @param options - Parser options controlling encoding, source names, warnings, and logging.
 * @returns Parsed world room records.
 * @throws ParseError if the input is not valid world data.
 */
export function parseWorld(input: MudInput, options: ParseOptions = {}): WorldRecord[] {
  const context = normalizeParseOptions(options, RecordType.World);
  const reader = new MudReader(input, readerOptionsFrom(options));
  const records: WorldRecord[] = [];
  let pendingLine: SourceLine | undefined;

  for (;;) {
    const line = pendingLine ?? readContentLine(reader);
    pendingLine = undefined;

    if (line === null) {
      fail(
        'Expected world record header or $ before EOF',
        context,
        sourceForReader(reader, context),
      );
    }

    const text = skipMudSpaces(line.text);

    if (text.startsWith('$')) {
      return records;
    }

    const vnum = parseRecordHeader(text, context, line, 'world');

    if (vnum >= RECORD_SENTINEL_VNUM) {
      return records;
    }

    const result = parseWorldRecord(reader, context, line, vnum);
    records.push(result.record);
    pendingLine = result.nextLine;
  }
}

/**
 * Parses one complete world room record from the current reader position.
 *
 * @param reader - Cursor over the world input positioned after the room header.
 * @param context - Normalized parser context.
 * @param headerLine - Source line containing the room header.
 * @param vnum - Room VNUM from the header.
 * @returns Parsed record plus optional lookahead line for the next outer-loop iteration.
 * @throws ParseError if the room body is malformed.
 */
function parseWorldRecord(
  reader: MudReader,
  context: WorldParserContext,
  headerLine: SourceLine,
  vnum: Vnum,
): WorldRecordParseResult {
  const name = readSourceString(reader, context, `room #${vnum} name`, vnum);

  if (name === null) {
    fail('Expected room name', context, sourceForReader(reader, context), vnum);
  }

  const description = readSourceString(reader, context, `room #${vnum} description`, vnum);
  const numericLine = requireContentLine(
    reader,
    context,
    'Expected room flags and sector line',
    vnum,
  );
  const numbers = parseRoomNumbers(numericLine.text);

  if (numbers === null) {
    fail(
      'Expected 3 or 6 numeric fields for room flags and sector',
      context,
      sourceForLine(context, numericLine.startLine),
      vnum,
    );
  }

  const directions: RoomDirection[] = [];
  const extraDescriptions: ExtraDescription[] = [];
  let sectorType = numbers.sectorType;

  if (sectorType > NUM_ROOM_SECTORS) {
    emitWarning(
      `Normalized out-of-range sector type ${sectorType} to ${SECT_INSIDE}`,
      context,
      sourceForLine(context, numericLine.startLine),
      vnum,
    );
    sectorType = SECT_INSIDE;
  }

  for (;;) {
    const line = requireContentLine(reader, context, 'Expected D, E, or S room body marker', vnum);
    const text = skipMudSpaces(line.text);
    const marker = text.charAt(0);

    if (marker === 'D') {
      directions.push(parseRoomDirection(reader, context, line, text, vnum));
    } else if (marker === 'E') {
      extraDescriptions.push(parseExtraDescription(reader, context, vnum));
    } else if (marker === 'S') {
      const triggers = parseRoomTriggers(reader, context, line, vnum);
      return recordResult(
        new WorldRecord({
          vnum,
          name,
          description,
          roomFlags: resolveFlagSetNames(numbers.roomFlagsSet, ROOM_FLAGS),
          roomFlagsBits: bitvectorSetToAsciiFlags(numbers.roomFlagsSet),
          sectorType,
          directions,
          extraDescriptions,
          triggerVnums: triggers.triggerVnums,
          source: sourceForLine(context, headerLine.startLine, triggers.endLine),
        }),
        triggers.nextLine,
      );
    } else {
      fail(
        `Expected D, E, or S room body marker, received '${marker}'`,
        context,
        sourceForLine(context, line.startLine),
        vnum,
      );
    }
  }
}

/**
 * Constructs a parse result while omitting absent optional lookahead lines.
 *
 * @param record - Parsed room record.
 * @param nextLine - Already-read next line.
 * @returns Parse result with exact optional-property semantics.
 */
function recordResult(
  record: WorldRecord,
  nextLine: SourceLine | undefined,
): WorldRecordParseResult {
  if (nextLine === undefined) {
    return { record };
  }

  return { record, nextLine };
}

/**
 * Parses either supported room numeric line shape.
 *
 * Old files provide three fields: source zone, one room flag token, and sector type. New tbaMUD
 * files provide six fields: source zone, four room flag tokens, and sector type.
 *
 * @param line - Source line containing room flags and sector type.
 * @returns Parsed room numeric data, or `null` when unsupported or malformed.
 */
function parseRoomNumbers(line: string): RoomNumbers | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 3) {
    const sourceZone = parseTokenInteger(tokens[0]);
    const sectorType = parseTokenInteger(tokens[2]);
    const roomFlagsSet = parseFourBitVectorTokens(tokens[1], '0', '0', '0', parseAsciiFlag);

    if (sourceZone === null || sectorType === null || roomFlagsSet === null) {
      return null;
    }

    return {
      roomFlagsSet,
      sectorType,
    };
  }

  if (tokens.length === 6) {
    const sourceZone = parseTokenInteger(tokens[0]);
    const sectorType = parseTokenInteger(tokens[5]);
    const roomFlagsSet = parseFourBitVectorTokens(
      tokens[1],
      tokens[2],
      tokens[3],
      tokens[4],
      parseAsciiFlag,
    );

    if (sourceZone === null || sectorType === null || roomFlagsSet === null) {
      return null;
    }

    return {
      roomFlagsSet,
      sectorType,
    };
  }

  return null;
}

/**
 * Parses one room direction subrecord.
 *
 * @param reader - Cursor over the world input positioned after the `D<dir>` line.
 * @param context - Normalized parser context.
 * @param line - Source line containing the direction marker.
 * @param text - Trimmed direction marker text.
 * @param vnum - Room VNUM used for error and warning context.
 * @returns Parsed room direction data.
 * @throws ParseError if the direction record is malformed.
 */
function parseRoomDirection(
  reader: MudReader,
  context: WorldParserContext,
  line: SourceLine,
  text: string,
  vnum: Vnum,
): RoomDirection {
  const direction = parseTokenInteger(text.slice(1).trim());

  if (direction === null || direction < 0 || direction >= NUM_OF_DIRS) {
    fail(
      'Expected room direction D0 through D9',
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
  }

  const description = readSourceString(
    reader,
    context,
    `room #${vnum} direction D${direction} description`,
    vnum,
  );
  const keywordString = readSourceString(
    reader,
    context,
    `room #${vnum} direction D${direction} keywords`,
    vnum,
  );
  const numericLine = requireContentLine(
    reader,
    context,
    `Expected numeric line for room direction D${direction}`,
    vnum,
  );
  const numbers = parseDirectionNumbers(numericLine.text);

  if (numbers === null) {
    fail(
      `Expected three numeric fields for room direction D${direction}`,
      context,
      sourceForLine(context, numericLine.startLine),
      vnum,
    );
  }

  const exitFlagsValue = doorTypeToExitFlags(numbers.doorType);

  if (exitFlagsValue === null) {
    fail(
      `Unsupported door type ${numbers.doorType} for room direction D${direction}`,
      context,
      sourceForLine(context, numericLine.startLine),
      vnum,
    );
  }

  return {
    direction,
    description,
    keywords: splitKeywords(keywordString),
    exitFlags: resolveFlagNames(exitFlagsValue, EXIT_FLAGS),
    exitFlagsBits: bitvectorToAsciiFlags(exitFlagsValue),
    keyVnum: coerceKeyVnum(numbers.keyVnum, direction, context, vnum),
    toRoomVnum: coerceToRoomVnum(numbers.toRoomVnum, direction, context, vnum),
  };
}

/**
 * Parses the three numeric fields used by a direction subrecord.
 *
 * @param line - Source line containing door type, key VNUM, and target room VNUM.
 * @returns Parsed direction numeric data, or `null` when malformed.
 */
function parseDirectionNumbers(line: string): DirectionNumbers | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean);

  if (tokens.length !== 3) {
    return null;
  }

  const doorType = parseTokenInteger(tokens[0]);
  const keyVnum = parseTokenInteger(tokens[1]);
  const toRoomVnum = parseTokenInteger(tokens[2]);

  if (doorType === null || keyVnum === null || toRoomVnum === null) {
    return null;
  }

  return {
    doorType,
    keyVnum,
    toRoomVnum,
  };
}

/**
 * Converts a tbaMUD door-type field into the equivalent exit bitvector.
 *
 * @param doorType - Encoded door type value from the direction numeric line.
 * @returns Exit bitvector, or `null` when the value is unsupported.
 */
function doorTypeToExitFlags(doorType: number): BitVector | null {
  switch (doorType) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 1 + 8;
    case 3:
      return 1 + 16;
    case 4:
      return 1 + 8 + 16;
    default:
      return null;
  }
}

/**
 * Converts absent-key sentinels to public `null`.
 *
 * The C loader (`data/tbamud/src/db.c`) silently maps key sentinels `-1` and `65535` to `NOTHING`,
 * so this is normal data rather than a recoverable problem. It is logged at debug level only.
 *
 * @param value - Raw source key VNUM.
 * @param direction - Direction index used in the debug message.
 * @param context - Normalized parser context.
 * @param vnum - Room VNUM used for debug context.
 * @returns Public key VNUM or `null`.
 */
function coerceKeyVnum(
  value: Vnum,
  direction: number,
  context: WorldParserContext,
  vnum: Vnum,
): Vnum | null {
  if (value === -1 || value === 65535) {
    context.logger.debug(`Coerced key sentinel ${value} to null for room #${vnum} D${direction}`);
    return null;
  }

  return value;
}

/**
 * Converts absent-target sentinels to public `null`.
 *
 * The C loader (`data/tbamud/src/db.c`) silently maps target sentinels `-1` and `0` to `NOWHERE`,
 * so this is normal data rather than a recoverable problem. It is logged at debug level only.
 *
 * @param value - Raw source target room VNUM.
 * @param direction - Direction index used in the debug message.
 * @param context - Normalized parser context.
 * @param vnum - Room VNUM used for debug context.
 * @returns Public target room VNUM or `null`.
 */
function coerceToRoomVnum(
  value: Vnum,
  direction: number,
  context: WorldParserContext,
  vnum: Vnum,
): Vnum | null {
  if (value === -1 || value === 0) {
    context.logger.debug(
      `Coerced target room sentinel ${value} to null for room #${vnum} D${direction}`,
    );
    return null;
  }

  return value;
}

/**
 * Parses one room extra-description subrecord.
 *
 * @param reader - Cursor over the world input positioned after the `E` marker.
 * @param context - Normalized parser context.
 * @param vnum - Room VNUM used for error context.
 * @returns Parsed extra description data.
 * @throws ParseError if either tilde string is unterminated.
 */
function parseExtraDescription(
  reader: MudReader,
  context: WorldParserContext,
  vnum: Vnum,
): ExtraDescription {
  const keywords = readSourceString(reader, context, `room #${vnum} extra keywords`, vnum);
  const description = readSourceString(reader, context, `room #${vnum} extra description`, vnum);

  return {
    keywords: splitKeywords(keywords),
    description,
  };
}

/**
 * Parses all DG trigger attachment lines following an `S` room terminator.
 *
 * @param reader - Cursor over the world input positioned after the `S` line.
 * @param context - Normalized parser context.
 * @param terminatorLine - Source line containing `S`.
 * @param vnum - Room VNUM used for warning context.
 * @returns Parsed trigger VNUMs plus optional lookahead line.
 */
function parseRoomTriggers(
  reader: MudReader,
  context: WorldParserContext,
  terminatorLine: SourceLine,
  vnum: Vnum,
): TriggerBlockResult {
  const triggerVnums: Vnum[] = [];
  let endLine = terminatorLine.startLine;

  for (;;) {
    const line = readContentLine(reader);

    if (line === null) {
      return {
        triggerVnums,
        endLine,
      };
    }

    const text = skipMudSpaces(line.text);

    if (!text.startsWith('T')) {
      return triggerBlockResult(triggerVnums, endLine, line);
    }

    const triggerVnum = parseTriggerAttachmentLine(text, context, line, vnum, 'room');

    if (triggerVnum !== null) {
      triggerVnums.push(triggerVnum);
    }

    endLine = line.startLine;
  }
}

/**
 * Constructs a trigger block result while omitting absent optional lookahead lines.
 *
 * @param triggerVnums - Parsed trigger VNUMs.
 * @param endLine - Last line considered part of the room record.
 * @param nextLine - Optional already-read next line.
 * @returns Trigger block result with exact optional-property semantics.
 */
function triggerBlockResult(
  triggerVnums: readonly Vnum[],
  endLine: number,
  nextLine: SourceLine,
): TriggerBlockResult {
  return { triggerVnums, endLine, nextLine };
}
