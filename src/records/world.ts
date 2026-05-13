import { RecordType } from '../types.js';
import { MudRecord, copyExtraDescription, extraDescriptionToJSON } from './shared.js';
import type { ExtraDescription } from './shared.js';
import type { SourceSpan, Vnum } from '../types.js';

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
