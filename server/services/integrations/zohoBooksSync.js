'use strict';
/**
 * Push vendors, vendor bills and payments from LedgerLine to the connected Zoho Books organisation.
 * Zoho builds its own ledger from these, so LedgerLine journals are not sent as manual journals.
 *
 *   Vendor            → Zoho contact (contact_type vendor, GSTIN, GST treatment, place of contact)
 *   Invoice approved  → Zoho bill at the full amount (line on the mapped expense / asset account, GST tax)
 *     PO advance      → Zoho vendor payment applied to the bill (cash that left the bank at the PO)
 *     Return / cash discount → Zoho vendor credit against the bill
 *   Payment           → Zoho vendor payment applied to the bill; the invoice's TDS goes with the first
 *                       one as tax_amount_withheld, so cash + TDS clear the bill as in LedgerLine
 *
 * Accounts, taxes and the bank account are looked up in the organisation (settings can override the
 * account per LedgerLine account code). Every record's Zoho ID and last error are kept in
 * integration_links, so nothing is created twice and failures show on Settings → Integrations.
 */
// Loaded on first use: install() runs while models/index.js is still building the models.
let models = null;
const M = () => models || (models = require('../../models'));
const accessTokenFor = (row) => require('./connection.service').accessTokenFor(row);
const isLive = () => require('./connection.service').isLive();
const { IntegrationError, httpRequest } = require('./common');

const PROVIDER = 'zoho_books';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));

// GSTIN state code (first two digits) → the two-letter code Zoho Books uses for place of supply.
const GST_STATE = {
  '01': 'JK', '02': 'HP', '03': 'PB', '04': 'CH', '05': 'UT', '06': 'HR', '07': 'DL', '08': 'RJ', '09': 'UP', '10': 'BR',
  '11': 'SK', '12': 'AR', '13': 'NL', '14': 'MN', '15': 'MZ', '16': 'TR', '17': 'ML', '18': 'AS', '19': 'WB', '20': 'JH',
  '21': 'OR', '22': 'CG', '23': 'MP', '24': 'GJ', '26': 'DN', '27': 'MH', '29': 'KA', '30': 'GA', '31': 'LD', '32': 'KL',
  '33': 'TN', '34': 'PY', '35': 'AN', '36': 'TS', '37': 'AP', '38': 'LA', '97': 'OT'
};
const stateOf = (gstin) => GST_STATE[String(gstin || '').slice(0, 2)] || null;
// LedgerLine payment mode → Zoho Books payment mode.
const zohoMode = (mode) => ({ Cash: 'Cash', Cheque: 'Check' }[mode] || (mode ? 'Bank Transfer' : undefined));

// Default Zoho account per LedgerLine cost account, by name, when settings do not pick one.
const ACCOUNT_HINTS = {
  1200: { types: ['stock', 'inventory', 'other_current_asset'], words: ['inventory', 'stock'] },
  1500: { types: ['fixed_asset'], words: ['furniture', 'equipment', 'asset', 'capital'] },
  6350: { types: ['expense', 'other_expense', 'cost_of_goods_sold'], words: ['contract', 'consult', 'professional', 'service', 'outsourc'] },
  6800: { types: ['expense', 'other_expense', 'cost_of_goods_sold'], words: ['office supplies', 'consumable', 'office expense', 'supplies'] },
  4100: { types: ['income', 'other_income'], words: ['discount'] }
};

// ── Connection and requests ──────────────────────────────────────────────────
async function connectionFor(clientId) {
  if (!isLive()) throw new IntegrationError('Integrations are not activated on this server (INTEGRATIONS_LIVE).', 503, 'NOT_ACTIVATED');
  const row = await M().IntegrationConnection.findOne({ where: { client_id: clientId, provider: PROVIDER } });
  if (!row || !['CONNECTED', 'ERROR'].includes(row.status)) throw new IntegrationError('Zoho Books is not connected for this company.', 409, 'NOT_CONNECTED');
  const cfg = row.config || {};
  if (!cfg.api_domain || !cfg.organization_id) throw new IntegrationError('Zoho Books organisation is not known yet. Run Test on the Zoho Books card.', 409, 'RECONNECT');
  return row;
}

