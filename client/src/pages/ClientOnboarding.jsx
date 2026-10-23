import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Form, Input, Select, Space, Tag, message, Row, Col, Typography, InputNumber, Switch, Modal, List, Popconfirm, Tooltip } from 'antd';
import { Plus, UserPlus, Users, Trash2, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const { Title, Text } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const ClientOnboarding = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [deletePreviewOpen, setDeletePreviewOpen] = useState(false);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deletePreview, setDeletePreview] = useState(null);
  const [targetDeleteClientId, setTargetDeleteClientId] = useState(null);
  const [planType, setPlanType] = useState('Standard');
  const [unlimitedAssets, setUnlimitedAssets] = useState(false);
  const [unlimitedUsers, setUnlimitedUsers] = useState(false);
  const [form] = Form.useForm();

  const fetchClients = async () => {
    setLoading(true);
    try {
      const response = await api.get('/clients-management/clients');
      setClients(response?.data?.data || []);
    } catch {
      message.error('Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  };

  const fetchEntities = async () => {
    try {
      const res = await api.get('/masters/entities');
      setEntities(res?.data?.data || res?.data || []);
    } catch { /* entities optional — fail silently */ }
  };

  useEffect(() => {
    fetchClients();
    fetchEntities();
  }, []);

  const purgeTenant = async (clientId) => {
    try {
      const res = await api.delete('/clients-management/clients/' + clientId);
      // Backend maps 500 -> HTTP 200 with success:false, so a resolved response is NOT
      // proof of deletion. Only treat success:true as deleted.
      if (res?.data?.success === true) {
        message.success(res?.data?.message || 'Tenant and client fully deleted');
        fetchClients();
      } else {
        message.error(res?.data?.message || 'Failed to delete tenant data');
      }
    } catch (error) {
      message.error(error?.response?.data?.message || 'Failed to delete tenant data');
    }
  };

  const openDeletePreview = async (record) => {
    setTargetDeleteClientId(record?.id || null);
    setDeletePreviewOpen(true);
    setDeletePreviewLoading(true);
    try {
      const response = await api.get('/clients-management/clients/' + record.id + '/dry-run-delete');
      setDeletePreview(response?.data?.data || null);
    } catch (error) {
      setDeletePreview(null);
      message.error(error?.response?.data?.message || 'Failed to load delete preview');
    } finally {
      setDeletePreviewLoading(false);
    }
  };

  const onFinish = async (values) => {
    try {
      const getPreset = (plan) => {
        if (plan === 'Enterprise') return { max_assets: 1000, max_users: 50 };
        if (plan === 'Pro') return { max_assets: 500, max_users: 20 };
        if (plan === 'Standard') return { max_assets: 100, max_users: 5 };
        return { max_assets: 100, max_users: 10 };
      };

      const preset = getPreset(values.plan);
      const customAssets = values.max_assets ?? preset.max_assets;
      const customUsers = values.max_users ?? preset.max_users;

      await api.post('/clients-management/clients', {
        ...values,
        initial_plan: {
          name: values.plan === 'Custom' ? (values.custom_plan_name || 'Custom') : values.plan,
          max_assets: unlimitedAssets ? -1 : customAssets,
          max_users: unlimitedUsers ? -1 : customUsers
        }
      });
      message.success('Client onboarded successfully');
      form.resetFields();
      setPlanType('Standard');
      setUnlimitedAssets(false);
      setUnlimitedUsers(false);
      setIsModalVisible(false);
      fetchClients();
    } catch (error) {
      message.error(error.response?.data?.message || 'Failed to onboard client');
    }
  };

  const columns = [
    { title: 'Client Name', dataIndex: 'client_name', key: 'client_name' },
    { title: 'Contact Person', dataIndex: 'contact_person', key: 'contact_person' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'Company Type', dataIndex: 'company_type', key: 'company_type' },
    {
      title: 'Subdomain',
      dataIndex: 'subdomain',
      key: 'subdomain',
      render: (sub) => sub
        ? <Tag color="geekblue">{sub}.fixtag.in</Tag>
        : <Tag color="default">Not set</Tag>
    },
    {
      title: 'Current Plan',
      key: 'plan',
      render: (_, record) => {
        const activeLicense = record.licenses?.find(l => l.status === 'ACTIVE');
        return activeLicense ? <Tag color="blue">{activeLicense.plan_name}</Tag> : <Tag color="red">No Plan</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
      width: 120,
      render: (_, record) => (
        <Space size={8}>
          <Tooltip title="Features">
            <Button
              type="text"
              icon={<Settings size={14} color="var(--color-navy)" />}
              onClick={() => navigate('/system/features', { state: { client_id: record.id, client_name: record.client_name } })}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this tenant?"
            description="This action cannot be undone and will show an impact preview."
            onConfirm={() => openDeletePreview(record)}
            okText="Yes, Preview & Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button type="text" icon={<Trash2 size={14} color="var(--color-danger)" />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div className="page-header-icon"><Users size={24}  /></div>
              <div>
                <h2 className="page-header-title">Client Onboarding</h2>
                <p className="page-header-sub">
                  Manage tenant provisioning and licensing
                </p>
              </div>
            </Space>
          </Col>
          <Col>
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setIsModalVisible(true)} style={primaryBtn}>
              Onboard New Client
            </Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col span={isModalVisible ? 16 : 24}>
          <Card className="fams-card" styles={{ body: { padding: '0' } }}>
            <Table
              columns={columns}
              dataSource={clients}
              loading={loading}
              rowKey="id"
              size="middle"
              pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => t + ' records' }}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: 'No records found' }}
            />
          </Card>
        </Col>

        {isModalVisible && (
          <Col span={8}>
            <Card
              style={contentCard}
              title={
                <Space>
                  <UserPlus size={15} color="var(--color-orange)" />
                  <Text strong style={{ fontSize: 14 }}>Onboarding Form</Text>
                </Space>
              }
              styles={{ body: { padding: '14px 20px' } }}
              extra={<Button type="text" onClick={() => setIsModalVisible(false)}>X</Button>}
            >
              <Form form={form} layout="vertical" onFinish={onFinish}>
                <Form.Item name="client_name" label="Client Name" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="contact_person" label="Contact Person" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="phone" label="Phone" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="company_type" label="Company Type">
                  <Select placeholder="Select type">
                    <Select.Option value="Enterprise">Enterprise</Select.Option>
                    <Select.Option value="SME">SME</Select.Option>
                    <Select.Option value="Government">Government</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  name="subdomain"
                  label="Subdomain"
                  extra="e.g. abc → client accesses abc.fixtag.in"
                  rules={[
                    { required: true, message: 'Subdomain is required' },
                    { pattern: /^[a-z0-9-]+$/, message: 'Only lowercase letters, numbers and hyphens allowed' },
                    { min: 2, max: 30, message: '2–30 characters' }
                  ]}
                >
                  <Input
                    addonAfter=".fixtag.in"
                    placeholder="abc"
                    onChange={(e) => {
                      form.setFieldsValue({ subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') });
                    }}
                  />
                </Form.Item>
                <Form.Item name="entity_id" label="Entity" tooltip="Link this client to a legal entity for immutable audit tracking">
                  <Select placeholder="Select entity (optional)" allowClear showSearch optionFilterProp="children">
                    {entities.map((e) => (
                      <Select.Option key={e.id} value={e.id}>
                        {e.entity_name}{e.entity_code ? ` (${e.entity_code})` : ''}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="plan" label="Select Initial Plan" rules={[{ required: true }]} initialValue="Standard">
                  <Select placeholder="Select plan" onChange={(v) => setPlanType(v)}>
                    <Select.Option value="Standard">Standard (100 Assets, 5 Users)</Select.Option>
                    <Select.Option value="Pro">Pro (500 Assets, 20 Users)</Select.Option>
                    <Select.Option value="Enterprise">Enterprise (1000 Assets, 50 Users)</Select.Option>
                    <Select.Option value="Custom">Custom (Set your own limits)</Select.Option>
                  </Select>
                </Form.Item>
                {planType === 'Custom' && (
                  <>
                    <Form.Item name="custom_plan_name" label="Custom Plan Name" rules={[{ required: true }]}>
                      <Input placeholder="e.g. Enterprise Unlimited" />
                    </Form.Item>
                    <Form.Item label="Unlimited Assets" valuePropName="checked">
                      <Switch checked={unlimitedAssets} onChange={setUnlimitedAssets} />
                    </Form.Item>
                    {!unlimitedAssets && (
                      <Form.Item name="max_assets" label="Max Assets" rules={[{ required: true }]}>
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    )}
                    <Form.Item label="Unlimited Users" valuePropName="checked">
                      <Switch checked={unlimitedUsers} onChange={setUnlimitedUsers} />
                    </Form.Item>
                    {!unlimitedUsers && (
                      <Form.Item name="max_users" label="Max Users" rules={[{ required: true }]}>
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    )}
                  </>
                )}
                <Form.Item>
                  <Button type="primary" htmlType="submit" block icon={<UserPlus size={16} />} style={primaryBtn}>
                    Complete Onboarding
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </Col>
        )}
      </Row>

      <Modal
        open={deletePreviewOpen}
        title="Delete Tenant - Dry Run Preview"
        onCancel={() => {
          setDeletePreviewOpen(false);
          setDeletePreview(null);
          setTargetDeleteClientId(null);
        }}
        onOk={async () => {
          if (!targetDeleteClientId) return;
          await purgeTenant(targetDeleteClientId);
          setDeletePreviewOpen(false);
          setDeletePreview(null);
          setTargetDeleteClientId(null);
        }}
        okText="Proceed Delete"
        okButtonProps={{ danger: true, loading: deletePreviewLoading }}
      >
        {deletePreview && (
          <div style={{ padding: '12px 0' }}>
            <div style={{ background: '#FFF7ED', border: '1px solid #FFEDD5', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text strong style={{ color: '#9A3412' }}>Final Warning</Text>
                <Text style={{ color: '#9A3412', fontSize: 13 }}>
                  This action is irreversible. All assets, users, properties, and configuration for this tenant will be purged from the database.
                </Text>
              </Space>
            </div>

            <Title level={5}>Purge Statistics:</Title>
            <List
              size="small"
              dataSource={deletePreview.impacted_tables || []}
              locale={{ emptyText: 'No data to purge' }}
              renderItem={(item) => (
                <List.Item extra={<Tag color="red">{item.rows} rows</Tag>}>
                  {item.table}
                </List.Item>
              )}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ClientOnboarding;