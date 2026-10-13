'use strict';

/**
 * Adds missing columns to asset_alerts table that the AssetAlert model
 * and alertEngine.service.js expect but the original CREATE TABLE omitted.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addCol = async (col, type) => {
      try {
        await queryInterface.addColumn('asset_alerts', col, type);
      } catch (e) {
        if (e.original?.code === 'ER_DUP_FIELDNAME') return; // already exists
        throw e;
      }
    };

    await addCol('reference_id',  { type: Sequelize.INTEGER, allowNull: true });
    await addCol('property_id',   { type: Sequelize.INTEGER, allowNull: true });
    await addCol('severity',      { type: Sequelize.STRING(20), defaultValue: 'MEDIUM' });
    await addCol('message',       { type: Sequelize.TEXT, allowNull: true });
    await addCol('scanner_id',    { type: Sequelize.STRING(50), allowNull: true });
    await addCol('assigned_to',   { type: Sequelize.INTEGER, allowNull: true });
    await addCol('trigger_date',  { type: Sequelize.DATE, allowNull: true });
    await addCol('updated_at',    { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });
  },

  async down(queryInterface) {
    const dropCol = async (col) => {
      try { await queryInterface.removeColumn('asset_alerts', col); } catch { /* ignore */ }
    };
    await dropCol('reference_id');
    await dropCol('property_id');
    await dropCol('severity');
    await dropCol('message');
    await dropCol('scanner_id');
    await dropCol('assigned_to');
    await dropCol('trigger_date');
    await dropCol('updated_at');
  }
};
