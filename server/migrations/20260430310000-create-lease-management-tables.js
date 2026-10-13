'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS leaseagreements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        client_id INT NOT NULL,
        ownership_type ENUM('OWNED', 'LEASED') DEFAULT 'OWNED',
        lessor_name VARCHAR(255) NULL,
        lease_start_date DATE NULL,
        lease_end_date DATE NULL,
        monthly_payment DECIMAL(15, 2) DEFAULT 0,
        interest_rate DECIMAL(8, 4) DEFAULT 0,
        lease_type ENUM('FINANCE', 'OPERATING') DEFAULT 'FINANCE',
        renewal_option TEXT NULL,
        termination_option TEXT NULL,
        early_termination_penalty DECIMAL(15, 2) DEFAULT 0,
        rou_asset_value DECIMAL(15, 2) DEFAULT 0,
        lease_liability_value DECIMAL(15, 2) DEFAULT 0,
        status ENUM('ACTIVE', 'TERMINATED', 'EXPIRED') DEFAULT 'ACTIVE',
        created_by INT NULL,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS leaseschedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lease_id INT NOT NULL,
        client_id INT NOT NULL,
        period_number INT NOT NULL,
        period_date DATE NOT NULL,
        opening_liability DECIMAL(15, 2) DEFAULT 0,
        payment_amount DECIMAL(15, 2) DEFAULT 0,
        interest_amount DECIMAL(15, 2) DEFAULT 0,
        principal_amount DECIMAL(15, 2) DEFAULT 0,
        closing_liability DECIMAL(15, 2) DEFAULT 0,
        rou_opening_value DECIMAL(15, 2) DEFAULT 0,
        rou_amortization DECIMAL(15, 2) DEFAULT 0,
        rou_closing_value DECIMAL(15, 2) DEFAULT 0,
        due_in_days INT DEFAULT 0
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS leasejournalentries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lease_id INT NOT NULL,
        client_id INT NOT NULL,
        period_number INT NOT NULL,
        period_date DATE NOT NULL,
        entry_type ENUM('INITIAL_RECOGNITION', 'INTEREST', 'PAYMENT', 'AMORTIZATION') NOT NULL,
        debit_account VARCHAR(255) NOT NULL,
        credit_account VARCHAR(255) NOT NULL,
        amount DECIMAL(15, 2) DEFAULT 0,
        narration TEXT NULL
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS leasejournalentries');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS leaseschedules');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS leaseagreements');
  }
};
