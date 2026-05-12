/**
 * Parser for CircleMUD/tbaMUD mobile files (`.mob`).
 *
 * Mobile files contain one or more mobile prototype records. Records preserve unresolved trigger
 * references as VNUMs, expose resolved action and affect flag names, and keep source combat stats
 * in the same units used by builders in the world files.
 */
import { readFileSync } from 'node:fs';

import { ACTION_FLAGS, AFFECTED_FLAGS } from '../flag-tables.js';
import { bitvectorSetToAsciiFlags, resolveFlagSetNames } from '../flags.js';
import { type Logger, type ParseOptions, silentLogger } from '../options.js';
import {
  MudReader,
  parseAsciiAffectFlag,
  parseAsciiFlag,
  readMudString,
  skipMudSpaces,
} from '../reader.js';
import { MobileRecord } from '../records.js';
import { ParseError, type MudParserErrorContext, type ParseWarning } from '../errors.js';
import { RecordType } from '../types.js';
import type { ReaderOptions } from '../reader.js';
import type { BitVectorSet, MudInput, SourceSpan, Vnum } from '../types.js';
import type { DiceRoll, MobileEnhancedData, MobileRecordInit, MobileStats } from '../records.js';

/** Normalized options used internally while parsing a mobile file. */
interface MobileParserContext {
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

/** Parsed mobile flag fields before public flag-name resolution. */
interface MobileNumbers {
  /** Four-element mobile action flag bitvector set. */
  readonly actionFlagsSet: BitVectorSet;

  /** Four-element mobile affect flag bitvector set. */
  readonly affectFlagsSet: BitVectorSet;

  /** Mobile alignment from the source flag line. */
  readonly alignment: number;

  /** Mobile body kind marker from the source flag line. */
  readonly letter: string;
}

/** Result of parsing one simple mobile body. */
interface MobileBodyParseResult {
  /** Parsed mobile stats. */
  readonly stats: MobileStats;

  /** Ending source line for the simple body. */
  readonly endLine: number;
}

/** Result of parsing one enhanced mobile section. */
interface EnhancedSectionParseResult {
  /** Parsed enhanced mobile data. */
  readonly enhanced: MobileEnhancedData;

  /** Ending source line for the enhanced section. */
  readonly endLine: number;
}

/** Result of parsing mobile DG trigger attachment lines. */
interface TriggerSectionParseResult {
  /** Parsed trigger VNUMs. */
  readonly triggerVnums: readonly Vnum[];

  /** Ending source line including the last trigger line, if any. */
  readonly endLine: number;

  /** Already-read next mobile header or file terminator line, when present. */
  readonly nextLine?: SourceLine;
}

/** Result of parsing one mobile record plus any lookahead line for the next record. */
interface MobileRecordParseResult {
  /** Parsed mobile record. */
  readonly record: MobileRecord;

  /** Already-read next mobile header or file terminator line, when present. */
  readonly nextLine?: SourceLine;
}

/** Definition for one enhanced mobile keyword. */
interface EspecDefinition {
  /** Public enhanced-data property to set. */
  readonly property: keyof MobileEnhancedData;

  /** Inclusive minimum accepted source value, when known. */
  readonly min?: number;

