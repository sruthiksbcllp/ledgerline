import React, { useEffect, useState } from 'react';
import {
  Form, Input, Button, Card,
  Space, Row, Col, message, Radio, Typography
} from 'antd';
import { ArrowLeft, List } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import { useSelector } from 'react-redux';

const { Title, Text } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const AddPropertyType = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { token } = useSelector(state => state.auth);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      fetchPropertyType();
    }
  }, [id]);

  const fetchPropertyType = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/masters/property-types/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        form.setFieldsValue(res.data.data);
      }
    } catch {
      message.error('Failed to fetch property type data');
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const url = isEdit 
        ? `/masters/property-types/${id}`
        : '/masters/property-types';
      const method = isEdit ? 'put' : 'post';
      
      const res = await api[method](url, values, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        message.success(`Property type ${isEdit ? 'updated' : 'added'} successfully`);
        navigate('/masters/property-types');
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Operation failed');
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
              <div className="page-header-icon"><List size={24}  /></div>
              <div>
                <h2 className="page-header-title">{isEdit ? 'Edit' : 'Add'} Property Type</h2>
                <p className="page-header-sub">Manage Masters</p>
              </div>
            </Space>
          </Col>
          <Col><Button icon={<ArrowLeft size={14} />} onClick={() => navigate(-1)} style={{ borderRadius: 'var(--radius-md)', height: 34 }}>Back</Button></Col>
        </Row>
      </Card>

      <Card style={{ ...contentCard, maxWidth: 760, margin: '0 auto' }} styles={{ body: { padding: '24px 28px' } }}>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ status: 'Active' }}>
          <Row gutter={24}>
            <Col span={24}>
              <Form.Item name="type_name" label={<span>Property Type <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true, message: 'Please enter property type' }]}>
                <Input placeholder="Enter Property Type" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item name="description" label={<span>Description <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true, message: 'Please enter description' }]}>
                <Input.TextArea rows={4} placeholder="Enter Description" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item name="status" label={<span>Status <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true }]}>
                <Radio.Group>
                  <Radio value="Active">Active</Radio>
                  <Radio value="Inactive">Inactive</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>

          <Row justify="end" style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--color-border-light)' }}>
            <Space>
              <Button onClick={() => navigate(-1)} style={{ borderRadius: 'var(--radius-md)' }}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={loading} style={primaryBtn}>Submit</Button>
            </Space>
          </Row>
        </Form>
      </Card>
    </div>
  );
};

export default AddPropertyType;
