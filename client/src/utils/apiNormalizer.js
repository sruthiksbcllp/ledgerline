/**
 * Enterprise API Response Normalizer
 * Ensures consistent array-based data structures across all application modules.
 * Handles raw arrays, standard success wrappers, and nested data properties.
 */
export const normalizeResponse = (res) => {
  if (!res) return [];
  if (Array.isArray(res)) return res;

  const visited = new Set();
  let source = res;

  // Walk through common axios/success wrapper shapes until we reach the payload.
  while (source && typeof source === 'object' && !Array.isArray(source) && !visited.has(source)) {
    visited.add(source);

    if (Array.isArray(source)) return source;
    if (Array.isArray(source.data)) return source.data;
    if (Array.isArray(source.rows)) return source.rows;
    if (Array.isArray(source.items)) return source.items;
    if (Array.isArray(source.results)) return source.results;
    if (Array.isArray(source.assets)) return source.assets;

    if (source.success === true && source.data !== undefined) {
      source = source.data;
      continue;
    }

    if (source.data && typeof source.data === 'object') {
      source = source.data;
      continue;
    }

    break;
  }

  if (Array.isArray(source)) return source;

  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const firstArray = Object.values(source).find((val) => Array.isArray(val));
    if (Array.isArray(firstArray)) return firstArray;
  }

  return [];
};

export const getApiErrorMessage = (error, fallback = 'Failed to load data') =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  fallback;

export const unwrapSettledCollection = (result) =>
  result.status === 'fulfilled' ? normalizeResponse(result.value) : [];
