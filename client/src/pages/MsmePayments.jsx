import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Row, Segmented, Statistic, Table, Tag, Typography, message } from 'antd';
import { RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';

const { Text } = Typography;
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const STATE = {
  OVERDUE: { color: 'error', label: 'Overdue' },
  DUE_SOON: { color: 'warning', label: 'Due within 7 days' },
  WITHIN: { color: 'default', label: 'Within time' },
  PAID_LATE: { color: 'volcano', label: 'Paid late' }
};

/**
 * MSME 45-day rule: invoices from micro and small vendors with the date they must be paid by
 * (agreed days, at most 45; 15 if none agreed), what is overdue or due soon, and what was paid
 * late this year (allowed as an expense only when paid, Income-tax 43B(h)).
 */
export default function MsmePayments() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('OPEN');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/msme-payments');
      setData(res?.data?.data || null);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not load the MSME payments');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => (data?.rows || []).filter((r) => (
    filter === 'ALL' ? true : filter === 'OPEN' ? r.state !== 'PAID_LATE' : r.state === filter
  )), [data, filter]);
  const s = data?.summary;

  const columns = [
    { title: 'Vendor', key: 'vendor', render: (_, r) => (
      <div>
        <Text strong>{r.vendor_name}</Text>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.msme_category === 'MICRO' ? 'Micro' : 'Small'}{r.udyam_number ? ` · ${r.udyam_number}` : ''}</div>
      </div>
    ) },
    { title: 'Invoice', key: 'inv', render: (_, r) => (
      <div><div>{r.invoice_number || `#${r.invoice_id}`}</div><div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{fmt(r.invoice_date)}</div></div>
    ) },
    { title: 'Days allowed', dataIndex: 'allowed_days', key: 'days', align: 'center' },
    { title: 'Pay by', dataIndex: 'due_date', key: 'due', render: fmt },
    { title: 'Amount', dataIndex: 'amount', key: 'amt', align: 'right', render: inr },
    { title: 'Status', key: 'state', render: (_, r) => (
      <div>
        <Tag color={STATE[r.state].color} style={{ marginInlineEnd: 0 }}>{STATE[r.state].label}</Tag>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
          {r.state === 'OVERDUE' && `${r.days_late} day${r.days_late === 1 ? '' : 's'} late`}
          {(r.state === 'DUE_SOON' || r.state === 'WITHIN') && (r.days_left === 0 ? 'due today' : `${r.days_left} day${r.days_left === 1 ? '' : 's'} left`)}
          {r.state === 'PAID_LATE' && `paid ${fmt(r.payment_date)}, ${r.days_late} day${r.days_late === 1 ? '' : 's'} late`}
        </div>
      </div>
    ) }
  ];

  return (
    <div style={{ padding: 'var(--space-4, 16px)' }}>
      <PageHeader
        title="MSME payments (45-day rule)"
        subtitle="Micro and small vendors must be paid within the agreed days, at most 45 (15 if nothing was agreed). Later payments count as an expense only in the year they are paid (Income-tax 43B(h))."
        actions={<Button icon={<RefreshCcw size={14} />} loading={loading} onClick={load}>Refresh</Button>}
      />
      {data?.not_classified > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${data.not_classified} vendor${data.not_classified === 1 ? ' has' : 's have'} an MSME certificate date but no MSME category`}
          description="Set the category (Micro / Small / Medium) in Vendor Master so their invoices are tracked here."
          action={<Button size="small" onClick={() => navigate('/vendor-master')}>Open Vendor Master</Button>}
        />
      )}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Overdue" value={s?.overdue.count || 0} suffix={<Text type="secondary" style={{ fontSize: 13 }}>{inr(s?.overdue.amount)}</Text>} valueStyle={{ color: s?.overdue.count ? 'var(--color-danger, #dc2626)' : undefined }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Due within 7 days" value={s?.due_soon.count || 0} suffix={<Text type="secondary" style={{ fontSize: 13 }}>{inr(s?.due_soon.amount)}</Text>} valueStyle={{ color: s?.due_soon.count ? 'var(--color-warning, #d97706)' : undefined }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Paid late this year" value={s?.paid_late.count || 0} suffix={<Text type="secondary" style={{ fontSize: 13 }}>{inr(s?.paid_late.amount)}</Text>} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="MSME vendors (micro / small)" value={s?.msme_vendors || 0} /></Card></Col>
      </Row>
      <Card
        style={{ borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-medium)' }}
        title={<Segmented value={filter} onChange={setFilter} options={[{ value: 'OPEN', label: 'To pay' }, { value: 'OVERDUE', label: 'Overdue' }, { value: 'PAID_LATE', label: 'Paid late' }, { value: 'ALL', label: 'All' }]} />}
      >
        <Table
          rowKey="invoice_id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={s?.msme_vendors ? 'Nothing here' : 'No vendor is marked Micro or Small yet. Set the MSME category in Vendor Master.'} /> }}
        />
      </Card>
    </div>
  );
}
