import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Col, Descriptions, Drawer, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Table, Timeline,
  Typography, Upload, message,
} from 'antd';
import { ClipboardX, FileText, Paperclip, Plus, RefreshCcw } from 'lucide-react';
import api from '../../utils/api';
import { getStoredUser, hasPerm } from '../../utils/session';
import { ArFlow, ArStatus, ArTasks, JournalLines, PageHeader, Tiles, arHistoryItems, useOpenParam } from '../../components/ar/ArShared';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;
const FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'In dispute', value: 'PENDING_APPROVAL' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected / withdrawn', value: 'CLOSED' },
];
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const EVIDENCE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

/** Absolute link for a stored file such as /uploads/ar-evidence/x.pdf (served by the API host). */
const evidenceHref = (url) => (url ? `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${url}` : null);

const checkEvidence = (file) => {
  if (!EVIDENCE_TYPES.includes(file.type)) { message.error('Attach a PDF, JPG or PNG file'); return false; }
  if (file.size / 1024 / 1024 > 10) { message.error('The file must be 10 MB or less'); return false; }
  return true;
};

/** Credit note lines that can be picked from an invoice: one per invoice line, unticked. */
const linesFromInvoice = (invoice) => (Array.isArray(invoice?.line_items) ? invoice.line_items : []).map((l, i) => ({
  key: `inv-${i}`, line_index: i, description: l.description, max_qty: Number(l.quantity), max_rate: Number(l.rate),
  quantity: Number(l.quantity), rate: Number(l.rate), gst_percent: Number(l.gst_percent || 0), include: false,
}));

