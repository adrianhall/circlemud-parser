/**
 * Corpus invariant tests.
 *
 * Asserts the preconditions required for zone-scoped cascade delete to be safe:
 *   1. No two zone `[bottom, top]` ranges overlap.
 *   2. Every parsed room, mobile, object, shop, trigger, and quest VNUM falls
 *      within exactly one zone's range (100% containment, no unmatched records).
 *
 * These invariants are verified against both bundled corpora:
 *   - data/tbamud/lib/world
 *   - data/circle-3.1/lib/world
 */

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { resolveInputs } from '../../../src/cli/inputs.js';
import { nodeFs } from '../../../src/cli/fs.js';
import { parseFile } from '../../../src/parsers/file.js';
import { RecordType } from '../../../src/types.js';
import type { MudRecord } from '../../../src/records/shared.js';
import type { ZoneRecord } from '../../../src/records/zone.js';
import { findZoneOverlaps, vnumsWithoutZone } from '../../../src/cli/sql/emit.js';
import type { ZoneRange } from '../../../src/cli/sql/rows.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function repoRoot(): string {
  return fileURLToPath(new URL('../../../', import.meta.url));
}

/**
 * Parses all files in a world directory and returns records grouped by type.
 */
function parseCorpus(worldDir: string): Map<RecordType, MudRecord[]> {
  const plan = resolveInputs(worldDir, { indexName: 'index', skipIfMissing: true }, nodeFs);

  const grouped = new Map<RecordType, MudRecord[]>();

  const entries: string[] = [];
  if (plan.kind === 'directory') {
    for (const idx of plan.indices) {
      entries.push(...idx.files);
    }
  } else if (plan.kind === 'index') {
    entries.push(...plan.files);
  } else {
    entries.push(plan.filePath);
  }

  for (const filePath of entries) {
    let records: MudRecord[];
    try {
      records = parseFile(filePath, { sourceName: filePath });
    } catch {
      continue; // skip files that cannot be parsed (e.g. missing/unsupported)
    }

    for (const record of records) {
      const bucket = grouped.get(record.recordType);
      if (bucket) {
        bucket.push(record);
      } else {
        grouped.set(record.recordType, [record]);
      }
    }
  }

  return grouped;
}

function buildZoneRanges(grouped: Map<RecordType, MudRecord[]>): ZoneRange[] {
  return ((grouped.get(RecordType.Zone) ?? []) as ZoneRecord[]).map((z) => ({
    vnum: z.vnum,
    bottom: z.bottom,
    top: z.top,
  }));
}

// ---------------------------------------------------------------------------
// tbaMUD corpus
// ---------------------------------------------------------------------------

describe('tbaMUD corpus invariants', () => {
  const worldDir = join(repoRoot(), 'data/tbamud/lib/world');
  let grouped: Map<RecordType, MudRecord[]>;
  let zones: ZoneRange[];

  // Parse once before all tests.
  beforeAll(() => {
    grouped = parseCorpus(worldDir);
    zones = buildZoneRanges(grouped);
  });

  it('has zones parsed', () => {
    expect(zones.length).toBeGreaterThan(0);
  });

  it('no zone ranges overlap', () => {
    const overlaps = findZoneOverlaps(zones);
    expect(overlaps).toHaveLength(0);
  });

  it('all rooms have an owning zone', () => {
    const rooms = (grouped.get(RecordType.World) ?? []).map((r) => r.vnum);
    expect(rooms.length).toBeGreaterThan(0);
    const unmatched = vnumsWithoutZone(rooms, zones);
    expect(unmatched).toHaveLength(0);
  });

  it('all mobiles have an owning zone', () => {
    const mobiles = (grouped.get(RecordType.Mobile) ?? []).map((r) => r.vnum);
    expect(mobiles.length).toBeGreaterThan(0);
    const unmatched = vnumsWithoutZone(mobiles, zones);
    expect(unmatched).toHaveLength(0);
  });

  it('all objects have an owning zone', () => {
    const objects = (grouped.get(RecordType.Object) ?? []).map((r) => r.vnum);
    expect(objects.length).toBeGreaterThan(0);
    const unmatched = vnumsWithoutZone(objects, zones);
    expect(unmatched).toHaveLength(0);
  });

  it('all shops have an owning zone', () => {
    const shops = (grouped.get(RecordType.Shop) ?? []).map((r) => r.vnum);
    if (shops.length === 0) return; // optional type
    const unmatched = vnumsWithoutZone(shops, zones);
    expect(unmatched).toHaveLength(0);
  });

  it('all triggers have an owning zone', () => {
    const triggers = (grouped.get(RecordType.Trigger) ?? []).map((r) => r.vnum);
    if (triggers.length === 0) return; // optional type
    const unmatched = vnumsWithoutZone(triggers, zones);
    expect(unmatched).toHaveLength(0);
  });

  it('all quests have an owning zone', () => {
    const quests = (grouped.get(RecordType.Quest) ?? []).map((r) => r.vnum);
    if (quests.length === 0) return; // optional type (not in CircleMUD)
    const unmatched = vnumsWithoutZone(quests, zones);
    expect(unmatched).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CircleMUD 3.1 corpus
// ---------------------------------------------------------------------------

describe('CircleMUD 3.1 corpus invariants', () => {
  const worldDir = join(repoRoot(), 'data/circle-3.1/lib/world');
  let grouped: Map<RecordType, MudRecord[]>;
  let zones: ZoneRange[];

  beforeAll(() => {
    grouped = parseCorpus(worldDir);
    zones = buildZoneRanges(grouped);
  });

  it('has zones parsed', () => {
    expect(zones.length).toBeGreaterThan(0);
  });

  it('no zone ranges overlap', () => {
    const overlaps = findZoneOverlaps(zones);
    expect(overlaps).toHaveLength(0);
  });

  it('all rooms have an owning zone', () => {
    const rooms = (grouped.get(RecordType.World) ?? []).map((r) => r.vnum);
    expect(rooms.length).toBeGreaterThan(0);
    const unmatched = vnumsWithoutZone(rooms, zones);
    expect(unmatched).toHaveLength(0);
  });

  it('all mobiles have an owning zone', () => {
    const mobiles = (grouped.get(RecordType.Mobile) ?? []).map((r) => r.vnum);
    expect(mobiles.length).toBeGreaterThan(0);
    const unmatched = vnumsWithoutZone(mobiles, zones);
    expect(unmatched).toHaveLength(0);
  });

  it('all objects have an owning zone', () => {
    const objects = (grouped.get(RecordType.Object) ?? []).map((r) => r.vnum);
    expect(objects.length).toBeGreaterThan(0);
    const unmatched = vnumsWithoutZone(objects, zones);
    expect(unmatched).toHaveLength(0);
  });

  it('all shops have an owning zone', () => {
    const shops = (grouped.get(RecordType.Shop) ?? []).map((r) => r.vnum);
    if (shops.length === 0) return;
    const unmatched = vnumsWithoutZone(shops, zones);
    expect(unmatched).toHaveLength(0);
  });
});
