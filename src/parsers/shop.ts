/**
 * Parser for CircleMUD/tbaMUD shop files (`.shp`).
 *
 * Shop files contain one or more shop records plus an optional v3.0 marker. The parser preserves
 * product, keeper, and room references as VNUMs and keeps trade-list expressions as source strings
 * because tbaMUD evaluates them dynamically at runtime.
 */
import { readFileSync } from 'node:fs';

import { ITEM_TYPES, SHOP_FLAGS, TRADE_FLAGS } from '../flag-tables.js';
import { type ParseOptions } from '../options.js';
import { MudReader, parseAsciiFlag, skipMudSpaces } from '../reader.js';
import { ShopRecord } from '../records/index.js';
import { RecordType } from '../types.js';
import {
  fail,
  normalizeParseOptions,
  nullableString,
  nullableVnum,
  parseIntegerPrefix,
  parseLeadingInteger,
  parseRecordHeader,
  readerOptionsFrom,
  readSourceString,
  requireContentLine,
  resolveBitvector,
  resolveOrdinalName,
  sourceForLine,
  type ParserContext,
  type SourceLine,
} from './internal/index.js';
import type { BitVector, MudInput, Vnum } from '../types.js';
import type { ShopTradeType } from '../records/index.js';

type ShopParserContext = ParserContext<RecordType.Shop>;

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

const VERSION3_TAG = 'v3.0';
const MAX_PROD = 5;
const MAX_TRADE = 5;
const OLD_FORMAT_ROOM_COUNT = 1;
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
  const context = normalizeParseOptions(options, RecordType.Shop);
  const reader = new MudReader(input, readerOptionsFrom(options));
  const records: ShopRecord[] = [];
  let newFormat = false;

  for (;;) {
    const startLine = reader.line;
    const marker = readSourceString(reader, context, 'shop header or file terminator');

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
      const vnum = parseRecordHeader(text, context, { text, startLine }, 'shop');
      records.push(parseShopRecord(reader, context, startLine, vnum, newFormat));
    } else if (marker.includes(VERSION3_TAG)) {
      newFormat = true;
    } else {
      context.logger.debug(`Skipping unrecognized shop file marker: ${marker}`);
    }
  }
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
  const noSuchItemKeeper = readSourceString(
    reader,
    context,
    `shop #${vnum} no-such-item keeper message`,
    vnum,
  );
  const noSuchItemPlayer = readSourceString(
    reader,
    context,
    `shop #${vnum} no-such-item player message`,
    vnum,
  );
  const doNotBuy = readSourceString(reader, context, `shop #${vnum} do-not-buy message`, vnum);
  const missingCashKeeper = readSourceString(
    reader,
    context,
    `shop #${vnum} missing-cash keeper message`,
    vnum,
  );
  const missingCashPlayer = readSourceString(
    reader,
    context,
    `shop #${vnum} missing-cash player message`,
    vnum,
  );
  const messageBuy = readSourceString(reader, context, `shop #${vnum} buy message`, vnum);
  const messageSell = readSourceString(reader, context, `shop #${vnum} sell message`, vnum);
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
