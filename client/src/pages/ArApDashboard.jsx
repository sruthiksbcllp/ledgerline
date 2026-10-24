import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, DatePicker, Drawer, Empty, Progress, Row, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCircle2, Download, FilePlus2, Hourglass,
  LayoutDashboard, NotebookPen, RefreshCcw, Scale, UserPlus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import api from '../utils/api';
import { canSee, getStoredUser, hasPerm } from '../utils/session';
import {
  ageingBucket, daysPastDue, dueDate, invoiceDate, inr, journalFor, loadApInvoices, num, vendorName,
} from '../utils/apLedger';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const card = {
  borderRadius: 16,
  border: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-card)',
  background: 'var(--color-bg-card, #fff)',
  height: '100%',
};

// Series identity: receivables and payables keep the same hue everywhere on this page.
// Categorical slots 1-2 (blue/orange), validated for CVD separation on the white card.
// Status colours (good/critical) are reserved for state chips and always ship with an icon.
const AR_COLOR = '#2a78d6';
const AP_COLOR = '#eb6834';
const INK = { primary: 'var(--color-text-primary, #0F172A)', secondary: 'var(--color-text-secondary, #374151)', muted: '#6B7280' };
const GRID = '#EEF0F4';
const AXIS = '#CBD5E1';
const STATUS = { good: '#0ca30c', warning: '#b97a00', critical: '#d03b3b' };

/** ₹12.5L / ₹1.2Cr / ₹45K - compact Indian notation for axes and tiles. */
const compactInr = (value) => {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const trim = (x) => String(Number(x.toFixed(abs >= 1e7 ? 2 : 1)));
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
};

