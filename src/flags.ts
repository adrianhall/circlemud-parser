import type { BitVector, BitVectorSet, FlagTable } from './types.js';

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

export function bitvectorSetToAsciiFlags(set: BitVectorSet): string {
  return set.map((value) => bitvectorToAsciiFlags(value)).join(' ');
}

export function resolveFlagNames(value: BitVector, table: FlagTable): string[] {
  const names: string[] = [];

  for (const bit of bitPositions(value)) {
    const name = table[bit];
    names.push(name === undefined || name === '\n' || name === '\0' ? `UNKNOWN_${bit}` : name);
  }

  return names;
}

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
