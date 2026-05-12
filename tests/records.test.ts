import { describe, expect, it } from 'vitest';

import { MobileRecord, MudRecord, ObjectRecord, WorldRecord, ZoneRecord } from '../src/records.js';
import { RecordType } from '../src/types.js';

describe('WorldRecord', () => {
  it('preserves world fields and serializes to plain JSON', () => {
    const roomFlags = ['NO_MOB'];
    const directionKeywords = ['door'];
    const directionFlags = ['DOOR'];
    const extraKeywords = ['credits', 'info'];
    const triggerVnums = [1200];
    const record = new WorldRecord({
      vnum: 3000,
      name: 'The Reading Room',
      description: '   You are in a small room.\n',
      roomFlags,
      roomFlagsBits: 'c 0 0 0',
      sectorType: 0,
      directions: [
        {
          direction: 0,
          description: 'A north door.\n',
          keywords: directionKeywords,
          exitFlags: directionFlags,
          exitFlagsBits: 'a',
          keyVnum: 3001,
          toRoomVnum: 3002,
        },
      ],
      extraDescriptions: [
        {
          keywords: extraKeywords,
          description: 'Extra text.\n',
        },
      ],
      triggerVnums,
      source: { fileName: '30.wld', startLine: 1, endLine: 12 },
    });

    roomFlags.push('DARK');
    directionKeywords.push('gate');
    directionFlags.push('LOCKED');
    extraKeywords.push('extra');
    triggerVnums.push(1201);

    expect(record).toBeInstanceOf(MudRecord);
    expect(record.recordType).toBe(RecordType.World);
    expect(record.vnum).toBe(3000);
    expect(record.toJSON()).toEqual({
      recordType: 'world',
      vnum: 3000,
      name: 'The Reading Room',
      description: '   You are in a small room.\n',
      roomFlags: ['NO_MOB'],
      roomFlagsBits: 'c 0 0 0',
      sectorType: 0,
      directions: [
        {
          direction: 0,
          description: 'A north door.\n',
          keywords: ['door'],
          exitFlags: ['DOOR'],
          exitFlagsBits: 'a',
          keyVnum: 3001,
          toRoomVnum: 3002,
        },
      ],
      extraDescriptions: [
        {
          keywords: ['credits', 'info'],
          description: 'Extra text.\n',
        },
      ],
      triggerVnums: [1200],
      source: { fileName: '30.wld', startLine: 1, endLine: 12 },
    });
  });

  it('omits optional source when absent', () => {
    const record = new WorldRecord({
      vnum: 3001,
      name: 'Empty Room',
      description: null,
      roomFlags: [],
      roomFlagsBits: '0 0 0 0',
      sectorType: 0,
      directions: [],
      extraDescriptions: [],
      triggerVnums: [],
    });

    expect(record.toJSON()).toEqual({
      recordType: 'world',
      vnum: 3001,
      name: 'Empty Room',
      description: null,
      roomFlags: [],
      roomFlagsBits: '0 0 0 0',
      sectorType: 0,
      directions: [],
      extraDescriptions: [],
      triggerVnums: [],
    });
  });
});

