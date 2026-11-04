import React, { useState } from 'react';
import { Alert, Button, Empty, Modal, Space, Table, Tag, Typography } from 'antd';
import { RotateCw, UserX } from 'lucide-react';

const { Text } = Typography;
const DAY = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/**
 * "No reply" on an RFQ: vendors the RFQ was emailed to who have neither replied by email
 * nor sent a quotation. Once the due date has passed they are shown as overdue.
 */
export default function NoReplyVendors({ rfq, replies, repliesChecked, onResend, sending }) {
  const [open, setOpen] = useState(false);

  const replied = new Set((replies || []).map((r) => Number(r.vendor_id)));
  const rows = (rfq?.vendors || []).filter((v) => v.invite_status === 'SENT' && !v.response && !replied.has(Number(v.vendor_id)));
  const due = rfq?.due_date ? startOfDay(rfq.due_date) : null;
  const daysPast = due ? Math.round((startOfDay(new Date()) - due) / DAY) : null;
  const overdue = daysPast !== null && daysPast > 0;

  const columns = [
    { title: 'Vendor', key: 'vendor', render: (_, r) => (
      <div>
        <Text strong>{r.vendor?.vendor_name || `Vendor #${r.vendor_id}`}</Text>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.vendor?.email || 'No email'}</div>
      </div>
    ) },
    { title: 'Contact', key: 'contact', render: (_, r) => (
      <div style={{ fontSize: 13 }}>
        <div>{r.vendor?.contact_person || '—'}</div>
        {r.vendor?.phone && <div style={{ color: 'var(--color-text-muted)' }}>{r.vendor.phone}</div>}
      </div>
    ) },
    { title: 'RFQ sent', key: 'sent', render: (_, r) => fmt(r.email_sent_at) },
    { title: 'Status', key: 'status', render: () => (overdue
      ? <Tag color="error">No reply · {daysPast} day{daysPast === 1 ? '' : 's'} past due</Tag>
      : <Tag color="warning">Waiting{daysPast === 0 ? ' · due today' : due ? ` · due in ${-daysPast} day${daysPast === -1 ? '' : 's'}` : ''}</Tag>) },
    { title: '', key: 'action', align: 'right', render: (_, r) => (r.vendor?.email
      ? <Button size="small" icon={<RotateCw size={13} />} disabled={sending} onClick={() => { setOpen(false); onResend([r.vendor_id]); }}>Resend</Button>
      : null) }
  ];

  const resendable = rows.filter((r) => r.vendor?.email).map((r) => r.vendor_id);

  return (
    <>
      <Button danger={overdue && rows.length > 0} icon={<UserX size={14} />} onClick={() => setOpen(true)}>
        No reply{rows.length ? ` (${rows.length})` : ''}
      </Button>
      <Modal
        title={`Vendors who have not replied${rfq?.rfq_number ? ` — ${rfq.rfq_number}` : ''}`}
        open={open}
        onCancel={() => setOpen(false)}
        width={860}
        footer={(
          <Space>
            {resendable.length > 1 && (
              <Button icon={<RotateCw size={14} />} disabled={sending} onClick={() => { setOpen(false); onResend(resendable); }}>Resend to all {resendable.length}</Button>
            )}
            <Button type="primary" onClick={() => setOpen(false)}>Close</Button>
          </Space>
        )}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            Due date: <Text strong>{fmt(rfq?.due_date)}</Text>
            {overdue ? ` — passed ${daysPast} day${daysPast === 1 ? '' : 's'} ago.` : ''}
            {' '}These vendors were sent the RFQ but have not replied by email or sent a quotation.
          </Text>
          {!repliesChecked && (
            <Alert type="info" showIcon message="Email replies could not be checked (Outlook is not connected for you), so this list only looks at quotations recorded in LedgerLine." />
          )}
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Every vendor has replied" /> }}
          />
        </Space>
      </Modal>
    </>
  );
}
