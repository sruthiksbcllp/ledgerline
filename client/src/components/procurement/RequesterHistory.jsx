import React, { useState } from 'react';
import { Button, Empty, Modal, Space, Spin, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import { Info } from 'lucide-react';
import api from '../../utils/api';

const { Text } = Typography;

const STATUS_COLOR = {
  APPROVED: 'success', PO_CREATED: 'cyan', REJECTED: 'error', CANCELLED: 'default',
  PENDING_APPROVAL: 'warning', SUBMITTED: 'processing', IN_APPROVAL: 'warning', DRAFT: 'default'
};
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Small ⓘ button beside the requester on a PR: shows the same requester's earlier PRs, so the
 * approver can see what they asked for before (repeat requests, totals, earlier rejections).
 */
export default function RequesterHistory({ prId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState('');

  const show = async () => {
    setOpen(true);
    setLoading(true);
    setProblem('');
    try {
      const res = await api.get(`/procurement/pr/${prId}/requester-history`);
      setData(res?.data?.data || null);
    } catch (e) {
      setProblem(e?.response?.data?.message || 'Could not load the earlier requests');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: 'PR', dataIndex: 'pr_number', key: 'pr', render: (v, r) => <Text strong>{v || `#${r.id}`}</Text> },
    { title: 'Date', dataIndex: 'created_at', key: 'date', render: (v) => (v ? new Date(v).toLocaleDateString('en-IN') : '-') },
    {
      title: 'Items', dataIndex: 'items', key: 'items',
      render: (items, r) => (
        <div style={{ maxWidth: 260 }}>
          {items.length ? items.map((i, n) => <div key={n}>{i.item_name} × {i.quantity} {i.unit}</div>) : <Text type="secondary">{r.justification || '-'}</Text>}
        </div>
      )
    },
    { title: 'Department', dataIndex: 'department', key: 'dept', render: (v) => v || '-' },
    { title: 'Amount', dataIndex: 'total_cost', key: 'amount', align: 'right', render: inr },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{String(v || 'DRAFT').replace(/_/g, ' ')}</Tag> }
  ];

  const s = data?.summary;
  return (
    <>
      <Tooltip title="Earlier requests from this requester">
        <Button type="text" size="small" aria-label="Earlier requests from this requester" icon={<Info size={15} />} onClick={show} style={{ marginLeft: 6, color: 'var(--color-primary, #4F46E5)' }} />
      </Tooltip>
      <Modal
        title={`Earlier requests${data?.requester ? ` — ${data.requester}` : ''}`}
        open={open}
        onCancel={() => setOpen(false)}
        footer={<Button onClick={() => setOpen(false)}>Close</Button>}
        width={820}
      >
        {loading && <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>}
        {problem && <Text type="danger">{problem}</Text>}
        {!loading && data && (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Space size={32} wrap>
              <Statistic title="Earlier PRs" value={s.count} />
              <Statistic title="Total asked" value={inr(s.total)} />
              <Statistic title="Approved" value={s.approved} valueStyle={{ color: 'var(--color-success, #16a34a)' }} />
              <Statistic title="Rejected" value={s.rejected} valueStyle={{ color: s.rejected ? 'var(--color-danger, #dc2626)' : undefined }} />
              <Statistic title="Still pending" value={s.pending} valueStyle={{ color: s.pending ? 'var(--color-warning, #d97706)' : undefined }} />
            </Space>
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={data.requests}
              pagination={{ pageSize: 5, hideOnSinglePage: true }}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No earlier requests from this requester" /> }}
            />
          </Space>
        )}
      </Modal>
    </>
  );
}