describe('MobileRecord', () => {
  it('preserves mobile fields and serializes to plain JSON', () => {
    const aliases = ['guard', 'sentinel'];
    const actionFlags = ['SPEC'];
    const affectFlags = ['BLIND'];
    const triggerVnums = [1200];
    const stats = {
      level: 10,
      hitroll: 12,
      armorClass: -5,
      hitDice: { count: 2, sides: 8, bonus: 20 },
      damageDice: { count: 1, sides: 6, bonus: 3 },
      gold: 50,
      experience: 1000,
      position: 8,
      defaultPosition: 8,
      sex: 1,
    };
    const enhanced = { str: 18, savingPara: 2 };
    const record = new MobileRecord({
      vnum: 3000,
      aliases,
      shortDescription: 'a test guard',
      longDescription: 'A test guard stands here.',
      description: 'He watches carefully.',
      actionFlags,
      actionFlagsBits: 'a 0 0 0',
      affectFlags,
      affectFlagsBits: 'b 0 0 0',
      alignment: -100,
      kind: 'enhanced',
      stats,
      enhanced,
      triggerVnums,
      source: { fileName: '30.mob', startLine: 1, endLine: 12 },
    });

    aliases.push('watcher');
    actionFlags.push('ISNPC');
    affectFlags.push('INVIS');
    triggerVnums.push(1201);
    stats.hitDice.count = 99;
    enhanced.str = 25;

    expect(record).toBeInstanceOf(MudRecord);
    expect(record.recordType).toBe(RecordType.Mobile);
    expect(record.vnum).toBe(3000);
    expect(record.toJSON()).toEqual({
      recordType: 'mobile',
      vnum: 3000,
      aliases: ['guard', 'sentinel'],
      shortDescription: 'a test guard',
      longDescription: 'A test guard stands here.',
      description: 'He watches carefully.',
      actionFlags: ['SPEC'],
      actionFlagsBits: 'a 0 0 0',
      affectFlags: ['BLIND'],
      affectFlagsBits: 'b 0 0 0',
      alignment: -100,
      kind: 'enhanced',
      stats: {
        level: 10,
        hitroll: 12,
        armorClass: -5,
        hitDice: { count: 2, sides: 8, bonus: 20 },
        damageDice: { count: 1, sides: 6, bonus: 3 },
        gold: 50,
        experience: 1000,
        position: 8,
        defaultPosition: 8,
        sex: 1,
      },
      enhanced: { str: 18, savingPara: 2 },
      triggerVnums: [1200],
      source: { fileName: '30.mob', startLine: 1, endLine: 12 },
    });
  });

  it('omits optional source and enhanced fields when absent', () => {
    const record = new MobileRecord({
      vnum: 3001,
      aliases: [],
      shortDescription: null,
      longDescription: null,
      description: null,
      actionFlags: [],
      actionFlagsBits: '0 0 0 0',
      affectFlags: [],
      affectFlagsBits: '0 0 0 0',
      alignment: 0,
      kind: 'simple',
      stats: {
        level: 0,
        hitroll: 0,
        armorClass: 0,
        hitDice: { count: 0, sides: 0, bonus: 0 },
        damageDice: { count: 0, sides: 0, bonus: 0 },
        gold: 0,
        experience: 0,
        position: 0,
        defaultPosition: 0,
        sex: 0,
      },
      triggerVnums: [],
    });

    expect(record.toJSON()).toEqual({
      recordType: 'mobile',
      vnum: 3001,
      aliases: [],
      shortDescription: null,
      longDescription: null,
      description: null,
      actionFlags: [],
      actionFlagsBits: '0 0 0 0',
      affectFlags: [],
      affectFlagsBits: '0 0 0 0',
      alignment: 0,
      kind: 'simple',
      stats: {
        level: 0,
        hitroll: 0,
        armorClass: 0,
        hitDice: { count: 0, sides: 0, bonus: 0 },
        damageDice: { count: 0, sides: 0, bonus: 0 },
        gold: 0,
        experience: 0,
        position: 0,
        defaultPosition: 0,
        sex: 0,
      },
      triggerVnums: [],
    });
  });

  it('serializes empty enhanced data when present', () => {
    const record = new MobileRecord({
      vnum: 3002,
      aliases: [],
      shortDescription: null,
      longDescription: null,
      description: null,
      actionFlags: [],
      actionFlagsBits: '0 0 0 0',
      affectFlags: [],
      affectFlagsBits: '0 0 0 0',
      alignment: 0,
      kind: 'enhanced',
      stats: {
        level: 0,
        hitroll: 0,
        armorClass: 0,
        hitDice: { count: 0, sides: 0, bonus: 0 },
        damageDice: { count: 0, sides: 0, bonus: 0 },
        gold: 0,
        experience: 0,
        position: 0,
        defaultPosition: 0,
        sex: 0,
      },
      enhanced: {},
      triggerVnums: [],
    });

    expect(record.toJSON()).toMatchObject({
      recordType: 'mobile',
      vnum: 3002,
      enhanced: {},
    });
  });
});

