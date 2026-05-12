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
import { type Logger, type ParseOptions, silentLogger } from '../options.js';
import { MudReader, parseAsciiFlag, readMudString, skipMudSpaces } from '../reader.js';
import { WorldRecord } from '../records.js';
import { ParseError, type MudParserErrorContext, type ParseWarning } from '../errors.js';
import { RecordType } from '../types.js';
import type { ReaderOptions } from '../reader.js';
import type { BitVector, BitVectorSet, MudInput, SourceSpan, Vnum } from '../types.js';
import type { ExtraDescription, RoomDirection } from '../records.js';

/** Normalized options used internally while parsing a world file. */
interface WorldParserContext {
  /** Whether to reject malformed source data immediately. */
  readonly strict: boolean;

  /** Logger used for parser diagnostics. */
  readonly logger: Logger;

  /** Optional source label attached to records, warnings, and errors. */
  readonly sourceName?: string;

  /** Optional structured warning callback. */
  readonly onWarning?: (warning: ParseWarning) => void;
}

/** A non-comment source line and the line number where it started. */
interface SourceLine {
  /** Source text without the line terminator. */
  readonly text: string;

  /** One-based line number where the source text started. */
  readonly startLine: number;
}

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

const INT_TOKEN_PATTERN = /^[+-]?\d+$/;
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
  const context = normalizeParseOptions(options);
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

    const vnum = parseWorldHeader(text, context, line);

    if (vnum >= RECORD_SENTINEL_VNUM) {
      return records;
    }

    const result = parseWorldRecord(reader, context, line, vnum);
    records.push(result.record);
    pendingLine = result.nextLine;
  }
}

/**
 * Applies parser defaults once so later helpers do not repeatedly check optional fields.
 *
 * @param options - Public parse options supplied by the caller.
 * @returns Normalized parser context with default strict mode and logger applied.
 */
function normalizeParseOptions(options: ParseOptions): WorldParserContext {
  const context: {
    strict: boolean;
    logger: Logger;
    sourceName?: string;
    onWarning?: (warning: ParseWarning) => void;
  } = {
    strict: options.strict ?? true,
    logger: options.logger ?? silentLogger,
  };

  if (options.sourceName !== undefined) {
    context.sourceName = options.sourceName;
  }
  if (options.onWarning !== undefined) {
    context.onWarning = options.onWarning;
  }

  return context;
}

/**
 * Extracts only the MudReader options from the broader parser options object.
 *
 * @param options - Public parse options supplied by the caller.
 * @returns Reader options containing only encoding and source-name fields.
 */
function readerOptionsFrom(options: ParseOptions): ReaderOptions {
  const readerOptions: ReaderOptions = {};

  if (options.encoding !== undefined) {
    readerOptions.encoding = options.encoding;
  }
  if (options.sourceName !== undefined) {
    readerOptions.sourceName = options.sourceName;
  }

  return readerOptions;
}

/**
 * Parses a `#<vnum>` world record header line.
 *
 * @param text - Trimmed source header text.
 * @param context - Normalized parser context.
 * @param line - Source line containing the header.
 * @returns Parsed room VNUM.
 * @throws ParseError if the line is not a valid world header.
 */
