'use strict';

/**
 * Uploaded files kept in the database (STORAGE_DRIVER=db), for hosts whose disk is wiped on
 * restart (e.g. Render free). `storage_key` is the path under UPLOAD_DIR, e.g. "invoices/123-bill.pdf".
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => String(t.tableName || t).toLowerCase());
    if (tables.includes('stored_files')) return;
    await queryInterface.createTable('stored_files', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      storage_key: { type: Sequelize.STRING(500), allowNull: false, unique: true },
      content: { type: Sequelize.BLOB('long'), allowNull: false },
      mime_type: { type: Sequelize.STRING(150), allowNull: true },
      size: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('stored_files');
  }
};
