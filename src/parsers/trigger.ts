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
import { type ParseOptions } from '../options.js';
import { MudReader, parseAsciiFlag, skipMudSpaces } from '../reader.js';
import { TriggerRecord } from '../records/index.js';
import { RecordType } from '../types.js';
import {
  fail,
  normalizeParseOptions,
  parseLeadingInteger,
  parseRecordHeader,
  readContentLine,
  readerOptionsFrom,
  readSourceStringWithEndLine,
  requireContentLine,
  resolveBitvector,
  resolveOrdinalName,
  sourceForLine,
  sourceForReader,
  splitTokens,
  valueAt,
  type ParserContext,
  type SourceLine,
} from './internal/index.js';
import type { BitVector, FlagTable, MudInput, Vnum } from '../types.js';

type TriggerParserContext = ParserContext<RecordType.Trigger>;

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
  const context = normalizeParseOptions(options, RecordType.Trigger);
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

    const vnum = parseRecordHeader(text, context, line, 'trigger');

    if (vnum >= RECORD_SENTINEL_VNUM) {
      return records;
    }

    records.push(parseTriggerRecord(reader, context, line, vnum));
  }
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
  const name = readSourceStringWithEndLine(reader, context, `trigger #${vnum} name`, vnum);
  const headerNumbers = readTriggerHeaderNumbers(reader, context, vnum);
  const argList = readSourceStringWithEndLine(reader, context, `trigger #${vnum} arglist`, vnum);
  const commands = readSourceStringWithEndLine(reader, context, `trigger #${vnum} commands`, vnum);
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
  const tokens = splitTokens(line.text);

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
