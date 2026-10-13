import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Typography, Descriptions, Button, Form,
  Input, Space, Tag, Spin, message, Divider
} from 'antd';
import { User, Edit2, Save, X, Shield, BadgeCheck } from 'lucide-react';
import { useSelector } from 'react-redux';
import api from '../utils/api';

const { Title, Text } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

const ROLE_COLOR = {
  PROVIDER_ADMIN: 'purple',
  SUPER_ADMIN: 'red',
  CLIENT_ADMIN: 'blue',
  FINANCE: 'cyan',
  PROCUREMENT: 'orange',
  AUDITOR: 'gold',
  REQUESTER: 'default',
  MAINTENANCE: 'green',
};

const MyProfile = () => {
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);

  const storeUser = useSelector((s) => s.auth?.user);
  const userId = storeUser?.id || JSON.parse(localStorage.getItem('user') || '{}')?.id;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    api.get(`/users/${userId}`)
      .then((res) => {
        const data = res?.data?.data || res?.data || {};
        setProfile(data);
      })
      .catch(() => {
        message.error('Failed to load profile data');
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        setProfile(stored);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const fullName = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
    : '';

  const roleCode = profile?.Role?.code || profile?.role || storeUser?.role || '';
  const roleName = profile?.Role?.name || roleCode;
  const clientName =
    profile?.Client?.client_name ||
    profile?.client_name ||
    localStorage.getItem('client_name') ||
    (roleCode === 'PROVIDER_ADMIN' ? 'All Tenants (Provider)' : '-');

  const startEdit = () => {
    form.setFieldsValue({
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      email: profile?.email || '',
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); form.resetFields(); };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const res = await api.put(`/users/${userId}`, {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email.trim(),
      });
      const updated = res?.data?.data || res?.data || {};
      setProfile((prev) => ({ ...prev, ...updated }));
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({
        ...stored,
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        email: values.email.trim(),
      }));
      message.success('Profile updated successfully');
      setEditing(false);
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div className="page-header-icon"><User size={24}  /></div>
              <div>
                <h2 className="page-header-title">
                  {fullName || profile?.username || 'My Profile'}
                </h2>
                <Space size={6} style={{ marginTop: 2 }}>
                  <p className="page-header-sub">
                    {profile?.email || '—'}
                  </p>
                  {roleCode && (
                    <Tag color={ROLE_COLOR[roleCode] || 'default'} style={{ fontSize: 10 }}>
                      {roleName}
                    </Tag>
                  )}
                </Space>
              </div>
            </Space>
          </Col>
          <Col>
            {!editing ? (
              <Button icon={<Edit2 size={14} />} type="primary" style={{ ...primaryBtn, height: 34 }} onClick={startEdit}>
                Edit Profile
              </Button>
            ) : (
              <Space>
                <Button icon={<X size={14} />} style={{ height: 34, borderRadius: 'var(--radius-md)' }} onClick={cancelEdit}>Cancel</Button>
                <Button icon={<Save size={14} />} type="primary" style={{ ...primaryBtn, height: 34 }} loading={saving} onClick={() => form.submit()}>
                  Save Changes
                </Button>
              </Space>
            )}
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <BadgeCheck size={14} color="var(--color-orange)" />
                <Text strong style={{ fontSize: 14 }}>{editing ? 'Edit Profile' : 'Profile Details'}</Text>
              </Space>
            }
            style={contentCard}
            styles={{ body: { padding: '16px' } }}
          >
            {editing ? (
              <Form form={form} layout="vertical" onFinish={handleSave}>
                <Row gutter={[16, 0]}>
                  <Col xs={24} md={12}>
                    <Form.Item name="first_name" label="First Name" rules={[{ required: true, message: 'First name is required' }]}>
                      <Input placeholder="First name" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="last_name" label="Last Name" rules={[{ required: true, message: 'Last name is required' }]}>
                      <Input placeholder="Last name" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="email" label="Email Address" rules={[{ required: true, message: 'Email is required' }, { type: 'email', message: 'Enter a valid email' }]}>
                      <Input placeholder="email@example.com" />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            ) : (
              <Descriptions column={{ xs: 1, sm: 2 }} size="middle">
                <Descriptions.Item label="First Name">{profile?.first_name || <Text type="secondary">—</Text>}</Descriptions.Item>
                <Descriptions.Item label="Last Name">{profile?.last_name || <Text type="secondary">—</Text>}</Descriptions.Item>
                <Descriptions.Item label="Email Address">{profile?.email || <Text type="secondary">—</Text>}</Descriptions.Item>
                <Descriptions.Item label="Username">{profile?.username || <Text type="secondary">—</Text>}</Descriptions.Item>
                <Descriptions.Item label="Employee ID">{profile?.employee_id || <Text type="secondary">—</Text>}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={profile?.status === 'ACTIVE' ? 'success' : 'default'}>{profile?.status || '—'}</Tag>
                </Descriptions.Item>
              </Descriptions>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <Shield size={14} color="var(--color-orange)" />
                <Text strong style={{ fontSize: 14 }}>Access &amp; Permissions</Text>
              </Space>
            }
            style={contentCard}
            styles={{ body: { padding: '16px' } }}
          >
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <div>
                <Text style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Role</Text>
                <Tag color={ROLE_COLOR[roleCode] || 'default'} style={{ fontSize: 13, padding: '2px 10px' }}>
                  {roleName || '—'}
                </Tag>
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <div>
                <Text style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                  Organisation / Client
                </Text>
                <Text style={{ fontSize: 14, fontWeight: 500 }}>{clientName}</Text>
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <div>
                <Text style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Account Status</Text>
                <Tag color={profile?.status === 'ACTIVE' ? 'success' : 'warning'}>{profile?.status || '—'}</Tag>
              </div>
              {(profile?.Entity?.entity_name || profile?.entity_name) && (
                <>
                  <Divider style={{ margin: '4px 0' }} />
                  <div>
                    <Text style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Entity</Text>
                    <Text style={{ fontSize: 14 }}>{profile?.Entity?.entity_name || profile?.entity_name}</Text>
                  </div>
                </>
              )}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MyProfile;
