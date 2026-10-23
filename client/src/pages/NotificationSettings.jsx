import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Card, Row, Col, Statistic, Tag, Space, Popconfirm, message, Spin, Alert
} from 'antd';
import { Bell, Clock, Send, Play } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';

const pageHeaderCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)', marginBottom: 20 };
const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };
const iconBadge = { width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 };

const STATUS_COLOR = {
  SENT: 'success',
  FAILED: 'error'
};

const ENTITY_TYPE_LABELS = {
  MAINTENANCE: 'Maintenance',
  INSURANCE: 'Insurance',
  WARRANTY: 'Warranty'
};

export default function NotificationSettings() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState(null);
  const [filters, setFilters] = useState({ page: 1, limit: 20 });

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await api.get('/notifications/settings');
      setSmtpStatus(res.data?.data);
    } catch {
      message.error('Failed to load notification settings');
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        limit: filters.limit,
        offset: (filters.page - 1) * filters.limit
      };
      const res = await api.get('/notifications/logs', { params });
      setLogs(res.data?.data || []);
      setTotal(res.data?.pagination?.total || 0);
    } catch {
      message.error('Failed to load notification logs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleTestEmail = async () => {
    setTestLoading(true);
    try {
      const res = await api.post('/notifications/test');
      if (res.data?.success) {
        message.success('Test email sent successfully!');
      } else {
        message.error(res.data?.message || 'Failed to send test email');
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Error sending test email');
    } finally {
      setTestLoading(false);
    }
  };

  const handleRunNow = async () => {
    setRunLoading(true);
    try {
      const res = await api.post('/notifications/run-now');
      if (res.data?.success) {
        message.success('Notification check has been triggered. Check logs in a few moments.');
        setTimeout(() => {
          fetchLogs();
        }, 2000);
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'Error triggering notifications');
    } finally {
      setRunLoading(false);
    }
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'sent_at',
      key: 'sent_at',
      width: 180,
      render: (text) => dayjs(text).format('DD MMM YYYY HH:mm:ss')
    },
    {
      title: 'Type',
      dataIndex: 'entity_type',
      key: 'entity_type',
      width: 120,
      render: (type) => <Tag color="blue">{ENTITY_TYPE_LABELS[type] || type}</Tag>
    },
    {
      title: 'Notification Type',
      dataIndex: 'notification_type',
      key: 'notification_type',
      width: 100,
      render: (type) => <Tag>{type}</Tag>
    },
    {
      title: 'Sent To',
      dataIndex: 'sent_to',
      key: 'sent_to',
      width: 200,
      render: (email) => <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{email}</span>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => <Tag color={STATUS_COLOR[status]}>{status}</Tag>
    }
  ];

  return (
    <div style={{ padding: '20px', background: 'var(--color-bg-page)' }}>
      <PageHeader
        icon={<Bell size={16} />}
        title="Notification Settings"
        subtitle="Manage email notifications for maintenance, insurance, and warranty alerts"
        actions={<Space><Popconfirm
                title="Run Now"
                description="This will immediately check for overdue maintenance, expiring insurance, and expiring warranties."
                onConfirm={handleRunNow}
                okText="Yes"
                cancelText="No"
              >
                <Button
                  type="primary"
                  style={{ ...primaryBtn, borderRadius: 'var(--radius-md)' }}
                  icon={<Play size={16} />}
                  loading={runLoading}
                >
                  Run Now
                </Button>
              </Popconfirm></Space>}
      />

      {/* SMTP Status Section */}
      <Card style={contentCard} loading={settingsLoading} style={{ ...contentCard, marginBottom: 20 }}>
        <Row gutter={24}>
          <Col xs={24} sm={12}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ marginBottom: 12, fontSize: 15, fontWeight: 600, color: "var(--color-navy-deep)" }}>
                SMTP Configuration
              </div>
              {smtpStatus?.smtp_configured ? (
                <Alert
                  message="SMTP is configured and operational"
                  description={smtpStatus?.message}
                  type="success"
                  style={{ marginBottom: 16 }}
                  icon={<Send size={16} />}
                />
              ) : (
                <Alert
                  message="SMTP not configured"
                  description={smtpStatus?.message || 'Email notifications will be logged to console'}
                  type="warning"
                  style={{ marginBottom: 16 }}
                />
              )}
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div>
              <div style={{ marginBottom: 12, fontSize: 15, fontWeight: 600, color: "var(--color-navy-deep)" }}>
                Test Email
              </div>
              <Button
                type="primary"
                style={{ ...primaryBtn, borderRadius: 'var(--radius-md)' }}
                icon={<Send size={16} />}
                onClick={handleTestEmail}
                loading={testLoading}
                block
              >
                Send Test Email
              </Button>
              <p style={{ marginTop: 8, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                A test email will be sent to your registered email address
              </p>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Notification Log */}
      <Card style={contentCard}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 16, fontSize: 15, fontWeight: 600, color: "var(--color-navy-deep)" }}>
            Notification History
          </div>
        </div>

        <Table scroll={{ x: 'max-content' }}
          dataSource={logs}
          columns={columns}
          loading={loading}
          rowKey="id"
          pagination={{
            current: filters.page,
            pageSize: filters.limit,
            total,
            onChange: (page) => setFilters({ ...filters, page }),
            showSizeChanger: true,
            onShowSizeChange: (_, limit) => setFilters({ ...filters, limit, page: 1 })
          }}
          locale={{ emptyText: 'No notification logs found' }}
          style={{ marginTop: 16 }}
        />
      </Card>

      {/* Info Section */}
      <Card style={{ ...contentCard, marginTop: 20, background: 'var(--color-bg-secondary)' }}>
        <h2 style={{ margin: '0 0 12px', color: 'var(--color-text)' }}>
          About Notifications
        </h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--color-text-muted)', fontSize: '13px', lineHeight: 1.8 }}>
          <li>Overdue Maintenance: Alerts when scheduled maintenance dates have passed</li>
          <li>Expiring Insurance: Notifies when insurance policies expire within 30 days</li>
          <li>Expiring Warranty: Alerts when warranty coverage expires within 30 days</li>
          <li>Notifications are sent daily at 8:00 AM to all client administrators</li>
          <li>Each notification is logged for audit and verification purposes</li>
        </ul>
      </Card>
    </div>
  );
}
