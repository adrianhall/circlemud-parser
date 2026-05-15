import { describe, expect, it } from 'vitest';

import { vi } from 'vitest';

import { CliLogger, defaultSink, toLibraryLogger } from '../../src/cli/logger.js';

/** Collects log lines for assertions. */
function recordingSink(): { lines: string[]; sink: (line: string) => void } {
  const lines: string[] = [];
  return { lines, sink: (line: string) => lines.push(line) };
}

describe('CliLogger', () => {
  it('outputs all levels when minLogLevel is debug', () => {
    const { lines, sink } = recordingSink();
    const logger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('[debug]');
    expect(lines[1]).toContain('[info]');
    expect(lines[2]).toContain('[warn]');
    expect(lines[3]).toContain('[error]');
  });

  it('filters below minLogLevel', () => {
    const { lines, sink } = recordingSink();
    const logger = new CliLogger({ minLogLevel: 'warn', quiet: false, color: false, sink });

    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('visible');
    logger.error('visible');

    expect(lines).toHaveLength(2);
  });

  it('suppresses all output when quiet is true', () => {
    const { lines, sink } = recordingSink();
    const logger = new CliLogger({ minLogLevel: 'debug', quiet: true, color: false, sink });

    logger.debug('nope');
    logger.info('nope');
    logger.warn('nope');
    logger.error('nope');

    expect(lines).toHaveLength(0);
  });

  it('includes source location when context has file and line', () => {
    const { lines, sink } = recordingSink();
    const logger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });

    logger.info('parsed', { source: { fileName: 'test.zon', startLine: 42 } });

    expect(lines[0]).toContain('<test.zon#42>');
    expect(lines[0]).toContain('parsed');
  });

  it('includes only file name when startLine is absent', () => {
    const { lines, sink } = recordingSink();
    const logger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });

    logger.warn('oops', { source: { fileName: 'data.wld' } });

    expect(lines[0]).toContain('<data.wld>');
  });

  it('includes only line number when fileName is absent', () => {
    const { lines, sink } = recordingSink();
    const logger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });

    logger.error('bad line', { source: { startLine: 7 } });

    expect(lines[0]).toContain('<#7>');
  });

  it('omits location when no context is provided', () => {
    const { lines, sink } = recordingSink();
    const logger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });

    logger.info('hello');

    expect(lines[0]).toBe('[info] hello');
  });

  it('applies color when enabled', () => {
    const { lines, sink } = recordingSink();
    const logger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: true, sink });

    logger.error('fail');

    // Colored output contains ANSI escape codes.
    expect(lines[0]).not.toBe('[error] fail');
    expect(lines[0]).toContain('fail');
  });
});

describe('toLibraryLogger', () => {
  it('forwards string messages to the CliLogger', () => {
    const { lines, sink } = recordingSink();
    const cliLogger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });
    const libLogger = toLibraryLogger(cliLogger);

    libLogger.debug('d');
    libLogger.info('i');
    libLogger.warn('w');
    libLogger.error('e');

    expect(lines).toHaveLength(4);
  });

  it('ignores undefined messages for all methods', () => {
    const { lines, sink } = recordingSink();
    const cliLogger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });
    const libLogger = toLibraryLogger(cliLogger);

    libLogger.debug();
    libLogger.info();
    libLogger.warn();
    libLogger.error();

    expect(lines).toHaveLength(0);
  });

  it('converts Error messages to their .message', () => {
    const { lines, sink } = recordingSink();
    const cliLogger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });
    const libLogger = toLibraryLogger(cliLogger);

    libLogger.error(new Error('oops'));

    expect(lines[0]).toContain('oops');
  });

  it('converts numeric messages', () => {
    const { lines, sink } = recordingSink();
    const cliLogger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });
    const libLogger = toLibraryLogger(cliLogger);

    libLogger.info(42);

    expect(lines[0]).toContain('42');
  });

  it('converts boolean messages', () => {
    const { lines, sink } = recordingSink();
    const cliLogger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });
    const libLogger = toLibraryLogger(cliLogger);

    libLogger.info(true);

    expect(lines[0]).toContain('true');
  });

  it('JSON-stringifies object messages', () => {
    const { lines, sink } = recordingSink();
    const cliLogger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });
    const libLogger = toLibraryLogger(cliLogger);

    libLogger.warn({ key: 'value' });

    expect(lines[0]).toContain('{"key":"value"}');
  });
});

describe('CliLogger edge cases', () => {
  it('returns empty location when source has no fileName or startLine', () => {
    const { lines, sink } = recordingSink();
    const logger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false, sink });

    logger.info('msg', { source: {} });

    // No location tag, just [info] msg
    expect(lines[0]).toBe('[info] msg');
  });
});

describe('defaultSink', () => {
  it('writes to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      defaultSink('hello');
      expect(spy).toHaveBeenCalledWith('hello');
    } finally {
      spy.mockRestore();
    }
  });

  it('is used when no sink option is provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const logger = new CliLogger({ minLogLevel: 'debug', quiet: false, color: false });
      logger.info('test');
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
