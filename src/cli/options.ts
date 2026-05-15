/** Supported CLI log levels. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Supported output formats. */
export type OutputFormat = 'json' | 'yaml' | 'toml';

/** Parsed and validated CLI options. */
export interface CliOptions {
  /** Input file, index file, or directory path. */
  readonly input: string;

  /** Output directory override. When undefined, output goes alongside input files. */
  readonly outputDirectory: string | undefined;

  /** Output serialization format. */
  readonly format: OutputFormat;

  /** Minimum log level to display. */
  readonly minLogLevel: LogLevel;

  /** Suppress all log output. */
  readonly quiet: boolean;

  /** Whether to use colored output. */
  readonly color: boolean;

  /** Stop processing on the first parser error. */
  readonly stopOnError: boolean;

  /** Stop processing on the first parser warning. */
  readonly stopOnWarning: boolean;

  /** Skip writing when the destination file already exists. */
  readonly skipIfExists: boolean;

  /** Overwrite existing destination files. */
  readonly overwrite: boolean;

  /** Downgrade missing referenced files from errors to warnings. */
  readonly skipIfMissing: boolean;

  /** Index file name to look for in world subdirectories. */
  readonly indexName: string;
}

/** Log level priority for filtering (higher value = more severe). */
const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Returns true when `level` passes the minimum severity threshold. */
export function isLevelEnabled(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

/** Valid log level strings for argument validation. */
export const VALID_LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Valid output format strings for argument validation. */
export const VALID_FORMATS: readonly OutputFormat[] = ['json', 'yaml', 'toml'];

/** Type guard for valid log level strings. */
export function isLogLevel(value: string): value is LogLevel {
  return (VALID_LOG_LEVELS as readonly string[]).includes(value);
}

/** Type guard for valid output format strings. */
export function isOutputFormat(value: string): value is OutputFormat {
  return (VALID_FORMATS as readonly string[]).includes(value);
}
