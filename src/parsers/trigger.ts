/**
 * Parser for CircleMUD/tbaMUD DG trigger files (`.trg`).
 *
 * Trigger files contain `#<vnum>` records with a name string, attach/type numeric line, arglist
 * string, and a tilde-terminated script body. References remain source text; DG scripts are not
 * executed or semantically interpreted by this parser.
 */
import { readFileSync } from 'node:fs';

import {
  MOB_TRIGGER_TYPES,
  OBJ_TRIGGER_TYPES,
  TRIGGER_ATTACH_TYPES,
  WLD_TRIGGER_TYPES,
} from '../flag-tables.js';
import { bitvectorToAsciiFlags, resolveFlagNames } from '../flags.js';
import { type Logger, type ParseOptions, silentLogger } from '../options.js';
import { MudReader, parseAsciiFlag, parseAt, skipMudSpaces } from '../reader.js';
import { TriggerRecord } from '../records.js';
import { ParseError, type MudParserErrorContext } from '../errors.js';
import { RecordType } from '../types.js';
import type { ReaderOptions } from '../reader.js';
import type { BitVector, FlagTable, MudInput, SourceSpan, Vnum } from '../types.js';

/** Normalized options used internally while parsing a trigger file. */
interface TriggerParserContext {
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

/** Parsed attach/type numeric line before public flag-name resolution. */
interface TriggerHeaderNumbers {
  /** Numeric trigger attach type. */
  readonly attachType: number;

  /** Raw trigger type bitvector. */
  readonly triggerType: BitVector;

  /** Numeric argument associated with the trigger. */
  readonly numericArg: number;

  /** Source line that produced the values. */
  readonly line: SourceLine;
}

/** Tilde string value plus ending source line. */
interface TriggerString {
  /** Decoded string value, or `null` for an explicitly empty source string. */
  readonly value: string | null;

