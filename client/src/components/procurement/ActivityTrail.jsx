import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Empty, Space, Spin, Tag, Timeline, Tooltip, Typography } from 'antd';
import { ArrowRight, Clock3, History, MessageSquareText } from 'lucide-react';
import api from '../../utils/api';

/**
 * Activity trail of an AP document (PR, RFQ, quotation, PO, gate entry, GRN, SES, invoice,
 * debit note): for every step, Role Name | User Name, the action, the status it moved to and the
 * date and time. Data comes from /api/workflow-events, recorded by the server for the signed-in
 * user who acted.
 *
 *   <ActivityTrail module="PO" id={po.id} />            full timeline (detail drawers / modals)
 *   const last = useLastActions('PO', rows);            latest event per row, for tables
 *   lastActionColumn('PO', last, { title })             table column showing it, with a history link
 *   <TrailButton module="PO" id={po.id} number="PO-1" /> button that opens the timeline in a drawer
 */

const { Text } = Typography;

const STATUS_LABEL = {
  DRAFT: 'Draft', SUBMITTED: 'Submitted', PENDING_APPROVAL: 'Pending approval', IN_APPROVAL: 'In approval',
  APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled', PO_CREATED: 'PO created',
  PENDING_CONFIGURATION: 'Awaiting approval set-up', ISSUED: 'Issued', PARTIAL_RECEIVED: 'Partly received',
  RECEIVED: 'Received', CLOSED: 'Closed', PARTIAL: 'Partially paid', COMPLETED: 'Completed', QC_COMPLETED: 'QC completed',
  GRN_CREATED: 'GRN created', PENDING_CONFIRMATION: 'Awaiting confirmation', PENDING_REVIEW: 'Awaiting review',
  UNPAID: 'Pending', PAID: 'Paid', EXCEPTION: 'Exception', APPROVED_FOR_PAYMENT: 'Approved for payment',
  WAITING_FOR_PAYMENT: 'Waiting for payment', POSTED: 'Posted', SENT: 'Sent', PARTIALLY_RESPONDED: 'Partly responded',
  NOT_APPROVED: 'Not approved'
};
const STATUS_COLOR = {
  APPROVED: 'success', ISSUED: 'success', RECEIVED: 'success', COMPLETED: 'success', PAID: 'success', APPROVED_FOR_PAYMENT: 'success',
  QC_COMPLETED: 'success', GRN_CREATED: 'success', POSTED: 'success', PO_CREATED: 'cyan',
  REJECTED: 'error', CANCELLED: 'error', EXCEPTION: 'error', NOT_APPROVED: 'error',
  PENDING_APPROVAL: 'processing', IN_APPROVAL: 'processing', SUBMITTED: 'processing', PENDING_REVIEW: 'processing',
  PENDING_CONFIRMATION: 'processing', WAITING_FOR_PAYMENT: 'processing', SENT: 'processing',
  PARTIAL: 'warning', PARTIAL_RECEIVED: 'warning', PENDING_CONFIGURATION: 'warning', PARTIALLY_RESPONDED: 'warning', UNPAID: 'default'
};

export const statusLabel = (s) => (s ? STATUS_LABEL[s] || String(s).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '');
export const StatusTag = ({ status, style }) => (status ? <Tag color={STATUS_COLOR[status] || 'default'} style={{ marginInlineEnd: 0, ...style }}>{statusLabel(status)}</Tag> : null);

export const formatWhen = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Role Name | User Name, side by side. */
export const ActorStamp = ({ event, size = 'default' }) => {
  if (!event) return null;
  const small = size === 'small';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', lineHeight: 1.4 }}>
      <Tag color={event.source === 'SYSTEM' ? 'default' : 'geekblue'} style={{ marginInlineEnd: 0, fontSize: small ? 11 : 12 }}>
        {event.role_name || 'Role not recorded'}
      </Tag>
      <Text type="secondary" style={{ fontSize: small ? 11 : 12 }}>|</Text>
      <Text strong style={{ fontSize: small ? 12 : 13 }}>{event.user_name || 'Unknown user'}</Text>
    </span>
  );
};

const StatusMove = ({ from, to }) => {
  if (!to && !from) return null;
  if (!from || from === to) return <StatusTag status={to || from} />;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <StatusTag status={from} style={{ opacity: 0.75 }} />
      <ArrowRight size={12} color="var(--color-text-secondary, #8c8c8c)" />
      <StatusTag status={to} />
    </span>
  );
};

const detailLine = (details) => {
  if (!details) return null;
  const bits = [];
  if (details.amount != null) bits.push(`Amount ${inr(details.amount)}`);
  if (details.payment_mode) bits.push(details.payment_mode);
  if (details.reference) bits.push(`Ref ${details.reference}`);
  if (details.current_level) bits.push(`Approval level ${details.current_level.from ?? 0} → ${details.current_level.to}`);
  if (details.matching_status) bits.push(`Match: ${statusLabel(details.matching_status.to)}`);
  if (details.exception_status) bits.push(`Exception: ${statusLabel(details.exception_status.to)}`);
  if (details.payment_blocked) bits.push(details.payment_blocked.to ? 'Payment blocked' : 'Payment unblocked');
  if (details.qc_status) bits.push(`QC: ${statusLabel(details.qc_status.to)}`);
  if (details.vendor_id) bits.push('Vendor changed');
  if (Array.isArray(details.vendors) && details.vendors.length) bits.push(`Vendor${details.vendors.length > 1 ? 's' : ''}: ${details.vendors.join(', ')}`);
  return bits.length ? bits.join(' · ') : null;
};

