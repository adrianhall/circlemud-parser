import { MudParserError } from '../errors.js';
import { parseFile } from '../parsers/file.js';
import { serializeRecords } from './format.js';
import { toLibraryLogger } from './logger.js';
import { resolveOutputPath } from './outputs.js';
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
 * @returns `0` on success, `1` if any file had errors or stop-on-warning triggered.
 */
export function processWorkPlan(plan: WorkPlan, options: CliOptions, deps: ProcessDeps): number {
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
