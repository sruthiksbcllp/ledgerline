'use strict';

const { PoPrintConfig, PurchaseOrder, Company, sequelize } = require('../models');
const { success, error } = require('../utils/responseHandler');
const { getClientId } = require('../utils/tenantFilter');
const { generatePoPdf } = require('../services/poPrint.service');

const ADMIN_ROLES = ['PROVIDER_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'];
const isAdmin = (req) => ADMIN_ROLES.includes(String(req.user?.role || '').toUpperCase());

const EDITABLE = [
  'company_name', 'registered_address', 'gst_number', 'pan_number', 'isd_number',
  'terms_conditions', 'default_warranty', 'default_payment_terms',
  'requested_by_label', 'approved_by_label', 'footer_note', 'procurement_cc_email', 'is_active', // CFG-02: procurement_cc_email
  'show_pr_number', 'show_quotation_number' // #5 the client: PO-print toggles
];

// Resolve tenant: normal user -> own client_id; PROVIDER_ADMIN -> body/query client_id,
// else the selected company (x-company-id header -> Company.client_id). null if unresolved.
async function resolveClientId(req) {
  let cid = null;
  try { cid = getClientId(req); } catch (e) { cid = null; }
  if (cid) return cid;
  const explicit = req.body?.client_id || req.query?.client_id;
  if (explicit) return Number(explicit);
  const companyId = req.headers['x-company-id'];
  if (companyId) {
    const company = await Company.findByPk(companyId, { attributes: ['client_id'] }).catch(() => null);
    if (company && company.client_id) return company.client_id;
  }
  return null;
}

// GET /procurement/po-print-config — client's print profile(s) (logo bytes excluded; has_logo flag added)
exports.getConfig = async (req, res, next) => {
  try {
    const clientId = await resolveClientId(req);
    const where = clientId ? { client_id: clientId } : { client_id: null };
    const rows = await PoPrintConfig.findAll({
      where, order: [['entity_id', 'ASC']],
      attributes: { include: [[sequelize.literal('logo_data IS NOT NULL'), 'has_logo']], exclude: ['logo_data'] }
    });
    return success(res, rows);
  } catch (e) { next(e); }
};

// PUT /procurement/po-print-config — upsert profile for (client, entity)
exports.upsertConfig = async (req, res, next) => {
  try {
    if (!isAdmin(req)) return error(res, 'Not authorized to edit PO print settings', 403);
    const clientId = await resolveClientId(req);
    if (!clientId) return error(res, 'Select a client/company first, then save', 400);
    const entity_id = req.body.entity_id || null;

    const data = {};
    EDITABLE.forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

    let row = await PoPrintConfig.findOne({ where: { client_id: clientId, entity_id } });
    if (row) { await row.update(data); }
    else { row = await PoPrintConfig.create({ client_id: clientId, entity_id, ...data }); }
    const out = row.toJSON(); delete out.logo_data;
    return success(res, out, 'PO print settings saved');
  } catch (e) { next(e); }
};

// POST /procurement/po-print-config/logo — store the logo in the DB (survives redeploys)
exports.uploadLogo = async (req, res, next) => {
  try {
    if (!isAdmin(req)) return error(res, 'Not authorized to upload a logo', 403);
    if (!req.file || !req.file.buffer) return error(res, 'No file uploaded', 400);
    const clientId = await resolveClientId(req);
    if (!clientId) return error(res, 'Select a client/company first', 400);
    let row = await PoPrintConfig.findOne({ where: { client_id: clientId, entity_id: null } });
    if (!row) row = await PoPrintConfig.create({ client_id: clientId, entity_id: null });
    await row.update({ logo_data: req.file.buffer, logo_mime: req.file.mimetype, logo_url: null });
    return success(res, { has_logo: true }, 'Logo uploaded');
  } catch (e) { next(e); }
};

// GET /procurement/po-print-config/logo — stream the stored logo (for the settings preview)
exports.getLogo = async (req, res, next) => {
  try {
    const clientId = await resolveClientId(req);
    const row = await PoPrintConfig.findOne({ where: { client_id: clientId, entity_id: null }, attributes: ['logo_data', 'logo_mime'] });
    if (!row || !row.logo_data) return res.status(404).end();
    res.setHeader('Content-Type', row.logo_mime || 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(row.logo_data);
  } catch (e) { next(e); }
};

// GET /procurement/po/:id/print — stream the PO as a PDF
exports.printPo = async (req, res, next) => {
  try {
    const clientId = await resolveClientId(req);
    const po = await PurchaseOrder.findOne({
      where: { id: req.params.id, ...(clientId ? { client_id: clientId } : {}) },
      attributes: ['id', 'po_number']
    });
    if (!po) return error(res, 'PO not found', 404);

    const pdf = await generatePoPdf(po.id, clientId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="PO-${(po.po_number || po.id).toString().replace(/[^A-Za-z0-9_-]/g, '_')}.pdf"`);
    return res.end(pdf);
  } catch (e) {
    if (e.status === 404) return error(res, 'PO not found', 404);
    next(e);
  }
};

// ── Phase 4b: per-department PO Terms & Conditions defaults ──────────────
const { PoTermsDefault, Department } = require('../models');

// GET /procurement/po-terms-defaults — tenant's department T&C defaults + department list
exports.getTermsDefaults = async (req, res, next) => {
  try {
    const clientId = await resolveClientId(req);
    if (!clientId) return error(res, 'Select a client/company first', 400);
    const rows = await PoTermsDefault.findAll({ where: { client_id: clientId }, order: [['id', 'ASC']] });
    let departments = [];
    try {
      departments = await Department.findAll({
        where: { client_id: clientId },
        attributes: ['id', 'department_name'], order: [['department_name', 'ASC']]
      });
    } catch (e) { departments = []; }
    return success(res, { defaults: rows, departments }, 'PO terms defaults');
  } catch (e) { next(e); }
};

// POST /procurement/po-terms-defaults — upsert a department's T&C default (department_id null = tenant-wide)
exports.saveTermsDefault = async (req, res, next) => {
  try {
    if (!isAdmin(req)) return error(res, 'Not authorized to edit PO terms defaults', 403);
    const clientId = await resolveClientId(req);
    if (!clientId) return error(res, 'Select a client/company first', 400);
    const department_id = req.body.department_id || null;
    const data = {
      warranty: req.body.warranty ?? null,
      payment_terms: req.body.payment_terms ?? null,
      terms_conditions: req.body.terms_conditions ?? null
    };
    let row = await PoTermsDefault.findOne({ where: { client_id: clientId, department_id } });
    if (row) { await row.update(data); }
    else { row = await PoTermsDefault.create({ client_id: clientId, department_id, ...data }); }
    return success(res, row, 'PO terms default saved');
  } catch (e) { next(e); }
};

// DELETE /procurement/po-terms-defaults/:id
exports.deleteTermsDefault = async (req, res, next) => {
  try {
    if (!isAdmin(req)) return error(res, 'Not authorized', 403);
    const clientId = await resolveClientId(req);
    if (!clientId) return error(res, 'Select a client/company first', 400);
    const row = await PoTermsDefault.findOne({ where: { id: req.params.id, client_id: clientId } });
    if (!row) return error(res, 'Not found', 404);
    await row.destroy();
    return success(res, {}, 'Deleted');
  } catch (e) { next(e); }
};
