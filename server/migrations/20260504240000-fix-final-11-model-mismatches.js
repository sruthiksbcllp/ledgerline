'use strict';

/**
 * 20260504240000-fix-final-11-model-mismatches.js
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const addIfMissing = async (table, col, def) => {
      try {
        const desc = await queryInterface.describeTable(table);
        if (!desc[col]) await queryInterface.addColumn(table, col, def);
      } catch (_) {}
    };

    // ── apikeys — timestamps:true, no underscored → needs createdAt/updatedAt ─
    await addIfMissing('apikeys', 'createdAt', { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('apikeys', 'updatedAt', { type: Sequelize.DATE, allowNull: true });

    // ── approval_matrix — timestamps:false, underscored:true — missing cols ──
    await addIfMissing('approval_matrix', 'level',            { type: Sequelize.INTEGER, defaultValue: 1 });
    await addIfMissing('approval_matrix', 'role',             { type: Sequelize.STRING(100), allowNull: true });
    await addIfMissing('approval_matrix', 'min_amount',       { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
    await addIfMissing('approval_matrix', 'max_amount',       { type: Sequelize.DECIMAL(15,2), allowNull: true });
    await addIfMissing('approval_matrix', 'is_mandatory',     { type: Sequelize.BOOLEAN, defaultValue: true });
    await addIfMissing('approval_matrix', 'is_active',        { type: Sequelize.BOOLEAN, defaultValue: true });

    // ── approval_workflows — underscored:true — missing status ───────────────
    await addIfMissing('approval_workflows', 'status', {
      type: Sequelize.ENUM('ACTIVE','INACTIVE'), defaultValue: 'ACTIVE'
    });

    // ── audit_evidence — underscored:true — missing asset_id ─────────────────
    await addIfMissing('audit_evidence', 'asset_id', { type: Sequelize.INTEGER, allowNull: true });

    // ── notifications — timestamps:false, underscored:true — missing cols ────
    await addIfMissing('notifications', 'status',  { type: Sequelize.ENUM('PENDING','SENT','FAILED'), defaultValue: 'PENDING' });
    await addIfMissing('notifications', 'message', { type: Sequelize.TEXT, allowNull: true });

    // ── provider_asset_assignments — timestamps:true, no underscored ─────────
    await addIfMissing('provider_asset_assignments', 'createdAt', { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('provider_asset_assignments', 'updatedAt', { type: Sequelize.DATE, allowNull: true });

    // ── provider_users — timestamps:true, no underscored ─────────────────────
    await addIfMissing('provider_users', 'createdAt', { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('provider_users', 'updatedAt', { type: Sequelize.DATE, allowNull: true });

    // ── purchase_requisition_items — underscored:true — missing justification ─
    await addIfMissing('purchase_requisition_items', 'justification', { type: Sequelize.TEXT, allowNull: true });

    // ── scan_logs — timestamps:false, underscored:true — missing user_id ─────
    await addIfMissing('scan_logs', 'user_id', { type: Sequelize.INTEGER, allowNull: true });

    // ── service_tickets — timestamps:true, no underscored ────────────────────
    await addIfMissing('service_tickets', 'createdAt', { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('service_tickets', 'updatedAt', { type: Sequelize.DATE, allowNull: true });

    // ── verificationdetails — timestamps:true, no underscored ────────────────
    await addIfMissing('verificationdetails', 'createdAt', { type: Sequelize.DATE, allowNull: true });
    await addIfMissing('verificationdetails', 'updatedAt', { type: Sequelize.DATE, allowNull: true });
  },

  down: async () => {}
};
