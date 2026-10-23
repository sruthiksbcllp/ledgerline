import React, { useEffect, useState, useMemo } from 'react';
import { Form, Input, Select, Button, Card, Row, Col, Space, message, Result, Typography } from 'antd';
import { Users, ArrowLeft, List } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';
import { normalizeResponse, getApiErrorMessage } from '../utils/apiNormalizer';
import { sortRoles } from '../config/rbac';

const { Title, Text } = Typography;
const { Option } = Select;

// ─── Style constants ──────────────────────────────────────────────────────────
const pageHeaderCard = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-sm)',
  marginBottom: 20,
};
const contentCard = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-card)',
};
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const AddUser = () => {
  const navigate    = useNavigate();
  const location    = useLocation();
  const [form]      = Form.useForm();
  const [roles, setRoles]           = useState([]);
  const [properties, setProperties] = useState([]);
  const [clients, setClients]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const { hasPermission }           = usePermissions();
  const canManageUsers              = hasPermission('Users', 'view');

  // Determine logged-in user's role and client from localStorage
  const currentUser   = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const currentRole   = currentUser?.role || currentUser?.Role?.code || '';
  const isProviderAdmin = currentRole === 'PROVIDER_ADMIN';

  const query  = new URLSearchParams(location.search);
  const userId = query.get('id');
  const isView = query.get('view') === 'true';
  const isEdit = !!userId && !isView;

  const pageTitle = isView ? 'View User' : isEdit ? 'Edit User' : 'Add User';
  const pageSubtitle = isView ? 'User account details' : isEdit ? 'Update user account information' : 'Create a new user account';

  // Roles that non-PROVIDER_ADMIN users should never see
  const PROVIDER_ONLY_ROLES = ['PROVIDER_ADMIN'];
  const DEPRECATED_ROLES = [];

  // Admin roles where Property is optional (no chicken-and-egg problem on the client onboarding)
  const ADMIN_ROLE_CODES = ['PROVIDER_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN'];

  // Watch role_id to conditionally require property
  const selectedRoleId = Form.useWatch('role_id', form);
  const isPropertyRequired = useMemo(() => {
    if (!selectedRoleId || roles.length === 0) return false;
    const selectedRole = roles.find(r => Number(r.id) === Number(selectedRoleId));
    const roleCode = selectedRole?.code || selectedRole?.role_code || '';
    return !ADMIN_ROLE_CODES.includes(roleCode);
  }, [selectedRoleId, roles]);

  const fetchMasters = async () => {
    try {
      const requests = [
        api.get('/masters/roles'),
        api.get('/masters/properties'),
      ];
      // Only PROVIDER_ADMIN fetches all clients; others use their own client_id
      if (isProviderAdmin) requests.push(api.get('/clients-management/clients'));

      const [roleRes, propRes, clientRes] = await Promise.all(requests);

      // Filter out PROVIDER_ADMIN-only roles for non-PROVIDER_ADMIN users
      const allRoles = normalizeResponse(roleRes) || [];
      const base = isProviderAdmin
        ? allRoles
        : allRoles.filter(r => !PROVIDER_ONLY_ROLES.includes(r.code || r.role_code || r.name));
      const filteredRoles = base.filter(r => !DEPRECATED_ROLES.includes(r.code || r.role_code || r.name));

      setRoles(sortRoles(filteredRoles));
      setProperties(normalizeResponse(propRes) || []);

      if (isProviderAdmin && clientRes) {
        setClients(normalizeResponse(clientRes) || []);
      } else if (currentUser?.client_id) {
        // Non-PROVIDER_ADMIN: pre-set client to their own and lock the field
        const clientName = currentUser?.client_name || currentUser?.Client?.client_name || '';
        setClients([{ id: currentUser.client_id, client_name: clientName }]);
        form.setFieldsValue({ client_id: currentUser.client_id });
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Failed to load masters'));
    }
  };

  const fetchUser = async () => {
    try {
      const res      = await api.get(`/users/${userId}`);
      const userData = res?.data?.data || res?.data || res;
      if (userData) form.setFieldsValue(userData);
    } catch (err) {
      try {
        const listRes = await api.get('/users');
        const list    = normalizeResponse(listRes);
        const found   = (Array.isArray(list) ? list : []).find((i) => Number(i?.id) === Number(userId));
        if (found) { form.setFieldsValue(found); return; }
      } catch { /* ignore */ }
      message.error(getApiErrorMessage(err, 'Failed to load user data'));
    }
  };

  useEffect(() => {
    if (!canManageUsers) { message.error('Access denied'); return; }
    fetchMasters();
    if (isEdit || isView) fetchUser();
  }, [userId, canManageUsers, isEdit, isView]);

  const onFinish = async (values) => {
    if (!canManageUsers) { message.error('Access denied'); return; }
    try {
      setLoading(true);
      const payload = { ...values, role_id: Number(values.role_id) };
      if (isEdit) {
        await api.put(`/users/${userId}`, payload);
        message.success('User updated successfully');
      } else {
        await api.post('/users', payload);
        message.success('User created successfully');
      }
      navigate('/admin/users');
    } catch (err) {
      message.error(err?.response?.data?.message || err?.message || (isEdit ? 'Update failed' : 'Creation failed'));
    } finally {
      setLoading(false);
    }
  };

  if (!canManageUsers) {
    return (
      <Result
        status="403"
        title="Access Denied"
        subTitle="You are not authorized to access User Management."
        extra={<Button type="primary" style={primaryBtn} onClick={() => navigate(-1)}>Go Back</Button>}
      />
    );
  }

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>

      {/* ── Page Header ── */}
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div className="page-header-icon"><Users size={24}  /></div>
              <div>
                <h2 className="page-header-title">{pageTitle}</h2>
                <p className="page-header-sub">{pageSubtitle}</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Space size={8}>
              <Button icon={<ArrowLeft size={14} />} onClick={() => navigate(-1)} style={{ borderRadius: 'var(--radius-md)', height: 34 }}>Back</Button>
              <Button icon={<List size={14} />} onClick={() => navigate('/admin/users')} style={{ borderRadius: 'var(--radius-md)', height: 34 }}>User List</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── Form ── */}
      <Card style={{ ...contentCard, maxWidth: 760, margin: '0 auto' }} styles={{ body: { padding: '24px 28px' } }}>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ status: 'ACTIVE' }}>

          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="first_name" label="First Name" rules={[{ required: true, message: 'First name is required' }]}>
                <Input placeholder="John" disabled={isView} size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="last_name" label="Last Name" rules={[{ required: true, message: 'Last name is required' }]}>
                <Input placeholder="Doe" disabled={isView} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="email" label="Email Address" rules={[{ required: true, message: 'Email is required' }, { type: 'email', message: 'Enter a valid email' }]}>
            <Input placeholder="john.doe@company.com" disabled={isView} size="large" />
          </Form.Item>

          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="username" label="Username" rules={[{ required: true, message: 'Username is required' }]}>
                <Input placeholder="john.doe" disabled={isView} size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="employee_id" label="Employee ID" rules={[{ required: true, message: 'Employee ID is required' }]}>
                <Input placeholder="EMP-001" disabled={isView} size="large" />
              </Form.Item>
            </Col>
          </Row>

          {!isEdit && !isView && (
            <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Password is required' }, { min: 8, message: 'At least 8 characters' }]}>
              <Input.Password placeholder="Min. 8 characters" size="large" />
            </Form.Item>
          )}

          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="role_id" label="Role" rules={[{ required: true, message: 'Select a role' }]}>
                <Select placeholder="Select role" disabled={isView} size="large" showSearch optionFilterProp="children">
                  {roles.map((r) => <Option key={r.id} value={Number(r.id)}>{r.name || r.role_name || 'Unnamed Role'}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="user_level" label="System Level" rules={[{ required: true, message: 'Select system level' }]}>
                <Select placeholder="Select level" disabled={isView} size="large">
                  <Option value="Level 1">Level 1</Option>
                  <Option value="Level 2">Level 2</Option>
                  <Option value="Level 3">Level 3</Option>
                  <Option value="Level 4">Level 4</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="status" label="Account status" rules={[{ required: true, message: 'Select an account status' }]}>
            <Select disabled={isView} size="large">
              <Option value="ACTIVE">Active</Option>
              <Option value="INACTIVE">Deactivated</Option>
              <Option value="SUSPENDED">Suspended</Option>
            </Select>
          </Form.Item>

          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="client_id" label="Client / Organization" rules={[{ required: true, message: 'Select a client' }]}>
                <Select placeholder="Select client" disabled={isView || !isProviderAdmin} size="large" showSearch optionFilterProp="children">
                  {clients.map((c) => <Option key={c.id} value={c.id}>{c.client_name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="property_id" label={isPropertyRequired ? "Property" : "Property (optional)"} rules={[{ required: isPropertyRequired, message: 'Select a property' }]}>
                <Select placeholder="Select property" disabled={isView} size="large" showSearch optionFilterProp="children">
                  {properties.map((p) => <Option key={p.id} value={p.id}>{p.property_name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {!isView && (
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <Space size="middle">
                <Button onClick={() => navigate(-1)} size="large">Cancel</Button>
                <Button type="primary" htmlType="submit" loading={loading} style={primaryBtn} size="large">
                  {isEdit ? 'Update User' : 'Create User'}
                </Button>
              </Space>
            </div>
          )}
        </Form>
      </Card>
    </div>
  );
};

export default AddUser;
