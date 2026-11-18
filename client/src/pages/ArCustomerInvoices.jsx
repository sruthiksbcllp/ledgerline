import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Col, Collapse, DatePicker, Descriptions, Drawer, Dropdown, Form, Input, InputNumber, Modal, Row, Segmented,
  Select, Space, Table, Tag, Timeline, Typography, Upload, message,
} from 'antd';
import { BellRing, FileMinus2, FilePlus2, HandCoins, MoreHorizontal, Paperclip, PenLine, ReceiptText, RefreshCcw, Sparkles, Trash2, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../utils/api';
import { inr } from '../utils/arFlow';
import { ChecksPanel, DocumentDropzone } from '../components/finance/DocumentReview';
import { checkUploadFile, markProps } from '../utils/documentReview';
import { ArStatus, ArTasks, JournalLines, StageTag, arHistoryItems, confirmDuplicateReference } from '../components/ar/ArShared';
import { getStoredUser, hasPerm } from '../utils/session';

const { Text } = Typography;

const card = { borderRadius: 16, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const FILTERS = [
  { label: 'Open', value: 'OPEN' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'In dispute', value: 'DISPUTE' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Written off', value: 'WRITTEN_OFF' },
  { label: 'All', value: 'ALL' },
];
const fmt = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
const MODES = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash'].map((m) => ({ value: m, label: m }));
// An invoice with no sales order or delivery must say why (blueprint: invoice against a confirmed delivery).
const DIRECT_REASONS = [
  { value: 'SERVICE', label: 'Service billing with no delivery' },
  { value: 'OPENING_BALANCE', label: 'Opening balance from the previous system' },
  { value: 'OUTSIDE_SYSTEM', label: 'Invoice already issued outside LedgerLine' },
  { value: 'OTHER', label: 'Other (describe)' },
];
const EVIDENCE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const evidenceProblem = (file) => {
  if (!EVIDENCE_TYPES.includes(file.type)) return 'Attach a PDF, JPG or PNG file';
  if (file.size > 10 * 1024 * 1024) return 'The file is larger than 10 MB';
  return null;
};
/** Status tag for an invoice: "Settled" when a credit note or discount cleared it with no cash. */
const InvoiceStatus = ({ row }) => (row.status === 'PAID' && row.status_label === 'Settled'
  ? <Tag color="success" style={{ marginInlineEnd: 0 }}>Settled</Tag> : <ArStatus status={row.status} />);

const ArCustomerInvoices = () => {
  const navigate = useNavigate();
  // Read-only logins (Director / CFO, Management) see invoices without the action buttons.
  const user = getStoredUser();
  const canAdd = hasPerm(user, 'AR', 'ADD');
  const canChange = hasPerm(user, 'AR', 'EDIT');
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
  // Credit note (dispute), write-off and e-invoice details on an invoice
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditLines, setCreditLines] = useState([]); // [{ key, description, line_index, quantity, max_qty, rate, max_rate, gst_percent, pick }]
  const [reasons, setReasons] = useState([]);
  const [evidence, setEvidence] = useState(null);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [einvoiceOpen, setEinvoiceOpen] = useState(false);
  const [creditForm] = Form.useForm();
  const [writeOffForm] = Form.useForm();
  const [einvoiceForm] = Form.useForm();

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
    if (filter === 'DISPUTE') return rows.filter((r) => r.in_dispute);
    if (filter === 'PAID') return rows.filter((r) => r.status === 'PAID');
    if (filter === 'WRITTEN_OFF') return rows.filter((r) => r.status === 'WRITTEN_OFF' || Number(r.written_off_amount) > 0);
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
    return {
      customer_id: v.customer_id || null,
      direct_reason: v.direct_reason === 'OTHER' ? `OTHER: ${String(v.direct_reason_text || '').trim()}` : v.direct_reason,
      irn: v.irn || null, irn_ack_number: v.irn_ack_number || null, irn_ack_date: v.irn_ack_date ? v.irn_ack_date.format('YYYY-MM-DD') : null,
      eway_bill_number: v.eway_bill_number || null,
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
      const m = data.matches || {};
      if (m.receipt_for_invoice) {
        // A payment advice for an invoice we already raised: go straight to recording the receipt.
        setIntakeOpen(false);
        message.info(`This is a payment for invoice ${m.receipt_for_invoice.invoice_number}. Review and record it.`);
        await openDetail(m.receipt_for_invoice.id, { amount: Number(h.amount_paid.value || h.total_amount.value || 0), reference: '' });
        return;
      }
      form.setFieldsValue({
        customer_id: m.customer?.id || undefined,
        direct_reason: 'OUTSIDE_SYSTEM',
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
    form.setFieldsValue({ customer_id: undefined, invoice_date: dayjs(), due_date: dayjs().add(30, 'day'), tax_rate_percent: 18 });
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

  const directReason = Form.useWatch('direct_reason', form);
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
    const payload = { ...v, received_date: v.received_date?.format('YYYY-MM-DD') };
    const post = async () => {
      try {
        return await api.post(`/ar/invoices/${detail.id}/receipts`, payload);
      } catch (e) {
        const again = await confirmDuplicateReference(e);
        if (again === null) throw e;
        if (!again) throw Object.assign(new Error('cancelled'), { response: { data: { message: 'Payment not recorded' } } });
        return api.post(`/ar/invoices/${detail.id}/receipts`, { ...payload, confirm_duplicate_reference: true });
      }
    };
    if (await act(post)) setReceiptOpen(false);
  };
  const cancelInvoice = async () => {
    const { reason } = await cancelForm.validateFields();
    if (await act(() => api.put(`/ar/invoices/${detail.id}/cancel`, { reason }))) setCancelOpen(false);
  };

  // ── Dispute / credit note (blueprint step 5) ──────────────────────────────
  const openCredit = async () => {
    creditForm.resetFields();
    setEvidence(null);
    const items = Array.isArray(detail.line_items) ? detail.line_items : [];
    setCreditLines(items.length
      ? items.map((l, i) => ({ key: `l${i}`, line_index: i, description: l.description, quantity: Number(l.quantity), max_qty: Number(l.quantity), rate: Number(l.rate), max_rate: Number(l.rate), gst_percent: Number(l.gst_percent || 0), pick: false }))
      : [{ key: 'free', line_index: null, description: 'Credit against the invoice', quantity: 1, rate: 0, gst_percent: Number(detail.subtotal) > 0 ? Math.round((Number(detail.tax_amount) / Number(detail.subtotal)) * 100) : 0, pick: true }]);
    if (!reasons.length) {
      const r = await api.get('/ar/credit-notes/reasons').catch(() => null);
      setReasons(r?.data?.data || []);
    }
    setCreditOpen(true);
  };
  const chosenLines = creditLines.filter((l) => l.pick && l.quantity > 0 && l.rate > 0);
  const creditTotal = chosenLines.reduce((s, l) => s + Math.round(l.quantity * l.rate * (1 + l.gst_percent / 100) * 100) / 100, 0);
  const setLine = (key, patch) => setCreditLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const raiseCredit = async () => {
    const v = await creditForm.validateFields();
    if (!chosenLines.length) { message.error('Choose at least one line to credit, with a quantity and rate'); return; }
    const fd = new FormData();
    fd.append('reason_code', v.reason_code);
    fd.append('description', v.description);
    fd.append('lines', JSON.stringify(chosenLines.map((l) => ({ description: l.description, line_index: l.line_index, quantity: l.quantity, rate: l.rate, gst_percent: l.gst_percent }))));
    if (evidence) fd.append('file', evidence);
    if (await act(() => api.post(`/ar/invoices/${detail.id}/credit-notes`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }))) setCreditOpen(false);
  };

  // ── Write-off request (blueprint step 9) ──────────────────────────────────
  const openWriteOff = () => {
    writeOffForm.setFieldsValue({ amount: detail.outstanding, reason: undefined });
    setEvidence(null);
    setWriteOffOpen(true);
  };
  const requestWriteOff = async () => {
    const v = await writeOffForm.validateFields();
    if (!evidence) { message.error('Attach the evidence (insolvency notice, legal advice, final demand)'); return; }
    const fd = new FormData();
    fd.append('amount', v.amount);
    fd.append('reason', v.reason);
    fd.append('file', evidence);
    if (await act(() => api.post(`/ar/invoices/${detail.id}/write-offs`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }))) setWriteOffOpen(false);
  };

  // ── e-invoice (IRN) and e-way bill details ───────────────────────────────
  const openEinvoice = () => {
    einvoiceForm.setFieldsValue({
      irn: detail.irn || undefined, irn_ack_number: detail.irn_ack_number || undefined,
      irn_ack_date: detail.irn_ack_date ? dayjs(detail.irn_ack_date) : undefined, eway_bill_number: detail.eway_bill_number || undefined,
    });
    setEinvoiceOpen(true);
  };
  const saveEinvoice = async () => {
    const v = await einvoiceForm.validateFields();
    if (await act(() => api.put(`/ar/invoices/${detail.id}/einvoice`, { ...v, irn_ack_date: v.irn_ack_date ? v.irn_ack_date.format('YYYY-MM-DD') : null }))) setEinvoiceOpen(false);
  };
  const evidencePicker = (
    <Upload
      maxCount={1}
      accept=".pdf,.jpg,.jpeg,.png"
      beforeUpload={(file) => {
        const problem = evidenceProblem(file);
        if (problem) { message.error(problem); return Upload.LIST_IGNORE; }
        setEvidence(file);
        return false;
      }}
      onRemove={() => setEvidence(null)}
      fileList={evidence ? [{ uid: '1', name: evidence.name, status: 'done' }] : []}
    >
      <Button icon={<Paperclip size={14} />}>Attach evidence (PDF / JPG / PNG)</Button>
    </Upload>
  );
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
    {
      title: 'Invoice', dataIndex: 'invoice_number', render: (v, r) => (
        <Space size={6} wrap>
          <Typography.Link strong onClick={() => openDetail(r.id)}>{v}</Typography.Link>
          {r.source === 'AI_EXTRACTED' && <Tag color="geekblue">AI</Tag>}
          {r.no_delivery && <Tag title={r.direct_reason_label || ''}>No delivery</Tag>}
          {r.in_dispute && <Tag color="orange">In dispute</Tag>}
        </Space>
      ),
    },
    { title: 'Customer', key: 'customer', render: (_, r) => r.customer?.customer_name || '—' },
    { title: 'Invoice date', dataIndex: 'invoice_date', render: fmt },
    { title: 'Due', dataIndex: 'due_date', render: (v, r) => <Space size={6}>{fmt(v)}{r.overdue && <Tag color="error">{r.days_overdue}d overdue</Tag>}</Space> },
    { title: 'Total', dataIndex: 'total_amount', align: 'right', render: (v) => inr(v) },
    { title: 'Received', dataIndex: 'amount_received', align: 'right', render: (v, r) => <Space direction="vertical" size={0} style={{ alignItems: 'flex-end' }}><span>{inr(v)}</span>{Number(r.tds_deducted) > 0 && <Text type="secondary" style={{ fontSize: 12 }}>+ {inr(r.tds_deducted)} TDS</Text>}</Space> },
    { title: 'Outstanding', dataIndex: 'outstanding', align: 'right', render: (v) => <Text strong>{inr(v)}</Text> },
    { title: 'Status', dataIndex: 'status', render: (_, r) => <InvoiceStatus row={r} /> },
    { title: 'Reminder step', dataIndex: 'reminder_stage', render: (v, r) => <Space size={6}><StageTag stage={v} label={r.reminder_stage_label} />{r.last_reminder_at && <Text type="secondary" style={{ fontSize: 12 }}>sent {dayjs(r.last_reminder_at).format('DD MMM')}</Text>}</Space> },
    { title: '', key: 'open', fixed: 'right', width: 80, render: (_, r) => <Button type="link" onClick={() => openDetail(r.id)}>Open</Button> },
  ];

  const open = detail && ['UNPAID', 'PARTIALLY_PAID'].includes(detail.status);
  // Less-used invoice actions sit under "More" so the drawer header fits on one line.
  const moreItems = detail ? [
    canChange && detail.status !== 'CANCELLED' && { key: 'einvoice', icon: <ReceiptText size={14} />, label: 'e-invoice (IRN) and e-way bill' },
    open && canAdd && { key: 'writeoff', icon: <Trash2 size={14} />, label: 'Request write-off' },
    open && canChange && detail.status === 'UNPAID' && { key: 'cancel', icon: <XCircle size={14} />, label: 'Cancel invoice', danger: true },
  ].filter(Boolean) : [];
  const onMore = ({ key }) => {
    if (key === 'einvoice') openEinvoice();
    if (key === 'writeoff') openWriteOff();
    if (key === 'cancel') { cancelForm.resetFields(); setCancelOpen(true); }
  };

  return (
    <div>
      <ArTasks kinds={['CREDIT_NOTE', 'WRITE_OFF']} />
      <Card style={{ ...card, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space size={16}>
              <div className="page-header-icon"><HandCoins size={24} /></div>
              <div>
                <h2 className="page-header-title">Customer Invoices</h2>
                <Text type="secondary">Invoices raised from deliveries or recorded directly, with their payments, reminders and accounting entries</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Button icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>
              {canChange && <Button icon={<BellRing size={16} />} onClick={remindAll} loading={reminding} disabled={!summary.overdue_count}>Send overdue reminders</Button>}
              {canAdd && <Button type="primary" icon={<FilePlus2 size={16} />} onClick={openIntake}>New invoice / upload</Button>}
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
            {extraction && !extraction.matches?.customer && (
              <Alert
                style={{ marginBottom: 16 }} type="warning" showIcon
                message={`${p.name?.value || 'The customer on this document'}${p.gst_number?.value ? ` (${p.gst_number.value})` : ''} is not in Customers yet`}
                description="Customers are added in Accounts Receivable → Customers and verified by an approver before they can be invoiced."
                action={<Button size="small" onClick={() => navigate('/finance/ar/customers')}>Open Customers</Button>}
              />
            )}
            <Form.Item
              name="customer_id"
              label="Customer"
              rules={[{ required: true, message: 'Choose the customer' }]}
              extra={extraction?.matches?.customer ? <Text type="success" style={{ fontSize: 12 }}>Matched existing customer by {extraction.matches.customer.matched_by === 'GSTIN' ? 'GSTIN' : 'name'}</Text> : <Text type="secondary" style={{ fontSize: 12 }}>Only verified, active customers can be invoiced. New customers are added in Customers.</Text>}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Choose a verified customer"
                options={customers.map((c) => ({
                  value: c.id, disabled: c.status !== 'ACTIVE',
                  label: `${c.customer_name}${c.gst_number ? ` · ${c.gst_number}` : ''}${c.status === 'ACTIVE' ? '' : c.status === 'PENDING' ? ' (not verified yet)' : c.status === 'ON_HOLD' ? ' (on hold)' : ' (rejected)'}`,
                }))}
              />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="direct_reason" label="Why is there no sales order or delivery?" rules={[{ required: true, message: 'Choose the reason' }]} extra="Invoices for goods are normally raised from a confirmed delivery (Sales Orders → Deliveries).">
                  <Select options={DIRECT_REASONS} placeholder="Choose the reason" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                {directReason === 'OTHER' && (
                  <Form.Item name="direct_reason_text" label="Describe the reason" rules={[{ required: true, min: 3, message: 'Describe the reason' }]}><Input maxLength={200} /></Form.Item>
                )}
              </Col>
            </Row>
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
              <Col xs={24} md={8}><Form.Item name="customer_po_number" label="Customer PO no."><Input /></Form.Item></Col>
              <Col xs={12} md={8}><Form.Item name="amount_received" label="Amount already received" extra="Leave empty if nothing has been paid yet"><InputNumber style={{ width: '100%' }} min={0} prefix="₹" /></Form.Item></Col>
              <Col xs={12} md={8}><Form.Item name="payment_mode" label="Payment mode"><Select allowClear options={MODES} /></Form.Item></Col>
            </Row>
            <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
            <Collapse
              size="small" style={{ marginBottom: 16 }}
              items={[{
                key: 'einv', label: 'e-invoice (IRN) and e-way bill, if issued',
                children: (
                  <Row gutter={12}>
                    <Col xs={24}><Form.Item name="irn" label="IRN (64 characters, from the e-invoice portal)"><Input maxLength={64} /></Form.Item></Col>
                    <Col xs={12} md={8}><Form.Item name="irn_ack_number" label="Acknowledgement no."><Input maxLength={30} /></Form.Item></Col>
                    <Col xs={12} md={8}><Form.Item name="irn_ack_date" label="Acknowledgement date"><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item></Col>
                    <Col xs={24} md={8}><Form.Item name="eway_bill_number" label="E-way bill no. (12 digits)"><Input maxLength={12} /></Form.Item></Col>
                  </Row>
                ),
              }]}
            />
            <ChecksPanel checks={checks} checking={checking} />
          </Form>
        )}
      </Drawer>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        width={Math.min(720, window.innerWidth)}
        title={detail ? <Space wrap size={8}>{detail.invoice_number}<InvoiceStatus row={detail} /></Space> : ''}
      >
        {detail && (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {/* Actions sit under the title, not beside it, so the invoice number is never cut off. */}
            {((open && (canAdd || canChange)) || moreItems.length > 0) && (
              <Space wrap>
                {open && canAdd && <Button type="primary" icon={<HandCoins size={15} />} onClick={() => { receiptForm.setFieldsValue({ amount: detail.outstanding, received_date: dayjs() }); setReceiptOpen(true); }}>Record payment</Button>}
                {open && canAdd && <Button icon={<FileMinus2 size={15} />} onClick={openCredit}>Raise credit note</Button>}
                {open && canChange && !detail.in_dispute && <Button icon={<BellRing size={15} />} loading={acting} onClick={() => act(() => api.post(`/ar/invoices/${detail.id}/remind`))}>Send reminder</Button>}
                {moreItems.length > 0 && <Dropdown trigger={['click']} menu={{ items: moreItems, onClick: onMore }}><Button icon={<MoreHorizontal size={15} />}>More</Button></Dropdown>}
              </Space>
            )}
            {detail.in_dispute && <Alert type="warning" showIcon message="In dispute" description="A credit note request on this invoice is waiting for a decision. Reminders are paused until it is approved or rejected (Credit Notes page)." action={<Button size="small" onClick={() => navigate('/finance/ar/credit-notes')}>Open</Button>} />}
            {detail.overdue && <Alert type="error" showIcon message={`${detail.days_overdue} days overdue · ${inr(detail.outstanding)} outstanding`} />}
            <Descriptions size="small" column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }} bordered>
              <Descriptions.Item label="Customer">{detail.customer?.customer_name}</Descriptions.Item>
              <Descriptions.Item label="Customer GSTIN">{detail.customer?.gst_number || '—'}</Descriptions.Item>
              <Descriptions.Item label="Invoice date">{fmt(detail.invoice_date)}</Descriptions.Item>
              <Descriptions.Item label="Due date">{fmt(detail.due_date)}</Descriptions.Item>
              <Descriptions.Item label="Total">{inr(detail.total_amount)}</Descriptions.Item>
              <Descriptions.Item label="GST">{Number(detail.igst_amount) > 0 ? `IGST ${inr(detail.igst_amount)}` : Number(detail.tax_amount) > 0 ? `CGST ${inr(detail.cgst_amount)} + SGST ${inr(detail.sgst_amount)}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Sales order">{detail.salesOrder?.order_number || <Text type="secondary">No delivery{detail.direct_reason_label ? `: ${detail.direct_reason_label}` : ''}</Text>}</Descriptions.Item>
              <Descriptions.Item label="Received">{inr(detail.amount_received)}</Descriptions.Item>
              <Descriptions.Item label="TDS deducted">{inr(detail.tds_deducted)}</Descriptions.Item>
              {Number(detail.credited_amount) > 0 && <Descriptions.Item label="Credit notes">{inr(detail.credited_amount)}</Descriptions.Item>}
              {Number(detail.discount_allowed) > 0 && <Descriptions.Item label="Early-payment discount">{inr(detail.discount_allowed)}</Descriptions.Item>}
              {Number(detail.written_off_amount) > 0 && <Descriptions.Item label="Written off">{inr(detail.written_off_amount)}</Descriptions.Item>}
              <Descriptions.Item label="Outstanding"><Text strong>{inr(detail.outstanding)}</Text></Descriptions.Item>
              <Descriptions.Item label="Reminder email">{detail.customer?.email || <Text type="secondary">No email on file</Text>}</Descriptions.Item>
              <Descriptions.Item label="e-invoice IRN">{detail.irn ? <Text copyable style={{ fontSize: 12 }}>{detail.irn}</Text> : <Text type="secondary">Not recorded</Text>}</Descriptions.Item>
              <Descriptions.Item label="E-way bill">{detail.eway_bill_number || '—'}</Descriptions.Item>
            </Descriptions>
            {detail.creditNotes?.length > 0 && (
              <Table size="small" rowKey="id" pagination={false} title={() => <Text strong>Disputes and credit notes</Text>} dataSource={detail.creditNotes} columns={[
                { title: 'Credit note', key: 'no', render: (_, r) => r.credit_note_number || `Request #${r.id}` },
                { title: 'Reason', dataIndex: 'reason_code', render: (v) => ({ DAMAGED: 'Damaged in transit', PRICING: 'Pricing difference', SHORT_SHIPMENT: 'Short shipment', RETURN: 'Goods returned', OTHER: 'Other' }[v] || v) },
                { title: 'Amount', dataIndex: 'total_amount', align: 'right', render: (v) => inr(v) },
                { title: 'Status', dataIndex: 'status', render: (v) => <ArStatus status={v} kind="credit" /> },
              ]} />
            )}
            {detail.writeOffs?.length > 0 && (
              <Table size="small" rowKey="id" pagination={false} title={() => <Text strong>Write-offs</Text>} dataSource={detail.writeOffs} columns={[
                { title: 'Write-off', key: 'no', render: (_, r) => r.write_off_number || `Request #${r.id}` },
                { title: 'Reason', dataIndex: 'reason' },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => inr(v) },
                { title: 'Recovered', dataIndex: 'recovered_amount', align: 'right', render: (v) => (Number(v) > 0 ? inr(v) : '—') },
                { title: 'Status', dataIndex: 'status', render: (v) => <ArStatus status={v} kind="credit" /> },
              ]} />
            )}
            {detail.receipts?.length > 0 && (
              <Table size="small" rowKey="id" pagination={false} title={() => <Text strong>Payments received</Text>} dataSource={detail.receipts} columns={[
                { title: 'Date', dataIndex: 'received_date', render: fmt },
                { title: 'Mode', dataIndex: 'payment_mode', render: (v) => v || '—' },
                { title: 'Reference', dataIndex: 'reference', render: (v) => v || '—' },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v, r) => <Space size={4}>{inr(v)}{r.unapplied_id && <Tag>From unapplied cash</Tag>}</Space> },
                { title: 'TDS', dataIndex: 'tds_amount', align: 'right', render: (v) => (Number(v) > 0 ? inr(v) : '—') },
                { title: 'Discount', dataIndex: 'discount_amount', align: 'right', render: (v) => (Number(v) > 0 ? inr(v) : '—') },
              ]} />
            )}
            {detail.promises?.length > 0 && (
              <Table size="small" rowKey="id" pagination={false} title={() => <Text strong>Promises to pay</Text>} dataSource={detail.promises} columns={[
                { title: 'Promised for', dataIndex: 'promised_date', render: fmt },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => inr(v) },
                { title: 'Note', dataIndex: 'note', render: (v) => v || '—' },
                { title: 'Status', dataIndex: 'status', render: (v) => <ArStatus status={v} /> },
              ]} />
            )}
            {detail.reminders?.length > 0 && (
              <Table size="small" rowKey="id" pagination={false} title={() => <Text strong>Reminders</Text>} dataSource={detail.reminders} columns={[
                { title: 'Sent', dataIndex: 'created_at', render: (v, r) => dayjs(v || r.createdAt).format('DD MMM YYYY, h:mm A') },
                { title: 'Step', dataIndex: 'stage', render: (v, r) => <Space size={4}>{({ UPCOMING: 'Due soon', FIRST: 'First', SECOND: 'Second', FINAL: 'Final notice', ESCALATED: 'Escalated' }[v]) || '—'}{r.drafted_by_ai && <Tag color="geekblue">AI</Tag>}</Space> },
                { title: 'To', dataIndex: 'to_email', render: (v) => v || '—' },
                { title: 'Delivery', dataIndex: 'delivery', render: (v, r) => (v === 'EMAILED' ? <Tag color="success">Emailed</Tag> : <Tag title={r.delivery_note}>Recorded only</Tag>) },
              ]} />
            )}
            {detail.journals?.length > 0 && (
              <div>
                <Text strong>Accounting entries</Text>
                {detail.journals.map((j) => (
                  <Card key={j.id} size="small" style={{ marginTop: 8, borderRadius: 12 }} title={<Space size={8}><span>{j.je_number}</span><Text type="secondary" style={{ fontWeight: 400 }}>{fmt(j.entry_date)} · {j.narration}</Text></Space>}>
                    <JournalLines lines={j.lines} />
                  </Card>
                ))}
              </div>
            )}
            <div>
              <Text strong>History</Text>
              <Timeline style={{ marginTop: 12 }} items={arHistoryItems(detail.history)} />
            </div>
          </Space>
        )}
      </Drawer>

      <Modal open={receiptOpen} title="Record payment received" onCancel={() => setReceiptOpen(false)} onOk={recordReceipt} confirmLoading={acting} okText="Record payment" destroyOnClose>
        <Form form={receiptForm} layout="vertical">
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="amount" label={`Amount received (outstanding ${detail ? inr(detail.outstanding) : ''})`} rules={[{ required: true, message: 'Enter the amount' }]} extra="Less than the outstanding amount records a partial payment.">
                <InputNumber style={{ width: '100%' }} min={0} max={detail ? Number(detail.outstanding) : undefined} prefix="₹" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="tds_amount" label="TDS deducted" extra="Withheld by the customer; not banked.">
                <InputNumber style={{ width: '100%' }} min={0} max={detail ? Number(detail.outstanding) : undefined} prefix="₹" />
              </Form.Item>
            </Col>
          </Row>
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

      <Modal open={creditOpen} title={`Dispute and credit note: ${detail?.invoice_number || ''}`} onCancel={() => setCreditOpen(false)} onOk={raiseCredit} confirmLoading={acting} okText={`Send for approval (${inr(creditTotal)})`} width={760} destroyOnClose>
        <Alert style={{ marginBottom: 12 }} type="info" showIcon message="An approver other than you, with a limit covering the total, approves it. Until then the invoice is in dispute and reminders pause. The credit note reverses the GST charged on the credited value." />
        <Form form={creditForm} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} md={10}><Form.Item name="reason_code" label="Reason" rules={[{ required: true, message: 'Choose the reason' }]}><Select options={reasons} placeholder="Damaged, pricing, short shipment…" /></Form.Item></Col>
            <Col xs={24} md={14}><Form.Item name="description" label="What did the customer report?" rules={[{ required: true, message: 'Describe it' }]}><Input.TextArea rows={2} maxLength={2000} /></Form.Item></Col>
          </Row>
        </Form>
        <Table size="small" rowKey="key" pagination={false} dataSource={creditLines} columns={[
          { title: '', key: 'pick', width: 36, render: (_, l) => <Checkbox checked={l.pick} onChange={(e) => setLine(l.key, { pick: e.target.checked })} /> },
          { title: 'Line', dataIndex: 'description', render: (v, l) => (l.line_index === null ? <Input value={v} onChange={(e) => setLine(l.key, { description: e.target.value })} /> : v) },
          { title: 'Qty', key: 'qty', width: 110, render: (_, l) => <InputNumber size="small" min={0} max={l.max_qty} value={l.quantity} onChange={(v) => setLine(l.key, { quantity: Number(v || 0) })} style={{ width: '100%' }} /> },
          { title: 'Rate', key: 'rate', width: 130, render: (_, l) => <InputNumber size="small" min={0} max={l.max_rate} value={l.rate} onChange={(v) => setLine(l.key, { rate: Number(v || 0) })} prefix="₹" style={{ width: '100%' }} /> },
          { title: 'GST %', dataIndex: 'gst_percent', width: 70 },
          { title: 'Credit', key: 'amt', align: 'right', render: (_, l) => (l.pick ? inr(Math.round(l.quantity * l.rate * (1 + l.gst_percent / 100) * 100) / 100) : '—') },
        ]} />
        <div style={{ marginTop: 12 }}>{evidencePicker}</div>
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>For a pricing difference, credit the price difference as the rate. Quantities cannot exceed what was invoiced.</Text>
      </Modal>

      <Modal open={writeOffOpen} title={`Request write-off: ${detail?.invoice_number || ''}`} onCancel={() => setWriteOffOpen(false)} onOk={requestWriteOff} confirmLoading={acting} okText="Send for approval" destroyOnClose>
        <Alert style={{ marginBottom: 12 }} type="warning" showIcon message="Finance approves write-offs up to ₹1,00,000; above that the Director / CFO. The reminders and promises on this invoice are attached as the collection history." description="GST already paid on the sale is not refunded on a bad debt. The income-tax deduction for bad debts is section 36(1)(vii) of the 1961 Act, renumbered under the Income-tax Act 2025." />
        <Form form={writeOffForm} layout="vertical">
          <Form.Item name="amount" label={`Amount to write off (outstanding ${detail ? inr(detail.outstanding) : ''})`} rules={[{ required: true, message: 'Enter the amount' }]}>
            <InputNumber style={{ width: '100%' }} min={0} max={detail ? Number(detail.outstanding) : undefined} prefix="₹" />
          </Form.Item>
          <Form.Item name="reason" label="Why can it not be collected?" rules={[{ required: true, message: 'Give the reason' }]}><Input.TextArea rows={3} maxLength={500} placeholder="e.g. Customer in insolvency; claim filed with the resolution professional" /></Form.Item>
        </Form>
        {evidencePicker}
      </Modal>

      <Modal open={einvoiceOpen} title={`e-invoice details: ${detail?.invoice_number || ''}`} onCancel={() => setEinvoiceOpen(false)} onOk={saveEinvoice} confirmLoading={acting} okText="Save" destroyOnClose>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>Enter the IRN and acknowledgement from the government e-invoice portal (IRP), and the e-way bill number if the goods moved with one. LedgerLine does not generate them itself.</Text>
        <Form form={einvoiceForm} layout="vertical">
          <Form.Item name="irn" label="IRN (64 characters)" rules={[{ pattern: /^[0-9a-fA-F]{64}$/, message: 'The IRN is 64 characters: digits and letters a–f' }]}><Input maxLength={64} /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="irn_ack_number" label="Acknowledgement no."><Input maxLength={30} /></Form.Item></Col>
            <Col span={12}><Form.Item name="irn_ack_date" label="Acknowledgement date"><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item></Col>
          </Row>
          <Form.Item name="eway_bill_number" label="E-way bill no." rules={[{ pattern: /^\d{12}$/, message: '12 digits' }]}><Input maxLength={12} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ArCustomerInvoices;
