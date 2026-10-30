import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Collapse, Form, Input, Modal, Popconfirm, Row, Select, Space, Spin, Tag, Tooltip, Typography, message
} from 'antd';
import { CheckCircle2, ExternalLink, Link2, PlugZap, RefreshCcw, Settings2, Unplug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import ZohoBooksSync from './ZohoBooksSync';
import { getStoredUser } from '../../utils/session';

// The LedgerLine platform team sees server setup details; customers never do.
const PLATFORM_ROLES = ['PROVIDER_ADMIN', 'DEV_ADMIN'];
const isPlatformUser = () => PLATFORM_ROLES.includes(String(getStoredUser()?.role || '').toUpperCase());

const { Text, Paragraph } = Typography;

// Brand-coloured initials (no third-party logos bundled).
const MARKS = {
  zoho_books: { text: 'ZB', bg: '#E42527' },
  tally: { text: 'T', bg: '#1C3F94' },
  netsuite: { text: 'NS', bg: '#125580' },
  sap: { text: 'SAP', bg: '#0A6ED1' },
  gsp: { text: 'GST', bg: '#F28C28' },
  razorpayx: { text: 'RX', bg: '#2B7BF4' },
  whatsapp: { text: 'WA', bg: '#25D366' },
  microsoft_365: { text: 'M365', bg: '#0078D4' },
  email: { text: '@', bg: '#475569' },
  aws_ai: { text: 'AI', bg: '#7C3AED' },
};
const Mark = ({ id }) => {
  const m = MARKS[id] || { text: '?', bg: '#64748b' };
  return (
    <div style={{ width: 40, height: 40, borderRadius: 10, background: m.bg, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: m.text.length > 2 ? 11 : 14, flexShrink: 0 }}>
      <span style={{ fontSize: m.text.length > 3 ? 10 : undefined }}>{m.text}</span>
    </div>
  );
};

const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null);

/** The status shown on a card. Never "connected" unless the server says so. */
const statusOf = (item, live, platform) => {
  const c = item.connection;
  if (!live && item.auth !== 'link') return { color: 'default', label: 'Not connected' };
  if (c?.status === 'CONNECTED') return { color: 'success', label: 'Connected' };
  if (c?.status === 'CONFIGURED') return { color: 'success', label: 'Configured' };
  if (c?.status === 'SAVED') return { color: 'processing', label: 'Saved · not verified' };
  if (c?.status === 'ERROR') return { color: 'error', label: 'Needs attention' };
  if (!item.setup.ready && item.auth !== 'link') return platform ? { color: 'warning', label: 'Setup required' } : { color: 'default', label: 'Coming soon' };
  return { color: 'default', label: 'Not connected' };
};

const SetupHelp = ({ item }) => (
  <div style={{ fontSize: 12 }}>
    <div style={{ marginBottom: 4 }}>Add on the server (.env):</div>
    {item.setup.missingEnv.map((v) => <div key={v}><code>{v}</code></div>)}
    {item.redirect_uri && <div style={{ marginTop: 6 }}>Redirect URI to register:<br /><code style={{ wordBreak: 'break-all' }}>{item.redirect_uri}</code></div>}
  </div>
);

/** Preview mode: what Connect will do once integrations are activated. Sends nothing anywhere. */
const PreviewModal = ({ item, onClose }) => (
  <Modal
    open
    title={<Space><Mark id={item.key} /><span>Connect {item.name}</span><Tag color="blue">Coming soon</Tag></Space>}
    onCancel={onClose}
    footer={<Button type="primary" onClick={onClose}>Got it</Button>}
  >
    <Paragraph>{item.description}</Paragraph>
    {item.planned?.length > 0 && (
      <>
        <Text strong>What you will be able to do</Text>
        <ul style={{ paddingLeft: 20, margin: '8px 0 16px' }}>
          {item.planned.map((p) => <li key={p}><Text>{p}</Text></li>)}
        </ul>
      </>
    )}
    <Alert
      type="info"
      showIcon
      message="Not connected yet"
      description={item.auth === 'oauth2'
        ? `Once activated, Connect will take you to ${item.name} to sign in and approve access. LedgerLine never sees your ${item.name} password.`
        : `Once activated, you will enter your ${item.name} API details here. They are stored encrypted and checked with ${item.name} before saving.`}
    />
  </Modal>
);

