import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Typography, message, Empty, Row, Col, Tooltip } from 'antd';
import { CheckCircle, XCircle, Eye, ArrowLeft, RefreshCcw, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const VendorChangeApprovals = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [detailModal, setDetailModal] = useState({ visible: false, record: null });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await api.get('/masters/vendors/change-requests?status=PENDING');
      setRequests(res.data?.data || []);
    } catch (err) {
      message.error('Failed to load pending change requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAction = async (requestId, action) => {
    setActionLoading(true);
    try {
      await api.put(`/masters/vendors/change-requests/${requestId}/decision`, { action });
      message.success(`Vendor change request ${action === 'APPROVE' ? 'approved' : 'rejected'}`);
      setDetailModal({ visible: false, record: null });
      fetchRequests();
    } catch (err) {
      message.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      title: 'Vendor',
      dataIndex: ['Vendor', 'vendor_name'],
      key: 'vendor_name',
      render: (text, record) => (
        <Space>
          <Building2 size={16} color="var(--color-navy)" />
          <Text strong>{text || record.vendor_name || 'N/A'}</Text>
        </Space>
      )
    },
    {
      title: 'Requested Date',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => dayjs(date).format('DD MMM YYYY, hh:mm A')
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag color="gold">{status}</Tag>
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button icon={<Eye size={14} />} onClick={() => setDetailModal({ visible: true, record })}>View Changes</Button>
          <Tooltip title="Quick Approve">
            <Button type="primary" icon={<CheckCircle size={14} />} style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)' }} onClick={() => handleAction(record.id, 'APPROVE')} />
          </Tooltip>
        </Space>
      )
    }
  ];

  const renderDiff = (beforeRaw, afterRaw) => {
    let before = beforeRaw;
    let after = afterRaw;

    try {
      if (typeof before === 'string') before = JSON.parse(before);
      if (typeof after === 'string') after = JSON.parse(after);
    } catch (e) {
      console.error('Failed to parse JSON for diff', e);
    }

    const allKeys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
      .filter(key => !['id', 'createdAt', 'updatedAt', 'client_id', 'status', 'created_at', 'updated_at'].includes(key));

    return (
      <Table
        dataSource={allKeys.map(key => ({
          key,
          field: key.replace(/_/g, ' ').toUpperCase(),
          oldValue: before?.[key],
          newValue: after?.[key],
          changed: String(before?.[key] || '') !== String(after?.[key] || '')
        }))}
        pagination={false}
        size="small"
        columns={[
          { title: 'Field', dataIndex: 'field', key: 'field', width: '30%' },
          { 
            title: 'Current Value', 
            dataIndex: 'oldValue', 
            key: 'oldValue',
            render: (v) => <Text type="secondary" style={{ wordBreak: 'break-all' }}>{String(v === null || v === undefined ? '—' : v)}</Text>
          },
          { 
            title: 'New Value', 
            dataIndex: 'newValue', 
            key: 'newValue',
            render: (v, r) => <Text strong style={{ color: r.changed ? 'var(--color-success)' : 'inherit', wordBreak: 'break-all' }}>{String(v === null || v === undefined ? '—' : v)}</Text>
          }
        ]}
        rowClassName={(r) => r.changed ? 'diff-row-changed' : ''}
      />
    );
  };

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle">
          <Space>
            <Button icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)} />
            <div>
              <h2 className="page-header-title">Vendor Change Approvals</h2>
              <Text type="secondary">Review sensitive data changes for vendors</Text>
            </div>
          </Space>
          <Button icon={<RefreshCcw size={16} />} onClick={fetchRequests} loading={loading}>Refresh</Button>
        </Row>
      </Card>

      <Card style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }} styles={{ body: { padding: 0 } }}>
        <Table
          loading={loading}
          dataSource={requests}
          columns={columns}
          rowKey="id"
          locale={{ emptyText: <Empty description="No pending vendor change requests" /> }}
        />
      </Card>

      <Modal
        title="Review Vendor Changes"
        open={detailModal.visible}
        onCancel={() => setDetailModal({ visible: false, record: null })}
        width={800}
        footer={[
          <Button key="cancel" onClick={() => setDetailModal({ visible: false, record: null })}>Close</Button>,
          <Button key="reject" danger icon={<XCircle size={14} />} onClick={() => handleAction(detailModal.record.id, 'REJECT')} loading={actionLoading}>Reject Changes</Button>,
          <Button key="approve" type="primary" icon={<CheckCircle size={14} />} style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)' }} onClick={() => handleAction(detailModal.record.id, 'APPROVE')} loading={actionLoading}>Approve & Apply</Button>
        ]}
      >
        {detailModal.record && (
          <div style={{ padding: '10px 0' }}>
            <div style={{ marginBottom: 20 }}>
              <Text type="secondary">Vendor: </Text>
              <Text strong style={{ fontSize: 16 }}>{detailModal.record.Vendor?.vendor_name}</Text>
              <br />
              <Text type="secondary">Requested On: </Text>
              <Text>{dayjs(detailModal.record.created_at).format('DD MMM YYYY, hh:mm A')}</Text>
            </div>
            
            <Title level={5}>Field Comparisons</Title>
            {renderDiff(detailModal.record.before_json, detailModal.record.after_json)}
          </div>
        )}
      </Modal>

      <style dangerouslySetInnerHTML={{ __html: `
        .diff-row-changed { background-color: #f6ffed; }
      `}} />
    </div>
  );
};

export default VendorChangeApprovals;
