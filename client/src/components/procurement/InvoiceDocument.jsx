import React, { useState } from 'react';
import { Button, Space, Tooltip, Typography, Upload, message } from 'antd';
import { FileText, Paperclip } from 'lucide-react';
import api from '../../utils/api';

/**
 * The vendor's invoice file attached to a document (SES or invoice): a "View invoice" link and,
 * when `uploadPath` is given, an Attach / Replace button that posts the file there.
 * The same file is carried from the SES onto its invoice, so it is visible up to payment.
 */
const { Text } = Typography;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

/** Absolute link for a stored document path such as /uploads/invoices/x.pdf. */
export const documentHref = (url) => (url ? `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${url}` : null);

/** Client-side check before uploading: PDF/JPG/PNG up to 10 MB. Returns true when the file is fine. */
export const checkInvoiceFile = (file) => {
  if (!ALLOWED.includes(file.type)) { message.error('Only PDF, JPG or PNG files are allowed'); return false; }
  if (file.size / 1024 / 1024 > 10) { message.error('File size must be 10MB or less'); return false; }
  return true;
};

export default function InvoiceDocument({ url, uploadPath, onUploaded, emptyText = 'No invoice attached', size = 'small', canUpload = true }) {
  const [busy, setBusy] = useState(false);
  const href = documentHref(url);

  const send = async ({ file, onSuccess, onError }) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(uploadPath, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      message.success('Invoice attached');
      onSuccess && onSuccess('ok');
      onUploaded && onUploaded(res?.data?.data);
    } catch (err) {
      message.error(err?.response?.data?.message || 'Upload failed');
      onError && onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Space size={6} wrap>
      {href ? (
        <Button size={size} type="link" icon={<FileText size={14} />} href={href} target="_blank" rel="noreferrer" style={{ paddingInline: 0 }}>
          View invoice
        </Button>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>{emptyText}</Text>
      )}
      {uploadPath && canUpload && (
        <Tooltip title="PDF, JPG or PNG, up to 10 MB">
          <Upload showUploadList={false} accept=".pdf,.jpg,.jpeg,.png" beforeUpload={checkInvoiceFile} customRequest={send}>
            <Button size={size} icon={<Paperclip size={14} />} loading={busy}>{href ? 'Replace' : 'Attach invoice'}</Button>
          </Upload>
        </Tooltip>
      )}
    </Space>
  );
}
