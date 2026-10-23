import React, { useEffect, useState } from 'react';
import {
  Form, Input, Button, Select, Card,
  Space, Row, Col, message, Typography
} from 'antd';
import { List, ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';

const { Option } = Select;
const { Title, Text } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const AddProperty = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [types, setTypes] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    fetchMasters();
    if (isEdit) fetchProperty();
  }, [id]);

  const fetchMasters = async () => {
    try {
      const typeRes = await api.get('/masters/property-types');
      const deptRes = await api.get('/masters/departments');
      const typeBody = typeRes?.data;
      const deptBody = deptRes?.data;
      const typeData = typeBody?.data ?? typeBody ?? [];
      const deptData = deptBody?.data ?? deptBody ?? [];
      setTypes(Array.isArray(typeData) ? typeData : []);
      setDepartments(Array.isArray(deptData) ? deptData : []);
    } catch {
      message.error('Failed to load property masters');
    }
  };

  const fetchProperty = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/masters/properties/${id}`);
      const body = res?.data;
      const propData = body?.data ?? body ?? null;
      if (propData) form.setFieldsValue(propData);
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      if (isEdit) await api.put(`/masters/properties/${id}`, values);
      else await api.post('/masters/properties', values);
      message.success(`Property ${isEdit ? 'updated' : 'saved'} successfully`);
      navigate('/property/manage');
    } catch (err) {
      message.error(err?.response?.data?.message || 'Operation failed');
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
                <h2 className="page-header-title">{isEdit ? 'Edit' : 'Add'} Property</h2>
                <p className="page-header-sub">Property Management</p>
              </div>
            </Space>
          </Col>
          <Col><Button icon={<ArrowLeft size={14} />} onClick={() => navigate(-1)} style={{ borderRadius: 'var(--radius-md)', height: 34 }}>Back</Button></Col>
        </Row>
      </Card>

      <Card style={{ ...contentCard, maxWidth: 760, margin: '0 auto' }} styles={{ body: { padding: '24px 28px' } }}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Row gutter={24}>
            <Col span={24}>
              <Form.Item name="property_name" label={<span>Property Name <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true }]}>
                <Input placeholder="Enter Property Name" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="property_type_id" label={<span>Property Type <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true }]}>
                <Select placeholder="Select Property Type" style={{ borderRadius: 'var(--radius-md)' }}>
                  {types.map((t) => <Option key={t.id} value={t.id}>{t.type_name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="department_id" label="Department">
                <Select placeholder="Select Department" style={{ borderRadius: 'var(--radius-md)' }}>
                  {departments.map((d) => <Option key={d.id} value={d.id}>{d.dept_name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="state_code" label="GST State Code" tooltip="2-digit place-of-supply state code (e.g. 27 = Maharashtra)">
                <Input maxLength={2} placeholder="e.g. 27" style={{ borderRadius: 'var(--radius-md)' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gstin" label="GSTIN (optional)">
                <Input maxLength={15} placeholder="Property GSTIN" style={{ borderRadius: 'var(--radius-md)' }} />
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

export default AddProperty;
