'use strict';

module.exports = {
  up: async (queryInterface) => {
    // Copy ALL rows from auditplans into audit_plannings (no duplicate check)
    await queryInterface.sequelize.query(`
      INSERT INTO audit_plannings 
        (audit_name, plan_name, client_id, location_id, frequency, risk_level, auditor_id, status, created_by, created_at, updated_at)
      SELECT 
        COALESCE(plan_name, audit_name, 'Unnamed Plan') AS audit_name,
        plan_name,
        client_id,
        location_id,
        CASE WHEN frequency IN ('ANNUAL','HALF_YEARLY','QUARTERLY','MONTHLY') THEN frequency ELSE 'ANNUAL' END,
        CASE WHEN risk_level IN ('LOW','MEDIUM','HIGH') THEN risk_level ELSE 'LOW' END,
        auditor_id,
        CASE WHEN status IN ('PLANNED','SCHEDULED','COMPLETED') THEN status ELSE 'PLANNED' END,
        created_by,
        COALESCE(created_at, NOW()),
        COALESCE(updated_at, NOW())
      FROM auditplans
    `).catch(e => console.log('auditplans not found or already migrated:', e.message));
  },
  down: async () => {}
};
