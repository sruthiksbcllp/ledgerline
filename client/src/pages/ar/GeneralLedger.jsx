import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, DatePicker, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import { Layers } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { PageHeader } from '../../components/ar/ArShared';
import { useExcelExport } from '../../utils/apReports';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;
const { RangePicker } = DatePicker;
const SOURCE_LABEL = {
  AR_INVOICE: 'Customer invoice', AR_RECEIPT: 'Customer receipt', AR_CREDIT_NOTE: 'Credit note', AR_UNAPPLIED: 'Unapplied cash',
  AR_ECL: 'Credit-loss provision', AR_WRITE_OFF: 'Write-off', MANUAL: 'Manual journal',
  GRN: 'Goods receipt', SES: 'Service entry', INVOICE: 'Vendor invoice', PAYMENT: 'Vendor payment', PO: 'Vendor advance', RETURN: 'Purchase return', TDS: 'TDS deposit',
};
const sourceLabel = (s) => SOURCE_LABEL[s] || s;
const balanceText = (v) => `${inr(Math.abs(v || 0))} ${(v || 0) >= 0 ? 'Dr' : 'Cr'}`;

const GeneralLedger = () => {
  const { exportSheets } = useExcelExport();
  const [accounts, setAccounts] = useState([]);
  const [filters, setFilters] = useState({ range: [dayjs().startOf('month'), dayjs()], account: null, source: null, q: '' });
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/r2r/accounts').then((r) => setAccounts(r?.data?.data || [])).catch(() => setAccounts([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.range?.[0]) params.from = filters.range[0].format('YYYY-MM-DD');
      if (filters.range?.[1]) params.to = filters.range[1].format('YYYY-MM-DD');
      if (filters.account) params.account = filters.account;
      if (filters.source) params.source = filters.source;
      if (filters.q.trim()) params.q = filters.q.trim();
      const r = await api.get('/r2r/ledger', { params });
      setRows(r?.data?.data || []);
      setTotals(r?.data?.totals || {});
      setSources(r?.data?.sources || []);
    } catch (e) {
      message.error(errorOf(e, 'Could not load the general ledger'));
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const oneAccount = !!filters.account;
  const columns = [
    { title: 'Date', dataIndex: 'entry_date', width: 110, render: fmt },
    { title: 'Journal', dataIndex: 'je_number', width: 130 },
    { title: 'Source', dataIndex: 'source_module', width: 150, render: (v, r) => <Tag color={r.source === 'MANUAL' ? 'purple' : 'default'}>{sourceLabel(v)}</Tag> },
    { title: 'Reference', dataIndex: 'reference', width: 150, render: (v) => v || '—' },
    ...(!oneAccount ? [{ title: 'Account', dataIndex: 'account_code', width: 230, render: (v, r) => `${v} · ${r.account_name}` }] : []),
    { title: 'Narration / memo', dataIndex: 'narration', render: (v, r) => <div><div>{v}</div>{r.memo && <Text type="secondary" style={{ fontSize: 12 }}>{r.memo}</Text>}</div> },
    { title: 'Debit', dataIndex: 'debit', align: 'right', width: 130, render: (v) => (v ? inr(v) : '') },
    { title: 'Credit', dataIndex: 'credit', align: 'right', width: 130, render: (v) => (v ? inr(v) : '') },
    ...(oneAccount ? [{ title: 'Balance', dataIndex: 'balance', align: 'right', width: 150, render: balanceText }] : []),
  ];

  const exportLedger = () => exportSheets([{
    name: 'General ledger', title: 'General ledger', rows,
    columns: [
      { label: 'Date', value: (r) => r.entry_date }, { label: 'Journal', value: (r) => r.je_number }, { label: 'Source', value: (r) => sourceLabel(r.source_module) },
      { label: 'Reference', value: (r) => r.reference || '' }, { label: 'Account', value: (r) => `${r.account_code} ${r.account_name}` },
      { label: 'Narration', value: (r) => r.narration || '' }, { label: 'Memo', value: (r) => r.memo || '' },
      { label: 'Debit', value: (r) => r.debit }, { label: 'Credit', value: (r) => r.credit },
      ...(oneAccount ? [{ label: 'Balance (Dr +)', value: (r) => r.balance }] : []),
    ],
  }], 'General_Ledger');

  return (
    <div>
      <PageHeader
        icon={<Layers size={22} />}
        title="General Ledger"
        subtitle="Every posted journal line. All approved journals, from every sub-ledger, are posted here."
        actions={[<Button key="x" onClick={exportLedger}>Export to Excel</Button>]}
      />

      <Card style={{ ...card, marginBottom: 16 }}>
        <Space wrap>
          <RangePicker value={filters.range} onChange={(v) => setFilters((f) => ({ ...f, range: v }))} allowClear format="DD MMM YYYY" />
          <Select
            allowClear showSearch optionFilterProp="label" placeholder="All accounts" style={{ width: 280 }} value={filters.account}
            onChange={(v) => setFilters((f) => ({ ...f, account: v || null }))}
            options={accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))}
          />
          <Select
            allowClear placeholder="All sources" style={{ width: 200 }} value={filters.source}
            onChange={(v) => setFilters((f) => ({ ...f, source: v || null }))}
            options={sources.map((s) => ({ value: s, label: sourceLabel(s) }))}
          />
          <Input.Search allowClear placeholder="Journal no., reference or narration" style={{ width: 280 }} onSearch={(v) => setFilters((f) => ({ ...f, q: v || '' }))} />
        </Space>
      </Card>

      {totals.truncated && <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="Only the first 3,000 lines are shown. Narrow the dates or choose an account." />}

      {oneAccount && (
        <Card size="small" style={{ ...card, marginBottom: 16 }}>
          <Space size={32} wrap>
            <span><Text type="secondary">Opening balance </Text><Text strong>{balanceText(totals.opening)}</Text></span>
            <span><Text type="secondary">Debits </Text><Text strong>{inr(totals.debit)}</Text></span>
            <span><Text type="secondary">Credits </Text><Text strong>{inr(totals.credit)}</Text></span>
            <span><Text type="secondary">Closing balance </Text><Text strong>{balanceText(totals.closing)}</Text></span>
          </Space>
        </Card>
      )}

      <Card style={card} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 50, showSizeChanger: true }}
          scroll={{ x: 1100 }}
          locale={{ emptyText: 'No posted journal lines match these filters.' }}
          summary={() => (rows.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={oneAccount ? 5 : 6}><Text strong>Total ({rows.length} lines)</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right"><Text strong>{inr(totals.debit)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><Text strong>{inr(totals.credit)}</Text></Table.Summary.Cell>
              {oneAccount && <Table.Summary.Cell index={3} align="right"><Text strong>{balanceText(totals.closing)}</Text></Table.Summary.Cell>}
            </Table.Summary.Row>
          ) : null)}
        />
      </Card>
    </div>
  );
};

export default GeneralLedger;
