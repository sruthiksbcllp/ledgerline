import React, { useEffect, useState } from 'react';
import { Button, Card, Input, Popconfirm, Space, Table, message, Row, Col, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Users, RefreshCcw, Search } from 'lucide-react';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const ManageServiceProviders = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/masters/service-providers');
      setRows(normalizeResponse(res?.data));
    } catch {
      message.error('Failed to load service providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onDelete = async (id) => {
    try {
      await api.delete(`/masters/service-providers/${id}`);
      message.success('Provider deleted');
      load();
    } catch {
      message.error('Delete failed');
    }
  };

  const filtered = rows.filter((r) => (`${r.name || ''} ${r.contact_person || ''} ${r.email || ''}`).toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center">
              <div className="page-header-icon"><Users size={24}  /></div>
              <div>
                <h2 className="page-header-title">Service Providers</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>{filtered.length} provider(s)</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<RefreshCcw size={16} />}
                loading={loading}
                onClick={load}
              >
                Refresh
              </Button>
              <Button type="primary" icon={<Plus size={16} />} onClick={() => navigate('/maintenance/service-providers/add')} style={primaryBtn}>
                New Provider
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: 16 } }}>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search providers..."
            allowClear
            prefix={<Search size={14} color="var(--color-text-muted)" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320, borderRadius: 'var(--radius-md)' }}
          />
        </div>

        <Table
          rowKey="id"
          loading={loading}
          locale={{ emptyText: 'No records found' }}
          dataSource={filtered}
          size="middle"
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], pageSize: 10, showTotal: (total) => `Total: ${total} records` }}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name' },
            { title: 'Contact', dataIndex: 'contact_person', key: 'contact_person' },
            { title: 'Phone', dataIndex: 'phone', key: 'phone' },
            { title: 'Email', dataIndex: 'email', key: 'email' },
            {
              title: 'Actions',
              key: 'actions',
              width: 120,
              render: (_, record) => (
                <Space size={4}>
                  <Tooltip title="Edit">
                    <Button type="text" size="small" icon={<Edit2 size={15} color="var(--color-navy)" />} onClick={() => navigate(`/maintenance/service-providers/edit/${record.id}`)} />
                  </Tooltip>
                  <Popconfirm
                    title="Delete this provider?"
                    description="This action cannot be undone."
                    onConfirm={() => onDelete(record.id)}
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
          ]}
        />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
        <Button onClick={() => navigate('/maintenance/types')}>
          Back
        </Button>
        <Button type="primary" onClick={() => navigate('/maintenance/service-providers')} style={primaryBtn}>
          Next
        </Button>
      </div>
    </div>
  );
};

export default ManageServiceProviders;
