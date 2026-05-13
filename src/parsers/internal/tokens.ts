import { skipMudSpaces } from '../../reader.js';
import type { Vnum } from '../../types.js';

const INT_TOKEN_PATTERN = /^[+-]?\d+$/;
const INT_PREFIX_PATTERN = /^\s*([+-]?\d+)/;

/** Splits a source line into whitespace-delimited tokens. */
export function splitTokens(line: string): string[] {
  return skipMudSpaces(line).split(/\s+/).filter(Boolean);
}

/** Splits a decoded MUD keyword string into public keyword array form. */
export function splitKeywords(value: string | null): string[] {
  return value === null ? [] : value.trim().split(/\s+/).filter(Boolean);
}

/** Parses a safe integer token, rejecting trailing text. */
export function parseTokenInteger(value: string | undefined): number | null {
  if (value === undefined || !INT_TOKEN_PATTERN.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Parses a leading safe integer with its remaining text. */
export function parseIntegerPrefix(
  value: string | undefined,
): { readonly value: number; readonly remainder: string } | null {
  if (value === undefined) {
    return null;
  }

  const match = INT_PREFIX_PATTERN.exec(value);

  if (match === null) {
    return null;
  }

  const token = match[1];

  /* v8 ignore next -- @preserve INT_PREFIX_PATTERN has one required capture group when match is non-null. */
  if (token === undefined) {
    return null;
  }

  const parsed = Number.parseInt(token, 10);

  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return {
    value: parsed,
    remainder: value.slice(match[0].length),
  };
}

/** Parses and returns a leading safe integer. */
export function parseLeadingInteger(value: string | undefined): number | null {
  return parseIntegerPrefix(value)?.value ?? null;
}

/** Parses a source line containing only integer tokens. */
export function parseIntegerTokens(line: string): number[] | null {
  const values: number[] = [];

  for (const token of splitTokens(line)) {
    const value = parseTokenInteger(token);

    if (value === null) {
      return null;
    }

    values.push(value);
  }

  return values;
}

/** Returns an indexed value from a validated array. */
export function valueAt<T>(values: readonly T[], index: number): T {
  const value = values[index];

  if (value === undefined) {
    throw new RangeError(`Missing parsed field at index ${index}`);
  }

  return value;
}

/** Converts explicitly absent strings to the public `null` representation. */
export function nullableString(value: string): string | null {
  return value.length === 0 ? null : value;
}

/** Maps the tbaMUD `-1` VNUM sentinel to the public `null` representation. */
export function nullableVnum(value: Vnum): Vnum | null {
  return value === -1 ? null : value;
}
