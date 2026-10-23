'use strict';

/**
 * Creates all tables that have Sequelize models but no prior migration.
 * Every createTable is wrapped in an existence check — safe to re-run.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = async (name) => {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER('${name}') LIMIT 1`
      );
      return rows.length > 0;
    };

    const createIfMissing = async (name, columns) => {
      if (await exists(name)) return;
      await queryInterface.createTable(name, columns);
    };

    // ── clients ────────────────────────────────────────────────────────────
    await createIfMissing('clients', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_name: { type: Sequelize.STRING, allowNull: false },
      contact_person: Sequelize.STRING,
      email: Sequelize.STRING,
      phone: Sequelize.STRING,
      company_type: Sequelize.STRING,
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // ── client_licenses ────────────────────────────────────────────────────
    await createIfMissing('client_licenses', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false },
      plan_name: { type: Sequelize.STRING, allowNull: false },
      max_assets: { type: Sequelize.INTEGER, defaultValue: 100 },
      max_users: { type: Sequelize.INTEGER, defaultValue: 10 },
      start_date: { type: Sequelize.DATE, allowNull: false },
      end_date: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.ENUM('ACTIVE', 'EXPIRED'), defaultValue: 'ACTIVE' },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // ── alerts ─────────────────────────────────────────────────────────────
    await createIfMissing('alerts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      alert_type: { type: Sequelize.ENUM('UNKNOWN_TAG', 'MOVEMENT', 'AUDIT', 'SYSTEM', 'SLA'), allowNull: false },
      severity: { type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'), defaultValue: 'MEDIUM' },
      source_module: { type: Sequelize.ENUM('ASSET', 'AUDIT', 'INVENTORY', 'SYSTEM'), allowNull: false },
      reference_id: Sequelize.INTEGER,
      title: { type: Sequelize.STRING, allowNull: false },
      description: Sequelize.TEXT,
      status: { type: Sequelize.ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED'), defaultValue: 'OPEN' },
      assigned_to: Sequelize.INTEGER,
      created_by: Sequelize.INTEGER,
      resolved_at: Sequelize.DATE,
      due_at: Sequelize.DATE,
      is_sla_breached: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── alert_actions ──────────────────────────────────────────────────────
    await createIfMissing('alert_actions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      alert_id: { type: Sequelize.INTEGER, allowNull: false },
      action_type: { type: Sequelize.ENUM('ASSIGNED', 'COMMENTED', 'STATUS_CHANGE', 'ESCALATED'), allowNull: false },
      performed_by: { type: Sequelize.INTEGER, allowNull: false },
      comments: Sequelize.TEXT,
      created_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── asset_alerts ───────────────────────────────────────────────────────
    await createIfMissing('asset_alerts', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      alert_type: { type: Sequelize.STRING(50), allowNull: false },
      severity: { type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'), defaultValue: 'MEDIUM' },
      message: Sequelize.TEXT,
      asset_id: Sequelize.INTEGER,
      location_id: Sequelize.INTEGER,
      scanner_id: Sequelize.STRING(50),
      status: { type: Sequelize.ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED'), defaultValue: 'OPEN' },
      assigned_to: Sequelize.INTEGER,
      priority: { type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'), defaultValue: 'MEDIUM' },
      client_id: { type: Sequelize.INTEGER, defaultValue: 1 },
      resolved_at: Sequelize.DATE,
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // ── asset_audit_logs ───────────────────────────────────────────────────
    await createIfMissing('asset_audit_logs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: Sequelize.INTEGER, defaultValue: 1 },
      asset_id: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false },
      remarks: Sequelize.TEXT,
      verified_by: Sequelize.INTEGER,
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // ── asset_movements ────────────────────────────────────────────────────
    await createIfMissing('asset_movements', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false },
      movement_type: { type: Sequelize.ENUM('TRANSFER', 'LOAN', 'REPAIR', 'DISPOSAL', 'RETURN'), defaultValue: 'TRANSFER' },
      from_location_id: Sequelize.INTEGER,
      to_location_id: Sequelize.INTEGER,
      from_department_id: Sequelize.INTEGER,
      to_department_id: Sequelize.INTEGER,
      assigned_to_user_id: Sequelize.INTEGER,
      status: { type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'), defaultValue: 'PENDING' },
      movement_date: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      approved_by: Sequelize.INTEGER,
      approved_at: Sequelize.DATE,
      remarks: Sequelize.TEXT,
      created_by: Sequelize.INTEGER,
      updated_by: Sequelize.INTEGER,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── asset_scan_logs ────────────────────────────────────────────────────
    await createIfMissing('asset_scan_logs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      tag_id: { type: Sequelize.STRING(100), allowNull: false },
      asset_id: Sequelize.INTEGER,
      location_id: Sequelize.INTEGER,
      scanner_id: Sequelize.STRING(50),
      scan_type: { type: Sequelize.ENUM('QR', 'RFID'), allowNull: false },
      scanned_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      raw_payload: Sequelize.JSON
    });

    // ── assethandovers ─────────────────────────────────────────────────────
    await createIfMissing('assethandovers', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      asset_id: { type: Sequelize.INTEGER, allowNull: false },
      from_user_id: Sequelize.INTEGER,
      from_user_name: Sequelize.STRING(200),
      to_user_id: { type: Sequelize.INTEGER, allowNull: false },
      to_user_name: Sequelize.STRING(200),
      handover_date: { type: Sequelize.DATEONLY, allowNull: false },
      condition_at_handover: { type: Sequelize.ENUM('GOOD', 'FAIR', 'POOR'), defaultValue: 'GOOD' },
      remarks: Sequelize.TEXT,
      acknowledged: { type: Sequelize.BOOLEAN, defaultValue: false },
      acknowledged_at: Sequelize.DATE,
      client_id: { type: Sequelize.INTEGER, allowNull: false },
      created_by: Sequelize.INTEGER,
      created_at: Sequelize.DATE
    });

    // ── approval_workflows ─────────────────────────────────────────────────
    await createIfMissing('approval_workflows', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false },
      module: { type: Sequelize.STRING, allowNull: false },
      client_id: Sequelize.INTEGER,
      status: { type: Sequelize.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
      approval_topology: { type: Sequelize.ENUM('COLLECTIVE', 'LINE_LEVEL'), defaultValue: 'COLLECTIVE' },
      progression_mode: { type: Sequelize.ENUM('COLLECTIVE', 'PER_LINE'), defaultValue: 'COLLECTIVE' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── approval_matrix ────────────────────────────────────────────────────
    await createIfMissing('approval_matrix', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      workflow_id: { type: Sequelize.INTEGER, allowNull: false },
      client_id: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      module_name: Sequelize.STRING,
      level: { type: Sequelize.INTEGER, allowNull: false },
      role: { type: Sequelize.STRING, allowNull: false },
      role_code: Sequelize.STRING,
      min_amount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      max_amount: Sequelize.DECIMAL(15, 2),
      threshold_amount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      mode: { type: Sequelize.ENUM('LINE', 'COLLECTIVE'), defaultValue: 'COLLECTIVE' },
      is_mandatory: { type: Sequelize.BOOLEAN, defaultValue: true },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true }
    });

    // ── approval_logs ──────────────────────────────────────────────────────
    await createIfMissing('approval_logs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      module: { type: Sequelize.STRING, allowNull: false },
      reference_id: { type: Sequelize.INTEGER, allowNull: false },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      action: { type: Sequelize.ENUM('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'UPDATED', 'ESCALATED'), allowNull: false },
      status: { type: Sequelize.ENUM('SUBMITTED', 'APPROVED', 'REJECTED', 'ESCALATED'), defaultValue: 'SUBMITTED' },
      level: { type: Sequelize.INTEGER, defaultValue: 1 },
      line_item_id: Sequelize.INTEGER,
      approval_topology: { type: Sequelize.ENUM('COLLECTIVE', 'LINE_LEVEL'), defaultValue: 'COLLECTIVE' },
      progression_mode: { type: Sequelize.ENUM('COLLECTIVE', 'PER_LINE'), defaultValue: 'COLLECTIVE' },
      role_code: Sequelize.STRING,
      comments: Sequelize.TEXT,
      timestamp: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // ── notifications ──────────────────────────────────────────────────────
    await createIfMissing('notifications', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      title: { type: Sequelize.STRING, allowNull: false },
      message: Sequelize.TEXT,
      type: Sequelize.STRING(50),
      reference_id: Sequelize.INTEGER,
      reference_type: Sequelize.STRING(50),
      is_read: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── permissions ────────────────────────────────────────────────────────
    await createIfMissing('permissions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      role_id: { type: Sequelize.INTEGER, allowNull: false },
      resource: { type: Sequelize.STRING, allowNull: false },
      action: { type: Sequelize.STRING, allowNull: false },
      is_allowed: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── scanners ───────────────────────────────────────────────────────────
    await createIfMissing('scanners', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      scanner_id: { type: Sequelize.STRING(50), allowNull: false },
      location_id: Sequelize.INTEGER,
      type: { type: Sequelize.ENUM('QR', 'RFID'), defaultValue: 'QR' },
      status: { type: Sequelize.ENUM('ONLINE', 'OFFLINE'), defaultValue: 'OFFLINE' },
      last_seen: Sequelize.DATE,
      client_id: Sequelize.INTEGER,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── scan_logs ──────────────────────────────────────────────────────────
    await createIfMissing('scan_logs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      scanner_id: Sequelize.STRING(50),
      tag_id: Sequelize.STRING(100),
      asset_id: Sequelize.INTEGER,
      location_id: Sequelize.INTEGER,
      scan_type: Sequelize.STRING(20),
      raw_payload: Sequelize.JSON,
      scanned_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // ── unknown_tag_logs ───────────────────────────────────────────────────
    await createIfMissing('unknown_tag_logs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      tag_id: { type: Sequelize.STRING(100), allowNull: false },
      scanner_id: Sequelize.STRING(50),
      location_id: Sequelize.INTEGER,
      client_id: Sequelize.INTEGER,
      scanned_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      resolved: { type: Sequelize.BOOLEAN, defaultValue: false }
    });

    // ── movement_rules ─────────────────────────────────────────────────────
    await createIfMissing('movement_rules', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      from_location_id: Sequelize.INTEGER,
      to_location_id: Sequelize.INTEGER,
      requires_approval: { type: Sequelize.BOOLEAN, defaultValue: false },
      rule_name: Sequelize.STRING,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── user_sessions ──────────────────────────────────────────────────────
    await createIfMissing('user_sessions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      token_hash: Sequelize.STRING,
      ip_address: Sequelize.STRING(45),
      user_agent: Sequelize.TEXT,
      last_activity: Sequelize.DATE,
      expires_at: Sequelize.DATE,
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── apikeys ────────────────────────────────────────────────────────────
    await createIfMissing('apikeys', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      user_id: Sequelize.INTEGER,
      key_hash: { type: Sequelize.STRING, allowNull: false },
      label: Sequelize.STRING,
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      expires_at: Sequelize.DATE,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── asset_code_config ──────────────────────────────────────────────────
    await createIfMissing('asset_code_config', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: Sequelize.INTEGER, allowNull: false },
      prefix: { type: Sequelize.STRING(20) },
      next_sequence: { type: Sequelize.INTEGER, defaultValue: 1 },
      padding_length: { type: Sequelize.INTEGER, defaultValue: 5 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── support_tickets ────────────────────────────────────────────────────
    await createIfMissing('support_tickets', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      user_id: Sequelize.INTEGER,
      subject: { type: Sequelize.STRING, allowNull: false },
      description: Sequelize.TEXT,
      status: { type: Sequelize.ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'), defaultValue: 'OPEN' },
      priority: { type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH'), defaultValue: 'MEDIUM' },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // ── service_tickets (alias of support_tickets pattern) ─────────────────
    await createIfMissing('service_tickets', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      asset_id: Sequelize.INTEGER,
      ticket_no: Sequelize.STRING(50),
      issue_type: Sequelize.STRING(100),
      description: Sequelize.TEXT,
      status: { type: Sequelize.ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'), defaultValue: 'OPEN' },
      priority: { type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'), defaultValue: 'MEDIUM' },
      assigned_to: Sequelize.INTEGER,
      created_by: Sequelize.INTEGER,
      resolved_at: Sequelize.DATE,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── grn_items ──────────────────────────────────────────────────────────
    await createIfMissing('grn_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      grn_id: { type: Sequelize.INTEGER, allowNull: false },
      po_item_id: Sequelize.INTEGER,
      item_id: Sequelize.INTEGER,
      item_name: Sequelize.STRING,
      ordered_qty: Sequelize.DECIMAL(12, 3),
      received_qty: Sequelize.DECIMAL(12, 3),
      accepted_qty: Sequelize.DECIMAL(12, 3),
      rejected_qty: Sequelize.DECIMAL(12, 3),
      unit_price: Sequelize.DECIMAL(12, 2),
      condition_on_receipt: { type: Sequelize.ENUM('GOOD', 'DAMAGED', 'PARTIAL'), defaultValue: 'GOOD' },
      remarks: Sequelize.TEXT,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── grn_item_serials ───────────────────────────────────────────────────
    await createIfMissing('grn_item_serials', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      grn_item_id: { type: Sequelize.INTEGER, allowNull: false },
      serial_number: { type: Sequelize.STRING(100), allowNull: false },
      asset_id: Sequelize.INTEGER,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── purchase_order_items ───────────────────────────────────────────────
    await createIfMissing('purchase_order_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      po_id: { type: Sequelize.INTEGER, allowNull: false },
      item_id: Sequelize.INTEGER,
      item_name: Sequelize.STRING,
      qty: Sequelize.DECIMAL(12, 3),
      unit_price: Sequelize.DECIMAL(12, 2),
      total_price: Sequelize.DECIMAL(12, 2),
      hsn_code: Sequelize.STRING(20),
      tax_percent: Sequelize.DECIMAL(5, 2),
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── purchase_requisition_items ─────────────────────────────────────────
    await createIfMissing('purchase_requisition_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pr_id: { type: Sequelize.INTEGER, allowNull: false },
      item_id: Sequelize.INTEGER,
      item_name: Sequelize.STRING,
      qty_requested: Sequelize.DECIMAL(12, 3),
      estimated_cost: Sequelize.DECIMAL(12, 2),
      remarks: Sequelize.TEXT,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── quotation_master ───────────────────────────────────────────────────
    await createIfMissing('quotation_master', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      pr_id: Sequelize.INTEGER,
      vendor_id: { type: Sequelize.INTEGER, allowNull: false },
      client_id: Sequelize.INTEGER,
      quotation_no: Sequelize.STRING(50),
      quotation_date: Sequelize.DATEONLY,
      validity_date: Sequelize.DATEONLY,
      total_amount: Sequelize.DECIMAL(15, 2),
      status: { type: Sequelize.ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'), defaultValue: 'DRAFT' },
      remarks: Sequelize.TEXT,
      created_by: Sequelize.INTEGER,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── quotation_items ────────────────────────────────────────────────────
    await createIfMissing('quotation_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      quotation_id: { type: Sequelize.INTEGER, allowNull: false },
      item_id: Sequelize.INTEGER,
      item_name: Sequelize.STRING,
      qty: Sequelize.DECIMAL(12, 3),
      unit_price: Sequelize.DECIMAL(12, 2),
      total_price: Sequelize.DECIMAL(12, 2),
      remarks: Sequelize.TEXT,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── direct_procurements ────────────────────────────────────────────────
    await createIfMissing('direct_procurements', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      vendor_id: Sequelize.INTEGER,
      description: Sequelize.TEXT,
      amount: Sequelize.DECIMAL(15, 2),
      procurement_date: Sequelize.DATEONLY,
      status: { type: Sequelize.ENUM('PENDING', 'APPROVED', 'COMPLETED'), defaultValue: 'PENDING' },
      created_by: Sequelize.INTEGER,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── vendor_documents ───────────────────────────────────────────────────
    await createIfMissing('vendor_documents', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      vendor_id: { type: Sequelize.INTEGER, allowNull: false },
      document_type: Sequelize.STRING(100),
      file_name: Sequelize.STRING,
      file_path: Sequelize.STRING,
      expiry_date: Sequelize.DATEONLY,
      verified: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── vendor_risk_history ────────────────────────────────────────────────
    await createIfMissing('vendor_risk_history', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      vendor_id: { type: Sequelize.INTEGER, allowNull: false },
      risk_score: Sequelize.DECIMAL(5, 2),
      risk_level: Sequelize.STRING(20),
      reason: Sequelize.TEXT,
      computed_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── vendor_change_requests ─────────────────────────────────────────────
    await createIfMissing('vendor_change_requests', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      vendor_id: { type: Sequelize.INTEGER, allowNull: false },
      requested_by: Sequelize.INTEGER,
      change_type: Sequelize.STRING(100),
      old_value: Sequelize.TEXT,
      new_value: Sequelize.TEXT,
      status: { type: Sequelize.ENUM('PENDING', 'APPROVED', 'REJECTED'), defaultValue: 'PENDING' },
      reviewed_by: Sequelize.INTEGER,
      reviewed_at: Sequelize.DATE,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── provider_users ─────────────────────────────────────────────────────
    await createIfMissing('provider_users', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      provider_id: Sequelize.INTEGER,
      user_id: Sequelize.INTEGER,
      role: Sequelize.STRING(50),
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── provider_asset_assignments ─────────────────────────────────────────
    await createIfMissing('provider_asset_assignments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      provider_id: Sequelize.INTEGER,
      asset_id: Sequelize.INTEGER,
      assigned_at: Sequelize.DATE,
      unassigned_at: Sequelize.DATE,
      notes: Sequelize.TEXT,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── verificationsessions ───────────────────────────────────────────────
    await createIfMissing('verificationsessions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      session_name: Sequelize.STRING,
      started_by: Sequelize.INTEGER,
      status: { type: Sequelize.ENUM('IN_PROGRESS', 'COMPLETED', 'CANCELLED'), defaultValue: 'IN_PROGRESS' },
      started_at: Sequelize.DATE,
      completed_at: Sequelize.DATE,
      total_assets: { type: Sequelize.INTEGER, defaultValue: 0 },
      verified_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── verificationdetails ────────────────────────────────────────────────
    await createIfMissing('verificationdetails', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      asset_id: Sequelize.INTEGER,
      status: { type: Sequelize.ENUM('VERIFIED', 'MISSING', 'EXCESS'), defaultValue: 'VERIFIED' },
      remarks: Sequelize.TEXT,
      verified_by: Sequelize.INTEGER,
      verified_at: Sequelize.DATE,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── self_declaration_campaigns ─────────────────────────────────────────
    await createIfMissing('self_declaration_campaigns', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      title: { type: Sequelize.STRING, allowNull: false },
      description: Sequelize.TEXT,
      deadline: Sequelize.DATE,
      status: { type: Sequelize.ENUM('DRAFT', 'ACTIVE', 'CLOSED'), defaultValue: 'DRAFT' },
      created_by: Sequelize.INTEGER,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── self_declaration_responses ─────────────────────────────────────────
    await createIfMissing('self_declaration_responses', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      campaign_id: { type: Sequelize.INTEGER, allowNull: false },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      asset_id: Sequelize.INTEGER,
      condition: { type: Sequelize.ENUM('GOOD', 'FAIR', 'POOR', 'MISSING'), defaultValue: 'GOOD' },
      remarks: Sequelize.TEXT,
      submitted_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── audit_sessions ─────────────────────────────────────────────────────
    await createIfMissing('audit_sessions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      session_name: Sequelize.STRING,
      audit_type: { type: Sequelize.ENUM('PHYSICAL', 'INTERNAL', 'EXTERNAL'), defaultValue: 'PHYSICAL' },
      status: { type: Sequelize.ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'), defaultValue: 'PLANNED' },
      started_by: Sequelize.INTEGER,
      started_at: Sequelize.DATE,
      completed_at: Sequelize.DATE,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── audit_tasks ────────────────────────────────────────────────────────
    await createIfMissing('audit_tasks', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      plan_id: Sequelize.INTEGER,
      asset_id: Sequelize.INTEGER,
      assigned_to: Sequelize.INTEGER,
      status: { type: Sequelize.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'), defaultValue: 'PENDING' },
      result: { type: Sequelize.ENUM('VERIFIED', 'MISSING', 'EXCESS', 'DAMAGED') },
      remarks: Sequelize.TEXT,
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // ── audit_items ────────────────────────────────────────────────────────
    await createIfMissing('audit_items', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      asset_id: Sequelize.INTEGER,
      tag_code: Sequelize.STRING(100),
      scan_status: { type: Sequelize.ENUM('SCANNED', 'NOT_SCANNED', 'EXCEPTION'), defaultValue: 'NOT_SCANNED' },
      physical_status: { type: Sequelize.ENUM('PRESENT', 'MISSING', 'EXCESS') },
      condition: { type: Sequelize.ENUM('GOOD', 'FAIR', 'POOR', 'DAMAGED') },
      remarks: Sequelize.TEXT,
      scanned_by: Sequelize.INTEGER,
      scanned_at: Sequelize.DATE
    });

    // ── audit_assets ───────────────────────────────────────────────────────
    await createIfMissing('audit_assets', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      asset_id: Sequelize.INTEGER,
      status: Sequelize.STRING(30),
      verified_by: Sequelize.INTEGER,
      verified_at: Sequelize.DATE
    });

    // ── audit_scans ────────────────────────────────────────────────────────
    await createIfMissing('audit_scans', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      asset_id: Sequelize.INTEGER,
      tag_code: Sequelize.STRING(100),
      location_id: Sequelize.INTEGER,
      scanned_by: Sequelize.INTEGER,
      result: Sequelize.STRING(30),
      scanned_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // ── audit_findings ─────────────────────────────────────────────────────
    await createIfMissing('audit_findings', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      asset_id: Sequelize.INTEGER,
      finding_type: Sequelize.STRING(50),
      description: Sequelize.TEXT,
      severity: { type: Sequelize.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'), defaultValue: 'MEDIUM' },
      status: { type: Sequelize.ENUM('OPEN', 'RESOLVED', 'IGNORED'), defaultValue: 'OPEN' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── audit_evidence ─────────────────────────────────────────────────────
    await createIfMissing('audit_evidence', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      finding_id: Sequelize.INTEGER,
      file_name: Sequelize.STRING,
      file_path: Sequelize.STRING,
      uploaded_by: Sequelize.INTEGER,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── audit_results ──────────────────────────────────────────────────────
    await createIfMissing('audit_results', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      total_assets: Sequelize.INTEGER,
      verified: Sequelize.INTEGER,
      missing: Sequelize.INTEGER,
      excess: Sequelize.INTEGER,
      compliance_pct: Sequelize.DECIMAL(5, 2),
      generated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── audit_risk_scores ──────────────────────────────────────────────────
    await createIfMissing('audit_risk_scores', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      asset_id: Sequelize.INTEGER,
      risk_score: Sequelize.DECIMAL(5, 2),
      risk_level: Sequelize.STRING(20),
      factors: Sequelize.JSON,
      computed_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── audit_ai_insights ──────────────────────────────────────────────────
    await createIfMissing('audit_ai_insights', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      insight_type: Sequelize.STRING(50),
      summary: Sequelize.TEXT,
      recommendations: Sequelize.JSON,
      generated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── audit_notifications ────────────────────────────────────────────────
    await createIfMissing('audit_notifications', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: Sequelize.INTEGER,
      user_id: Sequelize.INTEGER,
      message: Sequelize.TEXT,
      is_read: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── capexbudgets ───────────────────────────────────────────────────────
    await createIfMissing('capexbudgets', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      fiscal_year: Sequelize.STRING(9),
      department_id: Sequelize.INTEGER,
      category_id: Sequelize.INTEGER,
      budgeted_amount: Sequelize.DECIMAL(15, 2),
      approved_amount: Sequelize.DECIMAL(15, 2),
      spent_amount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      status: { type: Sequelize.ENUM('DRAFT', 'APPROVED', 'ACTIVE', 'CLOSED'), defaultValue: 'DRAFT' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── capexprojections ───────────────────────────────────────────────────
    await createIfMissing('capexprojections', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      budget_id: Sequelize.INTEGER,
      projection_month: Sequelize.INTEGER,
      projection_year: Sequelize.INTEGER,
      projected_amount: Sequelize.DECIMAL(15, 2),
      actual_amount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── capexrequests ──────────────────────────────────────────────────────
    await createIfMissing('capexrequests', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      budget_id: Sequelize.INTEGER,
      title: { type: Sequelize.STRING, allowNull: false },
      description: Sequelize.TEXT,
      requested_amount: Sequelize.DECIMAL(15, 2),
      approved_amount: Sequelize.DECIMAL(15, 2),
      status: { type: Sequelize.ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED'), defaultValue: 'DRAFT' },
      requested_by: Sequelize.INTEGER,
      approved_by: Sequelize.INTEGER,
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── leaseagreements ────────────────────────────────────────────────────
    await createIfMissing('leaseagreements', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: Sequelize.INTEGER,
      asset_id: Sequelize.INTEGER,
      lessor_name: Sequelize.STRING,
      lease_type: { type: Sequelize.ENUM('OPERATING', 'FINANCE'), defaultValue: 'OPERATING' },
      start_date: Sequelize.DATEONLY,
      end_date: Sequelize.DATEONLY,
      monthly_payment: Sequelize.DECIMAL(12, 2),
      total_value: Sequelize.DECIMAL(15, 2),
      status: { type: Sequelize.ENUM('ACTIVE', 'EXPIRED', 'TERMINATED'), defaultValue: 'ACTIVE' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // ── leaseschedules ─────────────────────────────────────────────────────
    await createIfMissing('leaseschedules', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      lease_id: Sequelize.INTEGER,
      period_month: Sequelize.INTEGER,
      period_year: Sequelize.INTEGER,
      opening_liability: Sequelize.DECIMAL(15, 2),
      payment: Sequelize.DECIMAL(12, 2),
      interest: Sequelize.DECIMAL(12, 2),
      principal: Sequelize.DECIMAL(12, 2),
      closing_liability: Sequelize.DECIMAL(15, 2),
      rou_depreciation: Sequelize.DECIMAL(12, 2)
    });

    // ── leasejournalentries ────────────────────────────────────────────────
    await createIfMissing('leasejournalentries', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      lease_id: Sequelize.INTEGER,
      entry_date: Sequelize.DATEONLY,
      debit_account: Sequelize.STRING,
      credit_account: Sequelize.STRING,
      amount: Sequelize.DECIMAL(12, 2),
      description: Sequelize.STRING,
      period_month: Sequelize.INTEGER,
      period_year: Sequelize.INTEGER
    });
  },

  async down(queryInterface) {
    const tables = [
      'leasejournalentries', 'leaseschedules', 'leaseagreements',
      'capexrequests', 'capexprojections', 'capexbudgets',
      'audit_notifications', 'audit_ai_insights', 'audit_risk_scores',
      'audit_results', 'audit_evidence', 'audit_findings',
      'audit_scans', 'audit_assets', 'audit_items', 'audit_tasks', 'audit_sessions',
      'self_declaration_responses', 'self_declaration_campaigns',
      'verificationdetails', 'verificationsessions',
      'provider_asset_assignments', 'provider_users',
      'vendor_change_requests', 'vendor_risk_history', 'vendor_documents',
      'direct_procurements', 'quotation_items', 'quotation_master',
      'purchase_requisition_items', 'purchase_order_items',
      'grn_item_serials', 'grn_items',
      'service_tickets', 'support_tickets', 'asset_code_config',
      'apikeys', 'user_sessions', 'movement_rules',
      'unknown_tag_logs', 'scan_logs', 'scanners',
      'asset_scan_logs', 'assethandovers', 'asset_movements',
      'asset_audit_logs', 'asset_alerts', 'alert_actions', 'alerts',
      'approval_logs', 'approval_matrix', 'approval_workflows',
      'notifications', 'permissions', 'client_licenses', 'clients'
    ];
    for (const t of tables) {
      try { await queryInterface.dropTable(t); } catch (_) {}
    }
  }
};
