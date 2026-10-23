import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, Space, Tag, message, Empty, Card, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, DeleteOutlined, EditOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import * as XLSX from 'xlsx';

const EmployeeMaster = () => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const fileRef = useRef(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/employees', { params: { search, page, pageSize } });
      setRows(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch { message.error('Failed to load employees'); }
    setLoading(false);
  }, [search, page, pageSize]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleSave = async (values) => {
    setSubmitting(true);
    try {
      const payload = { ...values, doj: values.doj ? dayjs(values.doj).format('YYYY-MM-DD') : null };
      if (editingId) { await api.put('/employees/' + editingId, payload); message.success('Employee updated'); }
      else { await api.post('/employees', payload); message.success('Employee created'); }
      setModalOpen(false); form.resetFields(); setEditingId(null); fetchRows();
    } catch (err) { message.error(err.response?.data?.message || 'Failed to save'); }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    try { await api.delete('/employees/' + id); message.success('Employee deleted'); fetchRows(); }
    catch (err) { message.error(err.response?.data?.message || 'Failed to delete'); }
  };

  const openEdit = (r) => {
    setEditingId(r.id);
    form.setFieldsValue({ ...r, doj: r.doj ? dayjs(r.doj) : null });
    setModalOpen(true);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['emp_code', 'name', 'doj', 'designation', 'location', 'gender', 'rm_name', 'employment_type', 'company', 'sub_lob', 'lob', 'sbu'],
      ['1', 'Sample Name', '2024-01-01', 'Manager', 'Mumbai', 'Male', 'Reporting Manager', 'Onroll', 'NMS', 'Finance', "CFO's Office", 'EU']
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'Employee_Template.xlsx');
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
      const norm = (r) => ({
        emp_code: String(r.emp_code ?? r['Emp Code'] ?? '').trim(),
        name: r.name ?? r['Employee Name'] ?? '',
        doj: r.doj ?? r.DOJ ?? '',
        designation: r.designation ?? r.Designation ?? '',
        location: r.location ?? r.Location ?? '',
        gender: r.gender ?? r.Gender ?? '',
        rm_name: r.rm_name ?? r['RM Name'] ?? '',
        employment_type: r.employment_type ?? r['Employment Type'] ?? '',
        company: r.company ?? r.Company ?? '',
        sub_lob: r.sub_lob ?? r['Sub LoB'] ?? '',
        lob: r.lob ?? r.LoB ?? '',
        sbu: r.sbu ?? r.SBU ?? ''
      });
      const parsed = json.map(norm).filter(r => r.emp_code && r.name).map(r => {
        if (r.doj instanceof Date) r.doj = dayjs(r.doj).format('YYYY-MM-DD');
        return r;
      });
      if (!parsed.length) { message.error('No rows with emp_code + name found'); setImporting(false); return; }
      const res = await api.post('/employees/import', { rows: parsed });
      message.success(res.data?.message || 'Imported');
      const errs = res.data?.data?.errors || [];
      if (errs.length) message.warning(`${errs.length} row(s) skipped — first: ${errs[0]}`);
      setPage(1); fetchRows();
    } catch (err) { message.error(err.response?.data?.message || 'Import failed'); }
    setImporting(false);
  };

  const columns = [
    { title: 'Emp Code', dataIndex: 'emp_code', width: 100 },
    { title: 'Name', dataIndex: 'name', width: 200, ellipsis: true },
    { title: 'Designation', dataIndex: 'designation', width: 160, render: t => t || '—' },
    { title: 'Location', dataIndex: 'location', width: 120, render: t => t || '—' },
    { title: 'RM', dataIndex: 'rm_name', width: 180, render: t => t || '—' },
    { title: 'Sub-LoB', dataIndex: 'sub_lob', width: 140, render: t => t ? <Tag color="blue">{t}</Tag> : '—' },
    { title: 'LoB', dataIndex: 'lob', width: 140, render: t => t || '—' },
    { title: 'Company', dataIndex: 'company', width: 110, render: t => t || '—' },
    { title: 'Status', dataIndex: 'is_active', width: 90, render: v => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 130, fixed: 'right', render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete employee?" description="This action cannot be undone."
            onConfirm={() => handleDelete(r.id)} okText="Yes, Delete" cancelText="Cancel" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Employee Master" subtitle="Employee records (non-login) — used for asset custodian and approval routing" />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>Add Employee</Button>
          <Input placeholder="Search code / name / Sub-LoB / location" prefix={<SearchOutlined />}
            value={search} onChange={e => { setPage(1); setSearch(e.target.value); }} style={{ width: 300 }} allowClear />
          <Button icon={<UploadOutlined />} loading={importing} onClick={() => fileRef.current?.click()}>Import</Button>
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>Template</Button>
          <Button icon={<ReloadOutlined />} onClick={fetchRows}>Refresh</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
        </Space>
      </Card>
      <Table columns={columns} dataSource={rows} rowKey="id" loading={loading} scroll={{ x: 'max-content' }}
        pagination={{
          current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'],
          showTotal: t => 'Total ' + t,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); }
        }}
        locale={{ emptyText: <Empty description="No employees found" /> }} />

      <Modal title={editingId ? 'Edit Employee' : 'Add Employee'} open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }}
        onOk={() => form.submit()} confirmLoading={submitting} width={640} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleSave} initialValues={{ is_active: true }}>
          <Form.Item name="emp_code" label="Emp Code" rules={[{ required: true, message: 'Emp Code is required' }]}><Input /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}><Input /></Form.Item>
          <Form.Item name="doj" label="Date of Joining"><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="designation" label="Designation"><Input /></Form.Item>
          <Form.Item name="location" label="Location"><Input /></Form.Item>
          <Form.Item name="gender" label="Gender"><Input /></Form.Item>
          <Form.Item name="rm_name" label="Reporting Manager (Name)"><Input /></Form.Item>
          <Form.Item name="rm_emp_code" label="Reporting Manager (Emp Code)"><Input /></Form.Item>
          <Form.Item name="employment_type" label="Employment Type"><Input placeholder="Onroll / Contract" /></Form.Item>
          <Form.Item name="company" label="Company"><Input /></Form.Item>
          <Form.Item name="sub_lob" label="Sub-LoB"><Input /></Form.Item>
          <Form.Item name="lob" label="LoB"><Input /></Form.Item>
          <Form.Item name="sbu" label="SBU"><Input /></Form.Item>
          <Form.Item name="is_active" label="Status">
            <Select><Select.Option value={true}>Active</Select.Option><Select.Option value={false}>Inactive</Select.Option></Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeeMaster;
