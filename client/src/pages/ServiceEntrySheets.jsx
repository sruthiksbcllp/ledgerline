import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, DatePicker, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Segmented,
  Space, Steps, Table, Tag, Timeline, Typography, message
} from 'antd';
import { RefreshCcw, ClipboardCheck, Eye, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';

const { Text } = Typography;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (v) => (v ? dayjs(v).format('DD MMM YYYY') : '-');
const fmtDateTime = (v) => (v ? dayjs(v).format('DD MMM YYYY, HH:mm') : '');
const personName = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : '');

// Workflow from the FDS (section 8): 1 Service Performed -> 2 Service Confirmation -> 3 Manager Review -> 4 SES Approval
const STAGE_STEPS = [
  { status: null, title: 'Service Performed' },
  { status: 'PENDING_CONFIRMATION', title: 'Service Confirmation' },
  { status: 'PENDING_REVIEW', title: 'Manager Review' },
  { status: 'PENDING_APPROVAL', title: 'SES Approval' }
];
const STATUS_META = {
  PENDING_CONFIRMATION: { color: 'gold', label: 'Awaiting confirmation' },
  PENDING_REVIEW: { color: 'orange', label: 'Awaiting manager review' },
  PENDING_APPROVAL: { color: 'blue', label: 'Awaiting approval' },
  APPROVED: { color: 'success', label: 'Approved' },
  REJECTED: { color: 'error', label: 'Rejected' }
};
const ACTIONS = {
  confirm: { label: 'Confirm service', title: 'Confirm the service was delivered', done: 'Service confirmed' },
  review: { label: 'Review', title: 'Manager review', done: 'Reviewed' },
  approve: { label: 'Approve', title: 'Approve service entry', done: 'Approved' },
  reject: { label: 'Reject', title: 'Reject service entry', done: 'Rejected' }
};
// Same roles the server lets record an SES (SES:add), plus company / platform admins.
const RECORD_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN', 'REQUESTER', 'PROCUREMENT', 'ACCOUNTS_PAYABLE'];

const stageIndex = (status) => {
  if (status === 'APPROVED') return 4;
  const i = STAGE_STEPS.findIndex((s) => s.status === status);
  return i < 0 ? 0 : i;
};

