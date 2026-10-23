import api from './api';
import { normalizeResponse } from './apiNormalizer';

const STORE_KEY = 'ledgerline.ap.workflow.v1';
const PAYMENT_TERMS_DAYS = 30;

export const inr = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const plain = (n) =>
  Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const num = (n) => Number(n || 0);

export async function loadApInvoices() {
  const res = await api.get('/procurement/invoices');
  return normalizeResponse(res?.data);
}

export function vendorName(inv) {
  return inv?.Vendor?.vendor_name || inv?.vendor_name || '—';
}

export function invoiceDate(inv) {
  const raw = inv?.invoice_date || inv?.createdAt || null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dueDate(inv) {
  // Prefer the due date printed on the bill; fall back to standard payment terms.
  if (inv?.due_date) {
    const printed = new Date(inv.due_date);
    if (!Number.isNaN(printed.getTime())) return printed;
  }
  const base = invoiceDate(inv);
  if (!base) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + PAYMENT_TERMS_DAYS);
  return d;
}

export function daysPastDue(inv, now = new Date()) {
  const due = dueDate(inv);
  if (!due) return 0;
  return Math.floor((now.getTime() - due.getTime()) / 86400000);
}

export function ageingBucket(days) {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export const AGEING_BUCKETS = [
  { key: '0-30', label: '0–30 Days' },
  { key: '31-60', label: '31–60 Days' },
  { key: '61-90', label: '61–90 Days' },
  { key: '90+', label: '90+ Days' },
];

export function journalFor(inv) {
  const base = num(inv?.base_amount);
  const gst = num(inv?.gst_amount) || num(inv?.cgst_amount) + num(inv?.sgst_amount) + num(inv?.igst_amount);
  const total = num(inv?.total_amount) || base + gst;
  return {
    base,
    gst,
    total,
    lines: [
      { key: 'expense', account: 'Inventory / Expense', debit: base, credit: 0 },
      { key: 'gst', account: 'Input GST', debit: gst, credit: 0 },
      { key: 'ap', account: 'Accounts Payable', debit: 0, credit: total },
    ],
  };
}

export function paymentJournal(total) {
  const amount = num(total);
  return [
    { key: 'ap', account: 'Accounts Payable', debit: amount, credit: 0 },
    { key: 'bank', account: 'Bank', debit: 0, credit: amount },
  ];
}

const emptyStore = () => ({ posted: {}, holds: {}, proposals: [] });

export function readApStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '');
    return {
      posted: parsed?.posted || {},
      holds: parsed?.holds || {},
      proposals: Array.isArray(parsed?.proposals) ? parsed.proposals : [],
    };
  } catch {
    return emptyStore();
  }
}

export function writeApStore(next) {
  const safe = {
    posted: next?.posted || {},
    holds: next?.holds || {},
    proposals: Array.isArray(next?.proposals) ? next.proposals : [],
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(safe));
  return safe;
}

export function isOpenInvoice(inv) {
  return inv && inv.status !== 'PAID';
}
