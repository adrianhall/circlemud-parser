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
