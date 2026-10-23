'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS assetaccounting_revisions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        changed_by INT NOT NULL,
        changed_at DATETIME NOT NULL DEFAULT NOW(),
        field_name VARCHAR(100) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        reason TEXT
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS assetaccounting_revisions');
  }
};
