import React, { useEffect, useState } from 'react';
import { Table, Button, Input, Select, Space, Card, message, Popconfirm, Empty, Typography, Row, Col, Tooltip } from 'antd';
import { PlusCircle, Search, Eye, Edit2, Trash2, ShieldCheck, ArrowLeft, ArrowRight } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchRoles } from '../store/roleSlice';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const { Title, Text } = Typography;
const { Option } = Select;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard    = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });
const TH             = { background: 'var(--gradient-navy)' };

const ManageRoles = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items: roles, loading } = useSelector(state => state.roles);
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    dispatch(fetchRoles());
  }, [dispatch]);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/roles/${id}`);
      message.success('Role deleted successfully');
      dispatch(fetchRoles());
    } catch (err) {
      message.error(err?.response?.data?.message || 'Delete failed');
    }
  };

  const columns = [
    {
      title: 'Sr. No.',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
      onHeaderCell: () => ({ style: TH })
    },
    {
      title: 'Role',
      dataIndex: 'role_name',
      key: 'role_name',
      onHeaderCell: () => ({ style: TH })
    },
    {
      title: 'Description',
      dataIndex: 'role_description',
      key: 'role_description',
      ellipsis: true,
      onHeaderCell: () => ({ style: TH })
    },
    {
      title: 'Users',
      dataIndex: 'user_count',
      key: 'user_count',
      width: 80,
      align: 'center',
      render: (count) => <Text strong>{count || 0}</Text>,
      onHeaderCell: () => ({ style: TH })
    },
    {
      title: 'Actions',
      key: 'action',
      width: 120,
      fixed: 'right',
      align: 'center',
      onHeaderCell: () => ({ style: TH }),
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="View">
            <Button
              type="text"
              size="small"
              icon={<Eye size={14} color="var(--color-navy)" />}
              onClick={() => navigate(`/add-role?id=${record.id}&view=true`)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<Edit2 size={14} color="var(--color-navy)" />}
              onClick={() => navigate(`/add-role?id=${record.id}`)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this role?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Yes, Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" icon={<Trash2 size={14} color="var(--color-danger)" />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const currentRole = String(currentUser?.role || '').toUpperCase();
  const isProviderAdmin = currentRole === 'PROVIDER_ADMIN' || currentRole === 'DEV_ADMIN';

  // Provider-only roles should never be visible to client users
  const PROVIDER_ONLY_CODES = ['PROVIDER_ADMIN', 'DEV_ADMIN'];

  const filteredRoles = (roles || []).filter((record) => {
    // Hide provider-only roles from non-provider admins
    const roleCode = String(record.code || record.role_code || '').toUpperCase();
    if (!isProviderAdmin && PROVIDER_ONLY_CODES.includes(roleCode)) return false;
    if (!searchText.trim()) return true;
    const searchSpace = [
      record.role_name,
      record.role_description,
      String(record.user_count || 0)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return searchSpace.includes(searchText.trim().toLowerCase());
  });

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <div className="page-header-icon"><ShieldCheck size={24}  /></div>
              <div>
                <h2 className="page-header-title">Manage Roles</h2>
                <p className="page-header-sub">
                  Role definitions & permissions · {filteredRoles.length} records
                </p>
              </div>
            </Space>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusCircle size={14} />}
              onClick={() => navigate('/add-role')}
              style={primaryBtn}
            >
              Add Role
            </Button>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: '16px 16px 0' } }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Input
              placeholder="Search roles by name or description…"
              prefix={<Search size={14} color="var(--color-text-muted)" />}
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setCurrentPage(1);
              }}
              allowClear
              style={{ width: 300, borderRadius: 'var(--radius-md)' }}
            />
          </Col>
          <Col>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>Show</Text>
              <Select
                value={String(pageSize)}
                style={{ width: 84 }}
                onChange={(value) => {
                  setPageSize(Number(value));
                  setCurrentPage(1);
                }}
              >
                <Option value="10">10</Option>
                <Option value="25">25</Option>
                <Option value="50">50</Option>
              </Select>
              <Text type="secondary" style={{ fontSize: 12 }}>entries</Text>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={filteredRoles}
          loading={loading}
          rowKey="id"
          size="middle"
          pagination={{
            current: currentPage,
            pageSize,
            total: filteredRoles.length,
            showSizeChanger: false,
            showTotal: (total) => `${total} roles`,
            onChange: (page) => setCurrentPage(page),
          }}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">No roles found</Text>} />
          }}
        />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button type="primary" icon={<ArrowRight size={16} />} iconPosition="end" onClick={() => navigate('/system/settings')} style={{ backgroundColor: 'var(--color-navy)' }}>
          Next
        </Button>
      </div>
    </div>
  );
};

export default ManageRoles;