/** The connect / edit form for an app (mounted per app). `item.fields` comes from the server catalog. */
const ConnectModal = ({ item, onClose, onDone }) => {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const connected = Boolean(item.connection);
  // Saved non-secret values; secrets are never sent back, so their inputs start empty.
  const [initialValues] = useState(() => Object.fromEntries(item.fields
    .filter((f) => !f.secret)
    .map((f) => [f.name, item.connection?.config?.[f.name] ?? f.default_value])));

  const submit = async () => {
    const values = await form.validateFields();
    setBusy(true);
    setError(null);
    try {
      if (item.auth === 'oauth2') {
        const res = await api.post(`/integrations/connections/${item.key}/oauth/start`, { config: values });
        window.location.assign(res.data.data.url); // provider sign-in page
        return;
      }
      const res = await api.put(`/integrations/connections/${item.key}`, { values }, { timeout: 60000 });
      message.success(res?.data?.message || 'Saved');
      onDone();
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not connect');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={<Space><Mark id={item.key} /><span>{connected ? `Edit ${item.name}` : `Connect ${item.name}`}</span></Space>}
      onCancel={onClose}
      onOk={submit}
      okText={item.auth === 'oauth2' ? `Continue to ${item.name}` : (item.can_verify ? 'Verify & save' : 'Save securely')}
      confirmLoading={busy}
      destroyOnHidden
    >
      {item.note && <Alert type="info" showIcon style={{ marginBottom: 16 }} message={item.note} />}
      {error && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={error} />}
      <Form form={form} layout="vertical" requiredMark initialValues={initialValues}>
        {item.fields.map((f) => {
          const savedSecret = f.secret && item.connection?.secrets_set?.[f.name];
          const rules = [];
          if (f.required && !savedSecret) rules.push({ required: true, message: `${f.label} is required` });
          if (f.pattern) rules.push({ pattern: new RegExp(f.pattern), message: `${f.label} is not in the expected format` });
          if (f.type === 'url') rules.push({ type: 'url', message: 'Enter a full URL starting with http:// or https://' });
          let input;
          if (f.type === 'select') input = <Select options={(f.options || []).map((o) => ({ value: o, label: o }))} placeholder={`Choose ${f.label}`} />;
          else if (f.secret) input = <Input.Password autoComplete="new-password" placeholder={savedSecret ? 'Saved — leave blank to keep' : f.placeholder} />;
          else input = <Input placeholder={f.placeholder} autoComplete="off" />;
          return (
            <Form.Item key={f.name} name={f.name} label={f.label} rules={rules} extra={f.help}
              normalize={f.name === 'gstin' ? (v) => (v || '').toUpperCase() : undefined}>
              {input}
            </Form.Item>
          );
        })}
      </Form>
      {item.auth === 'oauth2' && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          You will sign in at {item.name} and approve access. LedgerLine never sees your {item.name} password.
        </Text>
      )}
      {item.auth === 'credentials' && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Secrets are encrypted on the server and are never shown again.
          {item.can_verify ? ` LedgerLine checks them with ${item.name} before saving.` : ''}
        </Text>
      )}
    </Modal>
  );
};

