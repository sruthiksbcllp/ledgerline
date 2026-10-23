import React, { useEffect, useMemo, useState } from 'react';
import { Form, Typography, Space, Alert, Button, Checkbox, ConfigProvider, Input, Select, message } from 'antd';
import { 
  User, Lock, ArrowRight, KeyRound, CheckCircle, 
  ShieldCheck, Tag, BarChart3, Shield 
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import {
  login, clearError, verifyMfa, clearMfaState,
  requestMfaChallenge, startMfaEnrollment, completeMfaEnrollment
} from '../store/authSlice';
import { useNavigate, Navigate } from 'react-router-dom';
import Logo from '../components/base/Logo';
import api from '../utils/api';
import './Login.css';

const { Text } = Typography;

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaAttempts, setMfaAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [resendRemaining, setResendRemaining] = useState(0);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [registerRoles, setRegisterRoles] = useState([]);
  const [registerLoading, setRegisterLoading] = useState(false);
  // { valid, public_domain, joins_existing } for the email typed into the sign-up form
  const [registerCompany, setRegisterCompany] = useState(null);
  const [registerForm] = Form.useForm();

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const {
    isAuthenticated, error, mfaRequired, pendingUsername, resendCooldownSeconds,
    mfaSetupRequired, setupToken, qrCodeDataUrl, manualEntryKey, mfaMethod
  } = useSelector((state) => state.auth);

  const MAX_MFA_ATTEMPTS = 5;
  const isLocked = useMemo(() => Boolean(lockedUntil && nowTs < lockedUntil), [lockedUntil, nowTs]);

  useEffect(() => {
    if (!lockedUntil) return undefined;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  useEffect(() => {
    if (resendRemaining <= 0) return undefined;
    const t = setInterval(() => setResendRemaining((p) => (p > 0 ? p - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendRemaining]);

  useEffect(() => {
    if (mfaRequired && resendRemaining === 0) setResendRemaining(resendCooldownSeconds || 30);
  }, [mfaRequired, resendCooldownSeconds, resendRemaining]);

  useEffect(() => {
    if (mfaRequired && mfaSetupRequired && setupToken && !qrCodeDataUrl) {
      dispatch(startMfaEnrollment({ setupToken }));
    }
  }, [mfaRequired, mfaSetupRequired, setupToken, qrCodeDataUrl, dispatch]);

  useEffect(() => {
    if (!showRegister || registerRoles.length) return undefined;
    api.get('/auth/register-roles')
      .then((res) => {
        const data = res?.data?.data || [];
        setRegisterRoles(Array.isArray(data) ? data : []);
      })
      .catch(() => setRegisterRoles([]));
    return undefined;
  }, [showRegister, registerRoles.length]);

  const lookupRegisterCompany = async () => {
    const email = registerForm.getFieldValue('email');
    if (!email) {
      setRegisterCompany(null);
      return;
    }
    try {
      const res = await api.get('/auth/register-company', { params: { email } });
      const data = res?.data?.data || null;
      setRegisterCompany(data?.valid ? data : null);
      if (data?.joins_existing && registerForm.getFieldValue('role_code') === 'ADMIN') {
        registerForm.setFieldValue('role_code', undefined);
      }
    } catch {
      setRegisterCompany(null);
    }
  };

  // First sign-up from a company becomes its Admin, so no role choice is needed.
  const registerStartsCompany = Boolean(registerCompany && !registerCompany.joins_existing);
  const registerRoleOptions = registerRoles
    .filter((role) => !(registerCompany?.joins_existing && role.code === 'ADMIN'))
    .map((role) => ({ value: role.code, label: role.name }));

  const onRegister = async (values) => {
    setRegisterLoading(true);
    try {
      const payload = registerStartsCompany ? { ...values, role_code: 'ADMIN' } : values;
      const res = await api.post('/auth/register', payload);
      message.success(res?.data?.message || 'Account created. Sign in with your username.');
      setShowRegister(false);
      setRegisterCompany(null);
      registerForm.resetFields();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not create the account');
    } finally {
      setRegisterLoading(false);
    }
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  const onFinish = async (values) => {
    setLoading(true);
    const result = await dispatch(login(values));
    setLoading(false);
    if (login.fulfilled.match(result) && !result.payload?.mfaRequired) navigate('/');
  };

  const onMfaFinish = async (values) => {
    if (isLocked) return;
    setMfaLoading(true);
    const result = mfaSetupRequired
      ? await dispatch(completeMfaEnrollment({ setupToken, otp: values.otp }))
      : await dispatch(verifyMfa({ username: pendingUsername, otp: values.otp }));
    setMfaLoading(false);
    if (verifyMfa.fulfilled.match(result) || completeMfaEnrollment.fulfilled.match(result)) {
      localStorage.setItem('trusted_device', trustedDevice ? '1' : '0');
      navigate('/');
      return;
    }
    const next = mfaAttempts + 1;
    setMfaAttempts(next);
    if (next >= MAX_MFA_ATTEMPTS) setLockedUntil(Date.now() + 5 * 60 * 1000);
  };

  const handleResend = async () => {
    if (resendRemaining > 0 || !pendingUsername) return;
    const result = await dispatch(requestMfaChallenge({ username: pendingUsername }));
    if (requestMfaChallenge.fulfilled.match(result)) setResendRemaining(result.payload?.resendCooldownSeconds || 30);
  };

  const featuresList = [
    { icon: <Tag size={18} />, text: 'Compliance-ready fixed asset register' },
    { icon: <BarChart3 size={18} />, text: 'Audit-grade reporting and trail' },
    { icon: <ShieldCheck size={18} />, text: 'Enterprise-grade security and MFA' }
  ];

  return (
    <div className="login-root">
      <div className="login-card">
        {/* ══ LEFT — Hero panel ══ */}
        <div className="login-hero">
          <div className="login-hero-bg" />
          <div className="login-hero-overlay" />

          <div className="login-hero-content">
            <div className="login-hero-logo">
              <Logo vertical size="80px" fontSize="38px" subFontSize="14px" />
            </div>

            <div className="login-hero-sep" />

            <h2 className="login-hero-headline">
              Asset Intelligence for<br />
              <em>Audit-Ready</em> Organisations
            </h2>

            <Text className="login-hero-sub">
              The definitive platform for fixed asset management,
              compliance, and corporate audit excellence.
            </Text>

            <div className="login-features">
              {featuresList.map(({ icon, text }) => (
                <div key={text} className="login-feature-item">
                  <div className="login-feature-icon">{icon}</div>
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{text}</Text>
                </div>
              ))}
            </div>
          </div>

          <div className="login-hero-badge">
            <div className="login-hero-badge-dot" />
            <span className="login-hero-badge-text">All systems operational</span>
          </div>
        </div>

        {/* ══ RIGHT — Form panel ══ */}
        <div className="login-form-panel">
          <div className="login-form-inner">
            <div style={{ marginBottom: 48 }}>
              <Logo dark size="44px" fontSize="24px" subFontSize="11px" />
            </div>

            {!mfaRequired ? (
              showRegister ? (
              <Form form={registerForm} layout="vertical" onFinish={onRegister} requiredMark>
                <div className="login-form-greeting">Create an account</div>
                <h2 className="login-form-title">{registerStartsCompany ? 'Set up your company' : 'Choose your role'}</h2>
                <Form.Item name="first_name" label="First name" rules={[{ required: true, message: 'Enter your first name' }]}>
                  <Input placeholder="First name" />
                </Form.Item>
                <Form.Item name="last_name" label="Last name" rules={[{ required: true, message: 'Enter your last name' }]}>
                  <Input placeholder="Last name" />
                </Form.Item>
                <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
                  <Input placeholder="name@company.com" onBlur={lookupRegisterCompany} />
                </Form.Item>
                {registerCompany?.joins_existing && (
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Your company is already on LedgerLine"
                    description="You will join it and see its shared data according to your role. Admin access is granted by your company admin."
                  />
                )}
                {registerStartsCompany && (
                  <Alert
                    type="success"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={registerCompany.public_domain ? 'You will get a private workspace' : 'You will create your company workspace'}
                    description={registerCompany.public_domain
                      ? 'Personal email addresses are not shared with anyone else. You will be its Admin.'
                      : 'You will be its Admin. Colleagues who sign up with the same email domain join automatically.'}
                  />
                )}
                <Form.Item name="username" label="Username" rules={[{ required: true, message: 'Choose a username' }]}>
                  <Input placeholder="Username" />
                </Form.Item>
                <Form.Item name="password" label="Password" rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}>
                  <Input.Password placeholder="Password" />
                </Form.Item>
                {!registerStartsCompany && (
                  <Form.Item name="role_code" label="Role" rules={[{ required: true, message: 'Select a role' }]}>
                    <Select placeholder="Select a role" options={registerRoleOptions} />
                  </Form.Item>
                )}
                <Button type="primary" htmlType="submit" loading={registerLoading} block className="login-submit-btn">
                  Create account
                </Button>
                <Button type="link" block onClick={() => { setShowRegister(false); setRegisterCompany(null); }} style={{ marginTop: 8 }}>
                  Back to sign in
                </Button>
              </Form>
              ) : (
              <Form
                layout="vertical"
                onFinish={onFinish}
                requiredMark={true}
              >
                <div className="login-form-greeting">Welcome Back</div>
                <h2 className="login-form-title">Sign in to your account</h2>

                {(error || isLocked) && (
                  <Alert 
                    message={isLocked ? 'Too many failed attempts. Locked for 5 mins.' : String(error)} 
                    type="error" 
                    showIcon 
                    closable 
                    style={{ marginBottom: 24, borderRadius: 12 }} 
                    onClose={() => dispatch(clearError())} 
                  />
                )}

                <Form.Item
                  label="Username"
                  name="username"
                  rules={[{ required: true, message: 'Please enter your username' }]}
                >
                  <Input 
                    prefix={<User size={18} />} 
                    placeholder="Enter your username" 
                    spellCheck="false"
                  />
                </Form.Item>

                <Form.Item
                  label="Password"
                  name="password"
                  rules={[{ required: true, message: 'Please enter your password' }]}
                >
                  <Input.Password 
                    prefix={<Lock size={18} />} 
                    placeholder="Enter your password" 
                  />
                </Form.Item>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
                  <Button type="link" className="login-forgot-link" onClick={() => navigate('/forgot-password')}>
                    Forgot credentials?
                  </Button>
                </div>

                <Form.Item style={{ marginBottom: 0 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    block
                    className="login-submit-btn"
                    icon={<ArrowRight size={18} />}
                  >
                    Continue to Dashboard
                  </Button>
                </Form.Item>
                <Button type="link" block onClick={() => setShowRegister(true)} style={{ marginTop: 8 }}>
                  Create an account
                </Button>
              </Form>
              )
            ) : (
              <Form
                layout="vertical"
                onFinish={onMfaFinish}
                requiredMark={false}
              >
                <div className="login-form-greeting">Security Verification</div>
                <h2 className="login-form-title">{mfaSetupRequired ? 'Set Up MFA' : 'MFA Verification'}</h2>

                {(error || isLocked) && (
                  <Alert
                    message={isLocked ? 'Too many failed attempts. Locked for 5 mins.' : String(error)}
                    type="error"
                    showIcon
                    closable
                    style={{ marginBottom: 24, borderRadius: 12 }}
                    onClose={() => dispatch(clearError())}
                  />
                )}

                {mfaSetupRequired ? (
                  <div style={{ marginBottom: 24, padding: 20, border: '1.5px solid #E2E8F0', borderRadius: 16, background: '#f1f5f9', textAlign: 'center' }}>
                    <Text strong style={{ display: 'block', marginBottom: 12 }}>Scan QR in Authenticator</Text>
                    {qrCodeDataUrl ? <img src={qrCodeDataUrl} alt="MFA QR" style={{ width: 160, height: 160, borderRadius: 12 }} /> : <Text type="secondary">Generating...</Text>}
                  </div>
                ) : (
                  <div style={{ marginBottom: 24, textAlign: 'center', padding: '20px', background: '#f1f5f9', borderRadius: '16px', border: '1.5px solid #E2E8F0' }}>
                    <Shield size={48} color="#4F46E5" style={{ marginBottom: 12 }} />
                    <p style={{ margin: 0, color: '#475569', fontSize: '14px' }}>Enter the 6-digit code from your app.</p>
                  </div>
                )}

                <Form.Item
                  label="6-Digit OTP"
                  name="otp"
                  rules={[{ required: true, len: 6, message: 'Enter 6-digit code' }]}
                >
                  <Input
                    placeholder="000000"
                    maxLength={6}
                    onChange={() => { if (error) dispatch(clearError()); }}
                    style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '20px', fontWeight: 700, height: 54 }}
                  />
                </Form.Item>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                  <Checkbox checked={trustedDevice} onChange={(e) => setTrustedDevice(e.target.checked)}>Trust Device</Checkbox>
                  {!mfaSetupRequired && mfaMethod !== 'totp' && (
                     <Button type="link" size="small" disabled={resendRemaining > 0} onClick={handleResend}>
                       {resendRemaining > 0 ? `Resend in ${resendRemaining}s` : 'Resend OTP'}
                     </Button>
                  )}
                </div>

                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={mfaLoading}
                    block
                    disabled={isLocked}
                    className="login-submit-btn"
                  >
                    Verify & Access
                  </Button>
                  
                  <Button 
                    block 
                    onClick={() => { dispatch(clearMfaState()); navigate('/login'); }}
                    style={{ height: '52px', borderRadius: '12px' }}
                  >
                    Back
                  </Button>
                </Space>
              </Form>
            )}

            <p className="login-form-footer" style={{ marginTop: '40px' }}>
              Protected by enterprise-grade encryption · LedgerLine
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
