import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Statistic, Table, Tabs, Tag, Typography, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Boxes, RefreshCcw, PackageMinus, PackagePlus, FilePlus2, Search } from 'lucide-react';
import api from '../utils/api';
import { getStoredUser } from '../utils/session';
import { normalizeResponse } from '../utils/apiNormalizer';
import PageHeader from '../components/PageHeader';

const { Text } = Typography;

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

const STATUS = {
  IN_STOCK: { color: 'success', label: 'In stock' },
  LOW: { color: 'warning', label: 'Running low' },
  OUT_OF_STOCK: { color: 'error', label: 'Out of stock' }
};
const UNITS = ['Nos', 'Kg', 'Liters', 'Meters', 'Pack'];
const ISSUER_ROLES = ['SUPER_ADMIN', 'PROVIDER_ADMIN', 'CLIENT_ADMIN', 'DEV_ADMIN', 'ADMIN', 'WAREHOUSE', 'PROCUREMENT'];

const inr = (v) => (v === null || v === undefined ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const qty = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

const InHouseStock = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(params.get('q') || '');
  const [status, setStatus] = useState('ALL');
  const [issueItem, setIssueItem] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [prs, setPrs] = useState([]);
  const [form] = Form.useForm();
  // Add stock (stock arriving from outside)
  const [receipts, setReceipts] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState('existing');
  const [stores, setStores] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [addForm] = Form.useForm();
  const role = String(getStoredUser()?.role || '').toUpperCase().replace(/\s+/g, '_');
  const canIssue = ISSUER_ROLES.includes(role);

  const load = async () => {
    setLoading(true);
    try {
      const [stockRes, issueRes, receiptRes] = await Promise.all([
        api.get('/in-house-stock'),
        api.get('/in-house-stock/issues').catch(() => null),
        api.get('/in-house-stock/receipts').catch(() => null)
      ]);
      setRows(stockRes?.data?.data || []);
      setSummary(stockRes?.data?.summary || null);
      setIssues(issueRes?.data?.data || []);
      setReceipts(receiptRes?.data?.data || []);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not load the in-house stock');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => (status === 'ALL' || r.status === status)
      && (!term || [r.item_name, r.sku_code, r.description, ...r.locations.map((l) => l.location_name)].some((v) => String(v || '').toLowerCase().includes(term))));
  }, [rows, search, status]);

  const openIssue = async (item) => {
    setIssueItem(item);
    const best = [...item.locations].sort((a, b) => b.quantity - a.quantity)[0];
    form.setFieldsValue({ location_id: best?.location_id, quantity: 1, issued_to: '', issued_department: '', pr_id: params.get('pr') ? Number(params.get('pr')) : undefined, notes: '' });
    if (!prs.length) {
      try {
        const res = await api.get('/procurement/pr');
        setPrs(normalizeResponse(res?.data).filter((p) => !['REJECTED', 'CANCELLED', 'PO_CREATED'].includes(p.status)));
      } catch { /* linking a PR is optional */ }
    }
  };

  const submitIssue = async (values) => {
    setIssuing(true);
    try {
      const res = await api.post('/in-house-stock/issue', { ...values, item_id: issueItem.id });
      message.success(res?.data?.message || 'Issued');
      setIssueItem(null);
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not issue the stock');
    } finally {
      setIssuing(false);
    }
  };

  const openAdd = async (item = null) => {
    setAddMode(item || rows.length ? 'existing' : 'new');
    addForm.resetFields();
    addForm.setFieldsValue({
      item_id: item?.id,
      location_id: item?.locations?.[0]?.location_id,
      quantity: 1,
      unit_cost: item?.unit_cost ?? undefined,
      new_item: { unit: 'Nos', reorder_level: 0 }
    });
    setAddOpen(true);
    try {
      const [locRes, vendorRes] = await Promise.all([
        stores.length ? null : api.get('/masters/locations'),
        suppliers.length ? null : api.get('/masters/vendors').catch(() => null)
      ]);
      if (locRes) {
        const list = normalizeResponse(locRes?.data).filter((l) => l.status !== 'INACTIVE');
        setStores(list);
        if (!addForm.getFieldValue('location_id') && list.length) addForm.setFieldsValue({ location_id: list[0].id });
      }
      if (vendorRes) setSuppliers(normalizeResponse(vendorRes?.data));
    } catch {
      message.error('Could not load the store locations');
    }
  };

  const submitAdd = async (values) => {
    setAdding(true);
    try {
      const payload = {
        location_id: values.location_id,
        quantity: values.quantity,
        unit_cost: values.unit_cost ?? null,
        supplier_id: values.supplier_id || null,
        reference: values.reference,
        notes: values.notes,
        ...(addMode === 'existing' ? { item_id: values.item_id } : { new_item: values.new_item })
      };
      const res = await api.post('/in-house-stock/receive', payload);
      message.success(res?.data?.message || 'Stock added');
      setAddOpen(false);
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not add the stock');
    } finally {
      setAdding(false);
    }
  };

  const loadSample = async () => {
    setSeeding(true);
    try {
      const res = await api.post('/in-house-stock/sample');
      message.success(res?.data?.message || 'Sample stock added');
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Could not add the sample stock');
    } finally {
      setSeeding(false);
    }
  };

  const selectedLocation = Form.useWatch('location_id', form);
  const available = issueItem?.locations.find((l) => l.location_id === selectedLocation)?.quantity || 0;

  const columns = [
    {
      title: 'Item', dataIndex: 'item_name', key: 'item', sorter: (a, b) => a.item_name.localeCompare(b.item_name),
      render: (v, r) => <div><Text strong>{v}</Text><div><Text type="secondary" style={{ fontSize: 12 }}>{r.sku_code}</Text></div></div>
    },
    { title: 'Group', dataIndex: 'description', key: 'group', render: (v) => v || '—' },
    {
      title: 'Store', key: 'store',
      render: (_, r) => (r.locations.length
        ? r.locations.map((l) => <div key={l.location_id} style={{ whiteSpace: 'nowrap' }}>{l.location_name}{r.locations.length > 1 ? <Text type="secondary"> · {qty(l.quantity)}</Text> : null}</div>)
        : '—')
    },
    {
      title: 'On hand', dataIndex: 'on_hand', key: 'on_hand', align: 'right', sorter: (a, b) => a.on_hand - b.on_hand,
      render: (v, r) => <Text strong>{qty(v)} <Text type="secondary" style={{ fontWeight: 400 }}>{r.unit}</Text></Text>
    },
    { title: 'Reorder at', dataIndex: 'reorder_level', key: 'reorder', align: 'right', render: (v) => qty(v) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v) => <Tag color={STATUS[v]?.color}>{STATUS[v]?.label || v}</Tag> },
    { title: 'Value', dataIndex: 'value', key: 'value', align: 'right', sorter: (a, b) => (a.value || 0) - (b.value || 0), render: inr },
    {
      title: 'Action', key: 'action', fixed: 'right',
      render: (_, r) => (
        <Space size={6}>
          {r.on_hand > 0
            ? <Button size="small" icon={<PackageMinus size={14} />} disabled={!canIssue} title={canIssue ? '' : 'Only the store, procurement or an admin can issue stock'} onClick={() => openIssue(r)}>Issue</Button>
            : <Button size="small" type="link" icon={<FilePlus2 size={14} />} onClick={() => navigate('/procurement/requisition')}>Raise PR</Button>}
          {canIssue && <Button size="small" icon={<PackagePlus size={14} />} onClick={() => openAdd(r)}>Add</Button>}
        </Space>
      )
    }
  ];

  const issueColumns = [
    { title: 'Issue no.', dataIndex: 'issue_number', key: 'no', render: (v) => <Text strong>{v}</Text> },
    { title: 'Date', dataIndex: 'issued_at', key: 'date', render: when },
    { title: 'Item', dataIndex: 'item_name', key: 'item' },
    { title: 'Qty', dataIndex: 'quantity', key: 'qty', align: 'right', render: (v, r) => `${qty(v)} ${r.unit || ''}` },
    { title: 'From store', dataIndex: 'location_name', key: 'loc' },
    { title: 'Issued to', dataIndex: 'issued_to', key: 'to', render: (v, r) => <div>{v}{r.issued_department ? <div><Text type="secondary" style={{ fontSize: 12 }}>{r.issued_department}</Text></div> : null}</div> },
    { title: 'Instead of PR', dataIndex: 'pr_number', key: 'pr', render: (v) => v || '—' },
    { title: 'Issued by', dataIndex: 'issued_by', key: 'by' },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', render: (v) => v || '—' }
  ];

  const receiptColumns = [
    { title: 'Date', dataIndex: 'added_at', key: 'date', render: when },
    { title: 'Item', dataIndex: 'item_name', key: 'item', render: (v, r) => <div>{v}<div><Text type="secondary" style={{ fontSize: 12 }}>{r.sku_code}</Text></div></div> },
    { title: 'Qty', dataIndex: 'quantity', key: 'qty', align: 'right', render: (v, r) => `${qty(v)} ${r.unit || ''}` },
    { title: 'Unit cost', dataIndex: 'unit_cost', key: 'cost', align: 'right', render: inr },
    { title: 'To store', dataIndex: 'location_name', key: 'loc' },
    { title: 'Supplier', dataIndex: 'supplier', key: 'sup', render: (v) => v || '—' },
    { title: 'Reference', dataIndex: 'reference', key: 'ref', render: (v) => v || '—' },
    { title: 'Added by', dataIndex: 'added_by', key: 'by', render: (v) => v || '—' },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', render: (v) => v || '—' }
  ];

  const stats = [
    { title: 'Stock items', value: summary?.items ?? 0 },
    { title: 'In stock', value: summary?.in_stock ?? 0, color: 'var(--color-success, #16a34a)' },
    { title: 'Running low', value: summary?.low ?? 0, color: 'var(--color-warning, #d97706)' },
    { title: 'Out of stock', value: summary?.out_of_stock ?? 0, color: 'var(--color-danger, #dc2626)' },
    { title: 'Stock value', value: inr(summary?.value ?? 0) }
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<Boxes size={16} />}
        title="In-house Stock"
        subtitle={`Check the store before raising a purchase requisition · ${rows.length} items`}
        actions={
          <Space wrap size={8}>
            <Button icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>
            {canIssue && <Button icon={<PackagePlus size={16} />} onClick={() => openAdd()}>Add stock</Button>}
            <Button type="primary" icon={<FilePlus2 size={16} />} onClick={() => navigate('/procurement/requisition')} style={primaryBtn}>Raise PR</Button>
          </Space>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {stats.map((s) => (
          <Col xs={12} md={8} lg={{ flex: '1 1 0' }} key={s.title}>
            <Card style={contentCard} styles={{ body: { padding: 16 } }}>
              <Statistic title={s.title} value={s.value} valueStyle={{ fontSize: 22, fontWeight: 700, color: s.color }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={contentCard} styles={{ body: { padding: 16 } }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          If the item a requester needs is in stock, issue it from the store instead of raising a PR. Only items that are out of stock, or not enough, need a purchase requisition.
        </Text>
        <Tabs
          items={[
            {
              key: 'stock',
              label: 'Stock',
              children: (
                <>
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Input allowClear prefix={<Search size={14} />} placeholder="Search item, code, group or store" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 300 }} />
                    <Select value={status} onChange={setStatus} style={{ width: 170 }} options={[
                      { value: 'ALL', label: 'All items' },
                      { value: 'IN_STOCK', label: 'In stock' },
                      { value: 'LOW', label: 'Running low' },
                      { value: 'OUT_OF_STOCK', label: 'Out of stock' }
                    ]} />
                  </Space>
                  <Table
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={filtered}
                    size="middle"
                    pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], showTotal: (total) => `${total} items` }}
                    scroll={{ x: 'max-content' }}
                    locale={{
                      emptyText: (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{rows.length ? 'No items match the search' : 'No stock items yet'}</Text>}>
                          {!rows.length && canIssue && <Button onClick={loadSample} loading={seeding}>Load sample stock</Button>}
                        </Empty>
                      )
                    }}
                  />
                </>
              )
            },
            {
              key: 'issues',
              label: `Issued to requesters (${issues.length})`,
              children: (
                <Table
                  rowKey="id"
                  loading={loading}
                  columns={issueColumns}
                  dataSource={issues}
                  size="middle"
                  pagination={{ pageSize: 10, showTotal: (total) => `${total} issues` }}
                  scroll={{ x: 'max-content' }}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">Nothing issued from stock yet</Text>} /> }}
                />
              )
            },
            {
              key: 'receipts',
              label: `Stock added (${receipts.length})`,
              children: (
                <Table
                  rowKey="id"
                  loading={loading}
                  columns={receiptColumns}
                  dataSource={receipts}
                  size="middle"
                  pagination={{ pageSize: 10, showTotal: (total) => `${total} entries` }}
                  scroll={{ x: 'max-content' }}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">No stock added yet</Text>} /> }}
                />
              )
            }
          ]}
        />
      </Card>

      <Modal
        title={issueItem ? `Issue from stock — ${issueItem.item_name}` : 'Issue from stock'}
        open={!!issueItem}
        onCancel={() => setIssueItem(null)}
        onOk={() => form.submit()}
        okText="Issue"
        okButtonProps={{ loading: issuing, style: primaryBtn }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submitIssue}>
          <Form.Item name="location_id" label="From store" rules={[{ required: true, message: 'Choose the store' }]}>
            <Select options={(issueItem?.locations || []).map((l) => ({ value: l.location_id, label: `${l.location_name} — ${qty(l.quantity)} ${issueItem.unit} available`, disabled: l.quantity <= 0 }))} />
          </Form.Item>
          <Form.Item
            name="quantity"
            label={`Quantity (${issueItem?.unit || ''})`}
            extra={`${qty(available)} available at this store`}
            rules={[{ required: true, message: 'Enter the quantity' }, { type: 'number', min: 0.01, max: available, message: `Between 0 and ${qty(available)}` }]}
          >
            <InputNumber min={0} max={available} style={{ width: '100%' }} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="issued_to" label="Issued to" rules={[{ required: true, whitespace: true, message: 'Enter the person receiving it' }]}>
              <Input placeholder="Requester's name" />
            </Form.Item>
            <Form.Item name="issued_department" label="Department">
              <Input placeholder="e.g., HR" />
            </Form.Item>
          </div>
          <Form.Item name="pr_id" label="Instead of PR (optional)" extra="If a PR was raised for this item, link it so it is not bought again.">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Choose the PR" options={prs.map((p) => ({ value: p.id, label: `${p.pr_number || `PR #${p.id}`} · ${p.requestor_name || ''}` }))} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} placeholder="Purpose or any remarks" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add stock"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => addForm.submit()}
        okText="Add to stock"
        okButtonProps={{ loading: adding, style: primaryBtn }}
        destroyOnClose
        width={620}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          For stock that arrives from outside: bought locally, returned by an employee, or moved in from another site. Goods bought on a PO are added through Goods Receipt (GRN).
        </Text>
        <Segmented
          block
          value={addMode}
          onChange={setAddMode}
          style={{ marginBottom: 16 }}
          options={[{ label: 'Existing item', value: 'existing' }, { label: 'New item', value: 'new' }]}
        />
        <Form form={addForm} layout="vertical" onFinish={submitAdd}>
          {addMode === 'existing' ? (
            <Form.Item name="item_id" label="Item" rules={[{ required: true, message: 'Choose the item' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Search the stock item"
                options={rows.map((r) => ({ value: r.id, label: `${r.item_name} (${r.sku_code}) · ${qty(r.on_hand)} ${r.unit} on hand` }))}
              />
            </Form.Item>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 16px' }}>
                <Form.Item name={['new_item', 'item_name']} label="Item name" rules={[{ required: true, whitespace: true, message: 'Enter the item name' }]}>
                  <Input placeholder="e.g., Printer ink, black" />
                </Form.Item>
                <Form.Item name={['new_item', 'unit']} label="Unit" rules={[{ required: true, message: 'Choose the unit' }]}>
                  <Select options={UNITS.map((u) => ({ value: u, label: u }))} />
                </Form.Item>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
                <Form.Item name={['new_item', 'group']} label="Group">
                  <Input placeholder="e.g., Stationery" />
                </Form.Item>
                <Form.Item name={['new_item', 'sku_code']} label="Item code" extra="Blank: created for you">
                  <Input placeholder="Optional" />
                </Form.Item>
                <Form.Item name={['new_item', 'reorder_level']} label="Reorder at">
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </div>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="location_id" label="To store" rules={[{ required: true, message: 'Choose the store' }]}>
              <Select placeholder="Choose the store" options={stores.map((l) => ({ value: l.id, label: l.location_name }))} notFoundContent="No locations: add one in Master Data" />
            </Form.Item>
            <Form.Item name="quantity" label="Quantity" rules={[{ required: true, message: 'Enter the quantity' }, { type: 'number', min: 0.01, message: 'More than 0' }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="unit_cost" label="Unit cost (₹)">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="Optional" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="supplier_id" label="Supplier (optional)">
              <Select allowClear showSearch optionFilterProp="label" placeholder="Choose the vendor" options={suppliers.map((v) => ({ value: v.id, label: v.vendor_name }))} />
            </Form.Item>
            <Form.Item name="reference" label="Reference">
              <Input placeholder="Bill / challan / return slip no." />
            </Form.Item>
          </div>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} placeholder="Where it came from, condition, etc." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default InHouseStock;
