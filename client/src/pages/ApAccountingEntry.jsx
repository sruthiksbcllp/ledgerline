import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Row, Space, Table, Tag, Typography, message } from 'antd';
import { BookOpen, RefreshCcw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { inr, journalFor, loadApInvoices, plain, readApStore, vendorName, writeApStore } from '../utils/apLedger';

const { Text } = Typography;
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const navyHead = () => ({ style: { background: '#1E3A5F', color: '#fff', fontWeight: 700 } });

const EXAMPLE = {
  base: 100000,
  gst: 18000,
  total: 118000,
  lines: [
    { key: 'expense', account: 'Inventory / Expense', debit: 100000, credit: 0 },
    { key: 'gst', account: 'Input GST', debit: 18000, credit: 0 },
    { key: 'ap', account: 'Accounts Payable', debit: 0, credit: 118000 },
  ],
};

const moneyCol = (title, field) => ({
  title,
  dataIndex: field,
  align: 'right',
  width: 160,
  onHeaderCell: navyHead,
  render: (v) => (Number(v) ? plain(v) : ''),
});

const journalColumns = [
  { title: 'Account', dataIndex: 'account', onHeaderCell: navyHead },
  moneyCol('Debit', 'debit'),
  moneyCol('Credit', 'credit'),
];

const JournalCard = ({ title, caption, lines }) => (
  <Card style={contentCard} styles={{ body: { padding: 0 } }}>
    <div style={{ padding: '16px 20px 8px' }}>
      <Text strong style={{ color: '#1E3A5F', fontSize: 16 }}>{title}</Text>
      {caption ? <div style={{ marginTop: 6 }}><Text type="secondary">{caption}</Text></div> : null}
    </div>
    <Table rowKey="key" pagination={false} columns={journalColumns} dataSource={lines} size="middle" />
  </Card>
);

const ImpactCard = () => (
  <Card style={{ ...contentCard, marginTop: 16 }} styles={{ body: { padding: 0 } }}>
    <div style={{ padding: '16px 20px 8px' }}>
      <Text strong style={{ color: '#1E3A5F', fontSize: 16 }}>Accounting Impact</Text>
    </div>
    <Table
      pagination={false}
      rowKey="side"
      showHeader
      columns={[
        { title: 'Asset Increases', dataIndex: 'asset', onHeaderCell: navyHead },
        { title: 'Liability Increases', dataIndex: 'liability', onHeaderCell: navyHead },
      ]}
      dataSource={[{
        side: 'impact',
        asset: 'Inventory · Input GST',
        liability: 'Vendor Payable',
      }]}
    />
  </Card>
);

const ApAccountingEntry = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [posted, setPosted] = useState(() => readApStore().posted);

  const load = async () => {
    setLoading(true);
    try {
      const list = await loadApInvoices();
      setRows(list);
      setSelectedId((current) => current || list[0]?.id || null);
    } catch {
      message.error('Failed to load invoices for accounting entry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selected = rows.find((row) => row.id === selectedId) || null;
  const liveJournal = selected ? journalFor(selected) : null;

  const columns = useMemo(() => ([
    { title: 'Invoice', dataIndex: 'invoice_number', render: (v) => v || '—' },
    { title: 'Vendor', key: 'vendor', render: (_, row) => vendorName(row) },
    { title: 'Material', key: 'base', align: 'right', render: (_, row) => inr(journalFor(row).base) },
    { title: 'Input GST', key: 'gst', align: 'right', render: (_, row) => inr(journalFor(row).gst) },
    { title: 'Accounts Payable', key: 'total', align: 'right', render: (_, row) => inr(journalFor(row).total) },
    {
      title: 'Match',
      dataIndex: 'matching_status',
      render: (v) => <Tag color={v === 'MATCHED' ? 'success' : v === 'MISMATCHED' ? 'error' : 'default'}>{v || 'PENDING'}</Tag>,
    },
    {
      title: 'Entry',
      key: 'entry',
      render: (_, row) => (
        posted[row.id]
          ? <Tag color="success">Posted</Tag>
          : <Tag>Not posted</Tag>
      ),
    },
  ]), [posted]);

  const postEntry = () => {
    if (!selected) return;
    if (selected.matching_status === 'MISMATCHED' || selected.payment_blocked) {
      message.error('Resolve the 3-way match before posting the accounting entry');
      return;
    }
    const store = readApStore();
    const next = writeApStore({
      ...store,
      posted: { ...store.posted, [selected.id]: new Date().toISOString() },
    });
    setPosted(next.posted);
    message.success('Accounting entry posted for this invoice');
  };

  return (
    <div>
      <PageHeader
        icon={BookOpen}
        title="Accounting Entry at Invoice Booking"
        subtitle="Debit inventory or expense and input GST. Credit accounts payable for the vendor invoice."
        actions={(
          <Space>
            <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={load}>Refresh</Button>
            <Button type="primary" disabled={!selected || !!posted[selected?.id]} onClick={postEntry}>Post Entry</Button>
          </Space>
        )}
      />

      <JournalCard
        title="Example"
        caption="Material Cost = ₹100,000; GST = ₹18,000; Total Vendor Invoice = ₹118,000."
        lines={EXAMPLE.lines}
      />
      <ImpactCard />

      <Card style={{ ...contentCard, marginTop: 16 }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '16px 20px 8px' }}>
          <Text strong style={{ color: '#1E3A5F', fontSize: 16 }}>Journal Entry</Text>
          <div style={{ marginTop: 6 }}>
            <Text type="secondary">
              {selected
                ? `${selected.invoice_number || 'Invoice'} · ${vendorName(selected)} · Material ${inr(liveJournal.base)}, GST ${inr(liveJournal.gst)}, Total ${inr(liveJournal.total)}`
                : 'Select an invoice to build its journal from the booked amounts.'}
            </Text>
          </div>
        </div>
        {liveJournal ? (
          <Table rowKey="key" pagination={false} columns={journalColumns} dataSource={liveJournal.lines} size="middle" />
        ) : (
          <Empty description="No invoices to post" style={{ margin: '32px 0' }} />
        )}
      </Card>

      <Card style={{ ...contentCard, marginTop: 16 }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          locale={{ emptyText: <Empty description="No vendor invoices found" style={{ margin: '32px 0' }} /> }}
          pagination={{ pageSize: 10, showTotal: (total) => `Total: ${total} invoices` }}
          onRow={(row) => ({
            onClick: () => setSelectedId(row.id),
            style: { cursor: 'pointer', background: row.id === selectedId ? 'rgba(79, 70, 229, 0.06)' : undefined },
          })}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Text type="secondary">Asset increases: Inventory and Input GST. Liability increases: Vendor Payable.</Text>
        </Col>
      </Row>
    </div>
  );
};

export default ApAccountingEntry;
