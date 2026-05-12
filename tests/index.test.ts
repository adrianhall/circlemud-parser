import { describe, expect, it } from 'vitest';

import {
  MudRecord,
  MudParserError,
  MudReader,
  MobileRecord,
  ObjectRecord,
  ParseError,
  RecordType,
  VERSION,
  WorldRecord,
  ZoneRecord,
  bitvectorToAsciiFlags,
  parseAsciiFlag,
  parseMobile,
  parseMobileFile,
  parseObject,
  parseObjectFile,
  parseWorld,
  parseWorldFile,
  parseZone,
  parseZoneFile,
  readMudNumber,
} from '../src/index.js';

describe('index', () => {
  it('exports a semantic version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports reader-layer values', () => {
    expect(MudParserError).toBeTypeOf('function');
    expect(ParseError).toBeTypeOf('function');
    expect(MudReader).toBeTypeOf('function');
    expect(bitvectorToAsciiFlags).toBeTypeOf('function');
    expect(parseAsciiFlag).toBeTypeOf('function');
    expect(readMudNumber).toBeTypeOf('function');
  });

  it('exports zone parser values', () => {
    expect(MudRecord).toBeTypeOf('function');
    expect(MobileRecord).toBeTypeOf('function');
    expect(ObjectRecord).toBeTypeOf('function');
    expect(WorldRecord).toBeTypeOf('function');
    expect(ZoneRecord).toBeTypeOf('function');
    expect(parseMobile).toBeTypeOf('function');
    expect(parseMobileFile).toBeTypeOf('function');
    expect(parseObject).toBeTypeOf('function');
    expect(parseObjectFile).toBeTypeOf('function');
    expect(parseWorld).toBeTypeOf('function');
    expect(parseWorldFile).toBeTypeOf('function');
    expect(parseZone).toBeTypeOf('function');
    expect(parseZoneFile).toBeTypeOf('function');
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
