import { describe, expect, it } from 'vitest';

import { MudParserError } from '../src/errors.js';
import {
  MudReader,
  parseAsciiAffectFlag,
  parseAsciiFlag,
  parseAt,
  readMudNumber,
  readMudString,
  skipMudSpaces,
} from '../src/reader.js';

describe('MudReader construction', () => {
  it('accepts string input and tracks source metadata', () => {
    const reader = new MudReader('abc', { sourceName: 'inline.wld' });

    expect(reader.sourceName).toBe('inline.wld');
    expect(reader.line).toBe(1);
    expect(reader.column).toBe(1);
    expect(reader.eof).toBe(false);
  });

  it('accepts Buffer input with default utf8 decoding', () => {
    const reader = new MudReader(Buffer.from('é', 'utf8'));

    expect(reader.readLetter()).toBe('é');
  });

  it('accepts Buffer input with custom decoding', () => {
    const reader = new MudReader(Buffer.from([0xe9]), { encoding: 'latin1' });

    expect(reader.readLetter()).toBe('é');
  });

  it('rejects calls with an uninitialized receiver', () => {
    const reader = Object.create(MudReader.prototype) as MudReader;

    expect(() => reader.readLine()).toThrow(TypeError);
  });
});

describe('MudReader eof', () => {
  it('reflects pushback state', () => {
    const reader = new MudReader('a');

    expect(reader.eof).toBe(false);
    expect(reader.readLetter()).toBe('a');
    expect(reader.eof).toBe(true);

    reader.unreadChar('a');
    expect(reader.eof).toBe(false);
    expect(reader.readLetter()).toBe('a');
    expect(reader.eof).toBe(true);
  });
});

describe('MudReader.readLine', () => {
  it('reads LF-terminated lines without terminators', () => {
    const reader = new MudReader('a\nb\n');

    expect(reader.readLine()).toBe('a');
    expect(reader.line).toBe(2);
    expect(reader.readLine()).toBe('b');
    expect(reader.line).toBe(3);
    expect(reader.readLine()).toBeNull();
  });

  it('reads CRLF-terminated lines as one line ending', () => {
    const reader = new MudReader('a\r\nb');

    expect(reader.readLine()).toBe('a');
    expect(reader.line).toBe(2);
    expect(reader.readLine()).toBe('b');
    expect(reader.eof).toBe(true);
  });

  it('reads CR-terminated lines', () => {
    const reader = new MudReader('a\rb');

    expect(reader.readLine()).toBe('a');
    expect(reader.line).toBe(2);
    expect(reader.readLine()).toBe('b');
  });

  it('reads a line ending with final CR', () => {
    const reader = new MudReader('a\r');

    expect(reader.readLine()).toBe('a');
    expect(reader.line).toBe(2);
    expect(reader.readLine()).toBeNull();
  });

  it('reads a trailing line without a terminator', () => {
    const reader = new MudReader('abc');

    expect(reader.readLine()).toBe('abc');
    expect(reader.line).toBe(1);
    expect(reader.column).toBe(4);
    expect(reader.readLine()).toBeNull();
  });

  it('returns empty strings for blank lines', () => {
    const reader = new MudReader('\nnext');

    expect(reader.readLine()).toBe('');
    expect(reader.readLine()).toBe('next');
  });
});

describe('MudReader.requireLine', () => {
  it('skips comments and blank lines', () => {
    const reader = new MudReader('* comment\n\n   \nvalue');

    expect(reader.requireLine()).toBe('value');
  });

  it('throws at EOF with source context', () => {
    const reader = new MudReader('* comment\n', { sourceName: 'empty.wld' });

    expect(() => reader.requireLine('record header')).toThrow(MudParserError);
    try {
      reader.requireLine('record header');
    } catch (error) {
      expect(error).toBeInstanceOf(MudParserError);
      expect((error as MudParserError).message).toContain('record header');
      expect((error as MudParserError).source).toEqual({ fileName: 'empty.wld', startLine: 2 });
    }
  });
});

