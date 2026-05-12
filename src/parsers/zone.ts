/**
 * Parser for CircleMUD/tbaMUD zone reset files (`.zon`).
 *
 * Zone files define one zone header plus a command table that describes reset-time mobile,
 * object, door, trigger, and script-variable operations. This parser preserves unresolved
 * references as VNUMs and does not attempt to execute or validate reset commands against a
 * loaded MUD database.
 */
import { readFileSync } from 'node:fs';

import { ZONE_FLAGS } from '../flag-tables.js';
import { bitvectorSetToAsciiFlags, resolveFlagSetNames } from '../flags.js';
import { type Logger, type ParseOptions, silentLogger } from '../options.js';
import { MudReader, parseAsciiFlag, parseAt, skipMudSpaces } from '../reader.js';
import { ZoneRecord } from '../records.js';
import { ParseError, type MudParserErrorContext, type ParseWarning } from '../errors.js';
import { RecordType } from '../types.js';
import type { ReaderOptions } from '../reader.js';
import type { BitVectorSet, MudInput, SourceSpan, Vnum } from '../types.js';
import type { ZoneCommand } from '../records.js';

/** Normalized options used internally while parsing a zone file. */
interface ZoneParserContext {
  readonly strict: boolean;
  readonly logger: Logger;
  readonly sourceName?: string;
  readonly onWarning?: (warning: ParseWarning) => void;
}

/** A non-comment source line and the line number where it started. */
interface SourceLine {
  readonly text: string;
  readonly startLine: number;
}

/** Parsed numeric zone header fields before public flag-name resolution. */
interface ZoneNumbers {
  readonly bottom: Vnum;
  readonly top: Vnum;
  readonly lifespan: number;
  readonly resetMode: number;
  readonly zoneFlagsSet: BitVectorSet;
  readonly minLevel: number | null;
  readonly maxLevel: number | null;
}

/** Parsed zone header fields plus an optional command line consumed by non-strict fallback. */
interface ZoneHeader extends ZoneNumbers {
  readonly vnum: Vnum;
  readonly builders: string | null;
  readonly name: string;
  readonly startLine: number;
  readonly firstCommandLine?: SourceLine;
}

/** Result of parsing a single zone command line. */
type ZoneCommandParseResult =
  | { readonly kind: 'command'; readonly command: ZoneCommand }
  | { readonly kind: 'end' }
  | { readonly kind: 'skip' };

/** Zone commands whose source form contains if_flag plus three numeric arguments. */
const THREE_ARG_COMMANDS = new Set(['M', 'O', 'G', 'E', 'P', 'D', 'T']);
const INT_TOKEN_PATTERN = /^[+-]?\d+$/;
const ZERO_ZONE_FLAGS: BitVectorSet = [0, 0, 0, 0];

/**
 * Reads and parses one `.zon` file from disk.
 *
 * The canonical CircleMUD/tbaMUD layout stores one zone per file. The returned array matches the
 * library's type-specific parser convention, but a valid file currently produces exactly one
 * `ZoneRecord`.
 *
 * @param fileName - Path to the zone file to read.
 * @param options - Parser options controlling encoding, source names, warnings, and logging.
 * @returns A single-element array containing the parsed zone record.
 * @throws ParseError if the file contents are not valid zone data.
 */
export function parseZoneFile(fileName: string, options: ParseOptions = {}): ZoneRecord[] {
  const input = readFileSync(fileName);
  return parseZone(input, {
    ...options,
    sourceName: options.sourceName ?? fileName,
  });
}

/**
 * Parses zone content from a string or Buffer.
 *
 * Supports both the old four-field numeric header and the newer tbaMUD ten-field header with four
 * zone flag bitvectors and min/max level gates. Command parsing follows `load_zones()` in
 * `data/tbamud/src/db.c` and requires an `S` or `$` terminator before EOF.
 *
 * @param input - Zone file contents as a string or Buffer.
 * @param options - Parser options controlling encoding, source names, warnings, and logging.
 * @returns A single-element array containing the parsed zone record.
 * @throws ParseError if the input is not valid zone data.
 */
