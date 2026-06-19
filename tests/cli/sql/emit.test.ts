/**
 * Tests for the SQL emit orchestration layer (emit.ts).
 */

import { describe, expect, it } from 'vitest';

import { RecordType } from '../../../src/types.js';
import { ZoneRecord } from '../../../src/records/zone.js';
import { WorldRecord } from '../../../src/records/world.js';
import { D1SqliteDialect } from '../../../src/cli/sql/dialects/d1-sqlite.js';
import { emitSql, findZoneOverlaps, vnumsWithoutZone } from '../../../src/cli/sql/emit.js';
import type { MudRecord } from '../../../src/records/shared.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let ulidCount = 0;
function mockUlid(): string {
  return `ULID${String(++ulidCount).padStart(6, '0')}`;
}

function makeZone(vnum: number, bottom: number, top: number): ZoneRecord {
  return new ZoneRecord({
    vnum,
    builders: null,
    name: `Zone ${vnum}`,
    bottom,
    top,
    lifespan: 30,
    resetMode: 2,
    zoneFlags: [],
    zoneFlagsBits: '0',
    minLevel: null,
    maxLevel: null,
    commands: [],
  });
}

function makeRoom(vnum: number): WorldRecord {
  return new WorldRecord({
    vnum,
    name: `Room ${vnum}`,
    description: null,
    roomFlags: [],
    roomFlagsBits: '0',
    sectorType: 0,
    directions: [],
    extraDescriptions: [],
    triggerVnums: [],
  });
}

const BASE_OPTIONS = {
  startNumber: 9000,
  inputRoot: '/data/world',
  ulid: mockUlid,
  warn: () => {},
  dialect: D1SqliteDialect,
};

// ---------------------------------------------------------------------------
// File naming and numbering
// ---------------------------------------------------------------------------

describe('emitSql — file naming and numbering', () => {
  it('produces no files when grouped map is empty', () => {
    ulidCount = 0;
    const files = emitSql(new Map(), BASE_OPTIONS);
    expect(files).toHaveLength(0);
  });

  it('emits only zone file when only zones are present', () => {
    ulidCount = 0;
    const grouped: Map<RecordType, readonly MudRecord[]> = new Map([
      [RecordType.Zone, [makeZone(30, 3000, 3099)]],
    ]);
    const files = emitSql(grouped, BASE_OPTIONS);
    expect(files).toHaveLength(1);
    expect(files[0]!.filename).toBe('9000_zone_data.sql');
  });

  it('skips record types with no records (gap in numbering)', () => {
    ulidCount = 0;
    const grouped: Map<RecordType, readonly MudRecord[]> = new Map([
      [RecordType.Zone, [makeZone(30, 3000, 3099)]],
      // No World records — 9001_room_data.sql should be skipped
      [RecordType.Object, []], // empty — also skipped
    ]);
    const files = emitSql(grouped, BASE_OPTIONS);
    const filenames = files.map((f) => f.filename);
    expect(filenames).toContain('9000_zone_data.sql');
    expect(filenames).not.toContain('9001_room_data.sql');
    expect(filenames).not.toContain('9002_object_data.sql');
  });

  it('emits DDL schema file when emitCreateTables is set (with zone data)', () => {
    ulidCount = 0;
    const grouped: Map<RecordType, readonly MudRecord[]> = new Map([
      [RecordType.Zone, [makeZone(30, 3000, 3099)]],
    ]);
    const files = emitSql(grouped, {
      ...BASE_OPTIONS,
      emitCreateTables: '0001_world.sql',
    });
    // schema file + zone data file
    expect(files).toHaveLength(2);
    expect(files[0]!.filename).toBe('0001_world.sql');
    expect(files[0]!.content).toContain('CREATE TABLE IF NOT EXISTS zones');
  });

  it('DDL schema file is empty when grouped map is empty (no active types)', () => {
    ulidCount = 0;
    const files = emitSql(new Map(), {
      ...BASE_OPTIONS,
      emitCreateTables: '0001_world.sql',
    });
    expect(files).toHaveLength(1);
    expect(files[0]!.filename).toBe('0001_world.sql');
    // No active types → DDL should be empty (no tables to create)
    expect(files[0]!.content).toBe('');
  });

  it('DDL omits tables for absent types (e.g. quests when none present)', () => {
    ulidCount = 0;
    const grouped: Map<RecordType, readonly MudRecord[]> = new Map([
      [RecordType.Zone, [makeZone(30, 3000, 3099)]],
      [RecordType.World, [makeRoom(3050)]],
      // No Quest, Trigger, Shop, Mobile, Object records
    ]);
    const files = emitSql(grouped, {
      ...BASE_OPTIONS,
      emitCreateTables: '0001_world.sql',
    });
    const schema = files.find((f) => f.filename === '0001_world.sql')!;
    expect(schema.content).toContain('CREATE TABLE IF NOT EXISTS zones');
    expect(schema.content).toContain('CREATE TABLE IF NOT EXISTS rooms');
    expect(schema.content).not.toContain('CREATE TABLE IF NOT EXISTS quests');
    expect(schema.content).not.toContain('CREATE TABLE IF NOT EXISTS triggers');
    expect(schema.content).not.toContain('CREATE TABLE IF NOT EXISTS shops');
    expect(schema.content).not.toContain('CREATE TABLE IF NOT EXISTS mobiles');
  });

  it('DDL file comes before data files', () => {
    ulidCount = 0;
    const grouped: Map<RecordType, readonly MudRecord[]> = new Map([
      [RecordType.Zone, [makeZone(30, 3000, 3099)]],
    ]);
    const files = emitSql(grouped, {
      ...BASE_OPTIONS,
      emitCreateTables: '0001_world.sql',
    });
    expect(files[0]!.filename).toBe('0001_world.sql');
    expect(files[1]!.filename).toBe('9000_zone_data.sql');
  });

  it('all offsets produce correct filenames', () => {
    ulidCount = 0;
    const zone = makeZone(30, 3000, 3099);
    const room = makeRoom(3050);
    const grouped: Map<RecordType, readonly MudRecord[]> = new Map([
      [RecordType.Zone, [zone]],
      [RecordType.World, [room]],
    ]);
    const files = emitSql(grouped, BASE_OPTIONS);
    const filenames = files.map((f) => f.filename);
    expect(filenames).toContain('9000_zone_data.sql');
    expect(filenames).toContain('9001_room_data.sql');
  });
});

