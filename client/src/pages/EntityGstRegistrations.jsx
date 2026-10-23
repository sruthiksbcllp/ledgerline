import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, message, Empty, Card, Popconfirm, DatePicker } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import dayjs from 'dayjs';

const TAXPAYER_TYPES = ['REGULAR', 'SEZ', 'ISD', 'COMPOSITION'];
const STATUSES = ['ACTIVE', 'SURRENDERED'];
const TT_COLOR = { REGULAR: 'green', SEZ: 'purple', ISD: 'blue', COMPOSITION: 'orange' };
const ST_COLOR = { ACTIVE: 'green', SURRENDERED: 'red' };

const EntityGstRegistrations = () => {
  const [entities, setEntities] = useState([]);
  const [entityId, setEntityId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [addressDraft, setAddressDraft] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  const [form] = Form.useForm();

  const fetchEntities = useCallback(async () => {
    try {
      const res = await api.get('/masters/entities');
      const list = res.data?.data || res.data || [];
      setEntities(list);
      if (list.length && !entityId) setEntityId(list[0].id);
    } catch { message.error('Failed to load entities'); }
  }, [entityId]);

  const fetchRegs = useCallback(async (eid) => {
    if (!eid) { setRows([]); return; }
    setLoading(true);
    try {
      const res = await api.get(`/masters/entities/${eid}/gst`);
      setRows(res.data?.data || res.data || []);
    } catch { message.error('Failed to load GST registrations'); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEntities(); }, [fetchEntities]);
  useEffect(() => { fetchRegs(entityId); }, [entityId, fetchRegs]);
  useEffect(() => { const e = entities.find((x) => x.id === entityId); setAddressDraft((e && e.address) || ''); }, [entityId, entities]);

  const openAdd = () => { setEditingId(null); form.resetFields(); form.setFieldsValue({ taxpayer_type: 'REGULAR', status: 'ACTIVE' }); setModalOpen(true); };
  const openEdit = (r) => {
    setEditingId(r.id);
    form.setFieldsValue({ ...r, reg_date: r.reg_date ? dayjs(r.reg_date) : null });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    setSubmitting(true);
    try {
      const payload = { ...values, reg_date: values.reg_date ? values.reg_date.format('YYYY-MM-DD') : null };
      if (editingId) {
        await api.put(`/masters/entity-gst/${editingId}`, payload);
        message.success('GST registration updated');
      } else {
        await api.post(`/masters/entities/${entityId}/gst`, payload);
        message.success('GST registration added');
      }
      setModalOpen(false); form.resetFields(); setEditingId(null);
      fetchRegs(entityId);
    } catch (err) { message.error(err.response?.data?.message || 'Failed to save'); }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/masters/entity-gst/${id}`);
      message.success('GST registration deleted');
      fetchRegs(entityId);
    } catch (err) { message.error(err.response?.data?.message || 'Failed to delete'); }
  };

  const handleSaveAddress = async () => {
    if (!entityId) return;
    setSavingAddress(true);
    try {
      await api.put(`/masters/entities/${entityId}`, { address: addressDraft });
      message.success('Registered address saved');
      fetchEntities();
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to save address'); }
    setSavingAddress(false);
  };

  const columns = [
    { title: 'State', dataIndex: 'state_name', key: 'state_name', render: (v, r) => <span>{v || '-'} <Tag>{r.state_code}</Tag></span> },
    { title: 'GSTIN', dataIndex: 'gstin', key: 'gstin', render: (v) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: 'Type', dataIndex: 'taxpayer_type', key: 'taxpayer_type', render: (v) => <Tag color={TT_COLOR[v] || 'default'}>{v}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v) => <Tag color={ST_COLOR[v] || 'default'}>{v}</Tag> },
    { title: 'Reg. Date', dataIndex: 'reg_date', key: 'reg_date', render: (v) => v || '-' },
    {
      title: 'Actions', key: 'actions', render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this GST registration?" description="This action cannot be undone." okText="Yes, Delete" cancelText="Cancel" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24, background: 'var(--color-bg-page)', minHeight: '100vh' }}>
      <PageHeader title="Entity GST Registrations" subtitle="Per-entity, state-wise GSTINs (place-of-supply source)" />
      <Card style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-medium)' }}>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
          <Space wrap>
            <span style={{ color: 'var(--color-text-muted)' }}>Entity:</span>
            <Select
              style={{ minWidth: 320 }}
              value={entityId}
              onChange={setEntityId}
              showSearch
              optionFilterProp="children"
              placeholder="Select entity"
            >
              {entities.map((e) => <Select.Option key={e.id} value={e.id}>{e.entity_name}</Select.Option>)}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={() => fetchRegs(entityId)}>Refresh</Button>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} disabled={!entityId} style={{ background: 'var(--gradient-orange)', border: 'none' }}>Add GSTIN</Button>
        </Space>
        {entityId && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: 'var(--color-text-muted)', marginBottom: 6, fontSize: 13 }}>Registered address (prints on the PO &quot;Bill To&quot;)</div>
            <Input.TextArea rows={2} value={addressDraft} onChange={(e) => setAddressDraft(e.target.value)} placeholder="Registered office address for this entity" />
            <div style={{ marginTop: 8 }}><Button type="primary" loading={savingAddress} onClick={handleSaveAddress} style={{ background: 'var(--gradient-orange)', border: 'none' }}>Save Address</Button></div>
          </div>
        )}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          locale={{ emptyText: <Empty description="No GST registrations for this entity" /> }}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], showTotal: (t) => `${t} registrations` }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title={editingId ? 'Edit GST Registration' : 'Add GST Registration'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingId(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText={editingId ? 'Update' : 'Add'}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="gstin" label="GSTIN" rules={[{ required: true, message: 'GSTIN is required' }, { pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, message: 'Invalid GSTIN format' }]}>
            <Input placeholder="27AAHCN9328A1ZH" style={{ textTransform: 'uppercase' }} maxLength={15} />
          </Form.Item>
          <Form.Item name="state_name" label="State"><Input placeholder="MAHARASHTRA" /></Form.Item>
          <Form.Item name="taxpayer_type" label="Taxpayer Type" initialValue="REGULAR">
            <Select>{TAXPAYER_TYPES.map((x) => <Select.Option key={x} value={x}>{x}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="ACTIVE">
            <Select>{STATUSES.map((x) => <Select.Option key={x} value={x}>{x}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="reg_date" label="Registration Date"><DatePicker style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EntityGstRegistrations;