const IntegrationCard = ({ item, live, busy, onConnect, onPreview, onTest, onDisconnect }) => {
  const navigate = useNavigate();
  const platform = isPlatformUser();
  const status = statusOf(item, live, platform);
  const c = live || item.auth === 'link' ? item.connection : null;
  const blocked = live && !item.setup.ready && !c && item.auth !== 'link' && item.auth !== 'platform';

  let actions;
  if (!live && item.auth !== 'link') {
    actions = <Button type="primary" icon={<PlugZap size={14} />} onClick={onPreview}>Connect</Button>;
  } else if (item.auth === 'link') {
    actions = <Button icon={<Settings2 size={14} />} onClick={() => navigate(item.link)}>{c ? 'Manage' : 'Connect'}</Button>;
  } else if (item.auth === 'platform') {
    actions = item.can_verify
      ? <Button icon={<RefreshCcw size={14} />} loading={busy === 'test'} onClick={onTest}>Test</Button>
      : <Text type="secondary" style={{ fontSize: 12 }}>Managed by the LedgerLine platform team</Text>;
  } else if (!c) {
    actions = blocked
      ? <Tooltip title={platform ? <SetupHelp item={item} /> : `${item.name} is not switched on for your LedgerLine account yet. Contact LedgerLine support.`}><Button disabled icon={<PlugZap size={14} />}>Connect</Button></Tooltip>
      : <Button type="primary" icon={<PlugZap size={14} />} loading={busy === 'connect'} onClick={onConnect}>Connect</Button>;
  } else {
    actions = (
      <Space wrap size={8}>
        {item.can_verify && <Button size="small" icon={<RefreshCcw size={13} />} loading={busy === 'test'} onClick={onTest}>Test</Button>}
        {item.auth === 'credentials' && <Button size="small" icon={<Settings2 size={13} />} onClick={onConnect}>Edit</Button>}
        {item.auth === 'oauth2' && c.status === 'ERROR' && <Button size="small" type="primary" icon={<PlugZap size={13} />} disabled={!item.setup.ready} onClick={onConnect}>Reconnect</Button>}
        <Popconfirm
          title={`Disconnect ${item.name}?`}
          description="Saved credentials and tokens for this company are deleted."
          okText="Disconnect" okButtonProps={{ danger: true }}
          onConfirm={onDisconnect}
        >
          <Button size="small" danger icon={<Unplug size={13} />} loading={busy === 'disconnect'}>Disconnect</Button>
        </Popconfirm>
      </Space>
    );
  }

  return (
    <Card style={{ height: '100%', borderRadius: 12, border: '1px solid var(--color-border)' }} styles={{ body: { padding: 16, display: 'flex', flexDirection: 'column', height: '100%' } }}>
      <Space align="start" size={12} style={{ width: '100%', marginBottom: 8 }}>
        <Mark id={item.key} />
        <div style={{ minWidth: 0 }}>
          <Text strong style={{ fontSize: 15 }}>{item.name}</Text>
          <div><Tag color={status.color} style={{ marginTop: 4 }}>{status.label}</Tag></div>
        </div>
      </Space>
      <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 8 }}>{item.description}</Paragraph>
      {c?.account_label && (
        <Text style={{ fontSize: 13 }}><CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 4, color: c.status === 'ERROR' ? '#dc2626' : '#16a34a' }} />{c.account_label}</Text>
      )}
      {c?.last_error && <Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>{c.last_error}</Text>}
      {c?.connected_at && (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
          Connected {when(c.connected_at)}{c.connected_by ? ` by ${c.connected_by}` : ''}
          {c.last_checked_at ? ` · checked ${when(c.last_checked_at)}` : ''}
        </Text>
      )}
      {blocked && <Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>{platform ? 'Waiting for API credentials on the server.' : 'Not switched on for your account yet. Contact LedgerLine support.'}</Text>}
      {live && !c && !blocked && item.auth === 'oauth2' && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>Click Connect and sign in with your {item.name} username and password. No other setup is needed.</Text>}
      {live && item.auth === 'platform' && !c && <Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>Not configured on the server yet.</Text>}
      <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {actions}
        {platform && item.docs_url && (
          <a href={item.docs_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            Docs <ExternalLink size={11} style={{ verticalAlign: -1 }} />
          </a>
        )}
      </div>
    </Card>
  );
};

