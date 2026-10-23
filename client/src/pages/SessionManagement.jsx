import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Form, InputNumber, Input, Space, Tag, message, Empty, Card, Row, Col, Statistic, Popconfirm, Alert } from 'antd';
import { ReloadOutlined, StopOutlined, SaveOutlined, UserOutlined, ClockCircleOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';

const SessionManagement = () => {
  const [sessions, setSessions] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/sessions/active');
      setSessions(res.data?.data || []);
    } catch { message.error('Failed to load sessions'); }
    setLoading(false);
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get('/sessions/config');
      const data = res.data?.data || {};
      setConfig(data);
      form.setFieldsValue(data);
    } catch {}
  }, [form]);

  useEffect(() => { fetchSessions(); fetchConfig(); }, []);

  const revokeSession = async (id) => {
    try { await api.delete(`/sessions/${id}`); message.success('Session revoked'); fetchSessions(); }
    catch { message.error('Revoke failed'); }
  };

  const revokeAll = async () => {
    try { await api.delete('/sessions'); message.success('All sessions revoked'); fetchSessions(); }
    catch { message.error('Failed'); }
  };

  const saveConfig = async (values) => {
    setSaving(true);
    try { await api.put('/sessions/config', values); message.success('Config saved'); fetchConfig(); }
    catch (err) { message.error(err.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const activeSessions = sessions.filter(s => s.is_active);

  const columns = [
    { title: 'User ID', dataIndex: 'user_id', width: 80 },
    { title: 'IP Address', dataIndex: 'ip_address', width: 140 },
    { title: 'User Agent', dataIndex: 'user_agent', ellipsis: true },
    { title: 'Created', dataIndex: 'created_at', width: 170, render: v => v ? new Date(v).toLocaleString('en-IN') : '—' },
    { title: 'Expires', dataIndex: 'expires_at', width: 170, render: v => v ? new Date(v).toLocaleString('en-IN') : '—' },
    { title: 'Active', dataIndex: 'is_active', width: 80, render: v => <Tag color={v ? 'green' : 'red'}>{v ? 'Yes' : 'No'}</Tag> },
    { title: 'Actions', key: 'actions', width: 100, render: (_, r) => r.is_active ? (
      <Popconfirm title="Revoke session?" onConfirm={() => revokeSession(r.id)} okText="Yes" okButtonProps={{ danger: true }}>
        <Button size="small" danger icon={<StopOutlined />}>Revoke</Button>
      </Popconfirm>
    ) : null }
  ];

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Session Management" subtitle="Active sessions & security controls" />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card><Statistic title="Active Sessions" value={activeSessions.length} prefix={<UserOutlined />} /></Card></Col>
        <Col span={8}><Card><Statistic title="Idle Timeout" value={config.idle_timeout_minutes || 30} suffix="min" prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col span={8}><Card><Statistic title="Max Concurrent" value={config.max_concurrent_sessions || 5} /></Card></Col>
      </Row>

      <Card title="Session Policy" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={saveConfig}>
          <Form.Item name="idle_timeout_minutes" label="Idle Timeout (min)"><InputNumber min={5} max={1440} /></Form.Item>
          <Form.Item name="max_concurrent_sessions" label="Max Concurrent"><InputNumber min={1} max={50} /></Form.Item>
          <Form.Item name="ip_whitelist" label="IP Whitelist"><Input placeholder="Comma-separated IPs" style={{ width: 250 }} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>Save</Button></Form.Item>
        </Form>
      </Card>

      <Card title="Active Sessions" extra={
        <Space>
          <Popconfirm title="Revoke all sessions?" onConfirm={revokeAll} okText="Yes" okButtonProps={{ danger: true }}>
            <Button danger>Revoke All</Button>
          </Popconfirm>
          <Button icon={<ReloadOutlined />} onClick={fetchSessions}>Refresh</Button>
        </Space>
      }>
        <Table columns={columns} dataSource={sessions} rowKey="id" loading={loading} scroll={{ x: 'max-content' }}
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], showTotal: t => `Total ${t}` }}
          locale={{ emptyText: <Empty description="No active sessions" /> }} />
      </Card>
    </div>
  );
};

export default SessionManagement;
