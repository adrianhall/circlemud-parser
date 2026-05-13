import { MudParserError } from './errors.js';
import type { MudInput, SourceSpan } from './types.js';

/** Options used when constructing a `MudReader`. */
export interface ReaderOptions {
  /** Buffer encoding used when input is a Buffer. Defaults to `utf8`. */
  encoding?: BufferEncoding;

  /** Source label attached to reader-generated errors. */
  sourceName?: string;
}

interface ReaderState {
  readonly text: string;
  readonly sourceName?: string;
  position: number;
  line: number;
  column: number;
  lastLine: number;
  lastColumn: number;
  lastWasCarriageReturn: boolean;
  previousWasCarriageReturn: boolean;
  pushback: string | null;
}

/** Cursor-style reader for CircleMUD/tbaMUD source text. */
export class MudReader {
  #state: ReaderState;

  /**
   * Creates a reader over an in-memory source string or Buffer.
   *
   * @param input - Source text or Buffer to read from.
   * @param options - Reader options controlling encoding and source metadata.
   */
  constructor(input: MudInput, options: ReaderOptions = {}) {
    this.#state = {
      text: Buffer.isBuffer(input) ? input.toString(options.encoding ?? 'utf8') : input,
      position: 0,
      line: 1,
      column: 1,
      lastLine: 1,
      lastColumn: 1,
      lastWasCarriageReturn: false,
      previousWasCarriageReturn: false,
      pushback: null,
    };

    if (options.sourceName !== undefined) {
      Object.assign(this.#state, { sourceName: options.sourceName });
    }
  }

  /**
   * Returns the source label attached to this reader, if one was provided.
   *
   * @returns Source label or `undefined`.
   */
  get sourceName(): string | undefined {
    return this.#state.sourceName;
  }

  /**
   * Returns the current one-based line number.
   *
   * @returns Current reader line.
   */
  get line(): number {
    return this.#state.line;
  }

  /**
   * Returns the current one-based column number.
   *
   * @returns Current reader column.
   */
  get column(): number {
    return this.#state.column;
  }

  /**
   * Indicates whether the reader has consumed all input and has no pushed-back character.
   *
   * @returns `true` when no more characters are available.
   */
  get eof(): boolean {
    const state = this.#state;
    return state.pushback === null && state.position >= state.text.length;
  }

  /**
   * Reads one raw character from the input.
   *
   * @internal Used by low-level parser helpers that emulate C reader routines.
   * @returns The next character, or `null` at EOF.
   */
  readChar(): string | null {
    const state = this.#state;

    if (state.pushback !== null) {
      const char = state.pushback;
      state.pushback = null;
      advance(state, char);
      return char;
    }
    if (state.position >= state.text.length) {
      return null;
    }

    const char = state.text.charAt(state.position);
    state.position += 1;
    advance(state, char);
    return char;
  }

  /**
   * Reads one physical line without the line terminator.
   *
   * Supports LF, CRLF, and CR line endings while normalizing the returned line to omit terminators.
   *
   * @returns The next line, or `null` at EOF before any characters are read.
   */
  readLine(): string | null {
    if (this.eof) {
      return null;
    }

    let line = '';

    for (;;) {
      const char = this.readChar();

      if (char === null) {
        return line;
      }
      if (char === '\n') {
        return line;
      }
      if (char === '\r') {
        const next = this.readChar();

        if (next !== null && next !== '\n') {
          this.unreadChar(next);
        }

        return line;
      }

      line += char;
    }
  }

  /**
   * Reads the next non-comment, non-blank line.
   *
   * Lines beginning with `*` and lines that are empty after MUD whitespace trimming are skipped.
   *
   * @param context - Optional context appended to error messages.
   * @returns The next required content line.
   * @throws MudParserError if EOF is reached before a content line is found.
   */
  requireLine(context?: string): string {
    for (;;) {
      const line = this.readLine();

      if (line === null) {
        throw readerError(this, `Expected line${contextText(context)}`);
      }
      if (line.startsWith('*') || skipMudSpaces(line).length === 0) {
        continue;
      }

      return line;
    }
  }

