import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Form, Input, Select, Switch, Space, Tag, message, Empty, Descriptions, Alert } from 'antd';
import { SaveOutlined, ReloadOutlined, DeleteOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';

const PROVIDERS = ['AZURE_AD','OKTA','GOOGLE','SAML_GENERIC','OIDC_GENERIC'];

const SSOConfiguration = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/sso/config');
      const raw = res.data?.data;
      const data = Array.isArray(raw) ? raw[0] || null : raw;
      setConfig(data);
      if (data) form.setFieldsValue(data);
    } catch (err) {
      // fetch failed silently
    }
    setLoading(false);
  }, [form]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (values) => {
    setSubmitting(true);
    try {
      await api.post('/sso/config', values);
      message.success('SSO configuration saved');
      fetchConfig();
    } catch (err) {
      message.error(err.response?.data?.message || 'Save failed');
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    try {
      await api.delete('/sso/config/' + (config?.id || ''));
      message.success('SSO config removed');
      setConfig(null);
      form.resetFields();
    } catch (err) {
      message.error('Delete failed');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="SSO Configuration" subtitle="Single Sign-On with SAML / OIDC" />
      <Alert type="info" message="Configure your Identity Provider (IdP) to enable SSO login for your organization." style={{ marginBottom: 16 }} />
      <Card>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ maxWidth: 600 }}>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select placeholder="Select provider">
              {PROVIDERS.map(p => (<Select.Option key={p} value={p}>{p.replace(/_/g, ' ')}</Select.Option>))}
            </Select>
          </Form.Item>
          <Form.Item name="is_enabled" label="Enabled" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="entity_id" label="Entity ID / Issuer"><Input /></Form.Item>
          <Form.Item name="sso_url" label="SSO URL"><Input /></Form.Item>
          <Form.Item name="certificate" label="Certificate (PEM)"><Input.TextArea rows={4} /></Form.Item>
          <Form.Item name="client_oidc_id" label="OIDC Client ID"><Input /></Form.Item>
          <Form.Item name="client_oidc_secret" label="OIDC Client Secret"><Input.Password /></Form.Item>
          <Form.Item name="metadata_url" label="Metadata URL"><Input /></Form.Item>
          <Form.Item name="default_role" label="Default Role for New Users" initialValue="REQUESTER">
            <Select>
              {['REQUESTER', 'OPERATOR', 'ADMIN'].map(r => (<Select.Option key={r} value={r}>{r}</Select.Option>))}
            </Select>
          </Form.Item>
          <Form.Item name="auto_provision" label="Auto-Provision Users" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={submitting}>Save Configuration</Button>
            <Button icon={<ReloadOutlined />} onClick={fetchConfig}>Refresh</Button>
            {config && <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>Remove SSO</Button>}
          </Space>
        </Form>
      </Card>
    </div>
  );
};

export default SSOConfiguration;
