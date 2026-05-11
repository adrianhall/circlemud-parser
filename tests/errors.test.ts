import { describe, expect, it } from 'vitest';

import { MudParserError } from '../src/errors.js';
import { RecordType } from '../src/types.js';

describe('MudParserError', () => {
  it('preserves message and context fields', () => {
    const cause = new Error('root cause');
    const error = new MudParserError('parse failed', {
      cause,
      recordType: RecordType.World,
      source: {
        fileName: '30.wld',
        startLine: 12,
        endLine: 15,
      },
      vnum: 3000,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MudParserError);
    expect(error.name).toBe('MudParserError');
    expect(error.message).toBe('parse failed');
    expect(error.cause).toBe(cause);
    expect(error.recordType).toBe(RecordType.World);
    expect(error.source).toEqual({ fileName: '30.wld', startLine: 12, endLine: 15 });
    expect(error.vnum).toBe(3000);
  });

  it('supports construction without context', () => {
    const error = new MudParserError('parse failed');

    expect(error.message).toBe('parse failed');
    expect(error.source).toBeUndefined();
    expect(error.recordType).toBeUndefined();
    expect(error.vnum).toBeUndefined();
  });
});
