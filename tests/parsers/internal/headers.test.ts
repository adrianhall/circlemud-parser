import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '../../../src/errors.js';
import { normalizeParseOptions } from '../../../src/parsers/internal/context.js';
import {
  parseRecordHeader,
  parseTriggerAttachmentLine,
} from '../../../src/parsers/internal/headers.js';
import { RecordType } from '../../../src/types.js';

describe('header helpers', () => {
  it('parses record headers', () => {
    const context = normalizeParseOptions({}, RecordType.World);

    expect(parseRecordHeader('#123', context, { text: '#123', startLine: 1 }, 'world')).toBe(123);
  });

  it('rejects malformed and unsafe record headers', () => {
    const context = normalizeParseOptions({}, RecordType.World);

    expect(() => parseRecordHeader('123', context, { text: '123', startLine: 1 }, 'world')).toThrow(
      ParseError,
    );
    expect(() =>
      parseRecordHeader('#9007199254740993', context, { text: '#9007199254740993', startLine: 1 }),
    ).toThrow(ParseError);
  });

  it('parses and warns for trigger attachment lines', () => {
    const warn = vi.fn();
    const warnings: unknown[] = [];
    const context = normalizeParseOptions(
      {
        logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
        onWarning: (warning) => warnings.push(warning),
      },
      RecordType.World,
    );

    expect(
      parseTriggerAttachmentLine('T 42', context, { text: 'T 42', startLine: 3 }, 10, 'room'),
    ).toBe(42);
    expect(
      parseTriggerAttachmentLine('T nope', context, { text: 'T nope', startLine: 4 }, 10, 'room'),
    ).toBeNull();
    expect(warn).toHaveBeenCalledWith("Skipping malformed room trigger line 'T nope'");
    expect(warnings).toHaveLength(1);
  });
});
