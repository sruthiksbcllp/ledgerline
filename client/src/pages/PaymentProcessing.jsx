import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Row, Space, Steps, Table, Tag, Typography, message } from 'antd';
import { CheckCircle2, RefreshCcw, WalletCards } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { ActorStamp, formatWhen, lastActionColumn, useLastActions } from '../components/procurement/ActivityTrail';
import api from '../utils/api';
import {
  inr, isOpenInvoice, journalFor, loadApInvoices, paymentJournal, plain,
  readApStore, vendorName, writeApStore,
} from '../utils/apLedger';

const { Text } = Typography;
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const navyHead = () => ({ style: { background: '#1E3A5F', color: '#fff', fontWeight: 700 } });

const STEPS = [
  { key: 'DUE', title: 'Due Invoice' },
  { key: 'PROPOSAL', title: 'Payment Proposal' },
  { key: 'FINANCE_APPROVAL', title: 'Finance Approval' },
  { key: 'BANK_PAYMENT', title: 'Bank Payment' },
  { key: 'CONFIRMED', title: 'Payment Confirmation' },
];

const stepIndex = (status) => Math.max(0, STEPS.findIndex((step) => step.key === status));

const PaymentProcessing = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [store, setStore] = useState(() => readApStore());
  const [activeId, setActiveId] = useState(null);
  const [working, setWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await loadApInvoices();
      setRows(list);
      setStore(readApStore());
      setActiveId((current) => current || readApStore().proposals[0]?.id || null);
    } catch {
      message.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const proposal = store.proposals.find((item) => item.id === activeId) || store.proposals[0] || null;
  const proposalInvoices = useMemo(() => {
    if (!proposal) return [];
    return proposal.invoiceIds.map((id) => rows.find((row) => row.id === id)).filter(Boolean);
  }, [proposal, rows]);

  const outstanding = proposalInvoices.reduce((sum, row) => sum + (row.status === 'PAID' ? 0 : journalFor(row).total), 0);
  const payableTotal = proposalInvoices.reduce((sum, row) => sum + journalFor(row).total, 0);
  const confirmed = proposal?.status === 'CONFIRMED' || (proposalInvoices.length > 0 && proposalInvoices.every((row) => row.status === 'PAID'));

  const lastActions = useLastActions('INVOICE', proposalInvoices, rows);

  // Who moved the proposal to each step: the server records it for the signed-in user. Steps that
  // live only in this browser are sent as named workflow steps; the others are read back from the trail.
  const recordLocalStep = async (invoices, step) => {
    const results = await Promise.all(invoices.map((row) => api.post(`/workflow-events/INVOICE/${row.id}/step`, { step, reference: proposal.id }).then((r) => r?.data?.data).catch(() => null)));
    return results.find(Boolean) || null;
  };
  const latestEventFor = async (invoices) => {
    if (!invoices.length) return null;
    try {
      const res = await api.get('/workflow-events/INVOICE/latest', { params: { ids: invoices.map((r) => r.id).join(',') } });
      const all = Object.values(res?.data?.data || {});
      return all.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))[0] || null;
    } catch { return null; }
  };
  const withStep = (p, status, event) => ({
    ...p,
    status,
    history: [...(p.history || []), { step: status, at: event?.occurred_at || new Date().toISOString(), role_name: event?.role_name, user_name: event?.user_name }]
  });

  const persistProposal = (nextProposal) => {
    const proposals = store.proposals.map((item) => (item.id === nextProposal.id ? nextProposal : item));
    const next = writeApStore({ ...store, proposals });
    setStore(next);
  };

  const startFromDue = () => {
    const due = rows.filter((row) => isOpenInvoice(row) && !store.holds[row.id]);
    if (!due.length) {
      message.warning('No due invoices are available for payment');
      return;
    }
    const created = {
      id: `PP-${Date.now()}`,
      invoiceIds: due.slice(0, 10).map((row) => row.id),
      status: 'DUE',
      createdAt: new Date().toISOString(),
    };
    const next = writeApStore({ ...store, proposals: [created, ...store.proposals] });
    setStore(next);
    setActiveId(created.id);
  };

  const advance = async () => {
    if (!proposal) return;
    const current = proposal.status || 'DUE';
    setWorking(true);
    try {
      if (current === 'DUE') {
        const ev = await recordLocalStep(proposalInvoices, 'PAYMENT_PROPOSAL');
        persistProposal(withStep(proposal, 'PROPOSAL', ev));
        message.success('Payment proposal prepared');
        await load();
      } else if (current === 'PROPOSAL') {
        const open = proposalInvoices.filter(isOpenInvoice);
        await Promise.all(open.map((row) => api.put(`/procurement/invoices/${row.id}/approve-for-payment`, {})));
        persistProposal(withStep(proposal, 'FINANCE_APPROVAL', await latestEventFor(open)));
        message.success('Sent for finance approval');
        await load();
      } else if (current === 'FINANCE_APPROVAL') {
        const ev = await recordLocalStep(proposalInvoices, 'BANK_PAYMENT');
        persistProposal(withStep(proposal, 'BANK_PAYMENT', ev));
        message.success('Bank payment recorded');
        await load();
      } else if (current === 'BANK_PAYMENT') {
        const open = proposalInvoices.filter(isOpenInvoice);
        await Promise.all(open.map((row) => api.put(`/procurement/invoices/${row.id}/mark-paid`, {})));
        persistProposal(withStep(proposal, 'CONFIRMED', await latestEventFor(open)));
        message.success('Payment confirmed');
        await load();
      }
    } catch (error) {
      message.error(error?.response?.data?.message || 'Could not move this payment forward');
    } finally {
      setWorking(false);
    }
  };

  const nextLabel = {
    DUE: 'Create Payment Proposal',
    PROPOSAL: 'Send for Finance Approval',
    FINANCE_APPROVAL: 'Record Bank Payment',
    BANK_PAYMENT: 'Confirm Payment',
  }[proposal?.status || 'DUE'];

  const completion = [
    { label: 'PO Closed', done: confirmed && proposalInvoices.length > 0 && proposalInvoices.every((row) => ['CLOSED', 'COMPLETED', 'FULLY_RECEIVED'].includes(row.PurchaseOrder?.status)) },
    { label: 'Invoice Closed', done: confirmed },
    { label: 'Vendor Balance Cleared', done: confirmed && outstanding === 0 },
    { label: 'Accounting Updated', done: confirmed && proposalInvoices.every((row) => readApStore().posted[row.id] || row.status === 'PAID') },
  ];

  return (
    <div>
      <PageHeader
        icon={WalletCards}
        title="Payment Processing"
        subtitle="Move a due invoice through proposal, finance approval, bank payment, and confirmation."
        actions={(
          <Space>
            <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={load}>Refresh</Button>
            <Button onClick={startFromDue}>Start from Due Invoices</Button>
            <Button type="primary" loading={working} disabled={!proposal || confirmed} onClick={advance}>{nextLabel || 'Complete'}</Button>
          </Space>
        )}
      />

      <Card style={{ ...contentCard, marginBottom: 16 }}>
        <Text strong style={{ color: '#1E3A5F' }}>Payment Workflow</Text>
        <Steps
          style={{ marginTop: 20 }}
          current={proposal ? stepIndex(confirmed ? 'CONFIRMED' : proposal.status) : 0}
          items={STEPS.map((step) => ({ title: step.title }))}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card style={{ ...contentCard, height: '100%' }} styles={{ body: { padding: 0 } }} title="Proposals">
            <Table
              rowKey="id"
              scroll={{ x: 'max-content' }}
              loading={loading}
              pagination={false}
              dataSource={store.proposals}
              locale={{ emptyText: <Empty description="No payment is in progress" style={{ margin: '24px 0' }} /> }}
              onRow={(row) => ({ onClick: () => setActiveId(row.id), style: { cursor: 'pointer', background: row.id === proposal?.id ? 'rgba(79, 70, 229, 0.06)' : undefined } })}
              columns={[
                { title: 'Proposal', dataIndex: 'id', render: (v) => <Text style={{ whiteSpace: 'nowrap' }}>{v}</Text> },
                { title: 'Step', dataIndex: 'status', render: (v) => <Tag>{STEPS.find((step) => step.key === v)?.title || v}</Tag> },
                { title: 'Invoices', key: 'count', align: 'right', render: (_, row) => row.invoiceIds.length },
                {
                  title: 'Last step by (Role | User)',
                  key: 'by',
                  render: (_, row) => {
                    const last = (row.history || [])[row.history?.length - 1];
                    if (!last || !last.user_name) return <Text type="secondary" style={{ fontSize: 12 }}>{row.createdAt ? `Started ${formatWhen(row.createdAt)}` : '—'}</Text>;
                    return (
                      <div>
                        <ActorStamp event={last} size="small" />
                        <div><Text type="secondary" style={{ fontSize: 11 }}>{STEPS.find((step) => step.key === last.step)?.title} · {formatWhen(last.at)}</Text></div>
                      </div>
                    );
                  }
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card style={{ ...contentCard, height: '100%' }} styles={{ body: { padding: 0 } }} title="Payment Entry">
            <div style={{ padding: '12px 16px' }}>
              <Text type="secondary">Invoice outstanding: {inr(outstanding || payableTotal)}.</Text>
            </div>
            <Table
              rowKey="key"
              pagination={false}
              dataSource={paymentJournal(payableTotal)}
              columns={[
                { title: 'Account', dataIndex: 'account', onHeaderCell: navyHead },
                { title: 'Debit', dataIndex: 'debit', align: 'right', onHeaderCell: navyHead, render: (v) => (Number(v) ? plain(v) : '') },
                { title: 'Credit', dataIndex: 'credit', align: 'right', onHeaderCell: navyHead, render: (v) => (Number(v) ? plain(v) : '') },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card style={contentCard} styles={{ body: { padding: 0 } }} title="Invoices in this payment">
            <Table
              rowKey="id"
              scroll={{ x: 'max-content' }}
              pagination={false}
              dataSource={proposalInvoices}
              locale={{ emptyText: <Empty description="Choose a proposal to see its invoices" /> }}
              columns={[
                { title: 'Invoice', dataIndex: 'invoice_number', render: (v) => v || '—' },
                { title: 'Vendor', key: 'vendor', render: (_, row) => vendorName(row) },
                { title: 'Amount', key: 'amount', align: 'right', render: (_, row) => inr(journalFor(row).total) },
                { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'PAID' ? 'success' : 'processing'}>{v || 'UNPAID'}</Tag> },
                lastActionColumn('INVOICE', lastActions, { numberOf: (r) => r.invoice_number }),
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ ...contentCard, marginTop: 16 }} title="P2P Completion">
        <Space direction="vertical">
          {completion.map((item) => (
            <Space key={item.label}>
              <CheckCircle2 size={16} color={item.done ? '#059669' : '#CBD5E1'} />
              <Text type={item.done ? undefined : 'secondary'}>{item.label}</Text>
            </Space>
          ))}
        </Space>
      </Card>
    </div>
  );
};

export default PaymentProcessing;
