import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Select, DatePicker, Space, message, Table, InputNumber, Tag } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';

const MAX_VENDORS = 5;

export default function CreateRfq() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [prId, setPrId] = useState(params.get('pr_id') ? Number(params.get('pr_id')) : null);
  const [form] = Form.useForm();
  const [vendors, setVendors] = useState([]);
  const [prs, setPrs] = useState([]);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [autoTitle, setAutoTitle] = useState(null);

  const blankItems = () => [{ item_name: '', quantity: 1, unit: 'PCS' }];

  const loadPrs = async () => {
    try {
      const res = await api.get('/procurement/pr');
      // Rejected/cancelled requisitions cannot be sent for quotation.
      setPrs(normalizeResponse(res?.data).filter((pr) => !['REJECTED', 'CANCELLED'].includes(pr.status)));
    } catch { setPrs([]); }
  };

  // Pull the requisition's items in and default the title to "RFQ for <PR number>".
  const applyPr = async (id) => {
    setPrId(id || null);
    if (!id) return;
    try {
      const pr = await api.get(`/procurement/pr/${id}`);
      const data = pr?.data?.data || pr?.data;
      const its = (data?.items || []).map((p) => ({ item_name: p.item_name, quantity: p.quantity, unit: p.unit || p.uom || 'PCS' }));
      setItems(its.length ? its : blankItems());
      const title = form.getFieldValue('title');
      if (data?.pr_number && (!title || title === autoTitle)) {
        const next = `RFQ for ${data.pr_number}`;
        form.setFieldValue('title', next);
        setAutoTitle(next);
      }
    } catch {
      message.error('Could not load the PR items');
    }
  };

  const loadVendors = async () => {
    try {
      const v = await api.get('/masters/vendors');
      setVendors(normalizeResponse(v?.data));
    } catch (e) {
      message.error(e?.response?.data?.message || 'Failed to load vendors');
    }
  };

  useEffect(() => {
    (async () => {
      setItems(blankItems());
      await Promise.all([loadVendors(), loadPrs()]);
      const fromLink = params.get('pr_id');
      if (fromLink) await applyPr(Number(fromLink));
    })();
    // Runs once on open; later PR changes go through applyPr.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPr = prs.find((pr) => Number(pr.id) === Number(prId));

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
      <PageHeader title="Create RFQ" subtitle={prId ? `From PR ${selectedPr?.pr_number || `#${prId}`}` : 'Standalone'} />
      <Card style={{ borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-medium)' }}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item
            label="PR number"
            extra={prId ? 'Items below are copied from this requisition; you can still edit them.' : 'Optional. Pick a purchase requisition to copy its items, or leave empty for a standalone RFQ.'}
          >
            <Select
              allowClear
              showSearch
              value={prId || undefined}
              placeholder="Search by PR number"
              optionFilterProp="label"
              onChange={(id) => applyPr(id)}
              onOpenChange={(open) => { if (open) loadPrs(); }}
              options={prs.map((pr) => ({
                value: pr.id,
                label: `${pr.pr_number || `PR #${pr.id}`}${pr.justification ? ` · ${pr.justification}` : ''}`,
              }))}
              optionRender={(opt) => {
                const pr = prs.find((p) => p.id === opt.value);
                return (
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <span>{opt.label}</span>
                    <Space size={6}>
                      {pr?.total_cost != null && <span style={{ color: 'var(--color-text-muted)' }}>₹{Number(pr.total_cost).toLocaleString('en-IN')}</span>}
                      <Tag style={{ marginInlineEnd: 0 }}>{String(pr?.status || '').replace(/_/g, ' ')}</Tag>
                    </Space>
                  </Space>
                );
              }}
            />
          </Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="RFQ title" /></Form.Item>
          <Form.Item name="vendor_ids" label={`Vendors (max ${MAX_VENDORS})`} rules={[{ required: true }]}>
            <Select mode="multiple" maxCount={MAX_VENDORS} placeholder="Select 3-5 vendors"
              options={vendors.map((v) => ({ label: v.vendor_name, value: v.id }))} optionFilterProp="label" showSearch
              onOpenChange={(open) => { if (open) loadVendors(); }} />
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
