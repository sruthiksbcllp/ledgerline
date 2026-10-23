import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Table, Tag, Typography } from 'antd';
import { Inbox, Paperclip, RefreshCcw, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import QuotationFromReplyModal from './QuotationFromReplyModal';
import ConnectEmailModal from '../settings/ConnectEmailModal';

const { Text } = Typography;
const MAILBOX_CODES = ['NO_MAILBOX', 'NOT_OUTLOOK', 'NEEDS_MAIL_READ', 'RECONNECT'];
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Quotation Management: vendor replies to RFQs that still need to be entered as quotations. */
const PendingRepliesCard = ({ cardStyle, onRecorded }) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [filling, setFilling] = useState(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/rfqs/replies/pending', { timeout: 90000 });
      setRows(res?.data?.data?.replies || []);
    } catch (e) {
      const data = e?.response?.data || {};
      // Non-admins (or no RFQ module) simply don't get this card.
      if ((e?.response?.status === 403 && !data.code) || e?.response?.status === 404) setHidden(true);
      else setError({ code: data.code, message: data.message || 'Could not check vendor replies' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (hidden) return null;
  const mailboxProblem = error && MAILBOX_CODES.includes(error.code);

  return (
    <Card
      style={{ ...cardStyle, marginBottom: 16 }}
      title={<Space><Inbox size={16} />Vendor replies waiting for a quotation{rows.length ? <Tag color="blue">{rows.length}</Tag> : null}</Space>}
      extra={<Button size="small" icon={<RefreshCcw size={13} />} loading={loading} onClick={load}>Check for new replies</Button>}
      styles={{ body: { padding: rows.length ? 0 : 16 } }}
    >
      {mailboxProblem && (
        <Alert
          type="warning"
          showIcon
          message="Connect Outlook to bring vendor replies in here"
          description={error.message}
          action={<Button size="small" type="primary" onClick={() => setConnectOpen(true)}>{error.code === 'NEEDS_MAIL_READ' ? 'Allow reading replies' : error.code === 'NO_MAILBOX' ? 'Connect Outlook' : 'Reconnect Outlook'}</Button>}
        />
      )}
      {error && !mailboxProblem && <Alert type="error" showIcon message={error.message} />}
      {!error && !loading && !rows.length && <Text type="secondary">No new vendor replies. Replies to your RFQ emails appear here so you can turn them into quotations.</Text>}
      {rows.length > 0 && (
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[
            { title: 'RFQ', key: 'rfq', render: (_, r) => <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => navigate(`/procurement/rfq/${r.rfq_id}`)}>{r.rfq_number}</Button> },
            { title: 'Vendor', dataIndex: 'vendor_name', render: (v, r) => <Space size={6}><Text strong={!r.is_read}>{v}</Text>{!r.is_read && <Tag color="blue">New</Tag>}</Space> },
            { title: 'Received', dataIndex: 'received_at', render: when },
            { title: 'Email', key: 'subject', render: (_, r) => (
              <div style={{ maxWidth: 380 }}>
                <div>{r.subject}</div>
                <Text type="secondary" ellipsis style={{ fontSize: 12, maxWidth: 380 }}>{r.preview}</Text>
              </div>
            ) },
            { title: '', key: 'att', render: (_, r) => (r.has_attachments ? <Tag icon={<Paperclip size={11} style={{ marginRight: 3 }} />}>Attachment</Tag> : null) },
            { title: '', key: 'fill', align: 'right', render: (_, r) => <Button type="primary" size="small" icon={<Sparkles size={13} />} onClick={() => setFilling(r)}>Fill quotation</Button> },
          ]}
        />
      )}
      <QuotationFromReplyModal
        open={!!filling}
        rfqId={filling?.rfq_id}
        messageId={filling?.id}
        vendorName={filling?.vendor_name}
        onClose={() => setFilling(null)}
        onSaved={() => { load(); onRecorded?.(); }}
      />
      <ConnectEmailModal open={connectOpen} onClose={() => setConnectOpen(false)} onConnected={load} withRead />
    </Card>
  );
};

export default PendingRepliesCard;
