import { Chalk } from 'chalk';

import { isLevelEnabled } from './options.js';
import type { LogLevel } from './options.js';
import type { Logger } from '../options.js';
import type { SourceSpan } from '../types.js';

/** Sink function that receives a single formatted log line. */
export type LogSink = (line: string) => void;

/** Options for creating a CLI logger. */
export interface CliLoggerOptions {
  /** Minimum log level to output. */
  readonly minLogLevel: LogLevel;
  /** Whether to suppress all output. */
  readonly quiet: boolean;
  /** Whether to use colored output. */
  readonly color: boolean;
  /** Output sink. Defaults to `console.error`. */
  readonly sink?: LogSink;
}

/** Optional context attached to CLI log messages. */
export interface LogContext {
  readonly source?: Partial<Pick<SourceSpan, 'fileName' | 'startLine'>> | undefined;
}

/** Default log sink that writes to `console.error`. */
export const defaultSink: LogSink = (line: string) => console.error(line);

/** Formatted CLI logger with level filtering and optional color. */
export class CliLogger {
  readonly #minLevel: LogLevel;
  readonly #quiet: boolean;
  readonly #chalk: InstanceType<typeof Chalk>;
  readonly #sink: LogSink;

  constructor(options: CliLoggerOptions) {
    this.#minLevel = options.minLogLevel;
    this.#quiet = options.quiet;
    this.#chalk = new Chalk({ level: options.color ? 1 : 0 });
    this.#sink = options.sink ?? defaultSink;
  }

  debug(message: string, context?: LogContext): void {
    this.#log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.#log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.#log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.#log('error', message, context);
  }

  #log(level: LogLevel, message: string, context?: LogContext): void {
    if (this.#quiet) return;
    if (!isLevelEnabled(level, this.#minLevel)) return;

    const tag = this.#formatTag(level);
    const location = formatLocation(context);
    const line = location ? `${tag} ${location} ${message}` : `${tag} ${message}`;
    this.#sink(line);
  }

  #formatTag(level: LogLevel): string {
    const label = `[${level}]`;
    switch (level) {
      case 'debug':
        return this.#chalk.gray(label);
      case 'info':
        return this.#chalk.cyan(label);
      case 'warn':
        return this.#chalk.yellow(label);
      case 'error':
        return this.#chalk.red(label);
    }
  }
}

/** Formats an optional source location as `<file#line>`. */
function formatLocation(context?: LogContext): string {
  if (!context?.source) return '';

  const { fileName, startLine } = context.source;
  if (fileName && startLine !== undefined) return `<${fileName}#${startLine}>`;
  if (fileName) return `<${fileName}>`;
  if (startLine !== undefined) return `<#${startLine}>`;
  return '';
}

/**
 * Creates a library-compatible {@link Logger} adapter from a {@link CliLogger}.
 *
 * The library Logger interface uses variadic `(message?, ...rest)` signatures.
 * This adapter forwards the message string to the CLI logger and discards extra
 * arguments. Structured warnings reach the CLI through `onWarning`, not here.
 */
/** Converts an unknown log argument to a safe string representation. */
function stringifyMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function toLibraryLogger(cliLogger: CliLogger): Logger {
  return {
    debug(message?: unknown) {
      if (message !== undefined) cliLogger.debug(stringifyMessage(message));
    },
    info(message?: unknown) {
      if (message !== undefined) cliLogger.info(stringifyMessage(message));
    },
    warn(message?: unknown) {
      if (message !== undefined) cliLogger.warn(stringifyMessage(message));
    },
    error(message?: unknown) {
      if (message !== undefined) cliLogger.error(stringifyMessage(message));
    },
  };
}
