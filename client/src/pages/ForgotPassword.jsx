import React, { useState } from 'react';
import { Card, Typography, Space, Alert } from 'antd';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BaseButton from '../components/base/BaseButton';
import BaseInput from '../components/base/BaseInput';
import Logo from '../components/base/Logo';
import api from '../utils/api';

const { Title, Text } = Typography;

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!email) return setError('Please enter your email address');

    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to request password reset');
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
          <Title level={2} style={{ marginBottom: 8,  color: 'var(--color-text-primary)' }}>Forgot Credentials?</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
            Enter your email and we'll send you a link to recover your credentials.
          </Text>

          {success ? (
            <Alert
              message="Reset Link Sent"
              description="If this email is registered, you will receive a reset link shortly. Check your inbox."
              type="success"
              showIcon
              style={{ marginBottom: 24 }}
            />
          ) : (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {error && <Alert message={error} type="error" showIcon />}

              <div>
                <Text strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>Email Address</Text>
                <BaseInput
                  prefix={<Mail size={16} />}
                  placeholder="name@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ marginTop: 8 }}
                />
              </div>

              <BaseButton
                type="primary"
                block
                loading={loading}
                icon={<Send size={16} />}
                onClick={handleSubmit}
                style={{ height: 48, marginTop: 8, background: 'var(--gradient-orange)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 'var(--weight-medium)', boxShadow: 'var(--shadow-btn-primary)' }}
              >
                Send Reset Link
              </BaseButton>
            </Space>
          )}

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <BaseButton
              type="link"
              icon={<ArrowLeft size={16} />}
              onClick={() => navigate('/login')}
              style={{ color: 'var(--color-text-muted)' }}
            >
              Back to Login
            </BaseButton>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