  /**
   * Reads the next non-MUD-whitespace character.
   *
   * @returns The next non-space character.
   * @throws MudParserError if EOF is reached before a non-space character is found.
   */
  readLetter(): string {
    for (;;) {
      const char = this.readChar();

      if (char === null) {
        throw readerError(this, 'Expected non-space character');
      }
      if (!isMudSpace(char)) {
        return char;
      }
    }
  }

  /**
   * Pushes one character back so it will be returned by the next read operation.
   *
   * Only one character of pushback is supported, matching the parser's C helper usage.
   *
   * @param char - Single character to push back.
   * @returns Nothing.
   * @throws MudParserError if `char` is not exactly one character or pushback is already occupied.
   */
  unreadChar(char: string): void {
    const state = this.#state;

    if (char.length !== 1) {
      throw readerError(this, `Expected exactly one character to unread, received ${char.length}`);
    }
    if (state.pushback !== null) {
      throw readerError(this, 'Cannot unread more than one character');
    }

    state.pushback = char;
    state.line = state.lastLine;
    state.column = state.lastColumn;
    state.lastWasCarriageReturn = state.previousWasCarriageReturn;
  }

  /**
   * Reads a tilde-terminated MUD string.
   *
   * Multi-line strings are joined with normalized `\n` line endings, and an empty string returns
   * `null` to represent an explicitly absent source string.
   *
   * @param context - Optional context appended to error messages.
   * @returns Decoded string content before the tilde, or `null` for an empty source string.
   * @throws MudParserError if EOF is reached before a tilde terminator.
   */
  readTildeString(context?: string): string | null {
    let value = '';

    for (;;) {
      const line = this.readLine();

      if (line === null) {
        throw readerError(this, `Expected tilde-terminated string${contextText(context)}`);
      }
      if (line.endsWith('~')) {
        value += line.slice(0, -1);
        break;
      }

      value += `${line}\n`;
    }

    return value.length === 0 ? null : value;
  }
}

function advance(state: ReaderState, char: string): void {
  state.lastLine = state.line;
  state.lastColumn = state.column;
  state.previousWasCarriageReturn = state.lastWasCarriageReturn;

  if (char === '\r') {
    state.line += 1;
    state.column = 1;
    state.lastWasCarriageReturn = true;
  } else if (char === '\n') {
    if (!state.lastWasCarriageReturn) {
      state.line += 1;
    }

    state.column = 1;
    state.lastWasCarriageReturn = false;
  } else {
    state.column += 1;
    state.lastWasCarriageReturn = false;
  }
}

function readerError(reader: MudReader, message: string): MudParserError {
  return new MudParserError(message, {
    source: sourceFor(reader),
  });
}

function sourceFor(reader: MudReader): SourceSpan {
  const source: SourceSpan = {
    startLine: reader.line,
  };

  if (reader.sourceName !== undefined) {
    source.fileName = reader.sourceName;
  }

  return source;
}

function contextText(context: string | undefined): string {
  return context === undefined ? '' : ` while reading ${context}`;
}

function isAsciiDigit(value: string): boolean {
  return value >= '0' && value <= '9';
}

function isAsciiLower(value: string): boolean {
  return value >= 'a' && value <= 'z';
}

function isAsciiUpper(value: string): boolean {
  return value >= 'A' && value <= 'Z';
}

function isMudSpace(value: string): boolean {
  return (
    value === ' ' ||
    value === '\t' ||
    value === '\n' ||
    value === '\r' ||
    value === '\v' ||
    value === '\f'
  );
}

function parseNumericFlag(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function setBit(value: number, bit: number): number {
  const mask = 2 ** bit;
  return Math.floor(value / mask) % 2 === 1 ? value : value + mask;
}

function parseAsciiFlagWithBase(value: string, baseOffset: number): number {
  let flags = 0;
  let isNumeric = true;

  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);

    if (isAsciiLower(char)) {
      flags = setBit(flags, char.charCodeAt(0) - 'a'.charCodeAt(0) + baseOffset);
    } else if (isAsciiUpper(char)) {
      flags = setBit(flags, 26 + char.charCodeAt(0) - 'A'.charCodeAt(0) + baseOffset);
    }

    if (!isAsciiDigit(char) && (char !== '-' || index !== 0)) {
      isNumeric = false;
    }
  }

  return isNumeric ? parseNumericFlag(value) : flags;
}

