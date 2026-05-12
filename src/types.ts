/** Virtual number used as the stable public identity for parsed MUD records. */
export type Vnum = number;

/** Numeric bitvector value used internally before public flag-name resolution. */
export type BitVector = number;

/** Four-element bitvector set used by tbaMUD array-style flag fields. */
export type BitVectorSet = readonly [BitVector, BitVector, BitVector, BitVector];

/** In-memory parser input accepted by content parser entry points. */
export type MudInput = string | Buffer;

/** Table that maps bit positions to public flag names. */
export type FlagTable = readonly string[];

/** Source location metadata attached to parsed records, warnings, and errors. */
export interface SourceSpan {
  /** Optional source file name or caller-provided source label. */
  fileName?: string;

  /** One-based starting line number. */
  startLine: number;

  /** One-based ending line number, when the span covers more than a start point. */
  endLine?: number;
}

/** Supported CircleMUD/tbaMUD world record categories. */
export enum RecordType {
  /** Mobile definition records from `.mob` files. */
  Mobile = 'mobile',

  /** Object definition records from `.obj` files. */
  Object = 'object',

  /** Room records from `.wld` files. */
  World = 'world',

  /** Zone reset command records from `.zon` files. */
  Zone = 'zone',

  /** Shop records from `.shp` files. */
  Shop = 'shop',

  /** Quest records from `.qst` files. */
  Quest = 'quest',

  /** DG trigger records from `.trg` files. */
  Trigger = 'trigger',
}
