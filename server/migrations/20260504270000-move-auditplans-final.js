'use strict';

module.exports = {
  up: async (queryInterface) => {
    // First check what statuses exist in auditplans
    const [rows] = await queryInterface.sequelize.query(
      `SELECT DISTINCT status FROM auditplans`
    ).catch(() => [[]]); 
    
    console.log('Statuses in auditplans:', rows.map(r => r.status));

    // Insert with status forced to valid ENUM value
    await queryInterface.sequelize.query(`
      INSERT INTO audit_plannings 
        (audit_name, plan_name, client_id, location_id, frequency, risk_level, auditor_id, status, created_by, created_at, updated_at)
      SELECT 
        COALESCE(plan_name, audit_name, 'Unnamed Plan'),
        plan_name,
        client_id,
        location_id,
        CASE WHEN frequency IN ('ANNUAL','HALF_YEARLY','QUARTERLY','MONTHLY') THEN frequency ELSE 'ANNUAL' END,
        CASE WHEN risk_level IN ('LOW','MEDIUM','HIGH') THEN risk_level ELSE 'LOW' END,
        auditor_id,
        'PLANNED',
        created_by,
        COALESCE(created_at, NOW()),
        NOW()
      FROM auditplans
    `).catch(e => console.log('Insert error:', e.message));
  },
  down: async () => {}
};
