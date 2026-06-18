import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '../../src/errors.js';
import type { Logger } from '../../src/options.js';
import { parseWorld, parseWorldFile } from '../../src/parsers/world.js';
import { WorldRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../fixtures/world/${name}`, import.meta.url));
}

function firstWorld(records: WorldRecord[]): WorldRecord {
  const [record] = records;

  if (record === undefined) {
    throw new Error('Expected at least one world record.');
  }

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

describe('parseWorldFile', () => {
  it('parses a world fixture with room flags and source context', () => {
    const record = firstWorld(
      parseWorldFile(fixturePath('simple.wld'), { sourceName: 'simple.wld' }),
    );

    expect(record).toBeInstanceOf(WorldRecord);
    expect(record.recordType).toBe(RecordType.World);
    expect(record.vnum).toBe(3000);
    expect(record.name).toBe('The Reading Room');
    expect(record.description).toBe('   You are in a small, simple room.\n');
    expect(record.roomFlags).toEqual(['NO_MOB', 'INDOORS', 'PEACEFUL', 'NO_MAGIC']);
    expect(record.roomFlagsBits).toBe('cdeh 0 0 0');
    expect(record.sectorType).toBe(0);
    expect(record.directions).toEqual([]);
    expect(record.extraDescriptions).toEqual([]);
    expect(record.triggerVnums).toEqual([]);
    expect(record.source).toEqual({ fileName: 'simple.wld', startLine: 1, endLine: 6 });
  });

  it('sets fileName source context from fileName by default', () => {
    const fileName = fixturePath('simple.wld');
    const record = firstWorld(parseWorldFile(fileName));

    expect(record.source?.fileName).toBe(fileName);
  });

  it('parses trigger references after S', () => {
    const record = firstWorld(parseWorldFile(fixturePath('triggers.wld')));

    expect(record.triggerVnums).toEqual([1200, 1201]);
    expect(record.source?.endLine).toBe(8);
  });

  it('parses grouped extra descriptions', () => {
    const record = firstWorld(parseWorldFile(fixturePath('extra-descriptions.wld')));

    expect(record.extraDescriptions).toEqual([
      {
        keywords: ['credits', 'info'],
        description: '   Guilds: 20-23\n',
      },
      {
        keywords: [],
        description: null,
      },
    ]);
  });

  it('throws when EOF is reached before the file terminator', () => {
    expect(() => parseWorldFile(fixturePath('missing-terminator.wld'))).toThrow(ParseError);
    expect(() => parseWorldFile(fixturePath('missing-terminator.wld'))).toThrow(
      'Expected world record header or $ before EOF',
    );
  });

  it('parses bundled CircleMUD 3.1 world files', () => {
    const worldDirectory = fileURLToPath(
      new URL('../../data/circle-3.1/lib/world/wld/', import.meta.url),
    );
    const worldFiles = readdirSync(worldDirectory).filter((name) => name.endsWith('.wld'));

    expect(worldFiles.length).toBeGreaterThan(0);

    let parsedRecordCount = 0;

    for (const worldFile of worldFiles) {
      const records = parseWorldFile(join(worldDirectory, worldFile));
      parsedRecordCount += records.length;

      for (const record of records) {
        expect(record.vnum).toBeGreaterThanOrEqual(0);
        expect(record.name.length).toBeGreaterThan(0);
      }
    }

    expect(parsedRecordCount).toBeGreaterThan(0);
  });

  it('parses CircleMUD room #3000 with correct 3-field flag resolution', () => {
    const worldDirectory = fileURLToPath(
      new URL('../../data/circle-3.1/lib/world/wld/', import.meta.url),
    );
    const [record] = parseWorldFile(join(worldDirectory, '30.wld'));

    expect(record?.vnum).toBe(3000);
    expect(record?.name).toBe('The Reading Room');
    // Circle 3-field line: "30 cdeh 0" — flags cdeh = bits 2,3,4,7
    expect(record?.roomFlags).toEqual(['NO_MOB', 'INDOORS', 'PEACEFUL', 'NO_MAGIC']);
    expect(record?.roomFlagsBits).toBe('cdeh 0 0 0');
    expect(record?.sectorType).toBe(0);
    expect(record?.directions).toHaveLength(1);
    expect(record?.directions[0]?.direction).toBe(1);
  });

  it('parses bundled tbaMUD world files', () => {
    const worldDirectory = fileURLToPath(
      new URL('../../data/tbamud/lib/world/wld/', import.meta.url),
    );
    const worldFiles = readdirSync(worldDirectory).filter((name) => name.endsWith('.wld'));

    expect(worldFiles.length).toBeGreaterThan(0);

    for (const worldFile of worldFiles) {
      const records = parseWorldFile(join(worldDirectory, worldFile));
      expect(records.length).toBeGreaterThan(0);

      for (const record of records) {
        expect(record.vnum).toBeGreaterThanOrEqual(0);
        expect(record.name.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('parseWorld', () => {
  it('accepts Buffer input with explicit encoding', () => {
    const record = firstWorld(
      parseWorld(Buffer.from('#13\nEncodedé~\nDescription~\n13 0 0 0 0 0\nS\n$\n', 'latin1'), {
        encoding: 'latin1',
      }),
    );

    expect(record.vnum).toBe(13);
    expect(record.name).toBe('Encodedé');
  });

  it('parses multiple rooms and old-format numeric lines', () => {
    const records = parseWorld(
      '* comment\n#1\nOld Room~\nOld desc~\n1 8 2\nS\n#2\nNew Room~\n~\n2 0 0 0 0 0\nS\n$~\n',
    );

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      vnum: 1,
      name: 'Old Room',
      description: 'Old desc',
      roomFlags: ['INDOORS'],
      roomFlagsBits: 'd 0 0 0',
      sectorType: 2,
    });
    expect(records[1]).toMatchObject({
      vnum: 2,
      name: 'New Room',
      description: null,
      roomFlags: [],
      roomFlagsBits: '0 0 0 0',
      sectorType: 0,
    });
  });

  it('parses all supported door types into exit flags', () => {
    const record = firstWorld(
      parseWorld(`#4
Door Room~
Doors.
~
4 0 0 0 0 0
D0
~
~
0 3000 3001
D1
~
door~
1 3001 3002
D2
Exit text.~
portal gate~
2 3002 3003
D3
~
~
3 3003 3004
D4
~
~
4 3004 3005
S
$
`),
    );

    expect(record.directions).toEqual([
      {
        direction: 0,
        description: null,
        keywords: [],
        exitFlags: [],
        exitFlagsBits: '0',
        keyVnum: 3000,
        toRoomVnum: 3001,
      },
      {
        direction: 1,
        description: null,
        keywords: ['door'],
        exitFlags: ['DOOR'],
        exitFlagsBits: 'a',
        keyVnum: 3001,
        toRoomVnum: 3002,
      },
      {
        direction: 2,
        description: 'Exit text.',
        keywords: ['portal', 'gate'],
        exitFlags: ['DOOR', 'PICKPROOF'],
        exitFlagsBits: 'ad',
        keyVnum: 3002,
        toRoomVnum: 3003,
      },
      {
        direction: 3,
        description: null,
        keywords: [],
        exitFlags: ['DOOR', 'UNKNOWN_4'],
        exitFlagsBits: 'ae',
        keyVnum: 3003,
        toRoomVnum: 3004,
      },
      {
        direction: 4,
        description: null,
        keywords: [],
        exitFlags: ['DOOR', 'PICKPROOF', 'UNKNOWN_4'],
        exitFlagsBits: 'ade',
        keyVnum: 3004,
        toRoomVnum: 3005,
      },
    ]);
  });

  it('coerces key and target room sentinels to null, logging at debug level only', () => {
    const { logger, debug, warn } = testLogger();
    const warnings: unknown[] = [];
    const record = firstWorld(
      parseWorld(
        `#5
Sentinel Room~
Sentinels.
~
5 0 0 0 0 0
D0
~
~
1 -1 -1
D1
~
~
1 65535 0
S
$
`,
        {
          logger,
          onWarning: (warning) => {
            warnings.push(warning);
          },
          sourceName: 'sentinel.wld',
        },
      ),
    );

    // The C loader maps these sentinels silently, so they are debug-level, not warnings.
    expect(debug).toHaveBeenCalledWith('Coerced key sentinel -1 to null for room #5 D0');
    expect(debug).toHaveBeenCalledWith('Coerced target room sentinel -1 to null for room #5 D0');
    expect(debug).toHaveBeenCalledWith('Coerced key sentinel 65535 to null for room #5 D1');
    expect(debug).toHaveBeenCalledWith('Coerced target room sentinel 0 to null for room #5 D1');
    expect(warn).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
    expect(record.directions.map((direction) => [direction.keyVnum, direction.toRoomVnum])).toEqual(
      [
        [null, null],
        [null, null],
      ],
    );
  });

  it('warns and normalizes out-of-range sector types', () => {
    const { logger, warn } = testLogger();
    const warnings: unknown[] = [];
    const record = firstWorld(
      parseWorld('#6\nSector Room~\nSector.\n~\n6 0 0 0 0 11\nS\n$\n', {
        logger,
        onWarning: (warning) => {
          warnings.push(warning);
        },
        sourceName: 'sector.wld',
      }),
    );

    expect(record.sectorType).toBe(0);
    expect(warn).toHaveBeenCalledWith('Normalized out-of-range sector type 11 to 0');
    expect(warnings).toEqual([
      {
        message: 'Normalized out-of-range sector type 11 to 0',
        source: { fileName: 'sector.wld', startLine: 5 },
        recordType: RecordType.World,
        vnum: 6,
      },
    ]);
  });

  it('warns and skips malformed trigger lines', () => {
    const { logger, warn } = testLogger();
    const warnings: unknown[] = [];
    const record = firstWorld(
      parseWorld(
        `#7
Trigger Room~
Triggers.
~
7 0 0 0 0 0
S
Tbad
T 9007199254740993
T 77
$
`,
        {
          logger,
          onWarning: (warning) => {
            warnings.push(warning);
          },
          sourceName: 'triggers.wld',
        },
      ),
    );

    expect(warn).toHaveBeenCalledWith("Skipping malformed room trigger line 'Tbad'");
    expect(warn).toHaveBeenCalledWith("Skipping malformed room trigger line 'T 9007199254740993'");
    expect(warnings).toEqual([
      {
        message: "Skipping malformed room trigger line 'Tbad'",
        source: { fileName: 'triggers.wld', startLine: 7 },
        recordType: RecordType.World,
        vnum: 7,
      },
      {
        message: "Skipping malformed room trigger line 'T 9007199254740993'",
        source: { fileName: 'triggers.wld', startLine: 8 },
        recordType: RecordType.World,
        vnum: 7,
      },
    ]);
    expect(record.triggerVnums).toEqual([77]);
    expect(record.source).toEqual({ fileName: 'triggers.wld', startLine: 1, endLine: 9 });
  });

  it('accepts the legacy #99999 record sentinel', () => {
    expect(parseWorld('#99999\n')).toEqual([]);
  });

  it('accepts an empty file terminator', () => {
    expect(parseWorld('$\n')).toEqual([]);
  });

  it('throws ParseError for malformed room headers and top-level structure', () => {
    expect(() => parseWorld('Name~\nDesc~\n0 0 0 0 0 0\nS\n$\n')).toThrow(ParseError);
    expect(() => parseWorld('#9007199254740993\n')).toThrow(ParseError);
    expect(() => parseWorld('#1\n~\nDesc~\n0 0 0 0 0 0\nS\n$\n')).toThrow(ParseError);
    expect(() => parseWorld('#1\nName~\nDesc~\n0 0 0 0 0\nS\n$\n')).toThrow(ParseError);
    expect(() => parseWorld('#1\nName~\nDesc~\nnope 0 0 0 0 0\nS\n$\n')).toThrow(ParseError);
    expect(() => parseWorld('#1\nName~\nDesc~\n0 -3 0\nS\n$\n')).toThrow(ParseError);
  });

  it('throws ParseError for malformed room bodies and directions', () => {
    expect(() => parseWorld('#1\nName~\nDesc~\n0 0 0 0 0 0\nX\n$\n')).toThrow(ParseError);
    expect(() => parseWorld('#1\nName~\nDesc~\n0 0 0 0 0 0\nD10\n~\n~\n0 1 2\nS\n$\n')).toThrow(
      ParseError,
    );
    expect(() => parseWorld('#1\nName~\nDesc~\n0 0 0 0 0 0\nD0\n~\n~\n0 1\nS\n$\n')).toThrow(
      ParseError,
    );
    expect(() => parseWorld('#1\nName~\nDesc~\n0 0 0 0 0 0\nD0\n~\n~\n0 nope 2\nS\n$\n')).toThrow(
      ParseError,
    );
    expect(() => parseWorld('#1\nName~\nDesc~\n0 0 0 0 0 0\nD0\n~\n~\n5 1 2\nS\n$\n')).toThrow(
      ParseError,
    );
    expect(() => parseWorld('#1\nName~\nDesc~\n0 0 0 0 0 0\n')).toThrow(ParseError);
    expect(() => parseWorld('#1\nName~\nDesc')).toThrow(ParseError);
  });
});
