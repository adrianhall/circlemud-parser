/**
 * Parser for CircleMUD/tbaMUD object files (`.obj`).
 *
 * Object files contain one or more object prototype records. Records preserve unresolved VNUM
 * references, expose resolved flag and ordinal names, and keep DG trigger attachments as trigger
 * VNUMs.
 */
import { readFileSync } from 'node:fs';

import {
  AFFECTED_FLAGS,
  APPLY_TYPES,
  EXTRA_FLAGS,
  ITEM_TYPES,
  WEAR_FLAGS,
} from '../flag-tables.js';
import { bitvectorSetToAsciiFlags, resolveFlagSetNames } from '../flags.js';
import { type Logger, type ParseOptions, silentLogger } from '../options.js';
import {
  MudReader,
  parseAsciiAffectFlag,
  parseAsciiFlag,
  readMudString,
  skipMudSpaces,
} from '../reader.js';
import { ObjectRecord } from '../records.js';
import { ParseError, type MudParserErrorContext, type ParseWarning } from '../errors.js';
import { RecordType } from '../types.js';
import type { ReaderOptions } from '../reader.js';
import type { BitVectorSet, FlagTable, MudInput, SourceSpan, Vnum } from '../types.js';
import type { ExtraDescription, ObjectAffect } from '../records.js';

/** Normalized options used internally while parsing an object file. */
interface ObjectParserContext {
  /** Whether to reject legacy-compatible source data immediately. */
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

/** Parsed object flag fields before public flag-name resolution. */
interface ObjectNumbers {
  /** Numeric object item type from the first numeric line. */
  readonly objectType: number;

  /** Four-element object extra flag bitvector set. */
  readonly extraFlagsSet: BitVectorSet;

  /** Four-element object wear flag bitvector set. */
  readonly wearFlagsSet: BitVectorSet;

  /** Four-element object affect flag bitvector set. */
  readonly affectFlagsSet: BitVectorSet;
}

/** Parsed object value fields from the second numeric line. */
type ObjectValues = readonly [number, number, number, number];

/** Parsed object cost and lifecycle fields from the third numeric line. */
interface ObjectCosts {
  /** Object weight. */
  readonly weight: number;

  /** Object purchase cost. */
  readonly cost: number;

  /** Object rent cost. */
  readonly rent: number;

  /** Object minimum level. */
  readonly level: number;

  /** Object timer. */
  readonly timer: number;
}

/** Result of parsing one object record plus any lookahead line for the next record. */
interface ObjectRecordParseResult {
  /** Parsed object record. */
  readonly record: ObjectRecord;

