import { describe, expect, it } from 'vitest';

import { ParseError } from '../../../src/errors.js';
import { MudReader } from '../../../src/reader.js';
import { normalizeParseOptions } from '../../../src/parsers/internal/context.js';
import {
  readSourceString,
  readSourceStringWithEndLine,
} from '../../../src/parsers/internal/strings.js';
import { RecordType } from '../../../src/types.js';

describe('source string helpers', () => {
  it('reads tilde strings through the shared error wrapper', () => {
    const context = normalizeParseOptions({}, RecordType.Object);

    expect(readSourceString(new MudReader('hello~\n'), context, 'value', 1)).toBe('hello');
    expect(readSourceString(new MudReader('~\n'), context, 'value', 1)).toBeNull();
  });

  it('returns string end lines when requested', () => {
    const context = normalizeParseOptions({}, RecordType.Trigger);

    expect(
      readSourceStringWithEndLine(new MudReader('one\ntwo~\n'), context, 'commands', 1),
    ).toEqual({
      value: 'one\ntwo',
      endLine: 2,
    });
  });

  it('converts reader EOF errors to parse errors', () => {
    const context = normalizeParseOptions({}, RecordType.Shop);

    expect(() => readSourceString(new MudReader('unterminated'), context, 'message', 1)).toThrow(
      ParseError,
    );
    expect(() =>
      readSourceStringWithEndLine(new MudReader('unterminated'), context, 'message', 1),
    ).toThrow(ParseError);
  });
});
