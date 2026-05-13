import { describe, expect, it } from 'vitest';

import { MudRecord, ObjectRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

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
