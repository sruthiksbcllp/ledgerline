import React, { useCallback, useEffect, useState } from 'react';
import { Table, Card, Input, Select, Space, Tag, Typography, Row, Col, Button, Empty, Result } from 'antd';
import { ScrollText, RefreshCcw, Search } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../utils/api';
import { usePermissions } from '../hooks/usePermissions';

const { Text } = Typography;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };

const AdminAuditLog = () => {
  const { isSuperAdmin } = usePermissions();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [moduleName, setModuleName] = useState();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/system/activity-logs', {
        params: { limit: 200, offset: 0, ...(moduleName ? { module: moduleName } : {}) }
      });
      const body = res?.data?.data || res?.data || {};
      const list = Array.isArray(body.rows) ? body.rows : (Array.isArray(body) ? body : []);
      setRows(list);
      setTotal(Number(body.count || list.length));
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [moduleName]);

  useEffect(() => { load(); }, [load]);

  if (!isSuperAdmin()) {
    return <Result status="403" title="Access denied" subTitle="Audit logs are available to administrators." />;
  }

  const filtered = rows.filter((row) => {
    if (!search.trim()) return true;
    const user = row.User || {};
    const haystack = [row.action, row.module, row.description, user.username, user.first_name, user.last_name]
      .filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  const columns = [
    {
      title: 'When', dataIndex: 'created_at', width: 160,
      render: (value, row) => {
        const stamp = value || row.createdAt;
        return <Text style={{ fontSize: 12 }}>{stamp ? dayjs(stamp).format('DD MMM YYYY HH:mm') : '--'}</Text>;
      }
    },
    {
      title: 'Administrator', key: 'actor', width: 180,
      render: (_, row) => {
        const user = row.User || {};
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        return <Text style={{ fontSize: 12 }}>{name || user.username || 'System'}</Text>;
      }
    },
    { title: 'Action', dataIndex: 'action', width: 180, render: (value) => <Tag>{value}</Tag> },
    { title: 'Module', dataIndex: 'module', width: 110 },
    {
      title: 'Details', dataIndex: 'details', ellipsis: true,
      render: (value, row) => {
        if (!value) return row.description || '--';
        try {
          const parsed = JSON.parse(value);
          return parsed.description || value;
        } catch {
          return value;
        }
      }
    },
    { title: 'Role', dataIndex: 'actor_role', width: 140, render: (value) => value || '--' }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: 20 } }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <div className="page-header-icon"><ScrollText size={24} /></div>
              <div>
                <h2 className="page-header-title">Audit Logs</h2>
                <p className="page-header-sub">User activity, account changes, role updates, and configuration changes · {total} records</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Button icon={<RefreshCcw size={14} />} onClick={load} loading={loading}>Refresh</Button>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: '16px 16px 0' } }}>
        <Row gutter={12} style={{ marginBottom: 14 }}>
          <Col>
            <Input
              prefix={<Search size={14} />}
              placeholder="Search action, user, or detail"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              allowClear
              style={{ width: 280 }}
            />
          </Col>
          <Col>
            <Select
              allowClear
              placeholder="All modules"
              value={moduleName}
              onChange={(value) => { setModuleName(value); setPage(1); }}
              style={{ width: 180 }}
              options={['USER', 'ROLE', 'SYSTEM', 'AUTH'].map((value) => ({ value, label: value }))}
            />
          </Col>
        </Row>
        <Table
          rowKey={(row) => row.id}
          columns={columns}
          dataSource={filtered}
          loading={loading}
          size="middle"
          pagination={{
            current: page,
            pageSize,
            total: filtered.length,
            showSizeChanger: true,
            onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); }
          }}
          locale={{ emptyText: <Empty description="No audit events yet" /> }}
        />
      </Card>
    </div>
  );
};

export default AdminAuditLog;
