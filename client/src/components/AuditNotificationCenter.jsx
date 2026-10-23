import React, { useState, useEffect } from 'react';
import { List, Badge, Typography, Tag, Button, Card, Space, Empty } from 'antd';
import { Bell, AlertCircle, AlertTriangle, CheckCircle, Info, Calendar } from 'lucide-react';
import api from '../utils/api';

const { Text, Title } = Typography;

const AuditNotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const response = await api.get('/audit-sessions/notifications');
      setNotifications(response.data || []);
    } catch {
      /* non-critical — notifications are advisory */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  const markRead = async (id) => {
    try {
      await api.post(`/audit-sessions/notifications/${id}/read`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {
      /* non-critical — badge will self-correct on next poll */
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'CRITICAL': return <AlertCircle size={18} color="#f5222d" />;
      case 'WARNING': return <AlertTriangle size={18} color="#faad14" />;
      case 'INFO': return <Info size={18} color="#1677ff" />;
      case 'REMINDER': return <Calendar size={18} color="#1677ff" />;
      default: return <Bell size={18} />;
    }
  };

  return (
    <Card 
      title={<Space><Bell size={20} /> <Text strong>Audit Intelligence Alerts</Text></Space>}
      extra={<Badge count={notifications.length} style={{ backgroundColor: '#f5222d' }} />}
      style={{ borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', overflow: 'hidden' }}
      styles={{ body: { padding: 0 } }}
    >
      <List
        loading={loading}
        dataSource={notifications}
        locale={{ emptyText: <Empty description="All caught up! No active compliance alerts." style={{ padding: '24px' }} /> }}
        renderItem={(item) => (
          <List.Item 
            style={{ 
              padding: '16px 24px', 
              borderLeft: `4px solid ${item.type === 'CRITICAL' ? '#f5222d' : (item.type === 'WARNING' ? '#faad14' : '#1677ff')}`,
              background: item.type === 'CRITICAL' ? '#fff1f0' : '#fff'
            }}
            actions={[
              <Button type="link" size="small" onClick={() => markRead(item.id)}>Acknowledge</Button>
            ]}
          >
            <List.Item.Meta
              avatar={getIcon(item.type)}
              title={
                <Space>
                  <Text strong>{item.type}</Text>
                  <Tag color={item.type === 'CRITICAL' ? 'error' : (item.type === 'WARNING' ? 'warning' : 'blue')}>
                    {item.AuditSession?.audit_name || 'SYSTEM'}
                  </Tag>
                </Space>
              }
              description={
                <div>
                  <Text style={{ fontSize: 13, color: '#4b5563', display: 'block', marginBottom: 4 }}>{item.message}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{new Date(item.createdAt).toLocaleString()}</Text>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default AuditNotificationCenter;
