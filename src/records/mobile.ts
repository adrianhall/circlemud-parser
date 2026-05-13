import { RecordType } from '../types.js';
import { MudRecord } from './shared.js';
import type { SourceSpan, Vnum } from '../types.js';

/** Parsed dice expression from a mobile record, such as `6d6+340`. */
export interface DiceRoll {
  /** Number of dice rolled. */
  count: number;

  /** Number of sides on each die. */
  sides: number;

  /** Flat bonus added to the dice result. */
  bonus: number;
}

/** Parsed combat, reward, and presentation stats from a mobile record. */
export interface MobileStats {
  /** Mobile level from the source stat line. */
  level: number;

  /** Raw source hitroll value. */
  hitroll: number;

  /** Raw source armor-class value. */
  armorClass: number;

  /** Hit point dice expression from the source stat line. */
  hitDice: DiceRoll;

  /** Damage dice expression from the source stat line. */
  damageDice: DiceRoll;

  /** Gold carried by the mobile. */
  gold: number;

  /** Experience awarded for the mobile. */
  experience: number;

  /** Current position ordinal from the source data. */
  position: number;

  /** Default position ordinal from the source data. */
  defaultPosition: number;

  /** Sex ordinal from the source data. */
  sex: number;
}

/** Optional enhanced mobile fields parsed from an `E` mobile section. */
export interface MobileEnhancedData {
  /** Bare-hand attack type ordinal. */
  bareHandAttack?: number;

  /** Strength ability score. */
  str?: number;

  /** Exceptional strength add value. */
  strAdd?: number;

  /** Intelligence ability score. */
  int?: number;

  /** Wisdom ability score. */
  wis?: number;

  /** Dexterity ability score. */
  dex?: number;

  /** Constitution ability score. */
  con?: number;

  /** Charisma ability score. */
  cha?: number;

  /** Saving throw modifier for paralysis. */
  savingPara?: number;

  /** Saving throw modifier for rods. */
  savingRod?: number;

  /** Saving throw modifier for petrification. */
  savingPetri?: number;

  /** Saving throw modifier for breath weapons. */
  savingBreath?: number;

  /** Saving throw modifier for spells. */
  savingSpell?: number;
}

/** Constructor data for `MobileRecord`. */
export interface MobileRecordInit {
  /** Mobile VNUM from the `#<vnum>` header. */
  vnum: Vnum;

  /** Mobile alias list parsed from the source name string. */
  aliases: readonly string[];

  /** Short in-room or inventory-style mobile description, or `null` when absent. */
  shortDescription: string | null;

  /** Long room mobile description, or `null` when absent. */
  longDescription: string | null;

  /** Detailed look description, or `null` when absent. */
  description: string | null;

  /** Resolved public mobile action flag names. */
  actionFlags: readonly string[];

  /** Canonical ASCII bitvector representation for action flags. */
  actionFlagsBits: string;

  /** Resolved public mobile affect flag names. */
  affectFlags: readonly string[];

  /** Canonical ASCII bitvector representation for affect flags. */
  affectFlagsBits: string;

  /** Mobile alignment from the source flag line. */
  alignment: number;

  /** Source mobile body kind from the terminating `S` or `E` marker. */
  kind: 'simple' | 'enhanced';

  /** Parsed mobile combat, reward, and position fields. */
  stats: MobileStats;

  /** Parsed enhanced mobile fields, present when `kind` is `enhanced`. */
  enhanced?: MobileEnhancedData;

  /** DG trigger VNUMs attached to this mobile. */
  triggerVnums: readonly Vnum[];

  /** Source span for the mobile record, when available. */
  source?: SourceSpan;
}

/** Parsed mobile record from a `.mob` file. */
export class MobileRecord extends MudRecord {
  /** Mobile alias list parsed from the source name string. */
  readonly aliases: readonly string[];

  /** Short in-room or inventory-style mobile description, or `null` when absent. */
  readonly shortDescription: string | null;

  /** Long room mobile description, or `null` when absent. */
  readonly longDescription: string | null;

  /** Detailed look description, or `null` when absent. */
  readonly description: string | null;

  /** Resolved public mobile action flag names. */
  readonly actionFlags: readonly string[];

  /** Canonical ASCII bitvector representation for action flags. */
  readonly actionFlagsBits: string;

  /** Resolved public mobile affect flag names. */
  readonly affectFlags: readonly string[];

  /** Canonical ASCII bitvector representation for affect flags. */
  readonly affectFlagsBits: string;

  /** Mobile alignment from the source flag line. */
  readonly alignment: number;

  /** Source mobile body kind from the terminating `S` or `E` marker. */
  readonly kind: 'simple' | 'enhanced';

  /** Parsed mobile combat, reward, and position fields. */
  readonly stats: MobileStats;

  /** Parsed enhanced mobile fields, present when `kind` is `enhanced`. */
  readonly enhanced?: MobileEnhancedData;

  /** DG trigger VNUMs attached to this mobile. */
  readonly triggerVnums: readonly Vnum[];

  /**
   * Creates a parsed mobile record.
   *
   * @param init - Complete mobile record data.
   */
  constructor(init: MobileRecordInit) {
    super(RecordType.Mobile, init.vnum, init.source);

    this.aliases = [...init.aliases];
    this.shortDescription = init.shortDescription;
    this.longDescription = init.longDescription;
    this.description = init.description;
    this.actionFlags = [...init.actionFlags];
    this.actionFlagsBits = init.actionFlagsBits;
    this.affectFlags = [...init.affectFlags];
    this.affectFlagsBits = init.affectFlagsBits;
    this.alignment = init.alignment;
    this.kind = init.kind;
    this.stats = copyMobileStats(init.stats);
    if (init.enhanced !== undefined) {
      this.enhanced = copyMobileEnhancedData(init.enhanced);
    }
    this.triggerVnums = [...init.triggerVnums];
  }

