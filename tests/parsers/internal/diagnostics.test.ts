import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '../../../src/errors.js';
import { normalizeParseOptions } from '../../../src/parsers/internal/context.js';
import { emitWarning, fail, warningFor } from '../../../src/parsers/internal/diagnostics.js';
import { RecordType } from '../../../src/types.js';

function logger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('diagnostic helpers', () => {
  it('creates structured warnings', () => {
    const context = normalizeParseOptions({ sourceName: 'zone.zon' }, RecordType.Zone);

    expect(warningFor('Careful', context, { startLine: 4 }, 12)).toEqual({
      message: 'Careful',
      source: { fileName: 'zone.zon', startLine: 4 },
      recordType: RecordType.Zone,
      vnum: 12,
    });

    expect(warningFor('General', context, { fileName: 'inline.zon', startLine: 5 })).toEqual({
      message: 'General',
      source: { fileName: 'inline.zon', startLine: 5 },
      recordType: RecordType.Zone,
    });
  });

  it('emits warnings through logger and callback', () => {
    const calls: unknown[] = [];
    const mockLogger = logger();
    const context = normalizeParseOptions(
      {
        logger: mockLogger,
        onWarning: (warning) => calls.push(warning),
      },
      RecordType.Object,
    );

    emitWarning('Bad trigger', context, { startLine: 9 }, 3001);

    expect(mockLogger.warn).toHaveBeenCalledWith('Bad trigger');
    expect(calls).toHaveLength(1);
  });

  it('logs and throws parse errors', () => {
    const mockLogger = logger();
    const context = normalizeParseOptions({ logger: mockLogger }, RecordType.Mobile);

    expect(() => fail('Bad mob', context, { startLine: 2 }, 10, new Error('cause'))).toThrow(
      ParseError,
    );
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
