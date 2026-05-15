import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { UnsupportedRecordTypeError } from '../../src/errors.js';
import { inferRecordType, parseFile } from '../../src/parsers/file.js';
import {
  MobileRecord,
  ObjectRecord,
  QuestRecord,
  ShopRecord,
  TriggerRecord,
  WorldRecord,
  ZoneRecord,
} from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

function fixturePath(relativePath: string): string {
  return fileURLToPath(new URL(`../fixtures/${relativePath}`, import.meta.url));
}

describe('inferRecordType', () => {
  it.each([
    ['0.mob', RecordType.Mobile],
    ['0.obj', RecordType.Object],
    ['0.wld', RecordType.World],
    ['0.zon', RecordType.Zone],
    ['0.shp', RecordType.Shop],
    ['0.qst', RecordType.Quest],
    ['0.trg', RecordType.Trigger],
  ])('maps %s to %s', (fileName, recordType) => {
    expect(inferRecordType(fileName)).toBe(recordType);
  });

  it('matches extensions case-insensitively', () => {
    expect(inferRecordType('/world/30.WLD')).toBe(RecordType.World);
    expect(inferRecordType('/world/30.MoB')).toBe(RecordType.Mobile);
  });

  it.each(['area.txt', 'area', '', '/tmp/.hidden', '/tmp/world.mob.backup'])(
    'returns undefined for unsupported file name %s',
    (fileName) => {
      expect(inferRecordType(fileName)).toBeUndefined();
    },
  );
});

describe('parseFile', () => {
  it.each([
    ['mobile/simple.mob', RecordType.Mobile, MobileRecord],
    ['object/simple.obj', RecordType.Object, ObjectRecord],
    ['world/simple.wld', RecordType.World, WorldRecord],
    ['zone/new-format.zon', RecordType.Zone, ZoneRecord],
    ['shop/old-format.shp', RecordType.Shop, ShopRecord],
    ['quest/single.qst', RecordType.Quest, QuestRecord],
    ['trigger/single.trg', RecordType.Trigger, TriggerRecord],
  ])('dispatches %s to the inferred parser', (relativePath, recordType, recordClass) => {
    const records = parseFile(fixturePath(relativePath));
    const first = records[0];

    expect(first).toBeInstanceOf(recordClass);
    expect(first?.recordType).toBe(recordType);
  });

  it('passes options through when using extension inference', () => {
    const records = parseFile(fixturePath('world/simple.wld'), { sourceName: 'custom.wld' });
    const first = records[0];

    expect(first).toBeInstanceOf(WorldRecord);
    expect(first?.source?.fileName).toBe('custom.wld');
  });

  it('uses explicit record type instead of extension inference', () => {
    const directory = mkdtempSync(join(tmpdir(), 'circlemud-parser-'));
    const conflictingPath = join(directory, 'room.obj');

    try {
      writeFileSync(conflictingPath, readFileSync(fixturePath('world/simple.wld')));

      const records = parseFile(conflictingPath, RecordType.World, { sourceName: 'room.obj' });
      const first = records[0];

      expect(first).toBeInstanceOf(WorldRecord);
      expect(first?.recordType).toBe(RecordType.World);
      expect(first?.source?.fileName).toBe('room.obj');
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('throws UnsupportedRecordTypeError for unknown extensions', () => {
    expect(() => parseFile('area.txt')).toThrow(UnsupportedRecordTypeError);

    try {
      parseFile('area.txt');
      throw new Error('Expected parseFile to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedRecordTypeError);
      expect((error as UnsupportedRecordTypeError).fileName).toBe('area.txt');
    }
  });
});
