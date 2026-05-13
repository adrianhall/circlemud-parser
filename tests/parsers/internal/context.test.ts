import { describe, expect, it, vi } from 'vitest';

import { silentLogger } from '../../../src/options.js';
import { normalizeParseOptions, readerOptionsFrom } from '../../../src/parsers/internal/context.js';
import { RecordType } from '../../../src/types.js';

describe('parser context helpers', () => {
  it('normalizes parser options with defaults', () => {
    const context = normalizeParseOptions({}, RecordType.World);

    expect(context).toEqual({
      recordType: RecordType.World,
      strict: true,
      logger: silentLogger,
    });
  });

  it('preserves explicitly supplied parser options', () => {
    const logger = console;
    const onWarning = vi.fn();
    const context = normalizeParseOptions(
      { strict: false, logger, sourceName: 'source.wld', onWarning },
      RecordType.World,
    );

    expect(context.strict).toBe(false);
    expect(context.logger).toBe(logger);
    expect(context.sourceName).toBe('source.wld');
    expect(context.onWarning).toBe(onWarning);
  });

  it('extracts reader options from parser options', () => {
    expect(readerOptionsFrom({ encoding: 'latin1', sourceName: 'file.mob' })).toEqual({
      encoding: 'latin1',
      sourceName: 'file.mob',
    });
    expect(readerOptionsFrom({ strict: false })).toEqual({});
  });
});
