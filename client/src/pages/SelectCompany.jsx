import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Form, Input, Modal, Popconfirm, Select, Skeleton, Tag, Tooltip, message } from 'antd';
import { ArrowRight, Building2, Clock3, Globe2, LayoutGrid, LogOut, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import Logo from '../components/base/Logo';
import { logout, sessionChanged } from '../store/authSlice';
import { getStoredUser, reloadInto, storeSession, TIER_STYLE } from '../utils/session';
import './SelectCompany.css';

const AVATAR_COLORS = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DB2777', '#7C3AED', '#2563EB', '#0F766E'];
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const colorFor = (id) => AVATAR_COLORS[Math.abs(Number(id) || 0) % AVATAR_COLORS.length];
const ago = (d) => {
  if (!d) return null;
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days} d ago` : new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' });
};

const TierBadge = ({ tier, roleName }) => {
  const s = TIER_STYLE[tier] || TIER_STYLE.EMPLOYEE;
  const showRole = roleName && roleName !== s.label;
  return (
    <span className="sc-tier" style={{ color: s.color, background: s.bg }}>
      {s.label}{showRole ? <span className="sc-tier-role"> · {roleName}</span> : null}
    </span>
  );
};

/**
 * Shown after sign-in: pick the company to work in. Lists the companies this person can enter,
 * requests waiting for approval, and companies on their work email domain they can ask to join.
 * Super Admins see every company plus the platform view.
 */
const SelectCompany = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [entering, setEntering] = useState(null);
  const [query, setQuery] = useState('');
  const [requestFor, setRequestFor] = useState(null);
  const [sending, setSending] = useState(false);
  const [form] = Form.useForm();
  const notice = new URLSearchParams(location.search).get('notice');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/auth/workspaces');
      setData(res?.data?.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not load your companies');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const enter = async (target) => {
    setEntering(target);
    try {
      const res = await api.post(`/auth/workspaces/${target}/enter`);
      const { token, user: sessionUser } = res?.data?.data || {};
      storeSession(token, sessionUser);
      dispatch(sessionChanged({ token, user: sessionUser }));
      // Full reload: nothing from the previously opened company stays in memory.
      reloadInto(location.state?.from && location.state.from !== '/select-company' ? location.state.from : '/');
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not open that company');
      setEntering(null);
      load();
    }
  };

  const sendRequest = async (values) => {
    setSending(true);
    try {
      const res = await api.post(`/auth/workspaces/${requestFor.client_id}/request`, { role: values.role, note: values.note });
      message.success(res?.data?.message || 'Request sent');
      setRequestFor(null);
      form.resetFields();
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not send the request');
    } finally {
      setSending(false);
    }
  };

  const withdraw = async (clientId) => {
    try {
      await api.delete(`/auth/workspaces/${clientId}/request`);
      message.success('Request withdrawn');
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not withdraw the request');
    }
  };

  const signOut = async () => {
    await dispatch(logout());
    navigate('/login', { replace: true });
  };

  const companies = useMemo(() => {
    const list = data?.companies || [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((c) => `${c.name} ${c.email_domain || ''}`.toLowerCase().includes(q)) : list;
  }, [data, query]);

  const isSuper = Boolean(data?.is_super_admin);
  const current = data?.current_client_id;
  const domain = String(data?.email || user?.email || '').split('@')[1] || '';
  const nothingAtAll = data && !isSuper && !data.companies.length && !data.pending.length && !data.joinable.length;
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || '';

  return (
    <div className="sc-root">
      <header className="sc-top">
        <Logo dark size="34px" fontSize="19px" subFontSize="10px" />
        <div className="sc-top-right">
          <div className="sc-user">
            <span className="sc-user-avatar">{initials(displayName)}</span>
            <div className="sc-user-text">
              <strong>{displayName}</strong>
              <span>{data?.email || user?.email}</span>
            </div>
          </div>
          <Button icon={<LogOut size={15} />} onClick={signOut}>Sign out</Button>
        </div>
      </header>

      <main className="sc-main">
        <div className="sc-head">
          <div>
            <h1>{isSuper ? 'Choose a company to manage' : 'Choose your company'}</h1>
            <p>
              {isSuper
                ? 'As Super Admin you can open any company, or use the platform view to manage all of them.'
                : 'Your data is kept separate for each company. Pick the one you want to work in; you can switch any time from the top bar.'}
            </p>
          </div>
          {(isSuper || (data?.companies?.length || 0) > 6) && (
            <Input
              allowClear
              size="large"
              className="sc-search"
              prefix={<Search size={16} color="#94a3b8" />}
              placeholder="Search companies"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </div>

        {notice === 'access-changed' && (
          <Alert className="sc-alert" type="warning" showIcon message="Your access changed" description="A company admin changed or removed your access to the company you were in. Choose a company to continue." />
        )}
        {error && <Alert className="sc-alert" type="error" showIcon message={error} action={<Button size="small" onClick={load}>Retry</Button>} />}

        {loading && !data && (
          <div className="sc-grid">{[0, 1, 2].map((i) => <div key={i} className="sc-card sc-card-skel"><Skeleton active avatar paragraph={{ rows: 1 }} /></div>)}</div>
        )}

        {data && (
          <>
            {isSuper && !query && (
              <button type="button" className="sc-platform" onClick={() => enter('platform')} disabled={!!entering}>
                <span className="sc-platform-icon"><LayoutGrid size={22} /></span>
                <span className="sc-platform-text">
                  <strong>Platform view</strong>
                  <span>All companies, company onboarding, licences and platform settings</span>
                </span>
                {data && user?.platform_view && <Tag color="purple">Current</Tag>}
                <span className="sc-go">{entering === 'platform' ? <span className="sc-spinner" /> : <ArrowRight size={18} />}</span>
              </button>
            )}

            {(companies.length > 0 || isSuper) && (
              <section>
                <h2 className="sc-section-title"><Building2 size={16} /> {isSuper ? `All companies (${data.companies.length})` : 'Your companies'}</h2>
                {companies.length === 0 ? (
                  <Empty description="No companies match your search" />
                ) : (
                  <div className="sc-grid">
                    {companies.map((c) => {
                      const isCurrent = !user?.platform_view && Number(current) === Number(c.client_id);
                      return (
                        <button
                          type="button"
                          key={c.client_id}
                          className={`sc-card ${isCurrent ? 'sc-card-current' : ''}`}
                          onClick={() => enter(c.client_id)}
                          disabled={!!entering}
                        >
                          <span className="sc-avatar" style={{ background: colorFor(c.client_id) }}>{initials(c.name)}</span>
                          <span className="sc-card-body">
                            <span className="sc-card-name" title={c.name}>{c.name}</span>
                            {c.email_domain && <span className="sc-card-domain"><Globe2 size={12} /> {c.email_domain}</span>}
                            <span className="sc-card-meta">
                              <TierBadge tier={c.tier} roleName={isSuper ? null : c.role_name} />
                              {isCurrent && <Tag color="blue" className="sc-current-tag">Current</Tag>}
                              {isSuper
                                ? <span className="sc-muted">{c.members} member{c.members === 1 ? '' : 's'}</span>
                                : c.last_used_at && <span className="sc-muted">Opened {ago(c.last_used_at)}</span>}
                            </span>
                          </span>
                          <span className="sc-go">{entering === c.client_id ? <span className="sc-spinner" /> : <ArrowRight size={18} />}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {data.pending.length > 0 && (
              <section>
                <h2 className="sc-section-title"><Clock3 size={16} /> Waiting for approval</h2>
                <div className="sc-grid">
                  {data.pending.map((p) => (
                    <div key={p.client_id} className="sc-card sc-card-static">
                      <span className="sc-avatar sc-avatar-muted">{initials(p.name)}</span>
                      <span className="sc-card-body">
                        <span className="sc-card-name" title={p.name}>{p.name}</span>
                        <span className="sc-muted">Requested {ago(p.requested_at)}. A company admin will review it; check back here once approved.</span>
                      </span>
                      <Popconfirm title="Withdraw this request?" okText="Withdraw" onConfirm={() => withdraw(p.client_id)}>
                        <Button size="small">Withdraw</Button>
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.joinable.length > 0 && (
              <section>
                <h2 className="sc-section-title"><UserPlus size={16} /> Companies on your email domain{domain ? ` (@${domain})` : ''}</h2>
                <div className="sc-grid">
                  {data.joinable.map((j) => (
                    <div key={j.client_id} className="sc-card sc-card-static">
                      <span className="sc-avatar" style={{ background: colorFor(j.client_id), opacity: 0.85 }}>{initials(j.name)}</span>
                      <span className="sc-card-body">
                        <span className="sc-card-name" title={j.name}>{j.name}</span>
                        <span className="sc-muted">
                          {j.previously_rejected ? 'An earlier request was declined. You can ask again.' : 'Registered to your work email domain. An admin approves new members.'}
                        </span>
                      </span>
                      <Button type="primary" onClick={() => { setRequestFor(j); form.setFieldsValue({ role: 'REQUESTER', note: '' }); }}>Request access</Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {nothingAtAll && (
              <div className="sc-empty">
                <ShieldCheck size={36} color="#6366F1" />
                <h3>You are not part of a company yet</h3>
                <p>
                  {domain && ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain.toLowerCase())
                    ? 'You signed in with a personal email address. Ask your company admin to add you, or sign up with your work email.'
                    : 'Ask your company admin to add you. If your company uses LedgerLine with your email domain, it will appear here so you can request access.'}
                </p>
                <Button onClick={load}>Check again</Button>
              </div>
            )}
          </>
        )}
      </main>

      <Modal
        open={!!requestFor}
        title={requestFor ? `Request access to ${requestFor.name}` : ''}
        okText="Send request"
        confirmLoading={sending}
        onOk={() => form.submit()}
        onCancel={() => setRequestFor(null)}
        destroyOnHidden
      >
        <p className="sc-modal-intro">A company admin reviews your request and decides your role. You will see the company here once you are approved.</p>
        <Form form={form} layout="vertical" onFinish={sendRequest} initialValues={{ role: 'REQUESTER' }}>
          <Form.Item name="role" label="Role you need" rules={[{ required: true, message: 'Choose a role' }]}>
            <Select
              options={(data?.requestable_roles || []).map((r) => ({
                value: r.code,
                label: (
                  <span className="sc-role-opt">
                    {r.name}
                    <Tooltip title={TIER_STYLE[r.tier]?.label}><span className="sc-role-tier" style={{ color: TIER_STYLE[r.tier]?.color }}>{TIER_STYLE[r.tier]?.label}</span></Tooltip>
                  </span>
                )
              }))}
            />
          </Form.Item>
          <Form.Item name="note" label="Message to the admin">
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="e.g. I joined the finance team this week" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SelectCompany;
