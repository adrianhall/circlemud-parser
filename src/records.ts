import { RecordType } from './types.js';
import type { SourceSpan, Vnum } from './types.js';

/** Parsed extra description keyword and description pair from a room or object record. */
export interface ExtraDescription {
  /** Keyword list parsed from the source keyword tilde string. */
  keywords: readonly string[];

  /** Decoded description, or `null` when the source description string was empty. */
  description: string | null;
}

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

/** Parsed object affect modifier from an `A` object subrecord. */
export interface ObjectAffect {
  /** Numeric apply location from the source object affect line. */
  location: number;

  /** Resolved apply location name from constants.c, or `UNKNOWN_<location>`. */
  locationName: string;

  /** Numeric modifier applied to the location. */
  modifier: number;
}

/** Parsed shop buy-type entry from a `.shp` trade list. */
export interface ShopTradeType {
  /** Numeric item type accepted by the shopkeeper. */
  itemType: number;

  /** Resolved item type name from constants.c, or `UNKNOWN_<itemType>`. */
  itemTypeName: string;

  /** Raw item-name or expression text after the item type, or `null` when absent. */
  expression: string | null;
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

/** Constructor data for `ShopRecord`. */
export interface ShopRecordInit {
  /** Shop VNUM from the `#<vnum>` header. */
  vnum: Vnum;

  /** Object VNUMs produced by the shopkeeper. */
  productVnums: readonly Vnum[];

  /** Cost multiplier applied when a player buys from the shop. */
  buyProfit: number;

  /** Cost multiplier applied when a player sells to the shop. */
  sellProfit: number;

  /** Item types and optional expressions the shopkeeper buys. */
  buyTypes: readonly ShopTradeType[];

  /** Message when the shopkeeper does not stock a requested item. */
  noSuchItemKeeper: string | null;

  /** Message when the player does not have a requested item. */
  noSuchItemPlayer: string | null;

  /** Message when the shopkeeper refuses to buy a requested item type. */
  doNotBuy: string | null;

  /** Message when the shopkeeper does not have enough money. */
  missingCashKeeper: string | null;

  /** Message when the player does not have enough money. */
  missingCashPlayer: string | null;

  /** Message used when a player buys an item. */
  messageBuy: string | null;

  /** Message used when a player sells an item. */
  messageSell: string | null;

  /** Shopkeeper reaction mode when out of money. */
  temper: number;

  /** Resolved public shop flag names. */
  shopFlags: readonly string[];

  /** Canonical ASCII bitvector representation for shop flags. */
  shopFlagsBits: string;

  /** Keeper mobile VNUM, or `null` when the source uses the NOBODY sentinel. */
  keeperVnum: Vnum | null;

  /** Resolved public no-trade flag names. */
  noTradeFlags: readonly string[];

  /** Canonical ASCII bitvector representation for no-trade flags. */
  noTradeBits: string;

  /** Room VNUMs where the shop operates. */
  roomVnums: readonly Vnum[];

  /** First opening hour. */
  open1: number;

  /** First closing hour. */
  close1: number;

  /** Second opening hour. */
  open2: number;

  /** Second closing hour. */
  close2: number;

  /** Source span for the shop record, when available. */
  source?: SourceSpan;
}

/** Parsed shop record from a `.shp` file. */
export class ShopRecord extends MudRecord {
  /** Object VNUMs produced by the shopkeeper. */
  readonly productVnums: readonly Vnum[];

  /** Cost multiplier applied when a player buys from the shop. */
  readonly buyProfit: number;

  /** Cost multiplier applied when a player sells to the shop. */
  readonly sellProfit: number;

  /** Item types and optional expressions the shopkeeper buys. */
  readonly buyTypes: readonly ShopTradeType[];

  /** Message when the shopkeeper does not stock a requested item. */
  readonly noSuchItemKeeper: string | null;

  /** Message when the player does not have a requested item. */
  readonly noSuchItemPlayer: string | null;

  /** Message when the shopkeeper refuses to buy a requested item type. */
  readonly doNotBuy: string | null;

