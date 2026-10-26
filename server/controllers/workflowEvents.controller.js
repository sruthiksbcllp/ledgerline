'use strict';

/**
 * Activity trail API: who did what on an AP document, and the latest action on many documents.
 * A trail is only returned when the caller may see the document itself (company + role scope).
 */
const models = require('../models');
const { Op } = require('sequelize');
const { buildWhere } = require('../utils/tenantFilter');
const { readScope } = require('../config/dataAccess');
const { canSeeRow } = require('../middleware/dataAccess.middleware');
const trail = require('../services/workflowTrail.service');

/** module -> the document model and which read scope / ownership columns guard it. */
const DOCS = {
  PR: { model: 'PurchaseRequisition', resource: 'PR', owner: 'requestor_id' },
  RFQ: { model: 'Rfq', resource: 'RFQ', owner: 'created_by' },
  QUOTATION: { model: 'Quotation', resource: 'RFQ', vendor: 'vendor_id' },
  PO: { model: 'PurchaseOrder', resource: 'PO', vendor: 'vendor_id' },
  GATE_ENTRY: { model: 'GateEntry', resource: 'GRN', vendor: 'vendor_id' },
  GRN: { model: 'GRN', resource: 'GRN', vendor: 'vendor_id' },
  SES: { model: 'ServiceEntrySheet', resource: 'SES', owner: 'created_by', vendor: 'vendor_id' },
  INVOICE: { model: 'Invoice', resource: 'INVOICE', vendor: 'vendor_id' },
  DEBIT_NOTE: { model: 'VendorDebitNote', resource: 'INVOICE', vendor: 'vendor_id' }
};

const moduleOf = (raw) => {
  const key = String(raw || '').toUpperCase().replace(/-/g, '_');
  return DOCS[key] ? key : null;
};

async function visible(req, module, row) {
  const cfg = DOCS[module];
  if (module === 'SES' && readScope(req.user?.role, 'SES') === 'own') {
    return require('./serviceEntrySheet.controller').canSeeSes(req, row);
  }
  return canSeeRow(req, cfg.resource, row, { owner: cfg.owner, vendor: cfg.vendor });
}

const attrsFor = (Model, cfg) => ['id', 'client_id', cfg.owner, cfg.vendor, 'po_id'].filter((a) => a && Model.rawAttributes[a]);

exports.getTrail = async (req, res) => {
  const module = moduleOf(req.params.module);
  const id = Number(req.params.id);
  if (!module || !Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Unknown document' });
  const cfg = DOCS[module];
  if (readScope(req.user?.role, cfg.resource) === 'none') {
    return res.status(403).json({ success: false, code: 'NO_DATA_ACCESS', message: 'Your role does not have access to this information.' });
  }
  const Model = models[cfg.model];
  const row = await Model.findOne({ where: { id, ...buildWhere(req) }, attributes: attrsFor(Model, cfg) });
  if (!row || !(await visible(req, module, row))) return res.status(404).json({ success: false, message: 'Not found' });
  const data = await trail.trailOf(models, { clientId: row.client_id, module, id });
  return res.json({ success: true, data });
};

exports.getLatest = async (req, res) => {
  const module = moduleOf(req.params.module);
  if (!module) return res.status(400).json({ success: false, message: 'Unknown document type' });
  const cfg = DOCS[module];
  if (readScope(req.user?.role, cfg.resource) === 'none') return res.json({ success: true, data: {} });
  const ids = String(req.query.ids || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
  if (!ids.length) return res.json({ success: true, data: {} });

  const Model = models[cfg.model];
  const rows = await Model.findAll({ where: { id: { [Op.in]: ids }, ...buildWhere(req) }, attributes: attrsFor(Model, cfg) });
  const allowed = [];
  for (const r of rows) if (await visible(req, module, r)) allowed.push(r);
  const out = {};
  // Group by company so each document's events are read from its own company only.
  const byClient = {};
  for (const r of allowed) (byClient[r.client_id] = byClient[r.client_id] || []).push(r.id);
  for (const [clientId, list] of Object.entries(byClient)) {
    Object.assign(out, await trail.latestOf(models, { clientId: Number(clientId), module, ids: list }));
  }
  return res.json({ success: true, data: out });
};

/**
 * Workflow steps that live only in the browser (the payment proposal on Payment Processing) are
 * and AP Management (invoice holds) are recorded here so they carry the signed-in user's role and name like every other step. Only the
 * named steps below are accepted; the text is never taken from the client.
 */
const STEPS = {
  INVOICE: {
    PAYMENT_PROPOSAL: { action: 'Added to payment proposal', may: ['INVOICE:edit', 'PAYMENT:add', 'PAYMENT:edit'] },
    BANK_PAYMENT: { action: 'Bank payment recorded', may: ['PAYMENT:add', 'PAYMENT:edit', 'INVOICE:edit'] },
    HOLD: { action: 'Placed on payment hold', may: ['INVOICE:edit', 'PAYMENT:add', 'PAYMENT:edit'] },
    RELEASE_HOLD: { action: 'Payment hold released', may: ['INVOICE:edit', 'PAYMENT:add', 'PAYMENT:edit'] }
  }
};

exports.recordStep = async (req, res) => {
  const module = moduleOf(req.params.module);
  const id = Number(req.params.id);
  const step = STEPS[module]?.[String(req.body?.step || '').toUpperCase()];
  if (!module || !step || !Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Unknown workflow step' });
  const { roleAllows } = require('../config/rbac');
  if (!step.may.some((p) => { const [s, a] = p.split(':'); return roleAllows(req.user?.role, s, a); })) {
    return res.status(403).json({ success: false, message: 'Your role cannot perform this step.' });
  }
  const cfg = DOCS[module];
  const Model = models[cfg.model];
  const row = await Model.findOne({ where: { id, ...buildWhere(req) } });
  if (!row || !(await visible(req, module, row))) return res.status(404).json({ success: false, message: 'Not found' });
  const ref = String(req.body?.reference || '').replace(/[^\w\-\/ ]/g, '').slice(0, 40);
  const event = await trail.record(models, {
    module,
    reference_id: row.id,
    reference_no: row.get(trail.TRACKED[cfg.model].number),
    client_id: row.client_id,
    action: ref ? `${step.action} (${ref})` : step.action,
    from_status: row.get('status'),
    to_status: row.get('status'),
    priority: 3
  });
  return res.json({ success: true, data: event });
};
