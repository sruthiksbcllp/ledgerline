import React, { useMemo, useState } from 'react';
import { Alert, Card, Table } from 'antd';
import { FileBarChart2 } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { NAVY_HEAD, inr, plain, readArStore, trialBalance } from '../../utils/arLedger';

const SAMPLE = [
  { account: 'Cash', side: 'Dr', amount: 1000000 },
  { account: 'Inventory', side: 'Dr', amount: 500000 },
  { account: 'Accounts Payable', side: 'Cr', amount: 250000 },
  { account: 'Revenue', side: 'Cr', amount: 5000000 },
  { account: 'Expenses', side: 'Dr', amount: 3500000 },
];

const TrialBalance = () => {
  const [store] = useState(() => readArStore());
  const tb = useMemo(() => trialBalance(store), [store]);

  return (
    <div>
      <PageHeader icon={FileBarChart2} title="Trial Balance" subtitle="A trial balance is generated after all postings." />
      <Card title="Sample Trial Balance" style={{ borderRadius: 16, marginBottom: 16 }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="account"
          pagination={false}
          dataSource={SAMPLE}
          columns={[
            { title: 'Account', dataIndex: 'account', onHeaderCell: NAVY_HEAD },
            { title: 'Dr / Cr', dataIndex: 'side', width: 140, onHeaderCell: NAVY_HEAD },
            { title: 'Amount', dataIndex: 'amount', align: 'right', onHeaderCell: NAVY_HEAD, render: (value) => plain(value) },
          ]}
        />
      </Card>
      <Alert
        style={{ marginBottom: 16 }}
        type={tb.balanced ? 'success' : 'warning'}
        showIcon
        message={tb.balanced ? 'Books are balanced' : 'Books are out of balance'}
        description={`Debit ${inr(tb.totalDr)} · Credit ${inr(tb.totalCr)}`}
      />
      <Card title="Ledger trial balance" style={{ borderRadius: 16 }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="code"
          pagination={false}
          dataSource={tb.rows}
          columns={[
            { title: 'Account', dataIndex: 'name', render: (_, row) => `${row.code} ${row.name}` },
            { title: 'Dr / Cr', dataIndex: 'side', width: 120 },
            { title: 'Amount', dataIndex: 'amount', align: 'right', render: (value) => plain(value) },
          ]}
        />
      </Card>
    </div>
  );
};

export default TrialBalance;
