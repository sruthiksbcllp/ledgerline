'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS capexbudgets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        financial_year VARCHAR(10) NOT NULL,
        department_id INT NULL,
        category_id INT NULL,
        allocated_amount DECIMAL(15, 2) DEFAULT 0,
        approved_amount DECIMAL(15, 2) DEFAULT 0,
        actual_spend DECIMAL(15, 2) DEFAULT 0,
        committed_spend DECIMAL(15, 2) DEFAULT 0,
        created_by INT NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS capexrequests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        request_number VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        department_id INT NULL,
        category_id INT NULL,
        amount DECIMAL(15, 2) DEFAULT 0,
        threshold_level INT DEFAULT 1,
        status ENUM('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PROCURED') DEFAULT 'REQUESTED',
        linked_po_id INT NULL,
        linked_grn_id INT NULL,
        created_by INT NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS capexprojections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        capex_request_id INT NULL,
        asset_category_id INT NULL,
        projection_month DATE NOT NULL,
        projected_amount DECIMAL(15, 2) DEFAULT 0,
        projected_depreciation DECIMAL(15, 2) DEFAULT 0,
        notes TEXT NULL,
        created_at DATETIME DEFAULT NOW()
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS capexprojections');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS capexrequests');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS capexbudgets');
  }
};
