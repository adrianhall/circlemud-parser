import { describe, expect, it } from 'vitest';

import { MudRecord, WorldRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

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
