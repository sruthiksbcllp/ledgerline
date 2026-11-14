import React, { useEffect, useState } from 'react';
import { Alert, Button, Col, Empty, Form, InputNumber, Modal, Row, Space, Spin, Switch, Table, Tag, Typography, message } from 'antd';
import api from '../../utils/api';

const { Text } = Typography;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/**
 * Auto-submit for clean AI-read bills: the switch (off by default), the limits, and the evidence
 * to decide with: how often the AI's reading was accepted unchanged, which fields people correct,
 * and which vendors currently qualify. onSaved(settings) runs after a change.
 */
export default function AutoSubmitSettings({ open, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get('/bill-inbox/auto')
      .then((res) => {
        const d = res?.data?.data;
        setData(d);
        form.setFieldsValue(d?.settings || {});
      })
      .catch((e) => message.error(e?.response?.data?.message || 'Could not load auto-submit settings'))
      .finally(() => setLoading(false));
  }, [open, form]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await api.put('/bill-inbox/auto', values);
      message.success(res?.data?.message || 'Saved');
      onSaved?.(res?.data?.data);
      onClose();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const s = data?.stats;
  const canEdit = data?.can_edit;
  const enabled = Form.useWatch('enabled', form);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={760}
      title="Auto-submit clean bills"
      destroyOnClose
      footer={canEdit
        ? <Space><Button onClick={onClose}>Cancel</Button><Button type="primary" loading={saving} onClick={save}>Save</Button></Space>
        : <Button onClick={onClose}>Close</Button>}
    >
      {loading || !data ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Text type="secondary">
            When this is on, a bill from the bill inbox that passes every check is submitted for approval without anyone typing or clicking Submit.
            It only does the data entry: the bill still waits for an approver, and payment is never automatic.
            Bills that fail any check, credit notes, new vendors and bills above the limit always go to a person.
          </Text>

          <Form form={form} layout="vertical" disabled={!canEdit} requiredMark={false}>
            <Form.Item name="enabled" valuePropName="checked" style={{ marginBottom: 12 }}>
              <Switch checkedChildren="On" unCheckedChildren="Off" />
            </Form.Item>
            {enabled && (
              <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Applies to bills that arrive from now on. Bills already waiting stay with a person." />
            )}
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="max_amount" label="Only bills up to (total)" rules={[{ required: true, message: 'Required' }]}>
                  <InputNumber min={0} step={10000} prefix="₹" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="track_record" label="Vendor needs this many clean bills first" rules={[{ required: true, message: 'Required' }]}
                  extra="Its most recent AI-read bills, all accepted with no corrections.">
                  <InputNumber min={1} max={50} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="spot_check_every" label="Spot check 1 clean bill in" rules={[{ required: true, message: 'Required' }]}
                  extra="Picked at random and sent to a person anyway.">
                  <InputNumber min={1} max={100} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
          {!canEdit && <Alert type="warning" showIcon message="Only Finance or an admin can change these settings." />}

          <div>
            <Text strong>How accurate the AI has been (last {s.days} days)</Text>
            {s.bills === 0 ? (
              <div style={{ marginTop: 8 }}><Text type="secondary">No AI-read bills submitted yet. The figures fill in as bills are accepted from the inbox or through Upload bill (AI).</Text></div>
            ) : (
              <div style={{ marginTop: 8 }}>
                <Space size={24} wrap>
                  <div><div style={{ fontSize: 22, fontWeight: 700 }}>{pct(s.clean, s.bills)}%</div><Text type="secondary" style={{ fontSize: 12 }}>{s.clean} of {s.bills} bills accepted without corrections</Text></div>
                  <div><div style={{ fontSize: 22, fontWeight: 700 }}>{s.auto_submitted}</div><Text type="secondary" style={{ fontSize: 12 }}>auto-submitted</Text></div>
                </Space>
                {s.corrected_fields.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Fields people corrected most: </Text>
                    {s.corrected_fields.map((c) => <Tag key={c.field}>{c.label} · {c.count}</Tag>)}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <Text strong>Vendors</Text>
            <Table
              style={{ marginTop: 8 }}
              size="small"
              rowKey="vendor_id"
              pagination={{ pageSize: 6, hideOnSinglePage: true }}
              dataSource={s.vendors}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No vendor has AI-read bills yet" /> }}
              columns={[
                { title: 'Vendor', dataIndex: 'vendor_name' },
                {
                  title: 'Status', key: 'q', render: (_, v) => (v.qualified
                    ? <Tag color="success">Qualifies</Tag>
                    : <Space direction="vertical" size={0}><Tag>{v.clean} of {v.needed} clean</Tag>{v.issue && <Text type="secondary" style={{ fontSize: 12 }}>Last issue: {v.issue}</Text>}</Space>),
                },
              ]}
            />
          </div>
        </Space>
      )}
    </Modal>
  );
}
