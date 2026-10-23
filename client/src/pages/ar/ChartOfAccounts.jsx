import React, { useState } from 'react';
import { Button, Card, Form, Input, Select, Space, Table, Tag, message } from 'antd';
import { Plus, BookOpen } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { NAVY_HEAD, SOURCES, readArStore, writeArStore } from '../../utils/arLedger';

const TYPES = ['Group', 'Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

const ChartOfAccounts = () => {
  const [store, setStore] = useState(() => readArStore());
  const [form] = Form.useForm();

  const save = (values) => {
    if (store.accounts.some((account) => account.code === values.code)) {
      message.error('That account code already exists');
      return;
    }
    const next = writeArStore({
      ...store,
      accounts: [...store.accounts, { ...values, openingDr: 0, openingCr: 0 }].sort((a, b) => a.code.localeCompare(b.code)),
    });
    setStore(next);
    form.resetFields();
    message.success('Account added to the chart');
  };

  return (
    <div>
      <PageHeader icon={BookOpen} title="Chart of Accounts" subtitle="The accounting structure used for posting transactions." />
      <Card style={{ borderRadius: 16, marginBottom: 16 }} styles={{ body: { padding: 0 } }} title="Sample COA">
        <Table
          rowKey="code"
          pagination={false}
          dataSource={store.accounts}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 140, onHeaderCell: NAVY_HEAD },
            { title: 'Account', dataIndex: 'name', onHeaderCell: NAVY_HEAD },
            { title: 'Type', dataIndex: 'type', width: 160, onHeaderCell: NAVY_HEAD, render: (type) => <Tag>{type}</Tag> },
          ]}
        />
      </Card>
      <Card title="Add account" style={{ borderRadius: 16, marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={save}>
          <Form.Item name="code" rules={[{ required: true, message: 'Code' }]}><Input placeholder="Code" /></Form.Item>
          <Form.Item name="name" rules={[{ required: true, message: 'Account' }]}><Input placeholder="Account name" /></Form.Item>
          <Form.Item name="type" initialValue="Asset" rules={[{ required: true }]}>
            <Select style={{ width: 140 }} options={TYPES.map((type) => ({ value: type, label: type }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<Plus size={16} />}>Add</Button>
        </Form>
      </Card>
      <Card style={{ borderRadius: 16, background: '#EEF3FA', borderColor: '#D6E2F0' }}>
        <Space wrap>
          {SOURCES.map((source) => <Tag key={source} color="processing">{source}</Tag>)}
        </Space>
        <div style={{ marginTop: 12 }}>All transactions eventually create journal entries.</div>
      </Card>
    </div>
  );
};

export default ChartOfAccounts;
