import { RecordType } from '../types.js';
import { MudRecord } from './shared.js';
import type { SourceSpan, Vnum } from '../types.js';

/** Constructor data for `TriggerRecord`. */
export interface TriggerRecordInit {
  /** Trigger VNUM from the `#<vnum>` header. */
  vnum: Vnum;

  /** Trigger display name, or `null` when explicitly absent. */
  name: string | null;

  /** Numeric trigger attach type: 0 mobile, 1 object, 2 world. */
  attachType: number;

  /** Resolved attach type name from dg_scripts.h, or `UNKNOWN_<attachType>`. */
  attachTypeName: string;

  /** Resolved public trigger type names using the table for this attach type. */
  triggerType: readonly string[];

  /** Canonical ASCII bitvector representation for trigger types. */
  triggerTypeBits: string;

  /** Numeric trigger argument from the source flag line. */
  numericArg: number;

  /** Trigger argument list, or `null` when explicitly absent. */
  argList: string | null;

  /** Trigger command body split into source command lines. */
  commands: readonly string[];

  /** Source span for the trigger record, when available. */
  source?: SourceSpan;
}

/** Parsed DG trigger record from a `.trg` file. */
export class TriggerRecord extends MudRecord {
  /** Trigger display name, or `null` when explicitly absent. */
  readonly name: string | null;

  /** Numeric trigger attach type: 0 mobile, 1 object, 2 world. */
  readonly attachType: number;

  /** Resolved attach type name from dg_scripts.h, or `UNKNOWN_<attachType>`. */
  readonly attachTypeName: string;

  /** Resolved public trigger type names using the table for this attach type. */
  readonly triggerType: readonly string[];

  /** Canonical ASCII bitvector representation for trigger types. */
  readonly triggerTypeBits: string;

  /** Numeric trigger argument from the source flag line. */
  readonly numericArg: number;

  /** Trigger argument list, or `null` when explicitly absent. */
  readonly argList: string | null;

  /** Trigger command body split into source command lines. */
  readonly commands: readonly string[];

  /**
   * Creates a parsed trigger record.
   *
   * @param init - Complete trigger record data.
   */
  constructor(init: TriggerRecordInit) {
    super(RecordType.Trigger, init.vnum, init.source);

    this.name = init.name;
    this.attachType = init.attachType;
    this.attachTypeName = init.attachTypeName;
    this.triggerType = [...init.triggerType];
    this.triggerTypeBits = init.triggerTypeBits;
    this.numericArg = init.numericArg;
    this.argList = init.argList;
    this.commands = [...init.commands];
  }

  /**
   * Serializes the trigger record to a stable plain JSON-compatible object.
   *
   * @returns Plain trigger record object suitable for `JSON.stringify()`.
   */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      recordType: this.recordType,
      vnum: this.vnum,
      name: this.name,
      attachType: this.attachType,
      attachTypeName: this.attachTypeName,
      triggerType: [...this.triggerType],
      triggerTypeBits: this.triggerTypeBits,
      numericArg: this.numericArg,
      argList: this.argList,
      commands: [...this.commands],
    };

    if (this.source !== undefined) {
      json.source = this.source;
    }

    return json;
  }
}
