import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '../../src/errors.js';
import type { Logger } from '../../src/options.js';
import { parseZone, parseZoneFile } from '../../src/parsers/zone.js';
import { ZoneRecord } from '../../src/records.js';
import { RecordType } from '../../src/types.js';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../fixtures/zone/${name}`, import.meta.url));
}

function onlyZone(records: ZoneRecord[]): ZoneRecord {
  const [record] = records;

  if (record === undefined) {
    throw new Error('Expected exactly one zone record.');
  }

  expect(records).toHaveLength(1);
  return record;
}

function loggerMock(): ReturnType<typeof vi.fn<() => void>> {
  return vi.fn((): void => {});
}

function testLogger(): { logger: Logger; warn: ReturnType<typeof loggerMock> } {
  const debug = loggerMock();
  const info = loggerMock();
  const warn = loggerMock();
  const error = loggerMock();

  return {
    logger: {
      debug,
      info,
      warn,
      error,
    },
    warn,
  };
}

describe('parseZoneFile', () => {
  it('parses a new-format tbaMUD zone fixture', () => {
    const record = onlyZone(
      parseZoneFile(fixturePath('new-format.zon'), { sourceName: 'new-format.zon' }),
    );

    expect(record).toBeInstanceOf(ZoneRecord);
    expect(record.vnum).toBe(1);
    expect(record.builders).toBe('Rumble');
    expect(record.name).toBe('Test\tZone');
    expect(record.bottom).toBe(100);
    expect(record.top).toBe(199);
    expect(record.lifespan).toBe(10);
    expect(record.resetMode).toBe(2);
    expect(record.zoneFlags).toEqual(['GRID']);
    expect(record.zoneFlagsBits).toBe('d 0 0 0');
    expect(record.minLevel).toBe(1);
    expect(record.maxLevel).toBe(34);
    expect(record.source).toEqual({ fileName: 'new-format.zon', startLine: 1, endLine: 16 });
    expect(record.commands).toHaveLength(9);
    expect(record.commands[0]).toEqual({
      command: 'M',
      ifFlag: 0,
      args: [34, 1, 108],
      stringArgs: [],
      comment: 'Chuck Norris',
      source: { fileName: 'new-format.zon', startLine: 7 },
    });
    expect(record.commands.find((command) => command.command === 'R')).toMatchObject({
      args: [100, 251],
      comment: 'a marble fountain',
    });
    expect(record.commands.find((command) => command.command === 'T')).toMatchObject({
      ifFlag: 1,
      args: [2, 34509, 34537],
      comment: 'Secret trigger',
    });
    expect(record.commands.find((command) => command.command === 'V')).toMatchObject({
      ifFlag: 0,
      args: [2, 7, 34537],
      stringArgs: ['questState', 'value with spaces'],
    });
  });

  it('parses an old-format zone fixture with default flags and levels', () => {
    const record = onlyZone(parseZoneFile(fixturePath('old-format.zon')));

    expect(record.vnum).toBe(12);
    expect(record.builders).toBe('CircleMUD');
    expect(record.zoneFlags).toEqual([]);
    expect(record.zoneFlagsBits).toBe('0 0 0 0');
    expect(record.minLevel).toBeNull();
    expect(record.maxLevel).toBeNull();
    expect(record.commands).toHaveLength(2);
    expect(record.commands[0]).toMatchObject({
      command: 'R',
      ifFlag: 0,
      args: [1206, 1228],
      comment: 'an advertising bulletin board',
    });
  });

  it('sets fileName source context from fileName by default', () => {
    const fileName = fixturePath('old-format.zon');
    const record = onlyZone(parseZoneFile(fileName));

    expect(record.source?.fileName).toBe(fileName);
  });

  it('throws when EOF is reached before S or $ terminator', () => {
    expect(() => parseZoneFile(fixturePath('missing-terminator.zon'))).toThrow(ParseError);
    expect(() => parseZoneFile(fixturePath('missing-terminator.zon'))).toThrow(
      'Expected zone command terminator S or $ before EOF',
    );
  });

  it('parses bundled tbaMUD zone files', () => {
    const zoneDirectory = fileURLToPath(
      new URL('../../data/tbamud/lib/world/zon/', import.meta.url),
    );
    const zoneFiles = readdirSync(zoneDirectory).filter((name) => name.endsWith('.zon'));

    expect(zoneFiles.length).toBeGreaterThan(0);

    for (const zoneFile of zoneFiles) {
      const record = onlyZone(parseZoneFile(join(zoneDirectory, zoneFile)));
      expect(record.vnum).toBeGreaterThanOrEqual(0);
      expect(record.name.length).toBeGreaterThan(0);
    }
  });
});

describe('parseZone', () => {
  it('accepts Buffer input with explicit encoding', () => {
    const record = onlyZone(
      parseZone(Buffer.from('#13\nBuilder~\nEncoded~\n1300 1399 5 2\nS\n', 'latin1'), {
        encoding: 'latin1',
      }),
    );

    expect(record.vnum).toBe(13);
    expect(record.name).toBe('Encoded');
  });

  it('maps an explicitly empty builders line to null', () => {
    const record = onlyZone(
      parseZone('#5\n~\nEmpty Builders~\n500 599 5 2\nS\n', { sourceName: 'inline.zon' }),
    );

    expect(record.builders).toBeNull();
    expect(record.name).toBe('Empty Builders');
    expect(record.source).toEqual({ fileName: 'inline.zon', startLine: 1, endLine: 5 });
  });

  it('accepts $ as the zone terminator', () => {
    const record = onlyZone(parseZone('#6\nBuilder~\nDollar End~\n600 699 5 2\n$\n'));

    expect(record.vnum).toBe(6);
    expect(record.commands).toEqual([]);
  });

  it('warns and skips unknown zone commands', () => {
    const { logger, warn } = testLogger();
    const parseWarnings: unknown[] = [];
    const record = onlyZone(
      parseZone('#7\nBuilder~\nUnknown~\n700 799 5 2\nX 0 1 2\nM 0 1 1 700\nS\n', {
        logger,
        onWarning: (warning) => {
          parseWarnings.push(warning);
        },
        sourceName: 'unknown.zon',
      }),
    );

    expect(warn).toHaveBeenCalledWith("Skipping unknown zone command 'X'");
    expect(parseWarnings).toEqual([
      {
        message: "Skipping unknown zone command 'X'",
        source: { fileName: 'unknown.zon', startLine: 5 },
        recordType: RecordType.Zone,
        vnum: 7,
      },
    ]);
    expect(record.commands).toHaveLength(1);
    expect(record.commands[0]).toMatchObject({ command: 'M', args: [1, 1, 700] });
  });

  it('applies the missing-builders fallback only when strict is false', () => {
    expect(() => parseZoneFile(fixturePath('missing-builders.zon'))).toThrow(ParseError);

    const { logger, warn } = testLogger();
    const warnings: unknown[] = [];
    const record = onlyZone(
      parseZoneFile(fixturePath('missing-builders.zon'), {
        strict: false,
        sourceName: 'missing-builders.zon',
        logger,
        onWarning: (warning) => {
          warnings.push(warning);
        },
      }),
    );

    expect(warn).toHaveBeenCalledWith('Applied zone header fallback for missing builders line');
    expect(warnings).toEqual([
      {
        message: 'Applied zone header fallback for missing builders line',
        source: { fileName: 'missing-builders.zon', startLine: 3 },
        recordType: RecordType.Zone,
        vnum: 3,
      },
    ]);
    expect(record.builders).toBe('None.');
    expect(record.name).toBe('Fallback Zone');
    expect(record.bottom).toBe(300);
    expect(record.top).toBe(399);
    expect(record.commands).toHaveLength(1);
    expect(record.commands[0]).toMatchObject({
      command: 'M',
      args: [1, 1, 300],
      comment: 'a fallback mob',
    });
  });

  it('throws ParseError for malformed zone headers and numeric lines', () => {
    expect(() => parseZone('Builder~\nName~\n100 199 5 2\nS\n')).toThrow(ParseError);
    expect(() => parseZone('#9007199254740993\nBuilder~\nName~\n100 199 5 2\nS\n')).toThrow(
      ParseError,
    );
    expect(() => parseZone('#8\nBuilder~\nName~\n100 199 5\nS\n')).toThrow(ParseError);
    expect(() => parseZone('#20\nBuilder~\nName~\n100 199 5\nS\n', { strict: false })).toThrow(
      ParseError,
    );
    expect(() => parseZone('#9\nBuilder~\nName~\n199 100 5 2\nS\n')).toThrow(ParseError);
    expect(() => parseZone('#14\nBuilder~\nName~\n100 nope 5 2 d 0 0 0 1 34\nS\n')).toThrow(
      ParseError,
    );
    expect(() => parseZone('#15\nBuilder~\nName~\n100 199 5 2 -3 0 0 0 1 34\nS\n')).toThrow(
      ParseError,
    );
    expect(() => parseZone('#16\nBuilder~\nName~\n100 nope 5 2\nS\n')).toThrow(ParseError);
    expect(() => parseZone('#17\nBuilder~\n')).toThrow(ParseError);
  });

  it('throws ParseError for malformed command lines', () => {
    expect(() => parseZone('#10\nBuilder~\nName~\n1000 1099 5 2\nM 0 1\nS\n')).toThrow(ParseError);
    expect(() => parseZone('#18\nBuilder~\nName~\n1800 1899 5 2\nM 0 nope 1 1800\nS\n')).toThrow(
      ParseError,
    );
    expect(() => parseZone('#11\nBuilder~\nName~\n1100 1199 5 2\nV 0 1 2 3 onlyOne\nS\n')).toThrow(
      ParseError,
    );
    expect(() =>
      parseZone('#19\nBuilder~\nName~\n1900 1999 5 2\nV 0 1 2 9007199254740993 var value\nS\n'),
    ).toThrow(ParseError);
  });
});
