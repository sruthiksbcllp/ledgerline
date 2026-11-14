import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, DatePicker, Dropdown, Empty, Form, Input, Modal, Radio, Segmented, Select, Space, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import { FileText, Inbox, Mail, MoreHorizontal, Pause, Play, RefreshCcw, Settings2, Sparkles, Zap } from 'lucide-react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import ConnectEmailModal from '../settings/ConnectEmailModal';
import AutoSubmitSettings from './AutoSubmitSettings';

const { Text } = Typography;
const inr = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const when = (d) => (d ? dayjs(d).format('DD MMM, HH:mm') : '—');
const MAILBOX_CODES = ['NO_MAILBOX', 'NOT_OUTLOOK', 'NEEDS_MAIL_READ', 'RECONNECT'];
const WATCH_AFTER_CONNECT = 'billInbox.watchAfterConnect';

const TYPE = {
  INVOICE: { label: 'Invoice', color: 'blue' },
  CREDIT_NOTE: { label: 'Credit note', color: 'purple' },
  STATEMENT: { label: 'Statement', color: 'cyan' },
  PAYMENT_RECEIPT: { label: 'Receipt', color: 'default' },
  PURCHASE_ORDER: { label: 'Purchase order', color: 'default' },
  OTHER: { label: 'Other', color: 'default' },
};
const MATCHED_BY = { GSTIN: 'by GSTIN', NAME: 'by name', EMAIL: 'by sender email' };
const VIEWS = [
  { key: 'review', label: 'To review' },
  { key: 'credit', label: 'Credit notes' },
  { key: 'statement', label: 'Statements' },
  { key: 'aside', label: 'Set aside' },
  { key: 'done', label: 'Done' },
];
const MODES = [
  { value: 'LIKELY_BILLS', label: 'Only emails that look like bills', hint: 'Emails from your vendors, or whose subject, text or file name mentions an invoice, bill, credit note or statement.' },
  { value: 'ALL_ATTACHMENTS', label: 'Every email with a PDF or image', hint: 'For a mailbox used only for bills (e.g. bills@yourcompany.com).' },
];

const sessionGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sessionSet = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* ignore */ } };

/**
 * Bills captured from email: LedgerLine checks the connected Outlook mailbox, reads each bill with
 * AI, sorts it and matches the vendor and PO. A person reviews each one here; nothing is posted
 * until they accept it. onReview(id) opens the filled-in invoice form; refreshKey reloads the list.
 */