  /** One-based source line containing the terminating tilde. */
  readonly endLine: number;
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
const MOB_ATTACH_TYPE = 0;
const OBJ_ATTACH_TYPE = 1;
const WLD_ATTACH_TYPE = 2;

/**
 * Reads and parses one `.trg` file from disk.
 *
 * @param fileName - Path to the trigger file to read.
 * @param options - Parser options controlling encoding, source names, and logging.
 * @returns Parsed trigger records.
 * @throws ParseError if the file contents are not valid trigger data.
 */
export function parseTriggerFile(fileName: string, options: ParseOptions = {}): TriggerRecord[] {
  const input = readFileSync(fileName);
  return parseTrigger(input, {
    ...options,
    sourceName: options.sourceName ?? fileName,
  });
}

/**
 * Parses trigger content from a string or Buffer.
 *
 * @param input - Trigger file contents as a string or Buffer.
 * @param options - Parser options controlling encoding, source names, and logging.
 * @returns Parsed trigger records.
 * @throws ParseError if the input is not valid trigger data.
 */
export function parseTrigger(input: MudInput, options: ParseOptions = {}): TriggerRecord[] {
  const context = normalizeParseOptions(options);
  const reader = new MudReader(input, readerOptionsFrom(options));
  const records: TriggerRecord[] = [];

  for (;;) {
    const line = readContentLine(reader);

    if (line === null) {
      fail(
        'Expected trigger record header or $ terminator',
        context,
        sourceForReader(reader, context),
      );
    }

    const text = skipMudSpaces(line.text);

    if (text.startsWith('$')) {
      return records;
    }

    const vnum = parseTriggerHeader(text, context, line);

    if (vnum >= RECORD_SENTINEL_VNUM) {
      return records;
    }

    records.push(parseTriggerRecord(reader, context, line, vnum));
  }
}

/**
 * Applies parser defaults once so later helpers do not repeatedly check optional fields.
 *
 * @param options - Public parse options supplied by the caller.
 * @returns Normalized parser context with default logger applied.
 */
function normalizeParseOptions(options: ParseOptions): TriggerParserContext {
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
 * Parses a `#<vnum>` trigger record header line.
 *
 * @param text - Trimmed source header text.
 * @param context - Normalized parser context.
 * @param line - Source line containing the header.
 * @returns Parsed trigger VNUM.
 * @throws ParseError if the line is not a valid trigger header.
 */
function parseTriggerHeader(text: string, context: TriggerParserContext, line: SourceLine): Vnum {
  const headerMatch = /^#([+-]?\d+)\s*$/.exec(text);

  if (headerMatch === null) {
    fail('Expected trigger record header', context, sourceForLine(context, line.startLine));
  }

  const vnum = parseLeadingInteger(headerMatch[1]);

  if (vnum === null) {
    fail('Expected numeric trigger vnum', context, sourceForLine(context, line.startLine));
  }

  return vnum;
}

/**
 * Parses one complete trigger record from the current reader position.
 *
 * @param reader - Cursor over the trigger input positioned after the trigger header.
 * @param context - Normalized parser context.
 * @param headerLine - Source line containing the trigger header.
 * @param vnum - Trigger VNUM from the header.
 * @returns Parsed trigger record.
 * @throws ParseError if the trigger body is malformed.
 */
function parseTriggerRecord(
  reader: MudReader,
  context: TriggerParserContext,
  headerLine: SourceLine,
  vnum: Vnum,
): TriggerRecord {
  const name = readTriggerString(reader, context, `trigger #${vnum} name`, vnum);
  const headerNumbers = readTriggerHeaderNumbers(reader, context, vnum);
  const argList = readTriggerString(reader, context, `trigger #${vnum} arglist`, vnum);
  const commands = readTriggerString(reader, context, `trigger #${vnum} commands`, vnum);
  const resolvedTriggerType = resolveBitvector(
    headerNumbers.triggerType,
    triggerTypeTableFor(headerNumbers.attachType),
    context,
    headerNumbers.line,
    vnum,
    'trigger type',
  );

  return new TriggerRecord({
    vnum,
    name: name.value,
    attachType: headerNumbers.attachType,
    attachTypeName: resolveOrdinalName(headerNumbers.attachType, TRIGGER_ATTACH_TYPES),
    triggerType: resolvedTriggerType.names,
    triggerTypeBits: resolvedTriggerType.bits,
    numericArg: headerNumbers.numericArg,
    argList: argList.value,
    commands: splitCommands(commands.value),
    source: sourceForLine(context, headerLine.startLine, commands.endLine),
  });
}

/**
 * Reads the trigger attach/type/numeric-argument line.
 *
 * @param reader - Cursor over the trigger input.
 * @param context - Normalized parser context.
 * @param vnum - Trigger VNUM used for error context.
 * @returns Parsed trigger header numbers and source metadata.
 */
function readTriggerHeaderNumbers(
  reader: MudReader,
  context: TriggerParserContext,
  vnum: Vnum,
): TriggerHeaderNumbers {
  const line = requireContentLine(reader, context, 'Expected trigger numeric header line', vnum);
  const tokens = tokensForLine(line.text);

  if (tokens.length < 2) {
    fail(
      'Expected trigger numeric header line',
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
  }

  const triggerType = parseAsciiFlag(valueAt(tokens, 1));

  if (!Number.isInteger(triggerType) || triggerType < 0) {
    fail('Expected trigger type bitvector', context, sourceForLine(context, line.startLine), vnum);
  }

  return {
    attachType: parseRequiredInteger(valueAt(tokens, 0), context, line, vnum, 'attach type'),
    triggerType,
    numericArg:
      tokens.length >= 3
        ? parseRequiredInteger(valueAt(tokens, 2), context, line, vnum, 'numeric arg')
        : 0,
    line,
  };
}

/**
 * Reads a tilde-terminated trigger string and returns the terminating line number.
 *
 * @param reader - Cursor over the trigger input.
 * @param context - Normalized parser context.
 * @param description - Human-readable source context for errors.
 * @param vnum - Trigger VNUM used for error context.
 * @returns Decoded MUD string and ending source line.
 * @throws ParseError if EOF is reached before the string terminator.
 */
function readTriggerString(
  reader: MudReader,
  context: TriggerParserContext,
  description: string,
  vnum: Vnum,
): TriggerString {
  let value = '';

  for (;;) {
    const startLine = reader.line;
    const line = reader.readLine();

    if (line === null) {
      fail(
        `Expected tilde-terminated string while reading ${description}`,
        context,
        sourceForReader(reader, context),
        vnum,
      );
    }
    if (line.endsWith('~')) {
      value += line.slice(0, -1);
      return {
        value: value.length === 0 ? null : parseAt(value),
        endLine: startLine,
      };
    }

    value += `${line}\n`;
  }
}

/**
 * Resolves bitvector public names and canonical ASCII bits with source-aware errors.
 *
 * @param value - Parsed bitvector value.
 * @param table - Flag table used for name resolution.
 * @param context - Normalized parser context.
 * @param line - Source line metadata.
 * @param vnum - Trigger VNUM used for error context.
 * @param description - Human-readable field description for errors.
 * @returns Resolved bitvector names and bits.
 */
function resolveBitvector(
  value: BitVector,
  table: FlagTable,
  context: TriggerParserContext,
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
 * Returns the trigger type flag-name table for a parsed attach type.
 *
 * @param attachType - Numeric trigger attach type.
 * @returns Matching trigger type flag table, or an empty table for unknown attach types.
 */
function triggerTypeTableFor(attachType: number): FlagTable {
  switch (attachType) {
    case MOB_ATTACH_TYPE:
      return MOB_TRIGGER_TYPES;
    case OBJ_ATTACH_TYPE:
      return OBJ_TRIGGER_TYPES;
    case WLD_ATTACH_TYPE:
      return WLD_TRIGGER_TYPES;
    default:
      return [];
  }
}

/**
 * Splits a decoded trigger script body into command lines.
 *
 * @param value - Decoded script body, or `null` for an explicitly empty body.
 * @returns Non-empty command lines, matching the C parser's `strtok(..., "\n\r")` behavior.
 */
function splitCommands(value: string | null): string[] {
  return value === null ? [] : value.split(/[\n\r]/).filter((line) => line.length > 0);
}

/**
 * Reads the next non-empty, non-comment source line with its original line number.
 *
 * @param reader - Cursor over the trigger input.
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
 * @param reader - Cursor over the trigger input.
 * @param context - Normalized parser context.
 * @param message - Error message to use if EOF is reached.
 * @param vnum - Trigger VNUM used for error context.
 * @returns The next content line.
 */
function requireContentLine(
  reader: MudReader,
  context: TriggerParserContext,
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
 * @param vnum - Trigger VNUM used for error context.
 * @param description - Optional human-readable field description.
 * @returns Parsed integer.
 */
function parseRequiredInteger(
  token: string,
  context: TriggerParserContext,
  line: SourceLine,
  vnum: Vnum,
  description = 'integer field',
): number {
  const value = parseLeadingInteger(token);

  if (value === null) {
    fail(
      `Expected numeric trigger ${description}`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
  }

  return value;
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
    throw new RangeError(`Missing parsed trigger field at index ${index}`);
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
  context: TriggerParserContext,
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
 * @param reader - Cursor over the trigger input.
 * @param context - Normalized parser context.
 * @returns Source span using the reader's current line.
 */
function sourceForReader(reader: MudReader, context: TriggerParserContext): SourceSpan {
  return sourceForLine(context, reader.line);
}

/**
 * Logs and throws a source-aware `ParseError`.
 *
 * @param message - Error message.
 * @param context - Normalized parser context.
 * @param source - Source span for the error.
 * @param vnum - Optional trigger VNUM associated with the error.
 * @param cause - Optional underlying error.
 * @throws ParseError always.
 */
function fail(
  message: string,
  context: TriggerParserContext,
  source: SourceSpan,
  vnum?: Vnum,
  cause?: unknown,
): never {
  const errorContext: MudParserErrorContext = {
    source,
    recordType: RecordType.Trigger,
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
