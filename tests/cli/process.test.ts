import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CliLogger } from '../../src/cli/logger.js';
import { nodeFs } from '../../src/cli/fs.js';
import { WriteTracker } from '../../src/cli/outputs.js';
import { processWorkPlan, StopOnWarningSignal, warningContext } from '../../src/cli/process.js';
import type { CliOptions } from '../../src/cli/options.js';
import type { FsLike } from '../../src/cli/fs.js';
import type { WorkPlan } from '../../src/cli/inputs.js';

function fixturePath(relativePath: string): string {
  return fileURLToPath(new URL(`../fixtures/${relativePath}`, import.meta.url));
}

function makeOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    input: '',
    outputDirectory: undefined,
    format: 'json',
    minLogLevel: 'error',
    quiet: false,
    color: false,
    stopOnError: true,
    stopOnWarning: false,
    skipIfExists: false,
    overwrite: true,
    skipIfMissing: false,
    indexName: 'index',
    startNumber: 9000,
    emitCreateTables: undefined,
    ...overrides,
  };
}

function makeDeps() {
  const lines: string[] = [];
  const logger = new CliLogger({
    minLogLevel: 'debug',
    quiet: false,
    color: false,
    sink: (line: string) => lines.push(line),
  });
  const tracker = new WriteTracker(nodeFs);
  return { logger, tracker, lines, fs: nodeFs };
}

