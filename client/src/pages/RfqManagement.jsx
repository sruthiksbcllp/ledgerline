import React, { useEffect, useState } from 'react';
import { Button, Card, Table, Tag, Space, message, Empty } from 'antd';
import { Plus, RefreshCcw, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';

const STATUS_COLOR = { DRAFT: 'default', SENT: 'blue', PARTIALLY_RESPONDED: 'gold', CLOSED: 'green', CANCELLED: 'red' };

export default function RfqManagement() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/rfqs');
      setRows(res?.data?.data || res?.data || []);
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to load RFQs'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const columns = [
    { title: 'RFQ #', dataIndex: 'rfq_number', key: 'rfq_number' },
    { title: 'PR Number', dataIndex: 'pr_number', key: 'pr_number', render: (v) => v || <Tag color="default">Direct</Tag> },
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Vendors', key: 'vendors', render: (_, r) => (r.vendors ? r.vendors.length : 0) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => <Tag color={STATUS_COLOR[s] || 'default'}>{s}</Tag> },
    { title: 'Action', key: 'action', render: (_, r) => (
      <Button size="small" icon={<Eye size={14} />} onClick={() => navigate(`/procurement/rfq/${r.id}`)}>View</Button>
    ) }
  ];

  return (
    <div style={{ padding: 'var(--space-4, 16px)' }}>
      <PageHeader title="Request for Quotation (RFQ)" subtitle="Multi-vendor sourcing" />
      <Card styles={{ body: { padding: 16 } }} style={{ borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-medium)' }}>
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<Plus size={16} />} style={{ background: 'var(--gradient-orange)', border: 'none' }} onClick={() => navigate('/procurement/rfq/create')}>Create RFQ</Button>
          <Button icon={<RefreshCcw size={16} />} onClick={load}>Refresh</Button>
        </Space>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={rows}
          locale={{ emptyText: <Empty description="No RFQs yet" /> }}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], showTotal: (t) => `${t} RFQs` }} />
      </Card>
    </div>
  );
}
