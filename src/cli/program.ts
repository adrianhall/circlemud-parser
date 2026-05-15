import { Command, CommanderError } from 'commander';

import { VERSION } from '../index.js';
import { isLogLevel, isOutputFormat } from './options.js';
import type { CliOptions, LogLevel } from './options.js';

/** Successful parse result containing validated CLI options. */
export interface ParseOk {
  readonly ok: true;
  readonly options: CliOptions;
}

/** Failed parse result with an exit code and user-facing message. */
export interface ParseFail {
  readonly ok: false;
  readonly exitCode: number;
  readonly message: string;
}

/** Discriminated result of CLI argument parsing. */
export type ParseResult = ParseOk | ParseFail;

/**
 * Builds a configured Commander program instance.
 *
 * The returned program uses `exitOverride` so that `--help`, `--version`, and
 * validation errors throw `CommanderError` instead of calling `process.exit`.
 *
 * @param write - Optional sink for help/version/error output capture.
 */
export function buildProgram(write?: (str: string) => void): Command {
  const program = new Command();

  program
    .name('circlemud-parser')
    .description('Parse CircleMUD/TbaMUD world data files into JSON, YAML, or TOML')
    .version(VERSION)
    .exitOverride()
    .argument('<input>', 'Input file, index file, or world directory')
    .option('-O, --output-directory <dir>', 'Output directory')
    .option('-f, --format <fmt>', 'Output format: json|yaml|toml', 'json')
    .option('-l, --min-log-level <level>', 'Minimum log level: debug|info|warn|error')
    .option('-q, --quiet', 'Suppress all log output')
    .option('-v, --verbose', 'Set log level to debug')
    .option('--color', 'Enable colored output')
    .option('--no-color', 'Disable colored output')
    .option('--stop-on-error', 'Stop on the first parser error')
    .option('--no-stop-on-error', 'Continue past parser errors')
    .option('--stop-on-warning', 'Stop on the first parser warning')
    .option('--no-stop-on-warning', 'Continue past parser warnings')
    .option('--skip-if-exists', 'Skip files whose destination already exists')
    .option('--overwrite', 'Overwrite existing destination files')
    .option('--skip-if-missing', 'Warn instead of erroring on missing referenced files')
    .option('--no-skip-if-missing', 'Error on missing referenced files')
    .option('--index-name <name>', 'Index file name for directory walks', 'index');

  if (write) {
    program.configureOutput({ writeOut: write, writeErr: write });
  }

  return program;
}

/**
 * Parses CLI arguments into validated {@link CliOptions} or a failure result.
 *
 * Conflicting flags produce exit code 2:
 * - `-q`/`--quiet`, `-v`/`--verbose`, and `-l`/`--min-log-level` are mutually exclusive.
 * - `--skip-if-exists` and `--overwrite` are mutually exclusive.
 */
export function parseArgs(argv: string[]): ParseResult {
  let captured = '';
  const program = buildProgram((str) => {
    captured += str;
  });

  let rawOpts: Record<string, unknown>;
  let args: string[];
  try {
    program.parse(argv, { from: 'user' });
    rawOpts = program.opts();
    args = program.args;
  } catch (err: unknown) {
    /* v8 ignore next -- @preserve commander always throws CommanderError under exitOverride */
    if (!(err instanceof CommanderError)) throw err;
    const exitCode = err.exitCode === 0 ? 0 : 2;
    return { ok: false, exitCode, message: formatCommanderError(err, captured) };
  }

  // --- Validate format -------------------------------------------------
  const format = getFormat(rawOpts);
  if (!isOutputFormat(format)) {
    return {
      ok: false,
      exitCode: 2,
      message: `Invalid format '${format}'. Use json, yaml, or toml.`,
    };
  }

  // --- Validate min-log-level ------------------------------------------
  const rawLevel = rawOpts['minLogLevel'] as string | undefined;
  if (rawLevel !== undefined && !isLogLevel(rawLevel)) {
    return {
      ok: false,
      exitCode: 2,
      message: `Invalid log level '${rawLevel}'. Use debug, info, warn, or error.`,
    };
  }

  // --- Mutual-exclusion: -q / -v / -l ----------------------------------
  const quiet = rawOpts['quiet'] === true;
  const verbose = rawOpts['verbose'] === true;
  const hasExplicitLevel = rawLevel !== undefined;
  const logFlagCount = (quiet ? 1 : 0) + (verbose ? 1 : 0) + (hasExplicitLevel ? 1 : 0);
  if (logFlagCount > 1) {
    return {
      ok: false,
      exitCode: 2,
      message: 'Options -q/--quiet, -v/--verbose, and -l/--min-log-level are mutually exclusive.',
    };
  }

  // Resolve effective log level
  let minLogLevel: LogLevel = 'info';
  if (quiet) {
    // Quiet suppresses all log output; level is irrelevant but we keep
    // error so that stop-on-error messages still reach the logger before
    // quiet filtering suppresses them.
    minLogLevel = 'error';
  } else if (verbose) {
    minLogLevel = 'debug';
  } else if (rawLevel !== undefined) {
    minLogLevel = rawLevel;
  }

  // --- Mutual-exclusion: clobber flags ---------------------------------
  const hasSkipIfExists = argv.some((a) => a === '--skip-if-exists');
  const hasOverwrite = argv.some((a) => a === '--overwrite');
  if (hasSkipIfExists && hasOverwrite) {
    return {
      ok: false,
      exitCode: 2,
      message: 'Options --skip-if-exists and --overwrite are mutually exclusive.',
    };
  }
  const overwrite = hasOverwrite;
  const skipIfExists = !overwrite;

  // --- Stop behavior defaults ------------------------------------------
  const stopOnError = rawOpts['stopOnError'] !== false;
  const stopOnWarning = rawOpts['stopOnWarning'] === true;

  // Commander enforces the required <input> argument via exitOverride before
  // reaching this point, so args[0] is always defined here.
  const input = args[0]!;

  return {
    ok: true,
    options: {
      input,
      outputDirectory: rawOpts['outputDirectory'] as string | undefined,
      format,
      minLogLevel,
      quiet,
      color: rawOpts['color'] !== false,
      stopOnError,
      stopOnWarning,
      skipIfExists,
      overwrite,
      skipIfMissing: rawOpts['skipIfMissing'] !== false,
      indexName: getIndexName(rawOpts),
    },
  };
}

/**
 * Builds the user-facing message for a Commander error. Prefers the captured
 * help/error output, falling back to the error's own message when none was
 * written through `configureOutput`.
 */
export function formatCommanderError(err: CommanderError, captured: string): string {
  return captured || err.message;
}

/**
 * Returns the format string from raw commander options, defaulting to `'json'`
 * when the value is not a string.
 */
export function getFormat(rawOpts: Record<string, unknown>): string {
  return typeof rawOpts['format'] === 'string' ? rawOpts['format'] : 'json';
}

/**
 * Returns the index name from raw commander options, defaulting to `'index'`
 * when the value is not a string.
 */
export function getIndexName(rawOpts: Record<string, unknown>): string {
  return typeof rawOpts['indexName'] === 'string' ? rawOpts['indexName'] : 'index';
}
