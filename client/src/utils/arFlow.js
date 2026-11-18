import dayjs from 'dayjs';

export const card = { borderRadius: 16, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
// Whole rupees show no decimals; any paise show both digits (₹1,038.40, not ₹1,038.4).
export const inr = (v) => {
  const n = Math.round(Number(v || 0) * 100) / 100;
  const paise = !Number.isInteger(n);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 })}`;
};
export const fmt = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
export const errorOf = (e, fallback) => e?.response?.data?.message || fallback;

/**
 * The AR workflow, order to cash (the ArthaOps blueprint's ten steps, plus the credit check and the
 * ledger). Each step names the AP step it mirrors and the page it lives on.
 */
export const AR_STEPS = [
  { n: 1, key: 'customer', label: 'Customer onboarding', ap: 'Vendor onboarding', path: '/finance/ar/customers' },
  { n: 2, key: 'order', label: 'Quotation / Sales order', ap: 'PR / RFQ / PO', path: '/finance/ar/sales-orders' },
  { n: 3, key: 'credit', label: 'Credit check', ap: 'PO approval matrix', path: '/finance/ar/sales-orders' },
  { n: 4, key: 'delivery', label: 'Delivery', ap: 'Goods receipt (GRN)', path: '/finance/ar/sales-orders?tab=deliveries' },
  { n: 5, key: 'invoice', label: 'Customer invoice', ap: 'Vendor invoice', path: '/finance/ar/customer-invoices' },
  { n: 6, key: 'dispute', label: 'Disputes & credit notes', ap: 'Exceptions & debit notes', path: '/finance/ar/credit-notes' },
  { n: 7, key: 'cash', label: 'Cash receipt & application', ap: 'Payment processing', path: '/finance/ar/collections?tab=receive' },
  { n: 8, key: 'collections', label: 'Collections & ageing', ap: 'AP ageing', path: '/finance/ar/collections' },
  { n: 9, key: 'ecl', label: 'Credit-loss provision', ap: 'Month-end accruals', path: '/finance/ar/credit-loss' },
  { n: 10, key: 'writeoff', label: 'Write-offs', ap: '—', path: '/finance/ar/credit-loss?tab=writeoffs' },
  { n: 11, key: 'close', label: 'AR close & reporting', ap: 'AP close & reconciliation', path: '/finance/ar/ar-close' },
  { n: 12, key: 'gl', label: 'Accounting entries & GL', ap: 'AP accounting entry', path: '/finance/ar/accounting-entry' },
];
