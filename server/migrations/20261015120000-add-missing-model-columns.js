'use strict';

/**
 * A database built from scratch with the migration history ends up without some columns the
 * models write (e.g. purchase_requisition_items.created_at), which fails inserts with
 * "Unknown column ... in 'field list'". This adds every column a model declares but its
 * table lacks. Columns that already exist are left alone, so on an up-to-date database
 * this is a no-op. New columns are nullable (or defaulted) so existing rows stay valid.
 */
const TIMESTAMP_FIELDS = new Set(['created_at', 'updated_at', 'createdAt', 'updatedAt']);

module.exports = {
  async up(queryInterface, Sequelize) {
    const db = require('../models');
    for (const model of Object.values(db)) {
      if (!model || !model.rawAttributes || typeof model.getTableName !== 'function') continue;
      const tableRef = model.getTableName();
      const table = typeof tableRef === 'object' ? tableRef.tableName : tableRef;
      let columns;
      try {
        columns = await queryInterface.describeTable(table);
      } catch (_) {
        continue; // table not created on this database; out of scope here
      }
      for (const attr of Object.values(model.rawAttributes)) {
        if (!attr.field || attr.field in columns) continue;
        if (attr.type && attr.type.key === 'VIRTUAL') continue;
        const definition = TIMESTAMP_FIELDS.has(attr.field)
          ? { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
          : {
              type: attr.type,
              allowNull: true,
              ...(attr.defaultValue !== undefined && typeof attr.defaultValue !== 'function' && typeof attr.defaultValue !== 'object'
                ? { defaultValue: attr.defaultValue }
                : {})
            };
        await queryInterface.addColumn(table, attr.field, definition);
        columns[attr.field] = true;
      }
    }
  },

  async down() {
    // Columns may already hold data written by the application. Leave them in place.
  }
};
