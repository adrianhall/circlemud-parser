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
import { type ParseOptions } from '../options.js';
import { MudReader, parseAsciiAffectFlag, parseAsciiFlag, skipMudSpaces } from '../reader.js';
import { ObjectRecord } from '../records/index.js';
import { RecordType } from '../types.js';
import {
  emitWarning,
  fail,
  normalizeParseOptions,
  parseBitVectorSet,
  parseIntegerTokens,
  parseLegacyBitVectorSet,
  parseRecordHeader,
  parseTokenInteger,
  parseTriggerAttachmentLine,
  readContentLine,
  readerOptionsFrom,
  readSourceString,
  requireContentLine,
  resolveOrdinalName,
  sourceForLine,
  sourceForReader,
  splitKeywords,
  splitTokens,
  valueAt,
  ZERO_FLAG_SET,
  type ParserContext,
  type SourceLine,
} from './internal/index.js';
import type { BitVectorSet, MudInput, Vnum } from '../types.js';
import type { ExtraDescription, ObjectAffect } from '../records/index.js';

type ObjectParserContext = ParserContext<RecordType.Object>;

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

const RECORD_SENTINEL_VNUM = 99999;
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
 * Supports both the current 13-field object flag layout (tbaMUD) and the legacy three- and
 * four-field layouts (CircleMUD), auto-detecting by field count and zero-filling the remaining flag
 * vectors when a legacy layout is used. The `strict` option controls validation severity, not
 * format selection.
 *
 * @param input - Object file contents as a string or Buffer.
 * @param options - Parser options controlling encoding, source names, warnings, and logging.
 * @returns Parsed object records.
 * @throws ParseError if the input is not valid object data.
 */
export function parseObject(input: MudInput, options: ParseOptions = {}): ObjectRecord[] {
  const context = normalizeParseOptions(options, RecordType.Object);
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

    const vnum = parseRecordHeader(text, context, line, 'object');

    if (vnum >= RECORD_SENTINEL_VNUM) {
      return records;
    }

    const result = parseObjectRecord(reader, context, line, vnum);
    records.push(result.record);
    pendingLine = result.nextLine;
  }
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
  const aliasString = readSourceString(reader, context, `object #${vnum} aliases`, vnum);

  if (aliasString === null) {
    fail('Expected object aliases', context, sourceForReader(reader, context), vnum);
  }

  const shortDescription = readSourceString(
    reader,
    context,
    `object #${vnum} short description`,
    vnum,
  );
  const description = readSourceString(reader, context, `object #${vnum} description`, vnum);
  const actionDescription = readSourceString(
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
      const triggerVnum = parseTriggerAttachmentLine(text, context, line, vnum, 'object');

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
    const objectType = parseTokenInteger(tokens[0]);
    const extraFlagsSet = parseBitVectorSet(tokens, 1, parseAsciiFlag);
    const wearFlagsSet = parseBitVectorSet(tokens, 5, parseAsciiFlag);
    const affectFlagsSet = parseBitVectorSet(tokens, 9, parseAsciiAffectFlag);

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
    const objectType = parseTokenInteger(tokens[0]);
    const extraFlagsSet = parseLegacyBitVectorSet(tokens[1], parseAsciiFlag);
    const wearFlagsSet = parseLegacyBitVectorSet(tokens[2], parseAsciiFlag);
    const affectFlagsSet =
      tokens.length === 4
        ? parseLegacyBitVectorSet(tokens[3], parseAsciiAffectFlag)
        : ZERO_FLAG_SET;

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
  const keywords = readSourceString(reader, context, `object #${vnum} extra keywords`, vnum);
  const description = readSourceString(reader, context, `object #${vnum} extra description`, vnum);

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
