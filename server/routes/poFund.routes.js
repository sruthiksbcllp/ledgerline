'use strict';
const express = require('express');
const router = express.Router();
const models = require('../models');
const { PoFundLimit } = models;
const fund = require('../services/poFund.service');
const { verifyToken, requireSeniorAdmin } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');
const { requireRead } = require('../middleware/dataAccess.middleware');
const { getClientId } = require('../utils/tenantFilter');
const { resolveActor } = require('../services/workflowTrail.service');

// Monthly purchase fund. Anyone who may see POs reads the position; only admins set the limit.
router.use(verifyToken);
router.use(tenantMiddleware);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clientOf = (req) => getClientId(req) || req.user?.client_id || null;
const fail = (res, status, message) => res.status(status).json({ success: false, message });

// GET /api/po-fund/summary?period=YYYY-MM&amount=123
router.get('/summary', requireRead('PO'), wrap(async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const amount = req.query.amount != null && req.query.amount !== '' ? Number(req.query.amount) : null;
  res.json({ success: true, data: await fund.summary(clientId, { period: req.query.period, amount: Number.isFinite(amount) ? amount : null }) });
}));

// PUT /api/po-fund/limit { period, limit_amount, remarks } - this month or a later one.
router.put('/limit', requireSeniorAdmin, wrap(async (req, res) => {
  const clientId = clientOf(req);
  if (!clientId) return fail(res, 400, 'Select a company first');
  const { period, limit_amount, remarks } = req.body || {};
  if (!fund.isPeriod(period)) return fail(res, 400, 'Choose the month the limit applies from');
  if (period < fund.currentPeriod()) return fail(res, 400, 'A past month cannot be changed; set the limit from this month onwards');
  const amount = Number(limit_amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'Enter a limit above zero');
  if (amount > 1e13) return fail(res, 400, 'Limit is too large');
  const actor = await resolveActor(models, null, clientId).catch(() => ({}));
  const fields = {
    limit_amount: Math.round(amount * 100) / 100,
    remarks: remarks ? String(remarks).trim().slice(0, 500) : null,
    set_by: req.user?.id || null,
    set_by_name: actor.user_name || req.user?.username || null
  };
  const existing = await PoFundLimit.findOne({ where: { client_id: clientId, period } });
  if (existing) await existing.update(fields);
  else await PoFundLimit.create({ client_id: clientId, period, ...fields });
  res.json({ success: true, message: 'Monthly fund limit saved', data: await fund.summary(clientId, {}) });
}));

module.exports = router;
