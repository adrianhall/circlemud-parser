import { dirname, join } from 'node:path';

import { inferRecordType } from '../parsers/file.js';
import { parseIndexFile } from './index-file.js';
import type { CliLogger } from './logger.js';
import type { CliOptions } from './options.js';
import type { FsLike } from './fs.js';

/** Well-known world subdirectory names that contain typed data files. */
export const WORLD_SUBDIRECTORIES = ['mob', 'obj', 'qst', 'shp', 'trg', 'wld', 'zon'] as const;

/** A single data file to parse. */
export interface FileWork {
  readonly kind: 'file';
  /** Path to the data file. */
  readonly filePath: string;
}

/** An index file listing data files of a single type in one directory. */
export interface IndexWork {
  readonly kind: 'index';
  /** Directory containing the index file and its referenced data files. */
  readonly directory: string;
  /** Resolved file paths referenced by the index. */
  readonly files: readonly string[];
  /** Subdirectory name when this index is part of a directory walk. */
  readonly subdirectory?: string;
}

/** A full directory walk that processes index files in each world subdirectory. */
export interface DirectoryWork {
  readonly kind: 'directory';
  /** Base directory containing the world subdirectories. */
  readonly baseDirectory: string;
  /** Index work plans for each discovered subdirectory. */
  readonly indices: readonly IndexWork[];
}

/** Discriminated union of input work plans. */
export type WorkPlan = FileWork | IndexWork | DirectoryWork;

/**
 * Resolves the user-supplied input path into a structured work plan.
 *
 * - If the path is a file with a known MUD extension, it is treated as a single data file.
 * - If the path is a file without a known extension, it is treated as an index file.
 * - If the path is a directory, each well-known world subdirectory is scanned for index files.
 *
 * @throws {Error} When the input path does not exist or a referenced file is missing and
 *   `skipIfMissing` is false.
 */
export function resolveInputs(
  input: string,
  options: Pick<CliOptions, 'indexName' | 'skipIfMissing'>,
  fs: FsLike,
  logger?: CliLogger,
): WorkPlan {
  if (!fs.existsSync(input)) {
    throw new Error(`Input path does not exist: ${input}`);
  }

  const stat = fs.statSync(input);

  if (stat.isDirectory()) {
    return resolveDirectory(input, options, fs, logger);
  }

  // File with a known MUD extension → single data file.
  if (inferRecordType(input) !== undefined) {
    return { kind: 'file', filePath: input };
  }

  // Otherwise treat as an index file.
  return resolveIndexFile(input, options, fs, logger);
}

/** Parses an index file and resolves referenced data file paths. */
function resolveIndexFile(
  indexPath: string,
  options: Pick<CliOptions, 'skipIfMissing'>,
  fs: FsLike,
  logger?: CliLogger,
  subdirectory?: string,
): IndexWork {
  const content = fs.readFileSync(indexPath, 'utf8');
  const fileNames = parseIndexFile(content);
  const directory = dirname(indexPath);

  const files: string[] = [];
  for (const name of fileNames) {
    const filePath = join(directory, name);
    if (!fs.existsSync(filePath)) {
      if (options.skipIfMissing) {
        logger?.warn(`Referenced file not found, skipping: ${filePath}`);
        continue;
      }
      throw new Error(`Referenced file not found: ${filePath}`);
    }
    files.push(filePath);
  }

  const work: IndexWork = { kind: 'index', directory, files };
  if (subdirectory !== undefined) {
    return { ...work, subdirectory };
  }
  return work;
}

/** Scans well-known world subdirectories for index files. */
function resolveDirectory(
  dir: string,
  options: Pick<CliOptions, 'indexName' | 'skipIfMissing'>,
  fs: FsLike,
  logger?: CliLogger,
): DirectoryWork {
  const indices: IndexWork[] = [];

  for (const sub of WORLD_SUBDIRECTORIES) {
    const subDir = join(dir, sub);
    if (!fs.existsSync(subDir)) {
      logger?.debug(`Subdirectory not found, skipping: ${subDir}`);
      continue;
    }

    const indexPath = join(subDir, options.indexName);
    if (!fs.existsSync(indexPath)) {
      logger?.debug(`Index file not found, skipping: ${indexPath}`);
      continue;
    }

    indices.push(resolveIndexFile(indexPath, options, fs, logger, sub));
  }

  if (indices.length === 0) {
    throw new Error(`No index files found in world directory: ${dir}`);
  }

  return { kind: 'directory', baseDirectory: dir, indices };
}
