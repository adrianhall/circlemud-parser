import type { BitVectorSet } from '../../types.js';

/** Zero-filled four-element bitvector set. */
export const ZERO_FLAG_SET: BitVectorSet = [0, 0, 0, 0];

/** Parses one four-element flag vector set from split source tokens. */
export function parseBitVectorSet(
  tokens: readonly string[],
  startIndex: number,
  parseFlag: (value: string) => number,
): BitVectorSet | null {
  const values: number[] = [];

  for (let offset = 0; offset < 4; offset += 1) {
    const token = tokens[startIndex + offset];

    if (token === undefined) {
      return null;
    }

    const value = parseFlag(token);

    if (!Number.isSafeInteger(value) || value < 0) {
      return null;
    }

    values.push(value);
  }

  return bitVectorSetFrom(values);
}

/** Parses four individual flag tokens into a four-element bitvector set. */
export function parseFourBitVectorTokens(
  first: string | undefined,
  second: string | undefined,
  third: string | undefined,
  fourth: string | undefined,
  parseFlag: (value: string) => number,
): BitVectorSet | null {
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return null;
  }

  return parseBitVectorSet([first, second, third, fourth], 0, parseFlag);
}

/** Parses one legacy single-field flag value into a four-element flag set. */
export function parseLegacyBitVectorSet(
  token: string | undefined,
  parseFlag: (value: string) => number,
): BitVectorSet | null {
  if (token === undefined) {
    return null;
  }

  const value = parseFlag(token);

  if (!Number.isSafeInteger(value) || value < 0) {
    return null;
  }

  return [value, 0, 0, 0];
}

/** Builds a four-element bitvector set from a validated array. */
export function bitVectorSetFrom(values: readonly number[]): BitVectorSet {
  return [
    valueOrZero(values, 0),
    valueOrZero(values, 1),
    valueOrZero(values, 2),
    valueOrZero(values, 3),
  ];
}

function valueOrZero(values: readonly number[], index: number): number {
  return values[index] ?? 0;
}
