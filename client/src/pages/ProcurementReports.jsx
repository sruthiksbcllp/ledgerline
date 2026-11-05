import React, { useState, useEffect, useMemo } from 'react';
import {
  Table, Card, Tag, Space, Select,
  Row, Col, Typography, message, Button, Tooltip
} from 'antd';
import { FileText, Download, ClipboardList, ShoppingCart, PackageCheck, GitCompareArrows, Wrench, ChevronRight } from 'lucide-react';
import { PO_GROUPS, poAgeing, poGroupOf, statusLabel } from '../constants/poStatus';
import api from '../utils/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../utils/format';
import { normalizeResponse } from '../utils/apiNormalizer';
import { addPdfBranding, buildBrandedExcelSheet } from '../utils/exportBranding';
import PageHeader from '../components/PageHeader';
import { canSee, getStoredUser, hasPerm, seeScope } from '../utils/session';

const REPORT_DATA = { PR: 'PR', PO: 'PO', GRN: 'GRN', INVOICE: 'INVOICE' };

import DateRangeFilter from '../components/base/DateRangeFilter';
const { Title, Text } = Typography;

const REPORT_TYPES = [
  { value: 'PR', label: 'Purchase Requisition Report', description: 'All purchase requests with property, amount and approval status', icon: ClipboardList, color: '#2a78d6' },
  { value: 'PO', label: 'Purchase Order Report', description: 'Purchase orders issued to vendors and where each one stands', icon: ShoppingCart, color: '#7c3aed' },
  { value: 'GRN', label: 'GRN Report', description: 'Goods received against purchase orders', icon: PackageCheck, color: '#16a34a' },
  { value: 'INVOICE', label: '3-Way Matching Report', description: 'Vendor invoices matched against PO and GRN, with exceptions', icon: GitCompareArrows, color: '#eb6834' },
  { value: 'ISSUE', label: 'Asset Issue / Breakdown Report', description: 'Reported asset issues and breakdowns', icon: Wrench, color: '#dc2626' },
];

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };

const ProcurementReports = () => {
  // Only the reports for data this role may see (the server refuses the rest).
  const visibleReports = REPORT_TYPES.filter((t) => (t.value === 'ISSUE' ? seeScope(getStoredUser(), 'PR') === 'all' && hasPerm(getStoredUser(), 'AUDIT', 'VIEW') : canSee(getStoredUser(), REPORT_DATA[t.value])));
  const [reportType, setReportType] = useState(null); // nothing is shown until a report is chosen
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [settings, setSettings] = useState({ allow_excel_export: true, allow_pdf_export: true });
  const [dateRange, setDateRange] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null); // a status, or "group:<key>" for a PO stage

  const recordDate = (record) => (reportType === 'PO' ? record?.order_date || record?.createdAt : record?.createdAt);
  // Status choices: PO stages first (Awaiting approval, Open, ...) then the statuses in the data.
  const statusOptions = useMemo(() => {
    const present = [...new Set(data.map((r) => r?.status).filter(Boolean))].map((s) => ({ value: s, label: statusLabel(s) }));
    if (reportType !== 'PO') return present;
    return [
      { label: 'Stage', options: PO_GROUPS.map((g) => ({ value: `group:${g.key}`, label: g.label })) },
      { label: 'Status', options: present },
    ];
  }, [data, reportType]);
  const filteredData = useMemo(() => data.filter((record) => {
    if (dateRange?.[0] && dateRange?.[1]) {
      const t = new Date(recordDate(record)).getTime();
      if (!(t >= dateRange[0].startOf('day').valueOf() && t <= dateRange[1].endOf('day').valueOf())) return false;
    }
    if (statusFilter?.startsWith('group:')) return poGroupOf(record?.status)?.key === statusFilter.slice(6);
    if (statusFilter) return record?.status === statusFilter;
    return true;
  }), [data, dateRange, statusFilter, reportType]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtersOn = Boolean(dateRange || statusFilter);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/system/settings/');
      setSettings(res?.data?.data || res?.data || { allow_excel_export: true, allow_pdf_export: true });
    } catch { /* silenced */ }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let endpoint = '/procurement/pr';
      if (reportType === 'PO') endpoint = '/procurement/po';
      if (reportType === 'GRN') endpoint = '/procurement/grn';
      if (reportType === 'INVOICE') endpoint = '/procurement/invoices';
      if (reportType === 'ISSUE') endpoint = '/asset-issues';

      const res = await api.get(endpoint);
      setData(normalizeResponse(res));
    } catch {
      message.error('Failed to load report data');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);
  useEffect(() => {
    setDateRange(null);
    setStatusFilter(null);
    if (!reportType) { setData([]); return; }
    fetchData();
  }, [reportType]);

  const exportExcel = () => {
    if (!settings.allow_excel_export) {
      message.warning('Excel export is disabled by administrator');
      return;
    }
    if (!Array.isArray(filteredData) || filteredData.length === 0) {
      message.warning('No report data available to export');
      return;
    }
    const exportRows = filteredData.map((record) => Object.fromEntries(exportColumns.map((c) => [c.label, c.value(record)])));

    const { headerRows, sheetData } = buildBrandedExcelSheet(
      exportRows,
      exportColumns.map((c) => ({ label: c.label, value: c.label })),
      `${reportType} Report`
    );
    const worksheet = XLSX.utils.aoa_to_sheet([...headerRows, ...sheetData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, reportType);
    XLSX.writeFile(workbook, `${reportType}_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportPDF = async () => {
    if (!settings.allow_pdf_export) {
      message.warning('PDF export is disabled by administrator');
      return;
    }
    if (!Array.isArray(filteredData) || filteredData.length === 0) {
      message.warning('No report data available to export');
      return;
    }

    const doc = new jsPDF(exportColumns.length > 6 ? { orientation: 'landscape' } : undefined);
    const startY = await addPdfBranding(doc, `${reportType} Report`);

    const tableColumn = exportColumns.map((c) => c.label);
    const tableRows = filteredData.map((record) => exportColumns.map((c) => c.value(record)));

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY
    });
    doc.save(`${reportType}_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const getReferenceValue = (record) => (
    record?.pr_number ||
    record?.po_number ||
    record?.grn_number ||
    record?.invoice_number ||
    record?.issue_number ||
    '-'
  );

  const getAmountValue = (record) => {
    const amount =
      record?.estimated_cost ??
      record?.total_amount ??
      record?.repair_cost ??
      record?.amount ??
      null;

    return amount || amount === 0 ? `₹${formatCurrency(amount)}` : '-';
  };

  const isPO = reportType === 'PO';
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '-');
  // Columns shared by the table and the Excel / PDF exports; the PO report adds Vendor, Stage and Age.
  const exportColumns = [
    { label: 'Reference', value: (r) => getReferenceValue(r) },
    ...(isPO ? [{ label: 'Vendor', value: (r) => r?.Vendor?.vendor_name || '-' }] : []),
    { label: 'Property', value: (r) => r?.Property?.property_name || r?.property_name || 'N/A' },
    { label: 'Location', value: (r) => r?.Location?.location_name || r?.location_name || 'N/A' },
    { label: 'Amount', value: (r) => getAmountValue(r) },
    { label: 'Status', value: (r) => r?.status || 'N/A' },
    ...(isPO ? [
      { label: 'Stage', value: (r) => poGroupOf(r?.status)?.label || '-' },
      { label: 'Age', value: (r) => poAgeing(r)?.text || '-' },
    ] : []),
    { label: 'Date', value: (r) => fmtDate(recordDate(r)) },
  ];

  const columns = [
    { title: 'Reference', key: 'ref', render: (_, record) => getReferenceValue(record) },
    ...(isPO ? [{ title: 'Vendor', key: 'vendor', render: (_, r) => r?.Vendor?.vendor_name || '-' }] : []),
    { title: 'Property', key: 'property', render: (_, record) => record.Property?.property_name || record.property_name || 'N/A' },
    { title: 'Location', key: 'location', render: (_, record) => record.Location?.location_name || record.location_name || 'N/A' },
    { title: 'Amount', key: 'amount', render: (_, record) => getAmountValue(record) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => <Tag color="blue">{s || 'N/A'}</Tag> },
    ...(isPO ? [
      {
        title: 'Stage', key: 'stage',
        render: (_, r) => { const g = poGroupOf(r?.status); return g ? <Tag color={g.color}>{g.label}</Tag> : '-'; }
      },
      {
        title: 'Age', key: 'age',
        sorter: (a, b) => (poAgeing(a)?.days ?? -1) - (poAgeing(b)?.days ?? -1),
        render: (_, r) => {
          const age = poAgeing(r);
          if (!age) return <Text type="secondary">—</Text>;
          return <Tooltip title={age.text}><span style={{ color: age.overdue ? '#dc2626' : age.days > 14 ? '#d97706' : undefined }}>{age.days} days</span></Tooltip>;
        }
      },
    ] : []),
    { title: 'Date', key: 'date', render: (_, record) => fmtDate(recordDate(record)) }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <PageHeader
          icon={<FileText size={16} />}
          title="Procurement Reports"
          subtitle="End-to-end traceability and 3-way matching reports"
          actions={reportType && (
            <Space>
              {settings.allow_excel_export && (
                <Button className="btn-export" icon={<Download size={16} />} onClick={exportExcel}>Export Excel</Button>
              )}
              {settings.allow_pdf_export && (
                <Button className="btn-export" icon={<Download size={16} />} onClick={exportPDF}>Export PDF</Button>
              )}
            </Space>
          )}
        />

        <Card style={contentCard} styles={{ body: { padding: 20 } }}>
          <Row gutter={24} align="middle">
            <Col span={6}>
              <Text strong>Report Type</Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={reportType}
                onChange={setReportType}
                placeholder="Select a report"
              >
                {visibleReports.map((t) => <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>)}
              </Select>
            </Col>
            {reportType && (<>
            <Col span={8}>
              <Text strong>Date Range</Text>
              <DateRangeFilter style={{ width: '100%', marginTop: 8 }} value={dateRange} onChange={setDateRange} />
            </Col>
            <Col span={6}>
              <Text strong>{isPO ? 'Stage / Status' : 'Status'}</Text>
              <Select style={{ width: '100%', marginTop: 8 }} placeholder="All statuses" allowClear value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
            </Col>
            <Col span={4}>
              {filtersOn && <Button style={{ marginTop: 28, width: '100%' }} onClick={() => { setDateRange(null); setStatusFilter(null); }}>Clear filters</Button>}
            </Col>
            </>)}
          </Row>
        </Card>

        <Card style={contentCard} styles={{ body: { padding: reportType ? 0 : 20 } }}>
          {!reportType ? (
            <>
              <Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>Choose a report to view its results</Text>
              <Row gutter={[16, 16]}>
                {visibleReports.map(({ value, label, description, icon: Icon, color }) => (
                  <Col xs={24} sm={12} xl={8} key={value}>
                    <Card
                      hoverable
                      onClick={() => setReportType(value)}
                      style={{ height: '100%', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}
                      styles={{ body: { padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start' } }}
                    >
                      <span style={{ flex: 'none', width: 42, height: 42, borderRadius: 12, background: `${color}14`, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={20} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ display: 'block', marginBottom: 4 }}>{label}</Text>
                        <Text type="secondary" style={{ fontSize: 13 }}>{description}</Text>
                      </div>
                      <ChevronRight size={18} color="var(--color-text-muted, #9ca3af)" style={{ flex: 'none', marginTop: 12 }} />
                    </Card>
                  </Col>
                ))}
              </Row>
            </>
          ) : (
          <Table
            columns={columns}
            locale={{ emptyText: filtersOn ? 'No records match these filters' : 'No records found' }}
            dataSource={filteredData}
            loading={loading}
            rowKey="id"
            size="middle"
            pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], showTotal: (total) => `${total} records` }}
            scroll={{ x: 'max-content' }}
          />
          )}
        </Card>

      </Space>
    </div>
  );
};

export default ProcurementReports;