  /** Already-read next object header or file terminator line, when present. */
  readonly nextLine?: SourceLine;
}

const INT_TOKEN_PATTERN = /^[+-]?\d+$/;
const RECORD_SENTINEL_VNUM = 99999;
const ZERO_FLAG_SET: BitVectorSet = [0, 0, 0, 0];
const MAX_OBJ_AFFECT = 6;

/**
 * Reads and parses one `.obj` file from disk.
 *
 * @param fileName - Path to the object file to read.
 * @param options - Parser options controlling encoding, source names, warnings, and logging.
 * @returns Parsed object records.
 * @throws ParseError if the file contents are not valid object data.
 */
export function parseObjectFile(fileName: string, options: ParseOptions = {}): ObjectRecord[] {
  const input = readFileSync(fileName);
  return parseObject(input, {
    ...options,
    sourceName: options.sourceName ?? fileName,
  });
}

/**
 * Parses object content from a string or Buffer.
 *
 * Supports the current 13-field object flag layout by default. With `strict: false`, also accepts
 * the legacy three- and four-field object flag layouts and zero-fills the remaining flag vectors.
 *
 * @param input - Object file contents as a string or Buffer.
 * @param options - Parser options controlling encoding, source names, warnings, and logging.
 * @returns Parsed object records.
 * @throws ParseError if the input is not valid object data.
 */
export function parseObject(input: MudInput, options: ParseOptions = {}): ObjectRecord[] {
  const context = normalizeParseOptions(options);
  const reader = new MudReader(input, readerOptionsFrom(options));
  const records: ObjectRecord[] = [];
  let pendingLine: SourceLine | undefined;

  for (;;) {
    const line = pendingLine ?? readContentLine(reader);
    pendingLine = undefined;

    if (line === null) {
      fail(
        'Expected object record header or $ before EOF',
        context,
        sourceForReader(reader, context),
      );
    }

    const text = skipMudSpaces(line.text);

    if (text.startsWith('$')) {
      return records;
    }

    const vnum = parseObjectHeader(text, context, line);

    if (vnum >= RECORD_SENTINEL_VNUM) {
      return records;
    }

    const result = parseObjectRecord(reader, context, line, vnum);
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
function normalizeParseOptions(options: ParseOptions): ObjectParserContext {
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
 * Parses a `#<vnum>` object record header line.
 *
 * @param text - Trimmed source header text.
 * @param context - Normalized parser context.
 * @param line - Source line containing the header.
 * @returns Parsed object VNUM.
 * @throws ParseError if the line is not a valid object header.
 */
function parseObjectHeader(text: string, context: ObjectParserContext, line: SourceLine): Vnum {
  const headerMatch = /^#([+-]?\d+)\s*$/.exec(text);

  if (headerMatch === null) {
    fail('Expected object record header', context, sourceForLine(context, line.startLine));
  }

  const vnum = parseInteger(headerMatch[1]);

  if (vnum === null) {
    fail('Expected numeric object vnum', context, sourceForLine(context, line.startLine));
  }

  return vnum;
}

/**
 * Parses one complete object record from the current reader position.
 *
 * @param reader - Cursor over the object input positioned after the object header.
 * @param context - Normalized parser context.
 * @param headerLine - Source line containing the object header.
 * @param vnum - Object VNUM from the header.
 * @returns Parsed record plus optional lookahead line for the next outer-loop iteration.
 * @throws ParseError if the object body is malformed.
 */
function parseObjectRecord(
  reader: MudReader,
  context: ObjectParserContext,
  headerLine: SourceLine,
  vnum: Vnum,
): ObjectRecordParseResult {
  const aliasString = readObjectString(reader, context, `object #${vnum} aliases`, vnum);

  if (aliasString === null) {
    fail('Expected object aliases', context, sourceForReader(reader, context), vnum);
  }

  const shortDescription = readObjectString(
    reader,
    context,
    `object #${vnum} short description`,
    vnum,
  );
  const description = readObjectString(reader, context, `object #${vnum} description`, vnum);
  const actionDescription = readObjectString(
    reader,
    context,
    `object #${vnum} action description`,
    vnum,
  );
  const firstNumericLine = requireContentLine(
    reader,
    context,
    'Expected object type and flag line',
    vnum,
  );
  const numbers = parseObjectNumbers(firstNumericLine.text, context, firstNumericLine, vnum);
  const secondNumericLine = requireContentLine(reader, context, 'Expected object value line', vnum);
  const values = parseObjectValues(secondNumericLine.text);

  if (values === null) {
    fail(
      'Expected four numeric fields for object values',
      context,
      sourceForLine(context, secondNumericLine.startLine),
      vnum,
    );
  }

  const thirdNumericLine = requireContentLine(
    reader,
    context,
    'Expected object weight, cost, rent, level, and timer line',
    vnum,
  );
  const costs = parseObjectCosts(thirdNumericLine.text, context, thirdNumericLine, vnum);
  const extraDescriptions: ExtraDescription[] = [];
  const affects: ObjectAffect[] = [];
  const triggerVnums: Vnum[] = [];
  let endLine = thirdNumericLine.startLine;

  for (;;) {
    const line = readContentLine(reader);

    if (line === null) {
      fail(
        'Expected E, A, T, $, or next object header before EOF',
        context,
        sourceForReader(reader, context),
        vnum,
      );
    }

    const text = skipMudSpaces(line.text);
    const marker = text.charAt(0);

    if (marker === 'E') {
      extraDescriptions.push(parseExtraDescription(reader, context, vnum));
      endLine = Math.max(line.startLine, reader.line - 1);
    } else if (marker === 'A') {
      if (affects.length >= MAX_OBJ_AFFECT) {
        if (context.strict) {
          fail(
            `Too many object affect fields (${MAX_OBJ_AFFECT} max)`,
            context,
            sourceForLine(context, line.startLine),
            vnum,
          );
        }

        skipOverflowAffect(reader, context, line, vnum);
        endLine = reader.line - 1;
      } else {
        const affect = parseObjectAffect(reader, context, vnum);
        affects.push(affect);
        endLine = reader.line - 1;
      }
    } else if (marker === 'T') {
      const triggerVnum = parseTriggerLine(text, context, line, vnum);

      if (triggerVnum !== null) {
        triggerVnums.push(triggerVnum);
      }

      endLine = line.startLine;
    } else if (marker === '#' || marker === '$') {
      return recordResult(
        new ObjectRecord({
          vnum,
          aliases: splitKeywords(aliasString),
          shortDescription,
          description,
          actionDescription,
          objectType: numbers.objectType,
          objectTypeName: resolveOrdinalName(numbers.objectType, ITEM_TYPES),
          extraFlags: resolveFlagSetNames(numbers.extraFlagsSet, EXTRA_FLAGS),
          extraFlagsBits: bitvectorSetToAsciiFlags(numbers.extraFlagsSet),
          wearFlags: resolveFlagSetNames(numbers.wearFlagsSet, WEAR_FLAGS),
          wearFlagsBits: bitvectorSetToAsciiFlags(numbers.wearFlagsSet),
          affectFlags: resolveFlagSetNames(numbers.affectFlagsSet, AFFECTED_FLAGS),
          affectFlagsBits: bitvectorSetToAsciiFlags(numbers.affectFlagsSet),
          values,
          weight: costs.weight,
          cost: costs.cost,
          rent: costs.rent,
          level: costs.level,
          timer: costs.timer,
          extraDescriptions,
          affects,
          triggerVnums,
          source: sourceForLine(context, headerLine.startLine, endLine),
        }),
        line,
      );
    } else {
      fail(
        `Expected E, A, T, $, or next object header, received '${marker}'`,
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
 * @param record - Parsed object record.
 * @param nextLine - Already-read next line.
 * @returns Parse result with exact optional-property semantics.
 */
function recordResult(record: ObjectRecord, nextLine: SourceLine): ObjectRecordParseResult {
  return { record, nextLine };
}

/**
 * Reads a MUD string and converts reader errors into object-specific `ParseError` instances.
 *
 * @param reader - Cursor over the object input.
 * @param context - Normalized parser context.
 * @param description - Human-readable source context for errors.
 * @param vnum - Object VNUM used for error context.
 * @returns Decoded MUD string, or `null` for an explicitly empty source string.
 * @throws ParseError if EOF is reached before the string terminator.
 */
function readObjectString(
  reader: MudReader,
  context: ObjectParserContext,
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
 * Parses the object type and flag numeric line.
 *
 * @param lineText - Source line containing object type and flag tokens.
 * @param context - Normalized parser context.
 * @param line - Source line metadata.
 * @param vnum - Object VNUM used for error and warning context.
 * @returns Parsed object type and flag bitvector sets.
 * @throws ParseError if the line is malformed or legacy-only in strict mode.
 */
function parseObjectNumbers(
  lineText: string,
  context: ObjectParserContext,
  line: SourceLine,
  vnum: Vnum,
): ObjectNumbers {
  const tokens = splitTokens(lineText);

  if (tokens.length === 13) {
    const objectType = parseInteger(tokens[0]);
    const extraFlagsSet = parseFlagSet(tokens, 1, parseAsciiFlag);
    const wearFlagsSet = parseFlagSet(tokens, 5, parseAsciiFlag);
    const affectFlagsSet = parseFlagSet(tokens, 9, parseAsciiAffectFlag);

    if (
      objectType === null ||
      extraFlagsSet === null ||
      wearFlagsSet === null ||
      affectFlagsSet === null
    ) {
      fail(
        'Expected numeric object type and valid object flag tokens',
        context,
        sourceForLine(context, line.startLine),
        vnum,
      );
    }

    return {
      objectType,
      extraFlagsSet,
      wearFlagsSet,
      affectFlagsSet,
    };
  }

  if (tokens.length === 3 || tokens.length === 4) {
    if (context.strict) {
      fail(
        'Legacy object flag lines require strict: false',
        context,
        sourceForLine(context, line.startLine),
        vnum,
      );
    }

    const objectType = parseInteger(tokens[0]);
    const extraFlagsSet = parseLegacyFlagSet(tokens[1], parseAsciiFlag);
    const wearFlagsSet = parseLegacyFlagSet(tokens[2], parseAsciiFlag);
    const affectFlagsSet =
      tokens.length === 4 ? parseLegacyFlagSet(tokens[3], parseAsciiAffectFlag) : ZERO_FLAG_SET;

    if (objectType === null || extraFlagsSet === null || wearFlagsSet === null) {
      fail(
        'Expected numeric object type and valid legacy object flag tokens',
        context,
        sourceForLine(context, line.startLine),
        vnum,
      );
    }
    if (affectFlagsSet === null) {
      fail(
        'Expected valid legacy object affect flag token',
        context,
        sourceForLine(context, line.startLine),
        vnum,
      );
    }

    emitWarning(
      'Converted legacy object flags to 128-bit form',
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );

    return {
      objectType,
      extraFlagsSet,
      wearFlagsSet,
      affectFlagsSet,
    };
  }

  fail(
    `Expected 13 fields for object flags, received ${tokens.length}`,
    context,
    sourceForLine(context, line.startLine),
    vnum,
  );
}

/**
 * Parses one four-element flag vector set from a 13-field object flag line.
 *
 * @param tokens - Split source tokens.
 * @param startIndex - First flag token index.
 * @param parseFlag - Flag parser to use for each token.
 * @returns Parsed four-element bitvector set, or `null` when malformed.
 */
function parseFlagSet(
  tokens: readonly string[],
  startIndex: number,
  parseFlag: (value: string) => number,
): BitVectorSet | null {
  const values: number[] = [];

  for (let offset = 0; offset < 4; offset += 1) {
    const token = tokens[startIndex + offset];

    /* v8 ignore next -- @preserve parseObjectNumbers() calls this only after validating a 13-token line. */
    if (token === undefined) {
      return null;
    }

    const value = parseFlag(token);

    if (!Number.isSafeInteger(value) || value < 0) {
      return null;
    }

    values.push(value);
  }

  return bitVectorSetFrom(values);
}

/**
 * Parses one legacy single-field flag value into a four-element flag set.
 *
 * @param token - Legacy flag token.
 * @param parseFlag - Flag parser to use.
 * @returns Parsed bitvector set with remaining fields zeroed, or `null` when malformed.
 */
function parseLegacyFlagSet(
  token: string | undefined,
  parseFlag: (value: string) => number,
): BitVectorSet | null {
  /* v8 ignore next -- @preserve parseObjectNumbers() calls this only after validating 3 or 4 legacy tokens. */
  if (token === undefined) {
    return null;
  }

  const value = parseFlag(token);

  if (!Number.isSafeInteger(value) || value < 0) {
    return null;
  }

  return [value, 0, 0, 0];
}

/**
 * Builds a four-element bitvector set from a validated array.
 *
 * @param values - Validated four-value array.
 * @returns Four-element bitvector set.
 */
function bitVectorSetFrom(values: readonly number[]): BitVectorSet {
  /* v8 ignore next -- @preserve parseFlagSet() always supplies exactly four validated values. */
  const valueAt = (index: number): number => values[index] ?? 0;

  return [valueAt(0), valueAt(1), valueAt(2), valueAt(3)];
}

/**
 * Parses four object value fields.
 *
 * @param line - Source line containing object values.
 * @returns Parsed values tuple, or `null` when malformed.
 */
function parseObjectValues(line: string): ObjectValues | null {
  const values = parseIntegerTokens(line);

  if (values === null || values.length !== 4) {
    return null;
  }

  return [valueAt(values, 0), valueAt(values, 1), valueAt(values, 2), valueAt(values, 3)];
}

/**
 * Parses object weight, cost, rent, level, and timer fields.
 *
 * @param lineText - Source line containing object costs.
 * @param context - Normalized parser context.
 * @param line - Source line metadata.
 * @param vnum - Object VNUM used for error and warning context.
 * @returns Parsed object costs.
 * @throws ParseError if the line is malformed or legacy-only in strict mode.
 */
function parseObjectCosts(
  lineText: string,
  context: ObjectParserContext,
  line: SourceLine,
  vnum: Vnum,
): ObjectCosts {
  const values = parseIntegerTokens(lineText);

  if (values === null) {
    fail(
      'Expected numeric object weight, cost, rent, level, and timer fields',
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
  }

  if (values.length === 5) {
    return {
      weight: valueAt(values, 0),
      cost: valueAt(values, 1),
      rent: valueAt(values, 2),
      level: valueAt(values, 3),
      timer: valueAt(values, 4),
    };
  }

  if (values.length === 3 || values.length === 4) {
    return {
      weight: valueAt(values, 0),
      cost: valueAt(values, 1),
      rent: valueAt(values, 2),
      level: values.length === 4 ? valueAt(values, 3) : 0,
      timer: 0,
    };
  }

  fail(
    `Expected 5 fields for object costs, received ${values.length}`,
    context,
    sourceForLine(context, line.startLine),
    vnum,
  );
}

/**
 * Parses one object extra-description subrecord.
 *
 * @param reader - Cursor over the object input positioned after the `E` marker.
 * @param context - Normalized parser context.
 * @param vnum - Object VNUM used for error context.
 * @returns Parsed extra description data.
 * @throws ParseError if either tilde string is unterminated.
 */
function parseExtraDescription(
  reader: MudReader,
  context: ObjectParserContext,
  vnum: Vnum,
): ExtraDescription {
  const keywords = readObjectString(reader, context, `object #${vnum} extra keywords`, vnum);
  const description = readObjectString(reader, context, `object #${vnum} extra description`, vnum);

  return {
    keywords: splitKeywords(keywords),
    description,
  };
}

/**
 * Parses one object affect subrecord.
 *
 * @param reader - Cursor over the object input positioned after the `A` marker.
 * @param context - Normalized parser context.
 * @param vnum - Object VNUM used for error context.
 * @returns Parsed object affect data.
 * @throws ParseError if the affect line is missing or malformed.
 */
function parseObjectAffect(
  reader: MudReader,
  context: ObjectParserContext,
  vnum: Vnum,
): ObjectAffect {
  const line = requireContentLine(reader, context, 'Expected object affect line', vnum);
  const values = parseIntegerTokens(line.text);

  if (values === null || values.length !== 2) {
    fail(
      'Expected two numeric fields for object affect',
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
  }

  const location = valueAt(values, 0);

  return {
    location,
    locationName: resolveOrdinalName(location, APPLY_TYPES),
    modifier: valueAt(values, 1),
  };
}

/**
 * Consumes and warns for an object affect that exceeds tbaMUD's fixed affect slot count.
 *
 * @param reader - Cursor over the object input positioned after the overflow `A` marker.
 * @param context - Normalized parser context.
 * @param markerLine - Source line containing the overflow `A` marker.
 * @param vnum - Object VNUM used for warning context.
 * @returns Nothing.
 */
function skipOverflowAffect(
  reader: MudReader,
  context: ObjectParserContext,
  markerLine: SourceLine,
  vnum: Vnum,
): void {
  requireContentLine(reader, context, 'Expected object affect line', vnum);
  emitWarning(
    `Skipping object affect beyond ${MAX_OBJ_AFFECT} supported fields`,
    context,
    sourceForLine(context, markerLine.startLine),
    vnum,
  );
}

/**
 * Parses one `T <vnum>` DG trigger attachment line.
 *
 * Malformed trigger lines are warning-producing skips, matching tbaMUD's `dg_obj_trigger()`.
 *
 * @param text - Trimmed trigger line text.
 * @param context - Normalized parser context.
 * @param line - Source line containing the trigger text.
 * @param vnum - Object VNUM used for warning context.
 * @returns Parsed trigger VNUM, or `null` when malformed.
 */
function parseTriggerLine(
  text: string,
  context: ObjectParserContext,
  line: SourceLine,
  vnum: Vnum,
): Vnum | null {
  const match = /^T\s+([+-]?\d+)/.exec(text);

  if (match === null) {
    emitWarning(
      `Skipping malformed object trigger line '${text}'`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
    return null;
  }

  const triggerVnum = parseInteger(match[1]);

  if (triggerVnum === null) {
    emitWarning(
      `Skipping malformed object trigger line '${text}'`,
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
 * Splits a source line into whitespace-delimited tokens.
 *
 * @param line - Source line to split.
 * @returns Non-empty tokens.
 */
function splitTokens(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

/**
 * Parses a source line containing only integer tokens.
 *
 * @param line - Source line to parse.
 * @returns Parsed integer values, or `null` when any token is invalid.
 */
function parseIntegerTokens(line: string): number[] | null {
  const values: number[] = [];

  for (const token of splitTokens(line)) {
    const value = parseInteger(token);

    if (value === null) {
      return null;
    }

    values.push(value);
  }

  return values;
}

/**
 * Reads the next non-empty, non-comment source line with its original line number.
 *
 * @param reader - Cursor over the object input.
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
 * @param reader - Cursor over the object input.
 * @param context - Normalized parser context.
 * @param message - Error message to use if EOF is reached.
 * @param vnum - Optional object VNUM used for error context.
 * @returns The next content line.
 * @throws ParseError if EOF is reached before a content line is found.
 */
function requireContentLine(
  reader: MudReader,
  context: ObjectParserContext,
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
 * Safely reads a value from a validated numeric array.
 *
 * @param values - Validated values.
 * @param index - Array index to read.
 * @returns Value at the index, or zero for defensive fallback.
 */
function valueAt(values: readonly number[], index: number): number {
  /* v8 ignore next -- @preserve callers validate token counts before reading indexed values. */
  return values[index] ?? 0;
}

/**
 * Resolves an ordinal table value to a public name.
 *
 * @param value - Numeric source ordinal.
 * @param table - Ordinal name table from constants.c.
 * @returns Resolved name, or `UNKNOWN_<value>` when no valid table entry exists.
 */
function resolveOrdinalName(value: number, table: FlagTable): string {
  const name = table[value];
  return name === undefined || name === '\n' || name === '\0' ? `UNKNOWN_${value}` : name;
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
  context: ObjectParserContext,
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
 * @param reader - Cursor over the object input.
 * @param context - Normalized parser context.
 * @returns Source span using the reader's current line.
 */
function sourceForReader(reader: MudReader, context: ObjectParserContext): SourceSpan {
  return sourceForLine(context, reader.line);
}

/**
 * Creates a structured parse warning for object-specific recoverable issues.
 *
 * @param message - Human-readable warning message.
 * @param context - Normalized parser context.
 * @param source - Source span for the warning.
 * @param vnum - Object VNUM associated with the warning.
 * @returns Structured parse warning object.
 */
function warningFor(
  message: string,
  context: ObjectParserContext,
  source: SourceSpan,
  vnum: Vnum,
): ParseWarning {
  const warning: ParseWarning = {
    message,
    source,
    recordType: RecordType.Object,
    vnum,
  };

  /* v8 ignore next -- @preserve sourceForLine() already adds fileName when present. */
  if (context.sourceName !== undefined && warning.source?.fileName === undefined) {
    warning.source = {
      ...source,
      fileName: context.sourceName,
    };
  }

  return warning;
}

/**
 * Emits a recoverable object parser warning through both warning channels.
 *
 * @param message - Human-readable warning message.
 * @param context - Normalized parser context.
 * @param source - Source span for the warning.
 * @param vnum - Object VNUM associated with the warning.
 * @returns Nothing.
 */
function emitWarning(
  message: string,
  context: ObjectParserContext,
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
 * @param vnum - Optional object VNUM associated with the error.
 * @param cause - Optional underlying error that caused the parse failure.
 * @throws ParseError always.
 */
function fail(
  message: string,
  context: ObjectParserContext,
  source: SourceSpan,
  vnum?: Vnum,
  cause?: unknown,
): never {
  const errorContext: MudParserErrorContext = {
    source,
    recordType: RecordType.Object,
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
