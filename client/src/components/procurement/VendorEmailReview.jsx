import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Descriptions, Divider, Form, Input, Modal, Popconfirm, Space, Spin, Tag, Timeline, Typography, message,
} from 'antd';
import { Paperclip, PencilLine, Send, Settings2, XCircle } from 'lucide-react';
import { useSelector } from 'react-redux';
import api from '../../utils/api';
import ConnectEmailModal from '../settings/ConnectEmailModal';

const { Text } = Typography;

const STATUS = {
  DRAFT: { color: 'processing', label: 'Draft — awaiting approval' },
  SENDING: { color: 'gold', label: 'Sending…' },
  SENT: { color: 'success', label: 'Sent' },
  FAILED: { color: 'error', label: 'Failed' },
  CANCELLED: { color: 'default', label: 'Cancelled' },
};
const TYPE = { RFQ_AWARD: 'Quotation accepted', PO_CONFIRMATION: 'Purchase order' };
const ADMIN_ROLES = ['PROVIDER_ADMIN', 'DEV_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'];
const ACTION = {
  VENDOR_EMAIL_DRAFTED: 'Draft prepared',
  VENDOR_EMAIL_EDITED: 'Edited',
  VENDOR_EMAIL_SENT: 'Approved & sent',
  VENDOR_EMAIL_FAILED: 'Sending failed',
  VENDOR_EMAIL_CANCELLED: 'Cancelled',
};
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export const VendorEmailStatusTag = ({ status }) => {
  const s = STATUS[status] || { color: 'default', label: status };
  return <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.label}</Tag>;
};

/**
 * Review an RFQ award / PO email before it goes to the vendor.
 * Approve & Send, Edit Email and Cancel; nothing is sent without Approve & Send.
 */
