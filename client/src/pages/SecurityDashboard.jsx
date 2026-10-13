import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Typography, Space, Tag, Button, Table, Progress,
  Statistic, Empty, Spin, message, Badge
} from 'antd';
import {
  ShieldCheck, AlertTriangle, AlertCircle, CheckCircle2,
  Clock, MapPin, RefreshCcw, BarChart3
} from 'lucide-react';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

const ALERT_TYPE_COLOR = {
  MISSING: 'error',
  DAMAGED: 'warning',
  THEFT: 'red',
  MAINTENANCE_DUE: 'orange',
  AUDIT_FAIL: 'purple',
  OTHER: 'default',
};

const PRIORITY_COLOR = { CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'gold', LOW: 'blue' };

const SecurityDashboard = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(() => {
    setLoading(true);
    api.get('/dashboard/security')
      .then((res) => {
        const d = res?.data?.data || res?.data || {};
        setMetrics(d);
      })
      .catch(() => message.error('Failed to load security metrics'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  const totalOpen = metrics?.total_open_alerts ?? 0;
  const critical = metrics?.critical_alerts ?? 0;
  const avgResolution = metrics?.avg_resolution_time ?? 0;
  const byLocation = metrics?.alerts_by_location ?? [];
  const byType = metrics?.alerts_by_type ?? [];
  const totalByType = byType.reduce((s, r) => s + Number(r.count || 0), 0) || 1;

  const typeColumns = [
    {
      title: 'Alert Type',
      dataIndex: 'alert_type',
      render: (v) => <Tag color={ALERT_TYPE_COLOR[v] || 'default'}>{v || '—'}</Tag>,
    },
    {
      title: 'Count',
      dataIndex: 'count',
      align: 'right',
      render: (v) => <Text strong>{Number(v || 0)}</Text>,
    },
    {
      title: 'Share',
      dataIndex: 'count',
      render: (v) => (
        <Progress
          percent={Math.round((Number(v || 0) / totalByType) * 100)}
          size="small"
          strokeColor="var(--color-orange)"
          showInfo={false}
          style={{ minWidth: 80 }}
        />
      ),
    },
  ];

  const locationColumns = [
    {
      title: 'Location',
      dataIndex: 'location_name',
      render: (v) => (
        <Space size={6}>
          <MapPin size={13} color="var(--color-text-muted)" />
          <Text>{v || 'Unknown'}</Text>
        </Space>
      ),
    },
    {
      title: 'Open Alerts',
      dataIndex: 'count',
      align: 'right',
      render: (v) => (
        <Badge
          count={Number(v || 0)}
          style={{ backgroundColor: Number(v) > 5 ? 'var(--color-danger)' : Number(v) > 2 ? 'var(--color-orange)' : 'var(--color-success)' }}
        />
      ),
    },
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div className="page-header-icon"><ShieldCheck size={24}  /></div>
              <div>
                <h2 className="page-header-title">Security Dashboard</h2>
                <p className="page-header-sub">
                  Asset alert metrics and security compliance overview
                </p>
              </div>
            </Space>
          </Col>
          <Col>
            <Button
              className="btn-refresh"
              icon={<RefreshCcw size={16} />}
              onClick={fetchMetrics}
              loading={loading}
            >
              Refresh
            </Button>
          </Col>
        </Row>
      </Card>

      {loading && !metrics ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {[
              { label: 'Open Alerts',     value: totalOpen,     bg: '#FEF2F2', color: 'var(--color-danger)',  icon: <AlertCircle size={24} />,   iconBg: 'var(--gradient-orange)' },
              { label: 'Critical Alerts', value: critical,      bg: '#FFFBEB', color: 'var(--color-warning)', icon: <AlertTriangle size={24} />, iconBg: 'var(--gradient-brand)' },
              { label: 'Avg Resolution (min)', value: avgResolution, bg: '#F0FDF4', color: 'var(--color-success)', icon: <Clock size={24} />,         iconBg: 'var(--gradient-success)' }
            ].map((kpi, i) => (
              <Col xs={24} sm={8} key={i}>
                <Card style={{ ...contentCard, background: kpi.bg, border: `1px solid ${kpi.bg}` }} styles={{ body: { padding: '14px 16px' } }}>
                  <Row align="middle" justify="space-between" wrap={false}>
                    <Col flex="auto">
                      <Text style={{ fontSize: 10, fontWeight: 700, color: kpi.color, textTransform: 'uppercase', letterSpacing: '0.07em', opacity: 0.75 }}>{kpi.label}</Text>
                      <Text style={{ fontSize: 26, fontWeight: 700, color: kpi.color, letterSpacing: '-0.03em', lineHeight: 1.1, display: 'block', marginTop: 2 }}>{kpi.value}</Text>
                    </Col>
                    <Col><div className="page-header-icon" style={{ background: 'rgba(255,255,255,0.7)', color: kpi.color, borderRadius: 12 }}>{kpi.icon}</div></Col>
                  </Row>
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <BarChart3 size={15} color="var(--color-orange)" />
                    <Text strong style={{ fontSize: 14 }}>Alerts by Type</Text>
                  </Space>
                }
                style={contentCard}
                styles={{ body: { padding: '0 0 8px' } }}
              >
                {byType.length === 0 ? (
                  <Empty description="No alert data" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 32 }} />
                ) : (
                  <Table
                    dataSource={byType}
                    columns={typeColumns}
                    rowKey={(r) => r.alert_type || Math.random()}
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: 'No records found' }}
                  />
                )}
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <MapPin size={15} color="var(--color-orange)" />
                    <Text strong style={{ fontSize: 14 }}>Alerts by Location</Text>
                  </Space>
                }
                style={contentCard}
                styles={{ body: { padding: '0 0 8px' } }}
              >
                {byLocation.length === 0 ? (
                  <Empty description="No location data" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 32 }} />
                ) : (
                  <Table
                    dataSource={byLocation}
                    columns={locationColumns}
                    rowKey={(r) => r.location_name || Math.random()}
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: 'No records found' }}
                  />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button type="primary" onClick={() => navigate('/system/features')} style={primaryBtn}>
          Next
        </Button>
      </div>
    </div>
  );
};

export default SecurityDashboard;
