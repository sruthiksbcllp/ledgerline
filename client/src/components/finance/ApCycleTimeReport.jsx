import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Col, Empty, InputNumber, Row, Segmented, Table, Tag, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { ReportFilters, Tile } from './apReportShared';
import {
  canOpenBills, contentCard, defaultRange, fmtDate, fmtDays, fmtHours, inr, pct, rangeParams, useExcelExport
} from '../../utils/apReports';

const { Text } = Typography;
const WHERE_COLOR = { Paid: 'success', 'Part paid': 'gold', 'Approved, waiting for payment': 'processing', 'Waiting for approval': 'default' };
const whereTag = (w) => <Tag color={WHERE_COLOR[w] || (String(w).startsWith('Exception') ? 'error' : 'default')}>{w}</Tag>;

/**
 * Cycle time: how long bills take from received (email arrived) to entered, approved and paid;
 * paid on time vs late; by vendor / property; bills stuck waiting for approval.
 */
export default function ApCycleTimeReport() {
  const navigate = useNavigate();
  const canOpen = canOpenBills();
  const { allowed, exportSheets } = useExcelExport();
  const [range, setRange] = useState(defaultRange);
  const [vendorId, setVendorId] = useState(undefined);
  const [propertyId, setPropertyId] = useState(undefined);
  const [stuckDays, setStuckDays] = useState(7);
  const [groupBy, setGroupBy] = useState('vendor');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/ap-reports/cycle-time', { params: { ...rangeParams(range), vendor_id: vendorId, property_id: propertyId, stuck_days: stuckDays } });
      setData(res?.data?.data || null);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not load the cycle-time report');
    } finally {
      setLoading(false);
    }
  }, [range, vendorId, propertyId, stuckDays]);
  useEffect(() => { load(); }, [load]);

  const openBill = (id) => navigate(`/procurement/invoices?open=${id}`);
  const rowLink = canOpen ? (r) => ({ onClick: () => openBill(r.id), style: { cursor: 'pointer' } }) : undefined;

  const s = data?.summary;
  const steps = s?.steps || {};
  const onTime = s?.on_time || {};
  const touch = s?.touchless || {};
  const bills = [...(data?.bills || [])].sort((a, b) => (b.hours.total ?? b.hours.so_far ?? 0) - (a.hours.total ?? a.hours.so_far ?? 0));

  const billColumns = [
    { title: 'Bill', dataIndex: 'invoice_number', render: (v) => <b>{v}</b> },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r.vendor?.name || '—' },
    { title: 'Amount', dataIndex: 'amount', align: 'right', render: inr },
    { title: 'Received', key: 'rcv', render: (_, r) => (r.received_at ? fmtDate(r.received_at) : <Text type="secondary">—</Text>) },
    { title: 'Entered', key: 'ent', render: (_, r) => fmtDate(r.entered_at) },
    { title: 'Approved', key: 'apr', render: (_, r) => fmtDate(r.approved_at) },
    { title: 'Paid', key: 'paid', render: (_, r) => fmtDate(r.paid_at) },
    { title: 'Received → entered', key: 'h1', align: 'right', render: (_, r) => fmtHours(r.hours.receive) },
    { title: 'Entered → approved', key: 'h2', align: 'right', render: (_, r) => fmtHours(r.hours.approve) },
    { title: 'Approved → paid', key: 'h3', align: 'right', render: (_, r) => fmtHours(r.hours.pay) },
    {
      title: 'End to end', key: 'h4', align: 'right',
      render: (_, r) => (r.hours.total != null ? <b>{fmtHours(r.hours.total)}</b> : <Text type="secondary">{fmtHours(r.hours.so_far)} so far</Text>)
    },
    {
      title: 'On time', key: 'ot',
      render: (_, r) => (r.on_time == null ? <Text type="secondary">—</Text> : r.on_time ? <Tag color="success">On time</Tag> : <Tag color="error">{r.days_late} days late</Tag>)
    },
    { title: 'Now', dataIndex: 'where', render: whereTag }
  ];

  const groupRows = (groupBy === 'vendor' ? data?.by_vendor : data?.by_property) || [];
  const groupColumns = [
    { title: groupBy === 'vendor' ? 'Vendor' : 'Property', dataIndex: 'name', render: (v) => <b>{v}</b> },
    { title: 'Bills', dataIndex: 'bills', align: 'right' },
    { title: 'Amount', dataIndex: 'amount', align: 'right', render: inr },
    { title: 'Entered → approved', dataIndex: 'approve_avg_hours', align: 'right', render: fmtHours },
    { title: 'Approved → paid', dataIndex: 'pay_avg_hours', align: 'right', render: fmtHours },
    { title: 'End to end (paid bills)', dataIndex: 'total_avg_hours', align: 'right', render: (v) => <b>{fmtHours(v)}</b> },
    { title: 'Paid late', key: 'late', align: 'right', render: (_, r) => (r.late ? <Tag color="error">{r.late} of {r.paid}</Tag> : r.paid ? <Tag color="success">0 of {r.paid}</Tag> : '—') }
  ];

  const stuckColumns = [
    { title: 'Bill', dataIndex: 'invoice_number', render: (v) => <b>{v}</b> },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r.vendor?.name || '—' },
    { title: 'Property', key: 'prop', render: (_, r) => r.property?.name || '—' },
    { title: 'Amount', dataIndex: 'amount', align: 'right', render: inr },
    { title: 'Entered', key: 'ent', render: (_, r) => fmtDate(r.entered_at) },
    { title: 'Waiting', dataIndex: 'waiting_days', align: 'right', render: (d) => <Tag color={d > 15 ? 'error' : 'warning'}>{fmtDays(d)}</Tag> },
    { title: 'Stuck at', dataIndex: 'where', render: whereTag }
  ];

  const doExport = () => exportSheets([
    {
      name: 'Bills', title: 'AP cycle time: bills',
      rows: bills,
      columns: [
        { label: 'Bill', value: (r) => r.invoice_number },
        { label: 'Vendor', value: (r) => r.vendor?.name || '' },
        { label: 'Property', value: (r) => r.property?.name || '' },
        { label: 'Amount', value: (r) => r.amount },
        { label: 'Received', value: (r) => (r.received_at ? fmtDate(r.received_at) : '') },
        { label: 'Entered', value: (r) => fmtDate(r.entered_at) },
        { label: 'Approved', value: (r) => (r.approved_at ? fmtDate(r.approved_at) : '') },
        { label: 'Paid', value: (r) => (r.paid_at ? fmtDate(r.paid_at) : '') },
        { label: 'Due', value: (r) => (r.due_date ? fmtDate(r.due_date) : '') },
        { label: 'Received to entered (days)', value: (r) => (r.hours.receive == null ? '' : Math.round((r.hours.receive / 24) * 10) / 10) },
        { label: 'Entered to approved (days)', value: (r) => (r.hours.approve == null ? '' : Math.round((r.hours.approve / 24) * 10) / 10) },
        { label: 'Approved to paid (days)', value: (r) => (r.hours.pay == null ? '' : Math.round((r.hours.pay / 24) * 10) / 10) },
        { label: 'End to end (days)', value: (r) => (r.hours.total == null ? '' : Math.round((r.hours.total / 24) * 10) / 10) },
        { label: 'Days late', value: (r) => (r.on_time == null ? '' : r.days_late) },
        { label: 'Now', value: (r) => r.where }
      ]
    },
    {
      name: 'Stuck', title: `Bills not approved after ${data?.stuck_days || stuckDays} days`,
      rows: data?.stuck || [],
      columns: [
        { label: 'Bill', value: (r) => r.invoice_number },
        { label: 'Vendor', value: (r) => r.vendor?.name || '' },
        { label: 'Amount', value: (r) => r.amount },
        { label: 'Entered', value: (r) => fmtDate(r.entered_at) },
        { label: 'Waiting (days)', value: (r) => r.waiting_days },
        { label: 'Stuck at', value: (r) => r.where }
      ]
    }
  ], 'AP_Cycle_Time');

  const stepTile = (title, st, hint) => (
    <Tile title={title} value={fmtHours(st?.avg_hours)} sub={st?.count ? `median ${fmtHours(st.median_hours)} · ${st.count} bill${st.count === 1 ? '' : 's'}` : hint} />
  );

  return (
    <div>
      <ReportFilters
        range={range} setRange={setRange} vendorId={vendorId} setVendorId={setVendorId} propertyId={propertyId} setPropertyId={setPropertyId}
        options={data?.filters} loading={loading} onRefresh={load} onExport={doExport} exportAllowed={allowed} rangeHint="Bills entered between"
      >
        <Col xs={12} md={3}>
          <Text type="secondary" style={{ fontSize: 12 }}>Stuck after (days)</Text>
          <InputNumber min={1} max={365} style={{ width: '100%', marginTop: 4 }} value={stuckDays} onChange={(v) => setStuckDays(v || 7)} />
        </Col>
      </ReportFilters>

      {data?.truncated && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Showing the latest 2,000 bills in this range. Pick a shorter range for exact figures." />}

      <Text strong style={{ color: '#1E3A5F', display: 'block', marginBottom: 8 }}>Average time per step</Text>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}>{stepTile('Received → entered', steps.receive, 'Bills from the bill inbox only')}</Col>
        <Col xs={12} lg={6}>{stepTile('Entered → approved', steps.approve, 'No approved bills yet')}</Col>
        <Col xs={12} lg={6}>{stepTile('Approved → paid', steps.pay, 'No paid bills yet')}</Col>
        <Col xs={12} lg={6}>{stepTile('End to end (received → paid)', steps.total, 'No paid bills yet')}</Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Tile
            title="Paid on time (by the due date)"
            value={onTime.paid_with_due ? pct(onTime.on_time, onTime.paid_with_due) : '—'}
            tone={onTime.late ? (onTime.late / Math.max(onTime.paid_with_due, 1) > 0.2 ? 'bad' : 'warn') : onTime.paid_with_due ? 'good' : undefined}
            sub={onTime.paid_with_due ? `${onTime.on_time} of ${onTime.paid_with_due} paid bills${onTime.late ? ` · late ones by ${onTime.avg_days_late} days on average` : ''}` : 'No paid bills in this range'}
          />
        </Col>
        <Col xs={24} md={8}>
          <Tile
            title="Touchless (inbox bills nobody had to type)"
            value={touch.inbox_bills ? pct(touch.auto_submitted, touch.inbox_bills) : '—'}
            sub={touch.inbox_bills ? `${touch.auto_submitted} of ${touch.inbox_bills} bills from the bill inbox were auto-submitted` : 'No bills from the bill inbox in this range'}
          />
        </Col>
        <Col xs={24} md={8}>
          <Tile title="Bills in this range" value={s ? s.bills : '—'} sub={s ? `${inr(s.amount)} · ${s.paid} paid` : ''} />
        </Col>
      </Row>

      <Card
        style={{ ...contentCard, marginBottom: 16 }} styles={{ body: { padding: 0 } }}
        title={<span>Stuck: not approved after {data?.stuck_days || stuckDays} days {data?.stuck?.length ? <Tag color="warning" style={{ marginLeft: 6 }}>{data.stuck.length}</Tag> : null}</span>}
      >
        <Table
          rowKey="id" size="middle" loading={loading} dataSource={data?.stuck || []} columns={stuckColumns} onRow={rowLink}
          pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description={`No bill has been waiting more than ${data?.stuck_days || stuckDays} days`} style={{ margin: '24px 0' }} /> }}
        />
      </Card>

      <Card
        style={{ ...contentCard, marginBottom: 16 }} styles={{ body: { padding: 0 } }} title="Slowest and fastest"
        extra={<Segmented size="small" value={groupBy} onChange={setGroupBy} options={[{ value: 'vendor', label: 'By vendor' }, { value: 'property', label: 'By property' }]} />}
      >
        <Table
          rowKey="id" size="middle" loading={loading} dataSource={groupRows} columns={groupColumns}
          pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="No bills in this range" style={{ margin: '24px 0' }} /> }}
        />
      </Card>

      <Card style={contentCard} styles={{ body: { padding: 0 } }} title={`All bills, slowest first${canOpen ? ' (click a bill to open it)' : ''}`}>
        <Table
          rowKey="id" size="middle" loading={loading} dataSource={bills} columns={billColumns} onRow={rowLink}
          pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="No bills entered in this range" style={{ margin: '24px 0' }} /> }}
        />
      </Card>
    </div>
  );
}
