import { silentLogger, type Logger, type ParseOptions } from '../../options.js';
import type { ParseWarning } from '../../errors.js';
import type { ReaderOptions } from '../../reader.js';
import type { RecordType } from '../../types.js';

/** Shared normalized parser options used by type-specific parsers. */
export interface ParserContext<R extends RecordType = RecordType> {
  /** Record category being parsed. */
  readonly recordType: R;

  /** Whether legacy-compatible source data should be rejected. */
  readonly strict: boolean;

  /** Logger used for parser diagnostics. */
  readonly logger: Logger;

  /** Optional source label attached to records, warnings, and errors. */
  readonly sourceName?: string;

  /** Optional structured warning callback. */
  readonly onWarning?: (warning: ParseWarning) => void;
}

/** Applies parser defaults once so helpers do not repeatedly check optional fields. */
export function normalizeParseOptions<R extends RecordType>(
  options: ParseOptions,
  recordType: R,
): ParserContext<R> {
  const context: {
    recordType: R;
    strict: boolean;
    logger: Logger;
    sourceName?: string;
    onWarning?: (warning: ParseWarning) => void;
  } = {
    recordType,
    strict: options.strict ?? true,
    logger: options.logger ?? silentLogger,
  };

  if (options.sourceName !== undefined) {
    context.sourceName = options.sourceName;
  }
  if (options.onWarning !== undefined) {
    context.onWarning = options.onWarning;
  }

  return context;
}

/** Extracts only the MudReader options from broader parser options. */
export function readerOptionsFrom(options: ParseOptions): ReaderOptions {
  const readerOptions: ReaderOptions = {};

  if (options.encoding !== undefined) {
    readerOptions.encoding = options.encoding;
  }
  if (options.sourceName !== undefined) {
    readerOptions.sourceName = options.sourceName;
  }

  return readerOptions;
}
