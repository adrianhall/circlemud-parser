import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ParseError } from '../../src/errors.js';
import { parseQuest, parseQuestFile } from '../../src/parsers/quest.js';
import { QuestRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../fixtures/quest/${name}`, import.meta.url));
}

function bundledQuestPath(name: string): string {
  return fileURLToPath(new URL(`../../data/tbamud/lib/world/qst/${name}`, import.meta.url));
}

function onlyQuest(records: QuestRecord[]): QuestRecord {
  const [record] = records;

  if (record === undefined) {
    throw new Error('Expected exactly one quest record.');
  }

  expect(records).toHaveLength(1);
  return record;
}

function questSource(overrides: Partial<Record<string, string>> = {}): string {
  const fields = {
    header: '#300',
    name: 'Test Quest~',
    description: 'test~',
    acceptMessage: 'Accept.~',
    completeMessage: 'Complete.~',
    quitMessage: 'Quit.~',
    numericHeader: '3 100 0 200 -1 -1 -1',
    objectiveValues: '10 1 1 50 60 -1 2',
    rewardValues: '100 20 -1',
    terminator: 'S',
    fileTerminator: '$~',
    ...overrides,
  };

  return `${[
    fields.header,
    fields.name,
    fields.description,
    fields.acceptMessage,
    fields.completeMessage,
    fields.quitMessage,
    fields.numericHeader,
    fields.objectiveValues,
    fields.rewardValues,
    fields.terminator,
    fields.fileTerminator,
  ].join('\n')}\n`;
}

describe('parseQuestFile', () => {
  it('parses a quest fixture', () => {
    const record = onlyQuest(
      parseQuestFile(fixturePath('single.qst'), { sourceName: 'single.qst' }),
    );

    expect(record).toBeInstanceOf(QuestRecord);
    expect(record.recordType).toBe(RecordType.Quest);
    expect(record.vnum).toBe(200);
    expect(record.name).toBe('A repeatable errand');
    expect(record.description).toBe('errand');
    expect(record.acceptMessage).toBe('Go find it.');
    expect(record.completeMessage).toBe('Done.');
    expect(record.quitMessage).toBe('Quit.');
    expect(record.questType).toBe(0);
    expect(record.questTypeName).toBe('Object');
    expect(record.questmasterVnum).toBeNull();
    expect(record.questFlags).toEqual(['REPEATABLE']);
    expect(record.questFlagsBits).toBe('a');
    expect(record.targetVnum).toBe(300);
    expect(record.prevQuestVnum).toBeNull();
    expect(record.nextQuestVnum).toBeNull();
    expect(record.prerequisiteVnum).toBeNull();
    expect(record.pointsReward).toBe(15);
    expect(record.pointsPenalty).toBe(2);
    expect(record.minLevel).toBe(1);
    expect(record.maxLevel).toBe(50);
    expect(record.timeLimit).toBe(30);
    expect(record.returnMobVnum).toBeNull();
    expect(record.quantity).toBe(4);
    expect(record.goldReward).toBe(100);
    expect(record.experienceReward).toBe(25);
    expect(record.objectRewardVnum).toBeNull();
    expect(record.source).toEqual({ fileName: 'single.qst', startLine: 1, endLine: 10 });
  });

  it('returns no records for an empty quest file', () => {
    expect(parseQuestFile(fixturePath('empty.qst'))).toEqual([]);
  });

  it('parses multiple quest records and ignored pre-S lines', () => {
    const records = parseQuestFile(fixturePath('multi.qst'));

    expect(records.map((record) => record.vnum)).toEqual([201, 202]);
    expect(records[0]?.name).toBeNull();
    expect(records[0]?.questTypeName).toBe('UNKNOWN_99');
    expect(records[0]?.questFlags).toEqual(['REPEATABLE']);
    expect(records[1]?.questTypeName).toBe('Room');
    expect(records[1]?.questmasterVnum).toBe(120);
    expect(records[1]?.targetVnum).toBe(122);
    expect(records[1]?.prevQuestVnum).toBe(201);
    expect(records[1]?.objectRewardVnum).toBe(500);
    expect(records[1]?.source?.endLine).toBe(21);
  });

  it('parses the bundled tbaMUD quest fixture and preserves 65535', () => {
    const record = onlyQuest(parseQuestFile(bundledQuestPath('1.qst')));

    expect(record.vnum).toBe(100);
    expect(record.name).toBe('Kill the Mice!');
    expect(record.description).toBe('mice');
    expect(record.acceptMessage).toBe(
      '   I really need some help killing these mice or the Sarge is going to make my\n' +
        'life a living hell.\n',
    );
    expect(record.completeMessage).toBe('   Well done!  You have completed your quest!\n');
    expect(record.quitMessage).toBe('You have abandoned the quest.\n');
    expect(record.questType).toBe(3);
    expect(record.questTypeName).toBe('Kill mob');
    expect(record.questmasterVnum).toBe(179);
    expect(record.targetVnum).toBe(194);
    expect(record.pointsReward).toBe(0);
    expect(record.minLevel).toBe(1);
    expect(record.maxLevel).toBe(34);
    expect(record.timeLimit).toBe(60);
    expect(record.quantity).toBe(3);
    expect(record.goldReward).toBe(10);
    expect(record.experienceReward).toBe(0);
    expect(record.objectRewardVnum).toBe(65535);
  });
});

describe('parseQuest', () => {
  it('accepts Buffer input with explicit encoding', () => {
    const record = onlyQuest(
      parseQuest(Buffer.from(questSource({ name: 'Caf\xe9 Quest~' }), 'latin1'), {
        encoding: 'latin1',
      }),
    );

    expect(record.name).toBe('Caf\u00e9 Quest');
  });

  it('parses comments, blank lines, numeric flags, and tab decoding', () => {
    const record = onlyQuest(
      parseQuest(
        '* skipped comment\n' +
          '\n' +
          questSource({
            name: 'Tabbed@Quest~',
            numericHeader: '4 -1 1 -1 -1 -1 -1',
            objectiveValues: '1 2 3 4 5 -1 6',
          }),
      ),
    );

    expect(record.name).toBe('Tabbed\tQuest');
    expect(record.questTypeName).toBe('Save mob');
    expect(record.questFlags).toEqual(['REPEATABLE']);
    expect(record.questFlagsBits).toBe('a');
    expect(record.questmasterVnum).toBeNull();
    expect(record.targetVnum).toBeNull();
    expect(record.returnMobVnum).toBeNull();
  });

  it('serializes to stable plain JSON', () => {
    const record = onlyQuest(parseQuestFile(fixturePath('single.qst'), { sourceName: 'json.qst' }));

    expect(record.toJSON()).toEqual({
      recordType: 'quest',
      vnum: 200,
      name: 'A repeatable errand',
      description: 'errand',
      acceptMessage: 'Go find it.',
      completeMessage: 'Done.',
      quitMessage: 'Quit.',
      questType: 0,
      questTypeName: 'Object',
      questmasterVnum: null,
      questFlags: ['REPEATABLE'],
      questFlagsBits: 'a',
      targetVnum: 300,
      prevQuestVnum: null,
      nextQuestVnum: null,
      prerequisiteVnum: null,
      pointsReward: 15,
      pointsPenalty: 2,
      minLevel: 1,
      maxLevel: 50,
      timeLimit: 30,
      returnMobVnum: null,
      quantity: 4,
      goldReward: 100,
      experienceReward: 25,
      objectRewardVnum: null,
      source: { fileName: 'json.qst', startLine: 1, endLine: 10 },
    });
  });

  it('omits source from manually constructed quest JSON when absent', () => {
    const record = new QuestRecord({
      vnum: 301,
      name: null,
      description: null,
      acceptMessage: null,
      completeMessage: null,
      quitMessage: null,
      questType: 6,
      questTypeName: 'Clear room',
      questmasterVnum: null,
      questFlags: [],
      questFlagsBits: '0',
      targetVnum: null,
      prevQuestVnum: null,
      nextQuestVnum: null,
      prerequisiteVnum: null,
      pointsReward: 0,
      pointsPenalty: 0,
      minLevel: 0,
      maxLevel: 0,
      timeLimit: 0,
      returnMobVnum: null,
      quantity: 0,
      goldReward: 0,
      experienceReward: 0,
      objectRewardVnum: null,
    });

    expect(record.toJSON()).not.toHaveProperty('source');
  });

  it('returns before body parsing for the 99999 record sentinel', () => {
    expect(parseQuest('#99999\nnot parsed\n')).toEqual([]);
  });

  it('throws source-aware errors for malformed quest bodies', () => {
    expect(() => parseQuest(questSource({ numericHeader: 'bad -1 0 -1 -1 -1 -1' }))).toThrow(
      ParseError,
    );

    try {
      parseQuest(questSource({ numericHeader: 'bad -1 0 -1 -1 -1 -1' }));
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect(error).toMatchObject({
        recordType: RecordType.Quest,
        vnum: 300,
        source: { startLine: 7 },
      });
      return;
    }

    throw new Error('Expected malformed quest body to throw.');
  });

  it('throws for malformed and unsafe quest headers', () => {
    expect(() => parseQuest('not-a-header\n$~\n')).toThrow('Expected quest record header');
    expect(() => parseQuest('#abc\n$~\n')).toThrow('Expected quest record header');
    expect(() => parseQuest('#9007199254740993\n$~\n')).toThrow('Expected numeric quest vnum');
  });

  it('throws when EOF interrupts required quest strings', () => {
    expect(() => parseQuest('#302\nName without terminator\n')).toThrow(
      'Expected tilde-terminated string while reading quest #302 name',
    );
  });

  it('throws when EOF occurs before the final $ terminator', () => {
    expect(() => parseQuestFile(fixturePath('missing-terminator.qst'))).toThrow(
      'Expected quest record header or $ terminator',
    );
  });

  it('throws when EOF occurs before an S record terminator', () => {
    expect(() => parseQuestFile(fixturePath('missing-s.qst'))).toThrow(
      'Expected quest record terminator',
    );
  });

  it('throws for malformed fixed-count numeric lines', () => {
    expect(() => parseQuest(questSource({ numericHeader: '3 100 0 200 -1 -1' }))).toThrow(
      'Expected quest numeric header line',
    );
    expect(() => parseQuestFile(fixturePath('truncated-numeric.qst'))).toThrow(
      'Expected quest objective values line',
    );
    expect(() => parseQuest(questSource({ rewardValues: '0 bad -1' }))).toThrow(
      'Expected numeric quest integer field',
    );
  });

  it('throws for invalid and unrepresentable quest bitvectors', () => {
    expect(() => parseQuest(questSource({ numericHeader: '3 100 -1 200 -1 -1 -1' }))).toThrow(
      'Expected quest flags bitvector',
    );
    expect(() =>
      parseQuest(questSource({ numericHeader: `3 100 ${String(2 ** 52)} 200 -1 -1 -1` })),
    ).toThrow('Expected quest flags bitvector representable as ASCII flags');
  });

  it('supports paths built from caller code without relying on cwd', () => {
    const fileName = join(fixturePath('..'), 'quest', 'empty.qst');

    expect(parseQuestFile(fileName)).toEqual([]);
  });
});
