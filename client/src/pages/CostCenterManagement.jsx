import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, message, Empty, Card, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, DeleteOutlined, EditOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import * as XLSX from 'xlsx';

const LEVELS = ['COMPANY', 'BUSINESS_UNIT', 'DEPARTMENT', 'SUB_DEPARTMENT'];

const CostCenterManagement = () => {
  const [centers, setCenters] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Code', 'Name'], ['1101', 'Multi Family Office']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CostCentres');
    XLSX.writeFile(wb, 'CostCentre_Template.xlsx');
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const rows = json.map(r => {
        const code = r.Code ?? r.code ?? r.CODE ?? '';
        const name = r.Name ?? r.name ?? r['Sub LoB / Cost Centre'] ?? r['Sub LoB'] ?? '';
        return { code: String(code).trim(), name: String(name).trim() };
      }).filter(r => r.code);
      if (!rows.length) { message.error('No rows with a Code column found'); setImporting(false); return; }
      const res = await api.post('/enterprise/cost-centers/import', { rows });
      message.success(res.data?.message || 'Imported');
      fetchCenters();
    } catch (err) { message.error(err.response?.data?.message || 'Import failed'); }
    setImporting(false);
  };


  const fetchCenters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/enterprise/cost-centers');
      setCenters(res.data?.data || []);
    } catch { message.error('Failed to load cost centers'); }
    setLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data?.data || res.data || []);
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => { fetchCenters(); fetchUsers(); }, [fetchCenters, fetchUsers]);

  const handleSave = async (values) => {
    setSubmitting(true);
    try {
      if (editingId) {
        await api.put('/enterprise/cost-centers/' + editingId, values);
        message.success('Cost center updated');
      } else {
        await api.post('/enterprise/cost-centers', values);
        message.success('Cost center created');
      }
      setModalOpen(false);
      form.resetFields();
      setEditingId(null);
      fetchCenters();
    } catch (err) { message.error(err.response?.data?.message || 'Failed to save'); }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete('/enterprise/cost-centers/' + id);
      message.success('Cost center deleted');
      fetchCenters();
    } catch (err) { message.error(err.response?.data?.message || 'Failed to delete'); }
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      level: record.level,
      is_active: record.is_active,
      owner_id: record.owner_id || undefined,
      approver_id: record.approver_id || undefined
    });
    setModalOpen(true);
  };

  const filtered = centers.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.code || '').toLowerCase().includes(s) || (c.name || '').toLowerCase().includes(s);
  });

  const getUserName = (user) => {
    if (!user) return '-';
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || '-';
  };

  const columns = [
    { title: 'Code', dataIndex: 'code', width: 120 },
    { title: 'Sub-Ledger', dataIndex: 'sub_ledger', width: 120, render: (t) => t || '—' },
    { title: 'Name', dataIndex: 'name', ellipsis: true },
    { title: 'Level', dataIndex: 'level', width: 150, render: v => <Tag color="blue">{(v || '').replace(/_/g, ' ')}</Tag> },
    { title: 'Owner', key: 'owner', width: 160, render: (_, r) => (r.owner ? getUserName(r.owner) : (r.owner_name || '—')) },
    { title: 'Approver', key: 'approver', width: 160, render: (_, r) => (r.approver ? getUserName(r.approver) : (r.approver_name || '—')) },
    { title: 'Status', dataIndex: 'is_active', width: 90, render: v => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 140, render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          <Popconfirm title="Delete cost center?" description="This action cannot be undone."
            onConfirm={() => handleDelete(r.id)} okText="Yes, Delete" cancelText="Cancel" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  const userOptions = users.map(u => ({
    value: u.id,
    label: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'User ' + u.id
  }));

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Cost Center Management" subtitle="Manage cost centers, assign owners and approvers" />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
            Add Cost Center
          </Button>
          <Input placeholder="Search by code or name" prefix={<SearchOutlined />}
            value={search} onChange={e => setSearch(e.target.value)} style={{ width: 240 }} allowClear />
          <Button icon={<ReloadOutlined />} onClick={fetchCenters}>Refresh</Button>
          <Button icon={<UploadOutlined />} loading={importing} onClick={() => fileRef.current?.click()}>Import</Button>
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>Template</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
        </Space>
      </Card>
      <Table columns={columns} dataSource={filtered} rowKey="id" loading={loading} scroll={{ x: 'max-content' }}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          pageSizeOptions: ['10', '25', '50'],
          showTotal: t => 'Total ' + t,
          onChange: (page, pageSize) => setPagination({ current: page, pageSize })
        }}
        locale={{ emptyText: <Empty description="No cost centers found" /> }} />

      <Modal title={editingId ? 'Edit Cost Center' : 'Add Cost Center'} open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }}
        onOk={() => form.submit()} confirmLoading={submitting} width={520} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ is_active: true, level: 'DEPARTMENT' }}>
          <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Code is required' }]}>
            <Input placeholder="e.g. CC-HQ-001" />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Head Office Operations" />
          </Form.Item>
          <Form.Item name="sub_ledger" label="Sub-Ledger"><Input placeholder="GL sub-ledger code" /></Form.Item>
          <Form.Item name="level" label="Level" rules={[{ required: true }]}>
            <Select>
              {LEVELS.map(l => <Select.Option key={l} value={l}>{l.replace(/_/g, ' ')}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="owner_id" label="Owner (link a system user — optional)">
            <Select allowClear showSearch placeholder="Select owner"
              filterOption={(input, opt) => (opt?.label || '').toLowerCase().includes(input.toLowerCase())}
              options={userOptions} />
          </Form.Item>
          <Form.Item name="owner_name" label="Owner Name (free text — for non-login people; editable on replacement)">
            <Input allowClear placeholder="e.g. Ramesh Kumar" />
          </Form.Item>
          <Form.Item name="approver_id" label="Approver (link a system user — optional)">
            <Select allowClear showSearch placeholder="Select approver"
              filterOption={(input, opt) => (opt?.label || '').toLowerCase().includes(input.toLowerCase())}
              options={userOptions} />
          </Form.Item>
          <Form.Item name="approver_name" label="Approver Name (free text — for non-login people; editable on replacement)">
            <Input allowClear placeholder="e.g. Priya Singh" />
          </Form.Item>
          <Form.Item name="allocation_owner_id" label="Allocation Owner (link a system user — optional)">
            <Select allowClear showSearch placeholder="Select allocation owner"
              filterOption={(input, opt) => (opt?.label || '').toLowerCase().includes(input.toLowerCase())}
              options={userOptions} />
          </Form.Item>
          <Form.Item name="allocation_owner_name" label="Allocation Owner Name (free text — for non-login people; editable on replacement)">
            <Input allowClear placeholder="e.g. Anil Mehta" />
          </Form.Item>
          <Form.Item name="is_active" label="Status">
            <Select>
              <Select.Option value={true}>Active</Select.Option>
              <Select.Option value={false}>Inactive</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CostCenterManagement;