/** Settings → Integrations: connect this company to Zoho Books, Tally, NetSuite, SAP, GSP, RazorpayX, WhatsApp... */
const IntegrationsPanel = () => {
  const [items, setItems] = useState([]);
  const [hasCompany, setHasCompany] = useState(true);
  const [live, setLive] = useState(false);
  const [previewing, setPreviewing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState({}); // key -> 'connect' | 'test' | 'disconnect'
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/integrations/connections');
      setItems(res?.data?.data || []);
      setHasCompany(res?.data?.has_company !== false);
      setLive(res?.data?.live === true);
      setLoadError(null);
    } catch (e) {
      setLoadError(e?.response?.data?.message || 'Could not load integrations');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category).push(item);
    }
    return [...map.entries()];
  }, [items]);

  const run = async (key, action, fn) => {
    setBusy((b) => ({ ...b, [key]: action }));
    try { await fn(); } finally { setBusy((b) => ({ ...b, [key]: null })); }
  };

  const connect = (item) => {
    // OAuth apps without extra fields go straight to the provider sign-in.
    if (item.auth === 'oauth2' && !item.fields.length) {
      return run(item.key, 'connect', async () => {
        try {
          const res = await api.post(`/integrations/connections/${item.key}/oauth/start`, { config: {} });
          window.location.assign(res.data.data.url);
          await new Promise(() => {}); // keep the spinner while the browser leaves
        } catch (e) {
          message.error(e?.response?.data?.message || 'Could not start the sign-in');
        }
      });
    }
    return setEditing(item);
  };
  const test = (item) => run(item.key, 'test', async () => {
    try {
      const res = await api.post(`/integrations/connections/${item.key}/test`, {}, { timeout: 60000 });
      message.success(res?.data?.message || 'Connection works');
    } catch (e) {
      message.error(e?.response?.data?.message || 'Connection check failed');
    }
    await load();
  });
  const disconnect = (item) => run(item.key, 'disconnect', async () => {
    try {
      await api.delete(`/integrations/connections/${item.key}`);
      message.success(`${item.name} disconnected`);
      await load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not disconnect');
    }
  });

  if (loading && !items.length) return <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>;
  if (loadError) return <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={load}>Retry</Button>} />;

  return (
    <div>
      {!live && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Integrations are coming soon"
          description="Connect options are shown for every app LedgerLine will support. Connections will be switched on once the integrations are activated; nothing is sent to these apps yet." />
      )}
      {live && !hasCompany && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Select a company to connect its apps. Integrations are set up per company." />}
      {live && ['CONNECTED', 'ERROR'].includes(items.find((i) => i.key === 'zoho_books')?.connection?.status) && <ZohoBooksSync disconnecting={busy['zoho_books'] === 'disconnect'} onDisconnect={() => disconnect(items.find((i) => i.key === 'zoho_books'))} />}
      {/* One dropdown per category; collapsed until clicked. */}
      <Collapse
        style={{ marginBottom: 16, background: 'transparent' }}
        expandIconPlacement="end"
        items={groups.map(([category, list]) => {
          const connectedCount = live ? list.filter((i) => ['CONNECTED', 'CONFIGURED'].includes(i.connection?.status)).length : 0;
          return {
            key: category,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Text strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>{category}</Text>
                <Tag style={{ margin: 0 }}>{list.length} {list.length === 1 ? 'app' : 'apps'}</Tag>
                {connectedCount > 0 && <Tag color="success" style={{ margin: 0 }}>{connectedCount} connected</Tag>}
                <Text type="secondary" style={{ fontSize: 12 }}>{list.map((i) => i.name).join(' · ')}</Text>
              </div>
            ),
            children: (
          <Row gutter={[16, 16]}>
            {list.map((item) => (
              <Col key={item.key} xs={24} md={12} xl={8}>
                <IntegrationCard
                  item={item}
                  live={live}
                  busy={busy[item.key]}
                  onConnect={() => connect(item)}
                  onPreview={() => setPreviewing(item)}
                  onTest={() => test(item)}
                  onDisconnect={() => disconnect(item)}
                />
              </Col>
            ))}
          </Row>
            ),
          };
        })}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        <Link2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
        Credentials are stored encrypted on the LedgerLine server and used only for server-to-server calls.
      </Text>
      {previewing && <PreviewModal item={previewing} onClose={() => setPreviewing(null)} />}
      {editing && <ConnectModal item={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
    </div>
  );
};

export default IntegrationsPanel;
