'use strict';

/**
 * workflow_events: who did what on each AP document (role, name, action, status, time).
 * New events come from the model hooks in services/workflowTrail.service.js. This migration also
 * fills in the history that already exists elsewhere, marked source = 'BACKFILL':
 *   - approval_logs (PR / PO approval decisions)
 *   - immutable_audit_log (PO, invoice, SES, quotation, RFQ actions)
 *   - requisitions raised (requestor_id), GRNs and gate entries (received_by), AP payments
 * The role shown for backfilled rows is the person's role in that company today; their role at the
 * time was not recorded before.
 */
const AUDIT = {
  PO: { module: 'PO', table: 'purchaseorders', number: 'po_number' },
  INVOICE: { module: 'INVOICE', table: 'invoices', number: 'invoice_number' },
  SERVICE_ENTRY_SHEET: { module: 'SES', table: 'service_entry_sheets', number: 'ses_number' },
  QUOTATION: { module: 'QUOTATION', table: 'quotation_master', number: 'quotation_number' },
  RFQ: { module: 'RFQ', table: 'rfqs', number: 'rfq_number' }
};
const AUDIT_ACTIONS = {
  CREATE_PO: 'Purchase order created',
  CREATE_INVOICE: 'Invoice recorded',
  AP_INVOICE_SUBMITTED: 'Submitted for approval',
  AP_INVOICE_APPROVED: 'Approved for payment',
  AP_INVOICE_REJECTED: 'Rejected',
  AP_INVOICE_PAID: 'Paid in full',
  CREATE_SES: 'Service recorded',
  SES_CONFIRM: 'Service confirmed',
  SES_REVIEW: 'Reviewed and forwarded for approval',
  SES_APPROVE: 'Approved',
  SES_REJECT: 'Rejected',
  AWARD_QUOTATION: 'Quotation awarded',
  RFQ_QUOTATION_RECORDED: 'Quotation recorded',
  RFQ_INVITE_SENT: 'RFQ sent to vendor'
};
const LOG_ACTIONS = {
  SUBMITTED: 'Submitted for approval', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled',
  UPDATED: 'Updated', ESCALATED: 'Escalated', CONFIGURATION_REQUIRED: 'Waiting for approval set-up'
};
const LOG_STATUS = { CANCELLED: 'CANCELLED', REJECTED: 'REJECTED', SUBMITTED: 'SUBMITTED' };
const PLATFORM_ROLE_NAMES = { PROVIDER_ADMIN: 'Super Admin', DEV_ADMIN: 'Super Admin' };

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => String(t.tableName || t).toLowerCase());
    if (!tables.includes('workflow_events')) {
      await queryInterface.createTable('workflow_events', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: true },
        module: { type: Sequelize.STRING(30), allowNull: false },
        reference_id: { type: Sequelize.INTEGER, allowNull: false },
        reference_no: { type: Sequelize.STRING(100), allowNull: true },
        action: { type: Sequelize.STRING(120), allowNull: false },
        from_status: { type: Sequelize.STRING(60), allowNull: true },
        to_status: { type: Sequelize.STRING(60), allowNull: true },
        user_id: { type: Sequelize.INTEGER, allowNull: true },
        user_name: { type: Sequelize.STRING(160), allowNull: true },
        role_code: { type: Sequelize.STRING(60), allowNull: true },
        role_name: { type: Sequelize.STRING(120), allowNull: true },
        comments: { type: Sequelize.TEXT, allowNull: true },
        details: { type: Sequelize.JSON, allowNull: true },
        source: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'APP' },
        occurred_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('workflow_events', ['client_id', 'module', 'reference_id', 'occurred_at'], { name: 'workflow_events_doc' });
      await queryInterface.addIndex('workflow_events', ['user_id'], { name: 'workflow_events_user' });
    }

    const [[{ n }]] = await queryInterface.sequelize.query('SELECT COUNT(*) AS n FROM workflow_events');
    if (Number(n) > 0) return; // already filled
    await backfill(queryInterface, tables);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workflow_events');
  }
};

