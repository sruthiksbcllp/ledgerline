import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tabs,
  Timeline, Typography, Upload, message,
} from 'antd';
import { BadgePercent, FileText, MinusCircle, Paperclip, Plus, RefreshCcw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { getStoredUser, hasPerm } from '../../utils/session';
import { ArStatus, ArTasks, JournalLines, PageHeader, Tiles, arHistoryItems, useOpenParam } from '../../components/ar/ArShared';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text, Paragraph } = Typography;
const TABS = ['provision', 'writeoffs', 'settings'];
const EVIDENCE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const evidenceHref = (url) => (url ? `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${url}` : null);
const checkEvidence = (file) => {
  if (!EVIDENCE_TYPES.includes(file.type)) { message.error('Attach a PDF, JPG or PNG file'); return false; }
  if (file.size / 1024 / 1024 > 10) { message.error('The file must be 10 MB or less'); return false; }
  return true;
};

const CreditLoss = () => {
  const user = getStoredUser();
  const canPrepare = hasPerm(user, 'AR', 'ADD');
  const canChange = hasPerm(user, 'AR', 'EDIT');
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'provision';
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [decide, setDecide] = useState(null); // { kind: run | writeoff, item, mode: approve | reject | withdraw }
  const [decideForm] = Form.useForm();

  // ── Provision ───────────────────────────────────────────────────────────────
  const [month, setMonth] = useState(dayjs());
  const period = month.format('YYYY-MM');
  const [preview, setPreview] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loadingEcl, setLoadingEcl] = useState(false);

  const loadEcl = useCallback(async () => {
    setLoadingEcl(true);
    try {
      const [p, r] = await Promise.all([api.get('/ar/ecl/preview', { params: { period } }), api.get('/ar/ecl/runs')]);
      setPreview(p?.data?.data || null);
      setRuns(r?.data?.data || []);
    } catch (e) {
      message.error(errorOf(e, 'Could not work out the provision'));
    } finally {
      setLoadingEcl(false);
    }
  }, [period]);

  const prepareRun = async () => {
    setBusy(true);
    try {
      const res = await api.post('/ar/ecl/runs', { period });
      message.success(res?.data?.message || 'Provision prepared');
      setRefreshKey((k) => k + 1);
      loadEcl();
    } catch (e) {
      message.error(errorOf(e, 'Could not prepare the provision'));
    } finally {
      setBusy(false);
    }
  };

  // ── Write-offs ──────────────────────────────────────────────────────────────
  const [writeOffs, setWriteOffs] = useState([]);
  const [woSummary, setWoSummary] = useState({});
  const [loadingWo, setLoadingWo] = useState(false);
  const [woDetail, setWoDetail] = useState(null);
  const [recoverFor, setRecoverFor] = useState(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [openInvoices, setOpenInvoices] = useState([]);
  const [evidence, setEvidence] = useState(null);
  const [recoverForm] = Form.useForm();
  const [requestForm] = Form.useForm();
  const requestInvoiceId = Form.useWatch('invoice_id', requestForm);

  const loadWo = useCallback(async () => {
    setLoadingWo(true);
    try {
      const res = await api.get('/ar/write-offs');
      setWriteOffs(res?.data?.data || []);
      setWoSummary(res?.data?.summary || {});
    } catch (e) {
      message.error(errorOf(e, 'Could not load write-offs'));
    } finally {
      setLoadingWo(false);
    }
  }, []);

  const openWo = async (row) => {
    try {
      const res = await api.get(`/ar/write-offs/${row.id}`);
      setWoDetail(res?.data?.data || null);
    } catch (e) {
      message.error(errorOf(e, 'Could not open the write-off'));
    }
  };

  // "Waiting for you" → Open: a write-off opens its drawer; a provision is picked out in the list.
  const [focusRun, setFocusRun] = useState(null);
  useOpenParam((id) => { if (tab === 'writeoffs') openWo({ id }); else setFocusRun(Number(id)); });
  useEffect(() => {
    const r = focusRun && runs.find((x) => Number(x.id) === focusRun);
    if (!r) return;
    if (r.period !== period) { setMonth(dayjs(`${r.period}-01`)); return; }
    document.getElementById('ecl-runs')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusRun, runs]); // eslint-disable-line react-hooks/exhaustive-deps

  const openRequest = async () => {
    requestForm.resetFields();
    setEvidence(null);
    setRequestOpen(true);
    try {
      const res = await api.get('/ar/invoices', { params: { status: 'UNPAID,PARTIALLY_PAID' } });
      setOpenInvoices(res?.data?.data || []);
    } catch (e) {
      message.error(errorOf(e, 'Could not load open invoices'));
    }
  };
  useEffect(() => {
    const inv = openInvoices.find((i) => i.id === requestInvoiceId);
    if (inv) requestForm.setFieldsValue({ amount: inv.outstanding });
  }, [requestInvoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitRequest = async () => {
    let v;
    try { v = await requestForm.validateFields(); } catch { return; }
    if (!evidence) { message.error('Attach the evidence (e.g. insolvency notice, legal advice, final demand)'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('amount', v.amount);
      fd.append('reason', v.reason);
      fd.append('file', evidence);
      const res = await api.post(`/ar/invoices/${v.invoice_id}/write-offs`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      message.success(res?.data?.message || 'Write-off sent for approval');
      setRequestOpen(false);
      setRefreshKey((k) => k + 1);
      loadWo();
    } catch (e) {
      message.error(errorOf(e, 'Could not request the write-off'));
    } finally {
      setBusy(false);
    }
  };

  const submitRecovery = async () => {
    const v = await recoverForm.validateFields();
    setBusy(true);
    try {
      const res = await api.post(`/ar/write-offs/${recoverFor.id}/recover`, { amount: v.amount });
      message.success(res?.data?.message || 'Receivable reinstated');
      setRecoverFor(null);
      loadWo();
    } catch (e) {
      message.error(errorOf(e, 'Could not record the recovery'));
    } finally {
      setBusy(false);
    }
  };

  // ── Settings ────────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [settingsForm] = Form.useForm();

  const loadSettings = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.get('/ar/settings'), api.get('/ar/customers').catch(() => null)]);
      const d = s?.data?.data || null;
      setSettings(d);
      setCustomers(c?.data?.data || []);
      if (d) settingsForm.setFieldsValue({ rates: d.rates, specific: d.specific.map((x) => ({ customer_id: x.customer_id, amount: x.amount, reason: x.reason })), einvoice_applies: d.einvoice_applies });
    } catch (e) {
      message.error(errorOf(e, 'Could not load the settings'));
    }
  }, [settingsForm]);

  const saveSettings = async () => {
    const v = await settingsForm.validateFields();
    setBusy(true);
    try {
      const res = await api.put('/ar/settings', { rates: v.rates, specific: (v.specific || []).filter((x) => x && x.customer_id), einvoice_applies: !!v.einvoice_applies });
      message.success(res?.data?.message || 'Saved');
      loadSettings();
    } catch (e) {
      message.error(errorOf(e, 'Could not save the settings'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (tab === 'provision') loadEcl();
    else if (tab === 'writeoffs') loadWo();
    else loadSettings();
  }, [tab, loadEcl, loadWo, loadSettings]);

  // ── Approve / reject (provision runs and write-offs) ───────────────────────
  const startDecision = (kind, item, mode) => { decideForm.resetFields(); setDecide({ kind, item, mode }); };
  const submitDecision = async () => {
    const v = await decideForm.validateFields();
    setBusy(true);
    try {
      const base = decide.kind === 'run' ? `/ar/ecl/runs/${decide.item.id}` : `/ar/write-offs/${decide.item.id}`;
      const res = await api.post(`${base}/${decide.mode === 'approve' ? 'approve' : 'reject'}`, { note: v.note });
      message.success(res?.data?.message || 'Saved');
      setDecide(null);
      setWoDetail(null);
      setRefreshKey((k) => k + 1);
      if (decide.kind === 'run') loadEcl(); else loadWo();
    } catch (e) {
      message.error(errorOf(e, 'Could not save the decision'));
    } finally {
      setBusy(false);
    }
  };

  const runColumns = [
    { title: 'Month', dataIndex: 'period' },
    { title: 'As of', dataIndex: 'as_of', render: fmt },
    { title: 'Required', dataIndex: 'required', align: 'right', render: inr },
    { title: 'In the ledger', dataIndex: 'existing', align: 'right', render: inr },
    { title: 'Adjustment', dataIndex: 'adjustment', align: 'right', render: (v) => (Number(v) >= 0 ? `Top-up ${inr(v)}` : `Release ${inr(-Number(v))}`) },
    { title: 'Status', dataIndex: 'status', render: (v) => <ArStatus status={v} /> },
    { title: 'Prepared by', dataIndex: 'prepared_by_name', render: (v) => v || '—' },
    { title: 'Approved by', dataIndex: 'approved_by_name', render: (v, r) => (v ? `${v}${r.decision_note ? ` · ${r.decision_note}` : ''}` : '—') },
    {
      title: '', key: 'act', fixed: 'right', render: (_, r) => (r.status === 'PENDING_APPROVAL' ? (
        r.can_approve
          ? <Space><Button size="small" type="primary" onClick={() => startDecision('run', r, 'approve')}>Approve</Button><Button size="small" danger onClick={() => startDecision('run', r, 'reject')}>Reject</Button></Space>
          : <Text type="secondary" style={{ fontSize: 12 }}>{r.approve_block}</Text>
      ) : null),
    },
  ];

  const woColumns = [
    { title: 'Write-off', key: 'no', render: (_, r) => <Typography.Link strong>{r.write_off_number || `Request #${r.id}`}</Typography.Link> },
    { title: 'Invoice', key: 'inv', render: (_, r) => r.invoice?.invoice_number || '—' },
    { title: 'Customer', key: 'cust', render: (_, r) => r.customer?.customer_name || '—' },
    { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => <Text strong>{inr(v)}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v, r) => <Space size={4} wrap><ArStatus status={v} />{r.can_approve && <Text type="warning" style={{ fontSize: 12 }}>needs your decision</Text>}</Space> },
    { title: 'From allowance / expense', key: 'split', render: (_, r) => (r.status === 'APPROVED' ? `${inr(r.allowance_used)} / ${inr(r.expense_amount)}` : '—') },
    { title: 'Recovered', dataIndex: 'recovered_amount', align: 'right', render: (v) => (Number(v) > 0 ? inr(v) : '—') },
    { title: 'Requested by', dataIndex: 'requested_by_name', render: (v, r) => <Space direction="vertical" size={0}><span>{v || '—'}</span><Text type="secondary" style={{ fontSize: 12 }}>{fmt(r.createdAt)}</Text></Space> },
    {
      title: '', key: 'act', fixed: 'right', render: (_, r) => (
        <Space onClick={(e) => e.stopPropagation()}>
          {r.status === 'APPROVED' && r.recoverable > 0 && canChange && <Button size="small" onClick={() => { recoverForm.resetFields(); recoverForm.setFieldsValue({ amount: r.recoverable }); setRecoverFor(r); }}>Record recovery</Button>}
          <Button size="small" type="link" onClick={() => openWo(r)}>{r.can_approve ? 'Decide' : 'Open'}</Button>
        </Space>
      ),
    },
  ];

  const woTiles = [
    { label: 'Allowance for credit losses', value: inr(woSummary.allowance), sub: 'Ledger account 1105; write-offs use it first' },
    { label: 'Waiting for approval', value: woSummary.pending || 0, sub: `${woSummary.waiting_for_me || 0} within your limit`, alert: woSummary.waiting_for_me > 0 },
    { label: 'Written off', value: inr(woSummary.written_off), sub: `${inr(woSummary.recovered)} recovered since` },
    { label: 'Who approves', value: `Finance ≤ ${inr(woSummary.limits?.finance)}`, sub: woSummary.limits?.director ? `Director / CFO up to ${inr(woSummary.limits.director)}` : 'Above that: Director / CFO' },
  ];

  const mineWo = woDetail && Number(woDetail.requested_by) === Number(user?.id);
  const bucketRows = preview?.buckets || [];

  return (
    <div>
      <PageHeader
        icon={<BadgePercent size={24} />}
        title="Credit Loss & Write-offs"
        subtitle="Month-end expected credit loss on receivables (Ind AS 109), and bad debts written off against that allowance. Accounts Receivable prepares; Finance or the Director / CFO approves."
        actions={[<Button key="r" icon={<RefreshCcw size={16} />} onClick={() => { setRefreshKey((k) => k + 1); if (tab === 'provision') loadEcl(); else if (tab === 'writeoffs') loadWo(); else loadSettings(); }}>Refresh</Button>]}
      />
      <ArTasks kinds={['ECL', 'WRITE_OFF']} refreshKey={refreshKey} />
      <Card style={card} styles={{ body: { padding: '0 0 8px' } }}>
        <Tabs
          activeKey={tab}
          onChange={(k) => setParams(k === 'provision' ? {} : { tab: k })}
          tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
          items={[
            {
              key: 'provision', label: 'Credit-loss provision',
              children: (
                <div style={{ padding: 16 }}>
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Row gutter={[12, 12]} align="middle" justify="space-between">
                      <Col>
                        <Space wrap>
                          <Text>Month</Text>
                          <DatePicker picker="month" value={month} allowClear={false} onChange={(d) => d && setMonth(d)} disabledDate={(d) => d && d.isAfter(dayjs(), 'month')} format="MMM YYYY" />
                          {preview && <Text type="secondary">Receivables aged as of {fmt(preview.as_of)}</Text>}
                        </Space>
                      </Col>
                      <Col>{canPrepare && <Button type="primary" loading={busy} onClick={prepareRun} disabled={!preview || Math.abs(Number(preview.adjustment || 0)) < 0.01}>Prepare provision for {month.format('MMM YYYY')}</Button>}</Col>
                    </Row>
                    {preview && (
                      <>
                        <Table
                          size="small" rowKey="key" pagination={false} loading={loadingEcl} dataSource={bucketRows}
                          columns={[
                            { title: 'Age (days past due)', dataIndex: 'label' },
                            { title: 'Balance owed', dataIndex: 'balance', align: 'right', render: inr },
                            { title: 'Loss rate', dataIndex: 'rate', align: 'right', render: (v) => `${v}%` },
                            { title: 'Allowance', dataIndex: 'allowance', align: 'right', render: inr },
                          ]}
                        />
                        {preview.specific?.length > 0 && (
                          <Table
                            size="small" rowKey="customer_id" pagination={false} dataSource={preview.specific} title={() => <Text strong>Specific reserves (replace the rates for these customers)</Text>}
                            columns={[
                              { title: 'Customer', dataIndex: 'customer_name' },
                              { title: 'Owed', dataIndex: 'balance', align: 'right', render: inr },
                              { title: 'Reserve', dataIndex: 'reserve', align: 'right', render: inr },
                              { title: 'Allowance (capped at owed)', dataIndex: 'allowance', align: 'right', render: inr },
                              { title: 'Reason', dataIndex: 'reason' },
                            ]}
                          />
                        )}
                        <Row gutter={[16, 8]}>
                          <Col><Text>Receivables: <Text strong>{inr(preview.receivables)}</Text></Text></Col>
                          <Col><Text>Allowance required: <Text strong>{inr(preview.required)}</Text></Text></Col>
                          <Col><Text>In the ledger (1105): <Text strong>{inr(preview.existing)}</Text></Text></Col>
                          <Col>
                            <Text>{Number(preview.adjustment) >= 0 ? 'Top-up' : 'Release'}: </Text>
                            <Text strong type={Math.abs(Number(preview.adjustment)) >= 0.01 ? 'warning' : 'success'}>{inr(Math.abs(Number(preview.adjustment)))}</Text>
                          </Col>
                        </Row>
                        <Alert
                          type="info" showIcon
                          message="How the provision posts"
                          description={`Top-up: Dr 6900 Credit loss expense, Cr 1105 Allowance for credit losses. A release posts the other way round. The figure covers every customer's open invoices. One provision per month; when it is approved the allowance is set to exactly what is required at that moment.`}
                        />
                      </>
                    )}
                    <div id="ecl-runs">
                      <Table
                        size="small" rowKey="id" loading={loadingEcl} columns={runColumns} dataSource={runs} scroll={{ x: 'max-content' }} pagination={{ pageSize: 12, hideOnSinglePage: true }}
                        locale={{ emptyText: 'No provision prepared yet' }} title={() => <Text strong>Provisions</Text>}
                        onRow={(r) => (Number(r.id) === focusRun ? { style: { background: 'var(--color-warning-bg, #fffbe6)' } } : {})}
                      />
                    </div>
                  </Space>
                </div>
              ),
            },
            {
              key: 'writeoffs', label: 'Write-offs',
              children: (
                <div style={{ padding: 16 }}>
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Tiles tiles={woTiles} />
                    <Row justify="space-between" align="middle">
                      <Col><Text type="secondary">Click a row for the evidence, the collection history and the accounting entry.</Text></Col>
                      <Col>{canPrepare && <Button type="primary" icon={<Plus size={16} />} onClick={openRequest}>Request a write-off</Button>}</Col>
                    </Row>
                    <Table
                      rowKey="id" loading={loadingWo} columns={woColumns} dataSource={writeOffs} scroll={{ x: 'max-content' }} pagination={{ pageSize: 15, hideOnSinglePage: true }}
                      onRow={(r) => ({ onClick: () => openWo(r), style: { cursor: 'pointer' } })} locale={{ emptyText: 'No write-offs' }}
                    />
                    <Alert
                      type="warning" showIcon message="Good to know"
                      description={(
                        <>
                          <Paragraph style={{ marginBottom: 4 }}>Writing off a debt does not refund the GST already paid on the sale.</Paragraph>
                          <Paragraph style={{ marginBottom: 4 }}>The income-tax deduction for bad debts written off is section 36(1)(vii) of the Income-tax Act 1961, renumbered under the Income-tax Act 2025: check the new section before filing.</Paragraph>
                          <Paragraph style={{ marginBottom: 0 }}>If money turns up later, use Record recovery: it reinstates that much of the receivable, and you then receive the payment in Collections as usual.</Paragraph>
                        </>
                      )}
                    />
                  </Space>
                </div>
              ),
            },
            {
              key: 'settings', label: 'Loss rates & settings',
              children: (
                <div style={{ padding: 16 }}>
                  {settings && (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      <Alert
                        type={settings.can_edit ? 'info' : 'warning'} showIcon
                        message={settings.can_edit ? 'Review the loss rates each quarter' : 'Set by Finance or the Director / CFO'}
                        description={`${settings.updated_by_name ? `Last reviewed by ${settings.updated_by_name} on ${fmt(settings.reviewed_at)}.` : 'Not reviewed yet: the default rates apply.'} Every change is kept in the audit log.`}
                      />
                      <Form form={settingsForm} layout="vertical" disabled={!settings.can_edit}>
                        <Text strong>Loss rate by age</Text>
                        <Row gutter={12} style={{ marginTop: 8 }}>
                          {settings.buckets.map((b) => (
                            <Col xs={12} md={4} key={b.key}>
                              <Form.Item name={['rates', b.key]} label={b.label} rules={[{ required: true, message: 'Required' }]}>
                                <InputNumber min={0} max={100} step={0.1} addonAfter="%" style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                          ))}
                        </Row>
                        <Text strong>Specific reserves for named problem customers</Text>
                        <Form.List name="specific">
                          {(fields, { add, remove }) => (
                            <div style={{ marginTop: 8 }}>
                              {fields.map((f) => (
                                <Row gutter={8} key={f.key} align="top">
                                  <Col xs={24} md={9}>
                                    <Form.Item name={[f.name, 'customer_id']} rules={[{ required: true, message: 'Choose the customer' }]}>
                                      <Select showSearch optionFilterProp="label" placeholder="Customer" options={customers.map((c) => ({ value: c.id, label: c.customer_name }))} />
                                    </Form.Item>
                                  </Col>
                                  <Col xs={10} md={5}><Form.Item name={[f.name, 'amount']} rules={[{ required: true, message: 'Amount' }]}><InputNumber min={0} prefix="₹" style={{ width: '100%' }} placeholder="Reserve" /></Form.Item></Col>
                                  <Col xs={12} md={9}><Form.Item name={[f.name, 'reason']} rules={[{ required: true, message: 'Reason' }]}><Input placeholder="e.g. insolvency filing" /></Form.Item></Col>
                                  <Col xs={2} md={1}><Button type="text" icon={<MinusCircle size={16} />} onClick={() => remove(f.name)} /></Col>
                                </Row>
                              ))}
                              <Button icon={<Plus size={14} />} onClick={() => add()} style={{ marginBottom: 16 }}>Add a specific reserve</Button>
                            </div>
                          )}
                        </Form.List>
                        <Form.Item name="einvoice_applies" label="GST e-invoicing applies to this company" valuePropName="checked" extra="When on, the GST sales register flags business (B2B) invoices that have no IRN yet.">
                          <Switch />
                        </Form.Item>
                      </Form>
                      {settings.can_edit && <Button type="primary" loading={busy} onClick={saveSettings}>Save</Button>}
                    </Space>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        open={!!woDetail} width={680} onClose={() => setWoDetail(null)} destroyOnClose
        title={woDetail ? `${woDetail.write_off_number || `Write-off request #${woDetail.id}`} · ${woDetail.customer?.customer_name || ''}` : ''}
        extra={woDetail && woDetail.status === 'PENDING_APPROVAL' && (
          <Space>
            {mineWo && <Button onClick={() => startDecision('writeoff', woDetail, 'withdraw')}>Withdraw</Button>}
            {woDetail.can_approve && <Button danger onClick={() => startDecision('writeoff', woDetail, 'reject')}>Reject</Button>}
            {woDetail.can_approve && <Button type="primary" onClick={() => startDecision('writeoff', woDetail, 'approve')}>Approve</Button>}
          </Space>
        )}
      >
        {woDetail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {woDetail.status === 'PENDING_APPROVAL' && !woDetail.can_approve && (
              <Alert type="info" showIcon message={`Approval needs ${woDetail.approval_needs}, and not the person who requested it`} description={woDetail.approve_block} />
            )}
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Status"><ArStatus status={woDetail.status} /></Descriptions.Item>
              <Descriptions.Item label="Amount">{inr(woDetail.amount)}</Descriptions.Item>
              <Descriptions.Item label="Invoice">{woDetail.invoice?.invoice_number} (due {fmt(woDetail.invoice?.due_date)})</Descriptions.Item>
              <Descriptions.Item label="Recovered">{inr(woDetail.recovered_amount)}</Descriptions.Item>
              <Descriptions.Item label="Reason" span={2}>{woDetail.reason}</Descriptions.Item>
              <Descriptions.Item label="Collection history" span={2}>{woDetail.collection_summary || '—'}</Descriptions.Item>
              <Descriptions.Item label="Evidence" span={2}>
                {woDetail.evidence_url
                  ? <Button type="link" style={{ padding: 0 }} icon={<FileText size={14} />} href={evidenceHref(woDetail.evidence_url)} target="_blank" rel="noreferrer">{woDetail.evidence_name || 'View evidence'}</Button>
                  : <Text type="secondary">No file</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Requested by">{woDetail.requested_by_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Decided by">{woDetail.approved_by_name || '—'}{woDetail.decision_note ? ` · ${woDetail.decision_note}` : ''}</Descriptions.Item>
              {woDetail.status === 'APPROVED' && <Descriptions.Item label="From the allowance">{inr(woDetail.allowance_used)}</Descriptions.Item>}
              {woDetail.status === 'APPROVED' && <Descriptions.Item label="To credit-loss expense">{inr(woDetail.expense_amount)}</Descriptions.Item>}
            </Descriptions>
            {(woDetail.journals || []).map((j) => (
              <Card key={j.id} size="small" title={`${j.je_number} · ${fmt(j.entry_date)}`} style={card}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>{j.narration}</Text>
                <JournalLines lines={j.lines} />
              </Card>
            ))}
            <div>
              <Text strong>History</Text>
              <Timeline style={{ marginTop: 12 }} items={arHistoryItems(woDetail.history)} />
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        open={!!decide} onCancel={() => setDecide(null)} onOk={submitDecision} confirmLoading={busy} destroyOnClose
        title={decide ? `${decide.mode === 'approve' ? 'Approve' : decide.mode === 'withdraw' ? 'Withdraw' : 'Reject'} the ${decide.kind === 'run' ? `provision for ${decide.item.period}` : 'write-off'}` : ''}
        okText={decide?.mode === 'approve' ? 'Approve and post' : decide?.mode === 'withdraw' ? 'Withdraw' : 'Reject'}
        okButtonProps={{ danger: decide?.mode !== 'approve' }}
      >
        {decide && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {decide.kind === 'run'
              ? <Text>Allowance required {inr(decide.item.required)}; the ledger holds {inr(decide.item.existing)} now.</Text>
              : <Text>{decide.item.customer?.customer_name} · {decide.item.invoice?.invoice_number} · {inr(decide.item.amount)}</Text>}
            {decide.mode === 'approve' && (
              <Alert type="info" showIcon message={decide.kind === 'run' ? 'The allowance is set to exactly what is required when you approve (write-offs since it was prepared are taken into account).' : 'The write-off uses the allowance first; anything it does not cover goes to credit-loss expense.'} />
            )}
            <Form form={decideForm} layout="vertical">
              <Form.Item name="note" label={decide.mode === 'approve' ? 'Note (optional)' : 'Reason'} rules={decide.mode === 'approve' ? [] : [{ required: true, message: 'Give the reason' }]} style={{ marginBottom: 0 }}>
                <Input.TextArea rows={3} />
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>

      <Modal open={!!recoverFor} title={recoverFor ? `Record a recovery · ${recoverFor.write_off_number}` : ''} onCancel={() => setRecoverFor(null)} onOk={submitRecovery} confirmLoading={busy} okText="Reinstate the receivable" destroyOnClose>
        <Alert style={{ marginBottom: 12 }} type="info" showIcon message="This reinstates that much of the receivable (Dr 1100, Cr 1105). Then receive the payment in Collections → Receive payment." />
        <Form form={recoverForm} layout="vertical">
          <Form.Item name="amount" label="Amount recovered" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber min={0.01} max={recoverFor?.recoverable} prefix="₹" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={requestOpen} title="Request a write-off" onCancel={() => setRequestOpen(false)} onOk={submitRequest} confirmLoading={busy} okText="Send for approval" destroyOnClose>
        <Form form={requestForm} layout="vertical">
          <Form.Item name="invoice_id" label="Invoice" rules={[{ required: true, message: 'Choose the invoice' }]}>
            <Select showSearch optionFilterProp="label" placeholder="Invoice that cannot be collected" options={openInvoices.map((i) => ({ value: i.id, label: `${i.invoice_number} · ${i.customer?.customer_name || ''} · ${inr(i.outstanding)} owed${i.days_overdue ? ` · ${i.days_overdue}d overdue` : ''}` }))} />
          </Form.Item>
          <Form.Item name="amount" label="Amount to write off" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber min={0.01} prefix="₹" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="Why it cannot be collected" rules={[{ required: true, message: 'Give the reason' }]}>
            <Input.TextArea rows={2} placeholder="e.g. customer filed for insolvency on 3 Nov" />
          </Form.Item>
          <Upload accept=".pdf,.jpg,.jpeg,.png" showUploadList={false} beforeUpload={(f) => { if (checkEvidence(f)) setEvidence(f); return false; }}>
            <Button icon={<Paperclip size={14} />}>{evidence ? `Evidence: ${evidence.name}` : 'Attach evidence (required)'}</Button>
          </Upload>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>The reminders and promises to pay on the invoice are attached automatically as the collection history.</Text>
        </Form>
      </Modal>
    </div>
  );
};

export default CreditLoss;
