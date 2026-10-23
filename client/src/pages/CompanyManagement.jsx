import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, Space, Row, Col, Drawer, Form, Select, Switch, Tag, Popconfirm, message, Tabs, Tooltip, Empty } from 'antd';
import { Plus, Edit2, Trash2, Building2, RefreshCcw, Search, Users, Settings, ChevronRight } from 'lucide-react';
import api from '../utils/api';

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });
const navyTh = { background: 'var(--gradient-navy)', color: '#fff', fontWeight: 600, fontSize: 13 };

const CompanyManagement = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [usersDrawerOpen, setUsersDrawerOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [clients, setClients] = useState([]);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isProviderAdmin = (user.role || '').toUpperCase() === 'PROVIDER_ADMIN';

  const fetchClients = async () => {
    if (!isProviderAdmin) return;
    try {
      const res = await api.get('/clients');
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setClients(data);
    } catch { /* ignore */ }
  };

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await api.get('/companies');
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setCompanies(data);
    } catch {
      message.error('Failed to fetch companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCompanies(); fetchClients(); }, []);

  const handleCreate = () => {
    setEditingCompany(null);
    form.resetFields();
    form.setFieldsValue({ company_type: 'LIMITED_LIABILITY', reporting_currency: 'INR', financial_year_start_month: 4, depreciation_method_default: 'SLM', is_active: true });
    setDrawerOpen(true);
  };

  const handleEdit = (record) => {
    setEditingCompany(record);
    form.setFieldsValue(record);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingCompany) {
        await api.put(`/companies/${editingCompany.id}`, values);
        message.success('Company updated');
      } else {
        await api.post('/companies', values);
        message.success('Company created');
      }
      setDrawerOpen(false);
      fetchCompanies();
    } catch (err) {
      if (err?.response?.data?.error) message.error(err.response.data.error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/companies/${id}`);
      message.success('Company deleted');
      fetchCompanies();
    } catch {
      message.error('Failed to delete company');
    }
  };

  const openUsersDrawer = async (company) => {
    setSelectedCompany(company);
    setUsersDrawerOpen(true);
    setUsersLoading(true);
    try {
      const [usersRes, allUsersRes] = await Promise.all([
        api.get(`/companies/${company.id}/users`),
        api.get('/users')
      ]);
      const uData = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.data || [];
      setCompanyUsers(uData);
      const aData = Array.isArray(allUsersRes.data) ? allUsersRes.data : allUsersRes.data?.data || [];
      setAllUsers(aData);
    } catch {
      message.error('Failed to fetch users');
    } finally {
      setUsersLoading(false);
    }
  };

  const handleAssignUser = async () => {
    try {
      const values = await assignForm.validateFields();
      await api.post(`/companies/${selectedCompany.id}/users`, values);
      message.success('User assigned');
      assignForm.resetFields();
      openUsersDrawer(selectedCompany);
    } catch (err) {
      if (err?.response?.data?.error) message.error(err.response.data.error);
    }
  };

  const handleRemoveUser = async (userId) => {
    try {
      await api.delete(`/companies/${selectedCompany.id}/users/${userId}`);
      message.success('User removed');
      openUsersDrawer(selectedCompany);
    } catch {
      message.error('Failed to remove user');
    }
  };

  const filtered = companies.filter(c =>
    (c.company_name || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (c.company_code || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    { title: '#', dataIndex: 'id', width: 50, onHeaderCell: () => ({ style: navyTh }), render: (_, __, i) => i + 1 },
    { title: 'Company Code', dataIndex: 'company_code', onHeaderCell: () => ({ style: navyTh }), render: (v) => <span style={{ fontWeight: 600, color: 'var(--color-orange)' }}>{v}</span> },
    { title: 'Company Name', dataIndex: 'company_name', onHeaderCell: () => ({ style: navyTh }) },
    { title: 'Type', dataIndex: 'company_type', onHeaderCell: () => ({ style: navyTh }), render: (v) => <Tag color="blue">{(v || '').replace(/_/g, ' ')}</Tag> },
    { title: 'Currency', dataIndex: 'reporting_currency', width: 90, onHeaderCell: () => ({ style: navyTh }) },
    { title: 'FY Start', dataIndex: 'financial_year_start_month', width: 80, onHeaderCell: () => ({ style: navyTh }), render: (v) => ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][v] || v },
    { title: 'Depreciation', dataIndex: 'depreciation_method_default', width: 100, onHeaderCell: () => ({ style: navyTh }) },
    { title: 'GST', dataIndex: 'gst_registration_number', onHeaderCell: () => ({ style: navyTh }), render: (v) => v || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { title: 'Primary', dataIndex: 'is_primary', width: 80, onHeaderCell: () => ({ style: navyTh }), render: (v) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    { title: 'Status', dataIndex: 'is_active', width: 80, onHeaderCell: () => ({ style: navyTh }), render: (v) => v ? <Tag color="green">Active</Tag> : <Tag color="red">Inactive</Tag> },
    {
      title: 'Actions', width: 150, onHeaderCell: () => ({ style: navyTh }),
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit"><Button size="small" icon={<Edit2 size={14} />} onClick={() => handleEdit(record)} /></Tooltip>
          <Tooltip title="Users"><Button size="small" icon={<Users size={14} />} onClick={() => openUsersDrawer(record)} /></Tooltip>
          <Popconfirm title="Delete company?" description="This action cannot be undone." onConfirm={() => handleDelete(record.id)} okText="Yes, Delete" cancelText="Cancel" okButtonProps={{ danger: true }}>
            <Tooltip title="Delete"><Button size="small" danger icon={<Trash2 size={14} />} /></Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const userColumns = [
    { title: 'User', dataIndex: 'user', render: (_, r) => {
      const u = r.user || r;
      return <span>{u.first_name || u.username || 'User'} {u.last_name || ''}</span>;
    }},
    { title: 'Email', dataIndex: 'user', render: (_, r) => (r.user || r).email || '—' },
    { title: 'Access', dataIndex: 'access_level', render: (v) => <Tag color={v === 'ADMIN' ? 'red' : v === 'EDIT' ? 'blue' : 'default'}>{v}</Tag> },
    { title: 'Primary', dataIndex: 'is_primary', render: (v) => v ? <Tag color="green">Yes</Tag> : 'No' },
    { title: '', width: 60, render: (_, r) => (
      <Popconfirm title="Remove user?" onConfirm={() => handleRemoveUser(r.user_id || r.user?.id)} okText="Yes" okButtonProps={{ danger: true }}>
        <Button size="small" danger icon={<Trash2 size={14} />} />
      </Popconfirm>
    )}
  ];

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <Card style={pageHeaderCard} styles={{ body: { padding: '16px 24px' } }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Row align="middle" gutter={12}>
              <Col><div style={iconBadge('var(--gradient-orange)')}><Building2 size={20} color="#fff" /></div></Col>
              <Col>
                <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-navy)' }}>Company Management</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Manage legal entities under your organization</div>
              </Col>
            </Row>
          </Col>
          <Col>
            <Space>
              <Button icon={<RefreshCcw size={14} />} onClick={fetchCompanies}>Refresh</Button>
              <Button type="primary" icon={<Plus size={14} />} style={primaryBtn} onClick={handleCreate}>Add Company</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <Input prefix={<Search size={14} color="var(--color-text-muted)" />} placeholder="Search by company name or code..." value={searchText} onChange={e => setSearchText(e.target.value)} style={{ maxWidth: 350 }} allowClear />
        </div>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], showTotal: (t) => `${t} companies` }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="No companies found" /> }}
        />
      </Card>

      {/* Create/Edit Drawer */}
      <Drawer title={editingCompany ? 'Edit Company' : 'Create Company'} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={520}
        extra={<Button type="primary" style={primaryBtn} onClick={handleSave}>Save</Button>}>
        <Form form={form} layout="vertical">
          {isProviderAdmin && (
            <Form.Item name="client_id" label="Client (Tenant)" rules={[{ required: true, message: 'Select client' }]}>
              <Select placeholder="Select client" showSearch optionFilterProp="label"
                options={clients.map(c => ({ value: c.id, label: c.client_name }))} />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col span={12}><Form.Item name="company_code" label="Company Code" rules={[{ required: true }]}><Input placeholder="e.g. ACME-002" /></Form.Item></Col>
            <Col span={12}><Form.Item name="company_name" label="Company Name" rules={[{ required: true }]}><Input placeholder="Legal entity name" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="company_type" label="Company Type">
                <Select options={[
                  { value: 'LIMITED_LIABILITY', label: 'Limited Liability' },
                  { value: 'PARTNERSHIP', label: 'Partnership' },
                  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
                  { value: 'CORPORATION', label: 'Corporation' }
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="registration_number" label="Registration No."><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="gst_registration_number" label="GST Number"><Input placeholder="e.g. 36AABCU9603R1ZM" /></Form.Item></Col>
            <Col span={12}><Form.Item name="tax_identification_number" label="TIN / PAN"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="email" label="Email"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}><Form.Item name="address_line_1" label="Address Line 1"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="postal_code" label="PIN Code"><Input /></Form.Item></Col>
          </Row>
          <div style={{ fontWeight: 600, fontSize: 14, margin: '16px 0 8px', color: 'var(--color-navy)' }}>Financial Settings</div>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="reporting_currency" label="Currency">
                <Select options={[{ value: 'INR', label: 'INR' }, { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'GBP', label: 'GBP' }]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="financial_year_start_month" label="FY Start Month">
                <Select options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i] }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="depreciation_method_default" label="Default Depreciation">
                <Select options={[{ value: 'SLM', label: 'SLM' }, { value: 'WDV', label: 'WDV' }, { value: 'DECLINING_BALANCE', label: 'Declining Balance' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="is_active" label="Active" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Drawer>

      {/* Users Drawer */}
      <Drawer title={`Users — ${selectedCompany?.company_name || ''}`} open={usersDrawerOpen} onClose={() => setUsersDrawerOpen(false)} width={600}>
        <div style={{ marginBottom: 16, padding: 16, background: 'var(--color-bg-page)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Assign User</div>
          <Form form={assignForm} layout="inline" style={{ gap: 8 }}>
            <Form.Item name="user_id" rules={[{ required: true, message: 'Select user' }]} style={{ flex: 1, minWidth: 180 }}>
              <Select placeholder="Select user" showSearch optionFilterProp="label"
                options={allUsers.map(u => ({ value: u.id, label: `${u.first_name || u.username} ${u.last_name || ''} (${u.email || ''})` }))} />
            </Form.Item>
            <Form.Item name="access_level" initialValue="EDIT" style={{ width: 120 }}>
              <Select options={[{ value: 'VIEW_ONLY', label: 'View Only' }, { value: 'EDIT', label: 'Edit' }, { value: 'ADMIN', label: 'Admin' }]} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" style={primaryBtn} icon={<Plus size={14} />} onClick={handleAssignUser}>Assign</Button>
            </Form.Item>
          </Form>
        </div>
        <Table columns={userColumns} dataSource={companyUsers} rowKey={r => r.user_id || r.id} loading={usersLoading} pagination={false}
          locale={{ emptyText: <Empty description="No users assigned to this company" /> }} />
      </Drawer>
    </div>
  );
};

export default CompanyManagement;
