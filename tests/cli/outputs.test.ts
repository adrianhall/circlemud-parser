import { describe, expect, it } from 'vitest';

import { resolveOutputPath, WriteTracker } from '../../src/cli/outputs.js';
import type { FsLike } from '../../src/cli/fs.js';
import type { WorkPlan } from '../../src/cli/inputs.js';

describe('resolveOutputPath', () => {
  const filePlan: WorkPlan = { kind: 'file', filePath: '/data/30.zon' };
  const indexPlan: WorkPlan = {
    kind: 'index',
    directory: '/data/zon',
    files: ['/data/zon/30.zon'],
  };
  const dirPlan: WorkPlan = {
    kind: 'directory',
    baseDirectory: '/world',
    indices: [],
  };

  it('places output alongside input by default (file plan)', () => {
    const path = resolveOutputPath(
      '/data/30.zon',
      { format: 'json', outputDirectory: undefined },
      filePlan,
    );
    expect(path).toBe('/data/30.zon.json');
  });

  it('uses output directory when set (file plan)', () => {
    const path = resolveOutputPath(
      '/data/30.zon',
      { format: 'json', outputDirectory: '/out' },
      filePlan,
    );
    expect(path).toBe('/out/30.zon.json');
  });

  it('uses yaml extension for yaml format', () => {
    const path = resolveOutputPath(
      '/data/30.zon',
      { format: 'yaml', outputDirectory: '/out' },
      filePlan,
    );
    expect(path).toBe('/out/30.zon.yaml');
  });

  it('uses toml extension for toml format', () => {
    const path = resolveOutputPath(
      '/data/30.zon',
      { format: 'toml', outputDirectory: '/out' },
      filePlan,
    );
    expect(path).toBe('/out/30.zon.toml');
  });

  it('flattens index mode output into output directory', () => {
    const path = resolveOutputPath(
      '/data/zon/30.zon',
      { format: 'json', outputDirectory: '/out' },
      indexPlan,
    );
    expect(path).toBe('/out/30.zon.json');
  });

  it('mirrors directory structure for directory plan', () => {
    const path = resolveOutputPath(
      '/world/zon/30.zon',
      { format: 'json', outputDirectory: '/out' },
      dirPlan,
      'zon',
    );
    expect(path).toBe('/out/zon/30.zon.json');
  });

  it('does not mirror when no subdirectory', () => {
    const path = resolveOutputPath(
      '/world/30.zon',
      { format: 'json', outputDirectory: '/out' },
      dirPlan,
    );
    expect(path).toBe('/out/30.zon.json');
  });
});

describe('WriteTracker', () => {
  function mockFs(): FsLike & {
    written: Record<string, string>;
    renamed: [string, string][];
    removed: string[];
    createdDirs: string[];
  } {
    const state = {
      written: {} as Record<string, string>,
      renamed: [] as [string, string][],
      removed: [] as string[],
      createdDirs: [] as string[],
    };

    return {
      ...state,
      existsSync: () => false,
      mkdirSync(path: string) {
        state.createdDirs.push(path);
      },
      readFileSync() {
        return '';
      },
      renameSync(from: string, to: string) {
        state.renamed.push([from, to]);
      },
      rmSync(path: string) {
        state.removed.push(path);
      },
      statSync() {
        return { isFile: () => true, isDirectory: () => false };
      },
      writeFileSync(path: string, data: string) {
        state.written[path] = data;
      },
    };
  }

  it('writes to a temp file and renames', () => {
    const fs = mockFs();
    const tracker = new WriteTracker(fs);

    tracker.write('/out/30.zon.json', '[]');

    expect(fs.written['/out/30.zon.json.tmp']).toBe('[]');
    expect(fs.renamed).toEqual([['/out/30.zon.json.tmp', '/out/30.zon.json']]);
    expect(tracker.tracked).toHaveLength(0);
  });

  it('creates parent directories', () => {
    const fs = mockFs();
    const tracker = new WriteTracker(fs);

    tracker.write('/out/zon/30.zon.json', '[]');

    expect(fs.createdDirs).toContain('/out/zon');
  });

  it('tracks temp files until rename succeeds', () => {
    const fs = mockFs();
    fs.renameSync = () => {
      throw new Error('disk full');
    };
    const tracker = new WriteTracker(fs);

    expect(() => tracker.write('/out/data.json', '{}')).toThrow('disk full');
    expect(tracker.tracked).toEqual(['/out/data.json.tmp']);
  });

  it('cleanup removes tracked temp files', () => {
    const fs = mockFs();
    fs.renameSync = () => {
      throw new Error('fail');
    };
    const tracker = new WriteTracker(fs);

    try {
      tracker.write('/out/a.json', '1');
    } catch {
      // expected
    }

    tracker.cleanup();

    expect(fs.removed).toContain('/out/a.json.tmp');
    expect(tracker.tracked).toHaveLength(0);
  });
});
