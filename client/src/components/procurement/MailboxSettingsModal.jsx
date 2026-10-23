import React, { useEffect, useState } from 'react';
import { Alert, Col, Form, Input, InputNumber, Modal, Row, Select, Switch, Typography, message } from 'antd';
import api from '../../utils/api';

const { Text } = Typography;

// Common providers; the admin can still type any SMTP server.
const PRESETS = {
  gmail: { label: 'Google Workspace / Gmail', smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true },
  outlook: { label: 'Microsoft 365 / Outlook', smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false },
  zoho: { label: 'Zoho Mail', smtp_host: 'smtp.zoho.in', smtp_port: 465, smtp_secure: true },
  custom: { label: 'Other SMTP server' },
};

/** Connects the logged-in admin's own mailbox; the server verifies it before saving. */
const MailboxSettingsModal = ({ open, onClose, onSaved, userEmail, userName }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    api.get('/vendor-emails/mailbox')
      .then((res) => {
        const data = res?.data?.data;
        setCurrent(data || null);
        form.setFieldsValue(data
          ? { ...data, preset: 'custom', password: undefined }
          : { preset: 'gmail', ...PRESETS.gmail, from_email: userEmail, smtp_user: userEmail, from_name: userName });
      })
      .catch(() => setCurrent(null));
  }, [open, form, userEmail, userName]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const { preset: _preset, ...payload } = values;
      const res = await api.put('/vendor-emails/mailbox', payload, { timeout: 60000 });
      message.success(res?.data?.message || 'Mailbox connected');
      onSaved?.(res?.data?.data);
      onClose();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not connect the mailbox');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={save} confirmLoading={saving} okText="Verify & save" title="Your sending mailbox" destroyOnClose width={620}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Vendor emails are sent from your own mailbox"
        description="The connection is tested before it is saved. Your password is stored encrypted on the server and is never shown again. For Gmail or Microsoft 365, use an app password."
      />
      {current?.last_error && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Last send failed" description={current.last_error} />}
      <Form form={form} layout="vertical" requiredMark>
        <Form.Item name="preset" label="Provider">
          <Select
            options={Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label }))}
            onChange={(value) => {
              const { label: _label, ...settings } = PRESETS[value];
              if (settings.smtp_host) form.setFieldsValue(settings);
            }}
          />
        </Form.Item>
        <Row gutter={12}>
          <Col span={14}><Form.Item name="smtp_host" label="SMTP host" rules={[{ required: true, message: 'Required' }]}><Input placeholder="smtp.example.com" /></Form.Item></Col>
          <Col span={5}><Form.Item name="smtp_port" label="Port" rules={[{ required: true, message: 'Required' }]}><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={5}><Form.Item name="smtp_secure" label="SSL/TLS" valuePropName="checked" tooltip="On for port 465. Off for 587 (STARTTLS is still required)."><Switch /></Form.Item></Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="smtp_user" label="Username" rules={[{ required: true, message: 'Required' }]}><Input autoComplete="off" /></Form.Item></Col>
          <Col span={12}>
            <Form.Item name="password" label="Password / app password" rules={current ? [] : [{ required: true, message: 'Required' }]} extra={current ? 'Leave empty to keep the saved password' : null}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="from_name" label="Sender name"><Input placeholder="Your name" /></Form.Item></Col>
          <Col span={12}>
            <Form.Item name="from_email" label="Sender email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]} extra={<Text type="secondary" style={{ fontSize: 12 }}>Must be your own login email</Text>}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default MailboxSettingsModal;
