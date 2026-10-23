import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Select, Table, message } from 'antd';
import { Plus, Trash2, BookOpen } from 'lucide-react';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { NAVY_HEAD, accountLabel, inr, num, plain, readArStore, writeArStore } from '../../utils/arLedger';

const emptyLine = () => ({ key: `${Date.now()}-${Math.random()}`, account: undefined, debit: 0, credit: 0 });

const JournalEntry = () => {
  const [store, setStore] = useState(() => readArStore());
  const [header] = Form.useForm();
  const [lines, setLines] = useState([
    { key: 'a', account: '500000', debit: 50000, credit: 0 },
    { key: 'b', account: '110000', debit: 0, credit: 50000 },
  ]);

  const postable = store.accounts.filter((account) => account.type !== 'Group');
  const debit = lines.reduce((sum, line) => sum + num(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + num(line.credit), 0);
  const balanced = Math.abs(debit - credit) < 0.01 && debit > 0;

  const updateLine = (key, patch) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const post = async () => {
    const values = await header.validateFields();
    if (store.frozen) {
      message.error('The period is frozen. Reopen period close before posting.');
      return;
    }
    if (!balanced) {
      message.error('Total Debit must equal Total Credit');
      return;
    }
    if (lines.some((line) => !line.account)) {
      message.error('Every line needs an account');
      return;
    }
    const journal = {
      id: `JE-${Date.now()}`,
      number: values.number,
      date: values.date.format('YYYY-MM-DD'),
      entity: values.entity,
      company: values.company,
      costCenter: values.costCenter || '',
      reference: values.reference || '',
      source: values.source,
      status: 'POSTED',
      lines: lines.map(({ account, debit: dr, credit: cr }) => ({ account, debit: num(dr), credit: num(cr) })),
    };
    setStore(writeArStore({ ...store, journals: [journal, ...store.journals] }));
    header.setFieldValue('number', `JE-${1002 + store.journals.length}`);
    message.success('Journal posted to the general ledger');
  };

  const columns = useMemo(() => ([
    {
      title: 'Account',
      dataIndex: 'account',
      render: (_, line) => (
        <Select
          style={{ width: '100%' }}
          value={line.account}
          placeholder="Account"
          options={postable.map((account) => ({ value: account.code, label: accountLabel(store.accounts, account.code) }))}
          onChange={(account) => updateLine(line.key, { account })}
        />
      ),
    },
    { title: 'Debit', width: 140, render: (_, line) => <InputNumber min={0} value={line.debit} style={{ width: '100%' }} onChange={(debit) => updateLine(line.key, { debit: debit || 0, credit: debit ? 0 : line.credit })} /> },
    { title: 'Credit', width: 140, render: (_, line) => <InputNumber min={0} value={line.credit} style={{ width: '100%' }} onChange={(credit) => updateLine(line.key, { credit: credit || 0, debit: credit ? 0 : line.debit })} /> },
    { title: '', width: 48, render: (_, line) => <Button type="text" icon={<Trash2 size={14} />} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} /> },
  ]), [postable, store.accounts]);

  return (
    <div>
      <PageHeader
        icon={BookOpen}
        title="Journal Entry"
        subtitle="Every accounting transaction must generate a balanced journal entry."
        actions={<Button type="primary" onClick={post}>Post Journal</Button>}
      />
      <Alert
        type={balanced ? 'success' : 'error'}
        showIcon
        style={{ marginBottom: 16 }}
        message="Rule"
        description={`Total Debit = Total Credit · Debit ${inr(debit)} · Credit ${inr(credit)}`}
      />
      <Card title="Journal Entry Structure" style={{ borderRadius: 16, marginBottom: 16 }}>
        <Form
          form={header}
          layout="vertical"
          initialValues={{ number: 'JE-1001', date: dayjs(), entity: 'LedgerLine', company: 'LedgerLine', source: 'Manual Journals', reference: 'Rent' }}
        >
          <Row gutter={16}>
            <Col xs={24} md={6}><Form.Item name="number" label="Journal Number" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={6}><Form.Item name="date" label="Posting Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={24} md={6}><Form.Item name="entity" label="Entity" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={6}><Form.Item name="company" label="Company" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={6}><Form.Item name="costCenter" label="Cost Center"><Input /></Form.Item></Col>
            <Col xs={24} md={6}><Form.Item name="reference" label="Reference"><Input /></Form.Item></Col>
            <Col xs={24} md={6}><Form.Item name="source" label="Source Module" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Card>
      <Card
        title="Lines"
        style={{ borderRadius: 16, marginBottom: 16 }}
        extra={<Button icon={<Plus size={14} />} onClick={() => setLines((current) => [...current, emptyLine()])}>Add line</Button>}
        styles={{ body: { padding: 0 } }}
      >
        <Table rowKey="key" pagination={false} dataSource={lines} columns={columns} />
      </Card>
      <Card title="Example" style={{ borderRadius: 16 }} styles={{ body: { padding: 0 } }}>
        <Table
          pagination={false}
          rowKey="account"
          dataSource={[
            { account: 'Rent Expense', debit: 50000, credit: 0 },
            { account: 'Bank', debit: 0, credit: 50000 },
          ]}
          columns={[
            { title: 'Account', dataIndex: 'account', onHeaderCell: NAVY_HEAD },
            { title: 'Debit', dataIndex: 'debit', align: 'right', onHeaderCell: NAVY_HEAD, render: (value) => (num(value) ? plain(value) : '') },
            { title: 'Credit', dataIndex: 'credit', align: 'right', onHeaderCell: NAVY_HEAD, render: (value) => (num(value) ? plain(value) : '') },
          ]}
        />
      </Card>
    </div>
  );
};

export default JournalEntry;
