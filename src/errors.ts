import type { RecordType, SourceSpan, Vnum } from './types.js';

export interface MudParserErrorContext {
  source?: SourceSpan;
  recordType?: RecordType;
  vnum?: Vnum;
  cause?: unknown;
}

export class MudParserError extends Error {
  readonly source?: SourceSpan;
  readonly recordType?: RecordType;
  readonly vnum?: Vnum;

  constructor(message: string, context: MudParserErrorContext = {}) {
    super(
      message,
      context.cause === undefined
        ? undefined
        : {
            cause: context.cause,
          },
    );

    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);

    if (context.source !== undefined) {
      this.source = context.source;
    }
    if (context.recordType !== undefined) {
      this.recordType = context.recordType;
    }
    if (context.vnum !== undefined) {
      this.vnum = context.vnum;
    }
  }
}
