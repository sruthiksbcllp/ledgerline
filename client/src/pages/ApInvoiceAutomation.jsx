import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Row, Segmented,
  Select, Space, Table, Tag, Typography, message,
} from 'antd';
import { CheckCircle2, FilePlus2, PenLine, ReceiptIndianRupee, RefreshCcw, Sparkles, Trash2, XCircle } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../utils/api';
import { inr } from '../utils/apLedger';
import { ChecksPanel, DocumentDropzone, StatusTag } from '../components/finance/DocumentReview';
import { checkUploadFile, markProps } from '../utils/documentReview';
import { ActivityTrail, lastActionColumn, useLastActions } from '../components/procurement/ActivityTrail';
import InvoiceDocument from '../components/procurement/InvoiceDocument';

const { Text } = Typography;

const card = { borderRadius: 16, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'UNPAID' },
  { label: 'Approved', value: 'APPROVED_FOR_PAYMENT' },
  { label: 'Partially Paid', value: 'PARTIAL' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Rejected', value: 'REJECTED' },
];
const listOf = (res) => res?.data?.data || res?.data || [];
const fmt = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');

const ApInvoiceAutomation = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [vendors, setVendors] = useState([]);
  const [pos, setPos] = useState([]);
  const [properties, setProperties] = useState([]);

  // New-invoice drawer
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [step, setStep] = useState('upload'); // upload | review
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [checks, setChecks] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const validateTimer = useRef(null);

  // Detail drawer
  const [detail, setDetail] = useState(null);
  const [acting, setActing] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [payForm] = Form.useForm();
  const [rejectForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/procurement/ap-invoices');
      setRows(listOf(res));
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadLookups = async () => {
    const [v, p, pr] = await Promise.all([
      api.get('/masters/vendors').catch(() => null),
      api.get('/procurement/po').catch(() => null),
      api.get('/masters/properties').catch(() => null),
    ]);
    setVendors(listOf(v));
    setPos(listOf(p));
    setProperties(listOf(pr));
  };

  const totals = useMemo(() => {
    const sum = (status) => rows.filter((r) => r.status === status);
    return [
      { key: 'UNPAID', label: 'Pending approval', items: sum('UNPAID') },
      { key: 'APPROVED_FOR_PAYMENT', label: 'Approved, unpaid', items: sum('APPROVED_FOR_PAYMENT') },
      { key: 'PARTIAL', label: 'Partially paid', items: sum('PARTIAL') },
      { key: 'OVERDUE', label: 'Overdue', items: rows.filter((r) => r.overdue) },
    ].map((t) => ({ ...t, amount: t.items.reduce((s, r) => s + Number(r.balance || 0), 0) }));
  }, [rows]);

  const visible = filter === 'ALL' ? rows : rows.filter((r) => r.status === filter);

  // ── Intake ────────────────────────────────────────────────────────────────
  const openIntake = () => {
    form.resetFields();
    setExtraction(null);
    setSourceFile(null);
    setChecks(null);
    setStep('upload');
    setIntakeOpen(true);
    loadLookups();
  };

  const formToPayload = () => {
    const v = form.getFieldsValue(true);
    return {
      vendor_id: v.vendor_id,
      po_id: v.po_id || null,
      property_id: v.property_id || null,
      invoice_number: v.invoice_number,
      invoice_date: v.invoice_date ? v.invoice_date.format('YYYY-MM-DD') : null,
      due_date: v.due_date ? v.due_date.format('YYYY-MM-DD') : null,
      subtotal: v.subtotal,
      tax_rate_percent: v.tax_rate_percent,
      tax_amount: v.tax_amount,
      total_amount: v.total_amount,
      hsn_sac_code: v.hsn_sac_code,
      line_items: (v.line_items || []).filter((l) => l && (l.description || l.amount)),
      source: extraction ? 'AI_EXTRACTED' : 'MANUAL',
    };
  };

  const runValidate = async () => {
    setChecking(true);
    try {
      const res = await api.post('/procurement/ap-invoices/validate', formToPayload());
      setChecks(res?.data?.data?.checks || []);
    } catch { /* keep the previous checks */ } finally {
      setChecking(false);
    }
  };
  const scheduleValidate = () => {
    clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(runValidate, 600);
  };

  const onDocument = async (file) => {
    const problem = checkUploadFile(file);
    if (problem) { message.error(problem); return; }
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/procurement/ap-invoices/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
      const data = res?.data?.data;
      if (data.document_type && !['INVOICE', 'CREDIT_NOTE'].includes(data.document_type)) {
        message.warning(`This looks like a ${data.document_type.replace(/_/g, ' ').toLowerCase()}, not a vendor invoice. Check the details carefully.`);
      }
      const h = data.header;
      const m = data.matches || {};
      form.setFieldsValue({
        vendor_id: m.vendor?.id,
        po_id: m.purchase_order?.id,
        property_id: m.purchase_order?.property_id,
        invoice_number: h.invoice_number.value || undefined,
        invoice_date: h.invoice_date.value ? dayjs(h.invoice_date.value) : undefined,
        due_date: h.due_date.value ? dayjs(h.due_date.value) : undefined,
        subtotal: h.subtotal.value ? Number(h.subtotal.value) : undefined,
        tax_rate_percent: h.tax_rate_percent.value ? Number(h.tax_rate_percent.value) : undefined,
        tax_amount: h.tax_amount.value ? Number(h.tax_amount.value) : undefined,
        total_amount: h.total_amount.value ? Number(h.total_amount.value) : undefined,
        line_items: data.line_items.length ? data.line_items : undefined,
      });
      setExtraction(data);
      setSourceFile(file);
      setStep('review');
      runValidate();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not read the document. Enter the invoice manually.');
    } finally {
      setExtracting(false);
    }
  };

  const enterManually = () => {
    setExtraction(null);
    setSourceFile(null);
    form.setFieldsValue({ invoice_date: dayjs(), due_date: dayjs().add(30, 'day'), tax_rate_percent: 18 });
    setStep('review');
    runValidate();
  };

  const submitInvoice = async () => {
    try {
      await form.validateFields();
    } catch { return; }
    setSaving(true);
    try {
      const res = await api.post('/procurement/ap-invoices', formToPayload());
      const created = res?.data?.data;
      if (sourceFile && created?.id) {
        const fd = new FormData();
        fd.append('file', sourceFile);
        await api.post(`/procurement/invoices/${created.id}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).catch(() => {});
      }
      message.success(res?.data?.message || 'Invoice submitted for approval');
      setIntakeOpen(false);
      load();
    } catch (e) {
      const data = e?.response?.data;
      if (data?.checks) setChecks(data.checks);
      message.error(data?.message || 'Could not submit the invoice');
    } finally {
      setSaving(false);
    }
  };

  const recalcTotal = () => {
    const { subtotal, tax_amount: tax } = form.getFieldsValue(['subtotal', 'tax_amount']);
    if (subtotal != null && tax != null) form.setFieldValue('total_amount', Math.round((Number(subtotal) + Number(tax)) * 100) / 100);
  };
  const recalcTax = () => {
    const { subtotal, tax_rate_percent: rate } = form.getFieldsValue(['subtotal', 'tax_rate_percent']);
    if (subtotal != null && rate != null) {
      form.setFieldValue('tax_amount', Math.round(Number(subtotal) * Number(rate)) / 100);
      recalcTotal();
    }
  };

  const h = extraction?.header || {};
  const matches = extraction?.matches || {};
  const vendorOptions = vendors.map((v) => ({ value: v.id, label: `${v.vendor_name}${v.gst_number ? ` · ${String(v.gst_number).trim()}` : ''}` }));
  const selectedVendor = Form.useWatch('vendor_id', form);
  const poOptions = pos
    .filter((p) => !selectedVendor || Number(p.vendor_id) === Number(selectedVendor))
    .map((p) => ({ value: p.id, label: `${p.po_number}${p.total_amount ? ` · ${inr(p.total_amount)}` : ''}` }));

  // ── Detail actions ────────────────────────────────────────────────────────
  const openDetail = async (id) => {
    try {
      const res = await api.get(`/procurement/ap-invoices/${id}`);
      setDetail(res?.data?.data);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not open the invoice');
    }
  };
  const act = async (fn, success) => {
    setActing(true);
    try {
      const res = await fn();
      message.success(res?.data?.message || success);
      await openDetail(detail.id);
      load();
      return true;
    } catch (e) {
      message.error(e?.response?.data?.message || 'Action failed');
      return false;
    } finally {
      setActing(false);
    }
  };
  const approve = () => act(() => api.put(`/procurement/ap-invoices/${detail.id}/approve`, {}), 'Approved');
  const reject = async () => {
    const { reason } = await rejectForm.validateFields();
    if (await act(() => api.put(`/procurement/ap-invoices/${detail.id}/reject`, { reason }), 'Rejected')) setRejectOpen(false);
  };
  const pay = async () => {
    const v = await payForm.validateFields();
    const ok = await act(() => api.post(`/procurement/ap-invoices/${detail.id}/payments`, {
      ...v, payment_date: v.payment_date ? v.payment_date.format('YYYY-MM-DD') : undefined,
    }), 'Payment recorded');
    if (ok) setPayOpen(false);
  };

  const lastActions = useLastActions('INVOICE', rows, rows);

  const columns = [
    { title: 'Invoice', dataIndex: 'invoice_number', render: (v, r) => <Space size={6}><Text strong>{v}</Text>{r.source === 'AI_EXTRACTED' && <Tag icon={<Sparkles size={11} style={{ marginRight: 3 }} />} color="geekblue">AI</Tag>}</Space> },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r.Vendor?.vendor_name || '—' },
    { title: 'PO', key: 'po', render: (_, r) => r.PurchaseOrder?.po_number || <Text type="secondary">—</Text> },
    { title: 'Invoice date', dataIndex: 'invoice_date', render: fmt },
    { title: 'Due', dataIndex: 'due_date', render: (v, r) => <Space size={6}>{fmt(v)}{r.overdue && <Tag color="error">Overdue</Tag>}</Space> },
    { title: 'Total', dataIndex: 'total_amount', align: 'right', render: (v) => inr(v) },
    { title: 'Balance', dataIndex: 'balance', align: 'right', render: (v) => inr(v) },
    { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag status={v} /> },
    lastActionColumn('INVOICE', lastActions, { numberOf: (r) => r.invoice_number }),
    { title: '', key: 'open', render: (_, r) => <Button type="link" onClick={() => openDetail(r.id)}>Open</Button> },
  ];

  return (
    <div>
      <Card style={{ ...card, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space size={16}>
              <div className="page-header-icon"><ReceiptIndianRupee size={24} /></div>
              <div>
                <h2 className="page-header-title">AI Invoice Processing</h2>
                <Text type="secondary">Upload a vendor bill → AI extracts it → match &amp; validate → approve → pay</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>
              <Button type="primary" icon={<FilePlus2 size={16} />} onClick={openIntake}>New vendor invoice</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {totals.map((t) => (
          <Col xs={12} lg={6} key={t.key}>
            <Card style={card} styles={{ body: { padding: '14px 18px' } }} hoverable={t.key !== 'OVERDUE'} onClick={() => t.key !== 'OVERDUE' && setFilter(t.key)}>
              <Text type="secondary">{t.label}</Text>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{inr(t.amount)}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{t.items.length} invoice{t.items.length === 1 ? '' : 's'}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={card} styles={{ body: { padding: 0 } }} title={<Segmented value={filter} onChange={setFilter} options={FILTERS} />}>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={visible} scroll={{ x: 'max-content' }} pagination={{ pageSize: 15, hideOnSinglePage: true }} />
      </Card>

      {/* New invoice: upload -> review -> submit */}
      <Drawer
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        width={Math.min(940, window.innerWidth)}
        title="New vendor invoice"
        destroyOnClose
        extra={step === 'review' && (
          <Space>
            <Button onClick={() => setStep('upload')}>Back</Button>
            <Button type="primary" loading={saving} disabled={checks?.some((c) => c.severity === 'error')} onClick={submitInvoice}>Submit for approval</Button>
          </Space>
        )}
      >
        {step === 'upload' && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <DocumentDropzone
              onFile={onDocument}
              loading={extracting}
              title="Drop a vendor invoice here, or click to upload"
              hint="PDF or image up to 10 MB. AI reads the vendor, invoice number, dates, line items, GST and totals; you review everything before it is submitted."
            />
            <div style={{ textAlign: 'center' }}>
              <Button type="link" icon={<PenLine size={14} />} onClick={enterManually} disabled={extracting}>Enter the invoice manually instead</Button>
            </div>
          </Space>
        )}

        {step === 'review' && (
          <Form form={form} layout="vertical" onValuesChange={scheduleValidate} requiredMark>
            {extraction && (
              <Alert
                style={{ marginBottom: 16 }}
                type="info"
                showIcon
                icon={<Sparkles size={16} />}
                message={`Read from ${sourceFile?.name || 'document'}`}
                description="Highlighted fields need a check. Nothing is saved until you submit."
              />
            )}
            {matches.duplicate && (
              <Alert style={{ marginBottom: 16 }} type="error" showIcon message={`Already recorded: invoice ${matches.duplicate.invoice_number} (#${matches.duplicate.id}) from this vendor`} />
            )}

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="vendor_id"
                  label="Vendor"
                  rules={[{ required: true, message: 'Select the vendor' }]}
                  extra={extraction && (matches.vendor
                    ? <Text type="success" style={{ fontSize: 12 }}><CheckCircle2 size={12} /> Matched by {matches.vendor.matched_by === 'GSTIN' ? 'GSTIN' : 'name'}</Text>
                    : <Text type="warning" style={{ fontSize: 12 }}>No vendor matches “{extraction.party.name.value || 'unknown'}”{extraction.party.gst_number.value ? ` (${extraction.party.gst_number.value})` : ''}. Pick one or add it in Vendor Master.</Text>)}
                >
                  <Select showSearch optionFilterProp="label" placeholder="Select vendor" options={vendorOptions} allowClear />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="po_id"
                  label="Purchase order"
                  extra={extraction && h.po_number?.value && !matches.purchase_order
                    ? <Text type="warning" style={{ fontSize: 12 }}>Invoice mentions PO “{h.po_number.value}”, which was not found</Text>
                    : (matches.po_vendor_mismatch ? <Text type="danger" style={{ fontSize: 12 }}>This PO belongs to a different vendor</Text> : null)}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    allowClear
                    placeholder="Link a PO for matching"
                    options={poOptions}
                    onChange={(id) => {
                      const po = pos.find((p) => p.id === id);
                      if (po?.property_id) form.setFieldValue('property_id', po.property_id);
                    }}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="invoice_number" label="Invoice number" rules={[{ required: true, message: 'Required' }]} {...markProps(h.invoice_number)}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="invoice_date" label="Invoice date" rules={[{ required: true, message: 'Required' }]} {...markProps(h.invoice_date)}>
                  <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="due_date" label="Due date" {...markProps(h.due_date)}>
                  <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="property_id" label="Property / site" rules={[{ required: true, message: 'Select where this bill belongs' }]}>
                  <Select showSearch optionFilterProp="label" placeholder="Select property" options={properties.map((p) => ({ value: p.id, label: p.property_name }))} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="hsn_sac_code" label="HSN / SAC"><Input /></Form.Item>
              </Col>
            </Row>

            <Text strong>Line items</Text>
            <Form.List name="line_items">
              {(fields, { add, remove }) => (
                <div style={{ marginTop: 8, marginBottom: 16 }}>
                  {fields.map((f) => (
                    <Row gutter={8} key={f.key} align="top">
                      <Col flex="auto"><Form.Item name={[f.name, 'description']} style={{ marginBottom: 8 }}><Input placeholder="Description" /></Form.Item></Col>
                      <Col flex="90px"><Form.Item name={[f.name, 'quantity']} style={{ marginBottom: 8 }}><InputNumber placeholder="Qty" style={{ width: '100%' }} min={0} /></Form.Item></Col>
                      <Col flex="130px"><Form.Item name={[f.name, 'unit_price']} style={{ marginBottom: 8 }}><InputNumber placeholder="Rate" style={{ width: '100%' }} min={0} /></Form.Item></Col>
                      <Col flex="140px"><Form.Item name={[f.name, 'amount']} style={{ marginBottom: 8 }}><InputNumber placeholder="Amount" style={{ width: '100%' }} min={0} /></Form.Item></Col>
                      <Col flex="40px"><Button type="text" danger icon={<Trash2 size={15} />} onClick={() => remove(f.name)} /></Col>
                    </Row>
                  ))}
                  <Button size="small" onClick={() => add({})}>Add line</Button>
                </div>
              )}
            </Form.List>

            <Row gutter={16}>
              <Col xs={12} md={6}>
                <Form.Item name="subtotal" label="Subtotal" {...markProps(h.subtotal)}>
                  <InputNumber style={{ width: '100%' }} min={0} prefix="₹" onBlur={recalcTax} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="tax_rate_percent" label="GST %" {...markProps(h.tax_rate_percent)}>
                  <InputNumber style={{ width: '100%' }} min={0} max={100} onBlur={recalcTax} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="tax_amount" label="GST amount" {...markProps(h.tax_amount)}>
                  <InputNumber style={{ width: '100%' }} min={0} prefix="₹" onBlur={recalcTotal} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item name="total_amount" label="Invoice total" rules={[{ required: true, message: 'Required' }]} {...markProps(h.total_amount)}>
                  <InputNumber style={{ width: '100%' }} min={0} prefix="₹" />
                </Form.Item>
              </Col>
            </Row>

            <ChecksPanel checks={checks} checking={checking} />
          </Form>
        )}
      </Drawer>

      {/* Invoice detail: approve / reject / pay / history */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        width={Math.min(760, window.innerWidth)}
        title={detail ? <Space>Invoice {detail.invoice_number}<StatusTag status={detail.status} /></Space> : ''}
        extra={detail && (
          <Space>
            {detail.status === 'UNPAID' && <Button type="primary" icon={<CheckCircle2 size={15} />} loading={acting} onClick={approve}>Approve</Button>}
            {['UNPAID', 'APPROVED_FOR_PAYMENT', 'EXCEPTION'].includes(detail.status) && Number(detail.paid_amount) === 0 && (
              <Button danger icon={<XCircle size={15} />} onClick={() => { rejectForm.resetFields(); setRejectOpen(true); }}>Reject</Button>
            )}
            {['APPROVED_FOR_PAYMENT', 'PARTIAL'].includes(detail.status) && (
              <Button type="primary" onClick={() => { payForm.setFieldsValue({ amount: Number(detail.balance), payment_date: dayjs() }); setPayOpen(true); }}>Record payment</Button>
            )}
          </Space>
        )}
      >
        {detail && (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {detail.status === 'REJECTED' && <Alert type="error" showIcon message="Rejected" description={detail.rejection_reason} />}
            <Descriptions size="small" column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }} bordered>
              <Descriptions.Item label="Vendor">{detail.Vendor?.vendor_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="PO">{detail.PurchaseOrder?.po_number || '—'}</Descriptions.Item>
              <Descriptions.Item label="Invoice date">{fmt(detail.invoice_date)}</Descriptions.Item>
              <Descriptions.Item label="Due date">{fmt(detail.due_date)}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{inr(detail.base_amount)}</Descriptions.Item>
              <Descriptions.Item label="GST">{inr(detail.gst_amount)}</Descriptions.Item>
              <Descriptions.Item label="Total"><Text strong>{inr(detail.total_amount)}</Text></Descriptions.Item>
              <Descriptions.Item label="Balance due"><Text strong>{inr(detail.balance)}</Text></Descriptions.Item>
              <Descriptions.Item label="Vendor invoice" span={2}>
                <InvoiceDocument
                  url={detail.document_url}
                  uploadPath={detail.status !== 'PAID' ? `/procurement/invoices/${detail.id}/upload` : null}
                  onUploaded={() => { openDetail(detail.id); load(); }}
                />
              </Descriptions.Item>
            </Descriptions>
            {detail.lines?.length > 0 && (
              <Table size="small" rowKey="id" pagination={false} dataSource={detail.lines} columns={[
                { title: '#', dataIndex: 'line_no', width: 40 },
                { title: 'Description', dataIndex: 'description' },
                { title: 'Qty', dataIndex: 'quantity', align: 'right' },
                { title: 'Rate', dataIndex: 'unit_price', align: 'right', render: (v) => (v == null ? '—' : inr(v)) },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => inr(v) },
              ]} />
            )}
            {detail.payments?.length > 0 && (
              <Table size="small" rowKey="id" pagination={false} title={() => <Text strong>Payments</Text>} dataSource={detail.payments} columns={[
                { title: 'Date', dataIndex: 'payment_date', render: fmt },
                { title: 'Mode', dataIndex: 'payment_mode', render: (v) => v || '—' },
                { title: 'Reference', dataIndex: 'reference', render: (v) => v || '—' },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => inr(v) },
              ]} />
            )}
            <ActivityTrail module="INVOICE" id={detail.id} refreshKey={detail} />
          </Space>
        )}
      </Drawer>

      <Modal open={payOpen} title="Record payment" onCancel={() => setPayOpen(false)} onOk={pay} confirmLoading={acting} okText="Record payment" destroyOnClose>
        <Form form={payForm} layout="vertical">
          <Form.Item name="amount" label={`Amount (balance ${detail ? inr(detail.balance) : ''})`} rules={[{ required: true, message: 'Enter the amount' }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} max={detail ? Number(detail.balance) : undefined} prefix="₹" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="payment_date" label="Payment date"><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item></Col>
            <Col span={12}>
              <Form.Item name="payment_mode" label="Mode">
                <Select allowClear options={['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash'].map((m) => ({ value: m, label: m }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="reference" label="Reference (UTR / cheque no.)"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal open={rejectOpen} title="Reject invoice" onCancel={() => setRejectOpen(false)} onOk={reject} confirmLoading={acting} okText="Reject" okButtonProps={{ danger: true }} destroyOnClose>
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Give a reason' }]}>
            <Input.TextArea rows={3} placeholder="e.g. Rate differs from PO, duplicate of an earlier bill…" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ApInvoiceAutomation;
