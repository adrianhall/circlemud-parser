import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '../../src/errors.js';
import type { Logger } from '../../src/options.js';
import { parseMobile, parseMobileFile } from '../../src/parsers/mobile.js';
import { MobileRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../fixtures/mobile/${name}`, import.meta.url));
}

function firstMobile(records: MobileRecord[]): MobileRecord {
  const [record] = records;

  if (record === undefined) {
    throw new Error('Expected at least one mobile record.');
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

describe('parseMobileFile', () => {
  it('parses a simple mobile fixture with flags, stats, triggers, and source context', () => {
    const record = firstMobile(
      parseMobileFile(fixturePath('simple.mob'), { sourceName: 'simple.mob' }),
    );

    expect(record).toBeInstanceOf(MobileRecord);
    expect(record.recordType).toBe(RecordType.Mobile);
    expect(record.vnum).toBe(3000);
    expect(record.aliases).toEqual(['guard', 'sentinel']);
    expect(record.shortDescription).toBe('a test guard');
    expect(record.longDescription).toBe('A test guard stands here.');
    expect(record.description).toBe('He watches carefully.');
    expect(record.actionFlags).toEqual(['SPEC', 'ISNPC']);
    expect(record.actionFlagsBits).toBe('ad 0 0 0');
    expect(record.affectFlags).toEqual(['BLIND']);
    expect(record.affectFlagsBits).toBe('b 0 0 0');
    expect(record.alignment).toBe(-100);
    expect(record.kind).toBe('simple');
    expect(record.enhanced).toBeUndefined();
    expect(record.stats).toEqual({
      level: 10,
      hitroll: 12,
      armorClass: -5,
      hitDice: { count: 2, sides: 8, bonus: 20 },
      damageDice: { count: 1, sides: 6, bonus: 3 },
      gold: 50,
      experience: 1000,
      position: 8,
      defaultPosition: 8,
      sex: 1,
    });
    expect(record.triggerVnums).toEqual([1200]);
    expect(record.source).toEqual({ fileName: 'simple.mob', startLine: 1, endLine: 10 });
  });

  it('sets fileName source context from fileName by default', () => {
    const fileName = fixturePath('simple.mob');
    const record = firstMobile(parseMobileFile(fileName));

    expect(record.source?.fileName).toBe(fileName);
  });

  it('parses an enhanced mobile fixture with all documented espec fields', () => {
    const record = firstMobile(parseMobileFile(fixturePath('enhanced.mob')));

    expect(record.kind).toBe('enhanced');
    expect(record.enhanced).toEqual({
      bareHandAttack: 12,
      str: 18,
      strAdd: 75,
      int: 25,
      wis: 21,
      dex: 16,
      con: 15,
      cha: 14,
      savingPara: 2,
      savingRod: 3,
      savingPetri: 4,
      savingBreath: 5,
      savingSpell: 6,
    });
    expect(record.triggerVnums).toEqual([1400]);
    expect(record.source?.endLine).toBe(24);
  });

  it('parses multiple mobiles using the next header as record terminator', () => {
    const records = parseMobileFile(fixturePath('multiple.mob'));

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      vnum: 3002,
      aliases: ['rat'],
      kind: 'simple',
      triggerVnums: [],
    });
    expect(records[0]?.source?.endLine).toBe(9);
    expect(records[1]).toMatchObject({
      vnum: 3003,
      aliases: ['clerk'],
      kind: 'enhanced',
      enhanced: {},
      triggerVnums: [1500],
    });
    expect(records[1]?.source?.endLine).toBe(20);
  });

  it('throws when EOF is reached before the file terminator', () => {
    expect(() => parseMobileFile(fixturePath('missing-terminator.mob'))).toThrow(ParseError);
    expect(() => parseMobileFile(fixturePath('missing-terminator.mob'))).toThrow(
      'Expected mobile record header or $ before EOF',
    );
  });

  it('parses bundled CircleMUD 3.1 mobile files with default (strict) options', () => {
    const mobileDirectory = fileURLToPath(
      new URL('../../data/circle-3.1/lib/world/mob/', import.meta.url),
    );
    const mobileFiles = readdirSync(mobileDirectory).filter((name) => name.endsWith('.mob'));

    expect(mobileFiles.length).toBeGreaterThan(0);

    let parsedRecordCount = 0;

    for (const mobileFile of mobileFiles) {
      // Default strict mode parses old CircleMUD data; out-of-range espec values are clamped.
      const records = parseMobileFile(join(mobileDirectory, mobileFile));
      parsedRecordCount += records.length;

      for (const record of records) {
        expect(record.vnum).toBeGreaterThanOrEqual(0);
        expect(record.aliases.length).toBeGreaterThan(0);
      }
    }

    expect(parsedRecordCount).toBeGreaterThan(0);
  });

  it('parses CircleMUD mobile #3000 with correct legacy flag resolution', () => {
    const mobileDirectory = fileURLToPath(
      new URL('../../data/circle-3.1/lib/world/mob/', import.meta.url),
    );
    const [record] = parseMobileFile(join(mobileDirectory, '30.mob'));

    expect(record?.vnum).toBe(3000);
    expect(record?.aliases).toEqual(['wizard']);
    expect(record?.kind).toBe('simple');
    expect(record?.stats.level).toBe(33);
    // Legacy 4-field flag line "ablno d 900 S" maps to the expected action flags.
    expect(record?.actionFlags).toEqual(['SPEC', 'SENTINEL', 'MEMORY', 'NO_CHARM', 'NO_SUMMN']);
  });

  it('parses bundled tbaMUD mobile files', () => {
    const mobileDirectory = fileURLToPath(
      new URL('../../data/tbamud/lib/world/mob/', import.meta.url),
    );
    const mobileFiles = readdirSync(mobileDirectory).filter((name) => name.endsWith('.mob'));

    expect(mobileFiles.length).toBeGreaterThan(0);

    let parsedRecordCount = 0;

    for (const mobileFile of mobileFiles) {
      const records = parseMobileFile(join(mobileDirectory, mobileFile));
      parsedRecordCount += records.length;

      for (const record of records) {
        expect(record.vnum).toBeGreaterThanOrEqual(0);
        expect(record.aliases.length).toBeGreaterThan(0);
      }
    }

    expect(parsedRecordCount).toBeGreaterThan(0);
  });
});

describe('parseMobile', () => {
  it('accepts Buffer input with explicit encoding', () => {
    const record = firstMobile(
      parseMobile(
        Buffer.from(
          '#13\népée guard~\na guard~\nGuard stands here.~\nLooks ready.~\n0 0 0 0 0 0 0 0 0 S\n1 20 9 1d1+1 1d2+0\n1 10\n8 8 0\n$\n',
          'latin1',
        ),
        { encoding: 'latin1' },
      ),
    );

    expect(record.vnum).toBe(13);
    expect(record.aliases).toEqual(['épée', 'guard']);
  });

  it('accepts the legacy #99999 record sentinel and empty file terminator', () => {
    expect(parseMobile('#99999\n')).toEqual([]);
    expect(parseMobile('$\n')).toEqual([]);
  });

  it('skips blank and comment lines while reading records', () => {
    const record = firstMobile(
      parseMobile(`* comment before mobile

#13
commented guard~
a commented guard~
Commented guard desc.~
~
0 0 0 0 0 0 0 0 0 S
1 20 9 1d1+1 1d2+0
1 10
8 8 0
$
`),
    );

    expect(record.vnum).toBe(13);
  });

  it('auto-detects legacy four-field mobile flag lines (CircleMUD format)', () => {
    const source = `#10
legacy guard~
a legacy guard~
Legacy guard desc.~
~
ad a -50 S
1 20 9 1d1+1 1d2+0
1 10
8 8 0
$
`;

    // Now accepted in strict mode — auto-detected by field count, not gated by strict.
    const { logger, warn } = testLogger();
    const warnings: unknown[] = [];
    const record = firstMobile(
      parseMobile(source, {
        logger,
        onWarning: (warning): void => {
          warnings.push(warning);
        },
      }),
    );

    expect(record.actionFlags).toEqual(['SPEC', 'ISNPC']);
    expect(record.actionFlagsBits).toBe('ad 0 0 0');
    expect(record.affectFlags).toEqual(['BLIND']);
    expect(record.affectFlagsBits).toBe('b 0 0 0');
    expect(warn).toHaveBeenCalledWith('Converted legacy mobile flags to 128-bit form');
    expect(warnings).toHaveLength(1);

    // Also works when strict is explicitly false.
    const strictFalseRecord = firstMobile(parseMobile(source, { strict: false }));
    expect(strictFalseRecord.actionFlags).toEqual(['SPEC', 'ISNPC']);
  });

  it('throws for malformed legacy flag lines regardless of strict mode', () => {
    const invalidFlagSource = `#10
legacy guard~
a legacy guard~
Legacy guard desc.~
~
ad -1 -50 S
1 20 9 1d1+1 1d2+0
1 10
8 8 0
$
`;
    const invalidLetterSource = invalidFlagSource.replace('ad -1 -50 S', 'ad a -50 SS');

    expect(() => parseMobile(invalidFlagSource)).toThrow(ParseError);
    expect(() => parseMobile(invalidFlagSource, { strict: false })).toThrow(ParseError);
    expect(() => parseMobile(invalidLetterSource)).toThrow(ParseError);
    expect(() => parseMobile(invalidLetterSource, { strict: false })).toThrow(ParseError);
  });

  it('clamps out-of-range enhanced specs to their valid range (matching C RANGE macro)', () => {
    const baseSource = `#10
enhanced guard~
an enhanced guard~
Enhanced guard desc.~
~
0 0 0 0 0 0 0 0 0 E
1 20 9 1d1+1 1d2+0
1 10
8 8 0
PLACEHOLDER
E
$
`;
    const aboveRangeSource = baseSource.replace('PLACEHOLDER', 'Str: 30');
    const belowRangeSource = baseSource.replace('PLACEHOLDER', 'BareHandAttack: -1');

    // Out-of-range values are clamped (not rejected) in BOTH strict and non-strict modes,
    // mirroring interpret_espec()'s RANGE() macro in the C source.
    const aboveStrict = firstMobile(parseMobile(aboveRangeSource));
    expect(aboveStrict.enhanced).toEqual({ str: 25 });

    const { logger, warn } = testLogger();
    const aboveRecord = firstMobile(parseMobile(aboveRangeSource, { logger }));
    expect(aboveRecord.enhanced).toEqual({ str: 25 });
    expect(warn).toHaveBeenCalledWith(
      "Clamped enhanced mobile keyword 'Str' value 30 to 25 (outside range 3..25)",
    );

    const belowStrict = firstMobile(parseMobile(belowRangeSource));
    expect(belowStrict.enhanced).toEqual({ bareHandAttack: 0 });

    const belowRecord = firstMobile(parseMobile(belowRangeSource, { logger }));
    expect(belowRecord.enhanced).toEqual({ bareHandAttack: 0 });
    expect(warn).toHaveBeenCalledWith(
      "Clamped enhanced mobile keyword 'BareHandAttack' value -1 to 0 (outside minimum 0)",
    );

    // The clamped value also holds when strict is explicitly false.
    const belowNonStrict = firstMobile(parseMobile(belowRangeSource, { strict: false }));
    expect(belowNonStrict.enhanced).toEqual({ bareHandAttack: 0 });
  });

  it('handles unknown, malformed, and missing enhanced specs according to strictness', () => {
    const unknownSource = `#10
enhanced guard~
an enhanced guard~
Enhanced guard desc.~
~
0 0 0 0 0 0 0 0 0 E
1 20 9 1d1+1 1d2+0
1 10
8 8 0
Unknown: 5
E
$
`;
    const malformedValueSource = unknownSource.replace('Unknown: 5', 'Str: nope');
    const missingValueSource = unknownSource.replace('Unknown: 5', 'Str');

    expect(() => parseMobile(unknownSource)).toThrow(ParseError);
    expect(() => parseMobile(malformedValueSource)).toThrow(ParseError);
    expect(() => parseMobile(missingValueSource)).toThrow(ParseError);

    const { logger, warn } = testLogger();

    const unknownRecord = firstMobile(parseMobile(unknownSource, { strict: false, logger }));
    expect(unknownRecord.enhanced).toEqual({});

    const malformedValueRecord = firstMobile(
      parseMobile(malformedValueSource, { strict: false, logger }),
    );
    expect(malformedValueRecord.enhanced).toEqual({});
    expect(warn).toHaveBeenCalledWith("Expected numeric value for enhanced mobile keyword 'Str'");
  });

  it('accepts enhanced spec keywords case-insensitively like tbaMUD str_cmp', () => {
    const record = firstMobile(
      parseMobile(`#10
enhanced guard~
an enhanced guard~
Enhanced guard desc.~
~
0 0 0 0 0 0 0 0 0 E
1 20 9 1d1+1 1d2+0
1 10
8 8 0
str: 18
savingpara: 2
E
$
`),
    );

    expect(record.enhanced).toEqual({ str: 18, savingPara: 2 });
  });

  it('warns and skips malformed mobile trigger lines', () => {
    const { logger, warn } = testLogger();
    const record = firstMobile(
      parseMobile(
        `#10
trigger guard~
a trigger guard~
Trigger guard desc.~
~
0 0 0 0 0 0 0 0 0 S
1 20 9 1d1+1 1d2+0
1 10
8 8 0
T nope
$
`,
        { logger },
      ),
    );

    expect(record.triggerVnums).toEqual([]);
    expect(warn).toHaveBeenCalledWith("Skipping malformed mobile trigger line 'T nope'");

    const overflowRecord = firstMobile(
      parseMobile(
        `#10
trigger guard~
a trigger guard~
Trigger guard desc.~
~
0 0 0 0 0 0 0 0 0 S
1 20 9 1d1+1 1d2+0
1 10
8 8 0
T 9007199254740993
$
`,
        { logger },
      ),
    );

    expect(overflowRecord.triggerVnums).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "Skipping malformed mobile trigger line 'T 9007199254740993'",
    );
  });

  it('throws ParseError for malformed mobile headers and numeric lines', () => {
    expect(() => parseMobile('')).toThrow(ParseError);
    expect(() =>
      parseMobile(
        'name~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 S\n1 20 9 1d1+1 1d2+0\n1 10\n8 8 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() => parseMobile('#9007199254740993\n')).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\n~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 S\n1 20 9 1d1+1 1d2+0\n1 10\n8 8 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\nname~\nshort~\nlong~\ndesc~\n0 0 0 0 0 S\n1 20 9 1d1+1 1d2+0\n1 10\n8 8 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\nname~\nshort~\nlong~\ndesc~\n0 -1 0 0 0 0 0 0 0 S\n1 20 9 1d1+1 1d2+0\n1 10\n8 8 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\nname~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 X\n1 20 9 1d1+1 1d2+0\n1 10\n8 8 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\nname~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 S\n1 20 9 1d1+1\n1 10\n8 8 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\nname~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 S\n1 20 9 1d1 1d2+0\n1 10\n8 8 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\nname~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 S\n1 20 9 9007199254740993d1+1 1d2+0\n1 10\n8 8 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\nname~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 S\n1 20 9 1d1+1 1d2+0\n1\n8 8 0\n$\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\nname~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 S\n1 20 9 1d1+1 1d2+0\n1 10\n8 nope 0\n$\n',
      ),
    ).toThrow(ParseError);
  });

  it('throws ParseError for malformed mobile bodies and strings', () => {
    expect(() => parseMobile('#1\nname~\nshort~\nlong')).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\nname~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 E\n1 20 9 1d1+1 1d2+0\n1 10\n8 8 0\n#2\n',
      ),
    ).toThrow(ParseError);
    expect(() =>
      parseMobile(
        '#1\nname~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 E\n1 20 9 1d1+1 1d2+0\n1 10\n8 8 0\n',
      ),
    ).toThrow(ParseError);
    expect(() => parseMobile('#1\nname~\nshort~\nlong~\ndesc~\n0 0 0 0 0 0 0 0 0 S\n')).toThrow(
      ParseError,
    );
  });
});
