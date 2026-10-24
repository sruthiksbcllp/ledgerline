import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Empty, Row, Space, Table, Tag, Typography } from 'antd';
import { ClipboardList, FilePlus2, LayoutDashboard, PackageCheck, RefreshCcw, ShoppingCart, Inbox } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import { canSee, getStoredUser, hasPerm, seeScope, TIER_STYLE } from '../utils/session';

const { Text } = Typography;
const card = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const STATUS_COLOR = { DRAFT: 'default', PENDING_APPROVAL: 'gold', SUBMITTED: 'gold', IN_APPROVAL: 'gold', APPROVED: 'green', PO_CREATED: 'blue', REJECTED: 'red', ISSUED: 'blue', PARTIAL_RECEIVED: 'orange', RECEIVED: 'green', CANCELLED: 'red' };
const statusTag = (s) => <Tag color={STATUS_COLOR[s] || 'default'}>{String(s || '—').replace(/_/g, ' ')}</Tag>;
const OPEN_PO = ['ISSUED', 'APPROVED', 'PARTIAL_RECEIVED'];

/**
 * Home for roles that do not work with company-wide finance figures (Requester, Warehouse, Vendor, ...).
 * Shows only the data this role may see: a Requester their own requisitions, Warehouse the orders to
 * receive, a Vendor its own orders. Everything comes from endpoints that apply the same rules.
 */
