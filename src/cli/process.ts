import { dirname, join } from 'node:path';

import { MudParserError } from '../errors.js';
import { parseFile } from '../parsers/file.js';
import { RecordType } from '../types.js';
import type { MudRecord } from '../records/shared.js';
import { serializeRecords } from './format.js';
import { toLibraryLogger } from './logger.js';
import { resolveOutputPath } from './outputs.js';
import { D1SqliteDialect } from './sql/dialects/d1-sqlite.js';
import { emitSql } from './sql/emit.js';
import type { ParseWarning } from '../errors.js';
import type { Logger, ParseOptions } from '../options.js';
import type { CliLogger, LogContext } from './logger.js';
import type { CliOptions } from './options.js';
import type { FsLike } from './fs.js';
import type { WorkPlan } from './inputs.js';
import type { WriteTracker } from './outputs.js';

/** Sentinel thrown when `--stop-on-warning` is triggered. */
export class StopOnWarningSignal extends Error {
  readonly warning: ParseWarning;

  constructor(warning: ParseWarning) {
    super(warning.message);
    this.name = 'StopOnWarningSignal';
    this.warning = warning;
  }
}

/** Converts a {@link ParseWarning} source span into a {@link LogContext}, if present. */
export function warningContext(warning: ParseWarning): LogContext | undefined {
  return warning.source ? { source: warning.source } : undefined;
}

/** Dependencies injected into processing functions. */
export interface ProcessDeps {
  readonly fs: FsLike;
  readonly logger: CliLogger;
  readonly tracker: WriteTracker;
}

/** Flattened description of one file to process. */
interface FileEntry {
  readonly filePath: string;
  readonly subdirectory?: string | undefined;
}

/**
 * Processes a full work plan: parses files, serializes output, and writes results.
 *
 * When `options.format === 'sql'`, the plan is aggregated into a single SQL
 * emission pass instead of writing one output file per input file.
 *
 * @returns `0` on success, `1` if any file had errors or stop-on-warning triggered.
 */
export function processWorkPlan(plan: WorkPlan, options: CliOptions, deps: ProcessDeps): number {
  if (options.format === 'sql') {
    return processSqlWorkPlan(plan, options, deps);
  }

  const { logger, tracker } = deps;
  const libraryLogger = toLibraryLogger(logger);
  const entries = collectFileEntries(plan);
  let hadError = false;

  for (const entry of entries) {
    try {
      processOneFile(entry.filePath, options, plan, entry.subdirectory, libraryLogger, deps);
    } catch (err: unknown) {
      if (err instanceof StopOnWarningSignal) {
        tracker.cleanup();
        return 1;
      }
      if (err instanceof MudParserError) {
        hadError = true;
        if (options.stopOnError) {
          tracker.cleanup();
          return 1;
        }
        // Error was already logged by the library through the adapted logger.
        continue;
      }
      // Unexpected error — clean up and re-throw.
      tracker.cleanup();
      throw err;
    }
  }

  return hadError ? 1 : 0;
}

/**
 * SQL mode: parses every file in the work plan, accumulates all records grouped
 * by `RecordType`, then calls the SQL emitter once to produce migration files.
 */
