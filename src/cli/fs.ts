import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';

/** Minimal stat result for CLI input classification. */
export interface StatResult {
  isFile(): boolean;
  isDirectory(): boolean;
}

/** Minimal filesystem interface for dependency injection in CLI modules. */
export interface FsLike {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readFileSync(path: string, encoding: BufferEncoding): string;
  renameSync(oldPath: string, newPath: string): void;
  rmSync(path: string, options?: { force?: boolean }): void;
  statSync(path: string): StatResult;
  writeFileSync(path: string, data: string): void;
}

/** Default filesystem implementation backed by `node:fs`. */
export const nodeFs: FsLike = {
  existsSync,

  mkdirSync(path: string, options?: { recursive?: boolean }) {
    mkdirSync(path, options);
  },

  /* v8 ignore next 3 -- @preserve trivial node:fs passthrough */
  readFileSync(path: string, encoding: BufferEncoding): string {
    return readFileSync(path, encoding);
  },

  renameSync,

  /* v8 ignore next 3 -- @preserve trivial node:fs passthrough */
  rmSync(path: string, options?: { force?: boolean }) {
    rmSync(path, options);
  },

  statSync(path: string): StatResult {
    return statSync(path);
  },

  writeFileSync(path: string, data: string) {
    writeFileSync(path, data);
  },
};
