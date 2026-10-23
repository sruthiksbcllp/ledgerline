import React, { useState } from 'react';
import { Card, InputNumber, Table, Tag } from 'antd';
import { Scale } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { NAVY_HEAD, inr, readArStore, writeArStore } from '../../utils/arLedger';

const ROWS = [
  { key: 'bank', name: 'Bank Reconciliation', compare: 'Bank Ledger', against: 'Bank Statement' },
  { key: 'vendor', name: 'Vendor Reconciliation', compare: 'Vendor Statement', against: 'Accounts Payable Ledger' },
  { key: 'gst', name: 'GST Reconciliation', compare: 'Purchase Register', against: 'GST Return Data' },
];

const Reconciliations = () => {
  const [store, setStore] = useState(() => readArStore());

  const update = (key, side, value) => {
    const next = writeArStore({
      ...store,
      reconciliations: {
        ...store.reconciliations,
        [key]: { ...store.reconciliations[key], [side]: Number(value || 0) },
      },
    });
    setStore(next);
  };

  return (
    <div>
      <PageHeader icon={Scale} title="Reconciliations" subtitle="Reconciliations ensure correctness of accounts." />
      <Card style={{ borderRadius: 16 }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="key"
          pagination={false}
          dataSource={ROWS}
          columns={[
            { title: 'Reconciliation', dataIndex: 'name', onHeaderCell: NAVY_HEAD, render: (value) => <strong>{value}</strong> },
            { title: 'Compare', dataIndex: 'compare', onHeaderCell: NAVY_HEAD },
            { title: 'Against', dataIndex: 'against', onHeaderCell: NAVY_HEAD },
            {
              title: 'Ledger',
              onHeaderCell: NAVY_HEAD,
              render: (_, row) => <InputNumber min={0} value={store.reconciliations[row.key]?.left} onChange={(value) => update(row.key, 'left', value)} />,
            },
            {
              title: 'Statement',
              onHeaderCell: NAVY_HEAD,
              render: (_, row) => <InputNumber min={0} value={store.reconciliations[row.key]?.right} onChange={(value) => update(row.key, 'right', value)} />,
            },
            {
              title: 'Difference',
              onHeaderCell: NAVY_HEAD,
              render: (_, row) => {
                const diff = Number(store.reconciliations[row.key]?.left || 0) - Number(store.reconciliations[row.key]?.right || 0);
                return <Tag color={Math.abs(diff) < 0.01 ? 'success' : 'error'}>{inr(diff)}</Tag>;
              },
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default Reconciliations;
