import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Input, Row, Select, Space, Table, Tag, Typography, message } from 'antd';
import { BookOpenCheck, RefreshCcw } from 'lucide-react';
import api from '../../utils/api';
import { ArFlow, JournalLines, PageHeader } from '../../components/ar/ArShared';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;
const EVENTS = [
  { value: 'AR_INVOICE', label: 'Customer invoice', color: 'blue' },
  { value: 'AR_RECEIPT', label: 'Receipt', color: 'green' },
  { value: 'AR_INVOICE_CANCEL', label: 'Invoice cancelled', color: 'default' },
  { value: 'AR_CREDIT_NOTE', label: 'Credit note', color: 'orange' },
  { value: 'AR_UNAPPLIED_CASH', label: 'Payment on account (unapplied)', color: 'cyan' },
  { value: 'AR_UNAPPLIED_APPLIED', label: 'Unapplied cash applied', color: 'cyan' },
  { value: 'AR_ECL_TOP_UP', label: 'Credit-loss provision', color: 'purple' },
  { value: 'AR_ECL_RELEASE', label: 'Credit-loss release', color: 'purple' },
  { value: 'AR_WRITE_OFF', label: 'Write-off', color: 'red' },
  { value: 'AR_WRITE_OFF_RECOVERY', label: 'Write-off recovery', color: 'gold' },
];
const eventOf = (v) => EVENTS.find((e) => e.value === v) || { label: v, color: 'default' };

const AccountingEntry = () => {
  const [rows, setRows] = useState([]);
  const [balances, setBalances] = useState([]);
  const [tie, setTie] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [eventType, setEventType] = useState();
  const [range, setRange] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/ar/journals', {
        params: { q: q || undefined, event_type: eventType, from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD') },
      });
      setRows(res?.data?.data || []);
      setBalances(res?.data?.balances || []);
      setTie(res?.data?.tie_out || null);
    } catch (e) {
      message.error(errorOf(e, 'Could not load the accounting entries'));
    } finally {
      setLoading(false);
    }
  }, [q, eventType, range]);
  useEffect(() => { load(); }, [load]);

  const columns = [
    { title: 'Journal', dataIndex: 'je_number', render: (v) => <Text strong>{v}</Text> },
    { title: 'Date', dataIndex: 'entry_date', render: fmt },
    { title: 'Entry for', dataIndex: 'event_type', render: (v) => { const e = eventOf(v); return <Tag color={e.color}>{e.label}</Tag>; } },
    { title: 'Document', dataIndex: 'source_ref', render: (v) => v || '—' },
    { title: 'Narration', dataIndex: 'narration', ellipsis: true },
    { title: 'Amount', dataIndex: 'total_debit', align: 'right', render: inr },
    { title: 'Posted by', dataIndex: 'posted_by_name', render: (v) => v || 'System' },
  ];

  return (
    <div>
      <ArFlow active={['gl']} />
      <PageHeader
        icon={<BookOpenCheck size={24} />}
        title="AR Accounting Entries"
        subtitle="The journal posted to the general ledger for every customer invoice, receipt, credit note, unapplied payment, credit-loss provision and write-off. Nobody keys these."
        actions={[<Button key="r" icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>]}
      />
      {tie && (
        <Alert
          style={{ marginBottom: 16 }} showIcon type={tie.ties && tie.unapplied_ties !== false ? 'success' : 'warning'}
          message={tie.ties ? 'Receivables in the ledger equal the customer ledger' : `Receivables in the ledger differ from the customer ledger by ${inr(tie.difference)}`}
          description={(
            <Space direction="vertical" size={0}>
              <span>Accounts receivable (1100) in the general ledger: {inr(tie.gl_receivables)} · Outstanding on open customer invoices: {inr(tie.customer_ledger)}</span>
              {tie.gl_unapplied !== undefined && <span>Unapplied cash (2060) in the ledger: {inr(tie.gl_unapplied)} · Payments not yet applied: {inr(tie.unapplied_ledger)}{tie.unapplied_ties ? '' : ` · difference ${inr(tie.unapplied_difference)}`}</span>}
            </Space>
          )}
        />
      )}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {balances.map((b) => {
          const debitSide = b.balance >= 0;
          return (
            <Col xs={12} md={8} lg={6} xl={4} key={b.code}>
              <Card style={card} styles={{ body: { padding: '12px 16px' } }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{b.code} · {b.name}</Text>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{inr(Math.abs(b.balance))} <Text type="secondary" style={{ fontSize: 12 }}>{debitSide ? 'Dr' : 'Cr'}</Text></div>
              </Card>
            </Col>
          );
        })}
      </Row>
      <Card
        style={card} styles={{ body: { padding: 0 } }}
        title={(
          <Space wrap>
            <Input.Search allowClear placeholder="Journal, invoice number or narration" onSearch={setQ} style={{ width: 280 }} />
            <Select allowClear placeholder="All entries" value={eventType} onChange={setEventType} options={EVENTS} style={{ width: 190 }} />
            <DatePicker.RangePicker value={range} onChange={setRange} format="DD MMM YYYY" />
          </Space>
        )}
      >
        <Table
          rowKey="id" loading={loading} columns={columns} dataSource={rows} scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, hideOnSinglePage: true }}
          expandable={{ expandedRowRender: (r) => <div style={{ maxWidth: 720 }}><JournalLines lines={r.lines} /></div> }}
          locale={{ emptyText: 'No entries yet. Post a customer invoice or record a receipt and its journal appears here.' }}
        />
      </Card>
    </div>
  );
};

export default AccountingEntry;