async function zoho(row, method, path, body) {
  const cfg = row.config || {};
  const token = await accessTokenFor(row);
  const sep = path.includes('?') ? '&' : '?';
  const res = await httpRequest(`${cfg.api_domain}/books/v3${path}${sep}organization_id=${encodeURIComponent(cfg.organization_id)}`, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs: 30000
  });
  if (res.status === 429) throw new IntegrationError('Zoho Books rate limit reached (100 requests a minute). Try again shortly.', 429, 'RATE_LIMIT');
  if (res.status === 401) throw new IntegrationError('Zoho rejected the access token. Connect again.', 409, 'RECONNECT');
  if (!res.body || res.body.code !== 0) {
    throw new IntegrationError(`Zoho Books: ${res.body?.message || `request failed (${res.status})`}`, 502, 'PROVIDER_ERROR');
  }
  return res.body;
}

/** Accounts, GST taxes and bank accounts of the organisation (fetched once per sync run). */
async function lookups(row, cache = {}) {
  if (cache.loaded) return cache;
  const [accounts, taxes, groups, banks] = await Promise.all([
    zoho(row, 'GET', '/chartofaccounts').then((b) => b.chartofaccounts || []).catch(() => []),
    zoho(row, 'GET', '/settings/taxes').then((b) => b.taxes || []).catch(() => []),
    zoho(row, 'GET', '/settings/taxgroups').then((b) => b.tax_groups || []).catch(() => []),
    zoho(row, 'GET', '/bankaccounts').then((b) => b.bankaccounts || []).catch(() => [])
  ]);
  return Object.assign(cache, { loaded: true, accounts, taxes, groups, banks });
}

function accountFor(code, row, lk) {
  const chosen = (row.config?.account_map || {})[code];
  if (chosen) return chosen;
  const hint = ACCOUNT_HINTS[code] || ACCOUNT_HINTS[6800];
  const pool = lk.accounts.filter((a) => hint.types.includes(String(a.account_type || '').toLowerCase()) && a.is_active !== false);
  const named = pool.find((a) => hint.words.some((w) => String(a.account_name || '').toLowerCase().includes(w)));
  const pick = named || pool[0];
  if (!pick) throw new IntegrationError(`No Zoho Books account found for LedgerLine account ${code}. Choose one under Zoho Books → Account mapping.`, 422, 'NO_ACCOUNT');
  return pick.account_id;
}

/** GST on a bill line: IGST tax when the invoice is inter-state, else the CGST+SGST group at that rate. */
function gstTaxFor(inv, lk) {
  const base = Number(inv.base_amount || 0), gst = Number(inv.gst_amount || 0);
  if (!(gst > 0) || !(base > 0)) return null;
  const rate = Math.round((gst / base) * 1000) / 10;
  const close = (p) => Math.abs(Number(p) - rate) < 0.06;
  if (Number(inv.igst_amount || 0) > 0) {
    const igst = lk.taxes.find((t) => String(t.tax_specific_type || '').toLowerCase() === 'igst' && close(t.tax_percentage));
    if (igst) return igst.tax_id;
  }
  const group = lk.groups.find((g) => close(g.tax_group_percentage));
  if (group) return group.tax_group_id;
  const any = lk.taxes.find((t) => close(t.tax_percentage));
  if (any) return any.tax_id;
  throw new IntegrationError(`No ${rate}% GST tax in Zoho Books. Add it under Zoho Books → Settings → Taxes.`, 422, 'NO_TAX');
}

function bankFor(row, lk) {
  const chosen = row.config?.bank_account_id;
  if (chosen) return chosen;
  const bank = lk.banks.find((b) => b.is_active !== false && String(b.account_type || 'bank').toLowerCase() === 'bank') || lk.banks[0];
  if (!bank) throw new IntegrationError('No bank account in Zoho Books to pay from. Add one in Zoho Books → Banking.', 422, 'NO_BANK');
  return bank.account_id;
}

// ── Links ────────────────────────────────────────────────────────────────────
const linkOf = (clientId, entity, localId) => M().IntegrationLink.findOne({ where: { client_id: clientId, provider: PROVIDER, entity_type: entity, local_id: localId } });

