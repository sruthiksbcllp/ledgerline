import React, { useState } from 'react';
import { Card, Typography, Space, Alert, message } from 'antd';
import { Lock, CheckCircle, ArrowRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BaseButton from '../components/base/BaseButton';
import BaseInput from '../components/base/BaseInput';
import Logo from '../components/base/Logo';
import api from '../utils/api';

const { Title, Text } = Typography;

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');

  const handleSubmit = async () => {
    if (!token) return setError('Invalid or missing reset token');
    if (!password) return setError('Please enter a new password');
    if (password !== confirmPassword) return setError('Passwords do not match');
    if (password.length < 6) return setError('Password must be at least 6 characters');

    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
      message.success('Password reset successfully');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-page)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Logo dark fontSize="24px" />
        </div>

        <Card bordered={false} style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }} styles={{ body: { padding: '24px' } }}>
          <Title level={2} style={{ marginBottom: 8,  color: 'var(--color-text-primary)' }}>Reset Credentials</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
            Create new secure credentials for your account.
          </Text>

          {success ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircle size={64} color="var(--color-success)" style={{ marginBottom: 16 }} />
              <Title level={2} style={{ color: 'var(--color-text-primary)' }}>Success!</Title>
              <Text type="secondary">Your credentials have been reset. Redirecting to login...</Text>
              <BaseButton type="primary" block onClick={() => navigate('/login')} style={{ marginTop: 24, background: 'var(--gradient-orange)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 'var(--weight-medium)' }}>
                Login Now
              </BaseButton>
            </div>
          ) : (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {error && <Alert message={error} type="error" showIcon />}
              {!token && <Alert message="Warning" description="No reset token found in URL. This request may fail." type="warning" showIcon />}

              <div>
                <Text strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>New Password</Text>
                <BaseInput.Password
                  prefix={<Lock size={16} />}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ marginTop: 8 }}
                />
              </div>

              <div>
                <Text strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>Confirm Password</Text>
                <BaseInput.Password
                  prefix={<Lock size={16} />}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  style={{ marginTop: 8 }}
                />
              </div>

              <BaseButton
                type="primary"
                block
                loading={loading}
                icon={<ArrowRight size={18} />}
                onClick={handleSubmit}
                style={{ height: 48, marginTop: 8, background: 'var(--gradient-orange)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 'var(--weight-medium)', boxShadow: 'var(--shadow-btn-primary)' }}
              >
                Reset Password
              </BaseButton>
            </Space>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
