import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Row, Space, Steps, Table, Tag, Typography, message } from 'antd';
import { CheckCircle2, RefreshCcw, WalletCards } from 'lucide-react';
import PageHeader from '../components/PageHeader';
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
        persistProposal({ ...proposal, status: 'PROPOSAL' });
        message.success('Payment proposal prepared');
      } else if (current === 'PROPOSAL') {
        await Promise.all(proposalInvoices.filter(isOpenInvoice).map((row) => api.put(`/procurement/invoices/${row.id}/approve-for-payment`, {})));
        persistProposal({ ...proposal, status: 'FINANCE_APPROVAL' });
        message.success('Sent for finance approval');
        await load();
      } else if (current === 'FINANCE_APPROVAL') {
        persistProposal({ ...proposal, status: 'BANK_PAYMENT' });
        message.success('Bank payment recorded');
      } else if (current === 'BANK_PAYMENT') {
        await Promise.all(proposalInvoices.filter(isOpenInvoice).map((row) => api.put(`/procurement/invoices/${row.id}/mark-paid`, {})));
        persistProposal({ ...proposal, status: 'CONFIRMED' });
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
        <Col xs={24} lg={10}>
          <Card style={contentCard} styles={{ body: { padding: 0 } }} title="Proposals">
            <Table
              rowKey="id"
              loading={loading}
              pagination={false}
              dataSource={store.proposals}
              locale={{ emptyText: <Empty description="No payment is in progress" style={{ margin: '24px 0' }} /> }}
              onRow={(row) => ({ onClick: () => setActiveId(row.id), style: { cursor: 'pointer', background: row.id === proposal?.id ? 'rgba(79, 70, 229, 0.06)' : undefined } })}
              columns={[
                { title: 'Proposal', dataIndex: 'id' },
                { title: 'Step', dataIndex: 'status', render: (v) => <Tag>{STEPS.find((step) => step.key === v)?.title || v}</Tag> },
                { title: 'Invoices', key: 'count', render: (_, row) => row.invoiceIds.length },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card style={contentCard} styles={{ body: { padding: '16px 20px 0' } }}>
            <Text strong style={{ color: '#1E3A5F', fontSize: 16 }}>Payment Entry</Text>
            <div style={{ margin: '8px 0 12px' }}>
              <Text type="secondary">Invoice outstanding: {inr(outstanding || payableTotal)}.</Text>
            </div>
          </Card>
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
          <Card style={{ ...contentCard, marginTop: 16 }} styles={{ body: { padding: 0 } }} title="Invoices in this payment">
            <Table
              rowKey="id"
              pagination={false}
              dataSource={proposalInvoices}
              locale={{ emptyText: <Empty description="Choose a proposal to see its invoices" /> }}
              columns={[
                { title: 'Invoice', dataIndex: 'invoice_number', render: (v) => v || '—' },
                { title: 'Vendor', key: 'vendor', render: (_, row) => vendorName(row) },
                { title: 'Amount', key: 'amount', align: 'right', render: (_, row) => inr(journalFor(row).total) },
                { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'PAID' ? 'success' : 'processing'}>{v || 'UNPAID'}</Tag> },
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