/** Run one record's sync and record the outcome. Already-synced records are returned as they are. */
async function track(clientId, entity, localId, fn, { resync = false } = {}) {
  const [link] = await M().IntegrationLink.findOrCreate({
    where: { client_id: clientId, provider: PROVIDER, entity_type: entity, local_id: localId },
    defaults: { status: 'PENDING' }
  });
  if (link.status === 'SYNCED' && link.external_id && !resync) return link;
  try {
    const out = await fn(link);
    await link.update({ external_id: String(out.id), external_ref: out.ref ? String(out.ref).slice(0, 150) : null, status: 'SYNCED', last_error: null, synced_at: new Date() });
  } catch (e) {
    await link.update({ status: 'FAILED', last_error: String(e.message || e).slice(0, 500) });
    throw e;
  }
  return link;
}

// ── Records ──────────────────────────────────────────────────────────────────
async function syncVendor(clientId, vendorId, ctx = {}) {
  const row = ctx.row || await connectionFor(clientId);
  const v = await M().Vendor.findByPk(vendorId);
  if (!v) throw new IntegrationError('Vendor not found', 404, 'NOT_FOUND');
  const existing = await linkOf(clientId, 'VENDOR', v.id);
  return track(clientId, 'VENDOR', v.id, async () => {
    const gstin = String(v.gst_number || '').trim().toUpperCase();
    const body = {
      contact_name: v.vendor_name,
      company_name: v.vendor_name,
      contact_type: 'vendor',
      gst_treatment: gstin ? 'business_gst' : 'business_none',
      ...(gstin ? { gst_no: gstin } : {}),
      ...(stateOf(gstin) ? { place_of_contact: stateOf(gstin) } : {}),
      ...(v.email || v.phone ? { contact_persons: [{ first_name: v.contact_person || v.vendor_name, email: v.email || undefined, phone: v.phone || undefined, is_primary_contact: true }] } : {}),
      notes: [v.vendor_code && `LedgerLine vendor ${v.vendor_code}`, v.pan_number && `PAN ${v.pan_number}`].filter(Boolean).join(' · ') || undefined
    };
    const res = existing?.external_id
      ? await zoho(row, 'PUT', `/contacts/${existing.external_id}`, body)
      : await zoho(row, 'POST', '/contacts', body);
    return { id: res.contact.contact_id, ref: v.vendor_name };
  }, { resync: Boolean(ctx.resync) });
}

