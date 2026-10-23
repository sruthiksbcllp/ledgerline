'use strict';
const cache = new Map();
const TTL = 24 * 60 * 60 * 1000;
exports.get = (gstin) => {
  const e = cache.get(gstin);
  return e && Date.now() < e.expires ? e.data : null;
};
exports.set = (gstin, data) => cache.set(gstin, { data, expires: Date.now() + TTL });
exports.clear = () => cache.clear();

