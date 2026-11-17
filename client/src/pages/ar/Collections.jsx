import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tabs, Tag, Typography, Upload, message,
} from 'antd';
import { BellRing, Download, HandCoins, Handshake, PhoneCall, RefreshCcw, Sparkles } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { AI_ACCEPT, checkUploadFile } from '../../utils/documentReview';
import { useExcelExport } from '../../utils/apReports';
import { ArFlow, ArStatus, PageHeader, StageTag, Tiles } from '../../components/ar/ArShared';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;
const MODES = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash'].map((m) => ({ value: m, label: m }));
const TABS = ['worklist', 'receive', 'ageing'];

const Collections = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'worklist';
  const { exportSheets } = useExcelExport();

  // ── Worklist ────────────────────────────────────────────────────────────────
  const [work, setWork] = useState([]);
  const [summary, setSummary] = useState({});
  const [ladder, setLadder] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reminder, setReminder] = useState(null); // { row, draft }
  const [drafting, setDrafting] = useState(false);
  const [promiseFor, setPromiseFor] = useState(null);
  const [reminderForm] = Form.useForm();
  const [promiseForm] = Form.useForm();

  // ── Ageing ──────────────────────────────────────────────────────────────────
  const [ageing, setAgeing] = useState(null);

  // ── Receive payment ─────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState([]);
  const [openInvoices, setOpenInvoices] = useState([]);
  const [alloc, setAlloc] = useState({}); // invoice id -> { amount, tds_amount, matched_by }
  const [reading, setReading] = useState(false);
  const [advice, setAdvice] = useState(null); // { file, amount_paid, notes }
  const [payForm] = Form.useForm();
  const customerId = Form.useWatch('customer_id', payForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, a, c, i] = await Promise.all([
        api.get('/ar/collections/worklist'), api.get('/ar/reports/ageing'), api.get('/ar/customers'), api.get('/ar/invoices', { params: { status: 'UNPAID,PARTIALLY_PAID' } }),
      ]);
      setWork(w?.data?.data || []);
      setSummary(w?.data?.summary || {});
      setLadder(w?.data?.ladder || []);
      setAgeing(a?.data?.data || null);
      setCustomers(c?.data?.data || []);
      setOpenInvoices(i?.data?.data || []);
    } catch (e) {
      message.error(errorOf(e, 'Could not load collections'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openReminder = async (row, ai = false) => {
    setDrafting(true);
    try {
      const res = await api.get(`/ar/invoices/${row.id}/reminder-draft`, { params: ai ? { ai: 1 } : {}, timeout: 90000 });
      const draft = res?.data?.data;
      reminderForm.setFieldsValue({ subject: draft.subject, message: draft.message });
      setReminder({ row, draft });
      if (ai && draft.ai_note) message.warning(draft.ai_note);
    } catch (e) {
      message.error(errorOf(e, 'Could not prepare the reminder'));
    } finally {
      setDrafting(false);
    }
  };
  const sendReminder = async () => {
    const v = await reminderForm.validateFields();
    setBusy(true);
    try {
      const res = await api.post(`/ar/invoices/${reminder.row.id}/remind`, { ...v, drafted_by_ai: !!reminder.draft.drafted_by_ai });
      message.success(res?.data?.message || 'Reminder sent');
      setReminder(null);
      load();
    } catch (e) {
      message.error(errorOf(e, 'Could not send the reminder'));
    } finally {
      setBusy(false);
    }
  };
  const savePromise = async () => {
    const v = await promiseForm.validateFields();
    setBusy(true);
    try {
      const res = await api.post(`/ar/invoices/${promiseFor.id}/promises`, { ...v, promised_date: v.promised_date.format('YYYY-MM-DD') });
      message.success(res?.data?.message || 'Promise recorded');
      setPromiseFor(null);
      load();
    } catch (e) {
      message.error(errorOf(e, 'Could not record the promise'));
    } finally {
      setBusy(false);
    }
  };

  // ── Receive payment ─────────────────────────────────────────────────────────
  const customerInvoices = useMemo(
    () => openInvoices.filter((i) => i.customer_id === customerId).sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''))),
    [openInvoices, customerId],
  );
  const applied = useMemo(() => Object.values(alloc).reduce((s, a) => ({ cash: s.cash + Number(a.amount || 0), tds: s.tds + Number(a.tds_amount || 0) }), { cash: 0, tds: 0 }), [alloc]);
  const setLine = (id, patch) => setAlloc((s) => ({ ...s, [id]: { ...(s[id] || {}), ...patch } }));

  const readAdvice = async (file) => {
    const problem = checkUploadFile(file);
    if (problem) { message.error(problem); return false; }
    setReading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/ar/receipts/extract', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
      const d = res?.data?.data || {};
      payForm.setFieldsValue({
        customer_id: d.customer?.id || undefined, reference: d.reference || undefined,
        received_date: d.payment_date && dayjs(d.payment_date).isValid() && !dayjs(d.payment_date).isAfter(dayjs()) ? dayjs(d.payment_date) : dayjs(),
      });
      setAlloc(Object.fromEntries((d.allocations || []).map((a) => [a.invoice_id, { amount: a.amount, tds_amount: a.tds_amount || 0, matched_by: a.matched_by }])));
      setAdvice({ file: file.name, amount_paid: d.amount_paid, notes: d.notes || [] });
      message.success(d.allocations?.length ? `Proposed ${d.allocations.length} invoice${d.allocations.length === 1 ? '' : 's'}. Check before applying.` : 'Read the advice. Choose the invoices it pays.');
    } catch (e) {
      message.error(errorOf(e, 'Could not read the document. Apply the payment manually.'));
    } finally {
      setReading(false);
    }
    return false;
  };

  const applyPayment = async () => {
    let v;
    try { v = await payForm.validateFields(); } catch { return; }
    const allocations = Object.entries(alloc).map(([id, a]) => ({ invoice_id: Number(id), amount: Number(a.amount || 0), tds_amount: Number(a.tds_amount || 0) })).filter((a) => a.amount > 0 || a.tds_amount > 0);
    if (!allocations.length) { message.error('Enter the amount received against at least one invoice'); return; }
    setBusy(true);
    try {
      const res = await api.post('/ar/receipts/apply', { ...v, received_date: v.received_date?.format('YYYY-MM-DD'), allocations });
      message.success(res?.data?.message || 'Payment applied');
      setAlloc({});
      setAdvice(null);
      payForm.resetFields();
      payForm.setFieldsValue({ received_date: dayjs() });
      load();
    } catch (e) {
      message.error(errorOf(e, 'Could not apply the payment'));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { payForm.setFieldsValue({ received_date: dayjs() }); }, [payForm]);

  const exportAgeing = () => {
    if (!ageing) return;
    const bucketCols = ageing.buckets.map((b) => ({ label: b.label, value: (r) => r[b.key] }));
    exportSheets([
      { name: 'By customer', title: `AR ageing as of ${fmt(ageing.as_of)}`, rows: ageing.customers, columns: [{ label: 'Customer', value: (r) => r.customer_name }, { label: 'Invoices', value: (r) => r.invoices }, ...bucketCols, { label: 'Total', value: (r) => r.total }, { label: 'Oldest (days overdue)', value: (r) => r.oldest_days }] },
      { name: 'By invoice', title: `Open customer invoices as of ${fmt(ageing.as_of)}`, rows: ageing.invoices, columns: [{ label: 'Invoice', value: (r) => r.invoice_number }, { label: 'Customer', value: (r) => r.customer_name }, { label: 'Invoice date', value: (r) => r.invoice_date }, { label: 'Due date', value: (r) => r.due_date }, { label: 'Days overdue', value: (r) => r.days_overdue }, { label: 'Outstanding', value: (r) => r.outstanding }] },
    ], 'AR_Ageing');
  };

  const tiles = [
    { label: 'Outstanding', value: inr(summary.outstanding), sub: `${summary.open_count || 0} open invoices` },
    { label: 'Overdue', value: inr(summary.overdue), sub: `${summary.overdue_count || 0} past due · ${summary.escalated || 0} escalated`, alert: summary.overdue_count > 0 },
    { label: 'Reminders to send', value: summary.reminders_due || 0, sub: 'Sent automatically at 9 am each day', alert: summary.reminders_due > 0 },
    { label: 'Promised', value: inr(summary.promised), sub: `${summary.promised_count || 0} open · ${summary.broken_promises || 0} with a broken promise`, alert: summary.broken_promises > 0 },
  ];

  const workColumns = [
    { title: 'Customer', key: 'customer', render: (_, r) => <Space direction="vertical" size={0}><Text strong>{r.customer?.customer_name}</Text><Text type="secondary" style={{ fontSize: 12 }}>{r.customer?.contact_person || r.customer?.phone || r.customer?.email || 'No contact on file'}</Text></Space> },
    { title: 'Invoice', dataIndex: 'invoice_number', render: (v, r) => <Space direction="vertical" size={0}><span>{v}</span><Text type="secondary" style={{ fontSize: 12 }}>due {fmt(r.due_date)}</Text></Space> },
    { title: 'Outstanding', dataIndex: 'outstanding', align: 'right', render: (v) => <Text strong>{inr(v)}</Text>, sorter: (a, b) => a.outstanding - b.outstanding },
    { title: 'Overdue', dataIndex: 'days_overdue', align: 'right', render: (v, r) => (v > 0 ? <Text type="danger">{v} days</Text> : `due in ${r.days_to_due}d`), sorter: (a, b) => a.days_overdue - b.days_overdue },
    { title: 'Ladder step', dataIndex: 'stage', render: (v, r) => <StageTag stage={v} label={r.stage_label} /> },
    {
      title: 'Next action', dataIndex: 'next_action', render: (v, r) => (
        <Space direction="vertical" size={0}>
          <span>{v}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.reminders_sent} reminder{r.reminders_sent === 1 ? '' : 's'} sent{r.last_reminder_at ? `, last ${dayjs(r.last_reminder_at).format('DD MMM')}` : ''}
            {r.broken_promises > 0 && <Text type="danger" style={{ fontSize: 12 }}> · {r.broken_promises} broken promise{r.broken_promises === 1 ? '' : 's'}</Text>}
          </Text>
        </Space>
      ),
    },
    {
      title: '', key: 'act', render: (_, r) => (
        <Space>
          <Button size="small" icon={<BellRing size={14} />} loading={drafting} onClick={() => openReminder(r)}>Remind</Button>
          <Button size="small" icon={<Handshake size={14} />} onClick={() => { promiseForm.resetFields(); promiseForm.setFieldsValue({ amount: r.outstanding, promised_date: dayjs().add(7, 'day') }); setPromiseFor(r); }}>Promise</Button>
        </Space>
      ),
    },
  ];

  const bucketColumns = (ageing?.buckets || []).map((b) => ({ title: b.label, dataIndex: b.key, align: 'right', render: (v) => (v ? <Text type={b.key === 'd61_90' || b.key === 'd90' ? 'danger' : undefined}>{inr(v)}</Text> : <Text type="secondary">—</Text>) }));

  return (
    <div>
      <ArFlow active={tab === 'receive' ? ['cash'] : ['collections']} />
      <PageHeader
        icon={<PhoneCall size={24} />}
        title="Collections"
        subtitle="Chase overdue invoices in order of urgency, record promises to pay, apply payments received, and see the ageing"
        actions={[<Button key="r" icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>]}
      />
      <Tiles tiles={tiles} />
      <Card style={card} styles={{ body: { padding: '0 0 8px' } }}>
        <Tabs
          activeKey={tab}
          onChange={(k) => setParams(k === 'worklist' ? {} : { tab: k })}
          tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
          items={[
            {
              key: 'worklist', label: `Worklist (${work.length})`,
              children: (
                <>
                  <div style={{ padding: '12px 16px' }}>
                    <Space size={[6, 6]} wrap>
                      <Text type="secondary" style={{ fontSize: 12 }}>Reminder ladder:</Text>
                      {ladder.map((s) => <StageTag key={s.stage} stage={s.stage} label={`${s.label}: ${s.from <= 0 ? 'up to 3 days before due' : s.to === null ? `over ${s.from - 1} days` : `${s.from}–${s.to} days overdue`}`} />)}
                    </Space>
                  </div>
                  <Table rowKey="id" loading={loading} columns={workColumns} dataSource={work} scroll={{ x: 'max-content' }} pagination={{ pageSize: 15, hideOnSinglePage: true }} locale={{ emptyText: 'Nothing to chase: no invoice is due within 3 days or overdue' }} />
                </>
              ),
            },
            {
              key: 'receive', label: 'Receive payment',
              children: (
                <div style={{ padding: 16 }}>
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Alert
                      type="info" showIcon icon={<Sparkles size={16} />}
                      message={advice ? `Read from ${advice.file}${advice.amount_paid ? `: payment of ${inr(advice.amount_paid)}` : ''}` : 'Have a remittance or payment advice?'}
                      description={advice?.notes?.length ? advice.notes.join(' ') : 'Upload it and AI finds the customer and proposes which invoices the payment covers. You check the amounts, add any TDS the customer deducted, then apply.'}
                      action={<Upload accept={AI_ACCEPT} showUploadList={false} beforeUpload={readAdvice}><Button loading={reading}>Upload advice</Button></Upload>}
                    />
                    <Form form={payForm} layout="vertical">
                      <Row gutter={12}>
                        <Col xs={24} md={9}>
                          <Form.Item name="customer_id" label="Customer" rules={[{ required: true, message: 'Choose the customer' }]}>
                            <Select showSearch optionFilterProp="label" placeholder="Who paid?" onChange={() => setAlloc({})} options={customers.filter((c) => c.outstanding > 0).map((c) => ({ value: c.id, label: `${c.customer_name} · ${inr(c.outstanding)} outstanding` }))} />
                          </Form.Item>
                        </Col>
                        <Col xs={12} md={5}><Form.Item name="received_date" label="Received on" rules={[{ required: true, message: 'Required' }]}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d && d.isAfter(dayjs(), 'day')} /></Form.Item></Col>
                        <Col xs={12} md={4}><Form.Item name="payment_mode" label="Mode"><Select allowClear options={MODES} /></Form.Item></Col>
                        <Col xs={24} md={6}><Form.Item name="reference" label="Reference (UTR / cheque no.)"><Input /></Form.Item></Col>
                      </Row>
                    </Form>
                    {customerId && (
                      <Table
                        size="small" rowKey="id" pagination={false} dataSource={customerInvoices} scroll={{ x: 'max-content' }}
                        locale={{ emptyText: 'This customer has no open invoices' }}
                        columns={[
                          { title: 'Invoice', dataIndex: 'invoice_number', render: (v, r) => <Space direction="vertical" size={0}><Text strong>{v}</Text>{alloc[r.id]?.matched_by && <Text type="success" style={{ fontSize: 12 }}>{alloc[r.id].matched_by}</Text>}</Space> },
                          { title: 'Due', dataIndex: 'due_date', render: (v, r) => <Space size={6}>{fmt(v)}{r.overdue && <Tag color="error">{r.days_overdue}d overdue</Tag>}</Space> },
                          { title: 'Outstanding', dataIndex: 'outstanding', align: 'right', render: inr },
                          { title: 'Received now', key: 'amt', width: 160, render: (_, r) => <InputNumber min={0} max={r.outstanding} prefix="₹" style={{ width: '100%' }} value={alloc[r.id]?.amount} onChange={(v) => setLine(r.id, { amount: v })} /> },
                          { title: 'TDS deducted', key: 'tds', width: 150, render: (_, r) => <InputNumber min={0} max={r.outstanding} prefix="₹" style={{ width: '100%' }} value={alloc[r.id]?.tds_amount} onChange={(v) => setLine(r.id, { tds_amount: v })} /> },
                          {
                            title: 'Left after', key: 'left', align: 'right', render: (_, r) => {
                              const left = Math.round((r.outstanding - Number(alloc[r.id]?.amount || 0) - Number(alloc[r.id]?.tds_amount || 0)) * 100) / 100;
                              return left < 0 ? <Text type="danger">{inr(left)}</Text> : left === 0 ? <Tag color="success">Paid</Tag> : inr(left);
                            },
                          },
                          { title: '', key: 'full', render: (_, r) => <Button size="small" type="link" onClick={() => setLine(r.id, { amount: Math.round((r.outstanding - Number(alloc[r.id]?.tds_amount || 0)) * 100) / 100 })}>Pay in full</Button> },
                        ]}
                      />
                    )}
                    <Row justify="space-between" align="middle" gutter={[12, 12]}>
                      <Col>
                        <Text>Cash to bank: <Text strong>{inr(applied.cash)}</Text></Text>
                        {applied.tds > 0 && <Text> · TDS deducted: <Text strong>{inr(applied.tds)}</Text></Text>}
                        {advice?.amount_paid > 0 && Math.abs(advice.amount_paid - applied.cash) > 0.5 && <Text type="warning"> · the advice says {inr(advice.amount_paid)}</Text>}
                      </Col>
                      <Col><Button type="primary" icon={<HandCoins size={16} />} loading={busy} onClick={applyPayment} disabled={!customerId}>Apply payment</Button></Col>
                    </Row>
                    <Text type="secondary" style={{ fontSize: 12 }}>TDS deducted by the customer closes that part of the invoice and is posted to TDS receivable. A short payment leaves the balance outstanding, and it stays on the worklist.</Text>
                  </Space>
                </div>
              ),
            },
            {
              key: 'ageing', label: 'Ageing',
              children: ageing && (
                <div style={{ padding: 16 }}>
                  <Row gutter={[12, 12]} style={{ marginBottom: 12 }} align="middle">
                    <Col flex="auto">
                      <Space size={[20, 6]} wrap>
                        <Text>DSO: <Text strong>{ageing.dso === null ? '—' : `${ageing.dso} days`}</Text></Text>
                        <Text>Overdue share: <Text strong>{ageing.overdue_percent}%</Text></Text>
                        <Text>Billed, last 90 days: <Text strong>{inr(ageing.billed_90_days)}</Text></Text>
                        <Text>Collected, last 30 days: <Text strong>{inr(ageing.collected_30_days)}</Text></Text>
                      </Space>
                    </Col>
                    <Col><Button icon={<Download size={15} />} onClick={exportAgeing}>Export to Excel</Button></Col>
                  </Row>
                  <Table
                    size="small" rowKey="customer_id" pagination={false} dataSource={ageing.customers} scroll={{ x: 'max-content' }}
                    columns={[
                      { title: 'Customer', dataIndex: 'customer_name', render: (v, r) => <Space size={6}><Text strong>{v}</Text>{r.status === 'ON_HOLD' && <ArStatus status="ON_HOLD" />}</Space> },
                      ...bucketColumns,
                      { title: 'Total', dataIndex: 'total', align: 'right', render: (v) => <Text strong>{inr(v)}</Text> },
                    ]}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
                        {ageing.buckets.map((b, i) => <Table.Summary.Cell key={b.key} index={i + 1} align="right"><Text strong>{inr(ageing.totals[b.key])}</Text></Table.Summary.Cell>)}
                        <Table.Summary.Cell index={ageing.buckets.length + 1} align="right"><Text strong>{inr(ageing.totals.total)}</Text></Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>DSO (days sales outstanding) = receivables ÷ billing of the last 90 days × 90. As of {fmt(ageing.as_of)}.</Text>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!reminder} title={reminder ? `Reminder for ${reminder.row.invoice_number} · ${reminder.row.customer?.customer_name}` : ''} width={680} destroyOnClose
        onCancel={() => setReminder(null)}
        footer={[
          <Button key="ai" icon={<Sparkles size={15} />} loading={drafting} onClick={() => openReminder(reminder.row, true)}>Write with AI</Button>,
          <Button key="x" onClick={() => setReminder(null)}>Close</Button>,
          <Button key="ok" type="primary" loading={busy} onClick={sendReminder}>Send reminder</Button>,
        ]}
      >
        {reminder && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space size={8} wrap>
              <StageTag stage={reminder.draft.stage} label={ladder.find((s) => s.stage === reminder.draft.stage)?.label || reminder.draft.stage} />
              {reminder.draft.drafted_by_ai ? <Tag color="geekblue">Written by AI: read it before sending</Tag> : <Tag>Standard wording</Tag>}
              <Text type="secondary" style={{ fontSize: 12 }}>To: {reminder.draft.to_email || 'no email on file, so it will be recorded but not emailed'}</Text>
            </Space>
            <Form form={reminderForm} layout="vertical">
              <Form.Item name="subject" label="Subject" rules={[{ required: true, message: 'Required' }]}><Input /></Form.Item>
              <Form.Item name="message" label="Message" rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 0 }}><Input.TextArea rows={10} /></Form.Item>
            </Form>
            <Text type="secondary" style={{ fontSize: 12 }}>"Write with AI" drafts the email for this customer from the invoice, earlier reminders, promises and payment record. Nothing is sent until you click Send.</Text>
          </Space>
        )}
      </Modal>

      <Modal open={!!promiseFor} title={promiseFor ? `Promise to pay · ${promiseFor.invoice_number}` : ''} onCancel={() => setPromiseFor(null)} onOk={savePromise} confirmLoading={busy} okText="Record promise" destroyOnClose>
        <Alert style={{ marginBottom: 12 }} type="info" showIcon message="Reminders pause until the promised date. If the invoice is still unpaid the day after, the promise is marked broken and the invoice moves up the worklist." />
        <Form form={promiseForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}><Form.Item name="promised_date" label="Promised date" rules={[{ required: true, message: 'Required' }]}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} /></Form.Item></Col>
            <Col span={12}><Form.Item name="amount" label="Amount promised" rules={[{ required: true, message: 'Required' }]}><InputNumber style={{ width: '100%' }} min={0.01} max={promiseFor?.outstanding} prefix="₹" /></Form.Item></Col>
          </Row>
          <Form.Item name="note" label="Who promised, and how (call, email)"><Input /></Form.Item>
        </Form>
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate('/finance/ar/customer-invoices')}>Open customer invoices</Button>
      </Modal>
    </div>
  );
};

export default Collections;
