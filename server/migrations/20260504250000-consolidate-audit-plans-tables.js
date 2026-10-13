'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const addIfMissing = async (table, col, def) => {
      try {
        const [rows] = await queryInterface.sequelize.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND COLUMN_NAME='${col}'`
        );
        if (!rows.length) await queryInterface.addColumn(table, col, def);
      } catch(e) {}
    };

    // Ensure audit_plannings has plan_name column (alias for audit_name)
    await addIfMissing('audit_plannings', 'plan_name', { type: Sequelize.STRING(255), allowNull: true });

    // Copy rows from auditplans into audit_plannings where not already present
    await queryInterface.sequelize.query(`
      INSERT INTO audit_plannings (audit_name, plan_name, client_id, location_id, frequency, risk_level, auditor_id, status, created_by, created_at, updated_at)
      SELECT 
        COALESCE(ap.audit_name, ap.plan_name, 'Unnamed Plan'),
        ap.plan_name,
        ap.client_id,
        ap.location_id,
        CASE ap.frequency 
          WHEN 'MONTHLY' THEN 'MONTHLY'
          WHEN 'QUARTERLY' THEN 'QUARTERLY'
          WHEN 'ANNUAL' THEN 'ANNUAL'
          WHEN 'HALF_YEARLY' THEN 'HALF_YEARLY'
          ELSE 'ANNUAL'
        END,
        COALESCE(ap.risk_level, 'LOW'),
        ap.auditor_id,
        COALESCE(ap.status, 'PLANNED'),
        ap.created_by,
        COALESCE(ap.created_at, NOW()),
        COALESCE(ap.updated_at, NOW())
      FROM auditplans ap
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_plannings apl 
        WHERE apl.plan_name = ap.plan_name AND apl.client_id <=> ap.client_id
      )
    `).catch(() => {}); // auditplans may not exist — that's fine
  },

  down: async (queryInterface) => {}
};
