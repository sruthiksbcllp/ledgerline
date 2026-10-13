'use strict';

/**
 * 20260504230000-fix-all-remaining-model-mismatches.js
 *
 * Fixes all remaining "Unknown column" / "Table doesn't exist" errors found
 * in full model sweep. Creates missing tables and adds missing columns.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableExists = async (table) => {
      try { await queryInterface.describeTable(table); return true; }
      catch (_) { return false; }
    };
    const addIfMissing = async (table, col, def) => {
      try {
        if (!(await tableExists(table))) return;
        const desc = await queryInterface.describeTable(table);
        if (!desc[col]) await queryInterface.addColumn(table, col, def);
      } catch (_) {}
    };
    const createIfMissing = async (table, cols) => {
      if (!(await tableExists(table))) {
        await queryInterface.createTable(table, cols);
      }
    };

    // ── asset_types (table missing entirely) ─────────────────────────────────
    await createIfMissing('asset_types', {
      id:     { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name:   { type: Sequelize.STRING(255), allowNull: false },
      code:   { type: Sequelize.STRING(100), allowNull: false },
      status: { type: Sequelize.ENUM('ACTIVE','INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { type: Sequelize.DATE, allowNull: true },
      updatedAt: { type: Sequelize.DATE, allowNull: true },
    });

    // ── apikeys ───────────────────────────────────────────────────────────────
    await addIfMissing('apikeys', 'entity_id',   { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('apikeys', 'api_key',      { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('apikeys', 'secret_key',   { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('apikeys', 'label',        { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('apikeys', 'status',       { type: Sequelize.ENUM('ACTIVE','REVOKED'), defaultValue: 'ACTIVE' });
    await addIfMissing('apikeys', 'last_used',    { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('apikeys', 'client_id',    { type: Sequelize.INTEGER, allowNull: true });

    // ── approval_logs ─────────────────────────────────────────────────────────
    await addIfMissing('approval_logs', 'reference_id',      { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('approval_logs', 'module',            { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('approval_logs', 'user_id',           { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('approval_logs', 'action',            { type: Sequelize.ENUM('SUBMITTED','APPROVED','REJECTED','CANCELLED','UPDATED','ESCALATED'), allowNull: true });
    await addIfMissing('approval_logs', 'status',            { type: Sequelize.ENUM('SUBMITTED','APPROVED','REJECTED','ESCALATED'), allowNull: true });
    await addIfMissing('approval_logs', 'level',             { type: Sequelize.INTEGER, defaultValue: 1 });
    await addIfMissing('approval_logs', 'line_item_id',      { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('approval_logs', 'approval_topology', { type: Sequelize.ENUM('COLLECTIVE','LINE_LEVEL'), allowNull: true });
    await addIfMissing('approval_logs', 'progression_mode',  { type: Sequelize.ENUM('COLLECTIVE','PER_LINE'), allowNull: true });
    await addIfMissing('approval_logs', 'role_code',         { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('approval_logs', 'comments',          { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('approval_logs', 'timestamp',         { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('approval_logs', 'client_id',         { type: Sequelize.INTEGER, allowNull: true });

    // ── approval_matrix ───────────────────────────────────────────────────────
    await addIfMissing('approval_matrix', 'workflow_id',       { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('approval_matrix', 'threshold_amount',  { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
    await addIfMissing('approval_matrix', 'mode',              { type: Sequelize.ENUM('LINE','COLLECTIVE'), defaultValue: 'COLLECTIVE' });

    // ── approval_workflows ────────────────────────────────────────────────────
    await addIfMissing('approval_workflows', 'name',   { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('approval_workflows', 'module', { type: Sequelize.STRING(100), allowNull: true });

    // ── asset_amcs ────────────────────────────────────────────────────────────
    await addIfMissing('asset_amcs', 'service_provider_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('asset_amcs', 'client_id',           { type: Sequelize.INTEGER, allowNull: true });

    // ── audit_ai_insights ─────────────────────────────────────────────────────
    await addIfMissing('audit_ai_insights', 'audit_session_id',          { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_ai_insights', 'summary',                   { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('audit_ai_insights', 'risk_analysis_json',        { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('audit_ai_insights', 'compliance_flags_json',     { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('audit_ai_insights', 'ai_insights_json',          { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('audit_ai_insights', 'recommended_actions_json',  { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('audit_ai_insights', 'is_latest',                 { type: Sequelize.BOOLEAN, defaultValue: true });

    // ── audit_assets ──────────────────────────────────────────────────────────
    await addIfMissing('audit_assets', 'audit_session_id',      { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_assets', 'expected_location_id',  { type: Sequelize.INTEGER, allowNull: true });

    // ── audit_evidence ────────────────────────────────────────────────────────
    await addIfMissing('audit_evidence', 'audit_session_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_evidence', 'image_url',        { type: Sequelize.STRING(500), allowNull: true });
    await addIfMissing('audit_evidence', 'created_by',       { type: Sequelize.INTEGER, allowNull: true });

    // ── audit_findings ────────────────────────────────────────────────────────
    await addIfMissing('audit_findings', 'type',       { type: Sequelize.ENUM('MISSING','EXTRA','MISMATCH'), allowNull: true });
    await addIfMissing('audit_findings', 'session_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_findings', 'asset_id',   { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_findings', 'remarks',    { type: Sequelize.TEXT, allowNull: true });

    // ── audit_items ───────────────────────────────────────────────────────────
    await addIfMissing('audit_items', 'audit_session_id',     { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_items', 'asset_id',             { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_items', 'expected_location_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_items', 'found_location_id',    { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_items', 'status',               { type: Sequelize.ENUM('PENDING','FOUND','MISSING','EXTRA'), defaultValue: 'PENDING' });
    await addIfMissing('audit_items', 'scanned_at',           { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('audit_items', 'created_at',           { type: Sequelize.DATE, allowNull: true });

    // ── audit_plannings ───────────────────────────────────────────────────────
    await addIfMissing('audit_plannings', 'client_id',       { type: Sequelize.INTEGER, defaultValue: 1 });
    await addIfMissing('audit_plannings', 'audit_name',      { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('audit_plannings', 'property_id',     { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_plannings', 'location_id',     { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_plannings', 'start_date',      { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('audit_plannings', 'end_date',        { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('audit_plannings', 'frequency',       { type: Sequelize.ENUM('ANNUAL','HALF_YEARLY','QUARTERLY'), defaultValue: 'ANNUAL' });
    await addIfMissing('audit_plannings', 'risk_level',      { type: Sequelize.ENUM('LOW','MEDIUM','HIGH'), defaultValue: 'LOW' });
    await addIfMissing('audit_plannings', 'multi_locations', { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('audit_plannings', 'auditor_id',      { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_plannings', 'status',          { type: Sequelize.ENUM('PLANNED','SCHEDULED','COMPLETED'), defaultValue: 'PLANNED' });
    await addIfMissing('audit_plannings', 'created_by',      { type: Sequelize.INTEGER, allowNull: true });

    // ── audit_risk_scores ─────────────────────────────────────────────────────
    await addIfMissing('audit_risk_scores', 'audit_session_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_risk_scores', 'risk_type',        { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('audit_risk_scores', 'severity',         { type: Sequelize.ENUM('low','medium','high'), allowNull: true });
    await addIfMissing('audit_risk_scores', 'score',            { type: Sequelize.DECIMAL(5,2), allowNull: true });

    // ── audit_scans ───────────────────────────────────────────────────────────
    await addIfMissing('audit_scans', 'audit_session_id',   { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_scans', 'asset_id',           { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_scans', 'rfid_tag',           { type: Sequelize.STRING(200), allowNull: true });
    await addIfMissing('audit_scans', 'qr_code',            { type: Sequelize.STRING(200), allowNull: true });
    await addIfMissing('audit_scans', 'scanned_location_id',{ type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_scans', 'scanned_by',         { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('audit_scans', 'scanned_at',         { type: Sequelize.DATE, allowNull: true });

    // ── direct_procurements ───────────────────────────────────────────────────
    await addIfMissing('direct_procurements', 'invoice_number', { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('direct_procurements', 'invoice_date',   { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('direct_procurements', 'total_amount',   { type: Sequelize.DECIMAL(12,2), defaultValue: 0 });

    // ── financialperiods ──────────────────────────────────────────────────────
    await addIfMissing('financialperiods', 'client_id',    { type: Sequelize.INTEGER, defaultValue: 1 });
    await addIfMissing('financialperiods', 'closed_at',    { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('financialperiods', 'reopened_at',  { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('financialperiods', 'closed_by',    { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('financialperiods', 'reopened_by',  { type: Sequelize.INTEGER, allowNull: true });

    // ── movement_rules ────────────────────────────────────────────────────────
    await addIfMissing('movement_rules', 'rule_type',          { type: Sequelize.ENUM('RESTRICTED_LOCATION','AFTER_HOURS','DEPARTMENT_CHANGE'), allowNull: true });
    await addIfMissing('movement_rules', 'condition_value',    { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('movement_rules', 'requires_approval',  { type: Sequelize.BOOLEAN, defaultValue: true });
    await addIfMissing('movement_rules', 'is_active',          { type: Sequelize.BOOLEAN, defaultValue: true });
    await addIfMissing('movement_rules', 'client_id',          { type: Sequelize.INTEGER, defaultValue: 1 });

    // ── notifications ─────────────────────────────────────────────────────────
    await addIfMissing('notifications', 'alert_id',   { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('notifications', 'type',       { type: Sequelize.ENUM('EMAIL','SMS','PUSH'), allowNull: true });
    await addIfMissing('notifications', 'created_at', { type: Sequelize.DATE, allowNull: true });

    // ── permissions ───────────────────────────────────────────────────────────
    await addIfMissing('permissions', 'module', { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('permissions', 'action', { type: Sequelize.STRING(100), allowNull: true });

    // ── provider_asset_assignments ────────────────────────────────────────────
    await addIfMissing('provider_asset_assignments', 'status', { type: Sequelize.ENUM('ACTIVE','INACTIVE'), defaultValue: 'ACTIVE' });

    // ── provider_users ────────────────────────────────────────────────────────
    await addIfMissing('provider_users', 'name',          { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('provider_users', 'email',         { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('provider_users', 'password_hash', { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('provider_users', 'status',        { type: Sequelize.ENUM('ACTIVE','INACTIVE'), defaultValue: 'ACTIVE' });

    // ── purchase_requisition_items ────────────────────────────────────────────
    await addIfMissing('purchase_requisition_items', 'unit', { type: Sequelize.STRING(50), allowNull: true });

    // ── requestitems — needs createdAt/updatedAt (timestamps:true, underscored:false) ──
    await addIfMissing('requestitems', 'createdAt',        { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('requestitems', 'updatedAt',        { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('requestitems', 'from_location_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('requestitems', 'to_location_id',   { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('requestitems', 'reason',           { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('requestitems', 'remarks',          { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('requestitems', 'unit',             { type: Sequelize.STRING(50), defaultValue: 'unit' });
    await addIfMissing('requestitems', 'estimated_cost',   { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });

    // ── scan_logs ─────────────────────────────────────────────────────────────
    await addIfMissing('scan_logs', 'client_id',     { type: Sequelize.INTEGER, defaultValue: 1 });
    await addIfMissing('scan_logs', 'scan_type',     { type: Sequelize.STRING(20), allowNull: true });
    await addIfMissing('scan_logs', 'scanned_code',  { type: Sequelize.STRING(100), allowNull: true });

    // ── scanners ──────────────────────────────────────────────────────────────
    await addIfMissing('scanners', 'api_key',     { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('scanners', 'location_id', { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('scanners', 'status',      { type: Sequelize.ENUM('ACTIVE','INACTIVE'), defaultValue: 'ACTIVE' });

    // ── service_tickets ───────────────────────────────────────────────────────
    await addIfMissing('service_tickets', 'provider_id',  { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('service_tickets', 'title',        { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('service_tickets', 'description',  { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('service_tickets', 'status',       { type: Sequelize.ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED'), defaultValue: 'OPEN' });
    await addIfMissing('service_tickets', 'priority',     { type: Sequelize.ENUM('LOW','MEDIUM','HIGH','CRITICAL'), defaultValue: 'MEDIUM' });

    // ── stocktransactions ─────────────────────────────────────────────────────
    await addIfMissing('stocktransactions', 'client_id',         { type: Sequelize.INTEGER, defaultValue: 1 });
    await addIfMissing('stocktransactions', 'transaction_type',  { type: Sequelize.ENUM('GRN','ISSUE','TRANSFER','ADJUSTMENT'), allowNull: true });
    await addIfMissing('stocktransactions', 'unit_cost',         { type: Sequelize.DECIMAL(15,2), allowNull: true });
    await addIfMissing('stocktransactions', 'batch_number',      { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('stocktransactions', 'reference_number',  { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('stocktransactions', 'from_location_id',  { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('stocktransactions', 'to_location_id',    { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('stocktransactions', 'supplier_id',       { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('stocktransactions', 'notes',             { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('stocktransactions', 'created_by',        { type: Sequelize.INTEGER, allowNull: true });

    // ── unknown_tag_logs ──────────────────────────────────────────────────────
    await addIfMissing('unknown_tag_logs', 'raw_payload',  { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('unknown_tag_logs', 'tag_id',       { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('unknown_tag_logs', 'scanner_id',   { type: Sequelize.STRING(50), allowNull: true });
    await addIfMissing('unknown_tag_logs', 'location_id',  { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('unknown_tag_logs', 'scanned_at',   { type: Sequelize.DATE, allowNull: true });

    // ── vendor_change_requests ────────────────────────────────────────────────
    await addIfMissing('vendor_change_requests', 'client_id',       { type: Sequelize.INTEGER, defaultValue: 1 });
    await addIfMissing('vendor_change_requests', 'change_type',     { type: Sequelize.STRING(50), defaultValue: 'MASTER_CHANGE' });
    await addIfMissing('vendor_change_requests', 'before_json',     { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('vendor_change_requests', 'after_json',      { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('vendor_change_requests', 'requested_by',    { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('vendor_change_requests', 'requested_at',    { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('vendor_change_requests', 'approved_by',     { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('vendor_change_requests', 'approved_at',     { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('vendor_change_requests', 'status',          { type: Sequelize.ENUM('PENDING','APPROVED','REJECTED','CANCELLED'), defaultValue: 'PENDING' });
    await addIfMissing('vendor_change_requests', 'decision_notes',  { type: Sequelize.TEXT, allowNull: true });

    // ── vendor_documents ──────────────────────────────────────────────────────
    await addIfMissing('vendor_documents', 'client_id',       { type: Sequelize.INTEGER, defaultValue: 1 });
    await addIfMissing('vendor_documents', 'document_type',   { type: Sequelize.ENUM('GST','PAN','CONTRACT','MSME','INSURANCE','COMPLIANCE','OTHER'), allowNull: true });
    await addIfMissing('vendor_documents', 'document_name',   { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('vendor_documents', 'file_name',       { type: Sequelize.STRING(255), allowNull: true });
    await addIfMissing('vendor_documents', 'file_path',       { type: Sequelize.TEXT, allowNull: true });
    await addIfMissing('vendor_documents', 'mime_type',       { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('vendor_documents', 'file_size',       { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('vendor_documents', 'expiry_date',     { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('vendor_documents', 'status',          { type: Sequelize.ENUM('ACTIVE','EXPIRING','EXPIRED','ARCHIVED'), defaultValue: 'ACTIVE' });
    await addIfMissing('vendor_documents', 'uploaded_by',     { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('vendor_documents', 'remarks',         { type: Sequelize.TEXT, allowNull: true });

    // ── vendor_risk_history ───────────────────────────────────────────────────
    await addIfMissing('vendor_risk_history', 'client_id',    { type: Sequelize.INTEGER, defaultValue: 1 });
    await addIfMissing('vendor_risk_history', 'event_type',   { type: Sequelize.ENUM('RISK_CALCULATED','DOCUMENT_UPLOADED','REMINDER_CREATED','APPROVAL_SUBMITTED','APPROVAL_APPROVED','APPROVAL_REJECTED','VENDOR_UPDATED'), allowNull: true });
    await addIfMissing('vendor_risk_history', 'old_band',     { type: Sequelize.STRING(20), allowNull: true });
    await addIfMissing('vendor_risk_history', 'new_band',     { type: Sequelize.STRING(20), allowNull: true });
    await addIfMissing('vendor_risk_history', 'old_score',    { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('vendor_risk_history', 'new_score',    { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('vendor_risk_history', 'summary',      { type: Sequelize.STRING(500), allowNull: true });
    await addIfMissing('vendor_risk_history', 'details_json', { type: Sequelize.JSON, allowNull: true });
    await addIfMissing('vendor_risk_history', 'created_by',   { type: Sequelize.INTEGER, allowNull: true });

    // ── verificationdetails ───────────────────────────────────────────────────
    await addIfMissing('verificationdetails', 'item_id',      { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('verificationdetails', 'session_id',   { type: Sequelize.INTEGER, allowNull: true });
    await addIfMissing('verificationdetails', 'system_qty',   { type: Sequelize.DECIMAL(10,2), defaultValue: 0 });
    await addIfMissing('verificationdetails', 'physical_qty', { type: Sequelize.DECIMAL(10,2), defaultValue: 0 });
    await addIfMissing('verificationdetails', 'is_verified',  { type: Sequelize.BOOLEAN, defaultValue: false });
    await addIfMissing('verificationdetails', 'verified_at',  { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('verificationdetails', 'notes',        { type: Sequelize.TEXT, allowNull: true });
  },

  down: async () => {}
};