  /** Inclusive maximum accepted source value, when known. */
  readonly max?: number;
}

const INT_TOKEN_PATTERN = /^[+-]?\d+$/;
const DICE_TOKEN_PATTERN = /^([+-]?\d+)d([+-]?\d+)\+([+-]?\d+)$/;
const RECORD_SENTINEL_VNUM = 99999;
const ZERO_FLAG_SET: BitVectorSet = [0, 0, 0, 0];

const ESPEC_DEFINITIONS: Readonly<Record<string, EspecDefinition>> = {
  barehandattack: { property: 'bareHandAttack', min: 0 },
  str: { property: 'str', min: 3, max: 25 },
  stradd: { property: 'strAdd', min: 0, max: 100 },
  int: { property: 'int', min: 3, max: 25 },
  wis: { property: 'wis', min: 3, max: 25 },
  dex: { property: 'dex', min: 3, max: 25 },
  con: { property: 'con', min: 3, max: 25 },
  cha: { property: 'cha', min: 3, max: 25 },
  savingpara: { property: 'savingPara', min: 0, max: 100 },
  savingrod: { property: 'savingRod', min: 0, max: 100 },
  savingpetri: { property: 'savingPetri', min: 0, max: 100 },
  savingbreath: { property: 'savingBreath', min: 0, max: 100 },
  savingspell: { property: 'savingSpell', min: 0, max: 100 },
};

/**
 * Reads and parses one `.mob` file from disk.
 *
 * @param fileName - Path to the mobile file to read.
 * @param options - Parser options controlling encoding, source names, warnings, and logging.
 * @returns Parsed mobile records.
 * @throws ParseError if the file contents are not valid mobile data.
 */
export function parseMobileFile(fileName: string, options: ParseOptions = {}): MobileRecord[] {
  const input = readFileSync(fileName);
  return parseMobile(input, {
    ...options,
    sourceName: options.sourceName ?? fileName,
  });
}

/**
 * Parses mobile content from a string or Buffer.
 *
 * Supports the current 10-field mobile flag layout by default. With `strict: false`, also accepts
 * the legacy four-field mobile flag layout and zero-fills the remaining flag vectors.
 *
 * @param input - Mobile file contents as a string or Buffer.
 * @param options - Parser options controlling encoding, source names, warnings, and logging.
 * @returns Parsed mobile records.
 * @throws ParseError if the input is not valid mobile data.
 */
export function parseMobile(input: MudInput, options: ParseOptions = {}): MobileRecord[] {
  const context = normalizeParseOptions(options);
  const reader = new MudReader(input, readerOptionsFrom(options));
  const records: MobileRecord[] = [];
  let pendingLine: SourceLine | undefined;

  for (;;) {
    const line = pendingLine ?? readContentLine(reader);
    pendingLine = undefined;

    if (line === null) {
      fail(
        'Expected mobile record header or $ before EOF',
        context,
        sourceForReader(reader, context),
      );
    }

    const text = skipMudSpaces(line.text);

    if (text.startsWith('$')) {
      return records;
    }

    const vnum = parseMobileHeader(text, context, line);

    if (vnum >= RECORD_SENTINEL_VNUM) {
      return records;
    }

    const result = parseMobileRecord(reader, context, line, vnum);
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
function normalizeParseOptions(options: ParseOptions): MobileParserContext {
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
 * Parses a `#<vnum>` mobile record header line.
 *
 * @param text - Trimmed source header text.
 * @param context - Normalized parser context.
 * @param line - Source line containing the header.
 * @returns Parsed mobile VNUM.
 * @throws ParseError if the line is not a valid mobile header.
 */
function parseMobileHeader(text: string, context: MobileParserContext, line: SourceLine): Vnum {
  const headerMatch = /^#([+-]?\d+)\s*$/.exec(text);

  if (headerMatch === null) {
    fail('Expected mobile record header', context, sourceForLine(context, line.startLine));
  }

  const vnum = parseInteger(headerMatch[1]);

  if (vnum === null) {
    fail('Expected numeric mobile vnum', context, sourceForLine(context, line.startLine));
  }

  return vnum;
}

/**
 * Parses one complete mobile record from the current reader position.
 *
 * @param reader - Cursor over the mobile input positioned after the mobile header.
 * @param context - Normalized parser context.
 * @param headerLine - Source line containing the mobile header.
 * @param vnum - Mobile VNUM from the header.
 * @returns Parsed record plus optional lookahead line for the next outer-loop iteration.
 * @throws ParseError if the mobile body is malformed.
 */
function parseMobileRecord(
  reader: MudReader,
  context: MobileParserContext,
  headerLine: SourceLine,
  vnum: Vnum,
): MobileRecordParseResult {
  const aliasString = readMobileString(reader, context, `mobile #${vnum} aliases`, vnum);

  if (aliasString === null) {
    fail('Expected mobile aliases', context, sourceForReader(reader, context), vnum);
  }

  const shortDescription = readMobileString(
    reader,
    context,
    `mobile #${vnum} short description`,
    vnum,
  );
  const longDescription = readMobileString(
    reader,
    context,
    `mobile #${vnum} long description`,
    vnum,
  );
  const description = readMobileString(reader, context, `mobile #${vnum} description`, vnum);
  const numericLine = requireContentLine(
    reader,
    context,
    'Expected mobile flags, alignment, and type line',
    vnum,
  );
  const numbers = parseMobileNumbers(numericLine.text, context, numericLine, vnum);
  const body = parseSimpleMobileBody(reader, context, vnum);
  const upperLetter = numbers.letter.toUpperCase();
  let kind: 'simple' | 'enhanced';
  let enhanced: MobileEnhancedData | undefined;
  let bodyEndLine = body.endLine;

  if (upperLetter === 'S') {
    kind = 'simple';
  } else if (upperLetter === 'E') {
    kind = 'enhanced';
    const enhancedSection = parseEnhancedMobileSection(reader, context, vnum);
    enhanced = enhancedSection.enhanced;
    bodyEndLine = enhancedSection.endLine;
  } else {
    fail(
      `Unsupported mobile type '${numbers.letter}'`,
      context,
      sourceForLine(context, numericLine.startLine),
      vnum,
    );
  }

  const triggers = parseTriggerSection(reader, context, vnum, bodyEndLine);
  const recordInit: MobileRecordInit = {
    vnum,
    aliases: splitKeywords(aliasString),
    shortDescription,
    longDescription,
    description,
    actionFlags: resolveFlagSetNames(numbers.actionFlagsSet, ACTION_FLAGS),
    actionFlagsBits: bitvectorSetToAsciiFlags(numbers.actionFlagsSet),
    affectFlags: resolveFlagSetNames(numbers.affectFlagsSet, AFFECTED_FLAGS),
    affectFlagsBits: bitvectorSetToAsciiFlags(numbers.affectFlagsSet),
    alignment: numbers.alignment,
    kind,
    stats: body.stats,
    triggerVnums: triggers.triggerVnums,
    source: sourceForLine(context, headerLine.startLine, triggers.endLine),
  };

  if (enhanced !== undefined) {
    recordInit.enhanced = enhanced;
  }

  return recordResult(new MobileRecord(recordInit), triggers.nextLine);
}

/**
 * Constructs a parse result while omitting absent optional lookahead lines.
 *
 * @param record - Parsed mobile record.
 * @param nextLine - Already-read next line.
 * @returns Parse result with exact optional-property semantics.
 */
function recordResult(record: MobileRecord, nextLine?: SourceLine): MobileRecordParseResult {
  if (nextLine === undefined) {
    return { record };
  }

  return { record, nextLine };
}

/**
 * Reads a MUD string and converts reader errors into mobile-specific `ParseError` instances.
 *
 * @param reader - Cursor over the mobile input.
 * @param context - Normalized parser context.
 * @param description - Human-readable source context for errors.
 * @param vnum - Mobile VNUM used for error context.
 * @returns Decoded MUD string, or `null` for an explicitly empty source string.
 * @throws ParseError if EOF is reached before the string terminator.
 */
function readMobileString(
  reader: MudReader,
  context: MobileParserContext,
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
 * Parses the mobile action/affect flag line.
 *
 * @param lineText - Source line containing flag tokens, alignment, and type letter.
 * @param context - Normalized parser context.
 * @param line - Source line metadata.
 * @param vnum - Mobile VNUM used for error and warning context.
 * @returns Parsed mobile flag sets, alignment, and body type marker.
 * @throws ParseError if the line is malformed or legacy-only in strict mode.
 */
function parseMobileNumbers(
  lineText: string,
  context: MobileParserContext,
  line: SourceLine,
  vnum: Vnum,
): MobileNumbers {
  const tokens = splitTokens(lineText);

  if (tokens.length === 10) {
    const actionFlagsSet = parseFlagSet(tokens, 0, parseAsciiFlag);
    const affectFlagsSet = parseFlagSet(tokens, 4, parseAsciiFlag);
    const alignment = parseInteger(tokens[8]);
    const letter = parseTypeLetter(tokens[9]);

    if (
      actionFlagsSet === null ||
      affectFlagsSet === null ||
      alignment === null ||
      letter === null
    ) {
      fail(
        'Expected valid mobile flag tokens, alignment, and type letter',
        context,
        sourceForLine(context, line.startLine),
        vnum,
      );
    }

    return {
      actionFlagsSet,
      affectFlagsSet,
      alignment,
      letter,
    };
  }

  if (tokens.length === 4) {
    if (context.strict) {
      fail(
        'Legacy mobile flag lines require strict: false',
        context,
        sourceForLine(context, line.startLine),
        vnum,
      );
    }

    const actionFlagsSet = parseLegacyFlagSet(tokens[0], parseAsciiFlag);
    const affectFlagsSet = parseLegacyFlagSet(tokens[1], parseAsciiAffectFlag);
    const alignment = parseInteger(tokens[2]);
    const letter = parseTypeLetter(tokens[3]);

    if (
      actionFlagsSet === null ||
      affectFlagsSet === null ||
      alignment === null ||
      letter === null
    ) {
      fail(
        'Expected valid legacy mobile flag tokens, alignment, and type letter',
        context,
        sourceForLine(context, line.startLine),
        vnum,
      );
    }

    emitWarning(
      'Converted legacy mobile flags to 128-bit form',
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );

    return {
      actionFlagsSet,
      affectFlagsSet,
      alignment,
      letter,
    };
  }

  fail(
    `Expected 10 fields for mobile flags, received ${tokens.length}`,
    context,
    sourceForLine(context, line.startLine),
    vnum,
  );
}

/**
 * Parses one four-element flag vector set from a 10-field mobile flag line.
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

    /* v8 ignore next -- @preserve parseMobileNumbers() calls this only after validating a 10-token line. */
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
  /* v8 ignore next -- @preserve parseMobileNumbers() calls this only after validating legacy tokens. */
  if (token === undefined) {
    return null;
  }

  const value = parseFlag(token);

  if (!Number.isSafeInteger(value) || value < 0) {
    return null;
  }

  return [value, ZERO_FLAG_SET[1], ZERO_FLAG_SET[2], ZERO_FLAG_SET[3]];
}

/**
 * Builds a four-element bitvector set from a validated array.
 *
 * @param values - Validated four-value array.
 * @returns Four-element bitvector set.
 */
function bitVectorSetFrom(values: readonly number[]): BitVectorSet {
  /* v8 ignore next -- @preserve parseFlagSet() always supplies exactly four validated values. */
  const valueAtIndex = (index: number): number => values[index] ?? 0;

  return [valueAtIndex(0), valueAtIndex(1), valueAtIndex(2), valueAtIndex(3)];
}

/**
 * Parses and validates a mobile body type letter token.
 *
 * @param token - Source token containing the type letter.
 * @returns The single-character type letter, or `null` when malformed.
 */
function parseTypeLetter(token: string | undefined): string | null {
  if (token === undefined || token.length !== 1) {
    return null;
  }

  return token;
}

/**
 * Parses one simple mobile stat body.
 *
 * @param reader - Cursor over the mobile input positioned after the flag line.
 * @param context - Normalized parser context.
 * @param vnum - Mobile VNUM used for error context.
 * @returns Parsed stats and ending line.
 * @throws ParseError if any required body line is missing or malformed.
 */
function parseSimpleMobileBody(
  reader: MudReader,
  context: MobileParserContext,
  vnum: Vnum,
): MobileBodyParseResult {
  const combatLine = requireContentLine(
    reader,
    context,
    'Expected mobile level, hitroll, armor class, and dice line',
    vnum,
  );
  const combatFields = parseMobileCombatLine(combatLine.text);

  if (combatFields === null) {
    fail(
      'Expected mobile combat line in the form level hitroll armorClass hitDice damageDice',
      context,
      sourceForLine(context, combatLine.startLine),
      vnum,
    );
  }

  const rewardLine = requireContentLine(
    reader,
    context,
    'Expected mobile gold and experience line',
    vnum,
  );
  const rewards = parseIntegerTokens(rewardLine.text);

  if (rewards === null || rewards.length !== 2) {
    fail(
      'Expected two numeric fields for mobile gold and experience',
      context,
      sourceForLine(context, rewardLine.startLine),
      vnum,
    );
  }

  const positionLine = requireContentLine(
    reader,
    context,
    'Expected mobile position, default position, and sex line',
    vnum,
  );
  const positions = parseIntegerTokens(positionLine.text);

  if (positions === null || positions.length !== 3) {
    fail(
      'Expected three numeric fields for mobile position, default position, and sex',
      context,
      sourceForLine(context, positionLine.startLine),
      vnum,
    );
  }

  return {
    stats: {
      level: combatFields.level,
      hitroll: combatFields.hitroll,
      armorClass: combatFields.armorClass,
      hitDice: combatFields.hitDice,
      damageDice: combatFields.damageDice,
      gold: valueAt(rewards, 0),
      experience: valueAt(rewards, 1),
      position: valueAt(positions, 0),
      defaultPosition: valueAt(positions, 1),
      sex: valueAt(positions, 2),
    },
    endLine: positionLine.startLine,
  };
}

/** Parsed first stat line for a simple mobile body. */
interface MobileCombatLine {
  /** Mobile level. */
  readonly level: number;

  /** Raw hitroll value. */
  readonly hitroll: number;

  /** Raw armor class value. */
  readonly armorClass: number;

  /** Hit dice expression. */
  readonly hitDice: DiceRoll;

  /** Damage dice expression. */
  readonly damageDice: DiceRoll;
}

/**
 * Parses the first simple-mobile stat line.
 *
 * @param line - Source line containing level, hitroll, armor class, and dice expressions.
 * @returns Parsed combat fields, or `null` when malformed.
 */
function parseMobileCombatLine(line: string): MobileCombatLine | null {
  const tokens = splitTokens(line);

  if (tokens.length !== 5) {
    return null;
  }

  const level = parseInteger(tokens[0]);
  const hitroll = parseInteger(tokens[1]);
  const armorClass = parseInteger(tokens[2]);
  const hitDice = parseDiceRoll(tokens[3]);
  const damageDice = parseDiceRoll(tokens[4]);

  if (
    level === null ||
    hitroll === null ||
    armorClass === null ||
    hitDice === null ||
    damageDice === null
  ) {
    return null;
  }

  return {
    level,
    hitroll,
    armorClass,
    hitDice,
    damageDice,
  };
}

/**
 * Parses a dice token in the source form `<count>d<sides>+<bonus>`.
 *
 * @param token - Source dice token.
 * @returns Parsed dice roll, or `null` when malformed.
 */
function parseDiceRoll(token: string | undefined): DiceRoll | null {
  /* v8 ignore next -- @preserve parseMobileCombatLine() only calls this after validating a five-token line. */
  if (token === undefined) {
    return null;
  }

  const match = DICE_TOKEN_PATTERN.exec(token);

  if (match === null) {
    return null;
  }

  const count = parseInteger(match[1]);
  const sides = parseInteger(match[2]);
  const bonus = parseInteger(match[3]);

  if (count === null || sides === null || bonus === null) {
    return null;
  }

  return { count, sides, bonus };
}

/**
 * Parses the enhanced mobile espec section after a simple body.
 *
 * @param reader - Cursor over the mobile input positioned after the simple body.
 * @param context - Normalized parser context.
 * @param vnum - Mobile VNUM used for error and warning context.
 * @returns Parsed enhanced data and ending line.
 * @throws ParseError if the section is unterminated or invalid in strict mode.
 */
function parseEnhancedMobileSection(
  reader: MudReader,
  context: MobileParserContext,
  vnum: Vnum,
): EnhancedSectionParseResult {
  const enhanced: MobileEnhancedData = {};

  for (;;) {
    const line = readContentLine(reader);

    if (line === null) {
      fail(
        'Unexpected EOF in enhanced mobile section',
        context,
        sourceForReader(reader, context),
        vnum,
      );
    }

    const text = skipMudSpaces(line.text);

    if (text.trim() === 'E') {
      return {
        enhanced,
        endLine: line.startLine,
      };
    }
    if (text.startsWith('#')) {
      fail(
        'Unterminated enhanced mobile section before next record header',
        context,
        sourceForLine(context, line.startLine),
        vnum,
      );
    }

    parseEspecLine(text, context, line, vnum, enhanced);
  }
}

/**
 * Parses one enhanced mobile espec line into a public enhanced-data field.
 *
 * @param text - Source espec line with leading MUD spaces removed.
 * @param context - Normalized parser context.
 * @param line - Source line metadata.
 * @param vnum - Mobile VNUM used for error and warning context.
 * @param enhanced - Enhanced data object to mutate.
 * @returns Nothing.
 * @throws ParseError in strict mode for unknown, missing, malformed, or out-of-range values.
 */
function parseEspecLine(
  text: string,
  context: MobileParserContext,
  line: SourceLine,
  vnum: Vnum,
  enhanced: MobileEnhancedData,
): void {
  const colonIndex = text.indexOf(':');
  const keyword = (colonIndex === -1 ? text : text.slice(0, colonIndex)).trim();

  if (colonIndex === -1) {
    handleInvalidEspec(
      `Enhanced mobile keyword '${keyword}' is missing a value`,
      context,
      line,
      vnum,
    );
    return;
  }

  const definition = ESPEC_DEFINITIONS[keyword.toLowerCase()];

  if (definition === undefined) {
    handleInvalidEspec(
      `Skipping unrecognized enhanced mobile keyword '${keyword}'`,
      context,
      line,
      vnum,
    );
    return;
  }

  const valueText = text.slice(colonIndex + 1).trim();
  const value = parseInteger(valueText);

  if (value === null) {
    handleInvalidEspec(
      `Expected numeric value for enhanced mobile keyword '${keyword}'`,
      context,
      line,
      vnum,
    );
    return;
  }

  if (!isEspecValueInRange(value, definition)) {
    const message = `Enhanced mobile keyword '${keyword}' value ${value} is outside ${especRangeText(
      definition,
    )}`;

    if (context.strict) {
      fail(message, context, sourceForLine(context, line.startLine), vnum);
    }

    emitWarning(message, context, sourceForLine(context, line.startLine), vnum);
  }

  enhanced[definition.property] = value;
}

/**
 * Handles one invalid enhanced mobile espec line according to strictness.
 *
 * @param message - Human-readable warning or error message.
 * @param context - Normalized parser context.
 * @param line - Source line metadata.
 * @param vnum - Mobile VNUM used for error and warning context.
 * @returns Nothing.
 * @throws ParseError when strict mode is enabled.
 */
function handleInvalidEspec(
  message: string,
  context: MobileParserContext,
  line: SourceLine,
  vnum: Vnum,
): void {
  const source = sourceForLine(context, line.startLine);

  if (context.strict) {
    fail(message, context, source, vnum);
  }

  emitWarning(message, context, source, vnum);
}

/**
 * Checks an enhanced mobile value against known C-source ranges.
 *
 * @param value - Parsed source value.
 * @param definition - Espec field definition.
 * @returns `true` when the value is inside the known range.
 */
function isEspecValueInRange(value: number, definition: EspecDefinition): boolean {
  if (definition.min !== undefined && value < definition.min) {
    return false;
  }
  if (definition.max !== undefined && value > definition.max) {
    return false;
  }

  return true;
}

/**
 * Formats an enhanced mobile value range for warning and error messages.
 *
 * @param definition - Espec field definition.
 * @returns Human-readable range text.
 */
function especRangeText(definition: EspecDefinition): string {
  if (definition.min !== undefined && definition.max !== undefined) {
    return `range ${definition.min}..${definition.max}`;
  }
  /* v8 ignore next -- @preserve the false branch requires a max-only or unbounded spec definition, which mobile specs do not use. */
  if (definition.min !== undefined) {
    return `minimum ${definition.min}`;
  }
  /* v8 ignore next -- @preserve no current mobile enhanced spec uses only a maximum bound. */
  if (definition.max !== undefined) {
    return `maximum ${definition.max}`;
  }

  /* v8 ignore next -- @preserve all current mobile enhanced specs have at least one bound. */
  return 'the accepted range';
}

/**
 * Parses mobile DG trigger attachment lines after a simple or enhanced body.
 *
 * @param reader - Cursor over the mobile input positioned after the body.
 * @param context - Normalized parser context.
 * @param vnum - Mobile VNUM used for warning context.
 * @param startEndLine - End line to use when there are no trigger lines.
 * @returns Parsed trigger VNUMs plus optional next record/file line.
 */
function parseTriggerSection(
  reader: MudReader,
  context: MobileParserContext,
  vnum: Vnum,
  startEndLine: number,
): TriggerSectionParseResult {
  const triggerVnums: Vnum[] = [];
  let endLine = startEndLine;

  for (;;) {
    const line = readContentLine(reader);

    if (line === null) {
      return triggerSectionResult(triggerVnums, endLine);
    }

    const text = skipMudSpaces(line.text);

    if (text.charAt(0) !== 'T') {
      return triggerSectionResult(triggerVnums, endLine, line);
    }

    const triggerVnum = parseTriggerLine(text, context, line, vnum);

    if (triggerVnum !== null) {
      triggerVnums.push(triggerVnum);
    }

    endLine = line.startLine;
  }
}

/**
 * Constructs a trigger parse result while omitting absent optional lookahead lines.
 *
 * @param triggerVnums - Parsed trigger VNUMs.
 * @param endLine - Ending source line.
 * @param nextLine - Already-read next line.
 * @returns Trigger parse result with exact optional-property semantics.
 */
function triggerSectionResult(
  triggerVnums: readonly Vnum[],
  endLine: number,
  nextLine?: SourceLine,
): TriggerSectionParseResult {
  if (nextLine === undefined) {
    return { triggerVnums, endLine };
  }

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
 * @param vnum - Mobile VNUM used for warning context.
 * @returns Parsed trigger VNUM, or `null` when malformed.
 */
function parseTriggerLine(
  text: string,
  context: MobileParserContext,
  line: SourceLine,
  vnum: Vnum,
): Vnum | null {
  const match = /^T\s+([+-]?\d+)/.exec(text);

  if (match === null) {
    emitWarning(
      `Skipping malformed mobile trigger line '${text}'`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
    return null;
  }

  const triggerVnum = parseInteger(match[1]);

  if (triggerVnum === null) {
    emitWarning(
      `Skipping malformed mobile trigger line '${text}'`,
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
 * @param value - Decoded MUD keyword string.
 * @returns Whitespace-separated keyword tokens.
 */
function splitKeywords(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
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
 * @param reader - Cursor over the mobile input.
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
 * @param reader - Cursor over the mobile input.
 * @param context - Normalized parser context.
 * @param message - Error message to use if EOF is reached.
 * @param vnum - Optional mobile VNUM used for error context.
 * @returns The next content line.
 * @throws ParseError if EOF is reached before a content line is found.
 */
function requireContentLine(
  reader: MudReader,
  context: MobileParserContext,
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
 * Builds public source metadata from normalized parser context and line numbers.
 *
 * @param context - Normalized parser context.
 * @param startLine - Starting source line.
 * @param endLine - Optional ending source line.
 * @returns Source span suitable for public records, warnings, and errors.
 */
function sourceForLine(
  context: MobileParserContext,
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
 * @param reader - Cursor over the mobile input.
 * @param context - Normalized parser context.
 * @returns Source span using the reader's current line.
 */
function sourceForReader(reader: MudReader, context: MobileParserContext): SourceSpan {
  return sourceForLine(context, reader.line);
}

/**
 * Creates a structured parse warning for mobile-specific recoverable issues.
 *
 * @param message - Human-readable warning message.
 * @param context - Normalized parser context.
 * @param source - Source span for the warning.
 * @param vnum - Mobile VNUM associated with the warning.
 * @returns Structured parse warning object.
 */
function warningFor(
  message: string,
  context: MobileParserContext,
  source: SourceSpan,
  vnum: Vnum,
): ParseWarning {
  const warning: ParseWarning = {
    message,
    source,
    recordType: RecordType.Mobile,
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
 * Emits a recoverable mobile parser warning through both warning channels.
 *
 * @param message - Human-readable warning message.
 * @param context - Normalized parser context.
 * @param source - Source span for the warning.
 * @param vnum - Mobile VNUM associated with the warning.
 * @returns Nothing.
 */
function emitWarning(
  message: string,
  context: MobileParserContext,
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
 * @param vnum - Optional mobile VNUM associated with the error.
 * @param cause - Optional underlying error that caused the parse failure.
 * @throws ParseError always.
 */
function fail(
  message: string,
  context: MobileParserContext,
  source: SourceSpan,
  vnum?: Vnum,
  cause?: unknown,
): never {
  const errorContext: MudParserErrorContext = {
    source,
    recordType: RecordType.Mobile,
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
