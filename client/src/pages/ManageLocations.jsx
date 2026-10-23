import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, Space, Row, Col, Popconfirm, message, Tooltip } from 'antd';
import { Plus, Edit2, Trash2, MapPin, RefreshCcw, ArrowLeft, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const ManageLocations = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/masters/locations');
      setData(normalizeResponse(res).map((item, i) => ({ ...item, srNo: i + 1 })));
    } catch {
      message.error('Failed to fetch locations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/masters/locations/${id}`);
      message.success('Location deleted');
      fetchData();
    } catch {
      message.error('Delete failed');
    }
  };

  const filtered = data.filter((item) => {
    const q = searchText.toLowerCase();
    return String(item.location_code || '').toLowerCase().includes(q) ||
      String(item.location_name || '').toLowerCase().includes(q) ||
      String(item.city || '').toLowerCase().includes(q) ||
      String(item.state || '').toLowerCase().includes(q);
  });

  const columns = [
    { title: '#', dataIndex: 'srNo', width: 60 },
    { title: 'Location Code', dataIndex: 'location_code', width: 140, sorter: (a, b) => (a.location_code || '').localeCompare(b.location_code || '') },
    { title: 'Location Name', dataIndex: 'location_name', sorter: (a, b) => (a.location_name || '').localeCompare(b.location_name || ''), render: (t) => <span style={{ fontWeight: 'var(--weight-semibold)' }}>{t}</span> },
    { title: 'State', dataIndex: 'state' },
    { title: 'City', dataIndex: 'city' },
    {
      title: 'Actions',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<Edit2 size={15} color="var(--color-navy)" />} onClick={() => navigate(`/masters/locations/edit/${record.id}`)} />
          </Tooltip>
          <Popconfirm
            title="Delete this location?"
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
              <div className="page-header-icon"><MapPin size={24} /></div>
              <div>
                <h2 className="page-header-title">Locations</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>{filtered.length} location(s)</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={fetchData}>Refresh</Button>
              <Button type="primary" icon={<Plus size={16} />} onClick={() => navigate('/property/locations/add')} style={primaryBtn}>Add Location</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: 16 } }}>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search locations..."
            allowClear
            prefix={<Search size={14} color="var(--color-text-muted)" />}
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
        <Button type="primary" onClick={() => navigate('/property/manage')} style={primaryBtn}>Next</Button>
      </div>
    </div>
  );
};

export default ManageLocations;
