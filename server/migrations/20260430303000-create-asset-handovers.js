'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS assethandovers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        from_user_id INT NULL,
        from_user_name VARCHAR(200) NULL,
        to_user_id INT NOT NULL,
        to_user_name VARCHAR(200) NULL,
        handover_date DATE NOT NULL,
        condition_at_handover ENUM('GOOD','FAIR','POOR') DEFAULT 'GOOD',
        remarks TEXT NULL,
        acknowledged TINYINT(1) DEFAULT 0,
        acknowledged_at DATETIME NULL,
        client_id INT NOT NULL,
        created_by INT NULL,
        created_at DATETIME DEFAULT NOW()
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS assethandovers');
  }
};
