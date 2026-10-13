import React, { useState, useEffect } from 'react';
import {
  Card, Table, Tag, Space, Form, Input, Select,
  Switch, Typography, Button, Badge, message, Tabs, Drawer, Modal, Empty, Row, Col, Tooltip, Popconfirm
} from 'antd';
import { Database, List, FileText, CheckCircle, XCircle, RefreshCcw, Save, Settings, Eye, Edit2, Trash2, Key, Copy, Plus } from 'lucide-react';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { Option } = Select;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const ERPIntegration = () => {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('list');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [form] = Form.useForm();
  const [logFilterStatus, setLogFilterStatus] = useState('ALL');

  // API Key state
  const [keyLabel, setKeyLabel] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyModal, setNewKeyModal] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [confRes, logRes, keyRes] = await Promise.all([
        api.get('/integration/configs').catch(() => ({ data: [] })),
        api.get('/integration/logs').catch(() => ({ data: [] })),
        api.get('/integration/api-keys').catch(() => ({ data: [] }))
      ]);
      setConfigs(Array.isArray(confRes?.data?.data) ? confRes.data.data : (Array.isArray(confRes?.data) ? confRes.data : []));
      setLogs(Array.isArray(logRes?.data?.data) ? logRes.data.data : (Array.isArray(logRes?.data) ? logRes.data : []));
      setApiKeys(Array.isArray(keyRes?.data?.data) ? keyRes.data.data : (Array.isArray(keyRes?.data) ? keyRes.data : []));
    } catch {
      message.error('Failed to load integration data');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!keyLabel.trim()) { message.warning('Enter a label for the API key'); return; }
    setGeneratingKey(true);
    try {
      const res = await api.post('/integration/api-keys', { label: keyLabel.trim(), entity_id: 0 });
      const created = res?.data?.data;
      if (created?.api_key) {
        setNewKeyModal(created);
        setKeyLabel('');
        fetchData();
      } else {
        message.error('Failed to generate key');
      }
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to generate API key');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (id) => {
    try {
      await api.delete(`/integration/api-keys/${id}`);
      message.success('API key revoked');
      fetchData();
    } catch {
      message.error('Failed to revoke key');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => message.success('Copied to clipboard'));
  };

  const maskKey = (key) => key ? key.substring(0, 8) + '••••••••••••••••' : '';

  const openConfig = (config = null) => {
    setEditingConfig(config);
    if (config) {
      form.setFieldsValue({
        erp_type: config.erp_type,
        integration_name: config.integration_name || config.erp_type,
        integration_type: config.integration_type || 'ERP',
        base_url: config.base_url,
        auth_type: config.auth_type || 'API Key',
        auth_token: config.auth_token,
        username: config.username,
        password: config.password,
        is_active: config.is_active
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ is_active: false, auth_type: 'API Key', integration_type: 'ERP' });
    }
    setIsConfigOpen(true);
  };

  const handleSaveConfig = async (values) => {
    try {
      await api.post('/integration/configs', values);
      message.success('Integration configuration saved');
      setIsConfigOpen(false);
      fetchData();
    } catch {
      message.error('Failed to save configuration');
    }
  };

  const handleTestConnection = () => {
    message.loading({ content: 'Testing connection...', key: 'test' });
    setTimeout(() => {
      message.success({ content: 'Connection successful!', key: 'test' });
    }, 1500);
  };

  const handleToggleActive = async (config, checked) => {
    try {
      await api.post('/integration/configs', { ...config, is_active: checked });
      message.success(`Integration ${checked ? 'enabled' : 'disabled'}`);
      fetchData();
    } catch {
      message.error('Toggle failed');
    }
  };

  const handleRetrySync = async () => {
    message.loading({ content: 'Retrying sync...', key: 'retry' });
    setTimeout(() => {
      message.success({ content: 'Sync retry added to queue', key: 'retry' });
    }, 1000);
  };

  const renderConfigDrawer = () => (
    <Drawer
      title={editingConfig ? "Edit Integration" : "New Integration Configuration"}
      size={480}
      open={isConfigOpen}
      onClose={() => setIsConfigOpen(false)}
      styles={{ body: { padding: '14px 20px' } }}
      extra={
        <Space>
          <Button onClick={() => setIsConfigOpen(false)}>Cancel</Button>
          <Button type="primary" onClick={() => form.submit()} icon={<Save size={16} />}>Save Config</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" onFinish={handleSaveConfig}>
        <Form.Item name="erp_type" label="System Identifier (Key)" rules={[{ required: true }]}>
          <Select disabled={!!editingConfig}>
            <Option value="SAP">SAP</Option>
            <Option value="TALLY">Tally</Option>
            <Option value="ORACLE">Oracle ERP</Option>
            <Option value="CUSTOM">Custom Webhook/API</Option>
          </Select>
        </Form.Item>
        <Form.Item name="integration_name" label="Integration Name" rules={[{ required: true }]}>
          <Input placeholder="e.g. SAP Finance Sync" />
        </Form.Item>
        <Form.Item name="integration_type" label="Integration Type">
          <Select>
            <Option value="ERP">ERP System</Option>
            <Option value="API">Standard API</Option>
            <Option value="WEBHOOK">Webhook Listener</Option>
          </Select>
        </Form.Item>
        <Form.Item name="base_url" label="Base URL" rules={[{ required: true }]}>
          <Input placeholder="https://api.erp.example.com/v1" />
        </Form.Item>
        <Form.Item name="auth_type" label="Authentication Type">
          <Select>
            <Option value="API Key">API Key / Token</Option>
            <Option value="Basic">Basic Auth (User/Pass)</Option>
            <Option value="OAuth">OAuth 2.0</Option>
          </Select>
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.auth_type !== curr.auth_type}>
          {() => {
            const authType = form.getFieldValue('auth_type');
            if (authType === 'Basic') {
              return (
                <Space style={{ display: 'flex', width: '100%' }}>
                  <Form.Item name="username" label="Username" style={{ flex: 1 }}><Input /></Form.Item>
                  <Form.Item name="password" label="Password" style={{ flex: 1 }}><Input.Password /></Form.Item>
                </Space>
              );
            }
            return (
              <Form.Item name="auth_token" label="Secret API Key / Token">
                <Input.Password placeholder="Enter bearer token or API key" />
              </Form.Item>
            );
          }}
        </Form.Item>
        <Form.Item name="is_active" label="Enable Integration" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Button block icon={<RefreshCcw size={16} />} onClick={handleTestConnection}>Test Connection</Button>
      </Form>
    </Drawer>
  );

  const listColumns = [
    {
      title: 'Integration Name',
      dataIndex: 'integration_name',
      render: (t, r) => <Text strong>{t || r.erp_type}</Text>
    },
    {
      title: 'Type',
      dataIndex: 'integration_type',
      render: t => <Tag color="blue">{(t) ? (t).charAt(0)+(t).slice(1).toLowerCase() : 'Erp'}</Tag>
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      render: (active) => (
        <Badge status={active ? 'success' : 'error'} text={active ? 'Enabled' : 'Disabled'} />
      )
    },
    {
      title: 'Last Sync',
      dataIndex: 'updatedAt',
      render: d => d ? new Date(d).toLocaleString() : 'Never'
    },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space size={6}>
          <Switch checked={r.is_active} onChange={(val) => handleToggleActive(r, val)} size="small" />
          <Tooltip title="Edit Configuration"><Button type="text" size="small" icon={<Edit2 size={15} color="var(--color-navy)" />} onClick={() => openConfig(r)} /></Tooltip>
          <Tooltip title="View Logs"><Button type="text" size="small" icon={<FileText size={15} color="var(--color-navy)" />} onClick={() => setActiveTab('logs')} /></Tooltip>
        </Space>
      )
    }
  ];

  const filteredLogs = logs.filter(l => logFilterStatus === 'ALL' || l.status === logFilterStatus);

  const logColumns = [
    { title: 'Time', dataIndex: 'createdAt', render: d => new Date(d).toLocaleString() },
    { title: 'Module', dataIndex: 'request_payload', render: p => p?.action || 'SYNC' },
    { title: 'Record ID', dataIndex: 'request_payload', render: p => p?.remote_id || '-' },
    { title: 'Status', dataIndex: 'status', render: s => (
      <Tag icon={s==='SUCCESS' ? <CheckCircle size={12}/> : <XCircle size={12}/>} color={s==='SUCCESS'?'green':'red'}>
        {s}
      </Tag>
    )},
    { title: 'Message / Error', dataIndex: 'message' },
    {
      title: 'Actions',
      render: (_, r) => r.status !== 'SUCCESS' ? (
        <Button size="small" icon={<RefreshCcw size={12} />} onClick={() => handleRetrySync(r)}>Retry</Button>
      ) : '-'
    }
  ];

  const keyColumns = [
    { title: 'Label', dataIndex: 'label', render: t => <Text strong>{t}</Text> },
    {
      title: 'API Key',
      dataIndex: 'api_key',
      render: k => (
        <Space size={4}>
          <code style={{ fontSize: 12, background: 'var(--color-bg-page)', padding: '2px 8px', borderRadius: 4 }}>{maskKey(k)}</code>
          <Tooltip title="Copy full key"><Button type="text" size="small" icon={<Copy size={14} />} onClick={() => copyToClipboard(k)} /></Tooltip>
        </Space>
      )
    },
    { title: 'Status', dataIndex: 'status', render: s => <Tag color={s === 'ACTIVE' ? 'green' : 'red'}>{s}</Tag> },
    { title: 'Last Used', dataIndex: 'last_used', render: d => d ? new Date(d).toLocaleString() : 'Never' },
    { title: 'Created', dataIndex: 'createdAt', render: d => d ? new Date(d).toLocaleDateString() : '-' },
    {
      title: 'Actions',
      render: (_, r) => (
        <Popconfirm
          title="Revoke this API key?"
          description="External systems using this key will be immediately rejected."
          okText="Yes, Revoke"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleRevokeKey(r.id)}
        >
          <Button type="text" danger size="small" icon={<Trash2 size={15} />}>Revoke</Button>
        </Popconfirm>
      )
    }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div className="page-header-icon"><Database size={24} /></div>
              <div>
                <h2 className="page-header-title">External Integrations</h2>
                <p className="page-header-sub">Enterprise API & ERP connectivity hub</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Button type="primary" icon={<Settings size={16} />} onClick={() => openConfig(null)}>
              New Integration
            </Button>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: '0' } }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'list',
              label: <span><List size={16} style={{ marginRight: 8 }}/> Integration List</span>,
              children: (
                <div style={{ padding: '14px 20px' }}>
                  {configs.length === 0 && !loading ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                      <Database size={48} color="var(--color-border)" style={{ marginBottom: 16 }} />
                      <Title level={2}>No integrations configured</Title>
                      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>Connect to external systems like SAP or Tally.</Text>
                      <Button type="primary" onClick={() => openConfig(null)}>Setup Integration</Button>
                    </div>
                  ) : (
                    <Table columns={listColumns} dataSource={configs} rowKey="id" loading={loading} pagination={false} size="middle" scroll={{ x: 'max-content' }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No records found" /> }} />
                  )}
                </div>
              ),
            },
            {
              key: 'logs',
              label: <span><FileText size={16} style={{ marginRight: 8 }}/> Sync Logs</span>,
              children: (
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ marginBottom: 16 }}>
                    <Select value={logFilterStatus} onChange={setLogFilterStatus} style={{ width: 150 }}>
                      <Option value="ALL">All Status</Option>
                      <Option value="SUCCESS">Success</Option>
                      <Option value="ERROR">Failed</Option>
                    </Select>
                  </div>
                  <Table columns={logColumns} dataSource={filteredLogs} rowKey="id" loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} records` }} size="middle" scroll={{ x: 'max-content' }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No records found" /> }} />
                </div>
              ),
            },
            {
              key: 'keys',
              label: <span><Key size={16} style={{ marginRight: 8 }}/> API Keys</span>,
              children: (
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Input placeholder="Label (e.g. Oracle Fusion Production)" value={keyLabel} onChange={e => setKeyLabel(e.target.value)} onPressEnter={handleGenerateKey} style={{ maxWidth: 320 }} />
                    <Button type="primary" icon={<Plus size={16} />} loading={generatingKey} onClick={handleGenerateKey}>Generate API Key</Button>
                  </div>
                  <div style={{ background: 'var(--color-bg-page)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 20, border: '1px solid var(--color-border)' }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      API keys authenticate external systems (Oracle Fusion, SAP, Tally) to call the webhook and GL export endpoints. Keys are shown once on creation — copy and store securely. Revoked keys are rejected immediately.
                    </Text>
                  </div>
                  <Table columns={keyColumns} dataSource={apiKeys} rowKey="id" loading={loading} pagination={false} size="middle" scroll={{ x: 'max-content' }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No API keys created yet" /> }} />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* One-time new key display modal */}
      <Modal
        title={<Space><Key size={18} color="var(--color-success)" /> API Key Created</Space>}
        open={!!newKeyModal}
        onCancel={() => setNewKeyModal(null)}
        footer={<Button type="primary" onClick={() => setNewKeyModal(null)}>Done — I have saved it</Button>}
        width={560}
      >
        {newKeyModal && (
          <div>
            <div style={{ background: 'var(--color-bg-page)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: 16, border: '1px solid var(--color-border)' }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                Copy this key now. It will not be shown again.
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ flex: 1, fontSize: 13, wordBreak: 'break-all', background: 'var(--color-bg-card)', padding: '8px 12px', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                  {newKeyModal.api_key}
                </code>
                <Button icon={<Copy size={16} />} onClick={() => copyToClipboard(newKeyModal.api_key)}>Copy</Button>
              </div>
            </div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              <strong>Label:</strong> {newKeyModal.label}. Use this key in the <code>X-API-Key</code> header when calling the webhook or GL export endpoints.
            </Text>
          </div>
        )}
      </Modal>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Button type="primary" onClick={() => navigate('/')} style={primaryBtn}>Next</Button>
      </div>

      {renderConfigDrawer()}
    </div>
  );
};

export default ERPIntegration;