export function parseZone(input: MudInput, options: ParseOptions = {}): ZoneRecord[] {
  const context = normalizeParseOptions(options);
  const reader = new MudReader(input, readerOptionsFrom(options));
  const header = parseZoneHeader(reader, context);
  const commands: ZoneCommand[] = [];
  let pendingLine = header.firstCommandLine;
  let endLine: number | undefined;

  for (;;) {
    const line = pendingLine ?? readContentLine(reader);
    pendingLine = undefined;

    if (line === null) {
      fail(
        'Expected zone command terminator S or $ before EOF',
        context,
        sourceForReader(reader, context),
        header.vnum,
      );
    }

    const result = parseZoneCommandLine(line, context, header.vnum);

    if (result.kind === 'end') {
      endLine = line.startLine;
      break;
    }
    if (result.kind === 'command') {
      commands.push(result.command);
    }
  }

  return [
    new ZoneRecord({
      vnum: header.vnum,
      builders: header.builders,
      name: header.name,
      bottom: header.bottom,
      top: header.top,
      lifespan: header.lifespan,
      resetMode: header.resetMode,
      zoneFlags: resolveFlagSetNames(header.zoneFlagsSet, ZONE_FLAGS),
      zoneFlagsBits: bitvectorSetToAsciiFlags(header.zoneFlagsSet),
      minLevel: header.minLevel,
      maxLevel: header.maxLevel,
      commands,
      source: sourceForLine(context, header.startLine, endLine),
    }),
  ];
}

/**
 * Applies parser defaults once so later helpers do not repeatedly check optional fields.
 *
 * @param options - Public parse options supplied by the caller.
 * @returns Normalized parser context with default strict mode and logger applied.
 */
function normalizeParseOptions(options: ParseOptions): ZoneParserContext {
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
 * Parses the zone header and optional non-strict missing-builders fallback.
 *
 * The fallback mirrors tbaMUD's `zone_fix` behavior: when the numeric line is malformed and
 * `strict` is false, the previous line is reinterpreted as the numeric line, the builders text
 * becomes the zone name, and builders becomes `None.`.
 *
 * @param reader - Cursor over the zone input.
 * @param context - Normalized parser context.
 * @returns Parsed zone header data, including a pending command line when fallback consumed one.
 * @throws ParseError if required header fields are missing or malformed.
 */
function parseZoneHeader(reader: MudReader, context: ZoneParserContext): ZoneHeader {
  const headerLine = requireContentLine(reader, context, 'Expected zone vnum header');
  const headerText = skipMudSpaces(headerLine.text);
  const headerMatch = /^#([+-]?\d+)\s*$/.exec(headerText);

  if (headerMatch === null) {
    fail('Expected zone vnum header', context, sourceForLine(context, headerLine.startLine));
  }

  const vnum = parseInteger(headerMatch[1]);

  if (vnum === null) {
    fail('Expected numeric zone vnum', context, sourceForLine(context, headerLine.startLine));
  }

  const buildersLine = requireContentLine(reader, context, 'Expected zone builders line', vnum);
  const nameLine = requireContentLine(reader, context, 'Expected zone name line', vnum);
  const numericLine = requireContentLine(reader, context, 'Expected zone numeric line', vnum);
  const rawBuilders = stripTilde(buildersLine.text);
  const rawName = stripTilde(nameLine.text);
  let numbers = parseZoneNumbers(numericLine.text, false);
  let builders = nullableString(rawBuilders);
  let name = parseAt(rawName);
  let firstCommandLine: SourceLine | undefined;

  if (numbers === null) {
    if (context.strict) {
      fail(
        'Expected zone numeric line',
        context,
        sourceForLine(context, numericLine.startLine),
        vnum,
      );
    }

    const fallbackNumbers = parseZoneNumbers(rawName, true);

    if (fallbackNumbers === null) {
      fail(
        'Expected zone numeric line',
        context,
        sourceForLine(context, numericLine.startLine),
        vnum,
      );
    }

    const warning = warningFor(
      'Applied zone header fallback for missing builders line',
      context,
      sourceForLine(context, nameLine.startLine),
      vnum,
    );
    context.logger.warn(warning.message);
    context.onWarning?.(warning);

    numbers = fallbackNumbers;
    builders = 'None.';
    name = parseAt(rawBuilders);
    firstCommandLine = numericLine;
  }

  if (numbers.bottom > numbers.top) {
    fail(
      `Zone bottom (${numbers.bottom}) cannot be greater than top (${numbers.top})`,
      context,
      sourceForLine(context, numericLine.startLine),
      vnum,
    );
  }

  const header: ZoneHeader = {
    vnum,
    builders,
    name,
    bottom: numbers.bottom,
    top: numbers.top,
    lifespan: numbers.lifespan,
    resetMode: numbers.resetMode,
    zoneFlagsSet: numbers.zoneFlagsSet,
    minLevel: numbers.minLevel,
    maxLevel: numbers.maxLevel,
    startLine: headerLine.startLine,
  };

  if (firstCommandLine !== undefined) {
    return {
      ...header,
      firstCommandLine,
    };
  }

  return header;
}

/**
 * Parses either supported zone numeric header shape.
 *
 * New tbaMUD files provide ten fields: bottom, top, lifespan, reset mode, four zone flag strings,
 * min level, and max level. Older files provide only the first four fields. The
 * `allowExtraOldFields` parameter exists only for the non-strict header fallback, where the
 * original C loader accepts extra text after the first four old-format fields.
 *
 * @param line - Source line containing the zone numeric header.
 * @param allowExtraOldFields - Whether to accept extra tokens after old-format fields.
 * @returns Parsed numeric zone data, or `null` when the line does not match a supported format.
 */
function parseZoneNumbers(line: string, allowExtraOldFields: boolean): ZoneNumbers | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean);

  if (tokens.length >= 10) {
    const bottom = parseInteger(tokens[0]);
    const top = parseInteger(tokens[1]);
    const lifespan = parseInteger(tokens[2]);
    const resetMode = parseInteger(tokens[3]);
    const minLevel = parseInteger(tokens[8]);
    const maxLevel = parseInteger(tokens[9]);

    if (
      bottom === null ||
      top === null ||
      lifespan === null ||
      resetMode === null ||
      minLevel === null ||
      maxLevel === null
    ) {
      return null;
    }

    const zoneFlagsSet = parseZoneFlagSet(tokens[4], tokens[5], tokens[6], tokens[7]);

    if (zoneFlagsSet === null) {
      return null;
    }

    return {
      bottom,
      top,
      lifespan,
      resetMode,
      zoneFlagsSet,
      minLevel: nullableLevel(minLevel),
      maxLevel: nullableLevel(maxLevel),
    };
  }

  if (tokens.length === 4 || (allowExtraOldFields && tokens.length >= 4)) {
    const bottom = parseInteger(tokens[0]);
    const top = parseInteger(tokens[1]);
    const lifespan = parseInteger(tokens[2]);
    const resetMode = parseInteger(tokens[3]);

    if (bottom === null || top === null || lifespan === null || resetMode === null) {
      return null;
    }

    return {
      bottom,
      top,
      lifespan,
      resetMode,
      zoneFlagsSet: ZERO_ZONE_FLAGS,
      minLevel: null,
      maxLevel: null,
    };
  }

  return null;
}

