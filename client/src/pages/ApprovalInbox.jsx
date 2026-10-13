import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Tabs, Space, Typography,
  Tag, Modal, Input, message, Empty
} from 'antd';
import { CheckCircle, XCircle, History, Clock, MessageSquare } from 'lucide-react';
import { Row, Col } from 'antd';
import api from '../utils/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const ApprovalInbox = () => {
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState({ PR: [], PO: [] });
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('1');
  
  const [actionModal, setActionModal] = useState({ visible: false, record: null, type: '' });
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (activeTab === '1') fetchPending();
    if (activeTab === '2') fetchHistory();
  }, [activeTab]);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await api.get('/approvals/pending');
      // The endpoint returns { success, data: { PR, PO, total } }. axios puts the
      // body on res.data, so the actual { PR, PO } object lives at res.data.data.
      // The previous code stored the wrapper, so pending.PR / pending.PO were
      // undefined and the table was always empty.
      const body = res?.data?.data ?? res?.data ?? {};
      setPending({ PR: body.PR || [], PO: body.PO || [] });
    } catch { /* silenced */ } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.get('/approvals/history/my');
      // Endpoint returns { success, data: [...] } — unwrap to the array.
      const list = Array.isArray(res?.data?.data)
        ? res.data.data
        : (Array.isArray(res?.data) ? res.data : []);
      setHistory(list);
    } catch { /* silenced */ } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (actionModal.type === 'REJECT' && !comments) {
      return message.error('Comments are required for rejection');
    }

    try {
      const endpoint = `/approvals/${actionModal.record.module}/${actionModal.record.id}/${actionModal.type.toLowerCase()}`;
      await api.post(endpoint, { comments });
      message.success(`Document ${actionModal.type === 'APPROVE' ? 'Approved' : 'Rejected'}`);
      setActionModal({ visible: false, record: null, type: '' });
      setComments('');
      fetchPending();
    } catch {
      message.error('Action failed');
    }
  };

  const columns = [
    { title: 'Doc #', dataIndex: 'id', key: 'id', render: (id, record) => <Text strong>{record.module || 'DOC'}-{id}</Text> },
    { title: 'Type', dataIndex: 'module', key: 'module', render: m => <Tag color="blue">{(m) ? (m).charAt(0)+(m).slice(1).toLowerCase() : '—'}</Tag> },
    { title: 'Requested By', key: 'requestor', render: (_, r) => r.Requestor ? `${r.Requestor.first_name} ${r.Requestor.last_name}` : 'N/A' },
    { title: 'Date', dataIndex: 'createdAt', key: 'date', render: d => new Date(d).toLocaleDateString() },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button 
            type="primary" 
            size="small" 
            icon={<CheckCircle size={14} />}
            onClick={() => setActionModal({ visible: true, record, type: 'APPROVE' })}
            style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)' }}
          >
            Approve
          </Button>
          <Button 
            size="small" 
            icon={<XCircle size={14} />}
            onClick={() => setActionModal({ visible: true, record, type: 'REJECT' })}
          >
            Reject
          </Button>
        </Space>
      )
    }
  ];

  // Flatten PR and PO for the table
  const dataSource = [
    ...(pending.PR || []).map(p => ({ ...p, module: 'PR' })),
    ...(pending.PO || []).map(p => ({ ...p, module: 'PO' }))
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div className="page-header-icon"><MessageSquare size={24}  /></div>
              <div>
                <h2 className="page-header-title">Approval Inbox</h2>
                <p className="page-header-sub">Review and approve pending requisitions, orders, and system changes</p>
              </div>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: '1',
            label: <Space><Clock size={14} />Pending</Space>,
            children: (
              <Table
                dataSource={dataSource}
                columns={[
                  ...columns,
                  {
                    title: 'Line Approval',
                    key: 'line_approval',
                    render: (_, r) => {
                      if (!r.line_approval || r.line_approval.mode !== 'LINE') return <Tag>COLLECTIVE</Tag>;
                      return <Tag color="orange">{r.line_approval.approved_lines}/{r.line_approval.total_lines}</Tag>;
                    }
                  }
                ]}
                loading={loading}
                rowKey={(r) => `${r.module}-${r.id}`}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: "var(--color-text-muted)" }}>No pending approvals</span>} /> }}
                pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 10, showTotal: (total) => `Total ${total} pending` }}
                size="middle"
                scroll={{ x: 'max-content' }}
              />
            )
          },
          {
            key: '2',
            label: <Space><History size={14} />My History</Space>,
            children: (
              <Table
                dataSource={history}
                columns={[
                  { title: 'Date', dataIndex: 'timestamp', key: 'date', render: d => new Date(d).toLocaleString() },
                  { title: 'Module', dataIndex: 'module', key: 'module' },
                  { title: 'Action', dataIndex: 'action', key: 'action', render: a => <Tag color={a === 'APPROVED' ? 'green' : 'red'}>{(a) ? (a).charAt(0)+(a).slice(1).toLowerCase() : '—'}</Tag> },
                  { title: 'Comments', dataIndex: 'comments', key: 'comments' }
                ]}
                loading={loading}
                rowKey="id"
                pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 10, showTotal: (total) => `Total ${total} history` }}
                size="middle"
                scroll={{ x: 'max-content' }}
              />
            )
          }
        ]} />
      </Card>

      <Modal
        title={`${actionModal.type === 'APPROVE' ? 'Approve' : 'Reject'} Document`}
        open={actionModal.visible}
        onOk={handleAction}
        onCancel={() => setActionModal({ visible: false, record: null, type: '' })}
        okText="Confirm"
        okButtonProps={{ danger: actionModal.type === 'REJECT' }}
      >
        <div style={{ marginBottom: 16 }}>
            <Text type="secondary">Are you sure you want to {actionModal.type.toLowerCase()} this document?</Text>
        </div>
        <TextArea 
          placeholder="Add comments/remarks..." 
          rows={4} 
          value={comments}
          onChange={e => setComments(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default ApprovalInbox;
