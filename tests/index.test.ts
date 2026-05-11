import { describe, expect, it } from 'vitest';

import {
  MudParserError,
  MudReader,
  RecordType,
  VERSION,
  bitvectorToAsciiFlags,
  parseAsciiFlag,
  readMudNumber,
} from '../src/index.js';

describe('index', () => {
  it('exports a semantic version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports reader-layer values', () => {
    expect(MudParserError).toBeTypeOf('function');
    expect(MudReader).toBeTypeOf('function');
    expect(bitvectorToAsciiFlags).toBeTypeOf('function');
    expect(parseAsciiFlag).toBeTypeOf('function');
    expect(readMudNumber).toBeTypeOf('function');
  });

  it('exports documented record type values', () => {
    expect(RecordType.Mobile).toBe('mobile');
    expect(RecordType.Object).toBe('object');
    expect(RecordType.World).toBe('world');
    expect(RecordType.Zone).toBe('zone');
    expect(RecordType.Shop).toBe('shop');
    expect(RecordType.Quest).toBe('quest');
    expect(RecordType.Trigger).toBe('trigger');
  });
});
