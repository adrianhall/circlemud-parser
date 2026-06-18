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
import { type ParseOptions } from '../options.js';
import { MudReader, parseAsciiFlag, parseAt, skipMudSpaces } from '../reader.js';
import { ZoneRecord } from '../records/index.js';
import { RecordType } from '../types.js';
import {
  emitWarning,
  fail,
  normalizeParseOptions,
  nullableString,
  parseFourBitVectorTokens,
  parseTokenInteger,
  readContentLine,
  readerOptionsFrom,
  requireContentLine,
  sourceForLine,
  sourceForReader,
  ZERO_FLAG_SET,
  type ParserContext,
  type SourceLine,
} from './internal/index.js';
import type { BitVectorSet, MudInput, SourceSpan, Vnum } from '../types.js';
import type { ZoneCommand } from '../records/index.js';

type ZoneParserContext = ParserContext<RecordType.Zone>;

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

/**
 * Zone commands that require if_flag plus exactly three numeric arguments (four numbers total).
 *
 * tbaMUD's `G` command is handled separately because CircleMUD uses only two numeric arguments
 * after if_flag (three numbers total), while tbaMUD added a third argument (which is unused at
 * reset time). The parser accepts both forms when it encounters a `G` command.
 */
const THREE_ARG_COMMANDS = new Set(['M', 'O', 'E', 'P', 'D', 'T']);

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
 * Supports both the CircleMUD four-field numeric header (no builders line, `G` command with
 * three arguments) and the tbaMUD ten-field header with four zone flag bitvectors, min/max level
 * gates, and four-argument `G` commands. Format is auto-detected by structure. Command parsing
 * follows `load_zones()` in `data/tbamud/src/db.c` and requires an `S` or `$` terminator.
 *
 * @param input - Zone file contents as a string or Buffer.
 * @param options - Parser options controlling encoding, source names, warnings, and logging.
 * @returns A single-element array containing the parsed zone record.
 * @throws ParseError if the input is not valid zone data.
 */
export function parseZone(input: MudInput, options: ParseOptions = {}): ZoneRecord[] {
  const context = normalizeParseOptions(options, RecordType.Zone);
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
 * Parses the zone header and optional non-strict missing-builders fallback.
 *
 * The fallback mirrors tbaMUD's `zone_fix` behavior: when the numeric line is malformed and
 * `strict` is false, the previous line is reinterpreted as the numeric line, the builders text
 * becomes the zone name, and builders becomes `null` (CircleMUD zones have no builders field).
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

  const vnum = parseTokenInteger(headerMatch[1]);

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
    const fallbackNumbers = parseZoneNumbers(rawName, true);

    if (fallbackNumbers === null) {
      fail(
        'Expected zone numeric line',
        context,
        sourceForLine(context, numericLine.startLine),
        vnum,
      );
    }

    // CircleMUD zones omit the builders line entirely, so this fallback is the normal path for
    // that format rather than a recoverable problem. The C loader fixes it up silently
    // (data/tbamud/src/db.c), so log at debug level only.
    context.logger.debug(`Applied zone header fallback for missing builders line in zone #${vnum}`);

    numbers = fallbackNumbers;
    builders = null;
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
    const bottom = parseTokenInteger(tokens[0]);
    const top = parseTokenInteger(tokens[1]);
    const lifespan = parseTokenInteger(tokens[2]);
    const resetMode = parseTokenInteger(tokens[3]);
    const minLevel = parseTokenInteger(tokens[8]);
    const maxLevel = parseTokenInteger(tokens[9]);

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

    const zoneFlagsSet = parseFourBitVectorTokens(
      tokens[4],
      tokens[5],
      tokens[6],
      tokens[7],
      parseAsciiFlag,
    );

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
    const bottom = parseTokenInteger(tokens[0]);
    const top = parseTokenInteger(tokens[1]);
    const lifespan = parseTokenInteger(tokens[2]);
    const resetMode = parseTokenInteger(tokens[3]);

    if (bottom === null || top === null || lifespan === null || resetMode === null) {
      return null;
    }

    return {
      bottom,
      top,
      lifespan,
      resetMode,
      zoneFlagsSet: ZERO_FLAG_SET,
      minLevel: null,
      maxLevel: null,
    };
  }

  return null;
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
  if (command === 'G') {
    const values = parseGCommandIntegers(commandText, context, source, vnum);
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

  emitWarning(`Skipping unknown zone command '${command}'`, context, source, vnum);
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

  const ifFlag = parseTokenInteger(match[1]);
  const firstArg = parseTokenInteger(match[2]);
  const secondArg = parseTokenInteger(match[3]);
  const thirdArg = parseTokenInteger(match[4]);
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
    const value = parseTokenInteger(token);

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
 * Parses `G` (give object to character) command integers.
 *
 * CircleMUD uses three numbers total (`if_flag obj_vnum max`), while tbaMUD added a fourth
 * argument (`arg3`) which is unused at reset time (`data/tbamud/src/db.c:2674`). Both forms are
 * accepted: the third argument (arg2) is always the max-load count, and the optional fourth
 * argument is consumed and discarded when present.
 *
 * @param text - Command text after the leading `G` character and comment extraction.
 * @param context - Normalized parser context.
 * @param source - Source span for the command line.
 * @param vnum - Zone VNUM used for error context.
 * @returns Parsed integer values: [if_flag, arg1, arg2] or [if_flag, arg1, arg2, arg3].
 * @throws ParseError if fewer than three numeric fields are found.
 */
function parseGCommandIntegers(
  text: string,
  context: ZoneParserContext,
  source: SourceSpan,
  vnum: Vnum,
): number[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);

  // Require at least 3 numeric fields (CircleMUD format: if_flag obj_vnum max).
  if (tokens.length < 3) {
    fail('Expected at least 3 numeric fields for G zone command', context, source, vnum);
  }

  const values: number[] = [];

  for (let index = 0; index < Math.min(tokens.length, 4); index += 1) {
    const token = tokens[index];
    const value = parseTokenInteger(token);

    if (value === null) {
      // Stop at the first non-numeric token (e.g. a trailing comment without a tab).
      break;
    }

    values.push(value);
    if (values.length === 4) {
      // tbaMUD format consumed — arg3 is carried but unused at reset time.
      break;
    }
  }

  if (values.length < 3) {
    fail('Expected at least 3 numeric fields for G zone command', context, source, vnum);
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
 * Maps the tbaMUD `-1` level sentinel to the public `null` representation.
 *
 * @param value - Parsed level value.
 * @returns `null` for `-1`; otherwise the original level value.
 */
function nullableLevel(value: number): number | null {
  return value === -1 ? null : value;
}
