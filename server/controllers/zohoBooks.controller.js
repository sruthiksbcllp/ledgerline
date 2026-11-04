'use strict';

/**
 * Zoho Books sync (Settings → Integrations → Zoho Books): status, account mapping, automatic sync
 * on/off, and "Sync now". Company-admin only, scoped to the admin's selected company.
 */
const sync = require('../services/integrations/zohoBooksSync');
const { IntegrationError } = require('../services/integrations/common');
const { recordAudit } = require('../utils/financeAudit');

const clientIdOf = (req) => req.user?.client_id || null;
const fail = (res, error) => {
  const status = error instanceof IntegrationError ? error.status : 500;
  if (status === 500) console.error('[zohoBooks]', error);
  return res.status(status).json({ success: false, code: error.code || 'ERROR', message: status === 500 ? 'Zoho Books sync failed' : error.message });
};

exports.status = async (req, res) => {
  try { return res.json({ success: true, data: await sync.status(clientIdOf(req)) }); } catch (e) { return fail(res, e); }
};

exports.mapping = async (req, res) => {
  try { return res.json({ success: true, data: await sync.mapping(clientIdOf(req)) }); } catch (e) { return fail(res, e); }
};

exports.saveSettings = async (req, res) => {
  try {
    await sync.saveSettings(clientIdOf(req), req.body || {});
    await recordAudit(req, { module: 'INTEGRATIONS', entityType: 'INTEGRATION_CONNECTION', entityId: null, action: 'ZOHO_BOOKS_SETTINGS', note: 'Zoho Books sync settings changed' });
    return res.json({ success: true, message: 'Zoho Books settings saved', data: await sync.mapping(clientIdOf(req)) });
  } catch (e) { return fail(res, e); }
};

/** Sync one record ({ type: 'VENDOR' | 'BILL' | 'PAYMENT', id }) or, with no type, everything pending. */
exports.syncNow = async (req, res) => {
  const clientId = clientIdOf(req);
  const { type, id } = req.body || {};
  try {
    if (!type) {
      const out = await sync.syncAll(clientId);
      return res.json({ success: true, message: `${out.synced} record(s) sent to Zoho Books${out.failed.length ? `, ${out.failed.length} failed` : ''}`, data: out });
    }
    const n = Number(id);
    if (!n) return res.status(400).json({ success: false, message: 'Give the record id' });
    const link = type === 'VENDOR' ? await sync.syncVendor(clientId, n, { resync: true })
      : type === 'BILL' ? await sync.syncBill(clientId, n)
        : type === 'PAYMENT' ? await sync.syncPayment(clientId, { paymentId: n })
          : type === 'TDS_DEPOSIT' ? await sync.syncTdsDeposit(clientId, n)
            : null;
    if (!link && type !== 'PAYMENT') return res.status(400).json({ success: false, message: 'Unknown record type' });
    return res.json({ success: true, message: 'Sent to Zoho Books', data: link });
  } catch (e) { return fail(res, e); }
};

/** Vendors in Zoho Books that would be imported into Vendor Master (nothing is saved). */
exports.vendorImportPreview = async (req, res) => {
  try {
    const out = await sync.importVendors(clientIdOf(req), { dryRun: true });
    return res.json({ success: true, data: { total: out.total, already_linked: out.already_linked, to_link: out.matched, to_create: out.created } });
  } catch (e) { return fail(res, e); }
};

/** Brings Zoho Books vendors into Vendor Master so PRs, RFQs and POs can use them. */
exports.vendorImport = async (req, res) => {
  try {
    const out = await sync.importVendors(clientIdOf(req));
    await recordAudit(req, { module: 'INTEGRATIONS', entityType: 'VENDOR', entityId: null, action: 'ZOHO_BOOKS_VENDOR_IMPORT', note: `Imported ${out.created.length} vendor(s) from Zoho Books, linked ${out.matched.length}` });
    return res.json({
      success: true,
      message: `${out.created.length} vendor(s) added from Zoho Books${out.matched.length ? `, ${out.matched.length} linked to existing vendors` : ''}${out.failed.length ? `, ${out.failed.length} failed` : ''}`,
      data: out
    });
  } catch (e) { return fail(res, e); }
};
