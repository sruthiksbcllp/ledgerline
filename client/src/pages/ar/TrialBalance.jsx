import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, DatePicker, Table, Tag, Typography, message } from 'antd';
import { FileBarChart2 } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { PageHeader } from '../../components/ar/ArShared';
import { useExcelExport } from '../../utils/apReports';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;
const TYPE_COLOR = { ASSET: 'blue', LIABILITY: 'orange', EQUITY: 'purple', INCOME: 'green', EXPENSE: 'red' };
const TYPE_LABEL = { ASSET: 'Asset', LIABILITY: 'Liability', EQUITY: 'Equity', INCOME: 'Income', EXPENSE: 'Expense' };

const TrialBalance = () => {
  const { exportSheets } = useExcelExport();
  const [asOf, setAsOf] = useState(dayjs());
  const [tb, setTb] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/r2r/trial-balance', { params: { as_of: (asOf || dayjs()).format('YYYY-MM-DD') } });
      setTb(r?.data?.data || null);
    } catch (e) {
      message.error(errorOf(e, 'Could not load the trial balance'));
    } finally {
      setLoading(false);
    }
  }, [asOf]);
  useEffect(() => { load(); }, [load]);

  const rows = tb?.rows || [];
  const columns = [
    { title: 'Code', dataIndex: 'code', width: 90 },
    { title: 'Account', dataIndex: 'name' },
    { title: 'Type', dataIndex: 'type', width: 110, render: (v) => <Tag color={TYPE_COLOR[v]}>{TYPE_LABEL[v] || v}</Tag> },
    { title: 'Debit', dataIndex: 'balance_dr', align: 'right', width: 160, render: (v) => (v ? inr(v) : '') },
    { title: 'Credit', dataIndex: 'balance_cr', align: 'right', width: 160, render: (v) => (v ? inr(v) : '') },
  ];

  const exportTb = () => exportSheets([{
    name: 'Trial balance', title: `Trial balance as of ${tb ? fmt(tb.as_of) : ''}`, rows,
    columns: [
      { label: 'Code', value: (r) => r.code }, { label: 'Account', value: (r) => r.name }, { label: 'Type', value: (r) => TYPE_LABEL[r.type] || r.type },
      { label: 'Debit', value: (r) => r.balance_dr }, { label: 'Credit', value: (r) => r.balance_cr },
    ],
  }], 'Trial_Balance');

  return (
    <div>
      <PageHeader
        icon={<FileBarChart2 size={22} />}
        title="Trial Balance"
        subtitle="The balance of every account after all postings. Total debits must equal total credits."
        actions={[
          <DatePicker key="d" value={asOf} onChange={(v) => setAsOf(v || dayjs())} allowClear={false} format="DD MMM YYYY" />,
          <Button key="x" onClick={exportTb}>Export to Excel</Button>,
        ]}
      />

      {tb && (
        <Alert
          style={{ marginBottom: 16 }}
          type={tb.balanced ? 'success' : 'error'}
          showIcon
          message={tb.balanced ? 'The books balance' : 'The books do not balance'}
          description={`As of ${fmt(tb.as_of)}: total debit ${inr(tb.total_dr)} · total credit ${inr(tb.total_cr)}${tb.balanced ? '' : ` · difference ${inr(Math.abs(tb.total_dr - tb.total_cr))}`}`}
        />
      )}

      <Card style={card} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="code"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={false}
          scroll={{ x: 700 }}
          locale={{ emptyText: 'Nothing has been posted up to this date.' }}
          summary={() => (rows.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right"><Text strong>{inr(tb.total_dr)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><Text strong>{inr(tb.total_cr)}</Text></Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null)}
        />
      </Card>
      <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
        Built from posted journals only, so it includes every sub-ledger that posts to the ledger (Accounts Payable and Accounts Receivable).
      </Text>
    </div>
  );
};

export default TrialBalance;
