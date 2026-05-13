/**
 * Parser for CircleMUD/tbaMUD quest files (`.qst`).
 *
 * Quest files contain discrete `#<vnum>` records with five tilde strings, three numeric lines, and
 * an `S` record terminator. References remain VNUMs and unresolved `-1` source sentinels are
 * exposed as `null`.
 */
import { readFileSync } from 'node:fs';

import { AQ_FLAGS, QUEST_TYPES } from '../flag-tables.js';
import { type ParseOptions } from '../options.js';
import { MudReader, parseAsciiFlag, skipMudSpaces } from '../reader.js';
import { QuestRecord } from '../records/index.js';
import { RecordType } from '../types.js';
import {
  fail,
  normalizeParseOptions,
  nullableVnum,
  parseLeadingInteger,
  parseRecordHeader,
  readContentLine,
  readerOptionsFrom,
  readSourceString,
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
import type { BitVector, MudInput, Vnum } from '../types.js';

type QuestParserContext = ParserContext<RecordType.Quest>;

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
  const context = normalizeParseOptions(options, RecordType.Quest);
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

    const vnum = parseRecordHeader(text, context, line, 'quest');

    if (vnum >= RECORD_SENTINEL_VNUM) {
      return records;
    }

    records.push(parseQuestRecord(reader, context, line, vnum));
  }
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
  const name = readSourceString(reader, context, `quest #${vnum} name`, vnum);
  const description = readSourceString(reader, context, `quest #${vnum} description`, vnum);
  const acceptMessage = readSourceString(reader, context, `quest #${vnum} accept message`, vnum);
  const completeMessage = readSourceString(
    reader,
    context,
    `quest #${vnum} complete message`,
    vnum,
  );
  const quitMessage = readSourceString(reader, context, `quest #${vnum} quit message`, vnum);
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
  const tokens = splitTokens(line.text);

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
  const tokens = splitTokens(line.text);

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