const ServiceEntrySheets = () => {
  const navigate = useNavigate();
  const role = String(JSON.parse(localStorage.getItem('user') || '{}').role || '').toUpperCase();
  const canRecord = RECORD_ROLES.includes(role);

  const [loading, setLoading] = useState(false);
  const [openPOs, setOpenPOs] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [filter, setFilter] = useState('mine');

  const [recordPO, setRecordPO] = useState(null);
  const [qty, setQty] = useState({});
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const [action, setAction] = useState(null); // { ses, key }
  const [actionText, setActionText] = useState('');
  const [acting, setActing] = useState(false);
  const [view, setView] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sesRes, poRes] = await Promise.all([
        api.get('/procurement/ses'),
        canRecord ? api.get('/procurement/ses/purchase-orders') : Promise.resolve(null)
      ]);
      const list = normalizeResponse(sesRes?.data);
      setSheets(list);
      setOpenPOs(poRes ? normalizeResponse(poRes?.data) : []);
      setFilter((f) => (f === 'mine' && !list.some(waitingOnMe) ? 'all' : f));
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to load service entry sheets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { PENDING_CONFIRMATION: 0, PENDING_REVIEW: 0, PENDING_APPROVAL: 0, APPROVED: 0, REJECTED: 0 };
    sheets.forEach((s) => { c[s.status] = (c[s.status] || 0) + 1; });
    return c;
  }, [sheets]);

  const visible = useMemo(() => {
    if (filter === 'mine') return sheets.filter(waitingOnMe);
    if (filter === 'pending') return sheets.filter((s) => s.status.startsWith('PENDING'));
    if (filter === 'APPROVED' || filter === 'REJECTED') return sheets.filter((s) => s.status === filter);
    return sheets;
  }, [sheets, filter]);

  // ── Step 1: record the service performed ──
  const openRecord = (po) => {
    setRecordPO(po);
    setQty({});
    form.resetFields();
  };
  const recordTotal = (recordPO?.items || []).reduce((s, i) => s + Number(qty[i.id] || 0) * Number(i.unit_price || 0), 0);

  const submitRecord = async (values) => {
    const items = (recordPO?.items || [])
      .filter((i) => Number(qty[i.id] || 0) > 0)
      .map((i) => ({ po_item_id: i.id, quantity: Number(qty[i.id]) }));
    if (!items.length) { message.warning('Enter the quantity of service performed on at least one PO line'); return; }
    setSaving(true);
    try {
      const [from, to] = values.period;
      const res = await api.post('/procurement/ses', {
        po_id: recordPO.id,
        service_period_from: from.format('YYYY-MM-DD'),
        service_period_to: to.format('YYYY-MM-DD'),
        service_description: values.service_description,
        performed_by: values.performed_by,
        invoice_number: values.invoice_number,
        items
      });
      message.success(res?.data?.message || 'Service entry recorded');
      setRecordPO(null);
      load();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not record the service entry');
    } finally {
      setSaving(false);
    }
  };

  // ── Steps 2-4 and reject ──
  const openAction = (ses, key) => { setAction({ ses, key }); setActionText(''); };
  const submitAction = async () => {
    const { ses, key } = action;
    if (key === 'reject' && !actionText.trim()) { message.warning('Give a reason for rejecting'); return; }
    setActing(true);
    try {
      const res = await api.post(`/procurement/ses/${ses.id}/${key}`, key === 'reject' ? { reason: actionText } : { remarks: actionText });
      message.success(res?.data?.message || ACTIONS[key].done);
      (res?.data?.data?.warnings || []).forEach((w) => message.warning(w, 6));
      setAction(null);
      if (view?.id === ses.id) setView(res?.data?.data?.ses || null);
      load();
    } catch (err) {
      message.error(err?.response?.data?.message || `${ACTIONS[key].label} failed`);
    } finally {
      setActing(false);
    }
  };

  const openView = async (ses) => {
    setView(ses);
    try {
      const res = await api.get(`/procurement/ses/${ses.id}`);
      setView(res?.data?.data || ses);
    } catch { /* keep the list copy */ }
  };

  const actionButtons = (r, size = 'small') => {
    const can = r.allowed_actions || {};
    const next = ['confirm', 'review', 'approve'].find((k) => can[k]);
    return (
      <Space size={6} wrap>
        {next && <Button type="primary" size={size} onClick={() => openAction(r, next)}>{ACTIONS[next].label}</Button>}
        {can.reject && <Button danger size={size} onClick={() => openAction(r, 'reject')}>Reject</Button>}
      </Space>
    );
  };

  const poColumns = [
    { title: 'PO Number', dataIndex: 'po_number', key: 'po_number' },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r?.Vendor?.vendor_name || '-' },
    { title: 'PO Value', dataIndex: 'total_amount', key: 'total_amount', align: 'right', render: inr },
    {
      title: 'Open service lines', key: 'lines',
      render: (_, r) => (r.items || []).filter((i) => i.open_quantity > 0)
        .map((i) => <div key={i.id}><Text>{i.item_name}</Text> <Text type="secondary">({Number(i.open_quantity)} of {Number(i.quantity)} open)</Text></div>)
    },
    {
      title: 'Action', key: 'action', width: 150,
      render: (_, r) => <Button type="primary" icon={<Plus size={14} />} onClick={() => openRecord(r)}>Record service</Button>
    }
  ];

  const sesColumns = [
    { title: 'SES Number', dataIndex: 'ses_number', key: 'ses_number', render: (v, r) => <Button type="link" style={{ paddingInline: 0 }} onClick={() => openView(r)}>{v}</Button> },
    { title: 'PO Number', key: 'po', render: (_, r) => r.PurchaseOrder?.po_number || '-' },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r.Vendor?.vendor_name || '-' },
    { title: 'Service period', key: 'period', render: (_, r) => `${fmtDate(r.service_period_from)} – ${fmtDate(r.service_period_to)}` },
    { title: 'Value', dataIndex: 'total_value', key: 'value', align: 'right', render: inr },
    { title: 'Stage', dataIndex: 'status', key: 'status', render: (v) => <Tag color={STATUS_META[v]?.color}>{STATUS_META[v]?.label || v}</Tag> },
    {
      title: 'Invoice', key: 'invoice',
      render: (_, r) => {
        const inv = (r.Invoices || [])[0];
        if (inv) return <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => navigate('/procurement/invoices')}>{inv.invoice_number}</Button>;
        return <Text type="secondary">{r.status === 'APPROVED' ? 'Not invoiced' : '-'}</Text>;
      }
    },
    {
      title: 'Action', key: 'action', width: 230,
      render: (_, r) => (
        <Space size={6} wrap>
          <Button type="text" size="small" icon={<Eye size={15} />} onClick={() => openView(r)}>View</Button>
          {actionButtons(r)}
        </Space>
      )
    }
  ];

  const recordItemColumns = [
    { title: 'Service line', dataIndex: 'item_name', key: 'item_name' },
    { title: 'Ordered', dataIndex: 'quantity', key: 'ordered', align: 'right', render: (v) => Number(v || 0) },
    { title: 'Open', dataIndex: 'open_quantity', key: 'open', align: 'right', render: (v) => Number(v || 0) },
    { title: 'Unit price', dataIndex: 'unit_price', key: 'price', align: 'right', render: inr },
    {
      title: 'Quantity performed', key: 'qty', width: 160,
      render: (_, r) => (
        <InputNumber
          min={0}
          max={Number(r.open_quantity || 0)}
          disabled={!(r.open_quantity > 0)}
          value={qty[r.id]}
          onChange={(v) => setQty((q) => ({ ...q, [r.id]: v }))}
          style={{ width: '100%' }}
          placeholder="0"
        />
      )
    },
    { title: 'Amount', key: 'amount', align: 'right', render: (_, r) => inr(Number(qty[r.id] || 0) * Number(r.unit_price || 0)) }
  ];

  const timeline = (s) => {
    const items = [
      { color: 'green', title: 'Service Performed', who: s.Creator, at: s.created_at || s.createdAt, note: s.service_description }
    ];
    if (s.confirmed_at) items.push({ color: 'green', title: 'Service Confirmation', who: s.Confirmer, at: s.confirmed_at, note: s.confirmation_remarks });
    if (s.reviewed_at) items.push({ color: 'green', title: 'Manager Review', who: s.Reviewer, at: s.reviewed_at, note: s.review_remarks });
    if (s.approved_at) items.push({ color: 'green', title: 'SES Approval', who: s.Approver, at: s.approved_at, note: s.approval_remarks });
    if (s.status === 'REJECTED') items.push({ color: 'red', title: `Rejected at ${s.rejected_stage || 'review'}`, who: s.Rejecter, at: s.rejected_at, note: s.rejection_reason });
    else if (s.status !== 'APPROVED') items.push({ color: 'gray', title: `Waiting: ${STAGE_STEPS[stageIndex(s.status)]?.title}`, pending: true });
    return items.map((i) => ({
      color: i.color,
      children: (
        <div>
          <Text strong>{i.title}</Text>
          {!i.pending && <div><Text type="secondary">{personName(i.who) || 'Unknown user'} · {fmtDateTime(i.at)}</Text></div>}
          {i.note && <div><Text>{i.note}</Text></div>}
        </div>
      )
    }));
  };

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<ClipboardCheck size={16} />}
        title="Service Entry Sheet (SES)"
        subtitle="Record services performed against a PO (audit, consultancy, legal, IT support) and take them through confirmation, review and approval"
        actions={<Button icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>}
      />

      <Card style={{ ...contentCard, marginBottom: 16 }}>
        <Steps
          size="small"
          current={-1}
          items={[
            { title: 'Service Performed', description: 'Recorded against an issued PO' },
            { title: 'Service Confirmation', description: `${counts.PENDING_CONFIRMATION} waiting` },
            { title: 'Manager Review', description: `${counts.PENDING_REVIEW} waiting` },
            { title: 'SES Approval', description: `${counts.PENDING_APPROVAL} waiting · ${counts.APPROVED} approved` }
          ]}
        />
      </Card>

      {canRecord && (
        <Card title="Purchase orders open for service entry" style={{ ...contentCard, marginBottom: 16 }} styles={{ body: { padding: 0 } }}>
          <Table
            scroll={{ x: 'max-content' }}
            rowKey="id"
            loading={loading}
            dataSource={openPOs}
            columns={poColumns}
            size="middle"
            pagination={{ pageSize: 8, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], showTotal: (t) => `${t} records`, position: ['bottomRight'] }}
            locale={{ emptyText: <Empty description="No issued PO with service still open" /> }}
          />
        </Card>
      )}

      <Card
        title="SES Register"
        extra={(
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { label: `Waiting on me (${sheets.filter(waitingOnMe).length})`, value: 'mine' },
              { label: 'In progress', value: 'pending' },
              { label: 'Approved', value: 'APPROVED' },
              { label: 'Rejected', value: 'REJECTED' },
              { label: 'All', value: 'all' }
            ]}
          />
        )}
        style={contentCard}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          loading={loading}
          dataSource={visible}
          columns={sesColumns}
          size="middle"
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], showTotal: (t) => `${t} records`, position: ['bottomRight'] }}
          locale={{ emptyText: <Empty description={filter === 'mine' ? 'Nothing is waiting on you' : 'No service entry sheets'} /> }}
        />
      </Card>

      {/* Step 1 - Service Performed */}
      <Drawer
        open={!!recordPO}
        onClose={() => setRecordPO(null)}
        width={820}
        title={`Record service performed · ${recordPO?.po_number || ''}`}
        destroyOnClose
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Submit for confirmation</Button>}
      >
        {recordPO && (
          <Form form={form} layout="vertical" onFinish={submitRecord}>
            <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Vendor">{recordPO.Vendor?.vendor_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="PO value">{inr(recordPO.total_amount)}</Descriptions.Item>
            </Descriptions>
            <Form.Item name="period" label="Service period" rules={[{ required: true, message: 'Select the period the service covers' }]}>
              <DatePicker.RangePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item name="service_description" label="Service performed" rules={[{ required: true, whitespace: true, message: 'Describe the service performed' }]}>
              <Input.TextArea rows={3} placeholder="e.g. Statutory audit fieldwork for Q2; IT support - 40 hours in October" />
            </Form.Item>
            <Space style={{ width: '100%' }} size={16}>
              <Form.Item name="performed_by" label="Performed by (vendor contact)" style={{ flex: 1, minWidth: 260 }}>
                <Input placeholder="Name or team at the vendor" />
              </Form.Item>
              <Form.Item name="invoice_number" label="Vendor invoice number (optional)" style={{ flex: 1, minWidth: 260 }} tooltip="If given, the invoice is created in Invoice Processing when the SES is approved">
                <Input placeholder="Invoice raised for this service" />
              </Form.Item>
            </Space>
            <Table
              rowKey="id"
              dataSource={recordPO.items || []}
              columns={recordItemColumns}
              size="small"
              pagination={false}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={5}><Text strong>Service value</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><Text strong>{inr(recordTotal)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
            <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
              After you submit, the department that used the service confirms it, a manager reviews it, and an approver approves it. You cannot do those steps on an entry you recorded.
            </Text>
          </Form>
        )}
      </Drawer>

      {/* Steps 2-4 and reject */}
      <Modal
        open={!!action}
        title={action ? `${ACTIONS[action.key].title} · ${action.ses.ses_number}` : ''}
        okText={action ? ACTIONS[action.key].label : 'OK'}
        okButtonProps={{ danger: action?.key === 'reject', loading: acting }}
        onOk={submitAction}
        onCancel={() => setAction(null)}
        destroyOnClose
      >
        {action && (
          <>
            <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="PO">{action.ses.PurchaseOrder?.po_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Vendor">{action.ses.Vendor?.vendor_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Service">{action.ses.service_description}</Descriptions.Item>
              <Descriptions.Item label="Period">{fmtDate(action.ses.service_period_from)} – {fmtDate(action.ses.service_period_to)}</Descriptions.Item>
              <Descriptions.Item label="Value">{inr(action.ses.total_value)}</Descriptions.Item>
            </Descriptions>
            <Input.TextArea
              rows={3}
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              placeholder={action.key === 'reject' ? 'Reason for rejecting (required)' : 'Remarks (optional)'}
            />
            {action.key === 'approve' && (
              <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                Approving marks the service as received on the PO{action.ses.invoice_number ? ` and creates invoice ${action.ses.invoice_number} in Invoice Processing` : ''}.
              </Text>
            )}
          </>
        )}
      </Modal>

      {/* View */}
      <Modal open={!!view} onCancel={() => setView(null)} footer={view ? actionButtons(view, 'middle') : null} width={820} title={`Service Entry Sheet ${view?.ses_number || ''}`}>
        {view && (
          <>
            <Steps
              size="small"
              status={view.status === 'REJECTED' ? 'error' : undefined}
              current={view.status === 'REJECTED' ? Math.max(1, stageIndex(STAGE_STEPS.find((s) => s.title === view.rejected_stage)?.status)) : stageIndex(view.status)}
              items={STAGE_STEPS.map((s) => ({ title: s.title }))}
              style={{ marginBottom: 20 }}
            />
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="PO Number">{view.PurchaseOrder?.po_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="PR Number">{view.PurchaseOrder?.PurchaseRequisition?.pr_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Vendor">{view.Vendor?.vendor_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Performed by">{view.performed_by || '-'}</Descriptions.Item>
              <Descriptions.Item label="Service period">{fmtDate(view.service_period_from)} – {fmtDate(view.service_period_to)}</Descriptions.Item>
              <Descriptions.Item label="Stage"><Tag color={STATUS_META[view.status]?.color}>{STATUS_META[view.status]?.label || view.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Value">{inr(view.total_value)}</Descriptions.Item>
              <Descriptions.Item label="Invoice">{(view.Invoices || [])[0]?.invoice_number || view.invoice_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Service performed" span={2}>{view.service_description}</Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="id"
              dataSource={view.items || []}
              size="small"
              pagination={false}
              style={{ marginBottom: 20 }}
              columns={[
                { title: 'Service line', dataIndex: 'item_name', key: 'item_name' },
                { title: 'Ordered', dataIndex: 'ordered_quantity', key: 'ordered', align: 'right', render: (v) => Number(v || 0) },
                { title: 'Accepted', dataIndex: 'quantity', key: 'qty', align: 'right', render: (v) => Number(v || 0) },
                { title: 'Unit price', dataIndex: 'unit_price', key: 'price', align: 'right', render: inr },
                { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: inr }
              ]}
            />
            <Text strong style={{ display: 'block', marginBottom: 8 }}>History</Text>
            <Timeline items={timeline(view)} />
          </>
        )}
      </Modal>
    </div>
  );
};

function waitingOnMe(s) {
  const can = s.allowed_actions || {};
  return Boolean(can.confirm || can.review || can.approve);
}

export default ServiceEntrySheets;
