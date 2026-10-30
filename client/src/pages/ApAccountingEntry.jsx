import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Collapse, DatePicker, Empty, Input, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { BookOpen, RefreshCcw, Search, Wand2 } from 'lucide-react';
import api from '../utils/api';
import { getStoredUser } from '../utils/session';
import PageHeader from '../components/PageHeader';
import { plain, inr } from '../utils/apLedger';

/**
 * AP Journal: the balanced journal the server posts for every AP event (goods receipt, service
 * receipt, vendor invoice, payment, reversal), following the AP Journal Entry Reference.
 */
const { Text } = Typography;
const { RangePicker } = DatePicker;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const navyHead = () => ({ style: { background: '#1E3A5F', color: '#fff', fontWeight: 700 } });

const EVENTS = {
  GOODS_RECEIPT: { label: 'Goods receipt', color: 'blue' },
  SERVICE_RECEIPT: { label: 'Service receipt', color: 'cyan' },
  INVOICE: { label: 'Vendor invoice', color: 'purple' },
  PAYMENT: { label: 'Payment', color: 'green' },
  ADVANCE: { label: 'Advance to vendor', color: 'gold' },
  PURCHASE_RETURN: { label: 'Purchase return', color: 'magenta' },
  TDS_DEPOSIT: { label: 'TDS deposit', color: 'geekblue' },
  REVERSAL: { label: 'Reversal', color: 'volcano' },
};

// What each event posts (AP JE reference §1, 2, 3.4, 5).
const RULES = [
  { key: 'grn', event: 'Goods receipt (GRN)', debit: 'Inventory 1200 · Capital WIP 1500 (capex) · Consumables 6800 (opex)', credit: 'GR/IR clearing 2015', ref: '1.2 – 1.4' },
  { key: 'ses', event: 'Service receipt (SES approved)', debit: 'Contract services 6350 · Capital WIP 1500 (capex)', credit: 'GR/IR clearing 2015', ref: 'Blueprint step 5' },
  { key: 'inv', event: 'Vendor invoice (matched)', debit: 'GR/IR 2015 (excess to PPV 5010) · Input CGST 1411 / SGST 1412 / IGST 1410', credit: 'Accounts payable 2010 (net of TDS) · TDS payable 2160', ref: '2.1 – 2.6' },
  { key: 'nogrn', event: 'Invoice with no receipt', debit: 'Expense / asset directly · Input GST', credit: 'Accounts payable 2010 · TDS payable 2160', ref: '2.5' },
  { key: 'itc', event: 'GST not creditable', debit: 'GST added to the cost account', credit: '—', ref: '3.4' },
  { key: 'adv', event: 'Advance on a PO', debit: 'Advances to vendors 1300', credit: 'Operating bank 1010', ref: '4.1 – 4.2' },
  { key: 'advinv', event: 'Invoice on a PO with an advance', debit: 'As for the invoice', credit: 'Advances to vendors 1300 (advance adjusted) · Accounts payable 2010 reduced by it', ref: '4.2' },
  { key: 'retb', event: 'Return to vendor, before the invoice', debit: 'GR/IR clearing 2015', credit: 'Inventory 1200 / Consumables 6800 / Capital WIP 1500', ref: '1.5' },
  { key: 'reta', event: 'Return to vendor, after the invoice', debit: 'Accounts payable 2010 (value + GST)', credit: 'Inventory / Expense · Input CGST 1411 / SGST 1412 / IGST 1410', ref: '4.3' },
  { key: 'pay', event: 'Payment', debit: 'Accounts payable 2010', credit: 'Operating bank 1010', ref: '5.1 – 5.2' },
  { key: 'disc', event: 'Payment with cash discount', debit: 'Accounts payable 2010 (full balance)', credit: 'Operating bank 1010 (cash paid) · Discount received 4100', ref: '5.3' },
  { key: 'tds', event: 'TDS deposited with the government', debit: 'TDS payable 2160', credit: 'Operating bank 1010', ref: '3.8' },
  { key: 'rev', event: 'Invoice rejected after posting', debit: 'Each credit of the invoice journal', credit: 'Each debit of the invoice journal', ref: 'Reversal' },
];

const lineColumns = [
  { title: 'Account', key: 'account', width: '34%', onHeaderCell: navyHead, render: (_, l) => <span><Text strong>{l.account_code}</Text> {l.account_name}</span> },
  { title: 'Memo', dataIndex: 'memo', ellipsis: true, onHeaderCell: navyHead, render: (v) => <Text type="secondary">{v || ''}</Text> },
  { title: 'Debit (₹)', dataIndex: 'debit', align: 'right', width: 130, onHeaderCell: navyHead, render: (v) => (Number(v) ? plain(v) : '') },
  { title: 'Credit (₹)', dataIndex: 'credit', align: 'right', width: 130, onHeaderCell: navyHead, render: (v) => (Number(v) ? plain(v) : '') },
];

