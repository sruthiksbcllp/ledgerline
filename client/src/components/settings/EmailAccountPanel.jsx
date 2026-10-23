import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Popconfirm, Row, Space, Spin, Tag, Typography, message } from 'antd';
import { CheckCircle2, Mail, Send, Server, Unplug } from 'lucide-react';
import api from '../../utils/api';
import MailboxSettingsModal from '../procurement/MailboxSettingsModal';

const { Text, Title } = Typography;

const GoogleMark = () => (
  <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);
const MicrosoftMark = () => (
  <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden>
    <path fill="#f35325" d="M1 1h10v10H1z" /><path fill="#81bc06" d="M12 1h10v10H12z" />
    <path fill="#05a6f0" d="M1 12h10v10H1z" /><path fill="#ffba08" d="M12 12h10v10H12z" />
  </svg>
);

// Outlook first; Google is only offered once it has been set up on the server.
const PROVIDERS = [
  { key: 'microsoft', label: 'Outlook', product: 'Microsoft 365 work or school account', mark: <MicrosoftMark />, always: true },
  { key: 'google', label: 'Google', product: 'Gmail / Google Workspace', mark: <GoogleMark /> },
];
const PROVIDER_NAME = { GOOGLE: 'Google (Gmail)', MICROSOFT: 'Outlook (Microsoft 365)', SMTP: 'SMTP server' };
const MARK = { GOOGLE: <GoogleMark />, MICROSOFT: <MicrosoftMark />, SMTP: <Server size={20} /> };
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * Connect the logged-in admin's mailbox for RFQ and vendor emails.
 * One-click Google / Microsoft sign-in; SMTP settings as a fallback.
 * `returnTo`: page to come back to after the Google/Microsoft sign-in.
 */