  /** Message when the shopkeeper does not have enough money. */
  readonly missingCashKeeper: string | null;

  /** Message when the player does not have enough money. */
  readonly missingCashPlayer: string | null;

  /** Message used when a player buys an item. */
  readonly messageBuy: string | null;

  /** Message used when a player sells an item. */
  readonly messageSell: string | null;

  /** Shopkeeper reaction mode when out of money. */
  readonly temper: number;

  /** Resolved public shop flag names. */
  readonly shopFlags: readonly string[];

  /** Canonical ASCII bitvector representation for shop flags. */
  readonly shopFlagsBits: string;

  /** Keeper mobile VNUM, or `null` when the source uses the NOBODY sentinel. */
  readonly keeperVnum: Vnum | null;

  /** Resolved public no-trade flag names. */
  readonly noTradeFlags: readonly string[];

  /** Canonical ASCII bitvector representation for no-trade flags. */
  readonly noTradeBits: string;

  /** Room VNUMs where the shop operates. */
  readonly roomVnums: readonly Vnum[];

  /** First opening hour. */
  readonly open1: number;

  /** First closing hour. */
  readonly close1: number;

  /** Second opening hour. */
  readonly open2: number;

  /** Second closing hour. */
  readonly close2: number;

  /**
   * Creates a parsed shop record.
   *
   * @param init - Complete shop record data.
   */
  constructor(init: ShopRecordInit) {
    super(RecordType.Shop, init.vnum, init.source);

    this.productVnums = [...init.productVnums];
    this.buyProfit = init.buyProfit;
    this.sellProfit = init.sellProfit;
    this.buyTypes = init.buyTypes.map((buyType) => copyShopTradeType(buyType));
    this.noSuchItemKeeper = init.noSuchItemKeeper;
    this.noSuchItemPlayer = init.noSuchItemPlayer;
    this.doNotBuy = init.doNotBuy;
    this.missingCashKeeper = init.missingCashKeeper;
    this.missingCashPlayer = init.missingCashPlayer;
    this.messageBuy = init.messageBuy;
    this.messageSell = init.messageSell;
    this.temper = init.temper;
    this.shopFlags = [...init.shopFlags];
    this.shopFlagsBits = init.shopFlagsBits;
    this.keeperVnum = init.keeperVnum;
    this.noTradeFlags = [...init.noTradeFlags];
    this.noTradeBits = init.noTradeBits;
    this.roomVnums = [...init.roomVnums];
    this.open1 = init.open1;
    this.close1 = init.close1;
    this.open2 = init.open2;
    this.close2 = init.close2;
  }

  /**
   * Serializes the shop record to a stable plain JSON-compatible object.
   *
   * @returns Plain shop record object suitable for `JSON.stringify()`.
   */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      recordType: this.recordType,
      vnum: this.vnum,
      productVnums: [...this.productVnums],
      buyProfit: this.buyProfit,
      sellProfit: this.sellProfit,
      buyTypes: this.buyTypes.map((buyType) => shopTradeTypeToJSON(buyType)),
      noSuchItemKeeper: this.noSuchItemKeeper,
      noSuchItemPlayer: this.noSuchItemPlayer,
      doNotBuy: this.doNotBuy,
      missingCashKeeper: this.missingCashKeeper,
      missingCashPlayer: this.missingCashPlayer,
      messageBuy: this.messageBuy,
      messageSell: this.messageSell,
      temper: this.temper,
      shopFlags: [...this.shopFlags],
      shopFlagsBits: this.shopFlagsBits,
      keeperVnum: this.keeperVnum,
      noTradeFlags: [...this.noTradeFlags],
      noTradeBits: this.noTradeBits,
      roomVnums: [...this.roomVnums],
      open1: this.open1,
      close1: this.close1,
      open2: this.open2,
      close2: this.close2,
    };

    if (this.source !== undefined) {
      json.source = this.source;
    }

    return json;
  }
}

