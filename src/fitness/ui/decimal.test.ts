import { describe, expect, it } from 'vitest';

import { parseDecimalInput } from './decimal';

describe('parseDecimalInput', () => {
  it('parses a dot-separated decimal', () => {
    expect(parseDecimalInput('12.5')).toBe(12.5);
  });

  it('parses a comma-separated decimal (FIT-030)', () => {
    expect(parseDecimalInput('12,5')).toBe(12.5);
  });

  it('parses an integer', () => {
    expect(parseDecimalInput('0')).toBe(0);
    expect(parseDecimalInput('7')).toBe(7);
  });

  it('trims surrounding whitespace', () => {
    expect(parseDecimalInput('  12,5  ')).toBe(12.5);
  });

  it('returns null for empty or blank input', () => {
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('   ')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('1,2,3')).toBeNull();
  });

  it('parses negative values; non-negativity is enforced by callers', () => {
    expect(parseDecimalInput('-0.5')).toBe(-0.5);
  });
});
