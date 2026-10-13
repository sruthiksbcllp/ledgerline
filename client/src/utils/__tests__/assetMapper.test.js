import { describe, it, expect } from 'vitest';
import { mapAsset } from '../assetMapper';

describe('mapAsset — flattens the many association shapes into flat *_name fields', () => {
  it('prefers an already-flat field', () => {
    const a = mapAsset({ category_name: 'IT', location_name: 'HQ', department_name: 'Ops' });
    expect(a.category_name).toBe('IT');
    expect(a.location_name).toBe('HQ');
    expect(a.department_name).toBe('Ops');
  });
  it('falls back through nested lowercase and PascalCase associations', () => {
    const a = mapAsset({
      category: { category_name: 'Computers' },
      Location: { location_name: 'Mumbai' },
      Department: { dept_name: 'Finance' },
    });
    expect(a.category_name).toBe('Computers');
    expect(a.location_name).toBe('Mumbai');
    expect(a.department_name).toBe('Finance');
  });
  it('defaults amc_status to NONE and preserves other fields', () => {
    const a = mapAsset({ id: 5, asset_code: 'AST-1' });
    expect(a.id).toBe(5);
    expect(a.asset_code).toBe('AST-1');
    expect(a.amc_status).toBe('NONE');
    expect(a.category_name).toBe('');
  });
});
