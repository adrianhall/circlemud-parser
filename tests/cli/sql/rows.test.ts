/**
 * Tests for the SQL row-mapping layer (rows.ts).
 *
 * Uses minimal inline record fixtures rather than real corpus files.
 */

import { describe, expect, it } from 'vitest';

import { MobileRecord } from '../../../src/records/mobile.js';
import { ObjectRecord } from '../../../src/records/object.js';
import { QuestRecord } from '../../../src/records/quest.js';
import { ShopRecord } from '../../../src/records/shop.js';
import { TriggerRecord } from '../../../src/records/trigger.js';
import { WorldRecord } from '../../../src/records/world.js';
import { ZoneRecord } from '../../../src/records/zone.js';
import {
  deriveZoneVnum,
  formatDice,
  formatSource,
  mobileToTableRows,
  objectToTableRows,
  questToTableRows,
  shopToTableRows,
  triggerToTableRows,
  worldToTableRows,
  zoneToTableRows,
} from '../../../src/cli/sql/rows.js';
import type { EmitContext, ZoneRange } from '../../../src/cli/sql/rows.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ZONES: ZoneRange[] = [
  { vnum: 30, bottom: 3000, top: 3099 },
  { vnum: 100, bottom: 10000, top: 10099 },
];

let ulidCounter = 0;
function resetUlid() {
  ulidCounter = 0;
}
function mockUlid(): string {
  return `ULID${String(++ulidCounter).padStart(6, '0')}`;
}

const warns: string[] = [];
function makeCtx(zones: ZoneRange[] = ZONES): EmitContext {
  warns.length = 0;
  resetUlid();
  return {
    zones,
    inputRoot: '/data/world',
    ulid: mockUlid,
    warn: (msg) => warns.push(msg),
  };
}

// ---------------------------------------------------------------------------
// deriveZoneVnum
// ---------------------------------------------------------------------------

