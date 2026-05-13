import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ParseError } from '../../src/errors.js';
import { parseTrigger, parseTriggerFile } from '../../src/parsers/trigger.js';
import { TriggerRecord } from '../../src/records.js';
import { RecordType } from '../../src/types.js';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../fixtures/trigger/${name}`, import.meta.url));
}

function bundledTriggerPath(name: string): string {
  return fileURLToPath(new URL(`../../data/tbamud/lib/world/trg/${name}`, import.meta.url));
}

function onlyTrigger(records: TriggerRecord[]): TriggerRecord {
  const [record] = records;

  if (record === undefined) {
    throw new Error('Expected exactly one trigger record.');
  }

  expect(records).toHaveLength(1);
  return record;
}

function triggerSource(overrides: Partial<Record<string, string>> = {}): string {
  const fields = {
    header: '#300',
    name: 'Test Trigger~',
    numericHeader: '0 g 100',
    argList: '~',
    commands: 'say Test.\nwait 1 sec\n~',
    fileTerminator: '$~',
    ...overrides,
  };

  return `${[
    fields.header,
    fields.name,
    fields.numericHeader,
    fields.argList,
    fields.commands,
    fields.fileTerminator,
  ].join('\n')}\n`;
}

describe('parseTriggerFile', () => {
  it('parses a trigger fixture', () => {
    const record = onlyTrigger(
      parseTriggerFile(fixturePath('single.trg'), { sourceName: 'single.trg' }),
    );

    expect(record).toBeInstanceOf(TriggerRecord);
    expect(record.recordType).toBe(RecordType.Trigger);
    expect(record.vnum).toBe(200);
    expect(record.name).toBe('Welcome Trigger');
    expect(record.attachType).toBe(0);
    expect(record.attachTypeName).toBe('Mobile');
    expect(record.triggerType).toEqual(['Greet']);
    expect(record.triggerTypeBits).toBe('g');
    expect(record.numericArg).toBe(100);
    expect(record.argList).toBeNull();
    expect(record.commands).toEqual(['say Welcome, %actor.name%.', 'wait 1 sec']);
    expect(record.source).toEqual({ fileName: 'single.trg', startLine: 1, endLine: 7 });
  });

  it('returns no records for an empty trigger file', () => {
    expect(parseTriggerFile(fixturePath('empty.trg'))).toEqual([]);
  });

  it('parses multiple trigger records and attach-specific flag tables', () => {
    const records = parseTriggerFile(fixturePath('multi.trg'));

    expect(records.map((record) => record.vnum)).toEqual([201, 202, 203]);
    expect(records[0]?.attachTypeName).toBe('Object');
    expect(records[0]?.triggerType).toEqual(['Command']);
    expect(records[0]?.argList).toBe('open box');
    expect(records[1]?.attachTypeName).toBe('World');
    expect(records[1]?.triggerType).toEqual(['Zone Reset']);
    expect(records[1]?.triggerTypeBits).toBe('f');
    expect(records[1]?.commands).toEqual(['* reset comment', '%echo% reset']);
    expect(records[2]?.attachTypeName).toBe('UNKNOWN_5');
    expect(records[2]?.triggerType).toEqual(['UNKNOWN_0']);
    expect(records[2]?.numericArg).toBe(0);
    expect(records[2]?.commands).toEqual([]);
  });

  it('parses the bundled tbaMUD trigger fixture', () => {
    const records = parseTriggerFile(bundledTriggerPath('0.trg'));

    expect(records.length).toBeGreaterThan(1);
    expect(records[0]).toMatchObject({
      vnum: 0,
      name: 'Non-attachable trigger',
      attachType: 0,
      attachTypeName: 'Mobile',
      triggerType: ['Greet'],
      triggerTypeBits: 'g',
      numericArg: 100,
      argList: null,
      commands: ["* You can't attach trigger 0!"],
    });
    expect(records[1]).toMatchObject({
      vnum: 1,
      name: 'Mob Tutorial Example Quest Offer - M14',
      triggerType: ['Greet'],
      numericArg: 100,
      argList: null,
    });
    expect(records[1]?.commands).toContain('if %actor.is_pc% && %direction% == south');
  });
});

describe('parseTrigger', () => {
  it('accepts Buffer input with explicit encoding', () => {
    const record = onlyTrigger(
      parseTrigger(Buffer.from(triggerSource({ name: 'Caf\xe9 Trigger~' }), 'latin1'), {
        encoding: 'latin1',
      }),
    );

    expect(record.name).toBe('Caf\u00e9 Trigger');
  });

  it('parses comments, blank lines, numeric flags, and tab decoding', () => {
    const record = onlyTrigger(
      parseTrigger(
        '* skipped comment\n' +
          '\n' +
          triggerSource({
            name: 'Tabbed@Trigger~',
            numericHeader: '2 4',
            argList: 'look window~',
            commands: '%echo% Hello@there\n\nreturn 0\n~',
          }),
      ),
    );

    expect(record.name).toBe('Tabbed\tTrigger');
    expect(record.attachTypeName).toBe('World');
    expect(record.triggerType).toEqual(['Command']);
    expect(record.triggerTypeBits).toBe('c');
    expect(record.numericArg).toBe(0);
    expect(record.argList).toBe('look window');
    expect(record.commands).toEqual(['%echo% Hello\tthere', 'return 0']);
  });

  it('serializes to stable plain JSON', () => {
    const record = onlyTrigger(
      parseTriggerFile(fixturePath('single.trg'), { sourceName: 'json.trg' }),
    );

    expect(record.toJSON()).toEqual({
      recordType: 'trigger',
      vnum: 200,
      name: 'Welcome Trigger',
      attachType: 0,
      attachTypeName: 'Mobile',
      triggerType: ['Greet'],
      triggerTypeBits: 'g',
      numericArg: 100,
      argList: null,
      commands: ['say Welcome, %actor.name%.', 'wait 1 sec'],
      source: { fileName: 'json.trg', startLine: 1, endLine: 7 },
    });
  });

  it('omits source from manually constructed trigger JSON when absent', () => {
    const record = new TriggerRecord({
      vnum: 301,
      name: null,
      attachType: 0,
      attachTypeName: 'Mobile',
      triggerType: [],
      triggerTypeBits: '0',
      numericArg: 0,
      argList: null,
      commands: [],
    });

    expect(record.toJSON()).not.toHaveProperty('source');
  });

  it('returns before body parsing for the 99999 record sentinel', () => {
    expect(parseTrigger('#99999\nnot parsed\n')).toEqual([]);
  });

  it('throws source-aware errors for malformed trigger bodies', () => {
    expect(() => parseTrigger(triggerSource({ numericHeader: 'bad g 100' }))).toThrow(ParseError);

    try {
      parseTrigger(triggerSource({ numericHeader: 'bad g 100' }));
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect(error).toMatchObject({
        recordType: RecordType.Trigger,
        vnum: 300,
        source: { startLine: 3 },
      });
      return;
    }

    throw new Error('Expected malformed trigger body to throw.');
  });

  it('throws for malformed and unsafe trigger headers', () => {
    expect(() => parseTrigger('not-a-header\n$~\n')).toThrow('Expected trigger record header');
    expect(() => parseTrigger('#abc\n$~\n')).toThrow('Expected trigger record header');
    expect(() => parseTrigger('#9007199254740993\n$~\n')).toThrow('Expected numeric trigger vnum');
  });

  it('throws when EOF interrupts required trigger strings', () => {
    expect(() => parseTrigger('#302\nName without terminator\n')).toThrow(
      'Expected tilde-terminated string while reading trigger #302 name',
    );
    expect(() => parseTrigger('#300\nTest~\n0 g 100\nunterminated arglist\n')).toThrow(
      'Expected tilde-terminated string while reading trigger #300 arglist',
    );
    expect(() => parseTrigger('#300\nTest~\n0 g 100\n~\nunterminated commands\n')).toThrow(
      'Expected tilde-terminated string while reading trigger #300 commands',
    );
  });

  it('throws when EOF occurs before the final $ terminator', () => {
    expect(() => parseTriggerFile(fixturePath('missing-terminator.trg'))).toThrow(
      'Expected trigger record header or $ terminator',
    );
  });

  it('throws for malformed fixed-count numeric lines', () => {
    expect(() => parseTrigger(triggerSource({ numericHeader: '0' }))).toThrow(
      'Expected trigger numeric header line',
    );
    expect(() => parseTriggerFile(fixturePath('truncated-numeric.trg'))).toThrow(
      'Expected trigger numeric header line',
    );
    expect(() => parseTrigger(triggerSource({ numericHeader: '0 g bad' }))).toThrow(
      'Expected numeric trigger numeric arg',
    );
  });

  it('throws for invalid and unrepresentable trigger bitvectors', () => {
    expect(() => parseTrigger(triggerSource({ numericHeader: '0 -1 100' }))).toThrow(
      'Expected trigger type bitvector',
    );
    expect(() =>
      parseTrigger(triggerSource({ numericHeader: `0 ${String(2 ** 52)} 100` })),
    ).toThrow('Expected trigger type bitvector representable as ASCII flags');
  });

  it('supports paths built from caller code without relying on cwd', () => {
    const fileName = join(fixturePath('..'), 'trigger', 'empty.trg');

    expect(parseTriggerFile(fileName)).toEqual([]);
  });
});