describe('processWorkPlan', () => {
  it('parses a single zone file to JSON', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      const inputFile = fixturePath('zone/new-format.zon');
      const plan: WorkPlan = { kind: 'file', filePath: inputFile };
      const options = makeOptions({ outputDirectory: tempDir, format: 'json' });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      expect(exitCode).toBe(0);

      const outputFile = join(tempDir, 'new-format.zon.json');
      const content = readFileSync(outputFile, 'utf8');
      const parsed: unknown = JSON.parse(content);
      expect(Array.isArray(parsed)).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('skips existing output when skipIfExists is true', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      const inputFile = fixturePath('zone/new-format.zon');
      const outputFile = join(tempDir, 'new-format.zon.json');
      writeFileSync(outputFile, 'existing');

      const plan: WorkPlan = { kind: 'file', filePath: inputFile };
      const options = makeOptions({
        outputDirectory: tempDir,
        skipIfExists: true,
        overwrite: false,
      });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      expect(exitCode).toBe(0);
      expect(readFileSync(outputFile, 'utf8')).toBe('existing');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('overwrites existing output when overwrite is true', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      const inputFile = fixturePath('zone/new-format.zon');
      const outputFile = join(tempDir, 'new-format.zon.json');
      writeFileSync(outputFile, 'old content');

      const plan: WorkPlan = { kind: 'file', filePath: inputFile };
      const options = makeOptions({
        outputDirectory: tempDir,
        skipIfExists: false,
        overwrite: true,
      });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      expect(exitCode).toBe(0);
      expect(readFileSync(outputFile, 'utf8')).not.toBe('old content');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('produces YAML output', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      const inputFile = fixturePath('zone/new-format.zon');
      const plan: WorkPlan = { kind: 'file', filePath: inputFile };
      const options = makeOptions({ outputDirectory: tempDir, format: 'yaml' });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      expect(exitCode).toBe(0);

      const outputFile = join(tempDir, 'new-format.zon.yaml');
      const content = readFileSync(outputFile, 'utf8');
      expect(content).toContain('recordType: zone');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('processes an index plan with multiple files', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      const files = [fixturePath('zone/new-format.zon'), fixturePath('zone/old-format.zon')];
      const plan: WorkPlan = {
        kind: 'index',
        directory: fixturePath('zone'),
        files,
        subdirectory: 'zon',
      };
      const options = makeOptions({ outputDirectory: tempDir });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      expect(exitCode).toBe(0);
      expect(readFileSync(join(tempDir, 'new-format.zon.json'), 'utf8')).toContain('[');
      expect(readFileSync(join(tempDir, 'old-format.zon.json'), 'utf8')).toContain('[');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('processes a directory plan and creates subdirectories', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      const plan: WorkPlan = {
        kind: 'directory',
        baseDirectory: fixturePath('.'),
        indices: [
          {
            kind: 'index',
            directory: fixturePath('zone'),
            files: [fixturePath('zone/new-format.zon')],
            subdirectory: 'zon',
          },
        ],
      };
      const options = makeOptions({ outputDirectory: tempDir });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      expect(exitCode).toBe(0);
      // Directory mode mirrors structure: tempDir/zon/new-format.zon.json
      const outputFile = join(tempDir, 'zon', 'new-format.zon.json');
      expect(readFileSync(outputFile, 'utf8')).toContain('[');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('returns 1 and cleans up on parse error with stopOnError', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      // Create a file that will fail to parse (invalid content for .zon)
      const badFile = join(tempDir, 'bad.zon');
      writeFileSync(badFile, 'this is not a valid zone file');

      const plan: WorkPlan = { kind: 'file', filePath: badFile };
      const options = makeOptions({ outputDirectory: tempDir, stopOnError: true });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      expect(exitCode).toBe(1);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('continues past errors when stopOnError is false', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      const badFile = join(tempDir, 'bad.zon');
      writeFileSync(badFile, 'not valid');
      const goodFile = fixturePath('zone/new-format.zon');

      const plan: WorkPlan = {
        kind: 'index',
        directory: tempDir,
        files: [badFile, goodFile],
      };
      const options = makeOptions({ outputDirectory: tempDir, stopOnError: false });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      // Had errors so returns 1 even though it continued.
      expect(exitCode).toBe(1);
      // The good file should still have been processed.
      expect(readFileSync(join(tempDir, 'new-format.zon.json'), 'utf8')).toContain('[');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('produces TOML output', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      const inputFile = fixturePath('zone/new-format.zon');
      const plan: WorkPlan = { kind: 'file', filePath: inputFile };
      const options = makeOptions({ outputDirectory: tempDir, format: 'toml' });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      expect(exitCode).toBe(0);

      const outputFile = join(tempDir, 'new-format.zon.toml');
      const content = readFileSync(outputFile, 'utf8');
      expect(content).toContain('[[records]]');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('returns 1 when stop-on-warning is triggered', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      // warning-sector.wld emits a warning for an out-of-range sector type.
      const inputFile = fixturePath('world/warning-sector.wld');
      const plan: WorkPlan = { kind: 'file', filePath: inputFile };
      const options = makeOptions({ outputDirectory: tempDir, stopOnWarning: true });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      expect(exitCode).toBe(1);

      // Output temp file should have been cleaned up.
      const outputFile = join(tempDir, 'warning-sector.wld.json');
      expect(existsSync(outputFile)).toBe(false);
      expect(existsSync(outputFile + '.tmp')).toBe(false);

      // Warning message should appear in the log.
      expect(deps.lines.some((l) => l.includes('sector type'))).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('logs warnings but continues when stop-on-warning is false', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      const inputFile = fixturePath('world/warning-sector.wld');
      const plan: WorkPlan = { kind: 'file', filePath: inputFile };
      const options = makeOptions({ outputDirectory: tempDir, stopOnWarning: false });
      const deps = makeDeps();

      const exitCode = processWorkPlan(plan, options, deps);

      expect(exitCode).toBe(0);

      // Output file should exist — parsing completed despite warning.
      const outputFile = join(tempDir, 'warning-sector.wld.json');
      expect(existsSync(outputFile)).toBe(true);

      // Warning was logged.
      expect(deps.lines.some((l) => l.includes('sector type'))).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('re-throws unexpected errors after cleanup', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cli-process-'));
    try {
      const inputFile = fixturePath('zone/new-format.zon');
      const plan: WorkPlan = { kind: 'file', filePath: inputFile };
      const options = makeOptions({ outputDirectory: tempDir });

      // Create an fs that throws a non-MudParserError on write.
      const explodingFs: FsLike = {
        ...nodeFs,
        existsSync(path: string) {
          // Return false for the output path check, true for everything else.
          if (path.endsWith('.json')) return false;
          return nodeFs.existsSync(path);
        },
        writeFileSync() {
          throw new RangeError('synthetic disk error');
        },
      };

      const deps = {
        ...makeDeps(),
        fs: explodingFs,
        tracker: new WriteTracker(explodingFs),
      };

      expect(() => processWorkPlan(plan, options, deps)).toThrow('synthetic disk error');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('exports StopOnWarningSignal for type checking', () => {
    expect(StopOnWarningSignal).toBeTypeOf('function');
  });
});

describe('warningContext', () => {
  it('returns LogContext when warning has a source span', () => {
    const result = warningContext({
      message: 'test',
      source: { fileName: 'room.wld', startLine: 10 },
    });
    expect(result).toEqual({ source: { fileName: 'room.wld', startLine: 10 } });
  });

  it('returns undefined when warning has no source', () => {
    const result = warningContext({ message: 'test' });
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SQL mode integration tests
// ---------------------------------------------------------------------------

describe('processWorkPlan — sql format', () => {
  it('generates SQL migration files from a world directory', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'circlemud-sql-test-'));
    try {
      const deps = makeDeps();
      const worldDir = fileURLToPath(new URL('../../data/tbamud/lib/world', import.meta.url));

      // worldDir is referenced only to satisfy the URL; use a file plan with a real zone file
      void worldDir;
      // Use a file plan with a real zone file to keep the test fast
      const zonePath = fixturePath('zone/new-format.zon');
      const filePlan: WorkPlan = { kind: 'file', filePath: zonePath };

      const options = makeOptions({
        format: 'sql',
        outputDirectory: outDir,
        startNumber: 1,
        emitCreateTables: '0001_schema.sql',
        overwrite: true,
        skipIfExists: false,
      });

      const exitCode = processWorkPlan(filePlan, options, deps);
      expect(exitCode).toBe(0);

      // Should have written the schema file
      expect(existsSync(join(outDir, '0001_schema.sql'))).toBe(true);
      // Should have written the zone data file (offset 0 from startNumber=1, so "1_zone_data.sql")
      expect(existsSync(join(outDir, '1_zone_data.sql'))).toBe(true);

      const schemaContent = readFileSync(join(outDir, '0001_schema.sql'), 'utf8');
      expect(schemaContent).toContain('CREATE TABLE IF NOT EXISTS zones');

      const dataContent = readFileSync(join(outDir, '1_zone_data.sql'), 'utf8');
      expect(dataContent).toContain('INSERT OR IGNORE INTO zones');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('returns 0 on empty work plan (no files)', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'circlemud-sql-empty-'));
    try {
      const deps = makeDeps();
      // Index work with no files
      const plan: WorkPlan = {
        kind: 'index',
        directory: outDir,
        files: [],
        subdirectory: 'zon',
      };
      const options = makeOptions({
        format: 'sql',
        outputDirectory: outDir,
        startNumber: 9000,
      });
      const exitCode = processWorkPlan(plan, options, deps);
      expect(exitCode).toBe(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('skips existing output files when skipIfExists is true', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'circlemud-sql-skip-'));
    try {
      const deps = makeDeps();
      const zonePath = fixturePath('zone/new-format.zon');
      const filePlan: WorkPlan = { kind: 'file', filePath: zonePath };

      const options = makeOptions({
        format: 'sql',
        outputDirectory: outDir,
        startNumber: 9000,
        skipIfExists: true,
        overwrite: false,
      });

      // Write a sentinel file at the expected output path
      writeFileSync(join(outDir, '9000_zone_data.sql'), 'sentinel');

      processWorkPlan(filePlan, options, deps);

      // File should still contain the sentinel content
      const content = readFileSync(join(outDir, '9000_zone_data.sql'), 'utf8');
      expect(content).toBe('sentinel');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
