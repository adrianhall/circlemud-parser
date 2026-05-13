/**
 * Parser for CircleMUD/tbaMUD quest files (`.qst`).
 *
 * Quest files contain discrete `#<vnum>` records with five tilde strings, three numeric lines, and
 * an `S` record terminator. References remain VNUMs and unresolved `-1` source sentinels are
 * exposed as `null`.
 */
import { readFileSync } from 'node:fs';

import { AQ_FLAGS, QUEST_TYPES } from '../flag-tables.js';
import { bitvectorToAsciiFlags, resolveFlagNames } from '../flags.js';
import { type Logger, type ParseOptions, silentLogger } from '../options.js';
import { MudReader, parseAsciiFlag, readMudString, skipMudSpaces } from '../reader.js';
import { QuestRecord } from '../records.js';
import { ParseError, type MudParserErrorContext } from '../errors.js';
import { RecordType } from '../types.js';
import type { ReaderOptions } from '../reader.js';
import type { BitVector, FlagTable, MudInput, SourceSpan, Vnum } from '../types.js';

/** Normalized options used internally while parsing a quest file. */
interface QuestParserContext {
  /** Logger used for parser diagnostics. */
  readonly logger: Logger;

  /** Optional source label attached to records and errors. */
  readonly sourceName?: string;
}

/** A non-comment source line and the line number where it started. */
interface SourceLine {
  /** Source text without the line terminator. */
  readonly text: string;

  /** One-based line number where the source text started. */
  readonly startLine: number;
}

/** Parsed first quest numeric line before public flag-name resolution. */
interface QuestHeaderNumbers {
  /** Numeric quest type ordinal. */
  readonly questType: number;

  /** Questmaster mobile VNUM or source sentinel. */
  readonly questmasterVnum: Vnum;

  /** Raw quest flags bitvector. */
  readonly questFlags: BitVector;

  /** Quest target VNUM or source sentinel. */
  readonly targetVnum: Vnum;

  /** Previous quest VNUM or source sentinel. */
  readonly prevQuestVnum: Vnum;

  /** Next quest VNUM or source sentinel. */
  readonly nextQuestVnum: Vnum;

  /** Prerequisite object VNUM or source sentinel. */
  readonly prerequisiteVnum: Vnum;

  /** Source line that produced the values. */
  readonly line: SourceLine;
}

/** Parsed numeric field list plus source metadata. */
interface IntegerFieldsLine {
  /** Parsed integer fields in source order. */
  readonly values: readonly number[];

  /** Source line that produced the values. */
  readonly line: SourceLine;
}

/** Resolved bitvector names and canonical bits string. */
interface ResolvedBitvector {
  /** Resolved public flag names. */
  readonly names: readonly string[];

  /** Canonical ASCII flag representation. */
  readonly bits: string;
}

const INT_PREFIX_PATTERN = /^\s*([+-]?\d+)/;
const RECORD_SENTINEL_VNUM = 99999;

/**
 * Reads and parses one `.qst` file from disk.
 *
 * @param fileName - Path to the quest file to read.
 * @param options - Parser options controlling encoding, source names, and logging.
 * @returns Parsed quest records.
 * @throws ParseError if the file contents are not valid quest data.
 */
export function parseQuestFile(fileName: string, options: ParseOptions = {}): QuestRecord[] {
  const input = readFileSync(fileName);
  return parseQuest(input, {
    ...options,
    sourceName: options.sourceName ?? fileName,
  });
}

/**
 * Parses quest content from a string or Buffer.
 *
 * @param input - Quest file contents as a string or Buffer.
 * @param options - Parser options controlling encoding, source names, and logging.
 * @returns Parsed quest records.
 * @throws ParseError if the input is not valid quest data.
 */
export function parseQuest(input: MudInput, options: ParseOptions = {}): QuestRecord[] {
  const context = normalizeParseOptions(options);
  const reader = new MudReader(input, readerOptionsFrom(options));
  const records: QuestRecord[] = [];

  for (;;) {
    const line = readContentLine(reader);

    if (line === null) {
      fail(
        'Expected quest record header or $ terminator',
        context,
        sourceForReader(reader, context),
      );
    }

    const text = skipMudSpaces(line.text);

    if (text.startsWith('$')) {
      return records;
    }

    const vnum = parseQuestHeader(text, context, line);

    if (vnum >= RECORD_SENTINEL_VNUM) {
      return records;
    }

    records.push(parseQuestRecord(reader, context, line, vnum));
  }
}

/**
 * Applies parser defaults once so later helpers do not repeatedly check optional fields.
 *
 * @param options - Public parse options supplied by the caller.
 * @returns Normalized parser context with default logger applied.
 */