  /**
   * Serializes the mobile record to a stable plain JSON-compatible object.
   *
   * @returns Plain mobile record object suitable for `JSON.stringify()`.
   */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      recordType: this.recordType,
      vnum: this.vnum,
      aliases: [...this.aliases],
      shortDescription: this.shortDescription,
      longDescription: this.longDescription,
      description: this.description,
      actionFlags: [...this.actionFlags],
      actionFlagsBits: this.actionFlagsBits,
      affectFlags: [...this.affectFlags],
      affectFlagsBits: this.affectFlagsBits,
      alignment: this.alignment,
      kind: this.kind,
      stats: mobileStatsToJSON(this.stats),
    };

    if (this.enhanced !== undefined) {
      json.enhanced = mobileEnhancedDataToJSON(this.enhanced);
    }

    json.triggerVnums = [...this.triggerVnums];

    if (this.source !== undefined) {
      json.source = this.source;
    }

    return json;
  }
}

/**
 * Copies a dice roll into immutable public record storage.
 *
 * @param dice - Dice data to copy.
 * @returns Dice data with primitive fields copied.
 */
function copyDiceRoll(dice: DiceRoll): DiceRoll {
  return {
    count: dice.count,
    sides: dice.sides,
    bonus: dice.bonus,
  };
}

/**
 * Serializes a dice roll to a stable plain object.
 *
 * @param dice - Dice data to serialize.
 * @returns Plain dice roll suitable for JSON output.
 */
function diceRollToJSON(dice: DiceRoll): Record<string, unknown> {
  return {
    count: dice.count,
    sides: dice.sides,
    bonus: dice.bonus,
  };
}

/**
 * Copies mobile stats into immutable public record storage.
 *
 * @param stats - Mobile stats to copy.
 * @returns Mobile stats with nested dice rolls copied.
 */
function copyMobileStats(stats: MobileStats): MobileStats {
  return {
    level: stats.level,
    hitroll: stats.hitroll,
    armorClass: stats.armorClass,
    hitDice: copyDiceRoll(stats.hitDice),
    damageDice: copyDiceRoll(stats.damageDice),
    gold: stats.gold,
    experience: stats.experience,
    position: stats.position,
    defaultPosition: stats.defaultPosition,
    sex: stats.sex,
  };
}

/**
 * Serializes mobile stats to a stable plain object.
 *
 * @param stats - Mobile stats to serialize.
 * @returns Plain mobile stats suitable for JSON output.
 */
function mobileStatsToJSON(stats: MobileStats): Record<string, unknown> {
  return {
    level: stats.level,
    hitroll: stats.hitroll,
    armorClass: stats.armorClass,
    hitDice: diceRollToJSON(stats.hitDice),
    damageDice: diceRollToJSON(stats.damageDice),
    gold: stats.gold,
    experience: stats.experience,
    position: stats.position,
    defaultPosition: stats.defaultPosition,
    sex: stats.sex,
  };
}

/**
 * Copies enhanced mobile data into immutable public record storage.
 *
 * @param data - Enhanced mobile data to copy.
 * @returns Enhanced mobile data with only defined optional fields copied.
 */
function copyMobileEnhancedData(data: MobileEnhancedData): MobileEnhancedData {
  const copy: MobileEnhancedData = {};

  copyDefinedEnhancedFields(data, copy);

  return copy;
}

/**
 * Serializes enhanced mobile data to a stable plain object.
 *
 * @param data - Enhanced mobile data to serialize.
 * @returns Plain enhanced mobile data suitable for JSON output.
 */
function mobileEnhancedDataToJSON(data: MobileEnhancedData): Record<string, unknown> {
  const json: Record<string, unknown> = {};

  copyDefinedEnhancedFields(data, json);

  return json;
}

/**
 * Copies defined enhanced mobile fields into the provided target object.
 *
 * @param data - Source enhanced mobile data.
 * @param target - Target object receiving defined fields.
 * @returns Nothing.
 */
function copyDefinedEnhancedFields(
  data: MobileEnhancedData,
  target: Partial<Record<keyof MobileEnhancedData, unknown>>,
): void {
  if (data.bareHandAttack !== undefined) {
    target.bareHandAttack = data.bareHandAttack;
  }
  if (data.str !== undefined) {
    target.str = data.str;
  }
  if (data.strAdd !== undefined) {
    target.strAdd = data.strAdd;
  }
  if (data.int !== undefined) {
    target.int = data.int;
  }
  if (data.wis !== undefined) {
    target.wis = data.wis;
  }
  if (data.dex !== undefined) {
    target.dex = data.dex;
  }
  if (data.con !== undefined) {
    target.con = data.con;
  }
  if (data.cha !== undefined) {
    target.cha = data.cha;
  }
  if (data.savingPara !== undefined) {
    target.savingPara = data.savingPara;
  }
  if (data.savingRod !== undefined) {
    target.savingRod = data.savingRod;
  }
  if (data.savingPetri !== undefined) {
    target.savingPetri = data.savingPetri;
  }
  if (data.savingBreath !== undefined) {
    target.savingBreath = data.savingBreath;
  }
  if (data.savingSpell !== undefined) {
    target.savingSpell = data.savingSpell;
  }
}
