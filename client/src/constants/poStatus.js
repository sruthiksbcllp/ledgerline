// Purchase order stages: how the many PO statuses roll up into the groups shown on the
// Purchase Orders page, the PO report and the dashboard.
export const PO_GROUPS = [
  { key: 'awaiting', label: 'Awaiting approval', color: '#d97706', statuses: ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'IN_APPROVAL', 'PENDING_CONFIGURATION'] },
  { key: 'open', label: 'Open', hint: 'Approved / issued, not fully received', color: '#2563eb', statuses: ['APPROVED', 'ISSUED', 'PARTIAL_RECEIVED'] },
  { key: 'completed', label: 'Completed', hint: 'Received or closed', color: '#16a34a', statuses: ['RECEIVED', 'FULLY_RECEIVED', 'CLOSED'] },
  { key: 'stopped', label: 'Rejected / Cancelled', color: '#dc2626', statuses: ['REJECTED', 'CANCELLED'] },
];

const GROUP_BY_STATUS = Object.fromEntries(PO_GROUPS.flatMap((g) => g.statuses.map((s) => [s, g])));

/** The stage group of a PO status, or null for an unknown status. */
export const poGroupOf = (status) => GROUP_BY_STATUS[String(status || '').toUpperCase()] || null;

/** Readable status, e.g. PARTIAL_RECEIVED -> "Partial received". */
export const statusLabel = (status) => {
  const s = String(status || '').replace(/_/g, ' ').toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : '-';
};

const DAY = 24 * 60 * 60 * 1000;
const daysSince = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / DAY)) : null);

/**
 * How long a PO has been in its current stage.
 * Awaiting approval: days since it was raised. Open: days since it was approved / issued, and
 * whether the required-by date has passed. Completed and stopped POs have no age.
 * @returns {{ days: number, text: string, overdue: boolean } | null}
 */
export const poAgeing = (po) => {
  const group = poGroupOf(po?.status);
  if (!group || group.key === 'completed' || group.key === 'stopped') return null;
  if (group.key === 'awaiting') {
    const days = daysSince(po.createdAt || po.order_date);
    return days === null ? null : { days, text: `Waiting ${days} day${days === 1 ? '' : 's'} for approval`, overdue: false };
  }
  const days = daysSince(po.approval_date || po.order_date || po.createdAt);
  if (days === null) return null;
  const overdue = Boolean(po.required_date && new Date(po.required_date).getTime() < Date.now());
  return { days, text: `Issued ${days} day${days === 1 ? '' : 's'} ago, not fully received${overdue ? ' · past required date' : ''}`, overdue };
};

/** Count of POs in each group, plus the total. */
export const countPoGroups = (pos = []) => {
  const counts = Object.fromEntries(PO_GROUPS.map((g) => [g.key, 0]));
  for (const po of pos) {
    const g = poGroupOf(po.status);
    if (g) counts[g.key] += 1;
  }
  return { total: pos.length, ...counts };
};
