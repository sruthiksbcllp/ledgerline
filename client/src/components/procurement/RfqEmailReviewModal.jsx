import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Form, Input, Modal, Select, Space, Spin, Tag, Typography, message } from 'antd';
import { PencilLine, RotateCcw, Send } from 'lucide-react';
import api from '../../utils/api';
import ConnectEmailModal from '../settings/ConnectEmailModal';

const { Text } = Typography;

/**
 * Review the RFQ email before it goes to vendors: see exactly what each vendor receives,
 * edit the subject and message, then Send. Nothing is sent until Send is clicked.
 * `onSend({ subject, message })` performs the send (parent shows the results).
 */
const RfqEmailReviewModal = ({ open, rfqId, resend = false, vendorIds = null, onClose, onSend }) => {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState({ subject: undefined, message: undefined });
  const [previewVendor, setPreviewVendor] = useState(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [form] = Form.useForm();

  const loadPreview = useCallback(async (content = {}, vendorId = null) => {
    setLoading(true);
    try {
      const res = await api.post(`/rfqs/${rfqId}/email-preview`, {
        resend, ...(vendorIds ? { vendor_ids: vendorIds } : {}),
        ...(content.subject !== undefined ? { subject: content.subject } : {}),
        ...(content.message !== undefined ? { message: content.message } : {}),
        ...(vendorId ? { preview_vendor_id: vendorId } : {}),
      });
      const data = res?.data?.data;
      setPreview(data);
      setPreviewVendor(data.preview_vendor_id);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not prepare the email preview');
    } finally {
      setLoading(false);
    }
  }, [rfqId, resend, vendorIds]);

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setDraft({ subject: undefined, message: undefined });
    setPreview(null);
    loadPreview();
  }, [open, loadPreview]);

  const startEdit = () => { form.setFieldsValue({ subject: preview.subject, message: preview.message }); setEditing(true); };
  const finishEdit = async () => {
    const values = await form.validateFields();
    setDraft(values);
    setEditing(false);
    loadPreview(values, previewVendor); // show the edited version exactly as vendors will see it
  };
  const resetToDefault = () => form.setFieldsValue({ subject: preview.default_subject, message: preview.default_message });

  const send = async () => {
    setSending(true);
    try {
      const ok = await onSend({ subject: draft.subject, message: draft.message });
      if (ok !== false) onClose();
    } finally {
      setSending(false);
    }
  };

  const count = preview?.recipients?.length || 0;
  const canSend = preview && count > 0 && preview.from && !editing;

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        width={Math.min(900, window.innerWidth - 24)}
        title={resend ? 'Review the RFQ email before resending' : 'Review the RFQ email before sending'}
        destroyOnClose
        footer={(
          <Space wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={onClose} disabled={sending}>Cancel</Button>
            {editing ? (
              <>
                <Button icon={<RotateCcw size={14} />} onClick={resetToDefault}>Reset to default</Button>
                <Button type="primary" onClick={finishEdit}>Done editing</Button>
              </>
            ) : (
              <>
                <Button icon={<PencilLine size={14} />} onClick={startEdit} disabled={!preview || sending}>Edit Email</Button>
                <Button type="primary" icon={<Send size={14} />} loading={sending} disabled={!canSend} onClick={send}>
                  {resend ? 'Resend' : 'Send'}{count ? ` to ${count} vendor${count === 1 ? '' : 's'}` : ''}
                </Button>
              </>
            )}
          </Space>
        )}
      >
        {!preview && <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>}
        {preview && (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            {!preview.from && (
              <Alert
                type="warning"
                showIcon
                message="Connect your Outlook to send"
                description="The RFQ is sent from your own mailbox."
                action={<Button size="small" type="primary" onClick={() => setConnectOpen(true)}>Connect Outlook</Button>}
              />
            )}
            {count === 0 && <Alert type="error" showIcon message="No vendor to send to" description="None of the selected vendors has a registered email. Add emails in Vendor Master." />}
            {preview.skipped.length > 0 && (
              <Alert type="warning" showIcon message={`${preview.skipped.length} vendor${preview.skipped.length === 1 ? '' : 's'} will be skipped`} description={preview.skipped.map((s) => `${s.vendor}: ${s.reason}`).join(' · ')} />
            )}

            <Descriptions size="small" column={1} bordered labelStyle={{ width: 100 }}>
              <Descriptions.Item label="From">{preview.from || <Text type="secondary">Not connected</Text>}</Descriptions.Item>
              <Descriptions.Item label="To">
                <Space size={[6, 6]} wrap>
                  {preview.recipients.map((r) => <Tag key={r.vendor_id}>{r.vendor} &lt;{r.email}&gt;</Tag>)}
                </Space>
                {count > 1 && <div><Text type="secondary" style={{ fontSize: 12 }}>Each vendor gets their own email; they don't see each other.</Text></div>}
              </Descriptions.Item>
              <Descriptions.Item label="Cc">{preview.cc || '—'} <Text type="secondary">(you receive the same email)</Text></Descriptions.Item>
              {!editing && <Descriptions.Item label="Subject">{preview.subject}</Descriptions.Item>}
            </Descriptions>

            {editing ? (
              <Form form={form} layout="vertical">
                <Form.Item name="subject" label="Subject" rules={[{ required: true, message: 'Required' }, { max: 255 }]} extra={`Keep ${preview.rfq_number} in the subject so vendor replies are matched to this RFQ (it is added automatically if removed).`}>
                  <Input />
                </Form.Item>
                <Form.Item name="message" label="Message" rules={[{ required: true, message: 'Required' }]} extra='The greeting ("Dear …") and the items table are added automatically; the table appears after your first paragraph.'>
                  <Input.TextArea autoSize={{ minRows: 10, maxRows: 22 }} />
                </Form.Item>
              </Form>
            ) : (
              <>
                {count > 1 && (
                  <Space>
                    <Text type="secondary">Preview as</Text>
                    <Select
                      size="small"
                      style={{ minWidth: 240 }}
                      value={previewVendor}
                      onChange={(v) => loadPreview(draft, v)}
                      options={preview.recipients.map((r) => ({ value: r.vendor_id, label: r.vendor }))}
                    />
                  </Space>
                )}
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: '#fff', opacity: loading ? 0.5 : 1 }}>
                  {preview.html
                    ? <iframe title="RFQ email preview" sandbox="" srcDoc={preview.html} style={{ width: '100%', height: 480, border: 0 }} />
                    : <div style={{ padding: 24 }}><Text type="secondary">Nothing to preview.</Text></div>}
                </div>
              </>
            )}
          </Space>
        )}
      </Modal>
      <ConnectEmailModal open={connectOpen} onClose={() => setConnectOpen(false)} onConnected={() => loadPreview(draft, previewVendor)} />
    </>
  );
};

export default RfqEmailReviewModal;
