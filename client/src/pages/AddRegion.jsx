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

const AddRegion = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { token } = useSelector(state => state.auth);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      fetchRegion();
    }
  }, [id]);

  const fetchRegion = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/masters/regions/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        form.setFieldsValue(res.data.data);
      }
    } catch {
      message.error('Failed to load region');
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const url = isEdit 
        ? `/masters/regions/${id}`
        : '/masters/regions';
      const meth = isEdit ? 'put' : 'post';
      
      // For add, we need a region_code if it's not provided
      if(!isEdit && !values.region_code) {
          values.region_code = values.region_name.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 1000);
      }

      const res = await api[meth](url, values, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        message.success(`Region ${isEdit ? 'updated' : 'added'} successfully`);
        navigate('/masters/regions');
      }
    } catch {
      message.error('Operation failed');
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
                <h2 className="page-header-title">{isEdit ? 'Edit' : 'Add'} Region</h2>
                <p className="page-header-sub">Manage Masters</p>
              </div>
            </Space>
          </Col>
          <Col><Button icon={<ArrowLeft size={14} />} onClick={() => navigate(-1)} style={{ borderRadius: 'var(--radius-md)', height: 34 }}>Back</Button></Col>
        </Row>
      </Card>

      <Card style={{ ...contentCard, maxWidth: 760, margin: '0 auto' }} styles={{ body: { padding: '24px 28px' } }}>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ status: 'ACTIVE' }}>
          <Row gutter={24}>
            <Col span={24}>
              <Form.Item name="region_name" label={<span>Region Name <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true }]}>
                <Input placeholder="Enter Region Name" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={3} placeholder="Enter Description" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="status" label={<span>Status <span style={{ color: 'var(--color-danger)' }}>*</span></span>}>
                <Radio.Group>
                  <Radio value="ACTIVE">Active</Radio>
                  <Radio value="INACTIVE">Inactive</Radio>
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

export default AddRegion;