const EventBody = ({ e }) => (
  <div style={{ paddingBottom: 4 }}>
    <ActorStamp event={e} />
    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Text>{e.action}</Text>
      <StatusMove from={e.from_status} to={e.to_status} />
    </div>
    {detailLine(e.details) && <div><Text type="secondary" style={{ fontSize: 12 }}>{detailLine(e.details)}</Text></div>}
    {e.comments && (
      <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <MessageSquareText size={13} style={{ marginTop: 3, flexShrink: 0 }} color="var(--color-text-secondary, #8c8c8c)" />
        <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>{e.comments}</Text>
      </div>
    )}
    <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
      <Clock3 size={12} color="var(--color-text-secondary, #8c8c8c)" />
      <Text type="secondary" style={{ fontSize: 12 }}>{formatWhen(e.occurred_at)}</Text>
      {e.source === 'BACKFILL' && (
        <Tooltip title="Recorded before the activity trail was switched on; the role shown is the person's current role.">
          <Text type="secondary" style={{ fontSize: 11 }}>· earlier record</Text>
        </Tooltip>
      )}
      {e.source === 'EMAIL_LINK' && <Text type="secondary" style={{ fontSize: 11 }}>· via email link</Text>}
    </div>
  </div>
);

const dotColor = (e) => {
  const c = STATUS_COLOR[e.to_status];
  return c === 'error' ? 'red' : c === 'success' ? 'green' : c === 'warning' ? 'orange' : 'blue';
};

/** Full timeline for one document. `refreshKey` reloads it after an action on the page. */
export const ActivityTrail = ({ module, id, refreshKey, title = 'Activity trail', newestFirst = false, emptyText }) => {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!module || !id) return undefined;
    let live = true;
    setEvents(null); setError(null);
    api.get(`/workflow-events/${module}/${id}`)
      .then((res) => { if (live) setEvents(res?.data?.data || []); })
      .catch((err) => { if (live) { setEvents([]); setError(err?.response?.status === 403 ? 'Your role cannot see this activity.' : 'Could not load the activity trail.'); } });
    return () => { live = false; };
  }, [module, id, refreshKey]);

  const list = useMemo(() => (newestFirst ? [...(events || [])].reverse() : events || []), [events, newestFirst]);

  return (
    <div>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 12px' }}>
          <History size={16} color="var(--color-navy, #1f3a5f)" />
          <Text strong>{title}</Text>
          {events && events.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>({events.length} {events.length === 1 ? 'step' : 'steps'})</Text>}
        </div>
      )}
      {events === null ? <Spin size="small" /> : error ? <Text type="secondary">{error}</Text> : !list.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText || 'No activity recorded yet'} />
      ) : (
        <Timeline items={list.map((e) => ({ key: e.id, color: dotColor(e), children: <EventBody e={e} /> }))} />
      )}
    </div>
  );
};

/** Drawer with the full trail. */
export const TrailDrawer = ({ module, id, number, open, onClose }) => (
  <Drawer title={`Activity trail${number ? ` — ${number}` : ''}`} open={open} onClose={onClose} width={480} destroyOnHidden>
    {open && <ActivityTrail module={module} id={id} title={null} />}
  </Drawer>
);

export const TrailButton = ({ module, id, number, label, size = 'small', type = 'text' }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title="Activity trail: who did what, and when">
        <Button size={size} type={type} icon={<History size={15} color="var(--color-navy, #1f3a5f)" />} onClick={(ev) => { ev.stopPropagation(); setOpen(true); }}>{label}</Button>
      </Tooltip>
      <TrailDrawer module={module} id={id} number={number} open={open} onClose={() => setOpen(false)} />
    </>
  );
};

/**
 * Latest event per row: { [id]: event }. Re-fetches when the set of ids changes or `refreshKey` moves.
 */
export const useLastActions = (module, rows, refreshKey) => {
  const [map, setMap] = useState({});
  const ids = useMemo(() => [...new Set((rows || []).map((r) => r?.id).filter(Boolean))].sort((a, b) => a - b), [rows]);
  const key = ids.join(',');
  const load = useCallback(async () => {
    if (!key) { setMap({}); return; }
    const chunks = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    try {
      const parts = await Promise.all(chunks.map((c) => api.get(`/workflow-events/${module}/latest`, { params: { ids: c.join(',') } })));
      setMap(Object.assign({}, ...parts.map((p) => p?.data?.data || {})));
    } catch { setMap({}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, key]);
  useEffect(() => { load(); }, [load, refreshKey]);
  return map;
};

const LastActionCell = ({ module, row, event, numberOf }) => {
  const [open, setOpen] = useState(false);
  const number = numberOf ? numberOf(row) : undefined;
  return (
    <>
      {event ? (
        <div style={{ minWidth: 200, cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); setOpen(true); }} title="Open the activity trail">
          <ActorStamp event={event} size="small" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 12 }}>{event.action}</Text>
            <StatusTag status={event.to_status} style={{ fontSize: 11, lineHeight: '18px' }} />
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>{formatWhen(event.occurred_at)}</Text>
        </div>
      ) : (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={(ev) => { ev.stopPropagation(); setOpen(true); }}>View trail</Button>
      )}
      <TrailDrawer module={module} id={row.id} number={number} open={open} onClose={() => setOpen(false)} />
    </>
  );
};

/** Table column: Role | User, action, status and time of the latest step; click for the full trail. */
export const lastActionColumn = (module, lastMap, { title = 'Last action (Role | User)', numberOf, width = 250 } = {}) => ({
  title,
  key: 'last_action',
  width,
  render: (_, row) => <LastActionCell module={module} row={row} event={lastMap?.[row.id]} numberOf={numberOf} />
});

export default ActivityTrail;
