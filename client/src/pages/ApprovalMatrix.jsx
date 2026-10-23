import React, { useEffect, useState } from 'react';
import {
  Button, Card, Form, Input, InputNumber, message, Modal, Popconfirm,
  Select, Space, Table, Tabs, Tag, Typography, Row, Col, Empty, Tooltip
} from 'antd';
import { Edit2, Plus, Shield, Trash2 } from 'lucide-react';
import api from '../utils/api';
import { safeApiCall } from '../utils/safeApiCall';
import { LEDGERLINE_ROLES } from '../config/rbac';

const { Title, Text } = Typography;
const { Option } = Select;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const MODULES = ['PR', 'PO', 'DISPOSAL', 'GRN', 'MOVEMENT'];
const ROLES = LEDGERLINE_ROLES;

const ApprovalMatrix = () => {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [activeModule, setActiveModule] = useState('ALL');
  const [form] = Form.useForm();

  const fetchMatrix = async () => {
    setLoading(true);
    try {
      const matrixData = await safeApiCall(() =>
        api.get('/approvals/matrix' + (activeModule !== 'ALL' ? `?module=${activeModule}` : ''))
      );
      setWorkflows(Array.isArray(matrixData) ? matrixData : []);
    } catch {
      message.error('Failed to load approval matrix');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMatrix(); }, [activeModule]);

  const handleSave = async (values) => {
    try {
      const payload = {
        ...values,
        mode: String(values.mode || 'COLLECTIVE').toUpperCase(),
        threshold_amount: Number(values.threshold_amount || 0)
      };
      if (editingRule) {
        await api.put(`/approvals/matrix/${editingRule.id}`, payload);
        message.success('Rule updated');
      } else {
        await api.post('/approvals/matrix', payload);
        message.success('Rule created');
      }
      setModalOpen(false);
      setEditingRule(null);
      form.resetFields();
      fetchMatrix();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/approvals/matrix/${id}`);
      message.success('Rule deactivated');
      fetchMatrix();
    } catch {
      message.error('Delete failed');
    }
  };

  const allRules = workflows.flatMap((wf) =>
    (wf.matrix || []).map((r) => ({ ...r, workflow_module: wf.module }))
  );

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div className="page-header-icon"><Shield size={24}  /></div>
              <div>
                <h2 className="page-header-title">Approval Matrix Configuration</h2>
                <p className="page-header-sub">Configure line or collective approval by threshold and amount range</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<Plus size={14} />}
              onClick={() => { setEditingRule(null); form.resetFields(); form.setFieldsValue({ mode: 'COLLECTIVE', threshold_amount: 0 }); setModalOpen(true); }}
              style={{ height: 34, borderRadius: 'var(--radius-md)' }}
            >
              Add Rule
            </Button>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard}>
        <Tabs activeKey={activeModule} onChange={setActiveModule} items={[
          { key: 'ALL', label: 'All Modules' },
          ...MODULES.map((m) => ({ key: m, label: m }))
        ]} />

        <Table
          loading={loading}
          rowKey="id"
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: "var(--color-text-muted)" }}>No rules configured</span>} /> }}
          dataSource={allRules}
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 15, showTotal: (total) => `Total ${total} rules` }}
          size="middle"
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Module', dataIndex: 'module_name', key: 'module', render: (mod, rec) => <Tag color="blue">{mod || rec.workflow_module}</Tag> },
            { title: 'Level', dataIndex: 'level', key: 'level', render: (l) => <Tag color={l === 1 ? 'green' : l === 2 ? 'orange' : 'red'}>Level {l}</Tag> },
            { title: 'Required Role', dataIndex: 'role', key: 'role', render: (role) => <Text strong>{role}</Text> },
            { title: 'Mode', dataIndex: 'mode', key: 'mode', render: (m) => <Tag color={String(m || 'COLLECTIVE').toUpperCase() === 'LINE' ? 'orange' : 'green'}>{String(m || 'COLLECTIVE').toUpperCase()}</Tag> },
            { title: 'Threshold', dataIndex: 'threshold_amount', key: 'threshold_amount', render: (v) => <Text>₹{Number(v || 0).toLocaleString('en-IN')}</Text> },
            { title: 'Amount Range', key: 'range', render: (_, r) => <Text>₹{Number(r.min_amount || 0).toLocaleString('en-IN')} - {r.max_amount ? `₹${Number(r.max_amount).toLocaleString('en-IN')}` : 'No Limit'}</Text> },
            { title: 'Status', dataIndex: 'is_active', key: 'status', render: (a) => <Tag color={a ? 'green' : 'red'}>{a ? 'Active' : 'Inactive'}</Tag> },
            {
              title: 'Actions',
              key: 'actions',
              width: 80,
              fixed: 'right',
              render: (_, record) => (
                <Space size={4}>
                  <Tooltip title="Edit">
                    <Button
                      type="text"
                      size="small"
                      icon={<Edit2 size={15} color="var(--color-navy)" />}
                      onClick={() => { setEditingRule(record); form.setFieldsValue(record); setModalOpen(true); }}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="Deactivate this rule?"
                    description="This action cannot be undone."
                    onConfirm={() => handleDelete(record.id)}
                    okText="Yes, Delete"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true }}
                  >
                    <Tooltip title="Delete">
                      <Button
                        type="text"
                        size="small"
                        icon={<Trash2 size={15} color="var(--color-danger)" />}
                      />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Modal
        title={editingRule ? 'Edit Approval Rule' : 'Add Approval Rule'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditingRule(null); form.resetFields(); }}
        onOk={() => form.submit()}
        destroyOnClose
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="module_name" label="Module" rules={[{ required: true }]}>
            <Select>{MODULES.map((m) => <Option key={m} value={m}>{m}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="level" label="Approval Level" rules={[{ required: true }]}>
            <InputNumber min={1} max={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="role_code" label="Required Role" rules={[{ required: true }]}>
            <Select onChange={(val) => {
              const role = ROLES.find((r) => r.code === val);
              if (role) form.setFieldsValue({ role: role.name });
            }}>
              {ROLES.map((r) => <Option key={r.code} value={r.code}>{r.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="role" label="Role Display Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="mode" label="Approval Mode" initialValue="COLLECTIVE" rules={[{ required: true }]}>
            <Select>
              <Option value="COLLECTIVE">COLLECTIVE</Option>
              <Option value="LINE">LINE</Option>
            </Select>
          </Form.Item>
          <Form.Item name="threshold_amount" label="Threshold Amount (₹)" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="min_amount" label="Min Amount (₹)" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="max_amount" label="Max Amount (₹, blank = unlimited)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ApprovalMatrix;
