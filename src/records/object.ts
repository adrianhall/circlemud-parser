import { RecordType } from '../types.js';
import { MudRecord, copyExtraDescription, extraDescriptionToJSON } from './shared.js';
import type { ExtraDescription } from './shared.js';
import type { SourceSpan, Vnum } from '../types.js';

/** Parsed object affect modifier from an `A` object subrecord. */
export interface ObjectAffect {
  /** Numeric apply location from the source object affect line. */
  location: number;

  /** Resolved apply location name from constants.c, or `UNKNOWN_<location>`. */
  locationName: string;

  /** Numeric modifier applied to the location. */
  modifier: number;
}

/** Constructor data for `ObjectRecord`. */
export interface ObjectRecordInit {
  /** Object VNUM from the `#<vnum>` header. */
  vnum: Vnum;

  /** Object alias list parsed from the source name string. */
  aliases: readonly string[];

  /** Short in-inventory object description, or `null` when explicitly absent. */
  shortDescription: string | null;

  /** Long room object description, or `null` when explicitly absent. */
  description: string | null;

  /** Action description, or `null` when explicitly absent. */
  actionDescription: string | null;

  /** Numeric object item type. */
  objectType: number;

  /** Resolved object item type name from constants.c, or `UNKNOWN_<objectType>`. */
  objectTypeName: string;

  /** Resolved public object extra flag names. */
  extraFlags: readonly string[];

  /** Canonical ASCII bitvector representation for extra flags. */
  extraFlagsBits: string;

  /** Resolved public object wear flag names. */
  wearFlags: readonly string[];

  /** Canonical ASCII bitvector representation for wear flags. */
  wearFlagsBits: string;

  /** Resolved public object affect flag names. */
  affectFlags: readonly string[];

  /** Canonical ASCII bitvector representation for affect flags. */
  affectFlagsBits: string;

  /** Raw object value array from the source second numeric line. */
  values: readonly [number, number, number, number];

  /** Object weight from the source third numeric line. */
  weight: number;

  /** Object cost from the source third numeric line. */
  cost: number;

  /** Object rent from the source third numeric line. */
  rent: number;

  /** Object minimum level from the source third numeric line. */
  level: number;

  /** Object timer from the source third numeric line. */
  timer: number;

  /** Parsed object extra descriptions. */
  extraDescriptions: readonly ExtraDescription[];

  /** Parsed object affects from `A` subrecords. */
  affects: readonly ObjectAffect[];

  /** DG trigger VNUMs attached to this object. */
  triggerVnums: readonly Vnum[];

  /** Source span for the object record, when available. */
  source?: SourceSpan;
}

/** Parsed object record from a `.obj` file. */
export class ObjectRecord extends MudRecord {
  /** Object alias list parsed from the source name string. */
  readonly aliases: readonly string[];

  /** Short in-inventory object description, or `null` when explicitly absent. */
  readonly shortDescription: string | null;

  /** Long room object description, or `null` when explicitly absent. */
  readonly description: string | null;

  /** Action description, or `null` when explicitly absent. */
  readonly actionDescription: string | null;

  /** Numeric object item type. */
  readonly objectType: number;

  /** Resolved object item type name from constants.c, or `UNKNOWN_<objectType>`. */
  readonly objectTypeName: string;

  /** Resolved public object extra flag names. */
  readonly extraFlags: readonly string[];

  /** Canonical ASCII bitvector representation for extra flags. */
  readonly extraFlagsBits: string;

  /** Resolved public object wear flag names. */
  readonly wearFlags: readonly string[];

  /** Canonical ASCII bitvector representation for wear flags. */
  readonly wearFlagsBits: string;

  /** Resolved public object affect flag names. */
  readonly affectFlags: readonly string[];

  /** Canonical ASCII bitvector representation for affect flags. */
  readonly affectFlagsBits: string;