/** Constructor data for `QuestRecord`. */
export interface QuestRecordInit {
  /** Quest VNUM from the `#<vnum>` header. */
  vnum: Vnum;

  /** Quest display name, or `null` when explicitly absent. */
  name: string | null;

  /** Short quest description shown in quest lists, or `null` when absent. */
  description: string | null;

  /** Message displayed when a character accepts the quest. */
  acceptMessage: string | null;

  /** Message displayed when a character completes the quest. */
  completeMessage: string | null;

  /** Message displayed when a character quits the quest. */
  quitMessage: string | null;

  /** Numeric quest type ordinal. */
  questType: number;

  /** Resolved quest type name from quest.c, or `UNKNOWN_<questType>`. */
  questTypeName: string;

  /** Questmaster mobile VNUM, or `null` when the source uses the NOBODY sentinel. */
  questmasterVnum: Vnum | null;

  /** Resolved public quest flag names. */
  questFlags: readonly string[];

  /** Canonical ASCII bitvector representation for quest flags. */
  questFlagsBits: string;

  /** Quest target VNUM. Its entity type depends on `questType`. */
  targetVnum: Vnum | null;

  /** Previous quest VNUM in a quest chain, or `null` when absent. */
  prevQuestVnum: Vnum | null;

  /** Next quest VNUM in a quest chain, or `null` when absent. */
  nextQuestVnum: Vnum | null;

  /** Required prerequisite object VNUM, or `null` when absent. */
  prerequisiteVnum: Vnum | null;

  /** Quest point reward for completion. */
  pointsReward: number;

  /** Quest point penalty for quitting. */
  pointsPenalty: number;

  /** Minimum character level for the quest. */
  minLevel: number;

  /** Maximum character level for the quest. */
  maxLevel: number;

  /** Quest time limit from the source value array. */
  timeLimit: number;

  /** Return mobile VNUM for return-object quests, or `null` when absent. */
  returnMobVnum: Vnum | null;

  /** Quantity tracked by the quest objective. */
  quantity: number;

  /** Gold reward for completion. */
  goldReward: number;

  /** Experience reward for completion. */
  experienceReward: number;

  /** Object reward VNUM, or `null` when the source uses `-1`. */
  objectRewardVnum: Vnum | null;

  /** Source span for the quest record, when available. */
  source?: SourceSpan;
}

/** Parsed quest record from a `.qst` file. */
export class QuestRecord extends MudRecord {
  /** Quest display name, or `null` when explicitly absent. */
  readonly name: string | null;

  /** Short quest description shown in quest lists, or `null` when absent. */
  readonly description: string | null;

  /** Message displayed when a character accepts the quest. */
  readonly acceptMessage: string | null;

  /** Message displayed when a character completes the quest. */
  readonly completeMessage: string | null;

  /** Message displayed when a character quits the quest. */
  readonly quitMessage: string | null;

  /** Numeric quest type ordinal. */
  readonly questType: number;

  /** Resolved quest type name from quest.c, or `UNKNOWN_<questType>`. */
  readonly questTypeName: string;

  /** Questmaster mobile VNUM, or `null` when the source uses the NOBODY sentinel. */
  readonly questmasterVnum: Vnum | null;

  /** Resolved public quest flag names. */
  readonly questFlags: readonly string[];

  /** Canonical ASCII bitvector representation for quest flags. */
  readonly questFlagsBits: string;

  /** Quest target VNUM. Its entity type depends on `questType`. */
  readonly targetVnum: Vnum | null;

  /** Previous quest VNUM in a quest chain, or `null` when absent. */
  readonly prevQuestVnum: Vnum | null;

  /** Next quest VNUM in a quest chain, or `null` when absent. */
  readonly nextQuestVnum: Vnum | null;

  /** Required prerequisite object VNUM, or `null` when absent. */
  readonly prerequisiteVnum: Vnum | null;

  /** Quest point reward for completion. */
  readonly pointsReward: number;

  /** Quest point penalty for quitting. */
  readonly pointsPenalty: number;

