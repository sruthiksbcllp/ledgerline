import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Modal, Space, Table, Tag, message, Empty, Row, Col, Popconfirm, Typography, Statistic, Tooltip, Badge, Select, Upload, Alert, Descriptions } from 'antd';
import { Plus, RefreshCcw, Trash2, Building2, Edit2, ShieldCheck, Tags, Sparkles, BadgeCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { getStoredUser, hasPerm } from '../utils/session';
import { normalizeResponse } from '../utils/apiNormalizer';

const { Title, Text } = Typography;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const kpiCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', padding: 16, flex: 1 };

const STATUS_COLOR = {
  ACTIVE: 'success',
  INACTIVE: 'error',
  SUSPENDED: 'warning'
};

// Compliance verification of the details a vendor submitted (same roles the server allows).
const COMPLIANCE_TEAM_ROLES = ['COMPLIANCE', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'];
const VERIFICATION = {
  VERIFIED: { color: 'success', label: 'Verified' },
  REJECTED: { color: 'error', label: 'Rejected' },
  PENDING: { color: 'gold', label: 'Pending verification' },
};
const verificationOf = (status) => VERIFICATION[status] || VERIFICATION.PENDING;
const personName = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : null);
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// Form fields the AI auto-fill can populate from an uploaded document.
const AI_FIELD_KEYS = ['vendor_name', 'contact_person', 'email', 'phone', 'address', 'gst_number', 'pan_number', 'bank_name', 'bank_account_no', 'ifsc_code'];
const AI_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const AI_MAX_BYTES = 10 * 1024 * 1024;

const VendorManagement = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [catVendor, setCatVendor] = useState(null); // CR-P04
  const [categories, setCategories] = useState([]);
  const [catIds, setCatIds] = useState([]);
  const [catSaving, setCatSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [assets, setAssets] = useState([]);
  const [form] = Form.useForm();
  // AI auto-fill: per-field { confidence, note } for values read from an uploaded document
  const [aiFields, setAiFields] = useState({});
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Compliance review of vendor-submitted details
  const isComplianceTeam = COMPLIANCE_TEAM_ROLES.includes(String(getStoredUser()?.role || '').toUpperCase().replace(/\s+/g, '_'));
  const [reviewVendor, setReviewVendor] = useState(null);
  const [reviewDocs, setReviewDocs] = useState([]);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [reviewBusy, setReviewBusy] = useState(null);

  const openReview = async (vendor) => {
    setReviewVendor(vendor);
    setReviewRemarks('');
    setReviewDocs([]);
    try {
      const res = await api.get(`/masters/vendors/${vendor.id}/documents`);
      setReviewDocs(normalizeResponse(res?.data));
    } catch {
      // documents are optional for the review
    }
  };
  const decide = async (decision) => {
    if (decision === 'REJECT' && !reviewRemarks.trim()) {
      message.warning('Enter the reason for rejecting');
      return;
    }
    setReviewBusy(decision);
    try {
      const res = await api.put(`/masters/vendors/${reviewVendor.id}/verification`, { decision, remarks: reviewRemarks });
      message.success(res?.data?.message || 'Saved');
      setReviewVendor(null);
      load(true);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not save the verification');
    } finally {
      setReviewBusy(null);
    }
  };

  const resetAutoFill = () => { setAiFields({}); setAiSummary(null); };

  const autoFillFromDocument = async (file) => {
    const okType = AI_FILE_TYPES.includes(file.type) || /\.(pdf|jpe?g|png|gif|webp)$/i.test(file.name || '');
    if (!okType) {
      message.error('Unsupported file. Upload a PDF, JPG, PNG, GIF or WEBP file.');
      return;
    }
    if (file.size > AI_MAX_BYTES) {
      message.error('File is larger than 10 MB.');
      return;
    }
    setAiLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/masters/vendors/extract', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000
      });
      const { is_vendor_document: isVendorDoc, fields = {} } = res?.data?.data || {};
      if (!isVendorDoc) {
        message.warning('No vendor details were found in this file. Fill the form manually.');
        return;
      }
      const current = form.getFieldsValue(AI_FIELD_KEYS);
      const updates = {};
      const marks = {};
      let filled = 0;
      let kept = 0;
      AI_FIELD_KEYS.forEach((key) => {
        const extracted = fields[key] || {};
        const value = String(extracted.value || '').trim();
        const existing = String(current[key] || '').trim();
        if (!value) {
          if (!existing) marks[key] = { confidence: 'missing', note: extracted.note || 'Not found in document' };
          return;
        }
        if (existing && existing !== value) {
          kept += 1;
          marks[key] = { confidence: 'low', note: `Kept your value. Document shows: ${value}` };
          return;
        }
        updates[key] = value;
        filled += 1;
        if (extracted.confidence !== 'high') {
          marks[key] = { confidence: extracted.confidence || 'low', note: extracted.note || 'Please verify' };
        }
      });
      form.setFieldsValue(updates);
      setAiFields(marks);
      const uncertain = Object.values(marks).filter((m) => m.confidence !== 'missing').length;
      const missing = Object.values(marks).filter((m) => m.confidence === 'missing').length;
      setAiSummary({ fileName: file.name, filled, uncertain, missing, kept });
    } catch (e) {
      const msg = e?.response?.data?.message
        || (e?.code === 'ECONNABORTED' ? 'Reading the document took too long. Try a smaller file.' : 'AI auto-fill failed. Fill the form manually.');
      message.error(msg);
    } finally {
      setAiLoading(false);
    }
  };

  // Highlight for a field the AI filled with low/medium confidence or could not find.
  const aiInputStatus = (name) => (aiFields[name] ? 'warning' : undefined);
  const aiExtra = (name) => {
    const mark = aiFields[name];
    if (!mark) return undefined;
    const label = mark.confidence === 'missing' ? 'Not found' : `AI: ${mark.confidence} confidence`;
    return <Text type="warning" style={{ fontSize: 12 }}>{label}{mark.note && mark.confidence !== 'missing' ? ` — ${mark.note}` : ''}</Text>;
  };
  // Editing a highlighted field means the user has reviewed it.
  const onFormValuesChange = (changed) => {
    const touched = Object.keys(changed).filter((key) => aiFields[key]);
    if (!touched.length) return;
    setAiFields((prev) => {
      const next = { ...prev };
      touched.forEach((key) => { delete next[key]; });
      return next;
    });
  };

  const load = async (hard = false) => {
    setLoading(true);
    try {
      const [res, pendingRes, assetRes] = await Promise.all([
        api.get('/masters/vendors' + (hard ? '?refresh=1' : '')),
        api.get('/masters/vendors/change-requests?status=PENDING'),
        api.get('/assets').catch(() => ({ data: [] }))
      ]);
      setRows(normalizeResponse(res?.data));
      setPendingCount(pendingRes.data?.data?.length || 0);
      setAssets(normalizeResponse(assetRes?.data));
    } catch {
      message.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditingVendor(null); form.resetFields(); resetAutoFill(); setOpen(true); };
  const openCategories = async (vendor) => {
    try {
      if (!categories.length) { const cr = await api.get('/masters/categories'); setCategories(cr?.data?.data || cr?.data || []); }
      const vr = await api.get(`/vendor-categories/${vendor.id}`);
      const rows = vr?.data?.data || vr?.data || [];
      setCatIds(rows.map((x) => x.category_id));
      setCatVendor(vendor);
    } catch (e) { message.error(e?.response?.data?.message || 'Categories unavailable (enable VENDOR_CATEGORISATION)'); }
  };
  const saveCategories = async () => {
    setCatSaving(true);
    try { await api.post(`/vendor-categories/${catVendor.id}`, { category_ids: catIds }); message.success('Vendor categories updated'); setCatVendor(null); }
    catch (e) { message.error(e?.response?.data?.message || 'Save failed'); }
    finally { setCatSaving(false); }
  };

  const openEdit = async (record) => {
    setEditingVendor(record);
    form.setFieldsValue(record);
    try {
      const res = await api.get('/masters/vendors/' + record.id + '/assets');
      const data = normalizeResponse(res?.data);
      form.setFieldValue('asset_ids', data.map(a => a.asset_id));
    } catch {
      // ignore
    }
    setOpen(true);
  };

  const submit = async (values) => {
    const { asset_ids, ...vendorData } = values;
    try {
      let vendorId;
      if (editingVendor) {
        const res = await api.put('/masters/vendors/' + editingVendor.id, vendorData);
        vendorId = editingVendor.id;
        if (res.data?.data?.approval_required) {
          message.info('Changes submitted for approval');
        } else {
          message.success('Vendor updated');
        }
      } else {
        const res = await api.post('/masters/vendors', vendorData);
        vendorId = res.data?.data?.id || res.data?.id;
        message.success('Vendor created');
      }
      if (vendorId && Array.isArray(asset_ids)) {
        await api.put('/masters/vendors/' + vendorId + '/assets', { asset_ids }).catch(() => {});
      }
      setOpen(false);
      setEditingVendor(null);
      form.resetFields();
      resetAutoFill();
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete('/masters/vendors/' + id);
      message.success('Vendor deleted');
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Delete failed');
    }
  };

  const activeVendors = rows.filter((v) => v.status === 'ACTIVE' || !v.status).length;

  const columns = [
    { title: 'Vendor Code', dataIndex: 'vendor_code', key: 'vendor_code', width: 140, sorter: (a, b) => (a.vendor_code || '').localeCompare(b.vendor_code || '') },
    {
      title: 'Vendor Name', dataIndex: 'vendor_name', key: 'vendor_name',
      sorter: (a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || ''),
      render: (name, r) => {
        const v = verificationOf(r.verification_status);
        let tip = 'Waiting for Compliance Team approval';
        if (r.verification_status === 'VERIFIED') tip = `Verified by ${personName(r.Verifier) || 'Compliance'} on ${when(r.verified_at)}`;
        if (r.verification_status === 'REJECTED') tip = `Rejected by ${personName(r.Verifier) || 'Compliance'}: ${r.verification_remarks || ''}`;
        return (
          <div>
            <div>{name}</div>
            <Tooltip title={tip}><Tag color={v.color} style={{ marginTop: 4, fontSize: 11 }}>{v.label}</Tag></Tooltip>
          </div>
        );
      }
    },
    { title: 'GSTIN', dataIndex: 'gst_number', key: 'gst_number' },
    { title: 'PAN', dataIndex: 'pan_number', key: 'pan_number' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <Tag color={STATUS_COLOR[v] || 'success'}>{v || 'ACTIVE'}</Tag>
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<Edit2 size={15} color="var(--color-navy)" />} onClick={() => openEdit(r)} />
          <Tooltip title="Categories"><Button type="text" size="small" icon={<Tags size={15} color="var(--color-navy)" />} onClick={() => openCategories(r)} /></Tooltip>
          </Tooltip>
          <Popconfirm
            title="Delete Vendor"
            description="This action cannot be undone."
            okText="Yes, Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(r.id)}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" icon={<Trash2 size={15} color="var(--color-danger)" />} />
            </Tooltip>
          </Popconfirm>
          {isComplianceTeam && (
            <Tooltip title={r.verification_status === 'VERIFIED' ? 'Verified — review again' : 'Approve vendor details (Compliance)'}>
              <Button type="text" size="small" icon={<BadgeCheck size={15} color="var(--color-success)" />} onClick={() => openReview(r)} />
            </Tooltip>
          )}
        </Space>
      )
    }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Space>
            <div className="page-header-icon"><Building2 size={24} /></div>
            <div>
              <h2 className="page-header-title">Vendor Management</h2>
              <Text type="secondary">{rows.length} total vendors</Text>
            </div>
          </Space>
          <Space>
            <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={() => load(true)}>Refresh</Button>
            <Badge count={pendingCount} offset={[-2, 0]}>
              <Button icon={<ShieldCheck size={16} />} onClick={() => navigate('/procurement/vendor-approvals')}>Approvals</Button>
            </Badge>
            {hasPerm(getStoredUser(), 'VENDOR', 'ADD') && <Button icon={<Plus size={16} />} type="primary" onClick={openAdd}>Add Vendor</Button>}
          </Space>
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ ...kpiCard, borderLeft: '4px solid var(--color-navy)' }} styles={{ body: { padding: '16px 20px' } }}>
            <Statistic title="Total Vendors" value={rows.length} valueStyle={{ color: 'var(--color-navy)', fontSize: 28, fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ ...kpiCard, borderLeft: '4px solid var(--color-success)' }} styles={{ body: { padding: '16px 20px' } }}>
            <Statistic title="Active Vendors" value={activeVendors} valueStyle={{ color: 'var(--color-success)', fontSize: 28, fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ ...kpiCard, borderLeft: '4px solid var(--color-info)' }} styles={{ body: { padding: '16px 20px' } }}>
            <Statistic title="With GSTIN" value={rows.filter((v) => v.gst_number).length} valueStyle={{ color: 'var(--color-info)', fontSize: 28, fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ ...kpiCard, borderLeft: '4px solid var(--color-orange)' }} styles={{ body: { padding: '16px 20px' } }}>
            <Statistic title="With PAN" value={rows.filter((v) => v.pan_number).length} valueStyle={{ color: 'var(--color-orange)', fontSize: 28, fontWeight: 'bold' }} />
          </Card>
        </Col>
      </Row>

      <Card style={contentCard} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={loading}
          locale={{ emptyText: <Empty description="No vendors found" style={{ margin: '40px 0' }} /> }}
          dataSource={rows}
          columns={columns}
          size="middle"
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 10, showTotal: (total) => 'Total: ' + total + ' vendors' }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        open={!!reviewVendor}
        title={<Space><BadgeCheck size={18} color="var(--color-success)" /><span>Compliance verification — {reviewVendor?.vendor_name}</span></Space>}
        onCancel={() => setReviewVendor(null)}
        width={680}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={() => setReviewVendor(null)}>Cancel</Button>,
          <Button key="reject" danger loading={reviewBusy === 'REJECT'} disabled={!!reviewBusy} onClick={() => decide('REJECT')}>Reject</Button>,
          <Button key="approve" type="primary" loading={reviewBusy === 'APPROVE'} disabled={!!reviewBusy} onClick={() => decide('APPROVE')}>Approve</Button>,
        ]}
      >
        {reviewVendor && (
          <>
            <Text type="secondary">Check the details the vendor submitted. The vendor shows as Verified only after the Compliance Team approves.</Text>
            <div style={{ margin: '8px 0 12px' }}>
              Current status: <Tag color={verificationOf(reviewVendor.verification_status).color}>{verificationOf(reviewVendor.verification_status).label}</Tag>
              {reviewVendor.verified_at && <Text type="secondary" style={{ fontSize: 12 }}>{personName(reviewVendor.Verifier) || 'Compliance'} · {when(reviewVendor.verified_at)}</Text>}
            </div>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Vendor name" span={2}>{reviewVendor.vendor_name}</Descriptions.Item>
              <Descriptions.Item label="Vendor code">{reviewVendor.vendor_code || '—'}</Descriptions.Item>
              <Descriptions.Item label="Status">{reviewVendor.status || '—'}</Descriptions.Item>
              <Descriptions.Item label="GSTIN">
                {reviewVendor.gst_number || <Text type="danger">Not submitted</Text>}
                {reviewVendor.gst_number && reviewVendor.gstin_status && (
                  <Tag style={{ marginLeft: 6 }} color={reviewVendor.gstin_status === 'VALID' ? 'success' : 'warning'}>{reviewVendor.gstin_status}</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="PAN">{reviewVendor.pan_number || <Text type="danger">Not submitted</Text>}</Descriptions.Item>
              <Descriptions.Item label="Contact person">{reviewVendor.contact_person || '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{reviewVendor.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Email" span={2}>{reviewVendor.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>{reviewVendor.address || '—'}</Descriptions.Item>
              <Descriptions.Item label="Bank">{reviewVendor.bank_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="IFSC">{reviewVendor.ifsc_code || '—'}</Descriptions.Item>
              <Descriptions.Item label="Account number" span={2}>{reviewVendor.bank_account_no || '—'}</Descriptions.Item>
              <Descriptions.Item label="Documents" span={2}>
                {reviewDocs.length
                  ? reviewDocs.map((d) => <Tag key={d.id}>{d.document_type}: {d.document_name}</Tag>)
                  : <Text type="secondary">No documents uploaded</Text>}
              </Descriptions.Item>
            </Descriptions>
            {reviewVendor.verification_status === 'REJECTED' && reviewVendor.verification_remarks && (
              <Alert style={{ marginTop: 12 }} type="error" showIcon message="Previously rejected" description={reviewVendor.verification_remarks} />
            )}
            <div style={{ marginTop: 16 }}>
              <Text strong>Remarks</Text> <Text type="secondary" style={{ fontSize: 12 }}>(required to reject)</Text>
              <Input.TextArea rows={3} maxLength={500} showCount value={reviewRemarks} onChange={(e) => setReviewRemarks(e.target.value)}
                placeholder="e.g. PAN and GSTIN match the certificates; bank checked against cancelled cheque" style={{ marginTop: 6 }} />
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!catVendor} title={`Categories — ${catVendor?.vendor_name || ''}`} onCancel={() => setCatVendor(null)} onOk={saveCategories} confirmLoading={catSaving} okText="Save" destroyOnClose>
        <p style={{ color: 'var(--color-text-muted)' }}>Item/asset categories this vendor supplies (drives PR/RFQ vendor suggestions).</p>
        <Select mode="multiple" style={{ width: '100%' }} placeholder="Select categories" value={catIds} onChange={setCatIds}
          options={categories.map((c) => ({ label: c.category_name, value: c.id }))} optionFilterProp="label" showSearch />
      </Modal>

      <Modal open={open} title={editingVendor ? 'Edit Vendor' : 'Add Vendor'} onCancel={() => { setOpen(false); setEditingVendor(null); form.resetFields(); resetAutoFill(); }} onOk={() => form.submit()} okText={editingVendor ? 'Update' : 'Add'} okButtonProps={{ disabled: aiLoading }} destroyOnClose width={640}>
        {!editingVendor && (
          <div style={{ marginBottom: 16 }}>
            <Upload
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
              showUploadList={false}
              maxCount={1}
              disabled={aiLoading}
              beforeUpload={(file) => { autoFillFromDocument(file); return Upload.LIST_IGNORE; }}
            >
              <Button icon={<Sparkles size={16} />} loading={aiLoading}>
                {aiLoading ? 'Reading document…' : 'Auto-fill from document'}
              </Button>
            </Upload>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
              Upload a GST certificate, letterhead, cancelled cheque or registration form (PDF or image, up to 10 MB). You can review and edit every field before saving.
            </Text>
            {aiSummary && (
              <Alert
                style={{ marginTop: 12 }}
                type={aiSummary.uncertain || aiSummary.missing || aiSummary.kept ? 'warning' : 'success'}
                showIcon
                closable
                onClose={() => setAiSummary(null)}
                message={`Filled ${aiSummary.filled} field${aiSummary.filled === 1 ? '' : 's'} from ${aiSummary.fileName}`}
                description={[
                  aiSummary.uncertain ? `${aiSummary.uncertain} need a check (highlighted).` : null,
                  aiSummary.missing ? `${aiSummary.missing} not found in the document.` : null,
                  aiSummary.kept ? `${aiSummary.kept} kept your existing value.` : null,
                  'Review the details before clicking Add.'
                ].filter(Boolean).join(' ')}
              />
            )}
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={submit} onValuesChange={onFormValuesChange}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="vendor_name" label="Vendor Name" rules={[{ required: true, message: 'Please enter vendor name' }]} extra={aiExtra('vendor_name')}>
                <Input placeholder="Enter vendor name" status={aiInputStatus('vendor_name')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="vendor_code" label="Vendor Code">
                <Input placeholder="Enter vendor code" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="email" label="Email" extra={aiExtra('email')}>
                <Input status={aiInputStatus('email')} type="email" placeholder="vendor@example.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Phone" extra={aiExtra('phone')}>
                <Input status={aiInputStatus('phone')} placeholder="Phone number" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="status" label="Vendor Status" initialValue="ACTIVE">
                <Select placeholder="Select Status">
                  <Select.Option value="DRAFT">Draft (Initial State)</Select.Option>
                  <Select.Option value="ACTIVE">Active (Live for transactions)</Select.Option>
                  <Select.Option value="BLACKLISTED">Blacklisted (Blocked)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="procurement_type" label="Procurement Type">
                <Select placeholder="Select procurement type" allowClear>
                  <Select.Option value="GOODS">Goods</Select.Option>
                  <Select.Option value="SERVICES">Services</Select.Option>
                  <Select.Option value="WORKS">Works</Select.Option>
                  <Select.Option value="MIXED">Mixed</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="gst_number" label="GSTIN" rules={[{ len: 15, message: 'GSTIN must be exactly 15 characters' }]} extra={aiExtra('gst_number')}>
                <Input status={aiInputStatus('gst_number')} placeholder="15 character GSTIN" maxLength={15} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pan_number" label="PAN" rules={[{ len: 10, message: 'PAN must be exactly 10 characters' }]} extra={aiExtra('pan_number')}>
                <Input status={aiInputStatus('pan_number')} placeholder="10 character PAN" maxLength={10} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="contact_person" label="Contact Person" extra={aiExtra('contact_person')}>
            <Input status={aiInputStatus('contact_person')} placeholder="Enter contact person name" />
          </Form.Item>

          <Form.Item name="address" label="Address" extra={aiExtra('address')}>
            <Input.TextArea status={aiInputStatus('address')} placeholder="Enter full address" rows={3} />
          </Form.Item>

          <Form.Item name="asset_ids" label="Associated Assets">
            <Select mode="multiple" placeholder="Select assets linked to this vendor" allowClear showSearch optionFilterProp="children" maxTagCount={5}>
              {assets.map(a => (
                <Select.Option key={a.id} value={a.id}>{a.asset_name || a.asset_code}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Title level={5} style={{ marginTop: 16 }}>Banking Details</Title>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="bank_name" label="Bank Name" extra={aiExtra('bank_name')}>
                <Input status={aiInputStatus('bank_name')} placeholder="Enter bank name" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="bank_account_no" label="Account Number" extra={aiExtra('bank_account_no')}>
                <Input status={aiInputStatus('bank_account_no')} placeholder="Enter account number" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ifsc_code" label="IFSC Code" extra={aiExtra('ifsc_code')}>
                <Input status={aiInputStatus('ifsc_code')} placeholder="Enter IFSC code" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default VendorManagement;
