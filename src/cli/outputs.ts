import { basename, dirname, join } from 'node:path';

import { extensionForFormat } from './format.js';
import type { CliOptions } from './options.js';
import type { FsLike } from './fs.js';
import type { WorkPlan } from './inputs.js';

/**
 * Resolves the output file path for a given input data file.
 *
 * - **Single file / index mode**: `<outdir>/<basename>.<format-ext>` (flat).
 * - **Directory mode with subdirectory**: `<outdir>/<subdir>/<basename>.<format-ext>` (mirrored).
 * - When no output directory is set, output goes alongside the input file.
 *
 * Parent directories are created at write time, not here.
 */
export function resolveOutputPath(
  inputFile: string,
  options: Pick<CliOptions, 'outputDirectory' | 'format'>,
  plan: WorkPlan,
  subdirectory?: string,
): string {
  const ext = extensionForFormat(options.format);
  const base = basename(inputFile) + ext;

  if (options.outputDirectory !== undefined) {
    if (plan.kind === 'directory' && subdirectory) {
      return join(options.outputDirectory, subdirectory, base);
    }
    return join(options.outputDirectory, base);
  }

  // Default: output alongside input file.
  return join(dirname(inputFile), base);
}

/**
 * Tracks in-flight temporary files so incomplete writes can be rolled back.
 *
 * {@link WriteTracker.write} creates parent directories as needed, writes to a
 * `.tmp` file, and atomically renames to the final path. If the process is
 * interrupted between `writeFileSync` and `renameSync`, {@link WriteTracker.cleanup}
 * removes the orphaned temporary files.
 */
export class WriteTracker {
  readonly #tempFiles: string[] = [];
  readonly #fs: FsLike;

  constructor(fs: FsLike) {
    this.#fs = fs;
  }

  /** Returns the current list of tracked (in-flight) temporary file paths. */
  get tracked(): readonly string[] {
    return [...this.#tempFiles];
  }

  /**
   * Writes `data` to `targetPath` atomically.
   *
   * Creates parent directories when they do not exist (supports mirrored
   * directory output during directory walks).
   */
  write(targetPath: string, data: string): void {
    const tempPath = targetPath + '.tmp';
    const dir = dirname(targetPath);

    this.#fs.mkdirSync(dir, { recursive: true });

    this.#tempFiles.push(tempPath);
    this.#fs.writeFileSync(tempPath, data);
    this.#fs.renameSync(tempPath, targetPath);

    // Successful rename — remove from tracking.
    const idx = this.#tempFiles.indexOf(tempPath);
    if (idx !== -1) this.#tempFiles.splice(idx, 1);
  }

  /** Removes all tracked temporary files (incomplete writes). */
  cleanup(): void {
    for (const tempPath of this.#tempFiles) {
      this.#fs.rmSync(tempPath, { force: true });
    }
    this.#tempFiles.length = 0;
  }
}
