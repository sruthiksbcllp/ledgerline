'use strict';
/**
 * DOA Phase 0 — Delegation-of-Authority foundation (additive, flag-gated, NOT wired
 * into the live approval engine). Creates the per-tenant DOA policy/matrix storage and
 * a Capex/Opex classification on the PO. With DOA_APPROVALS OFF (default), nothing reads
 * these tables -> behaviour byte-identical for every tenant. Org hierarchy (initiator's
 * head) reuses cost_centers.approver_id/parent_id — no new org table.
 *
 * Tables:
 *  doa_policies        : one policy per (client, expense_type) -> org_level base (SUB_LOB/LOB)
 *  doa_policy_slabs    : cumulative amount slabs within a policy
 *  doa_slab_approvers  : approver specs added at each slab (NAMED/ROLE/DYNAMIC_INITIATOR_HEAD/ANY_ONE_OF_GROUP)
 *  doa_approver_groups : membership for ANY_ONE_OF_GROUP ("any 1 of N")
 */
module.exports = {
  async up(q, S) {
    const tbls = (await q.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    const mk = async (name, def) => { if (!tbls.includes(name)) await q.createTable(name, def); };
    const TS = {
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') }
    };

    await mk('doa_policies', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: S.INTEGER, allowNull: false },
      expense_type: { type: S.ENUM('CAPEX', 'OPEX'), allowNull: false },
      org_level: { type: S.ENUM('SUB_LOB', 'LOB'), allowNull: false },
      name: { type: S.STRING(120), allowNull: true },
      is_active: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      ...TS
    });
    await mk('doa_policy_slabs', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: S.INTEGER, allowNull: false },
      policy_id: { type: S.INTEGER, allowNull: false },
      seq: { type: S.INTEGER, allowNull: false, defaultValue: 1 },
      min_amount: { type: S.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      max_amount: { type: S.DECIMAL(15, 2), allowNull: true }, // null = no upper bound
      label: { type: S.STRING(120), allowNull: true },
      ...TS
    });
    await mk('doa_slab_approvers', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: S.INTEGER, allowNull: false },
      slab_id: { type: S.INTEGER, allowNull: false },
      spec_type: { type: S.ENUM('NAMED', 'ROLE', 'DYNAMIC_INITIATOR_HEAD', 'ANY_ONE_OF_GROUP'), allowNull: false },
      user_id: { type: S.INTEGER, allowNull: true },        // NAMED (internal FixTag user)
      approver_name: { type: S.STRING(120), allowNull: true },  // NAMED (external — no FixTag login)
      approver_email: { type: S.STRING(160), allowNull: true }, // NAMED (external — email-link approval)
      role_code: { type: S.STRING(40), allowNull: true }, // ROLE
      group_key: { type: S.STRING(60), allowNull: true }, // ANY_ONE_OF_GROUP
      position: { type: S.INTEGER, allowNull: false, defaultValue: 1 },
      is_dedup: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      ...TS
    });
    await mk('doa_approver_groups', {
      id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
      client_id: { type: S.INTEGER, allowNull: false },
      group_key: { type: S.STRING(60), allowNull: false },
      user_id: { type: S.INTEGER, allowNull: true },            // internal FixTag user (optional)
      approver_name: { type: S.STRING(120), allowNull: true },  // external member name
      approver_email: { type: S.STRING(160), allowNull: true }, // external member email (email-link approval)
      ...TS
    });

    // Indexes (guarded)
    const addIdx = async (tbl, fields, name, opts = {}) => {
      const idx = await q.showIndex(tbl).catch(() => []);
      if (!(idx || []).map((i) => i.name).includes(name)) await q.addIndex(tbl, fields, { name, ...opts });
    };
    await addIdx('doa_policies', ['client_id', 'expense_type'], 'ix_doa_policies_client_type');
    await addIdx('doa_policy_slabs', ['policy_id'], 'ix_doa_slabs_policy');
    await addIdx('doa_slab_approvers', ['slab_id'], 'ix_doa_slab_approvers_slab');
    await addIdx('doa_approver_groups', ['client_id', 'group_key'], 'ix_doa_groups_key');

    // PO classification (inherited from PR.type)
    const po = await q.describeTable('purchaseorders');
    if (!po.type) await q.addColumn('purchaseorders', 'type', { type: S.ENUM('CAPEX', 'OPEX'), allowNull: true });

    // Feature flag (disabled by default)
    try {
      const [rows] = await q.sequelize.query("SELECT id FROM featuretoggles WHERE feature_key='DOA_APPROVALS' LIMIT 1");
      if (!rows.length) {
        await q.bulkInsert('featuretoggles', [{
          client_id: null, feature_key: 'DOA_APPROVALS', feature_name: 'Delegation of Authority (Opex/Capex DOA matrix)',
          module: 'PROCUREMENT', is_enabled: false, createdAt: new Date(), updatedAt: new Date()
        }]);
      }
    } catch (e) { /* toggle table shape differs — skip */ }
  },

  async down(q) {
    const po = await q.describeTable('purchaseorders');
    if (po.type) await q.removeColumn('purchaseorders', 'type');
    for (const t of ['doa_approver_groups', 'doa_slab_approvers', 'doa_policy_slabs', 'doa_policies']) {
      const tbls = (await q.showAllTables()).map((x) => (typeof x === 'string' ? x : x.tableName));
      if (tbls.includes(t)) await q.dropTable(t);
    }
    try { await q.sequelize.query("DELETE FROM featuretoggles WHERE feature_key='DOA_APPROVALS'"); } catch (e) { /* skip */ }
  }
};