const JournalLines = ({ entry }) => (
  <Table
    rowKey="id"
    size="small"
    pagination={false}
    columns={lineColumns}
    dataSource={entry.lines || []}
    title={entry.narration ? () => <Text type="secondary">{entry.narration}</Text> : undefined}
    tableLayout="fixed"
    summary={() => (
      <Table.Summary.Row style={{ background: 'var(--color-bg-subtle, #F5F7FA)' }}>
        <Table.Summary.Cell index={0} colSpan={2}><Text strong>Total {Number(entry.total_debit) === Number(entry.total_credit) ? '(balanced)' : '(NOT balanced)'}</Text></Table.Summary.Cell>
        <Table.Summary.Cell index={2} align="right"><Text strong>{plain(entry.total_debit)}</Text></Table.Summary.Cell>
        <Table.Summary.Cell index={3} align="right"><Text strong>{plain(entry.total_credit)}</Text></Table.Summary.Cell>
      </Table.Summary.Row>
    )}
  />
);

const ApAccountingEntry = () => {
  const [rows, setRows] = useState([]);
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [filters, setFilters] = useState({ event_type: undefined, account: undefined, q: '', range: null });

  const role = String(getStoredUser()?.role || '').toUpperCase();
  const canBackfill = ['FINANCE', 'ADMIN', 'CLIENT_ADMIN', 'SUPER_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'].includes(role);

  const load = async (f = filters) => {
    setLoading(true);
    try {
      const params = {
        event_type: f.event_type || undefined,
        account: f.account || undefined,
        q: f.q || undefined,
        from: f.range?.[0]?.format('YYYY-MM-DD'),
        to: f.range?.[1]?.format('YYYY-MM-DD'),
      };
      const [list, bal] = await Promise.all([api.get('/ap-journals', { params }), api.get('/ap-journals/balances')]);
      setRows(list?.data?.data || []);
      setBalances(bal?.data?.data || null);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Failed to load the AP journal');
    } finally {
      setLoading(false);
    }
  };

  // Filters reload on change; the search box reloads on Enter.
  useEffect(() => { load(); }, [filters.event_type, filters.account, filters.range]); // eslint-disable-line react-hooks/exhaustive-deps

  const backfill = async () => {
    setPosting(true);
    try {
      const res = await api.post('/ap-journals/backfill');
      const failed = res?.data?.data?.failed || [];
      if (failed.length) message.warning(`${res.data.message}. ${failed.length} could not be posted: ${failed.slice(0, 3).join('; ')}`);
      else message.success(res?.data?.message || 'Journals posted');
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not post the missing journals');
    } finally {
      setPosting(false);
    }
  };

  const acct = (code) => balances?.accounts?.find((a) => a.code === code);
  const creditBal = (code) => { const a = acct(code); return a ? Number(a.credit) - Number(a.debit) : 0; };
  const inputGst = ['1410', '1411', '1412'].reduce((s, c) => s - creditBal(c), 0);

  // Compact columns so the amount, who posted and the status always fit; the narration and the
  // debit / credit lines show when a journal is expanded.
  const columns = useMemo(() => ([
    {
      title: 'Journal', key: 'je', width: 150,
      render: (_, r) => <div style={{ whiteSpace: 'nowrap' }}><Text strong>{r.je_number}</Text><div><Text type="secondary" style={{ fontSize: 12 }}>{r.entry_date}</Text></div></div>,
    },
    { title: 'Event', dataIndex: 'event_type', width: 140, render: (v) => <Tag color={EVENTS[v]?.color}>{EVENTS[v]?.label || v}</Tag> },
    {
      title: 'Document / Vendor', key: 'doc', ellipsis: true,
      render: (_, r) => <div style={{ minWidth: 0 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.source_ref || '—'}</div><Text type="secondary" style={{ fontSize: 12 }}>{r.vendor?.vendor_name || '—'}</Text></div>,
    },
    { title: 'Amount', dataIndex: 'total_debit', align: 'right', width: 130, render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{inr(v)}</span> },
    {
      title: 'Posted by (Role | User)', key: 'by', width: 230, ellipsis: true,
      render: (_, r) => <span>{r.posted_by_role || '—'} <Text type="secondary">|</Text> {r.posted_by_name || '—'}</span>,
    },
    {
      title: 'Status', dataIndex: 'status', width: 100,
      render: (v, r) => (r.event_type === 'REVERSAL' ? <Tag color="volcano">Reversal</Tag> : <Tag color={v === 'REVERSED' ? 'default' : 'success'}>{v === 'REVERSED' ? 'Reversed' : 'Posted'}</Tag>),
    },
  ]), []);

  const balanceColumns = [
    { title: 'Account', key: 'a', onHeaderCell: navyHead, render: (_, a) => <span><Text strong>{a.code}</Text> {a.name}</span> },
    { title: 'Type', dataIndex: 'type', width: 110, onHeaderCell: navyHead, render: (v) => <Text type="secondary">{String(v).toLowerCase()}</Text> },
    { title: 'Debit (₹)', dataIndex: 'debit', align: 'right', width: 140, onHeaderCell: navyHead, render: (v) => (Number(v) ? plain(v) : '') },
    { title: 'Credit (₹)', dataIndex: 'credit', align: 'right', width: 140, onHeaderCell: navyHead, render: (v) => (Number(v) ? plain(v) : '') },
    { title: 'Balance (₹)', key: 'b', align: 'right', width: 160, onHeaderCell: navyHead, render: (_, a) => (a.balance ? `${plain(a.balance)} ${a.side}` : '—') },
  ];

  return (
    <div>
      <PageHeader
        icon={BookOpen}
        title="AP Journal"
        subtitle="Balanced journal entries posted automatically for every goods receipt, service receipt, vendor invoice and payment."
        actions={(
          <Space>
            <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={() => load()}>Refresh</Button>
            {canBackfill && <Button icon={<Wand2 size={16} />} loading={posting} onClick={backfill}>Post missing journals</Button>}
          </Space>
        )}
      />

      {balances && !balances.balanced && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message="The AP ledger is out of balance" description={`Debits ${inr(balances.total_debit)} vs credits ${inr(balances.total_credit)}.`} />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Accounts payable (2010)', value: creditBal('2010'), hint: 'Owed to vendors, net of TDS' },
          { title: 'GR/IR open (2015)', value: creditBal('2015'), hint: 'Received, not yet invoiced' },
          { title: 'TDS payable (2160)', value: creditBal('2160'), hint: 'Due to the government' },
          { title: 'Input GST credit', value: inputGst, hint: 'CGST + SGST + IGST' },
        ].map((k) => (
          <Col xs={24} sm={12} lg={6} key={k.title}>
            <Card style={contentCard} styles={{ body: { padding: 16 } }}>
              <Statistic title={k.title} value={k.value} precision={2} prefix="₹" valueStyle={{ color: '#1E3A5F', fontSize: 22 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{k.hint}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={{ ...contentCard, marginBottom: 16 }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Input
            allowClear
            prefix={<Search size={14} />}
            placeholder="Journal, document or narration"
            style={{ width: 260 }}
            value={filters.q}
            onChange={(e) => { const q = e.target.value; setFilters((f) => ({ ...f, q })); if (!q) load({ ...filters, q: '' }); }}
            onPressEnter={() => load()}
          />
          <Select allowClear placeholder="Event" style={{ width: 180 }} value={filters.event_type}
            options={Object.entries(EVENTS).map(([value, e]) => ({ value, label: e.label }))}
            onChange={(event_type) => setFilters((f) => ({ ...f, event_type }))} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="Account" style={{ width: 260 }} value={filters.account}
            options={(balances?.accounts || []).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))}
            onChange={(account) => setFilters((f) => ({ ...f, account }))} />
          <RangePicker value={filters.range} onChange={(range) => setFilters((f) => ({ ...f, range }))} />
        </div>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          expandable={{ expandedRowRender: (r) => <JournalLines entry={r} />, expandRowByClick: true }}
          locale={{ emptyText: <Empty description="No journals yet. They are posted when goods or services are received, invoices are booked and payments are made." style={{ margin: '32px 0' }} /> }}
          pagination={{ pageSize: 15, showTotal: (total) => `${total} journals` }}
          tableLayout="fixed"
          scroll={{ x: 860 }}
        />
      </Card>

      <Card title="Account balances" style={{ ...contentCard, marginBottom: 16 }} styles={{ body: { padding: 0 } }}
        extra={balances ? <Text type={balances.balanced ? 'success' : 'danger'}>Debits {inr(balances.total_debit)} = Credits {inr(balances.total_credit)}</Text> : null}>
        <Table rowKey="code" size="middle" pagination={false} columns={balanceColumns} dataSource={balances?.accounts || []} loading={loading} />
      </Card>

      <Collapse
        style={{ ...contentCard, background: 'var(--color-surface, #fff)' }}
        items={[{
          key: 'rules',
          label: <Text strong style={{ color: '#1E3A5F' }}>How entries are posted</Text>,
          children: (
            <>
              <Table
                rowKey="key" size="small" pagination={false} dataSource={RULES}
                columns={[
                  { title: 'Event', dataIndex: 'event', onHeaderCell: navyHead },
                  { title: 'Debit', dataIndex: 'debit', onHeaderCell: navyHead },
                  { title: 'Credit', dataIndex: 'credit', onHeaderCell: navyHead },
                  { title: 'Reference', dataIndex: 'ref', width: 120, onHeaderCell: navyHead },
                ]}
              />
              <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
                An invoice posts once its three-way match is clean (an open exception waits until Finance resolves it).
                TDS is deducted on the value excluding GST and the vendor is paid the net amount.
                Intra-state GST posts as CGST + SGST, inter-state as IGST.
              </Text>
            </>
          ),
        }]}
      />
    </div>
  );
};

export default ApAccountingEntry;
