import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '../../../src/errors.js';
import { MudReader } from '../../../src/reader.js';
import { normalizeParseOptions } from '../../../src/parsers/internal/context.js';
import {
  readContentLine,
  requireContentLine,
  sourceForLine,
  sourceForReader,
} from '../../../src/parsers/internal/source.js';
import { RecordType } from '../../../src/types.js';

describe('source helpers', () => {
  it('reads non-empty, non-comment content lines with line numbers', () => {
    const reader = new MudReader('\n* comment\n   * indented comment\n  value\n');

    expect(readContentLine(reader)).toEqual({ text: '  value', startLine: 4 });
    expect(readContentLine(reader)).toBeNull();
  });

  it('requires content lines with parser context on EOF', () => {
    const error = vi.fn();
    const context = normalizeParseOptions(
      {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error },
        sourceName: 'empty.zon',
      },
      RecordType.Zone,
    );

    expect(() =>
      requireContentLine(new MudReader('* only\n'), context, 'Expected content', 12),
    ).toThrow(ParseError);
    expect(error).toHaveBeenCalled();
  });

  it('builds source spans from context and reader state', () => {
    const context = normalizeParseOptions({ sourceName: 'rooms.wld' }, RecordType.World);
    const reader = new MudReader('first\nsecond\n', { sourceName: 'reader.wld' });
    reader.readLine();

    expect(sourceForLine(context, 3, 5)).toEqual({
      fileName: 'rooms.wld',
      startLine: 3,
      endLine: 5,
    });
    expect(sourceForReader(reader, context)).toEqual({ fileName: 'rooms.wld', startLine: 2 });
  });
});
