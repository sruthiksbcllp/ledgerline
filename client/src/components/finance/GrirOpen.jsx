import React, { useEffect, useState } from 'react';
import { Alert, Card, DatePicker, Empty, Space, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { inr } from '../../utils/apLedger';

/**
 * Month-end review of GR/IR clearing: goods and services received but not yet invoiced at a date,
 * aged 0-30 / 31-60 / 61-90 / 90+ days. These are the period-end accruals; anything over 90 days
 * needs follow-up with the vendor (invoice never arrived, or the receipt was wrong).
 */
const { Text } = Typography;
const BUCKET_COLOR = { '0-30': 'green', '31-60': 'gold', '61-90': 'orange', '90+': 'red' };

const GrirOpen = ({ cardStyle }) => {
  const [asOf, setAsOf] = useState(dayjs());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async (date = asOf) => {
    setLoading(true);
    try {
      const res = await api.get('/ap-journals/grir-open', { params: { as_of: date.format('YYYY-MM-DD') } });
      setData(res?.data?.data || null);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not load received-not-invoiced');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { title: 'Receipt', key: 'r', width: 170, render: (_, r) => <div><Text strong>{r.receipt}</Text><div><Text type="secondary" style={{ fontSize: 12 }}>{r.kind} · {r.received_on}</Text></div></div> },
    { title: 'PO / Vendor', key: 'v', ellipsis: true, render: (_, r) => <div style={{ minWidth: 0 }}><div>{r.po_number || '—'}</div><Text type="secondary" style={{ fontSize: 12 }}>{r.vendor || '—'}</Text></div> },
    { title: 'Received', dataIndex: 'received', align: 'right', width: 120, render: (v) => inr(v) },
    { title: 'Invoiced', dataIndex: 'invoiced', align: 'right', width: 120, render: (v) => (Number(v) ? inr(v) : '—') },
    { title: 'Not invoiced', dataIndex: 'open', align: 'right', width: 130, render: (v) => <Text strong>{inr(v)}</Text> },
    { title: 'Age', key: 'age', width: 110, render: (_, r) => <Tag color={BUCKET_COLOR[r.bucket]}>{r.age_days} days</Tag> },
  ];

  return (
    <Card
      title="Received, not yet invoiced (month-end)"
      style={{ ...cardStyle, marginBottom: 16 }}
      styles={{ body: { padding: 0 } }}
      extra={(
        <Space>
          <Text type="secondary">As of</Text>
          <DatePicker value={asOf} allowClear={false} onChange={(d) => { if (d) { setAsOf(d); load(d); } }} />
        </Space>
      )}
    >
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Text>Total to accrue: <Text strong>{inr(data?.total_open || 0)}</Text></Text>
        {(data?.buckets || []).map((b) => (
          <Tag key={b.bucket} color={b.count ? BUCKET_COLOR[b.bucket] : 'default'}>{b.bucket} days: {b.count} · {inr(b.amount)}</Tag>
        ))}
      </div>
      {data && Math.abs(Number(data.difference)) > 0.009 && (
        <Alert type="warning" showIcon style={{ margin: '0 16px 12px' }}
          message={`GR/IR balance ${inr(data.grir_balance)} differs from this list by ${inr(data.difference)}`}
          description="Usually an invoice above or below its receipt value, or a journal posted by hand. Check GR/IR clearing (2015) in the journal list." />
      )}
      <Table
        rowKey="journal_entry_id"
        size="middle"
        loading={loading}
        dataSource={data?.rows || []}
        columns={columns}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        tableLayout="fixed"
        scroll={{ x: 760 }}
        locale={{ emptyText: <Empty description="Everything received up to this date has been invoiced." style={{ margin: '24px 0' }} /> }}
      />
      <Text type="secondary" style={{ display: 'block', padding: '8px 16px 12px', fontSize: 12 }}>
        Book these as accrued expenses at month end. Receipts open over 90 days need follow-up: the invoice never arrived, or the receipt was wrong.
      </Text>
    </Card>
  );
};

export default GrirOpen;
