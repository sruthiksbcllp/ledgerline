import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock the axios instance the picker uses. Path is relative to THIS test file.
vi.mock('../../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  safeApiCall: vi.fn(),
}));

import api from '../../utils/api';
import AssetPicker from '../AssetPicker';

const properties = [{ id: 1, property_name: 'HQ' }, { id: 2, property_name: 'Plant' }];
const locations = [
  { id: 10, property_id: 1, location_name: 'HQ Floor 1' },
  { id: 20, property_id: 2, location_name: 'Plant Bay' },
];
const assets = [
  { id: 100, property_id: 1, location_id: 10, asset_code: 'AST-1' },
  { id: 200, property_id: 2, location_id: 20, asset_code: 'AST-2' },
];

beforeEach(() => {
  api.get.mockImplementation((url) => {
    if (url === '/masters/properties') return Promise.resolve({ data: properties });
    if (url === '/masters/locations') return Promise.resolve({ data: locations });
    if (url === '/assets') return Promise.resolve({ data: { assets } });
    return Promise.resolve({ data: [] });
  });
});

describe('AssetPicker (cascading Property -> Location -> Asset)', () => {
  it('fetches all three masters on mount', async () => {
    render(<AssetPicker />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/masters/properties');
      expect(api.get).toHaveBeenCalledWith('/masters/locations');
      expect(api.get).toHaveBeenCalledWith('/assets', { params: { limit: 1000 } });
    });
  });

  it('renders the three cascading selects with the asset count once data loads', async () => {
    render(<AssetPicker />);
    expect(screen.getByText('1. Filter by Property')).toBeInTheDocument();
    expect(screen.getByText('2. Filter by Location / Centre')).toBeInTheDocument();
    // placeholder shows the filtered asset count -> proves fetch + normalize + filter pipeline ran
    await waitFor(() => expect(screen.getByText('3. Select Asset (2)')).toBeInTheDocument());
  });

  it('degrades gracefully to empty selects if the API rejects', async () => {
    api.get.mockRejectedValue(new Error('network'));
    render(<AssetPicker />);
    await waitFor(() =>
      expect(screen.getByText('1. Filter by Property')).toBeInTheDocument()
    );
  });
});
