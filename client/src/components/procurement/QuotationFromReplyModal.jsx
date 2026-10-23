import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Col, DatePicker, Descriptions, Input, InputNumber, Modal, Row, Space, Spin, Table, Typography, message,
} from 'antd';
import { ExternalLink, Plus, Sparkles, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { ChecksPanel } from '../finance/DocumentReview';

const { Text } = Typography;
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Fill a vendor's quotation from their reply email (AI pre-fill), review it, and record it.
 * Saves through the RFQ "record response" endpoint, so it becomes a normal quotation.
 */
const QuotationFromReplyModal = ({ open, rfqId, messageId, vendorName, onClose, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [header, setHeader] = useState({});

  useEffect(() => {
    if (!open || !rfqId || !messageId) return;
    setLoading(true);
    setError(null);
    setData(null);
    api.post(`/rfqs/${rfqId}/replies/${encodeURIComponent(messageId)}/quotation-draft`, {}, { timeout: 180000 })
      .then((res) => {
        const d = res?.data?.data;
        setData(d);
        setItems((d.draft.items.length ? d.draft.items : d.rfq_items.map((it) => ({ ...it, unit_price: null, tax_percent: null })))
          .map((it, i) => ({ key: i, item_name: it.item_name, quantity: it.quantity, unit: it.unit, unit_price: it.unit_price, tax_percent: it.tax_percent, vendor_description: it.vendor_description })));
        setHeader({
          vendor_quote_ref: d.draft.vendor_quote_ref,
          valid_until: d.draft.valid_until ? dayjs(d.draft.valid_until) : null,
          discount_amount: d.draft.discount_amount || 0,
          shipping_charges: d.draft.shipping_charges || 0,
          tax_amount: d.draft.tax_amount,
          delivery_terms: d.draft.delivery_terms,
          payment_terms: d.draft.payment_terms,
          warranty: d.draft.warranty,
          notes: d.draft.notes,
        });
      })
      .catch((e) => setError(e?.response?.data || { message: 'Could not read the reply' }))
      .finally(() => setLoading(false));
  }, [open, rfqId, messageId]);

  const setItem = (key, field, value) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)));
  const subtotal = useMemo(() => round2(items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0)), [items]);
  const lineTax = useMemo(() => round2(items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0) * Number(it.tax_percent || 0) / 100, 0)), [items]);
  const tax = header.tax_amount === null || header.tax_amount === undefined ? lineTax : Number(header.tax_amount);
  const net = round2(subtotal - Number(header.discount_amount || 0) + tax + Number(header.shipping_charges || 0));
  const blocking = items.length === 0 || items.some((it) => !it.item_name || !(Number(it.quantity) > 0) || it.unit_price === null || it.unit_price === undefined);

  const save = async () => {
    setSaving(true);
    try {
      const remarks = [
        header.vendor_quote_ref && `Vendor quote ref: ${header.vendor_quote_ref}`,
        header.delivery_terms && `Delivery: ${header.delivery_terms}`,
        header.payment_terms && `Payment terms: ${header.payment_terms}`,
        header.warranty && `Warranty: ${header.warranty}`,
        header.notes && `Notes: ${header.notes}`,
        `Filled from ${data.email.from}'s email "${data.email.subject}" (${new Date(data.email.received_at).toLocaleString('en-IN')})`,
      ].filter(Boolean).join('\n');
      const res = await api.post(`/rfqs/${rfqId}/vendors/${data.vendor_id}/response`, {
        items: items.map((it) => ({ item_name: it.item_name, quantity: Number(it.quantity), unit_price: Number(it.unit_price), tax_percent: Number(it.tax_percent || 0) })),
        valid_until: header.valid_until ? header.valid_until.format('YYYY-MM-DD') : null,
        currency: data.draft.currency || 'INR',
        tax_amount: round2(tax),
        discount_amount: Number(header.discount_amount || 0),
        shipping_charges: Number(header.shipping_charges || 0),
        remarks,
        source_email: { message_id: data.email.message_id, subject: data.email.subject, from: data.email.from, received_at: data.email.received_at, web_link: data.email.web_link, read_from: data.source },
      });
      message.success(`Quotation ${res?.data?.data?.quotation_number || ''} recorded for ${data.vendor_name}`);
      onSaved?.(res?.data?.data);
      onClose();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not record the quotation');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Item', dataIndex: 'item_name', render: (v, r) => (
      <div>
        <Input value={v} onChange={(e) => setItem(r.key, 'item_name', e.target.value)} />
        {r.vendor_description && r.vendor_description !== v && <Text type="secondary" style={{ fontSize: 11 }}>Vendor wrote: {r.vendor_description}</Text>}
      </div>
    ) },
    { title: 'Qty', dataIndex: 'quantity', width: 90, render: (v, r) => <InputNumber min={0} value={v} onChange={(x) => setItem(r.key, 'quantity', x)} style={{ width: '100%' }} /> },
    { title: 'Unit', dataIndex: 'unit', width: 80, render: (v, r) => <Input value={v} onChange={(e) => setItem(r.key, 'unit', e.target.value)} /> },
    { title: 'Unit price', dataIndex: 'unit_price', width: 130, render: (v, r) => <InputNumber min={0} value={v} status={v === null || v === undefined ? 'warning' : undefined} onChange={(x) => setItem(r.key, 'unit_price', x)} style={{ width: '100%' }} prefix="₹" /> },
    { title: 'GST %', dataIndex: 'tax_percent', width: 85, render: (v, r) => <InputNumber min={0} max={100} value={v} onChange={(x) => setItem(r.key, 'tax_percent', x)} style={{ width: '100%' }} /> },
    { title: 'Amount', key: 'amount', width: 120, align: 'right', render: (_, r) => inr(Number(r.quantity || 0) * Number(r.unit_price || 0)) },
    { title: '', key: 'x', width: 40, render: (_, r) => <Button type="text" danger icon={<Trash2 size={14} />} onClick={() => setItems((prev) => prev.filter((it) => it.key !== r.key))} /> },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={Math.min(1000, window.innerWidth - 24)}
      title={<Space><Sparkles size={16} />Fill quotation from {vendorName || data?.vendor_name || 'vendor'}'s reply</Space>}
      okText="Record quotation"
      onOk={save}
      confirmLoading={saving}
      okButtonProps={{ disabled: !data || blocking || !data.draft }}
      destroyOnClose
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
          <div style={{ marginTop: 12 }}><Text type="secondary">Reading the vendor's quotation with AI…</Text></div>
        </div>
      )}
      {error && <Alert type="error" showIcon message="Could not fill the quotation" description={error.message} />}
      {data && (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
            <Descriptions.Item label="RFQ">{data.rfq_number}</Descriptions.Item>
            <Descriptions.Item label="Vendor">{data.vendor_name}</Descriptions.Item>
            <Descriptions.Item label="Email">
              {data.email.subject}
              {data.email.web_link && <Button type="link" size="small" icon={<ExternalLink size={12} />} href={data.email.web_link} target="_blank" rel="noopener noreferrer">Open</Button>}
            </Descriptions.Item>
            <Descriptions.Item label="Read from">{data.source}</Descriptions.Item>
          </Descriptions>
          {!data.draft.is_quotation && (
            <Alert type="warning" showIcon message="No prices found in this reply" description="The vendor may not have sent their quotation yet. Enter the prices yourself, or wait for their quotation." />
          )}
          {data.draft.uncertain.length > 0 && (
            <Alert type="info" showIcon message="AI notes" description={<ul style={{ margin: 0, paddingLeft: 18 }}>{data.draft.uncertain.map((u, i) => <li key={i}>{u}</li>)}</ul>} />
          )}
          <ChecksPanel checks={data.checks} />

          <Table size="small" rowKey="key" pagination={false} columns={columns} dataSource={items} scroll={{ x: 760 }} />
          <Button size="small" icon={<Plus size={13} />} onClick={() => setItems((prev) => [...prev, { key: Date.now(), item_name: '', quantity: 1, unit: '', unit_price: null, tax_percent: null }])}>Add line</Button>

          <Row gutter={12}>
            <Col xs={24} md={8}><Text type="secondary">Vendor quote ref</Text><Input value={header.vendor_quote_ref} onChange={(e) => setHeader({ ...header, vendor_quote_ref: e.target.value })} /></Col>
            <Col xs={12} md={8}><Text type="secondary">Valid until</Text><DatePicker value={header.valid_until} onChange={(v) => setHeader({ ...header, valid_until: v })} style={{ width: '100%' }} format="DD MMM YYYY" /></Col>
            <Col xs={12} md={8}><Text type="secondary">Discount</Text><InputNumber min={0} value={header.discount_amount} onChange={(v) => setHeader({ ...header, discount_amount: v })} style={{ width: '100%' }} prefix="₹" /></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12} md={8}><Text type="secondary">Shipping</Text><InputNumber min={0} value={header.shipping_charges} onChange={(v) => setHeader({ ...header, shipping_charges: v })} style={{ width: '100%' }} prefix="₹" /></Col>
            <Col xs={12} md={8}>
              <Text type="secondary">Total GST</Text>
              <InputNumber min={0} value={header.tax_amount} placeholder={String(lineTax)} onChange={(v) => setHeader({ ...header, tax_amount: v })} style={{ width: '100%' }} prefix="₹" />
            </Col>
            <Col xs={24} md={8} style={{ textAlign: 'right', paddingTop: 4 }}>
              <div><Text type="secondary">Items {inr(subtotal)} · GST {inr(tax)}</Text></div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Net {inr(net)}</div>
              {data.draft.grand_total != null && Math.abs(data.draft.grand_total - net) > 1 && (
                <Text type="warning" style={{ fontSize: 12 }}>Vendor's total was {inr(data.draft.grand_total)}</Text>
              )}
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={8}><Text type="secondary">Delivery terms</Text><Input value={header.delivery_terms} onChange={(e) => setHeader({ ...header, delivery_terms: e.target.value })} /></Col>
            <Col xs={24} md={8}><Text type="secondary">Payment terms</Text><Input value={header.payment_terms} onChange={(e) => setHeader({ ...header, payment_terms: e.target.value })} /></Col>
            <Col xs={24} md={8}><Text type="secondary">Warranty</Text><Input value={header.warranty} onChange={(e) => setHeader({ ...header, warranty: e.target.value })} /></Col>
          </Row>
          {blocking && <Text type="danger" style={{ fontSize: 12 }}>Every line needs an item name, a quantity and a unit price before recording.</Text>}
        </Space>
      )}
    </Modal>
  );
};

export default QuotationFromReplyModal;
