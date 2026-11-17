import React, { useCallback, useEffect, useState } from 'react';
import { Card, Col, Empty, Row, Table, Tag, Tooltip, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { ReportFilters, TallyList, Tile } from './apReportShared';
import {
  canOpenBills, contentCard, defaultRange, fmtDate, fmtDays, inr, rangeParams, useExcelExport
} from '../../utils/apReports';

const { Text } = Typography;
const TYPE_COLOR = { PRICE: 'purple', QUANTITY: 'orange', OTHER: 'default' };
const STAGE_COLOR = { PROCUREMENT_REVIEW: 'purple', RECEIPT_REVIEW: 'orange', FINANCE_REVIEW: 'blue' };
const OUTCOME_COLOR = { ACCEPTED: 'success', REJECTED: 'error', CLEARED: 'processing' };
const AGE_TONE = { '0-2': undefined, '3-7': undefined, '8-15': 'warn', '15+': 'bad' };
const ageColor = (d) => (d > 15 ? 'error' : d > 7 ? 'warning' : 'default');

/**
 * Exceptions: open three-way-match exceptions now (how many, amount on hold, why, how old, which
 * team has them), how the ones resolved in the range ended, and which vendors cause the most.
 */
export default function ApExceptionReport() {
  const navigate = useNavigate();
  const canOpen = canOpenBills();
  const { allowed, exportSheets } = useExcelExport();
  const [range, setRange] = useState(defaultRange);
  const [vendorId, setVendorId] = useState(undefined);
  const [propertyId, setPropertyId] = useState(undefined);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/ap-reports/exceptions', { params: { ...rangeParams(range), vendor_id: vendorId, property_id: propertyId } });
      setData(res?.data?.data || null);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not load the exception report');
    } finally {
      setLoading(false);
    }
  }, [range, vendorId, propertyId]);
  useEffect(() => { load(); }, [load]);

  const rowLink = canOpen ? (r) => ({ onClick: () => navigate(`/procurement/invoices?open=${r.id}`), style: { cursor: 'pointer' } }) : undefined;
  const open = data?.open;
  const resolved = data?.resolved;
  const raised = data?.raised;

  const problemCell = (v) => (v ? (
    <Tooltip title={v}><Text type="secondary" style={{ maxWidth: 280, display: 'inline-block' }} ellipsis>{v}</Text></Tooltip>
  ) : '—');

  const openColumns = [
    { title: 'Bill', dataIndex: 'invoice_number', render: (v) => <b>{v}</b> },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r.vendor?.name || '—' },
    { title: 'Amount', dataIndex: 'amount', align: 'right', render: inr },
    { title: 'What went wrong', key: 'type', render: (_, r) => <Tag color={TYPE_COLOR[r.type]}>{r.type_label}</Tag> },
    { title: 'Details', dataIndex: 'problem', render: problemCell },
    { title: 'With', key: 'stage', render: (_, r) => <Tag color={STAGE_COLOR[r.stage]}>{r.stage_label}</Tag> },
    { title: 'Raised', dataIndex: 'raised_at', render: fmtDate },
    { title: 'Age', dataIndex: 'age_days', align: 'right', render: (d) => <Tag color={ageColor(d)}>{fmtDays(d)}</Tag> },
    { title: 'Reviewer said', key: 'reason', render: (_, r) => (r.reason_label ? <Tooltip title={r.review_note || null}>{r.reason_label}</Tooltip> : <Text type="secondary">Not reviewed yet</Text>) }
  ];

  const resolvedColumns = [
    { title: 'Bill', dataIndex: 'invoice_number', render: (v) => <b>{v}</b> },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r.vendor?.name || '—' },
    { title: 'Amount', dataIndex: 'amount', align: 'right', render: inr },
    { title: 'What went wrong', key: 'type', render: (_, r) => <Tag color={TYPE_COLOR[r.type]}>{r.type_label}</Tag> },
    { title: 'How it ended', key: 'outcome', render: (_, r) => <Tag color={OUTCOME_COLOR[r.outcome]}>{r.outcome_label}</Tag> },
    { title: 'Reviewer said', key: 'reason', render: (_, r) => r.reason_label || <Text type="secondary">—</Text> },
    { title: 'Raised', dataIndex: 'raised_at', render: fmtDate },
    { title: 'Resolved', dataIndex: 'resolved_at', render: fmtDate },
    { title: 'Took', dataIndex: 'days_to_resolve', align: 'right', render: (d) => (d == null ? '—' : `${d} day${d === 1 ? '' : 's'}`) }
  ];

  const vendorColumns = [
    { title: 'Vendor', dataIndex: 'name', render: (v) => <b>{v}</b> },
    { title: 'Exceptions raised', dataIndex: 'raised', align: 'right' },
    { title: 'Price', dataIndex: 'price', align: 'right' },
    { title: 'Quantity', dataIndex: 'quantity', align: 'right' },
    { title: 'Open now', dataIndex: 'open_now', align: 'right', render: (v) => (v ? <Tag color="error">{v}</Tag> : 0) },
    { title: 'Amount', dataIndex: 'amount', align: 'right', render: inr }
  ];

  const doExport = () => exportSheets([
    {
      name: 'Open exceptions', title: 'Open exceptions',
      rows: open?.rows || [],
      columns: [
        { label: 'Bill', value: (r) => r.invoice_number },
        { label: 'Vendor', value: (r) => r.vendor?.name || '' },
        { label: 'Property', value: (r) => r.property?.name || '' },
        { label: 'Amount', value: (r) => r.amount },
        { label: 'What went wrong', value: (r) => r.type_label },
        { label: 'Details', value: (r) => r.problem || '' },
        { label: 'With', value: (r) => r.stage_label },
        { label: 'Raised', value: (r) => fmtDate(r.raised_at) },
        { label: 'Age (days)', value: (r) => r.age_days },
        { label: 'Reviewer said', value: (r) => r.reason_label || '' },
        { label: 'Review note', value: (r) => r.review_note || '' }
      ]
    },
    {
      name: 'Resolved', title: 'Exceptions resolved in the period',
      rows: resolved?.rows || [],
      columns: [
        { label: 'Bill', value: (r) => r.invoice_number },
        { label: 'Vendor', value: (r) => r.vendor?.name || '' },
        { label: 'Amount', value: (r) => r.amount },
        { label: 'What went wrong', value: (r) => r.type_label },
        { label: 'How it ended', value: (r) => r.outcome_label },
        { label: 'Reviewer said', value: (r) => r.reason_label || '' },
        { label: 'Raised', value: (r) => fmtDate(r.raised_at) },
        { label: 'Resolved', value: (r) => fmtDate(r.resolved_at) },
        { label: 'Days to resolve', value: (r) => (r.days_to_resolve == null ? '' : r.days_to_resolve) }
      ]
    }
  ], 'AP_Exceptions');

  return (
    <div>
      <ReportFilters
        range={range} setRange={setRange} vendorId={vendorId} setVendorId={setVendorId} propertyId={propertyId} setPropertyId={setPropertyId}
        options={data?.filters} loading={loading} onRefresh={load} onExport={doExport} exportAllowed={allowed}
        rangeHint="Raised / resolved between (open ones: all)"
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}>
          <Tile title="Open now" value={open ? open.count : '—'} tone={open?.count ? 'warn' : 'good'} sub={open ? `${inr(open.amount)} on hold` : ''} />
        </Col>
        <Col xs={12} lg={6}>
          <Tile title="Oldest open" value={open?.count ? fmtDays(open.oldest_days) : '—'} tone={open?.oldest_days > 15 ? 'bad' : open?.oldest_days > 7 ? 'warn' : undefined} sub={open?.count ? 'since the exception was raised' : 'No open exceptions'} />
        </Col>
        <Col xs={12} lg={6}>
          <Tile title="Raised in this range" value={raised ? raised.count : '—'} sub={raised?.by_type?.length ? raised.by_type.map((t) => `${t.count} ${t.key === 'PRICE' ? 'price' : t.key === 'QUANTITY' ? 'quantity' : 'other'}`).join(' · ') : ''} />
        </Col>
        <Col xs={12} lg={6}>
          <Tile title="Resolved in this range" value={resolved ? resolved.count : '—'} sub={resolved?.avg_days_to_resolve != null ? `${resolved.avg_days_to_resolve} days to resolve on average` : ''} />
        </Col>
      </Row>

      <Text strong style={{ color: '#1E3A5F', display: 'block', marginBottom: 8 }}>How old (open exceptions)</Text>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {(open?.by_age || []).map((b) => (
          <Col xs={12} lg={6} key={b.key}>
            <Tile title={b.label} value={b.count} tone={b.count ? AGE_TONE[b.key] : undefined} sub={inr(b.amount)} />
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card style={{ ...contentCard, height: '100%' }} title="What went wrong (open)">
            <TallyList items={open?.by_type} empty="No open exceptions" color="#7c3aed" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card style={{ ...contentCard, height: '100%' }} title="Who has them (open)">
            <TallyList items={open?.by_stage} empty="No open exceptions" color="#2a78d6" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card style={{ ...contentCard, height: '100%' }} title="What the reviewer found (open)">
            <TallyList items={open?.by_reason} empty="No open exceptions" color="#eb6834" />
          </Card>
        </Col>
      </Row>

      <Card style={{ ...contentCard, marginBottom: 16 }} styles={{ body: { padding: 0 } }} title={`Open exceptions, oldest first${canOpen ? ' (click a bill to open it)' : ''}`}>
        <Table
          rowKey="id" size="middle" loading={loading} dataSource={open?.rows || []} columns={openColumns} onRow={rowLink}
          pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="No open exceptions" style={{ margin: '24px 0' }} /> }}
        />
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card style={{ ...contentCard, height: '100%' }} title="How they ended (this range)">
            <TallyList items={resolved?.by_outcome} empty="None resolved in this range" color="#16a34a" />
            {resolved?.by_reason?.length ? (
              <>
                <Text strong style={{ display: 'block', margin: '16px 0 8px', fontSize: 13 }}>Reviewer reasons</Text>
                <TallyList items={resolved.by_reason} color="#eb6834" />
              </>
            ) : null}
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Card style={{ ...contentCard, height: '100%' }} styles={{ body: { padding: 0 } }} title="Vendors with the most exceptions (raised in this range)">
            <Table
              rowKey="id" size="middle" dataSource={raised?.top_vendors || []} columns={vendorColumns}
              pagination={false} scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty description="No exceptions raised in this range" style={{ margin: '24px 0' }} /> }}
            />
          </Card>
        </Col>
      </Row>

      <Card style={contentCard} styles={{ body: { padding: 0 } }} title="Resolved in this range">
        <Table
          rowKey="id" size="middle" loading={loading} dataSource={resolved?.rows || []} columns={resolvedColumns} onRow={rowLink}
          pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="None resolved in this range" style={{ margin: '24px 0' }} /> }}
        />
      </Card>
    </div>
  );
}
