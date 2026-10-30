import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Row, Select, Space, Spin, Switch, Table, Tag, Typography, message } from 'antd';
import { RefreshCcw, Send } from 'lucide-react';
import api from '../../utils/api';

/**
 * Zoho Books sync, shown on Settings → Integrations once Zoho Books is connected: automatic sync
 * on/off, "Sync now", what has been sent (vendors, bills, payments, credits), the latest failures
 * with Zoho's message, and which Zoho account each LedgerLine cost account posts to.
 */

const { Text } = Typography;
const LABEL = {
  VENDOR: 'Vendors', BILL: 'Bills', ADVANCE: 'Advances', PAYMENT: 'Payments', SETTLEMENT: 'Marked paid',
  CREDIT: 'Return credits', DISCOUNT: 'Cash discounts', DISCOUNT_SETTLEMENT: 'Cash discounts (marked paid)'
};
const ACCOUNTS = [
  ['6800', 'Consumables & office supplies (OPEX goods)'],
  ['6350', 'Contract services (OPEX services)'],
  ['1500', 'Capital WIP / fixed assets (CAPEX)'],
  ['1200', 'Inventory (stock items)'],
  ['4100', 'Discount received (cash discounts)']
];

const ZohoBooksSync = () => {
  const [status, setStatus] = useState(null);
  const [map, setMap] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastRun, setLastRun] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, m] = await Promise.all([api.get('/integrations/zoho_books/status'), api.get('/integrations/zoho_books/mapping', { timeout: 60000 })]);
      setStatus(s.data?.data); setMap(m.data?.data);
      setDraft({ auto_sync: m.data?.data?.auto_sync, account_map: { ...(m.data?.data?.account_map || {}) }, bank_account_id: m.data?.data?.bank_account_id });
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not load Zoho Books sync');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/integrations/zoho_books/sync', {}, { timeout: 300000 });
      setLastRun(res.data?.data);
      message[res.data?.data?.failed?.length ? 'warning' : 'success'](res.data?.message || 'Sent to Zoho Books');
    } catch (e) {
      message.error(e?.response?.data?.message || 'Zoho Books sync failed');
    } finally {
      setSyncing(false);
      load();
    }
  };

  const save = async (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next); setSaving(true);
    try {
      await api.put('/integrations/zoho_books/settings', next);
      message.success('Zoho Books settings saved');
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const shown = (status?.counts || []).filter((c) => c.synced || c.failed);
  const confirmed = Boolean(map?.organization_confirmed);
  const [pickedOrg, setPickedOrg] = useState(null);
  const [refreshingOrgs, setRefreshingOrgs] = useState(false);

  // Re-reads the organisations of the connected Zoho login (e.g. after creating one in Zoho Books).
  const refreshOrgs = async () => {
    setRefreshingOrgs(true);
    try {
      await api.post('/integrations/connections/zoho_books/test', {}, { timeout: 60000 });
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not read your Zoho Books organisations');
    } finally {
      setRefreshingOrgs(false);
      load();
    }
  };
  const confirmOrg = async () => {
    await save({ organization_id: pickedOrg || map.organization_id });
    load();
  };

  return (
    <Card
      style={{ marginBottom: 16, borderRadius: 12, border: '1px solid var(--color-border)' }}
      title={<span>Zoho Books sync <Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>· vendors, approved bills and payments</Text></span>}
      extra={(
        <Space>
          <Button icon={<RefreshCcw size={14} />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<Send size={14} />} onClick={syncNow} loading={syncing} disabled={!!error || !confirmed}>Sync now</Button>
        </Space>
      )}
    >
      {loading && !status && <div style={{ textAlign: 'center', padding: 16 }}><Spin /></div>}
      {error && <Alert type="error" showIcon message={error} />}
      {status && draft && !confirmed && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Choose the Zoho Books organisation LedgerLine should send to"
          description={(
            <div>
              <div style={{ marginBottom: 8 }}>Nothing is sent until you confirm. Your Zoho login has {(map?.organizations || []).length} organisation(s):</div>
              <Space wrap>
                <Select
                  style={{ width: 360, maxWidth: '100%' }}
                  value={pickedOrg || map?.organization_id}
                  options={(map?.organizations || []).map((o) => ({ value: o.id, label: o.name }))}
                  onChange={setPickedOrg}
                />
                <Button type="primary" loading={saving} onClick={confirmOrg}>Use this organisation</Button>
                <Button loading={refreshingOrgs} onClick={refreshOrgs}>Refresh organisations</Button>
              </Space>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Not in the list? It must belong to the Zoho login you connected with. Create it in that login and click Refresh organisations, or Disconnect Zoho Books and connect again with the right login.
              </div>
            </div>
          )}
        />
      )}
      {status && draft && confirmed && (
        <>
          {(map?.organizations || []).length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Zoho Books organisation (your Zoho login has {map.organizations.length})</Text>
              <Select
                style={{ width: 360, maxWidth: '100%' }}
                value={map.organization_id}
                disabled={saving}
                options={map.organizations.map((o) => ({ value: o.id, label: o.name }))}
                onChange={async (v) => { await save({ organization_id: v }); load(); }}
              />
            </div>
          )}
          <Space wrap style={{ marginBottom: 12 }}>
            <Switch checked={draft.auto_sync !== false} loading={saving} onChange={(v) => save({ auto_sync: v })} />
            <Text>Send automatically: a bill when an invoice is approved for payment, and each payment as it is recorded</Text>
          </Space>
          <div style={{ marginBottom: 12 }}>
            {shown.length === 0
              ? <Text type="secondary">Nothing sent yet. Sync now sends every approved or paid invoice with its vendor and payments.</Text>
              : (
                <Space wrap>
                  {shown.map((c) => (
                    <Tag key={c.type} color={c.failed ? 'warning' : 'success'} style={{ marginInlineEnd: 0 }}>
                      {LABEL[c.type] || c.type}: {c.synced} sent{c.failed ? `, ${c.failed} failed` : ''}
                    </Tag>
                  ))}
                  {status.last_synced_at && <Text type="secondary" style={{ fontSize: 12 }}>Last sent {new Date(status.last_synced_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Text>}
                </Space>
              )}
          </div>
          {lastRun && lastRun.failed?.length > 0 && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`${lastRun.failed.length} item(s) were not sent`} description={lastRun.failed.slice(0, 6).join(' · ')} />
          )}
          {status.failures?.length > 0 && (
            <Table
              size="small"
              rowKey={(r) => `${r.type}-${r.local_id}`}
              pagination={false}
              style={{ marginBottom: 16 }}
              title={() => <Text strong>Not sent yet</Text>}
              dataSource={status.failures}
              columns={[
                { title: 'Record', key: 'r', width: 160, render: (_, r) => `${LABEL[r.type] || r.type} #${r.local_id}` },
                { title: 'Zoho Books said', dataIndex: 'error', key: 'e' },
              ]}
            />
          )}
          <Text strong>Account mapping</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>Which Zoho Books account each bill line posts to. Picked by name to start with; change any of them here.</Text>
          {(map?.accounts || []).length === 0 && <Empty description="No accounts came back from Zoho Books" />}
          <Row gutter={[12, 8]}>
            {ACCOUNTS.map(([code, label]) => (
              <Col xs={24} md={12} key={code}>
                <Text type="secondary" style={{ fontSize: 12 }}>{code} · {label}</Text>
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  placeholder="Choose a Zoho Books account"
                  value={draft.account_map?.[code] || undefined}
                  options={(map?.accounts || []).map((a) => ({ value: a.id, label: `${a.name} (${a.type})` }))}
                  onChange={(v) => save({ account_map: { ...draft.account_map, [code]: v } })}
                />
              </Col>
            ))}
            <Col xs={24} md={12}>
              <Text type="secondary" style={{ fontSize: 12 }}>1010 · Bank account payments are made from</Text>
              <Select
                style={{ width: '100%' }}
                placeholder="Choose a Zoho Books bank account"
                value={draft.bank_account_id || undefined}
                options={(map?.banks || []).map((b) => ({ value: b.id, label: b.name }))}
                onChange={(v) => save({ bank_account_id: v })}
              />
            </Col>
          </Row>
        </>
      )}
    </Card>
  );
};

export default ZohoBooksSync;
