import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Empty, Form, Input, Modal, Segmented, Space, Table, Tag, Typography, message } from 'antd';
import { RefreshCcw, Undo2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';
import { JournalEntries } from '../components/finance/JournalEntries';
import { getStoredUser } from '../utils/session';

/**
 * Purchase returns: every return to vendor recorded on a GRN, whether it was before or after the
 * invoice, and the vendor credit note awaited for after-invoice returns. Returns are recorded from
 * the GRN (Goods Receipt → View → Return to vendor).
 */

const { Text } = Typography;
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const STATUS = { RETURNED: ['Returned', 'blue'], AWAITING_CREDIT_NOTE: ['Awaiting credit note', 'orange'], CREDIT_NOTE_RECEIVED: ['Credit note received', 'green'] };
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const PurchaseReturns = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [cnRow, setCnRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const canRecordCreditNote = ['ACCOUNTS_PAYABLE', 'FINANCE', 'ADMIN', 'CLIENT_ADMIN', 'SUPER_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN']
    .includes(String(getStoredUser()?.role || '').toUpperCase());

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/purchase-returns');
      setRows(normalizeResponse(res?.data));
    } catch (e) {
      message.error(e?.response?.data?.message || 'Failed to load purchase returns');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const saveCreditNote = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const res = await api.put(`/purchase-returns/${cnRow.id}/credit-note`, { credit_note_number: v.credit_note_number, credit_note_date: v.credit_note_date?.format('YYYY-MM-DD') });
      message.success(res.data?.message || 'Credit note recorded');
      setCnRow(null);
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Credit note could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const shown = rows.filter((r) => filter === 'ALL' || (filter === 'PENDING' ? r.status === 'AWAITING_CREDIT_NOTE' : r.stage === filter));
  const pending = rows.filter((r) => r.status === 'AWAITING_CREDIT_NOTE');

  const columns = [
    { title: 'Return', key: 'no', render: (_, r) => <div><Text strong>{r.return_number}</Text><div><Text type="secondary" style={{ fontSize: 12 }}>{fmt(r.return_date)}</Text></div></div> },
    { title: 'Vendor / GRN', key: 'grn', render: (_, r) => <div>{r.vendor?.vendor_name || '—'}<div><Text type="secondary" style={{ fontSize: 12 }}>{r.grn?.grn_number || '—'} · {r.po?.po_number || ''}</Text></div></div> },
    { title: 'Items', key: 'items', render: (_, r) => (r.items || []).map((i) => `${Number(i.quantity)} × ${i.item_name}`).join(', ') },
    {
      title: 'When', dataIndex: 'stage', key: 'stage',
      render: (v, r) => (v === 'AFTER_INVOICE'
        ? <div><Tag color="purple" style={{ marginInlineEnd: 0 }}>After invoice</Tag><div><Text type="secondary" style={{ fontSize: 12 }}>{r.invoice?.invoice_number}</Text></div></div>
        : <Tag color="cyan" style={{ marginInlineEnd: 0 }}>Before invoice</Tag>)
    },
    { title: 'Amount', key: 'amount', align: 'right', render: (_, r) => <div>{inr(r.total_amount)}{Number(r.gst_amount) > 0 && <div><Text type="secondary" style={{ fontSize: 12 }}>incl. GST {inr(r.gst_amount)}</Text></div>}</div> },
    {
      title: 'Status', key: 'status',
      render: (_, r) => (
        <div>
          <Tag color={STATUS[r.status]?.[1]} style={{ marginInlineEnd: 0 }}>{STATUS[r.status]?.[0] || r.status}</Tag>
          {r.credit_note_number && <div><Text type="secondary" style={{ fontSize: 12 }}>CN {r.credit_note_number} · {fmt(r.credit_note_date)}</Text></div>}
        </div>
      )
    },
    {
      title: '', key: 'action', width: 170,
      render: (_, r) => (r.status === 'AWAITING_CREDIT_NOTE' && canRecordCreditNote
        ? <Button size="small" onClick={() => { setCnRow(r); form.resetFields(); }}>Record credit note</Button>
        : null)
    }
  ];

  return (
    <div>
      <PageHeader
        icon={<Undo2 size={16} />}
        title="Purchase Returns"
        subtitle="Goods sent back to vendors. Record a return from the GRN (Goods Receipt → View → Return to vendor)."
        actions={(
          <Space>
            <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={load}>Refresh</Button>
            <Button type="primary" onClick={() => navigate('/procurement/grn')}>Go to Goods Receipt</Button>
          </Space>
        )}
      />
      <Card style={contentCard} styles={{ body: { padding: 0 } }}
        title={(
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { label: `All (${rows.length})`, value: 'ALL' },
              { label: 'Before invoice', value: 'BEFORE_INVOICE' },
              { label: 'After invoice', value: 'AFTER_INVOICE' },
              { label: `Awaiting credit note (${pending.length})`, value: 'PENDING' }
            ]}
          />
        )}
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={shown}
          columns={columns}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10, showTotal: (t) => `${t} returns` }}
          expandable={{
            // Fixed width so the journal table does not stretch the returns table.
            expandedRowRender: (r) => (
              <div style={{ width: 720, maxWidth: '100%' }}>
                <Text><Text type="secondary">Reason:</Text> {r.reason}</Text>
                {r.created_by_name && <Text type="secondary"> · recorded by {r.created_by_name}</Text>}
                <JournalEntries module="RETURN" id={r.id} refreshKey={r} emptyText={r.stage === 'AFTER_INVOICE' ? 'Posts once the invoice entry is posted (after its match exception is resolved).' : 'Being posted. Refresh in a few seconds.'} />
              </div>
            )
          }}
          locale={{ emptyText: <Empty description="No goods have been returned to vendors" /> }}
        />
      </Card>

      <Modal
        open={!!cnRow}
        title={`Vendor credit note – ${cnRow?.return_number || ''}`}
        onCancel={() => setCnRow(null)}
        onOk={saveCreditNote}
        okText="Save"
        confirmLoading={saving}
        destroyOnClose
      >
        <Text type="secondary">For {inr(cnRow?.total_amount)} returned against invoice {cnRow?.invoice?.invoice_number}. The GST credit reduction is final once the vendor’s credit note is received.</Text>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }} initialValues={{ credit_note_date: dayjs() }}>
          <Form.Item name="credit_note_number" label="Credit note number" rules={[{ required: true, message: 'Enter the vendor credit note number' }]}>
            <Input placeholder="As printed on the vendor's credit note" />
          </Form.Item>
          <Form.Item name="credit_note_date" label="Credit note date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PurchaseReturns;
