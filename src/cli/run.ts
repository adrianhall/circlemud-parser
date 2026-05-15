import { nodeFs } from './fs.js';
import { resolveInputs } from './inputs.js';
import { CliLogger } from './logger.js';
import { WriteTracker } from './outputs.js';
import { processWorkPlan } from './process.js';
import { parseArgs } from './program.js';
import type { ParseResult } from './program.js';
import type { FsLike } from './fs.js';
import type { LogSink } from './logger.js';

/** Dependencies that can be injected for testing. */
export interface CliDeps {
  readonly fs: FsLike;
  readonly sink: LogSink;
}

/** Default production dependencies using real `node:fs` and `console.error`. */
export const defaultCliDeps: CliDeps = {
  fs: nodeFs,
  /* v8 ignore next -- @preserve console.error default sink */
  sink: (line: string) => console.error(line),
};

/**
 * Log the message from the parse failure only if the message is available.
 * @param result the parse result.
 * @param deps the CLI dependencies package.
 */
export function logMessageIfAvailable(result: ParseResult, deps: CliDeps): void {
  if (!result.ok && result.message) {
    deps.sink(result.message);
  }
}

/**
 * Main testable CLI entry point.
 *
 * Parses arguments, resolves inputs, processes files, and returns an exit code.
 *
 * - `0` — success.
 * - `1` — parser error or stop-on-warning triggered.
 * - `2` — CLI usage error (missing input, invalid flags, conflicting options).
 */
export function runCli(argv: string[], deps: CliDeps = defaultCliDeps): number {
  const result = parseArgs(argv);

  if (!result.ok) {
    logMessageIfAvailable(result, deps);
    return result.exitCode;
  }

  const { options } = result;
  const logger = new CliLogger({
    minLogLevel: options.minLogLevel,
    quiet: options.quiet,
    color: options.color,
    sink: deps.sink,
  });

  try {
    const plan = resolveInputs(options.input, options, deps.fs, logger);
    const tracker = new WriteTracker(deps.fs);
    return processWorkPlan(plan, options, { fs: deps.fs, logger, tracker });
  } catch (err: unknown) {
    /* v8 ignore next -- @preserve non-Error throw safety */
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    return 1;
  }
}
