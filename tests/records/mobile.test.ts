import { describe, expect, it } from 'vitest';

import { MobileRecord, MudRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

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
