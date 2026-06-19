/**
 * Tests for the SQL dialect abstraction and shared packing logic.
 */

import { describe, expect, it } from 'vitest';

import {
  D1SqliteDialect,
  escapeSqlString,
  renderSqlValue,
} from '../../../src/cli/sql/dialects/d1-sqlite.js';
import { packStatements, getDialect } from '../../../src/cli/sql/dialect.js';

// ---------------------------------------------------------------------------
// D1 SQLite — literal escaping
// ---------------------------------------------------------------------------

describe('escapeSqlString', () => {
  it('passes through plain ASCII', () => {
    expect(escapeSqlString('hello world')).toBe('hello world');
  });

  it('doubles embedded single quotes', () => {
    expect(escapeSqlString("it's alive")).toBe("it''s alive");
  });

  it('handles multiple consecutive single quotes', () => {
    expect(escapeSqlString("a''b")).toBe("a''''b");
  });

  it('preserves embedded newlines verbatim', () => {
    expect(escapeSqlString('line1\nline2')).toBe('line1\nline2');
  });

  it('preserves unicode characters', () => {
    expect(escapeSqlString('Grüße')).toBe('Grüße');
  });

  it('handles empty string', () => {
    expect(escapeSqlString('')).toBe('');
  });
});

describe('renderSqlValue', () => {
  it('renders null as NULL', () => {
    expect(renderSqlValue(null)).toBe('NULL');
  });

  it('renders integer numbers as-is', () => {
    expect(renderSqlValue(42)).toBe('42');
    expect(renderSqlValue(0)).toBe('0');
    expect(renderSqlValue(-7)).toBe('-7');
  });

  it('renders float numbers as-is', () => {
    expect(renderSqlValue(1.5)).toBe('1.5');
    expect(renderSqlValue(0.85)).toBe('0.85');
  });

  it('wraps strings in single quotes', () => {
    expect(renderSqlValue('hello')).toBe("'hello'");
  });

  it('escapes single quotes inside strings', () => {
    expect(renderSqlValue("it's")).toBe("'it''s'");
  });

  it('preserves newlines inside quoted strings', () => {
    expect(renderSqlValue('a\nb')).toBe("'a\nb'");
  });

  it('renders empty string as two quotes', () => {
    expect(renderSqlValue('')).toBe("''");
  });
});

// ---------------------------------------------------------------------------
// D1 SQLite dialect object
// ---------------------------------------------------------------------------

describe('D1SqliteDialect', () => {
  it('has correct byte caps', () => {
    expect(D1SqliteDialect.maxStatementBytes).toBe(100_000);
    expect(D1SqliteDialect.batchTargetBytes).toBe(60_000);
  });

  it('creates tables DDL containing key table names', () => {
    const ddl = D1SqliteDialect.createTables();
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS zones');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS zone_commands');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS rooms');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS room_exits');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS room_extra_descriptions');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS objects');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS object_extra_descriptions');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS object_affects');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS mobiles');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS shops');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS shop_buy_types');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS triggers');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS quests');
  });

  it('DDL contains ON DELETE CASCADE for owned child tables', () => {
    const ddl = D1SqliteDialect.createTables();
    expect(ddl).toContain('ON DELETE CASCADE');
  });

  it('every table in the DDL has created_at and updated_at columns', () => {
    const ddl = D1SqliteDialect.createTables();
    const tableNames = [
      'zones',
      'zone_commands',
      'rooms',
      'room_exits',
      'room_extra_descriptions',
      'objects',
      'object_extra_descriptions',
      'object_affects',
      'mobiles',
      'shops',
      'shop_buy_types',
      'triggers',
      'quests',
    ];

    // Split the DDL into per-table sections by splitting on CREATE TABLE boundaries.
    // Each section runs from "CREATE TABLE IF NOT EXISTS <name>" up to the next one.
    const sections = ddl.split(/(?=CREATE TABLE IF NOT EXISTS )/);

    for (const tableName of tableNames) {
      const section = sections.find((s) => s.includes(`CREATE TABLE IF NOT EXISTS ${tableName}`));
      expect(section, `${tableName} should appear in DDL`).toBeDefined();
      expect(section, `${tableName} should have created_at`).toContain('created_at');
      expect(section, `${tableName} should have updated_at`).toContain('updated_at');
    }
  });

  it('created_at and updated_at use STRFTIME millisecond default', () => {
    const ddl = D1SqliteDialect.createTables();
    expect(ddl).toContain("STRFTIME('%Y-%m-%dT%H:%M:%f', 'NOW')");
  });

  it('DDL uses INSERT OR IGNORE pattern signalled in prefix', () => {
    const prefix = D1SqliteDialect.insertPrefix('rooms', ['vnum', 'name']);
    expect(prefix).toContain('INSERT OR IGNORE INTO rooms');
    expect(prefix).toContain('(vnum, name)');
    expect(prefix).toContain('VALUES');
  });

  it('renderRow wraps values in parentheses', () => {
    const row = D1SqliteDialect.renderRow([1, 'hello', null]);
    expect(row).toBe("  (1, 'hello', NULL)");
  });

  it('terminator is semicolon', () => {
    expect(D1SqliteDialect.terminator).toBe(';');
  });
});

