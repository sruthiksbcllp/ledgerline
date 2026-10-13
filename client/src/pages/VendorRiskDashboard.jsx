import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Table, Tag, Space, Typography, Progress, Spin } from 'antd';
import { AlertTriangle, ShieldCheck, FileWarning, Clock, TrendingUp, CheckCircle, Info } from 'lucide-react';
import api from '../utils/api';
import { safeApiCall } from '../utils/safeApiCall';

const { Text, Paragraph } = Typography;

const SEVERITY_CONFIG = {
  CRITICAL: { color: 'var(--color-danger)', bg: '#fff1f0', border: '#ffa39e', icon: AlertTriangle },
  HIGH:     { color: '#d46b08', bg: '#fff7e6', border: '#ffd591', icon: FileWarning },
  MEDIUM:   { color: '#d4a017', bg: '#fffbe6', border: '#ffe58f', icon: Clock },
  LOW:      { color: 'var(--color-success)', bg: '#f6ffed', border: '#b7eb8f', icon: CheckCircle },
};

const SuggestionCard = ({ item }) => {
  const cfg = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.LOW;
  const Icon = cfg.icon;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 16px', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 'var(--radius-md)', marginBottom: 10 }}>
      <div style={{ flexShrink: 0, paddingTop: 2 }}><Icon size={18} color={cfg.color} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: cfg.color, fontSize: 13, marginBottom: 2 }}>{item.title}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{item.description}</div>
      </div>
      {item.action && (
        <div style={{ flexShrink: 0, alignSelf: 'center' }}>
          <Tag color={item.severity === 'CRITICAL' ? 'red' : item.severity === 'HIGH' ? 'orange' : 'blue'} style={{ cursor: 'default', fontSize: 11 }}>{item.action}</Tag>
        </div>
      )}
    </div>
  );
};

const HealthGauge = ({ score }) => {
  const color = score >= 85 ? 'var(--color-success)' : score >= 65 ? '#d4a017' : 'var(--color-danger)';
  const label = score >= 85 ? 'Healthy' : score >= 65 ? 'Moderate' : 'At Risk';
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <Progress type="circle" percent={score} size={100} strokeColor={color} trailColor="var(--color-bg-page)"
        format={() => <span style={{ fontSize: 20, fontWeight: 700, color }}>{score}</span>} />
      <div style={{ marginTop: 8, fontWeight: 600, color, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Compliance Score</div>
    </div>
  );
};

const VendorRiskDashboard = () => {
  const [data, setData]       = useState({ high: [], medium: [], low: [] });
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [dashRes, insightRes] = await Promise.all([
        safeApiCall(() => api.get('/masters/vendors/compliance-dashboard')),
        safeApiCall(() => api.get('/masters/vendors/risk-insights')),
      ]);
      setData(dashRes && typeof dashRes === 'object' && !Array.isArray(dashRes) ? dashRes : { high: [], medium: [], low: [] });
      setInsights(insightRes && typeof insightRes === 'object' && !Array.isArray(insightRes) ? insightRes : null);
      setLoading(false);
    })();
  }, []);

  const cols = [
    { title: 'Vendor', dataIndex: 'vendor_name', ellipsis: true },
    { title: 'Score', dataIndex: 'compliance_score', width: 80,
      render: s => { const n = Number(s ?? 100); const c = n < 50 ? 'var(--color-danger)' : n <= 80 ? '#d4a017' : 'var(--color-success)'; return <span style={{ fontWeight: 700, color: c }}>{n}</span>; }
    },
    { title: 'Status', dataIndex: 'gstin_status', width: 130,
      render: s => s ? <Tag color={s === 'ACTIVE' ? 'green' : s === 'INVALID_FORMAT' ? 'red' : 'orange'}>{s}</Tag> : '-'
    },
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <Card style={{ borderRadius: 16, border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={12}>
              <div className="page-header-icon"><ShieldCheck size={24} /></div>
              <Space direction="vertical" size={2}>
                <h2 className="page-header-title">Vendor Risk Dashboard</h2>
                <Text type="secondary">Monitor vendor compliance scores, risk ratings, and actionable insights</Text>
              </Space>
            </Space>
            {insights && (
              <Space size={20}>
                {[{ label: 'Total', value: insights.summary?.total ?? 0, color: 'var(--color-navy)' }, { label: 'High Risk', value: insights.summary?.high ?? 0, color: 'var(--color-danger)' }, { label: 'Medium Risk', value: insights.summary?.medium ?? 0, color: '#d4a017' }, { label: 'Low Risk', value: insights.summary?.low ?? 0, color: 'var(--color-success)' }].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</div>
                  </div>
                ))}
              </Space>
            )}
          </div>
        </Card>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : (
          <>
            {insights && (
              <Row gutter={16}>
                <Col span={4}>
                  <Card style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', height: '100%' }} styles={{ body: { padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' } }}>
                    <HealthGauge score={insights.score ?? 100} />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card title={<Space><AlertTriangle size={16} color="var(--color-orange)" /><span>Actionable Suggestions</span></Space>}
                    style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', height: '100%' }}
                    styles={{ body: { padding: 16, maxHeight: 280, overflowY: 'auto' } }}>
                    {insights.suggestions?.length > 0 ? insights.suggestions.map((s, i) => <SuggestionCard key={i} item={s} />) : <Text type="secondary">No suggestions at this time.</Text>}
                  </Card>
                </Col>
                <Col span={8}>
                  <Card title={<Space><TrendingUp size={16} color="var(--color-navy)" /><span>Compliance Analysis</span></Space>}
                    style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', height: '100%' }}
                    styles={{ body: { padding: 16 } }}>
                    <Paragraph style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-body)', margin: 0 }}>
                      {insights.narrative || 'No analysis available.'}
                    </Paragraph>
                    <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--color-bg-page)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-light)' }}>
                      <Space size={4}><Info size={12} color="var(--color-text-muted)" /><Text style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Analysis based on live compliance scores · Updated on page load</Text></Space>
                    </div>
                  </Card>
                </Col>
              </Row>
            )}

            <Row gutter={16}>
              {[{ key: 'high', label: 'High Risk', color: 'red' }, { key: 'medium', label: 'Medium Risk', color: 'orange' }, { key: 'low', label: 'Low Risk', color: 'green' }].map(({ key, label, color }) => (
                <Col span={8} key={key}>
                  <Card title={<Tag color={color}>{label}</Tag>}
                    style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
                    styles={{ body: { padding: 16 } }}>
                    <Table rowKey="id" pagination={false} locale={{ emptyText: 'No vendors' }} dataSource={data[key]} columns={cols} size="small" scroll={{ x: 'max-content' }} />
                  </Card>
                </Col>
              ))}
            </Row>
          </>
        )}
      </Space>
    </div>
  );
};

export default VendorRiskDashboard;
