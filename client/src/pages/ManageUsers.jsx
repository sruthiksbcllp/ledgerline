import React, { useEffect, useState } from 'react';
import {
  Table, Button, Input, Select, Space, Card, Tag, message,
  Upload, Result, Modal, Form, Tooltip, Typography, Row, Col, Popconfirm, Empty, Drawer, Spin
} from 'antd';
import { UserPlus, Search, Upload as UploadIcon, TrendingUp, KeyRound, Download, Users, RefreshCcw, Eye, Edit2, Trash2, Lock } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchUsers } from '../store/userSlice';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import dayjs from 'dayjs';
import { exportToExcel, importFromExcel } from '../utils/excel';
import { addUser } from '../store/userSlice';
import { usePermissions } from '../hooks/usePermissions';

const { Text } = Typography;
const { Option } = Select;

const ACTION_COLOR = { CREATE: 'success', UPDATE: 'processing', DELETE: 'error', VIEW: 'default' };

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard    = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

const ManageUsers = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items: users, loading } = useSelector(state => state.users);
  const [mfaResetOpen, setMfaResetOpen] = useState(false);
  const [mfaResetLoading, setMfaResetLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [mfaResetForm] = Form.useForm();
  const { hasPermission, user: currentUser } = usePermissions();
  const canManageUsers = hasPermission('Users', 'view');

  const [activityOpen, setActivityOpen] = useState(false);
  const [activityUser, setActivityUser] = useState(null);
  const [activityRows, setActivityRows] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const openActivity = async (record) => {
    setActivityUser(record);
    setActivityRows([]);
    setActivityOpen(true);
    setActivityLoading(true);
    try {
      const username = record.username;
      if (!username) { setActivityLoading(false); return; }
      const res = await api.get(`/audit-foundation/actor/${username}`);
      const data = res?.data?.data ?? res?.data;
      setActivityRows(Array.isArray(data) ? data : []);
    } catch {
      message.error('Failed to load activity trail');
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (!canManageUsers) { message.error('Access denied'); return; }
    dispatch(fetchUsers());
  }, [dispatch, canManageUsers]);

  const handleDelete = async (id) => {
    if (!canManageUsers) { message.error('Access denied'); return; }
    try {
      const res = await api.delete(`/users/${id}`);
      if (res?.data?.success === false) { message.error(res.data.message || 'Delete failed'); return; }
      message.success('User deleted');
      dispatch(fetchUsers());
    } catch (err) {
      message.error(err?.response?.data?.message || 'Delete failed');
    }
  };

  const handleResetPassword = async (record) => {
    try {
      const res = await api.post(`/users/${record.id}/reset-password`);
      message.success(res?.data?.message || `Reset link sent to ${record.email || 'the user'}.`);
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to send reset link');
    }
  };

  const handleImport = async (file) => {
    if (!canManageUsers) { message.error('Access denied'); return false; }
    try {
      const data = await importFromExcel(file);
      for (const item of data) { await dispatch(addUser(item)).unwrap(); }
      message.success(`Successfully imported ${data.length} users`);
      dispatch(fetchUsers());
    } catch (err) {
      message.error(`Import failed: ${err.message || 'Check your file format'}`);
    }
    return false;
  };

  const openMfaResetDialog = (record) => {
    setSelectedUser(record);
    mfaResetForm.setFieldsValue({ reason: undefined, audit_note: '' });
    setMfaResetOpen(true);
  };

  const handleResetMfa = async () => {
    try {
      const values = await mfaResetForm.validateFields();
      if (!selectedUser) return;
      setMfaResetLoading(true);
      await api.post('/auth/mfa/reset-user', {
        user_id: selectedUser.id,
        reason: values.reason,
        audit_note: values.audit_note,
      });
      message.success(`MFA reset for ${selectedUser.username || selectedUser.email}`);
      setMfaResetOpen(false);
      setSelectedUser(null);
    } catch (err) {
      if (!err?.errorFields) { message.error(err?.response?.data?.message || 'MFA reset failed'); }
    } finally {
      setMfaResetLoading(false);
    }
  };

  if (!canManageUsers) {
    return <Result status="403" title="Access Denied" subTitle="You are not authorised to access User Management." />;
  }

  const filteredUsers = (users || []).filter(record => {
    if (!searchText.trim()) return true;
    const role = record.Role || (record.Roles && record.Roles[0]);
    const values = [
      record.first_name, record.last_name, record.email, record.employee_id,
      record.user_level, record.Client?.client_name, record.Property?.property_name,
      role?.name || role?.role_name, record.status,
    ].filter(Boolean).join(' ').toLowerCase();
    return values.includes(searchText.trim().toLowerCase());
  });

  const columns = [
    {
      title: '#', key: 'sr', width: 50, align: 'center',
      render: (_, __, i) => (
        <Text style={{ fontSize: 13, color: 'var(--muted)' }}>
          {(currentPage - 1) * pageSize + i + 1}
        </Text>
      ),
    },
    {
      title: 'Name', key: 'name', minWidth: 180,
      render: (_, r) => (
        <Text strong style={{ fontSize: 13, color: 'var(--text-dark)' }}>
          {r.first_name} {r.last_name}
        </Text>
      ),
    },
    {
      title: 'Email', dataIndex: 'email', key: 'email', minWidth: 220,
      render: (v) => <Text style={{ fontSize: 12, color: 'var(--muted)' }}>{v || '--'}</Text>,
    },
    {
      title: 'Employee ID', dataIndex: 'employee_id', key: 'employee_id', width: 170,
      render: v => <Text style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--muted)' }}>{v || '--'}</Text>,
    },
    {
      title: 'Role', key: 'role', width: 150,
      render: (_, r) => {
        const role = r.Role || (r.Roles && r.Roles[0]);
        const name = role ? (role.name || role.role_name || 'N/A') : 'N/A';
        const colorMap = { 'Provider Administrator': '#EFF6FF', 'Administrator': '#EFF6FF', 'Auditor': '#F0FDF4' };
        const textMap  = { 'Provider Administrator': '#2563EB', 'Administrator': '#2563EB', 'Auditor': '#16A34A' };
        return (
          <Tag bordered={false}
            style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, background: colorMap[name] || '#F1F5F9', color: textMap[name] || '#64748B', padding: '2px 8px' }}>
            {name}
          </Tag>
        );
      },
    },
    {
      title: 'Property', key: 'property', width: 180,
      render: (_, r) => {
        const prop = r.Property;
        const name = prop ? (prop.property_name || prop.name || '--') : '--';
        return <Text style={{ fontSize: 12, color: 'var(--muted)' }}>{name}</Text>;
      },
    },
    {
      title: 'Actions', key: 'action', width: 185, fixed: 'right', align: 'center',
      render: (_, record) => (
        <Space size={8}>
          <Tooltip title="View">
            <Button className="action-btn-circle action-btn-eye" icon={<Eye size={14} />} onClick={() => navigate(`/add-user?id=${record.id}&view=true`)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button className="action-btn-circle action-btn-edit" icon={<Edit2 size={14} />} onClick={() => navigate(`/add-user?id=${record.id}`)} />
          </Tooltip>
          <Tooltip title="Activity Trail">
            <Button className="action-btn-circle action-btn-trend" icon={<TrendingUp size={14} />} onClick={() => openActivity(record)} />
          </Tooltip>
          <Popconfirm title="Delete this user?" onConfirm={() => handleDelete(record.id)} okText="Delete" cancelText="Cancel">
            <Button className="action-btn-circle action-btn-delete" icon={<Trash2 size={14} />} />
          </Popconfirm>
          {canManageUsers && (
            <Popconfirm
              title="Send a password reset link?"
              description={record.email ? `A reset link will be emailed to ${record.email}.` : 'This user has no email on file — set one first.'}
              onConfirm={() => handleResetPassword(record)}
              okText="Send link" cancelText="Cancel"
              disabled={!record.email}
            >
              <Tooltip title={record.email ? 'Reset password (email link)' : 'No email on file'}>
                <Button className="action-btn-circle" icon={<Lock size={14} />} disabled={!record.email} />
              </Tooltip>
            </Popconfirm>
          )}
          {String(currentUser?.role || '').toUpperCase() === 'PROVIDER_ADMIN' && (
            <Tooltip title="Reset MFA">
              <Button className="action-btn-circle action-btn-key" icon={<KeyRound size={14} />} onClick={() => openMfaResetDialog(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const activityColumns = [
    {
      title: 'When', dataIndex: 'created_at', key: 'ts', width: 155,
      defaultSortOrder: 'descend',
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      render: (v) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 12 }}>{dayjs(v).format('DD MMM YYYY')}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{dayjs(v).format('HH:mm:ss')}</div>
        </div>
      ),
    },
    {
      title: 'Action', dataIndex: 'action', key: 'action', width: 85,
      render: (v) => <Tag color={ACTION_COLOR[v] || 'default'} style={{ fontSize: 11 }}>{v}</Tag>,
    },
    {
      title: 'Module', dataIndex: 'module', key: 'module', width: 120,
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Entity', key: 'entity',
      render: (_, r) => r.entity_id
        ? <Text style={{ fontSize: 12 }}>{r.entity_type} <span style={{ fontFamily: 'monospace' }}>#{r.entity_id}</span></Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>--</Text>,
    },
    {
      title: 'IP', dataIndex: 'ip_address', key: 'ip', width: 115,
      render: (v) => <Text style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{v || '--'}</Text>,
    },
  ];

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space size={16} align="center">
              <div className="page-header-icon"><Users size={24} /></div>
              <div>
                <h2 className="page-header-title">Manage Users</h2>
                <p className="page-header-sub">User accounts &amp; access control &middot; {filteredUsers.length} records</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap size={10}>
              <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleImport}>
                <Button className="btn-import" icon={<UploadIcon size={16} />}>Import Excel</Button>
              </Upload>
              <Button className="btn-export" icon={<Download size={16} />} onClick={() => exportToExcel(users, 'User_Report')}>Export Excel</Button>
              <Button className="btn-refresh" icon={<RefreshCcw size={16} />} loading={loading} onClick={() => dispatch(fetchUsers())}>Refresh</Button>
              <Button type="primary" style={primaryBtn} icon={<UserPlus size={14} />} onClick={() => navigate('/add-user')}>
                Add User
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: '16px 16px 0' } }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 14 }}>
          <Col>
            <Input
              placeholder="Search users by name, email, role..."
              prefix={<Search size={14} color="var(--color-text-muted)" />}
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setCurrentPage(1); }}
              allowClear
              style={{ width: 300, borderRadius: 'var(--radius-md)' }}
            />
          </Col>
        </Row>

        <Table
          className="manage-users-table"
          columns={columns}
          dataSource={filteredUsers}
          loading={loading}
          rowKey="id"
          size="middle"
          scroll={{ x: 'max-content' }}
          pagination={{
            current: currentPage,
            pageSize,
            total: filteredUsers.length,
            showSizeChanger: true,
            pageSizeOptions: ['10', '25', '50'],
            showTotal: total => `${total} users`,
            onChange: (page, size) => { setCurrentPage(page); setPageSize(size); },
          }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">No users found</Text>} style={{ padding: '32px 0' }} />,
          }}
        />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button type="primary" icon={<ArrowRight size={16} />} iconPosition="end" onClick={() => navigate('/admin/roles')} style={{ backgroundColor: 'var(--color-navy)' }}>
          Next
        </Button>
      </div>

      {/* Activity Trail Drawer */}
      <Drawer
        title={
          <div>
            <div style={{ fontWeight: 600 }}>
              Activity Trail &mdash; {activityUser?.first_name} {activityUser?.last_name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400 }}>
              {activityUser?.username} &middot; {activityUser?.email}
            </div>
          </div>
        }
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        width={680}
        extra={
          <Button size="small" onClick={() => navigate('/security/audit-trail')}>View Full Trail</Button>
        }
      >
        {activityLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : activityRows.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                No activity recorded yet for <strong>{activityUser?.username}</strong>.<br />
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Activity is captured when the user visits Assets, Procurement, Dashboard, and Audit modules.
                </span>
              </span>
            }
          />
        ) : (
          <Table
            dataSource={activityRows}
            columns={activityColumns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showTotal: (t) => `${t} events`, showSizeChanger: false }}
            scroll={{ x: 'max-content' }}
          />
        )}
      </Drawer>

      {/* MFA Reset Modal */}
      <Modal
        title="Reset User MFA"
        open={mfaResetOpen}
        onCancel={() => { setMfaResetOpen(false); setSelectedUser(null); }}
        onOk={handleResetMfa}
        okText="Confirm Reset"
        okButtonProps={primaryBtn}
        cancelText="Cancel"
        confirmLoading={mfaResetLoading}
        destroyOnClose
      >
        <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--color-warning-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-warning-border)' }}>
          <Text strong>User: </Text>
          <Text>{selectedUser?.username || selectedUser?.email || '--'}</Text>
        </div>
        <Form form={mfaResetForm} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Please select reason' }]}>
            <Select placeholder="Select reason">
              <Option value="lost_device">Lost device</Option>
              <Option value="device_replacement">Device replacement</Option>
              <Option value="access_recovery">Access recovery</Option>
              <Option value="security_incident">Security incident</Option>
            </Select>
          </Form.Item>
          <Form.Item name="audit_note" label="Audit Note"
            rules={[{ required: true, message: 'Audit note is required' }, { min: 10, message: 'Minimum 10 characters' }]}>
            <Input.TextArea rows={4} placeholder="Enter detailed reason and approval context for audit trail..."
              maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ManageUsers;
