import React, { useState } from 'react';
import { Form, Input, Button, Card, Row, Col, Typography, Space, message } from 'antd';
import { ArrowLeft, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const { Title, Text } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const AddServiceProvider = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await api.post('/masters/service-providers', values);
      // axios body on res.data; success flag is res.data.success
      if (res?.data?.success) {
        message.success('Service provider added successfully');
        navigate('/maintenance/service-providers');
      } else {
        message.error(res?.data?.message || 'Failed to save service provider');
      }
    } catch (err) {
      message.error(err.message || 'Failed to save service provider');
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
              <div className="page-header-icon"><Users size={24}  /></div>
              <div>
                <h2 className="page-header-title">Add Service Provider</h2>
                <p className="page-header-sub">Manage Masters</p>
              </div>
            </Space>
          </Col>
          <Col><Button icon={<ArrowLeft size={14} />} onClick={() => navigate(-1)} style={{ borderRadius: 'var(--radius-md)', height: 34 }}>Back</Button></Col>
        </Row>
      </Card>

      <Card style={{ ...contentCard, maxWidth: 760, margin: '0 auto' }} styles={{ body: { padding: '24px 28px' } }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          requiredMark="optional"
        >
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="provider_name" label="Service Provider Name" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Enter Service Provider Name" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contact_person" label="Contact Person Name" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Enter Contact Person Name" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Contact Number" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Enter Contact Number" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="email" label="Email ID" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
                <Input placeholder="Enter Email ID" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="address" label="Address">
                <Input.TextArea rows={4} placeholder="Enter Address" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row justify="end" style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--color-border-light)' }}>
            <Space>
              <Button onClick={() => navigate(-1)} style={{ borderRadius: 'var(--radius-md)' }}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={loading} style={primaryBtn}>Save Provider</Button>
            </Space>
          </Row>
        </Form>
      </Card>
    </div>
  );
};

export default AddServiceProvider;
