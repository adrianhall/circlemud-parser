/**
 * SQL migration emitter.
 *
 * Orchestrates the full SQL output pipeline:
 *   1. Groups accumulated `MudRecord[]` by `RecordType`.
 *   2. Builds an `EmitContext` with zone ranges and injected helpers.
 *   3. Maps each record to `TableRows` via the per-type mappers in `rows.ts`.
 *   4. Merges rows for the same table, packs them into `INSERT` statements via
 *      `packStatements`, and assembles each migration file's content.
 *   5. Returns a deterministically named, ordered list of `{ filename, content }`
 *      objects ready for the caller to write to disk.
 */

import { ulid as defaultUlid } from 'ulidx';

import { RecordType } from '../../types.js';
import type { MudRecord } from '../../records/shared.js';
import type { MobileRecord } from '../../records/mobile.js';
import type { ObjectRecord } from '../../records/object.js';
import type { QuestRecord } from '../../records/quest.js';
import type { ShopRecord } from '../../records/shop.js';
import type { TriggerRecord } from '../../records/trigger.js';
import type { WorldRecord } from '../../records/world.js';
import type { ZoneRecord } from '../../records/zone.js';
import type { SqlDialect, SqlValue } from './dialect.js';
import { packStatements } from './dialect.js';
import {
  deriveZoneVnum,
  mobileToTableRows,
  objectToTableRows,
  questToTableRows,
  shopToTableRows,
  triggerToTableRows,
  worldToTableRows,
  zoneToTableRows,
} from './rows.js';
import type { EmitContext, TableRows, ZoneRange } from './rows.js';

// ---------------------------------------------------------------------------
// File offset / type-to-filename mapping
// ---------------------------------------------------------------------------

/** Fixed offset from `--start-number` for each record type's data file. */
const RECORD_TYPE_OFFSETS: ReadonlyArray<{ type: RecordType; suffix: string }> = [
  { type: RecordType.Zone, suffix: 'zone_data' },
  { type: RecordType.World, suffix: 'room_data' },
  { type: RecordType.Object, suffix: 'object_data' },
  { type: RecordType.Mobile, suffix: 'mobile_data' },
  { type: RecordType.Shop, suffix: 'shop_data' },
  { type: RecordType.Trigger, suffix: 'trigger_data' },
  { type: RecordType.Quest, suffix: 'quest_data' },
];

/**
 * Computes the zero-padded migration filename prefix for a given number.
 *
 * All data files emitted in a single run share the same digit width (based on
 * `startNumber + 6`), ensuring lexicographic order matches numeric order so
 * that D1 applies zones (`+0`) before rooms (`+1`) etc.
 */
function migrationFilename(number: number, startNumber: number, suffix: string): string {
  const maxNumber = startNumber + RECORD_TYPE_OFFSETS.length - 1;
  const width = String(maxNumber).length;
  const padded = String(number).padStart(width, '0');
  return `${padded}_${suffix}.sql`;
}

// ---------------------------------------------------------------------------
// SQL file content assembly
// ---------------------------------------------------------------------------

/**
 * Merges `TableRows[]` from multiple records into a single ordered list where
 * each table appears once, with all its rows concatenated in source order.
 *
 * Tables appear in the order their first row is encountered, so parent tables
 * always precede child tables (each mapper emits parent before children).
 */
function mergeTableRows(allTableRows: readonly TableRows[][]): TableRows[] {
  const tableMap = new Map<string, { columns: readonly string[]; rows: (readonly SqlValue[])[] }>();

  for (const recordTables of allTableRows) {
    for (const { table, columns, rows } of recordTables) {
      const existing = tableMap.get(table);
      if (existing) {
        existing.rows.push(...rows);
      } else {
        tableMap.set(table, { columns, rows: [...rows] });
      }
    }
  }

  return Array.from(tableMap.entries()).map(([table, { columns, rows }]) => ({
    table,
    columns,
    rows,
  }));
}

/**
 * Assembles the SQL content for a single data migration file.
 *
 * Produces one or more `INSERT OR IGNORE` statements per table, packed to stay
 * under the dialect's `batchTargetBytes` limit, with a leading `-- <filename>`
 * comment.
 */
