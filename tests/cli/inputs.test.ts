import { describe, expect, it } from 'vitest';

import { resolveInputs } from '../../src/cli/inputs.js';
import type { FsLike, StatResult } from '../../src/cli/fs.js';

/** Creates a minimal mock filesystem from a map of path → content or stat type. */
function mockFs(files: Record<string, string>, dirs: string[] = []): FsLike {
  const fileStat: StatResult = { isFile: () => true, isDirectory: () => false };
  const dirStat: StatResult = { isFile: () => false, isDirectory: () => true };

  return {
    existsSync(path: string) {
      return path in files || dirs.includes(path);
    },
    statSync(path: string) {
      if (dirs.includes(path)) return dirStat;
      if (path in files) return fileStat;
      throw new Error(`ENOENT: ${path}`);
    },
    readFileSync(path: string) {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    mkdirSync() {},
    renameSync() {},
    rmSync() {},
    writeFileSync() {},
  };
}

describe('resolveInputs', () => {
  it('classifies a .zon file as a single file plan', () => {
    const fs = mockFs({ '/data/30.zon': '' });
    const plan = resolveInputs('/data/30.zon', { indexName: 'index', skipIfMissing: false }, fs);

    expect(plan).toEqual({ kind: 'file', filePath: '/data/30.zon' });
  });

  it('classifies a non-MUD-extension file as an index file', () => {
    const fs = mockFs({
      '/data/zon/index': '0.zon\n30.zon\n$\n',
      '/data/zon/0.zon': '',
      '/data/zon/30.zon': '',
    });

    const plan = resolveInputs('/data/zon/index', { indexName: 'index', skipIfMissing: false }, fs);

    expect(plan.kind).toBe('index');
    if (plan.kind !== 'index') return;
    expect(plan.files).toEqual(['/data/zon/0.zon', '/data/zon/30.zon']);
  });

  it('classifies a directory as a directory plan', () => {
    const fs = mockFs(
      {
        '/world/zon/index': '30.zon\n$\n',
        '/world/zon/30.zon': '',
      },
      ['/world', '/world/zon'],
    );

    const plan = resolveInputs('/world', { indexName: 'index', skipIfMissing: false }, fs);

    expect(plan.kind).toBe('directory');
    if (plan.kind !== 'directory') return;
    expect(plan.indices).toHaveLength(1);
    expect(plan.indices[0]?.subdirectory).toBe('zon');
  });

  it('throws when input path does not exist', () => {
    const fs = mockFs({});
    expect(() =>
      resolveInputs('/missing', { indexName: 'index', skipIfMissing: false }, fs),
    ).toThrow('does not exist');
  });

  it('skips missing referenced files when skipIfMissing is true', () => {
    const fs = mockFs({
      '/data/zon/index': '0.zon\nmissing.zon\n30.zon\n$\n',
      '/data/zon/0.zon': '',
      '/data/zon/30.zon': '',
    });

    const plan = resolveInputs('/data/zon/index', { indexName: 'index', skipIfMissing: true }, fs);

    if (plan.kind !== 'index') throw new Error('expected index');
    expect(plan.files).toEqual(['/data/zon/0.zon', '/data/zon/30.zon']);
  });

  it('throws on missing referenced files when skipIfMissing is false', () => {
    const fs = mockFs({
      '/data/zon/index': 'missing.zon\n$\n',
    });

    expect(() =>
      resolveInputs('/data/zon/index', { indexName: 'index', skipIfMissing: false }, fs),
    ).toThrow('Referenced file not found');
  });

  it('uses custom index name from options', () => {
    const fs = mockFs(
      {
        '/world/zon/index.mini': '30.zon\n$\n',
        '/world/zon/30.zon': '',
      },
      ['/world', '/world/zon'],
    );

    const plan = resolveInputs('/world', { indexName: 'index.mini', skipIfMissing: false }, fs);

    expect(plan.kind).toBe('directory');
    if (plan.kind !== 'directory') return;
    expect(plan.indices).toHaveLength(1);
  });

  it('throws when directory has no index files', () => {
    const fs = mockFs({}, ['/empty', '/empty/zon']);

    expect(() => resolveInputs('/empty', { indexName: 'index', skipIfMissing: false }, fs)).toThrow(
      'No index files found',
    );
  });

  it('scans all well-known subdirectories', () => {
    const files: Record<string, string> = {};
    const dirs = ['/world'];
    const expectedSubs: string[] = [];

    for (const sub of ['mob', 'obj', 'qst', 'shp', 'trg', 'wld', 'zon']) {
      dirs.push(`/world/${sub}`);
      files[`/world/${sub}/index`] = `0.${sub}\n$\n`;
      files[`/world/${sub}/0.${sub}`] = '';
      expectedSubs.push(sub);
    }

    const fs = mockFs(files, dirs);
    const plan = resolveInputs('/world', { indexName: 'index', skipIfMissing: false }, fs);

    if (plan.kind !== 'directory') throw new Error('expected directory');
    const subs = plan.indices.map((i) => i.subdirectory);
    expect(subs).toEqual(expectedSubs);
  });
});
