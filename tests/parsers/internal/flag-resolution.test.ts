import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '../../../src/errors.js';
import { ROOM_FLAGS } from '../../../src/flag-tables.js';
import { normalizeParseOptions } from '../../../src/parsers/internal/context.js';
import {
  resolveBitvector,
  resolveOrdinalName,
} from '../../../src/parsers/internal/flag-resolution.js';
import { RecordType } from '../../../src/types.js';

describe('flag and ordinal resolution helpers', () => {
  it('resolves ordinal table names with unknown fallback', () => {
    expect(resolveOrdinalName(0, ['ZERO'])).toBe('ZERO');
    expect(resolveOrdinalName(1, ['ZERO'])).toBe('UNKNOWN_1');
    expect(resolveOrdinalName(0, ['\0'])).toBe('UNKNOWN_0');
  });

  it('resolves bitvector names and canonical bits', () => {
    const context = normalizeParseOptions({}, RecordType.World);

    expect(
      resolveBitvector(1, ROOM_FLAGS, context, { text: '1', startLine: 5 }, 100, 'room'),
    ).toEqual({
      names: ['DARK'],
      bits: 'a',
    });
  });

  it('converts bitvector encoding failures to parse errors', () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const context = normalizeParseOptions({ logger }, RecordType.World);

    expect(() =>
      resolveBitvector(2 ** 53, ROOM_FLAGS, context, { startLine: 8 }, 100, 'room'),
    ).toThrow(ParseError);
    expect(logger.error).toHaveBeenCalled();
  });
});
