import { RecordType } from '../types.js';
import { MudRecord } from './shared.js';
import type { SourceSpan, Vnum } from '../types.js';

/** Parsed zone reset command from a `.zon` command table. */
export interface ZoneCommand {
  /** Single-letter zone command code, such as `M`, `O`, `D`, `T`, or `V`. */
  command: string;

  /** C `if_flag` value controlling whether command execution depends on the previous command. */
  ifFlag: number;

  /** Numeric command arguments after `ifFlag`, preserved as VNUMs or raw numeric fields. */
  args: readonly number[];

  /** String command arguments, currently used by `V` variable-assignment commands. */
  stringArgs: readonly string[];

  /** Optional OLC comment extracted from the source command line. */
  comment?: string;

  /** Source span for the command line, when available. */
  source?: SourceSpan;
}

/** Constructor data for `ZoneRecord`. */
export interface ZoneRecordInit {
  /** Zone VNUM from the `#<vnum>` header. */
  vnum: Vnum;

  /** Builder list from the source header, or `null` when explicitly absent. */
  builders: string | null;

  /** Zone display name after source decoding. */
  name: string;

  /** Lowest room VNUM in this zone. */
  bottom: Vnum;

  /** Highest room VNUM in this zone. */
  top: Vnum;

  /** Reset lifespan in minutes. */
  lifespan: number;

  /** Reset mode from the source numeric header. */
  resetMode: number;

  /** Resolved public zone flag names. */
  zoneFlags: readonly string[];

  /** Canonical ASCII bitvector representation for zone flags. */
  zoneFlagsBits: string;

  /** Minimum player level for the zone, or `null` when absent. */
  minLevel: number | null;

  /** Maximum player level for the zone, or `null` when absent. */
  maxLevel: number | null;

  /** Parsed reset commands for this zone. */
  commands: readonly ZoneCommand[];

  /** Source span for the zone record, when available. */
  source?: SourceSpan;
}

/** Parsed zone record from a `.zon` file. */
export class ZoneRecord extends MudRecord {
  /** Builder list from the source header, or `null` when explicitly absent. */
  readonly builders: string | null;

  /** Zone display name after source decoding. */
  readonly name: string;

  /** Lowest room VNUM in this zone. */
  readonly bottom: Vnum;

  /** Highest room VNUM in this zone. */
  readonly top: Vnum;

  /** Reset lifespan in minutes. */
  readonly lifespan: number;

  /** Reset mode from the source numeric header. */
  readonly resetMode: number;

  /** Resolved public zone flag names. */
  readonly zoneFlags: readonly string[];

  /** Canonical ASCII bitvector representation for zone flags. */
  readonly zoneFlagsBits: string;

  /** Minimum player level for the zone, or `null` when absent. */
  readonly minLevel: number | null;

  /** Maximum player level for the zone, or `null` when absent. */
  readonly maxLevel: number | null;

  /** Parsed reset commands for this zone. */
  readonly commands: readonly ZoneCommand[];

  /**
   * Creates a parsed zone record.
   *
   * @param init - Complete zone record data.
   */
  constructor(init: ZoneRecordInit) {
    super(RecordType.Zone, init.vnum, init.source);

    this.builders = init.builders;
    this.name = init.name;
    this.bottom = init.bottom;
    this.top = init.top;
    this.lifespan = init.lifespan;
    this.resetMode = init.resetMode;
    this.zoneFlags = [...init.zoneFlags];
    this.zoneFlagsBits = init.zoneFlagsBits;
    this.minLevel = init.minLevel;
    this.maxLevel = init.maxLevel;
    this.commands = init.commands.map((command) => copyZoneCommand(command));
  }

  /**
   * Serializes the zone record to a stable plain JSON-compatible object.
   *
   * @returns Plain zone record object suitable for `JSON.stringify()`.
   */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      recordType: this.recordType,
      vnum: this.vnum,
      builders: this.builders,
      name: this.name,
      bottom: this.bottom,
      top: this.top,
      lifespan: this.lifespan,
      resetMode: this.resetMode,
      zoneFlags: [...this.zoneFlags],
      zoneFlagsBits: this.zoneFlagsBits,
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      commands: this.commands.map((command) => zoneCommandToJSON(command)),
    };

    if (this.source !== undefined) {
      json.source = this.source;
    }

    return json;
  }
}

/**
 * Copies a zone command into immutable public record storage.
 *
 * @param command - Zone command data to copy.
 * @returns Zone command data with copied arrays.
 */
function copyZoneCommand(command: ZoneCommand): ZoneCommand {
  const copy: ZoneCommand = {
    command: command.command,
    ifFlag: command.ifFlag,
    args: [...command.args],
    stringArgs: [...command.stringArgs],
  };

  if (command.comment !== undefined) {
    copy.comment = command.comment;
  }
  if (command.source !== undefined) {
    copy.source = command.source;
  }

  return copy;
}

/**
 * Serializes a zone command to a stable plain object.
 *
 * @param command - Zone command data to serialize.
 * @returns Plain zone command object suitable for JSON output.
 */
function zoneCommandToJSON(command: ZoneCommand): Record<string, unknown> {
  const json: Record<string, unknown> = {
    command: command.command,
    ifFlag: command.ifFlag,
    args: [...command.args],
    stringArgs: [...command.stringArgs],
  };

  if (command.comment !== undefined) {
    json.comment = command.comment;
  }
  if (command.source !== undefined) {
    json.source = command.source;
  }

  return json;
}
