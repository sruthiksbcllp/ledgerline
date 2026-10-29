import React, { useEffect, useMemo, useState } from 'react';
import { Alert, DatePicker, Form, Input, InputNumber, Modal, Table, Typography, message } from 'antd';
import dayjs from 'dayjs';
import api from '../../utils/api';

/**
 * Return goods on a GRN to the vendor. Shows what each line can still be returned and which entry
 * the return will post: before the GRN is invoiced it reverses the receipt (Dr GR/IR, Cr Inventory /
 * Expense); after, it reduces the invoice (Dr Vendor, Cr Inventory / Expense, Cr Input GST).
 *
 *   <ReturnToVendorModal grn={grn} open onClose={...} onSaved={...} />
 */

const { Text } = Typography;
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ReturnToVendorModal = ({ grn, open, onClose, onSaved }) => {
  const [info, setInfo] = useState(null);
  const [qty, setQty] = useState({});
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open || !grn?.id) return;
    setInfo(null); setQty({}); form.resetFields();
    api.get(`/purchase-returns/grn/${grn.id}`)
      .then((r) => setInfo(r.data?.data || null))
      .catch((e) => { message.error(e?.response?.data?.message || 'Could not load the GRN'); onClose?.(); });
  }, [open, grn?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => Math.round((info?.lines || []).reduce((s, l) => s + Number(qty[l.grn_item_id] || 0) * Number(l.unit_price || 0), 0) * 100) / 100, [info, qty]);
  const afterInvoice = info?.stage === 'AFTER_INVOICE';
  const gst = afterInvoice ? Math.round(value * Number(info?.invoice?.gst_ratio || 0) * 100) / 100 : 0;

  const submit = async () => {
    const values = await form.validateFields();
    const items = (info?.lines || []).map((l) => ({ grn_item_id: l.grn_item_id, quantity: Number(qty[l.grn_item_id] || 0) })).filter((i) => i.quantity > 0);
    if (!items.length) return message.error('Enter the quantity being returned for at least one item');
    setSaving(true);
    try {
      const res = await api.post('/purchase-returns', { grn_id: grn.id, items, reason: values.reason, return_date: values.return_date?.format('YYYY-MM-DD') });
      message.success(res.data?.message || 'Return recorded');
      onSaved?.(res.data?.data);
      onClose?.();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Return could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Item', dataIndex: 'item_name', key: 'item' },
    { title: 'Accepted', dataIndex: 'accepted_quantity', key: 'acc', align: 'right', width: 90 },
    { title: 'Returned', dataIndex: 'returned_quantity', key: 'ret', align: 'right', width: 90, render: (v) => (Number(v) > 0 ? <Text type="warning">{v}</Text> : 0) },
    {
      title: 'Return now', key: 'now', width: 120,
      render: (_, l) => (
        <InputNumber
          min={0}
          max={l.returnable_quantity}
          value={qty[l.grn_item_id]}
          disabled={!(l.returnable_quantity > 0)}
          placeholder={`max ${l.returnable_quantity}`}
          style={{ width: '100%' }}
          onChange={(v) => setQty((q) => ({ ...q, [l.grn_item_id]: v }))}
        />
      )
    },
    { title: 'PO price', dataIndex: 'unit_price', key: 'price', align: 'right', width: 110, render: inr },
    { title: 'Value', key: 'value', align: 'right', width: 120, render: (_, l) => inr(Number(qty[l.grn_item_id] || 0) * Number(l.unit_price || 0)) }
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText="Record return"
      confirmLoading={saving}
      okButtonProps={{ disabled: !info || !(value > 0) }}
      width={820}
      title={`Return to vendor – ${info?.grn_number || grn?.grn_number || ''}`}
      destroyOnClose
    >
      {info && (
        <>
          <Alert
            type={afterInvoice ? 'warning' : 'info'}
            showIcon
            style={{ marginBottom: 12 }}
            message={afterInvoice
              ? `Invoice ${info.invoice.invoice_number} is already booked on this GRN`
              : 'This GRN has not been invoiced yet'}
            description={afterInvoice
              ? 'The return comes off that invoice (value plus its GST), so the vendor is owed less. Ask the vendor for a credit note.'
              : 'The return reverses the goods receipt. The vendor’s invoice should be for the quantity kept.'}
          />
          <Table rowKey="grn_item_id" size="small" pagination={false} dataSource={info.lines} columns={columns} scroll={{ x: 'max-content' }} />
          <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ return_date: dayjs() }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Form.Item name="return_date" label="Return date" style={{ width: 180 }} rules={[{ required: true, message: 'Required' }]}>
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
              </Form.Item>
              <Form.Item name="reason" label="Reason" style={{ flex: 1 }} rules={[{ required: true, message: 'Give a reason for the return' }]}>
                <Input placeholder="e.g. Damaged in transit, wrong model supplied" />
              </Form.Item>
            </div>
          </Form>
          {value > 0 && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
              <Text strong>Journal entry on save</Text>
              <Table
                size="small"
                pagination={false}
                style={{ marginTop: 8 }}
                rowKey="k"
                dataSource={afterInvoice
                  ? [
                    { k: 'v', acct: 'Dr Accounts payable – vendor', debit: value + gst, credit: 0 },
                    { k: 'c', acct: 'Cr Inventory / Expense (as received)', debit: 0, credit: value },
                    ...(gst > 0 ? [{ k: 'g', acct: 'Cr Input GST', debit: 0, credit: gst }] : [])
                  ]
                  : [
                    { k: 'r', acct: 'Dr GR/IR clearing', debit: value, credit: 0 },
                    { k: 'c', acct: 'Cr Inventory / Expense (as received)', debit: 0, credit: value }
                  ]}
                columns={[
                  { title: 'Account', dataIndex: 'acct', key: 'acct', render: (v) => <Text style={{ paddingLeft: v.startsWith('Cr') ? 20 : 0 }}>{v}</Text> },
                  { title: 'Debit', dataIndex: 'debit', key: 'd', align: 'right', width: 130, render: (v) => (v ? inr(v) : '') },
                  { title: 'Credit', dataIndex: 'credit', key: 'c', align: 'right', width: 130, render: (v) => (v ? inr(v) : '') }
                ]}
              />
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default ReturnToVendorModal;
