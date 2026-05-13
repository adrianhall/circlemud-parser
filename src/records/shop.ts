import { RecordType } from '../types.js';
import { MudRecord } from './shared.js';
import type { SourceSpan, Vnum } from '../types.js';

/** Parsed shop buy-type entry from a `.shp` trade list. */
export interface ShopTradeType {
  /** Numeric item type accepted by the shopkeeper. */
  itemType: number;

  /** Resolved item type name from constants.c, or `UNKNOWN_<itemType>`. */
  itemTypeName: string;

  /** Raw item-name or expression text after the item type, or `null` when absent. */
  expression: string | null;
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
