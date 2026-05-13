import { ParseError, type MudParserErrorContext, type ParseWarning } from '../../errors.js';
import type { SourceSpan, Vnum } from '../../types.js';
import type { ParserContext } from './context.js';

/** Creates a structured parser warning with record and source context. */
export function warningFor(
  message: string,
  context: ParserContext,
  source: SourceSpan,
  vnum?: Vnum,
): ParseWarning {
  const warning: ParseWarning = {
    message,
    source,
    recordType: context.recordType,
  };

  if (vnum !== undefined) {
    warning.vnum = vnum;
  }
  if (context.sourceName !== undefined && warning.source?.fileName === undefined) {
    warning.source = {
      ...source,
      fileName: context.sourceName,
    };
  }

  return warning;
}

/** Emits a recoverable parser warning through both warning channels. */
export function emitWarning(
  message: string,
  context: ParserContext,
  source: SourceSpan,
  vnum?: Vnum,
): void {
  const warning = warningFor(message, context, source, vnum);
  context.logger.warn(warning.message);
  context.onWarning?.(warning);
}

/** Logs and throws a source-aware `ParseError`. */
export function fail(
  message: string,
  context: ParserContext,
  source: SourceSpan,
  vnum?: Vnum,
  cause?: unknown,
): never {
  const errorContext: MudParserErrorContext = {
    source,
    recordType: context.recordType,
  };

  if (vnum !== undefined) {
    errorContext.vnum = vnum;
  }
  if (cause !== undefined) {
    errorContext.cause = cause;
  }

  const error = new ParseError(message, errorContext);
  context.logger.error(error.message, error);
  throw error;
}
