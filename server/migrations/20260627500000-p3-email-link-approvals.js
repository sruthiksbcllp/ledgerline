'use strict';
/**
 * Phase 3 — signed email-link approvals (external, no-login approvers).
 * Creates external_approval_tokens (single-use, time-limited, high-entropy; only the
 * SHA-256 hash is stored) and seeds EMAIL_LINK_APPROVALS (disabled). Additive; nothing
 * dispatches or consumes tokens until the DOA resolver (Phase 2) wires it in.
 */
module.exports = {
  async up(q, S) {
    const tbls = (await q.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    if (!tbls.includes('external_approval_tokens')) {
      await q.createTable('external_approval_tokens', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: S.INTEGER, allowNull: false },
        token_hash: { type: S.STRING(64), allowNull: false },   // SHA-256 hex of the raw token
        module: { type: S.STRING(30), allowNull: false },        // e.g. 'PO'
        document_id: { type: S.INTEGER, allowNull: false },
        approval_log_id: { type: S.INTEGER, allowNull: true },   // links to the chain step (Phase 2)
        approver_email: { type: S.STRING(160), allowNull: false },
        approver_name: { type: S.STRING(120), allowNull: true },
        purpose: { type: S.STRING(40), allowNull: false, defaultValue: 'DOA_APPROVAL' },
        expires_at: { type: S.DATE, allowNull: false },
        consumed_at: { type: S.DATE, allowNull: true },          // single-use marker
        decision: { type: S.ENUM('APPROVED', 'REJECTED'), allowNull: true },
        decided_ip: { type: S.STRING(64), allowNull: true },
        decided_comment: { type: S.TEXT, allowNull: true },
        created_by: { type: S.INTEGER, allowNull: true },
        createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') }
      });
    }
    const idx = await q.showIndex('external_approval_tokens').catch(() => []);
    const names = (idx || []).map((i) => i.name);
    if (!names.includes('uk_eat_token_hash')) await q.addIndex('external_approval_tokens', ['token_hash'], { unique: true, name: 'uk_eat_token_hash' });
    if (!names.includes('ix_eat_doc')) await q.addIndex('external_approval_tokens', ['client_id', 'module', 'document_id'], { name: 'ix_eat_doc' });

    try {
      const [rows] = await q.sequelize.query("SELECT id FROM featuretoggles WHERE feature_key='EMAIL_LINK_APPROVALS' LIMIT 1");
      if (!rows.length) {
        await q.bulkInsert('featuretoggles', [{
          client_id: null, feature_key: 'EMAIL_LINK_APPROVALS', feature_name: 'Email-link approvals (external, no-login)',
          module: 'PROCUREMENT', is_enabled: false, createdAt: new Date(), updatedAt: new Date()
        }]);
      }
    } catch (e) { /* toggle table shape differs — skip */ }
  },
  async down(q) {
    const tbls = (await q.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    if (tbls.includes('external_approval_tokens')) await q.dropTable('external_approval_tokens');
    try { await q.sequelize.query("DELETE FROM featuretoggles WHERE feature_key='EMAIL_LINK_APPROVALS'"); } catch (e) { /* skip */ }
  }
};
