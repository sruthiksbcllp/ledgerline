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