function normalizeParseOptions(options: ParseOptions): QuestParserContext {
  const context: {
    logger: Logger;
    sourceName?: string;
  } = {
    logger: options.logger ?? silentLogger,
  };

  if (options.sourceName !== undefined) {
    context.sourceName = options.sourceName;
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
 * Parses a `#<vnum>` quest record header line.
 *
 * @param text - Trimmed source header text.
 * @param context - Normalized parser context.
 * @param line - Source line containing the header.
 * @returns Parsed quest VNUM.
 * @throws ParseError if the line is not a valid quest header.
 */
function parseQuestHeader(text: string, context: QuestParserContext, line: SourceLine): Vnum {
  const headerMatch = /^#([+-]?\d+)\s*$/.exec(text);

  if (headerMatch === null) {
    fail('Expected quest record header', context, sourceForLine(context, line.startLine));
  }

  const vnum = parseLeadingInteger(headerMatch[1]);

  if (vnum === null) {
    fail('Expected numeric quest vnum', context, sourceForLine(context, line.startLine));
  }

  return vnum;
}

/**
 * Parses one complete quest record from the current reader position.
 *
 * @param reader - Cursor over the quest input positioned after the quest header.
 * @param context - Normalized parser context.
 * @param headerLine - Source line containing the quest header.
 * @param vnum - Quest VNUM from the header.
 * @returns Parsed quest record.
 * @throws ParseError if the quest body is malformed.
 */
function parseQuestRecord(
  reader: MudReader,
  context: QuestParserContext,
  headerLine: SourceLine,
  vnum: Vnum,
): QuestRecord {
  const name = readQuestString(reader, context, `quest #${vnum} name`, vnum);
  const description = readQuestString(reader, context, `quest #${vnum} description`, vnum);
  const acceptMessage = readQuestString(reader, context, `quest #${vnum} accept message`, vnum);
  const completeMessage = readQuestString(reader, context, `quest #${vnum} complete message`, vnum);
  const quitMessage = readQuestString(reader, context, `quest #${vnum} quit message`, vnum);
  const headerNumbers = readQuestHeaderNumbers(reader, context, vnum);
  const objectiveValues = readIntegerFieldsLine(
    reader,
    context,
    7,
    'Expected quest objective values line',
    vnum,
  );
  const rewardValues = readIntegerFieldsLine(
    reader,
    context,
    3,
    'Expected quest reward values line',
    vnum,
  );
  const terminator = readQuestTerminator(reader, context, vnum);
  const resolvedQuestFlags = resolveBitvector(
    headerNumbers.questFlags,
    AQ_FLAGS,
    context,
    headerNumbers.line,
    vnum,
    'quest flags',
  );

  return new QuestRecord({
    vnum,
    name,
    description,
    acceptMessage,
    completeMessage,
    quitMessage,
    questType: headerNumbers.questType,
    questTypeName: resolveOrdinalName(headerNumbers.questType, QUEST_TYPES),
    questmasterVnum: nullableVnum(headerNumbers.questmasterVnum),
    questFlags: resolvedQuestFlags.names,
    questFlagsBits: resolvedQuestFlags.bits,
    targetVnum: nullableVnum(headerNumbers.targetVnum),
    prevQuestVnum: nullableVnum(headerNumbers.prevQuestVnum),
    nextQuestVnum: nullableVnum(headerNumbers.nextQuestVnum),
    prerequisiteVnum: nullableVnum(headerNumbers.prerequisiteVnum),
    pointsReward: valueAt(objectiveValues.values, 0),
    pointsPenalty: valueAt(objectiveValues.values, 1),
    minLevel: valueAt(objectiveValues.values, 2),
    maxLevel: valueAt(objectiveValues.values, 3),
    timeLimit: valueAt(objectiveValues.values, 4),
    returnMobVnum: nullableVnum(valueAt(objectiveValues.values, 5)),
    quantity: valueAt(objectiveValues.values, 6),
    goldReward: valueAt(rewardValues.values, 0),
    experienceReward: valueAt(rewardValues.values, 1),
    objectRewardVnum: nullableVnum(valueAt(rewardValues.values, 2)),
    source: sourceForLine(context, headerLine.startLine, terminator.startLine),
  });
}

/**
 * Reads a tilde-terminated quest string and converts reader errors into quest-specific parse errors.
 *
 * @param reader - Cursor over the quest input.
 * @param context - Normalized parser context.
 * @param description - Human-readable source context for errors.
 * @param vnum - Quest VNUM used for error context.
 * @returns Decoded MUD string, or `null` for an explicitly empty source string.
 * @throws ParseError if EOF is reached before the string terminator.
 */
function readQuestString(
  reader: MudReader,
  context: QuestParserContext,
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
 * Reads the first quest numeric line with `sscanf(" %d %d %s %d %d %d %d")` semantics.
 *
 * @param reader - Cursor over the quest input.
 * @param context - Normalized parser context.
 * @param vnum - Quest VNUM used for error context.
 * @returns Parsed quest header numbers and source metadata.
 */
function readQuestHeaderNumbers(
  reader: MudReader,
  context: QuestParserContext,
  vnum: Vnum,
): QuestHeaderNumbers {
  const line = requireContentLine(reader, context, 'Expected quest numeric header line', vnum);
  const tokens = tokensForLine(line.text);

  if (tokens.length < 7) {
    fail(
      'Expected quest numeric header line',
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
  }

  const questFlags = parseAsciiFlag(valueAt(tokens, 2));

  if (!Number.isInteger(questFlags) || questFlags < 0) {
    fail('Expected quest flags bitvector', context, sourceForLine(context, line.startLine), vnum);
  }

  return {
    questType: parseRequiredInteger(valueAt(tokens, 0), context, line, vnum, 'quest type'),
    questmasterVnum: parseRequiredInteger(
      valueAt(tokens, 1),
      context,
      line,
      vnum,
      'questmaster vnum',
    ),
    questFlags,
    targetVnum: parseRequiredInteger(valueAt(tokens, 3), context, line, vnum, 'quest target vnum'),
    prevQuestVnum: parseRequiredInteger(
      valueAt(tokens, 4),
      context,
      line,
      vnum,
      'previous quest vnum',
    ),
    nextQuestVnum: parseRequiredInteger(valueAt(tokens, 5), context, line, vnum, 'next quest vnum'),
    prerequisiteVnum: parseRequiredInteger(
      valueAt(tokens, 6),
      context,
      line,
      vnum,
      'prerequisite vnum',
    ),
    line,
  };
}

/**
 * Reads a fixed-count integer field line.
 *
 * @param reader - Cursor over the quest input.
 * @param context - Normalized parser context.
 * @param count - Number of integer fields required.
 * @param message - Error message to use if the line is missing or malformed.
 * @param vnum - Quest VNUM used for error context.
 * @returns Parsed integer fields and source metadata.
 */
function readIntegerFieldsLine(
  reader: MudReader,
  context: QuestParserContext,
  count: number,
  message: string,
  vnum: Vnum,
): IntegerFieldsLine {
  const line = requireContentLine(reader, context, message, vnum);
  const tokens = tokensForLine(line.text);

  if (tokens.length < count) {
    fail(message, context, sourceForLine(context, line.startLine), vnum);
  }

  return {
    values: tokens.slice(0, count).map((token) => parseRequiredInteger(token, context, line, vnum)),
    line,
  };
}

/**
 * Reads through the source until the quest `S` record terminator is found.
 *
 * @param reader - Cursor over the quest input.
 * @param context - Normalized parser context.
 * @param vnum - Quest VNUM used for error context.
 * @returns Source line containing the terminator.
 */
function readQuestTerminator(
  reader: MudReader,
  context: QuestParserContext,
  vnum: Vnum,
): SourceLine {
  for (;;) {
    const line = requireContentLine(reader, context, 'Expected quest record terminator', vnum);

    if (skipMudSpaces(line.text).startsWith('S')) {
      return line;
    }
  }
}

/**
 * Resolves bitvector public names and canonical ASCII bits with source-aware errors.
 *
 * @param value - Parsed bitvector value.
 * @param table - Flag table used for name resolution.
 * @param context - Normalized parser context.
 * @param line - Source line metadata.
 * @param vnum - Quest VNUM used for error context.
 * @param description - Human-readable field description for errors.
 * @returns Resolved bitvector names and bits.
 */
function resolveBitvector(
  value: BitVector,
  table: FlagTable,
  context: QuestParserContext,
  line: SourceLine,
  vnum: Vnum,
  description: string,
): ResolvedBitvector {
  try {
    return {
      names: resolveFlagNames(value, table),
      bits: bitvectorToAsciiFlags(value),
    };
  } catch (error) {
    fail(
      `Expected ${description} bitvector representable as ASCII flags`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
      error,
    );
  }
}

/**
 * Reads the next non-empty, non-comment source line with its original line number.
 *
 * @param reader - Cursor over the quest input.
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
 * @param reader - Cursor over the quest input.
 * @param context - Normalized parser context.
 * @param message - Error message to use if EOF is reached.
 * @param vnum - Quest VNUM used for error context.
 * @returns The next content line.
 */
function requireContentLine(
  reader: MudReader,
  context: QuestParserContext,
  message: string,
  vnum: Vnum,
): SourceLine {
  const line = readContentLine(reader);

  if (line === null) {
    fail(message, context, sourceForReader(reader, context), vnum);
  }

  return line;
}

/**
 * Splits a source line into whitespace-delimited tokens.
 *
 * @param value - Source line value.
 * @returns Token list without empty entries.
 */
function tokensForLine(value: string): string[] {
  return skipMudSpaces(value).split(/\s+/).filter(Boolean);
}

/**
 * Parses and returns a leading safe integer.
 *
 * @param value - Source value.
 * @returns Parsed integer, or `null` when no safe integer prefix exists.
 */
function parseLeadingInteger(value: string | undefined): number | null {
  return parseIntegerPrefix(value)?.value ?? null;
}

/**
 * Parses a leading safe integer with its remaining text.
 *
 * @param value - Source value.
 * @returns Parsed integer and text after it, or `null` when no safe integer prefix exists.
 */
function parseIntegerPrefix(
  value: string | undefined,
): { readonly value: number; readonly remainder: string } | null {
  /* v8 ignore next -- @preserve parser call sites pass strings; undefined is accepted for regex capture typing under noUncheckedIndexedAccess. */
  if (value === undefined) {
    return null;
  }

  const match = INT_PREFIX_PATTERN.exec(value);

  if (match === null) {
    return null;
  }

  const token = match[1];

  /* v8 ignore next -- @preserve INT_PREFIX_PATTERN always defines its only capture group when it matches. */
  if (token === undefined) {
    return null;
  }

  const parsed = Number.parseInt(token, 10);

  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return {
    value: parsed,
    remainder: value.slice(match[0].length),
  };
}

/**
 * Parses a required leading integer from a source token.
 *
 * @param token - Source token.
 * @param context - Normalized parser context.
 * @param line - Source line metadata.
 * @param vnum - Quest VNUM used for error context.
 * @param description - Optional human-readable field description.
 * @returns Parsed integer.
 */
function parseRequiredInteger(
  token: string,
  context: QuestParserContext,
  line: SourceLine,
  vnum: Vnum,
  description = 'integer field',
): number {
  const value = parseLeadingInteger(token);

  if (value === null) {
    fail(
      `Expected numeric quest ${description}`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
  }

  return value;
}

/**
 * Maps the tbaMUD `-1` VNUM sentinel to the public `null` representation.
 *
 * @param value - Parsed VNUM value.
 * @returns `null` for `-1`; otherwise the original VNUM.
 */
function nullableVnum(value: Vnum): Vnum | null {
  return value === -1 ? null : value;
}

/**
 * Resolves an ordinal table entry, preserving unknown values.
 *
 * @param value - Numeric ordinal value.
 * @param table - Ordinal name table.
 * @returns Table name or `UNKNOWN_<value>` fallback.
 */
function resolveOrdinalName(value: number, table: FlagTable): string {
  const name = table[value];
  return name === undefined || name === '\n' || name === '\0' ? `UNKNOWN_${value}` : name;
}

/**
 * Returns an indexed value from an array, preserving no-unchecked-indexed-access guarantees.
 *
 * @param values - Source values.
 * @param index - Index to read.
 * @returns Value at the index.
 */
function valueAt<T>(values: readonly T[], index: number): T {
  const value = values[index];

  /* v8 ignore next -- @preserve callers validate token/field counts before indexing. */
  if (value === undefined) {
    throw new RangeError(`Missing parsed quest field at index ${index}`);
  }

  return value;
}

/**
 * Builds public source metadata from normalized parser context and line numbers.
 *
 * @param context - Normalized parser context.
 * @param startLine - Starting source line.
 * @param endLine - Optional ending source line.
 * @returns Source span suitable for public records and errors.
 */
function sourceForLine(
  context: QuestParserContext,
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
 * @param reader - Cursor over the quest input.
 * @param context - Normalized parser context.
 * @returns Source span using the reader's current line.
 */
function sourceForReader(reader: MudReader, context: QuestParserContext): SourceSpan {
  return sourceForLine(context, reader.line);
}

/**
 * Logs and throws a source-aware `ParseError`.
 *
 * @param message - Error message.
 * @param context - Normalized parser context.
 * @param source - Source span for the error.
 * @param vnum - Optional quest VNUM associated with the error.
 * @param cause - Optional underlying error.
 * @throws ParseError always.
 */
function fail(
  message: string,
  context: QuestParserContext,
  source: SourceSpan,
  vnum?: Vnum,
  cause?: unknown,
): never {
  const errorContext: MudParserErrorContext = {
    source,
    recordType: RecordType.Quest,
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
