import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Form, Input, Modal, Radio, Segmented, Space, Switch, Table, Tag, Tooltip, Typography, message } from 'antd';
import { CheckCircle2, FileText, RefreshCcw, XCircle } from 'lucide-react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';

const { Text } = Typography;
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const age = (d) => (d == null ? '—' : d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`);
const STAGE_COLOR = { PROCUREMENT_REVIEW: 'purple', RECEIPT_REVIEW: 'orange', FINANCE_REVIEW: 'blue' };
const TYPE_LABEL = { PRICE: 'Price', QUANTITY: 'Quantity', OTHER: 'Other' };

/**
 * Bill Approvals: bills waiting for the signed-in person. "To approve" lists pending bills within
 * their approval limit (never their own); "Exceptions" lists three-way-match exceptions routed to
 * their role: Procurement (price), Warehouse (quantity), Finance (decide).
 */
export default function BillApprovals() {
  const navigate = useNavigate();
  const [view, setView] = useState('approve');
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [rejectRow, setRejectRow] = useState(null);
  const [reviewRow, setReviewRow] = useState(null);
  const [decideRow, setDecideRow] = useState(null);
  const [rejectForm] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const [decideForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/bill-approvals', { params: { view, all: showAll ? '1' : '0' } });
      setData(res?.data?.data || null);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not load bill approvals');
    } finally {
      setLoading(false);
    }
  }, [view, showAll]);
  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, after) => {
    setBusy(key);
    try {
      const res = await fn();
      message.success(res?.data?.message || 'Done');
      after?.();
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  };
  const approve = (row) => act(`a-${row.id}`, () => api.post(`/bill-approvals/${row.id}/approve`, {}));
  const submitReject = async () => {
    const { reason } = await rejectForm.validateFields();
    act('reject', () => api.post(`/bill-approvals/${rejectRow.id}/reject`, { reason }), () => setRejectRow(null));
  };
  const submitReview = async () => {
    const v = await reviewForm.validateFields();
    act('review', () => api.post(`/bill-approvals/${reviewRow.id}/review`, v), () => setReviewRow(null));
  };
  const submitDecide = async () => {
    const v = await decideForm.validateFields();
    act('decide', () => api.post(`/bill-approvals/${decideRow.id}/decide`, v), () => setDecideRow(null));
  };

  const billCol = {
    title: 'Bill', key: 'bill', render: (_, r) => (
      <div>
        <Space size={6}>
          <Text strong>{r.invoice_number}</Text>
          {r.document_url && <Tooltip title="Open the bill"><a href={r.document_url} target="_blank" rel="noreferrer"><FileText size={13} /></a></Tooltip>}
        </Space>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.vendor?.vendor_name || '—'}{r.invoice_date ? ` · ${dayjs(r.invoice_date).format('DD MMM YYYY')}` : ''}</div>
      </div>
    ),
  };
  const poCol = {
    title: 'PO', key: 'po', render: (_, r) => (
      <div>
        {r.purchase_order?.po_number || <Text type="secondary">No PO</Text>}
        {r.requested_by && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>requested by {r.requested_by}</div>}
      </div>
    ),
  };

  const approveColumns = [
    billCol,
    { title: 'Amount', dataIndex: 'total_amount', key: 'amt', align: 'right', render: inr },
    poCol,
    { title: 'Submitted by', dataIndex: 'submitted_by', key: 'sub', render: (v) => v || '—' },
    { title: 'Waiting', dataIndex: 'waiting_days', key: 'age', render: age },
    { title: 'Needs', dataIndex: 'needs', key: 'needs', render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: '', key: 'act', fixed: 'right', render: (_, r) => (
        <Space size={4}>
          <Tooltip title={r.block_reason || ''}>
            <Button size="small" type="primary" icon={<CheckCircle2 size={13} />} disabled={!r.can_approve} loading={busy === `a-${r.id}`} onClick={() => approve(r)}>Approve</Button>
          </Tooltip>
          {data?.can_approve_any && <Button size="small" danger icon={<XCircle size={13} />} onClick={() => { rejectForm.resetFields(); setRejectRow(r); }}>Reject</Button>}
        </Space>
      ),
    },
  ];

  const exceptionColumns = [
    billCol,
    { title: 'Amount', dataIndex: 'total_amount', key: 'amt', align: 'right', render: inr },
    poCol,
    {
      title: 'Problem', key: 'problem', render: (_, r) => (
        <div style={{ maxWidth: 340 }}>
          <Tag style={{ marginBottom: 4 }}>{TYPE_LABEL[r.exception_type] || r.exception_type}</Tag>
          {r.reasons.slice(0, 3).map((x) => <div key={x} style={{ fontSize: 12 }}>{x}</div>)}
          {r.reasons.length > 3 && <Text type="secondary" style={{ fontSize: 12 }}>+{r.reasons.length - 3} more</Text>}
        </div>
      ),
    },
    {
      title: 'With', key: 'stage', render: (_, r) => (
        <div>
          <Tag color={STAGE_COLOR[r.stage]}>{r.stage_label}</Tag>
          {r.review && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 220 }}>{r.review.by}: {r.review.reason}{r.review.note ? ` (${r.review.note})` : ''}</div>}
        </div>
      ),
    },
    { title: 'Waiting', dataIndex: 'waiting_days', key: 'age', render: age },
    {
      title: '', key: 'act', fixed: 'right', render: (_, r) => (
        <Space size={4} wrap>
          {r.can_review && <Button size="small" type="primary" onClick={() => { reviewForm.resetFields(); setReviewRow(r); }}>Review</Button>}
          {r.can_review && r.stage === 'RECEIPT_REVIEW' && <Button size="small" onClick={() => navigate('/procurement/grn')}>Record GRN</Button>}
          {r.can_decide && <Button size="small" type={r.stage === 'FINANCE_REVIEW' ? 'primary' : 'default'} onClick={() => { decideForm.resetFields(); decideForm.setFieldsValue({ decision: 'ACCEPT' }); setDecideRow(r); }}>Decide</Button>}
        </Space>
      ),
    },
  ];

  const counts = data?.counts || {};
  const reasons = data?.reasons || {};

  return (
    <div style={{ padding: 'var(--space-4, 16px)' }}>
      <PageHeader
        title="Bill Approvals"
        subtitle="Bills waiting for you. A bill is approved by someone whose approval limit covers it, never by the person who submitted it. Exceptions go to Procurement (price), Warehouse (quantity) and then Finance."
        actions={<Button icon={<RefreshCcw size={14} />} loading={loading} onClick={load}>Refresh</Button>}
      />
      <Card style={{ borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-medium)' }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'approve', label: counts.approve ? `To approve (${counts.approve})` : 'To approve' },
              { value: 'exceptions', label: counts.exceptions ? `Exceptions (${counts.exceptions})` : 'Exceptions' },
            ]}
          />
          <Space>
            {data?.my_limit != null && view === 'approve' && <Text type="secondary" style={{ fontSize: 12 }}>Your approval limit: {inr(data.my_limit)}</Text>}
            <Switch size="small" checked={showAll} onChange={setShowAll} />
            <Text style={{ fontSize: 13 }}>Show everyone's</Text>
          </Space>
        </div>
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={view === 'approve' ? approveColumns : exceptionColumns}
          dataSource={data?.items || []}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={showAll ? 'Nothing waiting' : 'Nothing waiting for you'} style={{ margin: '32px 0' }} /> }}
        />
      </Card>

      <Modal open={Boolean(rejectRow)} title={`Reject bill ${rejectRow?.invoice_number || ''}`} okText="Reject" okButtonProps={{ danger: true, loading: busy === 'reject' }} onOk={submitReject} onCancel={() => setRejectRow(null)} destroyOnClose>
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Give a reason' }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal open={Boolean(reviewRow)} title={`${reviewRow?.stage_label || 'Review'}: bill ${reviewRow?.invoice_number || ''}`} okText="Send to Finance" okButtonProps={{ loading: busy === 'review' }} onOk={submitReview} onCancel={() => setReviewRow(null)} destroyOnClose width={620}>
        {reviewRow && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert type="warning" showIcon message="Why the match failed" description={<ul style={{ margin: 0, paddingLeft: 18 }}>{reviewRow.reasons.map((x) => <li key={x}>{x}</li>)}</ul>} />
            {reviewRow.stage === 'RECEIPT_REVIEW' && (
              <Text type="secondary" style={{ fontSize: 12 }}>If the goods did arrive, record the GRN: the bill is re-checked and clears by itself. Otherwise say what happened below.</Text>
            )}
            <Form form={reviewForm} layout="vertical">
              <Form.Item name="reason_code" label="What should happen" rules={[{ required: true, message: 'Choose one' }]}>
                <Radio.Group>
                  <Space direction="vertical">{(reasons[reviewRow.stage] || []).map((o) => <Radio key={o.code} value={o.code}>{o.label}</Radio>)}</Space>
                </Radio.Group>
              </Form.Item>
              <Form.Item name="note" label="Note for Finance"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
            </Form>
          </Space>
        )}
      </Modal>

      <Modal open={Boolean(decideRow)} title={`Decide: bill ${decideRow?.invoice_number || ''}`} okText="Confirm" okButtonProps={{ loading: busy === 'decide' }} onOk={submitDecide} onCancel={() => setDecideRow(null)} destroyOnClose width={620}>
        {decideRow && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert type="warning" showIcon message="Why the match failed" description={<ul style={{ margin: 0, paddingLeft: 18 }}>{decideRow.reasons.map((x) => <li key={x}>{x}</li>)}</ul>} />
            {decideRow.review
              ? <Alert type="info" showIcon message={`${decideRow.review.by} recommends: ${decideRow.review.reason}`} description={decideRow.review.note || null} />
              : decideRow.stage !== 'FINANCE_REVIEW' && <Alert type="warning" showIcon message={`Not reviewed yet by ${decideRow.stage_label}`} description="You can still decide; the audit trail will show it was decided before the review." />}
            <Form form={decideForm} layout="vertical">
              <Form.Item name="decision" rules={[{ required: true }]}>
                <Radio.Group>
                  <Space direction="vertical">{(reasons.FINANCE_REVIEW || []).map((o) => <Radio key={o.code} value={o.code}>{o.label}</Radio>)}</Space>
                </Radio.Group>
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(a, b) => a.decision !== b.decision}>
                {({ getFieldValue }) => (
                  <Form.Item name="note" label={getFieldValue('decision') === 'REJECT' ? 'Reason (sent with the rejection)' : 'Note'} rules={getFieldValue('decision') === 'REJECT' ? [{ required: true, message: 'Give a reason' }] : []}>
                    <Input.TextArea rows={2} maxLength={500} />
                  </Form.Item>
                )}
              </Form.Item>
            </Form>
            <Text type="secondary" style={{ fontSize: 12 }}>Accepting sends the bill for approval by amount; it is not paid until someone within their limit approves it.</Text>
          </Space>
        )}
      </Modal>
    </div>
  );
}
