import React, { useState, useEffect } from 'react';
import {
  Table, Card, Button, Input, Row, Col,
  Space, message, Tag, Popconfirm, Tooltip
} from 'antd';
import { Plus, Edit2, Trash2, Building2, RefreshCcw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useSelector } from 'react-redux';

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

const ManageDepartments = () => {
  const navigate = useNavigate();
  const { token } = useSelector(state => state.auth);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/masters/departments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = res?.data;
      const rawData = Array.isArray(payload) ? payload : (payload?.data || []);
      setData(rawData.map((item, index) => ({
        ...item,
        key: item.id,
        srNo: index + 1
      })));
    } catch {
      message.error('Failed to fetch departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/masters/departments/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      message.success('Department deleted successfully');
      fetchData();
    } catch {
      message.error('Delete failed');
    }
  };

  const columns = [
    { title: 'Sr. No.', dataIndex: 'srNo', key: 'srNo', width: 80 },
    { title: 'Department Code', dataIndex: 'dept_code', key: 'dept_code', width: 160, sorter: (a, b) => (a.dept_code || '').localeCompare(b.dept_code || '') },
    { title: 'Department Name', dataIndex: 'dept_name', key: 'dept_name', sorter: (a, b) => (a.dept_name || '').localeCompare(b.dept_name || '') },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status === 'ACTIVE' ? 'Active' : 'Inactive'}</Tag>
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
              onClick={() => navigate(`/masters/departments/edit/${record.id}`)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this department?"
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

  const filteredData = data.filter(item => {
    const q = searchText.toLowerCase();
    return item.dept_name?.toLowerCase().includes(q) || item.dept_code?.toLowerCase().includes(q);
  });

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center">
              <div className="page-header-icon"><Building2 size={24} /></div>
              <div>
                <h2 className="page-header-title">Departments</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>{filteredData.length} department(s)</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={fetchData}>Refresh</Button>
              <Button type="primary" icon={<Plus size={16} />} onClick={() => navigate('/masters/departments/add')} style={primaryBtn}>Add Department</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: 16 } }}>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search by name or code..."
            allowClear
            prefix={<Search size={14} color="var(--color-text-muted)" />}
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
        <Button onClick={() => navigate('/masters')}>Back</Button>
        <Button type="primary" onClick={() => navigate('/property/locations')} style={primaryBtn}>Next</Button>
      </div>
    </div>
  );
};

export default ManageDepartments;
