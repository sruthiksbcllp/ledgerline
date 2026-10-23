import React, { useState, useEffect } from 'react';
import {
  Form, Input, Button, Card,
  Space, Row, Col, message, Select, Switch, Typography
} from 'antd';
import { Settings, Save } from 'lucide-react';
import api from '../utils/api';
import { useSelector } from 'react-redux';

const { Title } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const GlobalSettings = () => {
  const [form] = Form.useForm();
  const { token } = useSelector(state => state.auth);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/system/global-settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success && res.data.data) {
        form.setFieldsValue(res.data.data);
      }
    } catch { /* silenced */ } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await api.put('/system/settings', values, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        message.success('Settings updated successfully');
      }
    } catch {
      message.error('Update failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div className="page-header-icon"><Settings size={24}  /></div>
              <div>
                <h2 className="page-header-title">Global Settings</h2>
                <p className="page-header-sub">
                  Company profile, export access, reminders, and session timeout
                </p>
              </div>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={contentCard} styles={{ body: { padding: '14px 20px' } }}>
        <Title level={4} style={{ marginBottom: 20 }}>Application configuration</Title>

        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Row gutter={24}>
            <Col span={24}>
              <Form.Item name="company_name" label="Company Name">
                <Input placeholder="Enter Company Name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currency_symbol" label="Currency symbol">
                <Input placeholder="₹" maxLength={5} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="date_format" label="Date format">
                <Select options={['DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD'].map((value) => ({ value, label: value }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="session_timeout_minutes" label="Session timeout (minutes)">
                <Input type="number" min={5} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="max_upload_size_mb" label="Maximum upload size (MB)">
                <Input type="number" min={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="allow_excel_export" label="Allow Excel Export" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="allow_pdf_export" label="Allow PDF Export" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email_notifications" label="Email notifications" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Space size={12} style={{ marginTop: 24 }}>
            <Button
              type="primary"
              loading={loading}
              htmlType="submit"
              style={primaryBtn}
              icon={<Save size={16} />}
            >
              Update Settings
            </Button>
            <Button>
              Cancel
            </Button>
          </Space>
        </Form>
      </Card>

    </div>
  );
};

export default GlobalSettings;
