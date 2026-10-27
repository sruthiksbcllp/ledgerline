import React, { useEffect, useState } from 'react';
import {
  Form, Input, Button, Card,
  Space, Row, Col, Divider, message, Radio
} from 'antd';
import { ArrowLeft, Building2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import { useSelector } from 'react-redux';

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };

const AddDepartment = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { token } = useSelector((state) => state.auth);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      fetchDept();
    }
  }, [id]);

  const fetchDept = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/masters/departments/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        form.setFieldsValue(res.data.data);
      }
    } catch {
      message.error('Failed to load department');
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const url = isEdit ? `/masters/departments/${id}` : '/masters/departments';
      const meth = isEdit ? 'put' : 'post';
      // Auto-generate dept_code if not provided (create only)
      if (!isEdit && !values.dept_code?.trim()) {
        values.dept_code = values.dept_name
          .replace(/[^a-zA-Z0-9]/g, '')
          .substring(0, 6)
          .toUpperCase();
        // Append random suffix to avoid uniqueness collisions
        values.dept_code += Math.random().toString(36).substr(2, 4).toUpperCase();
      }
      const res = await api[meth](url, values, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        message.success(`Department ${isEdit ? 'updated' : 'added'} successfully`);
        navigate('/masters/departments');
      } else {
        message.error(res.data.message || 'Operation failed');
      }
    } catch (err) {
      const apiMsg = err?.response?.data?.message;
      const fieldErrors = err?.response?.data?.errors;
      if (fieldErrors && Array.isArray(fieldErrors) && fieldErrors.length > 0) {
        message.error(fieldErrors.map(e => e.msg || e.message).join('; '));
      } else {
        message.error(apiMsg || 'Operation failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={Building2}
        title={`Manage Masters – ${isEdit ? 'Edit' : 'Add'} Department`}
        subtitle="Create and configure departments for your organisation"
        actions={<Button icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>Back</Button>}
      />

      <Card style={contentCard}>
        <Divider style={{ margin: '0 0 24px 0' }} />

        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ status: 'ACTIVE' }}>
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item name="dept_name" label="Department Name" rules={[{ required: true, message: 'Please enter department name' }]}>
                <Input placeholder="Enter Department Name" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="dept_code" label="Department Code" tooltip="Auto-generated if left blank">
                <Input placeholder="e.g. IT, HR, FIN" disabled={isEdit} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="numbering_code" label="Numbering Code (for document numbers)" tooltip="Short code used in PR/PO/Quotation numbers, e.g. IT or ADM. Falls back to Department Code if blank.">
                <Input maxLength={10} placeholder="e.g. IT, ADM" style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={3} placeholder="Enter Description" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="status" label="Status">
                <Radio.Group>
                  <Radio value="ACTIVE">Active</Radio>
                  <Radio value="INACTIVE">Inactive</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
            <Space size={12}>
              <Button onClick={() => navigate(-1)} style={{ minWidth: '100px', height: '40px' }}>Cancel</Button>
              <Button type="primary" loading={loading} onClick={() => form.submit()} style={{ backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)', minWidth: '100px', height: '40px' }}>Submit</Button>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default AddDepartment;
