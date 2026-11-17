import dayjs from 'dayjs';

export const card = { borderRadius: 16, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
export const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const fmt = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
export const errorOf = (e, fallback) => e?.response?.data?.message || fallback;

/**
 * The AR workflow, order to cash. Each step names the AP step it mirrors and the page it lives on.
 * Steps 6 and 9 share the accounting-entries page: the journal is the entry and the GL posting.
 */
export const AR_STEPS = [
  { n: 1, key: 'customer', label: 'Customer onboarding', ap: 'Vendor onboarding', path: '/finance/ar/customers' },
  { n: 2, key: 'order', label: 'Quotation / Sales order', ap: 'PR / RFQ / PO', path: '/finance/ar/sales-orders' },
  { n: 3, key: 'credit', label: 'Credit check', ap: 'PO approval matrix', path: '/finance/ar/sales-orders' },
  { n: 4, key: 'delivery', label: 'Delivery', ap: 'Goods receipt (GRN)', path: '/finance/ar/sales-orders?tab=deliveries' },
  { n: 5, key: 'invoice', label: 'Customer invoice', ap: 'Vendor invoice', path: '/finance/ar/customer-invoices' },
  { n: 6, key: 'entry', label: 'AR accounting entry', ap: 'AP accounting entry', path: '/finance/ar/accounting-entry' },
  { n: 7, key: 'cash', label: 'Cash receipt & application', ap: 'Payment processing', path: '/finance/ar/collections?tab=receive' },
  { n: 8, key: 'collections', label: 'Collections & ageing', ap: 'AP ageing', path: '/finance/ar/collections' },
  { n: 9, key: 'gl', label: 'GL posting', ap: 'GL posting', path: '/finance/ar/accounting-entry' },
];
