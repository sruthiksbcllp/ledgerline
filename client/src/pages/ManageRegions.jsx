import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, Space, Row, Col, Popconfirm, message, Tag, Tooltip } from 'antd';
import { Plus, Edit2, Trash2, Globe, RefreshCcw, ArrowLeft, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

const ManageRegions = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/masters/regions');
      const rows = normalizeResponse(res).map((item, i) => ({ ...item, key: item.id, srNo: i + 1 }));
      setData(rows);
    } catch {
      message.error('Failed to fetch regions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/masters/regions/${id}`);
      message.success('Region deleted');
      fetchData();
    } catch {
      message.error('Delete failed');
    }
  };

  const filtered = data.filter((item) => {
    const q = searchText.toLowerCase();
    return String(item.region_code || '').toLowerCase().includes(q) || String(item.region_name || '').toLowerCase().includes(q);
  });

  const columns = [
    { title: '#', dataIndex: 'srNo', key: 'srNo', width: 60 },
    { title: 'Region Code', dataIndex: 'region_code', key: 'region_code', width: 140, sorter: (a, b) => (a.region_code || '').localeCompare(b.region_code || '') },
    { title: 'Region Name', dataIndex: 'region_name', key: 'region_name', sorter: (a, b) => (a.region_name || '').localeCompare(b.region_name || ''), render: (text) => <span style={{ fontWeight: 'var(--weight-semibold)' }}>{text}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (status) => <Tag color={status === 'ACTIVE' ? 'success' : 'default'}>{status || 'INACTIVE'}</Tag> },
    {
      title: 'Actions',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<Edit2 size={15} color="var(--color-navy)" />} onClick={() => navigate(`/masters/regions/edit/${record.id}`)} />
          </Tooltip>
          <Popconfirm
            title="Delete this region?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Yes, Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" icon={<Trash2 size={15} color="var(--color-danger)" />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center">
              <div className="page-header-icon"><Globe size={24} /></div>
              <div>
                <h2 className="page-header-title">Regions</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>{filtered.length} region(s)</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={fetchData}>Refresh</Button>
              <Button type="primary" icon={<Plus size={16} />} onClick={() => navigate('/masters/regions/add')} style={primaryBtn}>Add Region</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: 16 } }}>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search regions..."
            prefix={<Search size={14} color="var(--color-text-muted)" />}
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: 320, borderRadius: 'var(--radius-md)' }}
          />
        </div>

        <Table
          columns={columns}
          dataSource={filtered}
          loading={loading}
          rowKey="id"
          size="middle"
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 10, showTotal: (total) => `Total: ${total} records` }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'No records found' }}
        />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
        <Button onClick={() => navigate('/masters')}>Back</Button>
      </div>
    </div>
  );
};

export default ManageRegions;
