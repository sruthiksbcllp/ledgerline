'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // ── Gap 3: Component Replacement Tracking ──
      const [compCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='assets' AND COLUMN_NAME='replaced_by_id'",
        { transaction: t }
      );
      if (!compCols.length) {
        await queryInterface.addColumn('assets', 'replaced_by_id', { type: Sequelize.INTEGER, allowNull: true, references: { model: 'assets', key: 'id' } }, { transaction: t });
        await queryInterface.addColumn('assets', 'replacement_date', { type: Sequelize.DATEONLY, allowNull: true }, { transaction: t });
        await queryInterface.addColumn('assets', 'replacement_reason', { type: Sequelize.STRING(500), allowNull: true }, { transaction: t });
        await queryInterface.addColumn('assets', 'is_retired_component', { type: Sequelize.BOOLEAN, defaultValue: false }, { transaction: t });
      }

      // ── Gap 4: Asset Revaluation ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS asset_revaluations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          asset_id INT NOT NULL,
          client_id INT,
          revaluation_date DATE NOT NULL,
          previous_carrying_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
          fair_value DECIMAL(15,2) NOT NULL,
          surplus_deficit DECIMAL(15,2) NOT NULL DEFAULT 0,
          revaluation_reserve DECIMAL(15,2) NOT NULL DEFAULT 0,
          valuer_name VARCHAR(255),
          valuer_report_ref VARCHAR(255),
          remarks TEXT,
          gl_posted BOOLEAN DEFAULT FALSE,
          created_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (asset_id) REFERENCES assets(id)
        )
      `, { transaction: t });

      // Add valuation_model to assets
      const [valCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='assets' AND COLUMN_NAME='valuation_model'",
        { transaction: t }
      );
      if (!valCols.length) {
        await queryInterface.addColumn('assets', 'valuation_model', {
          type: Sequelize.ENUM('COST', 'REVALUATION'), defaultValue: 'COST'
        }, { transaction: t });
        await queryInterface.addColumn('assets', 'last_revaluation_date', { type: Sequelize.DATEONLY, allowNull: true }, { transaction: t });
        await queryInterface.addColumn('assets', 'revalued_amount', { type: Sequelize.DECIMAL(15,2), defaultValue: 0 }, { transaction: t });
        await queryInterface.addColumn('assets', 'revaluation_reserve', { type: Sequelize.DECIMAL(15,2), defaultValue: 0 }, { transaction: t });
      }

      // ── Gap 5: Inter-company Transfer ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS asset_transfers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          asset_id INT NOT NULL,
          client_id INT,
          from_company_id INT,
          to_company_id INT,
          transfer_date DATE NOT NULL,
          transfer_value DECIMAL(15,2) NOT NULL DEFAULT 0,
          nbv_at_transfer DECIMAL(15,2) NOT NULL DEFAULT 0,
          gain_loss DECIMAL(15,2) NOT NULL DEFAULT 0,
          transfer_reason TEXT,
          status ENUM('PENDING','APPROVED','COMPLETED','REJECTED') DEFAULT 'PENDING',
          approved_by INT,
          approved_at DATETIME,
          gl_posted BOOLEAN DEFAULT FALSE,
          created_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (asset_id) REFERENCES assets(id)
        )
      `, { transaction: t });

      // ── Gap 6: Asset Merging ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS asset_merges (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT,
          merged_asset_id INT NOT NULL COMMENT 'The new combined asset',
          source_asset_ids JSON NOT NULL COMMENT 'Array of original asset IDs',
          total_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
          total_accumulated_depreciation DECIMAL(15,2) NOT NULL DEFAULT 0,
          merge_date DATE NOT NULL,
          remarks TEXT,
          created_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (merged_asset_id) REFERENCES assets(id)
        )
      `, { transaction: t });

      // ── Gap 9: Asset Forecasting ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS asset_forecasts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT,
          forecast_name VARCHAR(255) NOT NULL,
          forecast_type ENUM('REPLACEMENT','CAPEX','WHAT_IF') DEFAULT 'REPLACEMENT',
          parameters JSON COMMENT 'inflation_rate, useful_life_override, etc.',
          results JSON COMMENT 'year-by-year projections',
          horizon_years INT DEFAULT 5,
          created_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `, { transaction: t });

      // ── Gap 10: Cost Center ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS cost_centers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT,
          code VARCHAR(50) NOT NULL,
          name VARCHAR(255) NOT NULL,
          parent_id INT,
          level ENUM('COMPANY','BUSINESS_UNIT','DEPARTMENT','SUB_DEPARTMENT') DEFAULT 'DEPARTMENT',
          is_active BOOLEAN DEFAULT TRUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `, { transaction: t });

      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS asset_cost_allocations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          asset_id INT NOT NULL,
          cost_center_id INT NOT NULL,
          allocation_percentage DECIMAL(5,2) NOT NULL DEFAULT 100,
          allocation_basis ENUM('MANUAL','FLOOR_SPACE','HEADCOUNT','USAGE') DEFAULT 'MANUAL',
          effective_from DATE,
          effective_to DATE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (asset_id) REFERENCES assets(id),
          FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id)
        )
      `, { transaction: t });

      // ── Gap 11: GL Account Mapping ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS gl_account_mappings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT,
          category_id INT COMMENT 'Asset category — NULL means default for all',
          cost_center_id INT,
          event_type ENUM('ACQUISITION','DEPRECIATION','DISPOSAL','TRANSFER','REVALUATION') NOT NULL,
          debit_account_code VARCHAR(50) NOT NULL,
          debit_account_name VARCHAR(255),
          credit_account_code VARCHAR(50) NOT NULL,
          credit_account_name VARCHAR(255),
          is_active BOOLEAN DEFAULT TRUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `, { transaction: t });

      // ── Gap 12: Statutory FAR Controls ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS far_period_locks (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT NOT NULL,
          period_end DATE NOT NULL,
          locked_by INT NOT NULL,
          locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          digital_signature_hash VARCHAR(128),
          remarks TEXT,
          UNIQUE KEY uk_client_period (client_id, period_end)
        )
      `, { transaction: t });

      // ── Gap 13: Audit Findings ──
      await queryInterface.sequelize.query(`
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `, { transaction: t });

      // ── Gap 14: Compliance Calendar ──
      await queryInterface.sequelize.query(`
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `, { transaction: t });

      // ── Gap 15: Approval enhancements ──
      const [quorumCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='approval_workflows' AND COLUMN_NAME='quorum_required'",
        { transaction: t }
      );
      if (!quorumCols.length) {
        try {
          await queryInterface.addColumn('approval_workflows', 'quorum_required', { type: Sequelize.INTEGER, defaultValue: 0, comment: 'N-of-M: how many approvers needed (0=all)' }, { transaction: t });
          await queryInterface.addColumn('approval_workflows', 'sla_hours', { type: Sequelize.INTEGER, defaultValue: 0, comment: 'Auto-escalate after N hours (0=disabled)' }, { transaction: t });
          await queryInterface.addColumn('approval_workflows', 'escalation_role', { type: Sequelize.STRING(50), allowNull: true }, { transaction: t });
          await queryInterface.addColumn('approval_workflows', 'category_id', { type: Sequelize.INTEGER, allowNull: true, comment: 'Route by asset category' }, { transaction: t });
        } catch(e) { /* columns may already exist */ }
      }

      // ── Gap 16: SOD ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS sod_conflict_rules (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT,
          action_a VARCHAR(100) NOT NULL COMMENT 'e.g. ASSET_CREATE',
          action_b VARCHAR(100) NOT NULL COMMENT 'e.g. ASSET_APPROVE',
          description VARCHAR(500),
          severity ENUM('WARNING','BLOCK') DEFAULT 'BLOCK',
          is_active BOOLEAN DEFAULT TRUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, { transaction: t });

      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS sod_violations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT,
          user_id INT NOT NULL,
          rule_id INT NOT NULL,
          action_performed VARCHAR(100),
          entity_type VARCHAR(50),
          entity_id INT,
          detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved BOOLEAN DEFAULT FALSE,
          resolved_by INT,
          resolved_at DATETIME,
          FOREIGN KEY (rule_id) REFERENCES sod_conflict_rules(id)
        )
      `, { transaction: t });

      // ── Gap 17: SSO ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS sso_configs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT NOT NULL,
          provider ENUM('AZURE_AD','OKTA','GOOGLE','SAML_GENERIC','OIDC_GENERIC') NOT NULL,
          is_enabled BOOLEAN DEFAULT FALSE,
          entity_id VARCHAR(500) COMMENT 'SP Entity ID',
          sso_url VARCHAR(500) COMMENT 'IdP SSO URL',
          certificate TEXT COMMENT 'IdP X.509 cert',
          client_oidc_id VARCHAR(255),
          client_oidc_secret VARCHAR(255),
          metadata_url VARCHAR(500),
          default_role VARCHAR(50) DEFAULT 'REQUESTER',
          auto_provision BOOLEAN DEFAULT TRUE,
          group_role_mapping JSON COMMENT '{"Admins":"SUPER_ADMIN","Users":"REQUESTER"}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_client_provider (client_id, provider)
        )
      `, { transaction: t });

      // ── Gap 18: Session Controls ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS session_registry (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          client_id INT,
          token_hash VARCHAR(128) NOT NULL,
          ip_address VARCHAR(45),
          user_agent VARCHAR(500),
          device_fingerprint VARCHAR(128),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          is_active BOOLEAN DEFAULT TRUE,
          KEY idx_user (user_id),
          KEY idx_token (token_hash)
        )
      `, { transaction: t });

      // Add session config columns to clients
      const [sessCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='clients' AND COLUMN_NAME='idle_timeout_minutes'",
        { transaction: t }
      );
      if (!sessCols.length) {
        try {
          await queryInterface.addColumn('clients', 'idle_timeout_minutes', { type: Sequelize.INTEGER, defaultValue: 30 }, { transaction: t });
          await queryInterface.addColumn('clients', 'max_concurrent_sessions', { type: Sequelize.INTEGER, defaultValue: 5 }, { transaction: t });
          await queryInterface.addColumn('clients', 'ip_whitelist', { type: Sequelize.JSON, allowNull: true, comment: 'Array of allowed CIDRs' }, { transaction: t });
        } catch(e) { /* may exist */ }
      }

      // ── Gap 19: Per-tenant API keys ──
      const [scopeCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='api_keys' AND COLUMN_NAME='scopes'",
        { transaction: t }
      );
      if (!scopeCols.length) {
        try {
          await queryInterface.addColumn('api_keys', 'scopes', { type: Sequelize.JSON, allowNull: true, comment: '["assets:read","assets:write"]' }, { transaction: t });
          await queryInterface.addColumn('api_keys', 'rate_limit', { type: Sequelize.INTEGER, defaultValue: 1000, comment: 'Per-key requests/15min' }, { transaction: t });
          await queryInterface.addColumn('api_keys', 'request_count', { type: Sequelize.INTEGER, defaultValue: 0 }, { transaction: t });
          await queryInterface.addColumn('api_keys', 'last_reset_at', { type: Sequelize.DATE, allowNull: true }, { transaction: t });
        } catch(e) { /* may exist */ }
      }

      // ── Gap 20: Request Workflow SLA ──
      const [slaCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='approval_logs' AND COLUMN_NAME='sla_due_at'",
        { transaction: t }
      );
      if (!slaCols.length) {
        try {
          await queryInterface.addColumn('approval_logs', 'sla_due_at', { type: Sequelize.DATE, allowNull: true }, { transaction: t });
          await queryInterface.addColumn('approval_logs', 'escalated', { type: Sequelize.BOOLEAN, defaultValue: false }, { transaction: t });
          await queryInterface.addColumn('approval_logs', 'escalated_to', { type: Sequelize.INTEGER, allowNull: true }, { transaction: t });
          await queryInterface.addColumn('approval_logs', 'escalated_at', { type: Sequelize.DATE, allowNull: true }, { transaction: t });
        } catch(e) { /* may exist */ }
      }

      // ── Gap 21: Disposal Enhancements ──
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS disposal_bids (
          id INT AUTO_INCREMENT PRIMARY KEY,
          disposal_id INT NOT NULL,
          bidder_name VARCHAR(255) NOT NULL,
          bid_amount DECIMAL(15,2) NOT NULL,
          bid_date DATE,
          is_selected BOOLEAN DEFAULT FALSE,
          remarks TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, { transaction: t });

      const [dispCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='assetdisposals' AND COLUMN_NAME='disposal_method'",
        { transaction: t }
      );
      if (!dispCols.length) {
        try {
          await queryInterface.addColumn('assetdisposals', 'disposal_method', {
            type: Sequelize.ENUM('SALE','SCRAP','WRITE_OFF','AUCTION','DONATION'), defaultValue: 'SALE'
          }, { transaction: t });
          await queryInterface.addColumn('assetdisposals', 'salvage_justification', { type: Sequelize.TEXT, allowNull: true }, { transaction: t });
          await queryInterface.addColumn('assetdisposals', 'minimum_bid_amount', { type: Sequelize.DECIMAL(15,2), defaultValue: 0 }, { transaction: t });
          await queryInterface.addColumn('assetdisposals', 'committee_approval_required', { type: Sequelize.BOOLEAN, defaultValue: false }, { transaction: t });
        } catch(e) { /* may exist */ }
      }

      // ── Gap 7: Advanced Depreciation — add usage_based fields to assetaccounting ──
      const [uopCols] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='assetaccounting' AND COLUMN_NAME='total_production_units'",
        { transaction: t }
      );
      if (!uopCols.length) {
        try {
          await queryInterface.addColumn('assetaccounting', 'total_production_units', { type: Sequelize.DECIMAL(15,2), defaultValue: 0 }, { transaction: t });
          await queryInterface.addColumn('assetaccounting', 'units_produced_to_date', { type: Sequelize.DECIMAL(15,2), defaultValue: 0 }, { transaction: t });
          await queryInterface.addColumn('assetaccounting', 'declining_balance_rate', { type: Sequelize.DECIMAL(5,2), defaultValue: 0 }, { transaction: t });
        } catch(e) { /* may exist */ }
      }

      await t.commit();
      console.log('Migration 20260607500000 — Gaps 3-21 enterprise tables/columns applied');
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    // Reverse in production would be dangerous — only for dev
    const tables = [
      'disposal_bids', 'sod_violations', 'sod_conflict_rules',
      'session_registry', 'sso_configs', 'compliance_calendar',
      'audit_findings', 'far_period_locks', 'gl_account_mappings',
      'asset_cost_allocations', 'cost_centers', 'asset_forecasts',
      'asset_merges', 'asset_transfers', 'asset_revaluations'
    ];
    for (const tbl of tables) {
      await queryInterface.dropTable(tbl).catch(() => {});
    }
  }
};