  /** Raw object value array from the source second numeric line. */
  readonly values: readonly [number, number, number, number];

  /** Object weight from the source third numeric line. */
  readonly weight: number;

  /** Object cost from the source third numeric line. */
  readonly cost: number;

  /** Object rent from the source third numeric line. */
  readonly rent: number;

  /** Object minimum level from the source third numeric line. */
  readonly level: number;

  /** Object timer from the source third numeric line. */
  readonly timer: number;

  /** Parsed object extra descriptions. */
  readonly extraDescriptions: readonly ExtraDescription[];

  /** Parsed object affects from `A` subrecords. */
  readonly affects: readonly ObjectAffect[];

  /** DG trigger VNUMs attached to this object. */
  readonly triggerVnums: readonly Vnum[];

  /**
   * Creates a parsed object record.
   *
   * @param init - Complete object record data.
   */
  constructor(init: ObjectRecordInit) {
    super(RecordType.Object, init.vnum, init.source);

    this.aliases = [...init.aliases];
    this.shortDescription = init.shortDescription;
    this.description = init.description;
    this.actionDescription = init.actionDescription;
    this.objectType = init.objectType;
    this.objectTypeName = init.objectTypeName;
    this.extraFlags = [...init.extraFlags];
    this.extraFlagsBits = init.extraFlagsBits;
    this.wearFlags = [...init.wearFlags];
    this.wearFlagsBits = init.wearFlagsBits;
    this.affectFlags = [...init.affectFlags];
    this.affectFlagsBits = init.affectFlagsBits;
    this.values = [...init.values] as [number, number, number, number];
    this.weight = init.weight;
    this.cost = init.cost;
    this.rent = init.rent;
    this.level = init.level;
    this.timer = init.timer;
    this.extraDescriptions = init.extraDescriptions.map((description) =>
      copyExtraDescription(description),
    );
    this.affects = init.affects.map((affect) => copyObjectAffect(affect));
    this.triggerVnums = [...init.triggerVnums];
  }

  /**
   * Serializes the object record to a stable plain JSON-compatible object.
   *
   * @returns Plain object record object suitable for `JSON.stringify()`.
   */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      recordType: this.recordType,
      vnum: this.vnum,
      aliases: [...this.aliases],
      shortDescription: this.shortDescription,
      description: this.description,
      actionDescription: this.actionDescription,
      objectType: this.objectType,
      objectTypeName: this.objectTypeName,
      extraFlags: [...this.extraFlags],
      extraFlagsBits: this.extraFlagsBits,
      wearFlags: [...this.wearFlags],
      wearFlagsBits: this.wearFlagsBits,
      affectFlags: [...this.affectFlags],
      affectFlagsBits: this.affectFlagsBits,
      values: [...this.values],
      weight: this.weight,
      cost: this.cost,
      rent: this.rent,
      level: this.level,
      timer: this.timer,
      extraDescriptions: this.extraDescriptions.map((description) =>
        extraDescriptionToJSON(description),
      ),
      affects: this.affects.map((affect) => objectAffectToJSON(affect)),
      triggerVnums: [...this.triggerVnums],
    };

    if (this.source !== undefined) {
      json.source = this.source;
    }

    return json;
  }
}

/**
 * Copies an object affect into immutable public record storage.
 *
 * @param affect - Object affect data to copy.
 * @returns Object affect data with primitive fields copied.
 */
function copyObjectAffect(affect: ObjectAffect): ObjectAffect {
  return {
    location: affect.location,
    locationName: affect.locationName,
    modifier: affect.modifier,
  };
}

/**
 * Serializes an object affect to a stable plain object.
 *
 * @param affect - Object affect data to serialize.
 * @returns Plain object affect suitable for JSON output.
 */
function objectAffectToJSON(affect: ObjectAffect): Record<string, unknown> {
  return {
    location: affect.location,
    locationName: affect.locationName,
    modifier: affect.modifier,
  };
}
