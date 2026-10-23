import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Tag, Space, Progress, Divider, Alert, Spin, Empty } from 'antd';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, Calendar, ListChecks, ArrowRight } from 'lucide-react';
import api from '../utils/api';

const { Title, Text } = Typography;

const AuditIntelligencePanel = ({ sessionId }) => {
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState(null);

  useEffect(() => {
    if (sessionId) {
      fetchInsight();
    }
  }, [sessionId]);

  const fetchInsight = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/audit-sessions/${sessionId}/ai-insights`);
      setInsight(response.data || response);
    } catch {
      /* panel shows Empty state when insight is null */
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '40px' }}><Spin tip="Generating Smart Insights..." /></div>;
  if (!insight) return <Empty description="AI Analysis not yet available for this session" />;

  const { summary_json, risk_analysis_json, compliance_flags_json, audit_planning_json, recommended_actions_json } = insight;

  return (
    <div style={{ animation: 'fadeIn 0.5s' }}>
      <Card 
        title={<Space><ShieldCheck color="#1677ff" /> <Text strong>Smart Audit Intelligence & CARO 2020 Compliance</Text></Space>} 
        bordered={false} 
        style={{ 
          background: summary_json.compliance_status === 'non_compliant' ? '#fff1f0' : '#f6ffed', 
          border: `1px solid ${summary_json.compliance_status === 'non_compliant' ? '#ffa39e' : '#b7eb8f'}`, 
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        }}
      >
        <Row gutter={[24, 24]}>
          {/* Summary Column */}
          <Col xs={24} md={6}>
            <div style={{ padding: '20px', background: '#fff', borderRadius: '12px', textAlign: 'center', height: '100%' }}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px' }}>COMPLIANCE STATUS</Text>
              <Title level={2} style={{ margin: '8px 0', color: summary_json.compliance_status === 'non_compliant' ? '#f5222d' : '#52c41a' }}>
                {summary_json.compliance_status.replace('_', '-').toUpperCase()}
              </Title>
              <Progress 
                type="dashboard" 
                percent={parseFloat(summary_json.verification_rate)} 
                status={summary_json.compliance_status === 'non_compliant' ? 'exception' : 'normal'} 
                width={80}
              />
              <div style={{ marginTop: 8 }}>
                <Text strong>{summary_json.verification_rate} Verified</Text><br/>
                <Text type="secondary" style={{ fontSize: 12 }}>{summary_json.audit_coverage.toUpperCase()} Coverage</Text>
              </div>
            </div>
          </Col>

          {/* Details Column */}
          <Col xs={24} md={18}>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Text strong style={{ fontSize: 13, color: '#475569' }}>CRITICAL OBSERVATIONS</Text>
                <div style={{ marginTop: 12 }}>
                  {compliance_flags_json.map((flag, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '12px', background: 'rgba(255,255,255,0.6)', padding: '10px', borderRadius: '8px' }}>
                      <AlertTriangle color={flag.severity === 'high' ? '#f5222d' : '#faad14'} size={18} style={{ flexShrink: 0 }} />
                      <div>
                        <Text strong style={{ fontSize: 13 }}>{flag.standard}: </Text>
                        <Text style={{ fontSize: 13 }}>{flag.issue}</Text>
                      </div>
                    </div>
                  ))}
                </div>
              </Col>
              
              <Col span={12}>
                <Text strong style={{ fontSize: 13, color: '#475569' }}>RISK ASSESSMENT</Text>
                <div style={{ marginTop: 12 }}>
                  {risk_analysis_json.map((risk, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: 8 }}>
                      <Tag color={risk.severity === 'high' ? 'error' : 'warning'}>{risk.risk_type.toUpperCase()}</Tag>
                      <Text style={{ fontSize: 12 }}>{risk.description}</Text>
                    </div>
                  ))}
                </div>
              </Col>

              <Col span={12}>
                <Text strong style={{ fontSize: 13, color: '#475569' }}>AUDIT PLANNING</Text>
                <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.6)', padding: '12px', borderRadius: '8px' }}>
                  <Space direction="vertical" size={4}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Calendar size={14} color="#1677ff" />
                      <Text style={{ fontSize: 12 }}>Next Audit: <Text strong>{audit_planning_json.next_audit_recommended_date}</Text></Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ListChecks size={14} color="#1677ff" />
                      <Text style={{ fontSize: 12 }}>Priority: <Tag size="small">{audit_planning_json.priority_locations[0]}</Tag></Text>
                    </div>
                  </Space>
                </div>
              </Col>
            </Row>

            <Divider style={{ margin: '16px 0' }} />

            <Row gutter={16}>
              <Col span={24}>
                <Text strong style={{ fontSize: 13, color: '#475569' }}>AI RECOMMENDED ACTIONS</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: 12 }}>
                  {recommended_actions_json.map((action, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', padding: '6px 12px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                      <ArrowRight size={12} color="#1677ff" />
                      <Text style={{ fontSize: 12 }}>{action}</Text>
                    </div>
                  ))}
                </div>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default AuditIntelligencePanel;
