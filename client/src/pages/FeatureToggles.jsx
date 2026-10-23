import React, { useState, useEffect, useCallback } from 'react';
import { Table, Switch, Card, Tag, message, Space, Button, Row, Col, Select, Alert } from 'antd';
import { Settings2, Users, ArrowLeft, RefreshCcw } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { safeApiCall } from '../utils/safeApiCall';

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const MODULE_COLORS = {
  PROCUREMENT: 'blue', FINANCE: 'purple', ASSET: 'green',
  AUDIT: 'orange', REPORTS: 'cyan', SYSTEM: 'default',
  INVENTORY: 'gold', ALERTS: 'red', REQUEST: 'geekblue',
  PROPERTY: 'lime', CLIENT: 'magenta'
};

const FeatureToggles = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState({});
  const [clients, setClients] = useState([]);

  // Pre-select client if navigated from ClientOnboarding
  const stateClientId = location.state?.client_id || null;
  const stateClientName = location.state?.client_name || null;
  const [selectedClientId, setSelectedClientId] = useState(stateClientId);

  // Detect if current user is PROVIDER_ADMIN
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isProviderAdmin = user.role === 'PROVIDER_ADMIN' || user.role === 'DEV_ADMIN';

  const fetchClients = useCallback(async () => {
    if (!isProviderAdmin) return;
    const res = await safeApiCall(() => api.get('/clients-management/clients'));
    const list = res?.data || res;
    setClients(Array.isArray(list) ? list : []);
  }, [isProviderAdmin]);

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedClientId ? { client_id: selectedClientId } : {};
      const res = await api.get('/system/features', { params });
      const list = res.data?.data || res.data || [];
      setFeatures(Array.isArray(list) ? list : []);
    } catch {
      message.error('Failed to load features');
    } finally {
      setLoading(false);
    }
  }, [selectedClientId]);

  useEffect(() => { fetchClients(); }, [fetchClients]);
  useEffect(() => { fetchFeatures(); }, [fetchFeatures]);

  const handleToggle = async (featureKey, newVal) => {
    setToggling(t => ({ ...t, [featureKey]: true }));
    try {
      await api.put('/system/features/' + featureKey, {
        is_enabled: newVal,
        client_id: selectedClientId || null
      });
      message.success('Feature ' + (newVal ? 'enabled' : 'disabled'));
      fetchFeatures();
    } catch (err) {
      message.error(err.response?.data?.message || 'Update failed');
    } finally {
      setToggling(t => ({ ...t, [featureKey]: false }));
    }
  };

  const selectedClientName = clients.find(c => c.id === selectedClientId)?.client_name
    || stateClientName
    || 'Global Default';

  const columns = [
    {
      title: 'Feature',
      dataIndex: 'feature_name',
      key: 'feature_name',
      render: (name, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{r.feature_key}</div>
        </div>
      )
    },
    {
      title: 'Module',
      dataIndex: 'module',
      key: 'module',
      width: 140,
      render: (m) => <Tag color={MODULE_COLORS[m] || 'default'}>{m}</Tag>
    },
    {
      title: 'Scope',
      key: 'scope',
      width: 110,
      render: (_, r) => r._source === 'client'
        ? <Tag color="orange">Per-Client</Tag>
        : <Tag color="default">Global</Tag>
    },
    {
      title: 'Status',
      key: 'enabled',
      width: 120,
      render: (_, r) => (
        <Switch
          checked={!!r.is_enabled}
          loading={!!toggling[r.feature_key]}
          onChange={(val) => handleToggle(r.feature_key, val)}
          checkedChildren="ON"
          unCheckedChildren="OFF"
        />
      )
    }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div style={iconBadge('var(--gradient-navy)')}><Settings2 size={18} color="#fff" /></div>
              <div>
                <h2 className="page-header-title">Feature Toggles</h2>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Enable or disable modules per client</div>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              {stateClientId && (
                <Button icon={<ArrowLeft size={14} />} onClick={() => navigate('/clients/onboarding')}>
                  Back to Clients
                </Button>
              )}
              <Button icon={<RefreshCcw size={16} />} onClick={fetchFeatures}>Refresh</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {isProviderAdmin && (
        <Card style={{ ...contentCard, marginBottom: 16 }} styles={{ body: { padding: '16px 20px' } }}>
          <Row align="middle" gutter={16}>
            <Col>
              <Space align="center">
                <Users size={16} color="var(--color-navy)" />
                <span style={{ fontWeight: 600, fontSize: 13 }}>Configure for:</span>
              </Space>
            </Col>
            <Col flex="auto" style={{ maxWidth: 360 }}>
              <Select
                style={{ width: '100%' }}
                placeholder="Global Default (applies to all clients)"
                allowClear
                value={selectedClientId}
                onChange={(val) => setSelectedClientId(val || null)}
                options={[
                  { value: null, label: 'Global Default (all clients)' },
                  ...clients.map(c => ({ value: c.id, label: c.client_name }))
                ]}
              />
            </Col>
          </Row>
          {selectedClientId ? (
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message={'Showing feature overrides for: ' + selectedClientName + '. Toggles here override the global default for this client only.'}
            />
          ) : (
            <Alert
              style={{ marginTop: 12 }}
              type="warning"
              showIcon
              message="You are editing the Global Default. Changes apply to all clients that have no per-client override."
            />
          )}
        </Card>
      )}

      <Card style={contentCard} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={features}
          loading={loading}
          rowKey="feature_key"
          size="middle"
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'No features configured' }}
        />
      </Card>
    </div>
  );
};

export default FeatureToggles;