/**
 * Parses a CircleMUD ASCII or numeric bitvector string.
 *
 * Lowercase letters map to bit positions 0-25 and uppercase letters map to 26-51. Fully numeric
 * input is parsed as base-10, matching `asciiflag_conv` in the C source.
 *
 * @param value - Source bitvector token.
 * @returns Numeric bitvector value.
 */
export function parseAsciiFlag(value: string): number {
  return parseAsciiFlagWithBase(value, 0);
}

/**
 * Parses an affect flag string using tbaMUD's shifted affect bit positions.
 *
 * In affect fields, `a` maps to bit 1 instead of bit 0, matching `asciiflag_conv_aff`.
 *
 * @param value - Source affect bitvector token.
 * @returns Numeric affect bitvector value.
 */
export function parseAsciiAffectFlag(value: string): number {
  return parseAsciiFlagWithBase(value, 1);
}

/**
 * Applies CircleMUD `parse_at` tab decoding.
 *
 * Single `@` characters become tabs, while paired `@@` sequences are preserved.
 *
 * @param value - Source string to decode.
 * @returns String with unpaired `@` characters converted to tabs.
 */
export function parseAt(value: string): string {
  let parsed = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);

    if (char === '@') {
      const next = value.charAt(index + 1);

      if (next === '@') {
        parsed += '@@';
        index += 1;
      } else {
        parsed += '\t';
      }
    } else {
      parsed += char;
    }
  }

  return parsed;
}

/**
 * Reads a tilde-terminated MUD string and applies `parseAt()` decoding.
 *
 * @param reader - Reader positioned at the start of a MUD string.
 * @param context - Optional context appended to error messages.
 * @returns Decoded string, or `null` for an explicitly empty source string.
 * @throws MudParserError if EOF is reached before the tilde terminator.
 */
export function readMudString(reader: MudReader, context?: string): string | null {
  const value = reader.readTildeString(context);
  return value === null ? null : parseAt(value);
}

/**
 * Reads a MUD integer using `fread_number`-style behavior.
 *
 * Leading MUD whitespace is skipped, signed integers are supported, and `|`-separated terms are
 * summed recursively to match the C helper.
 *
 * @param reader - Reader positioned before a number.
 * @param context - Optional context appended to error messages.
 * @returns Parsed integer value.
 * @throws MudParserError if a valid integer cannot be read.
 */
export function readMudNumber(reader: MudReader, context?: string): number {
  let char = reader.readChar();

  while (char !== null && isMudSpace(char)) {
    char = reader.readChar();
  }

  if (char === null) {
    throw readerError(reader, `Expected number${contextText(context)}`);
  }

  let sign = 1;

  if (char === '+' || char === '-') {
    sign = char === '-' ? -1 : 1;
    char = reader.readChar();
  }

  if (char === null || !isAsciiDigit(char)) {
    throw readerError(reader, `Expected number${contextText(context)}`);
  }

  let number = 0;

  while (char !== null && isAsciiDigit(char)) {
    number = number * 10 + char.charCodeAt(0) - '0'.charCodeAt(0);
    char = reader.readChar();
  }

  number *= sign;

  if (char === '|') {
    number += readMudNumber(reader, context);
  } else if (char !== null && char !== ' ') {
    reader.unreadChar(char);
  }

  return number;
}

/**
 * Removes leading MUD whitespace from a string.
 *
 * @param value - String to trim.
 * @returns `value` with leading MUD whitespace removed.
 */
export function skipMudSpaces(value: string): string {
  let index = 0;

  while (index < value.length && isMudSpace(value.charAt(index))) {
    index += 1;
  }

  return value.slice(index);
}
