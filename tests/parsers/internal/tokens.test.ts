import { describe, expect, it } from 'vitest';

import {
  nullableString,
  nullableVnum,
  parseIntegerPrefix,
  parseIntegerTokens,
  parseLeadingInteger,
  parseTokenInteger,
  splitKeywords,
  splitTokens,
  valueAt,
} from '../../../src/parsers/internal/tokens.js';

describe('token helpers', () => {
  it('parses strict integer tokens', () => {
    expect(parseTokenInteger('12')).toBe(12);
    expect(parseTokenInteger('-12')).toBe(-12);
    expect(parseTokenInteger('12abc')).toBeNull();
    expect(parseTokenInteger('9007199254740993')).toBeNull();
    expect(parseTokenInteger(undefined)).toBeNull();
  });

  it('parses leading integers with remainders', () => {
    expect(parseLeadingInteger(' 12abc')).toBe(12);
    expect(parseIntegerPrefix(' -7 rest')).toEqual({ value: -7, remainder: ' rest' });
    expect(parseIntegerPrefix(undefined)).toBeNull();
    expect(parseLeadingInteger('abc')).toBeNull();
    expect(parseLeadingInteger('9007199254740993')).toBeNull();
  });

  it('splits source tokens and keyword lists', () => {
    expect(splitTokens('  one\ttwo three  ')).toEqual(['one', 'two', 'three']);
    expect(splitKeywords(null)).toEqual([]);
    expect(splitKeywords('north door')).toEqual(['north', 'door']);
  });

  it('parses integer token lines', () => {
    expect(parseIntegerTokens('1 -2 3')).toEqual([1, -2, 3]);
    expect(parseIntegerTokens('1 nope 3')).toBeNull();
  });

  it('provides small conversion helpers', () => {
    expect(valueAt(['a'], 0)).toBe('a');
    expect(() => valueAt([], 0)).toThrow(RangeError);
    expect(nullableString('')).toBeNull();
    expect(nullableString('value')).toBe('value');
    expect(nullableVnum(-1)).toBeNull();
    expect(nullableVnum(42)).toBe(42);
  });
});
