import { MudParserError } from './errors.js';
import type { MudInput, SourceSpan } from './types.js';

export interface ReaderOptions {
  encoding?: BufferEncoding;
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

const readerStates = new WeakMap<MudReader, ReaderState>();

export class MudReader {
  constructor(input: MudInput, options: ReaderOptions = {}) {
    const state: ReaderState = {
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
      Object.assign(state, { sourceName: options.sourceName });
    }

    readerStates.set(this, state);
  }

  get sourceName(): string | undefined {
    return getState(this).sourceName;
  }

  get line(): number {
    return getState(this).line;
  }

  get column(): number {
    return getState(this).column;
  }

  get eof(): boolean {
    const state = getState(this);
    return state.pushback === null && state.position >= state.text.length;
  }

  readLine(): string | null {
    if (this.eof) {
      return null;
    }

    let line = '';

    for (;;) {
      const char = readChar(this);

      if (char === null) {
        return line;
      }
      if (char === '\n') {
        return line;
      }
      if (char === '\r') {
        const next = readChar(this);

        if (next !== null && next !== '\n') {
          this.unreadChar(next);
        }

        return line;
      }

      line += char;
    }
  }

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

  readLetter(): string {
    for (;;) {
      const char = readChar(this);

      if (char === null) {
        throw readerError(this, 'Expected non-space character');
      }
      if (!isMudSpace(char)) {
        return char;
      }
    }
  }

  unreadChar(char: string): void {
    const state = getState(this);

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

function getState(reader: MudReader): ReaderState {
  const state = readerStates.get(reader);

  if (state === undefined) {
    throw new TypeError('Invalid MudReader instance.');
  }

  return state;
}

function readChar(reader: MudReader): string | null {
  const state = getState(reader);

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
  const state = getState(reader);
  const source: SourceSpan = {
    startLine: state.line,
  };

  if (state.sourceName !== undefined) {
    source.fileName = state.sourceName;
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

export function parseAsciiFlag(value: string): number {
  return parseAsciiFlagWithBase(value, 0);
}

export function parseAsciiAffectFlag(value: string): number {
  return parseAsciiFlagWithBase(value, 1);
}

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

export function readMudString(reader: MudReader, context?: string): string | null {
  const value = reader.readTildeString(context);
  return value === null ? null : parseAt(value);
}

export function readMudNumber(reader: MudReader, context?: string): number {
  let char = readChar(reader);

  while (char !== null && isMudSpace(char)) {
    char = readChar(reader);
  }

  if (char === null) {
    throw readerError(reader, `Expected number${contextText(context)}`);
  }

  let sign = 1;

  if (char === '+' || char === '-') {
    sign = char === '-' ? -1 : 1;
    char = readChar(reader);
  }

  if (char === null || !isAsciiDigit(char)) {
    throw readerError(reader, `Expected number${contextText(context)}`);
  }

  let number = 0;

  while (char !== null && isAsciiDigit(char)) {
    number = number * 10 + char.charCodeAt(0) - '0'.charCodeAt(0);
    char = readChar(reader);
  }

  number *= sign;

  if (char === '|') {
    number += readMudNumber(reader, context);
  } else if (char !== null && char !== ' ') {
    reader.unreadChar(char);
  }

  return number;
}

export function skipMudSpaces(value: string): string {
  let index = 0;

  while (index < value.length && isMudSpace(value.charAt(index))) {
    index += 1;
  }

  return value.slice(index);
}
