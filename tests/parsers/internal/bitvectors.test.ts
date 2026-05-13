import { describe, expect, it } from 'vitest';

import { parseAsciiFlag } from '../../../src/reader.js';
import {
  bitVectorSetFrom,
  parseBitVectorSet,
  parseFourBitVectorTokens,
  parseLegacyBitVectorSet,
  ZERO_FLAG_SET,
} from '../../../src/parsers/internal/bitvectors.js';

describe('bitvector parsing helpers', () => {
  it('parses four-token bitvector sets', () => {
    expect(parseBitVectorSet(['a', '0', '2', 'd'], 0, parseAsciiFlag)).toEqual([1, 0, 2, 8]);
    expect(parseFourBitVectorTokens('a', 'b', '0', '0', parseAsciiFlag)).toEqual([1, 2, 0, 0]);
  });

  it('parses legacy single-token bitvector sets', () => {
    expect(parseLegacyBitVectorSet('c', parseAsciiFlag)).toEqual([4, 0, 0, 0]);
    expect(ZERO_FLAG_SET).toEqual([0, 0, 0, 0]);
  });

  it('zero-fills missing defensive tuple slots', () => {
    expect(bitVectorSetFrom([1, 2, 3])).toEqual([1, 2, 3, 0]);
  });

  it('rejects missing, negative, and unsafe bitvector values', () => {
    expect(parseBitVectorSet(['a'], 0, parseAsciiFlag)).toBeNull();
    expect(parseFourBitVectorTokens('a', undefined, '0', '0', parseAsciiFlag)).toBeNull();
    expect(parseLegacyBitVectorSet(undefined, parseAsciiFlag)).toBeNull();
    expect(parseLegacyBitVectorSet('-1', parseAsciiFlag)).toBeNull();
    expect(parseLegacyBitVectorSet('9007199254740993', parseAsciiFlag)).toBeNull();
  });
});
