import React, { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Table, Typography, message } from 'antd';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { getStoredUser } from '../../utils/session';
import { JournalEntryBlock } from './JournalEntries';

/**
 * TDS deposit (AP JE reference 3.8): TDS withheld from vendor payments sits in TDS payable (2160)
 * until it is deposited with the government against a challan, posting Dr TDS payable, Cr Bank.
 * Shows what is payable per section and the deposits made. Roles without access see nothing.
 */

const { Text } = Typography;
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const DEPOSIT_ROLES = ['FINANCE', 'ACCOUNTS_PAYABLE', 'DIRECTOR_CFO', 'ADMIN', 'CLIENT_ADMIN', 'SUPER_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'];

// Due by the 7th of the month after deduction; March deductions by 30 April.
const nextDueDate = () => {
  const now = dayjs();
  return now.month() === 2 ? now.month(3).date(30) : now.add(1, 'month').date(7);
};

const TdsDeposit = ({ style }) => {
  const [data, setData] = useState(null); // null = loading or no access
  const [open, setOpen] = useState(null); // section row being deposited
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const watchAmount = Form.useWatch('amount', form);
  const watchSection = Form.useWatch('section', form);
  const watchChallan = Form.useWatch('challan_number', form);
  const canDeposit = DEPOSIT_ROLES.includes(String(getStoredUser()?.role || '').toUpperCase());

  const load = () => api.get('/ap-journals/tds').then((r) => setData(r.data?.data || null)).catch(() => setData(null));
  useEffect(() => { load(); }, []);

  if (!data) return null;

  const openDeposit = (row) => {
    setOpen(row);
    form.setFieldsValue({ section: row.section, amount: row.balance, challan_number: '', deposit_date: dayjs() });
  };

  const save = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const res = await api.post('/ap-journals/tds-deposit', { ...v, deposit_date: v.deposit_date?.format('YYYY-MM-DD') });
      message.success(res.data?.message || 'TDS deposit recorded');
      setOpen(null);
      load();
    } catch (e) {
      message.error(e?.response?.data?.message || 'TDS deposit could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const payable = data.sections.filter((s) => s.balance > 0.009);
  const deposits = (data.deposits || []).map((d) => ({
    ...d,
    section: (String(d.lines?.[0]?.memo || '').match(/TDS u\/s (\S+)/) || [])[1] || '—',
    amount: Number(d.total_debit || 0)
  }));

  return (
    <Card
      style={style}
      styles={{ body: { padding: 0 } }}
      title={<span>TDS deposit <Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>· TDS payable {inr(data.total_balance)}</Text></span>}
      extra={<Text type="secondary" style={{ fontSize: 12 }}>Next due {nextDueDate().format('D MMM YYYY')} (7th of next month; 30 Apr for March)</Text>}
    >
      <Table
        rowKey="section"
        size="small"
        pagination={false}
        dataSource={data.sections}
        locale={{ emptyText: <Empty description="No TDS deducted yet" style={{ margin: '16px 0' }} /> }}
        columns={[
          { title: 'Section', dataIndex: 'section', key: 'section', render: (v) => <Text strong>{v}</Text> },
          { title: 'Deducted from vendors', dataIndex: 'deducted', key: 'ded', align: 'right', render: inr },
          { title: 'Deposited', dataIndex: 'deposited', key: 'dep', align: 'right', render: inr },
          { title: 'Payable to government', dataIndex: 'balance', key: 'bal', align: 'right', render: (v) => <Text strong type={v > 0.009 ? 'warning' : 'secondary'}>{inr(v)}</Text> },
          {
            title: '', key: 'act', width: 150,
            render: (_, r) => (canDeposit && r.balance > 0.009 ? <Button size="small" type="primary" onClick={() => openDeposit(r)}>Record deposit</Button> : null)
          }
        ]}
      />
      {deposits.length > 0 && (
        <div style={{ padding: '12px 16px' }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>Deposits made – journal entries</Text>
          <div style={{ maxWidth: 760 }}>
            {deposits.map((d) => (
              <JournalEntryBlock
                key={d.id}
                je={d}
                extra={<Text type="secondary">· Section {d.section} · Challan {d.source_ref}{d.posted_by_name ? ` · ${[d.posted_by_role, d.posted_by_name].filter(Boolean).join(' | ')}` : ''}</Text>}
              />
            ))}
          </div>
        </div>
      )}

      <Modal
        open={!!open}
        title={`Record TDS deposit – section ${open?.section || ''}`}
        onCancel={() => setOpen(null)}
        onOk={save}
        okText="Record deposit"
        confirmLoading={saving}
        destroyOnClose
      >
        <Text type="secondary">Posts Dr TDS payable (2160) / Cr Bank (1010). Payable under this section: {inr(open?.balance)}.</Text>
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="section" label="Section" rules={[{ required: true }]}>
            <Select options={payable.map((s) => ({ value: s.section, label: `${s.section} – payable ${inr(s.balance)}` }))}
              onChange={(v) => form.setFieldsValue({ amount: payable.find((s) => s.section === v)?.balance })} />
          </Form.Item>
          <Form.Item name="amount" label="Amount deposited" rules={[{ required: true, message: 'Enter the amount' }]}>
            <InputNumber min={0.01} precision={2} prefix="₹" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="challan_number" label="Challan number (CIN)" rules={[{ required: true, message: 'Enter the challan number' }]}>
            <Input placeholder="BSR code + date + serial, as on the ITNS 281 challan" />
          </Form.Item>
          <Form.Item name="deposit_date" label="Deposit date" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
        </Form>
        {Number(watchAmount) > 0 && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 12px 0', background: '#f8fafc' }}>
            <JournalEntryBlock je={{
              je_number: 'Journal entry on save',
              event_type: 'TDS_DEPOSIT',
              lines: [
                { account_code: '2160', account_name: 'TDS payable', debit: Number(watchAmount), credit: 0, memo: `TDS u/s ${watchSection || ''} deposited` },
                { account_code: '1010', account_name: 'Operating bank account', debit: 0, credit: Number(watchAmount), memo: watchChallan ? `Challan ${watchChallan}` : 'Bank payment' }
              ]
            }} />
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default TdsDeposit;
