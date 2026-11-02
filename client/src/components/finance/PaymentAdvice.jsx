import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Popconfirm, Space, Spin, Tooltip, Typography, message } from 'antd';
import { Mail, Send } from 'lucide-react';
import api from '../../utils/api';
import ConnectEmailModal from '../settings/ConnectEmailModal';

/**
 * Payment advice to the vendor: review the email (what was paid, UTR, TDS and other deductions)
 * and send it from your own mailbox. Nothing is sent until Send is clicked.
 */
const { Text } = Typography;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export const PaymentAdviceModal = ({ invoiceId, open, onClose, onSent }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/procurement/ap-invoices/${invoiceId}/payment-advice`);
      const d = res?.data?.data;
      setData(d);
      form.setFieldsValue({ subject: d?.subject, message: d?.message });
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not prepare the payment advice');
      onClose();
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (open && invoiceId) { setData(null); load(); } }, [open, invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const values = await form.validateFields();
    setSending(true);
    try {
      const res = await api.post(`/procurement/ap-invoices/${invoiceId}/payment-advice`, values);
      message.success(res?.data?.message || 'Payment advice sent');
      onSent?.(res?.data?.data);
      onClose();
    } catch (e) {
      const d = e?.response?.data;
      message.error(d?.message || 'Could not send the payment advice');
      if (d?.code === 'NO_MAILBOX') setMailboxOpen(true);
    } finally {
      setSending(false);
    }
  };

  const canSend = data?.to && data?.from;
  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        width={Math.min(820, window.innerWidth - 24)}
        title={`Payment advice${data ? ` · ${data.details.invoice_number}` : ''}`}
        destroyOnClose
        footer={(
          <Space>
            <Button onClick={onClose}>Close</Button>
            <Popconfirm title="Send this email to the vendor now?" description={`From ${data?.from || '—'} to ${data?.to || '—'}`} okText="Send" onConfirm={send} disabled={!canSend}>
              <Button type="primary" icon={<Send size={15} />} loading={sending} disabled={!canSend}>Send to vendor</Button>
            </Popconfirm>
          </Space>
        )}
      >
        {loading || !data ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {data.sent_at && <Alert type="info" showIcon message={`Already sent on ${when(data.sent_at)} to ${data.sent_to}. Sending again sends a fresh copy.`} />}
            {!data.to && <Alert type="warning" showIcon message={`${data.details.vendor_name} has no email in Vendor Master. Add it there first.`} />}
            {!data.from && (
              <Alert type="warning" showIcon message="Connect your email account to send"
                action={<Button size="small" onClick={() => setMailboxOpen(true)}>Connect</Button>} />
            )}
            <Text type="secondary">From <Text strong>{data.from || '—'}</Text> to <Text strong>{data.to || '—'}</Text> (you get a copy)</Text>
            <Form form={form} layout="vertical">
              <Form.Item name="subject" label="Subject" rules={[{ required: true, message: 'Enter a subject' }]}>
                <Input maxLength={255} />
              </Form.Item>
              <Form.Item name="message" label="Message" rules={[{ required: true, message: 'Enter a message' }]} extra="The payment details below are added from the records and cannot be edited.">
                <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} maxLength={5000} />
              </Form.Item>
            </Form>
            <div style={{ border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 8, padding: 16, background: '#fff' }}
              // Built on the server from the records with every value escaped.
              dangerouslySetInnerHTML={{ __html: data.html.replace(/^[\s\S]*?(<h3)/, '$1') }} />
          </Space>
        )}
      </Modal>
      <ConnectEmailModal open={mailboxOpen} onClose={() => setMailboxOpen(false)} onConnected={load} />
    </>
  );
};

/** Button that opens the payment advice for a paid or part-paid invoice; shows when it was last sent. */
export const PaymentAdviceButton = ({ invoice, size = 'middle', onSent }) => {
  const [open, setOpen] = useState(false);
  if (!invoice || !['PAID', 'PARTIAL'].includes(invoice.status)) return null;
  const sentAt = invoice.payment_advice_sent_at;
  return (
    <>
      <Tooltip title={sentAt ? `Last sent ${when(sentAt)} to ${invoice.payment_advice_sent_to}` : 'Email the vendor what was paid'}>
        <Button size={size} icon={<Mail size={14} />} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
          {sentAt ? 'Payment advice sent' : 'Email payment advice'}
        </Button>
      </Tooltip>
      <PaymentAdviceModal invoiceId={invoice.id} open={open} onClose={() => setOpen(false)} onSent={onSent} />
    </>
  );
};

export default PaymentAdviceButton;
