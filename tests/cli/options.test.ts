import { describe, expect, it } from 'vitest';

import {
  isLevelEnabled,
  isLogLevel,
  isOutputFormat,
  VALID_FORMATS,
  VALID_LOG_LEVELS,
} from '../../src/cli/options.js';

describe('isLevelEnabled', () => {
  it('passes same level', () => {
    expect(isLevelEnabled('info', 'info')).toBe(true);
  });

  it('passes higher severity', () => {
    expect(isLevelEnabled('error', 'debug')).toBe(true);
    expect(isLevelEnabled('warn', 'info')).toBe(true);
  });

  it('rejects lower severity', () => {
    expect(isLevelEnabled('debug', 'info')).toBe(false);
    expect(isLevelEnabled('info', 'warn')).toBe(false);
  });

  it('debug passes when min is debug', () => {
    expect(isLevelEnabled('debug', 'debug')).toBe(true);
  });

  it('error always passes', () => {
    for (const min of VALID_LOG_LEVELS) {
      expect(isLevelEnabled('error', min)).toBe(true);
    }
  });
});

describe('isLogLevel', () => {
  it.each(VALID_LOG_LEVELS)('accepts valid level "%s"', (level) => {
    expect(isLogLevel(level)).toBe(true);
  });

  it.each(['verbose', 'trace', 'WARN', '', 'none'])('rejects invalid level "%s"', (value) => {
    expect(isLogLevel(value)).toBe(false);
  });
});

describe('isOutputFormat', () => {
  it.each(VALID_FORMATS)('accepts valid format "%s"', (format) => {
    expect(isOutputFormat(format)).toBe(true);
  });

  it.each(['xml', 'csv', 'JSON', '', 'text'])('rejects invalid format "%s"', (value) => {
    expect(isOutputFormat(value)).toBe(false);
  });
});
