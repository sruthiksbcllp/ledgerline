import React, { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, List, Space, Spin, Tag, Typography, message } from 'antd';
import { ArrowLeft, Download, ExternalLink, Paperclip, RefreshCcw, Sparkles } from 'lucide-react';
import api from '../../utils/api';
import ConnectEmailModal from '../settings/ConnectEmailModal';
import QuotationFromReplyModal from './QuotationFromReplyModal';

const { Text } = Typography;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const MAILBOX_CODES = ['NO_MAILBOX', 'NOT_OUTLOOK', 'NEEDS_MAIL_READ', 'RECONNECT'];
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Vendor email HTML is shown in a sandboxed frame with no scripts and no remote loading
// (blocks tracking pixels); inline images still show.
const frameDoc = (html, text) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:">
<style>body{font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;margin:12px;word-wrap:break-word}img{max-width:100%}</style>
</head><body>${html || `<pre style="white-space:pre-wrap;font-family:inherit">${esc(text || '')}</pre>`}</body></html>`;

/**
 * Vendor replies to an RFQ, read from the admin's connected Outlook.
 * `replies`/`state` are owned by the RFQ page so the vendor table can show counts too.
 */
const RfqRepliesDrawer = ({ rfqId, open, onClose, replies, state, onReload, canFillFor, onQuotationRecorded }) => {
  const [filling, setFilling] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  useEffect(() => {
    if (!open) { setSelected(null); setDetail(null); }
  }, [open]);

  const openReply = async (reply) => {
    setSelected(reply);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const res = await api.get(`/rfqs/${rfqId}/replies/${encodeURIComponent(reply.id)}`);
      setDetail(res?.data?.data);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not open the reply');
    } finally {
      setLoadingDetail(false);
    }
  };

  const downloadAttachment = async (att) => {
    try {
      const res = await api.get(`/rfqs/${rfqId}/replies/${encodeURIComponent(detail.id)}/attachments/${encodeURIComponent(att.id)}`, { responseType: 'blob', timeout: 120000 });
      const url = URL.createObjectURL(new Blob([res.data], { type: att.content_type || 'application/octet-stream' }));
      if (att.content_type === 'application/pdf') {
        window.open(url, '_blank', 'noopener');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = att.name;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      message.error('Could not download the attachment');
    }
  };

  const mailboxProblem = state.error && MAILBOX_CODES.includes(state.error.code);

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={Math.min(820, window.innerWidth)}
        title={selected
          ? <Space><Button type="text" size="small" icon={<ArrowLeft size={16} />} onClick={() => { setSelected(null); setDetail(null); }} />Reply from {selected.vendor_name}</Space>
          : 'Vendor replies'}
        extra={!selected && <Button icon={<RefreshCcw size={14} />} loading={state.loading} onClick={onReload}>Check for new replies</Button>}
      >
        {!selected && (
          <>
            {state.mailbox && !state.error && (
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                Replies found in {state.mailbox} that mention this RFQ and come from its vendors.
              </Text>
            )}
            {mailboxProblem && (
              <Alert
                type="warning"
                showIcon
                message="Connect Outlook to see vendor replies"
                description={state.error.message}
                action={<Button size="small" type="primary" onClick={() => setConnectOpen(true)}>{state.error.code === 'NEEDS_MAIL_READ' ? 'Allow reading replies' : state.error.code === 'NO_MAILBOX' ? 'Connect Outlook' : 'Reconnect Outlook'}</Button>}
              />
            )}
            {state.error && !mailboxProblem && <Alert type="error" showIcon message="Could not load replies" description={state.error.message} />}
            {state.loading && !replies.length && <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>}
            {!state.loading && !state.error && !replies.length && (
              <Empty description="No replies from this RFQ's vendors yet" style={{ marginTop: 40 }} />
            )}
            {replies.length > 0 && (
              <List
                dataSource={replies}
                renderItem={(r) => (
                  <List.Item style={{ cursor: 'pointer', paddingInline: 8, borderRadius: 8 }} onClick={() => openReply(r)}>
                    <List.Item.Meta
                      title={
                        <Space size={8} wrap>
                          <Text strong={!r.is_read}>{r.vendor_name}</Text>
                          {!r.is_read && <Tag color="blue">Unread</Tag>}
                          {r.has_attachments && <Tag icon={<Paperclip size={11} style={{ marginRight: 3 }} />}>Attachment</Tag>}
                          <Text type="secondary" style={{ fontSize: 12 }}>{when(r.received_at)}</Text>
                        </Space>
                      }
                      description={
                        <div>
                          <div style={{ color: 'var(--color-text-primary)' }}>{r.subject}</div>
                          <Text type="secondary" style={{ fontSize: 13 }}>{r.preview}</Text>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </>
        )}

        {selected && (loadingDetail || !detail) && <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>}
        {selected && detail && (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div>
              <Text strong style={{ fontSize: 15 }}>{detail.subject}</Text>
              <div><Text type="secondary">From {detail.from_name ? `${detail.from_name} <${detail.from_email}>` : detail.from_email} · {when(detail.received_at)}</Text></div>
              {detail.cc.length > 0 && <div><Text type="secondary" style={{ fontSize: 12 }}>Cc: {detail.cc.join(', ')}</Text></div>}
            </div>
            {canFillFor?.(detail.vendor_id) && (
              <Alert
                type="info"
                showIcon
                icon={<Sparkles size={16} />}
                message={`Turn this reply into ${detail.vendor_name}'s quotation`}
                description="AI reads the attached quotation (or the email text) and fills the quotation for you to check."
                action={<Button type="primary" size="small" onClick={() => setFilling(detail)}>Fill quotation</Button>}
              />
            )}
            {detail.attachments.length > 0 && (
              <Space wrap>
                {detail.attachments.map((a) => (
                  <Button key={a.id} icon={a.content_type === 'application/pdf' ? <ExternalLink size={14} /> : <Download size={14} />} onClick={() => downloadAttachment(a)}>
                    {a.name} <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>{size(a.size)}</Text>
                  </Button>
                ))}
              </Space>
            )}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
              <iframe title="Vendor reply" sandbox="" srcDoc={frameDoc(detail.body_html, detail.body_text)} style={{ width: '100%', height: 520, border: 0 }} />
            </div>
            {detail.web_link && (
              <Button type="link" icon={<ExternalLink size={14} />} href={detail.web_link} target="_blank" rel="noopener noreferrer" style={{ paddingInline: 0 }}>
                Open in Outlook to reply
              </Button>
            )}
          </Space>
        )}
      </Drawer>
      <ConnectEmailModal open={connectOpen} onClose={() => setConnectOpen(false)} onConnected={onReload} withRead />
      <QuotationFromReplyModal
        open={!!filling}
        rfqId={rfqId}
        messageId={filling?.id}
        vendorName={filling?.vendor_name}
        onClose={() => setFilling(null)}
        onSaved={() => { onQuotationRecorded?.(); setSelected(null); setDetail(null); }}
      />
    </>
  );
};

export default RfqRepliesDrawer;
