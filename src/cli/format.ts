import { stringify as tomlStringify } from 'smol-toml';
import { stringify as yamlStringify } from 'yaml';

import type { OutputFormat } from './options.js';

/**
 * Recursively strips `null` and `undefined` values from an object tree.
 *
 * TOML has no null concept, so null-valued fields must be omitted before
 * serialization. JSON and YAML preserve nulls natively.
 */
function stripNulls(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;

  if (Array.isArray(value)) {
    return value.map(stripNulls).filter((v) => v !== undefined);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const stripped = stripNulls(val);
      if (stripped !== undefined) {
        result[key] = stripped;
      }
    }
    return result;
  }

  return value;
}

/**
 * Serializes an array of record JSON objects to the specified format.
 *
 * - **JSON**: bare top-level array, pretty-printed with 2-space indent.
 * - **YAML**: bare top-level array.
 * - **TOML**: wrapped as `{ records: [...] }` producing `[[records]]` array-of-tables.
 */
export function serializeRecords(
  records: readonly Record<string, unknown>[],
  format: OutputFormat,
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(records, null, 2) + '\n';
    case 'yaml':
      return yamlStringify(records);
    case 'toml': {
      const cleaned = stripNulls({ records }) as Record<string, unknown>;
      return tomlStringify(cleaned);
    }
    case 'sql':
      // SQL output is handled by the dedicated SQL emitter pipeline; this path
      // is not called for sql format, but the case is required for exhaustiveness.
      return '';
  }
}

/** Returns the file extension (with leading dot) for the given output format. */
export function extensionForFormat(format: OutputFormat): string {
  switch (format) {
    case 'json':
      return '.json';
    case 'yaml':
      return '.yaml';
    case 'toml':
      return '.toml';
    case 'sql':
      return '.sql';
  }
}
