import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Table, Tag, message, Empty, Typography, Space, Popconfirm, Descriptions, Badge, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCcw, FileText, Eye, Trash2, CheckCircle, XCircle } from 'lucide-react';
import api from '../utils/api';
import { getStoredUser, hasPerm } from '../utils/session';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';
import { ActivityTrail, lastActionColumn, useLastActions } from '../components/procurement/ActivityTrail';

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

const typedAssetName = (record) => {
  const line = String(record?.item_description || '').split('\n').find((row) => row.startsWith('Asset: '));
  return line ? line.slice(7).trim() : '';
};

const PurchaseRequisition = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [properties, setProperties] = useState([]);
  const [entities, setEntities] = useState([]);
  const [users, setUsers] = useState([]);
  const [assets, setAssets] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]); // CR-P05
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
      const [pr, dep, prop, ent, usr, ast, vnd, loc] = await Promise.all([
        api.get('/procurement/pr').catch(() => null),
        api.get('/masters/departments').catch(() => null),
        api.get('/masters/properties').catch(() => null),
        api.get('/masters/entities').catch(() => ({ data: [] })),
        api.get('/users').catch(() => ({ data: [] })),
        api.get('/assets').catch(() => ({ data: [] })),
        api.get('/masters/vendors').catch(() => ({ data: [] })),
        api.get('/masters/locations').catch(() => ({ data: [] }))
      ]);
      if (pr) setRows(normalizeResponse(pr.data));
      else message.error('Failed to load requisitions');
      if (dep) setDepartments(normalizeResponse(dep.data));
      if (prop) setProperties(normalizeResponse(prop.data));
      setEntities(normalizeResponse(ent?.data));
      setUsers(normalizeResponse(usr?.data));
      setAssets(normalizeResponse(ast?.data));
      setVendors(normalizeResponse(vnd?.data));
      setLocations(normalizeResponse(loc?.data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const procType = Form.useWatch('procurement_type', form) || 'DIRECT';
  const onboardedVendors = vendors.filter((vendor) => String(vendor.status || '').toUpperCase() === 'ACTIVE');

  const recordId = (res) => res?.data?.data?.id ?? res?.data?.id ?? null;

  const findNamed = (list, typed, fields) => {
    const query = String(typed || '').trim().toLowerCase();
    if (!query) return null;
    return (list || []).find((row) => fields.some((field) => String(row[field] || '').trim().toLowerCase() === query)) || null;
  };

  const codeFrom = (name) => {
    const base = String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'GEN';
    return (base + String(Date.now()).slice(-4)).slice(0, 12);
  };

  const ensureNamed = async (list, typed, fields, create) => {
    const name = String(typed || '').trim();
    if (!name) return null;
    const found = findNamed(list, name, fields);
    if (found?.id) return found.id;
    const res = await create(name);
    return recordId(res);
  };

  const submit = async (values) => {
    try {
      const propertyName = String(values.property_name || '').trim();
      const departmentName = String(values.department_name || '').trim();
      if (!propertyName || !departmentName) {
        message.error('Enter a property and a department');
        return;
      }

      const propertyId = await ensureNamed(properties, propertyName, ['property_name', 'name'], async (name) => {
        const typeRes = await api.get('/masters/property-types').catch(() => ({ data: [] }));
        const types = normalizeResponse(typeRes?.data);
        let typeId = types[0]?.id || null;
        if (!typeId) {
          const made = await api.post('/masters/property-types', { type_name: 'Office', status: 'ACTIVE' });
          typeId = recordId(made);
        }
        return api.post('/masters/properties', { property_name: name, property_type_id: typeId, status: 'ACTIVE', client_id: 1 });
      });
      const departmentId = await ensureNamed(departments, departmentName, ['dept_name', 'name'], async (name) => {
        const code = codeFrom(name);
        return api.post('/masters/departments', { dept_name: name, dept_code: code, numbering_code: code.slice(0, 10), status: 'ACTIVE', client_id: 1 });
      });
      if (!propertyId || !departmentId) {
        message.error('Could not save the property or department');
        return;
      }

      const resolvedEntityId = await ensureNamed(entities, values.entity_name, ['entity_name', 'name'], (name) => (
        api.post('/masters/entities', { entity_name: name, entity_code: codeFrom(name), client_id: 1 })
      )).catch(() => null);

      let locationId = null;
      const locationName = String(values.location_name || '').trim();
      if (locationName) {
        const existingLocation = findNamed(locations, locationName, ['location_name', 'name']);
        if (existingLocation?.id) {
          locationId = existingLocation.id;
        } else {
          try {
            const regionRes = await api.get('/masters/regions').catch(() => ({ data: [] }));
            const regions = normalizeResponse(regionRes?.data);
            let regionId = regions[0]?.id || null;
            if (!regionId) {
              const madeRegion = await api.post('/masters/regions', { region_name: 'General', region_code: 'GEN', status: 'ACTIVE' });
              regionId = recordId(madeRegion);
            }
            if (regionId) {
              const madeLocation = await api.post('/masters/locations', {
                location_name: locationName,
                location_code: codeFrom(locationName),
                region_id: regionId,
                property_id: propertyId,
                status: 'ACTIVE',
                client_id: 1
              });
              locationId = recordId(madeLocation);
            }
          } catch {
            locationId = null;
          }
        }
      }

      const procurementType = values.procurement_type || 'DIRECT';
      const vendorId = procurementType === 'RFQ' ? null : (values.vendor_id || null);
      const rfqVendors = procurementType === 'RFQ' ? (values.rfq_vendor_ids || []).slice(0, 5) : [];

      const typedRequestor = String(values.requestor_name || values.requested_by_name || '').trim();
      const matchedUser = users.find((user) => {
        const full = ((user.first_name || '') + ' ' + (user.last_name || '')).trim().toLowerCase();
        const query = typedRequestor.toLowerCase();
        return query && (full === query || String(user.username || '').toLowerCase() === query);
      });
      const matchedAsset = findNamed(assets, values.asset_name, ['asset_name', 'asset_code', 'name']);
      const assetName = String(values.asset_name || '').trim();
      const notes = String(values.item_description || '').trim();
      const itemDescription = [!matchedAsset && assetName ? `Asset: ${assetName}` : '', notes].filter(Boolean).join('\n') || null;

      const payload = {
        property_id: propertyId,
        department_id: departmentId,
        entity_id: resolvedEntityId || null,
        location_id: locationId,
        cost_center: String(values.cost_center || '').trim() || null,
        type: values.type || 'CAPEX',
        required_date: values.required_date ? values.required_date.format('YYYY-MM-DD') : null,
        requested_by_user_id: matchedUser?.id || null,
        requestor_name: typedRequestor || null,
        asset_id: matchedAsset?.id || null,
        vendor_id: vendorId || null,
        vendor_suggestion: null,
        justification: values.justification,
        item_description: itemDescription,
        items: (values.items || []).filter((it) => it && it.item_name).map((it) => ({
          item_name: it.item_name,
          quantity: it.quantity || 1,
          unit: it.unit || 'Nos',
          estimated_cost: it.estimated_cost || 0
        }))
      };
      const res = await api.post('/procurement/pr', payload);
      const prId = res?.data?.data?.id || res?.data?.id;
      let rfqId = null;
      if (prId && rfqVendors.length >= 1) {
        try {
          const rfqRes = await api.post('/rfqs', { pr_id: prId, vendor_ids: rfqVendors, due_date: payload.required_date || null });
          rfqId = rfqRes?.data?.data?.id || rfqRes?.data?.id;
          if (rfqId) await api.post('/rfqs/' + rfqId + '/send');
        } catch (rfqErr) { /* RFQ not enabled for tenant, or send failed; PR still created */ }
      }
      message.success(rfqId ? 'PR created and RFQ sent to the selected vendors' : 'PR created successfully');
      setOpen(false);
      form.resetFields();
      if (rfqId) navigate('/procurement/rfq/' + rfqId);
      else navigate(prId ? '/procurement/rfq/create?pr_id=' + prId : '/procurement/rfq');
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

  const lastActions = useLastActions('PR', rows, rows);

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
      render: (_, r) => r.Asset?.asset_name || typedAssetName(r) || '-'
    },
    {
      title: 'Vendor',
      key: 'vendor',
      render: (_, r) => r.Vendor?.vendor_name || r.vendor_suggestion || '-'
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
    lastActionColumn('PR', lastActions, { numberOf: (r) => r.pr_number }),
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
            {hasPerm(getStoredUser(), 'PR', 'ADD') && <Button type="primary" icon={<Plus size={16} />} onClick={async () => { setOpen(true); try { const vnd = await api.get('/masters/vendors'); setVendors(normalizeResponse(vnd?.data)); } catch { /* keep the vendors already loaded */ } }} style={primaryBtn}>New PR</Button>}
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
      <Modal title="Create Purchase Requisition" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} destroyOnClose okText="Create PR" okButtonProps={primaryBtn} width={600}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="entity_name" label="Entity">
              <Input placeholder="Enter entity" />
            </Form.Item>
            <Form.Item name="property_name" label="Property" rules={[{ required: true, message: 'Enter a property' }]}>
              <Input placeholder="Enter property" />
            </Form.Item>
            <Form.Item name="location_name" label="Location">
              <Input placeholder="Enter location" />
            </Form.Item>
            <Form.Item name="department_name" label="Department" rules={[{ required: true, message: 'Enter a department' }]}>
              <Input placeholder="Enter department" />
            </Form.Item>
            <Form.Item name="requested_by_name" label="Requested By">
              <Input placeholder="Enter the requestor" />
            </Form.Item>
            <Form.Item name="requestor_name" label="Requestor Name">
              <Input placeholder="Actual requestor (if not a system user)" />
            </Form.Item>
            <Form.Item name="asset_name" label="Asset Name">
              <Input placeholder="Enter asset name" />
            </Form.Item>
            <Form.Item name="procurement_type" label="Procurement Type" initialValue="DIRECT">
              <Select>
                <Option value="DIRECT">Direct (single vendor)</Option>
                <Option value="RFQ">RFQ (request quotes from multiple)</Option>
              </Select>
            </Form.Item>
            <Form.Item name="vendor_id" hidden={procType === 'RFQ'} label="Vendor">
              <Select placeholder="Select vendor" allowClear showSearch optionFilterProp="children">
                {onboardedVendors.map((v) => <Option key={v.id} value={v.id}>{v.vendor_name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="rfq_vendor_ids" hidden={procType !== 'RFQ'} label="Request Quotes From (RFQ - up to 5 vendors)">
              <Select mode="multiple" maxCount={5} placeholder="Select vendors" allowClear showSearch optionFilterProp="children">
                {onboardedVendors.map((v) => <Option key={v.id} value={v.id}>{v.vendor_name}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="cost_center" label="Cost Center">
              <Input placeholder="Enter cost center" />
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
                      <Input placeholder="Nos" />
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
              <Descriptions.Item label="Asset">{viewRecord.Asset?.asset_name || typedAssetName(viewRecord) || '-'}</Descriptions.Item>
              <Descriptions.Item label="Vendor">{viewRecord.Vendor?.vendor_name || viewRecord.vendor_suggestion || '-'}</Descriptions.Item>
              <Descriptions.Item label="Cost Center">{viewRecord.cost_center || '-'}</Descriptions.Item>
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

            <ActivityTrail module="PR" id={viewRecord.id} refreshKey={rows} />
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
