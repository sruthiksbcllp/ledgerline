import React, { useState, useEffect } from 'react';
import {
  Card, Switch, List, Typography,
  Divider, message, Space, Badge,
  Alert, Row, Col, Button
} from 'antd';
import { Settings, ShoppingCart, IndianRupee, Scan, Calculator, ShieldAlert, Cpu, Eye, Edit2, Trash2, ArrowLeft } from 'lucide-react';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const SystemSettings = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/system/features');
      const featureRows = Array.isArray(response?.data?.data) ? response.data.data : Array.isArray(response?.data) ? response.data : [];
      const enabled_features = featureRows.reduce((acc, feature) => {
        const key = feature.feature_key || feature.key;
        if (key) acc[key] = Boolean(feature.is_enabled);
        return acc;
      }, {});
      setSettings({ enabled_features });
    } catch {
      message.error('Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleToggle = async (featureKey, checked) => {
    try {
      const updatedFeatures = { ...settings.enabled_features, [featureKey]: checked };
      await api.put(`/system/features/${featureKey}`, { is_enabled: checked });
      setSettings({ ...settings, enabled_features: updatedFeatures });
      message.success(`${featureKey.replace('_', ' ').toUpperCase()} ${checked ? 'Enabled' : 'Disabled'} Successfully`);
    } catch {
      message.error('Failed to update feature toggle');
    }
  };

  const featureList = [
    {
      key: 'procurement',
      title: 'Procurement Lifecycle',
      description: 'Enable Requisitions, POs, and Vendor Management workflow.',
      icon: <ShoppingCart size={20} color="var(--color-navy)" />
    },
    {
      key: 'finance_cwip',
      title: 'Finance & CWIP',
      description: 'Enable 3-Way Match, Invoice Processing, and Capitalization.',
      icon: <IndianRupee size={20} color="var(--color-gold)" />
    },
    {
      key: 'depreciation',
      title: 'Depreciation Engine',
      description: 'Automated SLM/WDV calculations for Companies Act & IT Act.',
      icon: <Calculator size={20} color="var(--color-navy-deep)" />
    },
    {
      key: 'audit',
      title: 'Audit & QR Scanning',
      description: 'Audit verification and QR-based asset compliance.',
      icon: <Scan size={20} color="var(--color-success)" />
    },
    {
      key: 'tagging_rfid',
      title: 'RFID Support (Advanced)',
      description: 'Enable ultra-high frequency RFID tracking for high-value assets.',
      icon: <Cpu size={20} color="var(--color-info)" />
    }
  ];

  if (loading) return null;

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <Button icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)} style={{ borderRadius: 'var(--radius-md)', height: 34 }}>Back</Button>
              <div className="page-header-icon"><Settings size={24}  /></div>
              <div>
                <h2 className="page-header-title">System Configuration</h2>
                <p className="page-header-sub">
                  Modular feature management for the Fixtag environment
                </p>
              </div>
            </Space>
          </Col>
        </Row>
      </Card>

      <Alert
        message="Client-Specific Configuration"
        description="Disabling a module will hide it from the navigation and block corresponding API endpoints. This allows you to tailor the experience for different client requirements."
        type="info"
        showIcon
        icon={<ShieldAlert size={20} />}
        style={{ marginBottom: 24, borderRadius: 'var(--radius-lg)' }}
      />

      <Card style={contentCard} styles={{ body: { padding: '14px 20px' } }}>
        <Title level={2} style={{ marginBottom: 24 }}>Module Management</Title>
        <List
          itemLayout="horizontal"
          dataSource={featureList}
          renderItem={(item) => (
            <List.Item
              extra={
                <Switch
                  checked={settings?.enabled_features[item.key]}
                  onChange={(checked) => handleToggle(item.key, checked)}
                />
              }
            >
              <List.Item.Meta
                avatar={<div style={{ padding: '10px', background: 'var(--color-bg-page)', borderRadius: 'var(--radius-md)' }}>{item.icon}</div>}
                title={<Text strong style={{ fontSize: '16px' }}>{item.title}</Text>}
                description={item.description}
              />
            </List.Item>
          )}
        />
      </Card>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
         <Text type="secondary" style={{ fontSize: '12px' }}>
            System Version: 1.2.0-Enterprise | Last Configuration Sync: {new Date().toLocaleTimeString()}
         </Text>
      </div>
    </div>
  );
};

export default SystemSettings;
