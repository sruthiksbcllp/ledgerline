import React, { useEffect, useState } from 'react';
import {
  Form, Input, Button, Card,
  Space, Row, Col, message, Select, Typography
} from 'antd';
import { List, ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import { useSelector } from 'react-redux';

const { Option } = Select;
const { Title, Text } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const AddLocation = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { token } = useSelector((state) => state.auth);
  const [loading, setLoading] = useState(false);
  const [regions, setRegions] = useState([]);

  useEffect(() => {
    fetchRegions();
    if (isEdit) fetchLocation();
  }, [id]);

  const fetchRegions = async () => {
    try {
      const res = await api.get('/masters/regions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) setRegions(res.data.data);
    } catch {
      message.error('Failed to load regions');
    }
  };

  const fetchLocation = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/masters/locations/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) form.setFieldsValue(res.data.data);
    } catch {
      message.error('Failed to load location');
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const url = isEdit ? `/masters/locations/${id}` : '/masters/locations';
      const meth = isEdit ? 'put' : 'post';
      if (!isEdit && !values.location_code) {
        values.location_code = (values.location_name?.substring(0, 3) + Math.floor(Math.random() * 10000)).toUpperCase();
      }
      const res = await api[meth](url, values, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        message.success(`Location ${isEdit ? 'updated' : 'added'} successfully`);
        navigate('/property/locations');
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
                <h2 className="page-header-title">{isEdit ? 'Edit' : 'Add'} Location</h2>
                <p className="page-header-sub">Manage Masters</p>
              </div>
            </Space>
          </Col>
          <Col><Button icon={<ArrowLeft size={14} />} onClick={() => navigate(-1)} style={{ borderRadius: 'var(--radius-md)', height: 34 }}>Back</Button></Col>
        </Row>
      </Card>

      <Card style={{ ...contentCard, maxWidth: 760, margin: '0 auto' }} styles={{ body: { padding: '24px 28px' } }}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item name="state" label={<span>State <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true }]}>
                <Select placeholder="Select State" style={{ borderRadius: 'var(--radius-md)' }}>
                  <Option value="Delhi">Delhi</Option>
                  <Option value="Maharashtra">Maharashtra</Option>
                  <Option value="Gujarat">Gujarat</Option>
                  <Option value="Chandigarh">Chandigarh</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="city" label={<span>City <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true }]}>
                <Select placeholder="Select City" style={{ borderRadius: 'var(--radius-md)' }}>
                  <Option value="New Delhi">New Delhi</Option>
                  <Option value="Mumbai">Mumbai</Option>
                  <Option value="Pune">Pune</Option>
                  <Option value="Surat">Surat</Option>
                  <Option value="Chandigarh">Chandigarh</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="location_name" label={<span>Location <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true }]}>
                <Input placeholder="Enter Location" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="region_id" label={<span>Region <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true }]}>
                <Select placeholder="Select Region" style={{ borderRadius: 'var(--radius-md)' }}>
                  {regions.map((r) => <Option key={r.id} value={r.id}>{r.region_name}</Option>)}
                </Select>
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

export default AddLocation;
