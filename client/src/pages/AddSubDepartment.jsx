import React, { useEffect, useState } from 'react';
import {
  Form, Input, Button, Card,
  Space, Row, Col, Divider, message, Radio, Select
} from 'antd';
import { ArrowLeft, List, Layers} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../utils/api';
import { useSelector } from 'react-redux';

const { Option } = Select;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };

const AddSubDepartment = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { token } = useSelector(state => state.auth);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    fetchDepartments();
    if (isEdit) {
      fetchSubDept();
    }
  }, [id]);

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/masters/departments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setDepartments(res.data.data);
      }
    } catch {
      message.error('Failed to load departments');
    }
  };

  const fetchSubDept = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/masters/sub-departments/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        form.setFieldsValue(res.data.data);
      }
    } catch {
      message.error('Failed to load sub-department');
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const url = isEdit
        ? `/masters/sub-departments/${id}`
        : '/masters/sub-departments';
      const meth = isEdit ? 'put' : 'post';

      const res = await api[meth](url, values, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        message.success(`Sub-department ${isEdit ? 'updated' : 'added'} successfully`);
        navigate('/masters/sub-departments');
      }
    } catch {
      message.error('Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<Layers size={16} />}
        title={`Manage Masters – ${isEdit ? 'Edit' : 'Add'} Sub-Department`}
        subtitle="Create and configure sub-departments"
        actions={<Button icon={<ArrowLeft size={16} />} onClick={() => navigate(-1)}>Back</Button>}
      />

      <Card style={contentCard}>
        <Divider style={{ margin: '0 0 24px 0' }} />

        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ status: 'ACTIVE' }}>
          <Row gutter={24}>
            <Col span={24}>
              <Form.Item name="department_id" label={<span>Department <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true }]}>
                <Select placeholder="Select Department">
                    {departments.map(d => (
                        <Option key={d.id} value={d.id}>{d.dept_name}</Option>
                    ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="sub_dept_name" label={<span>Sub-Department Name <span style={{ color: 'var(--color-danger)' }}>*</span></span>} rules={[{ required: true }]}>
                <Input placeholder="Enter Sub-Department Name" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={3} placeholder="Enter Description" />
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

export default AddSubDepartment;
