import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Form, Input, InputNumber, List, Modal, Popconfirm, Radio, Row, Select, Space, Table, Tabs,
  Tag, Typography, message,
} from 'antd';
import { AlertTriangle, CheckCircle2, Download, Eye, Lock, Mail, Printer, RefreshCcw, XCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { useExcelExport } from '../../utils/apReports';
import { getStoredUser, hasPerm } from '../../utils/session';
import { ArStatus, ArTasks, PageHeader, Tiles } from '../../components/ar/ArShared';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;
const TABS = ['close', 'statements', 'gst'];
const AGE_LABEL = { not_due: 'Not due', d0_30: '1–30 days', d31_60: '31–60 days', d61_90: '61–90 days', d90: 'Over 90 days' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const kpiValue = (k) => {
  if (k.value === null || k.value === undefined) return '—';
  if (k.unit === '₹') return inr(k.value);
  if (k.unit === '%') return `${k.value}%`;
  return `${k.value} ${k.unit}`;
};

/** Opens the statement in a new window, laid out for printing or saving as PDF. */
function printStatement(s) {
  const rows = s.lines.map((l) => `<tr><td>${esc(fmt(l.date))}</td><td>${esc(l.type)}</td><td>${esc(l.reference)}</td><td class="n">${l.debit ? esc(inr(l.debit)) : ''}</td><td class="n">${l.credit ? esc(inr(l.credit)) : ''}</td><td class="n">${esc(inr(l.balance))}</td></tr>`).join('');
  const ageing = Object.entries(s.ageing || {}).map(([k, v]) => `<td class="n">${esc(AGE_LABEL[k] || k)}<br><b>${esc(inr(v))}</b></td>`).join('');
  const w = window.open('', '_blank');
  if (!w) { message.warning('Allow pop-ups to print the statement'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Statement ${esc(s.customer.customer_name)}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;font-size:12px;margin:24px;color:#111}h2{margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left}th{background:#f1f5f9}.n{text-align:right}.muted{color:#64748b}</style></head><body>
<h2>Statement of account</h2><div>${esc(s.customer.customer_name)}${s.customer.customer_code ? ` (${esc(s.customer.customer_code)})` : ''}${s.customer.gst_number ? ` · GSTIN ${esc(s.customer.gst_number)}` : ''}</div>
<div class="muted">${esc(fmt(s.from))} to ${esc(fmt(s.to))}</div>
<table><thead><tr><th>Date</th><th>Details</th><th>Reference</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr></thead>
<tbody><tr><td>${esc(fmt(s.from))}</td><td colspan="4">Opening balance</td><td class="n">${esc(inr(s.opening_balance))}</td></tr>${rows}
<tr><td>${esc(fmt(s.to))}</td><td colspan="4"><b>Closing balance (amount owed)</b></td><td class="n"><b>${esc(inr(s.closing_balance))}</b></td></tr></tbody></table>
<table><tr>${ageing}</tr></table>
<p class="muted">Please confirm the closing balance or tell us about any difference.</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

const ArClose = () => {
  const navigate = useNavigate();
  const user = getStoredUser();
  const canChange = hasPerm(user, 'AR', 'EDIT');
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'close';
  const { exportSheets } = useExcelExport();
  // "Waiting for you" → Open passes ?period=YYYY-MM (the month to sign off) and ?open=<close id>.
  const linkedPeriod = /^\d{4}-\d{2}$/.test(params.get('period') || '') ? params.get('period') : null;
  const [month, setMonth] = useState(() => (linkedPeriod ? dayjs(`${linkedPeriod}-01`) : dayjs()));
  const period = month.format('YYYY-MM');
  const linkedOpen = params.get('open');
  useEffect(() => {
    if (!linkedPeriod && !linkedOpen) return;
    if (linkedPeriod) setMonth(dayjs(`${linkedPeriod}-01`));
    const next = new URLSearchParams(params);
    next.delete('period');
    next.delete('open');
    setParams(next, { replace: true });
  }, [linkedPeriod, linkedOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Close ───────────────────────────────────────────────────────────────────
  const [close, setClose] = useState(null);
  const [loadingClose, setLoadingClose] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenForm] = Form.useForm();

  const loadClose = useCallback(async () => {
    setLoadingClose(true);
    try {
      const res = await api.get('/ar/close', { params: { period } });
      setClose(res?.data?.data || null);
    } catch (e) {
      message.error(errorOf(e, 'Could not load the month-end checklist'));
    } finally {
      setLoadingClose(false);
    }
  }, [period]);

  const act = async (path, body, fallback) => {
    setBusy(true);
    try {
      const res = await api.post(path, body || {});
      message.success(res?.data?.message || 'Done');
      setRefreshKey((k) => k + 1);
      loadClose();
      return true;
    } catch (e) {
      message.error(errorOf(e, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const reopen = async () => {
    const v = await reopenForm.validateFields();
    if (await act(`/ar/close/${period}/reopen`, { reason: v.reason }, 'Could not reopen the month')) setReopenOpen(false);
  };

  // ── Statements ──────────────────────────────────────────────────────────────
  const [statements, setStatements] = useState([]);
  const [stSummary, setStSummary] = useState({});
  const [loadingSt, setLoadingSt] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [viewCustomer, setViewCustomer] = useState(null);
  const [statement, setStatement] = useState(null);
  const [replyFor, setReplyFor] = useState(null);
  const [replyForm] = Form.useForm();
  const reply = Form.useWatch('response', replyForm);

  const loadStatements = useCallback(async () => {
    setLoadingSt(true);
    try {
      const [s, c] = await Promise.all([api.get('/ar/statements', { params: { period } }), api.get('/ar/customers').catch(() => null)]);
      setStatements(s?.data?.data || []);
      setStSummary(s?.data?.summary || {});
      setCustomers(c?.data?.data || []);
    } catch (e) {
      message.error(errorOf(e, 'Could not load statements'));
    } finally {
      setLoadingSt(false);
    }
  }, [period]);

  const monthFrom = month.startOf('month').format('YYYY-MM-DD');
  const monthTo = month.isSame(dayjs(), 'month') ? dayjs().format('YYYY-MM-DD') : month.endOf('month').format('YYYY-MM-DD');
  const openStatement = async (customerId, from = monthFrom, to = monthTo) => {
    try {
      const res = await api.get(`/ar/customers/${customerId}/statement`, { params: { from, to } });
      setStatement(res?.data?.data || null);
    } catch (e) {
      message.error(errorOf(e, 'Could not build the statement'));
    }
  };
  const sendStatements = async () => {
    setBusy(true);
    try {
      const res = await api.post('/ar/statements/send', { period });
      message.success(res?.data?.message || 'Statements sent');
      loadStatements();
    } catch (e) {
      message.error(errorOf(e, 'Could not send statements'));
    } finally {
      setBusy(false);
    }
  };
  const saveReply = async () => {
    const v = await replyForm.validateFields();
    setBusy(true);
    try {
      const res = await api.post(`/ar/statements/${replyFor.id}/response`, v);
      message.success(res?.data?.message || 'Reply recorded');
      setReplyFor(null);
      loadStatements();
    } catch (e) {
      message.error(errorOf(e, 'Could not record the reply'));
    } finally {
      setBusy(false);
    }
  };

  // ── GST register ────────────────────────────────────────────────────────────
  const [gst, setGst] = useState(null);
  const [loadingGst, setLoadingGst] = useState(false);
  const loadGst = useCallback(async () => {
    setLoadingGst(true);
    try {
      const res = await api.get('/ar/gst/sales-register', { params: { period } });
      setGst(res?.data?.data || null);
    } catch (e) {
      message.error(errorOf(e, 'Could not load the GST sales register'));
    } finally {
      setLoadingGst(false);
    }
  }, [period]);

  const exportGst = () => {
    if (!gst) return;
    const money = (k) => (r) => r[k];
    exportSheets([
      { name: 'Summary', title: `GSTR-1 summary ${month.format('MMMM YYYY')}`, rows: gst.summary, columns: [{ label: 'Section', value: (r) => r.section }, { label: 'Count', value: (r) => r.count }, { label: 'Taxable value', value: money('taxable_value') }, { label: 'IGST', value: money('igst') }, { label: 'CGST', value: money('cgst') }, { label: 'SGST', value: money('sgst') }, { label: 'Total', value: money('total') }] },
      { name: 'Invoices', title: `Sales register ${month.format('MMMM YYYY')}`, rows: gst.invoices, columns: [{ label: 'Section', value: (r) => r.section }, { label: 'Invoice', value: (r) => r.invoice_number }, { label: 'Date', value: (r) => r.invoice_date }, { label: 'Customer', value: (r) => r.customer_name }, { label: 'GSTIN', value: (r) => r.gstin || '' }, { label: 'Place of supply', value: (r) => r.place_of_supply || '' }, { label: 'Taxable value', value: money('taxable_value') }, { label: 'IGST', value: money('igst') }, { label: 'CGST', value: money('cgst') }, { label: 'SGST', value: money('sgst') }, { label: 'Total', value: money('total') }, { label: 'IRN', value: (r) => r.irn || '' }] },
      { name: 'Credit notes', title: `Credit notes ${month.format('MMMM YYYY')}`, rows: gst.credit_notes, columns: [{ label: 'Section', value: (r) => r.section }, { label: 'Credit note', value: (r) => r.credit_note_number }, { label: 'Date', value: (r) => r.credit_date }, { label: 'Customer', value: (r) => r.customer_name }, { label: 'GSTIN', value: (r) => r.gstin || '' }, { label: 'Original invoice', value: (r) => r.original_invoice }, { label: 'Original date', value: (r) => r.original_date }, { label: 'Taxable value', value: money('taxable_value') }, { label: 'IGST', value: money('igst') }, { label: 'CGST', value: money('cgst') }, { label: 'SGST', value: money('sgst') }, { label: 'Total', value: money('total') }] },
      { name: 'HSN', title: `HSN summary ${month.format('MMMM YYYY')}`, rows: gst.hsn, columns: [{ label: 'HSN / SAC', value: (r) => r.hsn_code }, { label: 'GST %', value: (r) => r.gst_percent }, { label: 'Quantity', value: (r) => r.quantity }, { label: 'Taxable value', value: money('taxable_value') }, { label: 'Tax', value: money('tax') }] },
    ], `GST_Sales_Register_${period}`);
  };

  useEffect(() => {
    if (tab === 'close') loadClose();
    else if (tab === 'statements') loadStatements();
    else loadGst();
  }, [tab, loadClose, loadStatements, loadGst]);

  const refresh = () => { setRefreshKey((k) => k + 1); if (tab === 'close') loadClose(); else if (tab === 'statements') loadStatements(); else loadGst(); };

  const monthPicker = (
    <Space wrap>
      <Text>Month</Text>
      <DatePicker picker="month" value={month} allowClear={false} onChange={(d) => d && setMonth(d)} disabledDate={(d) => d && d.isAfter(dayjs(), 'month')} format="MMM YYYY" />
    </Space>
  );

  const checkIcon = (item) => {
    if (item.ok) return <CheckCircle2 size={18} color="#16a34a" />;
    return item.group === 'must' ? <XCircle size={18} color="#dc2626" /> : <AlertTriangle size={18} color="#d97706" />;
  };
  const checklistList = (items) => (
    <List
      size="small" dataSource={items}
      renderItem={(i) => (
        <List.Item actions={i.path ? [<Button key="go" size="small" type="link" onClick={() => navigate(i.path)}>Open</Button>] : []}>
          <Space align="start" size={10}>
            {checkIcon(i)}
            <div>
              <Text strong>{i.label}</Text>
              <div><Text type="secondary" style={{ fontSize: 12 }}>{i.detail}</Text></div>
              {i.key === 'cutoff' && i.list && (i.list.deliveries.length > 0 || i.list.invoices.length > 0) && (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {i.list.deliveries.map((d) => <div key={`d${d.id}`}>{d.delivery_number}: dispatched {fmt(d.dispatch_date)}{d.delivered_date ? `, delivered ${fmt(d.delivered_date)}` : ''}{d.invoice_id ? ', invoiced' : ', not invoiced'}</div>)}
                  {i.list.invoices.map((inv) => <div key={`i${inv.id}`}>{inv.invoice_number}: invoiced {fmt(inv.invoice_date)} for {inr(inv.total_amount)}</div>)}
                </div>
              )}
            </div>
          </Space>
        </List.Item>
      )}
    />
  );

  const open = close && ['OPEN', 'REOPENED'].includes(close.status);
  const items = close?.checklist?.items || [];

  return (
    <div>
      <PageHeader
        icon={<Lock size={24} />}
        title="AR Close & Reports"
        subtitle="Month-end close of receivables with two-level sign-off, customer statements and confirmations, and the GST sales register"
        actions={[<Button key="r" icon={<RefreshCcw size={16} />} onClick={refresh}>Refresh</Button>]}
      />
      <ArTasks kinds={['AR_CLOSE']} refreshKey={refreshKey} />
      <Card style={card} styles={{ body: { padding: '0 0 8px' } }}>
        <Tabs
          activeKey={tab}
          onChange={(k) => setParams(k === 'close' ? {} : { tab: k })}
          tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
          items={[
            {
              key: 'close', label: 'Month-end close',
              children: (
                <div style={{ padding: 16 }}>
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Row justify="space-between" align="middle" gutter={[12, 12]}>
                      <Col>{monthPicker} {close && <span style={{ marginLeft: 8 }}><ArStatus status={close.status} kind="close" /></span>}</Col>
                      <Col>
                        {close && (
                          <Space wrap>
                            {open && canChange && (
                              <Popconfirm title={`Close ${close.label}?`} description="AR postings dated in this month will be locked." onConfirm={() => act(`/ar/close/${period}/close`, {}, 'Could not close the month')} okText="Close month" disabled={!close.can_close}>
                                <Button type="primary" icon={<Lock size={15} />} loading={busy} disabled={!close.can_close}>Close {close.label}</Button>
                              </Popconfirm>
                            )}
                            {close.can_sign_off && (
                              <Popconfirm title={`Sign off ${close.label}?`} onConfirm={() => act(`/ar/close/${period}/sign-off`, {}, 'Could not sign off')} okText="Sign off">
                                <Button type="primary" loading={busy}>Sign off</Button>
                              </Popconfirm>
                            )}
                            {close.can_reopen && <Button danger onClick={() => { reopenForm.resetFields(); setReopenOpen(true); }}>Reopen</Button>}
                          </Space>
                        )}
                      </Col>
                    </Row>
                    <Text type="secondary">A closed month locks Accounts Receivable postings dated in it (invoices, receipts, credit notes, write-offs, provisions). Accounts Payable is not affected.</Text>
                    {close && (
                      <>
                        <Tiles tiles={close.kpis.map((k) => ({ label: k.label, value: kpiValue(k), sub: `Target ${k.target}`, alert: k.good === false }))} />
                        {close.status === 'CLOSED' && close.sign_off_block && !close.can_sign_off && <Alert type="info" showIcon message="Waiting for sign-off" description={close.sign_off_block} />}
                        {open && !close.checklist.ready && <Alert type="warning" showIcon message="The month cannot be closed yet" description="Clear the items marked in red first." />}
                        <Row gutter={[16, 16]}>
                          <Col xs={24} lg={12}><Card size="small" style={card} title="Must be clear before closing" loading={loadingClose}>{checklistList(items.filter((i) => i.group === 'must'))}</Card></Col>
                          <Col xs={24} lg={12}><Card size="small" style={card} title="Review before closing" loading={loadingClose}>{checklistList(items.filter((i) => i.group === 'review'))}</Card></Col>
                        </Row>
                        {close.record && (
                          <Descriptions size="small" bordered column={2}>
                            <Descriptions.Item label="Closed by">{close.record.closed_by_name ? `${close.record.closed_by_name} · ${fmt(close.record.closed_at)}` : '—'}</Descriptions.Item>
                            <Descriptions.Item label="Signed off by">{close.record.signed_off_by_name ? `${close.record.signed_off_by_name} · ${fmt(close.record.signed_off_at)}` : '—'}</Descriptions.Item>
                            {close.record.reopen_reason && <Descriptions.Item label="Reopened" span={2}>{close.record.reopened_by_name} · {fmt(close.record.reopened_at)}: {close.record.reopen_reason}</Descriptions.Item>}
                          </Descriptions>
                        )}
                        <Table
                          size="small" rowKey="period" pagination={false} dataSource={close.history} title={() => <Text strong>Past months</Text>} locale={{ emptyText: 'No month closed yet' }}
                          columns={[
                            { title: 'Month', dataIndex: 'label' },
                            { title: 'Status', dataIndex: 'status', render: (v) => <ArStatus status={v} kind="close" /> },
                            { title: 'Closed by', key: 'c', render: (_, h) => (h.closed_by_name ? `${h.closed_by_name} · ${fmt(h.closed_at)}` : '—') },
                            { title: 'Signed off by', key: 's', render: (_, h) => (h.signed_off_by_name ? `${h.signed_off_by_name} · ${fmt(h.signed_off_at)}` : '—') },
                          ]}
                        />
                      </>
                    )}
                  </Space>
                </div>
              ),
            },
            {
              key: 'statements', label: 'Customer statements',
              children: (
                <div style={{ padding: 16 }}>
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Row justify="space-between" align="middle" gutter={[12, 12]}>
                      <Col>{monthPicker}</Col>
                      <Col>
                        <Space wrap>
                          <Select
                            showSearch optionFilterProp="label" placeholder="Any customer's statement" style={{ minWidth: 240 }} value={viewCustomer} onChange={setViewCustomer}
                            options={customers.map((c) => ({ value: c.id, label: c.customer_name }))}
                          />
                          <Button icon={<Eye size={15} />} disabled={!viewCustomer} onClick={() => openStatement(viewCustomer)}>View statement</Button>
                          {canChange && (
                            <Popconfirm title={`Send statements for ${month.format('MMMM YYYY')}?`} description="Every customer with a balance or activity gets one; customers without an email are recorded only." onConfirm={sendStatements} okText="Send">
                              <Button type="primary" icon={<Mail size={15} />} loading={busy}>Send statements for the month</Button>
                            </Popconfirm>
                          )}
                        </Space>
                      </Col>
                    </Row>
                    <Tiles tiles={[
                      { label: 'Statements', value: stSummary.sent || 0, sub: `${stSummary.emailed || 0} emailed` },
                      { label: 'Agreed', value: stSummary.agreed || 0, sub: 'Customer confirmed the balance' },
                      { label: 'Disputed', value: stSummary.disputed || 0, sub: `Difference ${inr(stSummary.difference)}`, alert: stSummary.disputed > 0 },
                      { label: 'No reply yet', value: stSummary.pending || 0, sub: 'Follow up with the customer' },
                    ]} />
                    <Table
                      rowKey="id" loading={loadingSt} dataSource={statements} scroll={{ x: 'max-content' }} pagination={{ pageSize: 15, hideOnSinglePage: true }}
                      locale={{ emptyText: 'No statements sent for this month yet' }}
                      columns={[
                        { title: 'Customer', key: 'c', render: (_, r) => <Text strong>{r.customer?.customer_name}</Text> },
                        { title: 'Period', key: 'p', render: (_, r) => `${fmt(r.period_from)} – ${fmt(r.period_to)}` },
                        { title: 'Closing balance', dataIndex: 'closing_balance', align: 'right', render: inr },
                        { title: 'Sent', dataIndex: 'delivery', render: (v, r) => <Space direction="vertical" size={0}><ArStatus status={v} />{r.delivery_note && <Text type="secondary" style={{ fontSize: 12 }}>{r.delivery_note}</Text>}</Space> },
                        { title: 'Customer reply', dataIndex: 'response', render: (v, r) => <Space direction="vertical" size={0}><ArStatus status={v} kind="statement" />{r.response === 'DISPUTED' && <Text type="danger" style={{ fontSize: 12 }}>Their balance {inr(r.customer_balance)} · difference {inr(r.difference)}</Text>}{r.response_note && <Text type="secondary" style={{ fontSize: 12 }}>{r.response_note}</Text>}</Space> },
                        {
                          title: '', key: 'act', render: (_, r) => (
                            <Space>
                              <Button size="small" icon={<Eye size={14} />} onClick={() => openStatement(r.customer_id, r.period_from, r.period_to)}>View</Button>
                              {canChange && <Button size="small" onClick={() => { replyForm.resetFields(); replyForm.setFieldsValue({ response: 'AGREED' }); setReplyFor(r); }}>Record reply</Button>}
                            </Space>
                          ),
                        },
                      ]}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>The customer's confirmation is the AR side of the reconciliation: the statement (our ledger) against the customer's books. Disputed differences are followed up before the month is closed.</Text>
                  </Space>
                </div>
              ),
            },
            {
              key: 'gst', label: 'GST sales register',
              children: (
                <div style={{ padding: 16 }}>
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Row justify="space-between" align="middle" gutter={[12, 12]}>
                      <Col>{monthPicker}</Col>
                      <Col><Button icon={<Download size={15} />} onClick={exportGst} disabled={!gst}>Export to Excel</Button></Col>
                    </Row>
                    {gst && (
                      <>
                        {gst.irn_missing > 0 && <Alert type="warning" showIcon message={`${gst.irn_missing} business invoice${gst.irn_missing === 1 ? '' : 's'} without an IRN`} description="E-invoicing applies to this company: register these on the e-invoice portal and enter the IRN on the invoice." />}
                        <Table
                          size="small" rowKey="section" pagination={false} loading={loadingGst} dataSource={gst.summary}
                          columns={[
                            { title: 'GSTR-1 section', dataIndex: 'section', render: (v) => <Text strong={v === 'Net output tax'}>{v}</Text> },
                            { title: 'Count', dataIndex: 'count', align: 'right', render: (v, r) => (r.section === 'Net output tax' ? '' : v) },
                            { title: 'Taxable value', dataIndex: 'taxable_value', align: 'right', render: inr },
                            { title: 'IGST', dataIndex: 'igst', align: 'right', render: inr },
                            { title: 'CGST', dataIndex: 'cgst', align: 'right', render: inr },
                            { title: 'SGST', dataIndex: 'sgst', align: 'right', render: inr },
                            { title: 'Total', dataIndex: 'total', align: 'right', render: inr },
                          ]}
                        />
                        <Text>Net output tax for {month.format('MMMM YYYY')}: <Text strong>{inr(gst.net_tax)}</Text> (invoices less credit notes)</Text>
                        <Table
                          size="small" rowKey="id" loading={loadingGst} dataSource={gst.invoices} scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, hideOnSinglePage: true }} title={() => <Text strong>Invoices (B2B and B2C)</Text>}
                          locale={{ emptyText: 'No invoices this month' }}
                          columns={[
                            { title: 'Section', dataIndex: 'section', render: (v) => <Tag>{v}</Tag> },
                            { title: 'Invoice', dataIndex: 'invoice_number', render: (v, r) => <Space size={4} wrap><span>{v}</span>{r.irn_missing && <Tag color="warning">No IRN</Tag>}{r.no_delivery && <Tag>No delivery</Tag>}</Space> },
                            { title: 'Date', dataIndex: 'invoice_date', render: fmt },
                            { title: 'Customer', dataIndex: 'customer_name' },
                            { title: 'GSTIN', dataIndex: 'gstin', render: (v) => v || '—' },
                            { title: 'Place of supply', dataIndex: 'place_of_supply', render: (v) => v || '—' },
                            { title: 'Taxable value', dataIndex: 'taxable_value', align: 'right', render: inr },
                            { title: 'IGST', dataIndex: 'igst', align: 'right', render: inr },
                            { title: 'CGST', dataIndex: 'cgst', align: 'right', render: inr },
                            { title: 'SGST', dataIndex: 'sgst', align: 'right', render: inr },
                            { title: 'Total', dataIndex: 'total', align: 'right', render: inr },
                          ]}
                        />
                        <Table
                          size="small" rowKey="id" dataSource={gst.credit_notes} scroll={{ x: 'max-content' }} pagination={false} title={() => <Text strong>Credit notes (CDNR for registered customers, CDNUR for unregistered)</Text>}
                          locale={{ emptyText: 'No credit notes this month' }}
                          columns={[
                            { title: 'Section', dataIndex: 'section', render: (v) => <Tag>{v}</Tag> },
                            { title: 'Credit note', dataIndex: 'credit_note_number' },
                            { title: 'Date', dataIndex: 'credit_date', render: fmt },
                            { title: 'Customer', dataIndex: 'customer_name' },
                            { title: 'Original invoice', key: 'o', render: (_, r) => `${r.original_invoice || ''} (${fmt(r.original_date)})` },
                            { title: 'Taxable value', dataIndex: 'taxable_value', align: 'right', render: inr },
                            { title: 'IGST', dataIndex: 'igst', align: 'right', render: inr },
                            { title: 'CGST', dataIndex: 'cgst', align: 'right', render: inr },
                            { title: 'SGST', dataIndex: 'sgst', align: 'right', render: inr },
                            { title: 'Total', dataIndex: 'total', align: 'right', render: inr },
                          ]}
                        />
                        <Table
                          size="small" rowKey={(r) => `${r.hsn_code}-${r.gst_percent}`} dataSource={gst.hsn} pagination={false} title={() => <Text strong>HSN / SAC summary</Text>}
                          locale={{ emptyText: 'No item lines this month (invoices entered without lines have no HSN)' }}
                          columns={[
                            { title: 'HSN / SAC', dataIndex: 'hsn_code' },
                            { title: 'GST %', dataIndex: 'gst_percent', align: 'right', render: (v) => `${v}%` },
                            { title: 'Quantity', dataIndex: 'quantity', align: 'right' },
                            { title: 'Taxable value', dataIndex: 'taxable_value', align: 'right', render: inr },
                            { title: 'Tax', dataIndex: 'tax', align: 'right', render: inr },
                          ]}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>For filing GSTR-1. Output GST is paid through GSTR-3B after setting off input credit. LedgerLine does not file returns or generate IRNs; enter the IRN on each invoice after registering it on the e-invoice portal.</Text>
                      </>
                    )}
                  </Space>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={reopenOpen} title={`Reopen ${close?.label || ''}`} onCancel={() => setReopenOpen(false)} onOk={reopen} confirmLoading={busy} okText="Reopen" okButtonProps={{ danger: true }} destroyOnClose>
        <Alert style={{ marginBottom: 12 }} type="warning" showIcon message="Reopening unlocks AR postings dated in this month. Close it again once the corrections are posted." />
        <Form form={reopenForm} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Give the reason' }]} style={{ marginBottom: 0 }}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!statement} width={860} onCancel={() => setStatement(null)} destroyOnClose
        title={statement ? `Statement of account · ${statement.customer.customer_name}` : ''}
        footer={[<Button key="p" icon={<Printer size={15} />} onClick={() => printStatement(statement)}>Print / save as PDF</Button>, <Button key="x" type="primary" onClick={() => setStatement(null)}>Close</Button>]}
      >
        {statement && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Text type="secondary">{fmt(statement.from)} to {fmt(statement.to)}{statement.customer.gst_number ? ` · GSTIN ${statement.customer.gst_number}` : ''}</Text>
            <Table
              size="small" rowKey={(l, i) => i} pagination={false} dataSource={statement.lines} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Date', dataIndex: 'date', render: fmt },
                { title: 'Details', dataIndex: 'type' },
                { title: 'Reference', dataIndex: 'reference' },
                { title: 'Debit', dataIndex: 'debit', align: 'right', render: (v) => (v ? inr(v) : '') },
                { title: 'Credit', dataIndex: 'credit', align: 'right', render: (v) => (v ? inr(v) : '') },
                { title: 'Balance', dataIndex: 'balance', align: 'right', render: inr },
              ]}
              title={() => <Text>Opening balance <Text strong>{inr(statement.opening_balance)}</Text></Text>}
              footer={() => <Text>Closing balance (amount owed) <Text strong>{inr(statement.closing_balance)}</Text></Text>}
            />
            <Space wrap size={[16, 4]}>
              {Object.entries(statement.ageing || {}).map(([k, v]) => <Text key={k}>{AGE_LABEL[k] || k}: <Text strong>{inr(v)}</Text></Text>)}
            </Space>
          </Space>
        )}
      </Modal>

      <Modal open={!!replyFor} title={replyFor ? `Customer reply · ${replyFor.customer?.customer_name}` : ''} onCancel={() => setReplyFor(null)} onOk={saveReply} confirmLoading={busy} okText="Record reply" destroyOnClose>
        {replyFor && <Text>Our closing balance: <Text strong>{inr(replyFor.closing_balance)}</Text> ({fmt(replyFor.period_to)})</Text>}
        <Form form={replyForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="response" label="The customer" rules={[{ required: true, message: 'Required' }]}>
            <Radio.Group options={[{ value: 'AGREED', label: 'Agreed the balance' }, { value: 'DISPUTED', label: 'Disputed it' }]} />
          </Form.Item>
          {reply === 'DISPUTED' && (
            <Form.Item name="customer_balance" label="Balance as per the customer" rules={[{ required: true, message: 'Required' }]}>
              <InputNumber prefix="₹" style={{ width: '100%' }} />
            </Form.Item>
          )}
          <Form.Item name="note" label={reply === 'DISPUTED' ? 'What the customer says the difference is' : 'Note (optional)'} rules={reply === 'DISPUTED' ? [{ required: true, message: 'Required' }] : []}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ArClose;
