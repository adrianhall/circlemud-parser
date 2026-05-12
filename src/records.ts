import { RecordType } from './types.js';
import type { SourceSpan, Vnum } from './types.js';

/** Parsed extra description keyword and description pair from a room or object record. */
export interface ExtraDescription {
  /** Keyword list parsed from the source keyword tilde string. */
  keywords: readonly string[];

  /** Decoded description, or `null` when the source description string was empty. */
  description: string | null;
}

/** Parsed direction and exit data from a room record. */
export interface RoomDirection {
  /** Numeric direction index from the source `D<dir>` header. */
  direction: number;

  /** Decoded general direction description, or `null` when explicitly empty. */
  description: string | null;

  /** Keyword list parsed from the source door keyword tilde string. */
  keywords: readonly string[];

  /** Resolved public exit flag names derived from the door type field. */
  exitFlags: readonly string[];

  /** Canonical ASCII bitvector representation for exit flags. */
  exitFlagsBits: string;

  /** Door key VNUM, or `null` when the source uses an absent-key sentinel. */
  keyVnum: Vnum | null;

  /** Target room VNUM, or `null` when the source uses an absent-room sentinel. */
  toRoomVnum: Vnum | null;
}

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

/** Constructor data for `WorldRecord`. */
export interface WorldRecordInit {
  /** Room VNUM from the `#<vnum>` header. */
  vnum: Vnum;

  /** Room display name after source decoding. */
  name: string;

  /** Room long description, or `null` when explicitly absent. */
  description: string | null;

  /** Resolved public room flag names. */
  roomFlags: readonly string[];

  /** Canonical ASCII bitvector representation for room flags. */
  roomFlagsBits: string;

  /** Numeric room sector type. */
  sectorType: number;

  /** Parsed room directions and exits. */
  directions: readonly RoomDirection[];

  /** Parsed extra room descriptions. */
  extraDescriptions: readonly ExtraDescription[];

  /** DG trigger VNUMs attached to this room. */
  triggerVnums: readonly Vnum[];

  /** Source span for the room record, when available. */
  source?: SourceSpan;
}

/** Parsed room record from a `.wld` world file. */
export class WorldRecord extends MudRecord {
  /** Room display name after source decoding. */
  readonly name: string;

  /** Room long description, or `null` when explicitly absent. */
  readonly description: string | null;

  /** Resolved public room flag names. */
  readonly roomFlags: readonly string[];

  /** Canonical ASCII bitvector representation for room flags. */
  readonly roomFlagsBits: string;

  /** Numeric room sector type. */
  readonly sectorType: number;

  /** Parsed room directions and exits. */
  readonly directions: readonly RoomDirection[];

  /** Parsed extra room descriptions. */
  readonly extraDescriptions: readonly ExtraDescription[];

  /** DG trigger VNUMs attached to this room. */
  readonly triggerVnums: readonly Vnum[];

  /**
   * Creates a parsed world room record.
   *
   * @param init - Complete world room record data.
   */
  constructor(init: WorldRecordInit) {
    super(RecordType.World, init.vnum, init.source);

    this.name = init.name;
    this.description = init.description;
    this.roomFlags = [...init.roomFlags];
    this.roomFlagsBits = init.roomFlagsBits;
    this.sectorType = init.sectorType;
    this.directions = init.directions.map((direction) => copyRoomDirection(direction));
    this.extraDescriptions = init.extraDescriptions.map((description) =>
      copyExtraDescription(description),
    );
    this.triggerVnums = [...init.triggerVnums];
  }

  /**
   * Serializes the world room record to a stable plain JSON-compatible object.
   *
   * @returns Plain world room record object suitable for `JSON.stringify()`.
   */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      recordType: this.recordType,
      vnum: this.vnum,
      name: this.name,
      description: this.description,
      roomFlags: [...this.roomFlags],
      roomFlagsBits: this.roomFlagsBits,
      sectorType: this.sectorType,
      directions: this.directions.map((direction) => roomDirectionToJSON(direction)),
      extraDescriptions: this.extraDescriptions.map((description) =>
        extraDescriptionToJSON(description),
      ),
      triggerVnums: [...this.triggerVnums],
    };

    if (this.source !== undefined) {
      json.source = this.source;
    }

    return json;
  }
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
 * Copies a room direction into immutable public record storage.
 *
 * @param direction - Direction data to copy.
 * @returns Direction data with copied arrays.
 */
function copyRoomDirection(direction: RoomDirection): RoomDirection {
  return {
    direction: direction.direction,
    description: direction.description,
    keywords: [...direction.keywords],
    exitFlags: [...direction.exitFlags],
    exitFlagsBits: direction.exitFlagsBits,
    keyVnum: direction.keyVnum,
    toRoomVnum: direction.toRoomVnum,
  };
}

/**
 * Copies an extra description into immutable public record storage.
 *
 * @param description - Extra description data to copy.
 * @returns Extra description data with copied keyword arrays.
 */
function copyExtraDescription(description: ExtraDescription): ExtraDescription {
  return {
    keywords: [...description.keywords],
    description: description.description,
  };
}

/**
 * Serializes a room direction to a stable plain object.
 *
 * @param direction - Direction data to serialize.
 * @returns Plain direction object suitable for JSON output.
 */
function roomDirectionToJSON(direction: RoomDirection): Record<string, unknown> {
  return {
    direction: direction.direction,
    description: direction.description,
    keywords: [...direction.keywords],
    exitFlags: [...direction.exitFlags],
    exitFlagsBits: direction.exitFlagsBits,
    keyVnum: direction.keyVnum,
    toRoomVnum: direction.toRoomVnum,
  };
}

/**
 * Serializes an extra description to a stable plain object.
 *
 * @param description - Extra description data to serialize.
 * @returns Plain extra description object suitable for JSON output.
 */
function extraDescriptionToJSON(description: ExtraDescription): Record<string, unknown> {
  return {
    keywords: [...description.keywords],
    description: description.description,
  };
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
