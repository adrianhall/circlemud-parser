import { describe, expect, it } from 'vitest';

import { MudParserError, UnsupportedRecordTypeError } from '../src/errors.js';
import { RecordType } from '../src/types.js';

describe('MudParserError', () => {
  it('preserves message and context fields', () => {
    const cause = new Error('root cause');
    const error = new MudParserError('parse failed', {
      cause,
      recordType: RecordType.World,
      source: {
        fileName: '30.wld',
        startLine: 12,
        endLine: 15,
      },
      vnum: 3000,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MudParserError);
    expect(error.name).toBe('MudParserError');
    expect(error.message).toBe('parse failed');
    expect(error.cause).toBe(cause);
    expect(error.recordType).toBe(RecordType.World);
    expect(error.source).toEqual({ fileName: '30.wld', startLine: 12, endLine: 15 });
    expect(error.vnum).toBe(3000);
  });

  it('supports construction without context', () => {
    const error = new MudParserError('parse failed');

    expect(error.message).toBe('parse failed');
    expect(error.source).toBeUndefined();
    expect(error.recordType).toBeUndefined();
    expect(error.vnum).toBeUndefined();
  });
});

describe('UnsupportedRecordTypeError', () => {
  it('preserves the unsupported file name and default message', () => {
    const error = new UnsupportedRecordTypeError('area.txt');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MudParserError);
    expect(error).toBeInstanceOf(UnsupportedRecordTypeError);
    expect(error.name).toBe('UnsupportedRecordTypeError');
    expect(error.fileName).toBe('area.txt');
    expect(error.message).toBe("Cannot infer record type from file name 'area.txt'");
  });

  it('accepts context without a custom message', () => {
    const error = new UnsupportedRecordTypeError('area.txt', {
      recordType: RecordType.World,
      source: {
        fileName: 'manifest.lst',
        startLine: 2,
      },
      vnum: 100,
    });

    expect(error.fileName).toBe('area.txt');
    expect(error.recordType).toBe(RecordType.World);
    expect(error.source).toEqual({ fileName: 'manifest.lst', startLine: 2 });
    expect(error.vnum).toBe(100);
  });

  it('accepts a custom message and context', () => {
    const cause = new Error('bad path');
    const error = new UnsupportedRecordTypeError('area.txt', 'Unsupported extension', {
      cause,
    });

    expect(error.message).toBe('Unsupported extension');
    expect(error.cause).toBe(cause);
  });
});
