import React, { useState, useEffect } from 'react';
import {
  Layout, Menu, Table, Button, Space, Row, Col,
  Card, Modal, Form, Input, Select,
  message, Tag, Typography, Divider, Popconfirm, Tooltip
} from 'antd';

import { Database, Plus, Edit2, Trash2, CheckCircle, XCircle, ArrowLeft, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';

// Valid deep-link tabs (mirrors mastersConfig keys) — used to initialise the active tab from the URL.
const VALID_MASTER_TABS = ['categories', 'subcategories', 'types', 'statuses', 'propertyTypes', 'locations', 'departments', 'units'];
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

const COMPANIES_ACT_CATEGORY_PRESETS = [
  { name: 'Buildings (RCC Frame)', code: 'BLD-RCC', life: 60, method: 'SLM', itRate: 10, itBlock: 'Non-Residential Buildings' },
  { name: 'Buildings (Other)', code: 'BLD-OTH', life: 30, method: 'SLM', itRate: 10, itBlock: 'Non-Residential Buildings' },
  { name: 'Factory Buildings', code: 'BLD-FAC', life: 30, method: 'SLM', itRate: 10, itBlock: 'Non-Residential Buildings' },
  { name: 'Furniture & Fittings', code: 'FURN', life: 10, method: 'SLM', itRate: 10, itBlock: 'Furniture & Fittings' },
  { name: 'Computers & Software', code: 'COMP', life: 3, method: 'SLM', itRate: 40, itBlock: 'Computers & Software' },
  { name: 'Plant & Machinery (General)', code: 'PLNT', life: 15, method: 'SLM', itRate: 15, itBlock: 'Plant & Machinery (general)' },
  { name: 'Office Equipment', code: 'OFF', life: 5, method: 'SLM', itRate: 15, itBlock: 'Plant & Machinery (general)' },
  { name: 'Motor Vehicles', code: 'VEH', life: 8, method: 'SLM', itRate: 15, itBlock: 'Motor Vehicles (personal)' },
  { name: 'Air/Water Craft', code: 'AWRF', life: 20, method: 'SLM', itRate: 20, itBlock: 'Ships' }
];

const MasterManagement = () => {
  const navigate = useNavigate();
  const [activeMaster, setActiveMaster] = useState(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return (t && VALID_MASTER_TABS.includes(t)) ? t : 'categories';
  });
  const [searchParams] = useSearchParams();
  const [masterData, setMasterData] = useState([]);
  const [categories, setCategories] = useState([]);

  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form] = Form.useForm();

  const mastersConfig = {
    categories: { label: 'Asset Categories', endpoint: '/masters/categories', nameKey: 'category_name' },
    subcategories: { label: 'Asset Sub Categories', endpoint: '/masters/sub-categories', nameKey: 'sub_category_name' },
    types: { label: 'Asset Types', endpoint: '/masters/asset-types', nameKey: 'name' },
    statuses: { label: 'Asset Status', endpoint: '/masters/asset-statuses', nameKey: 'status_name' },
    propertyTypes: { label: 'Property Types', endpoint: '/masters/property-types', nameKey: 'type_name' },
    locations: { label: 'Locations', endpoint: '/masters/locations', nameKey: 'location_name' },
    departments: { label: 'Departments', endpoint: '/masters/departments', nameKey: 'dept_name' },
    units: { label: 'Units of Measure', endpoint: '/masters/units', nameKey: 'name' }
  };

  const fetchMastersData = async () => {
    setLoading(true);
    try {
      const res = await api.get(mastersConfig[activeMaster].endpoint);
      const data = normalizeResponse(res);
      setMasterData(Array.isArray(data) ? data : []);

      if (activeMaster === 'subcategories') {
        const catRes = await api.get('/masters/categories');
        setCategories(normalizeResponse(catRes));
      }
    } catch (err) {
      setMasterData([]);
      message.error(err?.response?.data?.message || `Failed to load ${mastersConfig[activeMaster].label}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMastersData();
  }, [activeMaster]);

  // Deep-link: /masters?tab=<key> selects that master tab (from the Master Data nav group).
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && mastersConfig[t] && t !== activeMaster) setActiveMaster(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const generateCode = (name) => {
    if (!name) return '';
    return name
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 0)
      .join('_')
      .substring(0, 20);
  };

  const handleNameChange = (e) => {
    const name = e.target.value;
    // Only auto-fill the code when it's currently empty (never overwrite an existing stable code).
    if (!form.getFieldValue('code')) form.setFieldsValue({ code: generateCode(name) });
  };

  const getMasterLabel = () => {
    const base = mastersConfig[activeMaster].label
      .replace('Categories', 'Category')
      .replace('Sub Categories', 'Sub Category')
      .replace('Details', '')
      .trim();
    return `${base} Name`;
  };

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ status: 'ACTIVE', companies_act_method: 'SLM' });
    setIsModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingItem(record);
    const resolvedName = record[mastersConfig[activeMaster].nameKey] || record.name || record.vendor_name || record.type_name || record.status_name;
    form.setFieldsValue({ ...record, name: resolvedName });
    // Legacy records may have a blank code -> suggest one from the name so it can be saved.
    if (!record.code) form.setFieldsValue({ code: generateCode(resolvedName) });
    setIsModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`${mastersConfig[activeMaster].endpoint}/${id}`);
      message.success('Item deleted successfully');
      fetchMastersData();
    } catch (err) {
      message.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const onFinish = async (values) => {
    try {
      if (activeMaster === 'categories' && !values.category_preset && !editingItem) {
        message.error('Please select a Companies Act category preset');
        return;
      }
      if (activeMaster === 'subcategories' && !values.category_id) {
        message.error('Please select a parent asset category');
        return;
      }
      const payload = { ...values };
      const apiNameKey = (() => {
        if (activeMaster === 'types') return 'name';
        if (activeMaster === 'vendors') return 'vendor_name';
        return mastersConfig[activeMaster].nameKey;
      })();
      payload[apiNameKey] = values.name;
      if (!payload.code && values.name) payload.code = generateCode(values.name);

      if (editingItem) {
        await api.put(`${mastersConfig[activeMaster].endpoint}/${editingItem.id}`, payload);
        message.success('Item updated successfully');
      } else {
        await api.post(mastersConfig[activeMaster].endpoint, payload);
        message.success('Item created successfully');
      }
      setIsModalVisible(false);
      fetchMastersData();
    } catch (err) {
      message.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const columns = [
    {
      title: 'Code',
      key: 'code',
      render: (_, record) => {
        const code = record.code || record.dept_code || record.location_code || record.vendor_code || record.region_code || record.sub_category_code || '';
        return <Tag color="blue">{code || 'N/A'}</Tag>;
      }
    },
    {
      title: 'Name',
      dataIndex: mastersConfig[activeMaster].nameKey,
      key: 'name',
      render: (text, record) => (
        <span style={{ fontWeight: 'var(--weight-semibold)' }}>
          {text || record?.name || record?.vendor_name || record?.type_name || record?.status_name || record?.category_name || '-'}
        </span>
      )
    },
    ...(activeMaster === 'categories' ? [
      {
        title: 'Companies Act (Life/Method)',
        key: 'co_act',
        render: (_, r) => `${r.companies_act_life || 0}Y / ${r.companies_act_method || 'SLM'}`
      },
      {
        title: 'IT Act (Rate/Block)',
        key: 'it_act',
        render: (_, r) => `${r.it_act_rate || 0}% / ${r.it_act_block || 'N/A'}`
      }
    ] : []),
    ...(!['statuses', 'categories'].includes(activeMaster) ? [{
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const safeStatus = status || 'ACTIVE';
        return (
          <Tag color={safeStatus === 'ACTIVE' ? 'green' : 'red'} icon={safeStatus === 'ACTIVE' ? <CheckCircle size={12} /> : <XCircle size={12} />}>
            {safeStatus}
          </Tag>
        );
      }
    }] : []),
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<Edit2 size={14} color="var(--color-navy)" />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete this record?"
            description="This may affect dropdowns in other modules."
            okText="Yes, Delete"
            cancelText="Cancel"
            onConfirm={() => handleDelete(record.id)}
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" icon={<Trash2 size={14} color="var(--color-danger)" />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const menuItems = Object.entries(mastersConfig).map(([key, cfg]) => ({
    key,
    label: cfg.label,
    icon: <Database size={16} />
  }));

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100vh', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<Database size={16} />}
        title="Manage Masters"
        subtitle="Configure core reference data for assets, departments, and locations"
        actions={<Button icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>Back</Button>}
      />

      <Layout style={{ background: 'transparent', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Internal master rail is hidden when arriving via a Master Data deep-link (the sidebar handles navigation); shown for a bare /masters visit. */}
        {!searchParams.get('tab') && (
        <Sider
          width={260}
          theme="light"
          style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRight: '1px solid var(--color-border-medium)'
          }}
        >
          <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
            <Title level={2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-navy)' }}>
              <Database size={16} /> Master Data
            </Title>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[activeMaster]}
            items={menuItems}
            onSelect={({ key }) => setActiveMaster(key)}
            style={{ border: 'none', background: 'transparent' }}
          />
        </Sider>
        )}

        <Content style={{ padding: '24px', background: 'transparent' }}>
          <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
            <Row justify="space-between" align="middle" gutter={[16, 16]}>
              <Col>
                <div>
                  <h2 className="page-header-title">Manage Masters</h2>
                
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    Manage system-wide {mastersConfig[activeMaster].label.toLowerCase()} for consistency.
                  </p>
                </div>
              </Col>
              <Col>
                <Button type="primary" icon={<Plus size={16} />} onClick={handleAdd} style={primaryBtn}>
                  Add New {mastersConfig[activeMaster].label.replace('Categories', 'Category').replace('Sub Categories', 'Sub Category')}
                </Button>
              </Col>
            </Row>
          </Card>

          <Card style={contentCard} styles={{ body: { padding: 16 } }}>
            <div style={{ marginBottom: 16 }}>
              <Input
                placeholder={`Search ${mastersConfig[activeMaster].label.toLowerCase()}...`}
                prefix={<Search size={14} color="var(--color-text-muted)" />}
                allowClear
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ maxWidth: 320, borderRadius: 'var(--radius-md)' }}
              />
            </div>
            <Table
              columns={columns}
              dataSource={masterData.filter(item => {
                const q = searchText.toLowerCase();
                const name = item[mastersConfig[activeMaster].nameKey] || item.name || item.vendor_name || item.type_name || item.status_name || '';
                const code = item.code || '';
                return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
              })}
              loading={loading}
              rowKey="id"
              size="middle"
              pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 10, showTotal: (total) => `Total: ${total} records` }}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: `No ${mastersConfig[activeMaster].label.toLowerCase()} found` }}
            />
          </Card>
        </Content>
      </Layout>

      <Modal
        title={`${editingItem ? 'Edit' : 'Add'} ${mastersConfig[activeMaster].label}`}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        destroyOnClose
        width={activeMaster === 'categories' ? 800 : 600}
        styles={{ body: { paddingTop: 16 } }}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Divider orientation="left" style={{ marginTop: 0 }}>Basic Information</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label={getMasterLabel()}
                rules={[{ required: true, message: `Please enter ${getMasterLabel()}` }]}
              >
                {activeMaster === 'categories' && !editingItem ? (
                  <Select
                    placeholder="Select Schedule II Category"
                    size="large"
                    showSearch
                    optionFilterProp="children"
                    onChange={(value) => {
                      const preset = COMPANIES_ACT_CATEGORY_PRESETS.find((p) => p.name === value);
                      if (!preset) return;
                      form.setFieldsValue({
                        name: preset.name,
                        code: preset.code,
                        companies_act_life: preset.life,
                        companies_act_method: preset.method,
                        it_act_rate: preset.itRate,
                        it_act_block: preset.itBlock,
                        category_preset: preset.name
                      });
                    }}
                  >
                    {COMPANIES_ACT_CATEGORY_PRESETS.map((preset) => (
                      <Option key={preset.name} value={preset.name}>
                        {preset.name}
                      </Option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    placeholder={`e.g. ${
                      { categories: 'IT Equipment', subcategories: 'Laptops', locations: 'Main Office', regions: 'South India', departments: 'Finance', subdepartments: 'Accounts Payable', statuses: 'Active', maintenance_types: 'Preventive', property_types: 'Owned' }[activeMaster] || 'Enter name'
                    }`}
                    size="large"
                    onChange={handleNameChange}
                  />
                )}
              </Form.Item>
              {activeMaster === 'categories' && !editingItem && (
                <Form.Item name="category_preset" hidden>
                  <Input />
                </Form.Item>
              )}
            </Col>
            <Col span={12}>
              <Form.Item
                name="code"
                label="System Code"
                rules={[{ required: true, message: 'System code is required' }]}
                extra="Auto-generated from name"
              >
                <Input
                  placeholder="AUTO_GEN"
                  size="large"
                  readOnly={!!editingItem && !!editingItem.code}
                  style={{ background: 'var(--color-bg-page)', fontWeight: 'var(--weight-semibold)' }}
                />
              </Form.Item>
            </Col>
          </Row>

          {activeMaster === 'subcategories' && (
            <>
              <Form.Item name="category_id" label="Parent Asset Category" rules={[{ required: true }]}>
                <Select placeholder="Select Parent Category" size="large" showSearch optionFilterProp="children">
                  {categories.map(c => (
                    <Option key={c.id} value={c.id}>{c.category_name}</Option>
                  ))}
                </Select>
              </Form.Item>
              <Divider orientation="left">Companies Act — Schedule II</Divider>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="useful_life" label="Useful Life — Schedule II (Years)">
                    <Input type="number" min={1} placeholder="e.g. 10" size="large" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="companies_act_method" label="Depreciation Method" initialValue="SLM">
                    <Select size="large">
                      <Option value="SLM">SLM (Straight Line)</Option>
                      <Option value="WDV">WDV (Written Down Value)</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="it_act_rate" label="IT Act Depreciation Rate (%)">
                    <Input type="number" min={0} max={100} placeholder="e.g. 15" size="large" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="it_act_block" label="IT Act Asset Block">
                    <Input placeholder="e.g. Computers, Machinery" size="large" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="residual_pct"
                    label="Residual Value % (max 5%)"
                    rules={[{ validator: (_, v) => (!v || Number(v) <= 5) ? Promise.resolve() : Promise.reject('Cannot exceed 5% per Schedule II') }]}
                  >
                    <Input type="number" min={0} max={5} placeholder="5" size="large" />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name="schedule_ii_classification" label="Schedule II Classification (CARO 2020)">
                    <Input placeholder="e.g. Plant & Machinery — General (Continuous Process)" size="large" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {activeMaster === 'categories' && (
            <>
              <Divider orientation="left">Companies Act (Book Depreciation)</Divider>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="companies_act_life" label="Useful Life (Years)">
                    <Input type="number" min={1} placeholder="e.g. 10" size="large" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="companies_act_method" label="Depreciation Method" initialValue="SLM">
                    <Select size="large">
                      <Option value="SLM">SLM (Straight Line)</Option>
                      <Option value="WDV">WDV (Written Down Value)</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Divider orientation="left">Income Tax Act (Tax Depreciation)</Divider>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="it_act_rate" label="Depreciation Rate (%)">
                    <Input type="number" min={0} max={100} placeholder="e.g. 15" size="large" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="it_act_block" label="Tax Block Name">
                    <Input placeholder="e.g. Machinery & Plant" size="large" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          <Divider orientation="left">Status & Availability</Divider>
          <Form.Item name="status" label="Active Status" initialValue="ACTIVE">
            <Select size="large">
              <Option value="ACTIVE">Active (Available across system)</Option>
              <Option value="INACTIVE">Inactive (Hidden from dropdowns)</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MasterManagement;
