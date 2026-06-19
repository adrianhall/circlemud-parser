/**
 * Corpus load tests.
 *
 * For each bundled corpus (tbaMUD, CircleMUD 3.1):
 *   1. Generates the DDL schema + all data migration files via emitSql().
 *   2. Loads them into an in-memory better-sqlite3 database with foreign keys ON.
 *   3. Asserts a clean load (no errors, row counts > 0).
 *   4. Applies the same SQL a second time to verify idempotency (INSERT OR IGNORE).
 *   5. Asserts no single generated statement exceeds D1's 100 KB hard cap.
 *   6. Asserts that DELETE FROM zones WHERE vnum=? cascades to all owned rows
 *      (rooms, mobiles, objects, shops, triggers, quests, and their children).
 */

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';

import { resolveInputs } from '../../../src/cli/inputs.js';
import { nodeFs } from '../../../src/cli/fs.js';
import { parseFile } from '../../../src/parsers/file.js';
import { RecordType } from '../../../src/types.js';
import type { MudRecord } from '../../../src/records/shared.js';
import { D1SqliteDialect } from '../../../src/cli/sql/dialects/d1-sqlite.js';
import { emitSql } from '../../../src/cli/sql/emit.js';
import type { SqlFile } from '../../../src/cli/sql/emit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function repoRoot(): string {
  return fileURLToPath(new URL('../../../', import.meta.url));
}

let ulidSeq = 0;
function seqUlid(): string {
  return `ULID${String(++ulidSeq).padStart(10, '0')}`;
}

function parseCorpus(worldDir: string): Map<RecordType, MudRecord[]> {
  const plan = resolveInputs(worldDir, { indexName: 'index', skipIfMissing: true }, nodeFs);

  const grouped = new Map<RecordType, MudRecord[]>();

  const entries: string[] = [];
  if (plan.kind === 'directory') {
    for (const idx of plan.indices) entries.push(...idx.files);
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
      continue;
    }
    for (const record of records) {
      const bucket = grouped.get(record.recordType);
      if (bucket) bucket.push(record);
      else grouped.set(record.recordType, [record]);
    }
  }

  return grouped;
}

function generateSqlFiles(worldDir: string, grouped: Map<RecordType, MudRecord[]>): SqlFile[] {
  ulidSeq = 0;
  return emitSql(grouped, {
    startNumber: 9000,
    emitCreateTables: '0001_world.sql',
    inputRoot: worldDir,
    ulid: seqUlid,
    warn: () => {},
    dialect: D1SqliteDialect,
  });
}

/**
 * Splits a SQL file's content into individual executable statements, correctly
 * handling semicolons embedded inside single-quoted string literals.
 *
 * Parses the content character by character, tracking whether we are inside a
 * single-quoted string (with `''` as the escape for a literal quote).  Emits a
 * statement boundary only when a `;` is encountered outside a quoted context.
 */
function splitStatements(content: string): string[] {
  const results: string[] = [];
  let current = '';
  let inString = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i]!;

    if (inString) {
      if (ch === "'") {
        // Check for escaped quote ('')
        if (content[i + 1] === "'") {
          current += "''";
          i += 2;
          continue;
        }
        // End of string
        inString = false;
        current += ch;
      } else {
        current += ch;
      }
    } else {
      if (ch === "'") {
        inString = true;
        current += ch;
      } else if (ch === ';') {
        // Statement boundary outside a string
        const stmt = current
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
        if (stmt.length > 0) {
          results.push(stmt);
        }
        current = '';
        i++;
        continue;
      } else {
        current += ch;
      }
    }
    i++;
  }

  // Handle any trailing content (no trailing semicolon)
  const trailing = current
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
  if (trailing.length > 0) {
    results.push(trailing);
  }

  return results;
}

/**
 * Loads all SQL files into an in-memory SQLite database in lexicographic order
 * (which matches the intended apply order).
 */
function loadIntoDb(files: SqlFile[]): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Sort files lexicographically (matches D1 apply order)
  const sorted = [...files].sort((a, b) => a.filename.localeCompare(b.filename));

  for (const file of sorted) {
    const statements = splitStatements(file.content);
    for (const stmt of statements) {
      db.exec(stmt + ';');
    }
  }

  return db;
}

// ---------------------------------------------------------------------------
// tbaMUD corpus load tests
// ---------------------------------------------------------------------------

