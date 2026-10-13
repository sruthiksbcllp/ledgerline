import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Switch, InputNumber, Space, Tag, message, Popconfirm, Empty } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';

const DOC_TYPES = ['PR', 'PO', 'GRN', 'QUOTATION', 'RFQ', 'INVOICE'];
const FY_FORMATS = ['YYYY', 'YY', 'FYXX', 'FYXXXX'];
const RESET_OPTIONS = ['YEARLY', 'MONTHLY', 'NEVER'];
const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
];

const NumberingConfig = () => {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/numbering');
      setConfigs(res.data?.data || res.data || []);
    } catch {
      message.error('Failed to load numbering configurations');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ separator: '-', include_fy: true, fy_format: 'YYYY', fy_start_month: 4, sequence_padding: 4, sequence_start: 1, reset_sequence: 'YEARLY' });
    setPreview('');
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue(record);
    setPreview('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await api.put(`/numbering/${editing.id}`, values);
        message.success('Configuration updated');
      } else {
        await api.post('/numbering', values);
        message.success('Configuration created');
      }
      setModalOpen(false);
      fetchConfigs();
    } catch (e) {
      if (e.response?.data?.message) message.error(e.response.data.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/numbering/${id}`);
      message.success('Configuration deactivated');
      fetchConfigs();
    } catch {
      message.error('Failed to deactivate configuration');
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const values = form.getFieldsValue();
      const res = await api.post('/numbering/preview', { document_type: values.document_type });
      setPreview(res.data?.data?.preview || 'N/A');
    } catch {
      setPreview('Preview unavailable');
    }
    setPreviewLoading(false);
  };

  const buildLivePreview = () => {
    const v = form.getFieldsValue();
    if (!v.prefix) return '';
    const sep = v.separator || '-';
    const parts = [v.prefix];
    if (v.include_entity) parts.push('NIM');
    if (v.include_department) parts.push('IT');
    if (v.entity_code) parts.push(v.entity_code);
    if (v.include_fy) {
      const yr = new Date().getFullYear();
      switch (v.fy_format) {
        case 'YY': parts.push(String(yr).slice(-2)); break;
        case 'FYXX': parts.push('FY' + String(yr).slice(-2)); break;
        case 'FYXXXX': parts.push('FY' + yr); break;
        default: parts.push(String(yr));
      }
    }
    parts.push('0'.repeat(v.sequence_padding || 4).slice(0, -1) + '1');
    return parts.join(sep);
  };

  const columns = [
    { title: 'Document Type', dataIndex: 'document_type', key: 'document_type', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Format', key: 'format', render: (_, r) => {
      const sep = r.separator || '-';
      const parts = [r.prefix];
      if (r.include_entity) parts.push('NIM');
      if (r.include_department) parts.push('IT');
      if (r.entity_code) parts.push(r.entity_code);
      if (r.include_fy) parts.push(r.fy_format === 'FYXX' ? 'FY26' : r.fy_format === 'YY' ? '26' : '2026');
      parts.push('0'.repeat(r.sequence_padding || 4).slice(0, -1) + '1');
      return <code>{parts.join(sep)}</code>;
    }},
    { title: 'Prefix', dataIndex: 'prefix', key: 'prefix' },
    { title: 'Entity Code', dataIndex: 'entity_code', key: 'entity_code', render: v => v || '—' },
    { title: 'FY Format', dataIndex: 'fy_format', key: 'fy_format' },
    { title: 'Padding', dataIndex: 'sequence_padding', key: 'sequence_padding' },
    { title: 'Reset', dataIndex: 'reset_sequence', key: 'reset_sequence', render: v => <Tag>{v}</Tag> },
    { title: 'Active', dataIndex: 'is_active', key: 'is_active', render: v => <Tag color={v ? 'green' : 'default'}>{v ? 'Yes' : 'No'}</Tag> },
    {
      title: 'Actions', key: 'actions', render: (_, r) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Deactivate this config?" onConfirm={() => handleDelete(r.id)} okText="Yes" cancelText="No">
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Document Numbering" subtitle="Configure auto-numbering formats for procurement documents" />
      <Card
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchConfigs}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Configuration</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={configs}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="No numbering configurations. Default format will be used." /> }}
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], showTotal: (t) => `Total ${t}` }}
        />
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? 'Edit Numbering Config' : 'New Numbering Config'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        width={640}
        okText={editing ? 'Update' : 'Create'}
      >
        <Form form={form} layout="vertical" onValuesChange={() => setPreview('')}>
          <Form.Item name="document_type" label="Document Type" rules={[{ required: true }]}>
            <Select disabled={!!editing} options={DOC_TYPES.map(d => ({ value: d, label: d }))} placeholder="Select type" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="prefix" label="Prefix" rules={[{ required: true }]}>
              <Input placeholder="e.g. PR, NWB, PO" maxLength={20} />
            </Form.Item>
            <Form.Item name="separator" label="Separator">
              <Select options={[{ value: '-', label: '- (dash)' }, { value: '/', label: '/ (slash)' }, { value: '.', label: '. (dot)' }]} />
            </Form.Item>
          </div>
          <Form.Item name="entity_code" label="Entity Code (optional)">
            <Input placeholder="e.g. MUM, HYD, INDIA" maxLength={20} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Form.Item name="include_fy" label="Include FY" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="include_location" label="Include Location" valuePropName="checked" tooltip="Adds the location code to the document number (after entity code)">
              <Switch />
            </Form.Item>
            <Form.Item name="include_entity" label="Include Entity" valuePropName="checked" tooltip="Adds the buying entity's Short Code (set per entity in Manage Entities), e.g. NIM">
              <Switch />
            </Form.Item>
            <Form.Item name="include_department" label="Include Department" valuePropName="checked" tooltip="Adds the department's Numbering Code (e.g. IT, ADM). Series runs separately per entity+department.">
              <Switch />
            </Form.Item>
            <Form.Item name="fy_format" label="FY Format">
              <Select options={FY_FORMATS.map(f => ({ value: f, label: f }))} />
            </Form.Item>
            <Form.Item name="fy_start_month" label="FY Start Month">
              <Select options={MONTHS} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Form.Item name="sequence_padding" label="Sequence Padding">
              <InputNumber min={1} max={10} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="sequence_start" label="Sequence Start">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="reset_sequence" label="Reset Sequence">
              <Select options={RESET_OPTIONS.map(r => ({ value: r, label: r }))} />
            </Form.Item>
          </div>

          <Card size="small" style={{ background: 'var(--color-bg-page, #f9fafb)', marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Preview: </strong>
                <code style={{ fontSize: 16 }}>{preview || buildLivePreview() || '—'}</code>
              </div>
              <Button size="small" icon={<EyeOutlined />} onClick={handlePreview} loading={previewLoading}>
                Server Preview
              </Button>
            </div>
          </Card>
        </Form>
      </Modal>
    </div>
  );
};

export default NumberingConfig;