/** The bill, plus the PO advance and any returns / cash discount applied to it. */
async function syncBill(clientId, invoiceId, ctx = {}) {
  const row = ctx.row || await connectionFor(clientId);
  const lk = await lookups(row, ctx.cache || {});
  const inv = await M().Invoice.findByPk(invoiceId);
  if (!inv || Number(inv.client_id) !== Number(clientId)) throw new IntegrationError('Invoice not found', 404, 'NOT_FOUND');
  if (['REJECTED', 'EXCEPTION'].includes(inv.status) || inv.matching_status === 'MISMATCHED') {
    throw new IntegrationError(`Invoice ${inv.invoice_number} is ${inv.status === 'REJECTED' ? 'rejected' : 'on a 3-way match exception'} — only approved invoices go to Zoho Books.`, 409, 'NOT_READY');
  }
  const vendor = await M().Vendor.findByPk(inv.vendor_id);
  const vendorLink = await syncVendor(clientId, inv.vendor_id, { row });
  const po = inv.po_id ? await M().PurchaseOrder.findByPk(inv.po_id) : null;
  const { receiptAccountsFor } = require('../apJournal.service');
  const costCode = receiptAccountsFor(po, inv.ses_id ? 'SERVICE' : 'GOODS').debit.code;

  const billLink = await track(clientId, 'BILL', inv.id, async () => {
    const gstin = String(vendor?.gst_number || '').trim().toUpperCase();
    const taxId = gstTaxFor(inv, lk);
    const res = await zoho(row, 'POST', '/bills', {
      vendor_id: vendorLink.external_id,
      bill_number: inv.invoice_number,
      date: day(inv.invoice_date || inv.created_at),
      ...(inv.due_date ? { due_date: day(inv.due_date) } : {}),
      reference_number: po?.po_number || undefined,
      gst_treatment: gstin ? 'business_gst' : 'business_none',
      ...(gstin ? { gst_no: gstin } : {}),
      ...(stateOf(gstin) ? { source_of_supply: stateOf(gstin) } : {}),
      line_items: [{
        account_id: accountFor(costCode, row, lk),
        description: `${inv.ses_id ? 'Services' : 'Goods'} per ${po?.po_number || 'invoice'} ${inv.invoice_number}`.slice(0, 2000),
        rate: round2(inv.base_amount || Number(inv.total_amount || 0) - Number(inv.gst_amount || 0)),
        quantity: 1,
        ...(taxId ? { tax_id: taxId } : {}),
        ...(inv.hsn_sac_code ? { hsn_or_sac: inv.hsn_sac_code } : {})
      }]
    });
    return { id: res.bill.bill_id, ref: res.bill.bill_number };
  }, { resync: false });

  // Advance paid on the PO: a vendor payment applied to this bill.
  if (Number(inv.advance_adjusted) > 0) {
    await track(clientId, 'ADVANCE', inv.id, async () => {
      const res = await zoho(row, 'POST', '/vendorpayments', {
        vendor_id: vendorLink.external_id, amount: round2(inv.advance_adjusted), date: day(po?.order_date || po?.created_at),
        paid_through_account_id: bankFor(row, lk), reference_number: `Advance ${po?.po_number || ''}`.trim(),
        bills: [{ bill_id: billLink.external_id, amount_applied: round2(inv.advance_adjusted) }]
      });
      return { id: res.vendorpayment?.payment_id || res.vendor_payment?.payment_id, ref: `Advance ${po?.po_number || ''}` };
    });
  }
  // Goods returned after the invoice: a vendor credit, applied to this bill while the bill still has that
  // much open (after TDS, advance, cash and discount already settled). A return on a bill that is already
  // paid stays an open vendor credit — the vendor owes us, to be refunded or set off on the next bill.
  const { tdsOf } = require('../apJournal.service');
  let open = round2(Number(inv.total_amount || 0) - tdsOf(inv) - Number(inv.advance_adjusted || 0) - Number(inv.paid_amount || 0) - Number(inv.discount_received || 0));
  const returns = await M().PurchaseReturn.findAll({ where: { invoice_id: inv.id, stage: 'AFTER_INVOICE' }, order: [['id', 'ASC']] });
  for (const r of returns) {
    const applies = Number(r.total_amount) <= open + 0.009;
    if (applies) open = round2(open - Number(r.total_amount));
    await track(clientId, 'CREDIT', r.id, async () => {
      const taxId = Number(r.gst_amount) > 0 ? gstTaxFor(inv, lk) : null;
      const res = await zoho(row, 'POST', applies ? `/vendorcredits?bill_id=${encodeURIComponent(billLink.external_id)}` : '/vendorcredits', {
        vendor_id: vendorLink.external_id, vendor_credit_number: r.return_number, date: day(r.return_date), reference_number: r.credit_note_number || inv.invoice_number,
        line_items: [{ account_id: accountFor(costCode, row, lk), description: `Returned: ${r.reason}`.slice(0, 2000), rate: round2(r.total_value), quantity: 1, ...(taxId ? { tax_id: taxId } : {}) }]
      });
      return { id: res.vendor_credit.vendor_credit_id, ref: r.return_number };
    });
  }
  return billLink;
}

