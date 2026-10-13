import React, { useState } from 'react';
import {
  Card, Row, Col, Typography, Space, Button, Form, Input,
  Tag, Divider, message, Alert
} from 'antd';
import {
  ShieldCheck, Lock, LogOut, KeyRound, ShieldAlert, RefreshCcw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store/authSlice';
import api from '../utils/api';

const { Title, Text } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)', marginBottom: 16 };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

const SecuritySettings = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [pwForm] = Form.useForm();
  const [changingPw, setChangingPw] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const storeUser = useSelector((s) => s.auth?.user);
  const roleCode = storeUser?.role || JSON.parse(localStorage.getItem('user') || '{}')?.role || '';
  const username = storeUser?.username || JSON.parse(localStorage.getItem('user') || '{}')?.username || '';
  const mfaEnabled = storeUser?.mfa_enabled ?? false;

  const handleChangePassword = async (values) => {
    if (values.new_password !== values.confirm_password) {
      message.error('New passwords do not match');
      return;
    }
    setChangingPw(true);
    try {
      await api.post('/auth/change-password', {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      message.success('Password changed successfully. Please log in again.');
      pwForm.resetFields();
      setTimeout(() => {
        dispatch(logout());
        navigate('/login');
      }, 1500);
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  const handleRelogin = async () => {
    setLoggingOut(true);
    try {
      await dispatch(logout());
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>

      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Space align="center" size={12}>
          <div className="page-header-icon"><ShieldCheck size={24}  /></div>
          <div>
            <h2 className="page-header-title">Security Settings</h2>
            <p className="page-header-sub">
              Manage your account password, session, and authentication preferences
            </p>
          </div>
        </Space>
      </Card>

      <Row gutter={[16, 0]}>
        <Col xs={24} lg={14}>

          <Card
            style={contentCard}
            title={
              <Space>
                <Lock size={15} color="var(--color-orange)" />
                <Text strong style={{ fontSize: 14 }}>Change Password</Text>
              </Space>
            }
            styles={{ body: { padding: '14px 20px' } }}
          >
            <Form
              form={pwForm}
              layout="vertical"
              onFinish={handleChangePassword}
            >
              <Form.Item
                name="current_password"
                label="Current Password"
                rules={[{ required: true, message: 'Enter your current password' }]}
              >
                <Input.Password placeholder="Current password" />
              </Form.Item>
              <Form.Item
                name="new_password"
                label="New Password"
                rules={[
                  { required: true, message: 'Enter a new password' },
                  { min: 8, message: 'Password must be at least 8 characters' },
                ]}
              >
                <Input.Password placeholder="New password (min 8 characters)" />
              </Form.Item>
              <Form.Item
                name="confirm_password"
                label="Confirm New Password"
                rules={[{ required: true, message: 'Confirm your new password' }]}
              >
                <Input.Password placeholder="Confirm new password" />
              </Form.Item>
              <Row justify="end">
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={changingPw}
                  style={primaryBtn}
                  icon={<KeyRound size={14} />}
                >
                  Update Password
                </Button>
              </Row>
            </Form>
          </Card>

          <Card
            style={contentCard}
            title={
              <Space>
                <RefreshCcw size={16} color="var(--color-orange)" />
                <Text strong style={{ fontSize: 14 }}>Session Management</Text>
              </Space>
            }
            styles={{ body: { padding: '20px 24px' } }}
          >
            <Alert
              type="info"
              showIcon
              message="Signing out will end your current session and require you to log in again."
              style={{ marginBottom: 16 }}
            />
            <Button
              icon={<LogOut size={14} />}
              onClick={handleRelogin}
              loading={loggingOut}
            >
              Sign Out & Re-login
            </Button>
          </Card>

        </Col>

        <Col xs={24} lg={10}>
          <Card
            style={contentCard}
            title={
              <Space>
                <ShieldAlert size={15} color="var(--color-orange)" />
                <Text strong style={{ fontSize: 14 }}>Account Security</Text>
              </Space>
            }
            styles={{ body: { padding: '20px 24px' } }}
          >
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <div>
                <Text style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Username</Text>
                <Text style={{ fontSize: 14, fontWeight: 500 }}>{username || '—'}</Text>
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <div>
                <Text style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>Role</Text>
                <Tag color="purple" style={{ fontSize: 13, padding: '2px 10px' }}>{roleCode || '—'}</Tag>
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <div>
                <Text style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                  Two-Factor Authentication (MFA)
                </Text>
                <Tag color={mfaEnabled ? 'success' : 'warning'}>
                  {mfaEnabled ? 'Enabled' : 'Not Enabled'}
                </Tag>
                {!mfaEnabled && (
                  <Text style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
                    Contact your administrator to enable MFA for enhanced account security.
                  </Text>
                )}
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <div>
                <Text style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                  Password Policy
                </Text>
                <Space direction="vertical" size={2}>
                  <Text style={{ fontSize: 12 }}>• Minimum 8 characters</Text>
                  <Text style={{ fontSize: 12 }}>• Mixed case + numbers recommended</Text>
                  <Text style={{ fontSize: 12 }}>• Do not reuse previous passwords</Text>
                </Space>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SecuritySettings;
