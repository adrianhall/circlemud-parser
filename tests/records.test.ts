import { describe, expect, it } from 'vitest';

import { MudRecord, WorldRecord, ZoneRecord } from '../src/records.js';
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
