const cron = require('node-cron');
const { runSLAEscalation } = require('../services/sla.service');
const { runMonthlyAutomation } = require('../services/monthlyJobs.service');

let schedulerStarted = false;
let monthlyJobRegistered = false;
let slaJobRegistered = false;
let monthlyJob = null;
let slaJob = null;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const executeWithRetry = async (jobName, fn, maxAttempts = 3, delayMs = 2000) => {
  let attempt = 0;
  let lastError = null;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) await wait(delayMs);
    }
  }
  throw lastError;
};

const startScheduler = () => {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Monthly Jobs
  monthlyJob = cron.schedule('0 0 1 * *', async () => {
    try {
      await executeWithRetry('Monthly automation', runMonthlyAutomation);
    } catch { /* non-fatal */ }
  });
  monthlyJobRegistered = true;

  // SLA Escalation (Every 5 minutes)
  slaJob = cron.schedule('*/5 * * * *', async () => {
    try {
      await executeWithRetry('SLA escalation', runSLAEscalation);
    } catch { /* non-fatal */ }
  });
  slaJobRegistered = true;

  // Alert Engine (Every Hour)
  const alertEngine = require('../services/alertEngine.service');
  cron.schedule('0 * * * *', async () => {
    try {
      await executeWithRetry('Alert engine', () => alertEngine.runRules());
    } catch { /* non-fatal */ }
  });

  // Vendor compliance refresh (daily at 2am)
  const VendorComplianceService = require('../services/VendorComplianceService');
  cron.schedule('0 2 * * *', async () => {
    try {
      await executeWithRetry('Vendor compliance daily checks', () => VendorComplianceService.runAllVendorChecks());
    } catch { /* non-fatal */ }
  });

  // Daily notifications — overdue maintenance, expiring insurance/warranty (8am)
  const notificationScheduler = require('../services/notificationScheduler.service');
  cron.schedule('0 8 * * *', async () => {
    try {
      await executeWithRetry('Daily notifications', () => notificationScheduler.runDailyNotifications());
    } catch { /* non-fatal */ }
  });
};

const getSchedulerStatus = () => ({
  initialized: schedulerStarted,
  monthlyJobRegistered,
  running: Boolean(schedulerStarted && monthlyJobRegistered && monthlyJob)
});

module.exports = { startScheduler, getSchedulerStatus };
