/**
 * Centralized Master Data Service
 * Provides a single-source-of-truth for all enterprise dropdowns and filters.
 */
import api from '../utils/api';
import { safeApiCall } from './safeApiCall';

export const getSafeMasters = async () => {
  // Fetching individual master tracks to ensure partial success doesn't break the whole UI
  const [categories, locations, departments, properties] = await Promise.all([
    safeApiCall(() => api.get('/masters/categories')),
    safeApiCall(() => api.get('/masters/locations')),
    safeApiCall(() => api.get('/masters/departments')),
    safeApiCall(() => api.get('/masters/properties'))
  ]);

  return {
    categories: categories || [],
    locations: locations || [],
    departments: departments || [],
    properties: properties || []
  };
};
