import { describe, expect, it } from 'vitest';

import { hello, VERSION } from '../src/index.js';

describe('index', () => {
  it('exports a semantic version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('says hello', () => {
    expect(hello()).toBe('Hello, world!');
    expect(hello('Adrian')).toBe('Hello, Adrian!');
  });
});
