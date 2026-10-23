/**
 * Frontend API Response Handler
 * Standardizes raw Axios responses into reliable data arrays or objects.
 */

export const handleResponse = (res) => {
  if (!res) return [];

  // 1. Handle Interceptor-Processed Body { success, data, ... }
  if (res.success && res.data !== undefined) {
    const data = res.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (Array.isArray(data.assets)) return data.assets;
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.data)) return data.data;
    }
    return data;
  }

  // 2. Handle Raw Axios Response { data: { success, data, ... } }
  if (res.data?.success) {
    const data = res.data.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (Array.isArray(data.assets)) return data.assets;
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.data)) return data.data;
    }
    return data;
  }

  // 3. Fallback for raw arrays
  const finalData = res.data || res;
  if (Array.isArray(finalData)) return finalData;

  return [];
};
