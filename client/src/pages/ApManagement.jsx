import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Row, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { RefreshCcw, Scale } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import { ActorStamp, formatWhen, lastActionColumn, useLastActions } from '../components/procurement/ActivityTrail';
import {
  AGEING_BUCKETS, ageingBucket, daysPastDue, dueDate, inr, isOpenInvoice,
  journalFor, loadApInvoices, num, readApStore, vendorName, writeApStore,
} from '../utils/apLedger';

const { Text } = Typography;
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const navyHead = () => ({ style: { background: '#1E3A5F', color: '#fff', fontWeight: 700 } });

const fmtDate = (d) => (d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const ApManagement = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [store, setStore] = useState(() => readApStore());
  const [selectedKeys, setSelectedKeys] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await loadApInvoices());
    } catch {
      message.error('Failed to load accounts payable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openRows = rows.filter(isOpenInvoice);
  const buckets = useMemo(() => {
    const totals = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    openRows.forEach((row) => {
      if (store.holds[row.id]) return;
      const key = ageingBucket(Math.max(daysPastDue(row), 0));
      totals[key] += journalFor(row).total;
    });
    return totals;
  }, [openRows, store.holds]);

  const vendorAgeing = useMemo(() => {
    const map = new Map();
    openRows.forEach((row) => {
      const name = vendorName(row);
      const current = map.get(name) || { vendor: name, open: 0, held: 0, invoices: 0 };
      const amount = journalFor(row).total;
      current.invoices += 1;
      if (store.holds[row.id]) current.held += amount;
      else current.open += amount;
      map.set(name, current);
    });
    return Array.from(map.values());
  }, [openRows, store.holds]);

  const reconciliations = useMemo(() => rows.map((row) => {
    const journal = journalFor(row);
    const expected = num(row.base_amount) + (num(row.gst_amount) || num(row.cgst_amount) + num(row.sgst_amount) + num(row.igst_amount));
    const variance = Math.round((journal.total - (expected || journal.total)) * 100) / 100;
    return {
      id: row.id,
      invoice_number: row.invoice_number,
      vendor: vendorName(row),
      invoiceTotal: journal.total,
      components: expected || journal.total,
      variance,
    };
  }), [rows]);

  const persist = (next) => setStore(writeApStore(next));
  const [trailTick, setTrailTick] = useState(0);
  const lastActions = useLastActions('INVOICE', openRows, `${rows.length}-${trailTick}`);

  // Holds and proposals are kept in this browser; the step itself is recorded on the server for the
  // signed-in user (role and name), so it shows on the invoice's activity trail.
  const recordStep = async (invoiceIds, step, reference) => {
    const results = await Promise.all(invoiceIds.map((id) => api.post(`/workflow-events/INVOICE/${id}/step`, { step, reference }).then((r) => r?.data?.data).catch(() => null)));
    setTrailTick((t) => t + 1);
    return results.find(Boolean) || null;
  };
  const stamp = (ev) => (ev ? { role_name: ev.role_name, user_name: ev.user_name, at: ev.occurred_at } : {});

  const toggleHold = async (row) => {
    const holds = { ...store.holds };
    const releasing = Boolean(holds[row.id]);
    const ev = await recordStep([row.id], releasing ? 'RELEASE_HOLD' : 'HOLD');
    if (releasing) delete holds[row.id];
    else holds[row.id] = { at: new Date().toISOString(), reason: 'Held by AP', ...stamp(ev) };
    persist({ ...store, holds });
    message.success(releasing ? 'Hold released' : 'Invoice placed on hold');
  };

  const createProposal = async () => {
    const ids = selectedKeys.filter((id) => {
      const row = rows.find((item) => item.id === id);
      return row && isOpenInvoice(row) && !store.holds[id];
    });
    if (!ids.length) {
      message.warning('Select open invoices that are not on hold');
      return;
    }
    const id = `PP-${Date.now()}`;
    const ev = await recordStep(ids, 'PAYMENT_PROPOSAL', id);
    const proposal = {
      id,
      invoiceIds: ids,
      status: 'PROPOSAL',
      createdAt: new Date().toISOString(),
      history: [{ step: 'PROPOSAL', ...stamp(ev) }],
    };
    persist({ ...store, proposals: [proposal, ...store.proposals] });
    setSelectedKeys([]);
    message.success('Payment proposal created');
  };

  const dueColumns = [
    { title: 'Invoice', dataIndex: 'invoice_number', render: (v) => v || '—' },
    { title: 'Vendor', key: 'vendor', render: (_, row) => vendorName(row) },
    { title: 'Invoice Date', key: 'invoice_date', render: (_, row) => fmtDate(row.invoice_date ? new Date(row.invoice_date) : null) },
    { title: 'Due Date', key: 'due', render: (_, row) => fmtDate(dueDate(row)) },
    {
      title: 'Ageing',
      key: 'age',
      render: (_, row) => {
        const days = daysPastDue(row);
        return <Tag color={days > 0 ? 'error' : 'processing'}>{days > 0 ? `${days} days past due` : 'Current'}</Tag>;
      },
    },
    { title: 'Amount', key: 'amount', align: 'right', render: (_, row) => inr(journalFor(row).total) },
    {
      title: 'Hold',
      key: 'hold',
      render: (_, row) => (
        <Button size="small" onClick={() => toggleHold(row)}>
          {store.holds[row.id] ? 'Release' : 'Hold'}
        </Button>
      ),
    },
    lastActionColumn('INVOICE', lastActions, { numberOf: (r) => r.invoice_number }),
  ];

  return (
    <div>
      <PageHeader
        icon={Scale}
        title="Accounts Payable Management"
        subtitle="The AP team manages outstanding vendor balances."
        actions={(
          <Space>
            <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={load}>Refresh</Button>
            <Button type="primary" onClick={createProposal}>Create Payment Proposal</Button>
          </Space>
        )}
      />

      <Card style={{ ...contentCard, marginBottom: 16 }}>
        <Text strong style={{ color: '#1E3A5F' }}>AP Functions</Text>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#334155' }}>
          <li>Due date tracking</li>
          <li>Vendor ageing</li>
          <li>Hold invoices</li>
          <li>Payment proposals</li>
          <li>Reconciliations</li>
        </ul>
      </Card>

      <Text strong style={{ color: '#1E3A5F', display: 'block', marginBottom: 8 }}>AP Ageing Buckets</Text>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {AGEING_BUCKETS.map((bucket) => (
          <Col xs={24} sm={12} lg={6} key={bucket.key}>
            <Card style={contentCard} styles={{ body: { padding: 0 } }}>
              <div style={{ background: '#1E3A5F', color: '#fff', padding: '10px 16px', fontWeight: 700 }}>{bucket.label}</div>
              <div style={{ padding: '16px' }}>
                <Statistic value={buckets[bucket.key]} prefix="₹" valueStyle={{ fontSize: 22 }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={{ ...contentCard, marginBottom: 16 }} styles={{ body: { padding: 0 } }} title="Due Date Tracking">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={openRows}
          columns={dueColumns}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          locale={{ emptyText: <Empty description="No open vendor balances" style={{ margin: '32px 0' }} /> }}
          pagination={{ pageSize: 8 }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card style={contentCard} styles={{ body: { padding: 0 } }} title="Vendor Ageing">
            <Table
              rowKey="vendor"
              pagination={false}
              dataSource={vendorAgeing}
              locale={{ emptyText: <Empty description="No vendors with open balances" /> }}
              columns={[
                { title: 'Vendor', dataIndex: 'vendor' },
                { title: 'Open', dataIndex: 'open', align: 'right', render: inr },
                { title: 'On Hold', dataIndex: 'held', align: 'right', render: inr },
                { title: 'Invoices', dataIndex: 'invoices', align: 'right' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card style={contentCard} styles={{ body: { padding: 0 } }} title="Reconciliations">
            <Table
              rowKey="id"
              pagination={{ pageSize: 6 }}
              dataSource={reconciliations}
              locale={{ emptyText: <Empty description="No invoices to reconcile" /> }}
              columns={[
                { title: 'Invoice', dataIndex: 'invoice_number', render: (v) => v || '—' },
                { title: 'Vendor', dataIndex: 'vendor' },
                { title: 'Invoice Total', dataIndex: 'invoiceTotal', align: 'right', render: inr },
                {
                  title: 'Variance',
                  dataIndex: 'variance',
                  align: 'right',
                  onHeaderCell: navyHead,
                  render: (v) => <Tag color={Math.abs(v) < 0.01 ? 'success' : 'error'}>{inr(v)}</Tag>,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ ...contentCard, marginTop: 16 }} styles={{ body: { padding: 0 } }} title="Payment Proposals">
        <Table
          rowKey="id"
          pagination={false}
          dataSource={store.proposals}
          locale={{ emptyText: <Empty description="No payment proposals yet" style={{ margin: '24px 0' }} /> }}
          columns={[
            { title: 'Proposal', dataIndex: 'id' },
            { title: 'Invoices', key: 'count', render: (_, row) => row.invoiceIds.length },
            { title: 'Status', dataIndex: 'status', render: (v) => <Tag color="processing">{String(v || '').replace(/_/g, ' ')}</Tag> },
            { title: 'Created', dataIndex: 'createdAt', render: (v) => fmtDate(v ? new Date(v) : null) },
            {
              title: 'Last step by (Role | User)',
              key: 'by',
              render: (_, row) => {
                const last = (row.history || [])[(row.history || []).length - 1];
                if (!last?.user_name) return <Text type="secondary">—</Text>;
                return <div><ActorStamp event={last} size="small" /><div><Text type="secondary" style={{ fontSize: 11 }}>{formatWhen(last.at)}</Text></div></div>;
              },
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default ApManagement;
