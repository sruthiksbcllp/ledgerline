import { describe, it, expect } from 'vitest';
import { formatCurrency, toNumberSafe, formatINR, formatDate } from '../format';

describe('toNumberSafe', () => {
  it('handles null/undefined/empty as 0', () => {
    expect(toNumberSafe(null)).toBe(0);
    expect(toNumberSafe(undefined)).toBe(0);
    expect(toNumberSafe('')).toBe(0);
  });
  it('passes finite numbers through and rejects NaN/Infinity', () => {
    expect(toNumberSafe(42.5)).toBe(42.5);
    expect(toNumberSafe(NaN)).toBe(0);
    expect(toNumberSafe(Infinity)).toBe(0);
  });
  it('strips thousands separators and real decimals', () => {
    expect(toNumberSafe('1,23,456')).toBe(123456);
    expect(toNumberSafe('-2,500.75')).toBe(-2500.75);
    expect(toNumberSafe('abc')).toBe(0);
  });
  it('strips currency symbols and stray dots (the "Rs." bug fix)', () => {
    // A dot that is not preceded by a digit is a symbol artefact, not a decimal.
    expect(toNumberSafe('Rs. 500')).toBe(500);
    expect(toNumberSafe('Rs. 1,23,456')).toBe(123456);
    expect(toNumberSafe('Rs. 2,00,000')).toBe(200000);
  });
  it('keeps only the first decimal point when input has several', () => {
    expect(toNumberSafe('1.234.56')).toBeCloseTo(1.23456);
  });
});

describe('formatINR (Indian grouping)', () => {
  it('groups lakhs/crores', () => {
    expect(formatINR(12345678)).toBe('1,23,45,678');
  });
  it('adds the Rs. symbol only when asked', () => {
    expect(formatINR(1000, { withSymbol: true })).toBe('Rs. 1,000');
    expect(formatINR(1000)).toBe('1,000');
  });
  it('coerces a symbol-prefixed, comma-grouped string correctly', () => {
    expect(formatINR('Rs. 2,00,000')).toBe('2,00,000');
  });
});

describe('formatCurrency', () => {
  it('returns empty string for blank but formats 0', () => {
    expect(formatCurrency(null)).toBe('');
    expect(formatCurrency('')).toBe('');
    expect(formatCurrency(0)).toBe('0');
  });
});

describe('formatDate', () => {
  it('returns - for falsy dates', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('')).toBe('-');
  });
  it('formats an ISO date to en-IN dd Mon yyyy', () => {
    const out = formatDate('2026-07-02T10:00:00Z');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/Jul/);
  });
});
