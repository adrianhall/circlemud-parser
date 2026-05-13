import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '../../src/errors.js';
import type { Logger } from '../../src/options.js';
import { parseObject, parseObjectFile } from '../../src/parsers/object.js';
import { ObjectRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../fixtures/object/${name}`, import.meta.url));
}

function firstObject(records: ObjectRecord[]): ObjectRecord {
  const [record] = records;

  if (record === undefined) {
    throw new Error('Expected at least one object record.');
  }

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

describe('parseObjectFile', () => {
  it('parses an object fixture with flags, affects, triggers, and source context', () => {
    const record = firstObject(
      parseObjectFile(fixturePath('simple.obj'), { sourceName: 'simple.obj' }),
    );

    expect(record).toBeInstanceOf(ObjectRecord);
    expect(record.recordType).toBe(RecordType.Object);
    expect(record.vnum).toBe(3000);
    expect(record.aliases).toEqual(['sword', 'blade']);
    expect(record.shortDescription).toBe('a bright sword');
    expect(record.description).toBe('A bright sword lies here.');
    expect(record.actionDescription).toBe('Swinging it flashes.');
    expect(record.objectType).toBe(5);
    expect(record.objectTypeName).toBe('WEAPON');
    expect(record.extraFlags).toEqual(['GLOW', 'HUM']);
    expect(record.extraFlagsBits).toBe('ab 0 0 0');
    expect(record.wearFlags).toEqual(['TAKE', 'WIELD', 'HOLD']);
    expect(record.wearFlagsBits).toBe('ano 0 0 0');
    expect(record.affectFlags).toEqual(['BLIND']);
    expect(record.affectFlagsBits).toBe('b 0 0 0');
    expect(record.values).toEqual([8, 10, 9, 3]);
    expect(record.weight).toBe(4);
    expect(record.cost).toBe(100);
    expect(record.rent).toBe(2);
    expect(record.level).toBe(20);
    expect(record.timer).toBe(5);
    expect(record.extraDescriptions).toEqual([
      {
        keywords: ['sword', 'blade'],
        description: 'Bright steel.\n',
      },
    ]);
    expect(record.affects).toEqual([{ location: 18, locationName: 'HITROLL', modifier: 5 }]);
    expect(record.triggerVnums).toEqual([1200]);
    expect(record.source).toEqual({ fileName: 'simple.obj', startLine: 1, endLine: 15 });
  });

  it('sets fileName source context from fileName by default', () => {
    const fileName = fixturePath('simple.obj');
    const record = firstObject(parseObjectFile(fileName));

    expect(record.source?.fileName).toBe(fileName);
  });

  it('parses multiple objects using the next header as record terminator', () => {
    const records = parseObjectFile(fixturePath('multiple.obj'));

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      vnum: 3001,
      aliases: ['stone', 'rock'],
      objectTypeName: 'OTHER',
      wearFlags: ['TAKE'],
    });
    expect(records[0]?.source?.endLine).toBe(8);
    expect(records[1]).toMatchObject({
      vnum: 3002,
      aliases: ['coin', 'gold'],
      objectTypeName: 'MONEY',
      wearFlags: ['TAKE'],
    });
    expect(records[1]?.source?.endLine).toBe(16);
  });

  it('throws when EOF is reached before the file terminator', () => {
    expect(() => parseObjectFile(fixturePath('missing-terminator.obj'))).toThrow(ParseError);
    expect(() => parseObjectFile(fixturePath('missing-terminator.obj'))).toThrow(
      'Expected E, A, T, $, or next object header before EOF',
    );
  });

  it('parses bundled tbaMUD object files', () => {
    const objectDirectory = fileURLToPath(
      new URL('../../data/tbamud/lib/world/obj/', import.meta.url),
    );
    const objectFiles = readdirSync(objectDirectory).filter((name) => name.endsWith('.obj'));

    expect(objectFiles.length).toBeGreaterThan(0);

    let parsedRecordCount = 0;

    for (const objectFile of objectFiles) {
      const records = parseObjectFile(join(objectDirectory, objectFile));
      parsedRecordCount += records.length;

      for (const record of records) {
        expect(record.vnum).toBeGreaterThanOrEqual(0);
        expect(record.aliases.length).toBeGreaterThan(0);
      }
    }

    expect(parsedRecordCount).toBeGreaterThan(0);
  });
});

describe('parseObject', () => {
  it('accepts Buffer input with explicit encoding', () => {
    const record = firstObject(
      parseObject(
        Buffer.from(
          '#13\népée blade~\na blade~\nA blade is here.~\n~\n5 0 0 0 0 a 0 0 0 0 0 0 0\n0 0 0 0\n1 1 0 0 0\n$\n',
          'latin1',
        ),
        { encoding: 'latin1' },
      ),
    );

    expect(record.vnum).toBe(13);
    expect(record.aliases).toEqual(['épée', 'blade']);
  });

  it('accepts the legacy #99999 record sentinel and empty file terminator', () => {
    expect(parseObject('#99999\n')).toEqual([]);
    expect(parseObject('$\n')).toEqual([]);
  });

  it('skips blank and comment lines while reading records', () => {
    const record = firstObject(
      parseObject(`* comment before object

#13
commented item~
a commented item~
Commented item desc.~
~
12 0 0 0 0 a 0 0 0 0 0 0 0
0 0 0 0
1 1 0 0 0
$
`),
    );

    expect(record.vnum).toBe(13);
  });

  it('accepts legacy flag lines only when strict is false', () => {
    const source = `#10
legacy thing~
a legacy thing~
Legacy desc.~
~
5 ab ano
1 2 3 4
1 2 3 4 5
$
`;

    expect(() => parseObject(source)).toThrow(ParseError);

    const { logger, warn } = testLogger();
    const warnings: unknown[] = [];
    const record = firstObject(
      parseObject(source, {
        strict: false,
        logger,
        onWarning: (warning) => {
          warnings.push(warning);
        },
        sourceName: 'legacy.obj',
      }),
    );

    expect(warn).toHaveBeenCalledWith('Converted legacy object flags to 128-bit form');
    expect(warnings).toEqual([
      {
        message: 'Converted legacy object flags to 128-bit form',
        source: { fileName: 'legacy.obj', startLine: 6 },
        recordType: RecordType.Object,
        vnum: 10,
      },
    ]);
    expect(record.extraFlags).toEqual(['GLOW', 'HUM']);
    expect(record.extraFlagsBits).toBe('ab 0 0 0');
    expect(record.wearFlags).toEqual(['TAKE', 'WIELD', 'HOLD']);
    expect(record.wearFlagsBits).toBe('ano 0 0 0');
    expect(record.affectFlags).toEqual([]);
    expect(record.affectFlagsBits).toBe('0 0 0 0');
  });

  it('accepts legacy affect flags in non-strict mode using shifted affect bits', () => {
    const record = firstObject(
      parseObject(
        `#11
legacy affect~
a legacy affect~
Legacy affect desc.~
~
5 ab ano a
1 2 3 4
1 2 3 4 5
$
`,
        { strict: false },
      ),
    );

    expect(record.affectFlags).toEqual(['BLIND']);
    expect(record.affectFlagsBits).toBe('b 0 0 0');
  });

  it('throws ParseError for malformed legacy object flag tokens in non-strict mode', () => {
    expect(() =>
      parseObject(
        `#17
legacy bad extra~
a legacy bad extra~
Legacy bad extra desc.~
~
5 -1 ano
1 2 3 4
1 2 3 4 5
$
`,
        { strict: false },
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseObject(
        `#18
legacy bad affect~
a legacy bad affect~
Legacy bad affect desc.~
~
5 ab ano -1
1 2 3 4
1 2 3 4 5
$
`,
        { strict: false },
      ),
    ).toThrow(ParseError);
  });

  it('accepts shorter cost lines using the C parser defaults', () => {
    const source = `#12
legacy cost~
a legacy cost~
Legacy cost desc.~
~
5 0 0 0 0 a 0 0 0 0 0 0 0
1 2 3 4
7 8 9
$
`;

    const record = firstObject(parseObject(source));

    expect(record.weight).toBe(7);
    expect(record.cost).toBe(8);
    expect(record.rent).toBe(9);
    expect(record.level).toBe(0);
    expect(record.timer).toBe(0);
  });

  it('resolves extra descriptions in source order and unknown ordinal names', () => {
    const record = firstObject(
      parseObject(`#14
mystery item~
a mystery item~
A mystery item hums here.~
~
99 0 0 0 0 a 0 0 0 0 0 0 0
0 0 0 0
1 1 0 0 0
E
first key~
First description.
~
E
second key~
Second description.
~
E
~
~
A
99 -1
$
`),
    );

    expect(record.objectTypeName).toBe('UNKNOWN_99');
    expect(record.extraDescriptions).toEqual([
      { keywords: ['first', 'key'], description: 'First description.\n' },
      { keywords: ['second', 'key'], description: 'Second description.\n' },
      { keywords: [], description: null },
    ]);
    expect(record.affects).toEqual([{ location: 99, locationName: 'UNKNOWN_99', modifier: -1 }]);
  });

  it('warns and skips malformed trigger lines', () => {
    const { logger, warn } = testLogger();
    const warnings: unknown[] = [];
    const record = firstObject(
      parseObject(
        `#15
trigger item~
a trigger item~
Trigger item desc.~
~
12 0 0 0 0 a 0 0 0 0 0 0 0
0 0 0 0
1 1 0 0 0
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
          sourceName: 'triggers.obj',
        },
      ),
    );

    expect(warn).toHaveBeenCalledWith("Skipping malformed object trigger line 'Tbad'");
    expect(warn).toHaveBeenCalledWith(
      "Skipping malformed object trigger line 'T 9007199254740993'",
    );
    expect(warnings).toEqual([
      {
        message: "Skipping malformed object trigger line 'Tbad'",
        source: { fileName: 'triggers.obj', startLine: 9 },
        recordType: RecordType.Object,
        vnum: 15,
      },
      {
        message: "Skipping malformed object trigger line 'T 9007199254740993'",
        source: { fileName: 'triggers.obj', startLine: 10 },
        recordType: RecordType.Object,
        vnum: 15,
      },
    ]);
    expect(record.triggerVnums).toEqual([77]);
    expect(record.source).toEqual({ fileName: 'triggers.obj', startLine: 1, endLine: 11 });
  });

  it('throws in strict mode and warns in non-strict mode for object affect overflow', () => {
    const source = `#16
overflow item~
an overflow item~
Overflow item desc.~
~
12 0 0 0 0 a 0 0 0 0 0 0 0
0 0 0 0
1 1 0 0 0
A
1 1
A
2 2
A
3 3
A
4 4
A
5 5
A
6 6
A
7 7
$
`;

    expect(() => parseObject(source)).toThrow(ParseError);

    const { logger, warn } = testLogger();
    const record = firstObject(parseObject(source, { strict: false, logger }));

    expect(record.affects).toHaveLength(6);
    expect(warn).toHaveBeenCalledWith('Skipping object affect beyond 6 supported fields');
  });

  it('throws ParseError for malformed object headers and numeric lines', () => {
    expect(() => parseObject('')).toThrow(ParseError);
    expect(() =>
      parseObject('name~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0 0 0 0 0\n0 0 0 0\n1 1 0 0 0\n$\n'),
    ).toThrow(ParseError);
    expect(() => parseObject('#9007199254740993\n')).toThrow(ParseError);
    expect(() =>
      parseObject('#1\n~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0 0 0 0 0\n0 0 0 0\n1 1 0 0 0\n$\n'),
    ).toThrow(ParseError);
    expect(() =>
      parseObject('#1\nname~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0\n0 0 0 0\n1 1 0 0 0\n$\n'),
    ).toThrow(ParseError);
    expect(() =>
      parseObject(
        '#1\nname~\nshort~\ndesc~\n~\n12 -1 0 0 0 a 0 0 0 0 0 0 0\n0 0 0 0\n1 1 0 0 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseObject('#1\nname~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0 0 0 0 0\n0 0 0\n1 1 0 0 0\n$\n'),
    ).toThrow(ParseError);
    expect(() =>
      parseObject(
        '#1\nname~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0 0 0 0 0\n0 nope 0 0\n1 1 0 0 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseObject('#1\nname~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0 0 0 0 0\n0 0 0 0\n1 1\n$\n'),
    ).toThrow(ParseError);
    expect(() =>
      parseObject(
        '#1\nname~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0 0 0 0 0\n0 0 0 0\n1 nope 0 0 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() => parseObject('#1\nname~\nshort~\ndesc~\n~\n')).toThrow(ParseError);
  });

  it('throws ParseError for malformed object bodies and strings', () => {
    expect(() => parseObject('#1\nname~\nshort~\ndesc')).toThrow(ParseError);
    expect(() =>
      parseObject(
        '#1\nname~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0 0 0 0 0\n0 0 0 0\n1 1 0 0 0\nZ\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseObject(
        '#1\nname~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0 0 0 0 0\n0 0 0 0\n1 1 0 0 0\nA\n1\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseObject(
        '#1\nname~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0 0 0 0 0\n0 0 0 0\n1 1 0 0 0\nE\nkeys~\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseObject('#1\nname~\nshort~\ndesc~\n~\n12 0 0 0 0 a 0 0 0 0 0 0 0\n0 0 0 0\n1 1 0 0 0\n'),
    ).toThrow(ParseError);
  });
});