async function backfill(queryInterface, tables) {
  const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements, type: queryInterface.sequelize.QueryTypes.SELECT });
  const has = (t) => tables.includes(t);

  const roles = has('roles') ? await q('SELECT code, name FROM roles') : [];
  const roleName = Object.fromEntries(roles.map((r) => [String(r.code).toUpperCase(), r.name]));
  const nameOfRole = (code) => (code ? PLATFORM_ROLE_NAMES[String(code).toUpperCase()] || roleName[String(code).toUpperCase()] || String(code) : null);

  const users = await q('SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.client_id, r.code AS role_code FROM users u LEFT JOIN roles r ON r.id = u.role_id');
  const userById = Object.fromEntries(users.map((u) => [u.id, u]));
  const memberships = has('company_memberships') ? await q("SELECT user_id, client_id, role_code FROM company_memberships WHERE status = 'ACTIVE'") : [];
  const memberRole = Object.fromEntries(memberships.map((m) => [`${m.user_id}:${m.client_id}`, m.role_code]));

  const person = (userId, clientId, roleCode) => {
    const u = userById[userId];
    if (!u) return { user_id: userId || null, user_name: userId ? `User #${userId}` : 'System', role_code: roleCode || null, role_name: roleCode ? nameOfRole(roleCode) : (userId ? null : 'Automated') };
    const code = roleCode || memberRole[`${userId}:${clientId}`] || u.role_code || null;
    return {
      user_id: u.id,
      user_name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || u.email,
      role_code: code,
      role_name: nameOfRole(code)
    };
  };

  const numbers = {};
  const numberOf = async (table, col, id) => {
    if (!has(table)) return null;
    if (!numbers[table]) {
      const rows = await q(`SELECT id, \`${col}\` AS num FROM \`${table}\``);
      numbers[table] = Object.fromEntries(rows.map((r) => [r.id, r.num]));
    }
    return numbers[table][id] || null;
  };
  const exists = async (table, col, id) => { await numberOf(table, col, id); return Boolean(numbers[table] && id in numbers[table]); };

  const events = [];
  const push = (e) => events.push({
    client_id: e.client_id ?? null,
    module: e.module,
    reference_id: e.reference_id,
    reference_no: e.reference_no || null,
    action: String(e.action).slice(0, 120),
    from_status: e.from_status || null,
    to_status: e.to_status || null,
    ...person(e.user_id, e.client_id, e.role_code),
    comments: e.comments || null,
    details: e.details ? JSON.stringify(e.details) : null,
    source: 'BACKFILL',
    occurred_at: e.occurred_at || new Date()
  });

  // 1. Approval decisions on requisitions and orders.
  if (has('approval_logs')) {
    const logs = await q("SELECT * FROM approval_logs WHERE UPPER(module) IN ('PR','PO')");
    for (const l of logs) {
      const module = String(l.module).toUpperCase();
      if (!(await exists(module === 'PR' ? 'purchaserequisitions' : 'purchaseorders', module === 'PR' ? 'pr_number' : 'po_number', l.reference_id))) continue; // document since deleted
      const base = LOG_ACTIONS[l.action] || l.action;
      push({
        module, reference_id: l.reference_id, client_id: l.client_id,
        reference_no: await numberOf(module === 'PR' ? 'purchaserequisitions' : 'purchaseorders', module === 'PR' ? 'pr_number' : 'po_number', l.reference_id),
        action: l.action === 'APPROVED' && l.level ? `${base} (level ${l.level})` : base,
        // approval_logs.status is not the document status (a cancel is logged as SUBMITTED)
        to_status: LOG_STATUS[l.action] || (l.action === 'APPROVED' && l.status === 'APPROVED' ? 'APPROVED' : null),
        user_id: l.user_id, role_code: l.role_code, comments: l.comments, occurred_at: l.timestamp
      });
    }
  }

  // 2. Actions already in the audit log.
  if (has('immutable_audit_log')) {
    const rows = await q(`SELECT id, client_id, user_id, action, entity_type, entity_id, payload, created_at FROM immutable_audit_log
      WHERE entity_type IN (${Object.keys(AUDIT).map(() => '?').join(',')}) AND action IN (${Object.keys(AUDIT_ACTIONS).map(() => '?').join(',')})`,
    [...Object.keys(AUDIT), ...Object.keys(AUDIT_ACTIONS)]);
    for (const r of rows) {
      const cfg = AUDIT[r.entity_type];
      if (!r.entity_id || !(await exists(cfg.table, cfg.number, r.entity_id))) continue; // document since deleted
      let payload = r.payload;
      try { if (typeof payload === 'string') payload = JSON.parse(payload); } catch (e) { payload = null; }
      const after = payload?.afterData || {};
      const before = payload?.beforeData || {};
      push({
        module: cfg.module, reference_id: r.entity_id, client_id: r.client_id,
        reference_no: after[cfg.number] || await numberOf(cfg.table, cfg.number, r.entity_id),
        action: AUDIT_ACTIONS[r.action], from_status: before.status, to_status: after.status,
        user_id: r.user_id, comments: after._note || null, occurred_at: r.created_at
      });
    }
  }

  // 3. Documents whose creator is recorded on the row.
  if (has('purchaserequisitions')) {
    for (const r of await q('SELECT id, client_id, pr_number, requestor_id, createdAt FROM purchaserequisitions WHERE requestor_id IS NOT NULL')) {
      push({ module: 'PR', reference_id: r.id, client_id: r.client_id, reference_no: r.pr_number, action: 'Requisition raised', user_id: r.requestor_id, occurred_at: r.createdAt });
    }
  }
  if (has('grns')) {
    for (const r of await q('SELECT id, client_id, grn_number, received_by, status, createdAt FROM grns WHERE received_by IS NOT NULL')) {
      push({ module: 'GRN', reference_id: r.id, client_id: r.client_id, reference_no: r.grn_number, action: 'Goods received (GRN created)', to_status: r.status, user_id: r.received_by, occurred_at: r.createdAt });
    }
  }
  if (has('gate_entries')) {
    for (const r of await q('SELECT id, client_id, gate_entry_number, received_by, created_at FROM gate_entries WHERE received_by IS NOT NULL')) {
      push({ module: 'GATE_ENTRY', reference_id: r.id, client_id: r.client_id, reference_no: r.gate_entry_number, action: 'Gate entry recorded', user_id: r.received_by, occurred_at: r.created_at });
    }
  }
  if (has('ap_payments')) {
    for (const r of await q('SELECT p.*, i.invoice_number FROM ap_payments p JOIN invoices i ON i.id = p.invoice_id')) {
      push({
        module: 'INVOICE', reference_id: r.invoice_id, client_id: r.client_id, reference_no: r.invoice_number, action: 'Payment recorded',
        user_id: r.created_by, comments: r.notes,
        details: { amount: Number(r.amount), payment_mode: r.payment_mode, reference: r.reference, payment_date: r.payment_date },
        occurred_at: r.created_at
      });
    }
  }

  // Oldest first, so ids follow the order things happened (several share the same second).
  // On a tie, the document's creation comes before what happened to it.
  const rank = (e) => (/created|raised|recorded|received|drafted/i.test(e.action) ? 0 : 1);
  events.sort((a, b) => (new Date(a.occurred_at) - new Date(b.occurred_at)) || (rank(a) - rank(b)));
  if (events.length) {
    for (let i = 0; i < events.length; i += 500) {
      await queryInterface.bulkInsert('workflow_events', events.slice(i, i + 500));
    }
  }
}
