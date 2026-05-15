import { describe, expect, it } from 'vitest';

import { parseIndexFile } from '../../src/cli/index-file.js';

describe('parseIndexFile', () => {
  it('parses a standard $-terminated index', () => {
    const content = '0.zon\n12.zon\n30.zon\n$\n';
    expect(parseIndexFile(content)).toEqual(['0.zon', '12.zon', '30.zon']);
  });

  it('stops at $ even with trailing content', () => {
    const content = 'a.wld\nb.wld\n$~\nignored.wld\n';
    expect(parseIndexFile(content)).toEqual(['a.wld', 'b.wld']);
  });

  it('skips blank lines', () => {
    const content = 'first.zon\n\nsecond.zon\n$\n';
    expect(parseIndexFile(content)).toEqual(['first.zon', 'second.zon']);
  });

  it('returns all files when $ is missing', () => {
    const content = 'a.mob\nb.mob';
    expect(parseIndexFile(content)).toEqual(['a.mob', 'b.mob']);
  });

  it('returns empty array for $ on first line', () => {
    const content = '$\na.zon\n';
    expect(parseIndexFile(content)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parseIndexFile('')).toEqual([]);
  });

  it('trims whitespace from file names', () => {
    const content = '  a.zon  \n  b.zon  \n$\n';
    expect(parseIndexFile(content)).toEqual(['a.zon', 'b.zon']);
  });
});