describe('deriveZoneVnum', () => {
  it('returns the owning zone vnum when vnum is in range', () => {
    expect(deriveZoneVnum(3050, ZONES)).toBe(30);
    expect(deriveZoneVnum(10000, ZONES)).toBe(100);
    expect(deriveZoneVnum(10099, ZONES)).toBe(100);
    expect(deriveZoneVnum(3000, ZONES)).toBe(30);
  });

  it('returns null for vnum outside all zones', () => {
    expect(deriveZoneVnum(999, ZONES)).toBeNull();
    expect(deriveZoneVnum(5000, ZONES)).toBeNull();
  });

  it('returns null for empty zone list', () => {
    expect(deriveZoneVnum(3050, [])).toBeNull();
  });

  it('tie-breaks overlapping zones by smallest top', () => {
    const overlapping: ZoneRange[] = [
      { vnum: 1, bottom: 100, top: 200 },
      { vnum: 2, bottom: 100, top: 150 }, // more specific (smaller top)
    ];
    expect(deriveZoneVnum(125, overlapping)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// formatDice
// ---------------------------------------------------------------------------

describe('formatDice', () => {
  it('renders dice with zero bonus without a sign', () => {
    expect(formatDice({ count: 2, sides: 8, bonus: 0 })).toBe('2d8');
  });

  it('appends positive bonus with plus sign', () => {
    expect(formatDice({ count: 10, sides: 6, bonus: 4 })).toBe('10d6+4');
  });

  it('appends negative bonus with minus sign', () => {
    expect(formatDice({ count: 1, sides: 4, bonus: -1 })).toBe('1d4-1');
  });
});

// ---------------------------------------------------------------------------
// formatSource
// ---------------------------------------------------------------------------

describe('formatSource', () => {
  it('returns null for undefined source', () => {
    expect(formatSource(undefined, '/data/world')).toBeNull();
  });

  it('returns null when fileName is absent', () => {
    expect(formatSource({ startLine: 5 }, '/data/world')).toBeNull();
  });

  it('computes relative POSIX path', () => {
    const result = formatSource(
      { fileName: '/data/world/zon/30.zon', startLine: 12 },
      '/data/world',
    );
    expect(result).toBe('zon/30.zon#12');
  });

  it('uses the basename when file is in same directory as root', () => {
    const result = formatSource({ fileName: '/data/world/30.zon', startLine: 1 }, '/data/world');
    expect(result).toBe('30.zon#1');
  });
});

// ---------------------------------------------------------------------------
// Zone rows
// ---------------------------------------------------------------------------

describe('zoneToTableRows', () => {
  const zone = new ZoneRecord({
    vnum: 30,
    builders: 'Builder One',
    name: 'Midgaard',
    bottom: 3000,
    top: 3099,
    lifespan: 30,
    resetMode: 2,
    zoneFlags: [],
    zoneFlagsBits: '0',
    minLevel: 1,
    maxLevel: 60,
    commands: [
      {
        command: 'M',
        ifFlag: 0,
        args: [0, 3001, 10, 3054],
        stringArgs: [],
        comment: 'a mob',
        source: { fileName: '/data/world/zon/30.zon', startLine: 5 },
      },
    ],
    source: { fileName: '/data/world/zon/30.zon', startLine: 1 },
  });

  it('emits zones + zone_commands tables', () => {
    const ctx = makeCtx();
    const tables = zoneToTableRows(zone, ctx);
    const names = tables.map((t) => t.table);
    expect(names).toContain('zones');
    expect(names).toContain('zone_commands');
  });

  it('zone row excludes builders and zoneFlags', () => {
    const ctx = makeCtx();
    const tables = zoneToTableRows(zone, ctx);
    const zoneTable = tables.find((t) => t.table === 'zones')!;
    expect(zoneTable.columns).not.toContain('builders');
    expect(zoneTable.columns).not.toContain('zone_flags');
    expect(zoneTable.rows[0]).toEqual([30, 'Midgaard', 3000, 3099, 30, 2, 1, 60, 'zon/30.zon#1']);
  });

  it('zone_commands row carries ULID, ordinal, source', () => {
    resetUlid();
    const ctx = makeCtx();
    const tables = zoneToTableRows(zone, ctx);
    const cmdTable = tables.find((t) => t.table === 'zone_commands')!;
    const row = cmdTable.rows[0]!;
    expect(row[0]).toBe('ULID000001'); // ULID
    expect(row[1]).toBe(30); // zone_vnum
    expect(row[2]).toBe(0); // ordinal
    expect(row[3]).toBe('M'); // command
    expect(row[4]).toBe(0); // if_flag
    expect(row[5]).toBe('[0,3001,10,3054]'); // args JSON
    expect(row[6]).toBe('[]'); // string_args JSON
    expect(row[7]).toBe('a mob'); // comment
    expect(row[8]).toBe('zon/30.zon#5'); // source
  });
});

// ---------------------------------------------------------------------------
// Room rows
// ---------------------------------------------------------------------------

describe('worldToTableRows', () => {
  const room = new WorldRecord({
    vnum: 3054,
    name: 'The Temple Of Midgaard',
    description: 'You are in the southern...\n',
    roomFlags: ['INDOORS', 'PEACEFUL'],
    roomFlagsBits: 'ch',
    sectorType: 0,
    directions: [
      {
        direction: 0, // north
        description: null,
        keywords: [],
        exitFlags: [],
        exitFlagsBits: '0',
        keyVnum: null,
        toRoomVnum: 3001,
      },
    ],
    extraDescriptions: [
      {
        keywords: ['altar'],
        description: 'A stone altar.\n',
      },
    ],
    triggerVnums: [],
    source: { fileName: '/data/world/wld/30.wld', startLine: 1 },
  });

  it('emits rooms, room_exits, room_extra_descriptions', () => {
    const ctx = makeCtx();
    const tables = worldToTableRows(room, ctx);
    const names = tables.map((t) => t.table);
    expect(names).toContain('rooms');
    expect(names).toContain('room_exits');
    expect(names).toContain('room_extra_descriptions');
  });

  it('derives zone_vnum from ZONES', () => {
    const ctx = makeCtx();
    const tables = worldToTableRows(room, ctx);
    const roomRow = tables.find((t) => t.table === 'rooms')!.rows[0]!;
    expect(roomRow[0]).toBe(3054); // vnum
    expect(roomRow[1]).toBe(30); // zone_vnum
  });

  it('resolves sector type to name', () => {
    const ctx = makeCtx();
    const tables = worldToTableRows(room, ctx);
    const roomRow = tables.find((t) => t.table === 'rooms')!.rows[0]!;
    expect(roomRow[5]).toBe('Inside'); // sector_type
  });

  it('exit direction is resolved to name', () => {
    const ctx = makeCtx();
    const tables = worldToTableRows(room, ctx);
    const exitTable = tables.find((t) => t.table === 'room_exits')!;
    const exitRow = exitTable.rows[0]!;
    expect(exitRow[2]).toBe('north'); // direction
  });

  it('emits warning for room with no owning zone', () => {
    const ctx = makeCtx();
    const orphanRoom = new WorldRecord({
      vnum: 99999,
      name: 'Orphan',
      description: null,
      roomFlags: [],
      roomFlagsBits: '0',
      sectorType: 0,
      directions: [],
      extraDescriptions: [],
      triggerVnums: [],
    });
    worldToTableRows(orphanRoom, ctx);
    expect(warns.some((w) => w.includes('99999'))).toBe(true);
    expect(warns.some((w) => w.includes('zone_vnum will be NULL'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Object rows
// ---------------------------------------------------------------------------

describe('objectToTableRows', () => {
  const obj = new ObjectRecord({
    vnum: 3001,
    aliases: ['sword', 'long'],
    shortDescription: 'a long sword',
    description: 'A long sword lies here.',
    actionDescription: null,
    objectType: 5,
    objectTypeName: 'WEAPON',
    extraFlags: ['GLOW'],
    extraFlagsBits: 'a',
    wearFlags: ['TAKE', 'WIELD'],
    wearFlagsBits: 'an',
    affectFlags: [],
    affectFlagsBits: '0',
    values: [0, 6, 8, 0],
    weight: 15,
    cost: 100,
    rent: 10,
    level: 5,
    timer: 0,
    extraDescriptions: [{ keywords: ['blade'], description: 'The blade shines.\n' }],
    affects: [{ location: 18, locationName: 'HITROLL', modifier: 2 }],
    triggerVnums: [3090],
    source: { fileName: '/data/world/obj/30.obj', startLine: 1 },
  });

  it('emits objects, object_extra_descriptions, object_affects', () => {
    const ctx = makeCtx();
    const tables = objectToTableRows(obj, ctx);
    const names = tables.map((t) => t.table);
    expect(names).toContain('objects');
    expect(names).toContain('object_extra_descriptions');
    expect(names).toContain('object_affects');
  });

  it('object_values is JSON array', () => {
    const ctx = makeCtx();
    const tables = objectToTableRows(obj, ctx);
    const objRow = tables.find((t) => t.table === 'objects')!.rows[0]!;
    expect(objRow[10]).toBe('[0,6,8,0]'); // object_values
  });

  it('affect location name comes from locationName field', () => {
    const ctx = makeCtx();
    const tables = objectToTableRows(obj, ctx);
    const affectRow = tables.find((t) => t.table === 'object_affects')!.rows[0]!;
    expect(affectRow[3]).toBe('HITROLL'); // location name
    expect(affectRow[4]).toBe(2); // modifier
  });
});

// ---------------------------------------------------------------------------
// Mobile rows
// ---------------------------------------------------------------------------

describe('mobileToTableRows', () => {
  const mobile = new MobileRecord({
    vnum: 3001,
    aliases: ['guard'],
    shortDescription: 'a guard',
    longDescription: 'A guard stands here.\n',
    description: null,
    actionFlags: ['SENTINEL', 'ISNPC'],
    actionFlagsBits: 'bd',
    affectFlags: [],
    affectFlagsBits: '0',
    alignment: 0,
    kind: 'enhanced',
    stats: {
      level: 10,
      hitroll: 5,
      armorClass: -5,
      hitDice: { count: 6, sides: 8, bonus: 10 },
      damageDice: { count: 2, sides: 6, bonus: 0 },
      gold: 100,
      experience: 500,
      position: 8, // Standing
      defaultPosition: 8,
      sex: 1, // male
    },
    enhanced: {
      str: 18,
      strAdd: 50,
      int: 10,
      wis: 12,
      dex: 14,
      con: 16,
      cha: 8,
      bareHandAttack: 0,
      savingPara: -2,
      savingRod: -2,
      savingPetri: -2,
      savingBreath: -2,
      savingSpell: -2,
    },
    triggerVnums: [],
    source: { fileName: '/data/world/mob/30.mob', startLine: 1 },
  });

  it('emits a single mobiles table', () => {
    const ctx = makeCtx();
    const tables = mobileToTableRows(mobile, ctx);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.table).toBe('mobiles');
  });

  it('serialises hitDice and damageDice as dice strings', () => {
    const ctx = makeCtx();
    const row = mobileToTableRows(mobile, ctx)[0]!.rows[0]!;
    const hitDiceIdx = tables_indexOf(tables_of(mobile, ctx), 'mobiles', 'hit_dice');
    const dmgDiceIdx = tables_indexOf(tables_of(mobile, ctx), 'mobiles', 'damage_dice');
    expect(row[hitDiceIdx]).toBe('6d8+10');
    expect(row[dmgDiceIdx]).toBe('2d6');
  });

  it('resolves position, defaultPosition, sex to names', () => {
    const ctx = makeCtx();
    const row = mobileToTableRows(mobile, ctx)[0]!.rows[0]!;
    const cols = tables_of(mobile, ctx)[0]!.columns;
    const posIdx = cols.indexOf('position');
    const defPosIdx = cols.indexOf('default_position');
    const sexIdx = cols.indexOf('sex');
    expect(row[posIdx]).toBe('Standing');
    expect(row[defPosIdx]).toBe('Standing');
    expect(row[sexIdx]).toBe('male');
  });

  it('includes enhanced columns', () => {
    const ctx = makeCtx();
    const row = mobileToTableRows(mobile, ctx)[0]!.rows[0]!;
    const cols = tables_of(mobile, ctx)[0]!.columns;
    const strIdx = cols.indexOf('strength');
    expect(row[strIdx]).toBe(18);
  });

  it('enhanced columns are null for simple mobiles', () => {
    const simpleMobile = new MobileRecord({
      vnum: 3002,
      aliases: ['peasant'],
      shortDescription: 'a peasant',
      longDescription: null,
      description: null,
      actionFlags: ['ISNPC'],
      actionFlagsBits: 'd',
      affectFlags: [],
      affectFlagsBits: '0',
      alignment: 0,
      kind: 'simple',
      stats: {
        level: 1,
        hitroll: 0,
        armorClass: 10,
        hitDice: { count: 1, sides: 4, bonus: 0 },
        damageDice: { count: 1, sides: 3, bonus: 0 },
        gold: 0,
        experience: 50,
        position: 8,
        defaultPosition: 8,
        sex: 0,
      },
      triggerVnums: [],
    });

    const ctx = makeCtx();
    const row = mobileToTableRows(simpleMobile, ctx)[0]!.rows[0]!;
    const cols = tables_of(simpleMobile, ctx)[0]!.columns;
    const strIdx = cols.indexOf('strength');
    expect(row[strIdx]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shop rows
// ---------------------------------------------------------------------------

describe('shopToTableRows', () => {
  const shop = new ShopRecord({
    vnum: 3060,
    productVnums: [3001, 3002],
    buyProfit: 1.1,
    sellProfit: 0.9,
    buyTypes: [
      { itemType: 5, itemTypeName: 'WEAPON', expression: null },
      { itemType: 9, itemTypeName: 'ARMOR', expression: 'special' },
    ],
    noSuchItemKeeper: "I don't have that.",
    noSuchItemPlayer: "You don't have that.",
    doNotBuy: "I won't buy that.",
    missingCashKeeper: "I can't afford that.",
    missingCashPlayer: "You can't afford that.",
    messageBuy: 'You buy %s.',
    messageSell: 'You sell %s.',
    temper: 0,
    shopFlags: ['WILL_FIGHT'],
    shopFlagsBits: 'a',
    keeperVnum: 3005,
    noTradeFlags: [],
    noTradeBits: '0',
    roomVnums: [3060],
    open1: 6,
    close1: 20,
    open2: 0,
    close2: 0,
    source: { fileName: '/data/world/shp/30.shp', startLine: 1 },
  });

  it('emits shops and shop_buy_types', () => {
    const ctx = makeCtx();
    const tables = shopToTableRows(shop, ctx);
    const names = tables.map((t) => t.table);
    expect(names).toContain('shops');
    expect(names).toContain('shop_buy_types');
  });

  it('product_vnums is JSON array of links', () => {
    const ctx = makeCtx();
    const shopRow = shopToTableRows(shop, ctx).find((t) => t.table === 'shops')!.rows[0]!;
    const cols = shopToTableRows(shop, ctx).find((t) => t.table === 'shops')!.columns;
    const pvIdx = cols.indexOf('product_vnums');
    expect(shopRow[pvIdx]).toBe('[3001,3002]');
  });

  it('buy type item_type is resolved name', () => {
    const ctx = makeCtx();
    const tables = shopToTableRows(shop, ctx);
    const btRow = tables.find((t) => t.table === 'shop_buy_types')!.rows[0]!;
    expect(btRow[3]).toBe('WEAPON'); // item_type
  });
});

// ---------------------------------------------------------------------------
// Trigger rows
// ---------------------------------------------------------------------------

describe('triggerToTableRows', () => {
  const trigger = new TriggerRecord({
    vnum: 3090,
    name: 'guard greet',
    attachType: 0,
    attachTypeName: 'Mobile',
    triggerType: ['Greet'],
    triggerTypeBits: 'g',
    numericArg: 50,
    argList: null,
    commands: ['say Hello!', 'wait 1'],
    source: { fileName: '/data/world/trg/30.trg', startLine: 1 },
  });

  it('emits a single triggers table', () => {
    const ctx = makeCtx();
    const tables = triggerToTableRows(trigger, ctx);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.table).toBe('triggers');
  });

  it('trigger row has correct attach_type and commands JSON', () => {
    const ctx = makeCtx();
    const row = triggerToTableRows(trigger, ctx)[0]!.rows[0]!;
    const cols = triggerToTableRows(trigger, ctx)[0]!.columns;
    expect(row[cols.indexOf('attach_type')]).toBe('Mobile');
    expect(row[cols.indexOf('commands')]).toBe('["say Hello!","wait 1"]');
  });
});

// ---------------------------------------------------------------------------
// Quest rows
// ---------------------------------------------------------------------------

describe('questToTableRows', () => {
  const quest = new QuestRecord({
    vnum: 10010,
    name: 'Test Quest',
    description: 'Kill the dragon.',
    acceptMessage: 'Good luck!',
    completeMessage: 'Well done!',
    quitMessage: 'Quitter.',
    questType: 3,
    questTypeName: 'Kill mob',
    questmasterVnum: 10001,
    questFlags: ['REPEATABLE'],
    questFlagsBits: 'a',
    targetVnum: 10050,
    prevQuestVnum: null,
    nextQuestVnum: null,
    prerequisiteVnum: null,
    pointsReward: 10,
    pointsPenalty: 5,
    minLevel: 5,
    maxLevel: 30,
    timeLimit: 60,
    returnMobVnum: null,
    quantity: 1,
    goldReward: 500,
    experienceReward: 1000,
    objectRewardVnum: null,
    source: { fileName: '/data/world/qst/100.qst', startLine: 1 },
  });

  it('emits a single quests table', () => {
    const ctx = makeCtx();
    const tables = questToTableRows(quest, ctx);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.table).toBe('quests');
  });

  it('quest_type is resolved name', () => {
    const ctx = makeCtx();
    const row = questToTableRows(quest, ctx)[0]!.rows[0]!;
    const cols = questToTableRows(quest, ctx)[0]!.columns;
    expect(row[cols.indexOf('quest_type')]).toBe('Kill mob');
  });

  it('quest derives zone_vnum', () => {
    const ctx = makeCtx();
    const row = questToTableRows(quest, ctx)[0]!.rows[0]!;
    expect(row[1]).toBe(100); // zone_vnum for vnum 10010 → zone 100 (10000–10099)
  });
});

// ---------------------------------------------------------------------------
// Helpers for column-index lookups in tests
// ---------------------------------------------------------------------------

function tables_of(record: MobileRecord, ctx: EmitContext) {
  return mobileToTableRows(record, ctx);
}

function tables_indexOf(
  tables: ReturnType<typeof mobileToTableRows>,
  tableName: string,
  col: string,
): number {
  const t = tables.find((t) => t.table === tableName)!;
  return t.columns.indexOf(col);
}