export default function BillInbox({ onReview, refreshKey = 0, onCount }) {
  const navigate = useNavigate();
  const [view, setView] = useState('review');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [mode, setMode] = useState('LIKELY_BILLS');
  const [dept, setDept] = useState(null);
  const [rejectItem, setRejectItem] = useState(null);
  const [creditItem, setCreditItem] = useState(null);
  const [returns, setReturns] = useState([]);
  const [rejectForm] = Form.useForm();
  const [creditForm] = Form.useForm();
  const pollRef = useRef(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await api.get('/bill-inbox', { params: { view } });
      const d = res?.data?.data;
      setData(d);
      onCount?.((d?.counts?.review || 0) + (d?.counts?.credit || 0) + (d?.counts?.statement || 0));
    } catch (e) {
      if (!quiet) message.error(e?.response?.data?.message || 'Could not load the bill inbox');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [view, onCount]);
  useEffect(() => { load(); }, [load, refreshKey]);

  // While a check is running, refresh every 4 seconds so new bills appear as they are read.
  useEffect(() => {
    clearInterval(pollRef.current);
    if (data?.checking) pollRef.current = setInterval(() => load(true), 4000);
    return () => clearInterval(pollRef.current);
  }, [data?.checking, load]);

  const sources = data?.sources || [];
  const mine = sources.find((s) => s.mine);

  const watch = useCallback(async (chosenMode) => {
    setBusy('watch');
    try {
      const res = await api.post('/bill-inbox/sources', { mode: chosenMode });
      message.success(res?.data?.message || 'Watching your mailbox');
      sessionSet(WATCH_AFTER_CONNECT, null);
      setSettingsOpen(false);
      await load(true);
    } catch (e) {
      const d = e?.response?.data;
      if (MAILBOX_CODES.includes(d?.code)) {
        sessionSet(WATCH_AFTER_CONNECT, chosenMode); // continue automatically after the Outlook sign-in
        message.info(d.message);
        setConnectOpen(true);
      } else {
        message.error(d?.message || 'Could not start watching your mailbox');
      }
    } finally {
      setBusy(null);
    }
  }, [load]);

  // Back from the Outlook sign-in: finish what was started.
  useEffect(() => {
    const pending = sessionGet(WATCH_AFTER_CONNECT);
    if (pending) { sessionSet(WATCH_AFTER_CONNECT, null); watch(pending); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkNow = async () => {
    setBusy('check');
    try {
      const res = await api.post('/bill-inbox/check');
      message.info(res?.data?.message || 'Checking…');
      setTimeout(() => load(true), 1500);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not start the check');
    } finally {
      setBusy(null);
    }
  };

  const updateSource = async (source, changes) => {
    try {
      const res = await api.put(`/bill-inbox/sources/${source.id}`, changes);
      message.success(res?.data?.message || 'Saved');
      setSettingsOpen(false);
      load(true);
    } catch (e) { message.error(e?.response?.data?.message || 'Could not save'); }
  };
  const removeSource = (source) => Modal.confirm({
    title: `Stop checking ${source.mailbox_email} for bills?`,
    content: 'Bills already captured stay in the inbox.',
    okText: 'Stop',
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        const res = await api.delete(`/bill-inbox/sources/${source.id}`);
        message.success(res?.data?.message || 'Stopped');
        setSettingsOpen(false);
        load(true);
      } catch (e) { message.error(e?.response?.data?.message || 'Could not stop'); }
    },
  });

  const openFile = async (item) => {
    try {
      const res = await api.get(`/bill-inbox/${item.id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { message.error('Could not open the file'); }
  };

  const setStatus = async (item, status, extra = {}) => {
    setBusy(`item-${item.id}`);
    try {
      const res = await api.put(`/bill-inbox/${item.id}/status`, { status, ...extra });
      message.success(res?.data?.message || 'Done');
      load(true);
      return true;
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not update');
      return false;
    } finally { setBusy(null); }
  };
  const reread = async (item) => {
    setBusy(`item-${item.id}`);
    try {
      const res = await api.post(`/bill-inbox/${item.id}/reread`, {}, { timeout: 180000 });
      message.info(res?.data?.message || 'Read again');
      load(true);
    } catch (e) { message.error(e?.response?.data?.message || 'Could not read it again'); } finally { setBusy(null); }
  };

  const submitReject = async () => {
    const { reason } = await rejectForm.validateFields();
    if (await setStatus(rejectItem, 'REJECTED', { reason })) setRejectItem(null);
  };

  const openCredit = async (item) => {
    setCreditItem(item);
    creditForm.setFieldsValue({
      purchase_return_id: item.purchase_return?.id,
      credit_note_number: item.invoice_number || undefined,
      credit_note_date: item.invoice_date ? dayjs(item.invoice_date) : dayjs(),
    });
    try {
      const res = await api.get(`/bill-inbox/${item.id}/returns`);
      setReturns(res?.data?.data || []);
    } catch { setReturns([]); }
  };
  const submitCredit = async () => {
    const v = await creditForm.validateFields();
    setBusy('credit');
    try {
      const res = await api.post(`/bill-inbox/${creditItem.id}/credit-note`, {
        ...v, credit_note_date: v.credit_note_date ? v.credit_note_date.format('YYYY-MM-DD') : undefined,
      });
      message.success(res?.data?.message || 'Credit note recorded');
      setCreditItem(null);
      load(true);
    } catch (e) { message.error(e?.response?.data?.message || 'Could not record the credit note'); } finally { setBusy(null); }
  };

  const items = useMemo(() => data?.items || [], [data]);
  const departments = useMemo(() => {
    const map = new Map();
    items.forEach((i) => { if (i.department) map.set(i.department.id, i.department.name); });
    return [...map].map(([value, label]) => ({ value, label }));
  }, [items]);
  const visible = dept ? items.filter((i) => i.department?.id === dept) : items;

  const actionsFor = (item) => {
    const more = [];
    const primary = [];
    if (view === 'review') {
      primary.push(<Button key="review" type="primary" size="small" onClick={() => onReview?.(item.id)}>Review</Button>);
      if (item.status === 'FAILED') more.push({ key: 'reread', label: 'Read with AI again', onClick: () => reread(item) });
      more.push({ key: 'aside', label: 'Not a bill', onClick: () => setStatus(item, 'SET_ASIDE', { reason: 'Marked as not a bill' }) });
      more.push({ key: 'reject', label: 'Reject…', danger: true, onClick: () => { rejectForm.resetFields(); setRejectItem(item); } });
    } else if (view === 'credit') {
      primary.push(<Button key="credit" type="primary" size="small" onClick={() => openCredit(item)}>Record on return</Button>);
      more.push({ key: 'done', label: 'Mark done (handled elsewhere)', onClick: () => setStatus(item, 'DONE', { reason: 'Credit note handled outside the bill inbox' }) });
      more.push({ key: 'bill', label: 'Treat as a bill', onClick: () => setStatus(item, 'NEW', { document_type: 'INVOICE' }) });
      more.push({ key: 'reject', label: 'Reject…', danger: true, onClick: () => { rejectForm.resetFields(); setRejectItem(item); } });
    } else if (view === 'statement') {
      primary.push(<Button key="rec" size="small" onClick={() => setStatus(item, 'DONE', { reason: 'Statement reconciled' })}>Mark reconciled</Button>);
      more.push({ key: 'bill', label: 'Treat as a bill', onClick: () => setStatus(item, 'NEW', { document_type: 'INVOICE' }) });
    } else if (view === 'aside') {
      primary.push(<Button key="bill" size="small" onClick={() => setStatus(item, 'NEW', { document_type: 'INVOICE' })}>Treat as a bill</Button>);
      more.push({ key: 'reject', label: 'Reject…', danger: true, onClick: () => { rejectForm.resetFields(); setRejectItem(item); } });
    } else if (item.status !== 'ACCEPTED') {
      primary.push(<Button key="back" size="small" onClick={() => setStatus(item, 'NEW')}>Move back to review</Button>);
    }
    return (
      <Space size={4}>
        {primary}
        {more.length > 0 && (
          <Dropdown menu={{ items: more.map(({ onClick, ...m }) => ({ ...m, onClick })) }} trigger={['click']}>
            <Button size="small" type="text" icon={<MoreHorizontal size={16} />} loading={busy === `item-${item.id}`} />
          </Dropdown>
        )}
      </Space>
    );
  };

  const columns = [
    {
      title: 'Received', key: 'email', width: 260, render: (_, i) => (
        <div style={{ maxWidth: 260 }}>
          <Text strong>{i.email_from_name || i.email_from}</Text>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{when(i.received_at)}{i.email_from_name ? ` · ${i.email_from}` : ''}</div>
          {i.email_subject && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={i.email_subject}>{i.email_subject}</div>}
        </div>
      ),
    },
    {
      title: 'Document', key: 'doc', render: (_, i) => (
        <Space direction="vertical" size={2}>
          <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} icon={<FileText size={13} />} onClick={() => openFile(i)}>
            <span style={{ maxWidth: 180, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>{i.file_name}</span>
          </Button>
          {i.document_type && <Tag color={TYPE[i.document_type]?.color} style={{ marginInlineEnd: 0 }}>{TYPE[i.document_type]?.label || i.document_type}</Tag>}
        </Space>
      ),
    },
    {
      title: 'Vendor', key: 'vendor', render: (_, i) => (i.vendor ? (
        <div>
          <Text>{i.vendor.vendor_name}</Text>
          <div style={{ fontSize: 12, color: 'var(--color-success, #16a34a)' }}>Matched {MATCHED_BY[i.vendor_matched_by] || ''}</div>
        </div>
      ) : (
        <div>
          <Text type="warning">{i.party_name ? `Not in Vendor Master: ${i.party_name}` : 'Vendor not found'}</Text>
          {i.party_name && <div><Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate('/vendor-master')}>Add vendor</Button></div>}
        </div>
      )),
    },
    {
      title: 'Bill', key: 'bill', render: (_, i) => (
        <div>
          <div>{i.invoice_number || <Text type="secondary">—</Text>}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{i.invoice_date ? dayjs(i.invoice_date).format('DD MMM YYYY') : ''}</div>
        </div>
      ),
    },
    { title: 'Amount', dataIndex: 'total_amount', key: 'amt', align: 'right', render: inr },
    {
      title: 'PO / department', key: 'po', render: (_, i) => (
        <div>
          {i.purchase_order
            ? <div>{i.purchase_order.po_number}{i.po_matched_by === 'ONLY_OPEN_PO' && <Tooltip title="The bill shows no PO number; this is the vendor's only open PO. Check it."><Tag color="gold" style={{ marginLeft: 6 }}>suggested</Tag></Tooltip>}</div>
            : <Text type="secondary">No PO</Text>}
          {(i.department || i.requested_by) && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{[i.department?.name, i.requested_by && `requested by ${i.requested_by}`].filter(Boolean).join(' · ')}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Notes', key: 'notes', render: (_, i) => {
        const notes = [];
        if (i.status === 'FAILED') notes.push(<Text key="f" type="danger" style={{ fontSize: 12 }}>Could not read: {i.error}</Text>);
        if (i.status === 'DUPLICATE' || i.status === 'SET_ASIDE' || i.status === 'REJECTED' || i.status === 'DONE') notes.push(<Text key="r" type={i.status === 'DUPLICATE' ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{i.status_reason}</Text>);
        if (i.status === 'ACCEPTED') notes.push(<Text key="a" type="success" style={{ fontSize: 12 }}>{i.invoice_id ? `Invoice #${i.invoice_id} created` : (i.status_reason || 'Accepted')}</Text>);
        if (i.possible_duplicate_invoice_id && i.status === 'NEW') notes.push(<Text key="p" type="warning" style={{ fontSize: 12 }}>Possible duplicate of invoice #{i.possible_duplicate_invoice_id}</Text>);
        if (i.document_type === 'CREDIT_NOTE' && i.status === 'NEW') notes.push(<Text key="c" style={{ fontSize: 12 }}>{i.purchase_return ? `For return ${i.purchase_return.return_number}?` : 'No return is waiting for this credit note'}</Text>);
        return notes.length ? <Space direction="vertical" size={0} style={{ maxWidth: 260 }}>{notes}</Space> : null;
      },
    },
    {
      title: 'Auto-check', key: 'auto', render: (_, i) => {
        if (i.document_type !== 'INVOICE') return null;
        if (i.auto_submitted) return <Tag color="success" icon={<Zap size={11} style={{ marginRight: 3 }} />}>Auto-submitted</Tag>;
        if (i.status !== 'NEW' && i.status !== 'FAILED') return null;
        if (i.spot_check) return <Tooltip title="Every check passed. Picked at random for a person to confirm."><Tag color="gold">Spot check</Tag></Tooltip>;
        const reasons = i.auto_check?.reasons || [];
        if (i.auto_check?.clean) return <Tooltip title={data?.auto_enabled ? 'Passed every check, but arrived before auto-submit was on' : 'Passes every check. Would be submitted automatically if auto-submit were on.'}><Tag color="green">{data?.auto_enabled ? 'Clean' : 'Would auto-submit'}</Tag></Tooltip>;
        if (!reasons.length) return null;
        return (
          <Tooltip title={<ul style={{ margin: 0, paddingLeft: 16 }}>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}>
            <div style={{ maxWidth: 230, fontSize: 12, cursor: 'help' }}>
              <Text type="warning" style={{ fontSize: 12 }}>Needs you: </Text>
              <Text style={{ fontSize: 12 }}>{reasons[0]}</Text>
              {reasons.length > 1 && <Text type="secondary" style={{ fontSize: 12 }}> +{reasons.length - 1} more</Text>}
            </div>
          </Tooltip>
        );
      },
    },
    { title: '', key: 'act', fixed: 'right', render: (_, i) => actionsFor(i) },
  ];

  const counts = data?.counts || {};

  return (
    <div>
      {/* Mailboxes being checked */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
        {data && !sources.length && (
          <Alert
            type="info"
            showIcon
            icon={<Mail size={18} />}
            message="Capture bills from email automatically"
            description="Vendors keep emailing bills as they do now. LedgerLine checks your Outlook inbox every 15 minutes, reads each bill with AI, sorts out credit notes and statements, matches the vendor and PO, and lists them here for you to review. Nothing is posted until you accept it."
            action={<Button type="primary" icon={<Mail size={14} />} loading={busy === 'watch'} onClick={() => { setMode('LIKELY_BILLS'); setSettingsOpen(true); }}>Watch my Outlook</Button>}
          />
        )}
        {sources.length > 0 && (
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space direction="vertical" size={2}>
              {sources.map((s) => (
                <Space key={s.id} size={8} wrap>
                  <Mail size={14} color="var(--color-text-secondary)" />
                  <Text strong>{s.mailbox_email}</Text>
                  {!s.enabled ? <Tag>Paused</Tag> : s.checking ? <Tag color="processing">Checking…</Tag> : <Tag color="success">Every 15 min</Tag>}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {s.owner_name && !s.mine ? `${s.owner_name}'s mailbox · ` : ''}
                    {s.mode === 'ALL_ATTACHMENTS' ? 'every email with a file' : 'emails that look like bills'}
                    {s.last_checked_at ? ` · last checked ${when(s.last_checked_at)}` : ''}
                  </Text>
                  {s.last_error && <Text type="danger" style={{ fontSize: 12 }}>{s.last_error}</Text>}
                </Space>
              ))}
            </Space>
            <Space wrap>
              {!mine && <Button icon={<Mail size={14} />} onClick={() => { setMode('LIKELY_BILLS'); setSettingsOpen(true); }}>Watch my Outlook too</Button>}
              {mine && <Button icon={<Settings2 size={14} />} onClick={() => { setMode(mine.mode); setSettingsOpen(true); }}>Settings</Button>}
              <Button icon={<RefreshCcw size={14} />} loading={busy === 'check' || data?.checking} onClick={checkNow}>Check now</Button>
            </Space>
          </Space>
        )}
      </div>

      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <Segmented
          value={view}
          onChange={(v) => { setView(v); setDept(null); }}
          options={VIEWS.map((v) => ({ value: v.key, label: counts[v.key] ? `${v.label} (${counts[v.key]})` : v.label }))}
        />
        <Space>
          {departments.length > 0 && (
            <Select allowClear placeholder="All departments" style={{ minWidth: 180 }} value={dept} onChange={setDept} options={departments} />
          )}
          <Button icon={<Zap size={14} />} onClick={() => setAutoOpen(true)} type={data?.auto_enabled ? 'primary' : 'default'} ghost={Boolean(data?.auto_enabled)}>
            Auto-submit: {data?.auto_enabled ? 'On' : 'Off'}
          </Button>
          <Button icon={<RefreshCcw size={14} />} loading={loading} onClick={() => load()}>Refresh</Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={visible}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{
          emptyText: (
            <Empty
              image={<Inbox size={40} color="var(--color-text-muted)" />}
              imageStyle={{ height: 48 }}
              description={view === 'review' ? (sources.length ? 'No bills waiting. New bills appear here as they arrive by email.' : 'Connect your Outlook above to start capturing bills.') : 'Nothing here'}
              style={{ margin: '32px 0' }}
            />
          ),
        }}
      />

      {/* Watch / settings */}
      <Modal
        open={settingsOpen}
        title={mine ? 'Bill inbox settings' : 'Watch my Outlook for bills'}
        onCancel={() => setSettingsOpen(false)}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              {mine && <Button danger onClick={() => removeSource(mine)}>Stop watching</Button>}
              {mine && (mine.enabled
                ? <Button icon={<Pause size={14} />} onClick={() => updateSource(mine, { enabled: false })}>Pause</Button>
                : <Button icon={<Play size={14} />} onClick={() => updateSource(mine, { enabled: true })}>Resume</Button>)}
            </Space>
            <Space>
              <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button type="primary" icon={<Sparkles size={14} />} loading={busy === 'watch'} onClick={() => (mine ? updateSource(mine, { mode }) : watch(mode))}>
                {mine ? 'Save' : 'Start watching'}
              </Button>
            </Space>
          </Space>
        )}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            LedgerLine checks the Inbox of your own Outlook mailbox every 15 minutes{mine ? '' : ', starting with the last 7 days'}. It only opens the emails chosen below,
            reads PDF and image attachments with AI, and keeps each file here for review. It never sends, moves or deletes your mail.
          </Text>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: '100%' }}>
            <Space direction="vertical" size={10}>
              {MODES.map((m) => (
                <Radio key={m.value} value={m.value}>
                  <div><Text strong>{m.label}</Text></div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{m.hint}</div>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
          {!mine && <Text type="secondary" style={{ fontSize: 12 }}>If your Outlook is not connected yet, or LedgerLine may not read it, you will be asked to sign in with Microsoft once.</Text>}
        </Space>
      </Modal>

      <AutoSubmitSettings open={autoOpen} onClose={() => setAutoOpen(false)} onSaved={() => setTimeout(() => load(true), 1500)} />

      <ConnectEmailModal open={connectOpen} onClose={() => setConnectOpen(false)} onConnected={() => watch(sessionGet(WATCH_AFTER_CONNECT) || mode)} withRead />

      <Modal open={Boolean(rejectItem)} title="Reject this document" okText="Reject" okButtonProps={{ danger: true, loading: busy === `item-${rejectItem?.id}` }} onOk={submitReject} onCancel={() => setRejectItem(null)} destroyOnClose>
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Give a reason' }]}>
            <Input.TextArea rows={3} placeholder="e.g. Not our bill, wrong company, already paid in cash" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={Boolean(creditItem)} title="Record vendor credit note" okText="Record" okButtonProps={{ loading: busy === 'credit', disabled: returns.length === 0 }} onOk={submitCredit} onCancel={() => setCreditItem(null)} destroyOnClose>
        {returns.length === 0 ? (
          <Alert type="warning" showIcon message="No purchase return is waiting for a credit note from this vendor" description="Record the return first under Purchase Returns, or use “Mark done” if this credit note was handled another way." />
        ) : (
          <Form form={creditForm} layout="vertical">
            <Form.Item name="purchase_return_id" label="Purchase return" rules={[{ required: true, message: 'Choose the return' }]}>
              <Select options={returns.map((r) => ({ value: r.id, label: `${r.return_number}${r.vendor_name ? ` · ${r.vendor_name}` : ''} · ${inr(r.total_amount)}` }))} />
            </Form.Item>
            <Form.Item name="credit_note_number" label="Credit note number" rules={[{ required: true, message: 'Required' }]}><Input /></Form.Item>
            <Form.Item name="credit_note_date" label="Credit note date"><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
