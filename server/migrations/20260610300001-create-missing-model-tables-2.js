'use strict';

/**
 * Creates remaining 18 tables that have Sequelize models but no migration.
 * Part 2 of the Phase 3 clean install fix (2026-06-10).
 * All use IF NOT EXISTS for idempotency.
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`
      CREATE TABLE IF NOT EXISTS cost_centers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        parent_id INT,
        level ENUM('COMPANY','BUSINESS_UNIT','DEPARTMENT','SUB_DEPARTMENT') DEFAULT 'DEPARTMENT',
        owner_id INT,
        approver_id INT,
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        module VARCHAR(255) NOT NULL,
        action VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS leaseagreements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        client_id INT NOT NULL,
        ownership_type ENUM('OWNED','LEASED') DEFAULT 'OWNED',
        lessor_name VARCHAR(255),
        lease_start_date DATE,
        lease_end_date DATE,
        monthly_payment DECIMAL(15,2) DEFAULT 0,
        interest_rate DECIMAL(8,4) DEFAULT 0,
        lease_type ENUM('FINANCE','OPERATING') DEFAULT 'FINANCE',
        renewal_option TEXT,
        termination_option TEXT,
        early_termination_penalty DECIMAL(15,2) DEFAULT 0,
        rou_asset_value DECIMAL(15,2) DEFAULT 0,
        lease_liability_value DECIMAL(15,2) DEFAULT 0,
        status ENUM('ACTIVE','TERMINATED','EXPIRED') DEFAULT 'ACTIVE',
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS compliance_calendar (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        obligation_name VARCHAR(255) NOT NULL,
        obligation_type ENUM('IND_AS_16','SCHEDULE_VI','ITR_FA','CARO','CUSTOM') NOT NULL,
        due_date DATE NOT NULL,
        frequency ENUM('MONTHLY','QUARTERLY','ANNUALLY','ONE_TIME') DEFAULT 'ANNUALLY',
        status ENUM('PENDING','COMPLETED','OVERDUE') DEFAULT 'PENDING',
        completed_date DATE,
        completed_by INT,
        reminder_days_before INT DEFAULT 30,
        notes TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS gl_account_mappings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        category_id INT,
        cost_center_id INT,
        event_type ENUM('ACQUISITION','DEPRECIATION','DISPOSAL','TRANSFER','REVALUATION') NOT NULL,
        debit_account_code VARCHAR(50) NOT NULL,
        debit_account_name VARCHAR(255),
        credit_account_code VARCHAR(50) NOT NULL,
        credit_account_name VARCHAR(255),
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS asset_cost_allocations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        cost_center_id INT NOT NULL,
        allocation_percentage DECIMAL(5,2) DEFAULT 100,
        allocation_basis ENUM('MANUAL','FLOOR_SPACE','HEADCOUNT','USAGE') DEFAULT 'MANUAL',
        effective_from DATE,
        effective_to DATE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS asset_revaluations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        client_id INT,
        revaluation_date DATE NOT NULL,
        previous_carrying_amount DECIMAL(15,2) DEFAULT 0,
        fair_value DECIMAL(15,2) NOT NULL,
        surplus_deficit DECIMAL(15,2) DEFAULT 0,
        revaluation_reserve DECIMAL(15,2) DEFAULT 0,
        valuer_name VARCHAR(255),
        valuer_report_ref VARCHAR(255),
        remarks TEXT,
        gl_posted TINYINT(1) DEFAULT 0,
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS asset_transfers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        client_id INT,
        from_company_id INT,
        to_company_id INT,
        transfer_date DATE NOT NULL,
        transfer_value DECIMAL(15,2) DEFAULT 0,
        nbv_at_transfer DECIMAL(15,2) DEFAULT 0,
        gain_loss DECIMAL(15,2) DEFAULT 0,
        transfer_reason TEXT,
        status ENUM('PENDING','APPROVED','COMPLETED','REJECTED') DEFAULT 'PENDING',
        approved_by INT,
        approved_at DATETIME,
        gl_posted TINYINT(1) DEFAULT 0,
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS asset_merges (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        merged_asset_id INT NOT NULL,
        source_asset_ids JSON NOT NULL,
        total_cost DECIMAL(15,2) DEFAULT 0,
        total_accumulated_depreciation DECIMAL(15,2) DEFAULT 0,
        merge_date DATE NOT NULL,
        remarks TEXT,
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS asset_forecasts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        forecast_name VARCHAR(255) NOT NULL,
        forecast_type ENUM('REPLACEMENT','CAPEX','WHAT_IF') DEFAULT 'REPLACEMENT',
        parameters JSON,
        results JSON,
        horizon_years INT DEFAULT 5,
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS assetphotos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        context ENUM('INWARD','AUDIT','ISSUE','DISPOSAL','GENERAL') DEFAULT 'GENERAL',
        photo_url VARCHAR(500) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        caption VARCHAR(255),
        latitude DECIMAL(10,7),
        longitude DECIMAL(10,7),
        uploaded_by INT,
        client_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS audit_findings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        audit_plan_id INT,
        asset_id INT,
        finding_type ENUM('OBSERVATION','EXCEPTION','NON_COMPLIANCE','RECOMMENDATION') DEFAULT 'OBSERVATION',
        severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'MEDIUM',
        title VARCHAR(500) NOT NULL,
        description TEXT,
        recommendation TEXT,
        management_response TEXT,
        status ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED','DEFERRED') DEFAULT 'OPEN',
        due_date DATE,
        resolved_date DATE,
        assigned_to INT,
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS disposal_bids (
        id INT AUTO_INCREMENT PRIMARY KEY,
        disposal_id INT NOT NULL,
        bidder_name VARCHAR(255) NOT NULL,
        bid_amount DECIMAL(15,2) NOT NULL,
        bid_date DATE,
        is_selected TINYINT(1) DEFAULT 0,
        remarks TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS far_period_locks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        period_end DATE NOT NULL,
        locked_by INT NOT NULL,
        locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        digital_signature_hash VARCHAR(128),
        remarks TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS session_registry (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_id INT,
        token_hash VARCHAR(128) NOT NULL,
        ip_address VARCHAR(45),
        user_agent VARCHAR(500),
        device_fingerprint VARCHAR(128),
        expires_at DATETIME,
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS sod_conflict_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        action_a VARCHAR(100) NOT NULL,
        action_b VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        severity ENUM('WARNING','BLOCK') DEFAULT 'BLOCK',
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS sod_violations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        user_id INT NOT NULL,
        rule_id INT NOT NULL,
        action_performed VARCHAR(100),
        entity_type VARCHAR(50),
        entity_id INT,
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved TINYINT(1) DEFAULT 0,
        resolved_by INT,
        resolved_at DATETIME
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS sso_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        provider ENUM('AZURE_AD','OKTA','GOOGLE','SAML_GENERIC','OIDC_GENERIC') NOT NULL,
        is_enabled TINYINT(1) DEFAULT 0,
        entity_id VARCHAR(500),
        sso_url VARCHAR(500),
        certificate TEXT,
        client_oidc_id VARCHAR(255),
        client_oidc_secret VARCHAR(255),
        metadata_url VARCHAR(500),
        default_role VARCHAR(50) DEFAULT 'REQUESTER',
        auto_provision TINYINT(1) DEFAULT 1,
        group_role_mapping JSON,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  },

  async down(queryInterface) {
    const tables = [
      'sso_configs', 'sod_violations', 'sod_conflict_rules', 'session_registry',
      'far_period_locks', 'disposal_bids', 'audit_findings', 'assetphotos',
      'asset_forecasts', 'asset_merges', 'asset_transfers', 'asset_revaluations',
      'asset_cost_allocations', 'gl_account_mappings', 'compliance_calendar',
      'leaseagreements', 'permissions', 'cost_centers'
    ];
    for (const t of tables) {
      try { await queryInterface.dropTable(t); } catch(e) { /* skip */ }
    }
  }
};