describe('MudReader.readLetter', () => {
  it('skips C whitespace characters', () => {
    const reader = new MudReader(' \t\n\r\v\fZ');

    expect(reader.readLetter()).toBe('Z');
  });

  it('throws when EOF is reached before a non-space character', () => {
    const reader = new MudReader(' \t');

    expect(() => reader.readLetter()).toThrow(MudParserError);
  });
});

describe('MudReader.unreadChar', () => {
  it('pushes one character back and rewinds the cursor', () => {
    const reader = new MudReader('ab');

    expect(reader.readLetter()).toBe('a');
    expect(reader.column).toBe(2);

    reader.unreadChar('x');
    expect(reader.column).toBe(1);
    expect(reader.readLetter()).toBe('x');
    expect(reader.column).toBe(2);
    expect(reader.readLetter()).toBe('b');
  });

  it('rewinds across a line ending', () => {
    const reader = new MudReader('a\n');

    expect(reader.readLine()).toBe('a');
    expect(reader.line).toBe(2);
    expect(reader.column).toBe(1);

    reader.unreadChar('\n');
    expect(reader.line).toBe(1);
    expect(reader.column).toBe(2);
    expect(reader.readLine()).toBe('');
    expect(reader.line).toBe(2);
  });

  it('rejects invalid pushback characters', () => {
    const reader = new MudReader('');

    expect(() => reader.unreadChar('')).toThrow(MudParserError);
    expect(() => reader.unreadChar('ab')).toThrow(MudParserError);
  });

  it('rejects multiple pending pushback characters', () => {
    const reader = new MudReader('a');

    expect(reader.readLetter()).toBe('a');
    reader.unreadChar('a');

    expect(() => reader.unreadChar('b')).toThrow(MudParserError);
  });
});

describe('MudReader.readTildeString', () => {
  it('reads single-line tilde strings', () => {
    const reader = new MudReader('foo~\n');

    expect(reader.readTildeString()).toBe('foo');
  });

  it('reads multi-line tilde strings with normalized line endings', () => {
    const reader = new MudReader('foo\nbar\n~\n');

    expect(reader.readTildeString()).toBe('foo\nbar\n');
  });

  it('normalizes CRLF line endings', () => {
    const reader = new MudReader('foo\r\nbar\r\n~\r\n');

    expect(reader.readTildeString()).toBe('foo\nbar\n');
  });

  it('returns null for empty tilde strings', () => {
    const reader = new MudReader('~\n');

    expect(reader.readTildeString()).toBeNull();
  });

  it('preserves comment-looking lines inside strings', () => {
    const reader = new MudReader('* not a skipped comment\n~\n');

    expect(reader.readTildeString()).toBe('* not a skipped comment\n');
  });

  it('throws when the terminator is missing', () => {
    const reader = new MudReader('foo\nbar');

    expect(() => reader.readTildeString('room description')).toThrow(MudParserError);
  });
});

describe('parseAsciiFlag', () => {
  it('parses numeric flag text', () => {
    expect(parseAsciiFlag('')).toBe(0);
    expect(parseAsciiFlag('-')).toBe(0);
    expect(parseAsciiFlag('0')).toBe(0);
    expect(parseAsciiFlag('5')).toBe(5);
    expect(parseAsciiFlag('-3')).toBe(-3);
  });

  it('parses ASCII flag letters', () => {
    expect(parseAsciiFlag('a')).toBe(1);
    expect(parseAsciiFlag('b')).toBe(2);
    expect(parseAsciiFlag('z')).toBe(2 ** 25);
    expect(parseAsciiFlag('A')).toBe(2 ** 26);
    expect(parseAsciiFlag('Z')).toBe(2 ** 51);
    expect(parseAsciiFlag('cdeh')).toBe(156);
    expect(parseAsciiFlag('aa')).toBe(1);
  });

  it('ignores digits and punctuation in letter mode', () => {
    expect(parseAsciiFlag('1a')).toBe(1);
    expect(parseAsciiFlag('a-b')).toBe(3);
  });
});

