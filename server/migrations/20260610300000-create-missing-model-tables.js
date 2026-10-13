'use strict';

/**
 * Creates all tables that have Sequelize models but were never covered by
 * any migration.  Every CREATE uses IF NOT EXISTS so the migration is
 * safe to run on an existing database that already has some/all of them.
 *
 * Generated during Phase 3 — Clean Install Validation (2026-06-10).
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // ── Alerts & Actions ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT,
        alert_type ENUM('UNKNOWN_TAG','MOVEMENT','AUDIT','SYSTEM','SLA') NOT NULL,
        severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'MEDIUM',
        module ENUM('ASSET','AUDIT','INVENTORY','SYSTEM') NOT NULL,
        reference_id INT,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status ENUM('OPEN','IN_PROGRESS','RESOLVED','ESCALATED') DEFAULT 'OPEN',
        assigned_to INT,
        created_by INT,
        resolved_at DATETIME,
        due_at DATETIME,
        is_sla_breached TINYINT(1) DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS alert_actions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        alert_id INT NOT NULL,
        action_type ENUM('ASSIGNED','COMMENTED','STATUS_CHANGE','ESCALATED') NOT NULL,
        performed_by INT NOT NULL,
        comments TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── API Keys ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS apikeys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_id INT NOT NULL,
        api_key VARCHAR(255) NOT NULL UNIQUE,
        secret_key VARCHAR(255) NOT NULL UNIQUE,
        label VARCHAR(255),
        status ENUM('ACTIVE','REVOKED') DEFAULT 'ACTIVE',
        last_used DATETIME,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Asset Audit Logs ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS asset_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT DEFAULT 1,
        asset_id INT NOT NULL,
        status VARCHAR(20) NOT NULL,
        remarks TEXT,
        verified_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Asset Scan Logs ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS asset_scan_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tag_id VARCHAR(100) NOT NULL,
        asset_id INT,
        location_id INT,
        scanner_id VARCHAR(50),
        scan_type ENUM('QR','RFID') NOT NULL,
        scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        raw_payload JSON
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Asset Types ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS asset_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        code VARCHAR(255) NOT NULL UNIQUE,
        status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Audit Module Tables ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS audit_ai_insights (
        id INT AUTO_INCREMENT PRIMARY KEY,
        audit_session_id INT NOT NULL,
        summary TEXT,
        risk_analysis_json JSON,
        compliance_flags_json JSON,
        ai_insights_json JSON,
        recommended_actions_json JSON,
        is_latest TINYINT(1) DEFAULT 1,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS audit_assets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        audit_session_id INT NOT NULL,
        asset_id INT NOT NULL,
        expected_location_id INT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS audit_evidence (
        id INT AUTO_INCREMENT PRIMARY KEY,
        audit_session_id INT NOT NULL,
        asset_id INT NOT NULL,
        image_url VARCHAR(255) NOT NULL,
        remarks TEXT,
        created_by INT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS audit_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        audit_session_id INT NOT NULL,
        asset_id INT NOT NULL,
        expected_location_id INT,
        found_location_id INT,
        status ENUM('PENDING','FOUND','MISSING','EXTRA') DEFAULT 'PENDING',
        scanned_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS audit_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        audit_session_id INT NOT NULL,
        asset_id INT,
        status ENUM('FOUND','MISSING','EXTRA','MISMATCH') NOT NULL,
        expected_location_id INT,
        actual_location_id INT,
        remarks TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS audit_risk_scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        audit_session_id INT NOT NULL,
        risk_type VARCHAR(255) NOT NULL,
        severity ENUM('low','medium','high') NOT NULL,
        score DECIMAL(5,2) NOT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS audit_scans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        audit_session_id INT NOT NULL,
        asset_id INT,
        rfid_tag VARCHAR(255),
        qr_code VARCHAR(255),
        scanned_location_id INT,
        scanned_by INT,
        scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Direct Procurement ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS direct_procurements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        invoice_number VARCHAR(100),
        invoice_date DATETIME,
        total_amount DECIMAL(12,2),
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── GRN Item Serials ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS grn_item_serials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        grn_item_id INT NOT NULL,
        serial_number VARCHAR(255) NOT NULL,
        status ENUM('AVAILABLE','ASSIGNED','REJECTED') DEFAULT 'AVAILABLE',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Movement Rules ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS movement_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT DEFAULT 1,
        rule_type ENUM('RESTRICTED_LOCATION','AFTER_HOURS','DEPARTMENT_CHANGE') DEFAULT 'RESTRICTED_LOCATION',
        condition_value VARCHAR(255),
        requires_approval TINYINT(1) DEFAULT 1,
        is_active TINYINT(1) DEFAULT 1,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Provider/Service ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS provider_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        provider_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS provider_asset_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        provider_id INT NOT NULL,
        asset_id INT NOT NULL,
        status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS service_tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT NOT NULL,
        provider_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED') DEFAULT 'OPEN',
        priority ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'MEDIUM',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Scanning ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS scanners (
        scanner_id VARCHAR(50) PRIMARY KEY,
        api_key VARCHAR(100) NOT NULL,
        location_id INT,
        status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS scan_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT DEFAULT 1,
        asset_id INT,
        scanned_code VARCHAR(100),
        scan_type VARCHAR(20),
        user_id INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS unknown_tag_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tag_id VARCHAR(100) NOT NULL,
        scanner_id VARCHAR(50),
        location_id INT,
        scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        raw_payload JSON
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── User Sessions ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        refresh_token_hash TEXT NOT NULL,
        ip_address VARCHAR(100),
        user_agent TEXT,
        is_revoked TINYINT(1) DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Vendor Extensions ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS vendor_change_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL DEFAULT 1,
        vendor_id INT NOT NULL,
        change_type VARCHAR(50) DEFAULT 'MASTER_CHANGE',
        before_json JSON,
        after_json JSON,
        requested_by INT,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_by INT,
        approved_at DATETIME,
        status ENUM('PENDING','APPROVED','REJECTED','CANCELLED') DEFAULT 'PENDING',
        decision_notes TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS vendor_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL DEFAULT 1,
        vendor_id INT NOT NULL,
        document_type ENUM('GST','PAN','CONTRACT','MSME','INSURANCE','COMPLIANCE','OTHER') DEFAULT 'OTHER',
        document_name VARCHAR(255) NOT NULL,
        file_name VARCHAR(255),
        file_path TEXT,
        mime_type VARCHAR(255),
        file_size INT,
        expiry_date DATETIME,
        status ENUM('ACTIVE','EXPIRING','EXPIRED','ARCHIVED') DEFAULT 'ACTIVE',
        uploaded_by INT,
        remarks TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS vendor_risk_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL DEFAULT 1,
        vendor_id INT NOT NULL,
        event_type ENUM('RISK_CALCULATED','DOCUMENT_UPLOADED','REMINDER_CREATED','APPROVAL_SUBMITTED','APPROVAL_APPROVED','APPROVAL_REJECTED','VENDOR_UPDATED') NOT NULL,
        old_band VARCHAR(20),
        new_band VARCHAR(20),
        old_score INT,
        new_score INT,
        summary VARCHAR(255) NOT NULL,
        details_json JSON,
        created_by INT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Verification Details ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS verificationdetails (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT NOT NULL,
        item_id INT NOT NULL,
        system_qty DECIMAL(10,2) NOT NULL,
        physical_qty DECIMAL(10,2) NOT NULL,
        is_verified TINYINT(1) DEFAULT 0,
        verified_at DATETIME,
        notes TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  },

  async down(queryInterface) {
    const tables = [
      'verificationdetails', 'vendor_risk_history', 'vendor_documents', 'vendor_change_requests',
      'user_sessions', 'unknown_tag_logs', 'scan_logs', 'scanners', 'service_tickets',
      'provider_asset_assignments', 'provider_users', 'movement_rules', 'grn_item_serials',
      'direct_procurements', 'audit_scans', 'audit_risk_scores', 'audit_results', 'audit_items',
      'audit_evidence', 'audit_assets', 'audit_ai_insights', 'asset_types', 'asset_scan_logs',
      'asset_audit_logs', 'apikeys', 'alert_actions', 'alerts'
    ];
    for (const t of tables) {
      try { await queryInterface.dropTable(t); } catch(e) { /* skip */ }
    }
  }
};
