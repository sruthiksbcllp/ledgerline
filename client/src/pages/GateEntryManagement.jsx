import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Space, Button, message, Empty, Modal, Form, Select, InputNumber, Input, Divider, Drawer, Descriptions, Popconfirm } from 'antd';
import { ShieldCheck, RefreshCcw, Plus, Minus, Eye, Trash2 } from 'lucide-react';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';
import { ActivityTrail, lastActionColumn, useLastActions } from '../components/procurement/ActivityTrail';

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };

const QC_COLOR = { PASS: 'success', PASSED: 'success', PARTIAL: 'warning', FAIL: 'error', FAILED: 'error', PENDING: 'default' };

const GateEntryManagement = () => {
  const [entries, setEntries] = useState([]);
  const [pos, setPos] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [poItems, setPoItems] = useState([]);
  const [viewRow, setViewRow] = useState(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [geRes, poRes, propRes] = await Promise.all([
        api.get('/procurement/gate-entries'),
        api.get('/procurement/grn/purchase-orders'),
        api.get('/masters/properties')
      ]);
      setEntries(normalizeResponse(geRes));
      setPos(normalizeResponse(poRes));
      setProperties(normalizeResponse(propRes));
    } catch {
      message.error('Failed to load gate entry data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handlePOChange = async (poId) => {
    setSelectedPO(poId);
    try {
      const res = await api.get(`/procurement/po/${poId}`);
      const po = res?.data?.data || res?.data || res;
      const items = po?.items || [];
      setPoItems(items.map(i => ({
        ...i,
        already_received: Number(i.received_quantity || 0),
        received_quantity: 0,
        accepted_quantity: 0,
        rejected_quantity: 0,
        damaged_quantity: 0
      })));
      form.setFieldsValue({ property_id: po.property_id });
    } catch {
      message.error('Failed to load PO details');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const items = poItems.filter(i => i.received_quantity > 0).map(i => ({
        po_item_id: i.id,
        received_quantity: i.received_quantity,
        accepted_quantity: i.accepted_quantity,
        rejected_quantity: i.rejected_quantity,
        damaged_quantity: i.damaged_quantity,
        qc_remarks: i.qc_remarks || ''
      }));
      if (!items.length) { message.warning('Enter received quantities for at least one item'); return; }
      await api.post('/procurement/gate-entries', {
        po_id: values.po_id,
        property_id: values.property_id,
        vehicle_number: values.vehicle_number,
        challan_number: values.challan_number,
        remarks: values.remarks,
        create_grn: values.create_grn !== false,
        items
      });
      message.success('Gate entry created');
      setOpen(false);
      form.resetFields();
      setPoItems([]);
      setSelectedPO(null);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to create gate entry');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/procurement/gate-entries/${id}`);
      message.success('Gate entry deleted');
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to delete gate entry');
    }
  };

  const updateItemQty = (index, field, value) => {
    setPoItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const lastActions = useLastActions('GATE_ENTRY', entries, entries);

  const columns = [
    { title: 'Gate Entry #', dataIndex: 'gate_entry_number', key: 'ge', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'PO', key: 'po', render: (_, r) => r?.PurchaseOrder?.po_number || '-' },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r?.Vendor?.vendor_name || '-' },
    { title: 'Vehicle', dataIndex: 'vehicle_number', key: 'vehicle' },
    { title: 'Challan', dataIndex: 'challan_number', key: 'challan' },
    { title: 'Items', key: 'items', render: (_, r) => r?.items?.length || 0 },
    { title: 'GRN', key: 'grn', render: (_, r) => r?.GRN ? <Tag color="success">{r.GRN.grn_number}</Tag> : <Tag>Pending</Tag> },
    { title: 'Date', dataIndex: 'createdAt', key: 'date', render: v => v ? new Date(v).toLocaleDateString('en-IN') : '-' },
    lastActionColumn('GATE_ENTRY', lastActions, { numberOf: (r) => r.gate_entry_number }),
    { title: 'Actions', key: 'actions', fixed: 'right', width: 130, render: (_, r) => {
      const posted = !!r?.grn_id || !!r?.GRN;
      return (
        <Space size="small">
          <Button size="small" icon={<Eye size={14} />} onClick={() => setViewRow(r)}>View</Button>
          {posted ? (
            <Button size="small" danger disabled icon={<Trash2 size={14} />} title="A GRN was generated — cannot delete" />
          ) : (
            <Popconfirm
              title="Delete this gate entry?"
              description="This action cannot be undone."
              okText="Yes, Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(r.id)}
            >
              <Button size="small" danger icon={<Trash2 size={14} />} />
            </Popconfirm>
          )}
        </Space>
      );
    }}
  ];

  const itemColumns = [
    { title: 'Item', dataIndex: 'item_name', key: 'item', width: 180 },
    { title: 'Ordered', dataIndex: 'quantity', key: 'ordered', width: 80, align: 'right' },
    { title: 'Already Received', dataIndex: 'already_received', key: 'already', width: 100, align: 'right', render: v => v || 0 },
    { title: 'Receiving Now', key: 'receiving', width: 100, render: (_, r, idx) => (
      <InputNumber min={0} max={Number(r.quantity) - Number(r.already_received || 0)} size="small" value={poItems[idx]?.received_quantity || 0}
        onChange={v => { updateItemQty(idx, 'received_quantity', v || 0); updateItemQty(idx, 'accepted_quantity', v || 0); }} />
    )},
    { title: 'Accepted', key: 'accepted', width: 100, render: (_, r, idx) => (
      <InputNumber min={0} max={poItems[idx]?.received_quantity || 0} size="small" value={poItems[idx]?.accepted_quantity || 0}
        onChange={v => updateItemQty(idx, 'accepted_quantity', v || 0)} />
    )},
    { title: 'Rejected', key: 'rejected', width: 100, render: (_, r, idx) => (
      <InputNumber min={0} max={poItems[idx]?.received_quantity || 0} size="small" value={poItems[idx]?.rejected_quantity || 0}
        onChange={v => updateItemQty(idx, 'rejected_quantity', v || 0)} />
    )},
    { title: 'Damaged', key: 'damaged', width: 100, render: (_, r, idx) => (
      <InputNumber min={0} max={poItems[idx]?.received_quantity || 0} size="small" value={poItems[idx]?.damaged_quantity || 0}
        onChange={v => updateItemQty(idx, 'damaged_quantity', v || 0)} />
    )}
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<ShieldCheck size={16} />}
        title="Gate Entry & Quality Check"
        subtitle={`${entries.length} entries`}
        actions={(
          <Space>
            <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={fetchData}>Refresh</Button>
            <Button icon={<Plus size={16} />} type="primary" onClick={() => setOpen(true)}>New Gate Entry</Button>
          </Space>
        )}
      />

      <Card style={contentCard} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          locale={{ emptyText: <Empty description="No gate entries found" style={{ margin: '40px 0' }} /> }}
          dataSource={entries}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], showTotal: t => `Total: ${t}` }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal open={open} title="Create Gate Entry" onCancel={() => { setOpen(false); setPoItems([]); setSelectedPO(null); }} onOk={handleCreate} okText="Submit Gate Entry" width={900} destroyOnClose>
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="po_id" label="Purchase Order" rules={[{ required: true }]}>
              <Select placeholder="Select PO" onChange={handlePOChange}>
                {pos.map(p => <Select.Option key={p.id} value={p.id}>{p.po_number} — {p.Vendor?.vendor_name || ''}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="property_id" label="Property" rules={[{ required: true }]}>
              <Select placeholder="Select Property">
                {properties.map(p => <Select.Option key={p.id} value={p.id}>{p.property_name || p.name}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="vehicle_number" label="Vehicle Number">
              <Input placeholder="e.g. AP09AB1234" />
            </Form.Item>
            <Form.Item name="challan_number" label="Challan / DC Number">
              <Input placeholder="Delivery challan reference" />
            </Form.Item>
          </div>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>

        {poItems.length > 0 && (
          <>
            <Divider>Quality Check — Line Items</Divider>
            <Table columns={itemColumns} dataSource={poItems} rowKey="id" size="small" pagination={false} scroll={{ x: 'max-content' }} />
          </>
        )}
      </Modal>

      <Drawer
        open={!!viewRow}
        onClose={() => setViewRow(null)}
        width={780}
        title={viewRow ? `Gate Entry ${viewRow.gate_entry_number || ''}` : 'Gate Entry'}
      >
        {viewRow && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Gate Entry #">{viewRow.gate_entry_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Date">{viewRow.createdAt ? new Date(viewRow.createdAt).toLocaleDateString('en-IN') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Purchase Order">{viewRow.PurchaseOrder?.po_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Vendor">{viewRow.Vendor?.vendor_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Vehicle">{viewRow.vehicle_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Challan / DC">{viewRow.challan_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="QC Status"><Tag color={QC_COLOR[viewRow.qc_status] || 'default'}>{viewRow.qc_status || 'PENDING'}</Tag></Descriptions.Item>
              <Descriptions.Item label="GRN">{viewRow.GRN ? <Tag color="success">{viewRow.GRN.grn_number}</Tag> : <Tag>Pending</Tag>}</Descriptions.Item>
              <Descriptions.Item label="Remarks" span={2}>{viewRow.remarks || '-'}</Descriptions.Item>
            </Descriptions>

            <Divider>Quality Check — Line Items</Divider>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={viewRow.items || []}
              locale={{ emptyText: 'No line items' }}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Item', dataIndex: 'item_name', key: 'item' },
                { title: 'Received', dataIndex: 'received_quantity', key: 'recv', align: 'right' },
                { title: 'Accepted', dataIndex: 'accepted_quantity', key: 'acc', align: 'right' },
                { title: 'Rejected', dataIndex: 'rejected_quantity', key: 'rej', align: 'right' },
                { title: 'Damaged', dataIndex: 'damaged_quantity', key: 'dmg', align: 'right' },
                { title: 'QC Remarks', dataIndex: 'qc_remarks', key: 'rem' }
              ]}
            />
            <div style={{ marginTop: 20 }}>
              <ActivityTrail module="GATE_ENTRY" id={viewRow.id} refreshKey={entries} />
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
};

export default GateEntryManagement;
