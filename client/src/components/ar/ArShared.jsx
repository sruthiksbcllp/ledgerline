import React, { useEffect, useState } from 'react';
import { Button, Card, Col, List, Modal, Row, Space, Tag, Typography } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { getStoredUser } from '../../utils/session';
import { canSeePath } from '../../config/rbac';
import { AR_STEPS, card, inr } from '../../utils/arFlow';

const { Text } = Typography;

/** The nine AR steps as a strip; `active` (step keys) marks the steps this page covers. */
export const ArFlow = ({ active = [] }) => {
  const navigate = useNavigate();
  const role = getStoredUser()?.role;
  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 18, alignItems: 'center', overflowX: 'auto', whiteSpace: 'nowrap', padding: '0 4px 6px', marginBottom: 10, fontSize: 12.5 }}>
      {AR_STEPS.map((s) => {
        const on = active.includes(s.key);
        const allowed = canSeePath(role, s.path.split('?')[0]);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => allowed && navigate(s.path)}
            title={`Mirrors in AP: ${s.ap}`}
            style={{
              flex: '0 0 auto', padding: '2px 0', border: 'none', background: 'none', cursor: allowed ? 'pointer' : 'default',
              color: on ? 'var(--color-primary, #4F46E5)' : 'var(--color-text-secondary, #667085)', fontWeight: on ? 700 : 400,
              borderBottom: `2px solid ${on ? 'var(--color-primary, #4F46E5)' : 'transparent'}`, opacity: allowed ? 1 : 0.6,
            }}
          >
            {s.n}. {s.label}
          </button>
        );
      })}
    </div>
  );
};

