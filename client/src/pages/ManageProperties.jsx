import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, Space, Row, Col, Popconfirm, message, Tooltip } from 'antd';
import { Plus, Edit2, Trash2, Building, RefreshCcw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const ManageProperties = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [propertiesRes, typesRes] = await Promise.all([
        api.get('/masters/properties'),
        api.get('/masters/property-types')
      ]);
      const propData = normalizeResponse(propertiesRes);
      const types = normalizeResponse(typesRes);
      const typeMap = {};
      types.forEach((t) => { typeMap[t.id] = t.type_name || t.name || 'N/A'; });
      setData(propData.map((item, i) => ({
        ...item,
        srNo: i + 1,
        propertyTypeName: item?.PropertyType?.type_name || typeMap[item.property_type_id] || 'N/A'
      })));
    } catch {
      message.error('Failed to fetch properties');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/masters/properties/${id}`);
      message.success('Property deleted');
      fetchData();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Delete failed');
    }
  };

  const filtered = data.filter((item) => {
    const q = searchText.toLowerCase();
    return String(item.property_name || '').toLowerCase().includes(q) ||
      String(item.propertyTypeName || '').toLowerCase().includes(q);
  });

  const columns = [
    { title: '#', dataIndex: 'srNo', width: 60 },
    { title: 'Property Name', dataIndex: 'property_name', render: (t) => <span style={{ fontWeight: 'var(--weight-semibold)' }}>{t}</span> },
    { title: 'Property Type', dataIndex: 'propertyTypeName' },
    { title: 'State', dataIndex: 'state_code', width: 90, render: (t) => t || '—' },
    {
      title: 'Actions',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<Edit2 size={15} color="var(--color-navy)" />} onClick={() => navigate(`/property/manage/edit/${record.id}`)} />
          </Tooltip>
          <Popconfirm
            title="Delete this property?"
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
              <div className="page-header-icon"><Building size={24}  /></div>
              <div>
                <h2 className="page-header-title">Properties</h2>
                
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>{filtered.length} propert(ies)</p>
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
              <Button type="primary" icon={<Plus size={16} />} onClick={() => navigate('/property/manage/add')} style={primaryBtn}>
                Add Property
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: 16 } }}>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search properties..."
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
        <Button onClick={() => navigate('/property/locations')}>
          Back
        </Button>
        <Button type="primary" onClick={() => navigate('/masters/categories')} style={primaryBtn}>
          Next
        </Button>
      </div>
    </div>
  );
};

export default ManageProperties;
