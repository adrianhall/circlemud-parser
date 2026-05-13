import { describe, expect, it } from 'vitest';

import { MudRecord, ShopRecord } from '../../src/records/index.js';
import type { ShopTradeType } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

describe('ShopRecord', () => {
  it('preserves shop fields and serializes to plain JSON', () => {
    const productVnums = [3001, 3002];
    const buyTypes: ShopTradeType[] = [{ itemType: 5, itemTypeName: 'WEAPON', expression: null }];
    const shopFlags = ['WILL_BANK'];
    const noTradeFlags = ['NO_EVIL'];
    const roomVnums = [3010];
    const record = new ShopRecord({
      vnum: 3000,
      productVnums,
      buyProfit: 1.1,
      sellProfit: 0.5,
      buyTypes,
      noSuchItemKeeper: 'I do not stock that item.',
      noSuchItemPlayer: 'You do not have that item.',
      doNotBuy: null,
      missingCashKeeper: 'I cannot afford that.',
      missingCashPlayer: 'You cannot afford that.',
      messageBuy: 'Sold.',
      messageSell: 'Bought.',
      temper: 0,
      shopFlags,
      shopFlagsBits: 'a',
      keeperVnum: 3050,
      noTradeFlags,
      noTradeBits: 'a',
      roomVnums,
      open1: 9,
      close1: 17,
      open2: 20,
      close2: 23,
      source: { fileName: '30.shp', startLine: 1, endLine: 22 },
    });

    productVnums.push(3003);
    buyTypes.push({ itemType: 9, itemTypeName: 'ARMOR', expression: 'fine' });
    shopFlags.push('NO_SELL');
    noTradeFlags.push('NO_GOOD');
    roomVnums.push(3011);

    expect(record).toBeInstanceOf(MudRecord);
    expect(record.recordType).toBe(RecordType.Shop);
    expect(record.vnum).toBe(3000);
    expect(record.toJSON()).toEqual({
      recordType: 'shop',
      vnum: 3000,
      productVnums: [3001, 3002],
      buyProfit: 1.1,
      sellProfit: 0.5,
      buyTypes: [{ itemType: 5, itemTypeName: 'WEAPON', expression: null }],
      noSuchItemKeeper: 'I do not stock that item.',
      noSuchItemPlayer: 'You do not have that item.',
      doNotBuy: null,
      missingCashKeeper: 'I cannot afford that.',
      missingCashPlayer: 'You cannot afford that.',
      messageBuy: 'Sold.',
      messageSell: 'Bought.',
      temper: 0,
      shopFlags: ['WILL_BANK'],
      shopFlagsBits: 'a',
      keeperVnum: 3050,
      noTradeFlags: ['NO_EVIL'],
      noTradeBits: 'a',
      roomVnums: [3010],
      open1: 9,
      close1: 17,
      open2: 20,
      close2: 23,
      source: { fileName: '30.shp', startLine: 1, endLine: 22 },
    });
  });

  it('omits optional source when absent', () => {
    const record = new ShopRecord({
      vnum: 3001,
      productVnums: [],
      buyProfit: 0,
      sellProfit: 0,
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
      close1: 0,
      open2: 0,
      close2: 0,
    });

    expect(record.toJSON()).not.toHaveProperty('source');
  });
});
