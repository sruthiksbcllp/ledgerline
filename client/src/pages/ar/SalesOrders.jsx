import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Table, Tabs,
  Timeline, Typography, Upload, message,
} from 'antd';
import { ClipboardList, FilePlus2, PackageCheck, Plus, RefreshCcw, Sparkles, Trash2, Truck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { AI_ACCEPT, checkUploadFile } from '../../utils/documentReview';
import { getStoredUser, hasPerm } from '../../utils/session';
import { ArStatus, ArTasks, JournalLines, PageHeader, Tiles, arHistoryItems, useOpenParam } from '../../components/ar/ArShared';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;
const ORDER_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Quotations', value: 'QUOTATION' },
  { label: 'Credit hold', value: 'CREDIT_HOLD' },
  { label: 'To deliver', value: 'TO_DELIVER' },
  { label: 'To invoice', value: 'TO_INVOICE' },
  { label: 'Invoiced', value: 'CLOSED' },
];
const blankItem = () => ({ description: '', hsn_code: '', quantity: 1, rate: undefined, discount_percent: 0, gst_percent: 18 });
/** Line value after its discount (GST is charged on this). */
const lineNet = (l) => Number(l?.quantity || 0) * Math.round(Number(l?.rate || 0) * (1 - Number(l?.discount_percent || 0) / 100) * 100) / 100;

