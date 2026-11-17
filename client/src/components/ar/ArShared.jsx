import React from 'react';
import { Card, Col, Row, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getStoredUser } from '../../utils/session';
import { canSeePath } from '../../config/rbac';
import { AR_STEPS, card, inr } from '../../utils/arFlow';

const { Text } = Typography;

/** The nine AR steps as a strip; `active` (step keys) marks the steps this page covers. */
export const ArFlow = ({ active = [] }) => {
  const navigate = useNavigate();
  const role = getStoredUser()?.role;
  return (
    <Card style={{ ...card, marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'stretch' }}>
        {AR_STEPS.map((s, i) => {
          const on = active.includes(s.key);
          const allowed = canSeePath(role, s.path.split('?')[0]);
          return (
            <React.Fragment key={s.key}>
              <button
                type="button"
                onClick={() => allowed && navigate(s.path)}
                title={`Mirrors in AP: ${s.ap}`}
                style={{
                  flex: '1 1 112px', minWidth: 104, textAlign: 'left', cursor: allowed ? 'pointer' : 'default', padding: '8px 10px', borderRadius: 10,
                  border: `1px solid ${on ? '#1E3A5F' : '#D6E2F0'}`, background: on ? '#1E3A5F' : '#EEF3FA', color: on ? '#fff' : '#1E3A5F',
                  opacity: allowed ? 1 : 0.6, lineHeight: 1.25,
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.75 }}>Step {s.n}</div>
                <div style={{ fontSize: 12.5, fontWeight: 650 }}>{s.label}</div>
              </button>
              {i < AR_STEPS.length - 1 && <span style={{ alignSelf: 'center', color: '#8FA3BC' }}>→</span>}
            </React.Fragment>
          );
        })}
      </div>
    </Card>
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
  // promises
  OPEN: { color: 'processing', label: 'Open' },
  KEPT: { color: 'success', label: 'Kept' },
  BROKEN: { color: 'error', label: 'Broken' },
};
export const ArStatus = ({ status, kind }) => {
  const s = (kind === 'delivery' && status === 'DELIVERED') ? { color: 'success', label: 'Delivered' } : STATUS[status] || { color: 'default', label: status };
  return <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.label}</Tag>;
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
