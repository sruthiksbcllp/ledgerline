import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Button, Input, Select, Space,
  Typography, Tag, Row, Col, message, Modal, Empty
} from 'antd';
import { Check, X, Clock, RefreshCcw, Search } from 'lucide-react';
import api from '../utils/api';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const MODULE_COLORS = { PR: 'blue', PO: 'geekblue', DISPOSAL: 'red', GRN: 'green', MOVEMENT: 'orange' };
const REQUEST_TYPE_COLORS = { PURCHASE: 'blue', TRANSFER: 'cyan', DISPOSAL: 'red', ISSUE: 'purple', MAINTENANCE: 'orange', OTHER: 'default' };
const STATUS_COLORS = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'default', IN_APPROVAL: 'processing', SUBMITTED: 'blue', DRAFT: 'default' };

const ApprovalRequests = () => {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ page: 1, pageSize: 15, module: '', search: '' });
  const [actionModal, setActionModal] = useState({ open: false, record: null, type: '' });
  const [comment, setComment] = useState('');
  const [acting, setActing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/approvals/pending');
      const body = res.data?.data ?? res.data ?? {};
      let rows = [];
      if (Array.isArray(body)) {
        rows = body;
      } else {
        Object.entries(body).forEach(([mod, items]) => {
          if (Array.isArray(items)) {
            items.forEach(item => rows.push({ ...item, module: item.module || mod }));
          }
        });
      }
      if (filters.module) rows = rows.filter(r => r.module === filters.module);
      if (filters.search) {
        const s = filters.search.toLowerCase();
        rows = rows.filter(r =>
          String(r.id).includes(s) ||
          (r.requester_name || '').toLowerCase().includes(s)
        );
      }
      setTotal(rows.length);
      const start = (filters.page - 1) * filters.pageSize;
      setData(rows.slice(start, start + filters.pageSize));
    } catch {
      message.error('Failed to load approval requests');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAction = (record, type) => {
    setActionModal({ open: true, record, type });
    setComment('');
  };

  const handleAction = async () => {
    if (actionModal.type === 'reject' && !comment.trim()) {
      return message.warning('A comment is required when rejecting');
    }
    setActing(true);
    try {
      const { record, type } = actionModal;
      if (record.module === 'REQUEST') {
        // Requests approve via their own endpoint (which converts the request on approval).
        await api.post('/requests/' + record.id + '/action', { action: type.toUpperCase(), comments: comment });
      } else {
        await api.post('/approvals/' + record.module + '/' + record.id + '/' + type, { comments: comment });
      }
      message.success('Document ' + (type === 'approve' ? 'approved' : 'rejected') + ' successfully');
      setActionModal({ open: false, record: null, type: '' });
      fetchData();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || 'Action failed');
    } finally {
      setActing(false);
    }
  };

  const columns = [
    {
      title: 'Doc Ref',
      key: 'ref',
      width: 130,
      render: (_, r) => <Text strong>{r.request_number || r.pr_number || r.po_number || `${r.module}-${r.id}`}</Text>
    },
    {
      title: 'Type',
      key: 'module',
      width: 110,
      render: (_, r) => {
        // For staff Requests, show the actual request type (Transfer / Disposal / Maintenance / …)
        // instead of the generic "Request" module label.
        if (r.module === 'REQUEST' && r.request_type) {
          const t = String(r.request_type);
          return <Tag color={REQUEST_TYPE_COLORS[t] || 'geekblue'}>{t.charAt(0) + t.slice(1).toLowerCase()}</Tag>;
        }
        const m = r.module;
        return <Tag color={MODULE_COLORS[m] || 'default'}>{m ? m.charAt(0) + m.slice(1).toLowerCase() : 'N/A'}</Tag>;
      }
    },
    {
      title: 'Requester',
      key: 'requester',
      render: (_, r) => {
        if (r.Requestor && (r.Requestor.first_name || r.Requestor.last_name)) {
          return [r.Requestor.first_name, r.Requestor.last_name].filter(Boolean).join(' ');
        }
        return r.requester_name || r.created_by_name || 'N/A';
      }
    },
    {
      title: 'Amount',
      key: 'amount',
      width: 130,
      align: 'right',
      render: (_, r) => {
        const amt = r.total_cost || r.estimated_cost || r.total_amount || r.amount || r.estimated_value || r.total_estimated_value;
        return amt ? ('Rs. ' + Number(amt).toLocaleString('en-IN')) : 'N/A';
      }
    },
    {
      title: 'Date',
      key: 'date',
      width: 110,
      render: (_, r) => {
        const d = r.createdAt || r.created_at || r.pr_date;
        return d ? dayjs(d).format('DD MMM YYYY') : 'N/A';
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s) => {
        const label = s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : 'Pending';
        return <Tag color={STATUS_COLORS[s] || 'gold'}>{label}</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, r) => {
        const isDone = r.status === 'APPROVED' || r.status === 'REJECTED' || r.status === 'CANCELLED';
        if (isDone) return null;
        return (
          <Space size={4}>
            <Button
              size="small"
              type="primary"
              icon={<Check size={13} />}
              style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)' }}
              onClick={() => openAction(r, 'approve')}
            >
              Approve
            </Button>
            <Button
              size="small"
              danger
              icon={<X size={13} />}
              onClick={() => openAction(r, 'reject')}
            >
              Reject
            </Button>
          </Space>
        );
      }
    }
  ];

  const isApprove = actionModal.type === 'approve';

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="page-header-icon"><Clock size={24}  /></div>
              <div>
                <h2 className="page-header-title">Approval Requests</h2>
                <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>Review and act on documents pending approval</p>
              </div>
            </div>
          </Col>
          <Col>
            <Button className="btn-refresh" icon={<RefreshCcw size={16} />} onClick={fetchData}>Refresh</Button>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <Row gutter={12}>
            <Col xs={24} sm={10}>
              <Input
                prefix={<Search size={14} color="var(--color-text-muted)" />}
                placeholder="Search by ID or requester..."
                allowClear
                style={{ borderRadius: 'var(--radius-md)' }}
                value={filters.search}
                onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                onPressEnter={(e) => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
              />
            </Col>
            <Col xs={24} sm={6}>
              <Select
                style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
                placeholder="Filter by type"
                allowClear
                value={filters.module}
                onChange={(v) => setFilters(f => ({ ...f, module: v || '', page: 1 }))}
              >
                {['PR', 'PO', 'DISPOSAL', 'GRN', 'MOVEMENT'].map(m => (
                  <Option key={m} value={m}>{m}</Option>
                ))}
              </Select>
            </Col>
          </Row>
        </div>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey={(r) => r.module + '-' + r.id}
          size="middle"
          scroll={{ x: 'max-content' }}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '25', '50'],
            showTotal: (t) => t + ' items',
            onChange: (page, pageSize) => setFilters(f => ({ ...f, page, pageSize }))
          }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pending approvals" /> }}
        />
      </Card>

      <Modal
        open={actionModal.open}
        title={isApprove ? 'Approve Document' : 'Reject Document'}
        onCancel={() => setActionModal({ open: false, record: null, type: '' })}
        onOk={handleAction}
        okText={isApprove ? 'Confirm Approve' : 'Confirm Reject'}
        okButtonProps={{
          danger: !isApprove,
          loading: acting,
          style: isApprove ? { background: 'var(--color-success)', borderColor: 'var(--color-success)' } : {}
        }}
        confirmLoading={acting}
      >
        {actionModal.record && (
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary">Document: </Text>
            <Text strong>{actionModal.record.request_number || actionModal.record.pr_number || actionModal.record.po_number || `${actionModal.record.module}-${actionModal.record.id}`}</Text>
          </div>
        )}
        <TextArea
          rows={3}
          placeholder={isApprove ? 'Optional comment...' : 'Rejection reason (required)...'}
          value={comment}
          onChange={e => setComment(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default ApprovalRequests;
