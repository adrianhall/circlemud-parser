/**
 * SQL dialect abstraction for the CircleMUD/TbaMUD SQL migration emitter.
 *
 * The `SqlDialect` interface isolates engine-specific details (INSERT syntax,
 * literal escaping, byte limits) from the shared grouping, packing, and file-
 * naming logic in the emitter.  A registry maps dialect keys to implementations;
 * the only entry shipped in this version is `'d1-sqlite'`.
 */

import { RecordType } from '../../types.js';
export { RecordType };

/** A value that can appear in a SQL row tuple. */
export type SqlValue = string | number | null;

/**
 * Engine-specific SQL dialect interface.
 *
 * Row packing and UTF-8 byte-length accounting are implemented in the shared
 * `packStatements` helper below so that every dialect benefits from the same
 * batching strategy.  The dialect supplies:
 *   - byte-cap constants,
 *   - the full DDL schema string,
 *   - the per-table INSERT prefix (engine-specific conflict behaviour),
 *   - per-row tuple rendering (literal quoting).
 */
export interface SqlDialect {
  /** Human-readable dialect name, e.g. `'D1 SQLite'`. */
  readonly name: string;

  /**
   * Hard per-statement byte cap enforced by the engine.
   * D1 SQLite: `100_000`.
   */
  readonly maxStatementBytes: number;

  /**
   * Conservative packing target.  The emitter stops adding rows to an INSERT
   * once the running UTF-8 byte length would exceed this value.
   * D1 SQLite: `60_000`.
   */
  readonly batchTargetBytes: number;

  /**
   * Returns the DDL string — `CREATE TABLE IF NOT EXISTS` and
   * `CREATE INDEX IF NOT EXISTS` statements — restricted to the record types
   * present in the dataset.
   *
   * Only tables that belong to a type in `activeTypes` are emitted.  This
   * prevents empty table definitions from appearing in the schema migration
   * when a corpus (e.g. CircleMUD 3.1) has no quests or triggers.
   */
  createTables(activeTypes: ReadonlySet<RecordType>): string;

  /**
   * Returns the opening fragment of a multi-row INSERT statement for `table`.
   *
   * Example (D1): `"INSERT OR IGNORE INTO rooms\n  (vnum, zone_vnum, name) VALUES"`
   */
  insertPrefix(table: string, columns: readonly string[]): string;

  /**
   * Renders a single row as a parenthesised tuple suitable for inclusion in a
   * VALUES list.  String values are single-quote escaped; numbers are rendered
   * as-is; null becomes `NULL`.
   *
   * Example: `"(3001, 3000, 'The Temple Of Midgaard')"`
   */
  renderRow(values: readonly SqlValue[]): string;

  /** Statement terminator, typically `';'`. */
  readonly terminator: string;
}

/**
 * Packs an array of pre-rendered row tuples into one or more complete INSERT
 * statements, each ≤ `dialect.batchTargetBytes` (UTF-8 bytes).
 *
 * If a single row's rendered tuple alone would exceed `maxStatementBytes` the
 * function throws a descriptive `Error` — this is a fatal emitter error, not
 * an expected path for real-world MUD data.
 *
 * @param dialect  - Active SQL dialect supplying caps and rendering helpers.
 * @param table    - Target table name.
 * @param columns  - Ordered column list for the INSERT prefix.
 * @param rows     - Ordered array of `SqlValue[]` row data.
 * @param rowLabel - Human-readable label used in the oversized-row error message
 *                   (typically the record VNUM + source).
 * @returns A string containing one or more `;\n`-separated INSERT statements.
 */
export function packStatements(
  dialect: SqlDialect,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly SqlValue[])[],
  rowLabel: (index: number) => string,
): string {
  if (rows.length === 0) return '';

  const prefix = dialect.insertPrefix(table, columns);
  const terminator = dialect.terminator;
  const target = dialect.batchTargetBytes;
  const hard = dialect.maxStatementBytes;

  const statements: string[] = [];
  let currentRows: string[] = [];
  // prefix + "\n" + first-row + terminator
  let currentBytes = 0;

  const flush = (): void => {
    if (currentRows.length === 0) return;
    statements.push(`${prefix}\n${currentRows.join(',\n')}${terminator}`);
    currentRows = [];
    currentBytes = 0;
  };

  for (let i = 0; i < rows.length; i++) {
    const rendered = dialect.renderRow(rows[i]!);
    const renderedBytes = Buffer.byteLength(rendered, 'utf8');

    // Guard: single row exceeds the hard per-statement cap.
    const minStatementBytes =
      Buffer.byteLength(prefix, 'utf8') +
      1 + // "\n"
      renderedBytes +
      Buffer.byteLength(terminator, 'utf8');

    if (minStatementBytes > hard) {
      throw new Error(
        `Row for ${rowLabel(i)} exceeds the hard statement byte cap of ${hard} bytes ` +
          `(rendered tuple is ${renderedBytes} bytes). ` +
          `Cannot express this row as a SQL literal INSERT.`,
      );
    }

    // Check whether adding this row would push the current statement over target.
    const addedBytes =
      currentRows.length === 0
        ? Buffer.byteLength(prefix, 'utf8') +
          1 +
          renderedBytes +
          Buffer.byteLength(terminator, 'utf8')
        : 2 + renderedBytes; // ",\n" separator

    if (currentRows.length > 0 && currentBytes + addedBytes > target) {
      flush();
    }

    if (currentRows.length === 0) {
      // Opening a new statement: count prefix + "\n" + row + terminator
      currentBytes =
        Buffer.byteLength(prefix, 'utf8') +
        1 +
        renderedBytes +
        Buffer.byteLength(terminator, 'utf8');
    } else {
      currentBytes += 2 + renderedBytes; // ",\n" + row
    }

    currentRows.push(rendered);
  }

  flush();
  return statements.join('\n');
}

/** Registry mapping dialect keys to factory functions. */
const DIALECT_REGISTRY: Record<string, () => SqlDialect> = {};

/**
 * Registers a dialect factory under `key`.  Called by dialect modules on
 * import so callers do not need direct imports of dialect implementations.
 */
export function registerDialect(key: string, factory: () => SqlDialect): void {
  DIALECT_REGISTRY[key] = factory;
}

/**
 * Returns the dialect for `key`, or throws if unregistered.
 *
 * @param key - Dialect identifier, e.g. `'d1-sqlite'`.
 */
export function getDialect(key: string): SqlDialect {
  const factory = DIALECT_REGISTRY[key];
  if (!factory) {
    throw new Error(
      `Unknown SQL dialect '${key}'. Registered: ${Object.keys(DIALECT_REGISTRY).join(', ')}`,
    );
  }
  return factory();
}
