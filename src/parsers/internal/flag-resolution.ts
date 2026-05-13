import { bitvectorToAsciiFlags, resolveFlagNames } from '../../flags.js';
import type { BitVector, FlagTable, SourceSpan, Vnum } from '../../types.js';
import { fail } from './diagnostics.js';
import type { ParserContext } from './context.js';
import type { SourceLine } from './source.js';
import { sourceForLine } from './source.js';

/** Resolved bitvector names and canonical bits string. */
export interface ResolvedBitvector {
  /** Resolved public flag names. */
  readonly names: readonly string[];

  /** Canonical ASCII flag representation. */
  readonly bits: string;
}

/** Resolves bitvector public names and canonical ASCII bits with source-aware errors. */
export function resolveBitvector(
  value: BitVector,
  table: FlagTable,
  context: ParserContext,
  lineOrSource: SourceLine | SourceSpan,
  vnum: Vnum,
  description: string,
): ResolvedBitvector {
  const source =
    'text' in lineOrSource
      ? sourceForLine(context, lineOrSource.startLine)
      : sourceForLine(context, lineOrSource.startLine, lineOrSource.endLine);

  try {
    return {
      names: resolveFlagNames(value, table),
      bits: bitvectorToAsciiFlags(value),
    };
  } catch (error) {
    fail(
      `Expected ${description} bitvector representable as ASCII flags`,
      context,
      source,
      vnum,
      error,
    );
  }
}

/** Resolves an ordinal table entry, preserving unknown values. */
export function resolveOrdinalName(value: number, table: FlagTable): string {
  const name = table[value];
  return name === undefined || name === '\n' || name === '\0' ? `UNKNOWN_${value}` : name;
}