const CreditNotes = () => {
  const user = getStoredUser();
  const canRaise = hasPerm(user, 'AR', 'ADD');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [detail, setDetail] = useState(null);
  const [decide, setDecide] = useState(null); // { note, mode: approve | reject | withdraw }
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [decideForm] = Form.useForm();

  // Raising a credit note here (it can also be started from the invoice)
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [openInvoices, setOpenInvoices] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [lines, setLines] = useState([]);
  const [evidence, setEvidence] = useState(null);
  const [raiseForm] = Form.useForm();
  const invoiceId = Form.useWatch('invoice_id', raiseForm);
  const invoice = openInvoices.find((i) => i.id === invoiceId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/ar/credit-notes');
      setRows(res?.data?.data || []);
      setSummary(res?.data?.summary || {});
    } catch (e) {
      message.error(errorOf(e, 'Could not load credit notes'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === 'ALL') return rows;
    if (filter === 'CLOSED') return rows.filter((r) => ['REJECTED', 'CANCELLED'].includes(r.status));
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const openDetail = async (row) => {
    try {
      const res = await api.get(`/ar/credit-notes/${row.id}`);
      setDetail(res?.data?.data || null);
    } catch (e) {
      message.error(errorOf(e, 'Could not open the credit note'));
    }
  };
  useOpenParam((id) => openDetail({ id }));

  const startDecision = (mode) => {
    decideForm.resetFields();
    setDecide({ mode });
  };
  const submitDecision = async () => {
    const v = await decideForm.validateFields();
    setBusy(true);
    try {
      const path = decide.mode === 'approve' ? 'approve' : 'reject';
      const res = await api.post(`/ar/credit-notes/${detail.id}/${path}`, { note: v.note });
      message.success(res?.data?.message || 'Saved');
      setDecide(null);
      setDetail(null);
      setRefreshKey((k) => k + 1);
      load();
    } catch (e) {
      message.error(errorOf(e, 'Could not save the decision'));
    } finally {
      setBusy(false);
    }
  };

  // ── Raise ─────────────────────────────────────────────────────────────────
  const openRaise = async () => {
    raiseForm.resetFields();
    setLines([]);
    setEvidence(null);
    setRaiseOpen(true);
    try {
      const [inv, rs] = await Promise.all([api.get('/ar/invoices', { params: { status: 'UNPAID,PARTIALLY_PAID' } }), api.get('/ar/credit-notes/reasons')]);
      setOpenInvoices(inv?.data?.data || []);
      setReasons(rs?.data?.data || []);
    } catch (e) {
      message.error(errorOf(e, 'Could not load open invoices'));
    }
  };
  useEffect(() => { setLines(linesFromInvoice(invoice)); }, [invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLine = (key, patch) => setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addFreeLine = () => setLines((list) => [...list, { key: `free-${Date.now()}`, line_index: null, description: '', quantity: 1, rate: 0, gst_percent: 18, include: true }]);
  const picked = lines.filter((l) => l.include);
  const totals = useMemo(() => {
    const subtotal = round2(picked.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.rate || 0), 0));
    const tax = round2(picked.reduce((s, l) => s + (Number(l.quantity || 0) * Number(l.rate || 0) * Number(l.gst_percent || 0)) / 100, 0));
    const interState = Number(invoice?.igst_amount || 0) > 0 && Number(invoice?.cgst_amount || 0) === 0;
    return { subtotal, tax, total: round2(subtotal + tax), interState };
  }, [picked, invoice]);

  const submitRaise = async () => {
    let v;
    try { v = await raiseForm.validateFields(); } catch { return; }
    if (!picked.length) { message.error('Tick at least one line to credit, or add a line'); return; }
    if (picked.some((l) => !String(l.description || '').trim() || !(Number(l.quantity) > 0) || !(Number(l.rate) > 0))) { message.error('Every line needs a description, a quantity and a rate'); return; }
    if (totals.total > Number(invoice?.outstanding || 0) + 0.005) { message.error(`The credit of ${inr(totals.total)} is more than the ${inr(invoice?.outstanding)} still owed`); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('reason_code', v.reason_code);
      fd.append('description', v.description);
      fd.append('lines', JSON.stringify(picked.map((l) => ({ description: l.description, line_index: l.line_index, quantity: l.quantity, rate: l.rate, gst_percent: l.gst_percent }))));
      if (evidence) fd.append('file', evidence);
      const res = await api.post(`/ar/invoices/${v.invoice_id}/credit-notes`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      message.success(res?.data?.message || 'Credit note sent for approval');
      setRaiseOpen(false);
      setRefreshKey((k) => k + 1);
      load();
    } catch (e) {
      message.error(errorOf(e, 'Could not raise the credit note'));
    } finally {
      setBusy(false);
    }
  };

  const tiles = [
    { label: 'In dispute', value: summary.in_dispute || 0, sub: `${inr(summary.in_dispute_value)} waiting for a decision; reminders paused`, alert: summary.in_dispute > 0 },
    { label: 'Waiting for you', value: summary.waiting_for_me || 0, sub: 'Within your approval limit', alert: summary.waiting_for_me > 0 },
    { label: 'Credit notes approved', value: summary.credited || 0, sub: `${inr(summary.credited_value)} credited` },
  ];

  const columns = [
    { title: 'Credit note', key: 'no', render: (_, r) => <Typography.Link strong>{r.credit_note_number || `Request #${r.id}`}</Typography.Link> },
    { title: 'Invoice', key: 'inv', render: (_, r) => r.invoice?.invoice_number || '—' },
    { title: 'Customer', key: 'cust', render: (_, r) => r.customer?.customer_name || '—' },
    { title: 'Reason', dataIndex: 'reason_label' },
    { title: 'Amount', dataIndex: 'total_amount', align: 'right', render: (v) => <Text strong>{inr(v)}</Text>, sorter: (a, b) => Number(a.total_amount) - Number(b.total_amount) },
    { title: 'Status', dataIndex: 'status', render: (v, r) => <Space size={4} wrap><ArStatus status={v} kind="credit" />{r.can_approve && <Text type="warning" style={{ fontSize: 12 }}>needs your decision</Text>}</Space> },
    { title: 'Raised by', dataIndex: 'requested_by_name', render: (v, r) => <Space direction="vertical" size={0}><span>{v || '—'}</span><Text type="secondary" style={{ fontSize: 12 }}>{fmt(r.createdAt)}</Text></Space> },
    { title: 'Decided by', dataIndex: 'approved_by_name', render: (v, r) => (v ? <Space direction="vertical" size={0}><span>{v}</span><Text type="secondary" style={{ fontSize: 12 }}>{fmt(r.approved_at)}</Text></Space> : <Text type="secondary">—</Text>) },
    // The whole row opens the request; this button makes that visible.
    { title: '', key: 'open', fixed: 'right', width: 80, render: (_, r) => <Button type="link" onClick={(e) => { e.stopPropagation(); openDetail(r); }}>{r.can_approve ? 'Decide' : 'Open'}</Button> },
  ];

  const mine = detail && Number(detail.requested_by) === Number(user?.id);

  return (
    <div>
      <ArFlow active={['dispute']} />
      <PageHeader
        icon={<ClipboardX size={24} />}
        title="Disputes & Credit Notes"
        subtitle="A customer's claim (damage, pricing, short shipment, return) opens a dispute and pauses reminders. Someone other than the requester, within their approval limit, approves the credit note."
        actions={[
          canRaise && <Button key="new" type="primary" icon={<Plus size={16} />} onClick={openRaise}>Raise credit note</Button>,
          <Button key="r" icon={<RefreshCcw size={16} />} onClick={() => { load(); setRefreshKey((k) => k + 1); }} loading={loading}>Refresh</Button>,
        ].filter(Boolean)}
      />
      <ArTasks kinds={['CREDIT_NOTE']} refreshKey={refreshKey} />
      <Tiles tiles={tiles} />
      <Card style={card} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '12px 16px' }}><Segmented options={FILTERS} value={filter} onChange={setFilter} /></div>
        <Table
          rowKey="id" loading={loading} columns={columns} dataSource={visible} scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 15, hideOnSinglePage: true }} onRow={(r) => ({ onClick: () => openDetail(r), style: { cursor: 'pointer' } })}
          locale={{ emptyText: 'No disputes or credit notes yet' }}
        />
      </Card>

      <Drawer
        open={!!detail} width={720} onClose={() => setDetail(null)} destroyOnClose
        title={detail ? `${detail.credit_note_number || `Credit note request #${detail.id}`} · ${detail.customer?.customer_name || ''}` : ''}
        extra={detail && detail.status === 'PENDING_APPROVAL' && (
          <Space>
            {mine && <Button onClick={() => startDecision('withdraw')}>Withdraw</Button>}
            {detail.can_approve && <Button danger onClick={() => startDecision('reject')}>Reject</Button>}
            {detail.can_approve && <Button type="primary" onClick={() => startDecision('approve')}>Approve</Button>}
          </Space>
        )}
      >
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {detail.status === 'PENDING_APPROVAL' && (
              <Alert
                type={detail.can_approve ? 'warning' : 'info'} showIcon
                message={detail.can_approve ? 'This credit note needs your decision' : `Approval needs ${detail.approval_needs}, and not the person who raised it`}
                description={detail.approve_block && !detail.can_approve ? detail.approve_block : 'While it is open the invoice is in dispute and reminders are paused.'}
              />
            )}
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Status"><ArStatus status={detail.status} kind="credit" /></Descriptions.Item>
              <Descriptions.Item label="Reason">{detail.reason_label}</Descriptions.Item>
              <Descriptions.Item label="Invoice">{detail.invoice?.invoice_number} ({fmt(detail.invoice?.invoice_date)})</Descriptions.Item>
              <Descriptions.Item label="Credit note date">{fmt(detail.credit_date)}</Descriptions.Item>
              <Descriptions.Item label="Raised by">{detail.requested_by_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Decided by">{detail.approved_by_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="What the customer reported" span={2}>{detail.description}</Descriptions.Item>
              {detail.decision_note && <Descriptions.Item label="Decision note" span={2}>{detail.decision_note}</Descriptions.Item>}
              <Descriptions.Item label="Evidence" span={2}>
                {detail.evidence_url
                  ? <Button type="link" style={{ padding: 0 }} icon={<FileText size={14} />} href={evidenceHref(detail.evidence_url)} target="_blank" rel="noreferrer">{detail.evidence_name || 'View evidence'}</Button>
                  : <Text type="secondary">No file attached</Text>}
              </Descriptions.Item>
            </Descriptions>
            <Table
              size="small" rowKey={(l, i) => i} pagination={false} dataSource={detail.lines || []}
              columns={[
                { title: 'Line', dataIndex: 'description' },
                { title: 'Qty', dataIndex: 'quantity', align: 'right' },
                { title: 'Rate', dataIndex: 'rate', align: 'right', render: inr },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: inr },
                { title: 'GST', key: 'gst', align: 'right', render: (_, l) => `${inr(l.gst_amount)} (${l.gst_percent}%)` },
              ]}
              summary={() => (
                <>
                  <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={3}>Taxable value</Table.Summary.Cell><Table.Summary.Cell index={1} align="right">{inr(detail.subtotal)}</Table.Summary.Cell><Table.Summary.Cell index={2} /></Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={3}>{Number(detail.igst_amount) > 0 ? 'IGST' : 'CGST + SGST'} reversed</Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">{Number(detail.igst_amount) > 0 ? inr(detail.igst_amount) : `${inr(detail.cgst_amount)} + ${inr(detail.sgst_amount)}`}</Table.Summary.Cell><Table.Summary.Cell index={2} />
                  </Table.Summary.Row>
                  <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={3}><Text strong>Credit note total</Text></Table.Summary.Cell><Table.Summary.Cell index={1} align="right"><Text strong>{inr(detail.total_amount)}</Text></Table.Summary.Cell><Table.Summary.Cell index={2} /></Table.Summary.Row>
                </>
              )}
            />
            {detail.status === 'PENDING_APPROVAL' && detail.journal_preview?.length > 0 && (
              <Card size="small" title="Accounting entry posted on approval" style={card}><JournalLines lines={detail.journal_preview} /></Card>
            )}
            {(detail.journals || []).map((j) => (
              <Card key={j.id} size="small" title={`${j.je_number} · ${fmt(j.entry_date)}`} style={card}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>{j.narration}</Text>
                <JournalLines lines={j.lines} />
              </Card>
            ))}
            <Text type="secondary" style={{ fontSize: 12 }}>The credit note is reported in GSTR-1 for the month it is issued; the output GST it reverses reduces the tax payable.</Text>
            <div>
              <Text strong>History</Text>
              <Timeline style={{ marginTop: 12 }} items={arHistoryItems(detail.history)} />
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        open={!!decide} onCancel={() => setDecide(null)} onOk={submitDecision} confirmLoading={busy} destroyOnClose
        title={decide?.mode === 'approve' ? 'Approve the credit note' : decide?.mode === 'withdraw' ? 'Withdraw the request' : 'Reject the credit'}
        okText={decide?.mode === 'approve' ? 'Approve and post' : decide?.mode === 'withdraw' ? 'Withdraw' : 'Reject'}
        okButtonProps={{ danger: decide?.mode !== 'approve' }}
      >
        {decide && detail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Text>{detail.customer?.customer_name} · {detail.invoice?.invoice_number} · {inr(detail.total_amount)}</Text>
            {decide.mode === 'approve'
              ? <Alert type="info" showIcon message="Approving gives it the next credit note number, reduces what the customer owes and posts the accounting entry." />
              : <Alert type="warning" showIcon message={decide.mode === 'withdraw' ? 'The dispute closes and reminders resume.' : 'Rejecting closes the dispute with no credit; reminders resume.'} />}
            <Form form={decideForm} layout="vertical">
              <Form.Item name="note" label={decide.mode === 'approve' ? 'Note (optional)' : 'Reason'} rules={decide.mode === 'approve' ? [] : [{ required: true, message: 'Give the reason' }]} style={{ marginBottom: 0 }}>
                <Input.TextArea rows={3} />
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>

      <Modal open={raiseOpen} title="Raise a credit note" width={860} onCancel={() => setRaiseOpen(false)} onOk={submitRaise} confirmLoading={busy} okText="Send for approval" destroyOnClose>
        <Form form={raiseForm} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} md={14}>
              <Form.Item name="invoice_id" label="Invoice" rules={[{ required: true, message: 'Choose the invoice' }]}>
                <Select
                  showSearch optionFilterProp="label" placeholder="Invoice the customer disputes"
                  options={openInvoices.map((i) => ({ value: i.id, label: `${i.invoice_number} · ${i.customer?.customer_name || ''} · ${inr(i.outstanding)} owed` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="reason_code" label="Reason" rules={[{ required: true, message: 'Choose the reason' }]}>
                <Select options={reasons} placeholder="Damaged, pricing, short shipment…" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="What the customer reported" rules={[{ required: true, message: 'Describe the claim' }]}>
            <Input.TextArea rows={2} placeholder="e.g. 20 tags arrived torn; photos attached" />
          </Form.Item>
        </Form>
        {invoice && (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Table
              size="small" rowKey="key" pagination={false} dataSource={lines} scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'This invoice has no item lines. Add a line for the amount to credit.' }}
              columns={[
                { title: 'Credit', key: 'inc', width: 60, render: (_, l) => <Checkbox checked={l.include} onChange={(e) => setLine(l.key, { include: e.target.checked })} /> },
                {
                  title: 'Line', key: 'd', render: (_, l) => (l.line_index === null
                    ? <Input value={l.description} placeholder="e.g. Price difference on tags" onChange={(e) => setLine(l.key, { description: e.target.value })} />
                    : l.description),
                },
                { title: 'Qty', key: 'q', width: 110, render: (_, l) => <InputNumber min={0.001} max={l.max_qty} value={l.quantity} onChange={(v) => setLine(l.key, { quantity: v })} style={{ width: '100%' }} /> },
                { title: 'Rate', key: 'r', width: 140, render: (_, l) => <InputNumber min={0.01} max={l.max_rate} prefix="₹" value={l.rate} onChange={(v) => setLine(l.key, { rate: v })} style={{ width: '100%' }} /> },
                { title: 'GST %', key: 'g', width: 90, render: (_, l) => (l.line_index === null ? <InputNumber min={0} max={100} value={l.gst_percent} onChange={(v) => setLine(l.key, { gst_percent: v })} style={{ width: '100%' }} /> : `${l.gst_percent}%`) },
                { title: 'Amount', key: 'a', align: 'right', render: (_, l) => inr(Number(l.quantity || 0) * Number(l.rate || 0)) },
              ]}
            />
            <Space wrap>
              <Button size="small" icon={<Plus size={14} />} onClick={addFreeLine}>Add a line (e.g. pricing difference)</Button>
              <Upload accept=".pdf,.jpg,.jpeg,.png" showUploadList={false} beforeUpload={(f) => { if (checkEvidence(f)) setEvidence(f); return false; }}>
                <Button size="small" icon={<Paperclip size={14} />}>{evidence ? `Evidence: ${evidence.name}` : 'Attach evidence (photos, email)'}</Button>
              </Upload>
            </Space>
            <Row justify="space-between">
              <Col><Text type="secondary">Still owed on {invoice.invoice_number}: {inr(invoice.outstanding)}</Text></Col>
              <Col>
                <Text>Taxable {inr(totals.subtotal)} · {totals.interState ? 'IGST' : 'CGST + SGST'} {inr(totals.tax)} · </Text>
                <Text strong type={totals.total > Number(invoice.outstanding) ? 'danger' : undefined}>Credit {inr(totals.total)}</Text>
              </Col>
            </Row>
            <Text type="secondary" style={{ fontSize: 12 }}>Quantities and rates cannot exceed what was invoiced. The GST split follows the original invoice.</Text>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default CreditNotes;