// ---------------------------------------------------------------------------
// Dialect registry
// ---------------------------------------------------------------------------

describe('getDialect', () => {
  it('returns D1 SQLite dialect by key', () => {
    // Import registers the dialect as a side effect.
    const dialect = getDialect('d1-sqlite');
    expect(dialect.name).toBe('D1 SQLite');
  });

  it('throws for unknown dialect key', () => {
    expect(() => getDialect('postgresql')).toThrow("Unknown SQL dialect 'postgresql'");
  });
});

// ---------------------------------------------------------------------------
// packStatements
// ---------------------------------------------------------------------------

describe('packStatements', () => {
  it('produces a single INSERT for a small number of rows', () => {
    const result = packStatements(
      D1SqliteDialect,
      'rooms',
      ['vnum', 'name'],
      [
        [1, 'Room One'],
        [2, 'Room Two'],
      ],
      (i) => `row ${i}`,
    );

    expect(result).toContain('INSERT OR IGNORE INTO rooms');
    expect(result).toContain("'Room One'");
    expect(result).toContain("'Room Two'");
    // Both rows in same statement (small data)
    expect(result.split('INSERT OR IGNORE').length).toBe(2); // exactly one INSERT
    expect(result.endsWith(';')).toBe(true);
  });

  it('returns empty string for zero rows', () => {
    expect(packStatements(D1SqliteDialect, 'rooms', ['vnum'], [], () => 'x')).toBe('');
  });

  it('splits into multiple statements when rows exceed batchTargetBytes', () => {
    // Use a tiny mock dialect with a very small batch target to force splitting.
    const tiny = {
      ...D1SqliteDialect,
      batchTargetBytes: 80, // artificially small
    };

    const rows: (readonly [number, string])[] = [
      [1, 'AAAAAAAAAA'],
      [2, 'BBBBBBBBBB'],
      [3, 'CCCCCCCCCC'],
    ];

    const result = packStatements(tiny, 'rooms', ['vnum', 'name'], rows, (i) => `${i}`);

    // Should have more than one INSERT
    const insertCount = (result.match(/INSERT OR IGNORE/g) ?? []).length;
    expect(insertCount).toBeGreaterThan(1);

    // Every individual statement must be ≤ real D1 cap (it will be much smaller here)
    const statements = result.split('\n').filter((l) => l.includes('INSERT OR IGNORE'));
    for (const stmt of statements) {
      expect(Buffer.byteLength(stmt + ';', 'utf8')).toBeLessThanOrEqual(
        D1SqliteDialect.maxStatementBytes,
      );
    }
  });

  it('throws a fatal error when a single row exceeds the hard cap', () => {
    const tiny = {
      ...D1SqliteDialect,
      maxStatementBytes: 10,
      batchTargetBytes: 10,
    };

    expect(() =>
      packStatements(
        tiny,
        'rooms',
        ['vnum', 'name'],
        [[1, 'a very long description that exceeds any reasonable limit']],
        () => 'vnum=1',
      ),
    ).toThrow('vnum=1');
  });

  it('each packed statement stays under batchTargetBytes', () => {
    // Generate many rows and verify every statement is under the target
    const rows: (readonly [number, string])[] = Array.from({ length: 500 }, (_, i) => [
      i + 1,
      `Room name number ${i + 1} with some extra text`,
    ]);

    const result = packStatements(D1SqliteDialect, 'rooms', ['vnum', 'name'], rows, (i) => `${i}`);

    // Split on statement boundaries — each statement ends with ;\n or ; at end
    const statements = result.split(/;\n/).map((s) => s + ';');
    for (const stmt of statements) {
      if (stmt.trim() === ';') continue;
      expect(Buffer.byteLength(stmt, 'utf8')).toBeLessThanOrEqual(D1SqliteDialect.batchTargetBytes);
    }
  });
});
