import React, { useEffect, useState } from 'react';
import { Space, Table, Tag, Typography } from 'antd';
import { BookOpen } from 'lucide-react';
import api from '../../utils/api';

/**
 * AP journal entries posted for one document (/api/ap-journals/source/:module/:id): for an invoice,
 * the invoice entry plus its payments and any reversal. Roles without AP journal access get a 403
 * and see nothing.
 *
 *   <JournalEntries module="INVOICE" id={invoice.id} refreshKey={invoice} emptyText="…" />
 */

const { Text } = Typography;

const EVENTS = {
  GOODS_RECEIPT: { label: 'Goods receipt', color: 'blue' },
  SERVICE_RECEIPT: { label: 'Service receipt', color: 'cyan' },
  INVOICE: { label: 'Vendor invoice booked', color: 'purple' },
  PAYMENT: { label: 'Payment', color: 'green' },
  ADVANCE: { label: 'Advance to vendor', color: 'gold' },
  PURCHASE_RETURN: { label: 'Purchase return', color: 'magenta' },
  REVERSAL: { label: 'Reversal', color: 'volcano' },
};

const amount = (v) => (Number(v) > 0 ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '');
const isCredit = (l) => Number(l.credit) > 0;

const columns = [
  {
    title: 'Account', key: 'account',
    render: (_, l) => (
      <Text style={{ paddingLeft: isCredit(l) ? 20 : 0 }}>
        {isCredit(l) ? 'Cr' : 'Dr'} {l.account_code} · {l.account_name}
      </Text>
    ),
  },
  { title: 'Debit', dataIndex: 'debit', key: 'debit', align: 'right', width: 120, render: amount },
  { title: 'Credit', dataIndex: 'credit', key: 'credit', align: 'right', width: 120, render: amount },
];

export const JournalEntries = ({ module, id, refreshKey, emptyText }) => {
  const [entries, setEntries] = useState(null); // null = not loaded or no access

  useEffect(() => {
    if (!module || !id) return undefined;
    let live = true;
    api.get(`/ap-journals/source/${module}/${id}`)
      .then((res) => { if (live) setEntries(res.data?.data || []); })
      .catch(() => { if (live) setEntries(null); });
    return () => { live = false; };
  }, [module, id, refreshKey]);

  if (!entries) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <Space size={8} style={{ marginBottom: 8 }}>
        <BookOpen size={16} />
        <Text strong style={{ fontSize: 15 }}>Journal entries</Text>
        <Text type="secondary">({entries.length})</Text>
      </Space>
      {entries.length === 0 && <div><Text type="secondary">{emptyText || 'No journal entry posted yet.'}</Text></div>}
      {entries.map((je) => (
        <div key={je.id} style={{ marginBottom: 16 }}>
          <Space size={8} wrap style={{ marginBottom: 6 }}>
            <Text strong>{je.je_number}</Text>
            <Tag color={EVENTS[je.event_type]?.color} style={{ marginInlineEnd: 0 }}>{EVENTS[je.event_type]?.label || je.event_type}</Tag>
            <Text type="secondary">{je.entry_date ? new Date(je.entry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</Text>
            {je.status === 'REVERSED' && <Tag style={{ marginInlineEnd: 0 }}>Reversed</Tag>}
          </Space>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            tableLayout="fixed"
            columns={columns}
            dataSource={je.lines || []}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><Text strong>{amount(je.total_debit)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right"><Text strong>{amount(je.total_credit)}</Text></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
      ))}
    </div>
  );
};

export default JournalEntries;
