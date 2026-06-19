import type { BitVector, BitVectorSet, FlagTable } from './types.js';

/**
 * Resolves an ordinal value to its public name from a table.
 *
 * Returns `UNKNOWN_<value>` for values that are out-of-range or point at sentinel
 * entries (`'\n'`, `'\0'`), so no information is silently lost.
 *
 * @param value - Non-negative ordinal index.
 * @param table - Name table indexed by ordinal.
 * @returns Resolved name or `UNKNOWN_<value>` fallback.
 */
export function resolveOrdinalName(value: number, table: FlagTable): string {
  const name = table[value];
  return name === undefined || name === '\n' || name === '\0' ? `UNKNOWN_${value}` : name;
}

function assertBitVector(value: BitVector): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Bitvector values must be non-negative integers: ${value}`);
  }
}

function* bitPositions(value: BitVector): Generator<number> {
  assertBitVector(value);

  let remaining = value;
  let bit = 0;

  while (remaining > 0) {
    if (remaining % 2 === 1) {
      yield bit;
    }

    remaining = Math.floor(remaining / 2);
    bit += 1;
  }
}

/**
 * Converts a numeric bitvector to canonical CircleMUD ASCII flag letters.
 *
 * Bit positions 0-25 map to `a`-`z`, positions 26-51 map to `A`-`Z`, and zero maps to `"0"`.
 *
 * @param value - Non-negative numeric bitvector to encode.
 * @returns Canonical ASCII flag representation.
 * @throws RangeError if the value is negative, non-integer, or contains a bit above `Z`.
 */
export function bitvectorToAsciiFlags(value: BitVector): string {
  const flags: string[] = [];

  for (const bit of bitPositions(value)) {
    if (bit < 26) {
      flags.push(String.fromCharCode('a'.charCodeAt(0) + bit));
    } else if (bit < 52) {
      flags.push(String.fromCharCode('A'.charCodeAt(0) + bit - 26));
    } else {
      throw new RangeError(`Bit ${bit} cannot be represented as an ASCII flag`);
    }
  }

  return flags.length === 0 ? '0' : flags.join('');
}

/**
 * Converts a four-element bitvector set to canonical space-separated ASCII flag strings.
 *
 * @param set - Four-element bitvector set to encode.
 * @returns Space-separated ASCII flag strings, one per set element.
 * @throws RangeError if any bitvector element cannot be encoded.
 */
export function bitvectorSetToAsciiFlags(set: BitVectorSet): string {
  return set.map((value) => bitvectorToAsciiFlags(value)).join(' ');
}

/**
 * Resolves all set bits in a single bitvector to public flag names.
 *
 * Unknown or sentinel table entries are preserved as `UNKNOWN_<bit>` names so set bits are not lost.
 *
 * @param value - Numeric bitvector to resolve.
 * @param table - Flag-name table indexed by bit position.
 * @returns Flag names in ascending bit order.
 * @throws RangeError if the bitvector value is negative or non-integer.
 */
export function resolveFlagNames(value: BitVector, table: FlagTable): string[] {
  const names: string[] = [];

  for (const bit of bitPositions(value)) {
    const name = table[bit];
    names.push(name === undefined || name === '\n' || name === '\0' ? `UNKNOWN_${bit}` : name);
  }

  return names;
}

/**
 * Resolves all set bits in a four-element bitvector set to public flag names.
 *
 * Table indexes use 32-bit offsets per set element, matching tbaMUD's array-style flag fields.
 * Unknown or sentinel table entries are preserved as `UNKNOWN_<bit>` names.
 *
 * @param set - Four-element bitvector set to resolve.
 * @param table - Flag-name table indexed by global bit position.
 * @returns Flag names in ascending set and bit order.
 * @throws RangeError if any bitvector element is negative or non-integer.
 */
export function resolveFlagSetNames(set: BitVectorSet, table: FlagTable): string[] {
  const names: string[] = [];

  for (const [fieldIndex, value] of set.entries()) {
    for (const bit of bitPositions(value)) {
      const tableIndex = fieldIndex * 32 + bit;
      const name = table[tableIndex];
      names.push(
        name === undefined || name === '\n' || name === '\0' ? `UNKNOWN_${tableIndex}` : name,
      );
    }
  }

  return names;
}
