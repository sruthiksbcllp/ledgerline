import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Input, Row, Col,
  Space, message, Tag, Popconfirm, Tooltip
} from 'antd';
import { Plus, Edit2, Trash2, Type, RefreshCcw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const ManagePropertyTypes = () => {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/masters/property-types');
      const body = res?.data;
      const rawData = body?.data ?? body ?? [];
      setData(rawData.map((item, index) => ({
        ...item,
        key: item.id,
        srNo: index + 1
      })));
    } catch {
      message.error('Failed to fetch property types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/masters/property-types/${id}`);
      message.success('Property type deleted successfully');
      fetchData();
    } catch (err) {
      message.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const columns = [
    { title: 'Sr. No.', dataIndex: 'srNo', key: 'srNo', width: 80 },
    { title: 'Property Type', dataIndex: 'type_name', key: 'type_name' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'Active' ? 'green' : 'red'}>{(status) ? (status).charAt(0) + (status).slice(1).toLowerCase() : '—'}</Tag>
      )
    },
    {
      title: 'Action',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<Edit2 size={14} color="var(--color-navy)" />}
              onClick={() => navigate(`/masters/property-types/edit/${record.id}`)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this property type?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Yes, Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button
                type="text"
                size="small"
                icon={<Trash2 size={14} color="var(--color-danger)" />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const filteredData = data.filter(item =>
    item.type_name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center">
              <div className="page-header-icon"><Type size={24}  /></div>
              <div>
                <h2 className="page-header-title">Property Types</h2>
                
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>{filteredData.length} type(s)</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<RefreshCcw size={16} />}
                loading={loading}
                onClick={fetchData}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<Plus size={16} />}
                onClick={() => navigate('/masters/property-types/add')}
                style={primaryBtn}
              >
                Add Type
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: 16 } }}>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search property types..."
            prefix={<Search size={14} color="var(--color-text-muted)" />}
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: 320, borderRadius: 'var(--radius-md)' }}
          />
        </div>

        <Table
          columns={columns}
          dataSource={filteredData}
          loading={loading}
          rowKey="id"
          size="middle"
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 10, showTotal: (total) => `Total: ${total} records` }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'No records found' }}
        />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
        <Button onClick={() => navigate('/masters')}>
          Back
        </Button>
      </div>
    </div>
  );
};

export default ManagePropertyTypes;
