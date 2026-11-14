import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Drawer, Form, Input, InputNumber, Modal, Space, Table, Tabs, Tag, Typography, message, Empty, Popconfirm, Tooltip } from 'antd';
import { RefreshCcw, PlayCircle, Plus, GitMerge, Eye, Edit2 } from 'lucide-react';
import api from '../utils/api';
import { safeApiCall } from '../utils/safeApiCall';
import PageHeader from '../components/PageHeader';
import { ActivityTrail, lastActionColumn, useLastActions } from '../components/procurement/ActivityTrail';

const { Title, Text } = Typography;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };

const STATUS_COLORS = {
  MATCHED: 'green',
  TOLERANCE_BREACH: 'orange',
  BLOCKED: 'red',
  PENDING: 'default'
};

const extractList = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data?.rows)) return res.data.rows;
  if (Array.isArray(res?.rows)) return res.rows;
  return [];
};

const inrText = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

const ThreeWayMatch = () => {
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [rules, setRules] = useState([]);
  const [activeTab, setActiveTab] = useState('matches');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [form] = Form.useForm();

  const loadInvoices = async () => {
    setLoading(true);
    const primaryRes = await safeApiCall(() => api.get('/three-way-match/invoices'));
    let list = extractList(primaryRes);

    if (!list.length) {
      const fallbackRes = await safeApiCall(() => api.get('/procurement/invoices'));
      const fallbackList = extractList(fallbackRes);
      list = fallbackList.map((inv) => ({
        ...inv,
        ThreeWayMatch: inv.ThreeWayMatch || null
      }));
    }

    setInvoices(list);
    setLoading(false);
  };

  const loadRules = async () => {
    const res = await safeApiCall(() => api.get('/three-way-match/tolerance-rules'));
    const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    setRules(list);
  };

  const refreshAll = async () => {
    await Promise.all([loadInvoices(), loadRules()]);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const runMatch = async (invoiceId) => {
    await api.post(`/three-way-match/match/${invoiceId}`);
    message.success('3-way match executed');
    await loadInvoices();
  };

  const openRuleModal = (row) => {
    if (row) {
      form.setFieldsValue(row);
    } else {
      form.resetFields();
      form.setFieldsValue({ applies_to: 'BOTH', tolerance_pct: 5, tolerance_amount: 0, price_tolerance_pct: 1, price_tolerance_amount: 100, qty_tolerance_pct: 0, is_active: true });
    }
    setRuleModalOpen(true);
  };

  const saveRule = async () => {
    try {
      const values = await form.validateFields();
      setSavingRule(true);
      await api.post('/three-way-match/tolerance-rules', values);
      setSavingRule(false);
      setRuleModalOpen(false);
      await loadRules();
      message.success('Tolerance rule saved');
    } catch {
      setSavingRule(false);
    }
  };

  const lastActions = useLastActions('INVOICE', invoices, invoices);

  const matchColumns = useMemo(() => ([
    { title: 'Invoice', dataIndex: 'invoice_number', key: 'invoice_number' },
    { title: 'PO', key: 'po_number', render: (_, r) => r.PurchaseOrder?.po_number || '-' },
    { title: 'GRN / SES', key: 'grn_number', render: (_, r) => r.GRN?.grn_number || r.ServiceEntrySheet?.ses_number || '-' },
    { title: 'Invoice Amount', dataIndex: 'total_amount', key: 'total_amount' },
    {
      title: 'Status',
      key: 'status',
      render: (_, r) => {
        const s = r.ThreeWayMatch?.status || 'PENDING';
        return <Tag color={STATUS_COLORS[s] || 'default'}>{(s) ? (s).charAt(0)+(s).slice(1).toLowerCase() : '—'}</Tag>;
      }
    },
    lastActionColumn('INVOICE', lastActions, { numberOf: (r) => r.invoice_number }),
    {
      title: 'Action',
      key: 'action',
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Run Match">
            <Button type="text" size="small" icon={<GitMerge size={15} color="var(--color-navy)" />} onClick={() => runMatch(r.id)} />
          </Tooltip>
          <Tooltip title="View">
            <Button type="text" size="small" icon={<Eye size={15} color="var(--color-navy)" />} onClick={() => { setSelectedRow(r); setDrawerOpen(true); }} />
          </Tooltip>
        </Space>
      )
    }
  ]), [lastActions]); // eslint-disable-line react-hooks/exhaustive-deps

  const ruleColumns = useMemo(() => ([
    { title: 'Rule', dataIndex: 'rule_name', key: 'rule_name' },
    { title: 'Applies To', dataIndex: 'applies_to', key: 'applies_to' },
    { title: 'Bill total', key: 'total', render: (_, r) => `${Number(r.tolerance_pct)}%${Number(r.tolerance_amount) ? ` or ₹${Number(r.tolerance_amount)}` : ''}` },
    { title: 'Line price', key: 'price', render: (_, r) => `${Number(r.price_tolerance_pct ?? 1)}%${Number(r.price_tolerance_amount ?? 100) ? ` or ₹${Number(r.price_tolerance_amount ?? 100)} (lower)` : ''}` },
    { title: 'Line qty', key: 'qty', render: (_, r) => (Number(r.qty_tolerance_pct ?? 0) ? `${Number(r.qty_tolerance_pct)}%` : 'Exact') },
    { title: 'Active', key: 'is_active', render: (_, r) => (r.is_active ? 'Yes' : 'No') },
    { title: 'Actions', key: 'edit', render: (_, r) => <Tooltip title="Edit"><Button type="text" size="small" icon={<Edit2 size={15} color="var(--color-navy)" />} onClick={() => openRuleModal(r)} /></Tooltip> }
  ]), [openRuleModal]);

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <PageHeader
          icon={<GitMerge size={16} />}
          title="3-Way Match"
          subtitle="Invoice matching and tolerance rule management"
          actions={<Button className="btn-refresh" icon={<RefreshCcw size={16} />} onClick={refreshAll}>Refresh</Button>}
        />

        <Card style={contentCard} styles={{ body: { padding: 16 } }}>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            {
              key: 'matches',
              label: 'Invoice Matches',
              children: <Table rowKey="id" loading={loading} locale={{ emptyText: 'No records found' }} dataSource={invoices} columns={matchColumns} pagination={{ pageSize: 10, showTotal: (total) => `Total: ${total}` }} scroll={{ x: 'max-content' }} size="middle" />
            },
            {
              key: 'rules',
              label: 'Tolerance Rules',
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" icon={<GitMerge size={16} />} onClick={() => openRuleModal(null)}>Add Rule</Button>
                  </Space>
                  <Table rowKey="id" locale={{ emptyText: 'No records found' }} dataSource={rules} columns={ruleColumns} pagination={{ pageSize: 10, showTotal: (total) => `Total: ${total}` }} scroll={{ x: 'max-content' }} size="middle" />
                </>
              )
            }
          ]} />
        </Card>

        <Drawer
          title="Match Details"
          open={drawerOpen}
          width={700}
          onClose={() => setDrawerOpen(false)}
        >
          {!selectedRow && <Text type="secondary">No invoice selected</Text>}
          {selectedRow && (
            <>
              <Table
                pagination={false}
                rowKey="label"
                locale={{ emptyText: 'No records found' }}
                dataSource={[
                { label: 'Invoice Number', value: selectedRow.invoice_number },
                { label: 'PO Number', value: selectedRow.PurchaseOrder?.po_number || '-' },
                selectedRow.ServiceEntrySheet
                  ? { label: 'Service Entry Sheet', value: selectedRow.ServiceEntrySheet.ses_number }
                  : { label: 'GRN Number', value: selectedRow.GRN?.grn_number || 'All receipts on the PO' },
                { label: 'PO Amount', value: selectedRow.PurchaseOrder?.total_amount || '-' },
                { label: 'Invoice Amount', value: selectedRow.total_amount || '-' },
                ...(selectedRow.ThreeWayMatch?.details ? [
                  { label: 'Received on PO (before GST)', value: inrText(selectedRow.ThreeWayMatch.details.received_value) },
                  { label: 'Billed earlier on PO', value: inrText(selectedRow.ThreeWayMatch.details.billed_before) },
                  { label: 'Open to bill', value: inrText(selectedRow.ThreeWayMatch.details.open_value) },
                  { label: 'This bill (before GST)', value: inrText(selectedRow.ThreeWayMatch.details.invoice_base) },
                ] : []),
                { label: 'Qty Variance', value: selectedRow.ThreeWayMatch?.qty_variance ?? '-' },
                { label: 'Amount Variance', value: selectedRow.ThreeWayMatch?.amount_variance ?? '-' },
                { label: 'Tolerance %', value: selectedRow.ThreeWayMatch?.tolerance_pct ?? '-' }
              ]}
              columns={[
                { title: 'Field', dataIndex: 'label', key: 'label' },
                { title: 'Value', dataIndex: 'value', key: 'value' }
              ]}
              size="middle"
            />
              {selectedRow.ThreeWayMatch?.blocked_reason && (
                <Alert
                  style={{ marginTop: 12 }}
                  type="warning"
                  showIcon
                  message="Why the match failed"
                  description={<ul style={{ margin: 0, paddingLeft: 18 }}>{String(selectedRow.ThreeWayMatch.blocked_reason).split('; ').map((r) => <li key={r}>{r}</li>)}</ul>}
                />
              )}
              {selectedRow.ThreeWayMatch?.details?.lines?.some((l) => l.po_item_id) && (
                <Table
                  style={{ marginTop: 12 }}
                  size="small"
                  pagination={false}
                  rowKey="line_no"
                  dataSource={selectedRow.ThreeWayMatch.details.lines}
                  columns={[
                    { title: '#', dataIndex: 'line_no', width: 40 },
                    { title: 'Bill line', dataIndex: 'description', render: (v, l) => <div>{v}<div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{l.item_name ? `PO line: ${l.item_name}` : 'Not linked to a PO line'}</div></div> },
                    { title: 'Qty / open', key: 'qty', render: (_, l) => (l.po_item_id ? `${l.qty ?? '—'} / ${l.open_qty ?? '—'}` : '—') },
                    { title: 'Rate / PO rate', key: 'rate', render: (_, l) => (l.po_item_id ? `${l.unit_price != null ? inrText(l.unit_price) : '—'} / ${inrText(l.po_price)}` : '—') },
                    { title: '', key: 'ok', render: (_, l) => (!l.po_item_id ? null : l.issues?.length ? <Tag color="error">Mismatch</Tag> : <Tag color="success">OK</Tag>) },
                  ]}
                />
              )}
              <div style={{ marginTop: 20 }}>
                <ActivityTrail module="INVOICE" id={selectedRow.id} refreshKey={invoices} />
              </div>
            </>
          )}
        </Drawer>

        <Modal
          title="Tolerance Rule"
          open={ruleModalOpen}
          confirmLoading={savingRule}
          onOk={saveRule}
          onCancel={() => setRuleModalOpen(false)}
        >
          <Form form={form} layout="vertical">
            <Form.Item name="id" hidden><Input /></Form.Item>
            <Form.Item name="rule_name" label="Rule Name" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="applies_to" label="Applies To" rules={[{ required: true }]}>
              <Input placeholder="QTY / AMOUNT / BOTH" />
            </Form.Item>
            <Form.Item name="tolerance_pct" label="Bill total: tolerance %" rules={[{ required: true }]}
              extra="The bill before GST may exceed what was received and not yet billed by this much (or the amount below, whichever is larger).">
              <InputNumber style={{ width: '100%' }} min={0} max={100} />
            </Form.Item>
            <Form.Item name="tolerance_amount" label="Bill total: tolerance amount (₹)">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="price_tolerance_pct" label="Each line: rate above PO price, %"
              extra="A line's rate may be above the PO price by this % or the amount below, whichever is lower.">
              <InputNumber style={{ width: '100%' }} min={0} max={100} />
            </Form.Item>
            <Form.Item name="price_tolerance_amount" label="Each line: rate above PO price, amount (₹)">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="qty_tolerance_pct" label="Each line: quantity above received, %" extra="0 = quantity must not exceed what was received and not yet billed.">
              <InputNumber style={{ width: '100%' }} min={0} max={100} />
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </div>
  );
};

export default ThreeWayMatch;
