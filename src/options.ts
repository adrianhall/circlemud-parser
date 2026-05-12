import type { ParseWarning } from './errors.js';

/** Logger shape used by parser code for optional diagnostics. */
export interface Logger {
  /**
   * Logs verbose parser progress details.
   *
   * @param message - Primary log message or value.
   * @param optionalParams - Additional implementation-defined log values.
   * @returns Nothing.
   */
  debug(message?: unknown, ...optionalParams: unknown[]): void;

  /**
   * Logs high-level parser progress or summary information.
   *
   * @param message - Primary log message or value.
   * @param optionalParams - Additional implementation-defined log values.
   * @returns Nothing.
   */
  info(message?: unknown, ...optionalParams: unknown[]): void;

  /**
   * Logs recoverable parser issues.
   *
   * @param message - Primary log message or value.
   * @param optionalParams - Additional implementation-defined log values.
   * @returns Nothing.
   */
  warn(message?: unknown, ...optionalParams: unknown[]): void;

  /**
   * Logs fatal parser failures before they are thrown.
   *
   * @param message - Primary log message or value.
   * @param optionalParams - Additional implementation-defined log values.
   * @returns Nothing.
   */
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

/** Options accepted by parser entry points. */
export interface ParseOptions {
  /** Buffer encoding used when parser input is a Buffer. Defaults to `utf8`. */
  encoding?: BufferEncoding;

  /** Whether to reject malformed or legacy-compatible source data. Defaults to `true`. */
  strict?: boolean;

  /** Source label used in records, warnings, and errors. */
  sourceName?: string;

  /** Logger used for parser diagnostics. Defaults to a silent logger. */
  logger?: Logger;

  /** Callback invoked for structured recoverable parser warnings. */
  onWarning?: (warning: ParseWarning) => void;
}

function noopLoggerMethod(): void {
  // Intentionally silent default logger.
}

/** Logger implementation that discards all messages. */
export const silentLogger: Logger = {
  debug: noopLoggerMethod,
  info: noopLoggerMethod,
  warn: noopLoggerMethod,
  error: noopLoggerMethod,
};
