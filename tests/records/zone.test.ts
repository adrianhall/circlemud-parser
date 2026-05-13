import { describe, expect, it } from 'vitest';

import { MudRecord, ZoneRecord } from '../../src/records/index.js';
import { RecordType } from '../../src/types.js';

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
