'use strict';
const { IdSequence, sequelize } = require('../models');

/**
 * Generates the next unique code for a given prefix atomically.
 * Uses a raw INSERT IGNORE + SELECT FOR UPDATE to avoid Sequelize
 * findOrCreate race conditions that produce prefix-mismatch errors.
 */
exports.getNextCode = async (prefix, padding) => {
  if (padding === undefined) padding = 4;
  // Step 1: Ensure row exists (INSERT IGNORE is safe under concurrency)
  await sequelize.query(
    'INSERT IGNORE INTO idsequences (`prefix`, `last_value`, `createdAt`, `updatedAt`) VALUES (?, 0, NOW(), NOW())',
    { replacements: [prefix] }
  );
  // Step 2: Atomic increment with SELECT FOR UPDATE in a transaction
  var nextValue = await sequelize.transaction(async function(t) {
    var rows = await sequelize.query(
      'SELECT `last_value` FROM idsequences WHERE `prefix` = ? FOR UPDATE',
      { replacements: [prefix], type: sequelize.QueryTypes.SELECT, transaction: t }
    );
    var current = Number(rows[0].last_value);
    var next = current + 1;
    await sequelize.query(
      'UPDATE idsequences SET `last_value` = ?, `updatedAt` = NOW() WHERE `prefix` = ?',
      { replacements: [next, prefix], transaction: t }
    );
    return next;
  });
  return prefix + '-' + String(nextValue).padStart(padding, '0');
};