const VendorEmailReview = ({ draftId, open, onClose, onChanged }) => {
  const user = useSelector((state) => state.auth?.user);
  const isAdmin = ADMIN_ROLES.includes(String(user?.role || '').toUpperCase());
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null); // 'save' | 'send' | 'cancel'
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!draftId) return;
    setLoading(true);
    try {
      const res = await api.get(`/vendor-emails/${draftId}`);
      setDraft(res?.data?.data);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not load the email');
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    if (open) { setEditing(false); load(); }
  }, [open, load]);

  const run = async (kind, request, { close = false } = {}) => {
    setBusy(kind);
    try {
      const res = await request();
      message.success(res?.data?.message || 'Done');
      setDraft(res?.data?.data || draft);
      setEditing(false);
      onChanged?.(res?.data?.data);
      if (close) onClose();
    } catch (e) {
      const data = e?.response?.data;
      message.error(data?.message || 'Action failed');
      if (data?.code === 'NO_MAILBOX') setMailboxOpen(true);
      load(); // show refreshed details / status after a refusal
    } finally {
      setBusy(null);
    }
  };

  const startEdit = () => { form.setFieldsValue({ subject: draft.subject, message: draft.message }); setEditing(true); };
  const saveEdit = async () => {
    const values = await form.validateFields();
    run('save', () => api.put(`/vendor-emails/${draft.id}`, values));
  };
  const send = () => run('send', () => api.post(`/vendor-emails/${draft.id}/send`), { close: false });
  const cancelDraft = () => run('cancel', () => api.post(`/vendor-emails/${draft.id}/cancel`, { reason: 'Cancelled during review' }), { close: true });

  const previewPo = async () => {
    try {
      const res = await api.get(`/procurement/po/${draft.po_id}/print`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      message.error('Could not open the PO PDF');
    }
  };

  const actionable = draft && ['DRAFT', 'FAILED'].includes(draft.status);
  const mailbox = draft?.my_mailbox;
  const vendorEmail = draft?.to_email;
  const canSend = actionable && isAdmin && mailbox && vendorEmail && !editing;

  const footer = draft && actionable && isAdmin ? (
    <Space wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
      <Popconfirm title="Cancel this email?" description="It will not be sent. You can prepare a new one later." okText="Cancel email" okButtonProps={{ danger: true }} cancelText="Keep" onConfirm={cancelDraft}>
        <Button danger icon={<XCircle size={15} />} loading={busy === 'cancel'} disabled={!!busy}>Cancel</Button>
      </Popconfirm>
      {editing ? (
        <>
          <Button onClick={() => setEditing(false)} disabled={!!busy}>Discard changes</Button>
          <Button type="primary" onClick={saveEdit} loading={busy === 'save'}>Save draft</Button>
        </>
      ) : (
        <>
          <Button icon={<PencilLine size={15} />} onClick={startEdit} disabled={!!busy}>Edit Email</Button>
          <Popconfirm
            title="Send this email now?"
            description={`From ${mailbox?.from_email || '—'} to ${vendorEmail || '—'}`}
            okText="Send"
            onConfirm={send}
            disabled={!canSend}
          >
            <Button type="primary" icon={<Send size={15} />} loading={busy === 'send'} disabled={!canSend || !!busy}>Approve & Send</Button>
          </Popconfirm>
        </>
      )}
    </Space>
  ) : <Button onClick={onClose}>Close</Button>;

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        width={Math.min(860, window.innerWidth - 24)}
        title={draft ? <Space>Vendor email · {TYPE[draft.email_type]}<VendorEmailStatusTag status={draft.status} /></Space> : 'Vendor email'}
        footer={footer}
        destroyOnClose
      >
        {loading && !draft ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : draft && (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {draft.status === 'SENT' && (
              <Alert type="success" showIcon message={`Sent on ${when(draft.sent_at)} from ${draft.sent_from} to ${draft.to_email}`} description={draft.message_id ? `Message ID: ${draft.message_id}` : null} />
            )}
            {draft.status === 'FAILED' && <Alert type="error" showIcon message="Sending failed" description={`${draft.failure_reason || 'Unknown error'} — fix the problem and click Approve & Send to retry.`} />}
            {draft.status === 'CANCELLED' && <Alert type="info" showIcon message="This email was cancelled and not sent" description={draft.failure_reason || null} />}
            {actionable && !isAdmin && <Alert type="info" showIcon message="An admin must review and approve this email before it is sent." />}
            {actionable && isAdmin && !mailbox && (
              <Alert
                type="warning"
                showIcon
                message="Connect your email account to send"
                description="Vendor emails go out from your own mailbox."
                action={<Button size="small" onClick={() => setMailboxOpen(true)}>Connect mailbox</Button>}
              />
            )}
            {actionable && !vendorEmail && (
              <Alert type="error" showIcon message={`${draft.vendor?.vendor_name || 'This vendor'} has no registered email`} description="Add the vendor's email in Vendor Master; emails are only sent to the registered address." />
            )}
            {draft.email_type === 'RFQ_AWARD' && actionable && (
              <Alert
                type="info"
                showIcon
                message="No approved purchase order yet"
                description="This email confirms the accepted quotation only and contains no PO details. Once the PO is approved, prepare the PO email from the RFQ page."
              />
            )}

            <Descriptions size="small" column={1} bordered labelStyle={{ width: 110 }}>
              <Descriptions.Item label="From">
                {draft.status === 'SENT' ? draft.sent_from : (mailbox ? `${mailbox.from_name ? `${mailbox.from_name} ` : ''}<${mailbox.from_email}>` : <Text type="secondary">Not connected</Text>)}
                {actionable && isAdmin && mailbox && <Button type="link" size="small" icon={<Settings2 size={13} />} onClick={() => setMailboxOpen(true)}>Change</Button>}
              </Descriptions.Item>
              <Descriptions.Item label="To">{vendorEmail || <Text type="danger">No registered email</Text>} <Text type="secondary">({draft.vendor?.vendor_name}, registered email)</Text></Descriptions.Item>
              <Descriptions.Item label="Cc">
                {draft.status === 'SENT' ? draft.sent_from : (mailbox?.from_email || <Text type="secondary">You (once your mailbox is connected)</Text>)}
                <Text type="secondary"> (you receive the same email)</Text>
              </Descriptions.Item>
              {!editing && <Descriptions.Item label="Subject">{draft.subject}</Descriptions.Item>}
              {draft.attach_po_pdf && (
                <Descriptions.Item label="Attachment">
                  <Button type="link" size="small" icon={<Paperclip size={13} />} onClick={previewPo} style={{ paddingInline: 0 }}>
                    {draft.details?.po_number || 'Purchase order'}.pdf (approved PO)
                  </Button>
                </Descriptions.Item>
              )}
            </Descriptions>

            {editing ? (
              <Form form={form} layout="vertical">
                <Form.Item name="subject" label="Subject" rules={[{ required: true, message: 'Required' }, { max: 255 }]}><Input /></Form.Item>
                <Form.Item name="message" label="Message" rules={[{ required: true, message: 'Required' }]} extra="The order details table below is generated from the records and cannot be edited.">
                  <Input.TextArea autoSize={{ minRows: 8, maxRows: 18 }} />
                </Form.Item>
              </Form>
            ) : (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                <iframe title="Email preview" sandbox="" srcDoc={draft.html} style={{ width: '100%', height: 460, border: 0 }} />
              </div>
            )}

            {draft.history?.length > 0 && (
              <>
                <Divider style={{ margin: '4px 0' }} orientation="left" plain>Approval & sending history</Divider>
                <Timeline
                  items={draft.history.map((h) => ({
                    key: h.id,
                    color: h.action === 'VENDOR_EMAIL_SENT' ? 'green' : h.action === 'VENDOR_EMAIL_FAILED' ? 'red' : 'blue',
                    children: (
                      <div>
                        <Text strong>{ACTION[h.action] || h.action}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}> · {h.user} · {when(h.at)}</Text>
                        {h.note && <div style={{ fontSize: 13 }}>{h.note}</div>}
                      </div>
                    ),
                  }))}
                />
              </>
            )}
          </Space>
        )}
      </Modal>
      <ConnectEmailModal open={mailboxOpen} onClose={() => setMailboxOpen(false)} onConnected={load} />
    </>
  );
};

export default VendorEmailReview;
