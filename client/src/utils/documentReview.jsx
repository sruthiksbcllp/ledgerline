import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

export const AI_ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp';
export const AI_MAX_BYTES = 10 * 1024 * 1024;
const AI_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Client-side pre-check; the server re-checks the real file contents. */
export const checkUploadFile = (file) => {
  if (!(AI_TYPES.includes(file.type) || /\.(pdf|jpe?g|png|gif|webp)$/i.test(file.name || ''))) {
    return 'Unsupported file. Upload a PDF, JPG, PNG, GIF or WEBP file.';
  }
  if (file.size > AI_MAX_BYTES) return 'File is larger than 10 MB.';
  return null;
};

/** { status, extra } props for a Form.Item/Input showing an AI confidence mark. */
export const markProps = (mark) => {
  if (!mark || mark.confidence === 'high') return {};
  const missing = !mark.value;
  return {
    status: 'warning',
    extra: (
      <Text type="warning" style={{ fontSize: 12 }}>
        {missing ? 'Not found in document' : `AI: ${mark.confidence} confidence${mark.note ? ` — ${mark.note}` : ''}`}
      </Text>
    ),
  };
};

const ACTION_LABEL = {
  AP_INVOICE_SUBMITTED: 'Submitted for approval',
  AP_INVOICE_APPROVED: 'Approved',
  AP_INVOICE_REJECTED: 'Rejected',
  AP_PAYMENT_RECORDED: 'Partial payment recorded',
  AP_INVOICE_PAID: 'Paid in full',
  AR_INVOICE_POSTED: 'Invoice posted',
  AR_RECEIPT_RECORDED: 'Payment received',
  AR_INVOICE_PAID: 'Paid in full',
  AR_REMINDER_SENT: 'Reminder sent',
  AR_INVOICE_CANCELLED: 'Cancelled',
};

export const historyItems = (history = []) => history.map((h) => ({
  key: h.id,
  children: (
    <div>
      <Text strong>{ACTION_LABEL[h.action] || h.action}</Text>
      <div><Text type="secondary" style={{ fontSize: 12 }}>{h.user} · {new Date(h.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Text></div>
      {h.note && <div style={{ fontSize: 13 }}>{h.note}</div>}
    </div>
  ),
}));