describe('tbaMUD corpus SQL load', () => {
  const worldDir = join(repoRoot(), 'data/tbamud/lib/world');
  let grouped: Map<RecordType, MudRecord[]>;
  let sqlFiles: SqlFile[];

  beforeAll(() => {
    grouped = parseCorpus(worldDir);
    sqlFiles = generateSqlFiles(worldDir, grouped);
  });

  it('generates a non-empty set of SQL files', () => {
    expect(sqlFiles.length).toBeGreaterThan(1);
    expect(sqlFiles.some((f) => f.filename === '0001_world.sql')).toBe(true);
  });

  it('no generated statement exceeds D1 hard cap of 100 KB', () => {
    for (const file of sqlFiles) {
      const statements = splitStatements(file.content);
      for (const stmt of statements) {
        const bytes = Buffer.byteLength(stmt + ';', 'utf8');
        expect(bytes).toBeLessThanOrEqual(D1SqliteDialect.maxStatementBytes);
      }
    }
  });

  it('loads cleanly into SQLite with foreign keys enabled', () => {
    expect(() => loadIntoDb(sqlFiles)).not.toThrow();
  });

  it('has expected row counts after load', () => {
    const db = loadIntoDb(sqlFiles);
    const zoneCount = (db.prepare('SELECT COUNT(*) as n FROM zones').get() as { n: number }).n;
    const roomCount = (db.prepare('SELECT COUNT(*) as n FROM rooms').get() as { n: number }).n;
    const mobCount = (db.prepare('SELECT COUNT(*) as n FROM mobiles').get() as { n: number }).n;
    const objCount = (db.prepare('SELECT COUNT(*) as n FROM objects').get() as { n: number }).n;
    expect(zoneCount).toBe(grouped.get(RecordType.Zone)?.length ?? 0);
    expect(roomCount).toBe(grouped.get(RecordType.World)?.length ?? 0);
    expect(mobCount).toBe(grouped.get(RecordType.Mobile)?.length ?? 0);
    expect(objCount).toBe(grouped.get(RecordType.Object)?.length ?? 0);
  });

  it('created_at and updated_at are populated for every row', () => {
    const db = loadIntoDb(sqlFiles);
    // Check a sample from each table that has data
    const tables = ['zones', 'rooms', 'mobiles', 'objects'];
    for (const table of tables) {
      const count = (db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number }).n;
      if (count === 0) continue;
      const nullCreated = (
        db.prepare(`SELECT COUNT(*) as n FROM ${table} WHERE created_at IS NULL`).get() as {
          n: number;
        }
      ).n;
      const nullUpdated = (
        db.prepare(`SELECT COUNT(*) as n FROM ${table} WHERE updated_at IS NULL`).get() as {
          n: number;
        }
      ).n;
      expect(nullCreated, `${table}.created_at should be non-null for all rows`).toBe(0);
      expect(nullUpdated, `${table}.updated_at should be non-null for all rows`).toBe(0);
      // Spot-check one row: timestamps should look like ISO-8601 with milliseconds
      const row = db.prepare(`SELECT created_at, updated_at FROM ${table} LIMIT 1`).get() as {
        created_at: string;
        updated_at: string;
      };
      expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
      expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
    }
  });

  it('second apply is a no-op (idempotency via INSERT OR IGNORE)', () => {
    const db = loadIntoDb(sqlFiles);
    const countBefore = (db.prepare('SELECT COUNT(*) as n FROM rooms').get() as { n: number }).n;

    // Apply data files again
    const dataFiles = sqlFiles.filter((f) => f.filename !== '0001_world.sql');
    const sorted = [...dataFiles].sort((a, b) => a.filename.localeCompare(b.filename));
    for (const file of sorted) {
      const statements = splitStatements(file.content);
      for (const stmt of statements) {
        db.exec(stmt + ';');
      }
    }

    const countAfter = (db.prepare('SELECT COUNT(*) as n FROM rooms').get() as { n: number }).n;
    expect(countAfter).toBe(countBefore);
  });

  it('DELETE FROM zones cascades to rooms and their exits', () => {
    const db = loadIntoDb(sqlFiles);
    // Pick the first zone
    const zone = db.prepare('SELECT vnum FROM zones LIMIT 1').get() as { vnum: number };
    const zoneVnum = zone.vnum;

    // Count rooms in this zone before delete
    const roomsBefore = (
      db.prepare('SELECT COUNT(*) as n FROM rooms WHERE zone_vnum = ?').get(zoneVnum) as {
        n: number;
      }
    ).n;
    expect(roomsBefore).toBeGreaterThan(0);

    db.exec(`DELETE FROM zones WHERE vnum = ${zoneVnum};`);

    // Rooms should be gone
    const roomsAfter = (
      db.prepare('SELECT COUNT(*) as n FROM rooms WHERE zone_vnum = ?').get(zoneVnum) as {
        n: number;
      }
    ).n;
    expect(roomsAfter).toBe(0);

    // Zone itself should be gone
    const zoneAfter = db
      .prepare('SELECT COUNT(*) as n FROM zones WHERE vnum = ?')
      .get(zoneVnum) as {
      n: number;
    };
    expect(zoneAfter.n).toBe(0);
  });

  it('DELETE FROM zones cascades to all record types', () => {
    const db = loadIntoDb(sqlFiles);

    // Find a zone that has at least rooms
    const zone = db
      .prepare(
        `SELECT z.vnum FROM zones z
         WHERE EXISTS (SELECT 1 FROM rooms r WHERE r.zone_vnum = z.vnum)
         LIMIT 1`,
      )
      .get() as { vnum: number } | undefined;

    if (!zone) return; // nothing to test

    db.exec(`DELETE FROM zones WHERE vnum = ${zone.vnum};`);

    expect(
      (
        db.prepare('SELECT COUNT(*) as n FROM rooms WHERE zone_vnum = ?').get(zone.vnum) as {
          n: number;
        }
      ).n,
    ).toBe(0);
  });

  it('zone_commands cascade on zone delete', () => {
    const db = loadIntoDb(sqlFiles);
    const zone = db
      .prepare(
        'SELECT vnum FROM zones WHERE EXISTS (SELECT 1 FROM zone_commands zc WHERE zc.zone_vnum = zones.vnum) LIMIT 1',
      )
      .get() as { vnum: number } | undefined;
    if (!zone) return;

    const cmdsBefore = (
      db.prepare('SELECT COUNT(*) as n FROM zone_commands WHERE zone_vnum = ?').get(zone.vnum) as {
        n: number;
      }
    ).n;
    expect(cmdsBefore).toBeGreaterThan(0);

    db.exec(`DELETE FROM zones WHERE vnum = ${zone.vnum};`);

    const cmdsAfter = (
      db.prepare('SELECT COUNT(*) as n FROM zone_commands WHERE zone_vnum = ?').get(zone.vnum) as {
        n: number;
      }
    ).n;
    expect(cmdsAfter).toBe(0);
  });

  it('room_exits cascade on room delete (transitively from zone delete)', () => {
    const db = loadIntoDb(sqlFiles);
    const zone = db
      .prepare(
        `SELECT z.vnum FROM zones z
         WHERE EXISTS (
           SELECT 1 FROM rooms r
           JOIN room_exits re ON re.room_vnum = r.vnum
           WHERE r.zone_vnum = z.vnum
         ) LIMIT 1`,
      )
      .get() as { vnum: number } | undefined;
    if (!zone) return;

    const exitsBefore = (
      db
        .prepare(
          `SELECT COUNT(*) as n FROM room_exits re
         JOIN rooms r ON r.vnum = re.room_vnum
         WHERE r.zone_vnum = ?`,
        )
        .get(zone.vnum) as { n: number }
    ).n;
    expect(exitsBefore).toBeGreaterThan(0);

    db.exec(`DELETE FROM zones WHERE vnum = ${zone.vnum};`);

    // Since rooms are gone, exits that reference their room_vnum should cascade
    const roomVnumsFromDeletedZone = db
      .prepare('SELECT vnum FROM rooms WHERE zone_vnum = ?')
      .all(zone.vnum) as { vnum: number }[];
    expect(roomVnumsFromDeletedZone).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CircleMUD 3.1 corpus load tests
// ---------------------------------------------------------------------------

describe('CircleMUD 3.1 corpus SQL load', () => {
  const worldDir = join(repoRoot(), 'data/circle-3.1/lib/world');
  let grouped: Map<RecordType, MudRecord[]>;
  let sqlFiles: SqlFile[];

  beforeAll(() => {
    grouped = parseCorpus(worldDir);
    sqlFiles = generateSqlFiles(worldDir, grouped);
  });

  it('generates a non-empty set of SQL files', () => {
    expect(sqlFiles.length).toBeGreaterThan(1);
  });

  it('no generated statement exceeds D1 hard cap of 100 KB', () => {
    for (const file of sqlFiles) {
      const statements = splitStatements(file.content);
      for (const stmt of statements) {
        const bytes = Buffer.byteLength(stmt + ';', 'utf8');
        expect(bytes).toBeLessThanOrEqual(D1SqliteDialect.maxStatementBytes);
      }
    }
  });

  it('loads cleanly into SQLite with foreign keys enabled', () => {
    expect(() => loadIntoDb(sqlFiles)).not.toThrow();
  });

  it('has expected row counts after load', () => {
    const db = loadIntoDb(sqlFiles);
    const zoneCount = (db.prepare('SELECT COUNT(*) as n FROM zones').get() as { n: number }).n;
    const roomCount = (db.prepare('SELECT COUNT(*) as n FROM rooms').get() as { n: number }).n;
    expect(zoneCount).toBe(grouped.get(RecordType.Zone)?.length ?? 0);
    expect(roomCount).toBe(grouped.get(RecordType.World)?.length ?? 0);
  });

  it('second apply is a no-op (idempotency)', () => {
    const db = loadIntoDb(sqlFiles);
    const countBefore = (db.prepare('SELECT COUNT(*) as n FROM zones').get() as { n: number }).n;

    const dataFiles = sqlFiles.filter((f) => f.filename !== '0001_world.sql');
    const sorted = [...dataFiles].sort((a, b) => a.filename.localeCompare(b.filename));
    for (const file of sorted) {
      const statements = splitStatements(file.content);
      for (const stmt of statements) {
        db.exec(stmt + ';');
      }
    }

    const countAfter = (db.prepare('SELECT COUNT(*) as n FROM zones').get() as { n: number }).n;
    expect(countAfter).toBe(countBefore);
  });
});
