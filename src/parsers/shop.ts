/**
 * Parser for CircleMUD/tbaMUD shop files (`.shp`).
 *
 * Shop files contain one or more shop records plus an optional v3.0 marker. The parser preserves
 * product, keeper, and room references as VNUMs and keeps trade-list expressions as source strings
 * because tbaMUD evaluates them dynamically at runtime.
 */
import { readFileSync } from 'node:fs';

import { ITEM_TYPES, SHOP_FLAGS, TRADE_FLAGS } from '../flag-tables.js';
import { bitvectorToAsciiFlags, resolveFlagNames } from '../flags.js';
import { type Logger, type ParseOptions, silentLogger } from '../options.js';
import { MudReader, parseAsciiFlag, readMudString, skipMudSpaces } from '../reader.js';
import { ShopRecord } from '../records.js';
import { ParseError, type MudParserErrorContext } from '../errors.js';
import { RecordType } from '../types.js';
import type { ReaderOptions } from '../reader.js';
import type { BitVector, FlagTable, MudInput, SourceSpan, Vnum } from '../types.js';
import type { ShopTradeType } from '../records.js';

/** Normalized options used internally while parsing a shop file. */
interface ShopParserContext {
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

/** Parsed integer line plus source metadata. */
interface IntegerLine {
  /** Parsed integer value. */
  readonly value: number;

  /** Source line that produced the value. */
  readonly line: SourceLine;
}

/** Parsed float line plus source metadata. */
interface FloatLine {
  /** Parsed floating-point value. */
  readonly value: number;

  /** Source line that produced the value. */
  readonly line: SourceLine;
}

/** Parsed bitvector line plus source metadata. */
interface BitvectorLine {
  /** Parsed bitvector value. */
  readonly value: BitVector;

  /** Source line that produced the value. */
  readonly line: SourceLine;
}

/** Resolved bitvector names and canonical bits string. */
interface ResolvedBitvector {
  /** Resolved public flag names. */
  readonly names: readonly string[];

