import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Table, Tag, message, Empty, Typography, Space, Popconfirm, Descriptions, Badge, Timeline, Tooltip } from 'antd';
import { Plus, RefreshCcw, FileText, Eye, Trash2, CheckCircle, XCircle } from 'lucide-react';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';

const { Text } = Typography;
const { Option } = Select;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

const STATUS_COLOR = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  PENDING: 'warning',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  PO_CREATED: 'cyan'
};

const UOM_OPTIONS = ['Nos', 'Kg', 'Gram', 'Litre', 'Box', 'Set', 'Pair', 'Metre', 'Pack', 'Dozen', 'Roll', 'Unit', 'Sq.ft', 'Hour', 'Service'];

const PurchaseRequisition = () => {
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [properties, setProperties] = useState([]);
  const [entities, setEntities] = useState([]);
  const [users, setUsers] = useState([]);
  const [assets, setAssets] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [locations, setLocations] = useState([]); // CR-P05
  const [assetVendors, setAssetVendors] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [viewRecord, setViewRecord] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [approveId, setApproveId] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [comments, setComments] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [pr, dep, prop, ent, usr, ast, vnd, cc, loc] = await Promise.all([
        api.get('/procurement/pr'),
        api.get('/masters/departments'),
        api.get('/masters/properties'),
        api.get('/masters/entities').catch(() => ({ data: [] })),
        api.get('/users').catch(() => ({ data: [] })),
        api.get('/assets').catch(() => ({ data: [] })),
        api.get('/masters/vendors').catch(() => ({ data: [] })),
        api.get('/enterprise/cost-centers').catch(() => ({ data: [] })),
        api.get('/masters/locations').catch(() => ({ data: [] }))
      ]);
      setRows(normalizeResponse(pr?.data));
      setDepartments(normalizeResponse(dep?.data));
      setProperties(normalizeResponse(prop?.data));
      setEntities(normalizeResponse(ent?.data));
      setUsers(normalizeResponse(usr?.data));
      setAssets(normalizeResponse(ast?.data));
      setVendors(normalizeResponse(vnd?.data));
      setCostCenters(normalizeResponse(cc?.data));
      setLocations(normalizeResponse(loc?.data));
    } catch {
      message.error('Failed to load requisitions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAssetChange = async (assetId) => {
    form.setFieldValue('vendor_id', undefined);
    setAssetVendors([]);
    if (!assetId) return;
    try {
      const res = await api.get('/procurement/asset-vendors/' + assetId);
      const data = normalizeResponse(res?.data);
      setAssetVendors(data);
      if (data.length === 1) {
        form.setFieldValue('vendor_id', data[0].id);
      }
    } catch {
      // fallback: show all vendors
    }
  };

  const procType = Form.useWatch('procurement_type', form) || 'DIRECT';
  const vendorOptions = assetVendors.length > 0 ? assetVendors : vendors;

  const submit = async (values) => {
    try {
      const payload = {
        property_id: values.property_id,
        department_id: values.department_id,
        entity_id: values.entity_id || null,
        location_id: values.location_id || null,
        cost_center_id: values.cost_center_id || null,
        type: values.type || 'CAPEX',
        required_date: values.required_date ? values.required_date.format('YYYY-MM-DD') : null,
        requested_by_user_id: values.requested_by_user_id || null,
        requestor_name: values.requestor_name || null,
        asset_id: values.asset_id || null,
        vendor_id: values.vendor_id || null,
        justification: values.justification,
        item_description: values.item_description,
        items: (values.items || []).filter((it) => it && it.item_name).map((it) => ({
          item_name: it.item_name,
          quantity: it.quantity || 1,
          unit: it.unit || 'Nos',
          estimated_cost: it.estimated_cost || 0
        }))
      };
      const res = await api.post('/procurement/pr', payload);
      const prId = res?.data?.data?.id || res?.data?.id;
      const rfqVendors = values.rfq_vendor_ids || [];
      let rfqSent = false;
      if (prId && rfqVendors.length >= 1) {
        try {
          const rfqRes = await api.post('/rfqs', { pr_id: prId, vendor_ids: rfqVendors, due_date: payload.required_date || null });
          const rfqId = rfqRes?.data?.data?.id || rfqRes?.data?.id;
          if (rfqId) { await api.post('/rfqs/' + rfqId + '/send'); rfqSent = true; }
        } catch (rfqErr) { /* RFQ not enabled for tenant, or send failed; PR still created */ }
      }
      message.success(rfqSent ? 'PR created and RFQ sent to selected vendors' : 'PR created successfully');
      setOpen(false);
      form.resetFields();
      setAssetVendors([]);
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'PR creation failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete('/procurement/pr/' + id);
      message.success('PR deleted');
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Failed to delete PR');
    }
  };

  const handleApprove = async () => {
    try {
      await api.put('/procurement/pr/' + approveId + '/approve', { comments: comments || 'Approved' });
      message.success('PR approved');
      setApproveId(null);
      setComments('');
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Approval failed');
    }
  };

  const handleReject = async () => {
    try {
      await api.put('/procurement/pr/' + rejectId + '/reject', { comments: comments || 'Rejected' });
      message.success('PR rejected');
      setRejectId(null);
      setComments('');
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Rejection failed');
    }
  };

  const handleView = (record) => {
    setViewRecord(record);
    setViewOpen(true);
  };

  const columns = [
    {
      title: 'PR Number',
      dataIndex: 'pr_number',
      key: 'pr_number',
      render: (text) => <Text strong style={{ color: 'var(--color-info)' }}>{text}</Text>
    },
    {
      title: 'Requestor',
      key: 'requestor',
      render: (_, r) => {
        const u = r.RequestedBy || r.Requestor;
        if (!u) return '-';
        const name = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
        return name || u.username || '-';
      }
    },
    {
      title: 'Entity',
      key: 'entity',
      render: (_, r) => r.Entity?.entity_name || '-'
    },
    {
      title: 'Department',
      dataIndex: ['Department', 'dept_name'],
      key: 'dept'
    },
    {
      title: 'Asset',
      key: 'asset',
      render: (_, r) => r.Asset?.asset_name || '-'
    },
    {
      title: 'Vendor',
      key: 'vendor',
      render: (_, r) => r.Vendor?.vendor_name || '-'
    },
    {
      title: 'Items',
      dataIndex: 'items_count',
      key: 'items',
      align: 'center',
      render: (v) => v || 0
    },
    {
      title: 'Amount',
      dataIndex: 'total_cost',
      key: 'amount',
      render: (val) => {
        const n = Number(val || 0);
        return n > 0 ? '₹' + n.toLocaleString('en-IN') : '-';
      },
      align: 'right'
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => {
        const label = (v || 'DRAFT').replace(/_/g, ' ');
        return <Tag color={STATUS_COLOR[v] || 'default'} style={{ borderRadius: 4 }}>{label}</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, rec) => (
        <Space size={4}>
          <Tooltip title="View Details">
            <Button size="small" type="text" icon={<Eye size={14} />} onClick={() => handleView(rec)} />
          </Tooltip>
          {rec.permissions?.can_approve && (
            <>
              <Tooltip title="Approve">
                <Button size="small" type="text" style={{ color: 'var(--color-success)' }} icon={<CheckCircle size={14} />} onClick={() => { setApproveId(rec.id); setComments(''); }} />
              </Tooltip>
              <Tooltip title="Reject">
                <Button size="small" type="text" style={{ color: 'var(--color-danger)' }} icon={<XCircle size={14} />} onClick={() => { setRejectId(rec.id); setComments(''); }} />
              </Tooltip>
            </>
          )}
          {rec.permissions?.can_delete && (
            <Popconfirm title="Delete this PR?" description="This action cannot be undone." onConfirm={() => handleDelete(rec.id)} okText="Yes, Delete" cancelText="Cancel" okButtonProps={{ danger: true }}>
              <Tooltip title="Delete">
                <Button size="small" type="text" icon={<Trash2 size={14} />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<FileText size={16} />}
        title="Purchase Requisitions"
        subtitle={'Manage procurement requests · ' + rows.length + ' records'}
        actions={
          <Space wrap size={8}>
            <Button icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)} style={primaryBtn}>New PR</Button>
          </Space>
        }
      />

      <Card style={contentCard} styles={{ body: { padding: '16px' } }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={Array.isArray(rows) ? rows : []}
          size="middle"
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], showTotal: (total) => total + ' purchase requisitions' }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">No purchase requisitions found</Text>} /> }}
        />
      </Card>

      {/* Create PR */}
      <Modal title="Create Purchase Requisition" open={open} onCancel={() => { setOpen(false); setAssetVendors([]); }} onOk={() => form.submit()} destroyOnClose okText="Create PR" okButtonProps={primaryBtn} width={600}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="entity_id" label="Entity">
              <Select placeholder="Select entity" allowClear showSearch optionFilterProp="children">
                {entities.map((e) => <Option key={e.id} value={e.id}>{e.entity_name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="property_id" label="Property" rules={[{ required: true, message: 'Select a property' }]}>
              <Select placeholder="Choose property" showSearch optionFilterProp="children">
                {properties.map((p) => <Option key={p.id} value={p.id}>{p.property_name || p.name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="location_id" label="Location">
              <Select placeholder="Select location" allowClear showSearch optionFilterProp="children">
                {locations.map((l) => <Option key={l.id} value={l.id}>{l.location_name || l.name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="department_id" label="Department" rules={[{ required: true, message: 'Select a department' }]}>
              <Select placeholder="Choose department" showSearch optionFilterProp="children">
                {departments.map((d) => <Option key={d.id} value={d.id}>{d.dept_name || d.name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="requested_by_user_id" label="Requested By (system user)">
              <Select placeholder="Select user (optional)" allowClear showSearch optionFilterProp="children">
                {users.map((u) => <Option key={u.id} value={u.id}>{((u.first_name || '') + ' ' + (u.last_name || '')).trim() || u.username}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="requestor_name" label="Requestor Name">
              <Input placeholder="Actual requestor (if not a system user)" />
            </Form.Item>
            <Form.Item name="asset_id" label="Asset Name">
              <Select placeholder="Select asset" allowClear showSearch optionFilterProp="children" onChange={handleAssetChange}>
                {assets.map((a) => <Option key={a.id} value={a.id}>{a.asset_name || a.asset_code}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="procurement_type" label="Procurement Type" initialValue="DIRECT">
              <Select>
                <Option value="DIRECT">Direct (single vendor)</Option>
                <Option value="RFQ">RFQ (request quotes from multiple)</Option>
              </Select>
            </Form.Item>
            <Form.Item name="vendor_id" hidden={procType === 'RFQ'} label={<span>Vendor {assetVendors.length > 0 && <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>Auto</Tag>}</span>}>
              <Select placeholder={assetVendors.length > 0 ? 'Vendors for selected asset' : 'Select vendor'} allowClear showSearch optionFilterProp="children">
                {vendorOptions.map((v) => <Option key={v.id} value={v.id}>{v.vendor_name}{v.source ? ' (' + v.source + ')' : ''}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="rfq_vendor_ids" hidden={procType !== 'RFQ'} label="Request Quotes From (RFQ - up to 5 vendors)">
              <Select mode="multiple" maxCount={5} placeholder="Select vendors to request quotations" allowClear showSearch optionFilterProp="children">
                {vendors.map((v) => <Option key={v.id} value={v.id}>{v.vendor_name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="cost_center_id" label="Cost Center">
              <Select placeholder="Select cost center" allowClear showSearch optionFilterProp="children">
                {costCenters.filter(c => c.is_active !== false).map((c) => <Option key={c.id} value={c.id}>{c.code} - {c.name}</Option>)}
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="type" label="Expense Type" initialValue="CAPEX">
            <Select>
              <Option value="CAPEX">Capex (asset purchase)</Option>
              <Option value="OPEX">Opex (services / consumables / rentals / licenses)</Option>
            </Select>
          </Form.Item>
          <Form.Item name="required_date" label="Required Date">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>Items</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) 84px minmax(0,1fr) minmax(0,1.2fr) 34px', gap: '0 10px', marginBottom: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>
            <div>Item Name <span style={{ color: 'var(--color-danger)' }}>*</span></div>
            <div>Qty</div>
            <div>Unit (UOM)</div>
            <div>Estimated Cost</div>
            <div />
          </div>
          <Form.List name="items" initialValue={[{ quantity: 1, unit: 'Nos', estimated_cost: 0 }]}>
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) 84px minmax(0,1fr) minmax(0,1.2fr) 34px', gap: '0 10px', alignItems: 'start' }}>
                    <Form.Item {...rest} name={[name, 'item_name']} rules={[{ required: true, message: 'Required' }]} style={{ marginBottom: 10 }}>
                      <Input placeholder="e.g., Office Chair" />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'quantity']} initialValue={1} style={{ marginBottom: 10 }}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'unit']} initialValue="Nos" style={{ marginBottom: 10 }}>
                      <Select showSearch options={UOM_OPTIONS.map((u) => ({ value: u, label: u }))} />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'estimated_cost']} initialValue={0} style={{ marginBottom: 10 }}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Button danger type="text" icon={<Trash2 size={16} />} onClick={() => remove(name)} disabled={fields.length === 1} style={{ marginTop: 2, padding: 0 }} />
                  </div>
                ))}
                <Button type="dashed" onClick={() => add({ quantity: 1, unit: 'Nos', estimated_cost: 0 })} icon={<Plus size={16} />} style={{ width: '100%', marginBottom: 12 }}>Add item</Button>
              </>
            )}
          </Form.List>
          <Form.Item name="justification" label="Justification" rules={[{ required: true, message: 'Provide justification' }]}>
            <Input.TextArea rows={3} placeholder="Why is this purchase needed?" />
          </Form.Item>
          <Form.Item name="item_description" label="Additional Notes">
            <Input.TextArea rows={2} placeholder="Any additional specifications or comments" />
          </Form.Item>
        </Form>
      </Modal>

      {/* View PR Details */}
      <Modal
        title="PR Details"
        open={viewOpen}
        onCancel={() => setViewOpen(false)}
        width={640}
        footer={
          <Space>
            {viewRecord?.permissions?.can_approve && (
              <>
                <Button type="primary" style={{ background: 'var(--color-success)', border: 'none' }} icon={<CheckCircle size={14} />} onClick={() => { setViewOpen(false); setApproveId(viewRecord.id); setComments(''); }}>Approve</Button>
                <Button danger icon={<XCircle size={14} />} onClick={() => { setViewOpen(false); setRejectId(viewRecord.id); setComments(''); }}>Reject</Button>
              </>
            )}
            <Button onClick={() => setViewOpen(false)}>Close</Button>
          </Space>
        }
      >
        {viewRecord && (
          <>
            <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="PR Number">{viewRecord.pr_number}</Descriptions.Item>
              <Descriptions.Item label="Entity">{viewRecord.Entity?.entity_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Requested By">
                {viewRecord.RequestedBy ? ((viewRecord.RequestedBy.first_name || '') + ' ' + (viewRecord.RequestedBy.last_name || '')).trim() || viewRecord.RequestedBy.username : viewRecord.Requestor ? ((viewRecord.Requestor.first_name || '') + ' ' + (viewRecord.Requestor.last_name || '')).trim() || viewRecord.Requestor.username : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Requestor Name">{viewRecord.requestor_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Department">{viewRecord.Department?.dept_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Property">{viewRecord.Property?.property_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Asset">{viewRecord.Asset?.asset_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Vendor">{viewRecord.Vendor?.vendor_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Amount">{Number(viewRecord.total_cost || 0) > 0 ? '₹' + Number(viewRecord.total_cost).toLocaleString('en-IN') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Badge status={viewRecord.status === 'APPROVED' ? 'success' : viewRecord.status === 'REJECTED' ? 'error' : 'processing'} text={(viewRecord.status || 'DRAFT').replace(/_/g, ' ')} />
              </Descriptions.Item>
              <Descriptions.Item label="Justification">{viewRecord.justification || '-'}</Descriptions.Item>
              <Descriptions.Item label="Created">{viewRecord.createdAt ? new Date(viewRecord.createdAt).toLocaleDateString('en-IN') : '-'}</Descriptions.Item>
            </Descriptions>

            {viewRecord.items && viewRecord.items.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Line Items</Text>
                <Table
                  dataSource={viewRecord.items}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Item', dataIndex: 'item_name', key: 'item' },
                    { title: 'Qty', dataIndex: 'quantity', key: 'qty', align: 'center' },
                    { title: 'Est. Cost', dataIndex: 'estimated_cost', key: 'cost', align: 'right', render: (v) => Number(v || 0) > 0 ? '₹' + Number(v).toLocaleString('en-IN') : '-' }
                  ]}
                />
              </div>
            )}

            {viewRecord.approval_history && viewRecord.approval_history.length > 0 && (
              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Approval History</Text>
                <Timeline
                  items={viewRecord.approval_history.map((h) => ({
                    color: h.action === 'APPROVED' ? 'green' : h.action === 'REJECTED' ? 'red' : 'blue',
                    children: (
                      <div>
                        <Text strong>{h.action}</Text>
                        <Text type="secondary">{' by ' + (h.User ? ((h.User.first_name || '') + ' ' + (h.User.last_name || '')).trim() || 'System' : 'System')}</Text>
                        {h.comments && <div><Text type="secondary" style={{ fontSize: 12 }}>{h.comments}</Text></div>}
                        {h.timestamp && <div><Text type="secondary" style={{ fontSize: 11 }}>{new Date(h.timestamp).toLocaleString('en-IN')}</Text></div>}
                      </div>
                    )
                  }))}
                />
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Approve Confirmation */}
      <Modal title="Approve Purchase Requisition" open={!!approveId} onCancel={() => setApproveId(null)} onOk={handleApprove} okText="Approve" okButtonProps={{ style: { background: 'var(--color-success)', border: 'none' } }}>
        <Input.TextArea rows={3} placeholder="Add approval comments (optional)" value={comments} onChange={(e) => setComments(e.target.value)} />
      </Modal>

      {/* Reject Confirmation */}
      <Modal title="Reject Purchase Requisition" open={!!rejectId} onCancel={() => setRejectId(null)} onOk={handleReject} okText="Reject" okButtonProps={{ danger: true }}>
        <Input.TextArea rows={3} placeholder="Reason for rejection (required)" value={comments} onChange={(e) => setComments(e.target.value)} />
      </Modal>
    </div>
  );
};

export default PurchaseRequisition;
