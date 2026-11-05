import React, { useEffect, useState } from 'react';
import { Alert } from 'antd';
import api from '../../utils/api';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/**
 * One-line fund check for a PO amount: the balance left after it is approved, or a red warning
 * when it takes this month over the purchase fund limit. Never blocks; shows nothing when no limit
 * is set or the amount is zero.
 */
const PoFundImpact = ({ amount, approving = false, style }) => {
  const [data, setData] = useState(null);
  const value = Number(amount || 0);

  useEffect(() => {
    if (!(value > 0)) return undefined;
    let live = true;
    const t = setTimeout(() => {
      api.get('/po-fund/summary', { params: { amount: value } })
        .then((r) => { if (live) setData(r?.data?.data || null); })
        .catch(() => { if (live) setData(null); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [value]);

  if (!(value > 0) || !data?.configured || data.before_first_limit || !data.impact) return null;
  const { balance_after: after, exceeds_by: over } = data.impact;
  if (over > 0) {
    return (
      <Alert type="error" showIcon style={style}
        message={`This PO goes ${inr(over)} over this month's purchase fund`}
        description={`Balance now ${data.balance < 0 ? `-${inr(-data.balance)}` : inr(data.balance)}; this PO is ${inr(value)}. ${approving ? 'You can still approve it.' : 'You can still raise it; the approver will see this warning.'}`} />
    );
  }
  return (
    <Alert type={after / (data.available || 1) < 0.1 ? 'warning' : 'info'} showIcon style={style}
      message={`Purchase fund this month: ${inr(data.balance)} left. After ${approving ? 'approving' : 'approval of'} this PO: ${inr(after)}`} />
  );
};

export default PoFundImpact;
