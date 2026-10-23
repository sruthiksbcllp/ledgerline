import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Table, Checkbox, Space, message, Empty, Typography, Row, Col } from 'antd';
import { Shield, List, CheckSquare } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { PERMISSION_SECTIONS as sections } from '../constants';

const { Title, Text } = Typography;

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard    = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = (bg) => ({ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg || 'var(--color-bg-page)', border: bg ? 'none' : '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 });

const AddRole = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [form]    = Form.useForm();
  const [loading, setLoading] = useState(false);

  const query  = new URLSearchParams(location.search);
  const roleId = query.get('id');
  const isView = query.get('view') === 'true';
  const isEdit = !!roleId && !isView;
  const pageTitle = isView ? 'View Role' : isEdit ? 'Edit Role' : 'Create Role';

  const [permissions, setPermissions] = useState(
    sections.map((s) => ({ section: s, can_add: false, can_edit: false, can_delete: false, can_view: false }))
  );

  const fetchRole = async () => {
    try {
      const res      = await api.get(`/roles/${roleId}`);
      const roleData = res?.data?.data || res?.data || res;
      if (roleData) {
        form.setFieldsValue(roleData);
        if (roleData.RolePermissions) {
          const merged = sections.map((s) => {
            const found = roleData.RolePermissions.find((p) => p.section === s || p.section_name === s);
            return found
              ? { section: s, can_add: !!found.can_add, can_edit: !!found.can_edit, can_delete: !!found.can_delete, can_view: !!found.can_view }
              : { section: s, can_add: false, can_edit: false, can_delete: false, can_view: false };
          });
          setPermissions(merged);
        }
      }
    } catch { message.error('Failed to load role data'); }
  };

  useEffect(() => { if (isEdit || isView) fetchRole(); }, [roleId, isEdit, isView]);

  const handleCheckboxChange = (idx, field) => {
    const next = [...permissions];
    next[idx][field] = !next[idx][field];
    setPermissions(next);
  };

  const selectAll = () => setPermissions(sections.map((s) => ({ section: s, can_add: true, can_edit: true, can_delete: true, can_view: true })));
  const clearAll  = () => setPermissions(sections.map((s) => ({ section: s, can_add: false, can_edit: false, can_delete: false, can_view: false })));

  const onFinish = async (values) => {
    try {
      setLoading(true);
      const payload = { ...values, permissions };
      if (isEdit) { await api.put(`/roles/${roleId}`, payload); message.success('Role updated'); }
      else         { await api.post('/roles', payload);          message.success('Role created'); }
      navigate('/admin/roles');
    } catch { message.error(isEdit ? 'Update failed' : 'Creation failed'); }
    finally { setLoading(false); }
  };

  const columns = [
    { title: 'Module / Section', dataIndex: 'section', key: 'section', width: 200, render: (v) => <Text style={{ fontSize: 13, fontWeight: 500 }}>{v}</Text> },
    ...(['can_view', 'can_add', 'can_edit', 'can_delete']).map((key) => ({
      title: key.replace('can_', '').charAt(0).toUpperCase() + key.replace('can_', '').slice(1),
      key,
      width: 80,
      align: 'center',
      render: (_, record, index) => (
        <Checkbox checked={record[key]} onChange={() => handleCheckboxChange(index, key)} disabled={isView} />
      ),
    })),
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div className="page-header-icon"><Shield size={24}  /></div>
              <div>
                <h2 className="page-header-title">{pageTitle}</h2>
                <p className="page-header-sub">Define role name and assign module permissions</p>
              </div>
            </Space>
          </Col>
          <Col>
            <Button icon={<List size={14} />} onClick={() => navigate('/admin/roles')} style={{ borderRadius: 'var(--radius-md)', height: 34 }}>Role List</Button>
          </Col>
        </Row>
      </Card>

      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Card style={contentCard} styles={{ body: { padding: '14px 20px' } }}>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="role_name" label="Role Name" rules={[{ required: true, message: 'Role name is required' }]}>
                <Input placeholder="e.g. Finance Manager" disabled={isView} size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="role_description" label="Description">
                <Input placeholder="Brief description of this role" disabled={isView} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 12px' }}>
            <Text style={{ fontWeight: 600, fontSize: 14 }}>Module Permissions</Text>
            {!isView && (
              <Space size={8}>
                <Button size="small" icon={<CheckSquare size={12} />} onClick={selectAll} style={{ borderRadius: 'var(--radius-sm)', fontSize: 12 }}>Select All</Button>
                <Button size="small" onClick={clearAll} style={{ borderRadius: 'var(--radius-sm)', fontSize: 12 }}>Clear All</Button>
              </Space>
            )}
          </div>

          <Table
            columns={columns}
            dataSource={permissions}
            pagination={false}
            rowKey="section"
            size="small"
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">No sections</Text>} /> }}
            style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}
          />

          {!isView && (
            <Row justify="end" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border-light)' }}>
              <Space>
                <Button onClick={() => form.resetFields()} style={{ borderRadius: 'var(--radius-md)' }}>Reset</Button>
                <Button type="primary" htmlType="submit" loading={loading} style={primaryBtn}>{isEdit ? 'Update Role' : 'Create Role'}</Button>
              </Space>
            </Row>
          )}
        </Card>
      </Form>
    </div>
  );
};

export default AddRole;