const WorkspaceHome = () => {
  const navigate = useNavigate();
  const user = getStoredUser();
  const prScope = seeScope(user, 'PR');
  const showPR = canSee(user, 'PR');
  const showPO = canSee(user, 'PO');
  const showGRN = canSee(user, 'GRN');
  const isApprover = hasPerm(user, 'PR', 'EDIT') && prScope === 'all';
  const [data, setData] = useState({ prs: [], pos: [], grns: [], approvals: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const get = (url) => api.get(url).then((r) => normalizeResponse(r?.data)).catch(() => []);
    const [prs, pos, grns, approvals] = await Promise.all([
      showPR ? get('/procurement/pr') : [],
      showPO ? get('/procurement/po') : [],
      showGRN ? get('/procurement/grn') : [],
      isApprover ? api.get('/approvals/pending').then((r) => r?.data?.data || r?.data || {}).catch(() => ({})) : {}
    ]);
    const pendingList = Array.isArray(approvals) ? approvals : [...(approvals.prs || approvals.pr || []), ...(approvals.pos || approvals.po || [])];
    setData({ prs: Array.isArray(prs) ? prs : [], pos: Array.isArray(pos) ? pos : [], grns: Array.isArray(grns) ? grns : [], approvals: pendingList });
    setLoading(false);
  }, [showPR, showPO, showGRN, isApprover]);
  useEffect(() => { load(); }, [load]);

  const tier = TIER_STYLE[user?.tier] || TIER_STYLE.EMPLOYEE;
  const name = user?.first_name || user?.username || '';
  const prCount = (pred) => data.prs.filter(pred).length;
  const openPOs = data.pos.filter((p) => OPEN_PO.includes(p.status));

  const tiles = [
    showPR && { key: 'pr', label: prScope === 'own' ? 'My requisitions' : 'Requisitions', value: data.prs.length, sub: `${prCount((p) => ['PENDING_APPROVAL', 'SUBMITTED', 'IN_APPROVAL'].includes(p.status))} awaiting approval`, icon: <ClipboardList size={20} />, color: '#4F46E5', to: '/procurement/requisition' },
    isApprover && { key: 'appr', label: 'Waiting for my approval', value: data.approvals.length, sub: 'Requisitions and orders', icon: <Inbox size={20} />, color: '#D97706', to: '/requests/approvals' },
    showPO && { key: 'po', label: seeScope(user, 'PO') === 'vendor' ? 'Your purchase orders' : 'Orders to receive', value: seeScope(user, 'PO') === 'vendor' ? data.pos.length : openPOs.length, sub: seeScope(user, 'PO') === 'vendor' ? `${openPOs.length} open` : 'Issued or partly received', icon: <ShoppingCart size={20} />, color: '#0891B2', to: '/procurement/purchase-orders' },
    showGRN && { key: 'grn', label: 'Goods receipts', value: data.grns.length, sub: `${data.grns.filter((g) => g.status === 'PARTIAL').length} partial`, icon: <PackageCheck size={20} />, color: '#059669', to: '/procurement/grn' }
  ].filter(Boolean);

  const prColumns = [
    { title: 'PR', dataIndex: 'pr_number', render: (v, r) => <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate('/procurement/requisition')}>{v || `#${r.id}`}</Button> },
    { title: 'Raised', dataIndex: 'createdAt', render: fmt },
    { title: 'Amount', key: 'amt', align: 'right', render: (_, r) => inr(r.total_cost ?? r.total_amount ?? r.estimated_total) },
    { title: 'Status', dataIndex: 'status', render: statusTag }
  ];
  const poColumns = [
    { title: 'PO', dataIndex: 'po_number', render: (v, r) => v || `#${r.id}` },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r?.Vendor?.vendor_name || '—' },
    { title: 'Amount', dataIndex: 'total_amount', align: 'right', render: inr },
    { title: 'Status', dataIndex: 'status', render: statusTag }
  ];

  return (
    <div>
      <Card style={{ ...card, marginBottom: 20 }} styles={{ body: { padding: 20 } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space size={16} align="center">
              <div className="page-header-icon"><LayoutDashboard size={24} /></div>
              <div>
                <h2 className="page-header-title">Welcome{name ? `, ${name}` : ''}</h2>
                <Space size={8} wrap>
                  <Text type="secondary">{user?.client_name}</Text>
                  <span style={{ color: tier.color, background: tier.bg, fontWeight: 700, fontSize: 12, padding: '2px 10px', borderRadius: 999 }}>{tier.label}</span>
                </Space>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              {showPR && hasPerm(user, 'PR', 'ADD') && <Button type="primary" icon={<FilePlus2 size={16} />} onClick={() => navigate('/procurement/requisition')}>New requisition</Button>}
              {showGRN && hasPerm(user, 'GRN', 'ADD') && <Button icon={<PackageCheck size={16} />} onClick={() => navigate('/procurement/grn')}>Record goods receipt</Button>}
              <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={load}>Refresh</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {tiles.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {tiles.map((t) => (
            <Col xs={24} sm={12} xl={24 / Math.min(tiles.length, 4)} key={t.key}>
              <Card hoverable style={card} styles={{ body: { padding: 18 } }} onClick={() => navigate(t.to)}>
                <Space size={14} align="center">
                  <span style={{ width: 44, height: 44, borderRadius: 12, background: `${t.color}18`, color: t.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{loading ? '…' : t.value}</div>
                    <div style={{ fontWeight: 600 }}>{t.label}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t.sub}</Text>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Row gutter={[16, 16]}>
        {showPR && (
          <Col xs={24} xl={showPO ? 12 : 24}>
            <Card style={card} title={prScope === 'own' ? 'My recent requisitions' : 'Recent requisitions'} styles={{ body: { padding: 0 } }}>
              <Table rowKey="id" size="middle" loading={loading} columns={prColumns} pagination={false}
                dataSource={[...data.prs].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 6)}
                locale={{ emptyText: <Empty description={prScope === 'own' ? 'You have not raised any requisitions yet' : 'No requisitions yet'} style={{ margin: '24px 0' }} /> }} />
            </Card>
          </Col>
        )}
        {showPO && (
          <Col xs={24} xl={showPR ? 12 : 24}>
            <Card style={card} title={seeScope(user, 'PO') === 'vendor' ? 'Your purchase orders' : 'Orders to receive'} styles={{ body: { padding: 0 } }}>
              <Table rowKey="id" size="middle" loading={loading} columns={poColumns} pagination={false}
                dataSource={(seeScope(user, 'PO') === 'vendor' ? data.pos : openPOs).slice(0, 6)}
                locale={{ emptyText: <Empty description="Nothing here right now" style={{ margin: '24px 0' }} /> }} />
            </Card>
          </Col>
        )}
        {!showPR && !showPO && (
          <Col span={24}>
            <Card style={card}><Empty description="Your role has no dashboard data. Use the menu on the left to get to your work." /></Card>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default WorkspaceHome;
