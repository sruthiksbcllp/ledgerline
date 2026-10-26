import React, { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message, Empty, Row, Col, Upload, Typography, Alert, Popconfirm, Tooltip, Drawer } from 'antd';
import { Plus, RefreshCcw, Download, Upload as UploadIcon, Eye, FileText, Trash2, Edit2, Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';
import { ActivityTrail, lastActionColumn, useLastActions } from '../components/procurement/ActivityTrail';

const { Title, Text } = Typography;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

const STATUS_COLOR = {
  UNPAID: 'error',
  PAID: 'success',
  PARTIAL_PAID: 'warning',
  OVERDUE: 'red',
  APPROVED_FOR_PAYMENT: 'processing',
  WAITING_FOR_PAYMENT: 'gold'
};

const MATCH_STATUS_COLOR = {
  'MATCHED': 'success',
  'MISMATCHED': 'error',
  'PENDING': 'default'
};

const InvoiceProcessing = () => {
  // Same roles the server lets create invoices (POST /procurement/invoices), plus company admins.
  const canCreateInvoice = ['ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'PROVIDER_ADMIN', 'ACCOUNTS_PAYABLE', 'FINANCE', 'VENDOR'].includes(String(JSON.parse(localStorage.getItem('user') || '{}').role || '').toUpperCase());
  const [data, setData] = useState([]);
  const [pos, setPos] = useState([]);
  const [grns, setGrns] = useState([]);
  const [sesList, setSesList] = useState([]); // approved service entry sheets of the selected PO
  const [open, setOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentExternal, setPaymentExternal] = useState(false); // CR-HYB-01: payment owned externally (Oracle)
  const [payRow, setPayRow] = useState(null);
  const [payForm] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();
  const [exRow, setExRow] = useState(null);
  const [exReason, setExReason] = useState('');
  const [exSaving, setExSaving] = useState(false);

  const openAdd = () => { setEditingInvoice(null); form.resetFields(); setGrns([]); setSesList([]); setOpen(true); };
  const openEdit = (record) => { setEditingInvoice(record); form.setFieldsValue(record); loadGrns(record.po_id); setOpen(true); };

  // Receipt documents a PO invoice can be matched to: GRNs (goods) and approved SES (services).
  const loadGrns = async (poId) => {
    if (!poId) { setGrns([]); setSesList([]); return; }
    try { const r = await api.get('/grn', { params: { po_id: poId } }); setGrns(normalizeResponse(r?.data)); }
    catch { setGrns([]); }
    try { const r = await api.get('/procurement/ses', { params: { po_id: poId, status: 'APPROVED' } }); setSesList(normalizeResponse(r?.data)); }
    catch { setSesList([]); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [invRes, poRes] = await Promise.all([
        api.get('/procurement/invoices'),
        api.get('/procurement/po')
      ]);
      setData(normalizeResponse(invRes?.data));
      setPos(normalizeResponse(poRes?.data));
      try {
        const f = await api.get('/system/features');
        const list = normalizeResponse(f?.data) || [];
        const pe = list.find((x) => x.feature_key === 'PAYMENT_EXTERNAL');
        setPaymentExternal(!!(pe && (pe.is_enabled === true || pe.is_enabled === 1)));
      } catch { /* default: internal */ }
    } catch {
      message.error('Failed to load invoice data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (values) => {
    try {
      const payload = { ...values, total_amount: Number(values.base_amount || 0) + Number(values.gst_amount || 0) };
      if (editingInvoice) {
        await api.put(`/procurement/invoices/${editingInvoice.id}`, payload);
        message.success('Invoice updated');
      } else {
        await api.post('/procurement/invoices', payload);
        message.success('Invoice created');
      }
      setOpen(false);
      setEditingInvoice(null);
      form.resetFields();
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Operation failed');
    }
  };

  const handleMarkPaid = async (r) => {
    try { await api.put(`/procurement/invoices/${r.id}/mark-paid`, {}); message.success('Invoice marked as paid'); load(); }
    catch (e) { message.error(e?.response?.data?.message || 'Cannot mark paid'); }
  };
  const handleApproveForPayment = async (r) => {
    try { await api.put(`/procurement/invoices/${r.id}/approve-for-payment`, {}); message.success('Invoice approved for payment'); load(); }
    catch (e) { message.error(e?.response?.data?.message || 'Failed to approve'); }
  };
  const submitRecordPayment = async (values) => {
    try { await api.put(`/procurement/invoices/${payRow.id}/record-external-payment`, values); message.success('External payment recorded'); setPayRow(null); payForm.resetFields(); load(); }
    catch (e) { message.error(e?.response?.data?.message || 'Failed to record payment'); }
  };
  const openResolve = (r) => { setExRow(r); setExReason(''); };
  const handleResolveException = async () => {
    if (!exRow) return; setExSaving(true);
    try { await api.put(`/procurement/invoices/${exRow.id}/resolve-exception`, { action: 'MANUAL_APPROVE', comments: exReason }); message.success('Exception resolved - invoice unblocked'); setExRow(null); setExReason(''); load(); }
    catch (e) { message.error(e?.response?.data?.message || 'Failed to resolve'); }
    setExSaving(false);
  };

  const exportAllInvoices = () => {
    const rows = (Array.isArray(data) ? data : []).map((r) => ({
      invoice_number: r.invoice_number || '',
      po_id: r.po_id || '',
      total_amount: r.total_amount || 0,
      status: r.status || 'UNPAID',
      document_url: r.document_url || ''
    }));
    const header = ['Invoice Number', 'PO Id', 'Total Amount', 'Status', 'Document URL'];
    const csv = [header.join(','), ...rows.map((r) => [
      `"${String(r.invoice_number).replace(/"/g, '""')}"`,
      r.po_id,
      r.total_amount,
      r.status,
      `"${String(r.document_url).replace(/"/g, '""')}"`
    ].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'invoices_all.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const uploadInvoiceFile = async (invoiceId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    await api.post(`/procurement/invoices/${invoiceId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    message.success('Invoice file uploaded');
    await load();
  };

  const validateInvoiceFile = (file) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const isAllowed = allowed.includes(file.type);
    if (!isAllowed) {
      message.error('Only PDF/JPG/PNG files are allowed');
      return Upload.LIST_IGNORE;
    }
    const isLt10Mb = file.size / 1024 / 1024 <= 10;
    if (!isLt10Mb) {
      message.error('File size must be 10MB or less');
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/procurement/invoices/${id}`);
      message.success('Invoice deleted');
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Delete failed');
    }
  };

  const lastActions = useLastActions('INVOICE', data, data);

  const columns = [
    { title: 'Invoice No', dataIndex: 'invoice_number', key: 'invoice_number' },
    {
      title: 'Amount',
      dataIndex: 'total_amount',
      key: 'total_amount',
      align: 'right',
      render: (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{v || 'UNPAID'}</Tag>
    },
    {
      title: 'Match Status',
      dataIndex: 'matching_status',
      key: 'matching_status',
      render: (v) => v ? <Tag color={MATCH_STATUS_COLOR[v] || 'default'}>{v}</Tag> : <Tag>-</Tag>
    },
    {
      title: 'Document',
      key: 'document',
      render: (_, r) => (
        <Space size="small">
          <Upload
            showUploadList={false}
            beforeUpload={validateInvoiceFile}
            customRequest={async ({ file, onSuccess, onError }) => {
              try {
                await uploadInvoiceFile(r.id, file);
                onSuccess && onSuccess('ok');
              } catch (err) {
                message.error(err?.response?.data?.message || 'Upload failed');
                onError && onError(err);
              }
            }}
          >
            <Button size="small" icon={<UploadIcon size={14} />}>Upload</Button>
          </Upload>
          {r.document_url ? (
            <Button
              size="small"
              type="link"
              icon={<Eye size={16} />}
              href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${r.document_url}`}
              target="_blank"
            >
              View
            </Button>
          ) : null}
        </Space>
      )
    },
    lastActionColumn('INVOICE', lastActions, { numberOf: (r) => r.invoice_number }),
    {
      title: 'Action',
      key: 'action',
      fixed: 'right',
      width: 110,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View">
            <Button type="text" size="small" icon={<Eye size={15} color="var(--color-navy)" />} onClick={() => setViewingInvoice(r)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<Edit2 size={15} color="var(--color-navy)" />} onClick={() => openEdit(r)} />
          </Tooltip>
          {(r.payment_blocked || r.matching_status === 'MISMATCHED' || r.status === 'EXCEPTION') && <Tooltip title="Resolve Exception"><Button type="text" size="small" icon={<AlertTriangle size={15} color="#faad14" />} onClick={() => openResolve(r)} /></Tooltip>}
          {!paymentExternal && r.status !== 'PAID' && <Popconfirm title="Mark this invoice as paid?" okText="Yes, Paid" cancelText="Cancel" onConfirm={() => handleMarkPaid(r)}><Tooltip title="Mark Paid"><Button type="text" size="small" icon={<CheckCircle2 size={15} color="var(--color-success)" />} /></Tooltip></Popconfirm>}
          {paymentExternal && !['APPROVED_FOR_PAYMENT', 'WAITING_FOR_PAYMENT', 'PAID'].includes(r.status) && r.matching_status !== 'MISMATCHED' && <Popconfirm title="Approve this invoice for payment (hand off to Oracle)?" okText="Approve" cancelText="Cancel" onConfirm={() => handleApproveForPayment(r)}><Tooltip title="Approve for Payment"><Button type="text" size="small" icon={<CheckCircle2 size={15} color="var(--color-info)" />} /></Tooltip></Popconfirm>}
          {paymentExternal && ['APPROVED_FOR_PAYMENT', 'WAITING_FOR_PAYMENT'].includes(r.status) && <Tooltip title="Record Oracle Payment"><Button type="text" size="small" icon={<CheckCircle2 size={15} color="var(--color-success)" />} onClick={() => { setPayRow(r); payForm.resetFields(); }} /></Tooltip>}
          <Popconfirm
            title="Delete Invoice"
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
        </Space>
      )
    }
  ];

  const gstWarnings = data.filter((d) => !d.gst_compliant);

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<span style={{ fontSize: 18, color: 'var(--color-text-secondary)' }}>📄</span>}
        title="Invoice Processing"
        subtitle={`${data.length} invoices`}
        actions={(
          <Space>
            <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={load}>
              Refresh
            </Button>
            <Button icon={<Download size={14} />} onClick={exportAllInvoices}>
              Export Excel
            </Button>
            {canCreateInvoice && (
              <Button icon={<Plus size={14} />} type="primary" onClick={openAdd}>
                New Invoice
              </Button>
            )}
          </Space>
        )}
      />

      {gstWarnings.length > 0 && (
        <Alert
          message="GST Compliance Alert"
          description={`${gstWarnings.length} invoice(s) have GST compliance issues. Please review.`}
          type="warning"
          showIcon
          style={{ marginBottom: 20, borderRadius: 'var(--radius-lg)' }}
          closable
        />
      )}

      <Card style={contentCard} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <Row gutter={12} align="middle">
            <Col xs={24} sm={10}>
              <Input
                prefix={<Search size={14} color="var(--color-text-muted)" />}
                placeholder="Search by invoice number..."
                allowClear
                style={{ borderRadius: 'var(--radius-md)' }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </Col>
          </Row>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          locale={{ emptyText: <Empty description="No invoices found" style={{ margin: '40px 0' }} /> }}
          dataSource={(Array.isArray(data) ? data : []).filter(inv => 
            !searchText || 
            inv.invoice_number?.toLowerCase().includes(searchText.toLowerCase())
          )}
          loading={loading}
          size="middle"
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 10, showTotal: (total) => `Total: ${total} invoices`, position: ['bottomRight'] }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        open={open}
        title={editingInvoice ? 'Edit Invoice' : 'Create Invoice'}
        onCancel={() => { setOpen(false); setEditingInvoice(null); form.resetFields(); }}
        onOk={() => form.submit()}
        okText={editingInvoice ? 'Update' : 'Create'}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="po_id" label="PO" rules={[{ required: true, message: 'Please select a PO' }]}>
            <Select placeholder="Select PO" onChange={(v) => { loadGrns(v); form.setFieldsValue({ grn_id: undefined, ses_id: undefined }); }} options={pos.map((p) => ({ value: p.id, label: p.po_number || `PO-${p.id}` }))} />
          </Form.Item>
          <Form.Item name="grn_id" label="GRN (required for 3-way match)">
            <Select allowClear placeholder="Select the GRN for this PO" onChange={(v) => { if (v) form.setFieldsValue({ ses_id: null }); }} options={grns.map((g) => ({ value: g.id, label: g.grn_number || `GRN-${g.id}` }))} notFoundContent="No GRN yet - receive goods first" />
          </Form.Item>
          <Form.Item name="ses_id" label="Service Entry Sheet (for services, instead of a GRN)">
            <Select
              allowClear
              placeholder="Select the approved SES for this PO"
              onChange={(v) => {
                if (!v) return;
                const ses = sesList.find((x) => x.id === v);
                form.setFieldsValue({ grn_id: null, ...(ses && !form.getFieldValue('base_amount') ? { base_amount: Number(ses.total_value || 0) } : {}) });
              }}
              options={sesList.map((x) => ({ value: x.id, label: `${x.ses_number} - Rs.${Number(x.total_value || 0).toLocaleString('en-IN')}` }))}
              notFoundContent="No approved SES for this PO"
            />
          </Form.Item>
          <Form.Item name="invoice_number" label="Invoice Number" rules={[{ required: true, message: 'Please enter invoice number' }]}>
            <Input placeholder="Enter invoice number" />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="base_amount" label="Base Amount" style={{ flex: 1 }} rules={[{ required: true, message: 'Required' }]}>
              <InputNumber style={{ width: '100%' }} min={0} placeholder="0.00" prefix="₹" />
            </Form.Item>
            <Form.Item name="gst_amount" label="GST Amount" style={{ flex: 1 }} initialValue={0}>
              <InputNumber style={{ width: '100%' }} min={0} placeholder="0.00" prefix="₹" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Drawer
        title="Invoice Details"
        open={!!viewingInvoice}
        onClose={() => setViewingInvoice(null)}
        width={560}
      >
        {viewingInvoice && (
          <>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Invoice No">{viewingInvoice.invoice_number || '—'}</Descriptions.Item>
            <Descriptions.Item label="PO">{viewingInvoice.po_number || viewingInvoice.po_id || '—'}</Descriptions.Item>
            <Descriptions.Item label="Total Amount">₹{Number(viewingInvoice.total_amount || 0).toLocaleString('en-IN')}</Descriptions.Item>
            <Descriptions.Item label="Base Amount">₹{Number(viewingInvoice.base_amount || 0).toLocaleString('en-IN')}</Descriptions.Item>
            <Descriptions.Item label="GST Amount">₹{Number(viewingInvoice.gst_amount || 0).toLocaleString('en-IN')}</Descriptions.Item>
            <Descriptions.Item label="Status"><Tag color={STATUS_COLOR[viewingInvoice.status] || 'default'}>{viewingInvoice.status || 'UNPAID'}</Tag></Descriptions.Item>
            <Descriptions.Item label="Match Status"><Tag color={MATCH_STATUS_COLOR[viewingInvoice.matching_status] || 'default'}>{viewingInvoice.matching_status || '—'}</Tag></Descriptions.Item>
            {viewingInvoice.payment_source && <Descriptions.Item label="Payment Source">{viewingInvoice.payment_source}</Descriptions.Item>}
            {viewingInvoice.external_payment_ref && <Descriptions.Item label="Voucher / Ref">{viewingInvoice.external_payment_ref}</Descriptions.Item>}
            {viewingInvoice.payment_date && <Descriptions.Item label="Payment Date">{new Date(viewingInvoice.payment_date).toLocaleDateString()}</Descriptions.Item>}
            {viewingInvoice.payment_synced_at && <Descriptions.Item label="Synced">{new Date(viewingInvoice.payment_synced_at).toLocaleString()}</Descriptions.Item>}
            <Descriptions.Item label="GST Compliant">{viewingInvoice.gst_compliant ? 'Yes' : 'No'}</Descriptions.Item>
            {viewingInvoice.document_url && (
              <Descriptions.Item label="Document">
                <Button type="link" href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${viewingInvoice.document_url}`} target="_blank" icon={<Eye size={14} />}>
                  View Document
                </Button>
              </Descriptions.Item>
            )}
          </Descriptions>
          <div style={{ marginTop: 20 }}>
            <ActivityTrail module="INVOICE" id={viewingInvoice.id} refreshKey={data} />
          </div>
          </>
        )}
      </Drawer>

      <Modal open={!!payRow} title="Record Oracle Payment" onCancel={() => setPayRow(null)} okText="Record Payment" onOk={() => payForm.submit()}>
        {payRow && (
          <Form form={payForm} layout="vertical" onFinish={submitRecordPayment} initialValues={{ payment_source: 'ORACLE' }}>
            <p style={{ marginTop: 0 }}><b>{payRow.invoice_number}</b> — record the payment made in the external system.</p>
            <Form.Item name="payment_source" label="Payment Source"><Input placeholder="ORACLE" /></Form.Item>
            <Form.Item name="external_payment_ref" label="Voucher / Payment Reference" rules={[{ required: true, message: 'Enter the external voucher / UTR' }]}><Input placeholder="e.g. AP-2026-000123" /></Form.Item>
            <Form.Item name="payment_date" label="Payment Date"><Input type="date" /></Form.Item>
          </Form>
        )}
      </Modal>

      <Modal open={!!exRow} title="Resolve Invoice Exception" onCancel={() => setExRow(null)} confirmLoading={exSaving} okText="Approve & Unblock" onOk={handleResolveException}>
        {exRow && (<div>
          <p style={{ marginTop: 0 }}><b>{exRow.invoice_number}</b> — payment is blocked by a 3-way match exception.</p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{exRow.payment_block_reason || exRow.matching_exception_details || 'Variance vs PO / GRN.'}</p>
          <Input.TextArea rows={3} value={exReason} onChange={(e) => setExReason(e.target.value)} placeholder="Justification for overriding the exception" />
        </div>)}
      </Modal>
    </div>
  );
};

export default InvoiceProcessing;
