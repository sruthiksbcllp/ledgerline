import React from 'react';
import { Button, Card, Col, Row, Select, Space, Typography } from 'antd';
import { Download, RefreshCcw } from 'lucide-react';
import DateRangeFilter from '../base/DateRangeFilter';
import { contentCard, inr } from '../../utils/apReports';

const { Text } = Typography;

/** Shared components for the AP reports (cycle time, exceptions); helpers are in utils/apReports. */
/** Date range, vendor and property filters with Refresh and Export buttons. */
export function ReportFilters({ range, setRange, vendorId, setVendorId, propertyId, setPropertyId, options, loading, onRefresh, onExport, exportAllowed, rangeHint, children }) {
  const opt = (list) => (list || []).map((o) => ({ value: o.id, label: o.name }));
  return (
    <Card style={{ ...contentCard, marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
      <Row gutter={[12, 12]} align="bottom">
        <Col xs={24} md={8}>
          <Text type="secondary" style={{ fontSize: 12 }}>{rangeHint || 'Date range'}</Text>
          <DateRangeFilter style={{ width: '100%', marginTop: 4 }} value={range} onChange={setRange} />
        </Col>
        <Col xs={12} md={5}>
          <Text type="secondary" style={{ fontSize: 12 }}>Vendor</Text>
          <Select allowClear showSearch optionFilterProp="label" placeholder="All vendors" style={{ width: '100%', marginTop: 4 }} value={vendorId} onChange={setVendorId} options={opt(options?.vendors)} />
        </Col>
        <Col xs={12} md={5}>
          <Text type="secondary" style={{ fontSize: 12 }}>Property</Text>
          <Select allowClear showSearch optionFilterProp="label" placeholder="All properties" style={{ width: '100%', marginTop: 4 }} value={propertyId} onChange={setPropertyId} options={opt(options?.properties)} />
        </Col>
        {children}
        <Col flex="auto" style={{ textAlign: 'right' }}>
          <Space>
            <Button icon={<RefreshCcw size={15} />} loading={loading} onClick={onRefresh}>Refresh</Button>
            {exportAllowed && <Button icon={<Download size={15} />} onClick={onExport}>Excel</Button>}
          </Space>
        </Col>
      </Row>
    </Card>
  );
}

/** A figure with a caption. */
export function Tile({ title, value, sub, tone }) {
  const color = tone === 'bad' ? '#b42318' : tone === 'warn' ? '#b54708' : tone === 'good' ? '#067647' : '#1E3A5F';
  return (
    <Card style={{ ...contentCard, height: '100%' }} styles={{ body: { padding: 16 } }}>
      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{title}</Text>
      <div style={{ fontSize: 24, fontWeight: 700, color, margin: '4px 0 2px', lineHeight: 1.2 }}>{value}</div>
      {sub && <Text type="secondary" style={{ fontSize: 12 }}>{sub}</Text>}
    </Card>
  );
}

/** Counts with a bar each (e.g. exceptions by type). items: [{ key, label, count, amount }] */
export function TallyList({ items, empty = 'None', color = '#2a78d6' }) {
  if (!items?.length) return <Text type="secondary">{empty}</Text>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((i) => (
        <div key={i.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
            <span>{i.label}</span>
            <span style={{ whiteSpace: 'nowrap' }}><b>{i.count}</b>{i.amount != null && <Text type="secondary"> · {inr(i.amount)}</Text>}</span>
          </div>
          <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3, marginTop: 4 }}>
            <div style={{ width: `${(i.count / max) * 100}%`, height: '100%', background: color, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
