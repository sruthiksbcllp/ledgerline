const { AssetAmc, AuditSchedule, ActivityLog, Client } = require('../models');
const { runMonthlyDepreciationPosting } = require('./depreciationPosting.service');
const { buildMonthlyCapexPayload } = require('./capex.service');
const { toFiscalYear } = require('./financialPeriod.service');

const now = () => new Date();

const getPreviousMonthContext = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const period_month = d.getMonth() + 1;
  const fiscal_year = toFiscalYear(d);
  return { fiscal_year, period_month };
};

const runDepreciationJob = async (clientId) => {
  const { fiscal_year, period_month } = getPreviousMonthContext();
  return runMonthlyDepreciationPosting({ fiscal_year, period_month, source: 'scheduler', clientId });
};

const runAmcExpiryAlerts = async (clientId) => {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const expiring = await AssetAmc.findAll({
    where: {
      client_id: clientId,
      end_date: {
        [require('sequelize').Op.gte]: now(),
        [require('sequelize').Op.lte]: thirtyDaysFromNow
      }
    }
  });

  console.log(`[Scheduler - Client ${clientId}] AMC expiry alerts: ${expiring.length} contracts expiring`);
  return { count: expiring.length };
};

const runAuditReminders = async (clientId) => {
  const tenDaysFromNow = new Date();
  tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

  const pendingAudits = await AuditSchedule.findAll({
    where: {
      client_id: clientId,
      status: 'SCHEDULED',
      start_date: {
        [require('sequelize').Op.gte]: now(),
        [require('sequelize').Op.lte]: tenDaysFromNow
      }
    }
  });

  console.log(`[Scheduler - Client ${clientId}] Audit reminders: ${pendingAudits.length} upcoming schedules`);
  return { count: pendingAudits.length };
};

const runCapexMonthlyReport = async (clientId) => {
  const reportMonth = new Date().toISOString().slice(0, 7);
  const payload = await buildMonthlyCapexPayload(clientId, reportMonth);
  return {
    month: reportMonth,
    budgeted: payload.ytdSummary.budgeted,
    actual: payload.ytdSummary.actual,
    committed: payload.ytdSummary.committed,
    requestCount: payload.requests.length
  };
};

const runMonthlyAutomation = async () => {
  const startedAt = new Date().toISOString();
  console.log(`[Scheduler] Global monthly automation started at ${startedAt}`);
  
  try {
    const clients = await Client.findAll();
    const results = [];

    for (const client of clients) {
      const clientId = client.id;
      console.log(`[Scheduler] Processing automation for Client: ${client.client_name} (ID: ${clientId})`);
      
      const depreciation = await runDepreciationJob(clientId);
      const amc = await runAmcExpiryAlerts(clientId);
      const audit = await runAuditReminders(clientId);
      const capex = await runCapexMonthlyReport(clientId);

      results.push({ clientId, depreciation, amc, audit, capex });
    }

    try {
      await ActivityLog.create({
        user_id: 1,
        action: 'MONTHLY_AUTOMATION',
        module: 'SCHEDULER',
        description: `Monthly automation completed for ${clients.length} clients`,
        new_values: { results, startedAt, completedAt: new Date().toISOString() }
      });
    } catch (logError) {
      console.warn('[Scheduler] Activity log write skipped:', logError.message);
    }

    console.log('[Scheduler] Global monthly automation completed successfully');
    return { success: true, results };
  } catch (error) {
    console.error('[Scheduler] Global monthly automation failed:', error);
    return { success: false, message: error.message };
  }
};

module.exports = { runMonthlyAutomation };
