'use strict';
/**
 * CR-DEP-01 — Async depreciation posting job service.
 * DB-backed job (depreciation_jobs) + in-process background execution + progress.
 * No Redis/Bull (single API container per env; mirrors the IntegrationQueue pattern).
 * The posting math lives in depreciationPosting.service; this only orchestrates.
 */
const { DepreciationJob } = require('../models');
const { runMonthlyDepreciationPosting } = require('./depreciationPosting.service');
const { runItActBlock } = require('./itActBlockPosting.service');
const { Op } = require('sequelize');

const STALE_MINUTES = Number(process.env.DEP_JOB_STALE_MINUTES || 20);

// Fire-and-forget background execution. Never rejects to the caller.
async function _run(jobId) {
  const job = await DepreciationJob.findByPk(jobId);
  if (!job) return;
  try {
    await job.update({ status: 'RUNNING', started_at: new Date(), heartbeat_at: new Date() });
    const onProgress = async ({ processed, posted, skipped }) => {
      try {
        await job.update({
          processed_assets: processed,
          ...(posted !== undefined ? { posted_count: posted } : {}),
          ...(skipped !== undefined ? { skipped_count: skipped } : {}),
          heartbeat_at: new Date()
        });
      } catch { /* progress update is best-effort */ }
    };
    if (job.job_type === 'IT_ACT_ANNUAL') {
      const r = await runItActBlock(job.client_id, job.fiscal_year, { onProgress });
      await job.update({
        status: 'COMPLETED',
        posted_count: (r.blocks ? r.blocks.length : 0),
        finished_at: new Date(),
        heartbeat_at: new Date()
      });
    } else {
      const result = await runMonthlyDepreciationPosting({
        fiscal_year: job.fiscal_year,
        period_month: job.period_month,
        clientId: job.client_id,
        userId: job.created_by,
        source: job.source,
        onProgress
      });
      await job.update({
        status: 'COMPLETED',
        posted_count: result.postedCount,
        skipped_count: result.skippedCount,
        finished_at: new Date(),
        heartbeat_at: new Date()
      });
    }
  } catch (err) {
    try {
      await job.update({
        status: 'FAILED',
        error_message: String(err && err.message ? err.message : err).slice(0, 2000),
        finished_at: new Date()
      });
    } catch { /* swallow */ }
  }
}

/**
 * Create a job and start it in the background. Concurrency-safe: if a QUEUED/RUNNING
 * job already exists for the same tenant + FY + month, return it instead of starting another.
 * The underlying posting is idempotent (per asset+book+fy+month), so this is defence-in-depth.
 */
async function createAndRun({ fiscal_year, period_month = null, clientId, userId, source = 'manual', total_assets = null, jobType = 'MONTHLY' }) {
  const existing = await DepreciationJob.findOne({
    where: {
      client_id: clientId,
      fiscal_year,
      period_month,
      job_type: jobType,
      status: { [Op.in]: ['QUEUED', 'RUNNING'] }
    },
    order: [['id', 'DESC']]
  });
  if (existing) return { job: existing, reused: true };

  const job = await DepreciationJob.create({
    client_id: clientId,
    fiscal_year,
    period_month,
    job_type: jobType,
    status: 'QUEUED',
    total_assets,
    created_by: userId || null,
    source
  });
  // do NOT await — background execution
  setImmediate(() => { _run(job.id); });
  return { job, reused: false };
}

async function getJob(id, clientId) {
  const where = { id };
  if (clientId) where.client_id = clientId; // provider-admin (null clientId) may read any
  return DepreciationJob.findOne({ where });
}

async function listJobs(clientId, limit = 20) {
  const where = {};
  if (clientId) where.client_id = clientId;
  return DepreciationJob.findAll({ where, order: [['id', 'DESC']], limit: Math.min(Number(limit) || 20, 100) });
}

/**
 * Startup reconciler: any RUNNING job whose heartbeat is older than STALE_MINUTES was
 * orphaned by a process restart. Mark it FAILED — safe to re-run (posting is idempotent).
 */
async function reconcileStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
  const [count] = await DepreciationJob.update(
    { status: 'FAILED', error_message: 'Interrupted by a restart — safe to re-run (posting is idempotent).', finished_at: new Date() },
    { where: { status: { [Op.in]: ['RUNNING', 'QUEUED'] }, [Op.or]: [{ heartbeat_at: { [Op.lt]: cutoff } }, { heartbeat_at: null, createdAt: { [Op.lt]: cutoff } }] } }
  );
  return count;
}

module.exports = { createAndRun, getJob, listJobs, reconcileStaleJobs, _run };
