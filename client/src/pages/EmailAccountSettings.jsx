import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Typography } from 'antd';
import { ArrowLeft, Mail } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import EmailAccountPanel from '../components/settings/EmailAccountPanel';

const { Text } = Typography;
const ADMIN_ROLES = ['PROVIDER_ADMIN', 'DEV_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'];
const NAMES = { google: 'Google', microsoft: 'Microsoft' };

/** Settings → Email account. Also the landing page after the Google/Microsoft sign-in. */
const EmailAccountSettings = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const user = useSelector((state) => state.auth?.user);
  const isAdmin = ADMIN_ROLES.includes(String(user?.role || '').toUpperCase());
  // Read the sign-in result once, then clean the address bar.
  const [result] = useState(() => ({
    connected: params.get('mail_connected'),
    error: params.get('mail_error'),
    returnTo: (params.get('return_to') || '').startsWith('/') && !(params.get('return_to') || '').startsWith('//') ? params.get('return_to') : null,
  }));
  useEffect(() => {
    if (params.toString()) setParams({}, { replace: true });
  }, [params, setParams]);

  return (
    <div>
      <Card style={{ borderRadius: 16, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)', marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <Space size={16}>
          <div className="page-header-icon"><Mail size={24} /></div>
          <div>
            <h2 className="page-header-title">Email account</h2>
            <Text type="secondary">The mailbox your RFQs and vendor emails are sent from</Text>
          </div>
        </Space>
      </Card>

      <Card style={{ borderRadius: 16, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)', maxWidth: 860 }} styles={{ body: { padding: 24 } }}>
        {result.connected && (
          <Alert
            style={{ marginBottom: 16 }}
            type="success"
            showIcon
            message={`${NAMES[result.connected] || 'Your'} mailbox is connected`}
            description="RFQs and vendor emails you send will now come from your own email address."
            action={result.returnTo && <Button type="primary" icon={<ArrowLeft size={14} />} onClick={() => navigate(result.returnTo)}>Back to where you were</Button>}
          />
        )}
        {result.error && (
          <Alert
            style={{ marginBottom: 16 }}
            type="error"
            showIcon
            message="Mailbox not connected"
            description={result.error}
            action={result.returnTo && <Button onClick={() => navigate(result.returnTo)}>Back</Button>}
          />
        )}
        {isAdmin
          ? <EmailAccountPanel returnTo="/settings/email-account" />
          : <Alert type="info" showIcon message="Only administrators send RFQs and vendor emails" description="Ask an administrator to connect their mailbox." />}
      </Card>
    </div>
  );
};

export default EmailAccountSettings;
