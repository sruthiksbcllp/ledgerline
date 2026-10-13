/**
 * Master Data Safety Utility
 * Provides a reliable fallback for nested master data objects.
 * Prevents "undefined" map errors in multi-select and filter components.
 */
export const safeMasters = (masters) => ({
  categories: masters?.categories || [],
  locations: masters?.locations || [],
  departments: masters?.departments || [],
  properties: masters?.properties || [],
  depts: masters?.depts || [],
  locs: masters?.locs || []
});
