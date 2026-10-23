/**
 * Lightweight Caching Utility
 * Helps reduce redundant API calls for static master data.
 */

const CACHE_PREFIX = 'fams_cache_';
const DEFAULT_EXPIRY = 30 * 60 * 1000; // 30 minutes

export const setCache = (key, data, expiry = DEFAULT_EXPIRY) => {
  const item = {
    data,
    expiry: Date.now() + expiry
  };
  localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
};

export const getCache = (key) => {
  const itemStr = localStorage.getItem(CACHE_PREFIX + key);
  if (!itemStr) return null;
  
  const item = JSON.parse(itemStr);
  if (Date.now() > item.expiry) {
    localStorage.removeItem(CACHE_PREFIX + key);
    return null;
  }
  
  return item.data;
};

export const clearCache = (key) => {
  if (key) {
    localStorage.removeItem(CACHE_PREFIX + key);
  } else {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    });
  }
};