const EmailAccountPanel = ({ returnTo, onChange, withRead = false }) => {
  const [account, setAccount] = useState(null);
  const [me, setMe] = useState(null);
  const [providers, setProviders] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [smtpOpen, setSmtpOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mb, pv] = await Promise.all([api.get('/vendor-emails/mailbox'), api.get('/vendor-emails/oauth/providers')]);
      setAccount(mb?.data?.data || null);
      setMe(mb?.data?.me || null);
      setProviders(pv?.data?.data || {});
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not load your email settings');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // read: also ask for "Read your mail" (vendor replies). Kept separate because it may need admin approval.
  const connect = async (provider, read = withRead) => {
    setBusy(read ? `${provider}-read` : provider);
    try {
      const res = await api.get(`/vendor-emails/oauth/${provider}/start`, { params: { return_to: returnTo || window.location.pathname, ...(read ? { read: '1' } : {}) } });
      window.location.assign(res.data.data.url); // Google / Microsoft sign-in page
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not start the sign-in');
      setBusy(null);
    }
  };
  const sendTest = async () => {
    setBusy('test');
    try {
      const res = await api.post('/vendor-emails/mailbox/test', {}, { timeout: 60000 });
      message.success(res?.data?.message || 'Test email sent');
    } catch (e) {
      message.error(e?.response?.data?.message || 'Test email failed');
    } finally {
      setBusy(null);
      load();
    }
  };
  const disconnect = async () => {
    setBusy('disconnect');
    try {
      await api.delete('/vendor-emails/mailbox');
      message.success('Mailbox disconnected');
      setAccount(null);
      onChange?.(null);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not disconnect');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {account ? (
        <Card style={{ borderRadius: 14, borderColor: account.last_error ? '#fecaca' : '#bbf7d0', background: account.last_error ? '#fff7f7' : '#f6fef9' }} styles={{ body: { padding: 18 } }}>
          <Row align="middle" gutter={[16, 12]} justify="space-between">
            <Col flex="auto">
              <Space size={14} align="center">
                <span style={{ width: 42, height: 42, borderRadius: 12, background: '#fff', border: '1px solid var(--color-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {MARK[account.provider] || <Mail size={20} />}
                </span>
                <div>
                  <Space size={8}>
                    <Text strong style={{ fontSize: 15 }}>{account.from_email}</Text>
                    {account.last_error ? <Tag color="error">Needs attention</Tag> : <Tag color="success" icon={<CheckCircle2 size={11} style={{ marginRight: 3 }} />}>Connected</Tag>}
                  </Space>
                  <div><Text type="secondary" style={{ fontSize: 13 }}>{PROVIDER_NAME[account.provider] || account.provider} · connected {when(account.connected_at)}</Text></div>
                </div>
              </Space>
            </Col>
            <Col>
              <Space wrap>
                <Button icon={<Send size={14} />} loading={busy === 'test'} onClick={sendTest}>Send test email</Button>
                <Popconfirm title="Disconnect this mailbox?" description="RFQs and vendor emails can't be sent until you connect again." okText="Disconnect" okButtonProps={{ danger: true }} onConfirm={disconnect}>
                  <Button danger icon={<Unplug size={14} />} loading={busy === 'disconnect'}>Disconnect</Button>
                </Popconfirm>
              </Space>
            </Col>
          </Row>
          {account.last_error && <Alert style={{ marginTop: 14 }} type="error" showIcon message="Last send failed" description={account.last_error} />}
          {account.provider === 'MICROSOFT' && (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Reading vendor replies: {account.can_read_mail ? <Tag color="success">On</Tag> : <Tag>Off</Tag>}
                {!account.can_read_mail && 'Lets LedgerLine bring vendor replies into RFQs and Quotations. Your organisation may need to approve it first.'}
              </Text>
              {!account.can_read_mail && (
                <Button size="small" loading={busy === 'microsoft-read'} onClick={() => connect('microsoft', true)}>Allow reading vendor replies</Button>
              )}
            </div>
          )}
        </Card>
      ) : (
        <Alert type="info" showIcon message="No mailbox connected" description="Connect your work email once. RFQs and vendor emails you send will come from this address." />
      )}

      <div>
        <Title level={5} style={{ marginBottom: 4 }}>{account ? 'Change the connected mailbox' : 'Connect with one click'}</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>You sign in once on Microsoft's own page and allow LedgerLine to send email for you. After that, emails you send from LedgerLine go out from your mailbox without signing in again. LedgerLine never sees your password.</Text>
      </div>
      <Row gutter={[12, 12]}>
        {PROVIDERS.filter((p) => p.always || providers[p.key]).map((p) => {
          const ready = providers[p.key];
          const current = account?.provider === p.key.toUpperCase();
          return (
            <Col xs={24} md={providers.google ? 12 : 24} key={p.key}>
              <Card style={{ borderRadius: 14, height: '100%' }} styles={{ body: { padding: 16 } }}>
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Space size={10}>{p.mark}<div><Text strong>{p.label}</Text><div><Text type="secondary" style={{ fontSize: 12 }}>{p.product}</Text></div></div></Space>
                  {ready ? (
                    <Button block type={current ? 'default' : 'primary'} loading={busy === p.key} onClick={() => connect(p.key)}>
                      {current ? `Reconnect ${p.label}` : `Connect ${p.label}`}
                    </Button>
                  ) : (
                    <Button block disabled style={{ background: 'var(--color-bg-subtle, #F1F5F9)', color: 'var(--color-text-muted, #6B7280)', borderColor: 'var(--color-border)' }}>Not available yet</Button>
                  )}
                  {!ready && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {p.key === 'microsoft'
                        ? 'Not set up yet: add the Azure app registration (client ID, secret and tenant ID) to the server settings. One-time.'
                        : 'Not set up yet: an administrator needs to register LedgerLine with Google (one-time).'}
                    </Text>
                  )}
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>
      <Button type="link" icon={<Server size={14} />} style={{ paddingInline: 0 }} onClick={() => setSmtpOpen(true)}>
        Use another email provider (SMTP settings)
      </Button>
      {me?.email && <Text type="secondary" style={{ fontSize: 12 }}>Signed in to LedgerLine as {me.email}. You can only connect this same email address.</Text>}

      <MailboxSettingsModal
        open={smtpOpen}
        onClose={() => setSmtpOpen(false)}
        onSaved={(data) => { setAccount(data); onChange?.(data); }}
        userEmail={me?.email}
        userName={me?.name}
      />
    </Space>
  );
};

export default EmailAccountPanel;