function parseWorldHeader(text: string, context: WorldParserContext, line: SourceLine): Vnum {
  const headerMatch = /^#([+-]?\d+)\s*$/.exec(text);

  if (headerMatch === null) {
    fail('Expected world record header', context, sourceForLine(context, line.startLine));
  }

  const vnum = parseInteger(headerMatch[1]);

  if (vnum === null) {
    fail('Expected numeric world vnum', context, sourceForLine(context, line.startLine));
  }

  return vnum;
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
  const name = readWorldString(reader, context, `room #${vnum} name`, vnum);

  if (name === null) {
    fail('Expected room name', context, sourceForReader(reader, context), vnum);
  }

  const description = readWorldString(reader, context, `room #${vnum} description`, vnum);
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
 * Reads a MUD string and converts reader errors into world-specific `ParseError` instances.
 *
 * @param reader - Cursor over the world input.
 * @param context - Normalized parser context.
 * @param description - Human-readable source context for errors.
 * @param vnum - Room VNUM used for error context.
 * @returns Decoded MUD string, or `null` for an explicitly empty source string.
 * @throws ParseError if EOF is reached before the string terminator.
 */
function readWorldString(
  reader: MudReader,
  context: WorldParserContext,
  description: string,
  vnum: Vnum,
): string | null {
  try {
    return readMudString(reader, description);
  } catch (error) {
    fail(
      `Expected tilde-terminated string while reading ${description}`,
      context,
      sourceForReader(reader, context),
      vnum,
      error,
    );
  }
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
    const sourceZone = parseInteger(tokens[0]);
    const sectorType = parseInteger(tokens[2]);
    const roomFlagsSet = parseRoomFlagSet(tokens[1], '0', '0', '0');

    if (sourceZone === null || sectorType === null || roomFlagsSet === null) {
      return null;
    }

    return {
      roomFlagsSet,
      sectorType,
    };
  }

  if (tokens.length === 6) {
    const sourceZone = parseInteger(tokens[0]);
    const sectorType = parseInteger(tokens[5]);
    const roomFlagsSet = parseRoomFlagSet(tokens[1], tokens[2], tokens[3], tokens[4]);

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
 * Converts four room flag tokens into the internal bitvector set.
 *
 * @param first - First room flag token.
 * @param second - Second room flag token.
 * @param third - Third room flag token.
 * @param fourth - Fourth room flag token.
 * @returns A four-element bitvector set, or `null` when any token is invalid.
 */
function parseRoomFlagSet(
  first: string | undefined,
  second: string | undefined,
  third: string | undefined,
  fourth: string | undefined,
): BitVectorSet | null {
  /** Returns a defined bitvector value for tuple construction under noUncheckedIndexedAccess. */
  /* v8 ignore next -- @preserve fallback is unreachable because four validated tokens produce four numeric values. */
  const valueOrDefault = (v?: number) => v ?? 0;

  /* v8 ignore next -- @preserve unreachable through parseRoomNumbers(), which only calls this with validated token counts. */
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return null;
  }

  const values = [first, second, third, fourth].map((value) => parseAsciiFlag(value));
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    return null;
  }

  return [
    valueOrDefault(values[0]),
    valueOrDefault(values[1]),
    valueOrDefault(values[2]),
    valueOrDefault(values[3]),
  ];
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
  const direction = parseInteger(text.slice(1).trim());

  if (direction === null || direction < 0 || direction >= NUM_OF_DIRS) {
    fail(
      'Expected room direction D0 through D9',
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
  }

  const description = readWorldString(
    reader,
    context,
    `room #${vnum} direction D${direction} description`,
    vnum,
  );
  const keywordString = readWorldString(
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
    keyVnum: coerceKeyVnum(numbers.keyVnum, direction, context, numericLine, vnum),
    toRoomVnum: coerceToRoomVnum(numbers.toRoomVnum, direction, context, numericLine, vnum),
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

  const doorType = parseInteger(tokens[0]);
  const keyVnum = parseInteger(tokens[1]);
  const toRoomVnum = parseInteger(tokens[2]);

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
 * Converts absent-key sentinels to public `null` while emitting a warning.
 *
 * @param value - Raw source key VNUM.
 * @param direction - Direction index used in the warning message.
 * @param context - Normalized parser context.
 * @param line - Source line containing the sentinel.
 * @param vnum - Room VNUM used for warning context.
 * @returns Public key VNUM or `null`.
 */
function coerceKeyVnum(
  value: Vnum,
  direction: number,
  context: WorldParserContext,
  line: SourceLine,
  vnum: Vnum,
): Vnum | null {
  if (value === -1 || value === 65535) {
    emitWarning(
      `Coerced key sentinel ${value} to null for D${direction}`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
    return null;
  }

  return value;
}

/**
 * Converts absent-target sentinels to public `null` while emitting a warning.
 *
 * @param value - Raw source target room VNUM.
 * @param direction - Direction index used in the warning message.
 * @param context - Normalized parser context.
 * @param line - Source line containing the sentinel.
 * @param vnum - Room VNUM used for warning context.
 * @returns Public target room VNUM or `null`.
 */
function coerceToRoomVnum(
  value: Vnum,
  direction: number,
  context: WorldParserContext,
  line: SourceLine,
  vnum: Vnum,
): Vnum | null {
  if (value === -1 || value === 0) {
    emitWarning(
      `Coerced target room sentinel ${value} to null for D${direction}`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
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
  const keywords = readWorldString(reader, context, `room #${vnum} extra keywords`, vnum);
  const description = readWorldString(reader, context, `room #${vnum} extra description`, vnum);

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

    const triggerVnum = parseTriggerLine(text, context, line, vnum);

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

/**
 * Parses one `T <vnum>` DG trigger attachment line.
 *
 * Malformed trigger lines are warning-producing skips, matching tbaMUD's `dg_read_trigger()`.
 *
 * @param text - Trimmed trigger line text.
 * @param context - Normalized parser context.
 * @param line - Source line containing the trigger text.
 * @param vnum - Room VNUM used for warning context.
 * @returns Parsed trigger VNUM, or `null` when malformed.
 */
function parseTriggerLine(
  text: string,
  context: WorldParserContext,
  line: SourceLine,
  vnum: Vnum,
): Vnum | null {
  const match = /^T\s+([+-]?\d+)/.exec(text);

  if (match === null) {
    emitWarning(
      `Skipping malformed room trigger line '${text}'`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
    return null;
  }

  const triggerVnum = parseInteger(match[1]);

  if (triggerVnum === null) {
    emitWarning(
      `Skipping malformed room trigger line '${text}'`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
    return null;
  }

  return triggerVnum;
}

/**
 * Splits a decoded MUD keyword string into public keyword array form.
 *
 * @param value - Decoded MUD keyword string, or `null` when explicitly empty.
 * @returns Whitespace-separated keyword tokens, or an empty array.
 */
function splitKeywords(value: string | null): string[] {
  return value === null ? [] : value.trim().split(/\s+/).filter(Boolean);
}

/**
 * Reads the next non-empty, non-comment source line with its original line number.
 *
 * @param reader - Cursor over the world input.
 * @returns The next content line, or `null` at EOF.
 */
function readContentLine(reader: MudReader): SourceLine | null {
  for (;;) {
    const startLine = reader.line;
    const text = reader.readLine();

    if (text === null) {
      return null;
    }

    const trimmed = skipMudSpaces(text);

    if (trimmed.length === 0 || trimmed.startsWith('*')) {
      continue;
    }

    return {
      text,
      startLine,
    };
  }
}

/**
 * Reads a content line or throws a parser error with the provided context message.
 *
 * @param reader - Cursor over the world input.
 * @param context - Normalized parser context.
 * @param message - Error message to use if EOF is reached.
 * @param vnum - Optional room VNUM used for error context.
 * @returns The next content line.
 * @throws ParseError if EOF is reached before a content line is found.
 */
function requireContentLine(
  reader: MudReader,
  context: WorldParserContext,
  message: string,
  vnum?: Vnum,
): SourceLine {
  const line = readContentLine(reader);

  if (line === null) {
    fail(message, context, sourceForReader(reader, context), vnum);
  }

  return line;
}

/**
 * Parses a safe integer token, rejecting undefined, non-integers, and unsafe JS numbers.
 *
 * @param value - Token to parse.
 * @returns Parsed safe integer, or `null` when the token is absent or invalid.
 */
function parseInteger(value: string | undefined): number | null {
  if (value === undefined || !INT_TOKEN_PATTERN.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Builds public source metadata from normalized parser context and line numbers.
 *
 * @param context - Normalized parser context.
 * @param startLine - Starting source line.
 * @param endLine - Optional ending source line.
 * @returns Source span suitable for public records, warnings, and errors.
 */
function sourceForLine(
  context: WorldParserContext,
  startLine: number,
  endLine?: number,
): SourceSpan {
  const source: SourceSpan = { startLine };

  if (context.sourceName !== undefined) {
    source.fileName = context.sourceName;
  }
  if (endLine !== undefined) {
    source.endLine = endLine;
  }

  return source;
}

/**
 * Builds source metadata at the reader's current cursor line.
 *
 * @param reader - Cursor over the world input.
 * @param context - Normalized parser context.
 * @returns Source span using the reader's current line.
 */
function sourceForReader(reader: MudReader, context: WorldParserContext): SourceSpan {
  return sourceForLine(context, reader.line);
}

/**
 * Creates a structured parse warning for world-specific recoverable issues.
 *
 * @param message - Human-readable warning message.
 * @param context - Normalized parser context.
 * @param source - Source span for the warning.
 * @param vnum - Room VNUM associated with the warning.
 * @returns Structured parse warning object.
 */
function warningFor(
  message: string,
  context: WorldParserContext,
  source: SourceSpan,
  vnum: Vnum,
): ParseWarning {
  const warning: ParseWarning = {
    message,
    source,
    recordType: RecordType.World,
    vnum,
  };

  /* v8 ignore next -- @preserve all warningFor() call sites pass sourceForLine(), which already adds fileName when present. */
  if (context.sourceName !== undefined && warning.source?.fileName === undefined) {
    warning.source = {
      ...source,
      fileName: context.sourceName,
    };
  }

  return warning;
}

/**
 * Emits a recoverable world parser warning through both warning channels.
 *
 * @param message - Human-readable warning message.
 * @param context - Normalized parser context.
 * @param source - Source span for the warning.
 * @param vnum - Room VNUM associated with the warning.
 * @returns Nothing.
 */
function emitWarning(
  message: string,
  context: WorldParserContext,
  source: SourceSpan,
  vnum: Vnum,
): void {
  const warning = warningFor(message, context, source, vnum);
  context.logger.warn(warning.message);
  context.onWarning?.(warning);
}

/**
 * Logs and throws a source-aware `ParseError`.
 *
 * @param message - Error message.
 * @param context - Normalized parser context.
 * @param source - Source span for the error.
 * @param vnum - Optional room VNUM associated with the error.
 * @param cause - Optional underlying error that caused the parse failure.
 * @throws ParseError always.
 */
function fail(
  message: string,
  context: WorldParserContext,
  source: SourceSpan,
  vnum?: Vnum,
  cause?: unknown,
): never {
  const errorContext: MudParserErrorContext = {
    source,
    recordType: RecordType.World,
  };

  if (vnum !== undefined) {
    errorContext.vnum = vnum;
  }
  if (cause !== undefined) {
    errorContext.cause = cause;
  }

  const error = new ParseError(message, errorContext);
  context.logger.error(error.message, error);
  throw error;
}
