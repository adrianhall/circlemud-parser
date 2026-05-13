import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '../../src/errors.js';
import { parseShop, parseShopFile } from '../../src/parsers/shop.js';
import { ShopRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../fixtures/shop/${name}`, import.meta.url));
}

function bundledShopPath(name: string): string {
  return fileURLToPath(new URL(`../../data/tbamud/lib/world/shp/${name}`, import.meta.url));
}

function onlyShop(records: ShopRecord[]): ShopRecord {
  const [record] = records;

  if (record === undefined) {
    throw new Error('Expected exactly one shop record.');
  }

  expect(records).toHaveLength(1);
  return record;
}

function newFormatShop(overrides: Partial<Record<string, string>> = {}): string {
  const fields = {
    marker: 'CircleMUD v3.0 Shop File~',
    header: '#600~',
    products: '-1',
    buyProfit: '1.00',
    sellProfit: '1.00',
    buyTypes: '-1',
    noSuchItemKeeper: '%s no stock~',
    noSuchItemPlayer: '%s no item~',
    doNotBuy: '%s no buy~',
    missingCashKeeper: '%s no cash keeper~',
    missingCashPlayer: '%s no cash player~',
    messageBuy: '%s buy %d~',
    messageSell: '%s sell %d~',
    temper: '0',
    shopFlags: '0',
    keeper: '-1',
    noTrade: '0',
    rooms: '-1',
    open1: '0',
    close1: '28',
    open2: '0',
    close2: '0',
    terminator: '$~',
    ...overrides,
  };

  return `${[
    fields.marker,
    fields.header,
    fields.products,
    fields.buyProfit,
    fields.sellProfit,
    fields.buyTypes,
    fields.noSuchItemKeeper,
    fields.noSuchItemPlayer,
    fields.doNotBuy,
    fields.missingCashKeeper,
    fields.missingCashPlayer,
    fields.messageBuy,
    fields.messageSell,
    fields.temper,
    fields.shopFlags,
    fields.keeper,
    fields.noTrade,
    fields.rooms,
    fields.open1,
    fields.close1,
    fields.open2,
    fields.close2,
    fields.terminator,
  ].join('\n')}\n`;
}

describe('parseShopFile', () => {
  it('parses a new-format tbaMUD shop fixture', () => {
    const record = onlyShop(
      parseShopFile(fixturePath('new-format.shp'), { sourceName: 'new-format.shp' }),
    );

    expect(record).toBeInstanceOf(ShopRecord);
    expect(record.recordType).toBe(RecordType.Shop);
    expect(record.vnum).toBe(1200);
    expect(record.productVnums).toEqual([82, 83]);
    expect(record.buyProfit).toBe(1.25);
    expect(record.sellProfit).toBe(0.75);
    expect(record.buyTypes).toEqual([
      { itemType: 1, itemTypeName: 'LIGHT', expression: 'torch & MAGIC' },
      { itemType: 9, itemTypeName: 'ARMOR', expression: 'HUM | GLOW | MAGIC' },
      { itemType: 17, itemTypeName: 'LIQ CONTAINER', expression: 'water' },
    ]);
    expect(record.noSuchItemKeeper).toBe("%s Sorry, I don't stock that item.");
    expect(record.noSuchItemPlayer).toBe("%s You don't seem to have that.");
    expect(record.doNotBuy).toBe("%s I don't trade in such items.");
    expect(record.missingCashKeeper).toBe("%s I can't afford that!");
    expect(record.missingCashPlayer).toBe('%s You are too poor!');
    expect(record.messageBuy).toBe("%s That'll be %d coins, thanks.");
    expect(record.messageSell).toBe("%s I'll give you %d coins for that.");
    expect(record.temper).toBe(1);
    expect(record.shopFlags).toEqual(['USES_BANK', 'UNLIMITED_CASH']);
    expect(record.shopFlagsBits).toBe('bc');
    expect(record.keeperVnum).toBe(1204);
    expect(record.noTradeFlags).toEqual(['Good', 'Magic User']);
    expect(record.noTradeBits).toBe('ad');
    expect(record.roomVnums).toEqual([1208, 1299]);
    expect(record.open1).toBe(0);
    expect(record.close1).toBe(28);
    expect(record.open2).toBe(0);
    expect(record.close2).toBe(0);
    expect(record.source).toEqual({ fileName: 'new-format.shp', startLine: 2, endLine: 29 });
  });

  it('parses an old-format fixed-list shop fixture', () => {
    const record = onlyShop(parseShopFile(fixturePath('old-format.shp')));

    expect(record.vnum).toBe(200);
    expect(record.productVnums).toEqual([10, 11, 12]);
    expect(record.buyProfit).toBe(2);
    expect(record.sellProfit).toBe(0.5);
    expect(record.buyTypes).toEqual([
      { itemType: 1, itemTypeName: 'LIGHT', expression: null },
      { itemType: 5, itemTypeName: 'WEAPON', expression: null },
      { itemType: 10, itemTypeName: 'POTION', expression: null },
    ]);
    expect(record.shopFlags).toEqual(['WILL_FIGHT']);
    expect(record.shopFlagsBits).toBe('a');
    expect(record.keeperVnum).toBeNull();
    expect(record.noTradeFlags).toEqual(['Evil']);
    expect(record.noTradeBits).toBe('b');
    expect(record.roomVnums).toEqual([2000]);
    expect(record.close1).toBe(2);
    expect(record.open2).toBe(-1);
    expect(record.close2).toBe(-1);
    expect(record.source?.fileName).toBe(fixturePath('old-format.shp'));
  });

  it('returns no records for an empty shop file', () => {
    expect(parseShopFile(fixturePath('empty.shp'))).toEqual([]);
  });

  it('throws when EOF is reached before the $ terminator', () => {
    expect(() => parseShopFile(fixturePath('missing-terminator.shp'))).toThrow(ParseError);
    expect(() => parseShopFile(fixturePath('missing-terminator.shp'))).toThrow(
      'Expected tilde-terminated string while reading shop header or file terminator',
    );
  });

  it('parses representative bundled tbaMUD shop files', () => {
    const records0 = parseShopFile(bundledShopPath('0.shp'));
    const records12 = parseShopFile(bundledShopPath('12.shp'));

    expect(records0.map((record) => record.vnum)).toEqual([0, 1, 99]);
    expect(records0[0]?.productVnums).toEqual([82]);
    expect(records0[0]?.buyTypes).toEqual([]);
    expect(records0[0]?.keeperVnum).toBe(98);
    expect(records0[0]?.roomVnums).toEqual([100]);
    expect(records0[1]?.keeperVnum).toBeNull();
    expect(records0[1]?.roomVnums).toEqual([]);
    expect(records0[2]?.productVnums).toEqual([91, 92, 97, 90]);
    expect(records0[2]?.roomVnums).toEqual([99]);

    const shop1200 = records12.find((record) => record.vnum === 1200);
    expect(shop1200?.buyTypes).toEqual([
      { itemType: 1, itemTypeName: 'LIGHT', expression: 'torch & MAGIC' },
      { itemType: 9, itemTypeName: 'ARMOR', expression: 'HUM | GLOW | MAGIC' },
      { itemType: 3, itemTypeName: 'WAND', expression: null },
    ]);
    expect(shop1200?.roomVnums).toEqual([1208, 1299]);
  });
});

describe('parseShop', () => {
  it('accepts Buffer input with explicit encoding', () => {
    const record = onlyShop(
      parseShop(
        Buffer.from(
          'CircleMUD v3.0 Shop File~\n#300~\n-1\n1.00\n1.00\n-1\n~\n~\n~\n~\n~\n~\n~\n0\n0\n-1\n0\n-1\n0\n28\n0\n0\n$~\n',
          'latin1',
        ),
        {
          encoding: 'latin1',
        },
      ),
    );

    expect(record.vnum).toBe(300);
    expect(record.productVnums).toEqual([]);
    expect(record.buyTypes).toEqual([]);
    expect(record.noSuchItemKeeper).toBeNull();
    expect(record.keeperVnum).toBeNull();
    expect(record.roomVnums).toEqual([]);
  });

  it('parses named buy types, numeric expressions, comments, and ASCII bitvectors', () => {
    const record = onlyShop(
      parseShop(
        'CircleMUD v3.0 Shop File~\n' +
          '#400~\n' +
          '* skipped product comment\n' +
          '\n' +
          '-1\n' +
          '1.00\n' +
          '1.00\n' +
          'LIGHT spell\n' +
          '9leather ; trailing comment\n' +
          'OTHER odd thing\n' +
          '99mystery\n' +
          '-2\n' +
          '%s no stock~\n' +
          '%s no item~\n' +
          '%s no buy~\n' +
          '%s no cash keeper~\n' +
          '%s no cash player~\n' +
          '%s buy %d~\n' +
          '%s sell %d~\n' +
          '0\n' +
          'bc\n' +
          '401\n' +
          'a\n' +
          '-1\n' +
          '0\n' +
          '28\n' +
          '0\n' +
          '0\n' +
          '$~\n',
      ),
    );

    expect(record.buyTypes).toEqual([
      { itemType: 1, itemTypeName: 'LIGHT', expression: 'spell' },
      { itemType: 9, itemTypeName: 'ARMOR', expression: 'leather' },
      { itemType: 12, itemTypeName: 'OTHER', expression: 'odd thing' },
      { itemType: 99, itemTypeName: 'UNKNOWN_99', expression: 'mystery' },
    ]);
    expect(record.shopFlags).toEqual(['USES_BANK', 'UNLIMITED_CASH']);
    expect(record.shopFlagsBits).toBe('bc');
    expect(record.noTradeFlags).toEqual(['Good']);
    expect(record.noTradeBits).toBe('a');
  });

  it('serializes to stable plain JSON', () => {
    const record = onlyShop(
      parseShopFile(fixturePath('new-format.shp'), { sourceName: 'json.shp' }),
    );

    expect(record.toJSON()).toEqual({
      recordType: 'shop',
      vnum: 1200,
      productVnums: [82, 83],
      buyProfit: 1.25,
      sellProfit: 0.75,
      buyTypes: [
        { itemType: 1, itemTypeName: 'LIGHT', expression: 'torch & MAGIC' },
        { itemType: 9, itemTypeName: 'ARMOR', expression: 'HUM | GLOW | MAGIC' },
        { itemType: 17, itemTypeName: 'LIQ CONTAINER', expression: 'water' },
      ],
      noSuchItemKeeper: "%s Sorry, I don't stock that item.",
      noSuchItemPlayer: "%s You don't seem to have that.",
      doNotBuy: "%s I don't trade in such items.",
      missingCashKeeper: "%s I can't afford that!",
      missingCashPlayer: '%s You are too poor!',
      messageBuy: "%s That'll be %d coins, thanks.",
      messageSell: "%s I'll give you %d coins for that.",
      temper: 1,
      shopFlags: ['USES_BANK', 'UNLIMITED_CASH'],
      shopFlagsBits: 'bc',
      keeperVnum: 1204,
      noTradeFlags: ['Good', 'Magic User'],
      noTradeBits: 'ad',
      roomVnums: [1208, 1299],
      open1: 0,
      close1: 28,
      open2: 0,
      close2: 0,
      source: { fileName: 'json.shp', startLine: 2, endLine: 29 },
    });
  });

  it('omits source from manually constructed shop JSON when absent', () => {
    const record = new ShopRecord({
      vnum: 700,
      productVnums: [],
      buyProfit: 1,
      sellProfit: 1,
      buyTypes: [],
      noSuchItemKeeper: null,
      noSuchItemPlayer: null,
      doNotBuy: null,
      missingCashKeeper: null,
      missingCashPlayer: null,
      messageBuy: null,
      messageSell: null,
      temper: 0,
      shopFlags: [],
      shopFlagsBits: '0',
      keeperVnum: null,
      noTradeFlags: [],
      noTradeBits: '0',
      roomVnums: [],
      open1: 0,
      close1: 28,
      open2: 0,
      close2: 0,
    });

    expect(record.toJSON()).not.toHaveProperty('source');
  });

  it('throws source-aware errors for malformed shop bodies', () => {
    expect(() => parseShop('CircleMUD v3.0 Shop File~\n#500~\nnot-a-number\n$~\n')).toThrow(
      ParseError,
    );

    try {
      parseShop('CircleMUD v3.0 Shop File~\n#500~\nnot-a-number\n$~\n');
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect(error).toMatchObject({
        recordType: RecordType.Shop,
        vnum: 500,
        source: { startLine: 3 },
      });
      return;
    }

    throw new Error('Expected malformed shop body to throw.');
  });

  it('throws for empty, malformed, and unsafe shop headers', () => {
    expect(() => parseShop('~\n$~\n')).toThrow(
      'Expected shop header, version marker, or $ terminator',
    );
    expect(() => parseShop('#abc~\n$~\n')).toThrow('Expected shop record header');
    expect(() => parseShop('#9007199254740993~\n$~\n')).toThrow('Expected numeric shop vnum');
  });

  it('skips unrecognized pre-record markers through the logger', () => {
    const debug = vi.fn((): void => {});
    const logger = {
      debug,
      info: vi.fn((): void => {}),
      warn: vi.fn((): void => {}),
      error: vi.fn((): void => {}),
    };

    expect(parseShop('Legacy comment~\n$~\n', { logger })).toEqual([]);
    expect(debug).toHaveBeenCalledWith('Skipping unrecognized shop file marker: Legacy comment');
  });

  it('throws for malformed old-format buy-type entries', () => {
    expect(() =>
      parseShop(
        '#501~\n' + '-1\n' + '-1\n' + '-1\n' + '-1\n' + '-1\n' + '1.00\n' + '1.00\n' + 'bad\n',
      ),
    ).toThrow('Expected numeric shop buy-type entry');
  });

  it('throws for malformed new-format buy-type entries', () => {
    expect(() => parseShop(newFormatShop({ header: '#502~', buyTypes: 'not-a-type' }))).toThrow(
      'Expected shop buy-type entry',
    );
  });

  it('throws for missing, malformed, and non-finite float fields', () => {
    expect(() => parseShop(newFormatShop({ header: '#503~', buyProfit: 'not-a-float' }))).toThrow(
      'Expected shop buy profit',
    );
    expect(() => parseShop(newFormatShop({ header: '#504~', buyProfit: '1e309' }))).toThrow(
      'Expected shop buy profit',
    );
  });

  it('throws for invalid and unrepresentable shop bitvectors', () => {
    expect(() => parseShop(newFormatShop({ header: '#505~', shopFlags: '-1' }))).toThrow(
      'Expected shop flags bitvector',
    );
    expect(() => parseShop(newFormatShop({ header: '#506~', shopFlags: String(2 ** 52) }))).toThrow(
      'Expected shop flags bitvector representable as ASCII flags',
    );
  });

  it('throws when EOF interrupts a shop body content line', () => {
    expect(() => parseShop('CircleMUD v3.0 Shop File~\n#507~\n')).toThrow(
      'Expected shop product list entry',
    );
  });

  it('supports paths built from caller code without relying on cwd', () => {
    const fileName = join(fixturePath('..'), 'shop', 'empty.shp');

    expect(parseShopFile(fileName)).toEqual([]);
  });
});
