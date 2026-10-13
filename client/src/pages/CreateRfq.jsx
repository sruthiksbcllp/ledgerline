import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Select, DatePicker, Space, message, Table, InputNumber } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';

const MAX_VENDORS = 5;

export default function CreateRfq() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const prId = params.get('pr_id');
  const [form] = Form.useForm();
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await api.get('/masters/vendors');
        setVendors(v?.data?.data || v?.data || []);
      } catch { /* ignore */ }
      if (prId) {
        try {
          const pr = await api.get(`/procurement/pr/${prId}`);
          const data = pr?.data?.data || pr?.data;
          const its = (data?.items || []).map((p) => ({ item_name: p.item_name, quantity: p.quantity, unit: p.unit }));
          setItems(its.length ? its : [{ item_name: '', quantity: 1, unit: 'PCS' }]);
        } catch { setItems([{ item_name: '', quantity: 1, unit: 'PCS' }]); }
      } else { setItems([{ item_name: '', quantity: 1, unit: 'PCS' }]); }
    })();
  }, [prId]);

  const submit = async (vals) => {
    if (!vals.vendor_ids || vals.vendor_ids.length === 0) return message.error('Select at least one vendor');
    if (vals.vendor_ids.length > MAX_VENDORS) return message.error(`Max ${MAX_VENDORS} vendors`);
    setSaving(true);
    try {
      await api.post('/rfqs', { pr_id: prId || null, title: vals.title, due_date: vals.due_date, remarks: vals.remarks, vendor_ids: vals.vendor_ids, items });
      message.success('RFQ created');
      navigate('/procurement/rfq');
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to create RFQ'); }
    finally { setSaving(false); }
  };

  const itemCols = [
    { title: 'Item', dataIndex: 'item_name', render: (_, r, i) => <Input value={r.item_name} onChange={(e) => { const n = [...items]; n[i].item_name = e.target.value; setItems(n); }} /> },
    { title: 'Qty', dataIndex: 'quantity', width: 100, render: (_, r, i) => <InputNumber min={0} value={r.quantity} onChange={(v) => { const n = [...items]; n[i].quantity = v; setItems(n); }} /> },
    { title: 'Unit', dataIndex: 'unit', width: 100, render: (_, r, i) => <Input value={r.unit} onChange={(e) => { const n = [...items]; n[i].unit = e.target.value; setItems(n); }} /> }
  ];

  return (
    <div style={{ padding: 'var(--space-4, 16px)' }}>
      <PageHeader title="Create RFQ" subtitle={prId ? `From PR #${prId}` : 'Standalone'} />
      <Card style={{ borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-medium)' }}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="RFQ title" /></Form.Item>
          <Form.Item name="vendor_ids" label={`Vendors (max ${MAX_VENDORS})`} rules={[{ required: true }]}>
            <Select mode="multiple" maxCount={MAX_VENDORS} placeholder="Select 3-5 vendors"
              options={vendors.map((v) => ({ label: v.vendor_name, value: v.id }))} optionFilterProp="label" showSearch />
          </Form.Item>
          <Form.Item name="due_date" label="Due date"><DatePicker style={{ width: 240 }} /></Form.Item>
          <Form.Item name="remarks" label="Remarks"><Input.TextArea rows={2} /></Form.Item>
          <Table rowKey={(_, i) => i} columns={itemCols} dataSource={items} pagination={false} size="small" style={{ marginBottom: 12 }} />
          <Button onClick={() => setItems([...items, { item_name: '', quantity: 1, unit: 'PCS' }])} style={{ marginBottom: 16 }}>+ Add item</Button>
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => navigate('/procurement/rfq')}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ background: 'var(--gradient-orange)', border: 'none' }}>Create RFQ</Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
