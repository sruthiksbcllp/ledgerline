import React, { useState, useEffect } from 'react';
import {
  Table, Card, Tag, Space, DatePicker, Select,
  Row, Col, Typography, message, Button, Empty
} from 'antd';
import { FileText, Download, Filter } from 'lucide-react';
import api from '../utils/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../utils/format';
import { normalizeResponse } from '../utils/apiNormalizer';
import { addPdfBranding, buildBrandedExcelSheet } from '../utils/exportBranding';
import PageHeader from '../components/PageHeader';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };

const ProcurementReports = () => {
  const [reportType, setReportType] = useState('PR');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [settings, setSettings] = useState({ allow_excel_export: true, allow_pdf_export: true });

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

  useEffect(() => {
    fetchSettings();
    fetchData();
  }, [reportType]);

  const exportExcel = () => {
    if (!settings.allow_excel_export) {
      message.warning('Excel export is disabled by administrator');
      return;
    }
    if (!Array.isArray(data) || data.length === 0) {
      message.warning('No report data available to export');
      return;
    }
    const exportRows = data.map((record) => ({
      Reference: getReferenceValue(record),
      Property: record?.Property?.property_name || record?.property_name || 'N/A',
      Location: record?.Location?.location_name || record?.location_name || 'N/A',
      Amount: getAmountValue(record),
      Status: record?.status || 'N/A',
      Date: record?.createdAt ? new Date(record.createdAt).toLocaleDateString() : '-'
    }));

    const { headerRows, sheetData } = buildBrandedExcelSheet(
      exportRows,
      [
        { label: 'Reference', value: 'Reference' },
        { label: 'Property', value: 'Property' },
        { label: 'Location', value: 'Location' },
        { label: 'Amount', value: 'Amount' },
        { label: 'Status', value: 'Status' },
        { label: 'Date', value: 'Date' }
      ],
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
    if (!Array.isArray(data) || data.length === 0) {
      message.warning('No report data available to export');
      return;
    }

    const doc = new jsPDF();
    const startY = await addPdfBranding(doc, `${reportType} Report`);

    const tableColumn = ['Reference', 'Property', 'Location', 'Amount', 'Status', 'Date'];
    const tableRows = data.map((record) => ([
      getReferenceValue(record),
      record?.Property?.property_name || record?.property_name || 'N/A',
      record?.Location?.location_name || record?.location_name || 'N/A',
      getAmountValue(record),
      record?.status || 'N/A',
      record?.createdAt ? new Date(record.createdAt).toLocaleDateString() : '-'
    ]));

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

  const columns = [
    { title: 'Reference', key: 'ref', render: (_, record) => getReferenceValue(record) },
    { title: 'Property', key: 'property', render: (_, record) => record.Property?.property_name || record.property_name || 'N/A' },
    { title: 'Location', key: 'location', render: (_, record) => record.Location?.location_name || record.location_name || 'N/A' },
    { title: 'Amount', key: 'amount', render: (_, record) => getAmountValue(record) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => <Tag color="blue">{s || 'N/A'}</Tag> },
    { title: 'Date', key: 'date', render: (_, record) => record?.createdAt ? new Date(record.createdAt).toLocaleDateString() : '-' }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <PageHeader
          icon={<FileText size={16} />}
          title="Procurement Reports"
          subtitle="End-to-end traceability and 3-way matching reports"
          actions={(
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
              >
                <Select.Option value="PR">Purchase Requisition Report</Select.Option>
                <Select.Option value="PO">Purchase Order Report</Select.Option>
                <Select.Option value="GRN">GRN Report</Select.Option>
                <Select.Option value="INVOICE">3-Way Matching Report</Select.Option>
                <Select.Option value="ISSUE">Asset Issue / Breakdown Report</Select.Option>
              </Select>
            </Col>
            <Col span={8}>
              <Text strong>Date Range</Text>
              <RangePicker style={{ width: '100%', marginTop: 8 }} />
            </Col>
            <Col span={6}>
              <Text strong>Status</Text>
              <Select style={{ width: '100%', marginTop: 8 }} placeholder="All Statuses">
                <Select.Option value="APPROVED">Approved</Select.Option>
                <Select.Option value="PENDING">Pending</Select.Option>
                <Select.Option value="EXCEPTION">Exception</Select.Option>
              </Select>
            </Col>
            <Col span={4}>
              <Button style={{ marginTop: 28, width: '100%' }} icon={<Filter size={16} />}>Filter</Button>
            </Col>
          </Row>
        </Card>

        <Card style={contentCard} styles={{ body: { padding: 0 } }}>
          <Table
            columns={columns}
            locale={{ emptyText: 'No records found' }}
            dataSource={data}
            loading={loading}
            rowKey="id"
            size="middle"
            pagination={{ showSizeChanger: true, pageSizeOptions: ['10','25','50'], showTotal: (total) => `${total} records` }}
            scroll={{ x: 'max-content' }}
          />
        </Card>

      </Space>
    </div>
  );
};

export default ProcurementReports;
