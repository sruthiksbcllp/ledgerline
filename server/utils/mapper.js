'use strict';

/**
 * Maps database model data to a standard dropdown format { id, name }
 * @param {Array} data - Array of objects
 * @param {string} key - The key to use as the 'name' field
 * @returns {Array} - Array of objects with id and name
 */
exports.mapToDropdown = (data, key) => {
  return data.map(item => ({
    id: item.id,
    name: item[key]
  }));
};
