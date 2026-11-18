import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import { ListChecks, Plus } from 'lucide-react';
import api from '../../utils/api';
import { PageHeader } from '../../components/ar/ArShared';
import { useExcelExport } from '../../utils/apReports';
import { card, errorOf, inr } from '../../utils/arFlow';

const { Text } = Typography;
const TYPE_COLOR = { ASSET: 'blue', LIABILITY: 'orange', EQUITY: 'purple', INCOME: 'green', EXPENSE: 'red' };
const TYPE_LABEL = { ASSET: 'Asset', LIABILITY: 'Liability', EQUITY: 'Equity', INCOME: 'Income', EXPENSE: 'Expense' };

const ChartOfAccounts = () => {
  const { exportSheets } = useExcelExport();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ types: [], can_add: false });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [type, setType] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/r2r/accounts');
      setRows(r?.data?.data || []);
      setMeta(r?.data?.meta || { types: [], can_add: false });
    } catch (e) {
      message.error(errorOf(e, 'Could not load the chart of accounts'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!type || r.type === type) && (!q || r.code.includes(q) || String(r.name).toLowerCase().includes(q)));
  }, [rows, search, type]);

  const add = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const r = await api.post('/r2r/accounts', values);
      message.success(r?.data?.message || 'Account added');
      setAdding(false);
      form.resetFields();
      load();
    } catch (e) {
      message.error(errorOf(e, 'Could not add the account'));
    } finally {
      setBusy(false);
    }
  };

  const exportChart = () => exportSheets([{
    name: 'Chart of accounts', title: 'Chart of accounts', rows: shown,
    columns: [
      { label: 'Code', value: (r) => r.code }, { label: 'Account', value: (r) => r.name }, { label: 'Type', value: (r) => TYPE_LABEL[r.type] || r.type },
      { label: 'Debit', value: (r) => r.debit }, { label: 'Credit', value: (r) => r.credit }, { label: 'Balance (Dr +)', value: (r) => r.balance },
      { label: 'Control account', value: (r) => r.control || '' },
    ],
  }], 'Chart_of_Accounts');

  const columns = [
    { title: 'Code', dataIndex: 'code', width: 90 },
    {
      title: 'Account', dataIndex: 'name',
      render: (v, r) => (
        <div>
          <Text strong>{v}</Text>
          {r.description && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.description}</Text></div>}
        </div>
      ),
    },
    { title: 'Type', dataIndex: 'type', width: 110, render: (v) => <Tag color={TYPE_COLOR[v]}>{TYPE_LABEL[v] || v}</Tag> },
    { title: 'Debit', dataIndex: 'debit', align: 'right', width: 140, render: (v) => (v ? inr(v) : '') },
    { title: 'Credit', dataIndex: 'credit', align: 'right', width: 140, render: (v) => (v ? inr(v) : '') },
    { title: 'Balance', dataIndex: 'balance', align: 'right', width: 150, render: (v) => (v ? `${inr(Math.abs(v))} ${v > 0 ? 'Dr' : 'Cr'}` : '—') },
    { title: 'Posted by', dataIndex: 'control', width: 250, render: (v) => (v ? <Tag color="gold">Control: {v}</Tag> : <Text type="secondary">Any journal</Text>) },
  ];

  return (
    <div>
      <PageHeader
        icon={<ListChecks size={22} />}
        title="Chart of Accounts"
        subtitle="The accounts transactions are posted to, with the balance of each from the posted journals."
        actions={[
          <Button key="x" onClick={exportChart}>Export to Excel</Button>,
          meta.can_add && <Button key="a" type="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>Add account</Button>,
        ].filter(Boolean)}
      />

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="Control accounts are posted only by their sub-ledger"
        description="Receivables, the credit-loss allowance and unapplied cash are posted by Accounts Receivable; payables, GR/IR, vendor advances and TDS payable by Accounts Payable. A manual journal cannot touch them, so each sub-ledger always ties to the ledger."
      />

      <Card style={card} styles={{ body: { padding: 0 } }}>
        <Space wrap style={{ padding: 16 }}>
          <Input.Search allowClear placeholder="Search code or name" style={{ width: 260 }} onChange={(e) => setSearch(e.target.value)} />
          <Select
            allowClear placeholder="All types" style={{ width: 160 }} value={type} onChange={setType}
            options={(meta.types || []).map((t) => ({ value: t, label: TYPE_LABEL[t] || t }))}
          />
          <Text type="secondary">{shown.length} account{shown.length === 1 ? '' : 's'}</Text>
        </Space>
        <Table rowKey="code" loading={loading} dataSource={shown} columns={columns} pagination={{ pageSize: 25 }} scroll={{ x: 950 }} />
      </Card>

      <Modal open={adding} title="Add a ledger account" onCancel={() => setAdding(false)} onOk={add} confirmLoading={busy} okText="Add account" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Account code" rules={[{ required: true, pattern: /^\d{4,6}$/, message: '4 to 6 digits, e.g. 6600' }]}>
            <Input placeholder="e.g. 6600" />
          </Form.Item>
          <Form.Item name="name" label="Account name" rules={[{ required: true, message: 'Enter the account name' }]}>
            <Input placeholder="e.g. Bank charges" />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true, message: 'Choose the type' }]}>
            <Select options={(meta.types || []).map((t) => ({ value: t, label: TYPE_LABEL[t] || t }))} />
          </Form.Item>
          <Form.Item name="description" label="What it holds">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ChartOfAccounts;
