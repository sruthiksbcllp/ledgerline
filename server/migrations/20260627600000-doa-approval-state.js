'use strict';
/**
 * DOA Phase 2b-1 — DOA approval state (parallel track; does NOT touch the matrix engine).
 *  doa_approval_requests : one per (module, document) running through DOA
 *  doa_approval_steps     : the resolved requirements (SINGLE / ANY_ONE_OF), each with status
 *  external_approval_tokens.step_id : binds an email-link token to the step it satisfies
 * Additive, idempotent, reversible. Nothing reads/writes these until 2b-2 wires initiateApproval.
 */
module.exports = {
  async up(q, S) {
    const tbls = (await q.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    const TS = {
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') }
    };
    if (!tbls.includes('doa_approval_requests')) {
      await q.createTable('doa_approval_requests', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: S.INTEGER, allowNull: false },
        module: { type: S.STRING(30), allowNull: false },
        document_id: { type: S.INTEGER, allowNull: false },
        expense_type: { type: S.ENUM('CAPEX', 'OPEX'), allowNull: true },
        amount: { type: S.DECIMAL(15, 2), allowNull: true },
        policy_id: { type: S.INTEGER, allowNull: true },
        status: { type: S.ENUM('IN_PROGRESS', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'IN_PROGRESS' },
        created_by: { type: S.INTEGER, allowNull: true },
        ...TS
      });
    }
    if (!tbls.includes('doa_approval_steps')) {
      await q.createTable('doa_approval_steps', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        request_id: { type: S.INTEGER, allowNull: false },
        client_id: { type: S.INTEGER, allowNull: false },
        seq: { type: S.INTEGER, allowNull: false, defaultValue: 1 },
        requirement_type: { type: S.ENUM('SINGLE', 'ANY_ONE_OF'), allowNull: false },
        spec_type: { type: S.STRING(40), allowNull: true },
        approver_name: { type: S.STRING(120), allowNull: true },
        approver_email: { type: S.STRING(160), allowNull: true },
        user_id: { type: S.INTEGER, allowNull: true },
        group_key: { type: S.STRING(60), allowNull: true },
        eligible_json: { type: S.TEXT, allowNull: true },     // ANY_ONE_OF eligible members
        status: { type: S.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
        decided_email: { type: S.STRING(160), allowNull: true },
        decided_user_id: { type: S.INTEGER, allowNull: true },
        decided_at: { type: S.DATE, allowNull: true },
        decided_ip: { type: S.STRING(64), allowNull: true },
        comment: { type: S.TEXT, allowNull: true },
        ...TS
      });
    }
    const addIdx = async (tbl, fields, name, opts = {}) => {
      const idx = await q.showIndex(tbl).catch(() => []);
      if (!(idx || []).map((i) => i.name).includes(name)) await q.addIndex(tbl, fields, { name, ...opts });
    };
    await addIdx('doa_approval_requests', ['client_id', 'module', 'document_id'], 'ix_doa_req_doc');
    await addIdx('doa_approval_steps', ['request_id'], 'ix_doa_steps_req');

    const eat = await q.describeTable('external_approval_tokens');
    if (!eat.step_id) await q.addColumn('external_approval_tokens', 'step_id', { type: S.INTEGER, allowNull: true });
  },
  async down(q) {
    const eat = await q.describeTable('external_approval_tokens');
    if (eat.step_id) await q.removeColumn('external_approval_tokens', 'step_id');
    for (const t of ['doa_approval_steps', 'doa_approval_requests']) {
      const tbls = (await q.showAllTables()).map((x) => (typeof x === 'string' ? x : x.tableName));
      if (tbls.includes(t)) await q.dropTable(t);
    }
  }
};
