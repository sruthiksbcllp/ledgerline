import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Spin } from 'antd';
import { ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { normalizeResponse } from '../../utils/apiNormalizer';
import { canSee, getStoredUser, seeScope } from '../../utils/session';
import PoStatusSummary from './PoStatusSummary';

/**
 * Dashboard tile: purchase orders by stage. Each count opens the Purchase Orders page filtered to
 * that stage. Hidden for roles that can't see POs and for a vendor's own login.
 */
const PoStatusCard = ({ style }) => {
  const navigate = useNavigate();
  const user = getStoredUser();
  const visible = canSee(user, 'PO') && seeScope(user, 'PO') !== 'vendor';
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/procurement/po');
      setPos(normalizeResponse(res?.data));
    } catch {
      setPos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    load();
    window.addEventListener('fixtag:sync', load);
    return () => window.removeEventListener('fixtag:sync', load);
  }, [visible, load]);

  if (!visible) return null;
  return (
    <Card
      style={style}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ShoppingCart size={16} /> Purchase order status</span>}
      extra={<Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate('/procurement/purchase-orders')}>View all</Button>}
    >
      <Spin spinning={loading}>
        <PoStatusSummary
          pos={pos}
          compact
          onSelect={(key) => navigate(key === 'all' ? '/procurement/purchase-orders' : `/procurement/purchase-orders?group=${key}`)}
        />
      </Spin>
    </Card>
  );
};

export default PoStatusCard;
