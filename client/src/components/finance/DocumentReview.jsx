import React from 'react';
import { Alert, Space, Tag, Typography, Upload } from 'antd';
import { AlertTriangle, CheckCircle2, FileUp, XCircle } from 'lucide-react';
import { AI_ACCEPT } from '../../utils/documentReview';

const { Text } = Typography;

export const DocumentDropzone = ({ onFile, loading, title, hint }) => (
  <Upload.Dragger
    accept={AI_ACCEPT}
    multiple={false}
    showUploadList={false}
    disabled={loading}
    beforeUpload={(file) => { onFile(file); return Upload.LIST_IGNORE; }}
    style={{ padding: '18px 12px', borderRadius: 14 }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <FileUp size={30} color="#4F46E5" />
      <Text strong style={{ fontSize: 15 }}>{loading ? 'Reading document with AI…' : title}</Text>
      <Text type="secondary" style={{ fontSize: 12, maxWidth: 460 }}>{hint}</Text>
    </div>
  </Upload.Dragger>
);

/** Errors block submission; warnings need a human look. Both come from the server. */
export const ChecksPanel = ({ checks, checking }) => {
  const errors = (checks || []).filter((c) => c.severity === 'error');
  const warnings = (checks || []).filter((c) => c.severity === 'warning');
  if (!checks) return null;
  if (!errors.length && !warnings.length) {
    return (
      <Alert
        type="success"
        showIcon
        icon={<CheckCircle2 size={16} />}
        message={checking ? 'Checking…' : 'All checks passed: totals, tax, dates and duplicates'}
      />
    );
  }
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {errors.length > 0 && (
        <Alert
          type="error"
          showIcon
          icon={<XCircle size={16} />}
          message={`${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before submitting`}
          description={<ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((c, i) => <li key={i}>{c.message}</li>)}</ul>}
        />
      )}
      {warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<AlertTriangle size={16} />}
          message={`${warnings.length} thing${warnings.length === 1 ? '' : 's'} to double-check`}
          description={<ul style={{ margin: 0, paddingLeft: 18 }}>{warnings.map((c, i) => <li key={i}>{c.message}</li>)}</ul>}
        />
      )}
    </Space>
  );
};

const STATUS_STYLE = {
  // AP
  UNPAID: { color: 'processing', label: 'Pending' },
  APPROVED_FOR_PAYMENT: { color: 'purple', label: 'Approved' },
  PARTIAL: { color: 'warning', label: 'Partially Paid' },
  PAID: { color: 'success', label: 'Paid' },
  REJECTED: { color: 'error', label: 'Rejected' },
  EXCEPTION: { color: 'error', label: 'Exception' },
  WAITING_FOR_PAYMENT: { color: 'gold', label: 'Waiting for payment' },
  // AR
  PARTIALLY_PAID: { color: 'warning', label: 'Partially Paid' },
  CANCELLED: { color: 'default', label: 'Cancelled' },
};

export const StatusTag = ({ status, kind }) => {
  const s = STATUS_STYLE[status] || { color: 'default', label: status };
  const label = kind === 'AR' && status === 'UNPAID' ? 'Unpaid' : s.label;
  return <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{label}</Tag>;
};