// ---------------------------------------------------------------------------
// Zero-padding
// ---------------------------------------------------------------------------

describe('emitSql — zero-padding', () => {
  it('pads numbers so all share the same digit width (start=9997)', () => {
    ulidCount = 0;
    const zone = makeZone(30, 3000, 3099);
    const room = makeRoom(3050);
    const grouped: Map<RecordType, readonly MudRecord[]> = new Map([
      [RecordType.Zone, [zone]],
      [RecordType.World, [room]],
    ]);
    const files = emitSql(grouped, { ...BASE_OPTIONS, startNumber: 9997 });
    const filenames = files.map((f) => f.filename);
    // 9997 + 6 = 10003, so 5 digits needed; 9997 → '09997', 9998 → '09998'
    expect(filenames[0]).toBe('09997_zone_data.sql');
    expect(filenames[1]).toBe('09998_room_data.sql');
  });

  it('no padding needed when startNumber + 6 has same digit count as startNumber', () => {
    ulidCount = 0;
    const zone = makeZone(30, 3000, 3099);
    const grouped: Map<RecordType, readonly MudRecord[]> = new Map([[RecordType.Zone, [zone]]]);
    const files = emitSql(grouped, { ...BASE_OPTIONS, startNumber: 1 });
    // 1 + 6 = 7, 1 digit → stays single digit
    expect(files[0]!.filename).toBe('1_zone_data.sql');
  });
});

// ---------------------------------------------------------------------------
// Content: leading comment
// ---------------------------------------------------------------------------

describe('emitSql — data file content', () => {
  it('data file starts with a leading comment', () => {
    ulidCount = 0;
    const zone = makeZone(30, 3000, 3099);
    const grouped: Map<RecordType, readonly MudRecord[]> = new Map([[RecordType.Zone, [zone]]]);
    const files = emitSql(grouped, BASE_OPTIONS);
    expect(files[0]!.content.startsWith('-- 9000_zone_data.sql')).toBe(true);
  });

  it('data file contains INSERT OR IGNORE', () => {
    ulidCount = 0;
    const zone = makeZone(30, 3000, 3099);
    const grouped: Map<RecordType, readonly MudRecord[]> = new Map([[RecordType.Zone, [zone]]]);
    const files = emitSql(grouped, BASE_OPTIONS);
    expect(files[0]!.content).toContain('INSERT OR IGNORE INTO zones');
  });
});

// ---------------------------------------------------------------------------
// Zone containment invariant helpers
// ---------------------------------------------------------------------------

describe('findZoneOverlaps', () => {
  it('returns empty when zones do not overlap', () => {
    const zones = [
      { vnum: 1, bottom: 0, top: 99 },
      { vnum: 2, bottom: 100, top: 199 },
    ];
    expect(findZoneOverlaps(zones)).toHaveLength(0);
  });

  it('detects overlapping zones', () => {
    const zones = [
      { vnum: 1, bottom: 0, top: 150 },
      { vnum: 2, bottom: 100, top: 199 },
    ];
    const overlaps = findZoneOverlaps(zones);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toContain('Zone 1');
    expect(overlaps[0]).toContain('Zone 2');
  });

  it('handles empty zone list', () => {
    expect(findZoneOverlaps([])).toHaveLength(0);
  });
});

describe('vnumsWithoutZone', () => {
  const zones = [
    { vnum: 1, bottom: 0, top: 99 },
    { vnum: 2, bottom: 100, top: 199 },
  ];

  it('returns empty when all vnums are covered', () => {
    expect(vnumsWithoutZone([0, 50, 99, 100, 199], zones)).toHaveLength(0);
  });

  it('returns uncovered vnums', () => {
    const uncovered = vnumsWithoutZone([50, 200, 300], zones);
    expect(uncovered).toContain(200);
    expect(uncovered).toContain(300);
    expect(uncovered).not.toContain(50);
  });
});
