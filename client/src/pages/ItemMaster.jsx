import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Card, Tag, Modal, Form, Input, Select, message, Popconfirm, Empty, Row, Col, Tooltip } from 'antd';
import { Plus, Edit2, Trash2, Package } from 'lucide-react';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';

const { Option } = Select;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const ItemMaster = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [_saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get('/items');
      const rows = normalizeResponse(res);
      let inventoryRows = (rows || []).filter(item => item.item_type === 'INVENTORY');

      if (!inventoryRows.length) {
        const balanceRes = await api.get('/inventory/balance').catch(() => null);
        const balanceRows = normalizeResponse(balanceRes);
        const byId = new Map();
        (Array.isArray(balanceRows) ? balanceRows : []).forEach((b) => {
          const item = b?.Item || {};
          if (!item?.id || byId.has(item.id)) return;
          byId.set(item.id, {
            id: item.id,
            sku_code: item.sku_code || '-',
            item_name: item.item_name || '-',
            unit: item.unit || '-',
            min_stock_level: item.min_stock_level ?? 0,
            status: item.status || 'ACTIVE',
            item_type: 'INVENTORY',
            AssetCategory: item.AssetCategory || null
          });
        });
        inventoryRows = Array.from(byId.values());
      }

      setItems(inventoryRows);
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to fetch inventory items');
    } finally {
      setLoading(false);
    }
  };

  const fetchMasters = async () => {
    try {
      const [catRes, subRes] = await Promise.all([
        api.get('/masters/categories'),
        api.get('/masters/sub-categories')
      ]);
      setCategories(normalizeResponse(catRes));
      setSubCategories(normalizeResponse(subRes));
    } catch { /* silenced */ }
  };

  useEffect(() => {
    fetchItems();
    fetchMasters();
  }, []);

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const onFinish = async (values) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        item_type: 'INVENTORY'
      };

      if (editingItem) {
        await api.put(`/items/${editingItem.id}`, payload);
        message.success('Item updated successfully');
      } else {
        await api.post('/items', payload);
        message.success('Item created successfully');
      }
      setIsModalVisible(false);
      fetchItems();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/items/${id}`);
      message.success('Item deleted successfully');
      fetchItems();
    } catch (err) {
      message.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const columns = [
    { title: 'SKU', dataIndex: 'sku_code', key: 'sku_code' },
    { title: 'Item Name', dataIndex: 'item_name', key: 'item_name' },
    { title: 'Category', dataIndex: ['AssetCategory', 'category_name'], key: 'category' },
    { title: 'Unit', dataIndex: 'unit', key: 'unit' },
    { title: 'Min Stock', dataIndex: 'min_stock_level', key: 'min_stock' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{(status) ? (status).charAt(0)+(status).slice(1).toLowerCase() : '—'}</Tag>
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<Edit2 size={15} color="var(--color-navy)" />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete this item?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Yes, Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" icon={<Trash2 size={15} color="var(--color-danger)" />} />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="page-header-icon"><Package size={24}  /></div>
              <div>
                <h2 className="page-header-title">Item Master</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>Centralized repository for non-depreciable inventory items</p>
              </div>
            </div>
          </Col>
          <Col>
            <Button type="primary" icon={<Plus size={16} />} onClick={handleAdd} style={primaryBtn}>
              Add Item
            </Button>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: "var(--color-text-muted)" }}>No records found</span>} /> }}
          dataSource={items}
          loading={loading}
          rowKey="id"
          size="middle"
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `Total ${t} items` }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title={editingItem ? 'Edit Item' : 'Add Item'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="item_name" label="Item Name" rules={[{ required: true }]}>
              <Input placeholder="Enter item name" />
            </Form.Item>
            <Form.Item name="sku_code" label="SKU Code" rules={[{ required: true }]}>
              <Input placeholder="Enter SKU" />
            </Form.Item>
            <Form.Item name="category_id" label="Category" rules={[{ required: true }]}>
              <Select placeholder="Select category">
                {categories.map(c => <Option key={c.id} value={c.id}>{c.name || c.category_name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="sub_category_id" label="Sub Category">
              <Select placeholder="Select sub-category">
                {subCategories.map(s => <Option key={s.id} value={s.id}>{s.name || s.sub_category_name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="unit" label="Unit" initialValue="Nos">
              <Select>
                <Option value="Nos">Nos</Option>
                <Option value="Kg">Kg</Option>
                <Option value="Liters">Liters</Option>
                <Option value="Meters">Meters</Option>
                <Option value="Pack">Pack</Option>
              </Select>
            </Form.Item>
            <Form.Item name="min_stock_level" label="Min Stock Level">
              <Input type="number" />
            </Form.Item>
            <Form.Item name="reorder_level" label="Reorder Level">
              <Input type="number" />
            </Form.Item>
            <Form.Item name="status" label="Status" initialValue="ACTIVE">
              <Select>
                <Option value="ACTIVE">Active</Option>
                <Option value="INACTIVE">Inactive</Option>
              </Select>
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ItemMaster;
