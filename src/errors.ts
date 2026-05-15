import type { RecordType, SourceSpan, Vnum } from './types.js';

/** Context attached to parser errors raised by this library. */
export interface MudParserErrorContext {
  /** Source span where the error occurred, when known. */
  source?: SourceSpan;

  /** Record type being parsed when the error occurred, when known. */
  recordType?: RecordType;

  /** VNUM of the record being parsed when the error occurred, when known. */
  vnum?: Vnum;

  /** Underlying error or thrown value that caused this parser error. */
  cause?: unknown;
}

/** Structured warning emitted for recoverable parser issues. */
export interface ParseWarning {
  /** Human-readable warning message. */
  message: string;

  /** Source span where the warning occurred, when known. */
  source?: SourceSpan;

  /** Record type being parsed when the warning occurred, when known. */
  recordType?: RecordType;

  /** VNUM of the record being parsed when the warning occurred, when known. */
  vnum?: Vnum;
}

/** Base class for all parser errors raised by this library. */
export class MudParserError extends Error {
  /** Source span where the error occurred, when known. */
  readonly source?: SourceSpan;

  /** Record type being parsed when the error occurred, when known. */
  readonly recordType?: RecordType;

  /** VNUM of the record being parsed when the error occurred, when known. */
  readonly vnum?: Vnum;

  /**
   * Creates a source-aware parser error.
   *
   * @param message - Human-readable error message.
   * @param context - Optional parser context attached to the error.
   */
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

/** Error raised when source content cannot be parsed as the requested record type. */
export class ParseError extends MudParserError {}

/** Error raised when a parser entry point cannot determine a file's record type. */
export class UnsupportedRecordTypeError extends MudParserError {
  /** File name whose extension could not be mapped to a supported record type. */
  readonly fileName: string;

  /**
   * Creates an unsupported-record-type error.
   *
   * @param fileName - File name that could not be mapped to a record type.
   * @param messageOrContext - Optional custom message or parser error context.
   * @param context - Optional parser error context when a custom message is provided.
   */
  constructor(
    fileName: string,
    messageOrContext?: string | MudParserErrorContext,
    context: MudParserErrorContext = {},
  ) {
    const message =
      typeof messageOrContext === 'string'
        ? messageOrContext
        : `Cannot infer record type from file name '${fileName}'`;

    super(message, typeof messageOrContext === 'string' ? context : messageOrContext);
    this.fileName = fileName;
  }
}
