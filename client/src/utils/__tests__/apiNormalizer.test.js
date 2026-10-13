import { describe, it, expect } from 'vitest';
import { normalizeResponse, getApiErrorMessage, unwrapSettledCollection } from '../apiNormalizer';

describe('normalizeResponse — the data-shape guard used across every list page', () => {
  it('returns [] for null/undefined', () => {
    expect(normalizeResponse(null)).toEqual([]);
    expect(normalizeResponse(undefined)).toEqual([]);
  });
  it('passes a raw array through', () => {
    expect(normalizeResponse([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it('unwraps an axios response { data: [...] }', () => {
    expect(normalizeResponse({ data: [{ id: 1 }] })).toEqual([{ id: 1 }]);
  });
  it('unwraps the standard success wrapper { success:true, data:[...] }', () => {
    expect(normalizeResponse({ success: true, data: [{ id: 9 }] })).toEqual([{ id: 9 }]);
  });
  it('unwraps a paginated payload { data: { rows:[...] } }', () => {
    expect(normalizeResponse({ data: { rows: [{ id: 2 }], count: 1 } })).toEqual([{ id: 2 }]);
  });
  it('unwraps axios -> success wrapper -> rows (deeply nested)', () => {
    const res = { data: { success: true, data: { rows: [{ id: 5 }] } } };
    expect(normalizeResponse(res)).toEqual([{ id: 5 }]);
  });
  it('handles the assets key { data: { assets:[...] } }', () => {
    expect(normalizeResponse({ data: { assets: [{ id: 7 }] } })).toEqual([{ id: 7 }]);
  });
  it('falls back to the first array value on an odd object', () => {
    expect(normalizeResponse({ meta: {}, list: [{ id: 3 }] })).toEqual([{ id: 3 }]);
  });
  it('returns [] for an object with no array anywhere', () => {
    expect(normalizeResponse({ a: 1, b: { c: 2 } })).toEqual([]);
  });
});

describe('getApiErrorMessage', () => {
  it('prefers response.data.message', () => {
    expect(getApiErrorMessage({ response: { data: { message: 'boom' } } })).toBe('boom');
  });
  it('falls to response.data.error, then error.message, then fallback', () => {
    expect(getApiErrorMessage({ response: { data: { error: 'e2' } } })).toBe('e2');
    expect(getApiErrorMessage({ message: 'e3' })).toBe('e3');
    expect(getApiErrorMessage({}, 'default')).toBe('default');
  });
});

describe('unwrapSettledCollection', () => {
  it('normalizes a fulfilled Promise.allSettled value', () => {
    expect(unwrapSettledCollection({ status: 'fulfilled', value: { data: [{ id: 1 }] } })).toEqual([{ id: 1 }]);
  });
  it('returns [] for a rejected settled result', () => {
    expect(unwrapSettledCollection({ status: 'rejected', reason: new Error('x') })).toEqual([]);
  });
});
