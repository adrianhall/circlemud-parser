import { MudReader } from '../../reader.js';
import { skipMudSpaces } from '../../reader.js';
import type { SourceSpan, Vnum } from '../../types.js';
import { fail } from './diagnostics.js';
import type { ParserContext } from './context.js';

/** A non-comment source line and the line number where it started. */
export interface SourceLine {
  /** Source text without the line terminator. */
  readonly text: string;

  /** One-based line number where the source text started. */
  readonly startLine: number;
}

/** Reads the next non-empty, non-comment source line with its original line number. */
export function readContentLine(reader: MudReader): SourceLine | null {
  for (;;) {
    const startLine = reader.line;
    const text = reader.readLine();

    if (text === null) {
      return null;
    }

    const trimmed = skipMudSpaces(text);

    if (trimmed.length === 0 || trimmed.startsWith('*')) {
      continue;
    }

    return {
      text,
      startLine,
    };
  }
}

/** Reads a content line or throws a parser error with the provided context message. */
export function requireContentLine(
  reader: MudReader,
  context: ParserContext,
  message: string,
  vnum?: Vnum,
): SourceLine {
  const line = readContentLine(reader);

  if (line === null) {
    fail(message, context, sourceForReader(reader, context), vnum);
  }

  return line;
}

/** Builds public source metadata from normalized parser context and line numbers. */
export function sourceForLine(
  context: ParserContext,
  startLine: number,
  endLine?: number,
): SourceSpan {
  const source: SourceSpan = { startLine };

  if (context.sourceName !== undefined) {
    source.fileName = context.sourceName;
  }
  if (endLine !== undefined) {
    source.endLine = endLine;
  }

  return source;
}

/** Builds source metadata at the reader's current cursor line. */
export function sourceForReader(reader: MudReader, context: ParserContext): SourceSpan {
  return sourceForLine(context, reader.line);
}