function processSqlWorkPlan(plan: WorkPlan, options: CliOptions, deps: ProcessDeps): number {
  const { logger, tracker } = deps;
  const libraryLogger = toLibraryLogger(logger);
  const entries = collectFileEntries(plan);
  const inputRoot = resolveInputRoot(plan);

  // Grouped accumulator.
  const grouped = new Map<RecordType, MudRecord[]>();
  let hadError = false;

  for (const entry of entries) {
    const parseOpts: ParseOptions = {
      sourceName: entry.filePath,
      logger: libraryLogger,
      onWarning: options.stopOnWarning
        ? (warning: ParseWarning) => {
            logger.warn(warning.message, warningContext(warning));
            throw new StopOnWarningSignal(warning);
          }
        : (warning: ParseWarning) => {
            logger.warn(warning.message, warningContext(warning));
          },
    };

    try {
      logger.info(`Parsing ${entry.filePath}`);
      const records = parseFile(entry.filePath, parseOpts);

      for (const record of records) {
        const bucket = grouped.get(record.recordType);
        if (bucket) {
          bucket.push(record);
        } else {
          grouped.set(record.recordType, [record]);
        }
      }

      logger.info(`Collected ${records.length} records from ${entry.filePath}`);
    } catch (err: unknown) {
      if (err instanceof StopOnWarningSignal) {
        tracker.cleanup();
        return 1;
      }
      if (err instanceof MudParserError) {
        hadError = true;
        if (options.stopOnError) {
          tracker.cleanup();
          return 1;
        }
        continue;
      }
      tracker.cleanup();
      throw err;
    }
  }

  // Emit SQL migration files.
  const outputDir = options.outputDirectory!; // validated non-null for sql mode
  let sqlFiles;
  try {
    const emitOpts = {
      startNumber: options.startNumber,
      inputRoot,
      warn: (msg: string) => logger.warn(msg),
      dialect: D1SqliteDialect,
      ...(options.emitCreateTables !== undefined
        ? { emitCreateTables: options.emitCreateTables }
        : {}),
    };
    sqlFiles = emitSql(grouped, emitOpts);
  } catch (err: unknown) {
    tracker.cleanup();
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    return 1;
  }

  for (const { filename, content } of sqlFiles) {
    const outputPath = join(outputDir, filename);

    if (deps.fs.existsSync(outputPath)) {
      if (options.skipIfExists) {
        logger.debug(`Skipping (exists): ${outputPath}`);
        continue;
      }
    }

    tracker.write(outputPath, content);
    logger.info(`Wrote ${outputPath}`);
  }

  return hadError ? 1 : 0;
}

/**
 * Resolves the input root path used for computing POSIX-relative source paths
 * in SQL `source` columns.
 *
 * - **directory**: the base world directory (e.g. `data/tbamud/lib/world`).
 * - **index**: the directory containing the index file.
 * - **file**: the directory containing the single data file (files appear as
 *   `<basename>#<line>` since relative('.', file) === file for same-dir).
 */
function resolveInputRoot(plan: WorkPlan): string {
  switch (plan.kind) {
    case 'directory':
      return plan.baseDirectory;
    case 'index':
      return plan.directory;
    case 'file':
      return dirname(plan.filePath);
  }
}

/** Flattens a work plan into an ordered list of individual file entries. */
function collectFileEntries(plan: WorkPlan): FileEntry[] {
  switch (plan.kind) {
    case 'file':
      return [{ filePath: plan.filePath }];

    case 'index':
      return plan.files.map((filePath) => ({ filePath, subdirectory: plan.subdirectory }));

    case 'directory':
      return plan.indices.flatMap((idx) =>
        idx.files.map((filePath) => ({ filePath, subdirectory: idx.subdirectory })),
      );
  }
}

/** Parses a single data file, serializes output, and writes to disk. */
function processOneFile(
  filePath: string,
  options: CliOptions,
  plan: WorkPlan,
  subdirectory: string | undefined,
  libraryLogger: Logger,
  deps: ProcessDeps,
): void {
  const { fs, logger, tracker } = deps;
  const outputPath = resolveOutputPath(filePath, options, plan, subdirectory);

  // Clobber control.
  if (fs.existsSync(outputPath)) {
    if (options.skipIfExists) {
      logger.debug(`Skipping (exists): ${outputPath}`);
      return;
    }
  }

  const parseOpts: ParseOptions = {
    sourceName: filePath,
    logger: libraryLogger,
    onWarning: options.stopOnWarning
      ? (warning: ParseWarning) => {
          logger.warn(warning.message, warningContext(warning));
          throw new StopOnWarningSignal(warning);
        }
      : (warning: ParseWarning) => {
          logger.warn(warning.message, warningContext(warning));
        },
  };

  logger.info(`Parsing ${filePath}`);

  const records = parseFile(filePath, parseOpts);
  const jsonRecords = records.map((r) => r.toJSON());
  const serialized = serializeRecords(jsonRecords, options.format);

  tracker.write(outputPath, serialized);
  logger.info(`Wrote ${outputPath} (${records.length} records)`);
}