  /** Canonical ASCII flag representation. */
  readonly bits: string;
}

const VERSION3_TAG = 'v3.0';
const MAX_PROD = 5;
const MAX_TRADE = 5;
const OLD_FORMAT_ROOM_COUNT = 1;
const INT_PREFIX_PATTERN = /^\s*([+-]?\d+)/;
const FLOAT_PREFIX_PATTERN = /^\s*([+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)/;

/**
 * Reads and parses one `.shp` file from disk.
 *
 * @param fileName - Path to the shop file to read.
 * @param options - Parser options controlling encoding, source names, and logging.
 * @returns Parsed shop records.
 * @throws ParseError if the file contents are not valid shop data.
 */
export function parseShopFile(fileName: string, options: ParseOptions = {}): ShopRecord[] {
  const input = readFileSync(fileName);
  return parseShop(input, {
    ...options,
    sourceName: options.sourceName ?? fileName,
  });
}

/**
 * Parses shop content from a string or Buffer.
 *
 * Supports both old fixed-list shops and the tbaMUD v3.0 variable-list format. The v3.0 format is
 * selected when a pre-record tilde string contains `v3.0`, matching `boot_the_shops()`.
 *
 * @param input - Shop file contents as a string or Buffer.
 * @param options - Parser options controlling encoding, source names, and logging.
 * @returns Parsed shop records.
 * @throws ParseError if the input is not valid shop data.
 */
export function parseShop(input: MudInput, options: ParseOptions = {}): ShopRecord[] {
  const context = normalizeParseOptions(options);
  const reader = new MudReader(input, readerOptionsFrom(options));
  const records: ShopRecord[] = [];
  let newFormat = false;

  for (;;) {
    const startLine = reader.line;
    const marker = readShopString(reader, context, 'shop header or file terminator');

    if (marker === null) {
      fail(
        'Expected shop header, version marker, or $ terminator',
        context,
        sourceForLine(context, startLine),
      );
    }

    const text = skipMudSpaces(marker);

    if (text.startsWith('$')) {
      return records;
    }
    if (text.startsWith('#')) {
      const vnum = parseShopHeader(text, context, sourceForLine(context, startLine));
      records.push(parseShopRecord(reader, context, startLine, vnum, newFormat));
    } else if (marker.includes(VERSION3_TAG)) {
      newFormat = true;
    } else {
      context.logger.debug(`Skipping unrecognized shop file marker: ${marker}`);
    }
  }
}

/**
 * Applies parser defaults once so later helpers do not repeatedly check optional fields.
 *
 * @param options - Public parse options supplied by the caller.
 * @returns Normalized parser context with default logger applied.
 */
function normalizeParseOptions(options: ParseOptions): ShopParserContext {
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
 * Parses a `#<vnum>` shop record header string.
 *
 * @param text - Trimmed tilde-string content from the header.
 * @param context - Normalized parser context.
 * @param source - Source span for the header.
 * @returns Parsed shop VNUM.
 * @throws ParseError if the header is malformed.
 */
function parseShopHeader(text: string, context: ShopParserContext, source: SourceSpan): Vnum {
  const headerMatch = /^#([+-]?\d+)\s*$/.exec(text);

  if (headerMatch === null) {
    fail('Expected shop record header', context, source);
  }

  const vnum = parseLeadingInteger(headerMatch[1]);

  if (vnum === null) {
    fail('Expected numeric shop vnum', context, source);
  }

  return vnum;
}

/**
 * Parses one complete shop record from the current reader position.
 *
 * @param reader - Cursor over the shop input positioned after the shop header.
 * @param context - Normalized parser context.
 * @param startLine - Source line of the shop header.
 * @param vnum - Shop VNUM from the header.
 * @param newFormat - Whether v3.0 variable-length lists are active.
 * @returns Parsed shop record.
 * @throws ParseError if the shop body is malformed.
 */
function parseShopRecord(
  reader: MudReader,
  context: ShopParserContext,
  startLine: number,
  vnum: Vnum,
  newFormat: boolean,
): ShopRecord {
  const productVnums = parseIntegerList(
    reader,
    context,
    newFormat,
    MAX_PROD,
    'shop product list',
    vnum,
  );
  const buyProfit = readFloatLine(reader, context, 'Expected shop buy profit', vnum);
  const sellProfit = readFloatLine(reader, context, 'Expected shop sell profit', vnum);
  const buyTypes = parseBuyTypeList(reader, context, newFormat, vnum);
  const noSuchItemKeeper = readShopString(
    reader,
    context,
    `shop #${vnum} no-such-item keeper message`,
    vnum,
  );
  const noSuchItemPlayer = readShopString(
    reader,
    context,
    `shop #${vnum} no-such-item player message`,
    vnum,
  );
  const doNotBuy = readShopString(reader, context, `shop #${vnum} do-not-buy message`, vnum);
  const missingCashKeeper = readShopString(
    reader,
    context,
    `shop #${vnum} missing-cash keeper message`,
    vnum,
  );
  const missingCashPlayer = readShopString(
    reader,
    context,
    `shop #${vnum} missing-cash player message`,
    vnum,
  );
  const messageBuy = readShopString(reader, context, `shop #${vnum} buy message`, vnum);
  const messageSell = readShopString(reader, context, `shop #${vnum} sell message`, vnum);
  const temper = readIntegerLine(reader, context, 'Expected shop temper', vnum);
  const shopBitvector = readBitvectorLine(reader, context, 'Expected shop flags bitvector', vnum);
  const keeper = readIntegerLine(reader, context, 'Expected shop keeper vnum', vnum);
  const noTradeBitvector = readBitvectorLine(
    reader,
    context,
    'Expected shop no-trade bitvector',
    vnum,
  );
  const roomVnums = parseIntegerList(
    reader,
    context,
    newFormat,
    OLD_FORMAT_ROOM_COUNT,
    'shop room list',
    vnum,
  );
  const open1 = readIntegerLine(reader, context, 'Expected shop first open hour', vnum);
  const close1 = readIntegerLine(reader, context, 'Expected shop first close hour', vnum);
  const open2 = readIntegerLine(reader, context, 'Expected shop second open hour', vnum);
  const close2 = readIntegerLine(reader, context, 'Expected shop second close hour', vnum);
  const resolvedShopFlags = resolveBitvector(
    shopBitvector.value,
    SHOP_FLAGS,
    context,
    shopBitvector.line,
    vnum,
    'shop flags',
  );
  const resolvedNoTradeFlags = resolveBitvector(
    noTradeBitvector.value,
    TRADE_FLAGS,
    context,
    noTradeBitvector.line,
    vnum,
    'shop no-trade flags',
  );

  return new ShopRecord({
    vnum,
    productVnums,
    buyProfit: buyProfit.value,
    sellProfit: sellProfit.value,
    buyTypes,
    noSuchItemKeeper,
    noSuchItemPlayer,
    doNotBuy,
    missingCashKeeper,
    missingCashPlayer,
    messageBuy,
    messageSell,
    temper: temper.value,
    shopFlags: resolvedShopFlags.names,
    shopFlagsBits: resolvedShopFlags.bits,
    keeperVnum: nullableVnum(keeper.value),
    noTradeFlags: resolvedNoTradeFlags.names,
    noTradeBits: resolvedNoTradeFlags.bits,
    roomVnums,
    open1: open1.value,
    close1: close1.value,
    open2: open2.value,
    close2: close2.value,
    source: sourceForLine(context, startLine, close2.line.startLine),
  });
}

/**
 * Reads a tilde-terminated shop string and converts reader errors into shop-specific parse errors.
 *
 * @param reader - Cursor over the shop input.
 * @param context - Normalized parser context.
 * @param description - Human-readable source context for errors.
 * @param vnum - Optional shop VNUM used for error context.
 * @returns Decoded MUD string, or `null` for an explicitly empty source string.
 * @throws ParseError if EOF is reached before the string terminator.
 */
function readShopString(
  reader: MudReader,
  context: ShopParserContext,
  description: string,
  vnum?: Vnum,
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
 * Parses a product or room VNUM list.
 *
 * New-format lists are terminated by a negative integer. Old-format lists read a fixed count and
 * filter negative sentinel values, matching `read_list()`.
 *
 * @param reader - Cursor over the shop input.
 * @param context - Normalized parser context.
 * @param newFormat - Whether v3.0 variable-length lists are active.
 * @param oldFormatCount - Number of entries to read in old-format mode.
 * @param description - Human-readable list description for errors.
 * @param vnum - Shop VNUM used for error context.
 * @returns Parsed non-negative VNUMs.
 */
function parseIntegerList(
  reader: MudReader,
  context: ShopParserContext,
  newFormat: boolean,
  oldFormatCount: number,
  description: string,
  vnum: Vnum,
): Vnum[] {
  const values: Vnum[] = [];

  if (newFormat) {
    for (;;) {
      const entry = readIntegerLine(reader, context, `Expected ${description} entry`, vnum);

      if (entry.value < 0) {
        break;
      }

      values.push(entry.value);
    }
  } else {
    for (let index = 0; index < oldFormatCount; index += 1) {
      const entry = readIntegerLine(reader, context, `Expected ${description} entry`, vnum);

      if (entry.value >= 0) {
        values.push(entry.value);
      }
    }
  }

  return values;
}

/**
 * Parses the shop buy-type list.
 *
 * New-format lists support optional expressions after item types and terminate with a negative type.
 * Old-format lists read five numeric entries and do not preserve expressions.
 *
 * @param reader - Cursor over the shop input.
 * @param context - Normalized parser context.
 * @param newFormat - Whether v3.0 variable-length lists are active.
 * @param vnum - Shop VNUM used for error context.
 * @returns Parsed buy-type entries.
 */
function parseBuyTypeList(
  reader: MudReader,
  context: ShopParserContext,
  newFormat: boolean,
  vnum: Vnum,
): ShopTradeType[] {
  const buyTypes: ShopTradeType[] = [];

  if (newFormat) {
    for (;;) {
      const line = requireContentLine(reader, context, 'Expected shop buy-type list entry', vnum);
      const tradeType = parseBuyTypeLine(line.text, context, line, vnum);

      if (tradeType === null) {
        break;
      }

      buyTypes.push(tradeType);
    }
  } else {
    for (let index = 0; index < MAX_TRADE; index += 1) {
      const line = requireContentLine(reader, context, 'Expected shop buy-type list entry', vnum);
      const itemType = parseLeadingInteger(line.text);

      if (itemType === null) {
        fail(
          'Expected numeric shop buy-type entry',
          context,
          sourceForLine(context, line.startLine),
          vnum,
        );
      }
      if (itemType >= 0) {
        buyTypes.push(shopTradeType(itemType, null));
      }
    }
  }

  return buyTypes;
}

/**
 * Parses a single new-format buy-type line.
 *
 * The C reader accepts either an item type name prefix or a leading integer, then preserves the
 * remaining text as the keyword/expression. A semicolon starts a line comment in this list only.
 *
 * @param text - Source line text.
 * @param context - Normalized parser context.
 * @param line - Source line metadata.
 * @param vnum - Shop VNUM used for error context.
 * @returns Parsed trade type, or `null` for a negative terminator line.
 */
function parseBuyTypeLine(
  text: string,
  context: ShopParserContext,
  line: SourceLine,
  vnum: Vnum,
): ShopTradeType | null {
  const uncommented = stripLineComment(text);
  const trimmed = skipMudSpaces(uncommented);
  const numericPrefix = parseIntegerPrefix(trimmed);

  if (numericPrefix !== null && numericPrefix.value < 0) {
    return null;
  }

  const namedPrefix = parseItemTypeNamePrefix(trimmed);
  if (namedPrefix !== null) {
    return shopTradeType(namedPrefix.itemType, nullableString(namedPrefix.remainder.trim()));
  }

  if (numericPrefix !== null) {
    return shopTradeType(numericPrefix.value, nullableString(numericPrefix.remainder.trim()));
  }

  fail('Expected shop buy-type entry', context, sourceForLine(context, line.startLine), vnum);
}

/**
 * Creates a public shop trade type with ordinal-name resolution.
 *
 * @param itemType - Numeric item type.
 * @param expression - Optional raw expression string.
 * @returns Public shop trade type object.
 */
function shopTradeType(itemType: number, expression: string | null): ShopTradeType {
  return {
    itemType,
    itemTypeName: resolveOrdinalName(itemType, ITEM_TYPES),
    expression,
  };
}

/**
 * Reads one integer line using `sscanf("%d")`-style prefix parsing.
 *
 * @param reader - Cursor over the shop input.
 * @param context - Normalized parser context.
 * @param message - Error message to use if the value is missing.
 * @param vnum - Shop VNUM used for error context.
 * @returns Parsed integer and source line.
 */
function readIntegerLine(
  reader: MudReader,
  context: ShopParserContext,
  message: string,
  vnum: Vnum,
): IntegerLine {
  const line = requireContentLine(reader, context, message, vnum);
  const value = parseLeadingInteger(line.text);

  if (value === null) {
    fail(message, context, sourceForLine(context, line.startLine), vnum);
  }

  return { value, line };
}

/**
 * Reads one floating-point line using `sscanf("%f")`-style prefix parsing.
 *
 * @param reader - Cursor over the shop input.
 * @param context - Normalized parser context.
 * @param message - Error message to use if the value is missing.
 * @param vnum - Shop VNUM used for error context.
 * @returns Parsed float and source line.
 */
function readFloatLine(
  reader: MudReader,
  context: ShopParserContext,
  message: string,
  vnum: Vnum,
): FloatLine {
  const line = requireContentLine(reader, context, message, vnum);
  const value = parseLeadingFloat(line.text);

  if (value === null) {
    fail(message, context, sourceForLine(context, line.startLine), vnum);
  }

  return { value, line };
}

/**
 * Reads one shop bitvector line.
 *
 * Numeric prefixes are parsed as decimal values to match `sscanf("%ld")`; non-numeric tokens are
 * accepted as ASCII flag strings to follow this library's public bitvector convention.
 *
 * @param reader - Cursor over the shop input.
 * @param context - Normalized parser context.
 * @param message - Error message to use if the value is missing.
 * @param vnum - Shop VNUM used for error context.
 * @returns Parsed bitvector and source line.
 */
function readBitvectorLine(
  reader: MudReader,
  context: ShopParserContext,
  message: string,
  vnum: Vnum,
): BitvectorLine {
  const line = requireContentLine(reader, context, message, vnum);
  const trimmed = skipMudSpaces(line.text);
  const numericPrefix = parseIntegerPrefix(trimmed);
  const value = numericPrefix === null ? parseAsciiFlag(firstToken(trimmed)) : numericPrefix.value;

  if (!Number.isInteger(value) || value < 0) {
    fail(message, context, sourceForLine(context, line.startLine), vnum);
  }

  return { value, line };
}

/**
 * Resolves bitvector public names and canonical ASCII bits with source-aware errors.
 *
 * @param value - Parsed bitvector value.
 * @param table - Flag table used for name resolution.
 * @param context - Normalized parser context.
 * @param line - Source line metadata.
 * @param vnum - Shop VNUM used for error context.
 * @param description - Human-readable field description for errors.
 * @returns Resolved bitvector names and bits.
 */
function resolveBitvector(
  value: BitVector,
  table: FlagTable,
  context: ShopParserContext,
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
 * @param reader - Cursor over the shop input.
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
 * @param reader - Cursor over the shop input.
 * @param context - Normalized parser context.
 * @param message - Error message to use if EOF is reached.
 * @param vnum - Shop VNUM used for error context.
 * @returns The next content line.
 */
function requireContentLine(
  reader: MudReader,
  context: ShopParserContext,
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
 * Removes the trade-list comment introduced by `;`.
 *
 * @param value - Source line value.
 * @returns Source text before the first semicolon.
 */
function stripLineComment(value: string): string {
  const commentIndex = value.indexOf(';');
  return commentIndex === -1 ? value : value.slice(0, commentIndex);
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
 * Parses a leading finite floating-point number.
 *
 * @param value - Source value.
 * @returns Parsed finite number, or `null` when no float prefix exists.
 */
function parseLeadingFloat(value: string): number | null {
  const match = FLOAT_PREFIX_PATTERN.exec(value);

  if (match === null) {
    return null;
  }

  const token = match[1];

  /* v8 ignore next -- @preserve FLOAT_PREFIX_PATTERN always defines its only capture group when it matches. */
  if (token === undefined) {
    return null;
  }

  const parsed = Number.parseFloat(token);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses a case-insensitive item-type name prefix using the C table order.
 *
 * @param value - Trade-list value to parse.
 * @returns Matching item type and remainder, or `null` when no name prefix matches.
 */
function parseItemTypeNamePrefix(
  value: string,
): { readonly itemType: number; readonly remainder: string } | null {
  const lowerValue = value.toLowerCase();

  for (const [itemType, name] of ITEM_TYPES.entries()) {
    /* v8 ignore next -- @preserve ITEM_TYPES currently has no sentinel entries; this keeps table parsing safe if one is added. */
    if (name === '\n' || name === '\0') {
      continue;
    }

    if (lowerValue.startsWith(name.toLowerCase())) {
      return {
        itemType,
        remainder: value.slice(name.length),
      };
    }
  }

  return null;
}

/**
 * Returns the first whitespace-delimited token in a source line.
 *
 * @param value - Source value.
 * @returns First token, or an empty string when no token is present.
 */
function firstToken(value: string): string {
  const token = value.trim().split(/\s+/, 1)[0];

  /* v8 ignore next -- @preserve split() always returns a first element here; fallback satisfies noUncheckedIndexedAccess. */
  return token ?? '';
}

/**
 * Converts explicitly absent strings to the public `null` representation.
 *
 * @param value - Decoded source string.
 * @returns `null` for an empty string; otherwise the original string.
 */
function nullableString(value: string): string | null {
  return value.length === 0 ? null : value;
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
 * Builds public source metadata from normalized parser context and line numbers.
 *
 * @param context - Normalized parser context.
 * @param startLine - Starting source line.
 * @param endLine - Optional ending source line.
 * @returns Source span suitable for public records and errors.
 */
function sourceForLine(
  context: ShopParserContext,
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
 * @param reader - Cursor over the shop input.
 * @param context - Normalized parser context.
 * @returns Source span using the reader's current line.
 */
function sourceForReader(reader: MudReader, context: ShopParserContext): SourceSpan {
  return sourceForLine(context, reader.line);
}

/**
 * Logs and throws a source-aware `ParseError`.
 *
 * @param message - Error message.
 * @param context - Normalized parser context.
 * @param source - Source span for the error.
 * @param vnum - Optional shop VNUM associated with the error.
 * @param cause - Optional underlying error.
 * @throws ParseError always.
 */
function fail(
  message: string,
  context: ShopParserContext,
  source: SourceSpan,
  vnum?: Vnum,
  cause?: unknown,
): never {
  const errorContext: MudParserErrorContext = {
    source,
    recordType: RecordType.Shop,
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