  /** Minimum character level for the quest. */
  readonly minLevel: number;

  /** Maximum character level for the quest. */
  readonly maxLevel: number;

  /** Quest time limit from the source value array. */
  readonly timeLimit: number;

  /** Return mobile VNUM for return-object quests, or `null` when absent. */
  readonly returnMobVnum: Vnum | null;

  /** Quantity tracked by the quest objective. */
  readonly quantity: number;

  /** Gold reward for completion. */
  readonly goldReward: number;

  /** Experience reward for completion. */
  readonly experienceReward: number;

  /** Object reward VNUM, or `null` when the source uses `-1`. */
  readonly objectRewardVnum: Vnum | null;

  /**
   * Creates a parsed quest record.
   *
   * @param init - Complete quest record data.
   */
  constructor(init: QuestRecordInit) {
    super(RecordType.Quest, init.vnum, init.source);

    this.name = init.name;
    this.description = init.description;
    this.acceptMessage = init.acceptMessage;
    this.completeMessage = init.completeMessage;
    this.quitMessage = init.quitMessage;
    this.questType = init.questType;
    this.questTypeName = init.questTypeName;
    this.questmasterVnum = init.questmasterVnum;
    this.questFlags = [...init.questFlags];
    this.questFlagsBits = init.questFlagsBits;
    this.targetVnum = init.targetVnum;
    this.prevQuestVnum = init.prevQuestVnum;
    this.nextQuestVnum = init.nextQuestVnum;
    this.prerequisiteVnum = init.prerequisiteVnum;
    this.pointsReward = init.pointsReward;
    this.pointsPenalty = init.pointsPenalty;
    this.minLevel = init.minLevel;
    this.maxLevel = init.maxLevel;
    this.timeLimit = init.timeLimit;
    this.returnMobVnum = init.returnMobVnum;
    this.quantity = init.quantity;
    this.goldReward = init.goldReward;
    this.experienceReward = init.experienceReward;
    this.objectRewardVnum = init.objectRewardVnum;
  }

  /**
   * Serializes the quest record to a stable plain JSON-compatible object.
   *
   * @returns Plain quest record object suitable for `JSON.stringify()`.
   */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      recordType: this.recordType,
      vnum: this.vnum,
      name: this.name,
      description: this.description,
      acceptMessage: this.acceptMessage,
      completeMessage: this.completeMessage,
      quitMessage: this.quitMessage,
      questType: this.questType,
      questTypeName: this.questTypeName,
      questmasterVnum: this.questmasterVnum,
      questFlags: [...this.questFlags],
      questFlagsBits: this.questFlagsBits,
      targetVnum: this.targetVnum,
      prevQuestVnum: this.prevQuestVnum,
      nextQuestVnum: this.nextQuestVnum,
      prerequisiteVnum: this.prerequisiteVnum,
      pointsReward: this.pointsReward,
      pointsPenalty: this.pointsPenalty,
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      timeLimit: this.timeLimit,
      returnMobVnum: this.returnMobVnum,
      quantity: this.quantity,
      goldReward: this.goldReward,
      experienceReward: this.experienceReward,
      objectRewardVnum: this.objectRewardVnum,
    };

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

/**
 * Copies a shop trade type into immutable public record storage.
 *
 * @param tradeType - Shop trade type to copy.
 * @returns Shop trade type with primitive fields copied.
 */
function copyShopTradeType(tradeType: ShopTradeType): ShopTradeType {
  return {
    itemType: tradeType.itemType,
    itemTypeName: tradeType.itemTypeName,
    expression: tradeType.expression,
  };
}

/**
 * Serializes a shop trade type to a stable plain object.
 *
 * @param tradeType - Shop trade type to serialize.
 * @returns Plain shop trade type suitable for JSON output.
 */
function shopTradeTypeToJSON(tradeType: ShopTradeType): Record<string, unknown> {
  return {
    itemType: tradeType.itemType,
    itemTypeName: tradeType.itemTypeName,
    expression: tradeType.expression,
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
