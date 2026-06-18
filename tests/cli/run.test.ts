import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { nodeFs } from '../../src/cli/fs.js';
import { logMessageIfAvailable, runCli } from '../../src/cli/run.js';

function fixturePath(relativePath: string): string {
  return fileURLToPath(new URL(`../fixtures/${relativePath}`, import.meta.url));
}

function collectingSink(): { lines: string[]; sink: (line: string) => void } {
  const lines: string[] = [];
  return { lines, sink: (line: string) => lines.push(line) };
}

describe('runCli', () => {
  it('returns 0 for --help', () => {
    const { lines, sink } = collectingSink();
    const code = runCli(['--help'], { fs: nodeFs, sink });

    expect(code).toBe(0);
    expect(lines.join('')).toContain('circlemud-parser');
  });

  it('returns 0 for --version', () => {
    const { lines, sink } = collectingSink();
    const code = runCli(['--version'], { fs: nodeFs, sink });

    expect(code).toBe(0);
    expect(lines.join('')).toMatch(/\d+\.\d+\.\d+/);
  });

  it('returns 2 when no arguments are given', () => {
    const { sink } = collectingSink();
    const code = runCli([], { fs: nodeFs, sink });

    expect(code).toBe(2);
  });

  it('returns 2 for conflicting log flags', () => {
    const { lines, sink } = collectingSink();
    const code = runCli(['-q', '-v', 'input.zon'], { fs: nodeFs, sink });

    expect(code).toBe(2);
    expect(lines.join('')).toContain('mutually exclusive');
  });

  it('returns 2 for conflicting clobber flags', () => {
    const { lines, sink } = collectingSink();
    const code = runCli(['--skip-if-exists', '--overwrite', 'input.zon'], { fs: nodeFs, sink });

    expect(code).toBe(2);
    expect(lines.join('')).toContain('mutually exclusive');
  });

  it('returns 1 when input path does not exist', () => {
    const { sink } = collectingSink();
    const code = runCli(['/nonexistent/path.zon'], { fs: nodeFs, sink });

    expect(code).toBe(1);
  });

  it('converts a single fixture file to JSON', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-run-'));
    try {
      const input = fixturePath('zone/new-format.zon');
      const { sink } = collectingSink();
      const code = runCli(['-O', tempDir, '--overwrite', '-q', input], { fs: nodeFs, sink });

      expect(code).toBe(0);

      const outputFile = join(tempDir, 'new-format.zon.json');
      const content = readFileSync(outputFile, 'utf8');
      const parsed: unknown = JSON.parse(content);
      expect(Array.isArray(parsed)).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('returns 1 with stop-on-warning for a warning-producing file', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-run-'));
    try {
      const input = fixturePath('world/warning-sector.wld');
      const { lines, sink } = collectingSink();
      const code = runCli(['-O', tempDir, '--overwrite', '--stop-on-warning', input], {
        fs: nodeFs,
        sink,
      });

      expect(code).toBe(1);
      expect(lines.some((l) => l.includes('sector type'))).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('converts a fixture file to YAML', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-run-'));
    try {
      const input = fixturePath('zone/new-format.zon');
      const { sink } = collectingSink();
      const code = runCli(['-O', tempDir, '-f', 'yaml', '--overwrite', '-q', input], {
        fs: nodeFs,
        sink,
      });

      expect(code).toBe(0);

      const outputFile = join(tempDir, 'new-format.zon.yaml');
      const content = readFileSync(outputFile, 'utf8');
      expect(content).toContain('recordType: zone');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

describe('logMessageIfAvailable', () => {
  it('writes message to sink when result is a failure with a message', () => {
    const { lines, sink } = collectingSink();
    const deps = { fs: nodeFs, sink };

    logMessageIfAvailable({ ok: false, exitCode: 2, message: 'bad input' }, deps);

    expect(lines).toEqual(['bad input']);
  });

  it('writes nothing when result is a failure with an empty message', () => {
    const { lines, sink } = collectingSink();
    const deps = { fs: nodeFs, sink };

    logMessageIfAvailable({ ok: false, exitCode: 0, message: '' }, deps);

    expect(lines).toHaveLength(0);
  });

  it('writes nothing when result is ok', () => {
    const { lines, sink } = collectingSink();
    const deps = { fs: nodeFs, sink };

    logMessageIfAvailable(
      {
        ok: true,
        options: {
          input: 'x',
          outputDirectory: undefined,
          format: 'json',
          minLogLevel: 'info',
          quiet: false,
          color: true,
          stopOnError: true,
          stopOnWarning: false,
          skipIfExists: true,
          overwrite: false,
          skipIfMissing: true,
          indexName: 'index',
          startNumber: 9000,
          emitCreateTables: undefined,
        },
      },
      deps,
    );

    expect(lines).toHaveLength(0);
  });
});
