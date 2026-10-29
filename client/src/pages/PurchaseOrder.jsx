import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Space, Modal, Form, Select, InputNumber, Button, message, Typography, Empty, Input, Drawer, Descriptions, Radio } from 'antd';
import { Plus, Truck, RefreshCcw, Printer, Mail, Eye, Trash2, ListChecks } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';
import { ActivityTrail, lastActionColumn, useLastActions } from '../components/procurement/ActivityTrail';

const { Title, Text } = Typography;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };

const STATUS_COLOR = {
  SUBMITTED: 'gold',
  IN_APPROVAL: 'orange',
  PENDING_APPROVAL: 'orange',
  APPROVED: 'cyan',
  ISSUED: 'processing',
  PARTIAL_RECEIVED: 'warning',
  RECEIVED: 'success',
  FULLY_RECEIVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'error'
};

const PurchaseOrder = () => {
  const [pos, setPos] = useState([]);
  const [approvedPrs, setApprovedPrs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [properties, setProperties] = useState([]);
  const [locations, setLocations] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState('PR');
  const [approveId, setApproveId] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [comments, setComments] = useState('');
  const [cancelId, setCancelId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [sendPo, setSendPo] = useState(null);
  const [sendNote, setSendNote] = useState('');
  const [sendCc, setSendCc] = useState('');
  const [sending, setSending] = useState(false);
  const [chainInfo, setChainInfo] = useState(null); // Phase 3b: resolved DOA chain preview
  const [manualAppr, setManualAppr] = useState({}); // { [level]: { approver_name, approver_email } }
  const [chainLoading, setChainLoading] = useState(false);
  const [apprOpen, setApprOpen] = useState(false);
  const [apprData, setApprData] = useState(null);
  const [apprLoading, setApprLoading] = useState(false);
  const [apprId, setApprId] = useState(null);
  const [cvPo, setCvPo] = useState(null);
  const [cvVendor, setCvVendor] = useState(null);
  const [cvReason, setCvReason] = useState('');
  const [cvSaving, setCvSaving] = useState(false);
  const handleChangeVendor = async () => {
    if (!cvVendor) return message.error('Select a vendor');
    setCvSaving(true);
    try {
      await api.put(`/procurement/po/${cvPo.id}/change-vendor`, { vendor_id: cvVendor, reason: cvReason });
      message.success('Vendor changed; approval re-triggered');
      setCvPo(null); setCvVendor(null); setCvReason(''); fetchData();
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to change vendor'); }
    finally { setCvSaving(false); }
  };
  const openApprovalStatus = async (id) => {
    setApprOpen(true); setApprLoading(true); setApprData(null); setApprId(id);
    try { const res = await api.get(`/procurement/po/${id}/approval-status`); setApprData(res?.data?.data || res?.data || null); }
    catch { message.error('Failed to load approval status'); }
    finally { setApprLoading(false); }
  };
  const [viewPo, setViewPo] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [poLineItems, setPoLineItems] = useState([]);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const handlePrint = async (id) => {
    try {
      const res = await api.get(`/procurement/po/${id}/print`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch {
      message.error('Failed to generate PO PDF');
    }
  };

  const handleApprove = async () => {
    try {
      await api.post('/approvals/PO/' + approveId + '/approve', { comments });
      message.success('Purchase Order approved');
      setApproveId(null);
      setComments('');
      fetchData();
    } catch (err) { message.error(err?.response?.data?.message || 'Approval failed'); }
  };

  const handleReject = async () => {
    if (!comments.trim()) { message.warning('Rejection reason is required'); return; }
    try {
      await api.post('/approvals/PO/' + rejectId + '/reject', { comments });
      message.success('Purchase Order rejected');
      setRejectId(null);
      setComments('');
      fetchData();
    } catch (err) { message.error(err?.response?.data?.message || 'Rejection failed'); }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) { message.warning('Cancellation reason is required'); return; }
    try {
      await api.delete('/procurement/po/' + cancelId, { data: { reason: cancelReason.trim() } });
      message.success('Purchase Order cancelled');
      setCancelId(null); setCancelReason('');
      fetchData();
    } catch (err) { message.error(err?.response?.data?.message || 'Cancel failed'); }
  };

  const handleSendToVendor = async () => {
    if (!sendPo) return;
    setSending(true);
    try {
      const res = await api.post(`/procurement/po/${sendPo.id}/send-to-vendor`, { note: sendNote, cc: sendCc || undefined });
      const d = normalizeResponse(res);
      message.success(`Purchase Order sent to ${d?.sent_to || 'vendor'}`);
      setSendPo(null);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to send PO to vendor');
    } finally {
      setSending(false);
    }
  };

  const openView = async (id) => {
    setViewOpen(true); setViewPo(null); setViewLoading(true);
    try {
      const res = await api.get(`/procurement/po/${id}`);
      setViewPo(res?.data?.data ?? res?.data ?? null);
    } catch {
      message.error('Failed to load PO details');
    } finally {
      setViewLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [poRes, prRes, vendorRes, propertyRes, qRes, locRes] = await Promise.all([
        api.get('/procurement/po'),
        api.get('/procurement/pr'),
        api.get('/masters/vendors'),
        api.get('/masters/properties'),
        api.get('/procurement/quotations').catch(() => ({ data: [] })),
        api.get('/masters/locations').catch(() => ({ data: [] }))
      ]);
      setPos(normalizeResponse(poRes));
      setApprovedPrs(normalizeResponse(prRes).filter((p) => p.status === 'APPROVED'));
      setVendors(normalizeResponse(vendorRes));
      setProperties(normalizeResponse(propertyRes));
      setQuotations(normalizeResponse(qRes).filter((q) => q.status === 'APPROVED'));
      setLocations(normalizeResponse(locRes));
    } catch {
      message.error('Failed to load purchase order data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const itemsReadOnly = sourceType === 'QUOTATION';
  const poTotal = poLineItems.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const updateLine = (idx, field, val) => setPoLineItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: val } : it)));
  const addLine = () => setPoLineItems((prev) => [...prev, { item_name: '', quantity: 1, unit_price: 0 }]);
  const removeLine = (idx) => setPoLineItems((prev) => prev.filter((_, i) => i !== idx));
  const onSourceTypeChange = (v) => { setSourceType(v); form.resetFields(['pr_id', 'quotation_id']); setChainInfo(null); setManualAppr({}); setPoLineItems(v === 'DIRECT' ? [{ item_name: '', quantity: 1, unit_price: 0 }] : []); };
  const onPrSelect = (pid) => {
    const p = approvedPrs.find((x) => x.id === pid);
    if (p) {
      // Prefer the awarded quotation's vendor for this PR (PRs are often raised without a vendor);
      // fall back to the PR's own vendor.
      const awardedQ = (quotations || []).find((q) => q.pr_id === pid && (q.is_selected || q.status === 'APPROVED'));
      form.setFieldsValue({ property_id: p.property_id ?? undefined, vendor_id: (awardedQ?.vendor_id ?? p.vendor_id) ?? undefined });
      // When the PR has an awarded quotation, the PO price must come from the QUOTATION (the vendor's
      // committed prices), not the PR's rough estimate — otherwise the amount shows blank/0. Fall back
      // to the PR items' estimated_cost only when there is no awarded quotation.
      const lines = (awardedQ?.items && awardedQ.items.length)
        ? awardedQ.items.map((it) => ({ item_name: it.item_name, quantity: Number(it.quantity || 1), unit_price: Number(it.unit_price || 0) }))
        : (p?.items || []).map((it) => ({ item_name: it.item_name, quantity: Number(it.quantity || 1), unit_price: Number(it.estimated_cost || 0) }));
      setPoLineItems(lines);
    }
  };
  const onQuotationSelect = (qid) => { const q = quotations.find((x) => x.id === qid); if (q) form.setFieldsValue({ vendor_id: q.vendor_id }); setPoLineItems((q?.items || []).map((it) => ({ item_name: it.item_name, quantity: Number(it.quantity || 1), unit_price: Number(it.unit_price || 0) }))); };

  const checkChain = async () => {
    setChainLoading(true);
    try {
      const prId = form.getFieldValue('pr_id');
      const body = { amount: poTotal };
      if (sourceType === 'PR' && prId) body.pr_id = prId;
      const res = await api.post('/doa-config/preview-chain', body);
      const d = res?.data?.data || {};
      if (!d.doa) { setChainInfo(null); setManualAppr({}); message.info(d.reason || 'No DOA approval configured for this PO'); }
      else {
        setChainInfo(d);
        if (!(d.manual_levels || []).length) message.success('Approval chain resolved — no manual approver needed');
      }
    } catch (e) { message.error(e?.response?.data?.message || 'Could not resolve approval chain'); }
    finally { setChainLoading(false); }
  };

  const handleCreate = async (values) => {
    const manualLevels = chainInfo?.manual_levels || [];
    for (const lv of manualLevels) {
      const m = manualAppr[lv] || {};
      if (!m.approver_email) return message.error(`Pick an approver (email) for approval Level ${lv}`);
    }
    try {
      await api.post('/procurement/po', {
        source_type: sourceType,
        pr_id: sourceType === 'PR' ? values.pr_id : undefined,
        quotation_id: sourceType === 'QUOTATION' ? values.quotation_id : undefined,
        property_id: values.property_id,
        vendor_id: values.vendor_id,
        total_amount: poTotal,
        advance_given: !!values.advance_given,
        advance_amount: values.advance_given ? values.advance_amount : undefined,
        items: sourceType === 'QUOTATION' ? undefined : poLineItems.filter((it) => it.item_name),
        item_description: values.item_description,
        location_id: sourceType === 'DIRECT' ? values.location_id : undefined,
        requestor_name: sourceType === 'DIRECT' ? values.requestor_name : undefined,
        approval_comment: values.approval_comment,
        po_warranty: values.po_warranty || undefined,
        po_payment_terms: values.po_payment_terms || undefined,
        po_terms: values.po_terms || undefined,
        manual_approvers: manualLevels.map((lv) => ({ level: lv, approver_name: manualAppr[lv]?.approver_name || null, approver_email: manualAppr[lv]?.approver_email || null }))
      });
      message.success('Purchase Order created');
      setOpen(false);
      setChainInfo(null); setManualAppr({});
      form.resetFields();
      setPoLineItems([]);
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to create PO');
    }
  };

  const lastActions = useLastActions('PO', pos, pos);

  const columns = [
    { title: 'PO Number', dataIndex: 'po_number', key: 'po_number', render: (v) => <Tag color="blue">{v || '-'}</Tag> },
    { title: 'Reference', key: 'pr_reference', render: (_, r) => r?.PurchaseRequisition?.pr_number || '-' },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r?.Vendor?.vendor_name || '-' },
    {
      title: 'Amount',
      dataIndex: 'total_amount',
      key: 'total_amount',
      align: 'right',
      render: (v) => ('₹' + Number(v || 0).toLocaleString('en-IN'))
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{v || '-'}</Tag>
    },
    lastActionColumn('PO', lastActions, { numberOf: (r) => r.po_number }),
    {
      title: 'Action',
      key: 'action',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<Eye size={16} />} onClick={() => openView(r.id)}>View</Button>
          <Button size="small" icon={<Printer size={16} />} onClick={() => handlePrint(r.id)}>Print</Button>
          <Button size="small" icon={<ListChecks size={16} />} onClick={() => openApprovalStatus(r.id)}>Status</Button>
          {r.can_approve && (
            <>
              <Button size="small" type="primary" style={{ background: 'var(--color-success)', border: 'none' }} onClick={() => { setApproveId(r.id); setComments(''); }}>Approve</Button>
              <Button size="small" danger onClick={() => { setRejectId(r.id); setComments(''); }}>Reject</Button>
            </>
          )}
          {['ISSUED', 'PARTIAL_RECEIVED'].includes(r.status) && (
            <Button size="small" icon={<Truck size={16} />} onClick={() => navigate('/procurement/grn')}>GRN</Button>
          )}
          {['ISSUED', 'PARTIAL_RECEIVED'].includes(r.status) && (
            <Button size="small" icon={<Mail size={16} />} onClick={() => { setSendPo(r); setSendNote(''); setSendCc(''); }}>
              {r.vendor_email_sent_at ? 'Resend to Vendor' : 'Send to Vendor'}
            </Button>
          )}
          {!['RECEIVED', 'FULLY_RECEIVED', 'CANCELLED'].includes(r.status) && (
            <Button size="small" icon={<RefreshCcw size={16} />} onClick={() => { setCvPo(r); setCvVendor(null); setCvReason(''); }}>Change Vendor</Button>
          )}
          {['RECEIVED', 'FULLY_RECEIVED'].includes(r.status) && <Tag color="green">Received</Tag>}
          {!['RECEIVED', 'FULLY_RECEIVED', 'CANCELLED'].includes(r.status) && (
            <Button size="small" danger icon={<Trash2 size={16} />} onClick={() => { setCancelId(r.id); setCancelReason(''); }}>Cancel</Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<Truck size={16} />}
        title="Purchase Orders"
        subtitle={pos.length + ' records'}
        actions={(
          <Space>
            <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={fetchData}>Refresh</Button>
            <Button icon={<Plus size={16} />} type="primary" onClick={() => setOpen(true)}>Generate PO</Button>
          </Space>
        )}
      />

      <Card style={contentCard} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          locale={{ emptyText: <Empty description="No purchase orders found" style={{ margin: '40px 0' }} /> }}
          dataSource={pos}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 10, showTotal: (total) => 'Total: ' + total + ' records', position: ['bottomRight'] }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal open={open} title="Issue Purchase Order" onCancel={() => { setOpen(false); setSourceType('PR'); setPoLineItems([]); setChainInfo(null); setManualAppr({}); }} onOk={() => form.submit()} okText="Issue PO" destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item label="Source Type">
            <Select value={sourceType} onChange={onSourceTypeChange}>
              <Select.Option value="PR">From PR</Select.Option>
              <Select.Option value="QUOTATION">From Quotation</Select.Option>
              <Select.Option value="DIRECT">Direct PO</Select.Option>
            </Select>
          </Form.Item>
          {sourceType === 'PR' && (
            <Form.Item name="pr_id" label="Approved PR" rules={[{ required: true, message: 'Please select a PR' }]}>
              <Select placeholder="Select PR" onChange={onPrSelect}>
                {approvedPrs.map((p) => <Select.Option key={p.id} value={p.id}>{p.pr_number}</Select.Option>)}
              </Select>
            </Form.Item>
          )}
          {sourceType === 'QUOTATION' && (
            <Form.Item name="quotation_id" label="Approved Quotation" rules={[{ required: true, message: 'Please select a quotation' }]}>
              <Select placeholder="Select approved quotation" onChange={onQuotationSelect}>
                {quotations.map((q) => <Select.Option key={q.id} value={q.id}>{(q.quotation_number || ('QTN-' + q.id)) + '  ·  ₹' + Number(q.net_amount || q.total_amount || 0).toLocaleString('en-IN') + (q.selected_rank ? ('  (L' + q.selected_rank + ')') : '')}</Select.Option>)}
              </Select>
            </Form.Item>
          )}
          {sourceType === 'DIRECT' && (
            <>
              <Form.Item name="item_description" label="Item Description">
                <Input.TextArea rows={2} placeholder="Describe items being ordered" />
              </Form.Item>
              <Form.Item name="location_id" label="Location">
                <Select allowClear showSearch optionFilterProp="children" placeholder="Select location">
                  {locations.map((l) => <Select.Option key={l.id} value={l.id}>{l.location_name || l.name}</Select.Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="requestor_name" label="Requestor Name">
                <Input placeholder="Actual requestor (if not a system user)" />
              </Form.Item>
            </>
          )}
          <Form.Item name="property_id" label="Property" rules={[{ required: true, message: 'Please select a property' }]}>
            <Select placeholder="Select Property">
              {properties.map((p) => <Select.Option key={p.id} value={p.id}>{p.property_name || p.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="vendor_id" label="Vendor" rules={[{ required: true, message: 'Please select a vendor' }]}>
            <Select placeholder="Select Vendor">
              {vendors.map((v) => <Select.Option key={v.id} value={v.id}>{v.vendor_name}</Select.Option>)}
            </Select>
          </Form.Item>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>Items{itemsReadOnly && <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400 }}> (from quotation - read only)</span>}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 0.8fr 1.1fr 1.2fr 30px', gap: '0 8px', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>
            <div>Item</div><div>Qty</div><div>Unit Price</div><div style={{ textAlign: 'right' }}>Amount</div><div />
          </div>
          {poLineItems.map((it, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2.4fr 0.8fr 1.1fr 1.2fr 30px', gap: '0 8px', alignItems: 'center', marginBottom: 8 }}>
              <Input value={it.item_name} disabled={itemsReadOnly} placeholder="Item name" onChange={(e) => updateLine(idx, 'item_name', e.target.value)} />
              <InputNumber min={0} value={it.quantity} disabled={itemsReadOnly} style={{ width: '100%' }} onChange={(v) => updateLine(idx, 'quantity', v)} />
              <InputNumber min={0} value={it.unit_price} disabled={itemsReadOnly} style={{ width: '100%' }} onChange={(v) => updateLine(idx, 'unit_price', v)} />
              <div style={{ textAlign: 'right', paddingRight: 2 }}>{'\u20B9' + (Number(it.quantity || 0) * Number(it.unit_price || 0)).toLocaleString('en-IN')}</div>
              {!itemsReadOnly ? <Button danger type="text" size="small" icon={<Trash2 size={15} />} disabled={poLineItems.length <= 1} onClick={() => removeLine(idx)} /> : <div />}
            </div>
          ))}
          {!itemsReadOnly && sourceType === 'DIRECT' && (
            <Button type="dashed" onClick={addLine} icon={<Plus size={16} />} style={{ width: '100%', marginBottom: 12 }}>Add item</Button>
          )}
          {poLineItems.length === 0 && <div style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 12 }}>Select a {sourceType === 'PR' ? 'PR' : 'quotation'} to load its items.</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', margin: '4px 0 12px', fontWeight: 500 }}>
            <span>Grand Total:</span><span style={{ fontSize: 16 }}>{'\u20B9' + poTotal.toLocaleString('en-IN')}</span>
          </div>

          <Form.Item name="advance_given" label="Advance given?" initialValue={false}>
            <Radio.Group optionType="button" buttonStyle="solid" options={[{ label: 'No', value: false }, { label: 'Yes', value: true }]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.advance_given !== cur.advance_given}>
            {({ getFieldValue }) => getFieldValue('advance_given') && (
              <Form.Item
                name="advance_amount"
                label="Advance amount"
                extra={poTotal > 0 ? `Up to the PO total of \u20B9${poTotal.toLocaleString('en-IN')}` : undefined}
                rules={[
                  { required: true, message: 'Enter the advance amount' },
                  { validator: (_, v) => (v === undefined || v === null || (Number(v) > 0 && Number(v) <= poTotal) ? Promise.resolve() : Promise.reject(new Error(Number(v) > poTotal ? 'Advance cannot be more than the PO total' : 'Advance must be more than \u20B90'))) }
                ]}
              >
                <InputNumber min={0} precision={2} prefix={'\u20B9'} style={{ width: '100%' }} placeholder="Amount paid to the vendor in advance" />
              </Form.Item>
            )}
          </Form.Item>

          {/* Phase 3b: resolve the DOA chain so the initiator can pick approvers for any manual level */}
          <div style={{ margin: '0 0 12px' }}>
            <Button size="small" loading={chainLoading} onClick={checkChain} icon={<ListChecks size={14} />}>Check approval chain</Button>
            {chainInfo && (
              <div style={{ marginTop: 8, border: '1px solid var(--color-border-medium)', borderRadius: 8, padding: 10, background: 'var(--color-bg-page)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  Approval chain ({chainInfo.expense_type}, {'\u20B9' + Number(chainInfo.amount || 0).toLocaleString('en-IN')}):
                </div>
                {(chainInfo.levels || []).map((lv) => (
                  <div key={lv.level} style={{ fontSize: 12, marginBottom: 4 }}>
                    <b>L{lv.level}</b>: {lv.approvers.map((a) => a.manual ? 'Manual (pick below)' : (a.approver_name || a.label)).join(' + ')}
                  </div>
                ))}
                {(chainInfo.manual_levels || []).length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--color-border-medium)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Pick the approver for each manual level:</div>
                    {chainInfo.manual_levels.map((lv) => (
                      <Space key={lv} wrap style={{ marginBottom: 6 }}>
                        <Tag color="orange">Level {lv}</Tag>
                        <Input placeholder="Approver name" style={{ width: 180 }} value={manualAppr[lv]?.approver_name || ''}
                          onChange={(e) => setManualAppr((m) => ({ ...m, [lv]: { ...m[lv], approver_name: e.target.value } }))} />
                        <Input placeholder="Approver email" style={{ width: 220 }} value={manualAppr[lv]?.approver_email || ''}
                          onChange={(e) => setManualAppr((m) => ({ ...m, [lv]: { ...m[lv], approver_email: e.target.value } }))} />
                      </Space>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Form.Item name="approval_comment" label="Comments for approver">
            <Input.TextArea rows={3} placeholder="Any note to include in the approval email sent to the approver" />
          </Form.Item>
          <Form.Item name="po_warranty" label="Warranty (optional — overrides department/tenant default)">
            <Input placeholder="e.g. 12 months from date of delivery" />
          </Form.Item>
          <Form.Item name="po_payment_terms" label="Payment Terms (optional — overrides default)">
            <Input placeholder="e.g. 30 days from invoice" />
          </Form.Item>
          <Form.Item name="po_terms" label="Terms & Conditions (optional — overrides default)">
            <Input.TextArea rows={4} placeholder="Leave blank to use the department / tenant default clauses" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Approve Purchase Order" open={!!approveId} onCancel={() => setApproveId(null)} onOk={handleApprove} okText="Approve" okButtonProps={{ style: { background: 'var(--color-success)', border: 'none' } }}>
        <Input.TextArea rows={3} placeholder="Add approval comments" value={comments} onChange={(e) => setComments(e.target.value)} />
      </Modal>

      <Modal title="Reject Purchase Order" open={!!rejectId} onCancel={() => setRejectId(null)} onOk={handleReject} okText="Reject" okButtonProps={{ danger: true }}>
        <Input.TextArea rows={3} placeholder="Reason for rejection (required)" value={comments} onChange={(e) => setComments(e.target.value)} />
      </Modal>
      <Modal title="Cancel Purchase Order" open={!!cancelId} onCancel={() => { setCancelId(null); setCancelReason(''); }} onOk={handleCancel} okText="Cancel PO" okButtonProps={{ danger: true }} cancelText="Keep">
        <p style={{ marginBottom: 8 }}>This sets the PO status to Cancelled and reverts any linked PR to Approved. This cannot be undone.</p>
        <Input.TextArea rows={3} placeholder="Reason for cancellation (required - recorded in the audit trail)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
      </Modal>

      <Drawer title={viewPo ? `Purchase Order ${viewPo.po_number || ''}` : 'Purchase Order'} width={720} open={viewOpen} onClose={() => setViewOpen(false)} loading={viewLoading}>
        {viewPo && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="PO Number">{viewPo.po_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={STATUS_COLOR[viewPo.status] || 'default'}>{viewPo.status || '-'}</Tag></Descriptions.Item>
              <Descriptions.Item label="Vendor">{viewPo.Vendor?.vendor_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Entity">{viewPo.Entity?.entity_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Property">{viewPo.Property?.property_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Location">{viewPo.Location?.location_name || 'N/A'}</Descriptions.Item>
              <Descriptions.Item label="Requested By">{viewPo.requestor_name || viewPo.PurchaseRequisition?.requestor_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Total Amount">{'₹' + Number(viewPo.total_amount || 0).toLocaleString('en-IN')}</Descriptions.Item>
              <Descriptions.Item label="Advance given">{viewPo.advance_given ? '₹' + Number(viewPo.advance_amount || 0).toLocaleString('en-IN') : 'No'}</Descriptions.Item>
              <Descriptions.Item label="Order Date">{viewPo.order_date ? new Date(viewPo.order_date).toLocaleDateString() : '-'}</Descriptions.Item>
              {viewPo.approval_comment ? <Descriptions.Item label="Comment for approver" span={2}>{viewPo.approval_comment}</Descriptions.Item> : null}
            </Descriptions>
            <Text strong>Line items</Text>
            <Table
              style={{ marginTop: 8 }}
              size="small"
              rowKey={(r, i) => r.id || i}
              pagination={false}
              locale={{ emptyText: 'No line items' }}
              dataSource={viewPo.items || []}
              columns={[
                { title: '#', key: 'sn', width: 50, render: (_, __, i) => i + 1 },
                { title: 'Item', dataIndex: 'item_name', key: 'item' },
                { title: 'Qty', dataIndex: 'quantity', key: 'qty', width: 80, align: 'right' },
                { title: 'Unit Price', dataIndex: 'unit_price', key: 'up', width: 120, align: 'right', render: (v) => '₹' + Number(v || 0).toLocaleString('en-IN') },
                { title: 'Amount', key: 'amt', width: 130, align: 'right', render: (_, r) => '₹' + (Number(r.quantity || 0) * Number(r.unit_price || 0)).toLocaleString('en-IN') }
              ]}
            />
            <div style={{ marginTop: 20 }}>
              <ActivityTrail module="PO" id={viewPo.id} refreshKey={pos} />
            </div>
          </>
        )}
      </Drawer>

      <Modal
        title="Send Purchase Order to Vendor"
        open={!!sendPo}
        onCancel={() => setSendPo(null)}
        onOk={handleSendToVendor}
        okText="Send"
        confirmLoading={sending}
        destroyOnClose
      >
        <div style={{ marginBottom: 12, color: 'var(--color-text-muted)', fontSize: 13 }}>
          The PO PDF will be emailed to the vendor's email on file{sendPo?.vendor_email_sent_to ? ` (last sent to ${sendPo.vendor_email_sent_to})` : ''}. Procurement is CC'd automatically.
        </div>
        <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>CC (optional — overrides the default procurement inbox)</div>
        <Input placeholder="cc@company.com" value={sendCc} onChange={(e) => setSendCc(e.target.value)} style={{ marginBottom: 12 }} />
        <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Covering note</div>
        <Input.TextArea rows={4} placeholder="Leave blank to use the default covering message." value={sendNote} onChange={(e) => setSendNote(e.target.value)} />
      </Modal>
      <Modal title={`Change Vendor${cvPo ? ' — ' + (cvPo.po_number || '') : ''}`} open={!!cvPo} onCancel={() => setCvPo(null)} confirmLoading={cvSaving} onOk={handleChangeVendor} okText="Change & Re-approve">
        <div style={{ marginBottom: 10, color: 'var(--color-text-muted)', fontSize: 13 }}>Select the new vendor (e.g. L2 after L1 declines). The PO resets and the approval workflow re-runs from the first level.</div>
        <Select showSearch optionFilterProp="children" placeholder="New vendor" style={{ width: '100%', marginBottom: 12 }} value={cvVendor} onChange={setCvVendor}>
          {vendors.map((v) => <Select.Option key={v.id} value={v.id}>{v.vendor_name}</Select.Option>)}
        </Select>
        <Input.TextArea rows={3} placeholder="Reason for vendor change" value={cvReason} onChange={(e) => setCvReason(e.target.value)} />
      </Modal>

      <Drawer title="Approval Status" open={apprOpen} onClose={() => setApprOpen(false)} width={460} destroyOnClose>
        {apprLoading ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>Loading…</div>
          : !apprData ? <Empty description="No data" />
          : !apprData.doa ? <div style={{ color: 'var(--color-text-muted)' }}>This PO did not go through the approval workflow. Current status: <Tag>{apprData.po_status}</Tag></div>
          : (
            <div>
              <div style={{ marginBottom: 12 }}>
                <Tag color={apprData.request_status === 'APPROVED' ? 'green' : apprData.request_status === 'REJECTED' ? 'red' : 'blue'}>{apprData.request_status}</Tag>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}> · ₹{Number(apprData.amount || 0).toLocaleString('en-IN')}</span>
              </div>
              {(apprData.levels || []).map((lv) => {
                const c = lv.status === 'APPROVED' ? 'green' : lv.status === 'REJECTED' ? 'red' : lv.status === 'IN_PROGRESS' ? 'blue' : 'default';
                const edge = lv.status === 'APPROVED' ? 'success' : lv.status === 'REJECTED' ? 'danger' : 'info';
                const isActive = apprData.active_level === lv.level;
                return (
                  <div key={lv.level} style={{ border: '1px solid var(--color-border)', borderLeft: `3px solid var(--color-${edge})`, borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: isActive ? 'var(--color-bg-page)' : 'transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <b>Level {lv.level}{isActive ? ' (current)' : ''}</b>
                      <Tag color={c}>{lv.status}</Tag>
                    </div>
                    {(lv.approvers || []).map((a, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                        <span>{a.approver_name}{a.eligible && a.eligible.length ? ` (${a.eligible.join(', ')})` : ''}</span>
                        <span>
                          <Tag color={a.status === 'APPROVED' ? 'green' : a.status === 'REJECTED' ? 'red' : 'default'} style={{ marginRight: 0 }}>{a.status}</Tag>
                          {a.decided_at ? <span style={{ color: 'var(--color-text-muted)', fontSize: 11, marginLeft: 6 }}>{new Date(a.decided_at).toLocaleDateString('en-IN')}</span> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        {apprOpen && apprId && (
          <div style={{ marginTop: 20 }}>
            <ActivityTrail module="PO" id={apprId} refreshKey={pos} />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default PurchaseOrder;