/** A recorded payment (ApPayment) or an invoice marked paid (SETTLEMENT), applied to the bill. */
async function syncPayment(clientId, { paymentId, invoiceId }, ctx = {}) {
  const row = ctx.row || await connectionFor(clientId);
  const lk = await lookups(row, ctx.cache || {});
  const pay = paymentId ? await M().ApPayment.findByPk(paymentId) : null;
  const inv = await M().Invoice.findByPk(pay ? pay.invoice_id : invoiceId);
  if (!inv) throw new IntegrationError('Invoice not found', 404, 'NOT_FOUND');
  const billLink = await syncBill(clientId, inv.id, { row, cache: lk });
  const vendorLink = await linkOf(clientId, 'VENDOR', inv.vendor_id);
  const { tdsOf } = require('../apJournal.service');

  let cash, discount, entity, localId, date, mode, ref;
  if (pay) {
    cash = round2(pay.amount); discount = round2(pay.discount_amount); entity = 'PAYMENT'; localId = pay.id;
    date = pay.payment_date; mode = pay.payment_mode; ref = pay.reference;
  } else {
    // Marked paid without recorded payments: what recorded payments have not covered.
    const paidByRecords = Number(await M().ApPayment.sum('amount', { where: { invoice_id: inv.id } }) || 0);
    const discByRecords = Number(await M().ApPayment.sum('discount_amount', { where: { invoice_id: inv.id } }) || 0);
    discount = round2(Math.max(0, Number(inv.discount_received || 0) - discByRecords));
    cash = round2(Number(inv.paid_amount || 0) - paidByRecords);
    entity = 'SETTLEMENT'; localId = inv.id; date = inv.payment_date || inv.updated_at; ref = inv.external_payment_ref || inv.invoice_number;
  }
  if (!(cash > 0) && !(discount > 0)) return null;

  // TDS is withheld once per invoice, with the first payment synced.
  const earlier = await M().IntegrationLink.count({ where: { client_id: clientId, provider: PROVIDER, entity_type: ['PAYMENT', 'SETTLEMENT'], status: 'SYNCED', external_ref: `INV:${inv.id}` } });
  const tds = earlier ? 0 : round2(tdsOf(inv));
  const link = cash > 0 ? await track(clientId, entity, localId, async () => {
    const res = await zoho(row, 'POST', '/vendorpayments', {
      vendor_id: vendorLink.external_id, amount: cash, date: day(date), paid_through_account_id: bankFor(row, lk),
      ...(mode ? { payment_mode: zohoMode(mode) } : {}), reference_number: [mode, ref].filter(Boolean).join(' ') || inv.invoice_number,
      bills: [{ bill_id: billLink.external_id, amount_applied: cash, ...(tds > 0 ? { tax_amount_withheld: tds } : {}) }]
    });
    return { id: res.vendorpayment?.payment_id || res.vendor_payment?.payment_id, ref: `INV:${inv.id}` };
  }) : null;
  // Cash discount: a vendor credit on the Discount received account, against the bill.
  if (discount > 0) {
    await track(clientId, pay ? 'DISCOUNT' : 'DISCOUNT_SETTLEMENT', pay ? pay.id : inv.id, async () => {
      const res = await zoho(row, 'POST', `/vendorcredits?bill_id=${encodeURIComponent(billLink.external_id)}`, {
        vendor_id: vendorLink.external_id, date: day(date), reference_number: `Cash discount ${inv.invoice_number}`,
        line_items: [{ account_id: accountFor(4100, row, lk), description: `Cash discount on ${inv.invoice_number}`, rate: discount, quantity: 1 }]
      });
      return { id: res.vendor_credit.vendor_credit_id, ref: `Discount ${inv.invoice_number}` };
    });
  }
  return link;
}

/** Everything still to send for the company: approved/paid invoices with their vendors and payments. */
async function syncAll(clientId) {
  const row = await connectionFor(clientId);
  const cache = {};
  const out = { synced: 0, failed: [] };
  const run = async (label, fn) => {
    try { if (await fn()) out.synced += 1; } catch (e) { out.failed.push(`${label}: ${e.message}`); }
  };
  const invoices = await M().Invoice.findAll({ where: { client_id: clientId, status: ['APPROVED_FOR_PAYMENT', 'PARTIAL', 'PAID'] }, order: [['id', 'ASC']] });
  for (const inv of invoices) await run(`Bill ${inv.invoice_number}`, () => syncBill(clientId, inv.id, { row, cache }));
  for (const inv of invoices) {
    for (const p of await M().ApPayment.findAll({ where: { invoice_id: inv.id }, order: [['id', 'ASC']] })) await run(`Payment on ${inv.invoice_number}`, () => syncPayment(clientId, { paymentId: p.id }, { row, cache }));
    if (inv.status === 'PAID') await run(`Settlement of ${inv.invoice_number}`, () => syncPayment(clientId, { invoiceId: inv.id }, { row, cache }));
  }
  return out;
}

/** Counts and the latest failures, for the Zoho Books card. */
async function status(clientId) {
  const links = await M().IntegrationLink.findAll({ where: { client_id: clientId, provider: PROVIDER }, order: [['updated_at', 'DESC']] });
  const count = (type, st) => links.filter((l) => l.entity_type === type && l.status === st).length;
  return {
    counts: ['VENDOR', 'BILL', 'ADVANCE', 'PAYMENT', 'SETTLEMENT', 'CREDIT', 'DISCOUNT', 'DISCOUNT_SETTLEMENT'].map((t) => ({ type: t, synced: count(t, 'SYNCED'), failed: count(t, 'FAILED') })),
    failures: links.filter((l) => l.status === 'FAILED').slice(0, 20).map((l) => ({ type: l.entity_type, local_id: l.local_id, error: l.last_error, at: l.updated_at })),
    last_synced_at: links.find((l) => l.synced_at)?.synced_at || null
  };
}

