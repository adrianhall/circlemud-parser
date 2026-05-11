export type Vnum = number;

export type BitVector = number;

export type BitVectorSet = readonly [BitVector, BitVector, BitVector, BitVector];

export type MudInput = string | Buffer;

export type FlagTable = readonly string[];

export interface SourceSpan {
  fileName?: string;
  startLine: number;
  endLine?: number;
}

export enum RecordType {
  Mobile = 'mobile',
  Object = 'object',
  World = 'world',
  Zone = 'zone',
  Shop = 'shop',
  Quest = 'quest',
  Trigger = 'trigger',
}