/**
 * Converts the four zone flag tokens into the internal bitvector set.
 *
 * @param first - First zone flag token.
 * @param second - Second zone flag token.
 * @param third - Third zone flag token.
 * @param fourth - Fourth zone flag token.
 * @returns A four-element bitvector set, or `null` when any token is invalid.
 */
function parseZoneFlagSet(
  first: string | undefined,
  second: string | undefined,
  third: string | undefined,
  fourth: string | undefined,
): BitVectorSet | null {
  /** Returns a defined bitvector value for tuple construction under noUncheckedIndexedAccess. */
  /* v8 ignore next -- @preserve fallback is unreachable because four validated tokens produce four numeric values. */
  const valueOrDefault = (v?: number) => v ?? 0;

  /* v8 ignore next -- @preserve unreachable through parseZoneNumbers(), which only calls this with four tokens. */
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
 * Parses one reset-command line into either a public command, an end marker, or a skipped line.
 *
 * Unknown command codes are warning-producing skips instead of fatal parse errors. This keeps the
 * parser useful for variant zone files without silently accepting the unknown command as data.
 *
 * @param line - Source line containing one command.
 * @param context - Normalized parser context.
 * @param vnum - Zone VNUM used for error and warning context.
 * @returns Parsed command, end marker, or skip marker.
 * @throws ParseError if a known command has malformed arguments.
 */
function parseZoneCommandLine(
  line: SourceLine,
  context: ZoneParserContext,
  vnum: Vnum,
): ZoneCommandParseResult {
  const text = skipMudSpaces(line.text);
  const command = text.charAt(0);
  const source = sourceForLine(context, line.startLine);

  /* v8 ignore next -- @preserve readContentLine() already filters leading-space '*' lines before command parsing. */
  if (command === '*') {
    return { kind: 'skip' };
  }
  if (command === 'S' || command === '$') {
    return { kind: 'end' };
  }

  const { comment, text: commandText } = extractCommandComment(text.slice(1));

  if (THREE_ARG_COMMANDS.has(command)) {
    const values = parseCommandIntegers(commandText, 4, command, context, source, vnum);
    return {
      kind: 'command',
      command: zoneCommand(command, values[0], values.slice(1), [], source, comment),
    };
  }
  if (command === 'R') {
    const values = parseCommandIntegers(commandText, 3, command, context, source, vnum);
    return {
      kind: 'command',
      command: zoneCommand(command, values[0], values.slice(1), [], source, comment),
    };
  }
  if (command === 'V') {
    return {
      kind: 'command',
      command: parseZoneVariableCommand(commandText, context, source, vnum, comment),
    };
  }

  const warning = warningFor(`Skipping unknown zone command '${command}'`, context, source, vnum);
  context.logger.warn(warning.message);
  context.onWarning?.(warning);
  return { kind: 'skip' };
}

/**
 * Parses the special `V` command shape.
 *
 * `V` commands contain the normal if_flag and three numeric arguments, followed by one string word
 * and one remaining string value that may contain spaces.
 *
 * @param text - Command text after the leading `V` character and comment extraction.
 * @param context - Normalized parser context.
 * @param source - Source span for the command line.
 * @param vnum - Zone VNUM used for error context.
 * @param comment - Optional extracted OLC command comment.
 * @returns Parsed `V` zone command.
 * @throws ParseError if the command does not match the expected `V` shape.
 */
function parseZoneVariableCommand(
  text: string,
  context: ZoneParserContext,
  source: SourceSpan,
  vnum: Vnum,
  comment: string | undefined,
): ZoneCommand {
  const match =
    /^\s*([+-]?\d+)\s+([+-]?\d+)\s+([+-]?\d+)\s+([+-]?\d+)\s+(\S+)\s+([^\f\r\t\v]+?)\s*$/.exec(
      text,
    );

  if (match === null) {
    fail(
      'Expected V zone command with if-flag, three numeric args, and two string args',
      context,
      source,
      vnum,
    );
  }

  const ifFlag = parseInteger(match[1]);
  const firstArg = parseInteger(match[2]);
  const secondArg = parseInteger(match[3]);
  const thirdArg = parseInteger(match[4]);
  const firstStringArg = match[5];
  const secondStringArg = match[6];

  if (
    ifFlag === null ||
    firstArg === null ||
    secondArg === null ||
    thirdArg === null ||
    firstStringArg === undefined ||
    secondStringArg === undefined
  ) {
    fail(
      'Expected V zone command with if-flag, three numeric args, and two string args',
      context,
      source,
      vnum,
    );
  }

  return zoneCommand(
    'V',
    ifFlag,
    [firstArg, secondArg, thirdArg],
    [firstStringArg, secondStringArg],
    source,
    comment,
  );
}

/**
 * Parses a fixed number of command integer fields and reports source-aware parse failures.
 *
 * @param text - Command text after the command character and comment extraction.
 * @param count - Number of integer fields to parse.
 * @param command - Command letter used in error messages.
 * @param context - Normalized parser context.
 * @param source - Source span for the command line.
 * @param vnum - Zone VNUM used for error context.
 * @returns Parsed integer values in source order.
 * @throws ParseError if fields are missing or not safe integer tokens.
 */
function parseCommandIntegers(
  text: string,
  count: number,
  command: string,
  context: ZoneParserContext,
  source: SourceSpan,
  vnum: Vnum,
): number[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const values: number[] = [];

  if (tokens.length < count) {
    fail(`Expected ${count} numeric fields for ${command} zone command`, context, source, vnum);
  }

  for (let index = 0; index < count; index += 1) {
    const token = tokens[index];
    const value = parseInteger(token);

    if (value === null) {
      fail(
        `Expected numeric field ${index + 1} for ${command} zone command`,
        context,
        source,
        vnum,
      );
    }

    values.push(value);
  }

  return values;
}

/**
 * Constructs a `ZoneCommand` while omitting optional fields that were absent in source.
 *
 * @param command - Zone command letter.
 * @param ifFlag - Parsed command if-flag.
 * @param args - Parsed numeric command arguments after the if-flag.
 * @param stringArgs - Parsed string command arguments.
 * @param source - Source span for the command line.
 * @param comment - Optional extracted OLC command comment.
 * @returns A public zone command object.
 * @throws TypeError if called internally without an if-flag.
 */
function zoneCommand(
  command: string,
  ifFlag: number | undefined,
  args: readonly number[],
  stringArgs: readonly string[],
  source: SourceSpan,
  comment: string | undefined,
): ZoneCommand {
  /* v8 ignore next -- @preserve internal callers pass values returned from parseCommandIntegers(), so ifFlag is guaranteed. */
  if (ifFlag === undefined) {
    throw new TypeError('Zone command ifFlag is required.');
  }

  const parsed: ZoneCommand = {
    command,
    ifFlag,
    args,
    stringArgs,
    source,
  };

  if (comment !== undefined) {
    parsed.comment = comment;
  }

  return parsed;
}

/**
 * Extracts canonical tab-delimited OLC comments like `\t(comment)` from command lines.
 *
 * @param text - Command text after the command character.
 * @returns Command text without the comment, plus the extracted comment when present.
 */
function extractCommandComment(text: string): { readonly text: string; readonly comment?: string } {
  /* v8 ignore next -- @preserve fallback is unreachable because the regex capture group exists when match is non-null. */
  const valueOrDefault = (v?: string) => v ?? '';

  const match = /\t\s*\((.*)\)\s*$/.exec(text);
  if (match === null) {
    return { text };
  }

  return {
    text: text.slice(0, match.index),
    comment: valueOrDefault(match[1]),
  };
}

/**
 * Reads the next non-empty, non-comment source line with its original line number.
 *
 * @param reader - Cursor over the zone input.
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
 * @param reader - Cursor over the zone input.
 * @param context - Normalized parser context.
 * @param message - Error message to use if EOF is reached.
 * @param vnum - Optional zone VNUM used for error context.
 * @returns The next content line.
 * @throws ParseError if EOF is reached before a content line is found.
 */
function requireContentLine(
  reader: MudReader,
  context: ZoneParserContext,
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
 * Removes the first tilde terminator and any source text after it.
 *
 * @param value - Source text that may contain a tilde terminator.
 * @returns Text before the first tilde, or the original text when no tilde exists.
 */
function stripTilde(value: string): string {
  const tildeIndex = value.indexOf('~');
  return tildeIndex === -1 ? value : value.slice(0, tildeIndex);
}

/**
 * Converts explicitly absent tilde strings to the public `null` representation.
 *
 * @param value - Decoded source string.
 * @returns `null` for an empty string; otherwise the original string.
 */
function nullableString(value: string): string | null {
  return value.length === 0 ? null : value;
}

/**
 * Maps the tbaMUD `-1` level sentinel to the public `null` representation.
 *
 * @param value - Parsed level value.
 * @returns `null` for `-1`; otherwise the original level value.
 */
function nullableLevel(value: number): number | null {
  return value === -1 ? null : value;
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
  context: ZoneParserContext,
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
 * @param reader - Cursor over the zone input.
 * @param context - Normalized parser context.
 * @returns Source span using the reader's current line.
 */
function sourceForReader(reader: MudReader, context: ZoneParserContext): SourceSpan {
  return sourceForLine(context, reader.line);
}

/**
 * Creates a structured parse warning for zone-specific recoverable issues.
 *
 * @param message - Human-readable warning message.
 * @param context - Normalized parser context.
 * @param source - Source span for the warning.
 * @param vnum - Zone VNUM associated with the warning.
 * @returns Structured parse warning object.
 */
function warningFor(
  message: string,
  context: ZoneParserContext,
  source: SourceSpan,
  vnum: Vnum,
): ParseWarning {
  const warning: ParseWarning = {
    message,
    source,
    recordType: RecordType.Zone,
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
 * Logs and throws a source-aware `ParseError`.
 *
 * @param message - Error message.
 * @param context - Normalized parser context.
 * @param source - Source span for the error.
 * @param vnum - Optional zone VNUM associated with the error.
 * @throws ParseError always.
 */
function fail(message: string, context: ZoneParserContext, source: SourceSpan, vnum?: Vnum): never {
  const errorContext: MudParserErrorContext = {
    source,
    recordType: RecordType.Zone,
  };

  if (vnum !== undefined) {
    errorContext.vnum = vnum;
  }

  const error = new ParseError(message, errorContext);
  context.logger.error(error.message, error);
  throw error;
}
