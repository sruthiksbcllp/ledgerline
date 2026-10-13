/**
 * Lightweight Backend Cache Service
 * Simple in-memory storage for frequently accessed master data.
 */

const cache = new Map();

/**
 * Set a value in the cache with a Time-To-Live (TTL)
 * @param {string} key 
 * @param {any} data 
 * @param {number} ttl - Time to live in milliseconds (default 5 minutes)
 */
const setCache = (key, data, ttl = 300000) => {
  cache.set(key, {
    data,
    expiry: Date.now() + ttl,
  });
};

/**
 * Get a value from the cache
 * @param {string} key 
 * @returns {any|null}
 */
const getCache = (key) => {
  const item = cache.get(key);
  if (!item) return null;

  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }

  return item.data;
};

/**
 * Invalidate a cache key or clear everything
 * @param {string} key 
 */
const clearCache = (key) => {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
};

module.exports = {
  setCache,
  getCache,
  clearCache
};
