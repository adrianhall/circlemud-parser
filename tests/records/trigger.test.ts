import { describe, expect, it } from 'vitest';

import { MudRecord, TriggerRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

describe('TriggerRecord', () => {
  it('preserves trigger fields and serializes to plain JSON', () => {
    const triggerType = ['Greet'];
    const commands = ['say Welcome.', 'wait 1 sec'];
    const record = new TriggerRecord({
      vnum: 200,
      name: 'Welcome Trigger',
      attachType: 0,
      attachTypeName: 'Mobile',
      triggerType,
      triggerTypeBits: 'g',
      numericArg: 100,
      argList: null,
      commands,
      source: { fileName: '2.trg', startLine: 1, endLine: 7 },
    });

    triggerType.push('Random');
    commands.push('say mutated');

    expect(record).toBeInstanceOf(MudRecord);
    expect(record.recordType).toBe(RecordType.Trigger);
    expect(record.vnum).toBe(200);
    expect(record.toJSON()).toEqual({
      recordType: 'trigger',
      vnum: 200,
      name: 'Welcome Trigger',
      attachType: 0,
      attachTypeName: 'Mobile',
      triggerType: ['Greet'],
      triggerTypeBits: 'g',
      numericArg: 100,
      argList: null,
      commands: ['say Welcome.', 'wait 1 sec'],
      source: { fileName: '2.trg', startLine: 1, endLine: 7 },
    });
  });

  it('omits optional source when absent', () => {
    const record = new TriggerRecord({
      vnum: 201,
      name: null,
      attachType: 2,
      attachTypeName: 'World',
      triggerType: [],
      triggerTypeBits: '0',
      numericArg: 0,
      argList: null,
      commands: [],
    });

    expect(record.toJSON()).not.toHaveProperty('source');
  });
});