/** What the credit check found, in words. Shown on a quotation (preview) and on a confirmed or held order. */
const CreditPanel = ({ check, preview }) => {
  if (!check) return null;
  const rows = [
    ['Owed now', inr(check.outstanding)], ['On other open orders', inr(check.open_orders)], ['This order', inr(check.order_total)],
    ['Total if confirmed', inr(check.exposure_after)], ['Credit limit', check.credit_limit === null ? 'Not set' : inr(check.credit_limit)],
  ];
  return (
    <Alert
      type={check.passed ? 'success' : 'error'} showIcon
      message={preview ? (check.passed ? 'Credit check would pass' : 'Credit check would put this order on hold') : (check.passed ? 'Credit check passed' : 'Credit check failed: order on hold')}
      description={(
        <div>
          {!check.passed && <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{check.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <Space size={[16, 4]} wrap>{rows.map(([k, v]) => <Text key={k} style={{ fontSize: 12 }}><Text type="secondary" style={{ fontSize: 12 }}>{k}: </Text>{v}</Text>)}</Space>
          {!check.passed && !preview && check.release_needs && <div style={{ marginTop: 6 }}><Text style={{ fontSize: 12 }}>Release needs {check.release_needs}, and not the person who raised the order.</Text></div>}
        </div>
      )}
    />
  );
};

const SalesOrders = () => {
  const navigate = useNavigate();
  // Each step's buttons follow its permission section (server/config/rbac.js): quotations and orders
  // (AR_ORDER), dispatch and proof of delivery (AR_DELIVERY, Warehouse), invoicing (AR). Releasing a
  // credit hold follows the approval limit (can_release from the server). A Requester only raises
  // quotations and follows their own; Accounts Receivable confirms them as orders.
  const user = getStoredUser();
  const canQuote = hasPerm(user, 'AR_ORDER', 'ADD');
  const canChangeOrder = hasPerm(user, 'AR_ORDER', 'EDIT');
  const canAddCustomer = hasPerm(user, 'AR_CUSTOMER', 'ADD');
  const canSeeDeliveries = hasPerm(user, 'AR_DELIVERY', 'VIEW');
  const canShip = hasPerm(user, 'AR_DELIVERY', 'ADD');
  const canConfirmDelivery = hasPerm(user, 'AR_DELIVERY', 'EDIT');
  const canSeeInvoices = hasPerm(user, 'AR', 'VIEW');
  const canBill = hasPerm(user, 'AR', 'ADD');
  const newLabel = canChangeOrder ? 'New quotation / order' : 'New quotation';
  const [params, setParams] = useSearchParams();
  const tab = canSeeDeliveries && params.get('tab') === 'deliveries' ? 'deliveries' : 'orders';
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({});
  const [deliveries, setDeliveries] = useState([]);
  const [dSummary, setDSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [customers, setCustomers] = useState([]);
  const [busy, setBusy] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [source, setSource] = useState(null);
  const [form] = Form.useForm();
  const watchedItems = Form.useWatch('items', form);
  const items = useMemo(() => watchedItems || [], [watchedItems]);

  const [detail, setDetail] = useState(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchQty, setDispatchQty] = useState({});
  const [podFor, setPodFor] = useState(null);
  const [invoiceFor, setInvoiceFor] = useState(null); // { delivery, preview }
  const [reasonFor, setReasonFor] = useState(null); // { title, label, ok, run }
  const [dispatchForm] = Form.useForm();
  const [podForm] = Form.useForm();
  const [reasonForm] = Form.useForm();
  const [invoiceForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, d] = await Promise.all([api.get('/ar/orders'), canSeeDeliveries ? api.get('/ar/deliveries') : null]);
      setOrders(o?.data?.data || []);
      setSummary(o?.data?.summary || {});
      setDeliveries(d?.data?.data || []);
      setDSummary(d?.data?.summary || {});
    } catch (e) {
      message.error(errorOf(e, 'Could not load sales orders'));
    } finally {
      setLoading(false);
    }
  }, [canSeeDeliveries]);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === 'ALL') return orders;
    if (filter === 'TO_DELIVER') return orders.filter((o) => ['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(o.status));
    if (filter === 'TO_INVOICE') return orders.filter((o) => o.status !== 'CANCELLED' && o.items.some((it) => it.to_invoice > 0));
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, l) => s + lineNet(l), 0);
    const tax = items.reduce((s, l) => s + (lineNet(l) * Number(l?.gst_percent || 0)) / 100, 0);
    return { subtotal, tax, total: subtotal + tax };
  }, [items]);

  // ── New quotation / order ───────────────────────────────────────────────────
  const openNew = async () => {
    form.resetFields();
    form.setFieldsValue({ order_date: dayjs(), items: [blankItem()] });
    setSource(null);
    setNewOpen(true);
    const res = await api.get('/ar/customers').catch(() => null);
    setCustomers((res?.data?.data || []).filter((c) => c.status !== 'REJECTED'));
  };

  const readPo = async (file) => {
    const problem = checkUploadFile(file);
    if (problem) { message.error(problem); return false; }
    setReading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/ar/orders/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
      const d = res?.data?.data || {};
      form.setFieldsValue({
        customer_id: d.matches?.customer?.id || undefined,
        customer_po_number: d.customer_po_number || undefined,
        items: d.items?.length ? d.items.map((l) => ({ description: l.description, hsn_code: l.hsn_code || '', quantity: Number(l.quantity || 1), rate: Number(l.rate || 0), discount_percent: Number(l.discount_percent || 0), gst_percent: Number(l.gst_percent || 0) })) : [blankItem()],
      });
      setSource(file.name);
      if (d.matches?.customer) message.success(`Read ${d.items?.length || 0} item${d.items?.length === 1 ? '' : 's'} for ${d.matches.customer.customer_name}. Check them before saving.`);
      else message.warning(`Read ${d.items?.length || 0} item${d.items?.length === 1 ? '' : 's'}, but ${d.party?.name?.value || 'the customer'} is not in Customers yet. Add the customer first, or choose one.`);
    } catch (e) {
      message.error(errorOf(e, 'Could not read the document. Enter the order manually.'));
    } finally {
      setReading(false);
    }
    return false;
  };

  const saveNew = async (as) => {
    let v;
    try { v = await form.validateFields(); } catch { return; }
    setBusy(true);
    try {
      const res = await api.post('/ar/orders', {
        customer_id: v.customer_id, as, order_date: v.order_date?.format('YYYY-MM-DD'), customer_po_number: v.customer_po_number, notes: v.notes,
        items: v.items, source: source ? 'AI_EXTRACTED' : 'MANUAL', source_file_name: source,
      });
      const held = res?.data?.data?.status === 'CREDIT_HOLD';
      (held ? message.warning : message.success)(res?.data?.message || 'Saved');
      setNewOpen(false);
      load();
      if (held) openDetail(res.data.data.id);
    } catch (e) {
      message.error(errorOf(e, 'Could not save'));
    } finally {
      setBusy(false);
    }
  };

  // ── Detail and actions ──────────────────────────────────────────────────────
  const openDetail = async (id) => {
    try {
      const res = await api.get(`/ar/orders/${id}`);
      setDetail(res?.data?.data);
    } catch (e) {
      message.error(errorOf(e, 'Could not open the order'));
    }
  };
  useOpenParam(openDetail);
  const act = async (fn, after) => {
    setBusy(true);
    try {
      const res = await fn();
      const held = res?.data?.data?.status === 'CREDIT_HOLD';
      (held ? message.warning : message.success)(res?.data?.message || 'Done');
      after?.(res);
      if (detail) await openDetail(detail.id);
      load();
      return true;
    } catch (e) {
      message.error(errorOf(e, 'Action failed'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const askReason = (cfg) => { reasonForm.resetFields(); setReasonFor(cfg); };

  const openDispatch = () => {
    setDispatchQty(Object.fromEntries(detail.items.map((it) => [it.id, it.to_deliver])));
    dispatchForm.resetFields();
    dispatchForm.setFieldsValue({ dispatch_date: dayjs() });
    setDispatchOpen(true);
  };
  const dispatch = async () => {
    const v = await dispatchForm.validateFields();
    const lines = Object.entries(dispatchQty).filter(([, q]) => Number(q) > 0).map(([id, q]) => ({ order_item_id: Number(id), quantity: Number(q) }));
    if (!lines.length) { message.error('Enter the quantity dispatched for at least one item'); return; }
    await act(() => api.post(`/ar/orders/${detail.id}/deliveries`, { ...v, dispatch_date: v.dispatch_date?.format('YYYY-MM-DD'), items: lines }), () => setDispatchOpen(false));
  };

  const openPod = (delivery) => { podForm.resetFields(); podForm.setFieldsValue({ delivered_date: dayjs() }); setPodFor(delivery); };
  const confirmPod = async () => {
    const v = await podForm.validateFields();
    await act(() => api.post(`/ar/deliveries/${podFor.id}/confirm`, { ...v, delivered_date: v.delivered_date?.format('YYYY-MM-DD') }), () => setPodFor(null));
  };

  const openInvoice = async (delivery) => {
    try {
      const res = await api.get(`/ar/deliveries/${delivery.id}/invoice-preview`);
      invoiceForm.setFieldsValue({ invoice_date: dayjs() });
      setInvoiceFor({ delivery, preview: res?.data?.data });
    } catch (e) {
      message.error(errorOf(e, 'Could not prepare the invoice'));
    }
  };
  // The due date counts from the invoice date chosen in the window.
  const previewForDate = async (date) => {
    if (!invoiceFor || !date) return;
    try {
      const res = await api.get(`/ar/deliveries/${invoiceFor.delivery.id}/invoice-preview`, { params: { invoice_date: date.format('YYYY-MM-DD') } });
      setInvoiceFor((cur) => (cur ? { ...cur, preview: res?.data?.data } : cur));
    } catch { /* keep the last preview */ }
  };
  const raiseInvoice = async () => {
    const v = await invoiceForm.validateFields();
    await act(() => api.post(`/ar/deliveries/${invoiceFor.delivery.id}/invoice`, { invoice_date: v.invoice_date?.format('YYYY-MM-DD') }), () => setInvoiceFor(null));
  };

  const orderColumns = [
    { title: 'Number', key: 'number', render: (_, r) => <Space direction="vertical" size={0}><Typography.Link strong onClick={() => openDetail(r.id)}>{r.number}</Typography.Link>{r.order_number && <Text type="secondary" style={{ fontSize: 12 }}>{r.quotation_number}</Text>}</Space> },
    { title: 'Customer', key: 'customer', render: (_, r) => r.customer?.customer_name || '—' },
    { title: 'Date', dataIndex: 'order_date', render: fmt },
    { title: 'Customer PO', dataIndex: 'customer_po_number', render: (v) => v || '—' },
    { title: 'Total', dataIndex: 'total_amount', align: 'right', render: (v) => <Text strong>{inr(v)}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v, r) => <Space size={6}><ArStatus status={v} />{r.can_release && <Text type="danger" style={{ fontSize: 12 }}>needs your release</Text>}</Space> },
    { title: '', key: 'open', fixed: 'right', width: 80, render: (_, r) => <Button type="link" onClick={() => openDetail(r.id)}>Open</Button> },
  ];
  const deliveryColumns = [
    { title: 'Delivery', dataIndex: 'delivery_number', render: (v) => <Text strong>{v}</Text> },
    { title: 'Order', key: 'order', render: (_, r) => <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(r.order_id)}>{r.order?.order_number}</Button> },
    { title: 'Customer', key: 'customer', render: (_, r) => r.customer?.customer_name || '—' },
    { title: 'Dispatched', dataIndex: 'dispatch_date', render: fmt },
    { title: 'Delivered', dataIndex: 'delivered_date', render: (v, r) => (v ? `${fmt(v)} · ${r.received_by}` : '—') },
    { title: 'Value', dataIndex: 'value', align: 'right', render: (v) => inr(v) },
    { title: 'Status', dataIndex: 'status', render: (v) => <ArStatus status={v} kind="delivery" /> },
    { title: 'Invoice', key: 'invoice', render: (_, r) => (r.invoice ? r.invoice.invoice_number : <Text type="secondary">—</Text>) },
    {
      title: '', key: 'act', fixed: 'right', width: 170, render: (_, r) => (
        <Space wrap>
          {canConfirmDelivery && r.status === 'DISPATCHED' && <Button size="small" onClick={() => openPod(r)}>Confirm delivery</Button>}
          {canBill && r.can_invoice && (r.invoice_block
            ? <Text type="secondary" style={{ fontSize: 12 }} title={r.invoice_block}>Someone else invoices this</Text>
            : <Button size="small" type="primary" onClick={() => openInvoice(r)}>Raise invoice</Button>)}
        </Space>
      ),
    },
  ];

  const tiles = [
    { label: 'Quotations open', value: summary.quotations || 0, sub: inr(summary.quotation_value) },
    { label: 'On credit hold', value: summary.on_hold || 0, sub: inr(summary.on_hold_value), alert: summary.on_hold > 0 },
    { label: 'Orders to deliver', value: summary.to_deliver || 0, sub: inr(summary.to_deliver_value) },
    canSeeDeliveries && { label: 'Deliveries to invoice', value: dSummary.to_invoice || 0, sub: `${inr(dSummary.to_invoice_value)} delivered, not billed`, alert: dSummary.to_invoice > 0 },
  ].filter(Boolean);

  const d = detail;
  const canDispatch = canShip && d && ['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(d.status);
  const liveDeliveries = d ? d.deliveries.filter((x) => x.status !== 'CANCELLED') : [];

  return (
    <div>
      <ArTasks kinds={['ORDER']} />
      <PageHeader
        icon={<ClipboardList size={24} />}
        title="Sales Orders"
        subtitle="Quotations and sales orders, the credit check on each order, deliveries, and the invoice raised from each delivery"
        actions={[
          <Button key="r" icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>,
          canQuote && <Button key="n" type="primary" icon={<FilePlus2 size={16} />} onClick={openNew}>{newLabel}</Button>,
        ].filter(Boolean)}
      />
      <Tiles tiles={tiles} />
      <Card style={card} styles={{ body: { padding: '0 0 8px' } }}>
        <Tabs
          activeKey={tab}
          onChange={(k) => setParams(k === 'deliveries' ? { tab: 'deliveries' } : {})}
          tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
          items={[
            {
              key: 'orders', label: 'Quotations & orders',
              children: (
                <>
                  <div style={{ padding: 12 }}><Segmented value={filter} onChange={setFilter} options={ORDER_FILTERS} /></div>
                  <Table rowKey="id" loading={loading} columns={orderColumns} dataSource={visible} scroll={{ x: 'max-content' }} pagination={{ pageSize: 15, hideOnSinglePage: true }} />
                </>
              ),
            },
            canSeeDeliveries && {
              key: 'deliveries', label: `Deliveries${dSummary.in_transit ? ` (${dSummary.in_transit} in transit)` : ''}`,
              children: <Table rowKey="id" loading={loading} columns={deliveryColumns} dataSource={deliveries} scroll={{ x: 'max-content' }} pagination={{ pageSize: 15, hideOnSinglePage: true }} />,
            },
          ].filter(Boolean)}
        />
      </Card>

      {/* New quotation / order */}
      <Drawer
        open={newOpen} onClose={() => setNewOpen(false)} width={Math.min(940, window.innerWidth)} title={canChangeOrder ? 'New quotation / sales order' : 'New quotation'} destroyOnClose
        extra={(
          <Space>
            <Button type={canChangeOrder ? 'default' : 'primary'} loading={busy} onClick={() => saveNew('QUOTATION')}>Save as quotation</Button>
            {canChangeOrder && <Button type="primary" loading={busy} onClick={() => saveNew('ORDER')}>Confirm as order</Button>}
          </Space>
        )}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info" showIcon icon={<Sparkles size={16} />}
            message={source ? `Read from ${source}` : "Have the customer's purchase order?"}
            description="Upload the customer's PO and AI fills the customer, PO number and items. Check every line before saving."
            action={<Upload accept={AI_ACCEPT} showUploadList={false} beforeUpload={readPo}><Button loading={reading}>Upload PO</Button></Upload>}
          />
          <Form form={form} layout="vertical">
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="customer_id" label="Customer" rules={[{ required: true, message: 'Choose a customer' }]}>
                  <Select
                    showSearch optionFilterProp="label" placeholder="Choose a customer"
                    options={customers.map((c) => ({ value: c.id, label: `${c.customer_name}${c.status === 'PENDING' ? ' (not verified: quotation only)' : c.status === 'ON_HOLD' ? ' (on hold)' : ''}` }))}
                    notFoundContent={canAddCustomer
                      ? <Button type="link" onClick={() => navigate('/finance/ar/customers')}>Add the customer first</Button>
                      : <Text type="secondary">Not listed? Ask Accounts Receivable to add the customer.</Text>}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}><Form.Item name="order_date" label="Date" rules={[{ required: true, message: 'Required' }]}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item></Col>
              <Col xs={12} md={6}><Form.Item name="customer_po_number" label="Customer PO no."><Input /></Form.Item></Col>
            </Row>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <Card size="small" title="Items" style={{ borderRadius: 12, marginBottom: 16 }} extra={<Button size="small" icon={<Plus size={14} />} onClick={() => add(blankItem())}>Add item</Button>}>
                  {fields.map((f) => (
                    <Row gutter={8} key={f.key} align="top">
                      <Col xs={16} md={6}><Form.Item name={[f.name, 'description']} rules={[{ required: true, message: 'Describe the item' }]} style={{ marginBottom: 8 }}><Input placeholder="Item or service" /></Form.Item></Col>
                      <Col xs={8} md={2}><Form.Item name={[f.name, 'hsn_code']} style={{ marginBottom: 8 }} tooltip="HSN for goods, SAC for services. Used for the HSN summary in the GST register." rules={[{ pattern: /^\d{4,8}$/, message: '4–8 digits' }]}><Input placeholder="HSN/SAC" maxLength={8} /></Form.Item></Col>
                      <Col xs={6} md={3}><Form.Item name={[f.name, 'quantity']} rules={[{ required: true, message: 'Qty' }]} style={{ marginBottom: 8 }}><InputNumber style={{ width: '100%' }} min={0.001} placeholder="Qty" /></Form.Item></Col>
                      <Col xs={7} md={4}><Form.Item name={[f.name, 'rate']} rules={[{ required: true, message: 'Rate' }]} style={{ marginBottom: 8 }}><InputNumber style={{ width: '100%' }} min={0} prefix="₹" placeholder="Rate" /></Form.Item></Col>
                      <Col xs={5} md={3}><Form.Item name={[f.name, 'discount_percent']} style={{ marginBottom: 8 }} tooltip="Above 10% the order needs an approver"><InputNumber style={{ width: '100%' }} min={0} max={99} suffix="% off" placeholder="Disc." /></Form.Item></Col>
                      <Col xs={4} md={3}><Form.Item name={[f.name, 'gst_percent']} style={{ marginBottom: 8 }}><InputNumber style={{ width: '100%' }} min={0} max={100} suffix="%" placeholder="GST" /></Form.Item></Col>
                      <Col xs={2} md={2}><Button type="text" danger icon={<Trash2 size={15} />} disabled={fields.length === 1} onClick={() => remove(f.name)} /></Col>
                    </Row>
                  ))}
                  <div style={{ textAlign: 'right' }}>
                    <Text type="secondary">Subtotal {inr(totals.subtotal)} · GST {inr(totals.tax)} · </Text><Text strong>Total {inr(totals.total)}</Text>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>A discount above 10% on any line puts the order on hold for an approver.</Text></div>
                  </div>
                </Card>
              )}
            </Form.List>
            <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
          </Form>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {canChangeOrder
              ? 'Confirming as an order runs the credit check. An order over the credit limit, for a customer with a bill more than 60 days overdue, or with a discount above 10%, goes on hold for an approver.'
              : 'Accounts Receivable confirms your quotation as an order and runs the credit check. You can follow it here through delivery and invoice.'}
          </Text>
        </Space>
      </Drawer>

      {/* Order detail */}
      <Drawer
        open={!!d} onClose={() => setDetail(null)} width={Math.min(900, window.innerWidth)}
        title={d ? <Space>{d.number}<ArStatus status={d.status} /></Space> : ''}
        extra={d && (
          <Space wrap>
            {d.can_cancel && <Button danger onClick={() => askReason({ title: 'Cancel', label: 'Reason', ok: 'Cancel it', run: (reason) => api.post(`/ar/orders/${d.id}/cancel`, { reason }) })}>Cancel</Button>}
            {canChangeOrder && d.status === 'QUOTATION' && <Button type="primary" loading={busy} onClick={() => act(() => api.post(`/ar/orders/${d.id}/confirm`, {}))}>Confirm as order</Button>}
            {canChangeOrder && d.status === 'CREDIT_HOLD' && <Button loading={busy} onClick={() => act(() => api.post(`/ar/orders/${d.id}/confirm`, {}))}>Run credit check again</Button>}
            {d.status === 'CREDIT_HOLD' && d.can_release && <Button type="primary" onClick={() => askReason({ title: 'Release from credit hold', label: 'Why is it being released?', ok: 'Release order', run: (note) => api.post(`/ar/orders/${d.id}/release`, { note }) })}>Release hold</Button>}
            {canDispatch && <Button type="primary" icon={<Truck size={15} />} onClick={openDispatch}>Dispatch</Button>}
          </Space>
        )}
      >
        {d && (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {d.customer?.status === 'PENDING' && d.status === 'QUOTATION' && <Alert type="warning" showIcon message={`${d.customer.customer_name} is not verified yet`} description="The quotation can be sent, but it cannot be confirmed as an order until the customer is verified." />}
            {/* Once an approver has released the hold, the old "failed" result is shown as part of the release note, not as a red alert. */}
            {!(d.credit_released_at && d.status !== 'CREDIT_HOLD') && <CreditPanel check={d.status === 'QUOTATION' ? d.credit_preview : d.credit_check} preview={d.status === 'QUOTATION'} />}
            {d.status === 'CREDIT_HOLD' && !d.can_release && d.release_block && <Alert type="info" showIcon message={d.release_block} />}
            {d.credit_released_at && (
              <Alert
                type="info" showIcon
                message={`Released from credit hold by ${d.credit_released_by_name || 'an approver'} on ${fmt(d.credit_released_at)}`}
                description={(
                  <div>
                    {d.credit_release_note && <div>{d.credit_release_note}</div>}
                    {d.credit_check?.reasons?.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>It had been held because: {d.credit_check.reasons.join('; ')}</Text>}
                  </div>
                )}
              />
            )}
            <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
              <Descriptions.Item label="Customer">{d.customer?.customer_name}</Descriptions.Item>
              <Descriptions.Item label="Customer PO">{d.customer_po_number || '—'}</Descriptions.Item>
              <Descriptions.Item label="Date">{fmt(d.order_date)}</Descriptions.Item>
              <Descriptions.Item label="Raised by">{d.created_by_name || '—'}{d.source === 'AI_EXTRACTED' ? ' · read by AI from the PO' : ''}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{inr(d.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="GST">{inr(d.tax_amount)}</Descriptions.Item>
              <Descriptions.Item label="Total"><Text strong>{inr(d.total_amount)}</Text></Descriptions.Item>
              <Descriptions.Item label="Payment terms">{d.customer?.payment_terms_days} days</Descriptions.Item>
            </Descriptions>
            <Table
              size="small" rowKey="id" pagination={false} dataSource={d.items} title={() => <Text strong>Items</Text>} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Item', dataIndex: 'description' },
                { title: 'HSN / SAC', dataIndex: 'hsn_code', render: (v) => v || <Text type="secondary">—</Text> },
                { title: 'Ordered', dataIndex: 'quantity', align: 'right', render: Number },
                { title: 'Delivered', dataIndex: 'delivered_qty', align: 'right', render: Number },
                { title: 'Invoiced', dataIndex: 'invoiced_qty', align: 'right', render: Number },
                { title: 'Rate', dataIndex: 'rate', align: 'right', render: inr },
                { title: 'Discount', dataIndex: 'discount_percent', align: 'right', render: (v) => (Number(v) > 0 ? <Text type={Number(v) > 10 ? 'danger' : undefined}>{Number(v)}%</Text> : '—') },
                { title: 'GST', dataIndex: 'gst_percent', align: 'right', render: (v) => `${Number(v)}%` },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: inr },
              ]}
            />
            {liveDeliveries.length > 0 && (
              <Table
                size="small" rowKey="id" pagination={false} dataSource={liveDeliveries} title={() => <Text strong>Deliveries</Text>} scroll={{ x: 'max-content' }}
                columns={[
                  { title: 'Delivery', dataIndex: 'delivery_number' },
                  { title: 'Dispatched', dataIndex: 'dispatch_date', render: fmt },
                  { title: 'Delivered', dataIndex: 'delivered_date', render: (v, r) => (v ? `${fmt(v)} · ${r.received_by}` : '—') },
                  { title: 'Status', dataIndex: 'status', render: (v) => <ArStatus status={v} kind="delivery" /> },
                  { title: 'Invoice', key: 'inv', render: (_, r) => d.invoices.find((i) => i.id === r.invoice_id)?.invoice_number || '—' },
                  {
                    title: '', key: 'act', render: (_, r) => (
                      <Space>
                        {canConfirmDelivery && r.status === 'DISPATCHED' && <Button size="small" icon={<PackageCheck size={14} />} onClick={() => openPod(r)}>Confirm delivery</Button>}
                        {canBill && r.status === 'DELIVERED' && !r.invoice_id && <Button size="small" type="primary" onClick={() => openInvoice(r)}>Raise invoice</Button> /* the window says if someone else must raise it */}
                        {canConfirmDelivery && !r.invoice_id && <Button size="small" type="text" danger onClick={() => askReason({ title: `Cancel delivery ${r.delivery_number}`, label: 'Reason', ok: 'Cancel delivery', run: (reason) => api.post(`/ar/deliveries/${r.id}/cancel`, { reason }) })}>Cancel</Button>}
                      </Space>
                    ),
                  },
                ]}
              />
            )}
            {d.invoices.length > 0 && (
              <Table
                size="small" rowKey="id" pagination={false} dataSource={d.invoices} title={() => <Text strong>Invoices</Text>}
                columns={[
                  { title: 'Invoice', dataIndex: 'invoice_number' },
                  { title: 'Date', dataIndex: 'invoice_date', render: fmt },
                  { title: 'Total', dataIndex: 'total_amount', align: 'right', render: inr },
                  { title: 'Status', dataIndex: 'status', render: (v) => ({ UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially paid', PAID: 'Paid', CANCELLED: 'Cancelled' }[v] || v) },
                  canSeeInvoices && { title: '', key: 'go', render: () => <Button type="link" onClick={() => navigate('/finance/ar/customer-invoices')}>Customer invoices</Button> },
                ].filter(Boolean)}
              />
            )}
            <div>
              <Text strong>History</Text>
              <Timeline style={{ marginTop: 12 }} items={arHistoryItems(d.history)} />
            </div>
          </Space>
        )}
      </Drawer>

      {/* Dispatch */}
      <Modal open={dispatchOpen} title={`Dispatch against ${d?.order_number || ''}`} onCancel={() => setDispatchOpen(false)} onOk={dispatch} confirmLoading={busy} okText="Dispatch" width={640} destroyOnClose>
        <Table
          size="small" rowKey="id" pagination={false} dataSource={(d?.items || []).filter((it) => it.to_deliver > 0)} style={{ marginBottom: 12 }}
          columns={[
            { title: 'Item', dataIndex: 'description' },
            { title: 'Left to deliver', dataIndex: 'to_deliver', align: 'right' },
            { title: 'Dispatching now', key: 'q', width: 150, render: (_, it) => <InputNumber min={0} max={it.to_deliver} value={dispatchQty[it.id]} onChange={(q) => setDispatchQty((s) => ({ ...s, [it.id]: q }))} style={{ width: '100%' }} /> },
          ]}
        />
        <Form form={dispatchForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}><Form.Item name="dispatch_date" label="Dispatch date" rules={[{ required: true, message: 'Required' }]}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item></Col>
            <Col span={12}><Form.Item name="transporter" label="Transporter"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="vehicle_number" label="Vehicle no."><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="tracking_reference" label="LR / tracking no."><Input /></Form.Item></Col>
          </Row>
        </Form>
        <Text type="secondary" style={{ fontSize: 12 }}>A part delivery is fine: the rest stays on the order.</Text>
      </Modal>

      {/* Proof of delivery */}
      <Modal open={!!podFor} title={`Confirm delivery ${podFor?.delivery_number || ''}`} onCancel={() => setPodFor(null)} onOk={confirmPod} confirmLoading={busy} okText="Confirm delivery" destroyOnClose>
        <Alert style={{ marginBottom: 12 }} type="info" showIcon message="Proof of delivery" description="Record who received the goods and when. Only a confirmed delivery can be invoiced." />
        <Form form={podForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}><Form.Item name="delivered_date" label="Delivered on" rules={[{ required: true, message: 'Required' }]}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item></Col>
            <Col span={12}><Form.Item name="received_by" label="Received by" rules={[{ required: true, message: 'Who signed for the goods?' }]}><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="delivery_note" label="Note (e.g. signed challan number)"><Input /></Form.Item>
        </Form>
      </Modal>

      {/* Invoice from delivery */}
      <Modal open={!!invoiceFor} title={`Raise invoice for delivery ${invoiceFor?.delivery?.delivery_number || ''}`} onCancel={() => setInvoiceFor(null)} onOk={raiseInvoice} confirmLoading={busy} okText="Post invoice" okButtonProps={{ disabled: !!invoiceFor?.preview?.invoice_block }} width={720} destroyOnClose>
        {invoiceFor && (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {invoiceFor.preview.invoice_block && <Alert type="warning" showIcon message={invoiceFor.preview.invoice_block} />}
            <Table
              size="small" rowKey="description" pagination={false} dataSource={invoiceFor.preview.lines}
              columns={[
                { title: 'Item', dataIndex: 'description' },
                { title: 'Qty delivered', dataIndex: 'quantity', align: 'right' },
                { title: 'Rate', dataIndex: 'rate', align: 'right', render: (v, r) => (Number(r.discount_percent) > 0 ? <span title={`List ${inr(r.list_rate)} less ${r.discount_percent}%`}>{inr(v)}</span> : inr(v)) },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: inr },
                { title: 'GST', dataIndex: 'gst_amount', align: 'right', render: (v, r) => `${inr(v)} (${r.gst_percent}%)` },
              ]}
            />
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Subtotal">{inr(invoiceFor.preview.subtotal)}</Descriptions.Item>
              <Descriptions.Item label={invoiceFor.preview.inter_state ? 'IGST' : 'CGST + SGST'}>
                {invoiceFor.preview.inter_state ? inr(invoiceFor.preview.igst_amount) : `${inr(invoiceFor.preview.cgst_amount)} + ${inr(invoiceFor.preview.sgst_amount)}`}
              </Descriptions.Item>
              <Descriptions.Item label="Invoice total"><Text strong>{inr(invoiceFor.preview.total_amount)}</Text></Descriptions.Item>
              <Descriptions.Item label="Due date">{fmt(invoiceFor.preview.due_date)} (from payment terms)</Descriptions.Item>
            </Descriptions>
            <Form form={invoiceForm} layout="vertical">
              <Form.Item name="invoice_date" label="Invoice date" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 0, maxWidth: 240 }}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" onChange={previewForDate} disabledDate={(dd) => dd && dd.isAfter(dayjs(), 'day')} /></Form.Item>
            </Form>
            <Card size="small" title="Accounting entry that will be posted" style={{ borderRadius: 12 }}><JournalLines lines={invoiceFor.preview.journal} /></Card>
            <Text type="secondary" style={{ fontSize: 12 }}>The invoice number comes from the running series. Only the delivered quantities are billed.</Text>
          </Space>
        )}
      </Modal>

      {/* Reason prompt (cancel, release) */}
      <Modal
        open={!!reasonFor} title={reasonFor?.title} okText={reasonFor?.ok} confirmLoading={busy} destroyOnClose onCancel={() => setReasonFor(null)}
        onOk={async () => { const v = await reasonForm.validateFields(); await act(() => reasonFor.run(v.reason), () => setReasonFor(null)); }}
      >
        <Form form={reasonForm} layout="vertical">
          <Form.Item name="reason" label={reasonFor?.label} rules={[{ required: true, message: 'Required' }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SalesOrders;
