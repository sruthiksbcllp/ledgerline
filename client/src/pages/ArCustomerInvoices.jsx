import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Row, Segmented,
  Select, Space, Table, Tag, Timeline, Typography, message,
} from 'antd';
import { BellRing, FilePlus2, HandCoins, PenLine, RefreshCcw, Sparkles, XCircle } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../utils/api';
import { inr } from '../utils/apLedger';
import { ChecksPanel, DocumentDropzone, StatusTag } from '../components/finance/DocumentReview';
import { checkUploadFile, historyItems, markProps } from '../utils/documentReview';

const { Text } = Typography;

const card = { borderRadius: 16, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const NEW_CUSTOMER = 'NEW';
const FILTERS = [
  { label: 'Open', value: 'OPEN' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Paid', value: 'PAID' },
  { label: 'All', value: 'ALL' },
];
const fmt = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
const MODES = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash'].map((m) => ({ value: m, label: m }));

const ArCustomerInvoices = () => {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('OPEN');
  const [customers, setCustomers] = useState([]);
  const [reminding, setReminding] = useState(false);

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [step, setStep] = useState('upload');
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [sourceName, setSourceName] = useState(null);
  const [checks, setChecks] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const timer = useRef(null);

  const [detail, setDetail] = useState(null);
  const [acting, setActing] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiptForm] = Form.useForm();
  const [cancelForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/ar/invoices');
      setRows(res?.data?.data || []);
      setSummary(res?.data?.summary || {});
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not load customer invoices');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === 'OPEN') return rows.filter((r) => ['UNPAID', 'PARTIALLY_PAID'].includes(r.status));
    if (filter === 'OVERDUE') return rows.filter((r) => r.overdue);
    if (filter === 'PAID') return rows.filter((r) => r.status === 'PAID');
    return rows;
  }, [rows, filter]);

  const tiles = [
    { label: 'Outstanding', value: inr(summary.outstanding), sub: `${summary.open_count || 0} open invoice${summary.open_count === 1 ? '' : 's'}` },
    { label: 'Overdue', value: inr(summary.overdue), sub: `${summary.overdue_count || 0} invoice${summary.overdue_count === 1 ? '' : 's'} past due`, alert: summary.overdue_count > 0 },
    { label: 'Invoiced (all time)', value: inr(rows.filter((r) => r.status !== 'CANCELLED').reduce((s, r) => s + Number(r.total_amount), 0)), sub: `${rows.length} invoice${rows.length === 1 ? '' : 's'}` },
    { label: 'Received (all time)', value: inr(rows.reduce((s, r) => s + Number(r.amount_received || 0), 0)), sub: 'Partial and full payments' },
  ];

  // ── Intake ────────────────────────────────────────────────────────────────
  const openIntake = async () => {
    form.resetFields();
    setExtraction(null);
    setSourceName(null);
    setChecks(null);
    setStep('upload');
    setIntakeOpen(true);
    const res = await api.get('/ar/customers').catch(() => null);
    setCustomers(res?.data?.data || []);
  };

  const payload = () => {
    const v = form.getFieldsValue(true);
    const isNew = !v.customer_id || v.customer_id === NEW_CUSTOMER;
    return {
      customer_id: isNew ? null : v.customer_id,
      customer: isNew ? { customer_name: v.customer_name, gst_number: v.customer_gst, email: v.customer_email, phone: v.customer_phone, address: v.customer_address } : undefined,
      invoice_number: v.invoice_number,
      invoice_date: v.invoice_date ? v.invoice_date.format('YYYY-MM-DD') : null,
      due_date: v.due_date ? v.due_date.format('YYYY-MM-DD') : null,
      customer_po_number: v.customer_po_number,
      subtotal: v.subtotal,
      tax_rate_percent: v.tax_rate_percent,
      tax_amount: v.tax_amount,
      total_amount: v.total_amount,
      amount_received: v.amount_received || 0,
      payment_mode: v.payment_mode,
      payment_reference: v.payment_reference,
      notes: v.notes,
      source: extraction ? 'AI_EXTRACTED' : 'MANUAL',
      source_file_name: sourceName,
    };
  };

  const validate = async () => {
    setChecking(true);
    try {
      const res = await api.post('/ar/invoices/validate', payload());
      setChecks(res?.data?.data?.checks || []);
    } catch { /* keep previous */ } finally {
      setChecking(false);
    }
  };
  const scheduleValidate = () => { clearTimeout(timer.current); timer.current = setTimeout(validate, 600); };

  const onDocument = async (file) => {
    const problem = checkUploadFile(file);
    if (problem) { message.error(problem); return; }
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/ar/invoices/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
      const data = res?.data?.data;
      const h = data.header;
      const p = data.party;
      const m = data.matches || {};
      if (m.receipt_for_invoice) {
        // A payment advice for an invoice we already raised: go straight to recording the receipt.
        setIntakeOpen(false);
        message.info(`This is a payment for invoice ${m.receipt_for_invoice.invoice_number}. Review and record it.`);
        await openDetail(m.receipt_for_invoice.id, { amount: Number(h.amount_paid.value || h.total_amount.value || 0), reference: '' });
        return;
      }
      form.setFieldsValue({
        customer_id: m.customer?.id || NEW_CUSTOMER,
        customer_name: p.name.value || undefined,
        customer_gst: p.gst_number.value || undefined,
        customer_email: p.email.value || undefined,
        customer_phone: p.phone.value || undefined,
        customer_address: p.address.value || undefined,
        invoice_number: h.invoice_number.value || undefined,
        invoice_date: h.invoice_date.value ? dayjs(h.invoice_date.value) : undefined,
        due_date: h.due_date.value ? dayjs(h.due_date.value) : undefined,
        customer_po_number: h.po_number.value || undefined,
        subtotal: h.subtotal.value ? Number(h.subtotal.value) : undefined,
        tax_rate_percent: h.tax_rate_percent.value ? Number(h.tax_rate_percent.value) : undefined,
        tax_amount: h.tax_amount.value ? Number(h.tax_amount.value) : undefined,
        total_amount: h.total_amount.value ? Number(h.total_amount.value) : undefined,
        amount_received: h.amount_paid.value ? Number(h.amount_paid.value) : undefined,
      });
      if (data.document_type === 'PURCHASE_ORDER') {
        message.info('This is a customer purchase order. Fill in your invoice number and dates, then post the invoice against it.');
      }
      setExtraction(data);
      setSourceName(file.name);
      setStep('review');
      validate();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not read the document. Enter the details manually.');
    } finally {
      setExtracting(false);
    }
  };

  const enterManually = () => {
    setExtraction(null);
    form.setFieldsValue({ customer_id: NEW_CUSTOMER, invoice_date: dayjs(), due_date: dayjs().add(30, 'day'), tax_rate_percent: 18 });
    setStep('review');
    validate();
  };

  const post = async () => {
    try { await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const res = await api.post('/ar/invoices', payload());
      message.success(res?.data?.message || 'Invoice posted');
      setIntakeOpen(false);
      load();
    } catch (e) {
      if (e?.response?.data?.checks) setChecks(e.response.data.checks);
      message.error(e?.response?.data?.message || 'Could not post the invoice');
    } finally {
      setSaving(false);
    }
  };

  const recalcTax = () => {
    const { subtotal, tax_rate_percent: rate } = form.getFieldsValue(['subtotal', 'tax_rate_percent']);
    if (subtotal != null && rate != null) {
      const tax = Math.round(Number(subtotal) * Number(rate)) / 100;
      form.setFieldsValue({ tax_amount: tax, total_amount: Math.round((Number(subtotal) + tax) * 100) / 100 });
    }
  };

  const customerId = Form.useWatch('customer_id', form);
  const h = extraction?.header || {};
  const p = extraction?.party || {};

  // ── Detail ────────────────────────────────────────────────────────────────
  const openDetail = async (id, prefillReceipt) => {
    try {
      const res = await api.get(`/ar/invoices/${id}`);
      const data = res?.data?.data;
      setDetail(data);
      if (prefillReceipt) {
        receiptForm.setFieldsValue({ amount: Math.min(prefillReceipt.amount || data.outstanding, data.outstanding), received_date: dayjs() });
        setReceiptOpen(true);
      }
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not open the invoice');
    }
  };
  const act = async (fn) => {
    setActing(true);
    try {
      const res = await fn();
      message.success(res?.data?.message || 'Done');
      if (detail) await openDetail(detail.id);
      load();
      return true;
    } catch (e) {
      message.error(e?.response?.data?.message || 'Action failed');
      return false;
    } finally {
      setActing(false);
    }
  };
  const recordReceipt = async () => {
    const v = await receiptForm.validateFields();
    if (await act(() => api.post(`/ar/invoices/${detail.id}/receipts`, { ...v, received_date: v.received_date?.format('YYYY-MM-DD') }))) setReceiptOpen(false);
  };
  const cancelInvoice = async () => {
    const { reason } = await cancelForm.validateFields();
    if (await act(() => api.put(`/ar/invoices/${detail.id}/cancel`, { reason }))) setCancelOpen(false);
  };
  const remindAll = async () => {
    setReminding(true);
    try {
      const res = await api.post('/ar/reminders/overdue');
      message.success(res?.data?.message || 'Reminders generated');
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not send reminders');
    } finally {
      setReminding(false);
    }
  };

  const columns = [
    { title: 'Invoice', dataIndex: 'invoice_number', render: (v, r) => <Space size={6}><Text strong>{v}</Text>{r.source === 'AI_EXTRACTED' && <Tag color="geekblue">AI</Tag>}</Space> },
    { title: 'Customer', key: 'customer', render: (_, r) => r.customer?.customer_name || '—' },
    { title: 'Invoice date', dataIndex: 'invoice_date', render: fmt },
    { title: 'Due', dataIndex: 'due_date', render: (v, r) => <Space size={6}>{fmt(v)}{r.overdue && <Tag color="error">{r.days_overdue}d overdue</Tag>}</Space> },
    { title: 'Total', dataIndex: 'total_amount', align: 'right', render: (v) => inr(v) },
    { title: 'Received', dataIndex: 'amount_received', align: 'right', render: (v) => inr(v) },
    { title: 'Outstanding', dataIndex: 'outstanding', align: 'right', render: (v) => <Text strong>{inr(v)}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag status={v} kind="AR" /> },
    { title: 'Last reminder', dataIndex: 'last_reminder_at', render: (v) => (v ? dayjs(v).format('DD MMM') : <Text type="secondary">—</Text>) },
    { title: '', key: 'open', render: (_, r) => <Button type="link" onClick={() => openDetail(r.id)}>Open</Button> },
  ];

  const open = detail && ['UNPAID', 'PARTIALLY_PAID'].includes(detail.status);

  return (
    <div>
      <Card style={{ ...card, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space size={16}>
              <div className="page-header-icon"><HandCoins size={24} /></div>
              <div>
                <h2 className="page-header-title">Customer Invoices</h2>
                <Text type="secondary">Post customer invoices, record partial and full payments, chase overdue balances</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Button icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>
              <Button icon={<BellRing size={16} />} onClick={remindAll} loading={reminding} disabled={!summary.overdue_count}>Send overdue reminders</Button>
              <Button type="primary" icon={<FilePlus2 size={16} />} onClick={openIntake}>New invoice / upload</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {tiles.map((t) => (
          <Col xs={12} lg={6} key={t.label}>
            <Card style={card} styles={{ body: { padding: '14px 18px' } }}>
              <Text type="secondary">{t.label}</Text>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{t.value}</div>
              <Text type={t.alert ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{t.sub}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={card} styles={{ body: { padding: 0 } }} title={<Segmented value={filter} onChange={setFilter} options={FILTERS} />}>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={visible} scroll={{ x: 'max-content' }} pagination={{ pageSize: 15, hideOnSinglePage: true }} />
      </Card>

      <Drawer
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        width={Math.min(860, window.innerWidth)}
        title="New customer invoice"
        destroyOnClose
        extra={step === 'review' && (
          <Space>
            <Button onClick={() => setStep('upload')}>Back</Button>
            <Button type="primary" loading={saving} disabled={checks?.some((c) => c.severity === 'error')} onClick={post}>Post invoice</Button>
          </Space>
        )}
      >
        {step === 'upload' && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <DocumentDropzone
              onFile={onDocument}
              loading={extracting}
              title="Drop a customer invoice, purchase order or payment advice"
              hint="PDF or image up to 10 MB. AI reads the customer, invoice number, dates and amounts. A payment advice for an existing invoice is recorded as a receipt."
            />
            <div style={{ textAlign: 'center' }}>
              <Button type="link" icon={<PenLine size={14} />} onClick={enterManually} disabled={extracting}>Enter the invoice manually instead</Button>
            </div>
          </Space>
        )}
        {step === 'review' && (
          <Form form={form} layout="vertical" onValuesChange={scheduleValidate} requiredMark>
            {extraction && (
              <Alert style={{ marginBottom: 16 }} type="info" showIcon icon={<Sparkles size={16} />} message={`Read from ${sourceName}`} description="Highlighted fields need a check. Nothing is posted until you click Post invoice." />
            )}
            {extraction?.matches?.duplicate && (
              <Alert style={{ marginBottom: 16 }} type="error" showIcon message={`Invoice ${extraction.matches.duplicate.invoice_number} is already recorded (${extraction.matches.duplicate.status_label})`} />
            )}
            <Form.Item
              name="customer_id"
              label="Customer"
              rules={[{ required: true, message: 'Select or add the customer' }]}
              extra={extraction?.matches?.customer ? <Text type="success" style={{ fontSize: 12 }}>Matched existing customer by {extraction.matches.customer.matched_by === 'GSTIN' ? 'GSTIN' : 'name'}</Text> : null}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={[{ value: NEW_CUSTOMER, label: '+ New customer' }, ...customers.map((c) => ({ value: c.id, label: `${c.customer_name}${c.gst_number ? ` · ${c.gst_number}` : ''}` }))]}
              />
            </Form.Item>
            {customerId === NEW_CUSTOMER && (
              <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }} title="New customer">
                <Row gutter={12}>
                  <Col xs={24} md={12}><Form.Item name="customer_name" label="Name" rules={[{ required: true, message: 'Required' }]} {...markProps(p.name)}><Input /></Form.Item></Col>
                  <Col xs={24} md={12}><Form.Item name="customer_gst" label="GSTIN" {...markProps(p.gst_number)}><Input maxLength={15} /></Form.Item></Col>
                  <Col xs={24} md={12}><Form.Item name="customer_email" label="Email (for reminders)" {...markProps(p.email)}><Input /></Form.Item></Col>
                  <Col xs={24} md={12}><Form.Item name="customer_phone" label="Phone" {...markProps(p.phone)}><Input /></Form.Item></Col>
                  <Col span={24}><Form.Item name="customer_address" label="Address" {...markProps(p.address)}><Input.TextArea rows={2} /></Form.Item></Col>
                </Row>
              </Card>
            )}
            <Row gutter={16}>
              <Col xs={24} md={8}><Form.Item name="invoice_number" label="Invoice number" rules={[{ required: true, message: 'Required' }]} {...markProps(h.invoice_number)}><Input /></Form.Item></Col>
              <Col xs={12} md={8}><Form.Item name="invoice_date" label="Invoice date" rules={[{ required: true, message: 'Required' }]} {...markProps(h.invoice_date)}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item></Col>
              <Col xs={12} md={8}><Form.Item name="due_date" label="Due date" {...markProps(h.due_date)}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col xs={12} md={6}><Form.Item name="subtotal" label="Subtotal" {...markProps(h.subtotal)}><InputNumber style={{ width: '100%' }} min={0} prefix="₹" onBlur={recalcTax} /></Form.Item></Col>
              <Col xs={12} md={6}><Form.Item name="tax_rate_percent" label="GST %" {...markProps(h.tax_rate_percent)}><InputNumber style={{ width: '100%' }} min={0} max={100} onBlur={recalcTax} /></Form.Item></Col>
              <Col xs={12} md={6}><Form.Item name="tax_amount" label="GST amount" {...markProps(h.tax_amount)}><InputNumber style={{ width: '100%' }} min={0} prefix="₹" /></Form.Item></Col>
              <Col xs={12} md={6}><Form.Item name="total_amount" label="Invoice total" rules={[{ required: true, message: 'Required' }]} {...markProps(h.total_amount)}><InputNumber style={{ width: '100%' }} min={0} prefix="₹" /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} md={8}><Form.Item name="customer_po_number" label="Customer PO no. (optional)"><Input /></Form.Item></Col>
              <Col xs={12} md={8}><Form.Item name="amount_received" label="Amount already received" extra="Leave empty if nothing has been paid yet"><InputNumber style={{ width: '100%' }} min={0} prefix="₹" /></Form.Item></Col>
              <Col xs={12} md={8}><Form.Item name="payment_mode" label="Payment mode"><Select allowClear options={MODES} /></Form.Item></Col>
            </Row>
            <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
            <ChecksPanel checks={checks} checking={checking} />
          </Form>
        )}
      </Drawer>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        width={Math.min(720, window.innerWidth)}
        title={detail ? <Space>Invoice {detail.invoice_number}<StatusTag status={detail.status} kind="AR" /></Space> : ''}
        extra={open && (
          <Space>
            <Button icon={<BellRing size={15} />} loading={acting} onClick={() => act(() => api.post(`/ar/invoices/${detail.id}/remind`))}>Send reminder</Button>
            {detail.status === 'UNPAID' && <Button danger icon={<XCircle size={15} />} onClick={() => { cancelForm.resetFields(); setCancelOpen(true); }}>Cancel</Button>}
            <Button type="primary" onClick={() => { receiptForm.setFieldsValue({ amount: detail.outstanding, received_date: dayjs() }); setReceiptOpen(true); }}>Record payment</Button>
          </Space>
        )}
      >
        {detail && (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {detail.overdue && <Alert type="error" showIcon message={`${detail.days_overdue} days overdue · ${inr(detail.outstanding)} outstanding`} />}
            <Descriptions size="small" column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }} bordered>
              <Descriptions.Item label="Customer">{detail.customer?.customer_name}</Descriptions.Item>
              <Descriptions.Item label="Customer GSTIN">{detail.customer?.gst_number || '—'}</Descriptions.Item>
              <Descriptions.Item label="Invoice date">{fmt(detail.invoice_date)}</Descriptions.Item>
              <Descriptions.Item label="Due date">{fmt(detail.due_date)}</Descriptions.Item>
              <Descriptions.Item label="Total">{inr(detail.total_amount)}</Descriptions.Item>
              <Descriptions.Item label="Received">{inr(detail.amount_received)}</Descriptions.Item>
              <Descriptions.Item label="Outstanding"><Text strong>{inr(detail.outstanding)}</Text></Descriptions.Item>
              <Descriptions.Item label="Reminder email">{detail.customer?.email || <Text type="secondary">No email on file</Text>}</Descriptions.Item>
            </Descriptions>
            {detail.receipts?.length > 0 && (
              <Table size="small" rowKey="id" pagination={false} title={() => <Text strong>Payments received</Text>} dataSource={detail.receipts} columns={[
                { title: 'Date', dataIndex: 'received_date', render: fmt },
                { title: 'Mode', dataIndex: 'payment_mode', render: (v) => v || '—' },
                { title: 'Reference', dataIndex: 'reference', render: (v) => v || '—' },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => inr(v) },
              ]} />
            )}
            {detail.reminders?.length > 0 && (
              <Table size="small" rowKey="id" pagination={false} title={() => <Text strong>Reminders</Text>} dataSource={detail.reminders} columns={[
                { title: 'Sent', dataIndex: 'created_at', render: (v, r) => dayjs(v || r.createdAt).format('DD MMM YYYY, h:mm A') },
                { title: 'To', dataIndex: 'to_email', render: (v) => v || '—' },
                { title: 'Delivery', dataIndex: 'delivery', render: (v, r) => (v === 'EMAILED' ? <Tag color="success">Emailed</Tag> : <Tag title={r.delivery_note}>Recorded only</Tag>) },
              ]} />
            )}
            <div>
              <Text strong>History</Text>
              <Timeline style={{ marginTop: 12 }} items={historyItems(detail.history)} />
            </div>
          </Space>
        )}
      </Drawer>

      <Modal open={receiptOpen} title="Record payment received" onCancel={() => setReceiptOpen(false)} onOk={recordReceipt} confirmLoading={acting} okText="Record payment" destroyOnClose>
        <Form form={receiptForm} layout="vertical">
          <Form.Item name="amount" label={`Amount (outstanding ${detail ? inr(detail.outstanding) : ''})`} rules={[{ required: true, message: 'Enter the amount' }]} extra="Less than the outstanding amount records a partial payment.">
            <InputNumber style={{ width: '100%' }} min={0.01} max={detail ? Number(detail.outstanding) : undefined} prefix="₹" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="received_date" label="Received on"><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item></Col>
            <Col span={12}><Form.Item name="payment_mode" label="Mode"><Select allowClear options={MODES} /></Form.Item></Col>
          </Row>
          <Form.Item name="reference" label="Reference (UTR / cheque no.)"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal open={cancelOpen} title="Cancel invoice" onCancel={() => setCancelOpen(false)} onOk={cancelInvoice} confirmLoading={acting} okText="Cancel invoice" okButtonProps={{ danger: true }} destroyOnClose>
        <Form form={cancelForm} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Give a reason' }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ArCustomerInvoices;
