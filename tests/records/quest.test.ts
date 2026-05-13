import { describe, expect, it } from 'vitest';

import { MudRecord, QuestRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

describe('QuestRecord', () => {
  it('preserves quest fields and serializes to plain JSON', () => {
    const questFlags = ['REPEATABLE'];
    const record = new QuestRecord({
      vnum: 100,
      name: 'Kill the Mice!',
      description: 'mice',
      acceptMessage: 'Accept.\n',
      completeMessage: 'Complete.\n',
      quitMessage: 'Quit.\n',
      questType: 3,
      questTypeName: 'Kill mob',
      questmasterVnum: 179,
      questFlags,
      questFlagsBits: 'a',
      targetVnum: 194,
      prevQuestVnum: null,
      nextQuestVnum: null,
      prerequisiteVnum: null,
      pointsReward: 10,
      pointsPenalty: 1,
      minLevel: 1,
      maxLevel: 34,
      timeLimit: 60,
      returnMobVnum: null,
      quantity: 3,
      goldReward: 100,
      experienceReward: 200,
      objectRewardVnum: 65535,
      source: { fileName: '1.qst', startLine: 1, endLine: 14 },
    });

    questFlags.push('UNKNOWN_12');

    expect(record).toBeInstanceOf(MudRecord);
    expect(record.recordType).toBe(RecordType.Quest);
    expect(record.vnum).toBe(100);
    expect(record.toJSON()).toEqual({
      recordType: 'quest',
      vnum: 100,
      name: 'Kill the Mice!',
      description: 'mice',
      acceptMessage: 'Accept.\n',
      completeMessage: 'Complete.\n',
      quitMessage: 'Quit.\n',
      questType: 3,
      questTypeName: 'Kill mob',
      questmasterVnum: 179,
      questFlags: ['REPEATABLE'],
      questFlagsBits: 'a',
      targetVnum: 194,
      prevQuestVnum: null,
      nextQuestVnum: null,
      prerequisiteVnum: null,
      pointsReward: 10,
      pointsPenalty: 1,
      minLevel: 1,
      maxLevel: 34,
      timeLimit: 60,
      returnMobVnum: null,
      quantity: 3,
      goldReward: 100,
      experienceReward: 200,
      objectRewardVnum: 65535,
      source: { fileName: '1.qst', startLine: 1, endLine: 14 },
    });
  });

  it('omits optional source when absent', () => {
    const record = new QuestRecord({
      vnum: 101,
      name: null,
      description: null,
      acceptMessage: null,
      completeMessage: null,
      quitMessage: null,
      questType: 0,
      questTypeName: 'Object',
      questmasterVnum: null,
      questFlags: [],
      questFlagsBits: '0',
      targetVnum: null,
      prevQuestVnum: null,
      nextQuestVnum: null,
      prerequisiteVnum: null,
      pointsReward: 0,
      pointsPenalty: 0,
      minLevel: 0,
      maxLevel: 0,
      timeLimit: 0,
      returnMobVnum: null,
      quantity: 0,
      goldReward: 0,
      experienceReward: 0,
      objectRewardVnum: null,
    });

    expect(record.toJSON()).not.toHaveProperty('source');
  });
});
