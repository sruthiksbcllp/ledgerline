import React, { useMemo, useState } from 'react';
import { Card, Table, Tag } from 'antd';
import { Layers } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import FlowStrip from './FlowStrip';
import { POSTING_FLOW, accountLabel, inr, readArStore } from '../../utils/arLedger';

const GeneralLedger = () => {
  const [store] = useState(() => readArStore());
  const lines = useMemo(() => store.journals.filter((journal) => journal.status === 'POSTED').flatMap((journal) => (
    journal.lines.map((line, index) => ({
      key: `${journal.id}-${index}`,
      number: journal.number,
      date: journal.date,
      account: accountLabel(store.accounts, line.account),
      debit: line.debit,
      credit: line.credit,
      source: journal.source,
      reference: journal.reference,
    }))
  )), [store]);

  return (
    <div>
      <PageHeader icon={Layers} title="General Ledger" subtitle="The GL is the central accounting repository. All approved journals are posted to the General Ledger." />
      <Card title="Posting Flow" style={{ borderRadius: 16, marginBottom: 16 }}>
        <FlowStrip steps={POSTING_FLOW} rowSize={4} />
      </Card>
      <Card style={{ borderRadius: 16 }} styles={{ body: { padding: 0 } }} title="Posted journals">
        <Table
          rowKey="key"
          dataSource={lines}
          locale={{ emptyText: 'No journals have been posted yet. Post a balanced entry from Journal Entry.' }}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Journal', dataIndex: 'number' },
            { title: 'Date', dataIndex: 'date' },
            { title: 'Account', dataIndex: 'account' },
            { title: 'Debit', dataIndex: 'debit', align: 'right', render: (value) => (value ? inr(value) : '') },
            { title: 'Credit', dataIndex: 'credit', align: 'right', render: (value) => (value ? inr(value) : '') },
            { title: 'Source', dataIndex: 'source', render: (value) => <Tag>{value}</Tag> },
            { title: 'Reference', dataIndex: 'reference' },
          ]}
        />
      </Card>
    </div>
  );
};

export default GeneralLedger;
