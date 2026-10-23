const { AssetAlert, SLARule, AlertAction, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * SLA ESCALATION ENGINE
 * Scans for breached SLAs and escalates alerts automatically
 */
const runSLAEscalation = async () => {
  console.log('[SLA Engine] Starting scan...');
  try {
    // 1. Fetch active SLA rules
    const rules = await SLARule.findAll({ where: { is_active: true } });

    for (const rule of rules) {
      const breachTime = new Date(Date.now() - rule.max_response_time_minutes * 60000);

      // 2. Find alerts that breached this rule
      const breachedAlerts = await AssetAlert.findAll({
        where: {
          alert_type: rule.alert_type,
          priority: rule.priority,
          status: { [Op.notIn]: ['RESOLVED', 'ESCALATED'] },
          created_at: { [Op.lt]: breachTime }
        }
      });

      if (breachedAlerts.length > 0) {
        console.log(`[SLA Engine] Found ${breachedAlerts.length} breaches for ${rule.alert_type} (${rule.priority})`);
      }

      for (const alert of breachedAlerts) {
        await sequelize.transaction(async (t) => {
          // 3. Escalate Alert
          await alert.update({
            status: 'ESCALATED',
            assigned_to: rule.escalate_to || alert.assigned_to
          }, { transaction: t });

          // 4. Log Action
          await AlertAction.create({
            alert_id: alert.id,
            action_type: 'ESCALATE',
            performed_by: 0, // 0 = System
            comment: `Auto-escalated by SLA Engine (Breached ${rule.max_response_time_minutes} min SLA)`
          }, { transaction: t });
          
          // Note: Notification will be triggered by hooks/service (future)
        });
      }
    }
  } catch (error) {
    console.error('[SLA Engine] Error:', error);
  }
};

module.exports = { runSLAEscalation };