function assembleDataFile(
  filename: string,
  mergedTables: readonly TableRows[],
  dialect: SqlDialect,
): string {
  const parts: string[] = [`-- ${filename}`];

  for (const { table, columns, rows } of mergedTables) {
    if (rows.length === 0) continue;

    const packed = packStatements(dialect, table, columns, rows, (i) => {
      // Best-effort label: first value is usually the parent VNUM.
      const firstVal = rows[i]?.[0];
      return firstVal !== null && firstVal !== undefined ? String(firstVal) : `row ${i}`;
    });

    parts.push(packed);
  }

  return parts.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Public emit API
// ---------------------------------------------------------------------------

/** A generated migration file ready to be written to disk. */
export interface SqlFile {
  readonly filename: string;
  readonly content: string;
}

/**
 * Options for the SQL emitter.  These mirror the relevant fields from
 * `CliOptions` but are kept separate so the emitter is testable without
 * importing the CLI option types.
 */
export interface EmitOptions {
  /** First migration number.  Filenames are zero-padded from this value. */
  readonly startNumber: number;

  /**
   * When set, also emit the DDL schema file using this exact filename.
   * The caller is responsible for choosing a name that sorts before data files.
   */
  readonly emitCreateTables?: string;

  /**
   * Absolute path of the input root used for computing POSIX-relative source
   * paths in `source` columns.
   */
  readonly inputRoot: string;

  /** ULID factory.  Defaults to the real `ulid` from ulidx. */
  readonly ulid?: () => string;

  /** Warning sink for non-fatal issues. */
  readonly warn: (message: string) => void;

  /** SQL dialect to use.  Defaults to the D1 SQLite dialect. */
  readonly dialect: SqlDialect;
}

/**
 * Generates SQL migration files from a grouped collection of parsed MUD records.
 *
 * Records of each `RecordType` are mapped to `TableRows`, merged, packed, and
 * assembled into deterministically named migration files.  An optional DDL
 * schema file is prepended when `emitCreateTables` is set.
 *
 * @param grouped  - Map from `RecordType` to the accumulated records of that type.
 * @param options  - Emitter options (start number, dialect, ulid factory, …).
 * @returns Ordered list of `{ filename, content }` ready to write.
 */
export function emitSql(
  grouped: ReadonlyMap<RecordType, readonly MudRecord[]>,
  options: EmitOptions,
): SqlFile[] {
  const { startNumber, emitCreateTables, inputRoot, warn, dialect } = options;
  const ulidFn = options.ulid ?? defaultUlid;

  // Build zone ranges from the parsed zone records.
  const zoneRecords = (grouped.get(RecordType.Zone) ?? []) as ZoneRecord[];
  const zones: ZoneRange[] = zoneRecords.map((z) => ({
    vnum: z.vnum,
    bottom: z.bottom,
    top: z.top,
  }));

  const ctx: EmitContext = { zones, inputRoot, ulid: ulidFn, warn };

  const files: SqlFile[] = [];

  // Optionally emit the DDL schema file first.
  if (emitCreateTables !== undefined && emitCreateTables !== '') {
    files.push({
      filename: emitCreateTables,
      content: dialect.createTables(),
    });
  }

  // Emit one data file per non-empty record type.
  for (let i = 0; i < RECORD_TYPE_OFFSETS.length; i++) {
    const { type, suffix } = RECORD_TYPE_OFFSETS[i]!;
    const records = grouped.get(type) ?? [];
    if (records.length === 0) continue;

    const filename = migrationFilename(startNumber + i, startNumber, suffix);
    const allTableRows = mapRecords(type, records, ctx);
    const mergedTables = mergeTableRows(allTableRows);
    const content = assembleDataFile(filename, mergedTables, dialect);

    files.push({ filename, content });
  }

  return files;
}

// ---------------------------------------------------------------------------
// Per-type record mapping dispatch
// ---------------------------------------------------------------------------

/**
 * Maps all records of a given `RecordType` to their `TableRows[]`, one entry
 * per record (each entry may contain multiple tables: parent + children).
 */
function mapRecords(
  type: RecordType,
  records: readonly MudRecord[],
  ctx: EmitContext,
): TableRows[][] {
  switch (type) {
    case RecordType.Zone:
      return (records as ZoneRecord[]).map((r) => zoneToTableRows(r, ctx));
    case RecordType.World:
      return (records as WorldRecord[]).map((r) => worldToTableRows(r, ctx));
    case RecordType.Object:
      return (records as ObjectRecord[]).map((r) => objectToTableRows(r, ctx));
    case RecordType.Mobile:
      return (records as MobileRecord[]).map((r) => mobileToTableRows(r, ctx));
    case RecordType.Shop:
      return (records as ShopRecord[]).map((r) => shopToTableRows(r, ctx));
    case RecordType.Trigger:
      return (records as TriggerRecord[]).map((r) => triggerToTableRows(r, ctx));
    case RecordType.Quest:
      return (records as QuestRecord[]).map((r) => questToTableRows(r, ctx));
  }
}

// ---------------------------------------------------------------------------
// Zone containment helpers (exported for corpus invariant tests)
// ---------------------------------------------------------------------------

/**
 * Verifies that no two zone ranges overlap.
 *
 * Returns an array of overlap descriptions (empty when ranges are disjoint).
 */
export function findZoneOverlaps(zones: readonly ZoneRange[]): string[] {
  const overlaps: string[] = [];
  const sorted = [...zones].sort((a, b) => a.bottom - b.bottom);

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (b.bottom <= a.top) {
      overlaps.push(
        `Zone ${a.vnum} [${a.bottom}–${a.top}] overlaps Zone ${b.vnum} [${b.bottom}–${b.top}]`,
      );
    }
  }

  return overlaps;
}

/**
 * For each record VNUM in `vnums`, returns whether it falls within at least
 * one of the provided zone ranges.
 *
 * Used by corpus invariant tests to assert 100% zone containment.
 */
export function vnumsWithoutZone(
  vnums: readonly Vnum[],
  zones: readonly ZoneRange[],
): readonly Vnum[] {
  return vnums.filter((v) => deriveZoneVnum(v, zones) === null);
}

type Vnum = number;

export { deriveZoneVnum };