describe('parseAsciiAffectFlag', () => {
  it('parses numeric flag text', () => {
    expect(parseAsciiAffectFlag('')).toBe(0);
    expect(parseAsciiAffectFlag('5')).toBe(5);
  });

  it('parses ASCII affect flags with shifted bit positions', () => {
    expect(parseAsciiAffectFlag('a')).toBe(2);
    expect(parseAsciiAffectFlag('b')).toBe(4);
    expect(parseAsciiAffectFlag('z')).toBe(2 ** 26);
    expect(parseAsciiAffectFlag('A')).toBe(2 ** 27);
    expect(parseAsciiAffectFlag('Z')).toBe(2 ** 52);
  });
});

describe('parseAt', () => {
  it('converts unpaired at signs to tabs', () => {
    expect(parseAt('')).toBe('');
    expect(parseAt('abc')).toBe('abc');
    expect(parseAt('a@b')).toBe('a\tb');
    expect(parseAt('@')).toBe('\t');
  });

  it('preserves paired at signs like the C parser', () => {
    expect(parseAt('a@@b')).toBe('a@@b');
    expect(parseAt('@@@')).toBe('@@\t');
  });
});

describe('readMudString', () => {
  it('applies parseAt after reading a tilde string', () => {
    const reader = new MudReader('one@two~\n');

    expect(readMudString(reader)).toBe('one\ttwo');
  });

  it('returns null when the tilde string is empty', () => {
    const reader = new MudReader('~\n');

    expect(readMudString(reader)).toBeNull();
  });
});

describe('readMudNumber', () => {
  it('reads signed and unsigned integers', () => {
    expect(readMudNumber(new MudReader('5 '))).toBe(5);
    expect(readMudNumber(new MudReader('-3 '))).toBe(-3);
    expect(readMudNumber(new MudReader('+7 '))).toBe(7);
    expect(readMudNumber(new MudReader('5'))).toBe(5);
  });

  it('skips leading whitespace', () => {
    expect(readMudNumber(new MudReader('  \t\n10 '))).toBe(10);
  });

  it('adds pipe-separated terms', () => {
    expect(readMudNumber(new MudReader('5|3 '))).toBe(8);
    expect(readMudNumber(new MudReader('5|3|2 '))).toBe(10);
    expect(readMudNumber(new MudReader('-5|3 '))).toBe(-2);
  });

  it('pushes back trailing non-space characters', () => {
    const reader = new MudReader('5xyz');

    expect(readMudNumber(reader)).toBe(5);
    expect(reader.readLetter()).toBe('x');
  });

  it('pushes back trailing newline characters', () => {
    const reader = new MudReader('5\nx');

    expect(readMudNumber(reader)).toBe(5);
    expect(reader.readLetter()).toBe('x');
    expect(reader.line).toBe(2);
  });

  it('throws on bad number formats', () => {
    expect(() => readMudNumber(new MudReader(''))).toThrow(MudParserError);
    expect(() => readMudNumber(new MudReader('abc'), 'zone command')).toThrow(MudParserError);
    expect(() => readMudNumber(new MudReader(''), 'zone command')).toThrow(MudParserError);
    expect(() => readMudNumber(new MudReader('-'), 'zone command')).toThrow(MudParserError);
  });
});

describe('skipMudSpaces', () => {
  it('removes leading C whitespace only', () => {
    expect(skipMudSpaces('')).toBe('');
    expect(skipMudSpaces('   ')).toBe('');
    expect(skipMudSpaces('   foo')).toBe('foo');
    expect(skipMudSpaces('\n\t\r\v\f foo')).toBe('foo');
    expect(skipMudSpaces('foo bar')).toBe('foo bar');
  });
});