describe('ObjectRecord', () => {
  it('preserves object fields and serializes to plain JSON', () => {
    const aliases = ['sword', 'blade'];
    const extraFlags = ['GLOW'];
    const wearFlags = ['TAKE'];
    const affectFlags = ['BLIND'];
    const extraKeywords = ['sword'];
    const affects = [{ location: 18, locationName: 'HITROLL', modifier: 5 }];
    const triggerVnums = [1200];
    const record = new ObjectRecord({
      vnum: 3000,
      aliases,
      shortDescription: 'a bright sword',
      description: 'A bright sword lies here.',
      actionDescription: 'Swinging it flashes.',
      objectType: 5,
      objectTypeName: 'WEAPON',
      extraFlags,
      extraFlagsBits: 'a 0 0 0',
      wearFlags,
      wearFlagsBits: 'a 0 0 0',
      affectFlags,
      affectFlagsBits: 'b 0 0 0',
      values: [8, 10, 9, 3],
      weight: 4,
      cost: 100,
      rent: 2,
      level: 20,
      timer: 5,
      extraDescriptions: [
        {
          keywords: extraKeywords,
          description: 'Bright steel.\n',
        },
      ],
      affects,
      triggerVnums,
      source: { fileName: '30.obj', startLine: 1, endLine: 15 },
    });

    aliases.push('weapon');
    extraFlags.push('HUM');
    wearFlags.push('WIELD');
    affectFlags.push('INVIS');
    extraKeywords.push('blade');
    affects.push({ location: 19, locationName: 'DAMROLL', modifier: 4 });
    triggerVnums.push(1201);

    expect(record).toBeInstanceOf(MudRecord);
    expect(record.recordType).toBe(RecordType.Object);
    expect(record.vnum).toBe(3000);
    expect(record.toJSON()).toEqual({
      recordType: 'object',
      vnum: 3000,
      aliases: ['sword', 'blade'],
      shortDescription: 'a bright sword',
      description: 'A bright sword lies here.',
      actionDescription: 'Swinging it flashes.',
      objectType: 5,
      objectTypeName: 'WEAPON',
      extraFlags: ['GLOW'],
      extraFlagsBits: 'a 0 0 0',
      wearFlags: ['TAKE'],
      wearFlagsBits: 'a 0 0 0',
      affectFlags: ['BLIND'],
      affectFlagsBits: 'b 0 0 0',
      values: [8, 10, 9, 3],
      weight: 4,
      cost: 100,
      rent: 2,
      level: 20,
      timer: 5,
      extraDescriptions: [
        {
          keywords: ['sword'],
          description: 'Bright steel.\n',
        },
      ],
      affects: [{ location: 18, locationName: 'HITROLL', modifier: 5 }],
      triggerVnums: [1200],
      source: { fileName: '30.obj', startLine: 1, endLine: 15 },
    });
  });

  it('omits optional source when absent', () => {
    const record = new ObjectRecord({
      vnum: 3001,
      aliases: [],
      shortDescription: null,
      description: null,
      actionDescription: null,
      objectType: 0,
      objectTypeName: 'UNDEFINED',
      extraFlags: [],
      extraFlagsBits: '0 0 0 0',
      wearFlags: [],
      wearFlagsBits: '0 0 0 0',
      affectFlags: [],
      affectFlagsBits: '0 0 0 0',
      values: [0, 0, 0, 0],
      weight: 0,
      cost: 0,
      rent: 0,
      level: 0,
      timer: 0,
      extraDescriptions: [],
      affects: [],
      triggerVnums: [],
    });

    expect(record.toJSON()).toEqual({
      recordType: 'object',
      vnum: 3001,
      aliases: [],
      shortDescription: null,
      description: null,
      actionDescription: null,
      objectType: 0,
      objectTypeName: 'UNDEFINED',
      extraFlags: [],
      extraFlagsBits: '0 0 0 0',
      wearFlags: [],
      wearFlagsBits: '0 0 0 0',
      affectFlags: [],
      affectFlagsBits: '0 0 0 0',
      values: [0, 0, 0, 0],
      weight: 0,
      cost: 0,
      rent: 0,
      level: 0,
      timer: 0,
      extraDescriptions: [],
      affects: [],
      triggerVnums: [],
    });
  });
});

describe('ZoneRecord', () => {
  it('preserves zone fields and serializes to plain JSON', () => {
    const record = new ZoneRecord({
      vnum: 1,
      builders: 'Rumble',
      name: 'Test Zone',
      bottom: 100,
      top: 199,
      lifespan: 10,
      resetMode: 2,
      zoneFlags: ['GRID'],
      zoneFlagsBits: 'd 0 0 0',
      minLevel: 1,
      maxLevel: 34,
      commands: [
        {
          command: 'M',
          ifFlag: 0,
          args: [34, 1, 108],
          stringArgs: [],
          comment: 'Chuck Norris',
          source: { fileName: '1.zon', startLine: 7 },
        },
      ],
      source: { fileName: '1.zon', startLine: 1, endLine: 16 },
    });

    expect(record).toBeInstanceOf(MudRecord);
    expect(record.recordType).toBe(RecordType.Zone);
    expect(record.vnum).toBe(1);
    expect(record.commands).toHaveLength(1);
    expect(record.toJSON()).toEqual({
      recordType: 'zone',
      vnum: 1,
      builders: 'Rumble',
      name: 'Test Zone',
      bottom: 100,
      top: 199,
      lifespan: 10,
      resetMode: 2,
      zoneFlags: ['GRID'],
      zoneFlagsBits: 'd 0 0 0',
      minLevel: 1,
      maxLevel: 34,
      commands: [
        {
          command: 'M',
          ifFlag: 0,
          args: [34, 1, 108],
          stringArgs: [],
          comment: 'Chuck Norris',
          source: { fileName: '1.zon', startLine: 7 },
        },
      ],
      source: { fileName: '1.zon', startLine: 1, endLine: 16 },
    });
  });

  it('omits optional source and command comment fields when absent', () => {
    const record = new ZoneRecord({
      vnum: 12,
      builders: null,
      name: 'Old Zone',
      bottom: 1200,
      top: 1299,
      lifespan: 15,
      resetMode: 2,
      zoneFlags: [],
      zoneFlagsBits: '0 0 0 0',
      minLevel: null,
      maxLevel: null,
      commands: [
        {
          command: 'R',
          ifFlag: 0,
          args: [1206, 1228],
          stringArgs: [],
        },
      ],
    });

    expect(record.toJSON()).toEqual({
      recordType: 'zone',
      vnum: 12,
      builders: null,
      name: 'Old Zone',
      bottom: 1200,
      top: 1299,
      lifespan: 15,
      resetMode: 2,
      zoneFlags: [],
      zoneFlagsBits: '0 0 0 0',
      minLevel: null,
      maxLevel: null,
      commands: [
        {
          command: 'R',
          ifFlag: 0,
          args: [1206, 1228],
          stringArgs: [],
        },
      ],
    });
  });
});
