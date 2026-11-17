import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Descriptions, Drawer, Form, Input, InputNumber, Modal, Progress, Row, Segmented, Space, Table, Timeline,
  Typography, Upload, message,
} from 'antd';
import { PauseCircle, PlayCircle, RefreshCcw, ShieldCheck, Sparkles, UserPlus, Users2 } from 'lucide-react';
import api from '../../utils/api';
import { AI_ACCEPT, checkUploadFile, historyItems } from '../../utils/documentReview';
import { ArFlow, ArStatus, PageHeader, Tiles } from '../../components/ar/ArShared';
import { card, errorOf, inr } from '../../utils/arFlow';

const { Text } = Typography;
const FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'To verify', value: 'PENDING' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On hold', value: 'ON_HOLD' },
];

const Customers = () => {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [editing, setEditing] = useState(null); // null | {} (new) | customer
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null); // { customer, exposure, suggestion, history }
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [form] = Form.useForm();
  const [verifyForm] = Form.useForm();
  const [holdForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/ar/customers');
      setRows(res?.data?.data || []);
      setMeta(res?.data?.meta || {});
    } catch (e) {
      message.error(errorOf(e, 'Could not load customers'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => (filter === 'ALL' ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);
  const pending = rows.filter((r) => r.status === 'PENDING').length;
  const tiles = [
    { label: 'Customers', value: rows.length, sub: `${rows.filter((r) => r.status === 'ACTIVE').length} active` },
    { label: 'Waiting for verification', value: pending, sub: 'Orders cannot be confirmed until verified', alert: pending > 0 },
    { label: 'On hold', value: rows.filter((r) => r.status === 'ON_HOLD').length, sub: 'New orders stop at the credit check' },
    { label: 'Total outstanding', value: inr(rows.reduce((s, r) => s + r.outstanding, 0)), sub: `${inr(rows.reduce((s, r) => s + r.overdue, 0))} overdue` },
  ];

  const openEdit = (customer) => {
    form.resetFields();
    form.setFieldsValue(customer ? { ...customer, credit_limit: customer.credit_limit === null ? undefined : Number(customer.credit_limit) } : { payment_terms_days: 30 });
    setEditing(customer || {});
  };

  // AI reads a GST certificate, customer PO or letterhead and fills the form.
  const readDocument = async (file) => {
    const problem = checkUploadFile(file);
    if (problem) { message.error(problem); return false; }
    setReading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/ar/orders/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
      const p = res?.data?.data?.party || {};
      const got = {
        customer_name: p.name?.value || undefined, gst_number: p.gst_number?.value || undefined, email: p.email?.value || undefined,
        phone: p.phone?.value || undefined, address: p.address?.value || undefined,
      };
      form.setFieldsValue(Object.fromEntries(Object.entries(got).filter(([, v]) => v)));
      message.success('Filled from the document. Check every field before saving.');
    } catch (e) {
      message.error(errorOf(e, 'Could not read the document. Enter the details manually.'));
    } finally {
      setReading(false);
    }
    return false;
  };

  const save = async () => {
    let v;
    try { v = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const body = { ...v, credit_limit: v.credit_limit ?? null };
      const res = editing?.id ? await api.put(`/ar/customers/${editing.id}`, body) : await api.post('/ar/customers', body);
      message.success(res?.data?.message || 'Saved');
      setEditing(null);
      load();
    } catch (e) {
      message.error(errorOf(e, 'Could not save the customer'));
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id) => {
    try {
      const res = await api.get(`/ar/customers/${id}/credit`);
      setDetail(res?.data?.data);
    } catch (e) {
      message.error(errorOf(e, 'Could not open the customer'));
    }
  };

  const act = async (fn, close) => {
    setSaving(true);
    try {
      const res = await fn();
      message.success(res?.data?.message || 'Done');
      close?.();
      if (detail) await openDetail(detail.customer.id);
      load();
    } catch (e) {
      message.error(errorOf(e, 'Action failed'));
    } finally {
      setSaving(false);
    }
  };

  const openVerify = () => {
    const c = detail.customer;
    verifyForm.setFieldsValue({ credit_limit: c.credit_limit === null ? detail.suggestion?.suggested ?? undefined : Number(c.credit_limit), payment_terms_days: c.payment_terms_days, reason: undefined });
    setVerifyOpen(true);
  };
  const verify = async (action) => {
    const v = await verifyForm.validateFields(action === 'reject' ? ['reason'] : ['credit_limit', 'payment_terms_days']);
    await act(() => api.post(`/ar/customers/${detail.customer.id}/verify`, { action, ...v, credit_limit: v.credit_limit ?? null }), () => setVerifyOpen(false));
  };

  const columns = [
    { title: 'Customer', dataIndex: 'customer_name', render: (v, r) => <Space direction="vertical" size={0}><Text strong>{v}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.gst_number || 'No GSTIN'}</Text></Space> },
    { title: 'Terms', dataIndex: 'payment_terms_days', render: (v) => `${v} days` },
    { title: 'Credit limit', dataIndex: 'credit_limit', align: 'right', render: (v) => (v === null ? <Text type="secondary">Not set</Text> : inr(v)) },
    { title: 'Outstanding', dataIndex: 'outstanding', align: 'right', render: (v, r) => <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}><Text strong>{inr(v)}</Text>{r.overdue > 0 && <Text type="danger" style={{ fontSize: 12 }}>{inr(r.overdue)} overdue · {r.oldest_overdue_days}d</Text>}</Space> },
    { title: 'Limit used', dataIndex: 'credit_used_percent', width: 150, render: (v) => (v === null ? <Text type="secondary">—</Text> : <Progress percent={Math.min(v, 100)} size="small" status={v > 100 ? 'exception' : 'normal'} format={() => `${v}%`} />) },
    { title: 'Status', dataIndex: 'status', render: (v) => <ArStatus status={v} /> },
    { title: '', key: 'open', render: (_, r) => <Button type="link" onClick={() => openDetail(r.id)}>{r.can_verify ? 'Verify' : 'Open'}</Button> },
  ];

  const c = detail?.customer;
  const x = detail?.exposure;
  const s = detail?.suggestion;

  return (
    <div>
      <ArFlow active={['customer']} />
      <PageHeader
        icon={<Users2 size={24} />}
        title="Customers"
        subtitle="Add customers, set payment terms and credit limits, and verify them before orders are confirmed"
        actions={[
          <Button key="r" icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>,
          <Button key="n" type="primary" icon={<UserPlus size={16} />} onClick={() => openEdit(null)}>New customer</Button>,
        ]}
      />
      <Tiles tiles={tiles} />
      <Card style={card} styles={{ body: { padding: 0 } }} title={<Segmented value={filter} onChange={setFilter} options={FILTERS} />}>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={visible} scroll={{ x: 'max-content' }} pagination={{ pageSize: 15, hideOnSinglePage: true }} />
      </Card>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        width={Math.min(720, window.innerWidth)}
        title={editing?.id ? `Edit ${editing.customer_name}` : 'New customer'}
        destroyOnClose
        extra={<Button type="primary" loading={saving} onClick={save}>Save</Button>}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {!editing?.id && (
            <Alert
              type="info" showIcon icon={<Sparkles size={16} />}
              message="Fill from a document"
              description="Upload the customer's GST certificate, purchase order or letterhead and AI fills the name, GSTIN and contact details. Check them before saving."
              action={<Upload accept={AI_ACCEPT} showUploadList={false} beforeUpload={readDocument}><Button loading={reading}>Upload</Button></Upload>}
            />
          )}
          {editing?.id && editing.status === 'ACTIVE' && !meta.can_approve && (
            <Alert type="warning" showIcon message="Changing the name, GSTIN, PAN or credit limit sends the customer back for verification." />
          )}
          <Form form={form} layout="vertical">
            <Row gutter={12}>
              <Col xs={24} md={12}><Form.Item name="customer_name" label="Customer name" rules={[{ required: true, message: 'Required' }]}><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="contact_person" label="Contact person"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="gst_number" label="GSTIN" extra="Decides IGST or CGST + SGST on invoices"><Input maxLength={15} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="pan" label="PAN" extra="Taken from the GSTIN if left empty"><Input maxLength={10} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="email" label="Email (invoices and reminders)"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="address" label="Billing address"><Input.TextArea rows={2} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="shipping_address" label="Delivery address"><Input.TextArea rows={2} /></Form.Item></Col>
              <Col xs={12}><Form.Item name="payment_terms_days" label="Payment terms (days)" rules={[{ required: true, message: 'Required' }]} extra="Sets the due date on each invoice"><InputNumber style={{ width: '100%' }} min={0} max={365} precision={0} /></Form.Item></Col>
              <Col xs={12}><Form.Item name="credit_limit" label="Credit limit" extra="Leave empty for no limit. An approver confirms it."><InputNumber style={{ width: '100%' }} min={0} prefix="₹" /></Form.Item></Col>
            </Row>
          </Form>
        </Space>
      </Drawer>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        width={Math.min(760, window.innerWidth)}
        title={c ? <Space>{c.customer_name}<ArStatus status={c.status} /></Space> : ''}
        extra={c && (
          <Space>
            <Button onClick={() => openEdit(c)}>Edit</Button>
            {c.status === 'ACTIVE' && <Button danger icon={<PauseCircle size={15} />} onClick={() => { holdForm.resetFields(); setHoldOpen(true); }}>Put on hold</Button>}
            {c.status === 'ON_HOLD' && meta.can_approve && <Button icon={<PlayCircle size={15} />} loading={saving} onClick={() => act(() => api.post(`/ar/customers/${c.id}/hold`, { hold: false }))}>Remove hold</Button>}
            {c.status === 'PENDING' && meta.can_approve && <Button type="primary" icon={<ShieldCheck size={15} />} onClick={openVerify}>Verify</Button>}
          </Space>
        )}
      >
        {c && (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {c.status === 'PENDING' && <Alert type="warning" showIcon message="Waiting for verification" description={meta.can_approve ? 'Check the details and the credit limit, then verify. The person who added the customer cannot verify it.' : 'Finance or the Director / CFO verifies the customer and approves the credit limit.'} />}
            {c.status === 'ON_HOLD' && <Alert type="error" showIcon message={`On hold: ${c.hold_reason || 'no reason given'}`} />}
            {c.status === 'REJECTED' && <Alert type="error" showIcon message={`Rejected: ${c.hold_reason || ''}`} />}
            <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
              <Descriptions.Item label="GSTIN">{c.gst_number || '—'}</Descriptions.Item>
              <Descriptions.Item label="PAN">{c.pan || '—'}</Descriptions.Item>
              <Descriptions.Item label="Contact">{c.contact_person || '—'}</Descriptions.Item>
              <Descriptions.Item label="Email">{c.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Payment terms">{c.payment_terms_days} days</Descriptions.Item>
              <Descriptions.Item label="Credit limit">{c.credit_limit === null ? 'Not set' : inr(c.credit_limit)}</Descriptions.Item>
            </Descriptions>
            <Card size="small" title="Credit position" style={{ borderRadius: 12 }}>
              <Row gutter={[12, 12]}>
                <Col xs={12} md={6}><Text type="secondary">Owed now</Text><div style={{ fontWeight: 700 }}>{inr(x.outstanding)}</div></Col>
                <Col xs={12} md={6}><Text type="secondary">Overdue</Text><div style={{ fontWeight: 700, color: x.overdue > 0 ? '#cf1322' : undefined }}>{inr(x.overdue)}{x.oldest_overdue_days > 0 ? ` · ${x.oldest_overdue_days}d` : ''}</div></Col>
                <Col xs={12} md={6}><Text type="secondary">On open orders</Text><div style={{ fontWeight: 700 }}>{inr(x.open_orders)}</div></Col>
                <Col xs={12} md={6}><Text type="secondary">Credit available</Text><div style={{ fontWeight: 700 }}>{c.credit_limit === null ? 'No limit set' : inr(Number(c.credit_limit) - x.outstanding - x.open_orders)}</div></Col>
              </Row>
            </Card>
            <Alert
              type="info" showIcon icon={<Sparkles size={16} />}
              message={s?.suggested ? `Suggested credit limit: ${inr(s.suggested)}` : 'No credit limit suggestion yet'}
              description={`${s?.basis || ''} This is worked out from the customer's invoices and payments in LedgerLine; an approver decides the limit.`}
            />
            <div>
              <Text strong>History</Text>
              <Timeline style={{ marginTop: 12 }} items={historyItems(detail.history)} />
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        open={verifyOpen} title={`Verify ${c?.customer_name || ''}`} onCancel={() => setVerifyOpen(false)} destroyOnClose
        footer={[
          <Button key="x" danger loading={saving} onClick={() => verify('reject')}>Reject</Button>,
          <Button key="ok" type="primary" loading={saving} onClick={() => verify('approve')}>Verify customer</Button>,
        ]}
      >
        <Form form={verifyForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}><Form.Item name="credit_limit" label="Credit limit" extra={s?.suggested ? `Suggested: ${inr(s.suggested)}` : 'Leave empty for no limit'}><InputNumber style={{ width: '100%' }} min={0} prefix="₹" /></Form.Item></Col>
            <Col span={12}><Form.Item name="payment_terms_days" label="Payment terms (days)" rules={[{ required: true, message: 'Required' }]}><InputNumber style={{ width: '100%' }} min={0} max={365} precision={0} /></Form.Item></Col>
          </Row>
          <Form.Item name="reason" label="Reason (only if rejecting)" rules={[{ required: true, message: 'Give a reason for rejecting' }]}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        open={holdOpen} title="Put customer on hold" okText="Put on hold" okButtonProps={{ danger: true }} confirmLoading={saving} destroyOnClose
        onCancel={() => setHoldOpen(false)}
        onOk={async () => { const v = await holdForm.validateFields(); await act(() => api.post(`/ar/customers/${c.id}/hold`, { hold: true, reason: v.reason }), () => setHoldOpen(false)); }}
      >
        <Alert style={{ marginBottom: 12 }} type="info" showIcon message="New orders for this customer will stop at the credit check until Finance or the Director / CFO removes the hold." />
        <Form form={holdForm} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Give a reason' }]}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Customers;
