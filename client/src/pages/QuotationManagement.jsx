import React, { useEffect, useState } from 'react';
import {
  Button, Card, Col, Divider, Form, Input, InputNumber,
  Modal, Row, Select, Space, Table, Tag, Typography, message, Empty, Popconfirm, Tooltip, DatePicker
} from 'antd';
import { Plus, RefreshCcw, IndianRupee, Trash2, Eye, Edit2, Search, CheckCircle2, XCircle, Mail } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';
import { ActivityTrail, lastActionColumn, useLastActions } from '../components/procurement/ActivityTrail';
import VendorEmailReview from '../components/procurement/VendorEmailReview';
import PendingRepliesCard from '../components/procurement/PendingRepliesCard';

const { Text } = Typography;

const contentCard = { borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-medium)', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none', borderRadius: 'var(--radius-md)' };

const STATUS_COLOR = {
  DRAFT: 'default', SUBMITTED: 'processing', APPROVED: 'success',
  REJECTED: 'error', NOT_APPROVED: 'default', PENDING: 'warning', QUOTED: 'processing',
};

const emptyItem = () => ({ item_name: '', quantity: 1, unit_price: 0, unit: 'Nos' });

const QuotationManagement = () => {
  const [rows, setRows]           = useState([]);
  const [prs, setPrs]             = useState([]);
  const [vendors, setVendors]     = useState([]);
  const [open, setOpen]           = useState(false);
  const [viewOpen, setViewOpen]   = useState(false);
  const [selected, setSelected]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [searchText, setSearchText] = useState('');
  const [lineItems, setLineItems] = useState([emptyItem()]);
  const [form] = Form.useForm();
  const [awardRow, setAwardRow] = useState(null);
  const [awardReason, setAwardReason] = useState('');
  const [awarding, setAwarding] = useState(false);
  const [emailDraftId, setEmailDraftId] = useState(null);
  const [preparingEmail, setPreparingEmail] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [qRes, prRes, vRes] = await Promise.all([
        api.get('/procurement/quotations'),
        api.get('/procurement/pr'),
        api.get('/procurement/vendors'),
      ]);
      setRows(normalizeResponse(qRes?.data));
      setPrs(normalizeResponse(prRes?.data));
      setVendors(normalizeResponse(vRes?.data));
    } catch {
      message.error('Failed to load quotations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addItem    = () => setLineItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx) => setLineItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) =>
    setLineItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const totalAmount = lineItems.reduce(
    (sum, it) => sum + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0
  );

  const handleView = (record) => { setSelected(record); setViewOpen(true); };
  const lowestForPr = (prId) => { const p = rows.filter((r) => r.pr_id === prId && Number(r.net_amount || 0) > 0).map((r) => Number(r.net_amount)); return p.length ? Math.min(...p) : null; };
  const openAward = (record) => { setAwardRow(record); setAwardReason(''); };
  const handleAward = async () => {
    if (!awardRow) return; setAwarding(true);
    try {
      const res = await api.put(`/procurement/quotations/${awardRow.id}/approve`, { deviation_reason: awardReason || undefined });
      message.success('Quotation awarded'); setAwardRow(null); setAwardReason(''); load();
      // RFQ quotations get a vendor email draft for admin review (never sent automatically).
      const draft = res?.data?.data?.email_draft;
      if (draft?.id && ['DRAFT', 'FAILED'].includes(draft.status)) setEmailDraftId(draft.id);
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to award quotation'); }
    setAwarding(false);
  };
  const openVendorEmail = async (record) => {
    setPreparingEmail(record.id);
    try {
      const res = await api.post('/vendor-emails/prepare', { quotation_id: record.id });
      if (res?.data?.data?.id) setEmailDraftId(res.data.data.id);
    } catch (e) { message.error(e?.response?.data?.message || 'Could not prepare the vendor email'); }
    setPreparingEmail(null);
  };
  const handleReject = async (id) => {
    try {
      await api.put(`/procurement/quotations/${id}/reject`);
      message.success('Quotation rejected'); load();
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to reject quotation'); }
  };
  const handleEdit = (record) => {
    form.resetFields();
    const items = record.QuotationItems || record.items || [emptyItem()];
    setLineItems(items.length ? items : [emptyItem()]);
    form.setFieldsValue({
      pr_id: record.pr_id,
      vendor_id: record.vendor_id,
      valid_until: record.valid_until ? dayjs(record.valid_until) : undefined,
      remarks: record.remarks,
    });
    setSelected(record);
    setOpen(true);
  };

  const handleOpen = () => { setSelected(null);
    form.resetFields();
    setLineItems([emptyItem()]);
    setOpen(true);
  };

  const submit = async (values) => {
    const validItems = lineItems.filter(it => it.item_name?.trim());
    if (!validItems.length) {
      message.error('At least one line item with a name is required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/procurement/quotations', {
        ...values,
        items: validItems.map(it => ({
          item_name:  it.item_name.trim(),
          quantity:   Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          unit:       it.unit || 'Nos',
        })),
      });
      message.success('Quotation created successfully');
      setOpen(false);
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Failed to create quotation');
    } finally {
      setSaving(false);
    }
  };

  const lastActions = useLastActions('QUOTATION', rows, rows);

  const columns = [
    {
      title: 'Quotation No', dataIndex: 'quotation_number', key: 'quotation_number',
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: 'PR Number', key: 'pr_number',
      render: (_, r) => r.PR?.pr_number || r.PurchaseRequisition?.pr_number || r.pr_number || '—',
    },
    {
      title: 'Vendor', key: 'vendor_name',
      render: (_, r) => r.vendor?.vendor_name || r.Vendor?.vendor_name || r.vendor_name || '—',
    },
    {
      title: 'Amount', dataIndex: 'net_amount', key: 'net_amount', align: 'right',
      render: (v, r) => '₹' + Number(v || r.total_amount || 0).toLocaleString('en-IN'),
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{v || 'DRAFT'}</Tag>,
    },
    lastActionColumn('QUOTATION', lastActions, { numberOf: (r) => r.quotation_number }),
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 150,
      render: (_, r) => (
        <Space size={4}>
          {['SUBMITTED', 'NOT_APPROVED'].includes(r.status) && <Tooltip title={r.status === 'NOT_APPROVED' ? 'Award this alternate' : 'Award / Approve'}><Button type="text" size="small" icon={<CheckCircle2 size={15} color="var(--color-success)" />} onClick={() => openAward(r)} /></Tooltip>}
          {['SUBMITTED', 'NOT_APPROVED'].includes(r.status) && (
            <Popconfirm title="Reject this quotation?" description="It won't be selectable for the PO." okText="Reject" okButtonProps={{ danger: true }} cancelText="Cancel" onConfirm={() => handleReject(r.id)}>
              <Tooltip title="Reject"><Button type="text" size="small" icon={<XCircle size={15} color="var(--color-danger)" />} /></Tooltip>
            </Popconfirm>
          )}
          {['APPROVED', 'PO_CREATED'].includes(r.status) && <Tooltip title="Vendor email (review & send)"><Button type="text" size="small" loading={preparingEmail === r.id} icon={<Mail size={15} color="var(--color-navy)" />} onClick={() => openVendorEmail(r)} /></Tooltip>}
          <Tooltip title="View"><Button type="text" size="small" icon={<Eye size={15} color="var(--color-navy)" />} onClick={() => handleView(r)} /></Tooltip>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<Edit2 size={15} color="var(--color-navy)" />} onClick={() => handleEdit(r)} /></Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={IndianRupee}
        title="Quotation Management"
        subtitle={rows.length + ' quotations'}
        actions={(
          <Space>
            <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={load}>Refresh</Button>
            <Button icon={<Plus size={16} />} onClick={handleOpen} style={primaryBtn} type="primary">New Quotation</Button>
          </Space>
        )}
      />

      <PendingRepliesCard cardStyle={contentCard} onRecorded={load} />

      <Card style={contentCard} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <Row gutter={12} align="middle">
            <Col xs={24} sm={10}>
              <Input
                prefix={<Search size={14} color="var(--color-text-muted)" />}
                placeholder="Search by quotation or PR number..."
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
          loading={loading}
          locale={{ emptyText: <Empty description="No quotations found" style={{ margin: '40px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          dataSource={rows.filter(r => 
            !searchText || 
            r.quotation_number?.toLowerCase().includes(searchText.toLowerCase()) ||
            r.pr_number?.toLowerCase().includes(searchText.toLowerCase()) ||
            r.PR?.pr_number?.toLowerCase().includes(searchText.toLowerCase())
          )}
          columns={columns}
          size="middle"
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 10, showTotal: (total) => total + ' records' }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        open={open}
        title="Create Quotation"
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="Create"
        okButtonProps={{ loading: saving, style: primaryBtn }}
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="pr_id" label="Purchase Requisition">
                <Select
                  placeholder="Select PR"
                  allowClear showSearch optionFilterProp="label"
                  options={prs.map((p) => ({ value: p.id, label: p.pr_number || ('PR-' + p.id) }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="vendor_id" label="Vendor" rules={[{ required: true, message: 'Please select a vendor' }]}>
                <Select
                  placeholder="Select Vendor"
                  showSearch optionFilterProp="label"
                  options={vendors.map((v) => ({ value: v.id, label: v.vendor_name || ('Vendor-' + v.id) }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="valid_until" label="Valid Until">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="remarks" label="Remarks">
                <Input placeholder="Optional remarks" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '8px 0 16px' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text strong style={{ fontSize: 14, color: 'var(--color-navy-deep)' }}>Line Items</Text>
            <Button size="small" icon={<Plus size={14} />} onClick={addItem} type="dashed">Add Item</Button>
          </div>

          {lineItems.map((item, idx) => (
            <div
              key={idx}
              style={{ background: 'var(--color-bg-page)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, border: '1px solid var(--color-border)' }}
            >
              <Row gutter={8} align="middle">
                <Col xs={24} sm={8}>
                  <Input
                    placeholder="Item name *"
                    value={item.item_name}
                    onChange={(e) => updateItem(idx, 'item_name', e.target.value)}
                    size="small"
                  />
                </Col>
                <Col xs={8} sm={4}>
                  <InputNumber
                    placeholder="Qty" min={1} value={item.quantity}
                    onChange={(v) => updateItem(idx, 'quantity', v)}
                    size="small" style={{ width: '100%' }}
                  />
                </Col>
                <Col xs={8} sm={5}>
                  <InputNumber
                    placeholder="Unit Price" min={0} value={item.unit_price}
                    onChange={(v) => updateItem(idx, 'unit_price', v)}
                    size="small" style={{ width: '100%' }} prefix={'₹'}
                  />
                </Col>
                <Col xs={8} sm={4}>
                  <Input
                    placeholder="Unit" value={item.unit}
                    onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                    size="small"
                  />
                </Col>
                <Col xs={24} sm={3} style={{ textAlign: 'right' }}>
                  <Popconfirm
                    title="Remove this item?"
                    onConfirm={() => removeItem(idx)}
                    okText="Yes" cancelText="No"
                    disabled={lineItems.length === 1}
                  >
                    <Button
                      type="text" size="small"
                      icon={<Trash2 size={14} />}
                      disabled={lineItems.length === 1}
                    />
                  </Popconfirm>
                </Col>
              </Row>
              <div style={{ textAlign: 'right', marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>
                {'Line total: ₹' + (Number(item.quantity || 0) * Number(item.unit_price || 0)).toLocaleString('en-IN')}
              </div>
            </div>
          ))}

          <div style={{ textAlign: 'right', marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
            <Text strong style={{ color: '#166534' }}>
              {'Total: ₹' + totalAmount.toLocaleString('en-IN')}
            </Text>
          </div>
        </Form>
      </Modal>
      <Modal
        open={viewOpen}
        title={"Quotation: " + (selected?.quotation_number || selected?.id || '')}
        onCancel={() => setViewOpen(false)}
        footer={<Button onClick={() => setViewOpen(false)}>Close</Button>}
        width={640}
        destroyOnClose
      >
        {selected && (
          <div>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={12}><Text type="secondary">PR Number</Text><div>{selected.PR?.pr_number || selected.PurchaseRequisition?.pr_number || selected.pr_number || '—'}</div></Col>
              <Col span={12}><Text type="secondary">Vendor</Text><div>{selected.vendor?.vendor_name || selected.Vendor?.vendor_name || selected.vendor_name || '—'}</div></Col>
              <Col span={12} style={{ marginTop: 8 }}><Text type="secondary">Status</Text><div><Tag color={STATUS_COLOR[selected.status] || 'default'}>{selected.status || 'DRAFT'}</Tag></div></Col>
              <Col span={12} style={{ marginTop: 8 }}><Text type="secondary">Valid Until</Text><div>{selected.valid_until ? selected.valid_until.split('T')[0] : '—'}</div></Col>
              <Col span={24} style={{ marginTop: 8 }}><Text type="secondary">Total Amount</Text><div style={{ fontWeight: 700 }}>{'₹' + Number(selected.net_amount || selected.total_amount || 0).toLocaleString('en-IN')}</div></Col>
              {selected.is_selected && <Col span={24} style={{ marginTop: 8 }}><Text type="secondary">{'Awarded' + (selected.selected_rank ? ' (L' + selected.selected_rank + ')' : '')}</Text>{selected.deviation_reason ? <div style={{ color: 'var(--color-text)' }}><b>Deviation justification:</b> {selected.deviation_reason}</div> : <div style={{ color: 'var(--color-text-muted)' }}>L1 — lowest quote</div>}</Col>}
              {selected.remarks && <Col span={24} style={{ marginTop: 8 }}><Text type="secondary">Remarks</Text><div>{selected.remarks}</div></Col>}
            </Row>
            {(selected.items || selected.QuotationItems || []).length > 0 && (
              <>
                <Divider style={{ margin: '8px 0' }} />
                <Text strong>Line Items</Text>
                <Table
                  size="small"
                  style={{ marginTop: 8 }}
                  dataSource={selected.items || selected.QuotationItems || []}
                  rowKey={(r, i) => r.id || i}
                  pagination={false}
                  columns={[
                    { title: 'Item', dataIndex: 'item_name', key: 'item_name' },
                    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right' },
                    { title: 'Unit Price', dataIndex: 'unit_price', key: 'unit_price', align: 'right', render: v => '₹' + Number(v||0).toLocaleString('en-IN') },
                    { title: 'Total', key: 'total', align: 'right', render: (_, r) => '₹' + (Number(r.quantity||0)*Number(r.unit_price||0)).toLocaleString('en-IN') },
                  ]}
                />
              </>
            )}
            <Divider style={{ margin: '12px 0' }} />
            <ActivityTrail module="QUOTATION" id={selected.id} refreshKey={rows} />
          </div>
        )}
      </Modal>

      <Modal open={!!awardRow} title="Award Quotation" onCancel={() => setAwardRow(null)} confirmLoading={awarding} okText="Award" onOk={handleAward}>
        {awardRow && (() => {
          const low = lowestForPr(awardRow.pr_id);
          const amt = Number(awardRow.net_amount || awardRow.total_amount || 0);
          const isDeviation = low != null && amt > low;
          return (
            <div>
              <p style={{ marginTop: 0 }}><b>{awardRow.quotation_number}</b>{awardRow.vendor?.vendor_name ? (" - " + awardRow.vendor.vendor_name) : ""}</p>
              <p>Amount: <b>{"\u20B9" + amt.toLocaleString("en-IN")}</b>{low != null && <span style={{ color: "var(--color-text-muted)" }}>{"  \u00B7  Lowest (L1): \u20B9" + Number(low).toLocaleString("en-IN")}</span>}</p>
              {isDeviation && <div style={{ background: "#fff7e6", border: "1px solid #faad14", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>This is <b>not the lowest (L1)</b> quote - a justification is <b>required</b> to award it.</div>}
              <Input.TextArea rows={3} placeholder={isDeviation ? "Reason for deviation from L1 (required)" : "Justification / remarks"} value={awardReason} onChange={(e) => setAwardReason(e.target.value)} />
            </div>
          );
        })()}
      </Modal>
      <VendorEmailReview draftId={emailDraftId} open={!!emailDraftId} onClose={() => setEmailDraftId(null)} />
    </div>
  );
};

export default QuotationManagement;
