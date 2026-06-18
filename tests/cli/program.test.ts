import { describe, expect, it } from 'vitest';

import { CommanderError } from 'commander';

import {
  buildProgram,
  formatCommanderError,
  getFormat,
  getIndexName,
  parseArgs,
} from '../../src/cli/program.js';

describe('parseArgs', () => {
  describe('defaults', () => {
    it('returns default options for a bare input path', () => {
      const result = parseArgs(['data/world']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.options).toMatchObject({
        input: 'data/world',
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
      });
    });
  });

  describe('output options', () => {
    it('accepts -O for output directory', () => {
      const result = parseArgs(['-O', 'out', 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.outputDirectory).toBe('out');
    });

    it('accepts --output-directory', () => {
      const result = parseArgs(['--output-directory', '/tmp/out', 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.outputDirectory).toBe('/tmp/out');
    });

    it.each(['json', 'yaml', 'toml'] as const)('accepts -f %s', (fmt) => {
      const result = parseArgs(['-f', fmt, 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.format).toBe(fmt);
    });

    it('rejects invalid format', () => {
      const result = parseArgs(['-f', 'xml', 'input.zon']);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain('xml');
    });
  });

  describe('logging options', () => {
    it('sets debug level with -v', () => {
      const result = parseArgs(['-v', 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.minLogLevel).toBe('debug');
    });

    it('sets quiet mode with -q', () => {
      const result = parseArgs(['-q', 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.quiet).toBe(true);
    });

    it('sets explicit level with -l', () => {
      const result = parseArgs(['-l', 'warn', 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.minLogLevel).toBe('warn');
    });

    it('rejects invalid log level', () => {
      const result = parseArgs(['-l', 'trace', 'input.zon']);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain('trace');
    });

    it('disables color with --no-color', () => {
      const result = parseArgs(['--no-color', 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.color).toBe(false);
    });
  });

  describe('mutual exclusion: log flags', () => {
    it('rejects -q and -v together', () => {
      const result = parseArgs(['-q', '-v', 'input.zon']);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain('mutually exclusive');
    });

    it('rejects -q and -l together', () => {
      const result = parseArgs(['-q', '-l', 'debug', 'input.zon']);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.exitCode).toBe(2);
    });

    it('rejects -v and -l together', () => {
      const result = parseArgs(['-v', '-l', 'error', 'input.zon']);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.exitCode).toBe(2);
    });

    it('rejects all three together', () => {
      const result = parseArgs(['-q', '-v', '-l', 'info', 'input.zon']);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.exitCode).toBe(2);
    });
  });

  describe('mutual exclusion: clobber flags', () => {
    it('rejects --skip-if-exists and --overwrite together', () => {
      const result = parseArgs(['--skip-if-exists', '--overwrite', 'input.zon']);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.exitCode).toBe(2);
      expect(result.message).toContain('mutually exclusive');
    });

    it('accepts --overwrite alone', () => {
      const result = parseArgs(['--overwrite', 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.overwrite).toBe(true);
      expect(result.options.skipIfExists).toBe(false);
    });

    it('accepts --skip-if-exists alone', () => {
      const result = parseArgs(['--skip-if-exists', 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.skipIfExists).toBe(true);
      expect(result.options.overwrite).toBe(false);
    });
  });

  describe('stop behavior', () => {
    it('defaults stopOnError to true', () => {
      const result = parseArgs(['input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.stopOnError).toBe(true);
    });

    it('sets stopOnError false with --no-stop-on-error', () => {
      const result = parseArgs(['--no-stop-on-error', 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.stopOnError).toBe(false);
    });

    it('sets stopOnWarning true with --stop-on-warning', () => {
      const result = parseArgs(['--stop-on-warning', 'input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.stopOnWarning).toBe(true);
    });
  });

  describe('index name', () => {
    it('defaults to index', () => {
      const result = parseArgs(['input.zon']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.indexName).toBe('index');
    });

    it('accepts --index-name override', () => {
      const result = parseArgs(['--index-name', 'index.mini', 'data/world']);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.options.indexName).toBe('index.mini');
    });
  });

  describe('help and version', () => {
    it('returns exit code 0 for --help', () => {
      const result = parseArgs(['--help']);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.exitCode).toBe(0);
      expect(result.message).toContain('circlemud-parser');
    });

    it('returns exit code 0 for --version', () => {
      const result = parseArgs(['--version']);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.exitCode).toBe(0);
    });
  });

  describe('missing input', () => {
    it('returns exit code 2 when no arguments are given', () => {
      const result = parseArgs([]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.exitCode).toBe(2);
    });
  });
});

describe('buildProgram', () => {
  it('returns a configured Command without a write callback', () => {
    const program = buildProgram();
    expect(program.name()).toBe('circlemud-parser');
  });
});

describe('formatCommanderError', () => {
  it('prefers captured output when present', () => {
    const err = new CommanderError(1, 'code', 'fallback');
    expect(formatCommanderError(err, 'help text')).toBe('help text');
  });

  it('falls back to err.message when captured is empty', () => {
    const err = new CommanderError(1, 'code', 'fallback');
    expect(formatCommanderError(err, '')).toBe('fallback');
  });
});

describe('getFormat', () => {
  it('returns the string value when format is a string', () => {
    expect(getFormat({ format: 'yaml' })).toBe('yaml');
  });

  it('falls back to "json" when format is undefined', () => {
    expect(getFormat({})).toBe('json');
  });

  it('falls back to "json" when format is a non-string value', () => {
    expect(getFormat({ format: 42 })).toBe('json');
  });
});

describe('getIndexName', () => {
  it('returns the string value when indexName is a string', () => {
    expect(getIndexName({ indexName: 'index.mini' })).toBe('index.mini');
  });

  it('falls back to "index" when indexName is undefined', () => {
    expect(getIndexName({})).toBe('index');
  });

  it('falls back to "index" when indexName is a non-string value', () => {
    expect(getIndexName({ indexName: 42 })).toBe('index');
  });
});

// ---------------------------------------------------------------------------
// SQL-specific option validation
// ---------------------------------------------------------------------------

describe('parseArgs — sql format and related options', () => {
  it('accepts -f sql with -O and produces defaults', () => {
    const result = parseArgs(['-O', 'migrations', '-f', 'sql', 'data/world']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options.format).toBe('sql');
    expect(result.options.startNumber).toBe(9000);
    expect(result.options.emitCreateTables).toBeUndefined();
  });

  it('accepts --start-number with -f sql', () => {
    const result = parseArgs([
      '-O',
      'migrations',
      '-f',
      'sql',
      '--start-number',
      '1000',
      'data/world',
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options.startNumber).toBe(1000);
  });

  it('accepts --start-number=0', () => {
    const result = parseArgs(['-O', 'migrations', '-f', 'sql', '--start-number=0', 'data/world']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options.startNumber).toBe(0);
  });

  it('accepts --emit-create-tables with -f sql', () => {
    const result = parseArgs([
      '-O',
      'migrations',
      '-f',
      'sql',
      '--emit-create-tables',
      '0001_world.sql',
      'data/world',
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options.emitCreateTables).toBe('0001_world.sql');
  });

  it('rejects -f sql without -O (output directory required)', () => {
    const result = parseArgs(['-f', 'sql', 'data/world']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('--output-directory');
  });

  it('rejects --start-number with non-sql format', () => {
    const result = parseArgs(['-f', 'json', '--start-number', '1000', 'data/world']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('--start-number');
  });

  it('rejects --emit-create-tables with non-sql format', () => {
    const result = parseArgs(['-f', 'json', '--emit-create-tables', 'schema.sql', 'data/world']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('--emit-create-tables');
  });

  it('rejects --start-number with a negative value', () => {
    const result = parseArgs(['-O', 'migrations', '-f', 'sql', '--start-number=-1', 'data/world']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('non-negative integer');
  });

  it('rejects --start-number with a non-integer value', () => {
    const result = parseArgs(['-O', 'migrations', '-f', 'sql', '--start-number=3.5', 'data/world']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('non-negative integer');
  });

  it('rejects --start-number with a non-numeric string', () => {
    const result = parseArgs(['-O', 'migrations', '-f', 'sql', '--start-number=abc', 'data/world']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('non-negative integer');
  });

  it('rejects --emit-create-tables with a path separator in the value', () => {
    const result = parseArgs([
      '-O',
      'migrations',
      '-f',
      'sql',
      '--emit-create-tables=sub/schema.sql',
      'data/world',
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('path separators');
  });

  it('rejects --emit-create-tables with a backslash separator', () => {
    const result = parseArgs([
      '-O',
      'migrations',
      '-f',
      'sql',
      '--emit-create-tables=sub\\schema.sql',
      'data/world',
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('path separators');
  });

  it('startNumber defaults to 9000 when not provided', () => {
    const result = parseArgs(['-O', 'out', '-f', 'sql', 'data/world']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options.startNumber).toBe(9000);
  });

  it('emitCreateTables defaults to undefined when not provided', () => {
    const result = parseArgs(['-O', 'out', '-f', 'sql', 'data/world']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.options.emitCreateTables).toBeUndefined();
  });
});
