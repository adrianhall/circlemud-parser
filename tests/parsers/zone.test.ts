import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '../../src/errors.js';
import type { Logger } from '../../src/options.js';
import { parseZone, parseZoneFile } from '../../src/parsers/zone.js';
import { ZoneRecord } from '../../src/records/index.js';
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

function testLogger(): {
  logger: Logger;
  debug: ReturnType<typeof loggerMock>;
  warn: ReturnType<typeof loggerMock>;
} {
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
    debug,
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

  it('parses bundled CircleMUD 3.1 zone files', () => {
    const zoneDirectory = fileURLToPath(
      new URL('../../data/circle-3.1/lib/world/zon/', import.meta.url),
    );
    const zoneFiles = readdirSync(zoneDirectory).filter((name) => name.endsWith('.zon'));

    expect(zoneFiles.length).toBeGreaterThan(0);

    for (const zoneFile of zoneFiles) {
      const record = onlyZone(parseZoneFile(join(zoneDirectory, zoneFile)));
      expect(record.vnum).toBeGreaterThanOrEqual(0);
      expect(record.name.length).toBeGreaterThan(0);
    }
  });

  it('parses CircleMUD zone #30 with correct headerless fallback and G-command args', () => {
    const zoneDirectory = fileURLToPath(
      new URL('../../data/circle-3.1/lib/world/zon/', import.meta.url),
    );
    const record = onlyZone(parseZoneFile(join(zoneDirectory, '30.zon')));

    // CircleMUD zone: no builders line → builders is null (no builders field in the format)
    expect(record.vnum).toBe(30);
    expect(record.builders).toBeNull();
    expect(record.name).toBe('Northern Midgaard Main City');
    expect(record.bottom).toBe(3000);
    expect(record.top).toBe(3099);
    expect(record.lifespan).toBe(15);
    expect(record.resetMode).toBe(2);

    // G command uses 3 args (CircleMUD): [obj_vnum, max_in_world]
    const gCmd = record.commands.find((c) => c.command === 'G');
    expect(gCmd?.ifFlag).toBe(1);
    expect(gCmd?.args).toEqual([3050, 500]);

    // M command uses 4 args (consistent across both formats): [mob_vnum, max, room_vnum]
    const mCmd = record.commands.find((c) => c.command === 'M');
    expect(mCmd?.ifFlag).toBe(0);
    expect(mCmd?.args).toEqual([3000, 1, 3033]);
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

  it('applies the missing-builders fallback (CircleMUD format) automatically', () => {
    // Now accepted in default strict mode — format is auto-detected, not gated by strict.
    const { logger, debug, warn } = testLogger();
    const warnings: unknown[] = [];
    const record = onlyZone(
      parseZoneFile(fixturePath('missing-builders.zon'), {
        sourceName: 'missing-builders.zon',
        logger,
        onWarning: (warning) => {
          warnings.push(warning);
        },
      }),
    );

    // The missing builders line is the normal CircleMUD layout, so it is logged at debug level
    // exactly once and is not surfaced as a structured warning.
    expect(debug).toHaveBeenCalledWith(
      'Applied zone header fallback for missing builders line in zone #3',
    );
    expect(warn).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
    expect(record.builders).toBeNull();
    expect(record.name).toBe('Fallback Zone');
    expect(record.bottom).toBe(300);
    expect(record.top).toBe(399);
    expect(record.commands).toHaveLength(1);
    expect(record.commands[0]).toMatchObject({
      command: 'M',
      args: [1, 1, 300],
      comment: 'a fallback mob',
    });

    // Also accepted when strict is explicitly false.
    const strictFalseRecord = onlyZone(
      parseZoneFile(fixturePath('missing-builders.zon'), { strict: false }),
    );
    expect(strictFalseRecord.builders).toBeNull();
  });

  it('throws ParseError for malformed zone headers and numeric lines', () => {
    expect(() => parseZone('Builder~\nName~\n100 199 5 2\nS\n')).toThrow(ParseError);
    expect(() => parseZone('#9007199254740993\nBuilder~\nName~\n100 199 5 2\nS\n')).toThrow(
      ParseError,
    );
    expect(() => parseZone('#8\nBuilder~\nName~\n100 199 5\nS\n')).toThrow(ParseError);
    expect(() => parseZone('#20\nBuilder~\nName~\n100 199 5\nS\n')).toThrow(ParseError);
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

  it('accepts CircleMUD three-argument G command', () => {
    // CircleMUD: G <if_flag> <obj_vnum> <max_in_world>  (3 numbers total)
    const record = onlyZone(
      parseZone('#30\nBuilder~\nMidgaard~\n3000 3099 15 2\nG 1 3050 500\nS\n'),
    );

    expect(record.commands).toHaveLength(1);
    const cmd = record.commands[0];
    expect(cmd?.command).toBe('G');
    expect(cmd?.ifFlag).toBe(1);
    expect(cmd?.args).toEqual([3050, 500]);
  });

  it('accepts tbaMUD four-argument G command (extra arg3 preserved)', () => {
    // tbaMUD: G <if_flag> <obj_vnum> <max_in_world> <arg3>  (4 numbers, arg3 unused at reset)
    const record = onlyZone(
      parseZone('#31\nBuilder~\nMidgaard~\n3100 3199 15 2\nG 1 3006 99 -1\nS\n'),
    );

    expect(record.commands).toHaveLength(1);
    const cmd = record.commands[0];
    expect(cmd?.command).toBe('G');
    expect(cmd?.ifFlag).toBe(1);
    expect(cmd?.args).toEqual([3006, 99, -1]);
  });

  it('rejects a G command with fewer than three numeric arguments', () => {
    // Too few tokens.
    expect(() => parseZone('#32\nBuilder~\nName~\n3200 3299 5 2\nG 1 3050\nS\n')).toThrow(
      ParseError,
    );
    expect(() => parseZone('#33\nBuilder~\nName~\n3300 3399 5 2\nG 0\nS\n')).toThrow(ParseError);
    // Tokens present but non-numeric mid-way (loop exits before accumulating 3 values).
    expect(() => parseZone('#34\nBuilder~\nName~\n3400 3499 5 2\nG 0 nope 500\nS\n')).toThrow(
      ParseError,
    );
  });

  it('accepts CircleMUD headerless zones (no builders line) with trailing non-tabbed comments', () => {
    // CircleMUD zone command comments use spaces (not tabs), e.g. "G 1 3050 500   Scroll Of Identify"
    // The trailing text is non-numeric so the parser stops at three args.
    const record = onlyZone(
      parseZone('#35\nFallback Zone~\n3500 3599 15 2\nG 1 3050 500   Scroll\nM 0 3000 1 3000\nS\n'),
    );

    expect(record.builders).toBeNull();
    expect(record.name).toBe('Fallback Zone');
    expect(record.commands).toHaveLength(2);
    const gCmd = record.commands[0];
    expect(gCmd?.command).toBe('G');
    expect(gCmd?.args).toEqual([3050, 500]);
    const mCmd = record.commands[1];
    expect(mCmd?.command).toBe('M');
    expect(mCmd?.args).toEqual([3000, 1, 3000]);
  });
});
