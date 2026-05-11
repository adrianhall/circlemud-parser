import { describe, expect, it } from 'vitest';

import {
  bitvectorSetToAsciiFlags,
  bitvectorToAsciiFlags,
  resolveFlagNames,
  resolveFlagSetNames,
} from '../src/flags.js';
import type { BitVectorSet } from '../src/types.js';

describe('bitvectorToAsciiFlags', () => {
  it('converts zero and lowercase bit positions', () => {
    expect(bitvectorToAsciiFlags(0)).toBe('0');
    expect(bitvectorToAsciiFlags(1)).toBe('a');
    expect(bitvectorToAsciiFlags(3)).toBe('ab');
    expect(bitvectorToAsciiFlags(156)).toBe('cdeh');
    expect(bitvectorToAsciiFlags(2 ** 25)).toBe('z');
  });

  it('converts uppercase bit positions', () => {
    expect(bitvectorToAsciiFlags(2 ** 26)).toBe('A');
    expect(bitvectorToAsciiFlags(2 ** 51)).toBe('Z');
    expect(bitvectorToAsciiFlags(2 ** 0 + 2 ** 26 + 2 ** 51)).toBe('aAZ');
  });

  it('rejects invalid bitvectors', () => {
    expect(() => bitvectorToAsciiFlags(-1)).toThrow(RangeError);
    expect(() => bitvectorToAsciiFlags(1.5)).toThrow(RangeError);
    expect(() => bitvectorToAsciiFlags(2 ** 52)).toThrow(RangeError);
  });
});

describe('bitvectorSetToAsciiFlags', () => {
  it('converts each set element to canonical ASCII', () => {
    expect(bitvectorSetToAsciiFlags([0, 0, 0, 0])).toBe('0 0 0 0');
    expect(bitvectorSetToAsciiFlags([156, 0, 0, 0])).toBe('cdeh 0 0 0');
    expect(bitvectorSetToAsciiFlags([1, 2, 3, 2 ** 25])).toBe('a b ab z');
  });
});

describe('resolveFlagNames', () => {
  it('returns no names for a zero bitvector', () => {
    expect(resolveFlagNames(0, ['FOO'])).toEqual([]);
  });

  it('resolves known names and unknown fallbacks in ascending bit order', () => {
    expect(resolveFlagNames(1 + 4 + 8, ['FOO', 'BAR', 'BAZ'])).toEqual(['FOO', 'BAZ', 'UNKNOWN_3']);
  });

  it('treats C sentinel entries as unknown bits', () => {
    expect(resolveFlagNames(3, ['\0', '\n'])).toEqual(['UNKNOWN_0', 'UNKNOWN_1']);
  });
});

describe('resolveFlagSetNames', () => {
  it('returns no names for an empty bitvector set', () => {
    expect(resolveFlagSetNames([0, 0, 0, 0], ['FOO'])).toEqual([]);
  });

  it('uses 32-bit table offsets for each set element', () => {
    const table = Array.from({ length: 34 }, (_, index) => `FLAG_${index}`);
    const set: BitVectorSet = [1, 2, 0, 0];

    expect(resolveFlagSetNames(set, table)).toEqual(['FLAG_0', 'FLAG_33']);
  });

  it('uses global bit positions for unknown fallbacks', () => {
    expect(resolveFlagSetNames([0, 8, 0, 0], [])).toEqual(['UNKNOWN_35']);
  });
});
