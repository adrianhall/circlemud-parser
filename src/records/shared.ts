import { RecordType } from '../types.js';
import type { SourceSpan, Vnum } from '../types.js';

/** Parsed extra description keyword and description pair from a room or object record. */
export interface ExtraDescription {
  /** Keyword list parsed from the source keyword tilde string. */
  keywords: readonly string[];

  /** Decoded description, or `null` when the source description string was empty. */
  description: string | null;
}

/** Base class for all parsed MUD record objects. */
export abstract class MudRecord {
  /** Public record category. */
  readonly recordType: RecordType;

  /** Stable virtual number identity for this record. */
  readonly vnum: Vnum;

  /** Source span for this record, when available. */
  readonly source?: SourceSpan;

  /**
   * Creates a parsed record base object.
   *
   * @param recordType - Public record category.
   * @param vnum - Stable virtual number identity for this record.
   * @param source - Optional source span for this record.
   */
  protected constructor(recordType: RecordType, vnum: Vnum, source?: SourceSpan) {
    this.recordType = recordType;
    this.vnum = vnum;

    if (source !== undefined) {
      this.source = source;
    }
  }

  /**
   * Serializes the record to a stable plain JSON-compatible object.
   *
   * @returns Plain record object suitable for `JSON.stringify()`.
   */
  abstract toJSON(): Record<string, unknown>;
}

/**
 * Copies an extra description into immutable public record storage.
 *
 * @param description - Extra description data to copy.
 * @returns Extra description data with copied keyword arrays.
 */
export function copyExtraDescription(description: ExtraDescription): ExtraDescription {
  return {
    keywords: [...description.keywords],
    description: description.description,
  };
}

/**
 * Serializes an extra description to a stable plain object.
 *
 * @param description - Extra description data to serialize.
 * @returns Plain extra description object suitable for JSON output.
 */
export function extraDescriptionToJSON(description: ExtraDescription): Record<string, unknown> {
  return {
    keywords: [...description.keywords],
    description: description.description,
  };
}