/** Accounts and bank accounts for the mapping selects, with what is chosen now. */
async function mapping(clientId) {
  const row = await connectionFor(clientId);
  const lk = await lookups(row);
  const auto = (code) => { try { return accountFor(code, { config: {} }, lk); } catch { return null; } };
  return {
    organization_id: row.config?.organization_id || null,
    organizations: row.config?.organizations || [],
    auto_sync: row.config?.auto_sync !== false,
    account_map: Object.fromEntries(Object.keys(ACCOUNT_HINTS).map((c) => [c, (row.config?.account_map || {})[c] || auto(Number(c))])),
    bank_account_id: row.config?.bank_account_id || lk.banks[0]?.account_id || null,
    accounts: lk.accounts.map((a) => ({ id: a.account_id, name: a.account_name, type: a.account_type })),
    banks: lk.banks.map((b) => ({ id: b.account_id, name: b.account_name }))
  };
}

async function saveSettings(clientId, { auto_sync, account_map, bank_account_id, organization_id }) {
  const row = await connectionFor(clientId);
  const cfg = { ...(row.config || {}) };
  // Another organisation of the same Zoho login: its accounts and bank differ, so the mapping resets.
  if (organization_id && String(organization_id) !== String(cfg.organization_id)) {
    const org = (cfg.organizations || []).find((o) => String(o.id) === String(organization_id));
    if (!org) throw new IntegrationError('That organisation is not in your Zoho Books login.', 400, 'BAD_ORG');
    const synced = await M().IntegrationLink.count({ where: { client_id: clientId, provider: PROVIDER, status: 'SYNCED' } });
    if (synced) throw new IntegrationError('Records were already sent to the current organisation. Disconnect and connect again to use another one.', 409, 'ORG_IN_USE');
    Object.assign(cfg, { organization_id: org.id, organization_name: org.name, account_map: {}, bank_account_id: null });
    await row.update({ config: cfg, account_label: org.name });
    return cfg;
  }
  if (auto_sync !== undefined) cfg.auto_sync = Boolean(auto_sync);
  if (account_map) cfg.account_map = Object.fromEntries(Object.entries(account_map).filter(([k, v]) => ACCOUNT_HINTS[k] && v).map(([k, v]) => [k, String(v)]));
  if (bank_account_id !== undefined) cfg.bank_account_id = bank_account_id ? String(bank_account_id) : null;
  await row.update({ config: cfg });
  return cfg;
}

// ── Automatic sync on approval and payment ───────────────────────────────────
async function autoEnabled(clientId) {
  if (!isLive() || !clientId) return false;
  const row = await M().IntegrationConnection.findOne({ where: { client_id: clientId, provider: PROVIDER } });
  return Boolean(row && row.status === 'CONNECTED' && row.config?.auto_sync !== false && row.config?.organization_id);
}
function later(label, clientId, fn, options) {
  const run = () => setTimeout(async () => {
    try { if (await autoEnabled(clientId)) await fn(); } catch (e) { console.error(`[zohoBooks] ${label}:`, e.message); }
  }, 2000);
  if (options?.transaction && typeof options.transaction.afterCommit === 'function') options.transaction.afterCommit(run);
  else run();
}

function install(db) {
  const { Invoice: Inv, ApPayment: Pay } = db;
  if (Inv) {
    Inv.addHook('afterUpdate', 'zohoBooks', (row, o) => {
      if (typeof row.changed !== 'function' || !row.changed('status')) return;
      if (row.status === 'APPROVED_FOR_PAYMENT') later(`bill ${row.id}`, row.client_id, () => syncBill(row.client_id, row.id), o);
      if (row.status === 'PAID') later(`settlement ${row.id}`, row.client_id, () => syncPayment(row.client_id, { invoiceId: row.id }), o);
    });
  }
  if (Pay) Pay.addHook('afterCreate', 'zohoBooks', (row, o) => later(`payment ${row.id}`, row.client_id, () => syncPayment(row.client_id, { paymentId: row.id }), o));
}

module.exports = { install, syncVendor, syncBill, syncPayment, syncAll, status, mapping, saveSettings, stateOf };