const Swatch = ({ color, size = 10 }) => (
  <span style={{ display: 'inline-block', width: size, height: size, borderRadius: 3, background: color, flexShrink: 0 }} />
);

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${AXIS}`, borderRadius: 10, padding: '10px 12px', boxShadow: '0 8px 24px rgba(15,23,42,0.12)', minWidth: 170 }}>
      <div style={{ color: INK.muted, fontSize: 12, marginBottom: 6 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: INK.primary, lineHeight: '22px' }}>
          <Swatch color={entry.color} />
          <span style={{ flex: 1, color: INK.secondary }}>{entry.name}</span>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(entry.value)}</strong>
        </div>
      ))}
    </div>
  );
};

const Sparkline = ({ data, dataKey, color }) => (
  <div style={{ width: 96, height: 32 }}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        <Line type="linear" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: AXIS }} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

/** Quiet placeholder for an empty chart: faint outline bars plus one line of guidance. */
const ChartEmpty = ({ text }) => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 90 }} aria-hidden>
      {[38, 62, 46, 80, 55, 70].map((h, i) => (
        <div key={i} style={{ width: 18, height: h, borderRadius: '4px 4px 0 0', border: `1.5px dashed ${AXIS}`, borderBottom: 'none' }} />
      ))}
    </div>
    <Text type="secondary">{text}</Text>
  </div>
);

const AttentionChip = ({ count, okText = 'On track', badText = 'Needs attention' }) => (count > 0 ? (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: STATUS.critical }}>
    <AlertTriangle size={13} /> {badText}
  </span>
) : (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#006300' }}>
    <CheckCircle2 size={13} /> {okText}
  </span>
));

const STATUS_COLOR = {
  PAID: 'success',
  OPEN: 'processing',
  UNPAID: 'processing',
  PARTIAL: 'warning',
  PARTIAL_PAID: 'warning',
  OVERDUE: 'error',
  APPROVED_FOR_PAYMENT: 'purple',
  WAITING_FOR_PAYMENT: 'gold',
  EXCEPTION: 'error',
};

const fmtDate = (value) => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const inRange = (date, start, end) => {
  if (!date) return true;
  return date >= start && date <= end;
};

const boundsFor = (preset, custom) => {
  const end = dayjs().endOf('day');
  if (preset === 'custom' && custom?.[0] && custom?.[1]) {
    return { start: custom[0].startOf('day').toDate(), end: custom[1].endOf('day').toDate() };
  }
  if (preset === '30') return { start: dayjs().subtract(29, 'day').startOf('day').toDate(), end: end.toDate() };
  return { start: dayjs().startOf('month').toDate(), end: end.toDate() };
};

const statusOf = (row, kind) => {
  if (row.status === 'PAID') return 'PAID';
  if (kind === 'payable' && daysPastDue(row) > 0) return 'OVERDUE';
  if (kind === 'receivable' && row.due && new Date(row.due) < new Date() && row.status !== 'PAID') return 'OVERDUE';
  return row.status || 'OPEN';
};

const downloadCsv = (name, rows) => {
  const csv = rows.map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

const RankList = ({ rows, empty, color, total }) => {
  if (!rows.length) {
    return (
      <div style={{ padding: '22px 0', textAlign: 'center' }}>
        <Text type="secondary">{empty}</Text>
      </div>
    );
  }
  const max = Math.max(...rows.map((row) => row.amount), 1);
  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      {rows.map((row, index) => (
        <div key={row.name}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--color-bg-subtle, #F1F5F9)', color: INK.secondary, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {index + 1}
            </span>
            <Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>{row.name}</Text>
            <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(row.amount)}</Text>
            <Text type="secondary" style={{ width: 40, textAlign: 'right', fontSize: 12 }}>
              {total > 0 ? `${Math.round((row.amount / total) * 100)}%` : ''}
            </Text>
          </div>
          <Progress
            percent={Math.round((row.amount / max) * 100)}
            showInfo={false}
            strokeColor={color}
            railColor="#F1F5F9"
            size={{ height: 6 }}
          />
        </div>
      ))}
    </Space>
  );
};

const ArApDashboard = () => {
  const navigate = useNavigate();
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(null);
  const [payables, setPayables] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState(null);
  const [chartView, setChartView] = useState({ ageing: 'chart', trend: 'chart' });
  // Only the sides this role may see are loaded and shown (the server enforces the same rules).
  const sessionUser = getStoredUser();
  const showAP = canSee(sessionUser, 'INVOICE');
  const showAR = canSee(sessionUser, 'AR');
  const both = showAP && showAR;
  const canPay = hasPerm(sessionUser, 'PAYMENT', 'ADD') || hasPerm(sessionUser, 'PAYMENT', 'EDIT');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invoices, arRes] = await Promise.all([
        showAP ? loadApInvoices() : Promise.resolve([]),
        showAR ? api.get('/ar/invoices').catch(() => null) : Promise.resolve(null),
      ]);
      setPayables(Array.isArray(invoices) ? invoices.filter((row) => row.status !== 'REJECTED') : []);
      // Customer invoices: amount = what is still outstanding; cancelled ones are not receivables.
      setReceivables((arRes?.data?.data || [])
        .filter((row) => row.status !== 'CANCELLED')
        .map((row) => ({
          id: row.id,
          invoice_number: row.invoice_number,
          customer: row.customer?.customer_name,
          date: row.invoice_date,
          due: row.due_date,
          amount: row.status === 'PAID' ? Number(row.total_amount) : Number(row.outstanding),
          status: row.status === 'PARTIALLY_PAID' ? 'PARTIAL' : row.status,
        })));
    } catch {
      message.error('Failed to load the AR & AP dashboard');
      setPayables([]);
      setReceivables([]);
    } finally {
      setLoading(false);
    }
  }, [showAP, showAR]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('fixtag:sync', refresh);
    return () => window.removeEventListener('fixtag:sync', refresh);
  }, [load]);

  const { start, end } = boundsFor(preset, custom);

  // The period filter scopes activity (recent receivables, collection period), not balances.
  const scopedReceivables = useMemo(
    () => receivables.filter((row) => inRange(row.date ? new Date(row.date) : null, start, end)),
    [receivables, start, end]
  );

  // Balances are as of today: every open item counts, whatever month it was invoiced in.
  const openPayables = payables.filter((row) => !['PAID', 'REJECTED'].includes(row.status));
  const openReceivables = receivables.filter((row) => row.status !== 'PAID');
  const overduePayables = openPayables.filter((row) => daysPastDue(row) > 0);
  const overdueReceivables = openReceivables.filter((row) => row.due && new Date(row.due) < new Date());

  const totalPayables = openPayables.reduce((sum, row) => sum + journalFor(row).total, 0);
  const totalReceivables = openReceivables.reduce((sum, row) => sum + num(row.amount), 0);
  const overduePayableAmount = overduePayables.reduce((sum, row) => sum + journalFor(row).total, 0);
  const overdueReceivableAmount = overdueReceivables.reduce((sum, row) => sum + num(row.amount), 0);
  const creditSales = scopedReceivables.reduce((sum, row) => sum + num(row.amount), 0);
  const periodDays = Math.max(1, Math.round((end - start) / 86400000));
  const collectionDays = creditSales > 0 ? Math.round((totalReceivables / creditSales) * periodDays) : 0;

  const ageingData = useMemo(() => {
    const buckets = { '0-30': { ar: 0, ap: 0 }, '31-60': { ar: 0, ap: 0 }, '61-90': { ar: 0, ap: 0 }, '90+': { ar: 0, ap: 0 } };
    openPayables.forEach((row) => {
      buckets[ageingBucket(Math.max(daysPastDue(row), 0))].ap += journalFor(row).total;
    });
    openReceivables.forEach((row) => {
      const due = row.due ? new Date(row.due) : null;
      const days = due ? Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000)) : 0;
      buckets[ageingBucket(days)].ar += num(row.amount);
    });
    return [
      { bucket: '0-30', Receivables: buckets['0-30'].ar, Payables: buckets['0-30'].ap },
      { bucket: '31-60', Receivables: buckets['31-60'].ar, Payables: buckets['31-60'].ap },
      { bucket: '61-90', Receivables: buckets['61-90'].ar, Payables: buckets['61-90'].ap },
      { bucket: '90+', Receivables: buckets['90+'].ar, Payables: buckets['90+'].ap },
    ];
  }, [openPayables, openReceivables]);

  const trendData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) => dayjs().subtract(5 - index, 'month').startOf('month'));
    return months.map((month) => {
      const key = month.format('YYYY-MM');
      const label = month.format('MMM');
      const ap = payables
        .filter((row) => invoiceDate(row) && dayjs(invoiceDate(row)).format('YYYY-MM') === key)
        .reduce((sum, row) => sum + journalFor(row).total, 0);
      const ar = receivables
        .filter((row) => row.date && dayjs(row.date).format('YYYY-MM') === key)
        .reduce((sum, row) => sum + num(row.amount), 0);
      return { month: label, Receivables: ar, Payables: ap };
    });
  }, [payables, receivables]);

  const topVendors = useMemo(() => {
    const map = new Map();
    openPayables.forEach((row) => {
      const name = vendorName(row);
      map.set(name, (map.get(name) || 0) + journalFor(row).total);
    });
    return Array.from(map, ([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [openPayables]);

  const topCustomers = useMemo(() => {
    const map = new Map();
    openReceivables.forEach((row) => {
      const name = row.customer || '—';
      map.set(name, (map.get(name) || 0) + num(row.amount));
    });
    return Array.from(map, ([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [openReceivables]);

  const recentReceivables = [...scopedReceivables]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 8);
  const upcomingPayables = [...openPayables]
    .sort((a, b) => (dueDate(a)?.getTime() || 0) - (dueDate(b)?.getTime() || 0))
    .slice(0, 8);

  const hasAgeing = ageingData.some((row) => row.Receivables || row.Payables);
  const hasTrend = trendData.some((row) => row.Receivables || row.Payables);

  const exportReport = () => {
    downloadCsv(both ? 'ar-ap-dashboard.csv' : showAP ? 'payables-dashboard.csv' : 'receivables-dashboard.csv', [
      ['Metric', 'Amount', 'Count'],
      ...(showAR ? [['Total Receivables', totalReceivables, openReceivables.length]] : []),
      ...(showAP ? [['Total Payables', totalPayables, openPayables.length]] : []),
      ...(both ? [['Net Cash Position', totalReceivables - totalPayables, '']] : []),
      ...(showAR ? [['Overdue Receivables', overdueReceivableAmount, overdueReceivables.length]] : []),
      ...(showAP ? [['Overdue Payables', overduePayableAmount, overduePayables.length]] : []),
      ...(showAR ? [['Average Collection Period (days)', collectionDays, '']] : []),
      ...(showAR ? [[], ['Recent Receivables', 'Customer', 'Due Date', 'Amount', 'Status'],
        ...recentReceivables.map((row) => [row.invoice_number, row.customer, fmtDate(row.due), row.amount, statusOf(row, 'receivable')])] : []),
      ...(showAP ? [[], ['Upcoming Payables', 'Vendor', 'Due Date', 'Amount', 'Status'],
        ...upcomingPayables.map((row) => [row.invoice_number, vendorName(row), fmtDate(dueDate(row)), journalFor(row).total, statusOf(row, 'payable')])] : []),
    ]);
  };

  const netPosition = totalReceivables - totalPayables;
  const openTotal = totalReceivables + totalPayables;
  const arShare = openTotal > 0 ? (totalReceivables / openTotal) * 100 : 50;
  const weekAhead = dayjs().add(7, 'day').endOf('day').toDate();
  const dueSoon = openPayables.filter((row) => {
    const due = dueDate(row);
    return due && daysPastDue(row) <= 0 && due <= weekAhead;
  });
  const dueSoonAmount = dueSoon.reduce((sum, row) => sum + journalFor(row).total, 0);
  const hasAnyData = payables.length > 0 || receivables.length > 0;
  const rangeLabel = preset === 'custom' && custom?.[0]
    ? `${custom[0].format('D MMM')} – ${custom[1].format('D MMM YYYY')}`
    : preset === '30' ? 'Last 30 days' : dayjs().format('MMMM YYYY');
  const position = !openTotal
    ? { icon: <Scale size={14} />, text: 'No open balances', color: INK.muted }
    : netPosition >= 0
      ? { icon: <ArrowUpRight size={14} />, text: 'Cash positive', color: '#006300' }
      : { icon: <ArrowDownLeft size={14} />, text: 'Cash negative', color: STATUS.critical };

  const tiles = [
    {
      side: 'AR',
      title: 'Overdue receivables', icon: <Hourglass size={18} />, value: compactInr(overdueReceivableAmount),
      sub: `${overdueReceivables.length} invoice${overdueReceivables.length === 1 ? '' : 's'}`, count: overdueReceivables.length,
    },
    {
      side: 'AP',
      title: 'Overdue payables', icon: <AlertTriangle size={18} />, value: compactInr(overduePayableAmount),
      sub: `${overduePayables.length} bill${overduePayables.length === 1 ? '' : 's'}`, count: overduePayables.length,
    },
    {
      side: 'AP',
      title: 'Due in next 7 days', icon: <CalendarClock size={18} />, value: compactInr(dueSoonAmount),
      sub: `${dueSoon.length} bill${dueSoon.length === 1 ? '' : 's'} to pay`, count: 0, okText: dueSoon.length ? 'Plan payments' : 'Nothing due',
    },
    {
      side: 'AR',
      title: 'Days sales outstanding', icon: <Scale size={18} />, value: `${collectionDays} days`,
      sub: 'Average collection period', count: collectionDays > 60 ? 1 : 0, okText: 'Healthy', badText: 'Slow collections',
    },
  ].filter((tile) => (tile.side === 'AP' ? showAP : showAR));

  const tableToggle = (key) => (
    <Segmented
      size="small"
      value={chartView[key]}
      onChange={(value) => setChartView((prev) => ({ ...prev, [key]: value }))}
      options={[{ label: 'Chart', value: 'chart' }, { label: 'Table', value: 'table' }]}
    />
  );
  const seriesTableColumns = (first) => [
    { title: first, dataIndex: first === 'Ageing' ? 'bucket' : 'month' },
    ...(showAR ? [{ title: 'Receivables', dataIndex: 'Receivables', align: 'right', render: (v) => inr(v) }] : []),
    ...(showAP ? [{ title: 'Payables', dataIndex: 'Payables', align: 'right', render: (v) => inr(v) }] : []),
  ];

  const receivableColumns = [
    { title: 'Invoice No', dataIndex: 'invoice_number', render: (v) => v || '—' },
    { title: 'Customer', dataIndex: 'customer', render: (v) => v || '—' },
    { title: 'Due Date', dataIndex: 'due', render: (v) => fmtDate(v) },
    { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v) => inr(v) },
    { title: 'Status', key: 'status', render: (_, row) => { const s = statusOf(row, 'receivable'); return <Tag color={STATUS_COLOR[s] || 'default'}>{s.replace(/_/g, ' ')}</Tag>; } },
    { title: 'Action', key: 'action', render: (_, row) => <Button type="link" onClick={() => setView({ kind: 'Receivable', title: row.invoice_number, party: row.customer, due: row.due, amount: row.amount, status: statusOf(row, 'receivable') })}>View</Button> },
  ];

  const payableColumns = [
    { title: 'Bill No', dataIndex: 'invoice_number', render: (v) => v || '—' },
    { title: 'Vendor', key: 'vendor', render: (_, row) => vendorName(row) },
    { title: 'Due Date', key: 'due', render: (_, row) => fmtDate(dueDate(row)) },
    { title: 'Amount', key: 'amount', align: 'right', render: (_, row) => inr(journalFor(row).total) },
    { title: 'Status', key: 'status', render: (_, row) => { const s = statusOf(row, 'payable'); return <Tag color={STATUS_COLOR[s] || 'default'}>{s.replace(/_/g, ' ')}</Tag>; } },
    {
      title: 'Action',
      key: 'action',
      render: (_, row) => (
        <Space size={0}>
          <Button type="link" onClick={() => setView({ kind: 'Payable', title: row.invoice_number, party: vendorName(row), due: dueDate(row), amount: journalFor(row).total, status: statusOf(row, 'payable') })}>View</Button>
          {canPay && <Button type="link" onClick={() => navigate('/finance/payment-processing')}>Pay</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ opacity: loading && hasAnyData ? 0.6 : 1, transition: 'opacity 150ms' }}>
      <Card style={{ ...card, marginBottom: 20 }} styles={{ body: { padding: 20 } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space size={16} align="center">
              <div className="page-header-icon"><LayoutDashboard size={24} /></div>
              <div>
                <h2 className="page-header-title">{both ? 'AR & AP Dashboard' : showAP ? 'Payables Dashboard' : 'Receivables Dashboard'}</h2>
                <Text type="secondary">{rangeLabel} · as of {dayjs().format('D MMM YYYY, h:mm A')}</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Select
                value={preset}
                onChange={setPreset}
                style={{ width: 160 }}
                options={[
                  { value: 'month', label: 'This Month' },
                  { value: '30', label: 'Last 30 Days' },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
              {preset === 'custom' && (
                <RangePicker value={custom} onChange={setCustom} allowClear={false} />
              )}
              <Button icon={<RefreshCcw size={16} />} loading={loading} onClick={load}>Refresh</Button>
              <Button icon={<Download size={16} />} onClick={exportReport}>Export</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {!loading && !hasAnyData && (
        <Card
          style={{ ...card, marginBottom: 16, background: 'linear-gradient(120deg, #EEF4FD 0%, #FDF1EB 100%)', border: '1px solid #DCE6F5' }}
          styles={{ body: { padding: '20px 24px' } }}
        >
          <Row align="middle" justify="space-between" gutter={[16, 16]}>
            <Col xs={24} lg={11}>
              <div style={{ fontSize: 18, fontWeight: 700, color: INK.primary }}>{both ? 'Your AR & AP workspace is ready' : showAP ? 'No payables yet' : 'No receivables yet'}</div>
              <Text type="secondary">{showAP ? 'Record vendor bills' : 'Record customer invoices'} and this dashboard fills in with balances, ageing and trends.</Text>
            </Col>
            <Col xs={24} lg={13}>
              <Space wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
                {hasPerm(sessionUser, 'INVOICE', 'ADD') && <Button type="primary" icon={<FilePlus2 size={16} />} onClick={() => navigate('/procurement/invoices')}>Record a vendor bill</Button>}
                {hasPerm(sessionUser, 'VENDOR', 'ADD') && <Button icon={<UserPlus size={16} />} onClick={() => navigate('/vendor-master')}>Add a vendor</Button>}
                {hasPerm(sessionUser, 'FINANCE', 'ADD') && <Button icon={<NotebookPen size={16} />} onClick={() => navigate('/finance/ar/journal-entry')}>Post a journal entry</Button>}
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={10}>
          <Card style={card} styles={{ body: { padding: 22 } }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <Text type="secondary">{both ? 'Net cash position' : showAP ? 'Open payables' : 'Open receivables'}</Text>
              {both && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: position.color, background: 'var(--color-bg-subtle, #F1F5F9)', borderRadius: 999, padding: '3px 10px' }}>
                  {position.icon} {position.text}
                </span>
              )}
            </div>
            <div style={{ fontSize: 38, fontWeight: 700, color: INK.primary, lineHeight: 1.15, margin: '6px 0 2px' }}>
              {both ? <>{netPosition < 0 ? '−' : ''}{inr(Math.abs(netPosition))}</> : inr(showAP ? totalPayables : totalReceivables)}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>{both ? 'Open receivables minus open payables' : showAP ? 'Unpaid vendor bills' : 'Outstanding customer invoices'}</Text>

            <div style={{ display: both ? 'flex' : 'none', gap: 2, height: 10, margin: '18px 0 16px', borderRadius: 5, overflow: 'hidden', background: '#F1F5F9' }}>
              {openTotal > 0 && (
                <>
                  {totalReceivables > 0 && <div style={{ width: `${arShare}%`, background: AR_COLOR }} title={`Receivables ${inr(totalReceivables)}`} />}
                  {totalPayables > 0 && <div style={{ flex: 1, background: AP_COLOR }} title={`Payables ${inr(totalPayables)}`} />}
                </>
              )}
            </div>

            {[
              ...(showAR ? [{ label: 'Receivables', color: AR_COLOR, amount: totalReceivables, count: openReceivables.length, key: 'Receivables' }] : []),
              ...(showAP ? [{ label: 'Payables', color: AP_COLOR, amount: totalPayables, count: openPayables.length, key: 'Payables' }] : []),
            ].map((side) => (
              <div key={side.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--color-border-light, #F1F5F9)' }}>
                <Swatch color={side.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: INK.secondary, fontSize: 13 }}>{side.label}</div>
                  <div style={{ color: INK.primary, fontWeight: 600, fontSize: 16 }}>
                    {inr(side.amount)} <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>· {side.count} open</Text>
                  </div>
                </div>
                {hasTrend && <Sparkline data={trendData} dataKey={side.key} color={side.color} />}
              </div>
            ))}
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Row gutter={[16, 16]} style={{ height: '100%' }}>
            {tiles.map((tile) => (
              <Col xs={24} sm={12} key={tile.title}>
                <Card style={card} styles={{ body: { padding: '18px 20px' } }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--color-bg-subtle, #F1F5F9)', color: INK.secondary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {tile.icon}
                    </span>
                    <Text type="secondary">{tile.title}</Text>
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: INK.primary, margin: '12px 0 4px' }}>{tile.value}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{tile.sub}</Text>
                    <AttentionChip count={tile.count} okText={tile.okText} badText={tile.badText} />
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={12}>
          <Card style={card} title="Ageing analysis" extra={hasAgeing && tableToggle('ageing')} styles={{ body: { height: 320, padding: '12px 16px 8px' } }}>
            {!hasAgeing && <ChartEmpty text="No open balances to age yet" />}
            {hasAgeing && chartView.ageing === 'table' && (
              <Table rowKey="bucket" size="small" pagination={false} columns={seriesTableColumns('Ageing')} dataSource={ageingData} />
            )}
            {hasAgeing && chartView.ageing === 'chart' && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageingData} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="bucket" tickFormatter={(v) => `${v} days`} tick={{ fill: INK.muted, fontSize: 12 }} axisLine={{ stroke: AXIS }} tickLine={false} />
                  <YAxis tickFormatter={compactInr} width={64} tick={{ fill: INK.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                  {showAR && <Bar dataKey="Receivables" fill={AR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />}
                  {showAP && <Bar dataKey="Payables" fill={AP_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />}
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card style={card} title="Six-month trend" extra={hasTrend && tableToggle('trend')} styles={{ body: { height: 320, padding: '12px 16px 8px' } }}>
            {!hasTrend && <ChartEmpty text="No invoice activity in the last 6 months" />}
            {hasTrend && chartView.trend === 'table' && (
              <Table rowKey="month" size="small" pagination={false} columns={seriesTableColumns('Month')} dataSource={trendData} />
            )}
            {hasTrend && chartView.trend === 'chart' && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="month" tick={{ fill: INK.muted, fontSize: 12 }} axisLine={{ stroke: AXIS }} tickLine={false} />
                  <YAxis tickFormatter={compactInr} width={64} tick={{ fill: INK.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: AXIS }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
                  {showAR && <Line type="linear" dataKey="Receivables" stroke={AR_COLOR} strokeWidth={2}
                    dot={{ r: 4, fill: AR_COLOR, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />}
                  {showAP && <Line type="linear" dataKey="Payables" stroke={AP_COLOR} strokeWidth={2}
                    dot={{ r: 4, fill: AP_COLOR, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />}
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {showAR && <Col xs={24} xl={both ? 12 : 24}>
          <Card style={card} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Swatch color={AR_COLOR} /> Top 5 customers by outstanding</span>}>
            <RankList rows={topCustomers} empty="No customer balances yet" color={AR_COLOR} total={totalReceivables} />
          </Card>
        </Col>}
        {showAP && <Col xs={24} xl={both ? 12 : 24}>
          <Card style={card} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Swatch color={AP_COLOR} /> Top 5 vendors by outstanding</span>}>
            <RankList rows={topVendors} empty="No vendor balances yet" color={AP_COLOR} total={totalPayables} />
          </Card>
        </Col>}
      </Row>

      <Row gutter={[16, 16]}>
        {showAR && <Col xs={24} xl={both ? 12 : 24}>
          <Card style={card} styles={{ body: { padding: 0 } }} title="Recent Receivables">
            <Table
              rowKey={(row) => row.id || row.invoice_number}
              columns={receivableColumns}
              dataSource={recentReceivables}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty description="No receivables in this period" style={{ margin: '28px 0' }} /> }}
            />
          </Card>
        </Col>}
        {showAP && <Col xs={24} xl={both ? 12 : 24}>
          <Card style={card} styles={{ body: { padding: 0 } }} title="Upcoming Payables">
            <Table
              rowKey="id"
              loading={loading}
              columns={payableColumns}
              dataSource={upcomingPayables}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty description="No upcoming payables" style={{ margin: '28px 0' }} /> }}
            />
          </Card>
        </Col>}
      </Row>

      <Drawer open={!!view} title={view ? `${view.kind} ${view.title || ''}` : ''} onClose={() => setView(null)} width={380}>
        {view && (
          <Space direction="vertical" size={12}>
            <Text type="secondary">{view.kind === 'Payable' ? 'Vendor' : 'Customer'}</Text>
            <Text strong>{view.party || '—'}</Text>
            <Text type="secondary">Due date</Text>
            <Text strong>{fmtDate(view.due)}</Text>
            <Text type="secondary">Amount</Text>
            <Text strong>{inr(view.amount)}</Text>
            <Tag color={STATUS_COLOR[view.status] || 'default'}>{String(view.status || '').replace(/_/g, ' ')}</Tag>
          </Space>
        )}
      </Drawer>
    </div>
  );
};

export default ArApDashboard;