export const PageHeader = ({ icon, title, subtitle, actions }) => (
  <Card style={{ ...card, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
    <Row justify="space-between" align="middle" gutter={[16, 16]}>
      <Col>
        <Space size={16}>
          <div className="page-header-icon">{icon}</div>
          <div>
            <h2 className="page-header-title">{title}</h2>
            <Text type="secondary">{subtitle}</Text>
          </div>
        </Space>
      </Col>
      <Col><Space wrap>{actions}</Space></Col>
    </Row>
  </Card>
);

export const Tiles = ({ tiles }) => (
  <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
    {tiles.map((t) => (
      <Col xs={12} lg={Math.floor(24 / tiles.length)} key={t.label}>
        <Card style={card} styles={{ body: { padding: '14px 18px' } }}>
          <Text type="secondary">{t.label}</Text>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{t.value}</div>
          <Text type={t.alert ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{t.sub}</Text>
        </Card>
      </Col>
    ))}
  </Row>
);

const STATUS = {
  // customers
  PENDING: { color: 'gold', label: 'Waiting for verification' },
  ACTIVE: { color: 'success', label: 'Active' },
  ON_HOLD: { color: 'error', label: 'On hold' },
  REJECTED: { color: 'default', label: 'Rejected' },
  // orders
  QUOTATION: { color: 'default', label: 'Quotation' },
  CREDIT_HOLD: { color: 'error', label: 'Credit hold' },
  CONFIRMED: { color: 'processing', label: 'Confirmed' },
  PARTIALLY_DELIVERED: { color: 'warning', label: 'Partly delivered' },
  DELIVERED: { color: 'purple', label: 'Delivered' },
  CLOSED: { color: 'success', label: 'Invoiced' },
  CANCELLED: { color: 'default', label: 'Cancelled' },
  // deliveries
  DISPATCHED: { color: 'processing', label: 'In transit' },
  // promises, unapplied cash
  OPEN: { color: 'processing', label: 'Open' },
  KEPT: { color: 'success', label: 'Kept' },
  BROKEN: { color: 'error', label: 'Broken' },
  APPLIED: { color: 'success', label: 'Applied' },
  // invoices
  UNPAID: { color: 'default', label: 'Unpaid' },
  PARTIALLY_PAID: { color: 'warning', label: 'Partially paid' },
  PAID: { color: 'success', label: 'Paid' },
  WRITTEN_OFF: { color: 'volcano', label: 'Written off' },
  // credit notes, write-offs, provisions, journals (maker-checker)
  PENDING_APPROVAL: { color: 'gold', label: 'Waiting for approval' },
  APPROVED: { color: 'success', label: 'Approved' },
  POSTED: { color: 'success', label: 'Posted' },
  // month close
  SIGNED_OFF: { color: 'success', label: 'Signed off' },
  REOPENED: { color: 'warning', label: 'Reopened' },
  // statements
  EMAILED: { color: 'success', label: 'Emailed' },
  NOT_SENT: { color: 'default', label: 'Recorded, not emailed' },
  AGREED: { color: 'success', label: 'Agreed' },
  DISPUTED: { color: 'error', label: 'Disputed' },
};
const KIND = {
  delivery: { DELIVERED: { color: 'success', label: 'Delivered' } },
  close: { OPEN: { color: 'processing', label: 'Open' }, CLOSED: { color: 'gold', label: 'Closed, waiting for sign-off' } },
  credit: { PENDING_APPROVAL: { color: 'gold', label: 'In dispute: waiting for approval' }, REJECTED: { color: 'default', label: 'Rejected: no credit' }, CANCELLED: { color: 'default', label: 'Withdrawn' } },
  statement: { PENDING: { color: 'processing', label: 'Waiting for reply' } },
};
export const ArStatus = ({ status, kind }) => {
  const s = KIND[kind]?.[status] || STATUS[status] || { color: 'default', label: status };
  return <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.label}</Tag>;
};

/** History actions in plain words (AR only; AP pages keep their own labels). */
const ACTION_LABEL = {
  AR_CUSTOMER_CREATED: 'Customer added', AR_CUSTOMER_UPDATED: 'Customer changed', AR_CUSTOMER_VERIFIED: 'Customer verified',
  AR_CUSTOMER_REJECTED: 'Customer rejected', AR_CUSTOMER_ON_HOLD: 'Put on hold', AR_CUSTOMER_HOLD_RELEASED: 'Hold removed',
  AR_QUOTATION_CREATED: 'Quotation saved', AR_QUOTATION_UPDATED: 'Quotation changed', AR_ORDER_CONFIRMED: 'Confirmed as order: credit check passed',
  AR_ORDER_CREDIT_HOLD: 'Stopped at the credit check', AR_ORDER_CREDIT_RELEASED: 'Released from credit hold', AR_ORDER_CANCELLED: 'Cancelled',
  AR_DELIVERY_DISPATCHED: 'Dispatched', AR_DELIVERY_CONFIRMED: 'Proof of delivery recorded', AR_DELIVERY_CANCELLED: 'Delivery cancelled',
  AR_INVOICE_POSTED: 'Invoice posted', AR_RECEIPT_RECORDED: 'Payment received', AR_INVOICE_PAID: 'Paid in full', AR_INVOICE_CANCELLED: 'Cancelled',
  AR_REMINDER_SENT: 'Reminder sent', AR_PROMISE_RECORDED: 'Promise to pay recorded', AR_EINVOICE_UPDATED: 'e-invoice details saved',
  AR_DISPUTE_OPENED: 'Dispute opened', AR_DISPUTE_CLOSED: 'Dispute closed', AR_CREDIT_NOTE_REQUESTED: 'Credit note requested',
  AR_CREDIT_NOTE_APPROVED: 'Credit note approved and posted', AR_CREDIT_NOTE_REJECTED: 'Credit note rejected', AR_CREDIT_NOTE_WITHDRAWN: 'Credit note withdrawn',
  AR_WRITE_OFF_REQUESTED: 'Write-off requested', AR_WRITE_OFF_APPROVED: 'Written off', AR_WRITE_OFF_REJECTED: 'Write-off rejected',
  AR_WRITE_OFF_WITHDRAWN: 'Write-off withdrawn', AR_WRITE_OFF_RECOVERED: 'Recovery: receivable reinstated',
  AR_UNAPPLIED_RECEIVED: 'Kept as unapplied cash', AR_UNAPPLIED_APPLIED: 'Unapplied cash applied',
  AR_ECL_PREPARED: 'Credit-loss provision prepared', AR_ECL_POSTED: 'Credit-loss provision posted', AR_ECL_REJECTED: 'Credit-loss provision rejected',
  AR_ECL_SETTINGS_SAVED: 'Loss rates reviewed', AR_PERIOD_CLOSED: 'Month closed', AR_PERIOD_SIGNED_OFF: 'Month signed off', AR_PERIOD_REOPENED: 'Month reopened',
  AR_STATEMENT_AGREED: 'Customer agreed the balance', AR_STATEMENT_DISPUTED: 'Customer disputed the balance', AR_STATEMENTS_SENT: 'Statements sent',
};
// eslint-disable-next-line react-refresh/only-export-components
export const actionLabel = (code) => ACTION_LABEL[code] || String(code || '').replace(/^AR_/, '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** History entries for an antd Timeline, with plain-word actions. */
// eslint-disable-next-line react-refresh/only-export-components
export const arHistoryItems = (history = []) => history.map((h) => ({
  key: h.id,
  children: (
    <div>
      <Text strong>{actionLabel(h.action)}</Text>
      <div><Text type="secondary" style={{ fontSize: 12 }}>{h.user} · {new Date(h.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</Text></div>
      {h.note && <div style={{ fontSize: 13 }}>{h.note}</div>}
    </div>
  ),
}));

/**
 * The server refuses a payment whose bank reference (UTR / cheque no.) was already recorded, since
 * it is most likely the same money entered twice. This asks the user; true means "record it again".
 * Returns null when the error is something else.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const confirmDuplicateReference = (e) => {
  if (e?.response?.status !== 409 || e?.response?.data?.code !== 'DUPLICATE_REFERENCE') return null;
  return new Promise((resolve) => {
    Modal.confirm({
      title: 'This reference is already recorded',
      content: e.response.data.message,
      okText: 'It is a different payment, record it',
      cancelText: 'Go back',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
};

/** A page path plus `open=<id>`, so the page opens that record (see useOpenParam). */
// eslint-disable-next-line react-refresh/only-export-components
export const openLink = (path, id) => `${path}${path.includes('?') ? '&' : '?'}open=${encodeURIComponent(id)}`;

/**
 * Opens the record named by `?open=<id>` in the address (set by "Waiting for you" → Open), then
 * removes `open` from the address and keeps any other parameter (such as `tab`).
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useOpenParam = (onOpen) => {
  const [params, setParams] = useSearchParams();
  const id = params.get('open');
  useEffect(() => {
    if (!id) return;
    onOpen(id);
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
};

/**
 * "Waiting for you": AR items the signed-in person may decide (customers to verify, credit holds,
 * credit notes, write-offs, provisions, the month close, manual journals). Items waiting 2 days or
 * more are marked: they have been escalated by email. `kinds` limits it to some kinds.
 */
export const ArTasks = ({ kinds = null, refreshKey = 0 }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  useEffect(() => {
    let live = true;
    api.get('/ar/tasks').then((r) => { if (live) setItems(r?.data?.data || []); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [refreshKey]);
  const shown = kinds ? items.filter((i) => kinds.includes(i.kind)) : items;
  if (!shown.length) return null;
  return (
    <Card size="small" style={{ ...card, marginBottom: 16, borderColor: 'var(--color-warning, #f59e0b)' }} title={`Waiting for you (${shown.length})`}>
      <List
        size="small"
        dataSource={shown.slice(0, 8)}
        renderItem={(i) => (
          <List.Item
            actions={[<Button key="open" size="small" type="link" onClick={() => navigate(openLink(i.path, i.id))}>Open</Button>]}
          >
            <Space wrap size={8}>
              <Text strong>{i.title}</Text>
              {i.detail && <Text type="secondary">{i.detail}</Text>}
              {i.amount !== null && i.amount !== undefined && <Text>{inr(i.amount)}</Text>}
              {i.escalated ? <Tag color="red">Waiting {i.age_days} days: escalated</Tag> : <Tag>{i.age_days ? `${i.age_days} day${i.age_days === 1 ? '' : 's'}` : 'Today'}</Tag>}
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
};

const STAGE_COLOR = { UPCOMING: 'blue', FIRST: 'gold', SECOND: 'orange', FINAL: 'volcano', ESCALATED: 'red' };
export const StageTag = ({ stage, label }) => (stage ? <Tag color={STAGE_COLOR[stage]} style={{ marginInlineEnd: 0 }}>{label}</Tag> : <Text type="secondary">—</Text>);

/** Journal lines as a small Dr / Cr table. */
export const JournalLines = ({ lines = [] }) => (
  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
    <thead>
      <tr style={{ textAlign: 'left', color: 'var(--color-text-secondary, #667)' }}>
        <th style={{ padding: '4px 8px' }}>Account</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Debit</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Credit</th>
      </tr>
    </thead>
    <tbody>
      {lines.map((l, i) => {
        const debit = Number(l.debit) > 0;
        return (
          <tr key={l.id || i} style={{ borderTop: '1px solid var(--color-border)' }}>
            <td style={{ padding: '4px 8px', paddingLeft: debit ? 8 : 28 }}>{debit ? 'Dr' : 'Cr'} {l.account_code || l.account} · {l.account_name || l.accountName}</td>
            <td style={{ padding: '4px 8px', textAlign: 'right' }}>{debit ? inr(l.debit) : ''}</td>
            <td style={{ padding: '4px 8px', textAlign: 'right' }}>{debit ? '' : inr(l.credit)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);
