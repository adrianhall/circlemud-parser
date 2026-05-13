import { MudReader, parseAt, readMudString } from '../../reader.js';
import type { Vnum } from '../../types.js';
import type { ParserContext } from './context.js';
import { fail } from './diagnostics.js';
import { sourceForReader } from './source.js';

/** Tilde string value plus ending source line. */
export interface SourceString {
  /** Decoded string value, or `null` for an explicitly empty source string. */
  readonly value: string | null;

  /** One-based source line containing the terminating tilde. */
  readonly endLine: number;
}

/** Reads a MUD string and converts reader errors into source-aware `ParseError` instances. */
export function readSourceString(
  reader: MudReader,
  context: ParserContext,
  description: string,
  vnum?: Vnum,
): string | null {
  try {
    return readMudString(reader, description);
  } catch (error) {
    fail(
      `Expected tilde-terminated string while reading ${description}`,
      context,
      sourceForReader(reader, context),
      vnum,
      error,
    );
  }
}

/** Reads a MUD string and also returns the line containing the terminating tilde. */
export function readSourceStringWithEndLine(
  reader: MudReader,
  context: ParserContext,
  description: string,
  vnum?: Vnum,
): SourceString {
  let value = '';

  for (;;) {
    const startLine = reader.line;
    const line = reader.readLine();

    if (line === null) {
      fail(
        `Expected tilde-terminated string while reading ${description}`,
        context,
        sourceForReader(reader, context),
        vnum,
      );
    }
    if (line.endsWith('~')) {
      value += line.slice(0, -1);
      return {
        value: value.length === 0 ? null : parseAt(value),
        endLine: startLine,
      };
    }

    value += `${line}\n`;
  }
}
