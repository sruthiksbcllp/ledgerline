import React, { useEffect, useState } from 'react';
import { Button, Card, Table, Tag, Space, message, Modal, Input, InputNumber, Descriptions, Select } from 'antd';
import { Send, RefreshCcw, RotateCw, Inbox } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';
import VendorEmailReview, { VendorEmailStatusTag } from '../components/procurement/VendorEmailReview';
import ConnectEmailModal from '../components/settings/ConnectEmailModal';
import RfqRepliesDrawer from '../components/procurement/RfqRepliesDrawer';
import RfqEmailReviewModal from '../components/procurement/RfqEmailReviewModal';

const INVITE_COLOR = { PENDING: 'default', SENT: 'blue', RESPONDED: 'green', DECLINED: 'red' };

export default function RfqDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rfq, setRfq] = useState(null);
  const [loading, setLoading] = useState(false);
  const [respVendor, setRespVendor] = useState(null);
  const [respItems, setRespItems] = useState([]);
  const [masterVendors, setMasterVendors] = useState([]);
  const [addVendorId, setAddVendorId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [emails, setEmails] = useState([]);
  const [emailDraftId, setEmailDraftId] = useState(null);
  const [preparing, setPreparing] = useState(null);
  const [sending, setSending] = useState(false);
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [replies, setReplies] = useState([]);
  const [repliesState, setRepliesState] = useState({ loading: false, error: null, mailbox: null, allowed: true });
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [review, setReview] = useState(null); // { resend, vendorIds } while the email is being reviewed

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/rfqs/${id}`);
      setRfq(res?.data?.data || res?.data || null);
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to load RFQ'); }
    finally { setLoading(false); }
  };
  const loadVendors = async () => {
    try {
      const res = await api.get('/masters/vendors');
      setMasterVendors(normalizeResponse(res?.data));
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to load vendors'); }
  };
  const loadEmails = async () => {
    try {
      const res = await api.get('/vendor-emails', { params: { rfq_id: id } });
      setEmails(res?.data?.data || []);
    } catch { setEmails([]); }
  };
  // Vendor replies from the admin's Outlook; non-admins simply don't get this feature.
  const loadReplies = async () => {
    setRepliesState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await api.get(`/rfqs/${id}/replies`, { timeout: 60000 });
      setReplies(res?.data?.data?.replies || []);
      setRepliesState({ loading: false, error: null, mailbox: res?.data?.data?.mailbox || null, allowed: true });
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data || {};
      setReplies([]);
      setRepliesState({ loading: false, error: status === 403 && !data.code ? null : { code: data.code, message: data.message || 'Could not load replies' }, mailbox: null, allowed: !(status === 403 && !data.code) });
    }
  };
  useEffect(() => { load(); loadVendors(); loadEmails(); loadReplies(); }, [id]);
  const repliesFor = (vendorId) => replies.filter((r) => Number(r.vendor_id) === Number(vendorId));

  // Prepares (or reopens) the award / PO email for an accepted quotation.
  const openVendorEmail = async (quotationId) => {
    setPreparing(quotationId);
    try {
      const res = await api.post('/vendor-emails/prepare', { quotation_id: quotationId });
      if (res?.data?.data?.id) setEmailDraftId(res.data.data.id);
      loadEmails();
    } catch (e) { message.error(e?.response?.data?.message || 'Could not prepare the vendor email'); }
    setPreparing(null);
  };

  const addVendor = async () => {
    if (!addVendorId) return message.error('Select a vendor');
    setAdding(true);
    try {
      const res = await api.post(`/rfqs/${id}/vendors`, { vendor_ids: [addVendorId] });
      message.success(res?.data?.message || 'Vendor added');
      setAddVendorId(null);
      await load();
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to add vendor'); }
    finally { setAdding(false); }
  };

  // Emails the RFQ to every pending vendor from the logged-in admin's own mailbox.
  // resend: send the same RFQ again to vendors already sent it (vendorIds limits it to those vendors).
  // Called from the review screen with the subject/message the admin approved. Returns false on failure.
  const send = async ({ resend = false, vendorIds = null, subject, message: text } = {}) => {
    setSending(true);
    let ok = true;
    try {
      const r = await api.post(`/rfqs/${id}/send`, {
        ...(resend ? { resend: true, ...(vendorIds ? { vendor_ids: vendorIds } : {}) } : {}),
        ...(subject ? { subject } : {}),
        ...(text ? { message: text } : {}),
      }, { timeout: 180000 });
      const data = r?.data?.data || {};
      const problems = [...(data.failed || []), ...(data.skipped || [])];
      if (problems.length) {
        Modal.warning({
          title: r?.data?.message || 'RFQ partly sent',
          content: <ul style={{ paddingLeft: 18, margin: 0 }}>{problems.map((p) => <li key={p.vendor_id}><b>{p.vendor}</b>: {p.reason}</li>)}</ul>,
        });
      } else {
        message.success(r?.data?.message || 'RFQ sent');
      }
    } catch (e) {
      ok = false;
      const data = e?.response?.data;
      if (data?.code === 'NO_MAILBOX') {
        message.info('Connect your email account first; the RFQ will be sent from it.');
        setMailboxOpen(true);
      } else if (data?.data?.failed?.length || data?.data?.skipped?.length) {
        Modal.error({
          title: data.message,
          content: <ul style={{ paddingLeft: 18, margin: 0 }}>{[...(data.data.failed || []), ...(data.data.skipped || [])].map((p) => <li key={p.vendor_id}><b>{p.vendor}</b>: {p.reason}</li>)}</ul>,
        });
      } else {
        message.error(data?.message || 'Send failed');
      }
    } finally {
      setSending(false);
      load();
    }
    return ok;
  };
  const pendingVendors = (rfq?.vendors || []).filter((v) => v.invite_status === 'PENDING');
  const resendable = (rfq?.vendors || []).filter((v) => v.invite_status === 'SENT' && v.vendor?.email);

  const openResponse = (rv) => {
    setRespVendor(rv);
    setRespItems((rfq.items || []).map((it) => ({ item_name: it.item_name, quantity: it.quantity, unit_price: 0 })));
  };
  const submitResponse = async () => {
    try {
      await api.post(`/rfqs/${id}/vendors/${respVendor.vendor_id}/response`, { items: respItems });
      message.success('Response recorded as quotation');
      setRespVendor(null); load();
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to record response'); }
  };

  // CR-P02: dense L1/L2/L3 ranking by response net_amount (lowest = L1)
  const _responded = (rfq?.vendors || []).filter(v => v.response && v.response.net_amount != null);
  const _sorted = [..._responded].sort((a, b) => Number(a.response.net_amount) - Number(b.response.net_amount));
  const rankMap = {}; let _rk = 0, _prev = null;
  _sorted.forEach(v => { const n = Number(v.response.net_amount); if (_prev === null || n !== _prev) { _rk += 1; _prev = n; } rankMap[v.id] = _rk; });

  const muted = { fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' };
  const vendorCols = [
    { title: 'Vendor', key: 'vendor', render: (_, r) => (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{r.vendor?.vendor_name || r.vendor_id}</div>
        {r.vendor?.email
          ? <div style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{r.vendor.email}</div>
          : <Tag color="error" style={{ marginTop: 4 }}>No email</Tag>}
      </div>
    ) },
    { title: 'Invite', key: 'invite', render: (_, r) => (
      <div>
        <Tag color={INVITE_COLOR[r.invite_status] || 'default'} style={{ marginInlineEnd: 0 }}>{r.invite_status}</Tag>
        {r.email_sent_at && <div style={{ ...muted, marginTop: 4 }}>{new Date(r.email_sent_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
      </div>
    ) },
    { title: 'Quotation', key: 'quotation', render: (_, r) => (r.response ? (
      <div>
        <div style={{ whiteSpace: 'nowrap' }}>{r.response.quotation_number}</div>
        <div style={muted}>₹{Number(r.response.net_amount || 0).toLocaleString('en-IN')}</div>
      </div>
    ) : <span style={muted}>—</span>) },
    { title: 'Rank', key: 'rank', align: 'center', render: (_, r) => (rankMap[r.id] ? <Tag color={rankMap[r.id] === 1 ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>{'L' + rankMap[r.id]}</Tag> : <span style={muted}>—</span>) },
    ...(repliesState.allowed ? [{ title: 'Replies', key: 'replies', align: 'center', render: (_, r) => {
        const list = repliesFor(r.vendor_id);
        if (!list.length) return <span style={muted}>—</span>;
        const unread = list.filter((x) => !x.is_read).length;
        return (
          <Button size="small" type={unread ? 'primary' : 'default'} icon={<Inbox size={13} />} onClick={() => setRepliesOpen(true)}>
            {list.length}{unread ? ` · ${unread} new` : ''}
          </Button>
        );
      } }] : []),
    { title: 'Award email', key: 'award_email', render: (_, r) => {
        const q = r.response;
        if (!q || !['APPROVED', 'PO_CREATED'].includes(q.status)) return <span style={muted}>—</span>;
        const latest = emails.find((e) => Number(e.quotation_id) === Number(q.id) && e.status !== 'CANCELLED');
        return (
          <Space direction="vertical" size={4}>
            {latest && <VendorEmailStatusTag status={latest.status} />}
            <Button size="small" loading={preparing === q.id} onClick={() => (latest && latest.status !== 'SENT' ? setEmailDraftId(latest.id) : openVendorEmail(q.id))}>
              {latest ? (latest.status === 'SENT' ? 'View / PO email' : 'Review email') : 'Prepare email'}
            </Button>
          </Space>
        );
      } },
    { title: 'Action', key: 'action', align: 'right', render: (_, r) => (r.invite_status !== 'RESPONDED' ? (
        <Space size={6} wrap style={{ justifyContent: 'flex-end' }}>
          {r.invite_status === 'SENT' && r.vendor?.email && (
            <Button size="small" icon={<RotateCw size={13} />} disabled={sending} onClick={() => setReview({ resend: true, vendorIds: [r.vendor_id] })}>Resend</Button>
          )}
          <Button size="small" onClick={() => openResponse(r)}>Record response</Button>
        </Space>
      ) : <span style={muted}>Responded</span>) }
  ];
  const respCols = [
    { title: 'Item', dataIndex: 'item_name' },
    { title: 'Qty', dataIndex: 'quantity', width: 90 },
    { title: 'Unit Price', dataIndex: 'unit_price', width: 140, render: (_, r, i) => <InputNumber min={0} value={r.unit_price} onChange={(v) => { const n = [...respItems]; n[i].unit_price = v; setRespItems(n); }} /> }
  ];

  return (
    <div style={{ padding: 'var(--space-4, 16px)' }}>
      <PageHeader title={rfq ? `RFQ ${rfq.rfq_number}` : 'RFQ'} subtitle={rfq?.title} />
      <Card loading={loading} style={{ borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-medium)', marginBottom: 16 }}>
        {rfq && (
          <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="Status"><Tag>{rfq.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Due">{rfq.due_date ? new Date(rfq.due_date).toDateString() : '—'}</Descriptions.Item>
          </Descriptions>
        )}
        <Space style={{ marginBottom: 12 }} wrap>
          {pendingVendors.length > 0 || !resendable.length ? (
            <Button type="primary" icon={<Send size={14} />} loading={sending} disabled={!pendingVendors.length} onClick={() => setReview({ resend: false })} style={{ background: 'var(--gradient-orange)', border: 'none' }}>
              {pendingVendors.length ? 'Send RFQ' : 'RFQ sent'}
            </Button>
          ) : (
            <Button type="primary" icon={<RotateCw size={14} />} loading={sending} onClick={() => setReview({ resend: true })} style={{ background: 'var(--gradient-orange)', border: 'none' }}>Resend RFQ</Button>
          )}
          {repliesState.allowed && (
            <Button icon={<Inbox size={14} />} loading={repliesState.loading} onClick={() => setRepliesOpen(true)}>
              Vendor replies{replies.length ? ` (${replies.length})` : ''}
            </Button>
          )}
          <Button icon={<RefreshCcw size={14} />} onClick={() => { load(); loadVendors(); loadReplies(); }}>Refresh</Button>
          <Button onClick={() => navigate('/procurement/rfq')}>Back</Button>
          {rfq && rfq.status !== 'CLOSED' && rfq.status !== 'CANCELLED' && (
            <>
              <Select
                style={{ minWidth: 240 }}
                placeholder="Add vendor from Vendor Master"
                showSearch
                optionFilterProp="label"
                value={addVendorId}
                onChange={setAddVendorId}
                onOpenChange={(open) => { if (open) loadVendors(); }}
                options={masterVendors
                  .filter((vendor) => !(rfq.vendors || []).some((row) => Number(row.vendor_id) === Number(vendor.id)))
                  .map((vendor) => ({ value: vendor.id, label: vendor.vendor_name }))}
              />
              <Button onClick={addVendor} loading={adding}>Add vendor</Button>
            </>
          )}
        </Space>
        <Table rowKey="id" title={() => 'Vendors & Responses'} columns={vendorCols} dataSource={rfq?.vendors || []} pagination={false} size="small" />
      </Card>

      <RfqEmailReviewModal
        open={!!review}
        rfqId={id}
        resend={review?.resend}
        vendorIds={review?.vendorIds || null}
        onClose={() => setReview(null)}
        onSend={({ subject, message: text }) => send({ ...review, subject, message: text })}
      />
      <RfqRepliesDrawer
        rfqId={id}
        open={repliesOpen}
        onClose={() => setRepliesOpen(false)}
        replies={replies}
        state={repliesState}
        onReload={loadReplies}
        canFillFor={(vendorId) => (rfq?.vendors || []).some((v) => Number(v.vendor_id) === Number(vendorId) && v.invite_status === 'SENT')}
        onQuotationRecorded={() => { load(); loadReplies(); }}
      />
      <ConnectEmailModal open={mailboxOpen} onClose={() => setMailboxOpen(false)} onConnected={() => message.success('Mailbox connected. Click Send RFQ again.')} />
      <VendorEmailReview draftId={emailDraftId} open={!!emailDraftId} onClose={() => { setEmailDraftId(null); loadEmails(); }} onChanged={loadEmails} />

      <Modal open={!!respVendor} title={`Record response — ${respVendor?.vendor?.vendor_name || ''}`} onCancel={() => setRespVendor(null)} onOk={submitResponse} okText="Save as Quotation">
        <Table rowKey={(_, i) => i} columns={respCols} dataSource={respItems} pagination={false} size="small" />
      </Modal>
    </div>
  );
}
