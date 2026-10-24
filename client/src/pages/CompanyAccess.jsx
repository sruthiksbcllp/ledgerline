import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Empty, Form, Input, Modal, Popconfirm, Row, Select, Space, Table, Tabs, Tag, Tooltip, Typography, message } from 'antd';
import { Building2, Check, Clock3, Globe2, History, Pencil, ShieldCheck, UserMinus, Users, X } from 'lucide-react';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import { getStoredUser, TIER_STYLE } from '../utils/session';

const { Text } = Typography;
const cardStyle = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

const TierTag = ({ tier }) => {
  const s = TIER_STYLE[tier] || TIER_STYLE.EMPLOYEE;
  return <span style={{ color: s.color, background: s.bg, fontWeight: 700, fontSize: 12, padding: '2px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{s.label}</span>;
};

const Person = ({ m }) => (
  <Space size={10}>
    <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--color-bg-subtle, #EEF2FF)', color: '#4F46E5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
      {String(m.name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
    </span>
    <div style={{ lineHeight: 1.3 }}>
      <div style={{ fontWeight: 600 }}>{m.name}</div>
      <Text type="secondary" style={{ fontSize: 12 }}>{m.email}</Text>
    </div>
  </Space>
);

/**
 * Company Admin: who can access this company and with which role, plus requests to join from people
 * on the company's email domain. Everything here is limited to the company currently open.
 */
const CompanyAccess = () => {
  const me = getStoredUser();
  const [overview, setOverview] = useState(null);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('members');
  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [busy, setBusy] = useState(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [approveForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [renameForm] = Form.useForm();
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, mem, reqs, hist] = await Promise.all([
        api.get('/company-access/overview'),
        api.get('/company-access/members'),
        api.get('/company-access/requests'),
        api.get('/company-access/requests', { params: { view: 'history' } })
      ]);
      setOverview(ov?.data?.data || null);
      setMembers(mem?.data?.data || []);
      setRequests(reqs?.data?.data || []);
      setHistory(hist?.data?.data || []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not load company access');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!loading && requests.length && tab === 'members' && !members.length) setTab('requests'); }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleOptions = useMemo(() => {
    const roles = overview?.assignable_roles || [];
    const order = ['COMPANY_ADMIN', 'MANAGER', 'EMPLOYEE'];
    return order.map((tier) => ({
      label: TIER_STYLE[tier]?.label,
      options: roles.filter((r) => r.tier === tier).map((r) => ({ value: r.code, label: r.name, title: r.description }))
    })).filter((g) => g.options.length);
  }, [overview]);

  const act = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      message.success(res?.data?.message || okMsg);
      await load();
      return true;
    } catch (e) {
      message.error(e?.response?.data?.message || 'Something went wrong');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const approve = async (values) => {
    const ok = await act(`approve-${approving.id}`, () => api.post(`/company-access/requests/${approving.id}/approve`, values), 'Approved');
    if (ok) setApproving(null);
  };
  const reject = async (values) => {
    const ok = await act(`reject-${rejecting.id}`, () => api.post(`/company-access/requests/${rejecting.id}/reject`, values), 'Rejected');
    if (ok) setRejecting(null);
  };
  const changeRole = (m, role) => act(`role-${m.id}`, () => api.put(`/company-access/members/${m.id}/role`, { role }), 'Role updated');
  const revoke = (m) => act(`revoke-${m.id}`, () => api.delete(`/company-access/members/${m.id}`), 'Access removed');
  const rename = async (values) => {
    const ok = await act('rename', () => api.put('/company-access/company', values), 'Company renamed');
    if (ok) {
      setRenameOpen(false);
      try {
        const u = getStoredUser();
        if (u) { u.client_name = values.name; localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('client_name', values.name); }
      } catch { /* display only */ }
    }
  };

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? members.filter((m) => `${m.name} ${m.email} ${m.role_name}`.toLowerCase().includes(q)) : members;
  }, [members, search]);

  const memberColumns = [
    { title: 'Member', key: 'person', render: (_, m) => <Person m={m} /> },
    { title: 'Access level', dataIndex: 'tier', render: (t) => <TierTag tier={t} />, filters: ['COMPANY_ADMIN', 'MANAGER', 'EMPLOYEE'].map((t) => ({ text: TIER_STYLE[t].label, value: t })), onFilter: (v, m) => m.tier === v },
    {
      title: 'Role', key: 'role', width: 240,
      render: (_, m) => {
        const self = Number(m.user_id) === Number(me?.id);
        return (
          <Tooltip title={self ? 'You cannot change your own role' : ''}>
            <Select
              size="small"
              value={m.role}
              style={{ width: 210 }}
              disabled={self}
              loading={busy === `role-${m.id}`}
              options={roleOptions}
              onChange={(v) => changeRole(m, v)}
            />
          </Tooltip>
        );
      }
    },
    { title: 'Last opened', dataIndex: 'last_used_at', render: (d) => (d ? when(d) : <Text type="secondary">Never</Text>) },
    {
      title: '', key: 'actions', align: 'right',
      render: (_, m) => (Number(m.user_id) === Number(me?.id)
        ? <Tag>You</Tag>
        : (
          <Popconfirm
            title={`Remove ${m.name}'s access?`}
            description="They are signed out of this company immediately. Their account and their other companies are not affected."
            okText="Remove access"
            okButtonProps={{ danger: true }}
            onConfirm={() => revoke(m)}
          >
            <Button size="small" danger type="text" icon={<UserMinus size={14} />} loading={busy === `revoke-${m.id}`}>Remove</Button>
          </Popconfirm>
        ))
    }
  ];

  const requestColumns = [
    { title: 'Person', key: 'person', render: (_, m) => <Person m={m} /> },
    { title: 'Asked for', key: 'asked', render: (_, m) => (m.requested_role ? <Space size={6}><span>{m.requested_role_name}</span></Space> : '—') },
    { title: 'Message', dataIndex: 'request_note', width: 240, render: (v) => (v ? <Text style={{ maxWidth: 220, display: 'block' }} ellipsis={{ tooltip: v }}>{v}</Text> : <Text type="secondary">—</Text>) },
    { title: 'Requested', dataIndex: 'updated_at', render: when },
    {
      title: '', key: 'actions', align: 'right', fixed: 'right',
      render: (_, m) => (
        <Space>
          <Button size="small" icon={<X size={14} />} onClick={() => { setRejecting(m); rejectForm.resetFields(); }}>Reject</Button>
          <Button size="small" type="primary" icon={<Check size={14} />} onClick={() => { setApproving(m); approveForm.setFieldsValue({ role: m.requested_role || 'REQUESTER', note: '' }); }}>Approve</Button>
        </Space>
      )
    }
  ];

  const historyColumns = [
    { title: 'Person', key: 'person', render: (_, m) => <Person m={m} /> },
    { title: 'Outcome', dataIndex: 'status', render: (s) => (s === 'REJECTED' ? <Tag color="orange">Request rejected</Tag> : <Tag color="red">Access removed</Tag>) },
    { title: 'By', dataIndex: 'decided_by_name', render: (v) => v || '—' },
    { title: 'When', dataIndex: 'decided_at', render: when },
    { title: 'Note', dataIndex: 'decision_note', render: (v) => v || <Text type="secondary">—</Text> }
  ];

  const company = overview?.company;
  const counts = overview?.counts;
  const stat = (label, value, icon, color) => (
    <Card style={cardStyle} styles={{ body: { padding: 18 } }}>
      <Space size={14} align="center">
        <span style={{ width: 42, height: 42, borderRadius: 12, background: `${color}18`, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{value ?? '—'}</div>
          <Text type="secondary" style={{ fontSize: 13 }}>{label}</Text>
        </div>
      </Space>
    </Card>
  );

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<ShieldCheck size={16} />}
        title="Company Access"
        subtitle="Who can open this company, with which role, and requests to join"
        actions={<Button onClick={load} loading={loading}>Refresh</Button>}
      />

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16, borderRadius: 12 }} />}

      <Card style={{ ...cardStyle, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <Row align="middle" justify="space-between" gutter={[16, 12]}>
          <Col>
            <Space size={14} align="center">
              <span style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#4F46E5,#06B6D4)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Building2 size={24} /></span>
              <div>
                <Space size={8}>
                  <span style={{ fontSize: 20, fontWeight: 800 }}>{company?.name || me?.client_name || '—'}</span>
                  <Button type="text" size="small" icon={<Pencil size={14} />} onClick={() => { renameForm.setFieldsValue({ name: company?.name }); setRenameOpen(true); }} />
                </Space>
                <div>
                  {company?.email_domain
                    ? <Text type="secondary"><Globe2 size={13} style={{ verticalAlign: -2 }} /> People with an <b>@{company.email_domain}</b> email can ask to join. You approve each request.</Text>
                    : <Text type="secondary">No email domain is registered, so nobody can ask to join. Add people from User Management.</Text>}
                </div>
              </div>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>{stat('Members', counts?.members, <Users size={20} />, '#4F46E5')}</Col>
        <Col xs={12} md={6}>{stat('Waiting for approval', counts?.pending, <Clock3 size={20} />, '#D97706')}</Col>
        <Col xs={12} md={6}>{stat('Company Admins', counts?.by_tier?.COMPANY_ADMIN, <ShieldCheck size={20} />, TIER_STYLE.COMPANY_ADMIN.color)}</Col>
        <Col xs={12} md={6}>{stat('Managers · Employees', counts ? `${counts.by_tier?.MANAGER || 0} · ${counts.by_tier?.EMPLOYEE || 0}` : null, <Users size={20} />, TIER_STYLE.MANAGER.color)}</Col>
      </Row>

      <Card style={cardStyle} styles={{ body: { padding: '4px 20px 20px' } }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          tabBarExtraContent={tab === 'members' ? <Input.Search allowClear placeholder="Search members" style={{ width: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} /> : null}
          items={[
            {
              key: 'members',
              label: <Space size={6}><Users size={15} />Members</Space>,
              children: <Table rowKey="id" loading={loading} dataSource={filteredMembers} columns={memberColumns} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
            },
            {
              key: 'requests',
              label: <Space size={6}><Clock3 size={15} />Requests <Badge count={requests.length} size="small" /></Space>,
              children: requests.length || loading
                ? <Table rowKey="id" loading={loading} dataSource={requests} columns={requestColumns} pagination={false} scroll={{ x: 'max-content' }} />
                : <Empty style={{ padding: 32 }} description="No requests waiting. People on your email domain can ask to join from their company picker." />
            },
            {
              key: 'history',
              label: <Space size={6}><History size={15} />History</Space>,
              children: <Table rowKey="id" loading={loading} dataSource={history} columns={historyColumns} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: 'No rejected requests or removed members yet' }} scroll={{ x: 'max-content' }} />
            }
          ]}
        />
      </Card>

      <Modal open={!!approving} title={approving ? `Approve ${approving.name}` : ''} okText="Approve" onOk={() => approveForm.submit()} confirmLoading={busy?.startsWith('approve')} onCancel={() => setApproving(null)} destroyOnHidden>
        <Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>
          {approving?.email} asked for <b>{approving?.requested_role_name || 'access'}</b>. Choose the role they get in {company?.name}.
        </Text>
        <Form form={approveForm} layout="vertical" onFinish={approve}>
          <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Choose a role' }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item name="note" label="Note (optional, kept in the history)">
            <Input maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={!!rejecting} title={rejecting ? `Reject ${rejecting.name}'s request` : ''} okText="Reject" okButtonProps={{ danger: true }} onOk={() => rejectForm.submit()} confirmLoading={busy?.startsWith('reject')} onCancel={() => setRejecting(null)} destroyOnHidden>
        <Form form={rejectForm} layout="vertical" onFinish={reject}>
          <Form.Item name="note" label="Reason (optional, kept in the history)">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={renameOpen} title="Rename company" okText="Save" onOk={() => renameForm.submit()} confirmLoading={busy === 'rename'} onCancel={() => setRenameOpen(false)} destroyOnHidden>
        <Form form={renameForm} layout="vertical" onFinish={rename}>
          <Form.Item name="name" label="Company name" rules={[{ required: true, min: 2, max: 150 }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CompanyAccess;
