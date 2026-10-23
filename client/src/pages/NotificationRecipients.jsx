import React, { useEffect, useState } from 'react';
import { Card, Table, Switch, Button, message, Empty } from 'antd';
import { Bell, Save } from 'lucide-react';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };

const NotificationRecipients = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notification-settings/recipients');
      const list = normalizeResponse(res);
      setUsers(list);
      const map = {};
      list.forEach((u) => { map[u.id] = !!u.receive_notifications; });
      setSelected(map);
    } catch { message.error('Failed to load users'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggle = (id, val) => setSelected((prev) => ({ ...prev, [id]: val }));

  const save = async () => {
    setSaving(true);
    try {
      const user_ids = Object.keys(selected).filter((id) => selected[id]).map(Number);
      await api.put('/notification-settings/recipients', { user_ids });
      message.success('Notification recipients saved');
      load();
    } catch (err) { message.error(err?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const anySelected = Object.values(selected).some(Boolean);

  const columns = [
    { title: 'Name', key: 'name', render: (_, r) => ((r.first_name || '') + ' ' + (r.last_name || '')).trim() || '-' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Receives notifications', key: 'recv', width: 190, render: (_, r) => <Switch checked={!!selected[r.id]} onChange={(v) => toggle(r.id, v)} /> }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<Bell size={16} />}
        title="Notification Recipients"
        subtitle="Choose who receives email alerts & the daily digest"
        actions={<Button type="primary" icon={<Save size={16} />} loading={saving} onClick={save}>Save</Button>}
      />
      {!anySelected && (
        <div style={{ margin: '0 0 12px', color: 'var(--color-text-muted)', fontSize: 13 }}>
          No recipients selected — <b>no one will receive</b> email alerts or the daily digest. Select users below to enable notifications.
        </div>
      )}
      <Card style={contentCard} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          size="middle"
          locale={{ emptyText: <Empty description="No users found" style={{ margin: '40px 0' }} /> }}
          pagination={{ showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], pageSize: 25, showTotal: (t) => 'Total: ' + t + ' users' }}
        />
      </Card>
    </div>
  );
};

export default NotificationRecipients;
