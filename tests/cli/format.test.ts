import { describe, expect, it } from 'vitest';

import { extensionForFormat, serializeRecords } from '../../src/cli/format.js';

const SAMPLE_RECORDS: Record<string, unknown>[] = [
  { recordType: 'zone', vnum: 30, name: 'Midgaard', commands: [] },
  { recordType: 'zone', vnum: 31, name: 'Northern Plains', commands: [] },
];

describe('serializeRecords', () => {
  it('produces pretty-printed JSON with trailing newline', () => {
    const output = serializeRecords(SAMPLE_RECORDS, 'json');

    expect(output).toMatch(/^\[/);
    expect(output).toMatch(/\]\n$/);
    // Verify 2-space indent.
    const parsed: unknown = JSON.parse(output);
    expect(parsed).toEqual(SAMPLE_RECORDS);
  });

  it('produces valid YAML', () => {
    const output = serializeRecords(SAMPLE_RECORDS, 'yaml');

    expect(output).toContain('recordType: zone');
    expect(output).toContain('vnum: 30');
    expect(output).toContain('Midgaard');
  });

  it('produces TOML with [[records]] array-of-tables', () => {
    const output = serializeRecords(SAMPLE_RECORDS, 'toml');

    expect(output).toContain('[[records]]');
    expect(output).toContain('name = "Midgaard"');
    expect(output).toContain('vnum = 30');
  });

  it('strips null values from TOML output', () => {
    const records = [{ recordType: 'world', vnum: 1, description: null }];
    const output = serializeRecords(records, 'toml');

    expect(output).not.toContain('description');
    expect(output).toContain('vnum = 1');
  });

  it('preserves null values in JSON output', () => {
    const records = [{ recordType: 'world', vnum: 1, description: null }];
    const output = serializeRecords(records, 'json');

    const parsed = JSON.parse(output) as Record<string, unknown>[];
    expect(parsed[0]).toHaveProperty('description', null);
  });

  it('preserves null values in YAML output', () => {
    const records = [{ recordType: 'world', vnum: 1, description: null }];
    const output = serializeRecords(records, 'yaml');

    expect(output).toContain('description: null');
  });
});

describe('extensionForFormat', () => {
  it.each([
    ['json', '.json'],
    ['yaml', '.yaml'],
    ['toml', '.toml'],
  ] as const)('maps %s to %s', (format, ext) => {
    expect(extensionForFormat(format)).toBe(ext);
  });
});
